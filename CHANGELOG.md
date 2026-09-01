# Changelog

All notable changes to the DarkHub Suite project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
