// Driver Center: Microsoft Update Catalog source (pure helpers, no OS / network access).
//
// The catalog (https://www.catalog.update.microsoft.com) is the public site behind Windows Update's driver
// library. It answers a search by hardware id with the published driver packages and gives, for each one, the
// .cab on Microsoft's download servers together with its SHA-256. It needs none of the Windows Update client
// pieces (wuauserv, BITS, Delivery Optimization), so it covers two cases the WUA route cannot:
//   - a device Windows Update offers nothing for (the catalog also lists drivers WU does not push), and
//   - a PC where the Windows Update client finds the driver but cannot download it.
// DriverInstallService.js does the I/O; the .cab is installed with pnputil after its catalogs are checked.

export const CATALOG_ORIGIN = 'https://www.catalog.update.microsoft.com'
export const CATALOG_DOWNLOAD_URL = `${CATALOG_ORIGIN}/DownloadDialog.aspx`

const GUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const GUID_RE = new RegExp(`^${GUID}$`, 'i')
export const isCatalogId = (id) => GUID_RE.test(String(id || ''))

export const catalogSearchUrl = (query) => `${CATALOG_ORIGIN}/Search.aspx?q=${encodeURIComponent(String(query))}`
export const catalogDetailsUrl = (id) => `${CATALOG_ORIGIN}/ScopedViewInline.aspx?updateid=${encodeURIComponent(String(id))}`

/** Form body of the "Download" dialog for one update id. */
export function catalogDownloadBody(id) {
  const v = String(id)
  return `updateIDs=${encodeURIComponent(JSON.stringify([{ size: 0, languages: '', uidInfo: v, updateID: v }]))}`
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
function text(html = '') {
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

/** '2/21/2024' (the catalog's fixed en-US format) -> '2024-02-21'; anything else -> ''. */
export function catalogDate(s = '') {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s).trim())
  if (!m) return ''
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
}

