import React, { useCallback, useEffect, useRef, useState } from 'react';
import HotkeyCapture from '../components/HotkeyCapture';
import { Camera, Copy, ScreenRegion, ExternalLink, FolderOpen, Loader2, Trash2, UploadCloud, X, FileImage, Film, Music, FileText, FileArchive, Package } from '../components/icons';
import PageHeader from '../components/ui/PageHeader';
import { useI18n } from '../i18n/I18nProvider';
import type { ShareEntry, ShareEvent, ShareShotResult, ShareState } from '../global';

const api = () => window.darkhub?.share;
const SUSUYA = 'https://susuya.darkhub.ink';
const KIND_ICON: Record<string, React.ComponentType<{ size?: number; className?: string }>> = { image: FileImage, video: Film, audio: Music, text: FileText, archive: FileArchive };

/** One uploaded file, with the actions the Susuya site has: open, direct link, page link, QR code, delete. */
function LinkRow({ h, t, copy, expiresIn, onRemove }: { h: ShareEntry; t: (k: string, d: string) => string; copy: (text: string, label: string) => void; expiresIn: (at: number) => string; onRemove: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [thumbOk, setThumbOk] = useState(true);
  const Icon = KIND_ICON[h.kind || ''] || Package;
  const toggleQr = async () => {
    if (!showQr && !qr) { const r = await window.darkhub?.share.qr(h.pageUrl); if (r?.ok && r.dataUrl) setQr(r.dataUrl); }
    setShowQr((v) => !v);
  };
  return (
    <li className="py-2.5 text-[12.5px]">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {h.kind === 'image' && thumbOk ? (
            <img src={`${SUSUYA}/r/${encodeURIComponent(h.id)}`} alt="" loading="lazy" onError={() => setThumbOk(false)} className="size-10 rounded object-cover bg-zinc-900 shrink-0" />
          ) : <span className="size-10 rounded bg-zinc-900 grid place-items-center shrink-0"><Icon size={18} className="text-zinc-400" /></span>}
          <div className="min-w-0">
            <p className="text-zinc-100 truncate" title={h.name}>{h.name}</p>
            <p className="text-zinc-500">{fmtBytes(h.size)} · {expiresIn(h.expiresAt)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 shrink-0">
          <button type="button" className="dh-btn dh-btn-sm" onClick={() => copy(h.directUrl, t('share.linkCopied', 'Link de download direto copiado.'))}><Copy size={14} />{t('share.copyDirect', 'Link direto')}</button>
          <button type="button" className="dh-btn dh-btn-ghost dh-btn-sm" onClick={() => copy(h.pageUrl, t('share.pageCopied', 'Link da página copiado.'))}>{t('share.copyPage', 'Link da página')}</button>
          <button type="button" className="dh-btn dh-btn-ghost dh-btn-sm" onClick={() => window.darkhub?.shell.openExternal(h.pageUrl)}><ExternalLink size={14} />{t('share.open', 'Abrir')}</button>
          <button type="button" className={`dh-btn dh-btn-ghost dh-btn-sm ${showQr ? 'text-blue-300' : ''}`} aria-expanded={showQr} onClick={toggleQr}>{t('share.qr', 'QR code')}</button>
          <button type="button" className="dh-btn dh-btn-ghost dh-btn-sm" aria-label={t('share.delete', 'Apagar agora')} title={t('share.delete', 'Apagar agora')} onClick={onRemove}><Trash2 size={14} /></button>
        </div>
      </div>
      {showQr ? (
        <div className="mt-3 flex items-center gap-4">
          {qr ? <img src={qr} alt={t('share.qrAlt', 'QR code do link')} className="size-[140px] rounded bg-white p-1" /> : <span className="text-zinc-500">{t('share.qrMaking', 'gerando...')}</span>}
          <p className="dh-help max-w-[260px]">{t('share.qrHelp', 'Aponte a câmera do celular para abrir o arquivo direto, sem digitar nada.')}</p>
        </div>
      ) : null}
    </li>
  );
}
const TTL_HOURS = [1, 6, 24];

const fmtBytes = (n: number) => (n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(n < 104857600 ? 1 : 0)} MB`);

/** Records the hotkey: any key or combination; the game in front still gets the key. */
function HotkeyField({ label, value, active, onChange }: { label: string; value: string; active: boolean; onChange: (acc: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="block space-y-1 text-[12.5px]">
      <span className="text-zinc-500">{label} {active ? '' : <span className="text-amber-200">· {t('share.hotkeyOff', 'inativo')}</span>}</span>
      <HotkeyCapture value={value || null} onChange={onChange} />
    </div>
  );
}

export default function Share() {
  const { t } = useI18n();
  const [st, setSt] = useState<ShareState | null>(null);
  const [jobs, setJobs] = useState<Record<string, { name: string; sent: number; total: number }>>({});
  const [shots, setShots] = useState<{ file: string; name: string; bytes: number; at: number }[]>([]);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const now = useRef(Date.now());

  const refresh = useCallback(async () => { const s = await api()?.state().catch(() => null); if (s?.ok) setSt(s); }, []);
  const refreshShots = useCallback(async () => { const r = await api()?.recentShots().catch(() => null); if (r?.ok) setShots(r.files || []); }, []);

  useEffect(() => {
    void refresh(); void refreshShots();
    const off = api()?.onEvent((e: ShareEvent) => {
      if (e.type === 'start') setJobs((j) => ({ ...j, [e.jobId]: { name: e.name, sent: 0, total: 1 } }));
      else if (e.type === 'progress') setJobs((j) => (j[e.jobId] ? { ...j, [e.jobId]: { ...j[e.jobId], sent: e.sent, total: e.total } } : j));
      else if (e.type === 'done' || e.type === 'error') {
        setJobs((j) => { const n = { ...j }; delete n[e.jobId]; return n; });
        if (e.type === 'error' && e.error !== 'cancelled') setNotice({ tone: 'err', text: `${e.name}: ${e.error}` });
        void refresh();
      } else if (e.type === 'screenshot') void refreshShots();
    });
    return () => off?.();
  }, [refresh, refreshShots]);

  if (!api()) return <p className="dh-help">{t('share.unavailable', 'Disponível apenas no aplicativo DarkHub.')}</p>;
  if (!st) return <p className="dh-help flex items-center gap-2"><Loader2 size={14} className="animate-spin" />{t('share.loading', 'Carregando...')}</p>;
  now.current = Date.now();

  const setConfig = async (patch: Partial<ShareState['config']>) => {
    const s = await api()!.setConfig(patch);
    setSt(s);
    if (s.error) setNotice({ tone: 'err', text: s.error });
  };
  const copy = async (text: string, label: string) => {
    const r = await api()!.copy(text);
    setNotice(r.ok ? { tone: 'ok', text: label } : { tone: 'err', text: r.error || '' });
  };
  const report = (results?: { ok: boolean; entry?: ShareEntry }[]) => {
    const ok = results?.filter((r) => r.ok && r.entry) || [];
    const last = ok[ok.length - 1]?.entry;
    if (last) void copy(last.directUrl, t('share.linkCopied', 'Link de download direto copiado.'));
  };
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    if (e.dataTransfer.files.length) report((await api()!.uploadFiles(e.dataTransfer.files)).results);
  };
  const expiresIn = (at: number) => {
    const h = Math.max(0, (at - now.current) / 3600000);
    return h >= 1 ? t('share.expiresH', 'expira em {n} h').replace('{n}', h.toFixed(0)) : t('share.expiresM', 'expira em {n} min').replace('{n}', String(Math.ceil(h * 60)));
  };
  const capture = async (region = false) => {
    setBusy(region ? 'region' : 'capture'); setNotice(null);
    try {
      const r: ShareShotResult = region ? await api()!.captureRegion() : await api()!.capture();
      if (!r.ok) setNotice({ tone: 'err', text: r.error || '' });
      else if (r.cancelled) setNotice(null);
      else setNotice({ tone: r.uploadError ? 'err' : 'ok', text: r.uploadError ? r.uploadError : r.entry ? t('share.shotUploaded', 'Print {w}x{h} enviado; link direto copiado.').replace('{w}', String(r.width)).replace('{h}', String(r.height)) : t('share.shotSaved', 'Print {w}x{h} salvo ({kb}) em {ms} ms.').replace('{w}', String(r.width)).replace('{h}', String(r.height)).replace('{kb}', fmtBytes(r.bytes || 0)).replace('{ms}', String(r.ms)) });
      void refreshShots();
    } finally { setBusy(null); }
  };
  const c = st.config;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      <PageHeader
        title={t('share.title', 'Susuya')}
        subtitle={t('share.subtitle', 'Envie arquivos de até 600 MB para o Susuya e compartilhe por link de download direto. Prints em resolução nativa, sem perda, com envio em um atalho.')}
        actions={<button type="button" className="dh-btn" onClick={() => window.darkhub?.shell.openExternal('https://susuya.darkhub.ink/')}><ExternalLink size={14} />susuya.darkhub.ink</button>}
      />
      {notice ? <p role={notice.tone === 'err' ? 'alert' : 'status'} className={`text-[12.5px] ${notice.tone === 'err' ? 'text-red-300' : 'text-blue-200'}`}>{notice.text}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        <section className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            className={`dh-card p-6 border-dashed flex flex-col items-center justify-center gap-3 text-center transition-colors ${drag ? 'border-blue-400 bg-blue-500/[0.06]' : ''}`}
          >
            <UploadCloud size={22} className="text-zinc-400" />
            <p className="text-[13px] text-zinc-200">{t('share.drop', 'Arraste arquivos aqui ou')}</p>
            <div className="flex items-center gap-2">
              <button type="button" className="dh-btn dh-btn-primary" onClick={async () => report((await api()!.pickAndUpload()).results)}>{t('share.pick', 'Escolher arquivos')}</button>
              <select className="dh-input" value={c.ttl} onChange={(e) => setConfig({ ttl: Number(e.target.value) })} aria-label={t('share.ttl', 'Validade do link')}>
                {TTL_HOURS.map((h) => <option key={h} value={h * 3600}>{t('share.ttlH', 'Link por {n} h').replace('{n}', String(h))}</option>)}
              </select>
            </div>
            <p className="dh-help">{t('share.dropHelp', 'O link de download direto vai para a área de transferência quando o envio termina.')}</p>
          </div>

          {Object.entries(jobs).length ? (
            <ul className="dh-card p-4 space-y-3">
              {Object.entries(jobs).map(([id, j]) => (
                <li key={id} className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[12.5px]">
                    <span className="truncate flex-1 text-zinc-200">{j.name}</span>
                    <span className="font-mono text-zinc-500">{Math.round((j.sent / Math.max(1, j.total)) * 100)}%</span>
                    <button type="button" className="dh-btn dh-btn-ghost dh-btn-sm" aria-label={t('share.cancel', 'Cancelar')} onClick={() => api()!.cancel(id)}><X size={14} /></button>
                  </div>
                  <div className="h-1 rounded-full bg-zinc-800 overflow-hidden"><div className="h-full bg-blue-400 transition-[width] duration-150" style={{ width: `${(j.sent / Math.max(1, j.total)) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="dh-card p-4 space-y-3">
            <h2 className="dh-section-title">{t('share.recent', 'Links ativos')}</h2>
            {st.history.length === 0 ? <p className="dh-help">{t('share.none', 'Nenhum arquivo enviado ainda.')}</p> : (
              <ul className="divide-y divide-zinc-800/80">
                {st.history.map((h) => (
                  <LinkRow key={h.id} h={h} t={t} copy={copy} expiresIn={expiresIn} onRemove={async () => setSt(await api()!.remove(h.id))} />
                ))}
              </ul>
            )}
          </div>
        </section>

        <aside className="dh-card p-4 space-y-4">
          <div>
            <h2 className="dh-section-title flex items-center gap-2"><Camera size={15} className="text-zinc-400" />{t('share.shots', 'Capturas de tela')}</h2>
            <p className="dh-help mt-1">{t('share.shotsDesc', 'Selecione uma área como no Recorte do Windows ou capture o monitor onde está o mouse, em resolução física e PNG sem perda.')}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="dh-btn dh-btn-primary" disabled={busy !== null} onClick={() => capture(true)} title={t('share.captureRegionHelp', 'Congela a tela; arraste para escolher a área. Esc cancela.')}>
              {busy === 'region' ? <Loader2 size={14} className="animate-spin" /> : <ScreenRegion size={14} />}{t('share.captureRegion', 'Selecionar área')}
            </button>
            <button type="button" className="dh-btn" disabled={busy !== null} onClick={() => capture(false)}>
              {busy === 'capture' ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}{t('share.captureNow', 'Tela inteira')}
            </button>
          </div>
          <HotkeyField label={t('share.regionHotkey', 'Atalho: área')} value={c.regionHotkey} active={st.regionHotkeyActive} onChange={(acc) => void setConfig({ regionHotkey: acc })} />
          <HotkeyField label={t('share.hotkey', 'Atalho: tela inteira')} value={c.hotkey} active={st.hotkeyActive} onChange={(acc) => void setConfig({ hotkey: acc })} />
          <label className="flex items-center gap-2.5 text-[12.5px] text-zinc-300">
            <input type="checkbox" checked={c.autoUpload} onChange={(e) => setConfig({ autoUpload: e.target.checked })} />
            {t('share.autoUpload', 'Enviar ao Susuya e copiar o link')}
          </label>
          <label className="flex items-center justify-between gap-2.5 text-[12.5px] text-zinc-300">
            {t('share.clip', 'Área de transferência')}
            <select className="dh-input" value={c.clip} onChange={(e) => setConfig({ clip: e.target.value as typeof c.clip })}>
              <option value="image">{t('share.clip.image', 'Copiar a imagem')}</option>
              <option value="link" disabled={!c.autoUpload}>{t('share.clip.link', 'Copiar o link do Susuya')}</option>
              <option value="both" disabled={!c.autoUpload}>{t('share.clip.both', 'Imagem e link')}</option>
              <option value="none">{t('share.clip.none', 'Não copiar')}</option>
            </select>
          </label>
          {c.clip === 'both' ? <p className="dh-help">{t('share.clip.bothHelp', 'Colar dá a imagem em apps de imagem (Discord, Paint) e o link em campos de texto.')}</p> : null}
          <label className="flex items-center gap-2.5 text-[12.5px] text-zinc-300">
            <input type="checkbox" checked={c.sound} onChange={(e) => setConfig({ sound: e.target.checked })} />
            {t('share.sound', 'Som de câmera ao tirar print')}
          </label>
          <button type="button" className="dh-btn dh-btn-sm" onClick={() => api()!.openFolder()}><FolderOpen size={14} />{t('share.openFolder', 'Abrir pasta')}</button>
          <ul className="space-y-1.5 border-t border-zinc-800/80 pt-3">
            {shots.length === 0 ? <li className="dh-help">{t('share.noShots', 'Nenhum print ainda.')}</li> : shots.map((s) => (
              <li key={s.file} className="flex items-center gap-2 text-[12px]">
                <span className="truncate flex-1 text-zinc-300" title={s.file}>{s.name}</span>
                <span className="text-zinc-500 font-mono">{fmtBytes(s.bytes)}</span>
                <button type="button" className="dh-btn dh-btn-ghost dh-btn-sm" title={t('share.send', 'Enviar ao Susuya')} aria-label={t('share.send', 'Enviar ao Susuya')} onClick={async () => { const r = await api()!.uploadScreenshot(s.file); report([r]); }}><UploadCloud size={14} /></button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
