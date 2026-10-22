import React, { useEffect, useState, useRef } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { DarkOSConfirmDialog } from '../components/darkos/DarkOSConfirmDialog';
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
  Gamepad2,
  X,
  Loader2,
  ChevronRight
} from '../components/icons';
import PageHeader from '../components/ui/PageHeader';

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
  const [signatureBypass, setSignatureBypass] = useState<boolean>(false);
  const [selectedRoute, setSelectedRoute] = useState<string>('optiscaler');
  const [neuralUpstream, setNeuralUpstream] = useState<boolean>(true);
  const [amdEngine, setAmdEngine] = useState<'neural' | 'zluda' | 'fsr'>('fsr');
  const [neuralPasses, setNeuralPasses] = useState<1 | 2 | 3>(3);
  const [zludaCache, setZludaCache] = useState<boolean>(true);

  // Action / State
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [isReverting, setIsReverting] = useState<boolean>(false);
  const [confirmApplyOpen, setConfirmApplyOpen] = useState<boolean>(false);
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

  // Auto-scroll only the log console itself (scrollIntoView would drag the whole page down to it on every line).
  useEffect(() => {
    const box = terminalEndRef.current?.parentElement;
    if (box && logs.length) box.scrollTop = box.scrollHeight;
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
    const firstPath = window.darkhub?.dialog?.pathsForDroppedFiles?.(e.dataTransfer.files)?.[0];
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
        zludaCache: selectedProfile === 'amd' && amdEngine === 'zluda' ? zludaCache : undefined,
        neuralPasses: selectedProfile === 'amd' && amdEngine === 'neural' ? neuralPasses : undefined,
        upscaler,
        route: selectedRoute,
        neuralUpstream,
        enableFrameGen: frameGen,
        enableOverlay: overlayMenu,
        loader: loaderDll,
        signatureBypass: selectedProfile === 'nvidia' ? signatureBypass : false
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

  const profileOptions: Array<{ id: 'nvidia' | 'amd' | 'intel'; label: string }> = [
    { id: 'nvidia', label: t('dlss5.profileNvidia', 'NVIDIA (Nativo / Estável)') },
    { id: 'amd', label: t('dlss5.profileAmd', 'AMD Radeon (Experimental / FSR)') },
    { id: 'intel', label: t('dlss5.profileIntel', 'Intel Arc') }
  ];

  const amdEngines: Array<{ id: 'neural' | 'zluda' | 'fsr'; title: string; tag: string; desc: string; traits?: string[]; wide?: boolean }> = [
    {
      id: 'neural',
      title: t('dlss5.amdEngineNeural', 'AMD Neural (AMD-NR / OptiScaler)'),
      tag: 'dx12',
      desc: t('dlss5.amdEngineNeuralDesc', 'Reconstrução neural DLSS-NR rodando em GPUs AMD via OptiScaler. Exige jogo DirectX 12, driver AMD atual e ~2 GB de VRAM livre. Ajuste fino no jogo: tecla INSERT, aba Neural.'),
      wide: true
    },
    {
      id: 'zluda',
      title: t('dlss5.amdEngineZluda', 'ZLUDA HIP Neural Engine (RDNA 3 / 4 WMMA)'),
      tag: 'rx 7000 / 8000',
      desc: t('dlss5.amdEngineZludaDesc', 'Tradução de redes neurais CUDA para ROCm/HIP com aceleração por matrizes WMMA FP16/FP8 (RX 7000 / 8000).'),
      traits: ['Aceleração WMMA FP16/FP8', 'Cache AOT Anti-Stutter']
    },
    {
      id: 'fsr',
      title: t('dlss5.amdEngineFsr', 'FSR 3.1 / FidelityFX Fallback (RDNA 1 / 2)'),
      tag: 'rx 5000 / 6000',
      desc: t('dlss5.amdEngineFsrDesc', 'Modo de alta compatibilidade DirectCompute para placas AMD sem núcleos WMMA físicos (RX 5000, RX 6000, Vega, Polaris).'),
      traits: ['Tradução DirectCompute', 'FSR 3.1 Frame Gen']
    }
  ];

  const busyAny = isApplying || isReverting || isScanning;

  const toggleRow = (opts: { title: React.ReactNode; desc: React.ReactNode; tag?: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <label className="flex items-start justify-between gap-3 py-3 cursor-pointer">
      <span className="min-w-0">
        <span className="flex flex-wrap items-baseline gap-x-2 text-[12.5px] font-medium text-zinc-200">
          {opts.title}
          {opts.tag && <span className="dh-tag">{opts.tag}</span>}
        </span>
        <span className="block mt-0.5 text-[11.5px] text-zinc-500">{opts.desc}</span>
      </span>
      <input
        type="checkbox"
        checked={opts.checked}
        onChange={(e) => opts.onChange(e.target.checked)}
        className="mt-0.5 shrink-0"
      />
    </label>
  );

  return (
    <div className="w-full text-zinc-100">
      <PageHeader
        title={t('dlss5.title', 'DLSS 5 & Universal Neural Upscaler Manager')}
        subtitle={<>
          {t(
            'dlss5.subtitle',
            'Injeção e configuração autônoma de upscaling neural por IA (DLSS 5, FSR 3.1/4.0 e XeSS) com Frame Generation universal para NVIDIA e AMD.'
          )}
          <span className="dh-tag ml-2">experimental</span>
        </>}
      />

      <div className="space-y-5">
      {/* Experimental notice */}
      <p className="flex items-start gap-2.5 text-[12px] leading-relaxed text-zinc-400 max-w-[90ch]">
        <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-[2px]" />
        <span>
          <span className="font-medium text-amber-200">Módulo Experimental / Pesquisa de IA. </span>
          O DLSS 5 & Universal Neural Upscaler é uma tecnologia em estágio experimental para interoperabilidade de modelos neurais e frame generation entre NVIDIA, AMD e Intel. O DarkHub realiza backup preventivo dos arquivos modificados, permitindo reversão a qualquer momento.
        </span>
      </p>

      {/* GPU + profile */}
      <section className="dh-card grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] divide-y lg:divide-y-0 lg:divide-x divide-zinc-800/80">
        <dl className="p-4 min-w-0">
          <dt className="text-[11.5px] text-zinc-500">{t('dlss5.gpuCardTitle', 'Hardware Gráfico')}</dt>
          <dd className="mt-1 text-[13px] font-medium text-zinc-100 truncate" title={gpu.model}>{gpu.model}</dd>
          <dd className="mt-0.5 text-[11.5px] text-zinc-500 flex flex-wrap items-center gap-x-3">
            <span>{t('dlss5.gpuVendor', 'Fabricante')}: <span className="font-mono text-zinc-300">{gpu.vendor}</span></span>
            {gpu.driverVersion && (
              <span>Driver: <span className="font-mono text-zinc-300">{gpu.driverVersion}</span></span>
            )}
          </dd>
        </dl>
        <div className="p-4 flex flex-col gap-2.5">
          <div>
            <div className="text-[11.5px] text-zinc-500">{t('dlss5.gpuProfile', 'Perfil de Otimização')}</div>
            <div className="text-[11.5px] text-zinc-600 mt-0.5">Ajusta automaticamente hooks de memória, spoofing de vendor e Frame Generation.</div>
          </div>
          <div role="radiogroup" aria-label={t('dlss5.gpuProfile', 'Perfil de Otimização')} className="inline-flex self-start rounded-md border border-zinc-800 overflow-hidden divide-x divide-zinc-800">
            {profileOptions.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={selectedProfile === p.id}
                onClick={() => handleProfileChange(p.id)}
                className={`h-8 px-3 text-[12px] font-medium transition-colors duration-150 ${
                  selectedProfile === p.id ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* AMD engine panel */}
      {selectedProfile === 'amd' && (
        <section className="dh-card p-5 space-y-4 animate-in">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-[3px]" />
            <div className="min-w-0">
              <h2 className="dh-section-title">
                {t('dlss5.amdWarningTitle', 'Aviso de Instabilidade - Placas AMD')}
                <span className="dh-tag ml-2 font-normal">dual-tier amd</span>
              </h2>
              <p className="dh-help mt-0.5 max-w-[90ch]">
                {t(
                  'dlss5.amdWarningDesc',
                  'GPUs AMD não contam com Tensor Cores físicos para execução de modelos proprietários da NVIDIA. O DarkHub utiliza a ponte OptiScaler com tradução DirectCompute e FSR 3.1/4.0 Frame Generation. Em alguns jogos podem ocorrer cintilação (flicker) no HUD ou artefatos visuais menores.'
                )}
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-800/80">
            <h3 className="text-[12.5px] font-medium text-zinc-200">{t('dlss5.amdEngineLabel', 'Motor de Execução AMD')}</h3>
            <p className="dh-help">{t('dlss5.amdEngineHelp', 'Escolha entre AMD Neural (AMD-NR), ZLUDA (RDNA 3/4) ou o modo de compatibilidade FSR (RDNA 1/2).')}</p>

            <div role="radiogroup" aria-label={t('dlss5.amdEngineLabel', 'Motor de Execução AMD')} className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              {amdEngines.map((eng) => {
                const active = amdEngine === eng.id;
                return (
                  <div
                    key={eng.id}
                    role="radio"
                    aria-checked={active}
                    tabIndex={0}
                    onClick={() => setAmdEngine(eng.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAmdEngine(eng.id); } }}
                    className={`rounded-lg border p-3.5 cursor-pointer outline-none focus-visible:border-blue-400 transition-colors duration-150 ${eng.wide ? 'md:col-span-2' : ''} ${
                      active ? 'border-blue-300/70 bg-blue-500/[0.05]' : 'border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex items-center gap-2 text-[12.5px] font-medium text-zinc-100">
                        <span className={`w-3.5 h-3.5 rounded-full border shrink-0 flex items-center justify-center ${active ? 'border-blue-300' : 'border-zinc-600'}`}>
                          {active && <span className="w-1.5 h-1.5 rounded-full bg-blue-300" />}
                        </span>
                        {eng.title}
                      </span>
                      <span className="dh-tag shrink-0">{eng.tag}</span>
                    </div>
                    <p className="mt-1.5 pl-[22px] text-[11.5px] leading-relaxed text-zinc-400">{eng.desc}</p>
                    {eng.traits && (
                      <p className="mt-2 pl-[22px] text-[11px] text-zinc-500">{eng.traits.join(' · ')}</p>
                    )}
                    {eng.id === 'neural' && active && (
                      <div className="mt-3 ml-[22px] pt-3 border-t border-zinc-800/80 space-y-2" onClick={(e) => e.stopPropagation()}>
                        <label className="flex items-center justify-between gap-3 text-[12px] text-zinc-300">
                          <span>{t('dlss5.neuralPasses', 'Passes neurais implantados')}</span>
                          <select
                            value={neuralPasses}
                            onChange={(e) => setNeuralPasses(Number(e.target.value) as 1 | 2 | 3)}
                            className="dh-input h-7 font-mono w-20"
                          >
                            <option value={1}>1</option>
                            <option value={2}>2</option>
                            <option value={3}>3</option>
                          </select>
                        </label>
                        <p className="text-[11px] text-zinc-500">
                          {t('dlss5.amdNrPackageHint', 'O pacote AMD-NR (github.com/3zwr1/AMD-NR---OptiScaler) deve ser extraído em %APPDATA%/DarkHub Suite/OptiScaler/AMD_NR antes de aplicar.')}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {amdEngine === 'zluda' && (
              <div className="mt-3 divide-y divide-zinc-800/80 border-y border-zinc-800/80 animate-in">
                {toggleRow({
                  title: t('dlss5.zludaCache', 'Cache de Tradução AOT (Anti-Stutter)'),
                  tag: 'RedDukeDev',
                  desc: t('dlss5.zludaCacheDesc', 'Precompila módulos neurais do container DLSS para eliminar micro-travamentos (stutter) em tempo de execução.'),
                  checked: zludaCache,
                  onChange: setZludaCache
                })}
                <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-medium text-zinc-200">{t('dlss5.amdHipSdkTitle', 'Aceleração de IA AMD ROCm / HIP SDK')}</div>
                    <div className="text-[11.5px] text-zinc-500">{t('dlss5.amdHipSdkDesc', 'Para máxima eficiência neural em placas RX 7000 e 8000, o runtime AMD HIP SDK fornece bibliotecas otimizadas de execução de tensores para Windows.')}</div>
                  </div>
                  <a
                    href="https://www.amd.com/en/developer/resources/rocm-hub/hip-sdk.html"
                    target="_blank"
                    rel="noreferrer"
                    className="dh-btn dh-btn-sm shrink-0 self-start sm:self-auto"
                  >
                    <ExternalLink size={13} />
                    <span>{t('dlss5.amdHipSdkLink', 'Baixar AMD HIP SDK Oficial')}</span>
                  </a>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Steam library */}
      <section className="space-y-3" aria-labelledby="dlss5-steam">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h2 id="dlss5-steam" className="dh-section-title">
              {t('dlss5.steamLibrary', 'Jogos Instalados na Steam')}
              {steamGames.length > 0 && <span className="ml-2 font-mono text-[11.5px] font-normal text-zinc-500">{steamGames.length}</span>}
            </h2>
            <p className="dh-help mt-0.5">
              {t('dlss5.selectFromSteam', 'Selecione um jogo instalado para escanear e injetar o DLSS 5 com 1 clique.')}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                value={steamSearchQuery}
                onChange={(e) => setSteamSearchQuery(e.target.value)}
                placeholder={t('dlss5.filterGames', 'Buscar jogos instalados...')}
                aria-label={t('dlss5.filterGames', 'Buscar jogos instalados...')}
                className="dh-input pl-8 pr-7 w-52"
              />
              {steamSearchQuery && (
                <button
                  type="button"
                  onClick={() => setSteamSearchQuery('')}
                  aria-label="Limpar"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={refreshSteamGames}
              disabled={isLoadingSteam}
              title={t('dlss5.refreshSteam', 'Atualizar Lista')}
              aria-label={t('dlss5.refreshSteam', 'Atualizar Lista')}
              className="dh-btn px-2.5"
            >
              <RotateCcw size={14} className={isLoadingSteam ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {isLoadingSteam ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3" aria-busy="true" aria-label={t('dlss5.scanning', 'Analisando biblioteca da Steam...')}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-zinc-800/80 overflow-hidden">
                <div className="h-24 bg-zinc-900 animate-pulse" />
                <div className="p-2.5 space-y-1.5">
                  <div className="h-3 w-3/4 rounded bg-zinc-900 animate-pulse" />
                  <div className="h-2.5 w-1/3 rounded bg-zinc-900 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : steamGames.length === 0 ? (
          <div className="py-8 rounded-xl border border-dashed border-zinc-800 flex flex-col items-center gap-3 text-center">
            <p className="text-[12.5px] text-zinc-400">
              {t('dlss5.noSteamGames', 'Nenhum jogo da Steam detectado.')}{' '}
              <span className="text-zinc-500">Você pode arrastar ou selecionar manualmente a pasta do jogo na seção abaixo.</span>
            </p>
            <button type="button" onClick={handleSelectFolder} disabled={busyAny} className="dh-btn dh-btn-sm">
              <FolderOpen size={13} />
              {t('dlss5.selectFolder', 'Selecionar Pasta do Jogo')}
            </button>
          </div>
        ) : filteredSteamGames.length === 0 ? (
          <div className="py-8 rounded-xl border border-dashed border-zinc-800 flex flex-col items-center gap-3 text-center">
            <p className="text-[12.5px] text-zinc-400">
              Nenhum jogo encontrado com <span className="font-mono text-zinc-200">"{steamSearchQuery}"</span>.
            </p>
            <button type="button" onClick={() => setSteamSearchQuery('')} className="dh-btn dh-btn-sm">
              {t('library.search.clear', 'Limpar busca')}
            </button>
          </div>
        ) : (
          <div role="listbox" aria-label={t('dlss5.steamLibrary', 'Jogos Instalados na Steam')} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-[320px] overflow-y-auto pr-1">
            {filteredSteamGames.map((game) => {
              const isSelected =
                (targetPath && targetPath.toLowerCase() === game.installDir.toLowerCase()) ||
                (scannedGame?.targetDir &&
                  scannedGame.targetDir.toLowerCase().startsWith(game.installDir.toLowerCase()));

              return (
                <div
                  key={game.appId}
                  role="option"
                  aria-selected={Boolean(isSelected)}
                  tabIndex={0}
                  onClick={() => handleScanGame(game.installDir)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleScanGame(game.installDir); } }}
                  className={`group relative flex flex-col rounded-lg overflow-hidden border cursor-pointer outline-none focus-visible:border-blue-400 transition-colors duration-150 ${
                    isSelected ? 'border-blue-300 bg-zinc-900' : 'border-zinc-800/80 hover:border-zinc-600'
                  }`}
                >
                  <div className="relative w-full h-24 bg-zinc-900 overflow-hidden">
                    <div className="absolute inset-0 flex items-center justify-center text-zinc-700">
                      <Gamepad2 size={20} />
                    </div>
                    <img
                      src={game.headerUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="relative w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                    {isSelected && (
                      <span className="absolute top-1.5 left-1.5 h-5 w-5 rounded-md bg-zinc-100 text-zinc-950 flex items-center justify-center" aria-hidden="true">
                        <CheckCircle2 size={12} />
                      </span>
                    )}
                  </div>

                  <div className="px-2.5 py-2 min-w-0">
                    <span className="block text-[12px] font-medium text-zinc-200 truncate" title={game.name}>
                      {game.name}
                    </span>
                    <div className="mt-0.5 flex items-center justify-between gap-2 font-mono text-[10.5px]">
                      <span className="text-zinc-500">{game.appId}</span>
                      {game.isApplied ? (
                        <span className="inline-flex items-center gap-1 text-emerald-300 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          {t('dlss5.dlss5Active', 'DLSS 5 Ativo')}
                        </span>
                      ) : (
                        <span className="text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 inline-flex items-center gap-0.5">
                          Configurar <ChevronRight size={11} />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Game selection / scan */}
      <section className="dh-card p-5 space-y-4">
        <div>
          <h2 className="dh-section-title">{t('dlss5.gameSelectionTitle', 'Seleção Autônoma do Jogo')}</h2>
          <p className="dh-help mt-0.5 max-w-[90ch]">
            {t(
              'dlss5.gameSelectionDesc',
              'Selecione a pasta raiz do jogo ou o executável. O DarkHub Suite localiza automaticamente o executável real de 64 bits (ex: Binaries/Win64 no Unreal Engine) e prepara a injeção.'
            )}
          </p>
        </div>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`rounded-lg border border-dashed px-6 py-6 flex flex-col items-center text-center gap-3 transition-colors duration-150 ${
            dragOver ? 'border-blue-300 bg-blue-500/[0.06]' : 'border-zinc-700 hover:border-zinc-600'
          }`}
        >
          <FolderOpen size={20} className={dragOver ? 'text-blue-300' : 'text-zinc-500'} />
          <div>
            <p className="text-[12.5px] font-medium text-zinc-200">
              {targetPath ? (
                <span className="font-mono text-zinc-100 break-all">{targetPath}</span>
              ) : (
                t('dlss5.dragDropHint', 'Arraste e solte a pasta ou executável do jogo aqui')
              )}
            </p>
            <p className="dh-help mt-1">Suporta Steam, Epic Games, Xbox Game Pass, GOG e qualquer instalação local.</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={handleSelectFolder} disabled={isScanning || isApplying} className="dh-btn">
              <FolderOpen size={14} />
              {t('dlss5.selectFolder', 'Selecionar Pasta do Jogo')}
            </button>
            <button type="button" onClick={handleSelectExe} disabled={isScanning || isApplying} className="dh-btn">
              <FileSearch size={14} />
              {t('dlss5.selectExe', 'Selecionar Executável (.exe)')}
            </button>
          </div>
        </div>

        {isScanning && (
          <div className="rounded-lg border border-zinc-800/80 p-4 space-y-3" aria-busy="true" aria-label={t('dlss5.scanning', 'Analisando diretório do jogo...')}>
            <div className="h-3.5 w-48 rounded bg-zinc-900 animate-pulse" />
            <div className="h-2.5 w-72 rounded bg-zinc-900 animate-pulse" />
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="h-10 rounded-md bg-zinc-900 animate-pulse" />
              <div className="h-10 rounded-md bg-zinc-900 animate-pulse" />
            </div>
          </div>
        )}

        {scannedGame && !isScanning && (
          <div className="rounded-lg border border-zinc-800/80 animate-in">
            <div className="flex items-start justify-between flex-wrap gap-3 px-4 py-3 border-b border-zinc-800/80">
              <div className="min-w-0">
                <h3 className="text-[14px] font-semibold text-zinc-50">{scannedGame.gameName || 'Jogo Detectado'}</h3>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-zinc-500">
                  <span>{t('dlss5.engine', 'Motor')}: <span className="font-mono text-zinc-300">{scannedGame.engine || 'custom'}</span></span>
                  {scannedGame.graphicsApi?.bitness && <span className="font-mono text-zinc-300">{scannedGame.graphicsApi.bitness}</span>}
                  {scannedGame.exePath && (
                    <span>{t('dlss5.executable', 'Executável')}: <code className="font-mono text-zinc-300">{scannedGame.exePath.split(/[\\/]/).pop()}</code></span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {scannedGame.installed ? (
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-emerald-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {t('dlss5.modActive', 'DLSS 5 / OptiScaler Ativo')}
                  </span>
                ) : (
                  <span className="text-[12px] text-zinc-500">{t('dlss5.modInactive', 'Original (Sem Modificação)')}</span>
                )}
                <button
                  type="button"
                  onClick={() => handleOpenFolder(scannedGame.targetDir)}
                  className="dh-btn dh-btn-sm"
                  title="Abrir pasta no Explorer"
                >
                  <FolderOpen size={13} />
                  <span>Explorer</span>
                </button>
              </div>
            </div>

            <div className="px-4 py-3 space-y-3">
              {scannedGame.graphicsApi?.isRemix && (
                <p className="flex items-start gap-2 text-[12px] text-zinc-300">
                  <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-[1px]" />
                  <span>
                    <span className="font-medium text-amber-200">{t('dlss5.remixWarningTitle', 'Runtime RTX Remix Detectado')}. </span>
                    <span className="text-zinc-400">{t('dlss5.remixWarningDesc', 'Identificado diretório .trex ou runtime RTX Remix. Injeção adaptada para rota dedicada Remix com proteção anti-crash e isolamento do ReShade.')}</span>
                  </span>
                </p>
              )}

              {scannedGame.graphicsApi && (
                <div className="space-y-2">
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
                    <div className="flex items-baseline justify-between gap-3 sm:block">
                      <dt className="text-[11.5px] text-zinc-500">{t('dlss5.apiDetected', 'API Gráfica Identificada')}</dt>
                      <dd className="font-mono text-zinc-100">{scannedGame.graphicsApi.apiName}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 sm:block">
                      <dt className="text-[11.5px] text-zinc-500">Hook Recomendado</dt>
                      <dd className="font-mono text-zinc-100">{scannedGame.graphicsApi.recommendedLoader}</dd>
                    </div>
                    {scannedGame.routeInfo && (
                      <div className="sm:col-span-2">
                        <dt className="text-[11.5px] text-zinc-500">{t('dlss5.routeAutoRecommended', 'Rota Recomendada (Autopilot)')}</dt>
                        <dd className="text-zinc-300"><span className="font-mono text-zinc-100">{scannedGame.routeInfo.routeBadge}</span> <span className="text-zinc-500">{scannedGame.routeInfo.routeDescription}</span></dd>
                      </div>
                    )}
                  </dl>
                  <div className="text-[11.5px] leading-relaxed">
                    <p className="text-zinc-300">{scannedGame.graphicsApi.loaderReason}</p>
                    <p className="text-zinc-500 mt-0.5">{scannedGame.graphicsApi.compatibilityNote}</p>
                  </div>
                  {scannedGame.graphicsApi.importedDlls && scannedGame.graphicsApi.importedDlls.length > 0 && (
                    <p className="text-[11px] text-zinc-500">
                      {t('dlss5.peImports', 'DLLs Importadas no Executável (PE)')}:{' '}
                      <span className="font-mono text-zinc-400">{scannedGame.graphicsApi.importedDlls.join('  ')}</span>
                    </p>
                  )}
                </div>
              )}

              <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 pt-3 border-t border-zinc-800/80 text-[12px]">
                <div className="min-w-0">
                  <dt className="text-[11.5px] text-zinc-500">{t('dlss5.injectionDir', 'Diretório de Injeção')}</dt>
                  <dd className="font-mono text-zinc-300 break-all">{scannedGame.targetDir || targetPath}</dd>
                </div>
                <div>
                  <dt className="text-[11.5px] text-zinc-500">{t('dlss5.existingDlss', 'DLSS Nativo no Jogo')}</dt>
                  <dd>
                    {scannedGame.dlssDetected ? (
                      <span className="text-emerald-300">{t('dlss5.existingDlssPresent', 'Presente (nvngx_dlss.dll detectado)')}</span>
                    ) : (
                      <span className="text-zinc-400">{t('dlss5.existingDlssNone', 'Não detectado (Injeção Universal)')}</span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        )}
      </section>

      {/* Configuration */}
      {scannedGame && (
        <section className="dh-card p-5 space-y-5 animate-in">
          <h2 className="dh-section-title">{t('dlss5.configTitle', 'Opções de Upscaling & Frame Generation')}</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="dlss5-backend" className="dh-label block mb-1.5">{t('dlss5.backendLabel', 'Upscaler Backend')}</label>
              <select id="dlss5-backend" value={upscaler} onChange={(e) => setUpscaler(e.target.value)} className="dh-input w-full">
                <option value="dlss">{t('dlss5.backendDlss', 'DLSS 5 (NVIDIA Tensor Core)')}</option>
                <option value="fsr31">{t('dlss5.backendFsr31', 'AMD FSR 3.1 (Universal)')}</option>
                <option value="fsr4">{t('dlss5.backendFsr4', 'AMD FSR 4.0 Neural (FidelityFX)')}</option>
                <option value="xess">{t('dlss5.backendXess', 'Intel XeSS (DP4a / XMX)')}</option>
              </select>
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <label htmlFor="dlss5-loader" className="dh-label">{t('dlss5.loaderLabel', 'Método do Loader (Hook)')}</label>
                {scannedGame.graphicsApi?.recommendedLoader && (
                  <span className="dh-tag">auto: {scannedGame.graphicsApi.recommendedLoader}</span>
                )}
              </div>
              <select id="dlss5-loader" value={loaderDll} onChange={(e) => setLoaderDll(e.target.value)} className="dh-input w-full font-mono">
                <option value="dxgi.dll">dxgi.dll (Padrão DX11 / DX12)</option>
                <option value="version.dll">version.dll (Recomendado para Vulkan & OpenGL)</option>
                <option value="winmm.dll">winmm.dll (Vulkan & Xbox Game Pass)</option>
                <option value="d3d12.dll">d3d12.dll (DX12 Exclusivo)</option>
              </select>
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <label htmlFor="dlss5-route" className="dh-label">{t('dlss5.routeLabel', 'Rota de Injeção / Pipeline')}</label>
                {scannedGame.routeInfo?.recommendedRoute && (
                  <span className="dh-tag">autopilot: {scannedGame.routeInfo.routeBadge}</span>
                )}
              </div>
              <select id="dlss5-route" value={selectedRoute} onChange={(e) => setSelectedRoute(e.target.value)} className="dh-input w-full font-mono">
                {scannedGame.routeInfo?.allowedRoutes?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} {r.id === scannedGame.routeInfo?.recommendedRoute ? '(Autopilot)' : ''}
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
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 border-y border-zinc-800/80 md:divide-x divide-zinc-800/80">
            <div className="md:pr-0">
              {toggleRow({
                title: t('dlss5.frameGen', 'Frame Generation Neural'),
                desc: '2x FPS via IA (dlssg / fsr3)',
                checked: frameGen,
                onChange: setFrameGen
              })}
            </div>
            <div className="md:pl-6">
              {toggleRow({
                title: t('dlss5.overlayMenu', 'Menu In-Game (Insert)'),
                desc: 'Ajustes em tempo real',
                checked: overlayMenu,
                onChange: setOverlayMenu
              })}
            </div>
            <div className="md:pl-6">
              {toggleRow({
                title: t('dlss5.neuralUpstream', 'Neural Upstream Routing'),
                desc: 'Reconstrução pré-upscale na resolução nativa interna',
                checked: neuralUpstream,
                onChange: setNeuralUpstream
              })}
            </div>
          </div>

          <p className="dh-help max-w-[90ch]">
            <span className="text-zinc-300">Arquitetura DLSS5-Autopilot & Neural Upstream: </span>
            {t('dlss5.neuralUpstreamDesc', 'Processa modelos neurais e iluminação na resolução interna de renderização antes do upscaling. Aumento drástico de FPS a 1440p e 4K.')}
          </p>

          {selectedProfile === 'nvidia' && (
            <div className="border-t border-zinc-800/80">
              {toggleRow({
                title: t('dlss5.signatureBypass', 'Bypass de Assinatura NVIDIA (Registro)'),
                tag: 'registry',
                desc: t(
                  'dlss5.signatureBypassDesc',
                  'Desativa checagem de assinatura de drivers no registro do Windows para evitar erros de autenticação da DLL.'
                ),
                checked: signatureBypass,
                onChange: setSignatureBypass
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => setConfirmApplyOpen(true)}
              disabled={busyAny}
              className="dh-btn dh-btn-primary h-9 px-4"
            >
              {isApplying ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              {isApplying ? t('dlss5.applyingBtn', 'Injetando e Configurando...') : t('dlss5.applyBtn', 'Aplicar DLSS 5 Autonomamente')}
            </button>

            {(scannedGame.installed || scannedGame.existingDlls?.length) && (
              <button
                type="button"
                onClick={handleRevert}
                disabled={busyAny}
                className="dh-btn h-9 px-4"
              >
                {isReverting ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                {isReverting ? t('dlss5.revertingBtn', 'Restaurando...') : t('dlss5.revertBtn', 'Desinstalar Mod / Restaurar Arquivos Originais')}
              </button>
            )}

            {status && (
              <p
                role={status.type === 'error' ? 'alert' : 'status'}
                className={`flex items-start gap-1.5 text-[12.5px] ${
                  status.type === 'success' ? 'text-emerald-300' : status.type === 'error' ? 'text-red-300' : 'text-zinc-300'
                }`}
              >
                {status.type === 'success' ? <CheckCircle2 size={14} className="shrink-0 mt-[1px]" /> : status.type === 'error' ? <XCircle size={14} className="shrink-0 mt-[1px]" /> : <Info size={14} className="shrink-0 mt-[1px]" />}
                <span>{status.message}</span>
              </p>
            )}
          </div>
        </section>
      )}

      {/* Console */}
      <section className="space-y-2" aria-labelledby="dlss5-console">
        <div className="flex items-center justify-between">
          <h2 id="dlss5-console" className="dh-section-title">{t('dlss5.terminalTitle', 'Console de Injeção & Logs')}</h2>
          {logs.length > 0 && (
            <button type="button" onClick={() => setLogs([])} className="dh-btn dh-btn-ghost dh-btn-sm">
              {t('dlss5.clearLogs', 'Limpar Console')}
            </button>
          )}
        </div>
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-950 p-3 font-mono text-[11.5px] leading-relaxed text-zinc-300 h-40 overflow-y-auto select-text" role="log" aria-live="polite">
          {logs.length === 0 ? (
            <span className="text-zinc-600">
              Aguardando seleção de jogo para iniciar diagnósticos e injeção autônoma...
            </span>
          ) : (
            logs.map((log, i) => (
              <div
                key={i}
                className={
                  log.includes('[SUCCESS]') || log.includes('[SUCESSO]') || log.includes('sucesso')
                    ? 'text-emerald-300'
                    : log.includes('[ERROR]') || log.includes('Falha')
                    ? 'text-red-300'
                    : log.includes('[AUTÊNTICO]') || log.includes('[PE SCAN]') || log.includes('[API DETECTADA]')
                    ? 'text-blue-200'
                    : log.includes('[WARN]') || log.includes('[REVERSÃO]')
                    ? 'text-amber-300'
                    : 'text-zinc-400'
                }
              >
                {log}
              </div>
            ))
          )}
          <div ref={terminalEndRef} />
        </div>
      </section>

      {/* Recent games */}
      {recentGames.length > 0 && (
        <section className="space-y-2" aria-labelledby="dlss5-recent">
          <h2 id="dlss5-recent" className="dh-section-title">{t('dlss5.recentTitle', 'Jogos Configurados Recentemente')}</h2>
          <div className="rounded-lg border border-zinc-800/80 divide-y divide-zinc-800/80 overflow-hidden">
            {recentGames.map((game, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleScanGame(game.targetDir)}
                className="group w-full text-left px-4 py-2.5 flex items-center gap-4 hover:bg-zinc-900/70 transition-colors"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-medium text-zinc-200 truncate">{game.gameName}</span>
                  <span className="block font-mono text-[11px] text-zinc-500 truncate">{game.targetDir}</span>
                </span>
                <span className="shrink-0 flex items-center gap-3 font-mono text-[11px] text-zinc-500">
                  {game.graphicsApi?.apiBadge && <span>{game.graphicsApi.apiBadge}</span>}
                  <span>{game.profile}</span>
                  {game.lastAppliedAt && <span className="hidden sm:inline">{new Date(game.lastAppliedAt).toLocaleDateString()}</span>}
                  <ChevronRight size={13} className="text-zinc-600 group-hover:text-zinc-300 transition-colors" />
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      </div>

      <DarkOSConfirmDialog
        open={confirmApplyOpen}
        title={t('dlss5.confirmApplyTitle', 'Substituir DLLs do jogo?')}
        body={t(
          'dlss5.confirmApplyBody',
          'O DLSS 5 vai copiar DLLs proxy (ex.: dxgi.dll, OptiScaler.dll) para a pasta do jogo. Os arquivos originais são salvos em backup e podem ser restaurados em "Desinstalar Mod". Feche o jogo antes de continuar.'
        )}
        confirmLabel={t('dlss5.applyBtn', 'Aplicar DLSS 5 Autonomamente')}
        onCancel={() => setConfirmApplyOpen(false)}
        onConfirm={() => {
          setConfirmApplyOpen(false);
          void handleApply();
        }}
      />
    </div>
  );
}
