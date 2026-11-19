<!-- GERADO por electron_feature_map.py em 2026-11-18T20:02:22. NAO edite a mao: rode `npm run map`. -->

# Indice de simbolos (arquivo -> funcoes com linha)

Busque aqui com Ctrl+F / grep pelo nome da funcao.

## `browser-extension/background.js`

`getLocal`:30, `setLocal`:35, `sessionGet`:39, `sessionSet`:44, `sessionRemove`:49, `getSettings`:54, `disconnect`:61, `onPortMessage`:76, `connect`:104, `send`:133, `authenticate`:152, `request`:161, `browserName`:169, `startPairing`:177, `onPairResult`:190, `isWebUrl`:204, `siteOf`:212, `sameSite`:222, `queryLogins`:227, `fetchCredentials`:232, `badge`:236, `offerSave`:243, `getPendingSave`:260, `clearPendingSave`:271, `popupState`:279, `popupFill`:303, `popupSave`:317, `fromPopup`:330, `handleMessage`:335

## `browser-extension/content.js`

`visible`:13, `passwordFields`:21, `usernameFor`:26, `loginFieldsFrom`:39, `setValue`:53, `fillCredentials`:61, `tr`:78, `ensureUi`:84, `hideUi`:122, `positionUi`:128, `menuHead`:140, `menuMessage`:148, `onIconClick`:168, `reportSubmit`:238

## `browser-extension/popup.js`

`t`:75, `el`:81, `send`:92, `state`:96, `render`:100, `refresh`:105, `startPolling`:192, `stopPolling`:195

## `electron/assets/points/points.js`

`resize`:21, `send`:29, `updateUi`:33, `drawCurvedSegment`:51, `draw`:69

## `electron/assets/region/region.js`

`report`:12, `cancel`:13, `draw`:18, `drawLoupe`:38

## `electron/configManager.js`

`mergeDefaultConfig`:12, `shouldMigrateVerifyUrl`:34, `loadConfig`:46, `writeAtomic`:80, `saveConfig`:93, `getDefaultConfig`:99

## `electron/devBootstrap.js`

`preview`:25, `emit`:38

## `electron/devSelfTest.js`

`short`:19, `withTimeout`:25, `sleep`:26, `mainWindow`:28, `run`:40, `call`:74, `callLong`:139

## `electron/devSelfTestAudit.js`

`sleep`:8, `ps`:9, `psq`:13, `binPaths`:15, `inBin`:16, `runAuditScenarios`:18, `scan`:74, `nodes`:83, `walk`:85, `big`:98, `makeTree`:99, `lock`:117, `trashCase`:121, `safe`:133

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

`FastSensorDaemon`:19 _class_, `start`:29, `stop`:72

## `electron/hal/collectors/GpuCollector.js`

`GpuCollector`:15 _class_, `_ensureStaticData`:40, `poll`:54, `_build`:77, `na`:78, `smi`:79, `pdh`:80

## `electron/hal/collectors/HwSensorsDaemon.js`

`isPawnIoInstalled`:18, `forgetPawnIoCheck`:30, `HwSensorsDaemon`:37 _class_, `enabled`:54, `enabled`:64, `status`:69, `start`:82, `stop`:125, `restart`:136

## `electron/hal/collectors/LatencyCollector.js`

`LatencyCollector`:7 _class_, `_ensureDrivers`:30, `poll`:54

## `electron/hal/collectors/NetworkCollector.js`

`NetworkCollector`:5 _class_, `poll`:20

## `electron/hal/collectors/NvidiaDaemon.js`

`NvidiaDaemon`:20 _class_, `start`:35, `_parseRow`:105, `num`:111, `_scheduleFlush`:134, `_flush`:142, `stop`:154

## `electron/hal/collectors/ProcessCollector.js`

`ProcessCollector`:6 _class_, `poll`:23, `normalize`:43

## `electron/hal/collectors/RamCollector.js`

`RamCollector`:5 _class_, `poll`:6

## `electron/hal/collectors/SensorBus.js`

`SensorBus`:6 _class_, `_wire`:16, `forward`:19, `start`:25, `_applyTempSource`:44, `prewarmAdvanced`:61, `stop`:72, `setAdvanced`:84, `running`:90

## `electron/hal/collectors/SlowSensorDaemon.js`

`SlowSensorDaemon`:6 _class_, `_buildScript`:23, `start`:138, `stop`:194

## `electron/hal/collectors/StorageCollector.js`

`StorageCollector`:6 _class_, `poll`:19

## `electron/hal/collectors/TempsCollector.js`

`TempsCollector`:9 _class_, `_isFresh`:59, `_hwmonLabel`:63, `_trackMinMax`:69, `_lhmFresh`:81, `_resolveCpuTemp`:83, `poll`:95, `_build`:108, `_formatZoneName`:240

## `electron/hal/collectors/lhmSummary.js`

`find`:4, `buildTree`:10, `summarizeLhm`:23, `g`:39

## `electron/hal/models/SensorModel.js`

`createSensor`:3, `createUnavailableSensor`:25, `classifyTemperature`:33, `numOrNull`:48

## `electron/hal/models/gpuMatch.js`

`gpuKey`:5, `sameGpu`:12, `pairGpus`:26, `num`:41, `primaryGpuIndex`:54, `rank`:63, `pickPrimaryGpu`:80

## `electron/ipc/benchmarkIpc.js`

`registerBenchmarkIPC`:4, `broadcast`:5, `handle`:7

## `electron/ipc/cleanerIpc.js`

`registerCleanerIPC`:5, `handle`:7

## `electron/ipc/codeRunnerIpc.js`

`registerCodeRunnerIPC`:4, `handle`:5

## `electron/ipc/converterIpc.js`

`registerConverterIPC`:18, `htmlToPdf`:27, `validate`:58, `withJob`:69, `onProgress`:75

## `electron/ipc/darkosIpc.js`

`registerDarkOSIPC`:22, `pick`:28, `sendTo`:30, `handle`:36, `usbEvent`:85

## `electron/ipc/diskScanIpc.js`

`registerDiskScanIPC`:4, `handle`:6, `winOf`:12

## `electron/ipc/driverIpc.js`

`registerDriverIPC`:9, `handle`:12

## `electron/ipc/gpuBenchIpc.js`

`toJpeg`:5, `registerGpuBenchIPC`:12, `broadcast`:13, `parentOf`:16, `handle`:20, `n`:31

## `electron/ipc/hubIpc.js`

`registerHubIPC`:23, `send`:27, `focus`:28, `approve`:32, `readDev`:55, `writeDev`:56, `loadDevFolder`:62, `watchDev`:84, `addDev`:98, `openLink`:114, `handle`:123, `text`:129, `init`:178

## `electron/ipc/hwSensorsIpc.js`

`bootAdvancedSensors`:14, `registerHwSensorsIPC`:33, `handle`:38, `elevated`:44

## `electron/ipc/kakuganIpc.js`

`makeTokenStore`:15, `can`:20, `load`:21, `registerKakuganIPC`:45, `readState`:49, `save`:57, `settings`:58, `poll`:61, `resume`:82, `handle`:100, `withQr`:106, `str`:107

## `electron/ipc/maintenanceIpc.js`

`registerMaintenanceIPC`:5, `broadcast`:6, `notify`:7, `handle`:32

## `electron/ipc/metadataIpc.js`

`registerMetadataIPC`:9, `getExiftoolPath`:10, `granted`:19, `outputAllowed`:23, `handle`:31

## `electron/ipc/overlayIpc.js`

`registerOverlayIPC`:13, `broadcast`:15, `get`:22, `handle`:27, `psuCatalog`:41

## `electron/ipc/powershellIpc.js`

`registerPowerShellIPC`:12, `getElectron`:15, `handle`:23, `winOf`:34, `cleanName`:35, `docs`:58

## `electron/ipc/realtimeIpc.js`

`registerRealtimeIPC`:17, `getHashDb`:27, `broadcast`:30, `refreshClam`:49, `apply`:59, `refreshDefender`:85, `defenderRunning`:91, `handle`:97, `status`:104, `ensureClamAv`:116

## `electron/ipc/recoveryIpc.js`

`registerRecoveryIPC`:5, `handle`:8, `winOf`:14, `sender`:15, `onClose`:41

## `electron/ipc/restoreIpc.js`

`registerRestoreIPC`:4, `handle`:6

## `electron/ipc/saveBackupIpc.js`

`getSaveBackupService`:10, `registerSaveBackupIPC`:13, `broadcast`:14, `getInstalledGames`:17, `handle`:36

## `electron/ipc/shareIpc.js`

`monitorMode`:16, `readJson`:18, `writeJson`:19, `normalizeShareConfig`:23, `registerShareIPC`:53, `broadcast`:66, `notify`:67, `liveHistory`:68, `upload`:70, `publicEntry`:100, `enhance`:105, `enhanceInBackground`:118, `capture`:148, `bindHotkey`:184, `handle`:193, `state`:200

## `electron/ipc/sshIpc.js`

`makeVaultKeyProvider`:17, `can`:20, `locked`:21, `load`:22, `ok`:65, `failOf`:66, `idOf`:71, `registerSshIPC`:74, `broadcast`:81, `handle`:102, `state`:109, `senderFor`:178, `drop`:183, `send`:192, `insideLogs`:216, `dispose`:288

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

`now`:20, `clampInt`:24, `stablePolicyName`:30, `safeJsonParse`:35, `psSingleQuote`:44, `encodedPowerShellArgs`:48, `isSafePingHost`:52, `registerLatencyGuardian`:57, `broadcastEvent`:70, `loadConfig`:140, `normalizeConfig`:152, `saveConfig`:196, `getProcessSnapshot`:203, `findGameProcess`:214, `setPowerPlanHighPerformance`:230, `restorePowerPlan`:242, `startTimerResolution05ms`:248, `clear`:274, `stopTimerResolution`:282, `setGamePriorityHigh`:293, `setDisableFullscreenOptimizations`:309, `restoreFullscreenOptimizations`:334, `setMouseAccelerationDisabled`:353, `restoreMouseAcceleration`:380, `setGpuHighPerformancePreference`:395, `restoreGpuPreference`:419, `applyDnsCloudflareWithUndo`:438, `restoreDns`:480, `setQosForExe`:500, `removeQosPolicy`:524, `setNagleDisabledOnActiveInterface`:532, `restoreNagle`:581, `optimizeGlobalTcpStack`:597, `restoreGlobalTcpStack`:627, `killBackgroundProcesses`:645, `serializeTransition`:666, `ultraEnable`:672, `ultraDisable`:676, `ultraEnableImpl`:680, `setApplied`:699, `restoreUndo`:848, `done`:850, `revertLeftoverUndo`:887, `ultraDisableImpl`:899, `unregisterHotkey`:924, `registerHotkey`:930, `updateMetricsFast`:947, `updateGpuUsage`:957, `updatePing`:978, `finish`:1000, `smartCleanRam`:1013, `loop`:1046, `loopTick`:1057, `syncLoops`:1091, `syncSmartClean`:1113, `start`:1128, `stop`:1135, `splitArgs`:1277

## `electron/libraryStore.js`

`filePath`:5, `backupFilePath`:9, `tempFilePath`:13, `newId`:17, `newProfileId`:22, `sanitizeProfile`:27, `sanitizeOptiScaler`:58, `sanitizeGame`:76, `tryReadGames`:117, `loadLibrary`:128, `saveLibrary`:145, `serialized`:163, `upsertGame`:169, `upsertGameUnsafe`:173, `upsertGamesBulk`:184, `upsertGamesBulkUnsafe`:188, `sameExe`:191, `removeGame`:204, `removeGameUnsafe`:208, `updateGame`:216

## `electron/main.js`

`getSystemInformation`:137, `get`:143, `getSharp`:152, `getOcrWorker`:161, `getExiftool`:181, `getFfmpegPath`:189, `getLibraryStore`:221, `safeRegister`:228, `getYtDlpTools`:269, `isDev`:274, `normalizeAccessPath`:298, `isPathInside`:308, `grantFilePath`:314, `grantDirectoryPath`:319, `hasFileAccessGrant`:324, `assertOutputDirGranted`:336, `assertFileAccessGranted`:342, `assertFileAccessGrantedMany`:351, `psSingleQuote`:357, `loadRuntimeConfig`:361, `isAllowedExternalProtocol`:371, `getAllowedExternalUrl`:375, `openAllowedExternalUrlDetached`:385, `isEmbeddedExternalProtocol`:396, `handleEmbeddedExternalNavigation`:400, `isTrustedAppNavigation`:412, `getAppIconPath`:422, `showMainWindow`:437, `ensureTray`:450, `hideWindowToBackground`:477, `computeJunkEstimate`:485, `work`:495, `createMainWindow`:520, `kickWindowsPaint`:585, `showWhenReady`:657, `eventSender`:742, `measureLatency`:769, `getActiveAdapterName`:800, `getMainCpuLoad`:1037, `broadcastLibraryEvent`:1181, `scoreExecutable`:1257, `key`:1262, `scanDirectoryForBestExe`:1283, `walk`:1286, `findPgeBat`:1440, `launchPgeBat`:1460, `setFramePacerLive`:1541, `auditStartupTask`:1575, `isStartupTaskEnabled`:1588, `setStartupTask`:1598, `refreshLiveCounts`:1726, `sendEvent`:2001, `buildArgs`:2169, `vaultFilePath`:2445, `setVaultAutoLockMinutes`:2453, `clearVaultAutoLock`:2460, `scheduleVaultAutoLock`:2467, `touchVault`:2476, `vaultFileExists`:2480, `readVaultFile`:2489, `writeVaultFile`:2494, `withVaultWriteLock`:2510, `lockVault`:2521, `removeVaultBackups`:2539, `ensureUnlocked`:2548, `loadVaultUsingWrapper`:2553, `persistVaultData`:2575, `getSecurityScoreV2`:3000, `add`:3005, `isValidHostname`:3182, `getClickEnginePath`:3325, `autoClickerCall`:3351, `isValidWingetId`:3484, `installGithubReleaseMsi`:3496, `installFromOfficialUrl`:3526, `progress`:3567, `runWinget`:3592, `runDeferredStartup`:3674

## `electron/networkIPC.js`

`runCmd`:10, `registerNetworkIPC`:23, `checkPort`:67, `safe`:112

## `electron/optiscalerManager.js`

`nowStamp`:38, `pad`:40, `getSourceVersion`:44, `resolveReleaseDir`:56, `hasDll`:57, `findReleaseRoot`:66, `installOfficialRelease`:79, `normalizeWinPath`:106, `exists`:110, `readJsonIfExists`:119, `runPowerShellJson`:127, `classifyAmdArchitecture`:145, `getGpuInfo`:164, `getWindowsBuild`:194, `isWindows11OrNewer`:199, `walkFiles`:203, `walk`:208, `findUnrealExecutableCandidates`:231, `detectUpscaleFiles`:239, `add`:241, `fileContainsOptiScalerSignature`:274, `isOptiScalerLoader`:299, `detectInstalledLoaders`:316, `chooseLoader`:339, `chooseInputApi`:356, `normalizeChoice`:363, `buildIniPatch`:368, `setIniValue`:417, `applyIniPatch`:455, `getExePayload`:459, `buildAnalysis`:469, `backupPathIfExists`:619, `copySourceRootFiles`:635, `copySourceDirectory`:654, `makeUniqueBackupDir`:665, `rollbackApply`:675, `withMutationLock`:699, `isSameInstall`:710, `resolveFsr4Rdna2Path`:730, `applyOptiScaler`:781, `listBackups`:943, `isInsideDir`:979, `resolveBackupDir`:984, `restoreBackup`:995, `removeTracked`:1018, `deleteBackup`:1209, `createManualBackup`:1228, `registerOptiScalerIPC`:1264

## `electron/preload.js`

`pathsOf`:5, `handler`:10, `handler`:56, `listener`:90, `listener`:159, `listener`:164, `listener`:185, `listener`:196, `handler`:235, `handler`:298, `handler`:317, `handler`:327, `handler`:345, `handler`:357, `listener`:400, `handler`:464, `handler`:490, `handler`:496, `handler`:502, `handler`:508, `listener`:517, `listener`:528, `handler`:553, `listener`:566, `listener`:585, `handler`:654, `handler`:678, `handler`:693, `listener`:718, `listener`:747, `listener`:782, `listener`:809, `handler`:850

## `electron/services/CodeRunner.js`

`which`:26, `detectRuntimes`:36, `killTree`:48, `cancelRun`:54, `exec`:56, `take`:67, `done`:73, `runCode`:93

## `electron/services/CoverProviderService.js`

`httpsGet`:15, `CoverProviderService`:40 _class_, `init`:50, `steamProvider`:56, `downloadImage`:103, `fail`:116, `fetchCover`:142

## `electron/services/CpuLoadTracker.js`

`CpuLoadTracker`:5 _class_, `sample`:10

## `electron/services/DarkHub.ClickEngine.cs`

`ClickEngine`:11 _class_, `INPUT`:14 _class_, `INPUTUNION`:21 _class_, `MOUSEINPUT`:30 _class_, `KEYBDINPUT`:41 _class_, `POINT`:51 _class_, `MacroRecord`:57 _class_, `SendInput`:67, `mouse_event`:70, `keybd_event`:73, `MapVirtualKeyA`:76, `GetCursorPos`:79, `SetCursorPos`:82, `GetSystemMetrics`:85, `GetForegroundWindow`:88, `GetWindowThreadProcessId`:91, `SetProcessDPIAware`:94, `OpenInputDesktop`:97, `SetThreadDesktop`:100, `CloseDesktop`:103, `GetAsyncKeyState`:106, `timeBeginPeriod`:109, `timeEndPeriod`:112, `CreateWaitableTimerExW`:115, `SetWaitableTimer`:118, `WaitForSingleObject`:121, `CloseHandle`:124, `EmitJson`:192, `AttachInputDesktop`:200, `WaitPreciseMs`:216, `SendMouseButtonDown`:261, `SendMouseButtonUp`:280, `SendMouseMoveAbsolute`:299, `IsExtendedVk`:336, `SendKeyTransition`:344, `ReleaseAllButtons`:373, `ReleaseAllKeysAndButtons`:384, `PerformClick`:401, `WorkerLoop`:433, `RunClickLoop`:450, `GetMacroDurationMs`:506, `SaveRecFile`:514, `ReadRecFile`:537, `IsHotkeyKey`:572, `RecordWorkerLoop`:580, `MacroPlayWorkerLoop`:751, `ParseVkKey`:914, `ParseHotkey`:967, `Down`:985, `ModsDown`:987, `HotkeyListenerLoop`:997, `StopMacroInternalUnlocked`:1067, `StartMacroRecording`:1080, `StopMacroRecording`:1109, `StartMacroPlayback`:1124, `StopMacroPlayback`:1160, `StartClicking`:1176, `StopClicking`:1203, `TimerPeriodRefCount`:1222 _class_, `Acquire`:1238, `Release`:1251, `ForceRelease`:1265, `Wrap`:1279, `RunWithTimer`:1294, `ForceReleaseTimerPeriod`:1299, `Cleanup`:1304, `SetHotkey`:1313, `SetMacroHotkeys`:1322, `Arm`:1334, `DecodeB64Utf8`:1346, `Main`:1359

