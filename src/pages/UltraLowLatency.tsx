import React, { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/I18nProvider'
import { Zap, Loader2 } from 'lucide-react'
import { HelpTip } from '../components/HelpTip'

type LatencyPayload = {
  ok: boolean
  config?: any
  status?: any
  metrics?: any
}

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
    const id = setInterval(refresh, 1200)
    return () => clearInterval(id)
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
      if (/^F\\d{1,2}$/.test(k)) return k
      return null
    }
    return [...mods, k].join('+')
  }

  const status = data?.status
  const metrics = data?.metrics
  const prioSkipped =
    uiMode === 'simple' &&
    (lastApplied?.processPriorityHigh?.status === 'skipped' || (!status?.game?.pid && Boolean(status?.ultraEnabled)))

  return (
    <div className="space-y-6 w-full">
      <div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white">Ultra Low Latency Mode</h1>
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
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-1">
            <button
              onClick={() => {
                setUiMode('simple')
                try {
                  localStorage.setItem('darkhub.ullm.mode', 'simple')
                } catch {}
              }}
              className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                uiMode === 'simple' ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:text-white'
              }`}
            >
              Básico
            </button>
            <button
              onClick={() => {
                setUiMode('advanced')
                try {
                  localStorage.setItem('darkhub.ullm.mode', 'advanced')
                } catch {}
              }}
              className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                uiMode === 'advanced' ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:text-white'
              }`}
            >
              Avançado
            </button>
          </div>
        </div>
        <p className="text-zinc-400">
          Perfil de baixa latência para jogos (manual ou automático). Atalho padrão: <span className="font-mono">Ctrl+F1</span>.
        </p>
      </div>

      {error ? <div className="text-sm text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">{error}</div> : null}

      <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-zinc-500 mb-1 flex items-center gap-2">
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
                placeholder="C:\\Games\\MeuJogo\\game.exe"
                className="flex-1 bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
              />
              <button onClick={pickExe} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors">
                Selecionar
              </button>
            </div>
          </div>

          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={auto}
                onChange={(e) => {
                  markDirty()
                  setAuto(e.target.checked)
                }}
              />
              Ativar automaticamente ao detectar o jogo
            </label>
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
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-zinc-500 mb-1 flex items-center gap-2">
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
              className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
            />
            <div className="text-xs text-zinc-500 mt-2">
              Para aplicar QoS/Nagle/hosts e mexer em processos elevados, rode o DarkHub como Administrador.
            </div>
          </div>

          <div>
            <div className="text-xs text-zinc-500 mb-1 flex items-center gap-2">
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
              className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={overlayEnabled}
                onChange={(e) => {
                  markDirty()
                  setOverlayEnabled(e.target.checked)
                }}
              />
              Widget discreto (canto da tela)
            </label>
            <HelpTip
              title="Widget discreto"
              description="Exibe um mini-widget com ping/cpu/ram/gpu e status do boost."
              sections={[
                { title: 'Estabilidade', content: 'O widget é leve; a medição de GPU (3D) é opcional e fica no modo Avançado.' }
              ]}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={shieldEnabled}
                onChange={(e) => {
                  markDirty()
                  setShieldEnabled(e.target.checked)
                }}
              />
              Latency Shield (alerta de pico)
            </label>
            <HelpTip
              title="Latency Shield"
              description="Monitora o ping e alerta quando houver um pico repentino (Δms acima do normal)."
              sections={[
                { title: 'Parâmetros', content: 'Disparo (Δms) e Ping mínimo (ms) controlam quando o alerta dispara.' },
                { title: 'Saída', content: 'Alerta visual no widget e opcionalmente beep.' }
              ]}
            />
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={shieldBeep}
                onChange={(e) => {
                  markDirty()
                  setShieldBeep(e.target.checked)
                }}
                disabled={!shieldEnabled}
              />
              Beep
            </label>
          </div>
        </div>

        {shieldEnabled ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-zinc-500 mb-1">Disparo (Δms)</div>
              <input
                type="number"
                min={5}
                max={300}
                value={shieldDeltaMs}
                onChange={(e) => {
                  markDirty()
                  setShieldDeltaMs(Math.max(5, Math.min(300, Math.trunc(Number(e.target.value) || 30))))
                }}
                className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Ping mínimo (ms)</div>
              <input
                type="number"
                min={10}
                max={500}
                value={shieldMinMs}
                onChange={(e) => {
                  markDirty()
                  setShieldMinMs(Math.max(10, Math.min(500, Math.trunc(Number(e.target.value) || 80))))
                }}
                className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        ) : null}

        {uiMode === 'advanced' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
          <div>
            <div className="text-xs text-zinc-500 mb-1">Smart Clean (min)</div>
            <input
              type="number"
              min={0}
              max={240}
              value={smartCleanMinutes}
              onChange={(e) => {
                markDirty()
                setSmartCleanMinutes(Math.max(0, Math.min(240, Math.trunc(Number(e.target.value) || 0))))
              }}
              className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
            />
            <div className="text-xs text-zinc-500 mt-1">0 desativa. Recomendado: 10–30.</div>
          </div>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={smartCleanDuringGaming}
                onChange={(e) => {
                  markDirty()
                  setSmartCleanDuringGaming(e.target.checked)
                }}
              />
              Permitir durante o jogo
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={gpuPollingEnabled}
                onChange={(e) => {
                  markDirty()
                  setGpuPollingEnabled(e.target.checked)
                }}
              />
              Medir GPU (3D)
            </label>
          </div>
        </div>
        ) : null}

        {uiMode === 'advanced' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-2">
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={Boolean(tweaks.powerPlanHigh)}
              onChange={(e) => {
                markDirty()
                setTweaks({ ...tweaks, powerPlanHigh: e.target.checked })
              }}
            />
            Power Plan High Performance
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={Boolean(tweaks.timerResolution05)}
              onChange={(e) => {
                markDirty()
                setTweaks({ ...tweaks, timerResolution05: e.target.checked })
              }}
            />
            Timer Resolution 0.5ms
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={Boolean(tweaks.processPriorityHigh)}
              onChange={(e) => {
                markDirty()
                setTweaks({ ...tweaks, processPriorityHigh: e.target.checked })
              }}
            />
            Prioridade High (jogo)
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={Boolean(tweaks.disableMouseAcceleration)}
              onChange={(e) => {
                markDirty()
                setTweaks({ ...tweaks, disableMouseAcceleration: e.target.checked })
              }}
            />
            Desativar Mouse Acceleration
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={Boolean(tweaks.disableFullscreenOptimizations)}
              onChange={(e) => {
                markDirty()
                setTweaks({ ...tweaks, disableFullscreenOptimizations: e.target.checked })
              }}
            />
            Disable Fullscreen Optimizations
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={Boolean(tweaks.gpuHighPerformance)}
              onChange={(e) => {
                markDirty()
                setTweaks({ ...tweaks, gpuHighPerformance: e.target.checked })
              }}
            />
            GPU High Performance (por exe)
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={Boolean(tweaks.dnsCloudflare)}
              onChange={(e) => {
                markDirty()
                setTweaks({ ...tweaks, dnsCloudflare: e.target.checked })
              }}
            />
            DNS Cloudflare + Flush
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={Boolean(tweaks.disableNagle)}
              onChange={(e) => {
                markDirty()
                setTweaks({ ...tweaks, disableNagle: e.target.checked })
              }}
            />
            Desativar Nagle (interface ativa)
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={Boolean(tweaks.qosForExe)}
              onChange={(e) => {
                markDirty()
                setTweaks({ ...tweaks, qosForExe: e.target.checked })
              }}
            />
            QoS (DSCP) por exe
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={Boolean(tweaks.killBackground)}
              onChange={(e) => {
                markDirty()
                setTweaks({ ...tweaks, killBackground: e.target.checked })
              }}
            />
            Encerrar processos de fundo
          </label>
        </div>
        ) : null}

        {uiMode === 'simple' ? (
          <div className="space-y-3">
            <button
              onClick={toggleStable}
              disabled={loading}
              className={`w-full px-4 py-3 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
                status?.ultraEnabled ? 'bg-red-500/10 hover:bg-red-500/20 text-red-200' : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : <Zap size={20} />}
              <span className="font-semibold">{status?.ultraEnabled ? 'Desativar (Estável)' : 'Ativar (Estável)'}</span>
            </button>
            <div className="text-xs text-zinc-500">
              Preset estável: Power Plan + Prioridade do jogo (quando detectado) + Mouse Acceleration OFF. Tweaks agressivos ficam no modo Avançado.
            </div>
            {prioSkipped ? (
              <div className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                Abra o jogo e clique Ativar novamente para aplicar prioridade High.
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
            <button
              onClick={enable}
              disabled={loading}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
              <span>Ativar</span>
            </button>
            <button
              onClick={disable}
              disabled={loading}
              className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-200 rounded-lg transition-colors disabled:opacity-50"
            >
              Desativar
            </button>
            <button
              onClick={boostNow}
              disabled={loading}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              BOOST NOW
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm text-zinc-400">Status</div>
            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
              Native Engine
            </span>
          </div>
          <div className="text-sm text-zinc-200">
            Ultra Mode: <span className="font-semibold">{status?.ultraEnabled ? 'ATIVO' : 'desligado'}</span>
          </div>
          <div className="text-sm text-zinc-200">
            Timer Kernel: <span className="font-mono text-emerald-400">{status?.timerResolutionInfo?.current_ms ? `${status.timerResolutionInfo.current_ms} ms` : '0.5000 ms'}</span>{' '}
            <span className="text-xs text-zinc-500">({status?.timerResolutionInfo?.locked ? 'MMCSS Games Locked' : 'Default'})</span>
          </div>
          <div className="text-sm text-zinc-200">
            Jogo: <span className="font-mono">{status?.game?.name ?? '—'}</span> <span className="text-zinc-500">{status?.game?.pid ? `(${status.game.pid})` : ''}</span>
          </div>
          <div className="text-xs text-zinc-500 break-all">{status?.lastError ? `Erro: ${status.lastError}` : ''}</div>
        </div>

        <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900 space-y-2">
          <div className="text-sm text-zinc-400">Guardian Telemetry (ICMP Realtime)</div>
          <div className="text-sm text-zinc-200">Ping: {metrics?.pingMs != null ? `${metrics.pingMs}ms` : '—'}</div>
          <div className="text-sm text-zinc-200">CPU: {metrics?.cpuPct != null ? `${Number(metrics.cpuPct).toFixed(1)}%` : '—'}</div>
          <div className="text-sm text-zinc-200">RAM: {metrics?.ramPct != null ? `${Number(metrics.ramPct).toFixed(1)}%` : '—'}</div>
          <div className="text-sm text-zinc-200">GPU: {metrics?.gpuPct != null ? `${Number(metrics.gpuPct).toFixed(1)}%` : '—'}</div>
          <div className="text-xs text-zinc-500">
            Coleta em tempo real via socket ICMP e HAL de hardware nativo.
          </div>
        </div>
      </div>

      {lastApplied && typeof lastApplied === 'object' ? (
        <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900 space-y-2">
          <div className="text-sm text-zinc-400">Resultado da aplicação</div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 text-sm">
            {Object.keys(lastApplied).map((k) => {
              const v = lastApplied?.[k]
              const st = typeof v === 'string' ? v : v?.status
              const err = typeof v === 'object' ? v?.error : null
              const color = st === 'ok' ? 'text-emerald-300' : st === 'failed' ? 'text-red-300' : 'text-zinc-300'
              return (
                <div key={k} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-zinc-200">{k}</span>
                    <span className={`${color} whitespace-nowrap`}>{st}</span>
                  </div>
                  {err ? <div className="text-xs text-zinc-500 break-all">{err}</div> : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className="text-xs text-zinc-500">
        {t('dashboard.status')}: {data?.ok ? 'ok' : '—'}
      </div>
    </div>
  )
}
