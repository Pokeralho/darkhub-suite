# DarkHub Suite v0.7.1: Windows components, drivers, overlay and save backups

This release is about making a freshly formatted PC (DarkOS or plain Windows 11) usable in minutes. It adds:
- one-click restore of Windows components that custom ISOs remove;
- automatic driver installation;
- an installer that brings its own dependencies.

It also adds six new screens and rebuilds many existing tools.

---

## Downloads

| File | Purpose |
|---|---|
| `DarkHub-Setup-0.7.1.exe` | **Installer (recommended)**. Used by the automatic updater. |
| `DarkHub.Setup.0.7.1.exe` | Same installer under the older name, for `install.ps1` from previous versions. |
| `DarkHub.0.7.1-portable.exe` | Portable, runs without installing. |
| `latest.yml` | Update metadata (installer SHA-512). |

**SHA-256**
```
4436ca2669cef0540404a401ed9ec1b4c70263a5fa9cf08a58f79f909a530246  DarkHub-Setup-0.7.1.exe / DarkHub.Setup.0.7.1.exe
7010522586aab9393f6b0f1252d3ed4c197e310a3c33df4a6e3ce6fbfbbd2952  DarkHub.0.7.1-portable.exe
```

**One-line install** (PowerShell as Administrator; checks the installer's SHA-512 before running it):
```powershell
irm https://raw.githubusercontent.com/Pokeralho/darkhub-suite/main/install.ps1 | iex
```

Existing users get this version through the automatic updater.

---

### 1. Restore Windows components (Post-Install Hub > Restore Windows components)
Custom ISOs remove programs that are hard to bring back by hand. This tab lists what is missing and restores each one with one click, through Microsoft's official route. Afterwards it reads the state back, so "restored" means really installed.

- **Media:**
  - legacy Windows Media Player and Media Features;
  - the new Media Player, Photos and Camera;
  - the AV1, VP9, HEIF, Web Media and RAW codecs.
- **Apps:** Calculator, Notepad (new and classic `notepad.exe`), Paint, Snipping Tool, Terminal, Clock and Sticky Notes.
- **Gaming:** Xbox, Xbox Game Bar, Xbox Identity Provider (sign-in for Microsoft games) and DirectPlay.
- **System:**
  - the Microsoft Store and winget itself (official GitHub release, SHA-256 pinned);
  - .NET Framework 3.5, Print to PDF, PowerShell ISE, WMIC, Fax and Scan, OpenSSH and Windows Sandbox.
- **Where each one comes from:**
  - Windows features come from Windows Update. Windows Update is unlocked only during the job and put back exactly as it was.
  - .NET 3.5 can also come **offline from a mounted Windows ISO**.
  - Store apps are installed through winget, without opening the Store.
- **Restore all missing** installs winget first, because the Store apps depend on it.
- Windows Update items can take 10 to 30 minutes, and the screen says so. Items that need a restart show "Restart Windows to finish".

### 2. Driver Center installs drivers
DarkOS starts on the generic Microsoft display driver. The Driver Center now:
- finds the GPU and every device without a driver;
- gets the drivers from Windows Update (temporarily re-enabled on DarkOS and restored after) or from NVIDIA, AMD and Intel official sources (signature checked);
- creates a restore point first, with progress and a log on screen.

### 3. Installer and administrator mode
- **DarkHub runs as administrator.** When opened without it, DarkHub asks UAC to reopen elevated. If you decline, you can retry, continue with limited features, or quit.
- **The installer sets up the dependencies:**
  - **PawnIO** (driver for the advanced sensors such as CPU temperature) and **ClamAV 1.5.4** (open-source antivirus).
  - Both are downloaded from their official sources and checked against pinned SHA-256 hashes. PawnIO is also checked by its digital signature.
  - A failure never blocks the DarkHub install.
  - The ClamAV signatures download in the background on first start.

### 4. New screens
- **Startup manager:**
  - Run keys, Startup folders, logon tasks and auto-start services;
  - enable/disable exactly like Task Manager;
  - the real boot delay of each app, read from Windows' boot performance log;
  - change history with undo.
- **Before/after benchmark:**
  - CPU, memory, timer precision and disk;
  - it only reports a change when the change is larger than the measured run-to-run variation, so noise is not sold as a gain.
- **In-game overlay:**
  - FPS, 1% low and frame-time graph (Intel PresentMon);
  - CPU/GPU load, temperatures, VRAM and power;
  - shortcut `Ctrl+Shift+F9`, session log to CSV.
- **Game save backup:**
  - save locations for 22,000+ games (Ludusavi manifest, PCGamingWiki data);
  - versioned backups and safe restore;
  - automatic backup when a Library game closes.
- **USB ports:**
  - devices per port with their real names;
  - turn a device off without unplugging it (keyboards and mice come back after 20 s unless confirmed);
  - block USB storage, read-only flash drives, safe eject and device history.
- **Scheduled maintenance** (off by default): temp cleanup, save backups, security lists, ClamAV signatures and winget updates on a schedule.

### 5. Rebuilt tools
- **Advanced Security:** real, reversible protections:
  - community blocklists (hosts and firewall);
  - malware hash lists feeding real-time protection;
  - Windows hardening;
  - protective DNS (Quad9, Cloudflare, AdGuard).
  - Hosts blocking is capped at 10,000 entries: in tests, larger lists stalled Windows DNS for minutes.
- **Password vault:**
  - browser extension for Chrome, Edge and Firefox;
  - transfer between PCs through Susuya with a one-time key;
  - stronger key derivation.
- **Developer Tools:** 13 tools, including a two-way unit converter, a screen Color Picker, a regex tester and a JWT decoder.
- **Text Editor runs code:** JavaScript, PowerShell and Batch always; Python, C, C++, C#, Java, Go and Rust when installed.
- **Decryption:** classic ciphers, AES-256-GCM, hashes and HMAC, format identification.
- **Metadata editor:** images, audio, video, PDF and Office files; every write is read back before it replaces the file.
- **PowerShell Tools:** 20 configurable tools plus a custom script runner, with export to CSV/JSON/TXT.
- **Network & Latency:** latency monitor, per-hop traceroute, real MTU discovery, bufferbloat grade, DNS benchmark and adapter tweaks.
- **Video downloader options, OCR and disk map:**
  - video downloader: formats, subtitles, SponsorBlock, chapters, trim;
  - OCR: screen area, 11 languages, offline;
  - disk map: colors by category.
- **Real-time:**
  - ClamAV installs itself when protection is turned on;
  - smart mode lowers updaters and background helpers without closing your programs.

### 6. Fixes
- **Library:**
  - games could not be saved after picking an executable;
  - covers load again;
  - re-importing no longer duplicates games;
  - launch optimizations wait for the game process.
- **USB:** the device list could drop devices.
- **Save backup:** a restore in the same second as a backup could overwrite the version being restored.
- **Optimizer:** Energy-Efficient Ethernet matched the wrong adapter setting.
- **Network:** the Winsock/TCP reset now runs elevated (it failed silently before).

---

## How this version was tested
- **481 automated tests**, no TypeScript errors. The PowerShell scripts that run elevated are checked to be ASCII and to parse cleanly.
- **DarkOS virtual machine (system-changing tests):**
  - 22 mutation tests passed: startup, USB policies, maintenance, saves, benchmark, security lists, firewall, hardening, network tweaks, drivers scan, overlay and code runner.
  - The component restorer restored for real, each item confirmed installed afterwards:
    - legacy Windows Media Player (after a restart);
    - .NET 3.5 through Windows Update;
    - Media Player, Photos, Camera and Clock.
  - Clean install of this setup: PawnIO installed and running, ClamAV installed, signatures downloaded.
  - Elevation: opened without administrator, UAC prompt, decline and retry.

## Notes
- The installer is not signed with a code-signing certificate yet, so UAC shows "Unknown publisher" and SmartScreen may warn on first run. Check the SHA-256 above.
- Restoring components needs internet, except .NET 3.5 from a mounted ISO.

Full technical list: [CHANGELOG.md](https://github.com/Pokeralho/darkhub-suite/blob/main/CHANGELOG.md)
