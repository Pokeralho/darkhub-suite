import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, ExternalLink, Loader2, RefreshCw, Wrench, XCircle } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';

type FeatureState = 'enabled' | 'disabled' | 'pending' | 'unavailable';

const FEATURES = ['wsl', 'vmplatform', 'hyperv', 'sandbox', 'netfx3', 'legacymedia', 'nfs', 'openssh'] as const;
const REPAIRS = ['resetWindowsUpdate', 'repairWinget', 'cleanupComponentStore'] as const;
/** Advanced actions: each one asks for confirmation first. */
const ADVANCED = ['autologon', 'removeEdge', 'installEdge', 'decryptSystemDrive'] as const;
const PANELS = ['control', 'programs', 'computer', 'devices', 'disks', 'services', 'events', 'network', 'power', 'printers',
  'sound', 'mouse', 'system', 'datetime', 'region', 'firewall', 'security', 'restore', 'msconfig'] as const;

const api = () => window.darkhub?.wintools;

/** Windows features, repairs, advanced actions and classic panels (Optimizer > Windows tab). */
export default function WindowsToolsPanel() {
  const { t } = useI18n();
  const [features, setFeatures] = useState<Record<string, FeatureState> | null>(null);
  const [loadingFeatures, setLoadingFeatures] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const loadFeatures = useCallback(async () => {
    setLoadingFeatures(true);
    try {
      const r = await api()?.listFeatures();
      if (r?.ok && r.features) setFeatures(r.features);
      else setResult({ ok: false, text: r?.error || t('wintools.readFail', 'Could not read Windows features.') });
    } finally { setLoadingFeatures(false); }
  }, [t]);

  useEffect(() => { loadFeatures(); }, [loadFeatures]);

  const exec = async (key: string, fn: () => Promise<any>) => {
    setBusy(key);
    setResult(null);
    try {
      const r = await fn();
      const reboot = r?.requiresReboot ? ` ${t('wintools.reboot', 'Restart Windows to finish.')}` : '';
      setResult({ ok: r?.ok === true, text: r?.ok ? `${r.msg || t('wintools.done', 'Done and verified.')}${reboot}` : (r?.error || t('wintools.fail', 'Failed.')) });
    } catch (e: any) {
      setResult({ ok: false, text: e?.message ?? String(e) });
    } finally { setBusy(null); }
  };

  const toggleFeature = (id: string, enable: boolean) => exec(`f:${id}`, async () => {
    const r = await api()!.setFeature({ id, enable });
    await loadFeatures();
    return r;
  });

  const stateLabel = (s: FeatureState | undefined) => {
    if (!s) return { text: t('wintools.state.loading', 'Reading...'), cls: 'text-zinc-500', dot: 'bg-zinc-700' };
    if (s === 'enabled') return { text: t('wintools.state.enabled', 'Enabled'), cls: 'text-emerald-400', dot: 'bg-emerald-400' };
    if (s === 'pending') return { text: t('wintools.state.pending', 'Restart pending'), cls: 'text-amber-300', dot: 'bg-amber-300' };
    if (s === 'unavailable') return { text: t('wintools.state.unavailable', 'Not in this edition'), cls: 'text-zinc-500', dot: 'bg-zinc-700' };
    return { text: t('wintools.state.disabled', 'Disabled'), cls: 'text-zinc-400', dot: 'bg-zinc-500' };
  };

  return (
    <div className="space-y-8">
      {result ? (
        <div role="status" className={`flex items-start gap-2 border-l-2 pl-3 py-1 text-[12.5px] ${result.ok ? 'border-emerald-400 text-emerald-300' : 'border-red-400 text-red-300'}`}>
          {result.ok ? <CheckCircle size={14} className="shrink-0 mt-px" /> : <XCircle size={14} className="shrink-0 mt-px" />}
          <span className="min-w-0 break-words">{result.text}</span>
        </div>
      ) : null}

      <section>
        <div className="flex items-end justify-between gap-3 mb-3">
          <div className="max-w-[75ch]">
            <h2 className="dh-section-title">{t('wintools.features.title', 'Windows features')}</h2>
            <p className="mt-1 dh-help">{t('wintools.features.help', '')}</p>
          </div>
          <button onClick={loadFeatures} disabled={loadingFeatures || Boolean(busy)} className="dh-btn dh-btn-sm shrink-0">
            <RefreshCw size={14} className={loadingFeatures ? 'animate-spin' : ''} />{t('wintools.refresh', 'Refresh')}
          </button>
        </div>
        <ul className="dh-card divide-y divide-zinc-800/80">
          {FEATURES.map((id) => {
            const s = features?.[id];
            const st = stateLabel(s);
            const on = s === 'enabled' || s === 'pending';
            return (
              <li key={id} className="px-4 py-2.5 flex items-start gap-4">
                <span className={`w-32 shrink-0 pt-0.5 inline-flex items-center gap-1.5 text-[11.5px] ${st.cls}`}>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${st.dot}`} aria-hidden /><span className="truncate">{st.text}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-zinc-200">{t(`wintools.feature.${id}`, id)}</div>
                  <div className="mt-0.5 dh-help">{t(`wintools.feature.${id}.desc`, '')}</div>
                </div>
                <button
                  disabled={Boolean(busy) || !features || s === 'unavailable'}
                  onClick={() => toggleFeature(id, !on)}
                  className="dh-btn dh-btn-sm shrink-0"
                >
                  {busy === `f:${id}` ? <Loader2 size={14} className="animate-spin" /> : null}
                  {on ? t('wintools.disable', 'Disable') : t('wintools.enable', 'Enable')}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="dh-section-title mb-3">{t('wintools.repairs.title', 'Repairs')}</h2>
        <ul className="dh-card divide-y divide-zinc-800/80">
          {REPAIRS.map((id) => (
            <li key={id} className="px-4 py-3 flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-zinc-200">{t(`wintools.action.${id}`, id)}</div>
                <div className="mt-0.5 dh-help">{t(`wintools.action.${id}.desc`, '')}</div>
              </div>
              <button disabled={Boolean(busy)} onClick={() => exec(id, () => api()!.run({ action: id }))} className="dh-btn dh-btn-sm shrink-0">
                {busy === id ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />}{t('wintools.run', 'Run')}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="dh-section-title mb-3">{t('wintools.advanced.title', 'Advanced')}</h2>
        <ul className="dh-card divide-y divide-zinc-800/80">
          {ADVANCED.map((id) => (
            <li key={id} className="px-4 py-3">
              <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-zinc-200">{t(`wintools.action.${id}`, id)}</div>
                  <div className="mt-0.5 dh-help">{t(`wintools.action.${id}.desc`, '')}</div>
                </div>
                <button disabled={Boolean(busy)} onClick={() => setConfirm(confirm === id ? null : id)} className="dh-btn dh-btn-sm shrink-0">
                  {busy === id ? <Loader2 size={14} className="animate-spin" /> : null}{t('wintools.run', 'Run')}
                </button>
              </div>
              {confirm === id ? (
                <div className="mt-3 flex items-center gap-3 border-l-2 border-amber-300 pl-3 py-1 text-[12.5px] text-amber-200">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span className="min-w-0 flex-1">{t('wintools.confirm', 'Confirm? This changes the system right away.')}</span>
                  <button onClick={() => { setConfirm(null); exec(id, () => api()!.run({ action: id })); }} className="dh-btn dh-btn-sm dh-btn-danger shrink-0">
                    {t('wintools.confirmYes', 'Yes, run')}
                  </button>
                  <button onClick={() => setConfirm(null)} className="dh-btn dh-btn-sm dh-btn-ghost shrink-0">{t('wintools.cancel', 'Cancel')}</button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="dh-section-title">{t('wintools.panels.title', 'Classic Windows panels')}</h2>
        <p className="mt-1 mb-3 dh-help">{t('wintools.panels.help', '')}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
          {PANELS.map((id) => (
            <button key={id} onClick={() => exec(`p:${id}`, () => api()!.openPanel({ id }).then((r) => (r.ok ? { ok: true, msg: t(`wintools.panel.${id}`, id) } : r)))} className="dh-btn dh-btn-sm justify-between">
              <span className="truncate">{t(`wintools.panel.${id}`, id)}</span><ExternalLink size={13} className="text-zinc-500 shrink-0" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
