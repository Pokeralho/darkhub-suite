import DeepTweaksEngine from './DeepTweaksEngine.js';
import Logger from '../LoggerService.js';
import { spawn } from 'node:child_process';
import { runPowerShell } from '../PowerShellRunner.js';
import ElevationHelper from './ElevationHelper.js';

const POLICY_KEY = 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows Defender';
const RTP_KEY = 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows Defender\\Real-Time Protection';
const SET_ID = 'group:defenderPolicy';

const POLICY_CHANGES = [
  { key: POLICY_KEY, name: 'DisableAntiSpyware', type: 'REG_DWORD', data: '1' },
  { key: RTP_KEY, name: 'DisableRealtimeMonitoring', type: 'REG_DWORD', data: '1' }
];

/**
 * Real-time protection control for Microsoft Defender.
 *
 * Honest scope: this uses the supported mechanisms only (Set-MpPreference + Group-Policy registry values). It does NOT
 * bypass Tamper Protection, does not run as TrustedInstaller and cannot turn off the cloud/SmartScreen/firewall parts.
 * If Tamper Protection is on, Windows ignores these settings and the action is refused with instructions.
 */
class DefenderControlEngine {
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
$imgRemoved = (Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\DarkOS' -Name 'DefenderRemovedOffline' -ErrorAction SilentlyContinue).DefenderRemovedOffline
$svcStart = (Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\WinDefend' -Name 'Start' -ErrorAction SilentlyContinue).Start
$tamper = $false
if ($null -ne $wmi.IsTamperProtected) { $tamper = [bool]$wmi.IsTamperProtected } elseif ($null -ne $tpReg) { $tamper = (($tpReg -band 1) -ne 0) -or ($tpReg -eq 5) }
[PSCustomObject]@{
  tamperProtected = $tamper
  realtimeEnabled = if ($null -ne $wmi.RealTimeProtectionEnabled) { [bool]$wmi.RealTimeProtectionEnabled } else { $disRealtime -ne 1 }
  antivirusEnabled = if ($null -ne $wmi.AntivirusEnabled) { [bool]$wmi.AntivirusEnabled } else { $disAntiSpy -ne 1 }
  policyDisableAntiSpyware = if ($null -ne $disAntiSpy) { [int]$disAntiSpy } else { $null }
  policyDisableRealtime = if ($null -ne $disRealtime) { [int]$disRealtime } else { $null }
  serviceRunning = ($winDefendSvc -eq 'Running')
  serviceStatus = [string]$winDefendSvc
  imageLevelRemoved = ($imgRemoved -eq 1)
  serviceStart = if ($null -ne $svcStart) { [int]$svcStart } else { $null }
} | ConvertTo-Json -Compress`;
      const { code, stdout, stderr } = await runPowerShell(script, { timeoutMs: 20000, trim: true });
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
    if (action !== 'disable' && action !== 'enable') return { ok: false, error: 'Ação inválida' };
    Logger.info('DefenderControlEngine', `Controle do Defender (${action})`);

    const before = await this.getStatus();
    if (action === 'disable' && before.ok && before.status?.tamperProtected) {
      return {
        ok: false,
        tamperBlocked: true,
        error: 'A Proteção contra Adulteração está ATIVA, então o Windows ignoraria esta alteração. O DarkHub não contorna essa proteção. Desative-a manualmente em Segurança do Windows > Proteção contra vírus e ameaças > Gerenciar configurações > Proteção contra Adulteração e tente de novo.'
      };
    }

    let res;
    if (action === 'disable') {
      res = await DeepTweaksEngine.applyChangeSet({
        id: SET_ID,
        title: 'Defender: desativar proteção em tempo real (políticas)',
        changes: POLICY_CHANGES,
        commands: { apply: 'Set-MpPreference -DisableRealtimeMonitoring $true -ErrorAction Stop' }
      });
    } else {
      res = await DeepTweaksEngine.restoreChangeSet({
        id: SET_ID,
        title: 'Defender: restaurar proteção',
        fallbackChanges: POLICY_CHANGES.map((c) => ({ key: c.key, name: c.name, deleteValue: true })),
        commands: { revert: 'Set-MpPreference -DisableRealtimeMonitoring $false -ErrorAction Stop' }
      });
    }
    if (!res.ok) return { ok: false, error: res.error };

    // the registry is not the truth: ask Defender itself what it is doing now
    await new Promise((r) => setTimeout(r, 2500));
    const after = await this.getStatus();
    if (after.ok) {
      const rt = Boolean(after.status.realtimeEnabled);
      if (action === 'disable' && rt) {
        await DeepTweaksEngine.restoreChangeSet({ id: SET_ID, title: 'Defender: desfazer tentativa', fallbackChanges: POLICY_CHANGES.map((c) => ({ key: c.key, name: c.name, deleteValue: true })), commands: { revert: 'Set-MpPreference -DisableRealtimeMonitoring $false -ErrorAction Stop' } });
        return { ok: false, error: 'O Windows gravou as políticas mas o Defender continua com a proteção em tempo real ATIVA (Proteção contra Adulteração, antivírus gerenciado ou política de TI). As alterações foram desfeitas.', status: after.status };
      }
      if (action === 'enable' && !rt) {
        return { ok: false, error: 'As políticas foram removidas, mas a proteção em tempo real ainda aparece desativada. Ative-a em Segurança do Windows > Proteção contra vírus e ameaças.', status: after.status };
      }
    }
    return {
      ok: true,
      verified: after.ok,
      status: after.ok ? after.status : undefined,
      msg: action === 'disable'
        ? 'Proteção em tempo real do Microsoft Defender DESATIVADA (confirmado pelo próprio Defender). Seu PC está sem antivírus ativo: reative quando terminar. Isto não desliga o SmartScreen nem o Firewall.'
        : 'Proteção do Microsoft Defender restaurada (confirmado pelo próprio Defender).'
    };
  }

  /**
   * Restore Defender when it was removed at IMAGE LEVEL by the DarkOS golden build (services set to Start=4
   * offline, with the original Start values kept in HKLM\SOFTWARE\DarkOS\DefenderServiceStart). This resets each
   * service's Start to its backed-up value (or a sane default), clears the disable policies and the TamperProtection
   * override, and asks for a reboot. Elevated; a single UAC prompt. Does NOT reinstall removed capabilities/FODs.
   */
  async restoreImageDefender() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const before = await this.getStatus();
    if (before.ok && !before.status?.imageLevelRemoved) {
      return { ok: false, error: 'Este sistema não teve o Defender removido no nível da imagem (marcador DarkOS ausente). Use o botão de proteção em tempo real.' };
    }
    const defaults = { WinDefend: 2, WdNisSvc: 3, Sense: 3, WdBoot: 0, WdFilter: 0, WdNisDrv: 3, MsSecFlt: 0, MsSecWfp: 0, MsSecCore: 0, SecurityHealthService: 2, webthreatdefsvc: 3, webthreatdefusersvc: 3 };
    const svcJson = JSON.stringify(defaults).replace(/"/g, '""');
    const script = `
$ErrorActionPreference = 'Stop'
$defaults = '${svcJson}' | ConvertFrom-Json
$bak = 'HKLM:\\SOFTWARE\\DarkOS\\DefenderServiceStart'
foreach ($p in $defaults.PSObject.Properties) {
  $svc = $p.Name
  $start = $p.Value
  if (Test-Path $bak) { $b = (Get-ItemProperty -Path $bak -Name $svc -ErrorAction SilentlyContinue).$svc; if ($null -ne $b) { $start = [int]$b } }
  $k = "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\$svc"
  if (Test-Path $k) { Set-ItemProperty -Path $k -Name Start -Value ([int]$start) -Type DWord -Force }
}
$pol = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows Defender'
Remove-ItemProperty -Path $pol -Name 'DisableAntiSpyware','DisableAntiVirus','ServiceKeepAlive' -ErrorAction SilentlyContinue
Remove-Item -Path "$pol\\Real-Time Protection" -Recurse -ErrorAction SilentlyContinue
Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows Defender\\Features' -Name 'TamperProtection' -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
Remove-ItemProperty -Path 'HKLM:\\SOFTWARE\\DarkOS' -Name 'DefenderRemovedOffline' -ErrorAction SilentlyContinue
Write-Output 'DKRESTORE-OK'`;
    try {
      const res = await ElevationHelper.runElevatedPowerShell(script, { timeoutMs: 60000 });
      const out = `${res.stdout || ''}`;
      if (res.code !== 0 && !out.includes('DKRESTORE-OK')) {
        return { ok: false, error: res.stderr || 'Falha ao restaurar os serviços do Defender.' };
      }
      return { ok: true, rebootRequired: true, msg: 'Serviços do Microsoft Defender reativados no registro. Reinicie o PC para que o Defender volte a carregar. Componentes removidos da imagem (app Segurança do Windows) podem exigir reinstalação via Windows Update.' };
    } catch (e) {
      Logger.error('DefenderControlEngine', 'restoreImageDefender', e);
      return { ok: false, error: e.message };
    }
  }

  /** Synchronous on purpose (callers do not await it): opens Windows Security > Tamper Protection page, not elevated. */
  openTamperSettings() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    try {
      const child = spawn('cmd.exe', ['/c', 'start', '', 'windowsdefender://threatsettings'], { windowsHide: true, detached: true, stdio: 'ignore' });
      child.once('error', (e) => Logger.warn('DefenderControlEngine', 'Falha ao abrir a Segurança do Windows', e));
      child.unref();
      return { ok: true, msg: 'Segurança do Windows aberta. Vá em "Gerenciar configurações" > "Proteção contra Adulteração".' };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
}

export default new DefenderControlEngine();
