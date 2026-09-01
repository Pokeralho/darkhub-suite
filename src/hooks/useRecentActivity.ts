import { useI18n } from '../i18n/I18nProvider';
import { useState, useEffect, useCallback } from 'react'

export type ActivityType =
  | 'gameStarted'
  | 'gameStopped'
  | 'gameUpdated'
  | 'optimization'
  | 'security'
  | 'junkClean'
  | 'benchmark'
  | 'system'

export interface ActivityEntry {
  id: string
  type: ActivityType
  label: string
  sublabel?: string
  timestamp: number
}

const STORAGE_KEY = 'darkhub.dashboard.recentActivity'
const MAX_ENTRIES = 20

function loadPersisted(): ActivityEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, MAX_ENTRIES)
  } catch {
    return []
  }
}

function persist(entries: ActivityEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)))
  } catch {}
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`
  return `${(seconds / 3600).toFixed(1)}h`
}

let idCounter = 0
function makeId() {
  return `act_${Date.now()}_${++idCounter}`
}

export function useRecentActivity() {
  const [activities, setActivities] = useState<ActivityEntry[]>(loadPersisted)

  const push = useCallback((entry: Omit<ActivityEntry, 'id'>) => {
    setActivities(prev => {
      const next = [{ ...entry, id: makeId() }, ...prev].slice(0, MAX_ENTRIES)
      persist(next)
      return next
    })
  }, [])

  useEffect(() => {
    if (!window.darkhub?.library) return

    const unsubStarted = window.darkhub.library.onGameStarted?.((data: any) => {
      push({
        type: 'gameStarted',
        label: data?.gameName ?? 'Jogo',
        sublabel: 'Iniciado',
        timestamp: data?.timestamp ?? Date.now()
      })
    })

    const unsubStopped = window.darkhub.library.onGameStopped?.((data: any) => {
      const dur = typeof data?.durationSeconds === 'number' ? formatDuration(data.durationSeconds) : null
      push({
        type: 'gameStopped',
        label: data?.gameName ?? 'Jogo',
        sublabel: dur ? `Sessão de ${dur}` : 'Encerrado',
        timestamp: data?.timestamp ?? Date.now()
      })
    })

    const unsubActivity = window.darkhub.library.onActivityLogged?.((data: any) => {
      if (data?.type === 'gameStarted' || data?.type === 'gameStopped') return
      push({
        type: (data?.type as ActivityType) ?? 'system',
        label: data?.label ?? data?.gameName ?? 'Atividade',
        sublabel: data?.sublabel,
        timestamp: data?.timestamp ?? Date.now()
      })
    })

    return () => {
      if (typeof unsubStarted === 'function') unsubStarted()
      if (typeof unsubStopped === 'function') unsubStopped()
      if (typeof unsubActivity === 'function') unsubActivity()
    }
  }, [push])

  const clear = useCallback(() => {
    setActivities([])
    persist([])
  }, [])

  return { activities, push, clear }
}
