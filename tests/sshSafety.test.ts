// @vitest-environment node
// Audit fixes: SFTP local-name safety, protected local folders, "edit locally" names, symlink/owner-preserving remote
// saves, the vault key that must never be regenerated over an existing file, and tunnel start/stop races.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'
// @ts-ignore - plain JS module
import { SftpService, isSafeLocalName, sanitizeLocalName, editLocalName, isInsideLocal, protectedLocalRoots } from '../electron/services/ssh/SftpService.js'
// @ts-ignore - plain JS module
import { makeVaultKeyProvider } from '../electron/ipc/sshIpc.js'
// @ts-ignore - plain JS module
import { PortForwardService } from '../electron/services/ssh/PortForwardService.js'

const S_IFDIR = 0o040000
const S_IFREG = 0o100000
const S_IFLNK = 0o120000

describe('isSafeLocalName', () => {
  it('accepts plain names', () => {
    for (const n of ['a.txt', 'README', '.bashrc', 'my file (1).tar.gz', 'console.log', 'nul2', 'CONFIG']) expect(isSafeLocalName(n)).toBe(true)
  })
  it('rejects traversal, separators, streams, devices and trailing dots/spaces', () => {
    for (const n of ['', '.', '..', '..\\..\\x.bat', 'a\\b', 'a/b', 'C:x', 'x:stream', 'a*b', 'a?b', 'a"b', 'a<b', 'a>b', 'a|b', 'a\u0001b',
      'CON', 'con.txt', 'NUL', 'Aux.tar.gz', 'COM1', 'lpt9.log', 'CON .txt', 'CONIN$', 'name.', 'name ']) {
      expect(isSafeLocalName(n), n).toBe(false)
    }
  })
  it('sanitizeLocalName always yields a safe name', () => {
    for (const n of ['..\\..\\x.bat', 'CON', 'a:b', '..', '', 'x. ', 'a/b']) expect(isSafeLocalName(sanitizeLocalName(n)), n).toBe(true)
  })
})

describe('editLocalName', () => {
  const PATHEXT = '.COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC;.PY'
  it('appends .txt to anything that could execute', () => {
    for (const n of ['run.bat', 'x.js', 'a.vbs', 'b.hta', 'c.lnk', 'd.py', 'e.ps1', 'f.exe', 'g.url', 'deploy.sh', 'Makefile', '.bashrc']) {
      expect(editLocalName(n, PATHEXT), n).toBe(`${sanitizeLocalName(n)}.txt`)
    }
  })
  it('keeps plain text extensions, unless PATHEXT lists them', () => {
    expect(editLocalName('nginx.conf', PATHEXT)).toBe('nginx.conf')
    expect(editLocalName('data.json', PATHEXT)).toBe('data.json')
    expect(editLocalName('data.json', `${PATHEXT};.JSON`)).toBe('data.json.txt')
    expect(editLocalName('..\\..\\evil.bat', PATHEXT)).not.toMatch(/[\\/]/)
  })
})

describe('local path guards', () => {
  it('isInsideLocal', () => {
    expect(isInsideLocal('C:\\dl', 'C:\\dl\\a\\b.txt')).toBe(true)
    expect(isInsideLocal('C:\\dl', 'c:\\DL\\a')).toBe(true)
    expect(isInsideLocal('C:\\dl', 'C:\\dl\\..foo')).toBe(true)
    expect(isInsideLocal('C:\\dl', 'C:\\dl\\..\\x.bat')).toBe(false)
    expect(isInsideLocal('C:\\dl', 'D:\\dl\\x')).toBe(false)
  })
  it('protectedLocalRoots covers Windows, Program Files and ProgramData\\Microsoft', () => {
    const roots = protectedLocalRoots(['D:\\Apps\\DarkHub'], { WINDIR: 'C:\\Windows', ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)', ProgramData: 'C:\\ProgramData' })
    expect(roots).toEqual(expect.arrayContaining(['C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)', 'C:\\ProgramData\\Microsoft', 'D:\\Apps\\DarkHub']))
  })
  it('local fsOp/writeText refuse protected folders', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-prot-'))
    const svc = new SftpService({ manager: {}, protectedDirs: [tmp] })
    await expect(svc.fsOp({ side: 'local', op: 'touch', path: path.join(tmp, 'x.txt') })).rejects.toMatchObject({ code: 'PROTECTED' })
    await expect(svc.writeText({ side: 'local', path: path.join(tmp, 'x.txt'), content: 'a', create: true })).rejects.toMatchObject({ code: 'PROTECTED' })
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-ok-'))
    await expect(svc.fsOp({ side: 'local', op: 'rename', path: path.join(other, 'nope'), targetPath: path.join(tmp, 'y') })).rejects.toMatchObject({ code: 'PROTECTED' })
    fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(other, { recursive: true, force: true })
  })
})

