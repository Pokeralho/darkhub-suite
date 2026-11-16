// Tweaks whose rows depend on the machine (Windows build, GPU vendor, RAM size, which services exist) plus the
// registry facts from the optimizerDuck comparison. Registry values are facts; nothing here is copied code.
//
// Extra definition fields understood by resolveTweak():
//   minBuild / maxBuild   Windows build range where the tweak exists (e.g. Click to Do needs 26100+)
//   gpu                   { vendor: 'amd'|'nvidia'|'intel', values: [[name, type, data]] } written to every display
//                         adapter of that vendor under the display class key
//   dynamicRows(facts)    rows computed from facts (e.g. SvcHostSplitThresholdInKB = installed RAM)
//   onlyExistingKeys      rows whose key does not exist are dropped (never create a key for a missing service/logger)
//   serviceTargets        [[serviceName, startValue]]: writes Services\<name>\Start, only when the service exists and
//                         only when it LOWERS the start type (never turns a disabled service back to manual)
//   bestEffort            a row Windows refuses (protected service key) does not fail the whole tweak; only the rows
//                         that were written are recorded, checked and restored

import { regEntryId } from './OptimizerUtils.js';

const DW = 'REG_DWORD';
const SZ = 'REG_SZ';
const HKCU_ADV = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced';
const POL_DC = 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection';
const SVC = 'HKLM\\SYSTEM\\CurrentControlSet\\Services';
const AUTOLOGGER = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\WMI\\Autologger';
export const DISPLAY_CLASS = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}';
const WIN11 = 22000;

/** Telemetry scheduled tasks (path, name). Only tasks that exist and are enabled are touched. */
export const TELEMETRY_TASKS = [
  ['\\Microsoft\\Windows\\Application Experience\\', 'Microsoft Compatibility Appraiser'],
  ['\\Microsoft\\Windows\\Application Experience\\', 'Microsoft Compatibility Appraiser Exp'],
  ['\\Microsoft\\Windows\\Application Experience\\', 'ProgramDataUpdater'],
  ['\\Microsoft\\Windows\\Application Experience\\', 'MareBackup'],
  ['\\Microsoft\\Windows\\Application Experience\\', 'StartupAppTask'],
  ['\\Microsoft\\Windows\\Application Experience\\', 'PcaPatchDbTask'],
  ['\\Microsoft\\Windows\\Autochk\\', 'Proxy'],
  ['\\Microsoft\\Windows\\Customer Experience Improvement Program\\', 'Consolidator'],
  ['\\Microsoft\\Windows\\Customer Experience Improvement Program\\', 'UsbCeip'],
  ['\\Microsoft\\Windows\\Feedback\\Siuf\\', 'DmClient'],
  ['\\Microsoft\\Windows\\Feedback\\Siuf\\', 'DmClientOnScenarioDownload']
];

/** ETW sessions Windows starts at boot only to collect diagnostics/telemetry. */
export const TELEMETRY_AUTOLOGGERS = [
  'AppModel', 'Cellcore', 'CloudExperienceHostOobe', 'DataMarket', 'DiagLog', 'Diagtrack-Listener', 'LwtNetLog', 'SQMLogger',
  'WdiContextLog', 'WiFiSession'
];

/**
 * Services set to Manual (3) or Disabled (4). Based on the well-known community list, minus what would hurt here:
 * - services another DarkHub item already owns (WSearch, DiagTrack, CDPSvc, lfsvc: "Desativar Serviços Redundantes");
 * - keys Windows protects even from administrators (WaaSMedicSvc, sppsvc, wscsvc, AppXSvc, ClipSVC, NgcSvc...);
 * - things people use and would not connect to this tweak: Spooler (printing), LanmanServer (folder sharing, also the
 *   DarkHub share feature), ssh-agent (DarkHub SSH client), WpnService (notifications), Windows Update (UsoSvc, BITS),
 *   automatic time zone, VMware tools;
 * - "Automatic" entries of the original list: they only re-assert defaults and could turn on something the user
 *   disabled on purpose.
 * Manual services still start on demand (trigger start), so features keep working; they just do not sit in memory.
 */
