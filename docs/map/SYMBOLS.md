<!-- GERADO por electron_feature_map.py em 2026-10-21T20:39:59. NAO edite a mao: rode `npm run map`. -->

# Indice de simbolos (arquivo -> funcoes com linha)

Busque aqui com Ctrl+F / grep pelo nome da funcao.

## `electron/configManager.js`

`mergeDefaultConfig`:12, `shouldMigrateVerifyUrl`:36, `loadConfig`:48, `saveConfig`:67, `getDefaultConfig`:73

## `electron/devBootstrap.js`

`preview`:25, `emit`:38

## `electron/devSelfTest.js`

`short`:19, `withTimeout`:25, `sleep`:26, `mainWindow`:28, `run`:37, `call`:66, `callLong`:125

## `electron/devSelfTestMutate.js`

`sleep`:5, `runMutations`:7, `rec`:9, `step`:11, `okOf`:17, `ps`:99, `ps`:117, `installed`:118, `pickOne`:134, `st`:150

## `electron/gamingBooster.js`

`GamingBooster`:8 _class_, `start`:15, `stop`:38, `prioritizeGameProcesses`:46

## `electron/hal/HardwareHAL.js`

`HardwareHAL`:14 _class_, `init`:29, `shutdown`:35, `pollCpu`:41, `pollRam`:42, `pollDiskIo`:43, `pollLatency`:44, `pollGpu`:45, `pollStorage`:46, `pollNetwork`:47, `pollProcesses`:48, `pollTemps`:49, `pollAll`:51, `getSnapshot`:63

## `electron/hal/collectors/BaseCollector.js`

`BaseCollector`:5 _class_, `_memo`:11, `_freshness`:19

## `electron/hal/collectors/CpuCollector.js`

`CpuCollector`:5 _class_, `poll`:13

## `electron/hal/collectors/DiskCollector.js`

`DiskCollector`:5 _class_, `poll`:22

## `electron/hal/collectors/FastSensorDaemon.js`

`FastSensorDaemon`:18 _class_, `start`:28, `stop`:66

## `electron/hal/collectors/GpuCollector.js`

`GpuCollector`:15 _class_, `_ensureStaticData`:40, `poll`:54, `_build`:74, `na`:75, `smi`:76, `pdh`:77

## `electron/hal/collectors/HwSensorsDaemon.js`

`isPawnIoInstalled`:17, `forgetPawnIoCheck`:28, `HwSensorsDaemon`:34 _class_, `enabled`:51, `enabled`:55, `status`:60, `start`:73, `stop`:110, `restart`:121

## `electron/hal/collectors/LatencyCollector.js`

`LatencyCollector`:7 _class_, `_ensureDrivers`:30, `poll`:54

## `electron/hal/collectors/NetworkCollector.js`

`NetworkCollector`:5 _class_, `poll`:20

## `electron/hal/collectors/NvidiaDaemon.js`

`NvidiaDaemon`:20 _class_, `start`:35, `_parseRow`:102, `num`:108, `_scheduleFlush`:131, `_flush`:139, `stop`:151

## `electron/hal/collectors/ProcessCollector.js`

`ProcessCollector`:6 _class_, `poll`:23, `normalize`:43

## `electron/hal/collectors/RamCollector.js`

`RamCollector`:5 _class_, `poll`:6

## `electron/hal/collectors/SensorBus.js`

`SensorBus`:6 _class_, `_wire`:15, `forward`:18, `start`:24, `stop`:34, `setAdvanced`:43, `running`:53

## `electron/hal/collectors/SlowSensorDaemon.js`

`SlowSensorDaemon`:6 _class_, `_buildScript`:23, `start`:138, `stop`:191

## `electron/hal/collectors/StorageCollector.js`

`StorageCollector`:6 _class_, `poll`:19

## `electron/hal/collectors/TempsCollector.js`

`TempsCollector`:9 _class_, `_isFresh`:59, `_hwmonLabel`:63, `_trackMinMax`:69, `_lhmFresh`:81, `_resolveCpuTemp`:83, `poll`:95, `_build`:108, `_formatZoneName`:240

## `electron/hal/collectors/lhmSummary.js`

`find`:4, `buildTree`:10, `summarizeLhm`:23, `g`:39

## `electron/hal/models/SensorModel.js`

`createSensor`:3, `createUnavailableSensor`:25, `classifyTemperature`:33, `numOrNull`:48, `sameGpu`:55, `n`:56

## `electron/ipc/darkosIpc.js`

`registerDarkOSIPC`:7, `pick`:13, `sendTo`:15, `handle`:21

## `electron/ipc/diskScanIpc.js`

`registerDiskScanIPC`:4, `handle`:6, `winOf`:12

## `electron/ipc/driverIpc.js`

`registerDriverIPC`:8, `handle`:11

## `electron/ipc/hwSensorsIpc.js`

`registerHwSensorsIPC`:6, `handle`:7, `elevated`:13

## `electron/ipc/powershellIpc.js`

`registerPowerShellIPC`:8, `handle`:11

## `electron/ipc/winToolsIpc.js`

`registerWinToolsIPC`:4, `handle`:5

## `electron/latencyGuardian.js`

`now`:16, `clampInt`:20, `stablePolicyName`:26, `safeJsonParse`:31, `psSingleQuote`:40, `encodedPowerShellArgs`:44, `isSafePingHost`:48, `registerLatencyGuardian`:52, `broadcastEvent`:65, `loadConfig`:133, `normalizeConfig`:145, `saveConfig`:189, `getProcessSnapshot`:196, `findGameProcess`:207, `setPowerPlanHighPerformance`:223, `restorePowerPlan`:235, `startTimerResolution05ms`:241, `clear`:267, `stopTimerResolution`:275, `setGamePriorityHigh`:286, `setDisableFullscreenOptimizations`:302, `restoreFullscreenOptimizations`:327, `setMouseAccelerationDisabled`:346, `restoreMouseAcceleration`:373, `setGpuHighPerformancePreference`:388, `restoreGpuPreference`:412, `applyDnsCloudflareWithUndo`:431, `restoreDns`:467, `setQosForExe`:487, `removeQosPolicy`:511, `setNagleDisabledOnActiveInterface`:519, `restoreNagle`:566, `optimizeGlobalTcpStack`:582, `restoreGlobalTcpStack`:596, `killBackgroundProcesses`:607, `serializeTransition`:628, `ultraEnable`:634, `ultraDisable`:638, `ultraEnableImpl`:642, `setApplied`:661, `ultraDisableImpl`:805, `unregisterHotkey`:856, `registerHotkey`:862, `updateMetricsFast`:879, `updateGpuUsage`:889, `updatePing`:910, `finish`:932, `smartCleanRam`:945, `loop`:978, `loopTick`:989, `start`:1011, `stop`:1029, `splitArgs`:1189

## `electron/libraryStore.js`

`filePath`:5, `backupFilePath`:9, `tempFilePath`:13, `newId`:17, `newProfileId`:22, `sanitizeProfile`:27, `sanitizeOptiScaler`:58, `sanitizeGame`:76, `tryReadGames`:117, `loadLibrary`:128, `saveLibrary`:145, `serialized`:163, `upsertGame`:169, `upsertGameUnsafe`:173, `upsertGamesBulk`:184, `upsertGamesBulkUnsafe`:188, `removeGame`:201, `removeGameUnsafe`:205, `updateGame`:213

## `electron/machineMarker.js`

`_getH`:23, `_mk`:39, `_regW`:50, `_regR`:62, `ensureMachineMarker`:74, `_writeMarker`:90, `_readMarker`:110

## `electron/main.js`

