// The benchmark scene as a closed-form function of (seed, frame). Pure. Normative: native_gpubench/src/scene.rs must
// match it exactly (tests/gpuBenchScene.test.ts holds the vectors), and hub-api keeps a copy for server verification.
// Everything that decides geometry is u32 integer math, so the engine, the app and the server agree bit for bit.
// See docs/GPU_BENCHMARK.md.
import crypto from 'node:crypto'

export const SCENE_VERSION = 1
export const GRID = 64 // cells per side
export const CELL = 64 // world units per cell
export const WIDTH = 2560
export const HEIGHT = 1440
export const TILE = 16
export const TILES_X = WIDTH / TILE
export const TILES_Y = HEIGHT / TILE
export const ID_GROUND = 0xfffffffe
export const ID_SKY = 0xffffffff
export const FOCAL_NUM = 1 // tan(fov/2) = 1/2 vertically: focal length is 2 in units of half the image height
export const FOCAL_DEN = 2
const WORLD = GRID * CELL

/** PCG output hash of a u32. */
export function pcg(x) {
  const state = (Math.imul(x >>> 0, 747796405) + 2891336453) >>> 0
  const word = Math.imul(((state >>> (((state >>> 28) + 4) >>> 0)) ^ state) >>> 0, 277803737) >>> 0
  return ((word >>> 22) ^ word) >>> 0
}

/** Hash of two u32s, for per-object randomness. */
export const hash2 = (a, b) => pcg((pcg(a) ^ (b >>> 0)) >>> 0)

const tri = (t, period) => { const p = t % period; return p < period / 2 ? p : period - p } // 0..period/2..0

/** The box in cell (cx, cz) at this frame: integer world bounds. Height follows a triangle wave. */
export function box(seed, frame, cx, cz) {
  const index = cz * GRID + cx
  const h = hash2(seed, index)
  const half = 12 + (h & 15) // 12..27, always inside the 64-unit cell
  const base = 40 + ((h >>> 4) & 255) // 40..295
  const period = 2 * (120 + ((h >>> 12) & 127)) // even, 240..494 frames
  const height = base + tri((frame + ((h >>> 20) & 1023)) >>> 0, period)
  const x = cx * CELL + CELL / 2
  const z = cz * CELL + CELL / 2
  return { index, min: [x - half, 0, z - half], max: [x + half, height, z + half] }
}

/** Camera at this frame: integer eye and look-at, flying a seeded loop above the city. */
export function camera(seed, frame) {
  const h = pcg(seed)
  const period = 1200 + (h & 1023)
  const ax = tri((frame + (h >>> 10 & 2047)) >>> 0, period * 2)
  const az = tri((frame + (h >>> 21 & 2047)) >>> 0, period * 2 + 200)
  const span = WORLD - 2 * 256
  const eye = [256 + Math.floor((ax * span) / period), 600 + (tri(frame, 600) >>> 1), 256 + Math.floor((az * span) / (period + 100))]
  const target = [WORLD - eye[0], 60, WORLD - eye[2]]
  return { eye, target }
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l] }

/** Primary ray through the centre of pixel (px, py). */
export function primaryRay(cam, px, py) {
  const f = norm(sub(cam.target, cam.eye))
  const r = norm(cross(f, [0, 1, 0]))
  const u = cross(r, f)
  const tan = FOCAL_NUM / FOCAL_DEN
  const sx = ((px + 0.5) / WIDTH * 2 - 1) * tan * (WIDTH / HEIGHT)
  const sy = (1 - (py + 0.5) / HEIGHT * 2) * tan
  return { o: cam.eye, d: norm([f[0] + r[0] * sx + u[0] * sy, f[1] + r[1] * sx + u[1] * sy, f[2] + r[2] * sx + u[2] * sy]) }
}

function hitBox(o, d, b) {
  let t0 = 0
  let t1 = Infinity
  for (let i = 0; i < 3; i++) {
    if (d[i] === 0) { if (o[i] < b.min[i] || o[i] > b.max[i]) return null; continue }
    const a = (b.min[i] - o[i]) / d[i]
    const c = (b.max[i] - o[i]) / d[i]
    t0 = Math.max(t0, Math.min(a, c))
    t1 = Math.min(t1, Math.max(a, c))
    if (t0 > t1) return null
  }
  return t0
}

