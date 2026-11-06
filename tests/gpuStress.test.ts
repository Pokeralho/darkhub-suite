import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { GpuBenchService } from '../electron/services/gpubench/GpuBenchService.js';
import { sampleGpu } from '../electron/services/gpubench/gpuBenchModel.js';
import { isDeviceLost, normalizeStress, stability, stressPlan, summarizeStress } from '../electron/services/gpubench/stressModel.js';

const loop = (index: number, fps: number, extra = {}) => ({ index, test: 'raster', fps, low1: fps * 0.8, clock: 2700, tempMax: 60 + index, power: 140, error: null, ...extra });

describe('stress model', () => {
  it('clamps what comes from the screen', () => {
    expect(normalizeStress({ minutes: 999, load: 'x', tempLimit: 500 })).toEqual({ minutes: 10, load: 'alternate', tempLimit: 100 });
    expect(normalizeStress({ minutes: 5, load: 'rt', tempLimit: 10 })).toEqual({ minutes: 5, load: 'rt', tempLimit: 70 });
  });

  it('alternates the tests, and falls back to raster without DXR', () => {
    expect(stressPlan({ minutes: 5, load: 'alternate', dxr: true }).loops.slice(0, 3)).toEqual(['raster', 'rt', 'raster']);
    expect(stressPlan({ minutes: 5, load: 'alternate', dxr: true }).loops).toHaveLength(10);
    expect(stressPlan({ minutes: 5, load: 'rt', dxr: false }).tests).toEqual(['raster']);
  });

  it('measures stability per test, so raster and RT frame rates are not compared with each other', () => {
    expect(stability([loop(0, 100), { ...loop(1, 50), test: 'rt' }, loop(2, 99), { ...loop(3, 50), test: 'rt' }])).toBe(99);
  });

  it('passes a steady full run', () => {
    const s = summarizeStress({ loops: [loop(0, 100), loop(1, 99), loop(2, 98)], planned: 3 });
    expect(s.verdict).toBe('pass');
    expect(s.tempMax).toBe(62);
  });

  it('fails on one wrong frame even with perfect frame rates', () => {
    const s = summarizeStress({ loops: [loop(0, 100), loop(1, 100, { error: 'image' })], planned: 2 });
    expect(s.verdict).toBe('fail');
    expect(s.reasons).toEqual(['errors']);
  });

  it('fails below 97% and flags a falling clock', () => {
    const s = summarizeStress({ loops: [loop(0, 100), loop(1, 90, { clock: 2400 })], planned: 2 });
    expect(s.reasons).toEqual(['fps_unstable']);
    expect(s.throttled).toBe(true);
  });

  it('calls moving frame rates with a steady clock inconclusive, as measured on a busy PC', () => {
    // the real run: Roblox, Spotify and Discord open, 67% CPU, clock within 0.1%, no calculation errors
    const real = [[127.9, 'raster', 2737.8], [93.2, 'rt', 2747.4], [128.4, 'raster', 2734.2], [97.2, 'rt', 2745.5], [129.4, 'raster', 2735.9], [95.0, 'rt', 2745.8]];
    const s = summarizeStress({ loops: real.map(([fps, test, clock], i) => loop(i, fps as number, { test, clock })), planned: 6 });
    expect(s.verdict).toBe('inconclusive');
    expect(s.stability).toBe(95.9);
    expect(s.reasons).toEqual([]);
  });

  it('still fails an unsteady frame rate when there is no clock reading to explain it', () => {
    expect(summarizeStress({ loops: [loop(0, 100, { clock: null }), loop(1, 90, { clock: null })], planned: 2 }).verdict).toBe('fail');
  });

  it('a calculation error beats inconclusive', () => {
    expect(summarizeStress({ loops: [loop(0, 100), loop(1, 90, { error: 'ids' })], planned: 2 }).verdict).toBe('fail');
  });

  it('never calls an interrupted run a pass', () => {
    expect(summarizeStress({ loops: [loop(0, 100)], planned: 10 }).verdict).toBe('cancelled');
    expect(summarizeStress({ loops: [loop(0, 100)], stop: 'cancelled', planned: 10 }).verdict).toBe('cancelled');
    expect(summarizeStress({ loops: [loop(0, 100)], stop: 'temp_limit', planned: 10 }).verdict).toBe('stopped');
    expect(summarizeStress({ loops: [], stop: 'device_lost', planned: 10 }).verdict).toBe('fail');
  });

  it('says so when no temperature was read', () => {
    expect(summarizeStress({ loops: [loop(0, 100, { tempMax: null })], planned: 1 }).noTempSensor).toBe(true);
  });

  it('recognises a lost device', () => {
    expect(isDeviceLost('segment: The GPU device instance has been suspended. (0x887A0005)')).toBe(true);
    expect(isDeviceLost('segment: 0x887a0006')).toBe(true);
    expect(isDeviceLost('capture: out of memory (0x8007000E)')).toBe(false);
  });

  it('reads an unavailable sensor as null, not 0', () => {
    const s = sampleGpu({ gpu: { values: { gpus: [{ temperature: { value: null }, clockCore: { value: 2700 }, utilization: null }] } } }, 1);
    expect(s).toEqual({ t: 1, clock: 2700, temp: null, load: null, power: null });
  });
});

