import React, { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Cpu,
  FileSearch,
  FolderOpen,
  Gamepad2,
  HardDriveDownload,
  RefreshCw,
  Rocket,
  Save,
  Settings2,
  ShieldCheck,
  Wand2,
  DownloadCloud,
  RotateCcw,
  Trash2,
  Plus,
  Undo2
} from 'lucide-react'

type OptiScalerConfig = {
  enabled?: boolean
  applyOnLaunch?: boolean
  targetDir?: string
  loader?: string
  upscaler?: string
  inputApi?: string
  includeAgilitySdk?: boolean
  sourceVersion?: string
  lastInstalledAt?: number | null
}

type Game = {
  id: string
  name: string
  exePath: string
  workingDir?: string
  optiscaler?: OptiScalerConfig
}

type SettingsState = {
  applyOnLaunch: boolean
  targetDir: string
  loader: string
  upscaler: string
  inputApi: string
  includeAgilitySdk: boolean
}

type Choice = {
  value: string
  label: string
  hint?: string
}

const DEFAULT_SETTINGS: SettingsState = {
  applyOnLaunch: true,
  targetDir: '',
  loader: 'auto',
  upscaler: 'auto',
  inputApi: 'auto',
  includeAgilitySdk: false
}

const LOADER_OPTIONS: Choice[] = [
  { value: 'auto', label: 'Auto', hint: 'Detecta o melhor loader livre' },
  { value: 'dxgi.dll', label: 'dxgi.dll', hint: 'Padrão recomendado' },
  { value: 'winmm.dll', label: 'winmm.dll', hint: 'Bom para Vulkan, WinGDK e XGP' },
  { value: 'version.dll', label: 'version.dll' },
  { value: 'dbghelp.dll', label: 'dbghelp.dll' },
  { value: 'd3d12.dll', label: 'd3d12.dll', hint: 'Fallback para alguns jogos DX12' },
  { value: 'wininet.dll', label: 'wininet.dll' },
  { value: 'winhttp.dll', label: 'winhttp.dll' },
  { value: 'OptiScaler.asi', label: 'OptiScaler.asi', hint: 'Requer ASI loader externo' }
]

const UPSCALER_OPTIONS: Choice[] = [
  { value: 'auto', label: 'Auto', hint: 'Mantém o INI base' },
  { value: 'fsr22', label: 'FSR 2.2' },
  { value: 'fsr31', label: 'FSR 3.1' },
  { value: 'fsr4', label: 'FSR 4' },
  { value: 'fsr4_rdna3', label: 'FSR 4 RDNA3 exp.', hint: 'Força FSR4 em Radeon RX 7000/RDNA3' },
  { value: 'xess', label: 'XeSS' },
  { value: 'dlss', label: 'DLSS' }
]

const INPUT_OPTIONS: Choice[] = [
  { value: 'auto', label: 'Auto', hint: 'Detecta pelo jogo' },
  { value: 'dlss', label: 'DLSS input' },
  { value: 'fsr', label: 'FSR/FidelityFX input' },
  { value: 'xess', label: 'XeSS input' }
]

function dirnameFromPath(value = '') {
  return value.split(/[\\/]/).slice(0, -1).join('\\')
}

function basename(value = '') {
  return value.split(/[\\/]/).pop() || value
}

function derivedTargetDir(game?: Game | null, exePath = '') {
  if (game?.optiscaler?.targetDir) return game.optiscaler.targetDir
  if (game?.workingDir) return game.workingDir
  return dirnameFromPath(exePath || game?.exePath || '')
}

function formatDate(value?: number | null) {
  if (!value) return 'Nunca'
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(value)
  } catch {
    return String(value)
  }
}

