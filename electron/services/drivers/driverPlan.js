// Driver Center: automatic driver install (pure helpers).
//
// Everything here is free of OS / network access so it can be unit-tested: parsing of the PnP scan, the
// Windows Update search and the vendor lookups, the trust rules (hosts, Authenticode signers) and the
// selection of what "Install all recommended" installs. DriverInstallService.js does the I/O.

import { vendorFromPnpId, isGenericDisplayDriver, boardPartnerFromPnpId } from '../DriverCenterService.js'

export const VENDOR_LABEL = Object.freeze({ nvidia: 'NVIDIA', amd: 'AMD', intel: 'Intel' })

// ------------------------------------------------------------------ PnP problem codes
// CM_PROB_* codes (Device Manager "code N") that a driver can fix. 22 (disabled by the user), 24 (not present),
// 45 (not connected) and 47 (prepared for removal) are deliberately ignored: no driver fixes them.
const NO_DRIVER_CODES = new Set([1, 28])
const DRIVER_ERROR_CODES = new Set([3, 10, 18, 31, 37, 39, 40, 41, 43, 48, 52])
const RESTART_CODES = new Set([14, 21])

/** 'noDriver' | 'driverError' | 'restart' | null for a ConfigManagerErrorCode. */
export function problemReason(code) {
  const c = Number(code)
  if (!Number.isFinite(c) || c === 0) return null
  if (NO_DRIVER_CODES.has(c)) return 'noDriver'
  if (DRIVER_ERROR_CODES.has(c)) return 'driverError'
  if (RESTART_CODES.has(c)) return 'restart'
  return null
}

const asArray = (v) => (Array.isArray(v) ? v : (v === null || v === undefined || v === '' ? [] : [v]))
const str = (v) => String(v ?? '').trim()

/** PCI ids from a hardware/instance id: { ven, dev, subsys } (upper-case hex) or null. */
export function parsePciIds(id = '') {
  const s = String(id)
  const ven = /VEN_([0-9A-F]{4})/i.exec(s)?.[1]
  const dev = /DEV_([0-9A-F]{4})/i.exec(s)?.[1]
  if (!ven || !dev || !/^PCI\\/i.test(s)) return null
  return { ven: ven.toUpperCase(), dev: dev.toUpperCase(), subsys: (/SUBSYS_([0-9A-F]{8})/i.exec(s)?.[1] || '').toUpperCase() }
}

/**
 * Shapes one device from the scan. Display adapters are always reported (so the GPU section knows about
 * them); other classes only when their problem code is one a driver can fix.
 */
export function normalizeDevice(raw = {}) {
  const instanceId = str(raw.instanceId)
  const hardwareIds = asArray(raw.hardwareIds).map(str).filter(Boolean)
  const compatibleIds = asArray(raw.compatibleIds).map(str).filter(Boolean)
  const cls = str(raw.cls)
  const code = Number(raw.code) || 0
  const name = str(raw.name)
  const service = str(raw.service)
  const isDisplay = /^display$/i.test(cls)
  const pci = parsePciIds(hardwareIds[0] || instanceId)
  const vendor = pci ? vendorFromPnpId(`VEN_${pci.ven}`) : null
  // BasicDisplay is the service of "Microsoft Basic Display Adapter": the GPU has no vendor driver.
  const genericGpu = isDisplay && Boolean(VENDOR_LABEL[vendor]) && (/^basicdisplay$/i.test(service) || isGenericDisplayDriver(name, raw.provider))
  let reason = problemReason(code)
  if (!reason && genericGpu) reason = 'genericGpu'
  return {
    instanceId,
    name: name || instanceId,
    cls,
    code,
    reason,
    isDisplay,
    isGpu: isDisplay && Boolean(VENDOR_LABEL[vendor]),
    vendor: vendor || null,
    pci,
    boardPartner: pci ? boardPartnerFromPnpId(instanceId || hardwareIds[0]) : null,
    driverVersion: str(raw.driverVersion),
    hardwareIds,
    compatibleIds
  }
}

