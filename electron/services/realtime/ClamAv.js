// ClamAV (Cisco Talos, GPL-2.0) as an optional scan engine. DarkHub never ships its binaries: the setup (build/deps/
// install-deps.ps1) or the app downloads the official MSI pinned below, and the signatures come from the official
// mirror through freshclam.
// No clamd daemon (it keeps ~1 GB of signatures resident): clamscan runs on demand at low priority, one batch of files
// per run, so the signatures are loaded once per batch and released right after.
import cp from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const FOUND_RE = /^(.*): (.+) FOUND$/

/** Official release, same pin as build/deps/install-deps.ps1. The MSI is not Authenticode-signed: the hash is the check. */
export const CLAMAV = Object.freeze({
  version: '1.5.4',
  url: 'https://github.com/Cisco-Talos/clamav/releases/download/clamav-1.5.4/clamav-1.5.4.win.x64.msi',
  sha256: 'a025fa23a4b9d64fce448d5a211afcf30dc26ba6528186e6223d1b945f9d95d6'
})

/** Detections from `clamscan --infected --no-summary` output: [{file, signature}]. Pure. */
export function parseClamscan(stdout) {
  const out = []
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const m = FOUND_RE.exec(line.trim())
    if (m) out.push({ file: m[1], signature: m[2] })
  }
  return out
}

export function freshclamConf(dbDir) {
  // no NotifyClamd: that option takes a clamd.conf path and DarkHub never runs clamd
  return ['DatabaseMirror database.clamav.net', `DatabaseDirectory ${dbDir}`, 'ScriptedUpdates yes', 'Checks 0', ''].join('\n')
}

function run(file, args, { timeoutMs, lowPriority = true } = {}) {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let child
    try {
      child = cp.spawn(file, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) {
      resolve({ code: -1, stdout, stderr: String(e.message) })
      return
    }
    if (lowPriority) { try { os.setPriority(child.pid, os.constants.priority.PRIORITY_LOW) } catch { /* best effort */ } }
    const timer = setTimeout(() => { try { child.kill() } catch { /* gone */ } }, timeoutMs)
    child.stdout.on('data', (d) => { if (stdout.length < 4e6) stdout += d })
    child.stderr.on('data', (d) => { if (stderr.length < 1e5) stderr += d })
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, stdout, stderr: String(e.message) }) })
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }) })
  })
}

export class ClamAv {
  constructor(root) {
    this.dir = path.join(root, 'ClamAV')
    this.db = path.join(this.dir, 'db')
    this.conf = path.join(this.dir, 'freshclam.conf')
  }

  #find(exe) {
    const bases = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean)
    for (const b of bases) {
      const p = path.join(b, 'ClamAV', exe)
      if (fs.existsSync(p)) return p
    }
    return null
  }

  get clamscan() { return this.#find('clamscan.exe') }
  get freshclam() { return this.#find('freshclam.exe') }

  hasDatabase() {
    try {
      const files = fs.readdirSync(this.db)
      return files.some((f) => /^main\.c[vl]d$/.test(f)) && files.some((f) => /^daily\.c[vl]d$/.test(f))
    } catch { return false }
  }

  databaseAge() {
    try { return Date.now() - fs.statSync(path.join(this.db, fs.readdirSync(this.db).find((f) => /^daily\.c[vl]d$/.test(f)))).mtimeMs } catch { return null }
  }

  status() {
    return { installed: Boolean(this.clamscan), database: this.hasDatabase(), databaseAgeMs: this.databaseAge() }
  }

  async install() {
    if (this.clamscan) return { ok: true }
    // the pinned official MSI (works without winget, e.g. on DarkOS); DarkHub runs as administrator, so msiexec /qn is enough
    const { downloadToFile } = await import('../SecureDownload.js')
    const msi = path.join(os.tmpdir(), `darkhub-clamav-${CLAMAV.version}.msi`)
    try {
      await downloadToFile(CLAMAV.url, msi, { expectedSha256: CLAMAV.sha256, maxBytes: 400 * 1024 * 1024, timeoutMs: 30 * 60000 })
      const r = await run('msiexec.exe', ['/i', msi, '/qn', '/norestart'], { timeoutMs: 15 * 60000, lowPriority: false })
      return this.clamscan ? { ok: true } : { ok: false, error: `msiexec exit ${r.code}` }
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) }
    } finally {
      try { fs.rmSync(msi, { force: true }) } catch { /* in use */ }
    }
  }

  /** Downloads or refreshes the official signatures (~110 MB the first time, then small daily diffs). */
  async update() {
    const freshclam = this.freshclam
    if (!freshclam) return { ok: false, error: 'ClamAV not installed' }
    fs.mkdirSync(this.db, { recursive: true })
    fs.writeFileSync(this.conf, freshclamConf(this.db))
    const r = await run(freshclam, [`--config-file=${this.conf}`, `--datadir=${this.db}`], { timeoutMs: 30 * 60000 })
    return r.code === 0 || this.hasDatabase() ? { ok: true } : { ok: false, error: (r.stderr || r.stdout).trim().slice(-300) }
  }

  /** Scans files in one run. Resolves {detections:[{file, signature}]} or {error}. */
  async scan(files) {
    const clamscan = this.clamscan
    if (!clamscan || !this.hasDatabase()) return { error: 'ClamAV not ready', detections: [] }
    const r = await run(clamscan, [`--database=${this.db}`, '--infected', '--no-summary', '--stdout', '--max-filesize=512M', '--max-scansize=1024M', ...files], { timeoutMs: 10 * 60000 })
    const detections = parseClamscan(r.stdout)
    // exit 1 = something found, 0 = clean, 2 = error (detections listed before an error still count)
    return r.code === 2 && !detections.length ? { error: (r.stderr || 'clamscan error').trim().slice(-300), detections } : { detections }
  }
}
