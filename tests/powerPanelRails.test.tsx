import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React from 'react'
import { I18nProvider } from '../src/i18n/I18nProvider'
import { RailRows } from '../src/components/monitor/PowerPanel'
import type { OverlayHw } from '../src/global'

type Gpu = NonNullable<OverlayHw['gpu']>
const gpu = (over: Partial<Gpu>): Gpu => ({ name: 'NVIDIA GeForce RTX 4090', engines: {}, ...over } as Gpu)
const mount = (g: Gpu) => render(<I18nProvider><ul><RailRows gpu={g} /></ul></I18nProvider>)

describe('power panel: GPU input rails', () => {
  beforeEach(() => {
    cleanup()
    const store = new Map<string, string>([['darkhub.lang', 'en-US']])
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, String(v)), removeItem: (k: string) => store.delete(k), clear: () => store.clear() })
  })

  it('shows W, V and A per connector as measured values (no *), and the derived sum', () => {
    const { container } = mount(gpu({ railsState: 'ok', railsW: 412.5, rails: [{ id: 'PCIE', w: 22.5, v: 12.05, a: 1.87 }, { id: '16PIN0', w: 390, v: 11.98, a: 32.6 }] }))
    const slot = container.querySelector('[data-rail="PCIE"]')!
    expect(slot.textContent).toContain('PCIe slot')
    expect(slot.textContent).toMatch(/22\.5 W · 12\.05 V · 1\.9 A/)
    expect(slot.textContent).not.toContain('*')
    expect(container.querySelector('[data-rail="16PIN0"]')!.textContent).toMatch(/16-pin cable.*390\.0 W · 11\.98 V · 32\.6 A/)
    expect(screen.getByText('GPU input (sum of rails)').parentElement!.textContent).toMatch(/\*412\.5 W/)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('marks a 12 V rail below 11.4 V in amber and explains it', () => {
    const { container } = mount(gpu({ railsState: 'ok', railsW: 300, rails: [{ id: '16PIN0', w: 300, v: 11.31, a: 26.5 }] }))
    const v = [...container.querySelectorAll('[data-rail="16PIN0"] span')].find((e) => e.textContent?.startsWith('11.31'))!
    expect(v.className).toContain('text-amber-300')
    expect(screen.getByRole('alert').textContent).toMatch(/Below 11\.4 V/)
  })

  it('a missing value on a sensed rail is a dash, never 0', () => {
    const { container } = mount(gpu({ railsState: 'ok', railsW: 20, rails: [{ id: 'PCIE', w: 20, v: null, a: null }] }))
    expect(container.querySelector('[data-rail="PCIE"]')!.textContent).toMatch(/20\.0 W · — · —/)
  })

  it('shows a dash with the reason when the card does not sense its connectors', () => {
    const { container } = mount(gpu({ railsState: 'unsupported', rails: null }))
    expect(container.querySelector('[data-rails="none"]')!.textContent).toMatch(/—.*does not measure input power per connector/)
    cleanup()
    const r2 = mount(gpu({ name: 'AMD Radeon RX 7900 XT', railsState: 'non_nvidia', rails: null }))
    expect(r2.container.querySelector('[data-rails="none"]')!.textContent).toMatch(/NVIDIA cards only/)
    cleanup()
    const r3 = mount(gpu({ railsState: 'disabled', rails: [{ id: 'PCIE', w: 1, v: 12, a: 0.1 }] }))
    expect(r3.container.querySelector('[data-rail]')).toBeNull() // only an 'ok' state is shown as readings
  })
})
