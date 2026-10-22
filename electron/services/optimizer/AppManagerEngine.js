import fs from 'node:fs';
import nodePath from 'node:path';
import si from 'systeminformation';
import ElevationHelper from './ElevationHelper.js';
import DeepTweaksEngine from './DeepTweaksEngine.js';
import SystemEngine from './SystemEngine.js';
import ServicesEngine, { scArgFromStartMode } from './ServicesEngine.js';
import { runPowerShell as runPowerShellShared } from '../PowerShellRunner.js';
import {
  psQuote,
  parseUninstallString,
  mergeGpuPreference,
  isCriticalProcessName,
  isProtectedService,
  isValidServiceName,
  isValidAppxName,
  isProtectedAppx,
  buildStartupApprovedBytes,
  bytesToHex,
  startupApprovedTarget,
  psPathToRegKey,
  normalizePriorityName,
  isSafeInstallLocationFor,
  formatBytes
} from './OptimizerUtils.js';

const RUNONCE_BACKUP = 'startup:runonce';
const SERVICES_BACKUP = 'services:custom';
const GPU_KEY = 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences';
const HAGS_KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers';

/** Exact AppX package names (never wildcards). OneDrive is a Win32 app and is handled by SystemEngine. */
export const BLOATWARE_LIST = [
  { id: 'Microsoft.Copilot', name: 'Microsoft Copilot' },
  { id: 'Microsoft.Windows.Ai.Copilot.Provider', name: 'Windows AI Copilot Provider' },
  { id: 'Microsoft.549981C3F5F10', name: 'Cortana' },
  { id: 'Microsoft.MicrosoftOfficeHub', name: 'Microsoft 365 (Office Hub)' },
  { id: 'Microsoft.OneDrive', name: 'Microsoft OneDrive (desinstalação)', special: 'onedrive' },
  { id: 'Microsoft.BingSearch', name: 'Bing Search' },
  { id: 'Microsoft.BingNews', name: 'Notícias (Bing News)' },
  { id: 'Microsoft.BingWeather', name: 'Clima (Bing Weather)' },
  { id: 'MicrosoftCorporationII.MicrosoftFamily', name: 'Microsoft Family Safety' },
  { id: 'Microsoft.WindowsFeedbackHub', name: 'Hub de Comentários (Feedback Hub)' },
  { id: 'Microsoft.GetHelp', name: 'Obter Ajuda (Get Help)' },
  { id: 'Microsoft.Getstarted', name: 'Dicas (Get Started)' },
  { id: 'microsoft.windowscommunicationsapps', name: 'Email e Calendário (Mail/Calendar)' },
  { id: 'Microsoft.WindowsMaps', name: 'Mapas (Windows Maps)' },
  { id: 'Microsoft.MixedReality.Portal', name: 'Portal de Realidade Misturada' },
  { id: 'Microsoft.Office.OneNote', name: 'OneNote for Windows' },
  { id: 'Microsoft.OutlookForWindows', name: 'Novo Outlook para Windows' },
  { id: 'Microsoft.MSPaint', name: 'Paint 3D' },
  { id: 'Microsoft.People', name: 'Pessoas (People)' },
  { id: 'MicrosoftCorporationII.QuickAssist', name: 'Assistência Rápida (Quick Assist)' },
  { id: 'Microsoft.SkypeApp', name: 'Skype' },
  { id: 'Microsoft.MicrosoftSolitaireCollection', name: 'Solitaire Collection' },
  { id: 'Microsoft.MicrosoftStickyNotes', name: 'Notas Autoadesivas (Sticky Notes)' },
  { id: 'Microsoft.Todos', name: 'Microsoft To Do' },
  { id: 'Microsoft.Wallet', name: 'Microsoft Wallet' },
  { id: 'Microsoft.YourPhone', name: 'Vincular ao Celular (Phone Link)' },
  { id: 'Microsoft.XboxApp', name: 'Xbox (app antigo)' },
  { id: 'Microsoft.ZuneMusic', name: 'Groove Música / Media Player antigo' },
  { id: 'Microsoft.ZuneVideo', name: 'Filmes e TV' },
  { id: 'Microsoft.3DBuilder', name: '3D Builder' }
];

function toArray(data) {
  return Array.isArray(data) ? data : data ? [data] : [];
}

class AppManagerEngine {
  constructor() {
    this.allowedStartupRegistryPaths = new Set([
      'hkcu:\\software\\microsoft\\windows\\currentversion\\run',
      'hklm:\\software\\microsoft\\windows\\currentversion\\run',
      'hkcu:\\software\\microsoft\\windows\\currentversion\\runonce',
      'hklm:\\software\\microsoft\\windows\\currentversion\\runonce',
      'hklm:\\software\\wow6432node\\microsoft\\windows\\currentversion\\run'
    ]);
  }

  async runPowerShellJson(script, fallback = []) {
    try {
      const { code, stdout } = await runPowerShellShared(script, { timeoutMs: 20000, trim: true });
      if (code !== 0) return { data: fallback };
      return { data: JSON.parse(stdout || 'null') ?? fallback };
    } catch {
      return { data: fallback };
    }
  }

  async runPowerShell(script, timeoutMs = 20000) {
    try {
      const { code, stdout, stderr } = await runPowerShellShared(script, { timeoutMs, trim: true });
      return { code, stdout, stderr };
    } catch (e) {
      return { code: 1, stdout: '', stderr: e.message };
    }
  }

  // ------------------------------------------------------------------ startup items
  _startupFolders() {
    return [
      nodePath.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'),
      nodePath.join(process.env.ProgramData || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'StartUp')
    ];
  }

