import React from 'react';
import { APP_VERSION_LABEL } from '../appVersion';
import {
  Home as HomeIcon, LayoutGrid, Zap, Monitor, FileText, Settings,
  PlaySquare, ScanText, ShieldAlert, Lock, Image as ImageIcon,
  Edit3, MousePointerClick, LibraryBig, Gamepad2, Film, Eye,
  Download, Fingerprint, Network, Code, ChevronLeft, ChevronRight,
  Cpu, Crosshair, Activity, Flame, Sparkles, Minus, Square, X, LifeBuoy, Gauge, UploadCloud,
  MonitorCog, Terminal, DarkHubMark, Archive, Layers, Rocket, Usb, History
} from '../components/icons';
import { useI18n } from '../i18n/I18nProvider';

const GuardianWidget = React.lazy(() => import('../components/GuardianWidget'));

interface MainLayoutProps {
  children: React.ReactNode;
  currentPage: string;
  setCurrentPage: (page: string) => void;
}

interface NavSection {
  category: string;
  items: {
    id: string;
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    badge?: string;
  }[];
}

const MainLayout: React.FC<MainLayoutProps> = ({ children, currentPage, setCurrentPage }) => {
  const { t } = useI18n();
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

  const navSections: NavSection[] = [
    {
      category: t('nav.cat.overview', 'Overview'),
      items: [
        { id: 'home', label: t('nav.home', 'Home'), icon: HomeIcon },
        { id: 'dashboard', label: t('nav.dashboard', 'Dashboard'), icon: LayoutGrid },
        { id: 'realtime', label: t('nav.realtime', 'Real-time'), icon: Gauge },
        // Always listed: on DarkOS it is the management/recovery center; elsewhere it shows an
        // explanatory empty state (nothing can run, the main process refuses without manifest.json).
        { id: 'darkos', label: isDarkOS ? t('nav.darkos', 'DarkOS') : t('darkos.win.title', 'DarkOS Mods'), icon: LifeBuoy, badge: isDarkOS ? 'ON' : undefined }
      ]
    },
    {
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
        { id: 'overlay', label: t('nav.overlay', 'In-game overlay'), icon: Layers },
        { id: 'savebackup', label: t('nav.savebackup', 'Save backup'), icon: Archive }
      ]
    },
    {
      category: t('nav.cat.diagnostics', 'Diagnostics & Hardware'),
      items: [
        { id: 'monitor', label: t('nav.monitor', 'System Monitor'), icon: Monitor },
        { id: 'driver', label: t('nav.driver', 'Driver Center'), icon: MonitorCog },
        { id: 'networktools', label: t('nav.networktools', 'Network & Latency'), icon: Network },
        { id: 'setuphub', label: t('nav.setuphub', 'Post-Install Hub'), icon: Zap },
        { id: 'maintenance', label: t('nav.maintenance', 'Scheduled maintenance'), icon: History },
        { id: 'usb', label: t('nav.usb', 'USB ports'), icon: Usb },
        { id: 'startup', label: t('nav.startup', 'Startup manager'), icon: Rocket }
      ]
    },
    {
      category: t('nav.cat.utilities', 'Utilities & Tools'),
      items: [
        { id: 'spacesniffer', label: t('nav.diskmap', 'Disk map'), icon: LayoutGrid },
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
      category: t('nav.cat.services', 'DarkHub services'),
      items: [
        { id: 'kakugan', label: t('nav.kakugan', 'Kakugan'), icon: Eye },
        { id: 'share', label: t('nav.share', 'Susuya'), icon: UploadCloud },
        { id: 'luluflix', label: t('nav.luluflix', 'LuluFlix'), icon: Film },
        { id: 'juuzou', label: t('nav.juuzou', 'Juuzou'), icon: Download }
      ]
    }
  ];

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
            className="px-2.5 pt-3 pb-2 flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-4"
          >
            {navSections.map((sec, idx) => (
              <div key={idx} role="group" aria-label={sec.category}>
                {!collapsed ? (
                  <p className="text-[11px] font-medium text-zinc-500 px-2.5 pb-1.5" aria-hidden="true">
                    {sec.category}
                  </p>
                ) : (
                  idx > 0 && <div className="h-px bg-zinc-900 mx-2 mb-2" aria-hidden="true" />
                )}
                <div className="space-y-px">
                  {sec.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentPage === item.id;
                    const isPge = item.id === 'pge-portable';
                    return (
                      <button
                        key={item.id}
                        data-nav-item
                        onClick={() => handleMenuClick(item.id)}
                        disabled={isPge && pgeBusy}
                        title={collapsed ? item.label : undefined}
                        aria-label={collapsed ? item.label : undefined}
                        aria-current={isActive ? 'page' : undefined}
                        className={navButton(isActive)}
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
                    );
                  })}
                </div>
              </div>
            ))}

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
