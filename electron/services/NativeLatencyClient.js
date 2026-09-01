
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
      this.process = spawn(exePath, [], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      let buffer = ''
      this.process.stdout.on('data', (chunk) => {
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
              cb.resolve(msg)
            }
          } catch (e) {

          }
        }
      })

      this.process.stderr.on('data', () => {})

      this.process.on('exit', () => {
        this.process = null
        this.isReady = false
        while (this.pendingCallbacks.length > 0) {
          const cb = this.pendingCallbacks.shift()
          cb.reject(new Error('LatencyEngine process exited'))
        }
      })

      return true
    } catch (err) {
      this.process = null
      return false
    }
  }

  sendCommand(payload, timeoutMs = 4000) {
    return new Promise((resolve, reject) => {
      if (!this.ensureRunning()) {
        return reject(new Error('DarkHub.LatencyEngine.exe not available'))
      }

      const timer = setTimeout(() => {
        const idx = this.pendingCallbacks.findIndex((c) => c.timer === timer)
        if (idx !== -1) {
          this.pendingCallbacks.splice(idx, 1)
          reject(new Error('LatencyEngine command timed out'))
        }
      }, timeoutMs)

      this.pendingCallbacks.push({ resolve, reject, timer })
      try {
        this.process.stdin.write(JSON.stringify(payload) + '\n')
      } catch (err) {
        clearTimeout(timer)
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
    if (this.process && !this.process.killed) {
      try {
        this.process.stdin.write(JSON.stringify({ cmd: 'exit' }) + '\n')
        setTimeout(() => {
          if (this.process && !this.process.killed) this.process.kill()
        }, 500)
      } catch {
        try { this.process.kill() } catch {}
      }
    }
    this.process = null
    this.isReady = false
  }
}

export const nativeLatencyClient = new NativeLatencyClient()
export default nativeLatencyClient
