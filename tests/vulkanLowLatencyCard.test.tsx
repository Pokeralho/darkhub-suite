import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import { I18nProvider } from '../src/i18n/I18nProvider'
import VulkanLowLatencyCard from '../src/components/VulkanLowLatencyCard'

const status = (over: object = {}) => ({
  ok: true, mode: 'off', bundled: true, installed: false, registered: false, upToDate: false,
  installDir: 'C:\\Program Files\\DarkHubVkLayer', gpus: [{ name: 'AMD Radeon RX 6600', vendor: 'amd' }],
  recommendation: 'useful', ...over
})

function mockApi(initial: object) {
  let current = status(initial)
  const api = {
    lowLatencyStatus: vi.fn(async () => current),
    lowLatencyApply: vi.fn(async (mode: string) => {
      current = status({ ...initial, mode })
      return { ok: true, mode, restartRequired: true, filesLeft: false }
    })
  }
  ;(window as any).darkhub = { darkpacer: api }
  return api
}

const radio = (name: RegExp) => screen.getByRole('radio', { name }) as HTMLButtonElement

describe('Vulkan low latency card', () => {
  beforeEach(() => {
    cleanup()
    const store = new Map<string, string>([['darkhub.lang', 'pt-BR']])
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, String(v)), removeItem: (k: string) => store.delete(k), clear: () => store.clear() })
  })

  it('on AMD the modes are available and picking Reflex applies it', async () => {
    const api = mockApi({})
    render(<I18nProvider><VulkanLowLatencyCard /></I18nProvider>)
    await screen.findByText(/AMD Radeon RX 6600/)
    expect(radio(/^Desligado/).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(radio(/^Reflex/))
    await waitFor(() => expect(api.lowLatencyApply).toHaveBeenCalledWith('reflex'))
    await screen.findByText(/Feche e abra de novo o jogo/)
    await waitFor(() => expect(radio(/^Reflex/).getAttribute('aria-checked')).toBe('true'))
  })

  it('on NVIDIA it explains Reflex is native and keeps the modes locked until the user opts in', async () => {
    const api = mockApi({ gpus: [{ name: 'NVIDIA GeForce RTX 5060', vendor: 'nvidia' }], recommendation: 'nativeNvidia' })
    render(<I18nProvider><VulkanLowLatencyCard /></I18nProvider>)
    await screen.findByText(/o Reflex já vem no driver/)
    expect(radio(/^Anti-Lag 2/).disabled).toBe(true)
    fireEvent.click(radio(/^Anti-Lag 2/))
    expect(api.lowLatencyApply).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('checkbox', { name: /testar mesmo assim/ }))
    expect(radio(/^Anti-Lag 2/).disabled).toBe(false)
  })

  it('shows the in-use error when a game holds the DLL', async () => {
    const api = mockApi({})
    api.lowLatencyApply.mockResolvedValueOnce({ ok: false, error: 'in_use' } as any)
    render(<I18nProvider><VulkanLowLatencyCard /></I18nProvider>)
    await screen.findByText(/AMD Radeon RX 6600/)
    fireEvent.click(radio(/^Anti-Lag 2/))
    await screen.findByText(/A DLL está em uso/)
  })
})