`getSystemInformation`:100, `get`:106, `getSharp`:115, `createOcrWorker`:120, `getExiftool`:126, `getFfmpegPath`:134, `getLibraryStore`:166, `getYtDlpTools`:184, `isDev`:189, `normalizeAccessPath`:224, `isPathInside`:234, `grantFilePath`:240, `grantDirectoryPath`:245, `hasFileAccessGrant`:250, `assertOutputDirGranted`:262, `assertFileAccessGranted`:268, `assertFileAccessGrantedMany`:277, `psSingleQuote`:283, `normalizeWebhookUrl`:287, `loadRuntimeConfig`:306, `canSendDiscord`:332, `truncateDiscord`:346, `redactSensitive`:352, `normalizeTelemetryError`:363, `postDiscord`:372, `reportBugTelemetry`:400, `isAllowedExternalProtocol`:429, `getAllowedExternalUrl`:433, `openAllowedExternalUrlDetached`:443, `isEmbeddedExternalProtocol`:454, `handleEmbeddedExternalNavigation`:458, `isTrustedAppNavigation`:470, `getAppIconPath`:480, `showMainWindow`:495, `ensureTray`:508, `hideWindowToBackground`:535, `estimateDirectoryBytes`:540, `computeJunkEstimate`:584, `work`:598, `createMainWindow`:665, `kickWindowsPaint`:730, `showWhenReady`:797, `eventSender`:888, `measureLatency`:915, `getActiveAdapterName`:945, `getMainCpuLoad`:1181, `broadcastLibraryEvent`:1325, `scoreExecutable`:1394, `key`:1399, `scanDirectoryForBestExe`:1420, `walk`:1423, `findPgeBat`:1564, `launchPgeBat`:1584, `isStartupTaskEnabled`:1660, `setStartupTask`:1670, `refreshLiveCounts`:1814, `sendEvent`:2089, `findLibreOfficeSoffice`:2321, `toXml`:2413, `buildArgs`:2506, `vaultFilePath`:2778, `setVaultAutoLockMinutes`:2786, `clearVaultAutoLock`:2793, `scheduleVaultAutoLock`:2800, `touchVault`:2809, `vaultFileExists`:2813, `readVaultFile`:2822, `writeVaultFile`:2827, `lockVault`:2835, `ensureUnlocked`:2842, `loadVaultUsingWrapper`:2847, `persistVaultData`:2862, `getSecurityScoreV2`:3152, `add`:3157, `isValidHostname`:3334, `autoclickerConfigPath`:3473, `loadAutoClickerConfig`:3477, `saveAutoClickerConfig`:3497, `unregisterAutoClickerHotkey`:3508, `registerAutoClickerHotkey`:3514, `getClickEnginePath`:3531, `startAutoClicker`:3551, `stopAutoClicker`:3708, `isValidWingetId`:3878, `installGithubReleaseMsi`:3890, `progress`:3919, `tryInstall`:3947, `runDeferredStartup`:4014

## `electron/networkIPC.js`

`assertSafeHost`:8, `runCmd`:16, `registerNetworkIPC`:29, `checkPort`:73

## `electron/optiscalerManager.js`

`nowStamp`:31, `pad`:33, `getSourceVersion`:37, `resolveReleaseDir`:49, `normalizeWinPath`:64, `exists`:68, `readJsonIfExists`:77, `runPowerShellJson`:85, `classifyAmdArchitecture`:103, `getGpuInfo`:122, `getWindowsBuild`:150, `isWindows11OrNewer`:155, `walkFiles`:159, `walk`:164, `findUnrealExecutableCandidates`:187, `detectUpscaleFiles`:195, `add`:197, `fileContainsOptiScalerSignature`:229, `isOptiScalerLoader`:254, `detectInstalledLoaders`:271, `chooseLoader`:294, `chooseInputApi`:311, `normalizeChoice`:318, `buildIniPatch`:323, `setIniValue`:369, `applyIniPatch`:407, `getExePayload`:411, `buildAnalysis`:421, `backupPathIfExists`:560, `copySourceRootFiles`:576, `copySourceDirectory`:595, `makeUniqueBackupDir`:606, `rollbackApply`:616, `withMutationLock`:640, `isSameInstall`:646, `resolveFsr4Rdna2Path`:663, `applyOptiScaler`:708, `listBackups`:861, `isInsideDir`:897, `resolveBackupDir`:902, `restoreBackup`:913, `deleteBackup`:1113, `createManualBackup`:1132, `registerOptiScalerIPC`:1168

## `electron/overlay.js`

`getRealLatency`:12, `finish`:18, `createGamingOverlay`:33, `toggleGamingOverlay`:169

## `electron/preload.js`

`pathsOf`:5, `handler`:10, `handler`:56, `listener`:94, `listener`:156, `listener`:180, `handler`:241, `handler`:267, `handler`:273, `handler`:279, `handler`:285, `listener`:294, `listener`:305, `listener`:331, `listener`:348, `listener`:379, `handler`:432

## `electron/services/CoverProviderService.js`

`httpsGet`:15, `CoverProviderService`:40 _class_, `init`:50, `steamProvider`:56, `downloadImage`:97, `fail`:110, `fetchCover`:136

## `electron/services/CpuLoadTracker.js`

`CpuLoadTracker`:5 _class_, `sample`:10

## `electron/services/DarkHub.ClickEngine.cs`

`ClickEngine`:8 _class_, `INPUT`:11 _class_, `MOUSEINPUT`:18 _class_, `SendInput`:29, `mouse_event`:32, `OpenInputDesktop`:35, `SetThreadDesktop`:38, `CloseDesktop`:41, `GetAsyncKeyState`:44, `timeBeginPeriod`:47, `timeEndPeriod`:50, `CreateWaitableTimerExW`:53, `SetWaitableTimer`:56, `WaitForSingleObject`:59, `CloseHandle`:62, `SendMouseButtonDown`:86, `SendMouseButtonUp`:108, `ReleaseAllButtons`:130, `PerformClick`:141, `WorkerLoop`:174, `RunClickLoop`:206, `ParseVkKey`:264, `HotkeyListenerLoop`:285, `StartClicking`:322, `StopClicking`:350, `Cleanup`:364, `SetHotkey`:375, `Main`:381

## `electron/services/DarkHub.DiskScan.cs`

`DiskScan`:21 _class_, `WIN32_FIND_DATA`:24 _class_, `FindFirstFileExW`:39, `FindNextFileW`:42, `FindClose`:45, `Job`:54 _class_, `ToMs`:63, `Clean`:65, `Flush`:67, `LongPath`:75, `ScanDir`:82, `Worker`:125, `Main`:147

## `electron/services/DarkHub.FrameLimiter.cs`

`PacerConfig`:14 _class_, `TelemetrySnapshot`:23 _class_, `DarkHubFrameLimiter`:41 _class_, `OpenProcess`:46, `VirtualAllocEx`:48, `WriteProcessMemory`:50, `CreateRemoteThread`:52, `GetModuleHandle`:54, `GetProcAddress`:56, `CloseHandle`:58, `QueryFullProcessImageName`:60, `GetForegroundWindow`:62, `GetWindowThreadProcessId`:64, `IsWindowVisible`:66, `VirtualFreeEx`:69, `WaitForSingleObject`:71, `GetProcessPath`:108, `DetectActiveGame`:119, `InjectHookDll`:220, `ResetCap`:271, `ClampFps`:277, `UpdateSharedConfig`:284, `UpdateSharedConfig`:289, `OpenTelemetry`:327, `CloseTelemetry`:344, `ReadSharedTelemetry`:356, `Fd`:409, `EscJ`:414, `EmitTelemetry`:416, `ReadStdin`:453, `Main`:508

## `electron/services/DarkHub.FramePacer.ps1`

`ApplyDriverLimit`:99

## `electron/services/DarkHub.LatencyEngine.cs`

`PROCESS_POWER_THROTTLING_STATE`:17 _class_, `DarkHubLatencyEngine`:24 _class_, `NtSetTimerResolution`:29, `NtQueryTimerResolution`:32, `TimeBeginPeriod`:35, `TimeEndPeriod`:38, `AvSetMmThreadCharacteristicsW`:41, `AvRevertMmThreadCharacteristics`:44, `OpenProcess`:47, `SetPriorityClass`:50, `SetProcessPriorityBoost`:53, `SetProcessAffinityMask`:56, `GetProcessAffinityMask`:59, `CloseHandle`:62, `GetCurrentProcess`:65, `GetCurrentThread`:68, `SetThreadPriority`:71, `SetProcessInformation`:74, `IcmpCreateFile`:77, `IcmpCloseHandle`:80, `IcmpSendEcho`:83, `EmptyWorkingSet`:95, `Main`:127, `NamedPipeServerWorker`:183, `HandleCommand`:213, `LockTimerResolution`:305, `UnlockTimerResolution`:329, `TimerWorkerLoop`:343, `QueryTimerResolutionInternal`:402, `HandleBoostProcess`:428, `HandleSetAffinity`:480, `HandleCleanRam`:512, `GetCpuTopologyInternal`:543, `HandlePingNative`:568, `IP_OPTION_INFORMATION`:655 _class_, `ICMP_ECHO_REPLY`:665 _class_, `SendJson`:676, `FormatResponse`:681, `DictionaryToJson`:692, `ObjectToJson`:708, `GetJsonStringValue`:721, `GetJsonIntValue`:733, `GetJsonBoolValue`:747

