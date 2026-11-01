// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
// @ts-ignore - plain JS module
import { CleanerService, sanitizeIds, validateWinapp2, WINAPP2_URL } from '../electron/services/cleaner/CleanerService.js'

const EXE = path.resolve(__dirname, '../electron/services/DarkHub.Cleaner.exe')
const hasExe = fs.existsSync(EXE) && process.platform === 'win32'
const tmps: string[] = []
const tmpDir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-cleaner-')); tmps.push(d); return d }
afterAll(() => { for (const d of tmps) try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* in use */ } })

const fakeIni = (sections = 150) => {
  let s = '; Version: 999999\n; # of entries: test\n'
  for (let i = 0; i < sections; i++) s += `\n[Program ${i} *]\nLangSecRef=3021\nFileKey1=%LocalAppData%\\Program${i}\\Cache|*.*\n`
  return Buffer.from(s)
}
const fakeFetch = (body: Buffer, { status = 200, url = WINAPP2_URL } = {}) => async () => ({
  ok: status >= 200 && status < 300, status, url, headers: { get: () => String(body.length) },
  arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length)
})

describe('Cleaner service (unit)', () => {
  it('keeps only plausible ids', () => {
    expect(sanitizeIds(['dh:a', 'dh:a', '', 3, 'x\ny', null, 'w2:b'])).toEqual(['dh:a', 'w2:b'])
    expect(sanitizeIds('dh:a')).toEqual([])
  })

  it('accepts a real-looking winapp2.ini and refuses html, binary and truncated files', () => {
    expect(validateWinapp2(fakeIni())).toMatchObject({ ok: true, version: '999999', sections: 150 })
    expect(validateWinapp2(Buffer.from('<html><body>' + 'x'.repeat(4000) + '</body></html>')).ok).toBe(false)
    expect(validateWinapp2(Buffer.concat([fakeIni(), Buffer.from([0, 1, 2])])).ok).toBe(false)
    expect(validateWinapp2(fakeIni(10)).ok).toBe(false)
    expect(validateWinapp2(Buffer.from('; Version: 1\n')).ok).toBe(false)
  })

  it('downloads definitions only when asked, records the hash and keeps the old file when the new one is bad', async () => {
    const dataDir = tmpDir()
    const svc = new CleanerService({ exePath: EXE, dataDir, fetchImpl: fakeFetch(fakeIni()) })
    expect(svc.definitions().installed).toBe(false)
    const r = await svc.updateDefinitions()
    expect(r.ok).toBe(true)
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(svc.definitions()).toMatchObject({ installed: true, version: '999999', sections: 150 })
    const before = fs.readFileSync(svc.winapp2Path)

    svc.fetch = fakeFetch(Buffer.from('<html>' + 'x'.repeat(5000)))
    expect((await svc.updateDefinitions()).ok).toBe(false)
    svc.fetch = fakeFetch(fakeIni(), { status: 503 })
    expect((await svc.updateDefinitions()).ok).toBe(false)
    svc.fetch = fakeFetch(fakeIni(), { url: 'http://evil.example/winapp2.ini' })
    expect((await svc.updateDefinitions()).ok).toBe(false)
    expect(fs.readFileSync(svc.winapp2Path).equals(before)).toBe(true)
  })

  it('refuses to apply without the on-screen confirmation and validates shred passes', () => {
    const svc = new CleanerService({ exePath: EXE, dataDir: tmpDir() })
    expect(() => svc.clean({ ids: ['dh:x'], apply: true })).toThrow(/Confirme/)
    expect(() => svc.clean({ ids: ['dh:x'], shred: 9 })).toThrow()
    expect(() => svc.browsers({ apply: true })).toThrow(/Confirme/)
    expect(() => svc.regClean({ ids: [], apply: true })).toThrow(/Confirme/)
  })

  it('restores only bare .reg names from its own backup folder', () => {
    const svc = new CleanerService({ exePath: EXE, dataDir: tmpDir(), backupDir: tmpDir() })
    expect(() => svc.restoreBackup({ name: '..\\..\\evil.reg' })).toThrow()
    expect(() => svc.restoreBackup({ name: 'C:\\x.reg' })).toThrow()
    expect(() => svc.restoreBackup({ name: 'x.bat' })).toThrow()
    expect(() => svc.restoreBackup({ name: 'nao-existe.reg' })).toThrow(/não encontrado/)
  })
})

