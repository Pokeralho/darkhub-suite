import React from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, ShieldCheck } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';
import type { HubInspect } from '../../global';

export const hubText = (n: string | Record<string, string> | undefined, lang: string) => (typeof n === 'string' ? n : n ? n[lang] || n['pt-BR'] || n['en-US'] || '' : '');

export function RiskBadge({ risk }: { risk?: string }) {
  const { t } = useI18n();
  const cls = risk === 'high' ? 'text-red-300 border-red-400/40' : risk === 'medium' ? 'text-amber-300 border-amber-400/40' : 'text-emerald-300 border-emerald-400/40';
  return <span className={`inline-flex items-center h-6 px-2 rounded border text-[11.5px] font-mono ${cls}`}>{t(`hub.risk.${risk}`, risk || '')}</span>;
}

/** Where a package came from: a local file, or the Hub with its signed tier. */
export function TierBadge({ tier }: { tier?: string }) {
  const { t } = useI18n();
  if (!tier) return <span className="inline-flex items-center h-6 px-2 rounded border border-zinc-700 text-[11.5px] text-zinc-400">{t('hub.tierLocal', 'arquivo local · não revisado')}</span>;
  const cls = tier === 'official' ? 'text-blue-200 border-blue-400/50' : tier === 'verified' ? 'text-emerald-200 border-emerald-400/40' : 'text-zinc-300 border-zinc-600';
  return <span className={`inline-flex items-center gap-1 h-6 px-2 rounded border text-[11.5px] ${cls}`}>{tier !== 'community' ? <ShieldCheck size={11} /> : null}{t(`hub.tier.${tier}`, tier)}</span>;
}

