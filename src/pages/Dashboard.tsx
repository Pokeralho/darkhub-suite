import React, { useState, useMemo, useEffect } from 'react';
import {
  Shield, Cpu, Activity, HardDrive, ArrowDownUp, Gamepad2, Wrench,
  CheckCircle, AlertTriangle, Trash2, Loader2, Sparkles, RefreshCw, Layers,
  Clock, Monitor, Server
} from '../components/icons';
import { useI18n } from '../i18n/I18nProvider';
import PageHeader from '../components/ui/PageHeader';
import { useSystemMetrics } from '../hooks/useSystemMetrics';
import { useSecurityScore } from '../hooks/useSecurityScore';
import { useJunkScanner } from '../hooks/useJunkScanner';
import { useRecentActivity, ActivityType } from '../hooks/useRecentActivity';
import { Sparkline } from '../components/library/Sparkline';
import { useSensorHistory } from '../hooks/useSensorHistory';

const formatBytes = (bytes: number | null | undefined) => {
  if (bytes == null || isNaN(bytes)) return '0 B';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'agora mesmo';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  return `há ${Math.floor(diff / 86400)} d`;
}

const activityIcon: Record<ActivityType, React.ReactNode> = {
  gameStarted: <Gamepad2 size={14} className="text-zinc-500" />,
  gameStopped: <Gamepad2 size={14} className="text-zinc-500" />,
  gameUpdated: <Gamepad2 size={14} className="text-zinc-500" />,
  optimization: <Wrench size={14} className="text-zinc-500" />,
  security: <Shield size={14} className="text-zinc-500" />,
  junkClean: <Trash2 size={14} className="text-zinc-500" />,
  benchmark: <Activity size={14} className="text-zinc-500" />,
  system: <CheckCircle size={14} className="text-zinc-500" />,
};

// Skeleton block sized like the value it stands in for.
const Skel = ({ w = 'w-14', h = 'h-[18px]' }: { w?: string; h?: string }) => (
  <span aria-hidden="true" className={`inline-block ${h} ${w} rounded bg-zinc-800/80 animate-pulse align-middle`} />
);

// Renders a polled reading: '...' = not yet received (skeleton), 'Erro' = sensor failed, else value + dim unit.
const Reading = ({ value, unit, tone = 'text-zinc-50' }: { value: string; unit?: string; tone?: string }) => {
  if (value === '...') return <Skel />;
  if (value === 'Erro') return <span className="text-[13px] text-red-400">Erro</span>;
  return <span className={tone}>{value}{unit ? <span className="ml-0.5 text-[12px] text-zinc-500">{unit}</span> : null}</span>;
};

// One cell of the metric strip. Clickable cells keep their original behaviour (navigate / run action).
const MetricCell = ({ icon: Icon, label, hint, title, onClick, children, sub, aside }: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  hint?: string;
  title?: string;
  onClick?: (e?: any) => void;
  children: React.ReactNode;
  sub?: React.ReactNode;
  aside?: React.ReactNode;
}) => (
  <div
    role="button"
    tabIndex={0}
    title={title}
    onClick={onClick}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }}
    className="group relative min-w-0 bg-zinc-950 hover:bg-zinc-900/70 px-4 py-3 cursor-pointer outline-none focus-visible:bg-zinc-900/70 transition-colors"
  >
    <div className="flex items-center justify-between gap-2 text-[11.5px] text-zinc-500">
      <span className="flex items-center gap-1.5 min-w-0">
        <Icon size={14} className="shrink-0 text-zinc-500 group-hover:text-blue-300 transition-colors" />
        <span className="truncate">{label}</span>
      </span>
      {aside ?? (hint ? (
        <span className="shrink-0 text-[11px] text-blue-300 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">{hint}</span>
      ) : null)}
    </div>
    <div className="mt-2 font-mono text-[20px] leading-none tabular-nums whitespace-nowrap">{children}</div>
    <div className="mt-2 h-4 text-[11px] text-zinc-500 font-mono truncate">{sub}</div>
  </div>
);

