# Ultra Low Latency (ULL) Linux/Ubuntu support — debug & implementation plan (Option A, per-capability)

## Goal / scope
- Add incremental Linux/Ubuntu support for the ULL/Latency Guardian feature while preserving Windows behavior and the stable `{ ok, ... }` + IPC/preload contract (`window.darkhub.latency`).
- Refactor ULL to **per-capability** providers with explicit `supported | partial | unsupported` states and structured unsupported responses, so Linux can enable safe diagnostics/controls without pretending Windows-only equivalents exist.
- Out of scope: Tauri rewrite, IPC/preload surface redesign, full parity for Win32-only tweaks, native Linux timer/latency daemon equivalent to `DarkHub.LatencyEngine.exe`, or fixing unrelated optimizer smoke errors (tracked separately).

## Constraints / invariants
- Keep Option A strangler approach and existing contracts: no rename/removal of `latency:*` channels or preload methods; responses remain object-shaped with `ok` and include `unsupported`, `platform`, `reason`, and/or `error` when unavailable/partial where applicable (align with existing patterns in `electron/main.js` `latencyDisabledPayload`, `electron/capabilities.js`, optimizer).
- Never mask Windows behavior: Windows-only code paths/tweak semantics must remain unchanged behind `process.platform === 'win32'` or equivalent guards; Linux adds guarded alternatives or structured unsupported.
- Prefer lazy imports and no Win32 side effects at module load on Linux.
- Do not claim semantic equivalence for unsupported capabilities (timer 0.5ms, FSO/registry, Nagle/QoS/netsh, Windows GPU preference, compositor mouse accel, aggressive process killing). Surface as `unsupported`/`partial` with reason.
- UI must degrade gracefully per capability (disable/label items, show partial status) rather than crashing or showing noisy raw errors.

## Current state (evidence)
- `electron/latencyGuardian.js`: monolithic Win32 guardian. `ultraEnableImpl` rejects non-win32 (`{ unsupported:true, platform, reason:'windows-only' }` thrown as Error). Tweaks use `powercfg`, PowerShell/registry (`runPowerShell`/`encodedPowerShellArgs`), `netsh`, `ipconfig`, `NtSetTimerResolution` PS loop or native daemon, `Get-NetQosPolicy`/`Set-NetQosPolicy` (elevated), DNS via `Set-DnsClientServerAddress`, `EmptyWorkingSet`/process kill, game detection via `si.processes()` path/name match. `updatePing` returns early on non-win32 (but fallback is TCP `net.Socket` connect, cross-platform). `updateGpuUsage`/`smartCleanRam` early-return on non-win32 (PS/native). IPC handlers: many actions explicitly return unsupported on non-win32 (`enableUltraStable`, `boostNow`, `launchGameWithProfile`); `getConfig` returns config/status/metrics and queries native timer only if daemon alive. Starts loop/hotkey/config load on `registerLatencyGuardian`.
- `electron/services/NativeLatencyClient.js`: Windows-only `.exe` daemon discovery/spawn (`DarkHub.LatencyEngine.exe`), JSON line protocol over stdio; `ensureRunning` returns false if exe missing. No Linux implementation.
- `electron/hal/collectors/LatencyCollector.js`: on non-win32 `poll()` returns `status:'OK'` with `createUnavailableSensor(...,'Unsupported')` values; subscribes to `SensorBus` `data type 'latency'` and lazily enumerates running drivers via PowerShell on win32 only.
- `electron/capabilities.js`: `latency` is `supported` only on win32 else `unsupported/windows-only`.
- `electron/main.js`: placeholders register all `LATENCY_CHANNELS` with `latencyDisabledPayload()` (or `latency-service-starting` on win32 while starting). Guardian registered only when `win32 && liveServices.latencyGuardian !== false`; on failure registers `latency-service-failed`; otherwise disabled stubs. Exposes `app:getCapabilities`.
- `electron/preload.js` + `src/global.d.ts`: stable `darkhub.latency.*` API (`getConfig/setConfig/enableUltra/enableUltraStable/disableUltra/toggleUltra/boostNow/launchGameWithProfile/queryTimer/getCpuTopology`) and capability typing.
- `src/pages/UltraLowLatency.tsx`: polls `latency.getConfig()`; if `res?.unsupported` sets unsupported screen and stops polling; shows per-tweak applied results from `lastApplied`. No per-capability gating of individual toggles beyond whole-page unsupported today.
- Related reusable infra: `electron/services/optimizer/NetworkEngine.js` `flushDns()` already best-effort on Linux (`resolvectl`/`systemd-resolve`); `networkIPC.js` `network:flushDns` has Linux path; `electron/platform.js` helpers; `CpuLoadTracker`, `ManagedProcessRegistry`, `runCommand`/`runPowerShell` wrappers exist.
- Tests: `tests/netLatency.test.ts` (pure parsing/math, platform-agnostic + win32-gated apply flow stubs), `tests/powerModel.test.ts` (render latency stats/models, not guardian IPC). No guardian/ULL contract tests found.

