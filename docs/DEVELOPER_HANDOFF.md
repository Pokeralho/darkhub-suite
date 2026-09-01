# DarkHub Suite - Developer Handoff and Architecture Guide

> Official context, architecture specification, versioning standards, and verification commands.
> Version: v0.4.5 | Repository: https://github.com/Pokeralho/darkhub-suite

---

## 1. System Overview and Architecture

DarkHub Suite is an integrated Windows 10/11 (x64) desktop application designed for operating system optimization, advanced hardware diagnostics, endpoint defensive security, upscaler management, and low-latency gaming utilities.

```
+------------------------------------------------------------------------+
|                        DarkHub Suite (v0.4.5)                          |
+-----------------------------------+------------------------------------+
|         Frontend (Renderer)       |         Backend (Electron/Main)    |
|  * React 19 + TypeScript + Vite 8 |  * Electron 41 (ESM)               |
|  * Tailwind CSS + Lucide Icons    |  * Node.js Runtime                 |
|  * i18n Engine (pt-BR / en-US)    |  * Secure IPC Handlers & Preload   |
|  * React Error Boundary System    |  * Hardware HAL & WMI Bridge       |
+-----------------------------------+------------------------------------+
|                       Native Services & Engines                        |
|  * DarkPacer (FPS Limiter DXGI)       * OptiScaler Manager (DLL Engine)|
|  * Setup Hub (Winget + Drivers)       * yt-dlp & FFmpeg Pipeline       |
|  * Ultra Low Latency (Timer 0.5ms)    * Password Vault (AES-256-GCM)   |
|  * System Optimizer & App Manager     * Network Tools & Diagnostics    |
+------------------------------------------------------------------------+
```

### Directory Structure
- `build/`: Official icons (`icon.ico`, `icon.png`) and NSIS installer configuration (`installer.nsh`).
- `docs/`: Technical documentation and interface preview assets (`preview.png`).
- `electron/`: Electron main process, IPC controllers, hardware HAL, OptiScaler manager, and native background services.
  - `electron/hal/`: Hardware abstraction layer with modular sensor daemons.
  - `electron/services/`: Optimization engines, C# frame limiter source, latency hooks, and logger.
- `src/`: React/Vite frontend source code.
  - `src/components/`: Reusable components (including `ErrorBoundary.tsx` and `HelpTip.tsx`).
  - `src/hooks/`: Reactive hooks for telemetry, sensor streams, and metrics.
  - `src/i18n/`: Internationalization dictionaries (`messages.ts`) and provider (`I18nProvider.tsx`).
  - `src/pages/`: Application modules (Home, Dashboard, SetupHub, OptiScalerManager, YoutubeDownloader, etc.).
- `install.ps1`: Silent PowerShell quick-installer.
- `package.json`: Dependency definitions, build scripts, and electron-builder NSIS settings.

---

## 2. Credentials, Repository, and Deployment

- Repository: `https://github.com/Pokeralho/darkhub-suite`
- Default Branch: `main`
- Owner: `Pokeralho`
- Target Release Tag: `v0.4.5`
- Web Installation Shortcut:
  ```powershell
  irm darkhub.ink/win | iex
  ```
  *(Proxies directly to `https://raw.githubusercontent.com/Pokeralho/darkhub-suite/main/install.ps1`)*

### Publication and Release Workflow
1. Compile production installer:
   ```cmd
   npm run build
   ```
   *(Generates `DarkHub Setup 0.4.5.exe`, `.blockmap`, and `latest.yml` in `dist_app/`)*
2. Tag creation and push:
   ```bash
   git tag -f v0.4.5
   git push origin v0.4.5 --force
   ```
3. Publish release assets to GitHub Releases API.

---

## 3. Strict Operational Guidelines

### Strict Version Control Rule
> NEVER execute `git commit` or `git push` without presenting proposed modifications and receiving explicit approval from the user.

### 1. Semantic Versioning and Conventional Commits
- Follow Semantic Versioning (`MAJOR.MINOR.PATCH`).
- Use standardized commit prefixes:
  - `feat:` New features, interfaces, or integrations.
  - `fix:` Bug fixes, stability improvements, or translation adjustments.
  - `perf:` Performance improvements, binary size reduction, or memory optimization.
  - `refactor:` Code reorganization without functional changes.
  - `chore:` Dependency updates, build script adjustments, or documentation.

### 2. Open Source Code Hygiene
- Maintain clean production code without informal comments or temporary development notes.
- Keep installation scripts clean and streamlined.

### 3. Internationalization (i18n)
- 100% of user-facing text elements must use localized dictionary keys via `t('key', 'Fallback')` in `src/i18n/messages.ts` for both `pt-BR` and `en-US`.
- Any component calling `t(...)` must declare `const { t } = useI18n();`.

### 4. Robust Defensive Architecture
- Lazy-loaded React routes must be wrapped with `<ErrorBoundary>` (`src/components/ErrorBoundary.tsx`).
- Electron IPC handlers must be enclosed in defensive `try/catch` blocks returning `{ ok: boolean, data?: any, error?: string }`.

---

## 4. Verification and Context Audit Commands

To verify and map the repository state in a new environment:

### 1. List All Tracked Source Files:
```powershell
node -e "
import fs from 'node:fs';
import path from 'node:path';

function list(dir) {
  let res = [];
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', 'dist_app'].includes(f.name)) continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) res = res.concat(list(p));
    else res.push(path.relative(process.cwd(), p));
  }
  return res;
}
const all = list('.');
console.log('Total tracked files:', all.length);
all.forEach(f => console.log(' -', f));
"
```

### 2. Verify Internationalization Completeness:
```powershell
node -e "
import fs from 'node:fs';
import path from 'node:path';

function walk(dir) {
  let res = [];
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', 'dist_app'].includes(f.name)) continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) res = res.concat(walk(p));
    else if (/\.tsx?$/.test(f.name) && !f.name.includes('I18n') && !f.name.includes('messages')) res.push(p);
  }
  return res;
}

const files = walk('src');
let errors = [];
for (const f of files) {
  const c = fs.readFileSync(f, 'utf8');
  if (/\bt\s*\(/.test(c) && !/useI18n/.test(c)) errors.push(f);
}
console.log('Components missing useI18n:', errors.length ? errors : 'None (100% verified)');
"
```

### 3. Test Full Compilation and Packaging:
```cmd
npm run build:renderer
npm run build
```
