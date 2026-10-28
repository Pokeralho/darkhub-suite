// Auto clicker on the native engine (DarkHub.ClickEngine.exe). The engine also watches the hotkey with
// GetAsyncKeyState, which only looks at the keyboard: unlike a global shortcut, the key still reaches the game.
// While a hotkey is set the engine stays running, idle, so the hotkey works with DarkHub in the background.
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { normalizeHotkey } from '../hotkeys/hotkey.js'

const DEFAULT_HOTKEY = 'Ctrl+Shift+F6'
const BUTTONS = ['left', 'right', 'middle', 'double']

export const clampSettings = (s = {}) => {
  const ms = Number(s.intervalMs)
  return {
    button: BUTTONS.includes(s.button) ? s.button : 'left',
    intervalMs: Number.isFinite(ms) ? Math.max(1, Math.min(10000, Math.trunc(ms))) : 50
  }
}

export class AutoClickerService {
  /** deps: { configFile, enginePath() -> string|null, onChange({ running, state }), logger } */
  constructor({ configFile, enginePath, onChange, logger }) {
    Object.assign(this, { configFile, enginePath, onChange, logger })
    this.proc = null
    this.running = false
    this.startedAt = null
    this.settings = clampSettings()
    this.hotkey = DEFAULT_HOTKEY
  }

  load() {
    try {
      const saved = JSON.parse(fs.readFileSync(this.configFile, 'utf8'))
      // a saved empty string means "no hotkey"; the old default (bare F6, taken from games by a global shortcut) moves to the new one
      if (typeof saved.hotkey === 'string') this.hotkey = saved.hotkey === 'F6' && !saved.hotkeyChosen ? DEFAULT_HOTKEY : (saved.hotkey ? normalizeHotkey(saved.hotkey) : null)
      if (saved.defaults) this.settings = clampSettings(saved.defaults)
    } catch { /* first run */ }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.configFile), { recursive: true })
      fs.writeFileSync(this.configFile, JSON.stringify({ hotkey: this.hotkey ?? '', hotkeyChosen: true, defaults: this.settings }, null, 2))
    } catch (e) { this.logger?.warn?.('[AutoClicker] save failed:', e?.message ?? e) }
  }

  state() {
    return { running: this.running, state: this.running ? { ...this.settings, startedAt: this.startedAt, isNative: true } : null, settings: this.settings, hotkey: this.hotkey }
  }

  _emit() { try { this.onChange?.(this.state()) } catch { /* window closing */ } }

  _send(line) { if (this.proc?.stdin?.writable) this.proc.stdin.write(`${line}\n`) }

  _setRunning(on) {
    if (this.running === on) return
    this.running = on
    this.startedAt = on ? Date.now() : null
    this._emit()
  }

  _ensureEngine() {
    if (this.proc && this.proc.exitCode === null) return true
    const exe = this.enginePath()
    if (!exe || !fs.existsSync(exe)) return false
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
        // the engine reports every start and stop, whether it came from the app or from the hotkey
        if (msg.status === 'running' || msg.event === 'toggle') this._setRunning(msg.status === 'running')
        else if (msg.status === 'stopped') this._setRunning(false)
      }
    })
    p.stdin.on('error', () => {})
    p.on('error', (e) => { this.logger?.warn?.('[AutoClicker] engine error:', e?.message ?? e) })
    p.on('exit', () => { if (this.proc === p) { this.proc = null; this._setRunning(false) } })
    this._send(`HOTKEY ${this.hotkey || 'NONE'}`)
    this._send(`ARM ${this.settings.button} ${this.settings.intervalMs}`)
    return true
  }

  /** Called at startup: with a hotkey set, the engine waits for it. */
  arm() {
    if (this.hotkey) this._ensureEngine()
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
    // without a hotkey nothing needs the engine any more
    if (!this.hotkey) this.dispose()
    return { ok: true, ...this.state() }
  }

  toggle(payload) { return this.running ? this.stop() : this.start(payload) }

  /** text: any key or combination; '' removes the hotkey. */
  setHotkey(text) {
    const raw = typeof text === 'string' ? text.trim() : ''
    const hk = raw ? normalizeHotkey(raw) : null
    if (raw && !hk) return { ok: false, error: 'invalid' }
    this.hotkey = hk
    this.save()
    if (hk) { if (this._ensureEngine()) this._send(`HOTKEY ${hk}`) }
    else { this._send('HOTKEY NONE'); if (!this.running) this.dispose() }
    this._emit()
    return { ok: true, hotkey: this.hotkey }
  }

  dispose() {
    const p = this.proc
    if (!p) return
    this.proc = null
    try { if (p.stdin?.writable) p.stdin.write('STOP\nEXIT\n') } catch { /* gone */ }
    setTimeout(() => { try { if (p.exitCode === null) p.kill() } catch { /* gone */ } }, 200)
  }
}
