// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import crypto from 'node:crypto'
import { EventEmitter } from 'node:events'
// @ts-ignore - plain JS module
import { SshVaultStore } from '../electron/services/ssh/SshVaultStore.js'
// @ts-ignore - plain JS module
import { SshSessionManager } from '../electron/services/ssh/SshSessionManager.js'
// @ts-ignore - plain JS module
import { hostKeyInfo } from '../electron/services/ssh/sshKeys.js'
// @ts-ignore - plain JS module
import { parseSocksGreeting, parseSocksRequest, probeLocalPort } from '../electron/services/ssh/PortForwardService.js'

// SSH wire-format blob for a fake ed25519 host key
const blobFor = (seed: string) => {
  const type = Buffer.from('ssh-ed25519')
  const pub = crypto.createHash('sha256').update(seed).digest()
  const b = Buffer.alloc(4 + type.length + 4 + pub.length)
  b.writeUInt32BE(type.length, 0); type.copy(b, 4)
  b.writeUInt32BE(pub.length, 4 + type.length); pub.copy(b, 8 + type.length)
  return b
}

const KEY = crypto.randomBytes(32)
const serverKeys: Record<string, Buffer> = {}
const connects: any[] = []

class FakeStream extends EventEmitter {
  written: string[] = []
  stderr = new EventEmitter()
  paused = false
  write(d: string) { this.written.push(d); return true }
  setWindow = vi.fn()
  pause() { this.paused = true }
  resume() { this.paused = false }
  end() { this.emit('close') }
}

class FakeClient extends EventEmitter {
  cfg: any
  stream = new FakeStream()
  connect(cfg: any) {
    this.cfg = cfg
    connects.push(cfg)
    const key = serverKeys[`${cfg.host}:${cfg.port}`]
    setTimeout(() => cfg.hostVerifier(key, (ok: boolean) => {
      if (ok) this.emit('ready')
      else this.emit('error', new Error('Host denied (verification failed)'))
    }), 0)
  }
  shell(_o: any, cb: any) { cb(null, this.stream) }
  forwardOut(_a: string, _b: number, host: string, port: number, cb: any) { cb(null, { via: this.cfg.host, to: `${host}:${port}` }) }
  end() { this.emit('close') }
}

const setup = () => {
  const store = new SshVaultStore({ getKey: () => KEY, persist: false })
  const manager = new SshSessionManager({ store, ClientClass: FakeClient })
  return { store, manager }
}

