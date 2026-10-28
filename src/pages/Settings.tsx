import React, { useEffect, useState } from 'react'
import { APP_VERSION_LABEL } from '../appVersion';
import { visibleInterval } from '../utils/visibleInterval';
import { Loader2, ShieldCheck, Save, RefreshCw, Download, CheckCircle2, AlertTriangle, FileCode } from '../components/icons'
import PageHeader from '../components/ui/PageHeader'
import { useI18n } from '../i18n/I18nProvider'
import type { SupportedLang } from '../i18n/messages'

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
      const ls = res.config?.liveServices ?? {}
      const appCfg = res.config?.app ?? {}
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
    <div className="w-full max-w-4xl space-y-8">
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      <SettingsGroup title={t('settings.general', 'Geral')}>
        <SettingRow
          label={t('settings.language')}
          description={t('settings.languageHint')}
          control={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                className="dh-input w-56"
                aria-label={t('settings.language')}
              >
                <optgroup label="Idiomas oficiais">
                  {languages?.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.nativeName} ({l.code})
                    </option>
                  ))}
                </optgroup>
                {customLanguages && customLanguages.length > 0 && (
                  <optgroup label="Traduções da comunidade">
                    {customLanguages.map((cl) => (
                      <option key={cl.code} value={cl.code}>
                        {cl.label} ({cl.code})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <button
                type="button"
                onClick={() => setShowTranslateModal(!showTranslateModal)}
                aria-expanded={showTranslateModal}
                className="dh-btn dh-btn-ghost"
              >
                <FileCode size={14} /> {showTranslateModal ? 'Fechar tradutor' : 'Colaborar / importar'}
              </button>
            </div>
          }
        >
          {showTranslateModal && (
            <div className="mt-4 rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-4 space-y-4 animate-in">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <h3 className="dh-section-title">Importar ou criar tradução da comunidade</h3>
                  <p className="dh-help mt-0.5 max-w-[60ch]">
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
                  className="dh-btn dh-btn-sm shrink-0 self-start"
                >
                  <Download size={14} /> Baixar modelo JSON
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="custom-lang-code" className="dh-label block mb-1.5">{t('settings.langCodeLabel', 'Código do Idioma (ex: es-MX, it-IT, pl-PL):')}</label>
                  <input
                    id="custom-lang-code"
                    type="text"
                    value={customLangCode}
                    onChange={(e) => setCustomLangCode(e.target.value)}
                    placeholder="es-MX"
                    className="dh-input w-full font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="custom-lang-label" className="dh-label block mb-1.5">{t('settings.langNameLabel', 'Nome de Exibição (ex: Español Mexicano):')}</label>
                  <input
                    id="custom-lang-label"
                    type="text"
                    value={customLangLabel}
                    onChange={(e) => setCustomLangLabel(e.target.value)}
                    placeholder="Español (México)"
                    className="dh-input w-full"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="custom-lang-json" className="dh-label block mb-1.5">{t('settings.langDictLabel', 'Dicionário JSON de Tradução:')}</label>
                <textarea
                  id="custom-lang-json"
                  value={customLangJson}
                  onChange={(e) => setCustomLangJson(e.target.value)}
                  placeholder='{
  "app.title": "DarkHub",
  "nav.dashboard": "Panel de Control"
}'
                  rows={6}
                  className="dh-input w-full h-auto py-2 font-mono text-[12px] leading-relaxed"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
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
                        setTranslateMsg({ ok: true, msg: `Tradução "${label}" carregada e ativada.` });
                        setCustomLangJson('');
                      } else {
                        setTranslateMsg({ ok: false, msg: 'Falha ao salvar tradução local.' });
                      }
                    } catch (e: any) {
                      setTranslateMsg({ ok: false, msg: 'JSON inválido: ' + e.message });
                    }
                  }}
                  className="dh-btn dh-btn-accent"
                >
                  <CheckCircle2 size={14} /> Aplicar tradução
                </button>
                <StatusLine status={translateMsg} />
              </div>
            </div>
          )}
        </SettingRow>

        <SettingRow
          label={t('settings.windowsStartup', 'Inicialização com o Windows')}
          description="Inicie o DarkHub Suite automaticamente ao ligar o computador (inicia na bandeja)."
          status={startupStatus}
          control={
            <label className="flex items-center gap-2 text-[12.5px] text-zinc-300 cursor-pointer">
              {startupBusy ? <Loader2 size={14} className="animate-spin text-zinc-500" /> : null}
              <input
                type="checkbox"
                checked={openAtLogin}
                disabled={startupBusy}
                onChange={(e) => saveStartupBehavior(e.target.checked)}
              />
              <span>Iniciar com o Windows</span>
            </label>
          }
        />

        <SettingRow
          label="Comportamento da janela"
          description={t('settings.closeActionDesc', 'Defina a ação ao fechar a janela do DarkHub.')}
          status={windowBehaviorStatus}
          control={
            <label className="flex items-center gap-2 text-[12.5px] text-zinc-300 cursor-pointer">
              {windowBehaviorBusy ? <Loader2 size={14} className="animate-spin text-zinc-500" /> : null}
              <input
                type="checkbox"
                checked={closeToTray}
                disabled={windowBehaviorBusy}
                onChange={(e) => saveWindowBehavior(e.target.checked)}
              />
              <span>Minimizar para a bandeja ao fechar</span>
            </label>
          }
        />
      </SettingsGroup>

      <SettingsGroup title={t('settings.bgServices', 'Serviços em Segundo Plano')} description={t('settings.bgServicesDesc', 'Controle a execução de módulos residentes para economizar recursos.')}>
        {([
          ['latencyGuardian', 'Latency Guardian'],
          ['autoClicker', 'Auto Clicker'],
          ['overlay', 'Gaming Overlay HUD'],
        ] as const).map(([key, label]) => (
          <SettingRow
            key={key}
            label={label}
            control={
              <input
                type="checkbox"
                aria-label={label}
                checked={liveServices[key]}
                onChange={(e) => setLiveServices((prev) => ({ ...prev, [key]: e.target.checked }))}
              />
            }
          />
        ))}
        <div className="flex flex-wrap items-center justify-end gap-3 py-3">
          <StatusLine status={liveServicesStatus} />
          <button onClick={saveLiveServices} disabled={liveServicesBusy} className="dh-btn">
            {liveServicesBusy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            <span>{t('settings.saveServices', 'Salvar Serviços')}</span>
          </button>
        </div>
      </SettingsGroup>

      <SettingsGroup title={t('settings.security')}>
        <SettingRow
          label={t('settings.vaultAutoLock')}
          description={t('settings.securityHint')}
          control={
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={240}
                aria-label={t('settings.vaultAutoLock')}
                value={vaultAutoLockMinutes}
                onChange={(e) => setVaultAutoLockMinutes(Math.max(0, Math.min(240, Math.trunc(Number(e.target.value) || 0))))}
                className="dh-input w-20 text-center font-mono"
              />
              <span className="text-[12px] text-zinc-500">min</span>
            </div>
          }
        />
      </SettingsGroup>

      <UpdateManagerSection />
      <ResourceUsageSection />
    </div>
  )
}

