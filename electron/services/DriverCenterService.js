// Driver Center (DarkOS iteration 2).
//
// Detects the installed display adapters (GPU) and their current driver, and hands the user off to
// the OFFICIAL vendor download pages / auto-detect tools. DarkHub NEVER mirrors or bundles drivers:
// this is a management/handoff workflow. Only official vendor hosts may be opened (validated below).
//
// No `electron` import at module scope, so the pure helpers are unit-testable; the IPC layer injects
// `shell` for openExternal. PowerShell access is injected (`runner`) and defaults to PowerShellRunner.

import { runPowerShell, parseJsonOutput } from './PowerShellRunner.js'

/** Official, first-party driver sources per vendor (manual search, auto-detect tool, vendor app). */
export const OFFICIAL_SOURCES = Object.freeze({
  nvidia: {
    manual: 'https://www.nvidia.com/Download/index.aspx',
    autoDetect: 'https://www.nvidia.com/en-us/geforce/drivers/',
    app: 'https://www.nvidia.com/en-us/software/nvidia-app/'
  },
  amd: {
    manual: 'https://www.amd.com/en/support',
    autoDetect: 'https://www.amd.com/en/support/download/drivers.html',
    app: 'https://www.amd.com/en/products/software/adrenalin.html'
  },
  intel: {
    manual: 'https://www.intel.com/content/www/us/en/download-center/home.html',
    autoDetect: 'https://www.intel.com/content/www/us/en/support/detect.html',
    app: 'https://www.intel.com/content/www/us/en/support/products/80939/graphics.html'
  }
});

const VENDOR_HOSTS = Object.freeze({ nvidia: 'nvidia.com', amd: 'amd.com', intel: 'intel.com' });
const VALID_KINDS = Object.freeze(['manual', 'autoDetect', 'app']);

/** Maps an adapter name to a vendor id. Ryzen/Radeon -> amd, GeForce/RTX -> nvidia, Arc/UHD -> intel. */
export function classifyVendor(name = '') {
  const s = String(name).toLowerCase();
  if (/nvidia|geforce|\brtx\b|\bgtx\b|quadro|\btesla\b|titan|\bmx\d/.test(s)) return 'nvidia';
  if (/\bamd\b|radeon|\brx ?\d|vega|firepro|ryzen|\bgcn\b|rdna/.test(s)) return 'amd';
  if (/\bintel\b|\barc\b|\buhd\b|hd graphics|\biris\b|\bxe\b/.test(s)) return 'intel';
  if (/microsoft (basic|remote)|remote display|hyper-?v|parsec|virtual|vmware|citrix|\bddm\b/.test(s)) return 'virtual';
  return 'other';
}

/**
 * Vendor from the PCI id (PCI\VEN_10DE&DEV_...). Reliable even when Windows runs the GPU on the generic
 * "Microsoft Basic Display Adapter", whose name says nothing about the real card.
 */
export function vendorFromPnpId(pnpId = '') {
  const m = /VEN_([0-9A-F]{4})/i.exec(String(pnpId));
  if (!m) return null;
  switch (m[1].toUpperCase()) {
    case '10DE': return 'nvidia';
    case '1002': case '1022': return 'amd';
    case '8086': return 'intel';
    case '1414': case '1234': case '15AD': case '80EE': case '1AF4': case '1B36': return 'virtual'; // Hyper-V, QEMU, VMware, VirtualBox, virtio
    default: return null;
  }
}

/** True when the adapter runs on Windows' generic display driver instead of the vendor driver. */
export function isGenericDisplayDriver(name = '', provider = '') {
  return /microsoft basic (display|render)|basic display adapter|v[ií]deo b[aá]sico|adaptador de v[ií]deo b[aá]sico|standard vga/i.test(String(name))
    || (/^microsoft/i.test(String(provider).trim()) && /display|v[ií]deo|vga/i.test(String(name)));
}

const VENDOR_LABEL = Object.freeze({ nvidia: 'NVIDIA', amd: 'AMD', intel: 'Intel' });

/** The official sources for a vendor, or null for virtual/other adapters. */
export function officialSourcesFor(vendor) {
  return OFFICIAL_SOURCES[vendor] || null;
}