/** Minimal in-memory SFTP server side: files and folders keyed by POSIX path. */
function fakeSftp(tree: Record<string, string | null>, { chownFails = false, links = {} as Record<string, string>, owner = { uid: 1000, gid: 1000 } } = {}) {
  const files = new Map(Object.entries(tree))
  const attrs = (p: string) => (files.get(p) === null
    ? { mode: S_IFDIR | 0o755, size: 0, mtime: 1, ...owner }
    : { mode: S_IFREG | 0o644, size: Buffer.byteLength(files.get(p) ?? ''), mtime: 1, ...owner })
  const resolve = (p: string) => links[p] ?? p
  const missing = () => Object.assign(new Error('No such file'), { code: 2 })
  const calls: string[] = []
  const sftp = {
    calls, files,
    stat: (p: string, cb: any) => { const r = resolve(p); files.has(r) ? cb(null, attrs(r)) : cb(missing()) },
    lstat: (p: string, cb: any) => (links[p] ? cb(null, { mode: S_IFLNK | 0o777, size: 0, mtime: 1 }) : sftp.stat(p, cb)),
    realpath: (p: string, cb: any) => cb(null, resolve(p)),
    readdir: (d: string, cb: any) => cb(null, [...files.keys()].filter((k) => path.posix.dirname(k) === d && k !== d).map((k) => ({ filename: path.posix.basename(k), attrs: attrs(k) }))),
    createReadStream: (p: string) => { const s = new PassThrough(); s.end(Buffer.from(files.get(resolve(p)) ?? '')); return s },
    createWriteStream: (p: string) => {
      const chunks: Buffer[] = []
      return new Writable({ write(c, _e, done) { chunks.push(Buffer.from(c)); done() }, final(done) { files.set(p, Buffer.concat(chunks).toString()); calls.push(`write ${p}`); done() } })
    },
    chmod: (_p: string, _m: number, cb: any) => cb(null),
    chown: (p: string, _u: number, _g: number, cb: any) => { calls.push(`chown ${p}`); cb(chownFails ? Object.assign(new Error('denied'), { code: 3 }) : null) },
    unlink: (p: string, cb: any) => { files.delete(p); calls.push(`unlink ${p}`); cb(null) },
    rename: (a: string, b: string, cb: any) => { files.set(b, files.get(a) ?? ''); files.delete(a); calls.push(`rename ${a} ${b}`); cb(null) },
    mkdir: (p: string, cb: any) => { files.set(p, null); cb(null) }
  }
  return sftp
}

const withHandle = (sftp: any, opts: any = {}) => {
  const svc = new SftpService({ manager: {}, ...opts })
  svc.handles.set('f1', { sftp, conn: { close() {} }, hostId: 'h', home: '/home/u', root: false, sudo: null })
  return svc
}

describe('SFTP downloads never escape the destination folder', () => {
  it('refuses a single file whose name is not a Windows name', async () => {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-dl-'))
    const svc = withHandle(fakeSftp({ '/home/u': null }))
    for (const name of ['..\\..\\x.bat', 'CON', 'a:b']) {
      await expect(svc.transfer({ transferId: 't1', sftpId: 'f1', direction: 'download', remotePath: `/home/u/${name}`, localPath: `${dest}\\${name}` }))
        .rejects.toMatchObject({ code: 'UNSAFE_NAME' })
    }
    expect(fs.readdirSync(path.dirname(dest)).includes('x.bat')).toBe(false)
    fs.rmSync(dest, { recursive: true, force: true })
  })

  it('skips unsafe names inside a folder and reports them', async () => {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-dl-'))
    const sftp = fakeSftp({ '/srv': null, '/srv/pkg': null, '/srv/pkg/ok.txt': 'fine', '/srv/pkg/..\\..\\evil.bat': 'boom', '/srv/pkg/NUL': 'x', '/srv/pkg/sub:dir': null, '/srv/pkg/sub:dir/in.txt': 'x' })
    const svc = withHandle(sftp)
    const r = await svc.transfer({ transferId: 't2', sftpId: 'f1', direction: 'download', remotePath: '/srv/pkg', localPath: path.join(dest, 'pkg') })
    expect(r.ok).toBe(true)
    expect(r.filesDone).toBe(1)
    expect(r.unsafeNames).toEqual(expect.arrayContaining(['..\\..\\evil.bat', 'NUL', 'sub:dir']))
    expect(fs.readFileSync(path.join(dest, 'pkg', 'ok.txt'), 'utf8')).toBe('fine')
    expect(fs.existsSync(path.join(path.dirname(dest), 'evil.bat'))).toBe(false)
    expect(fs.readdirSync(path.join(dest, 'pkg'))).toEqual(['ok.txt'])
    fs.rmSync(dest, { recursive: true, force: true })
  })
})

