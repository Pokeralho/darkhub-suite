import React, { useEffect, useState } from 'react'
import { MousePointerClick, Pause, Play } from 'lucide-react'
import { HelpTip } from '../components/HelpTip'
import { useI18n } from '../i18n/I18nProvider'

export default function AutoClicker() {
  const { t } = useI18n()
  const [intervalMs, setIntervalMs] = useState(100)
  const [button, setButton] = useState<'left' | 'right'>('left')
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [hotkey, setHotkey] = useState<string>('')
  const [hotkeyEditing, setHotkeyEditing] = useState(false)

  const refresh = async () => {
    if (!window.darkhub?.autoclicker) return
    try {
      const res = await window.darkhub.autoclicker.status()
      if (res?.ok) {
        setRunning(Boolean(res.running))
        if (res?.state?.intervalMs) setIntervalMs(Number(res.state.intervalMs))
        if (res?.state?.button) setButton(res.state.button)
        if (typeof res?.hotkey === 'string') setHotkey(res.hotkey)
      }
    } catch (e: any) {
      const msg = e?.message ?? String(e)
      if (msg.includes('No handler registered')) {
        setStatus('Backend do Electron não reiniciou. Pare e rode o app novamente.')
      } else {
        setStatus(msg)
      }
    }
  }

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 1000)

    if (window.darkhub?.autoclicker?.setTabActive) {
      window.darkhub.autoclicker.setTabActive(true).catch(() => {})
    }

    return () => {
      clearInterval(id)

      if (window.darkhub?.autoclicker?.setTabActive) {
        window.darkhub.autoclicker.setTabActive(false).catch(() => {})
      }
    }
  }, [])

  const start = async () => {
    setStatus(null)
    if (!window.darkhub?.autoclicker) return
    try {
      const res = await window.darkhub.autoclicker.start({ intervalMs, button })
      if (res?.ok) {
        setStatus('AutoClicker iniciado. Para parar, volte aqui e clique em “Parar”.')
        setRunning(true)
      } else {
        setStatus(res?.error ?? 'Falha ao iniciar.')
      }
    } catch (e: any) {
      const msg = e?.message ?? String(e)
      if (msg.includes('No handler registered')) {
        setStatus('Backend do Electron não reiniciou. Pare e rode o app novamente.')
      } else {
        setStatus(msg)
      }
    }
  }

  const stop = async () => {
    setStatus(null)
    if (!window.darkhub?.autoclicker) return
    try {
      const res = await window.darkhub.autoclicker.stop()
      if (res?.ok) {
        setStatus('AutoClicker parado.')
        setRunning(false)
      } else {
        setStatus(res?.error ?? 'Falha ao parar.')
      }
    } catch (e: any) {
      const msg = e?.message ?? String(e)
      if (msg.includes('No handler registered')) {
        setStatus('Backend do Electron não reiniciou. Pare e rode o app novamente.')
      } else {
        setStatus(msg)
      }
    }
  }

  const toggle = async () => {
    setStatus(null)
    if (!window.darkhub?.autoclicker) return
    try {
      const res = await window.darkhub.autoclicker.toggle({ intervalMs, button })
      if (res?.ok) {
        setRunning(Boolean(res?.state) ? true : Boolean(res?.running))
        setStatus(res?.msg ?? 'Ok.')
      } else {
        setStatus(res?.error ?? 'Falha ao alternar.')
      }
    } catch (e: any) {
      const msg = e?.message ?? String(e)
      if (msg.includes('No handler registered')) {
        setStatus('Backend do Electron não reiniciou. Pare e rode o app novamente.')
      } else {
        setStatus(msg)
      }
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

  const saveHotkey = async (value: string) => {
    if (!window.darkhub?.autoclicker) return
    const res = await window.darkhub.autoclicker.setHotkey({ hotkey: value })
    if (res?.ok) {
      setStatus(res.enabled ? `Atalho configurado: ${res.hotkey}` : 'Atalho desativado.')
    } else {
      setStatus(res?.error ?? 'Falha ao configurar atalho.')
    }
    await refresh()
  }

  return (
    <div className="space-y-6 w-full">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-bold text-white">AutoClicker</h1>
          <HelpTip
            title={t('help.autoclicker.overview.title')}
            description={t('help.autoclicker.overview.desc')}
            sections={[
              { title: t('help.autoclicker.overview.sections.stability.title'), content: t('help.autoclicker.overview.sections.stability.desc') },
              { title: t('help.autoclicker.overview.sections.permissions.title'), content: t('help.autoclicker.overview.sections.permissions.desc') }
            ]}
            example={t('help.autoclicker.overview.example')}
            buttonLabel={t('help.button')}
          />
        </div>
        <p className="text-zinc-400">Clique automático local (Windows). Ideal para testes e automação leve.</p>
      </div>

      {status ? <div className="text-sm text-zinc-200 bg-zinc-900 border border-zinc-800 rounded-lg p-3">{status}</div> : null}

      <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900 space-y-4 max-w-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-zinc-500 mb-1">Botão</div>
            <select
              value={button}
              onChange={(e) => setButton(e.target.value as any)}
              className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
              disabled={running}
            >
              <option value="left">Esquerdo</option>
              <option value="right">Direito</option>
            </select>
          </div>

          <div>
            <div className="text-xs text-zinc-500 mb-1">Intervalo (ms)</div>
            <input
              type="number"
              min={1}
              max={10000}
              value={intervalMs}
              onChange={(e) => setIntervalMs(Math.max(1, Math.min(10000, Math.trunc(Number(e.target.value) || 100))))}
              className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
              disabled={running}
            />
            <div className="mt-2">
              <HelpTip
                title={t('help.autoclicker.interval.title')}
                description={t('help.autoclicker.interval.desc')}
                sections={[
                  { title: t('help.autoclicker.interval.sections.input.title'), content: t('help.autoclicker.interval.sections.input.desc') }
                ]}
                example={t('help.autoclicker.interval.example')}
                buttonLabel={t('help.button')}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-zinc-500 mb-1 inline-flex items-center gap-2">
              Atalho global (toggle)
              <HelpTip
                title={t('help.autoclicker.hotkey.title')}
                description={t('help.autoclicker.hotkey.desc')}
                sections={[
                  { title: t('help.autoclicker.hotkey.sections.input.title'), content: t('help.autoclicker.hotkey.sections.input.desc') },
                  { title: t('help.autoclicker.hotkey.sections.behavior.title'), content: t('help.autoclicker.hotkey.sections.behavior.desc') }
                ]}
                example={t('help.autoclicker.hotkey.example')}
                buttonLabel={t('help.button')}
              />
            </div>
            <input
              value={hotkeyEditing ? '' : (hotkey || '')}
              placeholder={hotkey ? hotkey : 'Clique aqui e pressione (ex: Ctrl+Alt+F6)'}
              onFocus={() => setHotkeyEditing(true)}
              onBlur={() => setHotkeyEditing(false)}
              onKeyDown={async (e) => {
                e.preventDefault()
                e.stopPropagation()
                if (e.key === 'Escape') {
                  setHotkeyEditing(false)
                  return
                }
                const accel = buildAcceleratorFromEvent(e)
                if (!accel) return
                setHotkey(accel)
                setHotkeyEditing(false)
                await saveHotkey(accel)
              }}
              className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
            />
            <div className="text-xs text-zinc-500 mt-2">
              Dica: para clicar em apps elevados (admin), rode o DarkHub como Administrador.
            </div>
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={async () => { setHotkey(''); await saveHotkey('') }}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
              disabled={!hotkey}
            >
              Limpar atalho
            </button>
            <button
              onClick={toggle}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
            >
              Toggle
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          {!running ? (
            <button
              onClick={start}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center gap-2 transition-colors"
            >
              <Play size={18} />
              <span>Iniciar</span>
            </button>
          ) : (
            <button
              onClick={stop}
              className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-200 rounded-lg flex items-center gap-2 transition-colors"
            >
              <Pause size={18} />
              <span>Parar</span>
            </button>
          )}
          <HelpTip
            title={t('help.autoclicker.toggle.title')}
            description={t('help.autoclicker.toggle.desc')}
            sections={[
              { title: t('help.autoclicker.toggle.sections.input.title'), content: t('help.autoclicker.toggle.sections.input.desc') },
              { title: t('help.autoclicker.toggle.sections.output.title'), content: t('help.autoclicker.toggle.sections.output.desc') }
            ]}
            example={t('help.autoclicker.toggle.example')}
            buttonLabel={t('help.button')}
          />

          <div className="flex items-center text-xs text-zinc-500 gap-2">
            <MousePointerClick size={16} />
            <span>{running ? 'Rodando…' : 'Parado'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
