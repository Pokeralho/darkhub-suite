import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DiskMapDrive, DiskMapInfo, DiskMapNode, DiskMapStatus, DiskMapTag } from '../../global';
import {
  AlertTriangle, ArrowRight, ChevronLeft, ChevronRight, Clipboard, Download, ExternalLink, FolderOpen, HardDrive, HelpCircle, Home,
  LayoutGrid, Loader2, Lock, RefreshCw, Search, Sparkles, Trash2, X, XCircle
} from '../../components/icons';
import PageHeader from '../../components/ui/PageHeader';
import { useI18n } from '../../i18n/I18nProvider';
import TreemapCanvas, { CLASS_COLOR, TAG_COLOR } from './TreemapCanvas';
import { formatBytes } from './treemap';
import { CATEGORIES, CATEGORY_COLOR, DiskCategory, categoryFill, classifyPath, joinPath } from './diskCategories';

const api = () => window.darkhub?.diskscan;
const TAGS: DiskMapTag[] = ['red', 'yellow', 'green', 'blue'];
const CLASSES = ['video', 'audio', 'image', 'archive', 'program', 'code', 'document', 'data', 'other'];
const PRESETS = ['>1gb', 'm<1day', ':class:video', '*.iso;*.zip;*.rar;*.7z', '|:class:program'];

