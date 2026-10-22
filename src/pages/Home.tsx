import React, { useState, useEffect } from 'react';
import { visibleInterval } from '../utils/visibleInterval';
import {
  Zap, Activity, Gamepad2, Cpu, ArrowRight, Monitor, Flame, Play,
  Network, Wrench, ChevronRight, Sparkles, Loader2, DarkHubMark, AlertTriangle
} from '../components/icons';
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
  const [genericGpu, setGenericGpu] = useState<string | null>(null);

  useEffect(() => {
    const fetchInfo = async () => {
      if (window.darkhub?.system?.getInfo) {
        try {
          const info = await window.darkhub.system.getInfo();
          if (info) {
            const totalGb = info.memory?.totalGb || (info.memory?.total ? (info.memory.total / (1024 ** 3)).toFixed(1) : '-');
            const freeGb = info.memory?.freeGb || (info.memory?.free ? (info.memory.free / (1024 ** 3)).toFixed(1) : '-');
            const cpuName = (info.cpu?.name || info.cpu?.brand || info.cpu?.model || '-').trim();
            // Windows 11 = build 22000 or newer (any channel); architecture from the OS, not assumed
            const build = Number(String(info.os?.release || '').split('.')[2] || 0);
            const osName = info.os?.platform === 'win32' ? `Windows ${build >= 22000 ? '11' : '10'} ${info.os?.arch || ''}`.trim() : info.os?.platform || 'Windows';
            setSysSummary({
              cpu: cpuName,
              ram: t('home.ramFree', '{free} GB livre de {total} GB').replace('{free}', String(freeGb)).replace('{total}', String(totalGb)),
              totalGb,
              freeGb,
              os: osName,
              cores: info.cpu?.cores || 0
            });
          }
        } catch {}
      }
    };
    fetchInfo();
    return visibleInterval(fetchInfo, 10000);
  }, []);

  // GPU on Windows' generic driver (common right after a DarkOS install): tell the user where to fix it.
  // Detected once per session; the Driver Center does the real work.
  useEffect(() => {
    let alive = true;
    const cached = sessionStorage.getItem('dh.genericGpu');
    if (cached !== null) { setGenericGpu(cached || null); return; }
    window.darkhub?.driver?.detect?.().then((r) => {
      const g = r?.ok ? r.adapters?.find((a) => a.genericDriver) : undefined;
      const label = g ? ({ nvidia: 'NVIDIA', amd: 'AMD', intel: 'Intel' } as Record<string, string>)[g.vendor] ?? g.vendor : '';
      try { sessionStorage.setItem('dh.genericGpu', label); } catch {}
      if (alive) setGenericGpu(label || null);
    }).catch(() => {});
    return () => { alive = false; };
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

  // Live memory in use (same number as Task Manager), the bar and the figure show the same thing.
  const [mem, setMem] = useState<{ total: number; used: number } | null>(null);
  useEffect(() => {
    let alive = true;
    const read = () => window.darkhub?.system?.getMemory?.().then((m) => { if (alive && m?.ok) setMem(m); }).catch(() => {});
    read();
    const h = setInterval(read, 3000);
    return () => { alive = false; clearInterval(h); };
  }, []);
  const usedPct = mem && mem.total > 0 ? Math.min(100, Math.max(0, Math.round((mem.used / mem.total) * 100))) : null;
  const gb = (b: number) => (b / 1024 ** 3).toFixed(1);

  const tools: { id: string; icon: React.ComponentType<{ size?: number; className?: string }>; title: string; desc: string; action: string; tag: string }[] = [
    { id: 'darkpacer', icon: Activity, title: t('nav.darkpacer', 'DarkPacer (FPS Lock)'), desc: t('home.darkpacerDesc', 'Frame rate limiter and 1% Low stabilization with microsecond precision via VMT Hooking.'), action: t('home.configPacing', 'Configure Pacing'), tag: 'DXGI' },
    { id: 'dlss5', icon: Sparkles, title: t('home.dlss5Title', 'DLSS 5 & Universal Upscaler'), desc: t('home.dlss5Desc', 'Upscaling neural com IA, Frame Generation universal para NVIDIA e AMD, ZLUDA HIP e rotas automáticas.'), action: t('home.openDlss5', 'Gerenciar DLSS 5'), tag: 'Frame Gen' },
    { id: 'optiscaler', icon: Cpu, title: t('nav.optiscaler', 'OptiScaler Manager'), desc: t('home.optiscalerDesc', 'Universal upscaling management, DLL injection and backup snapshots with 1-click restore.'), action: t('home.manageGames', 'Manage Games'), tag: 'DLSS · FSR · XeSS' },
    { id: 'setuphub', icon: Wrench, title: t('nav.setuphub', 'Post-Install Hub'), desc: t('home.setupHubDesc', 'Bulk installer with DDU, partitioners, benchmarks, Sysinternals and VC++ runtime packages.'), action: t('home.accessCatalog', 'Access Catalog'), tag: 'winget' }
  ];

  const shortcuts = [
    { id: 'ultra-latency', icon: Flame, title: 'Ultra Low Latency', desc: t('home.ultraLatencyDesc', 'Timer Resolution & Kernel') },
    { id: 'monitor', icon: Monitor, title: t('home.hardwareMonitor', 'Hardware Monitor'), desc: t('home.hardwareMonitorDesc', 'Real-time Sensors & Usage') },
    { id: 'networktools', icon: Network, title: t('home.networkDiagnostics', 'Network Diagnostics'), desc: t('home.networkDiagnosticsDesc', 'Ping, DNS & Cloudflare Test') }
  ];

  return (
    <div className="w-full max-w-6xl mx-auto space-y-7">
      {/* Header + machine readout */}
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.02em] text-zinc-50">{t('home.title', 'Home Dashboard')}</h1>
          <p className="mt-1 text-[13px] text-zinc-400">{t('home.subtitle', 'Control Center, Kernel Optimization & Frame Pacing')}</p>
        </div>

        <dl className="grid grid-cols-3 rounded-lg border border-zinc-800/80 bg-zinc-900/40 divide-x divide-zinc-800/80 shrink-0 min-w-0 lg:w-[520px]">
          <div className="px-3.5 py-2.5 min-w-0">
            <dt className="text-[11px] text-zinc-500">CPU</dt>
            <dd className="mt-0.5 text-[12.5px] text-zinc-100 truncate" title={sysSummary?.cpu}>
              {sysSummary ? sysSummary.cpu.split(' @')[0] : <span className="inline-block h-3 w-28 rounded bg-zinc-800 align-middle" />}
            </dd>
          </div>
          <div className="px-3.5 py-2.5 min-w-0">
            <dt className="text-[11px] text-zinc-500">{t('home.memoryUsed', 'Memória em uso')}</dt>
            <dd className="mt-0.5 font-mono text-[12.5px] text-zinc-100">
              {mem ? <>{gb(mem.used)}<span className="text-zinc-500"> / {gb(mem.total)} GB</span></> : <span className="inline-block h-3 w-20 rounded bg-zinc-800 align-middle" />}
            </dd>
            {usedPct !== null && (
              <div className="mt-1.5 h-[3px] rounded-full bg-zinc-800 overflow-hidden" role="meter" aria-valuenow={usedPct} aria-valuemin={0} aria-valuemax={100} aria-label={t('home.memoryUsed', 'Memória em uso')}>
                <div className={`h-full rounded-full ${usedPct > 85 ? 'bg-amber-400' : 'bg-blue-400'}`} style={{ width: `${usedPct}%` }} />
              </div>
            )}
          </div>
          <div className="px-3.5 py-2.5 min-w-0">
            <dt className="text-[11px] text-zinc-500">{t('home.system', 'Sistema')}</dt>
            <dd className="mt-0.5 text-[12.5px] text-zinc-100 truncate">
              {sysSummary ? <>{sysSummary.os}{sysSummary.cores ? <span className="text-zinc-500 font-mono"> · {sysSummary.cores}c</span> : null}</> : <span className="inline-block h-3 w-24 rounded bg-zinc-800 align-middle" />}
            </dd>
          </div>
        </dl>
      </header>

      {genericGpu ? (
        <div role="alert" className="flex items-center gap-3 rounded-xl border border-amber-300/30 bg-amber-300/[0.04] px-4 py-3">
          <AlertTriangle size={16} className="text-amber-300 shrink-0" />
          <p className="flex-1 min-w-0 text-[12.5px] text-zinc-200">
            {t('home.genericGpu', 'Sua placa {vendor} está usando o driver genérico da Microsoft. Jogos e vídeos ficam limitados até instalar o driver oficial.').replace('{vendor}', genericGpu)}
          </p>
          <button type="button" onClick={() => onNavigate('driver')} className="dh-btn dh-btn-primary dh-btn-sm shrink-0">
            {t('home.genericGpuCta', 'Resolver')}<ArrowRight size={13} />
          </button>
        </div>
      ) : null}

      {/* Tools: one featured tile + four */}
      <section className="grid grid-cols-1 lg:grid-cols-[1.15fr_2fr] gap-3" aria-label={t('home.tools', 'Ferramentas')}>
        <button
          type="button"
          onClick={() => onNavigate('optimizer')}
          className="group relative text-left overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 hover:bg-zinc-900 p-5 flex flex-col justify-between min-h-[236px] dh-raised"
        >
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 text-blue-300/[0.06] transition-transform duration-500 group-hover:rotate-[30deg]">
            <DarkHubMark size={220} strokeWidth={0.9} />
          </div>
          <div className="relative">
            <div className="flex items-center gap-2 text-blue-300">
              <Zap size={18} />
              <span className="text-[11px] font-mono text-zinc-500">kernel · registry</span>
            </div>
            <h2 className="mt-4 text-[19px] font-semibold tracking-[-0.015em] text-zinc-50">{t('nav.optimizer', 'System Optimizer')}</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-zinc-400 max-w-[42ch]">
              {t('home.optimizerDesc', 'Registry DeepTweaks, classic Win10 context menu, taskbar End Task button and debloat.')}
            </p>
          </div>
          <div className="relative mt-6 flex flex-wrap items-end justify-between gap-4">
            <span className="dh-btn dh-btn-primary">
              {t('home.openTweaks', 'Open Tweaks')}
              <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </span>
            <ul className="flex flex-wrap gap-x-3 gap-y-1 dh-tag" aria-label={t('home.optimizerAreas', 'Áreas')}>
              {['privacy', 'power', 'network', 'services', 'memory', 'storage'].map((c) => <li key={c}>{c}</li>)}
            </ul>
          </div>
        </button>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {tools.map(({ id, icon: Icon, title, desc, action, tag }) => (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              className="group text-left rounded-xl border border-zinc-800/80 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-900/70 p-4 flex flex-col"
            >
              <div className="flex items-center justify-between">
                <Icon size={17} className="text-zinc-400 group-hover:text-blue-300 transition-colors" />
                <span className="text-[10.5px] font-mono text-zinc-600">{tag}</span>
              </div>
              <h3 className="mt-3 text-[14px] font-semibold tracking-[-0.01em] text-zinc-100">{title}</h3>
              <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-400 line-clamp-2">{desc}</p>
              <span className="mt-auto pt-3 inline-flex items-center gap-1 text-[12px] font-medium text-zinc-300 group-hover:text-blue-300 transition-colors">
                {action}
                <ChevronRight size={13} className="transition-transform duration-200 group-hover:translate-x-0.5" />
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Shortcuts: one strip, not five cards */}
      <section aria-labelledby="home-shortcuts">
        <h2 id="home-shortcuts" className="text-[13px] font-medium text-zinc-400 mb-2.5">{t('home.quickUtilities', 'Quick Utilities')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 rounded-xl border border-zinc-800/80 bg-zinc-900/30 divide-y sm:divide-y-0 lg:divide-x divide-zinc-800/80 overflow-hidden">
          {shortcuts.map(({ id, icon: Icon, title, desc }) => (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              className="group flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-900/80 min-w-0"
            >
              <Icon size={16} className="shrink-0 text-zinc-500 group-hover:text-blue-300 transition-colors" />
              <span className="min-w-0">
                <span className="block text-[12.5px] font-medium text-zinc-200 truncate">{title}</span>
                <span className="block text-[11.5px] text-zinc-500 truncate">{desc}</span>
              </span>
            </button>
          ))}
          <div className="flex items-center gap-3 px-4 py-3 min-w-0">
            <Gamepad2 size={16} className="shrink-0 text-zinc-500" />
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-medium text-zinc-200 truncate">PGE Portable</span>
              <span className="block text-[11.5px] text-zinc-500 truncate" role="status">
                {pgeMessage ?? t('home.pgeDesc', 'Lossless Scaling & ReSwitch')}
              </span>
            </span>
            <button
              type="button"
              onClick={handleLaunchPGE}
              disabled={pgeBusy}
              className="shrink-0 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-zinc-700 text-[12px] text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              {pgeBusy ? <Loader2 size={12} className="animate-spin" /> : <Play size={11} />}
              {t('home.open', 'Abrir')}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