## `electron/services/DarkHub.DiskScan.cs`

`DiskScan`:21 _class_, `WIN32_FIND_DATA`:24 _class_, `FindFirstFileExW`:39, `FindNextFileW`:42, `FindClose`:45, `Job`:54 _class_, `ToMs`:63, `Clean`:65, `Flush`:67, `LongPath`:75, `ScanDir`:82, `Worker`:125, `Main`:147

## `electron/services/DarkHub.FrameLimiter.cs`

`PacerConfigV2`:19 _class_, `TelemetrySnapshot`:36 _class_, `GameTarget`:56 _class_, `InjectResult`:65 _class_, `Success`:72, `Refuse`:73, `Fail`:74, `DarkHubFrameLimiter`:77 _class_, `OpenProcess`:82, `VirtualAllocEx`:84, `WriteProcessMemory`:86, `CreateRemoteThread`:88, `GetModuleHandle`:90, `GetProcAddress`:92, `CloseHandle`:94, `QueryFullProcessImageName`:96, `GetProcessTimes`:98, `GetExitCodeProcess`:100, `GetExitCodeThread`:102, `IsWow64Process`:104, `IsWow64Process2`:106, `ProcessIdToSessionId`:108, `GetProcessInformation`:110, `EnumProcessModulesEx`:112, `GetModuleBaseName`:114, `OpenProcessToken`:116, `GetForegroundWindow`:118, `GetWindowThreadProcessId`:120, `IsWindowVisible`:122, `VirtualFreeEx`:125, `WaitForSingleObject`:127, `IsBlacklisted`:187, `GetProcessPath`:194, `GetHandlePath`:201, `CaptureIdentity`:209, `DetectActiveGame`:224, `PeMachine`:318, `TargetArch`:338, `ModuleNames`:360, `AntiCheatFound`:380, `FindBinary`:402, `ModuleLoaded`:411, `InjectHookDll`:423, `SameUser`:504, `InjectX64`:520, `InjectViaX86Helper`:557, `JsonStr`:594, `ConfigLayoutOk`:623, `EnsureConfigView`:636, `PublishConfig`:661, `HeartbeatLoop`:691, `ResetCap`:704, `ClampFps`:722, `TryParseLuid`:731, `OpenTelemetry`:753, `CloseTelemetry`:770, `ReadSharedTelemetry`:782, `Fd`:835, `EscJ`:843, `EmitTelemetry`:845, `ReadStdin`:884, `ArgValue`:939, `ResultJson`:945, `Main`:951

## `electron/services/DarkHub.FramePacer.ps1`

`ApplyDriverLimit`:99

## `electron/services/DarkHub.HotkeyWatch.cs`

`HotkeyWatch`:13 _class_, `GetAsyncKeyState`:16, `Hotkey`:18 _class_, `ParseVkKey`:24, `ParseHotkey`:78, `Down`:97, `ModsDown`:99, `Emit`:109, `Watch`:111, `Main`:131

## `electron/services/DarkHub.LatencyEngine.cs`

`PROCESS_POWER_THROTTLING_STATE`:17 _class_, `DarkHubLatencyEngine`:24 _class_, `NtSetTimerResolution`:29, `NtQueryTimerResolution`:32, `TimeBeginPeriod`:35, `TimeEndPeriod`:38, `AvSetMmThreadCharacteristicsW`:41, `AvRevertMmThreadCharacteristics`:44, `OpenProcess`:47, `SetPriorityClass`:50, `SetProcessPriorityBoost`:53, `SetProcessAffinityMask`:56, `GetProcessAffinityMask`:59, `CloseHandle`:62, `GetCurrentProcess`:65, `GetCurrentThread`:68, `SetThreadPriority`:71, `SetProcessInformation`:74, `IcmpCreateFile`:77, `IcmpCloseHandle`:80, `IcmpSendEcho`:83, `EmptyWorkingSet`:95, `GetForegroundWindow`:98, `GetWindowThreadProcessId`:101, `ForegroundPid`:104, `RECT`:114 _class_, `MONITORINFO`:117 _class_, `MonitorFromWindow`:120, `GetMonitorInfo`:123, `SetThreadDpiAwarenessContext`:126, `ForegroundMonitor`:129, `Main`:181, `NamedPipeServerWorker`:237, `HandleCommand`:267, `LockTimerResolution`:366, `UnlockTimerResolution`:390, `TimerWorkerLoop`:404, `QueryTimerResolutionInternal`:463, `HandleBoostProcess`:489, `HandleSetAffinity`:541, `HandleListProcesses`:573, `HandleCleanRam`:591, `GetLogicalProcessorInformationEx`:631, `CpuCoreRecord`:638 _class_, `CpuL3Record`:646 _class_, `Group0Mask`:657, `ParseProcessorInfo`:675, `SelectCpuTopology`:716, `GetCpuTopologyInternal`:775, `HandlePingNative`:803, `IP_OPTION_INFORMATION`:890 _class_, `ICMP_ECHO_REPLY`:900 _class_, `SendJson`:911, `FormatResponse`:916, `DictionaryToJson`:927, `ObjectToJson`:943, `GetJsonStringValue`:968, `GetJsonIntValue`:980, `GetJsonBoolValue`:994

## `electron/services/DarkHub.Mcp.cs`

`DarkHubMcp`:18 _class_, `Main`:23, `Relay`:42, `ReadConfig`:88, `IdOf`:120, `HasId`:131, `ErrorFor`:134, `WithId`:145

## `electron/services/DarkHub.SensorDaemon.cs`

`DarkHubSensorDaemon`:9 _class_, `PdhOpenQueryW`:11, `PdhAddEnglishCounterW`:14, `PdhCollectQueryData`:17, `PdhGetFormattedCounterValue`:20, `PdhGetFormattedCounterArrayW`:23, `PdhCloseQuery`:26, `PDH_FMT_COUNTERVALUE`:29 _class_, `CoreTempData`:35 _class_, `ItemValid`:62, `ReadCoreTemp`:67, `Main`:100, `ReadSingle`:291, `ReadMultiFiltered`:301, `ReadByLuid`:347, `GpuAdapter`:377 _class_, `DXGI_ADAPTER_DESC1`:380 _class_, `CreateDXGIFactory1`:404, `EnumerateAdapters`:407, `Num`:428, `EscapeJson`:432

## `electron/services/DarkHub.VaultBridgeHost.cs`

`VaultBridgeHost`:21 _class_, `Main`:27, `ReadConfig`:92, `Pump`:114, `ReadFrame`:137, `ReadExact`:148, `WriteFrame`:160, `WriteJson`:168, `RandomHex`:179, `HmacHex`:186, `ToHex`:192, `FixedTimeEquals`:199

## `electron/services/DeepHardwareService.js`

`subsysOf`:8, `pairWmiRows`:14, `DeepHardwareService`:30 _class_, `runPowerShell`:37, `wrapStatus`:47, `fetchCpu`:53, `fetchMainboard`:82, `fetchMemory`:106, `fetchGpu`:128, `fetchStorage`:212, `fetchNetwork`:269, `fetchMonitors`:289, `fetchOS`:315, `getDeepInfo`:353, `_scanAll`:365, `getCategory`:395

## `electron/services/DriverCenterService.js`

`classifyVendor`:35, `vendorFromPnpId`:48, `boardPartnerFromPnpId`:69, `isGenericDisplayDriver`:75, `officialSourcesFor`:83, `isOfficialDriverUrl`:88, `normalizeAdapter`:102, `Step`:206, `cameraIssues`:254, `DriverCenterService`:272 _class_, `cameraStatus`:280, `repairCamera`:298, `detectAdapters`:315, `resolveOfficialUrl`:339

## `electron/services/FramePacerEngine.js`

`FramePacerEngine`:15 _class_, `start`:42, `stop`:72, `updateConfig`:84, `getMetrics`:114, `_failStop`:125, `_getExePath`:133, `_spawnNativeProcess`:157, `_killNativeProcess`:242, `_killSync`:259, `normalizeAdapterLuid`:271, `registerExitKill`:279

## `electron/services/FramePacerOverlay.js`

`createFramePacerOverlay`:17, `drawGraph`:260, `metricsHandler`:325, `closeFramePacerOverlay`:349, `toggleFramePacerOverlay`:356, `setOverlayClickThrough`:370, `setOverlayConfig`:378, `getOverlayStatus`:383

## `electron/services/HardwareService.js`

`HardwareService`:8 _class_, `init`:23, `recompute`:38, `dropSender`:46, `_bindWindowVisibility`:79, `pause`:88, `resume`:89, `_setPaused`:102, `_clearIdleTimer`:125, `emitSnapshot`:132, `_setup`:152, `_stopTimer`:163, `_stopDaemons`:170, `start`:176, `stop`:185, `holdSensors`:200, `releaseSensors`:209, `snapshot`:215, `teardown`:219

## `electron/services/LoggerService.js`

`redactSecrets`:22, `LoggerService`:28 _class_, `init`:34, `_rotateLogIfNeeded`:42, `_truncate`:52, `auditOptimizer`:59, `getOptimizerAuditLog`:88, `_format`:104, `_write`:110, `info`:130, `warn`:134, `error`:138, `track`:143

## `electron/services/LowLatencyLayerService.js`

`sourceDir`:26, `installDir`:27, `vendorFromPnp`:30, `modeFromEnv`:43, `recommendation`:52, `buildApplyScript`:74, `LowLatencyLayerService`:99 _class_, `_filesState`:108, `getStatus`:121, `_install`:146, `_removeFiles`:163, `apply`:174

## `electron/services/ManagedProcessRegistry.js`

`ManagedProcessRegistry`:3 _class_, `claim`:8, `release`:14, `releaseAllBy`:20, `isManaged`:26

## `electron/services/NativeLatencyClient.js`

`NativeLatencyClient`:23 _class_, `getExecutablePath`:36, `ensureRunning`:52, `_rejectAllPending`:127, `_rejectPendingOf`:135, `_restart`:146, `sendCommand`:152, `lockTimer`:187, `unlockTimer`:192, `queryTimer`:197, `boostProcess`:202, `setAffinity`:212, `getCpuTopology`:221, `pingNative`:231, `cleanRam`:244, `listProcesses`:255, `dispose`:268, `killSync`:290, `registerExitKill`:306

## `electron/services/NetLatencyService.js`

`parsePingTime`:37, `parsePingOutput`:45, `round1`:55, `percentile`:57, `computeLatencyStats`:67, `parseTracertOutput`:89, `gradeBufferbloat`:109, `findMaxPayload`:120, `p`:122, `qosPolicyName`:144, `planAdapterTweak`:152, `mergeSnapshot`:167, `buildAdvancedPropertySetScript`:175, `buildQosApplyScript`:185, `isEcnValue`:197, `EXTRA`:203, `runPing`:206, `tcpConnectMs`:212, `finish`:217, `foreach`:231, `asArray`:254, `normalizeState`:257, `NetLatencyService`:285 _class_, `_runMarked`:286, `getPresets`:290, `probe`:295, `traceroute`:306, `bufferbloat`:315, `startDownload`:327, `mtu`:354, `probe`:358, `getState`:364, `applyTweak`:378, `restoreTweak`:441, `resetStack`:474

## `electron/services/PowerShellRunner.js`

`runCommand`:17, `finish`:40, `appendChunk`:50, `stripBom`:110, `encodePowerShellScript`:115, `powerShellArgsForEncodedScript`:122, `parseJsonOutput`:133, `psSingleQuote`:166, `runPowerShell`:170, `runPowerShellJson`:252

## `electron/services/PowerShellToolsService.js`

`isPs1`:20, `isUnderDarkOS`:29, `isStartFolder`:48, `normalizeScopes`:55, `effectivePolicy`:63, `normalizeSignature`:73, `psQuote`:79, `safeJson`:84, `PowerShellToolsService`:92 _class_, `_isTrustedPath`:104, `_isDirectory`:114, `getPolicies`:123, `listScripts`:133, `getSignature`:171, `runScript`:188, `openElevatedTerminal`:223

## `electron/services/SecureDownload.js`

`assertAllowedUrl`:16, `downloadToFile`:36, `cleanupAndReject`:49, `unlink`:53, `attempt`:62, `fetchJson`:135, `assetSha256`:166

## `electron/services/SecurityService.js`

`SecurityService`:14 _class_, `customFileHashes`:49, `customFileHashes`:54, `_getFeedHashesPath`:59, `setFeedFileHashes`:64, `_registerAdvancedIpc`:77, `safe`:79, `init`:96, `_getShieldPrefPath`:152, `_readShieldPref`:156, `_writeShieldPref`:164, `autoShieldBoot`:172, `runPowerShell`:187, `calculateEntropy`:201, `scanRunningProcesses`:248, `scanUrl`:346, `_writeHosts`:467, `q`:477, `enablePhishingShield`:495, `disablePhishingShield`:528, `getPhishingShieldStatus`:546, `getLiveNetworkConnections`:563, `checkRansomwareArmor`:608, `enableRansomwareArmor`:630, `_getRulesFilePath`:651, `loadCommunityRules`:658, `getCommunityRules`:684, `getAllPhishingDomains`:697, `importCommunityRules`:701, `resetCommunityRules`:743, `normalizeFileHashes`:760

## `electron/services/UpdateService.js`

`normalizeAssetName`:11, `sameAssetName`:12, `pickInstallerAsset`:15, `sha256File`:21, `UpdateService`:34 _class_, `init`:48, `_setupUpdater`:70, `_scheduleAutoCheck`:152, `_setState`:159, `checkForUpdates`:163, `downloadUpdate`:224, `fail`:254, `installUpdate`:312, `_publishedSha256`:359, `_fetchLatestGitHubRelease`:373, `_isNewerVersion`:407, `_registerIPC`:419, `_emit`:431, `destroy`:437

## `electron/services/autoclicker/AutoClickerService.js`

`clampSettings`:22, `clampMacroSettings`:33, `encodePathB64`:45, `AutoClickerService`:49 _class_, `_hasAnyHotkey`:82, `_refreshWorkingRecSummary`:86, `load`:105, `save`:139, `macroState`:159, `state`:168, `_emit`:180, `_send`:182, `_setRunning`:184, `_syncMacroToEngine`:191, `_handleEngineMessage`:202, `_ensureEngine`:269, `arm`:310, `start`:314, `stop`:324, `toggle`:331, `setHotkey`:334, `macroSetConfig`:352, `macroRecordStart`:394, `macroRecordStop`:416, `macroPlayStart`:421, `macroPlayStop`:437, `macroLoadFromPath`:445, `macroSaveToPath`:501, `macroCompileExe`:519, `macroClear`:539, `_compileWaypointsIntoWorkingRec`:563, `waypointsSave`:605, `waypointsAddPicked`:620, `waypointsPlay`:641, `dispose`:652

## `electron/services/autoclicker/PointPicker.js`

`computeVirtualScreenBounds`:12, `makePointPicker`:32, `finish`:81

## `electron/services/autoclicker/recCodec.js`

`decodeTinyTaskSpeed`:26, `encodeTinyTaskSpeed`:33, `findTinyTaskBaseAnchor`:41, `inspectTinyTaskExeBuffer`:49, `parseRecBuffer`:83, `serializeRecBuffer`:162, `compileTinyTaskExe`:184, `normalizeWaypoint`:216, `easeInOutCubic`:238, `appendGlideFrames`:242, `buttonCodes`:298, `compileWaypointsToEvents`:308

## `electron/services/benchmark/BenchmarkService.js`

`exec`:15, `backgroundCpu`:20, `snap`:21, `context`:28, `ps`:30, `BenchmarkService`:45 _class_, `history`:52, `_save`:53, `run`:55, `cancel`:97, `compare`:102, `remove`:110

## `electron/services/benchmark/benchStats.js`

`median`:15, `noise`:23, `summarize`:30, `compare`:43, `contextWarnings`:63, `percentile`:71

## `electron/services/benchmark/benchWorker.js`

`emit`:12, `now`:13, `kernel`:17, `work`:28, `cpuSingle`:37, `cpuMulti`:44, `memBandwidth`:78, `memLatency`:89, `timerJitter`:107, `tick`:111, `diskSeqWrite`:127, `disk4kSyncWrite`:139

## `electron/services/binaryIntegrity.js`

`unpacked`:13, `sha256File`:18, `readManifest`:20, `verifyBinaries`:31, `integrityError`:48

## `electron/services/cleaner/CleanerService.js`

`defaultExe`:17, `sanitizeIds`:23, `validateWinapp2`:32, `CleanerService`:45 _class_, `available`:57, `winapp2Path`:59, `metaPath`:60, `backupDir`:63, `run`:75, `_withIds`:87, `_exclusive`:94, `_winapp2Args`:101, `definitions`:103, `status`:112, `updateDefinitions`:119, `removeDefinitions`:144, `listTargets`:149, `scan`:151, `clean`:156, `browsers`:166, `recycleBin`:176, `regScan`:180, `regClean`:183, `listBackups`:193, `restoreBackup`:204

## `electron/services/cloudSync.js`

`oneDriveRoots`:5, `oneDriveRootOf`:12

## `electron/services/consoleText.js`

`decodeConsoleText`:8

## `electron/services/converter/DocumentConverter.js`

`isAllowedPdfRequest`:17, `norm`:24, `findSoffice`:39, `htmlEsc`:51, `wrapHtml`:52, `htmlToText`:56, `epubToHtml`:71, `get`:74, `createDocumentConverter`:113, `profileUrl`:115, `runLo`:118, `chromiumPdf`:132, `markdownHtml`:137, `pdfjs`:145, `jsConvert`:170, `chromiumConvert`:212, `convert`:235, `progress`:249, `fail`:250, `ok`:251

## `electron/services/converter/ImageConverter.js`

`ddsFormatArg`:41, `ffmpegImageEncodeArgs`:47, `ffmpegImageDecodeArgs`:63, `jxlModules`:71, `decodeHeic`:91, `tail`:97, `createImageConverter`:101, `ffmpegDecode`:102, `texconvDecode`:112, `rawDecode`:121, `open`:140, `encode`:182, `convert`:243

## `electron/services/converter/MediaConverter.js`

`detectHwEncoders`:14, `probeMedia`:31, `lastError`:41, `convertMedia`:52, `emit`:64

## `electron/services/converter/docRoutes.js`

`familyOf`:40, `routesFor`:49, `add`:52, `commonOutputs`:101, `detectDelimiter`:108, `parseCsv`:118, `toCsv`:139, `cell`:140, `xmlEsc`:147, `xmlName`:148, `jsonToXml`:150