interface DashboardProps {
  onNavigate?: (page: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { t } = useI18n();
  const metrics = useSystemMetrics();
  const { securityScore, securityChecks, loading: securityLoading } = useSecurityScore();
  const { junk, loading: junkLoading, refresh: refreshJunk } = useJunkScanner() as any;
  const { activities, push: addActivity } = useRecentActivity() as any;
  const [securityOpen, setSecurityOpen] = useState(false);
  const [isCleaningJunk, setIsCleaningJunk] = useState(false);
  const [isOptimizingRam, setIsOptimizingRam] = useState(false);
  const [cleanFeedback, setCleanFeedback] = useState<string | null>(null);
  const [quickActionBusy, setQuickActionBusy] = useState<string | null>(null);
  const [timerInfo, setTimerInfo] = useState<{ current_ms?: number; locked?: boolean } | null>(null);
  const [cpuTopology, setCpuTopology] = useState<any>(null);

  useEffect(() => {
    (window.darkhub?.latency as any)?.queryTimer?.().then((res: any) => {
      if (res?.ok && res?.data) setTimerInfo(res.data);
    }).catch(() => {});

    (window.darkhub?.latency as any)?.getCpuTopology?.().then((res: any) => {
      if (res?.ok && res?.data) setCpuTopology(res.data);
    }).catch(() => {});
  }, []);

  const { cpuLoad, cpuVal } = useMemo(() => {
    const s = metrics?.cpu?.status;
    const vObj = metrics?.cpu?.values?.currentLoad;
    const v = vObj?.value;
    const vNum = typeof v === 'number' ? v : (v != null && !isNaN(Number(v)) ? Number(v) : null);
    const load = s === 'OK' && vNum !== null ? vNum.toFixed(1) : (s === 'Error' ? 'Erro' : '...');
    return { cpuLoad: load, cpuVal: vNum };
  }, [metrics?.cpu]);

  const { memUsage, memPct } = useMemo(() => {
    const s = metrics?.ram?.status;
    const mem = metrics?.ram?.values;
    const pct = s === 'OK' && mem && mem.total?.value > 0 ? mem.percent?.value : null;
    const pctNum = typeof pct === 'number' ? pct : (pct != null && !isNaN(Number(pct)) ? Number(pct) : null);
    const usage = pctNum !== null ? pctNum.toFixed(1) : (s === 'Error' ? 'Erro' : '...');
    return { memUsage: usage, memPct: pctNum };
  }, [metrics?.ram]);

  const { diskUse, diskReadKb, diskWriteKb, diskActivityPct, diskStatus, diskActivityVal } = useMemo(() => {
    const storageStatus = metrics?.storage?.status;
    const primaryDisk = storageStatus === 'OK' && Array.isArray(metrics?.storage?.values?.disks)
      ? metrics.storage.values.disks.find((d: any) => String(d?.mount ?? '').toLowerCase().startsWith('c:')) ?? metrics.storage.values.disks[0]
      : null;

    const dUseVal = primaryDisk?.use != null ? Number(primaryDisk.use) : null;
    const dUse = dUseVal !== null && !isNaN(dUseVal) ? dUseVal.toFixed(1) : '...';
    const ioStatus = metrics?.diskIo?.status;
    const ioVals = metrics?.diskIo?.values;

    let rKb = '...', wKb = '...', actPct = '...', actVal: number | null = null;

    if (ioStatus === 'OK' && ioVals) {
      const readVal = ioVals.readBps?.value;
      const writeVal = ioVals.writeBps?.value;
      const actV = ioVals.activity?.value;

      if (Number.isFinite(readVal)) rKb = (readVal / 1024).toFixed(0);
      if (Number.isFinite(writeVal)) wKb = (writeVal / 1024).toFixed(0);

      // Only the real active-time counter; no estimate from throughput when it is missing.
      if (Number.isFinite(actV)) {
        actVal = Math.max(0, Math.min(100, actV));
        actPct = actVal.toFixed(1);
      }
    }

    return {
      diskUse: storageStatus === 'Error' ? 'Erro' : dUse,
      diskReadKb: ioStatus === 'Error' ? 'Erro' : rKb,
      diskWriteKb: ioStatus === 'Error' ? 'Erro' : wKb,
      diskActivityPct: ioStatus === 'Error' ? 'Erro' : actPct,
      diskActivityVal: actVal,
      diskStatus: ioStatus
    };
  }, [metrics?.storage, metrics?.diskIo]);

  const { rxKb, txKb, netStatus } = useMemo(() => {
    const status = metrics?.network?.status;
    const vals = metrics?.network?.values;
    const r = status === 'OK' && vals && Number.isFinite(vals.rxBps?.value) ? (vals.rxBps.value / 1024).toFixed(0) : (status === 'Error' ? 'Erro' : '...');
    const tx = status === 'OK' && vals && Number.isFinite(vals.txBps?.value) ? (vals.txBps.value / 1024).toFixed(0) : (status === 'Error' ? 'Erro' : '...');
    return { rxKb: r, txKb: tx, netStatus: status };
  }, [metrics?.network]);

  const { isHealthy, healthFactors } = useMemo(() => {
    const factors: string[] = [];
    let healthy = true;

    if (cpuVal != null && cpuVal >= 85) { healthy = false; factors.push(`CPU ${cpuVal.toFixed(0)}%`); }
    if (memPct != null && memPct >= 90) { healthy = false; factors.push(`RAM ${memPct.toFixed(0)}%`); }
    if (diskActivityVal != null && diskActivityVal >= 95) { healthy = false; factors.push(`Disco ${diskActivityVal.toFixed(0)}%`); }

    const dUseNum = parseFloat(diskUse);
    if (!isNaN(dUseNum) && dUseNum >= 90) { healthy = false; factors.push(`C: cheio ${dUseNum.toFixed(0)}%`); }

    const errorCount = [metrics?.cpu?.status, metrics?.ram?.status, metrics?.storage?.status, metrics?.network?.status]
      .filter(s => s === 'Error').length;
    if (errorCount >= 3) { factors.push('Sensores offline'); }
    // The red security score must not sit next to a green "Optimal".
    if (securityScore != null && securityScore < 50) { healthy = false; factors.push(`${t('dashboard.securityShort', 'Segurança')} ${securityScore}/100`); }

    return { isHealthy: healthy, healthFactors: factors };
  }, [cpuVal, memPct, diskActivityVal, diskUse, metrics, securityScore, t]);

  const junkText = useMemo(() => {
    if (junkLoading && !junk) return 'Buscando...';
    if (junk?.ok && typeof junk?.bytes === 'number') {
      return `${junk?.truncated ? '≥ ' : ''}${formatBytes(junk.bytes)}`;
    }
    return '--';
  }, [junk, junkLoading]);

  const securityText = useMemo(() => {
    if (securityLoading && securityScore == null) return 'Calculando...';
    if (securityScore != null) return `${securityScore}/100`;
    return 'Offline';
  }, [securityScore, securityLoading]);

  const gpuLoadVal = useMemo(() => {
    const v = metrics?.gpu?.values?.gpus?.[0]?.utilization?.value;
    return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
  }, [metrics?.gpu]);

  const gpuName = useMemo(() => {
    return metrics?.gpu?.values?.gpus?.[0]?.name || 'GPU';
  }, [metrics?.gpu]);

  const gpuTemp = useMemo(() => {
    // GPU temperature only (temps.main is the CPU): the GPU probe already merges nvidia-smi and the advanced sensors.
    const probe = metrics?.temps?.values?.probes?.find((p: any) => p.category === 'gpu')?.temperature;
    const v = probe?.value ?? metrics?.gpu?.values?.gpus?.[0]?.temperature?.value;
    return v != null && Number.isFinite(Number(v)) ? Number(v).toFixed(0) : null;
  }, [metrics?.temps, metrics?.gpu]);

  const dpcVal = useMemo(() => {
    const v = metrics?.latency?.values?.dpcsQueued?.value;
    return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
  }, [metrics?.latency]);

  const cpuLoadHistory = useSensorHistory(cpuVal, 40, metrics);
  const memPctHistory = useSensorHistory(memPct, 40, metrics);
  const gpuLoadHistory = useSensorHistory(gpuLoadVal, 40, metrics);
  const dpcHistory = useSensorHistory(dpcVal, 40, metrics);

  const handleOptimizeRam = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isOptimizingRam) return;
    setIsOptimizingRam(true);
    setCleanFeedback('Otimizando memória RAM e liberando WorkingSets...');
    try {
      if (window.darkhub?.optimizer?.applyTweak) {
        const res = await window.darkhub.optimizer.applyTweak('optimize-ram');
        if (res?.ok) {
          const mbFreed = res?.freedBytes ? Math.round(res.freedBytes / (1024 * 1024)) : 0;
          setCleanFeedback(mbFreed > 0
            ? `Memória RAM otimizada! (${mbFreed} MB liberados)`
            : 'Nenhuma RAM adicional pôde ser liberada. O Windows já gerencia a memória.');
          addActivity?.({
            type: 'optimization',
            label: 'Otimização de Memória RAM',
            sublabel: `${mbFreed} MB liberados (medido)`
          });
        } else {
          setCleanFeedback(res?.error ?? 'Falha na otimização de RAM.');
        }
      }
    } catch (err: any) {
      setCleanFeedback(err?.message ?? 'Erro ao otimizar RAM');
    } finally {
      setIsOptimizingRam(false);
      setTimeout(() => setCleanFeedback(null), 4000);
    }
  };

  const handleCleanJunk = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isCleaningJunk) return;
    setIsCleaningJunk(true);
    setCleanFeedback('Limpando arquivos temporários e cache...');
    try {
      if (window.darkhub?.optimizer?.applyTweak) {
        const res = await window.darkhub.optimizer.applyTweak('clean-temp');
        if (res?.ok) {
          setCleanFeedback('Limpeza concluída com sucesso!');
          addActivity?.({
            type: 'junkClean',
            label: 'Limpeza de Lixo e Cache',
            sublabel: 'Arquivos temporários e MRU excluídos'
          });
          refreshJunk?.(true);
        } else {
          setCleanFeedback(res?.error ?? 'Falha na limpeza.');
        }
      }
    } catch (err: any) {
      setCleanFeedback(err?.message ?? 'Erro na limpeza');
    } finally {
      setIsCleaningJunk(false);
      setTimeout(() => setCleanFeedback(null), 4000);
    }
  };

  const handleCreateRestorePoint = async () => {
    setQuickActionBusy('restore');
    try {
      const res = await window.darkhub?.optimizer?.createRestorePoint?.();
      if (res?.ok) {
        setCleanFeedback('Ponto de restauração criado!');
        addActivity?.({
          type: 'system',
          label: 'Ponto de Restauração Criado',
          sublabel: 'Proteção do Sistema'
        });
      } else {
        setCleanFeedback(res?.error ?? 'Falha ao criar ponto');
      }
    } catch (e: any) {
      setCleanFeedback(e?.message ?? 'Erro ao criar ponto');
    } finally {
      setQuickActionBusy(null);
      setTimeout(() => setCleanFeedback(null), 4000);
    }
  };

  const handleRepairWindows = async () => {
    setQuickActionBusy('repair');
    try {
      if (window.darkhub?.optimizer?.applyTweak) {
        await window.darkhub.optimizer.applyTweak('repair-windows');
        setCleanFeedback('Processo de reparo SFC/DISM iniciado em nova janela.');
        addActivity?.({
          type: 'optimization',
          label: 'Reparo do Windows (SFC / DISM)',
          sublabel: 'Verificação de integridade'
        });
      }
    } catch (e: any) {
      setCleanFeedback(e?.message ?? 'Erro ao iniciar reparo');
    } finally {
      setQuickActionBusy(null);
      setTimeout(() => setCleanFeedback(null), 4000);
    }
  };

  const handleResolveSecurity = (checkId: string) => {
    setSecurityOpen(false);
    if (checkId === 'firewall' || checkId === 'uac') {
      if (onNavigate) onNavigate('optimizer');
    } else if (checkId.toLowerCase().includes('defender')) {
      if (onNavigate) onNavigate('security');
    } else {
      if (onNavigate) onNavigate('security');
    }
  };

  const handleOpenWindowsSecurity = () => {
    try {
      if (window.darkhub?.shell?.openExternal) {
        window.darkhub.shell.openExternal('windowsdefender:');
      }
    } catch {}
  };

  // Header status reflects the real sensor state: waiting, offline, attention or normal (never green by default).
  const sensorStatuses = [metrics?.cpu?.status, metrics?.ram?.status, metrics?.storage?.status, metrics?.network?.status];
  const sensorsOffline = sensorStatuses.filter(s => s === 'Error').length >= 3;
  const sensorsReady = sensorStatuses.some(s => s === 'OK');
  const statusKind: 'pending' | 'offline' | 'ok' | 'warn' = sensorsOffline
    ? 'offline'
    : !sensorsReady ? 'pending' : isHealthy ? 'ok' : 'warn';
  const statusLabel = statusKind === 'pending'
    ? t('dashboard.statusReading', 'Lendo sensores')
    : statusKind === 'offline'
      ? t('dashboard.statusOffline', 'Sensores offline')
      : statusKind === 'ok'
        ? t('dashboard.statusOptimal')
        : healthFactors.length > 0 ? healthFactors.join(', ') : t('dashboard.statusHighLoad');
  const statusDot = statusKind === 'ok' ? 'bg-emerald-400' : statusKind === 'warn' ? 'bg-amber-400' : statusKind === 'offline' ? 'bg-red-400' : 'bg-zinc-600';

  const cpuTone = cpuVal != null && cpuVal >= 85 ? 'text-amber-300' : 'text-zinc-50';
  const memTone = memPct != null && memPct >= 90 ? 'text-red-300' : memPct != null && memPct >= 80 ? 'text-amber-300' : 'text-zinc-50';
  const diskTone = diskActivityVal != null && diskActivityVal >= 95 ? 'text-amber-300' : 'text-zinc-50';
  const scoreTone = securityScore == null ? 'text-zinc-50' : securityScore < 50 ? 'text-red-300' : securityScore < 80 ? 'text-amber-300' : 'text-zinc-50';
  const glacier = 'var(--color-blue-400)';

  const telemetry = [
    {
      key: 'cpu', icon: Cpu, label: 'CPU Core Load', onClick: () => onNavigate && onNavigate('monitor'),
      value: cpuVal != null ? <span className={cpuTone}>{cpuVal.toFixed(1)}<span className="text-zinc-500">%</span></span> : null,
      chart: <Sparkline data={cpuLoadHistory} min={0} max={100} color={glacier} height={32} strokeWidth={1.25} />
    },
    {
      key: 'gpu', icon: Monitor, label: gpuName || 'GPU 3D Engine', onClick: () => onNavigate && onNavigate('monitor'),
      value: gpuLoadVal != null
        ? <span>{gpuLoadVal.toFixed(1)}<span className="text-zinc-500">%</span>{gpuTemp ? <span className="ml-1.5 text-zinc-500">{gpuTemp}°C</span> : null}</span>
        : null,
      chart: <Sparkline data={gpuLoadHistory} min={0} max={100} color={glacier} height={32} strokeWidth={1.25} />
    },
    {
      key: 'ram', icon: Server, label: t('dashboard.ramInUse', 'RAM em uso'), onClick: handleOptimizeRam, title: 'Clique para flush imediato de RAM',
      value: memPct != null ? <span className={memTone}>{memPct.toFixed(1)}<span className="text-zinc-500">%</span></span> : null,
      chart: <Sparkline data={memPctHistory} min={0} max={100} color={glacier} height={32} strokeWidth={1.25} />
    },
    {
      key: 'dpc', icon: Activity, label: t('dashboard.dpcRate', 'DPCs por segundo'), onClick: () => onNavigate && onNavigate('monitor'),
      value: dpcVal != null ? <span>{dpcVal}<span className="text-zinc-500"> /s</span></span> : null,
      chart: <Sparkline data={dpcHistory} min={0} max={Math.max(500, ...(dpcHistory || [500]))} color={glacier} height={32} strokeWidth={1.25} />
    }
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title={t('dashboard.title')}
        subtitle={t('dashboard.subtitle')}
        actions={
          <div role="status" className="flex items-center gap-2 h-8 px-3 rounded-md border border-zinc-800 bg-zinc-900/50 text-[12px] text-zinc-300 max-w-[360px]">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot}`} />
            <span className="truncate font-mono" title={statusLabel}>{statusLabel}</span>
          </div>
        }
      />

      {cleanFeedback && (
        <div role="status" className="animate-in rounded-lg border border-zinc-800 bg-zinc-900/60 px-3.5 py-2.5 text-[12.5px] text-zinc-300">
          {cleanFeedback}
        </div>
      )}

      {/* Metric strip: one instrument row, hairline dividers, label over mono value */}
      <section aria-label={t('dashboard.title')} className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-px rounded-xl border border-zinc-800/80 bg-zinc-800/70 overflow-hidden">
        <MetricCell
          icon={Cpu}
          label={t('dashboard.cpu')}
          hint={t('dashboard.chart', 'Gráfico')}
          title="Clique para abrir o Monitor de Sensores e Hardware"
          onClick={() => onNavigate && onNavigate('monitor')}
          sub={cpuTopology?.logical_cores ? `${cpuTopology.logical_cores} threads` : null}
        >
          <Reading value={cpuLoad} unit="%" tone={cpuTone} />
        </MetricCell>

        <MetricCell
          icon={isOptimizingRam ? Loader2 : Layers}
          label={t('dashboard.ram')}
          hint={t('dashboard.free', 'Liberar')}
          title="Clique para otimizar a memória RAM e liberar WorkingSets"
          onClick={handleOptimizeRam}
        >
          {isOptimizingRam
            ? <span className="text-[13px] text-zinc-400 font-sans">{t('dashboard.cleaning', 'Cleaning...')}</span>
            : <Reading value={memUsage} unit="%" tone={memTone} />}
        </MetricCell>

        <MetricCell
          icon={Trash2}
          label={t('dashboard.junk')}
          title="Clique para limpar arquivos temporários e cache"
          onClick={handleCleanJunk}
          aside={
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); refreshJunk?.(true); }}
              disabled={junkLoading}
              title="Recalcular lixo e caches residuais"
              aria-label="Recalcular lixo e caches residuais"
              className="-my-1 -mr-1 p-1 rounded text-zinc-600 hover:text-blue-300 hover:bg-zinc-800 disabled:opacity-60"
            >
              <RefreshCw size={12} className={junkLoading ? 'animate-spin text-blue-300' : ''} />
            </button>
          }
          sub={<span className="text-blue-300 opacity-0 group-hover:opacity-100 transition-opacity font-sans">{t('dashboard.clean', 'Limpar')}</span>}
        >
          {isCleaningJunk
            ? <span className="text-[13px] text-zinc-400 font-sans">{t('dashboard.cleaning', 'Cleaning...')}</span>
            : (junkLoading && !junk) ? <Skel w="w-20" /> : <span className="text-zinc-50">{junkText}</span>}
        </MetricCell>

        <MetricCell
          icon={HardDrive}
          label={t('dashboard.diskActivity', 'Atividade de disco')}
          title="Clique para abrir as Otimizações de Disco e Sistema"
          onClick={() => onNavigate && onNavigate('optimizer')}
          sub={diskStatus === 'OK' && diskReadKb !== '...'
            ? <>R {diskReadKb}<span className="text-zinc-600">K</span> · W {diskWriteKb}<span className="text-zinc-600">K</span></>
            : <span className="font-sans">{t('dashboard.checkingDrive', 'Checking C:')}</span>}
        >
          <Reading value={diskActivityPct} unit="%" tone={diskTone} />
        </MetricCell>

        <MetricCell
          icon={ArrowDownUp}
          label={t('dashboard.network')}
          title="Clique para abrir Ferramentas e Diagnóstico de Rede"
          onClick={() => onNavigate && onNavigate('networktools')}
          sub={netStatus === 'OK' && rxKb !== '...' ? <>↑ {txKb}<span className="text-zinc-600"> KB/s</span></> : null}
        >
          {netStatus === 'OK' && rxKb !== '...'
            ? <span className="text-zinc-50">↓ {rxKb}<span className="ml-0.5 text-[12px] text-zinc-500">KB/s</span></span>
            : netStatus === 'Error' ? <Reading value="Erro" /> : <Skel w="w-20" />}
        </MetricCell>

        <MetricCell
          icon={Shield}
          label={t('dashboard.securityScore')}
          hint={t('dashboard.audit', 'Auditoria')}
          onClick={() => setSecurityOpen(true)}
        >
          {securityLoading && securityScore == null
            ? <Skel w="w-16" />
            : securityScore != null
              ? <span className={scoreTone}>{securityScore}<span className="text-[12px] text-zinc-500">/100</span></span>
              : <span className="text-[13px] text-zinc-500 font-sans">{securityText}</span>}
        </MetricCell>
      </section>

      {/* Low-level telemetry */}
      <section className="dh-card overflow-hidden" aria-labelledby="dash-telemetry">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 border-b border-zinc-800/80">
          <div className="flex items-baseline gap-2.5">
            <h2 id="dash-telemetry" className="dh-section-title">{t('dashboard.telemetryTitle', 'Telemetria de Baixo Nível & Kernel')}</h2>
            <span className="dh-tag">pdh · win32</span>
          </div>
          <dl className="flex items-center gap-4 text-[11.5px]">
            <div className="flex items-center gap-1.5">
              <dt className="flex items-center gap-1 text-zinc-500"><Clock size={13} /> Timer</dt>
              <dd className="font-mono text-zinc-100">
                {timerInfo?.current_ms != null && timerInfo.current_ms > 0
                  ? <>{timerInfo.current_ms.toFixed(4)}<span className="text-zinc-500"> ms</span></>
                  : <span className="text-zinc-600">--</span>}
              </dd>
            </div>
            {cpuTopology?.logical_cores ? (
              <div className="font-mono text-zinc-300">
                {cpuTopology.logical_cores}<span className="text-zinc-500"> threads</span>
                {cpuTopology.physical_cores ? <> · {cpuTopology.physical_cores}<span className="text-zinc-500"> cores</span></> : null}
              </div>
            ) : null}
          </dl>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-zinc-800/60">
          {telemetry.map(({ key, icon: Icon, label, onClick, value, chart, title }: any) => (
            <div
              key={key}
              role="button"
              tabIndex={0}
              title={title}
              onClick={onClick}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }}
              className="group bg-zinc-900 hover:bg-zinc-900/60 px-4 pt-3 pb-2.5 cursor-pointer outline-none focus-visible:bg-zinc-900/60 transition-colors min-w-0"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 min-w-0 text-[11.5px] text-zinc-500" title={label}>
                  <Icon size={13} className="shrink-0 group-hover:text-blue-300 transition-colors" />
                  <span className="truncate">{label}</span>
                </span>
                <span className="font-mono text-[13px] text-zinc-50 tabular-nums whitespace-nowrap">{value ?? <Skel w="w-10" h="h-3.5" />}</span>
              </div>
              <div className="mt-2 h-8">{chart}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Maintenance */}
      <section aria-labelledby="dash-maint" className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <h2 id="dash-maint" className="dh-section-title">{t('dashboard.quickMaintenance', 'Quick Maintenance Actions:').replace(/:\s*$/, '')}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={handleCleanJunk} disabled={isCleaningJunk} className="dh-btn dh-btn-primary dh-btn-sm">
            {isCleaningJunk ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            <span>{t('dashboard.cleanTempRecycle', 'Clean Temp & Recycle Bin')}</span>
          </button>
          <button onClick={handleOptimizeRam} disabled={isOptimizingRam} className="dh-btn dh-btn-sm">
            {isOptimizingRam ? <Loader2 size={13} className="animate-spin" /> : <Layers size={13} />}
            <span>{t('dashboard.optimizeRam', 'Optimize RAM')}</span>
          </button>
          <button onClick={handleCreateRestorePoint} disabled={quickActionBusy === 'restore'} className="dh-btn dh-btn-sm">
            {quickActionBusy === 'restore' ? <Loader2 size={13} className="animate-spin" /> : <Shield size={13} />}
            <span>{t('dashboard.createRestorePoint', 'Restore Point')}</span>
          </button>
          <button onClick={handleRepairWindows} disabled={quickActionBusy === 'repair'} className="dh-btn dh-btn-sm">
            {quickActionBusy === 'repair' ? <Loader2 size={13} className="animate-spin" /> : <Wrench size={13} />}
            <span>{t('dashboard.repairWindows', 'Repair Windows (SFC)')}</span>
          </button>
          {onNavigate && (
            <button onClick={() => onNavigate('dlss5')} className="dh-btn dh-btn-ghost dh-btn-sm">
              <Sparkles size={13} />
              <span>DLSS 5 Manager</span>
            </button>
          )}
        </div>
      </section>

      {securityOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 animate-in" onClick={() => setSecurityOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dash-sec-title"
            className="w-full max-w-2xl dh-card dh-raised bg-zinc-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3.5 border-b border-zinc-800/80">
              <div>
                <h2 id="dash-sec-title" className="text-[15px] font-semibold tracking-[-0.01em] text-zinc-50">{t('dashboard.securityScoreTitle', 'System Security Score')}</h2>
                <p className="dh-help mt-0.5">{t('dashboard.securityScoreSubtitle', 'Native audit with 1-click issue resolution')}</p>
              </div>
              <button type="button" onClick={() => setSecurityOpen(false)} className="dh-btn dh-btn-sm">
                {t('common.close', 'Close')}
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div className="flex items-baseline justify-between">
                <span className="text-[12px] text-zinc-500">{t('dashboard.consolidatedScore', 'Consolidated Score:').replace(/:\s*$/, '')}</span>
                <span className="font-mono text-[22px] leading-none tabular-nums">
                  {securityScore != null
                    ? <span className={securityScore >= 80 ? 'text-emerald-300' : scoreTone}>{securityScore}<span className="text-[13px] text-zinc-500">/100</span></span>
                    : securityLoading ? <Skel w="w-16" /> : <span className="text-zinc-600">--</span>}
                </span>
              </div>

              <div className="rounded-lg border border-zinc-800/80 divide-y divide-zinc-800/80 max-h-80 overflow-y-auto">
                {(securityChecks ?? []).length ? (
                  (securityChecks ?? []).map((c: any) => (
                    <div key={c.id} className="px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-zinc-950/40 transition-colors">
                      <div className="min-w-0">
                        <div className="text-[12.5px] text-zinc-200 truncate">{c.title}</div>
                        <div className="text-[11px] text-zinc-500 mt-0.5">Peso no Score: <span className="font-mono">{c.weight}</span> pontos</div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`flex items-center gap-1.5 text-[11.5px] ${c.ok ? 'text-emerald-300' : 'text-amber-300'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${c.ok ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                          {c.ok ? t('dashboard.protected', 'Protected') : t('dashboard.riskDetected', 'Risk Detected')}
                        </span>
                        {!c.ok ? (
                          <button onClick={() => handleResolveSecurity(c.id)} className="dh-btn dh-btn-accent dh-btn-sm">
                            {t('common.resolve', 'Resolve')}
                          </button>
                        ) : (
                          <button onClick={() => handleResolveSecurity(c.id)} className="dh-btn dh-btn-ghost dh-btn-sm">
                            {t('common.adjust', 'Adjust')}
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                ) : securityLoading ? (
                  <div className="p-3.5 space-y-3" aria-label="Executando auditoria do sistema...">
                    {[0, 1, 2, 3].map(i => (
                      <div key={i} className="flex items-center justify-between">
                        <Skel w="w-48" h="h-3" />
                        <Skel w="w-20" h="h-3" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="px-4 py-6 text-[12.5px] text-zinc-500 text-center">Sem detalhes de auditoria disponíveis.</p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="dh-help">{t('dashboard.checkGlobalWinSec', 'Check Windows Security Settings?')}</span>
                <button onClick={handleOpenWindowsSecurity} className="dh-btn dh-btn-sm">
                  <Shield size={13} />
                  <span>Abrir Central de Segurança do Windows</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent activity */}
      <section className="dh-card p-4" aria-labelledby="dash-recent">
        <div className="flex items-center justify-between mb-2">
          <h2 id="dash-recent" className="dh-section-title">{t('dashboard.recent')}</h2>
          {activities.length > 0 ? <span className="dh-tag">{Math.min(6, activities.length)} / {activities.length}</span> : null}
        </div>

        {activities.length === 0 ? (
          <p className="py-5 text-[12.5px] text-zinc-500">{t('dashboard.noActivity', 'No activity recorded yet.')}</p>
        ) : (
          <ul className="divide-y divide-zinc-800/80">
            {activities.slice(0, 6).map((a: any) => (
              <li key={a.id} className="flex items-center justify-between gap-4 py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="shrink-0">{(activityIcon as any)[a.type] ?? activityIcon.system}</span>
                  <div className="min-w-0">
                    <span className="block text-[12.5px] text-zinc-200 truncate">{a.label}</span>
                    {a.sublabel && <span className="block text-[11.5px] text-zinc-500 truncate">{a.sublabel}</span>}
                  </div>
                </div>
                <span className="shrink-0 text-[11px] text-zinc-500 font-mono whitespace-nowrap">{timeAgo(a.timestamp)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default Dashboard;
