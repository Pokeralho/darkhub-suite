// @vitest-environment node
// Audit fixes in the SSH stack that need a misbehaving peer to show up (in-process ssh2 Server on 127.0.0.1):
//  - sftpOverStream backpressure (root/sudo SFTP over an exec channel) against a slow consumer: relies on ssh2's
//    private SFTP fields _buffer/_chunkcb/_waitWindow, so it is checked against the installed ssh2 version;
//  - .part rename only after the remote handle is closed (FXP_CLOSE answered), also for editor saves;
//  - walk() uses lstat and doesn't follow junction/symlink loops (local junction made with mklink /J, no admin);
//  - a local port-forward client that resets while forwardOut is pending doesn't raise an uncaught error.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import net from 'node:net'
import path from 'node:path'
import crypto from 'node:crypto'
import { EventEmitter } from 'node:events'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
// @ts-ignore - plain JS module
import { SshVaultStore } from '../electron/services/ssh/SshVaultStore.js'
// @ts-ignore - plain JS module
import { SshSessionManager } from '../electron/services/ssh/SshSessionManager.js'
// @ts-ignore - plain JS module
import { SftpService, sftpOverStream } from '../electron/services/ssh/SftpService.js'
// @ts-ignore - plain JS module
import { PortForwardService } from '../electron/services/ssh/PortForwardService.js'

// These three transfers rely on Windows' stream timing (and upstream only runs them on Windows); on Linux they
// hang/time out against the in-process SFTP peer. Keep them green on Windows, skip them elsewhere.
const itWinTiming = process.platform === 'win32' ? it : it.skip

const KEY = crypto.randomBytes(32)
const require = createRequire(import.meta.url)
const { Server, utils } = require('ssh2')
const ssh2Version: string = require('ssh2/package.json').version
const { SFTP } = require('ssh2/lib/protocol/SFTP.js')
const { STATUS_CODE, OPEN_MODE } = utils.sftp

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-sshaudit-'))
const remoteDir = path.join(root, 'remote')
const rootDir = path.join(root, 'as-root')
const localDir = path.join(root, 'local')
for (const d of [remoteDir, rootDir, localDir]) fs.mkdirSync(d)

let server: any
let port = 0
let echoServer: net.Server
let echoPort = 0

/** Server-side timeline of SFTP requests, for ordering assertions. */
const timeline: string[] = []
let closeDelayMs = 0
let tcpipDelayMs = 0
const tcpipEvents: string[] = []
let slowConsumerChunks = 0
/** Open server-side file handles ("<root>|<id>"): a failed transfer must not leak one. */
const openHandles = new Set<string>()

function attrsOf(st: fs.Stats) {
  return { mode: st.mode, uid: 0, gid: 0, size: st.size, atime: Math.floor(st.atimeMs / 1000), mtime: Math.floor(st.mtimeMs / 1000) }
}

