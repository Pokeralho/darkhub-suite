// @vitest-environment node
import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
// @ts-ignore - plain JS module
import { sealVault, openVault, makeCode, parseCode } from '../electron/services/vaultTransfer/vaultTransfer.js'

describe('vaultTransfer', () => {
  const vault = Buffer.from(JSON.stringify({ version: 1, wrappers: { master: 'x' }, data: 'y' }))

  it('round-trips and rejects a wrong key or a modified file', () => {
    const { key, blob } = sealVault(vault)
    expect(openVault(blob, key).equals(vault)).toBe(true)
    expect(() => openVault(blob, crypto.randomBytes(32))).toThrow()
    const tampered = Buffer.from(blob)
    tampered[tampered.length - 20] ^= 1
    expect(() => openVault(tampered, key)).toThrow()
    expect(() => openVault(Buffer.from('nope'), key)).toThrow()
  })

  it('makes and parses transfer codes', () => {
    const key = crypto.randomBytes(32)
    const code = makeCode('aB3_x-9', key)
    const p = parseCode(` ${code} `)
    expect(p.fileId).toBe('aB3_x-9')
    expect(p.key.equals(key)).toBe(true)
    expect(parseCode(makeCode('us3XsyC26l', key)).fileId).toBe('us3XsyC26l')
    expect(() => parseCode('dhv1.../etc.AAAA')).toThrow()
    expect(() => parseCode('https://evil.example/d/1')).toThrow()
  })
})
