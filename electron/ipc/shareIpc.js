import fs from 'node:fs'
import path from 'node:path'
import { SusuyaClient, SUSUYA_ORIGIN } from '../services/susuya/SusuyaClient.js'
import { captureScreen, captureRegion } from '../services/susuya/Screenshot.js'
import { makeRegionPicker } from '../services/susuya/RegionPicker.js'

const HISTORY_MAX = 100
const TTLS = [3600, 21600, 86400]
const DEFAULT_HOTKEY = 'Ctrl+Shift+F12'
const DEFAULT_REGION_HOTKEY = 'Ctrl+Shift+F11'

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback } }
function writeJson(file, value) {
  try { fs.writeFileSync(`${file}.tmp`, JSON.stringify(value)); fs.renameSync(`${file}.tmp`, file) } catch { /* kept in memory */ }
}

export function normalizeShareConfig(c = {}, picturesDir = '') {
  return {
    hotkey: typeof c.hotkey === 'string' && c.hotkey.length <= 40 ? c.hotkey : DEFAULT_HOTKEY,
    regionHotkey: typeof c.regionHotkey === 'string' && c.regionHotkey.length <= 40 && c.regionHotkey !== c.hotkey ? c.regionHotkey : DEFAULT_REGION_HOTKEY,
    folder: typeof c.folder === 'string' && path.isAbsolute(c.folder) ? c.folder : path.join(picturesDir, 'DarkHub Screenshots'),
    autoUpload: c.autoUpload === true,
    copyImage: c.copyImage !== false,
    ttl: TTLS.includes(Number(c.ttl)) ? Number(c.ttl) : 86400
  }
}

