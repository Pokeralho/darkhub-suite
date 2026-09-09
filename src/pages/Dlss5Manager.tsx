import React, { useEffect, useState, useRef } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import {
  Sparkles,
  FolderOpen,
  FileSearch,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Sliders,
  Terminal,
  Zap,
  Info,
  History,
  Play,
  Monitor,
  ShieldCheck,
  ExternalLink,
  DownloadCloud,
  FileCode,
  FolderCheck,
  ChevronDown,
  ChevronUp,
  Search,
  Gamepad2
} from 'lucide-react';

interface SteamGame {
  appId: string;
  name: string;
  installDir: string;
  headerUrl: string;
  isApplied: boolean;
}

interface GpuInfo {
  vendor: 'nvidia' | 'amd' | 'intel' | 'other';
  model: string;
  driverVersion?: string;
  isRtx?: boolean;
  isAmd?: boolean;
  isIntel?: boolean;
}

interface GraphicsApiInfo {
  primaryApi: string;
  apiName: string;
  apiBadge: string;
  hasD3D12: boolean;
  hasAgilitySdk: boolean;
  hasD3D11: boolean;
  hasVulkan: boolean;
  hasOpenGL: boolean;
  hasD3D9: boolean;
  isRemix?: boolean;
  is64?: boolean;
  bitness?: string;
  detectedApis: string[];
  importedDlls: string[];
  recommendedLoader: string;
  loaderReason: string;
  compatibilityNote: string;
}

interface RouteInfo {
  recommendedRoute: string;
  routeName: string;
  routeBadge: string;
  routeDescription: string;
  allowedRoutes: Array<{ id: string; name: string; description: string }>;
  isRemix: boolean;
  is64: boolean;
  neuralUpstreamRecommended: boolean;
}

interface ScannedGame {
  ok: boolean;
  gameName?: string;
  exePath?: string | null;
  targetDir?: string;
  searchBaseDir?: string;
  engine?: string;
  graphicsApi?: GraphicsApiInfo;
  routeInfo?: RouteInfo;
  dlssDetected?: boolean;
  existingDlls?: string[];
  installed?: boolean;
  installedProfile?: string | null;
  installedLoader?: string | null;
  manifest?: any;
  error?: string;
}

interface RecentGame {
  gameName: string;
  targetDir: string;
  exePath?: string | null;
  profile: string;
  loader: string;
  route?: string;
  neuralUpstream?: boolean;
  engine?: string;
  graphicsApi?: any;
  lastAppliedAt?: number;
}

