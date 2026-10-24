import React, { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, FolderOpen, Globe, RefreshCw, Trash2 } from '../icons'
import { HelpTip } from '../HelpTip'
import { useI18n } from '../../i18n/I18nProvider'
import type { VaultBridgeBrowser, VaultBridgeStatus } from '../../global'

const BROWSER_ORDER: VaultBridgeBrowser[] = ['chrome', 'edge', 'firefox']

function formatDate(ts: number | null | undefined, lang: string) {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return ''
  }
}

/** "Browser extension" section of the password vault screen: native host registration + paired clients. */
export default function BrowserExtensionSection() {
  const { t, lang } = useI18n()
  const vault = window.darkhub?.vault
  const [status, setStatus] = useState<VaultBridgeStatus | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const apply = useCallback((res: any) => {
    if (res && res.ok === true && Array.isArray(res.browsers)) {
      setStatus(res as VaultBridgeStatus)
      setError(null)
    } else if (res && res.ok === false) {
      setError(String(res.error ?? '?'))
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!vault?.bridgeStatus) return
    try { apply(await vault.bridgeStatus()) } catch (err: any) { setError(err?.message ?? String(err)) }
  }, [vault, apply])

  useEffect(() => {
    void refresh()
    vault?.setBridgeLanguage?.(lang).catch?.(() => {})
    const off = vault?.onBridgeChanged?.(() => void refresh())
    return () => { off?.() }
  }, [refresh, vault, lang])

  const run = async (key: string, fn: () => Promise<any>) => {
    setBusy(key)
    try { apply(await fn()) } catch (err: any) { setError(err?.message ?? String(err)) } finally { setBusy(null) }
  }

  if (!vault?.bridgeStatus) return null

  const openFolder = async () => {
    const res = await vault.openExtensionFolder().catch((e: any) => ({ ok: false, error: e?.message }))
    if (!res?.ok) setError(res?.error === 'extension_folder_missing' ? t('vaultx.folderMissing', 'A pasta browser-extension não foi encontrada nesta instalação.') : String(res?.error ?? '?'))
  }

  const btn = 'dh-btn !h-7 !px-2.5 text-[12px]'

  return (
    <section className="mt-10 border-t border-zinc-800/80 pt-6" aria-labelledby="vaultx-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-[65ch]">
          <h2 id="vaultx-title" className="dh-section-title flex items-center gap-1.5">
            <Globe size={15} className="text-zinc-400" />
            {t('vaultx.title', 'Extensão do navegador')}
            <HelpTip
              title={t('vaultx.helpTitle', 'Extensão do navegador')}
              description={t('vaultx.helpDesc', 'O navegador inicia um pequeno programa do DarkHub que conversa só com este app.')}
              sections={[
                { title: t('vaultx.helpPairTitle', 'Pareamento'), content: t('vaultx.helpPairBody', 'Confirme o código de 6 dígitos apenas se for igual ao da extensão.') },
                { title: t('vaultx.helpMatchTitle', 'O que a extensão recebe'), content: t('vaultx.helpMatchBody', 'Só os usuários salvos para o site aberto e a senha de um login quando você clica em Preencher.') }
              ]}
              buttonLabel={t('help.button')}
            />
          </h2>
          <p className="dh-help mt-1">{t('vaultx.subtitle', 'Preenchimento automático no Chrome, Edge e Firefox pela extensão DarkHub Vault.')}</p>
        </div>
        <div className="flex gap-2">
          <button className={btn} onClick={() => void openFolder()}>
            <FolderOpen size={14} /> {t('vaultx.openFolder', 'Abrir pasta da extensão')}
          </button>
          <button className={btn} onClick={() => void refresh()} aria-label={t('vaultx.refresh', 'Atualizar')} title={t('vaultx.refresh', 'Atualizar')}>
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-3 flex items-start gap-2 text-[12.5px] text-red-400">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{t('vaultx.errorPrefix', 'Falha')}: {error}</span>
        </p>
      ) : null}

      {status && !status.supported ? (
        <p className="dh-help mt-3">{t('vaultx.unsupported', 'Disponível apenas no Windows.')}</p>
      ) : null}

      {status?.supported ? (
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="dh-label">{t('vaultx.browsers', 'Navegadores')}</h3>
              <span className={`inline-flex items-center gap-1.5 text-[11.5px] ${status.serverRunning ? 'text-emerald-400' : 'text-zinc-500'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${status.serverRunning ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                {status.serverRunning ? t('vaultx.bridgeOn', 'Ponte local ativa') : t('vaultx.bridgeOff', 'Ponte local desligada (nenhum navegador registrado)')}
              </span>
            </div>
            <ul className="divide-y divide-zinc-800/60 border-y border-zinc-800/60">
              {BROWSER_ORDER.map((id) => {
                const b = status.browsers.find((x) => x.browser === id)
                if (!b) return null
                return (
                  <li key={id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-zinc-100">{b.label}</div>
                      <div className={`text-[11.5px] ${b.registered ? 'text-emerald-400' : b.foreignRegistration ? 'text-amber-300' : 'text-zinc-500'}`}>
                        {b.registered ? (
                          <span className="inline-flex items-center gap-1"><Check size={12} /> {t('vaultx.registered', 'Registrado')}</span>
                        ) : b.foreignRegistration ? t('vaultx.foreign', 'Outro programa usa este nome de host') : t('vaultx.notRegistered', 'Não registrado')}
                      </div>
                    </div>
                    {b.registered ? (
                      <button className={btn} disabled={busy !== null} onClick={() => void run(`u:${id}`, () => vault.unregisterBrowserHost(id))}>
                        {t('vaultx.unregister', 'Remover')}
                      </button>
                    ) : (
                      <button className={`${btn} dh-btn-primary`} disabled={busy !== null} onClick={() => void run(`r:${id}`, () => vault.registerBrowserHost(id))}>
                        {t('vaultx.register', 'Registrar')}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
            <p className="dh-help mt-3">{t('vaultx.loadHint', 'Chrome/Edge: chrome://extensions → Modo do desenvolvedor → Carregar sem compactação. Firefox: about:debugging → Carregar extensão temporária.')}</p>
            <p className="mt-2 text-[11px] text-zinc-600">
              {t('vaultx.extensionIds', 'IDs aceitos')}: <span className="font-mono text-zinc-500 select-all">{status.extensionIds.chromium}</span>
              {' · '}<span className="font-mono text-zinc-500 select-all">{status.extensionIds.gecko}</span>
            </p>
          </div>

          <div>
            <h3 className="dh-label mb-2">{t('vaultx.clients', 'Navegadores pareados')}</h3>
            {!status.unlocked ? (
              <p className="mb-2 flex items-start gap-1.5 text-[12px] text-zinc-400">
                <AlertTriangle size={13} className="mt-0.5 shrink-0 text-zinc-500" />
                {t('vaultx.locked', 'Cofre bloqueado: a extensão não recebe nada até você desbloquear.')}
              </p>
            ) : null}
            {status.clients.length ? (
              <ul className="divide-y divide-zinc-800/60 border-y border-zinc-800/60">
                {status.clients.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[13px] text-zinc-100">
                        <span className="truncate">{c.name}</span>
                        {c.connected ? <span className="text-[11px] text-emerald-400">{t('vaultx.connected', 'conectado')}</span> : null}
                      </div>
                      <div className="text-[11.5px] text-zinc-500">
                        {t('vaultx.pairedAt', 'pareado em')} {formatDate(c.createdAt, lang)}
                        {' · '}
                        {c.lastSeenAt ? `${t('vaultx.lastSeen', 'último uso')} ${formatDate(c.lastSeenAt, lang)}` : t('vaultx.never', 'nunca usado')}
                      </div>
                    </div>
                    <button
                      className={`${btn} hover:!text-red-300 hover:!border-red-500/40`}
                      disabled={busy !== null}
                      onClick={() => void run(`x:${c.id}`, () => vault.revokeBrowserClient(c.id))}
                    >
                      <Trash2 size={13} /> {t('vaultx.revoke', 'Revogar')}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dh-help">{t('vaultx.noClients', 'Nenhum navegador pareado. Abra a extensão e clique em "Parear com o DarkHub".')}</p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  )
}
