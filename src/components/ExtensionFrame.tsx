import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider';

/**
 * One sandboxed extension page or widget. The frame has an opaque origin (sandbox without allow-same-origin), a strict
 * CSP set by the main process, and can only talk through postMessage; this component relays calls to the main process,
 * which checks the extension's permissions.
 */
export default function ExtensionFrame({ extId, contribution, kind = 'pages', onNavigate, className = '', style, fixedHeight }: {
  extId: string; contribution: string; kind?: 'pages' | 'widgets'; onNavigate?: (page: string) => void; className?: string; style?: React.CSSProperties; fixedHeight?: number;
}) {
  const { lang, t } = useI18n();
  const ref = useRef<HTMLIFrameElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [height, setHeight] = useState<number | undefined>(fixedHeight);
  const [toast, setToast] = useState('');

  const load = useCallback(() => {
    // validate first (clear error in the app instead of a blank frame), then load it from its own origin
    window.darkhub?.ext?.doc({ id: extId, contribution, kind, lang }).then((r) => {
      if (r?.ok) { setSrc(`darkhub-ext://ext/${encodeURIComponent(extId)}/${kind}/${encodeURIComponent(contribution)}?lang=${lang}&v=${Date.now()}`); setError(''); } else setError(r?.error || 'erro');
    });
  }, [extId, contribution, kind, lang]);
  useEffect(load, [load]);
  // development: the main process rebuilt this extension from its folder
  useEffect(() => window.darkhub?.hub?.onEvent?.((m) => { if (m.type === 'extReload' && m.id === extId) load(); }), [extId, load]);

  useEffect(() => {
    const onMessage = async (e: MessageEvent) => {
      const frame = ref.current?.contentWindow;
      if (!frame || e.source !== frame) return;
      const m = e.data;
      if (!m || m.__dh !== 1) return;
      const reply = (payload: object) => frame.postMessage({ __dh: 1, ...payload }, '*'); // opaque origin: '*' is the only target
      if (m.type === 'call' && typeof m.method === 'string') {
        const r = await window.darkhub!.ext.call({ id: extId, method: m.method, params: m.params });
        reply({ type: 'result', id: m.id, ok: r.ok, value: r.value, error: r.error });
      } else if (m.type === 'log') {
        void window.darkhub?.ext?.log({ id: extId, level: String(m.level), args: Array.isArray(m.args) ? m.args.map(String) : [] });
      } else if (m.type === 'height' && kind === 'widgets' && !fixedHeight) {
        setHeight(Math.min(600, Math.max(60, Number(m.value) || 0)));
      } else if (m.type === 'navigate' && typeof m.page === 'string' && /^[\w-]{1,80}$/.test(m.page)) {
        onNavigate?.(m.page);
      } else if (m.type === 'toast' && typeof m.text === 'string') {
        setToast(m.text.slice(0, 300));
        window.setTimeout(() => setToast(''), 3500);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [extId, kind, fixedHeight, onNavigate]);

  if (error) return <p role="alert" className="text-[12.5px] text-amber-300">{t('ext.loadError', 'Não foi possível abrir a extensão')}: {error}</p>;
  return (
    <div className={`relative ${className}`} style={style}>
      {src ? (
        <iframe
          ref={ref}
          name="dh-ext"
          title={`${extId} ${contribution}`}
          sandbox="allow-scripts allow-forms allow-modals"
          src={src}
          className="block w-full h-full border-0 bg-transparent"
          style={kind === 'widgets' ? { height: height || 160 } : undefined}
        />
      ) : <div className="w-full h-full min-h-[120px] rounded-lg bg-zinc-900/60 animate-pulse" />}
      {toast ? <div role="status" className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-[12.5px] text-zinc-100 shadow-lg">{toast}</div> : null}
    </div>
  );
}
