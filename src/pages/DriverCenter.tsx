import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, CheckCircle, Cpu, DownloadCloud, ExternalLink, Info, Loader2,
  MonitorCog, RefreshCw, ShieldCheck, XCircle
} from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';

type Adapter = NonNullable<Awaited<ReturnType<NonNullable<Window['darkhub']['driver']>['detect']>>['adapters']>[number];

const api = () => window.darkhub?.driver;

const VENDOR_STYLE: Record<string, string> = {
  nvidia: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  amd: 'bg-red-500/10 text-red-300 border-red-500/30',
  intel: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  virtual: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  other: 'bg-zinc-800 text-zinc-400 border-zinc-700'
};

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-zinc-900 border border-zinc-800 rounded-xl p-4 ${className}`}>{children}</div>
);

const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition disabled:opacity-40 disabled:cursor-not-allowed';
const btnGhost = `${btn} bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 border-zinc-700/60`;
const btnPrimary = `${btn} bg-[#3b82f6] hover:bg-blue-500 text-white border-blue-500/50`;

export default function DriverCenter() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adapters, setAdapters] = useState<Adapter[]>([]);
  const [rebootPending, setRebootPending] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api()?.detect();
      if (!res?.ok) { setError(res?.error || t('driver.error', 'Failed to detect drivers.')); setAdapters([]); return; }
      setAdapters(res.adapters ?? []);
      setRebootPending(Boolean(res.rebootPending));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const openOfficial = async (vendor: string, kind: 'manual' | 'autoDetect' | 'app') => {
    setBusy(true);
    setNotice({ ok: true, message: t('driver.opening', 'Opening the official page...') });
    try {
      const r = await api()?.openOfficial({ vendor, kind });
      if (!r?.ok) setNotice({ ok: false, message: r?.error || t('driver.openError', 'Could not open the official page.') });
      else setNotice({ ok: true, message: `${t('driver.opening', 'Opening the official page...')} ${r.url ?? ''}` });
    } catch (e: any) {
      setNotice({ ok: false, message: e?.message ?? String(e) });
    } finally {
      setBusy(false);
      window.setTimeout(() => setNotice(null), 4000);
    }
  };

  const header = (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
      <div className="min-w-0">
        <h1 className="text-lg font-bold text-zinc-100 tracking-tight flex items-center gap-2">
          <MonitorCog className="w-5 h-5 text-[#3b82f6]" />
          {t('driver.title', 'Driver Center')}
        </h1>
        <p className="text-xs text-zinc-400 mt-0.5">{t('driver.subtitle', '')}</p>
      </div>
      <button onClick={load} disabled={loading || busy} className={btnGhost}>
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        {t('driver.refresh', 'Detect again')}
      </button>
    </div>
  );

  const vendorBadge = (v: string) => (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono uppercase ${VENDOR_STYLE[v] || VENDOR_STYLE.other}`}>{v}</span>
  );

  const field = (label: string, value: React.ReactNode) => (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-0.5 text-xs font-mono text-zinc-200 truncate">{value || '-'}</div>
    </div>
  );

  return (
    <div className="w-full max-w-5xl mx-auto space-y-4 p-1 md:p-2 text-zinc-100 pb-16">
      {header}

      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2 flex items-start gap-2 text-xs text-blue-200/90">
        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-blue-300" />
        <span>{t('driver.handoffNote', '')}</span>
      </div>

      {rebootPending ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 flex items-start gap-2 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{t('driver.rebootPending', '')}</span>
        </div>
      ) : null}

      {notice ? (
        <div className={`rounded-lg border px-3 py-2 text-xs flex items-start gap-2 break-words ${notice.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>
          {notice.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
          <span>{notice.message}</span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300 break-words">{error}</div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-zinc-400"><Loader2 className="w-4 h-4 animate-spin" />{t('driver.detecting', 'Detecting...')}</div>
      ) : adapters.length === 0 && !error ? (
        <Card><p className="text-xs text-zinc-500">{t('driver.none', 'No display adapter detected.')}</p></Card>
      ) : null}

      <div className="space-y-3">
        {adapters.map((a, i) => {
          const src = a.officialSources;
          return (
            <Card key={`${a.pnpId || a.model}-${i}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Cpu className="w-4 h-4 text-zinc-400 shrink-0" />
                    <span className="text-sm font-semibold text-zinc-100 truncate">{a.model}</span>
                    {vendorBadge(a.vendor)}
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                      {a.isDedicated ? t('driver.dedicated', 'Dedicated') : t('driver.integrated', 'Integrated')}
                    </span>
                    {a.status && a.status.toLowerCase() !== 'ok' && a.status !== '0' ? (
                      <span className="text-[10px] inline-flex items-center gap-1 text-amber-300"><AlertTriangle className="w-3 h-3" />{a.status}</span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                {field(t('driver.col.version', 'Driver version'), a.driverVersion || t('driver.unknownVersion', 'Unknown'))}
                {field(t('driver.col.date', 'Driver date'), a.driverDate)}
                {field(t('driver.col.provider', 'Provider'), a.driverProvider)}
                {field(t('driver.col.vram', 'VRAM'), a.vramMb ? `${a.vramMb} MB` : '-')}
              </div>

              {src ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button disabled={busy} onClick={() => openOfficial(a.vendor, 'manual')} className={btnPrimary}>
                    <DownloadCloud className="w-3.5 h-3.5" />{t('driver.official.manual', 'Official site')}
                  </button>
                  <button disabled={busy} onClick={() => openOfficial(a.vendor, 'autoDetect')} className={btnGhost}>
                    <ExternalLink className="w-3.5 h-3.5" />{t('driver.official.autoDetect', 'Auto-detect')}
                  </button>
                  <button disabled={busy} onClick={() => openOfficial(a.vendor, 'app')} className={btnGhost}>
                    <ExternalLink className="w-3.5 h-3.5" />{t('driver.official.app', 'Vendor app')}
                  </button>
                </div>
              ) : (
                <p className="mt-3 text-[11px] text-zinc-500 flex items-center gap-1.5"><Info className="w-3.5 h-3.5" />{t('driver.official.none', '')}</p>
              )}

              {a.pnpId ? <div className="mt-2 text-[10.5px] font-mono text-zinc-600 truncate">{a.pnpId}</div> : null}
            </Card>
          );
        })}
      </div>

      {adapters.length > 0 ? (
        <p className="text-[11px] text-zinc-500 flex items-center gap-1.5"><Info className="w-3.5 h-3.5 shrink-0" />{t('driver.verifyHint', '')}</p>
      ) : null}
    </div>
  );
}
