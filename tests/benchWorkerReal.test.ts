// @vitest-environment node
// Runs the real before/after worker: the bugs found in it were in the measurement, which mocks cannot see.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BenchmarkService, SUITE } from '../electron/services/benchmark/BenchmarkService.js';

const worker = path.resolve('electron/services/benchmark/benchWorker.js');
const run = (opts: object) => {
  const r = spawnSync(process.execPath, [worker, JSON.stringify(opts)], { encoding: 'utf8', timeout: 60000, maxBuffer: 1 << 24 });
  return JSON.parse(r.stdout.trim().split('\n').pop() as string);
};

describe('before/after worker', () => {
  it('times the kernel on all cores, not thread startup', () => {
    const { samples } = run({ runs: 3, quick: true, only: ['cpuSingle', 'cpuMulti'] });
    const best = (xs: number[]) => Math.max(...xs);
    if (os.cpus().length >= 4) expect(best(samples.cpuMulti)).toBeGreaterThan(best(samples.cpuSingle) * 2.5);
  }, 60000);

  it('keeps every single-core sample close: no cold first sample, no JIT drop in the middle', () => {
    const { samples } = run({ runs: 6, quick: true, only: ['cpuSingle'] });
    expect(Math.min(...samples.cpuSingle)).toBeGreaterThan(Math.max(...samples.cpuSingle) * 0.6);
  }, 60000);

  it('leaves no temp file and reports a cancel as a cancel, when stopped in the disk test', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'benchcancel-'));
    let svc: BenchmarkService;
    const events: string[] = [];
    svc = new BenchmarkService({ app: { getPath: () => dir }, onEvent: (e: { test: string }) => {
      events.push(e.test);
      if (e.test === 'diskSeqWrite') setTimeout(() => svc.cancel(), 150);
    } } as never);
    const r = await svc.run({ quick: true, diskDir: dir });
    expect(events).toContain('diskSeqWrite');
    expect(r).toEqual({ ok: false, error: 'cancelled' });
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  }, 90000);

  it('warns when one side comes from an older version of the test', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'benchsuite-'));
    const svc = new BenchmarkService({ app: { getPath: () => dir } } as never);
    const m = { cpuSingle: { median: 100, noise: 0, samples: [100] } };
    fs.writeFileSync(path.join(dir, 'benchmarks.json'), JSON.stringify([{ id: 'a', metrics: m, context: {} }, { id: 'b', suite: SUITE, metrics: m, context: {} }]));
    expect(svc.compare('a', 'b').warnings).toContain('suite');
  });
});
