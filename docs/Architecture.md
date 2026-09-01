# DarkHub Suite - Technical Architecture

## 1. Overview
DarkHub Suite is an open-source Windows desktop application built with Electron, React, and TypeScript. It utilizes native Windows APIs, PowerShell, and WMI for systems administration, frame pacing, and defensive security.

## 2. Technology Stack
- **Runtime Environment**: Electron (Node.js backend, Chromium frontend)
- **Frontend Layer**: React, TypeScript, Tailwind CSS, Lucide Icons
- **Build System**: Vite (frontend bundling), electron-builder (NSIS installer packaging)
- **Telemetry & Hardware**: `systeminformation`
- **Native Frame Limiting**: C# / Rust native binaries (`DarkHub.FrameLimiter.exe`, `native_pacer.dll`)
- **Offline Media & Document Processing**: `tesseract.js` (WASM OCR), `exiftool-vendored`, `fluent-ffmpeg`

## 3. Architecture Pattern & Process Isolation
The application enforces strict separation of concerns:
- **Renderer Process (UI)**: Manages React state, routing, and user interface controls. Context isolation is enabled with `nodeIntegration: false`.
- **Main Process (Electron/Node)**: Manages IPC request routing, service orchestration, window management, and native system integration.
- **Context Bridge (`window.darkhub`)**: Strongly typed IPC interface exposing secure APIs to the frontend.

## 4. Core Subsystems
- **Optimizer Engine**: Manages Windows registry tweaks (`Win32PrioritySeparation`, `DisablePagingExecutive`, MSI Mode), power schemes, and service configurations.
- **Defensive Security**: Manages local DNS sinkhole rules via `hosts`, active socket auditing, and heuristic link scanning.
- **DarkPacer Engine**: High-precision frame limiter and DXGI overlay manager for frametime monitoring.
- **Update Service**: Dual-engine auto-updater supporting electron-updater and direct GitHub Releases fallback with multi-stage progress tracking.
