// Encoders, classical ciphers, modern ciphers and hashes for the Decryption screen. Pure (no React).
import CryptoJS from 'crypto-js';

const utf8 = new TextEncoder();
const fromUtf8 = (b: Uint8Array) => new TextDecoder('utf-8', { fatal: true }).decode(b);

export function bytesToBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
export function base64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = clean + '='.repeat((4 - (clean.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(b: Uint8Array): string {
  let bits = 0, value = 0, out = '';
  for (const byte of b) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out + '='.repeat((8 - (out.length % 8)) % 8);
}
function base32Decode(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/[\s=]/g, '');
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('invalid');
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Uint8Array.from(out);
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Encode(b: Uint8Array): string {
  let n = 0n;
  for (const byte of b) n = (n << 8n) | BigInt(byte);
  let out = '';
  while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
  for (const byte of b) { if (byte !== 0) break; out = '1' + out; }
  return out;
}
function base58Decode(s: string): Uint8Array {
  let n = 0n;
  for (const ch of s.trim()) {
    const i = B58.indexOf(ch);
    if (i < 0) throw new Error('invalid');
    n = n * 58n + BigInt(i);
  }
  const out: number[] = [];
  while (n > 0n) { out.unshift(Number(n & 255n)); n >>= 8n; }
  for (const ch of s.trim()) { if (ch !== '1') break; out.unshift(0); }
  return Uint8Array.from(out);
}

const MORSE: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--',
  N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--', '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...',
  ':': '---...', ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', '_': '..--.-', '"': '.-..-.', '$': '...-..-', '@': '.--.-.'
};
const MORSE_REV = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

const shiftLetters = (s: string, k: number) => s.replace(/[a-z]/gi, (c) => {
  const base = c <= 'Z' ? 65 : 97;
  return String.fromCharCode(((c.charCodeAt(0) - base + (k % 26) + 26) % 26) + base);
});
const atbash = (s: string) => s.replace(/[a-z]/gi, (c) => {
  const base = c <= 'Z' ? 65 : 97;
  return String.fromCharCode(25 - (c.charCodeAt(0) - base) + base);
});
const rot47 = (s: string) => s.replace(/[!-~]/g, (c) => String.fromCharCode(33 + ((c.charCodeAt(0) + 14) % 94)));
function vigenere(s: string, key: string, dir: 1 | -1): string {
  const k = key.toLowerCase().replace(/[^a-z]/g, '');
  if (!k) throw new Error('key');
  let j = 0;
  return s.replace(/[a-z]/gi, (c) => shiftLetters(c, dir * (k.charCodeAt(j++ % k.length) - 97)));
}
function htmlEncode(s: string): string {
  return s.replace(/[&<>"']|[^\x20-\x7e\n\r\t]/gu, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c] ?? `&#${c.codePointAt(0)};`);
}
function htmlDecode(s: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return named[e.toLowerCase()] ?? m;
  });
}
const hexToBytes = (s: string) => {
  const hex = s.replace(/\s|0x/gi, '');
  if (!/^([0-9a-f]{2})*$/i.test(hex)) throw new Error('invalid');
  return Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));
};
const bytesToHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export type TextMode =
  | 'base64' | 'base64url' | 'base32' | 'base58' | 'hex' | 'binary' | 'url' | 'html' | 'morse'
  | 'rot13' | 'rot47' | 'caesar' | 'atbash' | 'vigenere' | 'xor';

