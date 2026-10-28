import crypto from 'node:crypto'
import fs from 'node:fs'
import { HubService } from '../services/hub/HubService.js'
import { MAX_PACKAGE_BYTES } from '../services/hub/hubModel.js'
import DeepTweaksEngine from '../services/optimizer/DeepTweaksEngine.js'
import SystemOptimizerService from '../services/optimizer/SystemOptimizerService.js'
import { HubCatalog } from '../services/hub/HubCatalog.js'
import { HubMcp } from '../services/hub/HubMcp.js'
import { ExtensionHost } from '../services/hub/ExtensionHost.js'
import { packExtensionFolder } from '../services/hub/extensionPack.js'
import HardwareService from '../services/HardwareService.js'
import path from 'node:path'
import { Notification, clipboard, shell, screen, desktopCapturer } from 'electron'
import { ScreenPicker } from '../services/screenPicker/ScreenPicker.js'

const PKG_ID = /^[a-z0-9][a-z0-9-]{1,38}\.[a-z0-9][a-z0-9-]{1,62}$/

/**
 * `hub:*`: DarkHub packages (modules/presets) from files and from the Hub (hub.darkhub.ink): inspect (dry run), install,
 * uninstall, update, export this PC; the MCP server for AI assistants and its approval prompts; darkhub:// links.
 * Returns { openLink(url), init() }.
 */
