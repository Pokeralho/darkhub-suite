// Loopback relay endpoint for the browser extension's native messaging host.
//
// Transport: TCP bound to 127.0.0.1 on an ephemeral port (never any other interface). The port and a random 256-bit
// secret are written to bridge.cfg inside the user's profile (userData), which other Windows users cannot read; both
// rotate at every start and the file is deleted on stop. The host and the app prove knowledge of the secret to each
// other with an HMAC challenge/response (protocol.js), so neither a web page (which cannot speak this framing), nor
// another local user, nor a process squatting the port after the app exits learns anything.
//
// Authorization on top of that: the extension must be paired (user confirms a 6-digit code in the app) and present
// its per-client token. Logins are only served while the vault is unlocked, only for the requesting page's site, and
// a password only on an explicit fill request. Saving always asks the user in the app.
import net from 'node:net'
import crypto from 'node:crypto'
import {
  FrameDecoder, encodeFrame, parseHostHello, buildServerProof, verifyClientProof, callerFromArgs, validateMessage,
  PROTOCOL_VERSION, MAX_INBOUND_FRAME
} from './protocol.js'
import { createBridgeLimiters } from './rateLimit.js'
import { generatePairingCode } from './pairingStore.js'
import { findMatchingEntries, matchSite, sameSite, siteForSavedLogin, parsePageUrl, parseEntrySite } from './domainMatch.js'

const HANDSHAKE_TIMEOUT_MS = 5_000
const PROMPT_TIMEOUT_MS = 120_000
const MAX_SESSIONS = 8
const MAX_AUTH_FAILURES_PER_SESSION = 3

function isLoopbackAddress(addr) {
  const a = String(addr || '')
  return a === '127.0.0.1' || a === '::ffff:127.0.0.1' || a === '::1'
}

export class VaultBridgeServer {
  /**
   * @param {object} deps
   * @param {{ isUnlocked: () => boolean, getEntries: () => any[], addEntry: (e: object) => Promise<any>, updatePassword: (id: string, password: string) => Promise<any> }} deps.vault
   * @param {{ confirmPairing: (info: object, signal: AbortSignal) => Promise<boolean>, confirmSave: (info: object, signal: AbortSignal) => Promise<boolean> }} deps.prompts
   * @param {import('./pairingStore.js').PairingStore} deps.pairingStore
   * @param {Set<string>} deps.allowedCallers e.g. "chromium:<id>", "gecko:<id>"
   * @param {(cfg: { port: number, secret: string } | null) => Promise<void>} deps.writeConfig
   * @param {() => void} [deps.onChange]
   * @param {{ info?: Function, warn?: Function }} [deps.logger]
   */
  constructor(deps) {
    this.vault = deps.vault
    this.prompts = deps.prompts
    this.store = deps.pairingStore
    this.allowedCallers = deps.allowedCallers
    this.writeConfig = deps.writeConfig
    this.onChange = deps.onChange || (() => {})
    this.logger = deps.logger || {}
    this.limits = createBridgeLimiters(deps.now)
    this.server = null
    this.port = 0
    this.secret = null
    this.sessions = new Set()
    this.pendingPrompt = null
  }

  get running() {
    return Boolean(this.server)
  }

