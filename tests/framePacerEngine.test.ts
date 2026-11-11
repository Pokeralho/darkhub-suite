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
