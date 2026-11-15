// Text file read/write for the Text Editor (fs:readFile / fs:writeFile).
// Pure Node, no Electron: unit-testable. Never lossy: a file that is not valid UTF-8 / UTF-16LE
// text is refused instead of being decoded with U+FFFD and then overwritten on save.
import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

export const TEXT_ENCODINGS = Object.freeze(['utf-8', 'utf-16le'])

/**
 * Decodes a file buffer. Returns { ok: true, content, encoding, bom } or
 * { ok: false, code: 'not-text' | 'unsupported-encoding' }.
 */
export function decodeTextBuffer(buf) {
  const bytes = Buffer.isBuffer(buf) ? buf : Buffer.from(buf ?? [])
  let encoding = 'utf-8'
  let bom = false
  let body = bytes
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    bom = true
    body = bytes.subarray(3)
  } else if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    encoding = 'utf-16le'
    bom = true
    body = bytes.subarray(2)
  } else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { ok: false, code: 'unsupported-encoding' } // UTF-16 BE: rare, not worth a lossy guess
  }
  if (encoding === 'utf-16le' && body.length % 2 !== 0) return { ok: false, code: 'not-text' }
  let content
  try {
    content = new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(body)
  } catch {
    // Not valid UTF-8 (e.g. Windows-1252): saving it back as UTF-8 would corrupt every accented byte.
    return { ok: false, code: 'unsupported-encoding' }
  }
  if (content.includes('\0')) return { ok: false, code: 'not-text' } // binary file
  return { ok: true, content, encoding, bom }
}

/** Encodes editor text back to the bytes it was read from (same encoding and BOM). */
export function encodeText(content, { encoding = 'utf-8', bom = false } = {}) {
  const text = String(content ?? '')
  if (encoding === 'utf-16le') {
    const body = Buffer.from(text, 'utf16le')
    return bom ? Buffer.concat([Buffer.from([0xff, 0xfe]), body]) : body
  }
  const body = Buffer.from(text, 'utf8')
  return bom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body]) : body
}

/** Writes `data` to a temp file in the same folder, then renames it over `filePath`. */
export async function writeFileAtomic(filePath, data) {
  const dir = path.dirname(filePath)
  const tmp = path.join(dir, `.${path.basename(filePath)}.${crypto.randomBytes(6).toString('hex')}.tmp`)
  const handle = await fsp.open(tmp, 'wx')
  try {
    await handle.writeFile(data)
    await handle.sync()
  } catch (err) {
    await handle.close().catch(() => {})
    await fsp.unlink(tmp).catch(() => {})
    throw err
  }
  await handle.close()
  try {
    await fsp.rename(tmp, filePath)
  } catch (err) {
    await fsp.unlink(tmp).catch(() => {})
    throw err
  }
}

export async function readTextFile(filePath) {
  return decodeTextBuffer(await fsp.readFile(filePath))
}

export async function writeTextFile(filePath, content, { encoding = 'utf-8', bom = false } = {}) {
  const enc = TEXT_ENCODINGS.includes(encoding) ? encoding : 'utf-8'
  await writeFileAtomic(filePath, encodeText(content, { encoding: enc, bom: Boolean(bom) }))
}
