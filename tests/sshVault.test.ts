// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
// @ts-ignore - plain JS module
import { SshVaultStore } from '../electron/services/ssh/SshVaultStore.js'
// @ts-ignore - plain JS module
import { parsePrivateKey, publicKeyInfo } from '../electron/services/ssh/sshKeys.js'
// @ts-ignore - plain JS module
import { parseSshConfig } from '../electron/services/ssh/sshConfigParser.js'
// @ts-ignore - plain JS module
import { makeVaultKeyProvider } from '../electron/ipc/sshIpc.js'

const key = crypto.randomBytes(32)
const mem = () => new SshVaultStore({ getKey: () => key, persist: false })

describe('SshVaultStore hosts and groups', () => {
  it('creates a host with defaults and validates the port', () => {
    const s = mem()
    const h = s.saveHost({ hostname: '10.0.0.5' })
    expect(h).toMatchObject({ label: '10.0.0.5', port: 22, username: 'root', osIcon: 'linux' })
    expect(() => s.saveHost({ hostname: 'a', port: 70000 })).toThrow(/port/)
    expect(() => s.saveHost({ hostname: 'bad host; rm -rf /' })).toThrow(/host name/)
  })

  it('refuses jump host cycles and self jumps', () => {
    const s = mem()
    const a = s.saveHost({ label: 'a', hostname: 'a.example' })
    const b = s.saveHost({ label: 'b', hostname: 'b.example', jumpHostId: a.id })
    expect(() => s.saveHost({ ...a, jumpHostId: a.id })).toThrow(/own jump host/)
    expect(() => s.saveHost({ ...a, jumpHostId: b.id })).toThrow(/cycle/)
    expect(s.resolveJumpChain(b.id).map((h: any) => h.label)).toEqual(['a', 'b'])
  })

  it('limits jump chains to depth 5', () => {
    const s = mem()
    let prev: any = null
    for (let i = 0; i < 6; i += 1) prev = s.saveHost({ label: `h${i}`, hostname: `h${i}.lan`, jumpHostId: prev?.id })
    expect(() => s.saveHost({ label: 'h6', hostname: 'h6.lan', jumpHostId: prev.id })).toThrow(/deeper/)
  })

  it('deleting a group or host nulls references and cascades tunnels', () => {
    const s = mem()
    const g = s.saveGroup({ name: 'AWS' })
    const h = s.saveHost({ hostname: 'x.lan', groupId: g.id })
    const t = s.saveTunnel({ hostId: h.id, kind: 'local', bindPort: 8080, targetHost: 'localhost', targetPort: 80 })
    s.deleteGroup(g.id)
    expect(s.getHost(h.id).groupId).toBeNull()
    const { removedTunnels } = s.deleteHost(h.id)
    expect(removedTunnels).toEqual([t.id])
    expect(s.getState().tunnels).toHaveLength(0)
  })

  it('refuses group cycles', () => {
    const s = mem()
    const a = s.saveGroup({ name: 'a' })
    const b = s.saveGroup({ name: 'b', parentId: a.id })
    expect(() => s.saveGroup({ ...a, parentId: b.id })).toThrow(/cycle/)
  })
})

