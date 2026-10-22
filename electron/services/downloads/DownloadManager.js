import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import https from 'node:https'
import crypto from 'node:crypto'
import { EventEmitter } from 'node:events'
import {
  sanitizeFileName, parseContentDisposition, fileNameFromUrl, validateDownloadUrl, planPieces,
  categoryForFile, uniquePath, safeJoin, Throttle, isInsideWindow, clampInt
} from './downloadUtils.js'

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DarkHubDownloads/1.0'
const MAX_REDIRECTS = 8
const PART_EXT = '.dhpart'

export const DEFAULT_SETTINGS = Object.freeze({
  downloadDir: '',
  maxConcurrent: 3,
  defaultConnections: 8,
  maxConnections: 32,
  globalSpeedLimitKBps: 0,
  retries: 5,
  organizeByCategory: false,
  schedule: { enabled: false, start: '01:00', stop: '07:00' }
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** HTTP(S) GET that follows redirects and resolves with { res, finalUrl } once headers arrive. */
function request(url, { headers = {}, signal, timeoutMs = 30000 } = {}, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    let parsed
    try { parsed = new URL(url) } catch { return reject(new Error('invalid-url')) }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return reject(new Error('unsupported-protocol'))
    const lib = parsed.protocol === 'https:' ? https : http
    const req = lib.get(parsed, {
      headers: { 'User-Agent': USER_AGENT, Accept: '*/*', 'Accept-Encoding': 'identity', ...headers }
    }, (res) => {
      const code = res.statusCode ?? 0
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume()
        if (redirectsLeft <= 0) return reject(new Error('too-many-redirects'))
        let next
        try { next = new URL(res.headers.location, parsed) } catch { return reject(new Error('bad-redirect')) }
        // Never silently downgrade an HTTPS download to plain HTTP.
        if (parsed.protocol === 'https:' && next.protocol !== 'https:') return reject(new Error('insecure-redirect'))
        return resolve(request(next.toString(), { headers, signal, timeoutMs }, redirectsLeft - 1))
      }
      resolve({ res, finalUrl: parsed.toString() })
    })
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')))
    req.on('error', reject)
    if (signal) {
      if (signal.aborted) { req.destroy(new Error('aborted')); return }
      // One listener per request on a long-lived signal: drop it when the request closes,
      // otherwise pieces/retries accumulate listeners (MaxListenersExceededWarning + leaks).
      const onAbort = () => req.destroy(new Error('aborted'))
      signal.addEventListener('abort', onAbort, { once: true })
      req.once('close', () => signal.removeEventListener('abort', onAbort))
    }
  })
}

class AbortedError extends Error {
  constructor() { super('aborted'); this.aborted = true }
}

export class DownloadManager extends EventEmitter {
  /**
   * @param {{ dataDir: string, defaultDownloadDir: string, logger?: any }} opts
   */
  constructor({ dataDir, defaultDownloadDir, logger } = {}) {
    super()
    this.dataDir = dataDir
    this.defaultDownloadDir = defaultDownloadDir
    this.log = logger ?? { info() {}, warn() {}, error() {} }
    this.items = new Map()
    this.tasks = new Map()
    this.settings = { ...DEFAULT_SETTINGS, schedule: { ...DEFAULT_SETTINGS.schedule }, downloadDir: defaultDownloadDir }
    this.globalThrottle = new Throttle(0)
    this._saveTimer = null
    this._emitTimer = null
    this._speedTimer = null
    this._scheduleTimer = null
    this._insideWindow = true
    this._loaded = false
  }

  // --------------------------------------------------------------------------- lifecycle
  async init() {
    await fsp.mkdir(this.dataDir, { recursive: true })
    await this._loadSettings()
    await this._loadQueue()
    this._loaded = true
    this._speedTimer = setInterval(() => this._sampleSpeeds(), 500)
    this._scheduleTimer = setInterval(() => this._checkSchedule(), 30000)
    this._speedTimer.unref?.()
    this._scheduleTimer.unref?.()
    this._checkSchedule(true)
    this._pump()
  }

  async shutdown() {
    clearInterval(this._speedTimer)
    clearInterval(this._scheduleTimer)
    for (const [id] of this.tasks) this._abortTask(id)
    await this._flushSave()
  }

