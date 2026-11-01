# DarkHub Suite v0.8.1: Deep clean (DarkHub Cleaner Core)

This release adds **Deep clean**, a new cleaning page with its own native engine. It cleans temporary files and
program caches, compacts the browsers' databases and finds dead registry entries. Everything starts as a simulation,
and nothing is deleted until you review the list and confirm.

---

## Downloads

| File | Purpose |
|---|---|
| `DarkHub-Setup-0.8.1.exe` | **Installer (recommended)**. Used by the automatic updater. |
| `DarkHub.Setup.0.8.1.exe` | Same installer under the older name, for `install.ps1` from previous versions. |
| `DarkHub.0.8.1-portable.exe` | Portable, runs without installing. |
| `latest.yml` | Update metadata (installer SHA-512). |

**SHA-256**
```
e20842fb5a13cb4da8a3fa3ddad67de4096549e64dbd37842e7215f706e8c5b3  DarkHub-Setup-0.8.1.exe / DarkHub.Setup.0.8.1.exe
a1d372614f8e58739dffe5073c5069122b78379a1c6e9345fce47d96b300cc04  DarkHub.0.8.1-portable.exe
```

**One-line install** (PowerShell as Administrator; checks the installer's SHA-512 before running it):
```powershell
irm https://raw.githubusercontent.com/Pokeralho/darkhub-suite/main/install.ps1 | iex
```

Existing users get this version through the automatic updater.

---

### Deep clean (Utilities)

A new page built on a native engine written in Rust. It has four tabs:

- **Files**: temporary files, Windows Update downloads, memory dumps, error reports, thumbnails, Windows logs and
  the caches of Chrome, Edge, Brave, Firefox and Zen.
  - "Analyze" is a simulation: it shows how many files and how much space each item has, with examples of what
    would be deleted. The "Clean" button only unlocks after an analysis of the same selection, and asks you to
    confirm.
  - **Secure deletion** (optional, 1, 3 or 7 passes): each file is overwritten and flushed to disk before it is
    deleted. On SSDs the drive may keep old copies in remapped blocks; the page says so.
  - Shortcuts and junctions are never followed. Shader caches (which games rebuild with stutter), browser passwords,
    keys and bookmarks are never deleted.
- **Browser databases**: compacts (VACUUM) the SQLite databases of Chrome, Edge, Brave, Firefox and Zen (history,
  favicons, cookies, forms). No data is removed. Each database is checked first, and the ones a running browser has
  open are skipped and listed.
- **Registry**: finds shared DLLs that no longer exist, App Paths of removed programs, and startup entries (Run,
  StartupApproved, Startup folder) that point to missing files. Paths on disconnected drives are not treated as
  dead.
  - Before anything is removed, a `.reg` restore file is saved to `%ProgramData%\DarkHub\Cleaner\backups` and
    checked. If the backup cannot be written, nothing is removed.
  - The page lists the backups and restores any of them with one click.
- **Definitions (winapp2.ini)**: "Update definitions" downloads the community winapp2.ini (CC BY-SA 4.0) with
  cleaning rules for thousands of programs. It only downloads when you click.
  - The file is treated as untrusted: nothing in it is executed and its registry rules are ignored.
  - Only cache, log and temporary folders in AppData, Temp, ProgramData and the Windows log folders are accepted.
    Rules that would delete a whole program folder, or that target passwords, are refused and shown as refused.
  - The version and SHA-256 of the downloaded file are shown.

### Fixes

- Developer mode (`npm run dev`) no longer stops when a native engine is rebuilt while it runs.
