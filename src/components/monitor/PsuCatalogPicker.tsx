import React, { useState } from 'react';
import { AlertTriangle, RefreshCw, Search } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';
import type { OverlaySettings, PsuCatalogEntry, PsuCatalogGroup, PsuSearchResult } from '../../global';

const api = () => window.darkhub?.overlay;
const eff = (x: number) => x.toFixed(1);
const voltLabel = (v: string) => (v === '230' ? '230 V' : '115 V');

/**
 * Pick the real PSU from the 80 PLUS certified list (downloaded on request, see psuCatalog.js). Picking a unit sets the PSU
 * wattage and the 4-point curve (as a custom curve, which stays editable). The generic ratings stay as the fallback.
 */
export default function PsuCatalogPicker({ s, set }: { s: OverlaySettings; set: (p: Partial<OverlaySettings>) => void }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [res, setRes] = useState<PsuSearchResult | null>(null);
  const mains = s.mainsVoltage ?? null;

  const search = async (refresh = false, m = mains) => {
    if (query.trim().length < 2) return;
    setState('loading');
    const r = await api()?.psuSearch({ query, refresh, mains: m }).catch((e: unknown) => ({ ok: false, error: 'offline', detail: String((e as Error)?.message ?? e) }) as PsuSearchResult);
    setRes(r ?? { ok: false, error: 'offline' });
    setState('done');
  };

  const use = (g: PsuCatalogGroup, v: PsuCatalogEntry) => {
    set({
      psuWatts: v.watts, psuRating: 'custom', psuCustom: [...v.curve],
      psuModel: { id: v.id, brand: v.brand, model: v.model, watts: v.watts, rating: v.rating, category: v.category, voltage: v.voltage, curve: [...v.curve], approx10: v.approx10, certified: v.certified }
    });
  };

  const sel = s.psuModel;
  const errText = (e: string | null | undefined) => (e === 'catalog_format'
    ? t('pwr.cat.errFormat', 'A lista do 80 PLUS veio num formato que o app não reconhece. Nenhum dado foi usado.')
    : t('pwr.cat.errOffline', 'Não foi possível baixar a lista do 80 PLUS. Verifique a conexão e tente de novo; enquanto isso, use a certificação genérica.'));

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-[12.5px] text-zinc-300">{t('pwr.cat.title', 'Sua fonte no catálogo 80 PLUS')}</h4>
        <p className="dh-help max-w-[75ch]">{t('pwr.cat.help', 'Busca o modelo na lista pública de fontes certificadas do programa 80 PLUS (CLEAResult), com a eficiência medida a 10, 20, 50 e 100% de carga. Na primeira busca o app baixa a lista (cerca de 15 MB) e a guarda neste PC; nada é enviado.')}</p>
      </div>

      {sel ? (
        <p className="text-[12.5px] text-zinc-400">
          {t('pwr.cat.selected', 'Em uso')}: <span className="text-zinc-200">{sel.brand} {sel.model}</span> · <span className="font-mono">{sel.watts}</span> W · {sel.rating} · <span className="dh-tag">{sel.category}</span>
          {sel.certified ? <> · {t('pwr.cat.certified', 'certificada em')} <span className="font-mono">{sel.certified}</span></> : null}
          {mains && sel.voltage !== mains ? <span className="block text-amber-300">{t('pwr.cat.voltFallback', 'Esta fonte só tem dados certificados em {v}; na sua tomada a eficiência real costuma ser um pouco diferente.').replace('{v}', voltLabel(sel.voltage))}</span> : null}
          {sel.approx10 ? <span className="block text-zinc-500">{t('pwr.cat.approx10', 'O ponto de 10% não foi medido nesta certificação: é uma aproximação (ponto de 20% menos 5).')}</span> : null}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[12px] text-zinc-400">
          {t('pwr.cat.mains', 'Tensão da tomada')}
          <select className="dh-input" value={mains ?? ''} onChange={(e) => { const v = (e.target.value || null) as '115' | '230' | null; set({ mainsVoltage: v }); if (res?.ok) void search(false, v); }}>
            <option value="">{t('pwr.cat.mainsAsk', 'Escolha')}</option>
            <option value="115">{t('pwr.cat.mains115', '127 V (100 a 127 V)')}</option>
            <option value="230">{t('pwr.cat.mains230', '220 V (220 a 240 V)')}</option>
          </select>
        </label>
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void search(); }}>
          <label className="flex flex-col gap-1 text-[12px] text-zinc-400">
            {t('pwr.cat.query', 'Fabricante e modelo')}
            <input className="dh-input w-64" value={query} maxLength={80} placeholder={t('pwr.cat.placeholder', 'ex.: corsair rm850x')} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <button type="submit" className="dh-btn" disabled={query.trim().length < 2 || state === 'loading'}><Search size={14} />{t('pwr.cat.search', 'Buscar')}</button>
        </form>
      </div>
      {!mains ? <p className="dh-help">{t('pwr.cat.mainsWhy', 'Escolha a tensão da tomada: no Brasil há 127 V e 220 V, e a eficiência certificada muda com ela.')}</p> : null}

      {state === 'loading' ? (
        <div className="space-y-1.5" aria-busy="true" aria-label={t('pwr.cat.loading', 'Carregando a lista do 80 PLUS')}>
          {[0, 1, 2].map((i) => <div key={i} className="h-7 rounded-md bg-zinc-900 animate-pulse" />)}
          <p className="dh-help">{t('pwr.cat.loading', 'Carregando a lista do 80 PLUS')}</p>
        </div>
      ) : null}

      {state === 'done' && res && !res.ok ? (
        <p role="alert" className="flex items-center gap-2 text-[12.5px] text-red-400">
          <AlertTriangle size={14} className="shrink-0" />{errText(res.error)}
          <button type="button" className="dh-btn dh-btn-ghost dh-btn-sm" onClick={() => void search(true)}><RefreshCw size={13} />{t('pwr.cat.retry', 'Tentar de novo')}</button>
        </p>
      ) : null}

      {state === 'done' && res?.ok ? (
        <div className="space-y-2">
          {res.stale ? <p className="text-[12px] text-amber-300">{t('pwr.cat.stale', 'Sem conexão com o 80 PLUS: mostrando a lista guardada em {d}.').replace('{d}', res.fetchedAt ? new Date(res.fetchedAt).toLocaleDateString() : '')}</p> : null}
          {!res.results?.length ? (
            <p className="text-[12.5px] text-zinc-400">{t('pwr.cat.empty', 'Nenhuma fonte certificada encontrada. Tente só o fabricante e a potência (ex.: "corsair 850"), ou use a certificação genérica.')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead><tr className="text-left text-[11px] text-zinc-500">
                  <th className="font-normal pr-3">{t('pwr.cat.model', 'Modelo')}</th><th className="font-normal pr-3">W</th><th className="font-normal pr-3">80 PLUS</th>
                  <th className="font-normal pr-3">{t('pwr.cat.data', 'Dados')}</th><th className="font-normal pr-3 font-mono">10 / 20 / 50 / 100%</th><th />
                </tr></thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {res.results.map((g) => {
                    const v = g.variants.find((x) => x.id === g.pick?.id) ?? null;
                    const active = sel && v && sel.id === v.id;
                    return (
                      <tr key={g.key} className="align-top">
                        <td className="py-1.5 pr-3 text-zinc-200">{g.brand} <span className="text-zinc-400">{g.model}</span></td>
                        <td className="py-1.5 pr-3 font-mono text-zinc-300">{g.watts}</td>
                        <td className="py-1.5 pr-3 text-zinc-300">{(v ?? g.variants[0]).rating}</td>
                        <td className="py-1.5 pr-3 text-zinc-400">{g.variants.map((x) => <span key={x.id} className={`dh-tag mr-1.5 ${v?.id === x.id ? 'text-blue-300' : ''}`}>{voltLabel(x.voltage)}</span>)}</td>
                        <td className="py-1.5 pr-3 font-mono text-zinc-300">{(v ?? g.variants[0]).curve.map(eff).join(' / ')}{(v ?? g.variants[0]).approx10 ? <span className="text-amber-300/80">*</span> : null}
                          {g.pick?.fallback ? <span className="block font-sans text-[11px] text-amber-300">{t('pwr.cat.onlyVolt', 'só certificada em {v}').replace('{v}', voltLabel(v!.voltage))}</span> : null}
                        </td>
                        <td className="py-1.5 text-right">
                          <button type="button" className="dh-btn dh-btn-sm" disabled={!v || g.watts > 3000 || Boolean(active)} title={!mains ? t('pwr.cat.mainsWhy', 'Escolha a tensão da tomada: no Brasil há 127 V e 220 V, e a eficiência certificada muda com ela.') : undefined}
                            onClick={() => v && use(g, v)}>{active ? t('pwr.cat.inUse', 'Em uso') : t('pwr.cat.use', 'Usar')}</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {(res.total ?? 0) > (res.results?.length ?? 0) ? <p className="dh-help mt-1">{t('pwr.cat.more', 'Mostrando {a} de {b}. Refine a busca.').replace('{a}', String(res.results.length)).replace('{b}', String(res.total))}</p> : null}
            </div>
          )}
          <p className="dh-help">{t('pwr.cat.source', 'Fonte dos dados: programa 80 PLUS (CLEAResult), lista de {n} certificações baixada em {d}. O * no ponto de 10% indica aproximação.').replace('{n}', String(res.count ?? 0)).replace('{d}', res.fetchedAt ? new Date(res.fetchedAt).toLocaleDateString() : '')}</p>
        </div>
      ) : null}
    </div>
  );
}
