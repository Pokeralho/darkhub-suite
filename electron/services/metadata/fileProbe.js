// Type detection by magic bytes, hex head, and the filesystem side of any file:
// timestamps, attributes and NTFS alternate data streams (Zone.Identifier "downloaded from the internet").
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'

const HEAD_BYTES = 256

/** type -> { family, label, mime } */
export const TYPES = {
  jpeg: { family: 'image', label: 'JPEG', mime: 'image/jpeg' },
  png: { family: 'image', label: 'PNG', mime: 'image/png' },
  webp: { family: 'image', label: 'WebP', mime: 'image/webp' },
  tiff: { family: 'image', label: 'TIFF', mime: 'image/tiff' },
  raw: { family: 'image', label: 'RAW (TIFF-based)', mime: 'image/x-raw' },
  heic: { family: 'image', label: 'HEIC/HEIF', mime: 'image/heic' },
  avif: { family: 'image', label: 'AVIF', mime: 'image/avif' },
  gif: { family: 'image', label: 'GIF', mime: 'image/gif' },
  bmp: { family: 'image', label: 'BMP', mime: 'image/bmp' },
  ico: { family: 'image', label: 'ICO', mime: 'image/x-icon' },
  svg: { family: 'image', label: 'SVG', mime: 'image/svg+xml' },
  mp3: { family: 'audio', label: 'MP3', mime: 'audio/mpeg' },
  flac: { family: 'audio', label: 'FLAC', mime: 'audio/flac' },
  ogg: { family: 'audio', label: 'Ogg (Vorbis/Opus)', mime: 'audio/ogg' },
  m4a: { family: 'audio', label: 'M4A/AAC (MP4)', mime: 'audio/mp4' },
  wav: { family: 'audio', label: 'WAV', mime: 'audio/wav' },
  mp4: { family: 'video', label: 'MP4', mime: 'video/mp4' },
  mov: { family: 'video', label: 'QuickTime MOV', mime: 'video/quicktime' },
  mkv: { family: 'video', label: 'Matroska', mime: 'video/x-matroska' },
  webm: { family: 'video', label: 'WebM', mime: 'video/webm' },
  avi: { family: 'video', label: 'AVI', mime: 'video/x-msvideo' },
  pdf: { family: 'pdf', label: 'PDF', mime: 'application/pdf' },
  docx: { family: 'office', label: 'Word (OOXML)', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  xlsx: { family: 'office', label: 'Excel (OOXML)', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  pptx: { family: 'office', label: 'PowerPoint (OOXML)', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  epub: { family: 'other', label: 'EPUB', mime: 'application/epub+zip' },
  zip: { family: 'other', label: 'ZIP', mime: 'application/zip' },
  ole: { family: 'other', label: 'OLE2 (doc/xls/msi)', mime: 'application/x-ole-storage' },
  pe: { family: 'pe', label: 'Windows PE (exe/dll)', mime: 'application/vnd.microsoft.portable-executable' },
  elf: { family: 'other', label: 'ELF', mime: 'application/x-elf' },
  rar: { family: 'other', label: 'RAR', mime: 'application/vnd.rar' },
  '7z': { family: 'other', label: '7-Zip', mime: 'application/x-7z-compressed' },
  gzip: { family: 'other', label: 'GZIP', mime: 'application/gzip' },
  font: { family: 'other', label: 'Font (TTF/OTF)', mime: 'font/sfnt' },
  text: { family: 'other', label: 'Text', mime: 'text/plain' },
  unknown: { family: 'other', label: 'Unknown', mime: 'application/octet-stream' }
}

const RAW_EXT = new Set(['.dng', '.cr2', '.nef', '.arw', '.orf', '.rw2', '.pef', '.srw', '.raf'])

function ascii(buf, start, end) {
  return buf.subarray(start, Math.min(end, buf.length)).toString('latin1')
}

/** Detect the real type from the first bytes (and, for containers, a little more of the file). */
export function detectType(head, ext = '', tail = null) {
  const e = String(ext || '').toLowerCase()
  const b = head
  const at = (i, hex) => b.length >= i + hex.length / 2 && b.subarray(i, i + hex.length / 2).toString('hex') === hex
  let type = 'unknown'
  if (at(0, 'ffd8ff')) type = 'jpeg'
  else if (at(0, '89504e470d0a1a0a')) type = 'png'
  else if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') type = 'webp'
  else if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WAVE') type = 'wav'
  else if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'AVI ') type = 'avi'
  else if (at(0, '49492a00') || at(0, '4d4d002a') || at(0, '49492b00') || at(0, '4d4d002b')) type = RAW_EXT.has(e) ? 'raw' : 'tiff'
  else if (ascii(b, 4, 8) === 'ftyp') {
    const brand = ascii(b, 8, 12)
    const brands = ascii(b, 8, Math.min(b.length, 8 + Math.max(8, b.readUInt32BE(0) - 8)))
    if (/heic|heix|hevc|heim|heis|mif1|msf1/.test(brand)) type = brands.includes('avif') ? 'avif' : 'heic'
    else if (/avif|avis/.test(brand)) type = 'avif'
    else if (/M4A |M4B |M4P /.test(brand)) type = 'm4a'
    else if (brand === 'qt  ') type = 'mov'
    else type = e === '.m4a' || e === '.m4b' ? 'm4a' : e === '.mov' ? 'mov' : 'mp4'
  } else if (ascii(b, 0, 3) === 'ID3' || (b.length > 1 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && (b[1] & 0x06) !== 0)) type = 'mp3'
  else if (ascii(b, 0, 4) === 'fLaC') type = 'flac'
  else if (ascii(b, 0, 4) === 'OggS') type = 'ogg'
  else if (at(0, '1a45dfa3')) type = ascii(b, 0, b.length).includes('webm') ? 'webm' : 'mkv'
  else if (ascii(b, 0, 5) === '%PDF-') type = 'pdf'
  else if (at(0, '504b0304')) {
    const scan = ascii(b, 0, b.length) + (tail ? tail.toString('latin1') : '')
    if (ascii(b, 30, 38) === 'mimetype' && scan.includes('application/epub+zip')) type = 'epub'
    else if (scan.includes('[Content_Types].xml') || ['.docx', '.xlsx', '.pptx', '.docm', '.xlsm', '.pptm'].includes(e)) {
      if (scan.includes('word/') || e.startsWith('.doc')) type = 'docx'
      else if (scan.includes('xl/') || e.startsWith('.xls')) type = 'xlsx'
      else if (scan.includes('ppt/') || e.startsWith('.ppt')) type = 'pptx'
      else type = 'zip'
    } else type = 'zip'
  } else if (ascii(b, 0, 2) === 'MZ') type = 'pe'
  else if (at(0, '7f454c46')) type = 'elf'
  else if (ascii(b, 0, 4) === 'GIF8') type = 'gif'
  else if (ascii(b, 0, 2) === 'BM' && b.length > 14) type = 'bmp'
  else if (at(0, '00000100')) type = 'ico'
  else if (at(0, 'd0cf11e0a1b11ae1')) type = 'ole'
  else if (ascii(b, 0, 4) === 'Rar!') type = 'rar'
  else if (at(0, '377abcaf271c')) type = '7z'
  else if (at(0, '1f8b')) type = 'gzip'
  else if (at(0, '00010000') || ascii(b, 0, 4) === 'OTTO') type = 'font'
  else {
    const txt = ascii(b, 0, b.length).replace(/^﻿|^\xef\xbb\xbf/, '').trimStart()
    if (/^<svg|^<\?xml[\s\S]*<svg/i.test(txt) || (e === '.svg' && txt.startsWith('<'))) type = 'svg'
    else if (b.length && !b.subarray(0, Math.min(b.length, 128)).some((c) => c === 0)) type = 'text'
  }
  return { type, ...TYPES[type] }
}

export function hexDump(buf, columns = 16) {
  const rows = []
  for (let off = 0; off < buf.length; off += columns) {
    const slice = buf.subarray(off, off + columns)
    rows.push({
      offset: off,
      hex: Array.from(slice, (x) => x.toString(16).padStart(2, '0')).join(' '),
      ascii: Array.from(slice, (x) => (x >= 0x20 && x < 0x7f ? String.fromCharCode(x) : '.')).join('')
    })
  }
  return rows
}

/** Reads the first bytes (and the zip central directory region for OOXML/EPUB detection). */
export async function probeFile(filePath) {
  const fh = await fs.open(filePath, 'r')
  try {
    const st = await fh.stat()
    const head = Buffer.alloc(Math.min(HEAD_BYTES, st.size))
    if (head.length) await fh.read(head, 0, head.length, 0)
    let tail = null
    if (head.length >= 4 && head.readUInt32LE(0) === 0x04034b50) {
      const len = Math.min(st.size, 65536)
      tail = Buffer.alloc(len)
      await fh.read(tail, 0, len, st.size - len)
    }
    const detected = detectType(head, path.extname(filePath), tail)
    const extType = path.extname(filePath).slice(1).toLowerCase()
    return { ...detected, ext: extType, size: st.size, head, extMismatch: Boolean(extType) && !extMatches(detected.type, extType) }
  } finally {
    await fh.close()
  }
}

const EXT_ALIASES = {
  jpeg: ['jpg', 'jpeg', 'jpe', 'jfif'], tiff: ['tif', 'tiff'], heic: ['heic', 'heif', 'hif'], mp3: ['mp3'], ogg: ['ogg', 'oga', 'opus'],
  m4a: ['m4a', 'm4b', 'm4p', 'aac'], mp4: ['mp4', 'm4v', '3gp', '3g2'], mov: ['mov', 'qt'], mkv: ['mkv', 'mka', 'mks'],
  pe: ['exe', 'dll', 'sys', 'ocx', 'cpl', 'scr', 'drv', 'efi', 'mui', 'node'], docx: ['docx', 'docm', 'dotx'], xlsx: ['xlsx', 'xlsm', 'xltx'],
  pptx: ['pptx', 'pptm', 'potx'], ole: ['doc', 'xls', 'ppt', 'msi', 'msg'], zip: ['zip', 'jar', 'apk', 'nupkg', 'vsix', 'odt', 'ods'],
  font: ['ttf', 'otf', 'ttc'], gzip: ['gz', 'tgz'], text: ['txt', 'log', 'md', 'json', 'xml', 'csv', 'ini', 'cfg', 'js', 'ts', 'html', 'css']
}
function extMatches(type, ext) {
  if (type === 'unknown' || type === 'raw') return true
  return (EXT_ALIASES[type] || [type]).includes(ext)
}

// ---------------------------------------------------------------- filesystem: times, attributes, streams

const ATTR = { readOnly: 0x1, hidden: 0x2, system: 0x4, archive: 0x20 }

function runPs(script, env) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true, timeout: 20000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, ...env }
    }, (err, stdout, stderr) => {
      if (err) reject(new Error(String(stderr || err.message).trim().split(/\r?\n/)[0] || 'PowerShell failed'))
      else resolve(String(stdout || '').trim())
    })
  })
}

