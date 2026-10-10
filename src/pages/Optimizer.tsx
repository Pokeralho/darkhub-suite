import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Zap, Trash2, CheckCircle2, Loader2, Cpu, Globe, Clock, Target, Info, Lock, Shield,
  ShieldCheck, Undo2, Search, SlidersHorizontal, Terminal, RefreshCw, Flame, Gamepad2, X,
  RotateCcw, Headphones, Package, Network, ShieldAlert, FolderOpen, AlertTriangle, History
} from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';

type OptimizerTab = 'tweaks' | 'gpu' | 'priority' | 'uninstaller' | 'network' | 'defender' | 'debloat' | 'startup';
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

const tabBtn = (active: boolean) =>
  `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
    active ? 'bg-zinc-700 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
  }`;

const heroBtn = (hover: string) =>
  `p-3 rounded-xl bg-zinc-900/80 hover:bg-zinc-900 border border-zinc-800/80 ${hover} text-left transition flex flex-col justify-between gap-2 shadow-sm disabled:opacity-50 group`;

export default function Optimizer() {
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
  const [tweakStatus, setTweakStatus] = useState<Record<string, boolean>>({});
  const [tweakPartial, setTweakPartial] = useState<Record<string, boolean>>({});
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
    setLogs((prev) => [...prev, { ts: new Date().toLocaleTimeString(), level, text }]);
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
    if (showConsole && logBottomRef.current) {
      logBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showConsole]);

  // keep id -> readable name for the event log
  useEffect(() => {
    const map: Record<string, string> = {};
    for (const op of operations) map[op.id] = t(`optimizer.audit.op.${op.id}.name`, op.name);
    labelsRef.current = map;
  }, [operations, t]);

  const loadInitialData = async () => {
    if (!api()) return;
    try {
      const [ops, deepList, statusRes, admin, profs] = await Promise.all([
        api().listOperations().catch(() => []),
        api().deepTweaksList().catch(() => []),
        api().deepTweaksStatus().catch(() => ({ ok: false, status: {} })),
        api().checkIsAdmin().catch(() => false),
        api().listProfiles?.().catch(() => []) ?? Promise.resolve([])
      ]);
      setOperations(Array.isArray(ops) ? ops : []);
      setDeepTweaks(Array.isArray(deepList) ? deepList : []);
      setProfiles(Array.isArray(profs) ? profs : []);
      if (statusRes?.ok) {
        setTweakStatus(statusRes.status || {});
        setTweakPartial(statusRes.partial || {});
      }
      setIsAdminUser(Boolean(admin));
    } catch (e: any) {
      console.error(e);
    }
  };

  const refreshStatus = async () => {
    if (!api()?.deepTweaksStatus) return null;
    try {
      const res = await api().deepTweaksStatus();
      if (res?.ok) {
        setTweakStatus(res.status || {});
        setTweakPartial(res.partial || {});
        return res.status || {};
      }
    } catch {}
    return null;
  };

  useEffect(() => {
    loadInitialData();
    loadDefenderStatus();
    refreshDnsState();
    loadGpuData();

    if (api()?.onRunEvent) {
      const unsub = api().onRunEvent((ev: any) => {
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
      return () => unsub();
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  /** Wraps an action with the busy flag and the console. */
  const withBusy = async (fn: () => Promise<void>, id: string | null = null) => {
    setIsOptimizing(true);
    setOptimizingId(id);
    setShowConsole(true);
    try {
      await fn();
    } catch (e: any) {
      addLog('err', e?.message || String(e));
    } finally {
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
    setTimeout(() => setter(null), 9000);
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
      await loadInitialData();
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
  const advNetOp = operations.find((o) => o.id === 'optimizer:advancedNetwork');

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
      await loadInitialData();
    });
  };

  const handleRevertAdvancedNetwork = () =>
    withBusy(async () => {
      addLog('info', t('optimizer.audit.net.revertStart', 'Revertendo ajustes de rede para os valores anteriores...'));
      const res = await api().advancedNetworkRevert();
      reportResult(res, t('optimizer.audit.net.revertOk', 'Ajustes de rede revertidos.'), t('optimizer.audit.net.revertFail', 'Falha ao reverter a rede'));
      await loadInitialData();
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
        applied: op.applied === true ? true : op.applied === false ? false : null,
        partial: Boolean(op.partial),
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
        applied: Boolean(tweakStatus[dt.id]),
        partial: Boolean(tweakPartial[dt.id]),
        recommended: dt.recommended === true
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operations, deepTweaks, tweakStatus, tweakPartial, t]);

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
    if (risk === 'advanced') return { cls: 'bg-rose-950/80 text-rose-300 border-rose-500/40', label: t('optimizer.audit.risk.advanced', 'RISCO ALTO') };
    if (risk === 'moderate') return { cls: 'bg-amber-950/80 text-amber-300 border-amber-500/40', label: t('optimizer.audit.risk.moderate', 'RISCO MÉDIO') };
    return { cls: 'bg-zinc-800 text-zinc-400 border-zinc-700', label: t('optimizer.audit.risk.safe', 'baixo risco') };
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
    await loadInitialData();
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

      const activeOps = operations.filter((o) => !o.isRevert && o.applied === true && o.revertId);
      if (activeOps.length) {
        touched += activeOps.length;
        const res = await runOps(activeOps.map((o) => o.revertId));
        failures += res.filter((r) => !r.ok).length;
      }

      const st = (await refreshStatus()) || tweakStatus;
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
      if (kernel?.revertId && kernel.applied !== false) await runOne(kernel.revertId);
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
  const hagsLabel =
    hagsStatus.loading ? t('optimizer.audit.hags.checking', 'Verificando...')
    : hagsStatus.state === 'on' ? t('optimizer.hags.enabled', 'Ativado (HwSchMode = 2)')
    : hagsStatus.state === 'off' ? t('optimizer.hags.disabled', 'Desativado (HwSchMode = 1)')
    : hagsStatus.state === 'default' ? t('optimizer.audit.hags.defaultState', 'Padrão do driver (sem override; pode estar ligado ou não)')
    : t('optimizer.audit.hags.unknown', 'Indisponível');
  const hagsCls =
    hagsStatus.state === 'on' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
    : hagsStatus.state === 'off' ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
    : 'bg-zinc-800 text-zinc-300 border-zinc-700';

  const priorityOptions = [
    { id: 'high', label: t('optimizer.audit.proc.optHigh', 'Alta (High - recomendado p/ jogos)') },
    { id: 'abovenormal', label: t('optimizer.audit.proc.optAbove', 'Acima do Normal') },
    { id: 'normal', label: t('optimizer.audit.proc.optNormal', 'Normal (padrão)') },
    { id: 'belownormal', label: t('optimizer.audit.proc.optBelow', 'Abaixo do Normal') },
    { id: 'idle', label: t('optimizer.audit.proc.optIdle', 'Ociosa (Idle)') },
    { id: 'realtime', label: t('optimizer.audit.proc.optRt', 'Tempo Real (perigoso)') }
  ];

  const StatusPill = ({ ok, label }: { ok: boolean | null; label: string }) => (
    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${ok === null ? 'bg-zinc-800 text-zinc-400 border-zinc-700' : ok ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'}`}>
      {label}
    </span>
  );

  const profileRisk = (r: string) => (r === 'advanced' ? 'text-rose-400' : r === 'moderate' ? 'text-amber-400' : 'text-emerald-400');

  return (
    <div className="w-full max-w-6xl mx-auto space-y-4 p-1 md:p-2 animate-fadeIn text-zinc-100 pb-16">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
        <div>
          <h1 className="text-lg font-bold text-zinc-100 tracking-tight flex items-center gap-2">
            <Zap className="w-5 h-5 text-rose-500" />
            System Optimizer
            {isAdminUser ? (
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 font-mono border border-emerald-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> {t('optimizer.audit.adminOn', 'Admin Ativo')}
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono flex items-center gap-1">
                <Lock className="w-3 h-3" /> {t('optimizer.audit.uacOnDemand', 'UAC sob demanda')}
              </span>
            )}
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            {t('optimizer.audit.subtitle', 'Ajustes de Windows com verificação: cada ação lê o estado real de volta, guarda como desfazer e informa falhas. Ganhos de desempenho são modestos e dependem do hardware.')}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowConsole(!showConsole)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition shadow-sm ${
              showConsole ? 'bg-zinc-700 text-zinc-100 border-zinc-600' : 'bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 border-zinc-700/60'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-zinc-400" />
            {t('optimizer.terminal', 'Terminal')} ({logs.length})
          </button>
          <button
            onClick={handleCreateRestorePoint}
            disabled={isOptimizing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 border-zinc-700/60 transition shadow-sm disabled:opacity-50"
          >
            <History className="w-3.5 h-3.5 text-zinc-400" />
            {t('optimizer.audit.restorePointBtn', 'Criar ponto de restauração')}
          </button>
          <button
            onClick={handleSafeOptimization}
            disabled={isOptimizing}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-sm disabled:opacity-50"
          >
            {isOptimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 fill-current" />}
            {t('optimizer.audit.safeBtn', 'Otimização Segura')}
          </button>
        </div>
      </div>

      {/* 1-CLICK QUICK ACTION HERO BAR */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <button onClick={handleOptimizeRAM} disabled={isOptimizing} className={heroBtn('hover:border-sky-500/50')}>
          <div className="flex items-center justify-between">
            <Cpu className="w-4 h-4 text-sky-400" />
            <span className="text-[10px] font-mono text-zinc-500 group-hover:text-zinc-300">{t('optimizer.hero.oneClick', '1-Clique')}</span>
          </div>
          <div>
            <div className="text-xs font-bold text-zinc-100">{t('optimizer.hero.ramTitle', 'Otimizar RAM')}</div>
            <div className="text-[10px] text-zinc-400 mt-0.5 leading-tight">{ramMsg || t('optimizer.audit.hero.ramDesc', 'Esvazia working sets (temporário)')}</div>
          </div>
        </button>

        <button onClick={handleCleanTempFiles} disabled={isOptimizing} className={heroBtn('hover:border-amber-500/50')}>
          <div className="flex items-center justify-between">
            <Trash2 className="w-4 h-4 text-amber-400" />
            <span className="text-[10px] font-mono text-zinc-500 group-hover:text-zinc-300">{t('optimizer.hero.oneClick', '1-Clique')}</span>
          </div>
          <div>
            <div className="text-xs font-bold text-zinc-100">{t('optimizer.hero.diskTitle', 'Limpar Disco')}</div>
            <div className="text-[10px] text-zinc-400 mt-0.5 leading-tight">{diskMsg || t('optimizer.hero.diskDesc', 'Arquivos temporários')}</div>
          </div>
        </button>

        <button onClick={handleFlushDNS} disabled={isOptimizing} className={heroBtn('hover:border-emerald-500/50')}>
          <div className="flex items-center justify-between">
            <Globe className="w-4 h-4 text-emerald-400" />
            <span className="text-[10px] font-mono text-zinc-500 group-hover:text-zinc-300">{t('optimizer.hero.oneClick', '1-Clique')}</span>
          </div>
          <div>
            <div className="text-xs font-bold text-zinc-100">{t('optimizer.hero.dnsTitle', 'Limpar DNS')}</div>
            <div className="text-[10px] text-zinc-400 mt-0.5 leading-tight">{dnsMsg || t('optimizer.audit.hero.dnsDesc', 'Limpa o cache local de DNS')}</div>
          </div>
        </button>

        <button onClick={handleSetPowerPlan} disabled={isOptimizing} className={heroBtn('hover:border-rose-500/50')}>
          <div className="flex items-center justify-between">
            <Flame className="w-4 h-4 text-rose-400" />
            <span className="text-[10px] font-mono text-zinc-500 group-hover:text-zinc-300">{t('optimizer.hero.oneClick', '1-Clique')}</span>
          </div>
          <div>
            <div className="text-xs font-bold text-zinc-100">{t('optimizer.audit.hero.powerTitle', 'Alto Desempenho')}</div>
            <div className="text-[10px] text-zinc-400 mt-0.5 leading-tight">{powerMsg || t('optimizer.audit.hero.powerDesc', 'Plano de energia (reversível)')}</div>
          </div>
        </button>

        <button onClick={handleOptimizeAudioLatency} disabled={isOptimizing} className={heroBtn('hover:border-purple-500/50')}>
          <div className="flex items-center justify-between">
            <Headphones className="w-4 h-4 text-purple-400" />
            <span className="text-[10px] font-mono text-zinc-500 group-hover:text-zinc-300">{t('optimizer.hero.oneClick', '1-Clique')}</span>
          </div>
          <div>
            <div className="text-xs font-bold text-zinc-100">{t('optimizer.audit.hero.audioTitle', 'Prioridade do Áudio')}</div>
            <div className="text-[10px] text-zinc-400 mt-0.5 leading-tight">{audioMsg || t('optimizer.audit.hero.audioDesc', 'audiodg.exe (temporário)')}</div>
          </div>
        </button>

        <button onClick={handleRevertAll} disabled={isOptimizing} className={heroBtn('hover:border-zinc-500/50')}>
          <div className="flex items-center justify-between">
            <RotateCcw className="w-4 h-4 text-zinc-400" />
            <span className="text-[10px] font-mono text-zinc-500 group-hover:text-zinc-300">{t('optimizer.hero.oneClick', '1-Clique')}</span>
          </div>
          <div>
            <div className="text-xs font-bold text-zinc-100">{t('optimizer.hero.restoreTitle', 'Restaurar Padrões')}</div>
            <div className="text-[10px] text-zinc-400 mt-0.5 leading-tight">{t('optimizer.audit.hero.restoreDesc', 'Desfaz só o que está ativo')}</div>
          </div>
        </button>
      </div>

      {/* TEXTURE STREAMING NOTICE / HAGS CONTROL CARD */}
      <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-amber-200 text-sm">
                {t('optimizer.audit.streaming.title', 'Texturas lentas ou modelos invisíveis em jogos? Controle do HAGS')}
              </div>
              <p className="text-zinc-400 text-[11px] mt-0.5 leading-relaxed">
                {t('optimizer.audit.streaming.desc', 'Alguns jogos (como Overwatch 2) podem carregar texturas devagar quando o cache de shaders é reconstruído ou com certas combinações de driver e HAGS. Desativar ou reativar o HAGS é a única ação aqui que age diretamente nisso; o efeito varia por placa/driver e exige reiniciar o Windows.')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-zinc-400 font-mono">{t('optimizer.audit.hags.statusLabel', 'Status HAGS:')}</span>
            <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold border ${hagsCls}`}>{hagsLabel}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-amber-500/20">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleToggleHags(true)}
              disabled={isOptimizing || hagsStatus.state === 'on'}
              className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 font-semibold text-xs transition disabled:opacity-50 flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t('optimizer.hags.enableBtn', 'Ativar HAGS')}</span>
            </button>
            <button
              onClick={() => handleToggleHags(false)}
              disabled={isOptimizing || hagsStatus.state === 'off'}
              className="px-2.5 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 font-semibold text-xs transition disabled:opacity-50 flex items-center gap-1.5"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              <span>{t('optimizer.hags.disableBtn', 'Desativar HAGS')}</span>
            </button>
            <button
              onClick={handleRevertHags}
              disabled={isOptimizing}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-semibold text-xs transition disabled:opacity-50 flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
              <span>{t('optimizer.audit.hags.revertBtn', 'Restaurar HAGS (como estava)')}</span>
            </button>
          </div>

          <button
            onClick={handleRestoreStreamingDefaults}
            disabled={isOptimizing}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 font-semibold text-xs transition disabled:opacity-50 whitespace-nowrap"
          >
            {t('optimizer.audit.streaming.revertBtn', 'Restaurar Kernel & HAGS')}
          </button>
        </div>
        <div className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
          <Info className="w-3 h-3 shrink-0" />
          {t('optimizer.hags.restartNote', 'Necessário reiniciar o Windows após alterar o HAGS.')}
        </div>
      </div>

      {/* NAVIGATION TABS */}
      <div className="flex items-center gap-1.5 overflow-x-auto p-1.5 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
        <button onClick={() => setActiveTab('tweaks')} className={tabBtn(activeTab === 'tweaks')}>
          <SlidersHorizontal className="w-3.5 h-3.5" />
          {t('optimizer.tabTweaks', 'Ajustes & Customizações')} ({allTweaksList.length})
        </button>
        <button onClick={() => { setActiveTab('uninstaller'); loadPrograms(); }} className={tabBtn(activeTab === 'uninstaller')}>
          <Package className="w-3.5 h-3.5 text-amber-400" />
          {t('optimizer.tabUninstaller', 'Desinstalador & Limpeza de Resíduos')}
        </button>
        <button onClick={() => { setActiveTab('gpu'); loadGpuData(); }} className={tabBtn(activeTab === 'gpu')}>
          <Gamepad2 className="w-3.5 h-3.5 text-rose-500" />
          {t('optimizer.tabGpu', 'Prioridade de GPU & Jogos')}
        </button>
        <button onClick={() => { setActiveTab('priority'); loadProcesses(); }} className={tabBtn(activeTab === 'priority')}>
          <Cpu className="w-3.5 h-3.5 text-sky-400" />
          {t('optimizer.tabPriority', 'Prioridade de Processos')}
        </button>
        <button onClick={() => { setActiveTab('network'); refreshDnsState(); }} className={tabBtn(activeTab === 'network')}>
          <Globe className="w-3.5 h-3.5 text-emerald-400" />
          {t('optimizer.tabNetwork', 'Rede Avançada & DNS')}
        </button>
        <button onClick={() => { setActiveTab('defender'); loadDefenderStatus(); }} className={tabBtn(activeTab === 'defender')}>
          <Shield className="w-3.5 h-3.5 text-rose-500" />
          {t('optimizer.audit.tabDefender', 'Microsoft Defender')}
        </button>
        <button onClick={() => { setActiveTab('debloat'); loadBloatware(); }} className={tabBtn(activeTab === 'debloat')}>
          <Trash2 className="w-3.5 h-3.5" />
          {t('optimizer.audit.tabDebloat', 'Debloat de Apps UWP')}
        </button>
        <button onClick={() => { setActiveTab('startup'); loadStartupItems(); }} className={tabBtn(activeTab === 'startup')}>
          <Clock className="w-3.5 h-3.5" />
          {t('optimizer.audit.tabStartup', 'Inicialização')}
        </button>
      </div>

      {/* TAB 1: ALL TWEAKS & CUSTOMIZATIONS MATRIX */}
      {activeTab === 'tweaks' && (
        <div className="space-y-3">
          {/* Profiles */}
          {profiles.length > 0 && (
            <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800/80 space-y-2">
              <div className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">{t('optimizer.audit.profiles.title', 'Perfis (conjuntos prontos)')}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {profiles.map((p) => (
                  <div key={p.id} className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-zinc-100">{t(`optimizer.audit.profile.${p.id}.name`, p.name)}</span>
                      <span className={`text-[10px] font-mono ${profileRisk(p.risk)}`}>{riskBadge((p.risk as RiskLevel) || 'safe').label}</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-snug flex-1">{t(`optimizer.audit.profile.${p.id}.desc`, p.description)}</p>
                    <button
                      onClick={() => handleApplyProfile(p)}
                      disabled={isOptimizing}
                      className="self-start px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition disabled:opacity-40"
                    >
                      {fmt(t('optimizer.audit.profile.applyBtn', 'Aplicar perfil ({n})'), { n: (p.tweakIds || []).length })}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search & Categories */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800/80">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('optimizer.audit.searchPlaceholder', 'Pesquisar ajuste (ex.: Menu Clássico, RAM, Temp, Barra de Tarefas, MMCSS, Telemetria)...')}
                className="w-full bg-zinc-950 border border-zinc-800/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 font-mono"
              />
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategoryFilter(c.id)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition whitespace-nowrap ${
                    categoryFilter === c.id ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Batch Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setSelectedTweakIds(new Set(filteredTweaks.map((i) => i.id)))}
                className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded font-medium text-xs border border-zinc-700/60 transition"
              >
                {fmt(t('optimizer.audit.selectAll', 'Marcar Todos ({n})'), { n: filteredTweaks.length })}
              </button>
              <button
                onClick={() => setSelectedTweakIds(new Set())}
                className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded font-medium text-xs border border-zinc-700/60 transition"
              >
                {t('optimizer.audit.deselect', 'Desmarcar')}
              </button>
              <span className="text-[11px] text-zinc-500 ml-2 font-mono">
                {fmt(t('optimizer.audit.selectedCount', '{n} selecionado(s)'), { n: selectedTweakIds.size })}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleRunBatch('revert')}
                disabled={isOptimizing || selectedTweakIds.size === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs transition disabled:opacity-40 border border-zinc-700"
              >
                <Undo2 className="w-3.5 h-3.5" />
                {t('optimizer.audit.revertSelected', 'Reverter Ativos Selecionados')}
              </button>
              <button
                onClick={() => handleRunBatch('apply')}
                disabled={isOptimizing || selectedTweakIds.size === 0}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition disabled:opacity-40 shadow-sm"
              >
                {isOptimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 fill-current" />}
                {fmt(t('optimizer.audit.applySelected', 'Aplicar Selecionados ({n})'), { n: selectedTweakIds.size })}
              </button>
            </div>
          </div>

          {/* Tweaks Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
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
                  className={`p-3.5 rounded-xl border transition cursor-pointer flex items-start justify-between gap-3 shadow-sm select-none ${
                    isSelected ? 'bg-zinc-900 border-rose-500/60' : 'bg-zinc-900/60 hover:bg-zinc-900/90 border-zinc-800/80 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="mt-0.5 rounded bg-zinc-950 border-zinc-700 text-rose-600 focus:ring-0 w-4 h-4 cursor-pointer"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-zinc-100">{tweak.title}</span>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{tweak.category}</span>
                        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${rb.cls}`}>{rb.label}</span>
                        {tweak.securityRelated && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-500/40">
                            {t('optimizer.audit.badge.security', 'SEGURANÇA')}
                          </span>
                        )}
                        {tweak.requiresReboot && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-sky-300 border border-sky-500/30">
                            {t('optimizer.audit.badge.reboot', 'REINICIAR')}
                          </span>
                        )}
                        {tweak.requiresAdmin && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                            {t('optimizer.audit.badge.admin', 'ADMIN')}
                          </span>
                        )}
                        {tweak.applied === true && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/90 text-emerald-400 border border-emerald-500/40">
                            {t('optimizer.audit.badge.active', '✓ ATIVO (verificado)')}
                          </span>
                        )}
                        {tweak.applied === false && tweak.partial && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-500/40">
                            {t('optimizer.audit.badge.partial', 'PARCIAL')}
                          </span>
                        )}
                        {tweak.applied === false && !tweak.partial && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
                            {t('optimizer.audit.badge.default', 'PADRÃO')}
                          </span>
                        )}
                        {tweak.applied === null && !tweak.revertId && tweak.kind === 'op' && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
                            {t('optimizer.audit.badge.action', 'AÇÃO PONTUAL')}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-1 leading-snug">{tweak.description}</p>
                      {tweak.warning && (
                        <p className="text-[11px] text-amber-300/90 mt-1 leading-snug flex items-start gap-1">
                          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                          <span>{tweak.warning}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    {showApply && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleApplyItem(tweak); }}
                        disabled={isOptimizing}
                        className="px-2.5 py-1 rounded text-xs font-semibold border transition disabled:opacity-40 bg-rose-600 hover:bg-rose-500 text-white border-rose-500 shadow-sm"
                      >
                        {isRunningThis ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : tweak.kind === 'deep' || tweak.revertId ? t('optimizer.audit.activate', 'Ativar') : t('optimizer.audit.run', 'Executar')}
                      </button>
                    )}
                    {showRevert && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRevertItem(tweak); }}
                        disabled={isOptimizing}
                        className="px-2.5 py-1 rounded text-xs font-semibold border transition disabled:opacity-40 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700"
                      >
                        {isRunningThis && !showApply ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('optimizer.audit.revert', 'Reverter')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: PROGRAM UNINSTALLER & LEFTOVER CLEANER */}
      {activeTab === 'uninstaller' && (
        <div className="space-y-4">
          <div className="bg-zinc-900/80 rounded-xl border border-zinc-800/80 p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                  <Package className="w-4 h-4 text-amber-400" />
                  {t('optimizer.uninstaller.title', 'Desinstalador de Programas com Varredura de Resíduos')}
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {t('optimizer.audit.prog.desc', 'Executa o desinstalador oficial do programa; só depois de confirmar no Registro que ele foi removido, apaga pastas e chaves de resíduo com o nome dele. A limpeza pode apagar configurações salvas em AppData.')}
                </p>
              </div>
              <button
                onClick={loadPrograms}
                disabled={loadingPrograms}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold border border-zinc-700 transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingPrograms ? 'animate-spin' : ''}`} /> {t('optimizer.uninstaller.refresh', 'Atualizar Lista')}
              </button>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={programSearch}
                onChange={(e) => setProgramSearch(e.target.value)}
                placeholder={t('optimizer.uninstaller.search', 'Buscar programa instalado por nome ou desenvolvedor...')}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 font-mono"
              />
            </div>

            {loadingPrograms ? (
              <div className="p-8 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-rose-500" /> {t('optimizer.audit.prog.loading', 'Lendo programas instalados...')}
              </div>
            ) : (
              <div className="max-h-[460px] overflow-y-auto divide-y divide-zinc-800/80 border border-zinc-800 rounded-xl bg-zinc-950">
                {installedPrograms
                  .filter((p) => p.name.toLowerCase().includes(programSearch.toLowerCase()) || (p.publisher && p.publisher.toLowerCase().includes(programSearch.toLowerCase())))
                  .map((prog, idx) => {
                    const isDeleting = uninstallingProgram === prog.name;
                    return (
                      <div key={idx} className="p-3 flex items-center justify-between gap-3 hover:bg-zinc-900/50 transition">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-zinc-100 truncate">{prog.name}</div>
                          <div className="text-[10px] text-zinc-500 font-mono flex items-center gap-2 mt-0.5">
                            {prog.version && <span>v{prog.version}</span>}
                            {prog.publisher && <span>• {prog.publisher}</span>}
                            {prog.installDate && <span>• {t('optimizer.audit.prog.installed', 'Instalado')}: {prog.installDate}</span>}
                          </div>
                        </div>
                        <button
                          onClick={() => handleUninstallProgram(prog)}
                          disabled={isOptimizing}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 hover:text-rose-100 border border-rose-600/40 rounded-lg text-xs font-semibold transition disabled:opacity-40 flex-shrink-0"
                        >
                          {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          {isDeleting ? t('optimizer.uninstaller.uninstalling', 'Desinstalando...') : t('optimizer.uninstaller.btn', 'Desinstalar & Limpar Sobras')}
                        </button>
                      </div>
                    );
                  })}
                {installedPrograms.length === 0 && (
                  <div className="p-6 text-center text-xs text-zinc-500">{t('optimizer.uninstaller.empty', 'Nenhum programa instalado encontrado com os filtros atuais.')}</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: GPU GAME PRIORITY */}
      {activeTab === 'gpu' && (
        <div className="space-y-4">
          <div className="bg-zinc-900/80 rounded-xl border border-zinc-800/80 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
              <div>
                <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  {t('optimizer.hags.title', 'Agendamento de GPU Acelerado por Hardware (HAGS)')}
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5 max-w-2xl leading-relaxed">
                  {t('optimizer.audit.hags.desc', 'O HAGS deixa a GPU agendar o próprio trabalho. Em placas e drivers recentes pode reduzir a carga da CPU e é exigido por alguns recursos (como Frame Generation do DLSS 3); em outros casos pode causar problemas de textura. Não existe uma escolha melhor para todos: teste e use o botão de restaurar se piorar.')}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] text-zinc-400 font-mono">{t('optimizer.audit.hags.statusShort', 'Status:')}</span>
                <span className={`px-2.5 py-1 rounded text-xs font-mono font-semibold border ${hagsCls}`}>{hagsLabel}</span>
              </div>
            </div>
            {hagsStatus.error && <div className="text-[11px] text-rose-400 font-mono">{hagsStatus.error}</div>}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleToggleHags(true)}
                  disabled={isOptimizing || hagsStatus.state === 'on'}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{t('optimizer.hags.enableBtn', 'Ativar HAGS')}</span>
                </button>
                <button
                  onClick={() => handleToggleHags(false)}
                  disabled={isOptimizing || hagsStatus.state === 'off'}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>{t('optimizer.hags.disableBtn', 'Desativar HAGS')}</span>
                </button>
                <button
                  onClick={handleRevertHags}
                  disabled={isOptimizing}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-semibold text-xs transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
                  <span>{t('optimizer.audit.hags.revertBtn', 'Restaurar HAGS (como estava)')}</span>
                </button>
              </div>
              <div className="text-[11px] text-zinc-500 font-mono flex items-center gap-1">
                <Info className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <span>{t('optimizer.hags.restartNote', 'Necessário reiniciar o Windows após alterar o HAGS.')}</span>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900/80 rounded-xl border border-zinc-800/80 p-4 space-y-4">
            <div>
              <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                <Gamepad2 className="w-4 h-4 text-rose-500" />
                {t('optimizer.audit.gpu.title', 'Preferência de GPU por aplicativo (Configurações Gráficas do Windows)')}
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                {t('optimizer.audit.gpu.desc', 'Define qual GPU o Windows usa para cada executável. Só faz diferença em computadores com mais de uma GPU (por exemplo, notebook com GPU integrada e dedicada). Reinicie o jogo para valer.')}
              </p>
              {gpuInfo && gpuInfo.multiGpu === false && (
                <div className="mt-2 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    {fmt(t('optimizer.audit.gpu.single', 'Foi detectada apenas uma GPU ({name}). Esta preferência provavelmente não terá efeito prático neste computador.'), { name: gpuInfo.controllers?.[0]?.model || '?' })}
                  </span>
                </div>
              )}
              {gpuInfo?.multiGpu && (
                <div className="mt-2 text-[11px] text-zinc-400 font-mono">
                  {(gpuInfo.controllers || []).map((c: any) => `${c.model}${c.isDedicated ? ' (dedicada)' : ''}`).join(' • ')}
                </div>
              )}
            </div>

            <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800/80 space-y-3">
              <label className="text-xs font-semibold text-zinc-300 block">{t('optimizer.audit.gpu.pathLabel', 'Caminho do jogo (.exe):')}</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={selectedGpuAppPath}
                  onChange={(e) => setSelectedGpuAppPath(e.target.value)}
                  placeholder="C:\Games\Cyberpunk2077\bin\x64\Cyberpunk2077.exe"
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-700"
                />
                <button
                  onClick={handleBrowseGpuApp}
                  className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold border border-zinc-700 transition"
                >
                  <FolderOpen className="w-3.5 h-3.5" /> {t('optimizer.audit.gpu.browse', 'Procurar .exe')}
                </button>
              </div>

              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-zinc-400">{t('optimizer.audit.gpu.mode', 'Modo gráfico:')}</span>
                  {[
                    { id: 'high_performance', label: t('optimizer.audit.gpu.high', 'Alto desempenho (GPU dedicada)') },
                    { id: 'power_saving', label: t('optimizer.audit.gpu.saving', 'Economia de energia (GPU integrada)') },
                    { id: 'default', label: t('optimizer.audit.gpu.default', 'Deixar o Windows decidir') }
                  ].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedGpuPref(p.id as any)}
                      className={`px-2.5 py-1 rounded text-xs font-medium border transition ${
                        selectedGpuPref === p.id ? 'bg-rose-600 border-rose-500 text-white shadow-sm' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleSetGpuPreference}
                  disabled={isOptimizing || !selectedGpuAppPath.trim()}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg transition disabled:opacity-50 shadow-sm"
                >
                  {t('optimizer.audit.gpu.applyBtn', 'Aplicar Preferência')}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-zinc-300">{t('optimizer.audit.gpu.listTitle', 'Aplicativos configurados:')}</h4>
              {gpuPreferences.length === 0 ? (
                <div className="p-4 text-center text-xs text-zinc-500 bg-zinc-950 rounded-lg border border-zinc-800">
                  {t('optimizer.audit.gpu.empty', 'Nenhum aplicativo configurado no momento.')}
                </div>
              ) : (
                <div className="divide-y divide-zinc-800/80 border border-zinc-800 rounded-lg bg-zinc-950 overflow-hidden">
                  {gpuPreferences.map((p, idx) => (
                    <div key={idx} className="p-3 flex items-center justify-between gap-3 hover:bg-zinc-900/50 transition">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-zinc-100 truncate">{p.appName || p.appPath}</div>
                        <div className="text-[10px] text-zinc-500 font-mono truncate">{p.appPath}</div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {p.exists === false && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-500/30">
                            {t('optimizer.audit.gpu.missing', 'arquivo não existe mais')}
                          </span>
                        )}
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
                          {p.preference === 'high_performance' ? t('optimizer.audit.gpu.badgeHigh', 'GPU dedicada') : p.preference === 'power_saving' ? t('optimizer.audit.gpu.badgeSaving', 'Economia') : t('optimizer.audit.gpu.badgeDefault', 'Padrão')}
                        </span>
                        <button
                          onClick={() => handleRemoveGpuPreference(p.appPath)}
                          disabled={isOptimizing}
                          className="p-1 text-zinc-500 hover:text-rose-400 transition"
                          title={t('optimizer.audit.gpu.remove', 'Remover preferência')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: PROCESS PRIORITY */}
      {activeTab === 'priority' && (
        <div className="space-y-4">
          <div className="bg-zinc-900/80 rounded-xl border border-zinc-800/80 p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-sky-400" />
                  {t('optimizer.audit.proc.title', 'Prioridade de Processos')}
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {t('optimizer.audit.proc.desc', 'Muda a classe de prioridade do processo em execução. NÃO é permanente: vale até o processo fechar. Processos críticos do Windows ficam bloqueados.')}
                </p>
              </div>
              <button
                onClick={loadProcesses}
                disabled={isRefreshingProcesses}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold border border-zinc-700 transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingProcesses ? 'animate-spin' : ''}`} /> {t('optimizer.audit.refresh', 'Atualizar')}
              </button>
            </div>

            {selectedProcess && (
              <div className="p-3 bg-zinc-950 rounded-xl border border-rose-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn">
                <div className="text-xs text-zinc-200">
                  {t('optimizer.audit.proc.selected', 'Processo selecionado:')} <span className="font-mono font-bold text-rose-400">PID {selectedProcess}</span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedPriority}
                    onChange={(e) => setSelectedPriority(e.target.value)}
                    className="bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-zinc-200 font-mono focus:outline-none"
                  >
                    {priorityOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                  <button
                    onClick={() => handleSetProcessPriority(selectedProcess, selectedPriority)}
                    disabled={isOptimizing || Boolean(processList.find((p) => p.pid === selectedProcess)?.critical)}
                    className="px-3.5 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg transition disabled:opacity-50"
                  >
                    {t('optimizer.audit.proc.applyBtn', 'Aplicar Prioridade')}
                  </button>
                </div>
              </div>
            )}

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={processSearch}
                onChange={(e) => setProcessSearch(e.target.value)}
                placeholder={t('optimizer.audit.proc.search', 'Buscar processo pelo nome...')}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 font-mono"
              />
            </div>

            <div className="max-h-96 overflow-y-auto border border-zinc-800 rounded-lg bg-zinc-950 divide-y divide-zinc-800/60">
              {processList
                .filter((p) => p.name.toLowerCase().includes(processSearch.toLowerCase()))
                .map((proc) => (
                  <div
                    key={proc.pid}
                    onClick={() => setSelectedProcess(proc.pid)}
                    className={`p-2.5 flex items-center justify-between gap-3 cursor-pointer transition select-none ${
                      selectedProcess === proc.pid ? 'bg-zinc-800/80 border-l-2 border-rose-500' : 'hover:bg-zinc-900/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-bold text-zinc-100 font-mono truncate">{proc.name}</span>
                      <span className="text-[10px] text-zinc-500 font-mono">PID: {proc.pid}</span>
                      {proc.critical && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                          {t('optimizer.audit.proc.criticalBadge', 'CRÍTICO')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-zinc-400 font-mono">{Math.round(proc.mem / 1024)} MB</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProcess(proc.pid);
                          handleSetProcessPriority(proc.pid, 'high');
                        }}
                        disabled={isOptimizing || Boolean(proc.critical)}
                        className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-semibold rounded border border-zinc-700 transition disabled:opacity-40"
                      >
                        {t('optimizer.audit.proc.setHigh', 'Definir Alta')}
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: ADVANCED NETWORK & DNS */}
      {activeTab === 'network' && (
        <div className="space-y-4">
          <div className="bg-zinc-900/80 rounded-xl border border-zinc-800/80 p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                  <Network className="w-4 h-4 text-rose-500" />
                  {t('optimizer.audit.net.title', 'Ajustes de latência TCP por adaptador')}
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {t('optimizer.audit.net.desc', 'Configura TcpAckFrequency e TCPNoDelay nas interfaces ativas (reduz atraso em jogos online sensíveis), desliga o Energy-Efficient Ethernet e remove o limite reservado do QoS (efeito praticamente nulo no Windows moderno). NÃO aumenta a velocidade da internet.')}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-[11px] text-zinc-500 font-mono">{t('optimizer.audit.net.state', 'Estado verificado:')}</span>
                  <StatusPill
                    ok={advNetOp ? (advNetOp.applied === null ? null : Boolean(advNetOp.applied)) : null}
                    label={advNetOp?.applied === true ? t('optimizer.audit.net.stateOn', 'Aplicado') : advNetOp?.applied === false ? (advNetOp?.partial ? t('optimizer.audit.badge.partial', 'PARCIAL') : t('optimizer.audit.net.stateOff', 'Padrão do Windows')) : t('optimizer.audit.net.stateUnknown', 'Desconhecido')}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRevertAdvancedNetwork}
                  disabled={isOptimizing}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold rounded-lg border border-zinc-700 transition disabled:opacity-50"
                >
                  {t('optimizer.audit.net.restoreBtn', 'Restaurar Padrão')}
                </button>
                <button
                  onClick={handleApplyAdvancedNetwork}
                  disabled={isOptimizing}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg transition shadow-sm disabled:opacity-50"
                >
                  {t('optimizer.audit.net.applyBtn', 'Aplicar Ajustes TCP')}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono">
              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                <div className="text-zinc-400 font-bold">{t('optimizer.audit.net.box1', 'Por adaptador ativo')}</div>
                <div className="text-zinc-300 mt-0.5">TcpAckFrequency=1 / TCPNoDelay=1</div>
              </div>
              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                <div className="text-zinc-400 font-bold">{t('optimizer.audit.net.box2', 'QoS (política Psched)')}</div>
                <div className="text-zinc-300 mt-0.5">NonBestEffortLimit = 0</div>
              </div>
              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                <div className="text-zinc-400 font-bold">{t('optimizer.audit.net.box3', 'Placa de rede')}</div>
                <div className="text-zinc-300 mt-0.5">{t('optimizer.audit.net.box3v', 'Energy-Efficient Ethernet desligado (se suportado)')}</div>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900/80 rounded-xl border border-zinc-800/80 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                  <Globe className="w-4 h-4 text-sky-400" />
                  {t('optimizer.audit.dns.title', 'DNS: medir e trocar servidor')}
                </h3>
                <div className="text-[11px] text-zinc-400 mt-0.5 font-mono">
                  {t('optimizer.audit.dns.adapter', 'Adaptador:')} <span className="text-zinc-200">{dnsState?.adapter || t('optimizer.audit.dns.detecting', 'Detectando...')}</span>
                  {' • '}{t('optimizer.audit.dns.current', 'DNS atual:')} <span className="text-zinc-200">{dnsState?.servers?.length ? dnsState.servers.join(', ') : t('optimizer.audit.dns.dhcp', 'automático (DHCP)')}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleUndoDns}
                  disabled={isOptimizing}
                  className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold rounded-lg border border-zinc-700 transition disabled:opacity-50"
                >
                  {t('optimizer.audit.dns.restoreBtn', 'Restaurar DNS')}
                </button>
                <button
                  onClick={handleRunDnsBenchmark}
                  disabled={dnsBenchmarkRunning || isOptimizing}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition shadow-sm disabled:opacity-50"
                >
                  {dnsBenchmarkRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Target className="w-3.5 h-3.5" />}
                  {t('optimizer.audit.dns.benchBtn', 'Medir Latência Real de DNS')}
                </button>
              </div>
            </div>

            <p className="text-[11px] text-zinc-500">
              {dnsBenchmarkResults === null
                ? t('optimizer.audit.dns.preMeasure', 'Nenhuma latência é exibida até você medir. A lista abaixo traz provedores conhecidos.')
                : fmt(t('optimizer.audit.dns.measured', 'Latência medida agora (mediana de respostas DNS válidas). {f} servidor(es) testado(s) não responderam e foram omitidos.'), { f: dnsBenchmarkFailed })}
            </p>

            <div className="divide-y divide-zinc-800/60 border border-zinc-800 rounded-lg bg-zinc-950 overflow-hidden">
              {dnsRows.length === 0 && (
                <div className="p-4 text-center text-xs text-zinc-500">{t('optimizer.audit.dns.noneAnswered', 'Nenhum servidor respondeu ao teste. Verifique sua conexão ou firewall.')}</div>
              )}
              {dnsRows.map((dns, idx) => (
                <div key={idx} className="p-3 flex items-center justify-between gap-3 hover:bg-zinc-900/40 transition">
                  <div>
                    <div className="text-xs font-bold text-zinc-100 flex items-center gap-2">
                      {dns.name}
                      {!isTrustedDns(dns) && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-500/30">
                          {t('optimizer.audit.dns.unverified', 'não verificado')}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono">{dns.primary} / {dns.secondary}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      {dns.latencyMs ? `${dns.latencyMs} ms` : t('optimizer.audit.dns.notMeasured', 'não medido')}
                    </span>
                    <button
                      onClick={() => handleApplyDns(dns)}
                      disabled={isOptimizing}
                      className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 text-xs font-semibold rounded-lg transition disabled:opacity-50"
                    >
                      {t('optimizer.audit.apply', 'Aplicar')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: MICROSOFT DEFENDER */}
      {activeTab === 'defender' && (
        <div className="space-y-3">
          <div className="bg-zinc-900/80 rounded-xl border border-zinc-800/80 p-4 space-y-3">
            <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
              <Shield className="w-4 h-4 text-rose-500" />
              {t('optimizer.audit.defender.title', 'Microsoft Defender: proteção em tempo real')}
            </h3>
            <p className="text-xs text-zinc-400">
              {t('optimizer.audit.defender.desc', 'Liga ou desliga a proteção em tempo real usando só os mecanismos oficiais (Set-MpPreference e política). Se a Proteção contra Adulteração estiver ativa, o Windows ignora a alteração: o DarkHub não a contorna e mostra como desativá-la manualmente. Após a ação, o estado é conferido com o próprio Defender. Desativar deixa o PC sem antivírus; não afeta SmartScreen nem o Firewall.')}
            </p>

            <div className="flex items-center gap-2 flex-wrap">
              {defenderLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />}
              {defenderStatus && (
                <>
                  <StatusPill ok={Boolean(defenderStatus.realtimeEnabled)} label={defenderStatus.realtimeEnabled ? t('optimizer.audit.defender.rtOn', 'Tempo real: ATIVO') : t('optimizer.audit.defender.rtOff', 'Tempo real: DESATIVADO')} />
                  <StatusPill ok={!defenderStatus.tamperProtected ? null : true} label={defenderStatus.tamperProtected ? t('optimizer.audit.defender.tamperOn', 'Proteção contra Adulteração: LIGADA') : t('optimizer.audit.defender.tamperOff', 'Proteção contra Adulteração: desligada')} />
                  <StatusPill
                    ok={defenderStatus.policyDisableRealtime === 1 ? false : null}
                    label={defenderStatus.policyDisableRealtime === 1 ? t('optimizer.audit.defender.policyOn', 'Política de desativação presente') : t('optimizer.audit.defender.policyOff', 'Sem política de desativação')}
                  />
                  <StatusPill ok={Boolean(defenderStatus.serviceRunning)} label={`WinDefend: ${defenderStatus.serviceStatus || '?'}`} />
                </>
              )}
              <button
                onClick={loadDefenderStatus}
                disabled={defenderLoading}
                className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-semibold rounded border border-zinc-700 transition"
              >
                {t('optimizer.audit.refresh', 'Atualizar')}
              </button>
            </div>

            {(defenderTamperBlocked || defenderStatus?.tamperProtected) && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span>
                  {t('optimizer.audit.defender.tamperHelp', 'A Proteção contra Adulteração está ligada, então o Windows ignoraria o pedido. Desligue-a em Segurança do Windows > Proteção contra vírus e ameaças > Gerenciar configurações > Proteção contra Adulteração e tente de novo.')}
                </span>
                <button
                  onClick={handleOpenTamper}
                  className="shrink-0 px-3 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 border border-amber-500/30 text-xs font-semibold transition"
                >
                  {t('optimizer.audit.defender.openSecurity', 'Abrir Segurança do Windows')}
                </button>
              </div>
            )}

            <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-zinc-200">{t('optimizer.audit.defender.rtTitle', 'Proteção em tempo real')}</div>
                <div className="text-[10px] text-zinc-500">{t('optimizer.audit.defender.rtSub', 'Varredura de arquivos em segundo plano')}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleApplyDefender('disable')}
                  disabled={isOptimizing}
                  className="px-3 py-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-600/40 rounded-lg text-xs font-semibold transition disabled:opacity-50"
                >
                  {t('optimizer.audit.defender.disableBtn', 'Desativar')}
                </button>
                <button
                  onClick={() => handleApplyDefender('enable')}
                  disabled={isOptimizing}
                  className="px-3 py-1.5 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-600/40 rounded-lg text-xs font-semibold transition disabled:opacity-50"
                >
                  {t('optimizer.audit.defender.enableBtn', 'Reativar')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: DEBLOAT APPS */}
      {activeTab === 'debloat' && (
        <div className="space-y-3">
          <div className="bg-zinc-900/80 rounded-xl border border-zinc-800/80 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-amber-400" />
                  {t('optimizer.audit.debloat.title', 'Debloat de aplicativos do Windows (UWP/AppX)')}
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {t('optimizer.audit.debloat.desc', 'Remove pacotes pré-instalados do seu usuário. Apenas itens da lista abaixo, por nome exato, e somente os que estão instalados. Remover não costuma liberar RAM relevante; serve para limpar o menu e o disco. Pode ser reinstalado pela Microsoft Store.')}
                </p>
              </div>
              <button
                onClick={handleRemoveBloatware}
                disabled={isOptimizing || selectedBloatware.size === 0}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg transition disabled:opacity-50 shadow-sm"
              >
                {fmt(t('optimizer.audit.debloat.removeBtn', 'Remover Selecionados ({n})'), { n: selectedBloatware.size })}
              </button>
            </div>

            {loadingBloatware ? (
              <div className="p-8 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-rose-500" /> {t('optimizer.audit.debloat.loading', 'Carregando pacotes instalados...')}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                      className={`p-3 rounded-lg border transition select-none flex items-center justify-between ${
                        !installed ? 'bg-zinc-950 border-zinc-900 opacity-50 cursor-not-allowed'
                        : isChecked ? 'bg-zinc-900 border-rose-500/60 cursor-pointer' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={!installed}
                          onChange={() => {}}
                          className="rounded bg-zinc-900 border-zinc-700 text-rose-600 focus:ring-0 w-3.5 h-3.5"
                        />
                        <div>
                          <div className="text-xs font-bold text-zinc-200">{app.name}</div>
                          <div className="text-[10px] text-zinc-500 font-mono">{app.id}</div>
                        </div>
                      </div>
                      {!installed && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
                          {t('optimizer.audit.debloat.notInstalled', 'não instalado')}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 8: STARTUP ITEMS */}
      {activeTab === 'startup' && (
        <div className="space-y-3">
          <div className="bg-zinc-900/80 rounded-xl border border-zinc-800/80 p-4 space-y-3">
            <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-400" />
              {t('optimizer.audit.startup.title', 'Aplicativos que iniciam com o Windows')}
            </h3>
            <p className="text-xs text-zinc-400">
              {t('optimizer.audit.startup.desc', 'Ativa ou desativa itens de inicialização com o mesmo mecanismo do Gerenciador de Tarefas (StartupApproved): nada é apagado e dá para reativar. Itens "uma vez" (RunOnce) não têm esse mecanismo; ao desativá-los, o DarkHub guarda uma cópia e remove a entrada.')}
            </p>

            {loadingStartup && (
              <div className="p-4 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-rose-500" /> {t('optimizer.audit.startup.loading', 'Lendo itens de inicialização...')}
              </div>
            )}

            <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-lg bg-zinc-950 overflow-hidden">
              {startupItems.map((item, idx) => {
                const enabled = item.enabled !== false;
                return (
                  <div key={idx} className="p-3 flex items-center justify-between gap-3 hover:bg-zinc-900/40">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-zinc-200 truncate flex items-center gap-2">
                        {item.name}
                        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${enabled ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/30' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>
                          {enabled ? t('optimizer.audit.startup.enabled', 'INICIA') : t('optimizer.audit.startup.disabled', 'DESATIVADO')}
                        </span>
                        {item.scope && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                            {item.scope === 'machine' ? t('optimizer.audit.startup.machine', 'TODOS OS USUÁRIOS') : t('optimizer.audit.startup.user', 'USUÁRIO')}
                          </span>
                        )}
                        {item.oneShot && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-sky-300 border border-sky-500/30">RunOnce</span>
                        )}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono truncate">{item.cmd}</div>
                    </div>
                    <button
                      onClick={() => handleToggleStartupItem(item)}
                      disabled={isOptimizing}
                      className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold rounded border border-zinc-700 transition disabled:opacity-50"
                    >
                      {enabled ? t('optimizer.audit.startup.disableBtn', 'Desativar') : t('optimizer.audit.startup.enableBtn', 'Ativar')}
                    </button>
                  </div>
                );
              })}
              {!loadingStartup && startupItems.length === 0 && (
                <div className="p-4 text-center text-xs text-zinc-500">{t('optimizer.audit.startup.empty', 'Nenhum item de inicialização encontrado.')}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM MODAL */}
      {confirmReq && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-4 space-y-3 max-h-[85vh] flex flex-col">
            <div className="flex items-center gap-2">
              <AlertTriangle className={`w-4 h-4 ${confirmReq.danger ? 'text-rose-400' : 'text-amber-400'}`} />
              <h3 className="text-sm font-bold text-zinc-100">{confirmReq.title}</h3>
            </div>
            <div className="text-xs text-zinc-300 leading-relaxed whitespace-pre-line overflow-y-auto">{confirmReq.body}</div>
            {confirmReq.items && confirmReq.items.length > 0 && (
              <ul className="text-[11px] text-zinc-400 font-mono space-y-0.5 max-h-40 overflow-y-auto border border-zinc-800 rounded-lg bg-zinc-950 p-2">
                {confirmReq.items.map((it, i) => <li key={i}>• {it}</li>)}
              </ul>
            )}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => answerConfirm(false)}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg border border-zinc-700 transition"
              >
                {t('optimizer.audit.cancel', 'Cancelar')}
              </button>
              <button
                onClick={() => answerConfirm(true)}
                className={`px-4 py-1.5 text-white text-xs font-bold rounded-lg transition ${confirmReq.danger ? 'bg-rose-600 hover:bg-rose-500' : 'bg-zinc-600 hover:bg-zinc-500'}`}
              >
                {confirmReq.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COLLAPSIBLE TERMINAL & LOGS DRAWER */}
      {showConsole && (
        <div className="fixed bottom-3 right-3 left-3 sm:left-auto sm:w-[500px] bg-zinc-950/95 border border-zinc-800 rounded-xl shadow-2xl p-3 z-40 animate-fadeIn backdrop-blur">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80 text-xs">
            <span className="font-mono font-bold text-zinc-300 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-rose-500" />
              {t('optimizer.audit.terminalTitle', 'Terminal de Execução')}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setLogs([])} className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300">
                {t('optimizer.audit.clear', 'Limpar')}
              </button>
              <button onClick={() => setShowConsole(false)} className="text-zinc-500 hover:text-zinc-200">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="h-44 overflow-y-auto font-mono text-[11px] text-zinc-300 space-y-1 p-2 bg-black/60 rounded-lg border border-zinc-900 mt-2">
            {logs.length === 0 ? (
              <span className="text-zinc-600">{t('optimizer.audit.waiting', 'Aguardando execução...')}</span>
            ) : (
              logs.map((l, i) => (
                <div key={i} className="leading-tight">
                  <span className={l.level === 'err' ? 'text-rose-400' : l.level === 'ok' ? 'text-emerald-400' : l.level === 'warn' ? 'text-amber-300' : 'text-zinc-300'}>
                    {`[${l.ts}] ${l.level === 'err' ? '[' + t('optimizer.audit.tag.err', 'ERRO') + '] ' : l.level === 'ok' ? '[' + t('optimizer.audit.tag.ok', 'OK') + '] ' : l.level === 'warn' ? '[' + t('optimizer.audit.tag.warn', 'AVISO') + '] ' : ''}${l.text}`}
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
