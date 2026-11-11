import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { I18nProvider } from '../src/i18n/I18nProvider'
import WallCalibration from '../src/components/monitor/WallCalibration'
import type { OverlayDerived } from '../src/global'

// Calibration flow against a mocked backend: idle point, GPU load through the stress engine, solve, save.
const derived = (over: Partial<OverlayDerived> = {}): OverlayDerived => ({
  settings: { psuWatts: 750, psuRating: 'gold', psuCustom: [82, 87, 90, 87], extraWatts: 40, tariff: 0.9, hoursPerDay: 24 },
  gpuW: 60, cpuW: 20,
  efficiency: { fpsPerWatt: null, fpsPerWattAvg: null, joulesPerFrame: null, joulesPerFrameAvg: null, fpsPerWattSystem: null },
  energy: { gpuKj: null, cpuKj: null, source: null, seconds: 0 },
  system: { dcW: 120, loadPct: 16, efficiency: 85, acW: 141, lossW: 21, missing: [], partial: false, est: true },
  cost: { est: true, gpu: null, cpuGpu: null, withExtra: null, wall: null },
  calibration: { state: 'none', at: null, hwId: 'gpu=G|cpu=C|psu=750W:gold', extraW: null, effScale: null, sigma: null },
  ...over
})

function backend() {
  let load = false
  let finishStress: ((r: unknown) => void) | null = null
  const fit = { ok: true, extraW: 41.2, effScale: 0.968, effAt: [83.1, 87.4], sigma: { extraW: 4.1, effPct: 1.6 }, points: [{ measW: 80, wallW: 145 }, { measW: 330, wallW: 425 }] }
  const api = {
    overlay: {
      power: vi.fn(async () => ({ ok: true, at: Date.now(), gaming: false, hw: null, derived: derived(load ? { gpuW: 300, cpuW: 30 } : {}) })),
      calibrate: vi.fn(async ({ save }: { save?: boolean }) => (save ? { ...fit, saved: true, settings: { psuWatts: 750 } } : fit)),
      clearCalibration: vi.fn(async () => ({ ok: true }))
    },
    gpubench: {
      stress: vi.fn(() => { load = true; return new Promise((res) => { finishStress = res }) }),
      cancel: vi.fn(async () => { load = false; finishStress?.({ ok: false, error: 'cancelled' }); return { ok: true } }),
      viewport: vi.fn(async () => ({ ok: true })),
      onEvent: vi.fn(() => () => {})
    }
  }
  ;(window as any).darkhub = api
  return api
}

const mount = (d: OverlayDerived, onSaved = vi.fn(), needs: string | null = null) =>
  render(<I18nProvider><WallCalibration derived={d} needs={needs} onSaved={onSaved} windowMs={300} pollMs={25} /></I18nProvider>)

describe('wall calibration panel', () => {
  beforeEach(() => {
    cleanup()
    const store = new Map<string, string>([['darkhub.lang', 'en-US']])
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, String(v)), removeItem: (k: string) => store.delete(k), clear: () => store.clear() })
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} })
  })

  it('refuses to start without the CPU power reading and says why', () => {
    backend()
    mount(derived({ cpuW: null, system: { ...derived().system, missing: ['cpu'], partial: true } }), vi.fn(), 'needs admin')
    expect((screen.getByRole('button', { name: 'Calibrate with meter' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('alert').textContent).toMatch(/without the CPU and GPU power readings.*needs admin/)
  })

  it('shows a calibration ignored because the hardware changed', () => {
    backend()
    mount(derived({ calibration: { state: 'mismatch', at: Date.UTC(2026, 0, 2), hwId: 'x', extraW: 40, effScale: 1, sigma: null } }))
    expect(screen.getByText(/is being ignored: the GPU, the CPU or the selected PSU changed/)).toBeTruthy()
  })

  it('runs idle point, GPU load, solve and save', async () => {
    const api = backend()
    const onSaved = vi.fn()
    mount(derived(), onSaved)
    fireEvent.click(screen.getByRole('button', { name: 'Calibrate with meter' }))

    // idle: capture only once the window is stable
    const capture = await screen.findByRole('button', { name: 'Capture point' })
    await waitFor(() => expect((capture as HTMLButtonElement).disabled).toBe(false), { timeout: 15000 })
    fireEvent.click(capture)
    // an impossible reading is rejected before anything is sent
    fireEvent.change(screen.getByLabelText('Wall power'), { target: { value: '70' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reading' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/cannot be at or below the measured/)
    fireEvent.change(screen.getByLabelText('Wall power'), { target: { value: '145' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reading' }))

    // load: the GPU stress engine, raster only (steady power), stopped by the user once stable
    fireEvent.click(await screen.findByRole('button', { name: /Start load/ }))
    expect(api.gpubench.stress).toHaveBeenCalledWith({ minutes: 5, load: 'raster', tempLimit: 90 })
    await screen.findByText(/Stable: read the meter now and stop the load/, {}, { timeout: 15000 })
    fireEvent.click(screen.getByRole('button', { name: /Stop load/ }))
    await waitFor(() => expect(api.gpubench.cancel).toHaveBeenCalled())

    // V x A x PF entry for the load reading
    await waitFor(() => expect(screen.queryByRole('alert')?.textContent ?? '').toBe(''))
    fireEvent.click(await screen.findByLabelText('Voltage, current and power factor'))
    fireEvent.change(screen.getByLabelText('Voltage'), { target: { value: '220' } })
    fireEvent.change(screen.getByLabelText('Current'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Power factor'), { target: { value: '0.966' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reading' }))

    await screen.findByText('Result')
    const sent = api.overlay.calibrate.mock.calls[0][0] as { points: { measW: number; wallW: number; spread: number }[]; save: boolean }
    expect(sent.save).toBe(false)
    expect(sent.points[0]).toMatchObject({ measW: 80, wallW: 145 })
    expect(sent.points[1].measW).toBeCloseTo(330, 5)
    expect(sent.points[1].wallW).toBeCloseTo(425.04, 5)
    expect(sent.points[1].spread).toBeLessThanOrEqual(0.05)
    expect(screen.getByText('41')).toBeTruthy() // hidden draw, font-mono

    fireEvent.click(screen.getByRole('button', { name: 'Save calibration' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ psuWatts: 750 }))
    expect(api.overlay.calibrate.mock.calls[1][0]).toMatchObject({ save: true })
  }, 40000)

  it('rejects a load point that was not stable when stopped', async () => {
    const api = backend()
    mount(derived())
    fireEvent.click(screen.getByRole('button', { name: 'Calibrate with meter' }))
    const capture = await screen.findByRole('button', { name: 'Capture point' })
    await waitFor(() => expect((capture as HTMLButtonElement).disabled).toBe(false), { timeout: 15000 })
    fireEvent.click(capture)
    fireEvent.change(screen.getByLabelText('Wall power'), { target: { value: '145' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reading' }))
    fireEvent.click(await screen.findByRole('button', { name: /Start load/ }))
    // stop immediately: the window is not covered yet
    fireEvent.click(await screen.findByRole('button', { name: /Stop load/ }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/not stable when the load was stopped/)
    expect(api.gpubench.cancel).toHaveBeenCalled()
    expect(api.overlay.calibrate).not.toHaveBeenCalled()
  }, 40000)
})
