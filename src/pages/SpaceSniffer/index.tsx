import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DiskMapDrive, DiskMapInfo, DiskMapNode, DiskMapStatus, DiskMapTag } from '../../global';
import {
  AlertTriangle, ArrowRight, ChevronRight, Clipboard, Download, ExternalLink, FolderOpen, HardDrive, HelpCircle, Home,
  LayoutGrid, Loader2, RefreshCw, Search, Trash2, X, XCircle
} from '../../components/icons';
import PageHeader from '../../components/ui/PageHeader';
import { useI18n } from '../../i18n/I18nProvider';
import TreemapCanvas, { CLASS_COLOR, TAG_COLOR } from './TreemapCanvas';
import { formatBytes } from './treemap';

const api = () => window.darkhub?.diskscan;
const TAGS: DiskMapTag[] = ['red', 'yellow', 'green', 'blue'];
const CLASSES = ['video', 'audio', 'image', 'archive', 'program', 'code', 'document', 'data', 'other'];
const PRESETS = ['>1gb', 'm<1day', ':class:video', '*.iso;*.zip;*.rar;*.7z', '|:class:program'];

const fmtDate = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString() : '-');
const fmtInt = (n: number | undefined) => (n ?? 0).toLocaleString();
const fmtTime = (ms: number) => (ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`);
const ATTRS: Array<[number, string]> = [[0x2, 'hidden'], [0x4, 'system'], [0x1, 'readonly'], [0x800, 'compressed'], [0x4000, 'encrypted'], [0x400, 'link'], [0x1000, 'offline']];

export default function DiskMap() {
  const { t } = useI18n();
  const [drives, setDrives] = useState<DiskMapDrive[] | null>(null);
  const [status, setStatus] = useState<DiskMapStatus | null>(null);
  const [viewId, setViewId] = useState('d0');
  const [tree, setTree] = useState<DiskMapNode | null>(null);
  const [trail, setTrail] = useState<{ id: string; name: string }[]>([]);
  const [filterText, setFilterText] = useState('');
  const [filter, setFilter] = useState('');
  const [filterErrors, setFilterErrors] = useState<string[]>([]);
  const [minPx, setMinPx] = useState(10);
  const [showFree, setShowFree] = useState(false);
  const [volume, setVolume] = useState<{ total: number; free: number } | null>(null);
  const [selected, setSelected] = useState<DiskMapNode | null>(null);
  const [info, setInfo] = useState<DiskMapInfo | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmTrash, setConfirmTrash] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const area = useRef({ w: 1200, h: 600 });
  const [areaTick, setAreaTick] = useState(0);

  const active = Boolean(status?.active);
  const running = Boolean(status?.running);

  // Drives + an existing scan (it lives in the main process, so it survives navigating away).
  useEffect(() => {
    api()?.status().then((s) => setStatus(s)).catch(() => {});
    api()?.drives().then((r) => setDrives(r?.ok ? r.drives || [] : [])).catch(() => setDrives([]));
    const off = api()?.onProgress((s) => setStatus(s));
    return () => { off?.(); };
  }, []);

  // Debounced filter: the whole tree is filtered in the main process.
  useEffect(() => { const h = setTimeout(() => setFilter(filterText.trim()), 250); return () => clearTimeout(h); }, [filterText]);

  const loadView = useCallback(async () => {
    if (!api()) return;
    const { w, h } = area.current;
    const r = await api()!.view({ id: viewId, filter, showFree, minFraction: (minPx * minPx) / Math.max(1, w * h), maxNodes: 7000 });
    if (!r?.ok) { if (viewId !== 'd0') setViewId('d0'); return; }
    setTree(r.tree || null);
    setVolume(r.volume || null);
    setTrail(r.trail || []);
    setFilterErrors(r.filterErrors || []);
  }, [viewId, filter, minPx, showFree]);

  // Refresh: on view/filter/detail change, after edits, and once a second while scanning (live map).
  useEffect(() => { if (active) loadView(); }, [active, loadView, version, areaTick]);
  useEffect(() => {
    if (!running) return;
    const h = setInterval(loadView, 1000);
    return () => clearInterval(h);
  }, [running, loadView]);
  const wasRunning = useRef(false);
  useEffect(() => { if (wasRunning.current && !running) loadView(); wasRunning.current = running; }, [running, loadView]);

  useEffect(() => {
    setConfirmTrash(false);
    if (!selected || !['dir', 'file'].includes(selected.kind)) { setInfo(null); return; }
    api()?.info({ id: selected.id, filter }).then((r) => setInfo(r?.ok ? r.info || null : null)).catch(() => setInfo(null));
  }, [selected, filter, version]);

  const onSize = useCallback((w: number, h: number) => {
    const a = area.current;
    if (Math.abs(a.w - w) > 40 || Math.abs(a.h - h) > 40) { area.current = { w, h }; setAreaTick((n) => n + 1); }
  }, []);

  const start = async (root: string) => {
    setNotice(null); setSelected(null); setViewId('d0'); setTree(null); setFilterText(''); setFilter('');
    const r = await api()?.start({ root });
    if (!r?.ok) { setNotice({ ok: false, text: r?.error || t('diskmap.startFail', 'Could not start the scan.') }); return; }
    setStatus(await api()!.status());
  };

  const pickFolder = async () => {
    const r = await api()?.pickFolder();
    if (r?.ok && r.path) start(r.path);
  };

  const labelFor = useCallback((n: DiskMapNode) => {
    if (n.kind === 'free') return t('diskmap.free', 'Free space');
    if (n.kind === 'unknown') return t('diskmap.unknown', 'Not visible to the scan');
    if (n.kind === 'rest') return `${fmtInt(n.count)} ${t('diskmap.smaller', 'smaller items')}`;
    return n.name;
  }, [t]);

  const zoomInto = useCallback((n: DiskMapNode) => {
    if (n.kind === 'dir' && n.id !== viewId) { setViewId(n.id); setSelected(null); }
  }, [viewId]);

  const goUp = useCallback(() => {
    if (trail.length > 1) { setViewId(trail[trail.length - 2].id); setSelected(null); }
  }, [trail]);

  const act = async (fn: () => Promise<any>, okText?: string) => {
    setBusy(true); setNotice(null);
    try {
      const r = await fn();
      if (r?.canceled) return;
      setNotice(r?.ok ? (okText ? { ok: true, text: okText } : null) : { ok: false, text: r?.error || t('diskmap.fail', 'Failed.') });
      return r;
    } finally { setBusy(false); }
  };

  const setTag = async (color: DiskMapTag) => {
    if (!selected) return;
    const next = info?.tag === color ? null : color;
    const r = await act(() => api()!.tag({ id: selected.id, color: next }));
    if (r?.ok) setVersion((v) => v + 1);
  };

  const trash = async () => {
    if (!selected) return;
    const freed = selected.size;
    const r = await act(() => api()!.trash({ id: selected.id }), `${labelFor(selected)}: ${t('diskmap.trashed', 'moved to the Recycle Bin')} (${formatBytes(freed)})`);
    if (r?.ok) { setSelected(null); setVersion((v) => v + 1); }
  };

  // Keyboard: Backspace up, Enter opens, Delete asks to trash, Ctrl+1..4 tags.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || !active) return;
      if (e.key === 'Backspace') { e.preventDefault(); goUp(); }
      else if (e.key === 'Enter' && selected) zoomInto(selected);
      else if (e.key === 'Delete' && selected && selected.id !== 'd0' && ['dir', 'file'].includes(selected.kind)) setConfirmTrash(true);
      else if (e.key === 'Escape') { setSelected(null); setConfirmTrash(false); }
      else if (e.ctrlKey && /^[1-4]$/.test(e.key) && selected) { e.preventDefault(); setTag(TAGS[Number(e.key) - 1]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const viewNode = tree;
  const scanned = status?.done;
  const topItems = useMemo(() => (viewNode?.children || []).filter((c) => c.kind !== 'rest').slice(0, 8), [viewNode]);

  const headerActions = active ? (
    <>
      <button onClick={() => { api()?.cancel(); setStatus(null); setTree(null); setSelected(null); }} disabled={busy} className="dh-btn">
        <HardDrive size={14} />{t('diskmap.change', 'Change location')}
      </button>
      <button onClick={() => status?.root && start(status.root)} disabled={busy || running} className="dh-btn">
        <RefreshCw size={14} />{t('diskmap.rescan', 'Scan again')}
      </button>
      <button onClick={() => act(() => api()!.exportReport({ id: viewId, format: 'txt', filter }), t('diskmap.exported', 'Report saved.'))} disabled={busy || running} className="dh-btn">
        <Download size={14} />{t('diskmap.exportTxt', 'Report')}
      </button>
      <button onClick={() => act(() => api()!.exportReport({ id: viewId, format: 'csv', filter }), t('diskmap.exported', 'Report saved.'))} disabled={busy || running} className="dh-btn">
        <Download size={14} />CSV
      </button>
    </>
  ) : null;

  const header = (
    <PageHeader
      title={<span className="inline-flex items-center gap-2.5"><LayoutGrid size={20} className="text-zinc-100" />{t('diskmap.title', 'Disk map')}</span>}
      subtitle={t('diskmap.subtitle', 'See what takes up space on any drive or folder, filter, tag and free up space.')}
      actions={headerActions}
    />
  );

  const noticeEl = notice ? (
    <div role="status" className={`flex items-start gap-2 border-l-2 pl-3 py-1 text-[12.5px] ${notice.ok ? 'border-emerald-400 text-emerald-300' : 'border-red-400 text-red-300'}`}>
      {notice.ok ? null : <XCircle size={14} className="shrink-0 mt-px" />}<span className="min-w-0 break-words">{notice.text}</span>
    </div>
  ) : null;

  // ---------------------------------------------------------------- choose what to scan
  if (!active) {
    return (
      <div className="w-full space-y-6">
        {header}
        {noticeEl}
        <section>
          <div className="flex items-end justify-between gap-3 mb-3">
            <div>
              <h2 className="dh-section-title">{t('diskmap.pick.title', 'What do you want to analyse?')}</h2>
              <p className="mt-1 dh-help">{t('diskmap.pick.help', 'A whole drive also shows its free space and what the scan could not see (system files, restore points).')}</p>
            </div>
            <button onClick={pickFolder} className="dh-btn shrink-0"><FolderOpen size={14} />{t('diskmap.pickFolder', 'Choose a folder')}</button>
          </div>
          {drives === null ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label={t('diskmap.loading', 'Loading')}>
              {[0, 1, 2].map((i) => <div key={i} className="h-[74px] rounded-xl bg-zinc-900 animate-pulse" />)}
            </div>
          ) : drives.length === 0 ? (
            <p className="text-[12.5px] text-zinc-500">{t('diskmap.noDrives', 'No drive found. Choose a folder instead.')}</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {drives.map((d) => {
                const used = d.total - d.free;
                const pct = d.total > 0 ? Math.round((used / d.total) * 100) : 0;
                return (
                  <button key={d.root} onClick={() => start(d.root)} className="dh-card p-4 text-left hover:border-zinc-700 transition-colors group">
                    <div className="flex items-center gap-3">
                      <HardDrive size={18} className="text-zinc-400 group-hover:text-blue-300 transition-colors shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] text-zinc-100 truncate">{d.label || t(`diskmap.type.${d.type}`, 'Drive')} <span className="font-mono text-zinc-400">{d.root.replace('\\', '')}</span></div>
                        <div className="mt-0.5 font-mono text-[11.5px] text-zinc-500">{formatBytes(d.free)} {t('diskmap.freeOf', 'free of')} {formatBytes(d.total)}{d.fs ? ` · ${d.fs}` : ''}</div>
                      </div>
                      <span className={`font-mono text-[12px] ${pct >= 90 ? 'text-red-400' : pct >= 80 ? 'text-amber-300' : 'text-zinc-400'}`}>{pct}%</span>
                    </div>
                    <div className="mt-3 h-1 rounded-full bg-zinc-800 overflow-hidden">
                      <div className={`h-full ${pct >= 90 ? 'bg-red-400' : pct >= 80 ? 'bg-amber-300' : 'bg-zinc-400'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    );
  }

  // ---------------------------------------------------------------- map
  const viewSize = viewNode?.size || 0;
  return (
    <div className="w-full space-y-3">
      {header}
      {noticeEl}

      {/* progress / result line */}
      <div className="flex items-center gap-3 text-[12px] min-h-[28px]">
        {running ? (
          <>
            <Loader2 size={14} className="animate-spin text-blue-300 shrink-0" />
            <span className="text-zinc-300">{t('diskmap.scanning', 'Scanning')} <span className="font-mono">{status?.root}</span></span>
            <span className="font-mono text-zinc-400">{fmtInt(status?.files)} {t('diskmap.files', 'files')} · {formatBytes(status?.bytes || 0)} · {fmtTime(status?.elapsedMs || 0)}</span>
            <button onClick={() => api()?.cancel()} className="dh-btn dh-btn-sm dh-btn-ghost ml-auto"><X size={14} />{t('diskmap.cancel', 'Cancel')}</button>
          </>
        ) : status?.error && !scanned ? (
          <span className="text-red-300 inline-flex items-center gap-1.5"><XCircle size={14} />{status.error}</span>
        ) : scanned ? (
          <span className="font-mono text-zinc-500">
            {fmtInt(scanned.files)} {t('diskmap.files', 'files')} {t('diskmap.in', 'in')} {fmtInt(scanned.dirs)} {t('diskmap.folders', 'folders')} · {fmtTime(status?.elapsedMs || scanned.ms)}
            {scanned.errors > 0 ? <span className="text-amber-300/90" title={t('diskmap.deniedHelp', 'Folders Windows did not let the scan read (system or other users). Their size counts as not visible.')}> · {fmtInt(scanned.errors)} {t('diskmap.denied', 'folders without access')}</span> : null}
          </span>
        ) : null}
      </div>

      {/* navigation + filter */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={goUp} disabled={trail.length <= 1} className="dh-btn dh-btn-sm" title={t('diskmap.up', 'Up one level (Backspace)')} aria-label={t('diskmap.up', 'Up one level')}>
          <ArrowRight size={14} className="-rotate-90" />
        </button>
        <button onClick={() => { setViewId('d0'); setSelected(null); }} disabled={viewId === 'd0'} className="dh-btn dh-btn-sm" title={t('diskmap.home', 'Back to the start')} aria-label={t('diskmap.home', 'Back to the start')}>
          <Home size={14} />
        </button>
        <nav aria-label={t('diskmap.path', 'Path')} className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] font-mono text-[12px]">
          {trail.map((c, i) => (
            <React.Fragment key={c.id}>
              {i > 0 ? <ChevronRight size={12} className="text-zinc-600 shrink-0" /> : null}
              <button onClick={() => { setViewId(c.id); setSelected(null); }} className={`shrink-0 rounded px-1.5 py-0.5 transition-colors ${i === trail.length - 1 ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-100'}`}>
                {c.name}
              </button>
            </React.Fragment>
          ))}
          {viewNode ? <span className="ml-2 shrink-0 text-zinc-500">{formatBytes(viewSize)}{volume ? ` · ${formatBytes(volume.free)} ${t('diskmap.freeShort', 'free')}` : ''}</span> : null}
        </nav>
        <div className="relative w-full sm:w-80">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder={t('diskmap.filter', 'Filter: *.iso;>1gb;m<1week')}
            aria-label={t('diskmap.filterLabel', 'Filter')}
            spellCheck={false}
            className={`dh-input w-full pl-8 pr-14 font-mono text-[12px] ${filterErrors.length ? 'border-red-400/60' : ''}`}
          />
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center">
            {filterText ? <button onClick={() => setFilterText('')} className="p-1 text-zinc-500 hover:text-zinc-200" aria-label={t('diskmap.clear', 'Clear')}><X size={13} /></button> : null}
            <button onClick={() => setShowHelp((v) => !v)} className={`p-1 ${showHelp ? 'text-blue-300' : 'text-zinc-500 hover:text-zinc-200'}`} aria-expanded={showHelp} aria-label={t('diskmap.syntax', 'Filter syntax')}><HelpCircle size={14} /></button>
          </div>
        </div>
        {volume ? (
          <label className="flex items-center gap-1.5 text-[11.5px] text-zinc-500">
            <input type="checkbox" checked={showFree} onChange={(e) => setShowFree(e.target.checked)} />{t('diskmap.showFree', 'Free space')}
          </label>
        ) : null}
        <label className="flex items-center gap-2 text-[11.5px] text-zinc-500" title={t('diskmap.detailHelp', 'Smallest block drawn on the map')}>
          {t('diskmap.detail', 'Detail')}
          <input type="range" min={4} max={40} step={2} value={44 - minPx} onChange={(e) => setMinPx(44 - Number(e.target.value))} className="w-20" aria-label={t('diskmap.detail', 'Detail')} />
        </label>
      </div>

      {filterErrors.length ? <p className="text-[12px] text-red-300">{filterErrors.join(' · ')}</p> : null}
      {showHelp ? (
        <div className="dh-card p-4 text-[12px] grid gap-x-6 gap-y-1.5 md:grid-cols-2">
          {[
            ['*.iso  setup*.exe', t('diskmap.help.name', 'file name (* and ?)')],
            ['>1gb  <16kb', t('diskmap.help.size', 'size: b, kb, mb, gb, tb')],
            ['m<1day  c>1year  a>2weeks', t('diskmap.help.age', 'modified, created or accessed: s, min, h, d, w, month, y')],
            ['\\temp  \\steamapps', t('diskmap.help.folder', 'folder anywhere in the path')],
            [':class:video', t('diskmap.help.class', 'type: video audio image archive program code document data other')],
            [':red  :tag:r+y', t('diskmap.help.tag', 'tags (Ctrl+1 to Ctrl+4 on the selected item)')],
            [':attr:h  :attr:-s', t('diskmap.help.attr', 'attributes: h hidden, s system, r read-only, a archive, c compressed, e encrypted')],
            ['|*.dll', t('diskmap.help.not', 'a leading | inverts the clause')],
          ].map(([code, text]) => (
            <div key={code} className="flex gap-3"><code className="w-44 shrink-0 font-mono text-zinc-200">{code}</code><span className="text-zinc-400">{text}</span></div>
          ))}
          <div className="md:col-span-2 mt-2 flex flex-wrap items-center gap-1.5 border-t border-zinc-800/80 pt-3">
            <span className="text-zinc-500 mr-1">{t('diskmap.help.join', 'Join clauses with ; (all must match). Try:')}</span>
            {PRESETS.map((p) => <button key={p} onClick={() => setFilterText(p)} className="dh-btn dh-btn-sm font-mono">{p}</button>)}
          </div>
        </div>
      ) : null}

      {/* map + inspector */}
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="min-w-0 flex-1 h-[calc(100vh-300px)] min-h-[420px]">
          {viewNode ? (
            <TreemapCanvas tree={viewNode} minPx={minPx} selectedId={selected?.id ?? null} labelFor={labelFor} onSelect={setSelected} onOpen={zoomInto} onSize={onSize} dim={busy} filesWord={t('diskmap.files', 'files')} />
          ) : (
            <div className="h-full rounded-xl bg-zinc-900 animate-pulse" role="status" aria-label={t('diskmap.loading', 'Loading')} />
          )}
        </div>

        <aside className="lg:w-72 shrink-0 dh-card p-4 space-y-4 self-start" aria-label={t('diskmap.details', 'Details')}>
          {selected && info ? (
            <>
              <div>
                <div className="text-[13.5px] font-semibold text-zinc-100 break-words">{info.isRoot ? info.path : info.name}</div>
                <div className="mt-1 font-mono text-[11px] text-zinc-500 break-all">{info.path}</div>
              </div>
              <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-[12px]">
                <dt className="text-zinc-500">{t('diskmap.size', 'Size')}</dt>
                <dd className="font-mono text-zinc-200">{formatBytes(info.size)}{viewSize > 0 && info.size <= viewSize ? <span className="text-zinc-500"> · {((info.size / viewSize) * 100).toFixed(1)}%</span> : null}</dd>
                {info.kind === 'dir' ? (
                  <>
                    <dt className="text-zinc-500">{t('diskmap.content', 'Contents')}</dt>
                    <dd className="font-mono text-zinc-300">{fmtInt(info.files)} {t('diskmap.files', 'files')}, {fmtInt(info.dirs)} {t('diskmap.folders', 'folders')}</dd>
                  </>
                ) : (
                  <>
                    <dt className="text-zinc-500">{t('diskmap.type', 'Type')}</dt>
                    <dd className="text-zinc-300 inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: CLASS_COLOR[info.cls || 'other'] }} />{t(`diskmap.cls.${info.cls}`, info.cls || '')}</dd>
                  </>
                )}
                <dt className="text-zinc-500">{t('diskmap.modified', 'Modified')}</dt><dd className="font-mono text-zinc-300">{fmtDate(info.mtime)}</dd>
                <dt className="text-zinc-500">{t('diskmap.created', 'Created')}</dt><dd className="font-mono text-zinc-300">{fmtDate(info.ctime)}</dd>
                {ATTRS.some(([b]) => info.attr & b) ? (
                  <>
                    <dt className="text-zinc-500">{t('diskmap.attrs', 'Attributes')}</dt>
                    <dd className="text-zinc-300">{ATTRS.filter(([b]) => info.attr & b).map(([, k]) => t(`diskmap.attr.${k}`, k)).join(', ')}</dd>
                  </>
                ) : null}
              </dl>
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-zinc-500 mr-1">{t('diskmap.tag', 'Tag')}</span>
                {TAGS.map((c, i) => (
                  <button key={c} onClick={() => setTag(c)} title={`Ctrl+${i + 1}`} aria-pressed={info.tag === c} aria-label={t(`diskmap.tagColor.${c}`, c)}
                    className={`w-5 h-5 rounded-full border-2 transition-transform ${info.tag === c ? 'border-zinc-100 scale-110' : 'border-transparent opacity-70 hover:opacity-100'}`}
                    style={{ background: TAG_COLOR[c] }} />
                ))}
              </div>
              <div className="grid gap-1.5">
                {info.kind === 'dir' && info.id !== viewId ? (
                  <button onClick={() => zoomInto(selected)} className="dh-btn dh-btn-sm justify-start"><ChevronRight size={14} />{t('diskmap.enter', 'Open in the map (Enter)')}</button>
                ) : null}
                <button onClick={() => act(() => api()!.open({ id: info.id }))} className="dh-btn dh-btn-sm justify-start"><ExternalLink size={14} />{info.kind === 'dir' ? t('diskmap.openFolder', 'Open folder') : t('diskmap.openFile', 'Open file')}</button>
                <button onClick={() => act(() => api()!.reveal({ id: info.id }))} className="dh-btn dh-btn-sm justify-start"><FolderOpen size={14} />{t('diskmap.reveal', 'Show in Explorer')}</button>
                <button onClick={() => { navigator.clipboard?.writeText(info.path); setNotice({ ok: true, text: t('diskmap.copied', 'Path copied.') }); }} className="dh-btn dh-btn-sm justify-start"><Clipboard size={14} />{t('diskmap.copy', 'Copy path')}</button>
                {!info.isRoot ? (
                  confirmTrash ? (
                    <div className="mt-1 space-y-2 border-l-2 border-red-400 pl-3 py-1">
                      <p className="text-[12px] text-red-200 inline-flex items-start gap-1.5"><AlertTriangle size={14} className="shrink-0 mt-px" />{t('diskmap.trashConfirm', 'Move to the Recycle Bin?')} <span className="font-mono">{formatBytes(info.size)}</span></p>
                      <div className="flex gap-1.5">
                        <button onClick={trash} disabled={busy} className="dh-btn dh-btn-sm dh-btn-danger">{t('diskmap.trashYes', 'Move')}</button>
                        <button onClick={() => setConfirmTrash(false)} className="dh-btn dh-btn-sm dh-btn-ghost">{t('diskmap.cancel', 'Cancel')}</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmTrash(true)} className="dh-btn dh-btn-sm dh-btn-danger justify-start"><Trash2 size={14} />{t('diskmap.trash', 'Move to Recycle Bin (Del)')}</button>
                  )
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div>
                <h2 className="dh-section-title">{t('diskmap.largest', 'Largest here')}</h2>
                <p className="mt-1 dh-help">{t('diskmap.hint', 'Click to select, double-click a folder to open it.')}</p>
              </div>
              {viewNode ? (
                <ul className="space-y-1">
                  {topItems.map((c) => (
                    <li key={c.id}>
                      <button onClick={() => (c.kind === 'dir' || c.kind === 'file' ? setSelected(c) : undefined)} onDoubleClick={() => zoomInto(c)} className="w-full flex items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-zinc-800/60 transition-colors">
                        <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: c.kind === 'file' ? CLASS_COLOR[c.cls || 'other'] : c.kind === 'free' ? 'oklch(0.30 0.035 160)' : 'oklch(0.45 0.012 255)' }} />
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-zinc-200">{labelFor(c)}</span>
                        <span className="font-mono text-[11.5px] text-zinc-400">{formatBytes(c.size)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="border-t border-zinc-800/80 pt-3 flex flex-wrap gap-x-3 gap-y-1">
                {CLASSES.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500"><span className="w-2 h-2 rounded-sm" style={{ background: CLASS_COLOR[c] }} />{t(`diskmap.cls.${c}`, c)}</span>
                ))}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
