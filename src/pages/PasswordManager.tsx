import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, ChevronRight, Copy, Download, Eye, EyeOff, KeyRound, Lock, Plus, RefreshCw, Search, ShieldCheck, Trash2, Unlock, Upload } from '../components/icons'
import PageHeader from '../components/ui/PageHeader'
import { useI18n } from '../i18n/I18nProvider'
import { HelpTip } from '../components/HelpTip'
import BrowserExtensionSection from '../components/vault/BrowserExtensionSection'
import VaultTransferSection from '../components/vault/VaultTransferSection'

type VaultEntry = {
  id: string
  site: string
  username: string
  notes?: string
  createdAt?: number
  updatedAt?: number
}

function calculatePasswordStrength(pass: string): { score: number; label: string; color: string } {
  if (!pass) return { score: 0, label: 'Vazia', color: 'bg-zinc-700' }
  let score = 0
  if (pass.length >= 8) score += 20
  if (pass.length >= 14) score += 20
  if (pass.length >= 20) score += 15
  if (/[a-z]/.test(pass)) score += 10
  if (/[A-Z]/.test(pass)) score += 10
  if (/[0-9]/.test(pass)) score += 10
  if (/[^a-zA-Z0-9]/.test(pass)) score += 15

  if (score < 40) return { score, label: 'Fraca', color: 'bg-red-500' }
  if (score < 70) return { score, label: 'Média', color: 'bg-amber-500' }
  if (score < 90) return { score, label: 'Forte', color: 'bg-emerald-500' }
  return { score: 100, label: 'Blindada', color: 'bg-blue-400' }
}

const CLIPBOARD_CLEAR_MS = 20000
const REVEAL_TIMEOUT_MS = 30000

/** Copies a secret and wipes it from the clipboard after a delay if it is still there. */
async function copySecretWithAutoClear(secret: string) {
  await navigator.clipboard.writeText(secret)
  window.setTimeout(async () => {
    try {
      if ((await navigator.clipboard.readText()) === secret) await navigator.clipboard.writeText('')
    } catch {
      /* clipboard read not permitted: leave as is */
    }
  }, CLIPBOARD_CLEAR_MS)
}

function generateStrongPassword(length = 20, useLower = true, useUpper = true, useNums = true, useSyms = true) {
  const lowerChars = 'abcdefghijklmnopqrstuvwxyz'
  const upperChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const numChars = '0123456789'
  const symChars = '!@#$%^&*()-_=+[]{};:,.?'

  const sets: string[] = []
  const requiredChars: string[] = []

  const getRandomChar = (charset: string) => {
    const b = new Uint32Array(1)
    crypto.getRandomValues(b)
    return charset[b[0] % charset.length]
  }

  if (useLower) {
    sets.push(lowerChars)
    requiredChars.push(getRandomChar(lowerChars))
  }
  if (useUpper) {
    sets.push(upperChars)
    requiredChars.push(getRandomChar(upperChars))
  }
  if (useNums) {
    sets.push(numChars)
    requiredChars.push(getRandomChar(numChars))
  }
  if (useSyms) {
    sets.push(symChars)
    requiredChars.push(getRandomChar(symChars))
  }

  const allChars = sets.length > 0 ? sets.join('') : lowerChars
  const targetLen = Math.max(length, requiredChars.length)
  const remainingCount = targetLen - requiredChars.length

  const remainingChars: string[] = []
  if (remainingCount > 0) {
    const randomBytes = new Uint32Array(remainingCount)
    crypto.getRandomValues(randomBytes)
    for (let i = 0; i < remainingCount; i++) {
      remainingChars.push(allChars[randomBytes[i] % allChars.length])
    }
  }

  const combined = [...requiredChars, ...remainingChars]

  for (let i = combined.length - 1; i > 0; i--) {
    const b = new Uint32Array(1)
    crypto.getRandomValues(b)
    const j = b[0] % (i + 1)
    const temp = combined[i]
    combined[i] = combined[j]
    combined[j] = temp
  }

  return combined.join('')
}

