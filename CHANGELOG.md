# Changelog

All notable changes to the DarkHub Suite project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-10-12

### Added
- **DarkOS Center** (management and recovery area for DarkOS):
  - New sidebar entry "DarkOS" with tabs: Overview (DarkOS version, Windows build, active profile,
    status counts, reboot-pending banner), Applied optimizations (grouped by category, status badge,
    per-item Undo/Reapply, reboot flag), Profiles (DarkOS Default / Competitive / Maximum Performance
    with a concise diff), Recovery (restore removed Appx packages, "restore everything to original"),
    Snapshots, Failures and Diagnostics export (.zip chosen in a native dialog).
  - Security-related changes require an explicit, never pre-checked confirmation with pt-BR trade-off text.
  - On a regular Windows the page shows an explanatory empty state; no operation can run without
    `C:\ProgramData\DarkOS\Recovery\manifest.json`.
- **DarkOSRecoveryService + `darkos:*` IPC**: all reads/changes go through the shared
  `DarkOS.Recovery.psm1` CLI (`DarkOS.Cli.ps1`), installed copy in `C:\ProgramData\DarkOS\bin` first,
  bundled copy (app.asar.unpacked) as fallback. Strict input validation, serialized queue, timeouts,
  live progress on `darkos:runEvent`; success is only reported when the module returns `verified: true`.
- System Optimizer shows a hint linking to the DarkOS area when running on DarkOS.
- `tests/darkosService.test.ts` (parsing, validation, queue, verified gating, UI data helpers).

### Changed
- Inter and JetBrains Mono are bundled locally via `@fontsource` (no Google Fonts request; works offline).
- Autostart remains opt-in (Settings); nothing is registered at install or first launch.

### Removed
- **Steam Lua / Depot Tools, Steam unlocker, and Goldberg Steam-emulator modules**: removed entirely from
  the application source, IPC surface, preload bridge, UI routes, type declarations, and packaging config.
  DarkOS does not ship DRM-circumvention or Steam-emulation functionality. Unrelated modules (OptiScaler,
  DLSS, and upscaling helpers) are unaffected.

## [0.4.8] - 2026-10-10

### Added
- **Frame Pacer Native Metrics (Real-Time Precision)**:
  - Replaced synthetic frame timing with actual Present() timings from DXGI hook via shared memory telemetry.
  - Rust cdylib `DarkHub_PacerHook.dll` with seqlock-protected 1040-byte telemetry ring buffer.
  - Real 1% low metric (mean of worst 1%) and conditional 0.1% low (≥1000 samples required).
  - Stutter detection (frame > 2× rolling median + >20ms) and stale telemetry safeguard (>1.5s timeout).
  - Unit tests for hook injection, seqlock readers, and ring buffer semantics (Linux stubs for Win32 APIs).
- **Downloads Manager (Active Downloads)**:
  - Full-featured HTTP downloader with manual URL input, automatic piece-chunking (Range probe, ≤96 pieces, 512 KB min).
  - Positional writes to `.dhpart` with persistent queue/settings (`userData/downloads/`).
  - Per-download and global token-bucket throttling, exponential backoff retries with SHA-256 verification.
  - Schedule window support (including midnight boundary), pause/resume, concurrent connection limit (user-configurable).
  - Dedicated Downloads tab in navigation and 13 comprehensive test cases.
- **Optimizer Audit & Corrections**:
  - Comprehensive audit of System Optimization page engines (`SystemOptimizerService` and 13 sub-engines).
  - Real registry/PowerShell operations verified and traced; no functions removed or hidden, all fixed to deliver promised results.
  - Audit report published to `docs/OPTIMIZER_AUDIT.md` with function-by-function verification matrix.
  - New `DnsEngine` with DNS over HTTPS (DoH) support and integrated DNS operations into main optimization flow.