/** Visibility ID of a ray: nearest box, the ground, or the sky. Walks the grid cell by cell (DDA). */
export function castRay(seed, frame, ray) {
  const { o, d } = ray
  const groundT = d[1] < 0 ? -o[1] / d[1] : Infinity
  let cx = Math.floor(o[0] / CELL)
  let cz = Math.floor(o[2] / CELL)
  const stepX = d[0] > 0 ? 1 : -1
  const stepZ = d[2] > 0 ? 1 : -1
  const dtX = d[0] !== 0 ? Math.abs(CELL / d[0]) : Infinity
  const dtZ = d[2] !== 0 ? Math.abs(CELL / d[2]) : Infinity
  let tX = d[0] !== 0 ? (((cx + (stepX > 0 ? 1 : 0)) * CELL) - o[0]) / d[0] : Infinity
  let tZ = d[2] !== 0 ? (((cz + (stepZ > 0 ? 1 : 0)) * CELL) - o[2]) / d[2] : Infinity
  let t = 0
  for (let i = 0; i < 2 * GRID + 2; i++) {
    if (t > groundT) return ID_GROUND
    if (cx >= 0 && cx < GRID && cz >= 0 && cz < GRID) {
      const b = box(seed, frame, cx, cz)
      const hit = hitBox(o, d, b)
      if (hit != null && hit <= groundT) return b.index
    }
    if (tX < tZ) { t = tX; tX += dtX; cx += stepX } else { t = tZ; tZ += dtZ; cz += stepZ }
    // left the grid and moving away from it: nothing else can be hit
    if ((cx < 0 && stepX < 0) || (cx >= GRID && stepX > 0) || (cz < 0 && stepZ < 0) || (cz >= GRID && stepZ > 0)) break
  }
  return groundT < Infinity ? ID_GROUND : ID_SKY
}

/** Visibility ID of a pixel, as the server recomputes it. */
export const pixelId = (seed, frame, px, py) => castRay(seed, frame, primaryRay(camera(seed, frame), px, py))

/** True when a tile shows at least one box and more than one ID: only those prove anything. Samples a 4x4 lattice. */
export function tileHasEdges(seed, frame, tile) {
  const x0 = (tile % TILES_X) * TILE
  const y0 = Math.floor(tile / TILES_X) * TILE
  const seen = new Set()
  for (let y = 0; y < TILE; y += 4) for (let x = 0; x < TILE; x += 4) seen.add(pixelId(seed, frame, x0 + x, y0 + y))
  return seen.size > 1 && [...seen].some((id) => id < GRID * GRID)
}

/** Picks `count` distinct informative tiles. `random` returns [0, 1): the server passes a crypto source. */
export function pickTiles(seed, frame, count, random) {
  const out = new Set()
  for (let tries = 0; out.size < count && tries < 4000; tries++) {
    const t = Math.floor(random() * TILES_X * TILES_Y)
    if (tileHasEdges(seed, frame, t)) out.add(t)
  }
  return [...out]
}

/** Hash of one tile's IDs, row by row. Same fold as the engine's compute shader. */
export function tileHash(ids) {
  let h = 2166136261
  for (let i = 0; i < ids.length; i++) h = pcg((h ^ ids[i]) >>> 0)
  return h >>> 0
}

const sha = (...parts) => { const h = crypto.createHash('sha256'); for (const p of parts) h.update(p); return h.digest() }

/** Commitment to one frame: SHA-256 of its tile hashes as little-endian u32s. */
export function frameRoot(tileHashes) {
  const buf = Buffer.alloc(tileHashes.length * 4)
  tileHashes.forEach((h, i) => buf.writeUInt32LE(h >>> 0, i * 4))
  return sha(buf)
}

function merkleLevels(leaves) {
  const levels = [leaves]
  while (levels.at(-1).length > 1) {
    const cur = levels.at(-1)
    const next = []
    for (let i = 0; i < cur.length; i += 2) next.push(i + 1 < cur.length ? sha(cur[i], cur[i + 1]) : cur[i]) // odd node promoted
    levels.push(next)
  }
  return levels
}

export const merkleRoot = (leaves) => merkleLevels(leaves).at(-1)[0]

/** Siblings from a leaf to the root; a promoted node has none on that level. */
export function merklePath(leaves, index) {
  const path = []
  let i = index
  for (const level of merkleLevels(leaves).slice(0, -1)) {
    const sib = i ^ 1
    if (sib < level.length) path.push({ left: sib < i, hash: level[sib].toString('hex') })
    i >>= 1
  }
  return path
}

export function verifyPath(leaf, path, root) {
  let h = leaf
  for (const n of path) { const s = Buffer.from(n.hash, 'hex'); h = n.left ? sha(s, h) : sha(h, s) }
  return h.equals(root)
}
