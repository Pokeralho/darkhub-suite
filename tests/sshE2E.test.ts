// @vitest-environment node
// End-to-end: the real SshSessionManager / SftpService / PortForwardService against an in-process ssh2 server
// (shell echo, SFTP backed by a temp folder, direct-tcpip forwarding). No network beyond 127.0.0.1.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import net from 'node:net'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
// @ts-ignore - plain JS module
import { SshVaultStore } from '../electron/services/ssh/SshVaultStore.js'
// @ts-ignore - plain JS module
import { SshSessionManager } from '../electron/services/ssh/SshSessionManager.js'
// @ts-ignore - plain JS module
import { SftpService } from '../electron/services/ssh/SftpService.js'
// @ts-ignore - plain JS module
import { PortForwardService } from '../electron/services/ssh/PortForwardService.js'

const KEY = crypto.randomBytes(32)
const require = createRequire(import.meta.url)
const { Server, utils } = require('ssh2')
const { STATUS_CODE, OPEN_MODE } = utils.sftp

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-sshe2e-'))
const remoteDir = path.join(root, 'remote')
const localDir = path.join(root, 'local')
fs.mkdirSync(remoteDir); fs.mkdirSync(localDir)
const rootDir = path.join(root, 'as-root')
fs.mkdirSync(path.join(rootDir, 'etc'), { recursive: true })
fs.writeFileSync(path.join(rootDir, 'etc', 'shadow'), 'root:$6$hash:19000::::::\n')
let fsBase = remoteDir
const toFs = (p: string, base = fsBase) => path.join(base, path.posix.normalize('/' + p))

let server: any
let port = 0
let echoServer: net.Server
let echoPort = 0

function attrsOf(st: fs.Stats) {
  return { mode: st.mode, uid: 0, gid: 0, size: st.size, atime: Math.floor(st.atimeMs / 1000), mtime: Math.floor(st.mtimeMs / 1000) }
}

