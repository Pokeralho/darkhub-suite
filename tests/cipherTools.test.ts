// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { transform, cipher, hash, identify, decodeJwt, caesarBruteForce, type TextMode } from '../src/lib/cipherTools';

const sample = 'Olá, DarkHub! 123 ✓';

describe('cipherTools', () => {
  it('round-trips every text mode', () => {
    const modes: [TextMode, string][] = [['base64', ''], ['base64url', ''], ['base32', ''], ['base58', ''], ['hex', ''], ['binary', ''], ['url', ''], ['html', ''], ['rot13', ''], ['rot47', ''], ['atbash', ''], ['caesar', '7'], ['vigenere', 'lemon'], ['xor', 'k3y']];
    for (const [m, key] of modes) {
      const enc = transform(m, sample, 'encode', key);
      expect(transform(m, enc, 'decode', key), m).toBe(sample);
    }
  });

  it('matches known values', () => {
    expect(transform('base64', 'hello', 'encode')).toBe('aGVsbG8=');
    expect(transform('base32', 'foobar', 'encode')).toBe('MZXW6YTBOI======');
    expect(transform('base58', 'hello world', 'encode')).toBe('StV1DL6CwTryKyV');
    expect(transform('vigenere', 'ATTACKATDAWN', 'encode', 'LEMON')).toBe('LXFOPVEFRNHR');
    expect(transform('morse', 'SOS HELP', 'encode')).toBe('... --- ... / .... . .-.. .--.');
    expect(transform('morse', '... --- ... / .... . .-.. .--.', 'decode')).toBe('SOS HELP');
    expect(caesarBruteForce('Khoor')[2].text).toBe('Hello');
  });

  it('hashes and HMACs', () => {
    expect(hash('MD5', 'abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(hash('SHA-256', 'abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hash('SHA-256', 'The quick brown fox jumps over the lazy dog', 'key')).toBe('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
  });

  it('AES-GCM authenticates and the CryptoJS ciphers round-trip', async () => {
    const ct = await cipher('aes-gcm', sample, 'encrypt', 'pw');
    expect(await cipher('aes-gcm', ct, 'decrypt', 'pw')).toBe(sample);
    await expect(cipher('aes-gcm', ct, 'decrypt', 'wrong')).rejects.toThrow();
    for (const m of ['aes', 'tripledes', 'rabbit', 'rc4'] as const) {
      expect(await cipher(m, await cipher(m, sample, 'encrypt', 'pw'), 'decrypt', 'pw')).toBe(sample);
    }
    expect(identify(ct)).toContain('cipher:DarkHub AES-256-GCM');
  });

  it('identifies common formats and decodes JWTs', () => {
    expect(identify('900150983cd24fb0d6963f7d28e17f72')[0]).toBe('hash:MD5 / NTLM');
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.sig';
    expect(identify(jwt)[0]).toBe('jwt');
    expect(decodeJwt(jwt).payload).toEqual({ sub: '123' });
    expect(identify('aGVsbG8=')).toContain('base64');
  });
});
