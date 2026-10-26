/// <reference types="vite/client" />

export interface UsbPort {
  instanceId: string; name: string; kind: 'input' | 'keyboard' | 'mouse' | 'gamepad' | 'storage' | 'camera' | 'audio' | 'serial' | 'hid' | 'other';
  port: number; hub: number; status: string; enabled: boolean; problemCode: number; children: { instanceId: string; name: string; class: string }[];
}
export type KgResult<T> = { ok: boolean; status?: number; error?: string } & T;
export interface KgStatus { asfOnline: boolean; capacity: number | null; used: number; soldOut: boolean }
export interface KgPlan { id: string; kind: 'HOURS' | 'CARDS' | 'UNLIMITED'; name: string; priceCents: number; slots: number; days: number; hours?: number; summary: string; features: string[]; highlight?: boolean }
export interface KgMe { id: string; name: string; email: string; isAdmin: boolean; hasCpf: boolean }
export interface KgGame { id: number; name: string; image: string }
export interface KgAccount {
  id: string; steamLogin: string; nickname: string | null; avatar: string | null; profileUrl: string | null;
  state: 'offline' | 'paused' | 'expired' | 'missing' | 'needs_password' | 'needs_email_code' | 'needs_app_code' | 'online' | 'connecting' | 'stopped';
  playingElsewhere: boolean; games: number[]; farmCards: boolean; invisible: boolean; customGame: string | null; lastOnlineAt: string | null;
  cards: { farming: { appId: number; name: string; cardsRemaining: number; hoursPlayed: number }[]; gamesLeft: number; cardsLeft: number; timeRemaining: string; paused: boolean } | null;
}
export interface KgEntitlement { id: string; planId: string; name: string; kind: KgPlan['kind']; slots: number; active: boolean; expiresAt: string; minutesTotal: number; minutesUsed: number; accounts: KgAccount[] }
export interface KgDashboard { asfOnline: boolean; plans: KgEntitlement[] }
export interface KgLoginAttempt { id: string; method: 'qr' | 'credentials'; state: 'waiting' | 'scanned' | 'done' | 'failed'; actions: string[]; qrUrl: string | null; qrDataUrl: string | null; error: string | null }

export interface RestoreComponent {
  id: string;
  group: 'media' | 'apps' | 'gaming' | 'system';
  kind: 'capability' | 'feature' | 'store' | 'special';
  label: string;
  isoSource?: boolean;
  state: 'installed' | 'missing' | 'unavailable' | 'unknown';
  detail: string | null;
}

export interface UsbState {
  ok: boolean; error?: string; ports?: UsbPort[]; elevated?: boolean; pendingReverts?: string[];
  history?: { name: string; instanceId: string; serial: string; firstAt: number | null; lastArrivalAt: number | null; lastRemovalAt: number | null; present: boolean }[];
  drives?: { letter: string; label: string; size: number; free: number }[];
  policies?: { storageBlocked: boolean; writeProtect: boolean; selectiveSuspend: boolean | null };
}

export interface OverlaySettings { layout: 'compact' | 'advanced' | 'oc'; position: 'tl' | 'tr' | 'bl' | 'br'; scale: number; opacity: number; background: number; intervalMs: number; hotkey: string; metrics: string[]; logFolder: string }
export interface OverlayFrameStats { fps: number | null; frameTimeMs: number | null; low1: number | null; low01: number | null; maxFrameTimeMs: number; gpuBusyMs: number | null; latencyMs: number | null; presentMode: string; graph: number[] }
export interface OverlayStatus {
  ok: boolean; error?: string | null; visible?: boolean; settings?: OverlaySettings; target?: { pid: number; name: string } | null; mode?: 'foreground' | 'fixed';
  capturing?: boolean; presentMonInstalled?: boolean; stats?: OverlayFrameStats | null;
  lastSession?: { name: string; frames: number; seconds: number; avgFps: number; low1: number; low01: number; maxFrameTimeMs: number; at: number } | null;
}

export interface SaveSettings { backupRoot: string; keep: number; autoOnExit: boolean; custom: { name: string; paths: string[] }[] }
export interface SaveGame { name: string; installed: string; custom: boolean; files: number; bytes: number; registry: number; lastBackupAt: number | null; versions: number }
export interface SaveScan { ok: boolean; error?: string; games?: SaveGame[]; settings?: SaveSettings; manifestGames?: number }
export interface SaveVersion { id: string; game: string; at: number; label: string; bytes: number; groups: string[]; registry: { key: string; file: string }[] }

export interface MaintTask {
  enabled: boolean;
  enabledAt: number | null;
  freq: 'daily' | 'weekly' | 'monthly';
  time: string;
  weekday: number;
  day: number;
  options: Record<string, unknown>;
  lastRunAt: number | null;
  nextRunAt: number | null;
}

export interface MaintHistoryEntry {
  id: string;
  at: number;
  ms: number;
  ok: boolean;
  manual: boolean;
  error?: string;
  summary?: Record<string, unknown>;
}

export interface MaintState {
  ok: boolean;
  error?: string;
  tasks: Record<string, MaintTask>;
  history: MaintHistoryEntry[];
  running: string | null;
}

export interface BenchRun {
  id: string;
  at: number;
  ms: number;
  label: string;
  quick: boolean;
  context: { powerPlan: string | null; onBattery: boolean; cpu: string | null; threads: number; ramGb: number; osBuild: string; backgroundCpu: number };
  metrics: Record<string, { median: number; noise: number; samples: number[] }>;
}

