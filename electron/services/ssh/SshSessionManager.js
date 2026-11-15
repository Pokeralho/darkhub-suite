import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { hostKeyInfo } from './sshKeys.js'
import { renderSnippet } from './snippetTemplate.js'

const require = createRequire(import.meta.url)

export const HOSTKEY_TIMEOUT_MS = 60_000
export const AUTH_PROMPT_TIMEOUT_MS = 120_000
const FLUSH_MS = 8
const FLUSH_BYTES = 16 * 1024
const PAUSE_BYTES = 256 * 1024
const MAX_SESSIONS = 48
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/

export class SshConnectError extends Error {
  constructor(code, message) {
    super(message || code)
    this.code = code
  }
}

/** Maps an ssh2 error to the session_logs status vocabulary. */
export function classifyError(err) {
  if (err?.code === 'HOSTKEY_REJECTED') return 'hostkey_rejected'
  if (err?.level === 'client-authentication' || /authentication/i.test(err?.message ?? '')) return 'auth_failed'
  return 'error'
}

function errorCode(err) {
  if (err?.code === 'HOSTKEY_REJECTED') return 'HOSTKEY_REJECTED'
  if (classifyError(err) === 'auth_failed') return 'AUTH_FAILED'
  if (err?.level === 'client-timeout' || /timed out/i.test(err?.message ?? '')) return 'TIMEOUT'
  if (typeof err?.code === 'string') return err.code
  return 'ERROR'
}

