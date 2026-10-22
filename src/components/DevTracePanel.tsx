import { useEffect, useMemo, useState } from 'react';
import type { DevTraceEntry } from '../global';

// Dev-only floating panel: every call the UI makes to the backend (channel, time, ok/error, args/result).
// Rendered by App.tsx only when import.meta.env.DEV, so it never ships in a packaged build.

type Entry = DevTraceEntry & { page: string };
const MAX = 300;

export default function DevTracePanel({ currentPage }: { currentPage: string }) {
  currentPageRef.current = currentPage;
  const [entries, setEntries] = useState<Entry[]>([]);
  const [open, setOpen] = useState(false);
  const [hideNoisy, setHideNoisy] = useState(true);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [onlyPage, setOnlyPage] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [pageSince, setPageSince] = useState(() => Date.now());

  useEffect(() => { setPageSince(Date.now()); setExpanded(null); }, [currentPage]);

  useEffect(() => {
    const dev = window.darkhub?.dev;
    if (!dev?.onIpcTrace) return;
    const off = dev.onIpcTrace((e) => {
      setEntries((prev) => {
        const next = [{ ...e, page: currentPageRef.current }, ...prev];
        return next.length > MAX ? next.slice(0, MAX) : next;
      });
    });
    return off;
  }, []);

  const visible = useMemo(() => entries.filter((e) =>
    (!hideNoisy || !e.noisy || !e.ok) &&
    (!onlyErrors || !e.ok) &&
    (!onlyPage || (e.page === currentPage && e.at >= pageSince))
  ), [entries, hideNoisy, onlyErrors, onlyPage, currentPage, pageSince]);

  const pageEntries = entries.filter((e) => e.page === currentPage && e.at >= pageSince && !e.noisy);
  const pageErrors = pageEntries.filter((e) => !e.ok).length;

  const copy = (text: string) => { void navigator.clipboard?.writeText(text).catch(() => {}); };
  const summary = () => [
    `Pagina: ${currentPage}`,
    ...visible.slice().reverse().map((e) => `${e.ok ? 'OK ' : 'ERR'} ${e.channel} ${e.ms}ms${e.ok ? '' : ` -> ${e.error}`}`)
  ].join('\n');

  if (!window.darkhub?.dev) return null;

  return (
    <div className="fixed bottom-3 right-3 z-[9999] font-mono text-[11px]">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`px-3 py-1.5 rounded-md border shadow-lg backdrop-blur bg-zinc-900/90 hover:bg-zinc-800 ${pageErrors ? 'border-red-500/60 text-red-300' : 'border-zinc-700 text-zinc-300'}`}
          aria-label="Abrir painel de rastreio IPC"
        >
          IPC · {currentPage} · {pageEntries.length} chamadas{pageErrors ? ` · ${pageErrors} erro(s)` : ''}
        </button>
      ) : (
        <div className="w-[560px] max-w-[calc(100vw-24px)] h-[420px] flex flex-col rounded-lg border border-zinc-700 bg-zinc-950/95 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-3 px-3 py-2 border-b border-zinc-800 text-zinc-300">
            <span className="font-semibold">Dev Trace</span>
            <span className="text-zinc-500">tela: {currentPage}</span>
            <label className="flex items-center gap-1 ml-auto cursor-pointer"><input type="checkbox" checked={onlyPage} onChange={(e) => setOnlyPage(e.target.checked)} />só esta tela</label>
            <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} />só erros</label>
            <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={hideNoisy} onChange={(e) => setHideNoisy(e.target.checked)} />ocultar polling</label>
          </div>
          <div className="flex-1 overflow-auto">
            {visible.length === 0 ? (
              <p className="p-4 text-zinc-500">Nenhuma chamada ainda. Use a tela e as chamadas aparecem aqui.</p>
            ) : visible.map((e) => (
              <div key={e.id} className="border-b border-zinc-900">
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                  className="w-full flex items-center gap-2 px-3 py-1 text-left hover:bg-zinc-900"
                >
                  <span className={e.ok ? 'text-emerald-400' : 'text-red-400'}>{e.ok ? 'OK ' : 'ERR'}</span>
                  <span className="text-zinc-200 truncate">{e.channel}</span>
                  <span className={`ml-auto tabular-nums ${e.ms > 3000 ? 'text-amber-400' : 'text-zinc-500'}`}>{e.ms} ms</span>
                </button>
                {!e.ok && <div className="px-3 pb-1 text-red-300 break-words">{e.threw ? 'exceção: ' : ''}{e.error}</div>}
                {expanded === e.id && (
                  <pre className="mx-3 mb-2 p-2 rounded bg-zinc-900 text-zinc-400 whitespace-pre-wrap break-all max-h-48 overflow-auto select-text">
{`args: ${JSON.stringify(e.args, null, 1)}\nresult: ${JSON.stringify(e.result, null, 1)}`}
                  </pre>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 px-3 py-2 border-t border-zinc-800">
            <button type="button" onClick={() => copy(summary())} className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200">Copiar resumo</button>
            <button type="button" onClick={() => { setEntries([]); void window.darkhub?.dev?.clearTrace(); }} className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200">Limpar</button>
            <span className="text-zinc-500 ml-2">{visible.length} visíveis</span>
            <button type="button" onClick={() => setOpen(false)} className="ml-auto px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200">Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// The IPC listener is registered once; it reads the current page through this module-level ref.
const currentPageRef = { current: 'home' };
