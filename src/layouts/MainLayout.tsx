import React from 'react';
import { APP_VERSION_LABEL } from '../appVersion';
import {
  Home as HomeIcon, LayoutGrid, Zap, Monitor, FileText, Settings,
  PlaySquare, ScanText, ShieldAlert, Lock, Image as ImageIcon,
  Edit3, MousePointerClick, LibraryBig, Gamepad2, Film, Eye, Package,
  Download, Fingerprint, Network, Code, ChevronLeft, ChevronRight,
  Cpu, Crosshair, Activity, Flame, Sparkles, Minus, Square, X, LifeBuoy, Gauge, UploadCloud,
  MonitorCog, Terminal, DarkHubMark, Archive, Layers, Rocket, Usb, History,
  Wrench, Shield, Globe, Music, List, Clock, FolderOpen, HardDrive, Eraser
} from '../components/icons';
import { extPageId, textIn, useExtensions } from '../lib/extensions';
import { useI18n } from '../i18n/I18nProvider';
import { applyNavLayout, layoutOf, loadNavLayout, moveItem, moveSection, saveNavLayout, sameLayout, type NavLayout } from '../lib/navLayout';

const GuardianWidget = React.lazy(() => import('../components/GuardianWidget'));

interface MainLayoutProps {
  children: React.ReactNode;
  currentPage: string;
  setCurrentPage: (page: string) => void;
}

interface NavSection {
  id: string;
  category: string;
  items: {
    id: string;
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    badge?: string;
  }[];
}

