import fs from 'node:fs'
import QRCode from 'qrcode'
import path from 'node:path'
import { SusuyaClient, SUSUYA_ORIGIN } from '../services/susuya/SusuyaClient.js'
import { captureScreen, captureRegion, grabRegionImage, listDisplays } from '../services/susuya/Screenshot.js'
import { makeRegionPicker } from '../services/susuya/RegionPicker.js'
import { AiUpscaler } from '../services/susuya/AiUpscaler.js'
import { nativeImage } from 'electron'

const HISTORY_MAX = 100
const TTLS = [3600, 21600, 86400]
const DEFAULT_TTL = 3600
const DEFAULT_HOTKEY = 'Ctrl+Shift+F12'
const DEFAULT_REGION_HOTKEY = 'Ctrl+Shift+F11'
// 'cursor' (display under the mouse), 'primary', 'all' (every display stitched) or a display id
const monitorMode = (v, fallback = 'cursor') => (typeof v === 'string' && (['cursor', 'primary', 'all'].includes(v) || /^\d{1,12}$/.test(v) || /^[^\r\n@]{1,48}@-?\d{1,6},-?\d{1,6}$/.test(v)) ? v : fallback)

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback } }
function writeJson(file, value) {
  try { fs.writeFileSync(`${file}.tmp`, JSON.stringify(value)); fs.renameSync(`${file}.tmp`, file) } catch { /* kept in memory */ }
}

export function normalizeShareConfig(c = {}, picturesDir = '') {
  const isWinStyle = typeof picturesDir === 'string' && /^[A-Za-z]:[\\/]/.test(picturesDir)
  const joinPath = isWinStyle ? path.win32.join : path.join
  return {
    hotkey: typeof c.hotkey === 'string' && c.hotkey.length <= 40 ? c.hotkey : DEFAULT_HOTKEY,
    regionHotkey: typeof c.regionHotkey === 'string' && c.regionHotkey.length <= 40 && c.regionHotkey !== c.hotkey ? c.regionHotkey : DEFAULT_REGION_HOTKEY,
    folder: typeof c.folder === 'string' && path.isAbsolute(c.folder) ? c.folder : joinPath(picturesDir, 'DarkHub Screenshots'),
    autoUpload: c.autoUpload === true,
    copyImage: c.copyImage !== false,
    // what ends up in the clipboard: the picture, the Susuya link (only with auto-upload) or both (paste gives the
    // picture in image apps and the link in text fields)
    clip: ['image', 'link', 'both', 'none'].includes(c.clip) ? c.clip : (c.copyImage === false ? 'none' : (c.autoUpload === true ? 'link' : 'image')),
    sound: c.sound !== false,
    // 1 h by default: longer links only when the user picked them (old configs saved 24 h without asking)
    ttlChosen: c.ttlChosen === true,
    ttl: c.ttlChosen === true && TTLS.includes(Number(c.ttl)) ? Number(c.ttl) : DEFAULT_TTL,
    monitor: monitorMode(c.monitor),
    // Area selection spans every monitor by default, like the Snipping Tool ("under the mouse" never let the area
    // button reach a second monitor). Saved configs from before only keep their value if the user picked it.
    regionMonitorChosen: c.regionMonitorChosen === true,
    regionMonitor: c.regionMonitorChosen === true ? monitorMode(c.regionMonitor, 'all') : 'all',
    // small region captures are enlarged so they stay sharp when pasted/viewed (see upscaleFactor)
    regionUpscale: ['off', 'auto', '2', '3', '4'].includes(String(c.regionUpscale)) ? String(c.regionUpscale) : 'auto',
    upscaleMethod: c.upscaleMethod === 'smooth' ? 'smooth' : 'sharp',
    // Real-ESRGAN enhancement: 'off', 'region' (area selections, under a second) or 'all' (full screens too)
    aiEnhance: ['off', 'region', 'all'].includes(c.aiEnhance) ? c.aiEnhance : 'region',
    aiQuality: c.aiQuality === 'max' ? 'max' : 'fast',
    aiStyle: c.aiStyle === 'anime' ? 'anime' : 'photo'
  }
}

