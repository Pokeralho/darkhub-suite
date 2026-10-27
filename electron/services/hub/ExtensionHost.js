// Runs DarkHub extensions: builds the sandboxed page for each screen/widget and answers the bridge calls, checking the
// permissions the extension declared (and the user approved by installing it) on every call. The renderer only relays
// messages; every decision is made here.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildExtensionDoc, sensorsForExtensions, EXT_CSP } from './extensionModel.js'
import { textOf } from './hubModel.js'

const here = path.dirname(fileURLToPath(import.meta.url)) // ext/ is read from inside the asar (fs supports it in main)
const MAX_STORAGE = 1024 * 1024
const MAX_FETCH_BODY = 2 * 1024 * 1024
const LOGS_PER_EXT = 200

/** Which permission each bridge method needs (null = none). */
export const METHOD_PERMISSION = {
  'storage.get': 'storage', 'storage.set': 'storage', 'storage.delete': 'storage', 'storage.keys': 'storage',
  'hardware.info': 'hardware',
  'sensors.read': 'sensors',
  'tweaks.status': 'tweaks.read', 'tweaks.list': 'tweaks.read',
  'net.fetch': 'network',
  'ui.notify': 'notifications',
  'clipboard.write': 'clipboard',
  'packages.preview': 'packages', 'packages.install': 'packages', 'packages.hubInstall': 'packages',
  'app.info': null, 'app.openExternal': null
}

export class ExtensionHost {
  /**
   * deps: { app, hub (HubService), catalog (HubCatalog), approve(request) -> Promise<boolean>, sensors: { read(), hold(tag), release(tag) },
   *         notify(title, body), clipboard(text), openExternal(url), fetchImpl }
   */
  constructor(deps) {
    Object.assign(this, deps)
    this.fetch = deps.fetchImpl || globalThis.fetch
    this.dataDir = path.join(deps.app.getPath('userData'), 'hub', 'ext-data')
    this.logs = new Map() // id -> [{ at, level, text }]
    this.sensorTimers = new Map()
    this._assets = null
  }

  _ext(id) {
    const rec = this.hub.record(String(id || ''))
    if (!rec || rec.pkg.type !== 'extension') throw new Error('extensão não instalada')
    return rec.pkg
  }

  assets() {
    if (!this._assets) this._assets = { bridgeJs: fs.readFileSync(path.join(here, 'ext', 'bridge.js'), 'utf8'), baseCss: fs.readFileSync(path.join(here, 'ext', 'base.css'), 'utf8') }
    return this._assets
  }

  /** The sandboxed document for a screen or widget of an installed extension. */
  doc(id, contributionId, kind = 'pages', lang = 'pt-BR') {
    const pkg = this._ext(id)
    const c = (pkg.contributes?.[kind] || []).find((x) => x.id === contributionId)
    if (!c) throw new Error('tela não encontrada')
    return { ok: true, html: buildExtensionDoc(pkg, c.entry, { ...this.assets(), lang }), title: textOf(c.title, lang), version: pkg.version }
  }

