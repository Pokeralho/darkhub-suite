import React, { useState, useEffect } from 'react';
import {
  DownloadCloud, CheckCircle2, Loader2, AlertCircle, X, ShieldCheck,
  Sparkles, ArrowRight, RefreshCw, Server, Zap, FileCode, Check
} from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';

type UpdateStage = 'idle' | 'checking' | 'available' | 'downloading' | 'verifying' | 'downloaded' | 'error';

export default function UpdaterOverlay() {
  const { t } = useI18n();
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
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-md animate-fadeIn p-4">
      <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden relative animate-scaleUp">
        {}
        <div className="h-1.5 bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600" />

        {}
        {stage !== 'downloading' && stage !== 'verifying' && (
          <button
            onClick={() => setVisible(false)}
            className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-200 transition-colors p-1 hover:bg-zinc-900 rounded-lg"
          >
            <X size={16} />
          </button>
        )}

        <div className="p-6 sm:p-7 space-y-6">
          {}
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
              {stage === 'downloaded' ? (
                <CheckCircle2 size={26} className="text-emerald-400" />
              ) : stage === 'verifying' ? (
                <ShieldCheck size={26} className="text-indigo-400 animate-pulse" />
              ) : stage === 'downloading' ? (
                <DownloadCloud size={26} className="text-blue-400 animate-bounce" />
              ) : stage === 'error' ? (
                <AlertCircle size={26} className="text-rose-400" />
              ) : (
                <Sparkles size={26} />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 text-[10px] font-bold rounded uppercase tracking-wider">
                  Nova Versão Oficial
                </span>
                <span className="text-xs font-mono text-zinc-400">v{updateInfo.version}</span>
              </div>
              <h2 className="text-base font-bold text-white tracking-tight mt-0.5">
                {stage === 'downloaded'
                  ? 'Atualização Pronta para Instalar!'
                  : stage === 'verifying'
                  ? 'Validando Integridade do Binário...'
                  : stage === 'downloading'
                  ? 'Baixando Pacote Oficial...'
                  : 'Atualização do DarkHub Disponível'}
              </h2>
            </div>
          </div>

          {}
          <div className="p-4 bg-zinc-900/90 border border-zinc-850 rounded-xl space-y-3">
            <div className="grid grid-cols-4 gap-2 relative">
              {steps.map((s, idx) => {
                const isCompleted = activeStep > idx;
                const isCurrent = activeStep === idx;
                return (
                  <div key={idx} className="flex flex-col items-center text-center relative z-10">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      isCompleted
                        ? 'bg-emerald-500 text-zinc-950 shadow-sm'
                        : isCurrent
                        ? 'bg-blue-600 text-white ring-4 ring-blue-600/20 animate-pulse'
                        : 'bg-zinc-800 text-zinc-500'
                    }`}>
                      {isCompleted ? <Check size={14} /> : idx + 1}
                    </div>
                    <span className={`text-[11px] font-semibold mt-1.5 ${
                      isCurrent ? 'text-white' : isCompleted ? 'text-emerald-400' : 'text-zinc-500'
                    }`}>
                      {s.title}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">{s.desc}</span>
                  </div>
                );
              })}
            </div>

            {}
            {(stage === 'downloading' || stage === 'verifying') && (
              <div className="space-y-1.5 pt-2 border-t border-zinc-800">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-zinc-400">{sizes || 'Baixando pacotes...'}</span>
                  <span className="text-blue-400 font-bold">{progress}% {speed && `(${speed})`}</span>
                </div>
                <div className="w-full h-2 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300 rounded-full"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {}
          {updateInfo.releaseNotes && (
            <div className="border border-zinc-850 bg-zinc-900/60 rounded-xl overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setShowChangelog(!showChangelog)}
                className="w-full p-3 flex items-center justify-between text-zinc-300 font-semibold hover:text-white transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <FileCode size={13} className="text-blue-400" />
                  Novidades e Notas da Versão
                </span>
                <span className="text-[10px] text-zinc-500 underline">{showChangelog ? 'Ocultar' : 'Ver Detalhes'}</span>
              </button>

              {showChangelog && (
                <div className="p-3 pt-0 text-zinc-400 text-xs font-mono max-h-36 overflow-y-auto custom-scrollbar whitespace-pre-line border-t border-zinc-850">
                  {updateInfo.releaseNotes}
                </div>
              )}
            </div>
          )}

          {}
          {errorMsg && (
            <div className="p-3 bg-rose-950/30 border border-rose-500/30 rounded-xl flex items-center gap-2 text-rose-300 text-xs font-medium">
              <AlertCircle size={15} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {}
          <div className="flex items-center justify-end gap-3 pt-1">
            {stage === 'available' && (
              <>
                <button
                  type="button"
                  onClick={() => setVisible(false)}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-semibold rounded-xl transition-colors"
                >
                  Lembrar Mais Tarde
                </button>
                <button
                  type="button"
                  onClick={handleStartDownload}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-all shadow-md shadow-blue-600/20"
                >
                  <DownloadCloud size={15} />
                  Baixar e Atualizar Agora
                </button>
              </>
            )}

            {stage === 'downloaded' && (
              <button
                type="button"
                onClick={handleApplyInstall}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/25 animate-pulse"
              >
                <Zap size={16} />
                Reiniciar e Aplicar Atualização
              </button>
            )}

            {stage === 'error' && (
              <button
                type="button"
                onClick={handleStartDownload}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-all"
              >
                <RefreshCw size={13} />
                Tentar Novamente
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
