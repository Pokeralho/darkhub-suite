// Windows features, repairs and classic panels (WinUtil "Features / Fixes / Legacy panels" parity).
// Every action is whitelisted here; the renderer only sends ids. Results are read back from the system.
import { spawn } from 'node:child_process';
import ElevationHelper from './ElevationHelper.js';
import { psQuote } from './OptimizerUtils.js';

const NOT_WINDOWS = { ok: false, error: 'Only Windows supported' };

/** Optional features. `names`: Windows optional features (missing ones are skipped); `capability`: Get-WindowsCapability prefix. */
export const WINDOWS_FEATURES = Object.freeze([
  { id: 'wsl', names: ['Microsoft-Windows-Subsystem-Linux'] },
  { id: 'vmplatform', names: ['VirtualMachinePlatform'] },
  { id: 'hyperv', names: ['Microsoft-Hyper-V-All'] },
  { id: 'sandbox', names: ['Containers-DisposableClientVM'] },
  { id: 'netfx3', names: ['NetFx3'] },
  { id: 'legacymedia', names: ['LegacyComponents', 'DirectPlay', 'MediaPlayback', 'WindowsMediaPlayer'] },
  { id: 'nfs', names: ['ServicesForNFS-ClientOnly', 'ClientForNFS-Infrastructure', 'NFS-Administration'] },
  { id: 'openssh', capability: 'OpenSSH.Server' }
]);

/** Classic Control Panel / MMC screens. Value: [executable, args]. */
export const PANELS = Object.freeze({
  control: ['control.exe', []],
  programs: ['control.exe', ['appwiz.cpl']],
  computer: ['mmc.exe', ['compmgmt.msc']],
  devices: ['mmc.exe', ['devmgmt.msc']],
  disks: ['mmc.exe', ['diskmgmt.msc']],
  services: ['mmc.exe', ['services.msc']],
  events: ['mmc.exe', ['eventvwr.msc']],
  network: ['control.exe', ['ncpa.cpl']],
  power: ['control.exe', ['powercfg.cpl']],
  printers: ['control.exe', ['printers']],
  sound: ['control.exe', ['mmsys.cpl']],
  mouse: ['control.exe', ['main.cpl']],
  system: ['SystemPropertiesAdvanced.exe', []],
  datetime: ['control.exe', ['timedate.cpl']],
  region: ['control.exe', ['intl.cpl']],
  firewall: ['control.exe', ['firewall.cpl']],
  security: ['control.exe', ['wscui.cpl']],
  restore: ['rstrui.exe', []],
  msconfig: ['msconfig.exe', []]
});

const ACTIONS = new Set(['resetWindowsUpdate', 'repairWinget', 'cleanupComponentStore', 'removeEdge', 'installEdge', 'decryptSystemDrive', 'autologon']);

function featureById(id) {
  return WINDOWS_FEATURES.find((f) => f.id === id) || null;
}

/** Collapses the states of a feature's parts: any enabled part counts, pending wins over settled. */
export function summarizeFeatureState(states) {
  const s = states.filter((x) => x && x !== 'Missing');
  if (!s.length) return 'unavailable';
  if (s.some((x) => /Pending/i.test(x))) return 'pending';
  if (s.some((x) => /^(Enabled|Installed)$/i.test(x))) return 'enabled';
  return 'disabled';
}

/** `DHFEAT|<id>|<state>` lines -> { id: state }. */
export function parseFeatureLines(out) {
  const raw = {};
  for (const line of String(out || '').split(/\r?\n/)) {
    const m = /^DHFEAT\|([a-z0-9]+)\|(\w*)$/.exec(line.trim());
    if (m) (raw[m[1]] ||= []).push(m[2] || 'Missing');
  }
  const res = {};
  for (const f of WINDOWS_FEATURES) res[f.id] = summarizeFeatureState(raw[f.id] || []);
  return res;
}

function featureReadScript(features) {
  return features.map((f) => {
    if (f.capability) {
      return `$c = @(Get-WindowsCapability -Online -ErrorAction SilentlyContinue | Where-Object { $_.Name -like ${psQuote(`${f.capability}~*`)} })
if ($c.Count) { foreach ($x in $c) { Write-Output ('DHFEAT|${f.id}|' + $x.State) } } else { Write-Output 'DHFEAT|${f.id}|Missing' }`;
    }
    return f.names.map((n) => `$x = Get-WindowsOptionalFeature -Online -FeatureName ${psQuote(n)} -ErrorAction SilentlyContinue
Write-Output ('DHFEAT|${f.id}|' + $(if ($x) { $x.State } else { 'Missing' }))`).join('\n');
  }).join('\n');
}

