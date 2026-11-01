import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, Loader2, Search, Wrench, XCircle } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';

type Finding = { id: string; level: 'bad' | 'warn'; data: Record<string, string> };

const fill = (s: string, data: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => data[k] ?? '');

/**
 * "Why can't Windows Update download?": a read-only check (services, policies, hosts, DNS, ports, proxy, clock, disk,
 * firewall, DarkHub's own IP blocklist) with what to do for each problem, plus the Windows Update reset.
 */
export default function WuDiagnosis({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<'diag' | 'fix' | null>(null);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const diagnose = async () => {
    setBusy('diag'); setMsg(null);
    try {
      const r = await window.darkhub?.wintools?.diagnoseWu();
      if (r?.ok) setFindings(r.findings ?? []);
      else setMsg({ ok: false, text: r?.error || t('wudiag.fail', 'Could not run the check.') });
    } finally { setBusy(null); }
  };

  const fix = async () => {
    setBusy('fix'); setMsg(null);
    try {
      const r = await window.darkhub?.wintools?.run({ action: 'resetWindowsUpdate' });
      setMsg({ ok: r?.ok === true, text: r?.ok ? t('wudiag.fixed', 'Windows Update reset. Checking again...') : (r?.error || t('wudiag.fail', 'Could not run the check.')) });
      if (r?.ok) await diagnose();
    } finally { setBusy(null); }
  };

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="dh-btn dh-btn-sm" disabled={busy !== null} onClick={() => void diagnose()}>
          {busy === 'diag' ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          {t('wudiag.run', 'Diagnose Windows Update')}
        </button>
        {findings !== null ? (
          <button type="button" className="dh-btn dh-btn-sm" disabled={busy !== null} onClick={() => void fix()} title={t('wudiag.fixHelp', '')}>
            {busy === 'fix' ? <Loader2 size={13} className="animate-spin" /> : <Wrench size={13} />}
            {t('wudiag.fix', 'Reset Windows Update')}
          </button>
        ) : null}
      </div>
      {findings && !findings.length ? (
        <p className="flex items-start gap-2 text-[12.5px] text-emerald-300"><CheckCircle size={14} className="mt-0.5 shrink-0" />{t('wudiag.clean', '')}</p>
      ) : null}
      {findings?.length ? (
        <ul className="space-y-2" aria-live="polite">
          {findings.map((f) => (
            <li key={f.id} className="flex items-start gap-2 text-[12.5px]">
              {f.level === 'bad' ? <XCircle size={14} className="mt-0.5 shrink-0 text-red-400" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-300" />}
              <span>
                <span className="text-zinc-100">{fill(t(`wudiag.${f.id}`, f.id), f.data)}</span>
                <span className="block text-zinc-400">{fill(t(`wudiag.${f.id}.fix`, ''), f.data)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {msg ? <p role="status" className={`text-[12.5px] ${msg.ok ? 'text-emerald-300' : 'text-red-400'}`}>{msg.text}</p> : null}
    </div>
  );
}
