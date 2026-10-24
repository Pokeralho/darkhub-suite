// Universal metadata editor backend: detects the real file type, reads everything ExifTool knows, and writes through
// the right engine for the format. Every write goes to a temp file next to the target, is READ BACK and compared with
// what was asked for, and only then replaces the original (keeping a .bak) or lands as a copy.
//
//   images (JPEG/PNG/WebP/TIFF/RAW/HEIC/AVIF/GIF) .... ExifTool (EXIF/IPTC/XMP, raw tags, GPS removal, strip)
//   audio (MP3/FLAC/OGG/M4A/WAV), video (MP4/MOV/MKV/WebM/AVI) .... ffmpeg -c copy (no re-encode); ExifTool for MP4/MOV/M4A if ffmpeg is missing
//   PDF .... ExifTool (Info dictionary + XMP)
//   Office OOXML (docx/xlsx/pptx) .... docProps/core.xml + app.xml rewritten inside the zip (ooxmlZip.js)
//   Windows PE and everything else .... read-only (version resource and whatever ExifTool can read)
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { probeFile, hexDump, readFsInfo, setFsProps, removeStream, detectType } from './fileProbe.js'
import { readTags, readBinaryTag, writeTagsTo, assignArg } from './exiftoolRunner.js'
import { readOoxmlProps, writeOoxmlProps, readZipEntries, entryData, crc32 } from './ooxmlZip.js'

// ---------------------------------------------------------------- field catalogs

/** key, kind (text|multiline|list|date|year|number), tags read (first wins), tags written. */
const F = (key, kind, read, write = read) => ({ key, kind, read, write })
/** ffmpeg fields: key, kind, ffmpeg metadata key, ExifTool tag names (any group) used to read back. */
const FF = (key, kind, ff, names) => ({ key, kind, ff, names })

