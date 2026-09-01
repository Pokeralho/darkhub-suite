import crypto from 'node:crypto'

function toB64(buf) {
  return Buffer.from(buf).toString('base64')
}

function fromB64(s) {
  return Buffer.from(String(s), 'base64')
}

export function derivePasswordFromRecoveryWords(words) {
  const normalized = String(words ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  const list = normalized.length ? normalized.split(' ') : []
  const seed = list.join('')
  const hash = crypto.createHash('sha256').update(seed, 'utf8').digest()
  return toB64(hash).slice(0, 12)
}

export function generateRecoveryWords(wordList, count = 16) {
  const list = Array.isArray(wordList) && wordList.length ? wordList : buildDefaultWordList()
  const selected = new Set()
  const maxTries = count * 32
  let tries = 0
  while (selected.size < count && tries < maxTries) {
    const w = list[crypto.randomInt(0, list.length)]
    selected.add(w)
    tries += 1
  }
  return Array.from(selected)
}

function buildDefaultWordList() {
  const prefixes = [
    'ab',
    'ac',
    'ad',
    'al',
    'am',
    'an',
    'ar',
    'as',
    'be',
    'bi',
    'bo',
    'br',
    'ca',
    'ce',
    'ci',
    'co',
    'da',
    'de',
    'di',
    'do',
    'el',
    'en',
    'ex',
    'fa',
    'fi',
    'fo',
    'ga',
    'ge',
    'gi',
    'go',
    'ha',
    'he'
  ]
  const suffixes = [
    'bar',
    'bel',
    'bon',
    'bus',
    'cad',
    'cal',
    'can',
    'car',
    'cel',
    'cen',
    'cer',
    'cis',
    'cor',
    'cos',
    'dam',
    'dan',
    'dar',
    'del',
    'den',
    'der',
    'din',
    'dor',
    'dos',
    'dur',
    'fal',
    'fan',
    'far',
    'fel',
    'fen',
    'fer',
    'fin',
    'fir',
    'fon',
    'for',
    'gan',
    'gar',
    'gel',
    'gen',
    'ger',
    'gil',
    'gin',
    'gir',
    'gon',
    'gor',
    'han',
    'har',
    'hel',
    'hen',
    'her',
    'hin',
    'hor',
    'ion',
    'jar',
    'jen',
    'jun',
    'kan',
    'kel',
    'ken',
    'ker',
    'kin',
    'kor',
    'lam',
    'len'
  ]
  const out = []
  for (let i = 0; i < prefixes.length; i += 1) {
    for (let j = 0; j < suffixes.length; j += 1) {
      out.push(prefixes[i] + suffixes[j])
    }
  }
  return out
}

export async function scryptKey(password, saltB64, params) {
  const salt = fromB64(saltB64)
  const keyLen = params?.keyLen ?? 32
  const N = params?.N ?? 16384
  const r = params?.r ?? 8
  const p = params?.p ?? 1

  return await new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      keyLen,
      { N, r, p, maxmem: 128 * 1024 * 1024 },
      (err, derivedKey) => {
        if (err) reject(err)
        else resolve(derivedKey)
      }
    )
  })
}

export function aesGcmEncrypt(key, plaintext) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return { ivB64: toB64(iv), tagB64: toB64(tag), dataB64: toB64(data) }
}

export function aesGcmDecrypt(key, payload) {
  const iv = fromB64(payload.ivB64)
  const tag = fromB64(payload.tagB64)
  const data = fromB64(payload.dataB64)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()])
}

export function buildKdf() {
  const salt = crypto.randomBytes(16)
  return {
    name: 'scrypt',
    saltB64: toB64(salt),
    N: 16384,
    r: 8,
    p: 1,
    keyLen: 32
  }
}

export async function wrapVaultKeyWithPassword(vaultKey, password, kdf) {
  const key = await scryptKey(password, kdf.saltB64, kdf)
  const wrapped = aesGcmEncrypt(key, vaultKey)
  return { kdf, cipher: { name: 'aes-256-gcm', ...wrapped } }
}

export async function unwrapVaultKeyWithPassword(wrapper, password) {
  if (!wrapper?.kdf || !wrapper?.cipher) throw new Error('Invalid wrapper')
  const key = await scryptKey(password, wrapper.kdf.saltB64, wrapper.kdf)
  return aesGcmDecrypt(key, wrapper.cipher)
}

export function encryptVaultData(vaultKey, obj) {
  const plaintext = Buffer.from(JSON.stringify(obj), 'utf8')
  const enc = aesGcmEncrypt(vaultKey, plaintext)
  return { cipher: { name: 'aes-256-gcm', ...enc } }
}

export function decryptVaultData(vaultKey, payload) {
  if (!payload?.cipher) throw new Error('Invalid data payload')
  const decrypted = aesGcmDecrypt(vaultKey, payload.cipher)
  return JSON.parse(decrypted.toString('utf8'))
}
