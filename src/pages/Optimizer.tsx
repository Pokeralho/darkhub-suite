import WindowsToolsPanel from '../components/optimizer/WindowsToolsPanel';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Zap, Trash2, CheckCircle2, Loader2, Cpu, Globe, Target, Info, Lock,
  ShieldCheck, Undo2, Search, Terminal, RefreshCw, Flame, X,
  RotateCcw, Headphones, ShieldAlert, FolderOpen, AlertTriangle, History
} from '../components/icons';
import { useI18n } from '../i18n/I18nProvider';
import DarkOSOptimizerHint from '../components/darkos/DarkOSOptimizerHint';
import PageHeader from '../components/ui/PageHeader';

type OptimizerTab = 'tweaks' | 'gpu' | 'priority' | 'uninstaller' | 'network' | 'defender' | 'debloat' | 'startup' | 'windows';
type LogLevel = 'info' | 'ok' | 'err' | 'warn';
type LogLine = { ts: string; level: LogLevel; text: string };
type RiskLevel = 'safe' | 'moderate' | 'advanced';
type ConfirmRequest = { title: string; body: string; items?: string[]; confirmLabel: string; danger?: boolean };
type RunResult = { id: string; ok: boolean; msg: string; error?: string; savingsBytes: number };

/** Unified card model: a registered operation or a public registry tweak. */
type TweakItem = {
  id: string;
  kind: 'op' | 'deep';
  title: string;
  description: string;
  category: string;
  risk: RiskLevel;
  requiresAdmin: boolean;
  requiresReboot: boolean;
  securityRelated: boolean;
  warning: string | null;
  revertId: string | null;
  applied: boolean | null;
  partial: boolean;
  recommended: boolean;
};

const api = () => (window.darkhub?.optimizer as any);

/** The i18n layer has no interpolation: fill {vars} here. */
const fmt = (s: string, vars: Record<string, string | number> = {}) =>
  s.replace(/\{(\w+)\}/g, (_m, k) => String(vars[k] ?? ''));

const fmtBytes = (n: number) => {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
};

const DEEP_RISK: Record<string, RiskLevel> = { low: 'safe', medium: 'moderate', high: 'advanced' };

/** Servers shown before any measurement (no latency is shown until it is really measured). */
const LOCAL_DNS_PRESETS = [
  { name: 'Cloudflare', primary: '1.1.1.1', secondary: '1.0.0.1', trusted: true },
  { name: 'Google DNS', primary: '8.8.8.8', secondary: '8.8.4.4', trusted: true },
  { name: 'Quad9', primary: '9.9.9.9', secondary: '149.112.112.112', trusted: true },
  { name: 'OpenDNS', primary: '208.67.222.222', secondary: '208.67.220.220', trusted: true },
  { name: 'AdGuard DNS', primary: '94.140.14.14', secondary: '94.140.15.15', trusted: true }
];

/** Underline tab: ink at rest, glacial hairline + bright label when active. */
const tabBtn = (active: boolean) =>
  `flex items-center gap-1.5 h-9 px-3 -mb-px border-b-2 text-[12.5px] whitespace-nowrap transition-colors duration-150 ease-out ${
    active ? 'border-blue-400 text-zinc-50 font-medium' : 'border-transparent text-zinc-400 hover:text-zinc-200'
  }`;

/** Segmented filter chip (category filter, GPU mode). */
const segBtn = (active: boolean) =>
  `h-7 px-2.5 rounded-md text-[12px] whitespace-nowrap transition-colors duration-150 ease-out ${
    active ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
  }`;

const MAX_LOG_LINES = 500;

/** Skeleton rows shaped like a hairline list (loading state). */
const SkeletonRows = ({ rows = 5 }: { rows?: number }) => (
  <div className="divide-y divide-zinc-800/80" aria-hidden="true">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="h-3 rounded bg-zinc-900 animate-pulse" style={{ width: `${38 + ((i * 17) % 30)}%` }} />
          <div className="h-2.5 rounded bg-zinc-900 animate-pulse" style={{ width: `${55 + ((i * 11) % 30)}%` }} />
        </div>
        <div className="h-7 w-20 rounded-md bg-zinc-900 animate-pulse" />
      </div>
    ))}
  </div>
);

/** Quiet live-state readout: 6px dot + small semantic text (defined at module level so it does not remount). */
const StatusPill = ({ ok, label }: { ok: boolean | null; label: string }) => (
  <span className={`inline-flex items-center gap-1.5 text-[12px] ${ok === null ? 'text-zinc-400' : ok ? 'text-emerald-400' : 'text-rose-400'}`}>
    <span className={`w-1.5 h-1.5 rounded-full ${ok === null ? 'bg-zinc-600' : ok ? 'bg-emerald-400' : 'bg-rose-400'}`} />
    {label}
  </span>
);

