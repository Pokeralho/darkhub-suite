import React, { useState, useEffect, useMemo } from 'react';
import {
  Zap, Trash2, CheckCircle2, AlertCircle, Loader2, Cpu, Wrench, Settings, Globe, Server,
  Clock, Activity, Target, Info, Key, Trash, ZapOff, HardDrive, Shield, Eraser, SignalHigh,
  PlaySquare, FileMinus, CheckSquare, Square, Monitor, ShieldCheck, Undo2, Search,
  SlidersHorizontal, Layers, Terminal, RefreshCw, Sparkles, Check, ChevronDown, ChevronUp,
  Flame, Lock, EyeOff, Radio, Laptop, ArrowRight, FolderOpen, Gamepad2
} from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { HelpTip } from '../components/HelpTip';
import { DetailedHardwareInfo } from '../components/DetailedHardwareInfo';
import { OptimizerProgress } from '../components/OptimizerProgress';

type TabType = 'overview' | 'tweaks' | 'debloat' | 'privacy' | 'network' | 'tools' | 'audit' | 'extreme';

export default function Optimizer() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [activeRoutine, setActiveRoutine] = useState<string | null>(null);
  const [isAdminUser, setIsAdminUser] = useState<boolean | null>(null);
  const [showConsole, setShowConsole] = useState(false);

  const [tweakSearch, setTweakSearch] = useState('');
  const [tweakCategory, setTweakCategory] = useState<string>('all');

  const [debloatSubTab, setDebloatSubTab] = useState<'bloatware' | 'programs'>('bloatware');
  const [bloatwareList, setBloatwareList] = useState<any[]>([]);
  const [selectedBloatware, setSelectedBloatware] = useState<Set<string>>(new Set());
  const [programsList, setProgramsList] = useState<any[]>([]);
  const [programSearch, setProgramSearch] = useState('');

  const [toolsSubTab, setToolsSubTab] = useState<'startup' | 'services' | 'priority' | 'gpu' | 'memory' | 'features'>('startup');
  const [startupItems, setStartupItems] = useState<any[]>([]);
  const [servicesList, setServicesList] = useState<any[]>([]);
  const [serviceSearch, setServiceSearch] = useState('');
  const [processList, setProcessList] = useState<any[]>([]);
  const [selectedProcess, setSelectedProcess] = useState<number | null>(null);
  const [selectedPriority, setSelectedPriority] = useState<string>('high');
  const [processSearch, setProcessSearch] = useState('');
  const [isRefreshingProcesses, setIsRefreshingProcesses] = useState(false);

  const [gpuList, setGpuList] = useState<any[]>([]);
  const [gpuPreferences, setGpuPreferences] = useState<any[]>([]);
  const [selectedGpuAppPath, setSelectedGpuAppPath] = useState('');
  const [selectedGpuPref, setSelectedGpuPref] = useState<'high_performance' | 'power_saving' | 'default'>('high_performance');
  const [hagsEnabled, setHagsEnabled] = useState<boolean | null>(null);
  const [pagefileInitial, setPagefileInitial] = useState('1024');
  const [pagefileMax, setPagefileMax] = useState('4096');
  const [executionPolicy, setExecutionPolicy] = useState('RemoteSigned');

  const [dnsServerInput, setDnsServerInput] = useState('');
  const [dnsBenchmarkRunning, setDnsBenchmarkRunning] = useState(false);
  const [dnsBenchmarkResults, setDnsBenchmarkResults] = useState<any[] | null>(null);
  const [dnsState, setDnsState] = useState<any>(null);
  const [dnsUndoToken, setDnsUndoToken] = useState<string | null>(null);

  const [profiles, setProfiles] = useState<any[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('recommended');
  const [operations, setOperations] = useState<any[]>([]);
  const [createRestoreCheck, setCreateRestoreCheck] = useState(true);
  const [deepTweaksUndoToken, setDeepTweaksUndoToken] = useState<string | null>(null);

  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditExpanded, setAuditExpanded] = useState<Set<number>>(new Set());
  const [auditFilter, setAuditFilter] = useState<'all' | 'error' | 'success'>('all');

  const [defenderStatus, setDefenderStatus] = useState<{
    tamperProtected?: boolean;
    realtimeEnabled?: boolean;
    antivirusEnabled?: boolean;
    serviceRunning?: boolean;
    serviceStatus?: string;
  } | null>(null);
  const [defenderLoading, setDefenderLoading] = useState(false);
  const [extremeBusy, setExtremeBusy] = useState<string | null>(null);

  const loadDefenderStatus = async () => {
    if (!window.darkhub?.optimizer?.getDefenderControlStatus) return;
    setDefenderLoading(true);
    try {
      const res = await window.darkhub.optimizer.getDefenderControlStatus();
      if (res?.ok && res.status) {
        setDefenderStatus(res.status);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDefenderLoading(false);
    }
  };

  const handleApplyDefender = async (action: 'disable' | 'enable') => {
    setIsOptimizing(true);
    setShowConsole(true);
    addLog(`[INFO] Executando Defender Control (${action.toUpperCase()}) via TrustedInstaller...`);
    try {
      const res = await window.darkhub.optimizer.applyDefenderControl({ action });
      if (res?.ok) {
        addLog(`[SUCCESS] ${res.msg}`);
      } else {
        addLog(`[ERROR] ${res?.error ?? 'Falha na execução'}`);
      }
      await loadDefenderStatus();
    } catch (e: any) {
      addLog(`[ERROR] ${e.message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleOpenTamper = async () => {
    await window.darkhub.optimizer.openTamperSettings();
    addLog('[INFO] Painel de Proteção contra Adulteração do Windows aberto.');
  };

  const handleApplyMsiMode = async () => {
    setExtremeBusy('msi');
    setIsOptimizing(true);
    setShowConsole(true);
    addLog('[INFO] Ativando MSI Mode e prioridade High em adaptadores PCI...');
    try {
      const res = await window.darkhub.optimizer.applyMsiMode();
      if (res?.ok) addLog(`[SUCCESS] ${res.msg}`);
      else addLog(`[ERROR] ${res?.error ?? 'Falha'}`);
    } catch (e: any) {
      addLog(`[ERROR] ${e.message}`);
    } finally {
      setExtremeBusy(null);
      setIsOptimizing(false);
    }
  };

  const handleApplyKernelMod = async () => {
    setExtremeBusy('kernel');
    setIsOptimizing(true);
    setShowConsole(true);
    addLog('[INFO] Aplicando Mod Extremo de Kernel (Win32PrioritySeparation 0x26, MMCSS, HAGS, NTFS)...');
    try {
      const res = await window.darkhub.optimizer.applyExtremeKernelMod();
      if (res?.ok) addLog(`[SUCCESS] ${res.msg}`);
      else addLog(`[ERROR] ${res?.error ?? 'Falha'}`);
    } catch (e: any) {
      addLog(`[ERROR] ${e.message}`);
    } finally {
      setExtremeBusy(null);
      setIsOptimizing(false);
    }
  };

  const handleApplyNetworkMod = async () => {
    setExtremeBusy('network');
    setIsOptimizing(true);
    setShowConsole(true);
    addLog('[INFO] Otimizando Pilha TCP/IP para Latência Mínima...');
    try {
      const res = await window.darkhub.optimizer.applyExtremeNetworkMod();
      if (res?.ok) addLog(`[SUCCESS] ${res.msg}`);
      else addLog(`[ERROR] ${res?.error ?? 'Falha'}`);
    } catch (e: any) {
      addLog(`[ERROR] ${e.message}`);
    } finally {
      setExtremeBusy(null);
      setIsOptimizing(false);
    }
  };

  const handleApplyCpuUnpark = async () => {
    setExtremeBusy('cpu');
    setIsOptimizing(true);
    setShowConsole(true);
    addLog('[INFO] Desestacionando núcleos de CPU (100% Core Unpark)...');
    try {
      const res = await window.darkhub.optimizer.applyCpuUnpark();
      if (res?.ok) addLog(`[SUCCESS] ${res.msg}`);
      else addLog(`[ERROR] ${res?.error ?? 'Falha'}`);
    } catch (e: any) {
      addLog(`[ERROR] ${e.message}`);
    } finally {
      setExtremeBusy(null);
      setIsOptimizing(false);
    }
  };

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const loadAuditLog = async () => {
    if (!window.darkhub?.optimizer?.getAuditLog) return;
    setAuditLoading(true);
    try {
      const res = await window.darkhub.optimizer.getAuditLog({ limit: 200 });
      if (res?.ok) setAuditLog(res.entries || []);
    } catch {

    } finally {
      setAuditLoading(false);
    }
  };

  const toggleAuditExpanded = (index: number) => {
    setAuditExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  useEffect(() => {
    const loadOptimizerData = async () => {
      if (window.darkhub?.optimizer) {
        try {
          const [ops, profs, admin] = await Promise.all([
            window.darkhub.optimizer.listOperations(),
            window.darkhub.optimizer.listProfiles(),
            window.darkhub.optimizer.checkIsAdmin()
          ]);
          setOperations(ops || []);
          setProfiles(profs || []);
          setIsAdminUser(Boolean(admin));
        } catch (e) {
          console.error(e);
        }
      }
    };
    loadOptimizerData();
    loadAuditLog();

    if (!window.darkhub?.optimizer?.onRunEvent) return;
    const unsubscribe = window.darkhub.optimizer.onRunEvent((payload: any) => {
      const ev = payload as any;
      if (ev?.type === 'op-start') addLog(`[RUN] ${ev.opId}...`);
      if (ev?.type === 'op-finish') {
        if (ev.ok) addLog(`[SUCCESS] ${ev.opId}`);
        else addLog(`[ERROR] ${ev.opId}: ${ev.error ?? 'Falha'}`);
      }
      if (ev?.type === 'run-start') {
        if (ev?.routineId) addLog(`[INFO] ${ev.message ?? `Iniciando rotina: ${ev.routineId}`}`);
        else addLog(`[INFO] Iniciando lote: ${ev.runId} (${ev.total} tarefas)`);
      }
      if (ev?.type === 'log' && ev?.routineId) addLog(`[${ev.routineId}] ${ev.message ?? 'Evento recebido'}`);
      if (ev?.type === 'progress' && ev?.routineId) {
        const pct = typeof ev.progress === 'number' ? `${Math.round(ev.progress)}% - ` : '';
        addLog(`[${ev.routineId}] ${pct}${ev.message ?? 'Em andamento'}`);
      }
      if (ev?.type === 'complete' && ev?.routineId) {
        if (ev.ok === false) addLog(`[ERROR] ${ev.message ?? `${ev.routineId} falhou`}`);
        else addLog(`[SUCCESS] ${ev.message ?? `${ev.routineId} concluída`}`);
      }
      if (ev?.type === 'error' && ev?.routineId) addLog(`[ERROR] ${ev.message ?? ev.error ?? `${ev.routineId} falhou`}`);
      if (ev?.type === 'run-finish') {
        if (ev.ok === false) addLog(`[ERROR] Execução falhou: ${ev.error ?? 'Erro desconhecido'}`);
        else addLog(`[SUCCESS] Execução finalizada: ${ev.runId}`);
        loadAuditLog();
      }
    });
    return unsubscribe;
  }, []);

  const handleGlobalOptimize = async () => {
    setIsOptimizing(true);
    setShowConsole(true);
    addLog(`Iniciando ${t('optimizer.global')}...`);
    if (window.darkhub) {
      try {
        const result = await window.darkhub.optimizer.run({
          operationIds: ['optimizer:cleanTemp', 'optimizer:flushDns', 'optimizer:optimizeRAM'],
          options: { concurrency: 2 }
        });
        if (result?.results) {
          const okCount = result.results.filter((r: any) => r.ok).length;
          addLog(`[INFO] Otimização global concluída: ${okCount}/${result.results.length} tarefas com sucesso.`);
        }
      } catch (error: any) {
        addLog(`[ERROR] Global Optimization: ${error.message}`);
      }
    }
    setIsOptimizing(false);
  };

  const handleWinUtilTweaks = async () => {
    setActiveRoutine('winutil');
    setIsOptimizing(true);
    setShowConsole(true);
    addLog(`Aplicando ${t('optimizer.deep')}...`);
    if (window.darkhub) {
      const res = await window.darkhub.optimizer.winUtilTweaks();
      if (res?.ok) {
        addLog(`[SUCCESS] ${res.msg}`);
        if (res.undoToken) setDeepTweaksUndoToken(res.undoToken);
      } else {
        addLog(`[ERROR] ${res?.error ?? 'Falha'}`);
      }
    }
    setIsOptimizing(false);
    setActiveRoutine(null);
  };

  const handleUndoDeepTweaks = async () => {
    if (!deepTweaksUndoToken || !window.darkhub) return;
    setIsOptimizing(true);
    setShowConsole(true);
    addLog(`Revertendo ${t('optimizer.deep')}...`);
    const res = await window.darkhub.optimizer.deepTweaksUndo({ undoToken: deepTweaksUndoToken });
    if (res?.ok) {
      addLog(`[SUCCESS] ${res.msg}`);
      setDeepTweaksUndoToken(null);
    } else {
      addLog(`[ERROR] ${res?.error ?? 'Falha'}`);
    }
    setIsOptimizing(false);
  };

  const handleApplyProfile = async (profileId: string) => {
    setIsOptimizing(true);
    setShowConsole(true);
    addLog(`Iniciando aplicação de perfil: ${profileId}...`);

    if (!window.darkhub) {
      addLog('[ERROR] Recursos do DarkHub não disponíveis.');
      setIsOptimizing(false);
      return;
    }

    try {
      const activeProf = profiles.find((p) => p.id === profileId);
      if (!activeProf) {
        addLog('[ERROR] Perfil não encontrado.');
        setIsOptimizing(false);
        return;
      }

      if (createRestoreCheck && activeProf.risk !== 'safe') {
        addLog('[INFO] Criando Ponto de Restauração do Windows...');
        const rRes = await window.darkhub.optimizer.createRestorePoint();
        if (!rRes.ok) {
          addLog(`[WARNING] Ponto de Restauração: ${rRes.error || 'Desativado no Windows'}`);
          const proceed = window.confirm(
            'Não foi possível criar um Ponto de Restauração do sistema.\nDeseja continuar aplicando as otimizações mesmo assim?'
          );
          if (!proceed) {
            addLog('[CANCELLED] Operação cancelada pelo usuário.');
            setIsOptimizing(false);
            return;
          }
        } else {
          addLog('[SUCCESS] Ponto de Restauração criado com sucesso.');
        }
      }

      addLog(`[INFO] Aplicando ${activeProf.tweakIds.length} tarefas de otimização...`);
      const runRes = await window.darkhub.optimizer.run({
        operationIds: activeProf.tweakIds,
        options: { concurrency: 1 }
      });

      if (runRes?.results) {
        const okCount = runRes.results.filter((r: any) => r.ok).length;
        const failCount = runRes.results.length - okCount;
        addLog(`[INFO] Perfil ${activeProf.name} concluído: ${okCount} sucesso(s), ${failCount} falha(s).`);
      } else {
        addLog(`[INFO] Perfil ${activeProf.name} concluído.`);
      }
    } catch (e: any) {
      addLog(`[ERROR] Falha ao aplicar perfil: ${e.message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  const runRoutine = async (id: string, name: string) => {
    setActiveRoutine(id);
    setIsOptimizing(true);
    setShowConsole(true);
    addLog(`Executando: ${name}...`);
    try {
      if (window.darkhub) {
        const res = await window.darkhub.optimizer.runRoutine(id);
        if (res?.ok) addLog(`[SUCCESS] ${name}: ${res.msg || 'Concluído com sucesso'}`);
        else addLog(`[ERROR] ${name}: ${res?.error || 'Falha na execução'}`);
      }
    } catch (e: any) {
      addLog(`[ERROR] ${name}: ${e.message}`);
    } finally {
      setIsOptimizing(false);
      setActiveRoutine(null);
    }
  };

  const loadBloatware = async () => {
    setIsOptimizing(true);
    if (window.darkhub) {
      const res = await window.darkhub.optimizer.listBloatware();
      if (res?.ok) setBloatwareList(res.apps || []);
      else addLog(`[ERROR] ${res?.error ?? 'Falha ao listar bloatware'}`);
    }
    setIsOptimizing(false);
  };

  const toggleBloatware = (id: string) => {
    const next = new Set(selectedBloatware);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedBloatware(next);
  };

  const toggleSelectAllBloatware = () => {
    if (selectedBloatware.size === bloatwareList.length) {
      setSelectedBloatware(new Set());
    } else {
      setSelectedBloatware(new Set(bloatwareList.map((a) => a.id)));
    }
  };

  const handleRemoveSelectedBloatware = async () => {
    if (selectedBloatware.size === 0) return;
    setIsOptimizing(true);
    setShowConsole(true);
    addLog(`Removendo ${selectedBloatware.size} aplicativos de fábrica...`);
    if (window.darkhub) {
      const res = await window.darkhub.optimizer.removeSelectedBloatware(Array.from(selectedBloatware));
      if (res?.ok) {
        addLog(`[SUCCESS] ${res.msg}`);
        setBloatwareList(bloatwareList.filter((app) => !selectedBloatware.has(app.id)));
        setSelectedBloatware(new Set());
      } else {
        addLog(`[ERROR] ${res?.error ?? 'Falha ao remover bloatware'}`);
      }
    }
    setIsOptimizing(false);
  };

  const loadPrograms = async () => {
    setIsOptimizing(true);
    if (window.darkhub) {
      const res = await window.darkhub.optimizer.getInstalledPrograms();
      if (res?.ok) setProgramsList(res.programs || []);
      else addLog(`[ERROR] ${res?.error ?? 'Falha ao listar programas'}`);
    }
    setIsOptimizing(false);
  };

  const handleUninstall = async (uninstallString: string, displayName: string) => {
    if (window.darkhub) {
      addLog(`Iniciando desinstalador para "${displayName}"...`);
      const res = await window.darkhub.optimizer.uninstallProgram(uninstallString);
      if (res?.ok) addLog(`[SUCCESS] Desinstalador de "${displayName}" finalizado.`);
      else addLog(`[ERROR] ${res?.error ?? 'Falha na desinstalação'}`);
    }
  };

  const loadStartupItems = async () => {
    setIsOptimizing(true);
    if (window.darkhub) {
      const res = await window.darkhub.optimizer.getStartupItems();
      if (res?.ok) setStartupItems(res.items || []);
      else addLog(`[ERROR] ${res?.error ?? 'Falha ao listar inicialização'}`);
    }
    setIsOptimizing(false);
  };

  const handleDisableStartup = async (item: any) => {
    setIsOptimizing(true);
    if (window.darkhub) {
      const res = await window.darkhub.optimizer.disableStartupItem({ name: item.name, type: item.type, path: item.path });
      if (res?.ok) {
        addLog(`[SUCCESS] Item desativado: ${item.name}`);
        setStartupItems(startupItems.filter((i) => i.name !== item.name));
      } else {
        addLog(`[ERROR] ${res?.error ?? 'Falha ao desativar'}`);
      }
    }
    setIsOptimizing(false);
  };

  const loadServices = async () => {
    setIsOptimizing(true);
    if (window.darkhub) {
      const res = await window.darkhub.optimizer.getServices();
      if (res?.ok) setServicesList(res.services || []);
      else addLog(`[ERROR] ${res?.error ?? 'Falha ao listar serviços'}`);
    }
    setIsOptimizing(false);
  };

  const handleDisableService = async (name: string) => {
    setIsOptimizing(true);
    if (window.darkhub) {
      const res = await window.darkhub.optimizer.disableService(name);
      if (res?.ok) {
        addLog(`[SUCCESS] Serviço parado e desativado: ${name}`);
        setServicesList(servicesList.filter((s) => s.Name !== name));
      } else {
        addLog(`[ERROR] ${res?.error ?? 'Falha ao desativar serviço'}`);
      }
    }
    setIsOptimizing(false);
  };

  const loadProcesses = async () => {
    setIsRefreshingProcesses(true);
    if (window.darkhub?.optimizer?.getRunningProcesses) {
      try {
        const res = await window.darkhub.optimizer.getRunningProcesses();
        if (res?.ok && Array.isArray(res.processes)) {
          setProcessList(res.processes);
        } else {
          addLog(`[ERROR] ${res?.error ?? 'Falha ao listar processos em execução'}`);
        }
      } catch (e: any) {
        addLog(`[ERROR] ${e.message}`);
      }
    }
    setIsRefreshingProcesses(false);
  };

  const handleSetPriority = async () => {
    if (!selectedProcess) return;
    setIsOptimizing(true);
    setShowConsole(true);
    if (window.darkhub) {
      const res = await window.darkhub.optimizer.setProcessPriority({ pid: selectedProcess, priority: selectedPriority });
      if (res?.ok) addLog(`[SUCCESS] Prioridade do processo ${selectedProcess} alterada para ${selectedPriority}`);
      else addLog(`[ERROR] ${res?.error ?? 'Falha ao ajustar prioridade'}`);
    }
    setIsOptimizing(false);
  };

  const loadGpuData = async () => {
    if (!window.darkhub?.optimizer) return;
    try {
      const [info, prefs, hags] = await Promise.all([
        window.darkhub.optimizer.getGpuInfo(),
        window.darkhub.optimizer.getGpuPreferences(),
        window.darkhub.optimizer.getHagsStatus()
      ]);
      if (info?.ok) setGpuList(info.controllers || []);
      if (prefs?.ok) setGpuPreferences(prefs.preferences || []);
      if (hags?.ok) setHagsEnabled(hags.enabled);
    } catch (e: any) {
      console.error('Error loading GPU data:', e);
    }
  };

  const handleSetGpuPreference = async () => {
    if (!selectedGpuAppPath.trim()) return;
    setIsOptimizing(true);
    setShowConsole(true);
    addLog(`Aplicando preferência gráfica (${selectedGpuPref}) para "${selectedGpuAppPath}"...`);
    try {
      const res = await window.darkhub.optimizer.setGpuPreference({
        appPath: selectedGpuAppPath.trim(),
        preference: selectedGpuPref
      });
      if (res?.ok) {
        addLog(`[SUCCESS] ${res.msg}`);
        setSelectedGpuAppPath('');
        await loadGpuData();
      } else {
        addLog(`[ERROR] ${res?.error ?? 'Falha ao aplicar preferência de GPU'}`);
      }
    } catch (e: any) {
      addLog(`[ERROR] ${e.message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleRemoveGpuPreference = async (appPath: string) => {
    setIsOptimizing(true);
    setShowConsole(true);
    addLog(`Removendo preferência gráfica de "${appPath}"...`);
    try {
      const res = await window.darkhub.optimizer.removeGpuPreference({ appPath });
      if (res?.ok) {
        addLog(`[SUCCESS] ${res.msg}`);
        await loadGpuData();
      } else {
        addLog(`[ERROR] ${res?.error ?? 'Falha ao remover'}`);
      }
    } catch (e: any) {
      addLog(`[ERROR] ${e.message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleBrowseGpuApp = async () => {
    if (!window.darkhub?.dialog?.selectFiles) return;
    try {
      const res = await window.darkhub.dialog.selectFiles({
        title: 'Selecionar Executável do Jogo ou Aplicativo (.exe)',
        filters: [{ name: 'Executables', extensions: ['exe'] }]
      });
      if (!res.canceled && res.filePaths && res.filePaths.length > 0) {
        setSelectedGpuAppPath(res.filePaths[0]);
      }
    } catch (e: any) {
      console.error(e);
    }
  };

  const handleToggleHags = async () => {
    if (hagsEnabled === null || !window.darkhub?.optimizer?.setHagsStatus) return;
    setIsOptimizing(true);
    setShowConsole(true);
    const targetState = !hagsEnabled;
    addLog(`[INFO] Alterando HAGS para ${targetState ? 'ATIVADO' : 'DESATIVADO'}...`);
    try {
      const res = await window.darkhub.optimizer.setHagsStatus({ enabled: targetState });
      if (res?.ok) {
        setHagsEnabled(targetState);
        addLog(`[SUCCESS] ${res.msg}`);
      } else {
        addLog(`[ERROR] ${res?.error ?? 'Falha ao alterar HAGS'}`);
      }
    } catch (e: any) {
      addLog(`[ERROR] ${e.message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  const refreshDnsState = async () => {
    if (!window.darkhub) return;
    try {
      const res = await window.darkhub.optimizer.getDnsState();
      setDnsState(res?.ok ? res : null);
    } catch {
      setDnsState(null);
    }
  };

  const handleDNSOptimize = async (primary: string, secondary: string, name: string) => {
    setIsOptimizing(true);
    setShowConsole(true);
    addLog(`Aplicando DNS ${name} (${primary} / ${secondary})...`);
    if (window.darkhub) {
      const res = await window.darkhub.optimizer.applyDns({ primary, secondary });
      if (res?.ok) {
        addLog(`[SUCCESS] ${res.msg}`);
        if (res.undoToken) setDnsUndoToken(res.undoToken);
        await refreshDnsState();
      } else {
        addLog(`[ERROR] ${res?.error ?? 'Falha ao aplicar DNS'}`);
      }
    }
    setIsOptimizing(false);
  };

  const handleDnsUndo = async () => {
    if (!window.darkhub || !dnsUndoToken) return;
    setIsOptimizing(true);
    setShowConsole(true);
    const res = await window.darkhub.optimizer.undoDns({ undoToken: dnsUndoToken });
    if (res?.ok) {
      addLog(`[SUCCESS] ${res.msg}`);
      setDnsUndoToken(null);
      await refreshDnsState();
    } else {
      addLog(`[ERROR] ${res?.error ?? 'Falha ao reverter DNS'}`);
    }
    setIsOptimizing(false);
  };

  const handleRunDnsBenchmark = async () => {
    if (!window.darkhub) return;
    setDnsBenchmarkRunning(true);
    setDnsBenchmarkResults(null);
    setShowConsole(true);
    addLog('Iniciando benchmark de latência real de DNS...');
    try {
      const res = await window.darkhub.optimizer.dnsBenchmark({ timeoutMs: 1500, attempts: 2, concurrency: 10 });
      if (res?.ok && Array.isArray(res?.results)) {
        setDnsBenchmarkResults(res.results);
        addLog(`[SUCCESS] Benchmark finalizado: ${res.results.length} servidores testados.`);
      } else {
        addLog(`[ERROR] ${res?.error ?? 'DNS benchmark falhou'}`);
      }
    } catch (e: any) {
      addLog(`[ERROR] ${e?.message ?? 'DNS benchmark falhou'}`);
    } finally {
      setDnsBenchmarkRunning(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'debloat') {
      if (debloatSubTab === 'bloatware' && bloatwareList.length === 0) loadBloatware();
      if (debloatSubTab === 'programs' && programsList.length === 0) loadPrograms();
    }
    if (activeTab === 'tools') {
      if (toolsSubTab === 'startup' && startupItems.length === 0) loadStartupItems();
      if (toolsSubTab === 'services' && servicesList.length === 0) loadServices();
      if (toolsSubTab === 'priority') loadProcesses();
      if (toolsSubTab === 'gpu') loadGpuData();
    }
    if (activeTab === 'network') {
      refreshDnsState();
    }
  }, [activeTab, debloatSubTab, toolsSubTab]);

  const filteredOperations = useMemo(() => {
    return operations.filter((op) => {
      const matchesSearch =
        op.name.toLowerCase().includes(tweakSearch.toLowerCase()) ||
        op.description.toLowerCase().includes(tweakSearch.toLowerCase()) ||
        (op.technicalDescription && op.technicalDescription.toLowerCase().includes(tweakSearch.toLowerCase()));
      const matchesCategory = tweakCategory === 'all' || op.category === tweakCategory;
      return matchesSearch && matchesCategory;
    });
  }, [operations, tweakSearch, tweakCategory]);

  const categories = [
    { id: 'all', label: 'Todos os Ajustes' },
    { id: 'system', label: 'Sistema & Limpeza' },
    { id: 'performance', label: 'Performance' },
    { id: 'gaming', label: 'Jogos & FPS' },
    { id: 'privacy', label: 'Privacidade' },
    { id: 'audio', label: 'Áudio & Input' },
    { id: 'visuals', label: 'Visual & DWM' },
    { id: 'services', label: 'Serviços' },
    { id: 'security', label: 'Segurança' }
  ];

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto pb-12">
      {}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-purple-500/20 to-indigo-500/10 border border-purple-500/30 rounded-xl text-purple-400">
              <Sparkles size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-white tracking-tight">{t('optimizer.title', 'System Optimizer')}</h1>
                {isAdminUser ? (
                  <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full flex items-center gap-1">
                    <ShieldCheck size={12} /> {t('optimizer.adminActive', 'Admin Active')}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full flex items-center gap-1">
                    <Lock size={12} /> UAC sob demanda
                  </span>
                )}
              </div>
              <p className="text-sm text-zinc-400 mt-0.5">
                {t('optimizer.subtitle', 'Low-level optimization hub, debloat and latency tweaks.')}
              </p>
            </div>
          </div>
        </div>

        {}
        <div className="flex items-center gap-2.5 flex-wrap">
          {deepTweaksUndoToken && (
            <button
              onClick={handleUndoDeepTweaks}
              disabled={isOptimizing}
              className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-zinc-700 disabled:opacity-50"
            >
              <Undo2 size={14} /> {t('optimizer.undo', 'UNDO')}
            </button>
          )}

          <button
            onClick={handleWinUtilTweaks}
            disabled={isOptimizing}
            className="px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50"
          >
            <ShieldCheck size={14} /> {t('optimizer.deep', 'DEEP TWEAKS')}
          </button>

          <button
            onClick={handleGlobalOptimize}
            disabled={isOptimizing}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-blue-600/20 disabled:opacity-50"
          >
            {isOptimizing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            {t('optimizer.global', 'GLOBAL OPTIMIZE')}
          </button>
        </div>
      </div>

      {}
      <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar p-1.5 bg-zinc-900/90 border border-zinc-800 rounded-xl">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'overview'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
          }`}
        >
          <Zap size={15} /> {t('optimizer.tab.overview', 'Overview & Profiles')}
        </button>

        <button
          onClick={() => setActiveTab('tweaks')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'tweaks'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
          }`}
        >
          <SlidersHorizontal size={15} /> {t('optimizer.tab.tweaks', 'Tweaks & Tuning')}
          <span className="ml-1 px-1.5 py-0.2 bg-zinc-800 text-zinc-300 rounded text-[10px]">
            {operations.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('debloat')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'debloat'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
          }`}
        >
          <Trash2 size={15} /> {t('optimizer.tab.debloat', 'Debloat & Apps')}
        </button>

        <button
          onClick={() => setActiveTab('privacy')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'privacy'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
          }`}
        >
          <EyeOff size={15} /> {t('optimizer.tab.privacy', 'Privacy & AI')}
        </button>

        <button
          onClick={() => setActiveTab('network')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'network'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
          }`}
        >
          <Globe size={15} /> {t('optimizer.tab.network', 'Network & DNS')}
        </button>

        <button
          onClick={() => setActiveTab('tools')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'tools'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
          }`}
        >
          <Wrench size={15} /> {t('optimizer.tab.tools', 'Advanced Tools')}
        </button>

        <button
          onClick={() => {
            setActiveTab('extreme');
            loadDefenderStatus();
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'extreme'
              ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/20'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
          }`}
        >
          <Flame size={15} className="text-rose-400" /> Mod Extremo & Defender (TrustedInstaller)
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'audit'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
          }`}
        >
          <Terminal size={15} /> {t('optimizer.tab.audit', 'Audit & History')}
        </button>
      </div>

      {}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {profiles.map((prof) => {
              const isSelected = selectedProfileId === prof.id;
              let riskBadge = 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10';
              let riskName = 'Seguro';
              if (prof.risk === 'moderate') {
                riskBadge = 'text-amber-400 border-amber-500/20 bg-amber-500/10';
                riskName = 'Moderado';
              } else if (prof.risk === 'advanced') {
                riskBadge = 'text-rose-400 border-rose-500/20 bg-rose-500/10';
                riskName = 'Avançado';
              }

              return (
                <div
                  key={prof.id}
                  onClick={() => setSelectedProfileId(prof.id)}
                  className={`p-5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-zinc-850 border-blue-500/60 shadow-lg shadow-blue-500/5 ring-1 ring-blue-500/30'
                      : 'bg-zinc-900/90 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850/50'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${riskBadge}`}>
                        {riskName}
                      </span>
                      <span className="text-xs text-zinc-500 font-mono">
                        {prof.tweakIds?.length || 0} tweaks
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-white tracking-tight">{prof.name}</h3>
                    <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3">
                      {prof.description}
                    </p>
                  </div>

                  <div className="pt-4 mt-3 border-t border-zinc-800/80 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-zinc-500">
                      {isSelected ? 'Selecionado' : 'Clique para ver'}
                    </span>
                    <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                      isSelected ? 'border-blue-500 bg-blue-500' : 'border-zinc-700'
                    }`}>
                      {isSelected && <Check size={10} className="text-white stroke-[3]" />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {}
          {(() => {
            const prof = profiles.find((p) => p.id === selectedProfileId);
            if (!prof) return null;
            const profileOps = operations.filter((op) => prof.tweakIds.includes(op.id));

            return (
              <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-white">{prof.name}</h2>
                      <span className="text-xs text-zinc-400">({profileOps.length} tarefas de otimização)</span>
                    </div>
                    <p className="text-sm text-zinc-400 mt-1">{prof.description}</p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer bg-zinc-950 px-3 py-2 rounded-lg border border-zinc-800">
                      <input
                        type="checkbox"
                        checked={createRestoreCheck}
                        onChange={(e) => setCreateRestoreCheck(e.target.checked)}
                        className="rounded bg-zinc-800 border-zinc-700 text-blue-600 focus:ring-0"
                      />
                      <span>Criar Ponto de Restauração</span>
                    </label>

                    <button
                      onClick={() => handleApplyProfile(prof.id)}
                      disabled={isOptimizing}
                      className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-blue-600/20 disabled:opacity-50"
                    >
                      {isOptimizing ? <Loader2 size={16} className="animate-spin" /> : <Flame size={16} />}
                      Aplicar Perfil Agora
                    </button>
                  </div>
                </div>

                {}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-72 overflow-y-auto pr-1">
                  {profileOps.map((op) => (
                    <div key={op.id} className="p-3 bg-zinc-950/70 border border-zinc-800/80 rounded-lg space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-zinc-200 truncate">{op.name}</span>
                        {op.requiresAdmin && (
                          <span className="px-1.5 py-0.2 text-[9px] bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded font-semibold shrink-0">
                            UAC
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-relaxed line-clamp-2">{op.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {}
          <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Zap size={18} className="text-yellow-400" /> Ações Rápidas em 1 Clique
              </h3>
              <span className="text-xs text-zinc-500">Execução atômica direta</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <button
                onClick={() => runRoutine('clean-temp', 'Limpar Arquivos Temporários')}
                disabled={isOptimizing}
                className="p-3.5 bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 rounded-xl text-left transition-all group disabled:opacity-50"
              >
                <Eraser size={18} className="text-emerald-400 mb-2 group-hover:scale-110 transition-transform" />
                <div className="text-xs font-bold text-white">Limpar Temp</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">Cache e lixo do C:\</div>
              </button>

              <button
                onClick={() => runRoutine('optimize-ram', 'Otimizar Memória RAM')}
                disabled={isOptimizing}
                className="p-3.5 bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 rounded-xl text-left transition-all group disabled:opacity-50"
              >
                <Cpu size={18} className="text-fuchsia-400 mb-2 group-hover:scale-110 transition-transform" />
                <div className="text-xs font-bold text-white">Otimizar RAM</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">WorkingSet Trim</div>
              </button>

              <button
                onClick={() => runRoutine('clean-network', 'Limpar Rede e DNS')}
                disabled={isOptimizing}
                className="p-3.5 bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 rounded-xl text-left transition-all group disabled:opacity-50"
              >
                <Globe size={18} className="text-blue-400 mb-2 group-hover:scale-110 transition-transform" />
                <div className="text-xs font-bold text-white">Resetar Rede</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">Winsock e flushdns</div>
              </button>

              <button
                onClick={() => runRoutine('ultimate-performance', 'Ativar Desempenho Máximo')}
                disabled={isOptimizing}
                className="p-3.5 bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 rounded-xl text-left transition-all group disabled:opacity-50"
              >
                <Zap size={18} className="text-yellow-400 mb-2 group-hover:scale-110 transition-transform" />
                <div className="text-xs font-bold text-white">Plano Extremo</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">Ultimate Power Plan</div>
              </button>

              <button
                onClick={() => runRoutine('repair-windows', 'Reparar Arquivos do Windows')}
                disabled={isOptimizing}
                className="p-3.5 bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 rounded-xl text-left transition-all group disabled:opacity-50"
              >
                <Wrench size={18} className="text-orange-400 mb-2 group-hover:scale-110 transition-transform" />
                <div className="text-xs font-bold text-white">Reparar SFC</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">SFC & DISM Health</div>
              </button>

              <button
                onClick={() => runRoutine('activate-windows', 'Ativar Windows (MAS)')}
                disabled={isOptimizing}
                className="p-3.5 bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 rounded-xl text-left transition-all group disabled:opacity-50"
              >
                <Key size={18} className="text-amber-400 mb-2 group-hover:scale-110 transition-transform" />
                <div className="text-xs font-bold text-white">Ativar Windows</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">Massgrave Oficial</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {}
      {activeTab === 'tweaks' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {}
          <div className="flex flex-col md:flex-row gap-3 items-center justify-between bg-zinc-900 p-3.5 border border-zinc-800 rounded-xl">
            <div className="relative w-full md:w-80">
              <Search size={16} className="absolute left-3 top-1/2 -tranzinc-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Pesquisar ajustes (ex: telemetria, áudio, vbs)..."
                value={tweakSearch}
                onChange={(e) => setTweakSearch(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 placeholder:text-zinc-600"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar w-full md:w-auto pb-1 md:pb-0">
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setTweakCategory(c.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    tweakCategory === c.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-950 text-zinc-400 hover:text-zinc-200 border border-zinc-800/80'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOperations.map((op) => {
              let riskBadge = 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10';
              let riskName = 'Seguro';
              if (op.risk === 'moderate') {
                riskBadge = 'text-amber-400 border-amber-500/20 bg-amber-500/10';
                riskName = 'Moderado';
              } else if (op.risk === 'advanced') {
                riskBadge = 'text-rose-400 border-rose-500/20 bg-rose-500/10';
                riskName = 'Avançado';
              }

              return (
                <div
                  key={op.id}
                  className="p-5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700/80 rounded-xl flex flex-col justify-between gap-4 transition-all"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${riskBadge}`}>
                        {riskName}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {op.requiresAdmin && (
                          <span className="px-1.5 py-0.2 text-[9px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded">
                            UAC
                          </span>
                        )}
                        {op.requiresReboot && (
                          <span className="px-1.5 py-0.2 text-[9px] font-semibold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded">
                            Reboot
                          </span>
                        )}
                      </div>
                    </div>

                    <h4 className="text-sm font-bold text-white tracking-tight">{op.name}</h4>
                    <p className="text-xs text-zinc-400 leading-relaxed">{op.description}</p>
                    {op.technicalDescription && (
                      <p className="text-[11px] text-zinc-500 font-mono bg-zinc-950 p-2 rounded border border-zinc-850">
                        {op.technicalDescription}
                      </p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between">
                    <span className="text-[11px] text-zinc-500 font-mono">
                      ~{op.estimatedTimeMs || 300}ms
                    </span>
                    <button
                      onClick={async () => {
                        setIsOptimizing(true);
                        setShowConsole(true);
                        addLog(`Executando tweak individual: ${op.name}...`);
                        try {
                          await window.darkhub.optimizer.run({ operationIds: [op.id] });
                        } finally {
                          setIsOptimizing(false);
                        }
                      }}
                      disabled={isOptimizing}
                      className="px-3.5 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Zap size={13} /> Executar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {}
      {activeTab === 'debloat' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {}
          <div className="flex gap-2 border-b border-zinc-800 pb-3">
            <button
              onClick={() => setDebloatSubTab('bloatware')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 ${
                debloatSubTab === 'bloatware'
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              <Trash2 size={15} /> Bloatware do Windows (UWP)
            </button>
            <button
              onClick={() => setDebloatSubTab('programs')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 ${
                debloatSubTab === 'programs'
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              <FileMinus size={15} /> Programas Instalados (Painel de Controle)
            </button>
          </div>

          {debloatSubTab === 'bloatware' ? (
            <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-white">Remover Aplicativos Pré-instalados</h3>
                  <p className="text-xs text-zinc-400">
                    Exclui os pacotes UWP do usuário e da imagem provisionada para evitar reinstalações automáticas.
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={toggleSelectAllBloatware}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium border border-zinc-700"
                  >
                    {selectedBloatware.size === bloatwareList.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                  </button>
                  <button
                    onClick={handleRemoveSelectedBloatware}
                    disabled={selectedBloatware.size === 0 || isOptimizing}
                    className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md shadow-red-600/20 disabled:opacity-50"
                  >
                    <Trash2 size={14} /> Remover Selecionados ({selectedBloatware.size})
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-96 overflow-y-auto pr-1">
                {bloatwareList.map((app) => (
                  <label
                    key={app.id}
                    className="flex items-center gap-3 p-3 bg-zinc-950/80 border border-zinc-800 hover:border-zinc-700 rounded-lg cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedBloatware.has(app.id)}
                      onChange={() => toggleBloatware(app.id)}
                      className="rounded bg-zinc-800 border-zinc-700 text-blue-600 focus:ring-0 w-4 h-4"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">{app.name}</div>
                      <div className="text-[10px] text-zinc-500 font-mono truncate">{app.id}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-white">Desinstalar Programas do Sistema</h3>
                  <p className="text-xs text-zinc-400">Varredura direta do Registro (HKLM/HKCU Uninstall).</p>
                </div>
                <input
                  type="text"
                  placeholder="Buscar programas instalados..."
                  value={programSearch}
                  onChange={(e) => setProgramSearch(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 w-full sm:w-64"
                />
              </div>

              <div className="divide-y divide-zinc-800/80 max-h-96 overflow-y-auto border border-zinc-800/80 rounded-lg bg-zinc-950">
                {programsList
                  .filter((p) => p.DisplayName?.toLowerCase().includes(programSearch.toLowerCase()))
                  .map((prog, idx) => (
                    <div key={idx} className="p-3.5 flex items-center justify-between gap-3 hover:bg-zinc-900/40">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white truncate">{prog.DisplayName}</div>
                        <div className="text-[10px] text-zinc-500 font-mono truncate">{prog.UninstallString}</div>
                      </div>
                      <button
                        onClick={() => handleUninstall(prog.UninstallString, prog.DisplayName)}
                        disabled={isOptimizing}
                        className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-semibold rounded-lg shrink-0 transition-colors"
                      >
                        Desinstalar
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {}
      {activeTab === 'privacy' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <EyeOff size={18} className="text-purple-400" /> Blindagem de Privacidade & I.A.
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                Bloqueio de serviços espiões, telemetria invasiva, gravação de tela em segundo plano e monitoramento por I.A.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-bold text-white">Desativar Telemetria & Rastreamento</h4>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Bloqueia DiagTrack, WER (Relatório de Erros) e envio de dados para servidores da Microsoft.
                  </p>
                </div>
                <button
                  onClick={() => runRoutine('disable-telemetry', 'Desativar Telemetria')}
                  disabled={isOptimizing}
                  className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold shrink-0"
                >
                  Bloquear
                </button>
              </div>

              <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-bold text-white">Desativar Windows Recall, Copilot & Anúncios</h4>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Remove a gravação contínua de tela do Recall, desativa o Copilot e anúncios no Menu Iniciar.
                  </p>
                </div>
                <button
                  onClick={() => runRoutine('disable-ai', 'Desativar IA e Anúncios')}
                  disabled={isOptimizing}
                  className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold shrink-0"
                >
                  Bloquear
                </button>
              </div>

              <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-bold text-white">Desativar Game DVR & Gravação em Segundo Plano</h4>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Desliga o encoder contínuo do Xbox Game Bar, economizando ciclos de GPU e CPU em jogos.
                  </p>
                </div>
                <button
                  onClick={() => runRoutine('disable-gamebar', 'Desativar Game DVR')}
                  disabled={isOptimizing}
                  className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold shrink-0"
                >
                  Bloquear
                </button>
              </div>

              <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-bold text-white">Modo Hardcore Gamer (Desativar VBS / Core Isolation)</h4>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Desliga a segurança baseada em virtualização (VBS) para liberar até 10% de ganho bruto de FPS.
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => runRoutine('disable-core-isolation', 'Desativar VBS / Isolamento')}
                    disabled={isOptimizing}
                    className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold"
                  >
                    Desativar
                  </button>
                  <button
                    onClick={() => runRoutine('revert-core-isolation', 'Reverter VBS')}
                    disabled={isOptimizing}
                    className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold border border-zinc-700"
                  >
                    Reativar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {}
      {activeTab === 'network' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Globe size={18} className="text-blue-400" /> DNS Benchmark & Otimização de Rede
                </h3>
                <div className="text-xs text-zinc-400 mt-1">
                  Adaptador Ativo: <span className="font-mono text-white">{dnsState?.adapter || 'Detectando...'}</span> •
                  DNS Atual: <span className="font-mono text-white">{dnsState?.servers?.join(', ') || 'Padrão DHCP'}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {dnsUndoToken && (
                  <button
                    onClick={handleDnsUndo}
                    disabled={isOptimizing}
                    className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold border border-zinc-700 transition-colors disabled:opacity-50"
                  >
                    Reverter DNS
                  </button>
                )}
                <button
                  onClick={async () => {
                    await refreshDnsState();
                    await handleRunDnsBenchmark();
                  }}
                  disabled={dnsBenchmarkRunning || isOptimizing}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-md shadow-blue-600/20 disabled:opacity-50"
                >
                  {dnsBenchmarkRunning ? <Loader2 size={14} className="animate-spin" /> : <Target size={14} />}
                  Rodar Benchmark de DNS
                </button>
              </div>
            </div>

            {}
            <div className="divide-y divide-zinc-800/80 max-h-80 overflow-y-auto border border-zinc-800 rounded-lg bg-zinc-950">
              {(dnsBenchmarkResults ?? []).map((dns, i) => (
                <div key={i} className="p-3 flex items-center justify-between gap-3 hover:bg-zinc-900/40">
                  <div>
                    <div className="text-xs font-bold text-white">{dns.name}</div>
                    <div className="text-[10px] text-zinc-500 font-mono">
                      {dns.primary} / {dns.secondary}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono font-bold text-emerald-400 tabular-nums">
                      {Number.isFinite(dns.latencyMs) ? `${dns.latencyMs}ms` : '∞'}
                    </span>
                    <button
                      onClick={() => handleDNSOptimize(dns.primary, dns.secondary, dns.name)}
                      disabled={isOptimizing}
                      className="px-3 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-semibold rounded-lg transition-colors"
                    >
                      Aplicar
                    </button>
                  </div>
                </div>
              ))}
              {!dnsBenchmarkResults && (
                <div className="p-8 text-center text-xs text-zinc-500">
                  Clique em "Rodar Benchmark de DNS" para medir a latência real de cada servidor em relação à sua conexão.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {}
      {activeTab === 'tools' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {}
          <div className="flex gap-2 border-b border-zinc-800 pb-3 overflow-x-auto custom-scrollbar">
            <button
              onClick={() => setToolsSubTab('startup')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                toolsSubTab === 'startup'
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              {t('optimizer.tools.startup', 'Startup Apps')}
            </button>
            <button
              onClick={() => setToolsSubTab('services')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                toolsSubTab === 'services'
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              {t('optimizer.tools.services', 'Running Services')}
            </button>
            <button
              onClick={() => setToolsSubTab('priority')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                toolsSubTab === 'priority'
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              {t('optimizer.tools.priority', 'Process Priority')}
            </button>
            <button
              onClick={() => setToolsSubTab('gpu')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                toolsSubTab === 'gpu'
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              {t('optimizer.tools.gpu', 'GPU & Graphics Preference')}
            </button>
            <button
              onClick={() => setToolsSubTab('memory')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                toolsSubTab === 'memory'
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              {t('optimizer.tools.memory', 'Virtual Memory & Hibernation')}
            </button>
            <button
              onClick={() => setToolsSubTab('features')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                toolsSubTab === 'features'
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              {t('optimizer.tools.features', 'Windows & Dev Features')}
            </button>
          </div>

          {}
          {toolsSubTab === 'startup' && (
            <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
              <h3 className="text-base font-bold text-white">Programas de Inicialização</h3>
              <div className="divide-y divide-zinc-800 max-h-80 overflow-y-auto border border-zinc-800 rounded-lg bg-zinc-950">
                {startupItems.map((item, idx) => (
                  <div key={idx} className="p-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white flex items-center gap-2">
                        {item.name}
                        <span className="text-[10px] px-1.5 py-0.2 bg-zinc-800 text-zinc-400 rounded">
                          {item.type}
                        </span>
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono truncate">{item.cmd}</div>
                    </div>
                    <button
                      onClick={() => handleDisableStartup(item)}
                      disabled={isOptimizing}
                      className="px-3 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-semibold rounded-lg shrink-0"
                    >
                      Desativar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {}
          {toolsSubTab === 'services' && (
            <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
              <div className="flex items-center justify-between gap-3 border-b border-zinc-800 pb-4">
                <h3 className="text-base font-bold text-white">Serviços em Execução</h3>
                <input
                  type="text"
                  placeholder="Filtrar serviços..."
                  value={serviceSearch}
                  onChange={(e) => setServiceSearch(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 w-60"
                />
              </div>

              <div className="divide-y divide-zinc-800 max-h-80 overflow-y-auto border border-zinc-800 rounded-lg bg-zinc-950">
                {servicesList
                  .filter((s) => s.DisplayName?.toLowerCase().includes(serviceSearch.toLowerCase()) || s.Name?.toLowerCase().includes(serviceSearch.toLowerCase()))
                  .map((srv, idx) => (
                    <div key={idx} className="p-3.5 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-white">{srv.DisplayName}</div>
                        <div className="text-[10px] text-zinc-500 font-mono">{srv.Name}</div>
                      </div>
                      <button
                        onClick={() => handleDisableService(srv.Name)}
                        disabled={isOptimizing}
                        className="px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 text-xs font-semibold rounded-lg shrink-0"
                      >
                        Parar & Desativar
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {}
          {toolsSubTab === 'priority' && (
            <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Cpu size={18} className="text-blue-400" />
                    Ajustar Prioridade de Processos da CPU
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Modifique a prioridade de agendamento (Quanta/Time-slice) para jogos ou aplicações de alta demanda.
                  </p>
                </div>
                <button
                  onClick={loadProcesses}
                  disabled={isRefreshingProcesses}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg border border-zinc-700 transition-colors shrink-0"
                >
                  <RefreshCw size={13} className={isRefreshingProcesses ? 'animate-spin' : ''} />
                  Atualizar Processos ({processList.length})
                </button>
              </div>

              {}
              <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2">
                <Search size={14} className="text-zinc-500 shrink-0" />
                <input
                  type="text"
                  placeholder="Filtrar por nome de executável ou PID (ex: cs2, discord, chrome)..."
                  value={processSearch}
                  onChange={(e) => setProcessSearch(e.target.value)}
                  className="bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none w-full"
                />
                {processSearch && (
                  <button onClick={() => setProcessSearch('')} className="text-[10px] text-zinc-400 hover:text-white px-1">
                    Limpar
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Processo em Execução</label>
                  <select
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs text-white rounded-lg p-2.5 focus:outline-none focus:border-blue-500"
                    onChange={(e) => setSelectedProcess(Number(e.target.value))}
                    value={selectedProcess || ''}
                  >
                    <option value="" disabled>-- Selecione um processo ({processList.length} detectados) --</option>
                    {processList
                      .filter((p) => !processSearch || p.name.toLowerCase().includes(processSearch.toLowerCase()) || String(p.pid).includes(processSearch))
                      .map((p) => (
                        <option key={p.pid} value={p.pid}>
                          {p.name} (PID: {p.pid} | {(p.mem / 1024).toFixed(0)} MB)
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Nível de Prioridade</label>
                  <select
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs text-white rounded-lg p-2.5 focus:outline-none focus:border-blue-500"
                    onChange={(e) => setSelectedPriority(e.target.value)}
                    value={selectedPriority}
                  >
                    <option value="realtime">⚡ RealTime (Extrema / Tempo Real - Máxima Prioridade)</option>
                    <option value="high">🔥 High (Alta Performance - Recomendado para Jogos)</option>
                    <option value="abovenormal">📈 AboveNormal (Acima do Normal)</option>
                    <option value="normal">⚙️ Normal (Padrão do Sistema)</option>
                    <option value="belownormal">📉 BelowNormal (Abaixo do Normal)</option>
                    <option value="low">🍃 Low / Idle (Segundo Plano / Economia)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={handleSetPriority}
                  disabled={!selectedProcess || isOptimizing}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <Zap size={14} />
                  Aplicar Prioridade ao Processo
                </button>
              </div>

              {}
              <div className="pt-3 border-t border-zinc-800">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-2">
                  Processos Ativos com Maior Consumo (1-Clique para Alta Prioridade):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {processList.slice(0, 6).map((p) => (
                    <div
                      key={p.pid}
                      className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg flex items-center justify-between gap-2 hover:border-zinc-700 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-zinc-200 truncate">{p.name}</div>
                        <div className="text-[10px] text-zinc-500">PID: {p.pid} • {(p.mem / 1024).toFixed(0)} MB</div>
                      </div>
                      <button
                        onClick={async () => {
                          setSelectedProcess(p.pid);
                          setSelectedPriority('high');
                          if (window.darkhub) {
                            addLog(`Ajustando prioridade de ${p.name} (PID: ${p.pid}) para High...`);
                            const res = await window.darkhub.optimizer.setProcessPriority({ pid: p.pid, priority: 'high' });
                            if (res?.ok) addLog(`[SUCCESS] ${p.name} agora está em Alta Prioridade.`);
                          }
                        }}
                        className="px-2 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-[10px] font-bold rounded border border-blue-500/20 shrink-0"
                      >
                        Alta Prioridade
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {}
          {toolsSubTab === 'gpu' && (
            <div className="space-y-5">
              {}
              <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Monitor size={18} className="text-indigo-400" />
                      Hardware Gráfico Detectado & Agendamento
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Identificação de GPUs dedicadas e acelerador de agendamento por hardware no kernel do Windows.
                    </p>
                  </div>
                  <button
                    onClick={loadGpuData}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg border border-zinc-700 transition-colors shrink-0"
                  >
                    <RefreshCw size={13} />
                    Atualizar Dados
                  </button>
                </div>

                {}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {gpuList.map((gpu, idx) => (
                    <div key={idx} className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-lg flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-white flex items-center gap-2">
                          {gpu.model}
                          {gpu.isDedicated ? (
                            <span className="text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full font-bold">
                              GPU DEDICADA
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full font-bold">
                              INTEGRADA
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-400">
                          {gpu.vendor} {gpu.vram > 0 ? `• VRAM: ${(gpu.vram / 1024).toFixed(1)} GB (${gpu.vram} MB)` : ''} {gpu.bus ? `• Bus: ${gpu.bus}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                  {gpuList.length === 0 && (
                    <div className="p-4 text-center text-xs text-zinc-500 col-span-2">
                      Carregando informações da GPU...
                    </div>
                  )}
                </div>

                {}
                <div className="p-4 bg-zinc-950/80 border border-zinc-800/80 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      <Zap size={14} className="text-amber-400" />
                      Agendamento de GPU Acelerado por Hardware (HAGS)
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      Transfere a gestão de memória de vídeo e renderização diretamente para a GPU dedicada, reduzindo a latência da CPU.
                    </div>
                  </div>
                  <button
                    onClick={handleToggleHags}
                    disabled={isOptimizing}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors shrink-0 ${
                      hagsEnabled
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
                        : 'bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700'
                    }`}
                  >
                    {hagsEnabled ? 'HAGS Ativado' : 'HAGS Desativado (Ativar)'}
                  </button>
                </div>
              </div>

              {}
              <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Gamepad2 size={18} className="text-emerald-400" />
                    Forçar GPU Dedicada em Aplicativos & Jogos
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Configura o registro DirectX (<code className="text-indigo-300 font-mono">UserGpuPreferences</code>) para garantir que o Windows execute o aplicativo sempre na GPU de maior performance.
                  </p>
                </div>

                <div className="space-y-3">
                  {}
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                      Caminho do Executável (.exe) ou Selecione um Processo Ativo
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="C:\Caminho\Do\Jogo\game.exe"
                        value={selectedGpuAppPath}
                        onChange={(e) => setSelectedGpuAppPath(e.target.value)}
                        className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 flex-1 font-mono"
                      />
                      <button
                        onClick={handleBrowseGpuApp}
                        className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-lg border border-zinc-700 transition-colors flex items-center gap-1.5 shrink-0"
                      >
                        <FolderOpen size={14} />
                        Procurar .exe
                      </button>
                    </div>
                  </div>

                  {}
                  {processList.length > 0 && (
                    <div>
                      <label className="block text-[11px] font-medium text-zinc-500 mb-1">
                        Ou escolha rapidamente a partir dos processos em execução:
                      </label>
                      <select
                        className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 rounded-lg p-2 focus:outline-none focus:border-blue-500 font-mono"
                        onChange={(e) => {
                          const proc = processList.find(p => p.pid === Number(e.target.value));
                          if (proc && proc.path) setSelectedGpuAppPath(proc.path);
                          else if (proc) setSelectedGpuAppPath(proc.name);
                        }}
                        defaultValue=""
                      >
                        <option value="" disabled>-- Selecionar processo ativo com caminho --</option>
                        {processList
                          .filter(p => p.path)
                          .map((p) => (
                            <option key={p.pid} value={p.pid}>
                              {p.name} ({p.path})
                            </option>
                          ))}
                      </select>
                    </div>
                  )}

                  {}
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                      Modo de Desempenho Gráfico
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedGpuPref('high_performance')}
                        className={`p-3 rounded-lg border text-left transition-colors ${
                          selectedGpuPref === 'high_performance'
                            ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <div className="text-xs font-bold flex items-center gap-1.5">
                          <Zap size={14} className="text-emerald-400" />
                          Alto Desempenho
                        </div>
                        <div className="text-[10px] text-zinc-400 mt-1">Força GPU Dedicada (NVIDIA / AMD)</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedGpuPref('power_saving')}
                        className={`p-3 rounded-lg border text-left transition-colors ${
                          selectedGpuPref === 'power_saving'
                            ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <div className="text-xs font-bold flex items-center gap-1.5">
                          <Laptop size={14} className="text-blue-400" />
                          Economia de Energia
                        </div>
                        <div className="text-[10px] text-zinc-400 mt-1">Usa GPU Integrada (Intel/Vega)</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedGpuPref('default')}
                        className={`p-3 rounded-lg border text-left transition-colors ${
                          selectedGpuPref === 'default'
                            ? 'bg-zinc-800 border-zinc-600 text-zinc-200'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <div className="text-xs font-bold flex items-center gap-1.5">
                          <Settings size={14} className="text-zinc-400" />
                          Padrão do Windows
                        </div>
                        <div className="text-[10px] text-zinc-400 mt-1">Decisão automática do OS</div>
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={handleSetGpuPreference}
                    disabled={!selectedGpuAppPath.trim() || isOptimizing}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    <Check size={14} />
                    Salvar Preferência de GPU
                  </button>
                </div>
              </div>

              {}
              <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
                <div className="flex items-center justify-between gap-3 border-b border-zinc-800 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-white">Aplicativos com Preferência Gráfica Configurada</h3>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Lista de jogos e programas registrados no Windows DirectX com preferências manuais de GPU.
                    </p>
                  </div>
                  <span className="text-xs font-mono px-2 py-1 bg-zinc-800 text-zinc-300 rounded-md">
                    {gpuPreferences.length} cadastrados
                  </span>
                </div>

                <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-lg bg-zinc-950 max-h-72 overflow-y-auto">
                  {gpuPreferences.map((item, idx) => (
                    <div key={idx} className="p-3.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white flex items-center gap-2">
                          {item.appName}
                          {item.preference === 'high_performance' ? (
                            <span className="text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full font-bold">
                              GPU DEDICADA (Alto Desempenho)
                            </span>
                          ) : item.preference === 'power_saving' ? (
                            <span className="text-[10px] px-2 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full font-bold">
                              GPU INTEGRADA
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded-full">
                              PADRÃO
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono truncate">{item.appPath}</div>
                      </div>
                      <button
                        onClick={() => handleRemoveGpuPreference(item.appPath)}
                        disabled={isOptimizing}
                        className="px-3 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-semibold rounded-lg shrink-0 flex items-center gap-1"
                      >
                        <Trash2 size={12} />
                        Remover
                      </button>
                    </div>
                  ))}
                  {gpuPreferences.length === 0 && (
                    <div className="p-8 text-center text-xs text-zinc-500">
                      Nenhum aplicativo com preferência gráfica personalizada registrado. Adicione acima para forçar GPU dedicada.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {}
          {toolsSubTab === 'memory' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
                <h3 className="text-base font-bold text-white">Memória Virtual (Pagefile)</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Inicial (MB)</label>
                    <input
                      type="number"
                      value={pagefileInitial}
                      onChange={(e) => setPagefileInitial(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Máximo (MB)</label>
                    <input
                      type="number"
                      value={pagefileMax}
                      onChange={(e) => setPagefileMax(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-white"
                    />
                  </div>
                </div>
                <button
                  onClick={() => runRoutine(`pagefile:${pagefileInitial}:${pagefileMax}`, 'Configurar Pagefile')}
                  disabled={isOptimizing}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold"
                >
                  Definir Pagefile
                </button>
              </div>

              <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
                <h3 className="text-base font-bold text-white">Hibernação do Sistema</h3>
                <p className="text-xs text-zinc-400">
                  Desativar a hibernação exclui o <code className="text-purple-400 font-mono">hiberfil.sys</code>, liberando múltiplos GBs no SSD.
                </p>
                <div className="flex gap-2.5">
                  <button
                    onClick={() => runRoutine('hibernation:off', 'Desativar Hibernação')}
                    disabled={isOptimizing}
                    className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold"
                  >
                    Desativar Hibernação
                  </button>
                  <button
                    onClick={() => runRoutine('hibernation:on', 'Ativar Hibernação')}
                    disabled={isOptimizing}
                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold"
                  >
                    Ativar Hibernação
                  </button>
                </div>
              </div>
            </div>
          )}

          {}
          {toolsSubTab === 'features' && (
            <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
              <h3 className="text-base font-bold text-white">Recursos Opcionais do Windows (Dev & VM)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
                  <div className="text-xs font-bold text-white">WSL (Linux Subsystem)</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => runRoutine('winfeature:wsl', 'Ativar WSL')}
                      className="flex-1 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold"
                    >
                      Ativar
                    </button>
                    <button
                      onClick={() => runRoutine('revert-winfeature:wsl', 'Desativar WSL')}
                      className="flex-1 py-1.5 border border-zinc-700 text-zinc-300 rounded text-xs"
                    >
                      Desativar
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
                  <div className="text-xs font-bold text-white">Hyper-V (Virtualização)</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => runRoutine('winfeature:hyperv', 'Ativar Hyper-V')}
                      className="flex-1 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold"
                    >
                      Ativar
                    </button>
                    <button
                      onClick={() => runRoutine('revert-winfeature:hyperv', 'Desativar Hyper-V')}
                      className="flex-1 py-1.5 border border-zinc-700 text-zinc-300 rounded text-xs"
                    >
                      Desativar
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
                  <div className="text-xs font-bold text-white">Windows Sandbox</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => runRoutine('winfeature:sandbox', 'Ativar Sandbox')}
                      className="flex-1 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold"
                    >
                      Ativar
                    </button>
                    <button
                      onClick={() => runRoutine('revert-winfeature:sandbox', 'Desativar Sandbox')}
                      className="flex-1 py-1.5 border border-zinc-700 text-zinc-300 rounded text-xs"
                    >
                      Desativar
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
                  <div className="text-xs font-bold text-white">Execution Policy</div>
                  <select
                    value={executionPolicy}
                    onChange={(e) => {
                      setExecutionPolicy(e.target.value);
                      runRoutine(`execpolicy:${e.target.value}`, `Definir Execution Policy para ${e.target.value}`);
                    }}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-1.5 text-xs text-white"
                  >
                    <option value="RemoteSigned">RemoteSigned</option>
                    <option value="Bypass">Bypass</option>
                    <option value="Unrestricted">Unrestricted</option>
                    <option value="Restricted">Restricted</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {}
      {activeTab === 'audit' && (
        <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-white">Histórico de Auditoria do Sistema</h3>
              <p className="text-xs text-zinc-400">
                Log persistente em disco com verificação pós-aplicação e exit codes.
              </p>
            </div>
            <button
              onClick={loadAuditLog}
              disabled={auditLoading}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-zinc-700"
            >
              <RefreshCw size={13} className={auditLoading ? 'animate-spin' : ''} /> Atualizar
            </button>
          </div>

          <div className="divide-y divide-zinc-800 max-h-96 overflow-y-auto border border-zinc-800 rounded-lg bg-zinc-950">
            {auditLog.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500">Nenhum registro de auditoria gravado.</div>
            ) : (
              auditLog.map((entry, index) => {
                const isExpanded = auditExpanded.has(index);
                const ok = entry.ok !== false;
                return (
                  <div key={index} className="p-3">
                    <button
                      onClick={() => toggleAuditExpanded(index)}
                      className="w-full flex items-center justify-between text-left gap-3"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {ok ? (
                          <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                        ) : (
                          <AlertCircle size={15} className="text-red-400 shrink-0" />
                        )}
                        <span className="text-[10px] px-1.5 py-0.2 bg-zinc-800 text-zinc-300 rounded font-mono shrink-0">
                          {entry.type}
                        </span>
                        <span className="text-xs text-zinc-200 truncate">
                          {entry.opId || entry.command || entry.message || '—'}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                        {entry.ts ? new Date(entry.ts).toLocaleTimeString() : ''}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="mt-2 p-3 bg-zinc-900 border border-zinc-800 rounded text-[11px] font-mono space-y-1 text-zinc-300">
                        {entry.message && <div><span className="text-zinc-500">Mensagem:</span> {entry.message}</div>}
                        {entry.error && <div><span className="text-red-400">Erro:</span> {entry.error}</div>}
                        {entry.durationMs && <div><span className="text-zinc-500">Duração:</span> {entry.durationMs}ms</div>}
                        {entry.stdout && (
                          <pre className="p-2 bg-zinc-950 rounded text-zinc-400 text-[10px] overflow-x-auto">{entry.stdout}</pre>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-lg">
        <div
          onClick={() => setShowConsole(!showConsole)}
          className="p-3.5 bg-zinc-850 hover:bg-zinc-800 cursor-pointer flex items-center justify-between transition-colors"
        >
          <div className="flex items-center gap-2">
            <Terminal size={15} className="text-purple-400" />
            <span className="text-xs font-bold text-white">Terminal de Execução & Eventos</span>
            {logs.length > 0 && (
              <span className="px-1.5 py-0.2 bg-zinc-800 text-zinc-400 rounded text-[10px]">
                {logs.length} eventos
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isOptimizing && (
              <span className="flex items-center gap-1.5 text-[11px] text-blue-400 font-medium animate-pulse">
                <Loader2 size={12} className="animate-spin" /> Em execução
              </span>
            )}
            {showConsole ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
          </div>
        </div>

        {showConsole && (
          <div className="p-4 bg-zinc-950 font-mono text-xs max-h-56 overflow-y-auto space-y-1 divide-y divide-zinc-900">
            {logs.length === 0 ? (
              <div className="text-zinc-600 text-center py-4">Nenhum evento registrado nesta sessão.</div>
            ) : (
              logs.map((l, i) => (
                <div
                  key={i}
                  className={`pt-1 ${
                    l.includes('SUCCESS')
                      ? 'text-emerald-400'
                      : l.includes('ERROR')
                      ? 'text-red-400'
                      : l.includes('WARNING')
                      ? 'text-amber-400'
                      : 'text-zinc-300'
                  }`}
                >
                  {l}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
