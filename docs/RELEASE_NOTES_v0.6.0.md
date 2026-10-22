# DarkHub Suite v0.6.0: Frost, DarkOS Mods and real sensor data

The largest DarkHub update so far:
- a new **Frost** design, with all 30 screens reworked;
- **DarkOS mods on any Windows**;
- **WinUtil (Chris Titus) parity**, adapted;
- a native **disk map**;
- a **hardware monitor that shows only real data**, now with every LibreHardwareMonitor sensor.

It also fixes a long-standing bug: **in the installed version, the fast sensors and the DLL injector never worked**.

---

## Downloads

| File | Purpose |
|---|---|
| `DarkHub-Setup-0.6.0.exe` | **Installer (recommended)**. Used by the automatic updater. |
| `DarkHub.Setup.0.6.0.exe` | Same installer under the older name, for `install.ps1` from previous versions. |
| `DarkHub.0.6.0-portable.exe` | Portable, runs without installing. |
| `latest.yml` | Update metadata (installer SHA-512). |

**SHA-256**
```
759edcb8ff4c7467eb7c9f88bd14beefd6e06671de1ddd1b7880c9439d7178ca  DarkHub-Setup-0.6.0.exe / DarkHub.Setup.0.6.0.exe
50119987b78d0ee628429fc14524030047ad7f55c9f766072600fec2a5a10815  DarkHub.0.6.0-portable.exe
```

**One-line install** (PowerShell as Administrator). The script now checks the installer's SHA-512 before running it:
```powershell
irm https://raw.githubusercontent.com/Pokeralho/darkhub-suite/main/install.ps1 | iex
```

Existing users get this version through the automatic updater, which also checks the SHA-512 of the download.

Requirements: Windows 10 or 11, 64-bit. DarkHub runs as administrator.

---

### 1. New design: Frost
- A new identity derived from the brand mark: cold neutrals, a single glacial-blue accent, and the Geist and Geist Mono fonts.
- **125 custom icons** replace the generic icon library.
- Redesigned shell:
  - sidebar with an active indicator;
  - keyboard navigation (Up, Down, Home, End);
  - visible focus.
- **All 30 screens reviewed**:
  - one primary action per screen;
  - loading, empty and error states everywhere;
  - no shouting uppercase labels and no "hype" pills.
- Each screen has its own error boundary: if one module fails, the rest of the app keeps working.
- Pages open scrolled to the top. LuluFlix and Juuzou now fill the window (they were capped at 420 px).

---

### 2. DarkOS Mods on any Windows
- On a stock Windows, the DarkOS screen becomes **DarkOS Mods**: the **167 tweaks of the DarkOS image**, one by one.
  - Gaming and latency come first.
  - They can also be applied per category or by profile: **Balanced**, **Competitive gaming** or **Maximum performance**.
- Same engine as DarkOS:
  - the original value is saved;
  - it is read back to confirm the change;
  - undo is verified;
  - snapshots and "restore everything".
- Tweaks Windows already has are shown as **"Already active"**. Services and tasks that do not exist on that Windows are shown as such, instead of an "Apply" button that does nothing.
- DarkOS engine (module v3): protected services such as Delivery Optimization (DoSvc) are now configured through the registry instead of failing.
- DarkOS Center: status loads in **about 5 s instead of 26 s**.

---

### 3. Optimizer: everything from WinUtil, adapted
**31 new tweaks**, all with a snapshot, verification and undo:
- **Gaming and network**:
  - MPO off;
  - prefer IPv4, or turn IPv6 off (these are alternatives: applying one undoes the other first, so undo restores the real original value);
  - Teredo off.
- **Power**: no network in Modern Standby; S3 sleep.
- **Privacy and anti-bloat**:
  - no Store results in Start search;
  - notifications off;
  - block the Razer Synapse and Logi Download Assistant auto-install (without turning off Windows Update drivers);
  - WPBT off;
  - Brave debloat;
  - keep classic Outlook.
- **Storage**: Storage Sense and Reserved Storage off.
- **System**:
  - long paths;
  - registry backup;
  - detailed blue screen;
  - verbose logon;
  - F8 boot menu;
  - NTP pool;
  - no warning for unsigned .rdp files.
- **Interface**:
  - Explorer Home and Gallery off;
  - no folder-type detection;
  - previous Start menu;
  - lock screen off;
  - battery percentage;
  - scrollbars always visible;
  - Snap off;
  - Num Lock on at startup.

**New "Windows Features & Repairs" tab**:
- Features with their real state: WSL, Virtual Machine Platform, Hyper-V, Sandbox, .NET 3.5, legacy media, NFS and OpenSSH server.
- Repairs:
  - Windows Update reset;
  - winget repair;
  - component store cleanup, without `/ResetBase`.
- Advanced actions:
  - autologon through netplwiz;
  - remove or reinstall Edge;
  - turn BitLocker off.
- 19 shortcuts to classic Control Panel and MMC tools.

**Also in the Optimizer:**
- Scripts too long for the Windows command line now run from a private temporary file. This had broken the status read of every tweak.
- The "Ultimate Performance" power plan no longer fails when it already exists.
- Fixed the CPU core unparking check.

---

### 4. Hardware monitor: real data only
- New **All sensors** tab, HWMonitor style:
  - everything LibreHardwareMonitor reads, per component: temperatures, voltages, power, clocks, utilization, fans, memory and SMART;
  - session min and max, with a filter.
