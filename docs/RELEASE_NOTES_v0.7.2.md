# DarkHub Suite v0.7.2: Kakugan and DarkOS inside the app, RivaTuner-style overlay

This release brings two DarkHub services into the app and gives the in-game overlay technical layouts:
- **Kakugan**: manage your Steam hours/cards farm without opening the website;
- **DarkOS**: download the latest DarkOS ISO, checked against the published hash;
- **Overlay**: "Advanced" and "Overclocker" layouts in the style of RivaTuner/RTSS.

---

## Downloads

| File | Purpose |
|---|---|
| `DarkHub-Setup-0.7.2.exe` | **Installer (recommended)**. Used by the automatic updater. |
| `DarkHub.Setup.0.7.2.exe` | Same installer under the older name, for `install.ps1` from previous versions. |
| `DarkHub.0.7.2-portable.exe` | Portable, runs without installing. |
| `latest.yml` | Update metadata (installer SHA-512). |

**SHA-256**
```
1d0977ae502460ff1c0cc54a1190a5377b09633ec25b915df7d05d2cb54ab8f7  DarkHub-Setup-0.7.2.exe / DarkHub.Setup.0.7.2.exe
9948842aa4a2bb0e8e58f80c61c8454ea8ed425bc837ebf062272d8dd036c982  DarkHub.0.7.2-portable.exe
```

**One-line install** (PowerShell as Administrator; checks the installer's SHA-512 before running it):
```powershell
irm https://raw.githubusercontent.com/Pokeralho/darkhub-suite/main/install.ps1 | iex
```

Existing users get this version through the automatic updater.

---

### 1. Kakugan (Serviços DarkHub > Kakugan)
[Kakugan](https://kakugan.darkhub.ink) keeps your Steam account farming hours and cards 24/7 on a server. Now it is managed from DarkHub:
- **Sign in** with your Kakugan account. Plans, prices and the farm status come straight from the server.
- **Panel:**
  - each plan with its expiry date, hours left and accounts used;
  - each Steam account with avatar and live state (farming, connecting, paused, "playing on another PC");
  - the cards being farmed and how many are left.
- **Per account:** pause/resume, invisible mode, cards on/off (Unlimited plan), choose up to 32 games to idle (Steam search or AppID), remove.
- **Connect a Steam account by QR code**, scanned with the Steam app: no password is typed. When Steam asks for a code or password, a field appears right on the account's line.
- **Tray alerts** while DarkHub runs:
  - Steam asking for a code or a new sign-in;
  - plan ending in 3 days, or hours running out;
  - farm server down or back.

  Each alert shows once; clicking it opens the Kakugan screen.
- **Pause while you play:** a game opened from the Library pauses the farming accounts, and they resume when it closes.
- **Security:** your Kakugan session stays only in DarkHub's main process, encrypted with your Windows user's key (DPAPI). Account creation and payment stay on the website.

### 2. DarkOS (DarkOS screen)
- A new card reads the latest release from [darkos.darkhub.ink](https://darkos.darkhub.ink/releases/): today **v1.0, build 26300.9550, 6.32 GB**.
- On DarkOS it compares with your build; on plain Windows it becomes "Get DarkOS".
- **Download ISO** goes through the Download Manager and is checked against the SHA-256 the site publishes. Without a published hash the download is refused.

### 3. In-game overlay: technical layouts
On the "In-game overlay" screen, under **Layout**:
- **Compact:** the previous layout.
- **Advanced (RivaTuner style):** one colored line per component:
  - GPU load, temperature, clock and power;
  - VRAM used/total and memory clock;
  - CPU load, temperature, clock and power;
  - RAM used/total;
  - FPS, frame time, 1% and 0.1% lows, and the frame-time graph.
- **Overclocker:** everything in Advanced plus:
  - GPU voltage, % of TDP, hotspot and memory junction temperatures, fan RPM/%;
  - CPU Vcore, top core clock, busiest thread and per-thread load bars;
  - graphs of frame time, FPS, load and temperatures;
  - a session panel: average/min/max FPS, 1%/0.1% lows, worst frame, frame-time deviation (σ), stutter count, **what limits the frame rate (GPU or CPU)** and present mode.
- The data comes from the full LibreHardwareMonitor sensor tree. CPU load now comes from Windows' own counters: LibreHardwareMonitor reports 100% on every thread on recent Windows 11 builds.
- Default background is more opaque and the text has a shadow, so it reads over any game.
- The overlay is easier to find: a shortcut in the home screen's Quick Utilities and a **"Show in game"** button on the System Monitor.

### 4. Screenshots
- **Camera shutter sound** when a screenshot is saved (can be turned off). It also plays with DarkHub in the tray.
- **Clipboard choice:** the image, the Susuya link, **both** (image apps paste the picture, text fields the link) or nothing. Existing settings keep their behaviour.

### 5. Menu
- New **"Serviços DarkHub"** section: Kakugan, Susuya, LuluFlix and Juuzou.
- "Gaming & Performance" is now translated in Portuguese ("Jogos e Desempenho").

---

## How this version was tested
- **496 automated tests**, no TypeScript errors. New tests cover:
  - the Kakugan session cookie and its encrypted storage;
  - which tray alerts to send and which accounts to pause;
  - the DarkOS releases page parser;
  - the LibreHardwareMonitor reader, with the real sensor names of a Ryzen 7 5700 + RTX 5060;
  - the session statistics (lows, σ, stutters) and the overlay layouts;
  - the clipboard settings migration.
- **Against the live services:** the Kakugan status, plans and login error, and the DarkOS release with its published SHA-256.
- **Real overlay** running with PresentMon and the sensors of an RTX 5060.
  - It found and fixed the 100% CPU load misreport.
- **Every new or changed screen** opened with the real backend with no console, IPC or alert errors.

## Notes
- The signed-in part of Kakugan (panel, QR code, alerts and pause) was tested against the API code, not with a real account.
- The CPU clock, temperature and power in the overlay need the advanced sensors (PawnIO driver, installed with DarkHub) and DarkHub running as administrator, which the installed app does.
- The installer is not signed with a code-signing certificate yet, so UAC shows "Unknown publisher" and SmartScreen may warn on first run. Check the SHA-256 above.

Full technical list: [CHANGELOG.md](https://github.com/Pokeralho/darkhub-suite/blob/main/CHANGELOG.md)
