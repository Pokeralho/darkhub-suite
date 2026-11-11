// Real PSU efficiency from the 80 PLUS program (CLEAResult), looked up on demand. Nothing is bundled.
//
// SOURCE (verified 2026-11-11 with real responses):
//   https://www.clearesult.com/80plus/sites/80plus/files/manufacturer_json/manufacturer_details.json
//   The file the program's own "manufacturers" pages load in the browser: one object keyed by record id, each record a
//   certified unit with field_manufacturer_name, field_modal_number (sic), field_wattage_value, field_certificate_rating,
//   field_product_type ("115V Internal", "230V EU Internal", "230V Internal", ...), field_10_percent / 20 / 50 / 100
//   ("87.99%" or "-"), field_date_certified and the certificate PDF path. About 14.8 MB uncompressed, ~14.8k records.
//   It is not a documented API: if the format changes, parsing fails closed (an error, never made-up numbers).
// TERMS: the site states "Copyright (c) CLEAResult. All Rights Reserved." and grants no licence to redistribute the
//   data, so the dataset is never shipped with DarkHub. The user asks for it; the main process downloads it (HTTPS,
//   host allow-list on every redirect, size cap, timeout), keeps only the fields below in userData as a private cache,
//   and every result links back to the program.
//
// VOLTAGE: 80 PLUS certifies desktop PSUs at 115 V ("115V Internal"); some are also certified at 230 V. For 230 V the
//   desktop category is "230V EU Internal"; "230V Internal" is the redundant/data-center category. Mains of 100-127 V
//   use the 115 V data, 220-240 V the 230 V data when it exists (otherwise the 115 V data, flagged).

import fs from 'node:fs'
import path from 'node:path'

export const CATALOG_URL = 'https://www.clearesult.com/80plus/sites/80plus/files/manufacturer_json/manufacturer_details.json'
export const CATALOG_HOSTS = Object.freeze(['www.clearesult.com'])
export const CATALOG_PAGE = 'https://www.clearesult.com/80plus/manufacturers'
export const CATALOG_MAX_BYTES = 40 * 1024 * 1024
export const CATALOG_MAX_RECORDS = 60000
export const CACHE_TTL_MS = 30 * 24 * 3600 * 1000
const CACHE_VERSION = 1

