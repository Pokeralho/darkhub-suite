import crypto from 'node:crypto'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
let ssh2Utils = null
const utils = () => (ssh2Utils ??= require('ssh2').utils)

/** OpenSSH-style fingerprint of a raw public key blob: "SHA256:<base64 without padding>". */
export function fingerprintOfBlob(blob) {
  return `SHA256:${crypto.createHash('sha256').update(blob).digest('base64').replace(/=+$/, '')}`
}

/** Key type string stored at the start of an SSH wire-format public key blob ("ssh-ed25519", "ssh-rsa", ...). */
export function keyTypeOfBlob(blob) {
  const buf = Buffer.from(blob)
  if (buf.length < 4) return 'unknown'
  const len = buf.readUInt32BE(0)
  if (len <= 0 || len > 64 || 4 + len > buf.length) return 'unknown'
  return buf.subarray(4, 4 + len).toString('latin1')
}

/** Host key presented during the handshake → what the TOFU prompt and known_hosts need. */
export function hostKeyInfo(blob) {
  const buf = Buffer.from(blob)
  return { keyType: keyTypeOfBlob(buf), fingerprintSha256: fingerprintOfBlob(buf), publicKeyB64: buf.toString('base64') }
}

/** Parses an "ssh-ed25519 AAAA... comment" line. */
export function publicKeyInfo(line) {
  const parts = String(line ?? '').trim().split(/\s+/)
  if (parts.length < 2 || !/^[A-Za-z0-9+/]+=*$/.test(parts[1])) throw new Error('Invalid public key')
  const blob = Buffer.from(parts[1], 'base64')
  return { keyType: keyTypeOfBlob(blob), fingerprintSha256: fingerprintOfBlob(blob), comment: parts.slice(2).join(' ') }
}

function rsaBits(blob) {
  // string "ssh-rsa", mpint e, mpint n
  try {
    let off = 0
    const next = () => { const len = blob.readUInt32BE(off); const v = blob.subarray(off + 4, off + 4 + len); off += 4 + len; return v }
    next(); next()
    const n = next()
    let bytes = n.length
    if (n[0] === 0) bytes -= 1
    return bytes * 8
  } catch { return 0 }
}

export function algorithmOf(keyType, blob) {
  if (keyType === 'ssh-ed25519') return 'ed25519'
  if (keyType.startsWith('ecdsa-')) return 'ecdsa'
  if (keyType === 'ssh-rsa') return rsaBits(blob) >= 4000 ? 'rsa-4096' : 'rsa-2048'
  return null
}

/**
 * Validates an imported private key (OpenSSH, PEM or PPK) and derives its public key + fingerprint.
 * Throws a { code: 'KEY_PASSPHRASE' } error when the key is encrypted and the passphrase is missing/wrong.
 */
export function parsePrivateKey(text, passphrase) {
  const parsed = utils().parseKey(String(text ?? ''), passphrase || undefined)
  const key = Array.isArray(parsed) ? parsed[0] : parsed
  if (!key || key instanceof Error) {
    const msg = key instanceof Error ? key.message : 'Invalid private key'
    const err = new Error(/passphrase|encrypted|decrypt/i.test(msg) ? 'The key is encrypted: wrong or missing passphrase' : 'Invalid or unsupported private key')
    err.code = /passphrase|encrypted|decrypt/i.test(msg) ? 'KEY_PASSPHRASE' : 'VALIDATION'
    throw err
  }
  if (typeof key.isPrivateKey === 'function' && !key.isPrivateKey()) {
    const err = new Error('This is a public key; paste the private key')
    err.code = 'VALIDATION'
    throw err
  }
  const blob = key.getPublicSSH()
  return {
    keyType: key.type,
    algorithm: algorithmOf(key.type, blob),
    publicKey: `${key.type} ${blob.toString('base64')}${key.comment ? ` ${key.comment}` : ''}`,
    fingerprintSha256: fingerprintOfBlob(blob)
  }
}

/** New OpenSSH-format key pair (private key encrypted with aes256-ctr when a passphrase is given). */
export function generateSshKeyPair(algorithm, { passphrase, comment } = {}) {
  const opts = { comment: comment || 'darkhub' }
  if (passphrase) Object.assign(opts, { passphrase, cipher: 'aes256-ctr', rounds: 16 })
  return new Promise((resolve, reject) => {
    const done = (err, keys) => (err ? reject(err) : resolve({ privateKey: keys.private, publicKey: keys.public.trim() }))
    if (algorithm === 'rsa-4096') utils().generateKeyPair('rsa', { ...opts, bits: 4096 }, done)
    else utils().generateKeyPair('ed25519', opts, done)
  })
}
