import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw } from './icons';
import { useI18n } from '../i18n/I18nProvider';
import PageHeader from './ui/PageHeader';

interface EmbeddedSitePageProps {
  title: string;
  subtitle: string;
  url: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** Legacy per-site accent classes; ignored by the Frost design (one accent), kept for callers. */
  accent?: string;
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

/** Shared shell for the DarkHub web services embedded through <webview> (LuluFlix, Juuzou). */
const EmbeddedSitePage: React.FC<EmbeddedSitePageProps> = ({ title, subtitle, url, icon: Icon }) => {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const wvRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const wv = wvRef.current as any;
    if (!wv) return;

    const onLoad = () => setLoading(false);
    const onFail = (e: any) => {
      // -3 (ERR_ABORTED) fires on in-page redirects/navigations; it is not a real failure.
      if (e?.errorCode === -3 || e?.isMainFrame === false) return;
      setLoading(false);
      setFailed(e?.errorDescription || String(e?.errorCode ?? ''));
    };

    wv.addEventListener('did-finish-load', onLoad);
    wv.addEventListener('did-fail-load', onFail);

    return () => {
      wv.removeEventListener('did-finish-load', onLoad);
      wv.removeEventListener('did-fail-load', onFail);
    };
  }, []);

  const reload = () => {
    setLoading(true);
    setFailed(null);
    const wv = wvRef.current as any;
    wv?.reload?.();
  };

  return (
    // The page wrapper in <main> has no height of its own: fill the viewport minus the title bar (h-9) and <main>'s padding.
    <div className="flex flex-col w-full min-h-[420px] h-[calc(100vh-2.25rem-2rem)] md:h-[calc(100vh-2.25rem-2.5rem)] lg:h-[calc(100vh-2.25rem-3rem)]">
      <PageHeader
        title={<span className="inline-flex items-center gap-2.5"><Icon size={18} className="text-zinc-400" />{title}</span>}
        subtitle={subtitle}
        actions={(
          <button onClick={reload} className="dh-btn" title={t('common.reload', 'Recarregar')}>
            <RefreshCw size={14} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} />
            {t('common.reload', 'Recarregar')}
          </button>
        )}
      />

      <div className="flex-1 dh-card overflow-hidden relative min-h-0 -mt-1">
        {loading && (
          <div className="absolute inset-x-0 top-0 z-10 pointer-events-none" role="status" aria-label={t('embedded.connecting', 'Conectando a {name}...').replace('{name}', title)}>
            <div className="h-px bg-zinc-800 overflow-hidden"><div className="h-full w-1/3 bg-blue-400 animate-pulse" /></div>
            <p className="px-4 py-2 text-[12px] text-zinc-500">{t('embedded.connecting', 'Conectando a {name}...').replace('{name}', title)}</p>
          </div>
        )}
        {failed && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 z-10" role="alert">
            <div className="flex flex-col items-start gap-2 max-w-sm px-6">
              <AlertTriangle size={18} className="text-red-400" />
              <p className="dh-section-title">{t('embedded.failedTitle', 'Não foi possível carregar a página')}</p>
              <p className="dh-help">{t('embedded.failedBody', 'Verifique sua conexão com a internet e tente novamente.')}</p>
              {failed ? <p className="text-[11.5px] text-red-300/90 font-mono break-all">{failed}</p> : null}
              <button onClick={reload} className="dh-btn mt-2">
                <RefreshCw size={14} />
                <span>{t('common.retry', 'Tentar novamente')}</span>
              </button>
            </div>
          </div>
        )}
        <webview
          ref={wvRef}
          src={url}
          // Passed as a string attribute (Electron only checks that it is present): React does not emit a
          // boolean `true` for this non-HTML attribute, which would leave popups blocked.
          {...({ allowpopups: 'true' } as Record<string, string>)}
          partition="persist:darkhub_media"
          useragent={USER_AGENT}
          style={{ display: 'flex', width: '100%', height: '100%' } as React.CSSProperties}
        />
      </div>
    </div>
  );
};

export default EmbeddedSitePage;