/** Defense in depth: the Driver Center may only ever open https URLs on official vendor hosts. */
export function isOfficialDriverUrl(url) {
  try {
    const u = new URL(String(url));
    if (u.protocol !== 'https:') return false;
    // No embedded credentials or non-default ports (https://www.nvidia.com@evil.tld is parsed as host evil.tld anyway).
    if (u.username || u.password || u.port) return false;
    const host = u.hostname.toLowerCase();
    return Object.values(VENDOR_HOSTS).some((h) => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

/** Shapes one raw adapter record (from WMI) into the UI model, attaching vendor + official sources. */
export function normalizeAdapter(raw = {}) {
  const model = String(raw.name ?? raw.Name ?? '').trim();
  const pnpId = String(raw.pnpId ?? '').trim();
  const provider = String(raw.provider ?? '').trim();
  const byPci = vendorFromPnpId(pnpId);
  const vendor = byPci || classifyVendor(model); // the PCI id is authoritative; the name is only a fallback
  const genericDriver = Boolean(VENDOR_LABEL[vendor]) && isGenericDisplayDriver(model, provider);
  const vramMb = Number(raw.vramMb ?? 0) || 0;
  const devId = /VEN_[0-9A-F]{4}&DEV_[0-9A-F]{4}/i.exec(pnpId)?.[0]?.toUpperCase() || '';
  return {
    // The generic driver hides the real model: name the vendor so the user knows which driver to get.
    model: genericDriver ? `Placa ${VENDOR_LABEL[vendor]} (driver genérico da Microsoft)` : (model || 'Adaptador desconhecido'),
    vendor,
    genericDriver,
    deviceId: devId,
    driverVersion: String(raw.driverVersion ?? '').trim(),
    driverDate: String(raw.driverDate ?? '').trim(),
    driverProvider: provider,
    videoProcessor: String(raw.videoProcessor ?? '').trim(),
    pnpId,
    vramMb,
    status: String(raw.status ?? '').trim(),
    problem: String(raw.problem ?? '').trim(),
    isDedicated: vramMb >= 1024 || vendor === 'nvidia',
    officialSources: officialSourcesFor(vendor)
  };
}

const DETECT_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$pnp = @{}
foreach ($d in (Get-PnpDevice -Class Display -ErrorAction SilentlyContinue)) {
  $pnp[$d.FriendlyName] = @{ status = "$($d.Status)"; problem = "$($d.Problem)" }
}
# Win32_VideoController.AdapterRAM is a uint32 (caps at 4 GB); the display class key has the real 64-bit size.
$vram = @{}
foreach ($k in (Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}' -ErrorAction SilentlyContinue)) {
  $kp = Get-ItemProperty -LiteralPath $k.PSPath -ErrorAction SilentlyContinue
  if (-not $kp -or -not $kp.DriverDesc) { continue }
  $q = $kp.'HardwareInformation.qwMemorySize'
  if ($q -is [long] -or $q -is [int] -or $q -is [uint64]) { $vram["$($kp.DriverDesc)"] = [int64]$q }
}
$adapters = foreach ($g in (Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue)) {
  $p = $pnp[$g.Name]
  $bytes = if ($vram["$($g.Name)"]) { $vram["$($g.Name)"] } elseif ($g.AdapterRAM) { [int64]$g.AdapterRAM } else { 0 }
  [pscustomobject]@{
    name = "$($g.Name)"
    driverVersion = "$($g.DriverVersion)"
    driverDate = if ($g.DriverDate) { $g.DriverDate.ToString('yyyy-MM-dd') } else { '' }
    provider = "$($g.AdapterCompatibility)"
    videoProcessor = "$($g.VideoProcessor)"
    pnpId = "$($g.PNPDeviceID)"
    vramMb = [int64]([math]::Round($bytes / 1MB, 0))
    status = if ($p) { $p.status } else { "$($g.Status)" }
    problem = if ($p) { $p.problem } else { '' }
  }
}
$cbs = Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending'
$wu = Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired'
[pscustomobject]@{ adapters = @($adapters); rebootPending = [bool]($cbs -or $wu) } | ConvertTo-Json -Depth 4 -Compress
`;

// ---------------------------------------------------------------- camera / screen capture
// Read-only snapshot of everything that usually breaks the webcam (and screenshots) on DarkOS-style builds.
const CAMERA_STATUS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$devs = @(Get-PnpDevice -Class Camera,Image -PresentOnly | ForEach-Object { [pscustomobject]@{ name = "$($_.FriendlyName)"; status = "$($_.Status)"; problem = "$($_.Problem)"; cls = "$($_.Class)" } })
$ghost = @(Get-PnpDevice -Class USB -PresentOnly | Where-Object { $_.Status -eq 'Error' -or $_.InstanceId -like 'USB\\VID_0000*' }).Count
$svcs = @(foreach ($n in 'camsvc','FrameServer','FrameServerMonitor','stisvc') { $s = Get-Service -Name $n; if ($s) { [pscustomobject]@{ name = $n; status = "$($s.Status)"; start = "$($s.StartType)" } } })
$cap = @(Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Services' | Where-Object { $_.PSChildName -match '^(CaptureService|DevicesFlowUserSvc)' } | ForEach-Object { [pscustomobject]@{ name = $_.PSChildName; start = [int](Get-ItemProperty -LiteralPath $_.PSPath).Start } })
$cs = 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\webcam'
$consent = [pscustomobject]@{
  machine = "$((Get-ItemProperty "HKLM:\\$cs").Value)"
  user = "$((Get-ItemProperty "HKCU:\\$cs").Value)"
  desktopApps = "$((Get-ItemProperty "HKCU:\\$cs\\NonPackaged").Value)"
}
$pol = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\AppPrivacy').LetAppsAccessCamera
$allow = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Camera').AllowCamera
[pscustomobject]@{
  devices = $devs; ghostUsb = $ghost; services = $svcs; captureServices = $cap; consent = $consent
  policyDeny = ($pol -eq 2); cameraPolicyOff = ($null -ne $allow -and $allow -eq 0)
  cameraApp = [bool](Get-AppxPackage -Name Microsoft.WindowsCamera)
} | ConvertTo-Json -Depth 4 -Compress
`;

// Elevated repair: services, privacy consent, policies, screen-capture permissions, USB re-enumeration.
// Same steps as the DarkOS desktop scripts, without machine-specific driver paths or an Explorer restart.
const CAMERA_REPAIR_SCRIPT = `
$ErrorActionPreference = 'Continue'
function Step([string]$m) { Write-Output ('DHSTEP|' + $m) }
Step 'Servicos de captura e fluxo de dispositivos (Start = Manual)'
foreach ($base in 'CaptureService','DevicesFlowUserSvc') {
  Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Services' -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -eq $base -or $_.PSChildName -like "$($base)_*" } |
    ForEach-Object { Set-ItemProperty -LiteralPath $_.PSPath -Name Start -Value 3 -Type DWord -Force -ErrorAction SilentlyContinue }
}
Step 'Pilha da camera do Windows (camsvc, FrameServer, WIA)'
foreach ($n in 'camsvc','FrameServer','FrameServerMonitor','stisvc') {
  if (Get-Service -Name $n -ErrorAction SilentlyContinue) {
    Set-Service -Name $n -StartupType $(if ($n -eq 'camsvc') { 'Automatic' } else { 'Manual' }) -ErrorAction SilentlyContinue
    Start-Service -Name $n -ErrorAction SilentlyContinue
  }
}
Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'CaptureService*' } | Start-Service -ErrorAction SilentlyContinue
Step 'Permissoes de privacidade da camera (apps e navegadores)'
$cs = 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\webcam'
foreach ($p in "HKLM:\\$cs", "HKLM:\\$cs\\NonPackaged", "HKCU:\\$cs", "HKCU:\\$cs\\NonPackaged") {
  if (-not (Test-Path $p)) { New-Item -Path $p -Force | Out-Null }
  Set-ItemProperty -Path $p -Name Value -Value 'Allow' -Type String -Force
}
$ap = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\AppPrivacy'
if (Test-Path $ap) {
  Remove-ItemProperty -Path $ap -Name LetAppsAccessCamera -ErrorAction SilentlyContinue
  Set-ItemProperty -Path $ap -Name LetAppsAccessGraphicsCaptureProgrammatic -Value 1 -Type DWord -Force
  Set-ItemProperty -Path $ap -Name LetAppsAccessGraphicsCaptureWithoutBorder -Value 1 -Type DWord -Force
}
if (Test-Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Camera') { Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Camera' -Name AllowCamera -Value 1 -Type DWord -Force }
Step 'Ferramenta de Captura liberada'
foreach ($k in 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\TabletPC','HKLM:\\SOFTWARE\\Policies\\Microsoft\\TabletPC') { Remove-ItemProperty -Path $k -Name DisableSnippingTool -ErrorAction SilentlyContinue }
Step 'Suspensao seletiva USB desligada (evita erro de descritor, codigo 43)'
& powercfg.exe /setacvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0 2>&1 | Out-Null
& powercfg.exe /setdcvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0 2>&1 | Out-Null
& powercfg.exe /setactive SCHEME_CURRENT 2>&1 | Out-Null
Step 'Driver UVC do Windows e nova varredura de dispositivos'
if (Test-Path "$env:WINDIR\\INF\\usbvideo.inf") { & pnputil.exe /add-driver "$env:WINDIR\\INF\\usbvideo.inf" /install 2>&1 | Out-Null }
foreach ($d in @(Get-PnpDevice -Class USB -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Error' -or $_.InstanceId -like 'USB\\VID_0000*' })) { & pnputil.exe /remove-device "$($d.InstanceId)" 2>&1 | Out-Null }
& pnputil.exe /scan-devices 2>&1 | Out-Null
Start-Sleep -Seconds 3
Write-Output 'DHDONE'
`;

// DarkOS catalog items that switch off what the camera / capture stack needs (reverted through the DarkOS module).
export const DARKOS_CAMERA_ITEMS = Object.freeze([
  'svc.lean.user.captureservice', 'svc.lean.user.devicesflowusersvc', 'svc.stisvc.manual',
  'perf.backgroundApps.off', 'perf.backgroundApps.policyOff'
]);

/** Turns the raw status snapshot into plain-language issues (empty array = nothing blocking the camera). */
export function cameraIssues(s = {}) {
  const issues = [];
  const devices = Array.isArray(s.devices) ? s.devices : (s.devices ? [s.devices] : []);
  if (!devices.length) issues.push('Nenhuma câmera conectada foi detectada pelo Windows.');
  for (const d of devices) if (String(d.status).toUpperCase() !== 'OK') issues.push(`${d.name || 'Câmera'}: ${d.problem || d.status} (driver ausente ou com erro).`);
  const services = Array.isArray(s.services) ? s.services : (s.services ? [s.services] : []);
  for (const v of services) if (/disabled/i.test(v.start)) issues.push(`Serviço ${v.name} desativado.`);
  const caps = Array.isArray(s.captureServices) ? s.captureServices : (s.captureServices ? [s.captureServices] : []);
  if (caps.some((c) => Number(c.start) === 4)) issues.push('Serviço de captura (CaptureService) desativado: prints e câmera em navegadores podem falhar.');
  const consent = s.consent || {};
  if (/deny/i.test(consent.machine) || /deny/i.test(consent.user)) issues.push('Acesso à câmera negado nas configurações de privacidade.');
  if (/deny/i.test(consent.desktopApps)) issues.push('Apps de desktop (navegadores, Discord) sem permissão de câmera.');
  if (s.policyDeny) issues.push('Política do sistema bloqueia o acesso dos apps à câmera.');
  if (s.cameraPolicyOff) issues.push('Política do sistema desativa a câmera.');
  if (Number(s.ghostUsb) > 0) issues.push(`${s.ghostUsb} dispositivo(s) USB com falha (código 43): reconecte a câmera após o reparo.`);
  return issues;
}

export class DriverCenterService {
  constructor({ runner, elevatedRunner } = {}) {
    // Injected for tests; defaults to the shared PowerShell runner.
    this._runner = runner || ((script, opts) => runPowerShell(script, opts));
    this._elevated = elevatedRunner || null;
  }

  /** Read-only camera / capture diagnosis. */
  async cameraStatus() {
    if (process.platform !== 'win32') return { ok: false, error: 'Disponível apenas no Windows.' };
    let parsed = null;
    try {
      const res = await this._runner(CAMERA_STATUS_SCRIPT, { timeoutMs: 30000, trim: true });
      parsed = parseJsonOutput(res?.stdout, null);
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
    if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'Não foi possível ler o estado da câmera.' };
    const devices = Array.isArray(parsed.devices) ? parsed.devices : (parsed.devices ? [parsed.devices] : []);
    return { ok: true, devices, cameraApp: Boolean(parsed.cameraApp), issues: cameraIssues(parsed) };
  }

  /**
   * Elevated repair. `darkosRevert(ids)` (optional) undoes the DarkOS catalog items that block the camera first.
   * Returns the steps that ran and a fresh diagnosis.
   */
  async repairCamera({ darkosRevert } = {}) {
    if (process.platform !== 'win32') return { ok: false, error: 'Disponível apenas no Windows.' };
    if (!this._elevated) return { ok: false, error: 'Reparo indisponível (sem elevação).' };
    const steps = [];
    if (typeof darkosRevert === 'function') {
      const r = await darkosRevert([...DARKOS_CAMERA_ITEMS]).catch((e) => ({ ok: false, error: e?.message }));
      steps.push(r?.ok === false ? `DarkOS: ${r.error || 'não foi possível desfazer os bloqueios'}` : 'DarkOS: bloqueios de câmera e captura desfeitos');
    }
    const res = await this._elevated(CAMERA_REPAIR_SCRIPT, { timeoutMs: 180000 });
    const out = String(res?.stdout || '');
    for (const m of out.matchAll(/^DHSTEP\|(.+)$/gm)) steps.push(m[1].trim());
    if (!/DHDONE/.test(out)) return { ok: false, steps, error: (res?.stderr || '').trim() || 'O reparo não terminou (a permissão de administrador foi negada?).' };
    const after = await this.cameraStatus();
    return { ok: true, steps, ...(after.ok ? { devices: after.devices, issues: after.issues, cameraApp: after.cameraApp } : {}) };
  }

  /** Detects every display adapter, its installed driver, and whether a reboot is pending. */
  async detectAdapters() {
    if (process.platform !== 'win32') {
      return { ok: false, error: 'A detecção de drivers só está disponível no Windows.', adapters: [], rebootPending: false };
    }
    let res;
    let parsed = null;
    try {
      res = await this._runner(DETECT_SCRIPT, { timeoutMs: 20000, trim: true });
      parsed = parseJsonOutput(res?.stdout, null);
    } catch (e) {
      // Runner timeout/spawn failure or non-JSON output: report it instead of throwing into IPC.
      const msg = String(e?.message ?? e);
      return { ok: false, error: /timed out/i.test(msg) ? 'Tempo limite excedido ao detectar os adaptadores de vídeo.' : msg, adapters: [], rebootPending: false };
    }
    if (!parsed || typeof parsed !== 'object') {
      const err = (res?.stderr || '').trim();
      return { ok: false, error: err || 'Não foi possível ler os adaptadores de vídeo.', adapters: [], rebootPending: false };
    }
    const rawList = Array.isArray(parsed.adapters) ? parsed.adapters : (parsed.adapters ? [parsed.adapters] : []);
    const adapters = rawList.map(normalizeAdapter);
    return { ok: true, adapters, rebootPending: Boolean(parsed.rebootPending) };
  }

  /** Resolves an official vendor URL for (vendor, kind) and validates it before any handoff. */
  resolveOfficialUrl(vendor, kind = 'manual') {
    const v = String(vendor || '').toLowerCase();
    const k = VALID_KINDS.includes(kind) ? kind : 'manual';
    const src = OFFICIAL_SOURCES[v];
    if (!src) return { ok: false, error: `Sem fonte oficial de driver para "${vendor}".` };
    const url = src[k] || src.manual;
    if (!isOfficialDriverUrl(url)) return { ok: false, error: 'URL de driver não oficial bloqueada.' };
    return { ok: true, url, vendor: v, kind: k };
  }
}

export default DriverCenterService;
