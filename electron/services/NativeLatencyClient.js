
import path from 'node:path'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { fileURLToPath } from 'node:url'
import { integrityError } from './binaryIntegrity.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/** A timed-out request whose reply never came within this grace means the engine is wedged: restart it. */
const WEDGED_GRACE_MS = 15000
/** Too many abandoned slots in the FIFO also means the engine stopped keeping up. */
const MAX_ABANDONED = 16

/**
 * Client of DarkHub.LatencyEngine.exe. The protocol has no correlation id: the engine answers exactly one line per
 * request line, in order, so replies are matched FIFO. A request that times out keeps its slot (marked abandoned)
 * so its late reply is consumed and dropped instead of being handed to the next caller. Each slot is bound to the
 * process it was written to: a reply from a new engine never resolves a request sent to the old one.
 */
class NativeLatencyClient extends EventEmitter {
  constructor({ spawnImpl = spawn, exePath = null, existsSync = fs.existsSync, integrityCheck = integrityError } = {}) {
    super()
    this._spawn = spawnImpl
    this._exePath = exePath
    this._exists = existsSync
    this._integrity = integrityCheck
    this.process = null
    this.pendingCallbacks = []
    this.isReady = false
    this.topology = null
  }

  getExecutablePath() {
    if (this._exePath) return this._exePath
    const isPackaged = process.resourcesPath && !process.defaultApp
    if (isPackaged) {
      const unpacked = path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'services', 'DarkHub.LatencyEngine.exe')
      if (fs.existsSync(unpacked)) return unpacked
    }
    const direct = path.join(__dirname, 'DarkHub.LatencyEngine.exe')
    if (fs.existsSync(direct)) return direct

    const relative = path.join(__dirname, '..', '..', 'electron', 'services', 'DarkHub.LatencyEngine.exe')
    if (fs.existsSync(relative)) return relative

