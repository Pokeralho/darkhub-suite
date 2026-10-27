# Changelog

All notable changes to the DarkHub Suite project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.7.3] - 2026-10-27

### Added
- DarkHub packages (modules and presets), phase 0 of the open Hub: JSON files that describe Windows changes as data
  (built-in tweaks by id, registry values, service start types, scheduled tasks) with hardware conditions (Windows
  build, CPU/GPU vendor, dedicated GPU, laptop/desktop, RAM, Ethernet, DarkOS). New screen "Presets e módulos": open a
  file or paste JSON, see every change with this PC's current value next to the new one, install, remove and restore,
  and "Create a preset from my PC". Installing saves every original value, verifies after applying and rolls back on
  failure; removing restores exactly (values that did not exist are deleted again). Packages are checked against a
  JSON Schema (electron/services/hub/schema/v1.json) and security rules: no Defender, UAC, firewall, Windows Update,
  startup persistence, code loading or essential/security services, and no scripts. Risk is computed, not declared.
- DarkHub Hub (hub.darkhub.ink): "Presets e módulos" now has a Catalog tab that searches the Hub, filters "only the ones
  for this PC" by hardware, opens any package in the same preview and installs it. Every download is checked against its
  SHA-256 and the Hub's Ed25519 signature (`id@version:sha256:tier`, public key embedded in the app) before anything is
  shown or installed; tiers official/verified/community. Installed Hub packages get update checks and a one-click update
  (the old version is restored if the new one fails). `darkhub://hub/install?id=...` links from the site open the
  preview in DarkHub (never install by themselves). A development server can be set in the tab; it counts as community
  unless it signs with the official key. Twenty official presets (gaming, privacy, interface, laptop, cleanup...).
- Packages can run the Optimizer's operations (`{ "op": "darkhub:op:<id>" }`): reversible ones are undone on removal
  (and left alone when they were already active), one-time actions just run, operations that only wrap built-in tweaks
  are installed as those tweaks, security/irreversible ones are official-only and the ones with no way back are refused.
  If any step fails, everything the package did is undone. "Create a preset from my PC" includes active operations.
- Extensions: packages of type "extension" add new screens (sidebar section Extensões) and Dashboard cards written in
  HTML/CSS/JS, with no build step. They run in a sandboxed frame on their own `darkhub-ext://` origin with a strict CSP
  (no Node, files, direct network, remote code or navigation) and reach DarkHub only through `window.darkhub`, which the
  main process answers per declared permission: storage, hardware, sensors (no process names), tweaks.read, network
  (declared https origins only), notifications, clipboard, packages (installs go through the package engine and the
  user approves each one). Development: load a folder that reloads on save, a console per extension, `npm run ext:new`
  and `npm run ext:pack`, and MCP tools to load, reload and read logs. Example: pokeralho.painel-termico.
- MCP server for AI assistants (Presets e módulos > IA (MCP), off by default): Claude Code (HTTP) and Claude Desktop
  (stdio bridge `DarkHub.Mcp.exe`) can read the PC's hardware, list built-in tweaks/operations, validate and preview
  packages, search the Hub and install, update or remove packages. Loopback only, token required, browser origins
  refused, and every change waits for the user to approve it in a DarkHub window. See docs/hub/MCP.md.
- Documentation for creating packages with AI: docs/AGENTS.md, docs/hub/README.md (full spec), docs/hub/BUILTIN.md
  (generated list of the 66 built-in tweaks and what they write), docs/hub/PROMPTS.md (ready prompts in Portuguese and
  English), three example packages, and `npm run hub:validate` (same checks as the app, explains each change).
