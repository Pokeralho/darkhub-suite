// Runs the real engine and checks it against the JS scene model, as the server does: GPU IDs, tile hashes, Merkle paths.
// Usage: node scripts/gpubench-check.mjs [segmentMs] [path to exe]
import { spawn } from 'node:child_process'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import * as S from '../electron/services/gpubench/sceneModel.js'

const ms = Number(process.argv[2] || 3000)
const exe = process.argv[3] || (fs.existsSync('native_gpubench/target/release/DarkHub_GpuBench.exe') ? 'native_gpubench/target/release/DarkHub_GpuBench.exe' : 'electron/services/DarkHub.GpuBench.exe')
const u32s = (b64) => { const b = Buffer.from(b64, 'base64'); return Array.from({ length: b.length / 4 }, (_, i) => b.readUInt32LE(i * 4)) }

// 1. integer vectors
const v = JSON.parse(spawnSync(exe, ['--vectors'], { encoding: 'utf8' }).stdout)
let bad = 0
;[0, 1, 0xdeadbeef, 0xffffffff].forEach((x, i) => { if (S.pcg(x) !== v.pcg[i]) { bad++; console.log('pcg differs', x) } })
if (S.hash2(7, 9) !== v.hash2) bad++
for (const b of v.boxes) { const j = S.box(b.seed, b.frame, b.cx, b.cz); if (String(j.min) !== String(b.min) || String(j.max) !== String(b.max)) { bad++; console.log('box differs', b, j) } }
for (const c of v.cameras) { const j = S.camera(c.seed, c.frame); if (String(j.eye) !== String(c.eye) || String(j.target) !== String(c.target)) { bad++; console.log('camera differs', c, j) } }
console.log(`vectors: ${bad ? bad + ' DIFFER' : 'all match'}`)

// 2. the real thing
const child = spawn(path.resolve(exe), [], { stdio: ['pipe', 'pipe', 'inherit'] })
const lines = readline.createInterface({ input: child.stdout })[Symbol.asyncIterator]()
const next = async () => JSON.parse((await lines.next()).value)
const send = (o) => child.stdin.write(JSON.stringify(o) + '\n')
const ready = await next()
console.log(ready)
if (ready.type !== 'ready') process.exit(1)

let failed = bad > 0
for (const test of ready.dxr ? ['raster', 'rt'] : ['raster']) {
  const seed = 1234567 + test.length
  send({ cmd: 'segment', test, seed, index: 0, ms })
  const seg = await next()
  if (seg.type !== 'segment') { console.log(seg); process.exit(1) }
  const us = u32s(seg.frameUs)
  const gpuMs = us.reduce((a, b) => a + b, 0) / 1000
  console.log(`${test}: ${seg.frames} frames, ${(seg.frames / gpuMs * 1000).toFixed(1)} fps by GPU clock, ${(seg.frames / seg.wallMs * 1000).toFixed(1)} fps by wall clock`)
  const root = Buffer.from(seg.root, 'hex')
  for (const frame of [Math.floor(seg.frames / 3), seg.frames - 1]) {
    // tiles with visible edges only: a tile of plain sky proves nothing
    const tiles = S.pickTiles(seed, frame, 12, () => Math.random())
    send({ cmd: 'open', test, seed, frame, tiles })
    const o = await next()
    if (o.type !== 'opening') { console.log(o); failed = true; continue }
    const hashes = u32s(o.tileHashes)
    const merkle = S.verifyPath(S.frameRoot(hashes), o.path, root)
    let px = 0, match = 0, wrong = 0, hashOk = 0, worst = 1
    for (const t of o.tiles) {
      const ids = u32s(t.ids)
      if (S.tileHash(ids) === hashes[t.tile]) hashOk++
      const x0 = (t.tile % S.TILES_X) * S.TILE, y0 = Math.floor(t.tile / S.TILES_X) * S.TILE
      let m = 0
      ids.forEach((id, i) => {
        const x = x0 + (i % S.TILE), y = y0 + Math.floor(i / S.TILE)
        if (id === S.pixelId(seed, frame, x, y)) m++
        if (id === S.pixelId(seed + 1, frame, x, y)) wrong++ // negative control: the wrong scene must not match
      })
      px += ids.length; match += m; worst = Math.min(worst, m / ids.length)
    }
    const control = wrong / px
    const ok = merkle && hashOk === o.tiles.length && worst >= 0.97 && control < 0.9
    failed ||= !ok
    console.log(`  frame ${frame}: merkle ${merkle}, tile hash ${hashOk}/${o.tiles.length}, IDs ${(match / px * 100).toFixed(2)}% (worst tile ${(worst * 100).toFixed(1)}%), wrong seed matches ${(control * 100).toFixed(1)}% ${ok ? 'OK' : 'FAIL'}`)
  }
  if (process.env.SHOT) {
    send({ cmd: 'shot', path: path.resolve(`${process.env.SHOT}-${test}.rgba`) })
    console.log(await next())
  }
}
send({ cmd: 'quit' })
child.stdin.end()
console.log(failed ? 'RESULT: FAIL' : 'RESULT: OK')
process.exit(failed ? 1 : 0)
