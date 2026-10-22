<p align="center">
  <img src="./build/icon.png" width="80" height="80" alt="DarkHub Suite logo" />
</p>

<h1 align="center">DarkHub Suite</h1>

<p align="center">
  Windows utility for gaming performance, latency, hardware monitoring, system repair, security and offline tools.<br/>
  Every change it makes to Windows is snapshotted, verified and reversible.
</p>

<p align="center">
  <a href="https://github.com/Pokeralho/darkhub-suite/releases/latest"><img src="https://img.shields.io/github/v/release/Pokeralho/darkhub-suite?style=flat-square&label=release" alt="Latest release" /></a>
  <a href="https://github.com/Pokeralho/darkhub-suite/releases"><img src="https://img.shields.io/github/downloads/Pokeralho/darkhub-suite/total?style=flat-square" alt="Downloads" /></a>
  <a href="https://github.com/Pokeralho/darkhub-suite/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Pokeralho/darkhub-suite/ci.yml?branch=main&style=flat-square&label=ci" alt="CI" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT license" /></a>
  <img src="https://img.shields.io/badge/platform-Windows%2010%20%2F%2011%20x64-informational?style=flat-square" alt="Windows 10/11 x64" />
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#features">Features</a> ·
  <a href="#how-it-stays-safe">Safety</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#building-from-source">Build</a> ·
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <img src="./docs/assets/preview.png" width="94%" alt="DarkHub Suite home screen" />
</p>

---

## Install

**Installer (recommended):** download `DarkHub-Setup-x.y.z.exe` from the
[latest release](https://github.com/Pokeralho/darkhub-suite/releases/latest). A portable build is attached too.

**One line, PowerShell as Administrator** (downloads the latest release and checks its SHA-512 before installing):

```powershell
irm https://raw.githubusercontent.com/Pokeralho/darkhub-suite/main/install.ps1 | iex
```

Requirements: Windows 10 or 11, 64-bit. DarkHub runs as administrator because the optimizer, repairs and hardware
sensors need it. It updates itself from GitHub releases (the download is checked against the published SHA-512).

---

## Features

### Gaming and latency
- **System Optimizer**: registry, power, network, services and scheduling tweaks, each with a snapshot of the
  original value, read-back verification and undo. Includes the WinUtil (Chris Titus) tweak set, adapted.
- **DarkOS Mods on any Windows**: the 167 tweaks of the DarkOS image, applied one by one or by profile
  (Balanced / Competitive gaming / Maximum performance), gaming and latency first.
- **Ultra Low Latency**: timer resolution, MMCSS, interrupt and input-path tuning, bound to hotkeys.
- **DarkPacer**: frame limiter with precise pacing and a frametime overlay.
- **OptiScaler and DLSS 5 managers**: detect games, inject and roll back upscaler DLLs (DLSS, FSR, XeSS).
- **PGE Portable**: Lossless Scaling and ReSwitch bundled.

### Hardware
- **System Monitor**: CPU per core, RAM, GPU per adapter (DXGI), disk active time, network, DPC rate, processes.
  Only real readings: anything that cannot be read is shown as unavailable, never estimated.
- **All sensors**: every LibreHardwareMonitor sensor per component (temperatures, voltages, power, clocks, fans,
  SMART), HWMonitor style with min/max. The PawnIO driver is installed for you when you turn it on.
- **Driver Center**: GPU detection (including cards on Microsoft's generic driver), official driver links, camera
  and capture repair.
- **Disk map**: native multi-threaded scanner (a full C: drive in seconds), live treemap, filters, reports.

### Windows maintenance
- **Windows features and repairs**: WSL, Hyper-V, Sandbox, .NET 3.5, OpenSSH; Windows Update reset, winget repair,
  component store cleanup, Edge remove/reinstall.
- **Post-Install Hub**: bulk install through winget, open-source alternatives, apps from official GitHub releases
  with the SHA-256 checked.
- **DarkOS Center**: status, profiles, recovery and snapshots on DarkOS machines.

### Security and tools
- Hosts-based tracker/telemetry blocking, URL heuristics, listening-port audit, Defender control.
- AES-256-GCM password vault, file decryption tools.
- Video downloader (yt-dlp + FFmpeg), file converter, metadata editor (ExifTool), offline OCR, text tools,
  auto-clicker, DLL injector, PowerShell tools.

Full list of changes: [CHANGELOG.md](./CHANGELOG.md).

---

## How it stays safe

- **Reversible by design**: tweaks store the original value before changing it, read it back to verify, and can be
  undone one by one or all at once.
- **Local only**: no telemetry. Network access is limited to what you ask for (updates, downloads, winget).
- **Verified downloads**: tools fetched from GitHub releases are checked against a pinned SHA-256; the PawnIO driver is
  also checked for a valid Authenticode signature.
- **Tested on a VM**: operations that change the system are applied, verified and reverted on a DarkOS/Windows VM
  before release; every screen and read-only backend channel runs in an automated self-test.

---

## Architecture

```
Renderer   React 19 + TypeScript + Vite + Tailwind 4, Frost design system, pt-BR / en-US
   |  contextBridge (electron/preload.js)
Main       Electron 41 (ESM): IPC handlers -> services (optimizer engines, HAL, downloads, security)
   |  child processes, stdin/stdout JSON
Native     DarkHub.SensorDaemon (PDH, DXGI)      DarkHub.HwSensors (LibreHardwareMonitorLib)
           DarkHub.DiskScan (FindFirstFileEx)    DarkHub.LatencyEngine / FrameLimiter / ClickEngine
           native_pacer (Rust)                   yt-dlp, FFmpeg, ExifTool
```

Code map for contributors: [docs/PROJECT_MAP.md](./docs/PROJECT_MAP.md). Design rules: [DESIGN.md](./DESIGN.md).

---

## Building from source

Prerequisites: Windows 10/11 x64, Node.js 22 LTS, npm 10, .NET Framework 4.x (for the C# helpers), Rust/cargo
(only to rebuild `native_pacer`).

```bash
git clone https://github.com/Pokeralho/darkhub-suite.git
cd darkhub-suite
npm install

npm run dev            # Vite + Electron with hot restart
npx tsc --noEmit -p .  # type check
npx vitest run         # unit tests
npm run selftest       # every screen and read-only backend channel on this machine (with npm run dev running)

npm run build          # native helpers + renderer + installer
```

Installers are written to `dist_release/` (`DarkHub Setup x.y.z.exe` and `DarkHub x.y.z-portable.exe`).

---

## Contributing

Bug reports, translations, security rules and pull requests are welcome. Read [CONTRIBUTING.md](./CONTRIBUTING.md),
[TRANSLATIONS.md](./TRANSLATIONS.md) and [SECURITY_RULES.md](./SECURITY_RULES.md). To report a vulnerability, see
[SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE). Third-party components keep their own licenses
(see [electron/services/hwsensors/THIRD_PARTY.md](./electron/services/hwsensors/THIRD_PARTY.md)).