function launch(command, args) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: false });
      child.once('error', (e) => finish({ ok: false, error: e.message }));
      child.once('spawn', () => { child.unref(); finish({ ok: true }); });
      setTimeout(() => finish({ ok: true }), 1500);
    } catch (e) { finish({ ok: false, error: e.message }); }
  });
}

class WindowsToolsEngine {
  constructor(runMarked = (script, ms) => ElevationHelper.runMarked(script, ms), launcher = launch) {
    this.runMarked = runMarked;
    this.launch = launcher;
  }

  async listFeatures() {
    if (process.platform !== 'win32') return NOT_WINDOWS;
    const r = await this.runMarked(featureReadScript(WINDOWS_FEATURES), 180000);
    if (!r.ok) return { ok: false, error: `Não foi possível ler os recursos do Windows: ${r.error}` };
    return { ok: true, features: parseFeatureLines(r.out) };
  }

  async setFeature(id, enable) {
    if (process.platform !== 'win32') return NOT_WINDOWS;
    const f = featureById(id);
    if (!f) return { ok: false, error: 'Recurso desconhecido.' };
    let body;
    if (f.capability) {
      const like = psQuote(`${f.capability}~*`);
      body = enable
        ? `$c = Get-WindowsCapability -Online | Where-Object { $_.Name -like ${like} } | Select-Object -First 1
if (-not $c) { throw 'Recurso nao disponivel nesta edicao do Windows.' }
if ($c.State -ne 'Installed') { Add-WindowsCapability -Online -Name $c.Name -ErrorAction Stop | Out-Null }
Set-Service -Name sshd -StartupType Automatic -ErrorAction SilentlyContinue
Start-Service sshd -ErrorAction SilentlyContinue`
        : `$c = Get-WindowsCapability -Online | Where-Object { $_.Name -like ${like} -and $_.State -eq 'Installed' }
Stop-Service sshd -Force -ErrorAction SilentlyContinue
foreach ($x in @($c)) { Remove-WindowsCapability -Online -Name $x.Name -ErrorAction Stop | Out-Null }`;
    } else {
      const names = `@(${f.names.map(psQuote).join(',')})`;
      body = `$any = $false; $reboot = $false
foreach ($n in ${names}) {
  $x = Get-WindowsOptionalFeature -Online -FeatureName $n -ErrorAction SilentlyContinue
  if (-not $x) { continue }
  $any = $true
  ${enable
    ? "if ($x.State -ne 'Enabled') { $r = Enable-WindowsOptionalFeature -Online -FeatureName $n -All -NoRestart -ErrorAction Stop; if ($r.RestartNeeded) { $reboot = $true } }"
    : "if ($x.State -ne 'Disabled') { $r = Disable-WindowsOptionalFeature -Online -FeatureName $n -NoRestart -ErrorAction Stop; if ($r.RestartNeeded) { $reboot = $true } }"}
}
if (-not $any) { throw 'Recurso nao disponivel nesta edicao do Windows.' }
if ($reboot) { Write-Output 'DHREBOOT|1' }`;
    }
    const r = await this.runMarked(`${body}\n${featureReadScript([f])}`, 1800000);
    if (!r.ok) return { ok: false, error: r.error };
    const state = parseFeatureLines(r.out)[f.id];
    const good = enable ? (state === 'enabled' || state === 'pending') : (state === 'disabled' || state === 'pending');
    if (!good) return { ok: false, error: `O Windows manteve o recurso em "${state}".`, state };
    const reboot = state === 'pending' || /^DHREBOOT\|1/m.test(r.out);
    return { ok: true, verified: true, state, requiresReboot: reboot };
  }

  async openPanel(id) {
    if (process.platform !== 'win32') return NOT_WINDOWS;
    const p = Object.prototype.hasOwnProperty.call(PANELS, id) ? PANELS[id] : null;
    if (!p) return { ok: false, error: 'Painel desconhecido.' };
    return this.launch(p[0], p[1]);
  }

