// Client for Susuya (https://susuya.darkhub.ink), DarkHub's file sharing service. Same protocol as the site:
//   POST /api/uploads {name,size,mime,ttl} -> {id, deleteToken, chunkSize, totalChunks}
//   PUT  /api/uploads/:id/chunks/:n (octet-stream)   x3 in parallel, 3 tries each with backoff
//   POST /api/uploads/:id/complete -> {id, name, size, kind, createdAt, expiresAt}
//   DELETE /api/uploads/:id (abort)   DELETE /api/files/:id with x-delete-token (remove a finished file)
// Files are read from disk one chunk at a time: a 600 MB upload never sits in memory.
import fs from 'node:fs'
import path from 'node:path'

export const SUSUYA_ORIGIN = 'https://susuya.darkhub.ink'
const PARALLEL = 3
const TRIES = 3

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav', '.flac': 'audio/flac', '.pdf': 'application/pdf', '.zip': 'application/zip', '.7z': 'application/x-7z-compressed',
  '.rar': 'application/vnd.rar', '.txt': 'text/plain', '.json': 'application/json', '.log': 'text/plain'
}
export const mimeOf = (file) => MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'

export const links = (id) => ({ pageUrl: `${SUSUYA_ORIGIN}/f/${id}`, directUrl: `${SUSUYA_ORIGIN}/d/${id}` })

async function json(res) {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
  return body
}

function readChunk(fd, start, length) {
  const buf = Buffer.allocUnsafe(length)
  let off = 0
  while (off < length) {
    const n = fs.readSync(fd, buf, off, length - off, start + off)
    if (!n) break
    off += n
  }
  return off === length ? buf : buf.subarray(0, off)
}

export class SusuyaClient {
  constructor({ fetchImpl = globalThis.fetch, origin = SUSUYA_ORIGIN } = {}) {
    this.fetch = fetchImpl
    this.origin = origin
    this.configCache = null
  }

  async config() {
    if (this.configCache && Date.now() - this.configCache.at < 600000) return this.configCache.value
    const value = await json(await this.fetch(`${this.origin}/api/config`))
    this.configCache = { at: Date.now(), value }
    return value
  }

  /**
   * Uploads a file from disk. onProgress(sentBytes, totalBytes); signal (AbortSignal) cancels and removes the
   * partial upload on the server.
   */
  async upload(file, { ttl = 3600, name, onProgress = () => {}, signal } = {}) {
    const size = fs.statSync(file).size
    const cfg = await this.config()
    if (size <= 0) throw new Error('empty file')
    if (size > cfg.maxFileSize) throw new Error(`file larger than ${Math.round(cfg.maxFileSize / 1048576)} MB`)
    const allowedTtl = cfg.ttlOptions?.includes(ttl) ? ttl : cfg.ttlOptions?.[0] ?? 3600
    const session = await json(await this.fetch(`${this.origin}/api/uploads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: name || path.basename(file), size, mime: mimeOf(file), ttl: allowedTtl }),
      signal
    }))
    const fd = fs.openSync(file, 'r')
    let next = 0
    let sent = 0
    const worker = async () => {
      while (next < session.totalChunks) {
        const index = next++
        const start = index * session.chunkSize
        const body = readChunk(fd, start, Math.min(session.chunkSize, size - start))
        for (let attempt = 1; ; attempt++) {
          try {
            await json(await this.fetch(`${this.origin}/api/uploads/${session.id}/chunks/${index}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body, signal }))
            break
          } catch (e) {
            if (signal?.aborted || attempt >= TRIES) throw e
            await new Promise((r) => setTimeout(r, 1000 * attempt))
          }
        }
        sent += body.length
        onProgress(sent, size)
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.min(PARALLEL, session.totalChunks) }, worker))
      const done = await json(await this.fetch(`${this.origin}/api/uploads/${session.id}/complete`, { method: 'POST', signal }))
      return { ...done, deleteToken: session.deleteToken, ...links(done.id) }
    } catch (e) {
      this.fetch(`${this.origin}/api/uploads/${session.id}`, { method: 'DELETE' }).catch(() => {})
      throw e
    } finally {
      fs.closeSync(fd)
    }
  }

  async remove(id, deleteToken) {
    return json(await this.fetch(`${this.origin}/api/files/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'x-delete-token': deleteToken } }))
  }
}
