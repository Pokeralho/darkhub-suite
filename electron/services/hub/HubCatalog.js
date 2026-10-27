// The DarkHub Hub catalog (hub.darkhub.ink) from the app: search, download with signature check, install and update.
// The Hub signs `id@version:sha256:tier`; a download whose hash or signature does not match is refused. Packages from a
// custom server (for development) are checked against the key pinned when the server was set and count as community,
// unless that key is the official one (a local copy of the Hub run with the real signing key).
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { OFFICIAL_HUB, OFFICIAL_KEYS } from './hubKeys.js'
import { conditionMismatch } from './hubModel.js'

const ID = /^[a-z0-9][a-z0-9-]{1,38}\.[a-z0-9][a-z0-9-]{1,62}$/
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

export const signedMessage = (id, version, sha256, tier) => `darkhub-package:v1:${id}@${version}:${sha256}:${tier}`

export function verifyDownload(dl, keys) {
  if (!dl || typeof dl.text !== 'string' || typeof dl.signature !== 'string') return 'resposta incompleta do Hub'
  const hash = crypto.createHash('sha256').update(dl.text, 'utf8').digest('hex')
  if (hash !== dl.sha256) return 'o conteúdo não bate com o hash publicado'
  const msg = Buffer.from(signedMessage(dl.id, dl.version, dl.sha256, dl.tier))
  const ok = keys.some((k) => { try { return crypto.verify(null, msg, crypto.createPublicKey({ key: Buffer.from(k, 'base64'), format: 'der', type: 'spki' }), Buffer.from(dl.signature, 'base64')) } catch { return false } })
  if (!ok) return 'assinatura inválida'
  let pkg
  try { pkg = JSON.parse(dl.text) } catch { return 'JSON inválido' }
  if (pkg.id !== dl.id || pkg.version !== dl.version) return 'o pacote não é o que foi pedido'
  return null
}

/** -1, 0, 1 (pre-releases before the release). */
export function compareSemver(a, b) {
  const p = (v) => { const [core, pre = ''] = String(v).split('+')[0].split(/-(.*)/s); return { n: core.split('.').map(Number), pre } }
  const x = p(a)
  const y = p(b)
  for (let i = 0; i < 3; i++) if (x.n[i] !== y.n[i]) return x.n[i] < y.n[i] ? -1 : 1
  if (x.pre === y.pre) return 0
  if (!x.pre) return 1
  if (!y.pre) return -1
  return x.pre < y.pre ? -1 : 1
}

export class HubCatalog {
  /** deps: { app, hub (HubService), fetch } */
  constructor({ app, hub, fetchImpl = globalThis.fetch }) {
    this.app = app
    this.hub = hub
    this.fetch = fetchImpl
    this.file = path.join(app.getPath('userData'), 'hub', 'server.json')
  }

  // ------------------------------------------------------------------ server
  server() {
    try {
      const s = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      if (s.url && s.url !== OFFICIAL_HUB && Array.isArray(s.keys)) return { url: s.url, keys: s.keys, official: false, trusted: s.keys.every((k) => OFFICIAL_KEYS.includes(k)) }
    } catch { /* default */ }
    return { url: OFFICIAL_HUB, keys: OFFICIAL_KEYS, official: true }
  }

