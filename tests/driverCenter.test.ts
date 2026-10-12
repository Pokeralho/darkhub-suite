import { describe, it, expect, vi } from 'vitest';

// PowerShellRunner (imported transitively) pulls electron-log; stub it so the module loads in jsdom.
vi.mock('electron-log', () => ({ default: { info() {}, warn() {}, error() {} }, info() {}, warn() {}, error() {} }));

// @ts-ignore plain JS module
import * as D from '../electron/services/DriverCenterService.js';

describe('DriverCenter vendor classification', () => {
  it('maps NVIDIA names', () => {
    for (const n of ['NVIDIA GeForce RTX 4080', 'NVIDIA GeForce GTX 1660', 'Quadro P2000', 'NVIDIA Titan RTX']) {
      expect(D.classifyVendor(n)).toBe('nvidia');
    }
  });
  it('maps AMD names (incl. Ryzen iGPU)', () => {
    for (const n of ['AMD Radeon RX 7900 XTX', 'Radeon(TM) Graphics', 'AMD Ryzen 7 5700G with Radeon Graphics']) {
      expect(D.classifyVendor(n)).toBe('amd');
    }
  });
  it('maps Intel names', () => {
    for (const n of ['Intel(R) Arc(TM) A770', 'Intel(R) UHD Graphics 770', 'Intel Iris Xe Graphics']) {
      expect(D.classifyVendor(n)).toBe('intel');
    }
  });
  it('flags virtual/remote adapters and unknowns', () => {
    expect(D.classifyVendor('Microsoft Basic Display Adapter')).toBe('virtual');
    expect(D.classifyVendor('Parsec Virtual Display Adapter')).toBe('virtual');
    expect(D.classifyVendor('')).toBe('other');
    expect(D.classifyVendor('SomeFuture GPU 9000')).toBe('other');
  });
});

describe('DriverCenter official source handling', () => {
  it('returns official sources only for real vendors', () => {
    expect(D.officialSourcesFor('nvidia')).toHaveProperty('manual');
    expect(D.officialSourcesFor('amd')).toHaveProperty('autoDetect');
    expect(D.officialSourcesFor('virtual')).toBeNull();
    expect(D.officialSourcesFor('other')).toBeNull();
  });
  it('accepts only https official vendor hosts', () => {
    expect(D.isOfficialDriverUrl('https://www.nvidia.com/Download/index.aspx')).toBe(true);
    expect(D.isOfficialDriverUrl('https://www.amd.com/en/support')).toBe(true);
    expect(D.isOfficialDriverUrl('https://www.intel.com/content/www/us/en/download-center/home.html')).toBe(true);
    expect(D.isOfficialDriverUrl('http://www.nvidia.com/Download')).toBe(false); // not https
    expect(D.isOfficialDriverUrl('https://nvidia.com.evil.com/x')).toBe(false); // host spoof
    expect(D.isOfficialDriverUrl('https://drivers.example.com')).toBe(false);
    expect(D.isOfficialDriverUrl('not a url')).toBe(false);
  });
});

describe('DriverCenter normalizeAdapter', () => {
  it('attaches vendor, dedicated flag and official sources', () => {
    const a = D.normalizeAdapter({ name: 'NVIDIA GeForce RTX 4090', driverVersion: '551.23', vramMb: 24576 });
    expect(a.vendor).toBe('nvidia');
    expect(a.isDedicated).toBe(true);
    expect(a.officialSources).not.toBeNull();
    expect(a.driverVersion).toBe('551.23');
  });
  it('treats low-VRAM non-NVIDIA as integrated', () => {
    const a = D.normalizeAdapter({ name: 'Intel UHD Graphics 770', vramMb: 128 });
    expect(a.vendor).toBe('intel');
    expect(a.isDedicated).toBe(false);
  });
});

describe('DriverCenter resolveOfficialUrl', () => {
  const svc = new D.DriverCenterService({ runner: async () => ({ stdout: '{}', code: 0 }) });
  it('resolves a validated official url for a known vendor/kind', () => {
    const r = svc.resolveOfficialUrl('nvidia', 'autoDetect');
    expect(r.ok).toBe(true);
    expect(D.isOfficialDriverUrl(r.url)).toBe(true);
  });
  it('falls back to manual for an unknown kind', () => {
    const r = svc.resolveOfficialUrl('amd', 'bogusKind');
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('manual');
  });
  it('refuses an unknown vendor', () => {
    expect(svc.resolveOfficialUrl('banana').ok).toBe(false);
  });
});

describe('DriverCenter detectAdapters (injected runner)', () => {
  it('parses adapters and reboot flag from the runner JSON', async () => {
    const payload = JSON.stringify({ adapters: [{ name: 'Intel Arc A770', driverVersion: '31.0.101', vramMb: 8192 }], rebootPending: true });
    const svc = new D.DriverCenterService({ runner: async () => ({ stdout: payload, stderr: '', code: 0 }) });
    const res = await svc.detectAdapters();
    if (process.platform === 'win32') {
      expect(res.ok).toBe(true);
      expect(res.rebootPending).toBe(true);
      expect(res.adapters[0].vendor).toBe('intel');
      expect(res.adapters[0].isDedicated).toBe(true);
    } else {
      expect(res.ok).toBe(false); // non-Windows guard
    }
  });
});
