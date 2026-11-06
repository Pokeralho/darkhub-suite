<!-- GERADO por electron_feature_map.py em 2026-11-05T23:53:44. NAO edite a mao: rode `npm run map`. -->

# Indice de simbolos (arquivo -> funcoes com linha)

Busque aqui com Ctrl+F / grep pelo nome da funcao.

## `browser-extension/background.js`

`getLocal`:30, `setLocal`:35, `sessionGet`:39, `sessionSet`:44, `sessionRemove`:49, `getSettings`:54, `disconnect`:61, `onPortMessage`:76, `connect`:104, `send`:133, `authenticate`:152, `request`:161, `browserName`:169, `startPairing`:177, `onPairResult`:190, `isWebUrl`:204, `queryLogins`:208, `fetchCredentials`:213, `badge`:217, `offerSave`:224, `getPendingSave`:241, `clearPendingSave`:252, `popupState`:260, `popupFill`:284, `popupSave`:298, `fromPopup`:308, `handleMessage`:313

## `browser-extension/content.js`

`visible`:13, `passwordFields`:21, `usernameFor`:26, `loginFieldsFrom`:39, `setValue`:53, `fillCredentials`:61, `tr`:78, `ensureUi`:84, `hideUi`:122, `positionUi`:128, `menuHead`:140, `menuMessage`:148, `onIconClick`:168, `reportSubmit`:238

## `browser-extension/popup.js`

`t`:75, `el`:81, `send`:92, `state`:96, `render`:100, `refresh`:105, `startPolling`:192, `stopPolling`:195

## `electron/assets/region/region.js`

`report`:12, `cancel`:13, `draw`:18, `drawLoupe`:38

## `electron/configManager.js`

`mergeDefaultConfig`:12, `shouldMigrateVerifyUrl`:34, `loadConfig`:46, `saveConfig`:65, `getDefaultConfig`:71

## `electron/devBootstrap.js`

`preview`:25, `emit`:38

## `electron/devSelfTest.js`

`short`:19, `withTimeout`:25, `sleep`:26, `mainWindow`:28, `run`:40, `call`:73, `callLong`:138

## `electron/devSelfTestMutate.js`

`sleep`:5, `runMutations`:7, `rec`:9, `step`:11, `okOf`:17, `ps`:99, `ps`:117, `installed`:118, `pickOne`:134, `st`:150

## `electron/devSelfTestMutate2.js`

`sleep`:8, `reg`:9, `runMutations2`:11, `find`:16, `state`:98

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

`isPawnIoInstalled`:17, `forgetPawnIoCheck`:29, `HwSensorsDaemon`:36 _class_, `enabled`:53, `enabled`:63, `status`:68, `start`:81, `stop`:118, `restart`:129

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

`SensorBus`:6 _class_, `_wire`:16, `forward`:19, `start`:25, `_applyTempSource`:43, `prewarmAdvanced`:60, `stop`:66, `setAdvanced`:75, `running`:81

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

## `electron/ipc/benchmarkIpc.js`

`registerBenchmarkIPC`:4, `broadcast`:5, `handle`:7

## `electron/ipc/cleanerIpc.js`

`registerCleanerIPC`:5, `handle`:7

## `electron/ipc/codeRunnerIpc.js`

`registerCodeRunnerIPC`:4, `handle`:5

## `electron/ipc/darkosIpc.js`

`registerDarkOSIPC`:8, `pick`:14, `sendTo`:16, `handle`:22, `usbEvent`:80

## `electron/ipc/diskScanIpc.js`

`registerDiskScanIPC`:4, `handle`:6, `winOf`:12

## `electron/ipc/driverIpc.js`

`registerDriverIPC`:9, `handle`:12

## `electron/ipc/gpuBenchIpc.js`

`toJpeg`:5, `registerGpuBenchIPC`:12, `broadcast`:13, `parentOf`:16, `handle`:20, `n`:31

## `electron/ipc/hubIpc.js`

`registerHubIPC`:23, `send`:26, `focus`:27, `approve`:31, `readDev`:53, `writeDev`:54, `loadDevFolder`:55, `watchDev`:62, `addDev`:76, `openLink`:92, `handle`:101, `text`:107, `init`:156

## `electron/ipc/hwSensorsIpc.js`

`bootAdvancedSensors`:14, `registerHwSensorsIPC`:33, `handle`:38, `elevated`:44

## `electron/ipc/kakuganIpc.js`

`makeTokenStore`:15, `can`:17, `registerKakuganIPC`:37, `readState`:41, `save`:49, `settings`:50, `poll`:53, `resume`:74, `handle`:92, `withQr`:98, `str`:99

## `electron/ipc/maintenanceIpc.js`

`registerMaintenanceIPC`:5, `broadcast`:6, `notify`:7, `handle`:32

## `electron/ipc/metadataIpc.js`

`registerMetadataIPC`:9, `getExiftoolPath`:10, `granted`:19, `outputAllowed`:23, `handle`:31

## `electron/ipc/overlayIpc.js`

`registerOverlayIPC`:9, `broadcast`:11, `get`:18, `handle`:23

## `electron/ipc/powershellIpc.js`

`registerPowerShellIPC`:12, `getElectron`:15, `handle`:23, `winOf`:34, `cleanName`:35, `docs`:58

## `electron/ipc/realtimeIpc.js`

`registerRealtimeIPC`:17, `getHashDb`:25, `broadcast`:28, `refreshClam`:47, `apply`:57, `defenderRunning`:81, `handle`:89, `status`:96, `ensureClamAv`:108

## `electron/ipc/recoveryIpc.js`

`registerRecoveryIPC`:5, `handle`:8, `winOf`:14, `sender`:15, `onClose`:41

## `electron/ipc/restoreIpc.js`

`registerRestoreIPC`:4, `handle`:6

## `electron/ipc/saveBackupIpc.js`

`getSaveBackupService`:9, `registerSaveBackupIPC`:12, `broadcast`:13, `getInstalledGames`:16, `handle`:31

## `electron/ipc/shareIpc.js`

`monitorMode`:16, `readJson`:18, `writeJson`:19, `normalizeShareConfig`:23, `registerShareIPC`:53, `broadcast`:66, `notify`:67, `liveHistory`:68, `upload`:70, `publicEntry`:100, `enhance`:105, `enhanceInBackground`:118, `capture`:148, `bindHotkey`:184, `handle`:193, `state`:200

## `electron/ipc/startupIpc.js`

`registerStartupIPC`:4, `handle`:6

## `electron/ipc/upscaleIpc.js`

`registerUpscaleIPC`:8, `send`:15, `serial`:16, `gameDir`:17, `handle`:22

## `electron/ipc/usbIpc.js`

`registerUsbIPC`:4, `handle`:6

## `electron/ipc/vaultBridgeIpc.js`

`fill`:50, `registerVaultBridgeIPC`:54, `S`:58, `broadcastChange`:63, `parentWindow`:69, `ask`:80, `syncServer`:127, `extensionFolder`:154, `status`:163, `safe`:181

## `electron/ipc/winToolsIpc.js`

`registerWinToolsIPC`:6, `handle`:7

## `electron/latencyGuardian.js`

`now`:17, `clampInt`:21, `stablePolicyName`:27, `safeJsonParse`:32, `psSingleQuote`:41, `encodedPowerShellArgs`:45, `isSafePingHost`:49, `registerLatencyGuardian`:53, `broadcastEvent`:66, `loadConfig`:134, `normalizeConfig`:146, `saveConfig`:190, `getProcessSnapshot`:197, `findGameProcess`:208, `setPowerPlanHighPerformance`:224, `restorePowerPlan`:236, `startTimerResolution05ms`:242, `clear`:268, `stopTimerResolution`:276, `setGamePriorityHigh`:287, `setDisableFullscreenOptimizations`:303, `restoreFullscreenOptimizations`:328, `setMouseAccelerationDisabled`:347, `restoreMouseAcceleration`:374, `setGpuHighPerformancePreference`:389, `restoreGpuPreference`:413, `applyDnsCloudflareWithUndo`:432, `restoreDns`:468, `setQosForExe`:488, `removeQosPolicy`:512, `setNagleDisabledOnActiveInterface`:520, `restoreNagle`:567, `optimizeGlobalTcpStack`:583, `restoreGlobalTcpStack`:597, `killBackgroundProcesses`:608, `serializeTransition`:629, `ultraEnable`:635, `ultraDisable`:639, `ultraEnableImpl`:643, `setApplied`:662, `ultraDisableImpl`:806, `unregisterHotkey`:857, `registerHotkey`:863, `updateMetricsFast`:880, `updateGpuUsage`:890, `updatePing`:911, `finish`:933, `smartCleanRam`:946, `loop`:979, `loopTick`:990, `start`:1012, `stop`:1030, `splitArgs`:1190

## `electron/libraryStore.js`

`filePath`:5, `backupFilePath`:9, `tempFilePath`:13, `newId`:17, `newProfileId`:22, `sanitizeProfile`:27, `sanitizeOptiScaler`:58, `sanitizeGame`:76, `tryReadGames`:117, `loadLibrary`:128, `saveLibrary`:145, `serialized`:163, `upsertGame`:169, `upsertGameUnsafe`:173, `upsertGamesBulk`:184, `upsertGamesBulkUnsafe`:188, `sameExe`:191, `removeGame`:204, `removeGameUnsafe`:208, `updateGame`:216

## `electron/main.js`

`getSystemInformation`:130, `get`:136, `getSharp`:145, `getOcrWorker`:154, `getExiftool`:174, `getFfmpegPath`:182, `getLibraryStore`:214, `safeRegister`:221, `getYtDlpTools`:260, `isDev`:265, `normalizeAccessPath`:289, `isPathInside`:299, `grantFilePath`:305, `grantDirectoryPath`:310, `hasFileAccessGrant`:315, `assertOutputDirGranted`:327, `assertFileAccessGranted`:333, `assertFileAccessGrantedMany`:342, `psSingleQuote`:348, `loadRuntimeConfig`:352, `isAllowedExternalProtocol`:362, `getAllowedExternalUrl`:366, `openAllowedExternalUrlDetached`:376, `isEmbeddedExternalProtocol`:387, `handleEmbeddedExternalNavigation`:391, `isTrustedAppNavigation`:403, `getAppIconPath`:413, `showMainWindow`:428, `ensureTray`:441, `hideWindowToBackground`:468, `estimateDirectoryBytes`:473, `computeJunkEstimate`:517, `work`:531, `createMainWindow`:598, `kickWindowsPaint`:663, `showWhenReady`:735, `eventSender`:820, `measureLatency`:847, `getActiveAdapterName`:877, `getMainCpuLoad`:1113, `broadcastLibraryEvent`:1257, `scoreExecutable`:1333, `key`:1338, `scanDirectoryForBestExe`:1359, `walk`:1362, `findPgeBat`:1503, `launchPgeBat`:1523, `isStartupTaskEnabled`:1599, `setStartupTask`:1609, `refreshLiveCounts`:1720, `sendEvent`:1976, `findLibreOfficeSoffice`:2208, `toXml`:2300, `buildArgs`:2393, `vaultFilePath`:2667, `setVaultAutoLockMinutes`:2675, `clearVaultAutoLock`:2682, `scheduleVaultAutoLock`:2689, `touchVault`:2698, `vaultFileExists`:2702, `readVaultFile`:2711, `writeVaultFile`:2716, `lockVault`:2724, `ensureUnlocked`:2731, `loadVaultUsingWrapper`:2736, `persistVaultData`:2757, `getSecurityScoreV2`:3129, `add`:3134, `isValidHostname`:3311, `getClickEnginePath`:3445, `autoClickerCall`:3471, `isValidWingetId`:3551, `installGithubReleaseMsi`:3563, `installFromOfficialUrl`:3591, `progress`:3627, `runWinget`:3652, `runDeferredStartup`:3734

## `electron/networkIPC.js`

`assertSafeHost`:9, `runCmd`:17, `registerNetworkIPC`:30, `checkPort`:74, `safe`:119

## `electron/optiscalerManager.js`

`nowStamp`:36, `pad`:38, `getSourceVersion`:42, `resolveReleaseDir`:54, `hasDll`:55, `findReleaseRoot`:64, `installOfficialRelease`:77, `normalizeWinPath`:104, `exists`:108, `readJsonIfExists`:117, `runPowerShellJson`:125, `classifyAmdArchitecture`:143, `getGpuInfo`:162, `getWindowsBuild`:190, `isWindows11OrNewer`:195, `walkFiles`:199, `walk`:204, `findUnrealExecutableCandidates`:227, `detectUpscaleFiles`:235, `add`:237, `fileContainsOptiScalerSignature`:270, `isOptiScalerLoader`:295, `detectInstalledLoaders`:312, `chooseLoader`:335, `chooseInputApi`:352, `normalizeChoice`:359, `buildIniPatch`:364, `setIniValue`:413, `applyIniPatch`:451, `getExePayload`:455, `buildAnalysis`:465, `backupPathIfExists`:610, `copySourceRootFiles`:626, `copySourceDirectory`:645, `makeUniqueBackupDir`:656, `rollbackApply`:666, `withMutationLock`:690, `isSameInstall`:696, `resolveFsr4Rdna2Path`:713, `applyOptiScaler`:758, `listBackups`:918, `isInsideDir`:954, `resolveBackupDir`:959, `restoreBackup`:970, `deleteBackup`:1170, `createManualBackup`:1189, `registerOptiScalerIPC`:1225

## `electron/preload.js`

`pathsOf`:5, `handler`:10, `handler`:56, `listener`:90, `listener`:159, `listener`:164, `listener`:188, `handler`:227, `handler`:286, `handler`:305, `handler`:315, `handler`:333, `handler`:345, `listener`:388, `handler`:440, `handler`:466, `handler`:472, `handler`:478, `handler`:484, `listener`:493, `listener`:504, `handler`:529, `listener`:542, `listener`:559, `handler`:597, `handler`:612, `listener`:635, `listener`:664, `listener`:699, `listener`:726, `handler`:767

## `electron/services/CodeRunner.js`

`which`:26, `detectRuntimes`:36, `killTree`:48, `cancelRun`:54, `exec`:56, `take`:65, `done`:71, `runCode`:91

## `electron/services/CoverProviderService.js`

`httpsGet`:15, `CoverProviderService`:40 _class_, `init`:50, `steamProvider`:56, `downloadImage`:103, `fail`:116, `fetchCover`:142

## `electron/services/CpuLoadTracker.js`

`CpuLoadTracker`:5 _class_, `sample`:10

## `electron/services/DarkHub.ClickEngine.cs`

`ClickEngine`:8 _class_, `INPUT`:11 _class_, `MOUSEINPUT`:18 _class_, `SendInput`:29, `mouse_event`:32, `OpenInputDesktop`:35, `SetThreadDesktop`:38, `CloseDesktop`:41, `GetAsyncKeyState`:44, `timeBeginPeriod`:47, `timeEndPeriod`:50, `CreateWaitableTimerExW`:53, `SetWaitableTimer`:56, `WaitForSingleObject`:59, `CloseHandle`:62, `SendMouseButtonDown`:88, `SendMouseButtonUp`:110, `ReleaseAllButtons`:132, `PerformClick`:143, `WorkerLoop`:176, `RunClickLoop`:208, `ParseVkKey`:267, `ParseHotkey`:321, `Down`:340, `ModsDown`:342, `HotkeyListenerLoop`:352, `StartClicking`:389, `StopClicking`:417, `Cleanup`:431, `SetHotkey`:442, `Arm`:452, `Main`:464

## `electron/services/DarkHub.DiskScan.cs`

