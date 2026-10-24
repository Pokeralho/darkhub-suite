// Moving the vault to another PC through Susuya. The vault file is already encrypted with the master password; for the
// trip it is encrypted again with a random one-time key (AES-256-GCM). The key travels only inside the transfer code the
// user carries to the other PC, never to the server. Pure (crypto only).
import crypto from 'node:crypto'

const MAGIC = Buffer.from('DHVT1')
const IV_LEN = 12
const TAG_LEN = 16

export function sealVault(vaultBytes, key = crypto.randomBytes(32)) {
  const iv = crypto.randomBytes(IV_LEN)
  const c = crypto.createCipheriv('aes-256-gcm', key, iv)
  c.setAAD(MAGIC)
  const ct = Buffer.concat([c.update(vaultBytes), c.final()])
  return { key, blob: Buffer.concat([MAGIC, iv, ct, c.getAuthTag()]) }
}

export function openVault(blob, key) {
  if (!Buffer.isBuffer(blob) || blob.length < MAGIC.length + IV_LEN + TAG_LEN + 1 || !blob.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Arquivo de transferência inválido')
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Código de transferência inválido')
  const iv = blob.subarray(MAGIC.length, MAGIC.length + IV_LEN)
  const tag = blob.subarray(blob.length - TAG_LEN)
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_LEN })
  d.setAAD(MAGIC)
  d.setAuthTag(tag)
  // a wrong key or a modified file fails here instead of producing garbage
  return Buffer.concat([d.update(blob.subarray(MAGIC.length + IV_LEN, blob.length - TAG_LEN)), d.final()])
}

/** "dhv1.<fileId>.<key base64url>": the only thing the user carries between PCs. "." never appears in either part. */
export const makeCode = (fileId, key) => `dhv1.${fileId}.${key.toString('base64url')}`

export function parseCode(code) {
  const m = /^dhv1\.([A-Za-z0-9_-]{4,64})\.([A-Za-z0-9_-]{43})$/.exec(String(code || '').trim())
  if (!m) throw new Error('Código de transferência inválido')
  const key = Buffer.from(m[2], 'base64url')
  if (key.length !== 32) throw new Error('Código de transferência inválido')
  return { fileId: m[1], key }
}
