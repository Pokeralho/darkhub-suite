// Minimal ZIP rewriter for OOXML (docx/xlsx/pptx) document properties.
// Every entry other than the ones we replace is copied byte-for-byte (still compressed); local headers are rebuilt from
// the central directory so data descriptors are not needed. ZIP64 and encrypted archives are refused.
import fs from 'node:fs/promises'
import zlib from 'node:zlib'

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function readZipEntries(buf) {
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('not a ZIP archive (no end of central directory)')
  const count = buf.readUInt16LE(eocd + 10)
  const cdSize = buf.readUInt32LE(eocd + 12)
  const cdOffset = buf.readUInt32LE(eocd + 16)
  if (count === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff) throw new Error('ZIP64 archives are not supported')
  const entries = []
  let p = cdOffset
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('corrupt central directory')
    const e = {
      versionMadeBy: buf.readUInt16LE(p + 4), versionNeeded: buf.readUInt16LE(p + 6), flags: buf.readUInt16LE(p + 8),
      method: buf.readUInt16LE(p + 10), time: buf.readUInt16LE(p + 12), date: buf.readUInt16LE(p + 14),
      crc: buf.readUInt32LE(p + 16), compSize: buf.readUInt32LE(p + 20), size: buf.readUInt32LE(p + 24),
      internalAttr: buf.readUInt16LE(p + 36), externalAttr: buf.readUInt32LE(p + 38), localOffset: buf.readUInt32LE(p + 42)
    }
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32)
    e.nameBytes = buf.subarray(p + 46, p + 46 + nameLen)
    e.name = e.nameBytes.toString(e.flags & 0x800 ? 'utf8' : 'latin1')
    e.comment = buf.subarray(p + 46 + nameLen + extraLen, p + 46 + nameLen + extraLen + commentLen)
    if (e.flags & 0x1) throw new Error('encrypted ZIP entries are not supported')
    if (e.compSize === 0xffffffff || e.size === 0xffffffff || e.localOffset === 0xffffffff) throw new Error('ZIP64 archives are not supported')
    const lp = e.localOffset
    if (buf.readUInt32LE(lp) !== 0x04034b50) throw new Error(`corrupt local header for ${e.name}`)
    const lName = buf.readUInt16LE(lp + 26), lExtra = buf.readUInt16LE(lp + 28)
    e.dataStart = lp + 30 + lName + lExtra
    e.raw = buf.subarray(e.dataStart, e.dataStart + e.compSize)
    entries.push(e)
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

export function entryData(e) {
  if (e.method === 0) return Buffer.from(e.raw)
  if (e.method === 8) return zlib.inflateRawSync(e.raw)
  throw new Error(`unsupported compression method ${e.method} in ${e.name}`)
}