- Overlay editor (In-game overlay > Open the overlay editor): build your own overlay from blocks (metrics line, big
  value, graph with up to 4 lines, per-thread bars, statistics table, text, separator, spacer) bound to ~45 metrics
  (FPS/frames, GPU, CPU, RAM, session, clock); per-value prefix, unit, decimals, color, size and warning/critical
  thresholds; per-block style (colors, background, size, weight, alignment, padding, margin, corners, border, text
  effect, letter spacing, opacity); theme (font, colors, background and opacity, border, corners, spacing, vertical
  list or horizontal bar, text shadow); position by screen corner/center with offset, scale and opacity, or by
  dragging in the preview; and free CSS with an id per block. Live preview (real numbers while the overlay is on) over
  dark/bright/colorful backgrounds, at real size or on a 1920x1080 screen. Six templates (RivaTuner classic,
  Overclocker, Top bar, FPS only, Neon, Compact), named layouts, duplicate, export/import as a code. Used in game as
  the "Personalizado" layout. Imported layouts are sanitized and the overlay page loads nothing and runs no scripts.

### Changed
- Overlay graphs scroll smoothly: frame times stream to the overlay ~30 times a second and the page draws every graph
  at the display's refresh rate on the game's own clock (frame time) or wall time (FPS, loads, temperatures), with an
  easing vertical scale and animated thread bars. Canvases are kept between refreshes (only the text is replaced) and
  drawn at the real pixel density (Windows scaling x overlay scale), so they stay sharp. Measured: ~0.05-0.08 ms per
  frame for all graphs.
- The editor's live preview refreshes every 300 ms.
- Password vault browser extension: new look matching the app (DarkHub mark, cold neutrals, one accent), a title and
  one line of help for every state (not running, pairing, locked, unsupported page, no logins), the pairing code shown
  one digit per box, login rows with initials and a clear fill result, and an inline picker in the same style whose
  messages follow the browser's language; extension icons. Same messages, permissions and security checks as before.
  The extension now also has its own repository: https://github.com/Pokeralho/darkhub-vault-extension
- Repository: contributor docs moved out of the root (`.github/CONTRIBUTING.md`, `.github/SECURITY.md`, `docs/`),
  release scripts moved to `scripts/` and no longer tied to one folder, generated code maps no longer versioned,
  Portuguese README, issue forms, "Why DarkHub needs administrator rights" section and contributor guide without the
  native toolchain.

### Fixed
- Optimizer change sets kept "delete this value" as "write an empty text", and their read-back check treated a deleted
  value as a failure; both now handle deletions.
- Overlay CPU load and per-thread bars no longer fall back to LibreHardwareMonitor's load, which reads 100% on every
  thread on recent Windows 11 builds; they show "—" for the first seconds until Windows' counters have a reading.

## [0.7.2] - 2026-10-26

### Added
- Kakugan inside DarkHub (Serviços DarkHub > Kakugan): sign in, plans and balance, Steam accounts with live state,
  cards being farmed, pause/resume, invisible mode, games to idle (Steam search, up to 32), Steam sign-in by QR code
  with the phone app, Steam Guard code/password prompts, remove account. Payment and account creation stay on the
  website. The session is the site's own cookie, kept encrypted with Windows DPAPI (safeStorage) in the main process.
- DarkOS releases on the DarkOS screen: latest version and build from darkos.darkhub.ink, compared with the installed
  build; the ISO downloads through the Download Manager checked against the SHA-256 the site publishes.
- In-game overlay layouts: "Avançado" (RivaTuner style, one line per component: GPU load/temp/clock/power, VRAM and
  memory clock, CPU load/temp/clock/power, RAM, FPS with frame time and 1%/0.1% lows, frame-time graph) and
  "Overclocker" (adds GPU voltage, % of TDP, hotspot/memory junction, fan RPM, CPU Vcore and max core clock, busiest
  thread, FPS/load/temperature graphs, per-thread load bars and a session panel: average/min/max FPS, 1%/0.1% lows,
  worst frame, frame-time standard deviation, stutters, GPU- or CPU-bound and present mode). Data from the full
  LibreHardwareMonitor tree; CPU load from Windows' own counters (LHM reports 100% on recent Windows 11 builds).
- Kakugan alerts in the tray while DarkHub runs (every 5 min, signed in): Steam asking for a code/password or a new
  QR sign-in, plan ending in 3 days, hours running out, farm server down/back. Clicking opens the Kakugan screen.
- Kakugan pauses the farm while a game launched from the Library runs and resumes the same accounts when it closes
  (also on the next start if DarkHub was closed mid-game). Both are switches on the Kakugan screen.
