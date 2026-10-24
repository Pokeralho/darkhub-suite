// @vitest-environment node
// Universal metadata editor: every writer is checked with a write -> read back round trip on temporary files.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
// @ts-ignore JS module
import { createMetadataService, exifDate, planFor } from '../electron/services/metadata/MetadataService.js'
// @ts-ignore JS module
import { detectType, parseZoneIdentifier } from '../electron/services/metadata/fileProbe.js'
// @ts-ignore JS module
import { rewriteZip, readZipEntries, entryData, readOoxmlProps } from '../electron/services/metadata/ooxmlZip.js'

// ExifTool/ffmpeg/PowerShell processes are slow when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 60000 })

const require = createRequire(import.meta.url)
const ffmpegPath: string | null = (() => { try { const p = require('ffmpeg-static'); return p && fs.existsSync(p) ? p : null } catch { return null } })()
const exiftoolPath: string | null = (() => {
  try { const p = path.join(path.dirname(require.resolve('exiftool-vendored.exe/package.json')), 'bin', 'exiftool.exe'); return fs.existsSync(p) ? p : null } catch { return null }
})()
const isWin = process.platform === 'win32'
const haveExif = Boolean(exiftoolPath) && isWin
const haveFf = Boolean(ffmpegPath)

let dir = ''
const svc = createMetadataService({ getExiftoolPath: async () => exiftoolPath, getFfmpegPath: async () => ffmpegPath })
const svcNoFf = createMetadataService({ getExiftoolPath: async () => exiftoolPath, getFfmpegPath: async () => null })
const tmp = (name: string) => path.join(dir, name)
const field = (r: any, key: string) => r.fields.find((f: any) => f.key === key)?.value ?? ''
const ff = (args: string[]) => execFileSync(ffmpegPath as string, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true })

beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-metax-')) })
afterAll(() => { try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* locked */ } })

describe('type detection', () => {
  it('detects by magic bytes, not by extension', () => {
    expect(detectType(Buffer.from('ffd8ffe000104a464946', 'hex'), '.png').type).toBe('jpeg')
    expect(detectType(Buffer.from('%PDF-1.7\n'), '.txt').type).toBe('pdf')
    expect(detectType(Buffer.from('fLaC\0\0\0\x22'), '').type).toBe('flac')
    expect(detectType(Buffer.from('MZ\x90\0'), '.dll').family).toBe('pe')
    const ftyp = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypM4A \0\0\0\0M4A isom')])
    expect(detectType(ftyp, '.mp4').type).toBe('m4a')
    expect(detectType(Buffer.from('hello world'), '.bin').type).toBe('text')
  })
  it('parses Zone.Identifier', () => {
    const z = parseZoneIdentifier('[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=https://example.com/a.zip\r\n')
    expect(z.zoneId).toBe(3)
    expect(z.hostUrl).toBe('https://example.com/a.zip')
  })
  it('normalizes dates for EXIF', () => {
    expect(exifDate('2024-05-01T10:11')).toBe('2024:05:01 10:11:00')
    expect(() => exifDate('yesterday')).toThrow()
  })
  it('plans writers by type', () => {
    expect(planFor('mp3', 'audio', { ffmpeg: true }).backend).toBe('ffmpeg')
    expect(planFor('mp3', 'audio', { ffmpeg: false }).backend).toBe(null)
    expect(planFor('mp4', 'video', { ffmpeg: false }).backend).toBe('exiftool')
    expect(planFor('pe', 'pe', { ffmpeg: true }).backend).toBe(null)
    expect(planFor('docx', 'office', {}).backend).toBe('ooxml')
  })
})