## `electron/services/DarkHub.SensorDaemon.cs`

`DarkHubSensorDaemon`:9 _class_, `PdhOpenQueryW`:11, `PdhAddEnglishCounterW`:14, `PdhCollectQueryData`:17, `PdhGetFormattedCounterValue`:20, `PdhGetFormattedCounterArrayW`:23, `PdhCloseQuery`:26, `PDH_FMT_COUNTERVALUE`:29 _class_, `CoreTempData`:35 _class_, `ItemValid`:62, `ReadCoreTemp`:67, `Main`:100, `ReadSingle`:291, `ReadMultiFiltered`:301, `ReadByLuid`:347, `GpuAdapter`:377 _class_, `DXGI_ADAPTER_DESC1`:380 _class_, `CreateDXGIFactory1`:404, `EnumerateAdapters`:407, `Num`:428, `EscapeJson`:432

## `electron/services/DeepHardwareService.js`

`DeepHardwareService`:6 _class_, `runPowerShell`:13, `wrapStatus`:23, `fetchCpu`:29, `fetchMainboard`:58, `fetchMemory`:82, `fetchGpu`:104, `fetchStorage`:184, `fetchNetwork`:241, `fetchMonitors`:261, `fetchOS`:287, `getDeepInfo`:325, `_scanAll`:337, `getCategory`:367

## `electron/services/DriverCenterService.js`

`classifyVendor`:35, `vendorFromPnpId`:48, `isGenericDisplayDriver`:61, `officialSourcesFor`:69, `isOfficialDriverUrl`:74, `normalizeAdapter`:88, `Step`:177, `cameraIssues`:225, `DriverCenterService`:243 _class_, `cameraStatus`:251, `repairCamera`:269, `detectAdapters`:286, `resolveOfficialUrl`:310

## `electron/services/FramePacerEngine.js`

`FramePacerEngine`:13 _class_, `start`:40, `stop`:64, `updateConfig`:76, `getMetrics`:101, `_getExePath`:110, `_spawnNativeProcess`:134, `_killNativeProcess`:207, `_killSync`:224, `registerExitKill`:236

## `electron/services/FramePacerOverlay.js`

`createFramePacerOverlay`:17, `drawGraph`:260, `metricsHandler`:326, `closeFramePacerOverlay`:350, `toggleFramePacerOverlay`:357, `setOverlayClickThrough`:371, `setOverlayConfig`:379, `getOverlayStatus`:384

## `electron/services/HardwareService.js`

`HardwareService`:8 _class_, `init`:23, `recompute`:38, `dropSender`:46, `_bindWindowVisibility`:79, `pause`:88, `resume`:89, `_setPaused`:102, `_clearIdleTimer`:124, `emitSnapshot`:131, `_setup`:151, `_stopTimer`:162, `_stopDaemons`:169, `start`:175, `stop`:184, `teardown`:198

## `electron/services/LoggerService.js`

`redactSecrets`:21, `LoggerService`:27 _class_, `init`:33, `_rotateLogIfNeeded`:41, `_truncate`:51, `auditOptimizer`:58, `getOptimizerAuditLog`:87, `_format`:103, `_write`:109, `info`:124, `warn`:128, `error`:132, `track`:137

## `electron/services/ManagedProcessRegistry.js`

`ManagedProcessRegistry`:3 _class_, `claim`:8, `release`:14, `releaseAllBy`:20, `isManaged`:26

## `electron/services/NativeLatencyClient.js`

`NativeLatencyClient`:11 _class_, `getExecutablePath`:20, `ensureRunning`:35, `_rejectAllPending`:104, `sendCommand`:112, `lockTimer`:144, `unlockTimer`:149, `queryTimer`:154, `boostProcess`:159, `setAffinity`:169, `getCpuTopology`:178, `pingNative`:188, `cleanRam`:200, `dispose`:208, `killSync`:230, `registerExitKill`:245

## `electron/services/PowerShellRunner.js`

`runCommand`:13, `finish`:31, `appendChunk`:38, `stripBom`:93, `encodePowerShellScript`:98, `powerShellArgsForEncodedScript`:105, `parseJsonOutput`:116, `psSingleQuote`:141, `runPowerShell`:145, `runPowerShellJson`:222

## `electron/services/PowerShellToolsService.js`

`isPs1`:20, `isUnderDarkOS`:29, `normalizeScopes`:45, `effectivePolicy`:53, `normalizeSignature`:63, `psQuote`:69, `safeJson`:74, `PowerShellToolsService`:82 _class_, `_isTrustedPath`:94, `getPolicies`:105, `listScripts`:115, `getSignature`:153, `runScript`:170, `openElevatedTerminal`:205

## `electron/services/SecureDownload.js`

`assertAllowedUrl`:15, `downloadToFile`:35, `cleanupAndReject`:48, `unlink`:52, `attempt`:61, `fetchJson`:134, `assetSha256`:165

## `electron/services/SecurityService.js`

`SecurityService`:11 _class_, `init`:38, `_getShieldPrefPath`:92, `_readShieldPref`:96, `_writeShieldPref`:104, `autoShieldBoot`:112, `runPowerShell`:127, `calculateEntropy`:141, `scanRunningProcesses`:188, `scanUrl`:286, `enablePhishingShield`:388, `disablePhishingShield`:431, `getPhishingShieldStatus`:459, `getLiveNetworkConnections`:476, `checkRansomwareArmor`:514, `enableRansomwareArmor`:536, `_getRulesFilePath`:557, `loadCommunityRules`:564, `getCommunityRules`:584, `getAllPhishingDomains`:595, `importCommunityRules`:599, `resetCommunityRules`:636

## `electron/services/UpdateService.js`

`UpdateService`:9 _class_, `init`:23, `_setupUpdater`:44, `_scheduleAutoCheck`:126, `_setState`:133, `checkForUpdates`:137, `downloadUpdate`:197, `fail`:217, `installUpdate`:271, `_fetchLatestGitHubRelease`:304, `_isNewerVersion`:338, `_registerIPC`:350, `_emit`:362, `destroy`:368

## `electron/services/darkos/DarkOS.Cli.ps1`

`Write-DhLine`:22, `Write-DhFail`:23, `ConvertTo-CliJson`:26

## `electron/services/darkos/DarkOS.Recovery.psm1`

