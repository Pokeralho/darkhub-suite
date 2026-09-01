import React from 'react'
import { GameProfile, GameProfileTweaks } from './types'
import { useI18n } from '../../i18n/I18nProvider'

interface ProfileEditorProps {
  profile: GameProfile
  isDefault: boolean
  onChange: (patch: Partial<GameProfile>) => void
  onSetDefault: (isDefault: boolean) => void
}

export function ProfileEditor({ profile, isDefault, onChange, onSetDefault }: ProfileEditorProps) {
  const { t } = useI18n()

  const updateTweaks = (key: keyof GameProfileTweaks, value: boolean) => {
    onChange({ tweaks: { ...(profile.tweaks ?? {}), [key]: value } })
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-zinc-500 mb-1">{t('library.profile.name', 'Nome do perfil')}</div>
          <input
            value={profile.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 text-sm"
          />
        </div>
        <div className="flex items-end gap-3">
          <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => onSetDefault(e.target.checked)}
              className="accent-blue-500"
            />
            {t('library.profile.default', 'Padrão')}
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(profile.enableUltraOnLaunch)}
              onChange={(e) => onChange({ enableUltraOnLaunch: e.target.checked })}
              className="accent-blue-500"
            />
            {t('library.profile.applyOnLaunch', 'Aplicar ao iniciar')}
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div>
          <div className="text-xs text-zinc-500 mb-1">{t('library.profile.pingHost', 'Host de ping')}</div>
          <input
            value={String(profile.pingHost ?? '')}
            onChange={(e) => onChange({ pingHost: e.target.value })}
            placeholder="1.1.1.1"
            className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 text-sm font-mono"
          />
        </div>
        <div>
          <div className="text-xs text-zinc-500 mb-1">{t('library.profile.smartClean', 'Smart Clean (min)')}</div>
          <input
            type="number"
            min={1}
            max={120}
            value={Number(profile.smartCleanMinutes ?? 10)}
            onChange={(e) => onChange({ smartCleanMinutes: Math.max(1, Math.min(120, Math.trunc(Number(e.target.value) || 10))) })}
            className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(profile.overlayEnabled)}
            onChange={(e) => onChange({ overlayEnabled: e.target.checked })}
            className="accent-blue-500"
          />
          {t('library.profile.overlay', 'Widget discreto')}
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(profile.shieldEnabled)}
            onChange={(e) => onChange({ shieldEnabled: e.target.checked })}
            className="accent-blue-500"
          />
          {t('library.profile.shield', 'Latency Shield')}
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
        <div>
          <div className="text-xs text-zinc-500 mb-1">{t('library.profile.shieldDelta', 'Shield Δms')}</div>
          <input
            type="number"
            min={5}
            max={300}
            value={Number(profile.shieldDeltaMs ?? 30)}
            onChange={(e) => onChange({ shieldDeltaMs: Math.max(5, Math.min(300, Math.trunc(Number(e.target.value) || 30))) })}
            className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 text-sm disabled:opacity-50"
            disabled={!profile.shieldEnabled}
          />
        </div>
        <div>
          <div className="text-xs text-zinc-500 mb-1">{t('library.profile.shieldMin', 'Shield Ping mínimo')}</div>
          <input
            type="number"
            min={10}
            max={500}
            value={Number(profile.shieldMinMs ?? 80)}
            onChange={(e) => onChange({ shieldMinMs: Math.max(10, Math.min(500, Math.trunc(Number(e.target.value) || 80))) })}
            className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 text-sm disabled:opacity-50"
            disabled={!profile.shieldEnabled}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-zinc-300 mt-3 cursor-pointer">
        <input
          type="checkbox"
          checked={Boolean(profile.shieldBeep)}
          onChange={(e) => onChange({ shieldBeep: e.target.checked })}
          disabled={!profile.shieldEnabled}
          className="accent-blue-500 disabled:opacity-50"
        />
        <span className={!profile.shieldEnabled ? 'opacity-50' : ''}>{t('library.profile.shieldBeep', 'Beep no alerta')}</span>
      </label>

      <div className="border border-zinc-800 rounded-lg overflow-hidden mt-6">
        <div className="px-3 py-2 bg-zinc-950 border-b border-zinc-800 text-xs text-zinc-400 font-semibold uppercase tracking-wider">
          {t('library.profile.tweaks', 'Tweaks (Desempenho)')}
        </div>
        <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
          {Object.entries(profile.tweaks ?? {}).map(([k, v]) => (
            <label key={k} className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer hover:text-white transition-colors">
              <input
                type="checkbox"
                checked={Boolean(v)}
                onChange={(e) => updateTweaks(k as keyof GameProfileTweaks, e.target.checked)}
                className="accent-emerald-500"
              />
              <span className="font-mono text-xs">{k}</span>
            </label>
          ))}
        </div>
      </div>
    </>
  )
}
