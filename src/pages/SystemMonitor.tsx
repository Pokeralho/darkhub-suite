import React, { useState, useMemo, useEffect } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import {
  Cpu, Server, HardDrive, Network, Monitor, Zap,
  RefreshCw, AlertTriangle, PlaySquare, ShieldCheck,
  CheckCircle2, LayoutTemplate, Wifi, FileDigit, CpuIcon, Activity, List, Thermometer, Copy, Clock,
  Loader2, Filter
} from 'lucide-react';
import { useSystemMetrics } from '../hooks/useSystemMetrics';
import { useDeepHardware } from '../hooks/useDeepHardware';
import { HelpTip } from '../components/HelpTip';
import { Sparkline } from '../components/library/Sparkline';
import { useSensorHistory } from '../hooks/useSensorHistory';

const formatBytes = (bytes: number | null | undefined) => {
  if (bytes == null || isNaN(bytes)) return '—';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const PropertyRow = ({ label, value, status }: { label: string; value: React.ReactNode; status?: string }) => (
  <div className="flex justify-between items-center py-2.5 border-b border-zinc-800/80 last:border-0 hover:bg-zinc-800/30 px-3 rounded transition-colors group">
    <span className="text-sm text-zinc-400 group-hover:text-zinc-300">{label}</span>
    <div className="flex items-center gap-2">
      {status === 'Error' && <span title="Falha ao ler sensor"><AlertTriangle size={14} className="text-amber-500" /></span>}
      {status === 'OK' && <CheckCircle2 size={14} className="text-emerald-500" />}
      <span className="text-sm font-medium text-zinc-200">{value ?? '—'}</span>
    </div>
  </div>
);

const Gauge = React.memo(({ label, value, unit, history, color = "#3b82f6" }: any) => {
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
    <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex flex-col gap-2 shadow-sm">
      <div className="flex justify-between items-end">
        <span className="text-zinc-400 text-sm font-medium">{label}</span>
        <span className="text-2xl font-bold text-white tracking-tighter">
          {value != null ? value : '-'}
          <span className="text-sm text-zinc-500 ml-1">{unit}</span>
        </span>
      </div>
      <div className="h-10 mt-1">
        <Sparkline data={history} min={0} max={100} color={color} />
      </div>
      <div className="flex justify-between items-center text-[10px] text-zinc-500 pt-2 border-t border-zinc-800/80 font-mono">
        <span>{t('monitor.stats.min', 'Mín')}: <strong className="text-zinc-300 font-semibold">{stats.min != null ? `${stats.min}${unit}` : '--'}</strong></span>
        <span>{t('monitor.stats.avg', 'Média')}: <strong className="text-zinc-300 font-semibold">{stats.avg != null ? `${stats.avg}${unit}` : '--'}</strong></span>
        <span>{t('monitor.stats.max', 'Máx')}: <strong className="text-zinc-300 font-semibold">{stats.max != null ? `${stats.max}${unit}` : '--'}</strong></span>
      </div>
    </div>
  );
});

const SectionBlock = ({ title, children, icon: Icon }: { title: string; children: React.ReactNode; icon?: any }) => (
  <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-6 shadow-sm">
    <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-950 flex items-center gap-2">
      {Icon && <Icon size={16} className="text-blue-400" />}
      <h3 className="font-semibold text-zinc-200">{title}</h3>
    </div>
    <div className="p-1">
      {children}
    </div>
  </div>
);

type TabType = 'overview' | 'cpu' | 'ram' | 'gpu' | 'mobo' | 'storage' | 'network' | 'temps' | 'procs' | 'monitors' | 'os' | 'latency';

const toFixedSafe = (v: any, d: number = 1) => {
  if (v == null || typeof v !== 'number' || isNaN(v)) return undefined;
  return v.toFixed(d);
};

