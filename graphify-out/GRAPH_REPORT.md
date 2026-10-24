# Graph Report - DarkHub Suite  (2026-10-23)

## Corpus Check
- 232 files · ~315,104 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 12 file(s) not represented in the graph (top: (none) 5, .css 2, .example 1)

## Summary
- 2682 nodes · 7134 edges · 139 communities (99 shown, 40 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 98 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `af65cca6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- DarkOS.Recovery.psm1
- main.js
- DownloadManager
- messages.ts
- optiscalerManager.js
- Dashboard.tsx
- Loader2
- App.tsx
- DriverCenterService.js
- DarkOSRecoveryService
- AppManagerEngine.js
- lib.rs
- PageHeader
- SystemEngine
- DeepTweaksEngine
- OptimizerUtils.js
- DarkHubLatencyEngine
- SecurityService
- registerRealtimeIPC
- realtime.test.ts
- HardwareHAL
- WindowsToolsEngine.js
- CONTRIBUTING.md
- IDXGIFactory1
- build
- ClickEngine
- Dlss5Service
- package.json
- DlssUpdater.js
- DarkHubFrameLimiter
- machineMarker.js
- IntPtr
- susuya.test.ts
- devDependencies
- BaseCollector
- libraryStore.js
- react
- DWORD
- Optimizer.tsx
- compilerOptions
- psQuote
- DarkHub.LatencyEngine.cs
- DiskScan
- nativeLatencyClient
- .start
- ytdlp.js
- PowerShellToolsService.js
- DeepHardwareService
- SpaceSniffer/index.tsx
- MainLayout.tsx
- configManager.js
- ScanModel
- LoggerService
- icons/index.tsx
- scripts
- gamingBooster
- HardwareService
- c_void
- SystemOptimizerService
- [0.6.0] - 2026-10-21
- HwSensorsDaemon.js
- FramePacerEngine
- StorageEngine
- dependencies
- Changelog
- AdvancedSecurity.tsx
- ref_node_fs
- registerLatencyGuardian
- perform_pacing
- compute_stats
- runPowerShell
- UpdateService
- CoverProviderService
- vite.config.js
- DownloadManager.js
- SecureDownload.js
- setup_shared_memory
- DarkOSCenter.tsx
- bug_report.md
- DXGI_SWAP_CHAIN_DESC
- security_rule.md
- translation.md
- Description of Changes
- repository
- crypto-js.d.ts
- vite-env.d.ts
- darkhub_pacer_hook
- AES
- enc
- MD5
- SHA256
- LoggerService.js
- .Dump
- TempsCollector
- Features
- psSingleQuote
- useRecentActivity.ts
- dev.mjs
- DarkHub "Frost" design system
- DarkHub Suite: instruções para o Claude
- electron
- optimizerAudit.test.ts
- global.d.ts
- feature_request.md
- ToolboxEngine.js
- Security policy
- runCommand
- darkosData.ts
- .Main
- createMainWindow
- NvidiaDaemon
- Autopilot
- GpuCollector
- lhmSummary.js
- electron
- README.md
- DetailedHardwareInfo.tsx
- walkFiles
- [0.4.5] - 2026-09-01
- Quarantine
- machineMarker.js
- darkos.ts
- hasFileAccessGrant
- FramePacerOverlay.js
- scheduleVaultAutoLock
- main.tsx
- useJunkScanner.ts
- [0.5.0] - 2026-10-12
- walk
- webview.d.ts

## God Nodes (most connected - your core abstractions)
1. `useI18n()` - 93 edges
2. `react` - 69 edges
3. `PageHeader()` - 63 edges
4. `runPowerShell()` - 58 edges
5. `Loader2` - 58 edges
6. `DarkHubLatencyEngine` - 50 edges
7. `registerLatencyGuardian()` - 47 edges
8. `RefreshCw` - 43 edges
9. `DownloadManager` - 42 edges
10. `App()` - 40 edges

## Surprising Connections (you probably didn't know these)
- `Fixed (startup)` --references--> `mainWindow()`  [INFERRED]
  CHANGELOG.md → electron/devSelfTest.js
- `Added` --references--> `DnsEngine`  [INFERRED]
  CHANGELOG.md → electron/services/optimizer/DnsEngine.js
- `Added` --references--> `visibleInterval()`  [INFERRED]
  CHANGELOG.md → src/utils/visibleInterval.ts
- `Added` --references--> `SystemOptimizerService`  [INFERRED]
  CHANGELOG.md → electron/services/optimizer/SystemOptimizerService.js
- `showMainWindow()` --indirect_call--> `mainWindow()`  [INFERRED]
  electron/main.js → electron/devSelfTest.js

## Import Cycles
- None detected.

## Communities (139 total, 40 thin omitted)

### Community 0 - "DarkOS.Recovery.psm1"
Cohesion: 0.07
Nodes (92): Write-DhFail(), Write-DhLine(), Add-DkHistory(), Add-DkResults(), ConvertTo-DkHashtable(), ConvertTo-DkSignedDword(), ConvertTo-DkUInt32(), Enter-DkDefaultUser() (+84 more)

### Community 1 - "main.js"
Cohesion: 0.05
Nodes (37): registerWinToolsIPC(), appConfig, autoclickerConfigPath(), canSendDiscord(), computeJunkEstimate(), DEFAULT_TRACKING_DOMAINS, __dirname, discordDedup (+29 more)

### Community 2 - "DownloadManager"
Cohesion: 0.12
Nodes (7): AbortedError, DownloadManager, request(), sleep(), clampInt(), registerDownloadsIPC(), newManager()

### Community 3 - "messages.ts"
Cohesion: 0.28
Nodes (5): darkosMessages, availableLanguages, LanguageOption, SupportedLang, realtimeMessages

### Community 4 - "optiscalerManager.js"
Cohesion: 0.11
Nodes (45): applyIniPatch(), applyOptiScaler(), backupPathIfExists(), buildAnalysis(), buildIniPatch(), chooseInputApi(), chooseLoader(), classifyAmdArchitecture() (+37 more)

### Community 5 - "Dashboard.tsx"
Cohesion: 0.05
Nodes (56): currentPageRef, Entry, AlertTriangle, ArrowDownUp, Cpu, CpuIcon, Fan, Filter (+48 more)

### Community 6 - "Loader2"
Cohesion: 0.07
Nodes (61): DarkOSConfirmDialog(), DarkOSConfirmDialogProps, DarkOSProgress(), DarkOSSystemPanel(), fmtUptime(), LiveStats, Metric(), Row() (+53 more)

### Community 7 - "App.tsx"
Cohesion: 0.08
Nodes (40): AdvancedSecurity, App(), AutoClicker, DarkOSCenter, Dashboard, Decryption, DevTools, DllInjector (+32 more)

### Community 8 - "DriverCenterService.js"
Cohesion: 0.13
Nodes (17): registerDriverIPC(), boardPartnerFromPnpId(), cameraIssues(), classifyVendor(), DARKOS_CAMERA_ITEMS, DriverCenterService, isGenericDisplayDriver(), isOfficialDriverUrl() (+9 more)

### Community 9 - "DarkOSRecoveryService"
Cohesion: 0.07
Nodes (25): registerDarkOSIPC(), darkosService, CLI_FILE, COMMANDS, DARKOS_ROOT, DarkOSRecoveryService, defaultBundledDir(), defaultIsElevated() (+17 more)

### Community 10 - "AppManagerEngine.js"
Cohesion: 0.09
Nodes (16): AppManagerEngine, BLOATWARE_LIST, toArray(), buildStartupApprovedBytes(), bytesToHex(), isProtectedAppx(), isProtectedService(), isSafeInstallLocationFor() (+8 more)

### Community 11 - "lib.rs"
Cohesion: 0.06
Nodes (31): BUSY, CONFIG_PTR, FRAME_COUNT, HIST, HIST_CAP, HIST_HEAD, HIST_LEN, HOOK_INSTALLED (+23 more)

### Community 12 - "PageHeader"
Cohesion: 0.08
Nodes (53): HelpSection, HelpTip(), HelpTipProps, AlertCircle, Archive, ArrowRight, Check, ChevronUp (+45 more)

### Community 13 - "SystemEngine"
Cohesion: 0.09
Nodes (8): NetworkEngine, bcdValueToArg(), isValidPciInstanceId(), parseDhSnapLines(), scArgFromStartMode(), ServicesEngine, SystemEngine, VisualsEngine

### Community 14 - "DeepTweaksEngine"
Cohesion: 0.17
Nodes (5): DeepTweaksEngine, kindToType(), parseRegistryReadOutput(), regEntryId(), regValueMatches()

### Community 15 - "OptimizerUtils.js"
Cohesion: 0.08
Nodes (38): buildInternalGroups(), buildPublicTweaks(), defineTweak(), LIVE_ACTIONS, snapshotNumber(), buildCommandBlock(), buildRegistryScript(), canonicalRegValue() (+30 more)

### Community 16 - "DarkHubLatencyEngine"
Cohesion: 0.11
Nodes (4): DarkHubLatencyEngine, ICMP_ECHO_REPLY, IP_OPTION_INFORMATION, PROCESS_POWER_THROTTLING_STATE

### Community 18 - "registerRealtimeIPC"
Cohesion: 0.11
Nodes (9): registerRealtimeIPC(), ClamAv, freshclamConf(), parseClamscan(), run(), isScanCandidate(), RealtimeProtection, RISKY_EXT (+1 more)

### Community 19 - "realtime.test.ts"
Cohesion: 0.11
Nodes (13): isCriticalProcessName(), EICAR_SHA256, HashDb, clamp(), ConfigStore, defaults(), normalize(), normalizeFolder() (+5 more)

### Community 21 - "WindowsToolsEngine.js"
Cohesion: 0.13
Nodes (10): ACTIONS, featureById(), featureReadScript(), launch(), NOT_WINDOWS, PANELS, parseFeatureLines(), summarizeFeatureState() (+2 more)

### Community 22 - "CONTRIBUTING.md"
Cohesion: 0.17
Nodes (10): 1. Translations (i18n), 2. Security Rules, 3. Bug Fixes and Code Improvements, Areas of Contribution, Contributing to DarkHub Suite, Development Workflow, Adding or Editing Translations, Method 1: In-App Testing (+2 more)

### Community 24 - "build"
Cohesion: 0.06
Nodes (32): build, appId, asarUnpack, compression, directories, electronFuses, electronLanguages, extraResources (+24 more)

### Community 25 - "ClickEngine"
Cohesion: 0.14
Nodes (4): Added, ClickEngine, INPUT, MOUSEINPUT

### Community 26 - "Dlss5Service"
Cohesion: 0.19
Nodes (4): Dlss5Service, execAsync, inspectPeExecutable(), registerDlss5IPC()

### Community 27 - "package.json"
Cohesion: 0.07
Nodes (26): createOcrWorker(), getExiftool(), author, description, license, main, name, private (+18 more)

### Community 28 - "DlssUpdater.js"
Cohesion: 0.16
Nodes (16): registerUpscaleIPC(), DLSS_FILES, DlssUpdater, HOSTS, RAW(), safe(), scanGameFolder(), SKIP_DIRS (+8 more)

### Community 30 - "machineMarker.js"
Cohesion: 0.18
Nodes (19): loadVaultUsingWrapper(), persistVaultData(), readVaultFile(), vaultFileExists(), vaultFilePath(), writeVaultFile(), aesGcmDecrypt(), aesGcmEncrypt() (+11 more)

### Community 31 - "IntPtr"
Cohesion: 0.15
Nodes (4): CoreTempData, DarkHubSensorDaemon, GpuAdapter, PDH_FMT_COUNTERVALUE

### Community 32 - "susuya.test.ts"
Cohesion: 0.12
Nodes (27): normalizeShareConfig(), readJson(), registerShareIPC(), capture(), upload(), TTLS, writeJson(), makeRegionPicker() (+19 more)

### Community 33 - "devDependencies"
Cohesion: 0.09
Nodes (22): devDependencies, concurrently, crypto-js, electron, electron-builder, @fontsource-variable/geist, @fontsource-variable/geist-mono, jsdom (+14 more)

### Community 34 - "BaseCollector"
Cohesion: 0.15
Nodes (10): CpuCollector, DiskCollector, LatencyCollector, NetworkCollector, RamCollector, createSensor(), createUnavailableSensor(), numOrNull() (+2 more)

### Community 35 - "libraryStore.js"
Cohesion: 0.21
Nodes (21): backupFilePath(), filePath(), loadLibrary(), newId(), newProfileId(), removeGame(), removeGameUnsafe(), sanitizeGame() (+13 more)

### Community 36 - "react"
Cohesion: 0.13
Nodes (31): react, EmbeddedSitePage(), EmbeddedSitePageProps, Clock, DarkHubMark, Plus, Settings, X (+23 more)

### Community 37 - "DWORD"
Cohesion: 0.17
Nodes (16): CloseHandle(), CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, CreateFileMappingW(), CreateThread(), DllMain(), map_named(), MapViewOfFile(), OpenFileMappingW() (+8 more)

### Community 38 - "Optimizer.tsx"
Cohesion: 0.12
Nodes (26): DarkOSOptimizerHint(), Flame, Globe, Headphones, History, RotateCcw, Target, api() (+18 more)

### Community 39 - "compilerOptions"
Cohesion: 0.10
Nodes (20): compilerOptions, allowImportingTsExtensions, baseUrl, ignoreDeprecations, isolatedModules, jsx, lib, module (+12 more)

### Community 40 - "psQuote"
Cohesion: 0.19
Nodes (11): buildDnsQuery(), clampInt(), DNS_PRESETS, DnsEngine, dnsLatencyUdp(), isUsableDnsServer(), isValidDnsAnswer(), buildRegistryReadScript() (+3 more)

### Community 42 - "DiskScan"
Cohesion: 0.24
Nodes (3): DiskScan, Job, WIN32_FIND_DATA

### Community 44 - ".start"
Cohesion: 0.14
Nodes (4): FastSensorDaemon, HwSensorsDaemon, SensorBus, SlowSensorDaemon

### Community 45 - "ytdlp.js"
Cohesion: 0.18
Nodes (14): getFfmpegPath(), getYtDlpTools(), cancelActiveYtDlp(), __dirname, downloadTextWithRedirects(), downloadWithRedirects(), ensureFfmpeg(), ensureYtDlp() (+6 more)

### Community 46 - "PowerShellToolsService.js"
Cohesion: 0.20
Nodes (11): registerPowerShellIPC(), DARKOS_ROOT, effectivePolicy(), isPs1(), isUnderDarkOS(), normalizeScopes(), normalizeSignature(), POLICY_PRECEDENCE (+3 more)

### Community 48 - "SpaceSniffer/index.tsx"
Cohesion: 0.13
Nodes (26): CheckCheck, CheckSquare, Download, ExternalLink, HardDrive, HelpCircle, Home, LayoutGrid (+18 more)

### Community 49 - "MainLayout.tsx"
Cohesion: 0.08
Nodes (42): APP_VERSION, APP_VERSION_LABEL, GuardianWidget(), Activity, ChevronLeft, ChevronRight, Edit3, Fingerprint (+34 more)

### Community 50 - "configManager.js"
Cohesion: 0.39
Nodes (8): CONFIG_PATH, getDefaultConfig(), loadConfig(), mergeDefaultConfig(), saveConfig(), shouldMigrateVerifyUrl(), loadRuntimeConfig(), normalizeWebhookUrl()

### Community 51 - "ScanModel"
Cohesion: 0.06
Nodes (30): registerDiskScanIPC(), csvCell(), DiskScanService, formatSize(), AGE_UNITS, ATTR_BITS, classOf(), EXT_CLASS (+22 more)

### Community 53 - "icons/index.tsx"
Cohesion: 0.06
Nodes (56): crypto-js, diff, AppWindow, ArrowRightLeft, Base(), Brackets, Bug, Calculator (+48 more)

### Community 54 - "scripts"
Cohesion: 0.09
Nodes (22): scripts, build, build:native, build:pacer, build:portable, build:renderer, build:setup-inno, build:setup-nsis (+14 more)

### Community 55 - "gamingBooster"
Cohesion: 0.12
Nodes (7): gamingBooster, cpuLoadTracker, createGamingOverlay(), getRealLatency(), toggleGamingOverlay(), CpuLoadTracker, ManagedProcessRegistry

### Community 57 - "c_void"
Cohesion: 0.26
Nodes (10): com_release(), CreateWaitableTimerExW(), CreateWindowExA(), DestroyWindow(), GetProcAddress(), init_thread(), install_vtable_hooks(), LoadLibraryA() (+2 more)

### Community 58 - "SystemOptimizerService"
Cohesion: 0.09
Nodes (8): [0.4.8] - 2026-10-10, Added, Changed, Fixed, Notes, PowerEngine, SystemOptimizerService, op

### Community 59 - "[0.6.0] - 2026-10-21"
Cohesion: 0.18
Nodes (11): [0.6.0] - 2026-10-21, Added, Changed, Design, Developer, Fixed (monitoring), Fixed (Post-Install Hub), Fixed (shell) (+3 more)

### Community 60 - "HwSensorsDaemon.js"
Cohesion: 0.24
Nodes (8): forgetPawnIoCheck(), here, HWSENSORS_EXE, isPawnIoInstalled(), pawnCache, registerHwSensorsIPC(), installPawnIo(), PAWNIO

### Community 63 - "dependencies"
Cohesion: 0.17
Nodes (12): dependencies, diff, electron-log, electron-updater, exifr, exiftool-vendored, ffmpeg-static, pdf-parse (+4 more)

### Community 64 - "Changelog"
Cohesion: 0.13
Nodes (14): [0.1.0] - 2026-07-01, [0.4.0] - 2026-08-15, [0.4.6] - 2026-09-02, [0.4.7] - 2026-09-09, [0.7.0] - 2026-10-23, Added, Added, Added (+6 more)

### Community 65 - "AdvancedSecurity.tsx"
Cohesion: 0.15
Nodes (24): Code, Eye, EyeOff, KeyRound, Laptop, Layers, Lock, MousePointer (+16 more)

### Community 66 - "ref_node_fs"
Cohesion: 0.09
Nodes (16): here, SENSOR_DAEMON_EXE, encodedPowerShellArgs(), TAG_COLORS, execFileAsync, __dirname, __filename, __dirname (+8 more)

### Community 67 - "registerLatencyGuardian"
Cohesion: 0.18
Nodes (21): clampInt(), isSafePingHost(), now(), registerLatencyGuardian(), findGameProcess(), getProcessSnapshot(), loadConfig(), loop() (+13 more)

### Community 68 - "perform_pacing"
Cohesion: 0.36
Nodes (7): get_qpc_ms(), hooked_present(), hooked_present1(), is_main_swapchain(), perform_pacing(), precision_wait(), QueryPerformanceCounter()

### Community 69 - "compute_stats"
Cohesion: 0.32
Nodes (8): compute_stats(), CUR_STATS, low01_unavailable_with_few_samples(), push_sample(), reset(), Stats, stats_come_only_from_real_samples(), .ZERO

### Community 70 - "runPowerShell"
Cohesion: 0.22
Nodes (19): applyDnsCloudflareWithUndo(), killBackgroundProcesses(), optimizeGlobalTcpStack(), setDisableFullscreenOptimizations(), setGamePriorityHigh(), setGpuHighPerformancePreference(), setMouseAccelerationDisabled(), setNagleDisabledOnActiveInterface() (+11 more)

### Community 73 - "vite.config.js"
Cohesion: 0.29
Nodes (5): @tailwindcss/vite, vite, @vitejs/plugin-react, pkg, strictProductionCsp

### Community 74 - "DownloadManager.js"
Cohesion: 0.18
Nodes (14): DEFAULT_SETTINGS, hashFile(), CATEGORY_BY_EXT, categoryForFile(), fileNameFromUrl(), isInsideWindow(), parseContentDisposition(), parseHHMM() (+6 more)

### Community 75 - "SecureDownload.js"
Cohesion: 0.38
Nodes (10): installGithubReleaseMsi(), execFileAsync, installOfficialRelease(), resolveFsr4Rdna2Path(), assertAllowedUrl(), assetSha256(), downloadToFile(), fetchJson() (+2 more)

### Community 76 - "setup_shared_memory"
Cohesion: 0.40
Nodes (5): GetCurrentProcessId(), hist_recent(), publish(), QueryPerformanceFrequency(), setup_shared_memory()

### Community 77 - "DarkOSCenter.tsx"
Cohesion: 0.21
Nodes (15): FileArchive, Redo2, Undo2, api(), Banner, ConfirmState, DarkOSCenter(), Empty() (+7 more)

### Community 78 - "bug_report.md"
Cohesion: 0.50
Nodes (3): Description of Bug, Steps to Reproduce, System Information

### Community 79 - "DXGI_SWAP_CHAIN_DESC"
Cohesion: 0.50
Nodes (4): DXGI_MODE_DESC, DXGI_RATIONAL, DXGI_SAMPLE_DESC, DXGI_SWAP_CHAIN_DESC

### Community 83 - "repository"
Cohesion: 0.67
Nodes (3): repository, type, url

### Community 96 - "LoggerService.js"
Cohesion: 0.14
Nodes (7): BaseCollector, DEFAULT_STALE_MS, QUERY_FIELDS, ProcessCollector, StorageCollector, sameGpu(), SECRET_PATTERNS

### Community 99 - "Features"
Cohesion: 0.29
Nodes (7): Features, Gaming and latency, Hardware, Real-time (off by default), Security and tools, Sharing, Windows maintenance

### Community 100 - "psSingleQuote"
Cohesion: 0.31
Nodes (10): psSingleQuote(), removeQosPolicy(), restoreDns(), restoreFullscreenOptimizations(), restoreGlobalTcpStack(), restoreGpuPreference(), restoreMouseAcceleration(), restoreNagle() (+2 more)

### Community 101 - "useRecentActivity.ts"
Cohesion: 0.39
Nodes (7): ActivityEntry, ActivityType, formatDuration(), loadPersisted(), makeId(), persist(), useRecentActivity()

### Community 102 - "dev.mjs"
Cohesion: 0.20
Nodes (12): argPage, args, c, killStaleDev(), killTree(), restartElectron(), root, say() (+4 more)

### Community 103 - "DarkHub "Frost" design system"
Cohesion: 0.33
Nodes (5): Component vocabulary (CSS classes in `src/style.css`, React in `src/components/ui`), DarkHub "Frost" design system, Do not change, Foundations (already global, do not re-declare), Rules (what makes it look designed, not generated)

### Community 104 - "DarkHub Suite: instruções para o Claude"
Cohesion: 0.40
Nodes (4): Antes de procurar código: use o mapa (não varra o projeto), DarkHub Suite: instruções para o Claude, Regras do projeto, Verificação

### Community 105 - "electron"
Cohesion: 0.13
Nodes (16): devHistory, devStartPage, history, listeners, NOISY, preview(), mainWindow(), root (+8 more)

### Community 106 - "optimizerAudit.test.ts"
Cohesion: 0.09
Nodes (18): buildImageDefenderRestoreScript(), DefenderControlEngine, IMAGE_DEFENDER_DEFAULTS, POLICY_CHANGES, decodeShellOutput(), ElevationHelper, execAsync, waitForElevated() (+10 more)

### Community 107 - "global.d.ts"
Cohesion: 0.07
Nodes (27): CameraState, ClamAvStatus, crypto-js, DarkHubAPI, DevTraceEntry, DiskMapDrive, DiskMapInfo, DiskMapNode (+19 more)

### Community 108 - "feature_request.md"
Cohesion: 0.50
Nodes (3): Alternatives, Proposed solution, What problem does it solve?

### Community 110 - "Security policy"
Cohesion: 0.50
Nodes (4): Reporting a vulnerability, Scope, Security policy, Supported versions

### Community 111 - "runCommand"
Cohesion: 0.19
Nodes (10): restorePowerPlan(), setPowerPlanHighPerformance(), findLibreOfficeSoffice(), isStartupTaskEnabled(), measureLatency(), setStartupTask(), assertSafeHost(), registerNetworkIPC() (+2 more)

### Community 112 - "darkosData.ts"
Cohesion: 0.21
Nodes (13): DarkOSCatalogEntry, asArray(), DARKOS_PROFILES, DarkOSFailure, DarkOSRow, isOn(), mergeChanges(), normalizeReboot() (+5 more)

### Community 115 - "createMainWindow"
Cohesion: 0.24
Nodes (12): createMainWindow(), ensureTray(), getAllowedExternalUrl(), getAppIconPath(), handleEmbeddedExternalNavigation(), hideWindowToBackground(), isAllowedExternalProtocol(), isDev() (+4 more)

### Community 119 - "lhmSummary.js"
Cohesion: 0.60
Nodes (4): buildTree(), find(), RING0_CPU_TYPES, summarizeLhm()

### Community 120 - "electron"
Cohesion: 0.17
Nodes (9): { contextBridge, ipcRenderer, webUtils }, darkhubApi, electron, { app, BrowserWindow }, fs, outDir, pages, path (+1 more)

### Community 121 - "README.md"
Cohesion: 0.15
Nodes (10): Third-party components (DarkHub.HwSensors), Architecture, Building from source, Contributing, How it stays safe, Install, License, JSON Rule Schema (+2 more)

### Community 122 - "DetailedHardwareInfo.tsx"
Cohesion: 0.39
Nodes (7): DetailedHardwareInfo(), gb(), HardwareInfo, Metric(), MetricGrid(), tempEntries(), useSystemMetrics()

### Community 125 - "walkFiles"
Cohesion: 0.67
Nodes (3): findUnrealExecutableCandidates(), walkFiles(), walk()

### Community 126 - "[0.4.5] - 2026-09-01"
Cohesion: 0.50
Nodes (4): [0.4.5] - 2026-09-01, Added, Changed, Fixed

### Community 128 - "Quarantine"
Cohesion: 0.29
Nodes (3): Quarantine, transcode(), xorStream()

### Community 129 - "machineMarker.js"
Cohesion: 0.40
Nodes (9): _0x3c4d, ensureMachineMarker(), execFileAsync, _getH(), _mk(), _readMarker(), _regR(), _regW() (+1 more)

### Community 130 - "darkos.ts"
Cohesion: 0.18
Nodes (10): DarkOSAPI, DarkOSChangeResponse, DarkOSChangeResult, DarkOSInfo, DarkOSManifest, DarkOSManifestChange, DarkOSProfileId, DarkOSReadResponse (+2 more)

### Community 131 - "hasFileAccessGrant"
Cohesion: 0.32
Nodes (8): assertFileAccessGranted(), assertFileAccessGrantedMany(), assertOutputDirGranted(), grantDirectoryPath(), grantFilePath(), hasFileAccessGrant(), isPathInside(), normalizeAccessPath()

### Community 132 - "FramePacerOverlay.js"
Cohesion: 0.29
Nodes (7): closeFramePacerOverlay(), createFramePacerOverlay(), getOverlayStatus(), overlayConfig, setOverlayClickThrough(), setOverlayConfig(), toggleFramePacerOverlay()

### Community 133 - "scheduleVaultAutoLock"
Cohesion: 0.40
Nodes (6): clearVaultAutoLock(), ensureUnlocked(), lockVault(), scheduleVaultAutoLock(), setVaultAutoLockMinutes(), touchVault()

### Community 134 - "main.tsx"
Cohesion: 0.40
Nodes (3): @fontsource-variable/geist, @fontsource-variable/geist-mono, react-dom

### Community 135 - "useJunkScanner.ts"
Cohesion: 0.60
Nodes (4): CachedJunk, loadCached(), saveCache(), useJunkScanner()

### Community 136 - "[0.5.0] - 2026-10-12"
Cohesion: 0.50
Nodes (4): [0.5.0] - 2026-10-12, Added, Changed, Removed

### Community 137 - "walk"
Cohesion: 0.67
Nodes (3): scanDirectoryForBestExe(), walk(), scoreExecutable()

## Knowledge Gaps
- **15 isolated node(s):** `darkhub_pacer_hook`, `@testing-library/jest-dom`, `@testing-library/react`, `@types/diff`, `@types/react` (+10 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 674 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **40 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Changelog` connect `Changelog` to `[0.5.0] - 2026-10-12`, `SystemOptimizerService`, `[0.6.0] - 2026-10-21`, `[0.4.5] - 2026-09-01`?**
  _High betweenness centrality (0.167) - this node is a cross-community bridge._
- **What connects `darkhub_pacer_hook`, `@testing-library/jest-dom`, `@testing-library/react` to the rest of the system?**
  _15 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DarkOS.Recovery.psm1` be split into smaller, more focused modules?**
  _Cohesion score 0.06600877192982456 - nodes in this community are weakly interconnected._
- **Why does `[0.4.6] - 2026-09-02` connect `Changelog` to `ClickEngine`?**
  _High betweenness centrality (0.115) - this node is a cross-community bridge._
- **Should `main.js` be split into smaller, more focused modules?**
  _Cohesion score 0.049773755656108594 - nodes in this community are weakly interconnected._
- **Why does `Added` connect `ClickEngine` to `Changelog`?**
  _High betweenness centrality (0.115) - this node is a cross-community bridge._
- **Should `DownloadManager` be split into smaller, more focused modules?**
  _Cohesion score 0.12222222222222222 - nodes in this community are weakly interconnected._