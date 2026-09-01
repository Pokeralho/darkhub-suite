<p align="center">
  <img src="./build/icon.png" width="80" height="80" alt="DarkHub Suite Logo" />
</p>

<h1 align="center">DarkHub Suite</h1>

<p align="center">
  A high-performance modular Windows desktop utility for system configuration, gaming optimization, defensive security, media workflows, and offline tools.
</p>

<p align="center">
  <a href="https://github.com/Pokeralho/darkhub-suite/releases"><img src="https://img.shields.io/badge/Release-v0.4.5-blue?style=flat-square" alt="Release Version" /></a>
  <a href="https://github.com/Pokeralho/darkhub-suite/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License" /></a>
  <img src="https://img.shields.io/badge/Platform-Windows%2010%20%2F%2011%20(x64)-zinc?style=flat-square" alt="Platform" />
  <img src="https://img.shields.io/badge/PRs-Welcome-green?style=flat-square" alt="PRs Welcome" />
</p>

<p align="center">
  <a href="#quick-installation">Installation</a> •
  <a href="#overview">Overview</a> •
  <a href="#core-modules">Core Modules</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#extensibility">Extensibility</a> •
  <a href="#building-from-source">Build</a> •
  <a href="#contributing">Contributing</a> •
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="./docs/assets/preview.png" width="92%" alt="DarkHub Suite Dashboard Preview" style="border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);" />
</p>

---

## Quick Installation

Run the following command in **PowerShell (Administrator)**:

```powershell
irm darkhub.ink/win | iex
```

Direct GitHub repository installer:
```powershell
irm https://raw.githubusercontent.com/Pokeralho/darkhub-suite/main/install.ps1 | iex
```

---

## Overview

DarkHub Suite consolidates kernel-level Windows optimization, latency reduction engines, local defensive security, media processing, and offline utilities into a unified desktop interface built with Electron, React, and native C#/C++ background services.

All operations execute locally on the host machine. No user telemetry, telemetry payloads, or private data are transmitted to external servers.

---

## Core Modules

### 1. System Optimizer and Hardware Telemetry
- **Hardware Telemetry Engine**: Real-time polling of CPU frequency, core utilization, physical memory allocation, GPU load, storage health, and thermal sensors.
- **Process Scheduling Quanta**: Configures `Win32PrioritySeparation` (0x26) to prioritize foreground application execution.
- **Memory Management**: Enforces `DisablePagingExecutive` to maintain kernel-mode drivers and system code within physical RAM.
- **MSI Mode (Message Signaled Interrupts)**: Direct registry configuration of PCIe GPU and network interfaces for line-based or MSI vector interrupts.
- **Core Parking Control**: Power policy overrides to mitigate CPU core unparking latency.
- **Network Stack Tuning**: Configures TCP Window Autotuning, Compound TCP (CTCP), and Receive Side Scaling (RSS).

### 2. DarkPacer and Ultra-Low Latency Engine
- **Hardware Frame Limiter**: Enforces stable frame pacing via high-resolution QueryPerformanceCounter (QPC) spin loops and driver integration.
- **Frametime Oscilloscope Overlay**: Real-time transparent DirectX overlay rendering frametime metrics, 1% low, 0.1% low, and frame variance.
- **Audio Scheduling Priority**: Configures MMCSS scheduling for `audiodg.exe` to eliminate audio buffer underruns under heavy CPU loads.
- **OptiScaler Manager**: Detection, configuration, and injection of upscaling libraries (DLSS, FSR, XeSS) for supported titles.
- **Global Timer Resolution**: Configures high-precision 0.5ms system timer resolution for input latency reduction.

### 3. Endpoint Defensive Security and Privacy
- **DNS Sinkhole (Hosts)**: Local filtering of tracking, telemetry, and malicious domains by routing queries to `0.0.0.0`.
- **URL Heuristic Analyzer**: Scans URLs for IDN homograph punycode attacks, typosquatting signatures, and credential harvester patterns.
- **Network Port Sentry**: Audits active TCP and UDP listening sockets with associated process identifiers and executable paths.
- **System Hardening Helpers**: Audits Volume Shadow Copy (VSS) status and verifies deprecation of legacy SMBv1 networking.

