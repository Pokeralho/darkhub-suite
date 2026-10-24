import React, { useEffect, useState } from 'react';
import {
  Download,
  Search,
  CheckCircle,
  AlertCircle,
  Loader2,
  Cookie,
  Music,
  Video,
  Sliders,
  ShieldCheck,
  Clock,
  Eye,
  ListMusic,
  Image as ImageIcon,
  Tag
} from '../components/icons';
import { useI18n } from '../i18n/I18nProvider';
import { HelpTip } from '../components/HelpTip';
import PageHeader from '../components/ui/PageHeader';

type DownloadPreset =
  | 'video-1080p'
  | 'video-4k'
  | 'video-720p'
  | 'video-480p'
  | 'audio-mp3'
  | 'audio-m4a'
  | 'audio-wav'
  | 'audio-flac'
  | 'audio-opus'
  | 'custom';

interface DownloadProgressState {
  percent: number;
  totalSize?: string;
  speed?: string;
  eta?: string;
  line: string;
  currentItem?: number;
  totalItems?: number;
}

interface VideoExtraOptions {
  container: 'mp4' | 'mkv' | 'webm';
  codec: 'best' | 'h264' | 'av1';
  subtitles: boolean;
  autoSubs: boolean;
  subLangs: string;
  chapters: '' | 'embed' | 'split';
  sponsorBlock: string[];
  sponsorMode: 'remove' | 'mark';
  trimStart: string;
  trimEnd: string;
  playlistItems: string;
  rateLimit: string;
  skipDownloaded: boolean;
  writeDescription: boolean;
  writeThumbnail: boolean;
}

const DEFAULT_EXTRA: VideoExtraOptions = {
  container: 'mp4', codec: 'best', subtitles: false, autoSubs: false, subLangs: 'pt.*,en.*', chapters: 'embed',
  sponsorBlock: [], sponsorMode: 'remove', trimStart: '', trimEnd: '', playlistItems: '', rateLimit: '',
  skipDownloaded: false, writeDescription: false, writeThumbnail: false
};

const SPONSOR_CATEGORIES = ['sponsor', 'selfpromo', 'interaction', 'intro', 'outro', 'preview', 'music_offtopic', 'filler'];

