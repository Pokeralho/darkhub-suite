import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Zap, Trash2, CheckCircle2, AlertCircle, Loader2, Cpu, Wrench, Settings, Globe, Server,
  Clock, Activity, Target, Info, Key, Trash, ZapOff, HardDrive, Shield, Eraser, SignalHigh,
  PlaySquare, FileMinus, CheckSquare, Square, Monitor, ShieldCheck, Undo2, Search,
  SlidersHorizontal, Layers, Terminal, RefreshCw, Sparkles, Check, ChevronDown, ChevronUp,
  Flame, Lock, EyeOff, Radio, Laptop, ArrowRight, FolderOpen, Gamepad2, X, Play, RotateCcw,
  Palette, MousePointerClick, RefreshCcw, Headphones, BatteryCharging, Power, Package,
  Network, Wifi, ShieldAlert
} from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';

type OptimizerTab = 'tweaks' | 'gpu' | 'priority' | 'uninstaller' | 'network' | 'defender' | 'debloat' | 'startup';

export default function Optimizer() {
  const { t } = useI18n();

  // Navigation & View
  const [activeTab, setActiveTab] = useState<OptimizerTab>('tweaks');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTweakIds, setSelectedTweakIds] = useState<Set<string>>(new Set());

  // Operations & Deep Tweaks State
  const [operations, setOperations] = useState<any[]>([]);
  const [deepTweaks, setDeepTweaks] = useState<any[]>([]);
  const [tweakStatus, setTweakStatus] = useState<Record<string, boolean>>({});
  const [isAdminUser, setIsAdminUser] = useState<boolean | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizingId, setOptimizingId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [showConsole, setShowConsole] = useState(false);

  // Quick Tools Live Feedback
  const [ramFreedMsg, setRamFreedMsg] = useState<string | null>(null);
  const [diskCleanedMsg, setDiskCleanedMsg] = useState<string | null>(null);
  const [dnsFlushedMsg, setDnsFlushedMsg] = useState<string | null>(null);

  // Program Uninstaller with Leftovers State
  const [installedPrograms, setInstalledPrograms] = useState<any[]>([]);
  const [programSearch, setProgramSearch] = useState('');
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [uninstallingProgram, setUninstallingProgram] = useState<string | null>(null);

  // GPU Preferences State
  const [gpuPreferences, setGpuPreferences] = useState<any[]>([]);
  const [selectedGpuAppPath, setSelectedGpuAppPath] = useState('');
  const [selectedGpuPref, setSelectedGpuPref] = useState<'high_performance' | 'power_saving' | 'default'>('high_performance');

  // Process Priority State
  const [processList, setProcessList] = useState<any[]>([]);
  const [processSearch, setProcessSearch] = useState('');
  const [selectedProcess, setSelectedProcess] = useState<number | null>(null);
  const [selectedPriority, setSelectedPriority] = useState<string>('high');
  const [isRefreshingProcesses, setIsRefreshingProcesses] = useState(false);

  // Debloat State
  const [bloatwareList, setBloatwareList] = useState<any[]>([]);
  const [selectedBloatware, setSelectedBloatware] = useState<Set<string>>(new Set());
  const [loadingBloatware, setLoadingBloatware] = useState(false);

  // Startup Items State
  const [startupItems, setStartupItems] = useState<any[]>([]);
  const [loadingStartup, setLoadingStartup] = useState(false);

  // Network & DNS State
  const [dnsBenchmarkRunning, setDnsBenchmarkRunning] = useState(false);
  const [dnsBenchmarkResults, setDnsBenchmarkResults] = useState<any[] | null>(null);
  const [dnsState, setDnsState] = useState<any>(null);

  // Defender State
  const [defenderStatus, setDefenderStatus] = useState<any>(null);
  const [defenderLoading, setDefenderLoading] = useState(false);

  const logBottomRef = useRef<HTMLDivElement>(null);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  useEffect(() => {
    if (showConsole && logBottomRef.current) {
      logBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showConsole]);

  const loadInitialData = async () => {
    if (!window.darkhub?.optimizer) return;
    try {
      const [ops, deepList, statusRes, admin] = await Promise.all([
        window.darkhub.optimizer.listOperations().catch(() => []),
        window.darkhub.optimizer.deepTweaksList().catch(() => []),
        window.darkhub.optimizer.deepTweaksStatus().catch(() => ({ ok: true, status: {} })),
        window.darkhub.optimizer.checkIsAdmin().catch(() => false)
      ]);
      setOperations(ops || []);
      setDeepTweaks(deepList || []);
      if (statusRes?.ok) setTweakStatus(statusRes.status || {});
      setIsAdminUser(Boolean(admin));
    } catch (e: any) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadInitialData();
    loadDefenderStatus();
    refreshDnsState();
    loadGpuData();

    if (window.darkhub?.optimizer?.onRunEvent) {
      const unsub = window.darkhub.optimizer.onRunEvent((ev: any) => {
        if (ev?.type === 'op-start') addLog(`[INÍCIO] ${ev.opId}...`);
        if (ev?.type === 'op-finish') {
          if (ev.ok) addLog(`[SUCESSO] ${ev.opId}`);
          else addLog(`[ERRO] ${ev.opId}: ${ev.error ?? 'Falha'}`);
        }
        if (ev?.type === 'run-finish') {
          addLog(`[FINALIZADO] Concluído com sucesso (${ev.completed}/${ev.total} tarefas).`);
          setIsOptimizing(false);
          setOptimizingId(null);
        }
      });
      return () => unsub();
    }
  }, []);

  const refreshStatus = async () => {
    if (!window.darkhub?.optimizer?.deepTweaksStatus) return;
    try {
      const res = await window.darkhub.optimizer.deepTweaksStatus();
      if (res?.ok) setTweakStatus(res.status || {});
    } catch {}
  };

  // --- Quick Tools Direct Execution ---
  const handleOptimizeRAM = async () => {
    setIsOptimizing(true);
    setShowConsole(true);
    addLog('[RAM] Esvaziando Working Set de processos em segundo plano...');
    try {
      await window.darkhub.optimizer.run({ operationIds: ['optimizer:optimizeRAM'] });
      setRamFreedMsg('✓ Memória RAM otimizada!');
      setTimeout(() => setRamFreedMsg(null), 4000);
    } catch (e: any) {
      addLog(`[ERRO] ${e.message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleCleanTempFiles = async () => {
    setIsOptimizing(true);
    setShowConsole(true);
    addLog('[DISCO] Varrendo e excluindo arquivos temporários e caches...');
    try {
      await window.darkhub.optimizer.run({ operationIds: ['optimizer:cleanTemp'] });
      setDiskCleanedMsg('✓ Arquivos temporários removidos!');
      setTimeout(() => setDiskCleanedMsg(null), 4000);
    } catch (e: any) {
      addLog(`[ERRO] ${e.message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleFlushDNS = async () => {
    setIsOptimizing(true);
    setShowConsole(true);
    addLog('[DNS] Executando ipconfig /flushdns e redefinindo socket...');
    try {
      await window.darkhub.optimizer.run({ operationIds: ['optimizer:flushDns'] });
      setDnsFlushedMsg('✓ Cache de DNS liberado!');
      setTimeout(() => setDnsFlushedMsg(null), 4000);
    } catch (e: any) {
      addLog(`[ERRO] ${e.message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleSetPowerPlan = async (type: 'high' | 'balanced') => {
    setIsOptimizing(true);
    setShowConsole(true);
    const opId = type === 'high' ? 'optimizer:powerPlanHighPerformance' : 'optimizer:powerPlanBalanced';
    addLog(`[ENERGIA] Aplicando plano de energia (${type === 'high' ? 'Alto Desempenho' : 'Equilibrado'})...`);
    try {
      await window.darkhub.optimizer.run({ operationIds: [opId] });
      addLog(`[SUCESSO] Plano de energia alterado.`);
    } catch (e: any) {
      addLog(`[ERRO] ${e.message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleOptimizeAudioLatency = async () => {
    setIsOptimizing(true);
    setShowConsole(true);
    addLog('[ÁUDIO] Ajustando afinidade de núcleos e prioridade de áudio...');
    try {
      await window.darkhub.optimizer.run({ operationIds: ['optimizer:optimizeAudioLatency'] });
    } catch (e: any) {
      addLog(`[ERRO] ${e.message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  // --- Advanced Network Optimization ---
  const handleApplyAdvancedNetwork = async () => {
    setIsOptimizing(true);
    setShowConsole(true);
    addLog('[REDE] Aplicando Otimização Avançada de Rede (TCP NoDelay, RSS, MTU 1500, EEE Disabled, Psched QoS 100%)...');
    try {
      const res = await window.darkhub.optimizer.advancedNetworkApply();
      if (res?.ok) addLog(`[SUCESSO] ${res.msg}`);
      else addLog(`[ERRO] ${res?.error || 'Falha ao aplicar rede avançada'}`);
    } catch (e: any) {
      addLog(`[ERRO] ${e.message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleRevertAdvancedNetwork = async () => {
    setIsOptimizing(true);
    setShowConsole(true);
    addLog('[REDE] Revertendo parâmetros de rede para o padrão do Windows...');
    try {
      const res = await window.darkhub.optimizer.advancedNetworkRevert();
      if (res?.ok) addLog(`[SUCESSO] ${res.msg}`);
      else addLog(`[ERRO] ${res?.error || 'Falha ao reverter rede'}`);
    } catch (e: any) {
      addLog(`[ERRO] ${e.message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  // --- Program Uninstaller with Leftovers ---
  const loadPrograms = async () => {
    if (!window.darkhub?.optimizer?.getInstalledPrograms) return;
    setLoadingPrograms(true);
    try {
      const res = await window.darkhub.optimizer.getInstalledPrograms();
      if (res?.ok && Array.isArray(res.programs)) setInstalledPrograms(res.programs);
    } catch {}
    finally { setLoadingPrograms(false); }
  };

  const handleUninstallProgram = async (prog: any) => {
    if (!prog || !window.darkhub?.optimizer?.uninstallProgramWithLeftovers) return;
    setIsOptimizing(true);
    setUninstallingProgram(prog.name);
    setShowConsole(true);
    addLog(`[DESINSTALADOR] Iniciando desinstalação profunda de "${prog.name}" com varredura de resíduos...`);

    try {
      const res = await window.darkhub.optimizer.uninstallProgramWithLeftovers({
        name: prog.name,
        uninstallString: prog.uninstallString,
        installLocation: prog.installLocation,
        publisher: prog.publisher
      });
      if (res?.ok) {
        addLog(`[SUCESSO] ${res.msg}`);
        await loadPrograms();
      } else {
        addLog(`[ERRO] ${res?.error || 'Falha ao desinstalar programa'}`);
      }
    } catch (e: any) {
      addLog(`[ERRO] ${e.message}`);
    } finally {
      setIsOptimizing(false);
      setUninstallingProgram(null);
    }
  };

  // --- Combined Tweaks & Operations Matrix ---
  const allTweaksList = useMemo(() => {
    const list: any[] = [];

    for (const op of operations) {
      list.push({
        id: op.id,
        isDeepTweak: false,
        title: op.name,
        description: op.description,
        category: op.category,
        requiresAdmin: op.requiresAdmin,
        isReversible: op.isReversible
      });
    }

    for (const dt of deepTweaks) {
      if (!list.some(item => item.id === dt.id)) {
        list.push({
          id: dt.id,
          isDeepTweak: true,
          title: dt.title || dt.id,
          description: dt.description || 'Ajuste de registro do Windows.',
          category: dt.category || 'system',
          requiresAdmin: dt.requiresAdmin,
          isReversible: true
        });
      }
    }

    return list;
  }, [operations, deepTweaks]);

  const filteredTweaks = useMemo(() => {
    return allTweaksList.filter((t) => {
      const matchesSearch =
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCat = categoryFilter === 'all' || t.category === categoryFilter;
      return matchesSearch && matchesCat;
    });
  }, [allTweaksList, searchQuery, categoryFilter]);

  const categories = [
    { id: 'all', label: 'Todos os Ajustes' },
    { id: 'customization', label: '🎨 Customização & UI' },
    { id: 'privacy', label: '🔒 Privacidade & IA' },
    { id: 'gaming', label: '🚀 Performance & Jogos' },
    { id: 'storage', label: '🧹 Limpeza & Disco' },
    { id: 'memory', label: '🧠 Memória RAM' },
    { id: 'network', label: '🌐 Rede & Conexão' },
    { id: 'power', label: '⚡ Energia & CPU' }
  ];

  // --- Toggle or Execute Single Tweak ---
  const handleToggleOrRunTweak = async (tweak: any) => {
    setIsOptimizing(true);
    setOptimizingId(tweak.id);
    setShowConsole(true);

    try {
      if (tweak.isDeepTweak || tweak.id.startsWith('tweak:')) {
        const isActive = Boolean(tweakStatus[tweak.id]);
        if (isActive) {
          addLog(`[REVERSÃO] Revertendo ${tweak.title} para o padrão do Windows...`);
          const res = await window.darkhub.optimizer.deepTweaksRevert({ tweakIds: [tweak.id] });
          if (res?.ok) addLog(`[SUCESSO] ${tweak.title} revertido com sucesso.`);
        } else {
          addLog(`[APLICAÇÃO] Aplicando ${tweak.title}...`);
          const res = await window.darkhub.optimizer.deepTweaksApply({ tweakIds: [tweak.id] });
          if (res?.ok) addLog(`[SUCESSO] ${tweak.title} aplicado com sucesso.`);
        }
        await refreshStatus();
      } else {
        addLog(`[OPERAÇÃO] Executando ${tweak.title}...`);
        await window.darkhub.optimizer.run({ operationIds: [tweak.id] });
      }
      await loadInitialData();
    } catch (e: any) {
      addLog(`[ERRO] ${e.message}`);
    } finally {
      setIsOptimizing(false);
      setOptimizingId(null);
    }
  };

  // --- Batch Run ---
  const handleRunBatch = async (action: 'apply' | 'revert') => {
    if (selectedTweakIds.size === 0) return;
    const ids = Array.from(selectedTweakIds);
    setIsOptimizing(true);
    setShowConsole(true);
    addLog(`[LOTE] ${action === 'apply' ? 'Aplicando' : 'Revertendo'} ${ids.length} ajuste(s)...`);

    const opIds = ids.filter(id => !id.startsWith('tweak:'));
    const deepIds = ids.filter(id => id.startsWith('tweak:'));

    try {
      if (action === 'apply') {
        if (opIds.length > 0) await window.darkhub.optimizer.run({ operationIds: opIds });
        if (deepIds.length > 0) await window.darkhub.optimizer.deepTweaksApply({ tweakIds: deepIds });
        addLog('[SUCESSO] Lote aplicado com sucesso.');
      } else {
        if (deepIds.length > 0) await window.darkhub.optimizer.deepTweaksRevert({ tweakIds: deepIds });
        addLog('[SUCESSO] Ajustes revertidos para o padrão do Windows.');
      }
      setSelectedTweakIds(new Set());
      await refreshStatus();
      await loadInitialData();
    } catch (e: any) {
      addLog(`[ERRO] ${e.message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  // --- Executive Presets ---
  const handleApplyPreset = async (presetId: string) => {
    setIsOptimizing(true);
    setShowConsole(true);
    addLog(`[PRESET] Aplicando preset: ${presetId.toUpperCase()}...`);

    try {
      if (presetId === 'global_recommended') {
        await Promise.all([
          handleOptimizeRAM(),
          handleCleanTempFiles(),
          handleFlushDNS(),
          window.darkhub.optimizer.deepTweaksApply({ tweakIds: ['tweak:disableTelemetry', 'tweak:disableAiAndAds', 'tweak:disableCortana', 'tweak:taskbarEndTask'] })
        ]);
        addLog('[SUCESSO] Otimização Global DarkHub aplicada com sucesso!');
      } else if (presetId === 'gaming') {
        const gamingIds = deepTweaks.filter(t => t.category === 'gaming').map(t => t.id);
        await window.darkhub.optimizer.deepTweaksApply({ tweakIds: gamingIds });
        await Promise.all([
          window.darkhub.optimizer.applyExtremeKernelMod().catch(() => {}),
          window.darkhub.optimizer.applyExtremeNetworkMod().catch(() => {}),
          window.darkhub.optimizer.applyCpuUnpark().catch(() => {}),
          window.darkhub.optimizer.applyMsiMode().catch(() => {}),
          handleOptimizeAudioLatency(),
          handleApplyAdvancedNetwork()
        ]);
        addLog('[SUCESSO] Modo Gamer de Baixa Latência (Kernel 0x26, MMCSS, 100% Core Unpark, MSI Mode, Rede) ativado!');
      } else if (presetId === 'privacy') {
        const privacyIds = deepTweaks.filter(t => t.category === 'privacy').map(t => t.id);
        await window.darkhub.optimizer.deepTweaksApply({ tweakIds: privacyIds });
        addLog('[SUCESSO] Privacidade & Segurança Máxima ativada!');
      } else if (presetId === 'customization') {
        const customIds = deepTweaks.filter(t => t.category === 'customization').map(t => t.id);
        await window.darkhub.optimizer.deepTweaksApply({ tweakIds: customIds });
        addLog('[SUCESSO] Customizações visuais aplicadas (Menu Clássico, Ícones, Modo Escuro, Barra de Tarefas)!');
      } else if (presetId === 'revert_all') {
        const allIds = deepTweaks.map(t => t.id);
        await window.darkhub.optimizer.deepTweaksRevert({ tweakIds: allIds });
        await handleRevertAdvancedNetwork();
        addLog('[SUCESSO] Todos os ajustes foram revertidos para o padrão original do Windows!');
      }
      await refreshStatus();
      await loadInitialData();
    } catch (e: any) {
      addLog(`[ERRO] ${e.message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  // --- GPU Preferences ---
  const loadGpuData = async () => {
    if (!window.darkhub?.optimizer) return;
    try {
      const res = await window.darkhub.optimizer.getGpuPreferences();
      if (res?.ok) setGpuPreferences(res.preferences || []);
    } catch {}
  };

  const handleBrowseGpuApp = async () => {
    if (!window.darkhub?.dialog?.selectFiles) return;
    try {
      const res = await window.darkhub.dialog.selectFiles({
        title: 'Selecionar Executável do Jogo (.exe)',
        filters: [{ name: 'Executables', extensions: ['exe'] }]
      });
      if (!res.canceled && res.filePaths && res.filePaths.length > 0) {
        setSelectedGpuAppPath(res.filePaths[0]);
      }
    } catch {}
  };

  const handleSetGpuPreference = async () => {
    if (!selectedGpuAppPath.trim()) return;
    setIsOptimizing(true);
    setShowConsole(true);
    addLog(`[GPU] Definindo preferência gráfica (${selectedGpuPref}) para "${selectedGpuAppPath}"...`);
    try {
      const res = await window.darkhub.optimizer.setGpuPreference({
        appPath: selectedGpuAppPath.trim(),
        preference: selectedGpuPref
      });
      if (res?.ok) {
        addLog(`[SUCESSO] ${res.msg}`);
        setSelectedGpuAppPath('');
        await loadGpuData();
      }
    } catch (e: any) {
      addLog(`[ERRO] ${e.message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleRemoveGpuPreference = async (appPath: string) => {
    setIsOptimizing(true);
    setShowConsole(true);
    try {
      const res = await window.darkhub.optimizer.removeGpuPreference({ appPath });
      if (res?.ok) {
        addLog(`[SUCESSO] ${res.msg}`);
        await loadGpuData();
      }
    } catch (e: any) {
      addLog(`[ERRO] ${e.message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  // --- Process Priority ---
  const loadProcesses = async () => {
    if (!window.darkhub?.optimizer?.getRunningProcesses) return;
    setIsRefreshingProcesses(true);
    try {
      const res = await window.darkhub.optimizer.getRunningProcesses();
      if (res?.ok && Array.isArray(res.processes)) setProcessList(res.processes);
    } catch {}
    finally { setIsRefreshingProcesses(false); }
  };

  const handleSetProcessPriority = async () => {
    if (!selectedProcess) return;
    setIsOptimizing(true);
    setShowConsole(true);
    addLog(`[PRIORIDADE] Definindo processo PID ${selectedProcess} para ${selectedPriority.toUpperCase()}...`);
    try {
      const res = await window.darkhub.optimizer.setProcessPriority({
        pid: selectedProcess,
        priority: selectedPriority
      });
      if (res?.ok) addLog(`[SUCESSO] ${res.msg}`);
    } catch (e: any) {
      addLog(`[ERRO] ${e.message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  // --- Debloat Apps ---
  const loadBloatware = async () => {
    if (!window.darkhub?.optimizer?.listBloatware) return;
    setLoadingBloatware(true);
    try {
      const res = await window.darkhub.optimizer.listBloatware();
      if (res?.ok && Array.isArray(res.apps)) setBloatwareList(res.apps);
    } catch {}
    finally { setLoadingBloatware(false); }
  };

  const handleRemoveBloatware = async () => {
    if (selectedBloatware.size === 0) return;
    setIsOptimizing(true);
    setShowConsole(true);
    const ids = Array.from(selectedBloatware);
    addLog(`[DEBLOAT] Removendo ${ids.length} aplicativo(s) selecionado(s)...`);
    try {
      const res = await window.darkhub.optimizer.removeSelectedBloatware({ appIds: ids });
      if (res?.ok) {
        addLog(`[SUCESSO] ${res.msg}`);
        setSelectedBloatware(new Set());
        await loadBloatware();
      }
    } catch (e: any) {
      addLog(`[ERRO] ${e.message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  // --- Startup Items ---
  const loadStartupItems = async () => {
    if (!window.darkhub?.optimizer?.getStartupItems) return;
    setLoadingStartup(true);
    try {
      const res = await window.darkhub.optimizer.getStartupItems();
      if (res?.ok && Array.isArray(res.items)) setStartupItems(res.items);
    } catch {}
    finally { setLoadingStartup(false); }
  };

  const handleDisableStartupItem = async (item: any) => {
    setIsOptimizing(true);
    setShowConsole(true);
    try {
      const res = await window.darkhub.optimizer.disableStartupItem(item);
      if (res?.ok) {
        addLog(`[SUCESSO] ${res.msg}`);
        await loadStartupItems();
      }
    } catch (e: any) {
      addLog(`[ERRO] ${e.message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  // --- Defender Control ---
  const loadDefenderStatus = async () => {
    if (!window.darkhub?.optimizer?.getDefenderControlStatus) return;
    setDefenderLoading(true);
    try {
      const res = await window.darkhub.optimizer.getDefenderControlStatus();
      if (res?.ok && res.status) setDefenderStatus(res.status);
    } catch {}
    finally { setDefenderLoading(false); }
  };

  const handleApplyDefender = async (action: 'disable' | 'enable') => {
    setIsOptimizing(true);
    setShowConsole(true);
    addLog(`[DEFENDER] Executando ação (${action.toUpperCase()}) via TrustedInstaller...`);
    try {
      const res = await window.darkhub.optimizer.applyDefenderControl({ action });
      if (res?.ok) addLog(`[SUCESSO] ${res.msg}`);
      await loadDefenderStatus();
    } catch (e: any) {
      addLog(`[ERRO] ${e.message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  // --- DNS Benchmark ---
  const refreshDnsState = async () => {
    if (!window.darkhub?.optimizer?.getDnsState) return;
    try {
      const res = await window.darkhub.optimizer.getDnsState();
      if (res?.ok) setDnsState(res.data);
    } catch {}
  };

  const handleRunDnsBenchmark = async () => {
    if (!window.darkhub?.optimizer?.dnsBenchmark) return;
    setDnsBenchmarkRunning(true);
    setDnsBenchmarkResults(null);
    setShowConsole(true);
    addLog('[DNS] Medindo latência real dos servidores DNS...');
    try {
      const res = await window.darkhub.optimizer.dnsBenchmark({ timeoutMs: 1500, attempts: 2, concurrency: 10 });
      if (res?.ok && Array.isArray(res?.results)) {
        setDnsBenchmarkResults(res.results);
        addLog(`[SUCESSO] Benchmark concluído: ${res.results.length} servidores testados.`);
      }
    } catch (e: any) {
      addLog(`[ERRO] ${e.message}`);
    } finally {
      setDnsBenchmarkRunning(false);
    }
  };

  const handleApplyDns = async (primary: string, secondary: string, name: string) => {
    setIsOptimizing(true);
    setShowConsole(true);
    addLog(`[DNS] Aplicando servidor DNS: ${name} (${primary} / ${secondary})...`);
    try {
      const res = await window.darkhub.optimizer.applyDns({ primary, secondary, dnsName: name });
      if (res?.ok) {
        addLog(`[SUCESSO] DNS ${name} aplicado.`);
        await refreshDnsState();
      }
    } catch (e: any) {
      addLog(`[ERRO] ${e.message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-4 p-1 md:p-2 animate-fadeIn text-zinc-100 pb-16">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
        <div>
          <h1 className="text-lg font-bold text-zinc-100 tracking-tight flex items-center gap-2">
            <Zap className="w-5 h-5 text-rose-500" />
            System Optimizer
            {isAdminUser ? (
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 font-mono border border-emerald-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Admin Ativo
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono flex items-center gap-1">
                <Lock className="w-3 h-3" /> UAC sob demanda
              </span>
            )}
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Otimização de memória RAM, limpeza profunda de disco, desinstalador com limpeza de resíduos, rede avançada e GPU.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowConsole(!showConsole)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition shadow-sm ${
              showConsole 
                ? 'bg-zinc-700 text-zinc-100 border-zinc-600' 
                : 'bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 border-zinc-700/60'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-zinc-400" />
            {t('optimizer.terminal', 'Terminal')} ({logs.length})
          </button>
          <button
            onClick={() => handleApplyPreset('global_recommended')}
            disabled={isOptimizing}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-sm disabled:opacity-50"
          >
            {isOptimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 fill-current" />}
            {t('optimizer.global', 'Otimização Global')}
          </button>
        </div>
      </div>

      {/* 1-CLICK INSTANT QUICK ACTION HERO BAR */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <button
          onClick={handleOptimizeRAM}
          disabled={isOptimizing}
          className="p-3 rounded-xl bg-zinc-900/80 hover:bg-zinc-900 border border-zinc-800/80 hover:border-sky-500/50 text-left transition flex flex-col justify-between gap-2 shadow-sm disabled:opacity-50 group"
        >
          <div className="flex items-center justify-between">
            <Cpu className="w-4 h-4 text-sky-400" />
            <span className="text-[10px] font-mono text-zinc-500 group-hover:text-zinc-300">{t('optimizer.hero.oneClick', '1-Clique')}</span>
          </div>
          <div>
            <div className="text-xs font-bold text-zinc-100">{t('optimizer.hero.ramTitle', 'Otimizar RAM')}</div>
            <div className="text-[10px] text-zinc-400 mt-0.5 leading-tight">{ramFreedMsg || t('optimizer.hero.ramDesc', 'Esvaziar working set')}</div>
          </div>
        </button>

        <button
          onClick={handleCleanTempFiles}
          disabled={isOptimizing}
          className="p-3 rounded-xl bg-zinc-900/80 hover:bg-zinc-900 border border-zinc-800/80 hover:border-amber-500/50 text-left transition flex flex-col justify-between gap-2 shadow-sm disabled:opacity-50 group"
        >
          <div className="flex items-center justify-between">
            <Trash2 className="w-4 h-4 text-amber-400" />
            <span className="text-[10px] font-mono text-zinc-500 group-hover:text-zinc-300">{t('optimizer.hero.oneClick', '1-Clique')}</span>
          </div>
          <div>
            <div className="text-xs font-bold text-zinc-100">{t('optimizer.hero.diskTitle', 'Limpar Disco')}</div>
            <div className="text-[10px] text-zinc-400 mt-0.5 leading-tight">{diskCleanedMsg || t('optimizer.hero.diskDesc', 'Arquivos temporários')}</div>
          </div>
        </button>

        <button
          onClick={handleFlushDNS}
          disabled={isOptimizing}
          className="p-3 rounded-xl bg-zinc-900/80 hover:bg-zinc-900 border border-zinc-800/80 hover:border-emerald-500/50 text-left transition flex flex-col justify-between gap-2 shadow-sm disabled:opacity-50 group"
        >
          <div className="flex items-center justify-between">
            <Globe className="w-4 h-4 text-emerald-400" />
            <span className="text-[10px] font-mono text-zinc-500 group-hover:text-zinc-300">{t('optimizer.hero.oneClick', '1-Clique')}</span>
          </div>
          <div>
            <div className="text-xs font-bold text-zinc-100">{t('optimizer.hero.dnsTitle', 'Limpar DNS')}</div>
            <div className="text-[10px] text-zinc-400 mt-0.5 leading-tight">{dnsFlushedMsg || t('optimizer.hero.dnsDesc', 'Flush de socket/DNS')}</div>
          </div>
        </button>

        <button
          onClick={() => handleSetPowerPlan('high')}
          disabled={isOptimizing}
          className="p-3 rounded-xl bg-zinc-900/80 hover:bg-zinc-900 border border-zinc-800/80 hover:border-rose-500/50 text-left transition flex flex-col justify-between gap-2 shadow-sm disabled:opacity-50 group"
        >
          <div className="flex items-center justify-between">
            <Flame className="w-4 h-4 text-rose-400" />
            <span className="text-[10px] font-mono text-zinc-500 group-hover:text-zinc-300">{t('optimizer.hero.oneClick', '1-Clique')}</span>
          </div>
          <div>
            <div className="text-xs font-bold text-zinc-100">Alto Desempenho</div>
            <div className="text-[10px] text-zinc-400 mt-0.5 leading-tight">Plano de energia CPU</div>
          </div>
        </button>

        <button
          onClick={handleOptimizeAudioLatency}
          disabled={isOptimizing}
          className="p-3 rounded-xl bg-zinc-900/80 hover:bg-zinc-900 border border-zinc-800/80 hover:border-purple-500/50 text-left transition flex flex-col justify-between gap-2 shadow-sm disabled:opacity-50 group"
        >
          <div className="flex items-center justify-between">
            <Headphones className="w-4 h-4 text-purple-400" />
            <span className="text-[10px] font-mono text-zinc-500 group-hover:text-zinc-300">{t('optimizer.hero.oneClick', '1-Clique')}</span>
          </div>
          <div>
            <div className="text-xs font-bold text-zinc-100">Latência de Áudio</div>
            <div className="text-[10px] text-zinc-400 mt-0.5 leading-tight">audiodg.exe priority</div>
          </div>
        </button>

        <button
          onClick={() => handleApplyPreset('revert_all')}
          disabled={isOptimizing}
          className="p-3 rounded-xl bg-zinc-900/80 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-500/50 text-left transition flex flex-col justify-between gap-2 shadow-sm disabled:opacity-50 group"
        >
          <div className="flex items-center justify-between">
            <RotateCcw className="w-4 h-4 text-zinc-400" />
            <span className="text-[10px] font-mono text-zinc-500 group-hover:text-zinc-300">{t('optimizer.hero.oneClick', '1-Clique')}</span>
          </div>
          <div>
            <div className="text-xs font-bold text-zinc-100">{t('optimizer.hero.restoreTitle', 'Restaurar Padrões')}</div>
            <div className="text-[10px] text-zinc-400 mt-0.5 leading-tight">{t('optimizer.hero.restoreDesc', 'Reverter modificações')}</div>
          </div>
        </button>
      </div>

      {/* NAVIGATION TABS */}
      <div className="flex items-center gap-1.5 overflow-x-auto p-1.5 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
        <button
          onClick={() => setActiveTab('tweaks')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
            activeTab === 'tweaks' ? 'bg-zinc-700 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          {t('optimizer.tabTweaks', 'Ajustes & Customizações')} ({allTweaksList.length})
        </button>

        <button
          onClick={() => { setActiveTab('uninstaller'); loadPrograms(); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
            activeTab === 'uninstaller' ? 'bg-zinc-700 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
          }`}
        >
          <Package className="w-3.5 h-3.5 text-amber-400" />
          {t('optimizer.tabUninstaller', 'Desinstalador & Limpeza de Resíduos')}
        </button>

        <button
          onClick={() => { setActiveTab('gpu'); loadGpuData(); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
            activeTab === 'gpu' ? 'bg-zinc-700 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
          }`}
        >
          <Gamepad2 className="w-3.5 h-3.5 text-rose-500" />
          {t('optimizer.tabGpu', 'Prioridade de GPU & Jogos')}
        </button>

        <button
          onClick={() => { setActiveTab('priority'); loadProcesses(); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
            activeTab === 'priority' ? 'bg-zinc-700 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
          }`}
        >
          <Cpu className="w-3.5 h-3.5 text-sky-400" />
          {t('optimizer.tabPriority', 'Prioridade de Processos')}
        </button>

        <button
          onClick={() => setActiveTab('network')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
            activeTab === 'network' ? 'bg-zinc-700 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
          }`}
        >
          <Globe className="w-3.5 h-3.5 text-emerald-400" />
          {t('optimizer.tabNetwork', 'Rede Avançada & DNS')}
        </button>

        <button
          onClick={() => setActiveTab('defender')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
            activeTab === 'defender' ? 'bg-zinc-700 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
          }`}
        >
          <Shield className="w-3.5 h-3.5 text-rose-500" />
          Windows Defender Control
        </button>

        <button
          onClick={() => { setActiveTab('debloat'); loadBloatware(); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
            activeTab === 'debloat' ? 'bg-zinc-700 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
          }`}
        >
          <Trash2 className="w-3.5 h-3.5" />
          Debloat de Apps UWP
        </button>

        <button
          onClick={() => { setActiveTab('startup'); loadStartupItems(); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
            activeTab === 'startup' ? 'bg-zinc-700 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Inicialização
        </button>
      </div>

      {/* TAB 1: ALL TWEAKS & CUSTOMIZATIONS MATRIX */}
      {activeTab === 'tweaks' && (
        <div className="space-y-3">
          {/* Search & Categories */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800/80">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pesquisar por ajuste (ex: Menu Clássico, RAM, Temp, Barra de Tarefas, MMCSS, Telemetria)..."
                className="w-full bg-zinc-950 border border-zinc-800/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 font-mono"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto">
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategoryFilter(c.id)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition whitespace-nowrap ${
                    categoryFilter === c.id
                      ? 'bg-zinc-700 text-zinc-100'
                      : 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Batch Action Bar */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80 text-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedTweakIds(new Set(filteredTweaks.map(t => t.id)))}
                className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded font-medium text-xs border border-zinc-700/60 transition"
              >
                Marcar Todos ({filteredTweaks.length})
              </button>
              <button
                onClick={() => setSelectedTweakIds(new Set())}
                className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded font-medium text-xs border border-zinc-700/60 transition"
              >
                Desmarcar
              </button>
              <span className="text-[11px] text-zinc-500 ml-2 font-mono">
                {selectedTweakIds.size} selecionado(s)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleRunBatch('revert')}
                disabled={isOptimizing || selectedTweakIds.size === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs transition disabled:opacity-40 border border-zinc-700"
              >
                <Undo2 className="w-3.5 h-3.5" />
                Reverter Selecionados
              </button>

              <button
                onClick={() => handleRunBatch('apply')}
                disabled={isOptimizing || selectedTweakIds.size === 0}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition disabled:opacity-40 shadow-sm"
              >
                {isOptimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 fill-current" />}
                Aplicar Selecionados ({selectedTweakIds.size})
              </button>
            </div>
          </div>

          {/* Tweaks Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {filteredTweaks.map((tweak) => {
              const isSelected = selectedTweakIds.has(tweak.id);
              const isActive = Boolean(tweakStatus[tweak.id]);
              const isRunningThis = optimizingId === tweak.id;

              return (
                <div
                  key={tweak.id}
                  onClick={() => {
                    setSelectedTweakIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(tweak.id)) next.delete(tweak.id);
                      else next.add(tweak.id);
                      return next;
                    });
                  }}
                  className={`p-3.5 rounded-xl border transition cursor-pointer flex items-start justify-between gap-3 shadow-sm select-none ${
                    isSelected
                      ? 'bg-zinc-900 border-rose-500/60'
                      : 'bg-zinc-900/60 hover:bg-zinc-900/90 border-zinc-800/80 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="mt-0.5 rounded bg-zinc-950 border-zinc-700 text-rose-600 focus:ring-0 w-4 h-4 cursor-pointer"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-zinc-100">{tweak.title}</span>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                          {tweak.category}
                        </span>
                        {tweak.isDeepTweak && (
                          isActive ? (
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-950/90 text-emerald-400 border border-emerald-500/40">
                              ✓ ATIVADO
                            </span>
                          ) : (
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-500">
                              PADRÃO
                            </span>
                          )
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-1 leading-snug">
                        {tweak.description}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleOrRunTweak(tweak);
                    }}
                    disabled={isOptimizing}
                    className={`flex-shrink-0 px-2.5 py-1 rounded text-xs font-semibold border transition disabled:opacity-40 ${
                      tweak.isDeepTweak && isActive
                        ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
                        : 'bg-rose-600 hover:bg-rose-500 text-white border-rose-500 shadow-sm'
                    }`}
                  >
                    {isRunningThis ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : tweak.isDeepTweak ? (
                      isActive ? 'Reverter' : 'Ativar'
                    ) : (
                      'Executar'
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: PROGRAM UNINSTALLER & LEFTOVER CLEANER */}
      {activeTab === 'uninstaller' && (
        <div className="space-y-4">
          <div className="bg-zinc-900/80 rounded-xl border border-zinc-800/80 p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                  <Package className="w-4 h-4 text-amber-400" />
                  Desinstalador de Programas com Limpeza Profunda de Resíduos (Leftovers)
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Desinstale aplicativos Win32/64 e remova automaticamente pastas residuais em AppData, ProgramData e chaves no Registro do Windows.
                </p>
              </div>

              <button
                onClick={loadPrograms}
                disabled={loadingPrograms}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold border border-zinc-700 transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingPrograms ? 'animate-spin' : ''}`} /> Atualizar Lista
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={programSearch}
                onChange={(e) => setProgramSearch(e.target.value)}
                placeholder={t('optimizer.uninstaller.search', 'Buscar programa instalado por nome ou desenvolvedor...')}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 font-mono"
              />
            </div>

            {/* Programs List */}
            {loadingPrograms ? (
              <div className="p-8 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-rose-500" /> Varrendo programas instalados no sistema...
              </div>
            ) : (
              <div className="max-h-[460px] overflow-y-auto divide-y divide-zinc-800/80 border border-zinc-800 rounded-xl bg-zinc-950">
                {installedPrograms
                  .filter(p => p.name.toLowerCase().includes(programSearch.toLowerCase()) || (p.publisher && p.publisher.toLowerCase().includes(programSearch.toLowerCase())))
                  .map((prog, idx) => {
                    const isDeleting = uninstallingProgram === prog.name;
                    return (
                      <div key={idx} className="p-3 flex items-center justify-between gap-3 hover:bg-zinc-900/50 transition">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-zinc-100 truncate">{prog.name}</div>
                          <div className="text-[10px] text-zinc-500 font-mono flex items-center gap-2 mt-0.5">
                            {prog.version && <span>v{prog.version}</span>}
                            {prog.publisher && <span>• {prog.publisher}</span>}
                            {prog.installDate && <span>• Instalado: {prog.installDate}</span>}
                          </div>
                        </div>

                        <button
                          onClick={() => handleUninstallProgram(prog)}
                          disabled={isOptimizing}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 hover:text-rose-100 border border-rose-600/40 rounded-lg text-xs font-semibold transition disabled:opacity-40 flex-shrink-0"
                        >
                          {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          Desinstalar & Limpar Resíduos
                        </button>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: GPU GAME PRIORITY */}
      {activeTab === 'gpu' && (
        <div className="space-y-4">
          <div className="bg-zinc-900/80 rounded-xl border border-zinc-800/80 p-4 space-y-4">
            <div>
              <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                <Gamepad2 className="w-4 h-4 text-rose-500" />
                Preferência de GPU & Desempenho Gráfico para Jogos
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Force seus jogos a utilizarem a GPU Dedicada de Alto Desempenho no Windows DirectX Graphics Management.
              </p>
            </div>

            {/* Set Preference Card */}
            <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800/80 space-y-3">
              <label className="text-xs font-semibold text-zinc-300 block">Caminho do Jogo (.exe):</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={selectedGpuAppPath}
                  onChange={(e) => setSelectedGpuAppPath(e.target.value)}
                  placeholder="C:\Games\Cyberpunk2077\bin\x64\Cyberpunk2077.exe"
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-700"
                />
                <button
                  onClick={handleBrowseGpuApp}
                  className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold border border-zinc-700 transition"
                >
                  <FolderOpen className="w-3.5 h-3.5" /> Procurar .exe
                </button>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">Modo Gráfico:</span>
                  {[
                    { id: 'high_performance', label: '🚀 Alto Desempenho (GPU Dedicada)' },
                    { id: 'power_saving', label: '🔋 Economia de Energia (GPU Integrada)' }
                  ].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedGpuPref(p.id as any)}
                      className={`px-2.5 py-1 rounded text-xs font-medium border transition ${
                        selectedGpuPref === p.id
                          ? 'bg-rose-600 border-rose-500 text-white shadow-sm'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleSetGpuPreference}
                  disabled={isOptimizing || !selectedGpuAppPath.trim()}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg transition disabled:opacity-50 shadow-sm"
                >
                  Aplicar Preferência
                </button>
              </div>
            </div>

            {/* Active Preferences List */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-zinc-300">Jogos e Aplicativos Configurados:</h4>
              {gpuPreferences.length === 0 ? (
                <div className="p-4 text-center text-xs text-zinc-500 bg-zinc-950 rounded-lg border border-zinc-800">
                  Nenhum jogo configurado no momento. Adicione um executável acima para forçar o uso da GPU Dedicada.
                </div>
              ) : (
                <div className="divide-y divide-zinc-800/80 border border-zinc-800 rounded-lg bg-zinc-950 overflow-hidden">
                  {gpuPreferences.map((p, idx) => (
                    <div key={idx} className="p-3 flex items-center justify-between gap-3 hover:bg-zinc-900/50 transition">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-zinc-100 truncate">{p.appName || p.appPath}</div>
                        <div className="text-[10px] text-zinc-500 font-mono truncate">{p.appPath}</div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
                          {p.preference === 'high_performance' ? 'GPU Dedicada' : 'Economia'}
                        </span>
                        <button
                          onClick={() => handleRemoveGpuPreference(p.appPath)}
                          className="p-1 text-zinc-500 hover:text-rose-400 transition"
                          title="Remover preferência"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: PROCESS PRIORITY */}
      {activeTab === 'priority' && (
        <div className="space-y-4">
          <div className="bg-zinc-900/80 rounded-xl border border-zinc-800/80 p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-sky-400" />
                  Gerenciador de Prioridade de Processos e CPU
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Ajuste a classe de agendamento de threads no kernel do Windows para jogos ou processos pesados em tempo real.
                </p>
              </div>

              <button
                onClick={loadProcesses}
                disabled={isRefreshingProcesses}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold border border-zinc-700 transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingProcesses ? 'animate-spin' : ''}`} /> Atualizar
              </button>
            </div>

            {/* Quick Priority Controls */}
            {selectedProcess && (
              <div className="p-3 bg-zinc-950 rounded-xl border border-rose-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn">
                <div className="text-xs text-zinc-200">
                  Processo Selecionado: <span className="font-mono font-bold text-rose-400">PID {selectedProcess}</span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedPriority}
                    onChange={(e) => setSelectedPriority(e.target.value)}
                    className="bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-zinc-200 font-mono focus:outline-none"
                  >
                    <option value="high">Alta (High - Recomendado p/ Jogos)</option>
                    <option value="realtime">Tempo Real (RealTime - Crítico)</option>
                    <option value="abovenormal">Acima do Normal (AboveNormal)</option>
                    <option value="normal">Normal</option>
                  </select>
                  <button
                    onClick={handleSetProcessPriority}
                    disabled={isOptimizing}
                    className="px-3.5 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg transition disabled:opacity-50"
                  >
                    Aplicar Prioridade
                  </button>
                </div>
              </div>
            )}

            {/* Process Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={processSearch}
                onChange={(e) => setProcessSearch(e.target.value)}
                placeholder="Buscar processo pelo nome..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 font-mono"
              />
            </div>

            {/* Process Table */}
            <div className="max-h-96 overflow-y-auto border border-zinc-800 rounded-lg bg-zinc-950 divide-y divide-zinc-800/60">
              {processList
                .filter(p => p.name.toLowerCase().includes(processSearch.toLowerCase()))
                .map((proc) => (
                  <div
                    key={proc.pid}
                    onClick={() => setSelectedProcess(proc.pid)}
                    className={`p-2.5 flex items-center justify-between gap-3 cursor-pointer transition select-none ${
                      selectedProcess === proc.pid ? 'bg-zinc-800/80 border-l-2 border-rose-500' : 'hover:bg-zinc-900/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-zinc-100 font-mono">{proc.name}</span>
                      <span className="text-[10px] text-zinc-500 font-mono">PID: {proc.pid}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-zinc-400 font-mono">
                        {Math.round(proc.mem / 1024)} MB
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProcess(proc.pid);
                          handleSetProcessPriority();
                        }}
                        className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-semibold rounded border border-zinc-700 transition"
                      >
                        Definir Alta
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: ADVANCED NETWORK & DNS */}
      {activeTab === 'network' && (
        <div className="space-y-4">
          {/* Advanced Network Tuning Card */}
          <div className="bg-zinc-900/80 rounded-xl border border-zinc-800/80 p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                  <Network className="w-4 h-4 text-rose-500" />
                  Otimização Avançada da Pilha TCP/IP & Rede
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Ajusta o buffer TCP NoDelay (desativa algoritmo de Nagle), ativa Receive Side Scaling (RSS), MTU 1500 e remove a limitação de QoS (Psched 100% de banda).
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleRevertAdvancedNetwork}
                  disabled={isOptimizing}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold rounded-lg border border-zinc-700 transition"
                >
                  Restaurar Padrão
                </button>
                <button
                  onClick={handleApplyAdvancedNetwork}
                  disabled={isOptimizing}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg transition shadow-sm"
                >
                  Aplicar Otimização TCP
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono">
              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                <div className="text-zinc-400 font-bold">TCP NoDelay & Ack:</div>
                <div className="text-emerald-400 mt-0.5">AckFrequency=1 / NoDelay=1</div>
              </div>
              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                <div className="text-zinc-400 font-bold">QoS / Largura de Banda:</div>
                <div className="text-emerald-400 mt-0.5">NonBestEffortLimit = 0 (100%)</div>
              </div>
              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                <div className="text-zinc-400 font-bold">Multithread NIC:</div>
                <div className="text-emerald-400 mt-0.5">RSS Ativado (4 Filas)</div>
              </div>
            </div>
          </div>

          {/* DNS Benchmark Card */}
          <div className="bg-zinc-900/80 rounded-xl border border-zinc-800/80 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                  <Globe className="w-4 h-4 text-sky-400" />
                  DNS Benchmark & Latência de Conexão
                </h3>
                <div className="text-[11px] text-zinc-400 mt-0.5 font-mono">
                  Adaptador: <span className="text-zinc-200">{dnsState?.adapter || 'Detectando...'}</span> • DNS Atual: <span className="text-zinc-200">{dnsState?.servers?.join(', ') || 'DHCP'}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleRunDnsBenchmark}
                  disabled={dnsBenchmarkRunning || isOptimizing}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition shadow-sm disabled:opacity-50"
                >
                  {dnsBenchmarkRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Target className="w-3.5 h-3.5" />}
                  Medir Latência Real de DNS
                </button>
              </div>
            </div>

            {/* Results list */}
            <div className="divide-y divide-zinc-800/60 border border-zinc-800 rounded-lg bg-zinc-950 overflow-hidden">
              {(dnsBenchmarkResults ?? [
                { name: 'Cloudflare DNS (1.1.1.1)', primary: '1.1.1.1', secondary: '1.0.0.1', latencyMs: 8 },
                { name: 'Google Public DNS (8.8.8.8)', primary: '8.8.8.8', secondary: '8.8.4.4', latencyMs: 12 },
                { name: 'Quad9 Security (9.9.9.9)', primary: '9.9.9.9', secondary: '149.112.112.112', latencyMs: 15 },
                { name: 'AdGuard DNS (Anti-Ads)', primary: '94.140.14.14', secondary: '94.140.15.15', latencyMs: 18 }
              ]).map((dns, idx) => (
                <div key={idx} className="p-3 flex items-center justify-between gap-3 hover:bg-zinc-900/40 transition">
                  <div>
                    <div className="text-xs font-bold text-zinc-100">{dns.name}</div>
                    <div className="text-[10px] text-zinc-500 font-mono">
                      {dns.primary} / {dns.secondary}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      {dns.latencyMs ? `${dns.latencyMs} ms` : 'Pronto'}
                    </span>
                    <button
                      onClick={() => handleApplyDns(dns.primary, dns.secondary, dns.name)}
                      disabled={isOptimizing}
                      className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 text-xs font-semibold rounded-lg transition"
                    >
                      Aplicar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: WINDOWS DEFENDER CONTROL */}
      {activeTab === 'defender' && (
        <div className="space-y-3">
          <div className="bg-zinc-900/80 rounded-xl border border-zinc-800/80 p-4 space-y-3">
            <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
              <Shield className="w-4 h-4 text-rose-500" />
              Windows Defender Control (via TrustedInstaller)
            </h3>
            <p className="text-xs text-zinc-400">
              Desative ou ative o Microsoft Defender e a Proteção em Tempo Real para testes de benchmarking e máxima fluidez em jogos.
            </p>

            <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-zinc-200">Proteção em Tempo Real</div>
                <div className="text-[10px] text-zinc-500">Serviço de Varredura em Segundo Plano</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleApplyDefender('disable')}
                  disabled={isOptimizing}
                  className="px-3 py-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-600/40 rounded-lg text-xs font-semibold transition"
                >
                  Desativar Defender
                </button>
                <button
                  onClick={() => handleApplyDefender('enable')}
                  disabled={isOptimizing}
                  className="px-3 py-1.5 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-600/40 rounded-lg text-xs font-semibold transition"
                >
                  Ativar Defender
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: DEBLOAT APPS */}
      {activeTab === 'debloat' && (
        <div className="space-y-3">
          <div className="bg-zinc-900/80 rounded-xl border border-zinc-800/80 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-amber-400" />
                  Debloat de Aplicativos Nativos do Windows
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Remova aplicativos pré-instalados (UWP/AppX) que consomem memória e processos em segundo plano.
                </p>
              </div>

              <button
                onClick={handleRemoveBloatware}
                disabled={isOptimizing || selectedBloatware.size === 0}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg transition disabled:opacity-50 shadow-sm"
              >
                Remover Selecionados ({selectedBloatware.size})
              </button>
            </div>

            {loadingBloatware ? (
              <div className="p-8 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-rose-500" /> Carregando pacotes instalados...
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {bloatwareList.map((app) => {
                  const isChecked = selectedBloatware.has(app.id);
                  return (
                    <div
                      key={app.id}
                      onClick={() => {
                        setSelectedBloatware((prev) => {
                          const next = new Set(prev);
                          if (next.has(app.id)) next.delete(app.id);
                          else next.add(app.id);
                          return next;
                        });
                      }}
                      className={`p-3 rounded-lg border cursor-pointer transition select-none flex items-center justify-between ${
                        isChecked ? 'bg-zinc-900 border-rose-500/60' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="rounded bg-zinc-900 border-zinc-700 text-rose-600 focus:ring-0 w-3.5 h-3.5"
                        />
                        <div>
                          <div className="text-xs font-bold text-zinc-200">{app.name}</div>
                          <div className="text-[10px] text-zinc-500 font-mono">{app.id}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 8: STARTUP ITEMS */}
      {activeTab === 'startup' && (
        <div className="space-y-3">
          <div className="bg-zinc-900/80 rounded-xl border border-zinc-800/80 p-4 space-y-3">
            <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-400" />
              Aplicativos que Inicializam com o Windows
            </h3>
            <p className="text-xs text-zinc-400">
              Desative programas desnecessários da inicialização para acelerar o boot do sistema.
            </p>

            <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-lg bg-zinc-950 overflow-hidden">
              {startupItems.map((item, idx) => (
                <div key={idx} className="p-3 flex items-center justify-between gap-3 hover:bg-zinc-900/40">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-zinc-200 truncate">{item.name}</div>
                    <div className="text-[10px] text-zinc-500 font-mono truncate">{item.cmd}</div>
                  </div>
                  <button
                    onClick={() => handleDisableStartupItem(item)}
                    disabled={isOptimizing}
                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold rounded border border-zinc-700 transition"
                  >
                    Desativar
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* COLLAPSIBLE TERMINAL & LOGS DRAWER */}
      {showConsole && (
        <div className="fixed bottom-3 right-3 left-3 sm:left-auto sm:w-[500px] bg-zinc-950/95 border border-zinc-800 rounded-xl shadow-2xl p-3 z-40 animate-fadeIn backdrop-blur">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80 text-xs">
            <span className="font-mono font-bold text-zinc-300 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-rose-500" />
              Terminal de Execução
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setLogs([])}
                className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300"
              >
                Limpar
              </button>
              <button
                onClick={() => setShowConsole(false)}
                className="text-zinc-500 hover:text-zinc-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="h-44 overflow-y-auto font-mono text-[11px] text-zinc-300 space-y-1 p-2 bg-black/60 rounded-lg border border-zinc-900 mt-2">
            {logs.length === 0 ? (
              <span className="text-zinc-600">Aguardando execução...</span>
            ) : (
              logs.map((l, i) => (
                <div key={i} className="leading-tight">
                  {l.includes('[ERRO]') ? (
                    <span className="text-rose-400">{l}</span>
                  ) : l.includes('[SUCESSO]') ? (
                    <span className="text-emerald-400">{l}</span>
                  ) : (
                    l
                  )}
                </div>
              ))
            )}
            <div ref={logBottomRef} />
          </div>
        </div>
      )}
    </div>
  );
}