## `electron/services/converter/imageCodecs.js`

`encodeBmp`:5, `encodeIco`:48, `readIcoDirectory`:79, `decodeIcoDib`:102, `decodeIcoBest`:148

## `electron/services/converter/mediaPlan.js`

`parseProbe`:45, `encoderArgs`:104, `audioEncoderArgs`:127, `accepts`:137, `pickVideoEncoder`:143, `buildMediaPlan`:160, `make`:243, `parseProgressChunk`:271, `responsiveThreads`:282

## `electron/services/converter/processUtil.js`

`killTree`:9, `run`:24, `uniqueOutputPath`:62, `mapLimit`:73, `createJob`:87, `extOf`:91

## `electron/services/converter/vendorTools.js`

`vendorDir`:9, `existing`:14, `texconvPath`:17, `dcrawPath`:19, `bundledSofficePath`:21

## `electron/services/darkos/DarkOS.Cli.ps1`

`Write-DhLine`:22, `Write-DhFail`:23, `ConvertTo-CliJson`:26

## `electron/services/darkos/DarkOS.Recovery.psm1`

`Get-DkPath`:38, `Set-DarkOSEnvironment`:56, `Get-DkBackend`:78, `Invoke-Dk`:83, `Write-DkProgress`:114, `Get-DkTimestamp`:119, `ConvertTo-DkSignedDword`:122, `ConvertTo-DkUInt32`:127, `Test-DkRegValueEqual`:131, `Write-DkLog`:139, `ConvertTo-DkHashtable`:151, `Read-DkJsonFile`:172, `Write-DkJsonFileAtomic`:181, `Enter-DkLock`:199, `Exit-DkLock`:210, `New-DkManifest`:220, `Read-DkManifest`:233, `Save-DkManifest`:240, `Get-DkManifestOrInit`:242, `Get-DkEntry`:248, `Set-DkEntry`:254, `Add-DkHistory`:266, `Get-DkCatalogRaw`:274, `Load-DkFakeState`:302, `Save-DkFakeState`:310, `New-DkFakeBackend`:312, `New-DkRealBackend`:451, `Enter-DkDefaultUser`:725, `Exit-DkDefaultUser`:736, `Resolve-DkRegTarget`:748, `Get-DkRegEntries`:772, `Invoke-DkRegistryCapture`:774, `Invoke-DkRegistryApply`:795, `Invoke-DkRegistryVerify`:807, `Invoke-DkRegistryRevert`:822, `Invoke-DkServiceCapture`:832, `Invoke-DkServiceApply`:838, `Invoke-DkServiceVerify`:843, `Invoke-DkServiceRevert`:849, `Invoke-DkTaskCapture`:857, `Invoke-DkTaskApply`:862, `Invoke-DkTaskVerify`:863, `Invoke-DkTaskRevert`:870, `Invoke-DkPowercfgCapture`:877, `Invoke-DkPowercfgApply`:878, `Invoke-DkPowercfgVerify`:896, `Invoke-DkPowercfgRevert`:904, `Invoke-DkDefaultAssocCapture`:906, `Invoke-DkDefaultAssocApply`:907, `Invoke-DkDefaultAssocVerify`:908, `Invoke-DkDefaultAssocRevert`:909, `Resolve-DkPayloadPath`:911, `Get-DkAppxShortName`:925, `Get-DkWindowsAppsRoot`:927, `Get-DkAppxKind`:933, `Get-DkAppxPreserveSet`:940, `Invoke-DkAppxCapture`:961, `Save-DkAppxPayload`:976, `Invoke-DkAppxApply`:1021, `Invoke-DkAppxVerify`:1038, `Restore-DkAppxPackage`:1051, `Restore-DkAppxFromStore`:1102, `Test-DkAppxOriginallyPresent`:1112, `Invoke-DkAppxRevert`:1118, `Invoke-DkCapture`:1130, `Test-DkApplied`:1143, `Test-DkOriginal`:1156, `Invoke-DkApply`:1194, `Invoke-DkRevert`:1206, `Test-DkNeedsHive`:1219, `Test-DkDependencies`:1221, `Invoke-DkChangeApplyOne`:1232, `Invoke-DkChangeRevertOne`:1319, `Get-DarkOSCatalog`:1348, `Get-DarkOSManifest`:1355, `Get-DarkOSStatus`:1357, `Invoke-DarkOSChange`:1394, `Add-DkResults`:1444, `Sort-DkByDependency`:1453, `Set-DarkOSProfile`:1471, `Restore-DarkOSProfile`:1502, `Get-DarkOSRemovedApps`:1513, `Restore-DarkOSAppx`:1530, `New-DarkOSSnapshot`:1556, `Get-DarkOSSnapshot`:1574, `Restore-DarkOSSnapshot`:1580, `Get-DarkOSFailures`:1600, `Get-DarkOSRebootPending`:1612, `Export-DarkOSDiagnostics`:1619, `Initialize-DarkOSRecovery`:1654

## `electron/services/darkos/DarkOSRecoveryService.js`

`isValidChangeId`:48, `isValidProfile`:52, `isValidPackageName`:57, `sanitizeLabel`:65, `isValidDiagnosticsDestination`:73, `uniqueIds`:80, `parseCliOutput`:93, `parseProgressLine`:133, `stripLeakedProgress`:146, `clean`:148, `extractChangeResults`:171, `summarizeChangeResults`:187, `psq`:241, `defaultBundledDir`:245, `defaultRunner`:258, `onStdout`:263, `defaultIsElevated`:290, `DarkOSRecoveryService`:301 _class_, `manifestPath`:326, `isDarkOS`:330, `available`:344, `catalogPath`:348, `resolveCli`:352, `info`:372, `_emit`:386, `_enqueue`:395, `buildScript`:402, `run`:420, `onLine`:445, `_runChange`:485, `_read`:502, `getCatalog`:509, `getManifest`:518, `getStatus`:522, `_change`:530, `applyChange`:540, `revertChange`:544, `setProfile`:548, `restoreProfile`:555, `getRemovedApps`:559, `restoreAppx`:563, `listSnapshots`:571, `createSnapshot`:575, `restoreSnapshot`:587, `getFailures`:592, `getRebootPending`:596, `exportDiagnostics`:600

## `electron/services/darkos/UsbMediaService.js`

`parseLine`:13, `usableDisks`:19, `UsbMediaService`:23 _class_, `_script`:32, `_run`:38, `listDisks`:59, `findIsos`:67, `allowIso`:81, `hashIso`:88, `write`:108, `cancel`:123

## `electron/services/darkos/darkosRelease.js`

`parseReleasePage`:6, `parseSha256File`:18, `isNewerBuild`:23, `p`:24, `fetchLatestRelease`:32, `get`:33

## `electron/services/darkos/usb-media.ps1`

`Say`:17, `Test-Target`:19

## `electron/services/diskscan/DiskScanService.js`

`defaultExe`:16, `csvCell`:21, `normDir`:23, `isUnder`:24, `protectedPathReason`:29, `recycleBinPlace`:48, `readRecycleInfo`:60, `formatSize`:77, `RECYCLE_PROBE`:85, `recycleVerdict`:112, `clearReadOnly`:122, `DiskScanService`:130 _class_, `_filter`:142, `drives`:150, `status`:163, `emit`:197, `cancel`:228, `view`:239, `info`:260, `setTag`:265, `_pathOf`:270, `open`:276, `reveal`:283, `trash`:291, `deletePermanent`:316, `rm`:332, `recycleInfo`:351, `recycleProbe`:362, `pathOf`:367, `exportTo`:370, `write`:375

## `electron/services/diskscan/ScanModel.js`

`Col`:5 _class_, `push`:7, `ScanModel`:13 _class_, `_growDirs`:28, `grow`:32, `addLine`:37, `fileCount`:58, `index`:61, `known`:67, `_topDown`:81, `dirPath`:89, `filePath`:96, `sizes`:102, `view`:153, `build`:158, `trail`:191, `parse`:197, `info`:205, `setTag`:222, `markRemoved`:229, `eachFile`:238

## `electron/services/diskscan/filter.js`

`classOf`:22, `maskToRegExp`:37, `parseClause`:42, `parseFilter`:85, `matchFile`:100

## `electron/services/dlss5/Dlss5Service.js`

`inspectPeExecutable`:24, `rvaToFileOffset`:58, `computeSha256`:103, `Dlss5Service`:112 _class_, `getHistoryFilePath`:117, `getRecentGames`:126, `saveRecentGame`:138, `getSteamPath`:155, `getLibraryPaths`:192, `getInstalledSteamGames`:211, `detectGpu`:261, `detectGraphicsAPI`:288, `scanGameDirectory`:411, `findCandidates`:441, `getUserDataDir`:558, `_readManifest`:567, `restoreSignatureCheckBypass`:576, `inside`:602, `classifyDlssGpu`:700, `registerDlss5IPC`:728, `serialized`:733, `onLog`:768

## `electron/services/downloads/DownloadManager.js`

`sleep`:28, `request`:31, `onAbort`:58, `AbortedError`:65 _class_, `DownloadManager`:69 _class_, `init`:91, `shutdown`:104, `getSettings`:112, `setSettings`:116, `_loadSettings`:141, `_saveSettings`:150, `_loadQueue`:155, `_scheduleSave`:168, `_flushSave`:174, `_connectionsFor`:187, `list`:192, `add`:196, `pause`:233, `resume`:241, `pauseAll`:253, `resumeAll`:254, `cancel`:257, `remove`:269, `clearFinished`:282, `getFilePath`:288, `_afterChange`:294, `_toPublic`:300, `_scheduleEmit`:320, `_sampleSpeeds`:329, `_checkSchedule`:346, `_pump`:370, `_startTask`:379, `_abortTask`:409, `_deletePart`:414, `_unlinkPart`:421, `_pathTaken`:426, `_probe`:432, `_prepareFiles`:453, `_run`:479, `_downloadPiece`:541, `_streamPiece`:562, `_finish`:611, `hashFile`:636

## `electron/services/downloads/downloadUtils.js`

`sanitizeFileName`:7, `parseContentDisposition`:22, `fileNameFromUrl`:33, `validateDownloadUrl`:43, `autoConnections`:58, `planPieces`:68, `categoryForFile`:92, `uniquePath`:99, `safeJoin`:108, `Throttle`:117 _class_, `setRate`:123, `parseHHMM`:135, `isInsideWindow`:144, `clampInt`:151

## `electron/services/downloads/registerDownloadsIPC.js`

`registerDownloadsIPC`:9, `broadcast`:24, `handle`:37

## `electron/services/drivers/DriverInstallService.js`

`foreach`:83, `foreach`:93, `foreach`:126, `foreach`:127, `dhpFunc`:152, `wuSearchScript`:162, `wuSearchElevatedScript`:173, `buildInstallScript`:192, `foreach`:297, `readWuOutput`:336, `wuErrorKind`:346, `fetchText`:354, `driversDir`:371, `sha256File`:378, `DriverInstallService`:384 _class_, `scan`:395, `searchWindowsUpdate`:411, `lookupVendor`:433, `findDrivers`:469, `download`:495, `signature`:537, `note`:557, `pump`:602

## `electron/services/drivers/driverPlan.js`

`problemReason`:19, `asArray`:28, `str`:29, `parsePciIds`:32, `normalizeDevice`:44, `normalizeScan`:78, `wuBlockers`:105, `isUpdateId`:115, `normalizeWuUpdates`:118, `devicesForUpdate`:140, `isTrustedPackageUrl`:155, `isExpectedSigner`:179, `nvidiaLookupUrl`:187, `parseNvidiaLookup`:199, `safeJson`:209, `nvidiaVersionFromWindows`:214, `compareVersions`:223, `parseAmdDriversPage`:236, `intelPackageFor`:255, `parseIntelDownloadPage`:273, `meta`:274, `vendorInstallArgs`:281, `vendorIsSilent`:287, `interpretExitCode`:290, `buildPlan`:310, `needs`:312, `vendorFor`:313, `recommendedIds`:371, `uncoveredDevices`:376, `parseProgressLine`:388, `parseProgressText`:395

## `electron/services/ensureElevated.js`

`quoteArg`:9, `buildRelaunchCommand`:15, `relaunchAsAdmin`:20, `ensureElevated`:32

## `electron/services/gpubench/GpuBenchService.js`

`enginePath`:18, `Engine`:24 _class_, `next`:32, `send`:45, `ask`:47, `stop`:52, `kill`:57, `GpuBenchService`:60 _class_, `hubUrl`:74, `history`:79, `_save`:80, `remove`:81, `stressHistory`:83, `removeStress`:84, `_token`:86, `status`:90, `viewport`:95, `_engineIntegrity`:102, `_startEngine`:106, `ranking`:113, `rankingUrl`:123, `openRanking`:125, `link`:143, `unlink`:163, `cancel`:170, `_sensorSample`:173, `run`:175, `warm`:194, `record`:200, `stress`:242, `_preview`:306, `_rankedRun`:317

## `electron/services/gpubench/gpuBenchModel.js`

`decodeFrameUs`:13, `frameStats`:21, `scoreOf`:36, `sensorSummary`:43, `pick`:44, `mean`:45, `max`:46, `sampleGpu`:57, `val`:59, `driverFlags`:70, `localPlan`:78

## `electron/services/gpubench/sceneModel.js`

`pcg`:22, `hash2`:29, `tri`:31, `box`:34, `camera`:47, `sub`:58, `cross`:59, `norm`:60, `primaryRay`:63, `hitBox`:73, `castRay`:88, `pixelId`:115, `tileHasEdges`:118, `pickTiles`:127, `tileHash`:137, `sha`:143, `frameRoot`:146, `merkleLevels`:152, `merkleRoot`:163, `merklePath`:166, `verifyPath`:177

## `electron/services/gpubench/stressModel.js`

`normalizeStress`:15, `stressPlan`:25, `isDeviceLost`:32, `finite`:34, `round1`:35, `stability`:38, `clockDrop`:48, `avg`:54, `summarizeStress`:68

## `electron/services/hotkeys/HotkeyService.js`

`HotkeyService`:13 _class_, `_watcher`:21, `_send`:53, `register`:61, `unregister`:75, `dispose`:83

## `electron/services/hotkeys/hotkey.js`

`key`:10, `normalizeHotkey`:26, `isBareKey`:46

## `electron/services/hub/ExtensionHost.js`

`ExtensionHost`:29 _class_, `_ext`:43, `assets`:49, `doc`:55, `response`:66, `log`:79, `getLogs`:86, `_storeFile`:89, `_readStore`:90, `_writeStore`:91, `call`:100, `key`:106, `_fetch`:160, `toText`:180

## `electron/services/hub/HubCatalog.js`

`signedMessage`:14, `verifyDownload`:16, `compareSemver`:30, `p`:31, `permissionGrowth`:45, `list`:46, `hasGrowth`:54, `describeGrowth`:55, `approveGrowth`:61, `HubCatalog`:70 _class_, `server`:81, `setServer`:90, `publicServer`:105, `_json`:107, `search`:115, `detail`:132, `_tier`:138, `download`:141, `inspect`:154, `install`:161, `_countInstall`:169, `updates`:175, `update`:194

## `electron/services/hub/HubMcp.js`

`isLocalFolderPath`:43, `toText`:50, `rpcError`:51, `HubMcp`:53 _class_, `_cfg`:71, `_write`:78, `status`:84, `init`:90, `setEnabled`:92, `regenerateToken`:99, `start`:106, `stop`:118, `_handle`:125, `send`:126, `_rpc`:161, `_approved`:191, `callTool`:196

## `electron/services/hub/HubService.js`

`psTaskList`:32, `taskReadScript`:36, `taskApplyScript`:47, `opFailed`:58, `HubService`:60 _class_, `_load`:75, `_save`:76, `builtins`:78, `hardware`:80, `list`:89, `record`:101, `_opStatus`:103, `_tooOld`:109, `inspect`:120, `_readTasks`:187, `install`:195, `_install`:201, `undo`:233, `failed`:242, `_remove`:311, `uninstall`:334, `exportMine`:351

## `electron/services/hub/builtins.js`

`buildBuiltins`:17, `builtinsJson`:48, `builtinsFromJson`:56

## `electron/services/hub/ext/bridge.js`

`send`:11, `call`:26, `text`:34, `on`:55, `tick`:82

## `electron/services/hub/extensionModel.js`

`scanExtension`:37, `lowerKeys`:50, `validateExtension`:53, `describeExtension`:76, `name`:78, `esc`:89, `buildExtensionDoc`:95, `resolve`:99, `sensorsForExtensions`:125, `num`:126

## `electron/services/hub/extensionPack.js`

`packExtensionFolder`:10, `walk`:15

## `electron/services/hub/hubModel.js`

`lower`:75, `under`:76, `pathOf`:78, `validatePackage`:87, `at`:103, `computeRisk`:184, `conditionMismatch`:203, `num`:205, `anyOf`:211, `hardwareFromRaw`:232, `serviceKey`:254, `stepOf`:257, `resolvePackage`:269, `toChangeSet`:285, `touchedEntries`:303, `describeStep`:322, `pick`:334, `presetFromState`:338, `newerAppNeeded`:358, `parse`:359

## `electron/services/hwsensors/DarkHub.HwSensors.cs`

`Nvml`:29 _class_, `LoadNvml`:37, `ProcInfo`:63 _class_, `Device`:69 _class_, `Num`:129, `U32`:136, `ProcMem`:143, `Dump`:161, `NvRails`:203 _class_, `RailId`:228, `TypeRank`:243, `Gpu`:245 _class_, `Call`:297, `U32`:321, `Fail`:323, `Describe`:330, `F`:364, `Dump`:367, `Probe`:430, `HwSensors`:469 _class_, `Esc`:471, `PawnIoInstalled`:483, `Dump`:489, `IsAdmin`:518, `ReadSmbios`:527, `Main`:555

## `electron/services/hwsensors/pawnio.js`

`installPawnIo`:16

## `electron/services/injectPolicy.js`

`injectTargetRefusal`:12

## `electron/services/kakugan/KakuganClient.js`

`KakuganError`:6 _class_, `sessionFromSetCookie`:17, `KakuganClient`:28 _class_, `loggedIn`:36, `request`:38, `status`:59, `plans`:60, `me`:61, `login`:62, `logout`:63, `dashboard`:66, `orders`:67, `steamLoginStart`:68, `steamLoginPoll`:69, `steamLoginCode`:70, `steamLoginCancel`:71, `updateAccount`:72, `accountInput`:73, `removeAccount`:74, `searchGames`:75, `gameNames`:76

## `electron/services/kakugan/kakuganAlerts.js`

`kakuganAlerts`:12, `push`:14, `accountsToPause`:46

## `electron/services/latencyUndoStore.js`

