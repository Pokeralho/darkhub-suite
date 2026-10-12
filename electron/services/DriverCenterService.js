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

/** The official sources for a vendor, or null for virtual/other adapters. */
export function officialSourcesFor(vendor) {
  return OFFICIAL_SOURCES[vendor] || null;
}

/** Defense in depth: the Driver Center may only ever open https URLs on official vendor hosts. */
export function isOfficialDriverUrl(url) {
  try {
    const u = new URL(String(url));
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return Object.values(VENDOR_HOSTS).some((h) => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

/** Shapes one raw adapter record (from WMI) into the UI model, attaching vendor + official sources. */
export function normalizeAdapter(raw = {}) {
  const model = String(raw.name ?? raw.Name ?? '').trim();
  const vendor = classifyVendor(model);
  const vramMb = Number(raw.vramMb ?? 0) || 0;
  return {
    model: model || 'Adaptador desconhecido',
    vendor,
    driverVersion: String(raw.driverVersion ?? '').trim(),
    driverDate: String(raw.driverDate ?? '').trim(),
    driverProvider: String(raw.provider ?? '').trim(),
    videoProcessor: String(raw.videoProcessor ?? '').trim(),
    pnpId: String(raw.pnpId ?? '').trim(),
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
$adapters = foreach ($g in (Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue)) {
  $p = $pnp[$g.Name]
  [pscustomobject]@{
    name = "$($g.Name)"
    driverVersion = "$($g.DriverVersion)"
    driverDate = if ($g.DriverDate) { $g.DriverDate.ToString('yyyy-MM-dd') } else { '' }
    provider = "$($g.AdapterCompatibility)"
    videoProcessor = "$($g.VideoProcessor)"
    pnpId = "$($g.PNPDeviceID)"
    vramMb = if ($g.AdapterRAM) { [int64]([math]::Round($g.AdapterRAM / 1MB, 0)) } else { 0 }
    status = if ($p) { $p.status } else { "$($g.Status)" }
    problem = if ($p) { $p.problem } else { '' }
  }
}
$cbs = Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending'
$wu = Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired'
[pscustomobject]@{ adapters = @($adapters); rebootPending = [bool]($cbs -or $wu) } | ConvertTo-Json -Depth 4 -Compress
`;

export class DriverCenterService {
  constructor({ runner } = {}) {
    // Injected for tests; defaults to the shared PowerShell runner.
    this._runner = runner || ((script, opts) => runPowerShell(script, opts));
  }

  /** Detects every display adapter, its installed driver, and whether a reboot is pending. */
  async detectAdapters() {
    if (process.platform !== 'win32') {
      return { ok: false, error: 'A detecção de drivers só está disponível no Windows.', adapters: [], rebootPending: false };
    }
    const res = await this._runner(DETECT_SCRIPT, { timeoutMs: 20000, trim: true });
    const parsed = parseJsonOutput(res?.stdout, null);
    if (!parsed) {
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
