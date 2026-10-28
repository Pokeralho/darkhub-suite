// App hotkeys (overlay, screenshots) through DarkHub.HotkeyWatch.exe, which only watches the keyboard: the game or app
// in front still gets the key. A Windows global shortcut (Electron's globalShortcut) swallows it instead, so it is
// used only when the watcher is missing.
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { normalizeHotkey } from './hotkey.js'

const WATCHER = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'DarkHub.HotkeyWatch.exe').replace(/app\.asar(?![.\w])/, 'app.asar.unpacked')

export class HotkeyService {
  /** deps: { globalShortcut, watcherPath?, logger } */
  constructor({ globalShortcut, watcherPath = WATCHER, logger } = {}) {
    Object.assign(this, { globalShortcut, watcherPath, logger })
    this.proc = null
    this.binds = new Map() // id -> { hotkey, cb, viaGlobal }
  }

  _watcher() {
    if (this.proc && this.proc.exitCode === null) return this.proc
    if (!fs.existsSync(this.watcherPath)) return null
    const p = spawn(this.watcherPath, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
    let buf = ''
    p.stdout.on('data', (d) => {
      buf += d.toString('utf8')
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        try {
          const msg = JSON.parse(line)
          if (msg.event === 'hotkey') this.binds.get(msg.id)?.cb?.()
        } catch { /* not JSON */ }
      }
    })
    p.stdin.on('error', () => {})
    p.on('error', (e) => this.logger?.warn?.('Hotkeys', `watcher: ${e?.message ?? e}`))
    p.on('exit', () => {
      if (this.proc !== p) return
      this.proc = null
      // restart once and re-send every hotkey (a crash must not silently disable them)
      if (this.binds.size) setTimeout(() => { for (const [id, b] of this.binds) if (!b.viaGlobal) this._send(id, b.hotkey) }, 1000)
    })
    this.proc = p
    return p
  }

  _send(id, hotkey) {
    const p = this._watcher()
    if (!p) return false
    p.stdin.write(hotkey ? `SET ${id} ${hotkey}\n` : `CLEAR ${id}\n`)
    return true
  }

  /** id: a plain word ('overlay', 'shot'...). Returns { ok } or { ok: false, error: 'invalid' | 'in-use' }. */
  register(id, accelerator, cb) {
    this.unregister(id)
    if (!accelerator) return { ok: true }
    const hotkey = normalizeHotkey(accelerator)
    if (!hotkey) return { ok: false, error: 'invalid' }
    for (const [other, b] of this.binds) if (other !== id && b.hotkey === hotkey) return { ok: false, error: 'in-use' }
    if (this._send(id, hotkey)) { this.binds.set(id, { hotkey, cb, viaGlobal: false }); return { ok: true, hotkey } }
    try {
      if (!this.globalShortcut?.register(accelerator, cb)) return { ok: false, error: 'in-use' }
    } catch { return { ok: false, error: 'invalid' } }
    this.binds.set(id, { hotkey, cb, viaGlobal: accelerator })
    return { ok: true, hotkey }
  }

  unregister(id) {
    const b = this.binds.get(id)
    if (!b) return
    this.binds.delete(id)
    if (b.viaGlobal) { try { this.globalShortcut.unregister(b.viaGlobal) } catch { /* gone */ } }
    else if (this.proc) this._send(id, null)
  }

  dispose() {
    for (const id of [...this.binds.keys()]) this.unregister(id)
    const p = this.proc
    this.proc = null
    try { p?.stdin?.end() } catch { /* gone */ }
  }
}
