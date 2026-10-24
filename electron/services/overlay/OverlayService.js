// In-game overlay: a transparent, click-through, always-on-top window over the game's monitor showing PresentMon frame
// stats plus the app's own sensors. Works over borderless/windowed games (exclusive fullscreen is not composited).
// Nothing is injected into the game.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FrameWindow } from './frameStats.js'
import { normalizeSettings, readSensors, buildRows } from './overlayModel.js'

const PAGE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'overlay', 'overlay.html')
const FOLLOW_MS = 2000
const DEFAULT_LABELS = { fps: 'FPS', low1: '1% low', frametime: 'Frame', latency: 'Latência', cpuTemp: 'CPU °C', cpuPower: 'CPU W', gpuTemp: 'GPU °C', gpuClock: 'GPU clk' }

export class OverlayService {
  constructor({ app, BrowserWindow, screen, globalShortcut, presentMon, hardware, native, onEvent }) {
    Object.assign(this, { app, BrowserWindow, screen, globalShortcut, presentMon, hardware, native, onEvent })
    this.file = path.join(app.getPath('userData'), 'overlay.json')
    this.win = null
    this.visible = false
    this.target = null // { pid, name }
    this.mode = 'foreground'
    this.window = new FrameWindow()
    this.session = []
    this.lastSession = null
    this.timers = []
    this.hotkey = null
    this.error = null
    let saved = {}
    try { saved = JSON.parse(fs.readFileSync(this.file, 'utf8')) } catch { /* defaults */ }
    this.settings = normalizeSettings(saved)
    this.labels = { ...DEFAULT_LABELS, ...(saved.labels || {}) }
    presentMon.on('frame', (f) => {
      if (this.target && f.pid !== this.target.pid) return
      this.window.push(f)
      if (f.msBetweenPresents > 0 && this.session.length < 500000) this.session.push(f.msBetweenPresents)
    })
    presentMon.on('exit', ({ error }) => { if (error) this.error = error; this._emit() })
    this._bindHotkey()
  }

  _save() { fs.writeFileSync(this.file, JSON.stringify({ ...this.settings, labels: this.labels }, null, 1)) }
  _emit() { this.onEvent?.(this.status()) }

  status() {
    return {
      ok: true, visible: this.visible, settings: this.settings, target: this.target, mode: this.mode,
      capturing: this.presentMon.running, presentMonInstalled: this.presentMon.installed(), error: this.error,
      stats: this.window.stats(), lastSession: this.lastSession
    }
  }

  setSettings(patch = {}) {
    if (patch.labels && typeof patch.labels === 'object') this.labels = { ...this.labels, ...patch.labels }
    const prevHotkey = this.settings.hotkey
    this.settings = normalizeSettings({ ...this.settings, ...patch })
    this._save()
    let hotkeyError = null
    if (this.settings.hotkey !== prevHotkey) hotkeyError = this._bindHotkey()
    if (this.visible) { this._place(); this._restartLoop() }
    return { ...this.status(), hotkeyError }
  }

  _bindHotkey() {
    if (this.hotkey) { try { this.globalShortcut.unregister(this.hotkey) } catch { /* gone */ } this.hotkey = null }
    if (!this.settings.hotkey) return null
    try {
      if (!this.globalShortcut.register(this.settings.hotkey, () => { void this.toggle() })) return 'in-use'
      this.hotkey = this.settings.hotkey
      return null
    } catch { return 'invalid' }
  }

  _place() {
    if (!this.win) return
    const d = this.screen.getDisplayNearestPoint(this.screen.getCursorScreenPoint())
    this.win.setBounds(d.bounds)
  }

  _ensureWindow() {
    if (this.win && !this.win.isDestroyed()) return this.win
    const win = new this.BrowserWindow({
      show: false, frame: false, transparent: true, resizable: false, movable: false, focusable: false, skipTaskbar: true,
      alwaysOnTop: true, hasShadow: false, fullscreenable: false, backgroundColor: '#00000000',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
    })
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setIgnoreMouseEvents(true)
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    win.loadFile(PAGE).catch((e) => { this.error = `overlay page: ${e?.message ?? e}` })
    win.on('closed', () => { this.win = null; this.visible = false })
    this.win = win
    return win
  }

  async show({ pid = null } = {}) {
    this.error = null
    // fetch PresentMon now (first use), so the first game is measured at once and a download error shows up here
    try { await this.presentMon.ensure() } catch (e) { this.error = String(e?.message ?? e) }
    this._ensureWindow()
    this._place()
    this.win.showInactive()
    this.visible = true
    this.mode = pid ? 'fixed' : 'foreground'
    this.hardware.holdSensors('overlay')
    if (pid) await this._attach(Number(pid))
    else await this._follow()
    this._restartLoop()
    this._emit()
    return this.status()
  }

