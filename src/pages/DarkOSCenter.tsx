import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Archive, Camera, Check, CheckCircle, ChevronRight, DarkHubMark, FileArchive, Gauge,
  RefreshCw, RotateCcw, Search, ShieldAlert, Undo2, Redo2, XCircle, HardDrive, Info
} from '../components/icons';
import PageHeader from '../components/ui/PageHeader';
import { useI18n } from '../i18n/I18nProvider';
import DarkOSProgress from '../components/darkos/DarkOSProgress';
import DarkOSConfirmDialog from '../components/darkos/DarkOSConfirmDialog';
import DarkOSSystemPanel from '../components/darkos/DarkOSSystemPanel';
import DarkOSReleaseCard from '../components/darkos/DarkOSReleaseCard';
import type { DarkOSInfo, DarkOSManifest, DarkOSProfileId, DarkOSSnapshot } from '../types/darkos';
import {
  DARKOS_PROFILES, DarkOSRow, DarkOSFailure, RemovedApp, countStatuses, mergeChanges, normalizeFailures,
  normalizeReboot, normalizeRemovedApps, normalizeSnapshots, profileDiff
} from '../utils/darkosData';

type TabId = 'overview' | 'system' | 'changes' | 'profiles' | 'recovery' | 'snapshots' | 'failures' | 'diagnostics';

interface Banner { ok: boolean; pending?: boolean; message: string }

interface ConfirmState {
  title: string;
  body?: React.ReactNode;
  securityItems?: string[];
  requireSecurity?: boolean;
  danger?: boolean;
  confirmLabel?: string;
  run: (opts: { confirmSecurity: boolean }) => Promise<any>;
}

/** Status is quiet coloured text with a 6px dot: it is a real, live per-tweak state. */
const STATUS_TONE: Record<string, { text: string; dot: string }> = {
  applied: { text: 'text-emerald-400', dot: 'bg-emerald-400' },
  reverted: { text: 'text-zinc-400', dot: 'bg-zinc-500' },
  failed: { text: 'text-red-400', dot: 'bg-red-400' },
  'pending-reboot': { text: 'text-amber-300', dot: 'bg-amber-300' },
  notApplied: { text: 'text-zinc-500', dot: 'bg-zinc-700' }
};

const api = () => window.darkhub?.darkos;

/** A section on a tab: sentence-case title, optional help, optional right-side actions. */
const Section: React.FC<{ title: React.ReactNode; help?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode; className?: string }> = ({ title, help, actions, children, className = '' }) => (
  <section className={className}>
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-3">
      <div className="min-w-0 max-w-[75ch]">
        <h2 className="dh-section-title">{title}</h2>
        {help ? <p className="mt-1 dh-help">{help}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
    {children}
  </section>
);

/** Overview figure: label above, mono value, coloured only when the number carries meaning. */
const Figure: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({ label, value, tone = 'text-zinc-100' }) => (
  <div className="min-w-0 px-4 py-3">
    <div className="text-[11.5px] text-zinc-500 truncate">{label}</div>
    <div className={`mt-1 font-mono text-[18px] leading-tight tabular-nums truncate ${tone}`}>{value}</div>
  </div>
);

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="px-4 py-6 text-[12.5px] text-zinc-500">{children}</p>
);

