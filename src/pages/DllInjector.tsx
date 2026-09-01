import { useI18n } from '../i18n/I18nProvider';
import React, { useState } from 'react'
import { Activity, ShieldCheck, Crosshair, CheckCircle2, XCircle, Loader2, FolderOpen } from 'lucide-react'

export default function DllInjector() {
  const { t } = useI18n();
  const [processName, setProcessName] = useState('')
  const [dllPath, setDllPath] = useState('')
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [isInjecting, setIsInjecting] = useState(false)

  const handleSelectDll = async () => {
    try {

      const res = await window.darkhub?.dialog?.selectFiles({
        title: t('dllinjector.selectDll', 'Selecione a DLL para Injetar'),
        filters: [{ name: 'Dynamic Link Library', extensions: ['dll'] }]
      })

      if (res?.ok && res.files?.length > 0) {
        setDllPath(res.files[0])
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleInject = async () => {
    if (!processName.trim()) {
      setStatus({ ok: false, msg: t('dllinjector.errorNoProcess', 'Insira o nome do processo alvo (ex: hl2.exe ou hl2)') })
      return
    }
    if (!dllPath.trim()) {
      setStatus({ ok: false, msg: t('dllinjector.errorNoDll', 'Selecione o caminho da DLL') })
      return
    }

    setStatus(null)
    setIsInjecting(true)

    try {

      const res = await window.darkhub?.injector?.inject({
        processName: processName.trim(),
        dllPath: dllPath.trim()
      })

      if (res?.ok) {
        setStatus({ ok: true, msg: res.message || t('dllinjector.success', 'DLL injetada com sucesso no processo!') })
      } else {
        setStatus({ ok: false, msg: res?.error || t('dllinjector.errorGeneric', 'Ocorreu um erro durante a injeção.') })
      }
    } catch (err: any) {
      setStatus({ ok: false, msg: err?.message || String(err) })
    } finally {
      setIsInjecting(false)
    }
  }

  return (
    <div className="space-y-6 w-full">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Activity className="text-indigo-500" /> {t('dllinjector.title', 'DLL Injector')}
          </h1>
        </div>
        <p className="text-zinc-400">{t('dllinjector.desc', 'Injete bibliotecas dinâmicas em processos em execução com acesso de baixo nível via Thread Remota.')}</p>
      </div>

      <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900 space-y-6 relative overflow-hidden">
        {}
        <div className="absolute top-0 right-0 p-32 bg-indigo-500/5 blur-[120px] rounded-full pointer-events-none" />

        <div className="flex items-start gap-4 p-4 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm">
          <ShieldCheck className="shrink-0 mt-0.5" size={18} />
          <p>
            {t('dllinjector.warning', 'O motor de injeção utiliza a técnica robusta de CreateRemoteThread e LoadLibraryA. Lembre-se de rodar o processo alvo na mesma arquitetura do injetor (32/64 bits).')}
          </p>
        </div>

        <div className="space-y-4 relative z-10">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              {t('dllinjector.targetProcess', 'Processo Alvo')} <span className="text-zinc-500 font-normal">{t('dllinjector.noExtension', '(sem a extensão)')}</span>
            </label>
            <div className="relative">
              <Crosshair className="absolute left-3 top-1/2 -tranzinc-y-1/2 text-zinc-500" size={18} />
              <input
                type="text"
                placeholder="csgo, hl2, gta5..."
                value={processName}
                onChange={(e) => setProcessName(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-10 pr-4 py-2.5 text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              {t('dllinjector.dllPath', 'Caminho da DLL')}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="C:\Cheats\minhadll.dll"
                value={dllPath}
                onChange={(e) => setDllPath(e.target.value)}
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <button
                onClick={handleSelectDll}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors flex items-center gap-2 border border-zinc-700"
              >
                <FolderOpen size={18} />
                {t('dllinjector.browse', 'Procurar')}
              </button>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={handleInject}
              disabled={isInjecting}
              className="w-full md:w-auto px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isInjecting ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> {t('dllinjector.injecting', 'Injetando...')}
                </>
              ) : (
                <>
                  <Activity size={18} /> {t('dllinjector.inject', 'INJETAR DLL')}
                </>
              )}
            </button>
          </div>
        </div>

        {status && (
          <div className={`p-4 rounded-lg flex items-start gap-3 mt-4 animate-in fade-in slide-in-from-bottom-2 ${
            status.ok ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300' : 'bg-red-500/10 border border-red-500/20 text-red-300'
          }`}>
            {status.ok ? <CheckCircle2 className="shrink-0 mt-0.5" size={18} /> : <XCircle className="shrink-0 mt-0.5" size={18} />}
            <p className="text-sm">{status.msg}</p>
          </div>
        )}
      </div>
    </div>
  )
}