  hide() {
    this._stopLoop()
    this.presentMon.stop()
    this._closeSession()
    this.hardware.releaseSensors('overlay')
    if (this.win && !this.win.isDestroyed()) this.win.hide()
    this.visible = false
    this.target = null
    this._emit()
    return this.status()
  }

  async toggle() { return this.visible ? this.hide() : this.show() }

  _closeSession() {
    if (this.session.length < 30 || !this.target) { this.session = []; return }
    const s = [...this.session].sort((a, b) => a - b)
    const p = (q) => s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]
    const total = this.session.reduce((a, b) => a + b, 0)
    this.lastSession = { name: this.target.name, frames: s.length, seconds: Math.round(total / 1000), avgFps: (s.length * 1000) / total, low1: 1000 / p(0.99), low01: 1000 / p(0.999), maxFrameTimeMs: s[s.length - 1], at: Date.now() }
    this.session = []
  }

  async _attach(pid, name = '') {
    if (this.target?.pid === pid && this.presentMon.running) return
    this._closeSession()
    this.window.reset()
    this.target = { pid, name }
    try {
      await this.presentMon.start({ pid })
    } catch (e) {
      this.error = String(e?.message ?? e)
    }
    this._emit()
  }

  /** Foreground mode: attach to whatever app is in front (never DarkHub itself). */
  async _follow() {
    const list = await this.native.listProcesses().catch(() => null)
    const fg = list?.foregroundPid
    if (!fg || fg <= 4 || fg === process.pid) return
    const isOwn = this.BrowserWindow.getAllWindows().some((w) => { try { return w.webContents.getOSProcessId() === fg } catch { return false } })
    if (isOwn) return
    const name = list.processes.find((p) => p.pid === fg)?.name || ''
    if (/^(explorer|searchhost|startmenuexperiencehost|shellexperiencehost|textinputhost|lockapp)$/i.test(String(name).replace(/\.exe$/i, ''))) return
    await this._attach(fg, name)
  }

  _restartLoop() {
    this._stopLoop()
    this.timers.push(setInterval(() => this._render(), this.settings.intervalMs))
    if (this.mode === 'foreground') this.timers.push(setInterval(() => { void this._follow() }, FOLLOW_MS))
  }

  _stopLoop() { for (const t of this.timers) clearInterval(t); this.timers = [] }

  _render() {
    if (!this.win || this.win.isDestroyed() || !this.visible) return
    const frames = this.window.stats()
    const sensors = readSensors(this.hardware.snapshot())
    const rows = buildRows(this.settings, frames, sensors, this.labels)
    const data = { settings: this.settings, rows, graph: this.settings.metrics.includes('graph') && frames ? frames.graph : null }
    this.win.webContents.executeJavaScript(`window.__overlay && window.__overlay(${JSON.stringify(data)})`).catch(() => {})
    this._log(frames, sensors)
  }

  _log(frames, sensors) {
    const dir = this.settings.logFolder
    if (!dir || !frames || !this.target) return
    const now = Date.now()
    if (this._lastLog && now - this._lastLog < 1000) return
    this._lastLog = now
    try {
      const file = path.join(dir, `darkhub-${String(this.target.name || this.target.pid).replace(/[^\w.-]/g, '_')}-${new Date().toISOString().slice(0, 10)}.csv`)
      if (!fs.existsSync(file)) fs.writeFileSync(file, 'time,fps,frametime_ms,low1_fps,cpu_pct,cpu_c,gpu_pct,gpu_c,vram_mb\n')
      const f = (x, d = 1) => (Number.isFinite(Number(x)) ? Number(x).toFixed(d) : '')
      fs.appendFileSync(file, `${new Date(now).toISOString()},${f(frames.fps)},${f(frames.frameTimeMs, 2)},${f(frames.low1)},${f(sensors.cpu)},${f(sensors.cpuTemp)},${f(sensors.gpu)},${f(sensors.gpuTemp)},${f(sensors.vramMb, 0)}\n`)
    } catch { /* folder gone */ }
  }

  dispose() {
    this.hide()
    if (this.hotkey) { try { this.globalShortcut.unregister(this.hotkey) } catch { /* gone */ } }
    if (this.win && !this.win.isDestroyed()) this.win.destroy()
  }
}
