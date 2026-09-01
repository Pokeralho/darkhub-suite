import React, { useState, useMemo, useEffect } from 'react';
import {
  Shield, Zap, Cpu, Activity, HardDrive, ArrowDownUp, Gamepad2, Wrench,
  CheckCircle, AlertTriangle, Trash2, Loader2, Sparkles, RefreshCw, Layers,
  Clock, Monitor, Server
} from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { HelpTip } from '../components/HelpTip';
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
  gameStarted: <Gamepad2 size={14} className="text-emerald-400" />,
  gameStopped: <Gamepad2 size={14} className="text-indigo-400" />,
  gameUpdated: <Gamepad2 size={14} className="text-blue-400" />,
  optimization: <Wrench size={14} className="text-amber-400" />,
  security: <Shield size={14} className="text-purple-400" />,
  junkClean: <Zap size={14} className="text-blue-400" />,
  benchmark: <Activity size={14} className="text-rose-400" />,
  system: <CheckCircle size={14} className="text-zinc-400" />,
};

interface DashboardProps {
  onNavigate?: (page: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { t } = useI18n();
  const metrics = useSystemMetrics();
  const { securityScore, securityChecks, loading: securityLoading } = useSecurityScore();
  const { junk, loading: junkLoading, refresh: refreshJunk } = useJunkScanner() as any;
  const { activities, addActivity } = useRecentActivity();
  const [securityOpen, setSecurityOpen] = useState(false);
  const [isCleaningJunk, setIsCleaningJunk] = useState(false);
  const [isOptimizingRam, setIsOptimizingRam] = useState(false);
  const [cleanFeedback, setCleanFeedback] = useState<string | null>(null);
  const [quickActionBusy, setQuickActionBusy] = useState<string | null>(null);
  const [timerInfo, setTimerInfo] = useState<{ current_ms?: number; locked?: boolean } | null>(null);
  const [cpuTopology, setCpuTopology] = useState<any>(null);

  useEffect(() => {
    window.darkhub?.latency?.queryTimer?.().then((res: any) => {
      if (res?.ok && res?.data) setTimerInfo(res.data);
    }).catch(() => {});

    window.darkhub?.latency?.getCpuTopology?.().then((res: any) => {
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

      if (Number.isFinite(actV)) {
        actVal = Math.max(0, Math.min(100, actV));
        actPct = actVal.toFixed(1);
      } else if (Number.isFinite(readVal) && Number.isFinite(writeVal)) {
        const totalMbps = (readVal + writeVal) / (1024 * 1024);
        actVal = Math.max(0, Math.min(100, (totalMbps / 7000) * 100));
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

    return { isHealthy: healthy, healthFactors: factors };
  }, [cpuVal, memPct, diskActivityVal, diskUse, metrics]);

  const junkText = useMemo(() => {
    if (junkLoading && !junk) return 'Buscando...';
    if (junk?.ok && typeof junk?.bytes === 'number') {
      return `${junk?.truncated ? '≥ ' : ''}${formatBytes(junk.bytes)}`;
    }
    return '0 B';
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
    return metrics?.gpu?.values?.gpus?.[0]?.name?.value ?? 'GPU';
  }, [metrics?.gpu]);

  const gpuTemp = useMemo(() => {
    const v = metrics?.temps?.values?.main?.value ?? metrics?.gpu?.values?.gpus?.[0]?.temperature?.value;
    return v != null && Number.isFinite(Number(v)) ? Number(v).toFixed(0) : null;
  }, [metrics?.temps, metrics?.gpu]);

  const dpcVal = useMemo(() => {
    const v = metrics?.latency?.values?.dpcsQueued?.value;
    return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
  }, [metrics?.latency]);

  const cpuLoadHistory = useSensorHistory(cpuVal, 40);
  const memPctHistory = useSensorHistory(memPct, 40);
  const gpuLoadHistory = useSensorHistory(gpuLoadVal, 40);
  const dpcHistory = useSensorHistory(dpcVal, 40);

  const handleOptimizeRam = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isOptimizingRam) return;
    setIsOptimizingRam(true);
    setCleanFeedback('Otimizando memória RAM e liberando WorkingSets...');
    try {
      if (window.darkhub?.optimizer?.applyTweak) {
        const res = await window.darkhub.optimizer.applyTweak('optimize-ram');
        if (res?.ok) {
          const mbFreed = res?.freedBytes ? (res.freedBytes / (1024 * 1024)).toFixed(0) : 'vários';
          setCleanFeedback(`Memória RAM otimizada! (${mbFreed} MB liberados)`);
          addActivity?.({
            type: 'optimization',
            label: 'Otimização de Memória RAM',
            sublabel: `WorkingSets limpos (${mbFreed} MB)`
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

  return (
    <div className="space-y-4 max-w-6xl mx-auto p-1 md:p-2 animate-fadeIn">
      {}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
        <div>
          <h1 className="text-lg font-bold text-zinc-100 tracking-tight">{t('dashboard.title')}</h1>
          <p className="text-xs text-zinc-400">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center space-x-2 text-xs font-mono bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-md text-zinc-300 shrink-0">
          <span className={`w-2 h-2 rounded-full ${isHealthy ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
          <span>
            {isHealthy
              ? t('dashboard.statusOptimal')
              : healthFactors.length > 0
                ? healthFactors.join(', ')
                : t('dashboard.statusHighLoad')}
          </span>
        </div>
      </div>

      {cleanFeedback && (
        <div className="p-2.5 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs font-mono flex items-center justify-between animate-fadeIn">
          <span>{cleanFeedback}</span>
        </div>
      )}

      {}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {}
        <div
          onClick={() => onNavigate && onNavigate('monitor')}
          title="Clique para abrir o Monitor de Sensores e Hardware"
          className="p-3.5 rounded-lg border border-zinc-800 hover:border-amber-500/50 bg-zinc-900 hover:bg-zinc-850 flex items-center space-x-3.5 min-w-0 cursor-pointer transition-colors group"
        >
          <div className={`p-2.5 rounded-md group-hover:scale-105 transition-transform shrink-0 ${cpuVal != null && cpuVal >= 85 ? 'bg-amber-400/15 text-amber-300' : 'bg-amber-400/10 text-amber-400'}`}>
            <Cpu size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-zinc-400 font-medium flex items-center gap-1">
              {t('dashboard.cpu')}
              <span className="text-[9px] px-1 bg-amber-500/20 text-amber-300 rounded uppercase">{t('dashboard.chart', 'CHART')}</span>
            </p>
            <p className="text-base sm:text-lg font-bold text-zinc-100 tabular-nums whitespace-nowrap font-mono">
              {cpuLoad !== '...' && cpuLoad !== 'Erro' ? `${cpuLoad}%` : cpuLoad}
            </p>
          </div>
        </div>

        {}
        <div
          onClick={handleOptimizeRam}
          title="Clique para otimizar a memória RAM e liberar WorkingSets"
          className="p-3.5 rounded-lg border border-zinc-800 hover:border-emerald-500/50 bg-zinc-900 hover:bg-zinc-850 flex items-center justify-between min-w-0 cursor-pointer transition-colors group"
        >
          <div className="flex items-center space-x-3.5 min-w-0">
            <div className={`p-2.5 rounded-md group-hover:scale-105 transition-transform shrink-0 ${memPct != null && memPct >= 90 ? 'bg-rose-400/15 text-rose-300' : 'bg-emerald-400/10 text-emerald-400'}`}>
              {isOptimizingRam ? <Loader2 size={20} className="animate-spin" /> : <Activity size={20} />}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-zinc-400 font-medium flex items-center gap-1">
                {t('dashboard.ram')}
                <span className="text-[9px] px-1 bg-emerald-500/20 text-emerald-300 rounded uppercase">{t('dashboard.free', 'FREE')}</span>
              </p>
              <p className="text-base sm:text-lg font-bold text-zinc-100 tabular-nums whitespace-nowrap font-mono">
                {isOptimizingRam ? t('dashboard.cleaning', 'Cleaning...') : (memUsage !== '...' && memUsage !== 'Erro' ? `${memUsage}%` : memUsage)}
              </p>
            </div>
          </div>
        </div>

        {}
        <div
          onClick={handleCleanJunk}
          title="Clique para limpar arquivos temporários e cache"
          className="p-3.5 rounded-lg border border-zinc-800 hover:border-blue-500/50 bg-zinc-900 hover:bg-zinc-850 flex items-center justify-between min-w-0 cursor-pointer transition-colors group"
        >
          <div className="flex items-center space-x-3.5 min-w-0">
            <div className="p-2.5 rounded-md bg-blue-400/10 text-blue-400 group-hover:scale-105 transition-transform shrink-0">
              {isCleaningJunk ? <Loader2 size={20} className="animate-spin" /> : <Trash2 size={20} />}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-zinc-400 font-medium flex items-center gap-1">
                {t('dashboard.junk')}
                <span className="text-[9px] px-1 bg-blue-500/20 text-blue-300 rounded uppercase">{t('dashboard.clean', 'CLEAN')}</span>
              </p>
              <p className="text-base sm:text-lg font-bold text-zinc-100 tabular-nums whitespace-nowrap font-mono">
                {isCleaningJunk ? t('dashboard.cleaning', 'Cleaning...') : junkText}
              </p>
            </div>
          </div>
        </div>

        {}
        <div
          onClick={() => onNavigate && onNavigate('optimizer')}
          title="Clique para abrir as Otimizações de Disco e Sistema"
          className="p-3.5 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-900 hover:bg-zinc-850 flex items-center space-x-3.5 min-w-0 cursor-pointer transition-colors group"
        >
          <div className={`p-2.5 rounded-md group-hover:scale-105 transition-transform shrink-0 ${diskActivityVal != null && diskActivityVal >= 95 ? 'bg-amber-400/15 text-amber-300' : 'bg-zinc-800 text-zinc-300'}`}>
            <HardDrive size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-zinc-400 font-medium">{t('dashboard.disk')}</p>
            <p className="text-base sm:text-lg font-bold text-zinc-100 tabular-nums whitespace-nowrap font-mono">
              {diskActivityPct !== '...' && diskActivityPct !== 'Erro' ? `${diskActivityPct}%` : diskActivityPct}
            </p>
            <p className="text-[10px] text-zinc-500 truncate">
              {diskStatus === 'OK' && diskReadKb !== '...' ? `↓ ${diskReadKb}K • ↑ ${diskWriteKb}K` : t('dashboard.checkingDrive', 'Checking C:')}
            </p>
          </div>
        </div>

        {}
        <div
          onClick={() => onNavigate && onNavigate('networktools')}
          title="Clique para abrir Ferramentas e Diagnóstico de Rede"
          className="p-3.5 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-900 hover:bg-zinc-850 flex items-center space-x-3.5 min-w-0 cursor-pointer transition-colors group"
        >
          <div className="p-2.5 rounded-md bg-zinc-800 text-zinc-300 group-hover:scale-105 transition-transform shrink-0">
            <ArrowDownUp size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-zinc-400 font-medium">{t('dashboard.network')}</p>
            <p className="text-xs text-zinc-300 mt-1 truncate font-mono">
              {netStatus === 'OK' && rxKb !== '...' ? `↓ ${rxKb}K • ↑ ${txKb}K` : t('dashboard.networkActive', 'Network Active')}
            </p>
          </div>
        </div>

        {}
        <button
          type="button"
          onClick={() => setSecurityOpen(true)}
          className="p-3.5 rounded-lg border border-zinc-800 bg-zinc-900 flex items-center space-x-3.5 min-w-0 text-left hover:border-purple-500/50 hover:bg-zinc-850 transition-colors group"
        >
          <div className="p-2.5 rounded-md bg-purple-400/10 text-purple-400 group-hover:scale-105 transition-transform shrink-0">
            <Shield size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-zinc-400 font-medium flex items-center gap-1">
              {t('dashboard.securityScore')}
              <span className="text-[9px] px-1 bg-purple-500/20 text-purple-300 rounded uppercase">{t('dashboard.audit', 'AUDIT')}</span>
            </p>
            <p className="text-base sm:text-lg font-bold text-zinc-100 tabular-nums whitespace-nowrap font-mono">
              {securityText}
            </p>
          </div>
        </button>
      </div>

      {}
      <div className="p-3.5 sm:p-4 rounded-xl border border-zinc-800 bg-zinc-900/90 space-y-3 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-blue-400" />
            <h2 className="text-sm font-semibold text-zinc-100">{t('dashboard.telemetryTitle', 'Telemetria de Baixo Nível & Kernel')}</h2>
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
              PDH & Win32 Realtime
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-400">
            <span className="flex items-center gap-1 font-mono">
              <Clock size={13} className="text-blue-400" />
              Timer: <strong className="text-emerald-400">{timerInfo?.current_ms ? `${timerInfo.current_ms} ms` : '0.5000 ms'}</strong>
            </span>
            {cpuTopology?.logical_cores ? (
              <span className="font-mono text-zinc-300">
                {cpuTopology.logical_cores} Threads {cpuTopology.logical_cores >= 12 ? '• P-Cores Ready' : ''}
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {}
          <div
            onClick={() => onNavigate && onNavigate('monitor')}
            className="p-3 rounded-lg bg-zinc-950/70 border border-zinc-800/80 hover:border-amber-500/40 transition-colors cursor-pointer space-y-1.5 group"
          >
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-400 flex items-center gap-1.5"><Cpu size={13} className="text-amber-400" /> CPU Core Load</span>
              <span className="font-mono font-bold text-amber-300">{cpuVal != null ? `${cpuVal.toFixed(1)}%` : '—'}</span>
            </div>
            <div className="h-8">
              <Sparkline data={cpuLoadHistory} min={0} max={100} color="#f59e0b" height={32} />
            </div>
          </div>

          {}
          <div
            onClick={() => onNavigate && onNavigate('monitor')}
            className="p-3 rounded-lg bg-zinc-950/70 border border-zinc-800/80 hover:border-purple-500/40 transition-colors cursor-pointer space-y-1.5 group"
          >
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-400 flex items-center gap-1.5 truncate max-w-[130px]" title={gpuName}>
                <Monitor size={13} className="text-purple-400 shrink-0" /> {gpuName || 'GPU 3D Engine'}
              </span>
              <span className="font-mono font-bold text-purple-300">
                {gpuLoadVal != null ? `${gpuLoadVal.toFixed(1)}%` : '0.0%'}
                {gpuTemp ? <span className="text-[10px] text-zinc-500 ml-1 font-normal">({gpuTemp}°C)</span> : ''}
              </span>
            </div>
            <div className="h-8">
              <Sparkline data={gpuLoadHistory} min={0} max={100} color="#a855f7" height={32} />
            </div>
          </div>

          {}
          <div
            onClick={handleOptimizeRam}
            title="Clique para flush imediato de RAM"
            className="p-3 rounded-lg bg-zinc-950/70 border border-zinc-800/80 hover:border-emerald-500/40 transition-colors cursor-pointer space-y-1.5 group"
          >
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-400 flex items-center gap-1.5"><Server size={13} className="text-emerald-400" /> RAM WorkingSet</span>
              <span className="font-mono font-bold text-emerald-300">{memPct != null ? `${memPct.toFixed(1)}%` : '—'}</span>
            </div>
            <div className="h-8">
              <Sparkline data={memPctHistory} min={0} max={100} color="#10b981" height={32} />
            </div>
          </div>

          {}
          <div
            onClick={() => onNavigate && onNavigate('monitor')}
            className="p-3 rounded-lg bg-zinc-950/70 border border-zinc-800/80 hover:border-rose-500/40 transition-colors cursor-pointer space-y-1.5 group"
          >
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-400 flex items-center gap-1.5"><Activity size={13} className="text-rose-400" /> DPC/Interrupt Rate</span>
              <span className="font-mono font-bold text-rose-300">{dpcVal != null ? `${dpcVal} /s` : '0 /s'}</span>
            </div>
            <div className="h-8">
              <Sparkline data={dpcHistory} min={0} max={Math.max(500, ...(dpcHistory || [500]))} color="#f43f5e" height={32} />
            </div>
          </div>
        </div>
      </div>

      {}
      <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/80 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
          <Zap size={14} className="text-amber-400" />
          <span>{t('dashboard.quickMaintenance', 'Quick Maintenance Actions:')}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleOptimizeRam}
            disabled={isOptimizingRam}
            className="px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-750 text-zinc-200 text-xs font-medium flex items-center gap-1.5 transition-colors border border-zinc-700/60"
          >
            {isOptimizingRam ? <Loader2 size={13} className="animate-spin" /> : <Activity size={13} />}
            <span>{t('dashboard.optimizeRam', 'Optimize RAM')}</span>
          </button>
          <button
            onClick={handleCleanJunk}
            disabled={isCleaningJunk}
            className="px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-750 text-zinc-200 text-xs font-medium flex items-center gap-1.5 transition-colors border border-zinc-700/60"
          >
            {isCleaningJunk ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            <span>{t('dashboard.cleanTempRecycle', 'Clean Temp & Recycle Bin')}</span>
          </button>
          <button
            onClick={handleCreateRestorePoint}
            disabled={quickActionBusy === 'restore'}
            className="px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-750 text-zinc-200 text-xs font-medium flex items-center gap-1.5 transition-colors border border-zinc-700/60"
          >
            {quickActionBusy === 'restore' ? <Loader2 size={13} className="animate-spin" /> : <Shield size={13} />}
            <span>{t('dashboard.createRestorePoint', 'Restore Point')}</span>
          </button>
          <button
            onClick={handleRepairWindows}
            disabled={quickActionBusy === 'repair'}
            className="px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-750 text-zinc-200 text-xs font-medium flex items-center gap-1.5 transition-colors border border-zinc-700/60"
          >
            {quickActionBusy === 'repair' ? <Loader2 size={13} className="animate-spin" /> : <Wrench size={13} />}
            <span>{t('dashboard.repairWindows', 'Repair Windows (SFC)')}</span>
          </button>
        </div>
      </div>

      {}
      {securityOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSecurityOpen(false)}>
          <div className="w-full max-w-2xl rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <Shield size={18} className="text-purple-400" />
                <div>
                  <div className="text-zinc-100 font-semibold text-sm">{t('dashboard.securityScoreTitle', 'System Security Score')}</div>
                  <div className="text-xs text-zinc-500">{t('dashboard.securityScoreSubtitle', 'Native audit with 1-click issue resolution')}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSecurityOpen(false)}
                className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded transition-colors"
              >
                {t('common.close', 'Close')}
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                <span className="text-xs text-zinc-300 font-medium">{t('dashboard.consolidatedScore', 'Consolidated Score:')}</span>
                <span className="text-sm font-bold text-emerald-400 font-mono">{securityScore != null ? `${securityScore}/100` : '—'}</span>
              </div>

              <div className="border border-zinc-800 rounded-lg overflow-hidden max-h-80 overflow-y-auto">
                {(securityChecks ?? []).length ? (
                  (securityChecks ?? []).map((c: any) => (
                    <div key={c.id} className="px-3.5 py-3 border-b border-zinc-800 last:border-b-0 flex items-center justify-between gap-3 bg-zinc-950/60 hover:bg-zinc-900/60 transition-colors">
                      <div className="min-w-0">
                        <div className="text-xs text-zinc-200 font-medium truncate flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.ok ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                          <span>{c.title}</span>
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">Peso no Score: {c.weight} pontos</div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs font-semibold font-mono px-2 py-0.5 rounded ${c.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                          {c.ok ? t('dashboard.protected', 'Protected') : t('dashboard.riskDetected', 'Risk Detected')}
                        </span>

                        {!c.ok && (
                          <button
                            onClick={() => handleResolveSecurity(c.id)}
                            className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-medium rounded transition-colors"
                          >
                            {t('common.resolve', 'Resolve')}
                          </button>
                        )}
                        {c.ok && (
                          <button
                            onClick={() => handleResolveSecurity(c.id)}
                            className="px-2 py-1 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-[11px] rounded transition-colors border border-zinc-700/60"
                          >
                            {t('common.adjust', 'Adjust')}
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-6 text-xs text-zinc-500 bg-zinc-950 text-center">
                    {securityLoading ? 'Executando auditoria do sistema...' : 'Sem detalhes de auditoria disponíveis.'}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-zinc-500">{t('dashboard.checkGlobalWinSec', 'Check Windows Security Settings?')}</span>
                <button
                  onClick={handleOpenWindowsSecurity}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 text-xs font-medium rounded-md transition-colors border border-zinc-700/60 flex items-center gap-1.5"
                >
                  <Shield size={13} />
                  <span>Abrir Central de Segurança do Windows</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {}
      <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">{t('dashboard.recent')}</h2>
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono">{t('dashboard.live')}</span>
          </div>
        </div>

        {activities.length === 0 ? (
          <div className="py-6 flex flex-col items-center justify-center gap-1.5 text-zinc-600">
            <Activity size={24} className="opacity-40" />
            <p className="text-xs">{t('dashboard.noActivity', 'No activity recorded yet.')}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {activities.slice(0, 6).map((a) => (
              <div key={a.id} className="flex items-center justify-between py-2 border-b border-zinc-800/60 last:border-b-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex-shrink-0">{activityIcon[a.type] ?? activityIcon.system}</span>
                  <div className="min-w-0">
                    <span className="text-zinc-200 text-xs font-medium truncate block">{a.label}</span>
                    {a.sublabel && <span className="text-zinc-500 text-[11px]">{a.sublabel}</span>}
                  </div>
                </div>
                <span className="text-[11px] text-zinc-600 whitespace-nowrap ml-4 flex-shrink-0 font-mono">{timeAgo(a.timestamp)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;