/** Shapes the raw scan JSON. Devices nobody needs to act on (healthy non-display) are dropped. */
export function normalizeScan(raw = {}) {
  const devices = asArray(raw.devices).map(normalizeDevice).filter((d) => d.reason || d.isDisplay)
  const wu = raw.wu || {}
  return {
    devices,
    missing: devices.filter((d) => d.reason && d.reason !== 'restart'),
    gpus: devices.filter((d) => d.isGpu),
    env: {
      osBuild: Number(raw.osBuild) || 0,
      laptop: Boolean(raw.laptop),
      cpu: str(raw.cpu)
    },
    wu: {
      serviceStatus: str(wu.status),
      // Raw "Start" value of the service key: 2 auto, 3 manual, 4 disabled.
      serviceStart: Number(wu.start) || 0,
      excludeDrivers: Number(wu.excludeDrivers) === 1,
      noInternetLocations: Number(wu.noInternet) === 1,
      wsus: Boolean(wu.wsus)
    }
  }
}

/**
 * What stops a Windows Update driver search on this machine. Each blocker can be lifted temporarily by the
 * elevated job (and is restored afterwards).
 */
export function wuBlockers(wu = {}) {
  const out = []
  if (Number(wu.serviceStart) === 4) out.push('serviceDisabled')
  if (wu.excludeDrivers) out.push('driversExcluded')
  if (wu.noInternetLocations) out.push('noInternetLocations')
  return out
}

// ------------------------------------------------------------------ Windows Update
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUpdateId = (id) => GUID_RE.test(String(id || ''))

/** Shapes the update list returned by the WUA search script. Bad / duplicate ids are dropped. */
export function normalizeWuUpdates(raw) {
  const seen = new Set()
  const out = []
  for (const u of asArray(raw)) {
    const id = str(u?.id).toLowerCase()
    if (!isUpdateId(id) || seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      title: str(u.title),
      driverClass: str(u.driverClass),
      hardwareId: str(u.hardwareId).toLowerCase(),
      manufacturer: str(u.manufacturer),
      model: str(u.model),
      date: str(u.date),
      sizeBytes: Number(u.size) || 0
    })
  }
  return out
}

/** Devices whose hardware or compatible ids include the update's target id. */
export function devicesForUpdate(update, devices = []) {
  const hw = String(update?.hardwareId || '').toLowerCase()
  if (!hw) return []
  return devices.filter((d) => [...d.hardwareIds, ...d.compatibleIds].some((id) => id.toLowerCase() === hw))
}

// ------------------------------------------------------------------ vendor sources
/** Hosts the packages themselves may come from (checked again after redirects). */
const PACKAGE_HOSTS = Object.freeze({
  nvidia: (h) => h === 'download.nvidia.com' || h.endsWith('.download.nvidia.com'),
  amd: (h) => h === 'drivers.amd.com',
  intel: (h) => h === 'downloadmirror.intel.com'
})

/** True for an https .exe URL on the vendor's official download host. */
export function isTrustedPackageUrl(url, vendor) {
  const check = PACKAGE_HOSTS[vendor]
  if (!check) return false
  try {
    const u = new URL(String(url))
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return false
    return check(u.hostname.toLowerCase()) && /\.exe$/i.test(u.pathname)
  } catch {
    return false
  }
}

/**
 * Authenticode signer rules. The subject's O= must be the vendor (seen on real packages:
 * "O=NVIDIA Corporation", "O=Advanced Micro Devices" / "Advanced Micro Devices, Inc.", "O=Intel Corporation").
 * Written so the same pattern works in JS and in PowerShell's -match (both case-insensitive here).
 */
export const SIGNER_PATTERNS = Object.freeze({
  nvidia: '(^|, )O=NVIDIA Corporation(,|$)',
  amd: '(^|, )O="?Advanced Micro Devices(,? Inc\\.?)?"?(,|$)',
  intel: '(^|, )O=Intel Corporation(,|$)'
})

