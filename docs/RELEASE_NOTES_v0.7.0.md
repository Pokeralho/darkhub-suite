# DarkHub Suite v0.7.0: Real-time, Susuya sharing and a working DLSS Manager

This release adds three new areas:
- **Real-time** optimization and protection;
- **Susuya** file sharing with native-resolution screenshots;
- a rebuilt **DLSS Manager**.

It also makes the OptiScaler Manager work again: it could never apply before.

---

## Downloads

| File | Purpose |
|---|---|
| `DarkHub-Setup-0.7.0.exe` | **Installer (recommended)**. Used by the automatic updater. |
| `DarkHub.Setup.0.7.0.exe` | Same installer under the older name, for `install.ps1` from previous versions. |
| `DarkHub.0.7.0-portable.exe` | Portable, runs without installing. |
| `latest.yml` | Update metadata (installer SHA-512). |

**SHA-256**
```
8e3a7bd2aa350ceff2efd6f6e3ea8ecff88bc4404c68eca3e7de0aef415d1eed  DarkHub-Setup-0.7.0.exe / DarkHub.Setup.0.7.0.exe
0e5c9a0990849b67f5e057d1407b2af7df4136c12ba8326fab5d311dd0c856ac  DarkHub.0.7.0-portable.exe
```

**One-line install** (PowerShell as Administrator; checks the installer's SHA-512 before running it):
```powershell
irm https://raw.githubusercontent.com/Pokeralho/darkhub-suite/main/install.ps1 | iex
```

Existing users get this version through the automatic updater.

---

### 1. Real-time (Overview > Real-time)
Both services are **off by default**. Turned on, they keep running while DarkHub is minimized to the tray.

**Real-time optimizer**
- Checks available memory every 5 seconds without starting any process.
- Under real memory pressure (below 15% available by default), it trims the memory of background programs through DarkHub's native engine. It never touches the window in focus, so a game you are playing is left alone.
  - Measured on a 32 GB PC: 15 programs trimmed, available memory went from 7.5 GB to 11.2 GB in 2.6 s.
- If a trim frees little, it waits longer before the next one (up to 60 minutes), so a PC that is simply full is not hammered.
- **Unwanted processes:** you list the apps (OneDrive, Teams, Spotify...) and choose "lower priority" or "close".
  - One native process list every 20 s costs about 15 ms.
  - Windows processes are always refused.

**Real-time protection**
- Watches Downloads, Desktop and any folder you add, through Windows change notifications (nothing polls).
- Checks only executables, scripts, archives and macro documents, and only once a download has finished.
- Each file's SHA-256 is looked up in a compact hash database: the EICAR test signature, to check that protection works, plus community rules.
  - Community rules now accept a `fileHashes` list (see SECURITY_RULES.md).
- **Optional ClamAV:** the open-source antivirus from Cisco Talos.
  - Installed from the official package; the signatures come from the official mirror (about 110 MB).
  - It scans in low-priority batches, with no resident daemon (that would keep about 1 GB in memory).
- Detections go to a quarantine (stored encoded so they cannot run) with restore and delete, and show a Windows notification.
  - A restored file is trusted and never quarantined again.
- Shows whether Microsoft Defender is active, so DarkHub's protection complements it instead of replacing it.

---

### 2. Susuya and screenshots (Utilities & Tools > Susuya)
- **Upload to [Susuya](https://susuya.darkhub.ink)** by dropping or picking files, up to 600 MB.
  - The **direct download link** is copied when the upload finishes.
  - Links last 1, 6 or 24 hours. The active links list has copy direct link, copy page link and delete.
  - Uses the same chunked protocol as the website: 8 MB chunks, 3 in parallel, retries, and cleanup on cancel.
  - Tested on the live service: 20 MB in 1.2 s, the download identical byte for byte, and the link gone after delete.
- **Native-resolution screenshots:**
  - the monitor under the mouse at its physical pixel size (a 4K monitor at 150% scaling gives 3840x2160), saved as lossless PNG;
  - **global shortcut** `Ctrl+Shift+F12` (configurable), optional upload to Susuya with the direct link copied, and the image copied to the clipboard.
  - **Works in exclusive-fullscreen games.** Tested with a D3D11 test program that owns the monitor in exclusive mode (`SetFullscreenState`): the shortcut produced a 2560x1440 capture with the exact frame and no black image.

---

### 3. DLSS Manager (rebuilt)
**Update every game's DLSS**
- Finds `nvngx_dlss.dll` (DLSS), `nvngx_dlssd.dll` (Ray Reconstruction) and `nvngx_dlssg.dll` (Frame Generation) in your Steam games or in any folder.
- Replaces them with **NVIDIA's newest build (310.9.16)**, taken only from NVIDIA's official SDK repository.
  - Each DLL must be a 64-bit image with a valid NVIDIA digital signature, or it is discarded.
- The game's own file is kept and comes back with "Restore original".
- Games with an anti-cheat folder are left out of "update all".
- Tested with a real older DLSS: 310.9.0 updated to 310.9.16 in 2.4 s and restored afterwards.

**DLSS 5 neural rendering**
- Brought to games that do not ship it through **DLSS 5 Autopilot** (open source, MIT).
  - It picks the right route for each game (OptiScaler, ReShade add-ons, bridge, feeder, RTX Remix) and can remove everything again.
  - DarkHub installs its official release (SHA-256 checked) and opens it.
- The screen shows what your card can do: RTX 50 at full speed, RTX 40 moderate, RTX 20/30 heavy, others not supported.

**Removed**
- The previous DLSS 5 installer never enabled DLSS 5:
  - its OptiScaler.ini used sections and values OptiScaler does not have;
  - its eight "routes" all installed the same thing;
  - every card got the RTX 20/30 neural build.
- Games set up with it can be restored from the screen.

---

### 4. OptiScaler Manager
- **It could never apply:** it looked for a pinned OptiScaler folder that is not shipped with DarkHub.
  - It now downloads the **official latest release** (v0.9.4), SHA-256 checked, on first use.
  - The screen shows the installed version, with a one-click update.
- **Frame generation:** FSR Frame Generation (any GPU, DX12) or XeSS Frame Generation.
  - The game's own DLSS-G or FSR 3 frame generation is used as the source when the game has one.
- Every setting DarkHub writes is checked by a test against the real OptiScaler 0.9.4 ini, for every preset, input, frame generation mode and GPU.
- Refuses folders that still have an old DarkHub DLSS 5 install, so the two never overwrite each other.

---

### 5. Other changes
- **Driver Center:** shows the graphics card's maker (ASUS, MSI, Gigabyte, Sapphire...), read from the PCI subsystem ID Windows reports.
- **Archives:** extraction failed on PCs with Git in PATH, because Git's `tar` reads `C:` as a remote host. Windows' own `tar` is now used by absolute path (file converter, OptiScaler, DLSS 5 Autopilot).
- **GPU detection:** no longer reports an RTX card when Windows cannot identify the GPU.
- **Developer tools:** self-test screenshots are now correct when another window covers the test window, and the dev server no longer crashes on locked files in `scratch/`.

---

## How this version was tested
- **195 automated tests**, no TypeScript errors. The tests include:
  - real file-system watching with quarantine;
  - a local Susuya server with a failing chunk and cancel;
  - the DLSS updater against fake game folders;
  - OptiScaler ini keys checked against the real file.
- **Self-test with the real backend:** 81 read channels and functional scenarios OK; **all 35 screens** opened with no console, IPC or alert errors.
- **Real hardware (RTX 5060, Windows 11):**
  - screenshot in exclusive fullscreen, through the global shortcut;
  - Susuya upload, download and delete on the live service;
  - DLSS update and restore with NVIDIA's signed DLLs;
  - DLSS 5 Autopilot install;
  - OptiScaler official release download and apply;
  - real memory trim.
- **Clean VM:** ClamAV installed with winget, signatures downloaded, EICAR detected. The 0.7.0 installer was installed and opened twice with the Downloads folder redirected to a missing drive: no error dialog, no feature failing to start.

## Notes
- The installer is not signed with a code-signing certificate yet, so SmartScreen may warn on first run. Check the SHA-256 above.
- Online games with an anti-cheat can flag swapped DLLs: use the DLSS update and DLSS 5 in offline games.

Full technical list: [CHANGELOG.md](https://github.com/Pokeralho/darkhub-suite/blob/main/CHANGELOG.md)