- Screenshots: camera shutter sound (synthesized, can be turned off) and a clipboard choice: image, Susuya link, both
  (image apps paste the picture, text fields the link) or nothing. Old settings keep their behaviour.
- In-game overlay shortcut on the home screen (Quick Utilities) and a "Show in game" button on the System Monitor.

### Changed
- Menu: new "Serviços DarkHub" group (Kakugan, Susuya, LuluFlix, Juuzou); "Gaming & Performance" is now translated
  ("Jogos e Desempenho").

## [0.7.1] - 2026-10-24

### Added
- Restore Windows components (Post-Install Hub): brings back what custom ISOs remove, one click each and verified
  afterwards: legacy Windows Media Player, Media Features, .NET 3.5 (Windows Update or offline from a mounted ISO),
  DirectPlay, Print to PDF, WMIC, classic Notepad, Media Player/Photos/Camera and codecs, Calculator, Paint, Xbox apps,
  the Microsoft Store and winget itself (official release, hash-pinned). Windows Update is unlocked only during the job.
- Driver Center installs missing drivers: detects devices without a driver and GPUs on the Microsoft basic display
  driver, then gets drivers from Windows Update (temporarily re-enabling it on DarkOS and restoring it after) or from
  NVIDIA / AMD / Intel official sources (signature checked); restore point first, progress and log on screen.
- Startup manager: Run keys, Startup folders, logon/boot tasks and auto services; enable/disable exactly like Task
  Manager (StartupApproved), measured boot delay per app from the Diagnostics-Performance log, change history with undo.
- Before/after benchmark: CPU single/multi, memory bandwidth/latency, 1 ms timer delay, disk sequential and flushed 4K
  writes; records the system context and only reports a change when it exceeds the measured run-to-run variation.
- Scheduled maintenance (off by default): temp cleanup, game save backups, security lists, ClamAV signatures and winget
  updates on a daily/weekly/monthly schedule while DarkHub runs (tray included); missed slots run once later.
- Game save backup: save locations for 22,000+ games from the Ludusavi manifest (PCGamingWiki data), versioned plain
  folders, portable restore with a safety copy first, custom folders, automatic backup when a Library game closes.
- In-game overlay: FPS, 1% low, frame time graph (Intel PresentMon, pinned and hash-checked) plus CPU/GPU load,
  temperatures, VRAM and power on a click-through window; global shortcut Ctrl+Shift+F9; session log to CSV.
- USB ports: devices per hub/port with their real product names, turn a device off without unplugging it (keyboards
  and mice come back by themselves after 20 s unless confirmed), block USB storage, read-only flash drives, selective
  suspend, safe eject and the history of storage devices.
- Password vault transfer between PCs through Susuya: sealed again with a one-time key that only travels in the code.
- Advanced Security: protective DNS (Quad9, Cloudflare Security/Family, AdGuard) with restore.
- Text Editor runs code: JavaScript (bundled Node), PowerShell and Batch always; Python, C, C++, C# (.NET 10), Java,
  Go and Rust when installed (winget command shown otherwise). Stdin box, time limit that kills the process tree, Stop,
  capped output, and starter examples (output, input, function + loop) in every language. Line numbers, Tab indents.
- Developer Tools rebuilt as a sidebar of 13 tools: two-way unit converter (temperature, data size decimal/binary, data
  rate, length, mass, time, speed, area, volume, energy, pressure, angle, frequency, number bases, timestamps), Color
  Picker (screen eyedropper, HEX/RGB/HSL/HSV/CMYK, WCAG contrast, history), regex tester, JWT decoder, cron explainer,
  UUID/ULID, password generator with entropy, encoders.
- Decryption: Base32/Base58/Base64URL, HTML entities, Morse, ROT13/ROT47, Caesar (with every shift listed), Atbash,
  Vigenère, XOR; AES-256-GCM with PBKDF2-SHA256 (authenticated); hashes and HMAC (MD5 to SHA3-512, RIPEMD-160); format
  identification and JWT decoding.
