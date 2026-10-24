import React, { useEffect, useMemo, useState } from 'react'
import { Plus, Gamepad2, Search, RefreshCw, Loader2, AlertCircle } from '../components/icons'
import PageHeader from '../components/ui/PageHeader'
import { useI18n } from '../i18n/I18nProvider'
import { HelpTip } from '../components/HelpTip'
import { Game, defaultGame, defaultProfile } from '../components/library/types'
import { GameCard } from '../components/library/GameCard'
import { GameEditorModal } from '../components/library/GameEditorModal'
import { GameDiscoveryModal } from '../components/library/GameDiscoveryModal'

export default function Library() {
  const { t } = useI18n()
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [editing, setEditing] = useState<Game | null>(null)

  const [launchingId, setLaunchingId] = useState<string | null>(null)

  const [query, setQuery] = useState('')

  const [discovering, setDiscovering] = useState(false)
  const [discovered, setDiscovered] = useState<any[] | null>(null)
  const [selectedDiscovered, setSelectedDiscovered] = useState<Record<number, boolean>>({})

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return games
    return games.filter((g) => (g.name || g.exePath).toLowerCase().includes(q))
  }, [games, query])

  const refresh = async () => {
    if (!window.darkhub?.library) return
    setLoading(true)
    setError(null)
    try {
      const res = await window.darkhub.library.list()
      if (res?.ok && Array.isArray(res.games)) setGames(res.games)
      else setError(res?.error ?? t('library.error.load', 'Falha ao carregar biblioteca.'))
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {

    refresh()

    const unsub = window.darkhub?.library?.onUpdated?.((data: any) => {
      if (Array.isArray(data?.games)) {
        setGames(data.games)
      }
    })

    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [])

  const discoverGames = async () => {
    setDiscovering(true)
    setDiscovered(null)
    setSelectedDiscovered({})
    try {
      const res = await window.darkhub?.library?.discover?.()
      if (res?.ok && Array.isArray(res.discovered)) {
        setDiscovered(res.discovered)
        const sel: Record<number, boolean> = {}
        res.discovered.forEach((_: any, i: number) => { sel[i] = true })
        setSelectedDiscovered(sel)
      }
    } catch (e: any) {
      setError(e?.message ?? t('library.error.discover', 'Erro ao descobrir jogos.'))
    } finally {
      setDiscovering(false)
    }
  }

  const importDiscovered = async () => {
    if (!discovered) return
    const toImport = discovered.filter((_, i) => selectedDiscovered[i])
    const gamesToUpsert = toImport.map(g => ({
      ...defaultGame(),
      id: '',
      name: g.name,
      exePath: g.exePath,
      workingDir: g.workingDir
    }))
    try {
      if (window.darkhub?.library?.upsertBulk) {
        const res = await window.darkhub.library.upsertBulk({ games: gamesToUpsert })
        if (!res?.ok) setError(res?.error ?? t('library.error.save', 'Falha ao salvar.'))
      } else {
        for (const game of gamesToUpsert) {
          await window.darkhub?.library?.upsert?.({ game })
        }
      }
    } catch (e: any) {
      setError(e?.message ?? String(e))
    }
    await refresh()
    setDiscovered(null)
  }

  const startEdit = (g: Game) => {
    const profiles = Array.isArray(g.profiles) && g.profiles.length ? g.profiles : [defaultProfile()]
    const defaultProfileId = typeof g.defaultProfileId === 'string' && g.defaultProfileId ? g.defaultProfileId : profiles[0]?.id
    setEditing({
      ...defaultGame(),
      ...g,
      profiles: profiles.map((p: any) => ({ ...defaultProfile(), ...p, tweaks: { ...defaultProfile().tweaks, ...(p?.tweaks ?? {}) } })),
      defaultProfileId
    })
  }

  const saveEditing = async (g: Game) => {
    if (!window.darkhub?.library) return
    setError(null)
    if (!g.name.trim()) {
      setError(t('library.error.nameReq', 'Nome é obrigatório.'))
      return
    }
    if (!g.exePath.trim()) {
      setError(t('library.error.exeReq', 'Executável é obrigatório.'))
      return
    }
    try {
      const res = await window.darkhub.library.upsert({ game: g })
      if (res?.ok && Array.isArray(res?.games)) {
        setGames(res.games)
        setEditing(null)
      } else {
        setError(res?.error ?? t('library.error.save', 'Falha ao salvar.'))
      }
    } catch (e: any) {
      setError(e?.message ?? String(e))
    }
  }

  const removeGame = async (id: string) => {
    if (!window.darkhub?.library) return
    setError(null)
    try {
      const res = await window.darkhub.library.remove({ id })
      if (res?.ok && Array.isArray(res?.games)) {
        setGames(res.games)
        setEditing(null)
      }
      else setError(res?.error ?? t('library.error.remove', 'Falha ao remover.'))
    } catch (e: any) {
      setError(e?.message ?? String(e))
    }
  }

  const launch = async (g: Game) => {
    if (!window.darkhub?.latency) return
    setLaunchingId(g.id)
    setError(null)
    setNotice(null)
    try {
      if (g.optiscaler?.enabled && g.optiscaler?.applyOnLaunch && window.darkhub?.optiscaler) {
        const opti = await window.darkhub.optiscaler.apply({
          game: g,
          ...g.optiscaler,
          onlyIfNeeded: true,
          applyOnLaunch: true
        })
        if (!opti?.ok) {
          setError(opti?.error ?? t('library.error.optiscaler', 'Falha ao aplicar OptiScaler antes de iniciar.'))
          setLaunchingId(null)
          return
        }
      }

      const profiles = Array.isArray(g.profiles) ? g.profiles : []
      const profile = profiles.find((p: any) => p.id === g.defaultProfileId) ?? profiles[0] ?? defaultProfile()
      const res = await window.darkhub.latency.launchGameWithProfile({
        gameId: g.id,
        gameName: g.name,
        exePath: g.exePath,
        args: g.args ?? '',
        workingDir: g.workingDir ?? '',
        profile
      })
      if (!res?.ok) setError(res?.error ?? t('library.error.launch', 'Falha ao iniciar jogo.'))
      else if (res.applyError) setError(`${t('library.apply.failed', 'O jogo abriu, mas as otimizações falharam')}: ${res.applyError}`)
      else if (res.applied) {
        const items = Object.entries(res.applied as Record<string, { status: string; error?: string }>)
        const ok = items.filter(([, v]) => v.status === 'ok').length
        const failed = items.filter(([, v]) => v.status === 'failed')
        setNotice(t('library.apply.done', '{name}: {ok} otimizações aplicadas{failed}')
          .replace('{name}', g.name).replace('{ok}', String(ok))
          .replace('{failed}', failed.length ? ` · ${t('library.apply.failedN', '{n} falharam').replace('{n}', String(failed.length))} (${failed.map(([k]) => k).join(', ')})` : ''))
      }
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setLaunchingId(null)
    }
  }

  // The modal owns the game being edited: pickers return a patch that the modal merges into its own copy.
  const pickExeForEditor = async (current: Game): Promise<Partial<Game> | null> => {
    if (!window.darkhub?.dialog) return null
    const res = await window.darkhub.dialog.selectFiles({
      title: t('library.dialog.exe', 'Selecione o executável do jogo'),
      filters: [{ name: 'Executável', extensions: ['exe'] }]
    })
    if (res?.canceled || !res?.filePaths?.[0]) return null
    const path = res.filePaths[0]
    const name = current.name || path.split(/[\\/]/).pop()?.replace(/\.exe$/i, '') || ''
    const workingDir = current.workingDir || path.split(/[\\/]/).slice(0, -1).join('\\')
    return { exePath: path, name, workingDir }
  }

  const pickWorkingDirForEditor = async (): Promise<Partial<Game> | null> => {
    if (!window.darkhub?.dialog) return null
    const res = await window.darkhub.dialog.selectFolder({ title: t('library.dialog.dir', 'Selecione a pasta de trabalho (opcional)') })
    return !res?.canceled && res?.folderPath ? { workingDir: res.folderPath } : null
  }

  const showSkeleton = loading && games.length === 0
  const libraryEmpty = !loading && games.length === 0
  const noMatch = games.length > 0 && filtered.length === 0

  return (
    <div className="w-full">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            {t('library.title', 'Biblioteca')}
            <HelpTip
              title={t('library.help.title', 'Biblioteca de Jogos')}
              description={t('library.help.desc', 'O Game Launcher oficial do DarkHub. Artes, horas jogadas e injetores em um só lugar.')}
              sections={[
                { title: t('library.help.sec1Title', 'Grid Interativa'), content: t('library.help.sec1Desc', 'Suas capas são baixadas automaticamente. Passe o mouse sobre os jogos para revelar o painel de opções.') },
                { title: t('library.help.sec2Title', 'Tempos'), content: t('library.help.sec2Desc', 'Suas partidas são cronometradas e salvas para compor as estatísticas da sua conta.') }
              ]}
              buttonLabel={t('help.button')}
            />
          </span>
        }
        subtitle={t('library.subtitle', 'Explore, jogue e acompanhe suas horas nos seus títulos favoritos.')}
        actions={<>
          <button type="button" onClick={() => setEditing(defaultGame())} className="dh-btn">
            <Plus size={14} />
            <span>{t('library.btn.add', 'Adicionar Jogo')}</span>
          </button>
          <button type="button" onClick={discoverGames} disabled={discovering} className={libraryEmpty ? 'dh-btn' : 'dh-btn dh-btn-primary'}>
            {discovering ? <Loader2 size={14} className="animate-spin" /> : <Gamepad2 size={14} />}
            <span>{discovering ? t('library.btn.discovering', 'Procurando...') : t('library.btn.discover', 'Descobrir Jogos')}</span>
          </button>
        </>}
      >
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('library.search.placeholder', 'Procurar jogo na biblioteca...')}
              className="dh-input w-full pl-8"
              aria-label={t('library.search.placeholder', 'Procurar jogo na biblioteca...')}
            />
          </div>
          {games.length > 0 && (
            <span className="font-mono text-[11.5px] text-zinc-500 tabular-nums shrink-0 px-1">
              {filtered.length}<span className="text-zinc-700"> / </span>{games.length}
            </span>
          )}
          <button type="button" onClick={refresh} disabled={loading} className="dh-btn dh-btn-ghost shrink-0">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? t('library.btn.loading', 'Sincronizando...') : t('library.btn.refresh', 'Atualizar')}
          </button>
        </div>
      </PageHeader>

      {notice && !error && (
        <div role="status" className="mb-5 flex items-start justify-between gap-3 text-[12.5px] text-emerald-300">
          <span className="break-words">{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="dh-btn dh-btn-ghost dh-btn-sm shrink-0">{t('common.close', 'Fechar')}</button>
        </div>
      )}

      {error && (
        <div role="alert" className="mb-5 flex items-start justify-between gap-3 text-[12.5px] text-red-300">
          <span className="flex items-start gap-2 min-w-0">
            <AlertCircle size={14} className="shrink-0 mt-[1px]" />
            <span className="break-words">{error}</span>
          </span>
          <button type="button" onClick={refresh} disabled={loading} className="dh-btn dh-btn-ghost dh-btn-sm shrink-0">
            {t('library.btn.refresh', 'Atualizar')}
          </button>
        </div>
      )}

      {showSkeleton ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4" aria-busy="true">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i}>
              <div className="aspect-[2/3] rounded-xl bg-zinc-900 animate-pulse" />
              <div className="mt-2.5 h-3 w-3/4 rounded bg-zinc-900 animate-pulse" />
              <div className="mt-1.5 h-2.5 w-1/3 rounded bg-zinc-900 animate-pulse" />
            </div>
          ))}
        </div>
      ) : filtered.length ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-x-4 gap-y-5 pb-16">
          {filtered.map((g) => (
            <GameCard
              key={g.id}
              game={g}
              selectedProfileId={g.defaultProfileId || g.profiles?.[0]?.id || ''}
              launchingId={launchingId}
              onLaunch={() => launch(g)}
              onEdit={() => startEdit(g)}
            />
          ))}
        </div>
      ) : noMatch ? (
        <div className="py-16 flex flex-col items-center text-center gap-3">
          <p className="text-[13px] text-zinc-400">
            {t('library.empty.noMatch', 'Nenhum jogo corresponde a')} <span className="font-mono text-zinc-200">"{query.trim()}"</span>
          </p>
          <button type="button" onClick={() => setQuery('')} className="dh-btn dh-btn-sm">
            {t('library.search.clear', 'Limpar busca')}
          </button>
        </div>
      ) : libraryEmpty ? (
        <div className="py-16 flex flex-col items-center text-center rounded-xl border border-dashed border-zinc-800">
          <Gamepad2 size={20} className="text-zinc-600" />
          <h2 className="mt-3 dh-section-title">{t('library.empty.title', 'Nenhum jogo encontrado')}</h2>
          <p className="mt-1 dh-help max-w-[60ch]">
            {t('library.empty.desc', 'Adicione seus jogos clicando em "Adicionar Jogo" para iniciar a construção do seu launcher, ou descubra instalações automáticas das principais lojas.')}
          </p>
          <div className="mt-5 flex items-center gap-2">
            <button type="button" onClick={discoverGames} disabled={discovering} className="dh-btn dh-btn-primary">
              {discovering ? <Loader2 size={14} className="animate-spin" /> : <Gamepad2 size={14} />}
              {discovering ? t('library.btn.discovering', 'Procurando...') : t('library.btn.discover', 'Descobrir Jogos')}
            </button>
            <button type="button" onClick={() => setEditing(defaultGame())} className="dh-btn">
              <Plus size={14} />
              {t('library.btn.add', 'Adicionar Jogo')}
            </button>
          </div>
        </div>
      ) : null}

      {editing && (
        <GameEditorModal
          game={editing}
          onSave={saveEditing}
          error={error}
          onCancel={() => { setEditing(null); setError(null) }}
          onPickExe={pickExeForEditor}
          onPickWorkingDir={pickWorkingDirForEditor}
          onRemove={() => removeGame(editing.id)}
        />
      )}

      {discovered !== null && (
        <GameDiscoveryModal
          discovered={discovered}
          selectedDiscovered={selectedDiscovered}
          onToggleSelection={(i, selected) => setSelectedDiscovered(prev => ({ ...prev, [i]: selected }))}
          onSelectAll={() => {
            const all: Record<number, boolean> = {}
            discovered.forEach((_, i) => { all[i] = true })
            setSelectedDiscovered(all)
          }}
          onCancel={() => setDiscovered(null)}
          onImport={importDiscovered}
        />
      )}
    </div>
  )
}
