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
  <b>English</b> · <a href="./README.pt-BR.md">Português</a>
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#features">Features</a> ·
  <a href="#how-it-stays-safe">Safety</a> ·
  <a href="#why-darkhub-needs-administrator-rights-and-what-the-sensitive-parts-do">Admin rights</a> ·
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
- **DLSS Manager**: keeps every game's DLSS, Ray Reconstruction and Frame Generation on NVIDIA's newest build
  (official NVIDIA DLLs, signature checked, originals kept), and brings DLSS 5 neural rendering to games that do not
  ship it through DLSS 5 Autopilot.
- **OptiScaler Manager**: the official OptiScaler release with FSR 4 / FSR 3.1 / XeSS / DLSS upscaling and FSR or XeSS
  frame generation, with backups and one-click revert.
- **PGE Portable**: Lossless Scaling and ReSwitch bundled.

### Real-time (off by default)
- **Real-time optimizer**: frees memory only under real pressure (never the window in focus) and lowers the priority
  of, or closes, the background apps you list. Runs in the tray at almost no cost.
- **Real-time protection**: watches Downloads, Desktop and any folder you add; checks new executables, scripts and
  archives against a hash database and, optionally, ClamAV; quarantine with restore.

### Sharing
- **Susuya**: upload files up to 600 MB to [Susuya](https://susuya.darkhub.ink) and get a direct download link.
- **Screenshots**: native-resolution lossless PNG with a global shortcut, also in exclusive-fullscreen games, with
  optional upload to Susuya.

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

## Why DarkHub needs administrator rights, and what the sensitive parts do

A tool that changes Windows settings has to be trusted. This section explains, in plain terms, the parts that usually
worry people. Everything here can be checked in the source code linked below.

**Administrator rights.** The installed app asks for them when it starts (`requireAdministrator` in the Windows
manifest). Most of what DarkHub does writes to places only an administrator can change: system registry keys
(`HKLM`), Windows services, power plans, drivers, the firewall and the `hosts` file. If you start it without admin, it
offers to reopen through the normal Windows UAC prompt, or to continue without admin with those features off
([electron/services/ensureElevated.js](./electron/services/ensureElevated.js)).

**DLL injector.** A developer and modding tool: it loads a `.dll` file you choose into a running process you name
(the classic `CreateRemoteThread` + `LoadLibrary` technique, in
[electron/DarkHub.Injector.ps1](./electron/DarkHub.Injector.ps1)). It does nothing on its own, never runs in the
background and only acts when you click **Inject DLL** with both fields filled in. **Do not use it with online games
protected by anti-cheat** (Easy Anti-Cheat, BattlEye, Vanguard, VAC and others): injecting into those games can get your
account banned. Only inject DLLs you trust.

**Microsoft Defender and security settings.** The Security screen can turn Defender's real-time protection off and back
on. It only uses the supported mechanisms (Group Policy values and `Set-MpPreference`), saves the previous values
first, and then asks Defender itself whether it changed. If Tamper Protection is on, DarkHub refuses and tells you how
to change it yourself; if Defender stays on anyway, DarkHub undoes its changes
([DefenderControlEngine.js](./electron/services/optimizer/DefenderControlEngine.js)). Your PC has no active antivirus
while it is off, so turn it back on when you are done. Community packages
([DarkHub packages](./docs/hub/README.md#5-what-packages-cannot-do)) are **not allowed** to touch Defender, UAC, the
firewall, Windows Update, VBS or anything that runs at startup: the app and the validator refuse such a package as a
whole.

**PawnIO driver.** The *All sensors* panel (CPU temperatures, voltages, fans, SMBus) uses LibreHardwareMonitor, which
needs a kernel driver to read those values. DarkHub uses [PawnIO](https://github.com/namazso/PawnIO.Setup), an
open-source, signed driver made for this. The setup installs it from the official release; if that step is skipped,
the app installs it when you turn the panel on. In both cases the file is checked against a pinned SHA-256 and a valid
Authenticode signature before it runs ([build/deps/install-deps.ps1](./build/deps/install-deps.ps1),
[pawnio.js](./electron/services/hwsensors/pawnio.js)).

**ClamAV.** The setup also installs [ClamAV](https://www.clamav.net/), the open-source antivirus by Cisco Talos, from its
official release (pinned SHA-256). It is used only by *Real-time protection*, which is **off** until you turn it on.

**The one-line installer.** `irm https://raw.githubusercontent.com/Pokeralho/darkhub-suite/main/install.ps1 | iex`
downloads [install.ps1](./install.ps1) from this repository and runs it. The script asks the GitHub API for the latest
release, downloads the setup to your TEMP folder, compares its SHA-512 with the one published in that release's
`latest.yml` (the same file the in-app updater uses) and aborts if they differ. Then it closes running DarkHub
processes, runs the setup silently, opens the app and deletes the downloaded file. If a release has no `latest.yml`,
the script says so and continues without that check. You can read the script before running it, or skip it entirely
and install by hand.

**Manual install and checking the file.** Download `DarkHub-Setup-x.y.z.exe` from the
[releases page](https://github.com/Pokeralho/darkhub-suite/releases/latest) and run it. The installer is **not
code-signed yet**, so Windows SmartScreen may show "Windows protected your PC"; click *More info* → *Run anyway* only
after checking the file. To check it, compare its SHA-256 with the `sha256:` digest GitHub shows next to the asset on
the release page:

```powershell
Get-FileHash .\DarkHub*Setup*.exe -Algorithm SHA256   # run it in the folder where you saved the file
```

**Signing and reproducible builds, honestly.** Releases are built on the maintainer's PC with
[build-release.ps1](./scripts/build-release.ps1); they are not built in CI and not byte-for-byte reproducible yet (installer
timestamps differ between builds). The small native helpers (`electron/services/*.exe`) are committed prebuilt so
contributors do not need the .NET toolchain; each one is built from the `.cs` file next to it by `npm run build:native`,
so you can rebuild them and read the source they come from. The plan, in order: build releases in GitHub Actions with
[artifact attestations](https://docs.github.com/actions/security-for-github-actions/using-artifact-attestations) (so
`gh attestation verify` proves an installer came from a given commit), then free open-source code signing
([SignPath Foundation](https://signpath.org/)) so SmartScreen stops warning. Help with either is welcome.

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

Code map for contributors: [docs/PROJECT_MAP.md](./docs/PROJECT_MAP.md). Design rules: [DESIGN.md](./docs/DESIGN.md).

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

**Where things are.** Contributor docs live in [.github/](./.github) (CONTRIBUTING, SECURITY) and [docs/](./docs)
(design rules, translations, project map). Instructions for AI coding assistants are in [docs/AGENTS.md](./docs/AGENTS.md)
and `.claude/`. Code maps are generated locally with `npm run map` (`docs/map/` and an unversioned `graphify-out/`).

---

## Contributing

Bug reports, translations, packages, security rules and pull requests are welcome. The native helpers are prebuilt
and committed, so screens, translations, texts, tests and packages only need Node.js and npm. Read
[CONTRIBUTING.md](.github/CONTRIBUTING.md) (it has a list of good first contributions), [TRANSLATIONS.md](./docs/TRANSLATIONS.md)
and [docs/SECURITY_RULES.md](./docs/SECURITY_RULES.md). To report a vulnerability, see [SECURITY.md](.github/SECURITY.md).

## Contributors

Thanks to everyone who has helped with code, translations, packages and bug reports.

<a href="https://github.com/Pokeralho/darkhub-suite/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Pokeralho/darkhub-suite" alt="DarkHub Suite contributors" />
</a>

Questions, ideas and help: [GitHub Discussions](https://github.com/Pokeralho/darkhub-suite/discussions) is the community
forum. Use [issues](https://github.com/Pokeralho/darkhub-suite/issues) for bugs and concrete proposals.

## More from DarkHub

DarkHub Suite is part of [DarkHub](https://darkhub.ink/), a set of services in Portuguese:

| Service | What it does |
|---|---|
| [Website and guides](https://darkhub.ink/otimizador-de-pc/) | DarkHub Suite overview, FAQ and Windows gaming guides (pt-BR) |
| [Juuzou](https://darkhub.ink/juuzou/) | Search for game, software and repack torrents |
| [Susuya](https://darkhub.ink/susuya/) | Share files up to 600MB, deleted automatically after 1 hour |
| [LuLuFlix](https://darkhub.ink/luluflix/) | Jellyfin streaming server for movies, series and anime |
| [Kakugan](https://kakugan.darkhub.ink/) | Steam hours and trading card farming 24/7 on ArchiSteamFarm (paid) |


## License

[MIT](./LICENSE). Third-party components keep their own licenses
(see [electron/services/hwsensors/THIRD_PARTY.md](./electron/services/hwsensors/THIRD_PARTY.md)).