type Status = { ok: boolean; msg: string } | null

function StatusLine({ status }: { status: Status }) {
  if (!status) return null
  return (
    <span role="status" className={`inline-flex items-center gap-1.5 text-[12px] ${status.ok ? 'text-emerald-400' : 'text-red-400'}`}>
      {status.ok ? <CheckCircle2 size={14} className="shrink-0" /> : <AlertTriangle size={14} className="shrink-0" />}
      <span className="break-words">{status.msg}</span>
    </span>
  )
}

function SettingsGroup({ title, description, children }: { title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2">
        <h2 className="dh-section-title">{title}</h2>
        {description ? <p className="dh-help mt-0.5 max-w-[75ch]">{description}</p> : null}
      </div>
      <div className="divide-y divide-zinc-800/80 border-y border-zinc-800/80">{children}</div>
    </section>
  )
}

function SettingRow({ label, description, control, status, children }: {
  label: React.ReactNode
  description?: React.ReactNode
  control?: React.ReactNode
  status?: Status
  children?: React.ReactNode
}) {
  return (
    <div className="py-3.5">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-x-8 gap-y-2 items-center">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-zinc-100">{label}</div>
          {description ? <div className="dh-help mt-0.5 max-w-[60ch]">{description}</div> : null}
          {status ? <div className="mt-1.5"><StatusLine status={status} /></div> : null}
        </div>
        {control ? <div className="sm:justify-self-end">{control}</div> : null}
      </div>
      {children}
    </div>
  )
}