/** `share:*`: Susuya uploads (direct download links) and native-resolution screenshots. */
export function registerShareIPC({ app, ipcMain, dialog, shell, clipboard, globalShortcut, BrowserWindow, Notification, logger } = {}) {
  const userData = app.getPath('userData')
  const configFile = path.join(userData, 'share.json')
  const historyFile = path.join(userData, 'susuya-history.json')
  let pictures = ''
  try { pictures = app.getPath('pictures') } catch { pictures = path.join(app.getPath('home'), 'Pictures') }
  let config = normalizeShareConfig(readJson(configFile, {}), pictures)
  let history = readJson(historyFile, [])
  const client = new SusuyaClient()
  const jobs = new Map() // jobId -> AbortController
  let seq = 0

  const broadcast = (msg) => { for (const w of BrowserWindow.getAllWindows()) { try { w.webContents.send('share:event', msg) } catch { /* closing */ } } }
  const notify = (title, body) => { try { if (Notification?.isSupported?.()) new Notification({ title, body }).show() } catch { /* unavailable */ } }
  const liveHistory = () => (history = history.filter((h) => h.expiresAt > Date.now()))

  async function upload(file, origin = 'manual') {
    const jobId = `u${++seq}`
    const ctrl = new AbortController()
    jobs.set(jobId, ctrl)
    const name = path.basename(file)
    broadcast({ type: 'start', jobId, name, origin })
    let last = 0
    try {
      const r = await client.upload(file, {
        ttl: config.ttl,
        signal: ctrl.signal,
        onProgress: (sent, total) => {
          const now = Date.now()
          if (now - last > 150 || sent === total) { last = now; broadcast({ type: 'progress', jobId, sent, total }) }
        }
      })
      const entry = { id: r.id, name: r.name, size: r.size, kind: r.kind, createdAt: r.createdAt, expiresAt: r.expiresAt, deleteToken: r.deleteToken, pageUrl: r.pageUrl, directUrl: r.directUrl, origin }
      history = [entry, ...liveHistory().filter((h) => h.id !== r.id)].slice(0, HISTORY_MAX)
      writeJson(historyFile, history)
      broadcast({ type: 'done', jobId, entry: publicEntry(entry) })
      return { ok: true, entry: publicEntry(entry) }
    } catch (e) {
      const error = ctrl.signal.aborted ? 'cancelled' : String(e?.message ?? e)
      broadcast({ type: 'error', jobId, name, error })
      return { ok: false, error }
    } finally {
      jobs.delete(jobId)
    }
  }
  // the delete token stays in the main process
  const publicEntry = ({ deleteToken, ...rest }) => rest

  const pickRegion = makeRegionPicker(BrowserWindow)

  async function capture(region = false) {
    const shot = region ? await captureRegion(config.folder, pickRegion) : await captureScreen(config.folder)
    if (!shot) return { ok: true, cancelled: true }
    if (config.copyImage) { try { clipboard.writeImage(shot.image) } catch { /* clipboard busy */ } }
    const info = { file: shot.file, width: shot.width, height: shot.height, bytes: shot.bytes, ms: shot.ms }
    broadcast({ type: 'screenshot', ...info })
    if (config.autoUpload) {
      const r = await upload(shot.file, 'screenshot')
      if (r.ok) {
        clipboard.writeText(r.entry.directUrl)
        notify('DarkHub: print enviado ao Susuya', `${shot.width}x${shot.height} · link direto copiado`)
        return { ok: true, ...info, entry: r.entry }
      }
      notify('DarkHub: print salvo', `Falha ao enviar: ${r.error}`)
      return { ok: true, ...info, uploadError: r.error }
    }
    notify('DarkHub: print salvo', `${shot.width}x${shot.height} · ${path.basename(shot.file)}`)
    return { ok: true, ...info }
  }

  // two global shortcuts: full screen and region selection
  const registered = { hotkey: null, regionHotkey: null }
  const bindHotkey = (key, accelerator) => {
    if (registered[key]) { try { globalShortcut.unregister(registered[key]) } catch { /* gone */ } registered[key] = null }
    if (!accelerator) return { ok: true }
    const region = key === 'regionHotkey'
    try {
      if (!globalShortcut.register(accelerator, () => { capture(region).catch((e) => logger?.warn?.('Share', `capture: ${e?.message ?? e}`)) })) {
        return { ok: false, error: 'atalho em uso por outro programa' }
      }
      registered[key] = accelerator
      return { ok: true }
    } catch (e) {
      return { ok: false, error: `atalho inválido: ${e?.message ?? e}` }
    }
  }

  const handle = (channel, fn) => ipcMain.handle(channel, async (event, payload) => {
    try { return await fn(payload ?? {}, event) } catch (err) {
      logger?.error?.('Share', `${channel}: ${err?.message ?? err}`)
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  const state = () => ({ ok: true, config, hotkeyActive: Boolean(registered.hotkey), regionHotkeyActive: Boolean(registered.regionHotkey), history: liveHistory().map(publicEntry), uploading: jobs.size })
  handle('share:state', state)
  handle('share:setConfig', (patch) => {
    if (patch.hotkey && patch.hotkey === (patch.regionHotkey ?? config.regionHotkey)) return { ...state(), error: 'atalho já usado pelo print de área' }
    if (patch.regionHotkey && patch.regionHotkey === (patch.hotkey ?? config.hotkey)) return { ...state(), error: 'atalho já usado pelo print da tela inteira' }
    const next = normalizeShareConfig({ ...config, ...patch }, pictures)
    for (const key of ['hotkey', 'regionHotkey']) {
      if (next[key] === config[key] && registered[key]) continue
      const hk = bindHotkey(key, next[key])
      if (!hk.ok) { bindHotkey(key, config[key]); return { ...state(), error: hk.error } }
    }
    config = next
    writeJson(configFile, config)
    return state()
  })
  handle('share:pickAndUpload', async (_p, event) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { properties: ['openFile', 'multiSelections'] })
    if (r.canceled) return { ok: true, results: [] }
    const results = []
    for (const f of r.filePaths) results.push(await upload(f))
    return { ok: true, results }
  })
  // Paths of files the user dropped (resolved by preload webUtils): only existing regular files are accepted.
  handle('share:uploadPaths', async ({ paths }) => {
    const files = (Array.isArray(paths) ? paths : []).map(String).filter((p) => { try { return path.isAbsolute(p) && fs.statSync(p).isFile() } catch { return false } }).slice(0, 20)
    const results = []
    for (const f of files) results.push(await upload(f))
    return { ok: true, results }
  })
  handle('share:cancel', ({ jobId }) => { jobs.get(String(jobId))?.abort(); return { ok: true } })
  handle('share:delete', async ({ id }) => {
    const entry = history.find((h) => h.id === id)
    if (!entry) return { ok: false, error: 'not found' }
    try { await client.remove(entry.id, entry.deleteToken) } catch (e) { if (!/not found|404|410/i.test(String(e.message))) throw e }
    history = history.filter((h) => h.id !== id)
    writeJson(historyFile, history)
    return state()
  })
  handle('share:copy', ({ text }) => {
    const s = String(text || '')
    if (!s.startsWith(`${SUSUYA_ORIGIN}/`)) return { ok: false, error: 'only Susuya links' }
    clipboard.writeText(s)
    return { ok: true }
  })
  handle('share:capture', () => capture())
  handle('share:captureRegion', () => capture(true))
  handle('share:openFolder', async () => { fs.mkdirSync(config.folder, { recursive: true }); await shell.openPath(config.folder); return { ok: true } })
  handle('share:uploadFile', async ({ file }) => {
    const f = String(file || '')
    // only screenshots DarkHub saved can be re-sent by path from the renderer
    if (path.dirname(path.resolve(f)) !== path.resolve(config.folder) || !fs.existsSync(f)) return { ok: false, error: 'invalid file' }
    return upload(f, 'screenshot')
  })
  handle('share:recentShots', () => {
    let files = []
    try {
      files = fs.readdirSync(config.folder).filter((n) => /\.png$/i.test(n)).map((n) => {
        const p = path.join(config.folder, n)
        const st = fs.statSync(p)
        return { file: p, name: n, bytes: st.size, at: st.mtimeMs }
      }).sort((a, b) => b.at - a.at).slice(0, 12)
    } catch { /* folder not created yet */ }
    return { ok: true, files }
  })

  app.whenReady().then(() => { bindHotkey('hotkey', config.hotkey); bindHotkey('regionHotkey', config.regionHotkey) })
  app.on('will-quit', () => { for (const acc of Object.values(registered)) { if (acc) { try { globalShortcut.unregister(acc) } catch { /* gone */ } } } })
}

export default registerShareIPC