describe('OOXML zip rewriting', () => {
  it('builds and rewrites docProps while keeping other entries byte-identical', () => {
    const empty = Buffer.alloc(22)
    empty.writeUInt32LE(0x06054b50, 0)
    const core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Old</dc:title><dc:creator>Someone</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">2020-01-01T00:00:00Z</dcterms:created></cp:coreProperties>'
    const zip = rewriteZip(empty, new Map([['word/document.xml', Buffer.from('<w:document/>')], ['docProps/core.xml', Buffer.from(core)]]))
    const props = readOoxmlProps(zip)
    expect(props.fields.title).toBe('Old')
    expect(props.fields.author).toBe('Someone')
    const entries = readZipEntries(zip)
    expect(entryData(entries.find((e: any) => e.name === 'word/document.xml')).toString()).toBe('<w:document/>')
  })
})

function makeDocx(file: string) {
  const empty = Buffer.alloc(22)
  empty.writeUInt32LE(0x06054b50, 0)
  const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>'
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>'
  const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>'
  const core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Draft</dc:title><dc:creator>Original Author</dc:creator><cp:lastModifiedBy>Original Author</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">2021-02-03T04:05:06Z</dcterms:created></cp:coreProperties>'
  const app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Office Word</Application><Company>ACME</Company></Properties>'
  fs.writeFileSync(file, rewriteZip(empty, new Map([['[Content_Types].xml', Buffer.from(ct)], ['_rels/.rels', Buffer.from(rels)], ['word/document.xml', Buffer.from(doc)], ['docProps/core.xml', Buffer.from(core)], ['docProps/app.xml', Buffer.from(app)]])))
}

function makePdf(file: string) {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
    '<< /Title (Old title) /Author (Old author) /Producer (Hand made) >>'
  ]
  let out = '%PDF-1.4\n'
  const offs: number[] = []
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  fs.writeFileSync(file, out, 'latin1')
}

describe.skipIf(!haveExif)('images (ExifTool)', () => {
  for (const fmt of ['jpeg', 'png', 'webp', 'tiff'] as const) {
    it(`${fmt}: edit fields, raw tag, GPS remove, strip; original untouched on copy`, async () => {
      const sharp = (await import('sharp')).default
      const src = tmp(`photo-${fmt}.${fmt === 'jpeg' ? 'jpg' : fmt}`)
      await sharp({ create: { width: 16, height: 16, channels: 3, background: '#336699' } })[fmt]().toFile(src)
      // seed GPS + artist with ExifTool so there is something to remove
      execFileSync(exiftoolPath as string, ['-overwrite_original', '-GPSLatitude=10.5', '-GPSLatitudeRef=N', '-GPSLongitude=20.25', '-GPSLongitudeRef=E', '-Artist=Seed', src], { windowsHide: true })
      const before = fs.readFileSync(src)
      const r0 = await svc.read(src)
      expect(r0.detect.type).toBe(fmt)
      expect(r0.backend).toBe('exiftool')
      expect(r0.gpsTags.length).toBeGreaterThan(0)
      expect(field(r0, 'artist')).toBe('Seed')

      const copy = tmp(`photo-${fmt}-edited.${fmt === 'jpeg' ? 'jpg' : fmt}`)
      const w = await svc.write({ path: src, outputPath: copy, removeGps: true, fields: { title: 'Título "um" $x @y', artist: 'Zé Ninguém', keywords: 'a, b, c', creationDate: '2024-05-01 10:11:12', description: 'line 1\nline 2' }, rawTags: { 'IFD0:Model': 'DarkCam 1' } })
      expect(w.ok, w.error).toBe(true)
      expect(fs.readFileSync(src).equals(before)).toBe(true)
      const r1 = await svc.read(copy)
      expect(field(r1, 'title')).toBe('Título "um" $x @y')
      expect(field(r1, 'artist')).toBe('Zé Ninguém')
      expect(field(r1, 'keywords')).toBe('a, b, c')
      expect(field(r1, 'creationDate')).toContain('2024:05:01 10:11:12')
      expect(field(r1, 'description').replace(/\r/g, '')).toBe('line 1\nline 2')
      expect(r1.gpsTags).toEqual([])
      expect(r1.groups.flatMap((g: any) => g.tags).find((t: any) => t.key === 'IFD0:Model')?.value).toBe('DarkCam 1')

      // strip all, in place, with a .bak
      const s = await svc.write({ path: copy, strip: true })
      expect(s.ok, s.error).toBe(true)
      expect(s.backupPath && fs.existsSync(s.backupPath)).toBe(true)
      const r2 = await svc.read(copy)
      expect(field(r2, 'title')).toBe('')
      expect(field(r2, 'artist')).toBe('')
      expect(r2.detect.type).toBe(fmt)
    })
  }

  it('refuses writes to a non-writable group and leaves no temp file', async () => {
    const sharp = (await import('sharp')).default
    const src = tmp('refuse.jpg')
    await sharp({ create: { width: 8, height: 8, channels: 3, background: 'red' } }).jpeg().toFile(src)
    const r = await svc.write({ path: src, outputPath: tmp('refuse-out.jpg'), rawTags: { 'File:FileType': 'PNG' } }).catch((e: Error) => ({ ok: false, error: e.message }))
    expect(r.ok).toBe(false)
    expect(fs.readdirSync(dir).some((n) => n.startsWith('.dhmeta-'))).toBe(false)
  })
})

