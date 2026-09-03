import React, { useState, useMemo } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import {
  Cpu, Server, HardDrive, Network, Monitor, Zap,
  RefreshCw, AlertTriangle, PlaySquare, ShieldCheck,
  CheckCircle2, LayoutTemplate, Wifi, FileDigit, CpuIcon, Activity, List, Thermometer, Copy, Clock,
  Loader2
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

const PropertyRow = ({ label, value, status }: { label: string, value: React.ReactNode, status?: string }) => (
  <div className="flex justify-between items-center py-2.5 border-b border-zinc-800/80 last:border-0 hover:bg-zinc-800/30 px-3 rounded transition-colors group">
    <span className="text-sm text-zinc-400 group-hover:text-zinc-300">{label}</span>
    <div className="flex items-center gap-2">
      {status === 'Error' && <span title="Falha ao ler sensor"><AlertTriangle size={14} className="text-amber-500" /></span>}
      {status === 'OK' && <CheckCircle2 size={14} className="text-emerald-500" />}
      <span className="text-sm font-medium text-zinc-200">{value ?? '—'}</span>
    </div>
  </div>
);

const Gauge = React.memo(({ label, value, unit, history, color = "#3b82f6" }: any) => (
  <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex flex-col gap-2">
    <div className="flex justify-between items-end">
      <span className="text-zinc-400 text-sm">{label}</span>
      <span className="text-2xl font-bold text-white tracking-tighter">
        {value != null ? value : '-'}
        <span className="text-sm text-zinc-500 ml-1">{unit}</span>
      </span>
    </div>
    <div className="h-10 mt-2">
      <Sparkline data={history} min={0} max={100} color={color} />
    </div>
  </div>
));

const SectionBlock = ({ title, children, icon: Icon }: { title: string, children: React.ReactNode, icon?: any }) => (
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

const SystemMonitor = () => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  const metrics = useSystemMetrics();
  const { data: deepData, loading: deepLoading, error: deepError, refresh: deepRefresh } = useDeepHardware();

  const [benchmarkResult, setBenchmarkResult] = useState<{mops: string, time: string} | null>(null);
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [procSearch, setProcSearch] = useState('');
  const [driverSearch, setDriverSearch] = useState('');

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
        const res = await window.darkhub.system.runBenchmark();
        if (res.ok) setBenchmarkResult({ mops: res.mops, time: res.time });
        else alert('Falha no benchmark: ' + res.error);
      } catch (e) {
        console.error('Benchmark error', e);
      } finally {
        setIsBenchmarking(false);
      }
    }
  };

  const generateReport = () => {
    let report = "--- DARKHUB HARDWARE INSPECTOR REPORT ---\n";
    report += `Date: ${new Date().toLocaleString()}\n\n`;
    report += "[CPU]\n";
    report += `Model: ${deepData?.cpu?.data?.manufacturer} ${deepData?.cpu?.data?.brand}\n`;
    report += `Load: ${metrics?.cpu?.values?.currentLoad?.value}%\n\n`;
    report += "[RAM]\n";
    report += `Total: ${formatBytes(metrics?.ram?.values?.total?.value)}\n`;
    report += `Used: ${metrics?.ram?.values?.percent?.value}%\n\n`;
    navigator.clipboard.writeText(report);
    alert('Relatório copiado para a área de transferência!');
  };

  const renderTabs = () => {
    const tabs = [
      { id: 'overview', icon: Activity, label: t('monitor.tab.overview', 'Overview') },
      { id: 'cpu', icon: Cpu, label: t('monitor.tab.cpu', 'Processor (CPU)') },
      { id: 'gpu', icon: Monitor, label: t('monitor.tab.gpu', 'Graphics Cards') },
      { id: 'ram', icon: Server, label: t('monitor.tab.ram', 'Memory (RAM)') },
      { id: 'storage', icon: HardDrive, label: t('monitor.tab.storage', 'Storage & Drives') },
      { id: 'network', icon: Network, label: t('monitor.tab.network', 'Network') },
      { id: 'temps', icon: Thermometer, label: t('monitor.tab.temps', 'Temperatures') },
      { id: 'latency', icon: Clock, label: t('monitor.tab.latency', 'DPC/ISR Latency') },
      { id: 'procs', icon: List, label: t('monitor.tab.procs', 'Processes') },
      { id: 'monitors', icon: LayoutTemplate, label: t('monitor.tab.displays', 'Displays') },
      { id: 'mobo', icon: LayoutTemplate, label: t('monitor.tab.mobo', 'Motherboard & BIOS') },
      { id: 'os', icon: FileDigit, label: t('monitor.tab.os', 'Operating System') }
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
            onClick={deepRefresh}
            disabled={deepLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={deepLoading ? 'animate-spin' : ''} />
            {t('monitor.refreshSensors', 'Refresh Sensors')}
          </button>

          <button
            onClick={handleBenchmark}
            disabled={isBenchmarking}
            className="w-full py-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50 border border-blue-500/20"
          >
            {isBenchmarking ? <RefreshCw size={16} className="animate-spin" /> : <PlaySquare size={16} />}
            <span>{isBenchmarking ? t('monitor.running', 'Running...') : t('monitor.runBenchmark', 'Run CPU Benchmark')}</span>
          </button>

          <button
            onClick={generateReport}
            className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors border border-zinc-700"
          >
            <Copy size={16} />
            {t('monitor.copyReport', 'Copy Report')}
          </button>

          {benchmarkResult && (
            <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-lg text-center animate-in fade-in zoom-in">
              <p className="text-emerald-400 font-bold text-lg">{benchmarkResult.mops} <span className="text-xs">MOPS</span></p>
              <p className="text-zinc-500 text-[10px]">Time: {benchmarkResult.time}ms</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderContent = () => {
    if (deepLoading && !deepData) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-zinc-400 space-y-4 pt-20">
          <RefreshCw className="animate-spin text-blue-500" size={32} />
          <p>Extraindo arquitetura profunda do sistema...</p>
        </div>
      );
    }

    if (deepError) {
      return (
        <div className="p-6 border border-amber-500/20 bg-amber-500/10 rounded-xl flex items-start gap-4">
          <AlertTriangle className="text-amber-500 shrink-0 mt-1" />
          <div>
            <h3 className="text-amber-200 font-semibold mb-1">Falha Crítica na Telemetria</h3>
            <p className="text-amber-400/80 text-sm mb-4">{deepError}</p>
            <button onClick={deepRefresh} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm">
              Tentar Novamente
            </button>
          </div>
        </div>
      );
    }

    if (!deepData) return null;

    switch (activeTab) {
      case 'overview': {
        return (
          <div className="space-y-4 animate-in fade-in duration-300">
            <h2 className="text-xl font-semibold text-white mb-4">Painel de Sensores (Real-time)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Gauge label="CPU Load" value={toFixedSafe(metrics?.cpu?.values?.currentLoad?.value, 1)} unit="%" history={cpuLoadHistory} color="#3b82f6" />
              <Gauge label="RAM Usage" value={toFixedSafe(metrics?.ram?.values?.percent?.value, 1)} unit="%" history={ramUseHistory} color="#8b5cf6" />
              <Gauge label="GPU Util" value={toFixedSafe(metrics?.gpu?.values?.gpus?.[0]?.utilization?.value, 1)} unit="%" history={gpuUtilHistory} color="#10b981" />
              <Gauge label="Disk Act" value={toFixedSafe(metrics?.diskIo?.values?.activity?.value, 1)} unit="%" history={diskActHistory} color="#f59e0b" />
              <Gauge label="CPU Temp" value={toFixedSafe(metrics?.temps?.values?.main?.value, 0)} unit="°C" history={tempHistory} color="#ef4444" />
            </div>
          </div>
        );
      }

      case 'cpu': {
        const d = deepData.cpu?.data || {};
        const r = metrics?.cpu?.values || {};

        return (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <SectionBlock title="Desempenho por Núcleo" icon={Zap}>
              <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-4">
                {r.coresLoad?.map((core: any, idx: number) => (
                   <div key={idx} className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                     <div className="flex justify-between text-xs text-zinc-400 mb-2">
                       <span>Core {idx}</span>
                       <span>{toFixedSafe(core.value, 1)}%</span>
                     </div>
                     <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                       <div className="bg-blue-500 h-full transition-all" style={{ width: `${core.value}%` }}></div>
                     </div>
                   </div>
                ))}
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
        const list = deepData.memory?.data || [];
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
        const staticList = deepData.gpu?.data || [];
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
                  <SectionBlock title={`Adaptador Gráfico ${idx+1}: ${g.vendor} ${g.model}`} icon={Monitor}>
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

        const categories: Record<string, { title: string; icon: any; items: any[] }> = {
          cpu: { title: 'Processador', icon: Cpu, items: [] },
          gpu: { title: 'Placa de Vídeo', icon: Monitor, items: [] },
          storage: { title: 'Armazenamento', icon: HardDrive, items: [] },
          system: { title: 'Placa-Mãe & Sistema', icon: Server, items: [] }
        };

        probes.forEach((p: any) => {
          const cat = p.category || 'system';
          if (categories[cat]) {
            categories[cat].items.push(p);
          } else {
            categories['system'].items.push(p);
          }
        });

        const getTempStyle = (sensor: any) => {
          const val = sensor?.value;
          const status = sensor?.status || 'OK';

          if (status === 'Critical') {
            return {
              text: 'text-red-400',
              bg: 'bg-red-500/10 border-red-500/20',
              bar: 'bg-red-500',
              label: 'Crítico'
            };
          }
          if (status === 'Hot') {
            return {
              text: 'text-amber-400',
              bg: 'bg-amber-500/10 border-amber-500/20',
              bar: 'bg-amber-500',
              label: 'Quente'
            };
          }
          return {
            text: 'text-emerald-400',
            bg: 'bg-emerald-500/10 border-emerald-500/20',
            bar: 'bg-emerald-500',
            label: 'Ótimo'
          };
        };

        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {}
              <div className="bg-zinc-905 border border-zinc-800 p-5 rounded-2xl flex items-center justify-between shadow-xl">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
                    <Cpu size={28} />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-zinc-400">CPU Package</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">Temperatura principal do processador</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-3xl font-extrabold tracking-tight ${
                    metrics?.temps?.values?.main?.value != null
                      ? getTempStyle(metrics?.temps?.values?.main).text
                      : 'text-zinc-500'
                  }`}>
                    {metrics?.temps?.values?.main?.value != null
                      ? `${metrics.temps.values.main.value.toFixed(1)}°C`
                      : '—'}
                  </span>
                  <div className="text-[10px] text-zinc-500 mt-1 font-mono uppercase">
                    Fonte: {metrics?.temps?.values?.main?.source || 'si'}
                  </div>
                </div>
              </div>

              {}
              {(() => {
                const primaryGpu = metrics?.gpu?.values?.gpus?.[0];
                const gpuTempObj = probes.find((p: any) => p.category === 'gpu')?.temperature;
                const style = getTempStyle(gpuTempObj);
                return (
                  <div className="bg-zinc-905 border border-zinc-800 p-5 rounded-2xl flex items-center justify-between shadow-xl">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                        <Monitor size={28} />
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-zinc-400">GPU Primária</h3>
                        <p className="text-xs text-zinc-500 mt-0.5">{primaryGpu?.name || 'Placa de Vídeo'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      {gpuTempObj?.availability === 'available' ? (
                        <>
                          <span className={`text-3xl font-extrabold tracking-tight ${style.text}`}>
                            {gpuTempObj.value != null ? `${gpuTempObj.value.toFixed(1)}°C` : '—'}
                          </span>
                          <div className="text-[10px] text-zinc-500 mt-1 font-mono uppercase">
                            Fonte: {gpuTempObj.source}
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

            {}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {Object.entries(categories).map(([key, cat]) => {
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

                            {}
                            {tempObj?.availability === 'available' && val != null && (
                              <div className="w-full bg-zinc-900 h-1 rounded-full overflow-hidden border border-zinc-900">
                                <div
                                  className={`h-full ${style.bar} transition-all duration-500 rounded-full`}
                                  style={{ width: `${Math.min(100, Math.max(5, (val / 100) * 100))}%` }}
                                />
                              </div>
                            )}

                            {}
                            <div className="flex justify-between text-[9px] text-zinc-500 mt-0.5">
                              <span>Qualidade: {tempObj?.quality === 'high' ? 'Alta' : tempObj?.quality === 'medium' ? 'Média' : 'Nenhuma'}</span>
                              <span className="uppercase font-mono">Fonte: {tempObj?.source || 'si'}</span>
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
        const topMem = metrics?.procs?.values?.topMem || [];
        const filteredCpu = topCpu.filter((p: any) => p.name.toLowerCase().includes(procSearch.toLowerCase()));

        return (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex gap-4">
              <input
                type="text"
                placeholder="Buscar processo..."
                value={procSearch}
                onChange={e => setProcSearch(e.target.value)}
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-zinc-200 outline-none focus:border-blue-500"
              />
            </div>

            <SectionBlock title="Top Processos (Por CPU)" icon={Activity}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-zinc-400 bg-zinc-900/50">
                    <tr>
                      <th className="px-4 py-2 font-medium">Nome</th>
                      <th className="px-4 py-2 font-medium">PID</th>
                      <th className="px-4 py-2 font-medium">CPU %</th>
                      <th className="px-4 py-2 font-medium">RAM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCpu.map((p: any) => (
                      <tr key={p.pid} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                        <td className="px-4 py-2 text-zinc-300">{p.name}</td>
                        <td className="px-4 py-2 text-zinc-500">{p.pid}</td>
                        <td className="px-4 py-2 text-emerald-400 font-medium">{toFixedSafe(p.cpu, 1)}%</td>
                        <td className="px-4 py-2 text-zinc-400">{formatBytes(p.memRss)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionBlock>
          </div>
        );
      }

      case 'storage': {
        const list = deepData.storage?.data || [];
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
         const list = deepData.monitors?.data || [];
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
        const d = deepData.mainboard?.data || {};
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
        const list = deepData.network?.data || [];
        const r = metrics?.network?.values || {};
        return (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <SectionBlock title="Tráfego Consolidado" icon={Activity}>
              <PropertyRow label="Banda de Download" value={r.rxBps?.value != null ? `${formatBytes(r.rxBps.value)}/s` : '—'} />
              <PropertyRow label="Banda de Upload" value={r.txBps?.value != null ? `${formatBytes(r.txBps.value)}/s` : '—'} />
            </SectionBlock>
            {list.map((n: any, idx: number) => (
              <SectionBlock key={idx} title={`Adaptador: ${n.ifaceName || n.iface}`} icon={Wifi}>
                <PropertyRow label="Status da Camada (Link)" value={n.speed ? `${n.speed} Mbps` : 'Desconectado'} status={n.speed ? 'OK' : undefined} />
                <PropertyRow label="Tipo de Adaptador" value={n.type || '—'} />
                <PropertyRow label="Endereço IPv4" value={n.ip4 || '—'} />
                <PropertyRow label="Endereço MAC" value={n.mac || '—'} />
              </SectionBlock>
            ))}
          </div>
        );
      }

      case 'os': {
        const d = deepData.os?.data || {};
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
    <div className="space-y-6 h-[calc(100vh-6rem)] flex flex-col">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-bold text-white">Hardware Inspector</h1>
          <HelpTip
            title="Sobre o Hardware Inspector"
            description="Plataforma avançada de diagnóstico de hardware modular com coletas de WMI, nvidia-smi e polling de kernel nativo."
            sections={[]}
            buttonLabel="Entendi"
          />
        </div>
        <p className="text-zinc-400">Varredura extrema do top-level ao Ring-0.</p>
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
