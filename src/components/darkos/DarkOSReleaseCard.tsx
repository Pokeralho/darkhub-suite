import React, { useEffect, useState } from 'react';
import { DownloadCloud, ExternalLink, Loader2, CheckCircle2, AlertTriangle } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';
import type { DarkOSRelease } from '../../types/darkos';

const gb = (b: number | null) => (b ? `${(b / 1073741824).toFixed(2).replace('.', ',')} GB` : '');
const newer = (a?: string | null, b?: string | null) => {
  const p = (v?: string | null) => String(v || '').split('.').map(Number);
  const [x, y] = [p(a), p(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};

/**
 * Latest DarkOS ISO from darkos.darkhub.ink. On DarkOS it compares with the installed build; on plain Windows it is the
 * way to get DarkOS. The ISO goes through the Download Manager, checked against the SHA-256 the site publishes.
 */
export default function DarkOSReleaseCard({ installed, onNavigate }: { installed?: { version?: string | null; build?: string | null } | null; onNavigate?: (page: string) => void }) {
  const { t } = useI18n();
  const [rel, setRel] = useState<DarkOSRelease | null>(null);
  const [error, setError] = useState('');
  const [queued, setQueued] = useState(false);

  useEffect(() => {
    window.darkhub?.darkos?.latestRelease?.().then((r) => { if (r?.ok && r.release) setRel(r.release); else setError(r?.error || ''); }).catch((e) => setError(String(e?.message ?? e)));
  }, []);

  const download = async () => {
    if (!rel) return;
    const r = await window.darkhub?.downloads?.add({ url: rel.url, fileName: rel.isoName, sha256: rel.sha256 });
    if (r?.ok === false) { setError(r.error || ''); return; }
    setQueued(true);
    onNavigate?.('downloads');
  };

  // the manifest may say 10.0.26300.9550; the site says 26300.9550
  const mine = installed?.build ? String(installed.build).split('.').slice(-2).join('.') : null;
  const update = mine && rel?.build ? newer(rel.build, mine) : false;
  const current = mine && rel?.build && !update;

  return (
    <section className="dh-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="dh-section-title">{installed ? t('darkos.rel.titleOn', 'DarkOS releases') : t('darkos.rel.titleGet', 'Get DarkOS')}</h2>
          <p className="dh-help max-w-[70ch]">{installed ? t('darkos.rel.bodyOn', '') : t('darkos.rel.bodyGet', '')}</p>
        </div>
        {rel ? (
          <div className="flex gap-2 shrink-0">
            <button onClick={download} disabled={queued} className={`dh-btn dh-btn-sm ${update || !installed ? 'dh-btn-primary' : ''}`}>
              <DownloadCloud size={14} />{queued ? t('darkos.rel.queued', 'In the Download Manager') : `${t('darkos.rel.download', 'Download ISO')} (${gb(rel.size)})`}
            </button>
            <button onClick={() => window.darkhub?.shell?.openExternal(rel.releasesUrl)} className="dh-btn dh-btn-sm"><ExternalLink size={13} />{t('darkos.rel.notes', 'Release notes')}</button>
          </div>
        ) : null}
      </div>
      {!rel && !error ? <p className="dh-help flex items-center gap-2"><Loader2 size={13} className="animate-spin" />{t('darkos.rel.loading', 'Checking darkos.darkhub.ink...')}</p> : null}
      {error ? <p className="text-[12.5px] text-amber-300 flex items-center gap-2"><AlertTriangle size={13} />{error}</p> : null}
      {rel ? (
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12.5px]">
          <div><dt className="dh-label">{t('darkos.rel.version', 'Version')}</dt><dd className="font-mono text-zinc-100">v{rel.version || '-'}</dd></div>
          <div><dt className="dh-label">{t('darkos.rel.build', 'Windows build')}</dt><dd className="font-mono text-zinc-100">{rel.build || '-'}</dd></div>
          <div><dt className="dh-label">{t('darkos.rel.date', 'Published')}</dt><dd className="text-zinc-100">{rel.date || '-'}</dd></div>
          <div><dt className="dh-label">SHA-256</dt><dd className="font-mono text-zinc-400 truncate" title={rel.sha256}>{rel.sha256.slice(0, 16)}…</dd></div>
        </dl>
      ) : null}
      {update ? <p className="text-[12.5px] text-blue-300">{t('darkos.rel.update', 'A newer DarkOS build is out.')} {mine} → {rel?.build}</p> : null}
      {current ? <p className="text-[12.5px] text-emerald-300 flex items-center gap-2"><CheckCircle2 size={13} />{t('darkos.rel.current', 'You are on the latest DarkOS build.')}</p> : null}
      {rel ? <p className="dh-help">{t('darkos.rel.verify', 'The download is checked against the SHA-256 published on the site. Write it to a USB drive of 8 GB or more with Rufus or Ventoy.')}</p> : null}
    </section>
  );
}