describe.skipIf(!haveExif)('documents', () => {
  it('PDF: Info dictionary + XMP round trip', async () => {
    const src = tmp('doc.pdf')
    makePdf(src)
    const r0 = await svc.read(src)
    expect(r0.detect.type).toBe('pdf')
    expect(field(r0, 'title')).toBe('Old title')
    const out = tmp('doc-edited.pdf')
    const w = await svc.write({ path: src, outputPath: out, fields: { title: 'Novo título', author: 'Ana', subject: 'Assunto', keywords: 'k1, k2', producer: 'DarkHub' } })
    expect(w.ok, w.error).toBe(true)
    const r1 = await svc.read(out)
    expect(field(r1, 'title')).toBe('Novo título')
    expect(field(r1, 'author')).toBe('Ana')
    expect(field(r1, 'keywords')).toBe('k1, k2')
    expect(field(r1, 'producer')).toBe('DarkHub')
    const keys = r1.groups.flatMap((g: any) => g.tags.map((t: any) => t.key))
    expect(keys).toContain('XMP-dc:Title')
    const s = await svc.write({ path: out, strip: true, backup: false })
    expect(s.ok, s.error).toBe(true)
    expect(field(await svc.read(out), 'author')).toBe('')
  })

  it('DOCX: core.xml/app.xml round trip, ExifTool reads the result too', async () => {
    const src = tmp('report.docx')
    makeDocx(src)
    const r0 = await svc.read(src)
    expect(r0.detect.type).toBe('docx')
    expect(r0.backend).toBe('ooxml')
    expect(field(r0, 'author')).toBe('Original Author')
    expect(field(r0, 'company')).toBe('ACME')
    const out = tmp('report-edited.docx')
    const w = await svc.write({ path: src, outputPath: out, fields: { title: 'Relatório & <final>', author: 'Bia', keywords: 'x; y', company: 'DarkHub', creationDate: '2023-03-04T05:06:07Z' } })
    expect(w.ok, w.error).toBe(true)
    const r1 = await svc.read(out)
    expect(field(r1, 'title')).toBe('Relatório & <final>')
    expect(field(r1, 'author')).toBe('Bia')
    expect(field(r1, 'company')).toBe('DarkHub')
    expect(field(r1, 'creationDate')).toBe('2023-03-04T05:06:07Z')
    const flat = Object.fromEntries(r1.groups.flatMap((g: any) => g.tags.map((t: any) => [t.name, t.value])))
    expect(flat.Title).toBe('Relatório & <final>')
    // the document body is untouched
    const entries = readZipEntries(fs.readFileSync(out))
    expect(entryData(entries.find((e: any) => e.name === 'word/document.xml')).toString()).toContain('<w:t>Hello</w:t>')
    const s = await svc.write({ path: out, strip: true })
    expect(s.ok, s.error).toBe(true)
    const r2 = await svc.read(out)
    expect(field(r2, 'author')).toBe('')
    expect(field(r2, 'company')).toBe('')
  })

  it('PE: version resource is read-only', async () => {
    const r = await svc.read(exiftoolPath as string)
    expect(r.detect.family).toBe('pe')
    expect(r.backend).toBe(null)
    expect(r.groups.some((g: any) => g.name === 'EXE')).toBe(true)
    await expect(svc.write({ path: exiftoolPath, fields: { title: 'x' } })).rejects.toThrow(/read-only/)
  })
})