- **Monitoring Optimizations**:
  - Polling pause when windows are hidden/minimized (single `visibleInterval` helper across 6 pages).
  - Unified HAL telemetry stream with persistent daemon (no duplicate hardware queries).
  - Resource Usage card in Settings showing DarkHub's own memory, CPU, and disk footprint.

### Fixed
- Fixed `lib.rs` telemetry struct alignment and seqlock writer state machine (odd sequence = writing).
- Fixed `FrameLimiter.cs` to read real frame metrics from hook instead of placeholder values.
- Resolved optimizer engines publishing fake improvements; all now execute real Win32/PowerShell operations.
- Fixed monitoring page polling overlap and resource waste (now pauses when hidden).

### Changed
- Migrated frame pacing metrics from synthetic math to hardware-backed Present timing collection.
- Refactored `DarkHub.FramePacer.ps1` removal (no longer needed; injection via C# FrameLimiter.exe).

### Notes
- Pre-existing test failure: `tests/dlss5Lifecycle.test.ts` requires `fsr4_rdna2/amd_fidelityfx_upscaler_dx12.dll` (not in repo).
- `SystemEngine.activateWindows` no longer downloads/executes a remote activation script; it now opens the official Windows activation settings page (`ms-settings:activation`) only (fixed in 0.5.0 / DarkOS iteration 2).
- Browser extension for downloads deferred to future release.

---

## [0.4.7] - 2026-09-09

### Added
- **OptiScaler Manager Complete Overhaul & Game Library Integration**:
  - Full automatic synchronization with Steam and DarkHub installed game libraries.
  - Permanent persistence for external games added via `.exe` file picker into DarkHub Library.
  - High-performance shallow file scanner and cached GPU telemetry, reducing tab latency from >2.5s to <15ms.
  - Integration of FSR 4.1.1b RDNA 2 INT8 mod (the3rdparty1917) with INT8 vector instructions, anti-ghosting matrix, and native HDR color space for Radeon RX 6000.
  - Intelligent loader collision prevention and Agility SDK conflict bypass preventing application launch crashes (`0xc0000142`) in modern D3D12 games.
- **Dedicated Backup & 1-Click Game Restoration System**:
  - Prominent, unmissable backup card directly on each selected game view displaying snapshot timestamps and preserved files.
  - 1-click clean reversion restoring original game files and removing all proxy loaders (`dxgi.dll`, `winmm.dll`, `version.dll`, `d3d12.dll`) and OptiScaler artifacts.
  - Support for manual snapshots and individual snapshot removal.
- **DLSS 5 & Universal Neural Upscaler (EXPERIMENTAL / BETA)**:
  - Added dedicated interface for next-generation neural upscaler research and universal frame generation.
  - **Explicit Experimental / Beta Classification**: DLSS 5 translation and universal neural upscaling pipelines are classified as experimental research modules. Features include real-time multi-vendor shader translation, dynamic telemetry inspection, and proxy driver interop, subject to active iteration.
- **Official Portable Distribution**:
  - Added standalone `DarkHub 0.4.7-portable.exe` build alongside the standard NSIS installer for zero-install, USB, and sandbox workflows.

### Fixed
- Fixed external game loss on reload by automatically persisting custom games into DarkHub Library store (`library.games.json`).
- Fixed game launch error (`0xc0000142`) caused by redundant `D3D12_Optiscaler` injection on games with native DirectX 12 Core.
- Resolved sequential PowerShell execution bottleneck during game library inspection.

---

## [0.4.6] - 2026-09-02

### Added
- **Steam Lua & Depot Tools Suite**:
  - Full-featured Steam `.lua` script manager, manifest installer, and depot key inspector.
  - Chromium Embedded Framework (CEF) store injection bridge with 1-click package downloader.
  - Spacewar (AppID 480) Online Fix integration for multiplayer support.
  - Depot version pin locking, auto-update switches, and live Steam client restart.
- **Software Uninstaller with Deep Leftovers Cleaner**:
  - Official silent and interactive uninstaller execution with elevated privileges.
  - Deep heuristic scanning and cleanup of residual files in `%APPDATA%`, `%LOCALAPPDATA%`, `%PROGRAMDATA%`, and Registry keys.
- **Universal Metadata & Exif Editor**:
  - Universal media format support across Images, Audio (`MP3, FLAC, WAV`), Video (`MP4, MKV, AVI`), and Documents (`PDF, DOCX`).
  - Lossless and non-destructive metadata stripping via embedded ExifTool without stream corruption.
- **Low-Level Native AutoClicker**:
  - High-precision C# engine utilizing Win32 `SendInput` and `mouse_event` fallback with 1ms timer resolution.
  - Global hotkeys (<kbd>F6</kbd>) functional in full-screen games and background windows.
- **Advanced Network Stack Tuning**:
  - Kernel TCP NoDelay, Receive Side Scaling (RSS 4 queues), MTU 1500, EEE disabling, and 100% QoS bandwidth unlocking.
- **Accurate CPU Thermal Telemetry**:
  - Core Temp shared memory mapping and calibrated DTS thermal curves for precise CPU package readings.
- **Full Internationalization (i18n)**:
  - 100% complete English (`en-US`) and Portuguese (`pt-BR`) translations across all new tools, tabs, uninstaller, network, and modal interfaces.

### Fixed
- Fixed main process startup syntax exception in `DeepTweaksEngine.js`.
- Resolved duplicate IPC handler registration for `optimizer:getInstalledPrograms`.
- Fixed OCR preview loading with base64 Data URLs and added clipboard paste (<kbd>Ctrl+V</kbd>) and drag-and-drop.
- Resolved TypeScript compiler type checks (`tsc --noEmit` passing with 0 errors).

---

## [0.4.5] - 2026-09-01

### Added
- Integrated yt-dlp and FFmpeg media processing pipeline with automatic binary management.
- Multi-format audio extraction support (MP3 320 kbps, AAC, WAV lossless, FLAC).
- High-resolution video stream extraction up to 4K/2K/1080p with automatic audio-video stream merging.
- Automatic metadata embedding, including ID3 tags and high-resolution album cover art.
- Full YouTube playlist extraction engine with indexed subfolder generation.
- Anti-bot mitigation with automated multi-client rotation (Android, iOS, Web) and optional browser cookie import.
- Complete English (en-US) and Portuguese (pt-BR) internationalization across all downloader components.
- Expanded universal file converter format matrix across images, audio, video, and documents.

### Fixed
- Fixed system RAM identification on the Home dashboard to accurately reflect physical memory capacity (32 GB).
- Resolved ESM module path resolution for unpacked FFmpeg binary location in production packages.
- Corrected missing i18n keys and eliminated untranslated strings across interface components.

### Changed
- Standardized codebase comments and cleaned development debug logging.
- Streamlined installation scripts and packaged portable launcher archives for fast initialization.

## [0.4.0] - 2026-08-15

### Added
- DarkPacer hardware frame limiter with high-precision QPC spin loop implementation.
- Real-time frametime oscilloscope DirectX overlay with 1% and 0.1% low metrics.
- OptiScaler upscaling configuration and DLL deployment bridge.
- Endpoint defensive security suite: DNS sinkhole, URL heuristic scanner, and active port auditor.
- Offline tools suite: Optical character recognition (Tesseract), EXIF metadata scrubber, and encrypted password vault.

### Security
- Implemented AES-256-GCM authenticated encryption with PBKDF2 key derivation for the local password vault.
- Enforced strict origin and IPC path sanitization across all renderer communications.

## [0.1.0] - 2026-07-01

### Added
- Initial project architecture and Electron + React + Vite foundation.
- Core Windows system optimization engines (Win32PrioritySeparation, DisablePagingExecutive, MSI mode).
- Hardware Abstraction Layer (HAL) for real-time CPU, GPU, RAM, and sensor monitoring.