export interface StartupItem {
  id: string;
  kind: 'run' | 'folder' | 'task' | 'service';
  name: string;
  key: string;
  command: string;
  exe: string;
  scope: 'user' | 'machine';
  location: string;
  hive: string | null;
  sub: string | null;
  taskPath: string | null;
  microsoft: boolean;
  state: string | null;
  enabled: boolean;
  disabledAt: number | null;
  impact: { lastMs: number | null; avgMs: number; count: number; lastAt: number } | null;
  sensitive: 'security' | 'system' | null;
  needsAdmin: boolean;
}

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

/** PowerShell Tools: result of a catalog tool run (table rows, text output, generated file or hosts file). */
export interface PsToolResult {
  ok: boolean;
  error?: string;
  errors?: Record<string, string>;
  needsConfirmation?: boolean;
  preview?: string;
  admin?: boolean;
  mutating?: boolean;
  tool?: string;
  kind?: 'table' | 'text' | 'file' | 'hosts';
  rows?: Array<Record<string, unknown>>;
  raw?: string;
  text?: string;
  code?: number;
  file?: string;
  durationMs?: number;
  path?: string;
  content?: string;
  entries?: Array<{ line: number; ip: string; hosts: string; comment: string; enabled: boolean }>;
  backups?: string[];
}

export interface PsSnippet {
  id: string;
  name: string;
  script: string;
  elevated: boolean;
  updatedAt: string;
}

export interface DriverDevice {
  instanceId: string;
  name: string;
  cls: string;
  code: number;
  reason: 'noDriver' | 'driverError' | 'restart' | 'genericGpu' | null;
  isDisplay: boolean;
  isGpu: boolean;
  vendor: string | null;
  pci: { ven: string; dev: string; subsys: string } | null;
  boardPartner: string | null;
  driverVersion: string;
  hardwareIds: string[];
  compatibleIds: string[];
}

export interface DriverPlanItem {
  id: string;
  source: 'wu' | 'vendor';
  vendor?: string;
  title: string;
  device: string;
  driverClass?: string;
  manufacturer?: string;
  version: string;
  installedVersion?: string;
  date: string;
  sizeBytes: number;
  silent: boolean;
  fixes: string[];
  recommended: boolean;
  alternative: boolean;
  updateAvailable?: boolean;
}

export interface DriverFindResult {
  ok: boolean;
  error?: string;
  devices?: DriverDevice[];
  missing?: DriverDevice[];
  gpus?: DriverDevice[];
  wu?: {
    ok: boolean; error: string; kind: string; needsUnlock: boolean; blockers: string[]; count: number;
    serviceStatus: string; serviceStart: number; excludeDrivers: boolean; noInternetLocations: boolean; wsus: boolean;
  };
  vendorLookups?: Array<{ vendor: string; deviceId: string; ok: boolean; error: string; version: string }>;
  items?: DriverPlanItem[];
  recommended?: string[];
  uncovered?: string[];
}

export interface DriverInstallEvent {
  id: string;
  status: 'start' | 'downloading' | 'installing' | 'verifying' | 'ok' | 'reboot' | 'failed' | 'skipped' | 'launched' | 'info';
  detail: string;
  received?: number;
  total?: number;
  reused?: boolean;
}

export interface CameraState {
  ok: boolean;
  error?: string;
  devices?: Array<{ name: string; status: string; problem: string; cls: string }>;
  cameraApp?: boolean;
  issues?: string[];
}

