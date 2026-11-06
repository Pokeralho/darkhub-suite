# DarkHub GPU Benchmark: engine, proof and ranking

Synthetic GPU benchmark with two tests (rasterization and ray tracing), a score, and a public ranking on
`hub.darkhub.ink`. This file is the contract between the three parts:

| Part | Where | Job |
|---|---|---|
| Engine | `native_gpubench/` (Rust, D3D12 + DXR 1.1 inline) → `electron/services/DarkHub.GpuBench.exe` | Renders, measures, commits |
| App | `electron/services/gpubench/`, `src/pages/GpuBench.tsx` | Runs the engine, talks to the Hub |
| Server | `darkhub-ecosystem/apps/hub-api/src/bench/`, `apps/web-hub` | Issues challenges, verifies, scores, ranks |

## Threat model

The client repository is **public** and the user owns the machine. So:

- Nothing in the client is secret. No embedded key, no obfuscation and no client-side check counts as protection.
- Everything the client reports is a claim. The server decides what to believe.
- No system stops a determined attacker completely. The goal is that every cheap cheat fails, an expensive cheat is
  visible, and the top of the ranking gets human review.

| Attack | Defense |
|---|---|
| POST a fake score | Score is computed by the server from the frame trace; a run only exists through a challenge |
| Replay an old or someone else's run | Seeds are server-issued, single use, bound to the account |
| Precompute the frames | Each segment's seed is revealed only after the previous segment is committed |
| Fake the local clock (speedhack) | Server wall clock per segment caps the frame rate it will accept |
| Skip frames or render a lower resolution | Merkle commitment of every frame, then server-chosen spot checks, recomputed on the server |
| Render a different, cheaper scene | Spot checks compare visibility IDs against the server's own ray cast |
| Skip shading but keep visibility | **Not proven by the spot check.** Caught by outlier rules and review (see Limits) |
| Modified engine or injected DLL | Engine hash allowlist and module list: reported, so only stops casual cases |
| Claim a different GPU | Outlier against that GPU's population; top results reviewed |
| Device-code phishing or a stolen app token | Pairing tokens carry scope `bench`: default deny outside `/api/bench/`, revocable on the site |
| Many accounts | GitHub login, rate limits, one ranked entry per account and GPU |

## Scene

Closed-form function of `(seed, frame)`, implemented twice and kept identical by test vectors:
`electron/services/gpubench/sceneModel.js` and `native_gpubench/src/scene.rs`. Integers only, so both agree exactly.

The city is a `GRID` x `GRID` field of axis-aligned boxes on a ground plane, one box per cell. All coordinates are
integers in world units, small enough to be exact in `f32`. Box heights animate with a triangle wave. The camera flies
a seeded path. See `sceneModel.js` for the exact definition: that file is normative.

Visibility ID per pixel: box index, `ID_GROUND`, or `ID_SKY`. Both tests render at a fixed `WIDTH` x `HEIGHT` regardless
of the window, and both produce this ID image: rasterization through a visibility buffer, ray tracing from primary hits.

## Embedding

The app passes its window handle (`--parent <hwnd>`) and the engine draws in a native child window. The screen sends the
position with `{"cmd":"rect"}`; the engine's stdin thread applies it, so the window follows even mid segment. A child
window cannot be clipped by the page, so the screen uses a fixed overlay while a test runs. Without `--parent` the engine
opens its own window, which scripts use. During a segment it reports `{"type":"tick","fps":...}` every 500 ms.

## Commitment

Per frame, a compute pass hashes each `TILE` x `TILE` tile of the ID image into one `u32` (`tileHash`). The engine reads
those back asynchronously.

    frameRoot   = sha256(tileHash_le32 of every tile, in order)
    segmentRoot = merkle(frameRoot of every frame of the segment)

One flat hash per frame on purpose: a Merkle tree per frame would cost 14,400 hashes per frame and load the CPU during
the measurement. An opening sends all tile hashes of that frame instead (about 57 KB).

