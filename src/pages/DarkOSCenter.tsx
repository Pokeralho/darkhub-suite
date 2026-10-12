import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Archive, Bug, Camera, CheckCircle, FileArchive, Gauge, Layers, LifeBuoy,
  Loader2, Package, RefreshCw, RotateCcw, ShieldAlert, Undo2, Redo2, XCircle, HardDrive, Info
} from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import DarkOSProgress from '../components/darkos/DarkOSProgress';
import DarkOSConfirmDialog from '../components/darkos/DarkOSConfirmDialog';
import type { DarkOSInfo, DarkOSManifest, DarkOSProfileId, DarkOSSnapshot } from '../types/darkos';
import {
  DARKOS_PROFILES, DarkOSRow, DarkOSFailure, RemovedApp, countStatuses, mergeChanges, normalizeFailures,
  normalizeReboot, normalizeRemovedApps, normalizeSnapshots, profileDiff
} from '../utils/darkosData';

type TabId = 'overview' | 'changes' | 'profiles' | 'recovery' | 'snapshots' | 'failures' | 'diagnostics';

interface Banner { ok: boolean; message: string }

interface ConfirmState {
  title: string;
  body?: React.ReactNode;
  securityItems?: string[];
  requireSecurity?: boolean;
  danger?: boolean;
  confirmLabel?: string;
  run: (opts: { confirmSecurity: boolean }) => Promise<any>;
}

const STATUS_STYLE: Record<string, string> = {
  applied: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  reverted: 'bg-zinc-800 text-zinc-300 border-zinc-700',
  failed: 'bg-red-500/10 text-red-300 border-red-500/30',
  'pending-reboot': 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  notApplied: 'bg-zinc-900 text-zinc-500 border-zinc-800'
};