describe('TOFU host key verification', () => {
  it('hostKeyInfo produces an OpenSSH SHA256 fingerprint', () => {
    const info = hostKeyInfo(blobFor('a'))
    expect(info.keyType).toBe('ssh-ed25519')
    expect(info.fingerprintSha256).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/)
  })

  it('pauses the handshake on first contact, then trusts after the user accepts', async () => {
    const { store, manager } = setup()
    serverKeys['srv.lan:22'] = blobFor('srv')
    const h = store.saveHost({ hostname: 'srv.lan' })
    const prompts: any[] = []
    manager.on('hostkey', (p: any) => prompts.push(p))
    const events: any[] = []
    const pending = manager.openSession({ sessionId: 's1', hostId: h.id, cols: 80, rows: 24 }, (ch: string, p: any) => events.push([ch, p]))
    await vi.waitFor(() => expect(prompts).toHaveLength(1))
    expect(prompts[0]).toMatchObject({ status: 'unknown', hostname: 'srv.lan', port: 22 })
    manager.resolveHostKey(prompts[0].requestId, true)
    const r = await pending
    expect(r).toMatchObject({ ok: true, status: 'connected' })
    expect(store.findKnownHost('srv.lan', 22).fingerprintSha256).toBe(prompts[0].fingerprintSha256)

    // second connection: trusted, no prompt
    const r2 = await manager.openSession({ sessionId: 's2', hostId: h.id }, () => {})
    expect(r2.ok).toBe(true)
    expect(prompts).toHaveLength(1)
    manager.disposeAll()
  })

  it('flags a changed key as mismatch and fails when rejected', async () => {
    const { store, manager } = setup()
    const h = store.saveHost({ hostname: 'mitm.lan' })
    store.trustKnownHost({ hostname: 'mitm.lan', port: 22, ...hostKeyInfo(blobFor('original')) })
    serverKeys['mitm.lan:22'] = blobFor('attacker')
    const prompts: any[] = []
    manager.on('hostkey', (p: any) => prompts.push(p))
    const pending = manager.openSession({ sessionId: 's3', hostId: h.id }, () => {})
    await vi.waitFor(() => expect(prompts).toHaveLength(1))
    expect(prompts[0].status).toBe('mismatch')
    expect(prompts[0].knownFingerprint).toBe(hostKeyInfo(blobFor('original')).fingerprintSha256)
    manager.resolveHostKey(prompts[0].requestId, false)
    const r = await pending
    expect(r).toMatchObject({ ok: false, code: 'HOSTKEY_REJECTED' })
    // the trusted fingerprint was not replaced
    expect(store.findKnownHost('mitm.lan', 22).fingerprintSha256).toBe(hostKeyInfo(blobFor('original')).fingerprintSha256)
    expect(store.getState().sessionLogs[0].status).toBe('hostkey_rejected')
  })

  it('non-interactive connections (auto-start tunnels) never prompt', async () => {
    const { store, manager } = setup()
    serverKeys['quiet.lan:22'] = blobFor('quiet')
    const h = store.saveHost({ hostname: 'quiet.lan' })
    const spy = vi.fn()
    manager.on('hostkey', spy)
    await expect(manager.connectClient(h.id, { ownerId: 't1', interactive: false })).rejects.toMatchObject({ code: 'HOSTKEY_REJECTED' })
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('sessions', () => {
  it('connects through a jump chain using forwardOut sockets', async () => {
    const { store, manager } = setup()
    serverKeys['bastion.lan:22'] = blobFor('b')
    serverKeys['inner.lan:2222'] = blobFor('i')
    const b = store.saveHost({ hostname: 'bastion.lan' })
    const inner = store.saveHost({ hostname: 'inner.lan', port: 2222, jumpHostId: b.id })
    for (const [hn, port, seed] of [['bastion.lan', 22, 'b'], ['inner.lan', 2222, 'i']] as const) store.trustKnownHost({ hostname: hn, port, ...hostKeyInfo(blobFor(seed)) })
    connects.length = 0
    const conn = await manager.connectClient(inner.id, { ownerId: 'x' })
    expect(conn.chain).toHaveLength(2)
    expect(connects[1].sock).toEqual({ via: 'bastion.lan', to: 'inner.lan:2222' })
    // bastion dropping takes the dependent connection down
    const dropped = vi.fn()
    const conn2 = await manager.connectClient(inner.id, { ownerId: 'y', onDrop: dropped })
    conn2.chain[0].emit('close')
    expect(dropped).toHaveBeenCalledTimes(1)
    conn.close()
  })

  it('coalesces PTY output into frames and broadcasts input to several sessions', async () => {
    const { store, manager } = setup()
    serverKeys['out.lan:22'] = blobFor('o')
    const h = store.saveHost({ hostname: 'out.lan' })
    store.trustKnownHost({ hostname: 'out.lan', port: 22, ...hostKeyInfo(blobFor('o')) })
    const data: string[] = []
    const send = (ch: string, p: any) => { if (ch === 'ssh:session:data') data.push(p.data) }
    await manager.openSession({ sessionId: 'a', hostId: h.id }, send)
    await manager.openSession({ sessionId: 'b', hostId: h.id }, () => {})
    const sa = manager.sessions.get('a').stream
    for (let i = 0; i < 50; i += 1) sa.emit('data', Buffer.from(`line ${i}\n`))
    await new Promise((r) => setTimeout(r, 30))
    expect(data.length).toBe(1)
    expect(data[0]).toContain('line 49')
    expect(manager.write(['a', 'b', 'missing'], 'uptime\r')).toBe(2)
    expect(manager.resize('a', 120, 40)).toBe(true)
    expect(sa.setWindow).toHaveBeenCalledWith(40, 120, 0, 0)
    manager.disposeAll()
    expect(manager.listSessions()).toEqual([])
  })

  it('runs the host startup snippet after connecting', async () => {
    const { store, manager } = setup()
    serverKeys['boot.lan:22'] = blobFor('boot')
    const sn = store.saveSnippet({ name: 'motd', body: 'uname -a' })
    const h = store.saveHost({ hostname: 'boot.lan', startupSnippetId: sn.id })
    store.trustKnownHost({ hostname: 'boot.lan', port: 22, ...hostKeyInfo(blobFor('boot')) })
    await manager.openSession({ sessionId: 'st', hostId: h.id }, () => {})
    expect(manager.sessions.get('st').stream.written).toEqual(['uname -a\r'])
    manager.disposeAll()
  })
})

describe('SOCKS5 parsing and port probe', () => {
  it('parses greeting and CONNECT requests', () => {
    expect(parseSocksGreeting(Buffer.from([5, 1]))).toEqual({ need: true })
    expect(parseSocksGreeting(Buffer.from([5, 1, 0]))).toMatchObject({ methods: [0], consumed: 3 })
    const dom = Buffer.concat([Buffer.from([5, 1, 0, 3, 11]), Buffer.from('example.com'), Buffer.from([0x01, 0xbb])])
    expect(parseSocksRequest(dom)).toMatchObject({ host: 'example.com', port: 443 })
    expect(parseSocksRequest(Buffer.from([5, 1, 0, 1, 10, 0, 0, 1, 0, 80]))).toMatchObject({ host: '10.0.0.1', port: 80 })
    expect(parseSocksRequest(Buffer.from([5, 2, 0, 1, 10, 0, 0, 1, 0, 80]))).toMatchObject({ reply: 7 })
  })

  it('detects a busy local port', async () => {
    const net = await import('node:net')
    const srv = net.createServer()
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()))
    const port = (srv.address() as any).port
    expect(await probeLocalPort('127.0.0.1', port)).toMatchObject({ free: false, code: 'EADDRINUSE' })
    await new Promise((r) => srv.close(r))
    expect(await probeLocalPort('127.0.0.1', port)).toEqual({ free: true })
  })
})
