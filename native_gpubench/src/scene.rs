#![cfg(windows)]
//! The benchmark scene. Mirrors electron/services/gpubench/sceneModel.js exactly (tests/gpuBenchScene.test.ts).

pub const GRID: u32 = 64;
pub const CELL: u32 = 64;
pub const WIDTH: u32 = 2560;
pub const HEIGHT: u32 = 1440;
pub const TILE: u32 = 16;
pub const TILES_X: u32 = WIDTH / TILE;
pub const TILES_Y: u32 = HEIGHT / TILE;
pub const TILE_COUNT: u32 = TILES_X * TILES_Y;
pub const BOXES: u32 = GRID * GRID;
const WORLD: u32 = GRID * CELL;

pub fn pcg(x: u32) -> u32 {
    let state = x.wrapping_mul(747796405).wrapping_add(2891336453);
    let word = ((state >> ((state >> 28) + 4)) ^ state).wrapping_mul(277803737);
    (word >> 22) ^ word
}

pub fn hash2(a: u32, b: u32) -> u32 {
    pcg(pcg(a) ^ b)
}

fn tri(t: u32, period: u32) -> u32 {
    let p = t % period;
    if p < period / 2 { p } else { period - p }
}

pub struct Box3 {
    pub min: [u32; 3],
    pub max: [u32; 3],
}

pub fn box_at(seed: u32, frame: u32, cx: u32, cz: u32) -> Box3 {
    let h = hash2(seed, cz * GRID + cx);
    let half = 12 + (h & 15);
    let base = 40 + ((h >> 4) & 255);
    let period = 2 * (120 + ((h >> 12) & 127));
    let height = base + tri(frame.wrapping_add((h >> 20) & 1023), period);
    let x = cx * CELL + CELL / 2;
    let z = cz * CELL + CELL / 2;
    Box3 { min: [x - half, 0, z - half], max: [x + half, height, z + half] }
}

pub struct Camera {
    pub eye: [u32; 3],
    pub target: [u32; 3],
}

pub fn camera(seed: u32, frame: u32) -> Camera {
    let h = pcg(seed);
    let period = 1200 + (h & 1023);
    let ax = tri(frame.wrapping_add((h >> 10) & 2047), period * 2);
    let az = tri(frame.wrapping_add((h >> 21) & 2047), period * 2 + 200);
    let span = WORLD - 2 * 256;
    let eye = [256 + ax * span / period, 600 + (tri(frame, 600) >> 1), 256 + az * span / (period + 100)];
    Camera { eye, target: [WORLD - eye[0], 60, WORLD - eye[2]] }
}

/// Camera basis handed to the shaders: forward, right, up, built as primaryRay() builds them in JS.
pub fn basis(c: &Camera) -> ([f32; 3], [f32; 3], [f32; 3]) {
    let norm = |a: [f64; 3]| {
        let l = (a[0] * a[0] + a[1] * a[1] + a[2] * a[2]).sqrt();
        [a[0] / l, a[1] / l, a[2] / l]
    };
    let cross = |a: [f64; 3], b: [f64; 3]| [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    let d = |i: usize| c.target[i] as f64 - c.eye[i] as f64;
    let f = norm([d(0), d(1), d(2)]);
    let r = norm(cross(f, [0.0, 1.0, 0.0]));
    let u = cross(r, f);
    let g = |v: [f64; 3]| [v[0] as f32, v[1] as f32, v[2] as f32];
    (g(f), g(r), g(u))
}