- Advanced Security rebuilt with real, reversible protections: community hosts blocklists (StevenBlack, HaGeZi,
  malware-filter URLhaus/phishing), firewall IP blocklists (Spamhaus DROP, Feodo, IPsum), malware hash lists fed into
  real-time protection, and Windows hardening (Defender ASR rules, PUA, Controlled Folder Access, SmartScreen, SMBv1,
  LLMNR/NetBIOS, script block logging, RDP). Every layer saves the previous state and restores it exactly.
- Password vault browser extension (Chrome, Edge, Firefox; Manifest V3) over Native Messaging: one-time pairing with a
  code confirmed in the app, logins offered only for the page's site, passwords only on an explicit fill, rate limits,
  revocable paired browsers.
- Metadata editor for any file: images (EXIF/IPTC/XMP, GPS removal, strip), audio (ID3, Vorbis, MP4 atoms, cover art),
  video (ffmpeg stream copy), PDF, Office documents, read-only EXE/DLL version info; file dates, attributes, alternate
  data streams and the "downloaded from the internet" mark; every write is read back before it replaces the file.
- PowerShell Tools: 7 tabs and 20 configurable tools (system report, startup, tasks, services, event log, installed
  programs, winget upgrades, disk health, large/duplicate files, old-file cleanup, open ports, Wi-Fi profiles, hosts
  editor, update history, SFC/DISM, battery/energy reports) plus a custom script runner with live output and snippets.
  Results filter, sort and export to CSV/JSON/TXT.
- Network & Latency: live latency monitor with jitter/loss chart and game-server presets, per-hop traceroute, MTU
  discovery, bufferbloat grade, DNS benchmark with apply/restore, and reversible adapter tweaks (interrupt moderation,
  flow control, power saving, ECN, QoS DSCP per game).
- Video downloader options: MP4/MKV/WebM, H.264 or AV1, subtitles (embed, languages, auto), SponsorBlock (cut or mark),
  chapters (embed or split), section trim, playlist items, bandwidth limit, skip already downloaded.
- OCR: capture a screen area, 11 languages, layout modes, confidence indicator; language data cached for offline use;
  small images upscaled and light-on-dark text inverted before recognition.
- Disk map: colors by category (system, junk, games, programs, development, media, installers), clickable legend with
  per-category totals, back/forward history and keyboard navigation, "largest here" list.
- Real-time optimizer smart mode (on by default): lowers updaters and background helpers, closes only Windows telemetry
  runners, never closes user programs.

### Changed
- ClamAV installs itself with its signatures in the background when real-time protection is turned on.
- DarkHub runs as administrator: when opened without it, it asks UAC to reopen elevated (retry, continue limited or
  quit when declined). The installer is per-machine.
- The installer also sets up the PawnIO driver (advanced sensors) and ClamAV 1.5.4, both downloaded from their official
  sources and checked against pinned SHA-256 hashes (PawnIO also by its digital signature); a failure never blocks the
  DarkHub install. Advanced sensors (CPU temperature) start with the app.
- Download Manager picks the connection count from the file size (1 to 16) unless set by hand.
- System Optimizer items grouped in collapsible categories with descriptions and applied counts.
- Password vault: stronger scrypt parameters (migrated on unlock with a backup), full-length GCM tags enforced, KDF
  parameters bounds-checked, backup before import, locks on Windows lock and sleep.

### Fixed
- Advanced Security hosts blocking is capped at 10,000 entries and only the URLhaus list is on by default: in the test
  VM every hosts change stalled Windows DNS for 4 s at 5k entries and 12 min at ~100k (the previous default).
- Hosts writes retry while Windows still holds the file; PresentMon download retries.
- USB device list could drop devices when a property query failed for one of them.
- Save backup: a restore within the same second as a backup could overwrite the version being restored.
- Library: picking an executable now reaches the editor (games could not be saved); covers load again (local-resource
  drive letter and covers folder access) with fallbacks and a refetch on error; cover saves no longer overwrite edits;
  re-importing does not duplicate games; launch optimizations wait for the game process and report what was applied.
