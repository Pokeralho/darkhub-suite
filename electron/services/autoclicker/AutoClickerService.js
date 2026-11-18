// Auto clicker + Macro Recorder/Player (TinyTask .rec compatible) on the native engine (DarkHub.ClickEngine.exe).
// The engine watches hotkeys with GetAsyncKeyState, which only looks at the keyboard: unlike a global shortcut,
// the key still reaches the game. While any hotkey is set the engine stays running, idle, in the background.
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { normalizeHotkey } from '../hotkeys/hotkey.js'
import {
  parseRecBuffer,
  serializeRecBuffer,
  compileTinyTaskExe,
  normalizeWaypoint,
  compileWaypointsToEvents
} from './recCodec.js'

const DEFAULT_HOTKEY = 'Ctrl+Shift+F6'
const DEFAULT_RECORD_HOTKEY = 'Ctrl+Shift+F7'
const DEFAULT_PLAY_HOTKEY = 'Ctrl+Shift+F8'
const BUTTONS = ['left', 'right', 'middle', 'double']

export const clampSettings = (s = {}) => {
  let rawMs = Number(s.intervalMs)
  if (!Number.isFinite(rawMs) && Number.isFinite(Number(s.cps)) && Number(s.cps) > 0) {
    rawMs = Math.round(1000 / Number(s.cps))
  }
  return {
    button: BUTTONS.includes(s.button) ? s.button : 'left',
    intervalMs: Number.isFinite(rawMs) ? Math.max(1, Math.min(10000, Math.trunc(rawMs))) : 50
  }
}

export const clampMacroSettings = (m = {}) => {
  const rawSpeed = Number(m.speed)
  const speed = Number.isFinite(rawSpeed) ? Math.max(0.1, Math.min(100, Math.round(rawSpeed * 100) / 100)) : 1
  const rawLoops = Number(m.loops)
  const loops = Number.isFinite(rawLoops) ? Math.max(1, Math.min(99999, Math.trunc(rawLoops))) : 1
  return {
    speed,
    loops,
    continuous: Boolean(m.continuous)
  }
}

function encodePathB64(p) {
  return p ? Buffer.from(String(p), 'utf8').toString('base64') : 'NONE'
}

export class AutoClickerService {
  /** deps: { configFile, enginePath() -> string|null, onChange({ running, state, macro }), logger, selfPid? } */
  constructor({ configFile, enginePath, onChange, logger, selfPid }) {
    Object.assign(this, { configFile, enginePath, onChange, logger })
    this.selfPid = Number.isFinite(Number(selfPid)) ? Number(selfPid) : process.pid
    this.workingRecFile = configFile ? path.join(path.dirname(configFile), 'autoclicker-last.rec') : null
    this.proc = null
    this.running = false
    this.startedAt = null
    this.settings = clampSettings()
    this.hotkey = DEFAULT_HOTKEY

    this.macroSettings = clampMacroSettings()
    this.recordHotkey = DEFAULT_RECORD_HOTKEY
    this.playHotkey = DEFAULT_PLAY_HOTKEY
    this.waypoints = []
    this.waypointOptions = { humanArc: true }
    this.macroRuntime = {
      mode: 'idle', // 'idle' | 'recording' | 'playing'
      loop: 0,
      totalLoops: 1,
      elapsedMs: 0,
      eventCount: 0,
      keyEvents: 0,
      mouseClicks: 0,
      mouseMoves: 0,
      durationMs: 0,
      fileName: null,
      sourceKind: null,
      stoppedBy: null
    }
  }

  _hasAnyHotkey() {
    return Boolean(this.hotkey || this.recordHotkey || this.playHotkey)
  }

