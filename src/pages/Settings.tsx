import React, { useEffect, useState } from 'react'
import { Bug, Loader2, ShieldCheck, Activity, Save, AppWindow, RefreshCw, Power, Globe, Download, Upload, CheckCircle2, AlertTriangle, FileCode } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'
import type { SupportedLang } from '../i18n/messages'
import { HelpTip } from '../components/HelpTip'

export default function SettingsPage() {
  const { lang, setLang, t, languages, customLanguages, importCustomTranslation } = useI18n()
  const [showTranslateModal, setShowTranslateModal] = useState(false)
  const [customLangCode, setCustomLangCode] = useState('')
  const [customLangLabel, setCustomLangLabel] = useState('')
  const [customLangJson, setCustomLangJson] = useState('')
  const [translateMsg, setTranslateMsg] = useState<{ ok: boolean; msg: string } | null>(null)
  const [vaultAutoLockMinutes, setVaultAutoLockMinutes] = useState<number>(() => {
    const raw = localStorage.getItem('darkhub.vault.autoLockMin')
    const n = raw ? Number(raw) : 10
    if (!Number.isFinite(n) || n < 0) return 10
    return Math.trunc(n)
  })
  const [telemetry, setTelemetry] = useState({
    bugReportsEnabled: true
  })
  const [telemetryBusy, setTelemetryBusy] = useState(false)
  const [telemetryStatus, setTelemetryStatus] = useState<{ ok: boolean; msg: string } | null>(null)

  const [liveServices, setLiveServices] = useState({
    latencyGuardian: true,
    overlay: true,
    autoClicker: true
  })
  const [liveServicesBusy, setLiveServicesBusy] = useState(false)
  const [liveServicesStatus, setLiveServicesStatus] = useState<{ ok: boolean; msg: string } | null>(null)

  const [closeToTray, setCloseToTray] = useState(true)
  const [windowBehaviorBusy, setWindowBehaviorBusy] = useState(false)
  const [windowBehaviorStatus, setWindowBehaviorStatus] = useState<{ ok: boolean; msg: string } | null>(null)

  const [openAtLogin, setOpenAtLogin] = useState(false)
  const [startupBusy, setStartupBusy] = useState(false)
  const [startupStatus, setStartupStatus] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    let alive = true
    window.darkhub?.settings?.getConfig?.().then((res) => {
      if (!alive || !res?.ok) return
      const next = res.config?.telemetry ?? {}
      const ls = res.config?.liveServices ?? {}
      const appCfg = res.config?.app ?? {}
      setTelemetry({
        bugReportsEnabled: next.bugReportsEnabled !== false
      })
      setLiveServices({
        latencyGuardian: ls.latencyGuardian !== false,
        overlay: ls.overlay !== false,
        autoClicker: ls.autoClicker !== false
      })
      setCloseToTray(appCfg.closeToTray !== false)
      setOpenAtLogin(Boolean(appCfg.openAtLogin))
    }).catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('darkhub.vault.autoLockMin', String(vaultAutoLockMinutes))
    if (window.darkhub?.vault?.setAutoLockMinutes) {
      window.darkhub.vault.setAutoLockMinutes(vaultAutoLockMinutes)
    }
  }, [vaultAutoLockMinutes])

  const saveTelemetry = async () => {
    setTelemetryBusy(true)
    setTelemetryStatus(null)
    try {
      const res = await window.darkhub?.settings?.updateTelemetry?.(telemetry)
      if (res?.ok) {
        setTelemetry(res.telemetry)
        setTelemetryStatus({ ok: true, msg: 'Telemetria de bugs salva.' })
      } else {
        setTelemetryStatus({ ok: false, msg: res?.error ?? 'Falha ao salvar telemetria.' })
      }
    } catch (err: any) {
      setTelemetryStatus({ ok: false, msg: err?.message ?? String(err) })
    } finally {
      setTelemetryBusy(false)
    }
  }

  const saveLiveServices = async () => {
    setLiveServicesBusy(true)
    setLiveServicesStatus(null)
    try {

      const res = await window.darkhub?.settings?.updateLiveServices?.(liveServices)
      if (res?.ok) {
        setLiveServices(res.liveServices)
        setLiveServicesStatus({ ok: true, msg: 'Serviços atualizados com sucesso.' })
      } else {
        setLiveServicesStatus({ ok: false, msg: res?.error ?? 'Falha ao salvar serviços.' })
      }
    } catch (err: any) {
      setLiveServicesStatus({ ok: false, msg: err?.message ?? String(err) })
    } finally {
      setLiveServicesBusy(false)
    }
  }

  const saveWindowBehavior = async (nextValue: boolean) => {
    setCloseToTray(nextValue)
    setWindowBehaviorBusy(true)
    setWindowBehaviorStatus(null)
    try {
      const res = await window.darkhub?.settings?.updateWindowBehavior?.({ closeToTray: nextValue })
      if (res?.ok) {
        setCloseToTray(res.app?.closeToTray !== false)
        setWindowBehaviorStatus({ ok: true, msg: 'Preferência salva.' })
      } else {
        setCloseToTray(!nextValue)
        setWindowBehaviorStatus({ ok: false, msg: res?.error ?? 'Falha ao salvar preferência.' })
      }
    } catch (err: any) {
      setCloseToTray(!nextValue)
      setWindowBehaviorStatus({ ok: false, msg: err?.message ?? String(err) })
    } finally {
      setWindowBehaviorBusy(false)
    }
  }

  const saveStartupBehavior = async (nextValue: boolean) => {
    setOpenAtLogin(nextValue)
    setStartupBusy(true)
    setStartupStatus(null)
    try {
      const res = await window.darkhub?.settings?.updateStartupBehavior?.({ openAtLogin: nextValue, openAsHidden: true })
      if (res?.ok) {
        setOpenAtLogin(Boolean(res.openAtLogin))
        setStartupStatus({ ok: true, msg: nextValue ? 'DarkHub configurado para iniciar com o Windows.' : 'Inicialização com o Windows desativada.' })
      } else {
        setOpenAtLogin(!nextValue)
        setStartupStatus({ ok: false, msg: res?.error ?? 'Falha ao atualizar inicialização com o Windows.' })
      }
    } catch (err: any) {
      setOpenAtLogin(!nextValue)
      setStartupStatus({ ok: false, msg: err?.message ?? String(err) })
    } finally {
      setStartupBusy(false)
    }
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto p-1 md:p-2 animate-fadeIn">
      <div className="pb-3 border-b border-zinc-800/80 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-zinc-100 tracking-tight">{t('settings.title')}</h1>
          <p className="text-xs text-zinc-400">{t('settings.subtitle')}</p>
        </div>
      </div>

      {}
      <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-md shrink-0">
              <Globe size={16} />
            </div>
            <div>
              <h2 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">{t('settings.language')}</h2>
              <p className="text-xs text-zinc-500">{t('settings.languageHint')}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs rounded-md px-3 py-1.5 focus:outline-none focus:border-zinc-700 font-medium"
            >
              <optgroup label="Idiomas Oficiais">
                {languages?.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.flag} {l.nativeName} ({l.code})
                  </option>
                ))}
              </optgroup>
              {customLanguages && customLanguages.length > 0 && (
                <optgroup label="Traduções da Comunidade">
                  {customLanguages.map((cl) => (
                    <option key={cl.code} value={cl.code}>
                      🌐 {cl.label} ({cl.code})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>

            <button
              type="button"
              onClick={() => setShowTranslateModal(!showTranslateModal)}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <FileCode size={13} /> {showTranslateModal ? 'Fechar Tradutor' : 'Colaborar / Importar'}
            </button>
          </div>
        </div>

        {}
        {showTranslateModal && (
          <div className="p-4 bg-zinc-950 rounded-lg border border-zinc-800 space-y-4 pt-3 mt-2 animate-fadeIn">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-850 pb-2">
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Upload size={14} className="text-blue-400" />
                  Importar ou Criar Tradução da Comunidade
                </h3>
                <p className="text-[11px] text-zinc-400">
                  Contribua traduzindo o DarkHub Suite para qualquer idioma usando arquivos JSON padronizados.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  try {
                    import('../i18n/messages').then((m) => {
                      const template = m.getTranslationTemplate ? m.getTranslationTemplate() : '{}';
                      const blob = new Blob([template], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'darkhub-i18n-template.json';
                      a.click();
                      URL.revokeObjectURL(url);
                    });
                  } catch {}
                }}
                className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded text-xs font-semibold flex items-center gap-1 self-start sm:self-auto"
              >
                <Download size={12} /> Baixar Modelo JSON Completo
              </button>
            </div>

            {translateMsg && (
              <div className={`p-2.5 rounded text-xs font-medium flex items-center gap-2 border ${
                translateMsg.ok ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
              }`}>
                {translateMsg.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                <span>{translateMsg.msg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-zinc-400 block mb-1">Código do Idioma (ex: es-MX, it-IT, pl-PL):</label>
                <input
                  type="text"
                  value={customLangCode}
                  onChange={(e) => setCustomLangCode(e.target.value)}
                  placeholder="Ex: es-MX"
                  className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-700 font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-zinc-400 block mb-1">Nome de Exibição (ex: Español Mexicano):</label>
                <input
                  type="text"
                  value={customLangLabel}
                  onChange={(e) => setCustomLangLabel(e.target.value)}
                  placeholder="Ex: Español (México)"
                  className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-zinc-400 block mb-1">Dicionário JSON de Tradução:</label>
              <textarea
                value={customLangJson}
                onChange={(e) => setCustomLangJson(e.target.value)}
                placeholder='{
  "app.title": "DarkHub",
  "nav.dashboard": "Panel de Control"
}'
                rows={5}
                className="w-full p-2.5 bg-zinc-900 border border-zinc-800 rounded text-xs text-white placeholder-zinc-600 font-mono focus:outline-none focus:border-zinc-700"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                if (!customLangCode.trim() || !customLangJson.trim()) {
                  setTranslateMsg({ ok: false, msg: 'Informe o código do idioma e o JSON de tradução.' });
                  return;
                }
                try {
                  const dict = JSON.parse(customLangJson.trim());
                  const label = customLangLabel.trim() || customLangCode.trim();
                  const ok = importCustomTranslation(customLangCode.trim(), label, dict);
                  if (ok) {
                    setTranslateMsg({ ok: true, msg: `Tradução "${label}" carregada e ativada com sucesso!` });
                    setCustomLangJson('');
                  } else {
                    setTranslateMsg({ ok: false, msg: 'Falha ao salvar tradução local.' });
                  }
                } catch (e: any) {
                  setTranslateMsg({ ok: false, msg: 'JSON inválido: ' + e.message });
                }
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-blue-600/20"
            >
              <CheckCircle2 size={13} /> Aplicar Tradução Imediatamente
            </button>
          </div>
        )}
      </div>

      {}
      <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-md shrink-0">
              <Bug size={16} />
            </div>
            <div>
              <h2 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Telemetria de Erros & Bugs</h2>
              <p className="text-xs text-zinc-500">Envia logs anônimos de crashes e exceções para o canal de suporte.</p>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={telemetry.bugReportsEnabled}
              onChange={(e) => setTelemetry((prev) => ({ ...prev, bugReportsEnabled: e.target.checked }))}
              className="h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-blue-600 focus:ring-0"
            />
            <span>Ativar Envio de Bugs</span>
          </label>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60">
          <span className="text-[11px] text-zinc-500">Dados sensíveis e caminhos de usuário são redigidos automaticamente.</span>
          <button
            onClick={saveTelemetry}
            disabled={telemetryBusy}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 text-xs font-medium rounded-md transition-colors disabled:opacity-50 flex items-center gap-1.5 border border-zinc-700/60"
          >
            {telemetryBusy ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
            <span>Salvar Telemetria</span>
          </button>
        </div>

        {telemetryStatus && (
          <div className={`text-xs rounded-md border p-2.5 font-mono ${
            telemetryStatus.ok
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}>
            {telemetryStatus.msg}
          </div>
        )}
      </div>

      {}
      <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-md shrink-0">
              <Activity size={16} />
            </div>
            <div>
              <h2 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Serviços em Segundo Plano</h2>
              <p className="text-xs text-zinc-500">Controle a execução de módulos residentes para economizar recursos.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <label className="flex items-center gap-2.5 p-2.5 rounded-md border border-zinc-800 bg-zinc-950 hover:border-zinc-700 transition-colors cursor-pointer">
            <input
              type="checkbox"
              checked={liveServices.latencyGuardian}
              onChange={(e) => setLiveServices((prev) => ({ ...prev, latencyGuardian: e.target.checked }))}
              className="h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-900 text-blue-600 focus:ring-0"
            />
            <span className="text-xs text-zinc-300">Latency Guardian</span>
          </label>
          <label className="flex items-center gap-2.5 p-2.5 rounded-md border border-zinc-800 bg-zinc-950 hover:border-zinc-700 transition-colors cursor-pointer">
            <input
              type="checkbox"
              checked={liveServices.autoClicker}
              onChange={(e) => setLiveServices((prev) => ({ ...prev, autoClicker: e.target.checked }))}
              className="h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-900 text-blue-600 focus:ring-0"
            />
            <span className="text-xs text-zinc-300">Auto Clicker</span>
          </label>
          <label className="flex items-center gap-2.5 p-2.5 rounded-md border border-zinc-800 bg-zinc-950 hover:border-zinc-700 transition-colors cursor-pointer">
            <input
              type="checkbox"
              checked={liveServices.overlay}
              onChange={(e) => setLiveServices((prev) => ({ ...prev, overlay: e.target.checked }))}
              className="h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-900 text-blue-600 focus:ring-0"
            />
            <span className="text-xs text-zinc-300">Gaming Overlay HUD</span>
          </label>
        </div>

        <div className="flex justify-end pt-1 border-t border-zinc-800/60">
          <button
            onClick={saveLiveServices}
            disabled={liveServicesBusy}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 text-xs font-medium rounded-md transition-colors disabled:opacity-50 flex items-center gap-1.5 border border-zinc-700/60"
          >
            {liveServicesBusy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            <span>Salvar Serviços</span>
          </button>
        </div>

        {liveServicesStatus && (
          <div className={`text-xs rounded-md border p-2.5 font-mono ${
            liveServicesStatus.ok
              ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}>
            {liveServicesStatus.msg}
          </div>
        )}
      </div>

      {}
      <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-md shrink-0">
              <Power size={16} />
            </div>
            <div>
              <h2 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Inicialização com o Windows</h2>
              <p className="text-xs text-zinc-500">Inicie o DarkHub Suite automaticamente ao ligar o computador (inicia na bandeja).</p>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            {startupBusy ? <Loader2 size={13} className="animate-spin text-zinc-400" /> : null}
            <input
              type="checkbox"
              checked={openAtLogin}
              disabled={startupBusy}
              onChange={(e) => saveStartupBehavior(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-blue-600 focus:ring-0"
            />
            <span>Iniciar com o Windows</span>
          </label>
        </div>

        {startupStatus && (
          <div className={`text-xs rounded-md border p-2.5 font-mono ${
            startupStatus.ok
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}>
            {startupStatus.msg}
          </div>
        )}
      </div>

      {}
      <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-sky-500/10 text-sky-400 rounded-md shrink-0">
              <AppWindow size={16} />
            </div>
            <div>
              <h2 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Comportamento da Janela</h2>
              <p className="text-xs text-zinc-500">Defina a ação ao fechar a janela do DarkHub.</p>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            {windowBehaviorBusy ? <Loader2 size={13} className="animate-spin text-zinc-400" /> : null}
            <input
              type="checkbox"
              checked={closeToTray}
              disabled={windowBehaviorBusy}
              onChange={(e) => saveWindowBehavior(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-blue-600 focus:ring-0"
            />
            <span>Minimizar para a Bandeja ao Fechar</span>
          </label>
        </div>

        {windowBehaviorStatus && (
          <div className={`text-xs rounded-md border p-2.5 font-mono ${
            windowBehaviorStatus.ok
              ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}>
            {windowBehaviorStatus.msg}
          </div>
        )}
      </div>

      {}
      <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-md shrink-0">
              <ShieldCheck size={16} />
            </div>
            <div>
              <h2 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">{t('settings.security')}</h2>
              <p className="text-xs text-zinc-500">{t('settings.securityHint')}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">{t('settings.vaultAutoLock')}:</span>
            <input
              type="number"
              min={0}
              max={240}
              value={vaultAutoLockMinutes}
              onChange={(e) => setVaultAutoLockMinutes(Math.max(0, Math.min(240, Math.trunc(Number(e.target.value) || 0))))}
              className="w-20 bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs rounded-md px-2.5 py-1 text-center font-mono focus:outline-none focus:border-zinc-700"
            />
            <span className="text-xs text-zinc-500">min</span>
          </div>
        </div>
      </div>

      {}
      <UpdateManagerSection />
    </div>
  )
}

function UpdateManagerSection() {
  const [checking, setChecking] = useState(false)
  const [status, setStatus] = useState<{
    currentVersion?: string
    state?: string
    updateInfo?: { version: string; releaseDate?: string; releaseNotes?: string } | null
  } | null>(null)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)

  const loadStatus = async () => {
    try {
      if (window.darkhub?.updater) {
        const res = await window.darkhub.updater.getStatus()
        if (res) setStatus(res)
      }
    } catch {}
  }

  useEffect(() => {
    loadStatus()
    if (window.darkhub?.updater?.onEvent) {
      const unsub = window.darkhub.updater.onEvent((evt: any) => {
        if (evt.type === 'checking') setChecking(true)
        else if (evt.type === 'available') {
          setChecking(false)
          setFeedback({ ok: true, msg: `Nova versão disponível: v${evt.info?.version}` })
          loadStatus()
        } else if (evt.type === 'not-available') {
          setChecking(false)
          setFeedback({ ok: true, msg: `Você está na versão mais recente (${evt.currentVersion || status?.currentVersion || 'v0.4.5'}).` })
          loadStatus()
        } else if (evt.type === 'error') {
          setChecking(false)
          setFeedback({ ok: false, msg: `Erro ao verificar: ${evt.message}` })
        }
      })
      return () => unsub()
    }
  }, [])

  const handleCheck = async () => {
    setChecking(true)
    setFeedback(null)
    try {
      if (window.darkhub?.updater) {
        const res = await window.darkhub.updater.check()
        if (res?.ok === false && res?.error) {
          setFeedback({ ok: false, msg: res.error })
        }
      } else {
        setFeedback({ ok: false, msg: 'Serviço de updater indisponível.' })
      }
    } catch (e: any) {
      setFeedback({ ok: false, msg: e.message })
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-500/10 text-blue-400 rounded-md shrink-0">
            <RefreshCw size={16} className={checking ? 'animate-spin' : ''} />
          </div>
          <div>
            <h2 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Atualizações do DarkHub</h2>
            <p className="text-xs text-zinc-500">
              Versão em execução: <span className="font-mono text-blue-400 font-semibold">{status?.currentVersion || 'v0.4.5'}</span>
            </p>
          </div>
        </div>

        <button
          onClick={handleCheck}
          disabled={checking}
          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 text-xs font-medium rounded-md transition-colors disabled:opacity-50 flex items-center gap-1.5 border border-zinc-700/60"
        >
          {checking ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          <span>Verificar Atualizações</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`text-xs rounded-md border p-2.5 font-mono ${
            feedback.ok
              ? 'border-blue-500/30 bg-blue-500/10 text-blue-300'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}
        >
          {feedback.msg}
        </div>
      )}
    </div>
  )
}