`Get-DkPath`:38, `Set-DarkOSEnvironment`:56, `Get-DkBackend`:78, `Invoke-Dk`:83, `Write-DkProgress`:114, `Get-DkTimestamp`:119, `ConvertTo-DkSignedDword`:122, `ConvertTo-DkUInt32`:127, `Test-DkRegValueEqual`:131, `Write-DkLog`:139, `ConvertTo-DkHashtable`:151, `Read-DkJsonFile`:172, `Write-DkJsonFileAtomic`:181, `Enter-DkLock`:199, `Exit-DkLock`:210, `New-DkManifest`:220, `Read-DkManifest`:233, `Save-DkManifest`:240, `Get-DkManifestOrInit`:242, `Get-DkEntry`:248, `Set-DkEntry`:254, `Add-DkHistory`:266, `Get-DkCatalogRaw`:274, `Load-DkFakeState`:302, `Save-DkFakeState`:310, `New-DkFakeBackend`:312, `New-DkRealBackend`:443, `Enter-DkDefaultUser`:699, `Exit-DkDefaultUser`:710, `Resolve-DkRegTarget`:722, `Get-DkRegEntries`:746, `Invoke-DkRegistryCapture`:748, `Invoke-DkRegistryApply`:761, `Invoke-DkRegistryVerify`:773, `Invoke-DkRegistryRevert`:788, `Invoke-DkServiceCapture`:798, `Invoke-DkServiceApply`:804, `Invoke-DkServiceVerify`:809, `Invoke-DkServiceRevert`:815, `Invoke-DkTaskCapture`:821, `Invoke-DkTaskApply`:826, `Invoke-DkTaskVerify`:827, `Invoke-DkTaskRevert`:834, `Invoke-DkPowercfgCapture`:841, `Invoke-DkPowercfgApply`:842, `Invoke-DkPowercfgVerify`:860, `Invoke-DkPowercfgRevert`:868, `Invoke-DkDefaultAssocCapture`:870, `Invoke-DkDefaultAssocApply`:871, `Invoke-DkDefaultAssocVerify`:872, `Invoke-DkDefaultAssocRevert`:873, `Resolve-DkPayloadPath`:875, `Get-DkAppxShortName`:889, `Get-DkWindowsAppsRoot`:891, `Get-DkAppxKind`:897, `Get-DkAppxPreserveSet`:904, `Invoke-DkAppxCapture`:925, `Save-DkAppxPayload`:940, `Invoke-DkAppxApply`:985, `Invoke-DkAppxVerify`:1002, `Restore-DkAppxPackage`:1015, `Restore-DkAppxFromStore`:1066, `Test-DkAppxOriginallyPresent`:1076, `Invoke-DkAppxRevert`:1082, `Invoke-DkCapture`:1094, `Test-DkApplied`:1107, `Test-DkOriginal`:1120, `Invoke-DkApply`:1156, `Invoke-DkRevert`:1168, `Test-DkNeedsHive`:1181, `Test-DkDependencies`:1183, `Invoke-DkChangeApplyOne`:1194, `Invoke-DkChangeRevertOne`:1281, `Get-DarkOSCatalog`:1310, `Get-DarkOSManifest`:1317, `Get-DarkOSStatus`:1319, `Invoke-DarkOSChange`:1356, `Add-DkResults`:1406, `Sort-DkByDependency`:1415, `Set-DarkOSProfile`:1433, `Restore-DarkOSProfile`:1464, `Get-DarkOSRemovedApps`:1475, `Restore-DarkOSAppx`:1492, `New-DarkOSSnapshot`:1518, `Get-DarkOSSnapshot`:1536, `Restore-DarkOSSnapshot`:1542, `Get-DarkOSFailures`:1562, `Get-DarkOSRebootPending`:1574, `Export-DarkOSDiagnostics`:1581, `Initialize-DarkOSRecovery`:1616

## `electron/services/darkos/DarkOSRecoveryService.js`

`isValidChangeId`:48, `isValidProfile`:52, `isValidPackageName`:57, `sanitizeLabel`:65, `isValidDiagnosticsDestination`:73, `uniqueIds`:80, `parseCliOutput`:93, `parseProgressLine`:133, `stripLeakedProgress`:146, `clean`:148, `extractChangeResults`:171, `summarizeChangeResults`:187, `psq`:241, `defaultBundledDir`:245, `defaultRunner`:258, `onStdout`:263, `defaultIsElevated`:290, `DarkOSRecoveryService`:301 _class_, `manifestPath`:326, `isDarkOS`:330, `available`:344, `catalogPath`:348, `resolveCli`:352, `info`:372, `_emit`:386, `_enqueue`:395, `buildScript`:402, `run`:420, `onLine`:445, `_runChange`:485, `_read`:502, `getCatalog`:509, `getManifest`:518, `getStatus`:522, `_change`:530, `applyChange`:540, `revertChange`:544, `setProfile`:548, `restoreProfile`:555, `getRemovedApps`:559, `restoreAppx`:563, `listSnapshots`:571, `createSnapshot`:575, `restoreSnapshot`:587, `getFailures`:592, `getRebootPending`:596, `exportDiagnostics`:600

## `electron/services/diskscan/DiskScanService.js`

`defaultExe`:13, `csvCell`:18, `formatSize`:20, `DiskScanService`:27 _class_, `_filter`:38, `drives`:46, `status`:59, `emit`:92, `cancel`:123, `view`:134, `info`:155, `setTag`:160, `_pathOf`:165, `open`:171, `reveal`:178, `trash`:186, `pathOf`:196, `exportTo`:199, `write`:204

## `electron/services/diskscan/ScanModel.js`

`Col`:5 _class_, `push`:7, `ScanModel`:13 _class_, `_growDirs`:28, `grow`:32, `addLine`:37, `fileCount`:58, `index`:61, `known`:67, `_topDown`:81, `dirPath`:89, `filePath`:96, `sizes`:102, `view`:153, `build`:158, `trail`:191, `parse`:197, `info`:205, `setTag`:222, `markRemoved`:229, `eachFile`:238

## `electron/services/diskscan/filter.js`

`classOf`:22, `maskToRegExp`:37, `parseClause`:42, `parseFilter`:85, `matchFile`:100

## `electron/services/dlss5/Dlss5Service.js`

`inspectPeExecutable`:27, `rvaToFileOffset`:61, `computeSha256`:106, `Dlss5Service`:115 _class_, `getHistoryFilePath`:120, `getRecentGames`:129, `saveRecentGame`:141, `getSteamPath`:158, `getLibraryPaths`:195, `getInstalledSteamGames`:214, `detectGpu`:264, `detectGraphicsAPI`:325, `detectAutoRoute`:451, `scanGameDirectory`:511, `findCandidates`:541, `resolveOptiScalerSource`:664, `getBinaryProvenance`:696, `extractArchive`:785, `generateNvngxIni`:862, `getUserDataDir`:1056, `resolveAmdNrSource`:1064, `isPackage`:1068, `_resolveFsr4Rdna2`:1081, `_readManifest`:1090, `applySignatureCheckBypass`:1102, `restoreSignatureCheckBypass`:1127, `insideTarget`:1203, `ensureBackedUp`:1208, `place`:1221, `placeContent`:1234, `placeDir`:1240, `inside`:1437, `registerDlss5IPC`:1518, `serialized`:1523, `onLog`:1557, `onLog`:1570, `onLog`:1600

## `electron/services/downloads/DownloadManager.js`

`sleep`:28, `request`:31, `onAbort`:58, `AbortedError`:65 _class_, `DownloadManager`:69 _class_, `init`:91, `shutdown`:104, `getSettings`:112, `setSettings`:116, `_loadSettings`:141, `_saveSettings`:150, `_loadQueue`:155, `_scheduleSave`:168, `_flushSave`:174, `list`:187, `add`:191, `pause`:228, `resume`:236, `pauseAll`:248, `resumeAll`:249, `cancel`:252, `remove`:264, `clearFinished`:277, `getFilePath`:283, `_afterChange`:289, `_toPublic`:295, `_scheduleEmit`:315, `_sampleSpeeds`:324, `_checkSchedule`:341, `_pump`:365, `_startTask`:374, `_abortTask`:402, `_deletePart`:407, `_unlinkPart`:414, `_pathTaken`:419, `_probe`:425, `_prepareFiles`:446, `_run`:472, `_downloadPiece`:534, `_streamPiece`:555, `_finish`:604, `hashFile`:629

## `electron/services/downloads/downloadUtils.js`

`sanitizeFileName`:7, `parseContentDisposition`:22, `fileNameFromUrl`:33, `validateDownloadUrl`:43, `planPieces`:54, `categoryForFile`:78, `uniquePath`:85, `safeJoin`:94, `Throttle`:103 _class_, `setRate`:109, `parseHHMM`:121, `isInsideWindow`:130, `clampInt`:137

## `electron/services/downloads/registerDownloadsIPC.js`

`registerDownloadsIPC`:8, `broadcast`:19, `handle`:32

## `electron/services/hwsensors/DarkHub.HwSensors.cs`

`HwSensors`:18 _class_, `Esc`:20, `PawnIoInstalled`:32, `Dump`:38, `IsAdmin`:67, `Main`:73

## `electron/services/hwsensors/pawnio.js`

`installPawnIo`:16

## `electron/services/optimizer/AppManagerEngine.js`

`toArray`:66, `AppManagerEngine`:70 _class_, `runPowerShellJson`:81, `runPowerShell`:91, `_startupFolders`:101, `getStartupItems`:112, `_validateStartupPayload`:174, `disableStartupItem`:194, `getServices`:242, `disableService`:251, `findRegisteredProgram`:294, `_validKeyPath`:300, `_uninstallBlock`:306, `uninstallProgram`:319, `_isSafeLeftoverName`:337, `_isSafeInstallLocation`:350, `uninstallProgramWithLeftovers`:360, `foreach`:392, `foreach`:401, `getInstalledPrograms`:425, `listBloatware`:458, `removeSelectedBloatware`:477, `foreach`:497, `foreach`:498, `nameOf`:516, `getRunningProcesses`:528, `setProcessPriority`:567, `getGpuPreferences`:604, `_validateAppExe`:626, `_readGpuValue`:635, `setGpuPreference`:641, `removeGpuPreference`:657, `getGpuInfo`:666, `getHagsStatus`:685, `setHagsStatus`:694, `revertHags`:708

