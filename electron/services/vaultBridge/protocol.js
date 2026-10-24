// Wire protocol between the native messaging host (DarkHub.VaultBridgeHost.exe) and the app.
// Pure module: framing, the mutual HMAC handshake and validation of every message the extension can send.
//
// Framing: identical to Chrome/Firefox native messaging (uint32 little-endian length + UTF-8 payload), so the host is
// a dumb byte relay after the handshake.
//
// Handshake (the shared secret never crosses the socket):
//   host -> app : "DHVB1 H <nonceH:32 hex> <base64(argv joined by \n)>"
//   app  -> host: "DHVB1 S <nonceS:32 hex> <HMAC-SHA256(secret, 'S|'+nonceH+'|'+nonceS) hex>"
//   host -> app : "DHVB1 C <HMAC-SHA256(secret, 'C|'+nonceH+'|'+nonceS) hex>"
// Afterwards every frame is a JSON message from/to the extension.
import crypto from 'node:crypto'

export const PROTOCOL_VERSION = 1
export const NATIVE_HOST_NAME = 'com.darkhub.vault'
export const MAX_INBOUND_FRAME = 64 * 1024 // extension -> app
export const MAX_OUTBOUND_FRAME = 1024 * 1024 // app -> extension (Chrome's hard limit)

const HEX32 = /^[0-9a-f]{32}$/
const HEX64 = /^[0-9a-f]{64}$/

export function encodeFrame(payload) {
  const body = Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload), 'utf8')
  if (body.length > MAX_OUTBOUND_FRAME) throw new Error('Frame too large')
  const head = Buffer.alloc(4)
  head.writeUInt32LE(body.length, 0)
  return Buffer.concat([head, body])
}

/** Incremental decoder. push() returns the complete frames (as strings) or throws on a protocol violation. */
export class FrameDecoder {
  constructor(maxFrame = MAX_INBOUND_FRAME) {
    this.maxFrame = maxFrame
    this.buf = Buffer.alloc(0)
  }

  push(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : Buffer.from(chunk)
    const frames = []
    while (this.buf.length >= 4) {
      const len = this.buf.readUInt32LE(0)
      if (len === 0 || len > this.maxFrame) throw new Error('Invalid frame length')
      if (this.buf.length < 4 + len) break
      frames.push(this.buf.subarray(4, 4 + len).toString('utf8'))
      this.buf = this.buf.subarray(4 + len)
    }
    if (this.buf.length > this.maxFrame + 4) throw new Error('Buffer overflow')
    return frames
  }
}

export function hmacHex(secret, text) {
  return crypto.createHmac('sha256', Buffer.from(String(secret), 'utf8')).update(text, 'utf8').digest('hex')
}

export function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
}

/** Parses the host's first frame. Returns { nonceH, args } or null. */
export function parseHostHello(frame) {
  if (typeof frame !== 'string' || frame.length > 8192) return null
  const parts = frame.split(' ')
  if (parts.length !== 4 || parts[0] !== 'DHVB1' || parts[1] !== 'H' || !HEX32.test(parts[2])) return null
  let args = []
  try {
    const decoded = Buffer.from(parts[3], 'base64').toString('utf8')
    args = decoded ? decoded.split('\n').slice(0, 8).map((a) => a.slice(0, 512)) : []
  } catch {
    return null
  }
  return { nonceH: parts[2], args }
}

export function buildServerProof(secret, nonceH, nonceS) {
  return `DHVB1 S ${nonceS} ${hmacHex(secret, `S|${nonceH}|${nonceS}`)}`
}

export function verifyClientProof(secret, nonceH, nonceS, frame) {
  if (typeof frame !== 'string') return false
  const parts = frame.split(' ')
  if (parts.length !== 3 || parts[0] !== 'DHVB1' || parts[1] !== 'C' || !HEX64.test(parts[2])) return false
  return safeEqualHex(parts[2], hmacHex(secret, `C|${nonceH}|${nonceS}`))
}

/** Used by tests (and documents what the C# host does). */
export function buildClientProof(secret, nonceH, nonceS) {
  return `DHVB1 C ${hmacHex(secret, `C|${nonceH}|${nonceS}`)}`
}

/**
 * Identifies the calling extension from the arguments the browser passes to the host.
 * Chrome/Edge: argv[0] = "chrome-extension://<id>/". Firefox: argv = [<manifest path>, <extension id>].
 */
