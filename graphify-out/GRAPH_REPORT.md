# Graph Report - DarkHub Suite  (2026-10-23)

## Corpus Check
- 232 files · ~314,474 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 12 file(s) not represented in the graph (top: (none) 5, .css 2, .example 1)

## Summary
- 2679 nodes · 7119 edges · 128 communities (86 shown, 42 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 98 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8092276d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- DarkOS.Recovery.psm1
- main.js
- DownloadManager
- useI18n
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
- realtime.test.ts
- OptiScalerManager.tsx
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
- .runElevatedPowerShell
- ref_node_fs
- registerLatencyGuardian
- perform_pacing
- compute_stats
- runPowerShell
- UpdateService
- CoverProviderService
- vite.config.js
- PowerEngine
- SecureDownload.js
- setup_shared_memory
- nsis
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
- overlay.js
- .Main
- psQuote
- NvidiaDaemon
- Autopilot
- GpuCollector
- lhmSummary.js
- LatencyCollector
- README.md
- react
- walkFiles
- [0.4.5] - 2026-09-01

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

## Communities (128 total, 42 thin omitted)

### Community 0 - "DarkOS.Recovery.psm1"
Cohesion: 0.07
Nodes (92): Write-DhFail(), Write-DhLine(), Add-DkHistory(), Add-DkResults(), ConvertTo-DkHashtable(), ConvertTo-DkSignedDword(), ConvertTo-DkUInt32(), Enter-DkDefaultUser() (+84 more)

### Community 1 - "main.js"
Cohesion: 0.03
Nodes (78): registerDiskScanIPC(), registerWinToolsIPC(), encodedPowerShellArgs(), appConfig, assertFileAccessGranted(), assertFileAccessGrantedMany(), assertOutputDirGranted(), autoclickerConfigPath() (+70 more)

### Community 2 - "DownloadManager"
Cohesion: 0.08
Nodes (22): downloadsService, AbortedError, DEFAULT_SETTINGS, DownloadManager, hashFile(), request(), sleep(), CATEGORY_BY_EXT (+14 more)

### Community 3 - "useI18n"
Cohesion: 0.09
Nodes (30): EmbeddedSitePage(), EmbeddedSitePageProps, Check, Clipboard, RefreshCw, ScreenRegion, UploadCloud, DiscoveredGame (+22 more)

### Community 4 - "optiscalerManager.js"
Cohesion: 0.11
Nodes (45): applyIniPatch(), applyOptiScaler(), backupPathIfExists(), buildAnalysis(), buildIniPatch(), chooseInputApi(), chooseLoader(), classifyAmdArchitecture() (+37 more)

### Community 5 - "Dashboard.tsx"
Cohesion: 0.06
Nodes (56): Activity, AlertTriangle, Cpu, CpuIcon, Fan, Filter, LayoutTemplate, List (+48 more)

### Community 6 - "Loader2"
Cohesion: 0.05
Nodes (73): DarkOSConfirmDialog(), DarkOSConfirmDialogProps, DarkOSProgress(), DarkOSSystemPanel(), fmtUptime(), LiveStats, Metric(), Row() (+65 more)

### Community 7 - "App.tsx"
Cohesion: 0.08
Nodes (40): AdvancedSecurity, App(), AutoClicker, DarkOSCenter, Dashboard, Decryption, DevTools, DllInjector (+32 more)

### Community 8 - "DriverCenterService.js"
Cohesion: 0.13
Nodes (17): registerDriverIPC(), boardPartnerFromPnpId(), cameraIssues(), classifyVendor(), DARKOS_CAMERA_ITEMS, DriverCenterService, isGenericDisplayDriver(), isOfficialDriverUrl() (+9 more)

### Community 9 - "DarkOSRecoveryService"
Cohesion: 0.07
Nodes (23): CLI_FILE, COMMANDS, DARKOS_ROOT, DarkOSRecoveryService, defaultBundledDir(), defaultIsElevated(), defaultRunner(), extractChangeResults() (+15 more)

### Community 10 - "AppManagerEngine.js"
Cohesion: 0.10
Nodes (13): AppManagerEngine, BLOATWARE_LIST, toArray(), buildStartupApprovedBytes(), bytesToHex(), isProtectedService(), isSafeInstallLocationFor(), isValidServiceName() (+5 more)

### Community 11 - "lib.rs"
Cohesion: 0.06
Nodes (31): BUSY, CONFIG_PTR, FRAME_COUNT, HIST, HIST_CAP, HIST_HEAD, HIST_LEN, HOOK_INSTALLED (+23 more)

### Community 12 - "PageHeader"
Cohesion: 0.11
Nodes (37): HelpSection, HelpTip(), HelpTipProps, AlertCircle, Cookie, Copy, FileText, FolderOpen (+29 more)

### Community 13 - "SystemEngine"
Cohesion: 0.14
Nodes (5): bcdValueToArg(), parseDhSnapLines(), scArgFromStartMode(), ServicesEngine, SystemEngine

### Community 14 - "DeepTweaksEngine"
Cohesion: 0.12
Nodes (7): DeepTweaksEngine, kindToType(), parseRegistryReadOutput(), regEntryId(), regValueMatches(), snapshotEntryToOps(), VisualsEngine

### Community 15 - "OptimizerUtils.js"
Cohesion: 0.08
Nodes (41): buildInternalGroups(), buildPublicTweaks(), defineTweak(), LIVE_ACTIONS, snapshotNumber(), buildCommandBlock(), buildRegistryReadScript(), buildRegistryScript() (+33 more)

### Community 16 - "DarkHubLatencyEngine"
Cohesion: 0.11
Nodes (4): DarkHubLatencyEngine, ICMP_ECHO_REPLY, IP_OPTION_INFORMATION, PROCESS_POWER_THROTTLING_STATE

### Community 18 - "realtime.test.ts"
Cohesion: 0.06
Nodes (19): registerRealtimeIPC(), isCriticalProcessName(), ClamAv, run(), Quarantine, transcode(), xorStream(), clamp() (+11 more)

### Community 19 - "OptiScalerManager.tsx"
Cohesion: 0.10
Nodes (36): Archive, Camera, CheckCircle2, ChevronDown, ChevronUp, Crosshair, DownloadCloud, FileCode (+28 more)

### Community 20 - "HardwareHAL"
Cohesion: 0.12
Nodes (5): CpuCollector, ProcessCollector, RamCollector, StorageCollector, HardwareHAL

### Community 21 - "WindowsToolsEngine.js"
Cohesion: 0.13
Nodes (10): ACTIONS, featureById(), featureReadScript(), launch(), NOT_WINDOWS, PANELS, parseFeatureLines(), summarizeFeatureState() (+2 more)

### Community 22 - "CONTRIBUTING.md"
Cohesion: 0.17
Nodes (10): 1. Translations (i18n), 2. Security Rules, 3. Bug Fixes and Code Improvements, Areas of Contribution, Contributing to DarkHub Suite, Development Workflow, Adding or Editing Translations, Method 1: In-App Testing (+2 more)

### Community 24 - "build"
Cohesion: 0.10
Nodes (21): build, appId, asarUnpack, compression, directories, electronFuses, electronLanguages, extraResources (+13 more)

### Community 25 - "ClickEngine"
Cohesion: 0.14
Nodes (4): Added, ClickEngine, INPUT, MOUSEINPUT

### Community 26 - "Dlss5Service"
Cohesion: 0.19
Nodes (4): Dlss5Service, execAsync, inspectPeExecutable(), registerDlss5IPC()

### Community 27 - "package.json"
Cohesion: 0.07
Nodes (29): createOcrWorker(), getExiftool(), author, description, license, main, name, private (+21 more)

### Community 28 - "DlssUpdater.js"
Cohesion: 0.16
Nodes (16): registerUpscaleIPC(), DLSS_FILES, DlssUpdater, HOSTS, RAW(), safe(), scanGameFolder(), SKIP_DIRS (+8 more)

### Community 30 - "machineMarker.js"
Cohesion: 0.14
Nodes (28): _0x3c4d, ensureMachineMarker(), execFileAsync, _getH(), _mk(), _readMarker(), _regR(), _regW() (+20 more)

### Community 31 - "IntPtr"
Cohesion: 0.15
Nodes (4): CoreTempData, DarkHubSensorDaemon, GpuAdapter, PDH_FMT_COUNTERVALUE

### Community 32 - "susuya.test.ts"
Cohesion: 0.12
Nodes (27): normalizeShareConfig(), readJson(), registerShareIPC(), capture(), upload(), TTLS, writeJson(), here (+19 more)

### Community 33 - "devDependencies"
Cohesion: 0.09
Nodes (22): devDependencies, concurrently, crypto-js, electron, electron-builder, @fontsource-variable/geist, @fontsource-variable/geist-mono, jsdom (+14 more)

### Community 34 - "BaseCollector"
Cohesion: 0.20
Nodes (9): BaseCollector, DEFAULT_STALE_MS, DiskCollector, NetworkCollector, classifyTemperature(), createSensor(), createUnavailableSensor(), numOrNull() (+1 more)

### Community 35 - "libraryStore.js"
Cohesion: 0.21
Nodes (21): backupFilePath(), filePath(), loadLibrary(), newId(), newProfileId(), removeGame(), removeGameUnsafe(), sanitizeGame() (+13 more)

### Community 36 - "react"
Cohesion: 0.23
Nodes (17): Clock, DarkHubMark, Plus, Settings, GameCard(), GameCardProps, GameEditorModal(), GameEditorModalProps (+9 more)

### Community 37 - "DWORD"
Cohesion: 0.17
Nodes (16): CloseHandle(), CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, CreateFileMappingW(), CreateThread(), DllMain(), map_named(), MapViewOfFile(), OpenFileMappingW() (+8 more)

### Community 38 - "Optimizer.tsx"
Cohesion: 0.12
Nodes (27): DarkOSOptimizerHint(), Flame, Globe, Headphones, History, RotateCcw, Target, Undo2 (+19 more)

### Community 39 - "compilerOptions"
Cohesion: 0.10
Nodes (20): compilerOptions, allowImportingTsExtensions, baseUrl, ignoreDeprecations, isolatedModules, jsx, lib, module (+12 more)

### Community 40 - "psQuote"
Cohesion: 0.20
Nodes (9): buildDnsQuery(), clampInt(), DNS_PRESETS, DnsEngine, dnsLatencyUdp(), isUsableDnsServer(), isValidDnsAnswer(), isValidIpv4() (+1 more)

### Community 42 - "DiskScan"
Cohesion: 0.24
Nodes (3): DiskScan, Job, WIN32_FIND_DATA

### Community 44 - ".start"
Cohesion: 0.13
Nodes (4): FastSensorDaemon, HwSensorsDaemon, SensorBus, SlowSensorDaemon

### Community 45 - "ytdlp.js"
Cohesion: 0.18
Nodes (14): getFfmpegPath(), getYtDlpTools(), cancelActiveYtDlp(), __dirname, downloadTextWithRedirects(), downloadWithRedirects(), ensureFfmpeg(), ensureYtDlp() (+6 more)

### Community 46 - "PowerShellToolsService.js"
Cohesion: 0.20
Nodes (11): registerPowerShellIPC(), DARKOS_ROOT, effectivePolicy(), isPs1(), isUnderDarkOS(), normalizeScopes(), normalizeSignature(), POLICY_PRECEDENCE (+3 more)

### Community 48 - "SpaceSniffer/index.tsx"
Cohesion: 0.13
Nodes (27): CheckCheck, CheckSquare, Download, ExternalLink, HardDrive, HelpCircle, Home, LayoutGrid (+19 more)

### Community 49 - "MainLayout.tsx"
Cohesion: 0.09
Nodes (34): APP_VERSION, APP_VERSION_LABEL, GuardianWidget(), ChevronLeft, ChevronRight, Edit3, Film, Fingerprint (+26 more)

### Community 50 - "configManager.js"
Cohesion: 0.39
Nodes (8): CONFIG_PATH, getDefaultConfig(), loadConfig(), mergeDefaultConfig(), saveConfig(), shouldMigrateVerifyUrl(), loadRuntimeConfig(), normalizeWebhookUrl()

### Community 51 - "ScanModel"
Cohesion: 0.05
Nodes (31): csvCell(), DiskScanService, formatSize(), AGE_UNITS, ATTR_BITS, classOf(), EXT_CLASS, FILE_CLASSES (+23 more)

### Community 53 - "icons/index.tsx"
Cohesion: 0.06
Nodes (65): crypto-js, diff, AppWindow, ArrowRight, ArrowRightLeft, Base(), Brackets, Bug (+57 more)

### Community 54 - "scripts"
Cohesion: 0.09
Nodes (22): scripts, build, build:native, build:pacer, build:portable, build:renderer, build:setup-inno, build:setup-nsis (+14 more)

### Community 57 - "c_void"
Cohesion: 0.26
Nodes (10): com_release(), CreateWaitableTimerExW(), CreateWindowExA(), DestroyWindow(), GetProcAddress(), init_thread(), install_vtable_hooks(), LoadLibraryA() (+2 more)

### Community 58 - "SystemOptimizerService"
Cohesion: 0.12
Nodes (7): [0.4.8] - 2026-10-10, Added, Changed, Fixed, Notes, SystemOptimizerService, op

### Community 59 - "[0.6.0] - 2026-10-21"
Cohesion: 0.20
Nodes (10): [0.6.0] - 2026-10-21, Added, Changed, Design, Developer, Fixed (monitoring), Fixed (Post-Install Hub), Fixed (shell) (+2 more)

### Community 60 - "HwSensorsDaemon.js"
Cohesion: 0.18
Nodes (10): runMutations(), sleep(), forgetPawnIoCheck(), here, HWSENSORS_EXE, isPawnIoInstalled(), pawnCache, registerHwSensorsIPC() (+2 more)

### Community 63 - "dependencies"
Cohesion: 0.18
Nodes (11): dependencies, diff, electron-log, electron-updater, exifr, exiftool-vendored, ffmpeg-static, pdf-parse (+3 more)

### Community 64 - "Changelog"
Cohesion: 0.11
Nodes (18): [0.1.0] - 2026-07-01, [0.4.0] - 2026-08-15, [0.4.6] - 2026-09-02, [0.4.7] - 2026-09-09, [0.5.0] - 2026-10-12, [0.7.0] - 2026-10-23, Added, Added (+10 more)

### Community 65 - ".runElevatedPowerShell"
Cohesion: 0.18
Nodes (5): DefenderControlEngine, ElevationHelper, execAsync, waitForElevated(), MemoryEngine

### Community 66 - "ref_node_fs"
Cohesion: 0.08
Nodes (16): TAG_COLORS, execFileAsync, __dirname, __filename, __dirname, __filename, MAX_ENCODED_ARG, freshclamConf() (+8 more)

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

### Community 75 - "SecureDownload.js"
Cohesion: 0.38
Nodes (10): installGithubReleaseMsi(), execFileAsync, installOfficialRelease(), resolveFsr4Rdna2Path(), assertAllowedUrl(), assetSha256(), downloadToFile(), fetchJson() (+2 more)

### Community 76 - "setup_shared_memory"
Cohesion: 0.40
Nodes (5): GetCurrentProcessId(), hist_recent(), publish(), QueryPerformanceFrequency(), setup_shared_memory()

### Community 77 - "nsis"
Cohesion: 0.18
Nodes (11): nsis, allowToChangeInstallationDirectory, createDesktopShortcut, createStartMenuShortcut, differentialPackage, include, installerIcon, oneClick (+3 more)

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
Cohesion: 0.22
Nodes (4): here, SENSOR_DAEMON_EXE, QUERY_FIELDS, SECRET_PATTERNS

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
Cohesion: 0.07
Nodes (26): Fixed (startup), devHistory, devStartPage, history, listeners, NOISY, preview(), mainWindow() (+18 more)

### Community 106 - "optimizerAudit.test.ts"
Cohesion: 0.13
Nodes (14): buildImageDefenderRestoreScript(), IMAGE_DEFENDER_DEFAULTS, POLICY_CHANGES, decodeShellOutput(), summarizeMemoryDelta(), WS_SKIP, buildAdvancedNetworkChanges(), LEGACY_GLOBAL_VALUES (+6 more)

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

### Community 112 - "overlay.js"
Cohesion: 0.27
Nodes (5): cpuLoadTracker, createGamingOverlay(), getRealLatency(), toggleGamingOverlay(), CpuLoadTracker

### Community 119 - "lhmSummary.js"
Cohesion: 0.60
Nodes (4): buildTree(), find(), RING0_CPU_TYPES, summarizeLhm()

### Community 121 - "README.md"
Cohesion: 0.15
Nodes (10): Third-party components (DarkHub.HwSensors), Architecture, Building from source, Contributing, How it stays safe, Install, License, JSON Rule Schema (+2 more)

### Community 122 - "react"
Cohesion: 0.11
Nodes (26): react, DetailedHardwareInfo(), gb(), HardwareInfo, Metric(), MetricGrid(), tempEntries(), ArrowDownUp (+18 more)

### Community 125 - "walkFiles"
Cohesion: 0.67
Nodes (3): findUnrealExecutableCandidates(), walkFiles(), walk()

### Community 126 - "[0.4.5] - 2026-09-01"
Cohesion: 0.50
Nodes (4): [0.4.5] - 2026-09-01, Added, Changed, Fixed

## Knowledge Gaps
- **15 isolated node(s):** `darkhub_pacer_hook`, `@testing-library/jest-dom`, `@testing-library/react`, `@types/diff`, `@types/react` (+10 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 675 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **42 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Changelog` connect `Changelog` to `SystemOptimizerService`, `[0.6.0] - 2026-10-21`, `[0.4.5] - 2026-09-01`?**
  _High betweenness centrality (0.159) - this node is a cross-community bridge._
- **What connects `darkhub_pacer_hook`, `@testing-library/jest-dom`, `@testing-library/react` to the rest of the system?**
  _15 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DarkOS.Recovery.psm1` be split into smaller, more focused modules?**
  _Cohesion score 0.06600877192982456 - nodes in this community are weakly interconnected._
- **Why does `[0.4.6] - 2026-09-02` connect `Changelog` to `ClickEngine`?**
  _High betweenness centrality (0.115) - this node is a cross-community bridge._
- **Should `main.js` be split into smaller, more focused modules?**
  _Cohesion score 0.03449048152295633 - nodes in this community are weakly interconnected._
- **Why does `Added` connect `ClickEngine` to `Changelog`?**
  _High betweenness centrality (0.115) - this node is a cross-community bridge._
- **Should `DownloadManager` be split into smaller, more focused modules?**
  _Cohesion score 0.08198757763975155 - nodes in this community are weakly interconnected._