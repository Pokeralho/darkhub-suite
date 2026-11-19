import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import React from 'react'
import { I18nProvider } from '../src/i18n/I18nProvider'
import UpdaterOverlay, { UPDATER_INIT_DELAY_MS } from '../src/components/UpdaterOverlay'

function mockUpdater(status: any = { state: 'idle' }) {
  const off = vi.fn()
  let handler: ((p: any) => void) | null = null
  const api = {
    getStatus: vi.fn(async () => status),
    check: vi.fn(), download: vi.fn(async () => ({ ok: true })), install: vi.fn(),
    onEvent: vi.fn((cb: (p: any) => void) => { handler = cb; return off })
  }
  ;(window as any).darkhub = { updater: api }
  return { api, off, emit: (p: any) => act(() => handler?.(p)) }
}

const renderIt = () => render(<I18nProvider><UpdaterOverlay /></I18nProvider>)

describe('UpdaterOverlay', () => {
  beforeEach(() => {
    cleanup()
    vi.useFakeTimers()
    const store = new Map<string, string>([['darkhub.lang', 'en-US']])
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, String(v)), removeItem: (k: string) => store.delete(k), clear: () => store.clear() })
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('removes the updater:event listener on unmount', async () => {
    const { api, off } = mockUpdater()
    const { unmount } = renderIt()
    await act(async () => { await vi.advanceTimersByTimeAsync(UPDATER_INIT_DELAY_MS + 10) })
    expect(api.onEvent).toHaveBeenCalledTimes(1)
    unmount()
    expect(off).toHaveBeenCalledTimes(1)
  })

  it('never subscribes when unmounted before the delayed init', async () => {
    const { api } = mockUpdater()
    const { unmount } = renderIt()
    unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(UPDATER_INIT_DELAY_MS + 10) })
    expect(api.getStatus).not.toHaveBeenCalled()
    expect(api.onEvent).not.toHaveBeenCalled()
  })

  it('drops a subscription that lands after unmount (slow getStatus)', async () => {
    let release: (v: any) => void = () => {}
    const { api, off } = mockUpdater()
    api.getStatus.mockImplementation(() => new Promise((r) => { release = r }))
    const { unmount } = renderIt()
    await act(async () => { await vi.advanceTimersByTimeAsync(UPDATER_INIT_DELAY_MS + 10) })
    unmount()
    await act(async () => { release({ state: 'idle' }) })
    expect(api.onEvent).not.toHaveBeenCalled()
    expect(off).not.toHaveBeenCalled()
  })

  it('is a translated modal dialog that Escape closes', async () => {
    const { emit } = mockUpdater()
    renderIt()
    await act(async () => { await vi.advanceTimersByTimeAsync(UPDATER_INIT_DELAY_MS + 10) })
    emit({ type: 'available', info: { version: '9.9.9' } })
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByText('DarkHub update available')).toBeTruthy()
    expect(dialog.contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