  async run(action) {
    if (process.platform !== 'win32') return NOT_WINDOWS;
    if (!ACTIONS.has(action)) return { ok: false, error: 'Ação desconhecida.' };
    return this[action]();
  }

  /** Stops the update services, moves the caches aside (kept as *.dh-old for one run) and verifies the services return. */
  async resetWindowsUpdate() {
    const r = await this.runMarked(`$svcs = 'wuauserv','bits','cryptsvc','msiserver','usosvc'
foreach ($s in $svcs) { Stop-Service -Name $s -Force -ErrorAction SilentlyContinue }
foreach ($d in @("$env:SystemRoot\\SoftwareDistribution", "$env:SystemRoot\\System32\\catroot2")) {
  if (Test-Path -LiteralPath "$d.dh-old") { Remove-Item -LiteralPath "$d.dh-old" -Recurse -Force -ErrorAction SilentlyContinue }
  if (Test-Path -LiteralPath $d) { Rename-Item -LiteralPath $d -NewName ((Split-Path $d -Leaf) + '.dh-old') -ErrorAction Stop }
}
foreach ($s in 'cryptsvc','bits','wuauserv') { Start-Service -Name $s -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
$st = (Get-Service wuauserv).Status
if ($st -ne 'Running') { Start-Service wuauserv -ErrorAction Stop }
Write-Output ('DHINFO|' + (Get-Service wuauserv).Status)`, 300000);
    if (!r.ok) return { ok: false, error: `Reset do Windows Update falhou: ${r.error}` };
    return { ok: true, verified: true, msg: 'Windows Update reiniciado: serviços parados, cache (SoftwareDistribution e catroot2) renovado e serviços de volta. Os antigos ficaram como *.dh-old até o próximo reset. Abra Configurações > Windows Update e procure atualizações.' };
  }

  /** Re-registers App Installer (winget) for this user and confirms winget answers. */
  async repairWinget() {
    const r = await this.runMarked(`Add-AppxPackage -RegisterByFamilyName -MainPackage Microsoft.DesktopAppInstaller_8wekyb3d8bbwe -ErrorAction Stop
$w = Join-Path $env:LOCALAPPDATA 'Microsoft\\WindowsApps\\winget.exe'
if (-not (Test-Path -LiteralPath $w)) { throw 'winget.exe nao apareceu depois de registrar o App Installer.' }
$v = & $w --version
if ($LASTEXITCODE -ne 0) { throw 'winget nao respondeu.' }
Write-Output ('DHINFO|' + $v)`, 300000);
    if (!r.ok) {
      await this.launch('explorer.exe', ['ms-windows-store://pdp/?productid=9NBLGGH4NNS1']);
      return { ok: false, error: `Não foi possível reparar o winget automaticamente (${r.error}). Abri o "Instalador de Aplicativo" na Microsoft Store: clique em Atualizar ou Instalar.` };
    }
    const v = /^DHINFO\|(.*)$/m.exec(r.out)?.[1]?.trim() || '';
    return { ok: true, verified: true, msg: `winget reparado e respondendo${v ? ` (${v})` : ''}.` };
  }