`isObj`:22, `normalizeTcpPrev`:28, `applied`:39, `shortStr`:40, `regValue`:41, `dword`:42, `persistableUndo`:49, `parseUndoRecord`:101, `writeUndoRecord`:109, `readUndoRecord`:116, `clearUndoRecord`:120

## `electron/services/maintenance/MaintenanceService.js`

`winget`:23, `dueAt`:42, `MaintenanceService`:51 _class_, `_load`:62, `_save`:73, `state`:75, `setTask`:82, `runTask`:94, `_cleanTemp`:122, `_securityLists`:128, `_clamav`:141, `_saveBackups`:148, `_wingetUpdates`:157, `listUpdates`:159, `tick`:177, `start`:186, `stop`:193

## `electron/services/maintenance/schedule.js`

`parseTime`:4, `nextRun`:12, `isDue`:34, `normalizeTask`:41

## `electron/services/metadata/MetadataService.js`

`F`:21, `FF`:23, `planFor`:90, `digits`:110, `asText`:111, `nl`:112, `splitList`:113, `isBinaryValue`:114, `isEmptyValue`:116, `tagName`:117, `tagGroup`:118, `sameValue`:120, `exifDate`:137, `p`:140, `isoDate`:144, `pickByName`:155, `pickFirst`:165, `gpsKeys`:171, `coverKey`:178, `samePath`:180, `n`:181, `runFfmpeg`:185, `createMetadataService`:196, `exiftool`:197, `ffmpeg`:198, `readAllTags`:200, `canonicalValues`:205, `buildGroups`:217, `read`:231, `writeWithExiftool`:284, `writeWithFfmpeg`:329, `writeOoxml`:380, `verify`:394, `uniqueBackupPath`:435, `write`:448

## `electron/services/metadata/exiftoolRunner.js`

`needsFile`:12, `tmpName`:16, `assignArg`:19, `runExiftool`:28, `readTags`:45, `readBinaryTag`:56, `writeTagsTo`:62

## `electron/services/metadata/fileProbe.js`

`ascii`:51, `detectType`:56, `at`:59, `hexDump`:107, `probeFile`:121, `extMatches`:148, `runPs`:157, `parseZoneIdentifier`:176, `readFsInfo`:186, `validStreamName`:211, `removeStream`:215, `toMs`:237, `setFsProps`:245

## `electron/services/metadata/ooxmlZip.js`

`CRC_TABLE`:6, `crc32`:16, `readZipEntries`:22, `entryData`:59, `entryDataAsync`:66, `rewriteZip`:73, `emit`:79, `xmlEscape`:152, `xmlUnescape`:153, `reEsc`:176, `elementRe`:177, `getXmlElement`:181, `setXmlElement`:186, `toW3cdtf`:198, `readOoxmlProps`:207, `find`:209, `writeOoxmlProps`:229, `find`:231

## `electron/services/network/hostValidation.js`

`safeHost`:7, `isSafeHost`:15, `assertSafeHost`:17

## `electron/services/network/networkResetSafety.js`

`foreach`:29, `list`:35, `planNetworkReset`:41, `readNetworkFacts`:65, `networkResetLines`:77

## `electron/services/optimizer/AppManagerEngine.js`

`toArray`:66, `AppManagerEngine`:70 _class_, `runPowerShellJson`:81, `runPowerShell`:91, `_startupFolders`:101, `getStartupItems`:112, `_validateStartupPayload`:174, `disableStartupItem`:194, `getServices`:242, `disableService`:251, `findRegisteredProgram`:294, `_validKeyPath`:300, `_uninstallBlock`:306, `uninstallProgram`:319, `_isSafeLeftoverName`:337, `_isSafeInstallLocation`:350, `uninstallProgramWithLeftovers`:360, `foreach`:392, `foreach`:401, `getInstalledPrograms`:425, `listBloatware`:458, `removeSelectedBloatware`:477, `foreach`:497, `foreach`:498, `nameOf`:516, `getRunningProcesses`:528, `setProcessPriority`:567, `getGpuPreferences`:604, `_validateAppExe`:626, `_readGpuValue`:635, `setGpuPreference`:641, `removeGpuPreference`:657, `getGpuInfo`:666, `getHagsStatus`:685, `setHagsStatus`:694, `revertHags`:708

## `electron/services/optimizer/DeepTweaksEngine.js`

`defineTweak`:49, `buildPublicTweaks`:66, `isMachineDependent`:665, `buildInternalGroups`:668, `snapshotNumber`:712, `DeepTweaksEngine`:753 _class_, `_exclusive`:773, `listTweaks`:780, `ensureResolved`:790, `_resolveMachine`:802, `applyResolution`:814, `getRecommendedIds`:829, `getDefinition`:833, `loadUndoStore`:838, `saveUndoStore`:849, `saveExtra`:863, `getExtra`:867, `clearExtra`:870, `readEntries`:877, `runRegistryOps`:904, `exec`:915, `nativeWrite`:928, `_entriesFor`:966, `_buildSnapshot`:973, `captureSnapshot`:986, `_writtenRows`:996, `_evalDefStatus`:1003, `checkTweaksStatus`:1017, `restartExplorer`:1046, `runLiveAction`:1059, `_applyDefsUnlocked`:1079, `writtenFor`:1125, `_finishRun`:1174, `_summarize`:1185, `_restoreDefsUnlocked`:1245

## `electron/services/optimizer/DefenderControlEngine.js`

`buildImageDefenderRestoreScript`:23, `DefenderControlEngine`:50 _class_, `getStatus`:51, `runNativeDefenderControl`:88, `restoreImageDefender`:149, `openTamperSettings`:171

## `electron/services/optimizer/DnsEngine.js`

`isUsableDnsServer`:35, `buildDnsQuery`:42, `isValidDnsAnswer`:51, `dnsLatencyUdp`:60, `finish`:67, `clampInt`:83, `DnsEngine`:89 _class_, `getPresets`:90, `benchmark`:98, `worker`:106, `_psJson`:125, `getActiveAdapter`:131, `_readServers`:139, `getState`:150, `apply`:163, `undo`:204

## `electron/services/optimizer/ElevationHelper.js`

`waitForElevated`:21, `decodeShellOutput`:37, `encodeVbs`:53, `buildVerifiedBootstrap`:62, `buildCmdRunnerScript`:82, `ElevationHelper`:102 _class_, `isElevated`:107, `_auditScript`:119, `_privateDir`:124, `runMarked`:135, `runElevatedPowerShell`:144, `readSafe`:202, `runElevatedCmd`:239

## `electron/services/optimizer/MemoryEngine.js`

`summarizeMemoryDelta`:12, `MemoryEngine`:17 _class_, `optimizeRAM`:24, `adjustTimerResolution`:85, `optimizeAudioLatency`:96

## `electron/services/optimizer/MoreTweaks.js`

`gpuVendorFromDeviceId`:84, `factsFromProbe`:90, `candidateChanges`:101, `resolveTweak`:118, `get`:125, `telemetryTasksCommands`:161, `autoLoggerCommands`:190, `gpuTweak`:222, `buildMoreTweaks`:227

## `electron/services/optimizer/NetworkEngine.js`

`buildAdvancedNetworkChanges`:20, `buildEeeSetScript`:36, `get`:42, `buildLegacyCleanupScript`:55, `NetworkEngine`:63 _class_, `getActiveAdapterName`:64, `getUpAdapters`:78, `flushDns`:92, `_res`:106, `cleanNetwork`:121, `_eeeReadScript`:137, `advancedNetworkApply`:159, `advancedNetworkRevert`:195, `optimizeGameRoute`:221, `revertGameRoute`:227

## `electron/services/optimizer/OptimizerUtils.js`

`psQuote`:9, `splitRegKey`:21, `isUserHiveKey`:29, `typeToKind`:43, `kindToType`:46, `parseDwordLike`:51, `parseBinaryLike`:59, `canonicalRegValue`:68, `regValueMatches`:90, `sameFamily`:95, `validateChange`:104, `psValueLiteral`:114, `buildRegistryScript`:139, `buildRegistryReadScript`:182, `parseDhResults`:218, `parseRegistryReadOutput`:228, `regEntryId`:257, `snapshotEntryToOps`:265, `fallbackRevertOp`:278, `isRiskyTweak`:288, `pickRecommendedTweaks`:294, `parsePowercfgList`:300, `parseUninstallString`:317, `mergeGpuPreference`:341, `parseGpuPreference`:346, `isCriticalProcessName`:357, `isProtectedService`:369, `isValidServiceName`:372, `isValidIpv4`:376, `formatBytes`:383, `isValidAppxName`:394, `isProtectedAppx`:406, `medianFinite`:412, `isStartupApprovedDisabled`:420, `buildStartupApprovedBytes`:425, `parseDhCommandResults`:438, `buildCommandBlock`:448, `parseDhSnapLines`:457, `bcdValueToArg`:468, `validatePagefileSizes`:476, `isValidFeatureName`:485, `isValidCapabilityName`:490, `isValidExecutionPolicy`:495, `isValidPciInstanceId`:500, `wrapMarkedScript`:509, `DhCheck`:511, `parseMarkedOutput`:521, `startupApprovedTarget`:536, `psPathToRegKey`:561, `bytesToHex`:565, `normalizePriorityName`:571, `isSafeInstallLocationFor`:582, `norm`:584

## `electron/services/optimizer/PowerEngine.js`

`PowerEngine`:14 _class_, `_statePath`:19, `_powercfg`:24, `_fetchPowerPlans`:34, `analyzeHighPerformance`:40, `analyzeBalanced`:45, `_getActiveSchemeGuid`:50, `_ensurePlan`:57, `isUltimateGuid`:71, `_rememberPrevious`:77, `_readPrevious`:83, `_result`:91, `_activate`:106, `setHighPerformance`:138, `setUltimate`:145, `setBalanced`:151, `restorePrevious`:156

## `electron/services/optimizer/ServicesEngine.js`

`scArgFromStartMode`:23, `ServicesEngine`:34 _class_, `_isDarkOS`:36, `_getServiceStartMode`:58, `applyServicesTweak`:64, `revertServicesTweak`:122

## `electron/services/optimizer/StorageEngine.js`

`StorageEngine`:6 _class_, `_getStandardizedTempDirs`:11, `unsafeTemp`:15, `add`:21, `_isProtectedPath`:42, `_walk`:67, `_newState`:108, `_deleteDirContents`:112, `_cleaner`:123, `analyzeTempFiles`:131, `cleanTempFiles`:154

## `electron/services/optimizer/SysOps.js`

`defaultExe`:18, `checkIntegrity`:26, `setEngine`:31, `getEngine`:34, `_configure`:39, `integrityVerdict`:48, `available`:58, `request`:70, `changeToOp`:97, `readRegistry`:107, `writeRegistry`:121

## `electron/services/optimizer/SystemEngine.js`

`SystemEngine`:49 _class_, `_runMarked`:51, `createRestorePoint`:61, `cleanRegistryAndTemp`:93, `repairWindows`:142, `activateWindows`:161, `setPerformanceMode`:172, `_lowLevelReadBlock`:178, `_applyLowLevel`:196, `_revertLowLevel`:221, `_revertLowLevelPlan`:229, `finish`:247, `_pieces`:267, `_markComposite`:272, `_revertComposite`:282, `applyTimerTuning`:314, `revertTimerTuning`:322, `applyHardcoreGamerMode`:330, `revertHardcoreGamerMode`:347, `applyExtremeKernelMod`:360, `revertExtremeKernelMod`:377, `applyExtremeNetworkMod`:390, `readBlock`:392, `revertExtremeNetworkMod`:419, `v`:423, `applyCpuUnpark`:438, `revertCpuUnpark`:476, `_displayPciIds`:507, `_msiKey`:517, `applyMsiMode`:525, `revertMsiMode`:539, `setPagefile`:554, `revertPagefile`:591, `toggleHibernation`:605, `setExecutionPolicy`:619, `toggleFeature`:633, `removeCapabilitiesAndRecall`:660, `restoreCapabilities`:694, `deepCleanOneDrive`:722, `stillInstalled`:731, `deleteRun`:733, `restartExplorer`:759

## `electron/services/optimizer/SystemOptimizerService.js`

`adaptResult`:21, `SystemOptimizerService`:36 _class_, `_tweakOp`:47, `_op`:83, `registerOperations`:94, `registerReverts`:548, `registerProfiles`:573, `_publicOp`:655, `listOperations`:691, `_statusContext`:701, `checkOperationsStatus`:711, `listProfiles`:732, `analyze`:736, `checkIsAdmin`:760, `validateTaskCompatibility`:768, `_runTasksNow`:789

## `electron/services/optimizer/ToolboxEngine.js`

`launch`:9, `done`:12, `ToolboxEngine`:24 _class_, `openAntivirus`:29, `openTaskManager`:38

## `electron/services/optimizer/VisualsEngine.js`

`VisualsEngine`:5 _class_, `disableVisualEffects`:12, `revertVisualEffects`:19

## `electron/services/optimizer/WindowsToolsEngine.js`

`featureById`:46, `summarizeFeatureState`:51, `parseFeatureLines`:60, `featureReadScript`:71, `launch`:82, `finish`:85, `WindowsToolsEngine`:95 _class_, `listFeatures`:101, `setFeature`:108, `openPanel`:147, `run`:154, `resetWindowsUpdate`:161, `repairWinget`:184, `cleanupComponentStore`:200, `removeEdge`:212, `installEdge`:225, `decryptSystemDrive`:235, `autologon`:254

## `electron/services/optimizer/sharedOwners.js`

`appliedKey`:7, `readOwners`:9, `heldByOthers`:15, `partitionShared`:21, `claimShared`:28, `releaseShared`:34, `markApplied`:44, `clearApplied`:45, `isApplied`:46

## `electron/services/optimizer/wuDiagnose.js`

`ipv4`:11, `ipInRange`:16, `wuFindings`:33, `diagnoseWindowsUpdate`:70

## `electron/services/overlay/OverlayService.js`

`OverlayService`:19 _class_, `_saveLayouts`:71, `layoutsState`:73, `saveLayout`:82, `newLayout`:91, `deleteLayout`:97, `activateLayout`:105, `preview`:114, `power`:120, `resetEnergy`:128, `_save`:130, `_emit`:131, `status`:133, `setSettings`:142, `_bindHotkey`:153, `_displays`:161, `_displayIdFromPhysical`:172, `_place`:179, `_ensureWindow`:191, `show`:207, `hide`:225, `toggle`:238, `_closeSession`:240, `p`:243, `_attach`:249, `_track`:267, `_follow`:280, `_restartLoop`:290, `_stopLoop`:297, `_stream`:299, `_render`:306, `add`:323, `_log`:342, `dispose`:369

## `electron/services/overlay/PresentMonService.js`

`PresentMonService`:19 _class_, `installed`:28, `ensure`:30, `running`:54, `start`:57, `finish`:83, `stop`:94

## `electron/services/overlay/customModel.js`

`isNum`:10, `num`:11, `str`:12, `esc`:13, `cssValue`:15, `color`:16, `hw`:25, `gpu`:26, `cpu`:27, `ram`:28, `fr`:29, `ss`:30, `nv`:31, `dv`:32, `rl`:33, `at`:51, `normStyle`:158, `newId`:166, `idOk`:167, `normItem`:169, `normWidget`:183, `normalizeLayout`:209, `hexToRgba`:246, `px`:252, `metricKind`:255, `metricValue`:266, `value`:284, `hash`:308, `renderLayout`:319, `add`:326, `M`:415, `fromPreset`:488, `sampleContext`:494, `hist`:496

## `electron/services/overlay/frameStats.js`

`splitCsv`:4, `createCsvParser`:19, `num`:29, `RangeStat`:46 _class_, `reset`:48, `push`:49, `stats`:56, `pct`:59, `FrameWindow`:62 _class_, `push`:72, `stats`:83, `avg`:90, `reset`:108, `SessionStats`:119 _class_, `reset`:122, `push`:136, `percentile`:157, `stats`:168

## `electron/services/overlay/lhmModel.js`

`finite`:16, `pos`:17, `isSvi2Sentinel`:20, `volts`:21, `hwEntries`:23, `index`:25, `find`:29, `get`:30, `all`:31, `decodeThrottle`:40, `railTone`:51, `avg`:56, `measured`:58, `derivedP`:59, `unavailable`:60, `readLhm`:62, `why`:70, `take`:78, `T`:125, `valueAt`:250, `metric`:260, `provTag`:269

## `electron/services/overlay/overlayModel.js`

`normalizeSettings`:28, `clamp`:29, `pickDisplay`:49, `byId`:50, `v`:58, `n`:59, `readSensors`:62, `reading`:79, `pct`:80, `tone`:82, `buildRows`:89, `why`:91, `f`:115, `cell`:116, `mcell`:118, `buildPanel`:131, `L`:134, `money`:207, `mm`:241, `logRow`:269, `c`:270, `pick`:272

## `electron/services/overlay/powerModel.js`

`psuCurve`:30, `psuEfficiency`:40, `num`:53, `posNum`:54, `fpsPerWatt`:57, `joulesPerFrame`:59, `EnergyMeter`:66 _class_, `reset`:69, `push`:79, `mid`:91, `hasCounter`:101, `gpuJoules`:102, `cpuJoules`:103, `systemPower`:108, `costOf`:125, `str`:139, `normalizeModel`:141, `normalizePower`:154, `clamp`:155, `calibrationFor`:173, `buildDerived`:189, `scenario`:203

## `electron/services/overlay/psuCatalog.js`

`pct`:34, `text`:41, `parseRecord`:49, `parseCatalog`:74, `norm`:85, `searchCatalog`:91, `dateKey`:110, `pickVariant`:116, `by`:118, `PsuCatalog`:132 _class_, `_readCache`:143, `status`:155, `_fetch`:160, `search`:177, `validEntry`:201

## `electron/services/overlay/wallCalibration.js`

`num`:54, `readingSigma`:57, `readingWatts`:63, `windowStats`:80, `checkPoint`:96, `fitXk`:108, `k`:109, `f`:113, `solveCalibration`:141, `calHardwareId`:180, `normalizeCalibration`:192, `calibrationState`:207

## `electron/services/psTools/PsToolkitService.js`

`safeJson`:27, `stamp`:31, `p`:32, `hostsFilePath`:36, `PsToolkitService`:40 _class_, `_dir`:58, `_privateTmp`:63, `_runElevated`:70, `preview`:76, `runTool`:83, `_shape`:109, `_native`:138, `_exportWlan`:146, `listWifiProfiles`:161, `revealWifiKey`:171, `readHosts`:182, `readHostsBackup`:196, `previewHosts`:205, `writeHosts`:212, `isCustomRunning`:224, `send`:240, `decode`:280, `finish`:284, `stopCustom`:298, `_snippetFile`:312, `listSnippets`:316, `_writeSnippets`:326, `saveSnippet`:334, `deleteSnippet`:354, `exportTo`:365

