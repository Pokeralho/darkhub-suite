// @vitest-environment node
// Regression tests for the full-review audit fixes (psQuote, text editor I/O, PDF request filter, yt-dlp).
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { pathToFileURL } from 'node:url'
// @ts-ignore - plain JS module
import { psQuote } from '../electron/services/optimizer/OptimizerUtils.js'
// @ts-ignore - plain JS module
import { decodeTextBuffer, encodeText, readTextFile, writeTextFile } from '../electron/services/textFile.js'
// @ts-ignore - plain JS module
import { isAllowedPdfRequest } from '../electron/services/converter/DocumentConverter.js'
// @ts-ignore - plain JS module
import { parseChecksumList, ensureYtDlp, runYtDlp, cancelActiveYtDlp } from '../electron/ytdlp.js'

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dh-audit-'))

describe('psQuote', () => {
  it('doubles every single-quote variant PowerShell accepts', () => {
    expect(psQuote("a'b")).toBe("'a''b'")
    expect(psQuote('a’b')).toBe("'a’’b'")
    expect(psQuote('‘‚‛')).toBe("'‘‘‚‚‛‛'")
  })

  it.skipIf(process.platform !== 'win32')('round-trips typographic quotes through real PowerShell (no injection)', () => {
    const payload = "x’; Write-Output INJECTED; ’y'z"
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `[Console]::OutputEncoding=[Text.Encoding]::UTF8; Write-Output ${psQuote(payload)}`], { encoding: 'utf8', windowsHide: true })
    expect(out.trim()).toBe(payload)
  })
})

describe('text editor file I/O', () => {
  it('decodes UTF-8 (with/without BOM) and UTF-16 LE, and writes the same bytes back', () => {
    const plain = Buffer.from('olá', 'utf8')
    expect(decodeTextBuffer(plain)).toMatchObject({ ok: true, content: 'olá', encoding: 'utf-8', bom: false })
    const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), plain])
    const r = decodeTextBuffer(bom)
    expect(r).toMatchObject({ ok: true, content: 'olá', bom: true })
    expect(encodeText(r.content, r).equals(bom)).toBe(true)
    const u16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('ção', 'utf16le')])
    const r16 = decodeTextBuffer(u16)
    expect(r16).toMatchObject({ ok: true, content: 'ção', encoding: 'utf-16le' })
    expect(encodeText(r16.content, r16).equals(u16)).toBe(true)
  })

  it('refuses non-UTF-8 text and binary files instead of corrupting them', () => {
    expect(decodeTextBuffer(Buffer.from([0x63, 0x61, 0xe7, 0xe3, 0x6f]))).toEqual({ ok: false, code: 'unsupported-encoding' }) // Windows-1252
    expect(decodeTextBuffer(Buffer.from([0x4d, 0x5a, 0x00, 0x01]))).toEqual({ ok: false, code: 'not-text' })
    expect(decodeTextBuffer(Buffer.from([0xfe, 0xff, 0x00, 0x41]))).toEqual({ ok: false, code: 'unsupported-encoding' })
  })

  it('saves atomically and leaves no temp file behind', async () => {
    const dir = tmpDir()
    const f = path.join(dir, 'a.txt')
    fs.writeFileSync(f, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('old', 'utf16le')]))
    const r = await readTextFile(f)
    await writeTextFile(f, 'novo texto', r)
    expect(fs.readFileSync(f).equals(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('novo texto', 'utf16le')]))).toBe(true)
    expect(fs.readdirSync(dir)).toEqual(['a.txt'])
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('HTML -> PDF request filter', () => {
  const src = path.join(os.tmpdir(), 'docs')
  const tmp = path.join(os.tmpdir(), 'job-tmp')
  const htmlFile = path.join(tmp, 'markdown.html')
  const rules = { htmlFile, roots: [src, tmp] }
  const url = (p: string) => pathToFileURL(p).href

  it('allows the page, files under the source and temp folders, and inline data', () => {
    expect(isAllowedPdfRequest(url(htmlFile), 'mainFrame', rules)).toBe(true)
    expect(isAllowedPdfRequest(url(path.join(src, 'img', 'a.png')), 'image', rules)).toBe(true)
    expect(isAllowedPdfRequest(url(path.join(tmp, 'x.css')), 'stylesheet', rules)).toBe(true)
    expect(isAllowedPdfRequest('data:image/png;base64,AAAA', 'image', rules)).toBe(true)
  })

  it('blocks frames, other local files, traversal and network', () => {
    expect(isAllowedPdfRequest(url(path.join(src, 'b.html')), 'subFrame', rules)).toBe(false)
    expect(isAllowedPdfRequest(url(path.join(os.homedir(), '.ssh', 'id_rsa')), 'image', rules)).toBe(false)
    expect(isAllowedPdfRequest(url(path.join(src, '..', 'secret.png')), 'image', rules)).toBe(false)
    expect(isAllowedPdfRequest(url(`${src}-evil${path.sep}a.png`), 'image', rules)).toBe(false)
    expect(isAllowedPdfRequest('https://example.com/a.png', 'image', rules)).toBe(false)
  })
})