describe.skipIf(!haveExif || !haveFf)('audio and video (ffmpeg -c copy)', () => {
  const cover = () => {
    const p = tmp('cover.png')
    if (!fs.existsSync(p)) ff(['-f', 'lavfi', '-i', 'color=c=red:s=32x32', '-frames:v', '1', p])
    return p
  }
  for (const ext of ['mp3', 'flac', 'm4a', 'ogg']) {
    it(`${ext}: tags + cover round trip, then strip`, async () => {
      const src = tmp(`song.${ext}`)
      const codec = ext === 'mp3' ? ['-c:a', 'libmp3lame'] : ext === 'm4a' ? ['-c:a', 'aac'] : ext === 'ogg' ? ['-c:a', 'libvorbis'] : ['-c:a', 'flac']
      ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', ...codec, '-metadata', 'title=Seed', src])
      const before = fs.readFileSync(src)
      const r0 = await svc.read(src)
      expect(r0.detect.type).toBe(ext)
      expect(r0.backend).toBe('ffmpeg')
      expect(field(r0, 'title')).toBe('Seed')
      const out = tmp(`song-edited.${ext}`)
      const req: any = { path: src, outputPath: out, fields: { title: 'Canção', artist: 'Artista', album: 'Álbum', year: '2021', track: '3', genre: 'Rock', comment: 'olá' } }
      if (r0.capabilities.cover) req.cover = { path: cover() }
      const w = await svc.write(req)
      expect(w.ok, w.error + JSON.stringify(w.verification)).toBe(true)
      expect(fs.readFileSync(src).equals(before)).toBe(true)
      const r1 = await svc.read(out)
      expect(field(r1, 'title')).toBe('Canção')
      expect(field(r1, 'artist')).toBe('Artista')
      expect(field(r1, 'album')).toBe('Álbum')
      expect(field(r1, 'year')).toContain('2021')
      expect(parseInt(field(r1, 'track'), 10)).toBe(3)
      expect(field(r1, 'genre')).toBe('Rock')
      if (r0.capabilities.cover) expect(r1.cover?.dataUrl).toMatch(/^data:image\/png;base64,/)
      const s = await svc.write({ path: out, strip: true })
      expect(s.ok, s.error + JSON.stringify(s.verification)).toBe(true)
      const r2 = await svc.read(out)
      expect(field(r2, 'title')).toBe('')
      expect(r2.cover).toBe(null)
    })
  }

  for (const ext of ['mp4', 'mkv', 'mov']) {
    it(`${ext}: title/comment/creation date without re-encoding`, async () => {
      const src = tmp(`clip.${ext}`)
      ff(['-f', 'lavfi', '-i', 'testsrc=size=64x64:rate=10:duration=1', '-c:v', 'mpeg4', '-metadata', 'title=Seed', src])
      const out = tmp(`clip-edited.${ext}`)
      const w = await svc.write({ path: src, outputPath: out, fields: { title: 'Meu vídeo', comment: 'comentário', creationDate: '2022-06-07T08:09:10Z' } })
      expect(w.ok, w.error + JSON.stringify(w.verification)).toBe(true)
      const r1 = await svc.read(out)
      expect(field(r1, 'title')).toBe('Meu vídeo')
      expect(field(r1, 'comment')).toBe('comentário')
      expect(field(r1, 'creationDate')).toContain('2022:06:07 08:09:10')
      const s = await svc.write({ path: out, strip: true, backup: false })
      expect(s.ok, s.error + JSON.stringify(s.verification)).toBe(true)
      expect(field(await svc.read(out), 'title')).toBe('')
    })
  }

  it('mp4 without ffmpeg falls back to ExifTool', async () => {
    const src = tmp('clip-qt.mp4')
    ff(['-f', 'lavfi', '-i', 'testsrc=size=64x64:rate=10:duration=1', '-c:v', 'mpeg4', src])
    const out = tmp('clip-qt-edited.mp4')
    const w = await svcNoFf.write({ path: src, outputPath: out, fields: { title: 'Via ExifTool', comment: 'c' } })
    expect(w.ok, w.error + JSON.stringify(w.verification)).toBe(true)
    expect(field(await svcNoFf.read(out), 'title')).toBe('Via ExifTool')
  })
})

