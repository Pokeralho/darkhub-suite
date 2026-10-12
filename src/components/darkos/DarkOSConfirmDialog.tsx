import React, { useEffect, useState } from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
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
  useEffect(() => { if (open) setAcceptSecurity(false); }, [open]);
  if (!open) return null;
  const hasSecurity = securityItems.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg shrink-0 ${danger ? 'bg-red-500/10' : 'bg-[#3b82f6]/10'}`}>
            <AlertTriangle className={`w-5 h-5 ${danger ? 'text-red-400' : 'text-[#3b82f6]'}`} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
            {body ? <div className="mt-2 text-xs text-zinc-400 leading-relaxed">{body}</div> : null}
          </div>
        </div>

        {hasSecurity ? (
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
              <ShieldAlert className="w-4 h-4" />
              {t('darkos.security.title', 'Tweaks that reduce security')}
            </div>
            <p className="mt-2 text-[11.5px] text-zinc-300 leading-relaxed">
              {t('darkos.security.body', 'These items weaken Windows protections. Without your confirmation they will NOT be applied.')}
            </p>
            <ul className="mt-2 space-y-1 text-[11px] text-amber-200/90 list-disc pl-4">
              {securityItems.map((s) => <li key={s}>{s}</li>)}
            </ul>
            <label className="mt-3 flex items-start gap-2 text-[11.5px] text-zinc-200 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 accent-amber-500"
                checked={acceptSecurity}
                onChange={(e) => setAcceptSecurity(e.target.checked)}
              />
              <span>{t('darkos.security.accept', 'I understand the risk and want to apply the listed security tweaks')}</span>
            </label>
            {!acceptSecurity && !requireSecurity ? (
              <p className="mt-1.5 text-[11px] text-zinc-500">{t('darkos.security.skip', 'Security items will be skipped.')}</p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 border-zinc-700/60"
          >
            {t('darkos.confirm.cancel', 'Cancel')}
          </button>
          <button
            onClick={() => onConfirm({ confirmSecurity: hasSecurity && acceptSecurity })}
            disabled={Boolean(requireSecurity && hasSecurity && !acceptSecurity)}
            className={`disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg text-xs font-semibold text-white ${danger ? 'bg-red-600 hover:bg-red-500' : 'bg-[#3b82f6] hover:bg-blue-500'}`}
          >
            {confirmLabel || t('darkos.confirm.ok', 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DarkOSConfirmDialog;