## `electron/services/optimizer/DeepTweaksEngine.js`

`defineTweak`:47, `buildPublicTweaks`:62, `buildInternalGroups`:653, `snapshotNumber`:697, `DeepTweaksEngine`:729 _class_, `_exclusive`:749, `listTweaks`:756, `getRecommendedIds`:763, `getDefinition`:767, `loadUndoStore`:772, `saveUndoStore`:783, `saveExtra`:797, `getExtra`:801, `clearExtra`:804, `readEntries`:811, `runRegistryOps`:836, `exec`:847, `_entriesFor`:885, `_buildSnapshot`:892, `captureSnapshot`:905, `_evalDefStatus`:915, `checkTweaksStatus`:927, `restartExplorer`:955, `runLiveAction`:968, `_applyDefsUnlocked`:988, `_finishRun`:1072, `_summarize`:1083, `_restoreDefsUnlocked`:1135

## `electron/services/optimizer/DefenderControlEngine.js`

`buildImageDefenderRestoreScript`:23, `DefenderControlEngine`:50 _class_, `getStatus`:51, `runNativeDefenderControl`:88, `restoreImageDefender`:149, `openTamperSettings`:171

## `electron/services/optimizer/DnsEngine.js`

`isUsableDnsServer`:34, `buildDnsQuery`:41, `isValidDnsAnswer`:50, `dnsLatencyUdp`:59, `finish`:66, `clampInt`:82, `DnsEngine`:88 _class_, `getPresets`:89, `benchmark`:97, `worker`:105, `_psJson`:124, `getActiveAdapter`:130, `_readServers`:138, `getState`:149, `apply`:162, `undo`:203

## `electron/services/optimizer/ElevationHelper.js`

`waitForElevated`:21, `decodeShellOutput`:37, `ElevationHelper`:49 _class_, `isElevated`:54, `_auditScript`:66, `_privateDir`:71, `runMarked`:82, `runElevatedPowerShell`:91, `readSafe`:143, `runElevatedCmd`:180, `readSafe`:218

## `electron/services/optimizer/MemoryEngine.js`

`summarizeMemoryDelta`:12, `MemoryEngine`:17 _class_, `optimizeRAM`:24, `adjustTimerResolution`:85, `optimizeAudioLatency`:96

## `electron/services/optimizer/NetworkEngine.js`

`buildAdvancedNetworkChanges`:16, `NetworkEngine`:27 _class_, `getActiveAdapterName`:28, `getUpAdapters`:42, `flushDns`:56, `_res`:70, `cleanNetwork`:85, `_eeeReadScript`:99, `advancedNetworkApply`:120, `advancedNetworkRevert`:158, `optimizeGameRoute`:191, `revertGameRoute`:196

## `electron/services/optimizer/OptimizerUtils.js`

`psQuote`:5, `splitRegKey`:17, `isUserHiveKey`:25, `typeToKind`:39, `kindToType`:42, `parseDwordLike`:47, `parseBinaryLike`:55, `canonicalRegValue`:64, `regValueMatches`:86, `sameFamily`:91, `validateChange`:100, `psValueLiteral`:110, `buildRegistryScript`:135, `buildRegistryReadScript`:178, `parseDhResults`:214, `parseRegistryReadOutput`:224, `regEntryId`:253, `snapshotEntryToOps`:261, `fallbackRevertOp`:274, `isRiskyTweak`:284, `pickRecommendedTweaks`:290, `parsePowercfgList`:296, `parseUninstallString`:313, `mergeGpuPreference`:337, `parseGpuPreference`:342, `isCriticalProcessName`:353, `isProtectedService`:365, `isValidServiceName`:368, `isValidIpv4`:372, `formatBytes`:379, `isValidAppxName`:390, `isProtectedAppx`:402, `medianFinite`:408, `isStartupApprovedDisabled`:416, `buildStartupApprovedBytes`:421, `parseDhCommandResults`:434, `buildCommandBlock`:444, `parseDhSnapLines`:453, `bcdValueToArg`:464, `validatePagefileSizes`:472, `isValidFeatureName`:481, `isValidCapabilityName`:486, `isValidExecutionPolicy`:491, `isValidPciInstanceId`:496, `wrapMarkedScript`:505, `DhCheck`:507, `parseMarkedOutput`:517, `startupApprovedTarget`:532, `psPathToRegKey`:557, `bytesToHex`:561, `normalizePriorityName`:567, `isSafeInstallLocationFor`:578, `norm`:580

## `electron/services/optimizer/PowerEngine.js`

`PowerEngine`:13 _class_, `_statePath`:18, `_powercfg`:23, `_fetchPowerPlans`:32, `analyzeHighPerformance`:38, `analyzeBalanced`:43, `_getActiveSchemeGuid`:48, `_ensurePlan`:55, `_rememberPrevious`:68, `_readPrevious`:74, `_result`:82, `_activate`:97, `setHighPerformance`:113, `setUltimate`:120, `setBalanced`:126, `restorePrevious`:131

## `electron/services/optimizer/ServicesEngine.js`

`scArgFromStartMode`:20, `ServicesEngine`:31 _class_, `_getServiceStartMode`:50, `applyServicesTweak`:56, `revertServicesTweak`:114

## `electron/services/optimizer/StorageEngine.js`

`StorageEngine`:6 _class_, `_getStandardizedTempDirs`:11, `add`:13, `_isProtectedPath`:34, `_walk`:58, `_newState`:98, `_scanDir`:102, `_deleteDirContents`:108, `analyzeTempFiles`:114, `cleanTempFiles`:125

## `electron/services/optimizer/SystemEngine.js`

`SystemEngine`:33 _class_, `_runMarked`:35, `createRestorePoint`:45, `cleanRegistryAndTemp`:77, `repairWindows`:126, `activateWindows`:145, `setPerformanceMode`:156, `_lowLevelReadBlock`:162, `_applyLowLevel`:180, `_revertLowLevel`:205, `applyTimerTuning`:246, `revertTimerTuning`:253, `applyHardcoreGamerMode`:261, `revertHardcoreGamerMode`:277, `applyExtremeKernelMod`:294, `revertExtremeKernelMod`:310, `applyExtremeNetworkMod`:327, `readBlock`:329, `revertExtremeNetworkMod`:355, `v`:359, `applyCpuUnpark`:373, `revertCpuUnpark`:410, `_displayPciIds`:430, `_msiKey`:440, `applyMsiMode`:448, `revertMsiMode`:462, `setPagefile`:477, `revertPagefile`:514, `toggleHibernation`:528, `setExecutionPolicy`:542, `toggleFeature`:556, `removeCapabilitiesAndRecall`:583, `restoreCapabilities`:617, `deepCleanOneDrive`:645, `stillInstalled`:654, `deleteRun`:656, `restartExplorer`:682

## `electron/services/optimizer/SystemOptimizerService.js`

`adaptResult`:20, `SystemOptimizerService`:35 _class_, `_tweakOp`:46, `_op`:71, `registerOperations`:82, `registerReverts`:534, `registerProfiles`:559, `_publicOp`:641, `listOperations`:677, `_statusContext`:687, `checkOperationsStatus`:697, `listProfiles`:718, `analyze`:722, `checkIsAdmin`:746, `validateTaskCompatibility`:754, `_runTasksNow`:775

## `electron/services/optimizer/ToolboxEngine.js`

`launch`:9, `done`:12, `ToolboxEngine`:24 _class_, `openAntivirus`:29, `openTaskManager`:38

## `electron/services/optimizer/VisualsEngine.js`

`VisualsEngine`:5 _class_, `disableVisualEffects`:12, `revertVisualEffects`:19

## `electron/services/optimizer/WindowsToolsEngine.js`

`featureById`:46, `summarizeFeatureState`:51, `parseFeatureLines`:60, `featureReadScript`:71, `launch`:82, `finish`:85, `WindowsToolsEngine`:95 _class_, `listFeatures`:101, `setFeature`:108, `openPanel`:147, `run`:154, `resetWindowsUpdate`:161, `repairWinget`:178, `cleanupComponentStore`:194, `removeEdge`:206, `installEdge`:219, `decryptSystemDrive`:229, `autologon`:248

