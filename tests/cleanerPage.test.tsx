import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import { I18nProvider } from '../src/i18n/I18nProvider'
import Cleaner from '../src/pages/Cleaner'

const target = (id: string, name: string, source: 'builtin' | 'winapp2' = 'builtin') => ({
  id, name, category: 'Windows', source, warning: null, ignored_registry: 0, rejected: [],
  rules: [{ dir: 'C:\\Temp', patterns: ['*.*'], recurse: true, remove_self: false }]
})
const totals = { files: 3, bytes: 3000, locked: 0, denied: 0, protected: 0, links: 0 }

function mockApi() {
  const api = {
    status: vi.fn(async () => ({ ok: true, engine: true, busy: null, backupDir: 'C:\\ProgramData\\DarkHub\\Cleaner\\backups', winapp2: { installed: false }, url: 'x' })),
    listTargets: vi.fn(async () => ({ ok: true, targets: [target('dh:user-temp', 'Temporários do usuário'), target('w2:Foo *', 'Foo', 'winapp2')], stats: { builtin: 1, winapp2_sections: 0, winapp2_detected: 0, rejected_rules: 0 } })),
    scan: vi.fn(async () => ({ ok: true, dry_run: true, shred: 0, unknown_ids: [], total: totals, targets: [{ id: 'dh:user-temp', name: 'x', ...totals, sample: ['C:\\Temp\\a.tmp'], refused: [] }] })),
    clean: vi.fn(async (p: any) => ({ ok: true, dry_run: !p.apply, shred: p.shred ?? 0, unknown_ids: [], total: totals, targets: [] })),
    browsers: vi.fn(async () => ({ ok: true, dry_run: true, databases: [], total: { count: 0, bytes: 0, reclaimable: 0, saved: 0, in_use: 0 } })),
    regScan: vi.fn(async () => ({ ok: true, findings: [] })),
    regClean: vi.fn(),
    listBackups: vi.fn(async () => ({ ok: true, dir: 'C:\\b', backups: [] })),
    restoreBackup: vi.fn(), openBackups: vi.fn(), updateDefinitions: vi.fn(), removeDefinitions: vi.fn()
  }
  ;(window as any).darkhub = { cleaner: api }
  return api
}

describe('Cleaner page', () => {
  beforeEach(() => {
    cleanup()
    const store = new Map<string, string>([['darkhub.lang', 'pt-BR']])
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, String(v)), removeItem: (k: string) => store.delete(k), clear: () => store.clear() })
  })

  it('built-ins are preselected, winapp2 items are not; cleaning needs analysis, then ticking the confirmation', async () => {
    const api = mockApi()
    render(<I18nProvider><Cleaner /></I18nProvider>)
    const builtin = await screen.findByRole('checkbox', { name: 'Temporários do usuário' }) as HTMLInputElement
    expect(builtin.checked).toBe(true)
    expect((screen.getByRole('checkbox', { name: 'Foo' }) as HTMLInputElement).checked).toBe(false)

    const cleanBtn = screen.getByRole('button', { name: /Limpar/ })
    expect((cleanBtn as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: /Analisar/ }))
    await waitFor(() => expect((screen.getByRole('button', { name: /Limpar/ }) as HTMLButtonElement).disabled).toBe(false))
    expect(api.scan).toHaveBeenCalledWith({ ids: ['dh:user-temp'] })
    expect(api.clean).not.toHaveBeenCalled()

    // changing the selection invalidates the analysis
    fireEvent.click(screen.getByRole('checkbox', { name: 'Foo' }))
    expect((screen.getByRole('button', { name: /Limpar/ }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Foo' }))
    expect((screen.getByRole('button', { name: /Limpar/ }) as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /Limpar/ }))
    const dialog = await screen.findByRole('dialog')
    const go = screen.getByRole('button', { name: /Apagar agora/ }) as HTMLButtonElement
    expect(go.disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: /Revisei a lista/ }))
    expect(go.disabled).toBe(false)
    fireEvent.click(go)
    await waitFor(() => expect(api.clean).toHaveBeenCalledWith({ ids: ['dh:user-temp'], apply: true, confirm: true, shred: 0 }))
    await waitFor(() => expect(dialog.isConnected).toBe(false))
    expect(await screen.findByRole('status')).toBeTruthy()
  })
})