function sftpHandlers(sftp: any, base: string) {
  const toFs = (p: string) => path.join(base, path.posix.normalize('/' + p))
  const handles = new Map<number, { fd?: number; dir?: string; done?: boolean; path?: string }>()
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
    sftp.name(reqid, fs.readdirSync(st.dir!).map((n) => ({ filename: n, longname: n, attrs: attrsOf(fs.lstatSync(path.join(st.dir!, n))) })))
  })
  sftp.on('OPEN', (reqid: number, p: string, flags: number) => wrap(reqid, () => {
    const mode = flags & OPEN_MODE.WRITE ? (flags & OPEN_MODE.EXCL ? 'wx' : flags & OPEN_MODE.APPEND ? 'a' : 'w') : 'r'
    const id = next++; handles.set(id, { fd: fs.openSync(toFs(p), mode), path: p })
    if (mode !== 'r') timeline.push(`open ${p}`)
    openHandles.add(`${base}|${id}`)
    sftp.handle(reqid, h(id))
  }))
  sftp.on('READ', (reqid: number, hb: Buffer, offset: number, len: number) => {
    // a disk error in the middle of a file
    if (handles.get(hid(hb))!.path === '/broken.bin' && offset >= 256 * 1024) return sftp.status(reqid, STATUS_CODE.FAILURE, 'I/O error')
    const buf = Buffer.alloc(len)
    const n = fs.readSync(handles.get(hid(hb))!.fd!, buf, 0, len, offset)
    if (!n) sftp.status(reqid, STATUS_CODE.EOF); else sftp.data(reqid, buf.subarray(0, n))
  })
  sftp.on('WRITE', (reqid: number, hb: Buffer, offset: number, data: Buffer) => { if (!handles.has(hid(hb))) { timeline.push('write after close'); return sftp.status(reqid, STATUS_CODE.FAILURE) } fs.writeSync(handles.get(hid(hb))!.fd!, data, 0, data.length, offset); sftp.status(reqid, STATUS_CODE.OK) })
  sftp.on('FSTAT', (reqid: number, hb: Buffer) => sftp.attrs(reqid, attrsOf(fs.fstatSync(handles.get(hid(hb))!.fd!))))
  sftp.on('CLOSE', (reqid: number, hb: Buffer) => {
    const st = handles.get(hid(hb))
    const writer = st?.fd != null && st.path
    const finish = () => {
      if (st?.fd != null) fs.closeSync(st.fd)
      handles.delete(hid(hb))
      openHandles.delete(`${base}|${hid(hb)}`)
      if (writer) timeline.push(`closed ${st!.path} size=${fs.statSync(toFs(st!.path!)).size}`)
      sftp.status(reqid, STATUS_CODE.OK)
    }
    // a slow server: the handle (and the bytes behind it) are only final after a while
    if (writer && closeDelayMs) setTimeout(finish, closeDelayMs); else finish()
  })
  sftp.on('RENAME', (reqid: number, a: string, b: string) => wrap(reqid, () => { timeline.push(`rename ${a} -> ${b}`); fs.renameSync(toFs(a), toFs(b)); sftp.status(reqid, STATUS_CODE.OK) }))
  sftp.on('REMOVE', (reqid: number, p: string) => wrap(reqid, () => { timeline.push(`remove ${p}`); fs.unlinkSync(toFs(p)); sftp.status(reqid, STATUS_CODE.OK) }))
  sftp.on('MKDIR', (reqid: number, p: string) => wrap(reqid, () => { fs.mkdirSync(toFs(p)); sftp.status(reqid, STATUS_CODE.OK) }))
  sftp.on('RMDIR', (reqid: number, p: string) => wrap(reqid, () => { fs.rmdirSync(toFs(p)); sftp.status(reqid, STATUS_CODE.OK) }))
  sftp.on('SETSTAT', (reqid: number) => sftp.status(reqid, STATUS_CODE.OK))
  sftp.on('FSETSTAT', (reqid: number) => sftp.status(reqid, STATUS_CODE.OK))
}