/** `share:*`: Susuya uploads (direct download links) and native-resolution screenshots. */
export function registerShareIPC({ app, ipcMain, dialog, shell, clipboard, hotkeys, BrowserWindow, Notification, logger } = {}) {
  const userData = app.getPath('userData')
  const configFile = path.join(userData, 'share.json')
  const historyFile = path.join(userData, 'susuya-history.json')
  let pictures = ''
  try { pictures = app.getPath('pictures') } catch { pictures = path.join(app.getPath('home'), 'Pictures') }
  let config = normalizeShareConfig(readJson(configFile, {}), pictures)
  let history = readJson(historyFile, [])
  const client = new SusuyaClient()
  const ai = new AiUpscaler()
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

  /** Real-ESRGAN on a saved shot; progress goes to the screen as 'enhance' events. Resolves the result or { error }. */
  async function enhance(file, region) {
    broadcast({ type: 'enhance', file, percent: 0 })
    try {
      const r = await ai.enhance(file, { region, quality: config.aiQuality, style: config.aiStyle }, (percent) => broadcast({ type: 'enhance', file, percent }))
      broadcast({ type: 'enhance', file, percent: 100, done: true, out: r.file, width: r.width, height: r.height, ms: r.ms })
      return r
    } catch (e) {
      const error = String(e?.message ?? e)
      broadcast({ type: 'enhance', file, error })
      return { error }
    }
  }

  async function enhanceInBackground(shot, region) {
    const r = await enhance(shot.file, region)
    let file = shot.file
    let image = shot.image
    if (!r.error) {
      file = r.file
      image = nativeImage.createFromPath(r.file)
      // swap the clipboard picture only if it is still the one this shot put there
      if (config.clip === 'image' || config.clip === 'both' || (config.clip === 'link' && !config.autoUpload)) {
        try {
          const cur = clipboard.readImage()
          const a = cur.getSize(), b = shot.image.getSize()
          if (!cur.isEmpty() && a.width === b.width && a.height === b.height) clipboard.writeImage(image)
        } catch { /* clipboard busy */ }
      }
    }
    if (config.autoUpload) {
      const u = await upload(file, 'screenshot')
      if (u.ok) {
        try {
          if (config.clip === 'link') clipboard.writeText(u.entry.directUrl)
          else if (config.clip === 'both') clipboard.write({ image, text: u.entry.directUrl })
        } catch { /* clipboard busy */ }
      }
      notify(u.ok ? 'DarkHub: print aprimorado enviado ao Susuya' : 'DarkHub: print salvo', r.error ? `IA falhou: ${r.error}` : u.ok ? `${r.width}x${r.height} · link copiado` : `Falha ao enviar: ${u.error}`)
      return
    }
    notify(r.error ? 'DarkHub: IA falhou' : 'DarkHub: print aprimorado', r.error ? r.error : `${r.width}x${r.height} · ${path.basename(r.file)}`)
  }

  async function capture(region = false) {
    const useAi = ai.available() && (config.aiEnhance === 'all' || (config.aiEnhance === 'region' && region))
    const shot = region
      // with AI on, the plain pixel enlargement is skipped: the AI result replaces it
      ? await captureRegion(config.folder, pickRegion, config.regionMonitor, { upscale: useAi ? 'off' : config.regionUpscale, method: config.upscaleMethod })
      : await captureScreen(config.folder, config.monitor)
    if (!shot) return { ok: true, cancelled: true }
    // the main window plays the shutter sound right away (also when DarkHub is in the tray), before any AI work
    broadcast({ type: 'screenshot', file: shot.file, width: shot.width, height: shot.height, bytes: shot.bytes, ms: shot.ms, scale: shot.scale || 1, sound: config.sound })
    // AI runs in the background: the plain shot is copied/saved now, the enhanced one replaces it when ready
    // (and is what gets uploaded when auto-upload is on).
    if (useAi) setImmediate(() => { enhanceInBackground(shot, region).catch((e) => logger?.warn?.('Share', `enhance: ${e?.message ?? e}`)) })
    const aiNote = useAi ? ' · aprimorando com IA...' : ''
    if (config.clip === 'image' || config.clip === 'both' || (config.clip === 'link' && !config.autoUpload)) { try { clipboard.writeImage(shot.image) } catch { /* clipboard busy */ } }
    const info = { file: shot.file, width: shot.width, height: shot.height, bytes: shot.bytes, ms: shot.ms, scale: shot.scale || 1 }
    const size = (shot.scale > 1 ? `${shot.width}x${shot.height} (ampliado ${Math.round(shot.scale * 10) / 10}x)` : `${shot.width}x${shot.height}`) + aiNote
    if (config.autoUpload && !useAi) {
      const r = await upload(shot.file, 'screenshot')
      if (r.ok) {
        try {
          if (config.clip === 'link') clipboard.writeText(r.entry.directUrl)
          else if (config.clip === 'both') clipboard.write({ image: shot.image, text: r.entry.directUrl })
        } catch { /* clipboard busy */ }
        const copied = config.clip === 'link' ? 'link direto copiado' : config.clip === 'both' ? 'imagem e link copiados' : config.clip === 'image' ? 'imagem copiada' : 'link no histórico'
        notify('DarkHub: print enviado ao Susuya', `${size} · ${copied}`)
        return { ok: true, ...info, entry: r.entry }
      }
      notify('DarkHub: print salvo', `Falha ao enviar: ${r.error}`)
      return { ok: true, ...info, uploadError: r.error }
    }
    notify('DarkHub: print salvo', `${size} · ${path.basename(shot.file)}`)
    return { ok: true, ...info }
  }

  // two hotkeys: full screen and region selection (watched without taking the key from the game)
  const registered = { hotkey: null, regionHotkey: null }
  const bindHotkey = (key, accelerator) => {
    registered[key] = null
    const region = key === 'regionHotkey'
    const r = hotkeys.register(region ? 'shotRegion' : 'shot', accelerator, () => { capture(region).catch((e) => logger?.warn?.('Share', `capture: ${e?.message ?? e}`)) })
    if (!r.ok) return { ok: false, error: r.error === 'in-use' ? 'atalho já usado por outra função do DarkHub' : 'atalho inválido' }
    registered[key] = r.hotkey || null
    return { ok: true }
  }

  const handle = (channel, fn) => ipcMain.handle(channel, async (event, payload) => {
    try { return await fn(payload ?? {}, event) } catch (err) {
      logger?.error?.('Share', `${channel}: ${err?.message ?? err}`)
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  const state = () => ({ ok: true, config, hotkeyActive: Boolean(registered.hotkey), regionHotkeyActive: Boolean(registered.regionHotkey), history: liveHistory().map(publicEntry), uploading: jobs.size })
  handle('share:state', state)
  handle('share:displays', () => ({ ok: true, displays: listDisplays() }))
  handle('share:aiStatus', () => ({ ok: true, available: ai.available() }))
  // AI enhancement of a screenshot DarkHub saved (same folder rule as share:uploadFile)
  handle('share:enhance', async ({ file }) => {
    const f = String(file || '')
    if (path.dirname(path.resolve(f)) !== path.resolve(config.folder) || !fs.existsSync(f) || /_ultra\.png$/i.test(f)) return { ok: false, error: 'invalid file' }
    const r = await enhance(f, false)
    return r.error ? { ok: false, error: r.error } : { ok: true, file: r.file, width: r.width, height: r.height, ms: r.ms }
  })
  handle('share:setConfig', (patch) => {
    if (patch.hotkey && patch.hotkey === (patch.regionHotkey ?? config.regionHotkey)) return { ...state(), error: 'atalho já usado pelo print de área' }
    if (patch.regionHotkey && patch.regionHotkey === (patch.hotkey ?? config.hotkey)) return { ...state(), error: 'atalho já usado pelo print da tela inteira' }
    const next = normalizeShareConfig({ ...config, ...patch, ...('ttl' in patch ? { ttlChosen: true } : {}), ...('regionMonitor' in patch ? { regionMonitorChosen: true } : {}) }, pictures)
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
  // QR code of a Susuya link, so a phone camera opens the file without typing (same as the site)
  handle('share:qr', async ({ text }) => {
    const s = String(text || '')
    if (!s.startsWith(`${SUSUYA_ORIGIN}/`) || s.length > 200) return { ok: false, error: 'only Susuya links' }
    return { ok: true, dataUrl: await QRCode.toDataURL(s, { errorCorrectionLevel: 'M', margin: 1, width: 280, color: { dark: '#0d1014', light: '#ffffff' } }) }
  })
  handle('share:capture', () => capture())
  handle('share:captureRegion', () => capture(true))
  // Screen area → PNG data URL for another screen (OCR). DarkHub steps aside so it is not in the picture.
  handle('share:grabRegion', async (_p, event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.minimize()
    await new Promise((r) => setTimeout(r, 350))
    try {
      const img = await grabRegionImage(pickRegion, config.regionMonitor)
      return img ? { ok: true, dataUrl: img.toDataURL(), width: img.getSize().width, height: img.getSize().height } : { ok: true, cancelled: true }
    } finally {
      win?.restore()
      win?.focus()
    }
  })
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
}

export default registerShareIPC