export const SERVICE_TARGETS = [
  ...['AJRouter', 'AppVClient', 'AssignedAccessManagerSvc', 'DialogBlockingService', 'Fax', 'NetTcpPortSharing', 'RemoteAccess',
    'RemoteRegistry', 'RetailDemo', 'UevAgentService', 'shpamsvc'].map((n) => [n, 4]),
  ...['ALG', 'AppIDSvc', 'AppMgmt', 'AppReadiness', 'Appinfo', 'AxInstSV', 'BDESVC', 'BTAGService', 'COMSysApp', 'CertPropSvc',
    'CscService', 'DevQueryBroker', 'DeviceAssociationService', 'DeviceInstall', 'DisplayEnhancementService', 'DmEnrollmentSvc', 'EFS',
    'EapHost', 'EntAppSvc', 'FDResPub', 'FrameServer', 'FrameServerMonitor', 'GraphicsPerfSvc', 'HvHost', 'IKEEXT', 'InstallService',
    'InventorySvc', 'IpxlatCfgSvc', 'KtmRm', 'LicenseManager', 'LxpSvc', 'MSDTC', 'MSiSCSI', 'McpManagementService',
    'MicrosoftEdgeElevationService', 'MixedRealityOpenXRSvc', 'MsKeyboardFilter', 'NaturalAuthentication', 'NcaSvc', 'NcbService',
    'NcdAutoSetup', 'NetSetupSvc', 'PNRPAutoReg', 'PNRPsvc', 'PcaSvc', 'PeerDistSvc', 'PerfHost', 'PhoneSvc', 'PolicyAgent',
    'PrintNotify', 'PushToInstall', 'QWAVE', 'RasAuto', 'RasMan', 'RmSvc', 'RpcLocator', 'SCPolicySvc', 'SCardSvr', 'SDRSVC',
    'SEMgrSvc', 'SNMPTRAP', 'SSDPSRV', 'ScDeviceEnum', 'SensorDataService', 'SensorService', 'SensrSvc', 'SessionEnv', 'SharedAccess',
    'SharedRealitySvc', 'SmsRouter', 'SstpSvc', 'StiSvc', 'StorSvc', 'TabletInputService', 'TapiSrv', 'TermService',
    'TieringEngineService', 'TroubleshootingSvc', 'UmRdpService', 'VSS', 'VacSvc', 'W32Time', 'WEPHOSTSVC', 'WFDSConMgrSvc',
    'WMPNetworkSvc', 'WManSvc', 'WPDBusEnum', 'WalletService', 'WarpJITSvc', 'WbioSrvc', 'WcsPlugInService', 'WdiServiceHost',
    'WdiSystemHost', 'WebClient', 'Wecsvc', 'WerSvc', 'WiaRpc', 'WinRM', 'WpcMonSvc', 'XblAuthManager', 'XblGameSave', 'XboxGipSvc',
    'XboxNetApiSvc', 'autotimesvc', 'bthserv', 'camsvc', 'cloudidsvc', 'dcsvc', 'defragsvc', 'diagnosticshub.standardcollector.service',
    'diagsvc', 'dmwappushservice', 'dot3svc', 'edgeupdate', 'edgeupdatem', 'fdPHost', 'fhsvc', 'hidserv', 'icssvc', 'lltdsvc',
    'lmhosts', 'msiserver', 'netprofm', 'p2pimsvc', 'p2psvc', 'perceptionsimulation', 'pla', 'seclogon', 'smphost', 'spectrum',
    'svsvc', 'swprv', 'upnphost', 'vds', 'vmicguestinterface', 'vmicheartbeat', 'vmickvpexchange', 'vmicrdv', 'vmicshutdown',
    'vmictimesync', 'vmicvmsession', 'vmicvss', 'vmvss', 'wbengine', 'wcncsvc', 'wercplsupport', 'wisvc', 'wlidsvc', 'wlpasvc',
    'wmiApSrv', 'workfolderssvc'].map((n) => [n, 3])
];

const GPU_VENDORS = { '10de': 'nvidia', '1002': 'amd', '1022': 'amd', '8086': 'intel' };

/** PCI vendor of a display adapter from its MatchingDeviceId (pci\ven_10de&dev_...). null for virtual/basic adapters. */
export function gpuVendorFromDeviceId(id) {
  const m = /ven_([0-9a-f]{4})/i.exec(String(id || ''));
  return m ? GPU_VENDORS[m[1].toLowerCase()] || null : null;
}

/** Normalises the probe output: { build, ramKB, gpus: [{ key, vendor, desc }] }. */
export function factsFromProbe(raw) {
  const gpus = (Array.isArray(raw?.gpus) ? raw.gpus : raw?.gpus ? [raw.gpus] : [])
    .filter((g) => /^\d{4}$/.test(String(g?.index || '')))
    .map((g) => ({ key: `${DISPLAY_CLASS}\\${g.index}`, vendor: gpuVendorFromDeviceId(g.id), desc: String(g.desc || '') }))
    .filter((g) => g.vendor);
  const build = Number(raw?.build) || 0;
  const ramKB = Number(raw?.ramKB) || 0;
  return { build, ramKB, gpus };
}

