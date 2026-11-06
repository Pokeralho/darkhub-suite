import React, { useEffect, useState } from 'react';
import type { PartitionApplyResult, PartitionPlan } from '../../global';
import PartitionMapBar from './PartitionMapBar';
import { api } from './rescueUtils';
import { layoutOf } from './partitionLayout';
import { AlertTriangle, CheckCircle, Loader2, XCircle } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';

/** Before and after of one operation. It only runs once the user has typed the disk's name (and ticked data loss). */
export default function PartitionPlanModal({ title, plan, onClose, onDone }: { title: string; plan: PartitionPlan; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [typed, setTyped] = useState('');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<PartitionApplyResult | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const blocked = plan.blockers.length > 0;
  const ready = typed === plan.diskName && (!plan.dataLoss || ack);
  const finished = !!done;

  const apply = async () => {
    if (!plan.planId) return;
    setBusy(true);
    try {
      const r = await api()?.partitionApply({ planId: plan.planId, confirmName: typed, ack });
      setDone(r ?? { ok: false, code: 'failed' });
      onDone();
    } finally { setBusy(false); }
  };

  const bar = (label: string, disk: PartitionPlan['before']) => (
    <div>
      <p className="dh-label mb-1">{label}</p>
      <PartitionMapBar layout={layoutOf(disk)} totalSectors={disk.size / disk.sectorSize} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="dh-card dh-raised bg-zinc-950 w-full max-w-3xl max-h-[90vh] overflow-auto p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[16px] font-semibold text-zinc-50">{title}</h2>
            <p className="dh-help mt-0.5">{t('rescue.part.modal.sub', 'Nada foi alterado ainda.')} <span className="text-zinc-300">{plan.diskName}</span></p>
          </div>
          <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" disabled={busy} onClick={onClose}>{t('rescue.close', 'Fechar')}</button>
        </div>

        {bar(t('rescue.part.modal.before', 'Antes'), plan.before)}
        {bar(t('rescue.part.modal.after', 'Depois'), plan.after)}

        {blocked ? (
          <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 space-y-1">
            <p className="text-[12.5px] font-medium text-red-300">{t('rescue.part.modal.blocked', 'Esta operação foi recusada:')}</p>
            <ul className="space-y-1 text-[12.5px] text-red-200">
              {plan.blockers.map((b) => <li key={b}>{t(`rescue.part.block.${b}`, b)}</li>)}
            </ul>
          </div>
        ) : null}

        {!blocked && !finished ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-3">
            <ul className="space-y-1">
              {plan.warnings.map((w) => <li key={w} className="flex items-start gap-2 text-[12.5px] text-amber-200"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{t(`rescue.part.warn.${w}`, w)}</li>)}
            </ul>
            {plan.dataLoss ? (
              <label className="flex items-center gap-2 text-[12.5px] text-zinc-200">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                {t('rescue.part.modal.ack', 'Entendo que os dados desta partição serão perdidos')}
              </label>
            ) : null}
            <label className="block space-y-1 text-[12.5px] text-zinc-300">
              <span>{t('rescue.part.modal.type', 'Digite o nome do disco para confirmar:')} <span className="font-mono text-zinc-50">{plan.diskName}</span></span>
              <input className="dh-input w-full font-mono" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} aria-label={t('rescue.part.modal.type', 'Digite o nome do disco para confirmar:')} />
            </label>
            <button type="button" className="dh-btn dh-btn-danger" disabled={!ready || busy} onClick={() => void apply()}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : null}
              {busy ? t('rescue.part.modal.running', 'Executando. Não desligue o PC.') : t('rescue.part.modal.apply', 'Executar no disco')}
            </button>
          </div>
        ) : null}

        {done ? (
          done.ok ? (
            <p role="status" className="flex items-start gap-2 text-[12.5px] text-emerald-300">
              <CheckCircle size={14} className="mt-0.5 shrink-0" />
              <span>
                {t('rescue.part.modal.done', 'Concluído e conferido no disco.')}
                {done.backupFile ? <> {t('rescue.part.modal.backup', 'Backup da tabela:')} <span className="font-mono break-all text-zinc-200">{done.backupFile}</span></> : null}
              </span>
            </p>
          ) : (
            <div role="alert" className="flex items-start gap-2 text-[12.5px] text-red-400">
              <XCircle size={14} className="mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p>{t(`rescue.part.err.${done.code ?? 'failed'}`, done.code ?? 'failed')}</p>
                {done.blockers?.map((b) => <p key={b}>{t(`rescue.part.block.${b}`, b)}</p>)}
                {done.error ? <p className="font-mono text-[11.5px] text-zinc-400 break-all">{done.error}</p> : null}
                {done.backupFile ? <p className="text-zinc-300">{t('rescue.part.modal.backup', 'Backup da tabela:')} <span className="font-mono break-all">{done.backupFile}</span></p> : null}
              </div>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
