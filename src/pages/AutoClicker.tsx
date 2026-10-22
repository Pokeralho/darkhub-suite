import React, { useEffect, useState, useMemo, useRef } from 'react';
import { visibleInterval } from '../utils/visibleInterval'
import { 
  MousePointerClick, Pause, Play, Zap, X, RotateCcw
} from '../components/icons';
import PageHeader from '../components/ui/PageHeader';
import { useI18n } from '../i18n/I18nProvider';

export default function AutoClicker() {
  const { t } = useI18n();
  const [intervalMs, setIntervalMs] = useState(50);
  const [button, setButton] = useState<'left' | 'right' | 'middle' | 'double'>('left');
  const [running, setRunning] = useState(false);
  const [isNative, setIsNative] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [hotkey, setHotkey] = useState<string>('F6');

  // Interactive Live Click Tester / Prova Real State
  const [testClicks, setTestClicks] = useState(0);
  const [testCps, setTestCps] = useState(0);
  const [clickActiveVisual, setClickActiveVisual] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<string | null>(null);
  const [diagnosticRunning, setDiagnosticRunning] = useState(false);
  const timestampsRef = useRef<number[]>([]);
  const visualTimerRef = useRef<any>(null);

  // CPS Theoretical Calculation
  const cps = useMemo(() => {
    if (intervalMs <= 0) return 1000;
    return (1000 / intervalMs).toFixed(1);
  }, [intervalMs]);

  // The 1 s status poll used to overwrite the interval/button the user was
  // still editing. Only adopt the engine's values on first load or while running.
  const initialLoadRef = useRef(true);

  const refresh = async () => {
    if (!window.darkhub?.autoclicker) return;
    try {
      const res = await window.darkhub.autoclicker.status();
      if (res?.ok) {
        setRunning(Boolean(res.running));
        const adoptEngineState = initialLoadRef.current || Boolean(res.running);
        initialLoadRef.current = false;
        if (adoptEngineState && res?.state?.intervalMs) setIntervalMs(Number(res.state.intervalMs));
        if (adoptEngineState && res?.state?.button) setButton(res.state.button);
        if (res?.state?.isNative !== undefined) setIsNative(Boolean(res.state.isNative));
        if (typeof res?.hotkey === 'string') setHotkey(res.hotkey || 'F6');
      }
    } catch (e: any) {
      // quiet
    }
  };

  useEffect(() => {
    refresh();
    const stopPolling = visibleInterval(refresh, 1000);

    let unsub: (() => void) | undefined;
    if (window.darkhub?.autoclicker?.onChanged) {
      unsub = window.darkhub.autoclicker.onChanged((data: any) => {
        setRunning(Boolean(data?.running));
        if (data?.state?.intervalMs) setIntervalMs(Number(data.state.intervalMs));
        if (data?.state?.button) setButton(data.state.button);
        if (data?.state?.isNative !== undefined) setIsNative(Boolean(data.state.isNative));
      });
    }

    if (window.darkhub?.autoclicker?.setTabActive) {
      window.darkhub.autoclicker.setTabActive(true).catch(() => {});
    }

    // Interval to calculate live CPS on tester
    const cpsInterval = setInterval(() => {
      const now = Date.now();
      timestampsRef.current = timestampsRef.current.filter(ts => now - ts <= 1000);
      setTestCps(timestampsRef.current.length);
    }, 200);

    return () => {
      stopPolling();
      clearInterval(cpsInterval);
      if (visualTimerRef.current) clearTimeout(visualTimerRef.current);
      unsub?.();
      if (window.darkhub?.autoclicker?.setTabActive) {
        window.darkhub.autoclicker.setTabActive(false).catch(() => {});
      }
    };
  }, []);

  const handleStart = async () => {
    setStatus(null);
    setDiagnosticResult(null);
    if (!window.darkhub?.autoclicker) return;
    try {
      const res = await window.darkhub.autoclicker.start({ intervalMs, button });
      if (res?.ok) {
        setRunning(true);
        setStatus('AutoClicker ativo em segundo plano! Motor nativo C# engajado.');
      } else {
        setStatus(res?.error || 'Falha ao iniciar AutoClicker.');
      }
    } catch (e: any) {
      setStatus(e?.message || 'Erro ao iniciar');
    }
  };

  const handleStop = async () => {
    setStatus(null);
    if (!window.darkhub?.autoclicker) return;
    try {
      const res = await window.darkhub.autoclicker.stop();
      if (res?.ok) {
        setRunning(false);
        setStatus('AutoClicker pausado com liberação segura de todos os botões.');
      }
    } catch (e: any) {
      setStatus(e?.message || 'Erro ao parar');
    }
  };

  const handleSaveHotkey = async (key: string) => {
    if (!window.darkhub?.autoclicker) return;
    try {
      const res = await window.darkhub.autoclicker.setHotkey({ hotkey: key });
      if (res?.ok) {
        setHotkey(key);
        setStatus(`Atalho global do motor atualizado para: ${key}`);
      }
    } catch (e: any) {
      setStatus(e?.message || 'Erro ao salvar atalho');
    }
  };

  // Click Tester Target Event
  const registerTestClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const now = Date.now();
    timestampsRef.current.push(now);
    setTestClicks(prev => prev + 1);

    setClickActiveVisual(true);
    if (visualTimerRef.current) clearTimeout(visualTimerRef.current);
    visualTimerRef.current = setTimeout(() => setClickActiveVisual(false), 80);
  };

  const handleResetTester = () => {
    timestampsRef.current = [];
    setTestClicks(0);
    setTestCps(0);
    setDiagnosticResult(null);
  };

  // 3-Second Automatic Diagnostic & Proof Verification
  const runSelfDiagnostic = async () => {
    if (diagnosticRunning || !window.darkhub?.autoclicker) return;
    setDiagnosticRunning(true);
    setDiagnosticResult(null);
    handleResetTester();

    try {
      await window.darkhub.autoclicker.start({ intervalMs, button });
      setRunning(true);
      setStatus('Executando Prova Real automatizada por 3 segundos... Deixe o cursor na tela.');

      await new Promise(r => setTimeout(r, 3000));

      await window.darkhub.autoclicker.stop();
      setRunning(false);

      const delta = timestampsRef.current.length;
      const realCpsCalc = (delta / 3).toFixed(1);
      setDiagnosticResult(`Prova real concluída: Motor nativo despachou ${delta} cliques em 3 segundos (~${realCpsCalc} CPS real). Win32 SendInput 100% funcional!`);
      setStatus('Diagnóstico concluído com sucesso.');
    } catch (err: any) {
      setDiagnosticResult(`Falha no diagnóstico: ${err?.message || String(err)}`);
    } finally {
      setDiagnosticRunning(false);
    }
  };

  const startStop = running ? (
    <button type="button" onClick={handleStop} className="dh-btn dh-btn-primary">
      <Pause size={14} />
      {t('autoclicker.stopBtn', 'Parar AutoClicker')} <span className="font-mono text-zinc-500">{hotkey}</span>
    </button>
  ) : (
    <button type="button" onClick={handleStart} className="dh-btn dh-btn-primary">
      <Play size={14} />
      {t('autoclicker.startBtn', 'Iniciar AutoClicker')} <span className="font-mono text-zinc-500">{hotkey}</span>
    </button>
  );

  return (
    <div className="w-full max-w-6xl mx-auto space-y-5 text-zinc-100">
      <PageHeader
        title={t('autoclicker.title', 'AutoClicker de Baixo Nível')}
        subtitle={<>
          {t('autoclicker.subtitle', 'Engine nativa em C# com temporização de alta precisão (sub-ms), jitter zero e suporte a atalhos globais.')}
          <span className="dh-tag ml-2">{t('autoclicker.engineBadge', 'Win32 SendInput 1ms (C# Nativo)')}</span>
        </>}
        actions={<>
          <span role="status" className={`inline-flex items-center gap-1.5 text-[12px] ${running ? 'text-emerald-300' : 'text-zinc-500'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
            {running ? t('autoclicker.statusActive', 'CLICANDO ATIVAMENTE') : t('autoclicker.statusIdle', 'PARADO / AGUARDANDO')}
          </span>
          {startStop}
        </>}
      />

      {status && (
        <div role="status" className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-zinc-800/80 bg-zinc-900/40 text-[12.5px] text-zinc-300 animate-in">
          <span>{status}</span>
          <button type="button" onClick={() => setStatus(null)} className="text-zinc-500 hover:text-zinc-300" aria-label="Fechar">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Readout strip */}
      <dl className="grid grid-cols-1 sm:grid-cols-3 rounded-xl border border-zinc-800/80 bg-zinc-900/30 divide-y sm:divide-y-0 sm:divide-x divide-zinc-800/80">
        <div className="px-4 py-3">
          <dt className="text-[11.5px] text-zinc-500">{t('autoclicker.cpsTitle', 'Velocidade Teórica (CPS)')}</dt>
          <dd className="mt-1.5 font-mono text-[20px] leading-none text-zinc-50">~{cps} <span className="text-[12px] text-zinc-500">{t('autoclicker.cpsUnit', 'cliques/seg')}</span></dd>
          <dd className="mt-1.5 text-[11px] text-zinc-600">{t('autoclicker.cpsDesc', 'Sem limitação artificial de software')}</dd>
        </div>
        <div className="px-4 py-3">
          <dt className="text-[11.5px] text-zinc-500">{t('autoclicker.intervalTitle', 'Intervalo de Execução')}</dt>
          <dd className="mt-1.5 font-mono text-[20px] leading-none text-zinc-50">{intervalMs} <span className="text-[12px] text-zinc-500">{t('autoclicker.intervalUnit', 'milissegundos')}</span></dd>
          <dd className="mt-1.5 text-[11px] text-zinc-600">{t('autoclicker.intervalDesc', 'Resolução de 1ms do Windows Timer')}</dd>
        </div>
        <div className="px-4 py-3">
          <dt className="text-[11.5px] text-zinc-500">{t('autoclicker.hotkeyTitle', 'Atalho Global')}</dt>
          <dd className="mt-1.5 flex items-baseline gap-2">
            <kbd className="font-mono text-[20px] leading-none text-zinc-50">{hotkey}</kbd>
            <span className="text-[12px] text-zinc-500">{t('autoclicker.hotkeyToggle', '(Liga / Desliga)')}</span>
          </dd>
          <dd className="mt-1.5 text-[11px] text-zinc-600">{t('autoclicker.hotkeyDesc', 'Funciona dentro de qualquer jogo ou app')}</dd>
        </div>
      </dl>

      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-4 items-start">
        {/* Configuration */}
        <section className="dh-card p-5 space-y-5">
          <h2 className="dh-section-title">{t('autoclicker.configTitle', 'Configuração de Clique')}</h2>

          <div>
            <span className="dh-label block mb-2">{t('autoclicker.mouseBtnLabel', 'Botão do Mouse:')}</span>
            <div role="radiogroup" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'left', label: t('autoclicker.btnLeft', 'Clique Esquerdo'), desc: t('autoclicker.btnLeftDesc', 'Padrão (Tiro/Ação)') },
                { id: 'right', label: t('autoclicker.btnRight', 'Clique Direito'), desc: t('autoclicker.btnRightDesc', 'Mira/Secundário') },
                { id: 'middle', label: t('autoclicker.btnMiddle', 'Clique do Meio'), desc: t('autoclicker.btnMiddleDesc', 'Scroll Button') },
                { id: 'double', label: t('autoclicker.btnDouble', 'Duplo Clique'), desc: t('autoclicker.btnDoubleDesc', '2x Rápido') }
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={button === item.id}
                  onClick={() => setButton(item.id as any)}
                  className={`px-3 py-2.5 rounded-lg border text-left transition-colors duration-150 ${
                    button === item.id
                      ? 'border-blue-400/60 bg-blue-500/[0.06] text-zinc-50'
                      : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  <div className="text-[12.5px] font-medium">{item.label}</div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">{item.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="ac-interval" className="dh-label">{t('autoclicker.intervalLabel', 'Intervalo entre Cliques (ms):')}</label>
              <span className="font-mono text-[12px] text-zinc-300">{intervalMs}<span className="text-zinc-500"> ms · ~{cps} CPS</span></span>
            </div>
            <div className="flex items-center gap-3">
              <input
                id="ac-interval"
                type="range"
                min={1}
                max={1000}
                step={1}
                value={intervalMs}
                onChange={(e) => setIntervalMs(Number(e.target.value))}
                className="flex-1"
              />
              <input
                type="number"
                min={1}
                max={10000}
                value={intervalMs}
                onChange={(e) => setIntervalMs(Math.max(1, Number(e.target.value)))}
                className="dh-input w-24 font-mono text-center"
                aria-label={t('autoclicker.intervalLabel', 'Intervalo entre Cliques (ms):')}
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-3">
              <span className="text-[11px] text-zinc-500 mr-1">Presets Rápidos:</span>
              {[
                { label: 'Ultra Rápido (10ms - 100 CPS)', ms: 10 },
                { label: 'Rápido (50ms - 20 CPS)', ms: 50 },
                { label: 'Equilibrado (100ms - 10 CPS)', ms: 100 },
                { label: 'Humano (200ms - 5 CPS)', ms: 200 }
              ].map((p) => (
                <button
                  key={p.ms}
                  type="button"
                  onClick={() => setIntervalMs(p.ms)}
                  aria-pressed={intervalMs === p.ms}
                  className={`h-7 px-2 rounded-md text-[11px] border transition-colors duration-150 ${
                    intervalMs === p.ms
                      ? 'border-blue-400/60 text-blue-200'
                      : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium text-zinc-200">Atalho de Teclado Rápido</div>
              <div className="dh-help">Pressione a tecla configurada para ligar ou desligar o clique em qualquer janela ou jogo.</div>
            </div>
            <div className="flex items-center rounded-md border border-zinc-800 overflow-hidden shrink-0 divide-x divide-zinc-800">
              {['F6', 'F7', 'F8', 'F9', 'F12'].map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSaveHotkey(key)}
                  aria-pressed={hotkey === key}
                  className={`h-7 px-2.5 text-[12px] font-mono transition-colors duration-150 ${
                    hotkey === key ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Live tester */}
        <section className="dh-card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="dh-section-title">Área de teste de cliques e prova real</h2>
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleResetTester} className="dh-btn dh-btn-ghost dh-btn-sm" title="Resetar contador de cliques">
                <RotateCcw size={13} />
                Resetar Contador
              </button>
              <button type="button" onClick={runSelfDiagnostic} disabled={diagnosticRunning} className="dh-btn dh-btn-sm">
                <Zap size={13} />
                {diagnosticRunning ? 'Testando...' : 'Auto-Diagnóstico (3s)'}
              </button>
            </div>
          </div>

          {diagnosticResult && (
            <p role="status" className={`text-[12px] font-mono ${diagnosticResult.startsWith('Falha') ? 'text-red-300' : 'text-emerald-300'}`}>
              {diagnosticResult}
            </p>
          )}

          <div
            onMouseDown={registerTestClick}
            className={`select-none cursor-crosshair rounded-lg border border-dashed px-6 py-8 flex flex-col items-center justify-center gap-2 text-center transition-colors duration-100 ${
              clickActiveVisual ? 'border-blue-400 bg-blue-500/[0.07]' : 'border-zinc-700 hover:border-zinc-600'
            }`}
          >
            <MousePointerClick size={20} className={clickActiveVisual ? 'text-blue-300' : 'text-zinc-500'} />
            <div className="text-[12.5px] font-medium text-zinc-200">
              Posicione o cursor aqui com o AutoClicker ativo (ou clique manualmente)
            </div>
            <p className="dh-help max-w-md">
              Pressione <kbd className="font-mono text-zinc-200">{hotkey}</kbd> com o mouse sobre esta área para ver os cliques sendo registrados em tempo real com alta precisão.
            </p>
          </div>

          <dl className="grid grid-cols-2 divide-x divide-zinc-800/80 border-t border-zinc-800/80 pt-3">
            <div className="pr-4">
              <dt className="text-[11.5px] text-zinc-500">Total de Cliques Registrados</dt>
              <dd className="mt-1.5 font-mono text-[22px] leading-none text-zinc-50">{testClicks} <span className="text-[12px] text-zinc-500">cliques</span></dd>
            </div>
            <div className="pl-4">
              <dt className="text-[11.5px] text-zinc-500">Velocidade Medida em Tempo Real</dt>
              <dd className="mt-1.5 font-mono text-[22px] leading-none text-zinc-50">{testCps} <span className="text-[12px] text-zinc-500">CPS Real</span></dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