const YoutubeDownloader = () => {
  const { t } = useI18n();
  const [url, setUrl] = useState('');
  const [info, setInfo] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [preset, setPreset] = useState<DownloadPreset>('video-1080p');
  const [customFormatId, setCustomFormatId] = useState<string>('');
  const [progress, setProgress] = useState<DownloadProgressState | null>(null);

  const [downloadEntirePlaylist, setDownloadEntirePlaylist] = useState<boolean>(true);
  const [embedThumbnail, setEmbedThumbnail] = useState<boolean>(true);
  // extra yt-dlp options (see electron/services/ytdlpOptions.js), remembered between sessions
  const [extra, setExtra] = useState<VideoExtraOptions>(() => {
    try { return { ...DEFAULT_EXTRA, ...JSON.parse(localStorage.getItem('dh.video.extra') || '{}') }; } catch { return DEFAULT_EXTRA; }
  });
  const patchExtra = (p: Partial<VideoExtraOptions>) => setExtra((prev) => {
    const next = { ...prev, ...p };
    try { localStorage.setItem('dh.video.extra', JSON.stringify({ ...next, trimStart: '', trimEnd: '', playlistItems: '' })); } catch { /* storage off */ }
    return next;
  });
  const toggleSponsor = (c: string) => patchExtra({ sponsorBlock: extra.sponsorBlock.includes(c) ? extra.sponsorBlock.filter((x) => x !== c) : [...extra.sponsorBlock, c] });
  const [embedMetadata, setEmbedMetadata] = useState<boolean>(true);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [cookiesPath, setCookiesPath] = useState<string | null>(null);
  const [cookiesFromBrowser, setCookiesFromBrowser] = useState<string>('');
  const [client, setClient] = useState<string>('android,web');
  const [sleepIntervalSec, setSleepIntervalSec] = useState<number>(0);

  useEffect(() => {
    const saved = localStorage.getItem('darkhub.youtube.cookiesPath');
    if (saved) setCookiesPath(saved);
    const savedBrowser = localStorage.getItem('darkhub.youtube.cookiesFromBrowser');
    if (savedBrowser) setCookiesFromBrowser(savedBrowser);
    const savedClient = localStorage.getItem('darkhub.youtube.client');
    if (savedClient) setClient(savedClient);
    const savedSleep = localStorage.getItem('darkhub.youtube.sleepIntervalSec');
    if (savedSleep) setSleepIntervalSec(Number(savedSleep) || 0);

    if (window.darkhub?.youtube?.onProgress) {
      const unsubscribe = window.darkhub.youtube.onProgress((data) => {
        setProgress(data);
      });
      return () => unsubscribe();
    }
  }, []);

  const handlePickCookies = async () => {
    if (!window.darkhub) return;
    const res = await window.darkhub.dialog.selectFiles({
      title: t('youtube.cookieFileTitle', 'Selecionar arquivo de cookies (cookies.txt)'),
      filters: [{ name: 'Cookies (*.txt)', extensions: ['txt'] }]
    });
    const p = res?.filePaths?.[0];
    if (!res?.canceled && p) {
      setCookiesPath(p);
      localStorage.setItem('darkhub.youtube.cookiesPath', p);
      setDownloadStatus({
        ok: true,
        msg: t('youtube.cookiesSuccess', 'Cookies importados com sucesso! Agora você pode buscar qualquer vídeo restrito.')
      });
    }
  };

  const handleClearCookies = () => {
    setCookiesPath(null);
    localStorage.removeItem('darkhub.youtube.cookiesPath');
    setDownloadStatus({
      ok: true,
      msg: t('youtube.cookiesRemoved', 'Cookies removidos.')
    });
  };

  const handleChangeBrowserCookies = (value: string) => {
    setCookiesFromBrowser(value);
    if (value) localStorage.setItem('darkhub.youtube.cookiesFromBrowser', value);
    else localStorage.removeItem('darkhub.youtube.cookiesFromBrowser');
  };

  const handleChangeClient = (value: string) => {
    setClient(value);
    if (value) localStorage.setItem('darkhub.youtube.client', value);
    else localStorage.removeItem('darkhub.youtube.client');
  };

  const handleChangeSleep = (value: number) => {
    const v = Number.isFinite(value) ? value : 0;
    setSleepIntervalSec(v);
    localStorage.setItem('darkhub.youtube.sleepIntervalSec', String(v));
  };

  const handleSearch = async () => {
    if (!url.trim()) return;
    setIsSearching(true);
    setInfo(null);
    setDownloadStatus(null);
    setProgress(null);

    if (window.darkhub) {
      try {
        const videoInfo = await window.darkhub.youtube.getVideoInfo({
          url: url.trim(),
          cookiesPath,
          cookiesFromBrowser,
          client
        });
        setInfo(videoInfo);
        if (videoInfo?.isPlaylist) {
          setPreset('audio-mp3');
        }
      } catch (err: any) {
        setDownloadStatus({ ok: false, msg: err?.message ?? String(err) });
      }
    }
    setIsSearching(false);
  };

  const handleCancelDownload = async () => {
    if (!window.darkhub?.youtube?.cancel) return;
    try {
      await window.darkhub.youtube.cancel();
      setIsDownloading(false);
      setProgress(null);
      setDownloadStatus({ ok: false, msg: 'Download cancelado pelo usuário.' });
    } catch (err: any) {
      console.error('Failed to cancel download:', err);
    }
  };

  const handleDownload = async () => {
    if (!url || !info) return;
    setIsDownloading(true);
    setDownloadStatus(null);
    setProgress({
      percent: 0,
      totalSize: '',
      speed: '',
      eta: '',
      line: t('youtube.startingEngine', 'Iniciando engine de download...')
    });

    if (window.darkhub) {
      try {
        const folder = await window.darkhub.dialog.selectFolder({
          title: t('youtube.selectFolder', 'Selecionar Pasta de Destino')
        });
        if (folder.canceled || !folder.folderPath) {
          setIsDownloading(false);
          setProgress(null);
          return;
        }

        const res = await window.darkhub.youtube.download({
          url: url.trim(),
          outputDir: folder.folderPath,
          formatId: preset === 'custom' ? customFormatId : '',
          mode: preset === 'custom' ? 'video' : preset,
          cookiesPath,
          cookiesFromBrowser,
          client,
          sleepIntervalSec,
          downloadEntirePlaylist: info?.isPlaylist ? downloadEntirePlaylist : undefined,
          embedThumbnail,
          embedMetadata,
          extra
        });

        if (res.ok) {
          const successMsg = info?.isPlaylist && downloadEntirePlaylist
            ? t('youtube.successPlaylist', 'Playlist baixada e convertida com sucesso!')
            : t('youtube.successSingle', 'Download concluído com sucesso!');
          setDownloadStatus({ ok: true, msg: res.msg ?? successMsg });
          setProgress({
            percent: 100,
            totalSize: '',
            speed: '',
            eta: '',
            line: t('youtube.finished', 'Download e conversão finalizados.')
          });
        } else {
          setDownloadStatus({ ok: false, msg: res?.error ?? res?.msg ?? 'Download falhou.' });
          setProgress(null);
        }
      } catch (err: any) {
        setDownloadStatus({ ok: false, msg: err.message });
        setProgress(null);
      }
    }
    setIsDownloading(false);
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const hrs = Math.floor(mins / 60);
    if (hrs > 0) {
      return `${hrs}h ${mins % 60}m ${secs}s`;
    }
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  };

  const videoFormats = Array.isArray(info?.formats)
    ? info.formats.filter((f: any) => f?.vcodec && f.vcodec !== 'none')
    : [];

  const presetOptions: { id: DownloadPreset; icon: React.ReactNode; label: string; desc: string }[] = [
    { id: 'audio-mp3', icon: <Music size={14} />, label: t('youtube.audioMp3', 'Áudio MP3 (320k)'), desc: t('youtube.audioMp3Desc', 'Alta Fidelidade com Capa') },
    { id: 'audio-m4a', icon: <Music size={14} />, label: t('youtube.audioM4a', 'Áudio M4A / AAC'), desc: t('youtube.audioM4aDesc', 'Áudio Nativo do YT') },
    { id: 'audio-wav', icon: <Music size={14} />, label: t('youtube.audioWav', 'Áudio WAV Lossless'), desc: t('youtube.audioWavDesc', 'Estúdio Sem Perdas') },
    { id: 'video-1080p', icon: <Video size={14} />, label: t('youtube.video1080p', 'Vídeo 1080p MP4'), desc: t('youtube.video1080pDesc', 'Full HD Recomendado') },
    { id: 'video-4k', icon: <Video size={14} />, label: t('youtube.video4k', 'Vídeo 4K / 2K Max'), desc: t('youtube.video4kDesc', 'Máxima Resolução') },
    { id: 'video-720p', icon: <Video size={14} />, label: t('youtube.video720p', 'Vídeo 720p HD'), desc: t('youtube.video720pDesc', 'Rápido e Leve') }
  ];

  const segBtn = (active: boolean) =>
    `h-7 px-2.5 rounded-md text-xs font-medium transition-colors ${active ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-400 hover:text-zinc-200'}`;

  return (
    <div className="w-full space-y-6 pb-12">
      <PageHeader
        title={t('youtube.title', 'YouTube & Media Downloader')}
        subtitle={t('youtube.subtitle', 'Baixe vídeos, canais ou playlists inteiras do YouTube em alta velocidade com tags ID3 automáticas, capas embutidas e anti-bot.')}
        actions={
          <HelpTip
            title={t('youtube.helpTitle', 'Downloader de Vídeos & Playlists')}
            description={t('youtube.helpDesc', 'Inspirado nas melhores práticas do YoutubePlaylistDownloader. Suporta download de playlists completas com organização automática em subpastas, embutimento de tags e capas em MP3/MP4.')}
            sections={[
              { title: t('youtube.helpSection1Title', 'Playlists & Canais'), content: t('youtube.helpSection1Content', 'Ao colar o link de uma playlist, você pode baixar todas as faixas organizadas com numeração (01 - Nome, 02 - Nome).') },
              { title: t('youtube.helpSection2Title', 'Metadados Automáticos'), content: t('youtube.helpSection2Content', 'Embute nome da música, artista, álbum e capa de alta resolução diretamente nas tags do arquivo.') }
            ]}
            buttonLabel={t('youtube.guide', 'Guia')}
          />
        }
      />

      {/* URL */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            placeholder={t('youtube.placeholder', 'Cole o link do YouTube aqui (vídeo, Shorts ou playlist: https://www.youtube.com/playlist?list=...)')}
            className="dh-input w-full pr-20 select-text"
          />
          {url && (
            <button
              onClick={() => setUrl('')}
              className="dh-btn dh-btn-ghost dh-btn-sm !h-6 absolute right-1 top-1/2 -translate-y-1/2"
            >
              {t('youtube.clear', 'Limpar')}
            </button>
          )}
        </div>
        <button
          onClick={handleSearch}
          disabled={isSearching || !url.trim()}
          className={`dh-btn shrink-0 ${info ? '' : 'dh-btn-primary'}`}
        >
          {isSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          <span>{isSearching ? t('youtube.analyzing', 'Analisando...') : t('youtube.search', 'Buscar')}</span>
        </button>
      </div>

      {/* Connection options */}
      <section className="dh-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
            <ShieldCheck size={16} className="text-zinc-400" />
            <span className="text-zinc-200 font-medium">{t('youtube.antiBotActive', 'Anti-Bot Ativo')}</span>
            <span className="text-zinc-500">{t('youtube.multiClient', 'Multi-Client (iOS/Android/Web)')}</span>
            {cookiesPath && (
              <span className="text-zinc-400">· {t('youtube.cookiesImported', 'Cookies Importados')}</span>
            )}
          </div>
          <button onClick={() => setShowAdvanced(!showAdvanced)} className="dh-btn dh-btn-ghost dh-btn-sm">
            <Sliders size={14} />
            <span>{showAdvanced ? t('youtube.hideOptions', 'Ocultar Opções') : t('youtube.configureCookies', 'Configurar Cookies / Navegador')}</span>
          </button>
        </div>

        {showAdvanced && (
          <div className="mt-4 pt-4 border-t border-zinc-800/80 grid grid-cols-1 md:grid-cols-3 gap-6 animate-in">
            <div className="space-y-2">
              <h3 className="dh-label text-zinc-200">{t('youtube.cookieFileTitle', 'Arquivo de Cookies (.txt)')}</h3>
              <p className="dh-help">{t('youtube.cookieFileDesc', 'Importe cookies do youtube.com para acessar vídeos com restrição de idade ou membros.')}</p>
              <div className="flex gap-2 pt-1">
                <button onClick={handlePickCookies} className="dh-btn dh-btn-sm">
                  <Cookie size={14} />
                  <span>{t('youtube.importCookieBtn', 'Importar cookies.txt')}</span>
                </button>
                {cookiesPath && (
                  <button onClick={handleClearCookies} className="dh-btn dh-btn-ghost dh-btn-sm">
                    {t('youtube.clear', 'Limpar')}
                  </button>
                )}
              </div>
              {cookiesPath && <p className="text-[11px] font-mono text-zinc-500 truncate select-text" title={cookiesPath}>{cookiesPath}</p>}
            </div>

            <div className="space-y-2">
              <h3 className="dh-label text-zinc-200">{t('youtube.browserCookiesTitle', 'Ler Cookies do Navegador')}</h3>
              <p className="dh-help">{t('youtube.browserCookiesDesc', 'Lê cookies diretamente do perfil do navegador instalado no Windows.')}</p>
              <select
                value={cookiesFromBrowser}
                onChange={(e) => handleChangeBrowserCookies(e.target.value)}
                className="dh-input w-full"
              >
                <option value="">{t('youtube.browserDisabled', 'Desativado (Usar Anti-Bot Nativo)')}</option>
                <option value="chrome">Google Chrome</option>
                <option value="edge">Microsoft Edge</option>
                <option value="brave">Brave Browser</option>
                <option value="firefox">Mozilla Firefox</option>
                <option value="opera">Opera</option>
                <option value="vivaldi">Vivaldi</option>
              </select>
            </div>

            <div className="space-y-2">
              <h3 className="dh-label text-zinc-200">{t('youtube.clientDelayTitle', 'Player Client & Delay')}</h3>
              <p className="dh-help">{t('youtube.clientDelayDesc', 'Identificador de cliente enviado ao YouTube.')}</p>
              <div className="flex gap-2">
                <select
                  value={client}
                  onChange={(e) => handleChangeClient(e.target.value)}
                  className="dh-input flex-1 min-w-0"
                >
                  <option value="android,web">{t('youtube.clientAuto', 'Automático (Multi-Client)')}</option>
                  <option value="android">{t('youtube.clientAndroid', 'Android (Leve)')}</option>
                  <option value="ios">{t('youtube.clientIos', 'iOS (Alta Compatibilidade)')}</option>
                  <option value="mweb">{t('youtube.clientMweb', 'mweb (Mobile Web)')}</option>
                  <option value="web">{t('youtube.clientWeb', 'Web Padrão')}</option>
                </select>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={sleepIntervalSec}
                  onChange={(e) => handleChangeSleep(Number(e.target.value))}
                  placeholder={t('youtube.delayPlaceholder', 'Delay')}
                  title={t('youtube.delayTooltip', 'Delay entre requisições em segundos')}
                  className="dh-input w-16 text-center font-mono"
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Status */}
      {downloadStatus && (
        <div role="status" className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] ${downloadStatus.ok ? 'text-emerald-300' : 'text-red-300'}`}>
          {downloadStatus.ok ? <CheckCircle size={14} className="shrink-0" /> : <AlertCircle size={14} className="shrink-0" />}
          <span className="min-w-0">{downloadStatus.msg}</span>
          {!downloadStatus.ok && !info && url.trim() && !isSearching && (
            <button onClick={handleSearch} className="dh-btn dh-btn-ghost dh-btn-sm">{t('youtube.retry', 'Tentar novamente')}</button>
          )}
        </div>
      )}

      {/* Progress */}
      {progress && (
        <section className="dh-card p-4 space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {isDownloading && <Loader2 size={14} className="text-zinc-400 animate-spin shrink-0" />}
              <span className="text-zinc-200 truncate">
                {progress.line || t('youtube.downloading', 'Baixando...')}
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0 text-[11px] text-zinc-500">
              {progress.speed && <span className="font-mono text-zinc-300">{progress.speed}</span>}
              {progress.eta && <span>ETA <span className="font-mono text-zinc-300">{progress.eta}</span></span>}
              <span className="font-mono text-zinc-100 text-xs">{Math.round(progress.percent)}<span className="text-zinc-500">%</span></span>
              <button onClick={handleCancelDownload} className="dh-btn dh-btn-danger dh-btn-sm">
                {t('youtube.cancelDownload', 'Parar / Cancelar')}
              </button>
            </div>
          </div>
          <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-400 rounded-full transition-[width] duration-200 ease-out"
              style={{ width: `${Math.max(2, progress.percent)}%` }}
            />
          </div>
        </section>
      )}

      {/* Loading skeleton */}
      {isSearching && !info && (
        <section className="dh-card p-5 grid grid-cols-1 md:grid-cols-12 gap-6" aria-hidden>
          <div className="md:col-span-4 aspect-video rounded-lg bg-zinc-900 animate-pulse" />
          <div className="md:col-span-8 space-y-3">
            <div className="h-4 w-3/4 rounded bg-zinc-900 animate-pulse" />
            <div className="h-3 w-1/3 rounded bg-zinc-900 animate-pulse" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-3">
              {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-12 rounded-lg bg-zinc-900 animate-pulse" />)}
            </div>
          </div>
        </section>
      )}

      {/* Result */}
      {info && (
        <section className="dh-card p-5 space-y-6 animate-in">
          {info.isPlaylist && (
            <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-zinc-800/80">
              <div className="flex items-center gap-3 min-w-0">
                <ListMusic size={18} className="text-zinc-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[11px] text-zinc-500">
                    {t('youtube.playlistDetected', 'Playlist Detectada')} · <span className="font-mono text-zinc-300">{info.itemCount}</span> {t('youtube.tracksAvailable', 'faixas disponíveis')}
                  </div>
                  <h3 className="dh-section-title truncate mt-0.5">{info.title}</h3>
                </div>
              </div>
              <div className="flex items-center gap-1 p-0.5 rounded-lg border border-zinc-800">
                <button onClick={() => setDownloadEntirePlaylist(true)} aria-pressed={downloadEntirePlaylist} className={segBtn(downloadEntirePlaylist)}>
                  {t('youtube.downloadEntirePlaylist', 'Baixar Playlist Inteira')} (<span className="font-mono">{info.itemCount}</span>)
                </button>
                <button onClick={() => setDownloadEntirePlaylist(false)} aria-pressed={!downloadEntirePlaylist} className={segBtn(!downloadEntirePlaylist)}>
                  {t('youtube.downloadFirstOnly', 'Apenas 1º Vídeo')}
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <div className="md:col-span-4 relative rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950 aspect-video flex items-center justify-center">
              {info.thumbnail ? (
                <img src={info.thumbnail} alt={info.title} className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center justify-center text-zinc-500">
                  <ListMusic size={20} />
                  <span className="text-xs mt-2">{t('youtube.playlistCover', 'Capa da Playlist')}</span>
                </div>
              )}
              {info.duration > 0 && (
                <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-zinc-100 text-[11px] font-mono flex items-center gap-1">
                  <Clock size={11} />
                  {formatDuration(info.duration)}
                </div>
              )}
            </div>

            <div className="md:col-span-8 flex flex-col justify-between gap-4">
              <div>
                <h2 className="text-[15px] font-semibold text-zinc-100 line-clamp-2 leading-snug mb-1 select-text">{info.title}</h2>
                <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                  <span className="text-zinc-300">{info.author}</span>
                  {info.viewCount > 0 && (
                    <span className="flex items-center gap-1">
                      <Eye size={14} />
                      <span className="font-mono text-zinc-300">{info.viewCount.toLocaleString()}</span> {t('youtube.views', 'visualizações')}
                    </span>
                  )}
                  {info.isPlaylist && (
                    <span><span className="font-mono text-zinc-300">{info.itemCount}</span> {t('youtube.songsVideos', 'músicas / vídeos')}</span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <span className="dh-label block">{t('youtube.selectFormat', 'Selecione o Formato / Qualidade:')}</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="radiogroup">
                  {presetOptions.map((o) => {
                    const active = preset === o.id;
                    return (
                      <button
                        key={o.id}
                        role="radio"
                        aria-checked={active}
                        onClick={() => setPreset(o.id)}
                        className={`px-3 py-2 rounded-lg border text-left transition-colors ${
                          active ? 'border-blue-400/70 bg-zinc-800/60 text-zinc-50' : 'border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs font-medium">
                          <span className={active ? 'text-blue-300' : 'text-zinc-500'}>{o.icon}</span>
                          {o.label}
                        </div>
                        <span className="text-[11px] text-zinc-500 block mt-0.5">{o.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-5 text-[12.5px] text-zinc-300">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={embedThumbnail} onChange={(e) => setEmbedThumbnail(e.target.checked)} />
                  <ImageIcon size={14} className="text-zinc-500" />
                  <span>{t('youtube.embedThumbnail', 'Embutir Capa (Cover Art)')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={embedMetadata} onChange={(e) => setEmbedMetadata(e.target.checked)} />
                  <Tag size={14} className="text-zinc-500" />
                  <span>{t('youtube.embedMetadata', 'Embutir Tags ID3 (Artista/Álbum)')}</span>
                </label>
              </div>

              <details className="rounded-lg border border-zinc-800/80 px-3 py-2">
                <summary className="cursor-pointer select-none text-[12.5px] text-zinc-300">{t('ytx.more', 'Mais opções: formato, legendas, SponsorBlock, capítulos, trecho')}</summary>
                <div className="mt-3 grid gap-4 md:grid-cols-2 text-[12.5px] text-zinc-300">
                  <label className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-zinc-400">{t('ytx.container', 'Contêiner')}</span>
                    <select className="dh-input" value={extra.container} onChange={(e) => patchExtra({ container: e.target.value as VideoExtraOptions['container'] })}>
                      <option value="mp4">MP4</option><option value="mkv">MKV</option><option value="webm">WebM</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-zinc-400">{t('ytx.codec', 'Codec de vídeo')}</span>
                    <select className="dh-input min-w-0" value={extra.codec} onChange={(e) => patchExtra({ codec: e.target.value as VideoExtraOptions['codec'] })}>
                      <option value="best">{t('ytx.codec.best', 'Melhor disponível')}</option>
                      <option value="h264">{t('ytx.codec.h264', 'H.264 (toca em tudo: TV, editores, WhatsApp)')}</option>
                      <option value="av1">{t('ytx.codec.av1', 'AV1 (menor e mais nítido, exige PC recente)')}</option>
                    </select>
                  </label>

                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input type="checkbox" checked={extra.subtitles} onChange={(e) => patchExtra({ subtitles: e.target.checked })} />
                      <span>{t('ytx.subs', 'Baixar e embutir legendas')}</span>
                    </label>
                    {extra.subtitles && (
                      <div className="flex flex-wrap items-center gap-3 pl-6">
                        <input className="dh-input w-40 font-mono" value={extra.subLangs} onChange={(e) => patchExtra({ subLangs: e.target.value })} title={t('ytx.subLangsHelp', 'Idiomas separados por vírgula: pt.*, en.*, es')} />
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input type="checkbox" checked={extra.autoSubs} onChange={(e) => patchExtra({ autoSubs: e.target.checked })} />
                          <span>{t('ytx.autoSubs', 'Incluir legendas automáticas')}</span>
                        </label>
                      </div>
                    )}
                  </div>
                  <label className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-zinc-400">{t('ytx.chapters', 'Capítulos')}</span>
                    <select className="dh-input" value={extra.chapters} onChange={(e) => patchExtra({ chapters: e.target.value as VideoExtraOptions['chapters'] })}>
                      <option value="">{t('ytx.chapters.none', 'Ignorar')}</option>
                      <option value="embed">{t('ytx.chapters.embed', 'Embutir no arquivo')}</option>
                      <option value="split">{t('ytx.chapters.split', 'Um arquivo por capítulo')}</option>
                    </select>
                  </label>

                  <div className="md:col-span-2 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-zinc-400">SponsorBlock</span>
                      <select className="dh-input" value={extra.sponsorMode} onChange={(e) => patchExtra({ sponsorMode: e.target.value as VideoExtraOptions['sponsorMode'] })}>
                        <option value="remove">{t('ytx.sb.remove', 'Cortar do vídeo')}</option>
                        <option value="mark">{t('ytx.sb.mark', 'Só marcar como capítulo')}</option>
                      </select>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {SPONSOR_CATEGORIES.map((c) => (
                        <button key={c} type="button" onClick={() => toggleSponsor(c)}
                          className={`px-2 py-0.5 rounded-md border text-[11.5px] ${extra.sponsorBlock.includes(c) ? 'border-blue-400/70 text-zinc-50 bg-zinc-800/60' : 'border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}>
                          {t(`ytx.sb.${c}`, c)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-zinc-400">{t('ytx.trim', 'Trecho')}</span>
                    <input className="dh-input w-24 font-mono" placeholder="0:00" value={extra.trimStart} onChange={(e) => patchExtra({ trimStart: e.target.value })} aria-label={t('ytx.trimStart', 'Início')} />
                    <span className="text-zinc-500">→</span>
                    <input className="dh-input w-24 font-mono" placeholder={t('ytx.trimEndPh', 'fim')} value={extra.trimEnd} onChange={(e) => patchExtra({ trimEnd: e.target.value })} aria-label={t('ytx.trimEnd', 'Fim')} />
                  </div>
                  <label className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-zinc-400">{t('ytx.rate', 'Limite de banda')}</span>
                    <input className="dh-input w-24 font-mono" placeholder={t('ytx.ratePh', 'sem limite')} value={extra.rateLimit} onChange={(e) => patchExtra({ rateLimit: e.target.value })} title={t('ytx.rateHelp', 'Ex.: 5M = 5 MB/s, 800K = 800 KB/s')} />
                  </label>
                  {info?.isPlaylist && (
                    <label className="flex items-center gap-2">
                      <span className="w-28 shrink-0 text-zinc-400">{t('ytx.items', 'Itens da playlist')}</span>
                      <input className="dh-input w-40 font-mono" placeholder="1-10,15,20-" value={extra.playlistItems} onChange={(e) => patchExtra({ playlistItems: e.target.value })} />
                    </label>
                  )}

                  <div className="md:col-span-2 flex flex-wrap gap-5">
                    <label className="flex items-center gap-2 cursor-pointer select-none" title={t('ytx.skipHelp', 'Guarda o que já foi baixado e pula na próxima vez (ótimo para playlists e canais)')}>
                      <input type="checkbox" checked={extra.skipDownloaded} onChange={(e) => patchExtra({ skipDownloaded: e.target.checked })} />
                      <span>{t('ytx.skip', 'Pular o que já baixei')}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input type="checkbox" checked={extra.writeThumbnail} onChange={(e) => patchExtra({ writeThumbnail: e.target.checked })} />
                      <span>{t('ytx.thumbFile', 'Salvar capa como .jpg')}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input type="checkbox" checked={extra.writeDescription} onChange={(e) => patchExtra({ writeDescription: e.target.checked })} />
                      <span>{t('ytx.desc', 'Salvar descrição em .txt')}</span>
                    </label>
                  </div>
                </div>
              </details>


              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-zinc-800/80">
                <div className="flex items-center gap-2 min-w-0">
                  {!info.isPlaylist && videoFormats.length > 0 && (
                    <select
                      value={preset === 'custom' ? customFormatId : ''}
                      onChange={(e) => {
                        if (e.target.value) {
                          setPreset('custom');
                          setCustomFormatId(e.target.value);
                        }
                      }}
                      className="dh-input max-w-xs truncate font-mono text-xs"
                    >
                      <option value="">{t('youtube.customFormatOption', 'Ou formato customizado...')}</option>
                      {videoFormats.map((f: any) => (
                        <option key={f.id} value={f.id}>
                          {f.ext?.toUpperCase()} • {f.resolution || 'Video'} {f.fps ? `(${f.fps}fps)` : ''} {f.formatNote ? `[${f.formatNote}]` : ''} - ID:{f.id}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <button
                  onClick={handleDownload}
                  disabled={isDownloading || (preset === 'custom' && !customFormatId)}
                  className="dh-btn dh-btn-primary shrink-0"
                >
                  {isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  <span>{isDownloading ? t('youtube.downloadingBtn', 'Baixando...') : (info.isPlaylist && downloadEntirePlaylist ? `${t('youtube.downloadPlaylistBtn', 'Baixar Playlist')} (${info.itemCount})` : t('youtube.downloadNow', 'Baixar Agora'))}</span>
                </button>
              </div>
            </div>
          </div>

          {info.isPlaylist && Array.isArray(info.entries) && info.entries.length > 0 && (
            <div className="pt-5 border-t border-zinc-800/80 space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="dh-section-title">
                  {t('youtube.playlistTracksList', 'Lista de Faixas na Playlist')} <span className="font-mono text-zinc-500 font-normal">{info.entries.length}</span>
                </h3>
                <span className="dh-help">{t('youtube.subfolderNotice', 'Serão organizadas em subpasta dedicada')}</span>
              </div>
              <div className="max-h-56 overflow-y-auto custom-scrollbar divide-y divide-zinc-800/80 border-y border-zinc-800/80">
                {info.entries.map((entry: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between gap-3 py-2 pr-1 text-xs">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-zinc-500 text-[11px] w-5 text-right shrink-0">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="text-zinc-200 truncate">{entry.title}</span>
                    </div>
                    {entry.duration > 0 && (
                      <span className="font-mono text-zinc-500 text-[11px] shrink-0">{formatDuration(entry.duration)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default YoutubeDownloader;
