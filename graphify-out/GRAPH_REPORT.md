# Graph Report - DarkHub Suite  (2026-10-26)

## Corpus Check
- 383 files · ~473,578 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 13 file(s) not represented in the graph (top: (none) 5, .css 3, .example 1)

## Summary
- 4112 nodes · 11341 edges · 184 communities (135 shown, 49 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 196 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b185899f`
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
- OptimizerUtils.js
- icons/index.tsx
- DarkHubLatencyEngine
- useI18n
- AdvancedProtectionService.js
- X
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
- LatencyCollector
- PageHeader
- SetupHub.tsx
- DWORD
- MetaDataEditor.tsx
- compilerOptions
- psQuote
- DarkHub.LatencyEngine.cs
- DiskScan
- nativeLatencyClient
- .start
- ref_node_crypto
- PowerShellToolsService.js
- DeepHardwareService
- KakuganClient
- AlertTriangle
- configManager.js
- ScanModel
- LoggerService
- feedParsers.js
- scripts
- latencyGuardian.js
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
- react
- UpdateService
- SecurityService
- vite.config.js
- OverlayService
- Dlss5Service
- setup_shared_memory
- Decryption.tsx
- bug_report.md
- DXGI_SWAP_CHAIN_DESC
- security_rule.md
- translation.md
- Description of Changes
- OptiScalerManager.tsx
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
- Loader2
- DetailedHardwareInfo.tsx
- .runElevatedPowerShell
- DarkHub "Frost" design system
- DarkHub Suite: instruções para o Claude
- devSelfTest.js
- VaultBridgeServer
- global.d.ts
- feature_request.md
- DeepTweaksEngine
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
- dev.mjs
- nativeHost.js
- AdvancedProtectionService
- ClamAv
- runCommand
- diskCategories.ts
- benchWorker.js
- psToolBuilders.js
- SecureDownload.js
- driverInstall.test.ts
- WindowsToolsEngine
- background.js
- registerRealtimeIPC
- bridgeServer.js
- MemoryEngine.js
- webview.d.ts
- Settings.tsx
- ooxmlZip.js
- manifest.json
- createMetadataService
- MetadataService.js
- PowerEngine
- vaultBridge.test.ts
- fileProbe.js
- domainMatch.js
- metaxTypes.ts
- metadataIpc.js
- buildInstallScript
- PairingStore
- content.js
- VaultBridgeHost
- CodeRunner.js
- read
- nsis
- metadataEditor.test.ts
- popup.js
- DevTools.tsx
- ToolboxEngine.js
- DarkHub Vault browser extension
- CpuCollector.js
- ytdlpOptions.js
- [Unreleased]
- vaultTransfer.js
- manifestIndexer.js
- repository
- benchmarkMessages.ts
- [0.4.0] - 2026-08-15
- [0.7.0] - 2026-10-23
- RateLimiter
- decryptMessages.ts
- optimizerUiMessages.ts
- psToolsMessages.ts
- [Unreleased]
- realtimeMessages.ts
- restoreMessages.ts
- ensureElevated.js
- saveBackupMessages.ts
- securityMessages.ts
- vaultMessages.ts

## God Nodes (most connected - your core abstractions)
1. `useI18n()` - 153 edges
2. `Loader2` - 106 edges
3. `react` - 97 edges
4. `PageHeader()` - 77 edges
5. `RefreshCw` - 73 edges
6. `AlertTriangle` - 70 edges
7. `psQuote()` - 69 edges
8. `runPowerShell()` - 67 edges
9. `DarkHubLatencyEngine` - 50 edges
10. `App()` - 48 edges

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

## Communities (184 total, 49 thin omitted)

### Community 0 - "DarkOS.Recovery.psm1"
Cohesion: 0.07
Nodes (92): Write-DhFail(), Write-DhLine(), Add-DkHistory(), Add-DkResults(), ConvertTo-DkHashtable(), ConvertTo-DkSignedDword(), ConvertTo-DkUInt32(), Enter-DkDefaultUser() (+84 more)

### Community 1 - "main.js"
Cohesion: 0.04
Nodes (74): registerWinToolsIPC(), appConfig, assertFileAccessGranted(), assertFileAccessGrantedMany(), assertOutputDirGranted(), autoclickerConfigPath(), canSendDiscord(), clearVaultAutoLock() (+66 more)

### Community 2 - "DownloadManager"
Cohesion: 0.08
Nodes (23): downloadsService, AbortedError, DEFAULT_SETTINGS, DownloadManager, hashFile(), request(), sleep(), autoConnections() (+15 more)

### Community 3 - "messages.ts"
Cohesion: 0.09
Nodes (17): darkosMessages, devToolsMessages, diskMapMessages, driverMessages, kakuganMessages, maintenanceMessages, availableLanguages, LanguageOption (+9 more)

### Community 4 - "optiscalerManager.js"
Cohesion: 0.10
Nodes (51): applyIniPatch(), applyOptiScaler(), backupPathIfExists(), buildAnalysis(), buildIniPatch(), chooseInputApi(), chooseLoader(), classifyAmdArchitecture() (+43 more)

### Community 5 - "Dashboard.tsx"
Cohesion: 0.07
Nodes (51): react, Clock, Filter, LayoutTemplate, MemoryStick, PlaySquare, Server, Shield (+43 more)

### Community 6 - "DarkOSCenter.tsx"
Cohesion: 0.09
Nodes (35): api(), Banner, ConfirmState, Empty(), Figure(), Section(), STATUS_TONE, TabId (+27 more)

### Community 7 - "App.tsx"
Cohesion: 0.06
Nodes (47): AdvancedSecurity, App(), AutoClicker, Benchmark, DarkOSCenter, Dashboard, Decryption, DevTools (+39 more)

### Community 8 - "DriverCenterService.js"
Cohesion: 0.10
Nodes (22): boardPartnerFromPnpId(), cameraIssues(), classifyVendor(), DARKOS_CAMERA_ITEMS, DriverCenterService, isGenericDisplayDriver(), isOfficialDriverUrl(), normalizeAdapter() (+14 more)

### Community 9 - "DarkOSRecoveryService"
Cohesion: 0.07
Nodes (23): CLI_FILE, COMMANDS, DARKOS_ROOT, DarkOSRecoveryService, defaultBundledDir(), defaultIsElevated(), defaultRunner(), extractChangeResults() (+15 more)

### Community 10 - "AppManagerEngine.js"
Cohesion: 0.09
Nodes (13): AppManagerEngine, BLOATWARE_LIST, toArray(), buildStartupApprovedBytes(), bytesToHex(), isProtectedAppx(), isProtectedService(), isSafeInstallLocationFor() (+5 more)

### Community 11 - "lib.rs"
Cohesion: 0.06
Nodes (31): BUSY, CONFIG_PTR, FRAME_COUNT, HIST, HIST_CAP, HIST_HEAD, HIST_LEN, HOOK_INSTALLED (+23 more)

### Community 12 - "useI18n"
Cohesion: 0.15
Nodes (24): DarkHubMark, Gamepad2, Plus, Settings, GameCard(), GameCardProps, DiscoveredGame, GameDiscoveryModal() (+16 more)

### Community 13 - "SystemEngine"
Cohesion: 0.10
Nodes (9): NetworkEngine, bcdValueToArg(), isValidPciInstanceId(), isValidServiceName(), parseDhSnapLines(), MANAGED_SERVICES, scArgFromStartMode(), ServicesEngine (+1 more)

### Community 14 - "OptimizerUtils.js"
Cohesion: 0.06
Nodes (56): buildInternalGroups(), buildPublicTweaks(), defineTweak(), LIVE_ACTIONS, snapshotNumber(), buildCommandBlock(), buildRegistryReadScript(), buildRegistryScript() (+48 more)

### Community 15 - "icons/index.tsx"
Cohesion: 0.04
Nodes (99): HelpSection, HelpTip(), HelpTipProps, AlertCircle, AppWindow, ArrowRight, Base(), Bug (+91 more)

### Community 16 - "DarkHubLatencyEngine"
Cohesion: 0.09
Nodes (3): DarkHubLatencyEngine, IP_OPTION_INFORMATION, PROCESS_POWER_THROTTLING_STATE

### Community 17 - "useI18n"
Cohesion: 0.06
Nodes (63): DarkOSOptimizerHint(), DarkOSProgress(), DarkOSSystemPanel(), fmtUptime(), LiveStats, Metric(), Row(), UpdState (+55 more)

### Community 18 - "AdvancedProtectionService.js"
Cohesion: 0.17
Nodes (13): HOSTS_PATH, readCapped(), buildFirewallRemoveScript(), buildFirewallStatusScript(), buildHostsWriteScript(), FIREWALL_GROUP, HOSTS_WARN_ENTRIES, looksLikeHtml() (+5 more)

### Community 19 - "X"
Cohesion: 0.15
Nodes (25): ExternalLink, FileArchive, FileImage, Film, ScreenRegion, X, AccountRow(), api() (+17 more)

### Community 21 - "WindowsToolsEngine.js"
Cohesion: 0.27
Nodes (8): ACTIONS, featureById(), featureReadScript(), NOT_WINDOWS, PANELS, parseFeatureLines(), summarizeFeatureState(), WINDOWS_FEATURES

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
Cohesion: 0.13
Nodes (17): registerSaveBackupIPC(), appEvents, INDEXER, run(), safeName(), SaveBackupService, sha256File(), templatePrefix() (+9 more)

### Community 27 - "package.json"
Cohesion: 0.06
Nodes (32): getOcrWorker(), getSharp(), author, description, license, main, name, private (+24 more)

### Community 28 - "DlssUpdater.js"
Cohesion: 0.12
Nodes (18): registerUpscaleIPC(), Autopilot, findExe(), DLSS_FILES, DlssUpdater, HOSTS, RAW(), safe() (+10 more)

### Community 30 - "vaultCrypto.js"
Cohesion: 0.13
Nodes (32): _0x3c4d, ensureMachineMarker(), execFileAsync, _getH(), _mk(), _readMarker(), _regR(), _regW() (+24 more)

### Community 31 - "IntPtr"
Cohesion: 0.16
Nodes (5): ICMP_ECHO_REPLY, CoreTempData, DarkHubSensorDaemon, DXGI_ADAPTER_DESC1, PDH_FMT_COUNTERVALUE

### Community 32 - "susuya.test.ts"
Cohesion: 0.12
Nodes (28): normalizeShareConfig(), readJson(), registerShareIPC(), capture(), upload(), TTLS, writeJson(), makeRegionPicker() (+20 more)

### Community 33 - "devDependencies"
Cohesion: 0.09
Nodes (22): devDependencies, concurrently, crypto-js, electron, electron-builder, @fontsource-variable/geist, @fontsource-variable/geist-mono, jsdom (+14 more)

### Community 35 - "PageHeader"
Cohesion: 0.08
Nodes (41): currentPageRef, Entry, Crosshair, Eye, EyeOff, FolderOpen, Info, MousePointer (+33 more)

### Community 36 - "SetupHub.tsx"
Cohesion: 0.08
Nodes (42): DarkOSReleaseCard(), gb(), newer(), api(), fill(), FINAL, ItemState, mb() (+34 more)

### Community 37 - "DWORD"
Cohesion: 0.17
Nodes (16): CloseHandle(), CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, CreateFileMappingW(), CreateThread(), DllMain(), map_named(), MapViewOfFile(), OpenFileMappingW() (+8 more)

### Community 38 - "MetaDataEditor.tsx"
Cohesion: 0.16
Nodes (20): Layers, Save, Search, fromLocalInput(), MetaxFilePanel(), pad(), toLocalInput(), ZONES (+12 more)

### Community 39 - "compilerOptions"
Cohesion: 0.10
Nodes (20): compilerOptions, allowImportingTsExtensions, baseUrl, ignoreDeprecations, isolatedModules, jsx, lib, module (+12 more)

### Community 40 - "psQuote"
Cohesion: 0.20
Nodes (10): buildDnsQuery(), clampInt(), DNS_PRESETS, DnsEngine, dnsLatencyUdp(), isUsableDnsServer(), isValidDnsAnswer(), isValidIpv4() (+2 more)

### Community 42 - "DiskScan"
Cohesion: 0.16
Nodes (4): DiskScan, Job, WIN32_FIND_DATA, HwSensors

### Community 44 - ".start"
Cohesion: 0.12
Nodes (4): FastSensorDaemon, HwSensorsDaemon, SensorBus, SlowSensorDaemon

### Community 45 - "ref_node_crypto"
Cohesion: 0.16
Nodes (11): Quarantine, transcode(), xorStream(), __dirname, downloadTextWithRedirects(), downloadWithRedirects(), ensureYtDlp(), fetchExpectedChecksum() (+3 more)

### Community 46 - "PowerShellToolsService.js"
Cohesion: 0.20
Nodes (12): parseJsonOutput(), DARKOS_ROOT, effectivePolicy(), isPs1(), isStartFolder(), isUnderDarkOS(), normalizeScopes(), normalizeSignature() (+4 more)

### Community 48 - "KakuganClient"
Cohesion: 0.11
Nodes (15): makeTokenStore(), registerKakuganIPC(), SITE_PAGES, DARKOS_SITE, fetchLatestRelease(), isNewerBuild(), parseReleasePage(), parseSha256File() (+7 more)

### Community 49 - "AlertTriangle"
Cohesion: 0.15
Nodes (33): AlertTriangle, Radio, RotateCcw, ShieldCheck, Users, BlocklistsPanel(), FeedSource, KINDS (+25 more)

### Community 50 - "configManager.js"
Cohesion: 0.39
Nodes (8): CONFIG_PATH, getDefaultConfig(), loadConfig(), mergeDefaultConfig(), saveConfig(), shouldMigrateVerifyUrl(), loadRuntimeConfig(), normalizeWebhookUrl()

### Community 51 - "ScanModel"
Cohesion: 0.06
Nodes (30): registerDiskScanIPC(), csvCell(), DiskScanService, formatSize(), AGE_UNITS, ATTR_BITS, classOf(), EXT_CLASS (+22 more)

### Community 53 - "feedParsers.js"
Cohesion: 0.12
Nodes (31): buildFirewallApplyScript(), buildIpMatcher(), chunk(), detectEol(), eachDataLine(), extractUpstreamDate(), FIREWALL_CHUNK, FIREWALL_MAX_ADDRESSES (+23 more)

### Community 54 - "scripts"
Cohesion: 0.09
Nodes (22): scripts, build, build:native, build:pacer, build:portable, build:renderer, build:setup-inno, build:setup-nsis (+14 more)

### Community 55 - "latencyGuardian.js"
Cohesion: 0.08
Nodes (16): gamingBooster, encodedPowerShellArgs(), isSafePingHost(), startTimerResolution05ms(), stablePolicyName(), getClickEnginePath(), startAutoClicker(), runPowerShellJson() (+8 more)

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
Nodes (34): registerRestoreIPC(), registerStartupIPC(), registerUsbIPC(), getSecurityScoreV2(), WU_UNLOCK_FUNCS, runPowerShellJson(), COMPONENTS, componentStatus() (+26 more)

### Community 63 - "dependencies"
Cohesion: 0.14
Nodes (14): dependencies, diff, electron-log, electron-updater, exifr, exiftool-vendored, ffmpeg-static, js-yaml (+6 more)

### Community 64 - "Changelog"
Cohesion: 0.12
Nodes (16): [0.1.0] - 2026-07-01, [0.4.5] - 2026-09-01, [0.4.6] - 2026-09-02, [0.4.7] - 2026-09-09, [0.5.0] - 2026-10-12, Added, Added, Added (+8 more)

### Community 65 - "libraryStore.js"
Cohesion: 0.20
Nodes (22): backupFilePath(), filePath(), loadLibrary(), newId(), newProfileId(), removeGame(), removeGameUnsafe(), sanitizeGame() (+14 more)

### Community 66 - "ref_node_path"
Cohesion: 0.06
Nodes (35): here, SENSOR_DAEMON_EXE, forgetPawnIoCheck(), here, HWSENSORS_EXE, isPawnIoInstalled(), pawnCache, bootAdvancedSensors() (+27 more)

### Community 67 - "registerLatencyGuardian"
Cohesion: 0.11
Nodes (48): clampInt(), now(), psSingleQuote(), registerLatencyGuardian(), applyDnsCloudflareWithUndo(), findGameProcess(), getProcessSnapshot(), killBackgroundProcesses() (+40 more)

### Community 68 - "perform_pacing"
Cohesion: 0.36
Nodes (7): get_qpc_ms(), hooked_present(), hooked_present1(), is_main_swapchain(), perform_pacing(), precision_wait(), QueryPerformanceCounter()

### Community 69 - "compute_stats"
Cohesion: 0.32
Nodes (8): compute_stats(), CUR_STATS, low01_unavailable_with_few_samples(), push_sample(), reset(), Stats, stats_come_only_from_real_samples(), .ZERO

### Community 70 - "react"
Cohesion: 0.09
Nodes (43): DarkOSConfirmDialog(), DarkOSConfirmDialogProps, ChevronUp, Code, FileCode, Lock, ShieldAlert, api() (+35 more)

### Community 73 - "vite.config.js"
Cohesion: 0.29
Nodes (5): @tailwindcss/vite, vite, @vitejs/plugin-react, pkg, strictProductionCsp

### Community 74 - "OverlayService"
Cohesion: 0.06
Nodes (28): registerOverlayIPC(), createCsvParser(), FrameWindow, pct(), SessionStats, splitCsv(), avg(), index() (+20 more)

### Community 75 - "Dlss5Service"
Cohesion: 0.15
Nodes (5): Dlss5Service, execAsync, execFileAsync, inspectPeExecutable(), registerDlss5IPC()

### Community 76 - "setup_shared_memory"
Cohesion: 0.40
Nodes (5): GetCurrentProcessId(), hist_recent(), publish(), QueryPerformanceFrequency(), setup_shared_memory()

### Community 77 - "Decryption.tsx"
Cohesion: 0.11
Nodes (38): ArrowRightLeft, Key, Link, atbash(), base32Decode(), base32Encode(), base58Decode(), base58Encode() (+30 more)

### Community 78 - "bug_report.md"
Cohesion: 0.50
Nodes (3): Description of Bug, Steps to Reproduce, System Information

### Community 79 - "DXGI_SWAP_CHAIN_DESC"
Cohesion: 0.50
Nodes (4): DXGI_MODE_DESC, DXGI_RATIONAL, DXGI_SAMPLE_DESC, DXGI_SWAP_CHAIN_DESC

### Community 83 - "OptiScalerManager.tsx"
Cohesion: 0.16
Nodes (18): Eraser, PauseCircle, PlayCircle, Rocket, Settings2, Bytes(), Downloads(), formatBytes() (+10 more)

### Community 96 - "BaseCollector"
Cohesion: 0.16
Nodes (12): BaseCollector, DEFAULT_STALE_MS, DiskCollector, NetworkCollector, QUERY_FIELDS, RamCollector, StorageCollector, classifyTemperature() (+4 more)

### Community 97 - "textTools.ts"
Cohesion: 0.09
Nodes (38): ALIASES, base64Decode(), base64Encode(), charsetSize(), decodeJwt(), decodeText(), DOWS, EncodeKind (+30 more)

### Community 98 - "TempsCollector"
Cohesion: 0.25
Nodes (5): buildTree(), find(), RING0_CPU_TYPES, summarizeLhm(), TempsCollector

### Community 99 - "Features"
Cohesion: 0.29
Nodes (7): Features, Gaming and latency, Hardware, Real-time (off by default), Security and tools, Sharing, Windows maintenance

### Community 100 - "Loader2"
Cohesion: 0.11
Nodes (40): GuardianWidget(), Activity, Fan, Gauge, Globe, Loader2, MousePointerClick, Network (+32 more)

### Community 101 - "DetailedHardwareInfo.tsx"
Cohesion: 0.14
Nodes (17): DetailedHardwareInfo(), gb(), HardwareInfo, Metric(), MetricGrid(), tempEntries(), CachedJunk, loadCached() (+9 more)

### Community 102 - ".runElevatedPowerShell"
Cohesion: 0.23
Nodes (4): DefenderControlEngine, ElevationHelper, execAsync, waitForElevated()

### Community 103 - "DarkHub "Frost" design system"
Cohesion: 0.33
Nodes (5): Component vocabulary (CSS classes in `src/style.css`, React in `src/components/ui`), DarkHub "Frost" design system, Do not change, Foundations (already global, do not re-declare), Rules (what makes it look designed, not generated)

### Community 104 - "DarkHub Suite: instruções para o Claude"
Cohesion: 0.40
Nodes (4): Antes de procurar código: use o mapa (não varra o projeto), DarkHub Suite: instruções para o Claude, Regras do projeto, Verificação

### Community 105 - "devSelfTest.js"
Cohesion: 0.07
Nodes (27): devHistory, devStartPage, history, listeners, NOISY, preview(), mainWindow(), root (+19 more)

### Community 106 - "VaultBridgeServer"
Cohesion: 0.30
Nodes (3): isLoopbackAddress(), VaultBridgeServer, encodeFrame()

### Community 107 - "global.d.ts"
Cohesion: 0.03
Nodes (69): BenchRun, CameraState, ClamAvStatus, crypto-js, DarkHubAPI, DevTraceEntry, DiskMapDrive, DiskMapInfo (+61 more)

### Community 108 - "feature_request.md"
Cohesion: 0.50
Nodes (3): Alternatives, Proposed solution, What problem does it solve?

### Community 109 - "DeepTweaksEngine"
Cohesion: 0.14
Nodes (5): DeepTweaksEngine, regEntryId(), snapshotEntryToOps(), validateChange(), VisualsEngine

### Community 110 - "Security policy"
Cohesion: 0.50
Nodes (4): Reporting a vulnerability, Scope, Security policy, Supported versions

### Community 111 - "NetLatencyService.js"
Cohesion: 0.11
Nodes (32): RFC-3550, assertSafeHost(), registerNetworkIPC(), runCmd(), ADAPTER_NAME_RE, ADAPTER_TWEAKS, asArray(), assertSafeHost() (+24 more)

### Community 112 - "UnitConverter.tsx"
Cohesion: 0.13
Nodes (32): ArrowDownUp, EncodeTool(), JwtTool(), LoremTool(), CopyButton(), copyText(), Segmented(), selectCls (+24 more)

### Community 114 - "devtools.test.ts"
Cohesion: 0.16
Nodes (33): clamp(), CMYK, cmykToRgb(), contrastRatio(), flatten(), formatCmyk(), formatHsl(), formatHsv() (+25 more)

### Community 115 - "MaintenanceService"
Cohesion: 0.15
Nodes (9): registerMaintenanceIPC(), MaintenanceService, TASKS, winget(), isDue(), nextRun(), normalizeTask(), parseTime() (+1 more)

### Community 117 - "DriverInstallService"
Cohesion: 0.36
Nodes (4): registerDriverIPC(), DriverInstallService, driversDir(), wuBlockers()

### Community 119 - "driverPlan.js"
Cohesion: 0.11
Nodes (29): sha256File(), wuSearchScript(), AMD_DRIVERS_PAGE, buildPlan(), compareVersions(), devicesForUpdate(), DRIVER_ERROR_CODES, INTEL_PAGES (+21 more)

### Community 120 - "BenchmarkService"
Cohesion: 0.23
Nodes (9): registerBenchmarkIPC(), BenchmarkService, compare(), contextWarnings(), median(), METRICS, noise(), percentile() (+1 more)

### Community 121 - "README.md"
Cohesion: 0.15
Nodes (10): Third-party components (DarkHub.HwSensors), Architecture, Building from source, Contributing, How it stays safe, Install, License, JSON Rule Schema (+2 more)

### Community 122 - "dev.mjs"
Cohesion: 0.20
Nodes (12): argPage, args, c, killStaleDev(), killTree(), restartElectron(), root, say() (+4 more)

### Community 123 - "nativeHost.js"
Cohesion: 0.12
Nodes (18): BROWSER_LABELS, DIALOG_STRINGS, fill(), registerVaultBridgeIPC(), ALLOWED_CALLERS, BROWSERS, buildHostManifest(), bundledHostCandidates() (+10 more)

### Community 124 - "AdvancedProtectionService"
Cohesion: 0.17
Nodes (5): parseDhResults(), AdvancedProtectionService, readManagedBlockInfo(), defenderActive(), getHardeningItem()

### Community 125 - "ClamAv"
Cohesion: 0.23
Nodes (4): ClamAv, freshclamConf(), parseClamscan(), run()

### Community 126 - "runCommand"
Cohesion: 0.18
Nodes (10): setPowerPlanHighPerformance(), findLibreOfficeSoffice(), getFfmpegPath(), getYtDlpTools(), isStartupTaskEnabled(), measureLatency(), setStartupTask(), runCommand() (+2 more)

### Community 128 - "diskCategories.ts"
Cohesion: 0.08
Nodes (28): ANYWHERE_JUNK_DIRS, ARCHIVES, AUDIO, BASE, CATEGORIES, CATEGORY_COLOR, categoryFill(), classifyPath() (+20 more)

### Community 129 - "benchWorker.js"
Cohesion: 0.17
Nodes (14): cpuMulti(), cpuSingle(), disk4kSyncWrite(), diskSeqWrite(), file, memBandwidth(), memLatency(), now() (+6 more)

### Community 130 - "psToolBuilders.js"
Cohesion: 0.07
Nodes (37): RFC-4180, registerPowerShellIPC(), BUILDERS, buildHostsWriteScript(), buildPlan(), cell(), cleanConsoleLines(), columnsOf() (+29 more)

### Community 131 - "SecureDownload.js"
Cohesion: 0.19
Nodes (8): installGithubReleaseMsi(), CoverProviderService, httpsGet(), assertAllowedUrl(), downloadToFile(), fetchJson(), GITHUB_HOSTS, SYSTEM_TAR

### Community 132 - "driverInstall.test.ts"
Cohesion: 0.22
Nodes (5): wuErrorKind(), DISABLED, NIC_NO_DRIVER, NV_GPU_BASIC, PS2_GHOST

### Community 134 - "background.js"
Cohesion: 0.19
Nodes (29): authenticate(), badge(), browserName(), clearPendingSave(), connect(), disconnect(), fetchCredentials(), fromPopup() (+21 more)

### Community 135 - "registerRealtimeIPC"
Cohesion: 0.07
Nodes (20): registerRealtimeIPC(), isCriticalProcessName(), EICAR_SHA256, HashDb, clamp(), ConfigStore, defaults(), effectiveRules() (+12 more)

### Community 136 - "bridgeServer.js"
Cohesion: 0.17
Nodes (11): BROWSERS, callerFromArgs(), FrameDecoder, MAX_INBOUND_FRAME, MAX_OUTBOUND_FRAME, MESSAGE_TYPES, parseHostHello(), PROTOCOL_VERSION (+3 more)

### Community 137 - "MemoryEngine.js"
Cohesion: 0.24
Nodes (4): MemoryEngine, summarizeMemoryDelta(), WS_SKIP, formatBytes()

### Community 139 - "Settings.tsx"
Cohesion: 0.36
Nodes (9): APP_VERSION, APP_VERSION_LABEL, ResourceUsageSection(), SettingRow(), SettingsGroup(), SettingsPage(), Status, StatusLine() (+1 more)

### Community 140 - "ooxmlZip.js"
Cohesion: 0.16
Nodes (18): crc32(), CRC_TABLE, elementRe(), getXmlElement(), OOXML_FIELDS, readZipEntries(), reEsc(), rewriteZip() (+10 more)

### Community 141 - "manifest.json"
Cohesion: 0.10
Nodes (19): action, default_popup, default_title, background, scripts, service_worker, browser_specific_settings, gecko (+11 more)

### Community 142 - "createMetadataService"
Cohesion: 0.23
Nodes (17): assignArg(), needsFile(), readBinaryTag(), readTags(), runExiftool(), tmpName(), writeTagsTo(), createMetadataService() (+9 more)

### Community 143 - "MetadataService.js"
Cohesion: 0.11
Nodes (18): AUDIO_FF, COVER_TYPES, digits(), EXIF_IMAGE, FF_AUDIO, FF_VIDEO, HIDDEN_GROUPS, IMAGE_FIELDS (+10 more)

### Community 145 - "vaultBridge.test.ts"
Cohesion: 0.20
Nodes (11): buildClientProof(), buildServerProof(), hmacHex(), verifyClientProof(), CALLER_ARGS, FakeHost, makeServer(), mkTmp() (+3 more)

### Community 146 - "fileProbe.js"
Cohesion: 0.18
Nodes (16): ascii(), ATTR, detectType(), EXT_ALIASES, extMatches(), hexDump(), parseZoneIdentifier(), probeFile() (+8 more)

### Community 147 - "domainMatch.js"
Cohesion: 0.27
Nodes (15): defaultPort(), findMatchingEntries(), GENERIC_SECOND_LEVEL, isIpHost(), isIPv4(), isIPv6(), isLoopbackHost(), matchSite() (+7 more)

### Community 148 - "metaxTypes.ts"
Cohesion: 0.12
Nodes (15): Props, Props, MetaxBackend, MetaxCheck, MetaxDetect, MetaxField, MetaxFieldKind, MetaxFsInfo (+7 more)

### Community 149 - "metadataIpc.js"
Cohesion: 0.33
Nodes (4): registerMetadataIPC(), getExiftoolPath(), getExiftool(), exiftool-vendored

### Community 150 - "buildInstallScript"
Cohesion: 0.33
Nodes (6): buildInstallScript(), dhpFunc(), readWuOutput(), wuSearchElevatedScript(), isUpdateId(), normalizeWuUpdates()

### Community 151 - "PairingStore"
Cohesion: 0.27
Nodes (5): generatePairingCode(), MAX_CLIENTS, PairingStore, sha256Hex(), safeEqualHex()

### Community 152 - "content.js"
Cohesion: 0.35
Nodes (12): ensureUi(), fillCredentials(), hideUi(), loginFieldsFrom(), menuMessage(), onIconClick(), passwordFields(), positionUi() (+4 more)

### Community 154 - "CodeRunner.js"
Cohesion: 0.36
Nodes (9): registerCodeRunnerIPC(), cancelRun(), detected, detectRuntimes(), exec(), killTree(), runCode(), RUNTIMES (+1 more)

### Community 155 - "read"
Cohesion: 0.32
Nodes (14): asText(), coverKey(), buildGroups(), canonicalValues(), read(), verify(), gpsKeys(), isEmptyValue() (+6 more)

### Community 156 - "nsis"
Cohesion: 0.17
Nodes (12): nsis, allowToChangeInstallationDirectory, createDesktopShortcut, createStartMenuShortcut, differentialPackage, include, installerIcon, oneClick (+4 more)

### Community 157 - "metadataEditor.test.ts"
Cohesion: 0.15
Nodes (8): exifDate(), planFor(), exiftoolPath, ffmpegPath, haveFf, require, svc, svcNoFf

### Community 158 - "popup.js"
Cohesion: 0.33
Nodes (9): el(), refresh(), render(), root, send(), startPolling(), stopPolling(), STRINGS (+1 more)

### Community 159 - "DevTools.tsx"
Cohesion: 0.20
Nodes (9): Brackets, Calculator, FileDiff, Hash, Link2, Scale, Type, jsonMinify() (+1 more)

### Community 161 - "DarkHub Vault browser extension"
Cohesion: 0.25
Nodes (7): 1. Register the native host (in DarkHub), 2. Load the extension, 3. Pair, DarkHub Vault browser extension, Development, Security model, Using it

### Community 163 - "ytdlpOptions.js"
Cohesion: 0.53
Nodes (4): buildExtraArgs(), CONTAINERS, parseTime(), SPONSOR_CATEGORIES

### Community 165 - "[Unreleased]"
Cohesion: 0.40
Nodes (5): [0.7.1] - 2026-10-24, Added, Changed, Fixed, Removed

### Community 166 - "vaultTransfer.js"
Cohesion: 0.48
Nodes (5): MAGIC, makeCode(), openVault(), parseCode(), sealVault()

### Community 167 - "manifestIndexer.js"
Cohesion: 0.67
Nodes (3): buildIndex(), isWindows(), js-yaml

### Community 169 - "repository"
Cohesion: 0.67
Nodes (3): repository, type, url

### Community 171 - "[0.4.0] - 2026-08-15"
Cohesion: 0.67
Nodes (3): [0.4.0] - 2026-08-15, Added, Security

### Community 172 - "[0.7.0] - 2026-10-23"
Cohesion: 0.67
Nodes (3): [0.7.0] - 2026-10-23, Added, Fixed

### Community 177 - "[Unreleased]"
Cohesion: 0.67
Nodes (3): Added, Changed, [Unreleased]

### Community 180 - "ensureElevated.js"
Cohesion: 0.73
Nodes (4): buildRelaunchCommand(), ensureElevated(), quoteArg(), relaunchAsAdmin()

## Knowledge Gaps
- **18 isolated node(s):** `RFC-3550`, `RFC-4180`, `darkhub_pacer_hook`, `yaml`, `@testing-library/jest-dom` (+13 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1012 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **49 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Changelog` connect `Changelog` to `[Unreleased]`, `[0.4.0] - 2026-08-15`, `[0.7.0] - 2026-10-23`, `[Unreleased]`, `SystemOptimizerService`, `[0.6.0] - 2026-10-21`?**
  _High betweenness centrality (0.128) - this node is a cross-community bridge._
- **What connects `RFC-3550`, `RFC-4180`, `darkhub_pacer_hook` to the rest of the system?**
  _18 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DarkOS.Recovery.psm1` be split into smaller, more focused modules?**
  _Cohesion score 0.06600877192982456 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `ref_node_path` to `diskCategories.ts`, `DownloadManager`, `driverInstall.test.ts`, `optiscalerManager.js`, `DarkOSCenter.tsx`, `registerRealtimeIPC`, `vaultBridge.test.ts`, `AdvancedProtectionService.js`, `WindowsToolsEngine.js`, `CodeRunner.js`, `package.json`, `DlssUpdater.js`, `metadataEditor.test.ts`, `SaveBackupService`, `susuya.test.ts`, `ytdlpOptions.js`, `driverCenter.test.ts`, `vaultTransfer.js`, `powershellTools.test.ts`, `KakuganClient`, `ScanModel`, `ensureElevated.js`, `StartupService.js`, `libraryStore.js`, `react`, `OverlayService`, `Decryption.tsx`, `NetLatencyService.js`, `devtools.test.ts`, `MaintenanceService`, `BenchmarkService`?**
  _High betweenness centrality (0.123) - this node is a cross-community bridge._
- **Should `main.js` be split into smaller, more focused modules?**
  _Cohesion score 0.03575076608784474 - nodes in this community are weakly interconnected._
- **Why does `[0.4.6] - 2026-09-02` connect `Changelog` to `ClickEngine`?**
  _High betweenness centrality (0.112) - this node is a cross-community bridge._
- **Should `DownloadManager` be split into smaller, more focused modules?**
  _Cohesion score 0.07981220657276995 - nodes in this community are weakly interconnected._