/** 80 PLUS product type -> mains voltage it applies to. Other types (277 V, 480 V, DC, industrial) are not for a PC. */
export const CATEGORY_VOLTAGE = Object.freeze({ '115V Internal': '115', '230V EU Internal': '230', '230V Internal': '230' })
const RATINGS = ['Standard', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Titanium', 'Ruby']

const pct = (v) => {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  const m = String(v).trim().match(/^(\d{1,3}(?:\.\d{1,4})?)\s*%?$/)
  if (!m) return null
  const x = Number(m[1])
  return x >= 40 && x <= 99.9 ? x : null
}
const text = (v, max) => {
  if (typeof v !== 'string') return null
  // printable only: the strings are shown in the UI
  const s = v.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()
  return s && s.length <= max ? s : null
}

/** One raw record -> compact entry, or null when anything needed is missing or out of range. */
export function parseRecord(id, r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null
  const category = text(r.field_product_type, 40)
  const voltage = category ? CATEGORY_VOLTAGE[category] : null
  if (!voltage) return null
  const brand = text(r.field_manufacturer_name, 80)
  const model = text(r.field_modal_number ?? r.field_model_number, 120)
  const watts = Number(String(r.field_wattage_value ?? '').trim())
  const rating = RATINGS.includes(r.field_certificate_rating) ? r.field_certificate_rating : null
  if (!brand || !model || !rating || !Number.isInteger(watts) || watts < 100 || watts > 5000) return null
  const e20 = pct(r.field_20_percent), e50 = pct(r.field_50_percent), e100 = pct(r.field_100_percent)
  if (e20 == null || e50 == null || e100 == null) return null
  let e10 = pct(r.field_10_percent)
  // 10 % is only required for Titanium; when it was not measured, the same approximation as the generic ratings
  const approx10 = e10 == null
  if (approx10) e10 = Math.max(50, e20 - 5)
  const date = typeof r.field_date_certified === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(r.field_date_certified.trim()) ? r.field_date_certified.trim() : null
  const pdf = typeof r.field_pdf_file_url === 'string' && /^\/80plus\/[\w\-./%]+\.pdf$/i.test(r.field_pdf_file_url) ? r.field_pdf_file_url : null
  return {
    id: `80plus:${String(id).replace(/[^\w-]/g, '').slice(0, 20)}`, brand, model, watts, rating, category, voltage,
    curve: [e10, e20, e50, e100], approx10, certified: date, pdf
  }
}

/** The whole downloaded file -> entries. Throws when the shape is not the one verified above. */
export function parseCatalog(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('catalog_format')
  const keys = Object.keys(json)
  if (keys.length === 0 || keys.length > CATALOG_MAX_RECORDS) throw new Error('catalog_format')
  const items = []
  for (const k of keys) { const e = parseRecord(k, json[k]); if (e) items.push(e) }
  // a format change would leave almost nothing parseable: fail instead of offering a near-empty list
  if (items.length < Math.min(50, keys.length * 0.5)) throw new Error('catalog_format')
  return items
}

const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * Search by manufacturer and model. Every word of the query must appear in "brand model wattage". Units are grouped by
 * brand + model + wattage, with one variant per certified voltage category. Sorted by brand, model, wattage.
 */
export function searchCatalog(items, query, limit = 40) {
  const words = norm(String(query ?? '')).split(' ').filter(Boolean)
  if (!words.length || words.join('').length < 2) return { results: [], total: 0 }
  const groups = new Map()
  for (const e of items || []) {
    const hay = ` ${norm(`${e.brand} ${e.model} ${e.watts}w ${e.watts}`)} `
    if (!words.every((w) => hay.includes(w))) continue
    const key = `${norm(e.brand)}|${norm(e.model)}|${e.watts}`
    let g = groups.get(key)
    if (!g) { g = { key, brand: e.brand, model: e.model, watts: e.watts, variants: [] }; groups.set(key, g) }
    // the same unit can be certified more than once in a category (renewals): keep the newest
    const prev = g.variants.findIndex((v) => v.category === e.category)
    if (prev < 0) g.variants.push(e)
    else if (dateKey(e.certified) > dateKey(g.variants[prev].certified)) g.variants[prev] = e
  }
  const all = [...groups.values()].sort((a, b) => a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model) || a.watts - b.watts)
  for (const g of all) g.variants.sort((a, b) => a.voltage.localeCompare(b.voltage) || a.category.localeCompare(b.category))
  return { results: all.slice(0, limit), total: all.length }
}
const dateKey = (d) => (d ? `${d.slice(6)}${d.slice(0, 2)}${d.slice(3, 5)}` : '')

/**
 * The variant to use for a mains voltage: 115 V mains -> 115V Internal; 230 V mains -> 230V EU Internal, then 230V
 * Internal, then (flagged `fallback`) the 115 V data.
 */
export function pickVariant(group, mains) {
  const vs = group?.variants || []
  const by = (cat) => vs.find((v) => v.category === cat) || null
  if (mains === '230') {
    const v = by('230V EU Internal') || by('230V Internal')
    if (v) return { variant: v, fallback: false }
    const f = by('115V Internal')
    return f ? { variant: f, fallback: true } : null
  }
  const v = by('115V Internal')
  if (v) return { variant: v, fallback: false }
  const f = by('230V EU Internal') || by('230V Internal')
  return f ? { variant: f, fallback: true } : null
}

/** On-demand download + private cache in userData. `download(url, dest, opts)` is SecureDownload.downloadToFile. */
export class PsuCatalog {
  constructor({ dir, download, now = () => Date.now() }) {
    this.dir = dir
    this.download = download
    this.now = now
    this.file = path.join(dir, 'psu-catalog-80plus.json')
    this.items = null
    this.fetchedAt = null
    this.loading = null
  }

