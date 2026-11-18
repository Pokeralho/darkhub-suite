// Runs electron/services/DarkHub.GpuBench.exe offline, like scripts/gpubench-check.mjs (same verification against the
// JS scene model: vectors, tile hashes, Merkle paths), but moves the engine window to a small rectangle first (the
// app does the same with {"cmd":"rect"}) and prints the numbers as one JSON line at the end.
// Usage: node tools/gpu-harness/run_gpubench.mjs [segmentMs=3000] [exe]
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import * as S from '../../electron/services/gpubench/sceneModel.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ms = Number(process.argv[2] || 3000)
const exe = process.argv[3] || path.join(root, 'electron', 'services', 'DarkHub.GpuBench.exe')
if (!fs.existsSync(exe)) { console.error(`missing ${exe}`); process.exit(2) }
const u32s = (b64) => { const b = Buffer.from(b64, 'base64'); return Array.from({ length: b.length / 4 }, (_, i) => b.readUInt32LE(i * 4)) }
const report = { exe: path.relative(root, exe), segmentMs: ms, vectors: null, ready: null, tests: {}, exitCode: null }

const v = JSON.parse(spawnSync(exe, ['--vectors'], { encoding: 'utf8' }).stdout)
let bad = 0
;[0, 1, 0xdeadbeef, 0xffffffff].forEach((x, i) => { if (S.pcg(x) !== v.pcg[i]) bad++ })
if (S.hash2(7, 9) !== v.hash2) bad++
for (const b of v.boxes) { const j = S.box(b.seed, b.frame, b.cx, b.cz); if (String(j.min) !== String(b.min) || String(j.max) !== String(b.max)) bad++ }
for (const c of v.cameras) { const j = S.camera(c.seed, c.frame); if (String(j.eye) !== String(c.eye) || String(j.target) !== String(c.target)) bad++ }
report.vectors = bad ? `${bad} differ` : 'all match'

const started = Date.now()
const child = spawn(exe, [], { stdio: ['pipe', 'pipe', 'pipe'] })
let stderr = ''
child.stderr.on('data', (d) => { stderr += d })
const exited = new Promise((r) => child.on('exit', (code) => r(code)))
const lines = readline.createInterface({ input: child.stdout })[Symbol.asyncIterator]()
let ticks = []
const next = async () => {
  for (;;) {
    const r = await lines.next()
    if (r.done) return { type: 'eof' }
    const m = JSON.parse(r.value)
    if (m.type === 'tick') { ticks.push(m.fps); continue }
    return m
  }
}
const send = (o) => child.stdin.write(JSON.stringify(o) + '\n')
const ready = await next()
report.ready = ready
if (ready.type !== 'ready') { console.log(JSON.stringify(report)); process.exit(1) }
send({ cmd: 'rect', x: 40, y: 40, w: 480, h: 270, visible: true })

let failed = bad > 0
for (const test of ready.dxr ? ['raster', 'rt'] : ['raster']) {
  const seed = 1234567 + test.length
  ticks = []
  send({ cmd: 'segment', test, seed, index: 0, ms })
  const seg = await next()
  if (seg.type !== 'segment') { report.tests[test] = { error: seg }; failed = true; continue }
  const us = u32s(seg.frameUs)
  const gpuMs = us.reduce((a, b) => a + b, 0) / 1000
  const sorted = [...us].sort((a, b) => a - b)
  const t = {
    frames: seg.frames, wallMs: seg.wallMs,
    fpsGpuClock: +(seg.frames / gpuMs * 1000).toFixed(1), fpsWall: +(seg.frames / seg.wallMs * 1000).toFixed(1),
    frameUs: { min: sorted[0], p50: sorted[Math.floor(sorted.length / 2)], p99: sorted[Math.floor(sorted.length * 0.99)], max: sorted[sorted.length - 1] },
    tickFps: ticks.slice(-3), openings: []
  }
  const rootHash = Buffer.from(seg.root, 'hex')
  for (const frame of [Math.floor(seg.frames / 3), seg.frames - 1]) {
    const tiles = S.pickTiles(seed, frame, 12, () => Math.random())
    send({ cmd: 'open', test, seed, frame, tiles })
    const o = await next()
    if (o.type !== 'opening') { t.openings.push({ frame, error: o }); failed = true; continue }
    const hashes = u32s(o.tileHashes)
    const merkle = S.verifyPath(S.frameRoot(hashes), o.path, rootHash)
    let px = 0, match = 0, wrong = 0, hashOk = 0, worst = 1
    for (const tl of o.tiles) {
      const ids = u32s(tl.ids)
      if (S.tileHash(ids) === hashes[tl.tile]) hashOk++
      const x0 = (tl.tile % S.TILES_X) * S.TILE, y0 = Math.floor(tl.tile / S.TILES_X) * S.TILE
      let m = 0
      ids.forEach((id, i) => {
        const x = x0 + (i % S.TILE), y = y0 + Math.floor(i / S.TILE)
        if (id === S.pixelId(seed, frame, x, y)) m++
        if (id === S.pixelId(seed + 1, frame, x, y)) wrong++
      })
      px += ids.length; match += m; worst = Math.min(worst, m / ids.length)
    }
    const ok = merkle && hashOk === o.tiles.length && worst >= 0.97 && wrong / px < 0.9
    failed ||= !ok
    t.openings.push({ frame, merkle, tileHash: `${hashOk}/${o.tiles.length}`, idsPct: +(match / px * 100).toFixed(2), worstTilePct: +(worst * 100).toFixed(1), wrongSeedPct: +(wrong / px * 100).toFixed(1), ok })
  }
  report.tests[test] = t
}
send({ cmd: 'quit' })
child.stdin.end()
const timeout = setTimeout(() => { report.exitCode = 'timeout'; child.kill() }, 15000)
const code = await exited
clearTimeout(timeout)
report.exitCode ??= code
report.totalS = +((Date.now() - started) / 1000).toFixed(1)
if (stderr.trim()) report.stderr = stderr.trim().slice(0, 500)
report.result = failed || code !== 0 ? 'FAIL' : 'OK'
console.log(JSON.stringify(report))
process.exit(report.result === 'OK' ? 0 : 1)
