import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The real startup path (no test seeding): one language at boot, lazy screen namespaces, then a live switch.
describe('i18n store: live language switch with lazy namespaces', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('MODE', 'production')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('loads the new language for every namespace a screen already requested', async () => {
    const store = await import('../src/i18n/store')
    await store.loadLocale('pt-BR')
    for (const ns of ['ssh', 'psTools', 'recovery'] as const) await store.withNamespace(ns, async () => ({}))()
    expect(store.getDictionary('pt-BR')?.['rescue.needAdmin']).toMatch(/administrador/)

    await store.loadLocale('en-US')
    const en = store.getDictionary('en-US') ?? {}
    expect(en['rescue.needAdmin']).toMatch(/administrator/)
    expect(Object.keys(en).some((k) => k.startsWith('psx.'))).toBe(true)
    expect(Object.keys(en).some((k) => k.startsWith('ssh.'))).toBe(true)
  })

  it('keeps the eager strings (sidebar labels, rescue.err.*) once a screen namespace is in', async () => {
    const store = await import('../src/i18n/store')
    await store.loadLocale('en-US')
    for (const ns of ['ssh', 'psTools', 'recovery'] as const) await store.withNamespace(ns, async () => ({}))()
    const en = store.getDictionary('en-US') ?? {}
    expect(en['nav.ssh']).toBe('DarkHub SSH')
    expect(en['nav.diskrescue']).toBeTruthy()
    expect(en['rescue.err.same_disk']).toMatch(/ANOTHER disk/)
    expect(en['rescue.needAdmin']).toMatch(/administrator/)
  })
})