  _readCache() {
    if (this.items) return true
    try {
      const c = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      if (c?.v !== CACHE_VERSION || !Array.isArray(c.items) || !Number.isFinite(c.fetchedAt)) return false
      // the cache is ours but lives in a user-writable folder: re-validate every entry
      this.items = c.items.map((e) => (e && typeof e === 'object' ? validEntry(e) : null)).filter(Boolean)
      this.fetchedAt = c.fetchedAt
      return this.items.length > 0
    } catch { return false }
  }

  status() {
    this._readCache()
    return { ok: true, cached: Boolean(this.items?.length), fetchedAt: this.fetchedAt, count: this.items?.length ?? 0, source: CATALOG_PAGE }
  }

  async _fetch() {
    const tmp = path.join(this.dir, `psu-catalog-${process.pid}-${this.now()}.tmp`)
    try {
      await this.download(CATALOG_URL, tmp, { allowedHosts: [...CATALOG_HOSTS], maxBytes: CATALOG_MAX_BYTES, timeoutMs: 60000 })
      let json
      try { json = JSON.parse(fs.readFileSync(tmp, 'utf8')) } catch { throw new Error('catalog_format') }
      const items = parseCatalog(json)
      const fetchedAt = this.now()
      fs.writeFileSync(this.file, JSON.stringify({ v: CACHE_VERSION, fetchedAt, source: CATALOG_URL, items }))
      this.items = items
      this.fetchedAt = fetchedAt
    } finally {
      fs.rmSync(tmp, { force: true })
    }
  }

  /** Load (cache, or download when there is none, it is older than the TTL, or `refresh`), then search. */
  async search({ query, refresh = false, limit = 40, mains = null } = {}) {
    const hasCache = this._readCache()
    const stale = !hasCache || refresh || this.now() - (this.fetchedAt ?? 0) > CACHE_TTL_MS
    let error = null
    if (stale) {
      try {
        this.loading ||= this._fetch().finally(() => { this.loading = null })
        await this.loading
      } catch (e) {
        error = e?.message === 'catalog_format' ? 'catalog_format' : 'offline'
        if (!hasCache) return { ok: false, error, detail: e?.message ?? String(e), source: CATALOG_PAGE }
      }
    }
    const r = searchCatalog(this.items, query, limit)
    // which certified data each unit would use on this mains voltage (null when the user has not said yet)
    const m = mains === '115' || mains === '230' ? mains : null
    for (const g of r.results) {
      const p = m ? pickVariant(g, m) : null
      g.pick = p ? { id: p.variant.id, fallback: p.fallback } : null
    }
    return { ok: true, ...r, mains: m, fetchedAt: this.fetchedAt, count: this.items.length, stale: Boolean(error), error, source: CATALOG_PAGE }
  }
}

function validEntry(e) {
  const curve = Array.isArray(e.curve) && e.curve.length === 4 && e.curve.every((x) => Number.isFinite(x) && x >= 40 && x <= 99.9) ? e.curve : null
  if (!curve || typeof e.id !== 'string' || !text(e.brand, 80) || !text(e.model, 120) || !Number.isInteger(e.watts) || !CATEGORY_VOLTAGE[e.category]) return null
  if (!RATINGS.includes(e.rating) || CATEGORY_VOLTAGE[e.category] !== e.voltage) return null
  return { id: e.id.slice(0, 40), brand: text(e.brand, 80), model: text(e.model, 120), watts: e.watts, rating: e.rating, category: e.category, voltage: e.voltage, curve, approx10: Boolean(e.approx10), certified: typeof e.certified === 'string' ? e.certified.slice(0, 10) : null, pdf: typeof e.pdf === 'string' && /^\/80plus\/[\w\-./%]+\.pdf$/i.test(e.pdf) ? e.pdf : null }
}
