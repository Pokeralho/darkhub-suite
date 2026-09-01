import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Logger from '../LoggerService.js';

const execAsync = promisify(exec);

class ElevationHelper {

  async runElevatedPowerShell(script, options = {}) {
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 120000;
    const maxAttempts = Math.max(1, Math.ceil(timeoutMs / 500));

    const tmpId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const psFile = path.join(os.tmpdir(), `dh_elevate_${tmpId}.ps1`);
    const vbsFile = path.join(os.tmpdir(), `dh_elevate_${tmpId}.vbs`);
    const flagFile = path.join(os.tmpdir(), `dh_elevate_${tmpId}.done`);
    const outFile = path.join(os.tmpdir(), `dh_elevate_${tmpId}.out`);
    const errFile = path.join(os.tmpdir(), `dh_elevate_${tmpId}.err`);
    const exitFile = path.join(os.tmpdir(), `dh_elevate_${tmpId}.exit`);

    try {

      const fullScript = `
        $ErrorActionPreference = 'Continue'
        $ProgressPreference = 'SilentlyContinue'
        $__dhExitCode = 0
        try {
          & {
${script}
          } 1>> "${outFile}" 2>> "${errFile}"
          if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { $__dhExitCode = $LASTEXITCODE }
        } catch {
          $_.Exception.Message | Out-File -FilePath "${errFile}" -Append -Encoding utf8
          $__dhExitCode = 1
        }
        "$__dhExitCode" | Out-File -FilePath "${exitFile}" -Encoding utf8
        "DONE" | Out-File -FilePath "${flagFile}" -Encoding utf8
      `;
      fs.writeFileSync(psFile, fullScript, 'utf8');

      const vbsContent = `
        Set UAC = CreateObject("Shell.Application")
        UAC.ShellExecute "powershell.exe", "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""${psFile}""", "", "runas", 0
      `;
      fs.writeFileSync(vbsFile, vbsContent, 'utf8');

      await execAsync(`cscript //nologo "${vbsFile}"`);

      let attempts = 0;
      while (!fs.existsSync(flagFile) && attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 500));
        attempts++;
      }

      const readSafe = (file) => {
        try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
      };

      if (!fs.existsSync(flagFile)) {

        const result = {
          code: 1,
          stdout: readSafe(outFile).trim(),
          stderr: 'Timeout aguardando elevação (UAC pode ter sido cancelado ou o script não terminou a tempo).'
        };
        Logger.auditOptimizer({ type: 'elevated-powershell', script, ...result, ok: false });
        return result;
      }

      const exitCodeRaw = readSafe(exitFile).trim();
      const code = Number.parseInt(exitCodeRaw, 10);

      const result = {
        code: Number.isFinite(code) ? code : 1,
        stdout: readSafe(outFile).trim(),
        stderr: readSafe(errFile).trim()
      };
      Logger.auditOptimizer({ type: 'elevated-powershell', script, ...result, ok: result.code === 0 });
      return result;
    } catch (e) {
      const result = { code: e.code || 1, stdout: '', stderr: e.message };
      Logger.auditOptimizer({ type: 'elevated-powershell', script, ...result, ok: false });
      return result;
    } finally {
      for (const f of [psFile, vbsFile, flagFile, outFile, errFile, exitFile]) {
        if (fs.existsSync(f)) { try { fs.unlinkSync(f); } catch (err) {} }
      }
    }
  }

  async runElevatedCmd(cmd, options = {}) {
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 60000;
    const maxAttempts = Math.max(1, Math.ceil(timeoutMs / 500));

    const tmpId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const batFile = path.join(os.tmpdir(), `dh_elevate_${tmpId}.bat`);
    const vbsFile = path.join(os.tmpdir(), `dh_elevate_${tmpId}.vbs`);
    const flagFile = path.join(os.tmpdir(), `dh_elevate_${tmpId}.done`);
    const outFile = path.join(os.tmpdir(), `dh_elevate_${tmpId}.out`);
    const exitFile = path.join(os.tmpdir(), `dh_elevate_${tmpId}.exit`);

    try {
      const batContent = [
        '@echo off',
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

      let attempts = 0;
      while (!fs.existsSync(flagFile) && attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 500));
        attempts++;
      }

      const readSafe = (file) => {
        try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
      };

      if (!fs.existsSync(flagFile)) {
        const result = {
          code: 1,
          stdout: readSafe(outFile).trim(),
          stderr: 'Timeout aguardando elevação (UAC pode ter sido cancelado ou o comando não terminou a tempo).'
        };
        Logger.auditOptimizer({ type: 'elevated-cmd', command: cmd, ...result, ok: false });
        return result;
      }

      const code = Number.parseInt(readSafe(exitFile).trim(), 10);
      const result = {
        code: Number.isFinite(code) ? code : 1,
        stdout: readSafe(outFile).trim(),
        stderr: ''
      };
      Logger.auditOptimizer({ type: 'elevated-cmd', command: cmd, ...result, ok: result.code === 0 });
      return result;
    } catch (e) {
      const result = { code: 1, stdout: '', stderr: e.message };
      Logger.auditOptimizer({ type: 'elevated-cmd', command: cmd, ...result, ok: false });
      return result;
    } finally {
      for (const f of [batFile, vbsFile, flagFile, outFile, exitFile]) {
        if (fs.existsSync(f)) { try { fs.unlinkSync(f); } catch (err) {} }
      }
    }
  }
}

export default new ElevationHelper();