/** Rows a definition may write before the per-machine filtering (used to read what exists). */
export function candidateChanges(def, facts) {
  if (def.gpu) {
    return (facts?.gpus || []).filter((g) => g.vendor === def.gpu.vendor)
      .flatMap((g) => def.gpu.values.map(([name, type, data]) => ({ key: g.key, name, type, data: String(data) })));
  }
  if (def.serviceTargets) {
    return def.serviceTargets.map(([svc, start]) => ({ key: `${SVC}\\${svc}`, name: 'Start', type: DW, data: String(start) }));
  }
  if (def.dynamicRows) return def.dynamicRows(facts || {}).map(([key, name, type, data]) => ({ key, name, type, data: String(data) }));
  return def.templateChanges || def.changes || [];
}

/**
 * Decides, for this machine, which rows a definition writes. Pure: facts and readMap come from the probe.
 * readMap: Map(regEntryId -> { exists, keyExists, value }) for candidateChanges().
 * Returns { applicable, reason, changes, revertChanges }.
 */
export function resolveTweak(def, facts, readMap = new Map()) {
  const build = facts?.build || 0;
  if (build && def.minBuild && build < def.minBuild) return { applicable: false, reason: 'build', changes: [] };
  if (build && def.maxBuild && build > def.maxBuild) return { applicable: false, reason: 'build', changes: [] };
  const dynamic = Boolean(def.gpu || def.serviceTargets || def.dynamicRows || def.onlyExistingKeys);
  if (!dynamic) return { applicable: true, changes: def.templateChanges || def.changes || [] };
  let rows = candidateChanges(def, facts);
  const get = (c) => readMap.get(regEntryId(c.key, c.name));
  if (def.onlyExistingKeys || def.serviceTargets) rows = rows.filter((c) => get(c)?.keyExists === true);
  if (def.serviceTargets) {
    // never raise a start type (a disabled service stays disabled); boot/system drivers (0/1) are never touched
    rows = rows.filter((c) => {
      const cur = get(c);
      const now = cur?.exists ? Number(cur.value) : NaN;
      return Number.isFinite(now) && now >= 2 && now <= Number(c.data);
    });
  }
  if (rows.length === 0) return { applicable: false, reason: def.gpu ? 'gpu' : 'missing', changes: [] };
  // revert without a snapshot: driver/service values are removed only when we created them; otherwise the snapshot
  // (always taken before writing) restores the exact previous value
  const revertChanges = def.gpu ? rows.map((c) => ({ key: c.key, name: c.name, deleteValue: true })) : undefined;
  return { applicable: true, changes: rows, revertChanges };
}