const IMAGE_FIELDS = [
  F('title', 'text', ['XMP-dc:Title', 'IPTC:ObjectName'], ['XMP-dc:Title']),
  F('description', 'multiline', ['IFD0:ImageDescription', 'XMP-dc:Description', 'IPTC:Caption-Abstract'], ['IFD0:ImageDescription', 'XMP-dc:Description']),
  F('artist', 'text', ['IFD0:Artist', 'XMP-dc:Creator', 'IPTC:By-line'], ['IFD0:Artist', 'XMP-dc:Creator']),
  F('copyright', 'text', ['IFD0:Copyright', 'XMP-dc:Rights', 'IPTC:CopyrightNotice'], ['IFD0:Copyright', 'XMP-dc:Rights']),
  F('keywords', 'list', ['XMP-dc:Subject', 'IPTC:Keywords'], ['XMP-dc:Subject']),
  F('creationDate', 'date', ['ExifIFD:DateTimeOriginal', 'ExifIFD:CreateDate', 'XMP-xmp:CreateDate', 'XMP-exif:DateTimeOriginal'], ['ExifIFD:DateTimeOriginal', 'ExifIFD:CreateDate', 'XMP-xmp:CreateDate']),
  F('software', 'text', ['IFD0:Software', 'XMP-xmp:CreatorTool'], ['IFD0:Software', 'XMP-xmp:CreatorTool'])
]
const PDF_FIELDS = [
  F('title', 'text', ['PDF:Title', 'XMP-dc:Title']),
  F('author', 'text', ['PDF:Author', 'XMP-dc:Creator']),
  F('subject', 'multiline', ['PDF:Subject', 'XMP-dc:Description']),
  F('keywords', 'text', ['PDF:Keywords', 'XMP-pdf:Keywords']),
  F('creator', 'text', ['PDF:Creator', 'XMP-xmp:CreatorTool']),
  F('producer', 'text', ['PDF:Producer', 'XMP-pdf:Producer']),
  F('creationDate', 'date', ['PDF:CreateDate', 'XMP-xmp:CreateDate']),
  F('modifyDate', 'date', ['PDF:ModifyDate', 'XMP-xmp:ModifyDate'])
]
// ExifTool fallback for MP4/MOV/M4A when ffmpeg is unavailable.
const QT_FIELDS = [
  F('title', 'text', ['ItemList:Title', 'UserData:Title'], ['ItemList:Title']),
  F('artist', 'text', ['ItemList:Artist', 'UserData:Artist'], ['ItemList:Artist']),
  F('album', 'text', ['ItemList:Album'], ['ItemList:Album']),
  F('genre', 'text', ['ItemList:Genre'], ['ItemList:Genre']),
  F('comment', 'multiline', ['ItemList:Comment', 'UserData:Comment'], ['ItemList:Comment']),
  F('creationDate', 'date', ['QuickTime:CreateDate'], ['QuickTime:CreateDate'])
]
const AUDIO_FF = [
  FF('title', 'text', 'title', ['Title']),
  FF('artist', 'text', 'artist', ['Artist']),
  FF('album', 'text', 'album', ['Album']),
  FF('albumArtist', 'text', 'album_artist', ['Band', 'AlbumArtist', 'Albumartist', 'Album_artist']),
  FF('year', 'year', 'date', ['Year', 'Date', 'RecordingTime', 'ContentCreateDate', 'DateTimeOriginal']),
  FF('track', 'number', 'track', ['Track', 'TrackNumber']),
  FF('genre', 'text', 'genre', ['Genre']),
  FF('composer', 'text', 'composer', ['Composer']),
  FF('comment', 'multiline', 'comment', ['Comment', 'Description']) // Vorbis comments store it as DESCRIPTION
]
const VIDEO_FF = [
  FF('title', 'text', 'title', ['Title']),
  FF('artist', 'text', 'artist', ['Artist']),
  FF('description', 'multiline', 'description', ['Description']),
  FF('comment', 'multiline', 'comment', ['Comment']),
  FF('creationDate', 'date', 'creation_time', ['CreateDate', 'DateTimeOriginal', 'CreationTime', 'DateUTC'])
]
const OFFICE_FIELDS = [
  ['title', 'text'], ['subject', 'text'], ['author', 'text'], ['keywords', 'text'], ['description', 'multiline'],
  ['lastModifiedBy', 'text'], ['category', 'text'], ['company', 'text'], ['manager', 'text'], ['creationDate', 'date'], ['modifiedDate', 'date']
].map(([key, kind]) => ({ key, kind }))
const PE_TAGS = ['FileDescription', 'CompanyName', 'ProductName', 'FileVersion', 'ProductVersion', 'OriginalFileName', 'InternalName', 'LegalCopyright', 'LegalTrademarks', 'Comments', 'MachineType', 'TimeStamp', 'Subsystem', 'PEType', 'LinkerVersion', 'OSVersion']

const EXIF_IMAGE = new Set(['jpeg', 'png', 'webp', 'tiff', 'raw', 'heic', 'avif', 'gif'])
const FF_AUDIO = new Set(['mp3', 'flac', 'ogg', 'm4a', 'wav'])
const FF_VIDEO = new Set(['mp4', 'mov', 'mkv', 'webm', 'avi'])
const QT_TYPES = new Set(['mp4', 'mov', 'm4a'])
const COVER_TYPES = new Set(['mp3', 'flac', 'm4a'])

const IMAGE_RAW_RE = /^(IFD0|IFD1|ExifIFD|GPS|InteropIFD|IPTC|XMP-[\w-]+|Photoshop|PNG)$/
const GIF_RAW_RE = /^(XMP-[\w-]+|GIF)$/
const PDF_RAW_RE = /^(PDF|XMP-[\w-]+)$/
const QT_RAW_RE = /^(ItemList|UserData|Keys)$/
const HIDDEN_GROUPS = new Set(['ExifTool', 'System'])

