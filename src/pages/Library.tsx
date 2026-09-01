import React, { useEffect, useMemo, useState } from 'react'
import { Plus, Gamepad2 } from 'lucide-react'
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
        await window.darkhub.library.upsertBulk({ games: gamesToUpsert })
      } else {
        for (const game of gamesToUpsert) {
          await window.darkhub?.library?.upsert?.({ game })
        }
      }
    } catch {}
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
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setLaunchingId(null)
    }
  }

  const pickExeForEditor = async () => {
    if (!window.darkhub?.dialog || !editing) return
    const res = await window.darkhub.dialog.selectFiles({
      title: t('library.dialog.exe', 'Selecione o executável do jogo'),
      filters: [{ name: 'Executável', extensions: ['exe'] }]
    })
    if (!res?.canceled && res?.filePaths?.[0]) {
      const path = res.filePaths[0]
      const name = editing.name || path.split(/[\\/]/).pop()?.replace(/\.exe$/i, '') || ''
      const workingDir = editing.workingDir || path.split(/[\\/]/).slice(0, -1).join('\\')
      setEditing({ ...editing, exePath: path, name, workingDir })
    }
  }

  const pickWorkingDirForEditor = async () => {
    if (!window.darkhub?.dialog || !editing) return
    const res = await window.darkhub.dialog.selectFolder({ title: t('library.dialog.dir', 'Selecione a pasta de trabalho (opcional)') })
    if (!res?.canceled && res?.folderPath) {
      setEditing({ ...editing, workingDir: res.folderPath })
    }
  }

  return (
    <div className="space-y-6 w-full">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-white">{t('library.title', 'Biblioteca')}</h1>
            <HelpTip
              title={t('library.help.title', 'Biblioteca de Jogos')}
              description={t('library.help.desc', 'O Game Launcher oficial do DarkHub. Artes, horas jogadas e injetores em um só lugar.')}
              sections={[
                { title: t('library.help.sec1Title', 'Grid Interativa'), content: t('library.help.sec1Desc', 'Suas capas são baixadas automaticamente. Passe o mouse sobre os jogos para revelar o painel de opções.') },
                { title: t('library.help.sec2Title', 'Tempos'), content: t('library.help.sec2Desc', 'Suas partidas são cronometradas e salvas para compor as estatísticas da sua conta.') }
              ]}
              buttonLabel={t('help.button')}
            />
          </div>
          <p className="text-zinc-400">{t('library.subtitle', 'Explore, jogue e acompanhe suas horas nos seus títulos favoritos.')}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={discoverGames}
            disabled={discovering}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center gap-2 font-medium shadow-[0_0_15px_rgba(79,70,229,0.2)]"
          >
            <Gamepad2 size={18} />
            <span>{discovering ? t('library.btn.discovering', 'Procurando...') : t('library.btn.discover', 'Descobrir Jogos')}</span>
          </button>
          <button
            onClick={() => setEditing(defaultGame())}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors flex items-center gap-2 font-medium"
          >
            <Plus size={18} />
            <span>{t('library.btn.add', 'Adicionar Jogo')}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('library.search.placeholder', 'Procurar jogo na biblioteca...')}
          className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-4 py-3 focus:outline-none focus:border-indigo-500 transition-colors"
        />
        <button
          onClick={refresh}
          className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors font-medium whitespace-nowrap"
          disabled={loading}
        >
          {loading ? t('library.btn.loading', 'Sincronizando...') : t('library.btn.refresh', 'Atualizar')}
        </button>
      </div>

      <div className="w-full h-full min-h-[400px]">
        {filtered.length ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 pb-20">
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
        ) : (
          <div className="p-12 h-full text-center text-zinc-500 flex flex-col items-center justify-center border-2 border-dashed border-zinc-800 rounded-2xl">
            <Gamepad2 size={64} className="text-zinc-800 mb-6" />
            <div className="text-2xl font-bold text-zinc-400 mb-2">{t('library.empty.title', 'Nenhum jogo encontrado')}</div>
            <p className="max-w-md text-sm leading-relaxed">
              {t('library.empty.desc', 'Adicione seus jogos clicando em "Adicionar Jogo" para iniciar a construção do seu launcher, ou descubra instalações automáticas das principais lojas.')}
            </p>
          </div>
        )}
      </div>

      {editing && (
        <GameEditorModal
          game={editing}
          onSave={saveEditing}
          onCancel={() => setEditing(null)}
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
