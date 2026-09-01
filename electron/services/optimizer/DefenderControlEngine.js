import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import ElevationHelper from './ElevationHelper.js';
import Logger from '../LoggerService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DefenderControlEngine {
  _getExePath() {
    const workspaceCompiled = 'C:\\\\Workspace\\\\src\\\\x64\\\\Release\\\\defender-control.exe';
    try {
      if (fs.existsSync(workspaceCompiled)) return workspaceCompiled;
    } catch {}
    return null;
  }

  async getStatus() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    try {
      const script = `
        $ErrorActionPreference = 'SilentlyContinue'
        $wmi = Get-CimInstance -Namespace 'Root\\Microsoft\\Windows\\Defender' -ClassName 'MSFT_MpComputerStatus' -ErrorAction SilentlyContinue
        $tpReg = (Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows Defender\\Features' -Name 'TamperProtection' -ErrorAction SilentlyContinue).TamperProtection
        $disAntiSpy = (Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows Defender' -Name 'DisableAntiSpyware' -ErrorAction SilentlyContinue).DisableAntiSpyware
        $disRealtime = (Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows Defender\\Real-Time Protection' -Name 'DisableRealtimeMonitoring' -ErrorAction SilentlyContinue).DisableRealtimeMonitoring
        $winDefendSvc = (Get-Service -Name 'WinDefend' -ErrorAction SilentlyContinue).Status

        [PSCustomObject]@{
          tamperProtected = if ($null -ne $wmi.IsTamperProtected) { [bool]$wmi.IsTamperProtected } else { ($tpReg -band 1) -ne 0 }
          realtimeEnabled = if ($null -ne $wmi.RealTimeProtectionEnabled) { [bool]$wmi.RealTimeProtectionEnabled } else { $disRealtime -ne 1 }
          antivirusEnabled = if ($null -ne $wmi.AntivirusEnabled) { [bool]$wmi.AntivirusEnabled } else { $disAntiSpy -ne 1 }
          serviceRunning = ($winDefendSvc -eq 'Running')
          serviceStatus = [string]$winDefendSvc
        } | ConvertTo-Json -Compress
      `;
      const { code, stdout, stderr } = await ElevationHelper.runElevatedPowerShell(script);
      if (code === 0 && stdout) {
        const parsed = JSON.parse(stdout.trim());
        return { ok: true, status: parsed };
      }
      return { ok: false, error: stderr || 'Falha ao consultar status do Defender' };
    } catch (e) {
      Logger.error('DefenderControlEngine', 'Erro ao obter status:', e);
      return { ok: false, error: e.message };
    }
  }

  async runNativeDefenderControl(action = 'disable') {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const exePath = this._getExePath();
    Logger.info('DefenderControlEngine', `Executando Defender Control nativo: ${exePath} (${action})`);

    if (fs.existsSync(exePath)) {
      const { code, stdout, stderr } = await ElevationHelper.runElevatedCmd(`"${exePath}" -s`, { timeoutMs: 30000 });
      return {
        ok: code === 0,
        msg: code === 0 ? `Ação ${action} executada com sucesso via TrustedInstaller Engine.` : (stderr || stdout || 'Falha na execução.'),
        output: stdout
      };
    }

    const script = action === 'disable' ? `
      $ErrorActionPreference = 'SilentlyContinue'
      Set-MpPreference -DisableRealtimeMonitoring $true -ErrorAction SilentlyContinue
      reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows Defender" /v DisableAntiSpyware /t REG_DWORD /d 1 /f
      reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows Defender\\Real-Time Protection" /v DisableRealtimeMonitoring /t REG_DWORD /d 1 /f
    ` : `
      $ErrorActionPreference = 'SilentlyContinue'
      Set-MpPreference -DisableRealtimeMonitoring $false -ErrorAction SilentlyContinue
      reg delete "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows Defender" /v DisableAntiSpyware /f
      reg delete "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows Defender\\Real-Time Protection" /v DisableRealtimeMonitoring /f
    `;
    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script);
    return {
      ok: code === 0,
      msg: code === 0 ? `Windows Defender ${action === 'disable' ? 'desativado' : 'restaurado'} com sucesso.` : stderr
    };
  }

  openTamperSettings() {
    try {
      ElevationHelper.runElevatedCmd('start windowsdefender://threatsettings');
      return { ok: true, msg: 'Painel de Proteção contra Adulteração aberto.' };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
}

export default new DefenderControlEngine();
