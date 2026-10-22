import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle, DownloadCloud, Gauge, Loader2, Monitor, MonitorCog, Power, RefreshCw, XCircle
} from '../icons';
import { useI18n } from '../../i18n/I18nProvider';
import DarkOSConfirmDialog from './DarkOSConfirmDialog';

type LiveStats = Awaited<ReturnType<Window['darkhub']['system']['getLiveStats']>>;

/** One metric in the live strip: quiet label, mono value, dim unit. */
const Metric: React.FC<{ label: string; value: React.ReactNode; unit?: React.ReactNode; tone?: string }> = ({ label, value, unit, tone = 'text-zinc-100' }) => (
  <div className="min-w-0 px-4 py-3">
    <div className="text-[11.5px] text-zinc-500 truncate">{label}</div>
    <div className={`mt-1 font-mono text-[15px] tabular-nums truncate ${tone}`}>
      {value}{unit ? <span className="ml-1 text-[11.5px] text-zinc-500">{unit}</span> : null}
    </div>
  </div>
);

/** A settings-style row: title + help on the left, controls on the right; the parent draws the hairlines. */
const Row: React.FC<{ title: React.ReactNode; help?: React.ReactNode; aside?: React.ReactNode; children?: React.ReactNode }> = ({ title, help, aside, children }) => (
  <div className="px-4 py-4">
    <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
      <div className="min-w-0 max-w-[75ch]">
        <h3 className="text-[13px] font-medium text-zinc-100">{title}</h3>
        {help ? <p className="mt-1 dh-help">{help}</p> : null}
      </div>
      {aside ? <div className="flex flex-wrap items-center gap-2 shrink-0">{aside}</div> : null}
    </div>
    {children}
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
    let inFlight = false;
    const tick = async () => {
      // A slow read must not stack up behind the 4s interval.
      if (document.hidden || inFlight) return;
      inFlight = true;
      try {
        const r = await window.darkhub?.system?.getLiveStats?.();
        if (cancelled) return;
        if (r?.ok) { setStats(r); setStatsErr(null); }
        else setStatsErr(r?.error || t('darkos.sys.live.error', 'Could not read system data.'));
      } catch (e: any) {
        if (!cancelled) setStatsErr(e?.message ?? String(e));
      } finally {
        inFlight = false;
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
  const [edgeBusy, setEdgeBusy] = useState(false);
  const [edgeMsg, setEdgeMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [edgeConfirm, setEdgeConfirm] = useState(false);
  const mounted = useRef(true);
  const powerTimer = useRef<number | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (powerTimer.current !== null) window.clearTimeout(powerTimer.current);
    };
  }, []);
  const reinstallEdge = async () => {
    setEdgeConfirm(false);
    setEdgeBusy(true); setEdgeMsg(null);
    try {
      const r = await window.darkhub?.darkos?.reinstallEdge?.();
      if (!mounted.current) return;
      setEdgeMsg(r?.ok
        ? { ok: true, message: r.msg || t('darkos.sys.edge.ok', 'Microsoft Edge reinstalled.') }
        : { ok: false, message: r?.error || t('darkos.sys.edge.fail', 'Could not reinstall Microsoft Edge.') });
    } catch (e: any) {
      if (mounted.current) setEdgeMsg({ ok: false, message: e?.message ?? String(e) });
    } finally {
      if (mounted.current) setEdgeBusy(false);
    }
  };
  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const s = await window.darkhub?.updater?.getStatus?.();
        if (!cancelled && s) setUpd((u) => ({ ...u, status: s.state || 'idle', version: s.currentVersion, latest: s.updateInfo?.version, notes: s.updateInfo?.releaseNotes }));
      } catch { /* ignore */ }
      // Unmounted while awaiting: never subscribe (the cleanup below already ran and could not unsubscribe).
      if (cancelled) return;
      off = window.darkhub?.updater?.onEvent?.((evt: any) => {
        setUpd((u) => {
          const next: UpdState = { ...u };
          if (evt?.type === 'checking') { next.status = 'checking'; next.error = undefined; }
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
    return () => { cancelled = true; off?.(); };
  }, []);

  // Updater IPC failures surface in the card instead of becoming unhandled rejections.
  const updaterCall = async (fn: () => Promise<unknown> | undefined) => {
    setUpdBusy(true);
    try {
      await fn();
    } catch (e: any) {
      if (mounted.current) setUpd((u) => ({ ...u, status: 'error', error: e?.message ?? String(e) }));
    } finally {
      if (mounted.current) setUpdBusy(false);
    }
  };
  const checkUpdates = () => updaterCall(() => window.darkhub?.updater?.check?.());
  const downloadUpdate = () => updaterCall(() => window.darkhub?.updater?.download?.());
  const installUpdate = () => updaterCall(() => window.darkhub?.updater?.install?.());

  // --- (c) start-with-Windows (background) toggle; defaults off, reads real task state ---
  const [startup, setStartup] = useState<boolean | null>(null);
  const [startupBusy, setStartupBusy] = useState(false);
  const [startupErr, setStartupErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    window.darkhub?.settings?.getConfig?.().then((r: any) => {
      if (alive && r?.ok) setStartup(Boolean(r.config?.app?.openAtLogin));
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const toggleStartup = async () => {
    const next = !startup;
    setStartupBusy(true); setStartupErr(null);
    try {
      const r = await window.darkhub?.settings?.updateStartupBehavior?.({ openAtLogin: next, openAsHidden: true });
      if (!mounted.current) return;
      if (r?.ok) setStartup(Boolean(r.openAtLogin));
      else setStartupErr(r?.error || t('darkos.sys.startup.error', 'Could not change the startup setting.'));
    } catch (e: any) {
      if (mounted.current) setStartupErr(e?.message ?? String(e));
    } finally { if (mounted.current) setStartupBusy(false); }
  };

  // --- (4) hardware & power: reuses existing GPU detection + power-plan operations ---
  const [gpus, setGpus] = useState<Array<{ model: string; vendor: string; vram: number; isDedicated: boolean }>>([]);
  const [powerBusy, setPowerBusy] = useState<string | null>(null);
  const [powerMsg, setPowerMsg] = useState<{ ok: boolean; message: string } | null>(null);
  useEffect(() => {
    let alive = true;
    window.darkhub?.optimizer?.getGpuInfo?.().then((r: any) => {
      if (alive && r?.ok && Array.isArray(r.controllers)) setGpus(r.controllers);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const applyPower = async (id: string) => {
    setPowerBusy(id); setPowerMsg(null);
    if (powerTimer.current !== null) { window.clearTimeout(powerTimer.current); powerTimer.current = null; }
    try {
      const res: any = await window.darkhub?.optimizer?.run?.({ operationIds: [id] });
      if (!mounted.current) return;
      const r = Array.isArray(res?.results) ? res.results[0] : null;
      const ok = Boolean(r?.ok);
      setPowerMsg({ ok, message: ok ? (r?.output?.msg || t('darkos.sys.hw.powerApplied', 'Power plan applied.')) : (r?.error || t('darkos.sys.hw.powerFail', 'Could not apply the power plan.')) });
    } catch (e: any) {
      if (mounted.current) setPowerMsg({ ok: false, message: e?.message ?? String(e) });
    } finally {
      if (mounted.current) {
        setPowerBusy(null);
        powerTimer.current = window.setTimeout(() => { powerTimer.current = null; setPowerMsg(null); }, 5000);
      }
    }
  };

  const powerBtns: Array<{ id: string; label: string }> = [
    { id: 'optimizer:powerPlanUltimate', label: t('darkos.sys.hw.ultimate', 'Ultimate Performance') },
    { id: 'optimizer:powerPlanHighPerformance', label: t('darkos.sys.hw.high', 'High Performance') },
    { id: 'optimizer:powerPlanBalanced', label: t('darkos.sys.hw.balanced', 'Balanced') },
    { id: 'optimizer:powerPlanRestore', label: t('darkos.sys.hw.restore', 'Restore previous') }
  ];

  const updBanner = upd.status === 'available' || upd.status === 'downloading' || upd.status === 'downloaded' || upd.status === 'verifying';

  const gb = (mb?: number) => Math.round((mb ?? 0) / 1024 * 10) / 10;

  return (
    <div className="space-y-6">
      {/* Live activity */}
      <section>
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <h2 className="dh-section-title">{t('darkos.sys.live.title', 'Live activity')}</h2>
          <span className="text-[11.5px] text-zinc-500 inline-flex items-center gap-1.5">
            {!paused && stats?.ok ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden /> : null}
            {paused ? t('darkos.sys.live.paused', 'Paused') : t('darkos.sys.live.refreshing', 'Refreshing...')}
          </span>
        </div>
        {statsErr ? (
          <p role="alert" className="text-[12.5px] text-red-300">{statsErr}</p>
        ) : !stats?.ok ? (
          <div role="status" aria-label={t('darkos.loading', 'Loading...')} className="dh-card grid grid-cols-2 md:grid-cols-5 md:divide-x divide-zinc-800/80">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-4 py-3 space-y-2">
                <div className="h-3 w-16 rounded bg-zinc-800/80 animate-pulse" />
                <div className="h-4 w-20 rounded bg-zinc-800/80 animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <div className="dh-card grid grid-cols-2 md:grid-cols-5 md:divide-x divide-zinc-800/80">
            <Metric label={t('darkos.sys.live.cpu', 'CPU')} value={stats.cpuPercent ?? 0} unit="%" tone={(stats.cpuPercent ?? 0) > 85 ? 'text-amber-300' : 'text-zinc-100'} />
            <Metric label={t('darkos.sys.live.mem', 'Memory')} value={stats.memPercent ?? 0} unit={<>% · {gb(stats.memUsedMb)}/{gb(stats.memTotalMb)} GB</>} />
            <Metric label={t('darkos.sys.live.processes', 'Processes')} value={stats.processes ?? 0} />
            <Metric label={t('darkos.sys.live.services', 'Running services')} value={stats.servicesRunning ?? 0} unit={`/ ${stats.servicesTotal ?? 0}`} />
            <Metric label={t('darkos.sys.live.uptime', 'Uptime')} value={fmtUptime(stats.uptimeSec ?? 0)} />
          </div>
        )}
      </section>

      <section className="dh-card divide-y divide-zinc-800/80">
        {/* Update status */}
        <Row
          title={t('darkos.sys.update.title', 'DarkHub update')}
          help={t('darkos.sys.update.hint', '')}
          aside={(
            <>
              <button onClick={checkUpdates} disabled={updBusy || upd.status === 'checking'} className="dh-btn dh-btn-sm">
                <RefreshCw size={14} className={upd.status === 'checking' ? 'animate-spin' : ''} />
                {upd.status === 'checking' ? t('darkos.sys.update.checking', 'Checking...') : t('darkos.sys.update.check', 'Check for updates')}
              </button>
              {upd.status === 'available' ? (
                <button onClick={downloadUpdate} disabled={updBusy} className="dh-btn dh-btn-primary dh-btn-sm"><DownloadCloud size={14} />{t('darkos.sys.update.download', 'Download update')}</button>
              ) : null}
              {upd.status === 'downloaded' ? (
                <button onClick={installUpdate} className="dh-btn dh-btn-primary dh-btn-sm"><Power size={14} />{t('darkos.sys.update.install', 'Install & restart')}</button>
              ) : null}
            </>
          )}
        >
          <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-[12.5px]">
            <div className="flex gap-2"><dt className="text-zinc-500">{t('darkos.sys.update.current', 'Installed version')}</dt><dd className="font-mono text-zinc-200">{upd.version || '-'}</dd></div>
            <div className="flex gap-2"><dt className="text-zinc-500">{t('darkos.sys.update.latest', 'Available version')}</dt><dd className={`font-mono ${updBanner ? 'text-blue-300' : 'text-zinc-200'}`}>{updBanner && upd.latest ? upd.latest : '-'}</dd></div>
            {upd.status === 'idle' && !upd.error ? <div className="text-emerald-400">{t('darkos.sys.update.upToDate', 'You are on the latest version.')}</div> : null}
          </dl>
          {upd.status === 'downloading' ? (
            <div className="mt-3 flex items-center gap-3">
              <div
                className="flex-1 h-1 rounded-full bg-zinc-800 overflow-hidden"
                role="progressbar"
                aria-label={t('darkos.sys.update.download', 'Download update')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(upd.percent ?? 0)}
              ><div className="h-full bg-blue-400 transition-[width] duration-200 ease-out" style={{ width: `${upd.percent ?? 0}%` }} /></div>
              <span className="font-mono text-[11.5px] text-zinc-400 w-10 text-right">{Math.round(upd.percent ?? 0)}%</span>
            </div>
          ) : null}
          {upd.error ? <p role="alert" className="mt-2 text-[12.5px] text-red-300">{upd.error}</p> : null}
        </Row>

        {/* Start with Windows (background) */}
        <Row
          title={t('darkos.sys.startup.title', 'Start with Windows (in background)')}
          help={t('darkos.sys.startup.desc', '')}
          aside={(
            <>
              <span className="text-[12px] text-zinc-500">
                {startup === null ? '...' : startup ? t('darkos.sys.startup.on', 'On') : t('darkos.sys.startup.off', 'Off')}
              </span>
              <button
                onClick={toggleStartup}
                disabled={startup === null || startupBusy}
                role="switch"
                aria-checked={Boolean(startup)}
                aria-label={t('darkos.sys.startup.title', 'Start with Windows (in background)')}
                className={`relative w-9 h-5 rounded-full border transition-colors duration-150 ease-out ${startup ? 'bg-blue-500 border-blue-400' : 'bg-zinc-800 border-zinc-700'} disabled:opacity-50`}
              >
                <span className={`absolute top-[2px] ${startup ? 'left-[18px]' : 'left-[2px]'} w-3.5 h-3.5 rounded-full bg-zinc-50 transition-all duration-150 ease-out`} />
              </button>
            </>
          )}
        >
          {startupErr ? <p role="alert" className="mt-2 text-[12.5px] text-red-300">{startupErr}</p> : null}
        </Row>

        {/* Microsoft Edge (removed by DarkOS) */}
        <Row
          title={t('darkos.sys.edge.title', 'Microsoft Edge')}
          help={t('darkos.sys.edge.desc', 'O DarkOS vem sem o Microsoft Edge (o navegador padrão é o Zen). Se precisar dele, reinstale aqui: os bloqueios do DarkOS são desfeitos e o Edge é instalado pelo winget.')}
          aside={(
            <button onClick={() => setEdgeConfirm(true)} disabled={edgeBusy} aria-busy={edgeBusy} className="dh-btn dh-btn-sm">
              {edgeBusy ? <Loader2 size={14} className="animate-spin" /> : <DownloadCloud size={14} />}
              {edgeBusy ? t('darkos.sys.edge.busy', 'Reinstalando...') : t('darkos.sys.edge.do', 'Reinstalar Microsoft Edge')}
            </button>
          )}
        >
          {edgeMsg ? (
            <p role="status" className={`mt-2 text-[12.5px] flex items-center gap-1.5 break-words ${edgeMsg.ok ? 'text-emerald-400' : 'text-red-300'}`}>
              {edgeMsg.ok ? <CheckCircle size={14} className="shrink-0" /> : <XCircle size={14} className="shrink-0" />}{edgeMsg.message}
            </p>
          ) : null}
        </Row>

        {/* Hardware & power */}
        <Row title={t('darkos.sys.hw.title', 'Hardware & power')} help={t('darkos.sys.hw.desc', '')}>
          {gpus.length ? (
            <ul className="mt-3 divide-y divide-zinc-800/80 border-y border-zinc-800/80">
              {gpus.map((g, i) => (
                <li key={i} className="py-2 flex items-center gap-2 text-[12.5px]">
                  <MonitorCog size={14} className="text-zinc-500 shrink-0" />
                  <span className="text-zinc-200 truncate">{g.model}</span>
                  {g.vram ? <span className="ml-auto font-mono text-zinc-400">{Math.round(g.vram / 1024)}<span className="text-zinc-500"> GB</span></span> : null}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-4">
            <div className="dh-label mb-2">{t('darkos.sys.hw.power', 'Power plan')}</div>
            <div className="flex flex-wrap gap-2">
              {powerBtns.map((b) => (
                <button key={b.id} onClick={() => applyPower(b.id)} disabled={powerBusy !== null} className="dh-btn dh-btn-sm">
                  {powerBusy === b.id ? <Loader2 size={14} className="animate-spin" /> : null}{b.label}
                </button>
              ))}
            </div>
            {powerMsg ? (
              <p role="status" className={`mt-2 text-[12.5px] flex items-center gap-1.5 break-words ${powerMsg.ok ? 'text-emerald-400' : 'text-red-300'}`}>
                {powerMsg.ok ? <CheckCircle size={14} className="shrink-0" /> : <XCircle size={14} className="shrink-0" />}{powerMsg.message}
              </p>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-1 -ml-2.5">
            <button onClick={() => onNavigate?.('monitor')} className="dh-btn dh-btn-ghost dh-btn-sm"><Monitor size={14} />{t('darkos.sys.hw.openMonitor', 'Open System Monitor')}</button>
            <button onClick={() => onNavigate?.('optimizer')} className="dh-btn dh-btn-ghost dh-btn-sm"><Gauge size={14} />{t('darkos.sys.hw.openOptimizer', 'Open System Optimizer')}</button>
            <button onClick={() => onNavigate?.('driver')} className="dh-btn dh-btn-ghost dh-btn-sm"><MonitorCog size={14} />{t('darkos.sys.hw.openDrivers', 'Open Driver Center')}</button>
          </div>
        </Row>
      </section>

      <DarkOSConfirmDialog
        open={edgeConfirm}
        title={t('darkos.sys.edge.do', 'Reinstalar Microsoft Edge')}
        body={t('darkos.sys.edge.confirm', 'The DarkOS items that block Edge will be undone and Edge will be installed with winget (administrator required). Continue?')}
        confirmLabel={t('darkos.sys.edge.do', 'Reinstalar Microsoft Edge')}
        onCancel={() => setEdgeConfirm(false)}
        onConfirm={() => { reinstallEdge(); }}
      />
    </div>
  );
}
