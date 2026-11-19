import React, { createContext, useCallback, useContext, useMemo, useState, useEffect, useSyncExternalStore } from 'react'
import { availableLanguages, shippedLanguages } from './languages'
import { getDictionary, getVersion, loadLocale, subscribe } from './store'

type I18nContextValue = {
  lang: string
  setLang: (lang: string) => void
  t: (key: string, defaultValue?: string) => string
  languages: typeof availableLanguages
  importCustomTranslation: (langCode: string, langLabel: string, dict: Record<string, string>) => boolean
  customLanguages: Array<{ code: string; label: string }>
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function readInitialLang(): string {
  try {
    const raw = globalThis.localStorage?.getItem('darkhub.lang')
    if (raw) return raw
  } catch {}
  return 'en-US'
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<string>(readInitialLang)
  // Re-render when a dictionary chunk lands (language switch, a lazy screen's strings).
  const dictVersion = useSyncExternalStore(subscribe, getVersion, getVersion)

  // main.tsx loads the initial language before the first render; this covers anything else (tests, retries).
  useEffect(() => {
    loadLocale(lang).catch(() => {})
  }, [lang])
  const [customTranslations, setCustomTranslations] = useState<Record<string, { label: string; dict: Record<string, string> }>>({})

  useEffect(() => {
    try {
      const stored = globalThis.localStorage?.getItem('darkhub.custom_translations')
      if (stored) {
        setCustomTranslations(JSON.parse(stored))
      }
    } catch {}
  }, [])

  // Keep <html lang> in sync so screen readers / spell-check use the UI language.
  useEffect(() => {
    try {
      document.documentElement.lang = lang
    } catch {}
  }, [lang])

  const setLang = useCallback((next: string) => {
    try {
      globalThis.localStorage?.setItem('darkhub.lang', next)
    } catch {}
    // Switch once the new dictionaries are in, so the UI never flashes untranslated keys.
    loadLocale(next)
      .catch(() => {})
      .finally(() => setLangState(next))
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

      const builtIn = getDictionary(lang)
      if (builtIn && builtIn[key]) {
        return builtIn[key]
      }

      // Inline defaults are written in pt-BR, so a pt-BR user gets them before the en-US dictionary.
      if (lang === 'pt-BR' && defaultValue) return defaultValue

      return getDictionary('en-US')?.[key] ?? getDictionary('pt-BR')?.[key] ?? defaultValue ?? key
    },
    // dictVersion: a new chunk changes what t() returns
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang, customTranslations, dictVersion]
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
    // Only offer languages that actually ship a dictionary (others fall back silently to English)
    languages: availableLanguages.filter((l) => shippedLanguages.includes(l.code)),
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