export default function PasswordManager() {
  const { t } = useI18n()

  const [status, setStatus] = useState<{ initialized: boolean; locked: boolean; autoLockMinutes: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [masterPassword, setMasterPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [recoveryWordsShown, setRecoveryWordsShown] = useState<string[] | null>(null)
  const [recoveryPasswordShown, setRecoveryPasswordShown] = useState<string | null>(null)
  const [recoveryWordsInput, setRecoveryWordsInput] = useState('')

  const [entries, setEntries] = useState<VaultEntry[]>([])
  const [search, setSearch] = useState('')

  const [site, setSite] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [notes, setNotes] = useState('')

  const [visibleId, setVisibleId] = useState<string | null>(null)
  const [visiblePassword, setVisiblePassword] = useState<string>('')

  const [genLen, setGenLen] = useState(20)
  const [genLower, setGenLower] = useState(true)
  const [genUpper, setGenUpper] = useState(true)
  const [genNums, setGenNums] = useState(true)
  const [genSyms, setGenSyms] = useState(true)
  const [genResult, setGenResult] = useState('')

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) => (e.site ?? '').toLowerCase().includes(q) || (e.username ?? '').toLowerCase().includes(q))
  }, [entries, search])

  const refreshStatus = async () => {
    if (!window.darkhub?.vault) return
    try {
      const s = await window.darkhub.vault.status()
      setStatus(s)
    } catch (err: any) {
      setError(err?.message ?? String(err))
    }
  }

  const refreshEntries = async () => {
    if (!window.darkhub?.vault) return
    try {
      const res = await window.darkhub.vault.list()
      if (res?.ok) setEntries(res.entries ?? [])
    } catch {
      // vault auto-locked in the main process: resync the UI state
      setEntries([])
      await refreshStatus()
    }
  }

  // Never keep a revealed password on screen indefinitely.
  useEffect(() => {
    if (!visibleId) return
    const timer = window.setTimeout(() => {
      setVisibleId(null)
      setVisiblePassword('')
    }, REVEAL_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [visibleId])

  useEffect(() => {
    refreshStatus()
  }, [])

  useEffect(() => {
    if (status && status.initialized && !status.locked) {
      refreshEntries()
    }
  }, [status?.initialized, status?.locked])

  const handleInit = async () => {
    setError(null)
    if (!window.darkhub?.vault) return
    if (masterPassword.length < 8) {
      setError(t('passwords.errInvalidMaster'))
      return
    }
    if (masterPassword !== confirmPassword) {
      setError(t('passwords.errMismatch'))
      return
    }

    setBusy(true)
    try {
      const res = await window.darkhub.vault.init({ masterPassword })
      if (!res?.ok) {
        setError(res?.error ?? t('passwords.errCreate'))
        return
      }
      setRecoveryWordsShown(res.recoveryWords ?? [])
      setRecoveryPasswordShown(res.recoveryPassword ?? null)
      await window.darkhub.vault.unlock({ masterPassword })
      setMasterPassword('')
      setConfirmPassword('')
      await refreshStatus()
      await refreshEntries()
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleUnlock = async () => {
    setError(null)
    if (!window.darkhub?.vault) return
    setBusy(true)
    try {
      const res = await window.darkhub.vault.unlock({ masterPassword })
      if (!res?.ok) {
        setError(res?.error ?? t('passwords.errUnlock'))
        return
      }
      setMasterPassword('')
      await refreshStatus()
      await refreshEntries()
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleUnlockWithRecovery = async () => {
    setError(null)
    if (!window.darkhub?.vault) return
    setBusy(true)
    try {
      const res = await window.darkhub.vault.unlockWithRecoveryWords({ words: recoveryWordsInput })
      if (!res?.ok) {
        setError(res?.error ?? t('passwords.errRecover'))
        return
      }
      setRecoveryWordsInput('')
      await refreshStatus()
      await refreshEntries()
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleLock = async () => {
    setError(null)
    if (!window.darkhub?.vault) return
    setBusy(true)
    try {
      await window.darkhub.vault.lock()
      setEntries([])
      setVisibleId(null)
      setVisiblePassword('')
      await refreshStatus()
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleAdd = async () => {
    setError(null)
    if (!window.darkhub?.vault) return
    if (!site.trim() || !username.trim() || !password) return
    setBusy(true)
    try {
      const res = await window.darkhub.vault.add({ site, username, password, notes })
      if (!res?.ok) {
        setError(res?.error ?? t('passwords.errSave'))
        return
      }
      setSite('')
      setUsername('')
      setPassword('')
      setNotes('')
      await refreshEntries()
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async (id: string) => {
    setError(null)
    if (!window.darkhub?.vault) return
    setBusy(true)
    try {
      const res = await window.darkhub.vault.remove({ id })
      if (!res?.ok) {
        setError(res?.error ?? t('passwords.errDelete'))
        return
      }
      if (visibleId === id) {
        setVisibleId(null)
        setVisiblePassword('')
      }
      await refreshEntries()
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setBusy(false)
    }
  }

  const toggleReveal = async (id: string) => {
    setError(null)
    if (!window.darkhub?.vault) return
    if (visibleId === id) {
      setVisibleId(null)
      setVisiblePassword('')
      return
    }
    setBusy(true)
    try {
      const res = await window.darkhub.vault.reveal({ id })
      if (!res?.ok) {
        setError(res?.error ?? t('passwords.errReveal'))
        return
      }
      setVisibleId(id)
      setVisiblePassword(res.password ?? '')
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleCopyPassword = async (id: string) => {
    setError(null)
    if (!window.darkhub?.vault) return
    setBusy(true)
    try {
      const res = await window.darkhub.vault.copyPassword({ id })
      if (!res?.ok) setError(res?.error ?? t('passwords.errCopy'))
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleExport = async () => {
    setError(null)
    if (!window.darkhub?.vault || !window.darkhub?.dialog) return
    setBusy(true)
    try {
      const folder = await window.darkhub.dialog.selectFolder({ title: t('passwords.export') })
      if (folder?.canceled || !folder?.folderPath) return
      const targetPath = `${folder.folderPath}\\darkhub_vault_backup.dhv`
      const res = await window.darkhub.vault.export({ targetPath })
      if (!res?.ok) setError(res?.error ?? t('passwords.errExport'))
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleImport = async () => {
    setError(null)
    if (!window.darkhub?.vault || !window.darkhub?.dialog) return
    setBusy(true)
    try {
      const picked = await window.darkhub.dialog.selectFiles({
        title: t('passwords.import'),
        filters: [{ name: 'DarkHub Vault', extensions: ['dhv'] }]
      })
      const sourcePath = picked?.filePaths?.[0]
      if (picked?.canceled || !sourcePath) return
      const res = await window.darkhub.vault.import({ sourcePath })
      if (!res?.ok) setError(res?.error ?? t('passwords.errImport'))
      await refreshStatus()
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setBusy(false)
    }
  }

  const showInit = status && !status.initialized
  const showLocked = status && status.initialized && status.locked
  const showUnlocked = status && status.initialized && !status.locked
  const vaultAvailable = Boolean(window.darkhub?.vault)

  const iconBtn = 'inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 transition-colors disabled:opacity-40'

  return (
    <div className="w-full max-w-6xl mx-auto">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            {t('passwords.title')}
            <HelpTip
              title="Cofre de senhas"
              description="Armazena credenciais criptografadas localmente e bloqueia o acesso quando o cofre está fechado."
              sections={[
                { title: 'Chave mestra', content: 'A senha mestra nunca deve ser enviada para suporte e não fica legível no app.' },
                { title: 'Recuperação', content: 'As palavras de recuperação aparecem apenas na criação ou quando você regera.' }
              ]}
              buttonLabel={t('help.button')}
            />
          </span>
        }
        subtitle={t('passwords.subtitle')}
        actions={showUnlocked ? (
          <>
            <button onClick={handleImport} disabled={busy} className="dh-btn dh-btn-ghost">
              <Upload size={14} />
              <span>{t('passwords.import')}</span>
            </button>
            <button onClick={handleExport} disabled={busy} className="dh-btn dh-btn-ghost">
              <Download size={14} />
              <span>{t('passwords.export')}</span>
            </button>
            <button onClick={handleLock} disabled={busy} className="dh-btn">
              <Lock size={14} />
              <span>{t('passwords.lock')}</span>
            </button>
          </>
        ) : null}
      />

      <div className="h-[2px] -mt-6 mb-6 overflow-hidden" aria-hidden={!busy}>
        {busy ? <div className="h-full w-1/3 bg-blue-400/70 animate-pulse" /> : null}
      </div>
      {busy ? <span className="sr-only" role="status">Processando operação do cofre</span> : null}

      {error ? (
        <p role="alert" className="mb-5 flex items-start gap-2 text-[12.5px] text-red-400">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}

      {!status ? (
        vaultAvailable ? (
          <div className="mx-auto max-w-sm pt-10 space-y-4" aria-busy="true">
            <div className="h-5 w-5 rounded bg-zinc-900 animate-pulse" />
            <div className="h-4 w-40 rounded bg-zinc-900 animate-pulse" />
            <div className="h-3 w-64 rounded bg-zinc-900 animate-pulse" />
            <div className="h-8 w-full rounded-md bg-zinc-900 animate-pulse" />
            <div className="h-8 w-full rounded-md bg-zinc-900 animate-pulse" />
          </div>
        ) : (
          <div className="mx-auto max-w-sm pt-10">
            <Lock size={20} className="text-zinc-500" />
            <p className="mt-4 text-[13px] text-zinc-300">O serviço do cofre não está disponível nesta sessão.</p>
            <button onClick={() => void refreshStatus()} className="dh-btn mt-4">
              <RefreshCw size={14} /> Tentar novamente
            </button>
          </div>
        )
      ) : null}

      {recoveryWordsShown ? (
        <section className="mx-auto max-w-2xl mb-10 dh-card p-6 space-y-5">
          <div>
            <h2 className="dh-section-title">{t('passwords.recoveryTitle')}</h2>
            <p className="mt-1 flex items-start gap-1.5 text-[12.5px] text-amber-300/90 max-w-[65ch]">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{t('passwords.recoveryHint')}</span>
            </p>
          </div>
          <ol className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 rounded-lg border border-zinc-800/80 bg-zinc-950 p-4 font-mono text-[13px] text-zinc-100 select-all">
            {recoveryWordsShown.map((w, i) => (
              <li key={i} className="flex items-baseline gap-2">
                <span className="w-5 text-right text-[11px] text-zinc-600">{i + 1}</span>
                <span>{w}</span>
              </li>
            ))}
          </ol>
          {recoveryPasswordShown ? (
            <div className="text-[12px] text-zinc-500">
              {t('passwords.recoveryPasswordLabel')}: <span className="font-mono text-zinc-200 select-all">{recoveryPasswordShown}</span>
            </div>
          ) : null}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setRecoveryWordsShown(null)
                setRecoveryPasswordShown(null)
              }}
              className="dh-btn dh-btn-primary"
            >
              <Check size={14} />
              {t('passwords.done')}
            </button>
            <button
              onClick={() => void copySecretWithAutoClear(recoveryWordsShown.join(' ')).catch(() => {})}
              className="dh-btn"
            >
              <Copy size={14} />
              {t('passwords.copy')}
            </button>
            <span className="self-center dh-help">A área de transferência é limpa em <span className="font-mono">{CLIPBOARD_CLEAR_MS / 1000}s</span>.</span>
          </div>
        </section>
      ) : null}

      {showInit ? (
        <section className="mx-auto max-w-sm pt-8 pb-12">
          <ShieldCheck size={20} className="text-zinc-400" />
          <h2 className="mt-5 flex items-center gap-1.5 text-[17px] font-semibold tracking-[-0.015em] text-zinc-50">
            {t('passwords.initTitle')}
            <HelpTip
              title="Criar cofre"
              description="Cria um cofre local criptografado com uma senha mestra de no mínimo 8 caracteres."
              sections={[
                { title: 'Boa prática', content: 'Use uma frase longa e única. O app não consegue recuperar a senha mestra sem as palavras de recuperação.' }
              ]}
              buttonLabel={t('help.button')}
            />
          </h2>
          <p className="dh-help mt-1">Mínimo de 8 caracteres. Prefira uma frase longa e única.</p>
          <form
            className="mt-6 space-y-3"
            onSubmit={(e) => { e.preventDefault(); if (!busy) void handleInit() }}
          >
            <div>
              <label htmlFor="vault-master-new" className="dh-label block mb-1.5">{t('passwords.masterPassword')}</label>
              <input
                id="vault-master-new"
                type="password"
                autoComplete="new-password"
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                autoFocus
                className="dh-input w-full font-mono"
              />
              {masterPassword ? <StrengthMeter value={masterPassword} /> : null}
            </div>
            <div>
              <label htmlFor="vault-master-confirm" className="dh-label block mb-1.5">{t('passwords.confirmPassword')}</label>
              <input
                id="vault-master-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="dh-input w-full font-mono"
              />
            </div>
            <button type="submit" disabled={busy} className="dh-btn dh-btn-primary w-full !mt-5">
              <Plus size={14} />
              <span>{t('passwords.create')}</span>
            </button>
          </form>
        </section>
      ) : null}

      {showLocked ? (
        <section className="mx-auto max-w-sm pt-8 pb-12">
          <Lock size={20} className="text-zinc-400" />
          <h2 className="mt-5 flex items-center gap-1.5 text-[17px] font-semibold tracking-[-0.015em] text-zinc-50">
            {t('passwords.unlockTitle')}
            <HelpTip
              title="Desbloquear cofre"
              description="Libera a sessão atual para listar, revelar e copiar senhas até o bloqueio manual ou automático."
              sections={[
                { title: 'Bloqueio automático', content: 'O tempo de bloqueio automático pode ser ajustado nas configurações de segurança.' }
              ]}
              buttonLabel={t('help.button')}
            />
          </h2>
          {status?.autoLockMinutes ? (
            <p className="dh-help mt-1">Bloqueio automático após <span className="font-mono text-zinc-400">{status.autoLockMinutes} min</span> sem uso.</p>
          ) : null}

          <form
            className="mt-6 space-y-3"
            onSubmit={(e) => { e.preventDefault(); if (masterPassword && !busy) void handleUnlock() }}
          >
            <div>
              <label htmlFor="vault-master" className="dh-label block mb-1.5">{t('passwords.masterPassword')}</label>
              <input
                id="vault-master"
                type="password"
                autoComplete="current-password"
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                autoFocus
                className="dh-input w-full font-mono"
              />
            </div>
            <button type="submit" disabled={busy || !masterPassword} className="dh-btn dh-btn-primary w-full">
              <Unlock size={14} />
              <span>{t('passwords.unlock')}</span>
            </button>
          </form>

          <details className="group mt-8 border-t border-zinc-800/80 pt-4">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] text-zinc-400 hover:text-zinc-200">
              <ChevronRight size={14} className="transition-transform duration-150 group-open:rotate-90" />
              {t('passwords.recoveryTitle')}
              <span onClick={(e) => e.preventDefault()}>
                <HelpTip
                  title="Recuperação"
                  description="Permite desbloquear o cofre usando as palavras criadas junto com o cofre."
                  sections={[
                    { title: 'Cuidado', content: 'Cole somente em ambiente confiável. As palavras equivalem a uma chave de recuperação.' }
                  ]}
                  buttonLabel={t('help.button')}
                />
              </span>
            </summary>
            <div className="mt-3 space-y-3">
              <textarea
                value={recoveryWordsInput}
                onChange={(e) => setRecoveryWordsInput(e.target.value)}
                placeholder={t('passwords.recoveryTitle')}
                aria-label={t('passwords.recoveryTitle')}
                spellCheck={false}
                autoComplete="off"
                className="dh-input w-full h-24 py-2 font-mono resize-none"
              />
              <button
                onClick={handleUnlockWithRecovery}
                disabled={busy || !recoveryWordsInput.trim()}
                className="dh-btn w-full"
              >
                <KeyRound size={14} />
                <span>{t('passwords.unlock')}</span>
              </button>
            </div>
          </details>
        </section>
      ) : null}

      {showUnlocked ? (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-8 items-start">
          <section className="min-w-0" aria-label={t('passwords.title')}>
            <div className="flex items-center justify-between gap-4 mb-3">
              <div className="relative w-full max-w-sm">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                <input
                  type="search"
                  placeholder={t('passwords.search')}
                  aria-label={t('passwords.search')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="dh-input w-full pl-8"
                />
              </div>
              <span className="font-mono text-[12px] text-zinc-500 shrink-0">{filteredEntries.length}<span className="text-zinc-600">/{entries.length}</span></span>
            </div>

            {filteredEntries.length ? (
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="text-[11px] text-zinc-500 border-b border-zinc-800/80">
                    <th className="py-2 pr-4 font-normal">{t('passwords.site')}</th>
                    <th className="py-2 pr-4 font-normal">{t('passwords.username')}</th>
                    <th className="py-2 pr-4 font-normal">{t('passwords.password')}</th>
                    <th className="py-2 font-normal text-right"><span className="sr-only">{t('common.actions')}</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {filteredEntries.map((entry) => {
                    const revealed = visibleId === entry.id
                    return (
                      <tr key={entry.id} className="group hover:bg-zinc-900/50 transition-colors">
                        <td className="py-2.5 pr-4 font-medium text-zinc-100 max-w-[200px] truncate" title={entry.site}>{entry.site}</td>
                        <td className="py-2.5 pr-4 text-zinc-400 max-w-[200px] truncate" title={entry.username}>{entry.username}</td>
                        <td className={`py-2.5 pr-4 font-mono text-[12.5px] ${revealed ? 'text-zinc-50 select-all break-all' : 'text-zinc-600 tracking-[0.15em]'}`}>
                          {revealed ? visiblePassword : '••••••••••••'}
                        </td>
                        <td className="py-2.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-0.5">
                            <button
                              onClick={() => toggleReveal(entry.id)}
                              disabled={busy}
                              className={iconBtn}
                              title={revealed ? t('passwords.hide') : t('passwords.reveal')}
                              aria-label={revealed ? t('passwords.hide') : t('passwords.reveal')}
                            >
                              {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                            <button
                              onClick={() => handleCopyPassword(entry.id)}
                              disabled={busy}
                              className={iconBtn}
                              title={t('passwords.copyPassword')}
                              aria-label={t('passwords.copyPassword')}
                            >
                              <Copy size={16} />
                            </button>
                            <button
                              onClick={() => handleRemove(entry.id)}
                              disabled={busy}
                              className={`${iconBtn} hover:!text-red-300 hover:!bg-red-500/10`}
                              title={t('passwords.delete')}
                              aria-label={t('passwords.delete')}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : entries.length ? (
              <p className="py-12 text-[12.5px] text-zinc-500">
                Nenhuma credencial corresponde a <span className="font-mono text-zinc-300">"{search}"</span>.
                <button onClick={() => setSearch('')} className="ml-2 text-zinc-300 underline underline-offset-2 hover:text-zinc-100">Limpar busca</button>
              </p>
            ) : (
              <div className="py-12 border-t border-zinc-800/80">
                <p className="text-[13px] text-zinc-300">O cofre está vazio.</p>
                <p className="dh-help mt-0.5">Adicione a primeira credencial no formulário ao lado.</p>
              </div>
            )}
            {visibleId ? (
              <p className="dh-help mt-3">A senha revelada é ocultada automaticamente em <span className="font-mono">{REVEAL_TIMEOUT_MS / 1000}s</span>.</p>
            ) : null}
          </section>

          <aside className="dh-card p-5 space-y-5 lg:sticky lg:top-4">
            <div className="flex items-center gap-1.5">
              <h2 className="dh-section-title">{t('passwords.addTitle')}</h2>
              <HelpTip
                title="Nova credencial"
                description="Salva site, usuário, senha e notas no cofre criptografado."
                sections={[
                  { title: 'Gerador', content: 'O botão de gerar usa crypto.getRandomValues do navegador para criar uma senha forte localmente.' }
                ]}
                buttonLabel={t('help.button')}
              />
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor="vault-site" className="dh-label block mb-1.5">{t('passwords.site')}</label>
                <input id="vault-site" type="text" value={site} onChange={(e) => setSite(e.target.value)} autoComplete="off" className="dh-input w-full" />
              </div>
              <div>
                <label htmlFor="vault-user" className="dh-label block mb-1.5">{t('passwords.username')}</label>
                <input id="vault-user" type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" className="dh-input w-full" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="vault-pass" className="dh-label">{t('passwords.password')}</label>
                  <button
                    onClick={() => {
                      const pass = generateStrongPassword(genLen, genLower, genUpper, genNums, genSyms);
                      setPassword(pass);
                      setGenResult(pass);
                    }}
                    className="inline-flex items-center gap-1 text-[12px] text-zinc-400 hover:text-blue-300 transition-colors disabled:opacity-50"
                    disabled={busy}
                  >
                    <KeyRound size={14} />
                    <span>Gerar senha</span>
                  </button>
                </div>
                <input
                  id="vault-pass"
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  className="dh-input w-full font-mono"
                />
                {password ? <StrengthMeter value={password} /> : null}
              </div>
              <div>
                <label htmlFor="vault-notes" className="dh-label block mb-1.5">{t('passwords.notes')}</label>
                <textarea id="vault-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="dh-input w-full h-16 py-2 resize-none" />
              </div>
            </div>

            <details className="group rounded-lg border border-zinc-800/80 bg-zinc-950/50">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 h-9 text-[12.5px] text-zinc-400 hover:text-zinc-200">
                <ChevronRight size={14} className="transition-transform duration-150 group-open:rotate-90" />
                Opções do gerador
                <span className="ml-auto font-mono text-[11.5px] text-zinc-500">{genLen} car.</span>
              </summary>
              <div className="px-3 pb-3 space-y-3">
                <label className="flex items-center justify-between gap-3 text-[12.5px] text-zinc-300">
                  <span>Tamanho</span>
                  <input type="range" min="8" max="64" value={genLen} onChange={(e) => setGenLen(Number(e.target.value))} className="flex-1" aria-label="Tamanho da senha" />
                  <span className="w-6 text-right font-mono text-zinc-100">{genLen}</span>
                </label>
                <div className="grid grid-cols-2 gap-2 text-[12.5px] text-zinc-300">
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={genUpper} onChange={e => setGenUpper(e.target.checked)} /><span>Maiúsculas <span className="font-mono text-zinc-500">A-Z</span></span></label>
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={genLower} onChange={e => setGenLower(e.target.checked)} /><span>Minúsculas <span className="font-mono text-zinc-500">a-z</span></span></label>
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={genNums} onChange={e => setGenNums(e.target.checked)} /><span>Números <span className="font-mono text-zinc-500">0-9</span></span></label>
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={genSyms} onChange={e => setGenSyms(e.target.checked)} /><span>Símbolos <span className="font-mono text-zinc-500">!@#$</span></span></label>
                </div>
                {genResult && (
                  <div className="flex items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-2">
                    <div className="font-mono text-[12px] text-zinc-100 break-all select-all">{genResult}</div>
                    <button
                      onClick={() => void copySecretWithAutoClear(genResult).catch(() => {})}
                      className={iconBtn}
                      title="Copiar"
                      aria-label="Copiar"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                )}
              </div>
            </details>

            <button
              onClick={handleAdd}
              disabled={busy || !site.trim() || !username.trim() || !password}
              className="dh-btn dh-btn-primary w-full"
            >
              <Plus size={14} />
              <span>{t('passwords.save')}</span>
            </button>
          </aside>
        </div>
      ) : null}

      {showUnlocked ? <BrowserExtensionSection /> : null}
      <VaultTransferSection unlocked={Boolean(showUnlocked)} onReceived={() => { void refreshStatus() }} />
    </div>
  )
}

function StrengthMeter({ value }: { value: string }) {
  const strength = calculatePasswordStrength(value)
  return (
    <div className="flex items-center gap-2 pt-2" aria-label={`Força: ${strength.label}`}>
      <div className="flex-1 h-[3px] bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full ${strength.color} transition-[width] duration-200`} style={{ width: `${strength.score}%` }} />
      </div>
      <span className="text-[11px] text-zinc-400 w-14 text-right">{strength.label}</span>
    </div>
  )
}