## `electron/services/psTools/psToolBuilders.js`

`getTool`:18, `splitPatterns`:23, `toExcludeWildcards`:31, `isPlainAbsPath`:36, `isDangerousCleanupRoot`:47, `norm`:49, `validateParams`:68, `condition`:126, `toolFlags`:131, `DhOut`:142, `DhHas`:143, `psList`:146, `folderExpr`:147, `fileScan`:150, `Add`:173, `foreach`:361, `displayCommand`:480, `buildPlan`:488, `cleanConsoleLines`:513, `parseWingetTable`:524, `xmlText`:551, `parseWlanProfileXml`:557, `isValidWifiProfileName`:572, `parseHosts`:577, `diffLines`:600, `count`:603, `validateHostsContent`:613, `buildHostsWriteScript`:621, `columnsOf`:635, `cell`:641, `rowsToCsv`:648, `esc`:650, `rowsToText`:659, `fit`:663, `line`:664, `normalizeRows`:668, `validateSnippet`:674

## `electron/services/realtime/ClamAv.js`

`parseClamscan`:21, `freshclamConf`:30, `run`:35, `ClamAv`:58 _class_, `secure`:72, `find`:83, `clamscan`:92, `freshclam`:93, `hasDatabase`:95, `databaseAge`:102, `status`:106, `install`:110, `update`:133, `scan`:143

## `electron/services/realtime/HashDb.js`

`HashDb`:8 _class_, `lookup`:27

## `electron/services/realtime/Quarantine.js`

`xorStream`:18, `transcode`:32, `lockDownDir`:48, `run`:51, `foreignOwnedFiles`:63, `secureDir`:85, `Quarantine`:92 _class_, `ensureRoot`:107, `paths`:119, `add`:128, `public`:159, `list`:164, `restore`:176, `remove`:200

## `electron/services/realtime/RealtimeOptimizer.js`

`shouldTrim`:18, `nextCooldownMin`:24, `planRuleActions`:29, `RealtimeOptimizer`:42 _class_, `running`:55, `start`:57, `stop`:70, `status`:77, `record`:82, `memoryTick`:89, `rulesTick`:112

## `electron/services/realtime/RealtimeProtection.js`

`isScanCandidate`:26, `sha256File`:32, `RealtimeProtection`:39 _class_, `running`:55, `start`:57, `stop`:72, `status`:82, `scanNow`:87, `record`:91, `changed`:99, `settle`:108, `enqueue`:122, `drain`:129, `scanOne`:139, `flushClam`:160, `markClean`:176, `detected`:181

## `electron/services/realtime/realtimeConfig.js`

`clamp`:7, `normalizeRule`:11, `effectiveRules`:37, `normalizeFolder`:43, `defaults`:48, `normalize`:73, `ConfigStore`:104 _class_, `read`:111, `update`:115

## `electron/services/recovery/DiskRecoveryService.js`

`defaultExe`:11, `normalizeTarget`:17, `diskNumberOf`:25, `int`:30, `createLineParser`:37, `parseLine`:47, `DiskRecoveryService`:56 _class_, `available`:66, `_missing`:70, `_ready`:76, `run`:84, `finish`:114, `reserve`:129, `release`:135, `status`:139, `cancel`:144, `_backupPath`:153, `_writeFlags`:163, `listDrives`:174, `inspectDisk`:176, `readSector`:178, `writeSector`:182, `repairHeader`:190, `setActive`:201, `backupTable`:206, `restoreBackup`:212, `clone`:221, `verify`:239, `surfaceTest`:246, `startCarving`:252, `smart`:265

## `electron/services/recovery/PartitionService.js`

`defaultScript`:16, `partitionRole`:39, `bitlockerState`:46, `withRawBitlocker`:55, `fingerprint`:67, `freeGaps`:73, `asList`:86, `letterOf`:87, `shapeListing`:93, `PartitionService`:208 _class_, `list`:221, `_exec`:231, `_payload`:252, `_probeLocks`:260, `_settleBitlocker`:268, `_context`:279, `limits`:312, `plan`:318, `apply`:334

## `electron/services/recovery/partition-ops.ps1`

`Send-Result`:13, `Stop-Refused`:17, `Get-DiskPartitions`:19, `Assert-Target`:23, `Invoke-Format`:45

## `electron/services/recovery/partitionPolicy.js`

`whole`:19, `alignedMib`:24, `fileSystem`:29, `label`:33, `driveLetter`:39, `normalizeRequest`:46, `diskBlockers`:66, `partitionBlockers`:86, `volumeInUse`:96, `createChecks`:98, `resizeChecks`:110, `evaluate`:124, `predict`:175, `verify`:198, `at`:201

## `electron/services/restore/RestoreService.js`

`DETECT_SCRIPT`:14, `foreach`:49, `run`:57, `RestoreService`:61 _class_, `status`:67, `install`:77, `_elevated`:100, `_capability`:106, `_feature`:123, `_store`:141, `_msStore`:152, `_winget`:166

## `electron/services/restore/componentCatalog.js`

`getComponent`:51, `componentStatus`:57, `restoreErrorText`:83, `sxsFromRoot`:90

## `electron/services/saves/SaveBackupService.js`

`sha256File`:18, `run`:22, `safeName`:25, `templatePrefix`:29, `regFileOnlyHkcu`:32, `SaveBackupService`:46 _class_, `settings`:58, `setSettings`:69, `_env`:76, `_ensureIndex`:98, `_collect`:140, `_gameDir`:154, `versions`:156, `scan`:165, `_match`:183, `backup`:190, `_rotate`:240, `previewRestore`:248, `_gameRunning`:264, `restore`:271, `removeVersion`:307, `backupAll`:314, `onGameClosed`:324

## `electron/services/saves/manifestIndexer.js`

`isWindows`:7, `buildIndex`:9

## `electron/services/saves/savePaths.js`

`resolveTemplate`:15, `nameKey`:29, `matchGames`:36, `globToRegex`:56, `expandGlob`:63, `addTree`:66, `walk`:79, `staticPrefix`:103

## `electron/services/screenPicker/ScreenPicker.js`

`ScreenPicker`:10 _class_, `pick`:18, `_pick`:23, `finish`:34, `onResult`:36, `sleep`:74

## `electron/services/secureStaging.js`

`defaultStagingRoot`:17, `lockdownArgs`:22, `ownerArgs`:25, `defaultRunIcacls`:29, `isProcessElevated`:40, `isLink`:52, `icaclsOrThrow`:54, `prepareRoot`:65, `p`:67, `_resetStagingCache`:85, `createSecureStagingDir`:94, `writeStagedFile`:130, `sha256FileSync`:136, `assertUnchanged`:141

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

## `electron/services/ssh/PortForwardService.js`

`TunnelError`:5 _class_, `probeLocalPort`:13, `parseSocksGreeting`:26, `parseSocksRequest`:34, `socksReply`:62, `PortForwardService`:68 _class_, `status`:77, `list`:83, `emit`:87, `track`:97, `cleanup`:102, `start`:117, `listen`:180, `handleSocks`:188, `fail`:191, `onData`:193, `teardown`:224, `stop`:237, `stopAll`:243, `autoStart`:248

## `electron/services/ssh/SerialService.js`

`encode`:65, `SerialError`:72 _class_, `validateSerialOptions`:79, `SerialService`:93 _class_, `listPorts`:101, `status`:125, `settle`:129, `output`:153, `flush`:160, `write`:168, `sendBreak`:179, `has`:185, `finish`:187, `close`:196, `closeBySender`:206, `closeAll`:210

## `electron/services/ssh/SftpService.js`

`SftpError`:17 _class_, `isDirMode`:28, `modeString`:30, `normalizeRemote`:38, `normalizeLocal`:44, `isSafeLocalName`:57, `sanitizeLocalName`:66, `isInsideLocal`:74, `editLocalName`:82, `protectedLocalRoots`:93, `parseMode`:99, `decodeText`:109, `encodeText`:124, `remoteEntry`:131, `p`:147, `shq`:151, `execCapture`:155, `sftpOverStream`:174, `fail`:215, `openSudoSftp`:229, `permErr`:249, `notFound`:250, `SftpService`:257 _class_, `open`:275, `assertLocalWritable`:306, `dropped`:318, `handle`:323, `close`:329, `listLocal`:342, `listDrives`:357, `listRemote`:363, `side`:378, `remoteExists`:409, `remoteRename`:414, `remoteReplace`:431, `walk`:461, `visit`:463, `transfer`:491, `emit`:524, `copyFile`:540, `fail`:556, `cancelTransfer`:627, `readText`:635, `readAll`:651, `writeText`:668, `writeBuf`:690, `stat`:715, `du`:730, `editExternal`:739, `fail`:752, `check`:758, `fail`:774, `stopWatch`:796, `listWatches`:806, `removeRemote`:811, `fsOp`:825, `q`:867, `closeAll`:883

## `electron/services/ssh/SshSessionManager.js`

`SshConnectError`:19 _class_, `classifyError`:27, `errorCode`:33, `safeMessage`:41, `stripAnsi`:46, `makeDecoder`:50, `SshSessionManager`:62 _class_, `Client`:75, `resolveHostKey`:82, `pendingPrompts`:94, `makeVerifier`:98, `cancelPromptsOf`:120, `resolveAuthPrompt`:127, `pendingAuthPrompts`:138, `makeKeyboardHandler`:142, `authFor`:167, `connectOne`:184, `connectClient`:229, `drop`:248, `status`:280, `runStartupSnippets`:316, `startLog`:326, `setLogging`:341, `push`:349, `flush`:363, `finish`:377, `write`:391, `resize`:407, `disconnect`:415, `disconnectBySender`:423, `listSessions`:427, `disposeAll`:431

## `electron/services/ssh/SshVaultStore.js`

`SshVaultError`:26 _class_, `fail`:33, `now`:34, `newId`:35, `str`:36, `req`:37, `optId`:42, `validPort`:43, `tags`:48, `hostname`:52, `emptyData`:59, `normalizeTerminalSettings`:75, `n`:76, `b`:77, `SshVaultStore`:97 _class_, `load`:111, `save`:131, `encrypt`:140, `decrypt`:145, `credentialSummary`:152, `getState`:161, `getSettings`:177, `saveSettings`:182, `saveGroup`:191, `deleteGroup`:225, `getHost`:236, `resolveJumpChain`:242, `saveHost`:258, `deleteHost`:313, `touchHost`:326, `saveCredential`:334, `generateKey`:388, `deleteCredential`:413, `getAuthMaterial`:423, `findKnownHost`:433, `checkHostKey`:443, `trustKnownHost`:454, `deleteKnownHost`:480, `getSnippet`:489, `savePackage`:494, `saveSnippet`:513, `deleteSnippet`:539, `getTunnel`:556, `saveTunnel`:561, `deleteTunnel`:601, `addSessionLog`:610, `updateSessionLog`:629

## `electron/services/ssh/snippetTemplate.js`

`SnippetArgError`:10 _class_, `placeholdersOf`:19, `normalizeArgsSchema`:26, `shellQuote`:42, `renderSnippet`:53

## `electron/services/ssh/sshConfigParser.js`

`unquote`:5, `parseSshConfig`:10, `wildcard`:33

## `electron/services/ssh/sshKeys.js`

`utils`:6, `fingerprintOfBlob`:9, `keyTypeOfBlob`:14, `hostKeyInfo`:23, `publicKeyInfo`:29, `rsaBits`:36, `next`:40, `algorithmOf`:49, `parsePrivateKey`:60, `generateSshKeyPair`:84, `done`:88

## `electron/services/startup/StartupService.js`

`Approved`:16, `foreach`:41, `StartupService`:68 _class_, `_history`:73, `_record`:74, `list`:79, `_toggleScript`:98, `setEnabled`:120, `undo`:144

## `electron/services/startup/elevatedTaskSafety.js`

`elevatedTaskTargets`:11, `UNTRUSTED_WRITERS_SCRIPT`:19, `foreach`:27, `parseUntrustedWriters`:40, `findUntrustedWriters`:52, `unsafeFolderMessage`:63

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

## `electron/services/textFile.js`

`decodeTextBuffer`:14, `encodeText`:42, `writeFileAtomic`:53, `readTextFile`:74, `writeTextFile`:78

## `electron/services/upscale/Autopilot.js`

`findExe`:14, `Autopilot`:24 _class_, `installed`:30, `latest`:41, `status`:50, `launch`:77

## `electron/services/upscale/DlssUpdater.js`

`RAW`:13, `scanGameFolder`:23, `walk`:26, `safe`:44, `verifySignature`:46, `DlssUpdater`:59 _class_, `latest`:67, `officialDll`:78, `inspect`:94, `restore`:126, `record`:139

## `electron/services/upscale/pe.js`

`readRange`:7, `fileVersionFromBuffer`:14, `peFileVersion`:26, `isPe64`:38, `compareVersions`:52

## `electron/services/usb/UsbService.js`

`foreach`:27, `Ms`:33, `buildInputDisableScript`:57, `UsbService`:69 _class_, `_keepFlag`:75, `list`:79, `_run`:94, `setDeviceEnabled`:100, `keepDisabled`:121, `setStorageBlocked`:135, `setWriteProtect`:140, `setSelectiveSuspend`:148, `eject`:159

## `electron/services/usb/usbModel.js`

`parseLocation`:5, `isController`:10, `isHub`:11, `buildPorts`:19, `portOf`:21, `canToggle`:58, `parseHistory`:65

## `electron/services/vaultBridge/bridgeServer.js`

`isLoopbackAddress`:27, `VaultBridgeServer`:35 _class_, `running`:62, `start`:66, `stop`:83, `disconnectClient`:97, `connectedClientIds`:107, `onConnection`:113, `cleanup`:151, `fail`:163, `send`:167, `onFrame`:172, `handle`:208, `findSameLogin`:284, `withPrompt`:293, `pairRequest`:312, `saveRequest`:343

## `electron/services/vaultBridge/domainMatch.js`

`isIPv4`:50, `isIPv6`:54, `isIpHost`:58, `isLoopbackHost`:62, `stripWww`:67, `registrableDomain`:75, `defaultPort`:95, `parsePageUrl`:103, `parseEntrySite`:117, `matchSite`:137, `findMatchingEntries`:169, `sameSite`:185, `siteForSavedLogin`:195

## `electron/services/vaultBridge/nativeHost.js`

`isBrowserId`:31, `buildHostManifest`:36, `manifestFileName`:50, `defaultRunReg`:54, `bundledHostCandidates`:63, `sha256File`:71, `NativeHostRegistry`:75 _class_, `hostExePath`:87, `manifestPath`:91, `defaultFindBundledExe`:95, `installHostExe`:115, `register`:132, `unregister`:146, `readRegValue`:157, `status`:166, `statusAll`:184, `anyRegistered`:188, `writeBridgeConfig`:194

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

`toB64`:3, `fromB64`:7, `derivePasswordFromRecoveryWords`:18, `recoveryDeriveOrder`:32, `wrapVaultKeyWithRecoveryWords`:37, `generateRecoveryWords`:42, `buildDefaultWordList`:55, `scryptKey`:164, `aesGcmEncrypt`:190, `aesGcmDecrypt`:198, `buildKdf`:211, `wrapVaultKeyWithPassword`:223, `unwrapVaultKeyWithPassword`:229, `encryptVaultData`:235, `decryptVaultData`:241

## `electron/ytdlp.js`

`platformAssetName`:11, `parseChecksumList`:23, `fetchExpectedChecksum`:31, `ensureYtDlp`:45, `ensureFfmpeg`:78, `killTree`:143, `cancelActiveYtDlp`:153, `runYtDlp`:162

## `install.ps1`

`Start-DarkHubInstall`:6

## `native_cleaner/src/browsers.rs`

`is_sqlite`:20, `chromium`:25, `find`:44, `in_use`:78, `file_len`:91, `one`:95, `vacuum`:133

## `native_cleaner/src/files.rs`

`is_reparse`:10, `check_links`:23, `shred_file`:62, `open_for_shred`:96, `open_for_shred`:112, `delete_file`:121, `walk`:140, `run`:193

## `native_cleaner/src/main.rs`

`parse`:42, `get`:62, `flag`:65, `env_of`:70, `read_winapp2`:78, `read_ids`:87, `reg_exists`:93, `reg_sources`:104, `recycle_target`:114, `recycle_run`:123, `run`:169, `main`:242

## `native_cleaner/src/recycle.rs`

`query`:7, `empty`:17, `size_of`:42, `is_reparse`:55, `is_reparse`:60, `orphans_in`:65, `remove_orphan`:84, `user_bin_dirs`:97, `current_user_sid`:118

## `native_cleaner/src/registry.rs`

`drop`:17, `wide`:22, `hive`:26, `split`:37, `open`:42, `exists`:49, `text`:61, `info`:71, `values`:79, `value`:97, `subkeys`:101, `delete_value`:115, `delete_tree`:119, `set`:124, `create`:130, `sz`:139, `esc`:145, `hex_list`:149, `value_line`:163, `write_reg_file`:202, `system`:232, `test`:256, `id`:283, `to_json`:286, `expand_env`:291, `absolute`:316, `missing`:322, `wow_path`:332, `command_target`:347, `scan`:367, `clean`:432

## `native_cleaner/src/safety.rs`

`from_process`:32, `rooted`:71, `one`:95, `roots`:99, `check_rule`:131, `matched_root`:174, `denied_programdata`:179, `is_protected_file`:192, `is_protected_pattern`:199, `is_protected_dir`:203, `norm`:208, `is_plain_absolute`:217, `depth_under`:223

## `native_cleaner/src/tests.rs`

`tmp`:12, `put`:19, `no_reg`:24, `wildcard_matching`:29, `rules_outside_expected_folders_are_refused`:39, `winapp2_parsing_detection_and_validation`:60, `protected_files_survive_and_shred_unlinks`:121, `shred_overwrites_before_unlink`:142, `shred_never_overwrites_through_hard_links`:158, `builtin_targets_parse`:172, `make_db`:180, `browser_vacuum_shrinks_and_keeps_rows`:191, `values_of`:226, `command_lines`:233, `wow_redirect_is_case_insensitive`:242, `scan_backup_clean_and_restore`:251, `test_root_is_confined`:329, `rules_aimed_at_passwords_are_refused`:336, `recycle_bin_is_never_touched_in_test_mode`:352, `junction`:364, `literal_segments_through_junctions_are_refused`:372, `recycle_orphans_found_and_removed_without_following_junctions`:417

## `native_cleaner/src/util.rs`

`from`:18, `emit`:35, `wild_match`:43, `has_wild`:69, `seeded`:77, `fill`:81

## `native_cleaner/src/winapp2.rs`

`excluded`:124, `to_json`:135, `parse`:148, `category_of`:166, `expand`:184, `expand_wild`:208, `exists_wild`:235, `detected`:239, `build`:280, `load_all`:354