  _refreshWorkingRecSummary(overrideMeta = {}) {
    if (!this.workingRecFile || !fs.existsSync(this.workingRecFile)) return false
    try {
      const parsed = parseRecBuffer(fs.readFileSync(this.workingRecFile))
      this.macroRuntime = {
        ...this.macroRuntime,
        eventCount: parsed.summary.eventCount,
        keyEvents: parsed.summary.keyEvents,
        mouseClicks: parsed.summary.mouseClicks,
        mouseMoves: parsed.summary.mouseMoves,
        durationMs: parsed.summary.durationMs,
        ...overrideMeta
      }
      return true
    } catch {
      return false
    }
  }

  load() {
    try {
      const saved = JSON.parse(fs.readFileSync(this.configFile, 'utf8'))
      if (typeof saved.hotkey === 'string') {
        this.hotkey = saved.hotkey === 'F6' && !saved.hotkeyChosen
          ? DEFAULT_HOTKEY
          : (saved.hotkey ? normalizeHotkey(saved.hotkey) : null)
      }
      if (saved.defaults) this.settings = clampSettings(saved.defaults)
      if (saved.macro && typeof saved.macro === 'object') {
        this.macroSettings = clampMacroSettings(saved.macro)
        if (typeof saved.macro.recordHotkey === 'string') {
          this.recordHotkey = saved.macro.recordHotkey ? normalizeHotkey(saved.macro.recordHotkey) : null
        }
        if (typeof saved.macro.playHotkey === 'string') {
          this.playHotkey = saved.macro.playHotkey ? normalizeHotkey(saved.macro.playHotkey) : null
        }
        if (typeof saved.macro.fileName === 'string' && saved.macro.fileName) {
          this.macroRuntime.fileName = saved.macro.fileName
        }
        if (typeof saved.macro.sourceKind === 'string' && saved.macro.sourceKind) {
          this.macroRuntime.sourceKind = saved.macro.sourceKind
        }
      }
      if (Array.isArray(saved.waypoints)) {
        this.waypoints = saved.waypoints.slice(0, 500).map((p, i) => normalizeWaypoint(p, i))
      }
      if (saved.waypointOptions && typeof saved.waypointOptions === 'object') {
        this.waypointOptions = { humanArc: saved.waypointOptions.humanArc !== false }
      }
    } catch { /* first run */ }
    this._refreshWorkingRecSummary()
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.configFile), { recursive: true })
      fs.writeFileSync(this.configFile, JSON.stringify({
        hotkey: this.hotkey ?? '',
        hotkeyChosen: true,
        defaults: this.settings,
        macro: {
          ...this.macroSettings,
          recordHotkey: this.recordHotkey ?? '',
          playHotkey: this.playHotkey ?? '',
          fileName: this.macroRuntime.fileName ?? '',
          sourceKind: this.macroRuntime.sourceKind ?? ''
        },
        waypoints: this.waypoints,
        waypointOptions: this.waypointOptions
      }, null, 2))
    } catch (e) { this.logger?.warn?.('[AutoClicker] save failed:', e?.message ?? e) }
  }

  macroState() {
    return {
      ...this.macroRuntime,
      settings: this.macroSettings,
      recordHotkey: this.recordHotkey,
      playHotkey: this.playHotkey
    }
  }

  state() {
    return {
      running: this.running,
      state: this.running ? { ...this.settings, startedAt: this.startedAt, isNative: true } : null,
      settings: this.settings,
      hotkey: this.hotkey,
      macro: this.macroState(),
      waypoints: this.waypoints,
      waypointOptions: this.waypointOptions
    }
  }

  _emit() { try { this.onChange?.(this.state()) } catch { /* window closing */ } }

  _send(line) { if (this.proc?.stdin?.writable) this.proc.stdin.write(`${line}\n`) }

  _setRunning(on) {
    if (this.running === on) return
    this.running = on
    this.startedAt = on ? Date.now() : null
    this._emit()
  }

  _syncMacroToEngine() {
    const speedX100 = Math.max(10, Math.min(10000, Math.round(this.macroSettings.speed * 100)))
    this._send(`SELF_PID ${this.selfPid}`)
    this._send(`MACRO_SAVE_PATH ${encodePathB64(this.workingRecFile)}`)
    this._send(`MACRO_HOTKEYS ${this.recordHotkey || 'NONE'} ${this.playHotkey || 'NONE'}`)
    this._send(`MACRO_ARM ${speedX100} ${this.macroSettings.loops} ${this.macroSettings.continuous ? 1 : 0}`)
    if (this.workingRecFile && fs.existsSync(this.workingRecFile)) {
      this._send(`MACRO_LOAD ${encodePathB64(this.workingRecFile)}`)
    }
  }

  _handleEngineMessage(msg) {
    if (!msg || typeof msg !== 'object') return
    if (msg.status === 'running' || msg.event === 'toggle') {
      if (msg.status === 'running' && this.macroRuntime.mode !== 'idle') {
        this.macroRuntime = { ...this.macroRuntime, mode: 'idle', elapsedMs: 0 }
      }
      this._setRunning(msg.status === 'running')
      return
    }
    if (msg.status === 'stopped') {
      this._setRunning(false)
      return
    }
    if (msg.event === 'macro') {
      const nextMode = msg.mode === 'recording' || msg.mode === 'playing' ? msg.mode : 'idle'
      if (nextMode !== 'idle' && this.running) {
        this.running = false
        this.startedAt = null
      }
      if (nextMode === 'idle' && msg.recorded) {
        this._refreshWorkingRecSummary({
          mode: 'idle',
          elapsedMs: 0,
          loop: 0,
          fileName: this.macroRuntime.fileName || 'Gravação Recente (.rec)',
          sourceKind: 'recorded',
          stoppedBy: null
        })
        this.save()
      } else {
        this.macroRuntime = {
          ...this.macroRuntime,
          mode: nextMode,
          loop: Number.isFinite(msg.loop) ? msg.loop : 0,
          totalLoops: Number.isFinite(msg.totalLoops) ? msg.totalLoops : this.macroSettings.loops,
          elapsedMs: nextMode === 'idle' ? 0 : (Number.isFinite(msg.elapsedMs) ? msg.elapsedMs : 0),
          eventCount: Number.isFinite(msg.eventCount) ? msg.eventCount : this.macroRuntime.eventCount,
          durationMs: Number.isFinite(msg.durationMs) ? msg.durationMs : this.macroRuntime.durationMs,
          stoppedBy: msg.stoppedBy ?? null
        }
      }
      this._emit()
      return
    }
    if (msg.event === 'macro_progress') {
      this.macroRuntime = {
        ...this.macroRuntime,
        mode: msg.mode === 'recording' || msg.mode === 'playing' ? msg.mode : this.macroRuntime.mode,
        loop: Number.isFinite(msg.loop) ? msg.loop : this.macroRuntime.loop,
        totalLoops: Number.isFinite(msg.totalLoops) ? msg.totalLoops : this.macroSettings.loops,
        elapsedMs: Number.isFinite(msg.elapsedMs) ? msg.elapsedMs : this.macroRuntime.elapsedMs,
        eventCount: Number.isFinite(msg.eventCount) ? msg.eventCount : this.macroRuntime.eventCount,
        durationMs: Number.isFinite(msg.durationMs) ? msg.durationMs : this.macroRuntime.durationMs
      }
      this._emit()
      return
    }
    if (msg.event === 'macro_loaded') {
      this.macroRuntime = {
        ...this.macroRuntime,
        eventCount: Number.isFinite(msg.eventCount) ? msg.eventCount : this.macroRuntime.eventCount,
        durationMs: Number.isFinite(msg.durationMs) ? msg.durationMs : this.macroRuntime.durationMs
      }
      this._emit()
    }
  }

  _ensureEngine() {
    if (this.proc && this.proc.exitCode === null) return true
    const exe = this.enginePath()
    if (!exe || !fs.existsSync(exe)) return false
    if (this.workingRecFile) {
      try { fs.mkdirSync(path.dirname(this.workingRecFile), { recursive: true }) } catch {}
    }
    const p = spawn(exe, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    this.proc = p
    let buf = ''
    p.stdout.on('data', (d) => {
      buf += d.toString('utf8')
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        let msg = null
        try { msg = JSON.parse(line) } catch { continue }
        this._handleEngineMessage(msg)
      }
    })
    p.stdin.on('error', () => {})
    p.on('error', (e) => { this.logger?.warn?.('[AutoClicker] engine error:', e?.message ?? e) })
    p.on('exit', () => {
      if (this.proc === p) {
        this.proc = null
        this.macroRuntime = { ...this.macroRuntime, mode: 'idle', elapsedMs: 0 }
        this._setRunning(false)
        this._emit()
      }
    })
    this._send(`HOTKEY ${this.hotkey || 'NONE'}`)
    this._send(`ARM ${this.settings.button} ${this.settings.intervalMs}`)
    this._syncMacroToEngine()
    return true
  }

  /** Called at startup: with any hotkey set, the engine waits for it. */
  arm() {
    if (this._hasAnyHotkey()) this._ensureEngine()
  }

  start(payload) {
    this.settings = clampSettings({ ...this.settings, ...(payload || {}) })
    this.save()
    if (!this._ensureEngine()) return { ok: false, error: 'DarkHub.ClickEngine.exe não encontrado.' }
    this._send(`ARM ${this.settings.button} ${this.settings.intervalMs}`)
    this._send(`START ${this.settings.button} ${this.settings.intervalMs}`)
    this._setRunning(true)
    return { ok: true, ...this.state() }
  }

  stop() {
    this._send('STOP')
    this._setRunning(false)
    if (!this._hasAnyHotkey() && this.macroRuntime.mode === 'idle') this.dispose()
    return { ok: true, ...this.state() }
  }

  toggle(payload) { return this.running ? this.stop() : this.start(payload) }

  /** text: any key or combination; '' removes the hotkey. */
  setHotkey(text) {
    const raw = typeof text === 'string' ? text.trim() : ''
    const hk = raw ? normalizeHotkey(raw) : null
    if (raw && !hk) return { ok: false, error: 'invalid' }
    if (hk && (hk === this.recordHotkey || hk === this.playHotkey)) {
      return { ok: false, error: 'conflict' }
    }
    this.hotkey = hk
    this.save()
    if (hk) { if (this._ensureEngine()) this._send(`HOTKEY ${hk}`) }
    else {
      this._send('HOTKEY NONE')
      if (!this.running && this.macroRuntime.mode === 'idle' && !this._hasAnyHotkey()) this.dispose()
    }
    this._emit()
    return { ok: true, hotkey: this.hotkey }
  }

  macroSetConfig(payload = {}) {
    if (!payload || typeof payload !== 'object') return { ok: false, error: 'invalid' }

    let nextRecHk = this.recordHotkey
    let nextPlayHk = this.playHotkey

    if ('recordHotkey' in payload) {
      const raw = typeof payload.recordHotkey === 'string' ? payload.recordHotkey.trim() : ''
      nextRecHk = raw ? normalizeHotkey(raw) : null
      if (raw && !nextRecHk) return { ok: false, error: 'invalid_hotkey' }
    }
    if ('playHotkey' in payload) {
      const raw = typeof payload.playHotkey === 'string' ? payload.playHotkey.trim() : ''
      nextPlayHk = raw ? normalizeHotkey(raw) : null
      if (raw && !nextPlayHk) return { ok: false, error: 'invalid_hotkey' }
    }

    // Prevent hotkey collisions across Clicker / Record / Play (same rule as TinyTask "Hotkey Conflict")
    const activeSet = [this.hotkey, nextRecHk, nextPlayHk].filter(Boolean)
    if (new Set(activeSet).size !== activeSet.length) {
      return { ok: false, error: 'conflict' }
    }

    this.recordHotkey = nextRecHk
    this.playHotkey = nextPlayHk
    this.macroSettings = clampMacroSettings({ ...this.macroSettings, ...payload })
    this.save()

    if (this._hasAnyHotkey() || this.proc) {
      if (this._ensureEngine()) {
        const speedX100 = Math.max(10, Math.min(10000, Math.round(this.macroSettings.speed * 100)))
        this._send(`MACRO_HOTKEYS ${this.recordHotkey || 'NONE'} ${this.playHotkey || 'NONE'}`)
        this._send(`MACRO_ARM ${speedX100} ${this.macroSettings.loops} ${this.macroSettings.continuous ? 1 : 0}`)
      }
    } else if (!this.running && this.macroRuntime.mode === 'idle') {
      this.dispose()
    }

    this._emit()
    return { ok: true, ...this.state() }
  }

  macroRecordStart() {
    if (!this._ensureEngine()) return { ok: false, error: 'DarkHub.ClickEngine.exe não encontrado.' }
    this.running = false
    this.startedAt = null
    this.macroRuntime = {
      ...this.macroRuntime,
      mode: 'recording',
      elapsedMs: 0,
      eventCount: 0,
      keyEvents: 0,
      mouseClicks: 0,
      mouseMoves: 0,
      durationMs: 0,
      fileName: 'Nova Gravação (.rec)',
      sourceKind: 'recorded',
      stoppedBy: null
    }
    this._send(`REC_START ${encodePathB64(this.workingRecFile)}`)
    this._emit()
    return { ok: true, ...this.state() }
  }

  macroRecordStop() {
    this._send('REC_STOP')
    return { ok: true, ...this.state() }
  }

  macroPlayStart(payload = {}) {
    if (payload && typeof payload === 'object') {
      this.macroSettings = clampMacroSettings({ ...this.macroSettings, ...payload })
      this.save()
    }
    if (!this.workingRecFile || !fs.existsSync(this.workingRecFile) || this.macroRuntime.eventCount <= 0) {
      return { ok: false, error: 'Nenhuma macro gravada ou carregada. Grave uma nova sequência ou abra um arquivo .rec.' }
    }
    if (!this._ensureEngine()) return { ok: false, error: 'DarkHub.ClickEngine.exe não encontrado.' }
    const speedX100 = Math.max(10, Math.min(10000, Math.round(this.macroSettings.speed * 100)))
    this._send(`MACRO_LOAD ${encodePathB64(this.workingRecFile)}`)
    this._send(`MACRO_ARM ${speedX100} ${this.macroSettings.loops} ${this.macroSettings.continuous ? 1 : 0}`)
    this._send(`MACRO_PLAY ${speedX100} ${this.macroSettings.loops} ${this.macroSettings.continuous ? 1 : 0}`)
    return { ok: true, ...this.state() }
  }

  macroPlayStop() {
    this._send('MACRO_STOP')
    this.macroRuntime = { ...this.macroRuntime, mode: 'idle', elapsedMs: 0 }
    this._emit()
    if (!this._hasAnyHotkey() && !this.running) this.dispose()
    return { ok: true, ...this.state() }
  }

  macroLoadFromPath(filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
      return { ok: false, error: 'Arquivo não encontrado.' }
    }
    try {
      const buf = fs.readFileSync(filePath)
      const parsed = parseRecBuffer(buf)
      if (parsed.events.length === 0) {
        return { ok: false, error: 'Este arquivo não contém eventos válidos de macro.' }
      }
      const cleanRec = serializeRecBuffer(parsed.events)
      if (this.workingRecFile) {
        fs.mkdirSync(path.dirname(this.workingRecFile), { recursive: true })
        fs.writeFileSync(this.workingRecFile, cleanRec)
      }

      if (parsed.sourceKind === 'tinytask-exe') {
        const patch = {}
        if (parsed.summary.embeddedSpeed) patch.speed = parsed.summary.embeddedSpeed
        if (parsed.summary.embeddedLoops) {
          if (parsed.summary.embeddedLoops >= 99999) patch.continuous = true
          else { patch.loops = parsed.summary.embeddedLoops; patch.continuous = false }
        }
        if (Object.keys(patch).length > 0) {
          this.macroSettings = clampMacroSettings({ ...this.macroSettings, ...patch })
        }
      }

      this.macroRuntime = {
        ...this.macroRuntime,
        mode: 'idle',
        elapsedMs: 0,
        loop: 0,
        eventCount: parsed.summary.eventCount,
        keyEvents: parsed.summary.keyEvents,
        mouseClicks: parsed.summary.mouseClicks,
        mouseMoves: parsed.summary.mouseMoves,
        durationMs: parsed.summary.durationMs,
        fileName: path.basename(filePath),
        sourceKind: parsed.sourceKind,
        stoppedBy: null
      }
      this.save()

      if (this.proc && this.proc.exitCode === null && this.workingRecFile) {
        const speedX100 = Math.max(10, Math.min(10000, Math.round(this.macroSettings.speed * 100)))
        this._send(`MACRO_LOAD ${encodePathB64(this.workingRecFile)}`)
        this._send(`MACRO_ARM ${speedX100} ${this.macroSettings.loops} ${this.macroSettings.continuous ? 1 : 0}`)
      }
      this._emit()
      return { ok: true, ...this.state() }
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  }

  macroSaveToPath(targetPath) {
    if (!targetPath) return { ok: false, error: 'Caminho inválido.' }
    if (!this.workingRecFile || !fs.existsSync(this.workingRecFile) || this.macroRuntime.eventCount <= 0) {
      return { ok: false, error: 'Nenhuma macro disponível para salvar.' }
    }
    try {
      const outPath = /\.rec$/i.test(targetPath) ? targetPath : `${targetPath}.rec`
      fs.mkdirSync(path.dirname(outPath), { recursive: true })
      fs.copyFileSync(this.workingRecFile, outPath)
      this.macroRuntime = { ...this.macroRuntime, fileName: path.basename(outPath) }
      this.save()
      this._emit()
      return { ok: true, path: outPath, bytes: fs.statSync(outPath).size, ...this.state() }
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  }

  macroCompileExe({ targetPath, templateExePath }) {
    if (!targetPath || !templateExePath) {
      return { ok: false, error: 'Informe o executável base (TinyTask 1.77) e o destino.' }
    }
    if (!this.workingRecFile || !fs.existsSync(this.workingRecFile) || this.macroRuntime.eventCount <= 0) {
      return { ok: false, error: 'Grave ou carregue uma macro antes de compilar.' }
    }
    try {
      const tplBuf = fs.readFileSync(templateExePath)
      const recBuf = fs.readFileSync(this.workingRecFile)
      const compiledBuf = compileTinyTaskExe(tplBuf, recBuf, this.macroSettings)
      const outPath = /\.exe$/i.test(targetPath) ? targetPath : `${targetPath}.exe`
      fs.mkdirSync(path.dirname(outPath), { recursive: true })
      fs.writeFileSync(outPath, compiledBuf)
      return { ok: true, path: outPath, bytes: compiledBuf.length }
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  }

  macroClear() {
    this._send('MACRO_CLEAR')
    if (this.workingRecFile && fs.existsSync(this.workingRecFile)) {
      try { fs.rmSync(this.workingRecFile, { force: true }) } catch {}
    }
    this.macroRuntime = {
      ...this.macroRuntime,
      mode: 'idle',
      loop: 0,
      elapsedMs: 0,
      eventCount: 0,
      keyEvents: 0,
      mouseClicks: 0,
      mouseMoves: 0,
      durationMs: 0,
      fileName: null,
      sourceKind: null,
      stoppedBy: null
    }
    this.save()
    this._emit()
    return { ok: true, ...this.state() }
  }

  _compileWaypointsIntoWorkingRec() {
    const activeCount = this.waypoints.filter((p) => p.enabled).length
    if (activeCount === 0) {
      if (this.macroRuntime.sourceKind === 'waypoints') {
        this._send('MACRO_CLEAR')
        if (this.workingRecFile && fs.existsSync(this.workingRecFile)) {
          try { fs.rmSync(this.workingRecFile, { force: true }) } catch {}
        }
        this.macroRuntime = {
          ...this.macroRuntime,
          eventCount: 0,
          keyEvents: 0,
          mouseClicks: 0,
          mouseMoves: 0,
          durationMs: 0,
          fileName: null,
          sourceKind: null
        }
      }
      return false
    }

    const events = compileWaypointsToEvents(this.waypoints, this.waypointOptions)
    const recBuf = serializeRecBuffer(events)
    if (this.workingRecFile) {
      fs.mkdirSync(path.dirname(this.workingRecFile), { recursive: true })
      fs.writeFileSync(this.workingRecFile, recBuf)
    }

    const label = activeCount === 1 ? 'Sequência (1 ponto)' : `Sequência (${activeCount} pontos)`
    this._refreshWorkingRecSummary({
      fileName: label,
      sourceKind: 'waypoints',
      stoppedBy: null
    })

    if (this.proc && this.proc.exitCode === null && this.workingRecFile) {
      this._send(`MACRO_LOAD ${encodePathB64(this.workingRecFile)}`)
    }
    return true
  }

  waypointsSave(payload = {}) {
    if (payload && Array.isArray(payload.waypoints)) {
      this.waypoints = payload.waypoints.slice(0, 500).map((p, i) => normalizeWaypoint(p, i))
    }
    if (payload?.options && typeof payload.options === 'object') {
      this.waypointOptions = { humanArc: payload.options.humanArc !== false }
    }
    if (payload?.compileToMacro !== false) {
      this._compileWaypointsIntoWorkingRec()
    }
    this.save()
    this._emit()
    return { ok: true, ...this.state() }
  }

  waypointsAddPicked(points = [], { replace = false } = {}) {
    const base = replace ? [] : this.waypoints.slice()
    const startIdx = base.length
    const added = (Array.isArray(points) ? points : []).map((pt, idx) => normalizeWaypoint({
      id: `pt-${Date.now()}-${idx + 1}`,
      label: `Ponto #${startIdx + idx + 1}`,
      enabled: true,
      x: pt.x,
      y: pt.y,
      button: 'left',
      moveMs: 180,
      waitMs: 250
    }, startIdx + idx))

    this.waypoints = [...base, ...added].slice(0, 500)
    this._compileWaypointsIntoWorkingRec()
    this.save()
    this._emit()
    return { ok: true, added: added.length, ...this.state() }
  }

  waypointsPlay(payload = {}) {
    if (payload && (Array.isArray(payload.waypoints) || payload.options)) {
      this.waypointsSave({ waypoints: payload.waypoints, options: payload.options, compileToMacro: false })
    }
    if (!this._compileWaypointsIntoWorkingRec()) {
      return { ok: false, error: 'Adicione ou ative pelo menos 1 coordenada na fila antes de iniciar.' }
    }
    this.save()
    return this.macroPlayStart(payload)
  }

  dispose() {
    const p = this.proc
    if (!p) return
    this.proc = null
    try { if (p.stdin?.writable) p.stdin.write('MACRO_STOP\nSTOP\nEXIT\n') } catch { /* gone */ }
    setTimeout(() => { try { if (p.exitCode === null) p.kill() } catch { /* gone */ } }, 200)
  }
}
