# DarkHub Suite v0.8.3: correct Vcore in the overclocker overlay

This release fixes the CPU voltage shown by the in-game overlay on AMD Ryzen PCs.

---

## Downloads

| File | Purpose |
|---|---|
| `DarkHub-Setup-0.8.3.exe` | **Installer (recommended)**. Used by the automatic updater. |
| `DarkHub.Setup.0.8.3.exe` | Same installer under the older name, for `install.ps1` from previous versions. |
| `DarkHub.0.8.3-portable.exe` | Portable, runs without installing. |
| `latest.yml` | Update metadata (installer SHA-512). |

**SHA-256**
```
cce3ce559b32b512532b7bc5b663d512e4abf3cfa640f711d9eb14a9f75ccbe0  DarkHub-Setup-0.8.3.exe / DarkHub.Setup.0.8.3.exe
1fef95d2b806399961aaabbb3500b8e3fdf0f8a811b19fbc11bf9262d6d34838  DarkHub.0.8.3-portable.exe
```

**One-line install** (PowerShell as Administrator; checks the installer's SHA-512 before running it):
```powershell
irm https://raw.githubusercontent.com/Pokeralho/darkhub-suite/main/install.ps1 | iex
```

Existing users get this version through the automatic updater.

---

### In-game overlay: real Vcore on AMD Ryzen

- **The bug**: the overclocker overlay showed Vcore stuck at **1.550 V** on Ryzen boards. That is not a voltage. 1.55 V
  is the "no data" code of AMD's SVI2 telemetry, which the sensor library reports when it cannot read the value. It
  happened with and without administrator rights.
- **Now**: that value is ignored, and the overlay shows the highest voltage the cores request (core VID). On a Ryzen 7
  5700 under load that is about 1.35 V. A real SVI2 reading still comes first. When nothing can be read, the overlay
  shows a dash instead of a made-up number.
- **Reminder**: CPU temperature, clock and power need DarkHub to run as administrator, which the installed app always
  does. Without it, those fields show a dash.