  /** DISM component store cleanup WITHOUT /ResetBase, so installed updates can still be uninstalled. */
  async cleanupComponentStore() {
    const r = await this.runMarked(`$before = (Get-PSDrive -Name ($env:SystemDrive.TrimEnd(':'))).Free
& dism.exe /Online /Cleanup-Image /StartComponentCleanup /NoRestart | Out-Null
DhCheck 'DISM StartComponentCleanup'
$after = (Get-PSDrive -Name ($env:SystemDrive.TrimEnd(':'))).Free
Write-Output ('DHINFO|' + [math]::Round(($after - $before) / 1MB))`, 3600000);
    if (!r.ok) return { ok: false, error: `Limpeza do repositório de componentes falhou: ${r.error}` };
    const mb = Number(/^DHINFO\|(-?\d+)/m.exec(r.out)?.[1] || 0);
    return { ok: true, verified: true, msg: `Limpeza de atualizações antigas concluída${mb > 0 ? `: ${mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`} liberados` : ''}. As atualizações instaladas continuam podendo ser desinstaladas.` };
  }

  /** Official Edge uninstaller, unlocked the same way WinUtil does; verified by msedge.exe being gone. */
  async removeEdge() {
    const r = await this.runMarked(`$setup = @(Resolve-Path -Path "\${env:ProgramFiles(x86)}\\Microsoft\\Edge\\Application\\*\\Installer\\setup.exe" -ErrorAction SilentlyContinue) | Select-Object -Last 1
if (-not $setup) { throw 'Microsoft Edge nao esta instalado.' }
$stub = "$env:SystemRoot\\SystemApps\\Microsoft.MicrosoftEdge_8wekyb3d8bbwe\\MicrosoftEdge.exe"
$created = -not (Test-Path -LiteralPath $stub)
if ($created) { New-Item -ItemType File -Path $stub -Force | Out-Null }
try { Start-Process -FilePath $setup.Path -ArgumentList '--uninstall --system-level --force-uninstall --delete-profile' -Wait }
finally { if ($created) { Remove-Item -LiteralPath $stub -Force -ErrorAction SilentlyContinue } }
if (Test-Path -LiteralPath "\${env:ProgramFiles(x86)}\\Microsoft\\Edge\\Application\\msedge.exe") { throw 'O desinstalador do Edge terminou mas o msedge.exe continua presente.' }`, 600000);
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, verified: true, msg: 'Microsoft Edge removido. O WebView2 (usado por vários apps) foi mantido. Para voltar, use "Reinstalar o Edge".' };
  }

  async installEdge() {
    const r = await this.runMarked(`$w = Get-Command winget.exe -ErrorAction SilentlyContinue
if (-not $w) { throw 'winget nao encontrado (use "Reparar winget").' }
& $w.Source install --id Microsoft.Edge -e --silent --scope machine --accept-package-agreements --accept-source-agreements | Out-Null
if (-not (Test-Path -LiteralPath "\${env:ProgramFiles(x86)}\\Microsoft\\Edge\\Application\\msedge.exe")) { throw 'A instalacao terminou mas o msedge.exe nao apareceu.' }`, 900000);
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, verified: true, msg: 'Microsoft Edge instalado.' };
  }

  /** Starts decrypting the system drive. Decryption continues in the background; progress is read back. */
  async decryptSystemDrive() {
    const r = await this.runMarked(`$v = Get-BitLockerVolume -MountPoint $env:SystemDrive -ErrorAction Stop
if ($v.VolumeStatus -eq 'FullyDecrypted') { Write-Output 'DHINFO|FullyDecrypted' }
else {
  Disable-BitLocker -MountPoint $env:SystemDrive -ErrorAction Stop | Out-Null
  Write-Output ('DHINFO|' + (Get-BitLockerVolume -MountPoint $env:SystemDrive).VolumeStatus)
}`, 120000);
    if (!r.ok) return { ok: false, error: `Não foi possível desativar o BitLocker: ${r.error}` };
    const st = /^DHINFO\|(\w+)/m.exec(r.out)?.[1] || '';
    if (st === 'FullyDecrypted') return { ok: true, verified: true, msg: 'O disco do sistema já não está criptografado.' };
    if (!/Decrypt/i.test(st)) return { ok: false, error: `O BitLocker ficou em "${st}".` };
    return { ok: true, verified: true, msg: 'Descriptografia do disco do sistema iniciada. Ela continua em segundo plano (pode levar horas) e pode ser acompanhada em Gerenciar BitLocker; o PC pode ser usado normalmente.' };
  }

  /**
   * Automatic sign-in through Windows' own dialog (netplwiz), which keeps the password as an LSA secret instead of
   * plain text in the registry. Windows 11 hides its checkbox while "Windows Hello only" sign-in is on; that switch is
   * turned off first (the user can turn it back on in Settings > Accounts > Sign-in options).
   */
  async autologon() {
    const r = await this.runMarked(`$k = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\PasswordLess\\Device'
if (Test-Path -LiteralPath $k) { Set-ItemProperty -LiteralPath $k -Name DevicePasswordLessBuildVersion -Value 0 -Type DWord -ErrorAction Stop }
Start-Process -FilePath "$env:SystemRoot\\System32\\netplwiz.exe"`, 60000);
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, msg: 'Janela "Contas de Usuário" aberta: desmarque "Os usuários devem digitar um nome de usuário e uma senha" e confirme com sua senha. O Windows guarda a senha protegida (segredo LSA), não em texto puro.' };
  }
}

export { WindowsToolsEngine };
export default new WindowsToolsEngine();