## `native_disk/src/carve.rs`

`get`:48, `u8`:64, `be16`:67, `be32`:70, `le32`:73, `le64`:76, `find`:80, `jpeg_len`:99, `png_len`:145, `gif_sub_blocks`:163, `gif_len`:176, `bmp_len`:207, `pdf_len`:216, `zip_len`:235, `zip_kind`:250, `sqlite_len`:270, `sevenz_len`:281, `mp4_len`:288, `measure`:334, `type_enabled`:361, `carve`:365

## `native_disk/src/copy.rs`

`mark`:24, `tolerant_read`:33, `copy_region`:68, `hash_region`:96, `surface_test`:122

## `native_disk/src/device.rs`

`size`:8, `sector_size`:10, `read_at`:12, `write_at`:14, `flush`:15, `total_sectors`:16, `open`:28, `create`:38, `not_a_file`:47, `refuse_raw_device`:51, `regular_file_len`:60, `norm`:77, `strip_ns_prefix`:82, `is_raw_device_path`:89, `pread`:110, `pread`:115, `pwrite`:120, `pwrite`:125, `read_full`:130, `write_full`:144, `size`:157, `sector_size`:160, `read_at`:163, `write_at`:166, `flush`:172, `read_sectors`:178, `read_bytes`:187, `parse`:213, `display`:230, `open_target`:238, `as_slice`:262, `as_mut_slice`:265

## `native_disk/src/main.rs`

`parse`:30, `get`:53, `flag`:56, `need`:59, `num`:62, `target`:65, `sector`:69, `system_disks`:74, `guard_write`:83, `region_of`:100, `plan_result`:115, `hex_rows`:128, `read_sector_cmd`:141, `write_sector_cmd`:176, `clone_cmd`:194, `finish_copy`:245, `run`:279, `main`:415

## `native_disk/src/parts.rs`

`u16le`:6, `u32le`:9, `u64le`:12, `parse_mbr`:34, `mbr_type_name`:48, `build_mbr`:65, `valid`:122, `guid_str`:127, `gpt_type_name`:137, `header_crc`:156, `read_gpt_at`:162, `parse_gpt_entries`:198, `relocate_header`:223, `read_gpt_state`:244, `detect_vbr`:277, `detect_fs`:322, `fs_kind`:345, `partitions`:366, `gpt_json`:406, `inspect`:420

## `native_disk/src/repair.rs`

`describe`:24, `disk_identity`:51, `save_backup`:77, `check_target`:112, `load_backup`:126, `apply`:165, `plan_restore_gpt`:192, `plan_fix_gpt_after_grow`:259, `scan_vbrs`:294, `plan_rebuild_mbr`:344, `plan_set_active`:397

## `native_disk/src/tests.rs`

`tmp`:15, `gpt_header`:23, `ntfs_vbr`:42, `build_gpt`:55, `open`:83, `inspect_reads_gpt_and_ntfs`:88, `restores_wiped_primary_gpt_and_protective_mbr`:104, `backup_refuses_other_disk`:139, `rebuilds_backup_gpt_from_primary`:173, `dry_run_plan_does_not_write`:187, `scan_finds_ntfs_from_backup_boot_sector_and_rebuilds_mbr`:201, `clone_to_larger_image_moves_gpt_backup_and_verifies`:228, `partition_region_and_image_roundtrip`:253, `guard_refuses_system_disk_and_unconfirmed_writes`:269, `target_parse_normalises_win32_device_prefixes`:280, `file_device_refuses_non_regular_files`:300, `exfat_vbr_rejects_invalid_shifts`:308, `carve_measure_survives_wrapping_mp4_and_ff_runs`:330, `jpeg`:357, `png`:366, `zip_docx`:380, `sqlite`:411, `pdf`:419, `carves_planted_files_with_exact_sizes`:424, `surface_test_maps_whole_image`:455, `disks_of_path_resolves_local_and_refuses_unknown`:468

## `native_disk/src/util.rs`

`from`:20, `cancelled`:43, `reset_cancel`:48, `listen_for_cancel`:53, `emit`:65, `silent`:83, `elapsed`:86, `tick`:89, `event`:113, `hex`:120, `unhex`:124

## `native_disk/src/win.rs`

`ioctl`:32, `u32le`:53, `u64le`:56, `disk_path`:60, `open_query`:65, `geometry`:76, `bus_name`:107, `descriptor_string`:131, `device_info`:140, `wide`:165, `from_wide`:168, `volume_extents`:173, `volumes`:188, `system_disks`:221, `list_drives`:241, `disks_of_path`:275, `probe_locks`:313, `set_force_dismount`:348, `lock_volumes`:352, `open`:399, `size`:429, `sector_size`:432, `read_at`:435, `write_at`:459, `flush`:485

## `native_gpubench/src/audit.rs`

`intact`:61, `u32_at`:62, `ptr`:63, `func`:66, `driver`:72, `read_drs`:80, `QueryPerformanceCounter`:152, `QueryPerformanceFrequency`:153, `clocks`:165, `clock_report`:181

## `native_gpubench/src/gpu.rs`

`wndproc`:126, `heap_props`:133, `buffer_desc`:137, `tex_desc`:144, `create`:151, `barrier`:157, `uav_barrier`:172, `bytecode`:180, `compute_pso`:184, `graphics_pso`:189, `root_signature`:210, `place`:232, `loaded_modules`:240, `dot`:256, `sun_dir`:258, `frame_cb`:264, `cpu_handle`:401, `gpu_handle`:404, `write_descriptors`:409, `init_rt`:452, `wait_value`:532, `wait_idle`:540, `hwnd_raw`:547, `pump`:549, `ids_to`:561, `record`:568, `submit`:683, `collect`:696, `gpu_clock`:714, `segment`:723, `capture`:763, `read_ldr`:782, `read_texture`:790, `drop`:821

## `native_gpubench/src/main.rs`

`say`:17, `u32s_b64`:23, `vectors`:30, `run`:46, `main`:143

## `native_gpubench/src/proof.rs`

`frame_root`:6, `pair`:10, `levels`:17, `merkle_root`:27, `merkle_path`:33, `hex`:45

## `native_gpubench/src/scene.rs`

`pcg`:14, `hash2`:20, `tri`:24, `box_at`:34, `camera`:50, `basis`:61

## `native_pacer/examples/pacer_testapp.rs`

`RegisterClassW`:98, `CreateWindowExW`:99, `DefWindowProcW`:100, `PeekMessageW`:101, `TranslateMessage`:102, `DispatchMessageW`:103, `GetDC`:104, `ChoosePixelFormat`:108, `SetPixelFormat`:109, `SwapBuffers`:110, `wglCreateContext`:114, `wglMakeCurrent`:115, `wglGetProcAddress`:116, `wglSwapBuffers`:117, `glClearColor`:118, `glClear`:119, `D3D11CreateDeviceAndSwapChain`:123, `GetModuleHandleW`:126, `GetProcAddress`:127, `wndproc`:130, `wide`:134, `vfn`:138, `adapter_luid`:142, `run`:163, `main`:289, `main`:294

## `native_pacer/src/bin/inject_x86.rs`

`OpenProcess`:33, `CloseHandle`:34, `GetProcessTimes`:35, `GetExitCodeProcess`:36, `GetExitCodeThread`:37, `GetCurrentProcess`:38, `GetCurrentProcessId`:39, `ProcessIdToSessionId`:40, `IsWow64Process`:41, `GetModuleHandleW`:42, `GetProcAddress`:43, `VirtualAllocEx`:44, `VirtualFreeEx`:45, `WriteProcessMemory`:46, `CreateRemoteThread`:47, `WaitForSingleObject`:48, `GetLastError`:49, `GetFileAttributesW`:50, `OpenProcessToken`:55, `GetTokenInformation`:56, `EqualSid`:57, `out`:79, `wide`:84, `pe_machine`:89, `drop`:106, `token_user`:113, `target_machine`:129, `protection_level`:149, `main`:164, `main`:299, `main`:306

## `native_pacer/src/lib.rs`

`CreateWindowExA`:152, `DestroyWindow`:166, `timeBeginPeriod`:171, `timeEndPeriod`:172, `QueryPerformanceCounter`:176, `QueryPerformanceFrequency`:177, `VirtualProtect`:178, `CreateFileMappingW`:179, `OpenFileMappingW`:180, `MapViewOfFile`:181, `CloseHandle`:182, `GetCurrentProcessId`:183, `GetCurrentThreadId`:184, `GetCurrentProcess`:185, `Sleep`:186, `LoadLibraryA`:187, `GetModuleHandleA`:188, `GetModuleHandleExW`:189, `FreeLibrary`:190, `FreeLibraryAndExitThread`:191, `K32EnumProcessModules`:192, `GetProcAddress`:193, `CreateThread`:194, `CreateWaitableTimerExW`:195, `SetWaitableTimer`:196, `WaitForSingleObject`:197, `get_qpc_ms`:330, `precision_wait`:340, `hist_recent`:367, `push_sample`:371, `compute_stats`:380, `publish`:430, `evaluate_config`:479, `current_directive`:502, `vfn`:526, `com_release`:531, `pack_luid`:540, `query_swapchain_luid`:549, `eligible`:596, `is_main_swapchain`:601, `main_is_eligible`:656, `perform_pacing`:666, `enter`:737, `drop`:744, `drain_hooked_calls`:751, `enter_present`:765, `leave_present`:774, `hooked_present`:781, `hooked_present1`:793, `gl_present`:836, `hooked_gdi_swap`:853, `hooked_gdifull_swap`:856, `hooked_wgl_swap`:859, `resolve_gl_targets`:863, `already_patched`:879, `patch_module_iat`:890, `patch_module_delay_iat`:941, `patch_thunks`:986, `install_gl_hooks`:1018, `remove_gl_hooks`:1046, `map_named`:1061, `setup_shared_memory`:1080, `patch_slot`:1107, `install_vtable_hooks`:1122, `remove_vtable_hooks`:1219, `restore_vtable_slot`:1229, `init_thread`:1248, `init_thread_body`:1258, `DllMain`:1287, `reset`:1341, `stats_come_only_from_real_samples`:1347, `low01_unavailable_with_few_samples`:1366, `telemetry_layout_matches_reader`:1378, `config_layout_is_fixed`:1386, `cfg`:1407, `fresh_heartbeat_applies_the_cap`:1426, `stale_or_missing_heartbeat_passes_through`:1433, `disabled_uncapped_or_foreign_blocks_pass_through`:1441, `adapter_filter`:1458

## `native_pacer/tests/e2e.ps1`

`Start-App`:19, `Get-Samples`:30, `Mean-Fps`:34, `Start-Limiter`:41, `Kill-Limiter`:60, `Last-Status`:66, `Wait-AppSecond`:72, `Test-Cap`:78, `Inject-Once`:105, `Test-Safety`:110, `Test-Luid`:148

## `native_sysops/src/main.rs`

`fail`:23, `str_field`:27, `result`:32, `run_op`:39, `handle`:87, `main`:106, `protocol_and_validation`:126

## `native_sysops/src/reg.rs`

`root`:17, `wide`:26, `err_text`:30, `not_found`:40, `drop`:46, `open`:51, `create`:58, `query_raw`:68, `utf16`:89, `decode_sz`:94, `decode_multi`:101, `kind_and_value`:120, `read`:137, `encode`:151, `set`:168, `delete_value`:177, `delete_key`:189, `delete_key_if_empty`:209, `p`:234, `roundtrip_every_type_in_hkcu`:237

## `native_sysops/src/values.rs`

`split_key`:27, `valid_name`:50, `depth`:55, `value_to_string`:69, `parse_dword`:82, `parse_qword`:107, `parse_binary`:123, `parse_multi`:137, `parse_data`:145, `hex`:158, `keys_follow_split_reg_key`:168, `dword_matches_parse_dword_like`:184, `qword_binary_multi`:197

## `scripts/dev.mjs`

`argPage`:19, `say`:24, `killTree`:28, `killStaleDev`:37, `esc`:39, `waitForVite`:44, `tryOnce`:47, `prefix`:61, `startElectron`:74, `restartElectron`:91, `shutdown`:119

## `scripts/ext.mjs`

`$`:46, `show`:59

## `scripts/gen-integrity.mjs`

`listBinaries`:15, `walk`:17, `collect`:29

## `scripts/gpubench-check.mjs`

`u32s`:12, `next`:26, `send`:27

## `scripts/hub-docs.mjs`

`cell`:17, `value`:18, `builtinMarkdown`:20, `builtinJsonText`:85

## `src/App.tsx`

`pageFromHash`:59, `PageLoading`:64 _component_, `App`:79 _component_, `onHash`:94, `reportRenderError`:100, `renderPage`:104

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

`GuardianWidget`:9 _component_, `beep`:26, `refresh`:50, `disableOverlay`:95, `onConfig`:112, `fmt`:122

## `src/components/HelpTip.tsx`

`HelpSection`:4 _type_, `HelpTipProps`:9 _type_, `HelpTip`:18 _component_

## `src/components/HotkeyCapture.tsx`

`HotkeyCapture`:12 _component_, `onKey`:26, `onMouse`:39, `stop`:48

## `src/components/OptimizationScoreCard.tsx`

`OptimizationScoreCardProps`:4 _type_, `OptimizationScoreCard`:9 _component_

## `src/components/OptimizerProgress.tsx`

`OptimizerProgressProps`:5 _type_, `OptimizerProgress`:11 _component_

## `src/components/ReleaseNotes.tsx`

`Text`:4 _component_, `ReleaseNotes`:19 _component_

## `src/components/SystemInfoCard.tsx`

`SystemInfoCardProps`:5 _type_, `tone`:11, `SystemInfoCard`:13 _component_

## `src/components/UpdaterOverlay.tsx`

`UpdateStage`:10 _type_, `UpdaterOverlay`:15 _component_, `handleEvent`:27, `initUpdater`:77, `handleStartDownload`:119, `handleApplyInstall`:137

## `src/components/VulkanLowLatencyCard.tsx`

`VulkanLowLatencyCard`:12 _component_, `apply`:32

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

`Props`:7 _type_, `api`:13, `Rail`:15 _type_, `GpuRails`:20 _component_, `tick`:26, `fmt`:38, `AdvancedSensorsPanel`:66 _component_, `toggle`:76, `missing`:92

## `src/components/monitor/LhmSensorTree.tsx`

`LhmSensor`:5 _type_, `LhmHardware`:6 _type_, `LhmData`:7 _type_, `kindIcon`:37, `fmt`:39, `LhmSensorTree`:51 _component_, `match`:59

## `src/components/monitor/PowerPanel.tsx`

`api`:9, `f`:10, `Row`:13 _component_, `Block`:22 _component_, `isLowRail`:33, `RailRows`:36 _component_, `val`:39, `PowerSettingsForm`:73 _component_, `num`:75, `PowerPanel`:121 _component_, `set`:135, `cpuVal`:151, `money`:154, `kwh`:155

## `src/components/monitor/PsuCatalogPicker.tsx`

`api`:6, `eff`:7, `voltLabel`:8, `PsuCatalogPicker`:14 _component_, `search`:21, `use`:29, `errText`:37

## `src/components/monitor/WallCalibration.tsx`

`Step`:10 _type_, `Sample`:11 _type_, `fmt`:13, `ReadingInput`:16 _component_, `field`:25, `Stability`:57 _component_, `WallCalibration`:74 _component_, `ov`:92, `gb`:93, `tick`:102, `capture`:121, `reset`:130, `captureIdle`:132, `confirmIdle`:138, `startLoad`:145, `stopLoad`:166, `confirmLoad`:180, `save`:192, `errText`:205, `date`:206

## `src/components/network/LatencyLab.tsx`

`net`:6, `Sample`:13 _type_, `stats`:16, `r1`:18, `fmt`:34, `Metric`:36 _component_, `usePresets`:46, `LatencyChart`:56 _component_, `x`:62, `y`:63, `LiveLatencyPanel`:86 _component_, `start`:98, `stop`:119, `pickPreset`:122, `RouteMtuPanel`:186 _component_, `trace`:194, `findMtu`:201, `BufferbloatPanel`:283 _component_, `run`:289, `gradeTone`:294, `DnsRow`:337 _type_, `DnsBenchPanel`:339 _component_, `opt`:341, `bench`:353, `apply`:360, `undo`:368, `TweakDef`:440 _type_, `LatencyTweaksPanel`:442 _component_, `act`:457, `apply`:465, `restore`:466, `propText`:469, `card`:479

## `src/components/optimizer/WindowsToolsPanel.tsx`

`FeatureState`:6 _type_, `api`:15, `WindowsToolsPanel`:18 _component_, `exec`:37, `toggleFeature`:49, `stateLabel`:55

## `src/components/optimizer/WuDiagnosis.tsx`

`Finding`:5 _type_, `fill`:7, `WuDiagnosis`:13 _component_, `diagnose`:19, `fix`:28

## `src/components/overlay/OverlayStage.tsx`

`ok`:15, `drawCanvases`:18, `OverlayStage`:59 _component_, `down`:107, `move`:108, `up`:113

## `src/components/overlay/sanitizeCss.ts`

`decodeHarmlessEscapes`:12, `isExternalCssUrl`:20, `sanitizeImportedCss`:30

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

`CarvingManager`:14 _component_, `pick`:38, `start`:43, `toggle`:51

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

`api`:4, `fmtBytes`:6, `fmtEta`:13, `ProgressEv`:30 _type_, `JobProgress`:32 _component_, `rescueError`:59, `ErrorLine`:64 _component_

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

## `src/components/ssh/EditorTabView.tsx`

`languageFor`:38, `EditorTabView`:45 _component_, `reload`:159, `changeEol`:164

## `src/components/ssh/HostsView.tsx`

`HostDrawer`:12 _component_, `set`:18, `save`:19, `PasswordPrompt`:80 _component_, `useConnect`:92, `connect`:94, `HostsView`:106 _component_, `del`:123, `saveGroup`:129, `delGroup`:136, `previewImport`:142, `doImport`:149, `hostCount`:155

## `src/components/ssh/KeychainView.tsx`

`CredentialDrawer`:7 _component_, `set`:12, `save`:13, `GenerateDrawer`:54 _component_, `gen`:62, `KeychainView`:97 _component_, `del`:101, `KnownHostsView`:139 _component_, `revoke`:141, `HostKeyPrompt`:188 _component_, `answer`:192

## `src/components/ssh/SftpView.tsx`