  /**
   * Lists startup entries (Run keys, RunOnce, Startup folders) with their REAL enabled state, read from the same
   * StartupApproved flags that Task Manager / Settings > Startup apps use.
   */
  async getStartupItems() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    const script = `
$ErrorActionPreference = 'SilentlyContinue'
$items = New-Object System.Collections.ArrayList
function Test-StartupDisabled([string]$hive, [string]$sub, [string]$name) {
  $p = $hive + ':\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\' + $sub
  $o = Get-ItemProperty -LiteralPath $p -Name $name -ErrorAction SilentlyContinue
  if ($o) { $b = $o.$name; if (($b -is [byte[]]) -and $b.Length -gt 0) { return (($b[0] -band 1) -eq 1) } }
  return $null
}
$defs = @(
  @{ p = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'; hive = 'HKCU'; sub = 'Run'; scope = 'user' },
  @{ p = 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'; hive = 'HKLM'; sub = 'Run'; scope = 'machine' },
  @{ p = 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run'; hive = 'HKLM'; sub = 'Run32'; scope = 'machine' },
  @{ p = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce'; hive = 'HKCU'; sub = ''; scope = 'user' },
  @{ p = 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce'; hive = 'HKLM'; sub = ''; scope = 'machine' }
)
foreach ($d in $defs) {
  $k = Get-Item -LiteralPath $d.p
  if (-not $k) { continue }
  foreach ($n in $k.GetValueNames()) {
    if ($n -eq '') { continue }
    $dis = $null
    if ($d.sub) {
      $dis = Test-StartupDisabled $d.hive $d.sub $n
      if (($null -eq $dis) -and ($d.hive -eq 'HKLM')) { $dis = Test-StartupDisabled 'HKCU' $d.sub $n }
    }
    [void]$items.Add([pscustomobject]@{ name = $n; cmd = [string]$k.GetValue($n); type = 'Registry'; path = $d.p; scope = $d.scope; enabled = (-not ($dis -eq $true)); oneShot = (-not $d.sub) })
  }
}
$wsh = New-Object -ComObject WScript.Shell
$folders = @(
  @{ d = [Environment]::GetFolderPath('Startup'); hive = 'HKCU'; scope = 'user' },
  @{ d = [Environment]::GetFolderPath('CommonStartup'); hive = 'HKLM'; scope = 'machine' }
)
foreach ($f in $folders) {
  if (-not $f.d -or -not (Test-Path -LiteralPath $f.d)) { continue }
  Get-ChildItem -LiteralPath $f.d -Filter *.lnk -ErrorAction SilentlyContinue | ForEach-Object {
    $dis = Test-StartupDisabled $f.hive 'StartupFolder' $_.Name
    if (($null -eq $dis) -and ($f.hive -eq 'HKLM')) { $dis = Test-StartupDisabled 'HKCU' 'StartupFolder' $_.Name }
    [void]$items.Add([pscustomobject]@{ name = $_.BaseName; cmd = [string]$wsh.CreateShortcut($_.FullName).TargetPath; type = 'Folder'; path = $_.FullName; scope = $f.scope; enabled = (-not ($dis -eq $true)); oneShot = $false })
  }
}
ConvertTo-Json -InputObject @($items) -Compress -Depth 3`;
    const res = await this.runPowerShell(script, 30000);
    if (res.code !== 0) return { ok: false, error: res.stderr || 'Não foi possível ler os itens de inicialização', items: [] };
    let items = [];
    try { items = toArray(JSON.parse(res.stdout || 'null')); } catch { items = []; }
    items = items.map((i) => ({ ...i, enabled: i.enabled !== false, canToggle: true }));

