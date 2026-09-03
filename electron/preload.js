const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('darkhub', {
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
    runBenchmark: () => ipcRenderer.invoke('system:runBenchmark')
  },
  app: {
    getAbout: () => ipcRenderer.invoke('app:getAbout')
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
    listOperations: () => ipcRenderer.invoke('optimizer:listOperations'),
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
    openTamperSettings: () => ipcRenderer.invoke('optimizer:openTamperSettings'),
    applyMsiMode: () => ipcRenderer.invoke('optimizer:applyMsiMode'),
    applyExtremeKernelMod: () => ipcRenderer.invoke('optimizer:applyExtremeKernelMod'),
    applyExtremeNetworkMod: () => ipcRenderer.invoke('optimizer:applyExtremeNetworkMod'),
    applyCpuUnpark: () => ipcRenderer.invoke('optimizer:applyCpuUnpark')
  },
  dialog: {
    selectFiles: (options) => ipcRenderer.invoke('dialog:selectFiles', options),
    selectFolder: (options) => ipcRenderer.invoke('dialog:selectFolder', options),
    saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options),
    grantDroppedFiles: (filePaths) => ipcRenderer.invoke('dialog:grantDroppedFiles', filePaths)
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
    import: (payload) => ipcRenderer.invoke('vault:import', payload)
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
    resetCommunityRules: () => ipcRenderer.invoke('security:resetCommunityRules')
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
    setTabActive: (active) => ipcRenderer.invoke('autoclicker:setTabActive', active)
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
  injector: {
    inject: (payload) => ipcRenderer.invoke('injector:inject', payload)
  },
  pge: {
    openPortable: () => ipcRenderer.invoke('pge:openPortable')
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
  framepacer: {
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
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
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
    renewIp: () => ipcRenderer.invoke('network:renewIp')
  },
  steamLua: {
    getStatus: () => ipcRenderer.invoke('steamLua:getStatus'),
    listInstalled: () => ipcRenderer.invoke('steamLua:listInstalled'),
    getDetails: (appId) => ipcRenderer.invoke('steamLua:getDetails', appId),
    saveLuaText: (payload) => ipcRenderer.invoke('steamLua:saveLuaText', payload),
    toggleDepot: (payload) => ipcRenderer.invoke('steamLua:toggleDepot', payload),
    toggleOnlineFix: (payload) => ipcRenderer.invoke('steamLua:toggleOnlineFix', payload),
    deleteLua: (appId) => ipcRenderer.invoke('steamLua:deleteLua', appId),
    installLua: (payload) => ipcRenderer.invoke('steamLua:installLua', payload),
    installManifest: (filePath) => ipcRenderer.invoke('steamLua:installManifest', filePath),
    restartSteam: () => ipcRenderer.invoke('steamLua:restartSteam'),
    fetchStoreInfo: (appId) => ipcRenderer.invoke('steamLua:fetchStoreInfo', appId),
    openStPlugInFolder: () => ipcRenderer.invoke('steamLua:openStPlugInFolder'),
    downloadAndInstallPackage: (params) => ipcRenderer.invoke('steamLua:downloadAndInstallPackage', params),
    configureSpacewarAppIdTxt: (payload) => ipcRenderer.invoke('steamLua:configureSpacewarAppIdTxt', payload)
  },
  steamUnlocker: {
    getStatus: () => ipcRenderer.invoke('steamUnlocker:getStatus'),
    install: (mode) => ipcRenderer.invoke('steamUnlocker:install', mode),
    uninstall: () => ipcRenderer.invoke('steamUnlocker:uninstall')
  }
})