/** What can be done with a type, given which engines exist. */
export function planFor(type, family, { ffmpeg = false, exiftool = true } = {}) {
  const none = { backend: null, family, fields: [], raw: null, strip: false, gps: false, cover: false }
  if (EXIF_IMAGE.has(type) && exiftool) {
    const fields = type === 'gif'
      ? IMAGE_FIELDS.map((f) => ({ ...f, write: f.write.filter((t) => t.startsWith('XMP')) })).filter((f) => f.write.length)
      : IMAGE_FIELDS
    return { backend: 'exiftool', family, fields, raw: type === 'gif' ? GIF_RAW_RE : IMAGE_RAW_RE, strip: true, gps: type !== 'gif', cover: false }
  }
  if (type === 'pdf' && exiftool) return { backend: 'exiftool', family, fields: PDF_FIELDS, raw: PDF_RAW_RE, strip: true, gps: false, cover: false, stripIncremental: true }
  if ((FF_AUDIO.has(type) || FF_VIDEO.has(type)) && ffmpeg) {
    const audio = FF_AUDIO.has(type)
    return { backend: 'ffmpeg', family, fields: audio ? AUDIO_FF : VIDEO_FF, raw: null, strip: true, gps: !audio, cover: COVER_TYPES.has(type) }
  }
  if (QT_TYPES.has(type) && exiftool) return { backend: 'exiftool', family, fields: QT_FIELDS, raw: QT_RAW_RE, strip: true, gps: type !== 'm4a', cover: false }
  if (family === 'office') return { backend: 'ooxml', family, fields: OFFICE_FIELDS, raw: null, strip: true, gps: false, cover: false }
  return none
}

// ---------------------------------------------------------------- value helpers