const MainLayout: React.FC<MainLayoutProps> = ({ children, currentPage, setCurrentPage }) => {
  const { t, lang } = useI18n();
  const [collapsed, setCollapsed] = React.useState<boolean>(() => {
    try {
      return globalThis.localStorage?.getItem('darkhub.sidebarCollapsed') === '1'
    } catch {
      return false
    }
  });
  const [showGuardian, setShowGuardian] = React.useState(false);
  const [pgeBusy, setPgeBusy] = React.useState(false);
  const [pgeStatus, setPgeStatus] = React.useState<{ ok: boolean; message: string } | null>(null);
  const [isDarkOS, setIsDarkOS] = React.useState(false);
  const mainRef = React.useRef<HTMLElement>(null);
  const navRef = React.useRef<HTMLElement>(null);

  // <main> is the scroll container shared by every page: start each page at the top instead of
  // inheriting the previous page's scroll offset.
  React.useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [currentPage]);

  React.useEffect(() => {
    // Cheap check (file existence in main process); no PowerShell is spawned.
    window.darkhub?.darkos?.isDarkOS?.().then((r) => setIsDarkOS(Boolean(r?.isDarkOS))).catch(() => {});
  }, []);

  React.useEffect(() => {
    try {
      globalThis.localStorage?.setItem('darkhub.sidebarCollapsed', collapsed ? '1' : '0')
    } catch {}
  }, [collapsed]);

  React.useEffect(() => {
    const id = window.setTimeout(() => setShowGuardian(true), 1200);
    return () => window.clearTimeout(id);
  }, []);

  const extensions = useExtensions();
  const EXT_ICONS: Record<string, NavSection['items'][number]['icon']> = { puzzle: Package, chart: Activity, gauge: Gauge, cpu: Cpu, gamepad: Gamepad2, wrench: Wrench, shield: Shield, bolt: Zap, globe: Globe, music: Music, image: ImageIcon, code: Code, list: List, star: Zap, clock: Clock, folder: FolderOpen };
  const extItems = extensions.flatMap((e) => (e.extension?.pages || []).map((p) => ({ id: extPageId(e.id, p.id), label: textIn(p.title, lang), icon: EXT_ICONS[p.icon || 'puzzle'] || Package })));

  const navSections: NavSection[] = [
    {
      id: 'overview',
      category: t('nav.cat.overview', 'Overview'),
      items: [
        { id: 'home', label: t('nav.home', 'Home'), icon: HomeIcon },
        { id: 'dashboard', label: t('nav.dashboard', 'Dashboard'), icon: LayoutGrid },
        { id: 'presets', label: t('nav.presets', 'Presets e módulos'), icon: Package },
        { id: 'realtime', label: t('nav.realtime', 'Real-time'), icon: Gauge },
        // Always listed: on DarkOS it is the management/recovery center; elsewhere it shows an
        // explanatory empty state (nothing can run, the main process refuses without manifest.json).
        { id: 'darkos', label: isDarkOS ? t('nav.darkos', 'DarkOS') : t('darkos.win.title', 'DarkOS Mods'), icon: LifeBuoy, badge: isDarkOS ? 'ON' : undefined }
      ]
    },
    {
      id: 'gaming',
      category: t('nav.cat.gaming', 'Gaming & Performance'),
      items: [
        { id: 'darkpacer', label: t('nav.darkpacer', 'DarkPacer (FPS Lock)'), icon: Activity, badge: 'DXGI' },
        { id: 'optiscaler', label: t('nav.optiscaler', 'OptiScaler Manager'), icon: Cpu },
        { id: 'dlss5', label: t('nav.dlss5', 'DLSS Manager'), icon: Sparkles },
        { id: 'pge-portable', label: 'PGE Portable', icon: Gamepad2 },
        { id: 'optimizer', label: t('nav.optimizer', 'System Optimizer'), icon: Zap },
        { id: 'ultra-latency', label: t('nav.ultralatency', 'Ultra Low Latency'), icon: Flame },
        { id: 'dll-injector', label: t('nav.dllinjector', 'DLL Injector'), icon: Crosshair },
        { id: 'benchmark', label: t('nav.benchmark', 'Before/after benchmark'), icon: Gauge },
        { id: 'gpubench', label: t('nav.gpubench', 'GPU benchmark'), icon: Gauge },
        { id: 'overlay', label: t('nav.overlay', 'In-game overlay'), icon: Layers },
        { id: 'savebackup', label: t('nav.savebackup', 'Save backup'), icon: Archive }
      ]
    },
    {
      id: 'diagnostics',
      category: t('nav.cat.diagnostics', 'Diagnostics & Hardware'),
      items: [
        { id: 'monitor', label: t('nav.monitor', 'System Monitor'), icon: Monitor },
        { id: 'driver', label: t('nav.driver', 'Driver Center'), icon: MonitorCog },
        { id: 'networktools', label: t('nav.networktools', 'Network & Latency'), icon: Network },
        { id: 'ssh', label: t('nav.ssh', 'DarkHub SSH'), icon: Terminal },
        { id: 'setuphub', label: t('nav.setuphub', 'Post-Install Hub'), icon: Zap },
        { id: 'maintenance', label: t('nav.maintenance', 'Scheduled maintenance'), icon: History },
        { id: 'usb', label: t('nav.usb', 'USB ports'), icon: Usb },
        { id: 'startup', label: t('nav.startup', 'Startup manager'), icon: Rocket }
      ]
    },
    {
      id: 'utilities',
      category: t('nav.cat.utilities', 'Utilities & Tools'),
      items: [
        { id: 'spacesniffer', label: t('nav.diskmap', 'Disk map'), icon: LayoutGrid },
        { id: 'disk-rescue', label: t('nav.diskrescue', 'Disk Studio & Rescue'), icon: HardDrive },
        { id: 'cleaner', label: t('nav.cleaner', 'Limpeza profunda'), icon: Eraser },
        { id: 'library', label: t('nav.library', 'Library'), icon: LibraryBig },
        { id: 'security', label: t('nav.security', 'Advanced Security'), icon: ShieldAlert },
        { id: 'passwords', label: t('nav.passwords', 'Password Vault'), icon: Lock },
        { id: 'decryption', label: t('nav.decryption', 'Decryption'), icon: Fingerprint },
        { id: 'converter', label: t('nav.converter', 'File Converter'), icon: FileText },
        { id: 'downloads', label: t('nav.downloads', 'Download Manager'), icon: Download },
        { id: 'youtube', label: t('nav.youtube', 'Video Downloader'), icon: PlaySquare },
        { id: 'ocr', label: t('nav.ocr', 'Image OCR'), icon: ScanText },
        { id: 'metadata', label: t('nav.metadata', 'EXIF Editor'), icon: ImageIcon },
        { id: 'texteditor', label: t('nav.texteditor', 'Text Editor'), icon: Edit3 },
        { id: 'summarizer', label: t('nav.summarizer', 'Summarizer'), icon: Sparkles },
        { id: 'autoclicker', label: t('nav.autoclicker', 'AutoClicker'), icon: MousePointerClick },
        { id: 'devtools', label: t('nav.devtools', 'Developer Tools'), icon: Code },
        { id: 'powershell', label: t('nav.powershell', 'PowerShell Tools'), icon: Terminal }
      ]
    },
    {
      id: 'services',
      category: t('nav.cat.services', 'DarkHub services'),
      items: [
        { id: 'kakugan', label: t('nav.kakugan', 'Kakugan'), icon: Eye },
        { id: 'share', label: t('nav.share', 'Susuya'), icon: UploadCloud },
        { id: 'luluflix', label: t('nav.luluflix', 'LuluFlix'), icon: Film },
        { id: 'juuzou', label: t('nav.juuzou', 'Juuzou'), icon: Download }
      ]
    },
    ...(extItems.length ? [{ id: 'extensions', category: t('nav.cat.extensions', 'Extensões'), items: extItems }] : [])
  ];

  // ---- user order (drag and drop) ----
  const [savedLayout, setSavedLayout] = React.useState<NavLayout | null>(() => loadNavLayout());
  const sections = applyNavLayout(navSections, savedLayout);
  const [drag, setDrag] = React.useState<{ kind: 'item' | 'section'; id: string } | null>(null);
  const [drop, setDrop] = React.useState<{ kind: 'item'; section: string; index: number } | { kind: 'section'; index: number } | null>(null);
  const commitLayout = (next: NavLayout) => {
    // back to the default order = nothing stored, so future default changes apply again
    const value = sameLayout(next, layoutOf(navSections)) ? null : next;
    setSavedLayout(value);
    saveNavLayout(value);
  };
  const endDrag = () => { setDrag(null); setDrop(null); };
  const onDropNav = (e: React.DragEvent) => {
    e.preventDefault();
    if (!drag || !drop) return endDrag();
    const current = layoutOf(sections);
    if (drag.kind === 'item' && drop.kind === 'item') commitLayout(moveItem(current, drag.id, drop.section, drop.index));
    if (drag.kind === 'section' && drop.kind === 'section') commitLayout(moveSection(current, drag.id, drop.index));
    endDrag();
  };
  const overItem = (e: React.DragEvent, sectionId: string, index: number) => {
    if (drag?.kind !== 'item') return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const at = e.clientY > r.top + r.height / 2 ? index + 1 : index;
    if (drop?.kind !== 'item' || drop.section !== sectionId || drop.index !== at) setDrop({ kind: 'item', section: sectionId, index: at });
  };
  const overSection = (e: React.DragEvent, secIdx: number, sec: NavSection) => {
    if (!drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (drag.kind === 'section') {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const at = e.clientY > r.top + r.height / 2 ? secIdx + 1 : secIdx;
      if (drop?.kind !== 'section' || drop.index !== at) setDrop({ kind: 'section', index: at });
    } else if (drop?.kind !== 'item' || drop.section !== sec.id) {
      // empty space of a section: drop at its end
      setDrop({ kind: 'item', section: sec.id, index: sec.items.length });
    }
  };
  // Alt+Up / Alt+Down move the focused entry (keyboard alternative to dragging)
  const moveByKey = (itemId: string, delta: number) => {
    const flat = sections.flatMap((s) => s.items.map((i, idx) => ({ section: s.id, idx, id: i.id })));
    const pos = flat.findIndex((x) => x.id === itemId);
    const target = flat[pos + delta];
    const cur = flat[pos];
    if (!cur) return;
    const current = layoutOf(sections);
    if (target && target.section === cur.section) commitLayout(moveItem(current, itemId, cur.section, delta > 0 ? target.idx + 1 : target.idx));
    else {
      const si = sections.findIndex((s) => s.id === cur.section) + (delta > 0 ? 1 : -1);
      const sec = sections[si];
      if (!sec) return;
      commitLayout(moveItem(current, itemId, sec.id, delta > 0 ? 0 : sec.items.length));
    }
    requestAnimationFrame(() => navRef.current?.querySelector<HTMLButtonElement>(`button[data-nav-id="${itemId}"]`)?.focus());
  };
  const dropLine = <span aria-hidden="true" className="block h-0.5 mx-1.5 my-px rounded-full bg-blue-400" />;

  const handleMenuClick = async (id: string) => {
    if (id === 'pge-portable') {
      setPgeBusy(true);
      setPgeStatus(null);
      try {
        const res = await window.darkhub?.pge?.openPortable?.();
        if (res?.ok) {
          setPgeStatus({ ok: true, message: t('nav.pge.opened', 'Launcher PGE aberto!') });
        } else {
          setPgeStatus({ ok: false, message: res?.error ?? t('nav.pge.failed', 'Falha ao abrir PGE.') });
        }
      } catch (err: any) {
        setPgeStatus({ ok: false, message: err?.message ?? String(err) });
      } finally {
        setPgeBusy(false);
        window.setTimeout(() => setPgeStatus(null), 3500);
      }
      return;
    }
    setCurrentPage(id);
  };

  // Up/Down/Home/End move focus between sidebar entries (Tab still works as usual).
  const handleNavKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const focusedId = (document.activeElement as HTMLElement | null)?.dataset?.navId;
    if (e.altKey && focusedId && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      moveByKey(focusedId, e.key === 'ArrowUp' ? -1 : 1);
      return;
    }
    const items = Array.from(navRef.current?.querySelectorAll<HTMLButtonElement>('button[data-nav-item]:not(:disabled)') ?? []);
    if (!items.length) return;
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    let next = 0;
    if (e.key === 'End') next = items.length - 1;
    else if (e.key === 'ArrowDown') next = idx < 0 ? 0 : (idx + 1) % items.length;
    else if (e.key === 'ArrowUp') next = idx <= 0 ? items.length - 1 : idx - 1;
    e.preventDefault();
    items[next]?.focus();
  };

  const focusRing = 'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400/70 focus-visible:ring-inset';

  const navButton = (active: boolean) =>
    `group relative w-full min-w-0 flex items-center ${collapsed ? 'justify-center' : 'justify-between'} h-8 px-2.5 rounded-md text-[12.5px] ${focusRing} ${
      active ? 'bg-zinc-900 text-zinc-50' : 'text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-100'
    }`;

  // Active item marker: a 2px glacial rail instead of a boxed highlight.
  const rail = (active: boolean) => (
    <span
      aria-hidden="true"
      className={`absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-blue-400 transition-[opacity,transform] duration-200 ${
        active ? 'opacity-100 scale-y-100' : 'opacity-0 scale-y-50'
      }`}
    />
  );

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[oklch(0.138_0.010_255)] text-zinc-100 antialiased select-none">
      {/* Title bar */}
      <div className="h-9 flex items-center justify-between pl-3.5 select-none drag-region shrink-0 border-b border-zinc-900">
        <div className="flex items-center gap-2.5 no-drag">
          <DarkHubMark size={15} strokeWidth={1.7} className="text-blue-300" />
          <span className="text-[12.5px] font-semibold tracking-[-0.01em] text-zinc-100">
            DarkHub <span className="font-normal text-zinc-500">Suite</span>
          </span>
          <span className="text-[10.5px] text-zinc-600 font-mono">{APP_VERSION_LABEL}</span>
        </div>

        <div className="flex-1 h-full drag-region" />

        <div className="flex items-stretch no-drag h-full">
          <button
            onClick={() => window.darkhub?.window?.minimize?.()}
            title={t('window.minimize', 'Minimizar')}
            aria-label={t('window.minimize', 'Minimizar')}
            className={`w-11 flex items-center justify-center text-zinc-500 hover:bg-zinc-900 hover:text-zinc-100 active:!scale-100 ${focusRing}`}
          >
            <Minus size={14} />
          </button>
          <button
            onClick={() => window.darkhub?.window?.maximize?.()}
            title={t('window.maximize', 'Maximizar')}
            aria-label={t('window.maximize', 'Maximizar')}
            className={`w-11 flex items-center justify-center text-zinc-500 hover:bg-zinc-900 hover:text-zinc-100 active:!scale-100 ${focusRing}`}
          >
            <Square size={12} />
          </button>
          <button
            onClick={() => window.darkhub?.window?.close?.()}
            title={t('window.close', 'Fechar')}
            aria-label={t('window.close', 'Fechar')}
            className={`w-12 flex items-center justify-center text-zinc-500 hover:bg-[oklch(0.55_0.2_25)] hover:text-white active:!scale-100 ${focusRing}`}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <aside className={`${collapsed ? 'w-[60px]' : 'w-[232px]'} flex min-h-0 flex-col overflow-hidden transition-[width] duration-200 shrink-0 border-r border-zinc-900`}>
          <nav
            ref={navRef}
            aria-label={t('nav.main', 'Navegação principal')}
            onKeyDown={handleNavKeyDown}
            onDrop={onDropNav}
            onDragOver={(e) => { if (drag) e.preventDefault(); }}
            className="px-2.5 pt-3 pb-2 flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-4"
          >
            {sections.map((sec, idx) => (
              <React.Fragment key={sec.id}>
              {drop?.kind === 'section' && drop.index === idx ? dropLine : null}
              <div role="group" aria-label={sec.category} onDragOver={(e) => overSection(e, idx, sec)}
                className={drag?.kind === 'section' && drag.id === sec.id ? 'opacity-40' : undefined}>
                {!collapsed ? (
                  <p draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('application/x-darkhub-nav', sec.id); setDrag({ kind: 'section', id: sec.id }); }} onDragEnd={endDrag}
                    title={t('nav.dragHint', 'Arraste títulos e itens para reorganizar o menu (ou Alt + ↑/↓ no item)')}
                    className="text-[11px] font-medium text-zinc-500 px-2.5 pb-1.5 cursor-grab active:cursor-grabbing hover:text-zinc-300">
                    {sec.category}
                  </p>
                ) : (
                  idx > 0 && <div className="h-px bg-zinc-900 mx-2 mb-2" aria-hidden="true" />
                )}
                <div className="space-y-px">
                  {sec.items.map((item, itemIdx) => {
                    const Icon = item.icon;
                    const isActive = currentPage === item.id;
                    const isPge = item.id === 'pge-portable';
                    return (
                      <React.Fragment key={item.id}>
                      {drop?.kind === 'item' && drop.section === sec.id && drop.index === itemIdx ? dropLine : null}
                      <button
                        data-nav-item
                        data-nav-id={item.id}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('application/x-darkhub-nav', item.id); setDrag({ kind: 'item', id: item.id }); }}
                        onDragEnd={endDrag}
                        onDragOver={(e) => overItem(e, sec.id, itemIdx)}
                        onClick={() => handleMenuClick(item.id)}
                        disabled={isPge && pgeBusy}
                        title={collapsed ? item.label : undefined}
                        aria-label={collapsed ? item.label : undefined}
                        aria-current={isActive ? 'page' : undefined}
                        className={`${navButton(isActive)} ${drag?.kind === 'item' && drag.id === item.id ? 'opacity-40' : ''}`}
                      >
                        {rail(isActive)}
                        <span className="flex items-center gap-2.5 min-w-0">
                          <Icon
                            size={16}
                            className={`shrink-0 transition-colors ${isActive ? 'text-blue-300' : 'text-zinc-500 group-hover:text-zinc-300'}`}
                          />
                          {!collapsed && (
                            <span className="truncate">
                              {isPge && pgeBusy ? t('nav.pge.starting', 'Iniciando PGE...') : item.label}
                            </span>
                          )}
                        </span>
                        {!collapsed && item.badge && (
                          item.badge === 'ON' ? (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title={t('nav.darkosDetected', 'DarkOS detectado')} />
                          ) : (
                            <span className="text-[10px] text-zinc-600 font-mono shrink-0">{item.badge}</span>
                          )
                        )}
                      </button>
                      </React.Fragment>
                    );
                  })}
                  {drop?.kind === 'item' && drop.section === sec.id && drop.index === sec.items.length ? dropLine : null}
                  {drag?.kind === 'item' && !sec.items.length ? <div className="h-8 rounded-md border border-dashed border-zinc-800" /> : null}
                </div>
              </div>
              </React.Fragment>
            ))}
            {drop?.kind === 'section' && drop.index === sections.length ? dropLine : null}

            {!collapsed && savedLayout ? (
              <button type="button" onClick={() => commitLayout(layoutOf(navSections))}
                className={`w-full text-left px-2.5 text-[11px] text-zinc-600 hover:text-zinc-300 ${focusRing}`}>
                {t('nav.resetOrder', 'Restaurar ordem padrão do menu')}
              </button>
            ) : null}

            {!collapsed && pgeStatus ? (
              <div role="status" className={`rounded-md px-2.5 py-2 text-[11.5px] ${
                pgeStatus.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'
              }`}>
                {pgeStatus.message}
              </div>
            ) : null}
          </nav>

          <div className={`px-2.5 py-2 border-t border-zinc-900 shrink-0 flex ${collapsed ? 'flex-col' : 'items-center'} gap-1`}>
            <button
              onClick={() => setCurrentPage('settings')}
              title={collapsed ? t('nav.settings', 'Configurações') : undefined}
              aria-label={collapsed ? t('nav.settings', 'Configurações') : undefined}
              aria-current={currentPage === 'settings' ? 'page' : undefined}
              className={`${navButton(currentPage === 'settings')} flex-1`}
            >
              {rail(currentPage === 'settings')}
              <span className="flex items-center gap-2.5 min-w-0">
                <Settings size={16} className={`shrink-0 ${currentPage === 'settings' ? 'text-blue-300' : 'text-zinc-500 group-hover:text-zinc-300'}`} />
                {!collapsed && <span className="truncate">{t('nav.settings', 'Configurações')}</span>}
              </span>
            </button>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className={`h-8 ${collapsed ? 'w-full' : 'w-8'} flex items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-900/60 hover:text-zinc-200 shrink-0 ${focusRing}`}
              title={collapsed ? t('nav.expand', 'Expandir menu') : t('nav.collapse', 'Recolher menu')}
              aria-label={collapsed ? t('nav.expand', 'Expandir menu') : t('nav.collapse', 'Recolher menu')}
              aria-expanded={!collapsed}
            >
              {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
            </button>
          </div>
        </aside>

        <main ref={mainRef} className="relative flex-1 min-w-0 overflow-y-auto bg-zinc-950 p-4 md:p-5 lg:p-6">
          {/* Frost light: one faint cold glow from the top edge, painted once (no animation, no repaint on scroll) */}
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-x-0 top-9 h-64 bg-[radial-gradient(60%_100%_at_50%_0%,oklch(0.70_0.10_230/0.07),transparent)]"
          />
          <div className="relative">{children}</div>
        </main>
      </div>
      {showGuardian ? (
        <React.Suspense fallback={null}>
          <GuardianWidget />
        </React.Suspense>
      ) : null}
    </div>
  );
};

export default MainLayout;