`DiskScan`:21 _class_, `WIN32_FIND_DATA`:24 _class_, `FindFirstFileExW`:39, `FindNextFileW`:42, `FindClose`:45, `Job`:54 _class_, `ToMs`:63, `Clean`:65, `Flush`:67, `LongPath`:75, `ScanDir`:82, `Worker`:125, `Main`:147

## `electron/services/DarkHub.FrameLimiter.cs`

`PacerConfig`:14 _class_, `TelemetrySnapshot`:23 _class_, `DarkHubFrameLimiter`:41 _class_, `OpenProcess`:46, `VirtualAllocEx`:48, `WriteProcessMemory`:50, `CreateRemoteThread`:52, `GetModuleHandle`:54, `GetProcAddress`:56, `CloseHandle`:58, `QueryFullProcessImageName`:60, `GetForegroundWindow`:62, `GetWindowThreadProcessId`:64, `IsWindowVisible`:66, `VirtualFreeEx`:69, `WaitForSingleObject`:71, `GetProcessPath`:108, `DetectActiveGame`:119, `InjectHookDll`:220, `ResetCap`:271, `ClampFps`:277, `UpdateSharedConfig`:284, `UpdateSharedConfig`:289, `OpenTelemetry`:327, `CloseTelemetry`:344, `ReadSharedTelemetry`:356, `Fd`:409, `EscJ`:414, `EmitTelemetry`:416, `ReadStdin`:453, `Main`:508

## `electron/services/DarkHub.FramePacer.ps1`

`ApplyDriverLimit`:99

## `electron/services/DarkHub.HotkeyWatch.cs`

`HotkeyWatch`:13 _class_, `GetAsyncKeyState`:16, `Hotkey`:18 _class_, `ParseVkKey`:24, `ParseHotkey`:78, `Down`:97, `ModsDown`:99, `Emit`:109, `Watch`:111, `Main`:131

## `electron/services/DarkHub.LatencyEngine.cs`

`PROCESS_POWER_THROTTLING_STATE`:17 _class_, `DarkHubLatencyEngine`:24 _class_, `NtSetTimerResolution`:29, `NtQueryTimerResolution`:32, `TimeBeginPeriod`:35, `TimeEndPeriod`:38, `AvSetMmThreadCharacteristicsW`:41, `AvRevertMmThreadCharacteristics`:44, `OpenProcess`:47, `SetPriorityClass`:50, `SetProcessPriorityBoost`:53, `SetProcessAffinityMask`:56, `GetProcessAffinityMask`:59, `CloseHandle`:62, `GetCurrentProcess`:65, `GetCurrentThread`:68, `SetThreadPriority`:71, `SetProcessInformation`:74, `IcmpCreateFile`:77, `IcmpCloseHandle`:80, `IcmpSendEcho`:83, `EmptyWorkingSet`:95, `GetForegroundWindow`:98, `GetWindowThreadProcessId`:101, `ForegroundPid`:104, `RECT`:114 _class_, `MONITORINFO`:117 _class_, `MonitorFromWindow`:120, `GetMonitorInfo`:123, `SetThreadDpiAwarenessContext`:126, `ForegroundMonitor`:129, `Main`:181, `NamedPipeServerWorker`:237, `HandleCommand`:267, `LockTimerResolution`:366, `UnlockTimerResolution`:390, `TimerWorkerLoop`:404, `QueryTimerResolutionInternal`:463, `HandleBoostProcess`:489, `HandleSetAffinity`:541, `HandleListProcesses`:573, `HandleCleanRam`:591, `GetCpuTopologyInternal`:630, `HandlePingNative`:655, `IP_OPTION_INFORMATION`:742 _class_, `ICMP_ECHO_REPLY`:752 _class_, `SendJson`:763, `FormatResponse`:768, `DictionaryToJson`:779, `ObjectToJson`:795, `GetJsonStringValue`:820, `GetJsonIntValue`:832, `GetJsonBoolValue`:846

## `electron/services/DarkHub.Mcp.cs`

`DarkHubMcp`:18 _class_, `Main`:23, `Relay`:42, `ReadConfig`:88, `IdOf`:120, `HasId`:131, `ErrorFor`:134, `WithId`:145

## `electron/services/DarkHub.SensorDaemon.cs`

`DarkHubSensorDaemon`:9 _class_, `PdhOpenQueryW`:11, `PdhAddEnglishCounterW`:14, `PdhCollectQueryData`:17, `PdhGetFormattedCounterValue`:20, `PdhGetFormattedCounterArrayW`:23, `PdhCloseQuery`:26, `PDH_FMT_COUNTERVALUE`:29 _class_, `CoreTempData`:35 _class_, `ItemValid`:62, `ReadCoreTemp`:67, `Main`:100, `ReadSingle`:291, `ReadMultiFiltered`:301, `ReadByLuid`:347, `GpuAdapter`:377 _class_, `DXGI_ADAPTER_DESC1`:380 _class_, `CreateDXGIFactory1`:404, `EnumerateAdapters`:407, `Num`:428, `EscapeJson`:432

## `electron/services/DarkHub.VaultBridgeHost.cs`

`VaultBridgeHost`:21 _class_, `Main`:27, `ReadConfig`:92, `Pump`:114, `ReadFrame`:137, `ReadExact`:148, `WriteFrame`:160, `WriteJson`:168, `RandomHex`:179, `HmacHex`:186, `ToHex`:192, `FixedTimeEquals`:199

## `electron/services/DeepHardwareService.js`

`DeepHardwareService`:6 _class_, `runPowerShell`:13, `wrapStatus`:23, `fetchCpu`:29, `fetchMainboard`:58, `fetchMemory`:82, `fetchGpu`:104, `fetchStorage`:184, `fetchNetwork`:241, `fetchMonitors`:261, `fetchOS`:287, `getDeepInfo`:325, `_scanAll`:337, `getCategory`:367

## `electron/services/DriverCenterService.js`

`classifyVendor`:35, `vendorFromPnpId`:48, `boardPartnerFromPnpId`:69, `isGenericDisplayDriver`:75, `officialSourcesFor`:83, `isOfficialDriverUrl`:88, `normalizeAdapter`:102, `Step`:192, `cameraIssues`:240, `DriverCenterService`:258 _class_, `cameraStatus`:266, `repairCamera`:284, `detectAdapters`:301, `resolveOfficialUrl`:325

## `electron/services/FramePacerEngine.js`

`FramePacerEngine`:13 _class_, `start`:40, `stop`:64, `updateConfig`:76, `getMetrics`:101, `_getExePath`:110, `_spawnNativeProcess`:134, `_killNativeProcess`:207, `_killSync`:224, `registerExitKill`:236

## `electron/services/FramePacerOverlay.js`

`createFramePacerOverlay`:17, `drawGraph`:260, `metricsHandler`:326, `closeFramePacerOverlay`:350, `toggleFramePacerOverlay`:357, `setOverlayClickThrough`:371, `setOverlayConfig`:379, `getOverlayStatus`:384

## `electron/services/HardwareService.js`

`HardwareService`:8 _class_, `init`:23, `recompute`:38, `dropSender`:46, `_bindWindowVisibility`:79, `pause`:88, `resume`:89, `_setPaused`:102, `_clearIdleTimer`:125, `emitSnapshot`:132, `_setup`:152, `_stopTimer`:163, `_stopDaemons`:170, `start`:176, `stop`:185, `holdSensors`:200, `releaseSensors`:209, `snapshot`:215, `teardown`:219

## `electron/services/LoggerService.js`

`redactSecrets`:21, `LoggerService`:27 _class_, `init`:33, `_rotateLogIfNeeded`:41, `_truncate`:51, `auditOptimizer`:58, `getOptimizerAuditLog`:87, `_format`:103, `_write`:109, `info`:124, `warn`:128, `error`:132, `track`:137

## `electron/services/ManagedProcessRegistry.js`

`ManagedProcessRegistry`:3 _class_, `claim`:8, `release`:14, `releaseAllBy`:20, `isManaged`:26

## `electron/services/NativeLatencyClient.js`

`NativeLatencyClient`:11 _class_, `getExecutablePath`:20, `ensureRunning`:35, `_rejectAllPending`:104, `sendCommand`:112, `lockTimer`:144, `unlockTimer`:149, `queryTimer`:154, `boostProcess`:159, `setAffinity`:169, `getCpuTopology`:178, `pingNative`:188, `cleanRam`:201, `listProcesses`:212, `dispose`:225, `killSync`:247, `registerExitKill`:262

## `electron/services/NetLatencyService.js`

`assertSafeHost`:14, `parsePingTime`:43, `parsePingOutput`:51, `round1`:61, `percentile`:63, `computeLatencyStats`:73, `parseTracertOutput`:95, `gradeBufferbloat`:115, `findMaxPayload`:126, `p`:128, `qosPolicyName`:150, `planAdapterTweak`:158, `mergeSnapshot`:173, `buildAdvancedPropertySetScript`:181, `buildQosApplyScript`:191, `isEcnValue`:203, `EXTRA`:209, `runPing`:212, `tcpConnectMs`:218, `finish`:223, `foreach`:237, `asArray`:260, `normalizeState`:263, `NetLatencyService`:291 _class_, `_runMarked`:292, `getPresets`:296, `probe`:301, `traceroute`:312, `bufferbloat`:321, `startDownload`:333, `mtu`:360, `probe`:364, `getState`:370, `applyTweak`:384, `restoreTweak`:447, `resetStack`:480

## `electron/services/PowerShellRunner.js`

`runCommand`:13, `finish`:31, `appendChunk`:38, `stripBom`:93, `encodePowerShellScript`:98, `powerShellArgsForEncodedScript`:105, `parseJsonOutput`:116, `psSingleQuote`:141, `runPowerShell`:145, `runPowerShellJson`:226

## `electron/services/PowerShellToolsService.js`

`isPs1`:20, `isUnderDarkOS`:29, `isStartFolder`:48, `normalizeScopes`:55, `effectivePolicy`:63, `normalizeSignature`:73, `psQuote`:79, `safeJson`:84, `PowerShellToolsService`:92 _class_, `_isTrustedPath`:104, `_isDirectory`:114, `getPolicies`:123, `listScripts`:133, `getSignature`:171, `runScript`:188, `openElevatedTerminal`:223

## `electron/services/SecureDownload.js`

`assertAllowedUrl`:16, `downloadToFile`:36, `cleanupAndReject`:49, `unlink`:53, `attempt`:62, `fetchJson`:135, `assetSha256`:166

## `electron/services/SecurityService.js`

`SecurityService`:12 _class_, `customFileHashes`:47, `customFileHashes`:52, `_getFeedHashesPath`:57, `setFeedFileHashes`:62, `_registerAdvancedIpc`:75, `safe`:77, `init`:94, `_getShieldPrefPath`:150, `_readShieldPref`:154, `_writeShieldPref`:162, `autoShieldBoot`:170, `runPowerShell`:185, `calculateEntropy`:199, `scanRunningProcesses`:246, `scanUrl`:344, `enablePhishingShield`:460, `disablePhishingShield`:503, `getPhishingShieldStatus`:531, `getLiveNetworkConnections`:548, `checkRansomwareArmor`:593, `enableRansomwareArmor`:615, `_getRulesFilePath`:636, `loadCommunityRules`:643, `getCommunityRules`:669, `getAllPhishingDomains`:682, `importCommunityRules`:686, `resetCommunityRules`:728, `normalizeFileHashes`:745

## `electron/services/UpdateService.js`

`UpdateService`:12 _class_, `init`:26, `_setupUpdater`:47, `_scheduleAutoCheck`:129, `_setState`:136, `checkForUpdates`:140, `downloadUpdate`:201, `fail`:231, `installUpdate`:285, `_fetchLatestGitHubRelease`:318, `_isNewerVersion`:352, `_registerIPC`:364, `_emit`:376, `destroy`:382

## `electron/services/autoclicker/AutoClickerService.js`

`clampSettings`:12, `AutoClickerService`:20 _class_, `load`:31, `save`:40, `state`:47, `_emit`:51, `_send`:53, `_setRunning`:55, `_ensureEngine`:62, `arm`:91, `start`:95, `stop`:105, `toggle`:113, `setHotkey`:116, `dispose`:128

## `electron/services/benchmark/BenchmarkService.js`

`exec`:15, `backgroundCpu`:20, `snap`:21, `context`:28, `ps`:30, `BenchmarkService`:45 _class_, `history`:52, `_save`:53, `run`:55, `cancel`:93, `compare`:98, `remove`:106

## `electron/services/benchmark/benchStats.js`

`median`:15, `noise`:23, `summarize`:30, `compare`:43, `contextWarnings`:63, `percentile`:71

## `electron/services/benchmark/benchWorker.js`

`emit`:12, `now`:13, `kernel`:17, `work`:28, `cpuSingle`:37, `cpuMulti`:44, `memBandwidth`:78, `memLatency`:89, `timerJitter`:107, `tick`:111, `diskSeqWrite`:127, `disk4kSyncWrite`:139

## `electron/services/cleaner/CleanerService.js`

`defaultExe`:16, `sanitizeIds`:22, `validateWinapp2`:31, `CleanerService`:44 _class_, `available`:55, `winapp2Path`:57, `metaPath`:58, `backupDir`:61, `run`:73, `_withIds`:84, `_exclusive`:91, `_winapp2Args`:98, `definitions`:100, `status`:109, `updateDefinitions`:116, `removeDefinitions`:141, `listTargets`:146, `scan`:148, `clean`:153, `browsers`:163, `regScan`:172, `regClean`:175, `listBackups`:185, `restoreBackup`:196

## `electron/services/darkos/DarkOS.Cli.ps1`

`Write-DhLine`:22, `Write-DhFail`:23, `ConvertTo-CliJson`:26

## `electron/services/darkos/DarkOS.Recovery.psm1`