function ResourceUsageSection() {
  const { t } = useI18n()
  const [usage, setUsage] = useState<{ totalCpuPercent: number; totalWorkingSetMb: number; processes: Array<{ pid: number; type: string; name?: string; cpuPercent: number; workingSetMb: number }> } | null>(null)

  useEffect(() => {
    return visibleInterval(async () => {
      const res = await window.darkhub?.app?.getResourceUsage?.()
      if (res?.ok) setUsage({ totalCpuPercent: res.totalCpuPercent ?? 0, totalWorkingSetMb: res.totalWorkingSetMb ?? 0, processes: res.processes ?? [] })
    }, 2000)
  }, [])

  return (
    <SettingsGroup title={t('settings.resourceUsage', 'Consumo de recursos do DarkHub')} description={t('settings.resourceUsageDesc', 'Medido em tempo real pelo Electron (todos os processos do app). Use para comparar o consumo antes e depois de abrir as janelas de monitoramento.')}>
      <div className="flex items-baseline justify-between py-3">
        <span className="text-[12.5px] text-zinc-400">Total</span>
        {usage ? (
          <span className="font-mono text-[12.5px] text-zinc-100">
            {usage.totalCpuPercent}<span className="text-zinc-500">% CPU</span> · {usage.totalWorkingSetMb}<span className="text-zinc-500"> MB</span>
          </span>
        ) : (
          <span className="inline-block h-3 w-32 rounded bg-zinc-900 animate-pulse" />
        )}
      </div>
      {usage ? (
        usage.processes.length > 0 && (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[11px] text-zinc-500 text-left">
                <th className="font-normal py-2">Processo</th>
                <th className="font-normal py-2 text-right">CPU</th>
                <th className="font-normal py-2 text-right">Memória</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {usage.processes.map((p) => (
                <tr key={p.pid}>
                  <td className="py-1.5 text-zinc-300">{p.type}{p.name ? <span className="text-zinc-500"> · {p.name}</span> : ''}</td>
                  <td className="py-1.5 text-right font-mono text-zinc-300">{p.cpuPercent}<span className="text-zinc-500">%</span></td>
                  <td className="py-1.5 text-right font-mono text-zinc-300">{p.workingSetMb}<span className="text-zinc-500"> MB</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : (
        <div className="py-3 space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-3 rounded bg-zinc-900 animate-pulse" />)}
        </div>
      )}
    </SettingsGroup>
  )
}

function UpdateManagerSection() {
  const { t } = useI18n()
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
          setFeedback({ ok: true, msg: `Você está na versão mais recente (${evt.currentVersion || status?.currentVersion || APP_VERSION_LABEL}).` })
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
    <SettingsGroup title={t('settings.updates', 'Atualizações do DarkHub')}>
      <SettingRow
        label="Versão em execução"
        description={<span className="font-mono text-zinc-300">{status?.currentVersion || APP_VERSION_LABEL}</span>}
        status={feedback}
        control={
          <button onClick={handleCheck} disabled={checking} className="dh-btn">
            {checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            <span>{t('settings.checkUpdates', 'Verificar Atualizações')}</span>
          </button>
        }
      />
    </SettingsGroup>
  )
}