## Capability matrix (target per-capability behavior)

| Capability | Windows (must keep) | Linux target | Reason/notes |
|---|---|---|---|
| Metrics: CPU/RAM | current `os` + `CpuLoadTracker` | **supported** (cross-platform) | keep sampling logic; ensure loop works on Linux. |
| Metrics: ping | native daemon → TCP:53 fallback (currently gated win32) | **supported/partial** | reuse TCP connect probe and/or `ping`/ICMP parsing where safe; honor `isSafePingHost`; remove unconditional win32 early-return; report `method`. |
| Metrics: GPU usage (3D) | PowerShell `Get-Counter` GPU Engine | **unsupported/partial** | optional later via `/sys/class/drm`/vendor tools; default unsupported, `gpuPollingEnabled` no-op with status. |
| Timer resolution 0.5ms | native `lock_timer` / NtSetTimerResolution PS loop | **unsupported** | no safe equivalent; never start PS loop on Linux. `queryTimer` returns structured unsupported/unavailable. |
| Power plan high performance | `powercfg` SCHEME_MIN + restore | **partial** (best-effort) | if `powerprofilesctl` present: `set performance` / restore previous; else `cpupower frequency-set -g performance` if available; else unsupported per-op. Requires privileges/tools; capture/restore previous profile/governor. |
| Process priority (game) | native boost / `Get-Process.PriorityClass=High` | **partial** | `renice -n -10 -p <pid>` (and/or `ionice` best-effort) when permitted; record applied/failed per-op; do not claim realtime/affinity equivalence. |
| CPU affinity / topology hints | native `boostProcess(..., pCoresOnly)` / `getCpuTopology` | **unsupported/partial** | `getCpuTopology` can return basic `os.cpus()` topology info cross-platform if cheap; affinity (`taskset`) only if explicitly safe/requested and permitted — default unsupported for p-core masking. |
| Disable Fullscreen Optimizations | HKCU AppCompatFlags Layers | **unsupported** | Windows/DirectX-specific. |
| Disable mouse acceleration | HKCU MouseSpeed/Threshold + UpdatePerUserSystemParameters | **unsupported** (default) | compositor/DE/X11/Wayland-specific and risky; do not mutate globally. |
| GPU high performance preference (per-exe) | HKCU DirectX UserGpuPreferences | **unsupported** | Windows-specific; Linux uses `DRI_PRIME`/env per-launch (different scope) — not auto-applied here. |
| QoS (DSCP) for exe | `Get/Set-NetQosPolicy` (elevated) | **unsupported** | requires `tc`/nftables/cgroup & root; semantics differ; out of safe scope. |
| Disable Nagle / interface TCP tweaks | HKLM Tcpip interface registry (elevated) + verify | **unsupported** | sysctl/interface-specific, privileged, non-equivalent. |
| Global TCP stack optimization | `netsh int tcp set global ...` | **unsupported** | Windows netsh-only; do not apply sysctls implicitly. |
| DNS Cloudflare apply/restore (adapter) | `Set-DnsClientServerAddress` on adapter + flush | **partial** (guarded) | prefer reuse of existing safe flush path (`NetworkEngine.flushDns`/`resolvectl`) for flush; full adapter DNS override/restore is privileged and NM/systemd-resolved-specific — treat apply/restore as unsupported or explicitly opt-in/elevated-only later; **do not** modify `/etc/resolv.conf` destructively. |
| Kill background processes | fixed Windows process-name list | **unsupported** | list is Windows-specific; avoid killing arbitrary Linux processes. |
| Smart clean RAM | native `cleanRam` / `EmptyWorkingSet` over processes | **unsupported/partial** | Windows working-set trim not equivalent; optional safe no-op or `drop_caches` is root/global (dangerous) — keep unsupported by default. |
| Hotkey (global shortcut) | Electron `globalShortcut` | **partial** (best-effort) | `globalShortcut` works on many X11 setups but can be unreliable under Wayland; register best-effort and report `hotkey.ok/error/platformNote` without failing whole config. |
| Game detection (auto) | `si.processes()` match by exe path/basename | **supported/partial** | `systeminformation` is cross-platform but Linux paths/comm differ; match by resolved path and basename/cmd; keep Windows path matching unchanged. |
| Boost now | `ipconfig /flushdns` + smart clean (if no game) | **partial** | flush DNS via cross-platform/best-effort (`NetworkEngine.flushDns` logic or resolvectl fallback); skip Windows-only smart clean; return per-action applied/unsupported details. |
| Launch game with profile | spawn exe (Windows path semantics) + apply profile/tweaks, track playtime | **partial/unsupported** | spawning arbitrary executables is cross-platform in Node but profile assumes Windows `.exe` and Windows tweaks; allow launch mechanics where safe? better: keep **unsupported** initially on Linux unless/until path/tweak semantics defined, to avoid broken/unsafe behavior; revisit as explicit follow-up. |
| Guardian loop/auto enable-disable | enable on detect / disable on exit | **partial** | only for supported/partial tweaks; must not attempt unsupported tweak side effects. |
| `queryTimer` / `getCpuTopology` | native daemon | **partial** | `queryTimer` -> structured unsupported/unavailable on Linux; `getCpuTopology` -> derived from `os.cpus()` (cores/threads model) as informational, or unavailable. |
| HAL `LatencyCollector` | SensorBus/WMI/PowerShell drivers | **unsupported** (values) | keep unavailable-sensor shape on Linux; no PowerShell. |

