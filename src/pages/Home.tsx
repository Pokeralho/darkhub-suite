import React, { useState, useEffect } from 'react';
import {
  Zap, Activity, Gamepad2, Cpu, ShieldCheck,
  ArrowRight, CheckCircle2, Monitor,
  Layers, Terminal, Flame, RefreshCw, Play,
  Network, Wrench, ShieldAlert, FileText, Lock, ChevronRight
} from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';

interface HomeProps {
  onNavigate: (page: string) => void;
}

export const Home: React.FC<HomeProps> = ({ onNavigate }) => {
  const { t } = useI18n();
  const [sysSummary, setSysSummary] = useState<{
    cpu: string;
    ram: string;
    totalGb: string;
    freeGb: string;
    os: string;
    cores: number;
  } | null>(null);
  const [pgeBusy, setPgeBusy] = useState(false);
  const [pgeMessage, setPgeMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchInfo = async () => {
      if (window.darkhub?.system?.getInfo) {
        try {
          const info = await window.darkhub.system.getInfo();
          if (info) {
            const totalGb = info.memory?.totalGb || (info.memory?.total ? (info.memory.total / (1024 ** 3)).toFixed(1) : '32.0');
            const freeGb = info.memory?.freeGb || (info.memory?.free ? (info.memory.free / (1024 ** 3)).toFixed(1) : '16.0');
            const cpuName = (info.cpu?.name || info.cpu?.brand || info.cpu?.model || 'AMD Ryzen Processor').trim();
            const osName = info.os?.platform === 'win32' ? `Windows ${info.os.release?.startsWith('10.0.22') || info.os.release?.startsWith('10.0.26') ? '11' : '10'} x64` : info.os?.platform || 'Windows';
            setSysSummary({
              cpu: cpuName,
              ram: `${freeGb} GB livre de ${totalGb} GB`,
              totalGb,
              freeGb,
              os: osName,
              cores: info.cpu?.cores || 6
            });
          }
        } catch {}
      }
    };
    fetchInfo();
    const interval = setInterval(fetchInfo, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleLaunchPGE = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setPgeBusy(true);
    setPgeMessage(null);
    try {
      const res = await window.darkhub?.pge?.openPortable?.();
      if (res?.ok) {
        setPgeMessage(t('pge.launched', 'Launcher iniciado'));
      } else {
        setPgeMessage(res?.error ?? t('pge.errorLaunch', 'Erro ao iniciar'));
      }
    } catch (e: any) {
      setPgeMessage(e?.message ?? t('pge.errorOpen', 'Erro ao abrir'));
    } finally {
      setPgeBusy(false);
      setTimeout(() => setPgeMessage(null), 3500);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-3.5 p-1 md:p-2 animate-fadeIn">
      {}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
        <div>
          <h1 className="text-lg font-bold text-zinc-100 tracking-tight flex items-center gap-2">
            {t('home.title', 'Home Dashboard')}
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono font-normal">v0.4.6</span>
          </h1>
          <p className="text-xs text-zinc-400">{t('home.subtitle', 'Control Center, Kernel Optimization & Frame Pacing')}</p>
        </div>

        {sysSummary && (
          <div className="flex items-center gap-2.5 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-md text-xs text-zinc-300 shrink-0 font-mono">
            <div className="flex items-center gap-1.5 text-zinc-200 font-medium truncate max-w-[210px]">
              <Cpu size={13} className="text-blue-400 shrink-0" />
              <span className="truncate">{sysSummary.cpu.split(' @')[0]}</span>
            </div>
            <span className="text-zinc-700">|</span>
            <div className="text-zinc-400 text-[11px]">{sysSummary.freeGb} GB {t('home.freeOf', 'free of')} {sysSummary.totalGb} GB</div>
            <span className="text-zinc-700">|</span>
            <span className="text-emerald-400 flex items-center gap-1 text-[11px] font-sans font-medium shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {t('common.active', 'Active')}
            </span>
          </div>
        )}
      </div>

      {}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {}
        <div
          onClick={() => onNavigate('darkpacer')}
          className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850 rounded-lg p-3.5 cursor-pointer transition-colors flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="p-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-emerald-400 shrink-0">
                <Activity size={16} />
              </div>
              <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-750">
                DXGI HOOK
              </span>
            </div>
            <h2 className="text-sm font-semibold text-zinc-100 group-hover:text-emerald-400 transition-colors mb-1">
              {t('nav.darkpacer', 'DarkPacer (FPS Lock)')}
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-3">
              {t('home.darkpacerDesc', 'Frame rate limiter and 1% Low stabilization with microsecond precision via VMT Hooking.')}
            </p>
          </div>
          <div className="flex items-center text-xs font-medium text-emerald-400 pt-1">
            <span>{t('home.configPacing', 'Configure Pacing')}</span>
            <ChevronRight size={13} className="ml-1 group-hover:tranzinc-x-0.5 transition-transform" />
          </div>
        </div>

        {}
        <div
          onClick={() => onNavigate('optiscaler')}
          className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850 rounded-lg p-3.5 cursor-pointer transition-colors flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="p-1.5 bg-blue-500/10 border border-blue-500/20 rounded text-blue-400 shrink-0">
                <Cpu size={16} />
              </div>
              <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-750">
                DLSS / FSR / XeSS
              </span>
            </div>
            <h2 className="text-sm font-semibold text-zinc-100 group-hover:text-blue-400 transition-colors mb-1">
              {t('nav.optiscaler', 'OptiScaler Manager')}
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-3">
              {t('home.optiscalerDesc', 'Universal upscaling management, DLL injection and backup snapshots with 1-click restore.')}
            </p>
          </div>
          <div className="flex items-center text-xs font-medium text-blue-400 pt-1">
            <span>{t('home.manageGames', 'Manage Games')}</span>
            <ChevronRight size={13} className="ml-1 group-hover:tranzinc-x-0.5 transition-transform" />
          </div>
        </div>

        {}
        <div
          onClick={() => onNavigate('optimizer')}
          className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850 rounded-lg p-3.5 cursor-pointer transition-colors flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="p-1.5 bg-amber-500/10 border border-amber-500/20 rounded text-amber-400 shrink-0">
                <Zap size={16} />
              </div>
              <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-750">
                KERNEL & REGISTRY
              </span>
            </div>
            <h2 className="text-sm font-semibold text-zinc-100 group-hover:text-amber-400 transition-colors mb-1">
              {t('nav.optimizer', 'System Optimizer')}
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-3">
              {t('home.optimizerDesc', 'Registry DeepTweaks, classic Win10 context menu, taskbar End Task button and debloat.')}
            </p>
          </div>
          <div className="flex items-center text-xs font-medium text-amber-400 pt-1">
            <span>{t('home.openTweaks', 'Open Tweaks')}</span>
            <ChevronRight size={13} className="ml-1 group-hover:tranzinc-x-0.5 transition-transform" />
          </div>
        </div>

        {}
        <div
          onClick={() => onNavigate('setuphub')}
          className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850 rounded-lg p-3.5 cursor-pointer transition-colors flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="p-1.5 bg-violet-500/10 border border-violet-500/20 rounded text-violet-400 shrink-0">
                <Wrench size={16} />
              </div>
              <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-750">
                WINGET SUITE
              </span>
            </div>
            <h2 className="text-sm font-semibold text-zinc-100 group-hover:text-violet-400 transition-colors mb-1">
              {t('nav.setuphub', 'Post-Install Hub')}
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-3">
              {t('home.setupHubDesc', 'Bulk installer with DDU, partitioners, benchmarks, Sysinternals and VC++ runtime packages.')}
            </p>
          </div>
          <div className="flex items-center text-xs font-medium text-violet-400 pt-1">
            <span>{t('home.accessCatalog', 'Access Catalog')}</span>
            <ChevronRight size={13} className="ml-1 group-hover:tranzinc-x-0.5 transition-transform" />
          </div>
        </div>
      </div>

      {}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            {t('home.quickUtilities', 'Quick Utilities')}
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
          {}
          <div
            onClick={handleLaunchPGE}
            className="p-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850 rounded-lg cursor-pointer transition-colors group flex items-center justify-between"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-1.5 bg-purple-500/10 text-purple-400 rounded shrink-0">
                <Gamepad2 size={16} />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-semibold text-zinc-200 group-hover:text-purple-400 transition-colors truncate">
                  PGE Portable
                </h4>
                <p className="text-[10px] text-zinc-500 truncate">
                  {pgeMessage ? pgeMessage : t('home.pgeDesc', 'Lossless Scaling & ReSwitch')}
                </p>
              </div>
            </div>
            <button
              disabled={pgeBusy}
              className="px-2 py-1 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 rounded text-[11px] font-medium shrink-0 flex items-center gap-1"
            >
              <Play size={10} className="fill-zinc-300" />
              <span>{pgeBusy ? '...' : (pgeMessage || t('home.open', 'Abrir'))}</span>
            </button>
          </div>

          {}
          <div
            onClick={() => onNavigate('ultra-latency')}
            className="p-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850 rounded-lg cursor-pointer transition-colors group flex items-center justify-between"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-1.5 bg-rose-500/10 text-rose-400 rounded shrink-0">
                <Flame size={16} />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-semibold text-zinc-200 group-hover:text-rose-400 transition-colors truncate">
                  Ultra Low Latency
                </h4>
                <p className="text-[10px] text-zinc-500 truncate">{t('home.ultraLatencyDesc', 'Timer Resolution & Kernel')}</p>
              </div>
            </div>
            <ChevronRight size={14} className="text-zinc-600 group-hover:text-zinc-300 transition-colors shrink-0" />
          </div>

          {}
          <div
            onClick={() => onNavigate('monitor')}
            className="p-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850 rounded-lg cursor-pointer transition-colors group flex items-center justify-between"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-1.5 bg-sky-500/10 text-sky-400 rounded shrink-0">
                <Monitor size={16} />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-semibold text-zinc-200 group-hover:text-sky-400 transition-colors truncate">
                  {t('home.hardwareMonitor', 'Hardware Monitor')}
                </h4>
                <p className="text-[10px] text-zinc-500 truncate">{t('home.hardwareMonitorDesc', 'Real-time Sensors & Usage')}</p>
              </div>
            </div>
            <ChevronRight size={14} className="text-zinc-600 group-hover:text-zinc-300 transition-colors shrink-0" />
          </div>

          {}
          <div
            onClick={() => onNavigate('networktools')}
            className="p-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850 rounded-lg cursor-pointer transition-colors group flex items-center justify-between"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded shrink-0">
                <Network size={16} />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-semibold text-zinc-200 group-hover:text-emerald-400 transition-colors truncate">
                  {t('home.networkDiagnostics', 'Network Diagnostics')}
                </h4>
                <p className="text-[10px] text-zinc-500 truncate">{t('home.networkDiagnosticsDesc', 'Ping, DNS & Cloudflare Test')}</p>
              </div>
            </div>
            <ChevronRight size={14} className="text-zinc-600 group-hover:text-zinc-300 transition-colors shrink-0" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
