// DarkOS installation media: lists USB drives, checks an ISO against the SHA-256 the site publishes and writes it to
// a drive (MBR + FAT32, boots on UEFI and BIOS PCs; install.wim over 4 GB is split). The work runs in usb-media.ps1.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'usb-media.ps1')
const MIN_BYTES = 7.5e9 // "8 GB" drives report a little under 8e9

/** One "DKUSB|kind|a|b" line from the script -> { kind, a, b }, or null for any other output. */
export function parseLine(line) {
  const m = /^DKUSB\|([a-z]+)\|([^|]*)\|?(.*)$/.exec(String(line).trim())
  return m ? { kind: m[1], a: m[2], b: m[3] } : null
}

/** USB drives the user may pick: big enough, sorted by disk number. */
export function usableDisks(rows) {
  return rows.filter((d) => Number.isInteger(d.number) && d.size >= MIN_BYTES).sort((a, b) => a.number - b.number)
}

export class UsbMediaService {
  /** deps: { app, allowVirtual } (allowVirtual: also list virtual disks, for testing with a VHD in development) */
  constructor({ app, allowVirtual = false }) {
    this.app = app
    this.allowVirtual = allowVirtual
    this.isos = new Set() // ISO paths the user picked or DarkHub found; the renderer cannot name another file
    this.proc = null
  }

  _script() {
    // the script may sit inside app.asar, where PowerShell cannot read it: run a copy from TEMP
    const copy = path.join(os.tmpdir(), 'darkhub-usb-media.ps1')
    fs.writeFileSync(copy, fs.readFileSync(SCRIPT))
    return copy
  }

  _run(args, onLine) {
    return new Promise((resolve) => {
      const full = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', this._script(), ...args]
      if (this.allowVirtual) full.push('-AllowVirtual')
      const p = spawn('powershell.exe', full, { windowsHide: true })
      let buf = ''
      let err = ''
      p.stdout.on('data', (d) => {
        buf += d.toString('utf8')
        let i
        while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); const msg = parseLine(line); if (msg) onLine(msg) }
      })
      p.stderr.on('data', (d) => { err += d.toString('utf8') })
      p.on('error', (e) => resolve({ code: -1, err: e.message }))
      p.on('close', (code) => { const msg = parseLine(buf); if (msg) onLine(msg); resolve({ code, err: err.trim() }) })
      this.proc = p
    })
  }

  async listDisks() {
    const rows = []
    const r = await this._run(['-Action', 'list'], (m) => { if (m.kind === 'disk') { try { rows.push(JSON.parse(m.a)) } catch { /* bad row */ } } })
    if (r.code !== 0) return { ok: false, error: r.err || `PowerShell ${r.code}` }
    return { ok: true, disks: usableDisks(rows) }
  }

  /** DarkOS ISOs in the Downloads folder, newest first. */
  findIsos() {
    const dir = this.app.getPath('downloads')
    let list = []
    try {
      list = fs.readdirSync(dir).filter((f) => /^darkos.*\.iso$/i.test(f)).map((f) => {
        const p = path.join(dir, f)
        const st = fs.statSync(p)
        return { path: p, name: f, size: st.size, mtime: st.mtimeMs }
      }).sort((a, b) => b.mtime - a.mtime)
    } catch { /* no downloads folder */ }
    for (const i of list) this.isos.add(i.path)
    return { ok: true, isos: list }
  }

  allowIso(p) {
    const st = fs.statSync(p)
    this.isos.add(p)
    return { path: p, name: path.basename(p), size: st.size, mtime: st.mtimeMs }
  }

  /** SHA-256 of an ISO the user picked, with progress (0-100). */
  hashIso(isoPath, onProgress) {
    if (!this.isos.has(isoPath)) return Promise.resolve({ ok: false, error: 'ISO não escolhida pelo usuário.' })
    return new Promise((resolve) => {
      const size = fs.statSync(isoPath).size
      const h = crypto.createHash('sha256')
      let read = 0
      let last = -1
      fs.createReadStream(isoPath, { highWaterMark: 4 * 1024 * 1024 })
        .on('data', (chunk) => {
          h.update(chunk)
          read += chunk.length
          const pct = Math.floor((read * 100) / size)
          if (pct !== last) { last = pct; onProgress?.(pct) }
        })
        .on('error', (e) => resolve({ ok: false, error: e.message }))
        .on('end', () => resolve({ ok: true, sha256: h.digest('hex') }))
    })
  }

  /** Erases the disk and writes the ISO. expectedSize: the size the user saw when confirming (guards against a swapped drive). */
  async write({ diskNumber, expectedSize, isoPath }, onEvent) {
    if (this.proc && this.proc.exitCode === null) return { ok: false, error: 'busy' }
    if (!this.isos.has(isoPath)) return { ok: false, error: 'iso-not-picked' }
    if (!Number.isInteger(diskNumber) || diskNumber < 0 || !Number.isFinite(expectedSize) || expectedSize < MIN_BYTES) return { ok: false, error: 'bad-disk' }
    let result = null
    const r = await this._run(['-Action', 'write', '-DiskNumber', String(diskNumber), '-ExpectedSize', String(Math.round(expectedSize)), '-IsoPath', isoPath], (m) => {
      if (m.kind === 'step') onEvent?.({ step: m.a })
      else if (m.kind === 'progress') onEvent?.({ percent: Number(m.a), file: m.b })
      else if (m.kind === 'ok') result = { ok: true, drive: m.a }
      else if (m.kind === 'error') result = { ok: false, error: m.a, detail: m.b }
    })
    this.proc = null
    return result || { ok: false, error: 'failed', detail: r.err || `PowerShell ${r.code}` }
  }

  cancel() {
    if (this.proc && this.proc.exitCode === null) { try { this.proc.kill() } catch { /* gone */ } }
    return { ok: true }
  }
}