## `electron/vaultCrypto.js`

`toB64`:3, `fromB64`:7, `derivePasswordFromRecoveryWords`:11, `generateRecoveryWords`:21, `buildDefaultWordList`:34, `scryptKey`:143, `aesGcmEncrypt`:164, `aesGcmDecrypt`:172, `buildKdf`:181, `wrapVaultKeyWithPassword`:193, `unwrapVaultKeyWithPassword`:199, `encryptVaultData`:205, `decryptVaultData`:211

## `electron/ytdlp.js`

`platformAssetName`:13, `downloadWithRedirects`:19, `downloadTextWithRedirects`:40, `sha256File`:61, `fetchExpectedChecksum`:73, `ensureYtDlp`:87, `ensureFfmpeg`:127, `cancelActiveYtDlp`:189, `runYtDlp`:205

## `install.ps1`

`Start-DarkHubInstall`:6

## `native_pacer/src/lib.rs`

`CreateWindowExA`:66, `DestroyWindow`:80, `timeBeginPeriod`:85, `timeEndPeriod`:86, `QueryPerformanceCounter`:90, `QueryPerformanceFrequency`:91, `VirtualProtect`:92, `CreateFileMappingW`:93, `OpenFileMappingW`:94, `MapViewOfFile`:95, `CloseHandle`:96, `GetCurrentProcessId`:97, `Sleep`:98, `LoadLibraryA`:99, `GetProcAddress`:100, `CreateThread`:101, `CreateWaitableTimerExW`:102, `SetWaitableTimer`:103, `WaitForSingleObject`:104, `get_qpc_ms`:218, `precision_wait`:228, `hist_recent`:254, `push_sample`:258, `compute_stats`:267, `publish`:317, `is_main_swapchain`:356, `perform_pacing`:407, `hooked_present`:478, `hooked_present1`:488, `map_named`:502, `setup_shared_memory`:519, `patch_slot`:547, `com_release`:560, `install_vtable_hooks`:571, `remove_vtable_hooks`:659, `init_thread`:671, `DllMain`:687, `reset`:729, `stats_come_only_from_real_samples`:735, `low01_unavailable_with_few_samples`:754, `telemetry_layout_matches_reader`:766

## `scripts/dev.mjs`

`argPage`:19, `say`:24, `killTree`:28, `killStaleDev`:37, `esc`:39, `waitForVite`:44, `tryOnce`:47, `prefix`:61, `startElectron`:74, `restartElectron`:91, `shutdown`:119

## `src/App.tsx`

`pageFromHash`:41, `PageLoading`:46 _component_, `App`:61 _component_, `onHash`:72, `report`:78, `onError`:94, `onRejection`:100, `reportRenderError`:115, `renderPage`:130

## `src/components/DetailedHardwareInfo.tsx`

`HardwareInfo`:4 _type_, `gb`:14, `tempEntries`:19, `DetailedHardwareInfo`:33 _component_, `loadStaticInfo`:40, `empty`:123, `MetricGrid`:230 _component_, `Metric`:234 _component_

## `src/components/DevTracePanel.tsx`

`Entry`:7 _type_, `DevTracePanel`:10 _component_, `copy`:43, `summary`:44

## `src/components/EmbeddedSitePage.tsx`

`EmbeddedSitePageProps`:6 _type_, `EmbeddedSitePage`:19 _component_, `onLoad`:29, `onFail`:30, `reload`:46

## `src/components/ErrorBoundary.tsx`

`Props`:4 _type_, `State`:13 _type_, `isChunkLoadError`:20, `ErrorBoundary`:25 _class_, `getDerivedStateFromError`:31, `componentDidCatch`:35, `render`:50

## `src/components/GuardianWidget.tsx`

`GuardianWidget`:5 _component_, `beep`:22, `refresh`:46, `disableOverlay`:91, `fmt`:108

## `src/components/HelpTip.tsx`

`HelpSection`:4 _type_, `HelpTipProps`:9 _type_, `HelpTip`:18 _component_

## `src/components/OptimizationScoreCard.tsx`

`OptimizationScoreCardProps`:4 _type_, `OptimizationScoreCard`:9 _component_

## `src/components/OptimizerProgress.tsx`

`OptimizerProgressProps`:5 _type_, `OptimizerProgress`:11 _component_

## `src/components/SystemInfoCard.tsx`

`SystemInfoCardProps`:5 _type_, `tone`:11, `SystemInfoCard`:13 _component_

## `src/components/UpdaterOverlay.tsx`

`UpdateStage`:7 _type_, `UpdaterOverlay`:9 _component_, `handleEvent`:20, `initUpdater`:65, `handleStartDownload`:93, `handleApplyInstall`:111

## `src/components/darkos/DarkOSConfirmDialog.tsx`

`DarkOSConfirmDialogProps`:5 _type_, `DarkOSConfirmDialog`:19 _component_, `onKey`:35

## `src/components/darkos/DarkOSProgress.tsx`

`DarkOSProgress`:7 _component_

## `src/components/darkos/DarkOSSystemPanel.tsx`

`LiveStats`:8 _type_, `Metric`:11 _component_, `Row`:21 _component_, `fmtUptime`:34, `UpdState`:42 _type_, `DarkOSSystemPanel`:44 _component_, `tick`:56, `start`:71, `stop`:72, `onVis`:73, `reinstallEdge`:94, `updaterCall`:137, `checkUpdates`:147, `downloadUpdate`:148, `installUpdate`:149, `toggleStartup`:162, `applyPower`:187, `gb`:215

## `src/components/icons/IconSheet.tsx`

`IconSheet`:4 _component_

## `src/components/icons/index.tsx`

`IconProps`:9 _type_, `Node`:15 _type_, `cut`:18, `Base`:24 _component_, `icon`:50, `Icon`:51 _component_

## `src/components/library/GameCard.tsx`

`GameCardProps`:6 _type_, `GameCard`:14 _component_, `fetchCover`:33, `formatTime`:52

## `src/components/library/GameDiscoveryModal.tsx`

`DiscoveredGame`:5 _type_, `GameDiscoveryModalProps`:12 _type_, `GameDiscoveryModal`:21 _component_

## `src/components/library/GameEditorModal.tsx`

`GameEditorModalProps`:7 _type_, `GameEditorModal`:16 _component_, `handleTagsChange`:31, `updateOptiscaler`:37, `handleProfileChange`:44, `handleSetDefaultProfile`:53, `addProfile`:60, `removeProfile`:69, `handleSave`:78

## `src/components/library/ProfileEditor.tsx`

`ProfileEditorProps`:5 _type_, `ProfileEditor`:12 _component_, `updateTweaks`:15

## `src/components/library/Sparkline.tsx`

`SparklineProps`:3 _type_, `SparklineBase`:13 _component_

## `src/components/library/types.ts`

`GameProfileTweaks`:1 _type_, `GameProfile`:14 _type_, `OptiScalerConfig`:28 _type_, `Game`:38 _type_, `defaultProfile`:55, `defaultGame`:80

## `src/components/monitor/AdvancedSensorsPanel.tsx`

`Props`:6 _type_, `api`:12, `AdvancedSensorsPanel`:15 _component_, `toggle`:25, `missing`:41

## `src/components/monitor/LhmSensorTree.tsx`

`LhmSensor`:5 _type_, `LhmHardware`:6 _type_, `LhmData`:7 _type_, `kindIcon`:37, `fmt`:39, `LhmSensorTree`:51 _component_, `match`:59

## `src/components/optimizer/WindowsToolsPanel.tsx`

`FeatureState`:5 _type_, `api`:14, `WindowsToolsPanel`:17 _component_, `exec`:36, `toggleFeature`:48, `stateLabel`:54

## `src/components/ui/PageHeader.tsx`

`PageHeader`:5 _component_

## `src/hooks/useDeepHardware.ts`

`DeepCategoryApi`:5 _type_, `getDeepCategoryApi`:7, `useDeepHardware`:13

## `src/hooks/useJunkScanner.ts`

`CachedJunk`:6 _type_, `loadCached`:13, `saveCache`:26, `useJunkScanner`:32, `fetchJunk`:43

## `src/hooks/useOptimizerProgress.ts`

`ProgressEvent`:3 _type_, `UseOptimizerProgressOptions`:17 _type_, `useOptimizerProgress`:21

