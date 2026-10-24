// Paired browser clients. Only a SHA-256 of each client token is stored, so reading pairings.json does not give
// anyone a usable token. File I/O is injectable for tests.
import crypto from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { safeEqualHex } from './protocol.js'

export const MAX_CLIENTS = 16

const sha256Hex = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex')

/** Short code the user compares between the extension and the app ("123 456"). */
export function generatePairingCode() {
  const n = crypto.randomInt(0, 1_000_000)
  const s = String(n).padStart(6, '0')
  return `${s.slice(0, 3)} ${s.slice(3)}`
}

export class PairingStore {
  /**
   * @param {{ filePath: string, fs?: { readFile: Function, writeFile: Function, rename: Function, mkdir: Function }, now?: () => number }} opts
   */
  constructor({ filePath, fs = fsp, now = Date.now }) {
    this.filePath = filePath
    this.fs = fs
    this.now = now
    this.clients = null
    this.writing = Promise.resolve()
  }

  async load() {
    if (this.clients) return this.clients
    try {
      const parsed = JSON.parse(await this.fs.readFile(this.filePath, 'utf8'))
      const list = Array.isArray(parsed?.clients) ? parsed.clients : []
      this.clients = list.filter((c) => c && /^[0-9a-f]{32}$/.test(c.id) && /^[0-9a-f]{64}$/.test(c.tokenHash))
    } catch {
      this.clients = []
    }
    return this.clients
  }

  async save() {
    const body = JSON.stringify({ version: 1, clients: this.clients ?? [] }, null, 2)
    const run = async () => {
      await this.fs.mkdir(path.dirname(this.filePath), { recursive: true })
      const tmp = `${this.filePath}.${process.pid}.tmp`
      await this.fs.writeFile(tmp, body, 'utf8')
      await this.fs.rename(tmp, this.filePath)
    }
    this.writing = this.writing.then(run, run)
    return this.writing
  }

  /** Public view (no hashes). */
  async list() {
    const clients = await this.load()
    return clients.map((c) => ({
      id: c.id,
      name: c.name,
      browser: c.browser,
      caller: c.caller ?? null,
      createdAt: c.createdAt,
      lastSeenAt: c.lastSeenAt ?? null
    }))
  }

  /** Creates a client; returns { clientId, token } (the only time the token exists in clear). */
  async add({ name, browser, caller }) {
    const clients = await this.load()
    if (clients.length >= MAX_CLIENTS) throw new Error('too_many_clients')
    const clientId = crypto.randomBytes(16).toString('hex')
    const token = crypto.randomBytes(32).toString('hex')
    clients.push({
      id: clientId,
      tokenHash: sha256Hex(token),
      name: String(name || 'Browser').slice(0, 64),
      browser: String(browser || 'other').slice(0, 16),
      caller: caller ? String(caller).slice(0, 128) : null,
      createdAt: this.now(),
      lastSeenAt: null
    })
    await this.save()
    return { clientId, token }
  }

  /**
   * Checks a client's credentials. When `caller` was recorded at pairing time it must match too (a token copied to
   * another extension does not work).
   * @returns {Promise<object|null>} the client record, or null
   */
  async verify(clientId, token, caller) {
    const clients = await this.load()
    const c = clients.find((x) => x.id === clientId)
    // Always hash, so timing does not tell whether the id exists.
    const hash = sha256Hex(token ?? '')
    if (!c) return null
    if (!safeEqualHex(hash, c.tokenHash)) return null
    if (c.caller && caller && c.caller !== caller) return null
    c.lastSeenAt = this.now()
    this.save().catch(() => {})
    return c
  }

  async revoke(clientId) {
    const clients = await this.load()
    const before = clients.length
    this.clients = clients.filter((c) => c.id !== clientId)
    if (this.clients.length !== before) await this.save()
    return this.clients.length !== before
  }

  async revokeAll() {
    await this.load()
    this.clients = []
    await this.save()
  }
}