describe.skipIf(!hasExe)('Cleaner engine (real exe, throwaway folders)', () => {
  it('lists, simulates, then deletes only what was listed', async () => {
    const root = tmpDir()
    const dataDir = tmpDir()
    const local = path.join(root, 'Users', 'me', 'AppData', 'Local')
    const put = (rel: string, n: number) => { const p = path.join(local, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, Buffer.alloc(n, 7)); return p }
    const a = put('Prog\\Cache\\a.tmp', 100)
    const b = put('Prog\\Cache\\sub\\b.tmp', 200)
    const keep = put('Prog\\Cache\\Login Data', 10)
    const outside = put('Prog\\settings.json', 10)
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(path.join(dataDir, 'winapp2.ini'), [
      '; Version: test', '[Prog *]', 'LangSecRef=3024', 'DetectFile=%LocalAppData%\\Prog',
      'FileKey1=%LocalAppData%\\Prog\\Cache|*.*|RECURSE', 'FileKey2=%ProgramFiles%\\Prog|*.*|RECURSE', 'RegKey1=HKCU\\Software\\Prog'
    ].join('\r\n'))
    const svc = new CleanerService({ exePath: EXE, dataDir, extraArgs: ['--test-root', root] })

    const list = await svc.listTargets()
    expect(list.ok).toBe(true)
    const prog = list.targets.find((x: any) => x.id === 'w2:Prog *')
    expect(prog.rules).toHaveLength(1)
    expect(prog.ignored_registry).toBe(1)

    const scan = await svc.scan({ ids: ['w2:Prog *'] })
    expect(scan).toMatchObject({ ok: true, dry_run: true, total: { files: 2, bytes: 300, protected: 1 } })
    expect(scan.targets[0].sample).toEqual(expect.arrayContaining([a, b]))

    const sim = await svc.clean({ ids: ['w2:Prog *'] })
    expect(sim.dry_run).toBe(true)
    expect(fs.existsSync(a) && fs.existsSync(b)).toBe(true)

    const real = await svc.clean({ ids: ['w2:Prog *', 'w2:Forged'], apply: true, confirm: true, shred: 1 })
    expect(real).toMatchObject({ ok: true, dry_run: false, shred: 1, total: { files: 2 } })
    expect(real.unknown_ids).toEqual(['w2:Forged'])
    expect(fs.existsSync(a) || fs.existsSync(b)).toBe(false)
    expect(fs.existsSync(keep) && fs.existsSync(outside)).toBe(true)
  }, 60000)

  it('registry: dry-run first, .reg backup before removal, restore brings it back', async () => {
    const key = `Software\\DarkHubCleanerTest-vitest-${process.pid}`
    const hk = `HKCU\\${key}`
    const backupDir = tmpDir()
    const startup = tmpDir()
    const dead = `${process.env.WINDIR || 'C:\\Windows'}\\DarkHubNoSuchDir\\ghost.exe`
    execFileSync('reg.exe', ['add', `${hk}\\Run`, '/v', 'Ghost', '/t', 'REG_SZ', '/d', `"${dead}" --tray`, '/f'], { windowsHide: true })
    execFileSync('reg.exe', ['add', `${hk}\\Run`, '/v', 'Cmd', '/t', 'REG_SZ', '/d', `${process.env.WINDIR || 'C:\\Windows'}\\System32\\cmd.exe`, '/f'], { windowsHide: true })
    try {
      const svc = new CleanerService({ exePath: EXE, dataDir: tmpDir(), backupDir, extraArgs: ['--root', hk, '--startup-folder', startup] })
      const scan = await svc.regScan()
      expect(scan.ok).toBe(true)
      expect(scan.findings.map((f: any) => f.value)).toEqual(['Ghost'])
      const ids = scan.findings.map((f: any) => f.id)

      const dry = await svc.regClean({ ids })
      expect(dry).toMatchObject({ ok: true, dry_run: true, removed: 0 })
      expect(fs.readdirSync(backupDir)).toHaveLength(0)

      const r = await svc.regClean({ ids, apply: true, confirm: true })
      expect(r).toMatchObject({ ok: true, removed: 1 })
      expect(path.dirname(r.backup)).toBe(backupDir)
      expect(fs.readFileSync(r.backup).subarray(0, 2)).toEqual(Buffer.from([0xff, 0xfe]))
      expect((await svc.regScan()).findings).toHaveLength(0)

      const list = svc.listBackups()
      expect(list.backups.map((b: any) => b.name)).toEqual([path.basename(r.backup)])
      expect(await svc.restoreBackup({ name: path.basename(r.backup) })).toMatchObject({ ok: true })
      expect((await svc.regScan()).findings.map((f: any) => f.value)).toEqual(['Ghost'])
    } finally {
      execFileSync('reg.exe', ['delete', hk, '/f'], { windowsHide: true })
    }
  }, 60000)
})

describe('Cleaner service concurrency', () => {
  it('lets simulations overlap but runs one change at a time', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => { release = r })
    const calls: string[][] = []
    const execFileImpl = (_exe: string, args: string[], _o: unknown, cb: (e: null, out: string, err: string) => void) => {
      calls.push(args)
      void gate.then(() => cb(null, JSON.stringify({ ok: true, dry_run: !args.includes('--apply') }), ''))
    }
    const svc = new CleanerService({ exePath: process.execPath, dataDir: tmpDir(), execFileImpl })
    const a = svc.browsers({})
    const b = svc.browsers({})
    const c = svc.browsers({ apply: true, confirm: true })
    const d = await svc.browsers({ apply: true, confirm: true })
    expect(d).toMatchObject({ ok: false, code: 'busy' })
    release()
    expect(await a).toMatchObject({ ok: true, dry_run: true })
    expect(await b).toMatchObject({ ok: true, dry_run: true })
    expect(await c).toMatchObject({ ok: true, dry_run: false })
    expect(calls).toHaveLength(3)
  })
})