const api = () => window.darkhub?.darkos;

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-zinc-900 border border-zinc-800 rounded-xl p-4 ${className}`}>{children}</div>
);

const Stat: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({ label, value, tone = 'text-zinc-100' }) => (
  <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-3 min-w-0">
    <div className="text-[10px] uppercase tracking-wider text-zinc-500 truncate">{label}</div>
    <div className={`mt-1 text-sm font-semibold font-mono truncate ${tone}`}>{value}</div>
  </div>
);

const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition disabled:opacity-40 disabled:cursor-not-allowed';
const btnGhost = `${btn} bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 border-zinc-700/60`;
const btnPrimary = `${btn} bg-[#3b82f6] hover:bg-blue-500 text-white border-blue-500/50`;
const btnDanger = `${btn} bg-red-600/90 hover:bg-red-500 text-white border-red-500/50`;

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

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const i = await api()?.isDarkOS?.();
      setInfo(i ?? { ok: false, isDarkOS: false });
      if (!i?.isDarkOS || !i?.cliAvailable) return;
      const [cat, man] = [await api()!.getCatalog(), await api()!.getManifest()];
      if (!man.ok) setLoadError(man.error || null);
      else if (!cat.ok) setLoadError(cat.error || null);
      setManifest(man.ok ? man.data ?? null : null);
      setRows(mergeChanges(cat.ok ? cat.data : [], man.ok ? man.data : null));
      const removed = await api()!.getRemovedApps();
      setApps(removed.ok ? normalizeRemovedApps(removed.data) : []);
      const snaps = await api()!.listSnapshots();
      setSnapshots(snaps.ok ? normalizeSnapshots(snaps.data) : normalizeSnapshots(man.data?.snapshots));
      const fails = await api()!.getFailures();
      setFailures(fails.ok ? normalizeFailures(fails.data) : []);
      const rb = await api()!.getRebootPending();
      setReboot(rb.ok ? normalizeReboot(rb.data) : { pending: false, ids: [] });
    } catch (e: any) {
      setLoadError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /** Runs a mutating call; the banner is green only when the service returned ok (verified). */
  const runAction = useCallback(async (fn: () => Promise<any>) => {
    setBusy(true);
    setBanner(null);
    try {
      const res = await fn();
      if (res?.canceled) return;
      if (res?.ok === true) {
        const reboot = res.rebootRequired ? ` ${t('darkos.reboot.body', 'Restart required.')}` : '';
        setBanner({ ok: true, message: `${t('darkos.result.ok', 'Done and verified.')}${reboot}` });
      } else {
        const failed = Array.isArray(res?.failed) && res.failed.length
          ? ` (${res.failed.map((f: any) => `${f.id}${f.error ? `: ${f.error}` : ''}`).slice(0, 3).join('; ')})`
          : '';
        setBanner({ ok: false, message: `${res?.error || t('darkos.result.fail', 'Not confirmed.')}${failed}` });
      }
    } catch (e: any) {
      setBanner({ ok: false, message: e?.message ?? String(e) });
    } finally {
      setBusy(false);
      load();
    }
  }, [load, t]);

  const counts = useMemo(() => countStatuses(rows), [rows]);
  const activeProfile = (manifest?.activeProfile || 'darkosDefault') as DarkOSProfileId;
  const profileName = (p: string) => t(`darkos.profile.${p}`, p);
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
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
      <div className="min-w-0">
        <h1 className="text-lg font-bold text-zinc-100 tracking-tight flex items-center gap-2">
          <LifeBuoy className="w-5 h-5 text-[#3b82f6]" />
          {t('darkos.title', 'DarkOS Center')}
          {info?.isDarkOS ? (
            <span className="text-[10px] px-2 py-0.5 rounded bg-[#3b82f6]/10 text-blue-300 font-mono border border-blue-500/30">
              {manifest?.darkosVersion ? `v${manifest.darkosVersion}` : 'DarkOS'}
            </span>
          ) : null}
        </h1>
        <p className="text-xs text-zinc-400 mt-0.5">{t('darkos.subtitle', 'See, undo and recover everything DarkOS changed.')}</p>
      </div>
      <button onClick={load} disabled={loading || busy} className={btnGhost}>
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        {t('darkos.refresh', 'Refresh')}
      </button>
    </div>
  );

  if (loading && !info) {
    return (
      <div className="w-full max-w-6xl mx-auto space-y-4 p-1 md:p-2">
        {header}
        <div className="flex items-center gap-2 text-xs text-zinc-400"><Loader2 className="w-4 h-4 animate-spin" />{t('darkos.loading', 'Loading...')}</div>
      </div>
    );
  }

  if (!info?.isDarkOS) {
    return (
      <div className="w-full max-w-6xl mx-auto space-y-4 p-1 md:p-2">
        {header}
        <Card className="max-w-2xl">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-zinc-800 shrink-0"><Info className="w-5 h-5 text-zinc-400" /></div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-zinc-100">{t('darkos.empty.title', 'This Windows is not DarkOS')}</h2>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">{t('darkos.empty.body', '')}</p>
              <p className="mt-2 text-xs text-zinc-500">{t('darkos.empty.hint', '')}</p>
              {onNavigate ? (
                <button onClick={() => onNavigate('optimizer')} className={`${btnGhost} mt-3`}>
                  <Gauge className="w-3.5 h-3.5" />System Optimizer
                </button>
              ) : null}
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const tabs: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }>; count?: number }[] = [
    { id: 'overview', label: t('darkos.tab.overview', 'Overview'), icon: Gauge },
    { id: 'changes', label: t('darkos.tab.changes', 'Applied optimizations'), icon: Layers, count: rows.length },
    { id: 'profiles', label: t('darkos.tab.profiles', 'Profiles'), icon: Gauge },
    { id: 'recovery', label: t('darkos.tab.recovery', 'Recovery'), icon: RotateCcw, count: apps.length },
    { id: 'snapshots', label: t('darkos.tab.snapshots', 'Snapshots'), icon: Camera, count: snapshots.length },
    { id: 'failures', label: t('darkos.tab.failures', 'Failures'), icon: Bug, count: failures.length },
    { id: 'diagnostics', label: t('darkos.tab.diagnostics', 'Diagnostics'), icon: FileArchive },
  ];

  const renderOverview = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label={t('darkos.ov.version', 'DarkOS version')} value={manifest?.darkosVersion || '-'} />
        <Stat label={t('darkos.ov.build', 'Windows build')} value={manifest?.osBuild || '-'} />
        <Stat label={t('darkos.ov.profile', 'Active profile')} value={profileName(activeProfile)} tone="text-blue-300" />
        <Stat label={t('darkos.ov.snapshots', 'Snapshots')} value={snapshots.length} />
        <Stat label={t('darkos.ov.applied', 'Applied')} value={counts.applied} tone="text-emerald-300" />
        <Stat label={t('darkos.ov.reverted', 'Reverted')} value={counts.reverted} />
        <Stat label={t('darkos.ov.failed', 'Failed')} value={counts.failed} tone={counts.failed ? 'text-red-300' : 'text-zinc-100'} />
        <Stat label={t('darkos.ov.pendingReboot', 'Awaiting restart')} value={counts['pending-reboot']} tone={counts['pending-reboot'] ? 'text-amber-300' : 'text-zinc-100'} />
      </div>
      <Card>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Package className="w-4 h-4" />
          {t('darkos.ov.removedApps', 'Removed apps')}: <span className="font-mono text-zinc-200">{apps.length}</span>
          <span className="text-zinc-600">|</span>
          <HardDrive className="w-4 h-4" />
          <span className="font-mono text-zinc-500 truncate">{info?.root}</span>
          <span className="text-zinc-600">|</span>
          <span className="font-mono text-zinc-500">module: {info?.cliSource}</span>
        </div>
      </Card>
    </div>
  );

  const renderChanges = () => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter((r) => !q || r.id.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q));
    const groups = new Map<string, DarkOSRow[]>();
    for (const r of filtered) {
      const c = r.category || 'other';
      if (!groups.has(c)) groups.set(c, []);
      groups.get(c)!.push(r);
    }
    return (
      <div className="space-y-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('darkos.change.search', 'Search tweak...')}
          className="w-full md:w-80 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/60"
        />
        {filtered.length === 0 ? <p className="text-xs text-zinc-500">{t('darkos.change.none', 'No tweak found.')}</p> : null}
        {[...groups.entries()].map(([cat, items]) => (
          <Card key={cat} className="p-0 overflow-hidden">
            <div className="px-4 py-2 border-b border-zinc-800 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              {t(`darkos.cat.${cat}`, cat)} <span className="text-zinc-600 font-mono">({items.length})</span>
            </div>
            <ul className="divide-y divide-zinc-800/70">
              {items.map((r) => {
                const on = r.status === 'applied' || r.status === 'pending-reboot';
                const canToggle = on ? r.reversible !== 'nonReversible' : true;
                return (
                  <li key={r.id} className="px-4 py-2.5 flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${STATUS_STYLE[r.status] || STATUS_STYLE.notApplied}`}>
                          {t(`darkos.status.${r.status}`, r.status)}
                        </span>
                        <span className="text-xs text-zinc-200">{describe(r)}</span>
                        {r.rebootRequired ? <span className="text-[10px] text-amber-300/90">{t('darkos.change.reboot', 'Needs restart')}</span> : null}
                        {r.securityRelated ? <span className="text-[10px] inline-flex items-center gap-1 text-amber-300"><ShieldAlert className="w-3 h-3" />{t('darkos.change.security', 'Security')}</span> : null}
                        {r.reversible === 'nonReversible' ? <span className="text-[10px] text-zinc-500">{t('darkos.change.nonReversible', 'No automatic undo')}</span> : null}
                      </div>
                      <div className="mt-0.5 text-[10.5px] font-mono text-zinc-600 truncate">{r.id}</div>
                      {r.lastError ? <div className="mt-0.5 text-[11px] text-red-300/90">{r.lastError}</div> : null}
                    </div>
                    <button disabled={busy || !canToggle} onClick={() => toggleChange(r)} className={`${btnGhost} shrink-0`}>
                      {on ? <Undo2 className="w-3.5 h-3.5" /> : <Redo2 className="w-3.5 h-3.5" />}
                      {on ? t('darkos.change.undo', 'Undo') : t('darkos.change.reapply', 'Reapply')}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
    );
  };

  const renderProfiles = () => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {DARKOS_PROFILES.map((p) => {
        const active = p === activeProfile;
        const diff = profileDiff(rows, p);
        const open = diffTarget === p;
        return (
          <Card key={p} className={active ? 'border-blue-500/50' : ''}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-zinc-100">{profileName(p)}</h3>
              {active ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#3b82f6]/15 text-blue-300 border border-blue-500/30">{t('darkos.profile.active', 'Active')}</span> : null}
            </div>
            <p className="mt-2 text-xs text-zinc-400 leading-relaxed min-h-[3rem]">{t(`darkos.profile.${p}.desc`, '')}</p>
            {!active ? (
              <>
                <button onClick={() => setDiffTarget(open ? null : p)} className="mt-2 text-[11px] text-blue-300 hover:text-blue-200">
                  {t('darkos.profile.diffTitle', 'What will change')}: +{diff.apply.length} / -{diff.revert.length}
                  {diff.security.length ? <span className="text-amber-300"> ({diff.security.length} {t('darkos.change.security', 'Security')})</span> : null}
                </button>
                {open ? (
                  <ul className="mt-2 max-h-40 overflow-y-auto text-[11px] text-zinc-400 space-y-0.5">
                    {diff.apply.map((r) => <li key={`a-${r.id}`} className={r.securityRelated ? 'text-amber-300' : 'text-emerald-300/90'}>+ {describe(r)}</li>)}
                    {diff.revert.map((r) => <li key={`r-${r.id}`} className="text-zinc-400">- {describe(r)}</li>)}
                  </ul>
                ) : null}
                <button disabled={busy} onClick={() => askProfile(p)} className={`${btnPrimary} mt-3 w-full justify-center`}>
                  {t('darkos.profile.switch', 'Switch to this profile')}
                </button>
              </>
            ) : null}
          </Card>
        );
      })}
    </div>
  );

  const renderRecovery = () => (
    <div className="space-y-4">
      <Card>
        <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2"><Package className="w-4 h-4 text-zinc-400" />{t('darkos.recovery.appsTitle', 'Removed apps')}</h3>
        <p className="mt-1 text-xs text-zinc-500">{t('darkos.recovery.appsHint', '')}</p>
        {apps.length === 0 ? <p className="mt-3 text-xs text-zinc-500">{t('darkos.recovery.noApps', 'No removed apps.')}</p> : (
          <ul className="mt-3 divide-y divide-zinc-800/70">
            {apps.map((a) => (
              <li key={a.packageName} className="py-2 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-zinc-200 truncate">{a.displayName}</div>
                  <div className="text-[10.5px] font-mono text-zinc-600 truncate">{a.packageName}</div>
                </div>
                {a.restorable ? (
                  <button disabled={busy} onClick={() => runAction(() => api()!.restoreAppx({ packageNames: [a.packageName] }))} className={btnGhost}>
                    <RotateCcw className="w-3.5 h-3.5" />{t('darkos.recovery.restore', 'Restore')}
                  </button>
                ) : <span className="text-[10.5px] text-zinc-500 shrink-0">{t('darkos.recovery.noPayload', 'No local copy')}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="border-red-500/20">
        <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-400" />{t('darkos.recovery.allTitle', 'Restore everything')}</h3>
        <p className="mt-1 text-xs text-zinc-400 leading-relaxed">{t('darkos.recovery.allBody', '')}</p>
        <button disabled={busy} onClick={askRestoreAll} className={`${btnDanger} mt-3`}>
          <RotateCcw className="w-3.5 h-3.5" />{t('darkos.recovery.allButton', 'Restore everything')}
        </button>
      </Card>
    </div>
  );

  const renderSnapshots = () => (
    <Card>
      <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2"><Camera className="w-4 h-4 text-zinc-400" />{t('darkos.snap.title', 'Snapshots')}</h3>
      <p className="mt-1 text-xs text-zinc-500">{t('darkos.snap.hint', '')}</p>
      <div className="mt-3 flex gap-2">
        <input
          value={snapLabel}
          maxLength={80}
          onChange={(e) => setSnapLabel(e.target.value)}
          placeholder={t('darkos.snap.labelPlaceholder', 'Snapshot name')}
          className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/60"
        />
        <button
          disabled={busy}
          onClick={() => runAction(async () => {
            const r = await api()!.createSnapshot(snapLabel.trim() ? { label: snapLabel.trim() } : {});
            if (r.ok) setSnapLabel('');
            return r;
          })}
          className={btnPrimary}
        >
          <Camera className="w-3.5 h-3.5" />{t('darkos.snap.create', 'Create snapshot')}
        </button>
      </div>
      {snapshots.length === 0 ? <p className="mt-3 text-xs text-zinc-500">{t('darkos.snap.none', 'No snapshots yet.')}</p> : (
        <ul className="mt-3 divide-y divide-zinc-800/70">
          {[...snapshots].reverse().map((s) => (
            <li key={s.id} className="py-2 flex items-center gap-3">
              <Archive className="w-4 h-4 text-zinc-500 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-zinc-200 truncate">{s.label || s.id}</div>
                <div className="text-[10.5px] font-mono text-zinc-600">{s.ts ? new Date(s.ts).toLocaleString() : s.id}</div>
              </div>
              <button disabled={busy} onClick={() => askRestoreSnapshot(s)} className={btnGhost}>
                <RotateCcw className="w-3.5 h-3.5" />{t('darkos.snap.restore', 'Restore')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  const renderFailures = () => (
    <Card>
      <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2"><Bug className="w-4 h-4 text-zinc-400" />{t('darkos.fail.title', 'Failures')}</h3>
      {failures.length === 0 ? (
        <p className="mt-3 text-xs text-emerald-300/90 flex items-center gap-1.5"><CheckCircle className="w-4 h-4" />{t('darkos.fail.none', 'No failures.')}</p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-800/70">
          {failures.map((f, i) => (
            <li key={`${f.id}-${i}`} className="py-2">
              <div className="flex items-center gap-2 text-xs">
                <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                <span className="text-zinc-200">{rows.find((r) => r.id === f.id)?.description || f.id}</span>
                {f.action ? <span className="text-[10px] font-mono text-zinc-500">{f.action}</span> : null}
                {f.ts ? <span className="text-[10px] font-mono text-zinc-600 ml-auto">{new Date(f.ts).toLocaleString()}</span> : null}
              </div>
              <div className="mt-0.5 pl-5 text-[11px] text-red-300/90 break-words">{f.error}</div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  const renderDiagnostics = () => (
    <Card className="max-w-2xl">
      <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2"><FileArchive className="w-4 h-4 text-zinc-400" />{t('darkos.diag.title', 'Export diagnostics')}</h3>
      <p className="mt-1 text-xs text-zinc-400 leading-relaxed">{t('darkos.diag.body', '')}</p>
      <button disabled={busy} onClick={() => runAction(() => api()!.exportDiagnostics())} className={`${btnPrimary} mt-3`}>
        <FileArchive className="w-3.5 h-3.5" />{t('darkos.diag.export', 'Export .zip')}
      </button>
    </Card>
  );

  const content: Record<TabId, () => React.ReactNode> = {
    overview: renderOverview,
    changes: renderChanges,
    profiles: renderProfiles,
    recovery: renderRecovery,
    snapshots: renderSnapshots,
    failures: renderFailures,
    diagnostics: renderDiagnostics,
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-4 p-1 md:p-2 text-zinc-100 pb-16">
      {header}

      {!info.cliAvailable ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{t('darkos.noModule', 'Module not found.')}</div>
      ) : null}

      {reboot.pending || counts['pending-reboot'] > 0 ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
          <div className="text-xs">
            <div className="font-semibold text-amber-200">{t('darkos.reboot.title', 'Restart pending')}</div>
            <div className="text-amber-100/80">{t('darkos.reboot.body', '')}</div>
          </div>
        </div>
      ) : null}

      {loadError ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300 break-words">{loadError}</div>
      ) : null}

      {banner ? (
        <div className={`rounded-lg border px-3 py-2 text-xs flex items-start gap-2 ${banner.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>
          {banner.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
          <span className="break-words">{banner.message}</span>
        </div>
      ) : null}

      <div className="flex gap-1 overflow-x-auto border-b border-zinc-800/80 pb-px">
        {tabs.map((tb) => {
          const Icon = tb.icon;
          const active = tab === tb.id;
          return (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap border-b-2 -mb-px transition-colors ${active ? 'border-[#3b82f6] text-zinc-100 font-semibold' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
            >
              <Icon className={`w-3.5 h-3.5 ${active ? 'text-blue-400' : ''}`} />
              {tb.label}
              {typeof tb.count === 'number' && tb.count > 0 ? <span className="text-[10px] font-mono text-zinc-500">{tb.count}</span> : null}
            </button>
          );
        })}
      </div>

      {content[tab]()}

      <DarkOSProgress />

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
