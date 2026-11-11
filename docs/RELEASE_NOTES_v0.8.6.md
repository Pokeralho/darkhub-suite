# DarkHub Suite v0.8.6: a working frame cap, power per connector, wall calibration

This release fixes the DarkPacer frame cap and extends it to 32-bit and OpenGL games, shows NVIDIA power per connector,
adds a wall calibration for the power estimates, and makes every sensor say where its value comes from.

---

## Downloads

| File | Purpose |
|---|---|
| `DarkHub-Setup-0.8.6.exe` | **Installer (recommended)**. Used by the automatic updater. |
| `DarkHub.Setup.0.8.6.exe` | Same installer under the older name, for `install.ps1` from previous versions. |
| `DarkHub.0.8.6-portable.exe` | Portable, runs without installing. |
| `latest.yml` | Update metadata (installer SHA-512). |
| `SHA256SUMS.txt` | SHA-256 of every file above. |

**SHA-256**
```
e3fe5c53fd12e5d65c9238562dedc1bae74d34a20a6ae95dee70f21c5d608f4e  DarkHub-Setup-0.8.6.exe / DarkHub.Setup.0.8.6.exe
4e14c79ea72cb2148646c3046df33c0bfa494d042e67bf288a8e934c254dfe5b  DarkHub.0.8.6-portable.exe
```

This build was made on the maintainer's PC and is not code-signed, like earlier versions.

---

### DarkPacer (frame limiter)

- **Fixed: the cap did not apply.** The hook lost its shared memory right after creating it, so the limit never reached
  the game.
- **32-bit games** are now supported, through a 32-bit helper. A helper or hook of the wrong kind is refused.
- **OpenGL games** are paced as well as DirectX ones.
- **If DarkHub's controller stops, the cap lifts by itself** in about 2 seconds.
- Before touching a game, DarkPacer checks it is still the same process it detected, in your session and under your
  user. **Games with anti-cheat loaded are refused**, not just the anti-cheat's own processes.
- Measured on test programs, cap at 60: 5939 fps to 60.0 (64-bit Direct3D 11), 5859 to 60.1 (32-bit), 3103 to 60.0
  (OpenGL). Not yet measured in commercial games or on Direct3D 12.

### Power per connector (NVIDIA)

- The Monitor, the power panel and the overlay show watts, volts and amps for the PCIe slot and for each power connector
  the card senses (16-pin, 8-pin, 6-pin), with a warning when a 12 V rail drops below 11.4 V.
- A card or driver that does not sense a connector shows a dash, never a zero. AMD and Intel cards are not covered.

### Sensors that say where the value comes from

- Every metric is now marked as measured (and by what), derived, estimated or unavailable, with the reason: for example
  "needs admin". A zero or a placeholder is no longer shown as a reading. The overlay log has a source column per value.

### Power panel

- **Wall calibration**: with a watt-meter, type one reading at idle and one under GPU load. DarkHub fits the part it
  cannot measure. The two readings need to be about 120 W apart for the fit to be accepted. The result is still an
  estimate, marked `*`.
- **PSU lookup**: search your power supply in the public 80 PLUS list and use its measured efficiency. The list is
  fetched when you search; nothing is bundled.

### GPU benchmark

- Ranked runs report the NVIDIA control panel settings that differ from default, as tags on the result, and time every
  segment on three clocks. Clocks that disagree send the run to review.
- The benchmark engine and the sensor helper are checked (SHA-256) before they start. An installed app refuses a
  changed file and asks you to reinstall.
