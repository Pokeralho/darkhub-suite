import React from 'react';
import { CheckCircle2, AlertTriangle } from '../icons';

export type Translate = (key: string, fallback?: string) => string;

export const SectionHead = ({ title, desc, actions }: { title: React.ReactNode; desc?: React.ReactNode; actions?: React.ReactNode }) => (
  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4">
    <div className="min-w-0">
      <h2 className="dh-section-title">{title}</h2>
      {desc ? <p className="dh-help mt-0.5 max-w-[75ch]">{desc}</p> : null}
    </div>
    {actions ? <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div> : null}
  </div>
);

export const StatRow = ({ items, cols = 3 }: { items: { label: string; value: React.ReactNode; sub?: React.ReactNode }[]; cols?: 2 | 3 | 4 }) => (
  <dl className={`grid grid-cols-1 ${cols === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : cols === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} rounded-lg border border-zinc-800/80 divide-y sm:divide-y-0 sm:divide-x divide-zinc-800/80`}>
    {items.map((it) => (
      <div key={it.label} className="px-4 py-3 min-w-0">
        <dt className="text-[11px] text-zinc-500">{it.label}</dt>
        <dd className="mt-1 text-[13px] text-zinc-100">{it.value}</dd>
        {it.sub ? <dd className="mt-0.5 text-[11px] text-zinc-500 truncate">{it.sub}</dd> : null}
      </div>
    ))}
  </dl>
);

export const OnOff = ({ on, onLabel, offLabel, warn }: { on: boolean; onLabel: string; offLabel: string; warn?: boolean }) => on ? (
  <span className="inline-flex items-center gap-1.5 text-emerald-400"><CheckCircle2 size={14} /> {onLabel}</span>
) : (
  <span className={`inline-flex items-center gap-1.5 ${warn ? 'text-amber-400' : 'text-zinc-400'}`}><AlertTriangle size={14} /> {offLabel}</span>
);

export const Skel = ({ w = 'w-16' }: { w?: string }) => <span className={`inline-block h-3.5 ${w} rounded bg-zinc-900 animate-pulse align-middle`} />;

export function fmtDate(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
}

export function fmtNum(n?: number | null) {
  return typeof n === 'number' ? n.toLocaleString() : '0';
}

/** Turns backend error codes into readable text. */
export function errorText(t: Translate, error?: string | null) {
  if (!error) return t('secx.err.generic', 'Falha na operação.');
  const known: Record<string, string> = {
    busy: t('secx.err.busy', 'Outra operação de segurança ainda está em andamento.'),
    'no-entries': t('secx.err.noEntries', 'Nenhuma lista ativada tem entradas. Ative e atualize ao menos uma lista.'),
    'defender-inactive': t('secx.err.defenderInactive', 'O Microsoft Defender não é o antivírus ativo neste PC; este item não se aplica.'),
    'not-effective': t('secx.err.notEffective', 'O comando rodou, mas o Windows não manteve a configuração (Proteção contra Adulteração ou política de grupo).'),
    'no-snapshot': t('secx.err.noSnapshot', 'Não há estado anterior salvo pelo DarkHub para restaurar.'),
    'hosts-not-written': t('secx.err.hostsNotWritten', 'O arquivo hosts não manteve a alteração (antivírus ou outra ferramenta pode tê-la revertido).'),
    'unterminated-block': t('secx.err.unterminated', 'O bloco do DarkHub no arquivo hosts está incompleto; corrija o arquivo manualmente antes.'),
    'windows-only': t('secx.err.windowsOnly', 'Disponível apenas no Windows.'),
    'rules-left': t('secx.err.rulesLeft', 'Algumas regras do firewall não foram removidas.'),
    'unknown-item': t('secx.err.generic', 'Falha na operação.'),
    'unknown-source': t('secx.err.generic', 'Falha na operação.')
  };
  const many = /^too-many:(\d+):(\d+)$/.exec(error);
  if (many) {
    return t('secx.err.tooMany', 'As listas ativadas somam {n} endereços; o limite no arquivo hosts é {max}. Acima disso o Windows fica sem DNS por minutos depois de cada mudança e a cada inicialização. Desative listas grandes e use um "DNS com proteção" para bloqueio amplo.')
      .replace('{n}', Number(many[1]).toLocaleString()).replace('{max}', Number(many[2]).toLocaleString());
  }
  return known[error] || error;
}
