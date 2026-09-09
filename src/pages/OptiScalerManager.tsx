import React, { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Cpu,
  FolderOpen,
  Gamepad2,
  RefreshCw,
  Rocket,
  Settings2,
  ShieldCheck,
  DownloadCloud,
  RotateCcw,
  Trash2,
  Plus,
  Sparkles,
  Search,
  ChevronDown,
  ChevronUp,
  Zap,
  Layers,
  Sliders,
  Check
} from 'lucide-react';

export interface OptiScalerConfig {
  enabled?: boolean;
  applyOnLaunch?: boolean;
  targetDir?: string;
  loader?: string;
  upscaler?: string;
  inputApi?: string;
  includeAgilitySdk?: boolean;
  sourceVersion?: string;
  lastInstalledAt?: number | null;
}

export interface GameItem {
  id: string;
  name: string;
  exePath: string;
  installDir?: string;
  workingDir?: string;
  headerUrl?: string;
  coverUrl?: string;
  platform?: string;
  isSteam?: boolean;
  isApplied?: boolean;
  optiscaler?: OptiScalerConfig;
}

type Choice = {
  value: string;
  label: string;
  hint?: string;
};

const LOADER_OPTIONS: Choice[] = [
  { value: 'auto', label: 'Auto (Recomendado)', hint: 'Detecta automaticamente o loader seguro para o jogo' },
  { value: 'dxgi.dll', label: 'dxgi.dll', hint: 'Padrão da maioria dos jogos DirectX 11 e 12' },
  { value: 'winmm.dll', label: 'winmm.dll', hint: 'Excelente para jogos Vulkan, WinGDK e Game Pass' },
  { value: 'version.dll', label: 'version.dll', hint: 'Hook universal de compatibilidade' },
  { value: 'd3d12.dll', label: 'd3d12.dll', hint: 'Fallback exclusivo para DirectX 12' }
];

const PRESETS = [
  {
    id: 'fsr4_rdna2',
    name: 'FSR 4.1.1b RDNA 2 (INT8 Mod)',
    badge: 'Recomendado • the3rdparty1917',
    badgeColor: 'border-red-500/40 bg-red-500/10 text-red-300',
    description: 'Mod da comunidade para AMD Radeon RX 6000 / RDNA 2. Ativa o bypass de instruções INT8, modelo neural 4.1.1b e correção anti-ghosting.',
    recommendedFor: 'Radeon RX 6000 (RDNA 2)',
    icon: Sparkles,
    accent: 'red'
  },
  {
    id: 'fsr31',
    name: 'FSR 3.1 Universal',
    badge: 'AMD Oficial',
    badgeColor: 'border-blue-500/40 bg-blue-500/10 text-blue-300',
    description: 'Versão oficial do FidelityFX Super Resolution 3.1. Ampla compatibilidade e excelente ganho de desempenho em qualquer GPU moderna.',
    recommendedFor: 'Todas as GPUs (DX11/DX12/Vulkan)',
    icon: Zap,
    accent: 'blue'
  },
  {
    id: 'xess',
    name: 'Intel XeSS Neural',
    badge: 'Rede Neural / IA',
    badgeColor: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300',
    description: 'Reconstrução de imagem por inteligência artificial com alta estabilidade temporal e detalhes finos. Funciona em placas AMD, NVIDIA e Intel.',
    recommendedFor: 'Qualidade de imagem máxima',
    icon: Layers,
    accent: 'cyan'
  },
  {
    id: 'dlss',
    name: 'DLSS Direct / Spoof',
    badge: 'Modo Base',
    badgeColor: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    description: 'Substituição direta dos arquivos e chamadas de DLSS nativos do jogo pelo pipeline otimizado do OptiScaler.',
    recommendedFor: 'Jogos com DLSS nativo',
    icon: Sliders,
    accent: 'emerald'
  }
];

function dirnameFromPath(value = '') {
  return value.split(/[\\/]/).slice(0, -1).join('\\');
}

