import React, { useMemo, useState } from 'react';
import {
  CheckCircle, ChevronDown, ChevronUp, Copy, Download, Eye, EyeOff, ExternalLink, FolderOpen,
  Loader2, Search, XCircle
} from '../icons';
import { useI18n } from '../../i18n/I18nProvider';
import type { PsToolResult } from '../../global';
import { cellText, columnsOf, rowsToCsv } from './psSchema';

type View = 'table' | 'json' | 'csv';
const MAX_RENDER = 500;
const api = () => window.darkhub?.powershell;

interface Props {
  result: PsToolResult;
  toolId: string;
  toolName: string;
  /** Row action (winget upgrade / Wi-Fi reveal) handled by the parent. */
  rowAction?: 'wingetUpgrade' | 'wifiKey';
  onUpgrade?: (id: string | null) => void;
  busy?: boolean;
}

export default function ResultView({ result, toolId, toolName, rowAction, onUpgrade, busy }: Props) {
  const { t } = useI18n();
  const [view, setView] = useState<View>('table');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 } | null>(null);
  const [exportFmt, setExportFmt] = useState<'csv' | 'json' | 'txt'>('csv');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<string | null>(null);

  const rows = result.rows || [];
  const cols = useMemo(() => columnsOf(rows), [rows]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = q ? rows.filter((r) => cols.some((c) => cellText(r[c]).toLowerCase().includes(q))) : rows;
    if (sort) {
      list = [...list].sort((a, b) => {
        const x = a[sort.col]; const y = b[sort.col];
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * sort.dir;
        return cellText(x).localeCompare(cellText(y), undefined, { numeric: true }) * sort.dir;
      });
    }
    return list;
  }, [rows, cols, query, sort]);

  const flash = (ok: boolean, text: string) => { setNote({ ok, text }); window.setTimeout(() => setNote(null), 4000); };
  const textBody = () => {
    if (result.kind !== 'table') return result.text || '';
    return view === 'json' ? JSON.stringify(filtered, null, 2) : rowsToCsv(filtered);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.kind === 'table' && view === 'table' ? rowsToCsv(filtered) : textBody());
      flash(true, t('psx.result.copied', 'Copiado.'));
    } catch { flash(false, t('psx.result.copyFail', 'Não foi possível copiar.')); }
  };
  const doExport = async () => {
    const r = await api()?.exportResult(result.kind === 'table'
      ? { rows: filtered, format: exportFmt, defaultName: toolName }
      : { text: result.text || '', format: 'txt', defaultName: toolName });
    if (r?.ok) flash(true, t('psx.result.exported', 'Exportado para') + ' ' + r.path);
    else if (r && !r.canceled) flash(false, r.error || t('psx.result.exportFail', 'Falha ao exportar.'));
  };
  const reveal = async (name: string) => {
    setRevealing(name);
    try {
      const r = await api()?.wifiKey({ name });
      if (r?.ok && typeof r.key === 'string') setKeys((k) => ({ ...k, [name]: r.key as string }));
      else flash(false, r?.error || t('psx.wifi.fail', 'Não foi possível revelar a senha.'));
    } finally { setRevealing(null); }
  };

  const header = (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800/80 flex-wrap" aria-live="polite">
      {result.ok ? <CheckCircle size={14} className="text-emerald-400" /> : <XCircle size={14} className="text-red-400" />}
      <h3 className="dh-section-title">{t('psx.result.title', 'Resultado')}</h3>
      {result.kind === 'table' ? (
        <span className="text-[11.5px] text-zinc-500 font-mono">
          {filtered.length === rows.length ? rows.length : `${filtered.length}/${rows.length}`} {t('psx.result.rows', 'linhas')}
        </span>
      ) : null}
      {typeof result.durationMs === 'number' ? <span className="text-[11.5px] text-zinc-600 font-mono">{(result.durationMs / 1000).toFixed(1)} s</span> : null}
      <div className="ml-auto flex items-center gap-2 flex-wrap">
        {rowAction === 'wingetUpgrade' && rows.length > 0 && onUpgrade ? (
          <button className="dh-btn dh-btn-sm" disabled={busy} onClick={() => onUpgrade(null)}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}{t('psx.winget.upgradeAll', 'Atualizar todos')}
          </button>
        ) : null}
        {result.kind === 'table' ? (
          <div role="tablist" aria-label={t('psx.result.view', 'Visualização')} className="inline-flex rounded-md border border-zinc-800 overflow-hidden">
            {(['table', 'json', 'csv'] as View[]).map((v) => (
              <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
                className={`h-7 px-2.5 text-[11.5px] ${view === v ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}>
                {t(`psx.result.view.${v}`, v.toUpperCase())}
              </button>
            ))}
          </div>
        ) : null}
        <button className="dh-btn dh-btn-sm" onClick={copy} aria-label={t('psx.result.copy', 'Copiar')}><Copy size={13} />{t('psx.result.copy', 'Copiar')}</button>
        {result.kind === 'table' ? (
          <select aria-label={t('psx.result.format', 'Formato')} className="dh-input !h-7 text-[11.5px]" value={exportFmt} onChange={(e) => setExportFmt(e.target.value as 'csv' | 'json' | 'txt')}>
            <option value="csv">CSV</option><option value="json">JSON</option><option value="txt">TXT</option>
          </select>
        ) : null}
        <button className="dh-btn dh-btn-sm" onClick={doExport}><Download size={13} />{t('psx.result.export', 'Exportar')}</button>
      </div>
    </div>
  );

  return (
    <section className="dh-card overflow-hidden animate-in">
      {header}
      {note ? <div role="status" className={`px-4 pt-2 text-[12px] ${note.ok ? 'text-emerald-400' : 'text-red-300'} break-all`}>{note.text}</div> : null}
      {result.error ? <div className="px-4 pt-3 text-[12.5px] text-red-300 break-words whitespace-pre-wrap">{result.error}</div> : null}

      {result.kind === 'file' && result.file ? (
        <div className="px-4 pt-3 flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[12px] text-zinc-300 break-all">{result.file}</span>
          <button className="dh-btn dh-btn-sm" onClick={() => api()?.openReport({ path: result.file as string })}><ExternalLink size={13} />{t('psx.result.open', 'Abrir relatório')}</button>
          <button className="dh-btn dh-btn-sm" onClick={() => api()?.revealFile({ path: result.file as string })}><FolderOpen size={13} />{t('psx.result.reveal', 'Mostrar na pasta')}</button>
        </div>
      ) : null}

      {result.kind === 'table' ? (
        view === 'table' ? (
          <>
            {rows.length > 8 ? (
              <div className="px-4 pt-3">
                <div className="relative max-w-sm">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input className="dh-input w-full !pl-8" placeholder={t('psx.result.filter', 'Filtrar resultados...')} value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
              </div>
            ) : null}
            {rows.length === 0 ? (
              <p className="px-4 py-6 text-[12.5px] text-zinc-500">{result.raw ? <span className="block font-mono whitespace-pre-wrap text-[11.5px]">{result.raw}</span> : t('psx.result.empty', 'Nada encontrado com esses filtros.')}</p>
            ) : (
              <div className="mt-2 max-h-[460px] overflow-auto custom-scrollbar">
                <table className="w-full text-[12px]">
                  <thead className="sticky top-0 bg-zinc-950/95 backdrop-blur">
                    <tr className="border-b border-zinc-800/80 text-[11px] text-zinc-500">
                      {cols.map((c) => (
                        <th key={c} className="text-left px-3 py-2 font-medium whitespace-nowrap">
                          <button className="inline-flex items-center gap-1 hover:text-zinc-200" onClick={() => setSort((s) => (s?.col === c ? { col: c, dir: s.dir === 1 ? -1 : 1 } : { col: c, dir: 1 }))}>
                            {t(`psx.col.${c}`, c)}
                            {sort?.col === c ? (sort.dir === 1 ? <ChevronUp size={11} /> : <ChevronDown size={11} />) : null}
                          </button>
                        </th>
                      ))}
                      {rowAction ? <th className="px-3 py-2" /> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {filtered.slice(0, MAX_RENDER).map((r, i) => {
                      const wifiName = rowAction === 'wifiKey' ? cellText(r.Name) : '';
                      return (
                        <tr key={i} className="hover:bg-zinc-900/50 align-top">
                          {cols.map((c) => (
                            <td key={c} className="px-3 py-1.5 text-zinc-300 max-w-[420px] break-words font-mono text-[11.5px]">{cellText(r[c])}</td>
                          ))}
                          {rowAction === 'wingetUpgrade' && onUpgrade ? (
                            <td className="px-3 py-1 text-right whitespace-nowrap">
                              <button className="dh-btn dh-btn-sm" disabled={busy} onClick={() => onUpgrade(cellText(r.Id))}>{t('psx.winget.upgrade', 'Atualizar')}</button>
                            </td>
                          ) : null}
                          {rowAction === 'wifiKey' ? (
                            <td className="px-3 py-1 text-right whitespace-nowrap">
                              {keys[wifiName] !== undefined ? (
                                <span className="inline-flex items-center gap-2">
                                  <span className="font-mono text-[12px] text-amber-200 select-all">{keys[wifiName]}</span>
                                  <button className="dh-btn dh-btn-sm" aria-label={t('psx.wifi.hide', 'Ocultar')} onClick={() => setKeys((k) => { const n = { ...k }; delete n[wifiName]; return n; })}><EyeOff size={13} /></button>
                                </span>
                              ) : (
                                <button className="dh-btn dh-btn-sm" disabled={revealing !== null} onClick={() => reveal(wifiName)}>
                                  {revealing === wifiName ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}{t('psx.wifi.reveal', 'Revelar senha')}
                                </button>
                              )}
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filtered.length > MAX_RENDER ? (
                  <p className="px-4 py-2 text-[11.5px] text-zinc-500">{t('psx.result.truncated', 'Mostrando as primeiras {n} linhas. Exporte para ver tudo.').replace('{n}', String(MAX_RENDER))}</p>
                ) : null}
              </div>
            )}
          </>
        ) : (
          <pre className="mt-2 max-h-[460px] overflow-auto bg-zinc-950 px-4 py-3 text-[11.5px] leading-[1.6] font-mono text-zinc-400 whitespace-pre-wrap break-words">{textBody()}</pre>
        )
      ) : result.text ? (
        <pre className="mt-2 max-h-[460px] overflow-auto bg-zinc-950 px-4 py-3 text-[11.5px] leading-[1.6] font-mono text-zinc-400 whitespace-pre-wrap break-words">{result.text}</pre>
      ) : <div className="pb-3" />}
    </section>
  );
}