## `src/hooks/useRecentActivity.ts`

`ActivityType`:3 _type_, `ActivityEntry`:13 _type_, `loadPersisted`:24, `persist`:36, `formatDuration`:42, `makeId`:49, `useRecentActivity`:53

## `src/hooks/useSecurityScore.ts`

`useSecurityScore`:4, `fetchSecurity`:22

## `src/hooks/useSensorHistory.ts`

`useSensorHistory`:7

## `src/hooks/useSystemMetrics.ts`

`useSystemMetrics`:3

## `src/i18n/I18nProvider.tsx`

`I18nContextValue`:4 _type_, `readInitialLang`:15, `I18nProvider`:23 _component_, `useI18n`:102

## `src/i18n/messages.ts`

`SupportedLang`:3 _type_, `LanguageOption`:5 _type_, `getTranslationTemplate`:3386

## `src/layouts/MainLayout.tsx`

`MainLayoutProps`:15 _type_, `NavSection`:21 _type_, `MainLayout`:31 _component_, `handleMenuClick`:125, `handleNavKeyDown`:148, `navButton`:163, `rail`:169

## `src/pages/AdvancedSecurity.tsx`

`SecurityTab`:11 _type_, `AdvancedSecurity`:13 _component_, `loadPhishingStatus`:42, `loadRansomwareStatus`:50, `loadCommunityRulesStats`:58, `handleScan`:66, `handleKill`:81, `handleTogglePhishingShield`:96, `handleScanUrl`:113, `handleScanNetworkConnections`:132, `handleEnableRansomwareArmor`:150, `handleImportCommunityRules`:164, `handleResetCommunityRules`:186, `handleDownloadRulesTemplate`:201, `handleAuditTracking`:228, `handleBlockTracking`:249, `handleUnblockTracking`:263, `loadTrackingDomains`:277, `saveTrackingDomains`:288, `sevText`:323, `verdictText`:324, `skel`:325, `SectionHead`:782 _component_, `StatRow`:792 _component_

## `src/pages/AutoClicker.tsx`

`AutoClicker`:9 _component_, `refresh`:37, `handleStart`:91, `handleStop`:108, `handleSaveHotkey`:122, `registerTestClick`:136, `handleResetTester`:147, `runSelfDiagnostic`:155

## `src/pages/DarkOSCenter.tsx`

`TabId`:17 _type_, `Banner`:19 _type_, `ConfirmState`:21 _type_, `api`:40, `Section`:43 _component_, `Figure`:57 _component_, `Empty`:64 _component_, `DarkOSCenter`:68 _component_, `current`:97, `profileName`:166, `describe`:167, `toggleChange`:169, `toggleGroup`:190, `askProfile`:197, `askRestoreAll`:224, `askRestoreSnapshot`:232, `renderOverview`:319, `renderChanges`:355, `renderProfiles`:437, `renderRecovery`:491, `renderSnapshots`:528, `renderFailures`:572, `renderDiagnostics`:596, `notice`:619

## `src/pages/Dashboard.tsx`

`formatBytes`:16, `timeAgo`:25, `Skel`:45 _component_, `Reading`:50 _component_, `MetricCell`:57 _component_, `DashboardProps`:89 _type_, `Dashboard`:93 _component_, `handleOptimizeRam`:241, `handleCleanJunk`:271, `handleCreateRestorePoint`:299, `handleRepairWindows`:321, `handleResolveSecurity`:341, `handleOpenWindowsSecurity`:352

## `src/pages/Decryption.tsx`

`Mode`:6 _type_, `Decryption`:8 _component_, `handleEncode`:15, `handleDecode`:49, `copyToClipboard`:97, `clearAll`:101, `renderMode`:121

## `src/pages/DevTools.tsx`

`DevTools`:7 _component_, `formatJson`:27, `generateHashes`:38

## `src/pages/DllInjector.tsx`

`DllInjector`:6 _component_, `handleSelectDll`:13, `handleInject`:29

## `src/pages/Dlss5Manager.tsx`

`SteamGame`:34 _type_, `GpuInfo`:42 _type_, `GraphicsApiInfo`:51 _type_, `RouteInfo`:71 _type_, `ScannedGame`:82 _type_, `RecentGame`:100 _type_, `Dlss5Manager`:113 _component_, `refreshSteamGames`:164, `init`:182, `handleProfileChange`:231, `handleScanGame`:243, `handleSelectFolder`:289, `handleSelectExe`:306, `handleDragOver`:324, `handleDragLeave`:330, `handleDrop`:336, `handleOpenFolder`:348, `handleApply`:360, `handleRevert`:411, `toggleRow`:471

## `src/pages/Downloads.tsx`

`formatBytes`:9, `formatEta`:16, `Bytes`:24 _component_, `Downloads`:29 _component_, `onVisible`:71, `flash`:79, `handleAdd`:86, `saveSettings`:116, `chooseDir`:121, `statusBadge`:126

## `src/pages/DriverCenter.tsx`

`CameraState`:8 _type_, `Adapter`:11 _type_, `api`:13, `DriverCenter`:15 _component_, `openOfficial`:68, `field`:101

## `src/pages/FileConverter.tsx`

`ConvertCategory`:19 _type_, `FormatOption`:21 _type_, `FileConverter`:73 _component_, `detectCategory`:86, `getDir`:95, `applyFiles`:100, `handlePickFiles`:117, `handlePickOutputDir`:139, `handleConvert`:148, `removeFile`:213, `clearQueue`:218, `chip`:236

## `src/pages/FramePacer.tsx`

`FramePacerPage`:14 _component_, `handleToggleEngine`:153, `handleUpdateFps`:171, `handleUpdateMode`:178, `handleToggleOverlay`:185, `handleToggleClickThrough`:192

## `src/pages/Home.tsx`

`HomeProps`:9 _type_, `Home`:13 _component_, `fetchInfo`:28, `handleLaunchPGE`:70, `read`:93, `gb`:99

## `src/pages/ImageTextExtractor.tsx`

`ImageTextExtractor`:6 _component_, `handlePaste`:21, `handleSelectImage`:49, `handleFileInputChange`:71, `handleDragOver`:87, `handleDragLeave`:92, `handleDrop`:96, `triggerOcr`:113, `handleCopyText`:138, `handlePasteFromClipboard`:145, `rerunOcr`:166

## `src/pages/Juuzou.tsx`

`Juuzou`:5 _component_

## `src/pages/Library.tsx`

`Library`:11 _component_, `refresh`:33, `discoverGames`:63, `importDiscovered`:82, `startEdit`:107, `saveEditing`:118, `removeGame`:142, `launch`:157, `pickExeForEditor`:194, `pickWorkingDirForEditor`:208

## `src/pages/LuluFlix.tsx`

`LuluFlix`:5 _component_

## `src/pages/MetaDataEditor.tsx`

`MetaDataEditor`:6 _component_, `handleSelectFile`:19, `handleRemoveMetadata`:74, `handleUpdateMetadata`:98

## `src/pages/NetworkTools.tsx`

`NetworkTools`:6 _component_, `runPing`:29, `runPortScan`:50, `runSpeedTest`:68, `runDiag`:107

## `src/pages/OptiScalerManager.tsx`

`OptiScalerConfig`:31 _type_, `GameItem`:43 _type_, `Choice`:57 _type_, `dirnameFromPath`:114, `basename`:118, `OptiScalerManagerProps`:122 _type_, `OptiScalerManager`:126 _component_, `refreshLibraryAndSteam`:177, `makePayload`:260, `runAnalyzeForGame`:296, `handleSelectExe`:343, `handleRemoveManualGame`:386, `handleCreateManualBackup`:400, `handleDeleteBackup`:418, `handleApply`:435, `handleRestore`:467

## `src/pages/Optimizer.tsx`