`Side`:12 _type_, `SortKey`:13 _type_, `SideState`:14 _type_, `emptySide`:18, `DND`:19 _component_, `baseName`:20, `joinPath`:21, `isDirLike`:22, `TItem`:23 _type_, `ConflictAsk`:24 _type_, `sortEntries`:26, `ContextMenu`:40 _component_, `PermGrid`:55 _component_, `PropertiesModal`:71 _component_, `calc`:79, `apply`:80, `PaneProps`:110 _type_, `Pane`:117 _component_, `click`:125, `sortBy`:133, `arrow`:134, `SftpView`:220 _component_, `patch`:249, `refresh`:262, `sudoMessage`:264, `askConflict`:302, `transferItems`:305, `run`:311, `selectedItems`:336, `fsOp`:341, `submitDialog`:347, `del`:364, `openEntry`:377, `editExternal`:382, `onKey`:387, `paneActions`:399, `menuItems`:413

## `src/components/ssh/SnippetsView.tsx`

`placeholders`:8, `SnippetDrawer`:10 _component_, `argOf`:16, `setArg`:17, `save`:18, `RunSnippetModal`:58 _component_, `run`:62, `SnippetRunnerPanel`:81 _component_, `fire`:87, `SnippetsView`:114 _component_, `savePkg`:131, `del`:137, `startRun`:142

## `src/components/ssh/SshExtras.tsx`

`SerialDrawer`:12 _component_, `load`:19, `set`:27, `connect`:28, `TerminalSettingsDrawer`:69 _component_, `set`:73, `save`:74, `check`:79, `AuthPromptModal`:136 _component_, `send`:139

## `src/components/ssh/TerminalPane.tsx`

`Props`:16 _type_, `beep`:30, `TermMenu`:42 _component_, `close`:50, `TerminalPane`:62 _component_, `ids`:89, `send`:90, `pasteText`:93, `pasteFromClipboard`:101, `copySelection`:102, `mount`:115, `onPaste`:149, `onContext`:155, `toggleLog`:239, `history`:251, `submitCmd`:252, `onCmdKey`:264, `menuItem`:304

## `src/components/ssh/TunnelsView.tsx`

`Switch`:8 _component_, `TunnelDrawer`:17 _component_, `set`:22, `save`:23, `TunnelsView`:71 _component_, `toggle`:77, `del`:85

## `src/components/ssh/sshStore.ts`

`PaneStatus`:7 _type_, `Pane`:8 _type_, `TermTab`:9 _type_, `SftpTab`:10 _type_, `EditorTab`:11 _type_, `Tab`:12 _type_, `State`:14 _type_, `set`:24, `subscribe`:28, `useSshStore`:29, `getSshState`:30, `rid`:32, `wire`:41, `attachOutput`:62, `ensureWired`:68, `hasOneOffPassword`:71, `updatePane`:74, `setActive`:82, `startSession`:90, `reconnectPane`:101, `openSerial`:115, `setPaneLogging`:119, `openTerminal`:121, `openSftpTab`:138, `patchTab`:144, `closePane`:148, `openEditor`:163, `setEditorDirty`:171, `dependentsOf`:176, `closeTab`:181, `rememberTransfer`:192, `clearFinishedTransfers`:196

## `src/components/ssh/terminalKeys.ts`

`KeyAction`:6 _type_, `KeyInfo`:14 _type_, `simpleKeyAction`:16, `pastedLines`:42, `commandBoxPayload`:47

## `src/components/ssh/terminalThemes.ts`

`TerminalTheme`:3 _type_, `themeById`:26

## `src/components/ssh/ui.tsx`

`VaultProps`:6 _type_, `Drawer`:9 _component_, `Modal`:27 _component_, `Field`:43 _component_, `EmptyState`:53 _component_, `errText`:62, `fmtBytes`:64, `fmtDate`:71

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

`base64Encode`:4, `base64Decode`:11, `htmlEncode`:19, `htmlDecode`:23, `EncodeKind`:34 _type_, `encodeText`:36, `decodeText`:43, `jsonMinify`:50, `ShaAlg`:53 _type_, `shaHex`:55, `uuidV4`:61, `ulid`:72, `ulidTime`:83, `JwtParts`:91 _type_, `decodeJwt`:93, `charsetSize`:108, `entropyBits`:118, `strengthLabel`:123, `PwOptions`:131 _type_, `generatePassword`:133, `lorem`:152, `rnd`:154, `RegexSegment`:171 _type_, `regexSegments`:173, `expandCronField`:199, `num`:202, `p2`:221, `join`:222, `explainCron`:225, `full`:232, `nextCronRuns`:248

## `src/devtools/ui.tsx`

`useDevT`:6, `copyText`:11, `CopyButton`:30 _component_

## `src/devtools/units.ts`

`UnitDef`:3 _type_, `UnitCategory`:13 _type_, `lin`:21, `findCategory`:104, `convert`:108, `formatNumber`:118, `parseBase`:132, `formatBase`:146, `TsUnit`:151 _type_, `unixToIso`:153, `isoToUnix`:158, `unixToLocal`:165, `p`:168

## `src/hooks/useDeepHardware.ts`

`DeepCategoryApi`:5 _type_, `getDeepCategoryApi`:7, `useDeepHardware`:13

## `src/hooks/useDialogA11y.ts`

`OpenDialog`:8 _type_, `topDialog`:12, `useDialogA11y`:28, `onKey`:54

## `src/hooks/useJunkScanner.ts`

`CachedJunk`:6 _type_, `loadCached`:13, `saveCache`:26, `useJunkScanner`:32, `fetchJunk`:43

## `src/hooks/useOptimizerProgress.ts`

`ProgressEvent`:3 _type_, `UseOptimizerProgressOptions`:17 _type_, `useOptimizerProgress`:21

## `src/hooks/useRecentActivity.ts`

`ActivityType`:3 _type_, `ActivityEntry`:13 _type_, `loadPersisted`:24, `persist`:36, `formatDuration`:42, `makeId`:49, `useRecentActivity`:53

## `src/hooks/useSecurityScore.ts`

`useSecurityScore`:4, `fetchSecurity`:22

## `src/hooks/useSensorHistory.ts`

`useSensorHistory`:13

## `src/hooks/useSystemMetrics.ts`

`useSystemMetrics`:3

## `src/i18n/I18nProvider.tsx`

`I18nContextValue`:5 _type_, `readInitialLang`:16, `I18nProvider`:24 _component_, `useI18n`:118

## `src/i18n/languages.ts`

`SupportedLang`:2 _type_, `LanguageOption`:4 _type_

## `src/i18n/messages.ts`

`getTranslationTemplate`:61

## `src/i18n/store.ts`

`Namespace`:12 _type_, `Dict`:14 _type_, `Parts`:15 _type_, `rebuild`:46, `addParts`:56, `once`:63, `loadNamespaceFor`:74, `baseLanguage`:88, `loadLocale`:93, `loadNamespace`:104, `getDictionary`:116, `isLocaleLoaded`:120, `subscribe`:124, `getVersion`:131, `seedAllForTests`:136, `addStringsForTests`:145

## `src/layouts/MainLayout.tsx`

`MainLayoutProps`:18 _type_, `NavSection`:24 _type_, `MainLayout`:35 _component_, `commitLayout`:163, `endDrag`:169, `onDropNav`:170, `overItem`:178, `overSection`:187, `moveByKey`:201, `handleMenuClick`:219, `handleNavKeyDown`:242, `navButton`:263, `rail`:269

## `src/lib/cipherTools.ts`

`fromUtf8`:5, `bytesToBase64`:7, `base64ToBytes`:12, `base32Encode`:19, `base32Decode`:28, `base58Encode`:42, `base58Decode`:50, `shiftLetters`:72, `atbash`:76, `rot47`:80, `vigenere`:81, `htmlEncode`:87, `htmlDecode`:90, `hexToBytes`:97, `bytesToHex`:102, `TextMode`:104 _type_, `transform`:109, `caesarBruteForce`:148, `CipherMode`:152 _type_, `gcmKey`:156, `cipher`:166, `HashName`:190 _type_, `hash`:192, `decodeJwt`:206, `identify`:213

## `src/lib/codeExamples.ts`

`CodeLanguage`:4 _type_, `ExampleId`:5 _type_, `languageForFile`:13

## `src/lib/extensions.ts`

`extPageId`:5, `parseExtPage`:6, `extensionsChanged`:12, `useExtensions`:15, `load`:19, `textIn`:28

## `src/lib/navLayout.ts`

`NavLayout`:4 _type_, `HasId`:5 _type_, `SectionLike`:6 _type_, `moveItem`:62, `moveSection`:75, `sameLayout`:86, `loadNavLayout`:90, `saveNavLayout`:98

## `src/lib/shutterSound.ts`

`playShutter`:5

## `src/main.tsx`

`render`:11

## `src/pages/AdvancedSecurity.tsx`

`SecurityTab`:13 _type_, `AdvancedSecurity`:15 _component_, `loadPhishingStatus`:43, `loadCommunityRulesStats`:47, `run`:59, `handleScan`:74, `handleKill`:87, `handleDisableLegacyShield`:99, `handleScanUrl`:112, `handleScanNetworkConnections`:128, `handleImportCommunityRules`:142, `handleResetCommunityRules`:163, `handleDownloadRulesTemplate`:177, `handleAuditTracking`:193, `trackingAction`:207, `loadTrackingDomains`:220, `saveTrackingDomains`:227, `go`:245, `sevText`:257, `tableSkeleton`:258

## `src/pages/AutoClicker.tsx`

`MacroViewState`:13 _type_, `WaypointItem`:28 _type_, `formatClockMs`:39, `AutoClicker`:47 _component_, `editIntervalMs`:103, `editButton`:104, `applyMacroPayload`:106, `refresh`:135, `handleStart`:205, `handleStop`:223, `handleSaveHotkey`:237, `syncMacroConfig`:255, `persistWaypoints`:274, `handlePickPointsOnScreen`:289, `handleAddManualPoint`:307, `updateWaypointField`:323, `moveWaypointPriority`:329, `removeWaypoint`:338, `clearAllWaypoints`:343, `handleWaypointsPlayToggle`:348, `handleMacroRecordToggle`:377, `handleMacroPlayToggle`:399, `handleMacroOpen`:425, `handleMacroSave`:445, `handleMacroCompile`:462, `handleMacroClear`:479, `registerTestClick`:491, `handleResetTester`:502, `runSelfDiagnostic`:509

## `src/pages/Benchmark.tsx`

`CompareResult`:7 _type_, `fmt`:10, `Benchmark`:12 _component_, `api`:25, `metricName`:26, `load`:37, `run`:53, `remove`:69, `runLabel`:77, `warningName`:82

## `src/pages/Cleaner.tsx`

`api`:8, `Tab`:9 _type_, `Cleaner`:18 _component_, `ConfirmModal`:64 _component_, `onKey`:72, `Stat`:99 _component_, `FilesTab`:110 _component_, `warnOf`:137, `toggle`:151, `runScan`:153, `runClean`:161, `BrowsersTab`:285 _component_, `run`:293, `status`:302, `RegistryTab`:383 _component_, `apply`:407, `restore`:412, `DefsTab`:502 _component_, `update`:507, `remove`:515

## `src/pages/DarkOSCenter.tsx`

`TabId`:19 _type_, `Banner`:21 _type_, `ConfirmState`:23 _type_, `api`:42, `Section`:45 _component_, `Figure`:59 _component_, `Empty`:66 _component_, `DarkOSCenter`:70 _component_, `current`:99, `profileName`:168, `describe`:169, `toggleChange`:171, `toggleGroup`:192, `askProfile`:199, `askRestoreAll`:226, `askRestoreSnapshot`:234, `renderOverview`:323, `renderChanges`:361, `renderProfiles`:443, `renderRecovery`:497, `renderSnapshots`:534, `renderFailures`:578, `renderDiagnostics`:602, `notice`:625

## `src/pages/Dashboard.tsx`

`formatBytes`:19, `timeAgo`:28, `Skel`:49 _component_, `Reading`:54 _component_, `MetricCell`:62 _component_, `DashboardProps`:96 _type_, `Dashboard`:100 _component_, `handleOptimizeRam`:250, `handleCleanJunk`:280, `handleCreateRestorePoint`:315, `handleRepairWindows`:337, `handleResolveSecurity`:358, `handleOpenWindowsSecurity`:369, `ExtensionWidgets`:721 _component_

## `src/pages/Decryption.tsx`

`Mode`:7 _type_, `Icon`:8 _type_, `Decryption`:15 _component_, `fail`:52, `run`:58, `copy`:72, `clearAll`:73, `guessLabel`:75

## `src/pages/DevTools.tsx`

`ToolId`:11 _type_, `DevTools`:13 _component_, `runJson`:32, `generateHashes`:47

## `src/pages/DiskRescue.tsx`

`Tab`:15 _type_, `Guard`:16 _type_, `diskOf`:18, `DiskRescue`:20 _component_, `setTab`:28, `openImage`:66, `OrphanJob`:140 _component_, `HealthTab`:172 _component_, `runSurface`:188, `Stat`:290 _component_, `GuardTab`:301 _component_, `wrap`:314, `planGpt`:320, `scan`:327, `planMbr`:332, `backup`:340, `restore`:345, `copyState`:356, `BootTab`:411 _component_, `planActive`:419

## `src/pages/DllInjector.tsx`

`DllInjector`:6 _component_, `handleSelectDll`:13, `handleInject`:29

## `src/pages/Dlss5Manager.tsx`

`up`:7, `legacy`:8, `GameRow`:10 _type_, `Tier`:11 _type_, `dlss5Tier`:14, `Dlss5Manager`:27 _component_, `run`:47, `scan`:60, `replaceRow`:65, `update`:66, `restore`:71, `addFolder`:77, `updateAll`:89

## `src/pages/Downloads.tsx`

`formatBytes`:9, `formatEta`:16, `Bytes`:24 _component_, `Downloads`:29 _component_, `onVisible`:71, `flash`:79, `handleAdd`:86, `saveSettings`:116, `chooseDir`:121, `statusBadge`:126

## `src/pages/DriverCenter.tsx`

`CameraState`:9 _type_, `Adapter`:11 _type_, `api`:13, `DriverCenter`:15 _component_, `openOfficial`:68, `field`:101

## `src/pages/ExtensionPage.tsx`

`ExtensionPage`:9 _component_

## `src/pages/FileConverter.tsx`

`ConvertCategory`:21 _type_, `detectCategory`:42, `fill`:55, `extOf`:56, `fmtBytes`:57, `FileConverter`:59 _component_, `getDir`:119, `applyFiles`:124, `handlePickFiles`:138, `handlePickOutputDir`:147, `handleConvert`:162, `removeFile`:208, `clearQueue`:213, `item`:221, `chip`:243, `engineNote`:249, `toggle`:263

## `src/pages/FramePacer.tsx`

`FramePacerPage`:15 _component_, `handleToggleEngine`:154, `handleUpdateFps`:172, `handleUpdateMode`:179, `handleToggleOverlay`:186, `handleToggleClickThrough`:193

## `src/pages/GameOverlay.tsx`

`n`:11, `GameOverlay`:13 _component_, `api`:21, `metricLabel`:23, `set`:53, `toggle`:60, `toggleMetric`:69, `PlacementPicker`:205 _component_, `ratio`:208, `spotLabel`:209, `nudge`:214

## `src/pages/GpuBench.tsx`

`num`:10, `GpuBench`:12 _component_, `api`:25, `load`:26, `errorText`:43, `run`:53, `link`:64, `unlink`:73, `remove`:74, `testName`:80, `statusName`:81, `statusClass`:87, `phaseText`:88

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

`Switch`:7 _component_, `mb`:17, `Maintenance`:19 _component_, `api`:23, `load`:25, `title`:31, `desc`:38, `update`:46, `runNow`:51, `failedSuffix`:58, `summary`:59, `summaryText`:65

## `src/pages/MetaDataEditor.tsx`

`Tab`:9 _type_, `Status`:10 _type_, `fmtSize`:30, `baseName`:31, `dirName`:32, `extOf`:33, `stemOf`:34, `MetaDataEditor`:36 _component_, `resetEdits`:57, `pickFile`:77, `onDrop`:82, `buildRequest`:99, `describeChecks`:103, `save`:109, `applyToOthers`:146, `pickCover`:170, `applyFsProps`:175, `removeStream`:185, `renderField`:196, `set`:200

## `src/pages/NetworkTools.tsx`

`NetworkTools`:7 _component_, `runPing`:30, `runPortScan`:48, `runSpeedTest`:66, `runDiag`:105

## `src/pages/OptiScalerManager.tsx`

`OptiScalerConfig`:31 _type_, `GameItem`:43 _type_, `Choice`:57 _type_, `dirnameFromPath`:114, `basename`:118, `OptiScalerManagerProps`:122 _type_, `OptiScalerManager`:126 _component_, `loaderLabel`:129, `loaderHint`:130, `refreshLibraryAndSteam`:182, `makePayload`:265, `stale`:290, `runAnalyzeForGame`:306, `handleSelectExe`:359, `handleRemoveManualGame`:402, `handleCreateManualBackup`:416, `handleDeleteBackup`:434, `handleApply`:451, `handleRestore`:483, `updateRelease`:520

## `src/pages/Optimizer.tsx`

`OptimizerTab`:13 _type_, `LogLevel`:14 _type_, `LogLine`:15 _type_, `RiskLevel`:16 _type_, `ConfirmRequest`:17 _type_, `RunResult`:18 _type_, `TweakItem`:21 _type_, `api`:40, `fmt`:43, `fmtBytes`:46, `tabBtn`:65, `segBtn`:71, `SkeletonRows`:79 _component_, `StatusPill`:94 _component_, `HeroButton`:102 _component_, `HagsButtons`:119 _component_, `Optimizer`:143 _component_, `addLog`:225, `askConfirm`:232, `answerConfirm`:238, `loadInitialData`:261, `refreshStatus`:297, `runOps`:368, `runOne`:382, `withBusy`:389, `reportResult`:406, `flash`:413, `handleOptimizeRAM`:418, `handleCleanTempFiles`:426, `handleFlushDNS`:434, `handleSetPowerPlan`:442, `handleOptimizeAudioLatency`:450, `handleCreateRestorePoint`:457, `handleApplyAdvancedNetwork`:469, `handleRevertAdvancedNetwork`:484, `loadPrograms`:493, `handleUninstallProgram`:507, `toggleGroup`:650, `needsConfirm`:658, `riskBadge`:660, `confirmItems`:666, `applyItems`:682, `revertItems`:697, `afterChange`:712, `handleApplyItem`:716, `handleRevertItem`:728, `handleRunBatch`:737, `handleApplyProfile`:773, `handleSafeOptimization`:795, `handleRevertAll`:818, `handleRestoreStreamingDefaults`:871, `loadHagsStatus`:884, `handleToggleHags`:900, `handleRevertHags`:908, `loadGpuData`:916, `handleBrowseGpuApp`:929, `handleSetGpuPreference`:940, `handleRemoveGpuPreference`:950, `loadProcesses`:957, `handleSetProcessPriority`:971, `loadBloatware`:996, `handleRemoveBloatware`:1010, `loadStartupItems`:1035, `handleToggleStartupItem`:1049, `loadDefenderStatus`:1058, `handleApplyDefender`:1070, `handleRestoreImageDefender`:1090, `handleOpenTamper`:1106, `refreshDnsState`:1117, `handleRunDnsBenchmark`:1125, `isTrustedDns`:1147, `handleApplyDns`:1149, `handleUndoDns`:1169, `profileRisk`:1205, `sectionHead`:1215, `searchField`:1225, `emptyRow`:1238