### 4. Media Processing and YouTube Engine
- **YouTube and Media Downloader**: Multi-fragment media extraction powered by integrated yt-dlp and FFmpeg binaries.
- **Format and Codec Presets**: Direct export to MP3 (320 kbps), AAC, WAV, FLAC, and high-resolution video streams (up to 4K/2K/1080p).
- **Metadata and Cover Art Injection**: Automatic extraction and embedding of ID3 tags, artist/album metadata, and high-resolution album thumbnails.
- **Playlist Management**: Structured multi-track extraction with ordered index formatting and custom output directory routing.
- **Anti-Bot Mechanism**: Automated rotation across Android, iOS, and Web player clients with optional browser cookie synchronization.

### 5. Offline Productivity and Privacy Utilities
- **Universal File Converter**: Local offline conversion between image, audio, video, and document formats.
- **Offline OCR**: Text recognition engine executing locally through WebAssembly Tesseract models.
- **Metadata Scrubber**: Local EXIF inspection and sanitization using embedded ExifTool.
- **Encrypted Password Vault**: Local credential repository utilizing AES-256-GCM encryption with master key derivation.
- **Hardware Profile Setup Hub**: Winget post-formatting package manager and driver verification.

---

## Architecture

```
+------------------------------------------------------------------------+
|                        DarkHub Suite Architecture                      |
+-----------------------------------+------------------------------------+
|         Frontend (Renderer)       |         Backend (Electron/Main)    |
|  * React 19 + TypeScript + Vite 8 |  * Electron 41 (ESM)               |
|  * Tailwind CSS + Lucide Icons    |  * Node.js Runtime                 |
|  * Bilingual i18n Engine (EN/PT)  |  * Secure Preload & IPC Handlers   |
|  * Component Error Boundaries     |  * Hardware Abstraction Layer (HAL)|
+-----------------------------------+------------------------------------+
|                       Native Services & Binaries                       |
|  * DarkHub.FrameLimiter.exe (C#)      * DarkHub.LatencyEngine.exe (C#) |
|  * yt-dlp.exe (Media Extractor)       * ffmpeg.exe (Static Media Core) |
|  * OptiScaler DLL Bridge              * ExifTool Metadata Engine       |
+------------------------------------------------------------------------+
```

---

## Extensibility

### Custom Translations (i18n)
DarkHub Suite supports runtime internationalization:
1. Navigate to **Settings > Language > Collaborate / Import**.
2. Download the language template (`darkhub-i18n-template.json`).
3. Fill in translated strings for your target locale code.
4. Import the JSON file directly into the application.
5. Refer to [TRANSLATIONS.md](./TRANSLATIONS.md) for pull request guidelines.

### Community Threat Rules
1. Navigate to **Advanced Security > Community Rules**.
2. Download the threat indicators template.
3. Add verified domain blocks or heuristic patterns.
4. Import into the application or submit a Pull Request following [SECURITY_RULES.md](./SECURITY_RULES.md).

---

## Building from Source

### Prerequisites
- Node.js 20+ or 22+ LTS
- npm 10+
- Windows 10 or 11 (64-bit)
- .NET Framework 4.0+ (for native C# helper compilation)

### Build Instructions
```bash
# Clone the repository
git clone https://github.com/Pokeralho/darkhub-suite.git
cd darkhub-suite

# Install dependencies
npm install

# Run development mode
npm run dev

# Compile native services and renderer
npm run build:native
npm run build:renderer

# Package production installer
npm run build
```

The production NSIS installer will be generated at `dist_app/DarkHub Setup 0.4.5.exe`.

---

## Contributing

Contributions, bug reports, and optimizations are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before submitting pull requests.

---

## License

This project is licensed under the [MIT License](./LICENSE).
