# DarkHub Suite v0.8.4: GPU benchmark, public ranking and stress test

This release adds a synthetic GPU benchmark with a public ranking, a GPU stress test, many more sensors, and fixes the
numbers of the before/after benchmark.

---

## Downloads

| File | Purpose |
|---|---|
| `DarkHub-Setup-0.8.4.exe` | **Installer (recommended)**. Used by the automatic updater. |
| `DarkHub.Setup.0.8.4.exe` | Same installer under the older name, for `install.ps1` from previous versions. |
| `DarkHub.0.8.4-portable.exe` | Portable, runs without installing. |
| `latest.yml` | Update metadata (installer SHA-512). |

**SHA-256**
```
b8f3729b83ca2fb9fa2ecc1f423dbdcd93a8b2a9ebf42d3165205fb47822fdc8  DarkHub-Setup-0.8.4.exe / DarkHub.Setup.0.8.4.exe
37021396fc9cf2b5a71a8fdcab56e9e646320bf9cba053ff0fa4cb8ba38c3f64  DarkHub.0.8.4-portable.exe
```

**One-line install** (PowerShell as Administrator; checks the installer's SHA-512 before running it):
```powershell
irm https://raw.githubusercontent.com/Pokeralho/darkhub-suite/main/install.ps1 | iex
```

Existing users get this version through the automatic updater.

---

### GPU benchmark

- **Two tests**: rasterization and ray tracing (DXR 1.1), at a fixed 2560x1440 so the load is the same on any PC. A GPU
  without DXR 1.1 runs rasterization only.
- **Inside DarkHub**: the test renders in the app window, with live FPS and progress.
- **Ranking**: connect your Hub account and submit to the public ranking on hub.darkhub.ink. The top shows in the app.
  The server computes the score itself and recomputes parts of each run. Unusual results and the top of the ranking
  are reviewed by a person. The check covers what is on screen, not the lighting, and the ranking page says so.
- **Your account**: connecting the app creates a token that only works for the benchmark. It cannot publish packages.

### GPU stress test

- 5 to 60 minutes. It checks whether performance holds when hot, and whether the GPU still calculates correctly: a fixed
  frame is redone every loop and must come out identical, so an unstable overclock shows up before it crashes.
- It stops at the temperature you choose. **That limit needs a temperature reading, which today exists only on NVIDIA**;
  on AMD and Intel the screen says the limit did not work.
- When frame rate moves but the clock holds, the result is "Inconclusive": close other programs and try again.

### Sensors

- New in the System Monitor and the overclocker overlay: accumulated energy, power limits, PCIe link and traffic, encoder
  and decoder load, throttle reasons, RAM rate, render latency, FPS per watt and joules per frame.
- Power supply load, wall power and electricity cost, from the PSU and tariff you set. These are estimates, marked `*`.
- Readings a card does not expose stay empty. Rail voltage and current, and ASIC quality, are not available.

### Before/after benchmark fixes

- **All cores** measured thread startup: it showed 2x single core on 16 threads, and now about 8x on 8 cores.
- **Single core** samples no longer vary because of a cold start.
- **RAM latency** now uses a buffer larger than the cache of X3D processors.
- **Cancel** always cleans up its temporary file and is reported as a cancel.
- These numbers changed, so comparing with a run from an older version shows a warning. Measure your "before" again.
