import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { aesGcmEncrypt, aesGcmDecrypt } from '../../vaultCrypto.js'
import { publicKeyInfo, parsePrivateKey, generateSshKeyPair } from './sshKeys.js'
import { normalizeArgsSchema } from './snippetTemplate.js'

/**
 * DarkHub SSH vault (replica/schema.sql as a JSON document in userData/ssh-vault.json).
 *
 * Tables: groups, credentials, snippetPackages, snippets, hosts, knownHosts, tunnels, sessionLogs.
 * Secrets (passwords, private keys, passphrases) are AES-256-GCM envelopes ({ ivB64, tagB64, dataB64 }) under a
 * 32-byte vault key that the IPC layer keeps wrapped with DPAPI (safeStorage). Nothing returned by getState() ever
 * carries a secret: credentials are projected to CredentialSummary.
 */

export const OS_ICONS = ['linux', 'ubuntu', 'debian', 'arch', 'redhat', 'windows', 'macos', 'freebsd', 'network', 'custom']
export const CREDENTIAL_KINDS = ['password', 'ssh_key', 'agent']
export const TUNNEL_KINDS = ['local', 'remote', 'dynamic']
export const SESSION_STATUSES = ['connecting', 'connected', 'closed', 'auth_failed', 'hostkey_rejected', 'error']
const MAX_JUMP_DEPTH = 5
const MAX_SESSION_LOGS = 500
const MAX_TEXT = 4096
const MAX_BODY = 64 * 1024

export class SshVaultError extends Error {
  constructor(code, message) {
    super(message || code)
    this.code = code
  }
}

const fail = (code, message) => { throw new SshVaultError(code, message) }
const now = () => new Date().toISOString()
const newId = (prefix) => `${prefix}_${crypto.randomBytes(9).toString('base64url')}`
const str = (v, max = MAX_TEXT) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max)
const req = (v, field, max = MAX_TEXT) => {
  const s = str(v, max).trim()
  if (!s) fail('VALIDATION', `${field} is required`)
  return s
}
const optId = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
export const validPort = (v, field = 'port') => {
  const n = Number(v)
  if (!Number.isInteger(n) || n < 1 || n > 65535) fail('VALIDATION', `${field} must be between 1 and 65535`)
  return n
}
const tags = (v) => Array.from(new Set((Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [])
  .map((t) => str(t, 48).trim()).filter(Boolean))).slice(0, 32)
// hostnames: DNS names, IPv4, IPv6 (optionally bracketed). No spaces/control chars or shell metacharacters.
const HOSTNAME_RE = /^\[?[A-Za-z0-9._:%-]{1,253}\]?$/
const hostname = (v, field = 'hostname') => {
  const s = req(v, field, 255)
  if (!HOSTNAME_RE.test(s)) fail('VALIDATION', `${field} is not a valid host name or address`)
  return s.replace(/^\[(.*)\]$/, '$1')
}
const COLOR_RE = /^#[0-9a-fA-F]{6}$/

function emptyData() {
  return { version: 1, groups: [], credentials: [], snippetPackages: [], snippets: [], hosts: [], knownHosts: [], tunnels: [], sessionLogs: [], settings: {} }
}

export const DEFAULT_TERMINAL_SETTINGS = {
  fontSize: 13, fontFamily: 'Geist Mono Variable', lineHeight: 1.15, cursorStyle: 'block', cursorBlink: true, scrollback: 10000,
  copyOnSelect: false, rightClickPaste: true, bell: false, confirmClose: true, defaultThemeId: 'darkhub-midnight', logByDefault: false
}

