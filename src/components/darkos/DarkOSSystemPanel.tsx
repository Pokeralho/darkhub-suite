import React, { useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, CheckCircle, Clock, Cpu, DownloadCloud, Gauge, Loader2,
  MemoryStick, Monitor, MonitorCog, Power, RefreshCw, Server, XCircle
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';

type LiveStats = Awaited<ReturnType<Window['darkhub']['system']['getLiveStats']>>;

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-zinc-900 border border-zinc-800 rounded-xl p-4 ${className}`}>{children}</div>
);

const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition disabled:opacity-40 disabled:cursor-not-allowed';
const btnGhost = `${btn} bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 border-zinc-700/60`;
const btnPrimary = `${btn} bg-[#3b82f6] hover:bg-blue-500 text-white border-blue-500/50`;

const Stat: React.FC<{ icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; tone?: string }> = ({ icon: Icon, label, value, tone = 'text-zinc-100' }) => (
  <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-3 min-w-0">
    <div className="text-[10px] uppercase tracking-wider text-zinc-500 flex items-center gap-1"><Icon className="w-3 h-3" />{label}</div>
    <div className={`mt-1 text-sm font-semibold font-mono truncate ${tone}`}>{value}</div>
  </div>
);

function fmtUptime(sec: number): string {
  if (!sec || sec < 0) return '-';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

type UpdState = { status: string; version?: string; latest?: string; percent?: number; notes?: string; error?: string };

export default function DarkOSSystemPanel({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { t } = useI18n();

  // --- (a) live host stats: polls only while the page is visible ---
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [statsErr, setStatsErr] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const r = await window.darkhub?.system?.getLiveStats?.();
        if (cancelled) return;
        if (r?.ok) { setStats(r); setStatsErr(null); }
        else setStatsErr(r?.error || t('darkos.sys.live.error', 'Could not read system data.'));
      } catch (e: any) {
        if (!cancelled) setStatsErr(e?.message ?? String(e));
      }
    };
    const start = () => { if (timer == null) { tick(); timer = window.setInterval(tick, 4000); } };
    const stop = () => { if (timer != null) { clearInterval(timer); timer = null; } };
    const onVis = () => { if (document.hidden) { stop(); setPaused(true); } else { setPaused(false); start(); } };
    if (!document.hidden) start(); else setPaused(true);
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelled = true; stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [t]);

  // --- (b) updater: status on open + live events; no background polling added here ---
  const [upd, setUpd] = useState<UpdState>({ status: 'idle' });
  const [updBusy, setUpdBusy] = useState(false);
  useEffect(() => {
    let off: (() => void) | undefined;
    (async () => {
      try {
        const s = await window.darkhub?.updater?.getStatus?.();
        if (s) setUpd((u) => ({ ...u, status: s.state || 'idle', version: s.currentVersion, latest: s.updateInfo?.version, notes: s.updateInfo?.releaseNotes }));
      } catch { /* ignore */ }
      off = window.darkhub?.updater?.onEvent?.((evt: any) => {
        setUpd((u) => {
          const next: UpdState = { ...u };
          if (evt?.type === 'checking') next.status = 'checking';
          else if (evt?.type === 'available') { next.status = 'available'; next.latest = evt.info?.version; next.notes = evt.info?.releaseNotes; }
          else if (evt?.type === 'not-available') { next.status = 'idle'; next.version = evt.currentVersion || next.version; }
          else if (evt?.type === 'progress') { next.status = 'downloading'; next.percent = evt.percent; }
          else if (evt?.type === 'verifying') next.status = 'verifying';
          else if (evt?.type === 'downloaded') { next.status = 'downloaded'; next.latest = evt.version || next.latest; }
          else if (evt?.type === 'error') { next.status = 'error'; next.error = evt.message; }
          return next;
        });
      });
    })();
    return () => { off?.(); };
  }, []);

  const checkUpdates = async () => { setUpdBusy(true); try { await window.darkhub?.updater?.check?.(); } finally { setUpdBusy(false); } };
  const downloadUpdate = async () => { setUpdBusy(true); try { await window.darkhub?.updater?.download?.(); } finally { setUpdBusy(false); } };
  const installUpdate = async () => { await window.darkhub?.updater?.install?.(); };

  // --- (c) start-with-Windows (background) toggle; defaults off, reads real task state ---
  const [startup, setStartup] = useState<boolean | null>(null);
  const [startupBusy, setStartupBusy] = useState(false);
  const [startupErr, setStartupErr] = useState<string | null>(null);
  useEffect(() => {
    window.darkhub?.settings?.getConfig?.().then((r: any) => {
      if (r?.ok) setStartup(Boolean(r.config?.app?.openAtLogin));
    }).catch(() => {});
  }, []);
  const toggleStartup = async () => {
    const next = !startup;
    setStartupBusy(true); setStartupErr(null);
    try {
      const r = await window.darkhub?.settings?.updateStartupBehavior?.({ openAtLogin: next, openAsHidden: true });
      if (r?.ok) setStartup(Boolean(r.openAtLogin));
      else setStartupErr(r?.error || t('darkos.sys.startup.error', 'Could not change the startup setting.'));
    } catch (e: any) {
      setStartupErr(e?.message ?? String(e));
    } finally { setStartupBusy(false); }
  };

  // --- (4) hardware & power: reuses existing GPU detection + power-plan operations ---
  const [gpus, setGpus] = useState<Array<{ model: string; vendor: string; vram: number; isDedicated: boolean }>>([]);
  const [powerBusy, setPowerBusy] = useState<string | null>(null);
  const [powerMsg, setPowerMsg] = useState<{ ok: boolean; message: string } | null>(null);
  useEffect(() => {
    window.darkhub?.optimizer?.getGpuInfo?.().then((r: any) => {
      if (r?.ok && Array.isArray(r.controllers)) setGpus(r.controllers);
    }).catch(() => {});
  }, []);

  const applyPower = async (id: string) => {
    setPowerBusy(id); setPowerMsg(null);
    try {
      const res: any = await window.darkhub?.optimizer?.run?.({ operationIds: [id] });
      const r = Array.isArray(res?.results) ? res.results[0] : null;
      const ok = Boolean(r?.ok);
      setPowerMsg({ ok, message: ok ? (r?.output?.msg || t('darkos.sys.hw.powerApplied', 'Power plan applied.')) : (r?.error || t('darkos.sys.hw.powerFail', 'Could not apply the power plan.')) });
    } catch (e: any) {
      setPowerMsg({ ok: false, message: e?.message ?? String(e) });
    } finally {
      setPowerBusy(null);
      window.setTimeout(() => setPowerMsg(null), 5000);
    }
  };

  const powerBtns: Array<{ id: string; label: string }> = [
    { id: 'optimizer:powerPlanUltimate', label: t('darkos.sys.hw.ultimate', 'Ultimate Performance') },
    { id: 'optimizer:powerPlanHighPerformance', label: t('darkos.sys.hw.high', 'High Performance') },
    { id: 'optimizer:powerPlanBalanced', label: t('darkos.sys.hw.balanced', 'Balanced') },
    { id: 'optimizer:powerPlanRestore', label: t('darkos.sys.hw.restore', 'Restore previous') }
  ];

  const updBanner = upd.status === 'available' || upd.status === 'downloading' || upd.status === 'downloaded' || upd.status === 'verifying';

  return (
    <div className="space-y-4">
      {/* Live activity */}
      <Card>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2"><Activity className="w-4 h-4 text-blue-400" />{t('darkos.sys.live.title', 'Live activity')}</h3>
          <span className="text-[10px] font-mono text-zinc-500">{paused ? t('darkos.sys.live.paused', 'Paused') : t('darkos.sys.live.refreshing', 'Refreshing...')}</span>
        </div>
        {statsErr ? (
          <p className="mt-2 text-xs text-red-300">{statsErr}</p>
        ) : !stats?.ok ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-zinc-400"><Loader2 className="w-4 h-4 animate-spin" />...</div>
        ) : (
          <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat icon={Cpu} label={t('darkos.sys.live.cpu', 'CPU')} value={`${stats.cpuPercent ?? 0}%`} tone={(stats.cpuPercent ?? 0) > 85 ? 'text-amber-300' : 'text-zinc-100'} />
            <Stat icon={MemoryStick} label={t('darkos.sys.live.mem', 'Memory')} value={`${stats.memPercent ?? 0}% (${Math.round((stats.memUsedMb ?? 0) / 1024 * 10) / 10}/${Math.round((stats.memTotalMb ?? 0) / 1024 * 10) / 10} GB)`} />
            <Stat icon={Activity} label={t('darkos.sys.live.processes', 'Processes')} value={stats.processes ?? 0} />
            <Stat icon={Server} label={t('darkos.sys.live.services', 'Running services')} value={`${stats.servicesRunning ?? 0}/${stats.servicesTotal ?? 0}`} />
            <Stat icon={Clock} label={t('darkos.sys.live.uptime', 'Uptime')} value={fmtUptime(stats.uptimeSec ?? 0)} />
          </div>
        )}
      </Card>

      {/* Update status */}
      <Card>
        <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2"><DownloadCloud className="w-4 h-4 text-zinc-400" />{t('darkos.sys.update.title', 'DarkHub update')}</h3>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Stat icon={CheckCircle} label={t('darkos.sys.update.current', 'Installed version')} value={upd.version || '-'} />
          <Stat icon={DownloadCloud} label={t('darkos.sys.update.latest', 'Available version')} value={updBanner && upd.latest ? upd.latest : '-'} tone={updBanner ? 'text-blue-300' : 'text-zinc-100'} />
        </div>
        {upd.status === 'downloading' ? (
          <div className="mt-2 h-1.5 rounded bg-zinc-800 overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${upd.percent ?? 0}%` }} /></div>
        ) : null}
        {upd.error ? <p className="mt-2 text-xs text-red-300">{upd.error}</p> : null}
        {!updBanner && upd.status !== 'checking' ? <p className="mt-2 text-xs text-emerald-300/90">{t('darkos.sys.update.upToDate', 'You are on the latest version.')}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={checkUpdates} disabled={updBusy || upd.status === 'checking'} className={btnGhost}>
            <RefreshCw className={`w-3.5 h-3.5 ${upd.status === 'checking' ? 'animate-spin' : ''}`} />
            {upd.status === 'checking' ? t('darkos.sys.update.checking', 'Checking...') : t('darkos.sys.update.check', 'Check for updates')}
          </button>
          {upd.status === 'available' ? (
            <button onClick={downloadUpdate} disabled={updBusy} className={btnPrimary}><DownloadCloud className="w-3.5 h-3.5" />{t('darkos.sys.update.download', 'Download update')}</button>
          ) : null}
          {upd.status === 'downloaded' ? (
            <button onClick={installUpdate} className={btnPrimary}><Power className="w-3.5 h-3.5" />{t('darkos.sys.update.install', 'Install & restart')}</button>
          ) : null}
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">{t('darkos.sys.update.hint', '')}</p>
      </Card>

      {/* Start with Windows (background) */}
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2"><Power className="w-4 h-4 text-zinc-400" />{t('darkos.sys.startup.title', 'Start with Windows (in background)')}</h3>
            <p className="mt-1 text-xs text-zinc-400 leading-relaxed">{t('darkos.sys.startup.desc', '')}</p>
            {startupErr ? <p className="mt-1 text-xs text-red-300">{startupErr}</p> : null}
          </div>
          <button
            onClick={toggleStartup}
            disabled={startup === null || startupBusy}
            role="switch"
            aria-checked={Boolean(startup)}
            className={`shrink-0 mt-0.5 w-11 h-6 rounded-full border transition relative ${startup ? 'bg-blue-600 border-blue-500' : 'bg-zinc-800 border-zinc-700'} disabled:opacity-50`}
          >
            <span className={`absolute top-0.5 ${startup ? 'left-5' : 'left-0.5'} w-5 h-5 rounded-full bg-white transition-all`} />
          </button>
        </div>
        <div className="mt-2 text-[11px] font-mono text-zinc-500">
          {startup === null ? '...' : startup ? t('darkos.sys.startup.on', 'On') : t('darkos.sys.startup.off', 'Off')}
        </div>
      </Card>

      {/* Hardware & power */}
      <Card>
        <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2"><Gauge className="w-4 h-4 text-zinc-400" />{t('darkos.sys.hw.title', 'Hardware & power')}</h3>
        <p className="mt-1 text-xs text-zinc-400 leading-relaxed">{t('darkos.sys.hw.desc', '')}</p>
        {gpus.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {gpus.map((g, i) => (
              <span key={i} className="text-[10.5px] px-2 py-0.5 rounded bg-zinc-950/60 border border-zinc-800 text-zinc-300 font-mono inline-flex items-center gap-1">
                <MonitorCog className="w-3 h-3 text-zinc-500" />{g.model}{g.vram ? ` · ${Math.round(g.vram / 1024)}GB` : ''}
              </span>
            ))}
          </div>
        ) : null}
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">{t('darkos.sys.hw.power', 'Power plan')}</div>
          <div className="flex flex-wrap gap-2">
            {powerBtns.map((b) => (
              <button key={b.id} onClick={() => applyPower(b.id)} disabled={powerBusy !== null} className={btnGhost}>
                {powerBusy === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}{b.label}
              </button>
            ))}
          </div>
          {powerMsg ? (
            <div className={`mt-2 text-xs flex items-center gap-1.5 break-words ${powerMsg.ok ? 'text-emerald-300' : 'text-red-300'}`}>
              {powerMsg.ok ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}{powerMsg.message}
            </div>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => onNavigate?.('monitor')} className={btnGhost}><Monitor className="w-3.5 h-3.5" />{t('darkos.sys.hw.openMonitor', 'Open System Monitor')}</button>
          <button onClick={() => onNavigate?.('optimizer')} className={btnGhost}><Gauge className="w-3.5 h-3.5" />{t('darkos.sys.hw.openOptimizer', 'Open System Optimizer')}</button>
          <button onClick={() => onNavigate?.('driver')} className={btnGhost}><MonitorCog className="w-3.5 h-3.5" />{t('darkos.sys.hw.openDrivers', 'Open Driver Center')}</button>
        </div>
      </Card>
    </div>
  );
}
