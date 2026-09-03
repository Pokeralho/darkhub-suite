import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Gamepad2, RefreshCw, RotateCcw, FolderOpen, Search, Plus, Trash2, 
  Save, Check, AlertCircle, FileCode, Layers, HardDrive, Key,
  ExternalLink, Globe, CheckCircle2, XCircle, Settings, DownloadCloud,
  Sparkles, ShieldCheck, ShieldAlert, X, ChevronRight, LayoutGrid, List,
  Terminal, Sliders, Play, Lock, Unlock
} from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';

interface InstalledLuaSummary {
  appId: number;
  fileName: string;
  filePath: string;
  updatedAt: number;
  sizeBytes: number;
  depotCount: number;
  dlcCount: number;
  hasActivePins: boolean;
  entriesCount: number;
  disabledCount: number;
  baseAppId: number;
  name?: string;
  headerImage?: string;
}

interface LuaEntry {
  id: number;
  key: string | null;
  hasKey: boolean;
  manifestId: string | null;
  commentedManifestId: string | null;
  comment: string | null;
  sizeOnDisk: number | null;
  isEnabled: boolean;
  isLocked: boolean;
}

interface LuaDetails {
  baseAppId: number;
  entries: LuaEntry[];
  disabledEntries: LuaEntry[];
  activePins: Record<string, string>;
  commentedPins: Record<string, string>;
  depotCount: number;
  dlcCount: number;
  hasActivePins: boolean;
  rawText: string;
  appId: number;
  filePath: string;
}

