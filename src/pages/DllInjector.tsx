import { useI18n } from '../i18n/I18nProvider';
import React, { useState } from 'react'
import { Activity, ShieldCheck, Crosshair, CheckCircle2, XCircle, Loader2, FolderOpen } from '../components/icons'
import PageHeader from '../components/ui/PageHeader'

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

      if (!res?.canceled && res?.filePaths?.length) {
        setDllPath(res.filePaths[0])
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
    <div className="w-full max-w-3xl">
      <PageHeader
        title={t('dllinjector.title', 'DLL Injector')}
        subtitle={t('dllinjector.desc', 'Injete bibliotecas dinâmicas em processos em execução com acesso de baixo nível via Thread Remota.')}
      />

      <section className="dh-card p-5 space-y-5">
        <p className="flex items-start gap-2.5 dh-help max-w-[75ch]">
          <ShieldCheck className="shrink-0 mt-[1px] text-zinc-500" size={14} />
          <span>{t('dllinjector.warning', 'O motor de injeção utiliza a técnica robusta de CreateRemoteThread e LoadLibraryA. Lembre-se de rodar o processo alvo na mesma arquitetura do injetor (32/64 bits).')}</span>
        </p>

        <div className="space-y-4">
          <div>
            <label htmlFor="dll-proc" className="dh-label block mb-1.5">
              {t('dllinjector.targetProcess', 'Processo Alvo')} <span className="text-zinc-600 font-normal">{t('dllinjector.noExtension', '(sem a extensão)')}</span>
            </label>
            <div className="relative">
              <Crosshair className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" size={14} />
              <input
                id="dll-proc"
                type="text"
                placeholder="csgo, hl2, gta5..."
                value={processName}
                onChange={(e) => setProcessName(e.target.value)}
                className="dh-input w-full pl-8 font-mono"
              />
            </div>
          </div>

          <div>
            <label htmlFor="dll-path" className="dh-label block mb-1.5">
              {t('dllinjector.dllPath', 'Caminho da DLL')}
            </label>
            <div className="flex gap-2">
              <input
                id="dll-path"
                type="text"
                placeholder="C:\Cheats\minhadll.dll"
                value={dllPath}
                onChange={(e) => setDllPath(e.target.value)}
                className="dh-input flex-1 min-w-0 font-mono"
              />
              <button type="button" onClick={handleSelectDll} className="dh-btn">
                <FolderOpen size={14} />
                {t('dllinjector.browse', 'Procurar')}
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-zinc-800/80">
          <button type="button" onClick={handleInject} disabled={isInjecting} className="dh-btn dh-btn-primary">
            {isInjecting ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
            {isInjecting ? t('dllinjector.injecting', 'Injetando...') : t('dllinjector.inject', 'INJETAR DLL')}
          </button>

          {status && (
            <p role="status" className={`flex items-start gap-2 text-[12.5px] animate-in ${status.ok ? 'text-emerald-300' : 'text-red-300'}`}>
              {status.ok ? <CheckCircle2 className="shrink-0 mt-[1px]" size={14} /> : <XCircle className="shrink-0 mt-[1px]" size={14} />}
              <span>{status.msg}</span>
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
