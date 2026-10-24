import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Cpu, DownloadCloud, Info, Loader2, RefreshCw, ShieldCheck, XCircle
} from '../icons';
import { useI18n } from '../../i18n/I18nProvider';
import type { DriverDevice, DriverFindResult, DriverInstallEvent, DriverPlanItem } from '../../global';

const api = () => window.darkhub?.driver;
const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);
const mb = (bytes: number) => (bytes > 0 ? Math.max(0.1, Math.round(bytes / 104857.6) / 10) : 0);

type ItemState = { status: DriverInstallEvent['status']; detail: string; received?: number; total?: number };
const FINAL = new Set(['ok', 'reboot', 'failed', 'skipped', 'launched']);

/** "Missing drivers" section of the Driver Center: search, pick, install with progress and a log. */
export default function MissingDrivers({ onInstalled }: { onInstalled?: () => void }) {
  const { t } = useI18n();
  const [searching, setSearching] = useState(false);
  const [data, setData] = useState<DriverFindResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allowUnlock, setAllowUnlock] = useState(false);
  const [restorePoint, setRestorePoint] = useState(true);
  const [clean, setClean] = useState(false);
  const [confirming, setConfirming] = useState<string[] | null>(null);
  const [installing, setInstalling] = useState(false);
  const [states, setStates] = useState<Record<string, ItemState>>({});
  const [log, setLog] = useState<string[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [othersOpen, setOthersOpen] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: boolean; message: string; reboot?: boolean; still?: number } | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true; // StrictMode mounts twice: the ref must come back to true
    return () => { mounted.current = false; };
  }, []);

  const search = useCallback(async (unlock = false) => {
    setSearching(true);
    setOutcome(null);
    try {
      const r = await api()?.findDrivers?.({ allowUnlock: unlock });
      if (!mounted.current) return;
      const res: DriverFindResult = r ?? { ok: false, error: t('drvx.unavailable', 'Driver search unavailable.') };
      setData(res);
      if (unlock && res.ok) setAllowUnlock(true);
      setSelected(new Set(res.recommended ?? []));
    } catch (e: any) {
      if (mounted.current) setData({ ok: false, error: e?.message ?? String(e) });
    } finally {
      if (mounted.current) setSearching(false);
    }
  }, [t]);
  useEffect(() => { search(false); }, [search]);

  useEffect(() => {
    const off = api()?.onInstallEvent?.((ev) => {
      if (!mounted.current || !ev?.id) return;
      setStates((prev) => ({ ...prev, [ev.id]: { status: ev.status, detail: ev.detail, received: ev.received, total: ev.total } }));
      if (ev.status !== 'downloading' || !ev.received) {
        setLog((prev) => [...prev.slice(-300), `${new Date().toLocaleTimeString()}  ${ev.id}  ${ev.status}${ev.detail ? `  ${ev.detail}` : ''}`]);
      }
    });
    return () => { try { off?.(); } catch { /* ignore */ } };
  }, []);

  const items = data?.items ?? [];
  const missing = data?.missing ?? [];
  const main = items.filter((i) => i.recommended || i.alternative || i.fixes.length);
  const others = items.filter((i) => !main.includes(i));
  const recommended = useMemo(() => items.filter((i) => i.recommended).map((i) => i.id), [items]);
  const wu = data?.wu;
  const itemTitle = (id: string) => items.find((i) => i.id === id)?.title ?? id;

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const runInstall = async (ids: string[]) => {
    setConfirming(null);
    setInstalling(true);
    setOutcome(null);
    setStates(Object.fromEntries(ids.map((id) => [id, { status: 'start', detail: '' } as ItemState])));
    setLog([]);
    try {
      const r = await api()?.install?.({ ids, restorePoint, allowUnlock, clean });
      if (!mounted.current) return;
      if (!r) { setOutcome({ ok: false, message: fill(t('drvx.error', 'Could not install: {error}'), { error: t('drvx.unavailable', 'Driver search unavailable.') }) }); return; }
      const restoreFail = r.results?.find((x) => x.id === 'restore' && x.status === 'failed');
      if (restoreFail) {
        setOutcome({ ok: false, message: fill(t('drvx.restore.failed', ''), { error: restoreFail.detail }) });
      } else if (!r.ok && !r.results?.some((x) => x.status === 'ok' || x.status === 'reboot' || x.status === 'launched')) {
        setOutcome({ ok: false, message: fill(t('drvx.error', 'Could not install: {error}'), { error: r.error || r.results?.find((x) => x.status === 'failed')?.detail || '?' }) });
      } else {
        const still = (r.after?.missing ?? []).length;
        setOutcome({ ok: r.ok, message: r.ok ? t('drvx.done.ok', 'Install finished.') : t('drvx.done.partial', ''), reboot: r.rebootRequired, still });
      }
      onInstalled?.();
    } catch (e: any) {
      if (mounted.current) setOutcome({ ok: false, message: fill(t('drvx.error', 'Could not install: {error}'), { error: e?.message ?? String(e) }) });
    } finally {
      if (mounted.current) setInstalling(false);
    }
  };

  const reasonText = (d: DriverDevice) => {
    if (d.reason === 'genericGpu') return t('drvx.reason.genericGpu', '');
    if (d.reason === 'noDriver') return fill(t('drvx.reason.noDriver', ''), { code: d.code });
    if (d.reason === 'driverError') return fill(t('drvx.reason.driverError', ''), { code: d.code });
    return t('drvx.reason.restart', '');
  };
  const sourceText = (i: DriverPlanItem) => (i.source === 'wu' ? t('drvx.src.wu', 'Windows Update') : t(`drvx.src.${i.vendor}`, i.vendor ?? ''));

  const statusLine = (id: string) => {
    const st = states[id];
    if (!st) return null;
    const pct = st.status === 'downloading' && st.total ? Math.min(100, Math.round(((st.received ?? 0) / st.total) * 100)) : null;
    const color = st.status === 'failed' ? 'text-red-300' : FINAL.has(st.status) ? 'text-emerald-300' : 'text-zinc-300';
    return (
      <div className="mt-2 space-y-1" role="status" aria-live="polite">
        <p className={`text-[11.5px] flex items-center gap-1.5 ${color}`}>
          {FINAL.has(st.status) ? (st.status === 'failed' ? <XCircle size={12} /> : <CheckCircle2 size={12} />) : <Loader2 size={12} className="animate-spin" />}
          {t(`drvx.st.${st.status}`, st.status)}
          {pct !== null ? <span className="font-mono">{pct}% · {mb(st.received ?? 0)} / {mb(st.total ?? 0)} MB</span> : null}
          {st.status === 'failed' && st.detail ? <span className="font-mono break-all">{st.detail}</span> : null}
        </p>
        {pct !== null ? (
          <div className="h-1 w-full max-w-sm rounded bg-zinc-800 overflow-hidden"><div className="h-full bg-blue-400 transition-[width]" style={{ width: `${pct}%` }} /></div>
        ) : null}
      </div>
    );
  };

  const itemRow = (i: DriverPlanItem) => (
    <li key={i.id} className="p-3.5 flex items-start gap-3">
      <input
        type="checkbox"
        className="mt-1"
        aria-label={i.title}
        checked={selected.has(i.id)}
        disabled={installing}
        onChange={() => toggle(i.id)}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-medium text-zinc-100 break-words">{i.title}</span>
          <span className="dh-tag">{sourceText(i)}</span>
          {i.recommended ? <span className="text-[11px] text-emerald-300">{t('drvx.tag.recommended', 'recommended')}</span> : null}
          {i.alternative ? <span className="text-[11px] text-zinc-500">{t('drvx.tag.alternative', 'alternative')}</span> : null}
          {!i.silent ? <span className="text-[11px] text-amber-300">{t('drvx.tag.assisted', '')}</span> : null}
        </div>
        <p className="mt-0.5 text-[12px] text-zinc-400 break-words">
          {i.device}
          {i.version ? <span className="font-mono text-zinc-500"> · {fill(t('drvx.version', 'version {version}'), { version: i.version })}</span> : null}
          {i.date ? <span className="font-mono text-zinc-500"> · {i.date}</span> : null}
          {i.sizeBytes ? <span className="font-mono text-zinc-500"> · {fill(t('drvx.size', '{mb} MB'), { mb: mb(i.sizeBytes) })}</span> : null}
        </p>
        {i.updateAvailable && i.installedVersion ? (
          <p className="text-[11.5px] text-blue-300">{fill(t('drvx.tag.update', ''), { version: i.version, installed: i.installedVersion })}</p>
        ) : null}
        {statusLine(i.id)}
      </div>
      <button className="dh-btn dh-btn-sm shrink-0" disabled={installing || searching} onClick={() => setConfirming([i.id])}>
        <DownloadCloud size={13} />{t('drvx.installOne', 'Install')}
      </button>
    </li>
  );

  const selectedIds = items.filter((i) => selected.has(i.id)).map((i) => i.id);
  const vendorErrors = (data?.vendorLookups ?? []).filter((v) => !v.ok && v.error && v.error !== 'not needed');

  return (
    <section className="dh-card p-5 mb-6" aria-labelledby="drvx-title" aria-busy={searching || installing}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 id="drvx-title" className="dh-section-title flex items-center gap-2"><Cpu size={16} className="text-zinc-400" />{t('drvx.title', 'Missing drivers')}</h2>
          <p className="dh-help mt-1 max-w-[75ch]">{t('drvx.subtitle', '')}</p>
        </div>
        <button className="dh-btn dh-btn-sm" disabled={searching || installing} onClick={() => search(allowUnlock)}>
          <RefreshCw size={13} className={searching ? 'animate-spin' : ''} />{data ? t('drvx.searchAgain', 'Search again') : t('drvx.search', 'Search for drivers')}
        </button>
      </div>

      {searching ? (
        <p className="mt-4 text-[12.5px] text-zinc-300 flex items-center gap-2" role="status"><Loader2 size={14} className="animate-spin text-blue-300" />{t('drvx.searching', 'Searching...')}</p>
      ) : null}

      {!searching && data && !data.ok ? (
        <p role="alert" className="mt-4 text-[12.5px] text-red-300 flex items-center gap-2"><XCircle size={14} />{data.error}</p>
      ) : null}

      {!searching && data?.ok ? (
        <>
          {/* devices that need a driver */}
          <div className="mt-4">
            {missing.length === 0 ? (
              <p className="text-[12.5px] text-emerald-300 flex items-center gap-2"><CheckCircle2 size={14} />{t('drvx.allGood', '')}</p>
            ) : (
              <>
                <p className="text-[12.5px] text-amber-200 flex items-center gap-2"><AlertTriangle size={14} />{fill(t('drvx.missingCount', '{n}'), { n: missing.length })}</p>
                <ul className="mt-2 space-y-1.5">
                  {missing.map((d) => {
                    const fixer = items.find((i) => i.recommended && i.fixes.includes(d.instanceId));
                    return (
                      <li key={d.instanceId} className="text-[12.5px] pl-6">
                        <span className="text-zinc-100">{d.name}</span>
                        <span className="text-zinc-500"> · {reasonText(d)}</span>
                        <span className={`block text-[11.5px] ${fixer ? 'text-zinc-400' : 'text-amber-300/90'}`}>
                          {fixer ? fill(t('drvx.covered', ''), { title: itemTitle(fixer.id) }) : t('drvx.uncovered', '')}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>

          {/* Windows Update blocked (DarkOS) */}
          {wu?.needsUnlock ? (
            <div role="alert" className="mt-4 border-l-2 border-amber-300 pl-3 py-1">
              <p className="text-[12.5px] font-medium text-amber-200">{t('drvx.wu.blocked.title', '')}</p>
              <p className="dh-help mt-0.5 max-w-[75ch]">{t('drvx.wu.blocked.body', '')}</p>
              <ul className="mt-1 text-[11.5px] text-zinc-400 list-disc pl-5">
                {(wu.blockers ?? []).map((b) => <li key={b}>{t(`drvx.wu.blocker.${b}`, b)}</li>)}
              </ul>
              <button className="dh-btn dh-btn-sm mt-2" disabled={installing} onClick={() => search(true)}>
                <ShieldCheck size={13} />{t('drvx.wu.unlock', '')}
              </button>
            </div>
          ) : wu && !wu.ok && wu.error ? (
            <p role="alert" className="mt-4 text-[12px] text-amber-300 flex items-start gap-2">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              {wu.kind === 'offline' ? t('drvx.wu.offline', '') : fill(t('drvx.wu.error', ''), { error: wu.error })}
            </p>
          ) : null}
          {vendorErrors.map((v) => (
            <p key={`${v.vendor}-${v.deviceId}`} className="mt-2 text-[11.5px] text-zinc-500 flex items-center gap-1.5">
              <Info size={12} />{fill(t('drvx.vendor.error', ''), { vendor: v.vendor.toUpperCase(), error: v.error })}
            </p>
          ))}

          {/* plan */}
          {items.length === 0 ? (
            <p className="mt-4 dh-help">{t('drvx.none', '')}</p>
          ) : (
            <>
              {main.length ? (
                <>
                  <h3 className="dh-label mt-5 mb-1.5">{t('drvx.items', 'Drivers found')}</h3>
                  <ul className="rounded-lg border border-zinc-800/80 divide-y divide-zinc-800/80">{main.map(itemRow)}</ul>
                </>
              ) : null}
              {others.length ? (
                <div className="mt-3">
                  <button className="text-[12px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1" aria-expanded={othersOpen} onClick={() => setOthersOpen((o) => !o)}>
                    {othersOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    {fill(t('drvx.others', ''), { n: others.length })}
                  </button>
                  {othersOpen ? <ul className="mt-1.5 rounded-lg border border-zinc-800/80 divide-y divide-zinc-800/80">{others.map(itemRow)}</ul> : null}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-5 text-[12.5px] text-zinc-300">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={restorePoint} disabled={installing} onChange={(e) => setRestorePoint(e.target.checked)} />
                  {t('drvx.opt.restorePoint', '')}
                </label>
                {items.some((i) => i.source === 'vendor' && i.silent) ? (
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={clean} disabled={installing} onChange={(e) => setClean(e.target.checked)} />
                    {t('drvx.opt.clean', '')}
                  </label>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button className="dh-btn dh-btn-primary" disabled={installing || searching || recommended.length === 0} onClick={() => setConfirming(recommended)}>
                  {installing ? <Loader2 size={14} className="animate-spin" /> : <DownloadCloud size={14} />}
                  {fill(t('drvx.installAll', ''), { n: recommended.length })}
                </button>
                <button className="dh-btn" disabled={installing || searching || selectedIds.length === 0} onClick={() => setConfirming(selectedIds)}>
                  {fill(t('drvx.installSelected', ''), { n: selectedIds.length })}
                </button>
              </div>
            </>
          )}
        </>
      ) : null}

      {confirming ? (
        <div role="dialog" aria-modal="false" aria-labelledby="drvx-confirm" className="mt-4 rounded-lg border border-blue-400/30 bg-blue-500/5 p-4">
          <p id="drvx-confirm" className="text-[13px] font-medium text-zinc-100">{fill(t('drvx.confirm.title', ''), { n: confirming.length })}</p>
          <ul className="mt-1.5 text-[12px] text-zinc-400 list-disc pl-5">
            {confirming.map((id) => <li key={id}>{itemTitle(id)}</li>)}
          </ul>
          <p className="dh-help mt-2 max-w-[75ch]">{t('drvx.confirm.body', '')}</p>
          {allowUnlock && confirming.some((id) => id.startsWith('wu:')) ? <p className="dh-help mt-1 max-w-[75ch]">{t('drvx.confirm.wu', '')}</p> : null}
          <div className="mt-3 flex gap-2">
            <button className="dh-btn dh-btn-primary dh-btn-sm" onClick={() => runInstall(confirming)}><DownloadCloud size={13} />{t('drvx.confirm.go', 'Install now')}</button>
            <button className="dh-btn dh-btn-sm" onClick={() => setConfirming(null)}>{t('drvx.confirm.cancel', 'Cancel')}</button>
          </div>
        </div>
      ) : null}

      {installing ? (
        <p className="mt-4 text-[12.5px] text-blue-200 flex items-center gap-2" role="status"><Loader2 size={14} className="animate-spin" />{t('drvx.busy', '')}</p>
      ) : null}
      {states.restore ? (
        <p className={`mt-2 text-[12px] ${states.restore.status === 'failed' ? 'text-red-300' : 'text-zinc-400'}`}>
          {states.restore.status === 'ok' ? fill(t('drvx.restore.ok', ''), { n: states.restore.detail }) : states.restore.status === 'failed' ? fill(t('drvx.restore.failed', ''), { error: states.restore.detail }) : t('drvx.restore.start', '')}
        </p>
      ) : null}

      {outcome ? (
        <div role="status" className={`mt-4 border-l-2 pl-3 py-1 text-[12.5px] ${outcome.ok ? 'border-emerald-400 text-emerald-200' : 'border-red-400 text-red-300'}`}>
          <p>{outcome.message}</p>
          {outcome.reboot ? <p className="text-amber-200">{t('drvx.done.reboot', '')}</p> : null}
          {outcome.still ? <p className="text-amber-200">{fill(t('drvx.done.stillMissing', ''), { n: outcome.still })}</p> : null}
        </div>
      ) : null}

      {log.length ? (
        <div className="mt-3">
          <button className="text-[12px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1" aria-expanded={logOpen} onClick={() => setLogOpen((o) => !o)}>
            {logOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{t('drvx.log', 'Log')} ({log.length})
          </button>
          {logOpen ? (
            <pre className="mt-1.5 max-h-56 overflow-auto rounded bg-zinc-950/70 p-3 text-[11px] leading-relaxed font-mono text-zinc-400 whitespace-pre-wrap break-all">{log.join('\n')}</pre>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