// Paths go through environment variables, never through the script text.
const PS_INFO = `$ErrorActionPreference='Stop'
$p=$env:DH_META_PATH
$i=Get-Item -LiteralPath $p -Force
$s=@()
try { $s=@(Get-Item -LiteralPath $p -Stream * -ErrorAction Stop | Where-Object { $_.Stream -ne ':$DATA' } | ForEach-Object { [pscustomobject]@{ name=$_.Stream; size=[int64]$_.Length } }) } catch {}
[pscustomobject]@{ attributes=[int]$i.Attributes; streams=$s } | ConvertTo-Json -Compress -Depth 4`

export function parseZoneIdentifier(text) {
  const out = {}
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (m) out[m[1]] = m[2]
  }
  const zoneId = out.ZoneId != null ? Number(out.ZoneId) : null
  return { zoneId, referrerUrl: out.ReferrerUrl || '', hostUrl: out.HostUrl || '', raw: String(text || '') }
}

export async function readFsInfo(filePath) {
  const st = await fs.stat(filePath)
  const info = {
    size: st.size,
    created: st.birthtimeMs, modified: st.mtimeMs, accessed: st.atimeMs,
    readOnly: false, hidden: false, system: false, archive: false, attributes: null,
    streams: [], zone: null, streamsSupported: process.platform === 'win32'
  }
  if (process.platform !== 'win32') return info
  try {
    const parsed = JSON.parse(await runPs(PS_INFO, { DH_META_PATH: filePath }) || '{}')
    const attrs = Number(parsed.attributes) || 0
    info.attributes = attrs
    for (const [k, bit] of Object.entries(ATTR)) info[k] = Boolean(attrs & bit)
    const streams = Array.isArray(parsed.streams) ? parsed.streams : parsed.streams ? [parsed.streams] : []
    info.streams = streams.map((s) => ({ name: String(s.name), size: Number(s.size) || 0 }))
  } catch {
    info.streamsSupported = false
  }
  try {
    info.zone = parseZoneIdentifier(await fs.readFile(`${filePath}:Zone.Identifier`, 'utf8'))
  } catch { /* no mark */ }
  return info
}

