# Graph Report - DarkHub Suite  (2026-10-22)

## Corpus Check
- 211 files · ~300,446 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 5, .example 1, .bat 1)

## Summary
- 2479 nodes · 6592 edges · 121 communities (86 shown, 35 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 72 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c43bac32`
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
- createSensor
- DarkOSRecoveryService
- AppManagerEngine.js
- lib.rs
- PageHeader
- SystemEngine
- DeepTweaksEngine
- OptimizerUtils.js
- DarkHubLatencyEngine
- PowerEngine
- HardwareHAL
- runCommand
- WindowsToolsEngine.js
- registerOptiScalerIPC
- CONTRIBUTING.md
- IDXGIFactory1
- build
- ClickEngine
- AdvancedSecurity.tsx
- package.json
- Dlss5Service
- DarkHubFrameLimiter
- vaultCrypto.js
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
- SetupHub.tsx
- configManager.js
- ScanModel
- LoggerService
- icons/index.tsx
- scripts
- TempsCollector
- HardwareService
- c_void
- SystemOptimizerService
- [0.6.0] - 2026-10-21
- ref_node_path
- FramePacerEngine
- StorageEngine
- dependencies
- Changelog
- NetworkEngine
- UpdateService
- SystemEngine.js
- perform_pacing
- compute_stats
- machineMarker.js
- createMainWindow
- CoverProviderService
- vite.config.js
- persistVaultData
- NvidiaDaemon
- setup_shared_memory
- FramePacerOverlay.js
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
- ElevationHelper.js
- .Dump
- [0.4.5] - 2026-09-01
- Features
- overlay.js
- DetailedHardwareInfo.tsx
- dev.mjs
- DarkHub "Frost" design system
- DarkHub Suite: instruções para o Claude
- electron
- HwSensorsDaemon.js
- darkosData.ts
- feature_request.md
- useRecentActivity.ts
- Security policy
- walk
- hwSensors.test.ts
- LoggerService.js
- useDeepHardware.ts
- TRANSLATIONS.md
- [0.5.0] - 2026-10-12
- vitest
- webview.d.ts
- README.md

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
- `darkosService` --calls--> `registerDarkOSIPC()`  [EXTRACTED]
  electron/main.js → electron/ipc/darkosIpc.js

## Import Cycles
- None detected.

## Communities (121 total, 35 thin omitted)

### Community 0 - "DarkOS.Recovery.psm1"
Cohesion: 0.07
Nodes (92): Write-DhFail(), Write-DhLine(), Add-DkHistory(), Add-DkResults(), ConvertTo-DkHashtable(), ConvertTo-DkSignedDword(), ConvertTo-DkUInt32(), Enter-DkDefaultUser() (+84 more)

### Community 1 - "main.js"
Cohesion: 0.04
Nodes (48): registerWinToolsIPC(), appConfig, assertFileAccessGranted(), assertFileAccessGrantedMany(), assertOutputDirGranted(), autoclickerConfigPath(), canSendDiscord(), computeJunkEstimate() (+40 more)

### Community 2 - "DownloadManager"
Cohesion: 0.08
Nodes (22): downloadsService, AbortedError, DEFAULT_SETTINGS, DownloadManager, hashFile(), request(), sleep(), CATEGORY_BY_EXT (+14 more)

### Community 3 - "registerLatencyGuardian"
Cohesion: 0.06
Nodes (65): registerDriverIPC(), clampInt(), isSafePingHost(), now(), psSingleQuote(), registerLatencyGuardian(), applyDnsCloudflareWithUndo(), findGameProcess() (+57 more)

### Community 4 - "optiscalerManager.js"
Cohesion: 0.09
Nodes (53): encodedPowerShellArgs(), applyIniPatch(), applyOptiScaler(), backupPathIfExists(), buildAnalysis(), buildIniPatch(), chooseInputApi(), chooseLoader() (+45 more)

### Community 5 - "Dashboard.tsx"
Cohesion: 0.06
Nodes (55): react, currentPageRef, Entry, GuardianWidget(), HelpSection, HelpTip(), HelpTipProps, ArrowDownUp (+47 more)

### Community 6 - "DarkOSCenter.tsx"
Cohesion: 0.07
Nodes (55): DarkOSConfirmDialog(), DarkOSConfirmDialogProps, DarkOSProgress(), DarkOSSystemPanel(), fmtUptime(), LiveStats, Metric(), Row() (+47 more)

### Community 7 - "App.tsx"
Cohesion: 0.08
Nodes (38): AdvancedSecurity, App(), AutoClicker, DarkOSCenter, Dashboard, Decryption, DevTools, DllInjector (+30 more)

### Community 8 - "createSensor"
Cohesion: 0.19
Nodes (7): CpuCollector, DiskCollector, LatencyCollector, NetworkCollector, createSensor(), createUnavailableSensor(), numOrNull()

### Community 9 - "DarkOSRecoveryService"
Cohesion: 0.07
Nodes (23): CLI_FILE, COMMANDS, DARKOS_ROOT, DarkOSRecoveryService, defaultBundledDir(), defaultIsElevated(), defaultRunner(), extractChangeResults() (+15 more)

### Community 10 - "AppManagerEngine.js"
Cohesion: 0.11
Nodes (12): AppManagerEngine, BLOATWARE_LIST, toArray(), buildStartupApprovedBytes(), bytesToHex(), isCriticalProcessName(), isProtectedAppx(), isSafeInstallLocationFor() (+4 more)

### Community 11 - "lib.rs"
Cohesion: 0.06
Nodes (31): BUSY, CONFIG_PTR, FRAME_COUNT, HIST, HIST_CAP, HIST_HEAD, HIST_LEN, HOOK_INSTALLED (+23 more)

### Community 12 - "PageHeader"
Cohesion: 0.10
Nodes (42): AlertCircle, Archive, ArrowRight, Check, ChevronUp, Clipboard, FolderOpen, HardDrive (+34 more)

### Community 13 - "SystemEngine"
Cohesion: 0.11
Nodes (11): bcdValueToArg(), isProtectedService(), isValidExecutionPolicy(), isValidFeatureName(), isValidPciInstanceId(), isValidServiceName(), parseDhSnapLines(), MANAGED_SERVICES (+3 more)

### Community 14 - "DeepTweaksEngine"
Cohesion: 0.15
Nodes (3): DeepTweaksEngine, regEntryId(), VisualsEngine

### Community 15 - "OptimizerUtils.js"
Cohesion: 0.09
Nodes (36): buildInternalGroups(), buildPublicTweaks(), defineTweak(), LIVE_ACTIONS, snapshotNumber(), buildCommandBlock(), buildRegistryReadScript(), buildRegistryScript() (+28 more)

### Community 16 - "DarkHubLatencyEngine"
Cohesion: 0.09
Nodes (4): DarkHubLatencyEngine, IP_OPTION_INFORMATION, PROCESS_POWER_THROTTLING_STATE, DXGI_ADAPTER_DESC1

### Community 19 - "runCommand"
Cohesion: 0.21
Nodes (9): setPowerPlanHighPerformance(), findLibreOfficeSoffice(), isStartupTaskEnabled(), measureLatency(), setStartupTask(), assertSafeHost(), registerNetworkIPC(), runCmd() (+1 more)

### Community 20 - "WindowsToolsEngine.js"
Cohesion: 0.13
Nodes (10): ACTIONS, featureById(), featureReadScript(), launch(), NOT_WINDOWS, PANELS, parseFeatureLines(), summarizeFeatureState() (+2 more)

### Community 21 - "registerOptiScalerIPC"
Cohesion: 0.28
Nodes (7): resolveFsr4Rdna2Path(), execFileAsync, assertAllowedUrl(), assetSha256(), downloadToFile(), fetchJson(), GITHUB_HOSTS

### Community 22 - "CONTRIBUTING.md"
Cohesion: 0.29
Nodes (6): 1. Translations (i18n), 2. Security Rules, 3. Bug Fixes and Code Improvements, Areas of Contribution, Contributing to DarkHub Suite, Development Workflow

### Community 24 - "build"
Cohesion: 0.06
Nodes (32): build, appId, asarUnpack, compression, directories, electronFuses, electronLanguages, extraResources (+24 more)

### Community 25 - "ClickEngine"
Cohesion: 0.14
Nodes (4): Added, ClickEngine, INPUT, MOUSEINPUT

### Community 26 - "AdvancedSecurity.tsx"
Cohesion: 0.09
Nodes (35): Code, KeyRound, Laptop, LayoutTemplate, Lock, MemoryStick, Network, Radio (+27 more)

### Community 27 - "package.json"
Cohesion: 0.06
Nodes (30): createOcrWorker(), getExiftool(), author, description, license, main, name, private (+22 more)

### Community 28 - "Dlss5Service"
Cohesion: 0.15
Nodes (5): computeSha256(), Dlss5Service, execAsync, inspectPeExecutable(), registerDlss5IPC()

### Community 29 - "DarkHubFrameLimiter"
Cohesion: 0.13
Nodes (3): DarkHubFrameLimiter, TelemetrySnapshot, ICMP_ECHO_REPLY

### Community 30 - "vaultCrypto.js"
Cohesion: 0.29
Nodes (12): aesGcmDecrypt(), aesGcmEncrypt(), buildDefaultWordList(), buildKdf(), derivePasswordFromRecoveryWords(), encryptVaultData(), fromB64(), generateRecoveryWords() (+4 more)

### Community 31 - "IntPtr"
Cohesion: 0.15
Nodes (4): CoreTempData, DarkHubSensorDaemon, GpuAdapter, PDH_FMT_COUNTERVALUE

### Community 33 - "devDependencies"
Cohesion: 0.09
Nodes (22): devDependencies, concurrently, crypto-js, electron, electron-builder, @fontsource-variable/geist, @fontsource-variable/geist-mono, jsdom (+14 more)

### Community 34 - "BaseCollector"
Cohesion: 0.14
Nodes (7): BaseCollector, DEFAULT_STALE_MS, GpuCollector, QUERY_FIELDS, ProcessCollector, StorageCollector, sameGpu()

### Community 35 - "libraryStore.js"
Cohesion: 0.21
Nodes (21): backupFilePath(), filePath(), loadLibrary(), newId(), newProfileId(), removeGame(), removeGameUnsafe(), sanitizeGame() (+13 more)

### Community 36 - "react"
Cohesion: 0.14
Nodes (28): EmbeddedSitePage(), EmbeddedSitePageProps, Clock, Plus, Settings, GameCard(), GameCardProps, DiscoveredGame (+20 more)

### Community 37 - "DWORD"
Cohesion: 0.17
Nodes (16): CloseHandle(), CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, CreateFileMappingW(), CreateThread(), DllMain(), map_named(), MapViewOfFile(), OpenFileMappingW() (+8 more)

### Community 38 - "Optimizer.tsx"
Cohesion: 0.08
Nodes (43): DarkOSOptimizerHint(), AlertTriangle, ChevronRight, DarkHubMark, FileSearch, Flame, FolderCheck, Gamepad2 (+35 more)

### Community 39 - "compilerOptions"
Cohesion: 0.10
Nodes (20): compilerOptions, allowImportingTsExtensions, baseUrl, ignoreDeprecations, isolatedModules, jsx, lib, module (+12 more)

### Community 40 - "psQuote"
Cohesion: 0.20
Nodes (10): buildDnsQuery(), clampInt(), DNS_PRESETS, DnsEngine, dnsLatencyUdp(), isUsableDnsServer(), isValidDnsAnswer(), isValidIpv4() (+2 more)

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
Cohesion: 0.18
Nodes (20): APP_VERSION, APP_VERSION_LABEL, Activity, CheckCircle2, ChevronDown, Crosshair, DownloadCloud, FileCode (+12 more)

### Community 49 - "SetupHub.tsx"
Cohesion: 0.14
Nodes (26): CheckCheck, CheckSquare, Download, Eraser, ExternalLink, MousePointerClick, Package, Pause (+18 more)

### Community 50 - "configManager.js"
Cohesion: 0.39
Nodes (8): CONFIG_PATH, getDefaultConfig(), loadConfig(), mergeDefaultConfig(), saveConfig(), shouldMigrateVerifyUrl(), loadRuntimeConfig(), normalizeWebhookUrl()

### Community 51 - "ScanModel"
Cohesion: 0.06
Nodes (30): registerDiskScanIPC(), csvCell(), DiskScanService, formatSize(), AGE_UNITS, ATTR_BITS, classOf(), EXT_CLASS (+22 more)

### Community 53 - "icons/index.tsx"
Cohesion: 0.05
Nodes (65): crypto-js, diff, AppWindow, ArrowRightLeft, Base(), Brackets, Bug, Calculator (+57 more)

### Community 54 - "scripts"
Cohesion: 0.09
Nodes (22): scripts, build, build:native, build:pacer, build:portable, build:renderer, build:setup-inno, build:setup-nsis (+14 more)

### Community 57 - "c_void"
Cohesion: 0.26
Nodes (10): com_release(), CreateWaitableTimerExW(), CreateWindowExA(), DestroyWindow(), GetProcAddress(), init_thread(), install_vtable_hooks(), LoadLibraryA() (+2 more)

### Community 58 - "SystemOptimizerService"
Cohesion: 0.12
Nodes (8): [0.4.8] - 2026-10-10, Added, Changed, Fixed, Notes, adaptResult(), SystemOptimizerService, op

### Community 59 - "[0.6.0] - 2026-10-21"
Cohesion: 0.20
Nodes (10): [0.6.0] - 2026-10-21, Added, Changed, Design, Developer, Fixed (monitoring), Fixed (Post-Install Hub), Fixed (shell) (+2 more)

### Community 60 - "ref_node_path"
Cohesion: 0.10
Nodes (10): here, SENSOR_DAEMON_EXE, TAG_COLORS, __dirname, __filename, __dirname, __filename, launch() (+2 more)

### Community 63 - "dependencies"
Cohesion: 0.18
Nodes (11): dependencies, diff, electron-log, electron-updater, exifr, exiftool-vendored, ffmpeg-static, pdf-parse (+3 more)

### Community 64 - "Changelog"
Cohesion: 0.17
Nodes (11): [0.1.0] - 2026-07-01, [0.4.0] - 2026-08-15, [0.4.6] - 2026-09-02, [0.4.7] - 2026-09-09, Added, Added, Added, Changelog (+3 more)

### Community 67 - "SystemEngine.js"
Cohesion: 0.13
Nodes (10): DefenderControlEngine, ElevationHelper, execAsync, waitForElevated(), MemoryEngine, isValidCapabilityName(), parseMarkedOutput(), validatePagefileSizes() (+2 more)

### Community 68 - "perform_pacing"
Cohesion: 0.36
Nodes (7): get_qpc_ms(), hooked_present(), hooked_present1(), is_main_swapchain(), perform_pacing(), precision_wait(), QueryPerformanceCounter()

### Community 69 - "compute_stats"
Cohesion: 0.32
Nodes (8): compute_stats(), CUR_STATS, low01_unavailable_with_few_samples(), push_sample(), reset(), Stats, stats_come_only_from_real_samples(), .ZERO

### Community 70 - "machineMarker.js"
Cohesion: 0.42
Nodes (10): _0x3c4d, ensureMachineMarker(), execFileAsync, _getH(), _mk(), _readMarker(), _regR(), _regW() (+2 more)

### Community 71 - "createMainWindow"
Cohesion: 0.24
Nodes (12): createMainWindow(), ensureTray(), getAllowedExternalUrl(), getAppIconPath(), handleEmbeddedExternalNavigation(), hideWindowToBackground(), isAllowedExternalProtocol(), isDev() (+4 more)

### Community 73 - "vite.config.js"
Cohesion: 0.29
Nodes (5): @tailwindcss/vite, vite, @vitejs/plugin-react, pkg, strictProductionCsp

### Community 74 - "persistVaultData"
Cohesion: 0.21
Nodes (12): clearVaultAutoLock(), ensureUnlocked(), loadVaultUsingWrapper(), lockVault(), persistVaultData(), readVaultFile(), scheduleVaultAutoLock(), setVaultAutoLockMinutes() (+4 more)

### Community 76 - "setup_shared_memory"
Cohesion: 0.40
Nodes (5): GetCurrentProcessId(), hist_recent(), publish(), QueryPerformanceFrequency(), setup_shared_memory()

### Community 77 - "FramePacerOverlay.js"
Cohesion: 0.29
Nodes (7): closeFramePacerOverlay(), createFramePacerOverlay(), getOverlayStatus(), overlayConfig, setOverlayClickThrough(), setOverlayConfig(), toggleFramePacerOverlay()

### Community 78 - "bug_report.md"
Cohesion: 0.50
Nodes (3): Description of Bug, Steps to Reproduce, System Information

### Community 79 - "DXGI_SWAP_CHAIN_DESC"
Cohesion: 0.50
Nodes (4): DXGI_MODE_DESC, DXGI_RATIONAL, DXGI_SAMPLE_DESC, DXGI_SWAP_CHAIN_DESC

### Community 83 - "repository"
Cohesion: 0.67
Nodes (3): repository, type, url

### Community 96 - "ElevationHelper.js"
Cohesion: 0.12
Nodes (14): registerDarkOSIPC(), buildImageDefenderRestoreScript(), IMAGE_DEFENDER_DEFAULTS, POLICY_CHANGES, decodeShellOutput(), summarizeMemoryDelta(), WS_SKIP, buildAdvancedNetworkChanges() (+6 more)

### Community 98 - "[0.4.5] - 2026-09-01"
Cohesion: 0.50
Nodes (4): [0.4.5] - 2026-09-01, Added, Changed, Fixed

### Community 99 - "Features"
Cohesion: 0.40
Nodes (5): Features, Gaming and latency, Hardware, Security and tools, Windows maintenance

### Community 100 - "overlay.js"
Cohesion: 0.11
Nodes (7): gamingBooster, cpuLoadTracker, createGamingOverlay(), getRealLatency(), toggleGamingOverlay(), CpuLoadTracker, ManagedProcessRegistry

### Community 101 - "DetailedHardwareInfo.tsx"
Cohesion: 0.24
Nodes (10): DetailedHardwareInfo(), gb(), HardwareInfo, Metric(), MetricGrid(), tempEntries(), CachedJunk, loadCached() (+2 more)

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
Nodes (23): devHistory, devStartPage, history, listeners, NOISY, preview(), mainWindow(), root (+15 more)

### Community 106 - "HwSensorsDaemon.js"
Cohesion: 0.20
Nodes (10): runMutations(), sleep(), forgetPawnIoCheck(), here, HWSENSORS_EXE, isPawnIoInstalled(), pawnCache, registerHwSensorsIPC() (+2 more)

### Community 107 - "darkosData.ts"
Cohesion: 0.06
Nodes (38): CameraState, crypto-js, DarkHubAPI, DevTraceEntry, DiskMapDrive, DiskMapInfo, DiskMapNode, DiskMapStatus (+30 more)

### Community 108 - "feature_request.md"
Cohesion: 0.50
Nodes (3): Alternatives, Proposed solution, What problem does it solve?

### Community 109 - "useRecentActivity.ts"
Cohesion: 0.39
Nodes (7): ActivityEntry, ActivityType, formatDuration(), loadPersisted(), makeId(), persist(), useRecentActivity()

### Community 110 - "Security policy"
Cohesion: 0.50
Nodes (4): Reporting a vulnerability, Scope, Security policy, Supported versions

### Community 111 - "walk"
Cohesion: 0.67
Nodes (3): scanDirectoryForBestExe(), walk(), scoreExecutable()

### Community 112 - "hwSensors.test.ts"
Cohesion: 0.43
Nodes (4): buildTree(), find(), RING0_CPU_TYPES, summarizeLhm()

### Community 115 - "useDeepHardware.ts"
Cohesion: 0.50
Nodes (4): ALIASES, DeepCategoryApi, getDeepCategoryApi(), useDeepHardware()

### Community 116 - "TRANSLATIONS.md"
Cohesion: 0.40
Nodes (4): Adding or Editing Translations, Method 1: In-App Testing, Method 2: Submitting via Pull Request, Translation Guide (i18n)

### Community 117 - "[0.5.0] - 2026-10-12"
Cohesion: 0.50
Nodes (4): [0.5.0] - 2026-10-12, Added, Changed, Removed

### Community 118 - "vitest"
Cohesion: 0.14
Nodes (7): vitest, darkosMessages, availableLanguages, LanguageOption, messages, SupportedLang, modulePath

### Community 121 - "README.md"
Cohesion: 0.15
Nodes (10): Third-party components (DarkHub.HwSensors), Architecture, Building from source, Contributing, How it stays safe, Install, License, JSON Rule Schema (+2 more)

## Knowledge Gaps
- **15 isolated node(s):** `darkhub_pacer_hook`, `@testing-library/jest-dom`, `@testing-library/react`, `@types/diff`, `@types/react` (+10 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 622 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **35 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Changelog` connect `Changelog` to `[0.4.5] - 2026-09-01`, `[0.6.0] - 2026-10-21`, `SystemOptimizerService`, `[0.5.0] - 2026-10-12`?**
  _High betweenness centrality (0.178) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `runPowerShell()` (e.g. with `main.js` and `PowerShellRunner.js`) actually correct?**
  _`runPowerShell()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `darkhub_pacer_hook`, `@testing-library/jest-dom`, `@testing-library/react` to the rest of the system?**
  _15 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DarkOS.Recovery.psm1` be split into smaller, more focused modules?**
  _Cohesion score 0.06600877192982456 - nodes in this community are weakly interconnected._
- **Why does `[0.4.8] - 2026-10-10` connect `SystemOptimizerService` to `Changelog`?**
  _High betweenness centrality (0.173) - this node is a cross-community bridge._
- **Should `main.js` be split into smaller, more focused modules?**
  _Cohesion score 0.0445468509984639 - nodes in this community are weakly interconnected._
- **Why does `react` connect `Dashboard.tsx` to `react`, `DetailedHardwareInfo.tsx`, `Optimizer.tsx`, `DarkOSCenter.tsx`, `App.tsx`, `PageHeader`, `useRecentActivity.ts`, `Settings.tsx`, `SetupHub.tsx`, `useDeepHardware.ts`, `ScanModel`, `icons/index.tsx`, `webview.d.ts`, `AdvancedSecurity.tsx`, `package.json`?**
  _High betweenness centrality (0.142) - this node is a cross-community bridge._