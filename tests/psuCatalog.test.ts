// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// @ts-ignore - plain JS modules
import { parseRecord, parseCatalog, searchCatalog, pickVariant, PsuCatalog, CATALOG_URL, CATALOG_HOSTS, CACHE_TTL_MS } from '../electron/services/overlay/psuCatalog.js'
// @ts-ignore
import { normalizePower } from '../electron/services/overlay/powerModel.js'

// Synthetic records in the shape verified against the real 80 PLUS file (field names as published, values invented).
const rec = (o: Record<string, unknown> = {}) => ({
  field_manufacturer_name: 'Acme Power', manufacturer_url_friendly_name: 'Acme-Power', field_modal_number: 'AP-850G', field_form_factor: 'ATX12V',
  field_wattage_value: '850', field_5_percent: '-', field_10_percent: '86.10%', field_20_percent: '90.20%', field_50_percent: '91.30%', field_100_percent: '88.40%',
  field_pf10: '0.95', field_certificate_rating: 'Gold', field_date_certified: '03/14/2022', field_pdf_file_url: '/80plus/sites/80plus/files/manufacturer-certificate/acme-ap850g-1.pdf',
  field_product_type: '115V Internal', ...o
})
const fixture = () => {
  const out: Record<string, unknown> = {
    1: rec(),
    2: rec({ field_product_type: '230V EU Internal', field_10_percent: '-', field_20_percent: '91.00%', field_50_percent: '93.00%', field_100_percent: '90.50%', field_date_certified: '05/01/2022' }),
    3: rec({ field_modal_number: 'AP-650B', field_wattage_value: '650', field_certificate_rating: 'Bronze', field_10_percent: '-', field_20_percent: '85.00%', field_50_percent: '88.00%', field_100_percent: '85.50%' }),
    4: rec({ field_manufacturer_name: 'Other Co', field_modal_number: 'OC-1000P', field_wattage_value: '1000', field_certificate_rating: 'Platinum', field_product_type: '230V Internal' }),
    5: rec({ field_product_type: '380V DC' }), // not a PC PSU: dropped
    6: rec({ field_50_percent: '-' }), // incomplete: dropped
    7: rec({ field_date_certified: '01/01/2024', field_20_percent: '90.50%' }) // re-certification of #1: newer wins
  }
  for (let i = 0; i < 60; i++) out[100 + i] = rec({ field_manufacturer_name: 'Filler', field_modal_number: `F-${i}`, field_wattage_value: String(500 + i) })
  return out
}

describe('psu catalog: parsing', () => {
  it('keeps the 4 efficiency points, wattage, rating and the voltage category', () => {
    const e = parseRecord('1', rec())
    expect(e).toMatchObject({ id: '80plus:1', brand: 'Acme Power', model: 'AP-850G', watts: 850, rating: 'Gold', category: '115V Internal', voltage: '115', curve: [86.1, 90.2, 91.3, 88.4], approx10: false, certified: '03/14/2022' })
  })
  it('approximates a missing 10 % point (flagged) and maps 230 V categories', () => {
    const e = parseRecord('2', rec({ field_10_percent: '-', field_product_type: '230V EU Internal' }))
    expect(e.approx10).toBe(true)
    expect(e.curve[0]).toBeCloseTo(85.2)
    expect(e.voltage).toBe('230')
  })
  it('drops records that are not a PC PSU or have impossible values', () => {
    expect(parseRecord('x', rec({ field_product_type: '480V Internal' }))).toBeNull()
    expect(parseRecord('x', rec({ field_50_percent: '150%' }))).toBeNull()
    expect(parseRecord('x', rec({ field_50_percent: '<script>' }))).toBeNull()
    expect(parseRecord('x', rec({ field_wattage_value: 'lots' }))).toBeNull()
    expect(parseRecord('x', rec({ field_certificate_rating: 'Diamond' }))).toBeNull()
    expect(parseRecord('x', rec({ field_manufacturer_name: 'x'.repeat(200) }))).toBeNull()
    expect(parseRecord('x', null)).toBeNull()
    // control characters never reach the UI; a bad PDF path is dropped
    expect(parseRecord('x', rec({ field_modal_number: 'AP\u0007-850', field_pdf_file_url: 'https://evil/x.pdf' }))).toMatchObject({ model: 'AP-850', pdf: null })
  })
  it('fails closed when the file is not the verified shape', () => {
    expect(() => parseCatalog([])).toThrow('catalog_format')
    expect(() => parseCatalog({})).toThrow('catalog_format')
    expect(() => parseCatalog(Object.fromEntries(Array.from({ length: 100 }, (_, i) => [i, { name: 'x' }])))).toThrow('catalog_format')
    expect(parseCatalog(fixture()).length).toBe(65)
  })
})

