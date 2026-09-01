import React, { useState, useEffect } from 'react'
import { Play, Settings, MoreVertical, Clock } from 'lucide-react'
import { Game } from './types'
import { useI18n } from '../../i18n/I18nProvider'

interface GameCardProps {
  game: Game
  selectedProfileId: string
  launchingId: string | null
  onLaunch: () => void
  onEdit: () => void
}

export function GameCard({
  game,
  launchingId,
  onLaunch,
  onEdit
}: GameCardProps) {
  const { t } = useI18n()
  const isLaunching = launchingId === game.id

  const [coverUrl, setCoverUrl] = useState<string | null>(game.coverPath || null)
  const [imageError, setImageError] = useState(false)

  useEffect(() => {
    let mounted = true
    const fetchCover = async () => {
      if (game.coverPath || !window.darkhub?.library) return
      try {
        const res = await window.darkhub.library.fetchCover({ gameName: game.name })
        if (res?.ok && res?.path && mounted) {
          setCoverUrl(res.path)

          window.darkhub.library.upsert({ game: { ...game, coverPath: res.path } }).catch(() => {})
        } else if (mounted) {
          setImageError(true)
        }
      } catch {
        if (mounted) setImageError(true)
      }
    }
    fetchCover()
    return () => { mounted = false }
  }, [game.name, game.coverPath])

  const formatTime = (seconds: number) => {
    if (!seconds) return null
    if (seconds < 3600) return `${Math.ceil(seconds / 60)} ${t('library.time.min', 'min')}`
    return `${(seconds / 3600).toFixed(1)} ${t('library.time.hrs', 'hrs')}`
  }

  const playtimeText = formatTime(game.playtimeSeconds ?? 0)

  return (
    <div
      className="group relative aspect-[2/3] w-full rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 transition-all hover:scale-[1.02] hover:shadow-2xl hover:shadow-indigo-500/20 hover:border-indigo-500/50 flex flex-col"
    >
      {}
      <div className="absolute inset-0 w-full h-full">
        {coverUrl && !imageError ? (
          <img
            src={coverUrl}
            alt={game.name}
            onError={() => setImageError(true)}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-950 p-4 text-center">
            <span className="text-xl font-black text-zinc-600 uppercase tracking-widest break-words w-full opacity-30 group-hover:opacity-60 transition-opacity">
              {game.name}
            </span>
          </div>
        )}
      </div>

      {}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />

      {}
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 backdrop-blur-sm transition-all duration-300 flex flex-col items-center justify-center p-4">
        <button
          onClick={onLaunch}
          disabled={isLaunching}
          className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.3)] transition-all transform hover:scale-110 disabled:opacity-50 disabled:hover:scale-100"
        >
          <Play size={28} className="ml-1" fill="currentColor" />
        </button>

        {isLaunching && (
          <div className="mt-4 text-xs font-bold text-emerald-400 animate-pulse uppercase tracking-wider">
            {t('library.launching', 'Iniciando...')}
          </div>
        )}
      </div>

      {}
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        className="absolute top-3 right-3 p-2 bg-black/50 hover:bg-black/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all hover:scale-110 backdrop-blur-md"
      >
        <Settings size={16} />
      </button>

      {}
      {game.optiscaler?.enabled && (
        <div className="absolute top-3 left-3 px-2 py-1 bg-indigo-600/80 backdrop-blur-md rounded text-[10px] font-bold text-white uppercase tracking-wider shadow-lg">
          DLSS
        </div>
      )}

      {}
      <div className="absolute bottom-0 left-0 w-full p-4 flex flex-col gap-1 pointer-events-none">
        <h3 className="text-white font-bold text-sm leading-tight drop-shadow-md line-clamp-2">
          {game.name}
        </h3>
        {playtimeText && (
          <div className="flex items-center gap-1.5 text-zinc-300 text-xs font-medium">
            <Clock size={12} className="text-indigo-400" />
            <span>{playtimeText}</span>
          </div>
        )}
      </div>
    </div>
  )
}