const fmtDate = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString() : '-');
const fmtInt = (n: number | undefined) => (n ?? 0).toLocaleString();
const fmtTime = (ms: number) => (ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`);
const LIST_PAGE = 40;
type ColorMode = 'category' | 'type';
const readMode = (): ColorMode => { try { return localStorage.getItem('diskmap.colorMode') === 'type' ? 'type' : 'category'; } catch { return 'category'; } };
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
  const [colorMode, setColorModeState] = useState<ColorMode>(readMode);
  const [highlight, setHighlight] = useState<DiskCategory | null>(null);
  const [back, setBack] = useState<string[]>([]);
  const [forward, setForward] = useState<string[]>([]);
  const [listLimit, setListLimit] = useState(LIST_PAGE);
  const crumbsRef = useRef<HTMLElement>(null);
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
    setNotice(null); setSelected(null); setViewId('d0'); setTree(null); setFilterText(''); setFilter(''); setBack([]); setForward([]); setHighlight(null);
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

  const setColorMode = (m: ColorMode) => { setColorModeState(m); try { localStorage.setItem('diskmap.colorMode', m); } catch { /* per-viewer convenience only */ } };

  /** Every move goes through here so Back / Forward know where we were. */
  const go = useCallback((id: string) => {
    if (id === viewId) return;
    setBack((b) => [...b.slice(-49), viewId]);
    setForward([]);
    setViewId(id); setSelected(null); setListLimit(LIST_PAGE);
  }, [viewId]);

  const zoomInto = useCallback((n: DiskMapNode) => {
    if (n.kind === 'dir' && n.id !== viewId) go(n.id);
  }, [viewId, go]);

  const goUp = useCallback(() => {
    if (trail.length > 1) go(trail[trail.length - 2].id);
  }, [trail, go]);

  const goBack = useCallback(() => {
    if (!back.length) { goUp(); return; }
    const prev = back[back.length - 1];
    setBack((b) => b.slice(0, -1));
    setForward((f) => [viewId, ...f].slice(0, 50));
    setViewId(prev); setSelected(null); setListLimit(LIST_PAGE);
  }, [back, viewId, goUp]);

  const goForward = useCallback(() => {
    if (!forward.length) return;
    const next = forward[0];
    setForward((f) => f.slice(1));
    setBack((b) => [...b.slice(-49), viewId]);
    setViewId(next); setSelected(null); setListLimit(LIST_PAGE);
  }, [forward, viewId]);

  const goHome = useCallback(() => go('d0'), [go]);

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

  const viewNode = tree;

  // Category of every node in the drawn view (<= maxNodes), from the path rebuilt out of the trail + names.
  const catIndex = useMemo(() => {
    const m = new Map<string, DiskCategory>();
    if (!tree) return m;
    const base = trail.length && trail[trail.length - 1].id === tree.id
      ? trail.slice(1).reduce((p, c) => joinPath(p, c.name), trail[0].name)
      : tree.name;
    const walk = (n: DiskMapNode, path: string, parent: DiskCategory) => {
      let cat: DiskCategory;
      if (n.kind === 'dir' || n.kind === 'file') cat = classifyPath(path, n.kind === 'dir');
      else if (n.kind === 'rest') cat = parent;
      else return;
      m.set(n.id, cat);
      if (n.children) for (const c of n.children) walk(c, joinPath(path, c.name), cat);
    };
    walk(tree, base, 'other');
    return m;
  }, [tree, trail]);

  // Totals per category for the current folder: sum of the drawn leaves (a folder's size is the sum of its children).
  const catTotals = useMemo(() => {
    const totals = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<DiskCategory, number>;
    let sum = 0;
    const walk = (n: DiskMapNode) => {
      if (n.children && n.children.length) { for (const c of n.children) walk(c); return; }
      const cat = catIndex.get(n.id);
      if (cat) { totals[cat] += n.size; sum += n.size; }
    };
    if (tree) walk(tree);
    return { totals, sum };
  }, [tree, catIndex]);

  // List: the largest children here, or (with a category highlighted) the largest items of that category anywhere in the view.
  const allListItems = useMemo(() => {
    if (!viewNode) return [] as DiskMapNode[];
    if (!highlight) return (viewNode.children || []).filter((c) => c.kind !== 'rest');
    const out: DiskMapNode[] = [];
    const walk = (n: DiskMapNode) => {
      if ((n.kind === 'dir' || n.kind === 'file') && n !== viewNode && catIndex.get(n.id) === highlight) { out.push(n); return; }
      if (n.children) for (const c of n.children) walk(c);
    };
    walk(viewNode);
    return out.sort((a, b) => b.size - a.size);
  }, [viewNode, highlight, catIndex]);
  const listItems = useMemo(() => allListItems.slice(0, listLimit), [allListItems, listLimit]);

  const catLabel = useCallback((c: DiskCategory) => t(`diskmap.cat.${c}`, c), [t]);
  const catHint = useCallback((c: DiskCategory) => (
    c === 'junk' ? t('diskmap.cat.junkHint', 'Geralmente seguro de limpar: o Windows ou o app recria quando precisar.')
      : c === 'system' ? t('diskmap.cat.systemHint', 'Do Windows: não apague por aqui.')
        : ''
  ), [t]);
  const fillOf = useCallback((n: DiskMapNode, depth: number) => {
    if (colorMode !== 'category' || (n.kind !== 'dir' && n.kind !== 'file')) return null;
    const cat = catIndex.get(n.id);
    return cat ? categoryFill(cat, n.kind === 'dir', depth) : null;
  }, [colorMode, catIndex]);
  const dimOf = useCallback((n: DiskMapNode) => (highlight ? catIndex.get(n.id) !== highlight : false), [highlight, catIndex]);
  const lockedOf = useCallback((n: DiskMapNode) => colorMode === 'category' && n.kind !== 'rest' && catIndex.get(n.id) === 'system', [colorMode, catIndex]);
  const tipOf = useCallback((n: DiskMapNode) => {
    const cat = n.kind === 'dir' || n.kind === 'file' ? catIndex.get(n.id) : undefined;
    if (!cat) return null;
    return { label: catLabel(cat), color: CATEGORY_COLOR[cat], hint: catHint(cat) || undefined, warn: cat === 'junk' };
  }, [catIndex, catLabel, catHint]);

  const selectedCat: DiskCategory | null = info ? classifyPath(info.path, info.kind === 'dir') : null;

  // Long paths: keep the current folder in view at the end of the breadcrumb strip.
  useEffect(() => { const el = crumbsRef.current; if (el) el.scrollLeft = el.scrollWidth; }, [trail]);

  // Keyboard: Backspace / Alt+Up up, Alt+Left back, Alt+Right forward, Up/Down walk the list,
  // Enter opens, Delete asks to trash, Escape clears, Ctrl+1..4 tags.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !active) return;
      if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowUp')) { e.preventDefault(); goUp(); }
      else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); goBack(); }
      else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); goForward(); }
      else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.altKey) {
        const pickable = listItems.filter((c) => c.kind === 'dir' || c.kind === 'file');
        if (!pickable.length) return;
        e.preventDefault();
        const i = selected ? pickable.findIndex((c) => c.id === selected.id) : -1;
        const next = e.key === 'ArrowDown' ? Math.min(pickable.length - 1, i + 1) : i < 0 ? pickable.length - 1 : Math.max(0, i - 1);
        setSelected(pickable[next]);
        document.getElementById(`dm-item-${pickable[next].id}`)?.scrollIntoView({ block: 'nearest' });
      }
      else if (e.key === 'Enter' && selected) {
        // Enter on an ordinary button keeps its own meaning; on the map or a list row it opens the selected folder.
        if (tag === 'BUTTON' && !(e.target as HTMLElement).closest('[role="option"]')) return;
        e.preventDefault(); zoomInto(selected);
      }
      else if (e.key === 'Delete' && selected && selected.id !== 'd0' && ['dir', 'file'].includes(selected.kind)) setConfirmTrash(true);
      else if (e.key === 'Escape') { setSelected(null); setConfirmTrash(false); setHighlight(null); }
      else if (e.ctrlKey && /^[1-4]$/.test(e.key) && selected) { e.preventDefault(); setTag(TAGS[Number(e.key) - 1]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const scanned = status?.done;

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
        <div className="flex items-center gap-1">
          <button onClick={goBack} disabled={!back.length && trail.length <= 1} className="dh-btn dh-btn-sm" title={t('diskmap.back', 'Voltar (Alt+Esquerda)')} aria-label={t('diskmap.back', 'Voltar (Alt+Esquerda)')}>
            <ChevronLeft size={14} />
          </button>
          <button onClick={goForward} disabled={!forward.length} className="dh-btn dh-btn-sm" title={t('diskmap.forward', 'Avançar (Alt+Direita)')} aria-label={t('diskmap.forward', 'Avançar (Alt+Direita)')}>
            <ChevronRight size={14} />
          </button>
          <button onClick={goUp} disabled={trail.length <= 1} className="dh-btn dh-btn-sm" title={t('diskmap.up', 'Up one level (Backspace)')} aria-label={t('diskmap.up', 'Up one level')}>
            <ArrowRight size={14} className="-rotate-90" />
          </button>
          <button onClick={goHome} disabled={viewId === 'd0'} className="dh-btn dh-btn-sm" title={t('diskmap.home', 'Back to the start')} aria-label={t('diskmap.home', 'Back to the start')}>
            <Home size={14} />
          </button>
        </div>
        <nav ref={crumbsRef} aria-label={t('diskmap.path', 'Path')} className="flex min-w-[12rem] flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] font-mono text-[12px]">
          {trail.map((c, i) => (
            <React.Fragment key={c.id}>
              {i > 0 ? <ChevronRight size={12} className="text-zinc-600 shrink-0" /> : null}
              <button onClick={() => go(c.id)} aria-current={i === trail.length - 1 ? 'location' : undefined} className={`shrink-0 rounded px-1.5 py-0.5 transition-colors ${i === trail.length - 1 ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'}`}>
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
            <TreemapCanvas tree={viewNode} minPx={minPx} selectedId={selected?.id ?? null} labelFor={labelFor} onSelect={setSelected} onOpen={zoomInto} onSize={onSize} dim={busy} filesWord={t('diskmap.files', 'files')}
              fillOf={fillOf} dimOf={dimOf} lockedOf={lockedOf} tipOf={tipOf} />
          ) : (
            <div className="h-full rounded-xl bg-zinc-900 animate-pulse" role="status" aria-label={t('diskmap.loading', 'Loading')} />
          )}
        </div>

        <aside className="lg:w-80 shrink-0 space-y-3 self-start" aria-label={t('diskmap.details', 'Details')}>
          {selected && info ? (
            <section className="dh-card p-4 space-y-4">
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
              {selectedCat ? (
                <div className={`flex items-start gap-2 rounded-md px-2.5 py-2 text-[12px] ${selectedCat === 'junk' ? 'bg-amber-400/10 text-amber-100' : 'bg-zinc-800/50 text-zinc-300'}`}>
                  {selectedCat === 'junk' ? <Sparkles size={14} className="shrink-0 mt-px text-amber-300" />
                    : selectedCat === 'system' ? <Lock size={14} className="shrink-0 mt-px text-zinc-400" />
                      : <span className="w-2.5 h-2.5 rounded-sm shrink-0 mt-[3px]" style={{ background: CATEGORY_COLOR[selectedCat] }} />}
                  <div className="min-w-0">
                    <div className="font-medium">{catLabel(selectedCat)}</div>
                    {selectedCat === 'junk' ? <div className="mt-0.5 text-amber-200/80">{t('diskmap.cat.junkHintLong', 'Geralmente seguro de limpar: temporários, caches e relatórios que o Windows ou o app recria. Nada é apagado automaticamente.')}</div> : null}
                    {selectedCat === 'system' ? <div className="mt-0.5 text-zinc-400">{t('diskmap.cat.systemHintLong', 'Faz parte do Windows. Apagar por aqui pode quebrar o sistema; use a Limpeza de Disco do Windows.')}</div> : null}
                  </div>
                </div>
              ) : null}
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
                      {selectedCat === 'system' ? <p className="text-[12px] text-red-300 font-medium">{t('diskmap.cat.systemTrashWarn', 'Item do sistema: removê-lo pode impedir o Windows ou programas de funcionar. Só continue se tiver certeza.')}</p> : null}
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
            </section>
          ) : null}

          {/* categories: legend, totals for this folder and highlight filter */}
          <section className="dh-card p-4 space-y-3" aria-label={t('diskmap.cat.title', 'Categorias')}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="dh-section-title">{t('diskmap.cat.title', 'Categorias')}</h2>
              <div role="group" aria-label={t('diskmap.colorBy', 'Colorir por')} className="flex rounded-md border border-zinc-800 p-0.5 text-[11px]">
                {(['category', 'type'] as ColorMode[]).map((m) => (
                  <button key={m} onClick={() => setColorMode(m)} aria-pressed={colorMode === m}
                    className={`rounded px-2 py-0.5 transition-colors ${colorMode === m ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-200'}`}>
                    {m === 'category' ? t('diskmap.colorByCategory', 'Categoria') : t('diskmap.colorByType', 'Tipo de arquivo')}
                  </button>
                ))}
              </div>
            </div>
            {catTotals.sum > 0 ? (
              <div className="flex h-2 overflow-hidden rounded-full bg-zinc-800" aria-hidden="true">
                {CATEGORIES.filter((c) => catTotals.totals[c] > 0).map((c) => (
                  <div key={c} style={{ width: `${(catTotals.totals[c] / catTotals.sum) * 100}%`, background: CATEGORY_COLOR[c], opacity: highlight && highlight !== c ? 0.3 : 1 }} />
                ))}
              </div>
            ) : null}
            <ul className="space-y-0.5">
              {CATEGORIES.filter((c) => catTotals.totals[c] > 0).sort((x, y) => catTotals.totals[y] - catTotals.totals[x]).map((c) => {
                const on = highlight === c;
                const pct = catTotals.sum > 0 ? (catTotals.totals[c] / catTotals.sum) * 100 : 0;
                return (
                  <li key={c}>
                    <button onClick={() => { setHighlight(on ? null : c); setListLimit(LIST_PAGE); }} aria-pressed={on}
                      title={catHint(c) || undefined}
                      className={`w-full flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-[12px] transition-colors ${on ? 'bg-zinc-800 ring-1 ring-zinc-600' : 'hover:bg-zinc-800/60'} ${highlight && !on ? 'opacity-55' : ''}`}>
                      {c === 'system' ? <Lock size={11} className="shrink-0" style={{ color: 'oklch(0.62 0.02 255)' }} />
                        : <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: CATEGORY_COLOR[c] }} />}
                      <span className={`min-w-0 flex-1 truncate ${c === 'junk' ? 'text-amber-200' : 'text-zinc-200'}`}>{catLabel(c)}</span>
                      <span className="font-mono text-[11px] text-zinc-500">{pct < 0.1 ? '<0.1' : pct.toFixed(pct < 10 ? 1 : 0)}%</span>
                      <span className="w-16 text-right font-mono text-[11.5px] text-zinc-300">{formatBytes(catTotals.totals[c])}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {highlight === 'junk' ? (
              <p className="flex items-start gap-1.5 text-[11.5px] text-amber-200/90"><Sparkles size={13} className="shrink-0 mt-px" />{t('diskmap.cat.junkHint', 'Geralmente seguro de limpar: o Windows ou o app recria quando precisar.')}</p>
            ) : null}
            {highlight ? (
              <button onClick={() => setHighlight(null)} className="dh-btn dh-btn-sm dh-btn-ghost"><X size={13} />{t('diskmap.cat.showAll', 'Mostrar todas')}</button>
            ) : (
              <p className="dh-help">{t('diskmap.cat.help', 'Clique numa categoria para destacá-la no mapa e listar os maiores itens dela.')}</p>
            )}
            {colorMode === 'type' ? (
              <div className="border-t border-zinc-800/80 pt-3 flex flex-wrap gap-x-3 gap-y-1">
                {CLASSES.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500"><span className="w-2 h-2 rounded-sm" style={{ background: CLASS_COLOR[c] }} />{t(`diskmap.cls.${c}`, c)}</span>
                ))}
              </div>
            ) : null}
          </section>

          {/* largest items: always visible, capped and paged so huge folders stay responsive */}
          <section className="dh-card p-4 space-y-2">
            <div>
              <h2 className="dh-section-title">{highlight ? `${t('diskmap.cat.largestOf', 'Maiores itens')}: ${catLabel(highlight)}` : t('diskmap.largest', 'Largest here')}</h2>
              <p className="mt-1 dh-help">{t('diskmap.navHint', 'Clique para selecionar; duplo clique ou Enter abre a pasta. ↑/↓ percorre a lista, Backspace sobe, Alt+←/→ volta e avança.')}</p>
            </div>
            {viewNode ? (
              listItems.length ? (
                <ul className="space-y-0.5 max-h-[min(50vh,420px)] overflow-y-auto [scrollbar-width:thin] pr-0.5" role="listbox" aria-label={t('diskmap.largest', 'Largest here')}>
                  {listItems.map((c) => {
                    const cat = catIndex.get(c.id);
                    const isSel = selected?.id === c.id;
                    const pct = viewSize > 0 ? Math.min(100, (c.size / viewSize) * 100) : 0;
                    const swatch = c.kind === 'free' ? 'oklch(0.30 0.035 160)' : c.kind === 'unknown' ? 'oklch(0.24 0.012 255)'
                      : colorMode === 'category' && cat ? CATEGORY_COLOR[cat] : c.kind === 'file' ? CLASS_COLOR[c.cls || 'other'] : 'oklch(0.45 0.012 255)';
                    return (
                      <li key={c.id} id={`dm-item-${c.id}`} role="option" aria-selected={isSel} className="group flex items-center gap-1">
                        <button onClick={() => (c.kind === 'dir' || c.kind === 'file' ? setSelected(c) : undefined)} onDoubleClick={() => zoomInto(c)}
                          title={cat ? `${catLabel(cat)}${catHint(cat) ? ` · ${catHint(cat)}` : ''}` : undefined}
                          className={`min-w-0 flex-1 rounded-md px-1.5 py-1 text-left transition-colors ${isSel ? 'bg-zinc-800' : 'hover:bg-zinc-800/60'}`}>
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: swatch }} />
                            <span className={`min-w-0 flex-1 truncate text-[12.5px] ${cat === 'junk' ? 'text-amber-100' : 'text-zinc-200'}`}>{labelFor(c)}</span>
                            {cat === 'system' ? <Lock size={11} className="shrink-0 text-zinc-500" /> : null}
                            <span className="font-mono text-[11.5px] text-zinc-400">{formatBytes(c.size)}</span>
                          </span>
                          <span className="mt-1 block h-0.5 rounded-full bg-zinc-800/80 overflow-hidden"><span className="block h-full" style={{ width: `${pct}%`, background: swatch }} /></span>
                        </button>
                        {c.kind === 'dir' ? (
                          <button onClick={() => zoomInto(c)} className="p-1 rounded text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800/60 opacity-60 group-hover:opacity-100 focus:opacity-100" aria-label={`${t('diskmap.openIn', 'Abrir no mapa')}: ${labelFor(c)}`} title={t('diskmap.openIn', 'Abrir no mapa')}>
                            <ChevronRight size={14} />
                          </button>
                        ) : <span className="w-[22px] shrink-0" />}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-[12px] text-zinc-500">{highlight ? t('diskmap.cat.none', 'Nada desta categoria nesta pasta.') : t('diskmap.empty', 'Pasta vazia.')}</p>
              )
            ) : null}
            {allListItems.length > listLimit ? (
              <button onClick={() => setListLimit((n) => n + LIST_PAGE)} className="dh-btn dh-btn-sm dh-btn-ghost w-full justify-center">
                {t('diskmap.showMore', 'Mostrar mais')} ({fmtInt(allListItems.length - listLimit)})
              </button>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}
