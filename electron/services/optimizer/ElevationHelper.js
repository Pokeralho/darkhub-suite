import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import Logger from '../LoggerService.js';
import { runCommand, runPowerShell, encodePowerShellScript } from '../PowerShellRunner.js';
import { wrapMarkedScript, parseMarkedOutput, psQuote } from './OptimizerUtils.js';

const execFileAsync = promisify(execFile);

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

/**
 * cscript reads a .vbs without BOM in the ANSI code page, so a path like C:\Users\João came out garbled and the UAC
 * launch never happened (we then waited the whole 180 s). UTF-16 LE with BOM is read as Unicode.
 */
export function encodeVbs(text) {
  return Buffer.from(`\ufeff${text}`, 'utf16le');
}

/**
 * PowerShell run elevated in place of `-File psFile`: reads the file once, refuses it unless its SHA-256 is
 * `sha256Hex` (writing the refusal to the result files so the caller does not wait for a timeout), then runs the
 * bytes it checked from memory.
 */
export function buildVerifiedBootstrap(psFile, sha256Hex, { startedFile, errFile, exitFile, flagFile }) {
  return [
    `$__dhF = ${psQuote(psFile)}`,
    'try { $__dhB = [IO.File]::ReadAllBytes($__dhF) } catch { $__dhB = $null }',
    "$__dhH = ''",
    "if ($__dhB) { $__dhH = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($__dhB)).Replace('-', '').ToLowerInvariant() }",
    `if ($__dhH -ne ${psQuote(String(sha256Hex).toLowerCase())}) {`,
    `  '1' | Out-File -LiteralPath ${psQuote(startedFile)} -Encoding ascii`,
    `  'O script elevado foi alterado antes de rodar; execucao recusada.' | Out-File -LiteralPath ${psQuote(errFile)} -Encoding utf8`,
    `  '1' | Out-File -LiteralPath ${psQuote(exitFile)} -Encoding utf8`,
    `  'DONE' | Out-File -LiteralPath ${psQuote(flagFile)} -Encoding utf8`,
    '  exit 1',
    '}',
    '$__dhT = [Text.Encoding]::UTF8.GetString($__dhB)',
    'if ($__dhT.Length -gt 0 -and $__dhT[0] -eq [char]0xFEFF) { $__dhT = $__dhT.Substring(1) }',
    '& ([ScriptBlock]::Create($__dhT))'
  ].join('\n');
}

/** PowerShell that runs `cmd` with cmd.exe (arguments passed verbatim) and reports its output and exit code. */
export function buildCmdRunnerScript(cmd) {
  return [
    '$__dhPsi = New-Object System.Diagnostics.ProcessStartInfo',
    "$__dhPsi.FileName = Join-Path $env:SystemRoot 'System32\\cmd.exe'",
    `$__dhPsi.Arguments = '/d /s /c "' + ${psQuote(cmd)} + '"'`,
    '$__dhPsi.UseShellExecute = $false',
    '$__dhPsi.RedirectStandardOutput = $true',
    '$__dhPsi.RedirectStandardError = $true',
    '$__dhPsi.CreateNoWindow = $true',
    '$__dhP = [System.Diagnostics.Process]::Start($__dhPsi)',
    '$__dhErr = $__dhP.StandardError.ReadToEndAsync()',
    '$__dhOut = $__dhP.StandardOutput.ReadToEnd()',
    '$__dhP.WaitForExit()',
    'if ($__dhOut) { Write-Output $__dhOut.TrimEnd() }',
    '$__dhE = $__dhErr.Result',
    'if ($__dhE) { Write-Output $__dhE.TrimEnd() }',
    '$global:LASTEXITCODE = $__dhP.ExitCode'
  ].join('\n');
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
      // %LOCALAPPDATA% is writable by every unelevated program of this user, and the UAC prompt can stay open for minutes:
      // the elevated side gets only a bootstrap on its command line, which reads the script once, checks its SHA-256
      // and runs it from memory, so a swapped file is refused instead of run as administrator.
      const scriptBytes = Buffer.from(`\ufeff${fullScript}`, 'utf8');
      fs.writeFileSync(psFile, scriptBytes, { flag: 'wx' });
      const scriptSha = crypto.createHash('sha256').update(scriptBytes).digest('hex');
      const bootstrap = buildVerifiedBootstrap(psFile, scriptSha, { startedFile, errFile, exitFile, flagFile });

      const vbsContent = [
        'Set UAC = CreateObject("Shell.Application")',
        `UAC.ShellExecute "powershell.exe", "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -EncodedCommand ${encodePowerShellScript(bootstrap)}", "", "runas", 0`,
        ''
      ].join('\r\n');
      fs.writeFileSync(vbsFile, encodeVbs(vbsContent));

      await execFileAsync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cscript.exe'), ['//nologo', vbsFile], { windowsHide: true });

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

    // No .bat file: cmd.exe re-reads a batch file while it runs, so a copy in a user-writable folder could be changed
    // under the elevated process. The command travels inside the (hash-checked) elevated PowerShell script instead.
    const result = await this.runElevatedPowerShell(buildCmdRunnerScript(cmd), { timeoutMs });
    Logger.auditOptimizer({ type: 'elevated-cmd', ...this._auditScript(cmd), ...result, ok: result.code === 0 });
    return result;
  }
}

export default new ElevationHelper();
