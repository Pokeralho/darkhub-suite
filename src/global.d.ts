/// <reference types="vite/client" />

export interface DownloadItem {
  id: string;
  url: string;
  fileName: string;
  dir: string | null;
  filePath: string | null;
  size: number;
  downloaded: number;
  status: 'queued' | 'downloading' | 'paused' | 'completed' | 'error' | 'canceled';
  error: string | null;
  resumable: boolean;
  connections: number;
  speedLimitKBps: number;
  speedBps: number;
  etaSeconds: number | null;
  created: number;
  completedAt: number | null;
  segments: number[];
  hasSha256: boolean;
}

export interface DownloadSettings {
  downloadDir: string;
  maxConcurrent: number;
  defaultConnections: number;
  maxConnections: number;
  globalSpeedLimitKBps: number;
  retries: number;
  organizeByCategory: boolean;
  schedule: { enabled: boolean; start: string; stop: string };
}

export interface DarkHubAPI {
  darkos: import('./types/darkos').DarkOSAPI;
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
    getResourceUsage: () => Promise<{ ok: boolean; totalCpuPercent?: number; totalWorkingSetMb?: number; processes?: Array<{ pid: number; type: string; name?: string; cpuPercent: number; workingSetMb: number }>; error?: string }>;
  };
  downloads: {
    list: () => Promise<{ ok: boolean; items?: DownloadItem[]; settings?: DownloadSettings; error?: string }>;
    add: (payload: { url: string; fileName?: string; dir?: string; connections?: number; speedLimitKBps?: number; sha256?: string; referer?: string; startNow?: boolean }) => Promise<{ ok: boolean; id?: string; error?: string }>;
    pause: (id: string) => Promise<{ ok: boolean; error?: string }>;
    resume: (id: string) => Promise<{ ok: boolean; error?: string }>;
    pauseAll: () => Promise<{ ok: boolean }>;
    resumeAll: () => Promise<{ ok: boolean }>;
    cancel: (id: string, deleteFiles?: boolean) => Promise<{ ok: boolean; error?: string }>;
    remove: (id: string, deleteFile?: boolean) => Promise<{ ok: boolean; error?: string }>;
    clearFinished: () => Promise<{ ok: boolean }>;
    getSettings: () => Promise<{ ok: boolean; settings?: DownloadSettings }>;
    setSettings: (patch: Partial<DownloadSettings>) => Promise<{ ok: boolean; settings?: DownloadSettings; error?: string }>;
    showInFolder: (id: string) => Promise<{ ok: boolean; error?: string }>;
    chooseDir: () => Promise<{ ok: boolean; dir?: string; canceled?: boolean }>;
    onUpdate: (cb: (items: DownloadItem[]) => void) => () => void;
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
    inject: (payload: { processName: string; dllPath: string }) => Promise<{ ok: boolean; message?: string; error?: string }>;
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
    applyTweak: (id: 'optimize-ram' | 'clean-temp' | 'repair-windows') => Promise<any>;
    getRunningProcesses: () => Promise<any>;
    setProcessPriority: (payload: {pid: number, priority: string}) => Promise<any>;
    getGpuPreferences: () => Promise<{ ok: boolean; preferences?: Array<{ appPath: string; appName: string; preference: string; rawValue: string }>; error?: string }>;
    setGpuPreference: (payload: { appPath: string; preference: 'high_performance' | 'power_saving' | 'default' }) => Promise<{ ok: boolean; msg?: string; error?: string }>;
    removeGpuPreference: (payload: { appPath: string }) => Promise<{ ok: boolean; msg?: string; error?: string }>;
    getGpuInfo: () => Promise<{ ok: boolean; controllers?: Array<{ model: string; vendor: string; vram: number; bus: string; isDedicated: boolean }>; error?: string }>;
    getHagsStatus: () => Promise<{ ok: boolean; enabled: boolean; value: string; error?: string }>;
    setHagsStatus: (payload: { enabled: boolean }) => Promise<{ ok: boolean; msg?: string; error?: string }>;
    revertHags: () => Promise<{ ok: boolean; msg?: string; error?: string }>;
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
    revertExtremeKernelMod: () => Promise<any>;
    revertServicesTweak: () => Promise<any>;
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
    changeMasterPassword: (payload: { currentMasterPassword: string; newMasterPassword: string }) => Promise<any>;
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
    onChanged: (callback: (payload: { running: boolean; state: any }) => void) => () => void;
  };
  latency: {
    queryTimer: () => Promise<any>;
    getCpuTopology: () => Promise<any>;
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
  dlss5: {
    detectGpu: () => Promise<{ ok: boolean; vendor: 'nvidia' | 'amd' | 'intel' | 'other'; model: string; driverVersion: string; isRtx: boolean; isAmd: boolean; isIntel: boolean; defaultProfile: 'nvidia' | 'amd' }>;
    scanGame: (payload: string | { path: string }) => Promise<{
      ok: boolean;
      gameName?: string;
      exePath?: string | null;
      targetDir?: string;
      searchBaseDir?: string;
      engine?: string;
      graphicsApi?: {
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
      };
      routeInfo?: {
        recommendedRoute: string;
        routeName: string;
        routeBadge: string;
        routeDescription: string;
        allowedRoutes: Array<{ id: string; name: string; description: string }>;
        isRemix: boolean;
        is64: boolean;
        neuralUpstreamRecommended: boolean;
      };
      dlssDetected?: boolean;
      existingDlls?: string[];
      installed?: boolean;
      installedProfile?: string | null;
      installedLoader?: string | null;
      manifest?: any;
      error?: string;
    }>;
    apply: (payload: {
      gamePath?: string;
      targetDir?: string;
      profile: 'nvidia' | 'amd' | 'intel';
      loader?: string;
      route?: string;
      neuralUpstream?: boolean;
      enableFrameGen?: boolean;
      upscaleQuality?: string;
      enableOverlay?: boolean;
      upscaler?: string;
      signatureBypass?: boolean;
      amdEngine?: 'neural' | 'zluda' | 'fsr';
      zludaCache?: boolean;
      neuralPasses?: 1 | 2 | 3;
    }) => Promise<{
      ok: boolean;
      msg?: string;
      error?: string;
      targetDir?: string;
      profile?: string;
      loader?: string;
      route?: string;
      neuralUpstream?: boolean;
      injectedFiles?: Array<{ file: string; sha256?: string }>;
    }>;
    revert: (payload: string | { gamePath?: string; targetDir?: string }) => Promise<{ ok: boolean; msg?: string; error?: string; restoredCount?: number }>;
    getSteamGames: () => Promise<Array<{
      appId: string;
      name: string;
      installDir: string;
      headerUrl: string;
      isApplied: boolean;
    }>>;
    getRecentGames: () => Promise<Array<{ gameName: string; targetDir: string; exePath?: string | null; profile: string; loader: string; route?: string; neuralUpstream?: boolean; engine?: string; graphicsApi?: any; lastAppliedAt?: number }>>;
    getProvenance: () => Promise<{
      ok: boolean;
      title: string;
      version: string;
      architecture: string;
      hasBinaries: boolean;
      sourceDir: string;
      filesCount: number;
      files: Array<{ name: string; size: number; sha256?: string; isBinary: boolean }>;
      upstreamRepositories: Array<{ name: string; url: string; role: string }>;
      guarantee: string;
    }>;
    downloadBinaries: () => Promise<any>;
    openFolder: (targetPath: string) => Promise<{ ok: boolean; error?: string }>;
    onLog: (callback: (message: string) => void) => () => void;
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
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    close: () => Promise<void>;
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
}

declare module 'crypto-js';

declare global {
  interface Window {
    darkhub: DarkHubAPI;
  }
}
