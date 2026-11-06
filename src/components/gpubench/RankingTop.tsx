import React, { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import type { GpuRankRow } from '../../global';

const TESTS = ['total', 'raster', 'rt'];

/** The top of the public ranking, read from the Hub. No account needed. */
export default function RankingTop({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useI18n();
  const [test, setTest] = useState('total');
  const [rows, setRows] = useState<GpuRankRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setRows(null);
    setFailed(false);
    void window.darkhub?.gpubench.ranking({ test }).then((r) => {
      if (!live) return;
      if (r.ok) setRows(r.items ?? []);
      else setFailed(true);
    }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [test]);

  const label = (k: string) => (k === 'rt' ? t('gpubench.rt', 'Ray tracing') : k === 'raster' ? t('gpubench.raster', 'Rasterização') : t('gpubench.top.total', 'Geral'));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="dh-label">{t('gpubench.top', 'Melhores do ranking')}</h3>
        <div className="flex gap-1 ml-auto" role="tablist">
          {TESTS.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={test === k} onClick={() => setTest(k)}
              className={`dh-btn dh-btn-sm ${test === k ? '' : 'dh-btn-ghost'}`}>{label(k)}</button>
          ))}
        </div>
      </div>
      {failed ? <p className="dh-help">{t('gpubench.top.offline', 'Não foi possível carregar o ranking agora.')}</p>
        : rows == null ? <div className="space-y-1.5">{[0, 1, 2].map((i) => <div key={i} className="h-7 rounded-md bg-zinc-900 animate-pulse" />)}</div>
        : rows.length === 0 ? <p className="dh-help">{t('gpubench.top.empty', 'Ninguém entrou no ranking ainda.')}</p>
        : (
          <ol className="divide-y divide-zinc-900">
            {rows.map((r) => (
              <li key={r.runId}>
                <button type="button" onClick={() => onOpen(r.runId)} className="w-full flex items-center gap-3 py-1.5 text-left text-[12.5px] min-w-0 hover:text-zinc-100">
                  <span className={`font-mono tabular-nums w-6 shrink-0 ${r.rank === 1 ? 'text-blue-400' : 'text-zinc-500'}`}>{r.rank}</span>
                  <span className="text-zinc-200 truncate w-36 shrink-0">{r.login}</span>
                  <span className="text-zinc-500 truncate flex-1">{r.gpu}</span>
                  <span className="font-mono tabular-nums text-zinc-100 shrink-0">{Math.round(r.score).toLocaleString()}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
    </div>
  );
}