describe('yt-dlp install and cancel', () => {
  const sums = `${'a'.repeat(64)}  yt-dlp_linux\n${'B'.repeat(64)} *yt-dlp.exe\n`

  it('parses the published checksum list', () => {
    expect(parseChecksumList(sums, 'yt-dlp.exe')).toBe('b'.repeat(64))
    expect(parseChecksumList(sums, 'yt-dlp_macos')).toBe(null)
  })

  it('fails closed when no published checksum exists for the file', async () => {
    const dir = tmpDir()
    const calls: string[] = []
    const fakeDownload = async (u: string, dest: string) => { calls.push(u); fs.writeFileSync(dest, u.endsWith('SUMS') ? `${'a'.repeat(64)}  other.exe\n` : 'binary') }
    await expect(ensureYtDlp(dir, 'win32', { downloadToFile: fakeDownload })).rejects.toThrow(/integrity/)
    expect(calls.every((u) => u.endsWith('SHA2-256SUMS'))).toBe(true) // the binary is never fetched
    expect(fs.readdirSync(dir)).toEqual([])
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('passes the expected hash to the downloader and installs only on success', async () => {
    const dir = tmpDir()
    let expected: string | null = null
    const fakeDownload = async (u: string, dest: string, opts: any) => {
      if (u.endsWith('SUMS')) return fs.writeFileSync(dest, sums)
      expected = opts.expectedSha256
      fs.writeFileSync(dest, Buffer.alloc(2 * 1024 * 1024))
    }
    const p = await ensureYtDlp(dir, 'win32', { downloadToFile: fakeDownload })
    expect(expected).toBe('b'.repeat(64))
    expect(fs.readdirSync(dir)).toEqual(['yt-dlp.exe'])
    expect(p).toBe(path.join(dir, 'yt-dlp.exe'))
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('an info probe never replaces the tracked download, so Cancel stops the download', async () => {
    const kids: any[] = []
    const fakeSpawn = () => {
      const c: any = new EventEmitter()
      c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.pid = 0
      c.kill = () => { setImmediate(() => c.emit('close', 1)) }
      kids.push(c)
      return c
    }
    const download = runYtDlp('yt-dlp', ['x'], { track: true, spawnImpl: fakeSpawn })
    const probe = runYtDlp('yt-dlp', ['-J', 'x'], { spawnImpl: fakeSpawn })
    expect(cancelActiveYtDlp()).toBe(true)
    expect(await download).toMatchObject({ canceled: true })
    expect(cancelActiveYtDlp()).toBe(false) // nothing else tracked: the probe is untouched
    kids[1].emit('close', 0)
    expect(await probe).toMatchObject({ code: 0, canceled: false })
  })
})
