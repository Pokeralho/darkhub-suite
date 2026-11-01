# DarkHub Suite v0.8.2: area screenshots on any monitor

This release fixes area screenshots on PCs with more than one monitor.

---

## Downloads

| File | Purpose |
|---|---|
| `DarkHub-Setup-0.8.2.exe` | **Installer (recommended)**. Used by the automatic updater. |
| `DarkHub.Setup.0.8.2.exe` | Same installer under the older name, for `install.ps1` from previous versions. |
| `DarkHub.0.8.2-portable.exe` | Portable, runs without installing. |
| `latest.yml` | Update metadata (installer SHA-512). |

**SHA-256**
```
883d8f7892bb99270801726c548913a76229dce0b27a94e3553992d1983229ac  DarkHub-Setup-0.8.2.exe / DarkHub.Setup.0.8.2.exe
c0fb21b9f217eb1c9d15776344fb31265b8097813a8a3a218447e305b304780e  DarkHub.0.8.2-portable.exe
```

**One-line install** (PowerShell as Administrator; checks the installer's SHA-512 before running it):
```powershell
irm https://raw.githubusercontent.com/Pokeralho/darkhub-suite/main/install.ps1 | iex
```

Existing users get this version through the automatic updater.

---

### Area screenshots on any monitor (Susuya)

- **Select on any monitor**: the frozen screen now covers every monitor, like the Snipping Tool, and you select the area
  on whichever one you want. Before, it opened only on the monitor under the mouse. So the "Select area" button, and the
  hotkey with the mouse on the main screen, could never reach a second monitor.
- **Your choice is kept**: if you prefer a single monitor, pick it in "Region selection monitor". It is now remembered
  by its name and position, because Windows gives monitors new numbers after a restart and the choice used to be lost.
