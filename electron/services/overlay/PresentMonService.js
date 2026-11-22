// Intel PresentMon (MIT, github.com/GameTechDev/PresentMon) for frame timing: downloaded on first use from the official
// release, pinned by SHA-256, and run with CSV on stdout for one target process.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn, execFile } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createCsvParser } from './frameStats.js'
import { migratePinnedFile } from '../programDataRoot.js'

export const PRESENTMON = {
  version: '2.6.0',
  url: 'https://github.com/GameTechDev/PresentMon/releases/download/v2.6.0/PresentMon-2.6.0-x64.exe',
  sha256: 'b2a706bc6ad475749e3b7e3409263aa1e6906d45bdcf993f6dbc0f660188f1af',
  file: 'PresentMon-2.6.0-x64.exe'
}
const SESSION = 'DarkHubOverlay'
const MAX_BYTES = 8 * 1024 * 1024

export class PresentMonService extends EventEmitter {
  /**
   * toolsDir: a folder, or an async function resolving it (trustedToolsDir: C:\ProgramData\DarkHub\tools when elevated).
   * legacyDir: where older versions kept the exe (%APPDATA%\DarkHub\tools). The user can write there, so a copy is
   * taken over only when its SHA-256 is the pinned one; anything else is downloaded again.
   */
  constructor({ toolsDir, legacyDir = null }) {
    super()
    this.exe = typeof toolsDir === 'string' ? path.join(toolsDir, PRESENTMON.file) : null
    this._dir = typeof toolsDir === 'function' ? toolsDir : null
    this._exeReady = null
    this.legacyDir = legacyDir
    this.child = null
    this._terminating = null
    this._startSeq = 0
  }

  async _resolveExe() {
    if (this.exe) return this.exe
    this._exeReady ||= Promise.resolve(this._dir()).then((dir) => (this.exe = path.join(dir, PRESENTMON.file)))
      .catch((e) => { this._exeReady = null; throw e })
    return this._exeReady
  }

  installed() { return Boolean(this.exe) && fs.existsSync(this.exe) }

  async ensure() {
    const exe = await this._resolveExe()
    if (fs.existsSync(exe)) return exe
    const legacy = this.legacyDir ? path.join(this.legacyDir, PRESENTMON.file) : null
    if (legacy && path.resolve(legacy) !== path.resolve(exe) && await migratePinnedFile(legacy, exe, PRESENTMON.sha256)) return exe
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
    fs.mkdirSync(path.dirname(exe), { recursive: true })
    const tmp = `${exe}.${process.pid}.tmp`
    fs.writeFileSync(tmp, buf)
    fs.renameSync(tmp, exe)
    return exe
  }

  get running() { return Boolean(this.child) }

  /** Starts capturing one process. Emits 'frame' per presented frame and 'exit' when PresentMon stops. */
  async start({ pid }) {
    this.stop()
    const seq = ++this._startSeq
    // the session name is fixed (so a crashed run's ETW session is reclaimed): the previous terminate must finish
    // first, or it ends the session this start just opened
    await this._terminating
    const exe = await this.ensure()
    if (seq !== this._startSeq) return // a newer start (or stop) superseded this one while it waited
    const args = ['--output_stdout', '--no_console_stats', '--session_name', SESSION, '--stop_existing_session', '--process_id', String(Number(pid)), '--terminate_on_proc_exit']
    const child = spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    this.child = child
    const parse = createCsvParser()
    let buf = ''
    let err = ''
    child.stdout.setEncoding?.('utf8') // stream decoding: no U+FFFD when a multibyte char is split across chunks
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
    let done = false
    const finish = (code, error) => {
      if (done) return
      done = true
      if (this.child === child) this.child = null
      this.emit('exit', { code, error })
    }
    // spawn failure (exe quarantined by the antivirus, access denied): without a listener it would crash main
    child.on('error', (e) => finish(-1, e?.message ?? String(e)))
    child.on('close', (code) => finish(code, code ? err.trim().split(/\r?\n/).filter(Boolean).pop() : null))
  }

  stop() {
    this._startSeq++ // a start still waiting must not spawn after this stop
    const c = this.child
    this.child = null
    if (!c || !this.exe) return this._terminating || Promise.resolve()
    try { c.kill() } catch { /* gone */ }
    // the ETW session outlives a killed PresentMon: end it so the next start is clean (start() waits for this)
    this._terminating = new Promise((resolve) => {
      try {
        execFile(this.exe, ['--terminate_existing_session', '--session_name', SESSION], { windowsHide: true, timeout: 10000 }, () => resolve())
      } catch { resolve() }
    })
    return this._terminating
  }
}