/** True when the signature is valid and the signer is the vendor. */
export function isExpectedSigner(vendor, sig = {}) {
  const pattern = SIGNER_PATTERNS[vendor]
  if (!pattern) return false
  if (String(sig.status || '') !== 'Valid') return false
  return new RegExp(pattern, 'i').test(String(sig.subject || ''))
}

/** NVIDIA's lookup service (the one the GeForce/NVIDIA app uses): latest driver for a PCI device id. */
export function nvidiaLookupUrl(deviceId, { osBuild = 22631, laptop = false } = {}) {
  const dev = String(deviceId || '').toUpperCase()
  if (!/^[0-9A-F]{4}$/.test(dev)) return null
  const q = {
    dIDa: [`${dev}_10DE`], osC: '10.0', osB: String(Number(osBuild) || 22631), is6: '1', lg: '1033',
    iLp: laptop ? '1' : '0', prvMd: '0', gcV: '3.28.0.417', gIsB: '0', dch: '1', upCRD: '0', isCRD: '0'
  }
  return 'https://gfwsl.geforce.com/nvidia_web_services/controller.gfeclientcontent.NG.php/com.nvidia.services.GFEClientContent_NG.getDispDrvrByDevid/'
    + encodeURIComponent(JSON.stringify(q))
}

/** Parses the NVIDIA lookup answer: { version, url, name, date, whql } or null when unsupported. */
export function parseNvidiaLookup(json) {
  const j = typeof json === 'string' ? safeJson(json) : json
  if (!j || String(j?.criteria?.IsSupported?.state) !== 'true') return null
  const a = j.DriverAttributes || {}
  const url = str(a.DownloadURLAdmin) || str(a.DownloadURL)
  const version = str(a.Version)
  if (!version || !isTrustedPackageUrl(url, 'nvidia')) return null
  return { version, url, name: str(a.NameLocalized || a.Name) || 'NVIDIA driver', date: str(a.ReleaseDateTime).slice(0, 10), whql: String(a.IsWHQL) === '1' }
}

function safeJson(s) {
  try { return JSON.parse(s) } catch { return null }
}

/** NVIDIA's public version (621.01) from the Windows driver version (32.0.16.2101). */
export function nvidiaVersionFromWindows(v = '') {
  const parts = String(v).trim().split('.')
  if (parts.length !== 4) return ''
  const digits = `${parts[2]}${parts[3].padStart(4, '0')}`.slice(-5)
  if (!/^\d{5}$/.test(digits)) return ''
  return `${Number(digits.slice(0, 3))}.${digits.slice(3)}`
}

/** -1 / 0 / 1 for dotted numeric versions ('621.01' vs '582.78'). Missing parts count as 0. */
export function compareVersions(a = '', b = '') {
  const pa = String(a).split('.').map((x) => Number.parseInt(x, 10) || 0)
  const pb = String(b).split('.').map((x) => Number.parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d > 0 ? 1 : -1
  }
  return 0
}

export const AMD_DRIVERS_PAGE = 'https://www.amd.com/en/support/download/drivers.html'