`Get-DkPath`:38, `Set-DarkOSEnvironment`:56, `Get-DkBackend`:78, `Invoke-Dk`:83, `Write-DkProgress`:114, `Get-DkTimestamp`:119, `ConvertTo-DkSignedDword`:122, `ConvertTo-DkUInt32`:127, `Test-DkRegValueEqual`:131, `Write-DkLog`:139, `ConvertTo-DkHashtable`:151, `Read-DkJsonFile`:172, `Write-DkJsonFileAtomic`:181, `Enter-DkLock`:199, `Exit-DkLock`:210, `New-DkManifest`:220, `Read-DkManifest`:233, `Save-DkManifest`:240, `Get-DkManifestOrInit`:242, `Get-DkEntry`:248, `Set-DkEntry`:254, `Add-DkHistory`:266, `Get-DkCatalogRaw`:274, `Load-DkFakeState`:302, `Save-DkFakeState`:310, `New-DkFakeBackend`:312, `New-DkRealBackend`:443, `Enter-DkDefaultUser`:699, `Exit-DkDefaultUser`:710, `Resolve-DkRegTarget`:722, `Get-DkRegEntries`:746, `Invoke-DkRegistryCapture`:748, `Invoke-DkRegistryApply`:761, `Invoke-DkRegistryVerify`:773, `Invoke-DkRegistryRevert`:788, `Invoke-DkServiceCapture`:798, `Invoke-DkServiceApply`:804, `Invoke-DkServiceVerify`:809, `Invoke-DkServiceRevert`:815, `Invoke-DkTaskCapture`:821, `Invoke-DkTaskApply`:826, `Invoke-DkTaskVerify`:827, `Invoke-DkTaskRevert`:834, `Invoke-DkPowercfgCapture`:841, `Invoke-DkPowercfgApply`:842, `Invoke-DkPowercfgVerify`:860, `Invoke-DkPowercfgRevert`:868, `Invoke-DkDefaultAssocCapture`:870, `Invoke-DkDefaultAssocApply`:871, `Invoke-DkDefaultAssocVerify`:872, `Invoke-DkDefaultAssocRevert`:873, `Resolve-DkPayloadPath`:875, `Get-DkAppxShortName`:889, `Get-DkWindowsAppsRoot`:891, `Get-DkAppxKind`:897, `Get-DkAppxPreserveSet`:904, `Invoke-DkAppxCapture`:925, `Save-DkAppxPayload`:940, `Invoke-DkAppxApply`:985, `Invoke-DkAppxVerify`:1002, `Restore-DkAppxPackage`:1015, `Restore-DkAppxFromStore`:1066, `Test-DkAppxOriginallyPresent`:1076, `Invoke-DkAppxRevert`:1082, `Invoke-DkCapture`:1094, `Test-DkApplied`:1107, `Test-DkOriginal`:1120, `Invoke-DkApply`:1156, `Invoke-DkRevert`:1168, `Test-DkNeedsHive`:1181, `Test-DkDependencies`:1183, `Invoke-DkChangeApplyOne`:1194, `Invoke-DkChangeRevertOne`:1281, `Get-DarkOSCatalog`:1310, `Get-DarkOSManifest`:1317, `Get-DarkOSStatus`:1319, `Invoke-DarkOSChange`:1356, `Add-DkResults`:1406, `Sort-DkByDependency`:1415, `Set-DarkOSProfile`:1433, `Restore-DarkOSProfile`:1464, `Get-DarkOSRemovedApps`:1475, `Restore-DarkOSAppx`:1492, `New-DarkOSSnapshot`:1518, `Get-DarkOSSnapshot`:1536, `Restore-DarkOSSnapshot`:1542, `Get-DarkOSFailures`:1562, `Get-DarkOSRebootPending`:1574, `Export-DarkOSDiagnostics`:1581, `Initialize-DarkOSRecovery`:1616

## `electron/services/darkos/DarkOSRecoveryService.js`

`isValidChangeId`:48, `isValidProfile`:52, `isValidPackageName`:57, `sanitizeLabel`:65, `isValidDiagnosticsDestination`:73, `uniqueIds`:80, `parseCliOutput`:93, `parseProgressLine`:133, `stripLeakedProgress`:146, `clean`:148, `extractChangeResults`:171, `summarizeChangeResults`:187, `psq`:241, `defaultBundledDir`:245, `defaultRunner`:258, `onStdout`:263, `defaultIsElevated`:290, `DarkOSRecoveryService`:301 _class_, `manifestPath`:326, `isDarkOS`:330, `available`:344, `catalogPath`:348, `resolveCli`:352, `info`:372, `_emit`:386, `_enqueue`:395, `buildScript`:402, `run`:420, `onLine`:445, `_runChange`:485, `_read`:502, `getCatalog`:509, `getManifest`:518, `getStatus`:522, `_change`:530, `applyChange`:540, `revertChange`:544, `setProfile`:548, `restoreProfile`:555, `getRemovedApps`:559, `restoreAppx`:563, `listSnapshots`:571, `createSnapshot`:575, `restoreSnapshot`:587, `getFailures`:592, `getRebootPending`:596, `exportDiagnostics`:600

## `electron/services/darkos/UsbMediaService.js`

`parseLine`:14, `usableDisks`:20, `UsbMediaService`:24 _class_, `_script`:33, `_run`:40, `listDisks`:59, `findIsos`:67, `allowIso`:81, `hashIso`:88, `write`:108, `cancel`:123

## `electron/services/darkos/darkosRelease.js`

`parseReleasePage`:6, `parseSha256File`:18, `isNewerBuild`:23, `p`:24, `fetchLatestRelease`:32, `get`:33

## `electron/services/darkos/usb-media.ps1`

`Say`:17, `Test-Target`:19

## `electron/services/diskscan/DiskScanService.js`

`defaultExe`:13, `csvCell`:18, `formatSize`:20, `DiskScanService`:27 _class_, `_filter`:38, `drives`:46, `status`:59, `emit`:92, `cancel`:123, `view`:134, `info`:155, `setTag`:160, `_pathOf`:165, `open`:171, `reveal`:178, `trash`:186, `pathOf`:196, `exportTo`:199, `write`:204

## `electron/services/diskscan/ScanModel.js`

`Col`:5 _class_, `push`:7, `ScanModel`:13 _class_, `_growDirs`:28, `grow`:32, `addLine`:37, `fileCount`:58, `index`:61, `known`:67, `_topDown`:81, `dirPath`:89, `filePath`:96, `sizes`:102, `view`:153, `build`:158, `trail`:191, `parse`:197, `info`:205, `setTag`:222, `markRemoved`:229, `eachFile`:238

## `electron/services/diskscan/filter.js`

`classOf`:22, `maskToRegExp`:37, `parseClause`:42, `parseFilter`:85, `matchFile`:100

## `electron/services/dlss5/Dlss5Service.js`

`inspectPeExecutable`:23, `rvaToFileOffset`:57, `computeSha256`:102, `Dlss5Service`:111 _class_, `getHistoryFilePath`:116, `getRecentGames`:125, `saveRecentGame`:137, `getSteamPath`:154, `getLibraryPaths`:191, `getInstalledSteamGames`:210, `detectGpu`:260, `detectGraphicsAPI`:312, `scanGameDirectory`:435, `findCandidates`:465, `getUserDataDir`:582, `_readManifest`:591, `restoreSignatureCheckBypass`:600, `inside`:626, `registerDlss5IPC`:707, `serialized`:712, `onLog`:747

## `electron/services/downloads/DownloadManager.js`

`sleep`:28, `request`:31, `onAbort`:58, `AbortedError`:65 _class_, `DownloadManager`:69 _class_, `init`:91, `shutdown`:104, `getSettings`:112, `setSettings`:116, `_loadSettings`:141, `_saveSettings`:150, `_loadQueue`:155, `_scheduleSave`:168, `_flushSave`:174, `_connectionsFor`:187, `list`:192, `add`:196, `pause`:233, `resume`:241, `pauseAll`:253, `resumeAll`:254, `cancel`:257, `remove`:269, `clearFinished`:282, `getFilePath`:288, `_afterChange`:294, `_toPublic`:300, `_scheduleEmit`:320, `_sampleSpeeds`:329, `_checkSchedule`:346, `_pump`:370, `_startTask`:379, `_abortTask`:407, `_deletePart`:412, `_unlinkPart`:419, `_pathTaken`:424, `_probe`:430, `_prepareFiles`:451, `_run`:477, `_downloadPiece`:539, `_streamPiece`:560, `_finish`:609, `hashFile`:634

## `electron/services/downloads/downloadUtils.js`

`sanitizeFileName`:7, `parseContentDisposition`:22, `fileNameFromUrl`:33, `validateDownloadUrl`:43, `autoConnections`:58, `planPieces`:68, `categoryForFile`:92, `uniquePath`:99, `safeJoin`:108, `Throttle`:117 _class_, `setRate`:123, `parseHHMM`:135, `isInsideWindow`:144, `clampInt`:151

## `electron/services/downloads/registerDownloadsIPC.js`

`registerDownloadsIPC`:9, `broadcast`:24, `handle`:37

## `electron/services/drivers/DriverInstallService.js`

`foreach`:83, `foreach`:93, `foreach`:126, `foreach`:127, `dhpFunc`:152, `wuSearchScript`:162, `wuSearchElevatedScript`:173, `buildInstallScript`:192, `foreach`:283, `readWuOutput`:315, `wuErrorKind`:325, `fetchText`:333, `driversDir`:350, `sha256File`:357, `DriverInstallService`:363 _class_, `scan`:374, `searchWindowsUpdate`:390, `lookupVendor`:412, `findDrivers`:448, `download`:474, `signature`:516, `note`:536, `pump`:581

## `electron/services/drivers/driverPlan.js`

`problemReason`:19, `asArray`:28, `str`:29, `parsePciIds`:32, `normalizeDevice`:44, `normalizeScan`:77, `wuBlockers`:104, `isUpdateId`:114, `normalizeWuUpdates`:117, `devicesForUpdate`:139, `isTrustedPackageUrl`:154, `isExpectedSigner`:178, `nvidiaLookupUrl`:186, `parseNvidiaLookup`:198, `safeJson`:208, `nvidiaVersionFromWindows`:213, `compareVersions`:222, `parseAmdDriversPage`:235, `intelPackageFor`:254, `parseIntelDownloadPage`:272, `meta`:273, `vendorInstallArgs`:280, `vendorIsSilent`:286, `interpretExitCode`:289, `buildPlan`:309, `needs`:311, `vendorFor`:312, `recommendedIds`:370, `uncoveredDevices`:375, `parseProgressLine`:387, `parseProgressText`:394

## `electron/services/ensureElevated.js`

`quoteArg`:9, `buildRelaunchCommand`:15, `relaunchAsAdmin`:20, `ensureElevated`:32

## `electron/services/gpubench/GpuBenchService.js`

`enginePath`:17, `Engine`:23 _class_, `next`:31, `send`:44, `ask`:46, `stop`:51, `kill`:56, `GpuBenchService`:59 _class_, `hubUrl`:73, `history`:78, `_save`:79, `remove`:80, `stressHistory`:82, `removeStress`:83, `_token`:85, `status`:89, `viewport`:94, `_startEngine`:100, `ranking`:107, `rankingUrl`:117, `openRanking`:119, `link`:137, `unlink`:156, `cancel`:163, `_sensorSample`:165, `run`:167, `warm`:183, `record`:189, `stress`:228, `_preview`:289, `_rankedRun`:300

## `electron/services/gpubench/gpuBenchModel.js`

`decodeFrameUs`:12, `frameStats`:20, `scoreOf`:35, `sensorSummary`:42, `pick`:43, `mean`:44, `max`:45, `sampleGpu`:55, `val`:57, `localPlan`:65

## `electron/services/gpubench/sceneModel.js`

`pcg`:22, `hash2`:29, `tri`:31, `box`:34, `camera`:47, `sub`:58, `cross`:59, `norm`:60, `primaryRay`:63, `hitBox`:73, `castRay`:88, `pixelId`:115, `tileHasEdges`:118, `pickTiles`:127, `tileHash`:137, `sha`:143, `frameRoot`:146, `merkleLevels`:152, `merkleRoot`:163, `merklePath`:166, `verifyPath`:177

## `electron/services/gpubench/stressModel.js`

`normalizeStress`:15, `stressPlan`:25, `isDeviceLost`:32, `finite`:34, `round1`:35, `stability`:38, `clockDrop`:48, `avg`:54, `summarizeStress`:68

## `electron/services/hotkeys/HotkeyService.js`

`HotkeyService`:12 _class_, `_watcher`:20, `_send`:49, `register`:57, `unregister`:71, `dispose`:79

## `electron/services/hotkeys/hotkey.js`

`key`:10, `normalizeHotkey`:26, `isBareKey`:46

## `electron/services/hub/ExtensionHost.js`

`ExtensionHost`:29 _class_, `_ext`:43, `assets`:49, `doc`:55, `response`:66, `log`:79, `getLogs`:86, `_storeFile`:89, `_readStore`:90, `_writeStore`:91, `call`:100, `key`:106, `_fetch`:160, `toText`:180

## `electron/services/hub/HubCatalog.js`

`signedMessage`:14, `verifyDownload`:16, `compareSemver`:30, `p`:31, `HubCatalog`:41 _class_, `server`:51, `setServer`:60, `publicServer`:75, `_json`:77, `search`:85, `detail`:102, `_tier`:108, `download`:111, `inspect`:124, `install`:131, `_countInstall`:139, `updates`:145, `update`:164

## `electron/services/hub/HubMcp.js`

`toText`:39, `rpcError`:40, `HubMcp`:42 _class_, `_cfg`:60, `_write`:67, `status`:73, `init`:79, `setEnabled`:81, `regenerateToken`:88, `start`:95, `stop`:107, `_handle`:114, `send`:115, `_rpc`:150, `_approved`:180, `callTool`:185

## `electron/services/hub/HubService.js`

`psTaskList`:32, `taskReadScript`:36, `taskApplyScript`:47, `opFailed`:58, `HubService`:60 _class_, `_load`:75, `_save`:76, `builtins`:78, `hardware`:80, `list`:89, `record`:101, `_opStatus`:103, `_tooOld`:109, `inspect`:120, `_readTasks`:187, `install`:195, `_install`:201, `undo`:231, `_remove`:297, `uninstall`:320, `exportMine`:337

## `electron/services/hub/builtins.js`

`buildBuiltins`:17, `builtinsJson`:48, `builtinsFromJson`:56

## `electron/services/hub/ext/bridge.js`

`send`:11, `call`:26, `text`:34, `on`:55, `tick`:82

## `electron/services/hub/extensionModel.js`

`scanExtension`:36, `lowerKeys`:49, `validateExtension`:52, `describeExtension`:75, `name`:77, `esc`:88, `buildExtensionDoc`:94, `resolve`:98, `sensorsForExtensions`:124, `num`:125

## `electron/services/hub/extensionPack.js`

`packExtensionFolder`:10, `walk`:15

## `electron/services/hub/hubModel.js`

`lower`:75, `under`:76, `pathOf`:78, `validatePackage`:87, `at`:103, `computeRisk`:184, `conditionMismatch`:203, `num`:205, `anyOf`:211, `hardwareFromRaw`:232, `serviceKey`:254, `stepOf`:257, `resolvePackage`:269, `toChangeSet`:285, `touchedEntries`:303, `describeStep`:322, `pick`:334, `presetFromState`:338, `newerAppNeeded`:358, `parse`:359

## `electron/services/hwsensors/DarkHub.HwSensors.cs`

`Nvml`:25 _class_, `ProcInfo`:40 _class_, `Device`:46 _class_, `Num`:106, `U32`:113, `ProcMem`:120, `Dump`:138, `HwSensors`:173 _class_, `Esc`:175, `PawnIoInstalled`:187, `Dump`:193, `IsAdmin`:222, `ReadSmbios`:231, `Main`:259

## `electron/services/hwsensors/pawnio.js`

`installPawnIo`:16

## `electron/services/kakugan/KakuganClient.js`

`KakuganError`:6 _class_, `sessionFromSetCookie`:17, `KakuganClient`:28 _class_, `loggedIn`:36, `request`:38, `status`:59, `plans`:60, `me`:61, `login`:62, `logout`:63, `dashboard`:66, `orders`:67, `steamLoginStart`:68, `steamLoginPoll`:69, `steamLoginCode`:70, `steamLoginCancel`:71, `updateAccount`:72, `accountInput`:73, `removeAccount`:74, `searchGames`:75, `gameNames`:76

## `electron/services/kakugan/kakuganAlerts.js`

`kakuganAlerts`:12, `push`:14, `accountsToPause`:46

## `electron/services/maintenance/MaintenanceService.js`

`winget`:21, `MaintenanceService`:27 _class_, `_load`:38, `_save`:46, `state`:48, `setTask`:55, `runTask`:67, `_cleanTemp`:92, `_securityLists`:98, `_clamav`:105, `_saveBackups`:112, `_wingetUpdates`:118, `tick`:128, `start`:137, `stop`:144

## `electron/services/maintenance/schedule.js`

`parseTime`:4, `nextRun`:12, `isDue`:34, `normalizeTask`:41

## `electron/services/metadata/MetadataService.js`