/** Stands in for the engine process: answers each command through `script`. */
function fakeEngine(script: (cmd: Record<string, unknown>, child: EventEmitter & { kill: () => void }) => unknown) {
  return () => {
    const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), exitCode: null as number | null, kill() { child.stdout.end(); child.emit('close', null); } });
    const say = (o: unknown) => child.stdout.write(`${JSON.stringify(o)}\n`);
    setTimeout(() => say({ type: 'ready', adapter: 'Fake GPU', driver: '1', dxr: false }), 0);
    child.stdin.on('data', (d) => {
      for (const line of String(d).trim().split('\n')) {
        const out = script(JSON.parse(line), child);
        if (out) setTimeout(() => say(out), 0);
      }
    });
    return child;
  };
}

const us = Buffer.alloc(40);
for (let i = 0; i < 10; i++) us.writeUInt32LE(10000, i * 4);
const segment = { type: 'segment', frames: 10, root: 'aa', frameUs: us.toString('base64') };

function service(script: Parameters<typeof fakeEngine>[0], hardware: unknown = null) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stress-'));
  const exe = path.join(dir, 'engine.exe');
  fs.writeFileSync(exe, '');
  return new GpuBenchService({ app: { getPath: () => dir }, safeStorage: null, shell: null, hardware, onEvent: () => {}, spawnImpl: fakeEngine(script), exe } as never);
}
const fast = { loopMs: 15000, warmMs: 1 };

describe('stress service', () => {
  it('passes when every frame matches the reference', async () => {
    const svc = service((c) => (c.cmd === 'segment' ? segment : { type: 'fingerprint', ids: 'a', image: 'b' }));
    const r = await svc.stress({ minutes: 5 }, { loopMs: 60000, warmMs: 1 });
    expect(r.run.summary.verdict).toBe('pass');
    expect(r.run.loops).toHaveLength(5);
    expect(svc.stressHistory()).toHaveLength(1);
  });

  it('catches a frame that changed while hot', async () => {
    let n = 0;
    const svc = service((c) => (c.cmd === 'segment' ? segment : { type: 'fingerprint', ids: 'a', image: ++n === 3 ? 'WRONG' : 'b' }));
    const r = await svc.stress({ minutes: 5 }, { loopMs: 60000, warmMs: 1 });
    expect(r.run.summary.verdict).toBe('fail');
    expect(r.run.summary.errors).toBe(1);
    expect(r.run.loops[1].error).toBe('image');
  });

  it('fails with a clear reason when the driver loses the GPU', async () => {
    let n = 0;
    const svc = service((c) => (c.cmd !== 'segment' ? { type: 'fingerprint', ids: 'a', image: 'b' } : ++n > 2 ? { type: 'error', error: 'segment: removed (0x887A0005)' } : segment));
    const r = await svc.stress({ minutes: 5 }, { loopMs: 60000, warmMs: 1 });
    expect(r.run.summary.verdict).toBe('fail');
    expect(r.run.summary.reasons).toContain('device_lost');
  });

  it('stops the engine at the temperature limit', async () => {
    const hot = { snapshot: () => ({ gpu: { values: { gpus: [{ temperature: 96 }] } } }) };
    const svc = service((c) => (c.cmd === 'segment' ? null : { type: 'fingerprint', ids: 'a', image: 'b' }), hot); // segments never end: only the limit stops it
    const r = await svc.stress({ minutes: 5, tempLimit: 90 }, fast);
    expect(r.run.summary.verdict).toBe('stopped');
    expect(r.run.summary.stop).toBe('temp_limit');
  });

  it('reports a user stop as interrupted', async () => {
    const svc = service((c) => (c.cmd === 'segment' ? null : { type: 'fingerprint', ids: 'a', image: 'b' }));
    const p = svc.stress({ minutes: 5 }, fast);
    setTimeout(() => svc.cancel(), 30);
    const r = await p;
    expect(r.ok).toBe(false);
    expect(r.error).toBe('cancelled');
  });
});
