// @vitest-environment node
// Fixes found by the VM audit run (2026-11-07).
import { describe, it, expect, vi, beforeEach } from 'vitest'
// @ts-ignore - plain JS module
import { decodeConsoleText } from '../electron/services/consoleText.js'

describe('native tool output', () => {
  it('keeps UTF-8 and decodes the OEM code page', () => {
    const oem = Buffer.from([0x63, 0x6f, 0x6e, 0x66, 0x69, 0x67, 0x75, 0x72, 0x61, 0x87, 0xc6, 0x6f]).toString('latin1')
    expect(decodeConsoleText(oem)).toBe('configuração')
    expect(decodeConsoleText(Buffer.from('configuração', 'utf8').toString('latin1'))).toBe('configuração')
    expect(decodeConsoleText('plain ascii')).toBe('plain ascii')
  })
})

describe('CPU core parking revert', () => {
  let script = ''
  beforeEach(() => { vi.resetModules(); script = '' })

  async function engineWith(snap: object) {
    vi.doMock('../electron/services/optimizer/DeepTweaksEngine.js', () => ({
      default: { getExtra: () => snap, saveExtra: () => {}, clearExtra: () => {} }
    }))
    // @ts-ignore - plain JS module
    const mod = await import('../electron/services/optimizer/SystemEngine.js')
    const engine = mod.default
    engine._runMarked = async (s: string) => { script = s; return { ok: true, out: '' } }
    return engine
  }

  it('restores a hidden default by dropping the value it wrote', async () => {
    if (process.platform !== 'win32') return // requires Windows powercfg/PowerShell
    const engine = await engineWith({ scheme: '381b4222-f694-41f0-9685-ff5bb260df2e', CPMINCORES: '-', CPMAXCORES: '-' })
    const r = await engine.revertCpuUnpark()
    expect(r.ok).toBe(true)
    expect(script).toMatch(/Remove-ItemProperty -LiteralPath 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\User\\PowerSchemes\\381b4222-f694-41f0-9685-ff5bb260df2e\\54533251-82be-4824-96c1-47b60b740d00\\0cc5b647-c1df-4637-891a-dec35c318583' -Name ACSettingIndex/)
    expect(script).toMatch(/powercfg\.exe \/setactive 381b4222/)
  })

  it('still writes numeric snapshots back', async () => {
    if (process.platform !== 'win32') return // requires Windows powercfg/PowerShell
    const engine = await engineWith({ scheme: '381b4222-f694-41f0-9685-ff5bb260df2e', CPMINCORES: '5', CPMAXCORES: '100' })
    await engine.revertCpuUnpark()
    expect(script).toMatch(/SUB_PROCESSOR CPMINCORES 5 /)
    expect(script).not.toMatch(/Remove-ItemProperty/)
  })
})
