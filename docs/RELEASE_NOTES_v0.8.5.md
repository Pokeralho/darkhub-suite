# DarkHub Suite v0.8.5: partitioning and a working temp cleanup

This release adds partitioning to Disk Studio, makes the dashboard temp cleanup actually show what it removed, and fixes
the defects found by a full audit of every screen in a test virtual machine.

---

## Downloads

| File | Purpose |
|---|---|
| `DarkHub-Setup-0.8.5.exe` | **Installer (recommended)**. Used by the automatic updater. |
| `DarkHub.Setup.0.8.5.exe` | Same installer under the older name, for `install.ps1` from previous versions. |
| `DarkHub.0.8.5-portable.exe` | Portable, runs without installing. |
| `latest.yml` | Update metadata (installer SHA-512). |
| `SHA256SUMS.txt` | SHA-256 of every file above. |

Every file has a build attestation: `gh attestation verify <file> --repo Pokeralho/darkhub-suite`.

---

### Partitioning (Disk Studio)

- New **Partitioning** tab: create, delete, shrink, extend, format (NTFS, exFAT, FAT32), change the drive letter, and
  initialize a blank disk as GPT. It uses the Windows Storage module, never `diskpart`.
- Every operation shows the disk **before and after**, and runs only after you type the disk's name. Delete and format
  also ask you to confirm the data loss. The partition table is saved first, so a deleted partition can be brought back
  from the HeaderGuard tab while nothing is written over it.
- **What it refuses, with no way around it**: the disk with Windows, any disk with an EFI (boot) partition, volumes in
  use, volumes with BitLocker (or whose BitLocker state cannot be read), the page file volume, the volume DarkHub runs
  from, dynamic disks and Storage Spaces. Before writing, the operation checks the disk again; if anything changed after
  the preview, nothing is written.
- Resizing works on NTFS only and cannot be cancelled. A power cut while resizing can corrupt the volume.

### Temp cleanup on the dashboard

- The **Estimated junk** card now measures exactly the folders the cleanup empties, and drops to what is left right
  after cleaning. Before, it read other folders and kept the old number for a minute, so cleaning looked like it did
  nothing.
- Installer leftovers with "amd64" in the name (Visual C++ logs, for example) were never removed. They are now.
- After cleaning, the dashboard says how many files were removed, how much space was freed, and what stayed because it
  was in use. The button no longer mentions the Recycle Bin, which it never emptied.

### Other fixes

- Error messages from the power plan settings and the GPU name in DLSS Manager showed broken accents ("configura��o").
- "Keep all cores active" could not be undone when the power plan used the Windows default.
- Recent activity on the dashboard showed "NaN d" as the time.
- The Windows repair button reported success even when the repair did not start.
- The disk engine no longer needs the Visual C++ runtime, so Disk Studio works on a clean Windows install.
- Updater: when an update offer carries no checksum (always the case in the portable build), the fallback now reads the
  one GitHub publishes for that version instead of refusing the update.