const digits = (s) => String(s ?? '').replace(/\D/g, '')
const asText = (v) => (v == null ? '' : Array.isArray(v) ? v.map(asText).join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v))
const nl = (s) => String(s).replace(/\r\n?/g, '\n').trim()
const splitList = (s) => String(s).split(/[,;]/).map((x) => x.trim()).filter(Boolean)
const isBinaryValue = (v) => typeof v === 'string' && /^\(Binary data \d+ bytes/.test(v)
// ExifTool prints unset QuickTime dates as "0000:00:00 00:00:00": that is "no value".
const isEmptyValue = (v) => v == null || v === '' || /^[0:\s.+-]+$/.test(asText(v))
const tagName = (key) => key.slice(key.indexOf(':') + 1)
const tagGroup = (key) => (key.includes(':') ? key.slice(0, key.indexOf(':')) : '')

function sameValue(kind, expected, actual) {
  if (actual == null || actual === '') return false
  if (kind === 'list') {
    const a = (Array.isArray(actual) ? actual.map(String) : splitList(actual)).map((x) => x.trim())
    const e = splitList(expected)
    return a.length === e.length && e.every((x, i) => x === a[i])
  }
  const a = asText(actual)
  if (kind === 'date' || kind === 'year') {
    const de = digits(expected).slice(0, 14), da = digits(a)
    return de.length >= 4 && da.startsWith(de)
  }
  if (kind === 'number') return parseInt(String(expected), 10) === parseInt(a, 10)
  return nl(a) === nl(expected)
}

/** "2024-05-01 10:00" / "2024:05:01 10:00:00" / ISO -> "2024:05:01 10:00:00" (ExifTool's EXIF format). */
export function exifDate(value) {
  const m = /^\s*(\d{4})[-:/.](\d{1,2})[-:/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(String(value))
  if (!m) throw new Error(`invalid date: ${value}`)
  const p = (x) => String(x ?? 0).padStart(2, '0')
  return `${m[1]}:${p(m[2])}:${p(m[3])} ${p(m[4])}:${p(m[5])}:${p(m[6])}`
}

function isoDate(value) {
  const s = String(value).trim()
  let t = Date.parse(s)
  if (!Number.isFinite(t)) {
    const m = /^(\d{4}):(\d{2}):(\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s)
    if (m) t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4] || '00'}:${m[5] || '00'}:${m[6] || '00'}`)
  }
  if (!Number.isFinite(t)) throw new Error(`invalid date: ${value}`)
  return new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function pickByName(tags, names) {
  for (const name of names) {
    for (const [k, v] of Object.entries(tags)) {
      const g = tagGroup(k)
      if (g === 'File' || g === 'System' || g === 'Composite' || g === 'ExifTool') continue
      if (tagName(k) === name && !isEmptyValue(v)) return v
    }
  }
  return undefined
}
const pickFirst = (tags, keys) => {
  for (const k of keys) if (!isEmptyValue(tags[k])) return tags[k]
  return undefined
}

const GPS_KEY_RE = /^GPS|^Location(Information)?$|ISO6709|GPSCoordinates/i
function gpsKeys(tags) {
  return Object.keys(tags).filter((k) => {
    const g = tagGroup(k)
    if (g === 'File' || g === 'System' || g === 'Composite' || g === 'ExifTool') return false
    return g === 'GPS' || GPS_KEY_RE.test(tagName(k))
  })
}
const coverKey = (tags) => Object.keys(tags).find((k) => ['Picture', 'CoverArt'].includes(tagName(k)))

function samePath(a, b) {
  const n = (p) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p))
  return n(a) === n(b)
}

function runFfmpeg(exe, args) {
  return new Promise((resolve, reject) => {
    execFile(exe, args, { windowsHide: true, timeout: 30 * 60 * 1000, maxBuffer: 16 * 1024 * 1024 }, (err, _out, stderr) => {
      if (err) reject(new Error(String(stderr || err.message).trim().split(/\r?\n/).slice(-3).join(' ') || 'ffmpeg failed'))
      else resolve()
    })
  })
}

// ---------------------------------------------------------------- service

export function createMetadataService({ getExiftoolPath, getFfmpegPath, logger } = {}) {
  const exiftool = async () => { try { return (await getExiftoolPath?.()) || null } catch { return null } }
  const ffmpeg = async () => { try { return (await getFfmpegPath?.()) || null } catch { return null } }

  async function readAllTags(exe, file) {
    if (!exe) return { tags: {}, error: 'ExifTool not available' }
    try { return { tags: await readTags(exe, file), error: null } } catch (err) { return { tags: {}, error: err.message } }
  }

  function canonicalValues(plan, tags, office) {
    const out = {}
    for (const f of plan.fields) {
      let v
      if (plan.backend === 'ooxml') v = office?.fields?.[f.key]
      else if (f.ff) v = pickByName(tags, f.names)
      else v = pickFirst(tags, f.read)
      if (v !== undefined) out[f.key] = f.kind === 'list' ? (Array.isArray(v) ? v.map(String).join(', ') : asText(v)) : asText(v)
    }
    return out
  }

  function buildGroups(tags, plan) {
    const groups = new Map()
    for (const [key, value] of Object.entries(tags)) {
      const group = tagGroup(key) || 'Other'
      if (HIDDEN_GROUPS.has(group)) continue
      const binary = isBinaryValue(value)
      const text = asText(value)
      const writable = Boolean(plan.raw && plan.raw.test(group) && !binary && text.length <= 4000)
      if (!groups.has(group)) groups.set(group, [])
      groups.get(group).push({ key, name: tagName(key), value: text.length > 4000 ? `${text.slice(0, 4000)}…` : text, writable, binary })
    }
    return [...groups.entries()].map(([name, list]) => ({ name, writable: list.some((t) => t.writable), tags: list }))
  }

  async function read(filePath) {
    const probe = await probeFile(filePath)
    const [exe, ff] = await Promise.all([exiftool(), ffmpeg()])
    const plan = planFor(probe.type, probe.family, { ffmpeg: Boolean(ff), exiftool: Boolean(exe) })
    const { tags, error: exifError } = await readAllTags(exe, filePath)
    let office = null
    if (probe.family === 'office') {
      try { office = readOoxmlProps(await fs.readFile(filePath)) } catch (err) { office = { error: err.message, fields: {} } }
    }
    const values = canonicalValues(plan, tags, office)
    const fields = plan.fields.map((f) => ({ key: f.key, kind: f.kind, value: values[f.key] ?? '', writable: Boolean(plan.backend) }))
    if (probe.family === 'office' && office?.fields) {
      for (const [k, v] of Object.entries(office.fields)) {
        if (k.includes('.')) fields.push({ key: k, kind: 'text', value: v, writable: false })
      }
    }
    if (probe.family === 'pe') {
      for (const name of PE_TAGS) {
        const v = pickByName(tags, [name])
        if (v !== undefined) fields.push({ key: `pe.${name}`, kind: 'text', value: asText(v), writable: false })
      }
    }
    let cover = null
    const ck = coverKey(tags)
    if (ck && exe) {
      const buf = await readBinaryTag(exe, filePath, ck).catch(() => null)
      if (buf && buf.length <= 4 * 1024 * 1024) {
        const t = detectType(buf.subarray(0, 64))
        cover = { key: ck, size: buf.length, dataUrl: `data:${t.mime.startsWith('image/') ? t.mime : 'image/jpeg'};base64,${buf.toString('base64')}` }
      } else if (buf) cover = { key: ck, size: buf.length, dataUrl: null }
    }
    const fsInfo = await readFsInfo(filePath)
    const gps = gpsKeys(tags)
    return {
      ok: true,
      path: filePath,
      detect: { type: probe.type, label: probe.label, family: probe.family, mime: probe.mime, ext: probe.ext, extMismatch: probe.extMismatch, size: probe.size },
      hex: hexDump(probe.head),
      backend: plan.backend,
      engines: { exiftool: Boolean(exe), ffmpeg: Boolean(ff) },
      capabilities: { fields: Boolean(plan.backend), raw: Boolean(plan.raw), strip: plan.strip, gps: plan.gps, cover: plan.cover, stripIncremental: Boolean(plan.stripIncremental) },
      fields,
      groups: buildGroups(tags, plan),
      gpsTags: gps,
      cover,
      office: office?.error ? { error: office.error } : undefined,
      fs: fsInfo,
      warnings: exifError ? [exifError] : []
    }
  }

  // ---- writers: each one writes src -> tmp and returns the list of checks to run on tmp

  async function writeWithExiftool(exe, plan, type, src, tmp, req) {
    const args = [], files = [], checks = []
    if (req.strip) {
      args.push(type === 'pdf' ? '-all:all=' : '-all=')
      if (plan.family === 'image') args.push('-tagsfromfile', '@', '-EXIF:Orientation', '-ICC_Profile')
      // In TIFF-based files IFD0 is the image itself and survives "-all=", so its descriptive tags go one by one.
      if (type === 'tiff' || type === 'raw') {
        const ifd0 = ['Artist', 'ImageDescription', 'Copyright', 'Software', 'DateTime', 'HostComputer', 'DocumentName', 'PageName', 'XPTitle', 'XPComment', 'XPAuthor', 'XPKeywords', 'XPSubject']
        if (type === 'tiff') ifd0.push('Make', 'Model')
        for (const t of ifd0) args.push(`-IFD0:${t}=`)
      }
      for (const f of plan.fields) if (!(f.key in req.fields)) checks.push({ field: f.key, kind: f.kind, keys: f.read, expect: '' })
    }
    if (req.removeGps && !req.strip) {
      args.push('-GPS:all=', '-XMP-exif:GPS*=')
      if (QT_TYPES.has(type)) args.push('-Keys:GPSCoordinates=', '-UserData:GPSCoordinates=', '-ItemList:GPSCoordinates=')
    }
    if (req.removeGps || req.strip) checks.push({ field: 'gps', gps: true })
    for (const f of plan.fields) {
      if (!(f.key in req.fields)) continue
      let v = String(req.fields[f.key] ?? '').trim()
      if (!v) {
        for (const t of f.read) args.push(`-${t}=`)
        checks.push({ field: f.key, kind: f.kind, keys: f.read, expect: '' })
        continue
      }
      if (f.kind === 'date') v = exifDate(v)
      for (const t of f.write) {
        if (f.kind === 'list') {
          args.push(`-${t}=`)
          for (const item of splitList(v)) args.push(await assignArg(t, item, files))
        } else args.push(await assignArg(t, v, files))
      }
      checks.push({ field: f.key, kind: f.kind, keys: f.write, expect: v })
    }
    for (const [key, value] of Object.entries(req.rawTags || {})) {
      if (!/^[\w-]+:[\w-]+$/.test(key) || !plan.raw?.test(tagGroup(key))) throw new Error(`tag is not writable here: ${key}`)
      const v = String(value ?? '')
      args.push(v.trim() ? await assignArg(key, v, files) : `-${key}=`)
      checks.push({ field: key, kind: 'raw', keys: [key], expect: v.trim() })
    }
    const res = await writeTagsTo(exe, src, tmp, args, files)
    return { checks, warnings: res.warnings }
  }

  async function writeWithFfmpeg(ffExe, plan, type, src, tmp, req, srcTags) {
    const args = ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-i', src]
    const checks = []
    const coverPath = req.cover?.path || null
    const audio = plan.family === 'audio'
    if (coverPath) {
      if (!plan.cover) throw new Error('cover art is not supported for this format')
      const head = await fs.readFile(coverPath).then((b) => b.subarray(0, 64))
      const ct = detectType(head).type
      if (ct !== 'jpeg' && ct !== 'png') throw new Error('cover art must be a JPEG or PNG image')
      args.push('-i', coverPath)
    }
    if (audio) {
      const keepStreams = !coverPath && !req.cover?.remove && !req.strip && COVER_TYPES.has(type)
      args.push('-map', keepStreams ? '0' : '0:a')
      if (coverPath) args.push('-map', '1:0')
    } else args.push('-map', '0')
    args.push('-c', 'copy')
    if (req.strip) {
      args.push('-map_metadata', '-1', '-map_chapters', '-1', '-fflags', '+bitexact')
      for (const f of plan.fields) if (!(f.key in req.fields)) checks.push({ field: f.key, kind: f.kind, names: f.names, expect: '' })
    } else args.push('-map_metadata', '0')
    if (req.removeGps && plan.gps) {
      for (const k of ['location', 'location-eng', 'com.apple.quicktime.location.ISO6709']) args.push('-metadata', `${k}=`)
    }
    if ((req.removeGps && plan.gps) || req.strip) checks.push({ field: 'gps', gps: true })
    for (const f of plan.fields) {
      if (!(f.key in req.fields)) continue
      let v = String(req.fields[f.key] ?? '').replace(/\r\n?/g, '\n').trim()
      if (v && f.kind === 'date') v = isoDate(v)
      if (v && f.kind === 'number' && !/^\d+(\/\d+)?$/.test(v)) throw new Error(`invalid track number: ${v}`)
      args.push('-metadata', `${f.ff}=${v}`)
      // Ogg keeps its tags on the audio stream, not globally.
      if (type === 'ogg') args.push('-metadata:s:a:0', `${f.ff}=${v}`)
      checks.push({ field: f.key, kind: f.kind, names: f.names, expect: v })
    }
    if (type === 'mp3') {
      args.push('-id3v2_version', '3')
      const hadV1 = Object.keys(srcTags).some((k) => tagGroup(k) === 'ID3v1')
      args.push('-write_id3v1', hadV1 && !req.strip ? '1' : '0')
    }
    if (coverPath) {
      args.push('-disposition:v:0', 'attached_pic')
      if (type === 'mp3') args.push('-metadata:s:v:0', 'title=Album cover', '-metadata:s:v:0', 'comment=Cover (front)')
      checks.push({ field: 'cover', cover: true })
    } else if (req.cover?.remove || (req.strip && audio)) checks.push({ field: 'cover', cover: false })
    args.push(tmp)
    await runFfmpeg(ffExe, args)
    return { checks, warnings: [] }
  }

  async function writeOoxml(plan, src, tmp, req) {
    const fields = {}, checks = []
    for (const f of plan.fields) {
      if (!(f.key in req.fields)) continue
      let v = String(req.fields[f.key] ?? '').trim()
      if (v && f.kind === 'date') v = isoDate(v)
      fields[f.key] = v
      checks.push({ field: f.key, kind: f.kind, office: true, expect: v })
    }
    if (req.strip) for (const f of plan.fields) if (!(f.key in fields)) checks.push({ field: f.key, kind: f.kind, office: true, expect: '' })
    await fs.writeFile(tmp, writeOoxmlProps(await fs.readFile(src), fields, { strip: Boolean(req.strip) }))
    return { checks, warnings: [] }
  }

  async function verify(exe, checks, tmp, family) {
    const { tags } = await readAllTags(exe, tmp)
    let office = null
    if (family === 'office') {
      const buf = await fs.readFile(tmp)
      for (const e of readZipEntries(buf)) {
        if (!e.name.endsWith('/') && crc32(entryData(e)) !== e.crc) throw new Error(`zip verification failed: bad CRC in ${e.name}`)
      }
      office = readOoxmlProps(buf)
    }
    const results = []
    for (const c of checks) {
      if (c.gps) {
        const left = gpsKeys(tags)
        results.push({ field: 'gps', ok: left.length === 0, expected: '', actual: left.join(', ') })
        continue
      }
      if (c.cover !== undefined) {
        const has = Boolean(coverKey(tags))
        results.push({ field: 'cover', ok: has === c.cover, expected: c.cover ? 'present' : 'absent', actual: has ? 'present' : 'absent' })
        continue
      }
      const values = c.office ? [office?.fields?.[c.field]] : c.names ? [pickByName(tags, c.names)] : c.keys.map((k) => tags[k])
      const present = values.filter((v) => !isEmptyValue(v))
      if (!c.expect) {
        results.push({ field: c.field, ok: present.length === 0, expected: '', actual: present.map(asText).join(' | ') })
        continue
      }
      if (c.kind === 'raw') {
        // ExifTool prints converted values ("1/250", "Rotate 90 CW"); a present tag with a different spelling is a note, not a failure.
        const v = values[0]
        const ok = v !== undefined && v !== ''
        results.push({ field: c.field, ok, normalized: ok && nl(asText(v)) !== nl(c.expect), expected: c.expect, actual: asText(v) })
        continue
      }
      const ok = values.length > 0 && values.every((v) => sameValue(c.kind, c.expect, v))
      results.push({ field: c.field, ok, expected: c.expect, actual: values.map(asText).join(' | ') })
    }
    return results
  }

  async function uniqueBackupPath(file) {
    let candidate = `${file}.bak`
    try { await fs.access(candidate) } catch { return candidate }
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-')
    candidate = `${file}.${stamp}.bak`
    try { await fs.access(candidate); return `${file}.${stamp}-${crypto.randomBytes(2).toString('hex')}.bak` } catch { return candidate }
  }

  /**
   * req: { path, fields?: {key: value}, rawTags?: {"Group:Tag": value}, strip?, removeGps?, cover?: {path}|{remove:true},
   *        outputPath?: string (save as copy), backup?: boolean (default true), preserveDates?: boolean }
   * An empty value removes that field.
   */
  async function write(req = {}) {
    const src = req.path
    const probe = await probeFile(src)
    const [exe, ff] = await Promise.all([exiftool(), ffmpeg()])
    const plan = planFor(probe.type, probe.family, { ffmpeg: Boolean(ff), exiftool: Boolean(exe) })
    if (!plan.backend) throw new Error(`no metadata writer for ${probe.label} (read-only)`)
    const fields = {}
    const skipped = []
    for (const [k, v] of Object.entries(req.fields || {})) {
      if (plan.fields.some((f) => f.key === k)) fields[k] = String(v ?? '').slice(0, 20000)
      else skipped.push(k)
    }
    const r = {
      fields, rawTags: plan.raw ? req.rawTags || {} : {}, strip: Boolean(req.strip && plan.strip),
      removeGps: Boolean(req.removeGps && (plan.gps || req.strip)), cover: plan.cover ? req.cover || null : null
    }
    if (req.rawTags && !plan.raw && Object.keys(req.rawTags).length) skipped.push(...Object.keys(req.rawTags))
    if (req.cover && !plan.cover) skipped.push('cover')
    if (!Object.keys(r.fields).length && !Object.keys(r.rawTags).length && !r.strip && !r.removeGps && !r.cover) {
      return { ok: true, unchanged: true, path: src, skipped, verification: [] }
    }

    const target = req.outputPath || src
    const inPlace = samePath(target, src)
    const tmp = path.join(path.dirname(target), `.dhmeta-${crypto.randomBytes(5).toString('hex')}${path.extname(src)}`)
    const original = await fs.stat(src)
    let srcTags = {}
    if (plan.backend === 'ffmpeg') srcTags = (await readAllTags(exe, src)).tags
    try {
      let out
      if (plan.backend === 'exiftool') out = await writeWithExiftool(exe, plan, probe.type, src, tmp, r)
      else if (plan.backend === 'ffmpeg') out = await writeWithFfmpeg(ff, plan, probe.type, src, tmp, r, srcTags)
      else out = await writeOoxml(plan, src, tmp, r)
      const verification = exe || plan.backend === 'ooxml' ? await verify(exe, out.checks, tmp, plan.family) : []
      if (!exe && plan.backend !== 'ooxml') throw new Error('ExifTool is required to verify the written file')
      // The new file must still be the same kind of file.
      const after = await probeFile(tmp)
      if (after.type !== probe.type && !(probe.type === 'mp4' && after.type === 'm4a') && !(probe.type === 'm4a' && after.type === 'mp4')) {
        throw new Error(`verification failed: output is ${after.label}, expected ${probe.label}`)
      }
      const failed = verification.filter((v) => !v.ok)
      if (failed.length) {
        const err = new Error(`verification failed: ${failed.map((f) => `${f.field} (expected "${f.expected}", got "${f.actual}")`).join('; ')}`)
        err.verification = verification
        throw err
      }

      let finalPath = target, backupPath = null
      let zone = null
      if (inPlace) {
        try { zone = await fs.readFile(`${src}:Zone.Identifier`) } catch { /* none */ }
        if (req.backup !== false) {
          backupPath = await uniqueBackupPath(src)
          await fs.rename(src, backupPath)
          try { await fs.rename(tmp, src) } catch (err) { await fs.rename(backupPath, src).catch(() => {}); throw err }
        } else {
          await fs.rename(tmp, src)
        }
        // Keep the "downloaded from the internet" mark: replacing the file must not silently drop it.
        if (zone && process.platform === 'win32') await fs.writeFile(`${src}:Zone.Identifier`, zone).catch(() => {})
      } else {
        await fs.rename(tmp, target)
      }
      if (req.preserveDates) {
        await setFsProps(finalPath, { created: original.birthtimeMs, modified: original.mtimeMs }).catch((err) => logger?.warn?.('Metadata', `preserve dates: ${err.message}`))
      }
      return { ok: true, path: finalPath, backupPath, verification, skipped, warnings: out.warnings }
    } catch (err) {
      await fs.unlink(tmp).catch(() => {})
      if (err.verification) return { ok: false, error: err.message, verification: err.verification, skipped }
      throw err
    }
  }

  return {
    read,
    write,
    setFileProps: async (filePath, props) => ({ ok: true, fs: await setFsProps(filePath, props) }),
    removeStream: async (filePath, name) => { await removeStream(filePath, name); return { ok: true, fs: await readFsInfo(filePath) } },
    engines: async () => ({ exiftool: await exiftool(), ffmpeg: await ffmpeg() })
  }
}
