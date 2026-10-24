// @vitest-environment node
import { describe, it, expect } from 'vitest'
// @ts-ignore - plain JS module
import { decodeApproved, encodeApproved, exeFromCommand, parseBootEvents, impactFor, sensitivity } from '../electron/services/startup/startupModel.js'

describe('startupModel', () => {
  it('round-trips StartupApproved bytes like Task Manager', () => {
    expect(decodeApproved([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toEqual({ enabled: true, disabledAt: null })
    expect(decodeApproved(undefined).enabled).toBe(true)
    expect(decodeApproved([6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).enabled).toBe(true)
    const when = Date.UTC(2026, 9, 24, 12, 0, 0)
    const off = encodeApproved(false, when)
    expect(off[0]).toBe(3)
    expect(decodeApproved(off)).toEqual({ enabled: false, disabledAt: when })
    expect(encodeApproved(true)).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('extracts the executable from Run commands', () => {
    expect(exeFromCommand('"C:\\Program Files (x86)\\Steam\\steam.exe" -silent')).toBe('C:\\Program Files (x86)\\Steam\\steam.exe')
    expect(exeFromCommand('C:\\Riot Games\\Riot Client\\RiotClientServices.exe --launch-background-mode')).toBe('C:\\Riot Games\\Riot Client\\RiotClientServices.exe')
    expect(exeFromCommand('')).toBe('')
  })

  it('parses boot events and matches measured impact only', () => {
    const { boots, slow } = parseBootEvents([
      { id: 100, time: 2000, data: { BootTime: '41000', MainPathBootTime: '15000', BootPostBootTime: '26000' } },
      { id: 101, time: 2001, data: { FileName: 'Steam.exe', FriendlyName: 'Steam', TotalTime: '5000', DegradationTime: '3200' } },
      { id: 101, time: 1001, data: { FileName: 'steam.exe', TotalTime: '4000', DegradationTime: '2800' } },
      { id: 100, time: 1000, data: { BootTime: '52000' } }
    ])
    expect(boots.map((b) => b.totalMs)).toEqual([41000, 52000])
    expect(impactFor({ exe: 'C:\\Program Files (x86)\\Steam\\steam.exe' }, slow)).toEqual({ lastMs: 3200, avgMs: 3000, count: 2, lastAt: 2001 })
    expect(impactFor({ exe: 'C:\\x\\discord.exe' }, slow)).toBeNull()
  })

  it('flags security and system items', () => {
    expect(sensitivity({ name: 'SecurityHealth', exe: 'C:\\Windows\\System32\\SecurityHealthSystray.exe' })).toBe('security')
    expect(sensitivity({ name: 'Steam', exe: 'C:\\Steam\\steam.exe' })).toBeNull()
    expect(sensitivity({ name: 'OneDriveSetup', exe: '' })).toBeNull()
    expect(sensitivity({ name: 'ESET GUI', exe: 'C:\\Program Files\\ESET\\ESET Security\\egui.exe' })).toBe('security')
  })
})
