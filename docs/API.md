# DarkHub IPC Bridge API Reference

The Renderer process accesses backend capabilities via `window.darkhub`.

## 1. `darkhub.system`
- `getInfo()`: Returns hardware specifications (CPU model, core count, RAM, GPU, Windows build).
- `getMetrics()`: Returns real-time CPU, RAM, and disk utilization.

## 2. `darkhub.optimizer`
- `listOperations()`: Returns available optimization and debloat modules.
- `runOperations(ids: string[])`: Executes selected optimizations.
- `rollback(ids: string[])`: Restores previous registry and service configurations.

## 3. `darkhub.security`
- `getShieldStatus()`: Returns active DNS sinkhole and anti-phishing protection state.
- `setShield(enabled: boolean)`: Enables or disables the Windows hosts DNS sinkhole.
- `scanUrl(url: string)`: Runs heuristic analysis against a target URL (punycode, typosquatting, lure terms).
- `getListeningPorts()`: Audits active listening TCP/UDP ports and associated processes.
- `getCommunityRules()`: Fetches configured community threat indicators.
- `importCommunityRules(rules: object)`: Imports and applies new threat rule definitions.

## 4. `darkhub.updater`
- `getStatus()`: Returns current version, update state, and release metadata.
- `check()`: Queries GitHub for available updates.
- `download()`: Initiates download of the latest release package.
- `install()`: Executes silent installation and relaunches the application.

## 5. `darkhub.framePacer`
- `start(config: { targetFps: number, pacingMode: string })`: Starts the frame rate limiter.
- `stop()`: Stops the frame limiter.
- `toggleOverlay()`: Displays or hides the real-time frametime oscilloscope overlay.

## 6. `darkhub.window`
- `minimize()`, `maximize()`, `close()`: Manages main window state.
