import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import React from 'react'
import { I18nProvider, useI18n } from '../src/i18n/I18nProvider'
import { addStringsForTests } from '../src/i18n/store'

// pt-BR and en-US now ship the same keys: this one exists only in en-US, to exercise the fallback chain.
addStringsForTests('en-US', { 'test.onlyEnglish': 'Only in English' })

// 'hub.title' and 'ovle.padding': the pt-BR inline default matches the pt-BR dictionary.
const tFor = (lang: string) => {
  localStorage.setItem('darkhub.lang', lang)
  const { result } = renderHook(() => useI18n(), { wrapper: ({ children }) => <I18nProvider>{children}</I18nProvider> })
  return result.current.t
}

describe('t() fallback', () => {
  // Node's own localStorage global shadows jsdom's: use an in-memory one
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, String(v)), removeItem: (k: string) => store.delete(k), clear: () => store.clear() })
  })

  it('pt-BR prefers the inline pt-BR default over the en-US dictionary', () => {
    const t = tFor('pt-BR')
    expect(t('hub.title', 'Presets e módulos')).toBe('Presets e módulos')
    expect(t('ovle.padding', 'Espaço interno')).toBe('Espaço interno')
  })

  it('pt-BR still uses its own dictionary first', () => {
    expect(tFor('pt-BR')('nav.presets', 'outro texto')).toBe('Presets e módulos')
  })

  it('pt-BR without an inline default falls back to en-US, then the key', () => {
    const t = tFor('pt-BR')
    expect(t('test.onlyEnglish')).toBe('Only in English')
    expect(t('no.such.key')).toBe('no.such.key')
  })

  it('en-US and other languages keep the en-US dictionary before the inline default', () => {
    expect(tFor('en-US')('hub.title', 'Presets e módulos')).toBe('Presets & modules')
    expect(tFor('es-ES')('hub.title', 'Presets e módulos')).toBe('Presets & modules')
  })
})