export function validStreamName(name) {
  return typeof name === 'string' && /^[^:\\/\0]{1,255}$/.test(name) && name !== '$DATA'
}

export async function removeStream(filePath, name) {
  if (!validStreamName(name)) throw new Error('invalid stream name')
  await fs.unlink(`${filePath}:${name}`)
}

const PS_SET = `$ErrorActionPreference='Stop'
$p=$env:DH_META_PATH
$i=Get-Item -LiteralPath $p -Force
$orig=[int]$i.Attributes
if ($orig -band 1) { $i.Attributes = [IO.FileAttributes]($orig -band (-bnot 1)) }
try {
  if ($env:DH_CT) { [IO.File]::SetCreationTimeUtc($p, [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$env:DH_CT).UtcDateTime) }
  if ($env:DH_MT) { [IO.File]::SetLastWriteTimeUtc($p, [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$env:DH_MT).UtcDateTime) }
  if ($env:DH_AT) { [IO.File]::SetLastAccessTimeUtc($p, [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$env:DH_AT).UtcDateTime) }
} finally {
  $a=$orig
  if ($env:DH_ATTR_SET) { $a = ($a -bor [int]$env:DH_ATTR_SET) }
  if ($env:DH_ATTR_CLR) { $a = ($a -band (-bnot [int]$env:DH_ATTR_CLR)) }
  (Get-Item -LiteralPath $p -Force).Attributes = [IO.FileAttributes]$a
}
'ok'`

