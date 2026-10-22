
import path from 'node:path'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

class NativeLatencyClient extends EventEmitter {
  constructor() {
    super()
    this.process = null
    this.pendingCallbacks = []
    this.isReady = false
    this.topology = null
  }

  getExecutablePath() {
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

    const exePath = this.getExecutablePath()
    if (!fs.existsSync(exePath)) {
      return false
    }

    try {
      const proc = spawn(exePath, [], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      })
      this.process = proc
      registerExitKill()

      // Without these listeners a spawn failure (EACCES/ENOENT) or a write to a
      // dead daemon (EPIPE) surfaces as an unhandled 'error' event.
      proc.on('error', () => {
        if (this.process !== proc) return
        this.process = null
        this.isReady = false
        this._rejectAllPending(new Error('LatencyEngine process error'))
      })
      proc.stdin.on('error', () => {})

      let buffer = ''
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
            } else if (this.pendingCallbacks.length > 0) {
              const cb = this.pendingCallbacks.shift()
              clearTimeout(cb.timer)
              if (!cb.abandoned) cb.resolve(msg)
            }
          } catch (e) {

          }
        }
      })

      proc.stderr.on('data', () => {})

      proc.on('exit', () => {
        // A newer daemon may already exist (dispose + ensureRunning); only
        // clear state owned by this process.
        if (this.process !== proc) return
        this.process = null
        this.isReady = false
        this._rejectAllPending(new Error('LatencyEngine process exited'))
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

  sendCommand(payload, timeoutMs = 4000) {
    return new Promise((resolve, reject) => {
      if (!this.ensureRunning()) {
        return reject(new Error('DarkHub.LatencyEngine.exe not available'))
      }

      const entry = { resolve, reject, timer: null, abandoned: false }
      entry.timer = setTimeout(() => {
        // Keep the slot in the FIFO so a late reply is discarded instead of
        // being delivered to the next caller.
        if (!entry.abandoned) {
          entry.abandoned = true
          reject(new Error('LatencyEngine command timed out'))
        }
        const abandoned = this.pendingCallbacks.filter((c) => c.abandoned).length
        if (abandoned > 16 && this.process) {
          try { this.process.kill() } catch {}
        }
      }, timeoutMs)

      this.pendingCallbacks.push(entry)
      try {
        this.process.stdin.write(JSON.stringify(payload) + '\n')
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

  async cleanRam(excludePid = -1) {
    const res = await this.sendCommand({
      cmd: 'clean_ram',
      exclude_pid: Number(excludePid)
    }, 10000)
    return res?.ok ? res.data : null
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
