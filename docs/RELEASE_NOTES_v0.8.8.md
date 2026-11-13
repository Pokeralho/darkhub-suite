# DarkHub Suite v0.8.8: the temp clean now empties the Recycle Bin

"Clean temporary files" now also empties the Recycle Bin, and Deep clean lists it as an item.

---

## Downloads

| File | Purpose |
|---|---|
| `DarkHub-Setup-0.8.8.exe` | **Installer (recommended)**. Used by the automatic updater. |
| `DarkHub.Setup.0.8.8.exe` | Same installer under the older name, for `install.ps1` from previous versions. |
| `DarkHub.0.8.8-portable.exe` | Portable, runs without installing. |
| `latest.yml` | Update metadata (installer SHA-512). |
| `SHA256SUMS.txt` | SHA-256 of every file above. |

**SHA-256**
```
a9f8dec719622600f6e05638fea30c56aa593d861dca2b593f4f8bf89accbaae  DarkHub-Setup-0.8.8.exe / DarkHub.Setup.0.8.8.exe
d7166bca34bfc03e0dc679cb26998f2673ad95aeb84e2da504895b6e1ae2a28f  DarkHub.0.8.8-portable.exe
```

This build was made on the maintainer's PC and is not code-signed, like earlier versions.

**One-line install** (PowerShell as Administrator; checks the installer's SHA-512 before running it):
```powershell
irm https://raw.githubusercontent.com/Pokeralho/darkhub-suite/main/install.ps1 | iex
```

Existing users get this version through the automatic updater.

---

### Recycle Bin

- **Clean temporary files** (System Optimizer, and the clean button on the Dashboard) now also empties the Recycle
  Bin of every drive. It is measured before and after through Windows itself, so the space shown as freed is real,
  and the result says how many items left the bin (or that it was already empty).
- The Dashboard's junk estimate now includes what is in the Recycle Bin, so it matches what the clean removes.
- **Deep clean** lists the Recycle Bin as a built-in item, selected by default, with a warning that emptying it is
  permanent.
- Emptying the Recycle Bin cannot be undone, so it only happens when you click. Scheduled maintenance, Hub packages
  and the privacy clean leave it as it is.
