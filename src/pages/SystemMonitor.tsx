import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import {
  Cpu, Server, HardDrive, Network, Monitor, Zap,
  RefreshCw, AlertTriangle, PlaySquare, ShieldCheck,
  CheckCircle2, LayoutTemplate, Wifi, FileDigit, CpuIcon, Activity, List, Thermometer, Copy, Clock,
  Loader2, Filter, Gauge as GaugeIcon, Layers
} from '../components/icons';
import { useSystemMetrics } from '../hooks/useSystemMetrics';
import { useDeepHardware } from '../hooks/useDeepHardware';
import { HelpTip } from '../components/HelpTip';
import PageHeader from '../components/ui/PageHeader';
import AdvancedSensorsPanel from '../components/monitor/AdvancedSensorsPanel';
import LhmSensorTree from '../components/monitor/LhmSensorTree';
import { Sparkline } from '../components/library/Sparkline';
import { useSensorHistory } from '../hooks/useSensorHistory';

const formatBytes = (bytes: number | null | undefined) => {
  if (bytes == null || isNaN(bytes)) return '--';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const PropertyRow = ({ label, value, status }: { label: string; value: React.ReactNode; status?: string }) => (
  <div className="flex justify-between items-center gap-6 min-h-9 py-2 px-4 border-b border-zinc-800/80 last:border-0 hover:bg-zinc-900/60 transition-colors">
    <span className="text-[12.5px] text-zinc-500 shrink-0">{label}</span>
    <div className="flex items-center gap-2 min-w-0">
      {status === 'Error' && <span title="Falha ao ler sensor"><AlertTriangle size={13} className="text-amber-400" /></span>}
      {status === 'OK' && <CheckCircle2 size={13} className="text-emerald-400" />}
      <span className="text-[12.5px] font-mono text-zinc-100 text-right break-all">{value ?? '--'}</span>
    </div>
  </div>
);

const Skel = ({ className = '' }: { className?: string }) => (
  <span aria-hidden="true" className={`inline-block rounded bg-zinc-800/80 animate-pulse align-middle ${className}`} />
);

// Threshold tone for a reading: neutral until it crosses warn/crit.
const toneFor = (v: any, warn?: number, crit?: number) => {
  const n = Number(v);
  if (v == null || !Number.isFinite(n)) return 'text-zinc-50';
  if (crit != null && n >= crit) return 'text-red-300';
  if (warn != null && n >= warn) return 'text-amber-300';
  return 'text-zinc-50';
};

// Load bar for per-core readings: glacier, amber/red only past thresholds.
const loadBar = (v: number) => (v > 90 ? 'bg-red-400' : v > 80 ? 'bg-amber-400' : 'bg-blue-400');

const Gauge = React.memo(({ label, value, unit, history, max = 100, warn, crit }: any) => {
  const { t } = useI18n();

  const stats = useMemo(() => {
    if (!history || history.length === 0) return { min: null, avg: null, max: null };
    const valid = history.filter((n: any) => typeof n === 'number' && !isNaN(n));
    if (valid.length === 0) return { min: null, avg: null, max: null };
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const sum = valid.reduce((a: number, b: number) => a + b, 0);
    const avg = sum / valid.length;
    return {
      min: min.toFixed(1),
      avg: avg.toFixed(1),
      max: max.toFixed(1)
    };
  }, [history]);

  return (
    <div className="bg-zinc-950 px-4 pt-3.5 pb-3 flex flex-col min-w-0">
      <div className="flex justify-between items-baseline gap-3">
        <span className="text-[12px] text-zinc-500 truncate">{label}</span>
        <span className={`font-mono text-[22px] leading-none tabular-nums whitespace-nowrap ${toneFor(value, warn, crit)}`}>
          {value != null ? value : <Skel className="h-5 w-14" />}
          <span className="text-[12px] text-zinc-500 ml-0.5">{unit}</span>
        </span>
      </div>
      <div className="h-10 mt-3">
        <Sparkline data={history} min={0} max={max} color="var(--color-blue-400)" strokeWidth={1.25} />
      </div>
      <dl className="mt-2.5 grid grid-cols-3 text-[11px] font-mono">
        {[
          [t('monitor.stats.min', 'Mín'), stats.min],
          [t('monitor.stats.avg', 'Média'), stats.avg],
          [t('monitor.stats.max', 'Máx'), stats.max]
        ].map(([k, v], i) => (
          <div key={i} className={`flex gap-1.5 ${i === 1 ? 'justify-center' : i === 2 ? 'justify-end' : ''}`}>
            <dt className="text-zinc-600 font-sans">{k}</dt>
            <dd className="text-zinc-300">{v != null ? <>{v}<span className="text-zinc-600">{unit}</span></> : '--'}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
});

const SectionBlock = ({ title, children, icon: Icon }: { title: string; children: React.ReactNode; icon?: any }) => (
  <section className="dh-card overflow-hidden">
    <div className="px-4 h-10 border-b border-zinc-800/80 flex items-center gap-2 min-w-0">
      {Icon && <Icon size={14} className="text-zinc-500 shrink-0" />}
      <h3 className="dh-section-title truncate">{title}</h3>
    </div>
    <div>
      {children}
    </div>
  </section>
);

type TabType = 'overview' | 'cpu' | 'ram' | 'gpu' | 'mobo' | 'storage' | 'network' | 'temps' | 'sensors' | 'procs' | 'monitors' | 'os' | 'latency';

const toFixedSafe = (v: any, d: number = 1) => {
  if (v == null || typeof v !== 'number' || isNaN(v)) return undefined;
  return v.toFixed(d);
};

const formatSource = (source?: string) => {
  if (!source) return '--';
  const s = source.toLowerCase();
  if (s.includes('coretemp')) return 'CoreTemp';
  if (s.includes('lhm') || s.includes('libre')) return 'LibreHardwareMonitor';
  if (s.includes('ohm') || s.includes('openhardware')) return 'OpenHardwareMonitor';
  if (s.includes('nvidia') || s.includes('smi')) return 'NVIDIA SMI';
  if (s.includes('dts') || s.includes('thermal') || s.includes('acpi')) return 'ACPI Thermal Zone';
  if (s.includes('storage') || s.includes('smart')) return 'SMART Storage';
  if (s.includes('node')) return 'Kernel OS';
  if (s.includes('wmi')) return 'Windows WMI';
  return source.toUpperCase();
};

const isVirtualNet = (n: any) => {
  if (n?.virtual) return true;
  const name = `${n?.ifaceName || ''} ${n?.iface || ''} ${n?.type || ''}`.toLowerCase();
  return /vethernet|hyper-v|wsl|loopback|isatap|teredo|tap|vpn|tailscale|zerotier|bluetooth|pseudo|npcap|virtual|vmware|virtualbox/.test(name);
};

const SystemMonitor = () => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  const metrics = useSystemMetrics();
  const { categories, loadingMap, errorMap, fetchCategory, refreshCategory } = useDeepHardware();

  const [benchmarkResult, setBenchmarkResult] = useState<{mops: string, time: string} | null>(null);
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [procSearch, setProcSearch] = useState('');
  const [driverSearch, setDriverSearch] = useState('');
  const [filterVirtualNet, setFilterVirtualNet] = useState(true);

  // In-app toast notification to replace alert()
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      toastTimerRef.current = null;
      setToast(prev => (prev?.message === message ? null : prev));
    }, 4000);
  }, []);

  // Self-consumption of DarkHub Suite
  const [darkhubUsage, setDarkhubUsage] = useState<{
    totalCpuPercent: number;
    totalWorkingSetMb: number;
    processes: Array<{ pid: number; type: string; name: string; cpuPercent: number; workingSetMb: number }>;
  } | null>(null);

  // Lazy loading by active tab
  useEffect(() => {
    const deepTabs = ['cpu', 'ram', 'gpu', 'mobo', 'storage', 'network', 'monitors', 'os'];
    if (deepTabs.includes(activeTab)) {
      fetchCategory(activeTab);
    }
  }, [activeTab, fetchCategory]);

  // Enable process polling only when procs tab is open. The cleanup already
  // disables it, so only the procs tab needs to send anything.
  const isProcsTab = activeTab === 'procs';
  useEffect(() => {
    if (!isProcsTab) return;
    const sys = window.darkhub?.system as { enableProcessTracking?: (on: boolean) => unknown } | undefined;
    sys?.enableProcessTracking?.(true);
    return () => {
      sys?.enableProcessTracking?.(false);
    };
  }, [isProcsTab]);

  // DarkHub resource usage polling on overview tab
  const isOverviewTab = activeTab === 'overview';
  useEffect(() => {
    if (!isOverviewTab) return;

    let mounted = true;
    const fetchUsage = async () => {
      try {
        const usage = await window.darkhub?.app?.getResourceUsage?.();
        if (mounted && usage?.ok) {
          setDarkhubUsage({
            totalCpuPercent: Number(usage.totalCpuPercent ?? 0),
            totalWorkingSetMb: Number(usage.totalWorkingSetMb ?? 0),
            processes: (usage.processes || []).map((p: any) => ({ ...p, name: String(p?.name ?? '') }))
          });
        }
      } catch (err) {
        console.warn('Failed to get app resource usage', err);
      }
    };

    fetchUsage();
    const interval = setInterval(fetchUsage, 3000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [isOverviewTab]);

  const cpuLoadHistory = useSensorHistory(metrics?.cpu?.values?.currentLoad?.value, 60, metrics);
  const ramUseHistory = useSensorHistory(metrics?.ram?.values?.percent?.value, 60, metrics);
  const gpuUtilHistory = useSensorHistory(metrics?.gpu?.values?.gpus?.[0]?.utilization?.value, 60, metrics);
  const diskActHistory = useSensorHistory(metrics?.diskIo?.values?.activity?.value, 60, metrics);
  const tempHistory = useSensorHistory(metrics?.temps?.values?.main?.value, 60, metrics);
  const dpcHistory = useSensorHistory(metrics?.latency?.values?.dpcsQueued?.value, 60, metrics);

  const handleBenchmark = async () => {
    if (window.darkhub) {
      setIsBenchmarking(true);
      setBenchmarkResult(null);
      try {
        const res = await window.darkhub?.system?.runBenchmark?.();
        if (res?.ok) {
          setBenchmarkResult({ mops: res.mops, time: res.time });
          showToast(`${t('monitor.benchmarkSuccess', 'Benchmark concluído com sucesso!')} ${res.mops} MOPS (${res.time}ms)`, 'success');
        } else {
          showToast(t('monitor.benchmarkFailed', 'Falha no benchmark: ') + (res?.error ?? ''), 'error');
        }
      } catch (e) {
        console.error('Benchmark error', e);
        showToast('Erro inesperado ao executar o benchmark.', 'error');
      } finally {
        setIsBenchmarking(false);
      }
    }
  };

  const generateReport = () => {
    let report = "--- DARKHUB HARDWARE INSPECTOR REPORT ---\n";
    report += `Date: ${new Date().toLocaleString()}\n\n`;
    report += "[CPU]\n";
    const cpuInfo = categories.cpu?.data;
    report += `Model: ${cpuInfo?.manufacturer || ''} ${cpuInfo?.brand || ''}\n`;
    report += `Load: ${metrics?.cpu?.values?.currentLoad?.value ?? '--'}%\n\n`;
    report += "[RAM]\n";
    report += `Total: ${formatBytes(metrics?.ram?.values?.total?.value)}\n`;
    report += `Used: ${metrics?.ram?.values?.percent?.value ?? '--'}%\n\n`;
    navigator.clipboard.writeText(report);
    showToast(t('monitor.reportCopied', 'Relatório copiado para a área de transferência!'), 'success');
  };

  const isCurrentTabLoading = Boolean(loadingMap[activeTab]);

  const handleTabRefresh = () => {
    const deepTabs = ['cpu', 'ram', 'gpu', 'mobo', 'storage', 'network', 'monitors', 'os'];
    if (deepTabs.includes(activeTab)) {
      refreshCategory(activeTab);
    }
  };

  const renderTabs = () => {
    const tabs = [
      { id: 'overview', icon: Activity, label: t('monitor.tab.overview', 'Visão Geral') },
      { id: 'cpu', icon: Cpu, label: t('monitor.tab.cpu', 'Processador (CPU)') },
      { id: 'gpu', icon: Monitor, label: t('monitor.tab.gpu', 'Placas de Vídeo (GPU)') },
      { id: 'ram', icon: Server, label: t('monitor.tab.ram', 'Memória (RAM)') },
      { id: 'storage', icon: HardDrive, label: t('monitor.tab.storage', 'Armazenamento') },
      { id: 'network', icon: Network, label: t('monitor.tab.network', 'Rede') },
      { id: 'temps', icon: Thermometer, label: t('monitor.tab.temps', 'Temperaturas') },
      { id: 'sensors', icon: GaugeIcon, label: t('monitor.tab.sensors', 'Todos os sensores') },
      { id: 'latency', icon: Clock, label: t('monitor.tab.latency', 'Latência DPC/ISR') },
      { id: 'procs', icon: List, label: t('monitor.tab.procs', 'Processos') },
      { id: 'monitors', icon: LayoutTemplate, label: t('monitor.tab.displays', 'Monitores') },
      { id: 'mobo', icon: LayoutTemplate, label: t('monitor.tab.mobo', 'Placa-Mãe & BIOS') },
      { id: 'os', icon: FileDigit, label: t('monitor.tab.os', 'Sistema Operacional') }
    ];

    return (
      <nav aria-label={t('monitor.title', 'Monitor de Sistema')} className="flex flex-col w-full md:w-56 shrink-0 overflow-y-auto custom-scrollbar">
        <div className="flex flex-col gap-0.5">
          {tabs.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2.5 h-8 px-2.5 rounded-md text-[12.5px] text-left transition-colors ${
                  active ? 'bg-zinc-900 text-zinc-50 font-medium' : 'text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200'
                }`}
              >
                <tab.icon size={15} className={`shrink-0 ${active ? 'text-blue-300' : 'text-zinc-500'}`} />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 pt-4 border-t border-zinc-800/80 space-y-2 pb-4">
          <button onClick={handleBenchmark} disabled={isBenchmarking} className="dh-btn dh-btn-primary w-full">
            {isBenchmarking ? <Loader2 size={14} className="animate-spin" /> : <PlaySquare size={14} />}
            <span className="truncate">{isBenchmarking ? t('monitor.running', 'Executando...') : t('monitor.runBenchmark', 'Executar Benchmark de CPU')}</span>
          </button>

          <div className="flex flex-col gap-2">
            <button onClick={handleTabRefresh} disabled={isCurrentTabLoading} className="dh-btn w-full">
              <RefreshCw size={13} className={isCurrentTabLoading ? 'animate-spin' : ''} />
              <span className="truncate">{t('monitor.refreshSensors', 'Atualizar')}</span>
            </button>
            <button onClick={generateReport} className="dh-btn w-full">
              <Copy size={13} />
              <span className="truncate">{t('monitor.copyReport', 'Copiar Relatório')}</span>
            </button>
          </div>

          {benchmarkResult && (
            <dl className="animate-in rounded-lg border border-zinc-800/80 px-3 py-2.5 flex items-baseline justify-between">
              <dt className="text-[11.5px] text-zinc-500">Benchmark</dt>
              <dd className="font-mono text-right">
                <span className="text-[16px] text-zinc-50">{benchmarkResult.mops}</span><span className="text-[11px] text-zinc-500"> MOPS</span>
                <span className="block text-[11px] text-zinc-500">{benchmarkResult.time} ms</span>
              </dd>
            </dl>
          )}
        </div>
      </nav>
    );
  };

  const renderTabLoadingState = () => (
    <div className="space-y-4" aria-busy="true" aria-label={t('monitor.tabLoading', 'Carregando dados desta seção...')}>
      {[6, 3].map((rows, b) => (
        <div key={b} className="dh-card overflow-hidden">
          <div className="px-4 h-10 border-b border-zinc-800/80 flex items-center"><Skel className="h-3 w-40" /></div>
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex justify-between items-center h-9 px-4 border-b border-zinc-800/80 last:border-0">
              <Skel className="h-2.5 w-32" />
              <Skel className="h-2.5 w-24" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );

  const renderTabErrorState = (tabKey: string) => (
    <div role="alert" className="dh-card p-4 flex items-start gap-3">
      <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <h3 className="dh-section-title">{t('monitor.tabError', 'Falha ao obter dados desta seção')}</h3>
        <p className="mt-1 text-[12.5px] text-red-300 break-words">{errorMap[tabKey] || 'O Windows não retornou os dados para esta categoria.'}</p>
        <button onClick={() => refreshCategory(tabKey)} className="dh-btn dh-btn-sm mt-3">
          <RefreshCw size={13} />
          {t('monitor.tabRetry', 'Tentar Novamente')}
        </button>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'overview': {
        const cores = metrics?.cpu?.values?.coresLoad || [];
        return (
          <div className="space-y-6 animate-in">
            <section aria-labelledby="mon-realtime">
              <h2 id="mon-realtime" className="dh-section-title mb-3">
                {t('monitor.overview.realtime', 'Painel de Sensores (Tempo Real)')}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-px rounded-xl border border-zinc-800/80 bg-zinc-800/70 overflow-hidden">
                <Gauge label={t('monitor.gauge.cpuLoad', 'Carga da CPU')} value={toFixedSafe(metrics?.cpu?.values?.currentLoad?.value, 1)} unit="%" history={cpuLoadHistory} warn={85} crit={95} />
                <Gauge label={t('monitor.gauge.ramUsage', 'Uso de RAM')} value={toFixedSafe(metrics?.ram?.values?.percent?.value, 1)} unit="%" history={ramUseHistory} warn={80} crit={90} />
                <Gauge label={t('monitor.gauge.gpuUtil', 'Uso da GPU')} value={toFixedSafe(metrics?.gpu?.values?.gpus?.[0]?.utilization?.value, 1)} unit="%" history={gpuUtilHistory} />
                <Gauge label={t('monitor.gauge.diskAct', 'Atividade do Disco')} value={toFixedSafe(metrics?.diskIo?.values?.activity?.value, 1)} unit="%" history={diskActHistory} warn={95} />
                <Gauge label={t('monitor.gauge.cpuTemp', 'Temp. da CPU')} value={toFixedSafe(metrics?.temps?.values?.main?.value, 0)} unit="°C" history={tempHistory} warn={80} crit={90} />
                <Gauge label="DPC/s" value={toFixedSafe(metrics?.latency?.values?.dpcsQueued?.value, 0)} unit="" history={dpcHistory} max={25000} warn={5000} crit={15000} />
              </div>
            </section>

            {/* Compact Per-Core CPU Preview */}
            {cores.length > 0 && (
              <SectionBlock title="Distribuição de Carga por Núcleo" icon={Zap}>
                <div className="px-4 py-3 grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-x-4 gap-y-3">
                  {cores.map((core: any, idx: number) => {
                    const val: number | null = core?.value ?? null;
                    return (
                      <div key={idx} className="min-w-0">
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-zinc-600 font-mono">C{idx}</span>
                          <span className="font-mono text-zinc-200 tabular-nums">{val == null ? '--' : toFixedSafe(val, 0)}</span>
                        </div>
                        <div className="w-full bg-zinc-800 rounded-full h-[3px] overflow-hidden">
                          <div className={`${loadBar(val ?? 0)} h-full transition-all duration-300`} style={{ width: `${val == null ? 0 : Math.min(100, Math.max(3, val))}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SectionBlock>
            )}

            {/* DarkHub Suite Self-Consumption */}
            <section className="dh-card overflow-hidden" aria-labelledby="mon-selfuse">
              <div className="px-4 py-3 border-b border-zinc-800/80">
                <h3 id="mon-selfuse" className="dh-section-title">
                  {t('monitor.darkhubUsage.title', 'Consumo do DarkHub Suite')}
                </h3>
                <p className="dh-help">
                  {t('monitor.darkhubUsage.desc', 'Pegada de recursos em tempo real do próprio aplicativo')}
                </p>
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-zinc-800/70">
                {[
                  { label: t('monitor.darkhubUsage.cpu', 'Uso de CPU'), value: darkhubUsage ? darkhubUsage.totalCpuPercent : null, unit: '%', hint: t('monitor.darkhubUsage.cpuHint', 'Threads de renderização e main') },
                  { label: t('monitor.darkhubUsage.ram', 'Memória RAM'), value: darkhubUsage ? darkhubUsage.totalWorkingSetMb : null, unit: ' MB', hint: t('monitor.darkhubUsage.ramHint', 'Working Set (processos somados)') },
                  { label: t('monitor.darkhubUsage.procs', 'Processos Ativos'), value: darkhubUsage ? darkhubUsage.processes.length : null, unit: '', hint: t('monitor.darkhubUsage.procsHint', 'Main, Renderer & GPU') }
                ].map((m, i) => (
                  <div key={i} className="bg-zinc-900 px-4 py-3 min-w-0">
                    <dt className="text-[12px] text-zinc-500">{m.label}</dt>
                    <dd className="mt-1.5 font-mono text-[20px] leading-none text-zinc-50 tabular-nums">
                      {m.value != null ? <>{m.value}<span className="text-[12px] text-zinc-500">{m.unit}</span></> : <Skel className="h-5 w-14" />}
                    </dd>
                    <dd className="mt-1.5 text-[11px] text-zinc-500 truncate">{m.hint}</dd>
                  </div>
                ))}
              </dl>

              {darkhubUsage && darkhubUsage.processes.length > 0 && (
                <div className="px-4 py-3 border-t border-zinc-800/80">
                  <div className="text-[11.5px] text-zinc-500 mb-1.5">
                    {t('monitor.darkhubUsage.internalProcs', 'Processos Internos:').replace(/:\s*$/, '')}
                  </div>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6">
                    {darkhubUsage.processes.map((p, idx) => (
                      <li key={idx} className="flex items-center justify-between gap-2 py-1.5 border-b border-zinc-800/60 text-[11.5px] font-mono">
                        <span className="text-zinc-300 capitalize truncate" title={`${p.type} (${p.pid})`}>
                          {p.type || p.name || 'Process'} <span className="text-zinc-600">{p.pid}</span>
                        </span>
                        <span className="text-zinc-400 shrink-0 tabular-nums">
                          {p.workingSetMb}<span className="text-zinc-600"> MB</span> · {p.cpuPercent}<span className="text-zinc-600">%</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </div>
        );
      }

      case 'cpu': {
        if (loadingMap['cpu'] && !categories['cpu']) return renderTabLoadingState();
        if (errorMap['cpu']) return renderTabErrorState('cpu');

        const d = categories.cpu?.data || {};
        const r = metrics?.cpu?.values || {};

        return (
          <div className="space-y-4 animate-in">
            <SectionBlock title="Desempenho por Núcleo" icon={Zap}>
              <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-x-5 gap-y-3.5">
                {r.coresLoad?.map((core: any, idx: number) => {
                  const val: number | null = core?.value ?? null;
                  return (
                    <div key={idx} className="min-w-0">
                      <div className="flex justify-between text-[11.5px] mb-1.5">
                        <span className="text-zinc-500">Core <span className="font-mono">{idx}</span></span>
                        <span className="font-mono text-zinc-100 tabular-nums">{val == null ? '--' : <>{toFixedSafe(val, 1)}<span className="text-zinc-500">%</span></>}</span>
                      </div>
                      <div className="w-full bg-zinc-800 rounded-full h-[3px] overflow-hidden">
                        <div className={`${loadBar(val ?? 0)} h-full transition-all duration-300`} style={{ width: `${val ?? 0}%` }} />
                      </div>
                    </div>
                  );
                })}
                {(!r.coresLoad || r.coresLoad.length === 0) && Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="space-y-2" aria-hidden="true"><Skel className="h-2.5 w-full" /><Skel className="h-[3px] w-full" /></div>
                ))}
              </div>
            </SectionBlock>

            <SectionBlock title="Topologia e Clocks" icon={CpuIcon}>
              <PropertyRow label="Modelo" value={`${d.manufacturer ?? ''} ${d.brand ?? ''}`} />
              <PropertyRow label="Família / Model / Stepping" value={`${d.family ?? '--'} / ${d.model ?? '--'} / ${d.stepping ?? '--'}`} />
              <PropertyRow label="Soquete" value={d.socket} />
              <PropertyRow label="Núcleos (Threads)" value={`${d.physicalCores ?? '--'} Físicos / ${d.cores ?? '--'} Lógicos`} />
              <PropertyRow label="Frequência Base" value={d.speedBase ? `${d.speedBase} GHz` : '--'} />
              <PropertyRow label="Frequência Turbo Max" value={d.speedMax ? `${d.speedMax} GHz` : '--'} />
            </SectionBlock>

            <SectionBlock title="Hierarquia de Cache" icon={Server}>
              <PropertyRow label="Cache L1 (Dados + Instrução)" value={d.cache?.l1d ? formatBytes(d.cache.l1d + (d.cache.l1i || 0)) : '--'} />
              <PropertyRow label="Cache L2" value={d.cache?.l2 ? formatBytes(d.cache.l2) : '--'} />
              <PropertyRow label="Cache L3" value={d.cache?.l3 ? formatBytes(d.cache.l3) : '--'} />
            </SectionBlock>
          </div>
        );
      }

      case 'ram': {
        if (loadingMap['ram'] && !categories['ram']) return renderTabLoadingState();
        if (errorMap['ram']) return renderTabErrorState('ram');

        const list = (categories.ram || categories.memory)?.data || [];
        const r = metrics?.ram?.values || {};
        return (
          <div className="space-y-4 animate-in">
             <SectionBlock title="Visão Geral de Memória" icon={Activity}>
              <PropertyRow label="Uso em Tempo Real" value={r.percent?.value != null ? `${toFixedSafe(r.percent.value, 1)}% (${formatBytes(r.used?.value)} / ${formatBytes(r.total?.value)})` : '--'} />
              <div className="px-4 pb-3">
                <div className="w-full bg-zinc-800 rounded-full h-[3px] overflow-hidden">
                  <div className={`${Number(r.percent?.value) >= 90 ? 'bg-red-400' : Number(r.percent?.value) >= 80 ? 'bg-amber-400' : 'bg-blue-400'} h-full transition-all duration-500`} style={{ width: r.percent?.value ? `${r.percent.value}%` : '0%' }}></div>
                </div>
              </div>
            </SectionBlock>

            {list.map((m: any, idx: number) => (
              <SectionBlock key={idx} title={`Slot Físico: ${m.bank || `DIMM ${idx+1}`}`} icon={Server}>
                <PropertyRow label="Fabricante" value={m.manufacturer || 'Desconhecido'} />
                <PropertyRow label="Tipo de Memória" value={m.type || 'Desconhecido'} />
                <PropertyRow label="Tamanho" value={formatBytes(m.size)} />
                <PropertyRow label="Frequência Efetiva" value={m.clockSpeed ? `${m.clockSpeed} MHz` : '--'} />
                <PropertyRow label="Formato (Form Factor)" value={m.formFactor || '--'} />
                <PropertyRow label="Part Number" value={m.partNum || '--'} />
              </SectionBlock>
            ))}
          </div>
        );
      }

      case 'gpu': {
        if (loadingMap['gpu'] && !categories['gpu']) return renderTabLoadingState();
        if (errorMap['gpu']) return renderTabErrorState('gpu');

        const staticList = categories.gpu?.data || [];
        const realtimeList = metrics?.gpu?.values?.gpus || [];

        return (
           <div className="space-y-4 animate-in">
            {staticList.map((g: any, idx: number) => {
              const gname = `${g.vendor || ''} ${g.model || ''}`;
              const norm = (x: string) => String(x || '').toLowerCase().replace(/\(r\)|\(tm\)|graphics|corporation|nvidia|amd|ati|intel|radeon|geforce|[^a-z0-9]/g, '');
              const rt = realtimeList.find((r: any) => { const a = norm(r.name), b = norm(gname); return a && b && (a === b || a.includes(b) || b.includes(a)); }) || {};
              const utilVal = rt.utilization?.value;
              const tempVal = rt.temperature?.value;
              const vramUsedVal = rt.vramUsed?.value;

              return (
                <div key={idx} className="space-y-4">
                  <SectionBlock title={`Adaptador Gráfico ${idx+1}: ${g.vendor || ''} ${g.model || ''}`} icon={Monitor}>
                    <PropertyRow label="Uso de GPU" value={utilVal != null ? `${utilVal}%` : '--'} />
                    <div className="px-4 pb-3 border-b border-zinc-800/80">
                      <div className="w-full bg-zinc-800 rounded-full h-[3px] overflow-hidden">
                        <div className="bg-blue-400 h-full transition-all" style={{ width: `${utilVal || 0}%` }}></div>
                      </div>
                    </div>
                    <PropertyRow label="Temperatura da GPU" value={tempVal != null ? `${tempVal}°C` : '--'} status={rt.temperature?.status} />
                    <PropertyRow label="VRAM Usada" value={vramUsedVal != null ? `${vramUsedVal} MB` : '--'} status={rt.vramUsed?.status} />
                    <PropertyRow label="VRAM Total (Dedicada)" value={rt.vramTotal?.value != null ? `${rt.vramTotal.value} MB` : g.vram ? `${g.vram} MB` : '--'} />
                  </SectionBlock>

                  <SectionBlock title="Arquitetura & Detalhes do Driver" icon={ShieldCheck}>
                    <PropertyRow label="Versão do Driver" value={g.driverVersion || '--'} />
                    <PropertyRow label="Data do Driver" value={g.driverDate || '--'} />
                    <PropertyRow label="Processador de Vídeo" value={g.videoProcessor || '--'} />
                    <PropertyRow label="ID de Arquitetura (WMI)" value={g.architecture || '--'} />
                    <PropertyRow label="Interface de Barramento" value={g.bus || '--'} />
                    <PropertyRow label="Sub-Device ID" value={g.subDeviceId || '--'} />
                    <PropertyRow label="Taxa de Atualização Atual" value={g.refreshRate ? `${g.refreshRate} Hz` : '--'} />
                  </SectionBlock>
                </div>
              );
            })}
            {staticList.length === 0 && <p className="text-[12.5px] text-zinc-500 py-6">Nenhum adaptador gráfico detectado.</p>}
          </div>
        );
      }

      case 'temps': {
        const probes = metrics?.temps?.values?.probes || [];
        const mainTemp = metrics?.temps?.values?.main;
        const cpuTempUnavailable = !mainTemp || mainTemp.availability !== 'available' || mainTemp.value == null;

        const categoriesGroup: Record<string, { title: string; icon: any; items: any[] }> = {
          cpu: { title: 'Processador', icon: Cpu, items: [] },
          gpu: { title: 'Placa de Vídeo', icon: Monitor, items: [] },
          storage: { title: 'Armazenamento', icon: HardDrive, items: [] },
          system: { title: 'Placa-Mãe & Sistema', icon: Server, items: [] }
        };

        probes.forEach((p: any) => {
          const cat = p.category || 'system';
          if (categoriesGroup[cat]) {
            categoriesGroup[cat].items.push(p);
          } else {
            categoriesGroup['system'].items.push(p);
          }
        });

        const getTempStyle = (sensor: any) => {
          const status = sensor?.status || 'OK';

          if (status === 'Critical') {
            return { text: 'text-red-300', bar: 'bg-red-400', label: t('monitor.temps.critical', 'Crítico'), labelTone: 'text-red-300' };
          }
          if (status === 'Hot') {
            return { text: 'text-amber-300', bar: 'bg-amber-400', label: t('monitor.temps.warm', 'Quente'), labelTone: 'text-amber-300' };
          }
          return { text: 'text-zinc-50', bar: 'bg-blue-400', label: t('monitor.temps.optimal', 'Ótimo'), labelTone: 'text-zinc-500' };
        };

        const primaryGpu = metrics?.gpu?.values?.gpus?.[0];
        const gpuTempObj = probes.find((p: any) => p.category === 'gpu')?.temperature;
        const gpuStyle = getTempStyle(gpuTempObj);

        return (
          <div className="space-y-6 animate-in">
            {cpuTempUnavailable && (
              <div role="note" className="rounded-lg border border-amber-500/25 bg-amber-500/[0.04] px-4 py-3 flex items-start gap-3">
                <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[12.5px] font-medium text-amber-200">
                    {t('monitor.temps.unavailableTitle', 'Temperatura da CPU indisponível')}
                  </p>
                  <p className="dh-help mt-1 max-w-[75ch]">
                    {t('monitor.temps.unavailableDesc2', 'O Windows não expõe a temperatura do processador nesta placa-mãe. Ative os sensores avançados abaixo e instale o driver PawnIO para ler o sensor de cada núcleo.')}
                  </p>
                </div>
              </div>
            )}

            {/* Primary readings */}
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-px rounded-xl border border-zinc-800/80 bg-zinc-800/70 overflow-hidden">
              <div className="bg-zinc-950 px-4 py-4 flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <dt className="flex items-center gap-1.5 text-[12px] text-zinc-500"><Cpu size={14} /> {t('monitor.temps.cpuPackage', 'CPU Package')}</dt>
                  <dd className="text-[11.5px] text-zinc-600 mt-1">{t('monitor.temps.cpuPackageDesc', 'Temperatura principal do processador')}</dd>
                </div>
                <dd className="text-right shrink-0">
                  <span className={`font-mono text-[28px] leading-none tabular-nums ${!cpuTempUnavailable ? getTempStyle(mainTemp).text : 'text-zinc-600'}`}>
                    {!cpuTempUnavailable ? <>{mainTemp.value.toFixed(1)}<span className="text-[14px] text-zinc-500">°C</span></> : '--'}
                  </span>
                  <div className="text-[11px] text-zinc-500 mt-1.5">
                    {t('monitor.temps.source', 'Fonte')} <span className="font-mono text-zinc-400">{formatSource(mainTemp?.source)}</span>
                  </div>
                </dd>
              </div>

              <div className="bg-zinc-950 px-4 py-4 flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <dt className="flex items-center gap-1.5 text-[12px] text-zinc-500"><Monitor size={14} /> {t('monitor.temps.primaryGpu', 'GPU Primária')}</dt>
                  <dd className="text-[11.5px] text-zinc-600 mt-1 truncate">{primaryGpu?.name || 'Placa de Vídeo'}</dd>
                </div>
                <dd className="text-right shrink-0">
                  {gpuTempObj?.availability === 'available' ? (
                    <>
                      <span className={`font-mono text-[28px] leading-none tabular-nums ${gpuStyle.text}`}>
                        {gpuTempObj.value != null ? <>{gpuTempObj.value.toFixed(1)}<span className="text-[14px] text-zinc-500">°C</span></> : '--'}
                      </span>
                      <div className="text-[11px] text-zinc-500 mt-1.5">
                        {t('monitor.temps.source', 'Fonte')} <span className="font-mono text-zinc-400">{formatSource(gpuTempObj.source)}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="block text-[13px] text-zinc-500">
                        {gpuTempObj?.availability === 'unsupported' ? 'Sem sensor' : 'Indisponível'}
                      </span>
                      <div className="text-[11px] text-zinc-500 mt-1">{t('monitor.temps.gpuNoSensor', 'Ative os sensores avançados')}</div>
                    </>
                  )}
                </dd>
              </div>
            </dl>

            <AdvancedSensorsPanel values={metrics?.temps?.values} gpuProbe={probes.find((p: any) => p.category === 'gpu')} />

            {/* Probe list categorized */}
            {probes.length === 0 ? (
              <p className="text-[12.5px] text-zinc-500">Nenhuma sonda de temperatura reportada ainda.</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {Object.entries(categoriesGroup).map(([key, cat]) => {
                  if (cat.items.length === 0) return null;
                  const Icon = cat.icon;
                  return (
                    <section key={key} className="dh-card overflow-hidden">
                      <div className="flex items-center gap-2 px-4 h-10 border-b border-zinc-800/80">
                        <Icon size={14} className="text-zinc-500" />
                        <h3 className="dh-section-title">{cat.title}</h3>
                        <span className="dh-tag ml-auto">{cat.items.length}</span>
                      </div>

                      <ul className="max-h-[300px] overflow-y-auto custom-scrollbar divide-y divide-zinc-800/80">
                        {cat.items.map((item: any, idx: number) => {
                          const tempObj = item.temperature;
                          const style = getTempStyle(tempObj);
                          const val = tempObj?.value;
                          const available = tempObj?.availability === 'available' && val != null;

                          return (
                            <li key={idx} className="px-4 py-2.5 hover:bg-zinc-900/60 transition-colors">
                              <div className="flex justify-between items-center gap-3">
                                <span className="text-[12.5px] text-zinc-200 truncate" title={item.name}>
                                  {item.name}
                                </span>
                                <div className="flex items-baseline gap-2 shrink-0">
                                  {available ? (
                                    <>
                                      <span className={`text-[11px] ${style.labelTone}`}>{style.label}</span>
                                      <span className={`font-mono text-[13px] tabular-nums ${style.text}`}>
                                        {val.toFixed(1)}<span className="text-zinc-500">°C</span>
                                      </span>
                                    </>
                                  ) : tempObj?.availability === 'loading' ? (
                                    <Skel className="h-3 w-12" />
                                  ) : tempObj?.availability === 'error' ? (
                                    <span className="text-[11.5px] text-red-400">Erro</span>
                                  ) : (
                                    <span className="text-[11.5px] text-zinc-600">Não disponível</span>
                                  )}
                                </div>
                              </div>

                              {available && (
                                <div className="mt-1.5 w-full bg-zinc-800 h-[3px] rounded-full overflow-hidden">
                                  <div
                                    className={`h-full ${style.bar} transition-all duration-500 rounded-full`}
                                    style={{ width: `${Math.min(100, Math.max(5, (val / 100) * 100))}%` }}
                                  />
                                </div>
                              )}

                              <div className="flex justify-between gap-3 text-[10.5px] text-zinc-600 mt-1.5">
                                <span>
                                  {t('monitor.temps.quality', 'Qualidade')}: {tempObj?.quality === 'high' ? t('monitor.temps.high', 'Alta') : tempObj?.quality === 'medium' ? t('monitor.temps.medium', 'Média') : tempObj?.quality === 'low' ? t('monitor.temps.low', 'Baixa (zona ACPI, não o sensor do núcleo)') : t('monitor.temps.none', 'Nenhuma')}
                                </span>
                                <span className="font-mono truncate">{formatSource(tempObj?.source)}</span>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        );
      }

      case 'procs': {
        const topCpu = metrics?.procs?.values?.topCpu || [];
        const filteredCpu = topCpu.filter((p: any) => p.name.toLowerCase().includes(procSearch.toLowerCase()));

        return (
          <div className="space-y-4 animate-in">
            <input
              type="search"
              placeholder={t('monitor.procs.search', 'Buscar processo...')}
              value={procSearch}
              onChange={e => setProcSearch(e.target.value)}
              className="dh-input w-full"
            />

            <SectionBlock title={t('monitor.procs.topCpu', 'Top Processos (Por CPU)')} icon={Activity}>
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px] text-left">
                  <thead className="text-[11px] text-zinc-500 border-b border-zinc-800/80">
                    <tr>
                      <th className="px-4 h-8 font-normal">{t('monitor.procs.name', 'Nome')}</th>
                      <th className="px-4 h-8 font-normal text-right">{t('monitor.procs.pid', 'PID')}</th>
                      <th className="px-4 h-8 font-normal text-right">{t('monitor.procs.cpu', 'CPU %')}</th>
                      <th className="px-4 h-8 font-normal text-right">{t('monitor.procs.ram', 'RAM')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {filteredCpu.map((p: any) => (
                      <tr key={p.pid} className="hover:bg-zinc-900/60">
                        <td className="px-4 py-2 text-zinc-200">{p.name}</td>
                        <td className="px-4 py-2 text-zinc-500 font-mono text-right">{p.pid}</td>
                        <td className={`px-4 py-2 font-mono text-right tabular-nums ${toneFor(p.cpu, 50, 85)}`}>{toFixedSafe(p.cpu, 1)}<span className="text-zinc-500">%</span></td>
                        <td className="px-4 py-2 text-zinc-300 font-mono text-right">{formatBytes(p.memRss)}</td>
                      </tr>
                    ))}
                    {filteredCpu.length === 0 && (procSearch ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">
                          Nenhum processo correspondente encontrado.
                        </td>
                      </tr>
                    ) : Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} aria-hidden="true">
                        <td className="px-4 py-2.5"><Skel className="h-2.5 w-40" /></td>
                        <td className="px-4 py-2.5 text-right"><Skel className="h-2.5 w-10" /></td>
                        <td className="px-4 py-2.5 text-right"><Skel className="h-2.5 w-10" /></td>
                        <td className="px-4 py-2.5 text-right"><Skel className="h-2.5 w-14" /></td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            </SectionBlock>
          </div>
        );
      }

      case 'storage': {
        if (loadingMap['storage'] && !categories['storage']) return renderTabLoadingState();
        if (errorMap['storage']) return renderTabErrorState('storage');

        const list = categories.storage?.data || [];
        const io = metrics?.diskIo?.values || {};
        return (
          <div className="space-y-4 animate-in">
             <SectionBlock title="Atividade Global de Discos" icon={Activity}>
              <PropertyRow label="Leitura Direta" value={io.readBps?.value != null ? `${formatBytes(io.readBps.value)}/s` : '--'} />
              <PropertyRow label="Escrita Direta" value={io.writeBps?.value != null ? `${formatBytes(io.writeBps.value)}/s` : '--'} />
              <PropertyRow label="Tempo ativo (como no Gerenciador de Tarefas)" value={io.activity?.value != null ? `${io.activity.value}%` : '--'} />
            </SectionBlock>

            {list.map((d: any, idx: number) => (
              <SectionBlock key={idx} title={`Disco: ${d.name || d.device}`} icon={HardDrive}>
                <PropertyRow label="Tipo / Interface" value={`${d.type || 'N/A'} - ${d.interfaceType || 'N/A'}`} />
                <PropertyRow label="Capacidade Bruta" value={formatBytes(d.size)} />
                <PropertyRow label="Status SMART Global" value={d.smartStatus || '--'} status={String(d.smartStatus || '').toLowerCase() === 'ok' ? 'OK' : undefined} />
                <PropertyRow label="Desgaste Físico (Wear Level)" value={d.wearLevel != null ? `${d.wearLevel}%` : 'N/A'} />
                <PropertyRow label="Temperatura do Disco" value={d.temperature != null ? `${d.temperature}°C` : '--'} />
              </SectionBlock>
            ))}
          </div>
        );
      }

      case 'monitors': {
         if (loadingMap['monitors'] && !categories['monitors']) return renderTabLoadingState();
         if (errorMap['monitors']) return renderTabErrorState('monitors');

         const list = categories.monitors?.data || [];
         return (
           <div className="space-y-4 animate-in">
             {list.map((m: any, idx: number) => (
               <SectionBlock key={idx} title={`Monitor ${idx+1}: ${m.model || m.vendor || 'Desconhecido'}`} icon={Monitor}>
                 <PropertyRow label="Principal" value={m.main ? 'Sim' : 'Não'} />
                 <PropertyRow label="Resolução Nativa" value={`${m.resolutionx}x${m.resolutiony}`} />
                 <PropertyRow label="Resolução Atual" value={`${m.currentResX}x${m.currentResY}`} />
                 <PropertyRow label="Taxa de Atualização" value={m.currentRefreshRate ? `${m.currentRefreshRate} Hz` : '--'} />
                 <PropertyRow label="Conexão" value={m.connection || '--'} />
               </SectionBlock>
             ))}
             {list.length === 0 && <p className="text-[12.5px] text-zinc-500 py-6">Nenhum monitor detectado via systeminformation.</p>}
           </div>
         );
      }

      case 'mobo': {
        if (loadingMap['mobo'] && !categories['mobo']) return renderTabLoadingState();
        if (errorMap['mobo']) return renderTabErrorState('mobo');

        const d = (categories.mobo || categories.mainboard)?.data || {};
        return (
          <div className="space-y-4 animate-in">
            <SectionBlock title="Placa Principal (Baseboard)" icon={LayoutTemplate}>
              <PropertyRow label="Fabricante" value={d.manufacturer || '--'} />
              <PropertyRow label="Modelo" value={d.model || '--'} />
              <PropertyRow label="Revisão (Versão)" value={d.version || '--'} />
              <PropertyRow label="Número de Série" value={d.serial || '--'} />
            </SectionBlock>
            <SectionBlock title="Firmware (BIOS/UEFI)" icon={CpuIcon}>
              <PropertyRow label="Fornecedor da BIOS" value={d.biosVendor || '--'} />
              <PropertyRow label="Versão da BIOS" value={d.biosVersion || '--'} />
              <PropertyRow label="Data de Lançamento" value={d.biosReleaseDate || '--'} />
            </SectionBlock>
          </div>
        );
      }

      case 'network': {
        if (loadingMap['network'] && !categories['network']) return renderTabLoadingState();
        if (errorMap['network']) return renderTabErrorState('network');

        const rawList = categories.network?.data || [];
        const physicalList = rawList.filter((n: any) => !isVirtualNet(n));
        const displayList = filterVirtualNet ? physicalList : rawList;
        const hiddenCount = rawList.length - physicalList.length;
        const r = metrics?.network?.values || {};

        return (
          <div className="space-y-4 animate-in">
            <SectionBlock title="Tráfego Consolidado" icon={Activity}>
              <PropertyRow label="Banda de Download" value={r.rxBps?.value != null ? `${formatBytes(r.rxBps.value)}/s` : '--'} />
              <PropertyRow label="Banda de Upload" value={r.txBps?.value != null ? `${formatBytes(r.txBps.value)}/s` : '--'} />
            </SectionBlock>

            {/* Filter Bar */}
            <div className="flex items-center justify-between gap-3 px-1">
              <div className="flex items-center gap-2">
                <Filter size={14} className="text-zinc-500" />
                <span className="text-[12.5px] text-zinc-300">
                  {t('monitor.network.filterLabel', 'Filtro de Adaptadores')}
                </span>
                {hiddenCount > 0 && filterVirtualNet && (
                  <span className="dh-tag">
                    {hiddenCount} {t('monitor.network.virtualHidden', 'virtuais ocultos')}
                  </span>
                )}
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-[12.5px] text-zinc-400 hover:text-zinc-200">
                <input
                  type="checkbox"
                  checked={filterVirtualNet}
                  onChange={e => setFilterVirtualNet(e.target.checked)}
                />
                <span>{t('monitor.network.filterVirtual', 'Apenas Físicos')}</span>
              </label>
            </div>

            {displayList.map((n: any, idx: number) => {
              const isVirt = isVirtualNet(n);
              return (
                <SectionBlock key={idx} title={`Adaptador: ${n.ifaceName || n.iface}`} icon={Wifi}>
                  <PropertyRow label="Classificação" value={isVirt ? t('monitor.network.virtualTag', 'Virtual / VPN') : t('monitor.network.physicalTag', 'Físico')} />
                  <PropertyRow label="Status da Camada (Link)" value={n.operstate === 'down' ? 'Desconectado' : n.speed ? `${n.speed} Mbps` : '--'} status={n.operstate !== 'down' && n.speed ? 'OK' : undefined} />
                  <PropertyRow label="Tipo de Adaptador" value={n.type || '--'} />
                  <PropertyRow label="Endereço IPv4" value={n.ip4 || '--'} />
                  <PropertyRow label="Endereço MAC" value={n.mac || '--'} />
                </SectionBlock>
              );
            })}
            {displayList.length === 0 && (
              <p className="text-[12.5px] text-zinc-500 py-6 text-center">
                Nenhum adaptador encontrado com os filtros atuais.
              </p>
            )}
          </div>
        );
      }

      case 'os': {
        if (loadingMap['os'] && !categories['os']) return renderTabLoadingState();
        if (errorMap['os']) return renderTabErrorState('os');

        const d = categories.os?.data || {};
        const win = d.windowsDetails || {};
        return (
          <div className="space-y-4 animate-in">
            <SectionBlock title="Núcleo do Sistema" icon={FileDigit}>
              <PropertyRow label="Plataforma Base" value={`${d.platform || ''} (${d.arch || ''})`} />
              <PropertyRow label="Distribuição" value={d.distro || '--'} />
              <PropertyRow label="Lançamento (Kernel/Core)" value={d.release || '--'} />
            </SectionBlock>
            {Object.keys(win).length > 0 && (
              <SectionBlock title="Detalhes do Registro do Windows" icon={LayoutTemplate}>
                <PropertyRow label="Versão de Exibição" value={win.DisplayVersion || '--'} />
                <PropertyRow label="Build Principal" value={win.CurrentBuildNumber || d.build || '--'} />
                <PropertyRow label="Revisão (UBR)" value={win.UBR || '--'} />
              </SectionBlock>
            )}
          </div>
        );
      }

      case 'sensors': {
        const lhm = metrics?.temps?.values?.lhm;
        return (
          <div className="space-y-6 animate-in">
            {lhm ? <LhmSensorTree lhm={lhm} /> : (
              <>
                <p className="dh-help max-w-[75ch]">{t('monitor.lhm.off', 'A lista completa (tensões, temperaturas, potência, clocks, uso, ventoinhas e SMART de cada componente) vem dos sensores avançados. Ative-os abaixo.')}</p>
                <AdvancedSensorsPanel values={metrics?.temps?.values} />
              </>
            )}
          </div>
        );
      }

      case 'latency': {
        const r = metrics?.latency?.values || {};
        const drivers = r.drivers || [];
        const filteredDrivers = drivers.filter((d: any) =>
          (d.Name?.toLowerCase().includes(driverSearch.toLowerCase()) ||
           d.DisplayName?.toLowerCase().includes(driverSearch.toLowerCase()))
        );

        const dpcVal = r.dpcsQueued?.value;
        const intVal = r.interrupts?.value;

        let statusText = 'Lendo sensores...';
        let statusColor = 'text-zinc-400 border-zinc-800/80';
        let statusBg = 'bg-zinc-900/40';
        let statusDesc = 'O WMI Daemon está iniciando a telemetria do kernel.';

        if (dpcVal != null) {
          if (dpcVal < 5000) {
            statusText = 'Excelente (Latência Ultra-baixa)';
            statusColor = 'text-emerald-300 border-emerald-500/25';
            statusBg = 'bg-emerald-500/[0.04]';
            statusDesc = 'O sistema operacional está processando as chamadas DPC do kernel de forma extremamente rápida. Configuração ideal para jogos competitivos sem micro-engasgos (stuttering) e produção de áudio em tempo real.';
          } else if (dpcVal < 15000) {
            statusText = 'Moderado (Atividade Normal)';
            statusColor = 'text-amber-300 border-amber-500/25';
            statusBg = 'bg-amber-500/[0.04]';
            statusDesc = 'Há uma carga de trabalho típica do Windows no kernel. Isso é perfeitamente seguro e esperado para tarefas diárias. Para jogadores de eSports de altíssimo nível, pode introduzir pequenas latências de frametime.';
          } else {
            statusText = 'Alto Jitter (Sobrecarga de Interrupção)';
            statusColor = 'text-red-300 border-red-500/25';
            statusBg = 'bg-red-500/[0.04]';
            statusDesc = 'Indicador de gargalo de latência! Uma taxa elevada de DPCs/s pode induzir micro-travamentos repentinos nos jogos ou estalos no som (audio crackling). Considere verificar e atualizar os drivers de placa gráfica, adaptadores de rede ou desativar periféricos USB não utilizados.';
          }
        }

        return (
          <div className="space-y-4 animate-in">
            <div role="status" className={`px-4 py-3.5 rounded-xl border ${statusColor} ${statusBg} transition-colors duration-200`}>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 min-w-0">
                  <Clock size={15} className="shrink-0" />
                  <h2 className="dh-section-title">Status de Resposta do Kernel</h2>
                </div>
                <span className="font-mono text-[18px] leading-none text-zinc-50 tabular-nums shrink-0">
                  {dpcVal != null ? <>{dpcVal.toLocaleString()}<span className="text-[12px] text-zinc-500"> DPC/s</span></> : <Skel className="h-4 w-20" />}
                </span>
              </div>
              <p className="text-[12.5px] font-medium mt-2">{statusText}</p>
              <p className="dh-help mt-1 max-w-[75ch]">{statusDesc}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SectionBlock title="Telemetria de DPC" icon={Activity}>
                <PropertyRow label="DPCs Enfileirados" value={dpcVal != null ? `${dpcVal.toLocaleString()} /s` : '--'} />
                <PropertyRow label="Tempo Gasto com DPC" value={r.percentDpc?.value != null ? `${r.percentDpc.value}%` : '--'} />
                {dpcHistory.length > 1 && (
                  <div className="px-4 pt-3 pb-3 border-t border-zinc-800/80">
                    <p className="text-[11px] text-zinc-500 mb-2">Histórico de DPCs/s (Últimos 60s)</p>
                    <div className="h-14 flex items-end">
                      <Sparkline data={dpcHistory} min={0} max={25000} color="var(--color-blue-400)" strokeWidth={1.25} />
                    </div>
                  </div>
                )}
              </SectionBlock>

              <SectionBlock title="Telemetria de Interrupções (ISR)" icon={Cpu}>
                <PropertyRow label="Interrupções de Hardware" value={intVal != null ? `${intVal.toLocaleString()} /s` : '--'} />
                <PropertyRow label="Tempo Gasto com ISR" value={r.percentInt?.value != null ? `${r.percentInt.value}%` : '--'} />
              </SectionBlock>
            </div>

            <SectionBlock title={`Drivers de Kernel Ativos (${filteredDrivers.length} / ${drivers.length})`} icon={List}>
              <div className="px-4 py-3">
                <input
                  type="search"
                  placeholder="Pesquisar por driver (ex: amdkmdag, nvlddmkm)..."
                  value={driverSearch}
                  onChange={(e) => setDriverSearch(e.target.value)}
                  className="dh-input w-full"
                />
              </div>
              <div className="max-h-80 overflow-y-auto custom-scrollbar border-t border-zinc-800/80">
                <table className="w-full text-left border-collapse text-[12px]">
                  <thead>
                    <tr className="border-b border-zinc-800/80 bg-zinc-900 text-[11px] text-zinc-500 sticky top-0">
                      <th className="px-4 h-8 font-normal">Nome</th>
                      <th className="px-4 h-8 font-normal">Descrição (Display Name)</th>
                      <th className="px-4 h-8 font-normal">Caminho (.sys)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {filteredDrivers.map((d: any, idx: number) => (
                      <tr key={idx} className="hover:bg-zinc-900/60 transition-colors">
                        <td className="px-4 py-2 font-mono text-zinc-100">{d.Name}</td>
                        <td className="px-4 py-2 text-zinc-400">{d.DisplayName || '--'}</td>
                        <td className="px-4 py-2 font-mono text-zinc-500 break-all">{d.PathName || '--'}</td>
                      </tr>
                    ))}
                    {filteredDrivers.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-center text-zinc-500">
                          {drivers.length === 0 && !driverSearch ? 'Lendo drivers de kernel...' : 'Nenhum driver ativo correspondente.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </SectionBlock>

            <div className="px-1 text-[12.5px] leading-relaxed space-y-2 text-zinc-400 max-w-[75ch]">
              <h3 className="dh-section-title">O que é DPC e ISR?</h3>
              <p>
                Quando um dispositivo físico (como placa de som, placa de rede ou placa de vídeo) precisa de atenção, ele envia uma <strong>Interrupção de Hardware (ISR)</strong> para o processador, que pausa instantaneamente o que está fazendo para atendê-lo.
              </p>
              <p>
                Como as ISRs devem ser curtíssimas, tarefas mais pesadas de processamento secundário são enfileiradas como <strong>DPC (Deferred Procedure Call)</strong>. Se um driver mal programado demorar muito tempo para liberar o controle, a fila de DPCs se acumula, fazendo com que o processador demore para responder a outras tarefas. Isso gera latência perceptível nos jogos e estalos de som.
              </p>
              <p className="text-zinc-300">
                <strong className="font-medium text-zinc-100">Dica:</strong> Em sistemas Windows normais, picos esporádicos são comuns. Mas se a taxa se mantiver muito alta constantemente, recomenda-se desinstalar drivers de rede antigos, atualizar o driver da GPU utilizando ferramentas de instalação limpa (DDU) ou atualizar a BIOS da placa-mãe.
              </p>
            </div>
          </div>
        );
      }
    }
  };

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col relative">
      {/* Toast Alert Banner */}
      {toast && (
        <div role="status" className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 max-w-sm px-3.5 py-2.5 rounded-lg border bg-zinc-900 dh-raised shadow-2xl animate-in slide-in-from-bottom-2 ${
          toast.type === 'error' ? 'border-red-500/40' : 'border-zinc-800'
        }`}>
          {toast.type === 'error' ? <AlertTriangle size={15} className="text-red-400 shrink-0" /> : <CheckCircle2 size={15} className={`${toast.type === 'success' ? 'text-emerald-400' : 'text-zinc-400'} shrink-0`} />}
          <span className={`text-[12.5px] ${toast.type === 'error' ? 'text-red-200' : 'text-zinc-200'}`}>{toast.message}</span>
        </div>
      )}

      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            {t('monitor.title', 'Monitor de Sistema')}
            <HelpTip
              title={t('monitor.helpTitle', 'Sobre o Hardware Inspector')}
              description={t('monitor.helpDesc', 'Plataforma avançada de diagnóstico de hardware modular com coletas de WMI, nvidia-smi e polling de kernel nativo.')}
              sections={[]}
              buttonLabel="Entendi"
            />
          </span>
        }
        subtitle={t('monitor.subtitle', 'Varredura profunda do sistema ao Ring-0.')}
        actions={(
          <button type="button" className="dh-btn dh-btn-sm" onClick={() => void window.darkhub?.overlay?.show({})} title={t('monitor.overlayHelp', 'Mostra estes sensores por cima do jogo (Ctrl+Shift+F9)')}>
            <Layers size={14} />{t('monitor.overlay', 'Mostrar no jogo')}
          </button>
        )}
      />

      <div className="flex flex-col md:flex-row gap-6 flex-1 min-h-0">
        {renderTabs()}

        <div className="flex-1 min-w-0 overflow-y-auto pr-1 custom-scrollbar">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default SystemMonitor;