function basename(value = '') {
  return value.split(/[\\/]/).pop() || value;
}

interface OptiScalerManagerProps {
  onNavigate?: (page: string) => void;
}

export default function OptiScalerManager({ onNavigate }: OptiScalerManagerProps = {}) {
  const { t } = useI18n();

  // Games & Selection
  const [games, setGames] = useState<GameItem[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingGames, setLoadingGames] = useState(false);

  // Active Game Settings
  const [selectedPreset, setSelectedPreset] = useState<string>('fsr4_rdna2');
  const [selectedLoader, setSelectedLoader] = useState<string>('auto');
  const [customTargetDir, setCustomTargetDir] = useState<string>('');
  const [includeAgilitySdk, setIncludeAgilitySdk] = useState<boolean>(false);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Execution & Diagnostics
  const [analysis, setAnalysis] = useState<any>(null);
  const [backups, setBackups] = useState<any[]>([]);
  const [selectedBackupId, setSelectedBackupId] = useState<string>('');
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const analysisCache = React.useRef<Record<string, any>>({});

  // Selected game reference
  const selectedGame = useMemo(() => {
    return games.find((g) => g.id === selectedGameId) || null;
  }, [games, selectedGameId]);

  const targetExePath = selectedGame?.exePath || '';
  const effectiveTargetDir =
    customTargetDir.trim() ||
    selectedGame?.workingDir ||
    selectedGame?.installDir ||
    (targetExePath ? dirnameFromPath(targetExePath) : '');

  // Is OptiScaler currently installed on the selected game?
  const isInstalledOnGame = useMemo(() => {
    if (selectedGame?.optiscaler?.enabled) return true;
    if (analysis?.installed?.loaders?.some((l: any) => l.isOptiScaler)) return true;
    if (selectedGame?.isApplied) return true;
    return false;
  }, [selectedGame, analysis]);

  // Load games from Library and Steam
  const refreshLibraryAndSteam = async () => {
    setLoadingGames(true);
    const combined: GameItem[] = [];
    const seenDirs = new Set<string>();

    try {
      // 1. DarkHub Library Games
      if (window.darkhub?.library?.list) {
        const libRes = await window.darkhub.library.list();
        if (libRes?.ok && Array.isArray(libRes.games)) {
          for (const g of libRes.games) {
            const normDir = dirnameFromPath(g.exePath || '').toLowerCase();
            if (normDir) seenDirs.add(normDir);
            combined.push({
              id: g.id || `custom-${g.name}`,
              name: g.name,
              exePath: g.exePath,
              workingDir: g.workingDir || dirnameFromPath(g.exePath),
              headerUrl: g.coverUrl,
              platform: g.platform || 'DarkHub',
              optiscaler: g.optiscaler
            });
          }
        }
      }

      // 2. Steam Installed Games
      if (window.darkhub?.dlss5?.getSteamGames) {
        const steamList = await window.darkhub.dlss5.getSteamGames();
        if (Array.isArray(steamList)) {
          for (const sg of steamList) {
            const normDir = (sg.installDir || '').toLowerCase();
            if (!seenDirs.has(normDir)) {
              seenDirs.add(normDir);
              combined.push({
                id: `steam-${sg.appId}`,
                name: sg.name,
                exePath: '', // Resolved upon selection or scan
                installDir: sg.installDir,
                workingDir: sg.installDir,
                headerUrl: sg.headerUrl,
                platform: 'Steam',
                isSteam: true,
                isApplied: sg.isApplied
              });
            }
          }
        }
      }

      setGames(combined);
      if (combined.length > 0 && !selectedGameId) {
        setSelectedGameId(combined[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load games:', err);
    } finally {
      setLoadingGames(false);
    }
  };

  useEffect(() => {
    refreshLibraryAndSteam();
  }, []);

  // When selected game changes, update state and trigger analysis
  useEffect(() => {
    if (!selectedGame) return;
    setCustomTargetDir('');
    setStatus(null);

    // If game has saved optiscaler preferences, load them
    if (selectedGame.optiscaler) {
      if (selectedGame.optiscaler.upscaler) setSelectedPreset(selectedGame.optiscaler.upscaler);
      if (selectedGame.optiscaler.loader) setSelectedLoader(selectedGame.optiscaler.loader);
      if (selectedGame.optiscaler.includeAgilitySdk !== undefined) {
        setIncludeAgilitySdk(Boolean(selectedGame.optiscaler.includeAgilitySdk));
      }
    }

    runAnalyzeForGame(selectedGame);
  }, [selectedGameId]);

  const makePayload = (gameItem: GameItem | null = selectedGame) => {
    const exe = gameItem?.exePath || targetExePath;
    const workingDir = effectiveTargetDir || dirnameFromPath(exe);
    return {
      game: gameItem
        ? {
            ...gameItem,
            exePath: exe,
            workingDir
          }
        : undefined,
      gameId: gameItem?.id,
      exePath: exe,
      workingDir,
      targetDir: effectiveTargetDir,
      loader: selectedLoader,
      upscaler: selectedPreset,
      includeAgilitySdk
    };
  };

  const loadBackups = async (payload = makePayload()) => {
    if (!window.darkhub?.optiscaler?.listBackups) return;
    try {
      const res = await window.darkhub.optiscaler.listBackups(payload);
      const list = res?.ok && Array.isArray(res.backups) ? res.backups : [];
      setBackups(list);
      if (list.length > 0) {
        setSelectedBackupId((prev) => (list.some((b: any) => b.id === prev) ? prev : list[0].id));
      } else {
        setSelectedBackupId('');
      }
    } catch {
      setBackups([]);
      setSelectedBackupId('');
    }
  };

  const runAnalyzeForGame = async (gameItem: GameItem) => {
    if (!window.darkhub?.optiscaler?.analyze) return;

    // Use cached analysis for instant UI transition
    if (analysisCache.current[gameItem.id]) {
      setAnalysis(analysisCache.current[gameItem.id]);
    }

    let resolvedExe = gameItem.exePath;

    // For Steam games without direct exePath, locate best executable
    if (!resolvedExe && gameItem.installDir && window.darkhub?.dlss5?.scanGame) {
      try {
        const scanRes = await window.darkhub.dlss5.scanGame(gameItem.installDir);
        if (scanRes?.ok && scanRes.exePath) {
          resolvedExe = scanRes.exePath;
          gameItem.exePath = scanRes.exePath;
        }
      } catch {}
    }

    setAnalyzing(true);
    try {
      const payload = {
        ...makePayload(gameItem),
        exePath: resolvedExe || gameItem.exePath,
        targetDir: gameItem.installDir || effectiveTargetDir
      };
      const res = await window.darkhub.optiscaler.analyze(payload);
      setAnalysis(res);
      analysisCache.current[gameItem.id] = res;
      await loadBackups(payload);

      // Auto-tune preset if RDNA 2 GPU is detected
      if (res?.gpu?.amdArchitecture === 'rdna2' && selectedPreset === 'auto') {
        setSelectedPreset('fsr4_rdna2');
      }
    } catch (err: any) {
      console.error('Error analyzing game:', err);
    } finally {
      setAnalyzing(false);
    }
  };

  // Browse custom executable and permanently register into DarkHub Library
  const handleSelectExe = async () => {
    if (!window.darkhub?.dialog?.selectFiles) return;
    try {
      const res = await window.darkhub.dialog.selectFiles({
        title: 'Selecione o Executável do Jogo (.exe)',
        filters: [{ name: 'Executáveis (.exe)', extensions: ['exe'] }]
      });
      const file = res?.filePaths?.[0];
      if (file) {
        const name = basename(file).replace(/\.exe$/i, '');
        const workingDir = dirnameFromPath(file);

        if (window.darkhub?.library?.upsert) {
          const saveRes = await window.darkhub.library.upsert({
            name,
            exePath: file,
            workingDir,
            platform: 'Manual'
          });
          await refreshLibraryAndSteam();
          if (saveRes?.ok && saveRes.game?.id) {
            setSelectedGameId(saveRes.game.id);
          } else {
            setSelectedGameId(`custom-${name}`);
          }
        } else {
          const newGame: GameItem = {
            id: `custom-${Date.now()}`,
            name,
            exePath: file,
            workingDir,
            platform: 'Manual'
          };
          setGames((prev) => [newGame, ...prev]);
          setSelectedGameId(newGame.id);
        }
      }
    } catch (err) {
      console.error('Error selecting file:', err);
    }
  };

  // Remove a manually added game from DarkHub Library
  const handleRemoveManualGame = async (gameId: string) => {
    if (!window.darkhub?.library?.remove) return;
    try {
      await window.darkhub.library.remove({ id: gameId });
      await refreshLibraryAndSteam();
      if (selectedGameId === gameId) {
        setSelectedGameId('');
      }
    } catch (err) {
      console.error('Error removing game from library:', err);
    }
  };

  // Create manual backup snapshot
  const handleCreateManualBackup = async () => {
    if (!window.darkhub?.optiscaler?.createManualBackup) return;
    setStatus(null);
    try {
      const payload = makePayload();
      const res = await window.darkhub.optiscaler.createManualBackup(payload);
      if (res?.ok) {
        setStatus({ ok: true, message: 'Snapshot de backup manual criado com sucesso!' });
        await loadBackups(payload);
      } else {
        setStatus({ ok: false, message: res?.error || 'Falha ao criar backup manual.' });
      }
    } catch (err: any) {
      setStatus({ ok: false, message: err?.message || String(err) });
    }
  };

  // Delete specific backup snapshot
  const handleDeleteBackup = async (backupId: string) => {
    if (!window.darkhub?.optiscaler?.deleteBackup || !backupId) return;
    try {
      const payload = { ...makePayload(), backupId };
      const res = await window.darkhub.optiscaler.deleteBackup(payload);
      if (res?.ok) {
        setStatus({ ok: true, message: 'Snapshot de backup removido com sucesso.' });
        await loadBackups(makePayload());
      } else {
        setStatus({ ok: false, message: res?.error || 'Falha ao remover snapshot de backup.' });
      }
    } catch (err: any) {
      setStatus({ ok: false, message: err?.message || String(err) });
    }
  };

  // Apply OptiScaler
  const handleApply = async () => {
    if (!window.darkhub?.optiscaler?.apply) return;
    if (!selectedGame && !targetExePath) {
      setStatus({ ok: false, message: 'Selecione um jogo antes de aplicar.' });
      return;
    }

    setApplying(true);
    setStatus(null);
    try {
      const payload = makePayload();
      const res = await window.darkhub.optiscaler.apply(payload);
      if (res?.ok) {
        setStatus({
          ok: true,
          message: res.skipped
            ? 'OptiScaler já está instalado e atualizado para este jogo.'
            : `OptiScaler aplicado com sucesso! Backup de segurança salvo.`
        });
        await runAnalyzeForGame(selectedGame!);
        await refreshLibraryAndSteam();
      } else {
        setStatus({ ok: false, message: res?.error || 'Falha ao aplicar OptiScaler.' });
      }
    } catch (err: any) {
      setStatus({ ok: false, message: err?.message || String(err) });
    } finally {
      setApplying(false);
    }
  };

  // Clean Revert / Restore
  const handleRestore = async (backupId?: string) => {
    if (!window.darkhub?.optiscaler?.restoreBackup) return;
    setRestoring(true);
    setStatus(null);
    try {
      const payload = { ...makePayload(), backupId };
      const res = await window.darkhub.optiscaler.restoreBackup(payload);
      if (res?.ok) {
        setStatus({
          ok: true,
          message: res.message || 'Jogo revertido com sucesso para o estado 100% original!'
        });
        await runAnalyzeForGame(selectedGame!);
        await refreshLibraryAndSteam();
      } else {
        setStatus({ ok: false, message: res?.error || 'Falha ao restaurar estado original.' });
      }
    } catch (err: any) {
      setStatus({ ok: false, message: err?.message || String(err) });
    } finally {
      setRestoring(false);
    }
  };

  // Filter games based on search query
  const filteredGames = useMemo(() => {
    if (!searchQuery.trim()) return games;
    const q = searchQuery.toLowerCase();
    return games.filter((g) => g.name.toLowerCase().includes(q));
  }, [games, searchQuery]);

  return (
    <div className="flex-1 h-full overflow-y-auto bg-zinc-950 text-zinc-100 p-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-cyan-400">
            <Cpu size={28} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-100">OptiScaler Manager</h1>
              <span className="px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 rounded-full">
                FSR 4.1.1b RDNA 2 & XeSS
              </span>
            </div>
            <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
              Aplicação simplificada de upscalers universais de última geração com preservação e reversão segura para o jogo original.
            </p>
          </div>
        </div>

        {/* Quick Nav Button for DLSS 5 */}
        <div className="flex items-center gap-2 shrink-0">
          {onNavigate && (
            <button
              onClick={() => onNavigate('dlss5')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-purple-500/40 bg-purple-950/40 text-purple-200 hover:bg-purple-900/60 hover:text-white transition-all text-xs font-semibold shadow-sm cursor-pointer"
              title="Acessar o módulo experimental DLSS 5 & Universal Neural Upscaler"
            >
              <Sparkles size={15} className="text-purple-400" />
              <span>DLSS 5 Manager</span>
              <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                EXP
              </span>
            </button>
          )}
          <button
            onClick={refreshLibraryAndSteam}
            disabled={loadingGames}
            className="flex items-center gap-1.5 px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
            title="Recarregar biblioteca de jogos"
          >
            <RefreshCw size={14} className={loadingGames ? 'animate-spin text-cyan-400' : ''} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Status Feedback Banner */}
      {status && (
        <div
          className={`rounded-xl border p-4 text-sm flex items-start gap-3 shadow-md ${
            status.ok
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              : 'border-red-500/30 bg-red-500/10 text-red-200'
          }`}
        >
          {status.ok ? (
            <CheckCircle2 size={20} className="text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle size={20} className="text-red-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 font-medium">{status.message}</div>
          <button
            onClick={() => setStatus(null)}
            className="text-xs opacity-70 hover:opacity-100 transition-opacity ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* SECTION 1: Integrated Game Library Card Carousel / Grid */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-cyan-400">
              <Gamepad2 size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-zinc-100">Biblioteca de Jogos</h2>
                {games.length > 0 && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                    {games.length} jogos
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Selecione o jogo desejado ou adicione outro executável para aplicar o mod.
              </p>
            </div>
          </div>

          {/* Search bar & Add Custom Game */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrar jogos..."
                className="pl-8 pr-3 py-1.5 bg-zinc-950/80 border border-zinc-700/80 focus:border-cyan-500 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 outline-none w-44 transition-colors"
              />
            </div>
            <button
              onClick={handleSelectExe}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              <Plus size={14} />
              <span>Outro Executável (.exe)</span>
            </button>
          </div>
        </div>

        {/* Games Grid */}
        {loadingGames ? (
          <div className="flex items-center justify-center py-10 text-zinc-400 text-xs gap-2 border border-dashed border-zinc-800 rounded-xl bg-zinc-950/40">
            <RefreshCw size={16} className="animate-spin text-cyan-400" />
            <span>Carregando lista de jogos instalados...</span>
          </div>
        ) : filteredGames.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-zinc-800 rounded-xl bg-zinc-950/30 text-xs text-zinc-400 space-y-2">
            <p>Nenhum jogo encontrado com o filtro atual.</p>
            <button
              onClick={handleSelectExe}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-200 font-medium cursor-pointer"
            >
              Selecionar Executável Manualmente
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 max-h-[280px] overflow-y-auto pr-1">
            {filteredGames.map((game) => {
              const isSelected = game.id === selectedGameId;
              const hasModActive = Boolean(game.optiscaler?.enabled || game.isApplied);

              return (
                <div
                  key={game.id}
                  onClick={() => setSelectedGameId(game.id)}
                  className={`group relative flex flex-col rounded-xl overflow-hidden border transition-all cursor-pointer bg-zinc-950/60 hover:bg-zinc-900 ${
                    isSelected
                      ? 'border-cyan-500 shadow-md shadow-cyan-500/10 ring-1 ring-cyan-500'
                      : 'border-zinc-800/80 hover:border-zinc-700'
                  }`}
                >
                  {/* Game Art / Banner */}
                  <div className="relative w-full h-24 bg-zinc-900 overflow-hidden flex items-center justify-center text-zinc-700">
                    {game.headerUrl ? (
                      <img
                        src={game.headerUrl}
                        alt={game.name}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <Gamepad2 size={32} />
                    )}

                    {/* Status Badge */}
                    {hasModActive ? (
                      <div className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded-md bg-emerald-950/90 border border-emerald-500/50 text-[10px] font-semibold text-emerald-300 flex items-center gap-1 shadow-sm backdrop-blur-sm z-10">
                        <CheckCircle2 size={11} className="text-emerald-400" />
                        <span>Ativo</span>
                      </div>
                    ) : (
                      <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-zinc-900/80 border border-zinc-700/60 text-[9px] text-zinc-400 backdrop-blur-sm z-10">
                        Original
                      </div>
                    )}

                    {isSelected && (
                      <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md bg-cyan-600 text-[10px] font-bold text-white shadow-sm z-10">
                        Selecionado
                      </div>
                    )}
                  </div>

                  {/* Title & Platform */}
                  <div className="p-2.5 flex flex-col justify-between flex-1">
                    <span
                      className="text-xs font-semibold text-zinc-200 line-clamp-1 group-hover:text-cyan-400 transition-colors"
                      title={game.name}
                    >
                      {game.name}
                    </span>
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 mt-1">
                      <span>{game.platform || 'PC Game'}</span>
                      {game.platform === 'Manual' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveManualGame(game.id);
                          }}
                          className="text-zinc-500 hover:text-red-400 p-0.5 rounded transition-colors"
                          title="Remover jogo da biblioteca"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 2: Selected Game Hero Card & Control Center */}
      {selectedGame ? (
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 space-y-6 shadow-sm">
          {/* Header Info */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-bold text-white tracking-tight">{selectedGame.name}</h2>
                {isInstalledOnGame ? (
                  <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-emerald-400" />
                    <span>OptiScaler Ativo</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 text-xs font-medium rounded-full border border-zinc-700 bg-zinc-950 text-zinc-400 flex items-center gap-1.5">
                    <ShieldCheck size={13} className="text-zinc-500" />
                    <span>Jogo Original (Limpo)</span>
                  </span>
                )}
              </div>
              <p className="text-xs font-mono text-zinc-400 mt-1 truncate max-w-3xl" title={effectiveTargetDir}>
                Pasta: {effectiveTargetDir || 'Aguardando seleção do executável...'}
              </p>
            </div>

            {/* GPU Hardware Info Pill */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-zinc-800 bg-zinc-950/70 text-xs text-zinc-300 self-start lg:self-center shrink-0">
              <Cpu size={15} className="text-cyan-400" />
              <span>
                GPU: <strong className="text-white">{analysis?.gpu?.model || analysis?.gpu?.vendor || 'AMD Radeon'}</strong>
                {analysis?.gpu?.amdArchitecture ? ` (${analysis.gpu.amdArchitecture.toUpperCase()})` : ''}
              </span>
            </div>
          </div>

          {/* Preset Selection Cards */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-zinc-200">Escolha o Modo de Upscaling</h3>
                <p className="text-xs text-zinc-400">
                  Selecione o perfil ideal para a sua placa de vídeo e resolução:
                </p>
              </div>
              {analysis?.gpu?.amdArchitecture === 'rdna2' && (
                <span className="px-2 py-0.5 text-[11px] font-semibold text-red-300 bg-red-950/40 border border-red-500/30 rounded-md">
                  RDNA 2 Detectada: FSR 4.1.1b Recomendado
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {PRESETS.map((preset) => {
                const isSelected = selectedPreset === preset.id;
                const IconComponent = preset.icon;

                return (
                  <div
                    key={preset.id}
                    onClick={() => setSelectedPreset(preset.id)}
                    className={`rounded-xl border p-4 transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-950/20 shadow-lg shadow-cyan-500/5 ring-1 ring-cyan-500'
                        : 'border-zinc-800 bg-zinc-950/50 hover:border-zinc-700 hover:bg-zinc-900/50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${preset.badgeColor}`}>
                          {preset.badge}
                        </span>
                        {isSelected && (
                          <div className="h-5 w-5 rounded-full bg-cyan-500 text-zinc-950 flex items-center justify-center">
                            <Check size={13} strokeWidth={3} />
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 font-semibold text-sm text-zinc-100">
                        <IconComponent size={16} className={isSelected ? 'text-cyan-400' : 'text-zinc-400'} />
                        <span>{preset.name}</span>
                      </div>

                      <p className="text-xs text-zinc-400 mt-2 leading-relaxed">{preset.description}</p>
                    </div>

                    <div className="text-[11px] text-zinc-500 font-medium pt-2 border-t border-zinc-800/60">
                      Ideal para: <strong className="text-zinc-300">{preset.recommendedFor}</strong>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION 3: Prominent Backup & Revert Card (Always visible and unmistakable) */}
          {backups.length > 0 ? (
            <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-4.5 space-y-3.5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-amber-500/20 border border-amber-500/40 rounded-xl text-amber-300">
                    <Archive size={22} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-bold text-amber-200">
                        Backup de Segurança do Jogo Original
                      </h4>
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/30 border border-amber-500/50 text-amber-200">
                        {backups.length} snapshot{backups.length > 1 ? 's' : ''} disponível
                      </span>
                    </div>
                    <p className="text-xs text-amber-200/80 mt-0.5">
                      Arquivos originais protegidos. Você pode reverter o jogo ao estado 100% original a qualquer momento.
                    </p>
                  </div>
                </div>

                {/* Big Direct Restore Button */}
                <button
                  onClick={() => handleRestore(selectedBackupId || backups[0]?.id)}
                  disabled={restoring}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer shrink-0"
                  title="Restaura os arquivos originais salvos e limpa todos os loaders do OptiScaler"
                >
                  <RotateCcw size={15} className={restoring ? 'animate-spin' : ''} />
                  <span>Restaurar Estado Original</span>
                </button>
              </div>

              {/* Snapshot selector & management */}
              <div className="pt-2.5 border-t border-amber-500/20 flex flex-wrap items-center justify-between gap-2.5 text-xs">
                <div className="flex items-center gap-2 text-zinc-300">
                  <span className="text-amber-200/70 font-medium">Ponto de Backup:</span>
                  <select
                    value={selectedBackupId || backups[0]?.id || ''}
                    onChange={(e) => setSelectedBackupId(e.target.value)}
                    className="px-2.5 py-1 bg-zinc-900 border border-amber-500/40 rounded-lg text-amber-200 font-mono text-xs outline-none cursor-pointer"
                  >
                    {backups.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.id} ({b.filesCount || 0} arquivos salvos)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCreateManualBackup}
                    className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                    title="Criar um novo snapshot de backup deste jogo agora"
                  >
                    + Novo Snapshot
                  </button>
                  {selectedBackupId && (
                    <button
                      onClick={() => handleDeleteBackup(selectedBackupId)}
                      className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-900 rounded-lg transition-colors cursor-pointer"
                      title="Excluir este snapshot de backup"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-zinc-200">
                    Proteção Automática de Backup Ativa
                  </h4>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    O DarkHub cria um backup completo dos seus arquivos originais assim que você clica em Ativar, garantindo reversão 100% segura.
                  </p>
                </div>
              </div>
              <button
                onClick={handleCreateManualBackup}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-medium transition-colors shrink-0 cursor-pointer"
              >
                <Archive size={14} className="text-amber-400" />
                <span>Criar Snapshot Manual</span>
              </button>
            </div>
          )}

          {/* Action Buttons: Apply & Revert */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            {/* Apply Button */}
            <button
              onClick={handleApply}
              disabled={applying || analyzing || !effectiveTargetDir}
              className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm shadow-md shadow-emerald-950/50 transition-all cursor-pointer"
            >
              {applying ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  <span>Aplicando Mod com Backup Seguro...</span>
                </>
              ) : (
                <>
                  <Rocket size={18} />
                  <span>Ativar OptiScaler & Upscaling</span>
                </>
              )}
            </button>

            {/* Revert Button - Always Visible and Clickable */}
            <button
              onClick={() => handleRestore(selectedBackupId || backups[0]?.id)}
              disabled={restoring || (!isInstalledOnGame && backups.length === 0)}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title="Restaura os arquivos originais e remove todos os arquivos e loaders do OptiScaler"
            >
              {restoring ? (
                <>
                  <RotateCcw size={18} className="animate-spin" />
                  <span>Revertendo Arquivos...</span>
                </>
              ) : (
                <>
                  <RotateCcw size={18} />
                  <span>Reverter Jogo para Original</span>
                </>
              )}
            </button>
          </div>

          {/* SECTION 4: Collapsible Advanced Settings (Simplified & Uncluttered) */}
          <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950/40">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Settings2 size={16} className="text-zinc-500" />
                <span>Configurações Avançadas (Loader DLL & Agility SDK)</span>
              </div>
              {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showAdvanced && (
              <div className="p-4 border-t border-zinc-800 space-y-4 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Custom Loader Selection */}
                  <div>
                    <label className="block text-zinc-400 font-medium mb-1.5">Loader DLL de Injeção:</label>
                    <select
                      value={selectedLoader}
                      onChange={(e) => setSelectedLoader(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200 outline-none focus:border-cyan-500"
                    >
                      {LOADER_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-zinc-500 mt-1">
                      {LOADER_OPTIONS.find((o) => o.value === selectedLoader)?.hint || 'Loader hook para o jogo.'}
                    </p>
                  </div>

                  {/* Agility SDK toggle */}
                  <div>
                    <label className="block text-zinc-400 font-medium mb-1.5">DirectX 12 Agility SDK:</label>
                    <label className="flex items-center gap-2 p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300">
                      <input
                        type="checkbox"
                        checked={includeAgilitySdk}
                        onChange={(e) => setIncludeAgilitySdk(e.target.checked)}
                        className="rounded bg-zinc-800 border-zinc-700"
                      />
                      <span>Injetar D3D12_Optiscaler (Apenas para jogos sem D3D12Core nativo)</span>
                    </label>
                    <p className="text-[11px] text-zinc-500 mt-1">
                      Jogos modernos que já contêm D3D12 nativo mantêm sua própria SDK para evitar o erro 0xc0000142.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-zinc-900/40 border border-dashed border-zinc-800 rounded-2xl p-12 text-center text-zinc-500 space-y-3">
          <Gamepad2 size={36} className="mx-auto text-zinc-600" />
          <h3 className="text-base font-semibold text-zinc-300">Nenhum jogo selecionado</h3>
          <p className="text-xs max-w-md mx-auto">
            Clique em qualquer jogo na lista acima ou use o botão &quot;Outro Executável&quot; para escolher a pasta do jogo.
          </p>
        </div>
      )}
    </div>
  );
}
