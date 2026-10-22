# Graph Report - DarkHub Suite  (2026-10-21)

## Corpus Check
- 209 files · ~299,743 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 5, .example 1, .bat 1)

## Summary
- 2474 nodes · 6581 edges · 119 communities (81 shown, 38 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 73 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c1027099`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- DarkOS.Recovery.psm1
- main.js
- DownloadManager
- registerLatencyGuardian
- optiscalerManager.js
- Dashboard.tsx
- DarkOSCenter.tsx
- App.tsx
- DriverCenterService.js
- DarkOSRecoveryService
- AppManagerEngine.js
- lib.rs
- RefreshCw
- SystemEngine
- DeepTweaksEngine
- OptimizerUtils.js
- DarkHubLatencyEngine
- PowerEngine
- react
- YoutubeDownloader.tsx
- WindowsToolsEngine.js
- registerOptiScalerIPC
- README.md
- IDXGIFactory1
- build
- ClickEngine
- SetupHub.tsx
- package.json
- Dlss5Service
- DarkHubFrameLimiter
- machineMarker.js
- IntPtr
- SecurityService
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
- Settings.tsx
- NvidiaDaemon.js
- configManager.js
- HardwareHAL
- LoggerService
- icons/index.tsx
- scripts
- encodePowerShellScript
- HardwareService
- c_void
- SystemOptimizerService
- [0.6.0] - 2026-10-21
- ref_node_fs
- FramePacerEngine
- StorageEngine
- dependencies
- Changelog
- LoggerService.js
- UpdateService
- .runElevatedPowerShell
- perform_pacing
- compute_stats
- buildAnalysis
- TempsCollector
- CoverProviderService
- vite.config.js
- runCommand
- psQuote
- setup_shared_memory
- WindowsToolsEngine.js
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
- overlay.js
- .Dump
- [0.4.5] - 2026-09-01
- ToolboxEngine.js
- gamingBooster
- DetailedHardwareInfo.tsx
- dev.mjs
- DarkHub "Frost" design system
- DarkHub Suite: instruções para o Claude
- electron
- HwSensorsDaemon.js
- darkosData.ts
- useDeepHardware.ts
- ScanModel
- useJunkScanner.ts
- useRecentActivity.ts
- [0.5.0] - 2026-10-12
- main.tsx
- vitest
- THIRD_PARTY.md
- webview.d.ts

## God Nodes (most connected - your core abstractions)
1. `useI18n()` - 88 edges
2. `react` - 67 edges
3. `PageHeader()` - 59 edges
4. `runPowerShell()` - 58 edges
5. `Loader2` - 54 edges
6. `registerLatencyGuardian()` - 47 edges
7. `DarkHubLatencyEngine` - 46 edges
8. `DownloadManager` - 42 edges
9. `RefreshCw` - 41 edges
10. `App()` - 38 edges

## Surprising Connections (you probably didn't know these)
- `Added` --references--> `DnsEngine`  [INFERRED]
  CHANGELOG.md → electron/services/optimizer/DnsEngine.js
- `Added` --references--> `visibleInterval()`  [INFERRED]
  CHANGELOG.md → src/utils/visibleInterval.ts
- `Added` --references--> `SystemOptimizerService`  [INFERRED]
  CHANGELOG.md → electron/services/optimizer/SystemOptimizerService.js
- `showMainWindow()` --indirect_call--> `mainWindow()`  [INFERRED]
  electron/main.js → electron/devSelfTest.js
- `newManager()` --calls--> `DownloadManager`  [EXTRACTED]
  tests/downloads.test.ts → electron/services/downloads/DownloadManager.js

## Import Cycles
- None detected.

## Communities (119 total, 38 thin omitted)

### Community 0 - "DarkOS.Recovery.psm1"
Cohesion: 0.07
Nodes (92): Write-DhFail(), Write-DhLine(), Add-DkHistory(), Add-DkResults(), ConvertTo-DkHashtable(), ConvertTo-DkSignedDword(), ConvertTo-DkUInt32(), Enter-DkDefaultUser() (+84 more)

### Community 1 - "main.js"
Cohesion: 0.04
Nodes (76): registerDiskScanIPC(), registerWinToolsIPC(), appConfig, assertFileAccessGranted(), assertFileAccessGrantedMany(), assertOutputDirGranted(), autoclickerConfigPath(), canSendDiscord() (+68 more)

### Community 2 - "DownloadManager"
Cohesion: 0.08
Nodes (21): AbortedError, DEFAULT_SETTINGS, DownloadManager, hashFile(), request(), sleep(), CATEGORY_BY_EXT, categoryForFile() (+13 more)

### Community 3 - "registerLatencyGuardian"
Cohesion: 0.10
Nodes (51): clampInt(), isSafePingHost(), now(), psSingleQuote(), registerLatencyGuardian(), applyDnsCloudflareWithUndo(), findGameProcess(), getProcessSnapshot() (+43 more)

### Community 4 - "optiscalerManager.js"
Cohesion: 0.17
Nodes (28): applyIniPatch(), applyOptiScaler(), backupPathIfExists(), copySourceDirectory(), copySourceRootFiles(), createManualBackup(), deleteBackup(), detectInstalledLoaders() (+20 more)

### Community 5 - "Dashboard.tsx"
Cohesion: 0.08
Nodes (40): ChevronDown, Cpu, CpuIcon, Fan, Filter, LayoutTemplate, List, MemoryStick (+32 more)

### Community 6 - "DarkOSCenter.tsx"
Cohesion: 0.07
Nodes (61): DarkOSConfirmDialog(), DarkOSConfirmDialogProps, DarkOSProgress(), DarkOSSystemPanel(), fmtUptime(), LiveStats, Metric(), Row() (+53 more)

### Community 7 - "App.tsx"
Cohesion: 0.07
Nodes (40): AdvancedSecurity, App(), AutoClicker, DarkOSCenter, Dashboard, Decryption, DevTools, DllInjector (+32 more)

### Community 8 - "DriverCenterService.js"
Cohesion: 0.14
Nodes (15): registerDriverIPC(), cameraIssues(), classifyVendor(), DARKOS_CAMERA_ITEMS, DriverCenterService, isGenericDisplayDriver(), isOfficialDriverUrl(), normalizeAdapter() (+7 more)

### Community 9 - "DarkOSRecoveryService"
Cohesion: 0.07
Nodes (23): CLI_FILE, COMMANDS, DARKOS_ROOT, DarkOSRecoveryService, defaultBundledDir(), defaultIsElevated(), defaultRunner(), extractChangeResults() (+15 more)

### Community 10 - "AppManagerEngine.js"
Cohesion: 0.10
Nodes (14): AppManagerEngine, BLOATWARE_LIST, toArray(), buildStartupApprovedBytes(), bytesToHex(), isCriticalProcessName(), isProtectedAppx(), isProtectedService() (+6 more)

### Community 11 - "lib.rs"
Cohesion: 0.06
Nodes (31): BUSY, CONFIG_PTR, FRAME_COUNT, HIST, HIST_CAP, HIST_HEAD, HIST_LEN, HOOK_INSTALLED (+23 more)

### Community 12 - "RefreshCw"
Cohesion: 0.19
Nodes (17): Clipboard, HardDrive, HelpCircle, Home, LayoutGrid, RefreshCw, UploadCloud, ImageTextExtractor() (+9 more)

### Community 13 - "SystemEngine"
Cohesion: 0.11
Nodes (9): bcdValueToArg(), isValidCapabilityName(), isValidExecutionPolicy(), isValidPciInstanceId(), parseDhSnapLines(), validatePagefileSizes(), scArgFromStartMode(), ServicesEngine (+1 more)

### Community 14 - "DeepTweaksEngine"
Cohesion: 0.14
Nodes (4): DeepTweaksEngine, parseRegistryReadOutput(), regEntryId(), VisualsEngine

### Community 15 - "OptimizerUtils.js"
Cohesion: 0.10
Nodes (34): buildInternalGroups(), buildPublicTweaks(), defineTweak(), LIVE_ACTIONS, snapshotNumber(), buildCommandBlock(), buildRegistryScript(), canonicalRegValue() (+26 more)

### Community 16 - "DarkHubLatencyEngine"
Cohesion: 0.09
Nodes (5): DarkHubLatencyEngine, ICMP_ECHO_REPLY, IP_OPTION_INFORMATION, PROCESS_POWER_THROTTLING_STATE, DXGI_ADAPTER_DESC1

### Community 18 - "react"
Cohesion: 0.07
Nodes (49): crypto-js, diff, react, currentPageRef, Entry, GuardianWidget(), ArrowDownUp, ArrowRightLeft (+41 more)

### Community 19 - "YoutubeDownloader.tsx"
Cohesion: 0.11
Nodes (29): HelpSection, HelpTip(), HelpTipProps, Archive, ArrowRight, Clock, Cookie, Copy (+21 more)

### Community 21 - "registerOptiScalerIPC"
Cohesion: 0.23
Nodes (11): installGithubReleaseMsi(), execFileAsync, registerOptiScalerIPC(), resolveFsr4Rdna2Path(), withMutationLock(), execFileAsync, assertAllowedUrl(), assetSha256() (+3 more)

### Community 22 - "README.md"
Cohesion: 0.06
Nodes (29): 1. Translations (i18n), 2. Security Rules, 3. Bug Fixes and Code Improvements, Areas of Contribution, Contributing to DarkHub Suite, Development Workflow, 1. System Optimizer & Hardware Telemetry, 3. Endpoint Defensive Security & Hardening (+21 more)

### Community 24 - "build"
Cohesion: 0.06
Nodes (32): build, appId, asarUnpack, compression, directories, electronFuses, electronLanguages, extraResources (+24 more)

### Community 25 - "ClickEngine"
Cohesion: 0.12
Nodes (7): [0.4.6] - 2026-09-02, Added, Fixed, ClickEngine, INPUT, MOUSEINPUT, 2. DarkPacer & Low-Latency Gaming Engine

### Community 26 - "SetupHub.tsx"
Cohesion: 0.12
Nodes (28): CheckCheck, CheckSquare, Download, Eye, EyeOff, KeyRound, Layers, MousePointer (+20 more)

### Community 27 - "package.json"
Cohesion: 0.07
Nodes (26): createOcrWorker(), getExiftool(), author, description, license, main, name, private (+18 more)

### Community 28 - "Dlss5Service"
Cohesion: 0.15
Nodes (5): computeSha256(), Dlss5Service, execAsync, inspectPeExecutable(), registerDlss5IPC()

### Community 30 - "machineMarker.js"
Cohesion: 0.13
Nodes (29): _0x3c4d, ensureMachineMarker(), execFileAsync, _getH(), _mk(), _readMarker(), _regR(), _regW() (+21 more)

### Community 31 - "IntPtr"
Cohesion: 0.14
Nodes (4): CoreTempData, DarkHubSensorDaemon, GpuAdapter, PDH_FMT_COUNTERVALUE

### Community 33 - "devDependencies"
Cohesion: 0.09
Nodes (22): devDependencies, concurrently, crypto-js, electron, electron-builder, @fontsource-variable/geist, @fontsource-variable/geist-mono, jsdom (+14 more)

### Community 34 - "BaseCollector"
Cohesion: 0.16
Nodes (11): BaseCollector, DEFAULT_STALE_MS, DiskCollector, GpuCollector, LatencyCollector, NetworkCollector, classifyTemperature(), createSensor() (+3 more)

### Community 35 - "libraryStore.js"
Cohesion: 0.21
Nodes (21): backupFilePath(), filePath(), loadLibrary(), newId(), newProfileId(), removeGame(), removeGameUnsafe(), sanitizeGame() (+13 more)

### Community 36 - "react"
Cohesion: 0.09
Nodes (47): DarkOSOptimizerHint(), EmbeddedSitePage(), EmbeddedSitePageProps, AlertCircle, Check, ChevronUp, DarkHubMark, FolderOpen (+39 more)

### Community 37 - "DWORD"
Cohesion: 0.17
Nodes (16): CloseHandle(), CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, CreateFileMappingW(), CreateThread(), DllMain(), map_named(), MapViewOfFile(), OpenFileMappingW() (+8 more)

### Community 38 - "Optimizer.tsx"
Cohesion: 0.12
Nodes (26): Flame, Globe, Headphones, History, RotateCcw, Target, Undo2, api() (+18 more)

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
Cohesion: 0.14
Nodes (4): FastSensorDaemon, HwSensorsDaemon, SensorBus, SlowSensorDaemon

### Community 45 - "ytdlp.js"
Cohesion: 0.18
Nodes (14): getFfmpegPath(), getYtDlpTools(), cancelActiveYtDlp(), __dirname, downloadTextWithRedirects(), downloadWithRedirects(), ensureFfmpeg(), ensureYtDlp() (+6 more)

### Community 46 - "PowerShellToolsService.js"
Cohesion: 0.20
Nodes (11): registerPowerShellIPC(), DARKOS_ROOT, effectivePolicy(), isPs1(), isUnderDarkOS(), normalizeScopes(), normalizeSignature(), POLICY_PRECEDENCE (+3 more)

### Community 48 - "Settings.tsx"
Cohesion: 0.35
Nodes (10): APP_VERSION, APP_VERSION_LABEL, CheckCircle2, ResourceUsageSection(), SettingRow(), SettingsGroup(), SettingsPage(), Status (+2 more)

### Community 50 - "configManager.js"
Cohesion: 0.39
Nodes (8): CONFIG_PATH, getDefaultConfig(), loadConfig(), mergeDefaultConfig(), saveConfig(), shouldMigrateVerifyUrl(), loadRuntimeConfig(), normalizeWebhookUrl()

### Community 51 - "HardwareHAL"
Cohesion: 0.18
Nodes (3): CpuCollector, RamCollector, HardwareHAL

### Community 53 - "icons/index.tsx"
Cohesion: 0.07
Nodes (46): Activity, AppWindow, Base(), Bug, ChevronLeft, Code, Crosshair, Edit3 (+38 more)

### Community 54 - "scripts"
Cohesion: 0.09
Nodes (22): scripts, build, build:native, build:pacer, build:portable, build:renderer, build:setup-inno, build:setup-nsis (+14 more)

### Community 55 - "encodePowerShellScript"
Cohesion: 0.40
Nodes (6): encodedPowerShellArgs(), classifyAmdArchitecture(), getGpuInfo(), runPowerShellJson(), encodePowerShellScript(), powerShellArgsForEncodedScript()

### Community 57 - "c_void"
Cohesion: 0.26
Nodes (10): com_release(), CreateWaitableTimerExW(), CreateWindowExA(), DestroyWindow(), GetProcAddress(), init_thread(), install_vtable_hooks(), LoadLibraryA() (+2 more)

### Community 58 - "SystemOptimizerService"
Cohesion: 0.12
Nodes (7): [0.4.8] - 2026-10-10, Added, Changed, Fixed, Notes, SystemOptimizerService, op

### Community 59 - "[0.6.0] - 2026-10-21"
Cohesion: 0.22
Nodes (9): [0.6.0] - 2026-10-21, Added, Changed, Design, Developer, Fixed (monitoring), Fixed (Post-Install Hub), Fixed (shell) (+1 more)

### Community 60 - "ref_node_fs"
Cohesion: 0.07
Nodes (27): TAG_COLORS, __dirname, __filename, __dirname, __filename, buildImageDefenderRestoreScript(), IMAGE_DEFENDER_DEFAULTS, POLICY_CHANGES (+19 more)

### Community 63 - "dependencies"
Cohesion: 0.18
Nodes (11): dependencies, diff, electron-log, electron-updater, exifr, exiftool-vendored, ffmpeg-static, pdf-parse (+3 more)

### Community 64 - "Changelog"
Cohesion: 0.20
Nodes (9): [0.1.0] - 2026-07-01, [0.4.0] - 2026-08-15, [0.4.7] - 2026-09-09, Added, Added, Added, Changelog, Fixed (+1 more)

### Community 65 - "LoggerService.js"
Cohesion: 0.13
Nodes (6): here, SENSOR_DAEMON_EXE, QUERY_FIELDS, ProcessCollector, StorageCollector, SECRET_PATTERNS

### Community 67 - ".runElevatedPowerShell"
Cohesion: 0.15
Nodes (4): DefenderControlEngine, ElevationHelper, execAsync, parseUninstallString()

### Community 68 - "perform_pacing"
Cohesion: 0.36
Nodes (7): get_qpc_ms(), hooked_present(), hooked_present1(), is_main_swapchain(), perform_pacing(), precision_wait(), QueryPerformanceCounter()

### Community 69 - "compute_stats"
Cohesion: 0.32
Nodes (8): compute_stats(), CUR_STATS, low01_unavailable_with_few_samples(), push_sample(), reset(), Stats, stats_come_only_from_real_samples(), .ZERO

### Community 70 - "buildAnalysis"
Cohesion: 0.18
Nodes (14): buildAnalysis(), buildIniPatch(), chooseInputApi(), chooseLoader(), detectUpscaleFiles(), findUnrealExecutableCandidates(), getExePayload(), getSourceVersion() (+6 more)

### Community 73 - "vite.config.js"
Cohesion: 0.29
Nodes (5): @tailwindcss/vite, vite, @vitejs/plugin-react, pkg, strictProductionCsp

### Community 74 - "runCommand"
Cohesion: 0.23
Nodes (9): setPowerPlanHighPerformance(), findLibreOfficeSoffice(), isStartupTaskEnabled(), measureLatency(), setStartupTask(), assertSafeHost(), registerNetworkIPC(), runCmd() (+1 more)

### Community 75 - "psQuote"
Cohesion: 0.26
Nodes (4): NetworkEngine, buildRegistryReadScript(), isValidFeatureName(), psQuote()

### Community 76 - "setup_shared_memory"
Cohesion: 0.40
Nodes (5): GetCurrentProcessId(), hist_recent(), publish(), QueryPerformanceFrequency(), setup_shared_memory()

### Community 77 - "WindowsToolsEngine.js"
Cohesion: 0.25
Nodes (8): ACTIONS, featureById(), featureReadScript(), NOT_WINDOWS, PANELS, parseFeatureLines(), summarizeFeatureState(), WINDOWS_FEATURES

### Community 78 - "bug_report.md"
Cohesion: 0.50
Nodes (3): Description of Bug, Steps to Reproduce, System Information

### Community 79 - "DXGI_SWAP_CHAIN_DESC"
Cohesion: 0.50
Nodes (4): DXGI_MODE_DESC, DXGI_RATIONAL, DXGI_SAMPLE_DESC, DXGI_SWAP_CHAIN_DESC

### Community 83 - "repository"
Cohesion: 0.67
Nodes (3): repository, type, url

### Community 96 - "overlay.js"
Cohesion: 0.28
Nodes (5): cpuLoadTracker, createGamingOverlay(), getRealLatency(), toggleGamingOverlay(), CpuLoadTracker

### Community 98 - "[0.4.5] - 2026-09-01"
Cohesion: 0.50
Nodes (4): [0.4.5] - 2026-09-01, Added, Changed, Fixed

### Community 101 - "DetailedHardwareInfo.tsx"
Cohesion: 0.39
Nodes (7): DetailedHardwareInfo(), gb(), HardwareInfo, Metric(), MetricGrid(), tempEntries(), useSystemMetrics()

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
Nodes (24): devHistory, devStartPage, history, listeners, NOISY, preview(), mainWindow(), root (+16 more)

### Community 106 - "HwSensorsDaemon.js"
Cohesion: 0.14
Nodes (14): runMutations(), sleep(), forgetPawnIoCheck(), here, HWSENSORS_EXE, isPawnIoInstalled(), pawnCache, buildTree() (+6 more)

### Community 107 - "darkosData.ts"
Cohesion: 0.06
Nodes (51): Camera, FileArchive, Redo2, CameraState, crypto-js, DarkHubAPI, DevTraceEntry, DiskMapDrive (+43 more)

### Community 108 - "useDeepHardware.ts"
Cohesion: 0.50
Nodes (4): ALIASES, DeepCategoryApi, getDeepCategoryApi(), useDeepHardware()

### Community 109 - "ScanModel"
Cohesion: 0.06
Nodes (29): csvCell(), DiskScanService, formatSize(), AGE_UNITS, ATTR_BITS, classOf(), EXT_CLASS, FILE_CLASSES (+21 more)

### Community 110 - "useJunkScanner.ts"
Cohesion: 0.60
Nodes (4): CachedJunk, loadCached(), saveCache(), useJunkScanner()

### Community 111 - "useRecentActivity.ts"
Cohesion: 0.39
Nodes (7): ActivityEntry, ActivityType, formatDuration(), loadPersisted(), makeId(), persist(), useRecentActivity()

### Community 112 - "[0.5.0] - 2026-10-12"
Cohesion: 0.50
Nodes (4): [0.5.0] - 2026-10-12, Added, Changed, Removed

### Community 115 - "main.tsx"
Cohesion: 0.40
Nodes (3): @fontsource-variable/geist, @fontsource-variable/geist-mono, react-dom

### Community 118 - "vitest"
Cohesion: 0.16
Nodes (6): vitest, darkosMessages, availableLanguages, LanguageOption, messages, SupportedLang

## Knowledge Gaps
- **15 isolated node(s):** `darkhub_pacer_hook`, `@testing-library/jest-dom`, `@testing-library/react`, `@types/diff`, `@types/react` (+10 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 622 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **38 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Changelog` connect `Changelog` to `[0.4.5] - 2026-09-01`, `[0.5.0] - 2026-10-12`, `ClickEngine`, `SystemOptimizerService`, `[0.6.0] - 2026-10-21`?**
  _High betweenness centrality (0.158) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `runPowerShell()` (e.g. with `main.js` and `PowerShellRunner.js`) actually correct?**
  _`runPowerShell()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `darkhub_pacer_hook`, `@testing-library/jest-dom`, `@testing-library/react` to the rest of the system?**
  _15 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DarkOS.Recovery.psm1` be split into smaller, more focused modules?**
  _Cohesion score 0.06600877192982456 - nodes in this community are weakly interconnected._
- **Why does `[0.4.8] - 2026-10-10` connect `SystemOptimizerService` to `Changelog`?**
  _High betweenness centrality (0.157) - this node is a cross-community bridge._
- **Should `main.js` be split into smaller, more focused modules?**
  _Cohesion score 0.03511705685618729 - nodes in this community are weakly interconnected._
- **Why does `[0.4.6] - 2026-09-02` connect `ClickEngine` to `Changelog`?**
  _High betweenness centrality (0.142) - this node is a cross-community bridge._