  async start() {
    if (this.server) return { port: this.port }
    this.secret = crypto.randomBytes(32).toString('hex')
    const server = net.createServer({ allowHalfOpen: false }, (socket) => this.#onConnection(socket))
    server.maxConnections = MAX_SESSIONS
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => { server.off('error', reject); resolve() })
    })
    server.on('error', (err) => this.logger.warn?.('vault-bridge', `server error: ${err?.code || err?.message}`))
    this.server = server
    this.port = server.address().port
    await this.writeConfig({ port: this.port, secret: this.secret })
    this.logger.info?.('vault-bridge', `listening on 127.0.0.1:${this.port}`)
    return { port: this.port }
  }

  async stop() {
    const server = this.server
    this.server = null
    for (const s of this.sessions) s.socket.destroy()
    this.sessions.clear()
    this.pendingPrompt?.abort()
    this.pendingPrompt = null
    this.secret = null
    this.port = 0
    try { await this.writeConfig(null) } catch {}
    if (server) await new Promise((resolve) => server.close(() => resolve()))
  }

  /** Drops live connections of a revoked client. */
  disconnectClient(clientId) {
    for (const s of this.sessions) {
      if (s.client?.id === clientId) {
        s.client = null
        this.#send(s, { type: 'revoked' })
        s.socket.end()
      }
    }
  }

  connectedClientIds() {
    return [...this.sessions].map((s) => s.client?.id).filter(Boolean)
  }

  // ------------------------------------------------------------------------------------------------------------

  #onConnection(socket) {
    if (!isLoopbackAddress(socket.remoteAddress) || this.sessions.size >= MAX_SESSIONS) {
      socket.destroy()
      return
    }

    socket.setNoDelay(true)
    const session = {
      id: crypto.randomBytes(8).toString('hex'),
      socket,
      state: 'hello',
      decoder: new FrameDecoder(MAX_INBOUND_FRAME),
      nonceH: null,
      nonceS: null,
      caller: null,
      client: null,
      authFailures: 0,
      prompt: null
    }
    this.sessions.add(session)
    const timer = setTimeout(() => {
      if (session.state !== 'ready') this.#fail(session)
    }, HANDSHAKE_TIMEOUT_MS)
    timer.unref?.()

    socket.on('data', (chunk) => {
      let frames
      try { frames = session.decoder.push(chunk) } catch { this.#fail(session); return }
      for (const f of frames) {
        if (socket.destroyed) return
        this.#onFrame(session, f).catch(() => this.#send(session, { type: 'error', error: 'internal' }))
      }
    })
    const cleanup = () => {
      clearTimeout(timer)
      session.prompt?.abort()
      this.sessions.delete(session)
    }
    socket.on('close', cleanup)
    socket.on('error', () => socket.destroy())
  }

  // Handshake failures only drop the connection. They are not counted globally on purpose: any web page can open
  // sockets to loopback ports, and a global lockout would let it switch the bridge off. Guessing the 256-bit secret
  // is not feasible, so there is nothing to throttle.
  #fail(session) {
    session.socket.destroy()
  }

  #send(session, obj) {
    if (session.socket.destroyed) return
    try { session.socket.write(encodeFrame(obj)) } catch { session.socket.destroy() }
  }

  async #onFrame(session, frame) {
    if (session.state === 'hello') {
      const hello = parseHostHello(frame)
      if (!hello) return this.#fail(session)
      const caller = callerFromArgs(hello.args)
      const callerKey = caller ? `${caller.kind}:${caller.id}` : null
      if (!callerKey || !this.allowedCallers.has(callerKey)) return this.#fail(session)
      session.caller = callerKey
      session.nonceH = hello.nonceH
      session.nonceS = crypto.randomBytes(16).toString('hex')
      session.state = 'proof'
      session.socket.write(encodeFrame(buildServerProof(this.secret, session.nonceH, session.nonceS)))
      return
    }
    if (session.state === 'proof') {
      if (!verifyClientProof(this.secret, session.nonceH, session.nonceS, frame)) return this.#fail(session)
      session.state = 'ready'
      this.#send(session, { type: 'bridge.ready', v: PROTOCOL_VERSION })
      return
    }

    if (!this.limits.frames.take(session.id)) {
      return this.#send(session, { type: 'error', error: 'rate_limited' })
    }
    const v = validateMessage(frame)
    if (!v.ok) return this.#send(session, { id: v.id, ok: false, error: v.error })
    const reply = await this.#handle(session, v.type, v.payload, v.id)
    if (reply) this.#send(session, { id: v.id, ...reply })
  }

  async #handle(session, type, p, id) {
    switch (type) {
      case 'ping':
        return { ok: true, v: PROTOCOL_VERSION, app: 'DarkHub' }

      case 'status':
        return { ok: true, paired: Boolean(session.client), unlocked: session.client ? this.vault.isUnlocked() : undefined }

      case 'pair.request':
        return this.#pairRequest(session, p, id)

      case 'pair.cancel':
        session.prompt?.abort()
        return { ok: true }

      case 'auth': {
        if (this.limits.authFail.retryAfter('global') > 0) return { ok: false, error: 'rate_limited' }
        const c = await this.store.verify(p.clientId, p.token, session.caller)
        if (!c) {
          this.limits.authFail.take('global')
          session.authFailures += 1
          if (session.authFailures >= MAX_AUTH_FAILURES_PER_SESSION) setImmediate(() => session.socket.destroy())
          return { ok: false, error: 'auth_failed' }
        }
        session.client = c
        this.onChange()
        return { ok: true, unlocked: this.vault.isUnlocked() }
      }

      case 'unpair': {
        if (!session.client) return { ok: false, error: 'not_paired' }
        const cid = session.client.id
        session.client = null
        await this.store.revoke(cid)
        this.onChange()
        return { ok: true }
      }

      default:
        break
    }

    // Everything below needs a paired client and an unlocked vault.
    if (!session.client) return { ok: false, error: 'not_paired' }
    if (!this.vault.isUnlocked()) return { ok: false, error: 'locked' }
    const cid = session.client.id

    if (type === 'logins.query') {
      if (!this.limits.query.take(cid)) return { ok: false, error: 'rate_limited' }
      if (!sameSite(p.url, p.topUrl)) return { ok: false, error: 'cross_site_frame' }
      return { ok: true, logins: findMatchingEntries(this.vault.getEntries(), p.url) }
    }

    if (type === 'logins.fill') {
      if (!this.limits.fill.take(cid)) return { ok: false, error: 'rate_limited' }
      if (!sameSite(p.url, p.topUrl)) return { ok: false, error: 'cross_site_frame' }
      const entry = this.vault.getEntries().find((e) => e?.id === p.entryId)
      // Same answer for "no such entry" and "entry belongs to another site".
      if (!entry || !matchSite(entry.site, p.url)) return { ok: false, error: 'not_found' }
      return { ok: true, username: String(entry.username ?? ''), password: String(entry.password ?? '') }
    }

    if (type === 'logins.check') {
      if (!this.limits.check.take(cid)) return { ok: false, error: 'rate_limited' }
      const existing = this.#findSameLogin(p.url, p.username)
      return { ok: true, exists: Boolean(existing), same: Boolean(existing && existing.password === p.password) }
    }

    if (type === 'logins.save') {
      if (!this.limits.save.take(cid)) return { ok: false, error: 'rate_limited' }
      return this.#saveRequest(session, p)
    }

    return { ok: false, error: 'unknown_type' }
  }

  #findSameLogin(url, username) {
    const page = parsePageUrl(url)
    if (!page) return null
    return this.vault.getEntries().find((e) => {
      if (!e || String(e.username ?? '') !== username) return false
      return matchSite(parseEntrySite(e.site), page) === 'exact'
    }) || null
  }

  async #withPrompt(session, fn) {
    if (this.pendingPrompt) return { busy: true }
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), PROMPT_TIMEOUT_MS)
    timer.unref?.()
    this.pendingPrompt = ctrl
    session.prompt = ctrl
    try {
      const accepted = await fn(ctrl.signal)
      return { accepted: Boolean(accepted) && !ctrl.signal.aborted }
    } catch {
      return { accepted: false }
    } finally {
      clearTimeout(timer)
      if (this.pendingPrompt === ctrl) this.pendingPrompt = null
      if (session.prompt === ctrl) session.prompt = null
    }
  }

  async #pairRequest(session, p, id) {
    if (!this.limits.pair.take(`s:${session.id}`) || !this.limits.pair.take('global')) {
      return { ok: false, error: 'rate_limited' }
    }
    if (this.pendingPrompt) return { ok: false, error: 'busy' }
    const code = generatePairingCode()
    const pairingId = crypto.randomBytes(8).toString('hex')
    // Answer right away so the extension can show the code while the app asks the user.
    this.#send(session, { id, ok: true, pending: true, pairingId, code })
    const { accepted, busy } = await this.#withPrompt(session, (signal) =>
      this.prompts.confirmPairing({ code, clientName: p.clientName, browser: p.browser }, signal)
    )
    if (busy) {
      this.#send(session, { type: 'pair.result', pairingId, ok: false, error: 'busy' })
      return null
    }
    if (!accepted || session.socket.destroyed) {
      this.#send(session, { type: 'pair.result', pairingId, ok: false, error: 'rejected' })
      return null
    }
    try {
      const { clientId, token } = await this.store.add({ name: p.clientName, browser: p.browser, caller: session.caller })
      session.client = await this.store.verify(clientId, token, session.caller)
      this.#send(session, { type: 'pair.result', pairingId, ok: true, clientId, token })
      this.onChange()
    } catch (err) {
      this.#send(session, { type: 'pair.result', pairingId, ok: false, error: err?.message === 'too_many_clients' ? 'too_many_clients' : 'internal' })
    }
    return null
  }

  async #saveRequest(session, p) {
    const site = siteForSavedLogin(p.url)
    const page = parsePageUrl(p.url)
    if (!site || !page) return { ok: false, error: 'invalid_params' }
    const existing = this.#findSameLogin(p.url, p.username)
    if (existing && existing.password === p.password) return { ok: true, saved: false, unchanged: true }
    const { accepted, busy } = await this.#withPrompt(session, (signal) =>
      this.prompts.confirmSave({ host: page.host, username: p.username, update: Boolean(existing), clientName: session.client?.name }, signal)
    )
    if (busy) return { ok: false, error: 'busy' }
    if (!accepted) return { ok: true, saved: false }
    // The vault may have locked while the dialog was open.
    if (!this.vault.isUnlocked()) return { ok: false, error: 'locked' }
    if (existing) {
      await this.vault.updatePassword(existing.id, p.password)
      return { ok: true, saved: true, updated: true }
    }
    await this.vault.addEntry({ site, username: p.username, password: p.password, notes: '' })
    return { ok: true, saved: true, updated: false }
  }
}
