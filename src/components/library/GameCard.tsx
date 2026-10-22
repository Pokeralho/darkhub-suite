import React, { useState, useEffect } from 'react'
import { Play, Settings, Clock, Loader2, DarkHubMark } from '../icons'
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
    if (game.coverPath) {
      // keep the local state in sync when the stored cover changes (edit, refresh)
      setCoverUrl(game.coverPath)
      setImageError(false)
    }
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
    <div className="group relative w-full min-w-0">
      <div className="relative aspect-[2/3] w-full rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800/80 transition-colors duration-200 group-hover:border-zinc-600 group-focus-within:border-zinc-600">
        {coverUrl && !imageError ? (
          <img
            src={coverUrl}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImageError(true)}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col justify-end p-3 bg-zinc-900">
            <DarkHubMark size={72} strokeWidth={0.9} className="absolute right-2 top-2 text-zinc-800" aria-hidden="true" />
            <span className="relative text-[13px] font-medium leading-snug text-zinc-500 line-clamp-3 break-words">{game.name}</span>
          </div>
        )}

        {/* Quiet until hover: scrim + actions */}
        <div className={`absolute inset-0 bg-gradient-to-t from-zinc-950/90 via-zinc-950/30 to-transparent transition-opacity duration-200 ${isLaunching ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`} />

        {game.optiscaler?.enabled && (
          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-zinc-950/75 font-mono text-[10.5px] text-zinc-300">
            dlss
          </span>
        )}

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          aria-label={t('library.editGame', 'Editar jogo')}
          title={t('library.editGame', 'Editar jogo')}
          className="absolute top-2 right-2 h-7 w-7 inline-flex items-center justify-center rounded-md bg-zinc-950/75 text-zinc-300 hover:text-zinc-50 hover:bg-zinc-950 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-150"
        >
          <Settings size={14} />
        </button>

        <div className={`absolute inset-x-2 bottom-2 transition-all duration-200 ease-out ${isLaunching ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0'}`}>
          <button
            type="button"
            onClick={onLaunch}
            disabled={isLaunching}
            className="dh-btn dh-btn-primary w-full"
          >
            {isLaunching ? <Loader2 size={14} className="animate-spin" /> : <Play size={13} />}
            {isLaunching ? t('library.launching', 'Iniciando...') : t('library.play', 'Jogar')}
          </button>
        </div>
      </div>

      <div className="mt-2 px-0.5 min-w-0">
        <h3 className="text-[12.5px] font-medium leading-snug text-zinc-200 truncate" title={game.name}>{game.name}</h3>
        <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-zinc-500">
          <Clock size={11} className="text-zinc-600" />
          <span>{playtimeText ?? '0 ' + t('library.time.min', 'min')}</span>
        </div>
      </div>
    </div>
  )
}