export function normalizeTerminalSettings(input = {}, base = DEFAULT_TERMINAL_SETTINGS) {
  const n = (v, min, max, d) => (Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max ? Number(v) : d)
  const b = (v, d) => (typeof v === 'boolean' ? v : d)
  return {
    fontSize: Math.round(n(input.fontSize, 8, 32, base.fontSize)),
    fontFamily: typeof input.fontFamily === 'string' && /^[A-Za-z0-9 ,"'_-]{1,80}$/.test(input.fontFamily) ? input.fontFamily : base.fontFamily,
    lineHeight: n(input.lineHeight, 1, 2, base.lineHeight),
    cursorStyle: ['block', 'bar', 'underline'].includes(input.cursorStyle) ? input.cursorStyle : base.cursorStyle,
    cursorBlink: b(input.cursorBlink, base.cursorBlink),
    scrollback: Math.round(n(input.scrollback, 500, 200000, base.scrollback)),
    copyOnSelect: b(input.copyOnSelect, base.copyOnSelect),
    rightClickPaste: b(input.rightClickPaste, base.rightClickPaste),
    bell: b(input.bell, base.bell),
    confirmClose: b(input.confirmClose, base.confirmClose),
    defaultThemeId: typeof input.defaultThemeId === 'string' && /^[a-z0-9-]{1,48}$/.test(input.defaultThemeId) ? input.defaultThemeId : base.defaultThemeId,
    logByDefault: b(input.logByDefault, base.logByDefault)
  }
}

export class SshVaultStore {
  /**
   * @param {{ file?: string, getKey: () => Buffer, persist?: boolean }} opts
   *   getKey returns the 32-byte vault key. persist:false keeps everything in memory (tests).
   */
  constructor({ file, getKey, persist = true } = {}) {
    if (typeof getKey !== 'function') throw new Error('getKey is required')
    this.file = file
    this.getKey = getKey
    this.persist = persist && Boolean(file)
    this.data = emptyData()
    this.loaded = false
  }

  load() {
    if (this.loaded) return this
    this.loaded = true
    if (!this.persist) return this
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      const base = emptyData()
      for (const k of Object.keys(base)) if (Array.isArray(base[k]) && Array.isArray(raw?.[k])) base[k] = raw[k]
      if (raw?.settings && typeof raw.settings === 'object') base.settings = raw.settings
      this.data = base
    } catch (err) {
      if (err?.code !== 'ENOENT') {
        // keep a copy of a damaged vault instead of silently overwriting it
        try { fs.copyFileSync(this.file, `${this.file}.corrupt-${Date.now()}`) } catch { /* nothing to keep */ }
      }
      this.data = emptyData()
    }
    return this
  }

  save() {
    if (!this.persist) return
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(this.data))
    fs.renameSync(tmp, this.file)
  }

  // ---------- crypto helpers ----------
  encrypt(text) {
    if (text == null || text === '') return null
    return JSON.stringify(aesGcmEncrypt(this.getKey(), Buffer.from(String(text), 'utf8')))
  }

  decrypt(envelope) {
    if (!envelope) return null
    try { return aesGcmDecrypt(this.getKey(), JSON.parse(envelope)).toString('utf8') } catch { fail('VAULT_LOCKED', 'Could not decrypt a vault secret') }
    return null
  }

  // ---------- projections ----------
  static credentialSummary(c) {
    return {
      id: c.id, label: c.label, kind: c.kind, username: c.username, algorithm: c.algorithm ?? null,
      publicKey: c.publicKey ?? null, fingerprintSha256: c.fingerprintSha256 ?? null,
      hasSecret: Boolean(c.secretCipherJson), hasPassphrase: Boolean(c.passphraseCipherJson),
      createdAt: c.createdAt, updatedAt: c.updatedAt
    }
  }

  getState() {
    this.load()
    const d = this.data
    return {
      groups: d.groups.map((g) => ({ ...g })),
      hosts: d.hosts.map((h) => ({ logSession: false, agentForward: false, ...h, tags: [...(h.tags || [])] })),
      credentials: d.credentials.map(SshVaultStore.credentialSummary),
      knownHosts: d.knownHosts.map((k) => ({ ...k })),
      packages: d.snippetPackages.map((p) => ({ ...p })),
      snippets: d.snippets.map((s) => ({ ...s, argsSchema: s.argsSchema.map((a) => ({ ...a })), tags: [...s.tags] })),
      tunnels: d.tunnels.map((t) => ({ ...t })),
      sessionLogs: d.sessionLogs.slice(-100).reverse().map((l) => ({ ...l })),
      settings: this.getSettings()
    }
  }

  getSettings() {
    this.load()
    return { terminal: normalizeTerminalSettings(this.data.settings?.terminal ?? {}) }
  }

  saveSettings(input = {}) {
    this.load()
    const terminal = normalizeTerminalSettings(input.terminal ?? {}, normalizeTerminalSettings(this.data.settings?.terminal ?? {}))
    this.data.settings = { ...(this.data.settings ?? {}), terminal }
    this.save()
    return this.getSettings()
  }

  // ---------- groups ----------
  saveGroup(input = {}) {
    this.load()
    const id = optId(input.id)
    const existing = id ? this.data.groups.find((g) => g.id === id) : null
    if (id && !existing) fail('NOT_FOUND', 'group not found')
    const parentId = optId(input.parentId)
    const gid = existing?.id ?? newId('grp')
    if (parentId) {
      if (parentId === gid) fail('VALIDATION', 'a group cannot be its own parent')
      if (!this.data.groups.some((g) => g.id === parentId)) fail('VALIDATION', 'parent group not found')
      // walk up from the new parent: reaching this group means a cycle
      let cur = parentId
      for (let depth = 0; cur; depth += 1) {
        if (cur === gid || depth > 32) fail('VALIDATION', 'group hierarchy would form a cycle')
        cur = this.data.groups.find((g) => g.id === cur)?.parentId ?? null
      }
    }
    const color = typeof input.color === 'string' && COLOR_RE.test(input.color) ? input.color : existing?.color ?? '#38bdf8'
    const group = {
      id: gid,
      parentId,
      name: req(input.name, 'name', 120),
      icon: str(input.icon, 32).trim() || existing?.icon || 'folder',
      color,
      sortOrder: Number.isInteger(input.sortOrder) ? input.sortOrder : existing?.sortOrder ?? 0,
      createdAt: existing?.createdAt ?? now(),
      updatedAt: now()
    }
    if (existing) Object.assign(existing, group)
    else this.data.groups.push(group)
    this.save()
    return { ...group }
  }

  deleteGroup(id) {
    this.load()
    const before = this.data.groups.length
    this.data.groups = this.data.groups.filter((g) => g.id !== id)
    if (before === this.data.groups.length) fail('NOT_FOUND', 'group not found')
    for (const g of this.data.groups) if (g.parentId === id) g.parentId = null
    for (const h of this.data.hosts) if (h.groupId === id) h.groupId = null
    this.save()
  }

  // ---------- hosts ----------
  getHost(id) {
    this.load()
    return this.data.hosts.find((h) => h.id === id) ?? null
  }

  /** Jump chain from the outermost bastion to the host itself: [bastion, ..., host]. */
  resolveJumpChain(hostId) {
    const chain = []
    const seen = new Set()
    let cur = this.getHost(hostId)
    if (!cur) fail('NOT_FOUND', 'host not found')
    while (cur) {
      if (seen.has(cur.id)) fail('VALIDATION', 'jump host chain forms a cycle')
      if (chain.length > MAX_JUMP_DEPTH) fail('VALIDATION', `jump host chain deeper than ${MAX_JUMP_DEPTH}`)
      seen.add(cur.id)
      chain.unshift(cur)
      cur = cur.jumpHostId ? this.getHost(cur.jumpHostId) : null
      if (chain[0].jumpHostId && !cur) fail('VALIDATION', 'jump host not found')
    }
    return chain
  }

  saveHost(input = {}) {
    this.load()
    const id = optId(input.id)
    const existing = id ? this.data.hosts.find((h) => h.id === id) : null
    if (id && !existing) fail('NOT_FOUND', 'host not found')
    const hid = existing?.id ?? newId('host')
    const groupId = optId(input.groupId)
    if (groupId && !this.data.groups.some((g) => g.id === groupId)) fail('VALIDATION', 'group not found')
    const credentialId = optId(input.credentialId)
    if (credentialId && !this.data.credentials.some((c) => c.id === credentialId)) fail('VALIDATION', 'credential not found')
    const startupSnippetId = optId(input.startupSnippetId)
    if (startupSnippetId && !this.data.snippets.some((s) => s.id === startupSnippetId)) fail('VALIDATION', 'startup snippet not found')
    const jumpHostId = optId(input.jumpHostId)
    if (jumpHostId) {
      if (jumpHostId === hid) fail('VALIDATION', 'a host cannot be its own jump host')
      if (!this.data.hosts.some((h) => h.id === jumpHostId)) fail('VALIDATION', 'jump host not found')
      // walk the bastion chain: reaching this host again (or going too deep) is rejected
      let cur = jumpHostId
      for (let depth = 0; cur; depth += 1) {
        if (cur === hid) fail('VALIDATION', 'jump host chain would form a cycle')
        if (depth >= MAX_JUMP_DEPTH) fail('VALIDATION', `jump host chain deeper than ${MAX_JUMP_DEPTH}`)
        cur = this.data.hosts.find((h) => h.id === cur)?.jumpHostId ?? null
      }
    }
    const osIcon = OS_ICONS.includes(input.osIcon) ? input.osIcon : existing?.osIcon ?? 'linux'
    const keepalive = input.keepaliveIntervalMs == null ? existing?.keepaliveIntervalMs ?? 15000 : Number(input.keepaliveIntervalMs)
    if (!Number.isInteger(keepalive) || keepalive < 0 || keepalive > 300000) fail('VALIDATION', 'keepalive must be between 0 and 300000 ms')
    const host = {
      id: hid,
      groupId,
      label: req(input.label || input.hostname, 'label', 120),
      hostname: hostname(input.hostname),
      port: input.port == null || input.port === '' ? 22 : validPort(input.port),
      username: str(input.username, 64).trim() || 'root',
      osIcon,
      credentialId,
      jumpHostId,
      startupSnippetId,
      themeId: str(input.themeId, 48).trim() || existing?.themeId || 'darkhub-midnight',
      charset: str(input.charset, 24).trim() || existing?.charset || 'utf-8',
      keepaliveIntervalMs: keepalive,
      logSession: typeof input.logSession === 'boolean' ? input.logSession : existing?.logSession ?? false,
      agentForward: typeof input.agentForward === 'boolean' ? input.agentForward : existing?.agentForward ?? false,
      tags: tags(input.tags),
      lastConnectedAt: existing?.lastConnectedAt ?? null,
      createdAt: existing?.createdAt ?? now(),
      updatedAt: now()
    }
    if (/[\s\x00-\x1f]/.test(host.username)) fail('VALIDATION', 'username has invalid characters')
    if (existing) Object.assign(existing, host)
    else this.data.hosts.push(host)
    this.save()
    return { ...host, tags: [...host.tags] }
  }

  deleteHost(id) {
    this.load()
    const before = this.data.hosts.length
    this.data.hosts = this.data.hosts.filter((h) => h.id !== id)
    if (before === this.data.hosts.length) fail('NOT_FOUND', 'host not found')
    for (const h of this.data.hosts) if (h.jumpHostId === id) h.jumpHostId = null
    const removedTunnels = this.data.tunnels.filter((t) => t.hostId === id).map((t) => t.id)
    this.data.tunnels = this.data.tunnels.filter((t) => t.hostId !== id)
    for (const l of this.data.sessionLogs) if (l.hostId === id) l.hostId = null
    this.save()
    return { removedTunnels }
  }

  touchHost(id) {
    const h = this.getHost(id)
    if (!h) return
    h.lastConnectedAt = now()
    this.save()
  }

  // ---------- credentials / keychain ----------
  saveCredential(input = {}) {
    this.load()
    const id = optId(input.id)
    const existing = id ? this.data.credentials.find((c) => c.id === id) : null
    if (id && !existing) fail('NOT_FOUND', 'credential not found')
    const kind = CREDENTIAL_KINDS.includes(input.kind) ? input.kind : existing?.kind ?? null
    if (!kind) fail('VALIDATION', 'kind must be password, ssh_key or agent')
    const cred = {
      id: existing?.id ?? newId('cred'),
      label: req(input.label, 'label', 120),
      kind,
      username: str(input.username, 64).trim(),
      algorithm: existing?.algorithm ?? null,
      publicKey: existing?.publicKey ?? null,
      fingerprintSha256: existing?.fingerprintSha256 ?? null,
      secretCipherJson: existing?.secretCipherJson ?? null,
      passphraseCipherJson: existing?.passphraseCipherJson ?? null,
      createdAt: existing?.createdAt ?? now(),
      updatedAt: now()
    }
    if (kind !== (existing?.kind ?? kind)) {
      // switching kind drops the old secret material
      Object.assign(cred, { algorithm: null, publicKey: null, fingerprintSha256: null, secretCipherJson: null, passphraseCipherJson: null })
    }
    if (kind === 'password') {
      Object.assign(cred, { algorithm: null, publicKey: null, fingerprintSha256: null, passphraseCipherJson: null })
      if (typeof input.secret === 'string' && input.secret.length) cred.secretCipherJson = this.encrypt(input.secret.slice(0, MAX_TEXT))
      if (!cred.secretCipherJson) fail('VALIDATION', 'password is required')
    } else if (kind === 'ssh_key') {
      const passphrase = typeof input.passphrase === 'string' && input.passphrase.length ? input.passphrase : null
      if (typeof input.privateKey === 'string' && input.privateKey.trim()) {
        const keyText = input.privateKey.trim().slice(0, 32 * 1024) + '\n'
        const parsed = parsePrivateKey(keyText, passphrase ?? (existing ? this.decrypt(existing.passphraseCipherJson) : null))
        cred.algorithm = parsed.algorithm
        cred.publicKey = parsed.publicKey
        cred.fingerprintSha256 = parsed.fingerprintSha256
        cred.secretCipherJson = this.encrypt(keyText)
        cred.passphraseCipherJson = passphrase ? this.encrypt(passphrase) : (existing?.passphraseCipherJson ?? null)
      } else if (passphrase && cred.secretCipherJson) {
        // new passphrase for the stored key: check it actually opens the key
        parsePrivateKey(this.decrypt(cred.secretCipherJson), passphrase)
        cred.passphraseCipherJson = this.encrypt(passphrase)
      }
      if (!cred.secretCipherJson) fail('VALIDATION', 'private key is required')
    } else {
      // agent: Pageant / OpenSSH agent on the machine; nothing secret to store
      Object.assign(cred, { algorithm: null, publicKey: null, fingerprintSha256: null, secretCipherJson: null, passphraseCipherJson: null })
    }
    if (existing) Object.assign(existing, cred)
    else this.data.credentials.push(cred)
    this.save()
    return SshVaultStore.credentialSummary(cred)
  }

  async generateKey(input = {}) {
    this.load()
    const algorithm = input.algorithm === 'rsa-4096' ? 'rsa-4096' : input.algorithm === 'ed25519' || input.algorithm == null ? 'ed25519' : fail('VALIDATION', 'algorithm must be ed25519 or rsa-4096')
    const label = req(input.label, 'label', 120)
    const passphrase = typeof input.passphrase === 'string' && input.passphrase.length ? input.passphrase : null
    const pair = await generateSshKeyPair(algorithm, { passphrase, comment: `${label.replace(/[^A-Za-z0-9._-]+/g, '-')}@darkhub` })
    const info = publicKeyInfo(pair.publicKey)
    const cred = {
      id: newId('cred'),
      label,
      kind: 'ssh_key',
      username: str(input.username, 64).trim(),
      algorithm,
      publicKey: pair.publicKey,
      fingerprintSha256: info.fingerprintSha256,
      secretCipherJson: this.encrypt(pair.privateKey),
      passphraseCipherJson: passphrase ? this.encrypt(passphrase) : null,
      createdAt: now(),
      updatedAt: now()
    }
    this.data.credentials.push(cred)
    this.save()
    return { credential: SshVaultStore.credentialSummary(cred), publicKey: pair.publicKey }
  }

  deleteCredential(id) {
    this.load()
    const before = this.data.credentials.length
    this.data.credentials = this.data.credentials.filter((c) => c.id !== id)
    if (before === this.data.credentials.length) fail('NOT_FOUND', 'credential not found')
    for (const h of this.data.hosts) if (h.credentialId === id) h.credentialId = null
    this.save()
  }

  /** Main process only: plaintext auth material for ssh2.Client.connect(). Never send this over IPC. */
  getAuthMaterial(credentialId) {
    this.load()
    const c = this.data.credentials.find((x) => x.id === credentialId)
    if (!c) return null
    if (c.kind === 'password') return { kind: 'password', username: c.username, password: this.decrypt(c.secretCipherJson) }
    if (c.kind === 'ssh_key') return { kind: 'ssh_key', username: c.username, privateKey: this.decrypt(c.secretCipherJson), passphrase: this.decrypt(c.passphraseCipherJson) }
    return { kind: 'agent', username: c.username }
  }

  // ---------- known hosts (TOFU) ----------
  findKnownHost(host, port) {
    this.load()
    const h = String(host).toLowerCase()
    return this.data.knownHosts.find((k) => k.hostname.toLowerCase() === h && k.port === Number(port)) ?? null
  }

  /**
   * TOFU decision for a presented key: 'trusted' (same fingerprint), 'unknown' (first contact) or 'mismatch'
   * (endpoint known with another key: possible MITM or reinstalled server).
   */
  checkHostKey(host, port, fingerprintSha256) {
    const known = this.findKnownHost(host, port)
    if (!known) return { status: 'unknown', known: null }
    if (known.fingerprintSha256 === fingerprintSha256) {
      known.lastSeenAt = now()
      this.save()
      return { status: 'trusted', known: { ...known } }
    }
    return { status: 'mismatch', known: { ...known } }
  }

  trustKnownHost(input = {}) {
    this.load()
    const host = hostname(input.hostname)
    const port = validPort(input.port ?? 22)
    const keyType = req(input.keyType, 'keyType', 64)
    const fingerprintSha256 = req(input.fingerprintSha256, 'fingerprintSha256', 128)
    if (!/^SHA256:[A-Za-z0-9+/]{43}$/.test(fingerprintSha256)) fail('VALIDATION', 'fingerprint must be an OpenSSH SHA256 fingerprint')
    const publicKeyB64 = req(input.publicKeyB64, 'publicKeyB64', 16384)
    if (!/^[A-Za-z0-9+/]+=*$/.test(publicKeyB64)) fail('VALIDATION', 'public key must be base64')
    const existing = this.findKnownHost(host, port)
    const entry = {
      id: existing?.id ?? newId('kh'),
      hostname: host,
      port,
      keyType,
      fingerprintSha256,
      publicKeyB64,
      trustedAt: now(),
      lastSeenAt: now()
    }
    if (existing) Object.assign(existing, entry)
    else this.data.knownHosts.push(entry)
    this.save()
    return { ...entry }
  }

  deleteKnownHost(id) {
    this.load()
    const before = this.data.knownHosts.length
    this.data.knownHosts = this.data.knownHosts.filter((k) => k.id !== id)
    if (before === this.data.knownHosts.length) fail('NOT_FOUND', 'known host not found')
    this.save()
  }

  // ---------- snippets ----------
  getSnippet(id) {
    this.load()
    return this.data.snippets.find((s) => s.id === id) ?? null
  }

  savePackage(input = {}) {
    this.load()
    const id = optId(input.id)
    const existing = id ? this.data.snippetPackages.find((p) => p.id === id) : null
    if (id && !existing) fail('NOT_FOUND', 'package not found')
    const pkg = {
      id: existing?.id ?? newId('pkg'),
      name: req(input.name, 'name', 120),
      description: str(input.description, 500),
      icon: str(input.icon, 32).trim() || 'terminal',
      createdAt: existing?.createdAt ?? now(),
      updatedAt: now()
    }
    if (existing) Object.assign(existing, pkg)
    else this.data.snippetPackages.push(pkg)
    this.save()
    return { ...pkg }
  }

  saveSnippet(input = {}) {
    this.load()
    const id = optId(input.id)
    const existing = id ? this.data.snippets.find((s) => s.id === id) : null
    if (id && !existing) fail('NOT_FOUND', 'snippet not found')
    const packageId = optId(input.packageId)
    if (packageId && !this.data.snippetPackages.some((p) => p.id === packageId)) fail('VALIDATION', 'package not found')
    const body = str(input.body, MAX_BODY)
    if (!body.trim()) fail('VALIDATION', 'body is required')
    const snippet = {
      id: existing?.id ?? newId('snip'),
      packageId,
      name: req(input.name, 'name', 120),
      body,
      argsSchema: normalizeArgsSchema(input.argsSchema, body),
      tags: tags(input.tags),
      runOnConnect: input.runOnConnect === true,
      createdAt: existing?.createdAt ?? now(),
      updatedAt: now()
    }
    if (existing) Object.assign(existing, snippet)
    else this.data.snippets.push(snippet)
    this.save()
    return { ...snippet }
  }

  deleteSnippet(id, kind = 'snippet') {
    this.load()
    if (kind === 'package') {
      const before = this.data.snippetPackages.length
      this.data.snippetPackages = this.data.snippetPackages.filter((p) => p.id !== id)
      if (before === this.data.snippetPackages.length) fail('NOT_FOUND', 'package not found')
      for (const s of this.data.snippets) if (s.packageId === id) s.packageId = null
    } else {
      const before = this.data.snippets.length
      this.data.snippets = this.data.snippets.filter((s) => s.id !== id)
      if (before === this.data.snippets.length) fail('NOT_FOUND', 'snippet not found')
      for (const h of this.data.hosts) if (h.startupSnippetId === id) h.startupSnippetId = null
    }
    this.save()
  }

  // ---------- tunnels ----------
  getTunnel(id) {
    this.load()
    return this.data.tunnels.find((t) => t.id === id) ?? null
  }

  saveTunnel(input = {}) {
    this.load()
    const id = optId(input.id)
    const existing = id ? this.data.tunnels.find((t) => t.id === id) : null
    if (id && !existing) fail('NOT_FOUND', 'tunnel not found')
    const kind = TUNNEL_KINDS.includes(input.kind) ? input.kind : fail('VALIDATION', 'kind must be local, remote or dynamic')
    const hostId = optId(input.hostId)
    if (!hostId || !this.data.hosts.some((h) => h.id === hostId)) fail('VALIDATION', 'host not found')
    const bindAddress = input.bindAddress ? hostname(input.bindAddress, 'bindAddress') : '127.0.0.1'
    const bindPort = validPort(input.bindPort, 'bindPort')
    let targetHost = null
    let targetPort = null
    if (kind !== 'dynamic') {
      targetHost = hostname(input.targetHost, 'targetHost')
      targetPort = validPort(input.targetPort, 'targetPort')
    }
    const tid = existing?.id ?? newId('tun')
    // uq_local_bind: two rules of the same kind cannot claim the same bind address + port
    if (this.data.tunnels.some((t) => t.id !== tid && t.kind === kind && t.bindAddress === bindAddress && t.bindPort === bindPort)) {
      fail('PORT_CONFLICT', `${bindAddress}:${bindPort} is already used by another ${kind} rule`)
    }
    const tunnel = {
      id: tid,
      hostId,
      label: req(input.label || `${kind} ${bindPort}`, 'label', 120),
      kind,
      bindAddress,
      bindPort,
      targetHost,
      targetPort,
      autoStart: input.autoStart === true,
      createdAt: existing?.createdAt ?? now(),
      updatedAt: now()
    }
    if (existing) Object.assign(existing, tunnel)
    else this.data.tunnels.push(tunnel)
    this.save()
    return { ...tunnel }
  }

  deleteTunnel(id) {
    this.load()
    const before = this.data.tunnels.length
    this.data.tunnels = this.data.tunnels.filter((t) => t.id !== id)
    if (before === this.data.tunnels.length) fail('NOT_FOUND', 'tunnel not found')
    this.save()
  }

  // ---------- session logs ----------
  addSessionLog(hostId) {
    this.load()
    const h = this.getHost(hostId)
    const log = {
      id: newId('log'),
      hostId: h?.id ?? null,
      hostSnapshot: h ? `${h.username}@${h.hostname}:${h.port}` : 'unknown',
      startedAt: now(),
      endedAt: null,
      status: 'connecting',
      logFilePath: null,
      errorCode: null
    }
    this.data.sessionLogs.push(log)
    if (this.data.sessionLogs.length > MAX_SESSION_LOGS) this.data.sessionLogs.splice(0, this.data.sessionLogs.length - MAX_SESSION_LOGS)
    this.save()
    return log.id
  }

  updateSessionLog(id, { status, errorCode, ended, logFilePath } = {}) {
    const log = this.data.sessionLogs.find((l) => l.id === id)
    if (!log) return
    if (typeof logFilePath === 'string') log.logFilePath = logFilePath
    if (SESSION_STATUSES.includes(status)) log.status = status
    if (errorCode) log.errorCode = str(errorCode, 64)
    if (ended && !log.endedAt) log.endedAt = now()
    this.save()
  }
}