function toMs(v) {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Date.parse(String(v))
  if (!Number.isFinite(n) || n < 0 || n > 32503680000000) throw new Error(`invalid date: ${v}`)
  return Math.round(n)
}

/** props: { created?, modified?, accessed? (ms or ISO), readOnly?, hidden?, system?, archive? (booleans) } */
export async function setFsProps(filePath, props = {}) {
  const env = { DH_META_PATH: filePath }
  const ct = toMs(props.created), mt = toMs(props.modified), at = toMs(props.accessed)
  if (ct != null) env.DH_CT = String(ct)
  if (mt != null) env.DH_MT = String(mt)
  if (at != null) env.DH_AT = String(at)
  let set = 0, clr = 0
  for (const [k, bit] of Object.entries(ATTR)) {
    if (props[k] === true) set |= bit
    else if (props[k] === false) clr |= bit
  }
  if (set) env.DH_ATTR_SET = String(set)
  if (clr) env.DH_ATTR_CLR = String(clr)
  if (process.platform !== 'win32') {
    if (mt != null || at != null) {
      const st = await fs.stat(filePath)
      await fs.utimes(filePath, new Date(at ?? st.atimeMs), new Date(mt ?? st.mtimeMs))
    }
    return readFsInfo(filePath)
  }
  await runPs(PS_SET, env)
  const info = await readFsInfo(filePath)
  // Reading the info (streams, Zone.Identifier) touches the last-access time again, so put it back.
  if (at != null && !info.readOnly) {
    await fs.utimes(filePath, new Date(at), new Date(mt ?? info.modified)).catch(() => {})
    info.accessed = at
  }
  return info
}
