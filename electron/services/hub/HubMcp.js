// MCP server (Model Context Protocol, Streamable HTTP with plain JSON responses) so AI assistants such as Claude Code and
// Claude Desktop can read this PC's facts, write and check packages, and install them. Off by default. Listens only on
// 127.0.0.1, needs the token from userData/mcp.json, refuses browser origins, and every tool that changes the system
// waits for the user to approve it in a DarkHub window.
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SCHEMA, textOf } from './hubModel.js'

export const MCP_DEFAULT_PORT = 47615
/** stdio bridge for Claude Desktop (electron/services/DarkHub.Mcp.exe, unpacked from the asar). */
export const BRIDGE_EXE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'DarkHub.Mcp.exe').replace(/app\.asar(?![.\w])/, 'app.asar.unpacked')
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05']
const MAX_BODY = 1024 * 1024

const pkgArg = { description: 'The package: the JSON object itself or its text.', oneOf: [{ type: 'object' }, { type: 'string' }] }
const TOOLS = [
  { name: 'darkhub_hardware', title: 'PC facts', description: 'Facts about this PC that package conditions ("when"/"if") test: Windows build, CPU and GPU vendors, dedicated GPU, laptop or desktop, RAM, wired network, DarkOS.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'darkhub_builtins', title: 'Built-in tweaks and operations', description: 'DarkHub tweaks (use: "darkhub:tweak:x") and operations (op: "darkhub:op:x") a package can reference, with risk and whether community packages may use them. Prefer these over raw registry items: DarkHub knows how to undo them.', inputSchema: { type: 'object', properties: { kind: { type: 'string', enum: ['tweak', 'op'] }, query: { type: 'string', description: 'Filter by words in id or title.' } } }, annotations: { readOnlyHint: true } },
  { name: 'darkhub_schema', title: 'Package schema', description: 'The JSON Schema (2020-12) of DarkHub packages, with a description on every field. Read it before writing a package.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'darkhub_validate', title: 'Validate a package', description: 'Checks a package against the schema and the security rules exactly like the app and the Hub do, and describes every item. Changes nothing.', inputSchema: { type: 'object', properties: { package: pkgArg }, required: ['package'] }, annotations: { readOnlyHint: true } },
  { name: 'darkhub_inspect', title: 'Preview on this PC', description: 'Dry run on this PC: for every item, the value today, the value after, and whether it already matches. Changes nothing.', inputSchema: { type: 'object', properties: { package: pkgArg, lang: { type: 'string', enum: ['pt-BR', 'en-US'] } }, required: ['package'] }, annotations: { readOnlyHint: true } },
  { name: 'darkhub_install', title: 'Install a package', description: 'Installs a package on this PC. DarkHub shows the user the full preview and asks for approval; nothing changes if they decline. Keeps a snapshot so darkhub_uninstall restores everything.', inputSchema: { type: 'object', properties: { package: pkgArg }, required: ['package'] }, annotations: { destructiveHint: false, idempotentHint: false } },
  { name: 'darkhub_installed', title: 'Installed packages', description: 'Packages installed on this PC (id, version, risk, where they came from).', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'darkhub_uninstall', title: 'Remove a package', description: 'Removes an installed package, restoring every value it changed. Asks the user for approval.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }, annotations: { destructiveHint: false } },
  { name: 'darkhub_export_my_pc', title: 'Preset from this PC', description: 'A preset with the DarkHub tweaks and operations currently active on this PC, ready to share.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, github: { type: 'string', description: 'GitHub login of the author (namespace of the id).' } }, required: ['name', 'github'] }, annotations: { readOnlyHint: true } },
  { name: 'hub_search', title: 'Search the Hub', description: 'Searches hub.darkhub.ink. Each result says whether it fits this PC ("fits") and the installed version.', inputSchema: { type: 'object', properties: { q: { type: 'string' }, type: { type: 'string', enum: ['module', 'preset'] }, tag: { type: 'string' }, tier: { type: 'string', enum: ['official', 'verified', 'community'] } } }, annotations: { readOnlyHint: true, openWorldHint: true } },
  { name: 'hub_package', title: 'Hub package details', description: 'Details of a Hub package: what every item changes, versions, evidence.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }, annotations: { readOnlyHint: true, openWorldHint: true } },
  { name: 'hub_install', title: 'Install from the Hub', description: 'Downloads a Hub package (hash and signature checked), shows the user the preview and installs it if they approve.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, version: { type: 'string' } }, required: ['id'] }, annotations: { openWorldHint: true } },
  { name: 'hub_updates', title: 'Updates available', description: 'Installed Hub packages with a newer version on the Hub.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true, openWorldHint: true } },
  { name: 'darkhub_extension_dev_load', title: 'Load an extension under development', description: 'Loads an extension from a folder on this PC (darkhub-extension.json + its files) and keeps reloading it whenever a file changes. The user approves the first load of each folder. Use darkhub_extension_logs to read its console.', inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Absolute path of the extension folder.' } }, required: ['path'] } },
  { name: 'darkhub_extension_reload', title: 'Reload a development extension', description: 'Rebuilds and reloads an extension loaded with darkhub_extension_dev_load.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  { name: 'darkhub_extension_logs', title: 'Extension console', description: 'The last console messages and errors of an extension (console.log/warn/error and uncaught errors).', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }, annotations: { readOnlyHint: true } },
  { name: 'hub_update', title: 'Update a package', description: 'Updates an installed Hub package to its latest version (removes the old one, installs the new). Asks the user for approval.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }, annotations: { openWorldHint: true } }
]

const toText = (p) => (typeof p === 'string' ? p : JSON.stringify(p ?? null, null, 2))
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })

export class HubMcp {
  /**
   * deps: { app, hub (HubService), catalog (HubCatalog), approve(request) -> Promise<boolean>, logger }
   * approve receives { tool, client, title, preview } and resolves true only when the user clicked approve.
   */
  constructor({ app, hub, catalog, approve, logger, extensions = null }) {
    this.extensions = extensions
    this.app = app
    this.hub = hub
    this.catalog = catalog
    this.approve = approve
    this.logger = logger
    this.file = path.join(app.getPath('userData'), 'mcp.json')
    this.server = null
    this.error = ''
    this.clients = new Map() // session id -> client name
  }

  _cfg() {
    let c = {}
    try { c = JSON.parse(fs.readFileSync(this.file, 'utf8')) } catch { /* first run */ }
    if (!c.token) c.token = crypto.randomBytes(24).toString('base64url')
    if (!Number.isInteger(c.port)) c.port = MCP_DEFAULT_PORT
    return c
  }
  _write(c) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    const port = this.server?.address()?.port || c.port
    fs.writeFileSync(this.file, JSON.stringify({ ...c, url: `http://127.0.0.1:${port}/mcp` }, null, 1), { mode: 0o600 })
  }

  status() {
    const c = this._cfg()
    const port = this.server?.address()?.port || c.port
    return { ok: true, enabled: Boolean(c.enabled), running: Boolean(this.server?.listening), url: `http://127.0.0.1:${port}/mcp`, token: c.token, configFile: this.file, bridge: BRIDGE_EXE, error: this.error }
  }

  async init() { if (this._cfg().enabled) await this.start() }

  async setEnabled(on) {
    const c = this._cfg()
    c.enabled = Boolean(on)
    if (c.enabled) { this._write(c); await this.start() } else { await this.stop(); this._write(c) }
    return this.status()
  }

  async regenerateToken() {
    const c = this._cfg()
    c.token = crypto.randomBytes(24).toString('base64url')
    this._write(c)
    return this.status()
  }

  async start() {
    if (this.server?.listening) return
    const c = this._cfg()
    this.error = ''
    const server = http.createServer((req, res) => { this._handle(req, res).catch((e) => { this.logger?.error?.('MCP', e?.message || String(e)); if (!res.headersSent) res.writeHead(500).end() }) })
    await new Promise((resolve) => {
      server.once('error', (e) => { this.error = e.code === 'EADDRINUSE' ? `A porta ${c.port} já está em uso` : e.message; resolve() })
      server.listen(c.port, '127.0.0.1', () => { this.server = server; resolve() })
    })
    this._write(c)
  }

  async stop() {
    const s = this.server
    this.server = null
    if (s) await new Promise((r) => s.close(() => r()))
  }

  // ------------------------------------------------------------------ transport
  async _handle(req, res) {
    const send = (code, body, headers = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...headers }); res.end(body === undefined ? '' : JSON.stringify(body)) }
    // DNS rebinding and web pages: only loopback hosts, no browser origins
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(String(req.headers.host || ''))) return send(403, rpcError(null, -32600, 'host não permitido'))
    if (req.headers.origin && req.headers.origin !== 'null') return send(403, rpcError(null, -32600, 'origem não permitida'))
    if (new URL(req.url, 'http://127.0.0.1').pathname !== '/mcp') return send(404, rpcError(null, -32600, 'use /mcp'))
    const want = Buffer.from(`Bearer ${this._cfg().token}`)
    const got = Buffer.from(String(req.headers.authorization || ''))
    if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return send(401, rpcError(null, -32600, 'token inválido (veja mcp.json do DarkHub)'))
    if (req.method === 'DELETE') { this.clients.delete(String(req.headers['mcp-session-id'] || '')); return send(200, {}) }
    if (req.method !== 'POST') return send(405, rpcError(null, -32600, 'só POST (sem fluxo SSE)'), { allow: 'POST, DELETE' })

    const chunks = []
    let size = 0
    for await (const ch of req) { size += ch.length; if (size > MAX_BODY) return send(413, rpcError(null, -32600, 'pedido grande demais')); chunks.push(ch) }
    let msg
    try { msg = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return send(400, rpcError(null, -32700, 'JSON inválido')) }

    const session = String(req.headers['mcp-session-id'] || '')
    const batch = Array.isArray(msg)
    const out = []
    let newSession = ''
    for (const m of batch ? msg : [msg]) {
      if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') { if (m?.id !== undefined) out.push(rpcError(m.id, -32600, 'pedido inválido')); continue }
      if (m.id === undefined) continue // notification
      if (m.method === 'initialize') {
        newSession = crypto.randomUUID()
        this.clients.set(newSession, String(m.params?.clientInfo?.name || 'assistente'))
        if (this.clients.size > 100) this.clients.delete(this.clients.keys().next().value)
      }
      out.push(await this._rpc(m, this.clients.get(newSession || session) || 'assistente'))
    }
    if (!out.length) return send(202)
    send(200, batch ? out : out[0], newSession ? { 'mcp-session-id': newSession } : {})
  }

  async _rpc(m, client) {
    try {
      switch (m.method) {
        case 'initialize': {
          const asked = m.params?.protocolVersion
          return { jsonrpc: '2.0', id: m.id, result: {
            protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'darkhub', title: 'DarkHub', version: this.app.getVersion() },
            instructions: 'DarkHub tunes Windows through packages (JSON modules and presets). Read darkhub_schema and darkhub_builtins before writing a package, prefer built-in tweaks/operations over raw registry items, check with darkhub_validate and darkhub_inspect, and only then darkhub_install (the user approves it in DarkHub). Everything installed can be removed with darkhub_uninstall, which restores the previous values.'
          } }
        }
        case 'ping': return { jsonrpc: '2.0', id: m.id, result: {} }
        case 'tools/list': return { jsonrpc: '2.0', id: m.id, result: { tools: TOOLS } }
        case 'tools/call': {
          const name = m.params?.name
          if (!TOOLS.some((t) => t.name === name)) return rpcError(m.id, -32602, `ferramenta desconhecida: ${name}`)
          const r = await this.callTool(name, m.params?.arguments || {}, client)
          const isError = r?.ok === false
          return { jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: typeof r === 'string' ? r : JSON.stringify(r, null, 1) }], isError } }
        }
        default: return rpcError(m.id, -32601, `método não suportado: ${m.method}`)
      }
    } catch (e) {
      this.logger?.error?.('MCP', `${m.method}: ${e?.message || e}`)
      return { jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: `Erro: ${e?.message || e}` }], isError: true } }
    }
  }

  // ------------------------------------------------------------------ tools
  async _approved(client, title, preview) {
    const ok = await this.approve({ client, title, preview })
    return ok ? null : { ok: false, error: 'O usuário não aprovou no DarkHub.' }
  }

  async callTool(name, a, client) {
    const lang = a.lang === 'en-US' ? 'en-US' : 'pt-BR'
    switch (name) {
      case 'darkhub_hardware': return { ok: true, hardware: await this.hub.hardware() }
      case 'darkhub_builtins': {
        const q = String(a.query || '').toLowerCase()
        return {
          ok: true,
          items: [...this.hub.builtins()]
            .filter(([id, b]) => (!a.kind || b.kind === a.kind) && (!q || `${id} ${b.title}`.toLowerCase().includes(q)))
            .map(([id, b]) => ({
              ref: `darkhub:${id}`, kind: b.kind, title: b.title, description: b.description, risk: b.risk,
              community: b.kind === 'op' ? b.packageUse === 'yes' && !b.securityRelated : !b.securityRelated,
              ...(b.kind === 'op' ? { reversible: b.reversible, expandsTo: b.tweakIds?.map((t) => `darkhub:${t}`) || null } : {})
            }))
        }
      }
      case 'darkhub_schema': return { ok: true, schema: SCHEMA, docs: 'https://github.com/Pokeralho/darkhub-suite/blob/main/docs/hub/README.md' }
      case 'darkhub_validate': {
        const r = await this.hub.inspect(toText(a.package), lang)
        if (!r.ok) return { ok: false, errors: r.errors }
        return { ok: true, risk: r.risk, applicableHere: r.applicable, items: [...r.rows.map((x) => `${x.group}: ${x.title}${x.target ? ` -> ${x.target}` : ''}`), ...r.skipped.map((x) => `${x.group}: ${x.title} (not on this PC: ${x.reason})`)] }
      }
      case 'darkhub_inspect': return this.hub.inspect(toText(a.package), lang)
      case 'darkhub_install': {
        const text = toText(a.package)
        const preview = await this.hub.inspect(text, 'pt-BR')
        if (!preview.ok) return { ok: false, errors: preview.errors }
        if (!preview.applicable) return { ok: false, error: `Não é para este PC: ${preview.notFor}` }
        const denied = await this._approved(client, `Instalar ${preview.pkg.name}`, preview)
        return denied || this.hub.install(text)
      }
      case 'darkhub_installed': return this.hub.list()
      case 'darkhub_uninstall': {
        const rec = this.hub.record(String(a.id || ''))
        if (!rec) return { ok: false, error: 'Pacote não instalado' }
        const denied = await this._approved(client, `Remover ${textOf(rec.pkg.name, 'pt-BR')}`, { uninstall: { id: rec.pkg.id, version: rec.pkg.version, steps: rec.steps.length } })
        return denied || this.hub.uninstall(rec.pkg.id)
      }
      case 'darkhub_export_my_pc': return this.hub.exportMine({ name: a.name, github: a.github })
      case 'hub_search': return this.catalog.search({ q: a.q, type: a.type, tag: a.tag, tier: a.tier, limit: 20 })
      case 'hub_package': return this.catalog.detail(String(a.id || ''))
      case 'hub_install': {
        const preview = await this.catalog.inspect(String(a.id || ''), 'pt-BR', a.version || 'latest')
        if (!preview.ok) return { ok: false, error: preview.error, errors: preview.errors }
        if (!preview.applicable) return { ok: false, error: `Não é para este PC: ${preview.notFor}` }
        const denied = await this._approved(client, `Instalar ${preview.pkg.name} do Hub`, preview)
        return denied || this.catalog.install(String(a.id), preview.remote.version)
      }
      case 'darkhub_extension_dev_load': {
        if (!this.extensions) return { ok: false, error: 'extensões indisponíveis' }
        const folder = String(a.path || '')
        const { packExtensionFolder } = await import('./extensionPack.js')
        let pkg
        try { pkg = packExtensionFolder(folder) } catch (e) { return { ok: false, error: e.message } }
        const preview = await this.hub.inspect(JSON.stringify(pkg), 'pt-BR')
        if (!preview.ok) return { ok: false, errors: preview.errors }
        const denied = await this._approved(client, `Carregar a extensão ${preview.pkg.name} (desenvolvimento)`, preview)
        return denied || this.extensions.loadDev(folder)
      }
      case 'darkhub_extension_reload': return this.extensions ? this.extensions.reload(a.id) : { ok: false, error: 'extensões indisponíveis' }
      case 'darkhub_extension_logs': return { ok: true, items: this.extensions ? this.extensions.logs(a.id) : [] }
      case 'hub_updates': return this.catalog.updates()
      case 'hub_update': {
        const rec = this.hub.record(String(a.id || ''))
        if (!rec) return { ok: false, error: 'Pacote não instalado' }
        const preview = await this.catalog.inspect(rec.pkg.id, 'pt-BR')
        if (!preview.ok) return { ok: false, error: preview.error, errors: preview.errors }
        const denied = await this._approved(client, `Atualizar ${preview.pkg.name} para v${preview.remote.version}`, preview)
        return denied || this.catalog.update(rec.pkg.id)
      }
      default: return { ok: false, error: 'ferramenta desconhecida' }
    }
  }
}
