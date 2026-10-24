// @vitest-environment node
import { describe, it, expect } from 'vitest'
// @ts-ignore - plain JS module
import { COMPONENTS, componentStatus, sxsFromRoot, getComponent, restoreErrorText } from '../electron/services/restore/componentCatalog.js'

describe('componentCatalog', () => {
  it('has unique ids and a valid install route for every item', () => {
    expect(new Set(COMPONENTS.map((c: any) => c.id)).size).toBe(COMPONENTS.length)
    for (const c of COMPONENTS as any[]) {
      if (c.kind === 'store') expect(c.storeId).toMatch(/^9[A-Z0-9]{11}$/)
      if (c.kind === 'capability' || c.kind === 'feature') expect(c.name).toBeTruthy()
      if (c.kind !== 'capability' && c.kind !== 'feature') expect(c.appx).toBeTruthy()
    }
  })

  it('maps detection output to states', () => {
    const s = componentStatus({
      capabilities: [{ name: 'Media.WindowsMediaPlayer~~~~0.0.12.0', state: 'NotPresent' }, { name: 'WMIC~~~~', state: 'Installed' }],
      features: { NetFx3: 'DisabledWithPayloadRemoved', MediaPlayback: 'Enabled' },
      appx: ['Microsoft.WindowsCalculator', 'microsoft.windowsstore']
    })
    const by = Object.fromEntries(s.map((x: any) => [x.id, x]))
    expect(by['wmp-legacy'].state).toBe('missing')
    expect(by['wmp-legacy'].detail).toBe('Media.WindowsMediaPlayer~~~~0.0.12.0')
    expect(by.wmic.state).toBe('installed')
    expect(by['ps-ise'].state).toBe('unavailable')
    expect(by.netfx3).toMatchObject({ state: 'missing', detail: 'payload-removed' })
    expect(by.mediaplayback.state).toBe('installed')
    expect(by.calculator.state).toBe('installed')
    expect(by.store.state).toBe('installed')
    expect(by.paint.state).toBe('missing')
    expect(componentStatus({})[0].state).toBe('unknown')
    const p = componentStatus({ capabilities: [{ name: 'Media.WindowsMediaPlayer~~~~0.0.12.0', state: 'InstallPending' }], features: { NetFx3: 'EnablePending' }, appx: [] })
    expect(p.find((x: any) => x.id === 'wmp-legacy').state).toBe('pending')
    expect(p.find((x: any) => x.id === 'netfx3').state).toBe('pending')
    expect(restoreErrorText('Falha em Enable-WindowsOptionalFeature. Codigo do erro = 0x800f0950')).toBe('source-missing')
    expect(restoreErrorText('0x800F0954')).toBe('wsus')
    expect(restoreErrorText('outro')).toBe('outro')
  })

  it('finds the sxs folder from an ISO drive or the folder itself', () => {
    expect(sxsFromRoot('E:\\')).toBe('E:\\sources\\sxs')
    expect(sxsFromRoot('D:\\iso\\sources\\sxs\\')).toBe('D:\\iso\\sources\\sxs')
    expect(sxsFromRoot('')).toBeNull()
    expect(getComponent('netfx3').isoSource).toBe(true)
  })
})