/** The dry run of a package on this PC: what changes, today's value, the value after. */
export default function HubPreview({ view, tier, footer }: { view: HubInspect; tier?: string; footer?: React.ReactNode }) {
  const { t, lang } = useI18n();
  if (!view.ok) {
    return (
      <div className="p-4 space-y-2">
        <p className="flex items-center gap-2 text-[13px] text-amber-300"><AlertTriangle size={14} />{t('hub.invalid', 'Este pacote não pode ser instalado')}</p>
        {view.error ? <p className="text-[12.5px] text-zinc-300">{view.error}</p> : null}
        <ul className="text-[12.5px] text-zinc-300 space-y-1">{(view.errors || []).map((e, i) => <li key={i}><code className="text-zinc-400">{e.path}</code> {e.message}</li>)}</ul>
        {footer}
      </div>
    );
  }
  const pkg = view.pkg!;
  return (
    <>
      <header className="px-4 py-3 border-b border-zinc-800 space-y-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-zinc-50">{pkg.name}</p>
            <p className="text-[12px] text-zinc-500 font-mono">{pkg.id} · v{pkg.version} · {t(`hub.type.${pkg.type}`, pkg.type)} · {t('hub.by', 'por')} @{pkg.author.github}</p>
          </div>
          <div className="flex items-center gap-2"><RiskBadge risk={view.risk} /><TierBadge tier={tier} /></div>
        </div>
        {pkg.description ? <p className="text-[13px] text-zinc-300 max-w-[80ch]">{pkg.description}</p> : null}
        {!view.applicable ? <p className="text-[12.5px] text-amber-300 flex items-center gap-2"><AlertTriangle size={13} />{t('hub.notFor', 'Não é para este PC')}: {view.notFor}</p> : null}
        {view.installed ? <p className="text-[12.5px] text-emerald-300 flex items-center gap-2"><CheckCircle2 size={13} />{t('hub.isInstalled', 'Instalado')} (v{view.installed.version})</p> : null}
      </header>
      {pkg.type === 'extension' ? (
        <div className="px-4 py-3 space-y-3">
          <p className="text-[12.5px] text-zinc-400">{t('ext.previewHint', 'Extensão: código que roda isolado dentro do DarkHub. Ela não muda o Windows; só pode pedir o que está listado abaixo.')}</p>
          <ul className="space-y-1.5">
            {view.rows!.map((r, i) => (
              <li key={i} className="flex flex-wrap gap-x-2 text-[12.5px]">
                <span className="text-zinc-500 w-36 shrink-0">{r.group}</span>
                <span className="text-zinc-100">{r.title}</span>
                {r.target ? <code className="text-zinc-400 font-mono text-[11.5px] break-all">{r.target}</code> : null}
              </li>
            ))}
          </ul>
          {view.findings?.length ? (
            <div className="rounded-md border border-amber-400/30 bg-amber-400/5 p-3">
              <p className="text-[12.5px] text-amber-200 mb-1.5">{t('ext.findings', 'A verificação automática encontrou pontos para olhar com atenção')}:</p>
              <ul className="space-y-0.5 text-[12px] text-zinc-300">
                {view.findings.slice(0, 12).map((f, i) => <li key={i}><code className="font-mono text-[11px] text-zinc-500">{f.file}:{f.line}</code> {lang === 'en-US' ? f.message.en : f.message.pt}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px] min-w-[640px]">
          <thead><tr className="text-left text-[11px] uppercase tracking-wide text-zinc-500 border-b border-zinc-800">
            <th className="px-4 py-2 font-medium">{t('hub.col.what', 'O que muda')}</th><th className="px-2 py-2 font-medium">{t('hub.col.now', 'Hoje')}</th><th className="px-2 py-2 font-medium">{t('hub.col.after', 'Depois')}</th><th className="px-4 py-2 font-medium">{t('hub.col.status', 'Situação')}</th>
          </tr></thead>
          <tbody>
            {view.rows!.map((r, i) => (
              <tr key={`${r.index}-${i}`} className="border-b border-zinc-800/60 last:border-b-0 align-top">
                <td className="px-4 py-2 min-w-0"><span className="text-zinc-500">{r.group}</span><span className="block text-zinc-100 break-all">{r.title}</span>{r.note ? <span className="block text-zinc-500">{r.note}</span> : null}</td>
                <td className="px-2 py-2 font-mono text-zinc-400 break-all">{r.kind === 'op' && r.current == null ? '—' : r.current == null ? t('hub.absent', '(não existe)') : r.kind === 'tweak' || r.kind === 'op' ? (r.current === 'on' ? t('hub.on', 'ligado') : t('hub.off', 'desligado')) : r.current}</td>
                <td className="px-2 py-2 font-mono text-zinc-200 break-all">{r.kind === 'tweak' || (r.kind === 'op' && !r.target) ? t('hub.on', 'ligado') : r.target}</td>
                <td className="px-4 py-2 whitespace-nowrap">{r.missing ? <span className="text-zinc-500">{t('hub.missing', 'não existe neste Windows, será pulada')}</span> : r.done ? <span className="text-emerald-300">{t('hub.already', 'já está assim')}</span> : <span className="text-blue-300">{t('hub.willChange', 'vai mudar')}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      {view.skipped?.length ? (
        <div className="px-4 py-3 border-t border-zinc-800">
          <p className="text-[12px] text-zinc-500 mb-1">{t('hub.skipped', 'Não se aplicam a este PC')}</p>
          <ul className="text-[12px] text-zinc-400 space-y-0.5">{view.skipped.map((s) => <li key={s.index}>{s.group}: {s.title} <span className="text-zinc-600">({s.reason})</span></li>)}</ul>
        </div>
      ) : null}
      {pkg.evidence.length ? (
        <div className="px-4 py-3 border-t border-zinc-800 flex flex-wrap gap-3 text-[12px]">
          <span className="text-zinc-500">{t('hub.evidence', 'Evidências')}:</span>
          {pkg.evidence.map((u) => <button key={u} type="button" className="text-blue-300 hover:underline inline-flex items-center gap-1" onClick={() => void window.darkhub?.shell?.openExternal(u)}><ExternalLink size={11} />{u.replace(/^https:\/\//, '').slice(0, 50)}</button>)}
        </div>
      ) : null}
      {footer}
    </>
  );
}