**Capability summary:** `latency` becomes **`partial`** on Linux (diagnostics/limited controls) once implemented; remain **`supported`** on Windows. `capabilities.js` must report level/reason and, if useful, per-subcapability flags or a note consumed by UI.

## Structured contracts (normalize)
- Unsupported response shape (reuse): `{ ok: false, unsupported: true, platform: process.platform, reason, error }` (+ optional `status`/`partial`/`supportedPlatforms`/`applied`).
- Disabled/starting/failed service states (existing): keep `{ ok:false, platform, error:'latency-service-starting'|'latency-service-failed'|'latency-service-disabled' }` (+ unsupported/reason where already used) so UI can distinguish from unsupported capability.
- `latency:getConfig`: always `{ ok: true, config, status, metrics }` when service/guardian active; include `status.platform`, `status.capabilities`/per-tweak support or `status.lastApplied` entries with `status:'unsupported'|'skipped'|'failed'|'ok'|'unverified'` so UI can render per-item state on Linux without special-casing exceptions.
- `enable/disable/toggle/enableUltraStable/boostNow/launchGameWithProfile`: return `{ ok, status?, applied?, unsupported?, platform?, reason?, error?, msg? }`; on Linux, never throw raw Win32 errors—convert to structured per-op results.
- `queryTimer`/`getCpuTopology`: `{ ok:false, unsupported:true, platform, reason, error }` when unavailable, or `{ ok:true, data }` when informational data provided.
- Do not change successful Windows response fields/semantics.

## Implementation plan (ordered, test-backed)

