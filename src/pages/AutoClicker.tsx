import React, { useEffect, useState, useMemo } from 'react';
import { 
  MousePointerClick, Pause, Play, Zap, Cpu, Settings2, 
  Keyboard, Clock, Activity, CheckCircle2, AlertCircle, Sparkles, X
} from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';

export default function AutoClicker() {
  const { t } = useI18n();
  const [intervalMs, setIntervalMs] = useState(50);
  const [button, setButton] = useState<'left' | 'right' | 'middle' | 'double'>('left');
  const [running, setRunning] = useState(false);
  const [isNative, setIsNative] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [hotkey, setHotkey] = useState<string>('F6');
  const [hotkeyEditing, setHotkeyEditing] = useState(false);

  // CPS Calculation
  const cps = useMemo(() => {
    if (intervalMs <= 0) return 1000;
    return (1000 / intervalMs).toFixed(1);
  }, [intervalMs]);

  const refresh = async () => {
    if (!window.darkhub?.autoclicker) return;
    try {
      const res = await window.darkhub.autoclicker.status();
      if (res?.ok) {
        setRunning(Boolean(res.running));
        if (res?.state?.intervalMs) setIntervalMs(Number(res.state.intervalMs));
        if (res?.state?.button) setButton(res.state.button);
        if (res?.state?.isNative !== undefined) setIsNative(Boolean(res.state.isNative));
        if (typeof res?.hotkey === 'string') setHotkey(res.hotkey || 'F6');
      }
    } catch (e: any) {
      // quiet
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 1000);
    if (window.darkhub?.autoclicker?.setTabActive) {
      window.darkhub.autoclicker.setTabActive(true).catch(() => {});
    }
    return () => {
      clearInterval(id);
      if (window.darkhub?.autoclicker?.setTabActive) {
        window.darkhub.autoclicker.setTabActive(false).catch(() => {});
      }
    };
  }, []);

  const handleStart = async () => {
    setStatus(null);
    if (!window.darkhub?.autoclicker) return;
    try {
      const res = await window.darkhub.autoclicker.start({ intervalMs, button });
      if (res?.ok) {
        setRunning(true);
        setStatus('✓ AutoClicker ativo em segundo plano!');
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
        setStatus('AutoClicker pausado.');
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
        setHotkeyEditing(false);
        setStatus(`Atalho global atualizado para: ${key}`);
      }
    } catch (e: any) {
      setStatus(e?.message || 'Erro ao salvar atalho');
    }
  };

  return (
    <div className="w-full w-full max-w-6xl mx-auto space-y-4 p-1 md:p-2 animate-fadeIn text-zinc-100">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
        <div>
          <h1 className="text-lg font-bold text-zinc-100 tracking-tight flex items-center gap-2">
            <MousePointerClick className="w-5 h-5 text-rose-500" />
            {t('autoclicker.title', 'AutoClicker de Baixo Nível')}
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 font-mono border border-emerald-500/30">
              {t('autoclicker.engineBadge', 'Win32 SendInput 1ms')}
            </span>
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            {t('autoclicker.subtitle', 'Engine nativa em C# com temporização de alta precisão (sub-ms), jitter zero e suporte a atalhos globais.')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-xs font-mono font-semibold px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${
            running 
              ? 'bg-emerald-950/60 text-emerald-400 border-emerald-500/40 animate-pulse' 
              : 'bg-zinc-900 text-zinc-400 border-zinc-800'
          }`}>
            <span className={`w-2 h-2 rounded-full ${running ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
            {running ? t('autoclicker.statusActive', 'CLICANDO ATIVAMENTE') : t('autoclicker.statusIdle', 'PARADO / AGUARDANDO')}
          </span>
        </div>
      </div>

      {/* Alert Status */}
      {status && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 text-xs text-zinc-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{status}</span>
          </div>
          <button onClick={() => setStatus(null)} className="text-zinc-500 hover:text-zinc-300">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Metric Cards (3 Columns) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-zinc-900/60 rounded-xl border border-zinc-800/80 p-3.5">
          <div className="text-[11px] font-medium text-zinc-400 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-rose-500" />
            {t('autoclicker.cpsTitle', 'Velocidade Teórica (CPS)')}
          </div>
          <div className="text-xl font-bold text-zinc-100 font-mono mt-1">
            ~{cps} <span className="text-xs font-normal text-zinc-400">{t('autoclicker.cpsUnit', 'cliques/seg')}</span>
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5">{t('autoclicker.cpsDesc', 'Sem limitação artificial de software')}</div>
        </div>

        <div className="bg-zinc-900/60 rounded-xl border border-zinc-800/80 p-3.5">
          <div className="text-[11px] font-medium text-zinc-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-sky-400" />
            {t('autoclicker.intervalTitle', 'Intervalo de Execução')}
          </div>
          <div className="text-xl font-bold text-zinc-100 font-mono mt-1">
            {intervalMs} <span className="text-xs font-normal text-zinc-400">{t('autoclicker.intervalUnit', 'milissegundos')}</span>
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5">{t('autoclicker.intervalDesc', 'Resolução de 1ms do Windows Timer')}</div>
        </div>

        <div className="bg-zinc-900/60 rounded-xl border border-zinc-800/80 p-3.5">
          <div className="text-[11px] font-medium text-zinc-400 flex items-center gap-1.5">
            <Keyboard className="w-3.5 h-3.5 text-emerald-400" />
            {t('autoclicker.hotkeyTitle', 'Atalho Global')}
          </div>
          <div className="text-xl font-bold text-zinc-100 font-mono mt-1 flex items-center gap-2">
            <span className="px-2 py-0.5 bg-zinc-800 rounded border border-zinc-700 text-sm font-bold">
              {hotkey}
            </span>
            <span className="text-xs font-normal text-zinc-400">{t('autoclicker.hotkeyToggle', '(Liga / Desliga)')}</span>
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5">{t('autoclicker.hotkeyDesc', 'Funciona dentro de qualquer jogo ou app')}</div>
        </div>
      </div>

      {/* Control Deck */}
      <div className="bg-zinc-900/80 rounded-xl border border-zinc-800/80 p-4 space-y-4">
        <h2 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
          <Settings2 className="w-3.5 h-3.5 text-zinc-400" />
          {t('autoclicker.configTitle', 'Configuração de Clique')}
        </h2>

        {/* Button Type Selector */}
        <div>
          <label className="text-xs font-medium text-zinc-400 block mb-2">{t('autoclicker.mouseBtnLabel', 'Botão do Mouse:')}</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { id: 'left', label: t('autoclicker.btnLeft', 'Clique Esquerdo'), desc: t('autoclicker.btnLeftDesc', 'Padrão (Tiro/Ação)') },
              { id: 'right', label: t('autoclicker.btnRight', 'Clique Direito'), desc: t('autoclicker.btnRightDesc', 'Mira/Secundário') },
              { id: 'middle', label: t('autoclicker.btnMiddle', 'Clique do Meio'), desc: t('autoclicker.btnMiddleDesc', 'Scroll Button') },
              { id: 'double', label: t('autoclicker.btnDouble', 'Duplo Clique'), desc: t('autoclicker.btnDoubleDesc', '2x Rápido') }
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setButton(item.id as any)}
                className={`p-3 rounded-xl border text-left transition ${
                  button === item.id
                    ? 'bg-zinc-800 border-rose-500/80 text-zinc-100 shadow-sm'
                    : 'bg-zinc-950/70 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                }`}
              >
                <div className="text-xs font-bold">{item.label}</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">{item.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Interval Slider & Input */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-zinc-400">
              {t('autoclicker.intervalLabel', 'Intervalo entre Cliques (ms):')}
            </label>
            <span className="text-xs font-mono font-bold text-rose-400">{intervalMs} ms</span>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={1000}
              step={1}
              value={intervalMs}
              onChange={(e) => setIntervalMs(Number(e.target.value))}
              className="flex-1 accent-rose-600 h-1.5 bg-zinc-950 rounded-lg cursor-pointer"
            />
            <input
              type="number"
              min={1}
              max={10000}
              value={intervalMs}
              onChange={(e) => setIntervalMs(Math.max(1, Number(e.target.value)))}
              className="w-24 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 font-mono text-center focus:outline-none focus:border-rose-500/80"
            />
          </div>

          {/* Quick Preset Pills */}
          <div className="flex items-center gap-1.5 mt-2.5">
            <span className="text-[10px] text-zinc-500 mr-1">Presets Rápidos:</span>
            {[
              { label: 'Ultra Rápido (10ms - 100 CPS)', ms: 10 },
              { label: 'Rápido (50ms - 20 CPS)', ms: 50 },
              { label: 'Equilibrado (100ms - 10 CPS)', ms: 100 },
              { label: 'Humano (200ms - 5 CPS)', ms: 200 }
            ].map((p) => (
              <button
                key={p.ms}
                onClick={() => setIntervalMs(p.ms)}
                className="px-2 py-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-[10px] font-mono text-zinc-300 border border-zinc-700/50 transition"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Hotkey Configuration */}
        <div className="pt-2 border-t border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-zinc-200">Atalho de Teclado Rápido</div>
            <div className="text-[11px] text-zinc-500">Pressione a tecla configurada para ligar ou desligar o clique em qualquer janela.</div>
          </div>

          <div className="flex items-center gap-2">
            {['F6', 'F7', 'F8', 'F9', 'F12'].map((key) => (
              <button
                key={key}
                onClick={() => handleSaveHotkey(key)}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-bold border transition ${
                  hotkey === key
                    ? 'bg-rose-600 border-rose-500 text-white shadow-sm'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {key}
              </button>
            ))}
          </div>
        </div>

        {/* Primary Action Button */}
        <div className="pt-2 border-t border-zinc-800/80 flex justify-end">
          {running ? (
            <button
              onClick={handleStop}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold text-xs border border-zinc-700 transition shadow-sm"
            >
              <Pause className="w-4 h-4 text-amber-400" />
              {t('autoclicker.stopBtn', 'Parar AutoClicker')} ({hotkey})
            </button>
          ) : (
            <button
              onClick={handleStart}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition shadow-sm"
            >
              <Play className="w-4 h-4 fill-current" />
              {t('autoclicker.startBtn', 'Iniciar AutoClicker')} ({hotkey})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
