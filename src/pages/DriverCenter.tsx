import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, Camera, CheckCircle2, Cpu, DownloadCloud, ExternalLink, Info, Loader2, RefreshCw, ShieldCheck, Wrench, XCircle
} from '../components/icons';
import PageHeader from '../components/ui/PageHeader';
import { useI18n } from '../i18n/I18nProvider';

type CameraState = Awaited<ReturnType<NonNullable<Window['darkhub']['driver']>['cameraStatus']>> & { steps?: string[] };
const VENDOR_NAME: Record<string, string> = { nvidia: 'NVIDIA', amd: 'AMD', intel: 'Intel' };

type Adapter = NonNullable<Awaited<ReturnType<NonNullable<Window['darkhub']['driver']>['detect']>>['adapters']>[number];

const api = () => window.darkhub?.driver;

export default function DriverCenter() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adapters, setAdapters] = useState<Adapter[]>([]);
  const [rebootPending, setRebootPending] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const mounted = useRef(true);
  const noticeTimer = useRef<number | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api()?.detect();
      if (!mounted.current) return;
      if (!res?.ok) { setError(res?.error || t('driver.error', 'Failed to detect drivers.')); setAdapters([]); setRebootPending(false); return; }
      setAdapters(res.adapters ?? []);
      setRebootPending(Boolean(res.rebootPending));
    } catch (e: any) {
      if (mounted.current) setError(e?.message ?? String(e));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  // ---------------------------------------------------------------- camera / capture
  const [camera, setCamera] = useState<CameraState | null>(null);
  const [cameraBusy, setCameraBusy] = useState<'check' | 'repair' | null>(null);
  const runCamera = useCallback(async (kind: 'check' | 'repair') => {
    setCameraBusy(kind);
    try {
      const r = kind === 'repair' ? await api()?.repairCamera?.() : await api()?.cameraStatus?.();
      if (mounted.current) setCamera(r ?? { ok: false, error: t('driver.camera.unavailable', 'Diagnóstico indisponível.') });
    } catch (e: any) {
      if (mounted.current) setCamera({ ok: false, error: e?.message ?? String(e) });
    } finally {
      if (mounted.current) setCameraBusy(null);
    }
  }, [t]);
  useEffect(() => { runCamera('check'); }, [runCamera]);

  const openOfficial = async (vendor: string, kind: 'manual' | 'autoDetect' | 'app') => {
    setBusy(true);
    // A previous notice's timer must not clear this one early.
    if (noticeTimer.current !== null) { window.clearTimeout(noticeTimer.current); noticeTimer.current = null; }
    setNotice({ ok: true, message: t('driver.opening', 'Opening the official page...') });
    try {
      const r = await api()?.openOfficial({ vendor, kind });
      if (!mounted.current) return;
      if (!r?.ok) setNotice({ ok: false, message: r?.error || t('driver.openError', 'Could not open the official page.') });
      else setNotice({ ok: true, message: `${t('driver.opening', 'Opening the official page...')} ${r.url ?? ''}` });
    } catch (e: any) {
      if (mounted.current) setNotice({ ok: false, message: e?.message ?? String(e) });
    } finally {
      if (mounted.current) {
        setBusy(false);
        noticeTimer.current = window.setTimeout(() => { noticeTimer.current = null; setNotice(null); }, 4000);
      }
    }
  };

  const header = (
    <PageHeader
      title={t('driver.title', 'Driver Center')}
      subtitle={t('driver.subtitle', '')}
      actions={(
        <button onClick={load} disabled={loading || busy} className="dh-btn">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {t('driver.refresh', 'Detect again')}
        </button>
      )}
    />
  );

  const field = (label: string, value: React.ReactNode) => (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-[12.5px] font-mono text-zinc-200 truncate">{value || '-'}</dd>
    </div>
  );

  // A GPU on Windows' generic driver is the one thing a regular user must fix: it gets the page's primary action.
  const generic = adapters.find((a) => a.genericDriver && a.officialSources);
  const vendorName = generic ? (VENDOR_NAME[generic.vendor] ?? generic.vendor) : '';
  // Otherwise the primary action is the official download for the first adapter that has one.
  const primaryIndex = generic ? -1 : adapters.findIndex((a) => Boolean(a.officialSources));

  return (
    <div className="w-full max-w-5xl pb-16">
      {header}

      {generic ? (
        <section role="alert" className="dh-card p-5 mb-5 border-amber-300/30">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-300 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <h2 className="dh-section-title">
                {t('driver.generic.title', 'Sua placa {vendor} está sem o driver oficial').replace('{vendor}', vendorName)}
              </h2>
              <p className="mt-1 dh-help max-w-[70ch]">
                {t('driver.generic.body', 'O Windows está usando o Vídeo Básico da Microsoft: sem aceleração, jogos e vídeos rodam mal e a resolução pode ficar limitada. Instale o aplicativo oficial do fabricante: ele detecta a placa, instala o driver certo e mantém atualizado.')}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button disabled={busy} onClick={() => openOfficial(generic.vendor, 'app')} className="dh-btn dh-btn-primary">
                  <DownloadCloud size={14} />
                  {t('driver.generic.cta', 'Baixar o app oficial da {vendor}').replace('{vendor}', vendorName)}
                </button>
                <button disabled={busy} onClick={() => openOfficial(generic.vendor, 'manual')} className="dh-btn">
                  {t('driver.official.manual', 'Official site')}<ExternalLink size={12} />
                </button>
              </div>
              {generic.deviceId ? <p className="mt-3 text-[11px] font-mono text-zinc-500">{generic.deviceId}</p> : null}
            </div>
          </div>
        </section>
      ) : null}

      <div className="space-y-2 mb-5">
        <p className="flex items-start gap-2 text-[12.5px] text-zinc-400 max-w-[75ch]">
          <ShieldCheck size={14} className="shrink-0 mt-0.5 text-zinc-500" />
          <span>{t('driver.handoffNote', '')}</span>
        </p>

        {rebootPending ? (
          <div role="status" className="flex items-start gap-2 border-l-2 border-amber-300 pl-3 py-1 text-[12.5px] text-amber-200">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>{t('driver.rebootPending', '')}</span>
          </div>
        ) : null}

        {notice ? (
          <div role="status" aria-live="polite" className={`flex items-start gap-2 border-l-2 pl-3 py-1 text-[12.5px] break-words ${notice.ok ? 'border-zinc-600 text-zinc-300' : 'border-red-400 text-red-300'}`}>
            {notice.ok ? <ExternalLink size={14} className="shrink-0 mt-0.5 text-zinc-500" /> : <XCircle size={14} className="shrink-0 mt-0.5" />}
            <span className="min-w-0 break-all">{notice.message}</span>
          </div>
        ) : null}

        {error ? (
          <div role="alert" className="flex items-start gap-2 border-l-2 border-red-400 pl-3 py-1 text-[12.5px] text-red-300 break-words">
            <XCircle size={14} className="shrink-0 mt-0.5" />
            <span className="min-w-0">{error}</span>
            <button onClick={load} disabled={loading} className="ml-1 underline underline-offset-2 text-red-200 hover:text-red-100 shrink-0">{t('driver.refresh', 'Detect again')}</button>
          </div>
        ) : null}
      </div>

      {error && !loading && adapters.length === 0 ? null : <h2 className="dh-section-title mb-2">
        {t('driver.adapters', 'Adaptadores de vídeo')}
        {!loading && adapters.length ? <span className="ml-1.5 font-mono text-[11.5px] font-normal text-zinc-500">{adapters.length}</span> : null}
      </h2>}

      {loading ? (
        <div role="status" aria-label={t('driver.detecting', 'Detecting...')} className="dh-card divide-y divide-zinc-800/80">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="p-4 space-y-4">
              <div className="h-4 w-64 max-w-full rounded bg-zinc-800/80 animate-pulse" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((__, j) => (
                  <div key={j} className="space-y-1.5">
                    <div className="h-3 w-16 rounded bg-zinc-800/80 animate-pulse" />
                    <div className="h-3.5 w-24 rounded bg-zinc-800/80 animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : adapters.length === 0 && !error ? (
        <div className="dh-card px-4 py-6 flex items-center justify-between gap-3">
          <p className="text-[12.5px] text-zinc-500">{t('driver.none', 'No display adapter detected.')}</p>
          <button onClick={load} className="dh-btn dh-btn-sm"><RefreshCw size={14} />{t('driver.refresh', 'Detect again')}</button>
        </div>
      ) : adapters.length ? (
        <ul className="dh-card divide-y divide-zinc-800/80">
          {adapters.map((a, i) => {
            const src = a.officialSources;
            const warn = a.status && a.status.toLowerCase() !== 'ok' && a.status !== '0';
            return (
              <li key={`${a.pnpId || a.model}-${i}`} className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex items-center gap-2.5 flex-wrap">
                    <Cpu size={16} className="text-zinc-500 shrink-0" />
                    <span className="text-[13.5px] font-semibold text-zinc-100 truncate">{a.model}</span>
                    <span className="dh-tag">{a.vendor}</span>
                    <span className="text-[11.5px] text-zinc-500">
                      {a.isDedicated ? t('driver.dedicated', 'Dedicated') : t('driver.integrated', 'Integrated')}
                    </span>
                    {warn ? (
                      <span className="text-[11.5px] inline-flex items-center gap-1 text-amber-300"><AlertTriangle size={12} />{a.status}</span>
                    ) : null}
                    {a.genericDriver ? (
                      <span className="text-[11.5px] inline-flex items-center gap-1 text-amber-300"><AlertTriangle size={12} />{t('driver.generic.tag', 'driver genérico')}</span>
                    ) : null}
                  </div>
                  {src ? (
                    <div className="flex flex-wrap gap-2">
                      <button disabled={busy} onClick={() => openOfficial(a.vendor, 'autoDetect')} className="dh-btn dh-btn-ghost dh-btn-sm">
                        {t('driver.official.autoDetect', 'Auto-detect')}<ExternalLink size={12} />
                      </button>
                      <button disabled={busy} onClick={() => openOfficial(a.vendor, 'app')} className="dh-btn dh-btn-ghost dh-btn-sm">
                        {t('driver.official.app', 'Vendor app')}<ExternalLink size={12} />
                      </button>
                      <button disabled={busy} onClick={() => openOfficial(a.vendor, 'manual')} className={`dh-btn dh-btn-sm ${i === primaryIndex ? 'dh-btn-primary' : ''}`}>
                        <DownloadCloud size={14} />{t('driver.official.manual', 'Official site')}
                      </button>
                    </div>
                  ) : null}
                </div>

                <dl className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 pl-[26px]">
                  {field(t('driver.col.version', 'Driver version'), a.driverVersion || t('driver.unknownVersion', 'Unknown'))}
                  {field(t('driver.col.date', 'Driver date'), a.driverDate)}
                  {field(t('driver.col.provider', 'Provider'), a.driverProvider)}
                  {field(t('driver.col.vram', 'VRAM'), a.vramMb ? <>{a.vramMb}<span className="text-zinc-500"> MB</span></> : '-')}
                </dl>

                <div className="mt-3 pl-[26px] flex items-center gap-4 flex-wrap">
                  {!src ? (
                    <p className="dh-help flex items-center gap-1.5"><Info size={14} />{t('driver.official.none', '')}</p>
                  ) : null}
                  {a.pnpId ? <div className="text-[11px] font-mono text-zinc-600 truncate min-w-0">{a.pnpId}</div> : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {adapters.length > 0 ? (
        <p className="mt-3 dh-help flex items-center gap-1.5"><Info size={14} className="shrink-0" />{t('driver.verifyHint', '')}</p>
      ) : null}

      <section className="mt-10" aria-labelledby="camera-title">
        <div className="flex items-end justify-between gap-3 flex-wrap mb-2">
          <div>
            <h2 id="camera-title" className="dh-section-title">{t('driver.camera.title', 'Câmera e captura de tela')}</h2>
            <p className="dh-help mt-0.5 max-w-[70ch]">{t('driver.camera.subtitle', 'Webcam que não aparece em navegadores, Discord ou Teams, e prints que não funcionam.')}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => runCamera('check')} disabled={cameraBusy !== null} className="dh-btn dh-btn-sm">
              <RefreshCw size={13} className={cameraBusy === 'check' ? 'animate-spin' : ''} />{t('driver.camera.check', 'Verificar')}
            </button>
            <button onClick={() => runCamera('repair')} disabled={cameraBusy !== null} className={`dh-btn dh-btn-sm ${camera?.issues?.length ? 'dh-btn-primary' : ''}`}>
              {cameraBusy === 'repair' ? <Loader2 size={13} className="animate-spin" /> : <Wrench size={13} />}
              {cameraBusy === 'repair' ? t('driver.camera.repairing', 'Reparando...') : t('driver.camera.repair', 'Reparar câmera e captura')}
            </button>
          </div>
        </div>

        <div className="dh-card divide-y divide-zinc-800/80">
          {camera === null ? (
            <div className="p-4 space-y-2" role="status">
              <div className="h-3.5 w-52 rounded bg-zinc-800/80 animate-pulse" />
              <div className="h-3 w-80 max-w-full rounded bg-zinc-800/70 animate-pulse" />
            </div>
          ) : !camera.ok ? (
            <p role="alert" className="p-4 text-[12.5px] text-red-300">{camera.error}</p>
          ) : (
            <>
              <ul className="p-4 space-y-1.5">
                {(camera.devices ?? []).length ? (camera.devices ?? []).map((d, i) => (
                  <li key={`${d.name}-${i}`} className="flex items-center gap-2 text-[12.5px]">
                    <Camera size={14} className="text-zinc-500 shrink-0" />
                    <span className="text-zinc-100 truncate">{d.name}</span>
                    <span className={`font-mono text-[11px] ${String(d.status).toUpperCase() === 'OK' ? 'text-emerald-300' : 'text-amber-300'}`}>{d.status}</span>
                  </li>
                )) : <li className="text-[12.5px] text-zinc-400">{t('driver.camera.none', 'Nenhuma câmera conectada.')}</li>}
              </ul>
              <div className="p-4">
                {(camera.issues ?? []).length ? (
                  <ul className="space-y-1.5">
                    {(camera.issues ?? []).map((m) => (
                      <li key={m} className="flex items-start gap-2 text-[12.5px] text-amber-200"><AlertTriangle size={13} className="shrink-0 mt-0.5" />{m}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="flex items-center gap-2 text-[12.5px] text-emerald-300"><CheckCircle2 size={14} />{t('driver.camera.ok', 'Nenhum bloqueio encontrado: serviços, permissões e políticas estão liberados.')}</p>
                )}
              </div>
              {camera.steps?.length ? (
                <div className="p-4">
                  <p className="dh-label mb-1.5">{t('driver.camera.done', 'Reparo executado')}</p>
                  <ul className="space-y-1 font-mono text-[11.5px] text-zinc-400">
                    {camera.steps.map((st) => <li key={st}>{st}</li>)}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </div>
        <p className="mt-2 dh-help flex items-center gap-1.5"><Info size={14} className="shrink-0" />{t('driver.camera.note', 'O reparo pede permissão de administrador. Depois dele, reconecte a câmera se ela ainda não aparecer.')}</p>
      </section>
    </div>
  );
}