### Phase 1 — Contracts, capability model, and service gating (foundation)
1. **`electron/capabilities.js`**: change `latency` to `partial` on Linux with reason like `linux-partial` and a concise `error`/note; keep Windows `supported`. Optionally expose subcapability hints (e.g. `diagnostics:true`, `tweaks:false/partial`) if cheap; keep backward-compatible `supported/level/reason/error`.
2. **`electron/main.js`**: allow guardian registration on Linux when `liveServices.latencyGuardian !== false` (not only win32) so diagnostics/partial controls can run; keep placeholder disabled payloads for `disabled/starting/failed`. Ensure `latencyDisabledPayload`/errors remain consistent (`platform`, `unsupported` when not supported). Keep Windows init path identical.
3. **`electron/services/NativeLatencyClient.js`**: make `getExecutablePath/ensureRunning` explicitly no-op on non-win32 (`return false`) without attempting to spawn `.exe`; guard so Linux never errors noisily. Keep dispose/kill behavior safe.
4. **`electron/hal/collectors/LatencyCollector.js`**: keep current non-win32 unavailable-sensor behavior (already safe) — verify no PowerShell invoked on Linux (it is guarded); add/keep explicit unsupported reason consistency if needed.

### Phase 2 — Refactor `latencyGuardian.js` into per-capability operations
5. **Introduce per-capability descriptors/helpers** (in guardian or a small sibling module, e.g. `electron/services/latency/latencyCapabilities.js` if cleaner) mapping each tweak/metric to `{ id, supportedPlatforms, apply/restore/measure, unsupportedReason }` or equivalent, so `ultraEnableImpl`/`ultraDisableImpl` iterate capabilities instead of hardcoded Win32-only flow.
6. **Guard all Win32-only primitives**: wrap `powercfg`, `runPowerShell` scripts, registry/netsh/qos/NtSetTimerResolution fallbacks behind `process.platform === 'win32'`; provide Linux alternatives only where defined (see matrix) else return per-op `{ status:'unsupported', error/reason }`.
7. **Metrics fixes for Linux**:
   - `updateMetricsFast`: keep as-is (cross-platform).
   - `updatePing`: remove unconditional `if (process.platform !== 'win32') return`; run TCP probe fallback cross-platform (and native only when available). Preserve host validation and error semantics.
   - `updateGpuUsage`: return/mark unsupported on Linux (no PS); do not start GPU timer as "active" source unless supported.
8. **Safe Linux tweak implementations (best-effort, per-op results)**:
   - Power plan: detect `powerprofilesctl`/`cpupower`; read current profile/governor, apply performance, verify best-effort, store undo; if unavailable/permission denied -> `failed/unsupported` with detail (do not throw to abort unrelated ops).
   - Process priority: `renice` on game pid (and optional `ionice -c2 -n0` best-effort) when permitted; no-op/`skipped` if no pid or not permitted.
   - DNS flush part of "dns"/boost: call/reuse `NetworkEngine.flushDns()` (lazy import) or equivalent `resolvectl` path; treat adapter-specific Cloudflare set/restore as unsupported on Linux unless a safe implementation is explicitly added (default: mark dnsCloudflare tweak unsupported on Linux, but allow flush-only boost action).
   - Game detection: make path/basename matching resilient for Linux (`p.path`, basename, `p.name`, cmd where available) without changing Windows matching behavior.
9. **Explicitly unsupported on Linux (per-op, no side effects)**: `timerResolution05`, `disableFullscreenOptimizations`, `disableMouseAcceleration`, `gpuHighPerformance`, `qosForExe`, `disableNagle`, tcpStack netsh, `killBackground`, `smartCleanRam` native/PS, `launchGameWithProfile` (initially) — return structured unsupported in apply/restore/handler paths and record in `applied`.
10. **Handlers & lifecycle**:
    - `enableUltra`/`enableUltraStable` on Linux: run only supported/partial ops, return `ok:true` with detailed `applied` even if some/most ops unsupported (best-effort profile) OR define clear rule (recommend: `ok:true` if request processed and no fatal error, with per-op statuses — consistent with best-effort apply pattern already used); must not throw "Apenas suportado no Windows" globally.
    - `boostNow`: on Linux perform safe actions only (DNS flush best-effort; skip smart clean) and report what ran/was skipped.
    - `launchGameWithProfile`: return structured unsupported on Linux for now (clear reason) unless safe launch-only subset is implemented; avoid half-applied Windows profile semantics.
    - `queryTimer`: unsupported/unavailable on Linux. `getCpuTopology`: return `os.cpus()`/core count info cross-platform if easy (`{ ok:true, data:{ logicalCores, model?, platform } }`) or unsupported—pick one and type it; prefer informational non-invasive data.
    - `start()`: on Linux avoid scheduling unsupported GPU polling work; ping loop can run if supported.
    - Hotkey: keep `globalShortcut` best-effort; include warning/note on failure but do not break service.