export default function Dlss5Manager() {
  const { t } = useI18n();

  // GPU & Profile State
  const [gpu, setGpu] = useState<GpuInfo>({ vendor: 'nvidia', model: 'Detecting GPU...' });
  const [selectedProfile, setSelectedProfile] = useState<'nvidia' | 'amd' | 'intel'>('nvidia');

  // Game Detection State
  const [targetPath, setTargetPath] = useState<string>('');
  const [scannedGame, setScannedGame] = useState<ScannedGame | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [dragOver, setDragOver] = useState<boolean>(false);

  // Options State
  const [upscaler, setUpscaler] = useState<string>('dlss');
  const [frameGen, setFrameGen] = useState<boolean>(true);
  const [overlayMenu, setOverlayMenu] = useState<boolean>(true);
  const [loaderDll, setLoaderDll] = useState<string>('dxgi.dll');
  const [signatureBypass, setSignatureBypass] = useState<boolean>(true);
  const [selectedRoute, setSelectedRoute] = useState<string>('optiscaler');
  const [neuralUpstream, setNeuralUpstream] = useState<boolean>(true);
  const [amdEngine, setAmdEngine] = useState<'zluda' | 'fsr'>('zluda');
  const [zludaCache, setZludaCache] = useState<boolean>(true);

  // Action / State
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [isReverting, setIsReverting] = useState<boolean>(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Logs & History
  const [logs, setLogs] = useState<string[]>([]);
  const [recentGames, setRecentGames] = useState<RecentGame[]>([]);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Steam Library Integration State
  const [steamGames, setSteamGames] = useState<SteamGame[]>([]);
  const [isLoadingSteam, setIsLoadingSteam] = useState<boolean>(false);
  const [steamSearchQuery, setSteamSearchQuery] = useState<string>('');

  const filteredSteamGames = steamGames.filter((g) =>
    g.name.toLowerCase().includes(steamSearchQuery.toLowerCase())
  );

  // Auto-scroll logs terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const refreshSteamGames = async () => {
    if (window.darkhub?.dlss5?.getSteamGames) {
      setIsLoadingSteam(true);
      try {
        const sGames = await window.darkhub.dlss5.getSteamGames();
        if (Array.isArray(sGames)) {
          setSteamGames(sGames);
        }
      } catch (e) {
        console.error('Failed to load Steam games:', e);
      } finally {
        setIsLoadingSteam(false);
      }
    }
  };

  // Load GPU info, Provenance, Steam Games, Recent Games and subscribe to live IPC logs
  useEffect(() => {
    const init = async () => {
      try {
        if (window.darkhub?.dlss5?.detectGpu) {
          const detected = await window.darkhub.dlss5.detectGpu();
          if (detected?.vendor) {
            setGpu(detected);
            if (detected.vendor === 'amd') {
              setSelectedProfile('amd');
              setUpscaler('fsr31');
            } else if (detected.vendor === 'intel') {
              setSelectedProfile('intel');
              setUpscaler('xess');
            } else {
              setSelectedProfile('nvidia');
              setUpscaler('dlss');
            }
          }
        }

        if (window.darkhub?.dlss5?.getRecentGames) {
          const recents = await window.darkhub.dlss5.getRecentGames();
          if (Array.isArray(recents)) {
            setRecentGames(recents);
          }
        }

        // Auto-load Steam installed games
        await refreshSteamGames();
      } catch (err: any) {
        console.error('Failed to initialize DLSS 5 Manager:', err);
      }
    };

    init();

    // Listen to live logs from background injection
    let unsubscribe: (() => void) | undefined;
    if (window.darkhub?.dlss5?.onLog) {
      unsubscribe = window.darkhub.dlss5.onLog((entry: string) => {
        setLogs((prev) => [...prev.slice(-250), `[${new Date().toLocaleTimeString()}] ${entry}`]);
      });
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Update profile tuning defaults when profile changes
  const handleProfileChange = (profile: 'nvidia' | 'amd' | 'intel') => {
    setSelectedProfile(profile);
    if (profile === 'amd') {
      setUpscaler('fsr31');
    } else if (profile === 'intel') {
      setUpscaler('xess');
    } else {
      setUpscaler('dlss');
    }
  };

  // Perform autonomous scan on path
  const handleScanGame = async (path: string) => {
    if (!path || !window.darkhub?.dlss5?.scanGame) return;
    setIsScanning(true);
    setStatus(null);
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] Analisando estrutura executável: ${path}`]);

    try {
      const res = await window.darkhub.dlss5.scanGame(path);
      if (res && res.ok) {
        setScannedGame(res);
        setTargetPath(res.targetDir || path);

        // Auto-configure recommended loader based on detected Graphics API
        if (res.graphicsApi?.recommendedLoader) {
          setLoaderDll(res.graphicsApi.recommendedLoader);
        }

        // Auto-configure Autopilot recommended route
        if (res.routeInfo?.recommendedRoute) {
          setSelectedRoute(res.routeInfo.recommendedRoute);
        }
        if (res.routeInfo?.neuralUpstreamRecommended !== undefined) {
          setNeuralUpstream(res.routeInfo.neuralUpstreamRecommended);
        }

        setLogs((prev) => [
          ...prev,
          `[PE SCAN] Jogo identificado: ${res.gameName ?? 'Game'} (${res.engine ?? 'custom'} - ${res.graphicsApi?.bitness ?? '64-bit'})`,
          `[API DETECTADA] ${res.graphicsApi?.apiName ?? 'DirectX'} -> Loader recomendado: ${res.graphicsApi?.recommendedLoader ?? 'dxgi.dll'}`,
          `[AUTOPILOT] Rota selecionada: ${res.routeInfo?.routeBadge ?? 'OptiScaler'} (${res.routeInfo?.recommendedRoute ?? 'optiscaler'})`,
          `[DIRETÓRIO] Alvo de injeção: ${res.targetDir ?? path}`
        ]);
      } else {
        setStatus({
          type: 'error',
          message: res?.error || 'Não foi possível detectar um executável válido na pasta selecionada.'
        });
      }
    } catch (err: any) {
      setStatus({ type: 'error', message: err?.message || 'Erro ao escanear pasta do jogo.' });
    } finally {
      setIsScanning(false);
    }
  };

  // Dialog Browse Folder
  const handleSelectFolder = async () => {
    if (!window.darkhub?.dialog?.selectFolder) return;
    try {
      const res = await window.darkhub.dialog.selectFolder({
        title: t('dlss5.selectFolder', 'Selecionar Pasta do Jogo')
      });
      const folderPath = res?.folderPath || (Array.isArray(res?.filePaths) ? res.filePaths[0] : null);
      if (folderPath) {
        setTargetPath(folderPath);
        await handleScanGame(folderPath);
      }
    } catch (err: any) {
      console.error('Error selecting folder:', err);
    }
  };

  // Dialog Browse Exe
  const handleSelectExe = async () => {
    if (!window.darkhub?.dialog?.selectFiles) return;
    try {
      const res = await window.darkhub.dialog.selectFiles({
        title: t('dlss5.selectExe', 'Selecionar Executável (.exe)'),
        filters: [{ name: 'Executáveis do Jogo', extensions: ['exe'] }]
      });
      const exePath = res?.filePaths?.[0];
      if (exePath) {
        setTargetPath(exePath);
        await handleScanGame(exePath);
      }
    } catch (err: any) {
      console.error('Error selecting exe:', err);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    const firstPath = (files[0] as any)?.path;
    if (firstPath) {
      setTargetPath(firstPath);
      await handleScanGame(firstPath);
    }
  };

  // Open Game Folder in Explorer
  const handleOpenFolder = async (dirToOpen?: string) => {
    const p = dirToOpen || scannedGame?.targetDir || targetPath;
    if (!p) return;
    try {
      if (window.darkhub?.dlss5?.openFolder) {
        await window.darkhub.dlss5.openFolder(p);
      }
    } catch (err) {
      console.error('Failed to open folder:', err);
    }
  };
  // Apply DLSS 5 Autonomously
  const handleApply = async () => {
    if (!scannedGame || !window.darkhub?.dlss5?.apply) return;
    setIsApplying(true);
    setStatus(null);

    try {
      const options = {
        targetDir: scannedGame.targetDir || targetPath,
        gamePath: scannedGame.exePath || undefined,
        profile: selectedProfile,
        amdEngine: selectedProfile === 'amd' ? amdEngine : undefined,
        zludaCache: selectedProfile === 'amd' ? zludaCache : undefined,
        upscaler,
        route: selectedRoute,
        neuralUpstream,
        enableFrameGen: frameGen,
        enableOverlay: overlayMenu,
        loader: loaderDll,
        signatureBypass
      };

      const res = await window.darkhub.dlss5.apply(options);
      if (res && res.ok) {
        setStatus({
          type: 'success',
          message: t('dlss5.applySuccess', 'DLSS 5 aplicado com sucesso ao jogo! Bom jogo!')
        });
        // Refresh scanned info
        await handleScanGame(scannedGame.targetDir || targetPath);
        // Refresh recent games
        if (window.darkhub?.dlss5?.getRecentGames) {
          const recents = await window.darkhub.dlss5.getRecentGames();
          if (Array.isArray(recents)) setRecentGames(recents);
        }
        // Refresh Steam games applied status
        await refreshSteamGames();
      } else {
        setStatus({
          type: 'error',
          message: res?.error || 'Falha ao aplicar DLSS 5 ao jogo.'
        });
      }
    } catch (err: any) {
      setStatus({ type: 'error', message: err?.message || 'Erro inesperado durante aplicação.' });
    } finally {
      setIsApplying(false);
    }
  };

  // Revert / Uninstall Mod
  const handleRevert = async () => {
    if (!scannedGame || !window.darkhub?.dlss5?.revert) return;
    setIsReverting(true);
    setStatus(null);

    try {
      const targetDir = scannedGame.targetDir || targetPath;
      const res = await window.darkhub.dlss5.revert({ targetDir });
      if (res && res.ok) {
        setStatus({
          type: 'success',
          message: t('dlss5.revertSuccess', 'Arquivos originais restaurados e mod desinstalado com sucesso!')
        });
        await handleScanGame(targetDir);
        await refreshSteamGames();
      } else {
        setStatus({
          type: 'error',
          message: res?.error || 'Falha ao restaurar arquivos originais.'
        });
      }
    } catch (err: any) {
      setStatus({ type: 'error', message: err?.message || 'Erro durante a desinstalação.' });
    } finally {
      setIsReverting(false);
    }
  };

  // Badge Color Helper for Graphics API
  const getApiBadgeClass = (primaryApi?: string) => {
    switch (primaryApi) {
      case 'dx12_agility':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50';
      case 'dx12':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/50';
      case 'vulkan':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/50';
      case 'opengl':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/50';
      case 'dx9':
        return 'bg-zinc-700/40 text-zinc-300 border-zinc-600';
      default:
        return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50';
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-zinc-950 text-zinc-100 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-400">
            <Sparkles size={28} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
                {t('dlss5.title', 'DLSS 5 & Universal Neural Upscaler Manager')}
              </h1>
              <span className="px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-full flex items-center gap-1">
                <AlertTriangle size={12} className="text-amber-400" />
                <span>EXPERIMENTAL / BETA</span>
              </span>
              <span className="px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase bg-blue-500/20 text-blue-300 border border-blue-500/40 rounded-full">
                {t('dlss5.badgeAi', 'AI Neural Reconstruction')}
              </span>
            </div>
            <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
              {t(
                'dlss5.subtitle',
                'Injeção e configuração autônoma de upscaling neural por IA (DLSS 5, FSR 3.1/4.0 e XeSS) com Frame Generation universal para NVIDIA e AMD.'
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Experimental Disclaimer Alert */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3.5">
        <div className="p-2 bg-amber-500/20 rounded-lg text-amber-400 shrink-0 mt-0.5">
          <AlertTriangle size={18} />
        </div>
        <div className="text-xs space-y-1">
          <h4 className="font-bold text-amber-200">
            Módulo Experimental / Pesquisa de IA
          </h4>
          <p className="text-amber-200/80 leading-relaxed">
            O DLSS 5 & Universal Neural Upscaler é uma tecnologia em estágio <strong>experimental</strong> para interoperabilidade de modelos neurais e frame generation entre NVIDIA, AMD e Intel. O DarkHub realiza backup preventivo dos arquivos modificados, permitindo reversão a qualquer momento.
          </p>
        </div>
      </div>

      {/* GPU Hardware Detection & Profile Banner */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Hardware Status */}
        <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-4 flex items-center gap-4">
          <div className="p-3 bg-zinc-800 border border-zinc-700/60 rounded-xl text-zinc-300">
            <Monitor size={24} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-zinc-400 font-medium">{t('dlss5.gpuCardTitle', 'Hardware Gráfico')}</div>
            <div className="text-sm font-semibold text-zinc-100 truncate" title={gpu.model}>
              {gpu.model}
            </div>
            <div className="text-xs text-zinc-400 flex items-center gap-2 mt-0.5">
              <span>{t('dlss5.gpuVendor', 'Fabricante')}: <strong className="text-zinc-200 uppercase">{gpu.vendor}</strong></span>
              {gpu.driverVersion && (
                <span>• Driver: <span className="font-mono text-zinc-300">{gpu.driverVersion}</span></span>
              )}
            </div>
          </div>
        </div>

        {/* Profile Selector */}
        <div className="lg:col-span-2 bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs text-zinc-400 font-medium">{t('dlss5.gpuProfile', 'Perfil de Otimização')}</div>
            <div className="text-xs text-zinc-400 mt-0.5">
              Ajusta automaticamente hooks de memória, spoofing de vendor e Frame Generation.
            </div>
          </div>
          <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
            <button
              onClick={() => handleProfileChange('nvidia')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                selectedProfile === 'nvidia'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t('dlss5.profileNvidia', 'NVIDIA (Nativo / Estável)')}
            </button>
            <button
              onClick={() => handleProfileChange('amd')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                selectedProfile === 'amd'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t('dlss5.profileAmd', 'AMD Radeon (Experimental / FSR)')}
            </button>
            <button
              onClick={() => handleProfileChange('intel')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                selectedProfile === 'intel'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/50 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t('dlss5.profileIntel', 'Intel Arc')}
            </button>
          </div>
        </div>
      </div>

      {/* AMD Architecture & ZLUDA HIP Neural Engine Panel */}
      {selectedProfile === 'amd' && (
        <div className="space-y-4">
          {/* Warning & Overview */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3.5">
            <div className="p-2 bg-amber-500/20 rounded-lg text-amber-400 shrink-0 mt-0.5">
              <AlertTriangle size={20} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-amber-300">
                  {t('dlss5.amdWarningTitle', 'Aviso de Instabilidade - Placas AMD')}
                </h4>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-amber-500/30 text-amber-200 rounded">
                  Dual-Tier AMD
                </span>
              </div>
              <p className="text-xs text-amber-200/80 leading-relaxed">
                {t(
                  'dlss5.amdWarningDesc',
                  'GPUs AMD não contam com Tensor Cores físicos para execução de modelos proprietários da NVIDIA. O DarkHub utiliza a ponte OptiScaler com tradução DirectCompute e FSR 3.1/4.0 Frame Generation. Em alguns jogos podem ocorrer cintilação (flicker) no HUD ou artefatos visuais menores.'
                )}
              </p>
            </div>
          </div>

          {/* Engine Selector Card */}
          <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-zinc-200">
                  {t('dlss5.amdEngineLabel', 'Motor de Execução AMD')}
                </span>
                <p className="text-[11px] text-zinc-400">
                  Selecione entre aceleração neural direta ZLUDA (RDNA 3/4) ou modo de compatibilidade universal FSR (RDNA 1/2).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* ZLUDA HIP Option */}
              <div
                onClick={() => setAmdEngine('zluda')}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                  amdEngine === 'zluda'
                    ? 'bg-amber-500/10 border-amber-500/60 shadow-sm'
                    : 'bg-zinc-950/60 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                      <Zap size={14} className={amdEngine === 'zluda' ? 'text-amber-400' : 'text-zinc-500'} />
                      {t('dlss5.amdEngineZluda', 'ZLUDA HIP Neural Engine (RDNA 3 / 4 WMMA)')}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                      RX 7000 / 8000
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1.5 leading-relaxed">
                    {t(
                      'dlss5.amdEngineZludaDesc',
                      'Tradução de redes neurais CUDA para ROCm/HIP com aceleração por matrizes WMMA FP16/FP8 (RX 7000 / 8000).'
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-zinc-800/60 text-[10px] text-amber-400/90 font-medium">
                  <span>• Aceleração WMMA FP16/FP8</span>
                  <span>• Cache AOT Anti-Stutter</span>
                </div>
              </div>

              {/* FSR Fallback Option */}
              <div
                onClick={() => setAmdEngine('fsr')}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                  amdEngine === 'fsr'
                    ? 'bg-blue-500/10 border-blue-500/60 shadow-sm'
                    : 'bg-zinc-950/60 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                      <Sliders size={14} className={amdEngine === 'fsr' ? 'text-blue-400' : 'text-zinc-500'} />
                      {t('dlss5.amdEngineFsr', 'FSR 3.1 / FidelityFX Fallback (RDNA 1 / 2)')}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-zinc-800 text-zinc-400 border border-zinc-700 font-mono">
                      RX 5000 / 6000
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1.5 leading-relaxed">
                    {t(
                      'dlss5.amdEngineFsrDesc',
                      'Modo de alta compatibilidade DirectCompute para placas AMD sem núcleos WMMA físicos (RX 5000, RX 6000, Vega, Polaris).'
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-zinc-800/60 text-[10px] text-zinc-400 font-medium">
                  <span>• Tradução DirectCompute</span>
                  <span>• FSR 3.1 Frame Gen</span>
                </div>
              </div>
            </div>

            {/* ZLUDA Options & AMD HIP SDK Info */}
            {amdEngine === 'zluda' && (
              <div className="space-y-3 pt-2">
                {/* AOT Cache Toggle */}
                <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/80 flex items-center justify-between">
                  <div className="pr-3">
                    <div className="text-xs font-medium text-zinc-200 flex items-center gap-1.5">
                      <span>{t('dlss5.zludaCache', 'Cache de Tradução AOT (Anti-Stutter)')}</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40">RedDukeDev</span>
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">
                      {t('dlss5.zludaCacheDesc', 'Precompila módulos neurais do container DLSS para eliminar micro-travamentos (stutter) em tempo de execução.')}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={zludaCache}
                    onChange={(e) => setZludaCache(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-500 bg-zinc-900 border-zinc-700 focus:ring-0 cursor-pointer"
                  />
                </div>

                {/* AMD HIP SDK Notice & External Link */}
                <div className="bg-zinc-950/40 border border-zinc-800/80 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="space-y-0.5">
                    <div className="font-semibold text-zinc-200">
                      {t('dlss5.amdHipSdkTitle', 'Aceleração de IA AMD ROCm / HIP SDK')}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {t('dlss5.amdHipSdkDesc', 'Para máxima eficiência neural em placas RX 7000 e 8000, o runtime AMD HIP SDK fornece bibliotecas otimizadas de execução de tensores para Windows.')}
                    </div>
                  </div>
                  <a
                    href="https://www.amd.com/en/developer/resources/rocm-hub/hip-sdk.html"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-zinc-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 self-start sm:self-auto"
                  >
                    <ExternalLink size={13} />
                    <span>{t('dlss5.amdHipSdkLink', 'Baixar AMD HIP SDK Oficial')}</span>
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Steam Library Integration Card */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-400">
              <Gamepad2 size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-zinc-100">
                  {t('dlss5.steamLibrary', 'Jogos Instalados na Steam')}
                </h3>
                {steamGames.length > 0 && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    {steamGames.length}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                {t(
                  'dlss5.selectFromSteam',
                  'Selecione um jogo instalado para escanear e injetar o DLSS 5 com 1 clique.'
                )}
              </p>
            </div>
          </div>

          {/* Search & Refresh controls */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={steamSearchQuery}
                onChange={(e) => setSteamSearchQuery(e.target.value)}
                placeholder={t('dlss5.filterGames', 'Buscar jogos instalados...')}
                className="pl-8 pr-7 py-1.5 bg-zinc-950/70 border border-zinc-700/80 focus:border-blue-500 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 outline-none w-48 transition-colors"
              />
              {steamSearchQuery && (
                <button
                  onClick={() => setSteamSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              onClick={refreshSteamGames}
              disabled={isLoadingSteam}
              title={t('dlss5.refreshSteam', 'Atualizar Lista')}
              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 rounded-lg border border-zinc-700 text-xs transition-colors flex items-center justify-center"
            >
              <RotateCcw size={14} className={isLoadingSteam ? 'animate-spin text-blue-400' : ''} />
            </button>
          </div>
        </div>

        {/* Content area: loading, empty, or games grid */}
        {isLoadingSteam ? (
          <div className="flex items-center justify-center py-8 text-zinc-400 text-xs gap-2 border border-dashed border-zinc-800 rounded-xl bg-zinc-950/40">
            <RotateCcw size={16} className="animate-spin text-blue-400" />
            <span>{t('dlss5.scanning', 'Analisando biblioteca da Steam...')}</span>
          </div>
        ) : steamGames.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-zinc-800 rounded-xl bg-zinc-950/30 text-xs text-zinc-500 space-y-1">
            <Gamepad2 size={24} className="mx-auto text-zinc-600 mb-1" />
            <p>{t('dlss5.noSteamGames', 'Nenhum jogo da Steam detectado.')}</p>
            <p className="text-[11px] text-zinc-600">
              Você pode arrastar ou selecionar manualmente a pasta do jogo na seção abaixo.
            </p>
          </div>
        ) : filteredSteamGames.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-zinc-800 rounded-xl bg-zinc-950/30 text-xs text-zinc-400">
            Nenhum jogo encontrado com "{steamSearchQuery}".
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-[310px] overflow-y-auto pr-1">
            {filteredSteamGames.map((game) => {
              const isSelected =
                (targetPath && targetPath.toLowerCase() === game.installDir.toLowerCase()) ||
                (scannedGame?.targetDir &&
                  scannedGame.targetDir.toLowerCase().startsWith(game.installDir.toLowerCase()));

              return (
                <div
                  key={game.appId}
                  onClick={() => handleScanGame(game.installDir)}
                  className={`group relative flex flex-col justify-between rounded-xl overflow-hidden border transition-all cursor-pointer bg-zinc-950/50 hover:bg-zinc-800/60 ${
                    isSelected
                      ? 'border-blue-500 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500'
                      : 'border-zinc-800 hover:border-zinc-600'
                  }`}
                >
                  {/* Thumbnail / Header */}
                  <div className="relative w-full h-24 bg-zinc-900 overflow-hidden">
                    <img
                      src={game.headerUrl}
                      alt={game.name}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                    <div className="absolute inset-0 -z-0 flex items-center justify-center bg-zinc-900 text-zinc-700">
                      <Gamepad2 size={32} />
                    </div>

                    {/* DLSS 5 Active Badge */}
                    {game.isApplied && (
                      <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-emerald-950/90 border border-emerald-500/50 text-[10px] font-semibold text-emerald-300 flex items-center gap-1 shadow-sm backdrop-blur-sm z-10">
                        <CheckCircle2 size={10} className="text-emerald-400" />
                        <span>{t('dlss5.dlss5Active', 'DLSS 5 Ativo')}</span>
                      </div>
                    )}

                    {isSelected && (
                      <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-blue-600/90 border border-blue-400/50 text-[10px] font-semibold text-white shadow-sm backdrop-blur-sm z-10">
                        Selecionado
                      </div>
                    )}
                  </div>

                  {/* Title & Path Info */}
                  <div className="p-2.5 flex flex-col justify-between flex-1">
                    <span
                      className="text-xs font-semibold text-zinc-200 line-clamp-1 group-hover:text-blue-400 transition-colors"
                      title={game.name}
                    >
                      {game.name}
                    </span>
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-zinc-500">
                      <span>AppID: {game.appId}</span>
                      <span className="text-blue-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        Configurar →
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Game Selection Card (Drag & Drop + Autonomous Scan) */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-zinc-100">
              {t('dlss5.gameSelectionTitle', 'Seleção Autônoma do Jogo')}
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              {t(
                'dlss5.gameSelectionDesc',
                'Selecione a pasta raiz do jogo ou o executável. O DarkHub Suite localiza automaticamente o executável real de 64 bits (ex: Binaries/Win64 no Unreal Engine) e prepara a injeção.'
              )}
            </p>
          </div>
        </div>

        {/* Drop zone / Buttons */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-6 text-center transition-all ${
            dragOver
              ? 'border-blue-500 bg-blue-500/10'
              : 'border-zinc-700/60 bg-zinc-950/40 hover:border-zinc-600'
          }`}
        >
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="p-3 bg-zinc-800 rounded-full text-blue-400">
              <FolderOpen size={28} />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-200">
                {targetPath ? (
                  <span className="font-mono text-blue-400 break-all">{targetPath}</span>
                ) : (
                  t('dlss5.dragDropHint', 'Arraste e solte a pasta ou executável do jogo aqui')
                )}
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Suporta Steam, Epic Games, Xbox Game Pass, GOG e qualquer instalação local.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
              <button
                onClick={handleSelectFolder}
                disabled={isScanning || isApplying}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 text-white"
              >
                <FolderOpen size={16} />
                {t('dlss5.selectFolder', 'Selecionar Pasta do Jogo')}
              </button>
              <button
                onClick={handleSelectExe}
                disabled={isScanning || isApplying}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 text-zinc-200"
              >
                <FileSearch size={16} />
                {t('dlss5.selectExe', 'Selecionar Executável (.exe)')}
              </button>
            </div>
          </div>
        </div>

        {/* Scanned Game Details Card */}
        {isScanning && (
          <div className="p-4 bg-zinc-950/60 border border-zinc-800 rounded-xl flex items-center justify-center gap-3 text-zinc-400 text-xs">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span>{t('dlss5.scanning', 'Analisando diretório do jogo...')}</span>
          </div>
        )}

        {scannedGame && !isScanning && (
          <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                  <Play size={16} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-zinc-100">{scannedGame.gameName || 'Jogo Detectado'}</h4>
                  <div className="text-xs text-zinc-400 flex items-center gap-2 flex-wrap">
                    <span>{t('dlss5.engine', 'Motor')}: <strong className="text-zinc-300 uppercase">{scannedGame.engine || 'custom'}</strong></span>
                    {scannedGame.graphicsApi?.bitness && (
                      <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-300 font-mono font-bold border border-zinc-700">
                        {scannedGame.graphicsApi.bitness}
                      </span>
                    )}
                    {scannedGame.exePath && (
                      <span>• {t('dlss5.executable', 'Executável')}: <code className="text-zinc-300 font-mono">{scannedGame.exePath.split(/[\\/]/).pop()}</code></span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {scannedGame.installed ? (
                  <span className="px-2.5 py-1 text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center gap-1.5">
                    <CheckCircle2 size={13} />
                    {t('dlss5.modActive', 'DLSS 5 / OptiScaler Ativo')}
                  </span>
                ) : (
                  <span className="px-2.5 py-1 text-xs font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700/60 rounded-full flex items-center gap-1.5">
                    <Info size={13} />
                    {t('dlss5.modInactive', 'Original (Sem Modificação)')}
                  </span>
                )}
                <button
                  onClick={() => handleOpenFolder(scannedGame.targetDir)}
                  className="px-2.5 py-1 text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700/70 rounded-lg flex items-center gap-1.5 transition-colors"
                  title="Abrir pasta no Explorer"
                >
                  <FolderOpen size={13} />
                  <span>Explorer</span>
                </button>
              </div>
            </div>

            {/* RTX Remix Safety Notice */}
            {scannedGame.graphicsApi?.isRemix && (
              <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-3 flex items-start gap-3 text-amber-200 text-xs">
                <AlertTriangle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-amber-300">{t('dlss5.remixWarningTitle', 'Runtime RTX Remix Detectado')}</div>
                  <div className="text-[11px] text-amber-300/80 mt-0.5">
                    {t('dlss5.remixWarningDesc', 'Identificado diretório .trex ou runtime RTX Remix. Injeção adaptada para rota dedicada Remix com proteção anti-crash e isolamento do ReShade.')}
                  </div>
                </div>
              </div>
            )}

            {/* Graphics API & Autopilot Route Card */}
            {scannedGame.graphicsApi && (
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-300">{t('dlss5.apiDetected', 'API Gráfica Identificada')}:</span>
                    <span className={`px-2.5 py-0.5 text-xs font-bold uppercase rounded-md border ${getApiBadgeClass(scannedGame.graphicsApi.primaryApi)}`}>
                      {scannedGame.graphicsApi.apiName}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Hook Recomendado: <strong className="text-blue-400 font-mono">{scannedGame.graphicsApi.recommendedLoader}</strong>
                  </div>
                </div>

                <div className="text-[11px] text-zinc-400 leading-relaxed bg-zinc-950/40 p-2.5 rounded-lg border border-zinc-800/60">
                  <p className="text-zinc-300">{scannedGame.graphicsApi.loaderReason}</p>
                  <p className="text-zinc-500 mt-1">{scannedGame.graphicsApi.compatibilityNote}</p>
                </div>

                {/* Autopilot Route Banner */}
                {scannedGame.routeInfo && (
                  <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-zinc-800/60">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-300">{t('dlss5.routeAutoRecommended', 'Rota Recomendada (Autopilot)')}:</span>
                      <span className="px-2 py-0.5 text-xs font-bold rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                        {scannedGame.routeInfo.routeBadge}
                      </span>
                    </div>
                    <span className="text-[11px] text-zinc-400">{scannedGame.routeInfo.routeDescription}</span>
                  </div>
                )}

                {scannedGame.graphicsApi.importedDlls && scannedGame.graphicsApi.importedDlls.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-zinc-500 pt-1">
                    <span>{t('dlss5.peImports', 'DLLs Importadas no Executável (PE)')}:</span>
                    {scannedGame.graphicsApi.importedDlls.map((dll, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded bg-zinc-950 font-mono text-zinc-400 border border-zinc-800">
                        {dll}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="bg-zinc-900/50 p-2.5 rounded-lg border border-zinc-800/60 space-y-1">
                <span className="text-zinc-500">{t('dlss5.injectionDir', 'Diretório de Injeção')}</span>
                <p className="font-mono text-zinc-300 break-all">{scannedGame.targetDir || targetPath}</p>
              </div>
              <div className="bg-zinc-900/50 p-2.5 rounded-lg border border-zinc-800/60 space-y-1">
                <span className="text-zinc-500">{t('dlss5.existingDlss', 'DLSS Nativo no Jogo')}</span>
                <p className="text-zinc-200 flex items-center gap-1.5">
                  {scannedGame.dlssDetected ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 size={13} /> {t('dlss5.existingDlssPresent', 'Presente (nvngx_dlss.dll detectado)')}
                    </span>
                  ) : (
                    <span className="text-zinc-400">
                      {t('dlss5.existingDlssNone', 'Não detectado (Injeção Universal)')}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Configuration & Options Card */}
      {scannedGame && (
        <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-5 space-y-5">
          <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-3">
            <Sliders size={18} className="text-blue-400" />
            <h3 className="text-sm font-semibold text-zinc-100">
              {t('dlss5.configTitle', 'Opções de Upscaling & Frame Generation')}
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Upscaler Backend */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">
                {t('dlss5.backendLabel', 'Upscaler Backend')}
              </label>
              <select
                value={upscaler}
                onChange={(e) => setUpscaler(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
              >
                <option value="dlss">{t('dlss5.backendDlss', 'DLSS 5 (NVIDIA Tensor Core)')}</option>
                <option value="fsr31">{t('dlss5.backendFsr31', 'AMD FSR 3.1 (Universal)')}</option>
                <option value="fsr4">{t('dlss5.backendFsr4', 'AMD FSR 4.0 Neural (FidelityFX)')}</option>
                <option value="xess">{t('dlss5.backendXess', 'Intel XeSS (DP4a / XMX)')}</option>
              </select>
            </div>

            {/* Hook Loader DLL */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-300">
                  {t('dlss5.loaderLabel', 'Método do Loader (Hook)')}
                </label>
                {scannedGame.graphicsApi?.recommendedLoader && (
                  <span className="text-[10px] text-blue-400 font-mono">
                    Auto: {scannedGame.graphicsApi.recommendedLoader}
                  </span>
                )}
              </div>
              <select
                value={loaderDll}
                onChange={(e) => setLoaderDll(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-blue-500 font-mono"
              >
                <option value="dxgi.dll">dxgi.dll (Padrão DX11 / DX12)</option>
                <option value="version.dll">version.dll (Recomendado para Vulkan & OpenGL)</option>
                <option value="winmm.dll">winmm.dll (Vulkan & Xbox Game Pass)</option>
                <option value="d3d12.dll">d3d12.dll (DX12 Exclusivo)</option>
              </select>
            </div>

            {/* Injection Route (DLSS5-Autopilot Multi-Route Engine) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-300">
                  {t('dlss5.routeLabel', 'Rota de Injeção / Pipeline')}
                </label>
                {scannedGame.routeInfo?.recommendedRoute && (
                  <span className="text-[10px] text-indigo-400 font-mono">
                    Autopilot: {scannedGame.routeInfo.routeBadge}
                  </span>
                )}
              </div>
              <select
                value={selectedRoute}
                onChange={(e) => setSelectedRoute(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 font-mono"
              >
                {scannedGame.routeInfo?.allowedRoutes?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} {r.id === scannedGame.routeInfo?.recommendedRoute ? '★ (Autopilot)' : ''}
                  </option>
                )) || (
                  <>
                    <option value="optiscaler">OptiScaler D3D12 (Nativo)</option>
                    <option value="dlss5-bridge">DLSS5-Bridge (D3D11 / Vulkan)</option>
                    <option value="feeder">DLSS5-Feeder (ReShade / Universal)</option>
                    <option value="remix">RTX Remix Route</option>
                  </>
                )}
              </select>
            </div>

            {/* Frame Generation Toggle */}
            <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/80 flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-zinc-200">
                  {t('dlss5.frameGen', 'Frame Generation Neural')}
                </div>
                <div className="text-[10px] text-zinc-500">2x FPS via IA (dlssg / fsr3)</div>
              </div>
              <input
                type="checkbox"
                checked={frameGen}
                onChange={(e) => setFrameGen(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 bg-zinc-900 border-zinc-700 focus:ring-0 cursor-pointer"
              />
            </div>

            {/* In-Game Overlay Toggle */}
            <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/80 flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-zinc-200">
                  {t('dlss5.overlayMenu', 'Menu In-Game (Insert)')}
                </div>
                <div className="text-[10px] text-zinc-500">Ajustes em tempo real</div>
              </div>
              <input
                type="checkbox"
                checked={overlayMenu}
                onChange={(e) => setOverlayMenu(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 bg-zinc-900 border-zinc-700 focus:ring-0 cursor-pointer"
              />
            </div>

            {/* Neural Upstream Routing Toggle (DLSS5-Autopilot) */}
            <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/80 flex items-center justify-between">
              <div className="pr-2">
                <div className="text-xs font-medium text-zinc-200 flex items-center gap-1.5">
                  <span>{t('dlss5.neuralUpstream', 'Neural Upstream Routing')}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">4K FPS+</span>
                </div>
                <div className="text-[10px] text-zinc-500">Reconstrução pré-upscale na resolução nativa interna</div>
              </div>
              <input
                type="checkbox"
                checked={neuralUpstream}
                onChange={(e) => setNeuralUpstream(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 bg-zinc-900 border-zinc-700 focus:ring-0 cursor-pointer"
              />
            </div>
          </div>

          {/* Autopilot & Neural Upstream Architecture Note */}
          <div className="p-3 bg-zinc-950/40 rounded-lg border border-zinc-800/80 flex items-start gap-2.5 text-xs text-zinc-400">
            <Zap size={16} className="text-indigo-400 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="text-zinc-200">Arquitetura DLSS5-Autopilot & Neural Upstream: </strong>
              <span>{t('dlss5.neuralUpstreamDesc', 'Processa modelos neurais e iluminação na resolução interna de renderização antes do upscaling. Aumento drástico de FPS a 1440p e 4K.')}</span>
            </div>
          </div>

          {/* Signature Bypass Setting */}
          <div className="p-3 bg-zinc-950/40 rounded-lg border border-zinc-800/80 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-medium text-zinc-200">
                {t('dlss5.signatureBypass', 'Bypass de Assinatura NVIDIA (Registro)')}
              </span>
              <p className="text-[11px] text-zinc-400">
                {t(
                  'dlss5.signatureBypassDesc',
                  'Desativa checagem de assinatura de drivers no registro do Windows para evitar erros de autenticação da DLL.'
                )}
              </p>
            </div>
            <input
              type="checkbox"
              checked={signatureBypass}
              onChange={(e) => setSignatureBypass(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 bg-zinc-900 border-zinc-700 focus:ring-0 cursor-pointer"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-3">
              <button
                onClick={handleApply}
                disabled={isApplying || isReverting || isScanning}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-xs font-bold rounded-lg transition-all shadow-md hover:shadow-blue-500/20 flex items-center gap-2 text-white"
              >
                {isApplying ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {t('dlss5.applyingBtn', 'Injetando e Configurando...')}
                  </>
                ) : (
                  <>
                    <Zap size={16} />
                    {t('dlss5.applyBtn', 'Aplicar DLSS 5 Autonomamente')}
                  </>
                )}
              </button>

              {(scannedGame.installed || scannedGame.existingDlls?.length) && (
                <button
                  onClick={handleRevert}
                  disabled={isApplying || isReverting || isScanning}
                  className="px-4 py-2.5 bg-zinc-800 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/40 border border-zinc-700 disabled:opacity-50 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 text-zinc-300"
                >
                  {isReverting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                      {t('dlss5.revertingBtn', 'Restaurando...')}
                    </>
                  ) : (
                    <>
                      <RotateCcw size={15} />
                      {t('dlss5.revertBtn', 'Desinstalar Mod / Restaurar Arquivos Originais')}
                    </>
                  )}
                </button>
              )}
            </div>

            {status && (
              <div
                className={`text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1.5 ${
                  status.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    : 'bg-red-500/10 text-red-300 border-red-500/30'
                }`}
              >
                {status.type === 'success' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                <span>{status.message}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Terminal & Live Injection Logs */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-300">
            <Terminal size={16} className="text-blue-400" />
            <h4 className="text-xs font-semibold">
              {t('dlss5.terminalTitle', 'Console de Injeção & Logs')}
            </h4>
          </div>
          {logs.length > 0 && (
            <button
              onClick={() => setLogs([])}
              className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {t('dlss5.clearLogs', 'Limpar Console')}
            </button>
          )}
        </div>

        <div className="bg-zinc-950 border border-zinc-800/80 rounded-lg p-3 font-mono text-xs text-zinc-300 h-40 overflow-y-auto space-y-1 select-text">
          {logs.length === 0 ? (
            <span className="text-zinc-600 italic">
              Aguardando seleção de jogo para iniciar diagnósticos e injeção autônoma...
            </span>
          ) : (
            logs.map((log, i) => (
              <div
                key={i}
                className={
                  log.includes('[SUCCESS]') || log.includes('[SUCESSO]') || log.includes('sucesso')
                    ? 'text-emerald-400'
                    : log.includes('[ERROR]') || log.includes('Falha')
                    ? 'text-red-400'
                    : log.includes('[AUTÊNTICO]') || log.includes('[PE SCAN]') || log.includes('[API DETECTADA]')
                    ? 'text-cyan-400'
                    : log.includes('[WARN]') || log.includes('[REVERSÃO]')
                    ? 'text-amber-400'
                    : 'text-zinc-300'
                }
              >
                {log}
              </div>
            ))
          )}
          <div ref={terminalEndRef} />
        </div>
      </div>

      {/* Recent Games Quick-Access */}
      {recentGames.length > 0 && (
        <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-zinc-300">
            <History size={16} className="text-blue-400" />
            <h4 className="text-xs font-semibold">
              {t('dlss5.recentTitle', 'Jogos Configurados Recentemente')}
            </h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentGames.map((game, idx) => (
              <div
                key={idx}
                onClick={() => handleScanGame(game.targetDir)}
                className="bg-zinc-950/60 hover:bg-zinc-900 border border-zinc-800/70 hover:border-blue-500/50 p-3 rounded-lg transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-200 group-hover:text-blue-400 truncate">
                    {game.gameName}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {game.graphicsApi?.apiBadge && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 uppercase font-mono border border-blue-500/30">
                        {game.graphicsApi.apiBadge}
                      </span>
                    )}
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 uppercase font-mono">
                      {game.profile}
                    </span>
                  </div>
                </div>
                <div className="text-[11px] text-zinc-500 truncate font-mono mt-1">
                  {game.targetDir}
                </div>
                {game.lastAppliedAt && (
                  <div className="text-[10px] text-zinc-600 mt-2">
                    Configurado em: {new Date(game.lastAppliedAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
