import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Loader2, RotateCcw, CheckCircle2, AlertTriangle, FolderOpen, Music, Package, Gamepad2, Settings2 } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';
import type { RestoreComponent } from '../../global';

const GROUPS = [
  ['media', Music],
  ['apps', Package],
  ['gaming', Gamepad2],
  ['system', Settings2]
] as const;

/** Post-Install Hub tab: brings back Windows components a custom ISO removed, one click each, verified afterwards. */
export default function RestoreComponentsPanel() {
  const { t } = useI18n();
  const [items, setItems] = useState<RestoreComponent[] | null>(null);
  const [winget, setWinget] = useState(true);
  const [elevated, setElevated] = useState(true);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [isoRoot, setIsoRoot] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; text: string }>>({});
  const api = () => window.darkhub?.restore;

  const load = async () => {
    setLoading(true);
    try {
      const r = await api()?.status();
      if (r?.ok && r.items) { setItems(r.items); setWinget(Boolean(r.winget)); setElevated(r.elevated !== false); } else setMsg({ ok: false, text: r?.error || t('rstx.err.read', 'Could not read the Windows components.') });
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const errorText = (e?: string) => e === 'needs-winget' ? t('rstx.err.needsWinget', 'This app is installed through winget. Restore "App Installer (winget)" first.') : (e || t('rstx.err.generic', 'Failed'));

  const restore = async (ids: string[]) => {
    const done: string[] = [];
    const failed: string[] = [];
    let reboot = false;
    setQueue(ids);
    for (const id of ids) {
      setBusy(id);
      const r = await api()?.install({ id, isoRoot });
      const label = t(`rstx.item.${id}`, items?.find((c) => c.id === id)?.label || id);
      if (r?.ok) { done.push(label); reboot = reboot || Boolean(r.restartNeeded); } else failed.push(`${label}: ${errorText(r?.error)}`);
      setResults((m) => ({ ...m, [id]: r?.ok ? { ok: true, text: r.restartNeeded ? t('rstx.reboot', 'Restart Windows to finish.') : t('rstx.done', 'Restored') } : { ok: false, text: errorText(r?.error) } }));
      setQueue((q) => q.filter((x) => x !== id));
    }
    setBusy(null);
    setMsg({
      ok: failed.length === 0,
      text: [done.length ? `${t('rstx.done', 'Restored')}: ${done.join(', ')}.` : '', reboot ? t('rstx.reboot', 'Restart Windows to finish.') : '', ...failed].filter(Boolean).join(' ')
    });
    load();
  };

  const missing = useMemo(() => (items || []).filter((c) => c.state === 'missing'), [items]);
  // winget first: the Store apps need it
  const restoreAll = () => restore(missing.map((c) => c.id).sort((a, b) => (a === 'winget' ? -1 : b === 'winget' ? 1 : 0)));

  const pickIso = async () => {
    const r = await window.darkhub?.dialog?.selectFolder({ title: t('rstx.iso.pick', 'Choose the mounted Windows ISO drive') });
    if (r?.folderPath) setIsoRoot(r.folderPath);
  };

  const badge = (c: RestoreComponent) => {
    if (c.state === 'installed') return <span className="inline-flex items-center gap-1 text-[11.5px] text-emerald-300"><CheckCircle2 size={13} />{t('rstx.state.installed', 'Installed')}</span>;
    if (c.state === 'missing') return <span className="text-[11.5px] text-amber-300">{t('rstx.state.missing', 'Missing')}</span>;
    if (c.state === 'unavailable') return <span className="text-[11.5px] text-zinc-500">{t('rstx.state.unavailable', 'Not offered on this Windows')}</span>;
    return <span className="text-[11.5px] text-zinc-500">{t('rstx.state.unknown', 'Unknown')}</span>;
  };

  return (
    <div className="space-y-5 animate-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-zinc-100">{t('rstx.title', 'Restore removed Windows components')}</p>
          <p className="dh-help max-w-[80ch]">{t('rstx.body', '')}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={load} disabled={loading || Boolean(busy)} className="dh-btn dh-btn-sm">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}{t('rstx.refresh', 'Check again')}
          </button>
          <button onClick={restoreAll} disabled={!missing.length || Boolean(busy)} className="dh-btn dh-btn-sm dh-btn-primary">
            <RotateCcw size={14} />{t('rstx.all', 'Restore all missing')} ({missing.length})
          </button>
        </div>
      </div>

      {!elevated && items ? (
        <div className="flex items-start gap-2 border-l-2 border-amber-400/60 pl-3 py-1 text-[12.5px] text-zinc-300">
          <AlertTriangle size={14} className="text-amber-300 mt-0.5 shrink-0" />{t('rstx.needAdmin', '')}
        </div>
      ) : null}

      {!winget && items ? (
        <div className="flex items-start gap-2 border-l-2 border-amber-400/60 pl-3 py-1 text-[12.5px] text-zinc-300">
          <AlertTriangle size={14} className="text-amber-300 mt-0.5 shrink-0" />{t('rstx.noWinget', '')}
        </div>
      ) : null}

      {msg ? <p role="status" className={`text-[12.5px] ${msg.ok ? 'text-emerald-300' : 'text-amber-300'}`}>{msg.text}</p> : null}

      {!items && loading ? <p className="dh-help flex items-center gap-2"><Loader2 size={14} className="animate-spin" />{t('rstx.reading', 'Reading the Windows components (up to a minute)...')}</p> : null}

      {items ? GROUPS.map(([g, Icon]) => (
        <section key={g} className="dh-card p-0 overflow-hidden">
          <h3 className="px-4 py-2.5 flex items-center gap-2 text-[12.5px] font-medium text-zinc-200 border-b border-zinc-800">
            <Icon size={15} className="text-blue-300" />{t(`rstx.group.${g}`, g)}
          </h3>
          <ul>
            {items.filter((c) => c.group === g).map((c) => (
              <li key={c.id} className="px-4 py-2.5 flex items-center justify-between gap-3 border-b border-zinc-800/60 last:border-b-0">
                <div className="min-w-0">
                  <p className="text-[13px] text-zinc-100">{t(`rstx.item.${c.id}`, c.label)}</p>
                  {results[c.id] && busy !== c.id ? <p className={`text-[12px] ${results[c.id].ok ? 'text-emerald-300' : 'text-amber-300'}`}>{results[c.id].text}</p> : null}
                  {busy === c.id && (c.kind === 'capability' || c.kind === 'feature') ? <p className="dh-help text-blue-300">{t('rstx.slow', 'Items from Windows Update can take 10 to 30 minutes. You can keep using the PC.')}</p> : null}
                  {c.detail === 'payload-removed' ? <p className="dh-help">{t('rstx.payloadRemoved', 'The files were removed from the image: it comes from Windows Update or from the ISO.')}</p> : null}
                  {c.isoSource && c.state === 'missing' ? (
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <button onClick={pickIso} disabled={Boolean(busy)} className="dh-btn dh-btn-sm"><FolderOpen size={13} />{t('rstx.iso.btn', 'Use a Windows ISO (offline)')}</button>
                      <span className="dh-help">{isoRoot ? isoRoot : t('rstx.iso.none', 'Without an ISO, Windows Update is used.')}</span>
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {badge(c)}
                  {c.state === 'missing' ? (
                    <button onClick={() => restore([c.id])} disabled={Boolean(busy)} className="dh-btn dh-btn-sm">
                      {busy === c.id ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                      {busy === c.id ? t('rstx.working', 'Restoring...') : queue.includes(c.id) ? t('rstx.queued', 'Queued') : t('rstx.restore', 'Restore')}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )) : null}
    </div>
  );
}
