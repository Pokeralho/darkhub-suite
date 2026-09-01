import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import {
  Activity,
  Play,
  Square,
  Sliders,
  Layers,
  Sparkles,
  Zap,
  Eye,
  EyeOff,
  ShieldCheck,
  MousePointer,
  HelpCircle,
  TrendingDown,
  Monitor,
  Flame,
  CheckCircle2
} from 'lucide-react'

export default function FramePacerPage() {
  const { t } = useI18n()
  const [isRunning, setIsRunning] = useState(false)
  const [targetFps, setTargetFps] = useState<number>(144)
  const [pacingMode, setPacingMode] = useState<'flatline' | 'reflex' | 'uncapped'>('flatline')
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [clickThrough, setClickThrough] = useState(false)

  const [metrics, setMetrics] = useState<{
    currentFps: number
    avgFps: number
    low1Percent: number
    low01Percent: number
    currentFrametimeMs: number
    frametimeJitterMs: number
    stutterCount: number
    activeGame?: string | null
    history: number[]
  }>({
    currentFps: 0,
    avgFps: 0,
    low1Percent: 0,
    low01Percent: 0,
    currentFrametimeMs: 0,
    frametimeJitterMs: 0,
    stutterCount: 0,
    activeGame: 'Sistema Global',
    history: []
  })

  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    let active = true

    if (window.darkhub?.framepacer) {
      window.darkhub.framepacer.getMetrics().then((m) => {
        if (!active || !m) return
        setIsRunning(m.isRunning)
        if (m.targetFps) setTargetFps(m.targetFps)
        if (m.pacingMode) setPacingMode(m.pacingMode as any)
        setMetrics(m)
      }).catch(() => {})

      window.darkhub.framepacer.getOverlayStatus().then((s) => {
        if (!active || !s) return
        setOverlayOpen(s.isOpen)
        setClickThrough(s.clickThrough)
      }).catch(() => {})

      const unsub = window.darkhub.framepacer.onMetrics((data) => {
        if (!active || !data) return
        setIsRunning(data.isRunning)
        setMetrics(data)
      })

      return () => {
        active = false
        unsub()
      }
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)

    const history = metrics.history || []
    if (history.length < 2) {

      ctx.strokeStyle = 'rgba(71, 85, 105, 0.4)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, h / 2)
      ctx.lineTo(w, h / 2)
      ctx.stroke()
      return
    }

    const targetFt = targetFps > 0 ? 1000 / targetFps : 16.66
    const maxScaleMs = Math.max(25, targetFt * 2.2)

    const targetY = h - (targetFt / maxScaleMs) * h
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(0, targetY)
    ctx.lineTo(w, targetY)
    ctx.stroke()
    ctx.setLineDash([])

    const step = w / (history.length - 1)
    ctx.beginPath()
    for (let i = 0; i < history.length; i++) {
      const ft = history[i]
      const x = i * step
      const y = Math.max(4, Math.min(h - 4, h - (ft / maxScaleMs) * h))
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }

    ctx.strokeStyle = '#38bdf8'
    ctx.lineWidth = 2.2
    ctx.stroke()

    ctx.lineTo(w, h)
    ctx.lineTo(0, h)
    ctx.closePath()
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.25)')
    grad.addColorStop(1, 'rgba(56, 189, 248, 0.0)')
    ctx.fillStyle = grad
    ctx.fill()

    for (let i = 0; i < history.length; i++) {
      const ft = history[i]
      if (ft > targetFt * 1.35) {
        const x = i * step
        const y = Math.max(4, Math.min(h - 4, h - (ft / maxScaleMs) * h))
        ctx.fillStyle = '#ef4444'
        ctx.beginPath()
        ctx.arc(x, y, 3, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }, [metrics.history, targetFps])

  const handleToggleEngine = async () => {
    if (isRunning) {
      await window.darkhub?.framepacer?.stop?.()
      setIsRunning(false)
    } else {
      await window.darkhub?.framepacer?.start?.({ targetFps, pacingMode })
      setIsRunning(true)
    }
  }

  const handleUpdateFps = async (fps: number) => {
    setTargetFps(fps)
    if (window.darkhub?.framepacer) {
      await window.darkhub.framepacer.updateConfig({ targetFps: fps, pacingMode })
    }
  }

  const handleUpdateMode = async (mode: 'flatline' | 'reflex' | 'uncapped') => {
    setPacingMode(mode)
    if (window.darkhub?.framepacer) {
      await window.darkhub.framepacer.updateConfig({ targetFps, pacingMode: mode })
    }
  }

  const handleToggleOverlay = async () => {
    if (window.darkhub?.framepacer) {
      const res = await window.darkhub.framepacer.toggleOverlay()
      setOverlayOpen(res?.isVisible ?? !overlayOpen)
    }
  }

  const handleToggleClickThrough = async () => {
    const next = !clickThrough
    setClickThrough(next)
    if (window.darkhub?.framepacer) {
      await window.darkhub.framepacer.setOverlayClickThrough(next)
    }
  }

  const fpsPresets = [
    { label: '60 FPS', val: 60, sub: '16.6ms' },
    { label: '75 FPS', val: 75, sub: '13.3ms' },
    { label: '120 FPS', val: 120, sub: '8.3ms' },
    { label: '144 FPS', val: 144, sub: '6.9ms' },
    { label: '165 FPS', val: 165, sub: '6.0ms' },
    { label: '240 FPS', val: 240, sub: '4.1ms' },
    { label: '360 FPS', val: 360, sub: '2.7ms' },
    { label: 'Desbloqueado', val: 0, sub: 'Monitor' }
  ]

  const targetFrametime = targetFps > 0 ? (1000 / targetFps).toFixed(2) : '0.00'

  return (
    <div className="space-y-6 w-full animate-in fade-in duration-300 pb-8">
      {}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="p-2 bg-sky-500/10 border border-sky-500/20 rounded-xl text-sky-400">
              <Activity size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-white tracking-tight">DarkPacer</h1>
                <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  DXGI Native Hook
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Pacing de Quadros & Limitador de FPS de Baixo Nível com Injeção Direta em DXGI SwapChain.
              </p>
            </div>
          </div>
        </div>

        {}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleToggleOverlay}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
              overlayOpen
                ? 'bg-sky-600 text-white border-sky-500 shadow-lg shadow-sky-500/20'
                : 'bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 border-zinc-700 hover:border-zinc-600'
            }`}
          >
            {overlayOpen ? <Eye size={15} /> : <EyeOff size={15} />}
            <span>{overlayOpen ? t('framepacer.overlayActive', 'Overlay Ativo (Ctrl+Shift+F)') : t('framepacer.openOverlay', 'Abrir Overlay Flutuante')}</span>
          </button>

          <button
            onClick={handleToggleEngine}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg ${
              isRunning
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/25'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/25'
            }`}
          >
            {isRunning ? <Square size={14} className="fill-white" /> : <Play size={14} className="fill-white" />}
            <span>{isRunning ? t('framepacer.running', 'FramePacer Rodando') : t('framepacer.activate', 'Ativar FramePacer')}</span>
          </button>
        </div>
      </div>

      {}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {}
        <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('framepacer.liveTelemetry', 'Telemetria ao Vivo')}</span>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-zinc-950 text-[11px] font-mono text-zinc-300 border border-zinc-800">
              <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
              {metrics.activeGame || 'Sistema'}
            </div>
          </div>

          {}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 flex flex-col justify-between">
              <span className="text-[11px] text-zinc-500 font-semibold uppercase">{t('framepacer.framerate', 'Taxa de Quadros')}</span>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-black font-mono text-white tracking-tight">
                  {isRunning ? metrics.currentFps : '--'}
                </span>
                <span className="text-xs font-bold text-zinc-500">FPS</span>
              </div>
              <span className="text-[10px] text-zinc-500 mt-1">{t('framepacer.average', 'Média:')} {isRunning ? metrics.avgFps : '--'}</span>
            </div>

            <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 flex flex-col justify-between">
              <span className="text-[11px] text-zinc-500 font-semibold uppercase">{t('framepacer.currentFrametime', 'Frametime Atual')}</span>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-black font-mono text-sky-400 tracking-tight">
                  {isRunning ? metrics.currentFrametimeMs : '--'}
                </span>
                <span className="text-xs font-bold text-zinc-500">ms</span>
              </div>
              <span className="text-[10px] text-sky-500/80 mt-1">{t('framepacer.target', 'Alvo:')} {targetFrametime} ms</span>
            </div>
          </div>

          {}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800/60">
              <div className="text-[10px] font-bold text-amber-400 uppercase">1% Low</div>
              <div className="text-base font-black font-mono text-zinc-100 mt-0.5">
                {isRunning ? Math.round(metrics.low1Percent) : '--'} <span className="text-[9px] text-zinc-500">FPS</span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800/60">
              <div className="text-[10px] font-bold text-purple-400 uppercase">Jitter</div>
              <div className="text-base font-black font-mono text-zinc-100 mt-0.5">
                ±{isRunning ? metrics.frametimeJitterMs : '0.0'}<span className="text-[9px] text-zinc-500">ms</span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800/60">
              <div className="text-[10px] font-bold text-rose-400 uppercase">Stutters</div>
              <div className="text-base font-black font-mono text-zinc-100 mt-0.5">
                {isRunning ? metrics.stutterCount : '0'}
              </div>
            </div>
          </div>
        </div>

        {}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-3 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">{t('framepacer.oscilloscope', 'Osciloscópio de Frametime (ms)')}</span>
              <span className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                {t('framepacer.target', 'Alvo')} {targetFrametime}ms
              </span>
            </div>
            <span className="text-[11px] text-zinc-500 font-mono">{t('framepacer.pacingHelp', 'Linha reta = Pacing perfeito')}</span>
          </div>

          <div className="w-full h-48 bg-zinc-950 rounded-xl border border-zinc-800/80 p-2.5 relative overflow-hidden flex items-center justify-center">
            <canvas ref={canvasRef} width={640} height={170} className="w-full h-full block" />
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1">
            <span>0ms</span>
            <span className="flex items-center gap-1.5 text-sky-400/80">
              <span className="w-3 h-0.5 bg-sky-400 inline-block" /> {t('framepacer.target', 'Alvo')} {targetFps > 0 ? `${targetFps} FPS` : t('framepacer.unlocked', '0 FPS (Desbloqueado)')}
            </span>
            <span>{targetFps > 0 ? `${(1000 / targetFps * 2.2).toFixed(1)}ms` : '33.3ms'}</span>
          </div>
        </div>
      </div>

      {}
      <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sliders size={18} className="text-sky-400" /> {t('framepacer.fpsTargetTitle', 'Limite de FPS Alvo (Frame Rate Target)')}
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              {t('framepacer.fpsTargetDesc', 'Escolha a taxa ideal para travar a entrega de quadros em uma linha reta sem micro-stutters.')}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={500}
              value={targetFps}
              onChange={(e) => handleUpdateFps(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-24 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-center text-lg font-black font-mono text-sky-400 focus:outline-none focus:border-sky-500"
            />
            <span className="text-xs font-bold text-zinc-500">FPS</span>
          </div>
        </div>

        {}
        <div className="space-y-2">
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={targetFps}
            onChange={(e) => handleUpdateFps(parseInt(e.target.value) || 0)}
            className="w-full h-2 bg-zinc-950 rounded-lg appearance-none cursor-pointer accent-sky-500"
          />
          <div className="flex justify-between text-[10px] font-mono text-zinc-500 px-1">
            <span>{t('framepacer.unlocked', '0 FPS (Desbloqueado)')}</span>
            <span>60 FPS</span>
            <span>120 FPS</span>
            <span>144 FPS</span>
            <span>240 FPS</span>
            <span>360 FPS</span>
          </div>
        </div>

        {}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
          {fpsPresets.map((p) => {
            const active = targetFps === p.val
            return (
              <button
                key={p.val}
                onClick={() => handleUpdateFps(p.val)}
                className={`p-3 rounded-xl border flex flex-col items-center justify-center transition-all ${
                  active
                    ? 'bg-sky-500/20 border-sky-500 text-white shadow-md shadow-sky-500/20'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                }`}
              >
                <span className="text-xs font-black">{p.label}</span>
                <span className="text-[10px] font-mono text-zinc-500 mt-0.5">{p.sub}</span>
              </button>
            )
          })}
        </div>
      </div>

      {}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {}
        <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Zap size={18} className="text-sky-400" /> {t('framepacer.pacingModeTitle', 'Modo de Frame Pacing')}
          </h3>
          <p className="text-xs text-zinc-400">
            {t('framepacer.pacingModeDesc', 'Selecione a estratégia de entrega de quadros para a GPU e CPU.')}
          </p>

          <div className="space-y-3">
            {[
              {
                id: 'flatline',
                title: t('framepacer.mode.flatline.title', 'Flatline Smooth (Recomendado)'),
                desc: t('framepacer.mode.flatline.desc', 'Trava os frametimes em linha perfeitamente reta com relógio Win32 multimídia. Elimina stutters em qualquer jogo.'),
                badge: t('framepacer.mode.flatline.badge', 'Máxima Fluidez')
              },
              {
                id: 'reflex',
                title: t('framepacer.mode.reflex.title', 'Reflex Low-Latency'),
                desc: t('framepacer.mode.reflex.desc', 'Prioriza a resposta instantânea e o menor input lag, permitindo micro-oscilações para entrega imediata.'),
                badge: t('framepacer.mode.reflex.badge', 'Competitivo')
              },
              {
                id: 'uncapped',
                title: t('framepacer.mode.uncapped.title', 'Apenas Monitor (Sem Limite)'),
                desc: t('framepacer.mode.uncapped.desc', 'Não limita o FPS do jogo. Apenas captura a telemetria e alimenta o gráfico osciloscópio do overlay.'),
                badge: t('framepacer.mode.uncapped.badge', 'Benchmark')
              }
            ].map((m) => {
              const active = pacingMode === m.id
              return (
                <div
                  key={m.id}
                  onClick={() => handleUpdateMode(m.id as any)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start justify-between gap-3 ${
                    active
                      ? 'bg-sky-500/10 border-sky-500/60 shadow-sm'
                      : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${active ? 'text-sky-300' : 'text-white'}`}>{m.title}</span>
                      <span className="px-2 py-0.2 text-[9px] font-bold uppercase rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                        {m.badge}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">{m.desc}</p>
                  </div>
                  {active && <CheckCircle2 size={18} className="text-sky-400 shrink-0 mt-0.5" />}
                </div>
              )
            })}
          </div>
        </div>

        {}
        <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Layers size={18} className="text-sky-400" /> HUD Overlay Flutuante
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Personalize o gráfico in-game transparente sobreposto ao jogo.
            </p>

            <div className="space-y-3 mt-4">
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-950 border border-zinc-800">
                <div className="flex items-center gap-3">
                  <MousePointer size={18} className="text-zinc-400" />
                  <div>
                    <div className="text-xs font-bold text-zinc-200">Modo Click-Through</div>
                    <div className="text-[10px] text-zinc-500">Permite clicar através do overlay sem interferir no jogo</div>
                  </div>
                </div>
                <button
                  onClick={handleToggleClickThrough}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                    clickThrough ? 'bg-sky-600 text-white' : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {clickThrough ? 'Ativado' : 'Desativado'}
                </button>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-zinc-200">Atalho Global</div>
                  <div className="text-[10px] text-zinc-500">Pressione durante o jogo para exibir/ocultar</div>
                </div>
                <kbd className="px-2.5 py-1 bg-zinc-900 border border-zinc-700 rounded-lg text-xs font-mono font-bold text-sky-400 shadow-sm">
                  Ctrl + Shift + F
                </kbd>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-zinc-200">Arrastar & Posicionar</div>
                  <div className="text-[10px] text-zinc-500">Arraste a barra superior do overlay para onde preferir</div>
                </div>
                <span className="text-xs font-semibold text-zinc-400">Totalmente Livre</span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-800 flex items-center justify-between">
            <span className="text-xs text-zinc-500 flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-emerald-400" /> In-Game HUD Nativo
            </span>
            <button
              onClick={handleToggleOverlay}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-sky-600/20"
            >
              {overlayOpen ? 'Ocultar Overlay' : 'Lançar Overlay Agora'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
