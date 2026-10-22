import path from 'node:path'
import fs from 'node:fs'

const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

/** Turns any server/user supplied name into a safe single path segment for Windows and POSIX. */
export function sanitizeFileName(name, fallback = 'download') {
  let n = String(name ?? '')
  try { n = decodeURIComponent(n) } catch { /* keep raw */ }
  // control chars + bidi overrides/isolates (U+202E "exe.pdf" extension spoofing)
  n = n.replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, '')
  n = n.split(/[\\/]/).pop() ?? ''
  n = n.replace(/[<>:"|?*]/g, '_').replace(/[. ]+$/g, '').replace(/^\.+/, '').trim()
  if (!n || RESERVED_NAMES.test(n)) n = n ? `_${n}` : fallback
  if (n.length > 180) {
    const ext = path.extname(n).slice(0, 20)
    n = n.slice(0, 180 - ext.length) + ext
  }
  return n
}

export function parseContentDisposition(header) {
  if (!header) return null
  const star = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header)
  if (star) {
    try { return decodeURIComponent(star[2].trim().replace(/^"|"$/g, '')) } catch { /* fall through */ }
  }
  const plain = /filename\s*=\s*("([^"]+)"|([^;]+))/i.exec(header)
  if (plain) return (plain[2] ?? plain[3] ?? '').trim()
  return null
}

export function fileNameFromUrl(rawUrl) {
  try {
    const u = new URL(rawUrl)
    const last = u.pathname.split('/').filter(Boolean).pop()
    return last ? sanitizeFileName(last) : null
  } catch {
    return null
  }
}

export function validateDownloadUrl(rawUrl) {
  let u
  try { u = new URL(String(rawUrl ?? '').trim()) } catch { return { ok: false, error: 'invalid-url' } }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: 'unsupported-protocol' }
  return { ok: true, url: u.toString() }
}

/**
 * Splits [0,size) into pieces consumed by a pool of `connections` workers. Several pieces per
 * connection keep every connection busy until the end even if some pieces are slower.
 */
export function planPieces(size, connections) {
  if (!Number.isFinite(size) || size <= 0) return []
  const MIN = 512 * 1024
  const MAX_PIECES = 96
  const conns = Math.max(1, connections | 0)
  let pieceSize = Math.ceil(size / (conns * 4))
  pieceSize = Math.max(MIN, pieceSize)
  pieceSize = Math.max(pieceSize, Math.ceil(size / MAX_PIECES))
  const pieces = []
  for (let start = 0; start < size; start += pieceSize) {
    pieces.push({ start, end: Math.min(size - 1, start + pieceSize - 1), done: 0 })
  }
  return pieces
}

const CATEGORY_BY_EXT = {
  Video: ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.wmv', '.flv', '.m4v', '.ts'],
  Music: ['.mp3', '.flac', '.wav', '.aac', '.ogg', '.m4a', '.opus', '.wma'],
  Compressed: ['.zip', '.rar', '.7z', '.tar', '.gz', '.xz', '.bz2', '.zst'],
  Documents: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.epub', '.csv', '.odt'],
  Programs: ['.exe', '.msi', '.msix', '.appx', '.dmg', '.apk', '.deb', '.rpm', '.iso', '.appimage'],
  Images: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.tif', '.tiff', '.avif']
}

export function categoryForFile(fileName) {
  const ext = path.extname(String(fileName ?? '')).toLowerCase()
  for (const [cat, list] of Object.entries(CATEGORY_BY_EXT)) if (list.includes(ext)) return cat
  return 'Other'
}

/** Returns a path that does not exist yet: "file.zip", "file (1).zip", ... */
export function uniquePath(dir, fileName, exists = (p) => fs.existsSync(p)) {
  const ext = path.extname(fileName)
  const base = ext ? fileName.slice(0, -ext.length) : fileName
  let candidate = path.join(dir, fileName)
  for (let i = 1; exists(candidate) && i < 10000; i++) candidate = path.join(dir, `${base} (${i})${ext}`)
  return candidate
}

/** Resolves `fileName` inside `dir` and guarantees the result cannot escape `dir`. */
export function safeJoin(dir, fileName) {
  const root = path.resolve(dir)
  const full = path.resolve(root, sanitizeFileName(fileName))
  const rel = path.relative(root, full)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('unsafe-path')
  return full
}

/** Byte-rate limiter: take(n) returns how many ms the caller should wait before continuing. */
export class Throttle {
  constructor(bytesPerSecond = 0) {
    this.rate = bytesPerSecond
    this.nextFree = 0
  }

  setRate(bytesPerSecond) {
    this.rate = Math.max(0, Number(bytesPerSecond) || 0)
  }

  take(n, now = Date.now()) {
    if (!this.rate) return 0
    const start = Math.max(now, this.nextFree)
    this.nextFree = start + (n / this.rate) * 1000
    return Math.max(0, start - now)
  }
}

export function parseHHMM(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? ''))
  if (!m) return null
  const h = Number(m[1]); const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** Is `date` inside the [start, stop) window? Windows crossing midnight are supported. */
export function isInsideWindow(date, start, stop) {
  const s = parseHHMM(start); const e = parseHHMM(stop)
  if (s === null || e === null || s === e) return true
  const cur = date.getHours() * 60 + date.getMinutes()
  return s < e ? cur >= s && cur < e : cur >= s || cur < e
}

export function clampInt(value, min, max, fallback) {
  const n = Math.trunc(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}