## `src/pages/OverlayEditor.tsx`

`api`:9, `star`:14, `encode`:17, `decode`:18, `newId`:22, `Row`:26 _component_, `ColorField`:35 _component_, `NumField`:45 _component_, `MetricSelect`:55 _component_, `Section`:68 _component_, `StyleEditor`:82 _component_, `set`:84, `ItemEditor`:117 _component_, `set`:120, `WidgetEditor`:145 _component_, `set`:147, `ThemeEditor`:230 _component_, `set`:232, `OverlayEditor`:267 _component_, `change`:317, `setWidget`:319, `move`:320, `add`:325, `save`:339, `switchTo`:348, `create`:352, `duplicate`:356, `remove`:361, `exportCode`:366, `doImport`:370, `typeName`:382, `typeLabel`:383

## `src/pages/PasswordManager.tsx`

`VaultEntry`:9 _type_, `calculatePasswordStrength`:18, `copySecretWithAutoClear`:39, `generateStrongPassword`:50, `getRandomChar`:59, `PasswordManager`:109 _component_, `refreshStatus`:147, `refreshEntries`:157, `handleInit`:189, `handleUnlock`:221, `handleUnlockWithRecovery`:241, `handleSetNewMaster`:262, `handleLock`:292, `handleAdd`:309, `handleRemove`:332, `toggleReveal`:354, `handleCopyPassword`:378, `handleExport`:392, `handleImport`:409, `StrengthMeter`:907 _component_

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

`SetupHub`:243 _component_, `toggleApp`:263, `toggleCategory`:269, `applyPreset`:279, `handleInstallApps`:342, `detectHardware`:375, `toggleOpen`:496, `joinParts`:749, `HardwareCard`:751 _component_, `getGpuDriverLinks`:792, `getCpuChipsetLinks`:810, `getMoboDriverLinks`:823

## `src/pages/Share.tsx`

`api`:8, `LinkRow`:13 _component_, `toggleQr`:18, `fmtBytes`:53, `HotkeyField`:56 _component_, `MonitorSelect`:67 _component_, `Share`:85 _component_, `setConfig`:128, `copy`:133, `report`:137, `onDrop`:142, `expiresIn`:146, `capture`:150

## `src/pages/SpaceSniffer/TreemapCanvas.tsx`

`INK`:6 _component_, `fill`:17, `fitText`:25, `Props`:33 _type_, `TreemapCanvas`:53 _component_, `pick`:173

## `src/pages/SpaceSniffer/diskCategories.ts`

`DiskCategory`:4 _type_, `oklch`:21, `categoryFill`:29, `startsWith`:74, `extOf`:79, `pathSegments`:85, `classifyPath`:97, `isSafeToCleanHint`:155, `isProtected`:156, `joinPath`:159

## `src/pages/SpaceSniffer/index.tsx`

`api`:14, `fmtDate`:19, `fmtInt`:20, `fmtTime`:21, `ColorMode`:23 _type_, `readMode`:24, `DiskMap`:27 _component_, `start`:117, `pickFolder`:124, `setColorMode`:136, `act`:172, `setTag`:182, `trash`:189, `deleteForGood`:201, `walk`:218, `walk`:234, `walk`:248, `onKey`:286

## `src/pages/SpaceSniffer/treemap.ts`

`Cell`:4 _type_, `squarify`:16, `layoutTree`:47, `visit`:49, `hitTest`:66, `formatBytes`:74

## `src/pages/SshClient.tsx`

`PaneFallback`:20 _component_, `Section`:22 _type_, `QuickConnect`:24 _component_, `hintSeen`:55, `TerminalTabView`:57 _component_, `closeHint`:61, `useSimple`:62, `themeOf`:71, `split`:72, `onKey`:79, `SshClient`:132 _component_, `onKey`:173, `requestClose`:187

## `src/pages/StartupManager.tsx`

`ListResult`:7 _type_, `Tab`:8 _type_, `Switch`:10 _component_, `secs`:19, `StartupManager`:21 _component_, `api`:31, `refresh`:32, `toggle`:45, `undo`:56

## `src/pages/SystemMonitor.tsx`

`formatBytes`:21, `PropertyRow`:30 _component_, `Skel`:44 _component_, `toneFor`:49, `loadBar`:58, `SectionBlock`:106 _component_, `TabType`:118 _type_, `toFixedSafe`:120, `formatSource`:125, `isVirtualNet`:139, `SystemMonitor`:145 _component_, `fetchUsage`:208, `handleBenchmark`:240, `generateReport`:261, `handleTabRefresh`:277, `renderTabs`:284, `renderTabLoadingState`:353, `renderTabErrorState`:369, `renderContent`:383, `norm`:567, `getTempStyle`:625

## `src/pages/TextEditor.tsx`

`Runtimes`:8 _type_, `RunResult`:9 _type_, `TextEditor`:19 _component_, `api`:37, `loadRuntimes`:38, `confirmDiscard`:42, `readError`:43, `handleOpen`:48, `handleSave`:79, `handleNew`:104, `loadExample`:109, `run`:121, `onKeyDown`:135, `outcome`:151

## `src/pages/TextSummarizer.tsx`

`splitSentences`:67, `tokenize`:74, `summarize`:83, `TextSummarizer`:109 _component_, `handleOpen`:119, `handleSummarize`:145

## `src/pages/UltraLowLatency.tsx`

`LatencyPayload`:9 _type_, `Skel`:16 _component_, `toLatencyAccelerator`:25, `toCaptureSpelling`:36, `Check`:38 _component_, `UltraLowLatency`:50 _component_, `markDirty`:97, `enableStable`:102, `toggleStable`:129, `refresh`:134, `pickExe`:170, `persistConfig`:183, `save`:209, `enable`:224, `disable`:244, `boostNow`:259, `setMode`:285, `num`:292, `pct`:293, `dirtyThen`:302

## `src/pages/UsbControl.tsx`

`Switch`:7 _component_, `gb`:19, `UsbControl`:21 _component_, `api`:29, `load`:31, `kindLabel`:48, `toggle`:54, `keep`:66, `policy`:72, `eject`:80

## `src/pages/YoutubeDownloader.tsx`

`DownloadPreset`:23 _type_, `DownloadProgressState`:35 _type_, `VideoExtraOptions`:45 _type_, `YoutubeDownloader`:71 _component_, `patchExtra`:88, `toggleSponsor`:93, `handlePickCookies`:120, `handleClearCookies`:137, `handleChangeBrowserCookies`:146, `handleChangeClient`:152, `handleChangeSleep`:158, `handleSearch`:164, `handleCancelDownload`:190, `handleDownload`:207, `formatDuration`:272, `segBtn`:296

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

## `tests/auditFixes.test.ts`

`engineWith`:20

## `tests/auditRuntimeFixes.test.ts`

`fakeChild`:50, `makeClient`:72, `flush`:82, `mk`:132, `analysis`:227

## `tests/auditSecurityFixes.test.ts`

`tmpDir`:19, `url`:73, `fakeDownload`:102, `fakeDownload`:112, `fakeSpawn`:126

## `tests/autoclickerHotkey.test.ts`

`svc`:45

## `tests/autoclickerMacro.test.ts`

`buildSyntheticTinyTaskStub`:23

## `tests/benchWorkerReal.test.ts`

`run`:11, `best`:19

## `tests/binaryIntegrity.test.ts`

`fixture`:10

## `tests/cleaner.test.ts`

`tmpDir`:13, `fakeIni`:16, `fakeFetch`:21, `put`:81, `execFileImpl`:154

## `tests/cleanerPage.test.tsx`

`target`:7, `mockApi`:13

## `tests/configManager.test.ts`

`fresh`:12

## `tests/converterDocs.test.ts`

`outs`:12

## `tests/converterImage.test.ts`

`gradient`:9

## `tests/converterMedia.test.ts`

`argAfter`:30

## `tests/converterVendor.test.ts`

`read`:8, `sha`:9

## `tests/cpuTopology.test.ts`

`Topo`:29 _type_, `Out`:30 _type_, `run`:32, `one`:40, `Aff`:43 _type_, `groupAffinity`:47, `entry`:53, `core`:61, `cache`:70, `noise`:78, `bit`:80, `range`:81, `hex`:82, `cores`:85, `lowCaches`:89, `buf`:92, `padded`:187

## `tests/darkosService.test.ts`

`fakeFs`:13, `out`:22, `makeService`:26, `make`:358

## `tests/dialogA11y.test.tsx`

`Dialog`:6 _component_, `press`:18

## `tests/diskMap.test.ts`

`file`:15, `ok`:18, `build`:61, `w`:186, `w`:199

## `tests/diskRescue.test.ts`

`tmpDir`:11, `fakeSpawn`:13

## `tests/dlss5.test.ts`

`fixedInfo`:13, `fakeDll`:22

## `tests/dlss5Lifecycle.test.ts`

`legacyInstall`:9

## `tests/downloads.test.ts`

`sha`:13, `at`:43, `startServer`:72, `tick`:93, `newManager`:109, `waitFor`:118

## `tests/elevatedNoExit.test.ts`

`walk`:12

## `tests/extensions.test.ts`

`ext`:16

## `tests/fileConverterPage.test.tsx`

`mockApi`:9, `pick`:30

## `tests/framePacerEngine.test.ts`

`fakeProc`:33, `onStatus`:58

## `tests/gpuBench.test.ts`

`set`:84

## `tests/gpuMatch.test.ts`

`s`:11, `hw`:52

## `tests/gpuStress.test.ts`

`loop`:11, `fakeEngine`:88, `say`:91, `service`:107, `fetchImpl`:136

## `tests/hotkeyCaptureFocus.test.tsx`

`key`:13

## `tests/hub.test.ts`

`base`:19, `reg`:20, `v`:21, `refused`:62, `official`:87, `fakeTweaks`:176, `fakeOptimizer`:191, `op`:193, `dir`:210, `pkg`:214, `run`:305

## `tests/hubMcp.test.ts`

`rpc`:31, `call`:65, `run`:79, `signed`:106, `fetchImpl`:123

## `tests/hwSensors.test.ts`

`sample`:8

## `tests/i18nFallback.test.tsx`

`tFor`:11

## `tests/i18nLocales.test.ts`

`keys`:15, `merge`:37

## `tests/kakugan.test.ts`

`res`:13, `acc`:80, `dash`:81

## `tests/lowLatencyLayer.test.ts`

`setup`:62, `runner`:70

## `tests/maintenanceSchedule.test.ts`

`at`:6

## `tests/maintenanceService.test.ts`

`make`:11

## `tests/metadataEditor.test.ts`

`ffmpegPath`:20, `exiftoolPath`:21, `tmp`:31, `field`:32, `ff`:33, `makeDocx`:80, `makePdf`:91, `cover`:216

## `tests/moreTweaks.test.ts`

`def`:15, `facts`:16, `readMapOf`:17, `hasFn`:53

## `tests/native/ClickTimerHarness.cs`

`ClickTimerHarness`:10 _class_, `Reset`:16, `Violation`:34, `Start`:36, `Check`:43, `Scenario`:45, `Main`:58, `SpinUntil`:143

## `tests/native/CpuTopologyHarness.cs`

`CpuTopologyHarness`:13 _class_, `Main`:15, `Hex`:29, `Run`:35

## `tests/native/FakeX86Helper.cs`

`FakeX86Helper`:13 _class_, `Main`:15

## `tests/native/FrameLimiterHarness.cs`

`FrameLimiterHarness`:8 _class_, `Main`:10, `Esc`:24

## `tests/native/NvmlHarness.cs`

`NvmlHarness`:8 _class_, `Main`:10

## `tests/nativeHelpers.test.ts`

`csc`:21, `alive`:22, `inject`:42, `check`:110

## `tests/navLayout.test.ts`

`S`:4, `ids`:5

## `tests/noProhibitedSteamTools.test.ts`

`read`:10

## `tests/optimizerAudit.test.ts`

`task`:278, `mk`:296

## `tests/optimizerAuditOwners.test.ts`

`memStore`:11, `engine`:45, `service`:188

## `tests/optiscaler.test.ts`

`isRdna2`:16, `mockGetLibraryStore`:37, `sectionKeys`:67

## `tests/overlayProvenance.test.ts`

`at`:173, `at2`:181

## `tests/pacerConfigLayout.test.ts`

`csLayout`:15, `rsAsserts`:22

## `tests/partitionManager.test.tsx`

`part`:10, `disk`:14, `mount`:18, `plan`:54, `run`:68

## `tests/partitionPolicy.test.ts`

`part`:13, `disk`:17, `ctx`:21, `create`:115, `r`:132, `l`:147, `harness`:191, `listed`:195, `writes`:223

## `tests/partitionService.test.ts`

`raw`:10

## `tests/powerPanelRails.test.tsx`

`Gpu`:8 _type_, `gpu`:9, `mount`:10

## `tests/powershellTools.test.ts`

`make`:37

## `tests/psToolkit.test.ts`

`mk`:151

## `tests/psuCatalog.test.ts`

`rec`:12, `fixture`:18, `fakeDownload`:102

## `tests/quarantinePlanted.test.ts`

`tmp`:11, `plant`:12, `foreignOwned`:26, `foreignOwned`:38

## `tests/realtime.test.ts`

`tmp`:19, `sha`:20, `waitFor`:21

## `tests/recycleBin.test.ts`

`fakeCleaner`:20, `engineWithTemp`:29

## `tests/registryNewItem.test.ts`

`walk`:9

## `tests/restoreService.test.ts`

`parseErrors`:18

## `tests/saveBackup.test.ts`

`setup`:10, `write`:116, `key`:122

## `tests/savePaths.test.ts`

`rel`:41

## `tests/securityAdvanced.test.ts`

`fetchImpl`:244

## `tests/securityHardening.test.ts`

`mkTmp`:41, `runIcacls`:52, `walk`:156, `open`:282, `next`:289

## `tests/sshAuditPaths.test.ts`

`attrsOf`:53, `sftpHandlers`:57, `toFs`:58, `h`:61, `hid`:62, `wrap`:63, `finish`:93, `done`:124, `setup`:168, `sha`:176, `instrument`:180, `junction`:450, `onUncaught`:504

## `tests/sshE2E.test.ts`

`toFs`:33, `attrsOf`:40, `sftpHandlers`:44, `toFs`:45, `h`:48, `hid`:49, `wrap`:50, `done`:106, `firstLine`:107, `on`:109, `setup`:150

## `tests/sshKnownHosts.test.ts`

`blobFor`:15, `FakeStream`:28 _class_, `write`:32, `pause`:34, `resume`:35, `end`:36, `FakeClient`:39 _class_, `connect`:42, `shell`:51, `forwardOut`:52, `end`:53, `setup`:56, `send`:147

## `tests/sshSafety.test.ts`

`fakeSftp`:75, `attrs`:77, `resolve`:80, `missing`:81, `withHandle`:103, `dpapi`:159

## `tests/sshSerial.test.ts`

`fakeBridge`:15

## `tests/sshVault.test.ts`

`mem`:17

## `tests/susuya.test.ts`

`crop`:14, `fakeSusuya`:34, `send`:41, `tmpFile`:77

## `tests/sysops.test.ts`

`psWrite`:21, `psRead`:26, `opsFor`:29, `readsFor`:51, `strip`:54

## `tests/tempCleanup.test.ts`

`fixture`:12

## `tests/templateBackslash.test.ts`

`lostEscapes`:10, `visit`:13, `walk`:36

## `tests/terminalKeys.test.ts`

`k`:7

## `tests/updateService.test.ts`

`release`:20, `offer`:52, `fresh`:53, `refused`:66

## `tests/updaterOverlay.test.tsx`

`mockUpdater`:7, `renderIt`:19

## `tests/vaultBridge.test.ts`

`mkTmp`:23, `makeServer`:185, `FakeHost`:212 _class_, `connect`:219, `next`:231, `raw`:237, `handshake`:238, `call`:249, `close`:253, `setup`:261, `pair`:270, `runReg`:392, `readFile`:434, `writeFile`:435

## `tests/vulkanLowLatencyCard.test.tsx`

`status`:7, `mockApi`:13, `radio`:26

## `tests/wallCalibration.test.ts`

`eta0`:10, `wallOf`:12, `pt`:13, `flat`:29, `W`:31, `rnd`:42, `ok`:75, `fail`:76, `series`:120

## `tests/wallCalibrationPanel.test.tsx`

`derived`:9, `backend`:20

## `tests/wuDiagnose.test.ts`

`ids`:17

## `tools/gpu-harness/dxgi_harness/src/main.rs`

`RegisterClassW`:76, `CreateWindowExW`:77, `DefWindowProcW`:78, `PeekMessageW`:79, `TranslateMessage`:80, `DispatchMessageW`:81, `D3D11CreateDevice`:85, `GetModuleHandleW`:89, `FreeLibrary`:90, `GetCurrentProcessId`:91, `wndproc`:94, `wide`:97, `vfn`:100, `hook_module`:103, `out`:114, `main`:121

## `tools/gpu-harness/run_gpubench.mjs`

`u32s`:16, `next`:34, `send`:43

## `tools/gpu-harness/run_pacer.ps1`

`Start-App`:19, `Get-Lines`:31, `Mean-Fps`:32, `Wait-AppSecond`:37, `Start-Limiter`:39, `Stop-LimiterGracefully`:58, `Kill-Limiter`:65, `Last-Status`:69, `App-Result`:74, `Test-Cap`:84, `Test-EarlyFree`:116

## `tools/gpu-harness/run_vk.ps1`

`Invoke-Harness`:22

## `tools/gpu-harness/vk_harness/src/main.rs`

`RegisterClassW`:65, `CreateWindowExW`:66, `DefWindowProcW`:67, `PeekMessageW`:68, `TranslateMessage`:69, `DispatchMessageW`:70, `DestroyWindow`:71, `GetModuleHandleW`:75, `GetModuleHandleExW`:76, `GetModuleFileNameW`:77, `GetCurrentProcess`:78, `GetProcessHandleCount`:79, `K32GetProcessMemoryInfo`:80, `wndproc`:82, `wide`:85, `pump`:88, `module_of`:97, `mem_snapshot`:113, `layer_dll_loaded`:122, `esc`:127, `emit`:141, `fail`:145, `chk`:153, `chk_raw`:159, `dbg_cb`:165, `parse`:272, `main`:290, `run_cycle`:354

## `vite.config.js`

`transformIndexHtml`:12
