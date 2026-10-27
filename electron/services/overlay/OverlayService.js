// In-game overlay: a transparent, click-through, always-on-top window over the game's monitor showing PresentMon frame
// stats plus the app's own sensors. Works over borderless/windowed games (exclusive fullscreen is not composited).
// Nothing is injected into the game.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FrameWindow, SessionStats } from './frameStats.js'
import { normalizeSettings, readSensors, buildRows, buildPanel } from './overlayModel.js'
import { readLhm } from './lhmModel.js'
import { normalizeLayout, renderLayout, fromPreset, sampleContext, PRESETS, METRICS, SERIES } from './customModel.js'

const PAGE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'overlay', 'overlay.html')
const FOLLOW_MS = 2000
const HISTORY = 120 // samples kept for the overclocker graphs (one per refresh)
const STREAM_MS = 33 // frame times go to the overlay ~30 times a second; the page draws graphs at the display's rate
const DEFAULT_LABELS = { fps: 'FPS', low1: '1% low', frametime: 'Frame', latency: 'Latência', cpuTemp: 'CPU °C', cpuPower: 'CPU W', gpuTemp: 'GPU °C', gpuClock: 'GPU clk' }

export class OverlayService {
  constructor({ app, BrowserWindow, screen, globalShortcut, presentMon, hardware, native, onEvent, lhmSource }) {
    Object.assign(this, { app, BrowserWindow, screen, globalShortcut, presentMon, hardware, native, onEvent })
    this.lhm = null
    this.pendingFt = []
    this.sessionStats = new SessionStats()
    this.history = { fps: [], cpu: [], gpu: [], cpuTemp: [], gpuTemp: [] }
    // full LibreHardwareMonitor tree (clocks, power, voltages, fans) for the advanced layouts
    lhmSource?.on?.('data', (p) => { if (p?.type === 'lhm') this.lhm = readLhm(p) })
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
    // layouts made in the editor
    this.layoutsFile = path.join(app.getPath('userData'), 'overlay-layouts.json')
    let store = {}
    try { store = JSON.parse(fs.readFileSync(this.layoutsFile, 'utf8')) } catch { /* first use */ }
    this.layouts = (Array.isArray(store.layouts) ? store.layouts : []).slice(0, 50).map(normalizeLayout)
    if (!this.layouts.length) this.layouts = [fromPreset('rivatuner')]
    this.activeLayout = this.layouts.some((l) => l.id === store.active) ? store.active : this.layouts[0].id
    this.labels = { ...DEFAULT_LABELS, ...(saved.labels || {}) }
    presentMon.on('frame', (f) => {
      if (this.target && f.pid !== this.target.pid) return
      this.window.push(f)
      this.sessionStats.push(f.msBetweenPresents)
      if (this.visible && f.msBetweenPresents > 0 && this.pendingFt.length < 4000) this.pendingFt.push(Math.round(f.msBetweenPresents * 100) / 100)
      if (f.msBetweenPresents > 0 && this.session.length < 500000) this.session.push(f.msBetweenPresents)
    })
    presentMon.on('exit', ({ error }) => { if (error) this.error = error; this._emit() })
    this._bindHotkey()
  }

  _saveLayouts() { fs.writeFileSync(this.layoutsFile, JSON.stringify({ active: this.activeLayout, layouts: this.layouts }, null, 1)) }

  layoutsState() {
    return {
      ok: true, active: this.activeLayout, layouts: this.layouts,
      presets: Object.fromEntries(Object.entries(PRESETS).map(([k, p]) => [k, p.name])),
      metrics: Object.entries(METRICS).map(([key, m]) => ({ key, group: m.group, label: m.label, unit: m.unit, decimals: m.d })),
      series: Object.entries(SERIES).map(([key, x]) => ({ key, label: x.label }))
    }
  }

  saveLayout(model) {
    const l = normalizeLayout(model)
    const i = this.layouts.findIndex((x) => x.id === l.id)
    if (i >= 0) this.layouts[i] = l
    else { if (this.layouts.length >= 50) throw new Error('Limite de 50 layouts'); this.layouts.push(l) }
    this._saveLayouts()
    return { ...this.layoutsState(), saved: l }
  }

  newLayout(preset) {
    const l = fromPreset(preset)
    if (this.layouts.some((x) => x.name === l.name)) l.name = `${l.name} ${this.layouts.length + 1}`
    return this.saveLayout(l)
  }