/** Rows of a search result page: [{ id, title, products, classification, date, version, sizeBytes }]. */
export function parseCatalogSearch(html = '') {
  const out = []
  const seen = new Set()
  const rowRe = new RegExp(`<tr id="(${GUID})_R\\d+"[^>]*>([\\s\\S]*?)</tr>`, 'gi')
  for (const m of String(html).matchAll(rowRe)) {
    const id = m[1].toLowerCase()
    if (seen.has(id)) continue
    const cells = [...m[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1])
    if (cells.length < 7) continue
    seen.add(id)
    const version = text(cells[5])
    out.push({
      id,
      title: text(cells[1]),
      products: text(cells[2]),
      classification: text(cells[3]),
      date: catalogDate(text(cells[4])),
      version: /^n\/a$/i.test(version) ? '' : version,
      sizeBytes: Number(/_originalSize"[^>]*>\s*(\d+)/i.exec(cells[6])?.[1]) || 0
    })
  }
  return out
}

/** Details page of one update: { title, architectures[], hardwareIds[], version, date, driverClass, model, provider }. */
export function parseCatalogDetails(html = '') {
  const s = String(html)
  const span = (id) => text(new RegExp(`<span id="ScopedViewHandler_${id}"[^>]*>([\\s\\S]*?)</span>`, 'i').exec(s)?.[1] || '')
  const arch = /<div id="archDiv">[\s\S]*?<\/span>([\s\S]*?)<\/div>/i.exec(s)?.[1] || ''
  const hwStart = s.search(/id="driverhwIDs"/i)
  let hardwareIds = []
  if (hwStart >= 0) {
    const rest = s.slice(hwStart)
    const end = rest.search(/class="tabBodyContentBox/i)
    const block = end > 0 ? rest.slice(0, end) : rest
    hardwareIds = [...block.matchAll(/<div[^>]*>\s*([^<]+?)\s*<\/div>/gi)].map((m) => text(m[1]).toLowerCase()).filter(Boolean)
  }
  return {
    title: span('titleText'),
    architectures: text(arch).split(/[,\s]+/).map((a) => a.toUpperCase()).filter((a) => a && a !== 'N/A'),
    hardwareIds: [...new Set(hardwareIds)],
    version: span('version'),
    date: catalogDate(span('versionDate')),
    driverClass: span('driverClass'),
    model: span('driverModel'),
    provider: span('driverProvider') || span('driverManufacturer')
  }
}

/** Hosts Microsoft serves catalog packages from (checked again after redirects). */
export function isCatalogHost(url) {
  try {
    const u = new URL(String(url))
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return false
    const h = u.hostname.toLowerCase()
    return h === 'download.windowsupdate.com' || h.endsWith('.download.windowsupdate.com') || h.endsWith('.dl.delivery.mp.microsoft.com')
  } catch {
    return false
  }
}

/** True for an https .cab on one of Microsoft's download hosts. */
export function isCatalogPackageUrl(url) {
  if (!isCatalogHost(url)) return false
  return /\.cab$/i.test(new URL(String(url)).pathname)
}

/**
 * Files of the "Download" dialog: [{ url, sha256, fileName }] (sha256 in lower-case hex). A file without a
 * SHA-256, or outside Microsoft's download hosts, or that is not a .cab, is dropped: nothing unverifiable runs.
 */
export function parseCatalogDownload(body = '') {
  const files = new Map()
  const re = /downloadInformation\[(\d+)\]\.files\[(\d+)\]\.(url|sha256|fileName)\s*=\s*'([^']*)'/g
  for (const m of String(body).matchAll(re)) {
    const key = `${m[1]}.${m[2]}`
    if (!files.has(key)) files.set(key, {})
    files.get(key)[m[3]] = m[4]
  }
  const out = []
  for (const f of files.values()) {
    if (!isCatalogPackageUrl(f.url)) continue
    let hex = ''
    try { hex = Buffer.from(String(f.sha256 || ''), 'base64').toString('hex') } catch { hex = '' }
    if (hex.length !== 64) continue
    const fileName = String(f.fileName || new URL(f.url).pathname.split('/').pop() || '').replace(/[^A-Za-z0-9._-]/g, '_').slice(-120)
    if (!/\.cab$/i.test(fileName)) continue
    out.push({ url: f.url, sha256: hex, fileName })
  }
  return out
}

// ------------------------------------------------------------------ which package fits this Windows
const WIN11_FLOOR = Object.freeze({ '21H2': 22000, '22H2': 22621, '23H2': 22631, '24H2': 26100, '25H2': 26200, '26H1': 28000 })
const WIN10_FLOOR = Object.freeze({ 1507: 10240, 1511: 10586, 1607: 14393, 1703: 15063, 1709: 16299, 1803: 17134, 1809: 17763, 1903: 18362, 1909: 18363, 2004: 19041 })

/**
 * Lowest client build each product name in a "Products" cell applies to. Server, S mode, Windows 8.1 and older
 * and names this table does not know are ignored (an unknown future name is not guessed).
 */
export function productFloors(products = '') {
  const s = String(products)
  const floors = []
  for (const m of s.matchAll(/Windows 11 Client, version (\d\dH\d) and later/gi)) floors.push(WIN11_FLOOR[m[1].toUpperCase()])
  if (/Windows - Client, version 21H2 and later/i.test(s)) floors.push(22000)
  if (/Windows 10, Vibranium and later/i.test(s)) floors.push(19041)
  for (const m of s.matchAll(/Windows 10,? version (\d{4}) and later/gi)) floors.push(WIN10_FLOOR[m[1]])
  if (/Windows 10 Fall Creators Update and later/i.test(s)) floors.push(16299)
  if (/(?<!Fall )Creators Update and later/i.test(s)) floors.push(15063)
  if (/Windows 10 Anniversary Update and later/i.test(s)) floors.push(14393)
  if (/Windows 10 and later (drivers|upgrade)/i.test(s)) floors.push(10240)
  return floors.filter((n) => Number.isFinite(n))
}