/** Text encodings and classical ciphers. `key` is the shift for Caesar, the keyword for Vigenère, the key for XOR. */
export function transform(mode: TextMode, input: string, dir: 'encode' | 'decode', key = ''): string {
  const enc = dir === 'encode';
  switch (mode) {
    case 'base64': return enc ? bytesToBase64(utf8.encode(input)) : fromUtf8(base64ToBytes(input));
    case 'base64url': return enc ? bytesToBase64(utf8.encode(input)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : fromUtf8(base64ToBytes(input));
    case 'base32': return enc ? base32Encode(utf8.encode(input)) : fromUtf8(base32Decode(input));
    case 'base58': return enc ? base58Encode(utf8.encode(input)) : fromUtf8(base58Decode(input));
    case 'hex': return enc ? bytesToHex(utf8.encode(input)) : fromUtf8(hexToBytes(input));
    case 'binary': {
      if (enc) return Array.from(utf8.encode(input), (b) => b.toString(2).padStart(8, '0')).join(' ');
      const bin = input.replace(/\s/g, '');
      if (!/^([01]{8})+$/.test(bin)) throw new Error('invalid');
      return fromUtf8(Uint8Array.from(bin.match(/.{8}/g) ?? [], (b) => parseInt(b, 2)));
    }
    case 'url': return enc ? encodeURIComponent(input) : decodeURIComponent(input.replace(/\+/g, ' '));
    case 'html': return enc ? htmlEncode(input) : htmlDecode(input);
    case 'morse':
      if (enc) return input.toUpperCase().split(/\s+/).map((w) => [...w].map((c) => MORSE[c] ?? '').filter(Boolean).join(' ')).join(' / ');
      return input.trim().split(/\s*\/\s*|\s{3,}/).map((w) => w.split(/\s+/).map((c) => MORSE_REV[c] ?? '').join('')).join(' ');
    case 'rot13': return shiftLetters(input, 13);
    case 'rot47': return rot47(input);
    case 'atbash': return atbash(input);
    case 'caesar': {
      const k = Number.parseInt(key, 10);
      if (!Number.isFinite(k)) throw new Error('key');
      return shiftLetters(input, enc ? k : -k);
    }
    case 'vigenere': return vigenere(input, key, enc ? 1 : -1);
    case 'xor': {
      if (!key) throw new Error('key');
      const k = utf8.encode(key);
      const data = enc ? utf8.encode(input) : hexToBytes(input);
      const out = data.map((b, i) => b ^ k[i % k.length]);
      return enc ? bytesToHex(out) : fromUtf8(out);
    }
  }
}

/** All 25 Caesar shifts, to read an unknown shift at a glance. */
export const caesarBruteForce = (input: string) => Array.from({ length: 25 }, (_, i) => ({ shift: i + 1, text: shiftLetters(input, -(i + 1)) }));

// ---- password-based ciphers ----

export type CipherMode = 'aes-gcm' | 'aes' | 'tripledes' | 'rabbit' | 'rc4';
const GCM_MAGIC = 'DHG1';
const PBKDF2_ITER = 310000;

async function gcmKey(password: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', utf8.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/**
 * aes-gcm: AES-256-GCM with a PBKDF2-SHA256 key (310k iterations), random salt and IV; output is
 * base64("DHG1" | salt(16) | iv(12) | ciphertext+tag). Authenticated: a wrong password fails instead of returning garbage.
 * The others use CryptoJS' OpenSSL-compatible format ("Salted__", EVP_BytesToKey/MD5) for interoperability only.
 */
export async function cipher(mode: CipherMode, input: string, dir: 'encrypt' | 'decrypt', password: string): Promise<string> {
  if (!password) throw new Error('key');
  if (mode === 'aes-gcm') {
    if (dir === 'encrypt') {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await gcmKey(password, salt), utf8.encode(input)));
      return bytesToBase64(Uint8Array.from([...utf8.encode(GCM_MAGIC), ...salt, ...iv, ...ct]));
    }
    const all = base64ToBytes(input);
    if (new TextDecoder().decode(all.subarray(0, 4)) !== GCM_MAGIC || all.length < 4 + 16 + 12 + 16) throw new Error('format');
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(20, 32) }, await gcmKey(password, all.slice(4, 20)), all.slice(32));
    return fromUtf8(new Uint8Array(pt));
  }
  const algo = { aes: CryptoJS.AES, tripledes: CryptoJS.TripleDES, rabbit: CryptoJS.Rabbit, rc4: CryptoJS.RC4 }[mode];
  if (dir === 'encrypt') return algo.encrypt(input, password).toString();
  const res = algo.decrypt(input.trim(), password).toString(CryptoJS.enc.Utf8);
  if (!res) throw new Error('key');
  return res;
}

// ---- hashes ----

export const HASHES = ['MD5', 'SHA-1', 'SHA-224', 'SHA-256', 'SHA-384', 'SHA-512', 'SHA3-256', 'SHA3-512', 'RIPEMD-160'] as const;
export type HashName = (typeof HASHES)[number];