export function registerHubIPC({ app, ipcMain, dialog, BrowserWindow, logger, getMainWindow, showMainWindow } = {}) {
  const svc = new HubService({ app, tweaks: DeepTweaksEngine, optimizer: SystemOptimizerService })
  const catalog = new HubCatalog({ app, hub: svc })
  const send = (payload) => { const w = getMainWindow?.(); if (w && !w.isDestroyed()) w.webContents.send('hub:event', payload) }
  const focus = () => { try { showMainWindow?.() } catch { /* window being created */ } const w = getMainWindow?.(); if (w && !w.isDestroyed()) { if (w.isMinimized()) w.restore(); w.show(); w.focus() } }

  // MCP approvals: the request waits until the user answers in the window (5 minutes, then it counts as "no")
  const approvals = new Map()
  const approve = (req) => new Promise((resolve) => {
    const w = getMainWindow?.()
    if (!w || w.isDestroyed()) return resolve(false)
    const id = crypto.randomUUID()
    const timer = setTimeout(() => { approvals.delete(id); send({ type: 'approvalClosed', id }); resolve(false) }, 5 * 60_000)
    approvals.set(id, (ok) => { clearTimeout(timer); approvals.delete(id); resolve(ok) })
    focus()
    send({ type: 'approval', id, ...req })
  })
  const picker = new ScreenPicker({ BrowserWindow, screen, desktopCapturer, ipcMain, getMainWindow })
  const host = new ExtensionHost({
    app, hub: svc, catalog, approve,
    sensors: { read: () => HardwareService.snapshot(), hold: (tag) => HardwareService.holdSensors(tag), release: (tag) => HardwareService.releaseSensors(tag) },
    notify: async (title, body) => { if (Notification.isSupported()) new Notification({ title, body }).show() },
    clipboard: (t) => clipboard.writeText(t),
    openExternal: (url) => shell.openExternal(url),
    pickColor: () => picker.pick()
  })

  // development: extensions loaded from a folder, rebuilt and reloaded when a file changes
  const devFile = path.join(app.getPath('userData'), 'hub', 'dev-extensions.json')
  const watchers = new Map() // folder -> { watcher, id }
  const readDev = () => { try { return JSON.parse(fs.readFileSync(devFile, 'utf8')) } catch { return [] } }
  const writeDev = (list) => { fs.mkdirSync(path.dirname(devFile), { recursive: true }); fs.writeFileSync(devFile, JSON.stringify(list, null, 1)) }
  const loadDevFolder = async (folder) => {
    let pkg
    try { pkg = packExtensionFolder(folder) } catch (e) { return { ok: false, error: e.message } }
    const r = await svc.install(JSON.stringify(pkg), { source: { dev: folder }, replace: true })
    if (r.ok) send({ type: 'extReload', id: pkg.id })
    return { ...r, id: pkg.id, folder }
  }
  const watchDev = (folder) => {
    if (watchers.has(folder)) return
    let timer = null
    try {
      const watcher = fs.watch(folder, { recursive: true }, () => {
        clearTimeout(timer)
        timer = setTimeout(async () => {
          const r = await loadDevFolder(folder)
          if (!r.ok) { host.log(r.id || folder, 'error', [`Recarga falhou: ${r.error}`]); send({ type: 'extDevError', folder, error: r.error }) }
        }, 250)
      })
      watchers.set(folder, watcher)
    } catch (e) { logger?.warn?.('Hub', `watch ${folder}: ${e.message}`) }
  }
  const addDev = async (folder) => {
    const r = await loadDevFolder(folder)
    if (!r.ok) return r
    writeDev([...new Set([...readDev(), folder])])
    watchDev(folder)
    return r
  }
  const extensions = {
    loadDev: addDev,
    logs: (id) => host.getLogs(String(id || '')),
    reload: async (id) => { const rec = svc.record(String(id || '')); return rec?.source?.dev ? loadDevFolder(rec.source.dev) : { ok: false, error: 'não é uma extensão em desenvolvimento' } }
  }
  const mcp = new HubMcp({ app, hub: svc, catalog, approve, logger, extensions })

  // darkhub://hub/install?id=<id> (the "Install in DarkHub" button on the site): only opens the preview, never installs
  let pendingLink = null
  const openLink = (url) => {
    let id = ''
    try { const u = new URL(url); if (u.protocol === 'darkhub:' && u.hostname === 'hub') id = u.searchParams.get('id') || '' } catch { return false }
    if (!PKG_ID.test(id)) return false
    pendingLink = { id }
    focus()
    send({ type: 'open', id })
    return true
  }
  const handle = (channel, fn) => ipcMain.handle(channel, async (event, payload) => {
    try { return await fn(payload ?? {}, event) } catch (err) {
      logger?.error?.('Hub', `${channel}: ${err?.message ?? err}`)
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  const text = (p) => (typeof p.text === 'string' ? p.text : '')

  handle('hub:list', () => svc.list())
  handle('hub:hardware', async ({ force }) => ({ ok: true, hardware: await svc.hardware(Boolean(force)) }))
  handle('hub:builtins', () => ({ ok: true, builtins: [...svc.builtins()].map(([id, b]) => ({ id: `darkhub:${id}`, ...b })) }))
  handle('hub:install', (p) => svc.install(text(p)))
  handle('hub:uninstall', ({ id }) => svc.uninstall(String(id || '')))
  handle('hub:exportMine', ({ name, github }) => svc.exportMine({ name, github }))
  handle('hub:inspect', (p) => svc.inspect(text(p), p.lang === 'en-US' ? 'en-US' : 'pt-BR'))
  handle('hub:catalog:server', () => ({ ok: true, server: catalog.publicServer() }))
  handle('hub:catalog:setServer', ({ url }) => catalog.setServer(String(url || '').trim()))
  handle('hub:catalog:search', (p) => catalog.search(p))
  handle('hub:catalog:detail', ({ id }) => catalog.detail(String(id || '')))
  handle('hub:catalog:inspect', ({ id, version, lang }) => catalog.inspect(String(id || ''), lang === 'en-US' ? 'en-US' : 'pt-BR', version || 'latest'))
  handle('hub:catalog:install', ({ id, version }) => catalog.install(String(id || ''), version || 'latest'))
  handle('hub:catalog:updates', () => catalog.updates())
  handle('hub:catalog:update', ({ id }) => catalog.update(String(id || '')))
  handle('hub:pendingLink', ({ peek }) => { const p = pendingLink; if (!peek) pendingLink = null; return { ok: true, link: p } })
  handle('hub:mcp:status', () => mcp.status())
  handle('hub:mcp:setEnabled', ({ on }) => mcp.setEnabled(Boolean(on)))
  handle('hub:mcp:regenerate', () => mcp.regenerateToken())
  handle('ext:doc', ({ id, contribution, kind, lang }) => host.doc(String(id || ''), String(contribution || ''), kind === 'widgets' ? 'widgets' : 'pages', lang === 'en-US' ? 'en-US' : 'pt-BR'))
  handle('ext:call', async ({ id, method, params }) => {
    try { return { ok: true, value: await host.call(String(id || ''), String(method || ''), params && typeof params === 'object' ? params : {}) } } catch (e) { return { ok: false, error: e?.message || String(e) } }
  })
  handle('ext:log', ({ id, level, args }) => { host.log(String(id || ''), String(level || 'log'), Array.isArray(args) ? args.slice(0, 20) : []); return { ok: true } })
  handle('ext:logs', ({ id }) => ({ ok: true, items: host.getLogs(String(id || '')) }))
  handle('ext:devList', () => ({ ok: true, folders: readDev() }))
  handle('ext:devAdd', async (_p, event) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { properties: ['openDirectory'], title: 'Pasta da extensão (com darkhub-extension.json)' })
    if (r.canceled || !r.filePaths[0]) return { ok: true, canceled: true }
    return addDev(r.filePaths[0])
  })
  handle('ext:devRemove', ({ folder }) => { watchers.get(folder)?.close(); watchers.delete(folder); writeDev(readDev().filter((f) => f !== folder)); return { ok: true } })
  handle('hub:mcp:answer', ({ id, ok }) => { const f = approvals.get(String(id || '')); if (f) f(ok === true); return { ok: Boolean(f) } })
  handle('hub:openFile', async (_p, event) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { properties: ['openFile'], filters: [{ name: 'DarkHub', extensions: ['json'] }] })
    if (r.canceled || !r.filePaths[0]) return { ok: true, canceled: true }
    const st = fs.statSync(r.filePaths[0])
    if (st.size > MAX_PACKAGE_BYTES) return { ok: false, error: 'Arquivo maior que 512 KB.' }
    return { ok: true, text: fs.readFileSync(r.filePaths[0], 'utf8'), file: r.filePaths[0] }
  })
  handle('hub:saveFile', async ({ text: content, name }, event) => {
    const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), { defaultPath: `${String(name || 'preset').replace(/[^\w.-]/g, '_')}.darkhub.json`, filters: [{ name: 'DarkHub', extensions: ['json'] }] })
    if (r.canceled || !r.filePath) return { ok: true, canceled: true }
    fs.writeFileSync(r.filePath, String(content || ''), 'utf8')
    return { ok: true, file: r.filePath }
  })

  const init = async () => {
    await mcp.init().catch((e) => logger?.error?.('MCP', e?.message || String(e)))
    for (const folder of readDev()) if (fs.existsSync(folder)) { await loadDevFolder(folder); watchDev(folder) }
  }
  return { openLink, init, extResponse: (request) => host.response(request), stop: () => { for (const w of watchers.values()) w.close(); return mcp.stop() } }
}

export default registerHubIPC
