// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import net from 'node:net'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import {
  registrableDomain, parseEntrySite, matchSite, findMatchingEntries, sameSite, siteForSavedLogin
} from '../electron/services/vaultBridge/domainMatch.js'
import {
  validateMessage, FrameDecoder, encodeFrame, parseHostHello, buildServerProof, verifyClientProof, buildClientProof,
  callerFromArgs, hmacHex
} from '../electron/services/vaultBridge/protocol.js'
import { RateLimiter } from '../electron/services/vaultBridge/rateLimit.js'
import { PairingStore, generatePairingCode } from '../electron/services/vaultBridge/pairingStore.js'
import { VaultBridgeServer } from '../electron/services/vaultBridge/bridgeServer.js'
import { NativeHostRegistry, buildHostManifest, CHROMIUM_EXTENSION_ID, GECKO_EXTENSION_ID, ALLOWED_CALLERS } from '../electron/services/vaultBridge/nativeHost.js'
import { isWeakKdf, upgradeWrapperIfWeak } from '../electron/services/vaultBridge/vaultHardening.js'
import { buildKdf, wrapVaultKeyWithPassword, unwrapVaultKeyWithPassword, encryptVaultData, aesGcmDecrypt, aesGcmEncrypt } from '../electron/vaultCrypto.js'

const tmpDirs: string[] = []
const mkTmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-vaultx-'))
  tmpDirs.push(d)
  return d
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

describe('registrable domain (eTLD+1)', () => {
  it('handles plain, ccTLD second-level and private suffixes', () => {
    expect(registrableDomain('accounts.google.com')).toBe('google.com')
    expect(registrableDomain('www.bb.com.br')).toBe('bb.com.br')
    expect(registrableDomain('login.bbc.co.uk')).toBe('bbc.co.uk')
    expect(registrableDomain('alice.github.io')).toBe('alice.github.io')
    expect(registrableDomain('shop.myshopify.com')).toBe('shop.myshopify.com')
    expect(registrableDomain('x.y.gov.br')).toBe('y.gov.br')
  })
  it('returns null for IPs, localhost, single labels and bare suffixes', () => {
    expect(registrableDomain('192.168.0.1')).toBeNull()
    expect(registrableDomain('localhost')).toBeNull()
    expect(registrableDomain('intranet')).toBeNull()
    expect(registrableDomain('com.br')).toBeNull()
    expect(registrableDomain('github.io')).toBeNull()
  })
})

describe('entry/page matching', () => {
  it('parses free-text sites', () => {
    expect(parseEntrySite('Example.com')).toEqual({ scheme: null, host: 'example.com', port: null })
    expect(parseEntrySite('https://a.example.com/login?x=1')?.host).toBe('a.example.com')
    expect(parseEntrySite('Gmail')).toBeNull()
    expect(parseEntrySite('my bank')).toBeNull()
    expect(parseEntrySite('ftp://example.com')).toBeNull()
    expect(parseEntrySite('localhost:3000')?.port).toBe('3000')
  })
  it('prefers exact host and ignores www', () => {
    expect(matchSite('example.com', 'https://www.example.com/login')).toBe('exact')
    expect(matchSite('https://example.com', 'https://example.com/')).toBe('exact')
    expect(matchSite('accounts.google.com', 'https://mail.google.com/')).toBe('domain')
  })
  it('never matches other sites, lookalikes or tenants of a hosting platform', () => {
    expect(matchSite('example.com', 'https://example.com.evil.net/')).toBeNull()
    expect(matchSite('example.com', 'https://notexample.com/')).toBeNull()
    expect(matchSite('alice.github.io', 'https://mallory.github.io/')).toBeNull()
    expect(matchSite('bb.com.br', 'https://evil.com.br/')).toBeNull()
    expect(matchSite('example.com', 'https://user:pw@example.com/')).toBeNull()
  })
  it('enforces scheme and port rules', () => {
    expect(matchSite('example.com', 'http://example.com/')).toBeNull()
    expect(matchSite('https://example.com', 'http://example.com/')).toBeNull()
    expect(matchSite('http://example.com', 'http://example.com/')).toBe('exact')
    expect(matchSite('http://example.com', 'http://sub.example.com/')).toBeNull()
    expect(matchSite('http://example.com', 'https://example.com/')).toBe('exact')
    expect(matchSite('example.com', 'https://example.com:8443/')).toBeNull()
    expect(matchSite('example.com:8443', 'https://example.com:8443/')).toBe('exact')
    expect(matchSite('localhost:3000', 'http://localhost:3000/')).toBe('exact')
    expect(matchSite('localhost:3000', 'http://localhost:4000/')).toBeNull()
    expect(matchSite('192.168.1.1', 'https://192.168.1.2/')).toBeNull()
  })
  it('rejects non-web pages', () => {
    for (const u of ['file:///C:/x.html', 'chrome://settings', 'about:blank', 'data:text/html,hi', 'javascript:alert(1)']) {
      expect(matchSite('example.com', u)).toBeNull()
    }
  })
  it('returns only matching entries, exact first, without passwords', () => {
    const entries = [
      { id: '1', site: 'mail.google.com', username: 'b', password: 'p1' },
      { id: '2', site: 'google.com', username: 'a', password: 'p2' },
      { id: '3', site: 'example.com', username: 'c', password: 'p3' }
    ]
    const res = findMatchingEntries(entries, 'https://google.com/signin')
    expect(res.map((r) => r.entryId)).toEqual(['2', '1'])
    expect(res[0].match).toBe('exact')
    expect(JSON.stringify(res)).not.toContain('p1')
    expect(JSON.stringify(res)).not.toContain('p2')
  })
  it('same-site and saved-site helpers', () => {
    expect(sameSite('https://a.example.com/', 'https://b.example.com/')).toBe(true)
    expect(sameSite('https://example.com/', 'https://evil.com/')).toBe(false)
    expect(siteForSavedLogin('https://Login.Example.com:8443/path?q=1')).toBe('https://login.example.com:8443')
  })
})

