import React from 'react';
import {
  Home as HomeIcon, LayoutGrid, Zap, Monitor, FileText, Settings,
  PlaySquare, ScanText, ShieldAlert, Lock, Image as ImageIcon,
  Edit3, MousePointerClick, LibraryBig, Gamepad2, Film,
  Download, Fingerprint, Network, Code, ChevronLeft, ChevronRight,
  Cpu, Crosshair, Activity, Flame, Sparkles, Minus, Square, X
} from 'lucide-react';
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
        { id: 'dashboard', label: t('nav.dashboard', 'Dashboard'), icon: LayoutGrid }
      ]
    },
    {
      category: t('nav.cat.gaming', 'Gaming & Performance'),
      items: [
        { id: 'darkpacer', label: t('nav.darkpacer', 'DarkPacer (FPS Lock)'), icon: Activity, badge: 'DXGI' },
        { id: 'optiscaler', label: t('nav.optiscaler', 'OptiScaler Manager'), icon: Cpu },
        { id: 'pge-portable', label: 'PGE Portable', icon: Gamepad2 },
        { id: 'optimizer', label: t('nav.optimizer', 'System Optimizer'), icon: Zap },
        { id: 'ultra-latency', label: t('nav.ultralatency', 'Ultra Low Latency'), icon: Flame },
        { id: 'dll-injector', label: t('nav.dllinjector', 'DLL Injector'), icon: Crosshair }
      ]
    },
    {
      category: t('nav.cat.diagnostics', 'Diagnostics & Hardware'),
      items: [
        { id: 'monitor', label: t('nav.monitor', 'System Monitor'), icon: Monitor },
        { id: 'networktools', label: t('nav.networktools', 'Network & Latency'), icon: Network },
        { id: 'setuphub', label: t('nav.setuphub', 'Post-Install Hub'), icon: Zap }
      ]
    },
    {
      category: t('nav.cat.utilities', 'Utilities & Tools'),
      items: [
        { id: 'library', label: t('nav.library', 'Library'), icon: LibraryBig },
        { id: 'security', label: t('nav.security', 'Advanced Security'), icon: ShieldAlert },
        { id: 'passwords', label: t('nav.passwords', 'Password Vault'), icon: Lock },
        { id: 'decryption', label: t('nav.decryption', 'Decryption'), icon: Fingerprint },
        { id: 'converter', label: t('nav.converter', 'File Converter'), icon: FileText },
        { id: 'youtube', label: t('nav.youtube', 'Video Downloader'), icon: PlaySquare },
        { id: 'ocr', label: t('nav.ocr', 'Image OCR'), icon: ScanText },
        { id: 'metadata', label: t('nav.metadata', 'EXIF Editor'), icon: ImageIcon },
        { id: 'texteditor', label: t('nav.texteditor', 'Text Editor'), icon: Edit3 },
        { id: 'summarizer', label: t('nav.summarizer', 'Summarizer'), icon: Sparkles },
        { id: 'autoclicker', label: t('nav.autoclicker', 'AutoClicker'), icon: MousePointerClick },
        { id: 'devtools', label: t('nav.devtools', 'Developer Tools'), icon: Code },
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
          setPgeStatus({ ok: true, message: 'Launcher PGE aberto!' });
        } else {
          setPgeStatus({ ok: false, message: res?.error ?? 'Falha ao abrir PGE.' });
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

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 antialiased select-none">
      {}
      <div className="h-8 bg-zinc-950 border-b border-zinc-800/80 flex items-center justify-between px-3 select-none drag-region shrink-0 text-xs text-zinc-400">
        <div className="flex items-center gap-2 no-drag">
          <span className="font-semibold text-zinc-200 tracking-tight flex items-center gap-1.5 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            DarkHub Suite
          </span>
          <span className="text-[10px] text-zinc-500 font-mono">v0.4.5</span>
        </div>

        <div className="flex-1 h-full drag-region" />

        {}
        <div className="flex items-center no-drag -mr-3 h-full">
          <button
            onClick={() => window.darkhub?.window?.minimize?.()}
            title="Minimizar"
            className="h-full px-3.5 flex items-center justify-center hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            <Minus size={13} />
          </button>
          <button
            onClick={() => window.darkhub?.window?.maximize?.()}
            title="Maximizar"
            className="h-full px-3.5 flex items-center justify-center hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            <Square size={11} />
          </button>
          <button
            onClick={() => window.darkhub?.window?.close?.()}
            title="Fechar"
            className="h-full px-4 flex items-center justify-center hover:bg-red-600 text-zinc-400 hover:text-white transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {}
        <aside className={`${collapsed ? 'w-16' : 'w-56'} bg-zinc-950 border-r border-zinc-800/80 flex min-h-0 flex-col overflow-hidden transition-[width] duration-150 shrink-0`}>
          {}
          <div className="p-2 flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-3">
            {navSections.map((sec, idx) => (
              <div key={idx} className="space-y-0.5">
                {!collapsed ? (
                  <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-2 py-0.5">
                    {sec.category}
                  </p>
                ) : (
                  <div className="h-px bg-zinc-850 my-1 mx-2" />
                )}
                <nav className="space-y-0.5">
                  {sec.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentPage === item.id;
                    const isPge = item.id === 'pge-portable';
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleMenuClick(item.id)}
                        disabled={isPge && pgeBusy}
                        title={collapsed ? item.label : undefined}
                        className={`w-full min-w-0 flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-2 py-1.5 rounded-md text-xs font-normal transition-colors duration-100 ${
                          isActive
                            ? 'bg-zinc-850 text-white font-medium border border-zinc-700/60'
                            : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center space-x-2 min-w-0">
                          <Icon size={15} className={`shrink-0 ${isActive ? 'text-blue-400' : 'text-zinc-400'}`} />
                          {!collapsed && (
                            <span className="truncate text-[11.5px]">
                              {isPge && pgeBusy ? 'Iniciando PGE...' : item.label}
                            </span>
                          )}
                        </div>
                        {!collapsed && item.badge && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-800 text-zinc-400 font-mono uppercase shrink-0">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </div>
            ))}

            {!collapsed && pgeStatus ? (
              <div className={`mt-2 rounded border px-2.5 py-1.5 text-[11px] font-mono ${
                pgeStatus.ok
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-red-500/30 bg-red-500/10 text-red-300'
              }`}>
                {pgeStatus.message}
              </div>
            ) : null}
          </div>

          {}
          <div className="p-2 border-t border-zinc-800/80 shrink-0 bg-zinc-950/60 flex items-center gap-1">
            <button
              onClick={() => setCurrentPage('settings')}
              title="Configurações"
              className={`flex-1 min-w-0 flex items-center ${collapsed ? 'justify-center' : 'space-x-2'} px-2 py-1.5 rounded-md text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 border border-transparent hover:border-zinc-800 transition-colors duration-100`}
            >
              <Settings size={15} className="shrink-0 text-zinc-400" />
              {!collapsed && <span className="truncate text-xs">{t('nav.settings')}</span>}
            </button>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-1.5 rounded-md text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 border border-transparent hover:border-zinc-800 transition-colors duration-100 shrink-0"
              title={collapsed ? "Expandir menu" : "Recolher menu"}
            >
              {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
            </button>
          </div>
        </aside>

        {}
        <main className="flex-1 overflow-y-auto bg-zinc-900/40 p-3 md:p-4 lg:p-5">
          {children}
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

