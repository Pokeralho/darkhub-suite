import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Download, Pause, Play, X, Trash2, FolderOpen, Settings2, Link2, PauseCircle, PlayCircle, Eraser, AlertTriangle, CheckCircle2, Clock
} from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import type { DownloadItem, DownloadSettings } from '../global';

const formatBytes = (n: number) => {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

const formatEta = (s: number | null) => {
  if (s == null) return '—';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
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

  const errorText = useCallback((code?: string | null) => {
    switch (code) {
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
    let added = 0;
    let lastError = '';
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
      queued: { label: t('downloads.status.queued', 'Na fila'), cls: 'bg-zinc-800 text-zinc-300' },
      downloading: { label: t('downloads.status.downloading', 'Baixando'), cls: 'bg-blue-500/20 text-blue-300' },
      paused: { label: t('downloads.status.paused', 'Pausado'), cls: 'bg-amber-500/20 text-amber-300' },
      completed: { label: t('downloads.status.completed', 'Concluído'), cls: 'bg-emerald-500/20 text-emerald-300' },
      error: { label: t('downloads.status.error', 'Erro'), cls: 'bg-red-500/20 text-red-300' },
      canceled: { label: t('downloads.status.canceled', 'Cancelado'), cls: 'bg-zinc-800 text-zinc-500' }
    };
    return map[s];
  };

  const dl = window.darkhub?.downloads;
  const totalSpeed = items.reduce((a, i) => a + (i.status === 'downloading' ? i.speedBps : 0), 0);
  const maxConn = settings?.maxConnections ?? 32;

  return (
    <div className="space-y-5 w-full pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2"><Download size={20} className="text-blue-400" />{t('downloads.title', 'Gerenciador de Downloads')}</h1>
          <p className="text-xs text-zinc-500 mt-1">{t('downloads.subtitle', 'Downloads segmentados com várias conexões, pausa/retomada, fila e limite de velocidade.')}</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono text-zinc-400">{formatBytes(totalSpeed)}/s</span>
          <button onClick={() => dl?.resumeAll?.()} className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 flex items-center gap-1.5"><PlayCircle size={14} />{t('downloads.resumeAll', 'Retomar todos')}</button>
          <button onClick={() => dl?.pauseAll?.()} className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 flex items-center gap-1.5"><PauseCircle size={14} />{t('downloads.pauseAll', 'Pausar todos')}</button>
          <button onClick={() => dl?.clearFinished?.()} className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 flex items-center gap-1.5"><Eraser size={14} />{t('downloads.clearFinished', 'Limpar concluídos')}</button>
          <button onClick={() => setShowSettings((v) => !v)} className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 ${showSettings ? 'bg-blue-600 text-white' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'}`}><Settings2 size={14} />{t('downloads.settings', 'Configurações')}</button>
        </div>
      </div>

      {message && (
        <div className={`px-3 py-2 rounded-lg text-xs flex items-center gap-2 ${message.ok ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/10 text-red-300 border border-red-500/30'}`}>
          {message.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}{message.text}
        </div>
      )}

      {/* Add */}
      <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-3">
        <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5"><Link2 size={14} />{t('downloads.addLabel', 'Links para baixar (um por linha)')}</label>
        <textarea
          value={urlText}
          onChange={(e) => setUrlText(e.target.value)}
          rows={3}
          placeholder="https://exemplo.com/arquivo.zip"
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono focus:outline-none focus:border-blue-600 select-text"
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-zinc-400 flex items-center gap-2">
            {t('downloads.connections', 'Conexões')}
            <input type="number" min={1} max={maxConn} value={connections}
              placeholder={String(settings?.defaultConnections ?? 8)}
              onChange={(e) => setConnections(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-16 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200" />
          </label>
          <button onClick={() => setShowAdvanced((v) => !v)} className="text-xs text-zinc-400 hover:text-zinc-200 underline underline-offset-2">
            {showAdvanced ? t('downloads.hideAdvanced', 'Ocultar opções avançadas') : t('downloads.showAdvanced', 'Opções avançadas')}
          </button>
          <button onClick={handleAdd} className="ml-auto px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5">
            <Download size={14} />{t('downloads.start', 'Baixar')}
          </button>
        </div>
        {showAdvanced && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-zinc-800">
            <label className="text-xs text-zinc-400 space-y-1 block">{t('downloads.fileName', 'Nome do arquivo (somente com 1 link)')}
              <input value={fileName} onChange={(e) => setFileName(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200 select-text" /></label>
            <label className="text-xs text-zinc-400 space-y-1 block">{t('downloads.speedLimit', 'Limite de velocidade deste download (KB/s, 0 = sem limite)')}
              <input type="number" min={0} value={speedLimit} onChange={(e) => setSpeedLimit(e.target.value === '' ? '' : Number(e.target.value))} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200" /></label>
            <label className="text-xs text-zinc-400 space-y-1 block">SHA-256 ({t('downloads.optional', 'opcional')})
              <input value={sha256} onChange={(e) => setSha256(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200 font-mono select-text" /></label>
            <label className="text-xs text-zinc-400 space-y-1 block">Referer ({t('downloads.optional', 'opcional')})
              <input value={referer} onChange={(e) => setReferer(e.target.value)} placeholder="https://" className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200 font-mono select-text" /></label>
          </div>
        )}
      </div>

      {/* Settings */}
      {showSettings && settings && (
        <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-zinc-300">
          <div className="md:col-span-2 flex items-center gap-2">
            <span className="text-zinc-400">{t('downloads.saveTo', 'Salvar em:')}</span>
            <span className="font-mono text-zinc-200 truncate flex-1 select-text">{settings.downloadDir}</span>
            <button onClick={chooseDir} className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 flex items-center gap-1.5"><FolderOpen size={13} />{t('downloads.choose', 'Escolher')}</button>
          </div>
          <label className="flex items-center justify-between gap-3">{t('downloads.maxConcurrent', 'Downloads simultâneos')}
            <input type="number" min={1} max={10} value={settings.maxConcurrent} onChange={(e) => saveSettings({ maxConcurrent: Number(e.target.value) })} className="w-20 bg-zinc-950 border border-zinc-800 rounded px-2 py-1" /></label>
          <label className="flex items-center justify-between gap-3">{t('downloads.defaultConnections', 'Conexões por download (padrão)')}
            <input type="number" min={1} max={settings.maxConnections} value={settings.defaultConnections} onChange={(e) => saveSettings({ defaultConnections: Number(e.target.value) })} className="w-20 bg-zinc-950 border border-zinc-800 rounded px-2 py-1" /></label>
          <label className="flex items-center justify-between gap-3">{t('downloads.maxConnections', 'Máximo de conexões permitido')}
            <input type="number" min={1} max={64} value={settings.maxConnections} onChange={(e) => saveSettings({ maxConnections: Number(e.target.value) })} className="w-20 bg-zinc-950 border border-zinc-800 rounded px-2 py-1" /></label>
          <label className="flex items-center justify-between gap-3">{t('downloads.globalLimit', 'Limite global de velocidade (KB/s, 0 = sem limite)')}
            <input type="number" min={0} value={settings.globalSpeedLimitKBps} onChange={(e) => saveSettings({ globalSpeedLimitKBps: Number(e.target.value) })} className="w-24 bg-zinc-950 border border-zinc-800 rounded px-2 py-1" /></label>
          <label className="flex items-center justify-between gap-3">{t('downloads.retries', 'Tentativas em caso de falha')}
            <input type="number" min={0} max={20} value={settings.retries} onChange={(e) => saveSettings({ retries: Number(e.target.value) })} className="w-20 bg-zinc-950 border border-zinc-800 rounded px-2 py-1" /></label>
          <label className="flex items-center justify-between gap-3">{t('downloads.organize', 'Organizar em pastas por tipo (Vídeo, Compactados…)')}
            <input type="checkbox" checked={settings.organizeByCategory} onChange={(e) => saveSettings({ organizeByCategory: e.target.checked })} className="w-4 h-4" /></label>
          <div className="md:col-span-2 flex flex-wrap items-center gap-3 pt-2 border-t border-zinc-800">
            <label className="flex items-center gap-2"><input type="checkbox" checked={settings.schedule.enabled} onChange={(e) => saveSettings({ schedule: { ...settings.schedule, enabled: e.target.checked } })} className="w-4 h-4" />
              <Clock size={13} />{t('downloads.schedule', 'Baixar somente neste horário')}</label>
            <input type="time" value={settings.schedule.start} onChange={(e) => saveSettings({ schedule: { ...settings.schedule, start: e.target.value } })} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1" />
            <span>→</span>
            <input type="time" value={settings.schedule.stop} onChange={(e) => saveSettings({ schedule: { ...settings.schedule, stop: e.target.value } })} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1" />
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-2">
        {items.length === 0 && (
          <div className="p-8 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-2xl">{t('downloads.empty', 'Nenhum download ainda. Cole um link acima para começar.')}</div>
        )}
        {items.map((it) => {
          const badge = statusBadge(it.status);
          const pct = it.size > 0 ? Math.min(100, (it.downloaded / it.size) * 100) : 0;
          return (
            <div key={it.id} className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-2">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-zinc-100 truncate select-text" title={it.fileName}>{it.fileName}</div>
                  <div className="text-[11px] text-zinc-500 truncate select-text" title={it.url}>{it.url}</div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${badge.cls}`}>{badge.label}</span>
                <div className="flex items-center gap-1">
                  {(it.status === 'downloading' || it.status === 'queued') && (
                    <button title={t('downloads.pause', 'Pausar')} onClick={() => dl?.pause?.(it.id)} className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200"><Pause size={14} /></button>
                  )}
                  {(it.status === 'paused' || it.status === 'error' || it.status === 'canceled') && (
                    <button title={t('downloads.resume', 'Retomar')} onClick={() => dl?.resume?.(it.id)} className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200"><Play size={14} /></button>
                  )}
                  {it.status === 'completed' && (
                    <button title={t('downloads.showInFolder', 'Mostrar na pasta')} onClick={() => dl?.showInFolder?.(it.id)} className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200"><FolderOpen size={14} /></button>
                  )}
                  {(it.status === 'downloading' || it.status === 'queued' || it.status === 'paused') && (
                    <button title={t('downloads.cancel', 'Cancelar')} onClick={() => dl?.cancel?.(it.id)} className="p-1.5 rounded bg-zinc-800 hover:bg-red-600/70 text-zinc-200"><X size={14} /></button>
                  )}
                  <button title={t('downloads.remove', 'Remover da lista')} onClick={() => dl?.remove?.(it.id)} className="p-1.5 rounded bg-zinc-800 hover:bg-red-600/70 text-zinc-200"><Trash2 size={14} /></button>
                </div>
              </div>

              {(it.status === 'downloading' || it.status === 'paused' || it.status === 'queued') && (
                <>
                  {it.segments.length > 1 ? (
                    <div className="flex h-2 gap-px rounded overflow-hidden bg-zinc-800">
                      {it.segments.map((f, i) => (
                        <div key={i} className="flex-1 bg-zinc-800 relative"><div className="absolute inset-y-0 left-0 bg-blue-500" style={{ width: `${f * 100}%` }} /></div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-2 rounded bg-zinc-800 overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${pct}%` }} /></div>
                  )}
                  <div className="flex flex-wrap justify-between text-[11px] text-zinc-400 font-mono">
                    <span>{formatBytes(it.downloaded)} / {it.size > 0 ? formatBytes(it.size) : '?'} {it.size > 0 && `(${pct.toFixed(1)}%)`}</span>
                    {it.status === 'downloading' && <span>{formatBytes(it.speedBps)}/s · ETA {formatEta(it.etaSeconds)} · {it.connections}x{it.resumable ? '' : ` (${t('downloads.noResume', 'sem retomada')})`}</span>}
                  </div>
                </>
              )}
              {it.status === 'completed' && <div className="text-[11px] text-zinc-500 font-mono truncate select-text">{it.filePath} · {formatBytes(it.size)}</div>}
              {it.status === 'error' && <div className="text-[11px] text-red-300">{errorText(it.error)}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Downloads;