describe('protocol', () => {
  it('frames round-trip and rejects oversize / HTTP probes', () => {
    const dec = new FrameDecoder()
    const f = encodeFrame({ a: 1 })
    expect(dec.push(f.subarray(0, 3))).toEqual([])
    expect(dec.push(f.subarray(3))).toEqual(['{"a":1}'])
    expect(() => new FrameDecoder().push(Buffer.from('GET / HTTP/1.1\r\n'))).toThrow()
  })
  it('mutual handshake', () => {
    const secret = 'a'.repeat(64)
    const nonceH = '0'.repeat(32)
    const hello = parseHostHello(`DHVB1 H ${nonceH} ${Buffer.from('chrome-extension://x/\n--parent-window=0').toString('base64')}`)
    expect(hello?.args).toEqual(['chrome-extension://x/', '--parent-window=0'])
    const s = buildServerProof(secret, nonceH, '1'.repeat(32)).split(' ')
    expect(s[3]).toBe(hmacHex(secret, `S|${nonceH}|${'1'.repeat(32)}`))
    expect(verifyClientProof(secret, nonceH, '1'.repeat(32), buildClientProof(secret, nonceH, '1'.repeat(32)))).toBe(true)
    expect(verifyClientProof('b'.repeat(64), nonceH, '1'.repeat(32), buildClientProof(secret, nonceH, '1'.repeat(32)))).toBe(false)
    expect(parseHostHello('DHVB1 H nothex x')).toBeNull()
  })
  it('identifies the calling extension', () => {
    expect(callerFromArgs([`chrome-extension://${CHROMIUM_EXTENSION_ID}/`, '--parent-window=1'])).toEqual({ kind: 'chromium', id: CHROMIUM_EXTENSION_ID })
    expect(callerFromArgs(['C:\\x\\manifest.json', GECKO_EXTENSION_ID])).toEqual({ kind: 'gecko', id: GECKO_EXTENSION_ID })
    expect(callerFromArgs(['whatever'])).toBeNull()
  })
  it('validates messages', () => {
    expect(validateMessage('nope')).toMatchObject({ ok: false, error: 'bad_json' })
    expect(validateMessage(JSON.stringify({ type: 'ping' }))).toMatchObject({ ok: false, error: 'bad_id' })
    expect(validateMessage(JSON.stringify({ id: 1, type: 'vault.dump' }))).toMatchObject({ ok: false, error: 'unknown_type' })
    expect(validateMessage(JSON.stringify({ id: 1, type: '__proto__' }))).toMatchObject({ ok: false, error: 'unknown_type' })
    expect(validateMessage(JSON.stringify({ id: 1, type: 'logins.query', url: 'file:///etc/passwd' }))).toMatchObject({ ok: false, error: 'invalid_params' })
    expect(validateMessage(JSON.stringify({ id: 1, type: 'logins.fill', url: 'https://a.com/', entryId: '../x' }))).toMatchObject({ ok: false })
    expect(validateMessage(JSON.stringify({ id: 1, type: 'auth', clientId: 'x', token: 'y' }))).toMatchObject({ ok: false, error: 'invalid_params' })
    expect(validateMessage(JSON.stringify({ id: 1, type: 'logins.save', url: 'https://a.com/', username: 'u', password: 'x'.repeat(2000) }))).toMatchObject({ ok: false })
    const ok = validateMessage(JSON.stringify({ id: 7, type: 'logins.query', url: 'https://a.com/x', extra: 'dropped' }))
    expect(ok).toEqual({ ok: true, id: 7, type: 'logins.query', payload: { url: 'https://a.com/x', topUrl: 'https://a.com/x' } })
  })
})