const safeMessage = (err) => String(err?.message ?? err ?? 'error').slice(0, 300)

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][A-Za-z0-9]|\x1b[=>78DEHMNOZc]/g
/** Terminal output → readable log text (escape sequences removed, CR-LF kept as LF, lone CR dropped). */
export function stripAnsi(text) {
  return String(text).replace(ANSI_RE, '').replace(/\r\n/g, '\n').replace(/\r(?!\n)/g, '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
}

function makeDecoder(charset) {
  try { return new TextDecoder(charset || 'utf-8', { fatal: false }) } catch { return new TextDecoder('utf-8') }
}

/**
 * Owns every ssh2 connection of the app: SSH shells (terminal panes), plus the clients that SFTP and port
 * forwarding open through connectClient(). Handles ProxyJump chains, TOFU host key checks (paused handshake until
 * the user decides, 60 s timeout) and PTY output coalescing.
 *
 * Events: 'hostkey' ({ requestId, ownerId, hostId, hostname, port, keyType, fingerprintSha256, publicKeyB64,
 * status: 'unknown' | 'mismatch', knownFingerprint }) and 'hostkey:resolved' ({ requestId, accepted }).
 */
export class SshSessionManager extends EventEmitter {
  constructor({ store, ClientClass, logger, logsDir, serial } = {}) {
    super()
    this.store = store
    this.logsDir = logsDir ?? null
    this.serial = serial ?? null
    this.authPrompts = new Map()
    this.ClientClass = ClientClass ?? null
    this.logger = logger
    this.sessions = new Map()
    this.prompts = new Map()
  }

  get Client() {
    if (!this.ClientClass) this.ClientClass = require('ssh2').Client
    return this.ClientClass
  }

  // ---------- TOFU prompts ----------
  /** Resolves a pending host key prompt. accept=true also stores the key in known_hosts. */
  resolveHostKey(requestId, accept) {
    const p = this.prompts.get(requestId)
    if (!p) return null
    this.prompts.delete(requestId)
    clearTimeout(p.timer)
    let knownHost = null
    if (accept) knownHost = this.store.trustKnownHost({ hostname: p.info.hostname, port: p.info.port, keyType: p.info.keyType, fingerprintSha256: p.info.fingerprintSha256, publicKeyB64: p.info.publicKeyB64 })
    p.resolve(Boolean(accept))
    this.emit('hostkey:resolved', { requestId, accepted: Boolean(accept) })
    return { knownHost }
  }

  pendingPrompts() {
    return [...this.prompts.values()].map((p) => ({ ...p.info }))
  }

  makeVerifier(host, ownerId, interactive, state) {
    return (key, verify) => {
      const info = hostKeyInfo(key)
      const check = this.store.checkHostKey(host.hostname, host.port, info.fingerprintSha256)
      if (check.status === 'trusted') return verify(true)
      if (!interactive) { state.hostKeyRejected = true; return verify(false) }
      const requestId = `hk_${crypto.randomBytes(6).toString('hex')}`
      const prompt = {
        requestId, ownerId, hostId: host.id, hostLabel: host.label, hostname: host.hostname, port: host.port,
        ...info, status: check.status, knownFingerprint: check.known?.fingerprintSha256 ?? null
      }
      const timer = setTimeout(() => this.resolveHostKey(requestId, false), HOSTKEY_TIMEOUT_MS)
      this.prompts.set(requestId, {
        info: prompt,
        timer,
        resolve: (ok) => { if (!ok) state.hostKeyRejected = true; verify(ok) }
      })
      this.emit('hostkey', prompt)
    }
  }

  /** Cancels prompts owned by a session/sftp/tunnel that is going away. */
  cancelPromptsOf(ownerId) {
    for (const [id, p] of this.prompts) if (p.info.ownerId === ownerId) this.resolveHostKey(id, false)
    for (const [id, p] of this.authPrompts) if (p.info.ownerId === ownerId) this.resolveAuthPrompt(id, null)
  }

  // ---------- keyboard-interactive (2FA / OTP / custom PAM prompts) ----------
  /** answers=null cancels the login. */
  resolveAuthPrompt(requestId, answers) {
    const p = this.authPrompts.get(requestId)
    if (!p) return false
    this.authPrompts.delete(requestId)
    clearTimeout(p.timer)
    const list = Array.isArray(answers) ? answers.map((a) => String(a ?? '').slice(0, 1024)) : null
    p.finish(list)
    this.emit('auth:resolved', { requestId })
    return true
  }

  pendingAuthPrompts() {
    return [...this.authPrompts.values()].map((p) => ({ ...p.info }))
  }

  makeKeyboardHandler(host, ownerId, interactive, auth) {
    let usedPassword = false
    return (name, instructions, _lang, prompts, finish) => {
      if (!prompts.length) return finish([])
      // a single hidden prompt with a saved/typed password is answered automatically, once
      if (auth.password && !usedPassword && prompts.length === 1 && !prompts[0].echo) { usedPassword = true; return finish([auth.password]) }
      if (!interactive) return finish(prompts.map(() => auth.password ?? ''))
      const requestId = `ka_${crypto.randomBytes(6).toString('hex')}`
      const info = {
        requestId, ownerId, hostId: host.id, hostLabel: host.label, hostname: host.hostname,
        name: String(name ?? '').slice(0, 200), instructions: String(instructions ?? '').slice(0, 1000),
        prompts: prompts.map((pr) => ({ prompt: String(pr.prompt ?? '').slice(0, 300), echo: Boolean(pr.echo) }))
      }
      const timer = setTimeout(() => this.resolveAuthPrompt(requestId, null), AUTH_PROMPT_TIMEOUT_MS)
      this.authPrompts.set(requestId, {
        info,
        timer,
        // cancelling sends empty answers: the server rejects the attempt and the connection fails as auth_failed
        finish: (answers) => finish(answers ?? prompts.map(() => ''))
      })
      this.emit('auth', info)
    }
  }

  // ---------- connection ----------
  authFor(host, overridePassword) {
    const material = host.credentialId ? this.store.getAuthMaterial(host.credentialId) : null
    const username = material?.username || host.username || 'root'
    const auth = { username }
    if (material?.kind === 'password') auth.password = material.password
    else if (material?.kind === 'ssh_key') {
      auth.privateKey = material.privateKey
      if (material.passphrase) auth.passphrase = material.passphrase
    } else if (material?.kind === 'agent') {
      auth.agent = process.env.SSH_AUTH_SOCK || (process.platform === 'win32' ? '\\\\.\\pipe\\openssh-ssh-agent' : undefined)
    }
    if (typeof overridePassword === 'string' && overridePassword.length) auth.password = overridePassword
    // agent forwarding needs an agent even when the login itself uses a key or password
    if (host.agentForward && !auth.agent) auth.agent = process.env.SSH_AUTH_SOCK || (process.platform === 'win32' ? '\\\\.\\pipe\\openssh-ssh-agent' : undefined)
    return auth
  }

  connectOne(host, { sock, ownerId, interactive, password }) {
    const auth = this.authFor(host, password)
    const state = { hostKeyRejected: false }
    return new Promise((resolve, reject) => {
      const client = new this.Client()
      let settled = false
      client.on('keyboard-interactive', this.makeKeyboardHandler(host, ownerId, interactive, auth))
      client.once('ready', () => { settled = true; resolve(client) })
      client.on('error', (err) => {
        if (settled) return
        settled = true
        try { client.end() } catch { /* already gone */ }
        if (state.hostKeyRejected) reject(new SshConnectError('HOSTKEY_REJECTED', `Host key for ${host.hostname}:${host.port} was not trusted`))
        else reject(err)
      })
      client.once('close', () => {
        if (settled) return
        settled = true
        reject(state.hostKeyRejected ? new SshConnectError('HOSTKEY_REJECTED', 'Host key was not trusted') : new SshConnectError('CLOSED', 'Connection closed during handshake'))
      })
      try {
        client.connect({
          host: host.hostname,
          port: host.port,
          sock,
          readyTimeout: 25_000,
          keepaliveInterval: host.keepaliveIntervalMs ?? 15_000,
          keepaliveCountMax: 3,
          tryKeyboard: true,
          agentForward: Boolean(host.agentForward && auth.agent),
          hostVerifier: this.makeVerifier(host, ownerId, interactive, state),
          ...auth
        })
      } catch (err) {
        settled = true
        reject(err)
      }
    })
  }

  /**
   * Connects to a host through its jump chain. Returns { client, chain } where chain lists every ssh2 client from
   * the outermost bastion to the target (client === chain.at(-1)). onDrop fires once when any link of the chain
   * closes, so dependents of a dead bastion are marked disconnected.
   */
  async connectClient(hostId, { ownerId, interactive = true, password, onDrop } = {}) {
    const hosts = this.store.resolveJumpChain(hostId)
    const chain = []
    try {
      let sock
      for (let i = 0; i < hosts.length; i += 1) {
        const h = hosts[i]
        const c = await this.connectOne(h, { sock, ownerId, interactive, password: i === hosts.length - 1 ? password : undefined })
        chain.push(c)
        const next = hosts[i + 1]
        if (next) {
          sock = await new Promise((resolve, reject) => c.forwardOut('127.0.0.1', 0, next.hostname, next.port, (err, stream) => (err ? reject(new SshConnectError('JUMP_FAILED', `Bastion ${h.label} could not reach ${next.hostname}:${next.port}: ${safeMessage(err)}`)) : resolve(stream))))
        }
      }
    } catch (err) {
      for (const c of chain.reverse()) { try { c.end() } catch { /* closing */ } }
      throw err
    }
    let dropped = false
    const drop = (reason) => {
      if (dropped) return
      dropped = true
      for (const c of [...chain].reverse()) { try { c.end() } catch { /* closing */ } }
      onDrop?.(reason)
    }
    for (const c of chain) {
      c.on('close', () => drop('closed'))
      c.on('error', (err) => drop(safeMessage(err)))
    }
    return { client: chain[chain.length - 1], chain, close: () => drop('closed by user') }
  }

  // ---------- terminal sessions ----------
  /**
   * Opens an interactive PTY shell. send(channel, payload) delivers 'ssh:session:data' / 'ssh:session:status' to the
   * renderer that owns the pane.
   */
  async openSession({ sessionId, hostId, cols = 80, rows = 24, password } = {}, send = () => {}) {
    if (typeof sessionId !== 'string' || !ID_RE.test(sessionId)) throw new SshConnectError('VALIDATION', 'invalid sessionId')
    if (this.sessions.has(sessionId)) throw new SshConnectError('VALIDATION', 'session already exists')
    if (this.sessions.size >= MAX_SESSIONS) throw new SshConnectError('LIMIT', `at most ${MAX_SESSIONS} sessions`)
    const host = this.store.getHost(hostId)
    if (!host) throw new SshConnectError('NOT_FOUND', 'host not found')
    const c = Math.max(10, Math.min(1000, Number(cols) || 80))
    const r = Math.max(4, Math.min(500, Number(rows) || 24))

    const session = {
      id: sessionId, hostId, send, status: 'connecting', conn: null, stream: null, logId: this.store.addSessionLog(hostId),
      chunks: [], bytes: 0, timer: null, paused: false, decoder: makeDecoder(host.charset), closed: false
    }
    this.sessions.set(sessionId, session)
    const status = (s, extra = {}) => {
      session.status = s
      try { send('ssh:session:status', { sessionId, status: s, ...extra }) } catch { /* window gone */ }
    }
    status('connecting', { hostId })

    try {
      session.conn = await this.connectClient(hostId, {
        ownerId: sessionId,
        password,
        onDrop: (reason) => this.finish(sessionId, 'closed', reason === 'closed' || reason === 'closed by user' ? undefined : reason)
      })
      if (session.closed) { session.conn.close(); return { ok: false, code: 'CANCELLED' } }
      session.stream = await new Promise((resolve, reject) => session.conn.client.shell({ term: 'xterm-256color', cols: c, rows: r }, (err, stream) => (err ? reject(err) : resolve(stream))))
    } catch (err) {
      const kind = classifyError(err)
      this.store.updateSessionLog(session.logId, { status: kind, errorCode: errorCode(err), ended: true })
      this.sessions.delete(sessionId)
      session.closed = true
      try { session.conn?.close() } catch { /* closing */ }
      status(kind === 'error' ? 'error' : kind, { error: safeMessage(err), code: errorCode(err) })
      return { ok: false, code: errorCode(err), error: safeMessage(err) }
    }

    const stream = session.stream
    if ((host.logSession || this.store.getSettings?.().terminal.logByDefault) && this.logsDir) this.startLog(session, host)
    stream.on('data', (buf) => this.push(session, buf))
    stream.stderr?.on('data', (buf) => this.push(session, buf))
    stream.on('close', () => this.finish(sessionId, 'closed'))
    this.store.updateSessionLog(session.logId, { status: 'connected' })
    this.store.touchHost(hostId)
    status('connected', { hostId })
    this.runStartupSnippets(session, host)
    return { ok: true, sessionId, status: 'connected' }
  }

  runStartupSnippets(session, host) {
    const list = []
    const own = host.startupSnippetId ? this.store.getSnippet(host.startupSnippetId) : null
    if (own) list.push(own)
    for (const s of this.store.getState().snippets) if (s.runOnConnect && s.id !== own?.id) list.push(s)
    for (const s of list) {
      try { session.stream.write(renderSnippet(s, {})) } catch { /* snippet needs args the user did not give: skipped */ }
    }
  }

  startLog(session, host) {
    try {
      fs.mkdirSync(this.logsDir, { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const safe = `${host.label}`.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 60) || 'host'
      const file = path.join(this.logsDir, `${safe}_${stamp}.log`)
      session.log = fs.createWriteStream(file, { flags: 'a' })
      session.log.on('error', () => { session.log = null })
      session.log.write(`# DarkHub SSH session ${host.username}@${host.hostname}:${host.port} ${new Date().toISOString()}\n`)
      session.logFile = file
      this.store.updateSessionLog(session.logId, { logFilePath: file })
    } catch { session.log = null }
  }

  /** Turns transcript logging on/off for a live session. */
  setLogging(sessionId, on) {
    const s = this.sessions.get(sessionId)
    if (!s || !this.logsDir) return null
    if (on && !s.log) this.startLog(s, this.store.getHost(s.hostId) ?? { label: 'host', username: '', hostname: '', port: 22 })
    if (!on && s.log) { try { s.log.end() } catch { /* closed */ } s.log = null }
    return { logging: Boolean(s.log), logFile: s.logFile ?? null }
  }

  push(session, buf) {
    const text = session.decoder.decode(buf, { stream: true })
    if (!text) return
    if (session.log) { try { session.log.write(stripAnsi(text)) } catch { /* disk full */ } }
    session.chunks.push(text)
    session.bytes += buf.length
    if (session.bytes >= PAUSE_BYTES && !session.paused) {
      session.paused = true
      try { session.stream.pause() } catch { /* closed */ }
    }
    if (session.bytes >= FLUSH_BYTES) this.flush(session)
    else if (!session.timer) session.timer = setTimeout(() => this.flush(session), FLUSH_MS)
  }

  flush(session) {
    if (session.timer) { clearTimeout(session.timer); session.timer = null }
    if (!session.chunks.length) return
    const data = session.chunks.join('')
    session.chunks = []
    session.bytes = 0
    try { session.send('ssh:session:data', { sessionId: session.id, data }) } catch { /* window gone */ }
    if (session.paused) {
      session.paused = false
      // resume on the next turn so the renderer gets a frame in between
      setImmediate(() => { try { session.stream?.resume() } catch { /* closed */ } })
    }
  }

  finish(sessionId, status = 'closed', error) {
    const s = this.sessions.get(sessionId)
    if (!s || s.closed) return
    s.closed = true
    this.flush(s)
    this.sessions.delete(sessionId)
    this.cancelPromptsOf(sessionId)
    try { s.stream?.end() } catch { /* closed */ }
    try { s.conn?.close() } catch { /* closed */ }
    if (s.log) { try { s.log.end(`\n# closed ${new Date().toISOString()}\n`) } catch { /* closed */ } s.log = null }
    this.store.updateSessionLog(s.logId, { status: error ? 'error' : 'closed', errorCode: error ? 'DROPPED' : undefined, ended: true })
    try { s.send('ssh:session:status', { sessionId, status: error ? 'error' : status, error }) } catch { /* window gone */ }
  }

  write(sessionIds, data) {
    const ids = Array.isArray(sessionIds) ? sessionIds : [sessionIds]
    const text = typeof data === 'string' ? data.slice(0, 1024 * 1024) : ''
    if (!text) return 0
    let n = 0
    for (const id of ids) {
      const s = this.sessions.get(id)
      if (!s?.stream || s.closed) {
        if (this.serial?.write(id, text)) n += 1
        continue
      }
      try { s.stream.write(text); n += 1 } catch { /* closed */ }
    }
    return n
  }

  resize(sessionId, cols, rows) {
    const s = this.sessions.get(sessionId)
    if (!s?.stream) return false
    const c = Math.max(10, Math.min(1000, Number(cols) || 80))
    const r = Math.max(4, Math.min(500, Number(rows) || 24))
    try { s.stream.setWindow(r, c, 0, 0); return true } catch { return false }
  }

  disconnect(sessionId) {
    const s = this.sessions.get(sessionId)
    if (!s) { this.cancelPromptsOf(sessionId); return false }
    this.finish(sessionId, 'closed')
    return true
  }

  /** Closes everything opened by a window that went away. */
  disconnectBySender(predicate) {
    for (const [id, s] of this.sessions) if (predicate(s.send)) this.disconnect(id)
  }

  listSessions() {
    return [...this.sessions.values()].map((s) => ({ sessionId: s.id, hostId: s.hostId, status: s.status, logging: Boolean(s.log), logFile: s.logFile ?? null }))
  }

  disposeAll() {
    for (const id of [...this.prompts.keys()]) this.resolveHostKey(id, false)
    for (const id of [...this.authPrompts.keys()]) this.resolveAuthPrompt(id, null)
    for (const id of [...this.sessions.keys()]) this.disconnect(id)
  }
}
