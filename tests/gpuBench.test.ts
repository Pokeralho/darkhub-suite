import { describe, expect, it } from 'vitest';
import * as S from '../electron/services/gpubench/sceneModel.js';
import { decodeFrameUs, driverFlags, frameStats, localPlan, scoreOf, sensorSummary } from '../electron/services/gpubench/gpuBenchModel.js';

describe('scene model', () => {
  it('matches the known PCG values, which the engine and shaders share', () => {
    expect(S.pcg(0)).toBe(129708002);
    expect(S.pcg(1)).toBe(2831084092);
    expect(S.pcg(0xdeadbeef)).toBe(1730779506);
  });

  it('keeps every box inside its cell and the camera above every box', () => {
    for (const [seed, frame] of [[1, 0], [12345, 500], [0xdeadbeef, 3000]]) {
      const cam = S.camera(seed, frame);
      for (let z = 0; z < S.GRID; z += 7) for (let x = 0; x < S.GRID; x += 7) {
        const b = S.box(seed, frame, x, z);
        expect(b.min[0]).toBeGreaterThan(x * S.CELL);
        expect(b.max[0]).toBeLessThan((x + 1) * S.CELL);
        expect(b.max[1]).toBeLessThan(cam.eye[1]);
      }
    }
  });

  it('sees different pictures for different seeds', () => {
    const tiles = S.pickTiles(5, 100, 6, () => Math.random());
    expect(tiles.length).toBeGreaterThan(3);
    let same = 0, total = 0;
    for (const t of tiles) for (let i = 0; i < 16; i++) {
      const x = (t % S.TILES_X) * S.TILE + i, y = Math.floor(t / S.TILES_X) * S.TILE + i;
      if (S.pixelId(5, 100, x, y) === S.pixelId(6, 100, x, y)) same++;
      total++;
    }
    expect(same / total).toBeLessThan(0.5);
  });

  it('only picks tiles that show a box and an edge', () => {
    for (const t of S.pickTiles(9, 40, 8, () => Math.random())) expect(S.tileHasEdges(9, 40, t)).toBe(true);
  });

  it('accepts a real Merkle path and refuses a changed leaf', () => {
    const leaves = [1, 2, 3, 4, 5, 6, 7].map((i) => S.frameRoot([i]));
    const root = S.merkleRoot(leaves);
    leaves.forEach((l, i) => expect(S.verifyPath(l, S.merklePath(leaves, i), root)).toBe(true));
    expect(S.verifyPath(S.frameRoot([99]), S.merklePath(leaves, 3), root)).toBe(false);
  });
});

describe('gpu bench model', () => {
  it('computes fps and 1% low from frame times', () => {
    const us = [...Array(99).fill(10000), 50000];
    const s = frameStats(us);
    expect(s.frames).toBe(100);
    expect(s.fps).toBeCloseTo(100 / 1.04, 3);
    expect(s.low1).toBeCloseTo(20, 3);
  });

  it('handles an empty trace', () => expect(frameStats([])).toEqual({ frames: 0, fps: 0, avgMs: 0, low1: 0 }));

  it('decodes the little-endian trace', () => {
    const b = Buffer.alloc(8);
    b.writeUInt32LE(1234, 0);
    b.writeUInt32LE(0xfffffff0, 4);
    expect(decodeFrameUs(b.toString('base64'))).toEqual([1234, 0xfffffff0]);
  });

  it('uses the geometric mean, and no total without ray tracing', () => {
    expect(scoreOf({ rasterFps: 100, rtFps: 25 })).toEqual({ raster: 1000, rt: 250, total: 500 });
    expect(scoreOf({ rasterFps: 100 })).toEqual({ raster: 1000, rt: null, total: null });
  });

  it('skips ray tracing in the plan when the GPU has no DXR', () => {
    expect(localPlan({ dxr: false, quick: false }).every((p) => p.test === 'raster')).toBe(true);
    expect(localPlan({ dxr: true, quick: true }).map((p) => p.test)).toEqual(['raster', 'rt']);
  });

  it('keeps sensors it never read as null', () => {
    const s = sensorSummary([{ clock: 2500, temp: 60, load: 99, power: null }, { clock: 2600, temp: 70, load: 100, power: null }]);
    expect(s.gpuClockAvg).toBe(2550);
    expect(s.gpuTempMax).toBe(70);
    expect(s.gpuPowerAvg).toBeNull();
  });

  it('tags driver settings away from their default, and says when nothing was read', () => {
    const set = (value: number, def: number | null) => ({ state: 'set', value, default: def });
    expect(driverFlags({ ok: true, settings: { texture_quality: set(20, 0), vsync: set(5, 5), lod_bias: { state: 'default' }, frame_limiter: set(60, null) } })).toEqual(['driver_frame_limiter', 'driver_texture_quality']);
    expect(driverFlags({ ok: true, settings: {} })).toEqual([]);
    expect(driverFlags({ ok: false, reason: 'not_nvidia' })).toEqual(['driver_unaudited']);
    expect(driverFlags(null)).toEqual(['driver_unaudited']);
  });
});
