const { contextBridge, ipcRenderer, webUtils } = require('electron')

// Real on-disk paths of File objects the user dropped/picked (File.path was removed in Electron 32). Taking File
// objects, not strings, means the page cannot grant itself access to an arbitrary path.
const pathsOf = (files) => Array.from(files || []).map((f) => { try { return webUtils.getPathForFile(f) } catch { return '' } }).filter(Boolean)

const darkhubApi = {
  hardware: { 
    onUpdate: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on('hardware:update', handler);
      return () => ipcRenderer.removeListener('hardware:update', handler);
    },
    startPolling: () => ipcRenderer.invoke('hardware:startPolling'),
    stopPolling: () => ipcRenderer.invoke('hardware:stopPolling')
  },

  system: {
    getInfo: () => ipcRenderer.invoke('system:getInfo'),
    getMetrics: () => ipcRenderer.invoke('system:getMetrics'),
    getGraphics: () => ipcRenderer.invoke('system:getGraphics'),
    getBios: () => ipcRenderer.invoke('system:getBios'),
    getTemperatures: () => ipcRenderer.invoke('system:getTemperatures'),
    getLatency: (payload) => ipcRenderer.invoke('system:getLatency', payload),
    getNetwork: () => ipcRenderer.invoke('system:getNetwork'),
    getStorage: () => ipcRenderer.invoke('system:getStorage'),
    getJunkEstimate: (payload) => ipcRenderer.invoke('system:getJunkEstimate', payload),
    getSnapshot: () => ipcRenderer.invoke('system:getSnapshot'),
    getAdvancedHardware: () => ipcRenderer.invoke('system:getAdvancedHardware'),
    getDeepHardwareInfo: (forceRefresh = false) => ipcRenderer.invoke('system:getDeepHardwareInfo', forceRefresh),
    getDeepCategory: (category, forceRefresh = false) => ipcRenderer.invoke('system:getDeepCategory', category, forceRefresh),
    enableProcessTracking: (enabled) => ipcRenderer.invoke('system:enableProcessTracking', enabled),
    runBenchmark: () => ipcRenderer.invoke('system:runBenchmark'),
    getLiveStats: () => ipcRenderer.invoke('system:getLiveStats'),
    getMemory: () => ipcRenderer.invoke('system:getMemory')
  },
  app: {
    getAbout: () => ipcRenderer.invoke('app:getAbout'),
    getResourceUsage: () => ipcRenderer.invoke('app:getResourceUsage')
  },
  downloads: {
    list: () => ipcRenderer.invoke('downloads:list'),
    add: (payload) => ipcRenderer.invoke('downloads:add', payload),
    pause: (id) => ipcRenderer.invoke('downloads:pause', { id }),
    resume: (id) => ipcRenderer.invoke('downloads:resume', { id }),
    pauseAll: () => ipcRenderer.invoke('downloads:pauseAll'),
    resumeAll: () => ipcRenderer.invoke('downloads:resumeAll'),
    cancel: (id, deleteFiles = true) => ipcRenderer.invoke('downloads:cancel', { id, deleteFiles }),
    remove: (id, deleteFile = false) => ipcRenderer.invoke('downloads:remove', { id, deleteFile }),
    clearFinished: () => ipcRenderer.invoke('downloads:clearFinished'),
    getSettings: () => ipcRenderer.invoke('downloads:getSettings'),
    setSettings: (patch) => ipcRenderer.invoke('downloads:setSettings', patch),
    showInFolder: (id) => ipcRenderer.invoke('downloads:showInFolder', { id }),
    chooseDir: () => ipcRenderer.invoke('downloads:chooseDir'),
    onUpdate: (cb) => {
      const handler = (_event, list) => cb(list)
      ipcRenderer.on('downloads:update', handler)
      return () => ipcRenderer.removeListener('downloads:update', handler)
    }
  },
  pge: {
    openPortable: () => ipcRenderer.invoke('pge:openPortable')
  },
  settings: {
    getConfig: () => ipcRenderer.invoke('settings:getConfig'),
    updateTelemetry: (payload) => ipcRenderer.invoke('settings:updateTelemetry', payload),
    updateLiveServices: (payload) => ipcRenderer.invoke('settings:updateLiveServices', payload),
    updateWindowBehavior: (payload) => ipcRenderer.invoke('settings:updateWindowBehavior', payload),
    updateStartupBehavior: (payload) => ipcRenderer.invoke('settings:updateStartupBehavior', payload)
  },
  injector: {
    inject: (payload) => ipcRenderer.invoke('injector:inject', payload)
  },
  telemetry: {
    testBugReport: () => ipcRenderer.invoke('telemetry:testBugReport')
  },
  
  optimizer: {
    applyTweak: (id) => ipcRenderer.invoke('optimizer:applyTweak', id),
    listOperations: () => ipcRenderer.invoke('optimizer:listOperations'),
    checkOperationsStatus: () => ipcRenderer.invoke('optimizer:checkOperationsStatus'),
    listProfiles: () => ipcRenderer.invoke('optimizer:listProfiles'),
    checkIsAdmin: () => ipcRenderer.invoke('optimizer:checkIsAdmin'),
    createRestorePoint: () => ipcRenderer.invoke('optimizer:createRestorePoint'),
    getAuditLog: (payload) => ipcRenderer.invoke('optimizer:getAuditLog', payload),
    analyze: (payload) => ipcRenderer.invoke('optimizer:analyze', payload),
    run: (payload) => ipcRenderer.invoke('optimizer:run', payload),
    runRoutine: (routineId) => ipcRenderer.invoke('optimizer:runRoutine', routineId),
    dnsBenchmark: (payload) => ipcRenderer.invoke('optimizer:dnsBenchmark', payload),
    getDnsState: () => ipcRenderer.invoke('optimizer:getDnsState'),
    applyDns: (payload) => ipcRenderer.invoke('optimizer:applyDns', payload),
    undoDns: (payload) => ipcRenderer.invoke('optimizer:undoDns', payload),
    onRunEvent: (callback) => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('optimizer:runEvent', listener)
      return () => ipcRenderer.removeListener('optimizer:runEvent', listener)
    },
    listBloatware: () => ipcRenderer.invoke('optimizer:listBloatware'),
    removeSelectedBloatware: (apps) => ipcRenderer.invoke('optimizer:removeSelectedBloatware', apps),
    getRunningProcesses: () => ipcRenderer.invoke('optimizer:getRunningProcesses'),
    setProcessPriority: (payload) => ipcRenderer.invoke('optimizer:setProcessPriority', payload),
    getGpuPreferences: () => ipcRenderer.invoke('optimizer:getGpuPreferences'),
    setGpuPreference: (payload) => ipcRenderer.invoke('optimizer:setGpuPreference', payload),
    removeGpuPreference: (payload) => ipcRenderer.invoke('optimizer:removeGpuPreference', payload),
    getGpuInfo: () => ipcRenderer.invoke('optimizer:getGpuInfo'),
    getHagsStatus: () => ipcRenderer.invoke('optimizer:getHagsStatus'),
    setHagsStatus: (payload) => ipcRenderer.invoke('optimizer:setHagsStatus', payload),
    revertHags: () => ipcRenderer.invoke('optimizer:revertHags'),
    deepTweaksList: () => ipcRenderer.invoke('optimizer:deepTweaksList'),
    deepTweaksStatus: () => ipcRenderer.invoke('optimizer:deepTweaksStatus'),
    deepTweaksAnalyze: (payload) => ipcRenderer.invoke('optimizer:deepTweaksAnalyze', payload),
    deepTweaksApply: (payload) => ipcRenderer.invoke('optimizer:deepTweaksApply', payload),
    deepTweaksRevert: (payload) => ipcRenderer.invoke('optimizer:deepTweaksRevert', payload),
    deepTweaksUndo: (payload) => ipcRenderer.invoke('optimizer:deepTweaksUndo', payload),
    setDnsServers: (payload) => ipcRenderer.invoke('optimizer:setDnsServers', payload),
    getStartupItems: () => ipcRenderer.invoke('optimizer:getStartupItems'),
    disableStartupItem: (payload) => ipcRenderer.invoke('optimizer:disableStartupItem', payload),
    getServices: () => ipcRenderer.invoke('optimizer:getServices'),
    disableService: (name) => ipcRenderer.invoke('optimizer:disableService', name),
    getInstalledPrograms: () => ipcRenderer.invoke('optimizer:getInstalledPrograms'),
    uninstallProgram: (uninstallString) => ipcRenderer.invoke('optimizer:uninstallProgram', uninstallString),
    uninstallProgramWithLeftovers: (payload) => ipcRenderer.invoke('optimizer:uninstallProgramWithLeftovers', payload),
    advancedNetworkApply: () => ipcRenderer.invoke('optimizer:advancedNetworkApply'),
    advancedNetworkRevert: () => ipcRenderer.invoke('optimizer:advancedNetworkRevert'),
    globalRecommendedTweaks: () => ipcRenderer.invoke('optimizer:globalRecommendedTweaks'),
    getDefenderControlStatus: () => ipcRenderer.invoke('optimizer:getDefenderControlStatus'),
    applyDefenderControl: (payload) => ipcRenderer.invoke('optimizer:applyDefenderControl', payload),
    restoreImageDefender: () => ipcRenderer.invoke('optimizer:restoreImageDefender'),
    openTamperSettings: () => ipcRenderer.invoke('optimizer:openTamperSettings'),
    applyMsiMode: () => ipcRenderer.invoke('optimizer:applyMsiMode'),
    applyExtremeKernelMod: () => ipcRenderer.invoke('optimizer:applyExtremeKernelMod'),
    revertExtremeKernelMod: () => ipcRenderer.invoke('optimizer:revertExtremeKernelMod'),
    revertServicesTweak: () => ipcRenderer.invoke('optimizer:revertServicesTweak'),
    applyExtremeNetworkMod: () => ipcRenderer.invoke('optimizer:applyExtremeNetworkMod'),
    applyCpuUnpark: () => ipcRenderer.invoke('optimizer:applyCpuUnpark')
  },
  darkos: {
    isDarkOS: () => ipcRenderer.invoke('darkos:isDarkOS'),
    getCatalog: (payload) => ipcRenderer.invoke('darkos:getCatalog', payload),
    getManifest: () => ipcRenderer.invoke('darkos:getManifest'),
    getStatus: (payload) => ipcRenderer.invoke('darkos:getStatus', payload),
    applyChange: (payload) => ipcRenderer.invoke('darkos:applyChange', payload),
    revertChange: (payload) => ipcRenderer.invoke('darkos:revertChange', payload),
    reinstallEdge: () => ipcRenderer.invoke('darkos:reinstallEdge'),
    setProfile: (payload) => ipcRenderer.invoke('darkos:setProfile', payload),
    restoreProfile: () => ipcRenderer.invoke('darkos:restoreProfile'),
    getRemovedApps: () => ipcRenderer.invoke('darkos:getRemovedApps'),
    restoreAppx: (payload) => ipcRenderer.invoke('darkos:restoreAppx', payload),
    listSnapshots: () => ipcRenderer.invoke('darkos:listSnapshots'),
    createSnapshot: (payload) => ipcRenderer.invoke('darkos:createSnapshot', payload),
    restoreSnapshot: (payload) => ipcRenderer.invoke('darkos:restoreSnapshot', payload),
    getFailures: () => ipcRenderer.invoke('darkos:getFailures'),
    getRebootPending: () => ipcRenderer.invoke('darkos:getRebootPending'),
    exportDiagnostics: () => ipcRenderer.invoke('darkos:exportDiagnostics'),
    onRunEvent: (callback) => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('darkos:runEvent', listener)
      return () => ipcRenderer.removeListener('darkos:runEvent', listener)
    }
  },
  dialog: {
    selectFiles: (options) => ipcRenderer.invoke('dialog:selectFiles', options),
    selectFolder: (options) => ipcRenderer.invoke('dialog:selectFolder', options),
    saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options),
    grantDroppedFiles: (files) => ipcRenderer.invoke('dialog:grantDroppedFiles', pathsOf(files)),
    pathsForDroppedFiles: (files) => pathsOf(files)
  },
  files: {
    convertImages: (payload) => ipcRenderer.invoke('files:convertImages', payload),
    convertMedia: (payload) => ipcRenderer.invoke('files:convertMedia', payload),
    checkLibreOffice: () => ipcRenderer.invoke('files:checkLibreOffice'),
    convertDocuments: (payload) => ipcRenderer.invoke('files:convertDocuments', payload),
    archiveOperation: (payload) => ipcRenderer.invoke('files:archiveOperation', payload)
  },
  youtube: {
    getVideoInfo: (payload) => ipcRenderer.invoke('youtube:getVideoInfo', payload),
    download: (payload) => ipcRenderer.invoke('youtube:download', payload),
    cancel: () => ipcRenderer.invoke('youtube:cancel'),
    onProgress: (callback) => {
      const listener = (_event, data) => callback(data)
      ipcRenderer.on('youtube:downloadProgress', listener)
      return () => ipcRenderer.removeListener('youtube:downloadProgress', listener)
    }
  },
  ocr: {
    extractText: (payload) => ipcRenderer.invoke('ocr:extractText', payload)
  },
  usb: {
    list: () => ipcRenderer.invoke('usb:list'),
    setDeviceEnabled: (payload) => ipcRenderer.invoke('usb:setDeviceEnabled', payload),
    keepDisabled: (payload) => ipcRenderer.invoke('usb:keepDisabled', payload),
    setStorageBlocked: (payload) => ipcRenderer.invoke('usb:setStorageBlocked', payload),
    setWriteProtect: (payload) => ipcRenderer.invoke('usb:setWriteProtect', payload),
    setSelectiveSuspend: (payload) => ipcRenderer.invoke('usb:setSelectiveSuspend', payload),
    eject: (payload) => ipcRenderer.invoke('usb:eject', payload)
  },
  restore: {
    status: () => ipcRenderer.invoke('restore:status'),
    install: (payload) => ipcRenderer.invoke('restore:install', payload)
  },
  overlay: {
    status: () => ipcRenderer.invoke('overlay:status'),
    show: (payload) => ipcRenderer.invoke('overlay:show', payload),
    hide: () => ipcRenderer.invoke('overlay:hide'),
    setSettings: (payload) => ipcRenderer.invoke('overlay:setSettings', payload),
    processes: () => ipcRenderer.invoke('overlay:processes'),
    pickLogFolder: () => ipcRenderer.invoke('overlay:pickLogFolder'),
    onEvent: (callback) => {
      const handler = (_e, data) => callback(data)
      ipcRenderer.on('overlay:event', handler)
      return () => ipcRenderer.removeListener('overlay:event', handler)
    }
  },
  saves: {
    scan: (payload) => ipcRenderer.invoke('saves:scan', payload),
    backup: (payload) => ipcRenderer.invoke('saves:backup', payload),
    backupAll: () => ipcRenderer.invoke('saves:backupAll'),
    versions: (payload) => ipcRenderer.invoke('saves:versions', payload),
    previewRestore: (payload) => ipcRenderer.invoke('saves:previewRestore', payload),
    restore: (payload) => ipcRenderer.invoke('saves:restore', payload),
    removeVersion: (payload) => ipcRenderer.invoke('saves:removeVersion', payload),
    setSettings: (payload) => ipcRenderer.invoke('saves:setSettings', payload),
    pickFolder: () => ipcRenderer.invoke('saves:pickFolder'),
    addCustom: (payload) => ipcRenderer.invoke('saves:addCustom', payload),
    removeCustom: (payload) => ipcRenderer.invoke('saves:removeCustom', payload),
    openFolder: (payload) => ipcRenderer.invoke('saves:openFolder', payload),
    onEvent: (callback) => {
      const handler = (_e, data) => callback(data)
      ipcRenderer.on('saves:event', handler)
      return () => ipcRenderer.removeListener('saves:event', handler)
    }
  },
  maint: {
    state: () => ipcRenderer.invoke('maint:state'),
    setTask: (payload) => ipcRenderer.invoke('maint:setTask', payload),
    runNow: (payload) => ipcRenderer.invoke('maint:runNow', payload),
    onEvent: (callback) => {
      const handler = (_e, data) => callback(data)
      ipcRenderer.on('maint:event', handler)
      return () => ipcRenderer.removeListener('maint:event', handler)
    }
  },
  bench: {
    run: (payload) => ipcRenderer.invoke('bench:run', payload),
    cancel: () => ipcRenderer.invoke('bench:cancel'),
    history: () => ipcRenderer.invoke('bench:history'),
    compare: (payload) => ipcRenderer.invoke('bench:compare', payload),
    remove: (payload) => ipcRenderer.invoke('bench:remove', payload),
    onEvent: (callback) => {
      const handler = (_e, data) => callback(data)
      ipcRenderer.on('bench:event', handler)
      return () => ipcRenderer.removeListener('bench:event', handler)
    }
  },
  startup: {
    list: () => ipcRenderer.invoke('startup:list'),
    setEnabled: (payload) => ipcRenderer.invoke('startup:setEnabled', payload),
    undo: (payload) => ipcRenderer.invoke('startup:undo', payload)
  },
  code: {
    runtimes: (payload) => ipcRenderer.invoke('code:runtimes', payload),
    run: (payload) => ipcRenderer.invoke('code:run', payload),
    cancel: () => ipcRenderer.invoke('code:cancel')
  },
  vault: {
    status: () => ipcRenderer.invoke('vault:status'),
    setAutoLockMinutes: (minutes) => ipcRenderer.invoke('vault:setAutoLockMinutes', minutes),
    init: (payload) => ipcRenderer.invoke('vault:init', payload),
    unlock: (payload) => ipcRenderer.invoke('vault:unlock', payload),
    unlockWithRecoveryWords: (payload) => ipcRenderer.invoke('vault:unlockWithRecoveryWords', payload),
    lock: () => ipcRenderer.invoke('vault:lock'),
    list: () => ipcRenderer.invoke('vault:list'),
    add: (payload) => ipcRenderer.invoke('vault:add', payload),
    update: (payload) => ipcRenderer.invoke('vault:update', payload),
    remove: (payload) => ipcRenderer.invoke('vault:remove', payload),
    reveal: (payload) => ipcRenderer.invoke('vault:reveal', payload),
    copyPassword: (payload) => ipcRenderer.invoke('vault:copyPassword', payload),
    changeMasterPassword: (payload) => ipcRenderer.invoke('vault:changeMasterPassword', payload),
    regenerateRecoveryWords: () => ipcRenderer.invoke('vault:regenerateRecoveryWords'),
    export: (payload) => ipcRenderer.invoke('vault:export', payload),
    import: (payload) => ipcRenderer.invoke('vault:import', payload),
    transferSend: () => ipcRenderer.invoke('vault:transferSend'),
    transferCancel: () => ipcRenderer.invoke('vault:transferCancel'),
    transferReceive: (payload) => ipcRenderer.invoke('vault:transferReceive', payload),
    // browser extension bridge
    bridgeStatus: () => ipcRenderer.invoke('vaultx:bridgeStatus'),
    registerBrowserHost: (browser) => ipcRenderer.invoke('vaultx:registerHost', browser),
    unregisterBrowserHost: (browser) => ipcRenderer.invoke('vaultx:unregisterHost', browser),
    revokeBrowserClient: (clientId) => ipcRenderer.invoke('vaultx:revokeClient', clientId),
    openExtensionFolder: () => ipcRenderer.invoke('vaultx:openExtensionFolder'),
    setBridgeLanguage: (lang) => ipcRenderer.invoke('vaultx:setLanguage', lang),
    onBridgeChanged: (callback) => {
      const listener = () => callback()
      ipcRenderer.on('vaultx:changed', listener)
      return () => ipcRenderer.removeListener('vaultx:changed', listener)
    }
  },
  security: {
    scanProcesses: () => ipcRenderer.invoke('security:scanProcesses'),
    scanMalware: () => ipcRenderer.invoke('security:scanMalware'),
    killProcess: (pid) => ipcRenderer.invoke('security:killProcess', pid),
    auditTracking: () => ipcRenderer.invoke('security:auditTracking'),
    blockTracking: () => ipcRenderer.invoke('security:blockTracking'),
    unblockTracking: () => ipcRenderer.invoke('security:unblockTracking'),
    optimizeLatency: () => ipcRenderer.invoke('security:optimizeLatency'),
    getSecurityScore: () => ipcRenderer.invoke('security:getSecurityScore'),
    getTrackingDomains: () => ipcRenderer.invoke('security:getTrackingDomains'),
    setCustomTrackingDomains: (payload) => ipcRenderer.invoke('security:setCustomTrackingDomains', payload),
    scanUrl: (payload) => ipcRenderer.invoke('security:scanUrl', payload),
    enablePhishingShield: () => ipcRenderer.invoke('security:enablePhishingShield'),
    disablePhishingShield: () => ipcRenderer.invoke('security:disablePhishingShield'),
    getPhishingShieldStatus: () => ipcRenderer.invoke('security:getPhishingShieldStatus'),
    getLiveNetworkConnections: () => ipcRenderer.invoke('security:getLiveNetworkConnections'),
    checkRansomwareArmor: () => ipcRenderer.invoke('security:checkRansomwareArmor'),
    enableRansomwareArmor: () => ipcRenderer.invoke('security:enableRansomwareArmor'),
    getCommunityRules: () => ipcRenderer.invoke('security:getCommunityRules'),
    importCommunityRules: (payload) => ipcRenderer.invoke('security:importCommunityRules', payload),
    resetCommunityRules: () => ipcRenderer.invoke('security:resetCommunityRules'),
    advStatus: () => ipcRenderer.invoke('security:advStatus'),
    advSetFeedEnabled: (payload) => ipcRenderer.invoke('security:advSetFeedEnabled', payload),
    advUpdateFeeds: (payload) => ipcRenderer.invoke('security:advUpdateFeeds', payload),
    advApplyHosts: () => ipcRenderer.invoke('security:advApplyHosts'),
    advRestoreHosts: () => ipcRenderer.invoke('security:advRestoreHosts'),
    advApplyFirewall: () => ipcRenderer.invoke('security:advApplyFirewall'),
    advRestoreFirewall: () => ipcRenderer.invoke('security:advRestoreFirewall'),
    advApplyHashes: () => ipcRenderer.invoke('security:advApplyHashes'),
    advRestoreHashes: () => ipcRenderer.invoke('security:advRestoreHashes'),
    advHardeningStatus: () => ipcRenderer.invoke('security:advHardeningStatus'),
    advHardeningApply: (payload) => ipcRenderer.invoke('security:advHardeningApply', payload),
    advHardeningRestore: (payload) => ipcRenderer.invoke('security:advHardeningRestore', payload)
  },
  fs: {
    readFile: (path) => ipcRenderer.invoke('fs:readFile', path),
    writeFile: (payload) => ipcRenderer.invoke('fs:writeFile', payload)
  },
  autoclicker: {
    status: () => ipcRenderer.invoke('autoclicker:status'),
    start: (payload) => ipcRenderer.invoke('autoclicker:start', payload),
    stop: () => ipcRenderer.invoke('autoclicker:stop'),
    toggle: (payload) => ipcRenderer.invoke('autoclicker:toggle', payload),
    getHotkey: () => ipcRenderer.invoke('autoclicker:getHotkey'),
    setHotkey: (payload) => ipcRenderer.invoke('autoclicker:setHotkey', payload),
    setTabActive: (active) => ipcRenderer.invoke('autoclicker:setTabActive', active),
    onChanged: (cb) => {
      const handler = (_event, data) => cb(data)
      ipcRenderer.on('autoclicker:changed', handler)
      return () => ipcRenderer.removeListener('autoclicker:changed', handler)
    }
  },
  latency: {
    getConfig: () => ipcRenderer.invoke('latency:getConfig'),
    setConfig: (payload) => ipcRenderer.invoke('latency:setConfig', payload),
    enableUltra: () => ipcRenderer.invoke('latency:enableUltra'),
    enableUltraStable: (payload) => ipcRenderer.invoke('latency:enableUltraStable', payload),
    disableUltra: () => ipcRenderer.invoke('latency:disableUltra'),
    toggleUltra: () => ipcRenderer.invoke('latency:toggleUltra'),
    boostNow: () => ipcRenderer.invoke('latency:boostNow'),
    launchGameWithProfile: (payload) => ipcRenderer.invoke('latency:launchGameWithProfile', payload),
    queryTimer: () => ipcRenderer.invoke('latency:queryTimer'),
    getCpuTopology: () => ipcRenderer.invoke('latency:getCpuTopology')
  },
  library: {
    list: () => ipcRenderer.invoke('library:list'),
    upsert: (payload) => ipcRenderer.invoke('library:upsert', payload),
    upsertBulk: (payload) => ipcRenderer.invoke('library:upsertBulk', payload),
    remove: (payload) => ipcRenderer.invoke('library:remove', payload),
    discover: () => ipcRenderer.invoke('library:discover'),
    fetchCover: (payload) => ipcRenderer.invoke('library:fetchCover', payload),

    onUpdated: (callback) => {
      const handler = (_, data) => callback(data)
      ipcRenderer.on('library:updated', handler)
      return () => ipcRenderer.removeListener('library:updated', handler)
    },

    onGameStarted: (callback) => {
      const handler = (_, data) => callback(data)
      ipcRenderer.on('library:gameStarted', handler)
      return () => ipcRenderer.removeListener('library:gameStarted', handler)
    },

    onGameStopped: (callback) => {
      const handler = (_, data) => callback(data)
      ipcRenderer.on('library:gameStopped', handler)
      return () => ipcRenderer.removeListener('library:gameStopped', handler)
    },

    onActivityLogged: (callback) => {
      const handler = (_, data) => callback(data)
      ipcRenderer.on('library:activityLogged', handler)
      return () => ipcRenderer.removeListener('library:activityLogged', handler)
    }
  },
  setup: {
    installWinget: (apps) => ipcRenderer.invoke('setup:installWinget', apps),
    detectHardware: () => ipcRenderer.invoke('setup:detectHardware'),
    onInstallProgress: (callback) => {
      const listener = (_event, log) => callback(log);
      ipcRenderer.on('setup:installProgress', listener);
      return () => ipcRenderer.removeListener('setup:installProgress', listener);
    }
  },
  updater: {
    getStatus: () => ipcRenderer.invoke('updater:getStatus'),
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    onEvent: (callback) => {
      const listener = (_evt, payload) => callback(payload);
      ipcRenderer.on('updater:event', listener);
      return () => ipcRenderer.removeListener('updater:event', listener);
    }
  },
  optiscaler: {
    analyze: (payload) => ipcRenderer.invoke('optiscaler:analyze', payload),
    apply: (payload) => ipcRenderer.invoke('optiscaler:apply', payload),
    listBackups: (payload) => ipcRenderer.invoke('optiscaler:listBackups', payload),
    restoreBackup: (payload) => ipcRenderer.invoke('optiscaler:restoreBackup', payload),
    deleteBackup: (payload) => ipcRenderer.invoke('optiscaler:deleteBackup', payload),
    createManualBackup: (payload) => ipcRenderer.invoke('optiscaler:createManualBackup', payload),
    checkUpdate: () => ipcRenderer.invoke('optiscaler:checkUpdate'),
    downloadUpdate: (url) => ipcRenderer.invoke('optiscaler:downloadUpdate', url)
  },
  upscale: {
    dlssLatest: () => ipcRenderer.invoke('upscale:dlssLatest'),
    inspectGame: (dir) => ipcRenderer.invoke('upscale:inspectGame', { dir }),
    updateGame: (dir, force) => ipcRenderer.invoke('upscale:updateGame', { dir, force: force === true }),
    restoreGame: (dir) => ipcRenderer.invoke('upscale:restoreGame', { dir }),
    scanLibrary: () => ipcRenderer.invoke('upscale:scanLibrary'),
    autopilotStatus: () => ipcRenderer.invoke('upscale:autopilotStatus'),
    autopilotInstall: () => ipcRenderer.invoke('upscale:autopilotInstall'),
    autopilotLaunch: () => ipcRenderer.invoke('upscale:autopilotLaunch'),
    onLog: (callback) => {
      const handler = (_e, msg) => callback(msg)
      ipcRenderer.on('upscale:log', handler)
      return () => ipcRenderer.removeListener('upscale:log', handler)
    }
  },
  dlss5: {
    getSteamGames: () => ipcRenderer.invoke('dlss5:getSteamGames'),
    detectGpu: () => ipcRenderer.invoke('dlss5:detectGpu'),
    scanGame: (payload) => ipcRenderer.invoke('dlss5:scanGame', payload),
    revert: (payload) => ipcRenderer.invoke('dlss5:revert', payload),
    getRecentGames: () => ipcRenderer.invoke('dlss5:getRecentGames'),
    openFolder: (targetPath) => ipcRenderer.invoke('dlss5:openFolder', targetPath),
    onLog: (callback) => {
      const listener = (_event, msg) => callback(msg);
      ipcRenderer.on('dlss5:log', listener);
      return () => ipcRenderer.removeListener('dlss5:log', listener);
    }
  },
  darkpacer: {
    start: (payload) => ipcRenderer.invoke('framepacer:start', payload),
    stop: () => ipcRenderer.invoke('framepacer:stop'),
    updateConfig: (payload) => ipcRenderer.invoke('framepacer:updateConfig', payload),
    getMetrics: () => ipcRenderer.invoke('framepacer:getMetrics'),
    createOverlay: () => ipcRenderer.invoke('framepacer:createOverlay'),
    closeOverlay: () => ipcRenderer.invoke('framepacer:closeOverlay'),
    toggleOverlay: () => ipcRenderer.invoke('framepacer:toggleOverlay'),
    setOverlayClickThrough: (enabled) => ipcRenderer.invoke('framepacer:setOverlayClickThrough', enabled),
    setOverlayConfig: (config) => ipcRenderer.invoke('framepacer:setOverlayConfig', config),
    getOverlayStatus: () => ipcRenderer.invoke('framepacer:getOverlayStatus'),
    onMetrics: (callback) => {
      const listener = (_event, metrics) => callback(metrics);
      ipcRenderer.on('framepacer:metrics', listener);
      return () => ipcRenderer.removeListener('framepacer:metrics', listener);
    }
  },
  metadata: {
    read: (path) => ipcRenderer.invoke('metadata:read', path),
    remove: (payload) => ipcRenderer.invoke('metadata:remove', payload),
    update: (payload) => ipcRenderer.invoke('metadata:update', payload)
  },
  metax: {
    read: (path) => ipcRenderer.invoke('metax:read', path),
    write: (payload) => ipcRenderer.invoke('metax:write', payload),
    setFileProps: (payload) => ipcRenderer.invoke('metax:setFileProps', payload),
    removeStream: (payload) => ipcRenderer.invoke('metax:removeStream', payload)
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
  },
  share: {
    state: () => ipcRenderer.invoke('share:state'),
    setConfig: (patch) => ipcRenderer.invoke('share:setConfig', patch),
    pickAndUpload: () => ipcRenderer.invoke('share:pickAndUpload'),
    uploadFiles: (files) => ipcRenderer.invoke('share:uploadPaths', { paths: pathsOf(files) }),
    uploadScreenshot: (file) => ipcRenderer.invoke('share:uploadFile', { file }),
    cancel: (jobId) => ipcRenderer.invoke('share:cancel', { jobId }),
    remove: (id) => ipcRenderer.invoke('share:delete', { id }),
    copy: (text) => ipcRenderer.invoke('share:copy', { text }),
    qr: (text) => ipcRenderer.invoke('share:qr', { text }),
    capture: () => ipcRenderer.invoke('share:capture'),
    captureRegion: () => ipcRenderer.invoke('share:captureRegion'),
    grabRegion: () => ipcRenderer.invoke('share:grabRegion'),
    openFolder: () => ipcRenderer.invoke('share:openFolder'),
    recentShots: () => ipcRenderer.invoke('share:recentShots'),
    onEvent: (callback) => {
      const handler = (_e, msg) => callback(msg)
      ipcRenderer.on('share:event', handler)
      return () => ipcRenderer.removeListener('share:event', handler)
    }
  },
  realtime: {
    status: () => ipcRenderer.invoke('realtime:status'),
    setConfig: (patch) => ipcRenderer.invoke('realtime:setConfig', patch),
    quarantineList: () => ipcRenderer.invoke('realtime:quarantineList'),
    quarantineRestore: (id) => ipcRenderer.invoke('realtime:quarantineRestore', { id }),
    quarantineDelete: (id) => ipcRenderer.invoke('realtime:quarantineDelete', { id }),
    clamavInstall: () => ipcRenderer.invoke('realtime:clamavInstall'),
    clamavUpdate: () => ipcRenderer.invoke('realtime:clamavUpdate'),
    scanFiles: () => ipcRenderer.invoke('realtime:scanFiles'),
    onEvent: (callback) => {
      const handler = (_e, msg) => callback(msg)
      ipcRenderer.on('realtime:event', handler)
      return () => ipcRenderer.removeListener('realtime:event', handler)
    }
  },
  hwsensors: {
    status: () => ipcRenderer.invoke('hwsensors:status'),
    setEnabled: (payload) => ipcRenderer.invoke('hwsensors:setEnabled', payload)
  },
  diskscan: {
    drives: () => ipcRenderer.invoke('diskscan:drives'),
    pickFolder: () => ipcRenderer.invoke('diskscan:pickFolder'),
    start: (payload) => ipcRenderer.invoke('diskscan:start', payload),
    cancel: () => ipcRenderer.invoke('diskscan:cancel'),
    status: () => ipcRenderer.invoke('diskscan:status'),
    view: (payload) => ipcRenderer.invoke('diskscan:view', payload),
    info: (payload) => ipcRenderer.invoke('diskscan:info', payload),
    tag: (payload) => ipcRenderer.invoke('diskscan:tag', payload),
    open: (payload) => ipcRenderer.invoke('diskscan:open', payload),
    reveal: (payload) => ipcRenderer.invoke('diskscan:reveal', payload),
    trash: (payload) => ipcRenderer.invoke('diskscan:trash', payload),
    exportReport: (payload) => ipcRenderer.invoke('diskscan:export', payload),
    onProgress: (callback) => {
      const listener = (_e, st) => callback(st)
      ipcRenderer.on('diskscan:progress', listener)
      return () => ipcRenderer.removeListener('diskscan:progress', listener)
    }
  },
  wintools: {
    listFeatures: () => ipcRenderer.invoke('wintools:listFeatures'),
    setFeature: (payload) => ipcRenderer.invoke('wintools:setFeature', payload),
    run: (payload) => ipcRenderer.invoke('wintools:run', payload),
    openPanel: (payload) => ipcRenderer.invoke('wintools:openPanel', payload)
  },
  driver: {
    detect: () => ipcRenderer.invoke('driver:detect'),
    openOfficial: (payload) => ipcRenderer.invoke('driver:openOfficial', payload),
    cameraStatus: () => ipcRenderer.invoke('driver:cameraStatus'),
    repairCamera: () => ipcRenderer.invoke('driver:repairCamera'),
    scanMissing: () => ipcRenderer.invoke('driver:scanMissing'),
    findDrivers: (payload) => ipcRenderer.invoke('driver:findDrivers', payload),
    install: (payload) => ipcRenderer.invoke('driver:install', payload),
    onInstallEvent: (callback) => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('driver:installEvent', listener)
      return () => ipcRenderer.removeListener('driver:installEvent', listener)
    }
  },
  powershell: {
    getPolicies: () => ipcRenderer.invoke('powershell:getPolicies'),
    listScripts: () => ipcRenderer.invoke('powershell:listScripts'),
    getSignature: (payload) => ipcRenderer.invoke('powershell:getSignature', payload),
    runScript: (payload) => ipcRenderer.invoke('powershell:runScript', payload),
    openElevatedTerminal: (payload) => ipcRenderer.invoke('powershell:openElevatedTerminal', payload),
    previewTool: (payload) => ipcRenderer.invoke('powershell:previewTool', payload),
    runTool: (payload) => ipcRenderer.invoke('powershell:runTool', payload),
    pickFolder: (payload) => ipcRenderer.invoke('powershell:pickFolder', payload),
    pickSavePath: (payload) => ipcRenderer.invoke('powershell:pickSavePath', payload),
    exportResult: (payload) => ipcRenderer.invoke('powershell:export', payload),
    revealFile: (payload) => ipcRenderer.invoke('powershell:revealFile', payload),
    openReport: (payload) => ipcRenderer.invoke('powershell:openReport', payload),
    wifiKey: (payload) => ipcRenderer.invoke('powershell:wifiKey', payload),
    hostsRead: () => ipcRenderer.invoke('powershell:hostsRead'),
    hostsBackup: (payload) => ipcRenderer.invoke('powershell:hostsBackup', payload),
    hostsPreview: (payload) => ipcRenderer.invoke('powershell:hostsPreview', payload),
    hostsWrite: (payload) => ipcRenderer.invoke('powershell:hostsWrite', payload),
    customStart: (payload) => ipcRenderer.invoke('powershell:customStart', payload),
    customStop: () => ipcRenderer.invoke('powershell:customStop'),
    customStatus: () => ipcRenderer.invoke('powershell:customStatus'),
    onCustomEvent: (callback) => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('powershell:customEvent', listener)
      return () => ipcRenderer.removeListener('powershell:customEvent', listener)
    },
    snippetsList: () => ipcRenderer.invoke('powershell:snippetsList'),
    snippetSave: (payload) => ipcRenderer.invoke('powershell:snippetSave', payload),
    snippetDelete: (payload) => ipcRenderer.invoke('powershell:snippetDelete', payload)
  },
  discord: {
    sendMessage: (payload) => ipcRenderer.invoke('discord:sendMessage', payload),
    reportError: (payload) => ipcRenderer.invoke('discord:reportError', payload)
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    close: () => ipcRenderer.invoke('window:close')
  },
  network: {
    ping: (host) => ipcRenderer.invoke('network:ping', host),
    portScan: (payload) => ipcRenderer.invoke('network:portScan', payload),
    flushDns: () => ipcRenderer.invoke('network:flushDns'),
    resetTcp: () => ipcRenderer.invoke('network:resetTcp'),
    dnsInfo: () => ipcRenderer.invoke('network:dnsInfo'),
    tracert: (host) => ipcRenderer.invoke('network:tracert', host),
    adapterInfo: () => ipcRenderer.invoke('network:adapterInfo'),
    renewIp: () => ipcRenderer.invoke('network:renewIp'),
    latencyPresets: () => ipcRenderer.invoke('network:latencyPresets'),
    probe: (payload) => ipcRenderer.invoke('network:probe', payload),
    traceHops: (payload) => ipcRenderer.invoke('network:traceHops', payload),
    bufferbloat: (payload) => ipcRenderer.invoke('network:bufferbloat', payload),
    mtuDiscover: (payload) => ipcRenderer.invoke('network:mtuDiscover', payload),
    latencyState: () => ipcRenderer.invoke('network:latencyState'),
    applyLatencyTweak: (payload) => ipcRenderer.invoke('network:applyLatencyTweak', payload),
    restoreLatencyTweak: (payload) => ipcRenderer.invoke('network:restoreLatencyTweak', payload)
  },
}

darkhubApi.framepacer = darkhubApi.darkpacer

// Dev-only IPC trace (main registers these channels only when not packaged).
darkhubApi.dev = {
  getTrace: () => ipcRenderer.invoke('dev:getTrace'),
  clearTrace: () => ipcRenderer.invoke('dev:clearTrace'),
  onIpcTrace: (callback) => {
    const handler = (_, entry) => callback(entry)
    ipcRenderer.on('dev:ipcTrace', handler)
    return () => ipcRenderer.removeListener('dev:ipcTrace', handler)
  }
}

contextBridge.exposeInMainWorld('darkhub', darkhubApi)
