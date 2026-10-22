import React, { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, ShieldAlert } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';

export interface DarkOSConfirmDialogProps {
  open: boolean;
  title: string;
  body?: React.ReactNode;
  /** Security-related item descriptions. When present, the user must tick an (unchecked) box to include them. */
  securityItems?: string[];
  confirmLabel?: string;
  danger?: boolean;
  /** When true, Confirm stays disabled until the security box is ticked (single security item). */
  requireSecurity?: boolean;
  onCancel: () => void;
  onConfirm: (opts: { confirmSecurity: boolean }) => void;
}

export const DarkOSConfirmDialog: React.FC<DarkOSConfirmDialogProps> = ({
  open, title, body, securityItems = [], confirmLabel, danger, requireSecurity, onCancel, onConfirm
}) => {
  const { t } = useI18n();
  // Never pre-checked: resets every time the dialog opens.
  const [acceptSecurity, setAcceptSecurity] = useState(false);
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Callers pass inline handlers; keep the latest one without re-running the open effect (focus would jump).
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  useEffect(() => { if (open) setAcceptSecurity(false); }, [open]);
  // Keyboard basics: focus the safe action on open, Escape cancels.
  useEffect(() => {
    if (!open) return undefined;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancelRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;
  const hasSecurity = securityItems.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-in" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl dh-raised">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className={`shrink-0 mt-0.5 ${danger ? 'text-red-400' : 'text-zinc-400'}`} />
          <div className="min-w-0 flex-1">
            <h3 id={titleId} className="text-[14px] font-semibold text-zinc-100 tracking-[-0.01em]">{title}</h3>
            {body ? <div className="mt-2 text-[12.5px] text-zinc-400 leading-relaxed">{body}</div> : null}
          </div>
        </div>

        {hasSecurity ? (
          <div className="mt-4 rounded-lg border border-amber-500/25 p-3">
            <div className="flex items-center gap-2 text-[12.5px] font-semibold text-amber-300">
              <ShieldAlert size={14} />
              {t('darkos.security.title', 'Tweaks that reduce security')}
            </div>
            <p className="mt-2 dh-help text-zinc-400">
              {t('darkos.security.body', 'These items weaken Windows protections. Without your confirmation they will NOT be applied.')}
            </p>
            <ul className="mt-2 divide-y divide-zinc-800/80 text-[12px] text-zinc-300">
              {securityItems.map((s) => <li key={s} className="py-1.5">{s}</li>)}
            </ul>
            <label className="mt-3 flex items-start gap-2 text-[12px] text-zinc-200 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={acceptSecurity}
                onChange={(e) => setAcceptSecurity(e.target.checked)}
              />
              <span>{t('darkos.security.accept', 'I understand the risk and want to apply the listed security tweaks')}</span>
            </label>
            {!acceptSecurity && !requireSecurity ? (
              <p className="mt-1.5 dh-help">{t('darkos.security.skip', 'Security items will be skipped.')}</p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancelRef} onClick={onCancel} className="dh-btn">
            {t('darkos.confirm.cancel', 'Cancel')}
          </button>
          <button
            onClick={() => onConfirm({ confirmSecurity: hasSecurity && acceptSecurity })}
            disabled={Boolean(requireSecurity && hasSecurity && !acceptSecurity)}
            className={`dh-btn ${danger ? 'dh-btn-danger' : 'dh-btn-primary'}`}
          >
            {confirmLabel || t('darkos.confirm.ok', 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DarkOSConfirmDialog;
