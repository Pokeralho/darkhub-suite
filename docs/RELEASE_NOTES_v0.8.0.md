# DarkHub Suite v0.8.0: Disk Studio & Rescue, AI-enhanced screenshots, Windows Update diagnosis

This release adds four things:
- **Disk Studio & Rescue**: repair wiped partition tables, recover deleted files, clone disks and look at raw sectors, with a new native engine.
- **AI-enhanced screenshots**: game screenshots you can zoom into without seeing pixels, made on your graphics card and offline.
- **Sharper screenshots on any monitor**: pick the monitor, capture all of them at once, and small areas stay crisp.
- **Windows Update diagnosis**: finds out why Windows Update does not download, and says what to do.

---

## Downloads

| File | Purpose |
|---|---|
| `DarkHub-Setup-0.8.0.exe` | **Installer (recommended)**. Used by the automatic updater. |
| `DarkHub.Setup.0.8.0.exe` | Same installer under the older name, for `install.ps1` from previous versions. |
| `DarkHub.0.8.0-portable.exe` | Portable, runs without installing. |
| `latest.yml` | Update metadata (installer SHA-512). |

**SHA-256**
```
23ede8a24a2d26ba9917b18909a1b37fa5e7b78f4fcd88a827efbfbdcaeecf69  DarkHub-Setup-0.8.0.exe / DarkHub.Setup.0.8.0.exe
f416cae313dc0c60fa2d3012a51a7f8ba2ad811fea1a43d086f8a010081d61c8  DarkHub.0.8.0-portable.exe
```

**One-line install** (PowerShell as Administrator; checks the installer's SHA-512 before running it):
```powershell
irm https://raw.githubusercontent.com/Pokeralho/darkhub-suite/main/install.ps1 | iex
```

Existing users get this version through the automatic updater.

---

### 1. Disk Studio & Rescue (Utilities)

A new page for working directly on disks, built on a native engine written in Rust that talks to the drive through
Windows itself (no PowerShell in the middle). It works with 512-byte and 4K-sector disks.

- **Health and partitions**: a map of the disk drawn to scale, the state of the partition tables, SMART counters and a
  read-only surface test that times every block and marks slow or unreadable areas.
- **HeaderGuard (anti-wiper)**: wiper malware and power losses usually destroy only the start of a disk.
  - A wiped GPT is rebuilt from the copy GPT keeps at the end of the disk, with both checksums recomputed.
  - Lost NTFS, FAT and exFAT volumes are found even when their first sector is gone, through the copy NTFS keeps at
    the end of each volume, and the MBR is rebuilt from them.
- **DiskEditor**: a sector viewer like a hex editor, with the MBR, GPT and boot sector fields decoded.
- **Deep Carving**: recovers deleted photos, documents, archives, databases and videos (JPEG, PNG, GIF, BMP, HEIC, PDF,
  DOCX, XLSX, PPTX, ZIP, 7z, SQLite, MP4, MOV) by their signatures. Each file gets its real size, read from the file's
  own structure.
- **Cloning and images**: disk to disk, partition to partition, disk or partition to an image file, and back.
  - Bad sectors do not stop the copy: they are filled with zeros and listed.
  - The copy is checked with SHA-256.
  - On a larger target disk, the partition table is moved to the new end.
- **Safety on every write**:
  - You see exactly which bytes change before anything is written.
  - The sectors about to be overwritten are saved to a backup file first, which you can restore.
  - You type the disk number to confirm.
  - The Windows disk and the disk holding the boot partition are always refused.

### 2. AI-enhanced screenshots (Susuya)

A screenshot holds only the pixels the screen showed, so zooming into a game shot shows squares. DarkHub can now
rebuild edges and textures at a higher resolution with AI (Real-ESRGAN).

- **On your graphics card, offline**: it works on NVIDIA, AMD and Intel and comes inside the installer. Nothing is
  downloaded and nothing leaves your PC.
- **Never slows the shot**: the screenshot is copied and saved at once. The enhanced version replaces it a few seconds
  later as `name_ultra.png`, and it is the one uploaded when auto-upload is on.
- **Your choice**:
  - Area selections only (the default), every screenshot, or off.
  - "Fast" (a few seconds) or "maximum" (sharper, but slow while a game uses the graphics card).
  - Realistic games and photos, or anime and stylised games.
- **Any older screenshot**: the "Enhance with AI" button in the recent screenshots list.
- **What it is**: the AI recreates plausible detail; it does not reveal what the screen did not show. The original is
  always kept.

### 3. Sharper screenshots, on any monitor

- **Choose the monitor**: separately for full-screen shots and for area selection. The options are the one under the
  mouse, the primary, a specific monitor, or all monitors in one image at their real positions.
- **Small areas stay crisp**: a small crop gets blurry when Discord or a viewer stretches it. DarkHub now enlarges small
  selections 2x to 4x, keeping every screen pixel a sharp square, or smoothly for photos.
- **Magnifier**: the area selector shows the real pixels at 10x with their coordinates, so the edge of small text is
  easy to hit.

### 4. Windows Update diagnosis

Found in Optimizer > Windows tools, and in the Driver Center when a driver from Windows Update fails. It is a
read-only check of what stops Windows Update from downloading:

- disabled or missing services;
- policies that block updates, and WSUS;
- hosts file redirects;
- a DNS that does not resolve, or answers 0.0.0.0;
- blocked ports 443 and 80;
- a proxy;
- a wrong clock;
- low disk space;
- firewall blocks;
- DarkHub's own IP blocking catching an update server.

Each problem comes with what to do. "Reset Windows Update" now also turns disabled update services back on.

### Fixes

- **Driver Center**: a failed Windows Update driver showed only "80240022". It now shows the real error with a plain
  explanation, and it retries once in a mode that gets through more networks.
- **Post-Install Hub**: apps like Google Chrome failed with "Installer hash does not match" when the vendor updated the
  installer before winget did. DarkHub now downloads the installer from the vendor's official address and runs it
  only with a valid signature from the same publisher.
- **Post-Install Hub catalog**: new "Cloud & Sync" category (Google Drive, Dropbox, OneDrive, MEGA), plus Microsoft
  Teams and Signal.
- **Accents**: names read from Windows (devices, update titles) no longer arrive broken.
- **Update notes**: they now show with headings, lists and links instead of raw text.
- **Susuya website**: the 1, 6 or 24 h choice now comes before you drop a file. Choosing 24 h after the upload had
  started had no effect.