function sftpHandlers(sftp: any, base = remoteDir) {
  const toFs = (p: string) => path.join(base, path.posix.normalize('/' + p))
  const handles = new Map<number, { fd?: number; dir?: string; done?: boolean }>()
  let next = 1
  const h = (id: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(id); return b }
  const hid = (b: Buffer) => b.readUInt32BE(0)
  const wrap = (reqid: number, fn: () => void) => { try { fn() } catch (e: any) { sftp.status(reqid, e?.code === 'ENOENT' ? STATUS_CODE.NO_SUCH_FILE : STATUS_CODE.FAILURE) } }
  sftp.on('REALPATH', (reqid: number, p: string) => sftp.name(reqid, [{ filename: path.posix.normalize(p === '.' ? '/' : '/' + p), longname: '', attrs: {} }]))
  sftp.on('STAT', (reqid: number, p: string) => wrap(reqid, () => sftp.attrs(reqid, attrsOf(fs.statSync(toFs(p))))))
  sftp.on('LSTAT', (reqid: number, p: string) => wrap(reqid, () => sftp.attrs(reqid, attrsOf(fs.lstatSync(toFs(p))))))
  sftp.on('OPENDIR', (reqid: number, p: string) => wrap(reqid, () => { fs.readdirSync(toFs(p)); const id = next++; handles.set(id, { dir: toFs(p) }); sftp.handle(reqid, h(id)) }))
  sftp.on('READDIR', (reqid: number, hb: Buffer) => {
    const st = handles.get(hid(hb))!
    if (st.done) return sftp.status(reqid, STATUS_CODE.EOF)
    st.done = true
    sftp.name(reqid, fs.readdirSync(st.dir!).map((n) => ({ filename: n, longname: n, attrs: attrsOf(fs.statSync(path.join(st.dir!, n))) })))
  })
  sftp.on('OPEN', (reqid: number, p: string, flags: number) => wrap(reqid, () => {
    const mode = flags & OPEN_MODE.WRITE ? (flags & OPEN_MODE.EXCL ? 'wx' : flags & OPEN_MODE.APPEND ? 'a' : 'w') : 'r'
    const id = next++; handles.set(id, { fd: fs.openSync(toFs(p), mode) }); sftp.handle(reqid, h(id))
  }))
  sftp.on('READ', (reqid: number, hb: Buffer, offset: number, len: number) => {
    const buf = Buffer.alloc(len)
    const n = fs.readSync(handles.get(hid(hb))!.fd!, buf, 0, len, offset)
    if (!n) sftp.status(reqid, STATUS_CODE.EOF); else sftp.data(reqid, buf.subarray(0, n))
  })
  sftp.on('WRITE', (reqid: number, hb: Buffer, offset: number, data: Buffer) => { fs.writeSync(handles.get(hid(hb))!.fd!, data, 0, data.length, offset); sftp.status(reqid, STATUS_CODE.OK) })
  sftp.on('FSTAT', (reqid: number, hb: Buffer) => sftp.attrs(reqid, attrsOf(fs.fstatSync(handles.get(hid(hb))!.fd!))))
  sftp.on('CLOSE', (reqid: number, hb: Buffer) => { const st = handles.get(hid(hb)); if (st?.fd != null) fs.closeSync(st.fd); handles.delete(hid(hb)); sftp.status(reqid, STATUS_CODE.OK) })
  sftp.on('RENAME', (reqid: number, a: string, b: string) => wrap(reqid, () => { fs.renameSync(toFs(a), toFs(b)); sftp.status(reqid, STATUS_CODE.OK) }))
  sftp.on('REMOVE', (reqid: number, p: string) => wrap(reqid, () => { fs.unlinkSync(toFs(p)); sftp.status(reqid, STATUS_CODE.OK) }))
  sftp.on('MKDIR', (reqid: number, p: string) => wrap(reqid, () => { fs.mkdirSync(toFs(p)); sftp.status(reqid, STATUS_CODE.OK) }))
  sftp.on('RMDIR', (reqid: number, p: string) => wrap(reqid, () => { fs.rmdirSync(toFs(p)); sftp.status(reqid, STATUS_CODE.OK) }))
  sftp.on('SETSTAT', (reqid: number) => sftp.status(reqid, STATUS_CODE.OK))
}

