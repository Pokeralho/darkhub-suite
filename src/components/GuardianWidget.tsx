import React, { useEffect, useRef, useState } from 'react'
import { visibleInterval } from '../utils/visibleInterval'
import { Zap, X } from './icons'

export default function GuardianWidget() {
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
    const stopPolling = visibleInterval(refresh, 1500)
    return () => {
      stopPolling()
      if (alertTimerRef.current) window.clearTimeout(alertTimerRef.current)
    }
  }, [])

  if (!enabled) return null

  const fmt = (n: number | null) => (n == null || !Number.isFinite(n) ? null : n.toFixed(0))

  const rows: Array<{ label: string; value: string | null; unit: string; hot?: boolean }> = [
    { label: 'Ping', value: fmt(ping), unit: 'ms', hot: alert },
    { label: 'CPU', value: fmt(cpu), unit: '%' },
    { label: 'RAM', value: fmt(ram), unit: '%' },
    { label: 'GPU', value: fmt(gpu), unit: '%' }
  ]

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-in">
      <div
        role="status"
        className={`w-60 rounded-xl border bg-zinc-950/95 dh-raised transition-colors ${
          alert ? 'border-red-500/50' : 'border-zinc-800'
        }`}
      >
        <div className="flex items-center justify-between pl-3.5 pr-1.5 py-2 border-b border-zinc-800/80">
          <div className="flex items-center gap-2 text-[12px]">
            <span className={`w-1.5 h-1.5 rounded-full ${ultraOn ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
            <Zap size={13} className={ultraOn ? 'text-zinc-200' : 'text-zinc-500'} />
            <span className={ultraOn ? 'font-medium text-zinc-100' : 'text-zinc-400'}>{ultraOn ? 'Boost on' : 'Boost off'}</span>
          </div>
          <button
            onClick={disableOverlay}
            aria-label="Fechar widget"
            className="p-1 rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X size={13} />
          </button>
        </div>

        <dl className="grid grid-cols-4 divide-x divide-zinc-800/80">
          {rows.map((r) => (
            <div key={r.label} className="px-2.5 py-2 min-w-0">
              <dt className="text-[10.5px] text-zinc-500">{r.label}</dt>
              <dd className={`mt-0.5 font-mono text-[13px] tabular-nums ${r.hot ? 'text-red-300' : 'text-zinc-50'}`}>
                {r.value != null ? <>{r.value}<span className="text-[10.5px] text-zinc-500">{r.unit}</span></> : <span className="text-zinc-600">--</span>}
              </dd>
            </div>
          ))}
        </dl>

        {alert ? <div className="px-3.5 py-1.5 border-t border-zinc-800/80 text-[11px] text-red-300">Latency Shield: pico de ping detectado</div> : null}
      </div>
    </div>
  )
}