- **Advanced sensors** (LibreHardwareMonitor):
  - the **PawnIO** driver is installed automatically when you turn them on: official 2.2.0 release, pinned SHA-256, digital signature checked, silent install;
  - with it, DarkHub reads each core's temperature, the fans and the motherboard voltages;
  - WinRing0 was rejected because it is on Microsoft's vulnerable-driver blocklist.
- **GPU per adapter** (DXGI): integrated and dedicated GPUs are no longer merged into "GPU 1", and VRAM matches Windows Performance Monitor.
- **Disk active time** matches Task Manager.
- **Made-up values removed**:
  - disk activity estimated against 7000 MB/s;
  - the CPU temperature shown as the GPU's;
  - "SMART OK" without data;
  - "0 B" of junk when the scan failed;
  - physical cores guessed as threads / 2;
  - the ACPI zone presented as the CPU temperature;
  - 16 °C added to the ACPI zone.
- Anything that cannot be read is shown as **"unavailable"**, never as a "measured" 0.
- Without administrator rights, the placeholder values the driver returns are hidden, and the screen explains why.
- On Home, memory shows **actual usage** (the same number as Task Manager), refreshed every 3 s.
- **Lighter**:
  - the PowerShell daemon no longer repeats what the native daemon already reads;
  - about 200 lines of duplicate fallback removed;
  - measured cost: about 0.1% CPU (advanced sensors: +0.06% and 44 MB).
- **Critical fix**: in the installed version, the native sensor daemon (disk, network, GPU, DPC) and the DLL injector tried to run from inside the `app.asar` package and never started. They now run from `app.asar.unpacked`.

---

### 5. Disk map (new screen)
- Replaces the SpaceSniffer replica, which showed sample data and launched an executable that was not shipped.
- **Native multi-threaded scan** (`DarkHub.DiskScan.exe`): a full C: drive (about 790k files) in **4 to 8 s**, without following junctions or links.
- The map updates live during the scan.
- Filters by name, size, age, folder, type, tags and attributes, run over the whole tree in about 0.3 s.
- Side panel for the selected item:
  - open;
  - show in Explorer;
  - copy path;
  - tags;
  - **move to Recycle Bin** (with confirmation).
- TXT and CSV reports, plus free and "not visible" space per drive.

---

### 6. Post-Install Hub
- New categories with open-source alternatives:
  - **Office/PDF**: LibreOffice, ONLYOFFICE;
  - **Image**: GIMP, Inkscape, darktable;
  - **Video**: Kdenlive;
  - **Audio**;
  - **3D/CAD**: Blender, FreeCAD.
- The **"Craft"** apps (PhotoCraft, WordCraft, GridCraft..., marked alpha) and **O&O ShutUp10++**.
- Apps from GitHub are downloaded from their official releases **with the SHA-256 checked**.
- **Categories are collapsed by default**, with a preview of their apps. Search opens the categories that match, and there is an "Expand all / Collapse all" button.
- 19 winget IDs that no longer existed were fixed. Macrium Reflect Free (discontinued) was removed.

---

### 7. Driver Center and other fixes
- **Startup hardening** (updated build of 0.6.0): on some PCs the app failed to open and a second launch showed "Cannot access 'mainWindow' before initialization". Each feature now registers in isolation (a failure is logged, never fatal), and an unresolvable Downloads folder falls back to the profile folder.
- GPUs running on **Microsoft's generic display driver** are identified by vendor, with a direct link to the official app. Home shows a notice when this happens.
- **Camera and screen-capture check and repair**:
  - services;
  - privacy policies;
  - UVC driver reinstall;
  - ghost USB device cleanup.
- Drag and drop works again in the File Converter and DLSS 5.
- Archiving in the File Converter no longer fails.
- Steam games are no longer duplicated, and the right executable is picked (e.g. Deadlock).
- HAGS no longer shows "Unavailable" until the GPU tab is opened.
- The Dashboard no longer says "Optimal" next to a red security score.
- Ultra Low Latency accepts a bare F-key.
- 12 strings missing from the English UI were added.

---

### 8. Installation and repository
- `install.ps1` now:
  - checks the installer's **SHA-512** before running it;
  - checks the installer's exit code;
  - stops the new helpers before installing.
- New GitHub Actions CI (type check, tests, build), Dependabot and a security policy (`SECURITY.md`).
- Updated README.

---

## How this version was tested
- **176 automated tests** and no TypeScript errors.
- **Self-test with the real backend** on a real machine:
  - 81 read channels and functional scenarios OK;
  - **all 33 screens** opened with no console, IPC or alert errors.
- Everything that changes the system was **applied, verified and reverted on a DarkOS/Windows VM**:
  - 30 of the 31 WinUtil tweaks (Windows refuses Reserved Storage while an update is pending);
  - every feature and repair;
  - DarkOS mods in Windows mode;
  - the automatic PawnIO install.
- Static security scan with no real findings.

## Notes
- The installer is not yet signed with a code-signing certificate, so SmartScreen may warn on first run. Check the SHA-256 above.
- CPU temperatures, fans and voltages need the PawnIO driver and DarkHub running as administrator (the default for the installed version).

Full technical list: [CHANGELOG.md](https://github.com/Pokeralho/darkhub-suite/blob/main/CHANGELOG.md)
