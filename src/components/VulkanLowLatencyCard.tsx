import React, { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../i18n/I18nProvider'
import { Loader2 } from './icons'
import type { LowLatencyLayerStatus, LowLatencyMode } from '../global'

const MODES: LowLatencyMode[] = ['off', 'antilag', 'reflex']

/**
 * Experimental: implicit Vulkan layer (Korthos low_latency_layer) that gives AMD/Intel GPUs Reflex or Anti-Lag 2
 * in Vulkan games. On NVIDIA it adds nothing (Reflex is native), so the card says so and keeps the switch behind it.
 */
export default function VulkanLowLatencyCard() {
  const { t } = useI18n()
  const api = window.darkhub?.darkpacer
  const [status, setStatus] = useState<LowLatencyLayerStatus | null>(null)
  const [busy, setBusy] = useState<LowLatencyMode | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [allowOnNvidia, setAllowOnNvidia] = useState(false)

  const refresh = useCallback(async () => {
    if (!api?.lowLatencyStatus) return
    try { setStatus(await api.lowLatencyStatus()) } catch { setStatus(null) }
  }, [api])

  useEffect(() => { void refresh() }, [refresh])

  if (!api?.lowLatencyStatus) return null

  const nvidiaOnly = status?.recommendation === 'nativeNvidia'
  const locked = !status || !status.bundled || (nvidiaOnly && !allowOnNvidia && status.mode === 'off')

  const apply = async (mode: LowLatencyMode) => {
    if (busy || mode === status?.mode) return
    setBusy(mode)
    setMessage(null)
    try {
      const r = await api.lowLatencyApply(mode)
      if (r.ok) {
        const text = mode === 'off'
          ? (r.filesLeft ? t('lowlatency.offFilesLeft') : t('lowlatency.offDone'))
          : t('lowlatency.onDone')
        setMessage({ kind: 'ok', text })
      } else {
        const text = r.error === 'in_use' ? t('lowlatency.errInUse')
          : r.error === 'not_bundled' ? t('lowlatency.errNotBundled')
          : `${t('lowlatency.errGeneric')} ${r.error ?? ''}`.trim()
        setMessage({ kind: 'error', text })
      }
    } catch (err) {
      setMessage({ kind: 'error', text: `${t('lowlatency.errGeneric')} ${String((err as Error)?.message ?? err)}` })
    } finally {
      setBusy(null)
      void refresh()
    }
  }

  const gpuLine = status?.gpus?.length ? status.gpus.map((g) => g.name).join(' · ') : t('lowlatency.gpuUnknown')

  return (
    <section className="dh-card p-5 mt-4" data-testid="vk-lowlatency-card">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="dh-section-title">{t('lowlatency.title')}</h2>
        <span className="dh-tag">{t('lowlatency.badge')}</span>
      </div>
      <p className="dh-help mt-0.5">{t('lowlatency.desc')}</p>

      <div className="mt-3 text-[12px] text-zinc-400">
        <span className="text-zinc-500">{t('lowlatency.gpu')}</span> {status ? gpuLine : <Loader2 size={12} className="inline animate-spin" />}
      </div>

      {nvidiaOnly && (
        <div className="mt-3 rounded-md border border-zinc-700/80 bg-zinc-900/60 px-3 py-2 text-[12px] text-zinc-300">
          {t('lowlatency.nvidiaNote')}
          {status?.mode === 'off' && (
            <label className="mt-2 flex items-center gap-2 text-zinc-400">
              <input type="checkbox" checked={allowOnNvidia} onChange={(e) => setAllowOnNvidia(e.target.checked)} />
              {t('lowlatency.nvidiaAllow')}
            </label>
          )}
        </div>
      )}
      {status && !status.bundled && (
        <div className="mt-3 text-[12px] text-amber-300">{t('lowlatency.errNotBundled')}</div>
      )}

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label={t('lowlatency.title')}>
        {MODES.map((m) => {
          const active = status?.mode === m
          const disabled = !!busy || (m !== 'off' && locked)
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => apply(m)}
              className={`text-left rounded-md border px-3 py-2.5 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${active ? 'border-blue-400/60 bg-blue-500/[0.06]' : 'border-zinc-800 hover:bg-zinc-900/70'}`}
            >
              <span className="flex items-center gap-2 text-[13px] font-medium text-zinc-100">
                {busy === m && <Loader2 size={12} className="animate-spin" />}
                {t(`lowlatency.mode.${m}`)}
              </span>
              <span className="block mt-0.5 text-[11.5px] leading-relaxed text-zinc-400">{t(`lowlatency.mode.${m}Desc`)}</span>
            </button>
          )
        })}
      </div>

      {message && (
        <div role="status" className={`mt-3 text-[12px] ${message.kind === 'ok' ? 'text-emerald-300' : 'text-red-300'}`}>{message.text}</div>
      )}

      <ul className="mt-4 list-disc pl-5 space-y-1 text-[11.5px] text-zinc-500">
        <li>{t('lowlatency.noteVulkanOnly')}</li>
        <li>{t('lowlatency.noteRestart')}</li>
        <li>{t('lowlatency.noteAntiCheat')}</li>
        <li>{t('lowlatency.noteCredits')}</li>
      </ul>
    </section>
  )
}
