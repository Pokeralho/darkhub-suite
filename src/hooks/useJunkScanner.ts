import { useI18n } from '../i18n/I18nProvider';
import { useState, useEffect } from 'react'

const STORAGE_KEY = 'darkhub.dashboard.junkEstimate'
const TTL_MS = 30 * 60 * 1000

interface CachedJunk {
  bytes: number
  ok: boolean
  truncated?: boolean
  cachedAt: number
}

function loadCached(): CachedJunk | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: CachedJunk = JSON.parse(raw)
    if (!parsed?.ok || typeof parsed.bytes !== 'number') return null
    if (Date.now() - parsed.cachedAt > TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

function saveCache(data: Omit<CachedJunk, 'cachedAt'>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, cachedAt: Date.now() }))
  } catch {}
}

export const useJunkScanner = () => {
  const { t } = useI18n();
  const [junk, setJunk] = useState<any>(() => loadCached())
  const [loading, setLoading] = useState(() => loadCached() === null)

  useEffect(() => {
    let alive = true

    const fetchJunk = async (forceFetch = false) => {
      if (!window.darkhub) return

      if (!forceFetch) {
        const cached = loadCached()
        if (cached) {
          if (alive) {
            setJunk(cached)
            setLoading(false)
          }
          return
        }
      }

      try {
        const res = await window.darkhub.system.getJunkEstimate({ timeoutMs: 900, cacheTtlMs: 60_000 })
        if (!alive) return
        if (res?.ok && typeof res?.bytes === 'number') {
          saveCache({ bytes: res.bytes, ok: true, truncated: res.truncated })
        }
        setJunk(res)
      } catch (e) {
        if (!alive) return
        setJunk(null)
        if (process.env.NODE_ENV === 'development') {
          console.warn('[Dashboard] Falha ao buscar Lixo Residual:', e)
        }
      } finally {
        if (alive) setLoading(false)
      }
    }

    const start = window.setTimeout(() => fetchJunk(false), 900)

    const interval = window.setInterval(() => fetchJunk(true), 45_000)

    return () => {
      alive = false
      window.clearTimeout(start)
      window.clearInterval(interval)
    }
  }, [])

  return { junk, loading }
}
