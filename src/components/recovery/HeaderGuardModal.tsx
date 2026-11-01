import React, { useEffect, useState } from 'react';
import type { RescuePlanResult, RescuePlanWrite } from '../../global';
import { AlertTriangle, CheckCircle, Loader2, XCircle } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';
type ApplyResult = { ok: boolean; error?: string; result?: RescuePlanResult['result'] };

/**
 * Shows exactly which sectors a repair will write (before vs after, changed bytes highlighted) and only applies it
 * after the user ticks the warning and, for a physical disk, types its number. The engine always saves the
 * overwritten sectors to a backup file before writing.
 */
export default function HeaderGuardModal({ title, plan, diskNumber, readOnly = false, onApply, onClose }: {
  title: string;
  readOnly?: boolean;
  plan: RescuePlanResult['plan'];
  diskNumber: number | null;
  onApply: (confirmDisk?: number) => Promise<ApplyResult>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [ack, setAck] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<ApplyResult | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const nothing = plan.writes.length === 0;
  const confirmed = ack && (diskNumber === null || typed.trim() === String(diskNumber));

  const apply = async () => {
    setBusy(true);
    try { setDone(await onApply(diskNumber ?? undefined)); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="dh-card dh-raised bg-zinc-950 w-full max-w-4xl max-h-[90vh] overflow-auto p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[16px] font-semibold text-zinc-50">{title}</h2>
            <p className="dh-help mt-0.5">{t('rescue.guard.sub', 'Revise o que será gravado. Nada foi alterado no disco ainda.')}</p>
          </div>
          <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" disabled={busy} onClick={onClose}>{t('rescue.close', 'Fechar')}</button>
        </div>

        {plan.notes.length ? (
          <ul className="space-y-1 text-[12.5px] text-zinc-300">
            {plan.notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        ) : null}

        {nothing ? <p className="text-[12.5px] text-emerald-300 flex items-center gap-2"><CheckCircle size={14} />{t('rescue.guard.nothing', 'Nada a gravar.')}</p> : (
          <div className="space-y-4">
            {plan.writes.map((w) => <WriteDiff key={`${w.lba}-${w.what}`} w={w} />)}
          </div>
        )}

        {!nothing && readOnly ? <p className="text-[12.5px] text-amber-300">{t('rescue.guard.readOnly', 'Este é o disco do Windows ou do boot: o DarkHub só mostra o plano e nunca grava nele.')}</p> : null}

        {!nothing && !readOnly && !done?.ok ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-3">
            <p className="flex items-start gap-2 text-[12.5px] text-amber-200">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              {t('rescue.guard.warn', 'Gravar setores de partição pode deixar o disco ilegível se o plano estiver errado. Antes de gravar, o DarkHub salva os setores atuais num arquivo de backup (.dhbk) que você pode restaurar na aba HeaderGuard.')}
            </p>
            <label className="flex items-center gap-2 text-[12.5px] text-zinc-200">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              {t('rescue.guard.ack', 'Revisei a diferença e quero gravar com backup')}
            </label>
            {diskNumber !== null ? (
              <label className="flex flex-wrap items-center gap-2 text-[12.5px] text-zinc-300">
                {t('rescue.guard.type', 'Digite o número do disco para confirmar')} <span className="font-mono text-zinc-50">{diskNumber}</span>
                <input className="dh-input w-20 font-mono" inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label={t('rescue.guard.type', 'Digite o número do disco para confirmar')} />
              </label>
            ) : null}
            <div className="flex items-center gap-2">
              <button type="button" className="dh-btn dh-btn-danger" disabled={!confirmed || busy} onClick={() => void apply()}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : null}
                {t('rescue.guard.apply', 'Gravar no disco')}
              </button>
            </div>
          </div>
        ) : null}

        {done ? (
          done.ok ? (
            <p className="flex items-start gap-2 text-[12.5px] text-emerald-300" role="status">
              <CheckCircle size={14} className="mt-0.5 shrink-0" />
              <span>
                {t('rescue.guard.done', 'Gravado e conferido. Backup dos setores anteriores:')}{' '}
                <span className="font-mono break-all text-zinc-200">{done.result?.backup_file}</span>
              </span>
            </p>
          ) : (
            <p role="alert" className="flex items-start gap-2 text-[12.5px] text-red-400"><XCircle size={14} className="mt-0.5 shrink-0" />{done.error}</p>
          )
        ) : null}
      </div>
    </div>
  );
}

function WriteDiff({ w }: { w: RescuePlanWrite }) {
  const { t } = useI18n();
  const before = w.before_hex.match(/../g) ?? [];
  const after = w.after_hex.match(/../g) ?? [];
  const rows = Math.ceil(Math.max(before.length, after.length) / 16);
  // Only rows that change, plus one row of context around them, to keep a 4 KiB sector readable.
  const changedRows = new Set<number>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 16; c++) {
      const i = r * 16 + c;
      if (before[i] !== after[i]) { changedRows.add(r - 1); changedRows.add(r); changedRows.add(r + 1); break; }
    }
  }
  const show = Array.from(changedRows).filter((r) => r >= 0 && r < rows).sort((a, b) => a - b);
  const grid = (bytes: string[], other: string[], tone: string) => (
    <div className="font-mono text-[11px] leading-[18px] overflow-x-auto">
      {show.map((r, k) => (
        <div key={r} className={`whitespace-pre ${k > 0 && show[k - 1] !== r - 1 ? 'mt-2' : ''}`}>
          <span className="text-zinc-600">{(r * 16).toString(16).toUpperCase().padStart(4, '0')} </span>
          {Array.from({ length: 16 }, (_, c) => {
            const i = r * 16 + c;
            const b = bytes[i] ?? '  ';
            return <span key={c} className={b !== other[i] ? tone : 'text-zinc-500'}>{b.toUpperCase()} </span>;
          })}
        </div>
      ))}
    </div>
  );
  return (
    <div className="rounded-lg border border-zinc-800/80 p-3 space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-[12.5px]">
        <span className="text-zinc-100">{w.what}</span>
        <span className="font-mono text-[11px] text-zinc-500">LBA {w.lba} · {w.sectors} {t('rescue.sectors', 'setores')} · {w.changed_bytes} {t('rescue.guard.bytesChanged', 'bytes mudam')}</span>
      </div>
      {show.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <div><p className="dh-label mb-1">{t('rescue.guard.before', 'Atual (corrompido)')}</p>{grid(before, after, 'text-red-300 bg-red-500/10')}</div>
          <div><p className="dh-label mb-1">{t('rescue.guard.after', 'Reconstruído')}</p>{grid(after, before, 'text-emerald-300 bg-emerald-500/10')}</div>
        </div>
      ) : <p className="dh-help">{t('rescue.guard.sameFirst', 'O primeiro setor não muda; a diferença está nos setores seguintes deste bloco.')}</p>}
    </div>
  );
}
