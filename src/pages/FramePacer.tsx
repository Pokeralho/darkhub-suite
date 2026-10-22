import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import {
  Play,
  Square,
  Layers,
  Eye,
  EyeOff,
  MousePointer,
  Loader2
} from '../components/icons'
import PageHeader from '../components/ui/PageHeader'

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
    low01Percent: number | null
    hasLiveTelemetry?: boolean
    currentFrametimeMs: number
    frametimeJitterMs: number
    stutterCount: number
    activeGame?: string | null
    history: number[]
  }>({
    currentFps: 0,
    avgFps: 0,
    low1Percent: 0,
    low01Percent: null,
    hasLiveTelemetry: false,
    currentFrametimeMs: 0,
    frametimeJitterMs: 0,
    stutterCount: 0,
    activeGame: 'Sistema Global',
    history: []
  })

  const live = isRunning && metrics.hasLiveTelemetry === true
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

      ctx.strokeStyle = 'rgba(64, 72, 88, 0.6)'
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
    ctx.strokeStyle = 'rgba(160, 212, 236, 0.35)'
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

    ctx.strokeStyle = '#a0d4ec'
    ctx.lineWidth = 1.6
    ctx.stroke()

    ctx.lineTo(w, h)
    ctx.lineTo(0, h)
    ctx.closePath()
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, 'rgba(160, 212, 236, 0.14)')
    grad.addColorStop(1, 'rgba(160, 212, 236, 0.0)')
    ctx.fillStyle = grad
    ctx.fill()

    for (let i = 0; i < history.length; i++) {
      const ft = history[i]
      if (ft > targetFt * 1.35) {
        const x = i * step
        const y = Math.max(4, Math.min(h - 4, h - (ft / maxScaleMs) * h))
        ctx.fillStyle = '#f2777a'
        ctx.beginPath()
        ctx.arc(x, y, 2.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }, [metrics.history, targetFps])

  const [engineBusy, setEngineBusy] = useState(false)

  const handleToggleEngine = async () => {
    if (engineBusy) return
    setEngineBusy(true)
    try {
      if (isRunning) {
        const res: any = await window.darkhub?.framepacer?.stop?.()
        setIsRunning(typeof res?.isRunning === 'boolean' ? res.isRunning : false)
      } else {
        const res: any = await window.darkhub?.framepacer?.start?.({ targetFps, pacingMode })
        setIsRunning(typeof res?.isRunning === 'boolean' ? res.isRunning : true)
      }
    } catch (e) {
      console.warn('[FramePacer] toggle failed', e)
    } finally {
      setEngineBusy(false)
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

  const modes = [
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
  ]

  const dash = <span className="text-zinc-600">--</span>

  return (
    <div className="w-full space-y-5 pb-8">
      <PageHeader
        title="DarkPacer"
        subtitle={<>
          Pacing de Quadros & Limitador de FPS de Baixo Nível com Injeção Direta em DXGI SwapChain.
          <span className="dh-tag ml-2">dxgi native hook</span>
        </>}
        actions={<>
          <button type="button" onClick={handleToggleOverlay} aria-pressed={overlayOpen} className={`dh-btn ${overlayOpen ? 'border-blue-400/60 text-blue-200' : ''}`}>
            {overlayOpen ? <Eye size={14} /> : <EyeOff size={14} />}
            <span>{overlayOpen ? t('framepacer.overlayActive', 'Overlay Ativo (Ctrl+Shift+F)') : t('framepacer.openOverlay', 'Abrir Overlay Flutuante')}</span>
          </button>
          <button
            type="button"
            onClick={handleToggleEngine}
            disabled={engineBusy}
            aria-busy={engineBusy}
            aria-pressed={isRunning}
            className={`dh-btn disabled:cursor-wait ${isRunning ? '' : 'dh-btn-primary'}`}
          >
            {engineBusy ? <Loader2 size={14} className="animate-spin" /> : isRunning ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> : <Play size={14} />}
            <span>{isRunning ? t('framepacer.running', 'FramePacer Rodando') : t('framepacer.activate', 'Ativar FramePacer')}</span>
            {isRunning && !engineBusy && <Square size={12} className="text-zinc-500" />}
          </button>
        </>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Telemetry */}
        <section className="dh-card p-5 flex flex-col">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
            <h2 className="dh-section-title">{t('framepacer.liveTelemetry', 'Telemetria ao Vivo')}</h2>
            <span className="inline-flex items-center gap-1.5 text-[11.5px] font-mono text-zinc-400 min-w-0">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${live ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
              <span className="truncate">{metrics.activeGame || 'Sistema'}</span>
            </span>
          </div>

          <dl className="grid grid-cols-2 divide-x divide-zinc-800/80 py-4">
            <div className="pr-4">
              <dt className="text-[11.5px] text-zinc-500">{t('framepacer.framerate', 'Taxa de Quadros')}</dt>
              <dd className="mt-2 font-mono text-[30px] leading-none tracking-tight text-zinc-50">
                {live ? metrics.currentFps : dash}<span className="ml-1 text-[12px] text-zinc-500">FPS</span>
              </dd>
              <dd className="mt-2 text-[11px] text-zinc-500">{t('framepacer.average', 'Média:')} <span className="font-mono text-zinc-300">{live ? metrics.avgFps : '--'}</span></dd>
            </div>
            <div className="pl-4">
              <dt className="text-[11.5px] text-zinc-500">{t('framepacer.currentFrametime', 'Frametime Atual')}</dt>
              <dd className="mt-2 font-mono text-[30px] leading-none tracking-tight text-blue-200">
                {live ? metrics.currentFrametimeMs : dash}<span className="ml-1 text-[12px] text-zinc-500">ms</span>
              </dd>
              <dd className="mt-2 text-[11px] text-zinc-500">{t('framepacer.target', 'Alvo:')} <span className="font-mono text-zinc-300">{targetFrametime}</span> ms</dd>
            </div>
          </dl>

          <dl className="mt-auto grid grid-cols-3 divide-x divide-zinc-800/80 border-t border-zinc-800/80 pt-3">
            <div className="pr-3">
              <dt className="text-[11px] text-zinc-500">1% Low</dt>
              <dd className="mt-1 font-mono text-[15px] text-zinc-100">
                {live ? Math.round(metrics.low1Percent) : '--'} <span className="text-[10.5px] text-zinc-500">FPS</span>
              </dd>
              <dd className="font-mono text-[10.5px] text-zinc-500">0.1%: {live && metrics.low01Percent != null ? Math.round(metrics.low01Percent) : '--'}</dd>
            </div>
            <div className="px-3">
              <dt className="text-[11px] text-zinc-500">Jitter</dt>
              <dd className="mt-1 font-mono text-[15px] text-zinc-100">
                {live ? <>±{metrics.frametimeJitterMs}</> : '--'}<span className="text-[10.5px] text-zinc-500"> ms</span>
              </dd>
            </div>
            <div className="pl-3">
              <dt className="text-[11px] text-zinc-500">Stutters</dt>
              <dd className={`mt-1 font-mono text-[15px] ${live && metrics.stutterCount > 0 ? 'text-amber-300' : 'text-zinc-100'}`}>
                {live ? metrics.stutterCount : '--'}
              </dd>
            </div>
          </dl>
        </section>

        {/* Oscilloscope */}
        <section className="lg:col-span-2 dh-card p-5 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-baseline gap-3">
              <h2 className="dh-section-title">{t('framepacer.oscilloscope', 'Osciloscópio de Frametime (ms)')}</h2>
              <span className="dh-tag">{t('framepacer.target', 'Alvo')} {targetFrametime}ms</span>
            </div>
            <span className="text-[11.5px] text-zinc-500">{t('framepacer.pacingHelp', 'Linha reta = Pacing perfeito')}</span>
          </div>

          <div className="relative w-full h-48 rounded-lg border border-zinc-800/80 bg-zinc-950 p-2 overflow-hidden">
            <canvas ref={canvasRef} width={640} height={170} className="w-full h-full block" />
            {!live && (
              <p className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="px-2 bg-zinc-950 text-[12px] text-zinc-500">{isRunning ? t('framepacer.waitingTelemetry', 'Aguardando telemetria do jogo...') : t('framepacer.inactiveHint', 'Ative o FramePacer para ver o frametime ao vivo.')}</span>
              </p>
            )}
          </div>

          <div className="flex items-center justify-between font-mono text-[11px] text-zinc-500">
            <span>0ms</span>
            <span className="flex items-center gap-1.5 text-zinc-400">
              <span className="w-3 border-t border-dashed border-blue-300 inline-block" /> {t('framepacer.target', 'Alvo')} {targetFps > 0 ? `${targetFps} FPS` : t('framepacer.unlocked', '0 FPS (Desbloqueado)')}
            </span>
            <span>{targetFps > 0 ? `${(1000 / targetFps * 2.2).toFixed(1)}ms` : '33.3ms'}</span>
          </div>
        </section>
      </div>

      {/* FPS target */}
      <section className="dh-card p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="dh-section-title">{t('framepacer.fpsTargetTitle', 'Limite de FPS Alvo (Frame Rate Target)')}</h2>
            <p className="dh-help mt-0.5 max-w-[75ch]">
              {t('framepacer.fpsTargetDesc', 'Escolha a taxa ideal para travar a entrega de quadros em uma linha reta sem micro-stutters.')}
            </p>
          </div>
          <label className="flex items-center gap-2 shrink-0">
            <input
              type="number"
              min={0}
              max={500}
              value={targetFps}
              onChange={(e) => handleUpdateFps(Math.max(0, parseInt(e.target.value) || 0))}
              className="dh-input w-24 text-center font-mono text-[15px]"
              aria-label="FPS"
            />
            <span className="text-[12px] text-zinc-500">FPS</span>
          </label>
        </div>

        <div className="space-y-2">
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={targetFps}
            onChange={(e) => handleUpdateFps(parseInt(e.target.value) || 0)}
            className="w-full"
            aria-label={t('framepacer.fpsTargetTitle', 'Limite de FPS Alvo (Frame Rate Target)')}
          />
          <div className="flex justify-between text-[10.5px] font-mono text-zinc-600">
            <span>{t('framepacer.unlocked', '0 FPS (Desbloqueado)')}</span>
            <span>60</span>
            <span>120</span>
            <span>144</span>
            <span>240</span>
            <span>360</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 rounded-lg border border-zinc-800 overflow-hidden divide-x divide-zinc-800">
          {fpsPresets.map((p) => {
            const active = targetFps === p.val
            return (
              <button
                key={p.val}
                type="button"
                onClick={() => handleUpdateFps(p.val)}
                aria-pressed={active}
                className={`py-2.5 flex flex-col items-center justify-center transition-colors duration-150 ${
                  active ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-300 hover:bg-zinc-800/70'
                }`}
              >
                <span className="text-[12.5px] font-medium">{p.label}</span>
                <span className={`text-[10.5px] font-mono mt-0.5 ${active ? 'text-zinc-600' : 'text-zinc-500'}`}>{p.sub}</span>
              </button>
            )
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pacing mode */}
        <section className="dh-card p-5">
          <h2 className="dh-section-title">{t('framepacer.pacingModeTitle', 'Modo de Frame Pacing')}</h2>
          <p className="dh-help mt-0.5">{t('framepacer.pacingModeDesc', 'Selecione a estratégia de entrega de quadros para a GPU e CPU.')}</p>

          <div role="radiogroup" className="mt-4 rounded-lg border border-zinc-800/80 divide-y divide-zinc-800/80 overflow-hidden">
            {modes.map((m) => {
              const active = pacingMode === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => handleUpdateMode(m.id as any)}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors duration-150 ${active ? 'bg-blue-500/[0.06]' : 'hover:bg-zinc-900/70'}`}
                >
                  <span className={`mt-[3px] w-3.5 h-3.5 rounded-full border shrink-0 flex items-center justify-center ${active ? 'border-blue-300' : 'border-zinc-600'}`}>
                    {active && <span className="w-1.5 h-1.5 rounded-full bg-blue-300" />}
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className={`text-[13px] font-medium ${active ? 'text-zinc-50' : 'text-zinc-200'}`}>{m.title}</span>
                      <span className="dh-tag">{m.badge}</span>
                    </span>
                    <span className="block mt-0.5 text-[12px] leading-relaxed text-zinc-400">{m.desc}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        {/* HUD overlay */}
        <section className="dh-card p-5 flex flex-col">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="dh-section-title">HUD Overlay Flutuante</h2>
            <span className="dh-tag">in-game hud</span>
          </div>
          <p className="dh-help mt-0.5">Personalize o gráfico in-game transparente sobreposto ao jogo.</p>

          <div className="mt-4 divide-y divide-zinc-800/80 border-y border-zinc-800/80">
            <div className="flex items-center justify-between gap-3 py-3">
              <div className="flex items-start gap-3 min-w-0">
                <MousePointer size={16} className="text-zinc-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-[12.5px] font-medium text-zinc-200">Modo Click-Through</div>
                  <div className="text-[11.5px] text-zinc-500">Permite clicar através do overlay sem interferir no jogo</div>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={clickThrough}
                onClick={handleToggleClickThrough}
                className={`dh-btn dh-btn-sm shrink-0 ${clickThrough ? 'border-blue-400/60 text-blue-200' : 'text-zinc-400'}`}
              >
                {clickThrough ? 'Ativado' : 'Desativado'}
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium text-zinc-200">Atalho Global</div>
                <div className="text-[11.5px] text-zinc-500">Pressione durante o jogo para exibir/ocultar</div>
              </div>
              <kbd className="font-mono text-[12px] text-zinc-200 shrink-0">Ctrl + Shift + F</kbd>
            </div>

            <div className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium text-zinc-200">Arrastar & Posicionar</div>
                <div className="text-[11.5px] text-zinc-500">Arraste a barra superior do overlay para onde preferir</div>
              </div>
              <span className="text-[12px] text-zinc-400 shrink-0">Totalmente Livre</span>
            </div>
          </div>

          <div className="mt-auto pt-4 flex justify-end">
            <button type="button" onClick={handleToggleOverlay} className="dh-btn">
              <Layers size={14} />
              {overlayOpen ? 'Ocultar Overlay' : 'Lançar Overlay Agora'}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
