# DarkHub Suite v0.7.4: no telemetry, hotkeys that leave your games alone, DarkOS installation USB

This release adds four things:
- **No telemetry**: nothing leaves your PC any more.
- **Hotkeys that leave your games alone**: DarkHub's hotkeys no longer swallow keys inside games.
- **DarkOS installation USB**: DarkHub writes the installer to a USB drive by itself.
- **Color picker**: a new extension that picks colors from any monitor.

---

## Downloads

| File | Purpose |
|---|---|
| `DarkHub-Setup-0.7.4.exe` | **Installer (recommended)**. Used by the automatic updater. |
| `DarkHub.Setup.0.7.4.exe` | Same installer under the older name, for `install.ps1` from previous versions. |
| `DarkHub.0.7.4-portable.exe` | Portable, runs without installing. |
| `latest.yml` | Update metadata (installer SHA-512). |

**SHA-256**
```
b45a5a3ebde5bb7331e4a90809aba420f8513e69eda734504f4600d51a7e7b45  DarkHub-Setup-0.7.4.exe / DarkHub.Setup.0.7.4.exe
2060e907ebfd7fcc1f0692e7305b66929f3106657d6be43bca9529023753d924  DarkHub.0.7.4-portable.exe
```

**One-line install** (PowerShell as Administrator; checks the installer's SHA-512 before running it):
```powershell
irm https://raw.githubusercontent.com/Pokeralho/darkhub-suite/main/install.ps1 | iex
```

Existing users get this version through the automatic updater.

---

### 1. Nothing leaves your PC

- **Error reporting removed**: builds with a Discord webhook configured used to send crash and error reports to it.
  That is gone, along with its setting. Errors now stay in the local log.
- **Hidden machine marker removed**: it was a hardware fingerprint kept in `C:\ProgramData\DarkHub\m.dat` and in the
  registry. DarkHub deletes it on start.

### 2. Hotkeys that do not steal keys

DarkHub used Windows global shortcuts, which take the key away from every other program. Pressing F6 or F8 in a game
did nothing, because DarkHub had grabbed the key.

- **Hotkeys are now watched, not grabbed**: the auto clicker, the in-game overlay and screenshots are watched by small
  native helpers that only look at the keyboard. The game still gets the key.
- **Any key or combination**: choose a key, a combination with Ctrl, Alt, Shift or Win, or a side mouse button. Click
  the field and press it.
- **Auto clicker default changed**: it now uses Ctrl+Shift+F6 instead of the old F6. A single key still works, with a
  warning that the game also receives it.
- **Old F8 overlay removed**: the overlay is on Ctrl+Shift+F9, or any hotkey you choose.
- **Frame Pacer**: Ctrl+Shift+F (search in editors and browsers) is only taken while the Frame Pacer runs.

### 3. Create a DarkOS installation USB (DarkOS screen)

DarkHub writes the DarkOS ISO to a USB drive by itself, with no Rufus or Ventoy needed.

- **Finds the ISO**: it uses the one in Downloads, or any ISO you pick.
- **Checks it**: optionally against the SHA-256 published on darkos.darkhub.ink.
- **Safe drive list**: only USB drives of 8 GB or more appear, never the system disk.
- **Erases only after you confirm**, and checks again that the drive was not swapped before writing.
- **Boots on UEFI and BIOS PCs**: the drive gets an MBR partition table with FAT32.
- **Large images are split**: a Windows image over 4 GB is split into parts that Windows Setup reads.
- **Tested**: in a virtual machine, a drive written this way booted, and Windows Setup copied every file.

### 4. Color picker (extension "Conta-gotas")

- **Picks from any monitor**: DarkHub hides and a magnifier shows on every monitor. Arrow keys move one pixel, Enter
  picks, Esc cancels.
- **Every format**: HEX, RGB, HSL and OKLCH, with copy buttons.
- **History**: your last 24 colors are kept, and a Dashboard card is included.
- **New "screen" permission**: extensions get only the color you picked, never the screen image.
- **Version check**: packages that need a newer DarkHub are no longer installed; the preview says which version is
  needed.

### 5. In-game overlay on several monitors

- **Choose the monitor**: the game's monitor (it follows the game when you move it), the main one, the one with the
  mouse, or a fixed one.
- **Eight positions**: picked on a miniature of the screen.
- **Fine offset**: move it by X/Y pixels.

### Also

- **Browser extension 0.2.1**: it now declares to Firefox that it collects no data, and DarkHub is ready for the
  extension ids the Chrome and Edge stores will assign.
- **Release workflow on GitHub Actions**: it records build attestations, so you can check where a file came from with
  `gh attestation verify`.
- **CI fixed**: the dependency installer was missing from the repository, which broke the checks.
