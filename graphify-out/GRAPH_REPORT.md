# Graph Report - DarkHub Suite  (2026-10-24)

## Corpus Check
- 372 files · ~461,608 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 13 file(s) not represented in the graph (top: (none) 5, .css 3, .example 1)

## Summary
- 4019 nodes · 11067 edges · 181 communities (141 shown, 40 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 178 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0a9ecb13`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- DarkOS.Recovery.psm1
- main.js
- DownloadManager
- messages.ts
- optiscalerManager.js
- Dashboard.tsx
- DarkOSCenter.tsx
- App.tsx
- DriverCenterService.js
- DarkOSRecoveryService
- AppManagerEngine.js
- lib.rs
- useI18n
- SystemEngine
- DeepTweaksEngine
- AdvancedProtectionService.js
- DarkHubLatencyEngine
- SecurityService
- realtime.test.ts
- OptiScalerManager.tsx
- HardwareHAL
- WindowsToolsEngine.js
- CONTRIBUTING.md
- IDXGIFactory1
- build
- ClickEngine
- SaveBackupService
- package.json
- DlssUpdater.js
- DarkHubFrameLimiter
- vaultCrypto.js
- IntPtr
- susuya.test.ts
- devDependencies
- LoggerService.js
- Loader2
- Trash2
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
- icons/index.tsx
- Loader2
- configManager.js
- ScanModel
- LoggerService
- RefreshCw
- scripts
- gamingBooster
- HardwareService
- c_void
- SystemOptimizerService
- [0.6.0] - 2026-10-21
- StartupService.js
- FramePacerEngine
- StorageEngine
- dependencies
- Changelog
- libraryStore.js
- ref_node_path
- registerLatencyGuardian
- perform_pacing
- compute_stats
- PowerShellTools.tsx
- UpdateService
- CoverProviderService
- vite.config.js
- OverlayService
- HwSensorsDaemon.js
- setup_shared_memory
- Decryption.tsx
- bug_report.md
- DXGI_SWAP_CHAIN_DESC
- security_rule.md
- translation.md
- Description of Changes
- Autopilot
- crypto-js.d.ts
- vite-env.d.ts
- darkhub_pacer_hook
- AES
- enc
- MD5
- SHA256
- BaseCollector
- textTools.ts
- TempsCollector
- Features
- react
- useRecentActivity.ts
- dev.mjs
- DarkHub "Frost" design system
- DarkHub Suite: instruções para o Claude
- electron
- OptimizerUtils.js
- global.d.ts
- feature_request.md
- SpaceSniffer/index.tsx
- Security policy
- NetLatencyService.js
- UnitConverter.tsx
- devtools.test.ts
- MaintenanceService
- NvidiaDaemon
- DriverInstallService
- GpuCollector
- driverPlan.js
- BenchmarkService
- README.md
- DetailedHardwareInfo.tsx
- nativeHost.js
- AdvancedProtectionService
- feedParsers.js
- [0.4.5] - 2026-09-01
- diskCategories.ts
- benchWorker.js
- psToolBuilders.js
- Dlss5Service
- DriverInstallService.js
- MetaDataEditor.tsx
- background.js
- driverInstall.test.ts
- bridgeServer.js
- .runElevatedPowerShell
- webview.d.ts
- PsToolkitService
- ooxmlZip.js
- manifest.json
- exiftoolRunner.js
- MetadataService.js
- PowerEngine
- vaultBridge.test.ts
- fileProbe.js
- domainMatch.js
- metaxTypes.ts
- Dlss5Manager.tsx
- VaultBridgeServer
- PairingStore
- content.js
- VaultBridgeHost
- CodeRunner.js
- read
- nsis
- metadataEditor.test.ts
- popup.js
- DevTools.tsx
- SecureDownload.js
- DarkHub Vault browser extension
- psQuote
- ytdlpOptions.js
- .lookupVendor
- [Unreleased]
- [0.5.0] - 2026-10-12
- manifestIndexer.js
- hasFileAccessGrant
- repository
- ClamAv
- loadVaultUsingWrapper
- createMetadataService
- RateLimiter
- lhmSummary.js
- walk
- machineMarker.js
- FramePacerOverlay.js
- vaultTransfer.js
- ensureElevated.js
- exiftool-vendored

## God Nodes (most connected - your core abstractions)
1. `useI18n()` - 143 edges
2. `Loader2` - 100 edges
3. `react` - 95 edges
4. `PageHeader()` - 75 edges
5. `RefreshCw` - 71 edges
6. `psQuote()` - 69 edges
7. `runPowerShell()` - 67 edges
8. `AlertTriangle` - 66 edges
9. `DarkHubLatencyEngine` - 50 edges
10. `registerLatencyGuardian()` - 47 edges

## Surprising Connections (you probably didn't know these)
- `Fixed (startup)` --references--> `mainWindow()`  [INFERRED]
  CHANGELOG.md → electron/devSelfTest.js
- `Added` --references--> `DnsEngine`  [INFERRED]
  CHANGELOG.md → electron/services/optimizer/DnsEngine.js
- `Added` --references--> `visibleInterval()`  [INFERRED]
  CHANGELOG.md → src/utils/visibleInterval.ts
- `Added` --references--> `SystemOptimizerService`  [INFERRED]
  CHANGELOG.md → electron/services/optimizer/SystemOptimizerService.js
- `make()` --calls--> `MaintenanceService`  [EXTRACTED]
  tests/maintenanceService.test.ts → electron/services/maintenance/MaintenanceService.js

## Import Cycles
- None detected.

## Communities (181 total, 40 thin omitted)

### Community 0 - "DarkOS.Recovery.psm1"
Cohesion: 0.07
Nodes (92): Write-DhFail(), Write-DhLine(), Add-DkHistory(), Add-DkResults(), ConvertTo-DkHashtable(), ConvertTo-DkSignedDword(), ConvertTo-DkUInt32(), Enter-DkDefaultUser() (+84 more)

### Community 1 - "main.js"
Cohesion: 0.05
Nodes (49): registerWinToolsIPC(), appConfig, autoclickerConfigPath(), canSendDiscord(), computeJunkEstimate(), createMainWindow(), DEFAULT_TRACKING_DOMAINS, __dirname (+41 more)

### Community 2 - "DownloadManager"
Cohesion: 0.08
Nodes (23): downloadsService, AbortedError, DEFAULT_SETTINGS, DownloadManager, hashFile(), request(), sleep(), autoConnections() (+15 more)

### Community 3 - "messages.ts"
Cohesion: 0.06
Nodes (24): benchmarkMessages, darkosMessages, decryptMessages, devToolsMessages, diskMapMessages, driverMessages, maintenanceMessages, availableLanguages (+16 more)

### Community 4 - "optiscalerManager.js"
Cohesion: 0.11
Nodes (47): applyIniPatch(), applyOptiScaler(), backupPathIfExists(), buildAnalysis(), buildIniPatch(), chooseInputApi(), chooseLoader(), classifyAmdArchitecture() (+39 more)

### Community 5 - "Dashboard.tsx"
Cohesion: 0.05
Nodes (59): Cpu, CpuIcon, Fan, FileDigit, Filter, LayoutTemplate, List, MemoryStick (+51 more)

### Community 6 - "DarkOSCenter.tsx"
Cohesion: 0.10
Nodes (37): FileArchive, Redo2, api(), Banner, ConfirmState, DarkOSCenter(), Empty(), Figure() (+29 more)

### Community 7 - "App.tsx"
Cohesion: 0.07
Nodes (46): AdvancedSecurity, App(), AutoClicker, Benchmark, DarkOSCenter, Dashboard, Decryption, DevTools (+38 more)

### Community 8 - "DriverCenterService.js"
Cohesion: 0.11
Nodes (14): cameraIssues(), classifyVendor(), DARKOS_CAMERA_ITEMS, DriverCenterService, isGenericDisplayDriver(), isOfficialDriverUrl(), normalizeAdapter(), OFFICIAL_SOURCES (+6 more)

### Community 9 - "DarkOSRecoveryService"
Cohesion: 0.07
Nodes (25): registerDarkOSIPC(), darkosService, CLI_FILE, COMMANDS, DARKOS_ROOT, DarkOSRecoveryService, defaultBundledDir(), defaultIsElevated() (+17 more)

### Community 10 - "AppManagerEngine.js"
Cohesion: 0.09
Nodes (14): AppManagerEngine, BLOATWARE_LIST, toArray(), buildStartupApprovedBytes(), bytesToHex(), isProtectedAppx(), isProtectedService(), isSafeInstallLocationFor() (+6 more)

### Community 11 - "lib.rs"
Cohesion: 0.06
Nodes (31): BUSY, CONFIG_PTR, FRAME_COUNT, HIST, HIST_CAP, HIST_HEAD, HIST_LEN, HOOK_INSTALLED (+23 more)

### Community 12 - "useI18n"
Cohesion: 0.08
Nodes (54): react, EmbeddedSitePage(), EmbeddedSitePageProps, Camera, Clipboard, DarkHubMark, FileImage, Film (+46 more)

### Community 13 - "SystemEngine"
Cohesion: 0.13
Nodes (5): bcdValueToArg(), MANAGED_SERVICES, scArgFromStartMode(), ServicesEngine, SystemEngine

### Community 14 - "DeepTweaksEngine"
Cohesion: 0.10
Nodes (19): DeepTweaksEngine, buildRegistryReadScript(), kindToType(), parseRegistryReadOutput(), regEntryId(), regValueMatches(), snapshotEntryToOps(), allRegistryEntries() (+11 more)

### Community 15 - "AdvancedProtectionService.js"
Cohesion: 0.16
Nodes (14): HOSTS_PATH, readCapped(), buildFirewallRemoveScript(), buildFirewallStatusScript(), buildHostsWriteScript(), FIREWALL_GROUP, HOSTS_WARN_ENTRIES, looksLikeHtml() (+6 more)

### Community 16 - "DarkHubLatencyEngine"
Cohesion: 0.09
Nodes (3): DarkHubLatencyEngine, IP_OPTION_INFORMATION, PROCESS_POWER_THROTTLING_STATE

### Community 18 - "realtime.test.ts"
Cohesion: 0.07
Nodes (23): registerRealtimeIPC(), isCriticalProcessName(), EICAR_SHA256, HashDb, Quarantine, transcode(), xorStream(), clamp() (+15 more)

### Community 19 - "OptiScalerManager.tsx"
Cohesion: 0.11
Nodes (30): Archive, ChevronUp, Eye, EyeOff, FolderOpen, Layers, MousePointer, Rocket (+22 more)

### Community 21 - "WindowsToolsEngine.js"
Cohesion: 0.13
Nodes (10): ACTIONS, featureById(), featureReadScript(), launch(), NOT_WINDOWS, PANELS, parseFeatureLines(), summarizeFeatureState() (+2 more)

### Community 22 - "CONTRIBUTING.md"
Cohesion: 0.17
Nodes (10): 1. Translations (i18n), 2. Security Rules, 3. Bug Fixes and Code Improvements, Areas of Contribution, Contributing to DarkHub Suite, Development Workflow, Adding or Editing Translations, Method 1: In-App Testing (+2 more)

### Community 23 - "IDXGIFactory1"
Cohesion: 0.07
Nodes (3): GpuAdapter, IDXGIAdapter1, IDXGIFactory1

### Community 24 - "build"
Cohesion: 0.10
Nodes (21): build, appId, asarUnpack, compression, directories, electronFuses, electronLanguages, extraResources (+13 more)

### Community 25 - "ClickEngine"
Cohesion: 0.14
Nodes (4): Added, ClickEngine, INPUT, MOUSEINPUT

### Community 26 - "SaveBackupService"
Cohesion: 0.15
Nodes (16): registerSaveBackupIPC(), INDEXER, run(), safeName(), SaveBackupService, sha256File(), templatePrefix(), expandGlob() (+8 more)

### Community 27 - "package.json"
Cohesion: 0.06
Nodes (32): getOcrWorker(), getSharp(), author, description, license, main, name, private (+24 more)

### Community 28 - "DlssUpdater.js"
Cohesion: 0.16
Nodes (16): registerUpscaleIPC(), DLSS_FILES, DlssUpdater, HOSTS, RAW(), safe(), scanGameFolder(), SKIP_DIRS (+8 more)

### Community 30 - "vaultCrypto.js"
Cohesion: 0.24
Nodes (16): backupVaultFile(), isWeakKdf(), kdfWork(), upgradeWrapperIfWeak(), aesGcmDecrypt(), aesGcmEncrypt(), buildDefaultWordList(), buildKdf() (+8 more)

### Community 31 - "IntPtr"
Cohesion: 0.16
Nodes (5): ICMP_ECHO_REPLY, CoreTempData, DarkHubSensorDaemon, DXGI_ADAPTER_DESC1, PDH_FMT_COUNTERVALUE

### Community 32 - "susuya.test.ts"
Cohesion: 0.12
Nodes (28): normalizeShareConfig(), readJson(), registerShareIPC(), capture(), upload(), TTLS, writeJson(), makeRegionPicker() (+20 more)

### Community 33 - "devDependencies"
Cohesion: 0.09
Nodes (22): devDependencies, concurrently, crypto-js, electron, electron-builder, @fontsource-variable/geist, @fontsource-variable/geist-mono, jsdom (+14 more)

### Community 34 - "LoggerService.js"
Cohesion: 0.19
Nodes (8): LatencyCollector, QUERY_FIELDS, RamCollector, classifyTemperature(), createSensor(), createUnavailableSensor(), sameGpu(), SECRET_PATTERNS

### Community 35 - "Loader2"
Cohesion: 0.12
Nodes (36): Activity, Crosshair, Gauge, Info, Loader2, Network, Play, Route (+28 more)

### Community 36 - "Trash2"
Cohesion: 0.11
Nodes (33): HelpSection, HelpTip(), HelpTipProps, Check, Copy, Download, KeyRound, Trash2 (+25 more)

### Community 37 - "DWORD"
Cohesion: 0.17
Nodes (16): CloseHandle(), CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, CreateFileMappingW(), CreateThread(), DllMain(), map_named(), MapViewOfFile(), OpenFileMappingW() (+8 more)

### Community 38 - "Optimizer.tsx"
Cohesion: 0.13
Nodes (23): DarkOSOptimizerHint(), Flame, Headphones, Target, api(), ConfirmRequest, DEEP_RISK, fmt() (+15 more)

### Community 39 - "compilerOptions"
Cohesion: 0.10
Nodes (20): compilerOptions, allowImportingTsExtensions, baseUrl, ignoreDeprecations, isolatedModules, jsx, lib, module (+12 more)

### Community 40 - "psQuote"
Cohesion: 0.20
Nodes (9): buildDnsQuery(), clampInt(), DNS_PRESETS, DnsEngine, dnsLatencyUdp(), isUsableDnsServer(), isValidDnsAnswer(), isValidIpv4() (+1 more)

### Community 42 - "DiskScan"
Cohesion: 0.16
Nodes (4): DiskScan, Job, WIN32_FIND_DATA, HwSensors

### Community 44 - ".start"
Cohesion: 0.14
Nodes (4): FastSensorDaemon, HwSensorsDaemon, SensorBus, SlowSensorDaemon

### Community 45 - "ytdlp.js"
Cohesion: 0.18
Nodes (14): getFfmpegPath(), getYtDlpTools(), cancelActiveYtDlp(), __dirname, downloadTextWithRedirects(), downloadWithRedirects(), ensureFfmpeg(), ensureYtDlp() (+6 more)

### Community 46 - "PowerShellToolsService.js"
Cohesion: 0.11
Nodes (13): parseJsonOutput(), DARKOS_ROOT, effectivePolicy(), isPs1(), isStartFolder(), isUnderDarkOS(), normalizeScopes(), normalizeSignature() (+5 more)

### Community 48 - "icons/index.tsx"
Cohesion: 0.07
Nodes (41): AlertCircle, AppWindow, Base(), Bug, Clock, Cookie, FileOutput, FileSearch (+33 more)

### Community 49 - "Loader2"
Cohesion: 0.15
Nodes (33): AlertTriangle, Globe, RotateCcw, Shield, ShieldCheck, BlocklistsPanel(), FeedSource, KINDS (+25 more)

### Community 50 - "configManager.js"
Cohesion: 0.39
Nodes (8): CONFIG_PATH, getDefaultConfig(), loadConfig(), mergeDefaultConfig(), saveConfig(), shouldMigrateVerifyUrl(), loadRuntimeConfig(), normalizeWebhookUrl()

### Community 51 - "ScanModel"
Cohesion: 0.06
Nodes (31): registerDiskScanIPC(), csvCell(), DiskScanService, formatSize(), TAG_COLORS, AGE_UNITS, ATTR_BITS, classOf() (+23 more)

### Community 53 - "RefreshCw"
Cohesion: 0.06
Nodes (59): DarkOSProgress(), DarkOSSystemPanel(), fmtUptime(), LiveStats, Metric(), Row(), UpdState, api() (+51 more)

### Community 54 - "scripts"
Cohesion: 0.09
Nodes (22): scripts, build, build:native, build:pacer, build:portable, build:renderer, build:setup-inno, build:setup-nsis (+14 more)

### Community 55 - "gamingBooster"
Cohesion: 0.11
Nodes (7): gamingBooster, cpuLoadTracker, createGamingOverlay(), getRealLatency(), toggleGamingOverlay(), CpuLoadTracker, ManagedProcessRegistry

### Community 57 - "c_void"
Cohesion: 0.26
Nodes (10): com_release(), CreateWaitableTimerExW(), CreateWindowExA(), DestroyWindow(), GetProcAddress(), init_thread(), install_vtable_hooks(), LoadLibraryA() (+2 more)

### Community 58 - "SystemOptimizerService"
Cohesion: 0.12
Nodes (8): [0.4.8] - 2026-10-10, Added, Changed, Fixed, Notes, adaptResult(), SystemOptimizerService, op

### Community 59 - "[0.6.0] - 2026-10-21"
Cohesion: 0.18
Nodes (11): [0.6.0] - 2026-10-21, Added, Changed, Design, Developer, Fixed (monitoring), Fixed (Post-Install Hub), Fixed (shell) (+3 more)

### Community 60 - "StartupService.js"
Cohesion: 0.07
Nodes (34): registerRestoreIPC(), registerStartupIPC(), registerUsbIPC(), getSecurityScoreV2(), runPowerShellJson(), COMPONENTS, componentStatus(), getComponent() (+26 more)

### Community 63 - "dependencies"
Cohesion: 0.14
Nodes (14): dependencies, diff, electron-log, electron-updater, exifr, exiftool-vendored, ffmpeg-static, js-yaml (+6 more)

### Community 64 - "Changelog"
Cohesion: 0.13
Nodes (14): [0.1.0] - 2026-07-01, [0.4.0] - 2026-08-15, [0.4.6] - 2026-09-02, [0.4.7] - 2026-09-09, [0.7.0] - 2026-10-23, Added, Added, Added (+6 more)

### Community 65 - "libraryStore.js"
Cohesion: 0.20
Nodes (22): backupFilePath(), filePath(), loadLibrary(), newId(), newProfileId(), removeGame(), removeGameUnsafe(), sanitizeGame() (+14 more)

### Community 66 - "ref_node_path"
Cohesion: 0.06
Nodes (31): here, SENSOR_DAEMON_EXE, encodedPowerShellArgs(), runPowerShellJson(), __dirname, __filename, PAWNIO, __dirname (+23 more)

### Community 67 - "registerLatencyGuardian"
Cohesion: 0.10
Nodes (51): clampInt(), isSafePingHost(), now(), psSingleQuote(), registerLatencyGuardian(), applyDnsCloudflareWithUndo(), findGameProcess(), getProcessSnapshot() (+43 more)

### Community 68 - "perform_pacing"
Cohesion: 0.36
Nodes (7): get_qpc_ms(), hooked_present(), hooked_present1(), is_main_swapchain(), perform_pacing(), precision_wait(), QueryPerformanceCounter()

### Community 69 - "compute_stats"
Cohesion: 0.32
Nodes (8): compute_stats(), CUR_STATS, low01_unavailable_with_few_samples(), push_sample(), reset(), Stats, stats_come_only_from_real_samples(), .ZERO

### Community 70 - "PowerShellTools.tsx"
Cohesion: 0.11
Nodes (39): DarkOSConfirmDialog(), DarkOSConfirmDialogProps, Code, Edit3, FileCode, History, Lock, ShieldAlert (+31 more)

### Community 73 - "vite.config.js"
Cohesion: 0.29
Nodes (5): @tailwindcss/vite, vite, @vitejs/plugin-react, pkg, strictProductionCsp

### Community 74 - "OverlayService"
Cohesion: 0.09
Nodes (15): registerOverlayIPC(), createCsvParser(), FrameWindow, pct(), splitCsv(), buildRows(), DEFAULTS, METRICS (+7 more)

### Community 75 - "HwSensorsDaemon.js"
Cohesion: 0.36
Nodes (8): forgetPawnIoCheck(), here, HWSENSORS_EXE, isPawnIoInstalled(), pawnCache, bootAdvancedSensors(), registerHwSensorsIPC(), installPawnIo()

### Community 76 - "setup_shared_memory"
Cohesion: 0.40
Nodes (5): GetCurrentProcessId(), hist_recent(), publish(), QueryPerformanceFrequency(), setup_shared_memory()

### Community 77 - "Decryption.tsx"
Cohesion: 0.10
Nodes (39): ArrowRightLeft, Key, Link, atbash(), base32Decode(), base32Encode(), base58Decode(), base58Encode() (+31 more)

### Community 78 - "bug_report.md"
Cohesion: 0.50
Nodes (3): Description of Bug, Steps to Reproduce, System Information

### Community 79 - "DXGI_SWAP_CHAIN_DESC"
Cohesion: 0.50
Nodes (4): DXGI_MODE_DESC, DXGI_RATIONAL, DXGI_SAMPLE_DESC, DXGI_SWAP_CHAIN_DESC

### Community 96 - "BaseCollector"
Cohesion: 0.16
Nodes (7): BaseCollector, DEFAULT_STALE_MS, DiskCollector, NetworkCollector, ProcessCollector, StorageCollector, numOrNull()

### Community 97 - "textTools.ts"
Cohesion: 0.09
Nodes (38): ALIASES, base64Decode(), base64Encode(), charsetSize(), decodeJwt(), decodeText(), DOWS, EncodeKind (+30 more)

### Community 99 - "Features"
Cohesion: 0.29
Nodes (7): Features, Gaming and latency, Hardware, Real-time (off by default), Security and tools, Sharing, Windows maintenance

### Community 100 - "react"
Cohesion: 0.16
Nodes (21): GuardianWidget(), Eraser, MousePointerClick, Pause, PauseCircle, PlayCircle, Settings2, Zap (+13 more)

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
Cohesion: 0.08
Nodes (26): devHistory, devStartPage, history, listeners, NOISY, preview(), mainWindow(), root (+18 more)

### Community 106 - "OptimizerUtils.js"
Cohesion: 0.07
Nodes (43): buildInternalGroups(), buildPublicTweaks(), defineTweak(), LIVE_ACTIONS, snapshotNumber(), buildCommandBlock(), buildRegistryScript(), canonicalRegValue() (+35 more)

### Community 107 - "global.d.ts"
Cohesion: 0.03
Nodes (60): BenchRun, CameraState, ClamAvStatus, crypto-js, DarkHubAPI, DevTraceEntry, DiskMapDrive, DiskMapInfo (+52 more)

### Community 108 - "feature_request.md"
Cohesion: 0.50
Nodes (3): Alternatives, Proposed solution, What problem does it solve?

### Community 109 - "SpaceSniffer/index.tsx"
Cohesion: 0.10
Nodes (26): currentPageRef, Entry, ArrowRight, ChevronLeft, HardDrive, HelpCircle, Home, Keyboard (+18 more)

### Community 110 - "Security policy"
Cohesion: 0.50
Nodes (4): Reporting a vulnerability, Scope, Security policy, Supported versions

### Community 111 - "NetLatencyService.js"
Cohesion: 0.09
Nodes (39): RFC-3550, setPowerPlanHighPerformance(), findLibreOfficeSoffice(), isStartupTaskEnabled(), measureLatency(), setStartupTask(), assertSafeHost(), registerNetworkIPC() (+31 more)

### Community 112 - "UnitConverter.tsx"
Cohesion: 0.13
Nodes (32): ArrowDownUp, EncodeTool(), JwtTool(), LoremTool(), CopyButton(), copyText(), Segmented(), selectCls (+24 more)

### Community 114 - "devtools.test.ts"
Cohesion: 0.16
Nodes (33): clamp(), CMYK, cmykToRgb(), contrastRatio(), flatten(), formatCmyk(), formatHsl(), formatHsv() (+25 more)

### Community 115 - "MaintenanceService"
Cohesion: 0.14
Nodes (9): registerMaintenanceIPC(), MaintenanceService, TASKS, winget(), isDue(), nextRun(), normalizeTask(), parseTime() (+1 more)

### Community 117 - "DriverInstallService"
Cohesion: 0.21
Nodes (9): registerDriverIPC(), DriverInstallService, driversDir(), sha256File(), isExpectedSigner(), recommendedIds(), uncoveredDevices(), vendorInstallArgs() (+1 more)

### Community 119 - "driverPlan.js"
Cohesion: 0.15
Nodes (19): boardPartnerFromPnpId(), asArray(), buildPlan(), compareVersions(), devicesForUpdate(), DRIVER_ERROR_CODES, NO_DRIVER_CODES, normalizeDevice() (+11 more)

### Community 120 - "BenchmarkService"
Cohesion: 0.19
Nodes (13): registerBenchmarkIPC(), backgroundCpu(), BenchmarkService, context(), exec(), WORKER, compare(), contextWarnings() (+5 more)

### Community 121 - "README.md"
Cohesion: 0.15
Nodes (10): Third-party components (DarkHub.HwSensors), Architecture, Building from source, Contributing, How it stays safe, Install, License, JSON Rule Schema (+2 more)

### Community 122 - "DetailedHardwareInfo.tsx"
Cohesion: 0.48
Nodes (6): DetailedHardwareInfo(), gb(), HardwareInfo, Metric(), MetricGrid(), tempEntries()

### Community 123 - "nativeHost.js"
Cohesion: 0.12
Nodes (18): BROWSER_LABELS, DIALOG_STRINGS, fill(), registerVaultBridgeIPC(), ALLOWED_CALLERS, BROWSERS, buildHostManifest(), bundledHostCandidates() (+10 more)

### Community 124 - "AdvancedProtectionService"
Cohesion: 0.17
Nodes (5): parseDhSnapLines(), AdvancedProtectionService, readManagedBlockInfo(), defenderActive(), getHardeningItem()

### Community 125 - "feedParsers.js"
Cohesion: 0.12
Nodes (31): buildFirewallApplyScript(), buildIpMatcher(), chunk(), detectEol(), eachDataLine(), extractUpstreamDate(), FIREWALL_CHUNK, FIREWALL_MAX_ADDRESSES (+23 more)

### Community 126 - "[0.4.5] - 2026-09-01"
Cohesion: 0.50
Nodes (4): [0.4.5] - 2026-09-01, Added, Changed, Fixed

### Community 128 - "diskCategories.ts"
Cohesion: 0.08
Nodes (28): ANYWHERE_JUNK_DIRS, ARCHIVES, AUDIO, BASE, CATEGORIES, CATEGORY_COLOR, categoryFill(), classifyPath() (+20 more)

### Community 129 - "benchWorker.js"
Cohesion: 0.17
Nodes (14): cpuMulti(), cpuSingle(), disk4kSyncWrite(), diskSeqWrite(), file, memBandwidth(), memLatency(), now() (+6 more)

### Community 130 - "psToolBuilders.js"
Cohesion: 0.08
Nodes (34): RFC-4180, registerPowerShellIPC(), BUILDERS, buildHostsWriteScript(), buildPlan(), cell(), cleanConsoleLines(), columnsOf() (+26 more)

### Community 131 - "Dlss5Service"
Cohesion: 0.12
Nodes (6): appEvents, Dlss5Service, execAsync, execFileAsync, inspectPeExecutable(), registerDlss5IPC()

### Community 132 - "DriverInstallService.js"
Cohesion: 0.19
Nodes (12): buildInstallScript(), dhpFunc(), readWuOutput(), WU_UNLOCK_FUNCS, wuErrorKind(), wuSearchElevatedScript(), wuSearchScript(), AMD_DRIVERS_PAGE (+4 more)

### Community 133 - "MetaDataEditor.tsx"
Cohesion: 0.13
Nodes (27): APP_VERSION, APP_VERSION_LABEL, CheckCircle2, Save, fromLocalInput(), MetaxFilePanel(), pad(), toLocalInput() (+19 more)

### Community 134 - "background.js"
Cohesion: 0.19
Nodes (29): authenticate(), badge(), browserName(), clearPendingSave(), connect(), disconnect(), fetchCredentials(), fromPopup() (+21 more)

### Community 135 - "driverInstall.test.ts"
Cohesion: 0.25
Nodes (4): DISABLED, NIC_NO_DRIVER, NV_GPU_BASIC, PS2_GHOST

### Community 136 - "bridgeServer.js"
Cohesion: 0.13
Nodes (15): isLoopbackAddress(), generatePairingCode(), BROWSERS, callerFromArgs(), FrameDecoder, MAX_INBOUND_FRAME, MAX_OUTBOUND_FRAME, MESSAGE_TYPES (+7 more)

### Community 137 - ".runElevatedPowerShell"
Cohesion: 0.18
Nodes (5): DefenderControlEngine, ElevationHelper, execAsync, waitForElevated(), MemoryEngine

### Community 140 - "ooxmlZip.js"
Cohesion: 0.16
Nodes (20): crc32(), CRC_TABLE, elementRe(), entryData(), getXmlElement(), OOXML_FIELDS, readOoxmlProps(), readZipEntries() (+12 more)

### Community 141 - "manifest.json"
Cohesion: 0.10
Nodes (19): action, default_popup, default_title, background, scripts, service_worker, browser_specific_settings, gecko (+11 more)

### Community 142 - "exiftoolRunner.js"
Cohesion: 0.31
Nodes (10): assignArg(), needsFile(), readBinaryTag(), readTags(), runExiftool(), tmpName(), writeTagsTo(), writeWithExiftool() (+2 more)

### Community 143 - "MetadataService.js"
Cohesion: 0.11
Nodes (15): AUDIO_FF, COVER_TYPES, digits(), EXIF_IMAGE, FF_AUDIO, FF_VIDEO, HIDDEN_GROUPS, IMAGE_FIELDS (+7 more)

### Community 145 - "vaultBridge.test.ts"
Cohesion: 0.24
Nodes (10): buildClientProof(), buildServerProof(), hmacHex(), CALLER_ARGS, FakeHost, makeServer(), mkTmp(), pair() (+2 more)

### Community 146 - "fileProbe.js"
Cohesion: 0.20
Nodes (15): ascii(), ATTR, detectType(), EXT_ALIASES, extMatches(), parseZoneIdentifier(), probeFile(), RAW_EXT (+7 more)

### Community 147 - "domainMatch.js"
Cohesion: 0.28
Nodes (15): defaultPort(), findMatchingEntries(), GENERIC_SECOND_LEVEL, isIpHost(), isIPv4(), isIPv6(), isLoopbackHost(), matchSite() (+7 more)

### Community 148 - "metaxTypes.ts"
Cohesion: 0.12
Nodes (15): Props, Props, MetaxBackend, MetaxCheck, MetaxDetect, MetaxField, MetaxFieldKind, MetaxFsInfo (+7 more)

### Community 149 - "Dlss5Manager.tsx"
Cohesion: 0.21
Nodes (14): FileText, Sparkles, Dlss5Manager(), dlss5Tier(), GameRow, KIND_LABEL, legacy(), Tier (+6 more)

### Community 152 - "content.js"
Cohesion: 0.35
Nodes (12): ensureUi(), fillCredentials(), hideUi(), loginFieldsFrom(), menuMessage(), onIconClick(), passwordFields(), positionUi() (+4 more)

### Community 154 - "CodeRunner.js"
Cohesion: 0.36
Nodes (9): registerCodeRunnerIPC(), cancelRun(), detected, detectRuntimes(), exec(), killTree(), runCode(), RUNTIMES (+1 more)

### Community 155 - "read"
Cohesion: 0.30
Nodes (15): asText(), coverKey(), buildGroups(), canonicalValues(), read(), readAllTags(), verify(), gpsKeys() (+7 more)

### Community 156 - "nsis"
Cohesion: 0.17
Nodes (12): nsis, allowToChangeInstallationDirectory, createDesktopShortcut, createStartMenuShortcut, differentialPackage, include, installerIcon, oneClick (+4 more)

### Community 157 - "metadataEditor.test.ts"
Cohesion: 0.20
Nodes (6): exiftoolPath, ffmpegPath, haveFf, require, svc, svcNoFf

### Community 158 - "popup.js"
Cohesion: 0.33
Nodes (9): el(), refresh(), render(), root, send(), startPolling(), stopPolling(), STRINGS (+1 more)

### Community 159 - "DevTools.tsx"
Cohesion: 0.20
Nodes (9): Brackets, Calculator, FileDiff, Hash, Link2, Scale, Type, jsonMinify() (+1 more)

### Community 160 - "SecureDownload.js"
Cohesion: 0.30
Nodes (10): installGithubReleaseMsi(), execFileAsync, installOfficialRelease(), resolveFsr4Rdna2Path(), assertAllowedUrl(), assetSha256(), downloadToFile(), fetchJson() (+2 more)

### Community 161 - "DarkHub Vault browser extension"
Cohesion: 0.25
Nodes (7): 1. Register the native host (in DarkHub), 2. Load the extension, 3. Pair, DarkHub Vault browser extension, Development, Security model, Using it

### Community 162 - "psQuote"
Cohesion: 0.23
Nodes (4): buildAdvancedNetworkChanges(), LEGACY_GLOBAL_VALUES, NetworkEngine, psQuote()

### Community 163 - "ytdlpOptions.js"
Cohesion: 0.53
Nodes (4): buildExtraArgs(), CONTAINERS, parseTime(), SPONSOR_CATEGORIES

### Community 164 - ".lookupVendor"
Cohesion: 0.28
Nodes (8): intelPackageFor(), isTrustedPackageUrl(), nvidiaLookupUrl(), nvidiaVersionFromWindows(), parseAmdDriversPage(), parseIntelDownloadPage(), parseNvidiaLookup(), safeJson()

### Community 165 - "[Unreleased]"
Cohesion: 0.40
Nodes (5): Added, Changed, Fixed, Removed, [Unreleased]

### Community 166 - "[0.5.0] - 2026-10-12"
Cohesion: 0.50
Nodes (4): [0.5.0] - 2026-10-12, Added, Changed, Removed

### Community 167 - "manifestIndexer.js"
Cohesion: 0.67
Nodes (3): buildIndex(), isWindows(), js-yaml

### Community 168 - "hasFileAccessGrant"
Cohesion: 0.32
Nodes (8): assertFileAccessGranted(), assertFileAccessGrantedMany(), assertOutputDirGranted(), grantDirectoryPath(), grantFilePath(), hasFileAccessGrant(), isPathInside(), normalizeAccessPath()

### Community 169 - "repository"
Cohesion: 0.67
Nodes (3): repository, type, url

### Community 170 - "ClamAv"
Cohesion: 0.24
Nodes (4): ClamAv, freshclamConf(), parseClamscan(), run()

### Community 171 - "loadVaultUsingWrapper"
Cohesion: 0.23
Nodes (13): clearVaultAutoLock(), ensureUnlocked(), loadVaultUsingWrapper(), lockVault(), persistVaultData(), readVaultFile(), scheduleVaultAutoLock(), setVaultAutoLockMinutes() (+5 more)

### Community 172 - "createMetadataService"
Cohesion: 0.24
Nodes (11): registerMetadataIPC(), hexDump(), createMetadataService(), uniqueBackupPath(), write(), writeOoxml(), writeWithFfmpeg(), isoDate() (+3 more)

### Community 174 - "lhmSummary.js"
Cohesion: 0.60
Nodes (4): buildTree(), find(), RING0_CPU_TYPES, summarizeLhm()

### Community 175 - "walk"
Cohesion: 0.67
Nodes (3): scanDirectoryForBestExe(), walk(), scoreExecutable()

### Community 176 - "machineMarker.js"
Cohesion: 0.47
Nodes (9): _0x3c4d, ensureMachineMarker(), execFileAsync, _getH(), _mk(), _readMarker(), _regR(), _regW() (+1 more)

### Community 178 - "FramePacerOverlay.js"
Cohesion: 0.29
Nodes (7): closeFramePacerOverlay(), createFramePacerOverlay(), getOverlayStatus(), overlayConfig, setOverlayClickThrough(), setOverlayConfig(), toggleFramePacerOverlay()

### Community 179 - "vaultTransfer.js"
Cohesion: 0.48
Nodes (5): MAGIC, makeCode(), openVault(), parseCode(), sealVault()

### Community 180 - "ensureElevated.js"
Cohesion: 0.73
Nodes (4): buildRelaunchCommand(), ensureElevated(), quoteArg(), relaunchAsAdmin()

### Community 182 - "exiftool-vendored"
Cohesion: 0.67
Nodes (3): getExiftoolPath(), getExiftool(), exiftool-vendored

## Knowledge Gaps
- **18 isolated node(s):** `RFC-3550`, `RFC-4180`, `darkhub_pacer_hook`, `yaml`, `@testing-library/jest-dom` (+13 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 987 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **40 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `useI18n` to `Dashboard.tsx`, `DarkOSCenter.tsx`, `App.tsx`, `MetaDataEditor.tsx`, `webview.d.ts`, `OptiScalerManager.tsx`, `Dlss5Manager.tsx`, `package.json`, `DevTools.tsx`, `Loader2`, `Trash2`, `Optimizer.tsx`, `icons/index.tsx`, `Loader2`, `ScanModel`, `RefreshCw`, `PowerShellTools.tsx`, `Decryption.tsx`, `textTools.ts`, `react`, `useRecentActivity.ts`, `SpaceSniffer/index.tsx`, `UnitConverter.tsx`, `devtools.test.ts`, `DetailedHardwareInfo.tsx`?**
  _High betweenness centrality (0.128) - this node is a cross-community bridge._
- **What connects `RFC-3550`, `RFC-4180`, `darkhub_pacer_hook` to the rest of the system?**
  _18 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DarkOS.Recovery.psm1` be split into smaller, more focused modules?**
  _Cohesion score 0.06600877192982456 - nodes in this community are weakly interconnected._
- **Why does `Changelog` connect `Changelog` to `[Unreleased]`, `[0.5.0] - 2026-10-12`, `SystemOptimizerService`, `[0.6.0] - 2026-10-21`, `[0.4.5] - 2026-09-01`?**
  _High betweenness centrality (0.110) - this node is a cross-community bridge._
- **Should `main.js` be split into smaller, more focused modules?**
  _Cohesion score 0.048131080389144903 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `ref_node_path` to `diskCategories.ts`, `DownloadManager`, `optiscalerManager.js`, `DarkOSCenter.tsx`, `driverInstall.test.ts`, `DriverCenterService.js`, `AdvancedProtectionService.js`, `vaultBridge.test.ts`, `realtime.test.ts`, `WindowsToolsEngine.js`, `CodeRunner.js`, `package.json`, `DlssUpdater.js`, `metadataEditor.test.ts`, `SaveBackupService`, `susuya.test.ts`, `ytdlpOptions.js`, `PowerShellToolsService.js`, `ScanModel`, `ensureElevated.js`, `vaultTransfer.js`, `StartupService.js`, `libraryStore.js`, `OverlayService`, `Decryption.tsx`, `NetLatencyService.js`, `devtools.test.ts`, `MaintenanceService`, `BenchmarkService`?**
  _High betweenness centrality (0.106) - this node is a cross-community bridge._
- **Should `DownloadManager` be split into smaller, more focused modules?**
  _Cohesion score 0.07981220657276995 - nodes in this community are weakly interconnected._