beforeAll(async () => {
  const hostKey = utils.generateKeyPairSync('ed25519').private
  server = new Server({ hostKeys: [hostKey] }, (client: any) => {
    client.on('authentication', (ctx: any) => {
      if (ctx.username === 'otp') {
        // 2FA style login: only keyboard-interactive with a hidden password and a visible code
        if (ctx.method !== 'keyboard-interactive') return ctx.reject(['keyboard-interactive'])
        return ctx.prompt([{ prompt: 'Password: ', echo: false }, { prompt: 'Verification code: ', echo: true }], (answers: string[]) => (answers[0] === 'pw' && answers[1] === '123456' ? ctx.accept() : ctx.reject()))
      }
      return ctx.method === 'password' && ctx.username === 'dh' && ctx.password === 'pw' ? ctx.accept() : ctx.reject(['password'])
    })
    client.on('ready', () => {
      client.on('session', (accept: any) => {
        const session = accept()
        session.on('pty', (a: any) => a && a())
        session.on('window-change', (a: any) => a && a())
        session.on('shell', (a: any) => {
          const stream = a()
          stream.write('welcome\r\n')
          stream.on('data', (d: Buffer) => stream.write(`echo:${d.toString()}`))
        })
        session.on('sftp', (a: any) => sftpHandlers(a()))
        // fake sudo: password "rootpw"; the root SFTP serves another folder so the test can tell them apart
        session.on('exec', (a: any, _r: any, info: any) => {
          const stream = a()
          const cmd: string = info.command
          const done = (code: number, err = '') => { if (err) stream.stderr.write(err); stream.exit(code); stream.end() }
          const firstLine = (cb: (line: string, rest: Buffer) => void) => {
            let buf = Buffer.alloc(0)
            const on = (d: Buffer) => { buf = Buffer.concat([buf, d]); const i = buf.indexOf(10); if (i >= 0) { stream.removeListener('data', on); cb(buf.subarray(0, i).toString(), buf.subarray(i + 1)) } }
            stream.on('data', on)
          }
          if (cmd.startsWith('sh -c')) { stream.write('/usr/lib/openssh/sftp-server\n'); return done(0) }
          if (cmd === 'sudo -n true') return done(1, 'sudo: a password is required\n')
          if (cmd === "sudo -S -k -p '' true") return firstLine((line) => done(line === 'rootpw' ? 0 : 1, line === 'rootpw' ? '' : 'Sorry, try again.\n'))
          if (cmd.startsWith("sudo -S -k -p '' -- '/usr/lib/openssh/sftp-server'")) {
            return firstLine((line, rest) => {
              if (line !== 'rootpw') return done(1, 'Sorry, try again.\n')
              const { SFTP } = require('ssh2/lib/protocol/SFTP.js')
              const fake = { _protocol: { _remoteIdentRaw: undefined, channelData: (_i: number, d: Buffer) => stream.write(d), channelClose: () => stream.end() } }
              const chan = { type: 'session', incoming: { id: 0, window: 2 ** 32 - 1, packetSize: 262144, state: 'open' }, outgoing: { id: 0, window: Number.MAX_SAFE_INTEGER, packetSize: 262144, state: 'open' } }
              const srv = new SFTP(fake, chan, { server: true })
              sftpHandlers(srv, rootDir)
              stream.on('data', (d: Buffer) => srv.push(d))
              if (rest.length) srv.push(rest)
            })
          }
          return done(127, `${cmd}: not found\n`)
        })
      })
      client.on('tcpip', (accept: any, _reject: any, info: any) => {
        const sock = net.connect(info.destPort, info.destIP)
        const ch = accept()
        ch.pipe(sock).pipe(ch)
      })
    })
    client.on('error', () => {})
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  port = server.address().port
  echoServer = net.createServer((s) => s.pipe(s))
  await new Promise<void>((r) => echoServer.listen(0, '127.0.0.1', () => r()))
  echoPort = (echoServer.address() as net.AddressInfo).port
})

afterAll(() => {
  server?.close(); echoServer?.close()
  fs.rmSync(root, { recursive: true, force: true })
})

function setup() {
  const store = new SshVaultStore({ getKey: () => KEY, persist: false })
  const manager = new SshSessionManager({ store, logsDir: path.join(root, 'logs') })
  manager.on('hostkey', (p: any) => manager.resolveHostKey(p.requestId, true)) // auto-trust (TOFU accept)
  const cred = store.saveCredential({ label: 'dh', kind: 'password', username: 'dh', secret: 'pw' })
  const host = store.saveHost({ hostname: '127.0.0.1', port, credentialId: cred.id })
  return { store, manager, host }
}

describe('DarkHub SSH end to end', () => {
  it('opens a PTY shell, streams output and echoes input', async () => {
    const { store, manager, host } = setup()
    let out = ''
    const r = await manager.openSession({ sessionId: 'e2e1', hostId: host.id, cols: 100, rows: 30 }, (ch: string, p: any) => { if (ch === 'ssh:session:data') out += p.data })
    expect(r).toMatchObject({ ok: true })
    expect(store.findKnownHost('127.0.0.1', port)).toBeTruthy()
    manager.write(['e2e1'], 'ls\r')
    await new Promise((res) => setTimeout(res, 150))
    expect(out).toContain('welcome')
    expect(out).toContain('echo:ls')
    expect(manager.resize('e2e1', 120, 40)).toBe(true)
    manager.disposeAll()
  })

  it('rejects a wrong password with AUTH_FAILED', async () => {
    const { store, manager } = setup()
    const bad = store.saveHost({ hostname: '127.0.0.1', port, username: 'dh' })
    const r = await manager.openSession({ sessionId: 'e2e2', hostId: bad.id, password: 'nope' }, () => {})
    expect(r).toMatchObject({ ok: false, code: 'AUTH_FAILED' })
  })

  it('SFTP: lists, uploads, downloads, refuses overwrite, renames and deletes', { timeout: 30000 }, async () => {
    const { manager, host } = setup()
    const events: any[] = []
    const sftp = new SftpService({ manager, trashItem: async (p: string) => fs.rmSync(p), onProgress: (e: any) => events.push(e) })
    const opened = await sftp.open({ sftpId: 'f1', hostId: host.id })
    expect(opened.remoteCwd).toBe('/')
    const src = path.join(localDir, 'big.bin')
    const payload = crypto.randomBytes(3 * 1024 * 1024)
    fs.writeFileSync(src, payload)

    const up = await sftp.transfer({ transferId: 'u1', sftpId: 'f1', direction: 'upload', localPath: src, remotePath: '/big.bin' })
    expect(up).toMatchObject({ ok: true })
    expect(fs.readFileSync(path.join(remoteDir, 'big.bin')).equals(payload)).toBe(true)
    expect(fs.existsSync(path.join(remoteDir, 'big.bin.part'))).toBe(false)
    expect(events.at(-1)).toMatchObject({ status: 'done', totalBytes: payload.length })

    await expect(sftp.transfer({ transferId: 'u2', sftpId: 'f1', direction: 'upload', localPath: src, remotePath: '/big.bin' })).rejects.toMatchObject({ code: 'EXISTS' })

    const listing = await sftp.listRemote('f1', '/')
    expect(listing.entries.map((e: any) => e.name)).toContain('big.bin')

    const dst = path.join(localDir, 'back.bin')
    const down = await sftp.transfer({ transferId: 'd1', sftpId: 'f1', direction: 'download', localPath: dst, remotePath: '/big.bin' })
    expect(down).toMatchObject({ ok: true })
    expect(fs.readFileSync(dst).equals(payload)).toBe(true)

    await sftp.fsOp({ sftpId: 'f1', side: 'remote', op: 'mkdir', path: '/dir' })
    await sftp.fsOp({ sftpId: 'f1', side: 'remote', op: 'rename', path: '/big.bin', targetPath: '/dir/moved.bin' })
    expect(fs.existsSync(path.join(remoteDir, 'dir', 'moved.bin'))).toBe(true)
    await sftp.fsOp({ sftpId: 'f1', side: 'remote', op: 'delete', path: '/dir' })
    expect(fs.existsSync(path.join(remoteDir, 'dir'))).toBe(false)
    await expect(sftp.fsOp({ sftpId: 'f1', side: 'remote', op: 'delete', path: '/' })).rejects.toMatchObject({ code: 'VALIDATION' })
    sftp.closeAll()
    manager.disposeAll()
  })

  it('local port forwarding carries traffic and reports a busy port', async () => {
    const { store, manager, host } = setup()
    const statuses: any[] = []
    const pf = new PortForwardService({ store, manager, onStatus: (s: any) => statuses.push(s) })
    const probe = net.createServer(); await new Promise<void>((r) => probe.listen(0, '127.0.0.1', () => r()))
    const freePort = (probe.address() as net.AddressInfo).port
    await new Promise((r) => probe.close(r))
    const rule = store.saveTunnel({ hostId: host.id, kind: 'local', bindPort: freePort, targetHost: '127.0.0.1', targetPort: echoPort })
    const st = await pf.start(rule.id)
    expect(st.status).toBe('active')
    const reply = await new Promise<string>((resolve, reject) => {
      const s = net.connect(freePort, '127.0.0.1', () => s.write('ping-through-tunnel'))
      s.on('data', (d) => { resolve(d.toString()); s.end() })
      s.on('error', reject)
    })
    expect(reply).toBe('ping-through-tunnel')

    const clash = store.saveTunnel({ hostId: host.id, kind: 'dynamic', bindPort: freePort })
    await expect(pf.start(clash.id)).rejects.toMatchObject({ code: 'PORT_IN_USE' })
    pf.stopAll()
    expect(pf.status(rule.id).status).toBe('stopped')
    manager.disposeAll()
  })

  it('SFTP: uploads and downloads whole folders, with skip and overwrite policies', { timeout: 30000 }, async () => {
    const { manager, host } = setup()
    const events: any[] = []
    const sftp = new SftpService({ manager, onProgress: (e: any) => events.push(e) })
    await sftp.open({ sftpId: 'f2', hostId: host.id })
    const tree = path.join(localDir, 'site')
    fs.mkdirSync(path.join(tree, 'css', 'deep'), { recursive: true })
    fs.writeFileSync(path.join(tree, 'index.html'), '<h1>hi</h1>')
    fs.writeFileSync(path.join(tree, 'css', 'a.css'), 'body{}')
    fs.writeFileSync(path.join(tree, 'css', 'deep', 'b.css'), 'p{}')
    fs.mkdirSync(path.join(tree, 'empty'))

    const up = await sftp.transfer({ transferId: 'fu1', sftpId: 'f2', direction: 'upload', localPath: tree, remotePath: '/site' })
    expect(up).toMatchObject({ ok: true, filesDone: 3 })
    expect(fs.readFileSync(path.join(remoteDir, 'site', 'css', 'deep', 'b.css'), 'utf8')).toBe('p{}')
    expect(fs.existsSync(path.join(remoteDir, 'site', 'empty'))).toBe(true)
    expect(events.at(-1)).toMatchObject({ status: 'done', isDir: true, filesTotal: 3, filesDone: 3 })

    // existing folder: fail by default, then merge skipping or overwriting
    await expect(sftp.transfer({ transferId: 'fu2', sftpId: 'f2', direction: 'upload', localPath: tree, remotePath: '/site' })).rejects.toMatchObject({ code: 'EXISTS', isDir: true })
    fs.writeFileSync(path.join(tree, 'index.html'), '<h1>v2</h1>')
    fs.writeFileSync(path.join(tree, 'new.txt'), 'new')
    const skip = await sftp.transfer({ transferId: 'fu3', sftpId: 'f2', direction: 'upload', localPath: tree, remotePath: '/site', conflict: 'skip' })
    expect(skip).toMatchObject({ ok: true, filesDone: 1, filesSkipped: 3 })
    expect(fs.readFileSync(path.join(remoteDir, 'site', 'index.html'), 'utf8')).toBe('<h1>hi</h1>')
    const over = await sftp.transfer({ transferId: 'fu4', sftpId: 'f2', direction: 'upload', localPath: tree, remotePath: '/site', conflict: 'overwrite' })
    expect(over).toMatchObject({ ok: true, filesDone: 4 })
    expect(fs.readFileSync(path.join(remoteDir, 'site', 'index.html'), 'utf8')).toBe('<h1>v2</h1>')

    const back = path.join(localDir, 'site-copy')
    const down = await sftp.transfer({ transferId: 'fd1', sftpId: 'f2', direction: 'download', localPath: back, remotePath: '/site' })
    expect(down).toMatchObject({ ok: true, filesDone: 4 })
    expect(fs.readFileSync(path.join(back, 'css', 'deep', 'b.css'), 'utf8')).toBe('p{}')
    expect(fs.existsSync(path.join(back, 'empty'))).toBe(true)
    expect(await sftp.du({ sftpId: 'f2', side: 'remote', path: '/site' })).toMatchObject({ files: 4, dirs: 3 })
    sftp.closeAll()
    manager.disposeAll()
  })

  it('editor: reads and saves remote text atomically, keeps CRLF, detects conflicts and binaries', async () => {
    const { manager, host } = setup()
    const sftp = new SftpService({ manager })
    await sftp.open({ sftpId: 'f3', hostId: host.id })
    fs.writeFileSync(path.join(remoteDir, 'nginx.conf'), 'server {\r\n  listen 80;\r\n}\r\n')
    const f = await sftp.readText({ sftpId: 'f3', side: 'remote', path: '/nginx.conf' })
    expect(f).toMatchObject({ eol: 'crlf', encoding: 'utf-8', content: 'server {\n  listen 80;\n}\n' })
    const saved = await sftp.writeText({ sftpId: 'f3', side: 'remote', path: '/nginx.conf', content: f.content.replace('80', '8080'), eol: f.eol, encoding: f.encoding, expectedMtimeMs: f.mtimeMs, expectedSize: f.size })
    expect(fs.readFileSync(path.join(remoteDir, 'nginx.conf'), 'utf8')).toBe('server {\r\n  listen 8080;\r\n}\r\n')
    expect(fs.readdirSync(remoteDir).filter((n) => n.includes('darkhub'))).toEqual([])

    // someone else edits the file: saving with the old mtime/size is refused unless forced
    fs.writeFileSync(path.join(remoteDir, 'nginx.conf'), 'changed elsewhere, longer content')
    await expect(sftp.writeText({ sftpId: 'f3', side: 'remote', path: '/nginx.conf', content: 'mine', expectedMtimeMs: saved.mtimeMs, expectedSize: saved.size })).rejects.toMatchObject({ code: 'CONFLICT' })
    await sftp.writeText({ sftpId: 'f3', side: 'remote', path: '/nginx.conf', content: 'mine', force: true })
    expect(fs.readFileSync(path.join(remoteDir, 'nginx.conf'), 'utf8')).toBe('mine')

    // new file + binary refusal
    await sftp.writeText({ sftpId: 'f3', side: 'remote', path: '/new.sh', content: 'echo hi\n', create: true })
    await expect(sftp.writeText({ sftpId: 'f3', side: 'remote', path: '/new.sh', content: 'x', create: true })).rejects.toMatchObject({ code: 'EXISTS' })
    fs.writeFileSync(path.join(remoteDir, 'blob.bin'), Buffer.from([1, 2, 0, 3]))
    await expect(sftp.readText({ sftpId: 'f3', side: 'remote', path: '/blob.bin' })).rejects.toMatchObject({ code: 'BINARY' })
    await sftp.fsOp({ sftpId: 'f3', side: 'remote', op: 'touch', path: '/empty.txt' })
    expect(fs.statSync(path.join(remoteDir, 'empty.txt')).size).toBe(0)
    sftp.closeAll()
    manager.disposeAll()
  })

  it('edit locally: downloads to a temp file and re-uploads on save', async () => {
    const { manager, host } = setup()
    const watch: any[] = []
    const sftp = new SftpService({ manager, openPath: async () => '', onWatch: (e: any) => watch.push(e), tempDir: path.join(root, 'edit-tmp') })
    await sftp.open({ sftpId: 'f4', hostId: host.id })
    fs.writeFileSync(path.join(remoteDir, 'app.env'), 'A=1\n')
    const { watchId, localPath } = await sftp.editExternal({ sftpId: 'f4', path: '/app.env' })
    expect(fs.readFileSync(localPath, 'utf8')).toBe('A=1\n')
    await new Promise((r) => setTimeout(r, 50))
    fs.writeFileSync(localPath, 'A=2\n')
    fs.utimesSync(localPath, new Date(), new Date(Date.now() + 5000))
    await vi.waitFor(() => expect(watch.some((e) => e.status === 'uploaded')).toBe(true), { timeout: 5000 })
    expect(fs.readFileSync(path.join(remoteDir, 'app.env'), 'utf8')).toBe('A=2\n')
    expect(sftp.stopWatch(watchId)).toBe(true)
    sftp.closeAll()
    manager.disposeAll()
  })

  it('keyboard-interactive 2FA prompts reach the UI and the answers log in', async () => {
    const { store, manager } = setup()
    const h = store.saveHost({ hostname: '127.0.0.1', port, username: 'otp' })
    const asked: any[] = []
    manager.on('auth', (p: any) => { asked.push(p); manager.resolveAuthPrompt(p.requestId, ['pw', '123456']) })
    const r = await manager.openSession({ sessionId: 'otp1', hostId: h.id }, () => {})
    expect(r).toMatchObject({ ok: true })
    expect(asked[0].prompts).toEqual([{ prompt: 'Password: ', echo: false }, { prompt: 'Verification code: ', echo: true }])
    manager.disposeAll()
  })

  it('writes a readable session transcript when logging is on', async () => {
    const { store, manager, host } = setup()
    store.saveHost({ ...host, logSession: true })
    const r = await manager.openSession({ sessionId: 'log1', hostId: host.id }, () => {})
    expect(r.ok).toBe(true)
    manager.write(['log1'], 'whoami\r')
    await new Promise((res) => setTimeout(res, 150))
    const file = manager.listSessions()[0].logFile
    manager.disposeAll()
    await new Promise((res) => setTimeout(res, 100))
    const text = fs.readFileSync(file, 'utf8')
    expect(text).toContain('welcome')
    expect(text).toContain('echo:whoami')
    expect(text).not.toMatch(/\x1b/)
    expect(store.getState().sessionLogs[0].logFilePath).toBe(file)
  })

  it('root mode: SFTP through sudo sftp-server, asking for the sudo password', { timeout: 30000 }, async () => {
    const { manager, host } = setup()
    const sftp = new SftpService({ manager })
    // login password "pw" is not the sudo password
    await expect(sftp.open({ sftpId: 'r1', hostId: host.id, root: true })).rejects.toMatchObject({ code: 'SUDO_PASSWORD' })
    await expect(sftp.open({ sftpId: 'r1', hostId: host.id, root: true, sudoPassword: 'nope' })).rejects.toMatchObject({ code: 'SUDO_PASSWORD' })
    const r = await sftp.open({ sftpId: 'r1', hostId: host.id, root: true, sudoPassword: 'rootpw' })
    expect(r.root).toBe(true)
    const list = await sftp.listRemote('r1', '/etc')
    expect(list.entries.map((e: any) => e.name)).toContain('shadow')
    const f = await sftp.readText({ sftpId: 'r1', side: 'remote', path: '/etc/shadow' })
    expect(f.content).toContain('root:')
    await sftp.writeText({ sftpId: 'r1', side: 'remote', path: '/etc/motd', content: 'hello from root\n', create: true })
    expect(fs.readFileSync(path.join(rootDir, 'etc', 'motd'), 'utf8')).toBe('hello from root\n')
    const src = path.join(localDir, 'root-up.txt')
    fs.writeFileSync(src, 'x'.repeat(200_000))
    expect(await sftp.transfer({ transferId: 'ru1', sftpId: 'r1', direction: 'upload', localPath: src, remotePath: '/etc/root-up.txt' })).toMatchObject({ ok: true })
    expect(fs.statSync(path.join(rootDir, 'etc', 'root-up.txt')).size).toBe(200_000)
    // the normal (non-root) session of the same host does not see the root-only folder
    await sftp.open({ sftpId: 'u1', hostId: host.id })
    expect((await sftp.listRemote('u1', '/')).entries.map((e: any) => e.name)).not.toContain('etc')
    sftp.closeAll()
    manager.disposeAll()
  })
})