    // RunOnce entries disabled by us were deleted from the registry: list them from the backup so they can be restored.
    const backup = DeepTweaksEngine.getExtra(RUNONCE_BACKUP)?.items || [];
    for (const b of backup) {
      if (!items.some((i) => i.name === b.name && psPathToRegKey(i.path).toLowerCase() === String(b.key).toLowerCase())) {
        const isUser = /^HKCU/i.test(b.key);
        items.push({ name: b.name, cmd: String(b.data), type: 'Registry', path: `${b.key.replace(/^(HKCU|HKLM)\\/i, '$1:\\')}`, scope: isUser ? 'user' : 'machine', enabled: false, oneShot: true, canToggle: true });
      }
    }
    return { ok: true, items };
  }

  _validateStartupPayload({ name, type, path }) {
    if (typeof path !== 'string' || typeof name !== 'string' || !path || !name) return 'Item de inicialização inválido';
    if (type === 'Registry') {
      if (!this.allowedStartupRegistryPaths.has(path.toLowerCase())) return 'Chave de registro não permitida para itens de inicialização';
      return null;
    }
    if (type === 'Folder') {
      const startupDirs = this._startupFolders().map((d) => d.toLowerCase());
      const parent = nodePath.dirname(nodePath.resolve(path)).toLowerCase();
      if (!/\.lnk$/i.test(path) || !startupDirs.includes(parent)) return 'Atalho fora das pastas de inicialização do Windows';
      return null;
    }
    return 'Tipo de item inválido';
  }

  /**
   * Disables (default) or re-enables (payload.enable === true) a startup item the SAME way Task Manager does: by flipping
   * its StartupApproved flag. Nothing is deleted, so it is fully reversible. RunOnce keys have no such flag: the value is
   * backed up before being removed and restored on enable.
   */
  async disableStartupItem(payload = {}) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    const { name, type, path } = payload || {};
    const enable = payload?.enable === true;
    const invalid = this._validateStartupPayload({ name, type, path });
    if (invalid) return { ok: false, error: invalid };

    const target = startupApprovedTarget({ name, type, path, scope: payload.scope });
    if (target) {
      const bytes = buildStartupApprovedBytes(!enable);
      const [r] = await DeepTweaksEngine.runRegistryOps([{ key: target.key, name: target.valueName, type: 'REG_BINARY', data: bytesToHex(bytes) }]);
      if (!r?.ok) return { ok: false, error: `Não foi possível ${enable ? 'ativar' : 'desativar'} "${name}": ${r?.message || 'falha ao gravar'}${target.hive === 'HKLM' ? ' (itens de todos os usuários exigem administrador)' : ''}` };
      const list = await this.getStartupItems();
      const found = (list.items || []).find((i) => i.name === name && i.path === path);
      if (!found || found.enabled !== enable) {
        return { ok: false, error: `O Windows não confirmou a alteração de "${name}".`, verified: false };
      }
      return { ok: true, verified: true, enabled: enable, msg: `"${name}" ${enable ? 'voltará a iniciar com o Windows' : 'não iniciará mais com o Windows'} (mesmo mecanismo do Gerenciador de Tarefas; reversível).` };
    }

    // RunOnce: backup + delete / restore
    const key = psPathToRegKey(path);
    const backup = DeepTweaksEngine.getExtra(RUNONCE_BACKUP) || { items: [] };
    if (enable) {
      const entry = backup.items.find((b) => b.name === name && String(b.key).toLowerCase() === key.toLowerCase());
      if (!entry) return { ok: false, error: 'Não há cópia de segurança deste item RunOnce para restaurar.' };
      const [r] = await DeepTweaksEngine.runRegistryOps([{ key: entry.key, name: entry.name, type: entry.type, data: entry.data }]);
      if (!r?.ok) return { ok: false, error: `Falha ao restaurar "${name}": ${r?.message}` };
      DeepTweaksEngine.saveExtra(RUNONCE_BACKUP, { items: backup.items.filter((b) => b !== entry) });
      return { ok: true, verified: true, enabled: true, msg: `"${name}" restaurado.` };
    }
    const read = await this.runPowerShell(`$k = Get-Item -LiteralPath ${psQuote(path)} -ErrorAction Stop
$n = ${psQuote(name)}
$v = $k.GetValue($n, $null, 'DoNotExpandEnvironmentNames')
$kind = [string]$k.GetValueKind($n)
ConvertTo-Json -InputObject ([pscustomobject]@{ value = [string]$v; kind = $kind }) -Compress`);
    let cur = null;
    try { cur = JSON.parse(read.stdout); } catch { /* handled below */ }
    if (read.code !== 0 || !cur) return { ok: false, error: 'Não foi possível ler o item antes de removê-lo (nada foi alterado).' };
    const regType = cur.kind === 'ExpandString' ? 'REG_EXPAND_SZ' : 'REG_SZ';
    const saved = [...backup.items.filter((b) => !(b.name === name && String(b.key).toLowerCase() === key.toLowerCase())), { key, name, type: regType, data: cur.value }];
    DeepTweaksEngine.saveExtra(RUNONCE_BACKUP, { items: saved });
    const [r] = await DeepTweaksEngine.runRegistryOps([{ key, name, deleteValue: true }]);
    if (!r?.ok) return { ok: false, error: `Falha ao remover "${name}": ${r?.message}` };
    return { ok: true, verified: true, enabled: false, msg: `"${name}" removido do RunOnce (cópia guardada; use Ativar para restaurar).` };
  }

  // ------------------------------------------------------------------ services
  async getServices() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    const script = `Get-CimInstance Win32_Service -Filter "State='Running'" | Select-Object Name, DisplayName, StartMode | ConvertTo-Json -Compress`;
    const { data } = await this.runPowerShellJson(script, []);
    const services = toArray(data).map((s) => ({ ...s, protected: isProtectedService(s.Name) }));
    return { ok: true, services };
  }

  /** disableService('Name') | disableService({ name, restore: true }) - snapshot of the previous start mode is kept. */
  async disableService(payload) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    const name = typeof payload === 'string' ? payload : payload?.name;
    const restore = typeof payload === 'object' && payload?.restore === true;
    if (!isValidServiceName(name)) return { ok: false, error: 'Nome de serviço inválido' };
    if (isProtectedService(name)) return { ok: false, error: `O serviço "${name}" é essencial para o Windows e não pode ser desativado por aqui.` };

    const before = (await ServicesEngine.readServices([name]))?.[name.toLowerCase()];
    if (!before) return { ok: false, error: `Serviço "${name}" não encontrado.` };
    const store = DeepTweaksEngine.getExtra(SERVICES_BACKUP) || {};

    if (restore) {
      const snap = store[name];
      // the value comes from the persisted store and is written into an elevated script: accept only sc.exe keywords
      if (!/^(auto|delayed-auto|demand|disabled|boot|system)$/.test(String(snap?.startArg || ''))) return { ok: false, error: `Não há configuração salva de "${name}" para restaurar.` };
      const script = `& sc.exe config ${psQuote(name)} start= ${snap.startArg} | Out-Null
DhCheck 'sc config'${snap.wasRunning && snap.startArg !== 'disabled' ? `\r\n& sc.exe start ${psQuote(name)} | Out-Null` : ''}`;
      const r = await ElevationHelper.runMarked(script, 60000);
      if (!r.ok) return { ok: false, error: `Falha ao restaurar "${name}": ${r.error}` };
      const after = (await ServicesEngine.readServices([name]))?.[name.toLowerCase()];
      if (!after || scArgFromStartMode(after.startMode, after.delayed) !== snap.startArg) return { ok: false, error: `O Windows não confirmou a restauração de "${name}".` };
      delete store[name];
      DeepTweaksEngine.saveExtra(SERVICES_BACKUP, store);
      return { ok: true, verified: true, msg: `Serviço "${name}" restaurado ao modo anterior.` };
    }

    if (before.startMode !== 'Disabled' || !store[name]) {
      store[name] = { startArg: scArgFromStartMode(before.startMode, before.delayed), wasRunning: before.state === 'Running' };
      DeepTweaksEngine.saveExtra(SERVICES_BACKUP, store);
    }
    const script = `& sc.exe config ${psQuote(name)} start= disabled | Out-Null
DhCheck 'sc config'
& sc.exe stop ${psQuote(name)} | Out-Null`;
    const r = await ElevationHelper.runMarked(script, 60000);
    if (!r.ok) return { ok: false, error: `Falha ao desativar "${name}": ${r.error}` };
    const after = (await ServicesEngine.readServices([name]))?.[name.toLowerCase()];
    if (!after || after.startMode !== 'Disabled') {
      return { ok: false, error: `O Windows não confirmou "${name}" como desativado (estado atual: ${after?.startMode ?? 'desconhecido'}).`, verified: false };
    }
    return { ok: true, verified: true, msg: `Serviço "${name}" parado e desativado (verificado). Pode ser restaurado.` };
  }

  // ------------------------------------------------------------------ installed programs
  async findRegisteredProgram({ name, uninstallString }) {
    const res = await this.getInstalledPrograms();
    if (!res.ok) return null;
    return (res.programs || []).find((p) => (!name || p.name === name) && p.uninstallString === uninstallString) || null;
  }

  _validKeyPath(p) {
    return typeof p === 'string'
      && /^Microsoft\.PowerShell\.Core\\Registry::HKEY_(LOCAL_MACHINE|CURRENT_USER)\\[^\r\n']+\\Uninstall\\[^\r\n']+$/i.test(p);
  }

  /** Script that runs the uninstaller (no shell involved), waits, and reports whether the registry entry is gone. */
  _uninstallBlock(parsed, keyPath) {
    const startLine = parsed.args
      ? `$p = Start-Process -FilePath ${psQuote(parsed.file)} -ArgumentList ${psQuote(parsed.args)} -Wait -PassThru`
      : `$p = Start-Process -FilePath ${psQuote(parsed.file)} -Wait -PassThru`;
    return `${startLine}
Write-Output ('DHEXIT|' + $p.ExitCode)
$key = ${psQuote(keyPath || '')}
if ($key) {
  for ($i = 0; $i -lt 40; $i++) { if (-not (Test-Path -LiteralPath $key)) { break }; Start-Sleep -Seconds 1 }
  if (Test-Path -LiteralPath $key) { Write-Output 'DHGONE|0' } else { Write-Output 'DHGONE|1' }
} else { Write-Output 'DHGONE|?' }`;
  }

  async uninstallProgram(arg) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    const uninstallString = typeof arg === 'string' ? arg : arg?.uninstallString;
    if (typeof uninstallString !== 'string' || !uninstallString.trim()) return { ok: false, error: 'Comando de desinstalação inválido' };

    const registered = await this.findRegisteredProgram({ uninstallString });
    if (!registered) return { ok: false, error: 'O desinstalador informado não corresponde a nenhum programa registrado no Windows.' };
    const parsed = parseUninstallString(registered.uninstallString);
    if (!parsed) return { ok: false, error: 'Não foi possível interpretar o comando de desinstalação deste programa.' };

    const r = await ElevationHelper.runMarked(this._uninstallBlock(parsed, this._validKeyPath(registered.keyPath) ? registered.keyPath : ''), 600000);
    if (!r.ok) return { ok: false, error: `Falha ao executar o desinstalador: ${r.error}` };
    const exit = /^DHEXIT\|(-?\d+)/m.exec(r.out)?.[1];
    const gone = /^DHGONE\|(\d|\?)/m.exec(r.out)?.[1];
    if (gone === '0') return { ok: false, error: `"${registered.name}" continua instalado (a desinstalação foi cancelada ou falhou; código de saída ${exit ?? '?'}).`, exitCode: exit };
    return { ok: true, verified: gone === '1', msg: `"${registered.name}" desinstalado${gone === '1' ? ' (confirmado: registro removido)' : ''}${exit === '3010' ? '. Reinicie o Windows para concluir.' : '.'}` };
  }

  _isSafeLeftoverName(value) {
    const v = String(value || '').trim();
    if (v.length < 4) return false;
    if (/[\\/:*?"<>|]/.test(v) || v.includes('..')) return false;
    const protectedNames = new Set([
      'microsoft', 'windows', 'windows nt', 'intel', 'nvidia', 'nvidia corporation', 'amd', 'advanced micro devices',
      'google', 'apple', 'adobe', 'common files', 'classes', 'policies', 'wow6432node', 'software', 'system',
      'program files', 'programdata', 'users', 'default', 'realtek', 'oracle', 'valve', 'steam', 'java', 'python', 'dotnet',
      'packages', 'temp', 'cache', 'local', 'roaming', 'programs', 'drivers', 'microsoft edge', 'edge'
    ]);
    return !protectedNames.has(v.toLowerCase());
  }

  _isSafeInstallLocation(location) {
    const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA, process.env.APPDATA, process.env.ProgramData].filter(Boolean);
    return isSafeInstallLocationFor(location, roots, nodePath.sep);
  }

  /**
   * Uninstalls, WAITS until Windows no longer lists the program and only then deletes the leftovers (named folders and
   * registry keys, with measured size). If the user cancels the uninstaller nothing else is touched.
   * Leftovers can include the program's own settings/saved data in AppData: the UI warns about it.
   */
  async uninstallProgramWithLeftovers({ name, uninstallString } = {}) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    if (!name || !uninstallString) return { ok: false, error: 'Dados do programa inválidos' };

    const registered = await this.findRegisteredProgram({ name, uninstallString });
    if (!registered) return { ok: false, error: 'O programa informado não corresponde a nenhum item registrado no Windows.' };
    const parsed = parseUninstallString(registered.uninstallString);
    if (!parsed) return { ok: false, error: 'Não foi possível interpretar o comando de desinstalação deste programa.' };
    if (!this._validKeyPath(registered.keyPath)) return { ok: false, error: 'Não foi possível identificar a entrada de registro do programa (nada foi alterado).' };

    const folders = [];
    const regKeys = [];
    const progName = registered.name;
    const publisher = registered.publisher || '';
    if (this._isSafeLeftoverName(progName)) {
      for (const base of [process.env.APPDATA, process.env.LOCALAPPDATA, process.env.ProgramData]) {
        if (base) folders.push(nodePath.join(base, progName));
      }
      regKeys.push(`HKCU:\\Software\\${progName}`, `HKLM:\\SOFTWARE\\${progName}`, `HKLM:\\SOFTWARE\\WOW6432Node\\${progName}`);
      if (this._isSafeLeftoverName(publisher)) {
        folders.push(nodePath.join(process.env.APPDATA || '', publisher, progName), nodePath.join(process.env.LOCALAPPDATA || '', publisher, progName));
        regKeys.push(`HKCU:\\Software\\${publisher}\\${progName}`, `HKLM:\\SOFTWARE\\${publisher}\\${progName}`);
      }
    }
    if (registered.installLocation && this._isSafeInstallLocation(registered.installLocation)) {
      folders.push(nodePath.resolve(String(registered.installLocation).replace(/^"|"$/g, '')));
    }
    const uniqFolders = [...new Set(folders.filter((f) => f && f.length > 6))];

    const cleanup = `
if ($gone) {
  $folders = @(${uniqFolders.map(psQuote).join(', ')})
  foreach ($f in $folders) {
    if ($f -and (Test-Path -LiteralPath $f)) {
      $bytes = (Get-ChildItem -LiteralPath $f -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
      if (-not $bytes) { $bytes = 0 }
      Remove-Item -LiteralPath $f -Recurse -Force -ErrorAction SilentlyContinue
      Write-Output ('DHLEFT|folder|' + $f + '|' + $bytes + '|' + [int](-not (Test-Path -LiteralPath $f)))
    }
  }
  $regKeys = @(${regKeys.map(psQuote).join(', ')})
  foreach ($rk in $regKeys) {
    if (Test-Path -LiteralPath $rk) {
      Remove-Item -LiteralPath $rk -Recurse -Force -ErrorAction SilentlyContinue
      Write-Output ('DHLEFT|reg|' + $rk + '|0|' + [int](-not (Test-Path -LiteralPath $rk)))
    }
  }
}`;
    const script = `${this._uninstallBlock(parsed, registered.keyPath)}
$gone = -not (Test-Path -LiteralPath ${psQuote(registered.keyPath)})
${cleanup}`;
    const r = await ElevationHelper.runMarked(script, 900000);
    if (!r.ok) return { ok: false, error: `Falha ao desinstalar "${progName}": ${r.error}` };
    const exit = /^DHEXIT\|(-?\d+)/m.exec(r.out)?.[1];
    if (/^DHGONE\|0/m.test(r.out)) {
      return { ok: false, error: `"${progName}" continua instalado (desinstalação cancelada ou falhou; código ${exit ?? '?'}). Nenhum resíduo foi apagado.`, leftoversRemoved: 0 };
    }
    const left = [...r.out.matchAll(/^DHLEFT\|(folder|reg)\|(.+)\|(\d+)\|(\d)$/gm)].map((m) => ({ kind: m[1], path: m[2], bytes: Number(m[3]), removed: m[4] === '1' }));
    const removed = left.filter((l) => l.removed);
    const failed = left.filter((l) => !l.removed);
    const bytes = removed.reduce((a, l) => a + l.bytes, 0);
    const msg = `"${progName}" desinstalado (confirmado). Resíduos removidos: ${removed.length}${bytes ? ` (${formatBytes(bytes)} liberados)` : ''}${failed.length ? `; ${failed.length} não puderam ser removidos` : ''}.`;
    return { ok: true, verified: true, msg, leftoversRemoved: removed.length, freedBytes: bytes, leftoversFailed: failed.map((l) => l.path), requiresReboot: exit === '3010' };
  }

  async getInstalledPrograms() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows', programs: [] };
    const script = `
$paths = @(
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
$list = @()
Get-ItemProperty $paths -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -and $_.DisplayName.Trim() -ne '' -and $_.SystemComponent -ne 1 -and $null -eq $_.ParentKeyName } | ForEach-Object {
  $name = $_.DisplayName.Trim()
  $unStr = if ($_.QuietUninstallString) { $_.QuietUninstallString } else { $_.UninstallString }
  if ($unStr) {
    $list += [PSCustomObject]@{
      name = $name
      version = if ($_.DisplayVersion) { [string]$_.DisplayVersion } else { '' }
      publisher = if ($_.Publisher) { [string]$_.Publisher } else { '' }
      installDate = if ($_.InstallDate) { [string]$_.InstallDate } else { '' }
      installLocation = if ($_.InstallLocation) { [string]$_.InstallLocation } else { '' }
      uninstallString = [string]$unStr
      isQuiet = [bool]$_.QuietUninstallString
      keyPath = [string]$_.PSPath
    }
  }
}
$unique = $list | Sort-Object name -Unique
ConvertTo-Json -InputObject @($unique) -Compress`;
    const { data } = await this.runPowerShellJson(script, []);
    const items = toArray(data).filter((p) => p && p.name);
    return { ok: true, programs: items };
  }

  // ------------------------------------------------------------------ bloatware
  async listBloatware() {
    let installed = null;
    if (process.platform === 'win32') {
      const r = await this.runPowerShell('Get-AppxPackage -ErrorAction SilentlyContinue | ForEach-Object { $_.Name }', 30000);
      if (r.code === 0) installed = new Set(String(r.stdout || '').split(/\r?\n/).map((s) => s.trim().toLowerCase()).filter(Boolean));
    }
    const oneDriveInstalled = process.platform === 'win32' && [
      process.env.LOCALAPPDATA && nodePath.join(process.env.LOCALAPPDATA, 'Microsoft', 'OneDrive', 'OneDrive.exe'),
      process.env.ProgramFiles && nodePath.join(process.env.ProgramFiles, 'Microsoft OneDrive', 'OneDrive.exe'),
      process.env['ProgramFiles(x86)'] && nodePath.join(process.env['ProgramFiles(x86)'], 'Microsoft OneDrive', 'OneDrive.exe')
    ].filter(Boolean).some((p) => fs.existsSync(p));
    const apps = BLOATWARE_LIST.map((a) => ({
      ...a,
      installed: a.special === 'onedrive' ? oneDriveInstalled : (installed ? installed.has(a.id.toLowerCase()) : null)
    }));
    return { ok: true, apps };
  }

  /** payload: string[] | { appIds: string[] }. Only ids from BLOATWARE_LIST are accepted; names are matched exactly. */
  async removeSelectedBloatware(payload) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    const raw = Array.isArray(payload) ? payload : Array.isArray(payload?.appIds) ? payload.appIds : [];
    const known = new Map(BLOATWARE_LIST.map((a) => [a.id.toLowerCase(), a]));
    const ids = [...new Set(raw.map((id) => String(id ?? '').trim()).filter((id) => isValidAppxName(id) && known.has(id.toLowerCase())))];
    const blocked = ids.filter((id) => isProtectedAppx(id));
    const allowed = ids.filter((id) => !isProtectedAppx(id)).map((id) => known.get(id.toLowerCase()).id);
    if (allowed.length === 0) return { ok: false, error: blocked.length ? 'Os aplicativos selecionados são protegidos.' : 'Nenhum aplicativo válido selecionado.' };

    const removed = [];
    const failed = [];
    const absent = [];

    const appx = allowed.filter((id) => known.get(id.toLowerCase()).special !== 'onedrive');
    if (appx.length) {
      const script = `$ids = @(${appx.map(psQuote).join(',')})
foreach ($id in $ids) {
  $pk = @(Get-AppxPackage -AllUsers -Name $id)
  $prov = @(Get-AppxProvisionedPackage -Online | Where-Object { $_.DisplayName -eq $id })
  if (($pk.Count -eq 0) -and ($prov.Count -eq 0)) { Write-Output ('DHAPP|' + $id + '|absent'); continue }
  foreach ($p in $pk) { try { Remove-AppxPackage -Package $p.PackageFullName -AllUsers -ErrorAction Stop } catch { } }
  foreach ($p in $prov) { try { Remove-AppxProvisionedPackage -Online -PackageName $p.PackageName -ErrorAction Stop | Out-Null } catch { } }
  $left = @(Get-AppxPackage -AllUsers -Name $id).Count + @(Get-AppxProvisionedPackage -Online | Where-Object { $_.DisplayName -eq $id }).Count
  if ($left -eq 0) { Write-Output ('DHAPP|' + $id + '|removed') } else { Write-Output ('DHAPP|' + $id + '|failed') }
}`;
      const r = await ElevationHelper.runMarked(script, 600000);
      if (!r.ok) return { ok: false, error: `Falha ao remover aplicativos: ${r.error}` };
      for (const m of r.out.matchAll(/^DHAPP\|([^|]+)\|(removed|failed|absent)$/gm)) {
        (m[2] === 'removed' ? removed : m[2] === 'failed' ? failed : absent).push(m[1]);
      }
      // anything the script did not report counts as failed
      for (const id of appx) if (![...removed, ...failed, ...absent].includes(id)) failed.push(id);
    }
    if (allowed.some((id) => known.get(id.toLowerCase()).special === 'onedrive')) {
      const od = await SystemEngine.deepCleanOneDrive();
      if (od.ok) (od.changed === false ? absent : removed).push('Microsoft.OneDrive');
      else failed.push('Microsoft.OneDrive');
    }

    const nameOf = (id) => known.get(id.toLowerCase())?.name || id;
    const parts = [];
    if (removed.length) parts.push(`Removido(s): ${removed.map(nameOf).join(', ')}`);
    if (absent.length) parts.push(`Já ausente(s): ${absent.map(nameOf).join(', ')}`);
    if (failed.length) parts.push(`Não foi possível remover (componente do sistema ou em uso): ${failed.map(nameOf).join(', ')}`);
    if (blocked.length) parts.push(`Protegido(s) ignorado(s): ${blocked.join(', ')}`);
    const ok = failed.length === 0;
    const base = { removed, failed, notInstalled: absent, blocked, msg: parts.join('. ') + '.' };
    return ok ? { ok: true, verified: true, ...base } : { ok: false, error: base.msg, ...base };
  }

  // ------------------------------------------------------------------ processes
  async getRunningProcesses() {
    try {
      let list = [];
      try {
        const processes = await si.processes();
        if (processes && Array.isArray(processes.list) && processes.list.length > 0) {
          list = processes.list
            .filter((p) => p.pid > 4 && p.name && p.name !== 'System Idle Process' && p.name !== 'svchost.exe' && p.name !== 'Registry')
            .map((p) => ({
              pid: p.pid,
              name: p.name,
              mem: p.memRss || (p.mem_rss ? Math.round(p.mem_rss / 1024) : 0),
              cpu: Math.round(p.cpu || 0),
              path: p.path || '',
              critical: isCriticalProcessName(p.name)
            }));
        }
      } catch { /* fall back to PowerShell */ }

      if (list.length === 0 && process.platform === 'win32') {
        const script = `Get-Process | Where-Object { $_.Id -gt 4 -and $_.ProcessName -ne 'svchost' } | Select-Object Id, ProcessName, WorkingSet64, Path | Sort-Object WorkingSet64 -Descending | Select-Object -First 100 | ConvertTo-Json -Compress`;
        const { data } = await this.runPowerShellJson(script, []);
        list = toArray(data).map((p) => {
          const nm = p.ProcessName ? (p.ProcessName.endsWith('.exe') ? p.ProcessName : `${p.ProcessName}.exe`) : 'Unknown';
          return { pid: p.Id, name: nm, mem: Math.round((p.WorkingSet64 || 0) / 1024), cpu: 0, path: p.Path || '', critical: isCriticalProcessName(nm) };
        });
      }

      list.sort((a, b) => b.mem - a.mem);
      return { ok: true, processes: list.slice(0, 100) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Sets the priority class of a running process. NOT persistent: Windows forgets it when the process exits.
   * System-critical processes are refused; RealTime needs payload.allowRealtime === true (it can freeze the PC).
   */
  async setProcessPriority({ pid, priority, allowRealtime = false } = {}) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    const priorityName = normalizePriorityName(priority);
    if (!priorityName) return { ok: false, error: `Prioridade inválida: ${String(priority).slice(0, 30)}` };
    const safePid = Number(pid);
    if (!Number.isInteger(safePid) || safePid <= 4) return { ok: false, error: 'PID inválido' };
    if (priorityName === 'RealTime' && allowRealtime !== true) {
      return { ok: false, error: 'Prioridade Tempo Real pode travar o computador e exige confirmação explícita.' };
    }

    const info = await this.runPowerShell(`(Get-Process -Id ${safePid} -ErrorAction Stop).ProcessName`);
    const procName = String(info.stdout || '').trim();
    if (info.code !== 0 || !procName) return { ok: false, error: 'Processo não encontrado (talvez já tenha sido encerrado).' };
    if (isCriticalProcessName(procName)) return { ok: false, error: `"${procName}" é um processo crítico do Windows; a prioridade não será alterada.` };

    const setScript = `$p = Get-Process -Id ${safePid} -ErrorAction Stop
$p.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::${priorityName}
$p.Refresh()
Write-Output ('DHPRIO|' + $p.PriorityClass)`;
    let actual = null;
    let errText = '';
    const direct = await this.runPowerShell(`$ErrorActionPreference='Stop'\n${setScript}`);
    if (direct.code === 0) actual = /DHPRIO\|(\w+)/.exec(direct.stdout || '')?.[1] ?? null;
    else errText = direct.stderr || '';
    if (!actual) {
      const elevated = await ElevationHelper.runMarked(setScript, 60000);
      if (elevated.ok) actual = /DHPRIO\|(\w+)/.exec(elevated.out)?.[1] ?? null;
      else errText = elevated.error || errText;
    }
    if (!actual) return { ok: false, error: `Não foi possível alterar a prioridade de "${procName}": ${errText || 'acesso negado'}` };
    if (actual !== priorityName) {
      return { ok: false, verified: false, error: `O Windows aplicou "${actual}" em vez de "${priorityName}" para "${procName}" (Tempo Real exige privilégios de administrador).` };
    }
    return { ok: true, verified: true, msg: `Prioridade de "${procName}" (PID ${safePid}) definida como ${priorityName} e verificada. Vale só enquanto o processo estiver aberto.` };
  }

  // ------------------------------------------------------------------ GPU preference per app
  async getGpuPreferences() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    const script = `
$path = 'HKCU:\\Software\\Microsoft\\DirectX\\UserGpuPreferences'
$k = Get-Item -LiteralPath $path -ErrorAction SilentlyContinue
$list = @()
if ($k) {
  foreach ($n in $k.GetValueNames()) {
    if ($n -eq '') { continue }
    $val = [string]$k.GetValue($n)
    $pref = 'default'
    if ($val -match 'GpuPreference=2') { $pref = 'high_performance' }
    elseif ($val -match 'GpuPreference=1') { $pref = 'power_saving' }
    $list += [PSCustomObject]@{ appPath = $n; appName = [System.IO.Path]::GetFileName($n); preference = $pref; rawValue = $val }
  }
}
ConvertTo-Json -InputObject @($list) -Compress`;
    const { data } = await this.runPowerShellJson(script, []);
    const items = toArray(data).filter((i) => i && i.appPath).map((i) => ({ ...i, exists: (() => { try { return fs.existsSync(i.appPath); } catch { return false; } })() }));
    return { ok: true, preferences: items };
  }

  _validateAppExe(appPath) {
    if (typeof appPath !== 'string' || !appPath.trim()) return 'Caminho do aplicativo inválido';
    const p = appPath.trim();
    if (!/^[A-Za-z]:\\/.test(p) || /[\r\n\0"<>|*?]/.test(p) || p.includes('..')) return 'Use o caminho completo de um arquivo .exe (ex.: C:\\Jogos\\jogo.exe)';
    if (!/\.exe$/i.test(p)) return 'O arquivo precisa ser um executável (.exe)';
    if (!fs.existsSync(p)) return 'O arquivo informado não existe neste computador';
    return null;
  }

  async _readGpuValue(appPath) {
    const r = await this.runPowerShell(`$k = Get-Item -LiteralPath 'HKCU:\\Software\\Microsoft\\DirectX\\UserGpuPreferences' -ErrorAction SilentlyContinue
if ($k) { $v = $k.GetValue(${psQuote(appPath)}, $null); if ($null -ne $v) { Write-Output ('DHVAL|' + $v) } }`);
    return /^DHVAL\|(.*)$/m.exec(r.stdout || '')?.[1] ?? null;
  }

  async setGpuPreference({ appPath, preference = 'high_performance' } = {}) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    const invalid = this._validateAppExe(appPath);
    if (invalid) return { ok: false, error: invalid };
    const value = preference === 'power_saving' ? 1 : preference === 'default' ? 0 : 2;
    const path = appPath.trim();
    const existing = await this._readGpuValue(path);
    const merged = mergeGpuPreference(existing, value);
    const [r] = await DeepTweaksEngine.runRegistryOps([{ key: GPU_KEY, name: path, type: 'REG_SZ', data: merged }]);
    if (!r?.ok) return { ok: false, error: `Falha ao gravar a preferência de GPU: ${r?.message}` };
    const back = await this._readGpuValue(path);
    if (back !== merged) return { ok: false, error: 'O Windows não confirmou a preferência de GPU gravada.' };
    const label = value === 2 ? 'GPU dedicada (Alto desempenho)' : value === 1 ? 'GPU integrada (Economia)' : 'Padrão do Windows';
    return { ok: true, verified: true, msg: `Preferência de GPU "${label}" gravada e verificada para ${path}. Vale para este usuário; reinicie o aplicativo. Só tem efeito em PCs com mais de uma GPU.` };
  }

  async removeGpuPreference({ appPath } = {}) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    if (typeof appPath !== 'string' || !appPath.trim() || /[\r\n\0]/.test(appPath)) return { ok: false, error: 'Caminho do aplicativo inválido' };
    const [r] = await DeepTweaksEngine.runRegistryOps([{ key: GPU_KEY, name: appPath, deleteValue: true }]);
    if (!r?.ok) return { ok: false, error: `Falha ao remover a preferência: ${r?.message}` };
    if ((await this._readGpuValue(appPath)) !== null) return { ok: false, error: 'A preferência continua presente no registro.' };
    return { ok: true, verified: true, msg: 'Preferência de GPU removida (o aplicativo volta a seguir o padrão do Windows).' };
  }

  async getGpuInfo() {
    try {
      const graphics = await si.graphics();
      const controllers = (graphics.controllers || []).map((c) => {
        const nameLower = (c.model || '').toLowerCase();
        const vendorLower = (c.vendor || '').toLowerCase();
        const isIntel = nameLower.includes('intel') || vendorLower.includes('intel');
        const isAmdApu = nameLower.includes('vega') || nameLower.includes('radeon(tm) graphics') || nameLower.includes('radeon graphics');
        const isDedicated = !isIntel && !isAmdApu && (c.vram > 1024 || vendorLower.includes('nvidia') || nameLower.includes('rtx') || nameLower.includes('gtx') || nameLower.includes('geforce') || nameLower.includes('rx '));
        return { model: c.model || 'Placa Gráfica', vendor: c.vendor || '', vram: c.vram || 0, bus: c.bus || '', isDedicated };
      });
      return { ok: true, controllers, multiGpu: controllers.length > 1 };
    } catch (e) {
      return { ok: false, error: e.message, controllers: [] };
    }
  }

  // ------------------------------------------------------------------ HAGS
  /** HwSchMode: 2 = on, 1 = off, absent = driver default (which may or may not be "on"). */
  async getHagsStatus() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    const r = await this.runPowerShell(`$v = (Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers' -Name 'HwSchMode' -ErrorAction SilentlyContinue).HwSchMode
if ($null -eq $v) { Write-Output 'DHHAGS|default' } else { Write-Output ('DHHAGS|' + $v) }`);
    if (r.code !== 0) return { ok: false, error: r.stderr || 'Não foi possível ler o HAGS' };
    const val = /DHHAGS\|(\w+)/.exec(r.stdout || '')?.[1] ?? 'default';
    return { ok: true, enabled: val === '2', value: val === 'default' ? '' : val, state: val === '2' ? 'on' : val === '1' ? 'off' : 'default' };
  }

  async setHagsStatus({ enabled } = {}) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    const res = enabled
      ? await DeepTweaksEngine.applyTweaks(['group:hags'])
      : await DeepTweaksEngine.applyChangeSet({
        id: 'group:hags',
        title: 'HAGS desligado',
        changes: [{ key: HAGS_KEY, name: 'HwSchMode', type: 'REG_DWORD', data: '1' }],
        requiresReboot: true
      });
    if (!res.ok) return { ok: false, error: res.error || 'Falha ao ajustar HAGS' };
    return { ok: true, verified: true, requiresReboot: true, msg: `HAGS ${enabled ? 'ativado' : 'desativado'} e verificado no registro. Reinicie o Windows para valer. Depende do driver/GPU (RTX 20+/RX 5000+); o efeito em FPS varia entre jogos.` };
  }

  async revertHags() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    const res = await DeepTweaksEngine.revertTweaks(['group:hags']);
    if (!res.ok) return { ok: false, error: res.error || 'Falha ao reverter HAGS' };
    return { ok: true, verified: true, requiresReboot: true, msg: 'HAGS restaurado ao valor anterior (ou ao padrão do driver). Reinicie o computador.' };
  }
}

export default new AppManagerEngine();