export default function DarkOSCenter({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<TabId>('overview');
  const [info, setInfo] = useState<DarkOSInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [manifest, setManifest] = useState<DarkOSManifest | null>(null);
  const [rows, setRows] = useState<DarkOSRow[]>([]);
  const [apps, setApps] = useState<RemovedApp[]>([]);
  const [snapshots, setSnapshots] = useState<DarkOSSnapshot[]>([]);
  const [failures, setFailures] = useState<DarkOSFailure[]>([]);
  const [reboot, setReboot] = useState<{ pending: boolean; ids: string[] }>({ pending: false, ids: [] });
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [search, setSearch] = useState('');
  const [snapLabel, setSnapLabel] = useState('');
  const [diffTarget, setDiffTarget] = useState<DarkOSProfileId | null>(null);

  const mounted = useRef(true);
  // Each load gets a sequence number; a slower, older load never overwrites a newer one.
  const loadSeq = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const current = () => mounted.current && seq === loadSeq.current;
    setLoading(true);
    setLoadError(null);
    try {
      const i = await api()?.isDarkOS?.();
      if (!current()) return;
      setInfo(i ?? { ok: false, isDarkOS: false });
      if (!(i?.isDarkOS || i?.mode === 'windows') || !i?.cliAvailable) return;
      const [cat, man] = [await api()!.getCatalog(), await api()!.getManifest()];
      if (!current()) return;
      if (!man.ok) setLoadError(man.error || null);
      else if (!cat.ok) setLoadError(cat.error || null);
      setManifest(man.ok ? man.data ?? null : null);
      // Windows mode also reads the live state, so tweaks the system already has are not offered as new.
      const st = i?.mode === 'windows' ? await api()!.getStatus() : null;
      if (!current()) return;
      setRows(mergeChanges(cat.ok ? cat.data : [], man.ok ? man.data : null, st?.ok ? st.data : null));
      const removed = await api()!.getRemovedApps();
      if (!current()) return;
      setApps(removed.ok ? normalizeRemovedApps(removed.data) : []);
      const snaps = await api()!.listSnapshots();
      if (!current()) return;
      setSnapshots(snaps.ok ? normalizeSnapshots(snaps.data) : normalizeSnapshots(man.data?.snapshots));
      const fails = await api()!.getFailures();
      if (!current()) return;
      setFailures(fails.ok ? normalizeFailures(fails.data) : []);
      const rb = await api()!.getRebootPending();
      if (!current()) return;
      setReboot(rb.ok ? normalizeReboot(rb.data) : { pending: false, ids: [] });
    } catch (e: any) {
      if (current()) setLoadError(e?.message ?? String(e));
    } finally {
      if (current()) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /** Runs a mutating call; the banner is green only when the service returned ok (verified). */
  const runAction = useCallback(async (fn: () => Promise<any>) => {
    setBusy(true);
    setBanner(null);
    try {
      const res = await fn();
      if (res?.canceled || !mounted.current) return;
      if (res?.ok === true) {
        const rebootNote = res.rebootRequired ? ` ${t('darkos.reboot.body', 'Restart required.')}` : '';
        setBanner({ ok: true, message: `${res.message || t('darkos.result.ok', 'Done and verified.')}${rebootNote}` });
      } else if (res?.status === 'pending-reboot') {
        setBanner({ ok: false, pending: true, message: t('darkos.result.pending', 'Applied; it can only be verified after a restart.') });
      } else {
        const failed = Array.isArray(res?.failed) && res.failed.length
          ? ` (${res.failed.map((f: any) => `${f.id}${f.error ? `: ${f.error}` : ''}`).slice(0, 3).join('; ')})`
          : '';
        setBanner({ ok: false, message: `${res?.error || t('darkos.result.fail', 'Not confirmed.')}${failed}` });
      }
    } catch (e: any) {
      if (mounted.current) setBanner({ ok: false, message: e?.message ?? String(e) });
    } finally {
      if (mounted.current) {
        setBusy(false);
        load();
      }
    }
  }, [load, t]);

  const counts = useMemo(() => countStatuses(rows), [rows]);
  const winMode = info?.mode === 'windows';
  const activeProfile = (manifest?.activeProfile || 'darkosDefault') as DarkOSProfileId;
  const profileName = (p: string) => (winMode ? t(`darkos.win.profile.${p}`, t(`darkos.profile.${p}`, p)) : t(`darkos.profile.${p}`, p));
  const describe = (r: DarkOSRow) => r.description || r.id;

  const toggleChange = (r: DarkOSRow) => {
    const isOn = r.status === 'applied' || r.status === 'pending-reboot';
    const ids = [r.id];
    if (isOn) {
      runAction(() => api()!.revertChange({ ids }));
      return;
    }
    if (r.securityRelated) {
      setConfirm({
        title: `${t('darkos.change.reapply', 'Reapply')}: ${describe(r)}`,
        securityItems: [describe(r)],
        requireSecurity: true,
        danger: true,
        run: ({ confirmSecurity }) => runAction(() => api()!.applyChange({ ids, confirmSecurity })),
      });
      return;
    }
    runAction(() => api()!.applyChange({ ids }));
  };

  /** Applies (or undoes) every item of one category; security items are never part of a bulk apply. */
  const toggleGroup = (items: DarkOSRow[], undo: boolean) => {
    const ids = items
      .filter((r) => (undo ? r.status === 'applied' || r.status === 'pending-reboot' : r.status !== 'applied' && r.status !== 'pending-reboot' && !r.live && !r.absent && !r.securityRelated))
      .map((r) => r.id);
    if (ids.length) runAction(() => (undo ? api()!.revertChange({ ids }) : api()!.applyChange({ ids })));
  };

  const askProfile = (target: DarkOSProfileId) => {
    const diff = profileDiff(rows, target);
    setConfirm({
      title: `${t('darkos.profile.switch', 'Switch to this profile')}: ${profileName(target)}`,
      body: (
        <div className="space-y-2">
          {diff.apply.length === 0 && diff.revert.length === 0 ? <p>{t('darkos.profile.noDiff', 'No difference.')}</p> : null}
          {diff.apply.length ? (
            <div>
              <p className="text-zinc-200 font-semibold">{t('darkos.profile.willApply', 'Will be applied')} ({diff.apply.length})</p>
              <ul className="list-disc pl-4">{diff.apply.filter((r) => !r.securityRelated).slice(0, 12).map((r) => <li key={r.id}>{describe(r)}</li>)}</ul>
            </div>
          ) : null}
          {diff.revert.length ? (
            <div>
              <p className="text-zinc-200 font-semibold">{t('darkos.profile.willRevert', 'Will be undone')} ({diff.revert.length})</p>
              <ul className="list-disc pl-4">{diff.revert.slice(0, 12).map((r) => <li key={r.id}>{describe(r)}</li>)}</ul>
            </div>
          ) : null}
        </div>
      ),
      securityItems: diff.security.map(describe),
      confirmLabel: t('darkos.profile.confirm', 'Confirm switch'),
      run: ({ confirmSecurity }) => runAction(() => api()!.setProfile({ profile: target, confirmSecurity })),
    });
  };

  const askRestoreAll = () => setConfirm({
    title: t('darkos.recovery.allTitle', 'Restore everything to original'),
    body: t('darkos.recovery.allConfirm', 'All DarkOS tweaks will be undone.'),
    danger: true,
    confirmLabel: t('darkos.recovery.allButton', 'Restore everything'),
    run: () => runAction(() => api()!.restoreProfile()),
  });

  const askRestoreSnapshot = (s: DarkOSSnapshot) => setConfirm({
    title: `${t('darkos.snap.restore', 'Restore')}: ${s.label || s.id}`,
    body: t('darkos.snap.restoreConfirm', 'Restore this snapshot?'),
    run: () => runAction(() => api()!.restoreSnapshot({ id: s.id })),
  });

  const header = (
    <PageHeader
      title={(
        <span className="inline-flex items-center gap-2.5">
          <DarkHubMark size={20} className="text-zinc-100" />
          {winMode ? t('darkos.win.title', 'DarkOS Mods') : t('darkos.title', 'DarkOS Center')}
          {info?.isDarkOS && manifest?.darkosVersion ? (
            <span className="dh-tag text-[11.5px] font-normal translate-y-px">v{manifest.darkosVersion}</span>
          ) : null}
        </span>
      )}
      subtitle={winMode ? t('darkos.win.subtitle', '') : t('darkos.subtitle', 'See, undo and recover everything DarkOS changed.')}
      actions={(
        <button onClick={load} disabled={loading || busy} className="dh-btn">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {t('darkos.refresh', 'Refresh')}
        </button>
      )}
    />
  );

  if (loading && !info) {
    return (
      <div className="w-full">
        {header}
        <div role="status" aria-label={t('darkos.loading', 'Loading...')} className="space-y-6">
          <div className="dh-card grid grid-cols-2 md:grid-cols-4 md:divide-x divide-zinc-800/80">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="px-4 py-3 space-y-2">
                <div className="h-3 w-20 rounded bg-zinc-800/80 animate-pulse" />
                <div className="h-5 w-24 rounded bg-zinc-800/80 animate-pulse" />
              </div>
            ))}
          </div>
          <div className="dh-card divide-y divide-zinc-800/80">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-3">
                <div className="h-3 w-16 rounded bg-zinc-800/80 animate-pulse" />
                <div className="h-3 flex-1 max-w-sm rounded bg-zinc-800/80 animate-pulse" />
                <div className="ml-auto h-7 w-20 rounded-md bg-zinc-800/80 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!info?.isDarkOS && !winMode) {
    return (
      <div className="w-full space-y-8">
        {header}
        <div className="flex items-start gap-3 max-w-[75ch]">
          <Info size={18} className="text-zinc-500 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h2 className="dh-section-title">{t('darkos.empty.title', 'This Windows is not DarkOS')}</h2>
            <p className="mt-1.5 text-[12.5px] text-zinc-400 leading-relaxed">{t('darkos.empty.body', '')}</p>
            <p className="mt-1.5 dh-help">{t('darkos.empty.hint', '')}</p>
            {onNavigate ? (
              <button onClick={() => onNavigate('optimizer')} className="dh-btn mt-4">
                <Gauge size={14} />System Optimizer
              </button>
            ) : null}
          </div>
        </div>
        <DarkOSReleaseCard onNavigate={onNavigate} />
        <DarkOSSystemPanel onNavigate={onNavigate} />
      </div>
    );
  }

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'overview', label: t('darkos.tab.overview', 'Overview') },
    { id: 'system', label: t('darkos.sys.title', 'System & updates') },
    { id: 'changes', label: winMode ? t('darkos.win.tab', 'Mods') : t('darkos.tab.changes', 'Applied optimizations'), count: rows.length },
    { id: 'profiles', label: t('darkos.tab.profiles', 'Profiles') },
    { id: 'recovery', label: t('darkos.tab.recovery', 'Recovery'), count: apps.length },
    { id: 'snapshots', label: t('darkos.tab.snapshots', 'Snapshots'), count: snapshots.length },
    { id: 'failures', label: t('darkos.tab.failures', 'Failures'), count: failures.length },
    { id: 'diagnostics', label: t('darkos.tab.diagnostics', 'Diagnostics') },
  ];

  const renderOverview = () => (
    <div className="space-y-6">
      <section className="dh-card">
        <div className="grid grid-cols-2 md:grid-cols-4 md:divide-x divide-zinc-800/80 border-b border-zinc-800/80">
          {winMode
            ? <Figure label={t('darkos.win.modeLabel', 'Mode')} value={<span className="font-sans text-[15px] font-medium">Windows</span>} />
            : <Figure label={t('darkos.ov.version', 'DarkOS version')} value={manifest?.darkosVersion || '-'} />}
          <Figure label={t('darkos.ov.build', 'Windows build')} value={manifest?.osBuild || '-'} />
          <Figure label={t('darkos.ov.profile', 'Active profile')} value={<span className="font-sans text-[15px] font-medium text-blue-300">{profileName(activeProfile)}</span>} />
          <Figure label={t('darkos.ov.snapshots', 'Snapshots')} value={snapshots.length} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 md:divide-x divide-zinc-800/80">
          <Figure label={t('darkos.ov.applied', 'Applied')} value={counts.applied} tone={counts.applied ? 'text-emerald-400' : 'text-zinc-100'} />
          <Figure label={t('darkos.ov.reverted', 'Reverted')} value={counts.reverted} />
          <Figure label={t('darkos.ov.failed', 'Failed')} value={counts.failed} tone={counts.failed ? 'text-red-400' : 'text-zinc-100'} />
          <Figure label={t('darkos.ov.pendingReboot', 'Awaiting restart')} value={counts['pending-reboot']} tone={counts['pending-reboot'] ? 'text-amber-300' : 'text-zinc-100'} />
        </div>
      </section>
      <DarkOSReleaseCard installed={winMode ? null : { version: manifest?.darkosVersion, build: manifest?.osBuild }} onNavigate={onNavigate} />
      <dl className="divide-y divide-zinc-800/80 border-y border-zinc-800/80 text-[12.5px]">
        <div className="flex items-center gap-4 py-2.5">
          <dt className="w-40 shrink-0 text-zinc-500">{t('darkos.ov.removedApps', 'Removed apps')}</dt>
          <dd className="font-mono text-zinc-200">{apps.length}</dd>
          {apps.length ? <button onClick={() => setTab('recovery')} className="ml-auto text-[12px] text-zinc-400 hover:text-zinc-100 transition-colors">{t('darkos.tab.recovery', 'Recovery')}</button> : null}
        </div>
        <div className="flex items-center gap-4 py-2.5 min-w-0">
          <dt className="w-40 shrink-0 text-zinc-500 inline-flex items-center gap-1.5"><HardDrive size={14} />{t('darkos.ov.root', 'Pasta raiz')}</dt>
          <dd className="font-mono text-zinc-300 truncate">{info?.root || '-'}</dd>
        </div>
        <div className="flex items-center gap-4 py-2.5 min-w-0">
          <dt className="w-40 shrink-0 text-zinc-500">{t('darkos.ov.module', 'Module')}</dt>
          <dd className="font-mono text-zinc-300 truncate">{info?.cliSource || '-'}</dd>
        </div>
      </dl>
    </div>
  );

  const renderChanges = () => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter((r) => !q || r.id.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q));
    const groups = new Map<string, DarkOSRow[]>();
    // Gaming and latency first: that is what most people come here for.
    const order = ['gaming', 'power', 'network', 'services', 'privacy', 'ui', 'tasks', 'appx', 'debloat'];
    filtered.sort((a, b) => {
      const ia = order.indexOf(a.category || ''), ib = order.indexOf(b.category || '');
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    for (const r of filtered) {
      const c = r.category || 'other';
      if (!groups.has(c)) groups.set(c, []);
      groups.get(c)!.push(r);
    }
    return (
      <div className="space-y-5">
        <div className="relative w-full md:w-80">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t('darkos.change.search', 'Search tweak...')}
            placeholder={t('darkos.change.search', 'Search tweak...')}
            className="dh-input w-full pl-8"
          />
        </div>
        {filtered.length === 0 ? <p className="text-[12.5px] text-zinc-500">{t('darkos.change.none', 'No tweak found.')}</p> : null}
        {[...groups.entries()].map(([cat, items]) => (
          <section key={cat}>
            <div className="flex items-center justify-between gap-3 mb-2">
              <h2 className="dh-section-title">
                {t(`darkos.cat.${cat}`, cat)} <span className="ml-1 font-mono text-[11.5px] font-normal text-zinc-500">{items.length}</span>
              </h2>
              <div className="flex items-center gap-1">
                <button disabled={busy} onClick={() => toggleGroup(items, false)} className="dh-btn dh-btn-sm">
                  <Redo2 size={14} />{t('darkos.change.applyAll', 'Apply all')}
                </button>
                <button disabled={busy} onClick={() => toggleGroup(items, true)} className="dh-btn dh-btn-sm dh-btn-ghost">
                  <Undo2 size={14} />{t('darkos.change.undoAll', 'Undo all')}
                </button>
              </div>
            </div>
            <ul className="dh-card divide-y divide-zinc-800/80">
              {items.map((r) => {
                const on = r.status === 'applied' || r.status === 'pending-reboot';
                const canToggle = on ? r.reversible !== 'nonReversible' : true;
                const already = !on && r.status !== 'failed' && r.live === true;
                const absent = !on && r.absent === true;
                const tone = already ? STATUS_TONE.applied : STATUS_TONE[r.status] || STATUS_TONE.notApplied;
                return (
                  <li key={r.id} className="px-4 py-2.5 flex items-start gap-4 hover:bg-zinc-800/20 transition-colors">
                    <span className={`w-28 shrink-0 pt-0.5 inline-flex items-center gap-1.5 text-[11.5px] ${tone.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tone.dot}`} aria-hidden />
                      <span className="truncate">{absent ? t('darkos.status.absent', 'Not on this Windows') : already ? t('darkos.status.live', 'Already active') : t(`darkos.status.${r.status}`, r.status)}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-zinc-200">{describe(r)}</div>
                      <div className="mt-0.5 flex items-center gap-3 flex-wrap text-[11.5px]">
                        <span className="font-mono text-zinc-600 truncate">{r.id}</span>
                        {r.rebootRequired ? <span className="text-amber-300/90">{t('darkos.change.reboot', 'Needs restart')}</span> : null}
                        {r.securityRelated ? <span className="inline-flex items-center gap-1 text-amber-300"><ShieldAlert size={12} />{t('darkos.change.security', 'Security')}</span> : null}
                        {r.reversible === 'nonReversible' ? <span className="text-zinc-500">{t('darkos.change.nonReversible', 'No automatic undo')}</span> : null}
                      </div>
                      {r.lastError ? <div className="mt-1 text-[12px] text-red-300 break-words">{r.lastError}</div> : null}
                    </div>
                    {already || absent ? null : (
                      <button disabled={busy || !canToggle} onClick={() => toggleChange(r)} className="dh-btn dh-btn-sm shrink-0">
                        {on ? <Undo2 size={14} /> : <Redo2 size={14} />}
                        {on ? t('darkos.change.undo', 'Undo') : r.status === 'notApplied' ? t('darkos.change.apply', 'Apply') : t('darkos.change.reapply', 'Reapply')}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    );
  };

  const renderProfiles = () => (
    <ul className="dh-card divide-y divide-zinc-800/80">
      {DARKOS_PROFILES.map((p) => {
        const active = p === activeProfile;
        const diff = profileDiff(rows, p);
        const open = diffTarget === p;
        return (
          <li key={p} className="px-4 py-4">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
              <div className="min-w-0 max-w-[75ch]">
                <h3 className="text-[13.5px] font-semibold text-zinc-100 flex items-center gap-2">
                  {profileName(p)}
                  {active ? (
                    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-normal text-blue-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400" aria-hidden />{t('darkos.profile.active', 'Active')}
                    </span>
                  ) : null}
                </h3>
                <p className="mt-1 dh-help">{t(`darkos.profile.${p}.desc`, '')}</p>
                {!active ? (
                  <button onClick={() => setDiffTarget(open ? null : p)} aria-expanded={open} className="mt-2 inline-flex items-center gap-1 text-[12px] text-zinc-400 hover:text-zinc-100 transition-colors">
                    <ChevronRight size={14} className={`transition-transform duration-150 ease-out ${open ? 'rotate-90' : ''}`} />
                    {t('darkos.profile.diffTitle', 'What will change')}
                    <span className="font-mono text-zinc-500">+{diff.apply.length} / -{diff.revert.length}</span>
                    {diff.security.length ? <span className="text-amber-300">({diff.security.length} {t('darkos.change.security', 'Security')})</span> : null}
                  </button>
                ) : null}
              </div>
              {!active ? (
                <button disabled={busy} onClick={() => askProfile(p)} className="dh-btn dh-btn-sm shrink-0">
                  {t('darkos.profile.switch', 'Switch to this profile')}
                </button>
              ) : null}
            </div>
            {!active && open ? (
              <ul className="mt-3 ml-5 max-h-48 overflow-y-auto border-l border-zinc-800/80 pl-3 text-[12px] space-y-1">
                {diff.apply.map((r) => (
                  <li key={`a-${r.id}`} className={`flex gap-2 ${r.securityRelated ? 'text-amber-300' : 'text-zinc-300'}`}>
                    <span className="font-mono text-emerald-400 w-3 shrink-0">+</span>{describe(r)}
                  </li>
                ))}
                {diff.revert.map((r) => (
                  <li key={`r-${r.id}`} className="flex gap-2 text-zinc-400">
                    <span className="font-mono text-zinc-500 w-3 shrink-0">-</span>{describe(r)}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );

  const renderRecovery = () => (
    <div className="space-y-8">
      <Section title={t('darkos.recovery.appsTitle', 'Removed apps')} help={t('darkos.recovery.appsHint', '')}>
        <div className="dh-card">
          {apps.length === 0 ? <Empty>{t('darkos.recovery.noApps', 'No removed apps.')}</Empty> : (
            <ul className="divide-y divide-zinc-800/80">
              {apps.map((a) => (
                <li key={a.packageName} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-zinc-200 truncate">{a.displayName}</div>
                    <div className="text-[11.5px] font-mono text-zinc-600 truncate">{a.packageName}</div>
                  </div>
                  {a.installed ? (
                    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-emerald-400 shrink-0"><Check size={14} />{t('darkos.recovery.installed', 'Installed')}</span>
                  ) : a.restorable ? (
                    <button disabled={busy} onClick={() => runAction(() => api()!.restoreAppx({ packageNames: [a.packageName] }))} className="dh-btn dh-btn-sm">
                      <RotateCcw size={14} />{t('darkos.recovery.restore', 'Restore')}
                    </button>
                  ) : <span className="text-[11.5px] text-zinc-500 shrink-0">{t('darkos.recovery.noPayload', 'No local copy')}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>
      <section className="border-t border-zinc-800/80 pt-6 flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="min-w-0 max-w-[75ch]">
          <h2 className="dh-section-title">{t('darkos.recovery.allTitle', 'Restore everything')}</h2>
          <p className="mt-1 dh-help">{t('darkos.recovery.allBody', '')}</p>
        </div>
        <button disabled={busy} onClick={askRestoreAll} className="dh-btn dh-btn-danger shrink-0">
          <RotateCcw size={14} />{t('darkos.recovery.allButton', 'Restore everything')}
        </button>
      </section>
    </div>
  );

  const renderSnapshots = () => (
    <Section title={t('darkos.snap.title', 'Snapshots')} help={t('darkos.snap.hint', '')}>
      <div className="flex gap-2 mb-4 max-w-xl">
        <input
          value={snapLabel}
          maxLength={80}
          onChange={(e) => setSnapLabel(e.target.value)}
          aria-label={t('darkos.snap.labelPlaceholder', 'Snapshot name')}
          placeholder={t('darkos.snap.labelPlaceholder', 'Snapshot name')}
          className="dh-input flex-1 min-w-0"
        />
        <button
          disabled={busy}
          onClick={() => runAction(async () => {
            const r = await api()!.createSnapshot(snapLabel.trim() ? { label: snapLabel.trim() } : {});
            if (r.ok) setSnapLabel('');
            return r;
          })}
          className="dh-btn dh-btn-primary shrink-0"
        >
          <Camera size={14} />{t('darkos.snap.create', 'Create snapshot')}
        </button>
      </div>
      <div className="dh-card">
        {snapshots.length === 0 ? <Empty>{t('darkos.snap.none', 'No snapshots yet.')}</Empty> : (
          <ul className="divide-y divide-zinc-800/80">
            {[...snapshots].reverse().map((s) => (
              <li key={s.id} className="px-4 py-2.5 flex items-center gap-3">
                <Archive size={16} className="text-zinc-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-zinc-200 truncate">{s.label || s.id}</div>
                  <div className="text-[11.5px] font-mono text-zinc-500">{s.ts ? new Date(s.ts).toLocaleString() : s.id}</div>
                </div>
                <button disabled={busy} onClick={() => askRestoreSnapshot(s)} className="dh-btn dh-btn-sm">
                  <RotateCcw size={14} />{t('darkos.snap.restore', 'Restore')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );

  const renderFailures = () => (
    <Section title={t('darkos.fail.title', 'Failures')}>
      <div className="dh-card">
        {failures.length === 0 ? (
          <p className="px-4 py-6 text-[12.5px] text-zinc-400 flex items-center gap-2"><CheckCircle size={16} className="text-emerald-400" />{t('darkos.fail.none', 'No failures.')}</p>
        ) : (
          <ul className="divide-y divide-zinc-800/80">
            {failures.map((f, i) => (
              <li key={`${f.id}-${i}`} className="px-4 py-2.5">
                <div className="flex items-center gap-2 text-[13px] min-w-0">
                  <XCircle size={14} className="text-red-400 shrink-0" />
                  <span className="text-zinc-200 truncate">{rows.find((r) => r.id === f.id)?.description || f.id}</span>
                  {f.action ? <span className="dh-tag shrink-0">{f.action}</span> : null}
                  {f.ts ? <span className="text-[11.5px] font-mono text-zinc-600 ml-auto shrink-0">{new Date(f.ts).toLocaleString()}</span> : null}
                </div>
                <div className="mt-1 pl-[22px] font-mono text-[11.5px] text-red-300/90 break-words">{f.error}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );

  const renderDiagnostics = () => (
    <section className="flex flex-col md:flex-row md:items-start justify-between gap-4 max-w-4xl">
      <div className="min-w-0 max-w-[75ch]">
        <h2 className="dh-section-title">{t('darkos.diag.title', 'Export diagnostics')}</h2>
        <p className="mt-1 dh-help">{t('darkos.diag.body', '')}</p>
      </div>
      <button disabled={busy} onClick={() => runAction(async () => { const r = await api()!.exportDiagnostics(); return r?.ok && r.path ? { ...r, message: `${t('darkos.diag.saved', 'Diagnostics saved to')} ${r.path}` } : r; })} className="dh-btn dh-btn-primary shrink-0">
        <FileArchive size={14} />{t('darkos.diag.export', 'Export .zip')}
      </button>
    </section>
  );

  const content: Record<TabId, () => React.ReactNode> = {
    overview: renderOverview,
    system: () => <DarkOSSystemPanel onNavigate={onNavigate} />,
    changes: renderChanges,
    profiles: renderProfiles,
    recovery: renderRecovery,
    snapshots: renderSnapshots,
    failures: renderFailures,
    diagnostics: renderDiagnostics,
  };

  const notice = (tone: 'ok' | 'warn' | 'err', icon: React.ReactNode, children: React.ReactNode, role: 'alert' | 'status' = 'status') => (
    <div
      role={role}
      aria-live={role === 'status' ? 'polite' : undefined}
      className={`flex items-start gap-2 border-l-2 pl-3 py-1 text-[12.5px] ${tone === 'ok' ? 'border-emerald-400 text-emerald-300' : tone === 'warn' ? 'border-amber-300 text-amber-200' : 'border-red-400 text-red-300'}`}
    >
      <span className="shrink-0 mt-px">{icon}</span>
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );

  return (
    <div className="w-full pb-16">
      {header}

      <div className="space-y-2 empty:hidden mb-5">
        {!info.cliAvailable ? notice('err', <XCircle size={14} />, t('darkos.noModule', 'Module not found.'), 'alert') : null}
        {winMode && tab === 'overview' ? notice('ok', <Info size={14} />, t('darkos.win.intro', '')) : null}
        {reboot.pending || counts['pending-reboot'] > 0 ? notice('warn', <AlertTriangle size={14} />, (
          <><span className="font-medium text-amber-200">{t('darkos.reboot.title', 'Restart pending')}</span> <span className="text-amber-100/70">{t('darkos.reboot.body', '')}</span></>
        )) : null}
        {loadError ? notice('err', <XCircle size={14} />, (
          <>{loadError} <button onClick={load} disabled={loading} className="ml-1 underline underline-offset-2 text-red-200 hover:text-red-100">{t('darkos.refresh', 'Refresh')}</button></>
        ), 'alert') : null}
        {banner ? notice(banner.ok ? 'ok' : banner.pending ? 'warn' : 'err', banner.ok ? <CheckCircle size={14} /> : banner.pending ? <AlertTriangle size={14} /> : <XCircle size={14} />, banner.message) : null}
      </div>

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
        <nav role="tablist" aria-orientation="vertical" className="flex lg:flex-col gap-0.5 overflow-x-auto lg:overflow-visible lg:w-48 shrink-0 border-b lg:border-b-0 border-zinc-800/80 pb-2 lg:pb-0">
          {tabs.map((tb) => {
            const active = tab === tb.id;
            return (
              <button
                key={tb.id}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(tb.id)}
                className={`relative flex items-center justify-between gap-3 h-8 px-3 rounded-md text-[12.5px] whitespace-nowrap text-left transition-colors duration-150 ${active ? 'bg-zinc-900 text-zinc-50 font-medium' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/60'}`}
              >
                {active ? <span className="hidden lg:block absolute left-0 top-2 bottom-2 w-px bg-blue-400" aria-hidden /> : null}
                <span className="truncate">{tb.label}</span>
                {typeof tb.count === 'number' && tb.count > 0 ? (
                  <span className={`font-mono text-[11px] ${tb.id === 'failures' ? 'text-red-400' : 'text-zinc-500'}`}>{tb.count}</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1 space-y-8">
          <div key={tab} className="animate-in">{content[tab]()}</div>
          <DarkOSProgress />
        </div>
      </div>

      <DarkOSConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title ?? ''}
        body={confirm?.body}
        securityItems={confirm?.securityItems}
        requireSecurity={confirm?.requireSecurity}
        danger={confirm?.danger}
        confirmLabel={confirm?.confirmLabel}
        onCancel={() => setConfirm(null)}
        onConfirm={(opts) => {
          const c = confirm;
          setConfirm(null);
          c?.run(opts);
        }}
      />
    </div>
  );
}