function choiceLabel(options: Choice[], value?: string) {
  return options.find((x) => x.value.toLowerCase() === String(value ?? '').toLowerCase())?.label ?? value ?? 'Auto'
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${
        ok ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-zinc-700 bg-zinc-950 text-zinc-400'
      }`}
    >
      {ok ? <CheckCircle2 size={13} /> : <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />}
      {label}
    </span>
  )
}

function SelectControl({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: string
  options: Choice[]
  onChange: (value: string) => void
}) {
  const current = options.find((x) => x.value === value)
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-200 outline-none transition-colors focus:border-blue-500"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {current?.hint ? <div className="mt-1 text-xs text-zinc-500">{current.hint}</div> : null}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-zinc-800 py-2 last:border-b-0">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="min-w-0 text-right text-sm text-zinc-200">{value}</span>
    </div>
  )
}

export default function OptiScalerManager() {
  const { t } = useI18n();
  const [games, setGames] = useState<Game[]>([])
  const [selectedGameId, setSelectedGameId] = useState('')
  const [exePath, setExePath] = useState('')
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS)
  const [analysis, setAnalysis] = useState<any>(null)
  const [backups, setBackups] = useState<any[]>([])
  const [loadingGames, setLoadingGames] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [silentAnalyzing, setSilentAnalyzing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null)

  const [restoring, setRestoring] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [creatingBackup, setCreatingBackup] = useState(false)

  const [updaterStatus, setUpdaterStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [updatingOptiScaler, setUpdatingOptiScaler] = useState(false)

  const selectedGame = useMemo(() => games.find((g) => g.id === selectedGameId) || null, [games, selectedGameId])
  const targetDir = settings.targetDir.trim() || derivedTargetDir(selectedGame, exePath)

  const makePayload = () => {
    const inferredTarget = derivedTargetDir(selectedGame, exePath)
    const explicitTargetDir = settings.targetDir.trim() && settings.targetDir.trim() !== inferredTarget ? settings.targetDir.trim() : undefined
    const workingDir = selectedGame?.workingDir || dirnameFromPath(exePath)
    const game = selectedGame
      ? {
          ...selectedGame,
          exePath: exePath || selectedGame.exePath,
          workingDir
        }
      : undefined

    return {
      game,
      gameId: selectedGame?.id,
      exePath: exePath || selectedGame?.exePath,
      workingDir,
      targetDir: explicitTargetDir,
      loader: settings.loader,
      upscaler: settings.upscaler,
      inputApi: settings.inputApi,
      applyOnLaunch: settings.applyOnLaunch,
      includeAgilitySdk: settings.includeAgilitySdk
    }
  }

  const loadBackups = async (payload = makePayload()) => {
    if (!window.darkhub?.optiscaler) return
    try {
      const res = await window.darkhub.optiscaler.listBackups(payload)
      setBackups(res?.ok && Array.isArray(res.backups) ? res.backups : [])
    } catch {
      setBackups([])
    }
  }

  const runAnalyze = async (silent = false) => {
    if (!window.darkhub?.optiscaler) return
    if (!exePath && !selectedGame?.exePath) {
      if (!silent) setStatus({ ok: false, message: 'Selecione um jogo da Biblioteca ou um executavel.' })
      return
    }
    if (silent) setSilentAnalyzing(true)
    else {
      setAnalyzing(true)
      setStatus(null)
    }
    try {
      const payload = makePayload()
      const res = await window.darkhub.optiscaler.analyze(payload)
      setAnalysis(res)
      await loadBackups(payload)
      if (!silent) {
        setStatus({
          ok: Boolean(res?.ok),
          message: res?.ok ? 'Detecção concluida.' : res?.error ?? 'Falha na detecção.'
        })
      }
    } catch (err: any) {
      if (!silent) setStatus({ ok: false, message: err?.message ?? String(err) })
    } finally {
      if (silent) setSilentAnalyzing(false)
      else setAnalyzing(false)
    }
  }

  const refreshGames = async () => {
    if (!window.darkhub?.library) return
    setLoadingGames(true)
    setStatus(null)
    try {
      const res = await window.darkhub.library.list()
      const next = res?.ok && Array.isArray(res.games) ? res.games : []
      setGames(next)
      if (!selectedGameId && next[0]?.id) setSelectedGameId(next[0].id)
    } catch (err: any) {
      setStatus({ ok: false, message: err?.message ?? 'Falha ao carregar Biblioteca.' })
    } finally {
      setLoadingGames(false)
    }
  }

  useEffect(() => {
    refreshGames()
  }, [])

  useEffect(() => {
    if (!selectedGame) return
    const nextExe = selectedGame.exePath || ''
    const opti = selectedGame.optiscaler ?? {}
    setExePath(nextExe)
    setSettings({
      ...DEFAULT_SETTINGS,
      applyOnLaunch: Boolean(opti.applyOnLaunch),
      targetDir: derivedTargetDir(selectedGame, nextExe),
      loader: opti.loader || 'auto',
      upscaler: opti.upscaler || 'auto',
      inputApi: opti.inputApi || 'auto',
      includeAgilitySdk: Boolean(opti.includeAgilitySdk)
    })
    setAnalysis(null)
    setStatus(null)
  }, [selectedGameId])

  useEffect(() => {
    if (!exePath && !selectedGame?.exePath) return
    const timer = window.setTimeout(() => {
      runAnalyze(true)
    }, 450)
    return () => window.clearTimeout(timer)
  }, [exePath, selectedGameId, settings.loader, settings.upscaler, settings.inputApi, settings.includeAgilitySdk])

  const pickExe = async () => {
    if (!window.darkhub?.dialog) return
    const res = await window.darkhub.dialog.selectFiles({
      title: 'Selecione o executavel do jogo',
      filters: [{ name: 'Executavel', extensions: ['exe'] }]
    })
    if (!res?.canceled && res?.filePaths?.[0]) {
      setSelectedGameId('')
      setExePath(res.filePaths[0])
      setSettings((prev) => ({ ...prev, targetDir: dirnameFromPath(res.filePaths[0]) }))
      setAnalysis(null)
    }
  }

  const pickTargetDir = async () => {
    if (!window.darkhub?.dialog) return
    const res = await window.darkhub.dialog.selectFolder({ title: 'Selecione a pasta onde o OptiScaler sera instalado' })
    if (!res?.canceled && res?.folderPath) {
      setSettings((prev) => ({ ...prev, targetDir: res.folderPath }))
      setAnalysis(null)
    }
  }

  const applyOptiScaler = async () => {
    if (!window.darkhub?.optiscaler) return
    setApplying(true)
    setStatus(null)
    try {
      const payload = makePayload()
      const res = await window.darkhub.optiscaler.apply(payload)
      setAnalysis(res?.analysis ?? res)
      await loadBackups(payload)
      if (res?.ok) {
        setStatus({
          ok: true,
          message: res.skipped ? 'Instalação ja estava atualizada.' : `Aplicado com backup: ${res.backupDir ?? 'ok'}`
        })
        await refreshGames()
      } else {
        setStatus({ ok: false, message: res?.error ?? 'Falha ao aplicar OptiScaler.' })
      }
    } catch (err: any) {
      setStatus({ ok: false, message: err?.message ?? String(err) })
    } finally {
      setApplying(false)
    }
  }

  const handleUpdateOptiScaler = async () => {
    if (!window.darkhub?.optiscaler) return
    setUpdatingOptiScaler(true)
    setUpdaterStatus(null)
    try {
      const res = await window.darkhub.optiscaler.checkUpdate()
      if (!res?.ok) {
        setUpdaterStatus({ ok: false, message: res?.error || 'Falha ao buscar updates.' })
        setUpdatingOptiScaler(false)
        return
      }

      if (res.hasUpdate) {
        setUpdaterStatus({ ok: true, message: `Baixando v${res.latestVersion}...` })
        const downRes = await window.darkhub.optiscaler.downloadUpdate({
          url: res.downloadUrl,
          version: res.latestVersion
        })
        if (downRes?.ok) {
          setUpdaterStatus({ ok: true, message: 'Atualizado com sucesso! Reinicie o manager ou analise novamente.' })
          runAnalyze(false)
        } else {
          setUpdaterStatus({ ok: false, message: downRes?.error || 'Erro no download.' })
        }
      } else {
        setUpdaterStatus({ ok: true, message: `Já está na última versão (v${res.currentVersion})` })
      }
    } catch (e: any) {
      setUpdaterStatus({ ok: false, message: e.message })
    }
    setUpdatingOptiScaler(false)
  }

  const handleRestoreBackup = async (backupId?: string, backupPath?: string) => {
    if (!window.darkhub?.optiscaler) return
    const idKey = backupId || 'latest'
    setRestoring(idKey)
    setStatus(null)
    try {
      const payload = { ...makePayload(), backupId, backupPath }
      const res = await window.darkhub.optiscaler.restoreBackup(payload)
      if (res?.ok) {
        setStatus({ ok: true, message: 'Backup restaurado com sucesso! Arquivos do jogo revertidos ao estado original.' })
        await loadBackups()
        await runAnalyze(false)
        await refreshGames()
      } else {
        setStatus({ ok: false, message: res?.error || 'Falha ao restaurar backup.' })
      }
    } catch (err: any) {
      setStatus({ ok: false, message: err?.message || String(err) })
    } finally {
      setRestoring(null)
    }
  }

  const handleDeleteBackup = async (backupId: string, backupPath?: string) => {
    if (!window.darkhub?.optiscaler) return
    setDeleting(backupId)
    try {
      const payload = { ...makePayload(), backupId, backupPath }
      const res = await window.darkhub.optiscaler.deleteBackup(payload)
      if (res?.ok) {
        await loadBackups()
      } else {
        setStatus({ ok: false, message: res?.error || 'Falha ao excluir backup.' })
      }
    } catch (err: any) {
      setStatus({ ok: false, message: err?.message || String(err) })
    } finally {
      setDeleting(null)
    }
  }

  const handleCreateManualBackup = async () => {
    if (!window.darkhub?.optiscaler) return
    setCreatingBackup(true)
    setStatus(null)
    try {
      const payload = makePayload()
      const res = await window.darkhub.optiscaler.createManualBackup(payload)
      if (res?.ok) {
        setStatus({ ok: true, message: `Snapshot criado com sucesso: ${res.backupDir}` })
        await loadBackups()
      } else {
        setStatus({ ok: false, message: res?.error || 'Falha ao criar snapshot manual.' })
      }
    } catch (err: any) {
      setStatus({ ok: false, message: err?.message || String(err) })
    } finally {
      setCreatingBackup(false)
    }
  }

  const detected = analysis?.ok ? analysis.detected : null
  const sourceOk = Boolean(analysis?.source?.exists)
  const canApply = Boolean((analysis?.ok || exePath || selectedGame?.exePath) && !applying)
  const gameTitle = selectedGame?.name || basename(exePath).replace(/\.exe$/i, '') || 'Modo manual'

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
              <Cpu size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">OptiScaler Manager</h1>
              <p className="text-sm text-zinc-400">Aplicação com backup, detecção de jogo, loader, DLL e modo de upscale.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill ok={sourceOk} label={sourceOk ? `Release ${analysis?.source?.version ?? ''}` : 'Release local'} />
            <StatusPill ok={Boolean(analysis?.ok)} label={analysis?.ok ? 'Detecção pronta' : 'Aguardando análise'} />
            <StatusPill ok={Boolean(selectedGame)} label={selectedGame ? 'Integrado à Biblioteca' : 'Modo manual'} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={refreshGames}
            disabled={loadingGames}
            className="flex items-center gap-2 rounded-lg bg-zinc-800 px-4 py-2 text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
          >
            <RefreshCw size={18} className={loadingGames ? 'animate-spin' : ''} />
            <span>{loadingGames ? 'Carregando...' : 'Atualizar Biblioteca'}</span>
          </button>
          <button
            onClick={() => runAnalyze(false)}
            disabled={analyzing || silentAnalyzing}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
          >
            <FileSearch size={18} />
            <span>{analyzing || silentAnalyzing ? 'Detectando...' : 'Detectar'}</span>
          </button>
          <button
            onClick={() => handleRestoreBackup()}
            disabled={Boolean(restoring) || !backups.length}
            className="flex items-center gap-2 rounded-lg bg-amber-700/80 px-4 py-2 text-white transition-colors hover:bg-amber-600 disabled:opacity-40"
            title="Reverte todos os arquivos e remove o OptiScaler para o estado original do jogo"
          >
            <RotateCcw size={18} className={restoring ? 'animate-spin' : ''} />
            <span>{restoring ? 'Restaurando...' : 'Reverter para Original'}</span>
          </button>
          <button
            onClick={applyOptiScaler}
            disabled={!canApply}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
          >
            <ShieldCheck size={18} />
            <span>{applying ? '...' : t('optiscaler.applyBackup', 'Apply with backup')}</span>
          </button>
          <button
            onClick={handleUpdateOptiScaler}
            disabled={updatingOptiScaler}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            <DownloadCloud size={18} />
            <span>{updatingOptiScaler ? '...' : t('optiscaler.checkUpdate', 'Check for Updates')}</span>
          </button>
        </div>
      </div>

      {status ? (
        <div
          className={`rounded-lg border p-3 text-sm ${
            status.ok ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/20 bg-amber-500/10 text-amber-200'
          }`}
        >
          {status.message}
        </div>
      ) : null}

      {updaterStatus ? (
        <div
          className={`rounded-lg border p-3 text-sm ${
            updaterStatus.ok ? 'border-indigo-500/20 bg-indigo-500/10 text-indigo-200' : 'border-red-500/20 bg-red-500/10 text-red-200'
          }`}
        >
          {updaterStatus.message}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
            <div className="flex items-center gap-2 text-white">
              <Gamepad2 size={19} className="text-blue-300" />
              <span className="font-semibold">Jogo</span>
            </div>
            {selectedGame?.optiscaler?.enabled ? (
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-300">
                Ativo
              </span>
            ) : null}
          </div>
          <div className="space-y-4 p-5">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Biblioteca</div>
              <select
                value={selectedGameId}
                onChange={(e) => setSelectedGameId(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-200 outline-none transition-colors focus:border-blue-500"
              >
                <option value="">Modo manual</option>
                {(Array.isArray(games) ? games : []).map((game) => (
                  <option key={game.id} value={game.id}>
                    {game.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Executável</div>
              <div className="flex gap-2">
                <input
                  value={exePath}
                  onChange={(e) => {
                    setExePath(e.target.value)
                    setSelectedGameId('')
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-200 outline-none transition-colors focus:border-blue-500"
                  placeholder="C:\\Games\\Game\\game.exe"
                />
                <button
                  onClick={pickExe}
                  className="rounded-lg bg-zinc-800 px-3 py-2 text-white transition-colors hover:bg-zinc-700"
                  title="Selecionar executável"
                >
                  <FolderOpen size={18} />
                </button>
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Pasta alvo</div>
              <div className="flex gap-2">
                <input
                  value={targetDir}
                  onChange={(e) => setSettings((prev) => ({ ...prev, targetDir: e.target.value }))}
                  className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-200 outline-none transition-colors focus:border-blue-500"
                />
                <button
                  onClick={pickTargetDir}
                  className="rounded-lg bg-zinc-800 px-3 py-2 text-white transition-colors hover:bg-zinc-700"
                  title="Selecionar pasta alvo"
                >
                  <FolderOpen size={18} />
                </button>
              </div>
              {analysis?.ok && analysis.game?.targetDir !== targetDir ? (
                <div className="mt-2 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200">
                  Alvo automático: <span className="font-mono">{analysis.game.targetDir}</span>
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={settings.applyOnLaunch}
                  onChange={(e) => setSettings((prev) => ({ ...prev, applyOnLaunch: e.target.checked }))}
                />
                Aplicar na inicialização
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={settings.includeAgilitySdk}
                  onChange={(e) => setSettings((prev) => ({ ...prev, includeAgilitySdk: e.target.checked }))}
                />
                D3D12_Optiscaler
              </label>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900">
          <div className="flex items-center gap-2 border-b border-zinc-800 px-5 py-4 text-white">
            <Settings2 size={19} className="text-violet-300" />
            <span className="font-semibold">Configuração</span>
          </div>
          <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 xl:grid-cols-1">
            <SelectControl
              label="Loader"
              value={settings.loader}
              options={LOADER_OPTIONS}
              onChange={(value) => setSettings((prev) => ({ ...prev, loader: value }))}
            />
            <SelectControl
              label="Modo de upscale"
              value={settings.upscaler}
              options={UPSCALER_OPTIONS}
              onChange={(value) =>
                setSettings((prev) => ({
                  ...prev,
                  upscaler: value,
                  includeAgilitySdk: value.startsWith('fsr4') ? true : prev.includeAgilitySdk
                }))
              }
            />
            <SelectControl
              label="Input do jogo"
              value={settings.inputApi}
              options={INPUT_OPTIONS}
              onChange={(value) => setSettings((prev) => ({ ...prev, inputApi: value }))}
            />
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 xl:col-span-2">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
            <div className="flex items-center gap-2 text-white">
              <Wand2 size={19} className="text-cyan-300" />
              <span className="font-semibold">Detecção automática</span>
            </div>
            {silentAnalyzing ? <span className="text-xs text-zinc-500">Atualizando...</span> : null}
          </div>
          <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-200">
                <Rocket size={16} className="text-emerald-300" />
                Resultado
              </div>
              <InfoRow label="Jogo" value={<span className="truncate">{gameTitle}</span>} />
              <InfoRow label="Exe alvo" value={<span className="font-mono text-xs">{basename(analysis?.game?.targetExePath || exePath)}</span>} />
              <InfoRow label="Loader" value={analysis?.choices?.loader ?? choiceLabel(LOADER_OPTIONS, settings.loader)} />
              <InfoRow label="Upscale" value={choiceLabel(UPSCALER_OPTIONS, analysis?.choices?.upscaler ?? settings.upscaler)} />
              <InfoRow label="Input" value={choiceLabel(INPUT_OPTIONS, analysis?.choices?.resolvedInputApi ?? settings.inputApi)} />
              <InfoRow
                label="GPU"
                value={
                  analysis?.gpu?.amdArchitecture
                    ? `${analysis.gpu.vendor} / ${analysis.gpu.amdArchitecture}`
                    : analysis?.gpu?.vendor ?? 'unknown'
                }
              />
              <InfoRow label="Última aplicação" value={formatDate(selectedGame?.optiscaler?.lastInstalledAt)} />
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-200">
                <HardDriveDownload size={16} className="text-blue-300" />
                Arquivos detectados
              </div>
              <div className="mb-3 flex flex-wrap gap-2">
                <StatusPill ok={Boolean(detected?.hasDlss)} label="DLSS" />
                <StatusPill ok={Boolean(detected?.hasFsr)} label="FSR/FidelityFX" />
                <StatusPill ok={Boolean(detected?.hasXess)} label="XeSS" />
                <StatusPill ok={Boolean(detected?.hasDlssFg)} label="DLSS-G" />
                <StatusPill ok={Boolean(detected?.hasVulkan)} label="Vulkan" />
                <StatusPill ok={Boolean(detected?.hasD3d12)} label="D3D12" />
              </div>
              <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                {(Array.isArray(analysis?.detectedVersions) ? analysis.detectedVersions : (Array.isArray(analysis?.detected?.files) ? analysis.detected.files : [])).slice(0, 10).map((item: any, index: number) => (
                  <div key={`${item.path}-${index}`} className="rounded-lg bg-zinc-900 px-3 py-2">
                    <div className="flex items-center justify-between gap-2 text-sm text-zinc-200">
                      <span>{item.kind}</span>
                      <span className="font-mono text-xs text-zinc-500">{item.fileVersion || item.productVersion || ''}</span>
                    </div>
                    <div className="truncate font-mono text-xs text-zinc-500">{item.relative || item.file}</div>
                  </div>
                ))}
                {analysis?.ok && !(Array.isArray(analysis?.detected?.files) && analysis.detected.files.length) ? <div className="text-sm text-zinc-500">{t('optiscaler.noDlls', 'No upscaling DLLs found in game directory.')}</div> : null}
                {!analysis ? <div className="text-sm text-zinc-500">Selecione um jogo para iniciar a detecção.</div> : null}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 lg:col-span-2">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-200">
                <Save size={16} className="text-emerald-300" />
                Alterações no OptiScaler.ini
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {(Array.isArray(analysis?.choices?.iniPatch) ? analysis.choices.iniPatch : []).map((entry: any) => {
                  const [section, key, value] = Array.isArray(entry) ? entry : ['Settings', 'Key', String(entry)];
                  return (
                    <div key={`${section}.${key}`} className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
                      <div className="text-xs text-zinc-500">[{section}]</div>
                      <div className="truncate font-mono text-sm text-zinc-200">
                        {key}={value}
                      </div>
                    </div>
                  );
                })}
                {analysis?.ok && !analysis?.choices?.iniPatch?.length ? (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-500">Modo auto sem patch de INI.</div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900">
          <div className="flex items-center gap-2 border-b border-zinc-800 px-5 py-4 text-white">
            <Archive size={19} className="text-amber-300" />
            <span className="font-semibold">Backup e alertas</span>
          </div>
          <div className="space-y-4 p-5">
            {analysis?.notes?.length ? (
              <div className="space-y-2">
                {analysis.notes.map((note: string, index: number) => (
                  <div key={`${note}-${index}`} className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    <span>{note}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-500">Sem alertas para o alvo atual.</div>
            )}

            {analysis?.conflicts?.selectedLoader ? (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                Loader ocupado: <span className="font-mono">{analysis.conflicts.selectedLoader.file}</span>
              </div>
            ) : null}

            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-zinc-200">Snapshots de Backup</div>
                <button
                  onClick={handleCreateManualBackup}
                  disabled={creatingBackup || (!exePath && !selectedGame?.exePath)}
                  className="flex items-center gap-1.5 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20 disabled:opacity-40"
                  title="Salva uma cópia exata de segurança dos arquivos antes de qualquer alteração"
                >
                  <Plus size={14} className={creatingBackup ? 'animate-spin' : ''} />
                  <span>{creatingBackup ? 'Criando...' : '+ Criar Snapshot'}</span>
                </button>
              </div>

              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {backups.slice(0, 10).map((backup) => {
                  const isRestoringThis = restoring === backup.id
                  const isDeletingThis = deleting === backup.id
                  const count = backup.manifest?.backedUp?.length ?? 0
                  return (
                    <div key={backup.id} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800/80 bg-zinc-900 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-zinc-200">{backup.id}</span>
                          {backup.manifest?.isManual ? (
                            <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-medium text-indigo-300">Manual</span>
                          ) : (
                            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">Auto</span>
                          )}
                          {count > 0 ? (
                            <span className="text-[10px] text-zinc-500">{count} arquivo(s)</span>
                          ) : null}
                        </div>
                        <div className="truncate font-mono text-[11px] text-zinc-500">{backup.path}</div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleRestoreBackup(backup.id, backup.path)}
                          disabled={Boolean(restoring)}
                          className="flex items-center gap-1 rounded bg-amber-600/20 px-2 py-1 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-600/30 disabled:opacity-40"
                          title="Restaura esta versão dos arquivos"
                        >
                          <RotateCcw size={13} className={isRestoringThis ? 'animate-spin' : ''} />
                          <span>{isRestoringThis ? '...' : 'Restaurar'}</span>
                        </button>
                        <button
                          onClick={() => handleDeleteBackup(backup.id, backup.path)}
                          disabled={Boolean(deleting)}
                          className="flex items-center justify-center rounded p-1 text-zinc-400 transition-colors hover:bg-red-500/20 hover:text-red-300 disabled:opacity-40"
                          title="Excluir este snapshot"
                        >
                          <Trash2 size={14} className={isDeletingThis ? 'animate-spin' : ''} />
                        </button>
                      </div>
                    </div>
                  )
                })}
                {!backups.length ? <div className="text-xs text-zinc-500">Nenhum snapshot de backup encontrado nesta pasta.</div> : null}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
