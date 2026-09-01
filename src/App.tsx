import { useI18n } from '../i18n/I18nProvider';
import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import Layout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';
import { I18nProvider } from './i18n/I18nProvider';
import UpdaterOverlay from './components/UpdaterOverlay';
import ErrorBoundary from './components/ErrorBoundary';

const Optimizer = lazy(() => import('./pages/Optimizer'));
const SystemMonitor = lazy(() => import('./pages/SystemMonitor'));
const FileConverter = lazy(() => import('./pages/FileConverter'));
const YoutubeDownloader = lazy(() => import('./pages/YoutubeDownloader'));
const ImageTextExtractor = lazy(() => import('./pages/ImageTextExtractor'));
const AdvancedSecurity = lazy(() => import('./pages/AdvancedSecurity'));
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
const SetupHub = lazy(() => import('./pages/SetupHub'));
const DllInjector = lazy(() => import('./pages/DllInjector'));
const FramePacer = lazy(() => import('./pages/FramePacer'));
const Home = lazy(() => import('./pages/Home'));

const App = () => {
  const [currentPage, setCurrentPage] = useState('home');
  const lastReportRef = useRef<number>(0)

  useEffect(() => {
    const report = async (payload: any) => {
      const now = Date.now()
      if (now - lastReportRef.current < 3000) return
      lastReportRef.current = now
      try {
        const res = await window.darkhub?.discord?.reportError?.({
          source: 'renderer',
          page: currentPage,
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
  }, [currentPage])

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <Home onNavigate={(p: string) => setCurrentPage(p)} />;
      case 'dashboard':
        return <Dashboard onNavigate={(p: string) => setCurrentPage(p)} />;
      case 'optimizer':
        return <Optimizer />;
      case 'monitor':
        return <SystemMonitor />;
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
        return <OptiScalerManager />;
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
        return <SetupHub />;
      case 'dll-injector':
        return <DllInjector />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <I18nProvider>
      <Layout currentPage={currentPage} setCurrentPage={setCurrentPage}>
          <Suspense fallback={<div className="p-8 text-center text-zinc-500 text-xs font-mono">Loading module...</div>}>
            <ErrorBoundary>
              {renderPage()}
            </ErrorBoundary>
          </Suspense>
          <UpdaterOverlay />
        </Layout>
      </I18nProvider>
  );
};

export default App;