  // --------------------------------------------------------------------------- settings
  getSettings() {
    return { ...this.settings, schedule: { ...this.settings.schedule } }
  }

  async setSettings(patch = {}) {
    const s = this.settings
    if (typeof patch.downloadDir === 'string' && patch.downloadDir.trim()) s.downloadDir = path.resolve(patch.downloadDir.trim())
    if (patch.maxConcurrent !== undefined) s.maxConcurrent = clampInt(patch.maxConcurrent, 1, 10, s.maxConcurrent)
    if (patch.maxConnections !== undefined) s.maxConnections = clampInt(patch.maxConnections, 1, 64, s.maxConnections)
    if (patch.defaultConnections !== undefined) s.defaultConnections = clampInt(patch.defaultConnections, 1, s.maxConnections, s.defaultConnections)
    s.defaultConnections = Math.min(s.defaultConnections, s.maxConnections)
    if (patch.globalSpeedLimitKBps !== undefined) s.globalSpeedLimitKBps = clampInt(patch.globalSpeedLimitKBps, 0, 10_000_000, 0)
    if (patch.retries !== undefined) s.retries = clampInt(patch.retries, 0, 20, s.retries)
    if (patch.organizeByCategory !== undefined) s.organizeByCategory = Boolean(patch.organizeByCategory)
    if (patch.schedule && typeof patch.schedule === 'object') {
      s.schedule = {
        enabled: Boolean(patch.schedule.enabled),
        start: typeof patch.schedule.start === 'string' ? patch.schedule.start : s.schedule.start,
        stop: typeof patch.schedule.stop === 'string' ? patch.schedule.stop : s.schedule.stop
      }
    }
    this.globalThrottle.setRate(s.globalSpeedLimitKBps * 1024)
    await this._saveSettings()
    this._checkSchedule(true)
    this._pump()
    this._scheduleEmit()
    return this.getSettings()
  }

  async _loadSettings() {
    try {
      const raw = JSON.parse(await fsp.readFile(path.join(this.dataDir, 'settings.json'), 'utf8'))
      await this.setSettings(raw)
    } catch {
      this.globalThrottle.setRate(this.settings.globalSpeedLimitKBps * 1024)
    }
  }

  async _saveSettings() {
    try { await fsp.writeFile(path.join(this.dataDir, 'settings.json'), JSON.stringify(this.settings, null, 2)) } catch (e) { this.log.warn('Downloads', `settings save failed: ${e.message}`) }
  }

  // --------------------------------------------------------------------------- queue persistence
  async _loadQueue() {
    try {
      const list = JSON.parse(await fsp.readFile(path.join(this.dataDir, 'queue.json'), 'utf8'))
      for (const rec of Array.isArray(list) ? list : []) {
        if (!rec?.id || !rec.url) continue
        // Anything that was running when the app closed resumes as "paused": the user decides.
        if (rec.status === 'downloading' || rec.status === 'starting') rec.status = 'paused'
        rec.speedBps = 0
        this.items.set(rec.id, rec)
      }
    } catch { /* first run */ }
  }

  _scheduleSave() {
    if (this._saveTimer) return
    this._saveTimer = setTimeout(() => { this._saveTimer = null; void this._flushSave() }, 800)
    this._saveTimer.unref?.()
  }