  /** Points the app at another Hub (development) and pins its key now; empty url goes back to the official Hub. */
  async setServer(url) {
    if (!url || url === OFFICIAL_HUB) { fs.rmSync(this.file, { force: true }); return { ok: true, server: this.publicServer() } }
    let u
    try { u = new URL(url) } catch { return { ok: false, error: 'Endereço inválido' } }
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && loopback)) return { ok: false, error: 'Use https (http só em 127.0.0.1/localhost).' }
    const base = u.origin
    const meta = await this._json(`${base}/api/meta`).catch((e) => ({ error: e.message }))
    if (!meta?.publicKey) return { ok: false, error: `Não é um Hub do DarkHub: ${meta?.error || 'sem chave pública'}` }
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    fs.writeFileSync(this.file, JSON.stringify({ url: base, keys: [meta.publicKey], pinnedAt: new Date().toISOString() }, null, 1))
    return { ok: true, server: this.publicServer() }
  }

  /** official: the real Hub; trusted: a custom server signing with the official key (tiers count). */
  publicServer() { const s = this.server(); return { url: s.url, official: s.official, trusted: s.official || Boolean(s.trusted) } }

  async _json(url, init = {}) {
    const res = await this.fetch(url, { ...init, signal: AbortSignal.timeout(15000), headers: { accept: 'application/json', 'user-agent': `DarkHub/${this.app.getVersion()}`, ...(init.headers || {}) } })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
    return body
  }

  // ------------------------------------------------------------------ browse
  async search({ q = '', type = '', tier = '', tag = '', sort = '', offset = 0, limit = 30 } = {}) {
    const s = this.server()
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries({ q, type, tier, tag, sort })) if (v) qs.set(k, String(v))
    qs.set('offset', String(Math.max(0, Number(offset) || 0)))
    qs.set('limit', String(Math.min(100, Math.max(1, Number(limit) || 30))))
    try {
      const r = await this._json(`${s.url}/api/packages?${qs}`)
      const hw = await this.hub.hardware().catch(() => null)
      const installed = new Map(this.hub.list().packages.map((p) => [p.id, p.version]))
      return {
        ok: true, server: this.publicServer(), total: r.total,
        items: r.items.map((it) => ({ ...it, tier: this._tier(it.tier, s), fits: hw ? !conditionMismatch(it.when, hw) : true, installedVersion: installed.get(it.id) || null }))
      }
    } catch (e) { return { ok: false, error: `O Hub não respondeu (${e.message}). Tente de novo mais tarde.`, server: this.publicServer() } }
  }

  async detail(id) {
    if (!ID.test(String(id))) return { ok: false, error: 'id inválido' }
    const s = this.server()
    try { const d = await this._json(`${s.url}/api/packages/${id}`); return { ok: true, server: this.publicServer(), pkg: { ...d, tier: this._tier(d.tier, s) } } } catch (e) { return { ok: false, error: e.message } }
  }

  _tier(tier, s) { return s.official || s.trusted ? tier : 'community' }

  /** Downloads one version and checks hash + signature. Returns { text, tier, version, sha256 } or { error }. */
  async download(id, version = 'latest') {
    if (!ID.test(String(id))) return { error: 'id inválido' }
    if (version !== 'latest' && !VERSION.test(String(version))) return { error: 'versão inválida' }
    const s = this.server()
    let dl
    try { dl = await this._json(`${s.url}/api/packages/${id}/versions/${version}`) } catch (e) { return { error: e.message } }
    if (dl.id !== id) return { error: 'o Hub respondeu outro pacote' }
    const problem = verifyDownload(dl, s.keys)
    if (problem) return { error: `Download recusado: ${problem}.` }
    return { text: dl.text, tier: this._tier(dl.tier, s), version: dl.version, sha256: dl.sha256, hub: s.url }
  }

  // ------------------------------------------------------------------ install
  async inspect(id, lang, version = 'latest') {
    const dl = await this.download(id, version)
    if (dl.error) return { ok: false, error: dl.error }
    const r = await this.hub.inspect(dl.text, lang, { official: dl.tier === 'official' })
    return { ...r, remote: { hub: dl.hub, tier: dl.tier, version: dl.version, sha256: dl.sha256 } }
  }

  async install(id, version = 'latest') {
    const dl = await this.download(id, version)
    if (dl.error) return { ok: false, error: dl.error }
    const r = await this.hub.install(dl.text, { official: dl.tier === 'official', source: { hub: dl.hub, tier: dl.tier, version: dl.version, sha256: dl.sha256 } })
    if (r.ok) this._countInstall(id)
    return r
  }

  _countInstall(id) {
    const s = this.server()
    this.fetch(`${s.url}/api/packages/${id}/installs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(10000) }).catch(() => {})
  }

  /** Installed packages that came from this Hub and have a newer version there. */
  async updates() {
    const s = this.server()
    const mine = this.hub.list().packages.filter((p) => p.source?.hub === s.url)
    if (!mine.length) return { ok: true, items: [] }
    try {
      const r = await this._json(`${s.url}/api/packages?ids=${encodeURIComponent(mine.map((p) => p.id).join(','))}&limit=100`)
      const latest = new Map(r.items.map((it) => [it.id, it]))
      return {
        ok: true,
        items: mine.filter((p) => latest.has(p.id) && compareSemver(latest.get(p.id).version, p.version) > 0)
          .map((p) => ({ id: p.id, installed: p.version, latest: latest.get(p.id).version, name: latest.get(p.id).name }))
      }
    } catch (e) { return { ok: false, error: e.message } }
  }

  /**
   * Update = remove the installed version (restoring the snapshot) and install the new one. The new one is downloaded
   * and checked first; if it fails to install, the old version is put back.
   */
  async update(id) {
    const current = this.hub.record(id)
    if (!current) return { ok: false, error: 'Pacote não instalado' }
    const dl = await this.download(id, 'latest')
    if (dl.error) return { ok: false, error: dl.error }
    const check = await this.hub.inspect(dl.text, 'pt-BR', { official: dl.tier === 'official' })
    if (!check.ok) return { ok: false, error: check.errors?.map((e) => e.message).join('; ') || 'pacote inválido' }
    if (!check.applicable) return { ok: false, error: `A nova versão não é para este PC (${check.notFor}).` }
    // an extension is swapped in place: its saved data survives the update
    if (current.pkg.type === 'extension') {
      const r = await this.hub.install(dl.text, { official: dl.tier === 'official', source: { hub: dl.hub, tier: dl.tier, version: dl.version, sha256: dl.sha256 }, replace: true })
      return r.ok ? { ...r, updatedFrom: current.pkg.version } : r
    }
    const removed = await this.hub.uninstall(id)
    if (!removed.ok) return removed
    const r = await this.hub.install(dl.text, { official: dl.tier === 'official', source: { hub: dl.hub, tier: dl.tier, version: dl.version, sha256: dl.sha256 } })
    if (r.ok) return { ...r, updatedFrom: current.pkg.version }
    const back = await this.hub.install(JSON.stringify(current.pkg), { official: current.source?.tier === 'official', source: current.source || null })
    return { ok: false, error: `${r.error}${back.ok ? ' (a versão anterior foi reinstalada)' : ` · não foi possível reinstalar a anterior: ${back.error}`}` }
  }
}