/** The "auto-detect and install" (minimal setup) link from AMD's drivers page, or null. */
export function parseAmdDriversPage(html = '') {
  const urls = String(html).match(/https:\/\/drivers\.amd\.com\/drivers\/installer\/[^"'\s<>]+?minimalsetup[^"'\s<>]*?\.exe/gi) || []
  const url = urls.find((u) => isTrustedPackageUrl(u, 'amd'))
  if (!url) return null
  const version = /adrenalin-edition-([\d.]+)-minimalsetup/i.exec(url)?.[1] || ''
  return { url, version }
}

/** Intel driver pages per GPU family (each page carries a RecommendedDownloadUrl meta tag). */
export const INTEL_PAGES = Object.freeze({
  arc: 'https://www.intel.com/content/www/us/en/download/785597/intel-arc-iris-xe-graphics-windows.html',
  core11to14: 'https://www.intel.com/content/www/us/en/download/864990/intel-arc-graphics-windows.html',
  core7to10: 'https://www.intel.com/content/www/us/en/download/776137/intel-7th-10th-gen-processor-graphics-windows.html'
})

/**
 * Picks the Intel package family from the PCI device id (prefixes per GPU generation), falling back to the
 * CPU name for integrated graphics. null = not covered by a current package (left to Windows Update).
 */
export function intelPackageFor({ deviceId = '', cpu = '' } = {}) {
  const d = String(deviceId).toUpperCase()
  if (d) {
    // Arc Alchemist / Battlemage, Core Ultra (Meteor, Arrow, Lunar, Panther Lake), Wildcat Lake.
    if (/^(56[9AB]|E2[01]|7D[4-6D]|64[2AB]0|B0[89AB]|FD8)/.test(d)) return 'arc'
    // Tiger / Rocket / Alder / Raptor Lake, Twin Lake, Iris Xe DG1.
    if (/^(9A|4C[89]|46|A7|490)/.test(d)) return 'core11to14'
    // Kaby / Coffee / Whiskey / Comet / Ice / Amber Lake, Gemini / Apollo / Jasper / Elkhart Lake.
    if (/^(59|87C0|3E|9B|8A|318[45]|5A8|4E|45[57])/.test(d)) return 'core7to10'
  }
  const c = String(cpu)
  if (/core\(?t?m?\)? ultra/i.test(c)) return 'arc'
  if (/\bi[3579]-1[1-4]\d{3}/i.test(c)) return 'core11to14'
  if (/\bi[3579]-([7-9]\d{3}|10\d{3})/i.test(c)) return 'core7to10'
  return null
}

/** RecommendedDownloadUrl + DownloadVersion from an Intel download page, or null. */
export function parseIntelDownloadPage(html = '') {
  const meta = (name) => new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"`, 'i').exec(String(html))?.[1] || ''
  const url = meta('RecommendedDownloadUrl')
  if (!isTrustedPackageUrl(url, 'intel')) return null
  return { url, version: /^\d+(\.\d+)+/.exec(meta('DownloadVersion').trim())?.[0] || '', title: meta('title') }
}

/** Silent install switches per vendor. AMD's auto-detect tool has none: it runs with its own window. */
export function vendorInstallArgs(vendor, { clean = false } = {}) {
  if (vendor === 'nvidia') return ['-s', '-noreboot', '-noeula', ...(clean ? ['-clean'] : [])]
  if (vendor === 'intel') return ['-s', ...(clean ? ['--overwrite'] : [])]
  return []
}

export const vendorIsSilent = (vendor) => vendor === 'nvidia' || vendor === 'intel'

/** Process exit code -> { ok, reboot }. 3010 / 1641 are the Windows "success, restart needed" codes. */
export function interpretExitCode(code) {
  const c = Number(code)
  if (c === 0) return { ok: true, reboot: false }
  if (c === 3010 || c === 1641) return { ok: true, reboot: true }
  return { ok: false, reboot: false }
}

// ------------------------------------------------------------------ plan / selection
/**
 * Builds the install plan.
 *   devices:  normalizeScan().devices
 *   updates:  normalizeWuUpdates()
 *   vendor:   [{ vendor, deviceId, version, url, name, date, gpuName, needsDriver, installedVersion }]
 * Returns items [{ id, source: 'wu'|'vendor', title, ..., recommended, fixes: [instanceId] }].
 *
 * Rules: a Windows Update driver is recommended when it targets a device that needs a driver. A GPU on the
 * generic driver gets the vendor's silent package (NVIDIA, Intel) when one was found; then a Windows Update
 * display driver for the same GPU is kept as an alternative (not both). AMD's tool is interactive, so a WU
 * display driver wins for AMD and the tool is only recommended when Windows Update has nothing.
 */
export function buildPlan({ devices = [], updates = [], vendor = [] } = {}) {
  const items = []
  const needs = (d) => Boolean(d.reason && d.reason !== 'restart')
  const vendorFor = (gpu) => vendor.find((v) => v.vendor === gpu.vendor && v.deviceId === gpu.pci?.dev)

  for (const u of updates) {
    const targets = devicesForUpdate(u, devices)
    const fixes = targets.filter(needs).map((d) => d.instanceId)
    let recommended = fixes.length > 0
    let alternative = false
    // A GPU that gets the vendor's silent package does not also get the WU display driver.
    for (const d of targets) {
      const v = d.isGpu && vendorFor(d)
      if (v && vendorIsSilent(v.vendor) && needs(d)) { recommended = false; alternative = true }
    }
    items.push({
      id: `wu:${u.id}`,
      source: 'wu',
      title: u.title,
      device: targets[0]?.name || u.model || u.title,
      driverClass: u.driverClass,
      manufacturer: u.manufacturer,
      version: '',
      date: u.date,
      sizeBytes: u.sizeBytes,
      silent: true,
      fixes,
      recommended,
      alternative
    })
  }

  for (const v of vendor) {
    const gpu = devices.find((d) => d.isGpu && d.vendor === v.vendor && d.pci?.dev === v.deviceId)
    const gpuNeeds = gpu ? needs(gpu) : Boolean(v.needsDriver)
    const wuCovers = items.some((i) => i.source === 'wu' && gpu && i.fixes.includes(gpu.instanceId) && i.recommended)
    const silent = vendorIsSilent(v.vendor)
    const newer = v.installedVersion ? compareVersions(v.version, v.installedVersion) > 0 : true
    const recommended = gpuNeeds && (silent || !wuCovers)
    if (!gpuNeeds && !newer) continue // up to date: nothing to offer
    items.push({
      id: `vendor:${v.vendor}:${v.deviceId || 'any'}`,
      source: 'vendor',
      vendor: v.vendor,
      title: v.name || `${VENDOR_LABEL[v.vendor] || v.vendor} driver`,
      device: gpu?.name || v.gpuName || VENDOR_LABEL[v.vendor] || v.vendor,
      version: v.version,
      installedVersion: v.installedVersion || '',
      date: v.date || '',
      sizeBytes: Number(v.sizeBytes) || 0,
      silent,
      fixes: gpu && gpuNeeds ? [gpu.instanceId] : [],
      recommended,
      alternative: gpuNeeds && !recommended,
      updateAvailable: !gpuNeeds && newer
    })
  }
  return items
}

/** Ids "Install all recommended" installs. */
export function recommendedIds(items = []) {
  return items.filter((i) => i.recommended).map((i) => i.id)
}

/** Devices that still need a driver and that no item in the plan covers. */
export function uncoveredDevices(devices = [], items = []) {
  const covered = new Set(items.flatMap((i) => i.fixes || []))
  return devices.filter((d) => d.reason && d.reason !== 'restart' && !covered.has(d.instanceId))
}

// ------------------------------------------------------------------ progress protocol
const PROGRESS_STATUSES = new Set(['start', 'downloading', 'installing', 'verifying', 'ok', 'reboot', 'failed', 'skipped', 'launched', 'info'])

/**
 * One line written by the elevated job: DHP|<itemId>|<status>|<detail>. Returns { id, status, detail } or null.
 * itemId: wu:<guid>, vendor:<vendor>:<dev>, or one of restore / wuservice / job.
 */
export function parseProgressLine(line = '') {
  const m = /^DHP\|([A-Za-z0-9:._-]{1,80})\|([a-z]+)\|(.*)$/.exec(String(line).trim())
  if (!m || !PROGRESS_STATUSES.has(m[2])) return null
  return { id: m[1], status: m[2], detail: m[3].trim().slice(0, 500) }
}

/** Every progress line in a chunk of the progress file. */
export function parseProgressText(text = '') {
  return String(text).split(/\r?\n/).map(parseProgressLine).filter(Boolean)
}