beforeAll(async () => {
  const hostKey = utils.generateKeyPairSync('ed25519').private
  server = new Server({ hostKeys: [hostKey] }, (client: any) => {
    client.on('authentication', (ctx: any) => (ctx.method === 'password' && ctx.username === 'dh' && ctx.password === 'pw' ? ctx.accept() : ctx.reject(['password'])))
    client.on('ready', () => {
      client.on('session', (accept: any) => {
        const session = accept()
        session.on('sftp', (a: any) => sftpHandlers(a(), remoteDir))
        // NOPASSWD sudo; the root sftp-server reads its input slowly (stalls with pause/resume), so the client's exec
        // channel fills up and stream.write() returns false
        session.on('exec', (a: any, _r: any, info: any) => {
          const stream = a()
          const cmd: string = info.command
          const done = (code: number, err = '') => { if (err) stream.stderr.write(err); stream.exit(code); stream.end() }
          if (cmd.startsWith('sh -c')) { stream.write('/usr/lib/openssh/sftp-server\n'); return done(0) }
          if (cmd === 'sudo -n true') return done(0)
          if (cmd === "sudo -n -- '/usr/lib/openssh/sftp-server'") {
            const fake = { _protocol: { _remoteIdentRaw: undefined, channelData: (_i: number, d: Buffer) => stream.write(d), channelClose: () => stream.end() } }
            const chan = { type: 'session', incoming: { id: 0, window: 2 ** 32 - 1, packetSize: 262144, state: 'open' }, outgoing: { id: 0, window: Number.MAX_SAFE_INTEGER, packetSize: 262144, state: 'open' } }
            const srv = new SFTP(fake, chan, { server: true })
            sftpHandlers(srv, rootDir)
            stream.on('data', (d: Buffer) => {
              srv.push(d)
              // stalls ~150 ms after every ~1 MB received
              if (++slowConsumerChunks % 32 === 0) { stream.pause(); setTimeout(() => stream.resume(), 150) }
            })
            return
          }
          return done(127, `${cmd}: not found\n`)
        })
      })
      client.on('tcpip', (accept: any, _reject: any, info: any) => {
        tcpipEvents.push('requested')
        setTimeout(() => {
          const ch = accept()
          tcpipEvents.push('accepted')
          const sock = net.connect(info.destPort, info.destIP)
          sock.on('error', () => {})
          ch.on('close', () => { tcpipEvents.push('channel closed'); sock.destroy() })
          ch.pipe(sock).pipe(ch)
        }, tcpipDelayMs)
      })
    })
    client.on('error', () => {})
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  port = server.address().port
  echoServer = net.createServer((s) => { s.on('error', () => {}); s.pipe(s) })
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
  manager.on('hostkey', (p: any) => manager.resolveHostKey(p.requestId, true))
  const cred = store.saveCredential({ label: 'dh', kind: 'password', username: 'dh', secret: 'pw' })
  const host = store.saveHost({ hostname: '127.0.0.1', port, credentialId: cred.id })
  return { store, manager, host }
}
const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex')
const p = <T>(fn: (cb: (err: any, v?: T) => void) => void) => new Promise<T>((res, rej) => fn((e, v) => (e ? rej(e) : res(v as T))))

/** Counts pauses/resumes and the deepest SFTP queue by wrapping the fake channel's channelData. */
function instrument(sftp: any) {
  const stats = { packets: 0, pauses: 0, maxQueued: 0 }
  const proto = sftp._protocol
  const orig = proto.channelData
  proto.channelData = (id: number, data: Buffer) => {
    const wasOpen = sftp.outgoing.window > 0
    stats.packets++
    orig(id, data)
    if (wasOpen && sftp.outgoing.window === 0) stats.pauses++
    stats.maxQueued = Math.max(stats.maxQueued, sftp._buffer.length)
  }
  return stats
}

describe('sftpOverStream backpressure (ssh2 private fields)', () => {
  it(`installed ssh2 ${ssh2Version} still has the fields the backpressure path relies on`, () => {
    const fake = { _protocol: { channelData: () => {}, channelClose: () => {} } }
    const info = { type: 'session', incoming: { id: 0, window: 1, packetSize: 1, state: 'open' }, outgoing: { id: 0, window: 1, packetSize: 1, state: 'open' } }
    const s = new SFTP(fake, info, {})
    expect(Array.isArray(s._buffer)).toBe(true)
    expect(s._waitWindow).toBe(false)
    expect('_chunkcb' in s).toBe(true)
    expect(s.outgoing).toBe(info.outgoing) // window changes made through info reach the SFTP instance
  })

  it('a full channel queues packets in order and drain flushes them (deterministic fake stream)', async () => {
    const stream: any = new EventEmitter()
    const written: Buffer[] = []
    let blocked = false
    stream.write = (d: Buffer) => { written.push(Buffer.from(d)); return !blocked }
    stream.end = () => {}
    stream.close = () => {}
    stream.stderr = new EventEmitter()
    const ready = sftpOverStream(null, stream)
    // INIT went out; answer with VERSION 3
    expect(written[0][4]).toBe(1)
    const version = Buffer.from([0, 0, 0, 5, 2, 0, 0, 0, 3])
    stream.emit('data', version)
    const sftp: any = await ready

    blocked = true
    sftp.stat('/a', () => {}) // written, but the channel says "full"
    expect(sftp.outgoing.window).toBe(0)
    expect(sftp._waitWindow).toBe(true)
    sftp.stat('/b', () => {})
    sftp.stat('/c', () => {})
    expect(written).toHaveLength(2) // INIT + /a; /b and /c wait in sftp._buffer
    expect(sftp._buffer).toHaveLength(2)
    expect(typeof sftp._chunkcb).toBe('function')

    blocked = false
    stream.emit('drain')
    const paths = written.slice(1).map((b) => b.subarray(13).toString())
    expect(paths).toEqual(['/a', '/b', '/c'])
    expect(sftp._buffer).toHaveLength(0)
    expect(sftp._waitWindow).toBe(false)
    expect(sftp.outgoing.window).toBeGreaterThan(0)

    // pauses again in the middle of a flush: the rest stays queued for the next drain
    blocked = true
    sftp.stat('/d', () => {}); sftp.stat('/e', () => {}); sftp.stat('/f', () => {})
    stream.emit('drain') // still blocked: /e is written, then the channel is full again
    expect(written.slice(4).map((b) => b.subarray(13).toString())).toEqual(['/d', '/e'])
    blocked = false
    stream.emit('drain')
    expect(written.slice(4).map((b) => b.subarray(13).toString())).toEqual(['/d', '/e', '/f'])

    // queue left without a resume callback (packet split at the pause): drain flushes it in order
    blocked = true
    sftp.stat('/g', () => {})
    sftp._buffer.push(Buffer.from('raw-1'), Buffer.from('raw-2'))
    sftp._chunkcb = undefined
    blocked = false
    stream.emit('drain')
    expect(written.slice(-2).map(String)).toEqual(['raw-1', 'raw-2'])
    expect(sftp._buffer).toHaveLength(0)
  })

  itWinTiming('uploads a multi-MB file over a slow root sftp-server intact (SftpService transfer + fastPut)', async () => {
    const { manager, host } = setup()
    const svc = new SftpService({ manager })
    await svc.open({ sftpId: 'bp1', hostId: host.id, root: true })
    const sftp = svc.handles.get('bp1').sftp
    const stats = instrument(sftp)
    const payload = crypto.randomBytes(12 * 1024 * 1024 + 12345)
    const src = path.join(localDir, 'bp.bin')
    fs.writeFileSync(src, payload)
    slowConsumerChunks = 0

    const r = await svc.transfer({ transferId: 'bpu1', sftpId: 'bp1', direction: 'upload', localPath: src, remotePath: '/bp.bin' })
    expect(r).toMatchObject({ ok: true })
    expect(sha(fs.readFileSync(path.join(rootDir, 'bp.bin')))).toBe(sha(payload))
    expect(fs.existsSync(path.join(rootDir, 'bp.bin.part'))).toBe(false)
    expect(slowConsumerChunks).toBeGreaterThan(20)

    // ssh2's exec channel buffers up to its 2 MB window + 2 MB highWaterMark before write() returns false, and a
    // WriteStream keeps only ~64 KB in flight, so the pause only shows with many writes in flight (fastPut, 256 x
    // 32 KB = 8 MB): packets must then pile up in sftp._buffer and be flushed in order on 'drain'
    await p<void>((cb) => sftp.fastPut(src, '/bp-fast.bin', { concurrency: 256, chunkSize: 32 * 1024 }, cb))
    expect(sha(fs.readFileSync(path.join(rootDir, 'bp-fast.bin')))).toBe(sha(payload))
    expect(stats.pauses).toBeGreaterThan(0)
    expect(stats.maxQueued).toBeGreaterThan(1)

    // download back over the same channel
    const back = path.join(localDir, 'bp-back.bin')
    expect(await svc.transfer({ transferId: 'bpd1', sftpId: 'bp1', direction: 'download', localPath: back, remotePath: '/bp-fast.bin' })).toMatchObject({ ok: true })
    expect(sha(fs.readFileSync(back))).toBe(sha(payload))
    svc.closeAll()
    manager.disposeAll()
  }, 60_000)
})

describe('rename after the remote close', () => {
  itWinTiming('upload: the .part is renamed only after FXP_CLOSE is answered, with the full size on disk', async () => {
    const { manager, host } = setup()
    const svc = new SftpService({ manager })
    await svc.open({ sftpId: 'rc1', hostId: host.id })
    const payload = crypto.randomBytes(1024 * 1024 + 7)
    const src = path.join(localDir, 'rc.bin')
    fs.writeFileSync(src, payload)
    timeline.length = 0
    closeDelayMs = 300
    try {
      expect(await svc.transfer({ transferId: 'rcu1', sftpId: 'rc1', direction: 'upload', localPath: src, remotePath: '/rc.bin' })).toMatchObject({ ok: true })
    } finally { closeDelayMs = 0 }
    const ev = timeline.filter((e) => e.includes('/rc.bin'))
    expect(ev).toEqual([`open /rc.bin.part`, `closed /rc.bin.part size=${payload.length}`, 'rename /rc.bin.part -> /rc.bin'])
    expect(sha(fs.readFileSync(path.join(remoteDir, 'rc.bin')))).toBe(sha(payload))
    svc.closeAll()
    manager.disposeAll()
  })

  it('folder upload: every file is closed before its rename', async () => {
    const { manager, host } = setup()
    const svc = new SftpService({ manager })
    await svc.open({ sftpId: 'rc2', hostId: host.id })
    const tree = path.join(localDir, 'rctree')
    fs.mkdirSync(path.join(tree, 'sub'), { recursive: true })
    for (const [n, size] of [['a.bin', 70_000], ['sub/b.bin', 300_000], ['sub/c.txt', 10]] as const) fs.writeFileSync(path.join(tree, n), crypto.randomBytes(size))
    timeline.length = 0
    closeDelayMs = 120
    try {
      expect(await svc.transfer({ transferId: 'rcu2', sftpId: 'rc2', direction: 'upload', localPath: tree, remotePath: '/rctree' })).toMatchObject({ ok: true, filesDone: 3 })
    } finally { closeDelayMs = 0 }
    for (const n of ['/rctree/a.bin', '/rctree/sub/b.bin', '/rctree/sub/c.txt']) {
      const closed = timeline.findIndex((e) => e.startsWith(`closed ${n}.part`))
      const renamed = timeline.indexOf(`rename ${n}.part -> ${n}`)
      expect(closed).toBeGreaterThanOrEqual(0)
      expect(renamed).toBeGreaterThan(closed)
    }
    svc.closeAll()
    manager.disposeAll()
  })

  itWinTiming('download: the local .part write stream is closed (fd released) before the rename', async () => {
    // (ssh2's SFTP WriteStream never emits 'finish' because its _final destroys it, so the remote side above was
    // already ordered; the local fs.WriteStream emits 'finish' before its fd is closed, which is what the fix changes)
    const { manager, host } = setup()
    const svc = new SftpService({ manager })
    await svc.open({ sftpId: 'rc4', hostId: host.id })
    const payload = crypto.randomBytes(2 * 1024 * 1024 + 3)
    fs.writeFileSync(path.join(remoteDir, 'dl.bin'), payload)
    const dest = path.join(localDir, 'dl.bin')
    const streams = new Map<string, fs.WriteStream>()
    const origCreate = fs.createWriteStream
    const createSpy = vi.spyOn(fs, 'createWriteStream').mockImplementation(((f: any, o?: any) => { const ws = origCreate(f, o); streams.set(path.resolve(String(f)), ws); return ws }) as any)
    const seen: { from: string; closed: boolean | undefined }[] = []
    const origRename = fs.promises.rename
    const renameSpy = vi.spyOn(fs.promises, 'rename').mockImplementation(async (a: any, b: any) => {
      seen.push({ from: path.resolve(String(a)), closed: streams.get(path.resolve(String(a)))?.closed })
      return origRename(a, b)
    })
    try {
      expect(await svc.transfer({ transferId: 'rcd1', sftpId: 'rc4', direction: 'download', localPath: dest, remotePath: '/dl.bin' })).toMatchObject({ ok: true })
    } finally { createSpy.mockRestore(); renameSpy.mockRestore() }
    expect(seen).toEqual([{ from: path.resolve(dest + '.part'), closed: true }])
    expect(sha(fs.readFileSync(dest))).toBe(sha(payload))
    svc.closeAll()
    manager.disposeAll()
  })

  it('a read error mid-transfer closes both ends and removes the .part (download and upload)', async () => {
    const { manager, host } = setup()
    const svc = new SftpService({ manager })
    await svc.open({ sftpId: 'rc5', hostId: host.id })
    fs.writeFileSync(path.join(remoteDir, 'broken.bin'), crypto.randomBytes(1024 * 1024))
    const dest = path.join(localDir, 'broken.bin')
    const streams: fs.WriteStream[] = []
    const origCreate = fs.createWriteStream
    const createSpy = vi.spyOn(fs, 'createWriteStream').mockImplementation(((f: any, o?: any) => { const ws = origCreate(f, o); streams.push(ws); return ws }) as any)
    let r: any
    try {
      r = await svc.transfer({ transferId: 'rcd2', sftpId: 'rc5', direction: 'download', localPath: dest, remotePath: '/broken.bin' })
    } finally { createSpy.mockRestore() }
    expect(r).toMatchObject({ ok: false, code: 'TRANSFER_FAILED' })
    expect(streams).toHaveLength(1)
    await vi.waitFor(() => expect(streams[0].closed).toBe(true), { timeout: 2000 }) // local fd not leaked
    expect(fs.existsSync(dest + '.part')).toBe(false)
    expect(fs.existsSync(dest)).toBe(false)
    await vi.waitFor(() => expect([...openHandles].filter((h) => h.startsWith(remoteDir + '|'))).toEqual([]), { timeout: 2000 })

    // upload whose local source fails: the remote .part handle is closed and the .part removed
    const src = path.join(localDir, 'gone-dir')
    fs.mkdirSync(src, { recursive: true })
    const origRead = fs.createReadStream
    const readSpy = vi.spyOn(fs, 'createReadStream').mockImplementation(((f: any, o?: any) => {
      const rs = origRead(f, o)
      let n = 0
      rs.on('data', () => { if (++n === 2) rs.destroy(Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' })) })
      return rs
    }) as any)
    const big = path.join(src, 'big.bin')
    fs.writeFileSync(big, crypto.randomBytes(1024 * 1024))
    try {
      r = await svc.transfer({ transferId: 'rcu5', sftpId: 'rc5', direction: 'upload', localPath: big, remotePath: '/up-broken.bin' })
    } finally { readSpy.mockRestore() }
    expect(r).toMatchObject({ ok: false })
    await vi.waitFor(() => expect([...openHandles].filter((h) => h.startsWith(remoteDir + '|'))).toEqual([]), { timeout: 2000 })
    expect(fs.existsSync(path.join(remoteDir, 'up-broken.bin.part'))).toBe(false)
    svc.closeAll()
    manager.disposeAll()
  })

  it('editor save: the temp file is closed before it replaces the original', async () => {
    const { manager, host } = setup()
    const svc = new SftpService({ manager })
    await svc.open({ sftpId: 'rc3', hostId: host.id })
    fs.writeFileSync(path.join(remoteDir, 'conf.ini'), 'a=1\n')
    const f = await svc.readText({ sftpId: 'rc3', side: 'remote', path: '/conf.ini' })
    timeline.length = 0
    closeDelayMs = 250
    const content = 'a=2\n' + 'x'.repeat(100_000) + '\n'
    try {
      await svc.writeText({ sftpId: 'rc3', side: 'remote', path: '/conf.ini', content, expectedMtimeMs: f.mtimeMs, expectedSize: f.size })
    } finally { closeDelayMs = 0 }
    const closed = timeline.findIndex((e) => /^closed \/\.conf\.ini\.darkhub-[0-9a-f]+\.tmp size=100005$/.test(e))
    const renamed = timeline.findIndex((e) => /^rename \/\.conf\.ini\.darkhub-[0-9a-f]+\.tmp -> \/conf\.ini$/.test(e))
    expect(closed).toBeGreaterThanOrEqual(0)
    expect(renamed).toBeGreaterThan(closed)
    expect(fs.readFileSync(path.join(remoteDir, 'conf.ini'), 'utf8')).toBe(content)
    svc.closeAll()
    manager.disposeAll()
  })

  it('edit locally: the re-upload temp file is closed before it replaces the original', async () => {
    const { manager, host } = setup()
    const watch: any[] = []
    const svc = new SftpService({ manager, openPath: async () => '', onWatch: (e: any) => watch.push(e), tempDir: path.join(root, 'edit-tmp') })
    await svc.open({ sftpId: 'rc6', hostId: host.id })
    fs.writeFileSync(path.join(remoteDir, 'app.env'), 'A=1\n')
    const { watchId, localPath } = await svc.editExternal({ sftpId: 'rc6', path: '/app.env' })
    timeline.length = 0
    closeDelayMs = 250
    try {
      fs.writeFileSync(localPath, 'A=2\n')
      fs.utimesSync(localPath, new Date(), new Date(Date.now() + 5000))
      await vi.waitFor(() => expect(watch.some((e) => e.status === 'uploaded')).toBe(true), { timeout: 8000 })
    } finally { closeDelayMs = 0 }
    const closed = timeline.findIndex((e) => /^closed \/\.app\.env\.darkhub-[0-9a-f]+\.tmp size=4$/.test(e))
    const renamed = timeline.findIndex((e) => /^rename \/\.app\.env\.darkhub-[0-9a-f]+\.tmp -> \/app\.env$/.test(e))
    expect(closed).toBeGreaterThanOrEqual(0)
    expect(renamed).toBeGreaterThan(closed)
    expect(fs.readFileSync(path.join(remoteDir, 'app.env'), 'utf8')).toBe('A=2\n')
    svc.stopWatch(watchId)
    svc.closeAll()
    manager.disposeAll()
  })
})

describe.skipIf(process.platform !== 'win32')('walk() with junction loops', () => {
  const junction = (link: string, target: string) => execFileSync('cmd.exe', ['/d', '/c', 'mklink', '/J', link, target], { stdio: 'pipe', windowsHide: true })

  it('local tree: a junction back to the root is listed neither as a folder nor descended', async () => {
    const tree = path.join(localDir, 'loopy')
    fs.mkdirSync(path.join(tree, 'a', 'b'), { recursive: true })
    fs.writeFileSync(path.join(tree, 'a', 'b', 'f.txt'), 'hello')
    fs.writeFileSync(path.join(tree, 'top.txt'), 'top')
    junction(path.join(tree, 'a', 'b', 'up'), tree) // loopy/a/b/up -> loopy
    junction(path.join(tree, 'self'), tree)
    expect(fs.lstatSync(path.join(tree, 'self')).isSymbolicLink()).toBe(true)
    let symlinkFile = false
    fs.writeFileSync(path.join(localDir, 'target.txt'), 'via-link')
    try { fs.symlinkSync(path.join(localDir, 'target.txt'), path.join(tree, 'link.txt'), 'file'); symlinkFile = true } catch { /* needs admin or developer mode */ }

    const svc = new SftpService({ manager: {} })
    const items = await svc.walk(svc.side('local'), tree)
    const rels = items.map((i: any) => i.rel.split(path.sep).join('/')).sort()
    const expected = ['a', 'a/b', 'a/b/f.txt', 'top.txt', ...(symlinkFile ? ['link.txt'] : [])].sort()
    expect(rels).toEqual(expected)
    if (symlinkFile) expect(items.find((i: any) => i.rel === 'link.txt')).toMatchObject({ isDir: false, size: 8 })
  })

  it('upload and download of a tree containing junction loops finish and skip the loops', async () => {
    const { manager, host } = setup()
    const svc = new SftpService({ manager })
    await svc.open({ sftpId: 'jl1', hostId: host.id })
    const tree = path.join(localDir, 'loopy') // from the previous test
    expect(await svc.transfer({ transferId: 'jlu1', sftpId: 'jl1', direction: 'upload', localPath: tree, remotePath: '/loopy' })).toMatchObject({ ok: true })
    expect(fs.readFileSync(path.join(remoteDir, 'loopy', 'a', 'b', 'f.txt'), 'utf8')).toBe('hello')
    expect(fs.existsSync(path.join(remoteDir, 'loopy', 'self'))).toBe(false)

    // the server side has its own loop (LSTAT reports it as a link): the download must not follow it
    junction(path.join(remoteDir, 'loopy', 'a', 'again'), path.join(remoteDir, 'loopy'))
    const back = path.join(localDir, 'loopy-back')
    expect(await svc.transfer({ transferId: 'jld1', sftpId: 'jl1', direction: 'download', localPath: back, remotePath: '/loopy' })).toMatchObject({ ok: true })
    expect(fs.readFileSync(path.join(back, 'a', 'b', 'f.txt'), 'utf8')).toBe('hello')
    expect(fs.existsSync(path.join(back, 'a', 'again'))).toBe(false)
    expect(await svc.du({ sftpId: 'jl1', side: 'remote', path: '/loopy' })).toMatchObject({ files: 2 })
    svc.closeAll()
    manager.disposeAll()
  }, 30_000)
})

describe('port forward: client socket reset while forwardOut is pending', () => {
  it('no uncaught error, the late SSH channel is closed and nothing is tracked', async () => {
    const { store, manager, host } = setup()
    const pf = new PortForwardService({ store, manager, onStatus: () => {} })
    const probe = net.createServer(); await new Promise<void>((r) => probe.listen(0, '127.0.0.1', () => r()))
    const freePort = (probe.address() as net.AddressInfo).port
    await new Promise((r) => probe.close(r))
    const rule = store.saveTunnel({ hostId: host.id, kind: 'local', bindPort: freePort, targetHost: '127.0.0.1', targetPort: echoPort })
    expect((await pf.start(rule.id)).status).toBe('active')

    const uncaught: any[] = []
    const onUncaught = (e: any) => uncaught.push(e)
    process.on('uncaughtException', onUncaught)
    tcpipEvents.length = 0
    tcpipDelayMs = 400
    try {
      for (let i = 0; i < 3; i++) {
        await new Promise<void>((resolve) => {
          const s = net.connect(freePort, '127.0.0.1', () => {
            s.write('hello')
            // RST instead of FIN: the tunnel side sees ECONNRESET before forwardOut has answered
            setTimeout(() => { s.resetAndDestroy(); resolve() }, 50)
          })
          s.on('error', () => {})
        })
      }
      await vi.waitFor(() => expect(tcpipEvents.filter((e) => e === 'channel closed')).toHaveLength(3), { timeout: 5000 })
      await new Promise((r) => setTimeout(r, 100))
    } finally {
      tcpipDelayMs = 0
      process.off('uncaughtException', onUncaught)
    }
    expect(uncaught).toEqual([])
    expect(tcpipEvents.filter((e) => e === 'accepted')).toHaveLength(3)
    expect(pf.status(rule.id)).toMatchObject({ status: 'active', activeConnections: 0 })

    // the tunnel still works afterwards
    const reply = await new Promise<string>((resolve, reject) => {
      const s = net.connect(freePort, '127.0.0.1', () => s.write('still-alive'))
      s.on('data', (d) => { resolve(d.toString()); s.end() })
      s.on('error', reject)
    })
    expect(reply).toBe('still-alive')
    pf.stopAll()
    manager.disposeAll()
  }, 20_000)
})