  /**
   * darkhub-ext://ext/<id>/<pages|widgets>/<contribution>?lang=pt-BR -> the page, with the CSP also as a header.
   * The frame's origin is opaque (sandbox without allow-same-origin), so the page cannot reach the app either way.
   */
  response(request) {
    try {
      const u = new URL(request.url)
      const [, id, kind, contribution] = u.pathname.split('/')
      if (u.host !== 'ext' || !['pages', 'widgets'].includes(kind)) return new Response('não encontrado', { status: 404 })
      const lang = u.searchParams.get('lang') === 'en-US' ? 'en-US' : 'pt-BR'
      const { html } = this.doc(decodeURIComponent(id), decodeURIComponent(contribution || ''), kind, lang)
      return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': EXT_CSP, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
    } catch (e) {
      return new Response(String(e?.message || e), { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
    }
  }

  log(id, level, args) {
    const list = this.logs.get(id) || []
    list.push({ at: new Date().toISOString(), level: ['log', 'info', 'warn', 'error'].includes(level) ? level : 'log', text: (Array.isArray(args) ? args : [args]).map(String).join(' ').slice(0, 2000) })
    if (list.length > LOGS_PER_EXT) list.splice(0, list.length - LOGS_PER_EXT)
    this.logs.set(id, list)
  }

  getLogs(id) { return this.logs.get(id) || [] }

  // ------------------------------------------------------------------ storage (one JSON file per extension, 1 MB)
  _storeFile(id) { return path.join(this.dataDir, `${id}.json`) }
  _readStore(id) { try { return JSON.parse(fs.readFileSync(this._storeFile(id), 'utf8')) } catch { return {} } }
  _writeStore(id, data) {
    const text = JSON.stringify(data)
    if (Buffer.byteLength(text) > MAX_STORAGE) throw new Error('armazenamento da extensão cheio (1 MB)')
    fs.mkdirSync(this.dataDir, { recursive: true })
    fs.writeFileSync(`${this._storeFile(id)}.tmp`, text)
    fs.renameSync(`${this._storeFile(id)}.tmp`, this._storeFile(id))
  }

  /** One bridge call. Returns the value or throws an Error whose message the extension receives. */
  async call(id, method, params = {}) {
    const pkg = this._ext(id)
    if (!(method in METHOD_PERMISSION)) throw new Error(`método desconhecido: ${method}`)
    const need = METHOD_PERMISSION[method]
    if (need && !(pkg.permissions || []).includes(need)) throw new Error(`a extensão não pediu a permissão "${need}"`)
    const name = textOf(pkg.name, 'pt-BR')
    const key = () => { const k = String(params.key ?? ''); if (!k || k.length > 200) throw new Error('chave inválida'); return k }

    switch (method) {
      case 'app.info': return { id: pkg.id, version: pkg.version, appVersion: this.app.getVersion(), permissions: pkg.permissions || [] }
      case 'app.openExternal': {
        const u = new URL(String(params.url || ''))
        if (u.protocol !== 'https:') throw new Error('só links https')
        await this.openExternal(u.toString())
        return true
      }
      case 'storage.get': return this._readStore(id)[key()] ?? null
      case 'storage.keys': return Object.keys(this._readStore(id))
      case 'storage.set': { const d = this._readStore(id); d[key()] = params.value === undefined ? null : params.value; this._writeStore(id, d); return true }
      case 'storage.delete': { const d = this._readStore(id); delete d[key()]; this._writeStore(id, d); return true }
      case 'hardware.info': return this.hub.hardware()
      case 'sensors.read': {
        // keep the sensor daemons alive while the extension polls; let them go 30 s after the last read
        this.sensors.hold(`ext:${id}`)
        clearTimeout(this.sensorTimers.get(id))
        this.sensorTimers.set(id, setTimeout(() => this.sensors.release(`ext:${id}`), 30_000))
        return sensorsForExtensions(this.sensors.read())
      }
      case 'tweaks.status': return (await this.hub.tweaks.checkTweaksStatus()).status || {}
      case 'tweaks.list': return [...this.hub.builtins()].filter(([, b]) => b.kind === 'tweak').map(([tid, b]) => ({ id: tid, title: b.title, risk: b.risk }))
      case 'net.fetch': return this._fetch(pkg, params)
      case 'ui.notify': await this.notify(String(params.title || name).slice(0, 80), String(params.body || '').slice(0, 300)); return true
      case 'clipboard.write': this.clipboard(String(params.text ?? '').slice(0, 100_000)); return true
      case 'packages.preview': return this.hub.inspect(toText(params.pkg), params.lang === 'en-US' ? 'en-US' : 'pt-BR')
      case 'packages.install': {
        const text = toText(params.pkg)
        const preview = await this.hub.inspect(text, 'pt-BR')
        if (!preview.ok) return preview
        if (preview.pkg.type === 'extension') throw new Error('extensões não instalam outras extensões')
        if (!preview.applicable) return { ok: false, error: `Não é para este PC: ${preview.notFor}` }
        if (!(await this.approve({ client: `extensão ${name}`, title: `Instalar ${preview.pkg.name}`, preview }))) return { ok: false, error: 'O usuário não aprovou.' }
        return this.hub.install(text)
      }
      case 'packages.hubInstall': {
        const preview = await this.catalog.inspect(String(params.id || ''), 'pt-BR')
        if (!preview.ok) return preview
        if (preview.pkg.type === 'extension') throw new Error('extensões não instalam outras extensões')
        if (!preview.applicable) return { ok: false, error: `Não é para este PC: ${preview.notFor}` }
        if (!(await this.approve({ client: `extensão ${name}`, title: `Instalar ${preview.pkg.name} do Hub`, preview }))) return { ok: false, error: 'O usuário não aprovou.' }
        return this.catalog.install(String(params.id), preview.remote.version)
      }
      default: throw new Error('método desconhecido')
    }
  }

  /** HTTPS only, to the origins the extension declared, no cookies, bounded body and time. */
  async _fetch(pkg, params) {
    let u
    try { u = new URL(String(params.url || '')) } catch { throw new Error('URL inválida') }
    if (u.protocol !== 'https:' || !(pkg.network || []).includes(u.origin)) throw new Error(`${u.origin} não está na lista "network" da extensão`)
    const init = params.init || {}
    const method = String(init.method || 'GET').toUpperCase()
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].includes(method)) throw new Error('método HTTP não permitido')
    const headers = {}
    for (const [k, v] of Object.entries(init.headers || {})) if (!/^(cookie|host|origin|referer)$/i.test(k)) headers[k] = String(v)
    const body = init.body == null ? undefined : String(init.body)
    if (body && Buffer.byteLength(body) > 1024 * 1024) throw new Error('corpo do pedido grande demais (1 MB)')
    const res = await this.fetch(u.toString(), { method, headers, body, redirect: 'manual', credentials: 'omit', signal: AbortSignal.timeout(20_000) })
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > MAX_FETCH_BODY) throw new Error('resposta grande demais (2 MB)')
    const outHeaders = {}
    for (const h of ['content-type', 'etag', 'last-modified', 'cache-control', 'x-ratelimit-remaining']) { const v = res.headers.get(h); if (v) outHeaders[h] = v }
    return { ok: res.ok, status: res.status, headers: outHeaders, body: buf.toString('utf8') }
  }
}

const toText = (p) => (typeof p === 'string' ? p : JSON.stringify(p ?? null, null, 2))
