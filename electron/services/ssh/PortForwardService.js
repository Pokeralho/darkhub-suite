import net from 'node:net'

const STATUS_MS = 500

export class TunnelError extends Error {
  constructor(code, message) {
    super(message || code)
    this.code = code
  }
}

/** Probes whether a local address:port can be bound (pre-bind check before opening the SSH connection). */
export function probeLocalPort(address, port) {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.once('error', (err) => resolve({ free: false, code: err?.code ?? 'ERROR' }))
    srv.listen({ host: address, port, exclusive: true }, () => srv.close(() => resolve({ free: true })))
  })
}

// ---------- SOCKS5 (RFC 1928), CONNECT only, no auth ----------
/**
 * Parses a SOCKS5 greeting + request from a buffer. Returns { need: true } when more bytes are needed,
 * { error } for unsupported input, or { stage: 'greeting', methods, consumed } / { stage: 'request', host, port, consumed }.
 */
export function parseSocksGreeting(buf) {
  if (buf.length < 2) return { need: true }
  if (buf[0] !== 0x05) return { error: 'not SOCKS5' }
  const n = buf[1]
  if (buf.length < 2 + n) return { need: true }
  return { stage: 'greeting', methods: [...buf.subarray(2, 2 + n)], consumed: 2 + n }
}

export function parseSocksRequest(buf) {
  if (buf.length < 4) return { need: true }
  if (buf[0] !== 0x05) return { error: 'not SOCKS5', reply: 0x01 }
  if (buf[1] !== 0x01) return { error: 'only CONNECT is supported', reply: 0x07 }
  const atyp = buf[3]
  let host
  let off
  if (atyp === 0x01) {
    if (buf.length < 10) return { need: true }
    host = [...buf.subarray(4, 8)].join('.')
    off = 8
  } else if (atyp === 0x03) {
    if (buf.length < 5) return { need: true }
    const len = buf[4]
    if (buf.length < 5 + len + 2) return { need: true }
    host = buf.subarray(5, 5 + len).toString('latin1')
    off = 5 + len
  } else if (atyp === 0x04) {
    if (buf.length < 22) return { need: true }
    const parts = []
    for (let i = 0; i < 8; i += 1) parts.push(buf.readUInt16BE(4 + i * 2).toString(16))
    host = parts.join(':')
    off = 20
  } else return { error: 'unsupported address type', reply: 0x08 }
  const port = buf.readUInt16BE(off)
  return { stage: 'request', host, port, consumed: off + 2 }
}

export const socksReply = (code) => Buffer.from([0x05, code, 0x00, 0x01, 0, 0, 0, 0, 0, 0])

/**
 * Local (-L), Remote (-R) and Dynamic SOCKS5 (-D) forwarding. Each running rule owns its own SSH connection (with
 * the host's jump chain) so stopping one tunnel never disturbs terminal sessions.
 */
export class PortForwardService {
  constructor({ store, manager, onStatus, logger } = {}) {
    this.store = store
    this.manager = manager
    this.onStatus = onStatus ?? (() => {})
    this.logger = logger
    this.active = new Map() // tunnelId -> runtime
  }

  status(id) {
    const rt = this.active.get(id)
    if (!rt) return { tunnelId: id, status: 'stopped', activeConnections: 0, bytesIn: 0, bytesOut: 0 }
    return { tunnelId: id, status: rt.status, activeConnections: rt.sockets.size, bytesIn: rt.bytesIn, bytesOut: rt.bytesOut, boundPort: rt.boundPort, error: rt.error }
  }

  list() {
    return this.store.getState().tunnels.map((t) => ({ ...t, runtime: this.status(t.id) }))
  }

  emit(id) {
    const rt = this.active.get(id)
    if (rt) {
      if (rt.emitTimer) return
      rt.emitTimer = setTimeout(() => { rt.emitTimer = null; this.onStatus(this.status(id)) }, STATUS_MS)
      return
    }
    this.onStatus(this.status(id))
  }

  track(rt, id, a, b) {
    rt.sockets.add(a)
    if (b) rt.sockets.add(b)
    a.on('data', (d) => { rt.bytesOut += d.length; this.emit(id) })
    b?.on('data', (d) => { rt.bytesIn += d.length; this.emit(id) })
    const cleanup = () => {
      rt.sockets.delete(a)
      if (b) rt.sockets.delete(b)
      try { a.destroy() } catch { /* gone */ }
      try { b?.destroy?.() ?? b?.end?.() } catch { /* gone */ }
      this.emit(id)
    }
    a.on('close', cleanup)
    a.on('error', cleanup)
    b?.on('close', cleanup)
    b?.on('error', cleanup)
    if (b) { a.pipe(b); b.pipe(a) }
    this.emit(id)
  }