/** Read-only probe: Windows build, installed RAM and display adapters (non elevated, ASCII only). */
export const FACTS_SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$b = (Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion').CurrentBuildNumber
$ram = [int64]((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1KB)
$g = @()
$cls = 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}'
foreach ($k in @(Get-ChildItem -LiteralPath $cls)) {
  if ($k.PSChildName -notmatch '^\d{4}$') { continue }
  $p = Get-ItemProperty -LiteralPath $k.PSPath
  $g += [pscustomobject]@{ index = [string]$k.PSChildName; id = [string]$p.MatchingDeviceId; desc = [string]$p.DriverDesc }
}
[pscustomobject]@{ build = [int]$b; ramKB = $ram; gpus = @($g) } | ConvertTo-Json -Compress -Depth 4
`;

// the marker key is shared by several tweaks: removed only when nothing is left in it
const dropEmptyMarker = "$mk = Get-Item -LiteralPath 'HKLM:\\SOFTWARE\\DarkHub\\Tweaks' -ErrorAction SilentlyContinue; if ($mk -and $mk.ValueCount -eq 0 -and $mk.SubKeyCount -eq 0) { Remove-Item -LiteralPath 'HKLM:\\SOFTWARE\\DarkHub\\Tweaks' -ErrorAction SilentlyContinue }";

/** Scheduled-task tweak: disables only the tasks that are enabled and remembers which ones, to re-enable exactly those. */
function telemetryTasksCommands() {
  const list = `@(${TELEMETRY_TASKS.map(([p, n]) => `@{ p = '${p}'; n = '${n}' }`).join(', ')})`;
  const marker = "'HKLM:\\SOFTWARE\\DarkHub\\Tweaks'";
  return {
    apply: `$tasks = ${list}
if (-not (Test-Path -LiteralPath ${marker})) { New-Item -Path ${marker} -Force | Out-Null }
$prev = (Get-ItemProperty -LiteralPath ${marker}).TelemetryTasksPrev
$done = @()
foreach ($t in $tasks) {
  $x = Get-ScheduledTask -TaskPath $t.p -TaskName $t.n -ErrorAction SilentlyContinue
  if (-not $x -or [string]$x.State -eq 'Disabled') { continue }
  Disable-ScheduledTask -TaskPath $t.p -TaskName $t.n -ErrorAction Stop | Out-Null
  $done += ($t.p + $t.n)
}
if (-not $prev) { New-ItemProperty -Path ${marker} -Name TelemetryTasksPrev -PropertyType String -Value ($done -join '|') -Force | Out-Null }
New-ItemProperty -Path ${marker} -Name TelemetryTasks -PropertyType DWord -Value 1 -Force | Out-Null`,
    revert: `$prev = [string](Get-ItemProperty -LiteralPath ${marker}).TelemetryTasksPrev
foreach ($full in ($prev -split '\\|')) {
  if (-not $full) { continue }
  $i = $full.LastIndexOf('\\')
  Enable-ScheduledTask -TaskPath $full.Substring(0, $i + 1) -TaskName $full.Substring($i + 1) -ErrorAction SilentlyContinue | Out-Null
}
Remove-ItemProperty -LiteralPath ${marker} -Name TelemetryTasksPrev -ErrorAction SilentlyContinue
Remove-ItemProperty -LiteralPath ${marker} -Name TelemetryTasks -ErrorAction SilentlyContinue
${dropEmptyMarker}`
  };
}

/** AutoLogger tweak: sets Start=0 on the sessions that exist and records each previous value to put it back. */
function autoLoggerCommands() {
  const names = `@(${TELEMETRY_AUTOLOGGERS.map((n) => `'${n}'`).join(', ')})`;
  const base = `'HKLM:\\${AUTOLOGGER.slice(5)}\\'`;
  const marker = "'HKLM:\\SOFTWARE\\DarkHub\\Tweaks'";
  return {
    apply: `if (-not (Test-Path -LiteralPath ${marker})) { New-Item -Path ${marker} -Force | Out-Null }
$prev = (Get-ItemProperty -LiteralPath ${marker}).AutoLoggersPrev
$rec = @()
foreach ($n in ${names}) {
  $p = ${base} + $n
  if (-not (Test-Path -LiteralPath $p)) { continue }
  $v = (Get-ItemProperty -LiteralPath $p).Start
  $rec += ($n + '=' + $(if ($null -eq $v) { '' } else { [string]$v }))
  Set-ItemProperty -LiteralPath $p -Name Start -Value 0 -Type DWord -ErrorAction Stop
}
if (-not $prev) { New-ItemProperty -Path ${marker} -Name AutoLoggersPrev -PropertyType String -Value ($rec -join '|') -Force | Out-Null }
New-ItemProperty -Path ${marker} -Name AutoLoggers -PropertyType DWord -Value 1 -Force | Out-Null`,
    revert: `$prev = [string](Get-ItemProperty -LiteralPath ${marker}).AutoLoggersPrev
foreach ($pair in ($prev -split '\\|')) {
  if (-not $pair) { continue }
  $n, $v = $pair -split '=', 2
  $p = ${base} + $n
  if (-not (Test-Path -LiteralPath $p)) { continue }
  if ($v -eq '') { Remove-ItemProperty -LiteralPath $p -Name Start -ErrorAction SilentlyContinue }
  else { Set-ItemProperty -LiteralPath $p -Name Start -Value ([int]$v) -Type DWord -ErrorAction Stop }
}
Remove-ItemProperty -LiteralPath ${marker} -Name AutoLoggersPrev -ErrorAction SilentlyContinue
Remove-ItemProperty -LiteralPath ${marker} -Name AutoLoggers -ErrorAction SilentlyContinue
${dropEmptyMarker}`
  };
}

const gpuTweak = (defineTweak, def) => defineTweak({
  category: 'gaming', risk: 'medium', requiresAdmin: true, requiresReboot: true, ...def, rows: []
});

/** @param {(def: object) => object} defineTweak */
export function buildMoreTweaks(defineTweak) {
  return [
    // ===================================== PRIVACIDADE (lote 1)
    defineTweak({
      id: 'tweak:telemetryExtended', category: 'privacy', requiresAdmin: true,
      title: 'Telemetria: pedidos de feedback, inventário de apps e dados opcionais',
      description: 'Complementa "Reduzir Telemetria": sem pedidos de avaliação do Windows, sem inventário de programas (AppCompat), sem nome do dispositivo nem dados do Edge na telemetria, sem reconhecimento de fala online e sem registrar quais apps você abre (a lista "Mais usados" do Iniciar fica vazia).',
      rows: [
        [POL_DC, 'DoNotShowFeedbackNotifications', DW, 1, null],
        [POL_DC, 'AllowCommercialDataPipeline', DW, 0, null],
        [POL_DC, 'AllowDeviceNameInTelemetry', DW, 0, null],
        [POL_DC, 'MicrosoftEdgeDataOptIn', DW, 0, null],
        ['HKCU\\Software\\Microsoft\\Siuf\\Rules', 'NumberOfSIUFInPeriod', DW, 0, null],
        ['HKCU\\Software\\Policies\\Microsoft\\Windows\\EdgeUI', 'DisableMFUTracking', DW, 1, null],
        ['HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\AppCompat', 'DisableInventory', DW, 1, null],
        ['HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\AppCompat', 'AITEnable', DW, 0, null],
        ['HKCU\\Software\\Policies\\Microsoft\\Assistance\\Client\\1.0', 'NoExplicitFeedback', DW, 1, null],
        ['HKLM\\SOFTWARE\\Policies\\Microsoft\\Assistance\\Client\\1.0', 'NoActiveHelp', DW, 1, null],
        ['HKCU\\Software\\Microsoft\\Speech_OneCore\\Settings\\OnlineSpeechPrivacy', 'HasAccepted', DW, 0, null],
        [HKCU_ADV, 'Start_TrackProgs', DW, 0, 1]
      ]
    }),
    defineTweak({
      id: 'tweak:disableTelemetryTasks', category: 'privacy', requiresAdmin: true,
      title: 'Desativar tarefas agendadas de telemetria',
      description: 'Desativa as tarefas que coletam inventário de compatibilidade e dados do Programa de Aperfeiçoamento (Compatibility Appraiser, ProgramDataUpdater, CEIP Consolidator, UsbCeip, Feedback DmClient e outras). Só as tarefas que estavam ligadas são desativadas, e Desfazer liga exatamente essas de volta.',
      statusOnly: [['HKLM\\SOFTWARE\\DarkHub\\Tweaks', 'TelemetryTasks', DW, 1]],
      commands: telemetryTasksCommands()
    }),
    defineTweak({
      id: 'tweak:disableAutoLoggers', category: 'privacy', requiresAdmin: true, requiresReboot: true,
      title: 'Desativar sessões de log de diagnóstico no boot (AutoLogger)',
      description: 'Impede que o Windows inicie, a cada boot, as sessões de rastreamento ETW de telemetria e diagnóstico (Diagtrack-Listener, SQMLogger, DiagLog, WdiContextLog, WiFiSession e outras). Economiza escrita em disco. Em troca, o Monitor de Confiabilidade e alguns solucionadores de problemas de rede/Wi-Fi ficam com menos informação. Vale após reiniciar.',
      // these keys are not readable without admin rights: the work and the record of the previous values run in the
      // elevated script, and the status is read from a DarkHub marker
      statusOnly: [['HKLM\\SOFTWARE\\DarkHub\\Tweaks', 'AutoLoggers', DW, 1]],
      commands: autoLoggerCommands()
    }),
    defineTweak({
      id: 'tweak:disableFindMyDevice', category: 'privacy', risk: 'medium', securityRelated: true, requiresAdmin: true,
      title: 'Desativar "Localizar meu dispositivo"',
      description: 'Desliga o envio periódico da localização do PC para a conta Microsoft. Em notebooks, você perde a opção de localizar ou bloquear o aparelho pela internet se ele for perdido ou roubado.',
      warning: 'Em notebooks, sem este recurso não dá para localizar o aparelho pela conta Microsoft em caso de perda ou roubo.',
      rows: [['HKLM\\SOFTWARE\\Policies\\Microsoft\\FindMyDevice', 'AllowFindMyDevice', DW, 0, null]]
    }),
    defineTweak({
      id: 'tweak:disableClickToDo', category: 'privacy', requiresAdmin: true, minBuild: 26100,
      title: 'Desativar o Click to Do (IA do Windows 11)',
      description: 'Desliga o Click to Do, que analisa o conteúdo da tela com IA local (Windows 11 24H2 ou mais novo, PCs Copilot+). Só aparece nas versões do Windows que têm o recurso.',
      rows: [
        ['HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsAI', 'DisableClickToDo', DW, 1, null],
        ['HKCU\\Software\\Policies\\Microsoft\\Windows\\WindowsAI', 'DisableClickToDo', DW, 1, null]
      ]
    }),
    defineTweak({
      id: 'tweak:disableSettingsAccountAds', category: 'privacy', requiresAdmin: true,
      title: 'Sem propagandas do Microsoft 365 e da conta no app Configurações',
      description: 'Remove os avisos de "conta" e as ofertas do Microsoft 365, OneDrive e Game Pass que aparecem no topo do app Configurações.',
      rows: [['HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\CloudContent', 'DisableConsumerAccountStateContent', DW, 1, null]]
    }),

    // ===================================== CUSTOMIZACAO (lote 1)
    defineTweak({
      id: 'tweak:fasterMenus', category: 'customization', needsRelogin: true,
      title: 'Menus e inicialização do Explorer mais rápidos',
      description: 'Menus abrem sem o atraso de 400 ms e os programas da inicialização não esperam o atraso artificial que o Explorer aplica depois do login. Vale após sair e entrar na sessão.',
      rows: [
        ['HKCU\\Control Panel\\Desktop', 'MenuShowDelay', SZ, '0', '400'],
        ['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Serialize', 'StartupDelayInMSec', DW, 0, null]
      ]
    }),
    defineTweak({
      id: 'tweak:hideStartRecommended', category: 'customization', requiresAdmin: true, minBuild: WIN11,
      title: 'Ocultar a seção "Recomendados" do Iniciar',
      description: 'Esconde a lista de arquivos recentes e apps sugeridos no menu Iniciar do Windows 11. Em algumas edições o Windows só respeita a política na versão Education/SE; nesse caso a seção continua lá e o DarkHub avisa que o valor não foi mantido.',
      explorerRestart: true,
      rows: [
        ['HKCU\\Software\\Policies\\Microsoft\\Windows\\Explorer', 'HideRecommendedSection', DW, 1, null],
        ['HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Explorer', 'HideRecommendedSection', DW, 1, null]
      ]
    }),
    defineTweak({
      id: 'tweak:hideMeetNow', category: 'customization', maxBuild: WIN11 - 1, explorerRestart: true,
      title: 'Ocultar o botão "Reunir agora" da barra de tarefas',
      description: 'Remove o ícone do Skype "Reunir agora" da bandeja do Windows 10.',
      rows: [['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer', 'HideSCAMeetNow', DW, 1, null]]
    }),
    defineTweak({
      id: 'tweak:disableWidgets', category: 'customization', requiresAdmin: true, explorerRestart: true,
      title: 'Desativar Widgets / Notícias e Interesses',
      description: 'Desliga o painel de Widgets do Windows 11 (e Notícias e Interesses no Windows 10) pela política oficial. O processo de widgets deixa de rodar em segundo plano.',
      rows: [['HKLM\\SOFTWARE\\Policies\\Microsoft\\Dsh', 'AllowNewsAndInterests', DW, 0, null]]
    }),

    // ===================================== SISTEMA (lote 1)
    defineTweak({
      id: 'tweak:longerUpdatePause', category: 'system', requiresAdmin: true,
      title: 'Permitir pausar o Windows Update por mais tempo',
      description: 'Aumenta o limite do botão "Pausar atualizações" em Configurações (o padrão é 5 semanas). As atualizações continuam ativas: nada é pausado até você escolher pausar.',
      rows: [['HKLM\\SOFTWARE\\Microsoft\\WindowsUpdate\\UX\\Settings', 'FlightSettingsMaxPauseDays', DW, 7300, null]]
    }),
    defineTweak({
      id: 'tweak:svchostGrouping', category: 'system', requiresAdmin: true, requiresReboot: true,
      title: 'Agrupar serviços em menos processos svchost',
      description: 'Com mais de 3,5 GB de RAM o Windows roda cada serviço num svchost.exe separado (dezenas de processos). Este ajuste usa o tamanho da sua RAM como limite, e o Windows volta a agrupar os serviços: menos processos e um pouco menos de memória. Se um serviço travar, os outros do mesmo grupo caem junto. Vale após reiniciar.',
      dynamicRows: (facts) => (facts.ramKB > 0 ? [['HKLM\\SYSTEM\\CurrentControlSet\\Control', 'SvcHostSplitThresholdInKB', DW, Math.min(facts.ramKB, 0xFFFFFFFF), 3670016]] : []),
      rows: []
    }),
    defineTweak({
      id: 'tweak:webdavLargeFiles', category: 'system', requiresAdmin: true, onlyExistingKeys: true,
      title: 'WebDAV: permitir arquivos maiores que 50 MB',
      description: 'Pastas de rede WebDAV (Nextcloud, SharePoint mapeado) recusam arquivos acima de 50 MB por padrão. Sobe o limite para o máximo (4 GB). Só aparece se o cliente WebDAV estiver instalado. Vale após reiniciar o serviço WebClient ou o PC.',
      rows: [['HKLM\\SYSTEM\\CurrentControlSet\\Services\\WebClient\\Parameters', 'FileSizeLimitInBytes', DW, 4294967295, 50000000]]
    }),
    defineTweak({
      id: 'tweak:servicesManual', category: 'system', risk: 'medium', requiresAdmin: true, requiresReboot: true, bestEffort: true,
      serviceTargets: SERVICE_TARGETS,
      title: 'Serviços do Windows em modo Manual (lista ampla)',
      description: 'Coloca cerca de 160 serviços pouco usados em "Manual" (iniciam só quando algum programa precisa) e desativa uns 10 obsoletos (Fax, Registro Remoto, Demo de varejo...). Nunca reativa um serviço que você desligou e não mexe em impressão, compartilhamento de pastas, notificações, Windows Update nem no agente SSH. Serviços protegidos pelo Windows são pulados. Cada valor anterior é guardado e Desfazer restaura exatamente. Vale após reiniciar.',
      warning: 'Mexe em muitos serviços de uma vez. Se algum recurso parar de funcionar, use Desfazer: tudo volta como estava.',
      rows: []
    }),

    // ===================================== JOGOS (lote 1)
    defineTweak({
      id: 'tweak:fastKeyboardRepeat', category: 'gaming', liveAction: 'keyboard',
      title: 'Repetição de teclado mais rápida',
      description: 'Atraso de repetição no mínimo e velocidade de repetição no máximo (Painel de Controle > Teclado). Vale na hora.',
      rows: [
        ['HKCU\\Control Panel\\Keyboard', 'KeyboardDelay', SZ, '0', '1'],
        ['HKCU\\Control Panel\\Keyboard', 'KeyboardSpeed', SZ, '31', '31']
      ]
    }),
    defineTweak({
      id: 'tweak:disableAccessibilityHotkeys', category: 'gaming', needsRelogin: true,
      title: 'Desativar atalhos de Teclas de Alternância e Teclas de Filtragem',
      description: 'Complementa o ajuste das Teclas de Aderência: segurar Num Lock por 5 s (Teclas de Alternância) ou Shift direito por 8 s (Teclas de Filtragem) deixa de abrir avisos no meio do jogo. Os recursos continuam disponíveis em Acessibilidade. Vale após sair e entrar na sessão.',
      rows: [
        ['HKCU\\Control Panel\\Accessibility\\ToggleKeys', 'Flags', SZ, '58', '62'],
        ['HKCU\\Control Panel\\Accessibility\\Keyboard Response', 'Flags', SZ, '122', '126']
      ]
    }),

    // ===================================== ENERGIA (lote 2)
    defineTweak({
      id: 'tweak:disablePowerThrottling', category: 'power', requiresAdmin: true, requiresReboot: true,
      title: 'Desativar o Power Throttling (limitação de apps em segundo plano)',
      description: 'O Windows reduz a CPU de programas em segundo plano para economizar energia (EcoQoS). Desligar ajuda quem grava, renderiza ou faz stream com o jogo em primeiro plano. Em notebooks a bateria dura menos.',
      rows: [['HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling', 'PowerThrottlingOff', DW, 1, null]]
    }),
    defineTweak({
      id: 'tweak:usbNoPowerDrainRecovery', category: 'power', risk: 'medium', requiresAdmin: true, requiresReboot: true,
      title: 'USB: não desligar a porta após sobrecarga de energia',
      description: 'Quando um dispositivo USB puxa corrente demais, o Windows desliga a porta e tenta recuperá-la, o que pode desconectar headsets, DACs e controles que têm picos de consumo. Use só se um dispositivo seu cai sozinho com o aviso "Falha de sobretensão na porta USB".',
      warning: 'A proteção existe por um motivo: se o dispositivo estiver mesmo em curto, a porta não será desligada.',
      rows: [['HKLM\\SYSTEM\\CurrentControlSet\\Control\\USB\\AutomaticSurpriseRemoval', 'AttemptRecoveryFromUsbPowerDrain', DW, 0, null]]
    }),

    // ===================================== GPU por fabricante (lote 2): só aparecem com a placa daquele fabricante
    gpuTweak(defineTweak, {
      id: 'tweak:amdDisableUlps',
      gpu: { vendor: 'amd', values: [['EnableULPS', DW, 0]] },
      title: 'AMD: desativar ULPS (economia de energia profunda)',
      description: 'Impede que a placa AMD entre no estado de energia ultrabaixo. Resolve telas pretas, travamentos ao acordar e oscilação de clock em CrossFire/multimonitor. A placa consome um pouco mais em repouso. Vale após reiniciar.'
    }),
    gpuTweak(defineTweak, {
      id: 'tweak:amdDisablePowerGating',
      gpu: { vendor: 'amd', values: [['DisablePowerGating', DW, 1], ['PP_GPUPowerDownEnabled', DW, 0], ['DisableDynamicPstate', DW, 1]] },
      title: 'AMD: desativar power gating e estados dinâmicos',
      description: 'Mantém os blocos da GPU AMD sempre energizados e sem troca dinâmica de estado de energia, o que reduz picos de latência ao mudar de carga. Mais consumo e temperatura em repouso. Vale após reiniciar.'
    }),
    gpuTweak(defineTweak, {
      id: 'tweak:amdDisableClockGating',
      gpu: { vendor: 'amd', values: [['DisableVCEPowerGating', DW, 1], ['DisableVceClockGating', DW, 1], ['EnableUvdClockGating', DW, 0], ['EnableVceSwClockGating', DW, 0]] },
      title: 'AMD: desativar clock gating do codificador de vídeo',
      description: 'Deixa o codificador/decodificador de vídeo da AMD (VCE/UVD) sempre ligado. Pode eliminar engasgos no início de gravações e streams. Consome um pouco mais em repouso. Vale após reiniciar.'
    }),
    gpuTweak(defineTweak, {
      id: 'tweak:amdDisableAspm',
      gpu: { vendor: 'amd', values: [['EnableAspmL0s', DW, 0], ['EnableAspmL1', DW, 0]] },
      title: 'AMD: desativar ASPM do PCIe na placa',
      description: 'Desliga a economia de energia do link PCIe da placa AMD (estados L0s/L1), evitando a latência de "acordar" o barramento. Vale após reiniciar.'
    }),
    gpuTweak(defineTweak, {
      id: 'tweak:nvidiaDisableDynamicPstate',
      gpu: { vendor: 'nvidia', values: [['DisableDynamicPstate', DW, 1]] },
      title: 'NVIDIA: desativar P-states dinâmicos',
      description: 'Mantém a placa NVIDIA no estado de desempenho máximo em vez de baixar o clock entre cenas. Reduz quedas de frametime ao alternar cargas. A placa fica mais quente e consome mais em repouso. Vale após reiniciar.'
    }),
    gpuTweak(defineTweak, {
      id: 'tweak:nvidiaDisableAsyncPstates',
      gpu: { vendor: 'nvidia', values: [['DisableASyncPstates', DW, 1]] },
      title: 'NVIDIA: desativar P-states assíncronos',
      description: 'Impede que memória e núcleo da placa NVIDIA troquem de estado de energia separadamente, o que pode causar micro-engasgos. Vale após reiniciar.'
    }),
    gpuTweak(defineTweak, {
      id: 'tweak:intelDisableAsyncFlips',
      gpu: { vendor: 'intel', values: [['Display1_DisableAsyncFlips', DW, 1]] },
      title: 'Intel: desativar async flips',
      description: 'Desliga a troca assíncrona de quadros do driver gráfico Intel, que em alguns jogos causa tearing ou cintilação. Vale após reiniciar.'
    }),
    gpuTweak(defineTweak, {
      id: 'tweak:intelDisableAdaptiveVsync',
      gpu: { vendor: 'intel', values: [['AdaptiveVsyncEnable', DW, 0]] },
      title: 'Intel: desativar V-Sync adaptativo do driver',
      description: 'Impede o driver Intel de ligar e desligar o V-Sync sozinho conforme o FPS, deixando o controle com o jogo. Vale após reiniciar.'
    })
  ];
}