- Optimizer Energy-Efficient Ethernet read/apply/restore matched `AdvancedEEE` too (wildcard keyword); now exact.
- Network: Winsock/TCP reset runs elevated (it failed silently before); the guessed "optimized MTU" was replaced by real
  MTU discovery.

### Removed
- Advanced Security's hand-written "anti-phishing shield" and the "anti-ransomware armor" (it only set the VSS service
  to automatic and always reported success).

## [0.7.0] - 2026-10-23

### Added
- Real-time screen (Overview > Real-time). Both services are off by default and keep running with DarkHub in the tray.
  - Real-time optimizer: reads available memory every 5 s with no process spawned; under real pressure it trims the
    working sets of background processes through the native engine, never the foreground window, and backs off
    exponentially when a trim frees little. User process rules (lower priority / close) run from one native process list
    every 20 s (~15 ms for 500 processes); system processes are refused.
  - Real-time protection: folders watched with ReadDirectoryChangesW (no polling); only risky file types, once a
    download stops growing; SHA-256 looked up in a sorted binary hash set (EICAR test signature + community
    `fileHashes`); optional ClamAV (official winget package and freshclam signatures) scanned in batches at low
    priority, without the resident clamd daemon. Detections go to an XOR-encoded quarantine with restore (restored files
    become trusted) and raise a notification.
- Community rules accept `fileHashes` (SHA-256 with a detection name), documented in SECURITY_RULES.md.
- Driver Center shows the board maker (ASUS, MSI, Sapphire...) from the PCI subsystem vendor id.
- Native latency engine: `list_processes` and a `clean_ram` that skips the foreground window and reports what it trimmed.

- Susuya (susuya.darkhub.ink) built in: drop or pick files (up to 600 MB, 8 MB chunks, 3 in parallel, retried) and get a
  direct download link (/d/:id) on the clipboard; active links with copy and delete. Same protocol as the site.
- Native-resolution screenshots: the monitor under the mouse at its physical pixel size, lossless PNG, global shortcut
  (Ctrl+Shift+F12 by default), optional upload to Susuya with the direct link copied.
- DLSS Manager rebuilt:
  - DLSS updater: finds nvngx_dlss / dlssd / dlssg in each game (Steam library or any folder), compares with NVIDIA's
    newest SDK release and swaps in NVIDIA's own DLLs (NVIDIA/DLSS repository, 64-bit and Authenticode-checked), keeping
    the game's file for restore; anti-cheat games are left out of "update all".
  - DLSS 5 neural rendering through DLSS 5 Autopilot (MIT), installed from its official release (SHA-256 checked) and
    launched from DarkHub, with the card's DLSS 5 tier (RTX 50 / 40 / 20-30 / unsupported).