### Phase 3 — UI/typing alignment
11. **`src/pages/UltraLowLatency.tsx`**: support `partial` Linux mode instead of full-page unsupported-only path:
    - Use `app:getCapabilities` and/or `status.capabilities`/`res.unsupported` to distinguish fully unsupported vs partial.
    - Disable/annotate individual toggles/actions that are unsupported on current platform (show reason tooltip/help text), but allow supported diagnostics/controls (ping host, auto-detect display, boost-now if partial, view metrics).
    - Render per-tweak `applied` statuses including `unsupported/skipped` clearly (already partially handled) and avoid implying Windows-only tweaks are active on Linux.
    - Keep existing behavior on Windows unchanged.
12. **`src/global.d.ts`**: extend `latency.getConfig` result typing (status may include capabilities/platform notes), and ensure action results allow `unsupported/platform/reason/applied/msg` where returned. Keep backward-compatible.

### Phase 4 — Documentation/capability messaging
13. **Docs/README/CONTRIBUTING** (if needed): update ULL status in Linux caveats matrix — "partial on Linux (diagnostics + limited safe tweaks)" vs "supported on Windows"; list unsupported items explicitly. Regenerate hub docs only if IPC/capability surfaces they document change.

## Affected files (expected)
- Core: `electron/latencyGuardian.js` (major refactor/gating/per-capability), `electron/services/NativeLatencyClient.js`, `electron/hal/collectors/LatencyCollector.js`, `electron/capabilities.js`, `electron/main.js`.
- Optional new helper: `electron/services/latency/latencyCapabilities.js` (or similar) for capability table/providers — keep small/testable/pure where possible.
- Reuse: `electron/services/optimizer/NetworkEngine.js` (flushDns), `electron/platform.js`, existing runners/trackers.
- UI/types: `src/pages/UltraLowLatency.tsx`, `src/global.d.ts`.
- Tests (new/updated): `tests/latencyGuardian.test.ts` or `tests/ultraLowLatency.test.ts` (contracts, platform-gated behavior, per-op applied statuses with mocked deps/runners), possibly small unit tests for capability/provider helpers; keep `tests/netLatency.test.ts`/`tests/powerModel.test.ts` passing.
- Docs (as applicable): `README.md`, `CONTRIBUTING.md`, Linux caveats/PR #11 body notes.

## Windows non-regression guards
- Preserve all current Windows tweak implementations, commands, registry paths, native daemon usage, undo/restore data shapes, and `applied` semantics.
- Any new branching must default to existing behavior when `process.platform === 'win32'`.
- Keep `LATENCY_CHANNELS`, preload signatures, and `{ ok:true, config,status,metrics }` / `{ ok:true, status, applied }` shapes stable.
- Do not start Linux loops/timers that invoke PowerShell/.exe; ensure `runPowerShell`/`encodedPowerShellArgs`/native client are unreachable on Linux paths.
- Validate Windows-only assumptions remain behind guards (hotkey registration API is cross-platform in Electron but behavior differs — treat as best-effort, not a semantic change).