  async start(id, { interactive = true } = {}) {
    const rule = this.store.getTunnel(id)
    if (!rule) throw new TunnelError('NOT_FOUND', 'tunnel not found')
    const current = this.active.get(id)
    if (current && (current.status === 'active' || current.status === 'starting')) return this.status(id)

    if (rule.kind !== 'remote') {
      const probe = await probeLocalPort(rule.bindAddress, rule.bindPort)
      if (!probe.free) {
        throw new TunnelError(probe.code === 'EADDRINUSE' || probe.code === 'EACCES' ? 'PORT_IN_USE' : 'BIND_FAILED', `${rule.bindAddress}:${rule.bindPort} is not available (${probe.code})`)
      }
    }

    const rt = { status: 'starting', sockets: new Set(), bytesIn: 0, bytesOut: 0, boundPort: null, server: null, conn: null, emitTimer: null, error: undefined }
    this.active.set(id, rt)
    this.onStatus(this.status(id))
    try {
      rt.conn = await this.manager.connectClient(rule.hostId, {
        ownerId: id,
        interactive,
        onDrop: (reason) => { if (this.active.get(id) === rt) this.teardown(id, reason === 'closed by user' ? undefined : `SSH connection lost: ${reason}`) }
      })
      if (this.active.get(id) !== rt) { rt.conn.close(); throw new TunnelError('CANCELLED', 'stopped while starting') }
      const client = rt.conn.client
      if (rule.kind === 'local') rt.server = await this.listen(rule, (sock) => {
        client.forwardOut(sock.remoteAddress || '127.0.0.1', sock.remotePort || 0, rule.targetHost, rule.targetPort, (err, stream) => {
          if (err) { sock.destroy(); return }
          this.track(rt, id, sock, stream)
        })
      })
      else if (rule.kind === 'dynamic') rt.server = await this.listen(rule, (sock) => this.handleSocks(rt, id, client, sock))
      else {
        rt.boundPort = await new Promise((resolve, reject) => client.forwardIn(rule.bindAddress, rule.bindPort, (err, port) => (err ? reject(new TunnelError('REMOTE_BIND_FAILED', `server refused ${rule.bindAddress}:${rule.bindPort}: ${err.message}`)) : resolve(port || rule.bindPort))))
        client.on('tcp connection', (info, accept, reject) => {
          if (info.destPort !== rt.boundPort) return reject()
          const stream = accept()
          const sock = net.connect(rule.targetPort, rule.targetHost)
          this.track(rt, id, stream, sock)
        })
      }
      if (rule.kind !== 'remote') rt.boundPort = rule.bindPort
      rt.status = 'active'
      this.onStatus(this.status(id))
      return this.status(id)
    } catch (err) {
      this.teardown(id, String(err?.message ?? err).slice(0, 300))
      if (err instanceof TunnelError) throw err
      throw new TunnelError(err?.code === 'HOSTKEY_REJECTED' ? 'HOSTKEY_REJECTED' : 'CONNECT_FAILED', String(err?.message ?? err).slice(0, 300))
    }
  }

  listen(rule, onConn) {
    return new Promise((resolve, reject) => {
      const srv = net.createServer(onConn)
      srv.once('error', (err) => reject(new TunnelError(err.code === 'EADDRINUSE' ? 'PORT_IN_USE' : 'BIND_FAILED', `${rule.bindAddress}:${rule.bindPort}: ${err.code}`)))
      srv.listen({ host: rule.bindAddress, port: rule.bindPort, exclusive: true }, () => resolve(srv))
    })
  }

  handleSocks(rt, id, client, sock) {
    let buf = Buffer.alloc(0)
    let stage = 'greeting'
    const fail = (code) => { try { sock.end(socksReply(code)) } catch { /* gone */ } }
    sock.on('error', () => sock.destroy())
    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk])
      if (buf.length > 1024) return sock.destroy()
      if (stage === 'greeting') {
        const g = parseSocksGreeting(buf)
        if (g.need) return
        if (g.error || !g.methods.includes(0x00)) { sock.end(Buffer.from([0x05, 0xff])); return }
        sock.write(Buffer.from([0x05, 0x00]))
        buf = buf.subarray(g.consumed)
        stage = 'request'
      }
      if (stage === 'request') {
        const r = parseSocksRequest(buf)
        if (r.need) return
        if (r.error) return fail(r.reply ?? 0x01)
        stage = 'connecting'
        sock.off('data', onData)
        sock.pause()
        const rest = buf.subarray(r.consumed)
        client.forwardOut('127.0.0.1', 0, r.host, r.port, (err, stream) => {
          if (err) return fail(0x05)
          sock.write(socksReply(0x00))
          if (rest.length) stream.write(rest)
          this.track(rt, id, sock, stream)
          sock.resume()
        })
      }
    }
    sock.on('data', onData)
  }

  teardown(id, error) {
    const rt = this.active.get(id)
    if (!rt) return
    this.active.delete(id)
    if (rt.emitTimer) clearTimeout(rt.emitTimer)
    try { rt.server?.close() } catch { /* closed */ }
    for (const s of rt.sockets) { try { s.destroy?.() ?? s.end?.() } catch { /* gone */ } }
    rt.sockets.clear()
    try { rt.conn?.close() } catch { /* closed */ }
    this.manager.cancelPromptsOf?.(id)
    this.onStatus({ tunnelId: id, status: error ? 'error' : 'stopped', activeConnections: 0, bytesIn: rt.bytesIn, bytesOut: rt.bytesOut, error })
  }

  stop(id) {
    const had = this.active.has(id)
    this.teardown(id)
    return had
  }

  stopAll() {
    for (const id of [...this.active.keys()]) this.teardown(id)
  }

  /** Starts rules marked auto_start whose host key is already trusted (no prompt at app start). */
  async autoStart() {
    for (const t of this.store.getState().tunnels.filter((x) => x.autoStart)) {
      try { await this.start(t.id, { interactive: false }) } catch (err) { this.logger?.warn?.(`[ssh] auto-start tunnel ${t.id} failed: ${err?.code ?? 'error'}`) }
    }
  }
}