describe('psu catalog: search and voltage', () => {
  const items = parseCatalog(fixture())
  it('matches every word against brand, model and wattage, grouping voltage variants', () => {
    const r = searchCatalog(items, 'acme 850')
    expect(r.total).toBe(1)
    const g = r.results[0]
    expect(g.variants.map((v: { category: string }) => v.category)).toEqual(['115V Internal', '230V EU Internal'])
    expect(g.variants[0].certified).toBe('01/01/2024') // the newer certification of the same unit
    expect(searchCatalog(items, 'ACME ap-650b').results[0].watts).toBe(650)
    expect(searchCatalog(items, 'nothing like this').total).toBe(0)
    expect(searchCatalog(items, 'a').total).toBe(0) // too short
    expect(searchCatalog(items, 'filler', 10).results.length).toBe(10)
  })
  it('uses 230 V data on 220 V mains when it exists, otherwise 115 V flagged', () => {
    const [acme] = searchCatalog(items, 'acme 850').results
    expect(pickVariant(acme, '230')).toMatchObject({ fallback: false, variant: { category: '230V EU Internal' } })
    expect(pickVariant(acme, '115')).toMatchObject({ fallback: false, variant: { category: '115V Internal' } })
    const [b] = searchCatalog(items, 'ap-650b').results
    expect(pickVariant(b, '230')).toMatchObject({ fallback: true, variant: { voltage: '115' } })
    const [o] = searchCatalog(items, 'other').results
    expect(pickVariant(o, '115')).toMatchObject({ fallback: true, variant: { category: '230V Internal' } })
  })
  it('a picked model sets wattage and curve, and is dropped once the user edits either', () => {
    const v = parseRecord('1', rec())
    const model = { ...v, voltage: '115' }
    const s = normalizePower({ psuWatts: 850, psuRating: 'custom', psuCustom: v.curve, psuModel: model, mainsVoltage: '115' })
    expect(s.psuModel).toMatchObject({ id: '80plus:1', watts: 850 })
    expect(s.mainsVoltage).toBe('115')
    expect(normalizePower({ psuWatts: 850, psuRating: 'custom', psuCustom: [80, 85, 88, 85], psuModel: model }).psuModel).toBeNull()
    expect(normalizePower({ psuWatts: 750, psuRating: 'custom', psuCustom: v.curve, psuModel: model }).psuModel).toBeNull()
    expect(normalizePower({ psuWatts: 850, psuRating: 'gold', psuCustom: v.curve, psuModel: model }).psuModel).toBeNull()
    expect(normalizePower({ mainsVoltage: '9000' }).mainsVoltage).toBeNull()
  })
})

describe('psu catalog: download, cache and offline', () => {
  let dir = ''
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-psucat-')) })
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  const fakeDownload = (body: string | null, calls: unknown[]) => async (url: string, dest: string, opts: unknown) => {
    calls.push({ url, opts })
    if (body == null) throw new Error('getaddrinfo ENOTFOUND www.clearesult.com')
    fs.writeFileSync(dest, body)
    return { sha256: 'x', bytes: body.length }
  }

  it('downloads once over HTTPS from the allow-listed host, with a size cap, then serves the cache', async () => {
    const calls: { url: string; opts: { allowedHosts: string[]; maxBytes: number } }[] = []
    let now = 1_000_000
    const c = new PsuCatalog({ dir, download: fakeDownload(JSON.stringify(fixture()), calls), now: () => now })
    const r = await c.search({ query: 'acme 850', mains: '230' })
    expect(r.ok).toBe(true)
    expect(r.results[0].pick).toMatchObject({ fallback: false })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(CATALOG_URL)
    expect(CATALOG_URL.startsWith('https://')).toBe(true)
    expect(calls[0].opts.allowedHosts).toEqual(CATALOG_HOSTS)
    expect(calls[0].opts.maxBytes).toBeGreaterThan(15e6)
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]) // temp file removed
    // a fresh instance reads the cache, no download
    const c2 = new PsuCatalog({ dir, download: fakeDownload(null, calls), now: () => now })
    expect((await c2.search({ query: 'acme' })).ok).toBe(true)
    expect(c2.status()).toMatchObject({ cached: true, count: 65 })
    expect(calls).toHaveLength(1)
    // older than the TTL and offline: keeps answering from the cache, flagged stale
    now += CACHE_TTL_MS + 1
    const r3 = await c2.search({ query: 'acme' })
    expect(r3).toMatchObject({ ok: true, stale: true, error: 'offline' })
  })

  it('offline with no cache: a clear error, no data', async () => {
    const c = new PsuCatalog({ dir, download: fakeDownload(null, []) })
    expect(await c.search({ query: 'acme' })).toMatchObject({ ok: false, error: 'offline' })
    expect(c.status()).toMatchObject({ cached: false, count: 0 })
  })

  it('a changed format is reported, not guessed, and nothing is cached', async () => {
    const c = new PsuCatalog({ dir, download: fakeDownload('<html>maintenance</html>', []) })
    expect(await c.search({ query: 'acme' })).toMatchObject({ ok: false, error: 'catalog_format' })
    expect(fs.readdirSync(dir)).toEqual([])
  })

  it('re-validates a tampered cache', async () => {
    fs.writeFileSync(path.join(dir, 'psu-catalog-80plus.json'), JSON.stringify({ v: 1, fetchedAt: Date.now(), items: [{ id: 'x', brand: 'B', model: 'M', watts: 500, rating: 'Gold', category: '115V Internal', voltage: '115', curve: [1, 2, 3, 4] }] }))
    const c = new PsuCatalog({ dir, download: fakeDownload(null, []) })
    expect(c.status().cached).toBe(false)
  })
})
