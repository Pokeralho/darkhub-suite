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
  Sparkles,
  Zap,
  ListMusic,
  Image as ImageIcon,
  Tag
} from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { HelpTip } from '../components/HelpTip';

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
        setDownloadStatus({ ok: false, msg: err.message });
      }
    }
    setIsSearching(false);
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
          embedMetadata
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

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
            <Video className="text-red-400" size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-zinc-100 flex items-center gap-2">
              {t('youtube.title', 'YouTube & Media Downloader')}
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                {t('youtube.badge', 'Playlists + Tags ID3')}
              </span>
            </h1>
            <p className="text-zinc-400 text-sm mt-1">
              {t('youtube.subtitle', 'Baixe vídeos, canais ou playlists inteiras do YouTube em alta velocidade com tags ID3 automáticas, capas embutidas e anti-bot.')}
            </p>
          </div>
        </div>
        <HelpTip
          title={t('youtube.helpTitle', 'Downloader de Vídeos & Playlists')}
          description={t('youtube.helpDesc', 'Inspirado nas melhores práticas do YoutubePlaylistDownloader. Suporta download de playlists completas com organização automática em subpastas, embutimento de tags e capas em MP3/MP4.')}
          sections={[
            { title: t('youtube.helpSection1Title', 'Playlists & Canais'), content: t('youtube.helpSection1Content', 'Ao colar o link de uma playlist, você pode baixar todas as faixas organizadas com numeração (01 - Nome, 02 - Nome).') },
            { title: t('youtube.helpSection2Title', 'Metadados Automáticos'), content: t('youtube.helpSection2Content', 'Embute nome da música, artista, álbum e capa de alta resolução diretamente nas tags do arquivo.') }
          ]}
          buttonLabel={t('youtube.guide', 'Guia')}
        />
      </div>

      {}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            placeholder={t('youtube.placeholder', 'Cole o link do YouTube aqui (vídeo, Shorts ou playlist: https://www.youtube.com/playlist?list=...)')}
            className="w-full bg-zinc-900 border border-zinc-800 focus:border-red-500/80 rounded-xl pl-4 pr-10 py-3.5 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none transition-colors shadow-inner"
          />
          {url && (
            <button
              onClick={() => setUrl('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 hover:text-zinc-300 px-1.5 py-0.5 rounded bg-zinc-800"
            >
              {t('youtube.clear', 'Limpar')}
            </button>
          )}
        </div>
        <button
          onClick={handleSearch}
          disabled={isSearching || !url.trim()}
          className="px-6 py-3.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-red-600/25 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {isSearching ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
          <span>{isSearching ? t('youtube.analyzing', 'Analisando...') : t('youtube.search', 'Buscar')}</span>
        </button>
      </div>

      {}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 transition-all">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-emerald-400" />
            <span className="text-xs font-semibold text-zinc-300">
              {t('youtube.antiBotActive', 'Anti-Bot Ativo')}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-bold">
              {t('youtube.multiClient', 'Multi-Client (iOS/Android/Web)')}
            </span>
            {cookiesPath && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20 font-bold">
                {t('youtube.cookiesImported', 'Cookies Importados')}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 font-medium hover:underline"
          >
            <Sliders size={13} />
            <span>{showAdvanced ? t('youtube.hideOptions', 'Ocultar Opções') : t('youtube.configureCookies', 'Configurar Cookies / Navegador')}</span>
          </button>
        </div>

        {showAdvanced && (
          <div className="mt-4 pt-4 border-t border-zinc-800/80 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs animate-in fade-in">
            <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 space-y-2">
              <span className="text-zinc-300 font-semibold block">{t('youtube.cookieFileTitle', 'Arquivo de Cookies (.txt)')}</span>
              <p className="text-zinc-500 text-[11px]">
                {t('youtube.cookieFileDesc', 'Importe cookies do youtube.com para acessar vídeos com restrição de idade ou membros.')}
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handlePickCookies}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg font-medium flex items-center gap-1.5 transition-colors"
                >
                  <Cookie size={14} />
                  <span>{t('youtube.importCookieBtn', 'Importar cookies.txt')}</span>
                </button>
                {cookiesPath && (
                  <button
                    onClick={handleClearCookies}
                    className="px-2.5 py-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                  >
                    {t('youtube.clear', 'Limpar')}
                  </button>
                )}
              </div>
            </div>

            <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 space-y-2">
              <span className="text-zinc-300 font-semibold block">{t('youtube.browserCookiesTitle', 'Ler Cookies do Navegador')}</span>
              <p className="text-zinc-500 text-[11px]">
                {t('youtube.browserCookiesDesc', 'Lê cookies diretamente do perfil do navegador instalado no Windows.')}
              </p>
              <select
                value={cookiesFromBrowser}
                onChange={(e) => handleChangeBrowserCookies(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-red-500"
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

            <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 space-y-2">
              <span className="text-zinc-300 font-semibold block">{t('youtube.clientDelayTitle', 'Player Client & Delay')}</span>
              <p className="text-zinc-500 text-[11px]">
                {t('youtube.clientDelayDesc', 'Identificador de cliente enviado ao YouTube.')}
              </p>
              <div className="flex gap-2">
                <select
                  value={client}
                  onChange={(e) => handleChangeClient(e.target.value)}
                  className="flex-1 bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-red-500"
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
                  className="w-16 bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none focus:border-red-500"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {}
      {downloadStatus && (
        <div className={`p-4 rounded-xl flex items-center space-x-3 text-sm font-medium ${
          downloadStatus.ok
            ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
            : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
        }`}>
          {downloadStatus.ok ? <CheckCircle size={20} className="shrink-0 text-emerald-400" /> : <AlertCircle size={20} className="shrink-0 text-rose-400" />}
          <span>{downloadStatus.msg}</span>
        </div>
      )}

      {}
      {progress && (
        <div className="p-5 rounded-2xl border border-red-500/30 bg-zinc-900/90 shadow-xl space-y-3">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Zap size={15} className="text-red-400 animate-bounce" />
              <span className="font-semibold text-zinc-200">
                {progress.line || t('youtube.downloading', 'Baixando...')}
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono">
              {progress.speed && <span className="text-emerald-400">{progress.speed}</span>}
              {progress.eta && <span className="text-zinc-400">ETA: {progress.eta}</span>}
              <span className="text-red-400 font-bold">{Math.round(progress.percent)}%</span>
            </div>
          </div>

          <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-red-600 via-rose-500 to-amber-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.max(5, progress.percent)}%` }}
            />
          </div>
        </div>
      )}

      {}
      {info && (
        <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900 space-y-6 animate-in fade-in">
          {}
          {info.isPlaylist && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-red-950/50 to-purple-950/40 border border-red-500/30 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-red-500/20 rounded-xl text-red-400">
                  <ListMusic size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                      {t('youtube.playlistDetected', 'Playlist Detectada')}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {info.itemCount} {t('youtube.tracksAvailable', 'faixas disponíveis')}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-zinc-100 mt-0.5">
                    {info.title}
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDownloadEntirePlaylist(true)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    downloadEntirePlaylist
                      ? 'bg-red-600 text-white shadow'
                      : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {t('youtube.downloadEntirePlaylist', 'Baixar Playlist Inteira')} ({info.itemCount})
                </button>
                <button
                  onClick={() => setDownloadEntirePlaylist(false)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    !downloadEntirePlaylist
                      ? 'bg-red-600 text-white shadow'
                      : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {t('youtube.downloadFirstOnly', 'Apenas 1º Vídeo')}
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {}
            <div className="md:col-span-4 relative rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 aspect-video flex items-center justify-center group">
              {info.thumbnail ? (
                <img
                  src={info.thumbnail}
                  alt={info.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-zinc-500">
                  <ListMusic size={36} />
                  <span className="text-xs mt-2">{t('youtube.playlistCover', 'Capa da Playlist')}</span>
                </div>
              )}
              {info.duration > 0 && (
                <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/80 backdrop-blur-sm text-white text-[11px] font-mono font-bold flex items-center gap-1">
                  <Clock size={11} />
                  {formatDuration(info.duration)}
                </div>
              )}
            </div>

            {}
            <div className="md:col-span-8 flex flex-col justify-between space-y-4">
              <div>
                <h2 className="text-lg font-bold text-zinc-100 line-clamp-2 leading-snug mb-1">
                  {info.title}
                </h2>
                <div className="flex items-center gap-3 text-xs text-zinc-400">
                  <span className="font-semibold text-zinc-300">{info.author}</span>
                  {info.viewCount > 0 && (
                    <span className="flex items-center gap-1">
                      <Eye size={13} />
                      {info.viewCount.toLocaleString()} {t('youtube.views', 'visualizações')}
                    </span>
                  )}
                  {info.isPlaylist && (
                    <span className="text-red-400 font-semibold">
                      {info.itemCount} {t('youtube.songsVideos', 'músicas / vídeos')}
                    </span>
                  )}
                </div>
              </div>

              {}
              <div className="space-y-2">
                <span className="text-xs text-zinc-400 font-semibold block">{t('youtube.selectFormat', 'Selecione o Formato / Qualidade:')}</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {}
                  <button
                    onClick={() => setPreset('audio-mp3')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      preset === 'audio-mp3'
                        ? 'bg-blue-600/20 border-blue-500 text-white shadow-sm'
                        : 'bg-zinc-950/70 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Music size={13} className="text-blue-400" />
                      {t('youtube.audioMp3', 'Áudio MP3 (320k)')}
                    </div>
                    <span className="text-[10px] text-zinc-500 block mt-0.5">{t('youtube.audioMp3Desc', 'Alta Fidelidade com Capa')}</span>
                  </button>

                  <button
                    onClick={() => setPreset('audio-m4a')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      preset === 'audio-m4a'
                        ? 'bg-blue-600/20 border-blue-500 text-white shadow-sm'
                        : 'bg-zinc-950/70 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Music size={13} className="text-indigo-400" />
                      {t('youtube.audioM4a', 'Áudio M4A / AAC')}
                    </div>
                    <span className="text-[10px] text-zinc-500 block mt-0.5">{t('youtube.audioM4aDesc', 'Áudio Nativo do YT')}</span>
                  </button>

                  <button
                    onClick={() => setPreset('audio-wav')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      preset === 'audio-wav'
                        ? 'bg-blue-600/20 border-blue-500 text-white shadow-sm'
                        : 'bg-zinc-950/70 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Music size={13} className="text-purple-400" />
                      {t('youtube.audioWav', 'Áudio WAV Lossless')}
                    </div>
                    <span className="text-[10px] text-zinc-500 block mt-0.5">{t('youtube.audioWavDesc', 'Estúdio Sem Perdas')}</span>
                  </button>

                  {}
                  <button
                    onClick={() => setPreset('video-1080p')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      preset === 'video-1080p'
                        ? 'bg-red-600/20 border-red-500 text-white shadow-sm'
                        : 'bg-zinc-950/70 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Video size={13} className="text-red-400" />
                      {t('youtube.video1080p', 'Vídeo 1080p MP4')}
                    </div>
                    <span className="text-[10px] text-zinc-500 block mt-0.5">{t('youtube.video1080pDesc', 'Full HD Recomendado')}</span>
                  </button>

                  <button
                    onClick={() => setPreset('video-4k')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      preset === 'video-4k'
                        ? 'bg-red-600/20 border-red-500 text-white shadow-sm'
                        : 'bg-zinc-950/70 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Sparkles size={13} className="text-amber-400" />
                      {t('youtube.video4k', 'Vídeo 4K / 2K Max')}
                    </div>
                    <span className="text-[10px] text-zinc-500 block mt-0.5">{t('youtube.video4kDesc', 'Máxima Resolução')}</span>
                  </button>

                  <button
                    onClick={() => setPreset('video-720p')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      preset === 'video-720p'
                        ? 'bg-red-600/20 border-red-500 text-white shadow-sm'
                        : 'bg-zinc-950/70 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Video size={13} className="text-zinc-400" />
                      {t('youtube.video720p', 'Vídeo 720p HD')}
                    </div>
                    <span className="text-[10px] text-zinc-500 block mt-0.5">{t('youtube.video720pDesc', 'Rápido e Leve')}</span>
                  </button>
                </div>
              </div>

              {}
              <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-zinc-400">
                <label className="flex items-center gap-1.5 cursor-pointer hover:text-zinc-200 select-none">
                  <input
                    type="checkbox"
                    checked={embedThumbnail}
                    onChange={(e) => setEmbedThumbnail(e.target.checked)}
                    className="rounded bg-zinc-800 border-zinc-700 text-red-600 focus:ring-0"
                  />
                  <ImageIcon size={13} className="text-blue-400" />
                  <span>{t('youtube.embedThumbnail', 'Embutir Capa (Cover Art)')}</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer hover:text-zinc-200 select-none">
                  <input
                    type="checkbox"
                    checked={embedMetadata}
                    onChange={(e) => setEmbedMetadata(e.target.checked)}
                    className="rounded bg-zinc-800 border-zinc-700 text-red-600 focus:ring-0"
                  />
                  <Tag size={13} className="text-emerald-400" />
                  <span>{t('youtube.embedMetadata', 'Embutir Tags ID3 (Artista/Álbum)')}</span>
                </label>
              </div>

              {}
              <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60">
                <div className="flex items-center gap-2">
                  {!info.isPlaylist && videoFormats.length > 0 && (
                    <select
                      value={preset === 'custom' ? customFormatId : ''}
                      onChange={(e) => {
                        if (e.target.value) {
                          setPreset('custom');
                          setCustomFormatId(e.target.value);
                        }
                      }}
                      className="bg-zinc-950 border border-zinc-800 text-zinc-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-red-500 max-w-xs truncate"
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

                {}
                <button
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2 disabled:opacity-50 shrink-0"
                >
                  {isDownloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  <span>{isDownloading ? t('youtube.downloadingBtn', 'Baixando...') : (info.isPlaylist && downloadEntirePlaylist ? `${t('youtube.downloadPlaylistBtn', 'Baixar Playlist')} (${info.itemCount})` : t('youtube.downloadNow', 'Baixar Agora'))}</span>
                </button>
              </div>
            </div>
          </div>

          {}
          {info.isPlaylist && Array.isArray(info.entries) && info.entries.length > 0 && (
            <div className="pt-4 border-t border-zinc-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400 font-semibold">
                <span className="flex items-center gap-1.5">
                  <ListMusic size={14} className="text-red-400" />
                  {t('youtube.playlistTracksList', 'Lista de Faixas na Playlist')} ({info.entries.length})
                </span>
                <span className="text-[11px] text-zinc-500">
                  {t('youtube.subfolderNotice', 'Serão organizadas em subpasta dedicada')}
                </span>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar rounded-xl bg-zinc-950/80 p-2 border border-zinc-800/80">
                {info.entries.map((entry: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/60 border border-zinc-800/40 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <span className="font-mono text-zinc-500 text-[10px] w-5 text-right font-bold">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="text-zinc-200 font-medium truncate">
                        {entry.title}
                      </span>
                    </div>
                    {entry.duration > 0 && (
                      <span className="font-mono text-zinc-500 text-[11px] shrink-0">
                        {formatDuration(entry.duration)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default YoutubeDownloader;
