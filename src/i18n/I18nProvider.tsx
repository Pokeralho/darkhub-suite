import React, { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react'
import type { SupportedLang } from './messages'
import { messages, availableLanguages } from './messages'

type I18nContextValue = {
  lang: string
  setLang: (lang: string) => void
  t: (key: string, defaultValue?: string) => string
  languages: typeof availableLanguages
  importCustomTranslation: (langCode: string, langLabel: string, dict: Record<string, string>) => boolean
  customLanguages: Array<{ code: string; label: string }>
}

const I18nContext = createContext<I18nContextValue | null>(null)

function readInitialLang(): string {
  try {
    const raw = globalThis.localStorage?.getItem('darkhub.lang')
    if (raw) return raw
  } catch {}
  return 'en-US'
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<string>(readInitialLang)
  const [customTranslations, setCustomTranslations] = useState<Record<string, { label: string; dict: Record<string, string> }>>({})

  useEffect(() => {
    try {
      const stored = globalThis.localStorage?.getItem('darkhub.custom_translations')
      if (stored) {
        setCustomTranslations(JSON.parse(stored))
      }
    } catch {}
  }, [])

  const setLang = useCallback((next: string) => {
    setLangState(next)
    try {
      globalThis.localStorage?.setItem('darkhub.lang', next)
    } catch {}
  }, [])

  const importCustomTranslation = useCallback((langCode: string, langLabel: string, dict: Record<string, string>) => {
    try {
      const updated = {
        ...customTranslations,
        [langCode]: { label: langLabel, dict }
      }
      setCustomTranslations(updated)
      globalThis.localStorage?.setItem('darkhub.custom_translations', JSON.stringify(updated))
      setLang(langCode)
      return true
    } catch {
      return false
    }
  }, [customTranslations, setLang])

  const t = useCallback(
    (key: string, defaultValue?: string) => {

      if (customTranslations[lang]?.dict?.[key]) {
        return customTranslations[lang].dict[key]
      }

      const builtIn = (messages as any)[lang]
      if (builtIn && builtIn[key]) {
        return builtIn[key]
      }

      return messages['en-US']?.[key] ?? messages['pt-BR']?.[key] ?? defaultValue ?? key
    },
    [lang, customTranslations]
  )

  const customLanguages = useMemo(() => {
    return Object.entries(customTranslations).map(([code, val]) => ({
      code,
      label: val.label || code
    }))
  }, [customTranslations])

  const value = useMemo(() => ({
    lang,
    setLang,
    t,
    languages: availableLanguages,
    importCustomTranslation,
    customLanguages
  }), [lang, setLang, t, importCustomTranslation, customLanguages])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