const formatSource = (source?: string) => {
  if (!source) return 'ACPI / Windows';
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

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(prev => (prev?.message === message ? null : prev));
    }, 4000);
  };

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

  // Enable process polling only when procs tab is open
  useEffect(() => {
    if (activeTab === 'procs') {
      window.darkhub?.system?.enableProcessTracking?.(true);
    } else {
      window.darkhub?.system?.enableProcessTracking?.(false);
    }
    return () => {
      window.darkhub?.system?.enableProcessTracking?.(false);
    };
  }, [activeTab]);

  // DarkHub resource usage polling on overview tab
  useEffect(() => {
    if (activeTab !== 'overview') return;

    let mounted = true;
    const fetchUsage = async () => {
      try {
        const usage = await window.darkhub?.app?.getResourceUsage?.();
        if (mounted && usage?.ok) {
          setDarkhubUsage({
            totalCpuPercent: usage.totalCpuPercent,
            totalWorkingSetMb: usage.totalWorkingSetMb,
            processes: usage.processes || []
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
  }, [activeTab]);

  const cpuLoadHistory = useSensorHistory(metrics?.cpu?.values?.currentLoad?.value, 60);
  const ramUseHistory = useSensorHistory(metrics?.ram?.values?.percent?.value, 60);
  const gpuUtilHistory = useSensorHistory(metrics?.gpu?.values?.gpus?.[0]?.utilization?.value, 60);
  const diskActHistory = useSensorHistory(metrics?.diskIo?.values?.activity?.value, 60);
  const tempHistory = useSensorHistory(metrics?.temps?.values?.main?.value, 60);
  const dpcHistory = useSensorHistory(metrics?.latency?.values?.dpcsQueued?.value, 60);

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
      { id: 'latency', icon: Clock, label: t('monitor.tab.latency', 'Latência DPC/ISR') },
      { id: 'procs', icon: List, label: t('monitor.tab.procs', 'Processos') },
      { id: 'monitors', icon: LayoutTemplate, label: t('monitor.tab.displays', 'Monitores') },
      { id: 'mobo', icon: LayoutTemplate, label: t('monitor.tab.mobo', 'Placa-Mãe & BIOS') },
      { id: 'os', icon: FileDigit, label: t('monitor.tab.os', 'Sistema Operacional') }
    ];

    return (
      <div className="flex flex-col gap-2 w-full md:w-64 shrink-0 overflow-y-auto custom-scrollbar">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 border ${
              activeTab === tab.id
              ? 'bg-blue-600/10 text-blue-400 border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.1)]'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'
            }`}
          >
            <tab.icon size={18} className={activeTab === tab.id ? 'text-blue-400' : 'text-zinc-500'} />
            {tab.label}
          </button>
        ))}

        <div className="mt-4 pt-4 border-t border-zinc-800 space-y-3 pb-4">
          <button
            onClick={handleTabRefresh}
            disabled={isCurrentTabLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={isCurrentTabLoading ? 'animate-spin' : ''} />
            {t('monitor.refreshSensors', 'Atualizar')}
          </button>

          <button
            onClick={handleBenchmark}
            disabled={isBenchmarking}
            className="w-full py-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50 border border-blue-500/20"
          >
            {isBenchmarking ? <RefreshCw size={16} className="animate-spin" /> : <PlaySquare size={16} />}
            <span>{isBenchmarking ? t('monitor.running', 'Executando...') : t('monitor.runBenchmark', 'Executar Benchmark de CPU')}</span>
          </button>

          <button
            onClick={generateReport}
            className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors border border-zinc-700"
          >
            <Copy size={16} />
            {t('monitor.copyReport', 'Copiar Relatório')}
          </button>

          {benchmarkResult && (
            <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-lg text-center animate-in fade-in zoom-in">
              <p className="text-emerald-400 font-bold text-lg">{benchmarkResult.mops} <span className="text-xs">MOPS</span></p>
              <p className="text-zinc-500 text-[10px]">Tempo: {benchmarkResult.time}ms</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderTabLoadingState = () => (
    <div className="flex flex-col items-center justify-center h-64 text-zinc-400 space-y-3">
      <Loader2 className="animate-spin text-blue-500" size={32} />
      <p className="text-sm">{t('monitor.tabLoading', 'Carregando dados desta seção...')}</p>
    </div>
  );

  const renderTabErrorState = (tabKey: string) => (
    <div className="p-6 border border-amber-500/20 bg-amber-500/10 rounded-xl flex items-start gap-4">
      <AlertTriangle className="text-amber-500 shrink-0 mt-1" />
      <div>
        <h3 className="text-amber-200 font-semibold mb-1">{t('monitor.tabError', 'Falha ao obter dados desta seção')}</h3>
        <p className="text-amber-400/80 text-sm mb-4">{errorMap[tabKey] || 'O Windows não retornou os dados para esta categoria.'}</p>
        <button
          onClick={() => refreshCategory(tabKey)}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm"
        >
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
          <div className="space-y-6 animate-in fade-in duration-300">
            <div>
              <h2 className="text-xl font-semibold text-white mb-4">
                {t('monitor.overview.realtime', 'Painel de Sensores (Tempo Real)')}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Gauge label={t('monitor.gauge.cpuLoad', 'Carga da CPU')} value={toFixedSafe(metrics?.cpu?.values?.currentLoad?.value, 1)} unit="%" history={cpuLoadHistory} color="#3b82f6" />
                <Gauge label={t('monitor.gauge.ramUsage', 'Uso de RAM')} value={toFixedSafe(metrics?.ram?.values?.percent?.value, 1)} unit="%" history={ramUseHistory} color="#8b5cf6" />
                <Gauge label={t('monitor.gauge.gpuUtil', 'Uso da GPU')} value={toFixedSafe(metrics?.gpu?.values?.gpus?.[0]?.utilization?.value, 1)} unit="%" history={gpuUtilHistory} color="#10b981" />
                <Gauge label={t('monitor.gauge.diskAct', 'Atividade do Disco')} value={toFixedSafe(metrics?.diskIo?.values?.activity?.value, 1)} unit="%" history={diskActHistory} color="#f59e0b" />
                <Gauge label={t('monitor.gauge.cpuTemp', 'Temp. da CPU')} value={toFixedSafe(metrics?.temps?.values?.main?.value, 0)} unit="°C" history={tempHistory} color="#ef4444" />
              </div>
            </div>

            {/* Compact Per-Core CPU Preview */}
            {cores.length > 0 && (
              <SectionBlock title="Distribuição de Carga por Núcleo" icon={Zap}>
                <div className="p-3 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                  {cores.map((core: any, idx: number) => {
                    const val = core?.value ?? 0;
                    const barColor = val > 80 ? 'bg-rose-500' : val > 50 ? 'bg-amber-500' : 'bg-blue-500';
                    return (
                      <div key={idx} className="bg-zinc-950 p-2 rounded-lg border border-zinc-800 flex flex-col justify-between">
                        <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                          <span>C{idx}</span>
                          <span className="font-mono text-zinc-200">{toFixedSafe(val, 0)}%</span>
                        </div>
                        <div className="w-full bg-zinc-800 rounded-full h-1 overflow-hidden">
                          <div className={`${barColor} h-full transition-all duration-300`} style={{ width: `${Math.min(100, Math.max(3, val))}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SectionBlock>
            )}

            {/* DarkHub Suite Self-Consumption Card */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-zinc-100 text-sm">
                      {t('monitor.darkhubUsage.title', 'Consumo do DarkHub Suite')}
                    </h3>
                    <p className="text-xs text-zinc-500">
                      {t('monitor.darkhubUsage.desc', 'Pegada de recursos em tempo real do próprio aplicativo')}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-mono uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded">
                  Otimizado
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                  <span className="text-xs text-zinc-400">{t('monitor.darkhubUsage.cpu', 'Uso de CPU')}</span>
                  <div className="text-xl font-bold text-blue-400 mt-1">
                    {darkhubUsage ? `${darkhubUsage.totalCpuPercent}%` : '--'}
                  </div>
                  <span className="text-[10px] text-zinc-500">
                    {t('monitor.darkhubUsage.cpuHint', 'Threads de renderização e main')}
                  </span>
                </div>

                <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                  <span className="text-xs text-zinc-400">{t('monitor.darkhubUsage.ram', 'Memória RAM')}</span>
                  <div className="text-xl font-bold text-purple-400 mt-1">
                    {darkhubUsage ? `${darkhubUsage.totalWorkingSetMb} MB` : '--'}
                  </div>
                  <span className="text-[10px] text-zinc-500">
                    {t('monitor.darkhubUsage.ramHint', 'Working Set (processos somados)')}
                  </span>
                </div>

                <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                  <span className="text-xs text-zinc-400">{t('monitor.darkhubUsage.procs', 'Processos Ativos')}</span>
                  <div className="text-xl font-bold text-emerald-400 mt-1">
                    {darkhubUsage ? `${darkhubUsage.processes.length}` : '--'}
                  </div>
                  <span className="text-[10px] text-zinc-500">
                    {t('monitor.darkhubUsage.procsHint', 'Main, Renderer & GPU')}
                  </span>
                </div>
              </div>

              {darkhubUsage && darkhubUsage.processes.length > 0 && (
                <div className="pt-2 border-t border-zinc-800/60">
                  <div className="text-[11px] font-medium text-zinc-400 mb-2">
                    {t('monitor.darkhubUsage.internalProcs', 'Processos Internos:')}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {darkhubUsage.processes.map((p, idx) => (
                      <div key={idx} className="bg-zinc-950/60 px-2.5 py-1.5 rounded border border-zinc-800/60 flex items-center justify-between text-[11px]">
                        <span className="text-zinc-300 font-mono capitalize truncate mr-2" title={`${p.type} (${p.pid})`}>
                          {p.type || p.name || 'Process'} ({p.pid})
                        </span>
                        <span className="text-zinc-400 font-mono shrink-0">
                          {p.workingSetMb} MB • {p.cpuPercent}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      }

      case 'cpu': {
        if (loadingMap['cpu'] && !categories['cpu']) return renderTabLoadingState();
        if (errorMap['cpu']) return renderTabErrorState('cpu');

        const d = categories.cpu?.data || {};
        const r = metrics?.cpu?.values || {};

        return (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <SectionBlock title="Desempenho por Núcleo" icon={Zap}>
              <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-4">
                {r.coresLoad?.map((core: any, idx: number) => {
                  const val = core?.value ?? 0;
                  const barColor = val > 80 ? 'bg-rose-500' : val > 50 ? 'bg-amber-500' : 'bg-blue-500';
                  return (
                    <div key={idx} className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                      <div className="flex justify-between text-xs text-zinc-400 mb-2">
                        <span>Core {idx}</span>
                        <span className="font-mono text-zinc-200">{toFixedSafe(val, 1)}%</span>
                      </div>
                      <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                        <div className={`${barColor} h-full transition-all duration-300`} style={{ width: `${val}%` }} />
                      </div>
                    </div>
                  );
                })}
                {(!r.coresLoad || r.coresLoad.length === 0) && <p className="text-zinc-500 text-sm">Carregando dados dos núcleos...</p>}
              </div>
            </SectionBlock>

            <SectionBlock title="Topologia e Clocks" icon={CpuIcon}>
              <PropertyRow label="Modelo" value={`${d.manufacturer ?? ''} ${d.brand ?? ''}`} />
              <PropertyRow label="Família / Model / Stepping" value={`${d.family ?? '—'} / ${d.model ?? '—'} / ${d.stepping ?? '—'}`} />
              <PropertyRow label="Soquete" value={d.socket} />
              <PropertyRow label="Núcleos (Threads)" value={`${d.physicalCores ?? '—'} Físicos / ${d.cores ?? '—'} Lógicos`} />
              <PropertyRow label="Frequência Base" value={d.speedBase ? `${d.speedBase} GHz` : '—'} />
              <PropertyRow label="Frequência Turbo Max" value={d.speedMax ? `${d.speedMax} GHz` : '—'} />
            </SectionBlock>

            <SectionBlock title="Hierarquia de Cache" icon={Server}>
              <PropertyRow label="Cache L1 (Dados + Instrução)" value={d.cache?.l1d ? formatBytes(d.cache.l1d + (d.cache.l1i || 0)) : '—'} />
              <PropertyRow label="Cache L2" value={d.cache?.l2 ? formatBytes(d.cache.l2) : '—'} />
              <PropertyRow label="Cache L3" value={d.cache?.l3 ? formatBytes(d.cache.l3) : '—'} />
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
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
             <SectionBlock title="Visão Geral de Memória" icon={Activity}>
              <PropertyRow label="Uso em Tempo Real" value={r.percent?.value != null ? `${toFixedSafe(r.percent.value, 1)}% (${formatBytes(r.used?.value)} / ${formatBytes(r.total?.value)})` : '—'} />
              <div className="px-3 pb-3">
                 <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-purple-500 h-full transition-all duration-500" style={{ width: r.percent?.value ? `${r.percent.value}%` : '0%' }}></div>
                  </div>
              </div>
            </SectionBlock>

            {list.map((m: any, idx: number) => (
              <SectionBlock key={idx} title={`Slot Físico: ${m.bank || `DIMM ${idx+1}`}`} icon={Server}>
                <PropertyRow label="Fabricante" value={m.manufacturer || 'Desconhecido'} />
                <PropertyRow label="Tipo de Memória" value={m.type || 'Desconhecido'} />
                <PropertyRow label="Tamanho" value={formatBytes(m.size)} />
                <PropertyRow label="Frequência Efetiva" value={m.clockSpeed ? `${m.clockSpeed} MHz` : '—'} />
                <PropertyRow label="Formato (Form Factor)" value={m.formFactor || '—'} />
                <PropertyRow label="Part Number" value={m.partNum || '—'} />
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
           <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {staticList.map((g: any, idx: number) => {
              const rt = realtimeList.find((r: any) => r.index === idx) || {};
              const utilVal = rt.utilization?.value;
              const tempVal = rt.temperature?.value;
              const vramUsedVal = rt.vramUsed?.value;

              return (
                <div key={idx} className="space-y-4">
                  <SectionBlock title={`Adaptador Gráfico ${idx+1}: ${g.vendor || ''} ${g.model || ''}`} icon={Monitor}>
                    <PropertyRow label="Uso de GPU" value={utilVal != null ? `${utilVal}%` : '—'} />
                    <div className="px-3 pb-3 mb-2">
                       <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                          <div className="bg-emerald-500 h-full transition-all" style={{ width: `${utilVal || 0}%` }}></div>
                        </div>
                    </div>
                    <PropertyRow label="Temperatura da GPU" value={tempVal != null ? `${tempVal}°C` : '—'} status={rt.temperature?.status} />
                    <PropertyRow label="VRAM Usada" value={vramUsedVal != null ? `${vramUsedVal} MB` : '—'} status={rt.vramUsed?.status} />
                    <PropertyRow label="VRAM Total (Dedicada)" value={g.vram ? `${g.vram} MB` : '—'} />
                    <PropertyRow label="VRAM Dinâmica" value={g.vramDynamic ? 'Sim (Integrada)' : 'Não (Dedicada)'} />
                  </SectionBlock>

                  <SectionBlock title="Arquitetura & Detalhes do Driver" icon={ShieldCheck}>
                    <PropertyRow label="Versão do Driver" value={g.driverVersion || '—'} />
                    <PropertyRow label="Data do Driver" value={g.driverDate || '—'} />
                    <PropertyRow label="Processador de Vídeo" value={g.videoProcessor || '—'} />
                    <PropertyRow label="ID de Arquitetura (WMI)" value={g.architecture || '—'} />
                    <PropertyRow label="Interface de Barramento" value={g.bus || '—'} />
                    <PropertyRow label="Sub-Device ID" value={g.subDeviceId || '—'} />
                    <PropertyRow label="Taxa de Atualização Atual" value={g.refreshRate ? `${g.refreshRate} Hz` : '—'} />
                  </SectionBlock>
                </div>
              );
            })}
            {staticList.length === 0 && <p className="text-zinc-500 text-sm italic p-4">Nenhum adaptador gráfico detectado.</p>}
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
            return {
              text: 'text-red-400',
              bg: 'bg-red-500/10 border-red-500/20',
              bar: 'bg-red-500',
              label: t('monitor.temps.critical', 'Crítico')
            };
          }
          if (status === 'Hot') {
            return {
              text: 'text-amber-400',
              bg: 'bg-amber-500/10 border-amber-500/20',
              bar: 'bg-amber-500',
              label: t('monitor.temps.warm', 'Quente')
            };
          }
          return {
            text: 'text-emerald-400',
            bg: 'bg-emerald-500/10 border-emerald-500/20',
            bar: 'bg-emerald-500',
            label: t('monitor.temps.optimal', 'Ótimo')
          };
        };

        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Warning if CPU temperature is unavailable */}
            {cpuTempUnavailable && (
              <div className="p-4 border border-amber-500/30 bg-amber-500/10 rounded-xl flex items-start gap-3 text-amber-300">
                <AlertTriangle size={20} className="text-amber-400 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-amber-200">
                    {t('monitor.temps.unavailableTitle', 'Temperatura da CPU indisponível')}
                  </p>
                  <p className="text-xs text-amber-400/80 mt-1 leading-relaxed">
                    {t('monitor.temps.unavailableDesc', 'O Windows não expõe a temperatura do processador por padrão via WMI nesta placa-mãe. Para monitorar as temperaturas com máxima precisão, você pode manter o LibreHardwareMonitor ou CoreTemp aberto em segundo plano.')}
                  </p>
                </div>
              </div>
            )}

            {/* Main Temp Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl flex items-center justify-between shadow-xl">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
                    <Cpu size={28} />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-zinc-300">{t('monitor.temps.cpuPackage', 'CPU Package')}</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">{t('monitor.temps.cpuPackageDesc', 'Temperatura principal do processador')}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-3xl font-extrabold tracking-tight ${
                    !cpuTempUnavailable ? getTempStyle(mainTemp).text : 'text-zinc-500'
                  }`}>
                    {!cpuTempUnavailable ? `${mainTemp.value.toFixed(1)}°C` : '—'}
                  </span>
                  <div className="text-[10px] text-zinc-400 mt-1 font-mono uppercase">
                    {t('monitor.temps.source', 'Fonte')}: <span className="text-zinc-300 font-semibold">{formatSource(mainTemp?.source)}</span>
                  </div>
                </div>
              </div>

              {(() => {
                const primaryGpu = metrics?.gpu?.values?.gpus?.[0];
                const gpuTempObj = probes.find((p: any) => p.category === 'gpu')?.temperature;
                const style = getTempStyle(gpuTempObj);
                return (
                  <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl flex items-center justify-between shadow-xl">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                        <Monitor size={28} />
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-zinc-300">{t('monitor.temps.primaryGpu', 'GPU Primária')}</h3>
                        <p className="text-xs text-zinc-500 mt-0.5">{primaryGpu?.name || 'Placa de Vídeo'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      {gpuTempObj?.availability === 'available' ? (
                        <>
                          <span className={`text-3xl font-extrabold tracking-tight ${style.text}`}>
                            {gpuTempObj.value != null ? `${gpuTempObj.value.toFixed(1)}°C` : '—'}
                          </span>
                          <div className="text-[10px] text-zinc-400 mt-1 font-mono uppercase">
                            {t('monitor.temps.source', 'Fonte')}: <span className="text-zinc-300 font-semibold">{formatSource(gpuTempObj.source)}</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="text-sm font-semibold text-zinc-500 italic block py-1.5">
                            {gpuTempObj?.availability === 'unsupported' ? 'Sem sensor' : 'Indisponível'}
                          </span>
                          <div className="text-[9px] text-zinc-600 font-mono uppercase">
                            ADL / SMI Fallback
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Probe list categorized */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {Object.entries(categoriesGroup).map(([key, cat]) => {
                if (cat.items.length === 0) return null;
                const Icon = cat.icon;
                return (
                  <div key={key} className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-5 shadow-lg space-y-4">
                    <div className="flex items-center gap-2 pb-3 border-b border-zinc-800/80">
                      <Icon size={18} className="text-indigo-400" />
                      <h3 className="font-bold text-zinc-200 text-sm tracking-wide uppercase">{cat.title}</h3>
                    </div>

                    <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                      {cat.items.map((item: any, idx: number) => {
                        const tempObj = item.temperature;
                        const style = getTempStyle(tempObj);
                        const val = tempObj?.value;

                        return (
                          <div key={idx} className="bg-zinc-950 border border-zinc-900 p-3 rounded-xl flex flex-col gap-2 hover:border-zinc-800 transition-all">
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-semibold text-zinc-300 truncate max-w-[200px]" title={item.name}>
                                {item.name}
                              </span>
                              <div className="flex items-center gap-2">
                                {tempObj?.availability === 'available' && val != null ? (
                                  <>
                                    <span className={`text-xs font-semibold ${style.text}`}>
                                      {val.toFixed(1)}°C
                                    </span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider scale-90 ${style.bg} ${style.text}`}>
                                      {style.label}
                                    </span>
                                  </>
                                ) : tempObj?.availability === 'loading' ? (
                                  <span className="text-[10px] text-zinc-500 italic flex items-center gap-1">
                                    <Loader2 size={10} className="animate-spin" /> Lendo...
                                  </span>
                                ) : tempObj?.availability === 'error' ? (
                                  <span className="text-[10px] text-red-400 font-semibold bg-red-950 px-2 py-0.5 rounded border border-red-900/30">
                                    Erro
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-zinc-600 bg-zinc-900 px-2 py-0.5 rounded">
                                    Não disponível
                                  </span>
                                )}
                              </div>
                            </div>

                            {tempObj?.availability === 'available' && val != null && (
                              <div className="w-full bg-zinc-900 h-1 rounded-full overflow-hidden border border-zinc-900">
                                <div
                                  className={`h-full ${style.bar} transition-all duration-500 rounded-full`}
                                  style={{ width: `${Math.min(100, Math.max(5, (val / 100) * 100))}%` }}
                                />
                              </div>
                            )}

                            <div className="flex justify-between text-[9px] text-zinc-500 mt-0.5">
                              <span>
                                {t('monitor.temps.quality', 'Qualidade')}: {tempObj?.quality === 'high' ? t('monitor.temps.high', 'Alta') : tempObj?.quality === 'medium' ? t('monitor.temps.medium', 'Média') : t('monitor.temps.none', 'Nenhuma')}
                              </span>
                              <span className="uppercase font-mono">
                                {t('monitor.temps.source', 'Fonte')}: {formatSource(tempObj?.source)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      }

      case 'procs': {
        const topCpu = metrics?.procs?.values?.topCpu || [];
        const filteredCpu = topCpu.filter((p: any) => p.name.toLowerCase().includes(procSearch.toLowerCase()));

        return (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex gap-4">
              <input
                type="text"
                placeholder={t('monitor.procs.search', 'Buscar processo...')}
                value={procSearch}
                onChange={e => setProcSearch(e.target.value)}
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-zinc-200 outline-none focus:border-blue-500"
              />
            </div>

            <SectionBlock title={t('monitor.procs.topCpu', 'Top Processos (Por CPU)')} icon={Activity}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-zinc-400 bg-zinc-900/50">
                    <tr>
                      <th className="px-4 py-2 font-medium">{t('monitor.procs.name', 'Nome')}</th>
                      <th className="px-4 py-2 font-medium">{t('monitor.procs.pid', 'PID')}</th>
                      <th className="px-4 py-2 font-medium">{t('monitor.procs.cpu', 'CPU %')}</th>
                      <th className="px-4 py-2 font-medium">{t('monitor.procs.ram', 'RAM')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCpu.map((p: any) => (
                      <tr key={p.pid} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                        <td className="px-4 py-2 text-zinc-300 font-medium">{p.name}</td>
                        <td className="px-4 py-2 text-zinc-500 font-mono text-xs">{p.pid}</td>
                        <td className="px-4 py-2 text-emerald-400 font-medium">{toFixedSafe(p.cpu, 1)}%</td>
                        <td className="px-4 py-2 text-zinc-400">{formatBytes(p.memRss)}</td>
                      </tr>
                    ))}
                    {filteredCpu.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-zinc-500 italic">
                          {procSearch ? 'Nenhum processo correspondente encontrado.' : 'Carregando lista de processos ativos...'}
                        </td>
                      </tr>
                    )}
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
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
             <SectionBlock title="Atividade Global de Discos" icon={Activity}>
              <PropertyRow label="Leitura Direta" value={io.readBps?.value != null ? `${formatBytes(io.readBps.value)}/s` : '—'} />
              <PropertyRow label="Escrita Direta" value={io.writeBps?.value != null ? `${formatBytes(io.writeBps.value)}/s` : '—'} />
              <PropertyRow label="Uso do Controlador (Active Time)" value={io.activity?.value != null ? `${io.activity.value}%` : '—'} />
            </SectionBlock>

            {list.map((d: any, idx: number) => (
              <SectionBlock key={idx} title={`Disco: ${d.name || d.device}`} icon={HardDrive}>
                <PropertyRow label="Tipo / Interface" value={`${d.type || 'N/A'} - ${d.interfaceType || 'N/A'}`} />
                <PropertyRow label="Capacidade Bruta" value={formatBytes(d.size)} />
                <PropertyRow label="Status SMART Global" value={d.smartStatus || 'OK'} status={d.smartStatus?.toLowerCase() === 'ok' ? 'OK' : undefined} />
                <PropertyRow label="Desgaste Físico (Wear Level)" value={d.wearLevel != null ? `${d.wearLevel}%` : 'N/A'} />
                <PropertyRow label="Temperatura do Disco" value={d.temperature != null ? `${d.temperature}°C` : '—'} />
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
           <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
             {list.map((m: any, idx: number) => (
               <SectionBlock key={idx} title={`Monitor ${idx+1}: ${m.model || m.vendor || 'Desconhecido'}`} icon={Monitor}>
                 <PropertyRow label="Principal" value={m.main ? 'Sim' : 'Não'} />
                 <PropertyRow label="Resolução Nativa" value={`${m.resolutionx}x${m.resolutiony}`} />
                 <PropertyRow label="Resolução Atual" value={`${m.currentResX}x${m.currentResY}`} />
                 <PropertyRow label="Taxa de Atualização" value={m.currentRefreshRate ? `${m.currentRefreshRate} Hz` : '—'} />
                 <PropertyRow label="Conexão" value={m.connection || '—'} />
               </SectionBlock>
             ))}
             {list.length === 0 && <p className="text-zinc-500 text-sm italic p-4">Nenhum monitor detectado via systeminformation.</p>}
           </div>
         );
      }

      case 'mobo': {
        if (loadingMap['mobo'] && !categories['mobo']) return renderTabLoadingState();
        if (errorMap['mobo']) return renderTabErrorState('mobo');

        const d = (categories.mobo || categories.mainboard)?.data || {};
        return (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <SectionBlock title="Placa Principal (Baseboard)" icon={LayoutTemplate}>
              <PropertyRow label="Fabricante" value={d.manufacturer || '—'} />
              <PropertyRow label="Modelo" value={d.model || '—'} />
              <PropertyRow label="Revisão (Versão)" value={d.version || '—'} />
              <PropertyRow label="Número de Série" value={d.serial || '—'} />
            </SectionBlock>
            <SectionBlock title="Firmware (BIOS/UEFI)" icon={CpuIcon}>
              <PropertyRow label="Fornecedor da BIOS" value={d.biosVendor || '—'} />
              <PropertyRow label="Versão da BIOS" value={d.biosVersion || '—'} />
              <PropertyRow label="Data de Lançamento" value={d.biosReleaseDate || '—'} />
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
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <SectionBlock title="Tráfego Consolidado" icon={Activity}>
              <PropertyRow label="Banda de Download" value={r.rxBps?.value != null ? `${formatBytes(r.rxBps.value)}/s` : '—'} />
              <PropertyRow label="Banda de Upload" value={r.txBps?.value != null ? `${formatBytes(r.txBps.value)}/s` : '—'} />
            </SectionBlock>

            {/* Filter Bar */}
            <div className="flex items-center justify-between bg-zinc-950 p-3 rounded-xl border border-zinc-800">
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-blue-400" />
                <span className="text-xs text-zinc-300 font-medium">
                  {t('monitor.network.filterLabel', 'Filtro de Adaptadores')}
                </span>
                {hiddenCount > 0 && filterVirtualNet && (
                  <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono">
                    {hiddenCount} {t('monitor.network.virtualHidden', 'virtuais ocultos')}
                  </span>
                )}
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-400 hover:text-zinc-200">
                <input
                  type="checkbox"
                  checked={filterVirtualNet}
                  onChange={e => setFilterVirtualNet(e.target.checked)}
                  className="rounded bg-zinc-900 border-zinc-700 text-blue-500 focus:ring-0"
                />
                <span>{t('monitor.network.filterVirtual', 'Apenas Físicos')}</span>
              </label>
            </div>

            {displayList.map((n: any, idx: number) => {
              const isVirt = isVirtualNet(n);
              return (
                <SectionBlock key={idx} title={`Adaptador: ${n.ifaceName || n.iface}`} icon={Wifi}>
                  <div className="px-3 py-1 flex items-center justify-between border-b border-zinc-800/60">
                    <span className="text-xs text-zinc-500">Classificação</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                      isVirt ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}>
                      {isVirt ? t('monitor.network.virtualTag', 'Virtual / VPN') : t('monitor.network.physicalTag', 'Físico')}
                    </span>
                  </div>
                  <PropertyRow label="Status da Camada (Link)" value={n.speed ? `${n.speed} Mbps` : 'Desconectado'} status={n.speed ? 'OK' : undefined} />
                  <PropertyRow label="Tipo de Adaptador" value={n.type || '—'} />
                  <PropertyRow label="Endereço IPv4" value={n.ip4 || '—'} />
                  <PropertyRow label="Endereço MAC" value={n.mac || '—'} />
                </SectionBlock>
              );
            })}
            {displayList.length === 0 && (
              <p className="text-zinc-500 text-sm italic p-4 text-center">
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
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <SectionBlock title="Núcleo do Sistema" icon={FileDigit}>
              <PropertyRow label="Plataforma Base" value={`${d.platform || ''} (${d.arch || ''})`} />
              <PropertyRow label="Distribuição" value={d.distro || '—'} />
              <PropertyRow label="Lançamento (Kernel/Core)" value={d.release || '—'} />
            </SectionBlock>
            {Object.keys(win).length > 0 && (
              <SectionBlock title="Detalhes do Registro do Windows" icon={LayoutTemplate}>
                <PropertyRow label="Versão de Exibição" value={win.DisplayVersion || '—'} />
                <PropertyRow label="Build Principal" value={win.CurrentBuildNumber || d.build || '—'} />
                <PropertyRow label="Revisão (UBR)" value={win.UBR || '—'} />
              </SectionBlock>
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
        let statusColor = 'text-zinc-400 border-zinc-800';
        let statusBg = 'bg-zinc-950/20';
        let statusDesc = 'O WMI Daemon está iniciando a telemetria do kernel.';

        if (dpcVal != null) {
          if (dpcVal < 5000) {
            statusText = 'Excelente (Latência Ultra-baixa)';
            statusColor = 'text-emerald-400 border-emerald-500/20';
            statusBg = 'bg-emerald-500/5';
            statusDesc = 'O sistema operacional está processando as chamadas DPC do kernel de forma extremamente rápida. Configuração ideal para jogos competitivos sem micro-engasgos (stuttering) e produção de áudio em tempo real.';
          } else if (dpcVal < 15000) {
            statusText = 'Moderado (Atividade Normal)';
            statusColor = 'text-amber-400 border-amber-500/20';
            statusBg = 'bg-amber-500/5';
            statusDesc = 'Há uma carga de trabalho típica do Windows no kernel. Isso é perfeitamente seguro e esperado para tarefas diárias. Para jogadores de eSports de altíssimo nível, pode introduzir pequenas latências de frametime.';
          } else {
            statusText = 'Alto Jitter (Sobrecarga de Interrupção)';
            statusColor = 'text-rose-400 border-rose-500/20';
            statusBg = 'bg-rose-500/5';
            statusDesc = 'Indicador de gargalo de latência! Uma taxa elevada de DPCs/s pode induzir micro-travamentos repentinos nos jogos ou estalos no som (audio crackling). Considere verificar e atualizar os drivers de placa gráfica, adaptadores de rede ou desativar periféricos USB não utilizados.';
          }
        }

        return (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className={`p-5 rounded-xl border ${statusColor} ${statusBg} transition-all duration-300`}>
              <div className="flex items-center gap-3 mb-2">
                <Clock className="w-5 h-5" />
                <span className="font-bold text-lg text-white">Status de Resposta do Kernel</span>
              </div>
              <p className="text-sm font-semibold mb-1">{statusText}</p>
              <p className="text-xs text-zinc-400 leading-relaxed">{statusDesc}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SectionBlock title="Telemetria de DPC" icon={Activity}>
                <PropertyRow label="DPCs Enfileirados" value={dpcVal != null ? `${dpcVal.toLocaleString()} /s` : '—'} />
                <PropertyRow label="Tempo Gasto com DPC" value={r.percentDpc?.value != null ? `${r.percentDpc.value}%` : '—'} />
                {dpcHistory.length > 1 && (
                  <div className="mt-4 p-2 bg-zinc-950/20 rounded-lg">
                    <p className="text-xs text-zinc-500 mb-2 font-medium">Histórico de DPCs/s (Últimos 60s)</p>
                    <div className="h-16 flex items-end">
                      <Sparkline data={dpcHistory} min={0} max={25000} color="#3b82f6" />
                    </div>
                  </div>
                )}
              </SectionBlock>

              <SectionBlock title="Telemetria de Interrupções (ISR)" icon={Cpu}>
                <PropertyRow label="Interrupções de Hardware" value={intVal != null ? `${intVal.toLocaleString()} /s` : '—'} />
                <PropertyRow label="Tempo Gasto com ISR" value={r.percentInt?.value != null ? `${r.percentInt.value}%` : '—'} />
              </SectionBlock>
            </div>

            <SectionBlock title={`Drivers de Kernel Ativos (${filteredDrivers.length} / ${drivers.length})`} icon={List}>
              <div className="mb-4 px-4 pt-2">
                <input
                  type="text"
                  placeholder="Pesquisar por driver (ex: amdkmdag, nvlddmkm)..."
                  value={driverSearch}
                  onChange={(e) => setDriverSearch(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <div className="max-h-80 overflow-y-auto custom-scrollbar border-t border-zinc-800 bg-zinc-950/40">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900 text-zinc-400 font-medium sticky top-0">
                      <th className="p-3">Nome</th>
                      <th className="p-3">Descrição (Display Name)</th>
                      <th className="p-3">Caminho (.sys)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDrivers.map((d: any, idx: number) => (
                      <tr key={idx} className="border-b border-zinc-800/40 hover:bg-zinc-800/10 text-zinc-300 transition-colors">
                        <td className="p-3 font-semibold text-blue-400">{d.Name}</td>
                        <td className="p-3 text-zinc-400">{d.DisplayName || '—'}</td>
                        <td className="p-3 font-mono text-zinc-500 break-all">{d.PathName || '—'}</td>
                      </tr>
                    ))}
                    {filteredDrivers.length === 0 && (
                      <tr>
                        <td colSpan={3} className="p-4 text-center text-zinc-500 italic">Nenhum driver ativo correspondente.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </SectionBlock>

            <div className="p-4 rounded-lg bg-zinc-950/20 border border-zinc-800 text-xs leading-relaxed space-y-2 text-zinc-400">
              <p className="font-semibold text-zinc-200">ℹ️ O que é DPC e ISR?</p>
              <p>
                Quando um dispositivo físico (como placa de som, placa de rede ou placa de vídeo) precisa de atenção, ele envia uma <strong>Interrupção de Hardware (ISR)</strong> para o processador, que pausa instantaneamente o que está fazendo para atendê-lo.
              </p>
              <p>
                Como as ISRs devem ser curtíssimas, tarefas mais pesadas de processamento secundário são enfileiradas como <strong>DPC (Deferred Procedure Call)</strong>. Se um driver mal programado demorar muito tempo para liberar o controle, a fila de DPCs se acumula, fazendo com que o processador demore para responder a outras tarefas. Isso gera latência perceptível nos jogos e estalos de som.
              </p>
              <p className="text-blue-400">
                <strong>Dica:</strong> Em sistemas Windows normais, picos esporádicos são comuns. Mas se a taxa se mantiver muito alta constantemente, recomenda-se desinstalar drivers de rede antigos, atualizar o driver da GPU utilizando ferramentas de instalação limpa (DDU) ou atualizar a BIOS da placa-mãe.
              </p>
            </div>
          </div>
        );
      }
    }
  };

  return (
    <div className="space-y-6 h-[calc(100vh-6rem)] flex flex-col relative">
      {/* Toast Alert Banner */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl animate-in slide-in-from-bottom-2 duration-200 ${
          toast.type === 'error' ? 'bg-rose-950/95 border-rose-600/50 text-rose-200' :
          toast.type === 'success' ? 'bg-emerald-950/95 border-emerald-600/50 text-emerald-200' :
          'bg-zinc-900/95 border-zinc-700 text-zinc-200'
        }`}>
          {toast.type === 'error' ? <AlertTriangle size={18} className="text-rose-400 shrink-0" /> : <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-bold text-white">{t('monitor.title', 'Monitor de Sistema')}</h1>
          <HelpTip
            title={t('monitor.helpTitle', 'Sobre o Hardware Inspector')}
            description={t('monitor.helpDesc', 'Plataforma avançada de diagnóstico de hardware modular com coletas de WMI, nvidia-smi e polling de kernel nativo.')}
            sections={[]}
            buttonLabel="Entendi"
          />
        </div>
        <p className="text-zinc-400">{t('monitor.subtitle', 'Varredura profunda do sistema ao Ring-0.')}</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6 flex-1 min-h-0">
        {renderTabs()}

        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar bg-zinc-900/30 rounded-xl border border-zinc-800/50 p-6 shadow-inner">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default SystemMonitor;
