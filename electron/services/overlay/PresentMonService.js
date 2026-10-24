// Intel PresentMon (MIT, github.com/GameTechDev/PresentMon) for frame timing: downloaded on first use from the official
// release, pinned by SHA-256, and run with CSV on stdout for one target process.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn, execFile } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createCsvParser } from './frameStats.js'

export const PRESENTMON = {
  version: '2.6.0',
  url: 'https://github.com/GameTechDev/PresentMon/releases/download/v2.6.0/PresentMon-2.6.0-x64.exe',
  sha256: 'b2a706bc6ad475749e3b7e3409263aa1e6906d45bdcf993f6dbc0f660188f1af',
  file: 'PresentMon-2.6.0-x64.exe'
}
const SESSION = 'DarkHubOverlay'
const MAX_BYTES = 8 * 1024 * 1024

export class PresentMonService extends EventEmitter {
  constructor({ toolsDir }) {
    super()
    this.exe = path.join(toolsDir, PRESENTMON.file)
    this.child = null
  }

  installed() { return fs.existsSync(this.exe) }

  async ensure() {
    if (this.installed()) return this.exe
    // a few tries: name resolution can fail for a moment (e.g. while Windows reloads a large hosts file)
    let buf = null
    let lastErr = null
    for (let attempt = 0; attempt < 3 && !buf; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 3000 * attempt))
      try {
        const res = await fetch(PRESENTMON.url)
        if (!res.ok) throw new Error(`PresentMon: HTTP ${res.status}`)
        buf = Buffer.from(await res.arrayBuffer())
      } catch (e) { lastErr = e }
    }
    if (!buf) throw new Error(`PresentMon: ${lastErr?.message ?? lastErr}`)
    if (buf.length > MAX_BYTES) throw new Error('PresentMon: arquivo grande demais')
    const hash = crypto.createHash('sha256').update(buf).digest('hex')
    if (hash !== PRESENTMON.sha256) throw new Error('PresentMon: o arquivo baixado não confere com a versão esperada')
    fs.mkdirSync(path.dirname(this.exe), { recursive: true })
    const tmp = `${this.exe}.${process.pid}.tmp`
    fs.writeFileSync(tmp, buf)
    fs.renameSync(tmp, this.exe)
    return this.exe
  }

  get running() { return Boolean(this.child) }

  /** Starts capturing one process. Emits 'frame' per presented frame and 'exit' when PresentMon stops. */
  async start({ pid }) {
    this.stop()
    const exe = await this.ensure()
    const args = ['--output_stdout', '--no_console_stats', '--session_name', SESSION, '--stop_existing_session', '--process_id', String(Number(pid)), '--terminate_on_proc_exit']
    const child = spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    this.child = child
    const parse = createCsvParser()
    let buf = ''
    let err = ''
    child.stdout.on('data', (d) => {
      buf += d
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const f = parse(buf.slice(0, i))
        buf = buf.slice(i + 1)
        if (f) this.emit('frame', f)
      }
    })
    child.stderr.on('data', (d) => { err = (err + d).slice(-2000) })
    child.on('close', (code) => {
      if (this.child === child) this.child = null
      this.emit('exit', { code, error: code ? err.trim().split(/\r?\n/).filter(Boolean).pop() : null })
    })
  }

  stop() {
    const c = this.child
    this.child = null
    if (!c) return
    try { c.kill() } catch { /* gone */ }
    // the ETW session outlives a killed PresentMon: end it so the next start is clean
    execFile(this.exe, ['--terminate_existing_session', '--session_name', SESSION], { windowsHide: true, timeout: 10000 }, () => {})
  }
}