`OptimizerTab`:12 _type_, `LogLevel`:13 _type_, `LogLine`:14 _type_, `RiskLevel`:15 _type_, `ConfirmRequest`:16 _type_, `RunResult`:17 _type_, `TweakItem`:20 _type_, `api`:37, `fmt`:40, `fmtBytes`:43, `tabBtn`:62, `segBtn`:68, `SkeletonRows`:76 _component_, `StatusPill`:91 _component_, `HeroButton`:99 _component_, `HagsButtons`:116 _component_, `Optimizer`:140 _component_, `addLog`:222, `askConfirm`:229, `answerConfirm`:235, `loadInitialData`:255, `refreshStatus`:291, `runOps`:362, `runOne`:376, `withBusy`:383, `reportResult`:400, `flash`:407, `handleOptimizeRAM`:412, `handleCleanTempFiles`:420, `handleFlushDNS`:428, `handleSetPowerPlan`:436, `handleOptimizeAudioLatency`:444, `handleCreateRestorePoint`:451, `handleApplyAdvancedNetwork`:463, `handleRevertAdvancedNetwork`:478, `loadPrograms`:487, `handleUninstallProgram`:501, `needsConfirm`:606, `riskBadge`:608, `confirmItems`:614, `applyItems`:630, `revertItems`:645, `afterChange`:660, `handleApplyItem`:664, `handleRevertItem`:676, `handleRunBatch`:685, `handleApplyProfile`:721, `handleSafeOptimization`:743, `handleRevertAll`:766, `handleRestoreStreamingDefaults`:819, `loadHagsStatus`:832, `handleToggleHags`:848, `handleRevertHags`:856, `loadGpuData`:864, `handleBrowseGpuApp`:877, `handleSetGpuPreference`:888, `handleRemoveGpuPreference`:898, `loadProcesses`:905, `handleSetProcessPriority`:919, `loadBloatware`:944, `handleRemoveBloatware`:958, `loadStartupItems`:983, `handleToggleStartupItem`:997, `loadDefenderStatus`:1006, `handleApplyDefender`:1018, `handleRestoreImageDefender`:1038, `handleOpenTamper`:1054, `refreshDnsState`:1065, `handleRunDnsBenchmark`:1073, `isTrustedDns`:1095, `handleApplyDns`:1097, `handleUndoDns`:1117, `profileRisk`:1153, `sectionHead`:1163, `searchField`:1173, `emptyRow`:1186

## `src/pages/PasswordManager.tsx`

`VaultEntry`:7 _type_, `calculatePasswordStrength`:16, `copySecretWithAutoClear`:37, `generateStrongPassword`:48, `getRandomChar`:57, `PasswordManager`:107 _component_, `refreshStatus`:144, `refreshEntries`:154, `handleInit`:186, `handleUnlock`:219, `handleUnlockWithRecovery`:239, `handleLock`:259, `handleAdd`:276, `handleRemove`:299, `toggleReveal`:321, `handleCopyPassword`:345, `handleExport`:359, `handleImport`:376, `StrengthMeter`:840 _component_

## `src/pages/PowerShellTools.tsx`

`PolicyResult`:10 _type_, `ScriptItem`:11 _type_, `RunResult`:12 _type_, `api`:14, `PowerShellTools`:24 _component_, `runScript`:76, `openElevated`:92, `sigLabel`:110, `policyNote`:111, `skeletonRows`:135

## `src/pages/Settings.tsx`

`SettingsPage`:9 _component_, `saveTelemetry`:74, `saveLiveServices`:92, `saveWindowBehavior`:111, `saveStartupBehavior`:132, `Status`:418 _type_, `StatusLine`:420 _component_, `SettingsGroup`:430 _component_, `SettingRow`:442 _component_, `ResourceUsageSection`:464 _component_, `UpdateManagerSection`:517 _component_, `loadStatus`:527, `handleCheck`:558

## `src/pages/SetupHub.tsx`

`SetupHub`:232 _component_, `toggleApp`:252, `toggleCategory`:258, `applyPreset`:268, `handleInstallApps`:331, `detectHardware`:360, `toggleOpen`:466, `joinParts`:719, `HardwareCard`:721 _component_, `getGpuDriverLinks`:762, `getCpuChipsetLinks`:780, `getMoboDriverLinks`:793

## `src/pages/SpaceSniffer/TreemapCanvas.tsx`

`INK`:6 _component_, `fill`:17, `fitText`:25, `Props`:33 _type_, `TreemapCanvas`:45 _component_, `pick`:151

## `src/pages/SpaceSniffer/index.tsx`

`api`:12, `fmtDate`:17, `fmtInt`:18, `fmtTime`:19, `DiskMap`:22 _component_, `start`:91, `pickFolder`:98, `act`:118, `setTag`:128, `trash`:135, `onKey`:144

## `src/pages/SpaceSniffer/treemap.ts`

`Cell`:4 _type_, `squarify`:16, `layoutTree`:47, `visit`:49, `hitTest`:66, `formatBytes`:74

## `src/pages/SystemMonitor.tsx`

`formatBytes`:18, `PropertyRow`:27 _component_, `Skel`:38 _component_, `toneFor`:43, `loadBar`:52, `SectionBlock`:100 _component_, `TabType`:112 _type_, `toFixedSafe`:114, `formatSource`:119, `isVirtualNet`:133, `SystemMonitor`:139 _component_, `fetchUsage`:202, `handleBenchmark`:232, `generateReport`:253, `handleTabRefresh`:269, `renderTabs`:276, `renderTabLoadingState`:345, `renderTabErrorState`:361, `renderContent`:375, `norm`:559, `getTempStyle`:617

## `src/pages/TextEditor.tsx`

`TextEditor`:7 _component_, `handleOpen`:13, `handleSave`:37, `handleNew`:64

## `src/pages/TextSummarizer.tsx`

`splitSentences`:67, `tokenize`:74, `summarize`:83, `TextSummarizer`:109 _component_, `handleOpen`:119, `handleSummarize`:145

## `src/pages/UltraLowLatency.tsx`

`LatencyPayload`:8 _type_, `Skel`:15 _component_, `Check`:19 _component_, `UltraLowLatency`:31 _component_, `markDirty`:84, `enableStable`:89, `toggleStable`:115, `refresh`:120, `pickExe`:156, `persistConfig`:169, `save`:193, `enable`:208, `disable`:228, `boostNow`:243, `buildAcceleratorFromEvent`:259, `setMode`:302, `num`:309, `pct`:310, `dirtyThen`:319

## `src/pages/YoutubeDownloader.tsx`

`DownloadPreset`:23 _type_, `DownloadProgressState`:35 _type_, `YoutubeDownloader`:45 _component_, `handlePickCookies`:84, `handleClearCookies`:101, `handleChangeBrowserCookies`:110, `handleChangeClient`:116, `handleChangeSleep`:122, `handleSearch`:128, `handleCancelDownload`:154, `handleDownload`:166, `formatDuration`:227, `segBtn`:251

## `src/types/darkos.ts`

`DarkOSProfileId`:4 _type_, `DarkOSCatalogEntry`:6 _type_, `DarkOSManifestChange`:20 _type_, `DarkOSManifest`:26 _type_, `DarkOSSnapshot`:35 _type_, `DarkOSChangeResult`:37 _type_, `DarkOSChangeResponse`:47 _type_, `DarkOSReadResponse`:61 _type_, `DarkOSInfo`:63 _type_, `DarkOSRunEvent`:76 _type_, `DarkOSAPI`:86 _type_

## `src/utils/darkosData.ts`

`DarkOSRow`:15 _type_, `mergeChanges`:26, `countStatuses`:60, `isOn`:66, `profileDiff`:69, `RemovedApp`:81 _type_, `normalizeRemovedApps`:83, `DarkOSFailure`:95 _type_, `normalizeFailures`:97, `normalizeReboot`:106, `normalizeSnapshots`:113

## `src/utils/visibleInterval.ts`

`visibleInterval`:8, `run`:12, `onVisible`:26

## `tests/darkosService.test.ts`

`fakeFs`:13, `out`:22, `makeService`:26, `make`:358

## `tests/diskMap.test.ts`

`file`:15, `ok`:18, `build`:61

## `tests/dlss5Lifecycle.test.ts`

`setup`:8

## `tests/downloads.test.ts`

`sha`:13, `at`:43, `startServer`:72, `tick`:91, `newManager`:107, `waitFor`:116

## `tests/hwSensors.test.ts`

`sample`:8

## `tests/noProhibitedSteamTools.test.ts`

`read`:10

## `tests/optimizerAudit.test.ts`

`task`:278, `mk`:296

## `tests/optiscaler.test.ts`

`isRdna2`:27, `mockGetLibraryStore`:48

## `tests/powershellTools.test.ts`

`make`:37

## `tests/templateBackslash.test.ts`

`lostEscapes`:10, `visit`:13, `walk`:32

## `vite.config.js`

`transformIndexHtml`:12