export function callerFromArgs(args) {
  const list = Array.isArray(args) ? args.map(String) : []
  const chromeOrigin = list.find((a) => /^chrome-extension:\/\/[a-p]{32}\/?$/.test(a))
  if (chromeOrigin) return { kind: 'chromium', id: chromeOrigin.replace(/^chrome-extension:\/\//, '').replace(/\/$/, '') }
  const geckoId = list.find((a) => /^[A-Za-z0-9._+-]{1,80}@[A-Za-z0-9._-]{1,80}$/.test(a) || /^\{[0-9a-fA-F-]{36}\}$/.test(a))
  if (geckoId) return { kind: 'gecko', id: geckoId }
  return null
}

// ---------------------------------------------------------------------------------------------------------------
// Extension message validation. Unknown fields are dropped; anything malformed is rejected before reaching the vault.

const BROWSERS = new Set(['chrome', 'edge', 'firefox', 'brave', 'opera', 'other'])

function str(v, max, { min = 0, trim = false } = {}) {
  if (typeof v !== 'string') return null
  const s = trim ? v.trim() : v
  if (s.length < min || s.length > max) return null
  // No control characters (except in passwords, handled separately).
  return s
}

function plainText(v, max, min = 0) {
  const s = str(v, max, { min, trim: true })
  if (s == null || /[\u0000-\u001f\u007f]/.test(s)) return null
  return s
}

function httpUrl(v) {
  const s = str(v, 2048, { min: 8 })
  if (!s || !/^https?:\/\//i.test(s)) return null
  try { new URL(s) } catch { return null }
  return s
}

function requestId(v) {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 2 ** 31) return v
  if (typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v)) return v
  return null
}

const SCHEMAS = {
  ping: () => ({}),
  'pair.request': (m) => {
    const clientName = plainText(m.clientName ?? 'Browser', 64, 1)
    const browser = typeof m.browser === 'string' && BROWSERS.has(m.browser) ? m.browser : 'other'
    return clientName ? { clientName, browser } : null
  },
  'pair.cancel': () => ({}),
  auth: (m) => {
    const clientId = typeof m.clientId === 'string' && /^[0-9a-f]{32}$/.test(m.clientId) ? m.clientId : null
    const token = typeof m.token === 'string' && HEX64.test(m.token) ? m.token : null
    return clientId && token ? { clientId, token } : null
  },
  status: () => ({}),
  'logins.query': (m) => {
    const url = httpUrl(m.url)
    const topUrl = m.topUrl == null ? url : httpUrl(m.topUrl)
    return url && topUrl ? { url, topUrl } : null
  },
  'logins.fill': (m) => {
    const url = httpUrl(m.url)
    const topUrl = m.topUrl == null ? url : httpUrl(m.topUrl)
    const entryId = typeof m.entryId === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(m.entryId) ? m.entryId : null
    return url && topUrl && entryId ? { url, topUrl, entryId } : null
  },
  'logins.check': (m) => {
    const url = httpUrl(m.url)
    const username = plainText(m.username ?? '', 256)
    const password = typeof m.password === 'string' && m.password.length >= 1 && m.password.length <= 1024 ? m.password : null
    return url && username != null && password != null ? { url, username, password } : null
  },
  'logins.save': (m) => {
    const url = httpUrl(m.url)
    const username = plainText(m.username ?? '', 256)
    const password = typeof m.password === 'string' && m.password.length >= 1 && m.password.length <= 1024 ? m.password : null
    return url && username != null && password != null ? { url, username, password } : null
  },
  unpair: () => ({})
}

export const MESSAGE_TYPES = Object.freeze(Object.keys(SCHEMAS))

/**
 * Validates one decoded frame from the extension.
 * @returns {{ ok: true, id: string|number, type: string, payload: object } | { ok: false, id: any, error: string }}
 */
export function validateMessage(frame) {
  if (typeof frame !== 'string' || frame.length > MAX_INBOUND_FRAME) return { ok: false, id: null, error: 'bad_frame' }
  let msg
  try { msg = JSON.parse(frame) } catch { return { ok: false, id: null, error: 'bad_json' } }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return { ok: false, id: null, error: 'bad_message' }
  const id = requestId(msg.id)
  if (id == null) return { ok: false, id: null, error: 'bad_id' }
  const type = typeof msg.type === 'string' ? msg.type : ''
  if (!Object.prototype.hasOwnProperty.call(SCHEMAS, type)) return { ok: false, id, error: 'unknown_type' }
  const payload = SCHEMAS[type](msg)
  if (!payload) return { ok: false, id, error: 'invalid_params' }
  return { ok: true, id, type, payload }
}