`F`:21, `FF`:23, `planFor`:90, `digits`:110, `asText`:111, `nl`:112, `splitList`:113, `isBinaryValue`:114, `isEmptyValue`:116, `tagName`:117, `tagGroup`:118, `sameValue`:120, `exifDate`:137, `p`:140, `isoDate`:144, `pickByName`:155, `pickFirst`:165, `gpsKeys`:171, `coverKey`:178, `samePath`:180, `n`:181, `runFfmpeg`:185, `createMetadataService`:196, `exiftool`:197, `ffmpeg`:198, `readAllTags`:200, `canonicalValues`:205, `buildGroups`:217, `read`:231, `writeWithExiftool`:284, `writeWithFfmpeg`:329, `writeOoxml`:380, `verify`:394, `uniqueBackupPath`:435, `write`:448

## `electron/services/metadata/exiftoolRunner.js`

`needsFile`:12, `tmpName`:16, `assignArg`:19, `runExiftool`:28, `readTags`:45, `readBinaryTag`:56, `writeTagsTo`:62

## `electron/services/metadata/fileProbe.js`

`ascii`:51, `detectType`:56, `at`:59, `hexDump`:107, `probeFile`:121, `extMatches`:148, `runPs`:157, `parseZoneIdentifier`:176, `readFsInfo`:186, `validStreamName`:211, `removeStream`:215, `toMs`:237, `setFsProps`:245

## `electron/services/metadata/ooxmlZip.js`

`CRC_TABLE`:7, `crc32`:17, `readZipEntries`:23, `entryData`:60, `rewriteZip`:67, `emit`:73, `xmlEscape`:146, `xmlUnescape`:147, `reEsc`:170, `elementRe`:171, `getXmlElement`:175, `setXmlElement`:180, `toW3cdtf`:192, `readOoxmlProps`:201, `find`:203, `writeOoxmlProps`:223, `find`:225, `writeOoxmlFile`:250

## `electron/services/optimizer/AppManagerEngine.js`

`toArray`:66, `AppManagerEngine`:70 _class_, `runPowerShellJson`:81, `runPowerShell`:91, `_startupFolders`:101, `getStartupItems`:112, `_validateStartupPayload`:174, `disableStartupItem`:194, `getServices`:242, `disableService`:251, `findRegisteredProgram`:294, `_validKeyPath`:300, `_uninstallBlock`:306, `uninstallProgram`:319, `_isSafeLeftoverName`:337, `_isSafeInstallLocation`:350, `uninstallProgramWithLeftovers`:360, `foreach`:392, `foreach`:401, `getInstalledPrograms`:425, `listBloatware`:458, `removeSelectedBloatware`:477, `foreach`:497, `foreach`:498, `nameOf`:516, `getRunningProcesses`:528, `setProcessPriority`:567, `getGpuPreferences`:604, `_validateAppExe`:626, `_readGpuValue`:635, `setGpuPreference`:641, `removeGpuPreference`:657, `getGpuInfo`:666, `getHagsStatus`:685, `setHagsStatus`:694, `revertHags`:708

## `electron/services/optimizer/DeepTweaksEngine.js`

`defineTweak`:47, `buildPublicTweaks`:62, `buildInternalGroups`:653, `snapshotNumber`:697, `DeepTweaksEngine`:729 _class_, `_exclusive`:749, `listTweaks`:756, `getRecommendedIds`:763, `getDefinition`:767, `loadUndoStore`:772, `saveUndoStore`:783, `saveExtra`:797, `getExtra`:801, `clearExtra`:804, `readEntries`:811, `runRegistryOps`:836, `exec`:847, `_entriesFor`:885, `_buildSnapshot`:892, `captureSnapshot`:905, `_evalDefStatus`:915, `checkTweaksStatus`:929, `restartExplorer`:957, `runLiveAction`:970, `_applyDefsUnlocked`:990, `_finishRun`:1074, `_summarize`:1085, `_restoreDefsUnlocked`:1139

## `electron/services/optimizer/DefenderControlEngine.js`

`buildImageDefenderRestoreScript`:23, `DefenderControlEngine`:50 _class_, `getStatus`:51, `runNativeDefenderControl`:88, `restoreImageDefender`:149, `openTamperSettings`:171

## `electron/services/optimizer/DnsEngine.js`

`isUsableDnsServer`:34, `buildDnsQuery`:41, `isValidDnsAnswer`:50, `dnsLatencyUdp`:59, `finish`:66, `clampInt`:82, `DnsEngine`:88 _class_, `getPresets`:89, `benchmark`:97, `worker`:105, `_psJson`:124, `getActiveAdapter`:130, `_readServers`:138, `getState`:149, `apply`:162, `undo`:203

## `electron/services/optimizer/ElevationHelper.js`

`waitForElevated`:21, `decodeShellOutput`:37, `ElevationHelper`:49 _class_, `isElevated`:54, `_auditScript`:66, `_privateDir`:71, `runMarked`:82, `runElevatedPowerShell`:91, `readSafe`:143, `runElevatedCmd`:180, `readSafe`:218

## `electron/services/optimizer/MemoryEngine.js`

`summarizeMemoryDelta`:12, `MemoryEngine`:17 _class_, `optimizeRAM`:24, `adjustTimerResolution`:85, `optimizeAudioLatency`:96

## `electron/services/optimizer/NetworkEngine.js`

`buildAdvancedNetworkChanges`:16, `NetworkEngine`:27 _class_, `getActiveAdapterName`:28, `getUpAdapters`:42, `flushDns`:56, `_res`:70, `cleanNetwork`:85, `_eeeReadScript`:99, `advancedNetworkApply`:121, `advancedNetworkRevert`:159, `optimizeGameRoute`:192, `revertGameRoute`:197

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

`featureById`:46, `summarizeFeatureState`:51, `parseFeatureLines`:60, `featureReadScript`:71, `launch`:82, `finish`:85, `WindowsToolsEngine`:95 _class_, `listFeatures`:101, `setFeature`:108, `openPanel`:147, `run`:154, `resetWindowsUpdate`:161, `repairWinget`:184, `cleanupComponentStore`:200, `removeEdge`:212, `installEdge`:225, `decryptSystemDrive`:235, `autologon`:254

## `electron/services/optimizer/wuDiagnose.js`

`ipv4`:11, `ipInRange`:16, `wuFindings`:33, `diagnoseWindowsUpdate`:70

## `electron/services/overlay/OverlayService.js`

`OverlayService`:19 _class_, `_saveLayouts`:71, `layoutsState`:73, `saveLayout`:82, `newLayout`:91, `deleteLayout`:97, `activateLayout`:105, `preview`:114, `power`:120, `resetEnergy`:128, `_save`:130, `_emit`:131, `status`:133, `setSettings`:142, `_bindHotkey`:153, `_displays`:161, `_displayIdFromPhysical`:172, `_place`:179, `_ensureWindow`:191, `show`:207, `hide`:225, `toggle`:238, `_closeSession`:240, `p`:243, `_attach`:249, `_track`:267, `_follow`:280, `_restartLoop`:290, `_stopLoop`:297, `_stream`:299, `_render`:306, `add`:323, `_log`:342, `f`:351, `dispose`:356

## `electron/services/overlay/PresentMonService.js`

`PresentMonService`:19 _class_, `installed`:26, `ensure`:28, `running`:52, `start`:55, `stop`:80

## `electron/services/overlay/customModel.js`

`isNum`:9, `num`:10, `str`:11, `esc`:12, `cssValue`:14, `color`:15, `hw`:20, `gpu`:21, `cpu`:22, `ram`:23, `fr`:24, `ss`:25, `nv`:26, `dv`:27, `rl`:28, `normStyle`:140, `newId`:148, `idOk`:149, `normItem`:151, `normWidget`:165, `normalizeLayout`:191, `hexToRgba`:228, `px`:234, `value`:236, `hash`:257, `renderLayout`:268, `add`:275, `M`:364, `fromPreset`:437, `sampleContext`:443, `hist`:445

## `electron/services/overlay/frameStats.js`

`splitCsv`:4, `createCsvParser`:19, `num`:29, `RangeStat`:46 _class_, `reset`:48, `push`:49, `stats`:56, `pct`:59, `FrameWindow`:62 _class_, `push`:72, `stats`:83, `avg`:90, `reset`:108, `SessionStats`:119 _class_, `reset`:122, `push`:136, `percentile`:157, `stats`:168

## `electron/services/overlay/lhmModel.js`

`pos`:5, `volts`:8, `hwEntries`:10, `index`:12, `get`:15, `all`:16, `decodeThrottle`:25, `avg`:31, `readLhm`:33, `n`:115

## `electron/services/overlay/overlayModel.js`

`normalizeSettings`:26, `clamp`:27, `pickDisplay`:47, `byId`:48, `v`:56, `n`:57, `readSensors`:60, `tone`:75, `buildRows`:81, `f`:105, `cell`:106, `buildPanel`:114, `L`:117, `money`:182, `mm`:216

## `electron/services/overlay/powerModel.js`

`psuCurve`:23, `psuEfficiency`:33, `num`:46, `posNum`:47, `fpsPerWatt`:50, `joulesPerFrame`:52, `EnergyMeter`:59 _class_, `reset`:62, `push`:72, `mid`:84, `hasCounter`:94, `gpuJoules`:95, `cpuJoules`:96, `systemPower`:100, `costOf`:115, `normalizePower`:128, `clamp`:129, `buildDerived`:146, `scenario`:159

## `electron/services/psTools/PsToolkitService.js`

`safeJson`:26, `stamp`:30, `p`:31, `hostsFilePath`:35, `PsToolkitService`:39 _class_, `_dir`:52, `_privateTmp`:57, `_runElevated`:63, `preview`:69, `runTool`:76, `_shape`:102, `_native`:131, `_exportWlan`:139, `listWifiProfiles`:154, `revealWifiKey`:164, `readHosts`:175, `readHostsBackup`:189, `previewHosts`:198, `writeHosts`:205, `isCustomRunning`:217, `send`:233, `decode`:263, `finish`:267, `stopCustom`:281, `_snippetFile`:295, `listSnippets`:299, `_writeSnippets`:309, `saveSnippet`:317, `deleteSnippet`:337, `exportTo`:348

## `electron/services/psTools/psToolBuilders.js`

`getTool`:17, `splitPatterns`:22, `toExcludeWildcards`:30, `isPlainAbsPath`:35, `isDangerousCleanupRoot`:46, `norm`:48, `validateParams`:67, `condition`:125, `toolFlags`:130, `DhOut`:141, `DhHas`:142, `psList`:145, `folderExpr`:146, `fileScan`:149, `Add`:172, `foreach`:360, `displayCommand`:475, `buildPlan`:483, `cleanConsoleLines`:508, `parseWingetTable`:519, `xmlText`:546, `parseWlanProfileXml`:552, `isValidWifiProfileName`:567, `parseHosts`:572, `diffLines`:595, `count`:598, `validateHostsContent`:608, `buildHostsWriteScript`:616, `columnsOf`:630, `cell`:636, `rowsToCsv`:643, `esc`:645, `rowsToText`:654, `fit`:658, `line`:659, `normalizeRows`:663, `validateSnippet`:669

## `electron/services/realtime/ClamAv.js`

`parseClamscan`:21, `freshclamConf`:30, `run`:35, `ClamAv`:55 _class_, `find`:62, `clamscan`:71, `freshclam`:72, `hasDatabase`:74, `databaseAge`:81, `status`:85, `install`:89, `update`:106, `scan`:116

## `electron/services/realtime/HashDb.js`

`HashDb`:8 _class_, `lookup`:27

## `electron/services/realtime/Quarantine.js`

`xorStream`:11, `transcode`:23, `Quarantine`:29 _class_, `paths`:32, `add`:38, `public`:55, `list`:60, `restore`:72, `remove`:85

## `electron/services/realtime/RealtimeOptimizer.js`

`shouldTrim`:18, `nextCooldownMin`:24, `planRuleActions`:29, `RealtimeOptimizer`:42 _class_, `running`:55, `start`:57, `stop`:70, `status`:77, `record`:82, `memoryTick`:89, `rulesTick`:112

## `electron/services/realtime/RealtimeProtection.js`

`isScanCandidate`:26, `sha256File`:32, `RealtimeProtection`:39 _class_, `running`:55, `start`:57, `stop`:72, `status`:82, `scanNow`:87, `record`:91, `changed`:99, `settle`:108, `enqueue`:122, `drain`:129, `scanOne`:139, `flushClam`:160, `markClean`:175, `detected`:180

## `electron/services/realtime/realtimeConfig.js`

`clamp`:7, `normalizeRule`:11, `effectiveRules`:37, `normalizeFolder`:43, `defaults`:48, `normalize`:73, `ConfigStore`:104 _class_, `read`:111, `update`:115

## `electron/services/recovery/DiskRecoveryService.js`

`defaultExe`:10, `normalizeTarget`:16, `diskNumberOf`:24, `int`:29, `createLineParser`:36, `parseLine`:46, `DiskRecoveryService`:55 _class_, `available`:65, `_missing`:69, `run`:74, `finish`:104, `reserve`:119, `release`:125, `status`:129, `cancel`:134, `_backupPath`:143, `_writeFlags`:153, `listDrives`:164, `inspectDisk`:166, `readSector`:168, `writeSector`:172, `repairHeader`:180, `setActive`:191, `backupTable`:196, `restoreBackup`:202, `clone`:211, `verify`:229, `surfaceTest`:236, `startCarving`:242, `smart`:255

## `electron/services/recovery/PartitionService.js`

`defaultScript`:16, `partitionRole`:39, `bitlockerState`:46, `withRawBitlocker`:55, `fingerprint`:67, `freeGaps`:73, `asList`:86, `letterOf`:87, `shapeListing`:93, `PartitionService`:195 _class_, `list`:208, `_exec`:218, `_payload`:237, `_probeLocks`:245, `_settleBitlocker`:253, `_context`:264, `limits`:297, `plan`:303, `apply`:319

## `electron/services/recovery/partition-ops.ps1`

`Send-Result`:13, `Stop-Refused`:17, `Get-DiskPartitions`:19, `Assert-Target`:23, `Invoke-Format`:45

## `electron/services/recovery/partitionPolicy.js`

`whole`:19, `alignedMib`:24, `fileSystem`:29, `label`:33, `driveLetter`:39, `normalizeRequest`:46, `diskBlockers`:66, `partitionBlockers`:85, `volumeInUse`:95, `createChecks`:97, `resizeChecks`:109, `evaluate`:123, `predict`:174, `verify`:197, `at`:200

## `electron/services/restore/RestoreService.js`

`DETECT_SCRIPT`:14, `foreach`:49, `run`:57, `RestoreService`:61 _class_, `status`:67, `install`:77, `_elevated`:100, `_capability`:106, `_feature`:123, `_store`:141, `_msStore`:152, `_winget`:166

## `electron/services/restore/componentCatalog.js`

`getComponent`:51, `componentStatus`:57, `restoreErrorText`:83, `sxsFromRoot`:90

## `electron/services/saves/SaveBackupService.js`

`sha256File`:18, `run`:22, `safeName`:25, `templatePrefix`:27, `SaveBackupService`:29 _class_, `settings`:41, `setSettings`:52, `_env`:59, `_ensureIndex`:81, `_collect`:123, `_gameDir`:137, `versions`:139, `scan`:148, `_match`:166, `backup`:173, `_rotate`:223, `previewRestore`:231, `_gameRunning`:246, `restore`:253, `removeVersion`:283, `backupAll`:290, `onGameClosed`:300

## `electron/services/saves/manifestIndexer.js`

`isWindows`:7, `buildIndex`:9

## `electron/services/saves/savePaths.js`

`resolveTemplate`:15, `nameKey`:29, `matchGames`:36, `globToRegex`:56, `expandGlob`:59, `addTree`:62, `walk`:72, `staticPrefix`:94