/** Highest floor this build satisfies (a "Windows 10 ... and later" driver also serves Windows 11), or 0. */
export function productFloorFor(products, osBuild) {
  const build = Number(osBuild) || 0
  if (build < 10240) return 0
  return Math.max(0, ...productFloors(products).filter((f) => f <= build))
}

/**
 * Never taken from the catalog: firmware (a failed flash can brick the device), and extension / software
 * component INFs (they add to a base driver and do not make a device without one work).
 */
export function isInstallableRow(row = {}) {
  if (!/^Drivers\b/i.test(String(row.classification || ''))) return false
  if (/firmware/i.test(`${row.classification} ${row.title}`)) return false
  if (/\s-\s(Extension|SoftwareComponent)\s-\s/i.test(String(row.title || ''))) return false
  return true
}

/**
 * Candidates for this Windows build, best first: newest publication, then the package aimed at the newest
 * Windows this build satisfies. preferTitle (the Windows Update title of the same driver) wins over both.
 */
export function rankCatalogRows(rows = [], { osBuild = 0, preferTitle = '' } = {}) {
  const want = String(preferTitle).replace(/\s+/g, ' ').trim().toLowerCase()
  return rows
    .filter(isInstallableRow)
    .map((r) => ({ ...r, floor: productFloorFor(r.products, osBuild), same: Boolean(want) && r.title.toLowerCase() === want }))
    .filter((r) => r.floor > 0)
    .sort((a, b) => Number(b.same) - Number(a.same) || b.date.localeCompare(a.date) || b.floor - a.floor)
}

// ------------------------------------------------------------------ which ids to search for
/**
 * Ids worth a catalog search for a device, most specific first (at most `max`). Left out: class-only ids
 * (CC_, Class_: they match generic drivers Windows already has), a bare vendor id, revision-qualified ids
 * (the search matches word by word, so the same id without the revision returns those packages too), empty
 * subsystem ids and UEFI firmware resources. The match itself is made against every id of the device.
 */
export function catalogQueries(device = {}, max = 2) {
  const out = []
  for (const raw of [...(device.hardwareIds || []), ...(device.compatibleIds || [])]) {
    const id = String(raw || '').trim()
    if (!id || id.length > 120 || /\s/.test(id)) continue
    if (/^UEFI\\/i.test(id)) continue
    if (/[\\&](CC_|CLASS_|SUBCLASS_|PROT_)/i.test(id)) continue
    if (/&REV_/i.test(id)) continue
    if (/SUBSYS_0{8}/i.test(id)) continue
    if (/^PCI\\VEN_[0-9A-F]{4}$/i.test(id)) continue
    if (/^(USB\\(ROOT|COMPOSITE|UNKNOWN)|ROOT\\|HTREE\\|SWD\\|STORAGE\\|SCSI\\|MONITOR\\Default)/i.test(id)) continue
    const specific = /(VEN_|VID_|DEV_|PID_)[0-9A-Z]{3,}/i.test(id) || /^(ACPI\\|\*)[A-Z0-9]{7,8}$/i.test(id)
    if (!specific) continue
    if (!out.some((x) => x.toLowerCase() === id.toLowerCase())) out.push(id)
    if (out.length >= max) break
  }
  return out
}

/** Position of the first of the device's ids the package lists (lower = more specific), or -1. */
export function matchRank(device = {}, packageHardwareIds = []) {
  const listed = new Set(packageHardwareIds.map((h) => String(h).toLowerCase()))
  const ids = [...(device.hardwareIds || []), ...(device.compatibleIds || [])].map((h) => String(h).toLowerCase())
  return ids.findIndex((h) => listed.has(h))
}

/** True when the details page says the package is for this CPU architecture and lists one of the ids. */
export function detailsFit(details, { arch = 'AMD64', ids = [] } = {}) {
  if (!details) return false
  const a = String(arch || 'AMD64').toUpperCase()
  if (!details.architectures.includes(a)) return false
  const listed = new Set(details.hardwareIds)
  return ids.some((h) => listed.has(String(h).toLowerCase()))
}