export default function SteamLuaTools() {
  const { t } = useI18n();

  const [steamStatus, setSteamStatus] = useState<{
    isValid: boolean;
    isRunning: boolean;
    steamPath: string | null;
    stPlugInDir: string | null;
    depotCacheDir: string | null;
    language: string | null;
    luaCount: number;
  }>({
    isValid: false,
    isRunning: false,
    steamPath: null,
    stPlugInDir: null,
    depotCacheDir: null,
    language: null,
    luaCount: 0
  });

  const [unlockerStatus, setUnlockerStatus] = useState<{
    isInstalled: boolean;
    mode: string;
    filesPresent: string[];
    steamPath?: string;
  }>({ isInstalled: false, mode: 'None', filesPresent: [] });

  const [installedLuas, setInstalledLuas] = useState<InstalledLuaSummary[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<LuaDetails | null>(null);
  const [activeInspectorTab, setActiveInspectorTab] = useState<'visual' | 'code'>('visual');
  const [rawTextDraft, setRawTextDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'online' | 'dlc'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Quick Add State
  const [inputUrlOrId, setInputUrlOrId] = useState('');
  const [optOnlineFix, setOptOnlineFix] = useState(true);
  const [optAutoUpdate, setOptAutoUpdate] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [previewInfo, setPreviewInfo] = useState<{ appId: number; name: string; headerImage?: string } | null>(null);

  // Global & Card Loading States
  const [loading, setLoading] = useState(false);
  const [restartingSteam, setRestartingSteam] = useState(false);
  const [togglingUnlocker, setTogglingUnlocker] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<Record<number, string>>({});
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [appMetadataCache, setAppMetadataCache] = useState<Record<number, { name: string; headerImage?: string }>>({});

  // Helper to extract AppID from string or link
  const parseAppId = (input: string): number | null => {
    if (!input) return null;
    const str = input.trim();
    if (/^\d+$/.test(str)) {
      const num = parseInt(str, 10);
      return num > 0 ? num : null;
    }
    const match = str.match(/(?:\/app\/|store\/|info\/app\/)(\d+)/i);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      return num > 0 ? num : null;
    }
    const anyNum = str.match(/\d{2,8}/);
    if (anyNum) {
      const num = parseInt(anyNum[0], 10);
      return num > 0 ? num : null;
    }
    return null;
  };

  const loadStatusAndList = useCallback(async () => {
    if (!window.darkhub?.steamLua) {
      console.warn('darkhub.steamLua API not available');
      return;
    }
    setLoading(true);
    try {
      const status = await window.darkhub.steamLua.getStatus();
      if (status) {
        setSteamStatus(status);
      }

      if (window.darkhub?.steamUnlocker) {
        const unlocker = await window.darkhub.steamUnlocker.getStatus();
        if (unlocker) {
          setUnlockerStatus(unlocker);
        }
      }

      const list = await window.darkhub.steamLua.listInstalled();
      if (Array.isArray(list)) {
        setInstalledLuas(list);
      }
    } catch (err: any) {
      console.error('Failed to load Steam status:', err);
      setStatusMessage({ type: 'error', text: err?.message || 'Falha ao carregar status da Steam' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatusAndList();
    const interval = setInterval(loadStatusAndList, 10000);
    return () => clearInterval(interval);
  }, [loadStatusAndList]);

  // Debounced preview lookup on quick add input
  useEffect(() => {
    const parsed = parseAppId(inputUrlOrId);
    if (!parsed) {
      setPreviewInfo(null);
      return;
    }

    if (appMetadataCache[parsed]) {
      setPreviewInfo({ appId: parsed, ...appMetadataCache[parsed] });
      return;
    }

    const timer = setTimeout(() => {
      window.darkhub?.steamLua?.fetchStoreInfo(parsed).then((info: any) => {
        if (info) {
          const meta = { name: info.name, headerImage: info.headerImage };
          setAppMetadataCache((prev) => ({ ...prev, [parsed]: meta }));
          setPreviewInfo({ appId: parsed, ...meta });
        } else {
          setPreviewInfo({ appId: parsed, name: 'Jogo Steam (' + parsed + ')' });
        }
      }).catch(() => {
        setPreviewInfo({ appId: parsed, name: 'Jogo Steam (' + parsed + ')' });
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [inputUrlOrId, appMetadataCache]);

  // Load metadata for installed games
  useEffect(() => {
    installedLuas.forEach((item) => {
      if (!appMetadataCache[item.appId]) {
        window.darkhub?.steamLua?.fetchStoreInfo(item.appId).then((info: any) => {
          if (info) {
            setAppMetadataCache((prev) => ({
              ...prev,
              [item.appId]: { name: info.name, headerImage: info.headerImage }
            }));
          }
        }).catch(() => {});
      }
    });
  }, [installedLuas, appMetadataCache]);

  // Load details when modal opened
  useEffect(() => {
    if (!selectedAppId || !window.darkhub?.steamLua) return;
    window.darkhub.steamLua.getDetails(selectedAppId).then((details: any) => {
      setSelectedDetails(details);
      if (details) {
        setRawTextDraft(details.rawText);
      }
    });
  }, [selectedAppId]);

  const handleRestartSteam = async () => {
    if (!window.darkhub?.steamLua) return;
    setRestartingSteam(true);
    try {
      await window.darkhub.steamLua.restartSteam();
      setStatusMessage({ type: 'success', text: 'Steam reiniciado com sucesso!' });
      await loadStatusAndList();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Falha ao reiniciar Steam' });
    } finally {
      setRestartingSteam(false);
    }
  };

  const handleOpenFolder = async () => {
    if (!window.darkhub?.steamLua) return;
    await window.darkhub.steamLua.openStPlugInFolder?.();
  };

  const handleToggleUnlocker = async () => {
    if (!window.darkhub?.steamUnlocker) return;
    setTogglingUnlocker(true);
    try {
      if (unlockerStatus.isInstalled) {
        await window.darkhub.steamUnlocker.uninstall();
        setStatusMessage({ type: 'info', text: 'OpenSteamTools desinstalado.' });
      } else {
        await window.darkhub.steamUnlocker.install('OST');
        setStatusMessage({ type: 'success', text: 'OpenSteamTools instalado com sucesso! A Steam agora carregará seus jogos configurados.' });
      }
      await loadStatusAndList();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Erro ao alterar OpenSteamTools' });
    } finally {
      setTogglingUnlocker(false);
    }
  };

  const handleAddGame = async () => {
    const targetAppId = parseAppId(inputUrlOrId);
    if (!targetAppId || !window.darkhub?.steamLua) {
      setStatusMessage({ type: 'error', text: 'Insira um AppID válido ou o link da página do jogo na Steam.' });
      return;
    }

    setIsAdding(true);
    try {
      const res = await window.darkhub.steamLua.downloadAndInstallPackage({
        appId: targetAppId,
        autoUpdate: optAutoUpdate,
        onlineFix: optOnlineFix
      });

      if (res && res.ok) {
        setStatusMessage({
          type: 'success',
          text: res.packageDownloaded 
            ? '✓ Jogo ' + targetAppId + ' adicionado com manifestos e depots na Biblioteca!'
            : '✓ Jogo ' + targetAppId + ' adicionado à Biblioteca Steam!'
        });
        setInputUrlOrId('');
        setPreviewInfo(null);
        await loadStatusAndList();
      } else {
        setStatusMessage({ type: 'error', text: res?.error || 'Falha ao adicionar o jogo.' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Erro ao processar pacote do jogo' });
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteGame = async (appId: number) => {
    if (!window.darkhub?.steamLua) return;
    setActionInProgress((prev) => ({ ...prev, [appId]: 'deleting' }));
    try {
      await window.darkhub.steamLua.deleteLua(appId);
      setStatusMessage({ type: 'info', text: 'Jogo ' + appId + ' removido da biblioteca.' });
      if (selectedAppId === appId) setSelectedAppId(null);
      await loadStatusAndList();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Falha ao remover o jogo' });
    } finally {
      setActionInProgress((prev) => {
        const next = { ...prev };
        delete next[appId];
        return next;
      });
    }
  };

  const handleToggleOnlineFix = async (appId: number, currentHasOnline: boolean) => {
    if (!window.darkhub?.steamLua) return;
    setActionInProgress((prev) => ({ ...prev, [appId]: 'onlineFix' }));
    try {
      await window.darkhub.steamLua.toggleOnlineFix?.({ appId, enable: !currentHasOnline });
      setStatusMessage({
        type: 'success',
        text: !currentHasOnline 
          ? '✓ Online Fix (Spacewar 480) ativado para o AppID ' + appId
          : 'Online Fix desativado para o AppID ' + appId
      });
      await loadStatusAndList();
      if (selectedAppId === appId) {
        const details = await window.darkhub.steamLua.getDetails(appId);
        setSelectedDetails(details);
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Falha ao alterar Online Fix' });
    } finally {
      setActionInProgress((prev) => {
        const next = { ...prev };
        delete next[appId];
        return next;
      });
    }
  };

  const handleResyncGame = async (appId: number) => {
    if (!window.darkhub?.steamLua) return;
    setActionInProgress((prev) => ({ ...prev, [appId]: 'resync' }));
    try {
      const res = await window.darkhub.steamLua.downloadAndInstallPackage({
        appId,
        autoUpdate: true,
        onlineFix: optOnlineFix
      });
      setStatusMessage({
        type: 'success',
        text: res && res.packageDownloaded
          ? '✓ Manifestos e depots re-sincronizados para ' + appId
          : '✓ Arquivo .lua atualizado para ' + appId
      });
      await loadStatusAndList();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Erro ao re-sincronizar' });
    } finally {
      setActionInProgress((prev) => {
        const next = { ...prev };
        delete next[appId];
        return next;
      });
    }
  };

  const handleSaveLuaText = async () => {
    if (!selectedAppId || !window.darkhub?.steamLua) return;
    try {
      await window.darkhub.steamLua.saveLuaText({ appId: selectedAppId, rawText: rawTextDraft });
      setStatusMessage({ type: 'success', text: 'Arquivo .lua salvo com sucesso!' });
      const details = await window.darkhub.steamLua.getDetails(selectedAppId);
      setSelectedDetails(details);
      await loadStatusAndList();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Falha ao salvar .lua' });
    }
  };

  const handleToggleDepot = async (depotId: number, currentEnabled: boolean) => {
    if (!selectedAppId || !window.darkhub?.steamLua) return;
    try {
      const updated = await window.darkhub.steamLua.toggleDepot({
        appId: selectedAppId,
        depotId,
        options: { enabled: !currentEnabled }
      });
      setSelectedDetails(updated);
      setRawTextDraft(updated.rawText);
      await loadStatusAndList();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Erro ao alterar depot' });
    }
  };

  // Filtered games list
  const filteredList = useMemo(() => {
    return installedLuas.filter((item) => {
      const meta = appMetadataCache[item.appId];
      const nameMatch = meta?.name?.toLowerCase().includes(searchQuery.toLowerCase());
      const idMatch = String(item.appId).includes(searchQuery);
      if (searchQuery && !nameMatch && !idMatch) return false;

      if (filterMode === 'online') {
        const isOnline = item.baseAppId === 480 || item.entriesCount > item.depotCount;
        if (!isOnline) return false;
      }
      if (filterMode === 'dlc') {
        if (item.dlcCount === 0) return false;
      }
      return true;
    });
  }, [installedLuas, searchQuery, filterMode, appMetadataCache]);

  return (
    <div className="w-full max-w-6xl mx-auto space-y-3.5 p-1 md:p-2 animate-fadeIn text-zinc-100">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
        <div>
          <h1 className="text-lg font-bold text-zinc-100 tracking-tight flex items-center gap-2">
            {t('steamLua.title', 'Steam Lua & Depot Tools')}
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono font-normal">v0.4.6</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            {t('steamLua.subtitle', 'Gerenciamento nativo de AppIDs, Depots, DLCs e scripts stplug-in para o cliente Steam.')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenFolder}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/90 hover:bg-zinc-700 text-xs font-medium text-zinc-200 border border-zinc-700/60 transition shadow-sm"
          >
            <FolderOpen className="w-3.5 h-3.5 text-zinc-400" />
            {t('steamLua.openFolder', 'Abrir Pasta stplug-in')}
          </button>
          <button
            onClick={handleRestartSteam}
            disabled={restartingSteam}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/90 hover:bg-zinc-700 text-xs font-medium text-zinc-200 border border-zinc-700/60 transition shadow-sm disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 text-zinc-400 ${restartingSteam ? 'animate-spin' : ''}`} />
            {t('steamLua.restartSteam', 'Reiniciar Steam')}
          </button>
        </div>
      </div>

      {/* Status Alert Banner */}
      {statusMessage && (
        <div
          className={`flex items-center justify-between p-3 rounded-xl border text-xs font-medium ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
              : statusMessage.type === 'error'
              ? 'bg-rose-950/40 border-rose-500/30 text-rose-300'
              : 'bg-sky-950/40 border-sky-500/30 text-sky-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            ) : statusMessage.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            ) : (
              <Sparkles className="w-4 h-4 text-sky-400 flex-shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-zinc-400 hover:text-zinc-100 ml-4">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Metric Cards (3 Columns) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Steam Path Card */}
        <div className="bg-zinc-900/60 rounded-xl border border-zinc-800/80 p-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-zinc-800 text-zinc-300">
              <HardDrive className="w-4 h-4 text-zinc-300" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-zinc-400">{t('steamLua.steamPath', 'Diretório Steam')}</div>
              <div className="text-xs font-semibold text-zinc-100 truncate" title={steamStatus?.steamPath || 'Não detectado'}>
                {steamStatus?.steamPath || 'Não detectado'}
              </div>
            </div>
          </div>
          <span className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded flex-shrink-0 ${
            steamStatus?.isValid 
              ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/30' 
              : 'bg-rose-950/60 text-rose-400 border border-rose-500/30'
          }`}>
            {steamStatus?.isValid ? 'Pronto' : 'Ausente'}
          </span>
        </div>

        {/* Loader Card */}
        <div className="bg-zinc-900/60 rounded-xl border border-zinc-800/80 p-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`p-2 rounded-lg ${unlockerStatus.isInstalled ? 'bg-emerald-950/60 text-emerald-400' : 'bg-zinc-800 text-zinc-400'}`}>
              {unlockerStatus.isInstalled ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-zinc-400">{t('steamLua.openSteamToolsLoader', 'Loader OpenSteamTools')}</div>
              <div className="text-xs font-semibold text-zinc-100">
                {unlockerStatus.isInstalled ? 'Instalado & Ativo' : 'Não Instalado'}
              </div>
            </div>
          </div>
          <button
            onClick={handleToggleUnlocker}
            disabled={togglingUnlocker}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition disabled:opacity-50 flex-shrink-0 ${
              unlockerStatus.isInstalled
                ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
            }`}
          >
            {togglingUnlocker ? '...' : unlockerStatus.isInstalled ? t('steamLua.uninstallLoader', 'Desinstalar') : t('steamLua.installLoader', 'Instalar')}
          </button>
        </div>

        {/* Games Configured Card */}
        <div className="bg-zinc-900/60 rounded-xl border border-zinc-800/80 p-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-rose-950/50 text-rose-400">
              <Gamepad2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-zinc-400">{t('steamLua.configuredGames', 'Jogos Configurados')}</div>
              <div className="text-xs font-semibold text-zinc-100">
                {installedLuas.length} {installedLuas.length === 1 ? 'jogo na biblioteca' : 'jogos na biblioteca'}
              </div>
            </div>
          </div>
          <button
            onClick={loadStatusAndList}
            title="Atualizar lista"
            className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* QUICK ADD GAME HERO CARD */}
      <div className="bg-zinc-900/80 rounded-xl border border-zinc-800/80 p-4 space-y-3.5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-zinc-100 flex items-center gap-2 uppercase tracking-wider">
            <Plus className="w-3.5 h-3.5 text-rose-500" />
            {t('steamLua.addToLibrary', 'Adicionar Jogo à Biblioteca Steam')}
          </h2>
          <span className="text-[11px] text-zinc-500">
            Suporta link da Loja Steam ou AppID numérico
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative flex-1">
            <input
              type="text"
              value={inputUrlOrId}
              onChange={(e) => setInputUrlOrId(e.target.value)}
              placeholder="Ex: https://store.steampowered.com/app/1995820/ ou 1995820"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500/80 transition font-mono"
            />
          </div>

          <div className="flex items-center gap-3 bg-zinc-950/70 px-3 py-2 rounded-lg border border-zinc-800">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={optOnlineFix}
                onChange={(e) => setOptOnlineFix(e.target.checked)}
                className="rounded bg-zinc-900 border-zinc-700 text-rose-500 focus:ring-0 w-3.5 h-3.5"
              />
              <span className="text-xs text-zinc-300 font-medium flex items-center gap-1">
                <Globe className="w-3 h-3 text-sky-400" />
                Online Fix (480)
              </span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={optAutoUpdate}
                onChange={(e) => setOptAutoUpdate(e.target.checked)}
                className="rounded bg-zinc-900 border-zinc-700 text-rose-500 focus:ring-0 w-3.5 h-3.5"
              />
              <span className="text-xs text-zinc-300 font-medium flex items-center gap-1">
                <RefreshCw className="w-3 h-3 text-emerald-400" />
                Auto-Update
              </span>
            </label>
          </div>

          <button
            onClick={handleAddGame}
            disabled={isAdding || !parseAppId(inputUrlOrId)}
            className="flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition disabled:opacity-40 shadow-sm flex-shrink-0"
          >
            {isAdding ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>{t('steamLua.processing', 'Processando...')}</span>
              </>
            ) : (
              <>
                <DownloadCloud className="w-3.5 h-3.5" />
                <span>{t('steamLua.addToLibrary', 'Adicionar à Biblioteca')}</span>
              </>
            )}
          </button>
        </div>

        {/* Live Preview Bar */}
        {previewInfo && (
          <div className="flex items-center gap-3 bg-zinc-950/80 p-2.5 rounded-lg border border-zinc-800/90 animate-fadeIn">
            {previewInfo.headerImage ? (
              <img
                src={previewInfo.headerImage}
                alt={previewInfo.name}
                className="w-20 h-9 object-cover rounded border border-zinc-800"
              />
            ) : (
              <div className="w-20 h-9 bg-zinc-800 rounded flex items-center justify-center text-zinc-400 text-[10px] font-mono">
                AppID {previewInfo.appId}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[10px] text-zinc-500">{t('steamLua.gameFoundStore', 'Jogo Encontrado na Loja:')}</div>
              <div className="text-xs font-bold text-zinc-100 truncate">{previewInfo.name}</div>
            </div>
            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
              ID: {previewInfo.appId}
            </span>
          </div>
        )}
      </div>

      {/* GAMES LIBRARY GRID / LIST */}
      <div className="space-y-3">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800/80">
          <div className="relative flex-1 w-full">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtrar por título ou AppID..."
              className="w-full bg-zinc-950 border border-zinc-800/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 font-mono"
            />
          </div>

          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                filterMode === 'all'
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Todos ({installedLuas.length})
            </button>
            <button
              onClick={() => setFilterMode('online')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                filterMode === 'online'
                  ? 'bg-sky-900/60 text-sky-300 border border-sky-700/50'
                  : 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Online Fix
            </button>
            <button
              onClick={() => setFilterMode('dlc')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                filterMode === 'dlc'
                  ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50'
                  : 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Com DLCs
            </button>

            <div className="h-4 w-px bg-zinc-800 mx-1" />

            <button
              onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
              className="p-1.5 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
              title={viewMode === 'grid' ? 'Mudar para exibição em lista' : 'Mudar para exibição em cards'}
            >
              {viewMode === 'grid' ? <List className="w-3.5 h-3.5" /> : <LayoutGrid className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Empty State */}
        {filteredList.length === 0 ? (
          <div className="text-center py-12 bg-zinc-900/40 rounded-xl border border-zinc-800/80">
            <Gamepad2 className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
            <div className="text-sm font-semibold text-zinc-300">Nenhum jogo encontrado</div>
            <p className="text-xs text-zinc-500 mt-0.5">
              {searchQuery ? 'Tente outro termo na pesquisa.' : 'Adicione seu primeiro jogo colando o link ou AppID acima.'}
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          /* GRID VIEW */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredList.map((item) => {
              const meta = appMetadataCache[item.appId];
              const isWorking = actionInProgress[item.appId];
              const hasOnline = item.baseAppId === 480 || item.entriesCount > item.depotCount;

              return (
                <div
                  key={item.appId}
                  className="bg-zinc-900/60 hover:bg-zinc-900/90 rounded-xl border border-zinc-800/80 hover:border-zinc-700 p-3 flex flex-col justify-between gap-3 transition shadow-sm group"
                >
                  <div className="space-y-2.5">
                    {/* Banner Image */}
                    <div className="relative aspect-[460/215] w-full rounded-lg overflow-hidden bg-zinc-950 border border-zinc-800/80">
                      {meta?.headerImage ? (
                        <img
                          src={meta.headerImage}
                          alt={meta.name || `AppID ${item.appId}`}
                          className="w-full h-full object-cover group-hover:scale-102 transition duration-200"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950 text-zinc-600 p-2">
                          <Gamepad2 className="w-6 h-6 mb-1" />
                          <span className="text-[10px] font-mono text-zinc-500">AppID {item.appId}</span>
                        </div>
                      )}

                      <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                        {hasOnline && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-500 text-white font-mono shadow">
                            ONLINE FIX
                          </span>
                        )}
                        <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-black/80 text-zinc-300 border border-zinc-700/50 backdrop-blur">
                          {item.appId}
                        </span>
                      </div>
                    </div>

                    {/* Title & Metadata */}
                    <div>
                      <h3 className="font-semibold text-xs text-zinc-100 truncate" title={meta?.name || `AppID ${item.appId}`}>
                        {meta?.name || `Jogo AppID ${item.appId}`}
                      </h3>
                      <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 mt-1 font-mono">
                        <span>{item.depotCount} {item.depotCount === 1 ? 'Depot' : 'Depots'}</span>
                        <span>•</span>
                        <span>{item.dlcCount} DLCs</span>
                        <span>•</span>
                        <span>{(item.sizeBytes / 1024).toFixed(1)} KB</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Toolbar */}
                  <div className="pt-2.5 border-t border-zinc-800/80 flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1">
                      {/* Online Fix Toggle */}
                      <button
                        onClick={() => handleToggleOnlineFix(item.appId, hasOnline)}
                        disabled={Boolean(isWorking)}
                        title={hasOnline ? 'Desativar Spacewar 480' : 'Ativar Spacewar 480 Online Fix'}
                        className={`p-1.5 rounded text-xs transition ${
                          hasOnline
                            ? 'bg-sky-950 text-sky-400 border border-sky-600/40 hover:bg-sky-900'
                            : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60'
                        }`}
                      >
                        <Globe className="w-3.5 h-3.5" />
                      </button>

                      {/* Resync */}
                      <button
                        onClick={() => handleResyncGame(item.appId)}
                        disabled={Boolean(isWorking)}
                        title="Re-sincronizar Manifestos da CDN"
                        className="p-1.5 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60 transition"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isWorking === 'resync' ? 'animate-spin' : ''}`} />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleDeleteGame(item.appId)}
                        disabled={Boolean(isWorking)}
                        title="Remover da Biblioteca"
                        className="p-1.5 rounded bg-zinc-800 text-zinc-400 hover:text-rose-400 border border-zinc-700/60 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      onClick={() => setSelectedAppId(item.appId)}
                      className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700/60 transition flex items-center gap-1"
                    >
                      <Settings className="w-3 h-3 text-zinc-400" />
                      Gerenciar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* LIST VIEW */
          <div className="bg-zinc-900/60 rounded-xl border border-zinc-800/80 divide-y divide-zinc-800/60 overflow-hidden">
            {filteredList.map((item) => {
              const meta = appMetadataCache[item.appId];
              const isWorking = actionInProgress[item.appId];
              const hasOnline = item.baseAppId === 480 || item.entriesCount > item.depotCount;

              return (
                <div key={item.appId} className="p-3 flex items-center justify-between gap-3 hover:bg-zinc-900/80 transition">
                  <div className="flex items-center gap-3 min-w-0">
                    {meta?.headerImage ? (
                      <img src={meta.headerImage} alt="" className="w-14 h-7 object-cover rounded border border-zinc-800" />
                    ) : (
                      <div className="w-14 h-7 bg-zinc-950 rounded flex items-center justify-center text-[9px] font-mono text-zinc-500">
                        {item.appId}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-zinc-100 truncate">
                        {meta?.name || `Jogo AppID ${item.appId}`}
                      </div>
                      <div className="text-[11px] text-zinc-500 font-mono flex items-center gap-2">
                        <span>AppID: {item.appId}</span>
                        <span>•</span>
                        <span>{item.depotCount} Depots</span>
                        <span>•</span>
                        <span>{item.dlcCount} DLCs</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {hasOnline && (
                      <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-600/30">
                        Online Fix
                      </span>
                    )}

                    <button
                      onClick={() => handleToggleOnlineFix(item.appId, hasOnline)}
                      disabled={Boolean(isWorking)}
                      className="p-1.5 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
                      title="Alternar Online Fix"
                    >
                      <Globe className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleResyncGame(item.appId)}
                      disabled={Boolean(isWorking)}
                      className="p-1.5 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
                      title="Re-sincronizar"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isWorking === 'resync' ? 'animate-spin' : ''}`} />
                    </button>

                    <button
                      onClick={() => setSelectedAppId(item.appId)}
                      className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700/60 transition"
                    >
                      Gerenciar
                    </button>

                    <button
                      onClick={() => handleDeleteGame(item.appId)}
                      disabled={Boolean(isWorking)}
                      className="p-1.5 rounded bg-zinc-800 text-zinc-400 hover:text-rose-400 transition"
                      title="Remover"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* INSPECTOR & CODE MODAL */}
      {selectedAppId && selectedDetails && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-popIn">
            {/* Modal Header */}
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-zinc-800 text-zinc-300">
                  <Gamepad2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">
                    {appMetadataCache[selectedAppId]?.name || `Jogo AppID ${selectedAppId}`}
                  </h3>
                  <div className="text-[11px] text-zinc-400 font-mono">
                    {selectedDetails.filePath}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center bg-zinc-950 p-0.5 rounded-lg border border-zinc-800">
                  <button
                    onClick={() => setActiveInspectorTab('visual')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                      activeInspectorTab === 'visual' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Depots & DLCs
                  </button>
                  <button
                    onClick={() => setActiveInspectorTab('code')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                      activeInspectorTab === 'code' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Código Lua
                  </button>
                </div>

                <button
                  onClick={() => setSelectedAppId(null)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {activeInspectorTab === 'visual' ? (
                <div className="space-y-2.5">
                  <div className="text-xs text-zinc-400">
                    Gerencie individualmente os pacotes de manifestos e chaves de depot vinculados a este jogo:
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectedDetails.entries.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80"
                      >
                        <div className="min-w-0 flex-1 mr-2 font-mono">
                          <div className="text-xs font-bold text-zinc-200">{entry.id}</div>
                          <div className="text-[10px] text-zinc-500 truncate">
                            {entry.comment || (entry.hasKey ? 'Chave Descriptografada' : 'Entitlement Base')}
                          </div>
                        </div>

                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={entry.isEnabled}
                            onChange={() => handleToggleDepot(entry.id, entry.isEnabled)}
                            className="sr-only peer"
                          />
                          <div className="w-7 h-4 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-rose-600"></div>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <textarea
                    value={rawTextDraft}
                    onChange={(e) => setRawTextDraft(e.target.value)}
                    rows={14}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 font-mono text-xs text-zinc-200 focus:outline-none focus:border-rose-500/80"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={handleSaveLuaText}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition shadow-sm"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Salvar Alterações
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
