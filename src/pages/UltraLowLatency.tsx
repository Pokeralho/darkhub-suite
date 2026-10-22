import React, { useEffect, useRef, useState } from 'react'
import { visibleInterval } from '../utils/visibleInterval'
import { useI18n } from '../i18n/I18nProvider'
import { Zap, Loader2 } from '../components/icons'
import { HelpTip } from '../components/HelpTip'
import PageHeader from '../components/ui/PageHeader'

type LatencyPayload = {
  ok: boolean
  config?: any
  status?: any
  metrics?: any
}

const Skel = ({ w = 'w-12' }: { w?: string }) => (
  <span aria-hidden="true" className={`inline-block h-4 ${w} rounded bg-zinc-800/80 animate-pulse align-middle`} />
)

const Check = ({ checked, onChange, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; disabled?: boolean }) => (
  <label className={`flex items-center gap-2 text-[12.5px] ${disabled ? 'text-zinc-600' : 'text-zinc-300'} cursor-pointer`}>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
    {children}
  </label>
)

export default function UltraLowLatency() {
  const { t } = useI18n()
  const [data, setData] = useState<LatencyPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)
  const hotkeyEditingRef = useRef(false)
  const [uiMode, setUiMode] = useState<'simple' | 'advanced'>(() => {
    try {
      const v = localStorage.getItem('darkhub.ullm.mode')
      return v === 'advanced' ? 'advanced' : 'simple'
    } catch {
      return 'simple'
    }
  })
  const [lastApplied, setLastApplied] = useState<any>(null)

  const [gameExePath, setGameExePath] = useState('')
  const [auto, setAuto] = useState(false)
  const [hotkey, setHotkey] = useState('Ctrl+F1')
  const [pingHost, setPingHost] = useState('1.1.1.1')
  const [hotkeyEditing, setHotkeyEditing] = useState(false)
  const [overlayEnabled, setOverlayEnabled] = useState(false)
  const [shieldEnabled, setShieldEnabled] = useState(false)
  const [shieldDeltaMs, setShieldDeltaMs] = useState(30)
  const [shieldMinMs, setShieldMinMs] = useState(80)
  const [shieldBeep, setShieldBeep] = useState(false)
  const [smartCleanMinutes, setSmartCleanMinutes] = useState(0)
  const [smartCleanDuringGaming, setSmartCleanDuringGaming] = useState(false)
  const [gpuPollingEnabled, setGpuPollingEnabled] = useState(false)
  const [tweaks, setTweaks] = useState<any>({
    powerPlanHigh: true,
    timerResolution05: false,
    processPriorityHigh: true,
    disableFullscreenOptimizations: false,
    disableMouseAcceleration: true,
    gpuHighPerformance: false,
    qosForExe: false,
    disableNagle: false,
    killBackground: false,
    dnsCloudflare: false
  })

  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  useEffect(() => {
    hotkeyEditingRef.current = hotkeyEditing
  }, [hotkeyEditing])

  const markDirty = () => {
    dirtyRef.current = true
    setDirty(true)
  }

  const enableStable = async () => {
    setError(null)
    if (!window.darkhub?.latency) return
    setLoading(true)
    try {
      const res = await window.darkhub.latency.enableUltraStable({
        gameExePath,
        auto,
        hotkey,
        pingHost,
        overlayEnabled,
        shieldEnabled,
        shieldDeltaMs,
        shieldMinMs,
        shieldBeep
      })
      if (!res?.ok) setError(res?.error ?? 'Falha ao ativar.')
      if (res?.applied) setLastApplied(res.applied)
      await refresh()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  const toggleStable = async () => {
    if (data?.status?.ultraEnabled) return disable()
    return enableStable()
  }

  const refresh = async () => {
    if (!window.darkhub?.latency) return
    try {
      const res = await window.darkhub.latency.getConfig()
      setData(res)
      if (res?.ok) {
        if (res?.applied) setLastApplied(res.applied)
        else if (res?.status?.lastApplied) setLastApplied(res.status.lastApplied)
        if (!dirtyRef.current && !hotkeyEditingRef.current) {
          setGameExePath(String(res.config?.gameExePath ?? ''))
          setAuto(Boolean(res.config?.auto))
          setHotkey(String(res.config?.hotkey ?? 'Ctrl+F1'))
          setPingHost(String(res.config?.pingHost ?? '1.1.1.1'))
          setOverlayEnabled(Boolean(res.config?.overlayEnabled))
          setShieldEnabled(Boolean(res.config?.shieldEnabled))
          setShieldDeltaMs(Number(res.config?.shieldDeltaMs ?? 30))
          setShieldMinMs(Number(res.config?.shieldMinMs ?? 80))
          setShieldBeep(Boolean(res.config?.shieldBeep))
          setSmartCleanMinutes(Number(res.config?.smartCleanMinutes ?? 0))
          setSmartCleanDuringGaming(Boolean(res.config?.smartCleanDuringGaming))
          setGpuPollingEnabled(Boolean(res.config?.gpuPollingEnabled))
          setTweaks((prev: any) =>
            res.config?.tweaks && typeof res.config.tweaks === 'object' ? { ...prev, ...res.config.tweaks } : prev
          )
        }
      }
    } catch (e: any) {
      setError(e?.message ?? String(e))
    }
  }

  useEffect(() => {
    refresh()
    return visibleInterval(refresh, 1500)
  }, [])

  const pickExe = async () => {
    setError(null)
    if (!window.darkhub?.dialog) return
    const res = await window.darkhub.dialog.selectFiles({
      title: 'Selecione o executável do jogo',
      filters: [{ name: 'Executável', extensions: ['exe'] }]
    })
    if (!res?.canceled && Array.isArray(res?.filePaths) && res.filePaths[0]) {
      markDirty()
      setGameExePath(res.filePaths[0])
    }
  }

  const persistConfig = async () => {
    if (!window.darkhub?.latency) return { ok: false, error: 'Latency API unavailable' }
    const res = await window.darkhub.latency.setConfig({
      gameExePath,
      auto,
      hotkey,
      pingHost,
      overlayEnabled,
      shieldEnabled,
      shieldDeltaMs,
      shieldMinMs,
      shieldBeep,
      smartCleanMinutes,
      smartCleanDuringGaming,
      gpuPollingEnabled,
      tweaks
    })
    if (res?.ok) {
      dirtyRef.current = false
      setDirty(false)
    }
    return res
  }

  const save = async () => {
    setError(null)
    if (!window.darkhub?.latency) return
    setSaving(true)
    try {
      const res = await persistConfig()
      if (!res?.ok) setError(res?.error ?? 'Falha ao salvar.')
      await refresh()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  const enable = async () => {
    setError(null)
    if (!window.darkhub?.latency) return
    setLoading(true)
    try {
      const saved = await persistConfig()
      if (!saved?.ok) {
        setError(saved?.error ?? 'Falha ao salvar configurações.')
        return
      }
      const res = await window.darkhub.latency.enableUltra()
      if (!res?.ok) setError(res?.error ?? 'Falha ao ativar.')
      await refresh()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  const disable = async () => {
    setError(null)
    if (!window.darkhub?.latency) return
    setLoading(true)
    try {
      const res = await window.darkhub.latency.disableUltra()
      if (!res?.ok) setError(res?.error ?? 'Falha ao desativar.')
      await refresh()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  const boostNow = async () => {
    setError(null)
    if (!window.darkhub?.latency) return
    setLoading(true)
    try {
      await persistConfig()
      const res = await window.darkhub.latency.boostNow()
      if (!res?.ok) setError(res?.error ?? 'Falha no BOOST NOW.')
      await refresh()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  const buildAcceleratorFromEvent = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const key = e.key
    if (key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta') return null
    const mods: string[] = []
    if (e.ctrlKey) mods.push('Ctrl')
    if (e.altKey) mods.push('Alt')
    if (e.shiftKey) mods.push('Shift')
    if (e.metaKey) mods.push('Super')

    let k = key
    if (k.length === 1) k = k.toUpperCase()
    if (k === ' ') k = 'Space'
    if (k === 'Escape') k = 'Esc'
    if (k === 'ArrowUp') k = 'Up'
    if (k === 'ArrowDown') k = 'Down'
    if (k === 'ArrowLeft') k = 'Left'
    if (k === 'ArrowRight') k = 'Right'
    if (k === 'Enter') k = 'Enter'
    if (k === 'Backspace') k = 'Backspace'
    if (k === 'Delete') k = 'Delete'
    if (k === 'Tab') k = 'Tab'
    if (k === 'PageUp') k = 'PageUp'
    if (k === 'PageDown') k = 'PageDown'
    if (k === 'Home') k = 'Home'
    if (k === 'End') k = 'End'

    if (mods.length === 0) {
      if (/^F\d{1,2}$/.test(k)) return k
      return null
    }
    return [...mods, k].join('+')
  }

  const status = data?.status
  const metrics = data?.metrics
  const prioSkipped =
    uiMode === 'simple' &&
    (lastApplied?.processPriorityHigh?.status === 'skipped' || (!status?.game?.pid && Boolean(status?.ultraEnabled)))

  const bridgeMissing = !window.darkhub?.latency
  const waiting = !data && !bridgeMissing
  const ultraOn = Boolean(status?.ultraEnabled)

  const setMode = (m: 'simple' | 'advanced') => {
    setUiMode(m)
    try {
      localStorage.setItem('darkhub.ullm.mode', m)
    } catch {}
  }

  const num = (v: any, digits = 1) => (v != null && Number.isFinite(Number(v)) ? Number(v).toFixed(digits) : null)
  const pct = (v: any) => {
    const n = num(v)
    if (n == null) return waiting ? <Skel /> : <span className="text-zinc-600">--</span>
    return <>{n}<span className="text-[11px] text-zinc-500">%</span></>
  }

  const timerMs = status?.timerResolutionInfo?.current_ms
  const pingTone = metrics?.pingMs != null && Number(metrics.pingMs) >= shieldMinMs ? 'text-amber-300' : 'text-zinc-50'

  const dirtyThen = (fn: (v: boolean) => void) => (v: boolean) => {
    markDirty()
    fn(v)
  }

  const tweakList: Array<[string, string]> = [
    ['powerPlanHigh', 'Power Plan High Performance'],
    ['timerResolution05', 'Timer Resolution 0.5ms'],
    ['processPriorityHigh', 'Prioridade High (jogo)'],
    ['disableMouseAcceleration', 'Desativar Mouse Acceleration'],
    ['disableFullscreenOptimizations', 'Disable Fullscreen Optimizations'],
    ['gpuHighPerformance', 'GPU High Performance (por exe)'],
    ['dnsCloudflare', 'DNS Cloudflare + Flush'],
    ['disableNagle', 'Desativar Nagle (interface ativa)'],
    ['qosForExe', 'QoS (DSCP) por exe'],
    ['killBackground', 'Encerrar processos de fundo']
  ]

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            Ultra Low Latency Mode
            <HelpTip
              title="Ultra Low Latency Mode"
              description="Perfil para reduzir latência e melhorar responsividade em jogos. O modo Básico aplica um preset estável; o modo Avançado permite controle fino dos tweaks."
              sections={[
                { title: 'Básico', content: 'Um botão único para ativar o perfil com aplicação best-effort e foco em estabilidade.' },
                { title: 'Avançado', content: 'Ajustes individuais (power plan, prioridade, QoS, Nagle, etc.), com mais risco e mais controle.' },
                { title: 'Dica', content: 'Se o jogo não estiver rodando, a prioridade High pode ser adiada (comportamento mais estável). Abra o jogo e clique Ativar novamente.' }
              ]}
              example="Exemplo: selecione o executável do jogo, use “Básico” para aplicar o preset e, se necessário, ajuste no “Avançado”."
              buttonLabel="Ajuda"
            />
          </span>
        }
        subtitle={<>Perfil de baixa latência para jogos (manual ou automático). Atalho padrão: <span className="font-mono text-zinc-300">Ctrl+F1</span>.</>}
        actions={
          <div role="tablist" aria-label="Modo" className="flex items-center gap-0.5 rounded-md border border-zinc-800 bg-zinc-900/60 p-0.5">
            {([['simple', 'Básico'], ['advanced', 'Avançado']] as const).map(([m, label]) => (
              <button
                key={m}
                role="tab"
                aria-selected={uiMode === m}
                onClick={() => setMode(m)}
                className={`h-7 px-3 rounded-[5px] text-[12.5px] transition-colors ${
                  uiMode === m ? 'bg-zinc-800 text-zinc-50 font-medium' : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      {bridgeMissing ? (
        <p role="alert" className="text-[12.5px] text-red-300">{t('ull.apiUnavailable', 'Backend de latência indisponível. Reinicie o DarkHub para reconectar.')}</p>
      ) : null}
      {error ? (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/[0.04] px-3.5 py-2.5">
          <span className="text-[12.5px] text-red-300 break-words">{error}</span>
          <button onClick={() => { setError(null); refresh() }} className="dh-btn dh-btn-ghost dh-btn-sm shrink-0">
            {t('monitor.tabRetry', 'Tentar Novamente')}
          </button>
        </div>
      ) : null}

      {/* Live status strip */}
      <section aria-label="Status">
        <dl className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-px rounded-xl border border-zinc-800/80 bg-zinc-800/70 overflow-hidden">
          <div className="bg-zinc-950 px-4 py-3 min-w-0">
            <dt className="text-[11.5px] text-zinc-500">Ultra Mode</dt>
            <dd className="mt-1.5 flex items-center gap-2 text-[14px]">
              {waiting ? <Skel w="w-16" /> : !data ? <span className="font-mono text-zinc-600">--</span> : (
                <>
                  <span className={`w-1.5 h-1.5 rounded-full ${ultraOn ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                  <span className={ultraOn ? 'text-zinc-50 font-medium' : 'text-zinc-400'}>{ultraOn ? 'Ativo' : 'Desligado'}</span>
                </>
              )}
            </dd>
          </div>
          <div className="bg-zinc-950 px-4 py-3 min-w-0">
            <dt className="text-[11.5px] text-zinc-500">Timer Kernel</dt>
            <dd className="mt-1.5 font-mono text-[14px] text-zinc-50 tabular-nums">
              {timerMs ? <>{timerMs}<span className="text-[11px] text-zinc-500"> ms</span></> : waiting ? <Skel w="w-16" /> : <span className="text-zinc-600">--</span>}
            </dd>
            <dd className="mt-0.5 text-[11px] text-zinc-500 truncate">{status?.timerResolutionInfo?.locked ? 'MMCSS Games Locked' : 'Default'}</dd>
          </div>
          <div className="bg-zinc-950 px-4 py-3 min-w-0 md:col-span-2 xl:col-span-1">
            <dt className="text-[11.5px] text-zinc-500">Jogo</dt>
            <dd className="mt-1.5 font-mono text-[13px] text-zinc-50 truncate" title={status?.game?.name ?? ''}>
              {status?.game?.name ?? (waiting ? <Skel w="w-20" /> : <span className="text-zinc-600">--</span>)}
            </dd>
            <dd className="mt-0.5 text-[11px] text-zinc-500 font-mono">{status?.game?.pid ? `pid ${status.game.pid}` : ''}</dd>
          </div>
          <div className="bg-zinc-950 px-4 py-3 min-w-0">
            <dt className="text-[11.5px] text-zinc-500">Ping</dt>
            <dd className={`mt-1.5 font-mono text-[14px] tabular-nums ${pingTone}`}>
              {metrics?.pingMs != null ? <>{metrics.pingMs}<span className="text-[11px] text-zinc-500">ms</span></> : waiting ? <Skel /> : <span className="text-zinc-600">--</span>}
            </dd>
            <dd className="mt-0.5 text-[11px] text-zinc-500 font-mono truncate">{pingHost}</dd>
          </div>
          <div className="bg-zinc-950 px-4 py-3"><dt className="text-[11.5px] text-zinc-500">CPU</dt><dd className="mt-1.5 font-mono text-[14px] text-zinc-50 tabular-nums">{pct(metrics?.cpuPct)}</dd></div>
          <div className="bg-zinc-950 px-4 py-3"><dt className="text-[11.5px] text-zinc-500">RAM</dt><dd className="mt-1.5 font-mono text-[14px] text-zinc-50 tabular-nums">{pct(metrics?.ramPct)}</dd></div>
          <div className="bg-zinc-950 px-4 py-3"><dt className="text-[11.5px] text-zinc-500">GPU</dt><dd className="mt-1.5 font-mono text-[14px] text-zinc-50 tabular-nums">{pct(metrics?.gpuPct)}</dd></div>
        </dl>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500">
          <span>Guardian Telemetry (ICMP Realtime). Coleta em tempo real via socket ICMP e HAL de hardware nativo.</span>
          <span className="dh-tag">native engine</span>
        </div>
        {status?.lastError ? <p className="mt-2 text-[12px] text-red-300 break-all">Erro: {status.lastError}</p> : null}
      </section>

      {/* Configuration */}
      <section className="dh-card divide-y divide-zinc-800/80" aria-label="Configuração">
        <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <div className="dh-label mb-1.5 flex items-center gap-2">
              <span>Executável do jogo</span>
              <HelpTip
                title="Executável do jogo"
                description="Caminho completo do .exe do jogo que o DarkHub usará para detectar quando o jogo está rodando e para aplicar ajustes por executável."
                sections={[
                  { title: 'Entrada', content: 'Um caminho válido para um arquivo .exe (ex.: C:\\\\Games\\\\MeuJogo\\\\game.exe).' },
                  {
                    title: 'Uso',
                    content:
                      'No modo Básico, o preset estável usa este caminho para aplicar ajustes por jogo.\nNo modo Avançado, ele também é usado para QoS por exe, preferência de GPU e compat layer (Fullscreen Optimizations).'
                  },
                  {
                    title: 'Observações',
                    content:
                      'Se o jogo não estiver aberto, a prioridade High do processo será pulada (comportamento estável). Abra o jogo e aplique novamente se quiser esse ajuste.'
                  }
                ]}
                example="C:\\Games\\MeuJogo\\game.exe"
              />
            </div>
            <div className="flex gap-2">
              <input
                value={gameExePath}
                onChange={(e) => {
                  markDirty()
                  setGameExePath(e.target.value)
                }}
                placeholder={'C:\\Games\\MeuJogo\\game.exe'}
                className="dh-input flex-1 min-w-0 font-mono"
              />
              <button onClick={pickExe} className="dh-btn shrink-0">
                Selecionar
              </button>
            </div>
          </div>

          <div className="flex items-end gap-3 lg:pb-1.5">
            <Check checked={auto} onChange={dirtyThen(setAuto)}>Ativar automaticamente ao detectar o jogo</Check>
            <HelpTip
              title="Ativação automática"
              description="Quando ativado, o Guardian tenta detectar o jogo pelo executável configurado e liga/desliga o Ultra Mode automaticamente."
              sections={[
                { title: 'Entrada', content: 'Requer que o Executável do jogo esteja configurado.' },
                { title: 'Saída', content: 'Ultra Mode liga quando encontra o processo e desliga quando o processo some.' },
                { title: 'Estabilidade', content: 'Evita aplicar prioridade/QoS/otros em processos inexistentes; o modo Básico é recomendado.' }
              ]}
            />
          </div>

          <div>
            <div className="dh-label mb-1.5 flex items-center gap-2">
              <span>Hotkey global (toggle)</span>
              <HelpTip
                title="Hotkey global"
                description="Atalho global para alternar o Ultra Mode sem abrir a janela do DarkHub."
                sections={[
                  { title: 'Entrada', content: 'Pressione uma combinação (ex.: Ctrl+F1). Precisa conter ao menos um modificador, exceto teclas F.' },
                  { title: 'Retorno', content: 'O atalho é registrado no Windows; se estiver em uso, o backend retorna erro.' },
                  {
                    title: 'Exemplo de uso',
                    content: 'Defina Ctrl+F1 e use no jogo: Ctrl+F1 liga/desliga o Ultra Mode.'
                  }
                ]}
              />
            </div>
            <input
              value={hotkeyEditing ? '' : hotkey}
              placeholder="Clique e pressione (ex: Ctrl+F1)"
              readOnly
              onFocus={() => {
                hotkeyEditingRef.current = true
                setHotkeyEditing(true)
              }}
              onBlur={() => {
                hotkeyEditingRef.current = false
                setHotkeyEditing(false)
              }}
              onKeyDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (e.key === 'Escape') {
                  hotkeyEditingRef.current = false
                  setHotkeyEditing(false)
                  return
                }
                const accel = buildAcceleratorFromEvent(e)
                if (!accel) return
                markDirty()
                setHotkey(accel)
                hotkeyEditingRef.current = false
                setHotkeyEditing(false)
              }}
              className="dh-input w-full font-mono cursor-pointer"
            />
            <p className="dh-help mt-1.5">
              Para aplicar QoS/Nagle/hosts e mexer em processos elevados, rode o DarkHub como Administrador.
            </p>
          </div>

          <div>
            <div className="dh-label mb-1.5 flex items-center gap-2">
              <span>Host de ping</span>
              <HelpTip
                title="Host de ping"
                description="Servidor usado para medir latência (ping) no Guardian."
                sections={[
                  { title: 'Entrada', content: 'IP ou domínio (ex.: 1.1.1.1, 8.8.8.8, google.com).' },
                  { title: 'Saída', content: 'O Guardian exibe o ping atual em ms (medição leve). ' }
                ]}
                example="1.1.1.1"
              />
            </div>
            <input
              value={pingHost}
              onChange={(e) => {
                markDirty()
                setPingHost(e.target.value)
              }}
              placeholder="1.1.1.1"
              className="dh-input w-full font-mono"
            />
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-3">
            <div className="flex items-center gap-3">
              <Check checked={overlayEnabled} onChange={dirtyThen(setOverlayEnabled)}>Widget discreto (canto da tela)</Check>
              <HelpTip
                title="Widget discreto"
                description="Exibe um mini-widget com ping/cpu/ram/gpu e status do boost."
                sections={[
                  { title: 'Estabilidade', content: 'O widget é leve; a medição de GPU (3D) é opcional e fica no modo Avançado.' }
                ]}
              />
            </div>
            <div className="flex items-center gap-3">
              <Check checked={shieldEnabled} onChange={dirtyThen(setShieldEnabled)}>Latency Shield (alerta de pico)</Check>
              <HelpTip
                title="Latency Shield"
                description="Monitora o ping e alerta quando houver um pico repentino (Δms acima do normal)."
                sections={[
                  { title: 'Parâmetros', content: 'Disparo (Δms) e Ping mínimo (ms) controlam quando o alerta dispara.' },
                  { title: 'Saída', content: 'Alerta visual no widget e opcionalmente beep.' }
                ]}
              />
              <Check checked={shieldBeep} onChange={dirtyThen(setShieldBeep)} disabled={!shieldEnabled}>Beep</Check>
            </div>
          </div>

          {shieldEnabled ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 max-w-xl">
              <div>
                <label className="dh-label block mb-1.5">Disparo (Δms)</label>
                <input
                  type="number"
                  min={5}
                  max={300}
                  value={shieldDeltaMs}
                  onChange={(e) => {
                    markDirty()
                    setShieldDeltaMs(Math.max(5, Math.min(300, Math.trunc(Number(e.target.value) || 30))))
                  }}
                  className="dh-input w-full font-mono"
                />
              </div>
              <div>
                <label className="dh-label block mb-1.5">Ping mínimo (ms)</label>
                <input
                  type="number"
                  min={10}
                  max={500}
                  value={shieldMinMs}
                  onChange={(e) => {
                    markDirty()
                    setShieldMinMs(Math.max(10, Math.min(500, Math.trunc(Number(e.target.value) || 80))))
                  }}
                  className="dh-input w-full font-mono"
                />
              </div>
            </div>
          ) : null}
        </div>

        {uiMode === 'advanced' ? (
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-3">
              <div className="max-w-[16rem]">
                <label className="dh-label block mb-1.5">Smart Clean (min)</label>
                <input
                  type="number"
                  min={0}
                  max={240}
                  value={smartCleanMinutes}
                  onChange={(e) => {
                    markDirty()
                    setSmartCleanMinutes(Math.max(0, Math.min(240, Math.trunc(Number(e.target.value) || 0))))
                  }}
                  className="dh-input w-full font-mono"
                />
                <p className="dh-help mt-1.5">0 desativa. Recomendado: 10 a 30.</p>
              </div>
              <div className="flex items-center gap-5 lg:pt-6">
                <Check checked={smartCleanDuringGaming} onChange={dirtyThen(setSmartCleanDuringGaming)}>Permitir durante o jogo</Check>
                <Check checked={gpuPollingEnabled} onChange={dirtyThen(setGpuPollingEnabled)}>Medir GPU (3D)</Check>
              </div>
            </div>

            <div>
              <h2 className="dh-section-title mb-2.5">Tweaks</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5">
                {tweakList.map(([key, label]) => (
                  <Check key={key} checked={Boolean(tweaks[key])} onChange={dirtyThen((v) => setTweaks({ ...tweaks, [key]: v }))}>
                    {label}
                  </Check>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className="px-5 py-4">
          {uiMode === 'simple' ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
              <button
                onClick={toggleStable}
                disabled={loading}
                className={`dh-btn ${ultraOn ? '' : 'dh-btn-primary'} min-w-[200px]`}
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
                <span>{ultraOn ? 'Desativar (Estável)' : 'Ativar (Estável)'}</span>
              </button>
              <p className="dh-help max-w-[75ch]">
                Preset estável: Power Plan + Prioridade do jogo (quando detectado) + Mouse Acceleration OFF. Tweaks agressivos ficam no modo Avançado.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={enable} disabled={loading} className="dh-btn dh-btn-primary">
                {loading ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
                <span>Ativar</span>
              </button>
              <button onClick={save} disabled={saving} className="dh-btn">
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
              <button onClick={disable} disabled={loading} className="dh-btn">
                Desativar
              </button>
              <button onClick={boostNow} disabled={loading} className="dh-btn dh-btn-ghost">
                Boost now
              </button>
              {dirty ? <span className="ml-auto text-[11.5px] text-amber-300">Alterações não salvas</span> : null}
            </div>
          )}
          {prioSkipped ? (
            <p role="status" className="mt-3 text-[12px] text-amber-300">
              Abra o jogo e clique Ativar novamente para aplicar prioridade High.
            </p>
          ) : null}
        </div>
      </section>

      {lastApplied && typeof lastApplied === 'object' ? (
        <section className="dh-card p-4" aria-labelledby="ull-applied">
          <h2 id="ull-applied" className="dh-section-title mb-2">Resultado da aplicação</h2>
          <ul className="grid grid-cols-1 lg:grid-cols-2 gap-x-8">
            {Object.keys(lastApplied).map((k) => {
              const v = lastApplied?.[k]
              const st = typeof v === 'string' ? v : v?.status
              const err = typeof v === 'object' ? v?.error : null
              const color = st === 'ok' ? 'text-emerald-300' : st === 'failed' ? 'text-red-300' : 'text-zinc-400'
              return (
                <li key={k} className="py-2 border-b border-zinc-800/80">
                  <div className="flex items-center justify-between gap-3 text-[12.5px]">
                    <span className="font-mono text-zinc-200 truncate">{k}</span>
                    <span className={`${color} font-mono whitespace-nowrap`}>{st}</span>
                  </div>
                  {err ? <div className="mt-0.5 text-[11.5px] text-zinc-500 break-all">{err}</div> : null}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      <div className="dh-tag">
        {t('dashboard.status')}: {data?.ok ? 'ok' : '--'}
      </div>
    </div>
  )
}