export function hash(name: HashName, input: string, hmacKey = ''): string {
  const fn = {
    MD5: [CryptoJS.MD5, CryptoJS.HmacMD5], 'SHA-1': [CryptoJS.SHA1, CryptoJS.HmacSHA1], 'SHA-224': [CryptoJS.SHA224, CryptoJS.HmacSHA224],
    'SHA-256': [CryptoJS.SHA256, CryptoJS.HmacSHA256], 'SHA-384': [CryptoJS.SHA384, CryptoJS.HmacSHA384], 'SHA-512': [CryptoJS.SHA512, CryptoJS.HmacSHA512],
    'SHA3-256': [(m: string) => CryptoJS.SHA3(m, { outputLength: 256 }), (m: string, k: string) => CryptoJS.HmacSHA3(m, k)],
    'SHA3-512': [(m: string) => CryptoJS.SHA3(m, { outputLength: 512 }), (m: string, k: string) => CryptoJS.HmacSHA3(m, k)],
    'RIPEMD-160': [CryptoJS.RIPEMD160, CryptoJS.HmacRIPEMD160]
  }[name] as [(m: string) => { toString(e: unknown): string }, (m: string, k: string) => { toString(e: unknown): string }];
  return (hmacKey ? fn[1](input, hmacKey) : fn[0](input)).toString(CryptoJS.enc.Hex);
}

// ---- identification ----

/** Decodes a JWT's header and payload (no signature check: that needs the issuer's key). */
export function decodeJwt(token: string): { header: unknown; payload: unknown } {
  const parts = token.trim().split('.');
  if (parts.length < 2) throw new Error('format');
  return { header: JSON.parse(fromUtf8(base64ToBytes(parts[0]))), payload: JSON.parse(fromUtf8(base64ToBytes(parts[1]))) };
}

/** Best guesses for what an unknown string is, most likely first. Heuristic: a guess is a hint, not a proof. */
export function identify(input: string): string[] {
  const s = input.trim();
  if (!s) return [];
  const out: string[] = [];
  const hexLen: Record<number, string> = { 32: 'MD5 / NTLM', 40: 'SHA-1 / RIPEMD-160', 56: 'SHA-224', 64: 'SHA-256 / SHA3-256', 96: 'SHA-384', 128: 'SHA-512 / SHA3-512' };
  if (/^eyJ[\w-]+\.[\w-]+\.[\w-]*$/.test(s)) out.push('jwt');
  if (/^\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}$/.test(s)) out.push('hash:bcrypt');
  if (/^\$argon2(id|i|d)\$/.test(s)) out.push('hash:Argon2');
  if (/^\$6\$/.test(s)) out.push('hash:sha512crypt');
  if (/^[0-9a-f]+$/i.test(s) && hexLen[s.length]) out.push(`hash:${hexLen[s.length]}`);
  if (s.startsWith('U2FsdGVkX1')) out.push('cipher:OpenSSL / CryptoJS (AES, 3DES, Rabbit, RC4)');
  try { if (s.length >= 48 && new TextDecoder().decode(base64ToBytes(s).subarray(0, 4)) === GCM_MAGIC) out.push('cipher:DarkHub AES-256-GCM'); } catch { /* not base64 */ }
  if (/^[01\s]+$/.test(s) && s.replace(/\s/g, '').length % 8 === 0) out.push('binary');
  if (/^[.\-/\s]+$/.test(s)) out.push('morse');
  if (/^(0x)?([0-9a-f]{2}\s?)+$/i.test(s) && !out.some((x) => x.startsWith('hash'))) out.push('hex');
  if (/^[A-Z2-7]+=*$/.test(s) && s.length % 8 === 0) out.push('base32');
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(s) && s.length % 4 === 0 && s.length >= 4) out.push('base64');
  else if (/^[A-Za-z0-9_-]+$/.test(s) && s.length >= 8) out.push('base64url');
  if (/%[0-9a-f]{2}/i.test(s)) out.push('url');
  if (/&(#\d+|#x[0-9a-f]+|[a-z]+);/i.test(s)) out.push('html');
  return out;
}
