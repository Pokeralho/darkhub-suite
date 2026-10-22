import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import Logger from '../LoggerService.js';
import { runCommand, runPowerShell } from '../PowerShellRunner.js';
import { wrapMarkedScript, parseMarkedOutput, psQuote } from './OptimizerUtils.js';

const execAsync = promisify(exec);

/** How long we wait for the elevated process to START (i.e. for the user to answer the UAC prompt). */
const UAC_START_TIMEOUT_MS = 180000;

/**
 * Polls for `flagFile`. ShellExecute("runas") never reports a cancelled UAC prompt, so the elevated script touches
 * `startedFile` first: if it never appears we give up after the UAC window instead of waiting for the whole
 * (up to 15 min) script timeout. Returns 'done' | 'not-started' | 'timeout'.
 */
export async function waitForElevated(flagFile, startedFile, timeoutMs) {
  const t0 = Date.now();
  const startLimit = Math.min(timeoutMs, UAC_START_TIMEOUT_MS);
  for (;;) {
    if (fs.existsSync(flagFile)) return 'done';
    const elapsed = Date.now() - t0;
    if (!fs.existsSync(startedFile) && elapsed >= startLimit) return 'not-started';
    if (elapsed >= timeoutMs) return 'timeout';
    await new Promise((r) => setTimeout(r, 500));
  }
}

/**
 * Windows PowerShell 5.1 writes `>>` redirections as UTF-16LE (with BOM). Reading those files as UTF-8 yields
 * NUL-interleaved text, which silently broke every parser that looked at the elevated script output.
 */
export function decodeShellOutput(buf) {
  if (!buf || buf.length === 0) return '';
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.slice(2).toString('utf16le');
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.slice(2));
    swapped.swap16();
    return swapped.toString('utf16le');
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.slice(3).toString('utf8');
  return buf.toString('utf8').replace(/\0/g, '');
}

class ElevationHelper {
  constructor() {
    this._elevated = null;
  }

  async isElevated() {
    if (process.platform !== 'win32') return false;
    if (this._elevated !== null) return this._elevated;
    try {
      const r = await runCommand('fltmc.exe', [], { timeoutMs: 5000 });
      this._elevated = r.code === 0;
    } catch {
      this._elevated = false;
    }
    return this._elevated;
  }

  _auditScript(script) {
    const text = String(script || '');
    return { scriptSha256: crypto.createHash('sha256').update(text).digest('hex'), scriptLength: text.length };
  }

  _privateDir() {
    const base = process.env.LOCALAPPDATA || os.tmpdir();
    const dir = path.join(base, 'DarkHub', 'elevate');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    return dir;
  }

  /**
   * Runs a script elevated and decides success by explicit markers (DHDONE / DHFAIL|msg) instead of the exit code.
   * Returns { ok, out, error }. Scripts must be ASCII only; DhCheck 'label' can be used after native commands.
   */
  async runMarked(script, timeoutMs = 120000) {
    try {
      const res = await this.runElevatedPowerShell(wrapMarkedScript(script), { timeoutMs });
      return parseMarkedOutput(res);
    } catch (e) {
      return { ok: false, out: '', error: e?.message ?? String(e) };
    }
  }

  async runElevatedPowerShell(script, options = {}) {
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 120000;

    if (await this.isElevated()) {
      const direct = await runPowerShell(String(script), { timeoutMs, trim: true });
      const result = { code: direct.code ?? 1, stdout: direct.stdout || '', stderr: direct.stderr || '' };
      Logger.auditOptimizer({ type: 'elevated-powershell', mode: 'direct', ...this._auditScript(script), ...result, ok: result.code === 0 });
      return result;
    }

    const tmpId = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const tmpDir = this._privateDir();
    const psFile = path.join(tmpDir, `dh_elevate_${tmpId}.ps1`);
    const vbsFile = path.join(tmpDir, `dh_elevate_${tmpId}.vbs`);
    const flagFile = path.join(tmpDir, `dh_elevate_${tmpId}.done`);
    const outFile = path.join(tmpDir, `dh_elevate_${tmpId}.out`);
    const errFile = path.join(tmpDir, `dh_elevate_${tmpId}.err`);
    const exitFile = path.join(tmpDir, `dh_elevate_${tmpId}.exit`);
    const startedFile = path.join(tmpDir, `dh_elevate_${tmpId}.started`);

    try {
      // paths go in as single-quoted literals: a profile folder containing $ or ` broke the old "..." interpolation
      const fullScript = `
        '1' | Out-File -LiteralPath ${psQuote(startedFile)} -Encoding ascii
        $ErrorActionPreference = 'Continue'
        $ProgressPreference = 'SilentlyContinue'
        $__dhExitCode = 0
        try {
          & {
${script}
          } 1>> ${psQuote(outFile)} 2>> ${psQuote(errFile)}
          if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { $__dhExitCode = $LASTEXITCODE }
        } catch {
          $_.Exception.Message | Out-File -LiteralPath ${psQuote(errFile)} -Append -Encoding utf8
          $__dhExitCode = 1
        }
        "$__dhExitCode" | Out-File -LiteralPath ${psQuote(exitFile)} -Encoding utf8
        "DONE" | Out-File -LiteralPath ${psQuote(flagFile)} -Encoding utf8
      `;
      // BOM so Windows PowerShell 5.1 reads the file as UTF-8 (accents in messages/paths survive)
      fs.writeFileSync(psFile, `\ufeff${fullScript}`, 'utf8');

      const vbsContent = `
        Set UAC = CreateObject("Shell.Application")
        UAC.ShellExecute "powershell.exe", "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""${psFile}""", "", "runas", 0
      `;
      fs.writeFileSync(vbsFile, vbsContent, 'utf8');

      await execAsync(`cscript //nologo "${vbsFile}"`);

      const state = await waitForElevated(flagFile, startedFile, timeoutMs);

      const readSafe = (file) => {
        try { return decodeShellOutput(fs.readFileSync(file)); } catch { return ''; }
      };

      if (state !== 'done') {
        const result = {
          code: 1,
          stdout: readSafe(outFile).trim(),
          stderr: state === 'not-started'
            ? 'Elevação cancelada: o pedido de administrador (UAC) foi recusado ou não foi respondido.'
            : 'Timeout aguardando elevação (UAC pode ter sido cancelado ou o script não terminou a tempo).'
        };
        Logger.auditOptimizer({ type: 'elevated-powershell', ...this._auditScript(script), ...result, ok: false });
        return result;
      }

      const exitCodeRaw = readSafe(exitFile).trim();
      const code = Number.parseInt(exitCodeRaw, 10);

      const result = {
        code: Number.isFinite(code) ? code : 1,
        stdout: readSafe(outFile).trim(),
        stderr: readSafe(errFile).trim()
      };
      Logger.auditOptimizer({ type: 'elevated-powershell', ...this._auditScript(script), ...result, ok: result.code === 0 });
      return result;
    } catch (e) {
      const result = { code: e.code || 1, stdout: '', stderr: e.message };
      Logger.auditOptimizer({ type: 'elevated-powershell', ...this._auditScript(script), ...result, ok: false });
      return result;
    } finally {
      for (const f of [psFile, vbsFile, flagFile, outFile, errFile, exitFile, startedFile]) {
        if (fs.existsSync(f)) { try { fs.unlinkSync(f); } catch (err) {} }
      }
    }
  }