## `electron/services/screenPicker/ScreenPicker.js`

`ScreenPicker`:10 _class_, `pick`:18, `_pick`:23, `finish`:34, `onResult`:36, `sleep`:74

## `electron/services/security/AdvancedProtectionService.js`

`readCapped`:27, `AdvancedProtectionService`:51 _class_, `setDataDir`:63, `_dir`:67, `_statePath`:74, `_loadState`:76, `_saveState`:88, `_cachePath`:94, `_readCache`:96, `_exclusive`:100, `listSources`:108, `setEnabled`:117, `_download`:127, `updateFeeds`:152, `worker`:158, `_collect`:183, `_readHosts`:199, `_backupHosts`:206, `_writeHosts`:218, `hostsStatus`:233, `applyHosts`:243, `restoreHosts`:264, `firewallStatus`:283, `applyFirewall`:295, `restoreFirewall`:312, `hashesStatus`:327, `applyHashes`:333, `restoreHashes`:345, `_readHardening`:357, `hardeningStatus`:364, `hardeningApply`:386, `hardeningRestore`:416, `status`:435, `lookupDomain`:449, `lookupIp`:472

## `electron/services/security/feedParsers.js`

`isNeverBlocked`:22, `normalizeDomain`:28, `eachDataLine`:37, `parseHostsFormat`:55, `parseDomainList`:70, `ipv4ToInt`:84, `intToIpv4`:92, `parseCidr`:97, `overlapsReserved`:121, `parseIpList`:126, `buildIpMatcher`:138, `parseSha256List`:171, `extractUpstreamDate`:185, `parseFeed`:192, `looksLikeHtml`:205, `detectEol`:222, `userMappedNames`:229, `removeManagedBlock`:244, `mergeManagedBlock`:273, `readManagedBlockInfo`:302, `buildHostsWriteScript`:322, `chunk`:345, `sanitizeFirewallAddresses`:352, `buildFirewallApplyScript`:366, `buildFirewallRemoveScript`:390, `buildFirewallStatusScript`:398, `parseFirewallCount`:408

## `electron/services/security/feedSources.js`

`getFeedSource`:174, `isAllowedFeedUrl`:178

## `electron/services/security/hardeningCatalog.js`

`getHardeningItem`:61, `allRegistryEntries`:65, `buildHardeningStatusScript`:70, `defenderActive`:94, `registryMap`:101, `asrState`:106, `count`:111, `evaluateHardening`:119, `regApplied`:121, `regSnapshotPs`:159, `buildHardeningApplyScript`:168, `parseHardeningSnapshot`:220, `buildHardeningRestoreScript`:253

## `electron/services/setup/wingetFallback.js`

`wingetOutcome`:15, `parseWingetShow`:26, `pick`:27, `silentInstall`:36, `norm`:52, `signerMatches`:58, `isFetchableUrl`:66

## `electron/services/startup/StartupService.js`

`Approved`:16, `foreach`:41, `StartupService`:68 _class_, `_history`:73, `_record`:74, `list`:79, `_toggleScript`:98, `setEnabled`:116, `undo`:129

## `electron/services/startup/startupModel.js`

`decodeApproved`:8, `encodeApproved`:21, `exeFromCommand`:32, `num`:40, `parseBootEvents`:47, `baseName`:63, `impactFor`:66, `sensitivity`:76

## `electron/services/susuya/AiUpscaler.js`

`defaultDir`:14, `planEnhance`:25, `parseProgress`:34, `buildArgs`:39, `ultraName`:43, `AiUpscaler`:45 _class_, `exe`:53, `available`:54, `sharp`:56, `_run`:61, `onData`:68, `_enhance`:97

## `electron/services/susuya/RegionPicker.js`

`parseRegionTitle`:22, `makeRegionPicker`:38, `finish`:56

## `electron/services/susuya/Screenshot.js`

`pad`:10, `screenshotName`:11, `physicalSize`:16, `cropRect`:25, `clampX`:29, `clampY`:30, `displayKey`:43, `listDisplays`:48, `pickDisplays`:60, `byId`:61, `layoutCanvas`:79, `matchSources`:100, `captureSources`:108, `grabDisplay`:120, `upscaleFactor`:144, `enlarge`:153, `saveShot`:162, `captureScreen`:173, `captureRegion`:183, `grabRegionImage`:195

## `electron/services/susuya/SusuyaClient.js`

`mimeOf`:20, `links`:22, `json`:24, `readChunk`:30, `SusuyaClient`:41 _class_, `config`:48, `worker`:74, `remove`:104

## `electron/services/upscale/Autopilot.js`

`findExe`:14, `Autopilot`:24 _class_, `installed`:30, `latest`:41, `status`:50, `launch`:74

## `electron/services/upscale/DlssUpdater.js`

`RAW`:13, `scanGameFolder`:23, `walk`:26, `safe`:44, `verifySignature`:46, `DlssUpdater`:56 _class_, `latest`:64, `officialDll`:75, `inspect`:91, `restore`:123, `record`:136

## `electron/services/upscale/pe.js`

`readRange`:7, `fileVersionFromBuffer`:14, `peFileVersion`:26, `isPe64`:38, `compareVersions`:52

## `electron/services/usb/UsbService.js`

`foreach`:23, `Ms`:29, `UsbService`:47 _class_, `list`:52, `_run`:67, `setDeviceEnabled`:73, `keepDisabled`:92, `setStorageBlocked`:99, `setWriteProtect`:104, `setSelectiveSuspend`:112, `eject`:123

## `electron/services/usb/usbModel.js`

`parseLocation`:5, `isController`:10, `isHub`:11, `buildPorts`:19, `portOf`:21, `canToggle`:58, `parseHistory`:65

## `electron/services/vaultBridge/bridgeServer.js`

`isLoopbackAddress`:27, `VaultBridgeServer`:32 _class_, `running`:59, `start`:63, `stop`:80, `disconnectClient`:94, `connectedClientIds`:104, `onConnection`:110, `cleanup`:143, `fail`:155, `send`:159, `onFrame`:164, `handle`:194, `findSameLogin`:270, `withPrompt`:279, `pairRequest`:298, `saveRequest`:329

## `electron/services/vaultBridge/domainMatch.js`

`isIPv4`:50, `isIPv6`:54, `isIpHost`:58, `isLoopbackHost`:62, `stripWww`:67, `registrableDomain`:75, `defaultPort`:95, `parsePageUrl`:103, `parseEntrySite`:117, `matchSite`:137, `findMatchingEntries`:169, `sameSite`:185, `siteForSavedLogin`:195

## `electron/services/vaultBridge/nativeHost.js`

`isBrowserId`:30, `buildHostManifest`:35, `manifestFileName`:49, `defaultRunReg`:53, `bundledHostCandidates`:62, `sha256File`:70, `NativeHostRegistry`:74 _class_, `hostExePath`:86, `manifestPath`:90, `defaultFindBundledExe`:94, `installHostExe`:108, `register`:125, `unregister`:139, `readRegValue`:150, `status`:159, `statusAll`:177, `anyRegistered`:181, `writeBridgeConfig`:187

## `electron/services/vaultBridge/pairingStore.js`

`sha256Hex`:10, `generatePairingCode`:13, `PairingStore`:19 _class_, `load`:31, `save`:43, `run`:45, `list`:56, `add`:69, `verify`:92, `revoke`:105, `revokeAll`:113

## `electron/services/vaultBridge/protocol.js`

`encodeFrame`:22, `FrameDecoder`:31 _class_, `push`:37, `hmacHex`:52, `safeEqualHex`:56, `parseHostHello`:62, `buildServerProof`:76, `verifyClientProof`:80, `buildClientProof`:88, `callerFromArgs`:96, `str`:110, `plainText`:118, `httpUrl`:124, `requestId`:131, `validateMessage`:183

## `electron/services/vaultBridge/rateLimit.js`

`RateLimiter`:4 _class_, `take`:19, `retryAfter`:36, `reset`:43, `createBridgeLimiters`:50

## `electron/services/vaultBridge/vaultHardening.js`

`kdfWork`:12, `isWeakKdf`:20, `backupVaultFile`:25, `upgradeWrapperIfWeak`:45

## `electron/services/vaultTransfer/vaultTransfer.js`

`sealVault`:10, `openVault`:18, `makeCode`:31, `parseCode`:33

## `electron/services/ytdlpOptions.js`

`parseTime`:9, `buildExtraArgs`:20

## `electron/vaultCrypto.js`

`toB64`:3, `fromB64`:7, `derivePasswordFromRecoveryWords`:11, `generateRecoveryWords`:21, `buildDefaultWordList`:34, `scryptKey`:143, `aesGcmEncrypt`:169, `aesGcmDecrypt`:177, `buildKdf`:190, `wrapVaultKeyWithPassword`:202, `unwrapVaultKeyWithPassword`:208, `encryptVaultData`:214, `decryptVaultData`:220

## `electron/ytdlp.js`

`platformAssetName`:13, `downloadWithRedirects`:19, `downloadTextWithRedirects`:40, `sha256File`:61, `fetchExpectedChecksum`:73, `ensureYtDlp`:87, `ensureFfmpeg`:127, `cancelActiveYtDlp`:189, `runYtDlp`:205

## `install.ps1`

`Start-DarkHubInstall`:6

## `native_cleaner/src/browsers.rs`

`is_sqlite`:20, `chromium`:25, `find`:44, `in_use`:78, `file_len`:91, `one`:95, `vacuum`:133

## `native_cleaner/src/files.rs`

`is_reparse`:10, `shred_file`:40, `delete_file`:72, `walk`:91, `run`:144

## `native_cleaner/src/main.rs`

`parse`:37, `get`:57, `flag`:60, `env_of`:65, `read_winapp2`:73, `read_ids`:82, `reg_exists`:88, `reg_sources`:99, `run`:106, `main`:157

## `native_cleaner/src/registry.rs`

`drop`:17, `wide`:22, `hive`:26, `split`:37, `open`:42, `exists`:49, `text`:61, `info`:71, `values`:79, `value`:97, `subkeys`:101, `delete_value`:115, `delete_tree`:119, `set`:124, `create`:130, `sz`:139, `esc`:145, `hex_list`:149, `value_line`:163, `write_reg_file`:202, `system`:232, `test`:256, `id`:283, `to_json`:286, `expand_env`:291, `absolute`:316, `missing`:322, `command_target`:330, `scan`:350, `clean`:415

## `native_cleaner/src/safety.rs`

`from_process`:32, `rooted`:71, `one`:95, `roots`:99, `check_rule`:125, `denied_programdata`:167, `is_protected_file`:180, `is_protected_pattern`:187, `is_protected_dir`:191, `norm`:196, `is_plain_absolute`:205, `depth_under`:211

## `native_cleaner/src/tests.rs`

`tmp`:12, `put`:19, `no_reg`:24, `wildcard_matching`:29, `rules_outside_expected_folders_are_refused`:39, `winapp2_parsing_detection_and_validation`:60, `protected_files_survive_and_shred_unlinks`:121, `shred_overwrites_before_unlink`:142, `builtin_targets_parse`:157, `make_db`:165, `browser_vacuum_shrinks_and_keeps_rows`:176, `values_of`:211, `command_lines`:218, `scan_backup_clean_and_restore`:227, `test_root_is_confined`:305, `rules_aimed_at_passwords_are_refused`:312

## `native_cleaner/src/util.rs`

`from`:18, `emit`:35, `wild_match`:43, `has_wild`:69, `seeded`:77, `fill`:81

## `native_cleaner/src/winapp2.rs`

`excluded`:124, `to_json`:135, `parse`:148, `category_of`:166, `expand`:184, `expand_wild`:207, `exists_wild`:234, `detected`:238, `build`:279, `load_all`:353

## `native_disk/src/carve.rs`

`get`:48, `u8`:64, `be16`:67, `be32`:70, `le32`:73, `le64`:76, `find`:80, `jpeg_len`:99, `png_len`:138, `gif_sub_blocks`:156, `gif_len`:169, `bmp_len`:200, `pdf_len`:209, `zip_len`:228, `zip_kind`:243, `sqlite_len`:263, `sevenz_len`:274, `mp4_len`:281, `measure`:318, `type_enabled`:345, `carve`:349

## `native_disk/src/copy.rs`

`mark`:24, `tolerant_read`:33, `copy_region`:68, `hash_region`:96, `surface_test`:122

## `native_disk/src/device.rs`

`size`:8, `sector_size`:10, `read_at`:12, `write_at`:14, `flush`:15, `total_sectors`:16, `open`:28, `create`:35, `pread`:43, `pread`:48, `pwrite`:53, `pwrite`:58, `read_full`:63, `write_full`:77, `size`:90, `sector_size`:93, `read_at`:96, `write_at`:99, `flush`:105, `read_sectors`:111, `read_bytes`:120, `parse`:143, `display`:154, `open_target`:162, `as_slice`:186, `as_mut_slice`:189

## `native_disk/src/main.rs`

`parse`:30, `get`:53, `flag`:56, `need`:59, `num`:62, `target`:65, `sector`:69, `system_disks`:74, `guard_write`:83, `region_of`:95, `plan_result`:110, `hex_rows`:123, `read_sector_cmd`:136, `write_sector_cmd`:171, `clone_cmd`:189, `finish_copy`:238, `run`:272, `main`:403

## `native_disk/src/parts.rs`

`u16le`:6, `u32le`:9, `u64le`:12, `parse_mbr`:34, `mbr_type_name`:48, `build_mbr`:65, `valid`:122, `guid_str`:127, `gpt_type_name`:137, `header_crc`:156, `read_gpt_at`:162, `parse_gpt_entries`:198, `relocate_header`:223, `read_gpt_state`:244, `detect_vbr`:277, `detect_fs`:313, `fs_kind`:336, `partitions`:357, `gpt_json`:397, `inspect`:411

## `native_disk/src/repair.rs`

`describe`:24, `save_backup`:44, `load_backup`:63, `apply`:90, `plan_restore_gpt`:117, `plan_fix_gpt_after_grow`:184, `scan_vbrs`:219, `plan_rebuild_mbr`:269, `plan_set_active`:322

## `native_disk/src/tests.rs`

`tmp`:15, `gpt_header`:23, `ntfs_vbr`:42, `build_gpt`:55, `open`:83, `inspect_reads_gpt_and_ntfs`:88, `restores_wiped_primary_gpt_and_protective_mbr`:104, `rebuilds_backup_gpt_from_primary`:136, `dry_run_plan_does_not_write`:150, `scan_finds_ntfs_from_backup_boot_sector_and_rebuilds_mbr`:164, `clone_to_larger_image_moves_gpt_backup_and_verifies`:191, `partition_region_and_image_roundtrip`:216, `guard_refuses_system_disk_and_unconfirmed_writes`:232, `jpeg`:242, `png`:251, `zip_docx`:265, `sqlite`:296, `pdf`:304, `carves_planted_files_with_exact_sizes`:309, `surface_test_maps_whole_image`:340

## `native_disk/src/util.rs`

`from`:20, `cancelled`:42, `reset_cancel`:47, `listen_for_cancel`:52, `emit`:64, `silent`:82, `elapsed`:85, `tick`:88, `event`:112, `hex`:119, `unhex`:123

## `native_disk/src/win.rs`

`ioctl`:31, `u32le`:52, `u64le`:55, `disk_path`:59, `open_query`:64, `geometry`:75, `bus_name`:106, `descriptor_string`:130, `device_info`:139, `wide`:164, `from_wide`:167, `volume_extents`:172, `volumes`:187, `system_disks`:220, `list_drives`:240, `disk_of_path`:271, `probe_locks`:282, `lock_volumes`:311, `open`:350, `size`:372, `sector_size`:375, `read_at`:378, `write_at`:396, `flush`:409

