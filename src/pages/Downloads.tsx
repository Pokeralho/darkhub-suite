import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Download, Pause, Play, X, Trash2, FolderOpen, Settings2, PauseCircle, PlayCircle, Eraser
} from '../components/icons';
import PageHeader from '../components/ui/PageHeader';
import { useI18n } from '../i18n/I18nProvider';
import type { DownloadItem, DownloadSettings } from '../global';

const formatBytes = (n: number) => {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

const formatEta = (s: number | null) => {
  if (s == null) return '-';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
};

// Number in mono with a dimmer unit, e.g. "12.4 MB".
const Bytes: React.FC<{ n: number; suffix?: string }> = ({ n, suffix = '' }) => {
  const [v, u] = formatBytes(n).split(' ');
  return <span className="font-mono text-zinc-300">{v}<span className="text-zinc-500"> {u}{suffix}</span></span>;
};

const Downloads: React.FC = () => {
  const { t } = useI18n();
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [settings, setSettings] = useState<DownloadSettings | null>(null);
  const [urlText, setUrlText] = useState('');
  const [fileName, setFileName] = useState('');
  const [connections, setConnections] = useState<number | ''>('');
  const [speedLimit, setSpeedLimit] = useState<number | ''>('');
  const [sha256, setSha256] = useState('');
  const [referer, setReferer] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const errorText = useCallback((code?: string | null) => {
    // main-process codes may carry detail after a space, e.g. "range-not-honoured (HTTP 200)"
    switch (code?.split(' ')[0]) {
      case 'insecure-redirect': return t('downloads.err.insecureRedirect', 'O servidor tentou redirecionar de HTTPS para HTTP inseguro. Download bloqueado.');
      case 'too-many-redirects': return t('downloads.err.redirects', 'Redirecionamentos demais.');
      case 'invalid-url': return t('downloads.err.invalidUrl', 'Link inválido.');
      case 'unsupported-protocol': return t('downloads.err.protocol', 'Somente links http:// e https:// são aceitos.');
      case 'sha256-mismatch': return t('downloads.err.sha', 'O SHA-256 do arquivo não confere. O arquivo foi descartado.');
      case 'not-enough-disk-space': return t('downloads.err.disk', 'Espaço em disco insuficiente.');
      case 'range-not-honoured': return t('downloads.err.range', 'O servidor parou de aceitar downloads parciais.');
      default: return code ?? '';
    }
  }, [t]);

  const refresh = useCallback(async () => {
    const res = await window.darkhub?.downloads?.list?.();
    if (res?.ok) {
      setItems(res.items ?? []);
      if (res.settings) setSettings(res.settings);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
    const unsub = window.darkhub?.downloads?.onUpdate?.((list) => setItems(list));
    const onVisible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsub?.();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const flash = (ok: boolean, text: string) => {
    setMessage({ ok, text });
    window.setTimeout(() => setMessage(null), 4000);
  };

  const urls = useMemo(() => urlText.split(/\s+/).map((u) => u.trim()).filter(Boolean), [urlText]);

  const handleAdd = async () => {
    if (!urls.length) { flash(false, t('downloads.err.noUrl', 'Cole ao menos um link.')); return; }
    if (adding) return;
    setAdding(true);
    let added = 0;
    let lastError = '';
    try {
      for (const url of urls) {
        const res = await window.darkhub?.downloads?.add?.({
          url,
          fileName: urls.length === 1 && fileName.trim() ? fileName.trim() : undefined,
          connections: connections === '' ? undefined : Number(connections),
          speedLimitKBps: speedLimit === '' ? undefined : Number(speedLimit),
          sha256: urls.length === 1 && sha256.trim() ? sha256.trim() : undefined,
          referer: referer.trim() || undefined
        });
        if (res?.ok) added += 1;
        else lastError = errorText(res?.error);
      }
    } finally {
      setAdding(false);
    }
    if (added) {
      setUrlText(''); setFileName(''); setSha256('');
      flash(true, t('downloads.added', '{n} download(s) adicionado(s).').replace('{n}', String(added)));
    }
    if (lastError) flash(false, lastError);
    await refresh();
  };

  const saveSettings = async (patch: Partial<DownloadSettings>) => {
    const res = await window.darkhub?.downloads?.setSettings?.(patch);
    if (res?.ok && res.settings) setSettings(res.settings);
  };

  const chooseDir = async () => {
    const res = await window.darkhub?.downloads?.chooseDir?.();
    if (res?.ok && res.dir) await saveSettings({ downloadDir: res.dir });
  };

  const statusBadge = (s: DownloadItem['status']) => {
    const map: Record<DownloadItem['status'], { label: string; cls: string }> = {
      queued: { label: t('downloads.status.queued', 'Na fila'), cls: 'text-zinc-400' },
      downloading: { label: t('downloads.status.downloading', 'Baixando'), cls: 'text-blue-300' },
      paused: { label: t('downloads.status.paused', 'Pausado'), cls: 'text-amber-300' },
      completed: { label: t('downloads.status.completed', 'Concluído'), cls: 'text-emerald-300' },
      error: { label: t('downloads.status.error', 'Erro'), cls: 'text-red-300' },
      canceled: { label: t('downloads.status.canceled', 'Cancelado'), cls: 'text-zinc-500' }
    };
    return map[s];
  };

  const dl = window.darkhub?.downloads;
  const totalSpeed = items.reduce((a, i) => a + (i.status === 'downloading' ? i.speedBps : 0), 0);
  const maxConn = settings?.maxConnections ?? 32;
  const iconBtn = 'dh-btn dh-btn-ghost dh-btn-sm !px-1.5';

  return (
    <div className="space-y-6 w-full pb-8">
      <PageHeader
        title={t('downloads.title', 'Gerenciador de Downloads')}
        subtitle={t('downloads.subtitle', 'Downloads segmentados com várias conexões, pausa/retomada, fila e limite de velocidade.')}
        actions={
          <>
            <span className="text-xs mr-1"><Bytes n={totalSpeed} suffix="/s" /></span>
            <button onClick={() => dl?.resumeAll?.()} className="dh-btn dh-btn-ghost dh-btn-sm"><PlayCircle size={14} />{t('downloads.resumeAll', 'Retomar todos')}</button>
            <button onClick={() => dl?.pauseAll?.()} className="dh-btn dh-btn-ghost dh-btn-sm"><PauseCircle size={14} />{t('downloads.pauseAll', 'Pausar todos')}</button>
            <button onClick={() => dl?.clearFinished?.()} className="dh-btn dh-btn-ghost dh-btn-sm"><Eraser size={14} />{t('downloads.clearFinished', 'Limpar concluídos')}</button>
            <button onClick={() => setShowSettings((v) => !v)} aria-pressed={showSettings} className={`dh-btn dh-btn-sm ${showSettings ? 'bg-zinc-800 text-zinc-50' : ''}`}><Settings2 size={14} className={showSettings ? 'text-blue-300' : ''} />{t('downloads.settings', 'Configurações')}</button>
          </>
        }
      />

      {/* Add */}
      <section className="dh-card p-4 space-y-3">
        <label htmlFor="dl-urls" className="dh-label block">{t('downloads.addLabel', 'Links para baixar (um por linha)')}</label>
        <textarea
          id="dl-urls"
          value={urlText}
          onChange={(e) => setUrlText(e.target.value)}
          rows={3}
          placeholder="https://exemplo.com/arquivo.zip"
          className="dh-input w-full !h-auto py-2 font-mono text-xs select-text resize-y"
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="dh-label flex items-center gap-2">
            {t('downloads.connections', 'Conexões')}
            <input type="number" min={1} max={maxConn} value={connections}
              placeholder={settings?.defaultConnections ? String(settings.defaultConnections) : t('downloads.auto', 'Auto')}
              onChange={(e) => setConnections(e.target.value === '' ? '' : Number(e.target.value))}
              className="dh-input w-16 font-mono" />
          </label>
          <button onClick={() => setShowAdvanced((v) => !v)} className="dh-btn dh-btn-ghost dh-btn-sm">
            {showAdvanced ? t('downloads.hideAdvanced', 'Ocultar opções avançadas') : t('downloads.showAdvanced', 'Opções avançadas')}
          </button>
          <button onClick={handleAdd} disabled={adding || !urls.length} className="dh-btn dh-btn-primary ml-auto">
            <Download size={14} />{t('downloads.start', 'Baixar')}
          </button>
        </div>
        {message && (
          <p role="status" className={`text-xs ${message.ok ? 'text-emerald-300' : 'text-red-300'}`}>{message.text}</p>
        )}
        {showAdvanced && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-zinc-800/80">
            <label className="dh-label space-y-1.5 block">{t('downloads.fileName', 'Nome do arquivo (somente com 1 link)')}
              <input value={fileName} onChange={(e) => setFileName(e.target.value)} className="dh-input w-full select-text" /></label>
            <label className="dh-label space-y-1.5 block">{t('downloads.speedLimit', 'Limite de velocidade deste download (KB/s, 0 = sem limite)')}
              <input type="number" min={0} value={speedLimit} onChange={(e) => setSpeedLimit(e.target.value === '' ? '' : Number(e.target.value))} className="dh-input w-full font-mono" /></label>
            <label className="dh-label space-y-1.5 block">SHA-256 ({t('downloads.optional', 'opcional')})
              <input value={sha256} onChange={(e) => setSha256(e.target.value)} className="dh-input w-full font-mono select-text" /></label>
            <label className="dh-label space-y-1.5 block">Referer ({t('downloads.optional', 'opcional')})
              <input value={referer} onChange={(e) => setReferer(e.target.value)} placeholder="https://" className="dh-input w-full font-mono select-text" /></label>
          </div>
        )}
      </section>

      {/* Settings */}
      {showSettings && settings && (
        <section className="dh-card p-4 space-y-4">
          <h2 className="dh-section-title">{t('downloads.settings', 'Configurações')}</h2>
          <div className="flex items-center gap-3 text-xs">
            <span className="dh-label shrink-0">{t('downloads.saveTo', 'Salvar em:')}</span>
            <span className="font-mono text-zinc-300 truncate flex-1 select-text">{settings.downloadDir}</span>
            <button onClick={chooseDir} className="dh-btn dh-btn-sm"><FolderOpen size={14} />{t('downloads.choose', 'Escolher')}</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-[12.5px] text-zinc-300">
            <label className="flex items-center justify-between gap-3">{t('downloads.maxConcurrent', 'Downloads simultâneos')}
              <input type="number" min={1} max={10} value={settings.maxConcurrent} onChange={(e) => saveSettings({ maxConcurrent: Number(e.target.value) })} className="dh-input w-20 font-mono" /></label>
            <label className="flex items-center justify-between gap-3">{t('downloads.defaultConnections', 'Conexões por download (padrão)')}
              <input type="number" min={0} max={settings.maxConnections} value={settings.defaultConnections || ''} placeholder={t('downloads.auto', 'Auto')} title={t('downloads.autoHelp', 'Vazio = automático pelo tamanho do arquivo (1 a 16 conexões)')} onChange={(e) => saveSettings({ defaultConnections: e.target.value === '' ? 0 : Number(e.target.value) })} className="dh-input w-20 font-mono" /></label>
            <label className="flex items-center justify-between gap-3">{t('downloads.maxConnections', 'Máximo de conexões permitido')}
              <input type="number" min={1} max={64} value={settings.maxConnections} onChange={(e) => saveSettings({ maxConnections: Number(e.target.value) })} className="dh-input w-20 font-mono" /></label>
            <label className="flex items-center justify-between gap-3">{t('downloads.globalLimit', 'Limite global de velocidade (KB/s, 0 = sem limite)')}
              <input type="number" min={0} value={settings.globalSpeedLimitKBps} onChange={(e) => saveSettings({ globalSpeedLimitKBps: Number(e.target.value) })} className="dh-input w-24 font-mono" /></label>
            <label className="flex items-center justify-between gap-3">{t('downloads.retries', 'Tentativas em caso de falha')}
              <input type="number" min={0} max={20} value={settings.retries} onChange={(e) => saveSettings({ retries: Number(e.target.value) })} className="dh-input w-20 font-mono" /></label>
            <label className="flex items-center justify-between gap-3">{t('downloads.organize', 'Organizar em pastas por tipo (Vídeo, Compactados…)')}
              <input type="checkbox" checked={settings.organizeByCategory} onChange={(e) => saveSettings({ organizeByCategory: e.target.checked })} /></label>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-zinc-800/80 text-[12.5px] text-zinc-300">
            <label className="flex items-center gap-2"><input type="checkbox" checked={settings.schedule.enabled} onChange={(e) => saveSettings({ schedule: { ...settings.schedule, enabled: e.target.checked } })} />
              {t('downloads.schedule', 'Baixar somente neste horário')}</label>
            <input type="time" value={settings.schedule.start} onChange={(e) => saveSettings({ schedule: { ...settings.schedule, start: e.target.value } })} className="dh-input font-mono" />
            <span className="text-zinc-500">→</span>
            <input type="time" value={settings.schedule.stop} onChange={(e) => saveSettings({ schedule: { ...settings.schedule, stop: e.target.value } })} className="dh-input font-mono" />
          </div>
        </section>
      )}

      {/* List */}
      <section>
        {!loaded ? (
          <div className="divide-y divide-zinc-800/80 border-y border-zinc-800/80" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="py-3 space-y-2">
                <div className="h-3.5 w-1/3 rounded bg-zinc-900 animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-zinc-900 animate-pulse" />
                <div className="h-1 w-full rounded bg-zinc-900 animate-pulse" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center border border-dashed border-zinc-800 rounded-xl">
            <p className="text-[12.5px] text-zinc-500">{t('downloads.empty', 'Nenhum download ainda. Cole um link acima para começar.')}</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/80 border-y border-zinc-800/80">
            {items.map((it) => {
              const badge = statusBadge(it.status);
              const pct = it.size > 0 ? Math.min(100, (it.downloaded / it.size) * 100) : 0;
              return (
                <div key={it.id} className="py-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-zinc-100 truncate select-text" title={it.fileName}>{it.fileName}</div>
                      <div className="text-[11px] text-zinc-500 font-mono truncate select-text" title={it.url}>{it.url}</div>
                    </div>
                    <span className={`text-[11px] ${badge.cls}`}>{badge.label}</span>
                    <div className="flex items-center gap-0.5">
                      {(it.status === 'downloading' || it.status === 'queued') && (
                        <button title={t('downloads.pause', 'Pausar')} aria-label={t('downloads.pause', 'Pausar')} onClick={() => dl?.pause?.(it.id)} className={iconBtn}><Pause size={14} /></button>
                      )}
                      {(it.status === 'paused' || it.status === 'error' || it.status === 'canceled') && (
                        <button title={t('downloads.resume', 'Retomar')} aria-label={t('downloads.resume', 'Retomar')} onClick={() => dl?.resume?.(it.id)} className={iconBtn}><Play size={14} /></button>
                      )}
                      {it.status === 'completed' && (
                        <button title={t('downloads.showInFolder', 'Mostrar na pasta')} aria-label={t('downloads.showInFolder', 'Mostrar na pasta')} onClick={() => dl?.showInFolder?.(it.id)} className={iconBtn}><FolderOpen size={14} /></button>
                      )}
                      {(it.status === 'downloading' || it.status === 'queued' || it.status === 'paused') && (
                        <button title={t('downloads.cancel', 'Cancelar')} aria-label={t('downloads.cancel', 'Cancelar')} onClick={() => dl?.cancel?.(it.id)} className={`${iconBtn} hover:!text-red-300`}><X size={14} /></button>
                      )}
                      <button title={t('downloads.remove', 'Remover da lista')} aria-label={t('downloads.remove', 'Remover da lista')} onClick={() => dl?.remove?.(it.id)} className={`${iconBtn} hover:!text-red-300`}><Trash2 size={14} /></button>
                    </div>
                  </div>

                  {(it.status === 'downloading' || it.status === 'paused' || it.status === 'queued') && (
                    <>
                      {it.segments.length > 1 ? (
                        <div className="flex h-1 gap-px rounded-full overflow-hidden">
                          {it.segments.map((f, i) => (
                            <div key={i} className="flex-1 bg-zinc-800 relative"><div className="absolute inset-y-0 left-0 bg-blue-400" style={{ width: `${f * 100}%` }} /></div>
                          ))}
                        </div>
                      ) : (
                        <div className="h-1 rounded-full bg-zinc-800 overflow-hidden"><div className="h-full bg-blue-400 transition-[width] duration-200 ease-out" style={{ width: `${pct}%` }} /></div>
                      )}
                      <div className="flex flex-wrap justify-between gap-2 text-[11px] text-zinc-500">
                        <span>
                          <Bytes n={it.downloaded} /> / {it.size > 0 ? <Bytes n={it.size} /> : <span className="font-mono">?</span>}
                          {it.size > 0 && <span className="font-mono text-zinc-300 ml-2">{pct.toFixed(1)}<span className="text-zinc-500">%</span></span>}
                        </span>
                        {it.status === 'downloading' && (
                          <span className="flex items-center gap-3">
                            <Bytes n={it.speedBps} suffix="/s" />
                            <span>ETA <span className="font-mono text-zinc-300">{formatEta(it.etaSeconds)}</span></span>
                            <span><span className="font-mono text-zinc-300">{it.connections}</span><span className="font-mono">x</span>{it.resumable ? '' : ` (${t('downloads.noResume', 'sem retomada')})`}</span>
                          </span>
                        )}
                      </div>
                    </>
                  )}
                  {it.status === 'completed' && <div className="text-[11px] text-zinc-500 font-mono truncate select-text">{it.filePath} · {formatBytes(it.size)}</div>}
                  {it.status === 'error' && <div className="text-[11px] text-red-300">{errorText(it.error)}</div>}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default Downloads;
