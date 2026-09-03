import { useI18n } from '../i18n/I18nProvider';
import React, { useEffect, useRef, useState } from 'react';
import { PlaySquare, RefreshCw } from 'lucide-react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        src?: string;
        allowpopups?: string;
        partition?: string;
        ref?: React.Ref<any>;
      }, HTMLElement>;
    }
  }
}

const LuluFlix = () => {
  const [loading, setLoading] = useState(true);
  const wvRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const wv = wvRef.current as any;
    if (!wv) return;

    const onLoad = () => setLoading(false);
    const onFail = () => setLoading(false);

    wv.addEventListener('did-finish-load', onLoad);
    wv.addEventListener('did-fail-load', onFail);

    return () => {
      wv.removeEventListener('did-finish-load', onLoad);
      wv.removeEventListener('did-fail-load', onFail);
    };
  }, []);

  const reload = () => {
    setLoading(true);
    const wv = wvRef.current as any;
    wv?.reload?.();
  };

  return (
    <div className="flex flex-col space-y-3" style={{ height: 'calc(100vh - 120px)' }}>
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-red-500/10 rounded-lg">
            <PlaySquare className="text-red-400" size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-zinc-100">LuluFlix</h2>
            <p className="text-sm text-zinc-400">Plataforma de Streaming DarkHub</p>
          </div>
        </div>
        <button
          onClick={reload}
          className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
          title="Recarregar"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex-1 bg-zinc-800/50 rounded-xl border border-zinc-700 overflow-hidden relative min-h-0">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80 z-10 pointer-events-none">
            <div className="flex flex-col items-center space-y-4">
              <RefreshCw className="animate-spin text-red-500" size={32} />
              <p className="text-zinc-300 animate-pulse">Conectando ao LuluFlix...</p>
            </div>
          </div>
        )}
        <webview
          ref={wvRef}
          src="https://luluflix.darkhub.ink/"
          allowpopups={true}
          partition="persist:darkhub_media"
          useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
          style={{ display: 'flex', width: '100%', height: '100%' } as React.CSSProperties}
        />
      </div>
    </div>
  );
};

export default LuluFlix;
