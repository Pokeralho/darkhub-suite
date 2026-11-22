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
    // the Windows Update client itself is broken (the report that started the catalog route)
    expect(wuHintKey('download 80004002')).toBe('component')
    expect(wuHintKey('download 80004002 (first try 80D02002)')).toBe('component')
    expect(wuHintKey('80040154 Class not registered')).toBe('component')
    expect(wuHintKey('download 80004002; not in the Microsoft Update Catalog')).toBe('nocatalog')
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

  it('searches again after the retry restarts Windows Update, instead of reusing the dead update objects', () => {
    const s = buildInstallScript({ updateIds: ['3b9b2078-e71c-437d-83be-5a110f224750'], packages: [], unlockWu: false, progressFile: 'C:/p.txt' })
    const body = s.slice(s.indexOf('if (-not $abort -and $wuIds.Count -gt 0)'))
    const simple = body.indexOf('Set-DhDoSimple')
    const again = body.indexOf('New-DhWuSearch', simple)
    const retry = body.indexOf('Get-DhWuDownload $id', again)
    expect(simple).toBeGreaterThan(0)
    expect(again).toBeGreaterThan(simple)
    expect(retry).toBeGreaterThan(again)
    // update objects are always read from the current search, never kept across it
    expect(body).not.toContain('$found[')
    expect(body).toContain("(first try ' + $first + ')")
    // the services Windows Update needs are enabled for the job even when no policy unlock was asked for
    expect(body).toContain('Unlock-DhWu $false')
    expect(s).toContain('function Unlock-DhWu([bool]$policies = $true)')
    // once Delivery Optimization is known not to start, the remaining downloads are not attempted one by one
    expect(body).toContain('(Delivery Optimization service unavailable)')
    expect(body.indexOf('if ($doDead -and')).toBeLessThan(body.indexOf("DhP ('wu:' + $id) 'downloading'"))
  })
})