    return direct
  }

  ensureRunning() {
    if (this.process && !this.process.killed) return true
    // The native daemon (DarkHub.LatencyEngine.exe) is a Windows-only binary. On Linux/macOS
    // we must never attempt to spawn it — return false so callers degrade to structured unsupported.
    if (process.platform !== 'win32') return false

    const exePath = this.getExecutablePath()
    if (!this._exists(exePath)) {
      return false
    }
    if (this._integrity(['DarkHub.LatencyEngine.exe'], { log: (m) => console.warn('[NativeLatencyClient]', m) })) return false

    try {
      const proc = this._spawn(exePath, [], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      })
      this.process = proc
      registerExitKill()

      // Without these listeners a spawn failure (EACCES/ENOENT) or a write to a
      // dead daemon (EPIPE) surfaces as an unhandled 'error' event.
      proc.on('error', () => {
        this._rejectPendingOf(proc, new Error('LatencyEngine process error'))
        if (this.process !== proc) return
        this.process = null
        this.isReady = false
      })
      proc.stdin.on('error', () => {})

      let buffer = ''
      proc.stdout.setEncoding?.('utf8') // stream decoding: no U+FFFD when a multibyte char is split across chunks
      proc.stdout.on('data', (chunk) => {
        buffer += chunk.toString('utf8')
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const msg = JSON.parse(trimmed)
            if (msg.event === 'ready') {
              this.isReady = true
              this.emit('ready', msg)
            } else {
              const idx = this.pendingCallbacks.findIndex((c) => c.proc === proc)
              if (idx !== -1) {
                const [cb] = this.pendingCallbacks.splice(idx, 1)
                clearTimeout(cb.timer)
                if (!cb.abandoned) cb.resolve(msg)
              }
            }
          } catch (e) {

          }
        }
      })

      proc.stderr.on('data', () => {})

      proc.on('exit', () => {
        // its requests can never be answered now, whoever owns this.process
        this._rejectPendingOf(proc, new Error('LatencyEngine process exited'))
        // A newer daemon may already exist (dispose + ensureRunning); only
        // clear state owned by this process.
        if (this.process !== proc) return
        this.process = null
        this.isReady = false
      })

      return true
    } catch (err) {
      this.process = null
      return false
    }
  }

  _rejectAllPending(err) {
    while (this.pendingCallbacks.length > 0) {
      const cb = this.pendingCallbacks.shift()
      clearTimeout(cb.timer)
      if (!cb.abandoned) cb.reject(err)
    }
  }

  _rejectPendingOf(proc, err) {
    const mine = this.pendingCallbacks.filter((c) => c.proc === proc)
    if (!mine.length) return
    this.pendingCallbacks = this.pendingCallbacks.filter((c) => c.proc !== proc)
    for (const cb of mine) {
      clearTimeout(cb.timer)
      if (!cb.abandoned) cb.reject(err)
    }
  }

  /** Kills a wedged engine: its pending requests are rejected now and the next command starts a fresh one. */
  _restart(proc, reason) {
    this._rejectPendingOf(proc, new Error(reason))
    if (this.process === proc) { this.process = null; this.isReady = false }
    try { proc.kill() } catch {}
  }

  sendCommand(payload, timeoutMs = 4000) {
    return new Promise((resolve, reject) => {
      if (!this.ensureRunning()) {
        return reject(new Error('DarkHub.LatencyEngine.exe not available'))
      }

      const proc = this.process
      const entry = { resolve, reject, timer: null, abandoned: false, proc }
      entry.timer = setTimeout(() => {
        // Keep the slot in the FIFO so a late reply is discarded instead of
        // being delivered to the next caller.
        entry.abandoned = true
        reject(new Error('LatencyEngine command timed out'))
        const abandoned = this.pendingCallbacks.filter((c) => c.proc === proc && c.abandoned).length
        if (abandoned > MAX_ABANDONED) { this._restart(proc, 'LatencyEngine stopped answering'); return }
        // no late reply at all within the grace: the engine is stuck on this request (or lost it) and every later
        // reply would be shifted, so restart it instead of waiting for more timeouts
        entry.timer = setTimeout(() => {
          if (this.pendingCallbacks.includes(entry)) this._restart(proc, 'LatencyEngine stopped answering')
        }, WEDGED_GRACE_MS)
        entry.timer.unref?.()
      }, timeoutMs)

      this.pendingCallbacks.push(entry)
      try {
        proc.stdin.write(JSON.stringify(payload) + '\n')
      } catch (err) {
        clearTimeout(entry.timer)
        const idx = this.pendingCallbacks.indexOf(entry)
        if (idx !== -1) this.pendingCallbacks.splice(idx, 1)
        reject(err)
      }
    })
  }

  async lockTimer(resolution100ns = 5000) {
    const res = await this.sendCommand({ cmd: 'lock_timer', resolution_100ns: resolution100ns })
    return res?.ok ? res.data : null
  }

  async unlockTimer() {
    const res = await this.sendCommand({ cmd: 'unlock_timer' })
    return res?.ok ? res.data : null
  }

  async queryTimer() {
    const res = await this.sendCommand({ cmd: 'query_timer' })
    return res?.ok ? res.data : null
  }

  async boostProcess(pid, { priority = 'high', pCoresOnly = false } = {}) {
    const res = await this.sendCommand({
      cmd: 'boost_process',
      pid: Number(pid),
      priority: String(priority),
      p_cores_only: Boolean(pCoresOnly)
    })
    return res?.ok ? res.data : null
  }

  async setAffinity(pid, maskHex) {
    const res = await this.sendCommand({
      cmd: 'set_affinity',
      pid: Number(pid),
      mask_hex: String(maskHex)
    })
    return res?.ok ? res.data : null
  }

  async getCpuTopology() {
    if (this.topology) return this.topology
    const res = await this.sendCommand({ cmd: 'get_cpu_topology' })
    if (res?.ok && res?.data) {
      this.topology = res.data
      return this.topology
    }
    return null
  }

  async pingNative(host = '1.1.1.1', timeoutMs = 1500) {
    const res = await this.sendCommand({
      cmd: 'ping_native',
      host: String(host),
      timeout_ms: Number(timeoutMs)
    }, timeoutMs + 1000)
    if (res?.ok && res?.data) {
      return res.data
    }
    return null
  }

  /** Trims working sets of processes above minMb; the foreground window's process is always skipped by the engine. */
  async cleanRam(excludePid = -1, minMb = 100) {
    const res = await this.sendCommand({
      cmd: 'clean_ram',
      exclude_pid: Number(excludePid),
      min_mb: Number(minMb)
    }, 10000)
    return res?.ok ? res.data : null
  }

  /** {foregroundPid, foregroundMonitor, processes:[{pid, name, wsMb}]} from one native call (~15 ms for 500 processes).
   *  foregroundMonitor: physical bounds {x, y, width, height} of the monitor showing the foreground window, or null. */
  async listProcesses() {
    const res = await this.sendCommand({ cmd: 'list_processes' }, 5000)
    if (!res?.ok || !Array.isArray(res.data?.rows)) return null
    const processes = []
    for (const row of res.data.rows) {
      const [pid, name, ws] = String(row).split('|')
      if (name) processes.push({ pid: Number(pid), name, wsMb: Number(ws) || 0 })
    }
    const m = String(res.data.foreground_monitor || '').split(',').map(Number)
    const foregroundMonitor = m.length === 4 && m.every(Number.isFinite) ? { x: m[0], y: m[1], width: m[2] - m[0], height: m[3] - m[1] } : null
    return { foregroundPid: Number(res.data.foreground_pid) || -1, foregroundMonitor, processes }
  }

  dispose() {
    const proc = this.process
    if (proc && !proc.killed) {
      try {
        proc.stdin.write(JSON.stringify({ cmd: 'exit' }) + '\n')
        // Capture the instance: this.process is nulled below, so checking
        // `this.process` in the timer never killed a daemon that ignored 'exit'.
        const t = setTimeout(() => {
          if (proc.exitCode === null && !proc.killed) {
            try { proc.kill() } catch {}
          }
        }, 500)
        t.unref?.()
      } catch {
        try { proc.kill() } catch {}
      }
    }
    this.process = null
    this.isReady = false
  }

  /** Synchronous hard kill, safe to call from process 'exit'. */
  killSync() {
    const proc = this.process
    this.process = null
    this.isReady = false
    if (proc && proc.exitCode === null && !proc.killed) {
      try { proc.kill() } catch {}
    }
  }
}

export { NativeLatencyClient }
export const nativeLatencyClient = new NativeLatencyClient()

// Windows does not terminate children with the parent; make sure the daemon
// (which may hold a 0.5 ms timer-resolution lock) never outlives the app.
let exitKillRegistered = false
function registerExitKill() {
  if (exitKillRegistered) return
  exitKillRegistered = true
  process.once('exit', () => nativeLatencyClient.killSync())
}
export default nativeLatencyClient