describe('remote saves keep symlinks and ownership', () => {
  it('writes the symlink target, chowns the temp file, then renames', async () => {
    const sftp = fakeSftp({ '/etc': null, '/etc/real.conf': 'old' }, { links: { '/etc/link.conf': '/etc/real.conf' } })
    const svc = withHandle(sftp)
    await svc.writeText({ sftpId: 'f1', side: 'remote', path: '/etc/link.conf', content: 'new', force: true })
    expect(sftp.files.get('/etc/real.conf')).toBe('new')
    expect(sftp.files.has('/etc/link.conf')).toBe(false) // still a link (only in the links map), never replaced by a file
    expect(sftp.calls.some((c) => c.startsWith('chown /etc/.real.conf.darkhub-'))).toBe(true)
    expect(sftp.calls.at(-1)).toMatch(/^rename \/etc\/\.real\.conf\.darkhub-.*\.tmp \/etc\/real\.conf$/)
  })

  it('falls back to an in-place write when the owner cannot be restored', async () => {
    const sftp = fakeSftp({ '/srv': null, '/srv/app.env': 'old' }, { chownFails: true })
    const svc = withHandle(sftp)
    await svc.writeText({ sftpId: 'f1', side: 'remote', path: '/srv/app.env', content: 'new', force: true })
    expect(sftp.files.get('/srv/app.env')).toBe('new')
    expect(sftp.calls.some((c) => c.startsWith('rename'))).toBe(false)
    expect(sftp.calls.at(-1)).toBe('write /srv/app.env')
    expect([...sftp.files.keys()].some((k) => k.endsWith('.tmp'))).toBe(false)
  })
})

describe('vault key file', () => {
  const dpapi = (available: boolean) => ({
    isEncryptionAvailable: () => available,
    encryptString: (s: string) => Buffer.from(`enc:${s}`),
    decryptString: (b: Buffer) => { const t = b.toString(); if (!t.startsWith('enc:')) throw new Error('bad'); return t.slice(4) }
  })

  it('an existing DPAPI key is never replaced while DPAPI is unavailable', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-key-'))
    const file = path.join(dir, 'k.json')
    const first = makeVaultKeyProvider(file, dpapi(true)).getKey()
    const before = fs.readFileSync(file, 'utf8')
    const locked = makeVaultKeyProvider(file, dpapi(false))
    expect(() => locked.getKey()).toThrow(expect.objectContaining({ code: 'VAULT_LOCKED' }))
    expect(fs.readFileSync(file, 'utf8')).toBe(before)
    // once DPAPI is ready the same key comes back
    expect(makeVaultKeyProvider(file, dpapi(true)).getKey().equals(first)).toBe(true)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('a corrupt or wrong-length key file locks instead of being overwritten', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-key-'))
    const file = path.join(dir, 'k.json')
    for (const body of ['{not json', JSON.stringify({ protection: 'none', keyB64: Buffer.alloc(8).toString('base64') }), JSON.stringify({ protection: 'weird' })]) {
      fs.writeFileSync(file, body)
      expect(() => makeVaultKeyProvider(file, dpapi(true)).getKey()).toThrow(expect.objectContaining({ code: 'VAULT_LOCKED' }))
      expect(fs.readFileSync(file, 'utf8')).toBe(body)
    }
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('a missing file creates a new key', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-key-'))
    const kp = makeVaultKeyProvider(path.join(dir, 'k.json'), dpapi(true))
    expect(kp.getKey()).toHaveLength(32)
    expect(kp.protection()).toBe('dpapi')
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('tunnel start/stop race', () => {
  it('a stale start that fails does not tear down the newer run', async () => {
    const statuses: any[] = []
    let releaseFirst: (v: any) => void = () => {}
    let n = 0
    const closed: number[] = []
    const manager = {
      connectClient: () => {
        n += 1
        const id = n
        const conn = { client: Object.assign(new EventEmitter(), { forwardIn: (_a: string, _p: number, cb: any) => cb(id === 1 ? new Error('refused') : null, 9000) }), close: () => closed.push(id) }
        return id === 1 ? new Promise((r) => { releaseFirst = () => r(conn) }) : Promise.resolve(conn)
      },
      cancelPromptsOf: () => {}
    }
    const store = { getTunnel: () => ({ id: 'tn', kind: 'remote', hostId: 'h', bindAddress: '127.0.0.1', bindPort: 9000, targetHost: '127.0.0.1', targetPort: 80 }) }
    const pf = new PortForwardService({ store, manager, onStatus: (s: any) => statuses.push(s) })
    const first = pf.start('tn').catch((e: any) => e)
    pf.stop('tn')
    const second = await pf.start('tn')
    expect(second.status).toBe('active')
    releaseFirst(null)
    const err = await first
    expect(err.code).toBe('CANCELLED')
    expect(pf.status('tn').status).toBe('active')
    expect(closed).toContain(1)
    expect(closed).not.toContain(2)
    pf.stopAll()
  })
})