## `native_gpubench/src/gpu.rs`

`wndproc`:123, `heap_props`:130, `buffer_desc`:134, `tex_desc`:141, `create`:148, `barrier`:154, `uav_barrier`:169, `bytecode`:177, `compute_pso`:181, `graphics_pso`:186, `root_signature`:207, `place`:229, `loaded_modules`:237, `dot`:253, `sun_dir`:255, `frame_cb`:261, `cpu_handle`:391, `gpu_handle`:394, `write_descriptors`:399, `init_rt`:442, `wait_value`:522, `wait_idle`:530, `hwnd_raw`:537, `pump`:539, `ids_to`:551, `record`:558, `submit`:670, `collect`:682, `segment`:700, `capture`:737, `read_ldr`:756, `read_texture`:764, `drop`:795

## `native_gpubench/src/main.rs`

`say`:16, `u32s_b64`:22, `vectors`:29, `run`:45, `main`:141

## `native_gpubench/src/proof.rs`

`frame_root`:6, `pair`:10, `levels`:17, `merkle_root`:27, `merkle_path`:33, `hex`:45

## `native_gpubench/src/scene.rs`

`pcg`:14, `hash2`:20, `tri`:24, `box_at`:34, `camera`:50, `basis`:61

## `native_pacer/src/lib.rs`

`CreateWindowExA`:66, `DestroyWindow`:80, `timeBeginPeriod`:85, `timeEndPeriod`:86, `QueryPerformanceCounter`:90, `QueryPerformanceFrequency`:91, `VirtualProtect`:92, `CreateFileMappingW`:93, `OpenFileMappingW`:94, `MapViewOfFile`:95, `CloseHandle`:96, `GetCurrentProcessId`:97, `Sleep`:98, `LoadLibraryA`:99, `GetProcAddress`:100, `CreateThread`:101, `CreateWaitableTimerExW`:102, `SetWaitableTimer`:103, `WaitForSingleObject`:104, `get_qpc_ms`:218, `precision_wait`:228, `hist_recent`:254, `push_sample`:258, `compute_stats`:267, `publish`:317, `is_main_swapchain`:356, `perform_pacing`:407, `hooked_present`:478, `hooked_present1`:488, `map_named`:502, `setup_shared_memory`:519, `patch_slot`:547, `com_release`:560, `install_vtable_hooks`:571, `remove_vtable_hooks`:659, `init_thread`:671, `DllMain`:687, `reset`:729, `stats_come_only_from_real_samples`:735, `low01_unavailable_with_few_samples`:754, `telemetry_layout_matches_reader`:766

## `scripts/dev.mjs`

`argPage`:19, `say`:24, `killTree`:28, `killStaleDev`:37, `esc`:39, `waitForVite`:44, `tryOnce`:47, `prefix`:61, `startElectron`:74, `restartElectron`:91, `shutdown`:119

## `scripts/ext.mjs`

`$`:46, `show`:59

## `scripts/gpubench-check.mjs`

`u32s`:12, `next`:26, `send`:27

## `scripts/hub-docs.mjs`

`cell`:17, `value`:18, `builtinMarkdown`:20, `builtinJsonText`:85

## `src/App.tsx`

`pageFromHash`:57, `PageLoading`:62 _component_, `App`:77 _component_, `onHash`:92, `reportRenderError`:98, `renderPage`:102

## `src/components/DetailedHardwareInfo.tsx`

`HardwareInfo`:4 _type_, `gb`:14, `tempEntries`:19, `DetailedHardwareInfo`:33 _component_, `loadStaticInfo`:40, `empty`:123, `MetricGrid`:230 _component_, `Metric`:234 _component_

## `src/components/DevTracePanel.tsx`

`Entry`:7 _type_, `DevTracePanel`:10 _component_, `copy`:43, `summary`:44

## `src/components/EmbeddedSitePage.tsx`

`EmbeddedSitePageProps`:6 _type_, `EmbeddedSitePage`:19 _component_, `onLoad`:29, `onFail`:30, `reload`:46

## `src/components/ErrorBoundary.tsx`

`Props`:4 _type_, `State`:13 _type_, `isChunkLoadError`:20, `ErrorBoundary`:25 _class_, `getDerivedStateFromError`:31, `componentDidCatch`:35, `render`:50

## `src/components/ExtensionFrame.tsx`

`ExtensionFrame`:9 _component_, `onMessage`:30, `reply`:35

## `src/components/GuardianWidget.tsx`

`GuardianWidget`:5 _component_, `beep`:22, `refresh`:46, `disableOverlay`:91, `fmt`:108

## `src/components/HelpTip.tsx`

`HelpSection`:4 _type_, `HelpTipProps`:9 _type_, `HelpTip`:18 _component_

## `src/components/HotkeyCapture.tsx`

`HotkeyCapture`:10 _component_, `onKey`:18, `onMouse`:29, `stop`:37

## `src/components/OptimizationScoreCard.tsx`

`OptimizationScoreCardProps`:4 _type_, `OptimizationScoreCard`:9 _component_

## `src/components/OptimizerProgress.tsx`

`OptimizerProgressProps`:5 _type_, `OptimizerProgress`:11 _component_

## `src/components/ReleaseNotes.tsx`

`Text`:4 _component_, `ReleaseNotes`:19 _component_

## `src/components/SystemInfoCard.tsx`

`SystemInfoCardProps`:5 _type_, `tone`:11, `SystemInfoCard`:13 _component_

## `src/components/UpdaterOverlay.tsx`

`UpdateStage`:8 _type_, `UpdaterOverlay`:10 _component_, `handleEvent`:21, `initUpdater`:66, `handleStartDownload`:94, `handleApplyInstall`:112

## `src/components/darkos/DarkOSConfirmDialog.tsx`

`DarkOSConfirmDialogProps`:5 _type_, `DarkOSConfirmDialog`:19 _component_, `onKey`:35

## `src/components/darkos/DarkOSProgress.tsx`

`DarkOSProgress`:7 _component_

## `src/components/darkos/DarkOSReleaseCard.tsx`

`gb`:6, `newer`:7, `p`:8, `DarkOSReleaseCard`:18 _component_, `download`:28

## `src/components/darkos/DarkOSSystemPanel.tsx`

`LiveStats`:8 _type_, `Metric`:11 _component_, `Row`:21 _component_, `fmtUptime`:34, `UpdState`:42 _type_, `DarkOSSystemPanel`:44 _component_, `tick`:56, `start`:71, `stop`:72, `onVis`:73, `reinstallEdge`:94, `updaterCall`:137, `checkUpdates`:147, `downloadUpdate`:148, `installUpdate`:149, `toggleStartup`:162, `applyPower`:187, `gb`:215

## `src/components/darkos/DarkOSUsbCard.tsx`

`gb`:6, `Hash`:8 _type_, `DarkOSUsbCard`:14 _component_, `api`:16, `loadDisks`:28, `pickIso`:46, `verify`:51, `write`:61, `errorText`:73, `stepLabel`:81

## `src/components/drivers/MissingDrivers.tsx`

`api`:9, `fill`:10, `mb`:12, `ItemState`:14 _type_, `MissingDrivers`:18 _component_, `itemTitle`:75, `toggle`:77, `runInstall`:83, `reasonText`:110, `sourceText`:116, `statusLine`:118, `itemRow`:139, `wuHintKey`:350

## `src/components/gpubench/RankingTop.tsx`

`RankingTop`:8 _component_, `label`:26

## `src/components/gpubench/RunOverlay.tsx`

`RunOverlay`:13 _component_, `send`:25

## `src/components/gpubench/StressPanel.tsx`

`num`:9, `StabilityChart`:12 _component_, `y`:14, `best`:16, `StressPanel`:33 _component_, `api`:42, `start`:51, `remove`:64, `loadName`:66, `verdictName`:67, `verdictClass`:68, `reasonText`:69

## `src/components/hub/HubApproval.tsx`

`Approval`:7 _type_, `HubApproval`:10 _component_, `answer`:19

## `src/components/hub/HubPreview.tsx`

`hubText`:6, `RiskBadge`:8 _component_, `TierBadge`:15 _component_, `HubPreview`:23 _component_

## `src/components/icons/IconSheet.tsx`

`IconSheet`:4 _component_

## `src/components/icons/index.tsx`

`IconProps`:9 _type_, `Node`:15 _type_, `cut`:18, `Base`:24 _component_, `icon`:50, `Icon`:51 _component_

## `src/components/library/GameCard.tsx`

`GameCardProps`:6 _type_, `GameCard`:14 _component_, `fetchCover`:36, `onImageError`:50, `formatTime`:61

## `src/components/library/GameDiscoveryModal.tsx`

`DiscoveredGame`:5 _type_, `GameDiscoveryModalProps`:12 _type_, `GameDiscoveryModal`:21 _component_

## `src/components/library/GameEditorModal.tsx`

`GameEditorModalProps`:7 _type_, `GameEditorModal`:17 _component_, `handleTagsChange`:33, `updateOptiscaler`:39, `handleProfileChange`:46, `handleSetDefaultProfile`:55, `addProfile`:62, `removeProfile`:71, `pick`:80, `handleSave`:85

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

## `src/components/monitor/PowerPanel.tsx`

`api`:6, `f`:7, `Row`:10 _component_, `Block`:19 _component_, `PowerSettingsForm`:31 _component_, `num`:33, `PowerPanel`:78 _component_, `set`:93, `cpuVal`:109, `money`:111, `kwh`:112

## `src/components/network/LatencyLab.tsx`

`net`:6, `Sample`:13 _type_, `stats`:16, `r1`:18, `fmt`:34, `Metric`:36 _component_, `usePresets`:46, `LatencyChart`:56 _component_, `x`:62, `y`:63, `LiveLatencyPanel`:86 _component_, `start`:98, `stop`:119, `pickPreset`:122, `RouteMtuPanel`:186 _component_, `trace`:194, `findMtu`:201, `BufferbloatPanel`:283 _component_, `run`:289, `gradeTone`:294, `DnsRow`:337 _type_, `DnsBenchPanel`:339 _component_, `opt`:341, `bench`:353, `apply`:360, `undo`:368, `TweakDef`:440 _type_, `LatencyTweaksPanel`:442 _component_, `act`:457, `apply`:465, `restore`:466, `propText`:469, `card`:479

## `src/components/optimizer/WindowsToolsPanel.tsx`

`FeatureState`:6 _type_, `api`:15, `WindowsToolsPanel`:18 _component_, `exec`:37, `toggleFeature`:49, `stateLabel`:55

## `src/components/optimizer/WuDiagnosis.tsx`

`Finding`:5 _type_, `fill`:7, `WuDiagnosis`:13 _component_, `diagnose`:19, `fix`:28

## `src/components/overlay/OverlayStage.tsx`

`ok`:14, `drawCanvases`:17, `OverlayStage`:58 _component_, `down`:106, `move`:107, `up`:112

## `src/components/pstools/CustomScriptRunner.tsx`

`api`:7, `Line`:9 _type_, `CustomScriptRunner`:12 _component_, `Ev`:37 _type_, `start`:66, `stop`:83, `flash`:88, `saveSnippet`:89, `loadSnippet`:94, `del`:95

## `src/components/pstools/HostsEditor.tsx`

`api`:7, `HostsEditor`:10 _component_, `askSave`:33, `save`:40, `loadBackup`:50

## `src/components/pstools/ResultView.tsx`

`View`:10 _type_, `api`:12, `Props`:14 _type_, `ResultView`:24 _component_, `flash`:49, `textBody`:50, `copy`:54, `doExport`:60, `reveal`:67

## `src/components/pstools/ToolCategory.tsx`

`api`:11, `Pending`:13 _type_, `ToolCategory`:16 _component_, `setVal`:36, `execute`:42, `run`:60, `togglePreview`:76, `upgrade`:82, `badge`:88

## `src/components/pstools/ToolForm.tsx`

`Props`:6 _type_, `api`:14, `ToolForm`:17 _component_, `label`:19, `errText`:20, `pickFolder`:27, `pickSave`:32

## `src/components/pstools/psSchema.ts`

`ParamType`:4 _type_, `ParamDef`:5 _type_, `ToolDef`:18 _type_, `ParamValues`:32 _type_, `toolsIn`:36, `toolById`:37, `defaultsFor`:39, `flagsFor`:45, `hit`:46, `validateParam`:54, `validateAll`:89, `toPayload`:99, `columnsOf`:108, `cellText`:114, `rowsToCsv`:120, `esc`:122

## `src/components/recovery/CarvingManager.tsx`

`CarvingManager`:14 _component_, `pick`:30, `start`:35, `toggle`:43

## `src/components/recovery/CloneWizard.tsx`

`Mode`:7 _type_, `diskTarget`:9, `CloneWizard`:15 _component_, `dryRun`:57, `run`:63, `pickImage`:71, `DriveSelect`:76 _component_, `PartSelect`:90 _component_

## `src/components/recovery/HeaderGuardModal.tsx`

`ApplyResult`:5 _type_, `HeaderGuardModal`:12 _component_, `onKey`:27, `apply`:35, `WriteDiff`:108 _component_, `grid`:122

## `src/components/recovery/PartitionManager.tsx`

`Selection`:10 _type_, `Action`:11 _type_, `PartitionManager`:14 _component_, `roleName`:38, `review`:50, `Review`:151 _type_, `FsFields`:153 _component_, `CreateForm`:167 _component_, `FormatForm`:197 _component_, `ResizeForm`:211 _component_, `LetterForm`:240 _component_

## `src/components/recovery/PartitionMapBar.tsx`

`PartitionMapBar`:10 _component_

## `src/components/recovery/PartitionPlanModal.tsx`

`PartitionPlanModal`:10 _component_, `onKey`:18, `apply`:27, `bar`:37

## `src/components/recovery/SectorHexViewer.tsx`

`SectorHexViewer`:8 _component_, `go`:26, `ascii`:30, `Field`:138 _component_

## `src/components/recovery/partitionLayout.ts`

`kindOf`:5, `layoutOf`:13, `alignGap`:23, `freeLetters`:28

## `src/components/recovery/rescueUtils.tsx`

`api`:4, `fmtBytes`:6, `fmtEta`:13, `ProgressEv`:30 _type_, `JobProgress`:32 _component_, `ErrorLine`:56 _component_

## `src/components/releaseNotesParser.ts`

`Inline`:4 _type_, `Block`:5 _type_, `decode`:14, `htmlToMarkdown`:20, `looksHtml`:32, `parseInline`:35, `cells`:52, `parseNotes`:54, `flush`:59

## `src/components/security/BlocklistsPanel.tsx`

`FeedSource`:7 _type_, `Props`:12 _type_, `SourceRow`:34 _component_, `BlocklistsPanel`:62 _component_, `toggle`:68, `updateMsg`:73, `sectionState`:79, `enabledCount`:98

## `src/components/security/HardeningPanel.tsx`

`Item`:6 _type_, `Props`:11 _type_, `HardeningPanel`:40 _component_, `statusLabel`:48

## `src/components/security/ProtectiveDnsPanel.tsx`

`ProtectiveDnsPanel`:14 _component_, `opt`:19, `load`:21, `blocks`:28, `undo`:42

## `src/components/security/ui.tsx`

`Translate`:4 _type_, `SectionHead`:6 _component_, `StatRow`:16 _component_, `OnOff`:28 _component_, `Skel`:34 _component_, `fmtDate`:36, `fmtNum`:42, `errorText`:47

## `src/components/setup/RestoreComponentsPanel.tsx`