/** replacements: Map<name, Buffer|null> (null removes the entry). New names are appended. */
export function rewriteZip(buf, replacements) {
  const entries = readZipEntries(buf)
  const out = []
  const central = []
  let offset = 0
  const seen = new Set()
  const emit = (e, data) => {
    let raw = e.raw, method = e.method, crc = e.crc, size = e.size
    if (data) {
      raw = zlib.deflateRawSync(data, { level: 9 })
      method = 8
      crc = crc32(data)
      size = data.length
    }
    const flags = (e.flags & ~0x8) | (!e.nameBytes && /[^\x00-\x7f]/.test(e.name) ? 0x800 : 0)
    const nameBytes = e.nameBytes || Buffer.from(e.name, 'utf8')
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(e.versionNeeded || 20, 4)
    local.writeUInt16LE(flags, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(e.time, 10)
    local.writeUInt16LE(e.date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(raw.length, 18)
    local.writeUInt32LE(size, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28)
    out.push(local, nameBytes, raw)
    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(e.versionMadeBy || 20, 4)
    cd.writeUInt16LE(e.versionNeeded || 20, 6)
    cd.writeUInt16LE(flags, 8)
    cd.writeUInt16LE(method, 10)
    cd.writeUInt16LE(e.time, 12)
    cd.writeUInt16LE(e.date, 14)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(raw.length, 20)
    cd.writeUInt32LE(size, 24)
    cd.writeUInt16LE(nameBytes.length, 28)
    cd.writeUInt16LE(0, 30)
    cd.writeUInt16LE(e.comment?.length || 0, 32)
    cd.writeUInt16LE(0, 34)
    cd.writeUInt16LE(e.internalAttr || 0, 36)
    cd.writeUInt32LE(e.externalAttr || 0, 38)
    cd.writeUInt32LE(offset, 42)
    central.push(cd, nameBytes, e.comment || Buffer.alloc(0))
    offset += 30 + nameBytes.length + raw.length
  }
  for (const e of entries) {
    seen.add(e.name)
    if (replacements.has(e.name)) {
      const data = replacements.get(e.name)
      if (data === null) continue
      emit(e, data)
    } else emit(e, null)
  }
  const now = new Date()
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  for (const [name, data] of replacements) {
    if (seen.has(name) || data === null) continue
    emit({ name, flags: 0, method: 8, time: dosTime, date: dosDate, versionNeeded: 20, versionMadeBy: 20 }, data)
  }
  const cdBuf = Buffer.concat(central)
  const count = central.length / 3
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(count, 8)
  eocd.writeUInt16LE(count, 10)
  eocd.writeUInt32LE(cdBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...out, cdBuf, eocd])
}

// ---------------------------------------------------------------- docProps XML

const XML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }
export const xmlEscape = (s) => String(s).replace(/[&<>"']/g, (c) => XML_ESC[c])
const xmlUnescape = (s) => String(s)
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

/** canonical field -> [part, qualified element name] */
export const OOXML_FIELDS = {
  title: ['core', 'dc:title'],
  subject: ['core', 'dc:subject'],
  author: ['core', 'dc:creator'],
  keywords: ['core', 'cp:keywords'],
  description: ['core', 'dc:description'],
  lastModifiedBy: ['core', 'cp:lastModifiedBy'],
  category: ['core', 'cp:category'],
  creationDate: ['core', 'dcterms:created'],
  modifiedDate: ['core', 'dcterms:modified'],
  company: ['app', 'Company'],
  manager: ['app', 'Manager']
}
// Personal/identifying values cleared by "strip all" (application name/version and statistics are left alone).
const STRIP_CORE = ['dc:title', 'dc:subject', 'dc:creator', 'cp:keywords', 'dc:description', 'cp:lastModifiedBy', 'cp:category', 'cp:revision', 'cp:contentStatus', 'dc:identifier', 'dc:language', 'cp:lastPrinted', 'dcterms:created', 'dcterms:modified', 'cp:version']
const STRIP_APP = ['Company', 'Manager', 'Template', 'TotalTime', 'HyperlinkBase']

const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
function elementRe(qname) {
  return new RegExp(`<${reEsc(qname)}(\\s[^>]*?)?(?:/>|>([\\s\\S]*?)</${reEsc(qname)}>)`)
}

export function getXmlElement(xml, qname) {
  const m = elementRe(qname).exec(xml || '')
  return m ? xmlUnescape(m[2] ?? '') : undefined
}

export function setXmlElement(xml, qname, value, rootClose) {
  const re = elementRe(qname)
  if (value == null || value === '') return xml.replace(re, '')
  const isW3c = qname.startsWith('dcterms:')
  const attrs = isW3c ? ' xsi:type="dcterms:W3CDTF"' : ''
  const text = isW3c ? toW3cdtf(value) : xmlEscape(value)
  if (re.test(xml)) return xml.replace(re, (_m, a) => `<${qname}${a && !/\/$/.test(a) ? a : attrs}>${text}</${qname}>`)
  const idx = xml.lastIndexOf(rootClose)
  if (idx < 0) throw new Error(`malformed properties part (no ${rootClose})`)
  return `${xml.slice(0, idx)}<${qname}${attrs}>${text}</${qname}>${xml.slice(idx)}`
}

function toW3cdtf(v) {
  const t = Date.parse(String(v))
  if (!Number.isFinite(t)) throw new Error(`invalid date: ${v}`)
  return new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

const CORE_PATH = 'docProps/core.xml'
const APP_PATH = 'docProps/app.xml'

export function readOoxmlProps(buf) {
  const entries = readZipEntries(buf)
  const find = (n) => entries.find((e) => e.name === n)
  const core = find(CORE_PATH) ? entryData(find(CORE_PATH)).toString('utf8') : null
  const app = find(APP_PATH) ? entryData(find(APP_PATH)).toString('utf8') : null
  const fields = {}
  for (const [key, [part, q]] of Object.entries(OOXML_FIELDS)) {
    const v = getXmlElement(part === 'core' ? core : app, q)
    if (v !== undefined) fields[key] = v
  }
  for (const q of ['Application', 'AppVersion', 'Template', 'TotalTime', 'Pages', 'Words', 'Slides']) {
    const v = getXmlElement(app, q)
    if (v !== undefined) fields[`app.${q}`] = v
  }
  for (const q of ['cp:revision', 'cp:lastPrinted']) {
    const v = getXmlElement(core, q)
    if (v !== undefined) fields[`core.${q.split(':')[1]}`] = v
  }
  return { hasCore: core != null, hasApp: app != null, fields, entryCount: entries.length }
}

/** Returns the new archive bytes. Only the docProps parts change. */
export function writeOoxmlProps(buf, fields = {}, { strip = false } = {}) {
  const entries = readZipEntries(buf)
  const find = (n) => entries.find((e) => e.name === n)
  const coreEntry = find(CORE_PATH)
  const appEntry = find(APP_PATH)
  let core = coreEntry ? entryData(coreEntry).toString('utf8') : null
  let app = appEntry ? entryData(appEntry).toString('utf8') : null
  const wantsCore = strip || Object.keys(fields).some((k) => OOXML_FIELDS[k]?.[0] === 'core')
  if (!core && wantsCore && !strip) throw new Error('this document has no docProps/core.xml part')
  if (strip) {
    for (const q of STRIP_CORE) if (core) core = setXmlElement(core, q, '', '</cp:coreProperties>')
    for (const q of STRIP_APP) if (app) app = setXmlElement(app, q, '', '</Properties>')
  }
  for (const [key, value] of Object.entries(fields)) {
    const map = OOXML_FIELDS[key]
    if (!map) continue
    const [part, q] = map
    if (part === 'core') core = setXmlElement(core, q, value, '</cp:coreProperties>')
    else if (app) app = setXmlElement(app, q, value, '</Properties>')
    else if (value) throw new Error('this document has no docProps/app.xml part')
  }
  const repl = new Map()
  if (core != null) repl.set(CORE_PATH, Buffer.from(core, 'utf8'))
  if (app != null) repl.set(APP_PATH, Buffer.from(app, 'utf8'))
  return rewriteZip(buf, repl)
}

export async function writeOoxmlFile(inPath, outPath, fields, opts) {
  const buf = await fs.readFile(inPath)
  await fs.writeFile(outPath, writeOoxmlProps(buf, fields, opts))
}