/** One cell of the quick-actions strip. */
const HeroButton = ({ icon, title, desc, onClick, disabled }: {
  icon: React.ReactNode; title: string; desc: string; onClick: () => void; disabled: boolean;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="group bg-zinc-950 hover:bg-zinc-900/70 px-3.5 py-3 text-left flex flex-col gap-2 transition-colors duration-150 ease-out disabled:opacity-45 disabled:hover:bg-zinc-950"
  >
    <span className="text-zinc-500 group-hover:text-blue-300 transition-colors duration-150">{icon}</span>
    <span className="min-w-0">
      <span className="block text-[13px] font-medium text-zinc-100">{title}</span>
      <span className="block text-[11.5px] text-zinc-500 mt-0.5 leading-snug">{desc}</span>
    </span>
  </button>
);

/** Enable / disable / restore HAGS buttons (shown both in the streaming card and in the GPU tab). */
const HagsButtons = ({ state, disabled, onToggle, onRevert, labels }: {
  variant: 'card' | 'tab';
  state: 'on' | 'off' | 'default' | 'unknown';
  disabled: boolean;
  onToggle: (enable: boolean) => void;
  onRevert: () => void;
  labels: { enable: string; disable: string; revert: string };
}) => (
  <div className="flex flex-wrap items-center gap-2">
    <button onClick={() => onToggle(true)} disabled={disabled || state === 'on'} className="dh-btn dh-btn-sm">
      <CheckCircle2 size={14} className="text-zinc-400" />
      <span>{labels.enable}</span>
    </button>
    <button onClick={() => onToggle(false)} disabled={disabled || state === 'off'} className="dh-btn dh-btn-sm">
      <ShieldAlert size={14} className="text-zinc-400" />
      <span>{labels.disable}</span>
    </button>
    <button onClick={onRevert} disabled={disabled} className="dh-btn dh-btn-ghost dh-btn-sm">
      <RotateCcw size={14} />
      <span>{labels.revert}</span>
    </button>
  </div>
);

export default function Optimizer({ onNavigate }: { onNavigate?: (page: string) => void } = {}) {
  const { t } = useI18n();

  // Navigation & View
  const [activeTab, setActiveTab] = useState<OptimizerTab>('tweaks');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTweakIds, setSelectedTweakIds] = useState<Set<string>>(new Set());

  // Operations & Deep Tweaks State
  const [operations, setOperations] = useState<any[]>([]);
  const [deepTweaks, setDeepTweaks] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [opStatus, setOpStatus] = useState<Record<string, boolean | null>>({});
  const [opPartial, setOpPartial] = useState<Record<string, boolean>>({});
  const [tweakStatus, setTweakStatus] = useState<Record<string, boolean>>({});
  const [tweakPartial, setTweakPartial] = useState<Record<string, boolean>>({});
  const [isCheckingStatus, setIsCheckingStatus] = useState<boolean>(true);
  const [statusError, setStatusError] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<boolean>(false);
  const [isAdminUser, setIsAdminUser] = useState<boolean | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizingId, setOptimizingId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [showConsole, setShowConsole] = useState(false);
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);
  const confirmResolver = useRef<((v: boolean) => void) | null>(null);

  // Quick Tools Live Feedback (real, measured messages)
  const [ramMsg, setRamMsg] = useState<string | null>(null);
  const [diskMsg, setDiskMsg] = useState<string | null>(null);
  const [dnsMsg, setDnsMsg] = useState<string | null>(null);
  const [powerMsg, setPowerMsg] = useState<string | null>(null);
  const [audioMsg, setAudioMsg] = useState<string | null>(null);

  // Program Uninstaller with Leftovers State
  const [installedPrograms, setInstalledPrograms] = useState<any[]>([]);
  const [programSearch, setProgramSearch] = useState('');
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [uninstallingProgram, setUninstallingProgram] = useState<string | null>(null);

  // GPU Preferences & HAGS State
  const [gpuPreferences, setGpuPreferences] = useState<any[]>([]);
  const [gpuInfo, setGpuInfo] = useState<any>(null);
  const [selectedGpuAppPath, setSelectedGpuAppPath] = useState('');
  const [selectedGpuPref, setSelectedGpuPref] = useState<'high_performance' | 'power_saving' | 'default'>('high_performance');
  const [hagsStatus, setHagsStatus] = useState<{ loading: boolean; state: 'on' | 'off' | 'default' | 'unknown'; error?: string }>({
    loading: false,
    state: 'unknown'
  });

  // Process Priority State
  const [processList, setProcessList] = useState<any[]>([]);
  const [processSearch, setProcessSearch] = useState('');
  const [selectedProcess, setSelectedProcess] = useState<number | null>(null);
  const [selectedPriority, setSelectedPriority] = useState<string>('high');
  const [isRefreshingProcesses, setIsRefreshingProcesses] = useState(false);

  // Debloat State
  const [bloatwareList, setBloatwareList] = useState<any[]>([]);
  const [selectedBloatware, setSelectedBloatware] = useState<Set<string>>(new Set());
  const [loadingBloatware, setLoadingBloatware] = useState(false);

  // Startup Items State
  const [startupItems, setStartupItems] = useState<any[]>([]);
  const [loadingStartup, setLoadingStartup] = useState(false);

  // Network & DNS State
  const [dnsBenchmarkRunning, setDnsBenchmarkRunning] = useState(false);
  const [dnsBenchmarkResults, setDnsBenchmarkResults] = useState<any[] | null>(null);
  const [dnsBenchmarkFailed, setDnsBenchmarkFailed] = useState<number>(0);
  const [dnsState, setDnsState] = useState<any>(null);
  const [dnsUndoToken, setDnsUndoToken] = useState<string | null>(null);

  // Defender State
  const [defenderStatus, setDefenderStatus] = useState<any>(null);
  const [defenderLoading, setDefenderLoading] = useState(false);
  const [defenderTamperBlocked, setDefenderTamperBlocked] = useState(false);

  const logBottomRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<Record<string, string>>({});

  const addLog = (level: LogLevel, text: string) => {
    setLogs((prev) => {
      const next = [...prev, { ts: new Date().toLocaleTimeString(), level, text }];
      return next.length > MAX_LOG_LINES ? next.slice(next.length - MAX_LOG_LINES) : next;
    });
  };

  const askConfirm = (req: ConfirmRequest) =>
    new Promise<boolean>((resolve) => {
      confirmResolver.current = resolve;
      setConfirmReq(req);
    });

  const answerConfirm = (v: boolean) => {
    const r = confirmResolver.current;
    confirmResolver.current = null;
    setConfirmReq(null);
    if (r) r(v);
  };

  useEffect(() => {
    // Scroll only the terminal drawer, never the page behind it.
    const box = logBottomRef.current?.parentElement;
    if (showConsole && box) box.scrollTop = box.scrollHeight;
  }, [logs, showConsole]);

  // keep id -> readable name for the event log
  useEffect(() => {
    const map: Record<string, string> = {};
    for (const op of operations) map[op.id] = t(`optimizer.audit.op.${op.id}.name`, op.name);
    labelsRef.current = map;
  }, [operations, t]);

  const loadInitialData = async () => {
    if (!api()) return;
    setLoadError(false);
    try {
      const [ops, deepList, admin, profs] = await Promise.all([
        api().listOperations().catch(() => []),
        api().deepTweaksList().catch(() => []),
        api().checkIsAdmin().catch(() => false),
        api().listProfiles?.().catch(() => []) ?? Promise.resolve([])
      ]);
      const validOps = Array.isArray(ops) ? ops : [];
      const validDeep = Array.isArray(deepList) ? deepList : [];
      setOperations(validOps);
      setDeepTweaks(validDeep);
      setProfiles(Array.isArray(profs) ? profs : []);
      setIsAdminUser(Boolean(admin));

      if (validOps.length === 0 && validDeep.length === 0) {
        setLoadError(true);
      }
    } catch (e: any) {
      console.error(e);
      setLoadError(true);
    }

    // Check status asynchronously without blocking UI render. The HAGS card is always visible, so read it now too
    // (it used to load only with the GPU tab and showed "Unavailable" until then).
    void loadHagsStatus();
    await refreshStatus();
  };

  /**
   * Reads the real applied state. Each call gets a sequence number so a slow, older answer can never overwrite a
   * newer one (status checks spawn PowerShell and can take seconds). Returns { ops, deep } or null.
   */
  const statusSeqRef = useRef(0);
  const refreshStatus = async (): Promise<{ ops: Record<string, boolean | null>; deep: Record<string, boolean> } | null> => {
    const seq = ++statusSeqRef.current;
    setIsCheckingStatus(true);
    setStatusError(false);
    let out: { ops: Record<string, boolean | null>; deep: Record<string, boolean> } | null = null;
    try {
      const res = api()?.checkOperationsStatus
        ? await api().checkOperationsStatus()
        : await api()?.deepTweaksStatus();
      if (seq !== statusSeqRef.current) return null; // superseded by a newer check
      if (res?.ok) {
        if (res.status) setOpStatus(res.status);
        if (res.partial) setOpPartial(res.partial);
        setTweakStatus(res.deepStatus || res.status || {});
        setTweakPartial(res.deepPartial || res.partial || {});
        setStatusError(false);
        out = { ops: res.status || {}, deep: res.deepStatus || res.status || {} };
      } else {
        setStatusError(true);
      }
    } catch {
      if (seq === statusSeqRef.current) setStatusError(true);
    } finally {
      if (seq === statusSeqRef.current) setIsCheckingStatus(false);
    }
    return out;
  };

  useEffect(() => {
    // Safety fallback in case contextBridge had a microtask delay. Only when the bridge was missing: the old
    // unconditional retry loaded everything (and ran the PowerShell status check) twice on every visit.
    const hadApi = Boolean(api());
    if (hadApi) loadInitialData();
    const retryTimer = setTimeout(() => {
      if (!hadApi) loadInitialData();
    }, 250);

    let unsub: any = null;
    if (api()?.onRunEvent) {
      unsub = api().onRunEvent((ev: any) => {
        const label = labelsRef.current[ev?.opId] || ev?.opId;
        if (ev?.type === 'op-start') addLog('info', fmt(t('optimizer.audit.log.opStart', 'Iniciando: {name}...'), { name: label }));
        if (ev?.type === 'op-finish') {
          if (ev.ok) addLog('ok', `${label}: ${ev.output?.msg || t('optimizer.audit.log.opDone', 'concluído')}`);
          else addLog('err', `${label}: ${ev.error || ev.output?.error || t('optimizer.audit.log.opFail', 'falhou')}`);
        }
        if (ev?.type === 'run-finish') {
          const failed = Number(ev.failed || 0);
          if (failed > 0) {
            addLog('warn', fmt(t('optimizer.audit.log.runFail', 'Execução terminou com falhas: {ok} de {total} tarefas concluídas, {failed} falharam.'), { ok: ev.ok ?? ev.completed - failed, total: ev.total, failed }));
          } else {
            addLog('ok', fmt(t('optimizer.audit.log.runOk', 'Execução concluída: {total} tarefa(s) sem falhas.'), { total: ev.total }));
          }
        }
      });
    }
    return () => {
      clearTimeout(retryTimer);
      if (unsub) unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tab data is loaded by the tab buttons themselves (each click refreshes). The former "lazy load" effect ran the
  // same loaders a second time on the first visit of the GPU / network / Defender tabs.

  // pending "flash" timers of the hero tiles, cleared on unmount
  const flashTimersRef = useRef<number[]>([]);
  useEffect(() => () => { flashTimersRef.current.forEach((id) => window.clearTimeout(id)); }, []);

  /** Runs operations (sequentially in the backend) and returns one honest result per operation. */
  const runOps = async (ids: string[]): Promise<RunResult[]> => {
    try {
      const res = await api().run({ operationIds: ids });
      const list: any[] = Array.isArray(res?.results) ? res.results : [];
      return ids.map((id, i) => {
        const r = list[i];
        if (!r) return { id, ok: false, msg: '', error: t('optimizer.audit.err.noResult', 'Sem resultado do executor'), savingsBytes: 0 };
        return { id, ok: Boolean(r.ok), msg: r.output?.msg || '', error: r.ok ? undefined : (r.error || r.output?.error || t('optimizer.audit.log.opFail', 'falhou')), savingsBytes: r.output?.savingsBytes || 0 };
      });
    } catch (e: any) {
      return ids.map((id) => ({ id, ok: false, msg: '', error: e?.message || String(e), savingsBytes: 0 }));
    }
  };

  const runOne = async (id: string) => (await runOps([id]))[0];

  /**
   * Wraps an action with the busy flag and the console. The ref guard blocks a second action started before React
   * re-rendered the disabled buttons (double click, or two buttons clicked in quick succession).
   */
  const busyRef = useRef(false);
  const withBusy = async (fn: () => Promise<void>, id: string | null = null) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsOptimizing(true);
    setOptimizingId(id);
    setShowConsole(true);
    try {
      await fn();
    } catch (e: any) {
      addLog('err', e?.message || String(e));
    } finally {
      busyRef.current = false;
      setIsOptimizing(false);
      setOptimizingId(null);
    }
  };

  const reportResult = (res: any, okFallback: string, failFallback: string) => {
    if (res?.ok) addLog('ok', res.msg || okFallback);
    else addLog('err', res?.error || failFallback);
    return Boolean(res?.ok);
  };

  // --- Quick Tools (each one shows the REAL measured result) ---
  const flash = (setter: (v: string | null) => void, text: string) => {
    setter(text);
    flashTimersRef.current.push(window.setTimeout(() => setter(null), 9000));
  };

  const handleOptimizeRAM = () =>
    withBusy(async () => {
      addLog('info', t('optimizer.audit.ram.start', 'Esvaziando o working set de processos em segundo plano (efeito temporário: o Windows traz as páginas de volta conforme necessário)...'));
      const r = await runOne('optimizer:optimizeRAM');
      if (r.ok) flash(setRamMsg, r.msg || t('optimizer.audit.ram.done', 'RAM otimizada'));
      else flash(setRamMsg, t('optimizer.audit.failedShort', 'Falhou: veja o terminal'));
    });

  const handleCleanTempFiles = () =>
    withBusy(async () => {
      addLog('info', t('optimizer.audit.disk.start', 'Apagando arquivos temporários e caches (apenas o que não está em uso)...'));
      const r = await runOne('optimizer:cleanTemp');
      if (r.ok) flash(setDiskMsg, r.savingsBytes > 0 ? fmt(t('optimizer.audit.disk.freed', '{size} liberados'), { size: fmtBytes(r.savingsBytes) }) : (r.msg || t('optimizer.audit.disk.nothing', 'Nada para limpar')));
      else flash(setDiskMsg, t('optimizer.audit.failedShort', 'Falhou: veja o terminal'));
    });

  const handleFlushDNS = () =>
    withBusy(async () => {
      addLog('info', t('optimizer.audit.dns.flushStart', 'Executando ipconfig /flushdns (limpa só o cache local de DNS)...'));
      const r = await runOne('optimizer:flushDns');
      if (r.ok) flash(setDnsMsg, t('optimizer.audit.dns.flushed', 'Cache de DNS limpo'));
      else flash(setDnsMsg, t('optimizer.audit.failedShort', 'Falhou: veja o terminal'));
    });

  const handleSetPowerPlan = () =>
    withBusy(async () => {
      addLog('info', t('optimizer.audit.power.start', 'Ativando o plano de energia Alto Desempenho (o plano anterior fica salvo e pode ser restaurado na lista de ajustes)...'));
      const r = await runOne('optimizer:powerPlanHighPerformance');
      flash(setPowerMsg, r.ok ? (r.msg || t('optimizer.audit.power.done', 'Plano ativado')) : t('optimizer.audit.failedShort', 'Falhou: veja o terminal'));
      await refreshStatus(); // only the applied state changed: no need to reload the whole catalog
    });

  const handleOptimizeAudioLatency = () =>
    withBusy(async () => {
      addLog('info', t('optimizer.audit.audio.start', 'Verificando a prioridade do processo de áudio do Windows (audiodg.exe)...'));
      const r = await runOne('optimizer:optimizeAudioLatency');
      flash(setAudioMsg, r.ok ? (r.msg || t('optimizer.audit.audio.done', 'Prioridade verificada')) : t('optimizer.audit.failedShort', 'Falhou: veja o terminal'));
    });

  const handleCreateRestorePoint = () =>
    withBusy(async () => {
      addLog('info', t('optimizer.audit.restore.start', 'Criando ponto de restauração do sistema (exige administrador e Proteção do Sistema ativa)...'));
      const res = await api().createRestorePoint();
      reportResult(res, t('optimizer.audit.restore.ok', 'Ponto de restauração criado.'), t('optimizer.audit.restore.fail', 'Não foi possível criar o ponto de restauração.'));
    });

  // --- Advanced Network ---
  // verified state comes from opStatus/opPartial (the operation list itself always carries applied: null)
  const advNetApplied: boolean | null = opStatus['optimizer:advancedNetwork'] ?? null;
  const advNetPartial = Boolean(opPartial['optimizer:advancedNetwork']);

  const handleApplyAdvancedNetwork = async () => {
    const ok = await askConfirm({
      title: t('optimizer.audit.net.confirmTitle', 'Aplicar ajustes de latência TCP?'),
      body: t('optimizer.audit.net.confirmBody', 'Altera TcpAckFrequency/TCPNoDelay nos adaptadores ativos, desliga o Energy-Efficient Ethernet (a conexão pode piscar) e remove o limite de QoS. O efeito é pequeno e NÃO aumenta a velocidade da internet. É reversível.'),
      confirmLabel: t('optimizer.audit.apply', 'Aplicar')
    });
    if (!ok) return;
    await withBusy(async () => {
      addLog('info', t('optimizer.audit.net.start', 'Aplicando ajustes de latência TCP por adaptador...'));
      const res = await api().advancedNetworkApply();
      reportResult(res, t('optimizer.audit.net.ok', 'Ajustes aplicados.'), t('optimizer.audit.net.fail', 'Falha ao aplicar a rede avançada'));
      await refreshStatus(); // only the applied state changed: no need to reload the whole catalog
    });
  };

  const handleRevertAdvancedNetwork = () =>
    withBusy(async () => {
      addLog('info', t('optimizer.audit.net.revertStart', 'Revertendo ajustes de rede para os valores anteriores...'));
      const res = await api().advancedNetworkRevert();
      reportResult(res, t('optimizer.audit.net.revertOk', 'Ajustes de rede revertidos.'), t('optimizer.audit.net.revertFail', 'Falha ao reverter a rede'));
      await refreshStatus(); // only the applied state changed: no need to reload the whole catalog
    });

  // --- Program Uninstaller with Leftovers ---
  const loadPrograms = async () => {
    if (!api()?.getInstalledPrograms) return;
    setLoadingPrograms(true);
    try {
      const res = await api().getInstalledPrograms();
      if (res?.ok && Array.isArray(res.programs)) setInstalledPrograms(res.programs);
      else if (res && !res.ok) addLog('err', res.error || t('optimizer.audit.prog.loadFail', 'Falha ao listar programas'));
    } catch (e: any) {
      addLog('err', e?.message || String(e));
    } finally {
      setLoadingPrograms(false);
    }
  };

  const handleUninstallProgram = async (prog: any) => {
    if (!prog || !api()?.uninstallProgramWithLeftovers) return;
    const ok = await askConfirm({
      title: fmt(t('optimizer.audit.prog.confirmTitle', 'Desinstalar "{name}"?'), { name: prog.name }),
      body: t('optimizer.audit.prog.confirmBody', 'O desinstalador oficial será executado. Somente depois que o programa realmente sumir do Registro, pastas de resíduos com o nome dele em AppData, ProgramData e chaves do Registro serão apagadas. Configurações e dados salvos desse programa em AppData podem ser perdidos de forma permanente.'),
      confirmLabel: t('optimizer.audit.prog.confirmBtn', 'Desinstalar'),
      danger: true
    });
    if (!ok) return;
    await withBusy(async () => {
      setUninstallingProgram(prog.name);
      addLog('info', fmt(t('optimizer.audit.prog.start', 'Desinstalando "{name}" e varrendo resíduos...'), { name: prog.name }));
      try {
        const res = await api().uninstallProgramWithLeftovers({
          name: prog.name,
          uninstallString: prog.uninstallString,
          installLocation: prog.installLocation,
          publisher: prog.publisher,
          keyPath: prog.keyPath
        });
        if (res?.ok) {
          const freed = Number(res.freedBytes || 0);
          addLog('ok', `${res.msg || ''}${freed > 0 ? ' ' + fmt(t('optimizer.audit.prog.freed', '({size} de resíduos removidos)'), { size: fmtBytes(freed) }) : ''}`.trim());
          await loadPrograms();
        } else {
          addLog('err', res?.error || t('optimizer.audit.prog.fail', 'Falha ao desinstalar o programa'));
        }
      } finally {
        setUninstallingProgram(null);
      }
    });
  };

  // --- Combined Tweaks & Operations Matrix ---
  const allTweaksList: TweakItem[] = useMemo(() => {
    const list: TweakItem[] = [];
    const covered = new Set<string>();
    for (const op of operations) {
      if (op.isRevert) continue;
      if (Array.isArray(op.tweakIds) && op.tweakIds.length === 1) covered.add(op.tweakIds[0]);
      const isApplied = opStatus[op.id] !== undefined ? opStatus[op.id] : (op.applied === true ? true : op.applied === false ? false : null);
      list.push({
        id: op.id,
        kind: 'op',
        title: t(`optimizer.audit.op.${op.id}.name`, op.name),
        description: t(`optimizer.audit.op.${op.id}.desc`, op.description || ''),
        category: op.category || 'system',
        risk: (op.risk as RiskLevel) || 'safe',
        requiresAdmin: Boolean(op.requiresAdmin),
        requiresReboot: Boolean(op.requiresReboot),
        securityRelated: Boolean(op.securityRelated),
        warning: op.warning ? t(`optimizer.audit.op.${op.id}.warning`, op.warning) : null,
        revertId: op.revertId || null,
        applied: isApplied,
        partial: Boolean(op.partial || opPartial[op.id]),
        recommended: false
      });
    }
    for (const dt of deepTweaks) {
      if (dt.internal || covered.has(dt.id)) continue;
      list.push({
        id: dt.id,
        kind: 'deep',
        title: t(`optimizer.audit.tweak.${dt.id}.title`, dt.title || dt.id),
        description: t(`optimizer.audit.tweak.${dt.id}.desc`, dt.description || ''),
        category: dt.category || 'system',
        risk: DEEP_RISK[dt.risk] || 'safe',
        requiresAdmin: Boolean(dt.requiresAdmin),
        requiresReboot: Boolean(dt.requiresReboot),
        securityRelated: Boolean(dt.securityRelated),
        warning: dt.warning ? String(dt.warning) : null,
        revertId: null,
        applied: tweakStatus[dt.id] !== undefined ? Boolean(tweakStatus[dt.id]) : null,
        partial: Boolean(tweakPartial[dt.id]),
        recommended: dt.recommended === true
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operations, deepTweaks, opStatus, opPartial, tweakStatus, tweakPartial, isCheckingStatus, t]);

  const filteredTweaks = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return allTweaksList.filter((it) => {
      const matchesSearch = it.title.toLowerCase().includes(q) || it.description.toLowerCase().includes(q);
      const matchesCat =
        categoryFilter === 'all' ||
        it.category === categoryFilter ||
        (categoryFilter === 'system' && (it.category === 'security' || it.category === 'system'));
      return matchesSearch && matchesCat;
    });
  }, [allTweaksList, searchQuery, categoryFilter]);

  const categories = [
    { id: 'all', label: t('optimizer.audit.cat.all', 'Todos os Ajustes') },
    { id: 'customization', label: t('optimizer.audit.cat.customization', 'Customização & UI') },
    { id: 'privacy', label: t('optimizer.audit.cat.privacy', 'Privacidade & IA') },
    { id: 'gaming', label: t('optimizer.audit.cat.gaming', 'Performance & Jogos') },
    { id: 'storage', label: t('optimizer.audit.cat.storage', 'Limpeza & Disco') },
    { id: 'memory', label: t('optimizer.audit.cat.memory', 'Memória RAM') },
    { id: 'network', label: t('optimizer.audit.cat.network', 'Rede & Conexão') },
    { id: 'power', label: t('optimizer.audit.cat.power', 'Energia & CPU') },
    { id: 'system', label: t('optimizer.audit.cat.system', 'Sistema & Segurança') }
  ];

  const needsConfirm = (it: TweakItem) => Boolean(it.warning) || it.risk === 'advanced' || it.securityRelated;

  const riskBadge = (risk: RiskLevel) => {
    if (risk === 'advanced') return { cls: 'text-rose-400', label: t('optimizer.audit.risk.advanced', 'RISCO ALTO') };
    if (risk === 'moderate') return { cls: 'text-amber-400', label: t('optimizer.audit.risk.moderate', 'RISCO MÉDIO') };
    return { cls: 'text-zinc-500', label: t('optimizer.audit.risk.safe', 'baixo risco') };
  };

  const confirmItems = (items: TweakItem[], verb: string) => {
    const withWarn = items.filter((i) => i.warning);
    const body = [
      verb,
      ...withWarn.map((i) => `- ${i.title}: ${i.warning}`)
    ].join('\n');
    return askConfirm({
      title: t('optimizer.audit.confirm.title', 'Confirmar alterações no sistema'),
      body,
      items: items.map((i) => `${i.title}${i.requiresReboot ? ' (' + t('optimizer.audit.needsReboot', 'exige reiniciar') + ')' : ''}`),
      confirmLabel: t('optimizer.audit.confirm.go', 'Continuar'),
      danger: items.some((i) => i.risk === 'advanced' || i.securityRelated)
    });
  };

  /** Applies a set of items: operations through `run`, registry tweaks through deepTweaksApply. Returns failures. */
  const applyItems = async (items: TweakItem[]) => {
    const opIds = items.filter((i) => i.kind === 'op').map((i) => i.id);
    const deepIds = items.filter((i) => i.kind === 'deep').map((i) => i.id);
    let failures = 0;
    if (opIds.length) {
      const res = await runOps(opIds);
      failures += res.filter((r) => !r.ok).length;
    }
    if (deepIds.length) {
      const res = await api().deepTweaksApply({ tweakIds: deepIds });
      if (!reportResult(res, t('optimizer.audit.tweaks.applied', 'Ajustes aplicados e verificados.'), t('optimizer.audit.tweaks.applyFail', 'Falha ao aplicar ajustes'))) failures += 1;
    }
    return failures;
  };

  const revertItems = async (items: TweakItem[]) => {
    const opIds = items.filter((i) => i.kind === 'op' && i.revertId).map((i) => i.revertId as string);
    const deepIds = items.filter((i) => i.kind === 'deep').map((i) => i.id);
    let failures = 0;
    if (opIds.length) {
      const res = await runOps(opIds);
      failures += res.filter((r) => !r.ok).length;
    }
    if (deepIds.length) {
      const res = await api().deepTweaksRevert({ tweakIds: deepIds });
      if (!reportResult(res, t('optimizer.audit.tweaks.reverted', 'Ajustes revertidos e verificados.'), t('optimizer.audit.tweaks.revertFail', 'Falha ao reverter ajustes'))) failures += 1;
    }
    return failures;
  };

  const afterChange = async () => {
    await refreshStatus();
  };

  const handleApplyItem = async (it: TweakItem) => {
    if (needsConfirm(it)) {
      const ok = await confirmItems([it], it.warning || t('optimizer.audit.confirm.advancedBody', 'Este ajuste é avançado. Leia o aviso antes de continuar.'));
      if (!ok) return;
    }
    await withBusy(async () => {
      addLog('info', fmt(t('optimizer.audit.log.applying', 'Aplicando: {name}...'), { name: it.title }));
      await applyItems([it]);
      await afterChange();
    }, it.id);
  };

  const handleRevertItem = async (it: TweakItem) => {
    await withBusy(async () => {
      addLog('info', fmt(t('optimizer.audit.log.reverting', 'Revertendo: {name}...'), { name: it.title }));
      await revertItems([it]);
      await afterChange();
    }, it.id);
  };

  // --- Batch Run ---
  const handleRunBatch = async (action: 'apply' | 'revert') => {
    const picked = allTweaksList.filter((i) => selectedTweakIds.has(i.id));
    if (picked.length === 0) return;
    let targets = picked;
    if (action === 'revert') {
      targets = picked.filter((i) => i.applied === true && (i.kind === 'deep' || i.revertId));
      if (targets.length === 0) {
        setShowConsole(true);
        addLog('warn', t('optimizer.audit.batch.nothingToRevert', 'Nenhum dos itens selecionados está ativo, então não há o que reverter.'));
        return;
      }
    } else {
      targets = picked.filter((i) => i.applied !== true);
      if (targets.length === 0) {
        setShowConsole(true);
        addLog('warn', t('optimizer.audit.batch.alreadyApplied', 'Todos os itens selecionados já estão aplicados.'));
        return;
      }
    }
    if (action === 'apply' && (targets.some(needsConfirm) || targets.length > 5)) {
      const ok = await confirmItems(targets, t('optimizer.audit.batch.confirmBody', 'Os ajustes abaixo serão aplicados em sequência. Itens avançados mudam comportamento do Windows; todos têm reversão.'));
      if (!ok) return;
    }
    await withBusy(async () => {
      const skipped = picked.length - targets.length;
      addLog('info', fmt(action === 'apply' ? t('optimizer.audit.batch.applying', 'Lote: aplicando {n} ajuste(s)...') : t('optimizer.audit.batch.reverting', 'Lote: revertendo {n} ajuste(s) ativos...'), { n: targets.length }));
      if (skipped > 0) addLog('info', fmt(t('optimizer.audit.batch.skipped', '{n} item(ns) ignorado(s) por já estarem no estado desejado.'), { n: skipped }));
      const failures = action === 'apply' ? await applyItems(targets) : await revertItems(targets);
      if (failures === 0) addLog('ok', t('optimizer.audit.batch.done', 'Lote concluído sem falhas.'));
      else addLog('warn', fmt(t('optimizer.audit.batch.doneFail', 'Lote concluído com {n} falha(s). Veja as mensagens acima.'), { n: failures }));
      setSelectedTweakIds(new Set());
      await afterChange();
    });
  };

  // --- Profiles (from the backend; never include VBS, services, Defender, BitLocker in safe/recommended/gaming) ---
  const handleApplyProfile = async (profile: any) => {
    const ids: string[] = (profile.tweakIds || []).filter((id: string) => operations.some((o) => o.id === id));
    const items = allTweaksList.filter((i) => ids.includes(i.id));
    if (items.length === 0) return;
    const ok = await confirmItems(items, `${profile.description || ''}`);
    if (!ok) return;
    await withBusy(async () => {
      addLog('info', fmt(t('optimizer.audit.profile.applying', 'Aplicando perfil "{name}" ({n} itens, em sequência)...'), { name: profile.name, n: items.length }));
      const res = await runOps(items.map((i) => i.id));
      const failed = res.filter((r) => !r.ok).length;
      if (failed === 0) addLog('ok', t('optimizer.audit.profile.done', 'Perfil aplicado sem falhas.'));
      else addLog('warn', fmt(t('optimizer.audit.profile.doneFail', 'Perfil aplicado com {n} falha(s).'), { n: failed }));
      await afterChange();
    });
  };

  // --- Executive presets ---
  const recommendedDeepIds = useMemo(
    () => deepTweaks.filter((d) => d.recommended === true && d.risk === 'low' && !d.securityRelated && !d.internal).map((d) => d.id as string),
    [deepTweaks]
  );

  const handleSafeOptimization = async () => {
    const names = deepTweaks.filter((d) => recommendedDeepIds.includes(d.id)).map((d) => t(`optimizer.audit.tweak.${d.id}.title`, d.title || d.id));
    const ok = await askConfirm({
      title: t('optimizer.audit.safe.title', 'Otimização Segura'),
      body: t('optimizer.audit.safe.body', 'Executa, em sequência: liberar RAM (temporário), limpar temporários, limpar cache de DNS e aplicar apenas ajustes de baixo risco e reversíveis. NÃO desativa telemetria, Defender, VBS, serviços nem BitLocker.'),
      items: names,
      confirmLabel: t('optimizer.audit.confirm.go', 'Continuar')
    });
    if (!ok) return;
    await withBusy(async () => {
      addLog('info', t('optimizer.audit.safe.start', 'Otimização Segura iniciada (passos em sequência).'));
      const steps = await runOps(['optimizer:optimizeRAM', 'optimizer:cleanTemp', 'optimizer:flushDns']);
      let failed = steps.filter((s) => !s.ok).length;
      if (recommendedDeepIds.length) {
        const res = await api().deepTweaksApply({ tweakIds: recommendedDeepIds });
        if (!reportResult(res, t('optimizer.audit.tweaks.applied', 'Ajustes aplicados e verificados.'), t('optimizer.audit.tweaks.applyFail', 'Falha ao aplicar ajustes'))) failed += 1;
      }
      if (failed === 0) addLog('ok', t('optimizer.audit.safe.done', 'Otimização Segura concluída sem falhas.'));
      else addLog('warn', fmt(t('optimizer.audit.safe.doneFail', 'Otimização Segura terminou com {n} falha(s).'), { n: failed }));
      await afterChange();
    });
  };

  const handleRevertAll = async () => {
    const ok = await askConfirm({
      title: t('optimizer.audit.revertAll.title', 'Restaurar padrões'),
      body: t('optimizer.audit.revertAll.body', 'Reverte somente o que o DarkHub alterou e que continua ativo: ajustes com snapshot são restaurados aos valores exatos de antes; operações ativas usam sua reversão. Configurações que você nunca alterou não são tocadas. Se a proteção em tempo real do Defender foi desativada por política do DarkHub, ela será reativada.'),
      confirmLabel: t('optimizer.audit.revertAll.go', 'Restaurar')
    });
    if (!ok) return;
    await withBusy(async () => {
      addLog('info', t('optimizer.audit.revertAll.start', 'Restaurando alterações ativas feitas pelo DarkHub...'));
      let failures = 0;
      let touched = 0;

      // The applied state lives in opStatus (listOperations() always reports applied: null), so the previous filter on
      // `o.applied === true` never matched and "Restaurar padrões" silently skipped every active operation.
      const fresh = await refreshStatus();
      const opsState = fresh?.ops || opStatus;
      const activeOps = operations.filter((o) => !o.isRevert && opsState[o.id] === true && o.revertId);
      if (activeOps.length) {
        touched += activeOps.length;
        const res = await runOps(activeOps.map((o) => o.revertId));
        failures += res.filter((r) => !r.ok).length;
      }

      const st = (await refreshStatus())?.deep || fresh?.deep || tweakStatus;
      const activeDeep = deepTweaks.filter((d) => !d.internal && st[d.id]).map((d) => d.id as string);
      const undoIds = [...activeDeep, 'group:hags'];
      const undoRes = await api().deepTweaksUndo({ tweakIds: undoIds });
      if (undoRes?.ok) { touched += 1; addLog('ok', undoRes.msg || t('optimizer.audit.revertAll.undoOk', 'Snapshots restaurados.')); }
      else if (/snapshot/i.test(String(undoRes?.error || ''))) addLog('info', t('optimizer.audit.revertAll.noSnapshots', 'Nenhum ajuste de registro com snapshot para restaurar.'));
      else { failures += 1; addLog('err', undoRes?.error || t('optimizer.audit.revertAll.undoFail', 'Falha ao restaurar snapshots')); }

      if (defenderStatus?.policyDisableRealtime === 1) {
        const res = await api().applyDefenderControl({ action: 'enable' });
        touched += 1;
        if (!reportResult(res, t('optimizer.audit.defender.enabled', 'Defender restaurado.'), t('optimizer.audit.defender.fail', 'Falha no Defender'))) failures += 1;
      }
      if (dnsUndoToken) {
        const res = await api().undoDns({ undoToken: dnsUndoToken });
        touched += 1;
        if (reportResult(res, t('optimizer.audit.dns.undoOk', 'DNS restaurado.'), t('optimizer.audit.dns.undoFail', 'Falha ao restaurar o DNS'))) setDnsUndoToken(null);
        else failures += 1;
      }

      if (touched === 0 && failures === 0) addLog('info', t('optimizer.audit.revertAll.nothing', 'Não há alterações do DarkHub ativas para restaurar.'));
      else if (failures === 0) addLog('ok', t('optimizer.audit.revertAll.done', 'Restauração concluída sem falhas.'));
      else addLog('warn', fmt(t('optimizer.audit.revertAll.doneFail', 'Restauração terminou com {n} falha(s).'), { n: failures }));
      await afterChange();
      await loadHagsStatus();
      await loadDefenderStatus();
      await refreshDnsState();
    });
  };

  const handleRestoreStreamingDefaults = () =>
    withBusy(async () => {
      addLog('info', t('optimizer.audit.streaming.start', 'Restaurando kernel/MMCSS e o agendamento de GPU (HAGS) para o estado anterior...'));
      const kernel = operations.find((o) => o.id === 'optimizer:kernelExtreme');
      if (kernel?.revertId && opStatus[kernel.id] !== false) await runOne(kernel.revertId);
      else addLog('info', t('optimizer.audit.streaming.kernelNotActive', 'Ajustes de kernel não estão ativos; nada a reverter ali.'));
      const res = await api().revertHags();
      reportResult(res, t('optimizer.audit.hags.revertOk', 'HAGS restaurado.'), t('optimizer.audit.hags.revertFail', 'Falha ao restaurar o HAGS'));
      await loadHagsStatus();
      await afterChange();
    });

  // --- GPU Preferences & HAGS ---
  const loadHagsStatus = async () => {
    if (!api()?.getHagsStatus) return;
    setHagsStatus((prev) => ({ ...prev, loading: true }));
    try {
      const res = await api().getHagsStatus();
      if (res?.ok) {
        const state = res.state ?? (res.enabled ? 'on' : res.value === '1' ? 'off' : 'default');
        setHagsStatus({ loading: false, state });
      } else {
        setHagsStatus({ loading: false, state: 'unknown', error: res?.error });
      }
    } catch (e: any) {
      setHagsStatus({ loading: false, state: 'unknown', error: e?.message || String(e) });
    }
  };

  const handleToggleHags = (enable: boolean) =>
    withBusy(async () => {
      addLog('info', enable ? t('optimizer.audit.hags.enabling', 'Ativando HAGS (HwSchMode = 2)...') : t('optimizer.audit.hags.disabling', 'Desativando HAGS (HwSchMode = 1)...'));
      const res = await api().setHagsStatus({ enabled: enable });
      reportResult(res, enable ? t('optimizer.audit.hags.enabledOk', 'HAGS ativado.') : t('optimizer.audit.hags.disabledOk', 'HAGS desativado.'), t('optimizer.audit.hags.fail', 'Falha ao ajustar o HAGS'));
      await loadHagsStatus();
    });

  const handleRevertHags = () =>
    withBusy(async () => {
      addLog('info', t('optimizer.audit.hags.reverting', 'Restaurando o HAGS ao valor que existia antes (ou ao padrão do driver)...'));
      const res = await api().revertHags();
      reportResult(res, t('optimizer.audit.hags.revertOk', 'HAGS restaurado.'), t('optimizer.audit.hags.revertFail', 'Falha ao restaurar o HAGS'));
      await loadHagsStatus();
    });

  const loadGpuData = async () => {
    if (!api()) return;
    try {
      const [prefs, info] = await Promise.all([
        api().getGpuPreferences?.().catch(() => null),
        api().getGpuInfo?.().catch(() => null)
      ]);
      if (prefs?.ok) setGpuPreferences(prefs.preferences || []);
      if (info?.ok) setGpuInfo(info);
      await loadHagsStatus();
    } catch {}
  };

  const handleBrowseGpuApp = async () => {
    if (!window.darkhub?.dialog?.selectFiles) return;
    try {
      const res = await window.darkhub.dialog.selectFiles({
        title: t('optimizer.audit.gpu.pickTitle', 'Selecionar Executável do Jogo (.exe)'),
        filters: [{ name: 'Executables', extensions: ['exe'] }]
      });
      if (!res.canceled && res.filePaths && res.filePaths.length > 0) setSelectedGpuAppPath(res.filePaths[0]);
    } catch {}
  };

  const handleSetGpuPreference = () =>
    withBusy(async () => {
      addLog('info', fmt(t('optimizer.audit.gpu.setting', 'Definindo preferência gráfica ({pref}) para "{path}"...'), { pref: selectedGpuPref, path: selectedGpuAppPath }));
      const res = await api().setGpuPreference({ appPath: selectedGpuAppPath.trim(), preference: selectedGpuPref });
      if (reportResult(res, t('optimizer.audit.gpu.ok', 'Preferência gravada.'), t('optimizer.audit.gpu.fail', 'Falha ao gravar a preferência de GPU'))) {
        setSelectedGpuAppPath('');
        await loadGpuData();
      }
    });

  const handleRemoveGpuPreference = (appPath: string) =>
    withBusy(async () => {
      const res = await api().removeGpuPreference({ appPath });
      if (reportResult(res, t('optimizer.audit.gpu.removed', 'Preferência removida.'), t('optimizer.audit.gpu.removeFail', 'Falha ao remover a preferência'))) await loadGpuData();
    });

  // --- Process Priority ---
  const loadProcesses = async () => {
    if (!api()?.getRunningProcesses) return;
    setIsRefreshingProcesses(true);
    try {
      const res = await api().getRunningProcesses();
      if (res?.ok && Array.isArray(res.processes)) setProcessList(res.processes);
      else if (res && !res.ok) addLog('err', res.error || t('optimizer.audit.proc.loadFail', 'Falha ao listar processos'));
    } catch (e: any) {
      addLog('err', e?.message || String(e));
    } finally {
      setIsRefreshingProcesses(false);
    }
  };

  const handleSetProcessPriority = async (pid: number | null, priority: string) => {
    if (!pid) return;
    const proc = processList.find((p) => p.pid === pid);
    if (proc?.critical) {
      setShowConsole(true);
      addLog('err', t('optimizer.audit.proc.critical', 'Processo crítico do Windows: a prioridade dele não pode ser alterada pelo DarkHub.'));
      return;
    }
    if (priority === 'realtime') {
      const ok = await askConfirm({
        title: t('optimizer.audit.proc.rtTitle', 'Prioridade Tempo Real'),
        body: t('optimizer.audit.proc.rtBody', 'Tempo Real pode travar o mouse, o teclado e o áudio do computador, pois disputa com o próprio sistema. Use apenas se souber o que está fazendo.'),
        confirmLabel: t('optimizer.audit.confirm.go', 'Continuar'),
        danger: true
      });
      if (!ok) return;
    }
    await withBusy(async () => {
      addLog('info', fmt(t('optimizer.audit.proc.setting', 'Definindo PID {pid} para {prio}...'), { pid, prio: priority.toUpperCase() }));
      const res = await api().setProcessPriority({ pid, priority, allowRealtime: priority === 'realtime' });
      reportResult(res, t('optimizer.audit.proc.ok', 'Prioridade alterada.'), t('optimizer.audit.proc.fail', 'Falha ao alterar a prioridade'));
    });
  };

  // --- Debloat Apps ---
  const loadBloatware = async () => {
    if (!api()?.listBloatware) return;
    setLoadingBloatware(true);
    try {
      const res = await api().listBloatware();
      if (res?.ok && Array.isArray(res.apps)) setBloatwareList(res.apps);
      else if (res && !res.ok) addLog('err', res.error || t('optimizer.audit.debloat.loadFail', 'Falha ao listar aplicativos'));
    } catch (e: any) {
      addLog('err', e?.message || String(e));
    } finally {
      setLoadingBloatware(false);
    }
  };

  const handleRemoveBloatware = async () => {
    if (selectedBloatware.size === 0) return;
    const ids = Array.from(selectedBloatware);
    const names = bloatwareList.filter((a) => ids.includes(a.id)).map((a) => a.name);
    const ok = await askConfirm({
      title: t('optimizer.audit.debloat.confirmTitle', 'Remover aplicativos do Windows?'),
      body: t('optimizer.audit.debloat.confirmBody', 'Os pacotes serão removidos do seu usuário. Eles podem ser reinstalados pela Microsoft Store, mas dados locais desses aplicativos podem ser perdidos. Aplicativos protegidos do sistema são bloqueados.'),
      items: names,
      confirmLabel: t('optimizer.audit.debloat.confirmBtn', 'Remover'),
      danger: true
    });
    if (!ok) return;
    await withBusy(async () => {
      addLog('info', fmt(t('optimizer.audit.debloat.start', 'Removendo {n} aplicativo(s)...'), { n: ids.length }));
      const res = await api().removeSelectedBloatware({ appIds: ids });
      if (res?.ok) addLog('ok', res.msg || t('optimizer.audit.debloat.ok', 'Remoção concluída.'));
      else addLog('err', res?.error || t('optimizer.audit.debloat.fail', 'Falha ao remover aplicativos'));
      if (Array.isArray(res?.removed) && res.removed.length) addLog('ok', `${t('optimizer.audit.debloat.removed', 'Removidos')}: ${res.removed.join(', ')}`);
      if (Array.isArray(res?.failed) && res.failed.length) addLog('err', `${t('optimizer.audit.debloat.failedList', 'Não removidos')}: ${res.failed.map((f: any) => (typeof f === 'string' ? f : `${f.id || f.name}${f.error ? ' (' + f.error + ')' : ''}`)).join(', ')}`);
      setSelectedBloatware(new Set());
      await loadBloatware();
    });
  };

  // --- Startup Items ---
  const loadStartupItems = async () => {
    if (!api()?.getStartupItems) return;
    setLoadingStartup(true);
    try {
      const res = await api().getStartupItems();
      if (res?.ok && Array.isArray(res.items)) setStartupItems(res.items);
      else if (res && !res.ok) addLog('err', res.error || t('optimizer.audit.startup.loadFail', 'Falha ao listar itens de inicialização'));
    } catch (e: any) {
      addLog('err', e?.message || String(e));
    } finally {
      setLoadingStartup(false);
    }
  };

  const handleToggleStartupItem = (item: any) =>
    withBusy(async () => {
      const enable = item.enabled === false;
      const res = await api().disableStartupItem({ ...item, enable } as any);
      reportResult(res, t('optimizer.audit.startup.ok', 'Item atualizado.'), t('optimizer.audit.startup.fail', 'Falha ao alterar o item de inicialização'));
      await loadStartupItems();
    });

  // --- Defender Control ---
  const loadDefenderStatus = async () => {
    if (!api()?.getDefenderControlStatus) return;
    setDefenderLoading(true);
    try {
      const res = await api().getDefenderControlStatus();
      if (res?.ok && res.status) setDefenderStatus(res.status);
      else if (res && !res.ok) addLog('err', res.error || t('optimizer.audit.defender.loadFail', 'Não foi possível ler o status do Defender'));
    } catch {} finally {
      setDefenderLoading(false);
    }
  };

  const handleApplyDefender = async (action: 'disable' | 'enable') => {
    if (action === 'disable') {
      const ok = await askConfirm({
        title: t('optimizer.audit.defender.confirmTitle', 'Desativar a proteção em tempo real?'),
        body: t('optimizer.audit.defender.confirmBody', 'Seu computador ficará sem antivírus ativo até você reativar. O DarkHub usa apenas os mecanismos oficiais (Set-MpPreference e política) e NÃO contorna a Proteção contra Adulteração: se ela estiver ligada, o Windows ignora a alteração e a ação é recusada. Isto não desliga SmartScreen nem o Firewall.'),
        confirmLabel: t('optimizer.audit.defender.disableBtn', 'Desativar'),
        danger: true
      });
      if (!ok) return;
    }
    await withBusy(async () => {
      setDefenderTamperBlocked(false);
      addLog('info', action === 'disable' ? t('optimizer.audit.defender.disabling', 'Desativando a proteção em tempo real (e verificando com o próprio Defender)...') : t('optimizer.audit.defender.enabling', 'Reativando a proteção do Defender...'));
      const res = await api().applyDefenderControl({ action });
      if (res?.tamperBlocked) setDefenderTamperBlocked(true);
      reportResult(res, t('optimizer.audit.defender.done', 'Concluído.'), t('optimizer.audit.defender.fail', 'Falha no Defender'));
      await loadDefenderStatus();
    });
  };

  const handleRestoreImageDefender = async () => {
    const ok = await askConfirm({
      title: t('optimizer.audit.defender.restoreImageTitle', 'Reativar o Microsoft Defender?'),
      body: t('optimizer.audit.defender.restoreImageBody', 'O Defender foi removido no nível da imagem DarkOS (serviços desativados offline). Isto reativa os serviços no registro e remove as políticas de desativação. É preciso reiniciar o PC. O app Segurança do Windows pode precisar ser reinstalado pelo Windows Update.'),
      confirmLabel: t('optimizer.audit.defender.restoreImageBtn', 'Reativar e exigir reinício'),
      danger: false
    });
    if (!ok) return;
    await withBusy(async () => {
      addLog('info', t('optimizer.audit.defender.restoringImage', 'Reativando os serviços do Defender no registro...'));
      const res = await api().restoreImageDefender();
      reportResult(res, t('optimizer.audit.defender.restoreImageOk', 'Serviços reativados. Reinicie o PC.'), t('optimizer.audit.defender.restoreImageFail', 'Falha ao reativar o Defender'));
      await loadDefenderStatus();
    });
  };

  const handleOpenTamper = async () => {
    try {
      const res = await api().openTamperSettings();
      reportResult(res, t('optimizer.audit.defender.tamperOpened', 'Segurança do Windows aberta.'), t('optimizer.audit.defender.tamperFail', 'Não foi possível abrir a Segurança do Windows'));
      setShowConsole(true);
    } catch (e: any) {
      addLog('err', e?.message || String(e));
    }
  };

  // --- DNS ---
  const refreshDnsState = async () => {
    if (!api()?.getDnsState) return;
    try {
      const res = await api().getDnsState();
      if (res?.ok) setDnsState({ adapter: res.adapter ?? res.data?.adapter, servers: res.servers ?? res.data?.servers ?? [] });
    } catch {}
  };

  const handleRunDnsBenchmark = async () => {
    if (!api()?.dnsBenchmark) return;
    setDnsBenchmarkRunning(true);
    setDnsBenchmarkResults(null);
    setShowConsole(true);
    addLog('info', t('optimizer.audit.dns.benchStart', 'Medindo a latência real das respostas DNS (UDP porta 53)...'));
    try {
      const res = await api().dnsBenchmark({ timeoutMs: 1500, attempts: 3, concurrency: 6 });
      if (res?.ok && Array.isArray(res?.results)) {
        setDnsBenchmarkResults(res.results);
        setDnsBenchmarkFailed(Number(res.failed || 0));
        addLog('ok', fmt(t('optimizer.audit.dns.benchDone', 'Benchmark concluído: {n} servidor(es) responderam, {f} não responderam.'), { n: res.results.length, f: res.failed || 0 }));
      } else {
        addLog('err', res?.error || t('optimizer.audit.dns.benchFail', 'Falha ao medir os servidores DNS'));
      }
    } catch (e: any) {
      addLog('err', e?.message || String(e));
    } finally {
      setDnsBenchmarkRunning(false);
    }
  };

  const isTrustedDns = (d: any) => d?.trusted === true || LOCAL_DNS_PRESETS.some((p) => p.primary === d?.primary);

  const handleApplyDns = async (dns: any) => {
    if (!isTrustedDns(dns)) {
      const ok = await askConfirm({
        title: t('optimizer.audit.dns.unverifiedTitle', 'Servidor DNS não verificado'),
        body: t('optimizer.audit.dns.unverifiedBody', 'Este servidor não está na lista de provedores conhecidos. Um servidor DNS vê todos os domínios que você acessa e pode redirecionar sites. Use apenas se confiar nele.'),
        confirmLabel: t('optimizer.audit.confirm.go', 'Continuar'),
        danger: true
      });
      if (!ok) return;
    }
    await withBusy(async () => {
      addLog('info', fmt(t('optimizer.audit.dns.applying', 'Aplicando DNS {name} ({p} / {s})...'), { name: dns.name, p: dns.primary, s: dns.secondary }));
      const res = await api().applyDns({ primary: dns.primary, secondary: dns.secondary, dnsName: dns.name });
      if (reportResult(res, fmt(t('optimizer.audit.dns.applied', 'DNS {name} aplicado.'), { name: dns.name }), t('optimizer.audit.dns.applyFail', 'Falha ao aplicar o DNS'))) {
        if (res.undoToken) setDnsUndoToken(res.undoToken);
        await refreshDnsState();
      }
    });
  };

  const handleUndoDns = () =>
    withBusy(async () => {
      addLog('info', t('optimizer.audit.dns.undoing', 'Restaurando o DNS anterior...'));
      const res = await api().undoDns({ undoToken: dnsUndoToken || undefined });
      if (reportResult(res, t('optimizer.audit.dns.undoOk', 'DNS restaurado.'), t('optimizer.audit.dns.undoFail', 'Falha ao restaurar o DNS'))) {
        setDnsUndoToken(null);
        await refreshDnsState();
      }
    });

  const dnsRows: any[] = dnsBenchmarkResults ?? LOCAL_DNS_PRESETS;
  const filteredPrograms = useMemo(() => {
    const q = programSearch.toLowerCase();
    return installedPrograms.filter((p) => String(p.name || '').toLowerCase().includes(q) || String(p.publisher || '').toLowerCase().includes(q));
  }, [installedPrograms, programSearch]);
  const hagsLabel =
    hagsStatus.loading ? t('optimizer.audit.hags.checking', 'Verificando...')
    : hagsStatus.state === 'on' ? t('optimizer.hags.enabled', 'Ativado (HwSchMode = 2)')
    : hagsStatus.state === 'off' ? t('optimizer.hags.disabled', 'Desativado (HwSchMode = 1)')
    : hagsStatus.state === 'default' ? t('optimizer.audit.hags.defaultState', 'Padrão do driver (sem override; pode estar ligado ou não)')
    : t('optimizer.audit.hags.unknown', 'Indisponível');
  const priorityOptions = [
    { id: 'high', label: t('optimizer.audit.proc.optHigh', 'Alta (High - recomendado p/ jogos)') },
    { id: 'abovenormal', label: t('optimizer.audit.proc.optAbove', 'Acima do Normal') },
    { id: 'normal', label: t('optimizer.audit.proc.optNormal', 'Normal (padrão)') },
    { id: 'belownormal', label: t('optimizer.audit.proc.optBelow', 'Abaixo do Normal') },
    { id: 'idle', label: t('optimizer.audit.proc.optIdle', 'Ociosa (Idle)') },
    { id: 'realtime', label: t('optimizer.audit.proc.optRt', 'Tempo Real (perigoso)') }
  ];

  const hagsButtonLabels = {
    enable: t('optimizer.hags.enableBtn', 'Ativar HAGS'),
    disable: t('optimizer.hags.disableBtn', 'Desativar HAGS'),
    revert: t('optimizer.audit.hags.revertBtn', 'Restaurar HAGS (como estava)')
  };

  const profileRisk = (r: string) => (r === 'advanced' ? 'text-rose-400' : r === 'moderate' ? 'text-amber-400' : 'text-zinc-500');

  // Visual-only derived states (no behaviour change): the bridge is missing outside Electron, and the tweak list
  // has no explicit loading flag, so "nothing loaded yet and no error" is the loading state.
  const offline = !api();
  const busy = isOptimizing || offline;
  const listLoading = !offline && !loadError && operations.length === 0 && deepTweaks.length === 0;
  const hagsDot =
    hagsStatus.state === 'on' ? 'bg-emerald-400' : hagsStatus.state === 'off' ? 'bg-rose-400' : 'bg-zinc-600';

  const sectionHead = (title: React.ReactNode, help?: React.ReactNode, actions?: React.ReactNode) => (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="dh-section-title">{title}</h2>
        {help ? <div className="dh-help mt-1 max-w-[75ch]">{help}</div> : null}
      </div>
      {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  );

  const searchField = (value: string, onChange: (v: string) => void, placeholder: string) => (
    <div className="relative">
      <Search size={14} className="text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="dh-input w-full pl-8 placeholder:text-zinc-600"
      />
    </div>
  );

  const emptyRow = (text: React.ReactNode) => <div className="px-4 py-8 text-center text-[12.5px] text-zinc-500">{text}</div>;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 text-zinc-100 pb-16">
      <DarkOSOptimizerHint onNavigate={onNavigate} />

      <PageHeader
        title={t('optimizer.title', 'System Optimizer')}
        subtitle={
          <>
            {t('optimizer.audit.subtitle', 'Ajustes de Windows com verificação: cada ação lê o estado real de volta, guarda como desfazer e informa falhas. Ganhos de desempenho são modestos e dependem do hardware.')}
            {!offline && isAdminUser !== null && (
              <span className={`ml-2 inline-flex items-center gap-1 text-[12px] align-middle ${isAdminUser ? 'text-emerald-400' : 'text-zinc-500'}`}>
                {isAdminUser ? <ShieldCheck size={13} /> : <Lock size={13} />}
                {isAdminUser ? t('optimizer.audit.adminOn', 'Admin Ativo') : t('optimizer.audit.uacOnDemand', 'UAC sob demanda')}
              </span>
            )}
          </>
        }
        actions={
          <>
            <button onClick={() => setShowConsole(!showConsole)} className={`dh-btn dh-btn-ghost ${showConsole ? 'text-zinc-100 bg-zinc-800' : ''}`}>
              <Terminal size={16} />
              {t('optimizer.terminal', 'Terminal')}
              <span className="font-mono text-[11px] text-zinc-500">{logs.length}</span>
            </button>
            <button onClick={handleCreateRestorePoint} disabled={busy} className="dh-btn">
              <History size={16} className="text-zinc-400" />
              {t('optimizer.audit.restorePointBtn', 'Criar ponto de restauração')}
            </button>
            <button onClick={handleSafeOptimization} disabled={busy} className="dh-btn dh-btn-primary">
              {isOptimizing ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
              {t('optimizer.audit.safeBtn', 'Otimização Segura')}
            </button>
          </>
        }
      />

      {/* Quick actions: one hairline-divided strip instead of six coloured tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-zinc-800/80 border border-zinc-800/80 rounded-xl overflow-hidden">
        <HeroButton onClick={handleOptimizeRAM} disabled={busy} icon={<Cpu size={16} />}
          title={t('optimizer.hero.ramTitle', 'Otimizar RAM')}
          desc={ramMsg || t('optimizer.audit.hero.ramDesc', 'Esvazia working sets (temporário)')} />
        <HeroButton onClick={handleCleanTempFiles} disabled={busy} icon={<Trash2 size={16} />}
          title={t('optimizer.hero.diskTitle', 'Limpar Disco')}
          desc={diskMsg || t('optimizer.hero.diskDesc', 'Arquivos temporários')} />
        <HeroButton onClick={handleFlushDNS} disabled={busy} icon={<Globe size={16} />}
          title={t('optimizer.hero.dnsTitle', 'Limpar DNS')}
          desc={dnsMsg || t('optimizer.audit.hero.dnsDesc', 'Limpa o cache local de DNS')} />
        <HeroButton onClick={handleSetPowerPlan} disabled={busy} icon={<Flame size={16} />}
          title={t('optimizer.audit.hero.powerTitle', 'Alto Desempenho')}
          desc={powerMsg || t('optimizer.audit.hero.powerDesc', 'Plano de energia (reversível)')} />
        <HeroButton onClick={handleOptimizeAudioLatency} disabled={busy} icon={<Headphones size={16} />}
          title={t('optimizer.audit.hero.audioTitle', 'Prioridade do Áudio')}
          desc={audioMsg || t('optimizer.audit.hero.audioDesc', 'audiodg.exe (temporário)')} />
        <HeroButton onClick={handleRevertAll} disabled={busy} icon={<RotateCcw size={16} />}
          title={t('optimizer.hero.restoreTitle', 'Restaurar Padrões')}
          desc={t('optimizer.audit.hero.restoreDesc', 'Desfaz só o que está ativo')} />
      </div>

      {/* Texture streaming notice / HAGS control */}
      <section className="dh-card p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <Info size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h2 className="dh-section-title">{t('optimizer.audit.streaming.title', 'Texturas lentas ou modelos invisíveis em jogos? Controle do HAGS')}</h2>
              <p className="dh-help mt-1 max-w-[75ch]">
                {t('optimizer.audit.streaming.desc', 'Alguns jogos (como Overwatch 2) podem carregar texturas devagar quando o cache de shaders é reconstruído ou com certas combinações de driver e HAGS. Desativar ou reativar o HAGS é a única ação aqui que age diretamente nisso; o efeito varia por placa/driver e exige reiniciar o Windows.')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 text-[12px]">
            <span className="text-zinc-500">{t('optimizer.audit.hags.statusLabel', 'Status HAGS:')}</span>
            <span className={`w-1.5 h-1.5 rounded-full ${hagsDot}`} />
            <span className="font-mono text-zinc-200">{hagsLabel}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-zinc-800/80">
          <HagsButtons variant="card" state={hagsStatus.state} disabled={busy} onToggle={handleToggleHags} onRevert={handleRevertHags} labels={hagsButtonLabels} />
          <div className="flex items-center gap-3">
            <span className="text-[11.5px] text-zinc-500 hidden lg:inline">{t('optimizer.hags.restartNote', 'Necessário reiniciar o Windows após alterar o HAGS.')}</span>
            <button onClick={handleRestoreStreamingDefaults} disabled={busy} className="dh-btn dh-btn-sm">
              {t('optimizer.audit.streaming.revertBtn', 'Restaurar Kernel & HAGS')}
            </button>
          </div>
        </div>
        <p className="text-[11.5px] text-zinc-500 lg:hidden">{t('optimizer.hags.restartNote', 'Necessário reiniciar o Windows após alterar o HAGS.')}</p>
      </section>

      {/* Navigation tabs: underline control */}
      <nav className="flex items-center overflow-x-auto [scrollbar-width:none] border-b border-zinc-800/80" role="tablist">
        <button role="tab" aria-selected={activeTab === 'tweaks'} onClick={() => setActiveTab('tweaks')} className={tabBtn(activeTab === 'tweaks')}>
          {t('optimizer.tabTweaks', 'Ajustes & Customizações')}
          <span className="font-mono text-[11px] text-zinc-500">{allTweaksList.length}</span>
        </button>
        <button role="tab" aria-selected={activeTab === 'uninstaller'} onClick={() => { setActiveTab('uninstaller'); loadPrograms(); }} className={tabBtn(activeTab === 'uninstaller')}>
          {t('optimizer.tabUninstaller', 'Desinstalador & Limpeza de Resíduos')}
        </button>
        <button role="tab" aria-selected={activeTab === 'gpu'} onClick={() => { setActiveTab('gpu'); loadGpuData(); }} className={tabBtn(activeTab === 'gpu')}>
          {t('optimizer.tabGpu', 'Prioridade de GPU & Jogos')}
        </button>
        <button role="tab" aria-selected={activeTab === 'priority'} onClick={() => { setActiveTab('priority'); loadProcesses(); }} className={tabBtn(activeTab === 'priority')}>
          {t('optimizer.tabPriority', 'Prioridade de Processos')}
        </button>
        <button role="tab" aria-selected={activeTab === 'network'} onClick={() => { setActiveTab('network'); refreshDnsState(); }} className={tabBtn(activeTab === 'network')}>
          {t('optimizer.tabNetwork', 'Rede Avançada & DNS')}
        </button>
        <button role="tab" aria-selected={activeTab === 'defender'} onClick={() => { setActiveTab('defender'); loadDefenderStatus(); }} className={tabBtn(activeTab === 'defender')}>
          {t('optimizer.audit.tabDefender', 'Microsoft Defender')}
        </button>
        <button role="tab" aria-selected={activeTab === 'debloat'} onClick={() => { setActiveTab('debloat'); loadBloatware(); }} className={tabBtn(activeTab === 'debloat')}>
          {t('optimizer.audit.tabDebloat', 'Debloat de Apps UWP')}
        </button>
        <button role="tab" aria-selected={activeTab === 'startup'} onClick={() => { setActiveTab('startup'); loadStartupItems(); }} className={tabBtn(activeTab === 'startup')}>
          {t('optimizer.audit.tabStartup', 'Inicialização')}
        </button>
        <button role="tab" aria-selected={activeTab === 'windows'} onClick={() => setActiveTab('windows')} className={tabBtn(activeTab === 'windows')}>
          {t('optimizer.tabWindows', 'Recursos & Reparos do Windows')}
        </button>
      </nav>

      {/* Backend bridge missing (renderer opened outside Electron or preload failed) */}
      {offline && (
        <div className="dh-card px-6 py-12 flex flex-col items-center text-center gap-3">
          <Terminal size={20} className="text-zinc-500" />
          <div>
            <h2 className="dh-section-title">{t('optimizer.audit.offline.title', 'Serviço do otimizador indisponível')}</h2>
            <p className="dh-help mt-1 max-w-[60ch]">
              {t('optimizer.audit.offline.desc', 'O DarkHub não conseguiu falar com o processo principal, então nenhum ajuste pode ser lido ou aplicado. Abra o aplicativo pelo atalho do DarkHub (não pelo navegador) ou reinicie-o.')}
            </p>
          </div>
        </div>
      )}

      {/* TAB 1: ALL TWEAKS & CUSTOMIZATIONS */}
      {!offline && activeTab === 'tweaks' && (
        <div className="space-y-5">
          {/* Profiles */}
          {profiles.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="dh-section-title">{t('optimizer.audit.profiles.title', 'Perfis (conjuntos prontos)')}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-zinc-800/80 border border-zinc-800/80 rounded-xl overflow-hidden">
                {profiles.map((p) => (
                  <div key={p.id} className="bg-zinc-950 p-3.5 flex flex-col gap-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[13px] font-medium text-zinc-100">{t(`optimizer.audit.profile.${p.id}.name`, p.name)}</span>
                      <span className={`text-[11px] lowercase ${profileRisk(p.risk)}`}>{riskBadge((p.risk as RiskLevel) || 'safe').label}</span>
                    </div>
                    <p className="text-[12px] text-zinc-500 leading-snug flex-1">{t(`optimizer.audit.profile.${p.id}.desc`, p.description)}</p>
                    <button onClick={() => handleApplyProfile(p)} disabled={isOptimizing} className="dh-btn dh-btn-sm self-start">
                      {fmt(t('optimizer.audit.profile.applyBtn', 'Aplicar perfil ({n})'), { n: (p.tweakIds || []).length })}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Search & categories */}
          <div className="space-y-2.5">
            {searchField(searchQuery, setSearchQuery, t('optimizer.audit.searchPlaceholder', 'Pesquisar ajuste (ex.: Menu Clássico, RAM, Temp, Barra de Tarefas, MMCSS, Telemetria)...'))}
            <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none]">
              {categories.map((c) => (
                <button key={c.id} onClick={() => setCategoryFilter(c.id)} className={segBtn(categoryFilter === c.id)}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {statusError && (
            <div className="flex items-center justify-between gap-3 text-[12.5px] text-amber-300">
              <span className="flex items-center gap-2">
                <AlertTriangle size={14} className="shrink-0" />
                {t('optimizer.audit.statusCheckError', 'Não foi possível verificar o estado dos ajustes no Windows.')}
              </span>
              <button onClick={refreshStatus} disabled={isCheckingStatus} className="dh-btn dh-btn-sm">
                {isCheckingStatus ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {t('optimizer.audit.retry', 'Tentar de novo')}
              </button>
            </div>
          )}

          {/* Tweak list */}
          <section className="dh-card overflow-hidden">
            {/* Batch action bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-2.5 border-b border-zinc-800/80">
              <div className="flex items-center gap-1 flex-wrap">
                <button onClick={() => setSelectedTweakIds(new Set(filteredTweaks.map((i) => i.id)))} className="dh-btn dh-btn-ghost dh-btn-sm">
                  {fmt(t('optimizer.audit.selectAll', 'Marcar Todos ({n})'), { n: filteredTweaks.length })}
                </button>
                <button onClick={() => setSelectedTweakIds(new Set())} className="dh-btn dh-btn-ghost dh-btn-sm">
                  {t('optimizer.audit.deselect', 'Desmarcar')}
                </button>
                <span className="text-[11.5px] text-zinc-500 font-mono ml-2">
                  {fmt(t('optimizer.audit.selectedCount', '{n} selecionado(s)'), { n: selectedTweakIds.size })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => handleRunBatch('revert')} disabled={isOptimizing || selectedTweakIds.size === 0} className="dh-btn dh-btn-sm">
                  <Undo2 size={14} className="text-zinc-400" />
                  {t('optimizer.audit.revertSelected', 'Reverter Ativos Selecionados')}
                </button>
                <button onClick={() => handleRunBatch('apply')} disabled={isOptimizing || selectedTweakIds.size === 0} className="dh-btn dh-btn-accent dh-btn-sm">
                  {isOptimizing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  {fmt(t('optimizer.audit.applySelected', 'Aplicar Selecionados ({n})'), { n: selectedTweakIds.size })}
                </button>
              </div>
            </div>

            {loadError && operations.length === 0 && deepTweaks.length === 0 ? (
              <div className="px-6 py-10 flex flex-col items-center text-center gap-3">
                <p className="text-[12.5px] text-red-400">{t('optimizer.audit.loadFail', 'Erro ao carregar a lista de ajustes.')}</p>
                <button onClick={loadInitialData} className="dh-btn dh-btn-sm">
                  <RefreshCw size={14} />
                  {t('optimizer.audit.retry', 'Tentar de novo')}
                </button>
              </div>
            ) : listLoading ? (
              <SkeletonRows rows={6} />
            ) : filteredTweaks.length === 0 ? (
              emptyRow(t('optimizer.audit.noMatch', 'Nenhum ajuste corresponde à busca ou à categoria escolhida.'))
            ) : (
              <div className="divide-y divide-zinc-800/80">
                {filteredTweaks.map((tweak) => {
                  const isSelected = selectedTweakIds.has(tweak.id);
                  const isRunningThis = optimizingId === tweak.id;
                  const rb = riskBadge(tweak.risk);
                  const canRevert = tweak.kind === 'deep' || Boolean(tweak.revertId);
                  const showApply = tweak.kind === 'op' ? tweak.applied !== true : tweak.applied !== true;
                  const showRevert = canRevert && (tweak.kind === 'deep' ? tweak.applied === true : tweak.applied !== false);
                  return (
                    <div
                      key={tweak.id}
                      onClick={() => {
                        setSelectedTweakIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(tweak.id)) next.delete(tweak.id);
                          else next.add(tweak.id);
                          return next;
                        });
                      }}
                      className={`px-4 py-3 flex items-start justify-between gap-4 cursor-pointer select-none transition-colors duration-150 ease-out ${
                        isSelected ? 'bg-blue-500/[0.06] shadow-[inset_2px_0_0_var(--color-blue-400)]' : 'hover:bg-zinc-900/50'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <input type="checkbox" checked={isSelected} onChange={() => {}} className="mt-0.5 cursor-pointer" />
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-zinc-100">{tweak.title}</div>
                          <div className="mt-0.5 flex items-center gap-x-2.5 gap-y-0.5 flex-wrap text-[11px]">
                            {tweak.applied === true && (
                              <span className="inline-flex items-center gap-1.5 text-emerald-400 lowercase">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                {t('optimizer.audit.badge.active', '✓ ATIVO (verificado)').replace(/^✓\s*/, '')}
                              </span>
                            )}
                            {tweak.applied === false && tweak.partial && (
                              <span className="text-amber-400 lowercase">{t('optimizer.audit.badge.partial', 'PARCIAL')}</span>
                            )}
                            {tweak.applied === false && !tweak.partial && (
                              <span className="text-zinc-500 lowercase">{t('optimizer.audit.badge.default', 'PADRÃO')}</span>
                            )}
                            {tweak.applied === null && isCheckingStatus && canRevert && (
                              <span className="inline-flex items-center gap-1 text-zinc-500 lowercase">
                                <Loader2 size={11} className="animate-spin" />
                                {t('optimizer.audit.badge.checking', 'verificando...')}
                              </span>
                            )}
                            {tweak.applied === null && !isCheckingStatus && canRevert && (
                              <span className="text-zinc-500 lowercase">{t('optimizer.audit.badge.unknown', 'NÃO VERIFICADO')}</span>
                            )}
                            {tweak.applied === null && !tweak.revertId && tweak.kind === 'op' && (
                              <span className="text-zinc-500 lowercase">{t('optimizer.audit.badge.action', 'AÇÃO PONTUAL')}</span>
                            )}
                            <span className={`lowercase ${rb.cls}`}>{rb.label}</span>
                            {tweak.securityRelated && (
                              <span className="text-rose-400 lowercase">{t('optimizer.audit.badge.security', 'SEGURANÇA')}</span>
                            )}
                            <span className="dh-tag">{tweak.category}</span>
                            {tweak.requiresReboot && <span className="dh-tag lowercase">{t('optimizer.audit.badge.reboot', 'REINICIAR')}</span>}
                            {tweak.requiresAdmin && <span className="dh-tag lowercase">{t('optimizer.audit.badge.admin', 'ADMIN')}</span>}
                          </div>
                          <p className="text-[12px] text-zinc-400 mt-1.5 leading-snug max-w-[75ch]">{tweak.description}</p>
                          {tweak.warning && (
                            <p className="text-[12px] text-amber-300/90 mt-1 leading-snug flex items-start gap-1.5 max-w-[75ch]">
                              <AlertTriangle size={13} className="shrink-0 mt-px" />
                              <span>{tweak.warning}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {showRevert && (
                          <button onClick={(e) => { e.stopPropagation(); handleRevertItem(tweak); }} disabled={isOptimizing} className="dh-btn dh-btn-ghost dh-btn-sm">
                            {isRunningThis && !showApply ? <Loader2 size={14} className="animate-spin" /> : t('optimizer.audit.revert', 'Reverter')}
                          </button>
                        )}
                        {showApply && (
                          <button onClick={(e) => { e.stopPropagation(); handleApplyItem(tweak); }} disabled={isOptimizing} className="dh-btn dh-btn-sm min-w-[72px]">
                            {isRunningThis ? <Loader2 size={14} className="animate-spin" /> : tweak.kind === 'deep' || tweak.revertId ? t('optimizer.audit.activate', 'Ativar') : t('optimizer.audit.run', 'Executar')}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 2: PROGRAM UNINSTALLER & LEFTOVER CLEANER */}
      {!offline && activeTab === 'uninstaller' && (
        <section className="dh-card p-5 space-y-4">
          {sectionHead(
            t('optimizer.uninstaller.title', 'Desinstalador de Programas com Varredura de Resíduos'),
            t('optimizer.audit.prog.desc', 'Executa o desinstalador oficial do programa; só depois de confirmar no Registro que ele foi removido, apaga pastas e chaves de resíduo com o nome dele. A limpeza pode apagar configurações salvas em AppData.'),
            <button onClick={loadPrograms} disabled={loadingPrograms} className="dh-btn dh-btn-sm">
              <RefreshCw size={14} className={`text-zinc-400 ${loadingPrograms ? 'animate-spin' : ''}`} /> {t('optimizer.uninstaller.refresh', 'Atualizar Lista')}
            </button>
          )}

          {searchField(programSearch, setProgramSearch, t('optimizer.uninstaller.search', 'Buscar programa instalado por nome ou desenvolvedor...'))}

          <div className="border border-zinc-800/80 rounded-lg overflow-hidden">
            {loadingPrograms ? (
              <div>
                <div className="sr-only">{t('optimizer.audit.prog.loading', 'Lendo programas instalados...')}</div>
                <SkeletonRows rows={6} />
              </div>
            ) : (
              <div className="max-h-[460px] overflow-y-auto divide-y divide-zinc-800/80">
                {filteredPrograms.map((prog) => {
                  const isDeleting = uninstallingProgram === prog.name;
                  return (
                    <div key={prog.keyPath || prog.uninstallString || prog.name} className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-zinc-900/50 transition-colors duration-150">
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-zinc-100 truncate">{prog.name}</div>
                        <div className="text-[11px] text-zinc-500 font-mono flex items-center gap-1.5 mt-0.5 min-w-0">
                          {prog.version && <span>v{prog.version}</span>}
                          {prog.publisher && <span className="truncate"><span className="text-zinc-700">· </span>{prog.publisher}</span>}
                          {prog.installDate && <span className="shrink-0"><span className="text-zinc-700">· </span>{t('optimizer.audit.prog.installed', 'Instalado')}: {prog.installDate}</span>}
                        </div>
                      </div>
                      <button onClick={() => handleUninstallProgram(prog)} disabled={isOptimizing} className="dh-btn dh-btn-danger dh-btn-sm flex-shrink-0">
                        {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        {isDeleting ? t('optimizer.uninstaller.uninstalling', 'Desinstalando...') : t('optimizer.uninstaller.btn', 'Desinstalar & Limpar Sobras')}
                      </button>
                    </div>
                  );
                })}
                {filteredPrograms.length === 0 && emptyRow(t('optimizer.uninstaller.empty', 'Nenhum programa instalado encontrado com os filtros atuais.'))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* TAB 3: GPU GAME PRIORITY */}
      {!offline && activeTab === 'gpu' && (
        <div className="space-y-4">
          <section className="dh-card p-5 space-y-4">
            {sectionHead(
              t('optimizer.hags.title', 'Agendamento de GPU Acelerado por Hardware (HAGS)'),
              t('optimizer.audit.hags.desc', 'O HAGS deixa a GPU agendar o próprio trabalho. Em placas e drivers recentes pode reduzir a carga da CPU e é exigido por alguns recursos (como Frame Generation do DLSS 3); em outros casos pode causar problemas de textura. Não existe uma escolha melhor para todos: teste e use o botão de restaurar se piorar.'),
              <span className="flex items-center gap-2 text-[12px]">
                <span className="text-zinc-500">{t('optimizer.audit.hags.statusShort', 'Status:')}</span>
                <span className={`w-1.5 h-1.5 rounded-full ${hagsDot}`} />
                <span className="font-mono text-zinc-200">{hagsLabel}</span>
              </span>
            )}
            {hagsStatus.error && <div className="text-[12px] text-red-400 font-mono">{hagsStatus.error}</div>}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-800/80">
              <HagsButtons variant="tab" state={hagsStatus.state} disabled={isOptimizing} onToggle={handleToggleHags} onRevert={handleRevertHags} labels={hagsButtonLabels} />
              <span className="text-[11.5px] text-zinc-500">{t('optimizer.hags.restartNote', 'Necessário reiniciar o Windows após alterar o HAGS.')}</span>
            </div>
          </section>

          <section className="dh-card p-5 space-y-4">
            {sectionHead(
              t('optimizer.audit.gpu.title', 'Preferência de GPU por aplicativo (Configurações Gráficas do Windows)'),
              t('optimizer.audit.gpu.desc', 'Define qual GPU o Windows usa para cada executável. Só faz diferença em computadores com mais de uma GPU (por exemplo, notebook com GPU integrada e dedicada). Reinicie o jogo para valer.')
            )}
            {gpuInfo && gpuInfo.multiGpu === false && (
              <p className="text-[12px] text-amber-300 flex items-start gap-1.5 max-w-[75ch]">
                <AlertTriangle size={13} className="shrink-0 mt-px" />
                <span>
                  {fmt(t('optimizer.audit.gpu.single', 'Foi detectada apenas uma GPU ({name}). Esta preferência provavelmente não terá efeito prático neste computador.'), { name: gpuInfo.controllers?.[0]?.model || '?' })}
                </span>
              </p>
            )}
            {gpuInfo?.multiGpu && (
              <div className="text-[11.5px] text-zinc-500 font-mono">
                {(gpuInfo.controllers || []).map((c: any) => `${c.model}${c.isDedicated ? ' (dedicada)' : ''}`).join(' · ')}
              </div>
            )}

            <div className="space-y-3 pt-1">
              <div className="space-y-1.5">
                <label className="dh-label block">{t('optimizer.audit.gpu.pathLabel', 'Caminho do jogo (.exe):')}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={selectedGpuAppPath}
                    onChange={(e) => setSelectedGpuAppPath(e.target.value)}
                    placeholder="C:\Games\Cyberpunk2077\bin\x64\Cyberpunk2077.exe"
                    className="dh-input flex-1 min-w-0 font-mono placeholder:text-zinc-600"
                  />
                  <button onClick={handleBrowseGpuApp} className="dh-btn">
                    <FolderOpen size={16} className="text-zinc-400" /> {t('optimizer.audit.gpu.browse', 'Procurar .exe')}
                  </button>
                </div>
              </div>

              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="dh-label">{t('optimizer.audit.gpu.mode', 'Modo gráfico:')}</span>
                  <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-zinc-800/80 bg-zinc-950">
                    {[
                      { id: 'high_performance', label: t('optimizer.audit.gpu.high', 'Alto desempenho (GPU dedicada)') },
                      { id: 'power_saving', label: t('optimizer.audit.gpu.saving', 'Economia de energia (GPU integrada)') },
                      { id: 'default', label: t('optimizer.audit.gpu.default', 'Deixar o Windows decidir') }
                    ].map((p) => (
                      <button key={p.id} onClick={() => setSelectedGpuPref(p.id as any)} className={segBtn(selectedGpuPref === p.id)}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={handleSetGpuPreference} disabled={isOptimizing || !selectedGpuAppPath.trim()} className="dh-btn dh-btn-accent">
                  {t('optimizer.audit.gpu.applyBtn', 'Aplicar Preferência')}
                </button>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <h3 className="dh-label">{t('optimizer.audit.gpu.listTitle', 'Aplicativos configurados:')}</h3>
              <div className="border border-zinc-800/80 rounded-lg overflow-hidden">
                {gpuPreferences.length === 0 ? (
                  emptyRow(t('optimizer.audit.gpu.empty', 'Nenhum aplicativo configurado no momento.'))
                ) : (
                  <div className="divide-y divide-zinc-800/80">
                    {gpuPreferences.map((p) => (
                      <div key={p.appPath} className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-zinc-900/50 transition-colors duration-150">
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-zinc-100 truncate">{p.appName || p.appPath}</div>
                          <div className="text-[11px] text-zinc-500 font-mono truncate">{p.appPath}</div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0 text-[12px]">
                          {p.exists === false && <span className="text-amber-400">{t('optimizer.audit.gpu.missing', 'arquivo não existe mais')}</span>}
                          <span className="text-zinc-300">
                            {p.preference === 'high_performance' ? t('optimizer.audit.gpu.badgeHigh', 'GPU dedicada') : p.preference === 'power_saving' ? t('optimizer.audit.gpu.badgeSaving', 'Economia') : t('optimizer.audit.gpu.badgeDefault', 'Padrão')}
                          </span>
                          <button
                            onClick={() => handleRemoveGpuPreference(p.appPath)}
                            disabled={isOptimizing}
                            className="dh-btn dh-btn-ghost dh-btn-sm px-2 hover:text-red-400"
                            title={t('optimizer.audit.gpu.remove', 'Remover preferência')}
                            aria-label={t('optimizer.audit.gpu.remove', 'Remover preferência')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* TAB 4: PROCESS PRIORITY */}
      {!offline && activeTab === 'priority' && (
        <section className="dh-card p-5 space-y-4">
          {sectionHead(
            t('optimizer.audit.proc.title', 'Prioridade de Processos'),
            t('optimizer.audit.proc.desc', 'Muda a classe de prioridade do processo em execução. NÃO é permanente: vale até o processo fechar. Processos críticos do Windows ficam bloqueados.'),
            <button onClick={loadProcesses} disabled={isRefreshingProcesses} className="dh-btn dh-btn-sm">
              <RefreshCw size={14} className={`text-zinc-400 ${isRefreshingProcesses ? 'animate-spin' : ''}`} /> {t('optimizer.audit.refresh', 'Atualizar')}
            </button>
          )}

          {selectedProcess && (
            <div className="px-3 py-2.5 rounded-lg border border-blue-400/30 bg-blue-500/[0.05] flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn">
              <div className="text-[12.5px] text-zinc-300">
                {t('optimizer.audit.proc.selected', 'Processo selecionado:')} <span className="font-mono text-blue-300">PID {selectedProcess}</span>
              </div>
              <div className="flex items-center gap-2">
                <select value={selectedPriority} onChange={(e) => setSelectedPriority(e.target.value)} className="dh-input h-7 text-[12px]">
                  {priorityOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                <button
                  onClick={() => handleSetProcessPriority(selectedProcess, selectedPriority)}
                  disabled={isOptimizing || Boolean(processList.find((p) => p.pid === selectedProcess)?.critical)}
                  className="dh-btn dh-btn-accent dh-btn-sm"
                >
                  {t('optimizer.audit.proc.applyBtn', 'Aplicar Prioridade')}
                </button>
              </div>
            </div>
          )}

          {searchField(processSearch, setProcessSearch, t('optimizer.audit.proc.search', 'Buscar processo pelo nome...'))}

          <div className="border border-zinc-800/80 rounded-lg overflow-hidden">
            {isRefreshingProcesses && processList.length === 0 ? (
              <SkeletonRows rows={6} />
            ) : processList.length === 0 ? (
              emptyRow(t('optimizer.audit.proc.empty', 'Nenhum processo listado. Use Atualizar para ler os processos em execução.'))
            ) : (
              <div className="max-h-96 overflow-y-auto divide-y divide-zinc-800/80">
                {processList
                  .filter((p) => String(p.name || '').toLowerCase().includes(processSearch.toLowerCase()))
                  .map((proc) => (
                    <div
                      key={proc.pid}
                      onClick={() => setSelectedProcess(proc.pid)}
                      className={`px-4 py-2 flex items-center justify-between gap-3 cursor-pointer select-none transition-colors duration-150 ${
                        selectedProcess === proc.pid ? 'bg-blue-500/[0.06] shadow-[inset_2px_0_0_var(--color-blue-400)]' : 'hover:bg-zinc-900/50'
                      }`}
                    >
                      <div className="flex items-baseline gap-3 min-w-0">
                        <span className="text-[12.5px] text-zinc-100 font-mono truncate">{proc.name}</span>
                        <span className="text-[11px] text-zinc-500 font-mono shrink-0">{proc.pid}</span>
                        {proc.critical && <span className="dh-tag lowercase">{t('optimizer.audit.proc.criticalBadge', 'CRÍTICO')}</span>}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[12px] text-zinc-300 font-mono tabular-nums">
                          {Math.round(proc.mem / 1024)}<span className="text-zinc-500"> MB</span>
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProcess(proc.pid);
                            handleSetProcessPriority(proc.pid, 'high');
                          }}
                          disabled={isOptimizing || Boolean(proc.critical)}
                          className="dh-btn dh-btn-ghost dh-btn-sm"
                        >
                          {t('optimizer.audit.proc.setHigh', 'Definir Alta')}
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* TAB 5: ADVANCED NETWORK & DNS */}
      {!offline && activeTab === 'network' && (
        <div className="space-y-4">
          <section className="dh-card p-5 space-y-4">
            {sectionHead(
              t('optimizer.audit.net.title', 'Ajustes de latência TCP por adaptador'),
              <>
                {t('optimizer.audit.net.desc', 'Configura TcpAckFrequency e TCPNoDelay nas interfaces ativas (reduz atraso em jogos online sensíveis), desliga o Energy-Efficient Ethernet e remove o limite reservado do QoS (efeito praticamente nulo no Windows moderno). NÃO aumenta a velocidade da internet.')}
                <span className="mt-2 flex items-center gap-2">
                  <span className="text-zinc-500">{t('optimizer.audit.net.state', 'Estado verificado:')}</span>
                  <StatusPill
                    ok={advNetApplied}
                    label={advNetApplied === true ? t('optimizer.audit.net.stateOn', 'Aplicado') : advNetApplied === false ? (advNetPartial ? t('optimizer.audit.badge.partial', 'PARCIAL') : t('optimizer.audit.net.stateOff', 'Padrão do Windows')) : t('optimizer.audit.net.stateUnknown', 'Desconhecido')}
                  />
                </span>
              </>,
              <>
                <button onClick={handleRevertAdvancedNetwork} disabled={isOptimizing} className="dh-btn">
                  {t('optimizer.audit.net.restoreBtn', 'Restaurar Padrão')}
                </button>
                <button onClick={handleApplyAdvancedNetwork} disabled={isOptimizing} className="dh-btn dh-btn-accent">
                  {t('optimizer.audit.net.applyBtn', 'Aplicar Ajustes TCP')}
                </button>
              </>
            )}

            <dl className="grid grid-cols-1 sm:grid-cols-3 border border-zinc-800/80 rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-zinc-800/80">
              <div className="px-4 py-3">
                <dt className="text-[11.5px] text-zinc-500">{t('optimizer.audit.net.box1', 'Por adaptador ativo')}</dt>
                <dd className="text-[12px] text-zinc-200 font-mono mt-1">TcpAckFrequency=1 / TCPNoDelay=1</dd>
              </div>
              <div className="px-4 py-3">
                <dt className="text-[11.5px] text-zinc-500">{t('optimizer.audit.net.box2', 'QoS (política Psched)')}</dt>
                <dd className="text-[12px] text-zinc-200 font-mono mt-1">NonBestEffortLimit = 0</dd>
              </div>
              <div className="px-4 py-3">
                <dt className="text-[11.5px] text-zinc-500">{t('optimizer.audit.net.box3', 'Placa de rede')}</dt>
                <dd className="text-[12px] text-zinc-200 mt-1">{t('optimizer.audit.net.box3v', 'Energy-Efficient Ethernet desligado (se suportado)')}</dd>
              </div>
            </dl>
          </section>

          <section className="dh-card p-5 space-y-4">
            {sectionHead(
              t('optimizer.audit.dns.title', 'DNS: medir e trocar servidor'),
              <span className="font-mono text-[11.5px]">
                {t('optimizer.audit.dns.adapter', 'Adaptador:')} <span className="text-zinc-300">{dnsState?.adapter || t('optimizer.audit.dns.detecting', 'Detectando...')}</span>
                <span className="text-zinc-700"> · </span>{t('optimizer.audit.dns.current', 'DNS atual:')} <span className="text-zinc-300">{dnsState?.servers?.length ? dnsState.servers.join(', ') : t('optimizer.audit.dns.dhcp', 'automático (DHCP)')}</span>
              </span>,
              <>
                <button onClick={handleUndoDns} disabled={isOptimizing} className="dh-btn">
                  {t('optimizer.audit.dns.restoreBtn', 'Restaurar DNS')}
                </button>
                <button onClick={handleRunDnsBenchmark} disabled={dnsBenchmarkRunning || isOptimizing} className="dh-btn dh-btn-accent">
                  {dnsBenchmarkRunning ? <Loader2 size={16} className="animate-spin" /> : <Target size={16} />}
                  {t('optimizer.audit.dns.benchBtn', 'Medir Latência Real de DNS')}
                </button>
              </>
            )}

            <p className="dh-help">
              {dnsBenchmarkResults === null
                ? t('optimizer.audit.dns.preMeasure', 'Nenhuma latência é exibida até você medir. A lista abaixo traz provedores conhecidos.')
                : fmt(t('optimizer.audit.dns.measured', 'Latência medida agora (mediana de respostas DNS válidas). {f} servidor(es) testado(s) não responderam e foram omitidos.'), { f: dnsBenchmarkFailed })}
            </p>

            <div className="border border-zinc-800/80 rounded-lg overflow-hidden divide-y divide-zinc-800/80">
              {dnsBenchmarkRunning && dnsBenchmarkResults === null ? (
                <SkeletonRows rows={5} />
              ) : (
                <>
                  {dnsRows.length === 0 && emptyRow(t('optimizer.audit.dns.noneAnswered', 'Nenhum servidor respondeu ao teste. Verifique sua conexão ou firewall.'))}
                  {dnsRows.map((dns) => (
                    <div key={`${dns.name}|${dns.primary}`} className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-zinc-900/50 transition-colors duration-150">
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-zinc-100 flex items-baseline gap-2">
                          {dns.name}
                          {!isTrustedDns(dns) && <span className="text-[11px] font-normal text-amber-400">{t('optimizer.audit.dns.unverified', 'não verificado')}</span>}
                        </div>
                        <div className="text-[11px] text-zinc-500 font-mono">{dns.primary} / {dns.secondary}</div>
                      </div>
                      <div className="flex items-center gap-4">
                        {dns.latencyMs ? (
                          <span className="text-[13px] font-mono tabular-nums text-zinc-100 w-16 text-right">
                            {dns.latencyMs}<span className="text-zinc-500 text-[11px]"> ms</span>
                          </span>
                        ) : (
                          <span className="text-[11.5px] text-zinc-600">{t('optimizer.audit.dns.notMeasured', 'não medido')}</span>
                        )}
                        <button onClick={() => handleApplyDns(dns)} disabled={isOptimizing} className="dh-btn dh-btn-sm">
                          {t('optimizer.audit.apply', 'Aplicar')}
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </section>
        </div>
      )}

      {/* TAB 6: MICROSOFT DEFENDER */}
      {!offline && activeTab === 'defender' && (
        <section className="dh-card p-5 space-y-4">
          {sectionHead(
            t('optimizer.audit.defender.title', 'Microsoft Defender: proteção em tempo real'),
            t('optimizer.audit.defender.desc', 'Liga ou desliga a proteção em tempo real usando só os mecanismos oficiais (Set-MpPreference e política). Se a Proteção contra Adulteração estiver ativa, o Windows ignora a alteração: o DarkHub não a contorna e mostra como desativá-la manualmente. Após a ação, o estado é conferido com o próprio Defender. Desativar deixa o PC sem antivírus; não afeta SmartScreen nem o Firewall.'),
            <button onClick={loadDefenderStatus} disabled={defenderLoading} className="dh-btn dh-btn-sm">
              <RefreshCw size={14} className={`text-zinc-400 ${defenderLoading ? 'animate-spin' : ''}`} />
              {t('optimizer.audit.refresh', 'Atualizar')}
            </button>
          )}

          {defenderLoading && !defenderStatus ? (
            <div className="flex flex-wrap gap-4" aria-hidden="true">
              {[140, 220, 180, 130].map((w) => <div key={w} className="h-3.5 rounded bg-zinc-900 animate-pulse" style={{ width: w }} />)}
            </div>
          ) : defenderStatus ? (
            <div className="flex items-center gap-x-5 gap-y-2 flex-wrap">
              <StatusPill ok={Boolean(defenderStatus.realtimeEnabled)} label={defenderStatus.realtimeEnabled ? t('optimizer.audit.defender.rtOn', 'Tempo real: ATIVO') : t('optimizer.audit.defender.rtOff', 'Tempo real: DESATIVADO')} />
              <StatusPill ok={!defenderStatus.tamperProtected ? null : true} label={defenderStatus.tamperProtected ? t('optimizer.audit.defender.tamperOn', 'Proteção contra Adulteração: LIGADA') : t('optimizer.audit.defender.tamperOff', 'Proteção contra Adulteração: desligada')} />
              <StatusPill
                ok={defenderStatus.policyDisableRealtime === 1 ? false : null}
                label={defenderStatus.policyDisableRealtime === 1 ? t('optimizer.audit.defender.policyOn', 'Política de desativação presente') : t('optimizer.audit.defender.policyOff', 'Sem política de desativação')}
              />
              <StatusPill ok={Boolean(defenderStatus.serviceRunning)} label={`WinDefend: ${defenderStatus.serviceStatus || '?'}`} />
              {defenderStatus.imageLevelRemoved && (
                <StatusPill ok={false} label={t('optimizer.audit.defender.imageRemoved', 'Removido na imagem DarkOS')} />
              )}
            </div>
          ) : null}

          {defenderStatus?.imageLevelRemoved && (
            <div className="px-3.5 py-3 rounded-lg border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="flex items-start gap-2 text-[12px] text-zinc-300 max-w-[75ch]">
                <Info size={14} className="text-blue-300 shrink-0 mt-px" />
                {t('optimizer.audit.defender.imageRemovedHelp', 'O Microsoft Defender foi removido nesta imagem DarkOS para liberar CPU em jogos. Para reativá-lo, reative os serviços e reinicie o PC. O botão de proteção em tempo real acima não funciona enquanto os serviços estiverem desativados.')}
              </span>
              <button onClick={handleRestoreImageDefender} disabled={isOptimizing} className="dh-btn dh-btn-sm shrink-0">
                {t('optimizer.audit.defender.restoreImageBtn', 'Reativar e exigir reinício')}
              </button>
            </div>
          )}

          {(defenderTamperBlocked || defenderStatus?.tamperProtected) && (
            <div className="px-3.5 py-3 rounded-lg border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="flex items-start gap-2 text-[12px] text-amber-200/90 max-w-[75ch]">
                <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-px" />
                {t('optimizer.audit.defender.tamperHelp', 'A Proteção contra Adulteração está ligada, então o Windows ignoraria o pedido. Desligue-a em Segurança do Windows > Proteção contra vírus e ameaças > Gerenciar configurações > Proteção contra Adulteração e tente de novo.')}
              </span>
              <button onClick={handleOpenTamper} className="dh-btn dh-btn-sm shrink-0">
                {t('optimizer.audit.defender.openSecurity', 'Abrir Segurança do Windows')}
              </button>
            </div>
          )}

          <div className="pt-4 border-t border-zinc-800/80 flex items-center justify-between gap-3">
            <div>
              <div className="text-[13px] font-medium text-zinc-100">{t('optimizer.audit.defender.rtTitle', 'Proteção em tempo real')}</div>
              <div className="text-[12px] text-zinc-500">{t('optimizer.audit.defender.rtSub', 'Varredura de arquivos em segundo plano')}</div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => handleApplyDefender('disable')} disabled={isOptimizing} className="dh-btn dh-btn-danger dh-btn-sm">
                {t('optimizer.audit.defender.disableBtn', 'Desativar')}
              </button>
              <button onClick={() => handleApplyDefender('enable')} disabled={isOptimizing} className="dh-btn dh-btn-sm">
                {t('optimizer.audit.defender.enableBtn', 'Reativar')}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* TAB 7: DEBLOAT APPS */}
      {!offline && activeTab === 'debloat' && (
        <section className="dh-card p-5 space-y-4">
          {sectionHead(
            t('optimizer.audit.debloat.title', 'Debloat de aplicativos do Windows (UWP/AppX)'),
            t('optimizer.audit.debloat.desc', 'Remove pacotes pré-instalados do seu usuário. Apenas itens da lista abaixo, por nome exato, e somente os que estão instalados. Remover não costuma liberar RAM relevante; serve para limpar o menu e o disco. Pode ser reinstalado pela Microsoft Store.'),
            <button onClick={handleRemoveBloatware} disabled={isOptimizing || selectedBloatware.size === 0} className="dh-btn dh-btn-danger">
              <Trash2 size={16} />
              {fmt(t('optimizer.audit.debloat.removeBtn', 'Remover Selecionados ({n})'), { n: selectedBloatware.size })}
            </button>
          )}

          <div className="border border-zinc-800/80 rounded-lg overflow-hidden">
            {loadingBloatware ? (
              <div>
                <div className="sr-only">{t('optimizer.audit.debloat.loading', 'Carregando pacotes instalados...')}</div>
                <SkeletonRows rows={6} />
              </div>
            ) : bloatwareList.length === 0 ? (
              emptyRow(t('optimizer.audit.debloat.empty', 'Nenhum pacote da lista foi encontrado.'))
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-zinc-800/80">
                {bloatwareList.map((app) => {
                  const installed = app.installed !== false;
                  const isChecked = selectedBloatware.has(app.id);
                  return (
                    <div
                      key={app.id}
                      onClick={() => {
                        if (!installed) return;
                        setSelectedBloatware((prev) => {
                          const next = new Set(prev);
                          if (next.has(app.id)) next.delete(app.id);
                          else next.add(app.id);
                          return next;
                        });
                      }}
                      className={`px-4 py-2.5 flex items-center justify-between gap-3 select-none transition-colors duration-150 ${
                        !installed ? 'bg-zinc-950 opacity-50 cursor-not-allowed'
                        : isChecked ? 'bg-zinc-950 bg-blue-500/[0.06] shadow-[inset_2px_0_0_var(--color-blue-400)] cursor-pointer' : 'bg-zinc-950 hover:bg-zinc-900/60 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input type="checkbox" checked={isChecked} disabled={!installed} onChange={() => {}} />
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-zinc-100 truncate">{app.name}</div>
                          <div className="text-[11px] text-zinc-500 font-mono truncate">{app.id}</div>
                        </div>
                      </div>
                      {!installed && <span className="dh-tag shrink-0">{t('optimizer.audit.debloat.notInstalled', 'não instalado')}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* TAB 8: STARTUP ITEMS */}
      {!offline && activeTab === 'windows' && <WindowsToolsPanel />}

      {!offline && activeTab === 'startup' && (
        <section className="dh-card p-5 space-y-4">
          {sectionHead(
            t('optimizer.audit.startup.title', 'Aplicativos que iniciam com o Windows'),
            t('optimizer.audit.startup.desc', 'Ativa ou desativa itens de inicialização com o mesmo mecanismo do Gerenciador de Tarefas (StartupApproved): nada é apagado e dá para reativar. Itens "uma vez" (RunOnce) não têm esse mecanismo; ao desativá-los, o DarkHub guarda uma cópia e remove a entrada.')
          )}

          <div className="border border-zinc-800/80 rounded-lg overflow-hidden">
            {loadingStartup && startupItems.length === 0 ? (
              <div>
                <div className="sr-only">{t('optimizer.audit.startup.loading', 'Lendo itens de inicialização...')}</div>
                <SkeletonRows rows={5} />
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/80">
                {startupItems.map((item) => {
                  const enabled = item.enabled !== false;
                  return (
                    <div key={`${item.type}|${item.path}|${item.name}`} className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-zinc-900/50 transition-colors duration-150">
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2.5 min-w-0">
                          <span className="text-[13px] font-medium text-zinc-100 truncate">{item.name}</span>
                          <span className={`inline-flex items-center gap-1.5 text-[11px] lowercase shrink-0 ${enabled ? 'text-emerald-400' : 'text-zinc-500'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${enabled ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                            {enabled ? t('optimizer.audit.startup.enabled', 'INICIA') : t('optimizer.audit.startup.disabled', 'DESATIVADO')}
                          </span>
                          {item.scope && (
                            <span className="dh-tag lowercase shrink-0">
                              {item.scope === 'machine' ? t('optimizer.audit.startup.machine', 'TODOS OS USUÁRIOS') : t('optimizer.audit.startup.user', 'USUÁRIO')}
                            </span>
                          )}
                          {item.oneShot && <span className="dh-tag shrink-0">RunOnce</span>}
                        </div>
                        <div className="text-[11px] text-zinc-500 font-mono truncate mt-0.5">{item.cmd}</div>
                      </div>
                      <button onClick={() => handleToggleStartupItem(item)} disabled={isOptimizing} className="dh-btn dh-btn-sm shrink-0">
                        {enabled ? t('optimizer.audit.startup.disableBtn', 'Desativar') : t('optimizer.audit.startup.enableBtn', 'Ativar')}
                      </button>
                    </div>
                  );
                })}
                {!loadingStartup && startupItems.length === 0 && emptyRow(t('optimizer.audit.startup.empty', 'Nenhum item de inicialização encontrado.'))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* CONFIRM MODAL */}
      {confirmReq && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 animate-fadeIn">
          <div role="dialog" aria-modal="true" className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-5 space-y-3 max-h-[85vh] flex flex-col">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className={confirmReq.danger ? 'text-red-400' : 'text-amber-400'} />
              <h3 className="dh-section-title">{confirmReq.title}</h3>
            </div>
            <div className="text-[12.5px] text-zinc-300 leading-relaxed whitespace-pre-line overflow-y-auto">{confirmReq.body}</div>
            {confirmReq.items && confirmReq.items.length > 0 && (
              <ul className="text-[11.5px] text-zinc-400 font-mono max-h-40 overflow-y-auto border border-zinc-800/80 rounded-lg divide-y divide-zinc-800/80">
                {confirmReq.items.map((it, i) => <li key={i} className="px-3 py-1.5">{it}</li>)}
              </ul>
            )}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button onClick={() => answerConfirm(false)} className="dh-btn">
                {t('optimizer.audit.cancel', 'Cancelar')}
              </button>
              <button onClick={() => answerConfirm(true)} className={`dh-btn ${confirmReq.danger ? 'dh-btn-danger' : 'dh-btn-primary'}`}>
                {confirmReq.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COLLAPSIBLE TERMINAL & LOGS DRAWER */}
      {showConsole && (
        <div className="fixed bottom-3 right-3 left-3 sm:left-auto sm:w-[520px] bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl z-40 animate-fadeIn">
          <div className="flex items-center justify-between px-3 h-10 border-b border-zinc-800/80">
            <span className="text-[12.5px] font-medium text-zinc-200 flex items-center gap-2">
              <Terminal size={14} className="text-zinc-500" />
              {t('optimizer.audit.terminalTitle', 'Terminal de Execução')}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setLogs([])} className="dh-btn dh-btn-ghost dh-btn-sm">
                {t('optimizer.audit.clear', 'Limpar')}
              </button>
              <button onClick={() => setShowConsole(false)} className="dh-btn dh-btn-ghost dh-btn-sm px-2" aria-label="Close">
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="h-48 overflow-y-auto font-mono text-[11.5px] text-zinc-300 space-y-1 px-3 py-2.5">
            {logs.length === 0 ? (
              <span className="text-zinc-600">{t('optimizer.audit.waiting', 'Aguardando execução...')}</span>
            ) : (
              logs.map((l, i) => (
                <div key={i} className="leading-snug">
                  <span className="text-zinc-600">[{l.ts}] </span>
                  <span className={l.level === 'err' ? 'text-red-400' : l.level === 'ok' ? 'text-emerald-400' : l.level === 'warn' ? 'text-amber-300' : 'text-zinc-300'}>
                    {`${l.level === 'err' ? '[' + t('optimizer.audit.tag.err', 'ERRO') + '] ' : l.level === 'ok' ? '[' + t('optimizer.audit.tag.ok', 'OK') + '] ' : l.level === 'warn' ? '[' + t('optimizer.audit.tag.warn', 'AVISO') + '] ' : ''}${l.text}`}
                  </span>
                </div>
              ))
            )}
            <div ref={logBottomRef} />
          </div>
        </div>
      )}
    </div>
  );
}