- OptiScaler Manager: frame generation (FSR FG or XeFG; the game's own DLSS-G/FSR 3 FG as source when present) and the
  installed/latest OptiScaler version with one-click update.

### Fixed
- OptiScaler Manager could never apply: it looked for a pinned release folder that is not shipped. It now downloads the
  official latest release (SHA-256 checked) on first use.
- DLSS 5 Manager installed files that never enabled DLSS 5: an OptiScaler.ini with sections and values OptiScaler does not
  have ([DLSSNR], [ZLUDA], FGOutput=dlssg, a preset that is not current), eight "routes" that all installed the same thing,
  and an RTX 20/30 neural build for every card. That installer is removed; old installs can be removed from the screen.
- GPU detection no longer reports an RTX card when WMI fails.
- Archives were extracted with whatever tar.exe came first in PATH; Git's GNU tar reads "C:" as a remote host and failed.
  Windows' own tar is now used by absolute path (file converter, OptiScaler, DLSS 5 Autopilot).
- Self-test screenshots were stale when another window covered the test window (native occlusion disabled for it) and
  could target an overlay window instead of the app window.

## [0.6.0] - 2026-10-21

### Fixed (startup)
- The app could fail to open on some PCs (a second launch then showed "Cannot access 'mainWindow' before
  initialization"): every feature's IPC registration is isolated and logged, `mainWindow` is declared before the
  second-instance handler, and `app.getPath('downloads')` falls back to the profile folder.

### Monitor, Post-Install, embedded sites
- System Monitor: new "All sensors" tab lists every LibreHardwareMonitor sensor per component (voltages,
  temperatures, power, clocks, utilization, fans, memory, SMART data), HWMonitor style, with session min/max and a filter.
- The sensor helper reports whether it runs elevated: PawnIO only answers an elevated caller, so without admin the
  CPU temperature/clock/voltage/power and Super I/O placeholders are hidden and the UI says why (was "waiting").
- Post-Install Hub: categories are collapsed by default (name, count and a preview of the apps), open on click or
  while searching; "Expand all / Collapse all".
- LuluFlix / Juuzou: the embedded site fills the window (it was capped at 420 px because its wrapper had no height).

### Design
- New "Frost" identity derived from the brand mark: cold ink neutrals, one glacial accent, Geist / Geist Mono,
  tight radius scale and restrained motion. Rules in `DESIGN.md`; Tailwind palettes are remapped so every screen
  inherits it.
- 125 custom icons (`src/components/icons`, chamfered "ice tile" geometry); lucide-react removed.
- Redesigned shell (title bar mark, sidebar with glacial active rail) and Home; all 30 screens polished
  (no icon chips, no uppercase eyebrows, no hype pills, one primary action per view, skeleton/empty/error states).
- Native checkbox / radio / select / range styled consistently app-wide.

### Fixed (verified in a DarkOS VM: 35 registry tweaks and 36 optimizer operations applied, verified and reverted)
- DarkOS Center status: 26 s -> ~5 s (bulk service / task / Appx reads, identical results).
- DarkHub now runs the newest DarkOS module (installed vs bundled, by `# ModuleVersion`), so module fixes reach
  DarkOS machines; "removed apps" no longer fails without admin.
- Drag-and-drop in File Converter and DLSS 5 (File.path was removed in Electron 32) and a file-grant bypass.
- File Converter / archive failed in the default flow (output folder next to the picked files was refused).
- Duplicated Steam games (DLSS 5 and Library discovery); wrong game executable picked (e.g. Deadlock).
- "Ultimate Performance" failed when the plan already existed; CPU unpark verification false negative
  (hidden power settings are now read from the registry).
- HAGS showed "Unavailable" until the GPU tab was opened; Dashboard said "Optimal" with a red security score.
- Ultra Low Latency could not bind a bare F-key; log consoles scrolled the whole page.
- Native helpers (FrameLimiter, ClickEngine, LatencyEngine, SensorDaemon) rebuilt from the audited sources.

### Added
- Driver Center: GPUs running Microsoft's generic display driver are identified by PCI vendor ID
  ("NVIDIA/AMD/Intel card (Microsoft generic driver)") with a one-click link to the vendor's official app; Home
  shows a banner when this happens.
- Driver Center: camera and screen-capture check + repair (capture services, privacy policies, UVC driver
  reinstall, ghost USB cleanup; on DarkOS it also reverts the lean items that block the camera).
- Post-Install Hub: new Office/PDF, Image & Design, Video, Audio and 3D/CAD categories with open-source
  alternatives (LibreOffice, ONLYOFFICE, GIMP, Inkscape, darktable, Kdenlive, Blender, FreeCAD...) and the
  storytold "Craft" apps (PhotoCraft, WordCraft, GridCraft... marked alpha), installed from their official
  GitHub releases with the SHA-256 checked.

- DarkOS Mods on any Windows: on a stock Windows the DarkOS screen becomes "DarkOS Mods" and applies the 167 DarkOS
  tweaks one by one (gaming and latency first), per category or by profile (Balanced / Competitive gaming /
  Maximum performance). Same engine as DarkOS: original value captured, read-back verification, verified undo,
  snapshots and "restore everything". State lives in `C:\ProgramData\DarkHub\WinMods`; per-user items target
  the current user. Mods the system already has are shown as "Already active"; services/tasks that do not
  exist on that Windows are shown as such instead of offering an Apply that does nothing.
- DarkOS engine (ModuleVersion 3): protected services that refuse SCM changes even for admins (e.g. Delivery
  Optimization / DoSvc) now get their startup type through the registry, instead of failing and rolling back.

- WinUtil (Chris Titus) parity, adapted. 31 new Optimizer tweaks, all with original-value snapshot, read-back
  verification and undo:
  - Gaming / network: MPO off, prefer IPv4, IPv6 off, Teredo off (official policy).
  - Power: no network in Modern Standby, S3 sleep.
  - Privacy / anti-bloat: no Store results in Start search, notifications off, block device companion apps, block
    the Razer Synapse / Logi Download Assistant auto-install (without turning off Windows Update drivers), WPBT off,
    Brave debloat, keep classic Outlook.
  - Storage: Storage Sense off, Reserved Storage off.
  - System: long paths, registry backup, detailed BSOD, verbose logon, F8 boot menu, NTP pool, no warning for
    unsigned .rdp files.
  - Interface: Home/Gallery off, no folder-type detection (keeps saved views), previous Start menu, lock screen off,
    Settings home page off, battery %, scrollbars always visible, Snap off, Num Lock on at startup.
- Optimizer "Windows Features & Repairs" tab:
  - Windows features with their real state: WSL, VM Platform, Hyper-V, Sandbox, .NET 3.5, legacy media, NFS,
    OpenSSH server.
  - Repairs: Windows Update reset, winget repair, component store cleanup without /ResetBase.
  - Advanced actions: autologon through netplwiz, Edge remove/reinstall, BitLocker off.
  - 19 classic Control Panel / MMC screens.
- O&O ShutUp10++ added to the Post-Install Hub.
- PowerShell runner: scripts too long for the Windows command line (32K) now run from a private temp file.
  This had broken the status read of every tweak once the list grew.
- "Prefer IPv4" and "Disable IPv6" are alternatives: applying one undoes the other first, so undo returns the
  real original value.

- Disk map (new screen, replaces the SpaceSniffer replica, which only showed made-up data and launched an exe that was
  not shipped):
  - Real scanning through the native `DarkHub.DiskScan.exe`: `FindFirstFileEx` with large fetch, multi-threaded, no
    per-file stat, reparse points never followed. A full C: drive (~790k files) takes 4 to 8 s.
  - The tree stays in the main process in column arrays (~40 MB for 790k files). The renderer only gets what can be
    drawn; smaller items are folded into one block.
  - The map updates live during the scan.
  - Filters (name, size, age, folder, type, tags, real attributes, negation) run over the whole tree in ~0.3 s.
  - Side panel for the selected item: open, Show in Explorer, copy path, tags, Move to Recycle Bin (with confirmation).
  - TXT/CSV reports; real drives with capacity; free space optional; "not visible" space shown on whole drives.
  - Frost design: canvas with a cached static layer, ResizeObserver, keyboard shortcuts.

- Advanced sensors (System Monitor), opt-in: LibreHardwareMonitorLib 0.9.6 in a separate helper
  (`DarkHub.HwSensors.exe`). Without a driver it reads the GPU (core, hot spot, VRAM, power) and the disks. With the
  PawnIO driver (installed automatically when the sensors are turned on, author-signed, Memory Integrity compatible) it
  also reads per-core CPU temperature, fans and voltages. CPU / Super I/O placeholders are never shown without the
  driver. WinRing0 was rejected: it is on Microsoft's vulnerable-driver blocklist.

### Fixed (monitoring)
- Installed builds: the native sensor daemon could never start (`spawn` from inside app.asar fails with ENOENT while
  `existsSync` says yes), so disk, network, GPU and DPC sensors were dead and the daemon respawned every 5 s. Same
  bug in the DLL injector (PowerShell cannot read a script inside app.asar). Both now use app.asar.unpacked.
- Real data only:
  - Counters that cannot be read come as null ("unavailable") instead of a measured 0.
  - Disk active time is 100 - % Idle Time (as Task Manager shows), not a clamped % Disk Time.
  - GPU usage and VRAM are read per adapter (DXGI LUID + name) instead of mixing iGPU and dGPU into "GPU 1";
    nvidia-smi and the advanced sensors are matched by name, not position.
  - CoreTemp in Fahrenheit or distance-to-TjMax mode is converted.
  - "Distance to TjMax" is never used as a temperature, and the OHM/LHM WMI read takes exact sensor names.
  - The ACPI zone is no longer presented as the CPU temperature.
  - Removed fake values: Dashboard disk activity estimated against 7000 MB/s, the CPU temperature shown as the GPU's,
    "0 B" of junk when the scan failed, "SMART OK" without data, per-core 0 % on the first sample, physical cores
    guessed as threads / 2, "Disconnected" for an unknown link speed, "Integrated GPU" from an unreliable flag, the
    "ADL / SMI fallback" tag, and "running" processes copying the total.
  - Fixed: swapped cores / threads label, Windows 11 detection (build 22000+), registry driver date and nvidia-smi
    power limit taken from the wrong adapter, sparkline history that skipped repeated values.
- Lighter: the PowerShell slow daemon no longer repeats what the native daemon reads (processes, CoreTemp) and stops
  its WMI / ACPI / disk-reliability temperature queries while the advanced sensors run. The PowerShell PDH fallback
  (~200 lines duplicating the native daemon) was removed. The PawnIO check is cached.
- PawnIO is installed automatically when advanced sensors are turned on: official 2.2.0 release, pinned SHA-256,
  Authenticode check, silent install. Its setup has no published redistribution terms, so it is fetched instead of
  shipped inside the installer.
- New test guard: backslashes dropped inside JS template literals sent to PowerShell (parsed with TypeScript).
- Home: the memory figure showed FREE memory next to a bar of USED memory, read once. It now shows memory in use (the
  same number as Task Manager), refreshed every 3 s through a cheap `system:getMemory` (no PowerShell).
- CPU temperature: when only an ACPI thermal zone was available, 16 degrees C were added to any value below 32. The
  zone is now shown as it is, marked low quality.
- Measured cost of the existing monitoring: ~0.1% of total CPU (PowerShell slow sensors 0.07%, SensorDaemon 0.02%).

### Fixed (Post-Install Hub)
- 19 catalog entries had winget IDs that no longer exist (HWiNFO, OCCT, FurMark, Prime95, System Informer,
  Vivaldi, PeaZip, Afterburner, BCU, WhatsApp...): all corrected; Macrium Reflect Free (discontinued) removed.

### Developer
- `npm run dev` (auto-restart, separate profile, IPC trace panel), `npm run selftest`, `npm run shot`,
  `npm run map` / `map:find`, `docs/PROJECT_MAP.md`, `CLAUDE.md`.

### Fixed (shell)
- App shell: each page now has its own error boundary (keyed by route), so one module crashing no longer leaves
  every other page showing the error card; the card offers "Home", and chunk-load failures offer a full reload.
  Render errors are also forwarded to the existing renderer error reporter. The updater overlay and the whole
  shell are wrapped too (no more blank window if the layout throws).
- 12 i18n keys used by the Microsoft Edge reinstall panel and the Defender image-restore flow were missing from
  both dictionaries (English UI showed Portuguese fallbacks); added in pt-BR and en-US.
- Pages now open scrolled to the top instead of inheriting the previous page's scroll position.
- LuluFlix / Juuzou: show a retry card when the embedded site fails to load (previously a blank panel).

### Changed
- Dashboard is lazy-loaded like every other page (startup bundle only carries the shell).
- Sidebar: `aria-current`, keyboard focus ring, Up/Down/Home/End navigation, Settings active state,
  translated window-control / collapse labels; visible `:focus-visible` outline app-wide.
- Boot skeleton in `index.html` matches the real shell (32px title bar, 224px sidebar, zinc palette).
- Setup Hub / LuluFlix / Juuzou headers follow the standard page header; `<html lang>` follows the UI language.
- Removed the unused `registerLanguage()` export from `src/i18n/messages.ts`.
- `.gitignore`: dropped the blanket `*manifest*` pattern; added coverage/.vite/profiling outputs.

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