describe('rate limiter', () => {
  it('token bucket refills over time, per key', () => {
    let now = 0
    const rl = new RateLimiter({ capacity: 2, perMs: 1000, now: () => now })
    expect(rl.take('a')).toBe(true)
    expect(rl.take('a')).toBe(true)
    expect(rl.take('a')).toBe(false)
    expect(rl.take('b')).toBe(true)
    expect(rl.retryAfter('a')).toBe(500)
    now = 500
    expect(rl.take('a')).toBe(true)
    expect(rl.take('a')).toBe(false)
  })
})

describe('pairing store', () => {
  it('stores only token hashes, verifies, binds caller and revokes', async () => {
    const dir = mkTmp()
    const store = new PairingStore({ filePath: path.join(dir, 'pairings.json') })
    const { clientId, token } = await store.add({ name: 'Chrome', browser: 'chrome', caller: 'chromium:abc' })
    const raw = fs.readFileSync(path.join(dir, 'pairings.json'), 'utf8')
    expect(raw).not.toContain(token)
    expect(await store.verify(clientId, token, 'chromium:abc')).toBeTruthy()
    expect(await store.verify(clientId, token, 'chromium:other')).toBeNull()
    expect(await store.verify(clientId, '0'.repeat(64), 'chromium:abc')).toBeNull()
    const fresh = new PairingStore({ filePath: path.join(dir, 'pairings.json') })
    expect(await fresh.verify(clientId, token, 'chromium:abc')).toBeTruthy()
    expect(await fresh.revoke(clientId)).toBe(true)
    expect(await fresh.verify(clientId, token, 'chromium:abc')).toBeNull()
  })
  it('pairing codes are 6 digits', () => {
    for (let i = 0; i < 50; i += 1) expect(generatePairingCode()).toMatch(/^\d{3} \d{3}$/)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// End-to-end over a real loopback socket, acting as the C# host.

const CALLER_ARGS = [`chrome-extension://${CHROMIUM_EXTENSION_ID}/`, '--parent-window=0']

function makeServer(opts: { unlocked?: boolean; acceptPair?: boolean; acceptSave?: boolean } = {}) {
  const dir = mkTmp()
  const state = { unlocked: opts.unlocked ?? true }
  const entries: any[] = [
    { id: 'e1', site: 'https://example.com', username: 'alice', password: 's3cret-A' },
    { id: 'e2', site: 'other.org', username: 'bob', password: 's3cret-B' }
  ]
  let cfg: any = null
  const prompts: string[] = []
  const server = new VaultBridgeServer({
    vault: {
      isUnlocked: () => state.unlocked,
      getEntries: () => (state.unlocked ? entries : []),
      addEntry: async (e: any) => { entries.push({ id: `n${entries.length}`, ...e }) },
      updatePassword: async (id: string, password: string) => { const e = entries.find((x) => x.id === id); if (e) e.password = password }
    },
    prompts: {
      confirmPairing: async () => { prompts.push('pair'); return opts.acceptPair ?? true },
      confirmSave: async () => { prompts.push('save'); return opts.acceptSave ?? true }
    },
    pairingStore: new PairingStore({ filePath: path.join(dir, 'pairings.json') }),
    allowedCallers: ALLOWED_CALLERS,
    writeConfig: async (c: any) => { cfg = c }
  })
  return { server, state, entries, prompts, getCfg: () => cfg }
}

class FakeHost {
  sock!: net.Socket
  dec = new FrameDecoder(1024 * 1024)
  queue: string[] = []
  waiters: Array<(f: string) => void> = []
  closed = false

  async connect(port: number) {
    this.sock = net.connect({ host: '127.0.0.1', port })
    await new Promise<void>((r, j) => { this.sock.once('connect', () => r()); this.sock.once('error', j) })
    this.sock.on('data', (c) => {
      for (const f of this.dec.push(c)) {
        const w = this.waiters.shift()
        if (w) w(f)
        else this.queue.push(f)
      }
    })
    this.sock.on('close', () => { this.closed = true; for (const w of this.waiters.splice(0)) w('__closed__') })
  }
  next(): Promise<string> {
    const q = this.queue.shift()
    if (q !== undefined) return Promise.resolve(q)
    if (this.closed) return Promise.resolve('__closed__')
    return new Promise((r) => this.waiters.push(r))
  }
  raw(s: string) { this.sock.write(encodeFrame(s)) }
  async handshake(secret: string, args = CALLER_ARGS) {
    const nonceH = crypto.randomBytes(16).toString('hex')
    this.raw(`DHVB1 H ${nonceH} ${Buffer.from(args.join('\n')).toString('base64')}`)
    const s = await this.next()
    if (s === '__closed__') return false
    const [, , nonceS, mac] = s.split(' ')
    if (mac !== hmacHex(secret, `S|${nonceH}|${nonceS}`)) throw new Error('server proof mismatch')
    this.raw(buildClientProof(secret, nonceH, nonceS))
    const ready = JSON.parse(await this.next())
    return ready.type === 'bridge.ready'
  }
  async call(msg: object) {
    this.raw(JSON.stringify(msg))
    return JSON.parse(await this.next())
  }
  close() { this.sock.destroy() }
}

describe('bridge server (loopback, end to end)', () => {
  const servers: VaultBridgeServer[] = []
  afterEach(async () => { for (const s of servers.splice(0)) await s.stop() })

  async function setup(opts = {}) {
    const ctx = makeServer(opts)
    servers.push(ctx.server)
    await ctx.server.start()
    const host = new FakeHost()
    await host.connect(ctx.getCfg().port)
    return { ...ctx, host }
  }

  async function pair(host: FakeHost) {
    const r = await host.call({ id: 1, type: 'pair.request', clientName: 'Chrome', browser: 'chrome' })
    expect(r).toMatchObject({ ok: true, pending: true })
    expect(r.code).toMatch(/^\d{3} \d{3}$/)
    const result = JSON.parse(await host.next())
    return { r, result }
  }

  it('binds 127.0.0.1 only and writes a fresh secret', async () => {
    const { server, getCfg } = await setup()
    expect(server.running).toBe(true)
    expect(getCfg().secret).toMatch(/^[0-9a-f]{64}$/)
    expect((server as any).server.address().address).toBe('127.0.0.1')
  })

  it('drops a host with the wrong secret or a foreign extension id', async () => {
    const { host, getCfg } = await setup()
    await expect(host.handshake('f'.repeat(64))).rejects.toThrow('server proof mismatch')
    const h2 = new FakeHost()
    await h2.connect(getCfg().port)
    expect(await h2.handshake(getCfg().secret, ['chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'])).toBe(false)
  })

  it('wrong client proof closes the connection', async () => {
    const { host } = await setup()
    host.raw(`DHVB1 H ${'0'.repeat(32)} ${Buffer.from(CALLER_ARGS.join('\n')).toString('base64')}`)
    await host.next()
    host.raw(`DHVB1 C ${'0'.repeat(64)}`)
    expect(await host.next()).toBe('__closed__')
  })

  it('requires pairing, serves only same-site usernames and a password only on fill', async () => {
    const { host, getCfg, prompts } = await setup()
    expect(await host.handshake(getCfg().secret)).toBe(true)
    expect(await host.call({ id: 1, type: 'logins.query', url: 'https://example.com/' })).toMatchObject({ ok: false, error: 'not_paired' })

    const { result } = await pair(host)
    expect(prompts).toEqual(['pair'])
    expect(result).toMatchObject({ type: 'pair.result', ok: true })
    expect(result.token).toMatch(/^[0-9a-f]{64}$/)

    const q = await host.call({ id: 2, type: 'logins.query', url: 'https://example.com/login' })
    expect(q.logins).toEqual([{ entryId: 'e1', username: 'alice', host: 'example.com', match: 'exact' }])
    expect(JSON.stringify(q)).not.toContain('s3cret')

    expect(await host.call({ id: 3, type: 'logins.fill', url: 'https://evil.com/', entryId: 'e1' })).toMatchObject({ ok: false, error: 'not_found' })
    expect(await host.call({ id: 4, type: 'logins.fill', url: 'https://example.com/', topUrl: 'https://evil.com/', entryId: 'e1' })).toMatchObject({ ok: false, error: 'cross_site_frame' })
    expect(await host.call({ id: 5, type: 'logins.fill', url: 'https://example.com/', entryId: 'e1' })).toEqual({ id: 5, ok: true, username: 'alice', password: 's3cret-A' })

    // reconnect with the stored token
    const h2 = new FakeHost()
    await h2.connect(getCfg().port)
    await h2.handshake(getCfg().secret)
    expect(await h2.call({ id: 1, type: 'auth', clientId: result.clientId, token: '0'.repeat(64) })).toMatchObject({ ok: false, error: 'auth_failed' })
    expect(await h2.call({ id: 2, type: 'auth', clientId: result.clientId, token: result.token })).toMatchObject({ ok: true })
    expect((await h2.call({ id: 3, type: 'logins.query', url: 'https://other.org/' })).logins).toHaveLength(1)
  })

  it('answers nothing while the vault is locked', async () => {
    const { host, getCfg, state } = await setup()
    await host.handshake(getCfg().secret)
    await pair(host)
    state.unlocked = false
    expect(await host.call({ id: 9, type: 'logins.query', url: 'https://example.com/' })).toMatchObject({ ok: false, error: 'locked' })
    expect(await host.call({ id: 10, type: 'logins.fill', url: 'https://example.com/', entryId: 'e1' })).toMatchObject({ ok: false, error: 'locked' })
  })

  it('rejected pairing grants nothing', async () => {
    const { host, getCfg } = await setup({ acceptPair: false })
    await host.handshake(getCfg().secret)
    const { result } = await pair(host)
    expect(result).toMatchObject({ ok: false, error: 'rejected' })
    expect(await host.call({ id: 2, type: 'logins.query', url: 'https://example.com/' })).toMatchObject({ error: 'not_paired' })
  })

  it('save asks the user, then adds or updates', async () => {
    const { host, getCfg, entries, prompts } = await setup()
    await host.handshake(getCfg().secret)
    await pair(host)
    expect(await host.call({ id: 2, type: 'logins.check', url: 'https://example.com/', username: 'alice', password: 's3cret-A' })).toMatchObject({ exists: true, same: true })
    expect(await host.call({ id: 3, type: 'logins.save', url: 'https://example.com/', username: 'alice', password: 's3cret-A' })).toMatchObject({ saved: false, unchanged: true })
    expect(await host.call({ id: 4, type: 'logins.save', url: 'https://new.site.com/a', username: 'zed', password: 'pw' })).toMatchObject({ ok: true, saved: true, updated: false })
    expect(entries.at(-1)).toMatchObject({ site: 'https://new.site.com', username: 'zed', password: 'pw' })
    expect(await host.call({ id: 5, type: 'logins.save', url: 'https://example.com/', username: 'alice', password: 'new' })).toMatchObject({ saved: true, updated: true })
    expect(entries[0].password).toBe('new')
    expect(prompts.filter((p) => p === 'save')).toHaveLength(2)
  })

  it('rate limits fills per client', async () => {
    const { host, getCfg } = await setup()
    await host.handshake(getCfg().secret)
    await pair(host)
    let limited = 0
    for (let i = 0; i < 25; i += 1) {
      const r = await host.call({ id: 100 + i, type: 'logins.fill', url: 'https://example.com/', entryId: 'e1' })
      if (r.error === 'rate_limited') limited += 1
    }
    expect(limited).toBe(5)
  })

  it('revocation disconnects the client', async () => {
    const { host, getCfg, server } = await setup()
    await host.handshake(getCfg().secret)
    const { result } = await pair(host)
    server.disconnectClient(result.clientId)
    expect(JSON.parse(await host.next())).toEqual({ type: 'revoked' })
  })
})

describe('native host registry', () => {
  it('manifests allow only our extension', () => {
    expect(buildHostManifest('chrome', 'C:\\h.exe')).toMatchObject({ name: 'com.darkhub.vault', type: 'stdio', allowed_origins: [`chrome-extension://${CHROMIUM_EXTENSION_ID}/`] })
    expect(buildHostManifest('firefox', 'C:\\h.exe')).toMatchObject({ allowed_extensions: [GECKO_EXTENSION_ID] })
    expect(buildHostManifest('firefox', 'C:\\h.exe')).not.toHaveProperty('allowed_origins')
  })

  it('register/unregister write and remove exactly our HKCU key (fake reg.exe)', async () => {
    const dir = mkTmp()
    const exe = path.join(dir, 'src.exe')
    fs.writeFileSync(exe, 'MZ')
    const reg = new Map<string, string>()
    const calls: string[][] = []
    const runReg = async (args: string[]) => {
      calls.push(args)
      if (args[0] === 'add') { reg.set(args[1], args[args.indexOf('/d') + 1]); return { code: 0, stdout: '' } }
      if (args[0] === 'delete') { reg.delete(args[1]); return { code: 0, stdout: '' } }
      const v = reg.get(args[1])
      return v ? { code: 0, stdout: `\r\n${args[1]}\r\n    (Default)    REG_SZ    ${v}\r\n` } : { code: 1, stdout: '' }
    }
    const r = new NativeHostRegistry({ dir: path.join(dir, 'vb'), runReg, platform: 'win32', findBundledExe: async () => exe })
    const st = await r.register('edge')
    expect(st.registered).toBe(true)
    expect([...reg.keys()]).toEqual(['HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.darkhub.vault'])
    expect(calls.every((c) => c.every((a) => !a.startsWith('HKLM')))).toBe(true)
    const manifest = JSON.parse(fs.readFileSync(r.manifestPath('edge'), 'utf8'))
    expect(manifest.path).toBe(r.hostExePath)
    // a foreign registration with our name is reported and never deleted
    reg.set('HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.darkhub.vault', 'C:\\someone-else.json')
    expect((await r.status('chrome')).foreignRegistration).toBe(true)
    await r.unregister('chrome')
    expect(reg.has('HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.darkhub.vault')).toBe(true)
    await r.unregister('edge')
    expect(reg.has('HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.darkhub.vault')).toBe(false)
    expect(fs.existsSync(r.manifestPath('edge'))).toBe(false)
  })
})

describe('vault hardening', () => {
  it('rejects truncated GCM tags', () => {
    const key = crypto.randomBytes(32)
    const enc = aesGcmEncrypt(key, Buffer.from('hello'))
    const short = { ...enc, tagB64: Buffer.from(enc.tagB64, 'base64').subarray(0, 4).toString('base64') }
    expect(() => aesGcmDecrypt(key, short)).toThrow()
    expect(aesGcmDecrypt(key, enc).toString()).toBe('hello')
  })

  it('upgrades a legacy scrypt wrapper on unlock, keeps a backup and the same key', async () => {
    const dir = mkTmp()
    const vaultPath = path.join(dir, 'vault.dhv')
    const vk = crypto.randomBytes(32)
    const legacyKdf = { ...buildKdf(), N: 16384, r: 8, p: 1 }
    expect(isWeakKdf(legacyKdf)).toBe(true)
    const file = { version: 1, wrappers: { master: await wrapVaultKeyWithPassword(vk, 'master-pass', legacyKdf) }, data: encryptVaultData(vk, { entries: [] }) }
    fs.writeFileSync(vaultPath, JSON.stringify(file))
    const readFile = async () => JSON.parse(fs.readFileSync(vaultPath, 'utf8'))
    const writeFile = async (o: any) => fs.writeFileSync(vaultPath, JSON.stringify(o))
    expect(await upgradeWrapperIfWeak({ vaultPath, wrapperName: 'master', secret: 'master-pass', vaultKey: vk, readFile, writeFile })).toBe(true)
    const upgraded = await readFile()
    expect(upgraded.wrappers.master.kdf).toMatchObject({ N: 65536, r: 8, p: 2 })
    expect((await unwrapVaultKeyWithPassword(upgraded.wrappers.master, 'master-pass')).equals(vk)).toBe(true)
    expect(upgraded.data).toEqual(file.data)
    expect(fs.readdirSync(dir).some((n) => n.startsWith('vault.dhv.bak-kdf-upgrade-'))).toBe(true)
    // second unlock: nothing to do
    expect(await upgradeWrapperIfWeak({ vaultPath, wrapperName: 'master', secret: 'master-pass', vaultKey: vk, readFile, writeFile })).toBe(false)
  }, 30000)

  it('refuses absurd KDF parameters from a tampered file', async () => {
    const w = await wrapVaultKeyWithPassword(crypto.randomBytes(32), 'x', { ...buildKdf(), N: 1024, p: 1 })
    await expect(unwrapVaultKeyWithPassword({ ...w, kdf: { ...w.kdf, N: 2 ** 24 } }, 'x')).rejects.toThrow('Invalid KDF')
  })
})
