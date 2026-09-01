import React, { useEffect, useMemo, useState } from 'react'
import { Download, Eye, EyeOff, KeyRound, Lock, Plus, Trash2, Unlock, Upload } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'
import { HelpTip } from '../components/HelpTip'

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
  return { score: 100, label: 'Blindada', color: 'bg-cyan-400' }
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
    const s = await window.darkhub.vault.status()
    setStatus(s)
  }

  const refreshEntries = async () => {
    if (!window.darkhub?.vault) return
    const res = await window.darkhub.vault.list()
    if (res?.ok) setEntries(res.entries ?? [])
  }

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
      await refreshStatus()
      await refreshEntries()
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
      await refreshStatus()
      await refreshEntries()
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
      await refreshStatus()
      await refreshEntries()
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
    } finally {
      setBusy(false)
    }
  }

  const showInit = status && !status.initialized
  const showLocked = status && status.initialized && status.locked
  const showUnlocked = status && status.initialized && !status.locked

  return (
    <div className="space-y-6 w-full">
      <div className="flex justify-between items-end gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-white">{t('passwords.title')}</h1>
            <HelpTip
              title="Cofre de senhas"
              description="Armazena credenciais criptografadas localmente e bloqueia o acesso quando o cofre esta fechado."
              sections={[
                { title: 'Chave mestra', content: 'A senha mestra nunca deve ser enviada para suporte e nao fica legivel no app.' },
                { title: 'Recuperacao', content: 'As palavras de recuperacao aparecem apenas na criacao ou quando voce regera.' }
              ]}
              buttonLabel={t('help.button')}
            />
          </div>
          <p className="text-zinc-400">{t('passwords.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {showUnlocked ? (
            <>
              <button
                onClick={handleImport}
                disabled={busy}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg flex items-center space-x-2 transition-colors disabled:opacity-50"
              >
                <Upload size={18} />
                <span>{t('passwords.import')}</span>
              </button>
              <button
                onClick={handleExport}
                disabled={busy}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg flex items-center space-x-2 transition-colors disabled:opacity-50"
              >
                <Download size={18} />
                <span>{t('passwords.export')}</span>
              </button>
              <button
                onClick={handleLock}
                disabled={busy}
                className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-300 rounded-lg flex items-center space-x-2 transition-colors disabled:opacity-50"
              >
                <Lock size={18} />
                <span>{t('passwords.lock')}</span>
              </button>
            </>
          ) : null}
        </div>
      </div>

      {error ? <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-200 text-sm">{error}</div> : null}
      {busy ? (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-blue-200">
            <span>Processando operacao do cofre</span>
            <span>Criptografia local</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-blue-400" />
          </div>
        </div>
      ) : null}

      {recoveryWordsShown ? (
        <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">{t('passwords.recoveryTitle')}</h2>
            <p className="text-zinc-400 text-sm">{t('passwords.recoveryHint')}</p>
          </div>
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 font-mono text-sm text-zinc-200 whitespace-pre-wrap">
            {recoveryWordsShown.join(' ')}
          </div>
          {recoveryPasswordShown ? (
            <div className="text-xs text-zinc-400">
              {t('passwords.recoveryPasswordLabel')}: <span className="font-mono text-zinc-200">{recoveryPasswordShown}</span>
            </div>
          ) : null}
          <div className="flex gap-2">
            <button
              onClick={() => navigator.clipboard.writeText(recoveryWordsShown.join(' '))}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
            >
              {t('passwords.copy')}
            </button>
            <button
              onClick={() => {
                setRecoveryWordsShown(null)
                setRecoveryPasswordShown(null)
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
            >
              {t('passwords.done')}
            </button>
          </div>
        </div>
      ) : null}

      {showInit ? (
        <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900 space-y-4 max-w-xl">
          <div className="flex items-center gap-2 text-white font-semibold">
            <Unlock size={18} />
            <span>{t('passwords.initTitle')}</span>
            <HelpTip
              title="Criar cofre"
              description="Cria um cofre local criptografado com uma senha mestra de no minimo 8 caracteres."
              sections={[
                { title: 'Boa pratica', content: 'Use uma frase longa e unica. O app nao consegue recuperar a senha mestra sem as palavras de recuperacao.' }
              ]}
              buttonLabel={t('help.button')}
            />
          </div>
          <input
            type="password"
            placeholder={t('passwords.masterPassword')}
            value={masterPassword}
            onChange={(e) => setMasterPassword(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
          />
          <input
            type="password"
            placeholder={t('passwords.confirmPassword')}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleInit}
            disabled={busy}
            className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            <Plus size={18} />
            <span>{t('passwords.create')}</span>
          </button>
        </div>
      ) : null}

      {showLocked ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900 space-y-4">
            <div className="flex items-center gap-2 text-white font-semibold">
              <Unlock size={18} />
              <span>{t('passwords.unlockTitle')}</span>
              <HelpTip
                title="Desbloquear cofre"
                description="Libera a sessao atual para listar, revelar e copiar senhas ate o bloqueio manual ou automatico."
                sections={[
                  { title: 'Auto-lock', content: 'O tempo de bloqueio automatico pode ser ajustado nas configurações de seguranca.' }
                ]}
                buttonLabel={t('help.button')}
              />
            </div>
            <input
              type="password"
              placeholder={t('passwords.masterPassword')}
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleUnlock}
              disabled={busy}
              className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              <Unlock size={18} />
              <span>{t('passwords.unlock')}</span>
            </button>
          </div>

          <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900 space-y-4">
            <div className="flex items-center gap-2 text-white font-semibold">
              <span>{t('passwords.recoveryTitle')}</span>
              <HelpTip
                title="Recuperacao"
                description="Permite desbloquear o cofre usando as palavras criadas junto com o cofre."
                sections={[
                  { title: 'Cuidado', content: 'Cole somente em ambiente confiavel. As palavras equivalem a uma chave de recuperacao.' }
                ]}
                buttonLabel={t('help.button')}
              />
            </div>
            <textarea
              value={recoveryWordsInput}
              onChange={(e) => setRecoveryWordsInput(e.target.value)}
              placeholder={t('passwords.recoveryTitle')}
              className="w-full h-28 bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleUnlockWithRecovery}
              disabled={busy || !recoveryWordsInput.trim()}
              className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              <KeyRound size={18} />
              <span>{t('passwords.unlock')}</span>
            </button>
          </div>
        </div>
      ) : null}

      {showUnlocked ? (
        <>
          <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900 space-y-4">
            <div className="flex justify-between items-center gap-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-white">{t('passwords.addTitle')}</h2>
                <HelpTip
                  title="Nova credencial"
                  description="Salva site, usuario, senha e notas no cofre criptografado."
                  sections={[
                    { title: 'Gerador', content: 'O botao de gerar usa crypto.getRandomValues do navegador para criar uma senha forte localmente.' }
                  ]}
                  buttonLabel={t('help.button')}
                />
              </div>
              <button
                onClick={() => {
                  const pass = generateStrongPassword(genLen, genLower, genUpper, genNums, genSyms);
                  setPassword(pass);
                  setGenResult(pass);
                }}
                className="text-sm text-emerald-400 hover:text-emerald-300 flex items-center space-x-1"
                disabled={busy}
              >
                <KeyRound size={16} />
                <span>Gerar Senha Avançada</span>
              </button>
            </div>

            {}
            <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 space-y-4">
               <div className="flex items-center justify-between">
                 <label className="text-sm text-zinc-300">Tamanho da senha: <span className="font-semibold text-white">{genLen}</span> caracteres</label>
                 <input type="range" min="8" max="64" value={genLen} onChange={(e) => setGenLen(Number(e.target.value))} className="w-1/2 accent-blue-500 cursor-pointer" />
               </div>
               <div className="flex flex-wrap gap-4 text-sm text-zinc-300">
                  <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={genUpper} onChange={e => setGenUpper(e.target.checked)} className="rounded accent-blue-500" /><span>Maiúsculas (A-Z)</span></label>
                  <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={genLower} onChange={e => setGenLower(e.target.checked)} className="rounded accent-blue-500" /><span>Minúsculas (a-z)</span></label>
                  <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={genNums} onChange={e => setGenNums(e.target.checked)} className="rounded accent-blue-500" /><span>Números (0-9)</span></label>
                  <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={genSyms} onChange={e => setGenSyms(e.target.checked)} className="rounded accent-blue-500" /><span>Símbolos (!@#$)</span></label>
               </div>
               {genResult && (
                 <div className="mt-2 flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                   <div className="font-mono text-sm text-emerald-400 break-all select-all">{genResult}</div>
                   <button
                     onClick={() => {
                       navigator.clipboard.writeText(genResult)
                     }}
                     className="ml-3 shrink-0 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs transition-colors"
                   >
                     Copiar
                   </button>
                 </div>
               )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input
                type="text"
                placeholder={t('passwords.site')}
                value={site}
                onChange={(e) => setSite(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              />
              <input
                type="text"
                placeholder={t('passwords.username')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              />
              <div className="space-y-1">
                <input
                  type="text"
                  placeholder={t('passwords.password')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                />
                {password && (() => {
                  const strength = calculatePasswordStrength(password);
                  return (
                    <div className="flex items-center gap-2 pt-1">
                      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className={`h-full ${strength.color} transition-all duration-300`} style={{ width: `${strength.score}%` }} />
                      </div>
                      <span className="text-[11px] font-medium text-zinc-400">{strength.label}</span>
                    </div>
                  );
                })()}
              </div>
            </div>
            <textarea
              placeholder={t('passwords.notes')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleAdd}
              disabled={busy || !site.trim() || !username.trim() || !password}
              className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              <Plus size={18} />
              <span>{t('passwords.save')}</span>
            </button>
          </div>

          <div className="flex items-center justify-between gap-4">
            <input
              type="text"
              placeholder={t('passwords.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 w-full max-w-md"
            />
          </div>

          {filteredEntries.length ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm text-zinc-400">
                <thead className="bg-zinc-950 text-zinc-300">
                  <tr>
                    <th className="px-6 py-3 font-medium">{t('passwords.site')}</th>
                    <th className="px-6 py-3 font-medium">{t('passwords.username')}</th>
                    <th className="px-6 py-3 font-medium">{t('passwords.password')}</th>
                    <th className="px-6 py-3 font-medium text-right">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {filteredEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-zinc-800/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-white">{entry.site}</td>
                      <td className="px-6 py-4">{entry.username}</td>
                      <td className="px-6 py-4 font-mono">{visibleId === entry.id ? visiblePassword : '••••••••••••'}</td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => toggleReveal(entry.id)}
                          disabled={busy}
                          className="p-2 text-zinc-400 hover:text-white bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
                          title={visibleId === entry.id ? t('passwords.hide') : t('passwords.reveal')}
                        >
                          {visibleId === entry.id ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                        <button
                          onClick={() => handleCopyPassword(entry.id)}
                          disabled={busy}
                          className="p-2 text-zinc-400 hover:text-white bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
                          title={t('passwords.copyPassword')}
                        >
                          <KeyRound size={16} />
                        </button>
                        <button
                          onClick={() => handleRemove(entry.id)}
                          disabled={busy}
                          className="p-2 text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors disabled:opacity-50"
                          title={t('passwords.delete')}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
