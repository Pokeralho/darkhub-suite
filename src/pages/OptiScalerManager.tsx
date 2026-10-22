import React, { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { DarkOSConfirmDialog } from '../components/darkos/DarkOSConfirmDialog';
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
  Check,
  X
} from '../components/icons';
import PageHeader from '../components/ui/PageHeader';

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
  // Guards against a slow analysis of a previously selected game overwriting the current one.
  const analyzeSeq = React.useRef(0);
  const [confirmAction, setConfirmAction] = useState<null | { kind: 'apply' } | { kind: 'deleteBackup'; backupId: string }>(null);
  const busy = applying || restoring;

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
      // '' = automatic: the backend restores the oldest snapshot (true originals).
      // Defaulting to list[0] (the newest) restored OptiScaler's own files after a re-apply.
      setSelectedBackupId((prev) => (list.some((b: any) => b.id === prev) ? prev : ''));
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

    const seq = ++analyzeSeq.current;
    setAnalyzing(true);
    try {
      const payload = {
        ...makePayload(gameItem),
        exePath: resolvedExe || gameItem.exePath,
        targetDir: gameItem.installDir || effectiveTargetDir
      };
      const res = await window.darkhub.optiscaler.analyze(payload);
      analysisCache.current[gameItem.id] = res;
      if (seq !== analyzeSeq.current) return;
      setAnalysis(res);
      await loadBackups(payload);

      // Auto-tune preset if RDNA 2 GPU is detected
      if (res?.gpu?.amdArchitecture === 'rdna2' && selectedPreset === 'auto') {
        setSelectedPreset('fsr4_rdna2');
      }
    } catch (err: any) {
      console.error('Error analyzing game:', err);
    } finally {
      if (seq === analyzeSeq.current) setAnalyzing(false);
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
    if (!window.darkhub?.optiscaler?.apply || busy) return;
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
    if (!window.darkhub?.optiscaler?.restoreBackup || busy) return;
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
    <div className="w-full text-zinc-100">
      <PageHeader
        title="OptiScaler Manager"
        subtitle={<>
          Aplicação simplificada de upscalers universais de última geração com preservação e reversão segura para o jogo original.
          <span className="dh-tag ml-2">fsr 4.1.1b · rdna 2 · xess</span>
        </>}
        actions={<>
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('dlss5')}
              className="dh-btn dh-btn-ghost"
              title="Acessar o módulo experimental DLSS 5 & Universal Neural Upscaler"
            >
              <Sparkles size={14} />
              <span>DLSS 5 Manager</span>
              <span className="dh-tag">exp</span>
            </button>
          )}
          <button
            type="button"
            onClick={refreshLibraryAndSteam}
            disabled={loadingGames}
            className="dh-btn"
            title="Recarregar biblioteca de jogos"
          >
            <RefreshCw size={14} className={loadingGames ? 'animate-spin' : ''} />
            <span>Atualizar</span>
          </button>
        </>}
      />

      <div className="space-y-5">
      {status && (
        <div
          role={status.ok ? 'status' : 'alert'}
          className={`flex items-start gap-2.5 text-[12.5px] animate-in ${status.ok ? 'text-emerald-300' : 'text-red-300'}`}
        >
          {status.ok ? <CheckCircle2 size={14} className="shrink-0 mt-[1px]" /> : <AlertTriangle size={14} className="shrink-0 mt-[1px]" />}
          <div className="flex-1 min-w-0 break-words">{status.message}</div>
          <button type="button" onClick={() => setStatus(null)} className="text-zinc-500 hover:text-zinc-200 shrink-0" aria-label="Fechar">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Game library */}
      <section className="space-y-3" aria-labelledby="opti-library">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h2 id="opti-library" className="dh-section-title">
              Biblioteca de Jogos
              {games.length > 0 && <span className="ml-2 font-mono text-[11.5px] font-normal text-zinc-500">{games.length}</span>}
            </h2>
            <p className="dh-help mt-0.5">Selecione o jogo desejado ou adicione outro executável para aplicar o mod.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrar jogos..."
                aria-label="Filtrar jogos"
                className="dh-input pl-8 w-48"
              />
            </div>
            <button type="button" onClick={handleSelectExe} className="dh-btn">
              <Plus size={14} />
              <span>Outro Executável (.exe)</span>
            </button>
          </div>
        </div>

        {loadingGames ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3" aria-busy="true" aria-label="Carregando lista de jogos instalados...">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-zinc-800/80 overflow-hidden">
                <div className="h-24 bg-zinc-900 animate-pulse" />
                <div className="p-2.5 space-y-1.5">
                  <div className="h-3 w-3/4 rounded bg-zinc-900 animate-pulse" />
                  <div className="h-2.5 w-1/3 rounded bg-zinc-900 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredGames.length === 0 ? (
          <div className="py-10 rounded-xl border border-dashed border-zinc-800 flex flex-col items-center gap-3 text-center">
            <p className="text-[12.5px] text-zinc-400">{games.length === 0 ? t('optiscaler.noGames', 'Nenhum jogo instalado foi detectado.') : 'Nenhum jogo encontrado com o filtro atual.'}</p>
            <button type="button" onClick={handleSelectExe} className="dh-btn dh-btn-sm">
              <FolderOpen size={13} />
              Selecionar Executável Manualmente
            </button>
          </div>
        ) : (
          <div role="listbox" aria-label="Biblioteca de Jogos" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 max-h-[300px] overflow-y-auto pr-1">
            {filteredGames.map((game) => {
              const isSelected = game.id === selectedGameId;
              const hasModActive = Boolean(game.optiscaler?.enabled || game.isApplied);

              return (
                <div
                  key={game.id}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={0}
                  onClick={() => setSelectedGameId(game.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedGameId(game.id); } }}
                  className={`group relative flex flex-col rounded-lg overflow-hidden border cursor-pointer transition-colors duration-150 outline-none focus-visible:border-blue-400 ${
                    isSelected
                      ? 'border-blue-300 bg-zinc-900'
                      : 'border-zinc-800/80 hover:border-zinc-600'
                  }`}
                >
                  <div className="relative w-full h-24 bg-zinc-900 overflow-hidden flex items-center justify-center">
                    {game.headerUrl ? (
                      <img
                        src={game.headerUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <Gamepad2 size={20} className="text-zinc-700" />
                    )}
                    {isSelected && (
                      <span className="absolute top-1.5 left-1.5 h-5 w-5 rounded-md bg-zinc-100 text-zinc-950 flex items-center justify-center" aria-hidden="true">
                        <Check size={12} />
                      </span>
                    )}
                  </div>

                  <div className="px-2.5 py-2 min-w-0">
                    <span className="block text-[12px] font-medium text-zinc-200 truncate" title={game.name}>
                      {game.name}
                    </span>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-[10.5px] font-mono">
                      <span className="text-zinc-500 truncate">{game.platform || 'PC Game'}</span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        {hasModActive ? (
                          <span className="inline-flex items-center gap-1 text-emerald-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Ativo
                          </span>
                        ) : (
                          <span className="text-zinc-600">Original</span>
                        )}
                        {game.platform === 'Manual' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveManualGame(game.id);
                            }}
                            className="text-zinc-500 hover:text-red-300 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                            title="Remover jogo da biblioteca"
                            aria-label="Remover jogo da biblioteca"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Selected game control panel */}
      {selectedGame ? (
        <section className="dh-card p-5 space-y-6" aria-label={selectedGame.name}>
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 pb-5 border-b border-zinc-800/80">
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-[17px] font-semibold tracking-[-0.015em] text-zinc-50">{selectedGame.name}</h2>
                {isInstalledOnGame ? (
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-emerald-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    OptiScaler Ativo
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-zinc-500">
                    <ShieldCheck size={13} />
                    Jogo Original (Limpo)
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11.5px] font-mono text-zinc-500 truncate max-w-3xl" title={effectiveTargetDir}>
                {effectiveTargetDir || 'Aguardando seleção do executável...'}
              </p>
            </div>

            <dl className="shrink-0 text-right">
              <dt className="text-[11px] text-zinc-500">GPU</dt>
              <dd className="mt-0.5 text-[12.5px] text-zinc-100">
                {analysis?.gpu?.model || analysis?.gpu?.vendor || <span className="text-zinc-500">{analyzing ? 'detectando...' : 'n/d'}</span>}
                {analysis?.gpu?.amdArchitecture ? <span className="ml-1.5 font-mono text-zinc-500">{analysis.gpu.amdArchitecture}</span> : null}
              </dd>
            </dl>
          </div>

          {/* Presets */}
          <div>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="dh-section-title">Escolha o Modo de Upscaling</h3>
                <p className="dh-help mt-0.5">Selecione o perfil ideal para a sua placa de vídeo e resolução:</p>
              </div>
              {analysis?.gpu?.amdArchitecture === 'rdna2' && (
                <span className="text-[11.5px] text-blue-200">RDNA 2 Detectada: FSR 4.1.1b Recomendado</span>
              )}
            </div>

            <div role="radiogroup" aria-label="Escolha o Modo de Upscaling" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {PRESETS.map((preset) => {
                const isSelected = selectedPreset === preset.id;
                const IconComponent = preset.icon;

                return (
                  <button
                    key={preset.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setSelectedPreset(preset.id)}
                    className={`text-left rounded-lg border p-4 flex flex-col justify-between gap-3 transition-colors duration-150 ${
                      isSelected
                        ? 'border-blue-300/70 bg-blue-500/[0.05]'
                        : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/60'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <IconComponent size={16} className={isSelected ? 'text-blue-300' : 'text-zinc-500'} />
                        <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${isSelected ? 'border-blue-300' : 'border-zinc-700'}`}>
                          {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-blue-300" />}
                        </span>
                      </div>
                      <div className="mt-3 text-[13px] font-medium text-zinc-100">{preset.name}</div>
                      <div className="mt-0.5 dh-tag">{preset.badge}</div>
                      <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">{preset.description}</p>
                    </div>
                    <div className="text-[11px] text-zinc-500 pt-2 border-t border-zinc-800/80">
                      Ideal para: <span className="text-zinc-300">{preset.recommendedFor}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Backup & revert */}
          {backups.length > 0 ? (
            <div className="rounded-lg border border-zinc-800 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <Archive size={16} className="text-zinc-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <h4 className="dh-section-title">
                      Backup de Segurança do Jogo Original
                      <span className="ml-2 font-mono text-[11.5px] font-normal text-zinc-500">
                        {backups.length} snapshot{backups.length > 1 ? 's' : ''}
                      </span>
                    </h4>
                    <p className="dh-help mt-0.5">
                      Arquivos originais protegidos. Você pode reverter o jogo ao estado 100% original a qualquer momento.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRestore(selectedBackupId || undefined)}
                  disabled={busy}
                  className="dh-btn shrink-0"
                  title="Restaura os arquivos originais salvos e limpa todos os loaders do OptiScaler"
                >
                  <RotateCcw size={14} className={restoring ? 'animate-spin' : ''} />
                  <span>Restaurar Estado Original</span>
                </button>
              </div>

              <div className="pt-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2.5">
                <label className="flex items-center gap-2 min-w-0">
                  <span className="dh-label shrink-0">Ponto de Backup:</span>
                  <select
                    value={selectedBackupId}
                    onChange={(e) => setSelectedBackupId(e.target.value)}
                    className="dh-input font-mono min-w-0 max-w-[420px]"
                  >
                    <option value="">{t('optiscaler.backupAuto', 'Automático (originais mais antigos)')}</option>
                    {backups.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.id} ({b.filesCount || 0} arquivos salvos)
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCreateManualBackup}
                    disabled={busy}
                    className="dh-btn dh-btn-sm"
                    title="Criar um novo snapshot de backup deste jogo agora"
                  >
                    <Plus size={13} />
                    Novo Snapshot
                  </button>
                  {selectedBackupId && (
                    <button
                      type="button"
                      onClick={() => setConfirmAction({ kind: 'deleteBackup', backupId: selectedBackupId })}
                      disabled={busy}
                      className="dh-btn dh-btn-danger dh-btn-sm"
                      title="Excluir este snapshot de backup"
                    >
                      <Trash2 size={13} />
                      {t('optiscaler.deleteBackupBtn', 'Excluir snapshot')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-zinc-800/80 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <ShieldCheck size={16} className="text-zinc-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <h4 className="text-[12.5px] font-medium text-zinc-200">Proteção Automática de Backup Ativa</h4>
                  <p className="dh-help mt-0.5">
                    O DarkHub cria um backup completo dos seus arquivos originais assim que você clica em Ativar, garantindo reversão 100% segura.
                  </p>
                </div>
              </div>
              <button type="button" onClick={handleCreateManualBackup} disabled={busy} className="dh-btn dh-btn-sm shrink-0">
                <Archive size={13} />
                <span>Criar Snapshot Manual</span>
              </button>
            </div>
          )}

          {/* Primary actions */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmAction({ kind: 'apply' })}
              disabled={busy || analyzing || !effectiveTargetDir}
              className="dh-btn dh-btn-primary h-9 px-4"
            >
              {applying ? <RefreshCw size={14} className="animate-spin" /> : <Rocket size={14} />}
              <span>{applying ? 'Aplicando Mod com Backup Seguro...' : 'Ativar OptiScaler & Upscaling'}</span>
            </button>
            <button
              type="button"
              onClick={() => handleRestore(selectedBackupId || undefined)}
              disabled={busy || (!isInstalledOnGame && backups.length === 0)}
              className="dh-btn h-9 px-4"
              title="Restaura os arquivos originais e remove todos os arquivos e loaders do OptiScaler"
            >
              <RotateCcw size={14} className={restoring ? 'animate-spin' : ''} />
              <span>{restoring ? 'Revertendo Arquivos...' : 'Reverter Jogo para Original'}</span>
            </button>
          </div>

          {/* Advanced */}
          <div className="border-t border-zinc-800/80 pt-1">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              aria-expanded={showAdvanced}
              className="w-full flex items-center justify-between py-2.5 text-[12.5px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Settings2 size={14} className="text-zinc-500" />
                Configurações Avançadas (Loader DLL & Agility SDK)
              </span>
              {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showAdvanced && (
              <div className="pt-2 pb-1 grid grid-cols-1 md:grid-cols-2 gap-5 animate-in">
                <div>
                  <label htmlFor="opti-loader" className="dh-label block mb-1.5">Loader DLL de Injeção:</label>
                  <select
                    id="opti-loader"
                    value={selectedLoader}
                    onChange={(e) => setSelectedLoader(e.target.value)}
                    className="dh-input w-full font-mono"
                  >
                    {LOADER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <p className="dh-help mt-1.5">
                    {LOADER_OPTIONS.find((o) => o.value === selectedLoader)?.hint || 'Loader hook para o jogo.'}
                  </p>
                </div>

                <div>
                  <span className="dh-label block mb-1.5">DirectX 12 Agility SDK:</span>
                  <label className="flex items-start gap-2 text-[12.5px] text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeAgilitySdk}
                      onChange={(e) => setIncludeAgilitySdk(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>Injetar D3D12_Optiscaler (Apenas para jogos sem D3D12Core nativo)</span>
                  </label>
                  <p className="dh-help mt-1.5">
                    Jogos modernos que já contêm D3D12 nativo mantêm sua própria SDK para evitar o erro <span className="font-mono">0xc0000142</span>.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : (
        <div className="py-12 rounded-xl border border-dashed border-zinc-800 flex flex-col items-center text-center gap-3">
          <h3 className="dh-section-title">Nenhum jogo selecionado</h3>
          <p className="dh-help max-w-md">
            Clique em qualquer jogo na lista acima ou use o botão &quot;Outro Executável&quot; para escolher a pasta do jogo.
          </p>
          <button type="button" onClick={handleSelectExe} className="dh-btn dh-btn-sm mt-1">
            <FolderOpen size={13} />
            Outro Executável (.exe)
          </button>
        </div>
      )}
      </div>

      <DarkOSConfirmDialog
        open={confirmAction !== null}
        danger={confirmAction?.kind === 'deleteBackup'}
        title={confirmAction?.kind === 'deleteBackup'
          ? t('optiscaler.confirmDeleteBackupTitle', 'Excluir este snapshot de backup?')
          : t('optiscaler.confirmApplyTitle', 'Substituir DLLs do jogo?')}
        body={confirmAction?.kind === 'deleteBackup'
          ? t('optiscaler.confirmDeleteBackupBody', 'Os arquivos originais guardados neste snapshot serão apagados permanentemente. Se for o único backup, não será possível restaurar o jogo ao estado original.')
          : t('optiscaler.confirmApplyBody', 'O OptiScaler vai copiar DLLs proxy para a pasta do jogo. Os arquivos originais são salvos em OptiScaler_Backups e podem ser restaurados a qualquer momento. Feche o jogo antes de continuar.')}
        confirmLabel={confirmAction?.kind === 'deleteBackup' ? t('optiscaler.deleteBackupBtn', 'Excluir snapshot') : t('optiscaler.applyBtn', 'Ativar OptiScaler')}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          const action = confirmAction;
          setConfirmAction(null);
          if (action?.kind === 'apply') void handleApply();
          else if (action?.kind === 'deleteBackup') void handleDeleteBackup(action.backupId);
        }}
      />
    </div>
  );
}