`RestoreComponentsPanel`:14 _component_, `api`:25, `load`:27, `errorText`:36, `restore`:38, `restoreAll`:61, `pickIso`:63, `badge`:68

## `src/components/ui/PageHeader.tsx`

`PageHeader`:5 _component_

## `src/components/vault/BrowserExtensionSection.tsx`

`formatDate`:9, `BrowserExtensionSection`:19 _component_, `run`:47, `openFolder`:54

## `src/components/vault/VaultTransferSection.tsx`

`VaultTransferSection`:6 _component_, `api`:13, `send`:15, `cancel`:24, `receive`:30, `copy`:39

## `src/devtools/ColorPicker.tsx`

`RGBA`:5 _type_, `EyeDropperLike`:12 _type_, `getEyeDropper`:13, `loadHistory`:15, `saveHistory`:23, `parseHsv`:27, `parseCmykText`:32, `ColorField`:39 _component_, `ColorPicker`:67 _component_, `pickSv`:96, `eyedrop`:104, `onSvKey`:117, `badge`:213

## `src/devtools/TextToolViews.tsx`

`EncodeKind`:5 _type_, `EncodeTool`:10 _component_, `IdTool`:46 _component_, `make`:50, `regen`:52, `JwtTool`:82 _component_, `fmt`:89, `RegexTool`:120 _component_, `CronTool`:160 _component_, `LoremTool`:190 _component_, `num`:196, `PasswordTool`:211 _component_, `regen`:216, `update`:217, `meter`:219

## `src/devtools/UnitConverter.tsx`

`Mode`:6 _type_, `LinearConverter`:14 _component_, `set`:19, `swap`:26, `unitLabel`:28, `row`:29, `BaseConverter`:79 _component_, `TimestampConverter`:110 _component_, `changeUnit`:134, `UnitConverter`:171 _component_

## `src/devtools/color.ts`

`RGB`:3 _type_, `RGBA`:4 _type_, `HSL`:5 _type_, `HSV`:6 _type_, `CMYK`:7 _type_, `clamp`:9, `r2`:10, `rgbToHsv`:12, `hsvToRgb`:26, `rgbToHsl`:40, `hslToRgb`:49, `rgbToCmyk`:55, `cmykToRgb`:62, `hex2`:67, `rgbaToHex`:70, `parseHex`:75, `n`:80, `parseColor`:85, `ch`:98, `formatRgb`:104, `formatHsl`:107, `formatHsv`:113, `formatCmyk`:114, `luminance`:117, `f`:118, `contrastRatio`:122, `wcagLevels`:127, `flatten`:132

## `src/devtools/textTools.ts`

`base64Encode`:4, `base64Decode`:11, `htmlEncode`:19, `htmlDecode`:23, `EncodeKind`:34 _type_, `encodeText`:36, `decodeText`:43, `jsonFormat`:50, `jsonMinify`:51, `ShaAlg`:54 _type_, `shaHex`:56, `uuidV4`:62, `ulid`:73, `ulidTime`:84, `JwtParts`:92 _type_, `decodeJwt`:94, `charsetSize`:109, `entropyBits`:119, `strengthLabel`:124, `PwOptions`:132 _type_, `generatePassword`:134, `lorem`:153, `rnd`:155, `RegexSegment`:172 _type_, `regexSegments`:174, `expandCronField`:200, `num`:203, `p2`:222, `join`:223, `explainCron`:226, `full`:233, `nextCronRuns`:249

## `src/devtools/ui.tsx`

`useDevT`:6, `copyText`:11, `CopyButton`:30 _component_

## `src/devtools/units.ts`

`UnitDef`:3 _type_, `UnitCategory`:13 _type_, `lin`:21, `findCategory`:104, `convert`:108, `formatNumber`:118, `parseBase`:132, `formatBase`:146, `TsUnit`:151 _type_, `unixToIso`:153, `isoToUnix`:158, `unixToLocal`:165, `p`:168

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

`I18nContextValue`:4 _type_, `readInitialLang`:15, `I18nProvider`:23 _component_, `useI18n`:105

## `src/i18n/messages.ts`

`SupportedLang`:31 _type_, `LanguageOption`:33 _type_, `getTranslationTemplate`:3436

## `src/i18n/overlayEditorMessages.ts`

`prefixed`:17

## `src/i18n/powerMessages.ts`

`prefixed`:20

## `src/layouts/MainLayout.tsx`

`MainLayoutProps`:17 _type_, `NavSection`:23 _type_, `MainLayout`:33 _component_, `handleMenuClick`:150, `handleNavKeyDown`:173, `navButton`:188, `rail`:194

## `src/lib/cipherTools.ts`

`fromUtf8`:5, `bytesToBase64`:7, `base64ToBytes`:12, `base32Encode`:19, `base32Decode`:28, `base58Encode`:42, `base58Decode`:50, `shiftLetters`:72, `atbash`:76, `rot47`:80, `vigenere`:81, `htmlEncode`:87, `htmlDecode`:90, `hexToBytes`:97, `bytesToHex`:102, `TextMode`:104 _type_, `transform`:109, `caesarBruteForce`:148, `CipherMode`:152 _type_, `gcmKey`:156, `cipher`:166, `HashName`:190 _type_, `hash`:192, `decodeJwt`:206, `identify`:213

## `src/lib/codeExamples.ts`

`CodeLanguage`:4 _type_, `ExampleId`:5 _type_, `languageForFile`:13

## `src/lib/extensions.ts`

`extPageId`:5, `parseExtPage`:6, `extensionsChanged`:12, `useExtensions`:15, `load`:19, `textIn`:28

## `src/lib/shutterSound.ts`

`playShutter`:5

## `src/pages/AdvancedSecurity.tsx`

`SecurityTab`:13 _type_, `AdvancedSecurity`:15 _component_, `loadPhishingStatus`:43, `loadCommunityRulesStats`:47, `run`:59, `handleScan`:74, `handleKill`:87, `handleDisableLegacyShield`:99, `handleScanUrl`:112, `handleScanNetworkConnections`:128, `handleImportCommunityRules`:142, `handleResetCommunityRules`:163, `handleDownloadRulesTemplate`:177, `handleAuditTracking`:193, `trackingAction`:207, `loadTrackingDomains`:220, `saveTrackingDomains`:227, `go`:245, `sevText`:257, `tableSkeleton`:258

## `src/pages/AutoClicker.tsx`

`AutoClicker`:11 _component_, `refresh`:39, `handleStart`:94, `handleStop`:111, `handleSaveHotkey`:125, `registerTestClick`:141, `handleResetTester`:152, `runSelfDiagnostic`:160

## `src/pages/Benchmark.tsx`

`CompareResult`:7 _type_, `fmt`:10, `Benchmark`:12 _component_, `api`:25, `metricName`:26, `load`:37, `run`:53, `remove`:69, `runLabel`:77, `warningName`:82

## `src/pages/Cleaner.tsx`

`api`:8, `Tab`:9 _type_, `Cleaner`:18 _component_, `ConfirmModal`:64 _component_, `onKey`:72, `Stat`:99 _component_, `FilesTab`:110 _component_, `warnOf`:137, `toggle`:151, `runScan`:153, `runClean`:161, `BrowsersTab`:285 _component_, `run`:293, `status`:302, `RegistryTab`:383 _component_, `apply`:407, `restore`:412, `DefsTab`:502 _component_, `update`:507, `remove`:515

## `src/pages/DarkOSCenter.tsx`

`TabId`:19 _type_, `Banner`:21 _type_, `ConfirmState`:23 _type_, `api`:42, `Section`:45 _component_, `Figure`:59 _component_, `Empty`:66 _component_, `DarkOSCenter`:70 _component_, `current`:99, `profileName`:168, `describe`:169, `toggleChange`:171, `toggleGroup`:192, `askProfile`:199, `askRestoreAll`:226, `askRestoreSnapshot`:234, `renderOverview`:323, `renderChanges`:361, `renderProfiles`:443, `renderRecovery`:497, `renderSnapshots`:534, `renderFailures`:578, `renderDiagnostics`:602, `notice`:625

## `src/pages/Dashboard.tsx`

`formatBytes`:18, `timeAgo`:27, `Skel`:47 _component_, `Reading`:52 _component_, `MetricCell`:59 _component_, `DashboardProps`:91 _type_, `Dashboard`:95 _component_, `handleOptimizeRam`:243, `handleCleanJunk`:273, `handleCreateRestorePoint`:301, `handleRepairWindows`:323, `handleResolveSecurity`:343, `handleOpenWindowsSecurity`:354, `ExtensionWidgets`:705 _component_

## `src/pages/Decryption.tsx`

`Mode`:7 _type_, `Icon`:8 _type_, `Decryption`:15 _component_, `fail`:52, `run`:58, `copy`:72, `clearAll`:73, `guessLabel`:75

## `src/pages/DevTools.tsx`

`ToolId`:12 _type_, `DevTools`:14 _component_, `runJson`:33, `generateHashes`:46

## `src/pages/DiskRescue.tsx`

`Tab`:14 _type_, `Guard`:15 _type_, `diskOf`:17, `DiskRescue`:19 _component_, `openImage`:57, `HealthTab`:126 _component_, `runSurface`:142, `Stat`:244 _component_, `GuardTab`:255 _component_, `wrap`:268, `planGpt`:274, `scan`:281, `planMbr`:286, `backup`:294, `restore`:299, `copyState`:310, `BootTab`:365 _component_, `planActive`:372

## `src/pages/DllInjector.tsx`

`DllInjector`:6 _component_, `handleSelectDll`:13, `handleInject`:29

## `src/pages/Dlss5Manager.tsx`

`up`:7, `legacy`:8, `GameRow`:10 _type_, `Tier`:11 _type_, `dlss5Tier`:14, `Dlss5Manager`:27 _component_, `run`:47, `scan`:60, `replaceRow`:65, `update`:66, `restore`:71, `addFolder`:77, `updateAll`:89

## `src/pages/Downloads.tsx`

`formatBytes`:9, `formatEta`:16, `Bytes`:24 _component_, `Downloads`:29 _component_, `onVisible`:71, `flash`:79, `handleAdd`:86, `saveSettings`:116, `chooseDir`:121, `statusBadge`:126

## `src/pages/DriverCenter.tsx`

`CameraState`:9 _type_, `Adapter`:11 _type_, `api`:13, `DriverCenter`:15 _component_, `openOfficial`:68, `field`:101

## `src/pages/ExtensionPage.tsx`

`ExtensionPage`:8 _component_

## `src/pages/FileConverter.tsx`

`ConvertCategory`:19 _type_, `FormatOption`:21 _type_, `FileConverter`:73 _component_, `detectCategory`:86, `getDir`:95, `applyFiles`:100, `handlePickFiles`:117, `handlePickOutputDir`:139, `handleConvert`:148, `removeFile`:213, `clearQueue`:218, `chip`:236

## `src/pages/FramePacer.tsx`

`FramePacerPage`:14 _component_, `handleToggleEngine`:153, `handleUpdateFps`:171, `handleUpdateMode`:178, `handleToggleOverlay`:185, `handleToggleClickThrough`:192

## `src/pages/GameOverlay.tsx`

`n`:10, `GameOverlay`:12 _component_, `api`:20, `metricLabel`:22, `set`:52, `toggle`:59, `toggleMetric`:68, `PlacementPicker`:203 _component_, `ratio`:206, `spotLabel`:207, `nudge`:212

## `src/pages/GpuBench.tsx`

`num`:10, `GpuBench`:12 _component_, `api`:25, `load`:26, `errorText`:43, `run`:51, `link`:62, `unlink`:71, `remove`:72, `testName`:78, `statusName`:79, `statusClass`:85, `phaseText`:86

## `src/pages/Home.tsx`

`HomeProps`:9 _type_, `Home`:13 _component_, `fetchInfo`:28, `handleLaunchPGE`:70, `read`:93, `gb`:99

## `src/pages/ImageTextExtractor.tsx`

`ImageTextExtractor`:6 _component_, `handlePaste`:24, `handleSelectImage`:52, `handleFileInputChange`:74, `handleDragOver`:90, `handleDragLeave`:95, `handleDrop`:99, `triggerOcr`:116, `handleCopyText`:143, `handlePasteFromClipboard`:150, `captureArea`:171, `rerunOcr`:180

## `src/pages/Juuzou.tsx`

`Juuzou`:5 _component_

## `src/pages/Kakugan.tsx`

`api`:7, `brl`:8, `Kakugan`:11 _component_, `setPref`:23, `act`:60, `open`:67, `LoginBox`:139 _component_, `submit`:145, `Plans`:169 _component_, `Patch`:192 _type_, `PlanCard`:194 _component_, `AccountRow`:229 _component_, `run`:238, `GamesEditor`:295 _component_, `add`:310, `SteamLoginModal`:340 _component_, `poll`:349

## `src/pages/Library.tsx`

`Library`:11 _component_, `refresh`:34, `discoverGames`:64, `importDiscovered`:83, `startEdit`:109, `saveEditing`:120, `removeGame`:144, `launch`:159, `pickExeForEditor`:207, `pickWorkingDirForEditor`:220

## `src/pages/LuluFlix.tsx`

`LuluFlix`:5 _component_

## `src/pages/Maintenance.tsx`

`Switch`:7 _component_, `mb`:17, `Maintenance`:19 _component_, `api`:23, `load`:25, `title`:31, `desc`:38, `update`:46, `runNow`:51, `summary`:58

## `src/pages/MetaDataEditor.tsx`

`Tab`:9 _type_, `Status`:10 _type_, `fmtSize`:30, `baseName`:31, `dirName`:32, `extOf`:33, `stemOf`:34, `MetaDataEditor`:36 _component_, `resetEdits`:57, `pickFile`:77, `onDrop`:82, `buildRequest`:99, `describeChecks`:103, `save`:109, `applyToOthers`:146, `pickCover`:170, `applyFsProps`:175, `removeStream`:185, `renderField`:196, `set`:200

## `src/pages/NetworkTools.tsx`

`NetworkTools`:7 _component_, `runPing`:30, `runPortScan`:48, `runSpeedTest`:66, `runDiag`:105

## `src/pages/OptiScalerManager.tsx`

`OptiScalerConfig`:31 _type_, `GameItem`:43 _type_, `Choice`:57 _type_, `dirnameFromPath`:114, `basename`:118, `OptiScalerManagerProps`:122 _type_, `OptiScalerManager`:126 _component_, `refreshLibraryAndSteam`:179, `makePayload`:262, `runAnalyzeForGame`:299, `handleSelectExe`:346, `handleRemoveManualGame`:389, `handleCreateManualBackup`:403, `handleDeleteBackup`:421, `handleApply`:438, `handleRestore`:470, `updateRelease`:507

## `src/pages/Optimizer.tsx`

