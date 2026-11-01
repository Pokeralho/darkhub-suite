// @vitest-environment node
import { describe, it, expect } from 'vitest'
// @ts-ignore - plain JS module
import { buildInstallScript } from '../electron/services/drivers/DriverInstallService.js'
import { wuHintKey } from '../src/components/drivers/MissingDrivers'

describe('driver center: Windows Update download failures', () => {
  it('explains the update\'s own error code', () => {
    expect(wuHintKey('download 80072EE7')).toBe('network')
    expect(wuHintKey('download 80D02002')).toBe('delivery')
    expect(wuHintKey('download 80070422')).toBe('service')
    expect(wuHintKey('download 800B0101')).toBe('clock')
    expect(wuHintKey('install result 4 80073712')).toBe('store')
    expect(wuHintKey('download 80240022')).toBe('other')
    expect(wuHintKey('not offered anymore')).toBeNull()
  })

  it('the install job retries in simple mode, reports the real cause and restores what it changed', () => {
    const s = buildInstallScript({ updateIds: ['3b9b2078-e71c-437d-83be-5a110f224750'], packages: [], unlockWu: true, progressFile: 'C:/p.txt' })
    expect(s).toContain('$dr.GetUpdateResult(0).HResult')
    expect(s).toContain('Set-DhDoSimple')
    expect(s).toMatch(/function Restore-DhWu \{\s*Restore-DhDo/)
    expect(s).toContain("'cryptsvc','trustedinstaller'")
    expect(/[^\x00-\x7f]/.test(s)).toBe(false) // runs from a temp .ps1 in PowerShell 5.1
  })
})