  async _flushSave() {
    if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null }
    try {
      const out = [...this.items.values()].map((r) => ({ ...r, speedBps: 0 }))
      const tmp = path.join(this.dataDir, 'queue.json.tmp')
      await fsp.writeFile(tmp, JSON.stringify(out))
      await fsp.rename(tmp, path.join(this.dataDir, 'queue.json'))
    } catch (e) {
      this.log.warn('Downloads', `queue save failed: ${e.message}`)
    }
  }

  // --------------------------------------------------------------------------- public API
  list() {
    return [...this.items.values()].map((r) => this._toPublic(r)).sort((a, b) => b.created - a.created)
  }

  async add({ url, fileName, dir, connections, speedLimitKBps, sha256, referer, startNow = true } = {}) {
    const v = validateDownloadUrl(url)
    if (!v.ok) return { ok: false, error: v.error }

    const maxConn = this.settings.maxConnections
    const rec = {
      id: crypto.randomBytes(8).toString('hex'),
      url: v.url,
      finalUrl: v.url,
      fileName: fileName ? sanitizeFileName(fileName) : (fileNameFromUrl(v.url) ?? 'download'),
      nameLocked: Boolean(fileName),
      dir: dir ? path.resolve(String(dir)) : null,
      filePath: null,
      partPath: null,
      size: 0,
      resumable: false,
      connections: clampInt(connections, 1, maxConn, this.settings.defaultConnections),
      speedLimitKBps: clampInt(speedLimitKBps, 0, 10_000_000, 0),
      sha256: typeof sha256 === 'string' && /^[0-9a-f]{64}$/i.test(sha256.trim()) ? sha256.trim().toLowerCase() : null,
      referer: typeof referer === 'string' && /^https?:\/\//i.test(referer) ? referer : null,
      status: 'queued',
      error: null,
      pieces: [],
      downloaded: 0,
      speedBps: 0,
      created: Date.now(),
      completedAt: null,
      etag: null
    }
    this.items.set(rec.id, rec)
    if (!startNow) rec.status = 'paused'
    this._scheduleSave()
    this._pump()
    this._scheduleEmit()
    return { ok: true, id: rec.id }
  }

  pause(id) {
    const rec = this.items.get(id)
    if (!rec) return { ok: false, error: 'not-found' }
    if (rec.status === 'queued') { rec.status = 'paused'; this._afterChange(); return { ok: true } }
    if (this.tasks.has(id)) { rec.status = 'paused'; this._abortTask(id); this._afterChange(); return { ok: true } }
    return { ok: false, error: 'not-running' }
  }

  resume(id) {
    const rec = this.items.get(id)
    if (!rec) return { ok: false, error: 'not-found' }
    if (rec.status === 'paused' || rec.status === 'error' || rec.status === 'canceled') {
      rec.status = 'queued'
      rec.error = null
      this._afterChange()
      return { ok: true }
    }
    return { ok: false, error: 'not-resumable-state' }
  }

  pauseAll() { for (const id of this.items.keys()) this.pause(id); return { ok: true } }
  resumeAll() { for (const id of this.items.keys()) this.resume(id); return { ok: true } }

  /** Cancel keeps the list entry; remove drops it. Partial data is deleted unless keepFiles. */
  async cancel(id, { deleteFiles = true } = {}) {
    const rec = this.items.get(id)
    if (!rec) return { ok: false, error: 'not-found' }
    this._abortTask(id)
    rec.status = 'canceled'
    if (deleteFiles) await this._deletePart(rec)
    rec.downloaded = 0
    rec.pieces = []
    this._afterChange()
    return { ok: true }
  }

  async remove(id, { deleteFile = false } = {}) {
    const rec = this.items.get(id)
    if (!rec) return { ok: false, error: 'not-found' }
    this._abortTask(id)
    await this._deletePart(rec)
    if (deleteFile && rec.status === 'completed' && rec.filePath) {
      try { await fsp.unlink(rec.filePath) } catch { /* already gone */ }
    }
    this.items.delete(id)
    this._afterChange()
    return { ok: true }
  }

  async clearFinished() {
    for (const [id, rec] of [...this.items]) if (rec.status === 'completed' || rec.status === 'canceled') this.items.delete(id)
    this._afterChange()
    return { ok: true }
  }

  getFilePath(id) {
    const rec = this.items.get(id)
    return rec?.status === 'completed' && rec.filePath && fs.existsSync(rec.filePath) ? rec.filePath : null
  }

  // --------------------------------------------------------------------------- internals
  _afterChange() {
    this._scheduleSave()
    this._pump()
    this._scheduleEmit()
  }

  _toPublic(r) {
    const total = r.size || 0
    const segments = r.status === 'downloading' && r.pieces.length
      ? r.pieces.map((p) => {
          const len = p.end - p.start + 1
          return len > 0 ? Math.min(1, p.done / len) : 0
        })
      : []
    const remaining = total > 0 ? total - r.downloaded : 0
    return {
      id: r.id, url: r.url, fileName: r.fileName, dir: r.dir, filePath: r.filePath,
      size: total, downloaded: r.downloaded, status: r.status, error: r.error,
      resumable: r.resumable, connections: r.connections, speedLimitKBps: r.speedLimitKBps,
      speedBps: r.status === 'downloading' ? r.speedBps : 0,
      etaSeconds: r.status === 'downloading' && r.speedBps > 0 && remaining > 0 ? Math.round(remaining / r.speedBps) : null,
      created: r.created, completedAt: r.completedAt, segments,
      hasSha256: Boolean(r.sha256)
    }
  }

  _scheduleEmit() {
    if (this._emitTimer) return
    this._emitTimer = setTimeout(() => {
      this._emitTimer = null
      this.emit('update', this.list())
    }, 250)
    this._emitTimer.unref?.()
  }

  _sampleSpeeds() {
    let any = false
    for (const [id, task] of this.tasks) {
      const rec = this.items.get(id)
      if (!rec) continue
      const now = Date.now()
      const dt = (now - task.lastSampleAt) / 1000
      if (dt <= 0) continue
      const inst = (rec.downloaded - task.lastSampleBytes) / dt
      rec.speedBps = rec.speedBps ? rec.speedBps * 0.6 + inst * 0.4 : inst
      task.lastSampleAt = now
      task.lastSampleBytes = rec.downloaded
      any = true
    }
    if (any) this._scheduleEmit()
  }

  _checkSchedule(silent = false) {
    const sch = this.settings.schedule
    const inside = !sch.enabled || isInsideWindow(new Date(), sch.start, sch.stop)
    if (inside === this._insideWindow && !silent) return
    const wasInside = this._insideWindow
    this._insideWindow = inside
    if (!inside) {
      // window closed: pause running downloads, remember which ones to bring back
      for (const [id] of [...this.tasks]) {
        const rec = this.items.get(id)
        if (!rec) continue
        rec.pausedBySchedule = true
        rec.status = 'paused'
        this._abortTask(id)
      }
    } else if (!wasInside || silent) {
      for (const rec of this.items.values()) {
        if (rec.pausedBySchedule && rec.status === 'paused') rec.status = 'queued'
        delete rec.pausedBySchedule
      }
    }
    this._afterChange()
  }

  _pump() {
    if (!this._loaded && this.items.size === 0) return
    if (!this._insideWindow) return
    const free = this.settings.maxConcurrent - this.tasks.size
    if (free <= 0) return
    const queued = [...this.items.values()].filter((r) => r.status === 'queued' && !this.tasks.has(r.id)).sort((a, b) => a.created - b.created)
    for (const rec of queued.slice(0, free)) this._startTask(rec)
  }

  _startTask(rec) {
    const ctrl = new AbortController()
    const throttle = new Throttle(rec.speedLimitKBps * 1024)
    const task = { ctrl, throttle, lastSampleAt: Date.now(), lastSampleBytes: rec.downloaded, fd: null }
    this.tasks.set(rec.id, task)
    rec.status = 'downloading'
    rec.error = null
    rec.speedBps = 0
    this._scheduleEmit()

    task.finished = this._run(rec, task).then(() => {
      // normal completion handled inside _run
    }).catch((err) => {
      if (err?.aborted || ctrl.signal.aborted) {
        // pause / cancel / schedule: status already set by the caller
      } else {
        rec.status = 'error'
        rec.error = err?.message ?? String(err)
        this.log.warn('Downloads', `${rec.fileName}: ${rec.error}`)
      }
    }).finally(async () => {
      try { await task.fd?.close() } catch { /* ignore */ }
      this.tasks.delete(rec.id)
      rec.speedBps = 0
      this._afterChange()
    })
  }

  _abortTask(id) {
    const task = this.tasks.get(id)
    if (task) task.ctrl.abort()
  }

  async _deletePart(rec) {
    // On Windows an open file cannot be deleted: wait for the running task to release it first.
    const task = this.tasks.get(rec.id)
    if (task?.finished) { try { await task.finished } catch { /* ignore */ } }
    await this._unlinkPart(rec)
  }

  async _unlinkPart(rec) {
    if (rec.partPath) { try { await fsp.unlink(rec.partPath) } catch { /* ignore */ } }
  }

  /** A name is taken if a file/part exists on disk or another queue entry already reserved it. */
  _pathTaken(p, selfId) {
    if (fs.existsSync(p) || fs.existsSync(p + PART_EXT)) return true
    for (const r of this.items.values()) if (r.id !== selfId && (r.filePath === p || r.partPath === p + PART_EXT)) return true
    return false
  }

  async _probe(rec, signal) {
    const headers = { Range: 'bytes=0-0' }
    if (rec.referer) headers.Referer = rec.referer
    const { res, finalUrl } = await request(rec.url, { headers, signal })
    const code = res.statusCode ?? 0
    const disp = parseContentDisposition(res.headers['content-disposition'])
    let size = 0
    let resumable = false
    if (code === 206) {
      const m = /\/(\d+)\s*$/.exec(String(res.headers['content-range'] ?? ''))
      if (m) { size = Number(m[1]); resumable = size > 0 }
    } else if (code === 200) {
      size = Number(res.headers['content-length'] ?? 0) || 0
    } else {
      res.resume()
      throw new Error(`HTTP ${code}`)
    }
    res.destroy()
    return { size, resumable, finalUrl, etag: res.headers.etag ?? null, name: disp }
  }

  async _prepareFiles(rec, probe) {
    if (!rec.dir) {
      let base = this.settings.downloadDir || this.defaultDownloadDir
      if (this.settings.organizeByCategory) base = path.join(base, categoryForFile(rec.fileName))
      rec.dir = base
    }
    await fsp.mkdir(rec.dir, { recursive: true })

    if (!rec.nameLocked && probe.name) rec.fileName = sanitizeFileName(probe.name, rec.fileName)
    if (!rec.filePath) {
      rec.filePath = uniquePath(rec.dir, path.basename(safeJoin(rec.dir, rec.fileName)), (p) => this._pathTaken(p, rec.id))
      rec.fileName = path.basename(rec.filePath)
      rec.partPath = rec.filePath + PART_EXT
    }

    if (probe.size > 0) {
      try {
        const st = await fsp.statfs(rec.dir)
        const free = Number(st.bavail) * Number(st.bsize)
        if (Number.isFinite(free) && free > 0 && free < probe.size - rec.downloaded) throw new Error('not-enough-disk-space')
      } catch (e) {
        if (e.message === 'not-enough-disk-space') throw e
      }
    }
  }

  async _run(rec, task) {
    const { signal } = task.ctrl
    const probe = await this._probe(rec, signal)

    // A changed remote file invalidates partial data.
    const changed = rec.pieces.length > 0 && ((rec.etag && probe.etag && rec.etag !== probe.etag) || (rec.size && probe.size && rec.size !== probe.size))
    if (changed || (rec.pieces.length > 0 && !probe.resumable)) {
      await this._unlinkPart(rec)
      rec.pieces = []
      rec.downloaded = 0
    }

    rec.finalUrl = probe.finalUrl
    rec.size = probe.size
    rec.resumable = probe.resumable
    rec.etag = probe.etag
    await this._prepareFiles(rec, probe)

    if (!rec.pieces.length) {
      rec.pieces = probe.resumable ? planPieces(probe.size, rec.connections) : [{ start: 0, end: probe.size > 0 ? probe.size - 1 : -1, done: 0 }]
      rec.downloaded = 0
    }
    task.lastSampleBytes = rec.downloaded
    this._scheduleSave()

    const flags = fs.existsSync(rec.partPath) && rec.downloaded > 0 ? 'r+' : 'w+'
    task.fd = await fsp.open(rec.partPath, flags)
    if (flags === 'w+' && probe.size > 0 && probe.resumable) {
      try { await task.fd.truncate(probe.size) } catch { /* sparse allocation is optional */ }
    }

    const maxTries = this.settings.retries + 1
    const queue = rec.pieces.filter((p) => p.end < p.start || p.done < p.end - p.start + 1)
    const workers = probe.resumable ? Math.min(rec.connections, Math.max(1, queue.length)) : 1
    let failure = null

    const persistTimer = setInterval(() => this._scheduleSave(), 1500)
    try {
      await Promise.all(Array.from({ length: workers }, async () => {
        while (!failure && !signal.aborted) {
          const piece = queue.shift()
          if (!piece) return
          try {
            await this._downloadPiece(rec, task, piece, maxTries)
          } catch (e) {
            if (!failure) failure = e
            task.ctrl.abort()
          }
        }
      }))
    } finally {
      clearInterval(persistTimer)
    }

    if (failure && !failure.aborted) throw failure
    if (signal.aborted) throw new AbortedError()

    await task.fd.close()
    task.fd = null
    await this._finish(rec)
  }

  async _downloadPiece(rec, task, piece, maxTries) {
    const { signal } = task.ctrl
    let attempt = 0
    for (;;) {
      if (signal.aborted) throw new AbortedError()
      const before = piece.done
      try {
        await this._streamPiece(rec, task, piece)
        return
      } catch (err) {
        if (signal.aborted) throw new AbortedError()
        if (piece.done > before) attempt = 0 // progress was made: retry budget restarts
        attempt += 1
        if (attempt >= maxTries) throw err
        const wait = Math.min(15000, 1000 * 2 ** (attempt - 1))
        this.log.warn('Downloads', `${rec.fileName}: retry ${attempt}/${maxTries - 1} after ${err.message}`)
        await sleep(wait)
      }
    }
  }

  async _streamPiece(rec, task, piece) {
    const { signal } = task.ctrl
    const knownLength = rec.resumable && piece.end >= piece.start
    const from = piece.start + piece.done
    if (knownLength && from > piece.end) return

    const headers = {}
    if (rec.referer) headers.Referer = rec.referer
    if (rec.resumable) headers.Range = `bytes=${from}-${piece.end}`

    const { res } = await request(rec.finalUrl, { headers, signal })
    const code = res.statusCode ?? 0
    if (rec.resumable && code !== 206) { res.resume(); throw new Error(`range-not-honoured (HTTP ${code})`) }
    if (!rec.resumable && code !== 200) { res.resume(); throw new Error(`HTTP ${code}`) }

    if (!rec.resumable) {
      // server restarts from byte 0 on every attempt
      rec.downloaded = Math.max(0, rec.downloaded - piece.done)
      piece.done = 0
    }
    let pos = rec.resumable ? from : piece.done
    const limit = knownLength ? piece.end + 1 : Infinity
    try {
      for await (const chunk of res) {
        if (signal.aborted) throw new AbortedError()
        let buf = chunk
        if (pos + buf.length > limit) buf = buf.subarray(0, limit - pos)
        if (buf.length) {
          await task.fd.write(buf, 0, buf.length, pos)
          pos += buf.length
          piece.done += buf.length
          rec.downloaded += buf.length
        }
        const wait = Math.max(this.globalThrottle.take(chunk.length), task.throttle.take(chunk.length))
        if (wait > 5) await sleep(wait)
        if (pos >= limit) break
      }
    } finally {
      res.destroy()
    }

    if (knownLength && piece.done < piece.end - piece.start + 1) throw new Error('connection-closed-early')
    if (!knownLength) {
      // Unknown or non-resumable length: whatever arrived is the whole file.
      piece.end = piece.start + piece.done - 1
      rec.size = piece.done
    }
  }

  async _finish(rec) {
    if (rec.sha256) {
      const actual = await hashFile(rec.partPath)
      if (actual !== rec.sha256) {
        await this._unlinkPart(rec)
        rec.pieces = []
        rec.downloaded = 0
        throw new Error('sha256-mismatch')
      }
    }
    // final name may have been taken while downloading
    let finalPath = rec.filePath
    if (fs.existsSync(finalPath)) finalPath = uniquePath(rec.dir, path.basename(finalPath), (p) => this._pathTaken(p, rec.id))
    await fsp.rename(rec.partPath, finalPath)
    rec.filePath = finalPath
    rec.fileName = path.basename(finalPath)
    rec.partPath = null
    rec.status = 'completed'
    rec.completedAt = Date.now()
    rec.downloaded = rec.size || rec.downloaded
    rec.pieces = []
    this.emit('completed', this._toPublic(rec))
  }
}

export function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256')
    const s = fs.createReadStream(filePath)
    s.on('data', (d) => h.update(d))
    s.on('error', reject)
    s.on('end', () => resolve(h.digest('hex')))
  })
}

export default DownloadManager
