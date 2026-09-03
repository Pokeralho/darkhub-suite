/// <reference types="vite/client" />

export interface DarkHubAPI {
  hardware: {
    onUpdate: (callback: (data: any) => void) => () => void;
    startPolling: () => Promise<{ ok: boolean; activeConsumers?: number }>;
    stopPolling: () => Promise<{ ok: boolean; activeConsumers?: number }>;
  };
  system: {
    getInfo: () => Promise<any>;
    getMetrics: () => Promise<any>;
    getGraphics: () => Promise<any>;
    getBios: () => Promise<any>;
    getTemperatures: () => Promise<any>;
    getLatency: (payload?: any) => Promise<any>;
    getNetwork: () => Promise<any>;
    getStorage: () => Promise<any>;
    getJunkEstimate: (payload?: any) => Promise<any>;
    getSnapshot: () => Promise<any>;
    getAdvancedHardware: () => Promise<any>;
    getDeepHardwareInfo: (forceRefresh?: boolean) => Promise<any>;
    runBenchmark: () => Promise<any>;
  };
  app: {
    getAbout: () => Promise<any>;
  };
  pge: {
    openPortable: () => Promise<any>;
  };
  settings: {
    getConfig: () => Promise<any>;
    updateTelemetry: (payload: {
      bugReportsEnabled: boolean;
    }) => Promise<any>;
    updateLiveServices: (payload: {
      latencyGuardian?: boolean;
      overlay?: boolean;
      autoClicker?: boolean;
    }) => Promise<any>;
    updateWindowBehavior: (payload: {
      closeToTray: boolean;
    }) => Promise<any>;
    updateStartupBehavior: (payload: {
      openAtLogin: boolean;
      openAsHidden?: boolean;
    }) => Promise<any>;
  };
  injector: {
    inject: (payload: any) => Promise<any>;
  };
  telemetry: {
    testBugReport: () => Promise<any>;
  };
    optimizer: {
    listOperations: () => Promise<any>;
    listProfiles: () => Promise<any>;
    checkIsAdmin: () => Promise<boolean>;
    createRestorePoint: () => Promise<any>;
    getAuditLog: (payload?: { limit?: number }) => Promise<{ ok: boolean; entries: any[]; error?: string }>;
    analyze: (payload: any) => Promise<any>;
    run: (payload: { operationIds: string[]; options?: { concurrency?: number } }) => Promise<any>;
    runRoutine: (routineId: string) => Promise<any>;
    dnsBenchmark: (payload?: any) => Promise<any>;
    getDnsState: () => Promise<any>;
    applyDns: (payload: any) => Promise<any>;
    undoDns: (payload: any) => Promise<any>;
    onRunEvent: (callback: (payload: any) => void) => () => void;
    listBloatware: () => Promise<any>;
    removeSelectedBloatware: (payload: { appIds: string[] } | string[]) => Promise<any>;
    applyTweak?: (id: string, options?: any) => Promise<any>;
    getRunningProcesses: () => Promise<any>;
    setProcessPriority: (payload: {pid: number, priority: string}) => Promise<any>;
    getGpuPreferences: () => Promise<{ ok: boolean; preferences?: Array<{ appPath: string; appName: string; preference: string; rawValue: string }>; error?: string }>;
    setGpuPreference: (payload: { appPath: string; preference: 'high_performance' | 'power_saving' | 'default' }) => Promise<{ ok: boolean; msg?: string; error?: string }>;
    removeGpuPreference: (payload: { appPath: string }) => Promise<{ ok: boolean; msg?: string; error?: string }>;
    getGpuInfo: () => Promise<{ ok: boolean; controllers?: Array<{ model: string; vendor: string; vram: number; bus: string; isDedicated: boolean }>; error?: string }>;
    getHagsStatus: () => Promise<{ ok: boolean; enabled: boolean; value: string; error?: string }>;
    setHagsStatus: (payload: { enabled: boolean }) => Promise<{ ok: boolean; msg?: string; error?: string }>;
    deepTweaksList: () => Promise<any>;
    deepTweaksStatus: () => Promise<{ ok: boolean; status: Record<string, boolean> }>;
    deepTweaksAnalyze: (payload: { tweakIds: string[] }) => Promise<any>;
    deepTweaksApply: (payload: { tweakIds: string[] }) => Promise<any>;
    deepTweaksRevert: (payload: { tweakIds: string[] }) => Promise<any>;
    deepTweaksUndo: (payload: { undoToken: string }) => Promise<any>;
    setDnsServers: (payload: { primary: string; secondary: string }) => Promise<any>;
    getStartupItems: () => Promise<any>;
    disableStartupItem: (payload: {name: string, type: string, path: string}) => Promise<any>;
    getServices: () => Promise<any>;
    disableService: (name: string) => Promise<any>;
    getInstalledPrograms: () => Promise<{ ok: boolean; programs?: Array<{ name: string; version: string; publisher: string; installDate: string; installLocation: string; uninstallString: string; isQuiet: boolean }>; error?: string }>;
    uninstallProgram: (uninstallString: string) => Promise<any>;
    uninstallProgramWithLeftovers: (payload: { name: string; uninstallString: string; installLocation?: string; publisher?: string }) => Promise<{ ok: boolean; msg?: string; leftoversRemoved?: number; error?: string }>;
    advancedNetworkApply: () => Promise<{ ok: boolean; msg?: string; error?: string }>;
    advancedNetworkRevert: () => Promise<{ ok: boolean; msg?: string; error?: string }>;
    globalRecommendedTweaks: () => Promise<any>;
    getDefenderControlStatus: () => Promise<any>;
    applyDefenderControl: (payload: { action: 'disable' | 'enable' | 'check' }) => Promise<any>;
    openTamperSettings: () => Promise<any>;
    applyMsiMode: () => Promise<any>;
    applyExtremeKernelMod: () => Promise<any>;
    applyExtremeNetworkMod: () => Promise<any>;
    applyCpuUnpark: () => Promise<any>;
  };
  dialog: {
    selectFiles: (options: any) => Promise<any>;
    selectFolder: (options: any) => Promise<any>;
    saveFile: (options: any) => Promise<any>;
    grantDroppedFiles: (filePaths: string[]) => Promise<{ ok: boolean; granted?: string[]; error?: string }>;
  };
  files: {
    convertImages: (payload: any) => Promise<any>;
    convertMedia: (payload: any) => Promise<any>;
    checkLibreOffice: () => Promise<any>;
    convertDocuments: (payload: any) => Promise<any>;
    archiveOperation: (payload: any) => Promise<any>;
  };
  youtube: {
    getVideoInfo: (payload: any) => Promise<any>;
    download: (payload: any) => Promise<any>;
    cancel: () => Promise<{ ok: boolean; stopped?: boolean; error?: string }>;
    onProgress: (callback: (data: { percent: number; totalSize: string; speed: string; eta: string; line: string }) => void) => () => void;
  };
  ocr: {
    extractText: (payload: any) => Promise<any>;
  };
  vault: {
    status: () => Promise<{ initialized: boolean; locked: boolean; autoLockMinutes: number }>;
    setAutoLockMinutes: (minutes: number) => Promise<{ ok: boolean }>;
    init: (payload: { masterPassword: string }) => Promise<any>;
    unlock: (payload: { masterPassword: string }) => Promise<any>;
    unlockWithRecoveryWords: (payload: { words: string }) => Promise<any>;
    lock: () => Promise<{ ok: boolean }>;
    list: () => Promise<any>;
    add: (payload: { site: string; username: string; password: string; notes?: string }) => Promise<any>;
    update: (payload: { id: string; site?: string; username?: string; password?: string; notes?: string }) => Promise<any>;
    remove: (payload: { id: string }) => Promise<any>;
    reveal: (payload: { id: string }) => Promise<any>;
    copyPassword: (payload: { id: string }) => Promise<any>;
    changeMasterPassword: (payload: { newMasterPassword: string }) => Promise<any>;
    regenerateRecoveryWords: () => Promise<any>;
    export: (payload: { targetPath: string }) => Promise<any>;
    import: (payload: { sourcePath: string }) => Promise<any>;
  };
  security: {
    scanProcesses: () => Promise<any>;
    scanMalware: () => Promise<any>;
    killProcess: (pid: number) => Promise<any>;
    auditTracking: () => Promise<any>;
    blockTracking: () => Promise<any>;
    unblockTracking: () => Promise<any>;
    optimizeLatency: () => Promise<any>;
    getSecurityScore: () => Promise<any>;
    getTrackingDomains: () => Promise<any>;
    setCustomTrackingDomains: (payload: any) => Promise<any>;
    scanUrl: (payload: { url: string }) => Promise<any>;
    enablePhishingShield: () => Promise<any>;
    disablePhishingShield: () => Promise<any>;
    getPhishingShieldStatus: () => Promise<any>;
    getLiveNetworkConnections: () => Promise<any>;
    checkRansomwareArmor: () => Promise<any>;
    enableRansomwareArmor: () => Promise<any>;
    getCommunityRules: () => Promise<any>;
    importCommunityRules: (payload: any) => Promise<any>;
    resetCommunityRules: () => Promise<any>;
  };
  fs: {
    readFile: (path: string) => Promise<any>;
    writeFile: (payload: any) => Promise<any>;
  };
  autoclicker: {
    status: () => Promise<any>;
    start: (payload: any) => Promise<any>;
    stop: () => Promise<any>;
    toggle: (payload?: any) => Promise<any>;
    getHotkey: () => Promise<any>;
    setHotkey: (payload: any) => Promise<any>;
    setTabActive: (active: boolean) => Promise<any>;
  };
  latency: {
    getConfig: () => Promise<any>;
    setConfig: (payload: any) => Promise<any>;
    enableUltra: () => Promise<any>;
    enableUltraStable: (payload: any) => Promise<any>;
    disableUltra: () => Promise<any>;
    toggleUltra: () => Promise<any>;
    boostNow: () => Promise<any>;
    launchGameWithProfile: (payload: any) => Promise<any>;
  };
  library: {
    fetchCover: (payload: { gameName: string; forceRefresh?: boolean }) => Promise<any>;
    list: () => Promise<any>;
    upsert: (payload: any) => Promise<any>;
    upsertBulk: (payload: any) => Promise<any>;
    remove: (payload: any) => Promise<any>;
    discover: () => Promise<any>;
    onUpdated: (callback: (data: any) => void) => () => void;
    onGameStarted: (callback: (data: any) => void) => () => void;
    onGameStopped: (callback: (data: any) => void) => () => void;
    onActivityLogged: (callback: (data: any) => void) => () => void;
  };
  setup: {
    installWinget: (apps: string[]) => Promise<any>;
    detectHardware: () => Promise<any>;
    onInstallProgress: (callback: (log: any) => void) => () => void;
  };
  updater: {
    getStatus: () => Promise<any>;
    check: () => Promise<any>;
    download: () => Promise<any>;
    install: () => Promise<any>;
    onEvent: (callback: (payload: any) => void) => () => void;
  };
  injector: {
    inject: (payload: { processName: string; dllPath: string }) => Promise<{ ok: boolean; message?: string; error?: string }>;
  };
  darkpacer: {
    start: (payload?: { targetFps?: number; pacingMode?: string }) => Promise<{ ok: boolean; isRunning: boolean; targetFps?: number; pacingMode?: string }>;
    stop: () => Promise<{ ok: boolean; isRunning: boolean }>;
    updateConfig: (payload: { targetFps?: number; pacingMode?: string }) => Promise<{ ok: boolean; targetFps?: number; pacingMode?: string }>;
    getMetrics: () => Promise<{
      isRunning: boolean;
      targetFps: number;
      pacingMode: string;
      targetFrametimeMs: number;
      currentFps: number;
      avgFps: number;
      low1Percent: number;
      low01Percent: number;
      currentFrametimeMs: number;
      frametimeJitterMs: number;
      stutterCount: number;
      activeGame?: string | null;
      history: number[];
    }>;
    createOverlay: () => Promise<{ ok: boolean }>;
    closeOverlay: () => Promise<{ ok: boolean }>;
    toggleOverlay: () => Promise<{ ok: boolean; isVisible: boolean }>;
    setOverlayClickThrough: (enabled: boolean) => Promise<{ ok: boolean; clickThrough: boolean }>;
    setOverlayConfig: (config: any) => Promise<{ ok: boolean; overlayConfig: any }>;
    getOverlayStatus: () => Promise<{ isOpen: boolean; clickThrough: boolean; config: any }>;
    onMetrics: (callback: (metrics: any) => void) => () => void;
  };
  framepacer: {
    start: (payload?: { targetFps?: number; pacingMode?: string }) => Promise<{ ok: boolean; isRunning: boolean; targetFps?: number; pacingMode?: string }>;
    stop: () => Promise<{ ok: boolean; isRunning: boolean }>;
    updateConfig: (payload: { targetFps?: number; pacingMode?: string }) => Promise<{ ok: boolean; targetFps?: number; pacingMode?: string }>;
    getMetrics: () => Promise<{
      isRunning: boolean;
      targetFps: number;
      pacingMode: string;
      targetFrametimeMs: number;
      currentFps: number;
      avgFps: number;
      low1Percent: number;
      low01Percent: number;
      currentFrametimeMs: number;
      frametimeJitterMs: number;
      stutterCount: number;
      activeGame?: string | null;
      history: number[];
    }>;
    createOverlay: () => Promise<{ ok: boolean }>;
    closeOverlay: () => Promise<{ ok: boolean }>;
    toggleOverlay: () => Promise<{ ok: boolean; isVisible: boolean }>;
    setOverlayClickThrough: (enabled: boolean) => Promise<{ ok: boolean; clickThrough: boolean }>;
    setOverlayConfig: (config: any) => Promise<{ ok: boolean; overlayConfig: any }>;
    getOverlayStatus: () => Promise<{ isOpen: boolean; clickThrough: boolean; config: any }>;
    onMetrics: (callback: (metrics: any) => void) => () => void;
  };
  optiscaler: {
    analyze: (payload: any) => Promise<any>;
    apply: (payload: any) => Promise<any>;
    listBackups: (payload: any) => Promise<any>;
    restoreBackup: (payload: any) => Promise<any>;
    deleteBackup: (payload: any) => Promise<any>;
    createManualBackup: (payload: any) => Promise<any>;
    checkUpdate: () => Promise<any>;
    downloadUpdate: (payload: string | { url: string; version?: string }) => Promise<any>;
  };
  metadata: {
    read: (path: string) => Promise<any>;
    remove: (payload: any) => Promise<any>;
    update: (payload: any) => Promise<any>;
  };
  shell: {
    openExternal: (url: string) => Promise<void>;
  };
  discord: {
    sendMessage: (payload: any) => Promise<any>;
    reportError: (payload: any) => Promise<any>;
  };
  window: {
    minimize: () => void;
    maximize: () => void;
    isMaximized: () => Promise<boolean>;
    close: () => void;
  };
  network: {
    ping: (host: string) => Promise<any>;
    portScan: (payload: any) => Promise<any>;
    flushDns: () => Promise<any>;
    resetTcp: () => Promise<any>;
    dnsInfo: () => Promise<any>;
    tracert: (host: string) => Promise<any>;
    adapterInfo: () => Promise<any>;
    renewIp: () => Promise<any>;
  };
  steamLua: {
    getStatus: () => Promise<{
      isValid: boolean;
      isRunning: boolean;
      steamPath: string | null;
      stPlugInDir: string | null;
      depotCacheDir: string | null;
      language: string | null;
      luaCount: number;
    }>;
    listInstalled: () => Promise<Array<{
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
    }>>;
    getDetails: (appId: number) => Promise<{
      baseAppId: number;
      entries: Array<{
        id: number;
        key: string | null;
        hasKey: boolean;
        manifestId: string | null;
        commentedManifestId: string | null;
        comment: string | null;
        sizeOnDisk: number | null;
        isEnabled: boolean;
        isLocked: boolean;
      }>;
      disabledEntries: Array<{
        id: number;
        key: string | null;
        hasKey: boolean;
        manifestId: string | null;
        commentedManifestId: string | null;
        comment: string | null;
        sizeOnDisk: number | null;
        isEnabled: boolean;
        isLocked: boolean;
      }>;
      activePins: Record<string, string>;
      commentedPins: Record<string, string>;
      depotCount: number;
      dlcCount: number;
      hasActivePins: boolean;
      rawText: string;
      appId: number;
      filePath: string;
    } | null>;
    saveLuaText: (payload: { appId: number; rawText: string }) => Promise<boolean>;
    toggleDepot: (payload: { appId: number; depotId: number; options: { enabled?: boolean; locked?: boolean } }) => Promise<any>;
    deleteLua: (appId: number) => Promise<boolean>;
    installLua: (payload: { filePath: string; appId: number; options?: { autoUpdate?: boolean; forceLocked?: boolean } }) => Promise<{ ok: boolean; targetFile?: string }>;
    installManifest: (filePath: string) => Promise<{ ok: boolean; targetFile?: string }>;
    restartSteam: () => Promise<boolean>;
    fetchStoreInfo: (appId: number) => Promise<{
      appId: number;
      name: string;
      headerImage: string;
      dlcList: number[];
      developers: string[];
      publishers: string[];
      genres: string[];
    } | null>;
    getStorePluginStatus: () => Promise<{
      isInstalled: boolean;
      isDaemonRunning: boolean;
      rpcReachable?: boolean;
      cdpReachable?: boolean;
      storeTabsDetected?: number;
      storeTabsInjected?: number;
      lastInjectionError?: string;
    }>;
    toggleStorePlugin: (enable: boolean) => Promise<{
      ok: boolean;
      isInstalled: boolean;
      isDaemonRunning?: boolean;
      rpcReachable?: boolean;
      cdpReachable?: boolean;
      storeTabsDetected?: number;
      storeTabsInjected?: number;
      requiresRestart?: boolean;
      error?: string;
      lastInjectionError?: string;
    }>;
    refreshLibrary: () => Promise<{ ok: boolean }>;
    openStPlugInFolder?: () => Promise<any>;
    toggleOnlineFix?: (payload: { appId: number; enable: boolean }) => Promise<any>;
    configureSpacewarAppIdTxt?: (payload: { targetPath: string; appId?: number }) => Promise<{ ok: boolean; path?: string; appId?: number; error?: string }>;
    downloadAndInstallPackage: (params: {
      appId: number;
      autoUpdate?: boolean;
      onlineFix?: boolean;
    }) => Promise<{
      ok: boolean;
      appId?: number;
      packageDownloaded?: boolean;
      manifestsCount?: number;
      error?: string;
      message?: string;
    }>;
  };
  steamUnlocker: {
    getStatus: () => Promise<{
      isInstalled: boolean;
      mode: string;
      filesPresent: string[];
      steamPath?: string;
      error?: string;
    }>;
    install: (mode?: string) => Promise<{
      ok: boolean;
      mode?: string;
      version?: string;
      error?: string;
    }>;
    uninstall: () => Promise<{
      ok: boolean;
      error?: string;
    }>;
  };
}

declare module 'crypto-js';

declare global {
  interface Window {
    darkhub: DarkHubAPI;
  }
}