  deleteLayout(id) {
    if (this.layouts.length <= 1) throw new Error('Mantenha ao menos um layout')
    this.layouts = this.layouts.filter((x) => x.id !== id)
    if (this.activeLayout === id) this.activeLayout = this.layouts[0].id
    this._saveLayouts()
    return this.layoutsState()
  }

  activateLayout(id) {
    if (!this.layouts.some((x) => x.id === id)) throw new Error('Layout não encontrado')
    this.activeLayout = id
    this._saveLayouts()
    this.setSettings({ layout: 'custom' })
    return this.layoutsState()
  }

  /** Editor preview: the layout drawn with live data when the overlay runs, otherwise with sample numbers. */
  preview(model) {
    const live = this.visible && this._ctx ? this._ctx : null
    return { ok: true, live: Boolean(live), ...renderLayout(model, { ...(live || sampleContext()), labels: this.labels }) }
  }

  _save() { fs.writeFileSync(this.file, JSON.stringify({ ...this.settings, labels: this.labels }, null, 1)) }
  _emit() { this.onEvent?.(this.status()) }

  status() {
    return {
      ok: true, visible: this.visible, settings: this.settings, target: this.target, mode: this.mode,
      capturing: this.presentMon.running, presentMonInstalled: this.presentMon.installed(), error: this.error,
      stats: this.window.stats(), session: this.sessionStats.stats(), lastSession: this.lastSession
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
    this.pendingFt = []
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
    this.sessionStats.reset()
    for (const k of Object.keys(this.history)) this.history[k] = []
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
    this.timers.push(setInterval(() => this._stream(), STREAM_MS))
    if (this.mode === 'foreground') this.timers.push(setInterval(() => { void this._follow() }, FOLLOW_MS))
  }

  _stopLoop() { for (const t of this.timers) clearInterval(t); this.timers = [] }

  _stream() {
    if (!this.win || this.win.isDestroyed() || !this.visible || !this.pendingFt.length) return
    const ft = this.pendingFt
    this.pendingFt = []
    this.win.webContents.executeJavaScript(`window.__stream && window.__stream({ft:[${ft.join(',')}]})`).catch(() => {})
  }

  _render() {
    if (!this.win || this.win.isDestroyed() || !this.visible) return
    const frames = this.window.stats()
    const sensors = readSensors(this.hardware.snapshot())
    const hw = this.lhm && Date.now() - (this.lhm.at || 0) < 10000 ? this.lhm : null
    // current values for the page's own time-based graphs (fps, loads, temperatures)
    const live = {
      fps: frames?.fps ?? null, 'gpu.load': hw?.gpu?.load ?? sensors.gpu ?? null, 'cpu.load': sensors.cpu ?? null,
      'gpu.temp': hw?.gpu?.temp ?? sensors.gpuTemp ?? null, 'cpu.temp': hw?.cpu?.temp ?? sensors.cpuTemp ?? null
    }
    let data
    if (this.settings.layout === 'compact') {
      const rows = buildRows(this.settings, frames, sensors, this.labels)
      data = { settings: this.settings, live, rows, graph: this.settings.metrics.includes('graph') && frames ? 1 : 0 }
    } else {
      const h = this.history
      const add = (k, x) => { if (x != null && Number.isFinite(Number(x))) { h[k].push(Number(x)); if (h[k].length > HISTORY) h[k].shift() } }
      add('fps', frames?.fps); add('cpu', sensors.cpu); add('gpu', hw?.gpu?.load ?? sensors.gpu)
      add('cpuTemp', hw?.cpu?.temp ?? sensors.cpuTemp); add('gpuTemp', hw?.gpu?.temp ?? sensors.gpuTemp)
      const session = this.sessionStats.stats()
      this._ctx = { frames, session, hw, sensors, history: h }
      if (this.settings.layout === 'custom') {
        const layout = this.layouts.find((l) => l.id === this.activeLayout) || this.layouts[0]
        data = { settings: this.settings, live, custom: renderLayout(layout, { ...this._ctx, labels: this.labels }, { values: false }) }
      } else {
        const panel = buildPanel(this.settings.layout, frames, session, hw, sensors, h, this.labels)
        // the page plots the streams itself: the points are not sent
        panel.graphs = panel.graphs.map(({ values, series, ...g }) => g)
        data = { settings: this.settings, live, panel }
      }
    }
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