describe('SshVaultStore keychain', () => {
  it('never exposes secrets in getState and decrypts them in main only', () => {
    const s = mem()
    const c = s.saveCredential({ label: 'prod', kind: 'password', username: 'deploy', secret: 'hunter2' })
    const json = JSON.stringify(s.getState())
    expect(json).not.toContain('hunter2')
    expect(json).not.toContain('secretCipherJson')
    expect(c.hasSecret).toBe(true)
    expect(s.getAuthMaterial(c.id)).toMatchObject({ kind: 'password', password: 'hunter2', username: 'deploy' })
    // stored envelope is an AES-GCM JSON envelope, not the plaintext
    expect(s.data.credentials[0].secretCipherJson).toMatch(/ivB64/)
  })

  it('generates an ed25519 key with fingerprint and stores the private key encrypted', async () => {
    const s = mem()
    const { credential, publicKey } = await s.generateKey({ label: 'laptop', algorithm: 'ed25519', passphrase: 'pw' })
    expect(publicKey).toMatch(/^ssh-ed25519 AAAA/)
    expect(credential.fingerprintSha256).toBe(publicKeyInfo(publicKey).fingerprintSha256)
    expect(credential.hasPassphrase).toBe(true)
    const auth = s.getAuthMaterial(credential.id)
    expect(auth.privateKey).toMatch(/OPENSSH PRIVATE KEY/)
    expect(parsePrivateKey(auth.privateKey, 'pw').fingerprintSha256).toBe(credential.fingerprintSha256)
    expect(() => parsePrivateKey(auth.privateKey, 'wrong')).toThrow()
  })

  it('imports a private key and rejects garbage', async () => {
    const s = mem()
    const { credential } = await s.generateKey({ label: 'src', algorithm: 'ed25519' })
    const pem = s.getAuthMaterial(credential.id).privateKey
    const imported = s.saveCredential({ label: 'imported', kind: 'ssh_key', privateKey: pem })
    expect(imported.fingerprintSha256).toBe(credential.fingerprintSha256)
    expect(imported.algorithm).toBe('ed25519')
    expect(() => s.saveCredential({ label: 'bad', kind: 'ssh_key', privateKey: 'not a key' })).toThrow()
  })

  it('deleting a credential detaches it from hosts', () => {
    const s = mem()
    const c = s.saveCredential({ label: 'p', kind: 'password', secret: 'x' })
    const h = s.saveHost({ hostname: 'a.lan', credentialId: c.id })
    s.deleteCredential(c.id)
    expect(s.getHost(h.id).credentialId).toBeNull()
  })
})

describe('SshVaultStore tunnels', () => {
  it('enforces kind invariants and unique local binds', () => {
    const s = mem()
    const h = s.saveHost({ hostname: 'a.lan' })
    expect(() => s.saveTunnel({ hostId: h.id, kind: 'local', bindPort: 1 })).toThrow(/targetHost/)
    const d = s.saveTunnel({ hostId: h.id, kind: 'dynamic', bindPort: 1080, targetHost: 'ignored', targetPort: 1 })
    expect(d).toMatchObject({ targetHost: null, targetPort: null })
    expect(() => s.saveTunnel({ hostId: h.id, kind: 'dynamic', bindPort: 1080 })).toThrow(/already used/)
    // same port, other kind is allowed (uq is per kind)
    expect(() => s.saveTunnel({ hostId: h.id, kind: 'remote', bindPort: 1080, targetHost: 'localhost', targetPort: 22 })).not.toThrow()
  })
})

describe('persistence', () => {
  it('round-trips through disk with a DPAPI-like wrapped key', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-ssh-'))
    const fakeSafe = {
      isEncryptionAvailable: () => true,
      encryptString: (s: string) => Buffer.from(`wrapped:${s}`),
      decryptString: (b: Buffer) => b.toString().replace(/^wrapped:/, '')
    }
    const kp = makeVaultKeyProvider(path.join(dir, 'k.json'), fakeSafe)
    const a = new SshVaultStore({ file: path.join(dir, 'v.json'), getKey: kp.getKey }).load()
    const c = a.saveCredential({ label: 'x', kind: 'password', secret: 's3cret' })
    expect(fs.readFileSync(path.join(dir, 'v.json'), 'utf8')).not.toContain('s3cret')
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'k.json'), 'utf8')).protection).toBe('dpapi')
    const kp2 = makeVaultKeyProvider(path.join(dir, 'k.json'), fakeSafe)
    const b = new SshVaultStore({ file: path.join(dir, 'v.json'), getKey: kp2.getKey }).load()
    expect(b.getAuthMaterial(c.id).password).toBe('s3cret')
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('parseSshConfig', () => {
  it('reads Host blocks, defaults and ProxyJump, skipping wildcards', () => {
    const hosts = parseSshConfig(`
Host *
  User admin
Host web prod-web
  HostName 10.1.1.10
  Port 2222
Host db
  HostName db.internal
  User postgres
  ProxyJump bastion
Host bastion
  HostName bastion.example.com
Host *.corp
  User nobody
`)
    expect(hosts.map((h: any) => h.alias)).toEqual(['web', 'prod-web', 'db', 'bastion'])
    expect(hosts[0]).toMatchObject({ hostname: '10.1.1.10', port: 2222, username: 'admin' })
    expect(hosts[2]).toMatchObject({ username: 'postgres', proxyJump: 'bastion' })
  })
})
