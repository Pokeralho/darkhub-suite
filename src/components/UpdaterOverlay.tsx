import React, { useState, useEffect } from 'react';
import {
  DownloadCloud, CheckCircle2, AlertCircle, X, ShieldCheck,
  RefreshCw, FileCode, Check, ChevronDown, DarkHubMark, Power
} from './icons';

type UpdateStage = 'idle' | 'checking' | 'available' | 'downloading' | 'verifying' | 'downloaded' | 'error';

export default function UpdaterOverlay() {
  const [stage, setStage] = useState<UpdateStage>('idle');
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState('');
  const [sizes, setSizes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);

  useEffect(() => {
    const handleEvent = (payload: any) => {
      console.log('[UpdaterOverlay] Event received:', payload);
      switch (payload.type) {
        case 'checking':
          setStage('checking');
          break;
        case 'available':
          setStage('available');
          setUpdateInfo(payload.info);
          setErrorMsg(null);
          setVisible(true);
          break;
        case 'not-available':
          setStage('idle');
          break;
        case 'progress':
          setStage('downloading');
          setProgress(payload.percent ?? 0);
          if (payload.bytesPerSecond) {
            const mbps = (payload.bytesPerSecond / (1024 * 1024)).toFixed(2);
            setSpeed(`${mbps} MB/s`);
          }
          if (payload.transferred && payload.total) {
            const trans = (payload.transferred / (1024 * 1024)).toFixed(1);
            const tot = (payload.total / (1024 * 1024)).toFixed(1);
            setSizes(`${trans} MB / ${tot} MB`);
          }
          break;
        case 'verifying':
          setStage('verifying');
          setProgress(100);
          break;
        case 'downloaded':
          setStage('downloaded');
          setProgress(100);
          break;
        case 'error':
          setStage('error');
          setErrorMsg(payload.message || 'Falha ao processar atualização.');
          break;
        default:
          break;
      }
    };

    const initUpdater = async () => {
      if (window.darkhub?.updater) {
        try {
          const status = await window.darkhub.updater.getStatus();
          if (status) {
            if (status.state && status.state !== 'idle') {
              setStage(status.state);
              if (status.updateInfo) {
                setUpdateInfo(status.updateInfo);
                setVisible(true);
              }
            }
          }
          const unsubscribe = window.darkhub.updater.onEvent(handleEvent);
          return () => unsubscribe();
        } catch (e) {
          console.error('[UpdaterOverlay] Failed to initialize:', e);
        }
      }
    };

    const timer = setTimeout(() => {
      initUpdater();
    }, 4000);

    return () => clearTimeout(timer);
  }, []);

  const handleStartDownload = async () => {
    setErrorMsg(null);
    setStage('downloading');
    setProgress(5);
    try {
      if (window.darkhub?.updater) {
        const res = await window.darkhub.updater.download();
        if (!res?.ok) {
          setErrorMsg(res?.error || 'Falha ao iniciar download.');
          setStage('error');
        }
      }
    } catch (e: any) {
      setErrorMsg(e.message);
      setStage('error');
    }
  };

  const handleApplyInstall = async () => {
    try {
      if (window.darkhub?.updater) {
        await window.darkhub.updater.install();
      }
    } catch (e: any) {
      setErrorMsg(e.message);
      setStage('error');
    }
  };

  if (!visible || !updateInfo) return null;

  let activeStep = 0;
  if (stage === 'available') activeStep = 0;
  else if (stage === 'downloading') activeStep = 1;
  else if (stage === 'verifying') activeStep = 2;
  else if (stage === 'downloaded') activeStep = 3;

  const steps = [
    { title: 'Versão', desc: `v${updateInfo.version}` },
    { title: 'Download', desc: stage === 'downloading' ? `${progress}%` : (activeStep > 1 ? 'Concluído' : 'Aguardando') },
    { title: 'Integridade', desc: stage === 'verifying' ? 'Validando...' : (activeStep > 2 ? 'Verificado' : 'Pendente') },
    { title: 'Instalar', desc: activeStep === 3 ? 'Pronto' : 'Pendente' }
  ];

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/75 animate-in p-4" role="dialog" aria-modal="true" aria-labelledby="dh-updater-title">
      <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl dh-raised overflow-hidden relative animate-in slide-in-from-bottom-2">
        {stage !== 'downloading' && stage !== 'verifying' && (
          <button
            onClick={() => setVisible(false)}
            aria-label="Fechar"
            className="absolute top-3 right-3 dh-btn dh-btn-ghost dh-btn-sm w-7 px-0 justify-center"
          >
            <X size={14} />
          </button>
        )}

        <div className="p-6 space-y-5">
          <div className="flex items-start gap-3 pr-8">
            {stage === 'downloaded' ? (
              <CheckCircle2 size={20} className="text-emerald-400 shrink-0 mt-0.5" />
            ) : stage === 'verifying' ? (
              <ShieldCheck size={20} className="text-zinc-400 shrink-0 mt-0.5" />
            ) : stage === 'downloading' ? (
              <DownloadCloud size={20} className="text-zinc-400 shrink-0 mt-0.5" />
            ) : stage === 'error' ? (
              <AlertCircle size={20} className="text-red-400 shrink-0 mt-0.5" />
            ) : (
              <DarkHubMark size={20} className="text-zinc-100 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <h2 id="dh-updater-title" className="text-[15px] font-semibold text-zinc-50 tracking-[-0.01em]">
                {stage === 'downloaded'
                  ? 'Atualização Pronta para Instalar!'
                  : stage === 'verifying'
                  ? 'Validando Integridade do Binário...'
                  : stage === 'downloading'
                  ? 'Baixando Pacote Oficial...'
                  : 'Atualização do DarkHub Disponível'}
              </h2>
              <p className="mt-0.5 text-[12px] text-zinc-500">
                Nova Versão Oficial <span className="font-mono text-zinc-300">v{updateInfo.version}</span>
              </p>
            </div>
          </div>

          <ol className="grid grid-cols-4 border-y border-zinc-800/80 divide-x divide-zinc-800/80">
            {steps.map((s, idx) => {
              const isCompleted = activeStep > idx;
              const isCurrent = activeStep === idx;
              return (
                <li key={idx} className="px-3 py-2.5 min-w-0" aria-current={isCurrent ? 'step' : undefined}>
                  <div className={`flex items-center gap-1.5 text-[12px] font-medium ${isCurrent ? 'text-zinc-100' : isCompleted ? 'text-zinc-300' : 'text-zinc-500'}`}>
                    {isCompleted ? <Check size={12} className="text-emerald-400 shrink-0" /> : (
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isCurrent ? 'bg-blue-400' : 'bg-zinc-700'}`} aria-hidden />
                    )}
                    <span className="truncate">{s.title}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-zinc-500 font-mono truncate">{s.desc}</div>
                </li>
              );
            })}
          </ol>

          {(stage === 'downloading' || stage === 'verifying') && (
            <div className="space-y-1.5">
              <div className="flex justify-between gap-3 text-[11.5px] font-mono">
                <span className="text-zinc-500 truncate">{sizes || 'Baixando pacotes...'}</span>
                <span className="text-zinc-300 shrink-0">{progress}%{speed ? <span className="text-zinc-500"> · {speed}</span> : null}</span>
              </div>
              <div
                className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress)}
              >
                <div className="h-full bg-blue-400 transition-[width] duration-200 ease-out rounded-full" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {updateInfo.releaseNotes && (
            <div className="text-[12.5px]">
              <button
                type="button"
                onClick={() => setShowChangelog(!showChangelog)}
                aria-expanded={showChangelog}
                className="w-full flex items-center justify-between gap-2 text-zinc-300 hover:text-zinc-50 transition-colors"
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <FileCode size={14} className="text-zinc-500" />
                  Novidades e Notas da Versão
                </span>
                <span className="inline-flex items-center gap-1 text-[12px] text-zinc-500">
                  {showChangelog ? 'Ocultar' : 'Ver Detalhes'}
                  <ChevronDown size={14} className={`transition-transform duration-150 ease-out ${showChangelog ? 'rotate-180' : ''}`} />
                </span>
              </button>

              {showChangelog && (
                <div className="mt-2 px-3 py-2.5 rounded-md bg-zinc-900 border border-zinc-800/80 text-zinc-400 text-[11.5px] leading-relaxed font-mono max-h-36 overflow-y-auto custom-scrollbar whitespace-pre-line animate-in">
                  {updateInfo.releaseNotes}
                </div>
              )}
            </div>
          )}

          {errorMsg && (
            <div role="alert" className="flex items-start gap-2 border-l-2 border-red-400 pl-3 py-1 text-red-300 text-[12.5px]">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span className="min-w-0 break-words">{errorMsg}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            {stage === 'available' && (
              <>
                <button type="button" onClick={() => setVisible(false)} className="dh-btn dh-btn-ghost">
                  Lembrar Mais Tarde
                </button>
                <button type="button" onClick={handleStartDownload} className="dh-btn dh-btn-primary">
                  <DownloadCloud size={14} />
                  Baixar e Atualizar Agora
                </button>
              </>
            )}

            {stage === 'downloaded' && (
              <button type="button" onClick={handleApplyInstall} className="dh-btn dh-btn-primary w-full justify-center">
                <Power size={14} />
                Reiniciar e Aplicar Atualização
              </button>
            )}

            {stage === 'error' && (
              <button type="button" onClick={handleStartDownload} className="dh-btn">
                <RefreshCw size={14} />
                Tentar Novamente
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
