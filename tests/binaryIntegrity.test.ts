// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { integrityError, readManifest, sha256File, verifyBinaries } from '../electron/services/binaryIntegrity.js';
// @ts-ignore plain JS module
import { collect } from '../scripts/gen-integrity.mjs';

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'integrity-'));
  fs.mkdirSync(path.join(dir, 'hwsensors'));
  fs.writeFileSync(path.join(dir, 'DarkHub.GpuBench.exe'), 'engine');
  fs.writeFileSync(path.join(dir, 'hwsensors', 'a.dll'), 'a');
  fs.writeFileSync(path.join(dir, 'hwsensors', 'b.exe'), 'b');
  const manifest = Object.fromEntries(['DarkHub.GpuBench.exe', 'hwsensors/a.dll', 'hwsensors/b.exe'].map((n) => [n, sha256File(path.join(dir, n))]));
  return { dir, manifest };
}

describe('binary integrity', () => {
  it('the committed manifest matches the committed helpers (run `npm run integrity` after rebuilding one)', () => {
    expect(readManifest()).toEqual(collect());
  });

  it('covers the engine and every file the sensor helper loads', () => {
    const m = readManifest()!;
    expect(m['DarkHub.GpuBench.exe']).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(m).filter((n) => n.startsWith('hwsensors/') && n.endsWith('.dll')).length).toBeGreaterThan(5);
    expect(verifyBinaries(['DarkHub.GpuBench.exe', 'hwsensors/']).ok).toBe(true);
  });

  it('accepts untouched files and checks only the group asked for', () => {
    const { dir, manifest } = fixture();
    expect(verifyBinaries(['hwsensors/'], { dir, manifest })).toEqual({ ok: true, checked: 2, problems: [] });
    fs.writeFileSync(path.join(dir, 'DarkHub.GpuBench.exe'), 'changed');
    expect(verifyBinaries(['hwsensors/'], { dir, manifest }).ok).toBe(true);
  });

  it('catches a swapped file, a missing file, and a group with no entry', () => {
    const { dir, manifest } = fixture();
    fs.writeFileSync(path.join(dir, 'hwsensors', 'a.dll'), 'evil');
    fs.rmSync(path.join(dir, 'hwsensors', 'b.exe'));
    expect(verifyBinaries(['hwsensors/'], { dir, manifest }).problems).toEqual([{ file: 'hwsensors/a.dll', reason: 'mismatch' }, { file: 'hwsensors/b.exe', reason: 'missing' }]);
    expect(verifyBinaries(['nothing.exe'], { dir, manifest }).ok).toBe(false);
    expect(verifyBinaries(['hwsensors/'], { dir, manifest: null }).ok).toBe(false);
  });

  it('refuses when installed, only warns in a development checkout', () => {
    const { dir, manifest } = fixture();
    fs.writeFileSync(path.join(dir, 'DarkHub.GpuBench.exe'), 'changed');
    const logs: string[] = [];
    expect(integrityError(['DarkHub.GpuBench.exe'], { dir, manifest, enforce: true })).toContain('integrity_failed');
    expect(integrityError(['DarkHub.GpuBench.exe'], { dir, manifest, enforce: false, log: (m: string) => logs.push(m) })).toBeNull();
    expect(logs[0]).toContain('DarkHub.GpuBench.exe (mismatch)');
    expect(integrityError(['hwsensors/'], { dir, manifest, enforce: true })).toBeNull();
  });
});
