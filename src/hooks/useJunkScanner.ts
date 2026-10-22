import { useState, useEffect, useRef } from 'react'

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
  const [junk, setJunk] = useState<any>(() => loadCached())
  const [loading, setLoading] = useState(() => loadCached() === null)
  const mountedRef = useRef(true)
  const inFlightRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const fetchJunk = async (forceFetch = false) => {
    if (!window.darkhub) {
      // no preload bridge: never leave the card spinning forever
      setLoading(false)
      return
    }

    if (!forceFetch) {
      const cached = loadCached()
      if (cached) {
        setJunk(cached)
        setLoading(false)
        return
      }
    }

    if (inFlightRef.current) return // repeated refresh clicks would spawn parallel scans
    inFlightRef.current = true
    setLoading(true)
    try {
      const res = await window.darkhub.system.getJunkEstimate({ timeoutMs: 900, cacheTtlMs: 60_000 })
      if (res?.ok && typeof res?.bytes === 'number') {
        saveCache({ bytes: res.bytes, ok: true, truncated: res.truncated })
      }
      if (mountedRef.current) setJunk(res)
    } catch (e) {
      if (mountedRef.current) setJunk(null)
      if (import.meta.env.DEV) {
        console.warn('[Dashboard] Falha ao buscar Lixo Residual:', e)
      }
    } finally {
      inFlightRef.current = false
      if (mountedRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    const cached = loadCached()
    if (!cached) {
      const start = window.setTimeout(() => fetchJunk(false), 900)
      return () => window.clearTimeout(start)
    }
  }, [])

  return { junk, loading, refresh: (force = true) => fetchJunk(force) }
}