## Risks / edge cases
- **Permission/tool availability (Linux):** `powerprofilesctl`, `cpupower`, `renice`, `resolvectl` may be missing or require privileges; must report per-op failure/unsupported, not crash service.
- **Wayland/global hotkeys:** `globalShortcut` may not work; surface registration error.
- **Process matching:** `si.processes()` fields differ (path/name/cmd) across platforms; avoid false negatives/positives and keep matching cheap.
- **Auto-enable loops:** must not repeatedly apply failing privileged ops; consider backoff or apply-once-per-detection semantics if needed.
- **Partial success semantics:** `ultraEnabled` state vs "all tweaks applied" — define clearly (recommend: session/profile active with best-effort applied map) to avoid misleading UI.
- **DNS/power side effects:** never mutate system config destructively without explicit, restorable, privileged path; default to flush-only/no-op on Linux.
- **Smart clean/kill:** explicitly unsafe/non-equivalent on Linux — keep unsupported.
- **Service lifecycle:** guardian start/stop must remain idempotent; `dispose` native client safe when never started.

## Validation plan
- **Static/syntax:** `node --check electron/latencyGuardian.js electron/services/NativeLatencyClient.js electron/hal/collectors/LatencyCollector.js electron/capabilities.js electron/main.js electron/preload.js` (and any new/changed files).
- **Typecheck/build:** `npx tsc --noEmit -p .`; `npx vite build`.
- **Unit/integration tests:** `npx vitest run --pool=forks --maxWorkers=2` (full) plus targeted runs for new/affected tests, e.g. `npx vitest run tests/ultraLowLatency*.test.ts tests/latencyGuardian*.test.ts tests/netLatency.test.ts`.
- **New test coverage (minimum):**
  - Capability contract: `getCapabilities().latency` level/platform expectations per platform (or mocked platform logic).
  - Guardian handlers on Linux-simulated deps: `getConfig` ok with metrics shape; `queryTimer` unsupported; `enableUltra` returns structured per-op applied with unsupported ops not executed; `boostNow` performs safe flush-only path; `launchGameWithProfile` unsupported (if chosen).
  - No PowerShell/.exe spawn on Linux paths (mock/assert `runPowerShell`/native client not called).
  - Windows non-regression via existing behavior assumptions where unit-testable (mocks) and by keeping win32 branches intact.
- **Manual smoke (Linux/Ubuntu):** `npm run dev` — open ULL page, confirm no whole-page crash, diagnostics (CPU/RAM/ping) update, unsupported tweaks labeled/disabled, enable/disable/boost produce structured results without errors; verify no `[startup]` guardian registration failure and no PowerShell/exe attempts.
- **Manual/CI (Windows):** required for non-regression of actual tweaks (power plan, timer, registry, QoS, netsh) — not locally verifiable here; keep PR checklist open.

## Open questions / follow-ups (need decision or separate fix)
1. **`launchGameWithProfile` on Linux:** allow cross-platform spawn-only (no tweaks/profile application) vs keep fully unsupported? Recommendation: keep unsupported initially to avoid misleading "profile applied" semantics; revisit with explicit Linux profile design.
2. **DNS Cloudflare apply/restore on Linux:** implement NM/systemd-resolved-specific, privileged, restorable flow vs leave unsupported and provide flush-only. Recommendation: unsupported for now (flush-only supported).
3. **Power plan provider priority:** `powerprofilesctl` vs `cpupower` vs both; how to detect/restore reliably across distros.
4. **`ultraEnabled` semantics:** represent "session active (best-effort)" even when most tweaks unsupported, or require at least one applied tweak — must be consistent with UI and auto-disable logic.
5. **Separate known issue:** Ubuntu smoke reported `IPC - optimizer 14 chamadas 2 erro(s)`; investigate and fix independently of ULL (phase 4 follow-up from prior work).
6. **PR hygiene:** keep PR #11 draft; consider splitting ULL Linux into its own phase/scoped PR once implemented/reviewable.

## Implementation notes for executor
- Read and follow existing optimizer capability patterns (`supportedPlatforms`, per-op `applied/status`, structured unsupported) for consistency.
- Prefer small, testable provider functions over inlining platform conditionals everywhere; avoid changing `preload.js` method names.
- When in doubt, return structured `unsupported` with a clear reason rather than attempting a risky non-equivalent system change.