`merkle`: SHA-256 of `left || right`, an odd node is promoted unchanged.

## Run protocol

All under `/api/bench`, authenticated with a Hub token (`Authorization: Bearer dhk_...`). Pairing issues a token with
scope `bench`: it is refused on every route outside `/api/bench/`, and it is never admin, so a phished approval cannot
publish packages.

1. `POST /runs` with `{ engine: {version, sha256}, system: {...} }` → `{ runId, tests, segmentMs, segmentSeed }`.
2. For each segment: the engine renders for `segmentMs`, then
   `POST /runs/:id/segments` with `{ test, index, frames, segmentRoot, frameUs (base64 u32[] of GPU frame times) }`.
   The server records its own elapsed time since it released this segment's seed, and answers
   `{ open: [{frame, tiles:[...]}], nextSeed | null }`.
3. After the **last** segment, the engine re-renders the requested frames of every segment (the scene is closed-form,
   and doing this between segments would eat the clock of the next one) and answers `POST /runs/:id/openings` with, for each frame, the raw tile IDs, `tileHash` values for the whole frame
   and the Merkle path from `frameRoot` to `segmentRoot`.
4. `POST /runs/:id/finish` with the sensor trace and environment report → final `{ status, score, flags }`.

Challenge order matters: which frames and tiles get checked is decided only **after** the commitment, so the client has
to have done all of them to pass.

## Server checks

- **Clock**: per segment, `sum(frameUs)` must be at least `0.98 * (serverElapsed - 250 ms)`. The slack absorbs network
  round trip and relay; a client that fakes its clock shrinks the trace below that.
- **Merkle**: openings must rebuild `segmentRoot`.
- **Visibility**: tiles are chosen with `pickTiles`, which skips plain sky and flat walls because they prove nothing. The
  server ray-casts the opened pixels with a grid DDA. At least 97% must match per tile, which absorbs
  edge pixels where GPUs legitimately differ. A failed tile fails the run.
- **Plausibility**: frame count versus trace sum, frame-time distribution, sensor trace versus claimed load.
- **Population**: more than 15% above the median of that GPU (with at least 5 verified runs) goes to review.

Run status: `verified` (ranked), `review` (held for an admin), `rejected`, and `local` (run without the server: never
ranked, always labelled as such).

## Score

    fps    = frames / sum(frameUs)                  per test, all segments
    raster = round(fps_raster * RASTER_SCALE)
    rt     = round(fps_rt * RT_SCALE)
    total  = round(sqrt(raster * rt))               geometric mean

A GPU without DXR 1.1 gets `raster` only and is ranked only in the raster table. Bumping `SCENE_VERSION` starts a new
ranking season: scores across versions are not comparable.

## Stress test

Local only, never ranked (`electron/services/gpubench/stressModel.js`). Loops the load for 5 to 60 minutes in 30 s loops:

- **Stability:** worst loop over best loop, per test. At least 97% passes. Below that with a steady clock (under 2% drop)
  the verdict is `inconclusive`: measured on a PC with other programs open, frame rate moved 4% with the clock within 0.1%.
- **Calculation errors:** after each loop the engine redoes one fixed frame and compares its fingerprint with the one
  taken at the start. The scene is deterministic, so any difference is a GPU error. One error fails the test. The image
  fingerprint covers shading, which the ranking proof does not.
- **Lost device or engine crash:** a failed test, with its own reason.
- **Temperature limit:** the sensors are read every second and the test stops at the limit (95 °C by default). The
  temperature comes from `nvidia-smi`: on AMD and Intel there is no reading and the screen says the limit did not work.

## Limits

Stated plainly, also on the public ranking page:

- The spot check proves **visibility**, not shading. A rebuilt engine that computes visibility and skips lighting would
  pass it. That is why outliers and top results are held for review, and why a run stores a preview frame.
- Driver-level image quality changes are not detected, except when they change visibility.
- Overclocking is allowed and shown, not punished.