  async runElevatedCmd(cmd, options = {}) {
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 60000;

    if (await this.isElevated()) {
      const direct = await runCommand('cmd.exe', ['/d', '/s', '/c', String(cmd)], { timeoutMs, trim: true });
      const result = { code: direct.code ?? 1, stdout: direct.stdout || '', stderr: direct.stderr || '' };
      Logger.auditOptimizer({ type: 'elevated-cmd', mode: 'direct', ...this._auditScript(cmd), ...result, ok: result.code === 0 });
      return result;
    }

    const tmpId = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const tmpDir = this._privateDir();
    const batFile = path.join(tmpDir, `dh_elevate_${tmpId}.bat`);
    const vbsFile = path.join(tmpDir, `dh_elevate_${tmpId}.vbs`);
    const flagFile = path.join(tmpDir, `dh_elevate_${tmpId}.done`);
    const outFile = path.join(tmpDir, `dh_elevate_${tmpId}.out`);
    const exitFile = path.join(tmpDir, `dh_elevate_${tmpId}.exit`);
    const startedFile = path.join(tmpDir, `dh_elevate_${tmpId}.started`);

    try {
      const batContent = [
        '@echo off',
        `echo started> "${startedFile}"`,
        `(${cmd}) 1>> "${outFile}" 2>>&1`,
        `echo %ERRORLEVEL% > "${exitFile}"`,
        `echo DONE > "${flagFile}"`
      ].join('\r\n');
      fs.writeFileSync(batFile, batContent, 'utf8');

      const vbsContent = `
        Set UAC = CreateObject("Shell.Application")
        UAC.ShellExecute "cmd.exe", "/c ""${batFile}""", "", "runas", 0
      `;
      fs.writeFileSync(vbsFile, vbsContent, 'utf8');
      await execAsync(`cscript //nologo "${vbsFile}"`);

      const state = await waitForElevated(flagFile, startedFile, timeoutMs);

      const readSafe = (file) => {
        try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
      };

      if (state !== 'done') {
        const result = {
          code: 1,
          stdout: readSafe(outFile).trim(),
          stderr: state === 'not-started'
            ? 'Elevação cancelada: o pedido de administrador (UAC) foi recusado ou não foi respondido.'
            : 'Timeout aguardando elevação (UAC pode ter sido cancelado ou o comando não terminou a tempo).'
        };
        Logger.auditOptimizer({ type: 'elevated-cmd', ...this._auditScript(cmd), ...result, ok: false });
        return result;
      }

      const code = Number.parseInt(readSafe(exitFile).trim(), 10);
      const result = {
        code: Number.isFinite(code) ? code : 1,
        stdout: readSafe(outFile).trim(),
        stderr: ''
      };
      Logger.auditOptimizer({ type: 'elevated-cmd', ...this._auditScript(cmd), ...result, ok: result.code === 0 });
      return result;
    } catch (e) {
      const result = { code: 1, stdout: '', stderr: e.message };
      Logger.auditOptimizer({ type: 'elevated-cmd', ...this._auditScript(cmd), ...result, ok: false });
      return result;
    } finally {
      for (const f of [batFile, vbsFile, flagFile, outFile, exitFile, startedFile]) {
        if (fs.existsSync(f)) { try { fs.unlinkSync(f); } catch (err) {} }
      }
    }
  }
}

export default new ElevationHelper();