`OptimizerTab`:12 _type_, `LogLevel`:13 _type_, `LogLine`:14 _type_, `RiskLevel`:15 _type_, `ConfirmRequest`:16 _type_, `RunResult`:17 _type_, `TweakItem`:20 _type_, `api`:39, `fmt`:42, `fmtBytes`:45, `tabBtn`:64, `segBtn`:70, `SkeletonRows`:78 _component_, `StatusPill`:93 _component_, `HeroButton`:101 _component_, `HagsButtons`:118 _component_, `Optimizer`:142 _component_, `addLog`:224, `askConfirm`:231, `answerConfirm`:237, `loadInitialData`:257, `refreshStatus`:293, `runOps`:364, `runOne`:378, `withBusy`:385, `reportResult`:402, `flash`:409, `handleOptimizeRAM`:414, `handleCleanTempFiles`:422, `handleFlushDNS`:430, `handleSetPowerPlan`:438, `handleOptimizeAudioLatency`:446, `handleCreateRestorePoint`:453, `handleApplyAdvancedNetwork`:465, `handleRevertAdvancedNetwork`:480, `loadPrograms`:489, `handleUninstallProgram`:503, `toggleGroup`:645, `needsConfirm`:653, `riskBadge`:655, `confirmItems`:661, `applyItems`:677, `revertItems`:692, `afterChange`:707, `handleApplyItem`:711, `handleRevertItem`:723, `handleRunBatch`:732, `handleApplyProfile`:768, `handleSafeOptimization`:790, `handleRevertAll`:813, `handleRestoreStreamingDefaults`:866, `loadHagsStatus`:879, `handleToggleHags`:895, `handleRevertHags`:903, `loadGpuData`:911, `handleBrowseGpuApp`:924, `handleSetGpuPreference`:935, `handleRemoveGpuPreference`:945, `loadProcesses`:952, `handleSetProcessPriority`:966, `loadBloatware`:991, `handleRemoveBloatware`:1005, `loadStartupItems`:1030, `handleToggleStartupItem`:1044, `loadDefenderStatus`:1053, `handleApplyDefender`:1065, `handleRestoreImageDefender`:1085, `handleOpenTamper`:1101, `refreshDnsState`:1112, `handleRunDnsBenchmark`:1120, `isTrustedDns`:1142, `handleApplyDns`:1144, `handleUndoDns`:1164, `profileRisk`:1200, `sectionHead`:1210, `searchField`:1220, `emptyRow`:1233

## `src/pages/OverlayEditor.tsx`

`api`:8, `encode`:13, `decode`:14, `newId`:18, `Row`:22 _component_, `ColorField`:31 _component_, `NumField`:41 _component_, `MetricSelect`:51 _component_, `Section`:64 _component_, `StyleEditor`:78 _component_, `set`:80, `ItemEditor`:113 _component_, `set`:116, `WidgetEditor`:141 _component_, `set`:143, `ThemeEditor`:226 _component_, `set`:228, `OverlayEditor`:263 _component_, `change`:305, `setWidget`:307, `move`:308, `add`:313, `save`:327, `switchTo`:336, `create`:340, `duplicate`:344, `remove`:349, `exportCode`:354, `doImport`:358, `typeName`:370, `typeLabel`:371

## `src/pages/PasswordManager.tsx`

`VaultEntry`:9 _type_, `calculatePasswordStrength`:18, `copySecretWithAutoClear`:39, `generateStrongPassword`:50, `getRandomChar`:59, `PasswordManager`:109 _component_, `refreshStatus`:146, `refreshEntries`:156, `handleInit`:188, `handleUnlock`:221, `handleUnlockWithRecovery`:241, `handleLock`:261, `handleAdd`:278, `handleRemove`:301, `toggleReveal`:323, `handleCopyPassword`:347, `handleExport`:361, `handleImport`:378, `StrengthMeter`:845 _component_

## `src/pages/PowerShellTools.tsx`

`TabId`:13 _type_, `PolicyResult`:17 _type_, `ScriptItem`:18 _type_, `RunResult`:19 _type_, `api`:21, `PowerShellTools`:31 _component_, `selectTab`:51, `runScript`:90, `openElevated`:106, `sigLabel`:124, `policyNote`:125, `skeletonRows`:149

## `src/pages/Presets.tsx`

`api`:9, `Tab`:10 _type_, `Remote`:11 _type_, `Presets`:13 _component_, `take`:76, `inspect`:82, `openFile`:89, `done`:95, `install`:106, `uninstall`:113, `update`:123, `doExport`:132, `copy`:141, `saveServer`:143, `setMcpOn`:149

## `src/pages/Realtime.tsx`

`api`:7, `Switch`:12 _component_, `Stat`:21 _component_, `gb`:28, `time`:29, `Realtime`:31 _component_, `update`:61, `run`:66, `addRule`:91, `addFolder`:98, `describe`:103

## `src/pages/SaveBackup.tsx`

`size`:7, `SaveBackup`:9 _component_, `api`:18, `load`:20, `loadVersions`:33, `toggle`:34, `backup`:40, `backupAll`:49, `restore`:58, `removeVersion`:70, `setSetting`:78, `pickRoot`:82, `addCustom`:83, `versionLabel`:91

## `src/pages/Settings.tsx`

`SettingsPage`:9 _component_, `saveLiveServices`:64, `saveWindowBehavior`:83, `saveStartupBehavior`:104, `Status`:364 _type_, `StatusLine`:366 _component_, `SettingsGroup`:376 _component_, `SettingRow`:388 _component_, `ResourceUsageSection`:410 _component_, `UpdateManagerSection`:463 _component_, `loadStatus`:473, `handleCheck`:504

## `src/pages/SetupHub.tsx`

`SetupHub`:242 _component_, `toggleApp`:262, `toggleCategory`:268, `applyPreset`:278, `handleInstallApps`:341, `detectHardware`:370, `toggleOpen`:491, `joinParts`:744, `HardwareCard`:746 _component_, `getGpuDriverLinks`:787, `getCpuChipsetLinks`:805, `getMoboDriverLinks`:818

## `src/pages/Share.tsx`

`api`:8, `LinkRow`:13 _component_, `toggleQr`:18, `fmtBytes`:53, `HotkeyField`:56 _component_, `MonitorSelect`:67 _component_, `Share`:85 _component_, `setConfig`:128, `copy`:133, `report`:137, `onDrop`:142, `expiresIn`:146, `capture`:150

## `src/pages/SpaceSniffer/TreemapCanvas.tsx`

`INK`:6 _component_, `fill`:17, `fitText`:25, `Props`:33 _type_, `TreemapCanvas`:53 _component_, `pick`:173

## `src/pages/SpaceSniffer/diskCategories.ts`

`DiskCategory`:4 _type_, `oklch`:21, `categoryFill`:29, `startsWith`:74, `extOf`:79, `pathSegments`:85, `classifyPath`:97, `isSafeToCleanHint`:155, `isProtected`:156, `joinPath`:159

## `src/pages/SpaceSniffer/index.tsx`

`api`:13, `fmtDate`:18, `fmtInt`:19, `fmtTime`:20, `ColorMode`:22 _type_, `readMode`:23, `DiskMap`:26 _component_, `start`:101, `pickFolder`:108, `setColorMode`:120, `act`:156, `setTag`:166, `trash`:173, `walk`:189, `walk`:205, `walk`:219, `onKey`:255

## `src/pages/SpaceSniffer/treemap.ts`

`Cell`:4 _type_, `squarify`:16, `layoutTree`:47, `visit`:49, `hitTest`:66, `formatBytes`:74

## `src/pages/StartupManager.tsx`

`ListResult`:7 _type_, `Tab`:8 _type_, `Switch`:10 _component_, `secs`:19, `StartupManager`:21 _component_, `api`:31, `refresh`:32, `toggle`:45, `undo`:56

## `src/pages/SystemMonitor.tsx`

`formatBytes`:19, `PropertyRow`:28 _component_, `Skel`:39 _component_, `toneFor`:44, `loadBar`:53, `SectionBlock`:101 _component_, `TabType`:113 _type_, `toFixedSafe`:115, `formatSource`:120, `isVirtualNet`:134, `SystemMonitor`:140 _component_, `fetchUsage`:203, `handleBenchmark`:233, `generateReport`:254, `handleTabRefresh`:270, `renderTabs`:277, `renderTabLoadingState`:346, `renderTabErrorState`:362, `renderContent`:376, `norm`:560, `getTempStyle`:618

## `src/pages/TextEditor.tsx`

`Runtimes`:8 _type_, `RunResult`:9 _type_, `TextEditor`:19 _component_, `api`:33, `loadRuntimes`:34, `handleOpen`:37, `handleSave`:65, `handleNew`:88, `loadExample`:90, `run`:102, `onKeyDown`:116, `outcome`:132

## `src/pages/TextSummarizer.tsx`

`splitSentences`:67, `tokenize`:74, `summarize`:83, `TextSummarizer`:109 _component_, `handleOpen`:119, `handleSummarize`:145

## `src/pages/UltraLowLatency.tsx`

`LatencyPayload`:8 _type_, `Skel`:15 _component_, `Check`:19 _component_, `UltraLowLatency`:31 _component_, `markDirty`:84, `enableStable`:89, `toggleStable`:115, `refresh`:120, `pickExe`:156, `persistConfig`:169, `save`:193, `enable`:208, `disable`:228, `boostNow`:243, `buildAcceleratorFromEvent`:259, `setMode`:302, `num`:309, `pct`:310, `dirtyThen`:319

## `src/pages/UsbControl.tsx`

`Switch`:7 _component_, `gb`:19, `UsbControl`:21 _component_, `api`:29, `load`:31, `kindLabel`:48, `toggle`:54, `keep`:66, `policy`:72, `eject`:80

## `src/pages/YoutubeDownloader.tsx`

`DownloadPreset`:23 _type_, `DownloadProgressState`:35 _type_, `VideoExtraOptions`:45 _type_, `YoutubeDownloader`:71 _component_, `patchExtra`:88, `toggleSponsor`:93, `handlePickCookies`:120, `handleClearCookies`:137, `handleChangeBrowserCookies`:146, `handleChangeClient`:152, `handleChangeSleep`:158, `handleSearch`:164, `handleCancelDownload`:190, `handleDownload`:202, `formatDuration`:264, `segBtn`:288

## `src/pages/metadata/MetaxFilePanel.tsx`

`Props`:6 _type_, `pad`:14, `toLocalInput`:16, `fromLocalInput`:21, `MetaxFilePanel`:36 _component_, `apply`:52

## `src/pages/metadata/MetaxTagsPanel.tsx`

`Props`:6 _type_, `MetaxTagsPanel`:13 _component_, `toggle`:27

## `src/pages/metadata/metaxTypes.ts`

`MetaxFieldKind`:3 _type_, `MetaxField`:5 _type_, `MetaxTag`:12 _type_, `MetaxGroup`:20 _type_, `MetaxZone`:26 _type_, `MetaxFsInfo`:33 _type_, `MetaxDetect`:48 _type_, `MetaxBackend`:58 _type_, `MetaxInfo`:60 _type_, `MetaxReadResult`:76 _type_, `MetaxWriteRequest`:78 _type_, `MetaxCheck`:90 _type_, `MetaxWriteResult`:98 _type_

## `src/types/darkos.ts`

`DarkOSProfileId`:4 _type_, `DarkOSCatalogEntry`:6 _type_, `DarkOSManifestChange`:20 _type_, `DarkOSManifest`:26 _type_, `DarkOSSnapshot`:35 _type_, `DarkOSChangeResult`:37 _type_, `DarkOSChangeResponse`:47 _type_, `DarkOSReadResponse`:61 _type_, `DarkOSInfo`:63 _type_, `DarkOSRunEvent`:76 _type_, `DarkOSAPI`:86 _type_, `DarkOSUsbDisk`:117 _type_, `DarkOSIso`:118 _type_, `DarkOSRelease`:120 _type_

## `src/utils/darkosData.ts`

`DarkOSRow`:15 _type_, `mergeChanges`:26, `countStatuses`:60, `isOn`:66, `profileDiff`:69, `RemovedApp`:81 _type_, `normalizeRemovedApps`:83, `DarkOSFailure`:95 _type_, `normalizeFailures`:97, `normalizeReboot`:106, `normalizeSnapshots`:113

## `src/utils/hotkey.ts`

`keyFromCode`:16, `withModifiers`:25, `keyFromMouseButton`:30, `isBareKey`:34

## `src/utils/visibleInterval.ts`

`visibleInterval`:8, `run`:12, `onVisible`:26

## `tests/autoclickerHotkey.test.ts`

`svc`:45

## `tests/benchWorkerReal.test.ts`

`run`:11, `best`:19

## `tests/cleaner.test.ts`

`tmpDir`:13, `fakeIni`:16, `fakeFetch`:21, `put`:81, `execFileImpl`:154

## `tests/cleanerPage.test.tsx`

`target`:7, `mockApi`:13

## `tests/darkosService.test.ts`

`fakeFs`:13, `out`:22, `makeService`:26, `make`:358

## `tests/diskMap.test.ts`

`file`:15, `ok`:18, `build`:61

## `tests/diskRescue.test.ts`

`tmpDir`:11, `fakeSpawn`:13

## `tests/dlss5.test.ts`

`fixedInfo`:13, `fakeDll`:22

## `tests/dlss5Lifecycle.test.ts`

`legacyInstall`:9

## `tests/downloads.test.ts`

`sha`:13, `at`:43, `startServer`:72, `tick`:91, `newManager`:107, `waitFor`:116

## `tests/extensions.test.ts`

`ext`:16

## `tests/gpuStress.test.ts`

`loop`:11, `fakeEngine`:88, `say`:91, `service`:107, `fetchImpl`:136

## `tests/hub.test.ts`

`base`:19, `reg`:20, `v`:21, `refused`:62, `official`:87, `fakeTweaks`:176, `fakeOptimizer`:191, `op`:193, `dir`:210, `pkg`:214, `run`:292

## `tests/hubMcp.test.ts`

`rpc`:31, `call`:65, `run`:79, `signed`:106, `fetchImpl`:123

## `tests/hwSensors.test.ts`

`sample`:8

## `tests/i18nFallback.test.tsx`

`tFor`:7

## `tests/kakugan.test.ts`

`res`:13, `acc`:80, `dash`:81

## `tests/maintenanceSchedule.test.ts`

`at`:6

## `tests/maintenanceService.test.ts`

`make`:9

## `tests/metadataEditor.test.ts`

`ffmpegPath`:20, `exiftoolPath`:21, `tmp`:31, `field`:32, `ff`:33, `makeDocx`:80, `makePdf`:91, `cover`:216

## `tests/noProhibitedSteamTools.test.ts`

`read`:10

## `tests/optimizerAudit.test.ts`

`task`:278, `mk`:296

## `tests/optiscaler.test.ts`

`isRdna2`:16, `mockGetLibraryStore`:37, `sectionKeys`:67

## `tests/partitionManager.test.tsx`

`part`:10, `disk`:14, `mount`:18, `plan`:54, `run`:68

## `tests/partitionPolicy.test.ts`

`part`:13, `disk`:17, `ctx`:21, `create`:115, `r`:132, `l`:147, `harness`:191, `listed`:195, `writes`:223

## `tests/partitionService.test.ts`

`raw`:10

## `tests/powershellTools.test.ts`

`make`:37

## `tests/psToolkit.test.ts`

`mk`:151

## `tests/realtime.test.ts`

`tmp`:19, `sha`:20, `waitFor`:21

## `tests/restoreService.test.ts`

`parseErrors`:18

## `tests/saveBackup.test.ts`

`setup`:10

## `tests/savePaths.test.ts`

`rel`:41

## `tests/securityAdvanced.test.ts`

`fetchImpl`:244

## `tests/susuya.test.ts`

`crop`:14, `fakeSusuya`:34, `send`:41, `tmpFile`:77

## `tests/templateBackslash.test.ts`

`lostEscapes`:10, `visit`:13, `walk`:36

## `tests/updateService.test.ts`

`release`:20

## `tests/vaultBridge.test.ts`

`mkTmp`:23, `makeServer`:185, `FakeHost`:212 _class_, `connect`:219, `next`:231, `raw`:237, `handshake`:238, `call`:249, `close`:253, `setup`:261, `pair`:270, `runReg`:392, `readFile`:434, `writeFile`:435

## `tests/wuDiagnose.test.ts`

`ids`:17

## `vite.config.js`

`transformIndexHtml`:12
