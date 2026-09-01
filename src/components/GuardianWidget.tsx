import { useI18n } from '../i18n/I18nProvider';
import React, { useEffect, useRef, useState } from 'react'
import { Zap, X } from 'lucide-react'

export default function GuardianWidget() {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(false)
  const [ultraOn, setUltraOn] = useState(false)
  const [ping, setPing] = useState<number | null>(null)
  const [cpu, setCpu] = useState<number | null>(null)
  const [ram, setRam] = useState<number | null>(null)
  const [gpu, setGpu] = useState<number | null>(null)
  const [shieldOn, setShieldOn] = useState(false)
  const [shieldDelta, setShieldDelta] = useState(30)
  const [shieldMin, setShieldMin] = useState(80)
  const [shieldBeep, setShieldBeep] = useState(false)
  const [alert, setAlert] = useState(false)

  const lastPingRef = useRef<number | null>(null)
  const lastBeepAtRef = useRef<number>(0)
  const alertTimerRef = useRef<number | null>(null)

  const beep = () => {
    try {
      const now = Date.now()
      if (now - lastBeepAtRef.current < 2500) return
      lastBeepAtRef.current = now

      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 880
      gain.gain.value = 0.04
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      setTimeout(() => {
        osc.stop()
        ctx.close().catch(() => {})
      }, 140)
    } catch {}
  }

  const refresh = async () => {
    if (!window.darkhub?.latency) return
    try {
      const res = await window.darkhub.latency.getConfig()
      if (!res?.ok) return
      const cfg = res.config ?? {}
      const st = res.status ?? {}
      const m = res.metrics ?? {}

      const nextShieldOn = Boolean(cfg.shieldEnabled)
      const nextShieldDelta = Number(cfg.shieldDeltaMs ?? 30)
      const nextShieldMin = Number(cfg.shieldMinMs ?? 80)
      const nextShieldBeep = Boolean(cfg.shieldBeep)

      setEnabled(Boolean(cfg.overlayEnabled))
      setShieldOn(nextShieldOn)
      setShieldDelta(nextShieldDelta)
      setShieldMin(nextShieldMin)
      setShieldBeep(nextShieldBeep)

      setUltraOn(Boolean(st.ultraEnabled))
      setPing(m.pingMs != null ? Number(m.pingMs) : null)
      setCpu(m.cpuPct != null ? Number(m.cpuPct) : null)
      setRam(m.ramPct != null ? Number(m.ramPct) : null)
      setGpu(m.gpuPct != null ? Number(m.gpuPct) : null)

      const currentPing = m.pingMs != null ? Number(m.pingMs) : null
      const last = lastPingRef.current
      lastPingRef.current = currentPing

      if (nextShieldOn && currentPing != null && last != null) {
        const delta = currentPing - last
        if (delta >= nextShieldDelta && currentPing >= nextShieldMin) {
          setAlert(true)
          if (nextShieldBeep) beep()
          if (alertTimerRef.current) window.clearTimeout(alertTimerRef.current)
          alertTimerRef.current = window.setTimeout(() => {
            setAlert(false)
            alertTimerRef.current = null
          }, 3000)
        }
      }
    } catch {}
  }

  const disableOverlay = async () => {
    if (!window.darkhub?.latency) return
    await window.darkhub.latency.setConfig({ overlayEnabled: false })
    setEnabled(false)
  }

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 1000)
    return () => {
      clearInterval(id)
      if (alertTimerRef.current) window.clearTimeout(alertTimerRef.current)
    }
  }, [])

  if (!enabled) return null

  const fmt = (n: number | null) => (n == null || !Number.isFinite(n) ? '—' : n.toFixed(0))

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div
        className={`w-64 rounded-xl border bg-zinc-950/90 backdrop-blur px-4 py-3 ${
          alert ? 'border-red-500/40 shadow-[0_0_0_1px_rgba(239,68,68,0.25)]' : 'border-zinc-800'
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm text-zinc-200">
            <Zap size={16} className={ultraOn ? 'text-emerald-400' : 'text-zinc-500'} />
            <span className="font-semibold">{ultraOn ? 'BOOST ON' : 'Boost off'}</span>
          </div>
          <button onClick={disableOverlay} className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <div className="text-zinc-500">Ping</div>
          <div className={`text-right tabular-nums ${alert ? 'text-red-300 font-semibold' : 'text-zinc-200'}`}>{ping != null ? `${fmt(ping)}ms` : '—'}</div>
          <div className="text-zinc-500">CPU</div>
          <div className="text-right tabular-nums text-zinc-200">{cpu != null ? `${fmt(cpu)}%` : '—'}</div>
          <div className="text-zinc-500">RAM</div>
          <div className="text-right tabular-nums text-zinc-200">{ram != null ? `${fmt(ram)}%` : '—'}</div>
          <div className="text-zinc-500">GPU</div>
          <div className="text-right tabular-nums text-zinc-200">{gpu != null ? `${fmt(gpu)}%` : '—'}</div>
        </div>

        {alert ? <div className="mt-2 text-xs text-red-200">Latency Shield: pico de ping detectado</div> : null}
      </div>
    </div>
  )
}
