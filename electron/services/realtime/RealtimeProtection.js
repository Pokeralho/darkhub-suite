// Real-time protection. Cost model, cheapest first:
//   1. fs.watch on the chosen folders (ReadDirectoryChangesW: the OS pushes changes, nothing polls);
//   2. only risky file types, and only once a download stopped growing (partial-download names are ignored);
//   3. SHA-256 streamed once per file version, looked up in the known-bad set (HashDb, binary search);
//   4. optional ClamAV: files are batched for a few seconds so its signatures load once per batch, at low priority.
// Detections go to quarantine (when enabled) and raise a notification; everything is in the activity log.
import { EventEmitter } from 'node:events'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const RISKY_EXT = new Set([
  '.exe', '.dll', '.scr', '.com', '.pif', '.cpl', '.msi', '.msp', '.sys', '.bat', '.cmd', '.ps1', '.psm1', '.vbs', '.vbe',
  '.js', '.jse', '.wsf', '.wsh', '.hta', '.lnk', '.jar', '.zip', '.rar', '.7z', '.cab', '.iso', '.img', '.vhd', '.vhdx',
  '.docm', '.xlsm', '.pptm', '.dotm', '.xlam', '.one', '.chm', '.reg', '.appx', '.msix'
])
const PARTIAL_RE = /\.(crdownload|part|partial|download|tmp|opdownload)$/i
const SETTLE_MS = 2000
const MAX_SETTLE_TRIES = 30
const CLAM_BATCH_MS = 4000
const CLAM_BATCH_MAX = 32
const CLEAN_CACHE = 4000
const LOG_SIZE = 300

/** Whether a changed path is worth scanning. Pure. */
export function isScanCandidate(file) {
  const base = path.basename(String(file || ''))
  if (!base || base.startsWith('~$') || PARTIAL_RE.test(base)) return false
  return RISKY_EXT.has(path.extname(base).toLowerCase())
}

export function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256')
    fs.createReadStream(file, { highWaterMark: 1 << 20 }).on('error', reject).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex')))
  })
}

export class RealtimeProtection extends EventEmitter {
  constructor({ getConfig, getHashDb, clamav, quarantine, notify = () => {}, now = Date.now } = {}) {
    super()
    Object.assign(this, { getConfig, getHashDb, clamav, quarantine, notify, now })
    this.watchers = []
    this.settling = new Map()
    this.queue = []
    this.queued = new Set()
    this.working = false
    this.clean = new Map() // "path|size|mtime" -> true, insertion-ordered LRU
    this.clamBatch = []
    this.clamTimer = null
    this.log = []
    this.stats = { scanned: 0, detections: 0, quarantined: 0, since: 0 }
  }

  get running() { return this.watchers.length > 0 }

