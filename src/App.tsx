import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import Layout from './layouts/MainLayout';
import { I18nProvider } from './i18n/I18nProvider';
import UpdaterOverlay from './components/UpdaterOverlay';
import ErrorBoundary from './components/ErrorBoundary';

// Every page is a separate chunk: only the shell (layout, i18n, updater) is in the startup bundle.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Optimizer = lazy(() => import('./pages/Optimizer'));
const SystemMonitor = lazy(() => import('./pages/SystemMonitor'));
const FileConverter = lazy(() => import('./pages/FileConverter'));
const YoutubeDownloader = lazy(() => import('./pages/YoutubeDownloader'));
const ImageTextExtractor = lazy(() => import('./pages/ImageTextExtractor'));
const AdvancedSecurity = lazy(() => import('./pages/AdvancedSecurity'));
const Realtime = lazy(() => import('./pages/Realtime'));
const Share = lazy(() => import('./pages/Share'));
const PasswordManager = lazy(() => import('./pages/PasswordManager'));
const MetaDataEditor = lazy(() => import('./pages/MetaDataEditor'));
const TextEditor = lazy(() => import('./pages/TextEditor'));
const TextSummarizer = lazy(() => import('./pages/TextSummarizer'));
const AutoClicker = lazy(() => import('./pages/AutoClicker'));
const UltraLowLatency = lazy(() => import('./pages/UltraLowLatency'));
const Library = lazy(() => import('./pages/Library'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const LuluFlix = lazy(() => import('./pages/LuluFlix'));
const Juuzou = lazy(() => import('./pages/Juuzou'));
const Decryption = lazy(() => import('./pages/Decryption'));
const NetworkTools = lazy(() => import('./pages/NetworkTools'));
const DevTools = lazy(() => import('./pages/DevTools'));
const OptiScalerManager = lazy(() => import('./pages/OptiScalerManager'));
const Dlss5Manager = lazy(() => import('./pages/Dlss5Manager'));
const Downloads = lazy(() => import('./pages/Downloads'));
const SetupHub = lazy(() => import('./pages/SetupHub'));
const DllInjector = lazy(() => import('./pages/DllInjector'));
const FramePacer = lazy(() => import('./pages/FramePacer'));
const Home = lazy(() => import('./pages/Home'));
const SpaceSniffer = lazy(() => import('./pages/SpaceSniffer'));
const Maintenance = lazy(() => import('./pages/Maintenance'));
const UsbControl = lazy(() => import('./pages/UsbControl'));
const Kakugan = lazy(() => import('./pages/Kakugan'));
const StartupManager = lazy(() => import('./pages/StartupManager'));
const Benchmark = lazy(() => import('./pages/Benchmark'));
const GameOverlay = lazy(() => import('./pages/GameOverlay'));
const SaveBackup = lazy(() => import('./pages/SaveBackup'));
// Dev-only IPC trace panel (tree-shaken out of production builds).
const DevTracePanel = import.meta.env.DEV ? lazy(() => import('./components/DevTracePanel')) : null;
const IconSheet = import.meta.env.DEV ? lazy(() => import('./components/icons/IconSheet')) : null;

// The page lives in the URL hash (#optimizer): reload / `npm run dev -- --page=x` open straight on a screen.
const pageFromHash = () => (typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '').replace(/[^\w-]/g, '') : '') || 'home';
const DarkOSCenter = lazy(() => import('./pages/DarkOSCenter'));
const DriverCenter = lazy(() => import('./pages/DriverCenter'));
const PowerShellTools = lazy(() => import('./pages/PowerShellTools'));

const PageLoading = () => (
  // Skeleton shaped like a page header + content (no spinner): the layout does not jump when the chunk lands.
  <div role="status" aria-live="polite" aria-label="Carregando" className="space-y-6 animate-pulse motion-reduce:animate-none">
    <div className="space-y-2">
      <div className="h-5 w-48 rounded bg-zinc-900" />
      <div className="h-3 w-80 max-w-full rounded bg-zinc-900/70" />
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <div className="h-28 rounded-lg bg-zinc-900/70 lg:col-span-2" />
      <div className="h-28 rounded-lg bg-zinc-900/70" />
    </div>
    <div className="h-40 rounded-lg bg-zinc-900/50" />
  </div>
);

const App = () => {
  const [currentPage, setCurrentPage] = useState(pageFromHash);
  const lastReportRef = useRef<number>(0)
  const currentPageRef = useRef<string>(currentPage)
  currentPageRef.current = currentPage

  useEffect(() => {
    if (window.location.hash.replace(/^#/, '') !== currentPage) window.history.replaceState(null, '', `#${currentPage}`);
  }, [currentPage]);

  // screenshot shutter sound, wherever the user is (the window may be in the tray)
  useEffect(() => window.darkhub?.share?.onEvent?.((m: any) => { if (m?.type === 'screenshot' && m.sound) void import('./lib/shutterSound').then((x) => x.playShutter()); }), []);

  useEffect(() => {
    const onHash = () => { const p = pageFromHash(); setCurrentPage((cur) => (cur === p ? cur : p)); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const report = async (payload: any) => {
      const now = Date.now()
      if (now - lastReportRef.current < 3000) return
      lastReportRef.current = now
      try {
        const res = await window.darkhub?.discord?.reportError?.({
          source: 'renderer',
          page: currentPageRef.current,
          ...payload
        })
        if (res && res.ok === false) {
          console.warn('Discord error report failed:', res.error)
        }
      } catch {}
    }

    const onError = (event: any) => {
      const message = event?.message ?? 'Unknown error'
      const stack = event?.error?.stack ?? ''
      report({ message, stack })
    }

    const onRejection = (event: any) => {
      const reason = event?.reason
      const message = reason?.message ?? String(reason ?? 'Unhandled rejection')
      const stack = reason?.stack ?? ''
      report({ message, stack })
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  const reportRenderError = (error: Error, componentStack?: string | null) => {
    const now = Date.now()
    if (now - lastReportRef.current < 3000) return
    lastReportRef.current = now
    try {
      window.darkhub?.discord?.reportError?.({
        source: 'renderer',
        page: currentPageRef.current,
        message: error?.message ?? 'Render error',
        stack: `${error?.stack ?? ''}${componentStack ? `
${componentStack}` : ''}`
      })?.catch?.(() => {})
    } catch {}
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <Home onNavigate={(p: string) => setCurrentPage(p)} />;
      case 'dashboard':
        return <Dashboard onNavigate={(p: string) => setCurrentPage(p)} />;
      case 'optimizer':
        return <Optimizer onNavigate={(p: string) => setCurrentPage(p)} />;
      case 'darkos':
        return <DarkOSCenter onNavigate={(p: string) => setCurrentPage(p)} />;
      case 'driver':
        return <DriverCenter />;
      case 'powershell':
        return <PowerShellTools />;
      case 'monitor':
        return <SystemMonitor />;
      case 'realtime':
        return <Realtime />;
      case 'share':
        return <Share />;
      case 'security':
        return <AdvancedSecurity />;
      case 'passwords':
        return <PasswordManager />;
      case 'converter':
        return <FileConverter />;
      case 'youtube':
        return <YoutubeDownloader />;
      case 'ocr':
        return <ImageTextExtractor />;
      case 'metadata':
        return <MetaDataEditor />;
      case 'texteditor':
        return <TextEditor />;
      case 'summarizer':
        return <TextSummarizer />;
      case 'autoclicker':
        return <AutoClicker />;
      case 'ultra-latency':
        return <UltraLowLatency />;
      case 'library':
        return <Library />;
      case 'darkpacer':
      case 'framepacer':
        return <FramePacer />;
      case 'optiscaler':
        return <OptiScalerManager onNavigate={(p: string) => setCurrentPage(p)} />;
      case 'dlss5':
        return <Dlss5Manager />;
      case 'downloads':
        return <Downloads />;
      case 'luluflix':
        return <LuluFlix />;
      case 'juuzou':
        return <Juuzou />;
      case 'decryption':
        return <Decryption />;
      case 'networktools':
        return <NetworkTools />;
      case 'devtools':
        return <DevTools />;
      case 'setuphub':
        return <SetupHub onNavigate={(p: string) => setCurrentPage(p)} />;
      case 'spacesniffer':
        return <SpaceSniffer />;
      case 'dll-injector':
        return <DllInjector />;
      case 'dev-icons':
        if (IconSheet) return <IconSheet />;
        return <Home onNavigate={(p: string) => setCurrentPage(p)} />;
      case 'savebackup':
        return <SaveBackup />;
      case 'overlay':
        return <GameOverlay />;
      case 'benchmark':
        return <Benchmark />;
      case 'startup':
        return <StartupManager />;
      case 'usb':
        return <UsbControl />;
      case 'kakugan':
        return <Kakugan />;
      case 'maintenance':
        return <Maintenance />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <Home onNavigate={(p: string) => setCurrentPage(p)} />;
    }
  };

  return (
    <I18nProvider>
      <Layout currentPage={currentPage} setCurrentPage={setCurrentPage}>
        {/* One boundary per route (keyed by page): a crash in one module never takes down the shell, and
            navigating away clears the error. Suspense sits inside so chunk-load failures are caught too. */}
        <ErrorBoundary key={currentPage} onError={reportRenderError} onNavigateHome={currentPage === 'home' ? undefined : () => setCurrentPage('home')}>
          <Suspense fallback={<PageLoading />}>
            <div className="dh-page">{renderPage()}</div>
          </Suspense>
        </ErrorBoundary>
        <ErrorBoundary silent onError={reportRenderError}>
          <UpdaterOverlay />
        </ErrorBoundary>
        {DevTracePanel && (
          <ErrorBoundary silent>
            <Suspense fallback={null}><DevTracePanel currentPage={currentPage} /></Suspense>
          </ErrorBoundary>
        )}
      </Layout>
    </I18nProvider>
  );
};

export default App;
