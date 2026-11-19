# GPU harness (real-hardware checks for the native graphics code)

Test programs that exercise `native_lowlatency` (Vulkan layer), `native_pacer` (DarkHub.PacerHook) and
`DarkHub.GpuBench.exe` on the local GPU. They only ever touch processes they start themselves: no game is launched,
nothing is injected into anything else, no admin rights or registry writes are needed. Windows are small (320x240,
GpuBench moved to 480x270) and close by themselves.

## Build

```
cargo build --release --manifest-path tools\gpu-harness\vk_harness\Cargo.toml
cargo build --release --manifest-path tools\gpu-harness\dxgi_harness\Cargo.toml
cargo build --release --manifest-path tools\gpu-harness\dxgi_harness\Cargo.toml --target i686-pc-windows-msvc
```

## 1. Vulkan layer: `run_vk.ps1`

```
powershell -NoProfile -ExecutionPolicy Bypass -File tools\gpu-harness\run_vk.ps1 [-Frames 2000] [-Only <regex>] [-LayerSource <dir>]
```

Copies `electron\services\lowlatency` (DLL + manifest) to a temp folder and loads it through the loader's
`VK_ADD_IMPLICIT_LAYER_PATH`, switched on by the manifest's `LOW_LATENCY_LAYER=1` and, for reflex mode,
`LOW_LATENCY_LAYER_REFLEX=1` (the variables `LowLatencyLayerService.js` sets). Other implicit layers (Steam, OBS) are
disabled with `VK_LOADER_LAYERS_DISABLE` for these runs. One JSON line per run: enumeration probes (VK_INCOMPLETE,
device groups, KHR alias), which extensions are exposed, which module serves each `vkGetDeviceProcAddr` entry, frame
time stats, submit counts (vkQueueSubmit / vkQueueSubmit2 / multi-batch / zero-batch), private bytes and handles.

`vk_harness.exe` alone:

```
vk_harness [--frames N] [--submit v1|v2|mix] [--enum full|partial|groups|groups-khr]
           [--ext none|antilag|nvll2|both] [--features full|none] [--present immediate|mailbox|fifo]
           [--cycles N] [--validation]
```

- `--enum partial` never enumerates all GPUs before creating the device (count=0 then count=1), so the layer must
  find the device lazily; `groups`/`groups-khr` select the GPU through vkEnumeratePhysicalDeviceGroups(KHR) only.
- `--ext antilag` enables VK_AMD_anti_lag and calls vkAntiLagUpdateAMD (input + present stages) every frame;
  `--ext nvll2` enables VK_NV_low_latency2 (+ VK_KHR_present_id) and uses SetLatencySleepModeNV, LatencySleepNV
  (waits on its timeline semaphore), SetLatencyMarkerNV and GetLatencyTimingsNV.
- `--features none` passes no feature structs (the layer must add timelineSemaphore/hostQueryReset/sync2 itself).
- `--validation` enables VK_LAYER_KHRONOS_validation when it is installed (Vulkan SDK); otherwise the output says
  `validationAvailable:false`.
- Exit codes: 0 ok, 1 Vulkan error, 2 device lost, 3 hang (fence timeout or no progress for 10 s).

## 2. PacerHook: `run_pacer.ps1`

```
powershell -NoProfile -ExecutionPolicy Bypass -File tools\gpu-harness\run_pacer.ps1 [-Fps 60] [-Scenario all|cap|earlyfree]
```

Starts `dxgi_harness.exe` (D3D11, flip-model swap chain from `IDXGIFactory2::CreateSwapChainForHwnd`) and drives
`electron\services\DarkHub.FrameLimiter.exe` with the same arguments as `FramePacerEngine.js`, plus
`--target-pid <harness>` so it never auto-detects a game. x86 targets go through `DarkHub.PacerInject.x86.exe`.

- `cap`: uncapped -> limiter -> STOP on stdin -> limiter again -> limiter killed (heartbeat goes stale), for
  Present, Present1 and alternating, x64 and x86.
- `earlyfree`: the harness FreeLibrary()s the hook 0-100 ms after it appears (its init thread is still in the 500 ms
  sleep). The module must stay mapped, keep capping, and unmap itself when the init thread exits (~30 s after load)
  while the main thread keeps presenting.

`dxgi_harness <present|present1|alt|tearing-check> <seconds> [--free-hook-after-ms N]` prints one JSON line per
second (`fps`, `hook` = module mapped). `tearing-check` prints `IDXGIFactory5::CheckFeatureSupport(ALLOW_TEARING)`.

## 3. GpuBench: `run_gpubench.mjs`

```
node tools\gpu-harness\run_gpubench.mjs [segmentMs=3000] [exe]
```

Same offline verification as `scripts/gpubench-check.mjs` (vectors, tile hashes, Merkle paths against the JS scene
model) on `electron\services\DarkHub.GpuBench.exe`, with the engine window moved to 480x270 via `{"cmd":"rect"}`.
Prints one JSON line with fps (GPU clock and wall clock) and frame-time percentiles per test.