describe.skipIf(!isWin)('filesystem: timestamps, attributes, alternate data streams', () => {
  it('sets created/modified/accessed and read-only, lists and removes Zone.Identifier', async () => {
    const f = tmp('any.bin')
    fs.writeFileSync(f, Buffer.from([0xde, 0xad, 0xbe, 0xef, 0, 1, 2, 3]))
    fs.writeFileSync(`${f}:Zone.Identifier`, '[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=https://example.com/any.bin\r\n')
    const r0 = await svc.read(f)
    expect(r0.hex[0].hex.startsWith('de ad be ef')).toBe(true)
    expect(r0.fs.zone?.zoneId).toBe(3)
    expect(r0.fs.streams.map((s: any) => s.name)).toContain('Zone.Identifier')
    const created = Date.UTC(2001, 0, 2, 3, 4, 5)
    const modified = Date.UTC(2010, 5, 6, 7, 8, 9)
    const accessed = Date.UTC(2015, 1, 2, 3, 4, 5)
    await svc.setFileProps(f, { created, modified, accessed })
    const st = fs.statSync(f)
    expect(Math.abs(st.birthtimeMs - created)).toBeLessThan(1000)
    expect(Math.abs(st.mtimeMs - modified)).toBeLessThan(1000)
    expect(Math.abs(st.atimeMs - accessed)).toBeLessThan(1000)
    const ro = await svc.setFileProps(f, { readOnly: true, hidden: true })
    expect(ro.fs.readOnly).toBe(true)
    expect(ro.fs.hidden).toBe(true)
    expect(Math.abs(fs.statSync(f).birthtimeMs - created)).toBeLessThan(1000)
    await svc.setFileProps(f, { readOnly: false, hidden: false })
    const rm = await svc.removeStream(f, 'Zone.Identifier')
    expect(rm.fs.zone).toBe(null)
    expect(rm.fs.streams).toEqual([])
    expect(fs.readFileSync(f).length).toBe(8)
  })

  it.skipIf(!haveExif)('in-place edit keeps the Zone.Identifier mark and can preserve dates', async () => {
    const sharp = (await import('sharp')).default
    const f = tmp('marked.jpg')
    await sharp({ create: { width: 8, height: 8, channels: 3, background: 'blue' } }).jpeg().toFile(f)
    fs.writeFileSync(`${f}:Zone.Identifier`, '[ZoneTransfer]\r\nZoneId=3\r\n')
    await svc.setFileProps(f, { created: Date.UTC(2005, 0, 1), modified: Date.UTC(2006, 0, 1) })
    const w = await svc.write({ path: f, fields: { title: 'kept' }, preserveDates: true })
    expect(w.ok, w.error).toBe(true)
    const r = await svc.read(f)
    expect(field(r, 'title')).toBe('kept')
    expect(r.fs.zone?.zoneId).toBe(3)
    expect(Math.abs(fs.statSync(f).mtimeMs - Date.UTC(2006, 0, 1))).toBeLessThan(1000)
  })
})
