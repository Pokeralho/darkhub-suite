// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

// @ts-ignore plain JS module
const mod = await import('../electron/services/FramePacerEngine.js');
const { normalizeAdapterLuid } = mod;
const engine = mod.default;

describe('FramePacerEngine adapter filter', () => {
  it('normalises a DXGI LUID to lower-case hex and rejects garbage', () => {
    expect(normalizeAdapterLuid(undefined)).toBeNull();
    expect(normalizeAdapterLuid('')).toBe('0');
    expect(normalizeAdapterLuid('0x000000000000B796')).toBe('000000000000b796');
    expect(normalizeAdapterLuid('b796')).toBe('b796');
    expect(normalizeAdapterLuid('12345678901234567')).toBeNull(); // > 16 digits
    expect(normalizeAdapterLuid('b796; calc')).toBeNull();
  });

  it('sends the selected adapter to the native limiter with the config', () => {
    const write = vi.fn();
    engine._nativeProcess = { stdin: { destroyed: false, write } };
    engine.updateConfig({ targetFps: 60, pacingMode: 'flatline', adapterLuid: '0xB796' });
    expect(JSON.parse(write.mock.calls[0][0])).toEqual({ targetFps: 60, pacingMode: 'flatline', adapterLuid: 'b796' });
    engine.updateConfig({ adapterLuid: 'not hex' }); // ignored, keeps the previous value
    expect(JSON.parse(write.mock.calls[1][0]).adapterLuid).toBe('b796');
    engine._nativeProcess = null;
  });
});

describe('FramePacerEngine start and failures', () => {
  const fakeProc = () => {
    const { EventEmitter } = require('node:events');
    const p: any = new EventEmitter();
    p.stdin = { destroyed: false, write: vi.fn(), on: vi.fn() };
    p.stdout = new EventEmitter();
    p.stderr = new EventEmitter();
    p.kill = vi.fn();
    p.exitCode = null;
    return p;
  };

  it('keeps 0 (unlimited) and rejects an unknown pacing mode', async () => {
    if (process.platform !== 'win32') {
      const r = engine.start({ targetFps: 0, pacingMode: 'bogus' });
      expect(r).toMatchObject({ ok: false, unsupported: true, platform: process.platform, reason: 'windows-only' });
      engine.stop();
      return;
    }
    const { spawn } = await import('node:child_process');
    const proc = fakeProc();
    (spawn as any).mockReturnValue(proc);
    const r = engine.start({ targetFps: 0, pacingMode: 'bogus' });
    expect(r).toMatchObject({ ok: true, targetFps: 0, pacingMode: 'flatline' });
    engine.stop();
  });

  it('stops and reports the error when the native limiter cannot start', async () => {
    if (process.platform !== 'win32') {
      const r = engine.start({ targetFps: 60 });
      expect(r).toMatchObject({ ok: false, unsupported: true, platform: process.platform, reason: 'windows-only' });
      expect(engine.isRunning).toBe(false);
      return;
    }
    const { spawn } = await import('node:child_process');
    const proc = fakeProc();
    (spawn as any).mockReturnValue(proc);
    const statuses: any[] = [];
    const onStatus = (s: any) => statuses.push(s);
    engine.on('status', onStatus);
    engine.start({ targetFps: 60 });
    proc.emit('error', new Error('spawn ENOENT'));
    proc.emit('exit', -2);
    expect(engine.isRunning).toBe(false);
    expect(engine.getMetrics()).toMatchObject({ isRunning: false });
    expect(engine.getMetrics().error).toMatch(/ENOENT/);
    expect(statuses.at(-1)).toMatchObject({ isRunning: false });
    engine.off('status', onStatus);
  });
});