  start() {
    if (this.running) return
    this.stats.since = this.now()
    for (const dir of this.getConfig().folders) {
      try {
        const w = fs.watch(dir, { recursive: true, persistent: false }, (_type, name) => { if (name) this.#changed(path.join(dir, name)) })
        w.on('error', (e) => this.#record('error', 'watch', { folder: dir, error: String(e.code || e.message) }))
        this.watchers.push(w)
      } catch (e) {
        this.#record('error', 'watch', { folder: dir, error: String(e.code || e.message) })
      }
    }
    this.#record('info', 'started', { folders: this.watchers.length })
  }

  stop() {
    for (const w of this.watchers) { try { w.close() } catch { /* closed */ } }
    this.watchers = []
    for (const s of this.settling.values()) clearTimeout(s.timer)
    this.settling.clear()
    clearTimeout(this.clamTimer)
    this.clamTimer = null
    this.#record('info', 'stopped')
  }

  status() {
    return { running: this.running, folders: this.watchers.length, queue: this.queue.length + this.clamBatch.length, stats: this.stats, log: this.log.slice(-60) }
  }

  /** Manual scan of files the user picked (same pipeline, no settle delay). */
  scanNow(files) {
    for (const f of files) this.#enqueue(f)
  }

  #record(level, event, data = {}) {
    const entry = { at: this.now(), level, event, ...data }
    this.log.push(entry)
    if (this.log.length > LOG_SIZE) this.log.splice(0, this.log.length - LOG_SIZE)
    this.emit('event', entry)
  }

  // Wait until the file stops changing (a browser writing a download fires dozens of events).
  #changed(file) {
    if (!isScanCandidate(file)) return
    const prev = this.settling.get(file)
    if (prev) clearTimeout(prev.timer)
    const entry = prev || { size: -1, tries: 0 }
    entry.timer = setTimeout(() => this.#settle(file), SETTLE_MS)
    this.settling.set(file, entry)
  }

  #settle(file) {
    const entry = this.settling.get(file)
    if (!entry) return
    let st
    try { st = fs.statSync(file) } catch { this.settling.delete(file); return } // deleted or renamed away
    if (st.size !== entry.size && ++entry.tries < MAX_SETTLE_TRIES) {
      entry.size = st.size
      entry.timer = setTimeout(() => this.#settle(file), SETTLE_MS)
      return
    }
    this.settling.delete(file)
    this.#enqueue(file)
  }

  #enqueue(file) {
    if (this.queued.has(file)) return
    this.queued.add(file)
    this.queue.push(file)
    if (!this.working) this.#drain()
  }

  async #drain() {
    this.working = true
    while (this.queue.length) {
      const file = this.queue.shift()
      this.queued.delete(file)
      try { await this.#scanOne(file) } catch (e) { this.#record('error', 'scan', { file, error: String(e.code || e.message) }) }
    }
    this.working = false
  }

  async #scanOne(file) {
    const cfg = this.getConfig()
    let st
    try { st = fs.statSync(file) } catch { return }
    if (!st.isFile() || st.size > cfg.maxFileMb * 1048576) return
    const key = `${file}|${st.size}|${st.mtimeMs}`
    if (this.clean.has(key)) return
    const sha256 = await sha256File(file)
    this.stats.scanned++
    if (cfg.allowHashes.includes(sha256)) return this.#markClean(key)
    const known = this.getHashDb().lookup(sha256)
    if (known) return this.#detected({ file, sha256, size: st.size, engine: 'hash', name: known })
    if (cfg.clamav && this.clamav?.status().database) {
      this.clamBatch.push({ file, sha256, size: st.size, key })
      if (this.clamBatch.length >= CLAM_BATCH_MAX) this.#flushClam()
      else if (!this.clamTimer) this.clamTimer = setTimeout(() => this.#flushClam(), CLAM_BATCH_MS)
      return
    }
    this.#markClean(key)
  }

  async #flushClam() {
    clearTimeout(this.clamTimer)
    this.clamTimer = null
    const batch = this.clamBatch.splice(0)
    if (!batch.length) return
    const res = await this.clamav.scan(batch.map((b) => b.file))
    if (res.error) { this.#record('error', 'clamav', { error: res.error, files: batch.length }); return }
    const found = new Map(res.detections.map((d) => [path.normalize(d.file).toLowerCase(), d.signature]))
    for (const b of batch) {
      const sig = found.get(path.normalize(b.file).toLowerCase())
      if (sig && !this.getConfig().allowHashes.includes(b.sha256)) await this.#detected({ file: b.file, sha256: b.sha256, size: b.size, engine: 'clamav', name: sig })
      else this.#markClean(b.key)
    }
  }

  #markClean(key) {
    this.clean.set(key, true)
    if (this.clean.size > CLEAN_CACHE) this.clean.delete(this.clean.keys().next().value)
  }

  async #detected(d) {
    this.stats.detections++
    let quarantined = null
    if (this.getConfig().autoQuarantine) {
      try {
        quarantined = await this.quarantine.add(d.file, { sha256: d.sha256, size: d.size, engine: d.engine, detection: d.name })
        this.stats.quarantined++
      } catch (e) {
        this.#record('error', 'quarantine', { file: d.file, error: String(e.message) })
      }
    }
    this.#record('threat', quarantined ? 'quarantined' : 'detected', { file: d.file, engine: d.engine, detection: d.name, sha256: d.sha256, id: quarantined?.id })
    this.notify({ file: d.file, detection: d.name, quarantined: Boolean(quarantined) })
  }
}