export interface DevTraceEntry {
  id: number;
  channel: string;
  at: number;
  ms: number;
  ok: boolean;
  noisy: boolean;
  threw?: boolean;
  error?: string;
  args?: unknown;
  result?: unknown;
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
    getDeepCategory: (category: string, forceRefresh?: boolean) => Promise<any>;
    enableProcessTracking: (enabled: boolean) => Promise<{ ok: boolean; error?: string }>;
    runBenchmark: () => Promise<any>;
    getMemory: () => Promise<{ ok: boolean; total: number; used: number; available: number }>;
    getLiveStats: () => Promise<{ ok: boolean; processes?: number; servicesRunning?: number; servicesTotal?: number; cpuPercent?: number; memUsedMb?: number; memTotalMb?: number; memPercent?: number; uptimeSec?: number; error?: string }>;
  };
  app: {
    getAbout: () => Promise<any>;
    getResourceUsage: () => Promise<
      | { ok: true; totalCpuPercent: number; totalWorkingSetMb: number; processes: Array<{ pid: number; type: string; name: string; cpuPercent: number; workingSetMb: number }> }
      | { ok: false; error: string }
    >;
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
    checkOperationsStatus: () => Promise<any>;
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
    deepTweaksUndo: (payload: { tweakIds?: string[]; undoToken?: string }) => Promise<any>;
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
    restoreImageDefender: () => Promise<any>;
    openTamperSettings: () => Promise<any>;
    applyMsiMode: () => Promise<any>;
    applyExtremeKernelMod: () => Promise<any>;
    revertExtremeKernelMod: () => Promise<any>;
    revertServicesTweak: () => Promise<any>;
    applyExtremeNetworkMod: () => Promise<any>;
    applyCpuUnpark: () => Promise<any>;
  };
  dialog: {
    selectFiles: (options: any) => Promise<{ canceled: boolean; filePaths: string[]; ok: boolean; files: string[] }>;
    selectFolder: (options: any) => Promise<any>;
    saveFile: (options: any) => Promise<any>;
    grantDroppedFiles: (files: FileList | File[]) => Promise<{ ok: boolean; granted?: string[]; error?: string }>;
    pathsForDroppedFiles: (files: FileList | File[]) => string[];
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
  /** USB ports: devices per port, turn off/on, storage policies, safe eject, history. */
  usb: {
    list: () => Promise<UsbState>;
    setDeviceEnabled: (payload: { device: Pick<UsbPort, 'instanceId' | 'name' | 'kind'>; enabled: boolean }) => Promise<{ ok: boolean; error?: string; revertInMs?: number }>;
    keepDisabled: (payload: { instanceId: string }) => Promise<{ ok: boolean }>;
    setStorageBlocked: (payload: { on: boolean }) => Promise<{ ok: boolean; error?: string }>;
    setWriteProtect: (payload: { on: boolean }) => Promise<{ ok: boolean; error?: string }>;
    setSelectiveSuspend: (payload: { on: boolean }) => Promise<{ ok: boolean; error?: string }>;
    eject: (payload: { letter: string }) => Promise<{ ok: boolean; error?: string }>;
  };
  /** Kakugan (kakugan.darkhub.ink): Steam hours/cards farm panel. Session kept in the main process. */
  kakugan: {
    state: () => Promise<KgResult<{ status?: KgStatus; plans?: KgPlan[]; me?: KgMe | null }>>;
    login: (payload: { email: string; password: string }) => Promise<KgResult<{ me?: KgMe }>>;
    logout: () => Promise<KgResult<{}>>;
    dashboard: () => Promise<KgResult<{ dashboard?: KgDashboard }>>;
    steamLoginStart: (payload: { planId?: string; accountId?: string }) => Promise<KgResult<{ attempt?: KgLoginAttempt }>>;
    steamLoginPoll: (payload: { id: string }) => Promise<KgResult<{ attempt?: KgLoginAttempt }>>;
    steamLoginCode: (payload: { id: string; code: string }) => Promise<KgResult<{ attempt?: KgLoginAttempt }>>;
    steamLoginCancel: (payload: { id: string }) => Promise<KgResult<{}>>;
    updateAccount: (payload: { id: string; patch: { games?: number[]; farmCards?: boolean; invisible?: boolean; paused?: boolean; customGame?: string | null } }) => Promise<KgResult<{}>>;
    accountInput: (payload: { id: string; kind: 'password' | 'email_code' | 'app_code'; value: string }) => Promise<KgResult<{}>>;
    removeAccount: (payload: { id: string }) => Promise<KgResult<{}>>;
    searchGames: (payload: { q: string }) => Promise<KgResult<{ games?: KgGame[] }>>;
    gameNames: (payload: { ids: number[] }) => Promise<KgResult<{ games?: KgGame[] }>>;
    openSite: (payload: { page: string }) => Promise<KgResult<{}>>;
    getSettings: () => Promise<KgResult<{ notify?: boolean; autoPause?: boolean }>>;
    setSettings: (payload: { notify?: boolean; autoPause?: boolean }) => Promise<KgResult<{ notify?: boolean; autoPause?: boolean }>>;
  };
  /** Restores Windows components removed by a custom ISO (Media Player, .NET 3.5, Store apps, Store, winget). */
  restore: {
    status: () => Promise<{ ok: boolean; error?: string; items?: RestoreComponent[]; winget?: boolean; elevated?: boolean; isoNote?: boolean }>;
    install: (payload: { id: string; isoRoot?: string }) => Promise<{ ok: boolean; error?: string; restartNeeded?: boolean }>;
  };
  /** In-game overlay (PresentMon frame timing + the app's sensors). */
  overlay: {
    status: () => Promise<OverlayStatus>;
    show: (payload?: { pid?: number }) => Promise<OverlayStatus>;
    hide: () => Promise<OverlayStatus>;
    setSettings: (payload: Partial<OverlaySettings> & { labels?: Record<string, string> }) => Promise<OverlayStatus & { hotkeyError?: string | null }>;
    processes: () => Promise<{ ok: boolean; processes: { pid: number; name: string; wsMb: number }[] }>;
    pickLogFolder: () => Promise<OverlayStatus & { canceled?: boolean }>;
    onEvent: (callback: (s: OverlayStatus) => void) => () => void;
  };
  /** Game save backup (save locations from the Ludusavi manifest / PCGamingWiki). */
  saves: {
    scan: (payload?: { refreshManifest?: boolean }) => Promise<SaveScan>;
    backup: (payload: { name: string; label?: string }) => Promise<{ ok: boolean; error?: string; skipped?: boolean; id?: string; files?: number; bytes?: number }>;
    backupAll: () => Promise<{ ok: boolean; results?: { name: string; ok: boolean; skipped?: boolean; error?: string }[] }>;
    versions: (payload: { name: string }) => Promise<{ ok: boolean; versions: SaveVersion[] }>;
    previewRestore: (payload: { name: string; id: string }) => Promise<{ ok: boolean; error?: string; targets?: { rel: string; dest: string | null; size: number; exists: boolean }[] }>;
    restore: (payload: { name: string; id: string }) => Promise<{ ok: boolean; error?: string; restored?: number; skipped?: string[]; registry?: number; safetyId?: string | null }>;
    removeVersion: (payload: { name: string; id: string }) => Promise<{ ok: boolean; error?: string }>;
    setSettings: (payload: Partial<SaveSettings>) => Promise<{ ok: boolean; error?: string; settings?: SaveSettings }>;
    pickFolder: () => Promise<{ ok: boolean; canceled?: boolean; path?: string }>;
    addCustom: (payload: { name?: string }) => Promise<SaveScan & { canceled?: boolean }>;
    removeCustom: (payload: { name: string }) => Promise<SaveScan>;
    openFolder: (payload: { name?: string }) => Promise<{ ok: boolean }>;
    onEvent: (callback: (e: { type: string; stage?: string; game?: string; id?: string }) => void) => () => void;
  };
  /** Scheduled maintenance (runs while DarkHub is open or in the tray; off by default). */
  maint: {
    state: () => Promise<MaintState>;
    setTask: (payload: { id: string; patch: Partial<Pick<MaintTask, 'enabled' | 'freq' | 'time' | 'weekday' | 'day'>> & { options?: Record<string, unknown> } }) => Promise<MaintState>;
    runNow: (payload: { id: string }) => Promise<{ ok: boolean; error?: string; entry?: MaintHistoryEntry }>;
    onEvent: (callback: (e: { type: 'started' | 'finished'; id: string } & Partial<MaintHistoryEntry>) => void) => () => void;
  };
  /** Before/after benchmark. */
  bench: {
    run: (payload: { label?: string; quick?: boolean; skipDisk?: boolean; diskDir?: string }) => Promise<{ ok: boolean; error?: string; run?: BenchRun }>;
    cancel: () => Promise<{ ok: boolean }>;
    history: () => Promise<{ ok: boolean; runs?: BenchRun[] }>;
    compare: (payload: { a: string; b: string }) => Promise<{
      ok: boolean; error?: string; warnings?: string[];
      rows?: { metric: string; unit: string; before: number; after: number; change: number; threshold: number; verdict: 'better' | 'worse' | 'same' }[];
    }>;
    remove: (payload: { id: string }) => Promise<{ ok: boolean }>;
    onEvent: (callback: (e: { type: 'progress'; test: string; run: number; runs: number }) => void) => () => void;
  };
  /** Startup manager: Run keys, Startup folders, logon/boot tasks, auto services; toggled like Task Manager. */
  startup: {
    list: () => Promise<{
      ok: boolean; error?: string; items?: StartupItem[]; eventsReadable?: boolean; elevated?: boolean;
      boots?: { at: number; totalMs: number | null; mainPathMs: number | null; postBootMs: number | null }[];
      history?: { at: number; id: string; name: string; kind: string; from: boolean; to: boolean }[];
    }>;
    setEnabled: (payload: { item: StartupItem; enabled: boolean }) => Promise<{ ok: boolean; error?: string }>;
    undo: (payload: { index: number }) => Promise<{ ok: boolean; error?: string }>;
  };
  /** Text Editor code runner: toolchains found on the PC (JavaScript/PowerShell/Batch always). */
  code: {
    runtimes: (payload?: { refresh?: boolean }) => Promise<{ ok: boolean; error?: string; runtimes?: Record<string, { label: string; available: boolean; path: string | null }> }>;
    run: (payload: { language: string; code: string; input?: string; timeoutSec?: number }) => Promise<{
      ok: boolean; error?: string; runtime?: string; phase?: 'compile' | 'run';
      code?: number; stdout?: string; stderr?: string; ms?: number; timedOut?: boolean; cancelled?: boolean;
    }>;
    cancel: () => Promise<{ ok: boolean }>;
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
    /** Seals the encrypted vault with a one-time key and uploads it to Susuya for 1 h; the code carries the key. */
    transferSend: () => Promise<{ ok: boolean; error?: string; code?: string; expiresAt?: number }>;
    transferCancel: () => Promise<{ ok: boolean; error?: string }>;
    transferReceive: (payload: { code: string }) => Promise<{ ok: boolean; error?: string }>;
    bridgeStatus: () => Promise<VaultBridgeStatus | { ok: false; error: string }>;
    registerBrowserHost: (browser: VaultBridgeBrowser) => Promise<VaultBridgeStatus | { ok: false; error: string }>;
    unregisterBrowserHost: (browser: VaultBridgeBrowser) => Promise<VaultBridgeStatus | { ok: false; error: string }>;
    revokeBrowserClient: (clientId: string) => Promise<VaultBridgeStatus | { ok: false; error: string }>;
    openExtensionFolder: () => Promise<{ ok: boolean; path?: string; error?: string }>;
    setBridgeLanguage: (lang: string) => Promise<{ ok: boolean }>;
    onBridgeChanged: (callback: () => void) => () => void;
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
    advStatus: () => Promise<any>;
    advSetFeedEnabled: (payload: { id: string; enabled: boolean }) => Promise<any>;
    advUpdateFeeds: (payload?: { ids?: string[] }) => Promise<any>;
    advApplyHosts: () => Promise<any>;
    advRestoreHosts: () => Promise<any>;
    advApplyFirewall: () => Promise<any>;
    advRestoreFirewall: () => Promise<any>;
    advApplyHashes: () => Promise<any>;
    advRestoreHashes: () => Promise<any>;
    advHardeningStatus: () => Promise<any>;
    advHardeningApply: (payload: { id: string; mode?: 'audit' | 'block' }) => Promise<any>;
    advHardeningRestore: (payload: { id: string }) => Promise<any>;
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
    fetchCover: (payload: { gameName: string; gameId?: string; forceRefresh?: boolean }) => Promise<any>;
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
  upscale: {
    dlssLatest: () => Promise<{ ok: boolean; error?: string; tag?: string; version?: string }>;
    inspectGame: (dir: string) => Promise<DlssGameInfo & { ok: boolean; error?: string; dir?: string }>;
    updateGame: (dir: string, force?: boolean) => Promise<DlssGameInfo & { ok: boolean; error?: string; updated?: { file: string; from: string | null; to: string }[] }>;
    restoreGame: (dir: string) => Promise<{ ok: boolean; error?: string; restored?: string[] }>;
    scanLibrary: () => Promise<{ ok: boolean; error?: string; latest?: string; games?: (DlssGameInfo & { name: string; dir: string; appId?: string })[] }>;
    autopilotStatus: () => Promise<{ ok: boolean; error?: string; installed: { tag: string; exe: string } | null; latest: string | null; updateAvailable?: boolean; notesUrl?: string }>;
    autopilotInstall: () => Promise<{ ok: boolean; error?: string; installed?: { tag: string; exe: string } | null }>;
    autopilotLaunch: () => Promise<{ ok: boolean; error?: string; tag?: string }>;
    onLog: (callback: (msg: { dir: string; line: string }) => void) => () => void;
  };
  dlss5: {
    detectGpu: () => Promise<{ ok: boolean; error?: string; vendor: 'nvidia' | 'amd' | 'intel' | 'other' | 'unknown'; model: string; driverVersion: string; isRtx: boolean; isAmd: boolean; isIntel: boolean; defaultProfile: 'nvidia' | 'amd' }>;
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
      dlssDetected?: boolean;
      existingDlls?: string[];
      installed?: boolean;
      installedProfile?: string | null;
      installedLoader?: string | null;
      manifest?: any;
      error?: string;
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
    openFolder: (targetPath: string) => Promise<{ ok: boolean; error?: string }>;
    onLog: (callback: (message: string) => void) => () => void;
  };
  metadata: {
    read: (path: string) => Promise<any>;
    remove: (payload: any) => Promise<any>;
    update: (payload: any) => Promise<any>;
  };
  metax: {
    read: (path: string) => Promise<import('./pages/metadata/metaxTypes').MetaxReadResult>;
    write: (payload: import('./pages/metadata/metaxTypes').MetaxWriteRequest) => Promise<import('./pages/metadata/metaxTypes').MetaxWriteResult>;
    setFileProps: (payload: { path: string; created?: number; modified?: number; accessed?: number; readOnly?: boolean; hidden?: boolean }) => Promise<{ ok: boolean; error?: string; fs?: import('./pages/metadata/metaxTypes').MetaxFsInfo }>;
    removeStream: (payload: { path: string; name: string }) => Promise<{ ok: boolean; error?: string; fs?: import('./pages/metadata/metaxTypes').MetaxFsInfo }>;
  };
  shell: {
    openExternal: (url: string) => Promise<{ ok: boolean; error?: string }>;
  };
  /** Dev-only IPC trace (electron/devBootstrap.js). Its channels are not registered when packaged. */
  dev?: {
    getTrace: () => Promise<DevTraceEntry[]>;
    clearTrace: () => Promise<{ ok: boolean }>;
    onIpcTrace: (callback: (entry: DevTraceEntry) => void) => () => void;
  };
  share: {
    state: () => Promise<ShareState>;
    setConfig: (patch: Partial<ShareConfig>) => Promise<ShareState>;
    pickAndUpload: () => Promise<{ ok: boolean; error?: string; results?: ShareUploadResult[] }>;
    uploadFiles: (files: FileList | File[]) => Promise<{ ok: boolean; error?: string; results?: ShareUploadResult[] }>;
    uploadScreenshot: (file: string) => Promise<ShareUploadResult>;
    cancel: (jobId: string) => Promise<{ ok: boolean }>;
    remove: (id: string) => Promise<ShareState>;
    copy: (text: string) => Promise<{ ok: boolean; error?: string }>;
    qr: (text: string) => Promise<{ ok: boolean; error?: string; dataUrl?: string }>;
    capture: () => Promise<ShareShotResult>;
    /** Snipping-Tool style: freezes the screen, the user drags a rectangle (Esc cancels → cancelled: true). */
    captureRegion: () => Promise<ShareShotResult>;
    /** Region selection returned as a PNG data URL, nothing saved or uploaded (used by OCR). */
    grabRegion: () => Promise<{ ok: boolean; error?: string; cancelled?: boolean; dataUrl?: string; width?: number; height?: number }>;
    openFolder: () => Promise<{ ok: boolean; error?: string }>;
    recentShots: () => Promise<{ ok: boolean; error?: string; files?: { file: string; name: string; bytes: number; at: number }[] }>;
    onEvent: (callback: (e: ShareEvent) => void) => () => void;
  };
  realtime: {
    status: () => Promise<RealtimeStatus>;
    setConfig: (patch: { optimizer?: Partial<RealtimeConfig['optimizer']>; protection?: Partial<RealtimeConfig['protection']> }) => Promise<RealtimeStatus>;
    quarantineList: () => Promise<{ ok: boolean; error?: string; items?: QuarantineItem[] }>;
    quarantineRestore: (id: string) => Promise<{ ok: boolean; error?: string; restoredTo?: string }>;
    quarantineDelete: (id: string) => Promise<{ ok: boolean; error?: string }>;
    clamavInstall: () => Promise<{ ok: boolean; error?: string; status?: ClamAvStatus }>;
    clamavUpdate: () => Promise<{ ok: boolean; error?: string; status?: ClamAvStatus }>;
    scanFiles: () => Promise<{ ok: boolean; error?: string; queued?: number }>;
    onEvent: (callback: (e: RealtimeEvent) => void) => () => void;
  };
  hwsensors: {
    status: () => Promise<HwSensorsStatus>;
    setEnabled: (payload: { enabled: boolean }) => Promise<HwSensorsStatus & { reboot?: boolean }>;
  };
  diskscan: {
    drives: () => Promise<{ ok: boolean; error?: string; drives?: DiskMapDrive[] }>;
    pickFolder: () => Promise<{ ok: boolean; canceled?: boolean; path?: string }>;
    start: (payload: { root: string }) => Promise<{ ok: boolean; error?: string; root?: string }>;
    cancel: () => Promise<{ ok: boolean }>;
    status: () => Promise<DiskMapStatus>;
    view: (payload: { id?: string; minFraction?: number; maxNodes?: number; filter?: string; showFree?: boolean }) => Promise<{
      ok: boolean; error?: string; tree?: DiskMapNode; volume?: { total: number; free: number } | null; trail?: { id: string; name: string }[]; total?: number; filterErrors?: string[]; status?: DiskMapStatus;
    }>;
    info: (payload: { id: string; filter?: string }) => Promise<{ ok: boolean; error?: string; info?: DiskMapInfo }>;
    tag: (payload: { id: string; color: DiskMapTag | null }) => Promise<{ ok: boolean; error?: string }>;
    open: (payload: { id: string }) => Promise<{ ok: boolean; error?: string }>;
    reveal: (payload: { id: string }) => Promise<{ ok: boolean; error?: string }>;
    trash: (payload: { id: string }) => Promise<{ ok: boolean; error?: string; path?: string }>;
    exportReport: (payload: { id?: string; format: 'txt' | 'csv'; filter?: string }) => Promise<{ ok: boolean; canceled?: boolean; error?: string; path?: string; rows?: number }>;
    onProgress: (callback: (status: DiskMapStatus) => void) => () => void;
  };
  wintools: {
    listFeatures: () => Promise<{ ok: boolean; error?: string; features?: Record<string, 'enabled' | 'disabled' | 'pending' | 'unavailable'> }>;
    setFeature: (payload: { id: string; enable: boolean }) => Promise<{ ok: boolean; error?: string; state?: string; requiresReboot?: boolean }>;
    run: (payload: { action: string }) => Promise<{ ok: boolean; error?: string; msg?: string }>;
    openPanel: (payload: { id: string }) => Promise<{ ok: boolean; error?: string }>;
  };
  driver: {
    detect: () => Promise<{
      ok: boolean;
      error?: string;
      rebootPending?: boolean;
      adapters?: Array<{
        model: string;
        vendor: 'nvidia' | 'amd' | 'intel' | 'virtual' | 'other';
        driverVersion: string;
        driverDate: string;
        driverProvider: string;
        videoProcessor: string;
        pnpId: string;
        vramMb: number;
        status: string;
        problem: string;
        isDedicated: boolean;
        genericDriver?: boolean;
        deviceId?: string;
        boardPartner?: string | null;
        officialSources: { manual: string; autoDetect: string; app: string } | null;
      }>;
    }>;
    openOfficial: (payload: { vendor: string; kind?: 'manual' | 'autoDetect' | 'app' }) => Promise<{ ok: boolean; url?: string; vendor?: string; kind?: string; error?: string }>;
    cameraStatus: () => Promise<CameraState>;
    repairCamera: () => Promise<CameraState & { steps?: string[] }>;
    scanMissing: () => Promise<{ ok: boolean; error?: string; missing?: DriverDevice[]; gpus?: DriverDevice[]; wuBlockers?: string[] }>;
    findDrivers: (payload?: { allowUnlock?: boolean }) => Promise<DriverFindResult>;
    install: (payload: { ids: string[]; restorePoint?: boolean; allowUnlock?: boolean; clean?: boolean }) => Promise<{
      ok: boolean;
      error?: string;
      results?: DriverInstallEvent[];
      rebootRequired?: boolean;
      after?: { missing: DriverDevice[]; gpus: DriverDevice[] } | null;
    }>;
    onInstallEvent: (callback: (ev: DriverInstallEvent) => void) => () => void;
  };
  powershell: {
    getPolicies: () => Promise<{ ok: boolean; error?: string; scopes?: Array<{ scope: string; policy: string }>; effective?: { scope: string; policy: string } }>;
    listScripts: () => Promise<{ ok: boolean; error?: string; rootExists?: boolean; root?: string; scripts?: Array<{ name: string; path: string; sizeBytes: number; modified: string; signature: { status: string; trusted: boolean; signer: string } }> }>;
    getSignature: (payload: { path: string }) => Promise<{ ok: boolean; error?: string; signature?: { status: string; trusted: boolean; signer: string } }>;
    runScript: (payload: { path: string; confirmUnsigned?: boolean }) => Promise<{ ok: boolean; needsConfirmation?: boolean; code?: number; stdout?: string; stderr?: string; signature?: { status: string; trusted: boolean; signer: string }; error?: string }>;
    openElevatedTerminal: (payload?: { startingPath?: string; shell?: 'powershell' | 'pwsh'; loadProfile?: boolean }) => Promise<{ ok: boolean; error?: string }>;
    previewTool: (payload: { id: string; params?: Record<string, unknown> }) => Promise<{ ok: boolean; error?: string; errors?: Record<string, string>; preview?: string; admin?: boolean; mutating?: boolean; kind?: string }>;
    runTool: (payload: { id: string; params?: Record<string, unknown>; confirm?: boolean }) => Promise<PsToolResult>;
    pickFolder: (payload?: { defaultPath?: string }) => Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>;
    pickSavePath: (payload: { ext: string; defaultName?: string }) => Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>;
    exportResult: (payload: { rows?: Array<Record<string, unknown>>; text?: string; format: 'csv' | 'json' | 'txt'; defaultName?: string }) => Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>;
    revealFile: (payload: { path: string }) => Promise<{ ok: boolean; error?: string }>;
    openReport: (payload: { path: string }) => Promise<{ ok: boolean; error?: string }>;
    wifiKey: (payload: { name: string }) => Promise<{ ok: boolean; key?: string; error?: string }>;
    hostsRead: () => Promise<PsToolResult>;
    hostsBackup: (payload: { name: string }) => Promise<{ ok: boolean; content?: string; error?: string }>;
    hostsPreview: (payload: { content: string }) => Promise<{ ok: boolean; added?: string[]; removed?: string[]; error?: string }>;
    hostsWrite: (payload: { content: string; confirm?: boolean }) => Promise<{ ok: boolean; needsConfirmation?: boolean; error?: string }>;
    customStart: (payload: { script: string; elevated?: boolean; confirm?: boolean }) => Promise<{ ok: boolean; runId?: string; elevated?: boolean; needsConfirmation?: boolean; error?: string }>;
    customStop: () => Promise<{ ok: boolean; running?: boolean; error?: string }>;
    customStatus: () => Promise<{ ok: boolean; running?: boolean }>;
    onCustomEvent: (callback: (ev: { runId: string; type: 'stdout' | 'stderr' | 'exit'; text?: string; code?: number; stopped?: boolean }) => void) => () => void;
    snippetsList: () => Promise<{ ok: boolean; snippets?: PsSnippet[]; error?: string }>;
    snippetSave: (payload: { id?: string; name: string; script: string; elevated?: boolean }) => Promise<{ ok: boolean; snippet?: PsSnippet; snippets?: PsSnippet[]; error?: string }>;
    snippetDelete: (payload: { id: string }) => Promise<{ ok: boolean; snippets?: PsSnippet[]; error?: string }>;
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
    latencyPresets: () => Promise<{ ok: boolean; presets?: NetLatencyPreset[]; error?: string }>;
    probe: (payload: { host: string; mode?: 'icmp' | 'tcp' }) => Promise<{ ok: boolean; ms?: number | null; mode?: string; error?: string }>;
    traceHops: (payload: { host: string; maxHops?: number }) => Promise<{ ok: boolean; hops?: NetTraceHop[]; output?: string; error?: string }>;
    bufferbloat: (payload: { host?: string; seconds?: number }) => Promise<NetBufferbloatResult>;
    mtuDiscover: (payload: { host?: string }) => Promise<{ ok: boolean; host?: string; payload?: number | null; mtu?: number | null; probes?: number; error?: string }>;
    latencyState: () => Promise<NetLatencyState>;
    applyLatencyTweak: (payload: { id: NetLatencyTweakId; value?: string; exe?: string }) => Promise<{ ok: boolean; msg?: string; error?: string; changed?: number; verified?: boolean }>;
    restoreLatencyTweak: (payload: { id: NetLatencyTweakId }) => Promise<{ ok: boolean; msg?: string; error?: string }>;
  };
}

export type NetLatencyTweakId = 'interruptModeration' | 'flowControl' | 'powerSaving' | 'ecn' | 'qos';
export interface NetLatencyPreset { id: string; label: string; host: string; mode: 'icmp' | 'tcp'; group: 'dns' | 'game' | 'region' }
export interface NetTraceHop { hop: number; rtts: (number | null)[]; ip: string | null; best: number | null }
export interface NetLatencyStats { count: number; received: number; lossPct: number; min: number | null; max: number | null; avg: number | null; median: number | null; p95: number | null; jitter: number | null }
export interface NetBufferbloatResult { ok: boolean; error?: string; host?: string; idle?: NetLatencyStats; loaded?: NetLatencyStats; idleSamples?: number[]; loadedSamples?: number[]; downMbps?: number; added?: number | null; grade?: string }
export interface NetAdapterProp { value: string | null; display: string; valid: string[] }
export interface NetLatencyAdapter { name: string; description: string; linkSpeed: string; mtu: number | null; props: Record<string, NetAdapterProp>; power: string; tcpAckFrequency: number | null; tcpNoDelay: number | null }
export interface NetLatencyState {
  ok: boolean;
  error?: string;
  adapters?: NetLatencyAdapter[];
  tcp?: { ecn: string; autotuning: string; timestamps: string };
  offload?: { rss: string; rsc: string };
  mmcss?: { networkThrottlingIndex: number | null; systemResponsiveness: number | null };
  qos?: { name: string; app: string; dscp: number | null }[];
  saved?: Partial<Record<NetLatencyTweakId, boolean>>;
  elevated?: boolean;
}

declare module 'crypto-js';

declare global {
  interface Window {
    darkhub: DarkHubAPI;
  }
}

export interface DlssFile { file: string; name: string; kind: 'sr' | 'rr' | 'fg'; version: string | null; hasOriginal: boolean; x64: boolean; behind: boolean }
export interface DlssGameInfo { latest?: string; tag?: string; anticheat?: string | null; files?: DlssFile[] }
export type ShareShotResult = { ok: boolean; error?: string; file?: string; width?: number; height?: number; bytes?: number; ms?: number; entry?: ShareEntry; uploadError?: string; cancelled?: boolean };
export interface ShareConfig { hotkey: string; regionHotkey: string; folder: string; autoUpload: boolean; copyImage: boolean; clip: 'image' | 'link' | 'both' | 'none'; sound: boolean; ttl: number }
export interface ShareEntry { id: string; name: string; size: number; kind?: string; createdAt: number; expiresAt: number; pageUrl: string; directUrl: string; origin?: string }
export interface ShareUploadResult { ok: boolean; error?: string; entry?: ShareEntry }
export interface ShareState { ok: boolean; error?: string; config: ShareConfig; hotkeyActive: boolean; regionHotkeyActive: boolean; history: ShareEntry[]; uploading: number }
export type ShareEvent =
  | { type: 'start'; jobId: string; name: string; origin: string }
  | { type: 'progress'; jobId: string; sent: number; total: number }
  | { type: 'done'; jobId: string; entry: ShareEntry }
  | { type: 'error'; jobId: string; name: string; error: string }
  | { type: 'screenshot'; file: string; width: number; height: number; bytes: number; ms: number };
export interface RealtimeRule { name: string; action: 'lower' | 'close' }
export interface RealtimeConfig {
  optimizer: { enabled: boolean; smart: boolean; memory: boolean; memoryThresholdPct: number; minProcessMb: number; cooldownMin: number; rules: RealtimeRule[] };
  protection: { enabled: boolean; folders: string[]; clamav: boolean; autoQuarantine: boolean; maxFileMb: number; allowHashes: string[] };
}
export interface RealtimeEvent {
  source?: 'optimizer' | 'protection';
  at: number;
  level: 'info' | 'action' | 'error' | 'threat';
  event: string;
  [k: string]: unknown;
}
export interface ClamAvStatus { installed: boolean; database: boolean; databaseAgeMs: number | null }
export interface QuarantineItem { id: string; originalPath: string; at: number; sha256?: string; size?: number; engine?: string; detection?: string }
export interface RealtimeStatus {
  ok: boolean;
  error?: string;
  config: RealtimeConfig;
  optimizer: { running: boolean; stats: { trims: number; freedMb: number; lowered: number; closed: number; since: number }; memory: { availMb: number; totalMb: number }; nextTrimAt: number; log: RealtimeEvent[] };
  protection: { running: boolean; folders: number; queue: number; stats: { scanned: number; detections: number; quarantined: number; since: number }; log: RealtimeEvent[]; hashes: number; clamav: ClamAvStatus; defender: boolean | null };
  quarantine: number;
}

export interface HwSensorsStatus { ok: boolean; error?: string | null; enabled?: boolean; available?: boolean; running?: boolean; pawnio?: boolean; lastSample?: number }
export type DiskMapTag = 'red' | 'yellow' | 'green' | 'blue';
export interface DiskMapDrive { root: string; label: string; fs: string; total: number; free: number; type: 'local' | 'removable' | 'network' }
export interface DiskMapStatus {
  ok: boolean; active: boolean; root?: string; running?: boolean; error?: string | null;
  done?: { dirs: number; files: number; errors: number; ms: number } | null;
  dirs?: number; files?: number; bytes?: number; errors?: number; elapsedMs?: number; volume?: { total: number; free: number } | null;
}
export interface DiskMapNode {
  id: string; name: string; size: number; kind: 'dir' | 'file' | 'rest' | 'free' | 'unknown';
  files?: number; count?: number; cls?: string; tag?: DiskMapTag; children?: DiskMapNode[];
}
export interface DiskMapInfo {
  id: string; kind: 'dir' | 'file'; name: string; path: string; size: number; files?: number; dirs?: number; cls?: string;
  mtime: number | null; ctime: number | null; atime?: number | null; attr: number; tag: DiskMapTag | null; isRoot?: boolean; parent?: string;
}
export type VaultBridgeBrowser = 'chrome' | 'edge' | 'firefox';
export interface VaultBridgeBrowserStatus { browser: VaultBridgeBrowser; label: string; registered: boolean; foreignRegistration: boolean; manifestPath: string }
export interface VaultBridgeClient { id: string; name: string; browser: string; caller: string | null; createdAt: number; lastSeenAt: number | null; connected: boolean }
export interface VaultBridgeStatus {
  ok: true; supported: boolean; serverRunning: boolean; unlocked: boolean; hostName: string;
  extensionIds: { chromium: string; gecko: string }; extensionFolder: string | null;
  browsers: VaultBridgeBrowserStatus[]; clients: VaultBridgeClient[];
}
