import React, { useEffect, useState, useMemo, useRef } from 'react';
import { visibleInterval } from '../utils/visibleInterval';
import {
  MousePointerClick, Pause, Play, Zap, X, RotateCcw,
  FolderOpen, Save, Square, Trash2, Radio, Package, Keyboard, Clock,
  Crosshair, Plus, ChevronUp, ChevronDown, Route
} from '../components/icons';
import PageHeader from '../components/ui/PageHeader';
import HotkeyCapture from '../components/HotkeyCapture';
import { isBareKey } from '../utils/hotkey';
import { useI18n } from '../i18n/I18nProvider';

interface MacroViewState {
  mode: 'idle' | 'recording' | 'playing';
  loop: number;
  totalLoops: number;
  elapsedMs: number;
  eventCount: number;
  keyEvents: number;
  mouseClicks: number;
  mouseMoves: number;
  durationMs: number;
  fileName: string | null;
  sourceKind: string | null;
  stoppedBy: string | null;
}

interface WaypointItem {
  id: string;
  label: string;
  enabled: boolean;
  x: number;
  y: number;
  button: 'left' | 'right' | 'middle' | 'double';
  moveMs: number;
  waitMs: number;
}

function formatClockMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const tenths = Math.floor(((Number(ms) || 0) % 1000) / 100);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${tenths}`;
}

export default function AutoClicker() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'clicker' | 'points' | 'macro'>('clicker');

  // Fixed AutoClicker state
  const [intervalMs, setIntervalMs] = useState(50);
  const [button, setButton] = useState<'left' | 'right' | 'middle' | 'double'>('left');
  const [running, setRunning] = useState(false);
  const [isNative, setIsNative] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [hotkey, setHotkey] = useState<string>('');

  // Waypoints (Priority Point Sequencer) state
  const [waypoints, setWaypoints] = useState<WaypointItem[]>([]);
  const [humanArc, setHumanArc] = useState<boolean>(true);
  const [pickingScreen, setPickingScreen] = useState<boolean>(false);

  // Macro Recorder / Player state
  const [macroSpeed, setMacroSpeed] = useState<number>(1);
  const [macroLoops, setMacroLoops] = useState<number>(1);
  const [macroContinuous, setMacroContinuous] = useState<boolean>(false);
  const [recordHotkey, setRecordHotkey] = useState<string>('Ctrl+Shift+F7');
  const [playHotkey, setPlayHotkey] = useState<string>('Ctrl+Shift+F8');
  const [macro, setMacro] = useState<MacroViewState>({
    mode: 'idle',
    loop: 0,
    totalLoops: 1,
    elapsedMs: 0,
    eventCount: 0,
    keyEvents: 0,
    mouseClicks: 0,
    mouseMoves: 0,
    durationMs: 0,
    fileName: null,
    sourceKind: null,
    stoppedBy: null
  });

  // Interactive Live Click Tester / Prova Real State
  const [testClicks, setTestClicks] = useState(0);
  const [testCps, setTestCps] = useState(0);
  const [clickActiveVisual, setClickActiveVisual] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<string | null>(null);
  const [diagnosticRunning, setDiagnosticRunning] = useState(false);
  const timestampsRef = useRef<number[]>([]);
  const visualTimerRef = useRef<any>(null);

  const cps = useMemo(() => {
    if (intervalMs <= 0) return 1000;
    return (1000 / intervalMs).toFixed(1);
  }, [intervalMs]);

  const initialLoadRef = useRef(true);
  // The user changed interval/button but has not (re)started the engine yet: the 1 s poll and the
  // change events must not overwrite those fields with the engine's current values.
  const settingsDirtyRef = useRef(false);
  const editIntervalMs = (v: number) => { settingsDirtyRef.current = true; setIntervalMs(v); };
  const editButton = (v: 'left' | 'right' | 'middle' | 'double') => { settingsDirtyRef.current = true; setButton(v); };

  const applyMacroPayload = (m: any, adoptSettings: boolean) => {
    if (!m || typeof m !== 'object') return;
    setMacro({
      mode: m.mode === 'recording' || m.mode === 'playing' ? m.mode : 'idle',
      loop: Number(m.loop) || 0,
      totalLoops: Number(m.totalLoops) || 1,
      elapsedMs: Number(m.elapsedMs) || 0,
      eventCount: Number(m.eventCount) || 0,
      keyEvents: Number(m.keyEvents) || 0,
      mouseClicks: Number(m.mouseClicks) || 0,
      mouseMoves: Number(m.mouseMoves) || 0,
      durationMs: Number(m.durationMs) || 0,
      fileName: m.fileName ?? null,
      sourceKind: m.sourceKind ?? null,
      stoppedBy: m.stoppedBy ?? null
    });
    if (typeof m.recordHotkey === 'string' || m.recordHotkey === null) {
      setRecordHotkey(m.recordHotkey ?? '');
    }
    if (typeof m.playHotkey === 'string' || m.playHotkey === null) {
      setPlayHotkey(m.playHotkey ?? '');
    }
    if (adoptSettings && m.settings) {
      if (Number.isFinite(Number(m.settings.speed))) setMacroSpeed(Number(m.settings.speed));
      if (Number.isFinite(Number(m.settings.loops))) setMacroLoops(Number(m.settings.loops));
      if (typeof m.settings.continuous === 'boolean') setMacroContinuous(m.settings.continuous);
    }
  };

  const refresh = async () => {
    if (!window.darkhub?.autoclicker) return;
    try {
      const res = await window.darkhub.autoclicker.status();
      if (res?.ok) {
        const wasFirst = initialLoadRef.current;
        initialLoadRef.current = false;
        setRunning(Boolean(res.running));
        const adoptEngineState = wasFirst || Boolean(res.running);
        const engine = res?.state ?? res?.settings;
        if (adoptEngineState && !settingsDirtyRef.current && engine?.intervalMs) setIntervalMs(Number(engine.intervalMs));
        if (adoptEngineState && !settingsDirtyRef.current && engine?.button) setButton(engine.button);
        if (res?.state?.isNative !== undefined) setIsNative(Boolean(res.state.isNative));
        setHotkey(typeof res?.hotkey === 'string' ? res.hotkey : '');
        if (res?.macro) {
          applyMacroPayload(res.macro, wasFirst || res.macro.mode !== 'idle');
        }
        if (wasFirst) {
          if (Array.isArray(res.waypoints)) setWaypoints(res.waypoints);
          if (res.waypointOptions && typeof res.waypointOptions.humanArc === 'boolean') {
            setHumanArc(res.waypointOptions.humanArc);
          }
        }
      }
    } catch {
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
        if (!settingsDirtyRef.current && data?.state?.intervalMs) setIntervalMs(Number(data.state.intervalMs));
        if (!settingsDirtyRef.current && data?.state?.button) setButton(data.state.button);
        if (data?.state?.isNative !== undefined) setIsNative(Boolean(data.state.isNative));
        if (data?.macro) {
          applyMacroPayload(data.macro, data.macro.mode !== 'idle');
          if (data.macro.stoppedBy === 'killswitch') {
            setStatus('Execução interrompida imediatamente pelo Kill-Switch de segurança (Pause / ScrollLock).');
          }
        }
      });
    }

    if (window.darkhub?.autoclicker?.setTabActive) {
      window.darkhub.autoclicker.setTabActive(true).catch(() => {});
    }

    const stopCps = visibleInterval(() => {
      const now = Date.now();
      timestampsRef.current = timestampsRef.current.filter(ts => now - ts <= 1000);
      setTestCps(timestampsRef.current.length);
    }, 200);

    return () => {
      stopPolling();
      stopCps();
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
        settingsDirtyRef.current = false;
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
        setHotkey(res.hotkey ?? '');
        setStatus(res.hotkey ? t('autoclicker.hotkey.saved', 'Atalho: {k}').replace('{k}', res.hotkey) : t('autoclicker.hotkey.removed', 'Atalho removido. Use os botões desta tela para ligar e desligar.'));
      } else if (res?.error === 'conflict') {
        setStatus('Conflito de atalho: essa tecla já está atribuída à Gravação ou Reprodução de Macro.');
      } else {
        setStatus(t('autoclicker.hotkey.invalid', 'Essa tecla não pode ser usada como atalho.'));
      }
    } catch (e: any) {
      setStatus(e?.message || 'Erro ao salvar atalho');
    }
  };

  // Macro & Sequencer Shared Config Sync
  const syncMacroConfig = async (patch: { speed?: number; loops?: number; continuous?: boolean; recordHotkey?: string; playHotkey?: string }) => {
    if (!window.darkhub?.autoclicker?.macroSetConfig) return;
    try {
      const res = await window.darkhub.autoclicker.macroSetConfig(patch);
      if (!res?.ok) {
        if (res?.error === 'conflict') {
          setStatus('Conflito de atalho: escolha combinações diferentes para AutoClicker, Gravação e Reprodução.');
        } else {
          setStatus(res?.error || 'Falha ao atualizar configuração.');
        }
        return;
      }
      if (res?.macro) applyMacroPayload(res.macro, true);
    } catch (e: any) {
      setStatus(e?.message || 'Erro ao salvar opções');
    }
  };

  // Waypoint Sequencer Handlers
  const persistWaypoints = async (nextList: WaypointItem[], nextArc = humanArc) => {
    setWaypoints(nextList);
    if (!window.darkhub?.autoclicker?.waypointsSave) return;
    try {
      const res = await window.darkhub.autoclicker.waypointsSave({
        waypoints: nextList,
        options: { humanArc: nextArc },
        compileToMacro: true
      });
      if (res?.macro) applyMacroPayload(res.macro, false);
    } catch {
      // quiet
    }
  };

  const handlePickPointsOnScreen = async (replace = false) => {
    if (!window.darkhub?.autoclicker?.waypointsPickScreen || pickingScreen) return;
    setPickingScreen(true);
    setStatus(null);
    try {
      const res = await window.darkhub.autoclicker.waypointsPickScreen({ replace });
      if (!res?.canceled && res?.ok) {
        if (Array.isArray(res.waypoints)) setWaypoints(res.waypoints);
        if (res?.macro) applyMacroPayload(res.macro, false);
        setStatus(`${res.added ?? 0} ponto(s) marcado(s) na tela e compilado(s) em ordem de prioridade!`);
      }
    } catch (e: any) {
      setStatus(e?.message || 'Erro ao marcar pontos na tela');
    } finally {
      setPickingScreen(false);
    }
  };

  const handleAddManualPoint = () => {
    const idx = waypoints.length + 1;
    const last = waypoints[waypoints.length - 1];
    const nextPt: WaypointItem = {
      id: `pt-${Date.now()}-${idx}`,
      label: `Ponto #${idx}`,
      enabled: true,
      x: last ? last.x + 80 : 640,
      y: last ? last.y : 480,
      button: 'left',
      moveMs: 180,
      waitMs: 250
    };
    void persistWaypoints([...waypoints, nextPt]);
  };

  const updateWaypointField = (index: number, patch: Partial<WaypointItem>, commit = false) => {
    const next = waypoints.map((item, i) => (i === index ? { ...item, ...patch } : item));
    setWaypoints(next);
    if (commit) void persistWaypoints(next);
  };

  const moveWaypointPriority = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= waypoints.length) return;
    const next = waypoints.slice();
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    void persistWaypoints(next);
  };

  const removeWaypoint = (index: number) => {
    const next = waypoints.filter((_, i) => i !== index);
    void persistWaypoints(next);
  };

  const clearAllWaypoints = () => {
    void persistWaypoints([]);
    setStatus('Fila de coordenadas limpa.');
  };

  const handleWaypointsPlayToggle = async () => {
    if (!window.darkhub?.autoclicker) return;
    setStatus(null);
    try {
      if (macro.mode === 'playing') {
        const res = await window.darkhub.autoclicker.macroPlayStop();
        if (res?.macro) applyMacroPayload(res.macro, false);
        setStatus('Ciclo de pontos interrompido com liberação segura do mouse.');
      } else {
        const res = await window.darkhub.autoclicker.waypointsPlay({
          waypoints,
          options: { humanArc },
          speed: macroSpeed,
          loops: macroLoops,
          continuous: macroContinuous
        });
        if (res?.ok) {
          if (res?.macro) applyMacroPayload(res.macro, false);
          setStatus('Executando sequência de coordenadas com movimento real em loop! (Pause / ScrollLock para parar)');
        } else {
          setStatus(res?.error || 'Falha ao iniciar sequência de pontos.');
        }
      }
    } catch (e: any) {
      setStatus(e?.message || 'Erro ao executar sequência');
    }
  };

  // Macro Recorder Handlers
  const handleMacroRecordToggle = async () => {
    if (!window.darkhub?.autoclicker) return;
    setStatus(null);
    try {
      if (macro.mode === 'recording') {
        const res = await window.darkhub.autoclicker.macroRecordStop();
        if (res?.macro) applyMacroPayload(res.macro, false);
        setStatus('Gravação finalizada (cliques na janela do DarkHub filtrados automaticamente).');
      } else {
        const res = await window.darkhub.autoclicker.macroRecordStart();
        if (res?.ok) {
          if (res?.macro) applyMacroPayload(res.macro, false);
          setStatus(`Gravando teclado e mouse em alta precisão... Pressione ${recordHotkey || 'Parar'} quando terminar.`);
        } else {
          setStatus(res?.error || 'Não foi possível iniciar a gravação.');
        }
      }
    } catch (e: any) {
      setStatus(e?.message || 'Erro na gravação de macro');
    }
  };

  const handleMacroPlayToggle = async () => {
    if (!window.darkhub?.autoclicker) return;
    setStatus(null);
    try {
      if (macro.mode === 'playing') {
        const res = await window.darkhub.autoclicker.macroPlayStop();
        if (res?.macro) applyMacroPayload(res.macro, false);
        setStatus('Reprodução de macro interrompida com liberação segura de teclas.');
      } else {
        const res = await window.darkhub.autoclicker.macroPlayStart({
          speed: macroSpeed,
          loops: macroLoops,
          continuous: macroContinuous
        });
        if (res?.ok) {
          if (res?.macro) applyMacroPayload(res.macro, false);
          setStatus('Reproduzindo macro via Win32 SendInput... Pressione Pause ou ScrollLock para parada de emergência.');
        } else {
          setStatus(res?.error || 'Falha ao reproduzir macro.');
        }
      }
    } catch (e: any) {
      setStatus(e?.message || 'Erro na reprodução de macro');
    }
  };

  const handleMacroOpen = async () => {
    if (!window.darkhub?.autoclicker?.macroOpenFile) return;
    setStatus(null);
    try {
      const res = await window.darkhub.autoclicker.macroOpenFile();
      if (res?.canceled) return;
      if (res?.ok) {
        if (res?.macro) applyMacroPayload(res.macro, true);
        const kindMsg = res?.macro?.sourceKind === 'tinytask-exe'
          ? 'extraída de executável TinyTask (.exe)'
          : 'carregada (.rec)';
        setStatus(`Macro ${kindMsg}: ${res?.macro?.eventCount ?? 0} eventos prontos para reprodução.`);
      } else {
        setStatus(res?.error || 'Falha ao abrir arquivo de macro.');
      }
    } catch (e: any) {
      setStatus(e?.message || 'Erro ao abrir macro');
    }
  };

  const handleMacroSave = async () => {
    if (!window.darkhub?.autoclicker?.macroSaveFile) return;
    setStatus(null);
    try {
      const res = await window.darkhub.autoclicker.macroSaveFile();
      if (res?.canceled) return;
      if (res?.ok) {
        if (res?.macro) applyMacroPayload(res.macro, false);
        setStatus(`Sequência salva com sucesso em "${res.path}" (formato binário .rec de 20 bytes compatível com TinyTask).`);
      } else {
        setStatus(res?.error || 'Falha ao salvar macro.');
      }
    } catch (e: any) {
      setStatus(e?.message || 'Erro ao salvar macro');
    }
  };

  const handleMacroCompile = async () => {
    if (!window.darkhub?.autoclicker?.macroCompileExe) return;
    setStatus(null);
    try {
      const res = await window.darkhub.autoclicker.macroCompileExe();
      if (res?.canceled) return;
      if (res?.ok) {
        const kb = Math.max(1, Math.round((Number(res.bytes) || 0) / 1024));
        setStatus(`Executável standalone compilado com sucesso: "${res.path}" (${kb} KB).`);
      } else {
        setStatus(res?.error || 'Falha ao compilar executável.');
      }
    } catch (e: any) {
      setStatus(e?.message || 'Erro ao compilar executável');
    }
  };

  const handleMacroClear = async () => {
    if (!window.darkhub?.autoclicker?.macroClear) return;
    try {
      const res = await window.darkhub.autoclicker.macroClear();
      if (res?.macro) applyMacroPayload(res.macro, false);
      setStatus('Buffer de macro limpo.');
    } catch (e: any) {
      setStatus(e?.message || 'Erro ao limpar macro');
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

  const runSelfDiagnostic = async () => {
    if (diagnosticRunning || !window.darkhub?.autoclicker) return;
    setDiagnosticRunning(true);
    setDiagnosticResult(null);
    handleResetTester();

    try {
      await window.darkhub.autoclicker.start({ intervalMs, button });
      settingsDirtyRef.current = false;
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

  const enabledWaypointsCount = useMemo(() => waypoints.filter(p => p.enabled).length, [waypoints]);
  const waypointsBaseCycleMs = useMemo(() => {
    const active = waypoints.filter(p => p.enabled);
    if (active.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < active.length; i++) {
      if (i > 0) sum += active[i].moveMs;
      sum += 32 + (active[i].button === 'double' ? 77 : 0) + active[i].waitMs;
    }
    if (active.length > 1) sum += active[0].moveMs;
    return sum;
  }, [waypoints]);

  const effectiveWaypointsCycleMs = useMemo(() => {
    if (!waypointsBaseCycleMs) return 0;
    if (macroSpeed >= 100) return Math.max(10, enabledWaypointsCount * 2);
    return Math.round(waypointsBaseCycleMs / Math.max(0.1, macroSpeed));
  }, [waypointsBaseCycleMs, enabledWaypointsCount, macroSpeed]);

  const isAnyActive = running || macro.mode !== 'idle';
  const statusBadgeText = running
    ? t('autoclicker.statusActive', 'CLICANDO ATIVAMENTE')
    : macro.mode === 'recording'
      ? `GRAVANDO MACRO (${formatClockMs(macro.elapsedMs)})`
      : macro.mode === 'playing'
        ? `EM EXECUÇÃO (${macro.loop}/${macroContinuous ? '∞' : macro.totalLoops})`
        : t('autoclicker.statusIdle', 'PARADO / AGUARDANDO');

  const headerAction = activeTab === 'clicker' ? (
    running ? (
      <button type="button" onClick={handleStop} className="dh-btn dh-btn-primary">
        <Pause size={14} />
        {t('autoclicker.stopBtn', 'Parar AutoClicker')} <span className="font-mono text-zinc-500">{hotkey}</span>
      </button>
    ) : (
      <button type="button" onClick={handleStart} className="dh-btn dh-btn-primary">
        <Play size={14} />
        {t('autoclicker.startBtn', 'Iniciar AutoClicker')} <span className="font-mono text-zinc-500">{hotkey}</span>
      </button>
    )
  ) : activeTab === 'points' ? (
    macro.mode === 'playing' ? (
      <button type="button" onClick={handleWaypointsPlayToggle} className="dh-btn dh-btn-primary">
        <Pause size={14} />
        Parar Ciclo <span className="font-mono text-zinc-400">{playHotkey}</span>
      </button>
    ) : (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void handlePickPointsOnScreen(false)}
          disabled={pickingScreen || macro.mode !== 'idle'}
          className="dh-btn"
        >
          <Crosshair size={14} className="text-blue-400" />
          {pickingScreen ? 'Marcando...' : 'Marcar na Tela'}
        </button>
        <button
          type="button"
          onClick={handleWaypointsPlayToggle}
          disabled={enabledWaypointsCount === 0 || macro.mode !== 'idle'}
          className="dh-btn dh-btn-primary"
        >
          <Play size={14} />
          Rodar em Loop <span className="font-mono text-zinc-500">{playHotkey}</span>
        </button>
      </div>
    )
  ) : macro.mode === 'recording' ? (
    <button type="button" onClick={handleMacroRecordToggle} className="dh-btn dh-btn-primary">
      <Square size={14} />
      Parar Gravação <span className="font-mono text-zinc-400">{recordHotkey}</span>
    </button>
  ) : macro.mode === 'playing' ? (
    <button type="button" onClick={handleMacroPlayToggle} className="dh-btn dh-btn-primary">
      <Pause size={14} />
      Parar Macro <span className="font-mono text-zinc-400">{playHotkey}</span>
    </button>
  ) : (
    <div className="flex items-center gap-2">
      <button type="button" onClick={handleMacroRecordToggle} className="dh-btn">
        <Radio size={14} className="text-rose-400" />
        Gravar <span className="font-mono text-zinc-500">{recordHotkey}</span>
      </button>
      <button
        type="button"
        onClick={handleMacroPlayToggle}
        disabled={macro.eventCount === 0}
        className="dh-btn dh-btn-primary"
      >
        <Play size={14} />
        Reproduzir <span className="font-mono text-zinc-500">{playHotkey}</span>
      </button>
    </div>
  );

  const effectiveMacroDurationMs = useMemo(() => {
    if (!macro.durationMs) return 0;
    if (macroSpeed >= 100) return Math.min(macro.durationMs, macro.eventCount);
    return Math.round(macro.durationMs / Math.max(0.1, macroSpeed));
  }, [macro.durationMs, macro.eventCount, macroSpeed]);

  const speedAndLoopsCard = (
    <section className="dh-card p-5 space-y-5">
      <h2 className="dh-section-title">Velocidade do Loop e Repetições</h2>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="macro-speed" className="dh-label">Multiplicador de Velocidade:</label>
          <span className="font-mono text-[12px] text-zinc-300">
            {macroSpeed}x {macroSpeed >= 100 ? '· Modo Turbo (Coalescência Ativa)' : ''}
          </span>
        </div>
        <div className="grid grid-cols-5 gap-2 mb-3">
          {[
            { label: '½x', desc: 'Lento', val: 0.5 },
            { label: '1x', desc: 'Original', val: 1 },
            { label: '2x', desc: 'Rápido', val: 2 },
            { label: '8x', desc: 'Custom', val: 8 },
            { label: '100x', desc: 'Turbo', val: 100 }
          ].map((item) => (
            <button
              key={item.val}
              type="button"
              onClick={() => {
                setMacroSpeed(item.val);
                void syncMacroConfig({ speed: item.val });
              }}
              className={`px-2.5 py-2 rounded-lg border text-center transition-colors ${
                macroSpeed === item.val
                  ? 'border-blue-400/60 bg-blue-500/[0.06] text-zinc-50'
                  : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
              }`}
            >
              <div className="font-mono text-[13px] font-medium">{item.label}</div>
              <div className="text-[10.5px] text-zinc-500">{item.desc}</div>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <input
            id="macro-speed"
            type="range"
            min={0.5}
            max={100}
            step={0.5}
            value={macroSpeed}
            onChange={(e) => setMacroSpeed(Number(e.target.value))}
            onMouseUp={() => void syncMacroConfig({ speed: macroSpeed })}
            onKeyUp={() => void syncMacroConfig({ speed: macroSpeed })}
            className="flex-1"
          />
          <input
            type="number"
            min={0.1}
            max={100}
            step={0.5}
            value={macroSpeed}
            onChange={(e) => {
              const v = Math.max(0.1, Math.min(100, Number(e.target.value) || 1));
              setMacroSpeed(v);
            }}
            onBlur={() => void syncMacroConfig({ speed: macroSpeed })}
            className="dh-input w-24 font-mono text-center"
            aria-label="Multiplicador de velocidade"
          />
        </div>
      </div>

      <div className="pt-4 border-t border-zinc-800/80 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[12.5px] font-medium text-zinc-200">Loop Contínuo (Infinito)</div>
            <div className="dh-help">Repete o ciclo ininterruptamente até acionar o atalho ou tecla Pause / ScrollLock.</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={macroContinuous}
            onClick={() => {
              const next = !macroContinuous;
              setMacroContinuous(next);
              void syncMacroConfig({ continuous: next });
            }}
            className={`px-3 py-1.5 rounded-lg border text-[12px] font-medium transition-colors ${
              macroContinuous
                ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-200'
                : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
            }`}
          >
            {macroContinuous ? 'Ativado (∞)' : 'Desativado'}
          </button>
        </div>

        {!macroContinuous && (
          <div className="flex items-center justify-between gap-3 pt-1">
            <label htmlFor="macro-loops" className="dh-label">Quantidade de Ciclos (Loops):</label>
            <input
              id="macro-loops"
              type="number"
              min={1}
              max={99999}
              value={macroLoops}
              onChange={(e) => setMacroLoops(Math.max(1, Math.min(99999, Math.trunc(Number(e.target.value) || 1))))}
              onBlur={() => void syncMacroConfig({ loops: macroLoops })}
              className="dh-input w-28 font-mono text-center"
            />
          </div>
        )}
      </div>
    </section>
  );

  return (
    <div className="w-full max-w-6xl mx-auto space-y-5 text-zinc-100">
      <PageHeader
        title={t('autoclicker.title', 'AutoClicker & Sequenciador de Macros')}
        subtitle={<>
          {t('autoclicker.subtitle', 'Engine nativa C# sub-ms com cliques fixos, fila de coordenadas com movimento real e gravador TinyTask (.rec).')}
          <span className="dh-tag ml-2">{isNative ? t('autoclicker.engineBadge', 'Win32 SendInput 1ms (C# Nativo)') : 'Win32 Engine'}</span>
        </>}
        actions={<>
          <span
            role="status"
            className={`inline-flex items-center gap-1.5 text-[12px] ${
              macro.mode === 'recording'
                ? 'text-rose-300'
                : isAnyActive
                  ? 'text-emerald-300'
                  : 'text-zinc-500'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                macro.mode === 'recording'
                  ? 'bg-rose-400 animate-pulse'
                  : isAnyActive
                    ? 'bg-emerald-400'
                    : 'bg-zinc-600'
              }`}
            />
            {statusBadgeText}
          </span>
          {headerAction}
        </>}
      />

      {/* Mode Switcher */}
      <div role="tablist" aria-label="Modo de operação" className="inline-flex flex-wrap p-1 rounded-xl border border-zinc-800/80 bg-zinc-900/40 gap-1">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'clicker'}
          onClick={() => setActiveTab('clicker')}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium transition-colors ${
            activeTab === 'clicker'
              ? 'bg-zinc-800 text-zinc-50 shadow-xs'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <MousePointerClick size={14} />
          AutoClicker Fixo
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'points'}
          onClick={() => setActiveTab('points')}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium transition-colors ${
            activeTab === 'points'
              ? 'bg-zinc-800 text-zinc-50 shadow-xs'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Route size={14} />
          Sequenciador de Pontos (X, Y)
          {waypoints.length > 0 && (
            <span className="px-1.5 py-0.5 text-[10.5px] font-mono rounded bg-emerald-500/15 text-emerald-300 border border-emerald-400/25">
              {enabledWaypointsCount}/{waypoints.length}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'macro'}
          onClick={() => setActiveTab('macro')}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium transition-colors ${
            activeTab === 'macro'
              ? 'bg-zinc-800 text-zinc-50 shadow-xs'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Keyboard size={14} />
          Gravador Livre (.rec)
          {macro.eventCount > 0 && (
            <span className="px-1.5 py-0.5 text-[10.5px] font-mono rounded bg-blue-500/15 text-blue-300 border border-blue-400/25">
              {macro.eventCount}
            </span>
          )}
        </button>
      </div>

      {status && (
        <div role="status" className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-zinc-800/80 bg-zinc-900/40 text-[12.5px] text-zinc-300 animate-in">
          <span>{status}</span>
          <button type="button" onClick={() => setStatus(null)} className="text-zinc-500 hover:text-zinc-300" aria-label="Fechar">
            <X size={14} />
          </button>
        </div>
      )}

      {activeTab === 'clicker' ? (
        <>
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
                <kbd className="font-mono text-[20px] leading-none text-zinc-50">{hotkey || '—'}</kbd>
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
                      onClick={() => editButton(item.id as any)}
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
                    onChange={(e) => editIntervalMs(Number(e.target.value))}
                    className="flex-1"
                  />
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={intervalMs}
                    onChange={(e) => editIntervalMs(Math.max(1, Number(e.target.value)))}
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
                      onClick={() => editIntervalMs(p.ms)}
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

              <div className="pt-4 border-t border-zinc-800/80 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-medium text-zinc-200">{t('autoclicker.hotkey.title', 'Atalho para ligar e desligar')}</div>
                    <div className="dh-help">{t('autoclicker.hotkey.help', 'Clique e pressione qualquer tecla ou combinação (Ctrl, Alt, Shift, Win) ou um botão lateral do mouse. O jogo continua recebendo a tecla.')}</div>
                  </div>
                  <HotkeyCapture value={hotkey || null} onChange={(k) => void handleSaveHotkey(k)} />
                </div>
                {hotkey && isBareKey(hotkey) ? (
                  <p className="text-[12px] text-amber-300/90">{t('autoclicker.hotkey.bare', 'Tecla sozinha: ela também faz o que faz no jogo. Uma combinação (ex.: Ctrl+Shift+F6) evita isso.')}</p>
                ) : null}
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
        </>
      ) : activeTab === 'points' ? (
        <>
          {/* Sequencer Action Bar */}
          <section className="dh-card p-3.5 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handlePickPointsOnScreen(false)}
                disabled={macro.mode !== 'idle' || pickingScreen}
                className="dh-btn dh-btn-primary dh-btn-sm"
                title="Oculta a janela e permite clicar na tela para marcar pontos numerados (#1, #2, #3...)"
              >
                <Crosshair size={14} />
                Marcar Pontos na Tela
              </button>
              <button
                type="button"
                onClick={handleAddManualPoint}
                disabled={macro.mode !== 'idle'}
                className="dh-btn dh-btn-sm"
              >
                <Plus size={14} />
                Adicionar Ponto Manual
              </button>
              <button
                type="button"
                onClick={handleMacroSave}
                disabled={macro.mode !== 'idle' || enabledWaypointsCount === 0}
                className="dh-btn dh-btn-sm"
                title="Exportar esta sequência de pontos como arquivo .rec"
              >
                <Save size={14} />
                Exportar .rec
              </button>
              <button
                type="button"
                onClick={handleMacroCompile}
                disabled={macro.mode !== 'idle' || enabledWaypointsCount === 0}
                className="dh-btn dh-btn-sm"
                title="Compilar sequência em executável standalone (.exe)"
              >
                <Package size={14} />
                Compilar .exe
              </button>
              {waypoints.length > 0 && (
                <button
                  type="button"
                  onClick={clearAllWaypoints}
                  disabled={macro.mode !== 'idle'}
                  className="dh-btn dh-btn-ghost dh-btn-sm"
                >
                  <Trash2 size={14} />
                  Limpar Lista
                </button>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                role="switch"
                aria-checked={humanArc}
                onClick={() => {
                  const next = !humanArc;
                  setHumanArc(next);
                  void persistWaypoints(waypoints, next);
                }}
                className={`px-2.5 py-1 rounded-lg border text-[11.5px] font-medium transition-colors ${
                  humanArc
                    ? 'border-blue-400/50 bg-blue-500/10 text-blue-200'
                    : 'border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
                title="Interpola o deslocamento entre os pontos com curva suave Bézier e aceleração/desaceleração humana"
              >
                Trajeto Real Suave: {humanArc ? 'Curvo (Humano)' : 'Linear'}
              </button>
            </div>
          </section>

          {/* Sequencer Readout Strip */}
          <dl className="grid grid-cols-1 sm:grid-cols-3 rounded-xl border border-zinc-800/80 bg-zinc-900/30 divide-y sm:divide-y-0 sm:divide-x divide-zinc-800/80">
            <div className="px-4 py-3">
              <dt className="text-[11.5px] text-zinc-500">Pontos Ativos na Fila</dt>
              <dd className="mt-1.5 font-mono text-[20px] leading-none text-zinc-50">
                {enabledWaypointsCount} <span className="text-[12px] text-zinc-500">de {waypoints.length} ponto(s)</span>
              </dd>
              <dd className="mt-1.5 text-[11px] text-zinc-600">Executados na ordem de prioridade (#1 → #{Math.max(1, waypoints.length)})</dd>
            </div>
            <div className="px-4 py-3">
              <dt className="text-[11.5px] text-zinc-500">Tempo Estimado por Ciclo</dt>
              <dd className="mt-1.5 font-mono text-[20px] leading-none text-zinc-50">
                {formatClockMs(effectiveWaypointsCycleMs)}
              </dd>
              <dd className="mt-1.5 text-[11px] text-zinc-600">
                Base: {formatClockMs(waypointsBaseCycleMs)} · Velocidade {macroSpeed}x
              </dd>
            </div>
            <div className="px-4 py-3">
              <dt className="text-[11.5px] text-zinc-500">Progresso do Loop</dt>
              <dd className="mt-1.5 font-mono text-[20px] leading-none text-zinc-50">
                {macro.mode === 'playing'
                  ? `Ciclo ${macro.loop}/${macroContinuous ? '∞' : macro.totalLoops}`
                  : 'Aguardando'}
              </dd>
              <dd className="mt-1.5 text-[11px] text-zinc-600">Atalho rápido: {playHotkey || '—'} · Emergência: Pause</dd>
            </div>
          </dl>

          {/* Priority Points Table / List */}
          <section className="dh-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="dh-section-title">Ordem de Prioridade das Coordenadas</h2>
                <p className="dh-help mt-0.5">
                  Edite X, Y, tipo de clique, tempo de deslocamento do cursor até o ponto e pausa pós-clique. No último ponto, o mouse desliza suavemente de volta ao #1 fechando o loop.
                </p>
              </div>
            </div>

            {waypoints.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-10 text-center space-y-3">
                <Crosshair size={24} className="mx-auto text-zinc-500" />
                <div className="text-[13px] font-medium text-zinc-200">Nenhum ponto marcado na sequência</div>
                <p className="dh-help max-w-md mx-auto">
                  Clique em <strong>Marcar Pontos na Tela</strong> para clicar visualmente nos alvos (#1, #2, #3...) sobre qualquer aplicativo ou adicione coordenadas manualmente.
                </p>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <button type="button" onClick={() => void handlePickPointsOnScreen(true)} className="dh-btn dh-btn-primary dh-btn-sm">
                    <Crosshair size={14} />
                    Marcar Pontos na Tela
                  </button>
                  <button type="button" onClick={handleAddManualPoint} className="dh-btn dh-btn-sm">
                    <Plus size={14} />
                    Adicionar Manualmente
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {waypoints.map((pt, idx) => (
                  <div
                    key={pt.id}
                    className={`rounded-xl border p-3 transition-colors ${
                      pt.enabled
                        ? 'border-zinc-800/90 bg-zinc-900/40'
                        : 'border-zinc-800/40 bg-zinc-950/40 opacity-55'
                    }`}
                  >
                    <div className="grid grid-cols-1 xl:grid-cols-[auto_1fr_auto] gap-3 items-center">
                      {/* Priority Badge + Up/Down + Enable */}
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={pt.enabled}
                          onChange={(e) => updateWaypointField(idx, { enabled: e.target.checked }, true)}
                          aria-label={`Ativar ponto ${idx + 1}`}
                          className="rounded border-zinc-700"
                        />
                        <span className="inline-flex items-center justify-center min-w-[32px] h-7 px-2 rounded-md bg-blue-500/15 border border-blue-400/30 font-mono text-[12px] font-semibold text-blue-200">
                          #{idx + 1}
                        </span>
                        <div className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => moveWaypointPriority(idx, -1)}
                            disabled={idx === 0 || macro.mode !== 'idle'}
                            className="text-zinc-500 hover:text-zinc-200 disabled:opacity-25"
                            title="Subir prioridade"
                            aria-label="Subir prioridade"
                          >
                            <ChevronUp size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveWaypointPriority(idx, 1)}
                            disabled={idx === waypoints.length - 1 || macro.mode !== 'idle'}
                            className="text-zinc-500 hover:text-zinc-200 disabled:opacity-25"
                            title="Descer prioridade"
                            aria-label="Descer prioridade"
                          >
                            <ChevronDown size={14} />
                          </button>
                        </div>
                        <input
                          type="text"
                          value={pt.label}
                          placeholder={`Ponto #${idx + 1}`}
                          onChange={(e) => updateWaypointField(idx, { label: e.target.value })}
                          onBlur={() => void persistWaypoints(waypoints)}
                          className="dh-input w-32 text-[12px]"
                          aria-label="Nome do ponto"
                        />
                      </div>

                      {/* Coordinates, Button, MoveMs & WaitMs */}
                      <div className="flex flex-wrap items-center gap-2.5">
                        <label className="inline-flex items-center gap-1.5 text-[11.5px] text-zinc-400">
                          <span className="font-mono text-zinc-500">X:</span>
                          <input
                            type="number"
                            value={pt.x}
                            onChange={(e) => updateWaypointField(idx, { x: Math.round(Number(e.target.value) || 0) })}
                            onBlur={() => void persistWaypoints(waypoints)}
                            className="dh-input w-20 font-mono text-center text-[12px]"
                          />
                        </label>

                        <label className="inline-flex items-center gap-1.5 text-[11.5px] text-zinc-400">
                          <span className="font-mono text-zinc-500">Y:</span>
                          <input
                            type="number"
                            value={pt.y}
                            onChange={(e) => updateWaypointField(idx, { y: Math.round(Number(e.target.value) || 0) })}
                            onBlur={() => void persistWaypoints(waypoints)}
                            className="dh-input w-20 font-mono text-center text-[12px]"
                          />
                        </label>

                        <label className="inline-flex items-center gap-1.5 text-[11.5px] text-zinc-400">
                          <span>Botão:</span>
                          <select
                            value={pt.button}
                            onChange={(e) => updateWaypointField(idx, { button: e.target.value as any }, true)}
                            className="dh-input text-[12px] pr-6"
                          >
                            <option value="left">Esquerdo</option>
                            <option value="right">Direito</option>
                            <option value="middle">Meio</option>
                            <option value="double">Duplo Clique</option>
                          </select>
                        </label>

                        <label className="inline-flex items-center gap-1.5 text-[11.5px] text-zinc-400" title="Tempo para o mouse deslizar suavemente até esta coordenada">
                          <span>Trajeto:</span>
                          <input
                            type="number"
                            min={0}
                            max={30000}
                            step={20}
                            value={pt.moveMs}
                            onChange={(e) => updateWaypointField(idx, { moveMs: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                            onBlur={() => void persistWaypoints(waypoints)}
                            className="dh-input w-20 font-mono text-center text-[12px]"
                          />
                          <span className="text-zinc-500">ms</span>
                        </label>

                        <label className="inline-flex items-center gap-1.5 text-[11.5px] text-zinc-400" title="Pausa após o clique antes de partir para o próximo ponto">
                          <span>Espera:</span>
                          <input
                            type="number"
                            min={10}
                            max={600000}
                            step={50}
                            value={pt.waitMs}
                            onChange={(e) => updateWaypointField(idx, { waitMs: Math.max(10, Math.round(Number(e.target.value) || 10)) })}
                            onBlur={() => void persistWaypoints(waypoints)}
                            className="dh-input w-20 font-mono text-center text-[12px]"
                          />
                          <span className="text-zinc-500">ms</span>
                        </label>
                      </div>

                      {/* Delete */}
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => removeWaypoint(idx)}
                          disabled={macro.mode !== 'idle'}
                          className="dh-btn dh-btn-ghost dh-btn-sm text-zinc-500 hover:text-rose-300"
                          title="Remover este ponto"
                          aria-label={`Remover ponto ${idx + 1}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Loop Speed & Hotkey Settings shared with Playback */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-4 items-start">
            {speedAndLoopsCard}

            <section className="dh-card p-5 space-y-4">
              <h2 className="dh-section-title">Atalho Global de Execução</h2>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
                <div className="min-w-0">
                  <div className="text-[12.5px] font-medium text-zinc-200">Iniciar / Parar Sequência</div>
                  <div className="dh-help">Liga ou interrompe o loop de pontos de dentro de qualquer janela ou jogo.</div>
                </div>
                <HotkeyCapture
                  value={playHotkey || null}
                  onChange={(k) => {
                    setPlayHotkey(k ?? '');
                    void syncMacroConfig({ playHotkey: k ?? '' });
                  }}
                />
              </div>

              <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-3.5 space-y-1.5 text-[12px] text-zinc-400">
                <div className="font-medium text-zinc-200">Simulação Realista de Movimento e Clique</div>
                <p className="leading-relaxed">
                  Cada transição gera quadros reais <code className="text-zinc-200">WM_MOUSEMOVE</code> a 125 Hz com aceleração/desaceleração cúbica e retorno contínuo do último ponto de volta ao <strong>#1</strong>, evitando saltos artificiais entre loops.
                </p>
              </div>
            </section>
          </div>
        </>
      ) : (
        <>
          {/* TinyTask-style Action Toolbar */}
          <section className="dh-card p-3.5 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleMacroOpen}
                disabled={macro.mode !== 'idle'}
                className="dh-btn dh-btn-sm"
                title="Abrir arquivo .rec ou extrair macro de .exe compilado pelo TinyTask"
              >
                <FolderOpen size={14} />
                Abrir (.rec / .exe)
              </button>
              <button
                type="button"
                onClick={handleMacroSave}
                disabled={macro.mode !== 'idle' || macro.eventCount === 0}
                className="dh-btn dh-btn-sm"
                title="Salvar gravação no formato binário .rec de 20 bytes"
              >
                <Save size={14} />
                Salvar (.rec)
              </button>
              <button
                type="button"
                onClick={handleMacroCompile}
                disabled={macro.mode !== 'idle' || macro.eventCount === 0}
                className="dh-btn dh-btn-sm"
                title="Compilar executável standalone (.exe) usando um stub TinyTask 1.77"
              >
                <Package size={14} />
                Compilar .exe
              </button>
              <button
                type="button"
                onClick={handleMacroClear}
                disabled={macro.mode !== 'idle' || macro.eventCount === 0}
                className="dh-btn dh-btn-ghost dh-btn-sm"
                title="Descartar eventos gravados"
              >
                <Trash2 size={14} />
                Limpar
              </button>
            </div>

            <div className="flex items-center gap-2 text-[12px] text-zinc-400">
              <Clock size={13} className="text-zinc-500" />
              {macro.fileName ? (
                <span className="font-mono text-zinc-200">{macro.fileName}</span>
              ) : (
                <span>Nenhuma macro carregada</span>
              )}
              {macro.sourceKind === 'tinytask-exe' && (
                <span className="dh-tag">Extraída de .exe</span>
              )}
            </div>
          </section>

          {/* Macro Telemetry Readout Strip */}
          <dl className="grid grid-cols-1 sm:grid-cols-4 rounded-xl border border-zinc-800/80 bg-zinc-900/30 divide-y sm:divide-y-0 sm:divide-x divide-zinc-800/80">
            <div className="px-4 py-3">
              <dt className="text-[11.5px] text-zinc-500">Estado do Motor</dt>
              <dd className="mt-1.5 font-mono text-[18px] leading-none text-zinc-50">
                {macro.mode === 'recording'
                  ? `REC ${formatClockMs(macro.elapsedMs)}`
                  : macro.mode === 'playing'
                    ? `${formatClockMs(macro.elapsedMs)}`
                    : macro.eventCount > 0
                      ? 'PRONTA'
                      : 'VAZIA'}
              </dd>
              <dd className="mt-1.5 text-[11px] text-zinc-600">
                {macro.mode === 'playing'
                  ? `Ciclo ${macro.loop} de ${macroContinuous ? '∞ (Contínuo)' : macro.totalLoops}`
                  : 'Amostragem de 250 Hz (4 ms)'}
              </dd>
            </div>

            <div className="px-4 py-3">
              <dt className="text-[11.5px] text-zinc-500">Eventos Capturados</dt>
              <dd className="mt-1.5 font-mono text-[20px] leading-none text-zinc-50">
                {macro.eventCount} <span className="text-[12px] text-zinc-500">registros</span>
              </dd>
              <dd className="mt-1.5 text-[11px] text-zinc-600">
                {macro.keyEvents} teclas · {macro.mouseClicks} cliques · {macro.mouseMoves} mov.
              </dd>
            </div>

            <div className="px-4 py-3">
              <dt className="text-[11.5px] text-zinc-500">Duração por Ciclo</dt>
              <dd className="mt-1.5 font-mono text-[20px] leading-none text-zinc-50">
                {formatClockMs(effectiveMacroDurationMs)}
              </dd>
              <dd className="mt-1.5 text-[11px] text-zinc-600">
                Original: {formatClockMs(macro.durationMs)} ({macroSpeed}x)
              </dd>
            </div>

            <div className="px-4 py-3">
              <dt className="text-[11.5px] text-zinc-500">Parada de Emergência</dt>
              <dd className="mt-1.5 font-mono text-[17px] leading-none text-zinc-50">
                Pause <span className="text-zinc-600">/</span> ScrollLock
              </dd>
              <dd className="mt-1.5 text-[11px] text-zinc-600">
                Interrompe e solta todas as teclas
              </dd>
            </div>
          </dl>

          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-4 items-start">
            {speedAndLoopsCard}

            <section className="dh-card p-5 space-y-4">
              <h2 className="dh-section-title">Atalhos Globais de Macro</h2>

              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-medium text-zinc-200">Iniciar / Parar Gravação</div>
                    <div className="dh-help">Dispara ou finaliza a captura de teclado e mouse direto de dentro do jogo ou aplicativo.</div>
                  </div>
                  <HotkeyCapture
                    value={recordHotkey || null}
                    onChange={(k) => {
                      setRecordHotkey(k ?? '');
                      void syncMacroConfig({ recordHotkey: k ?? '' });
                    }}
                  />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-medium text-zinc-200">Iniciar / Parar Reprodução</div>
                    <div className="dh-help">Executa ou interrompe a macro atual em segundo plano sem roubar a tecla da janela em foco.</div>
                  </div>
                  <HotkeyCapture
                    value={playHotkey || null}
                    onChange={(k) => {
                      setPlayHotkey(k ?? '');
                      void syncMacroConfig({ playHotkey: k ?? '' });
                    }}
                  />
                </div>
              </div>

              <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-3.5 space-y-1.5 text-[12px] text-zinc-400">
                <div className="font-medium text-zinc-200">Compatibilidade Binária Nativa (.rec 20B)</div>
                <p className="leading-relaxed">
                  O motor grava e reproduz o mesmo formato binário de 20 bytes do TinyTask 1.77, porém utilizando <code className="text-zinc-200">CreateWaitableTimerExW</code> de alta resolução, coordenadas multi-monitor DPI-aware e liberação automática de teclas presas (Panic Release).
                </p>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
