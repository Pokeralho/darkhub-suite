import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({ default: { app: { getPath: () => require('node:os').tmpdir(), isPackaged: false } }, app: { getPath: () => require('node:os').tmpdir(), isPackaged: false } }));

// @ts-ignore plain JS module
import { summarizeLhm } from '../electron/hal/collectors/lhmSummary.js';

const sample = (pawnio: boolean) => ({
  type: 'lhm', pawnio,
  hw: [
    { kind: 'Cpu', name: 'AMD Ryzen 7 5700', s: [['Temperature', 'Core (Tctl/Tdie)', 61.2], ['Temperature', 'CCD1 (Tdie)', 58.4], ['Power', 'Package', 0], ['Voltage', 'Core #1 VID', 1.55]] },
    { kind: 'GpuAmd', name: 'AMD Radeon RX 6650 XT', s: [['Temperature', 'GPU Core', 45], ['Temperature', 'GPU Hot Spot', 47], ['Power', 'GPU Package', 26], ['Fan', 'GPU Fan', 0]] },
    { kind: 'Storage', name: 'Samsung 980', s: [['Temperature', 'Temperature', 38]] },
    { kind: 'SuperIO', name: 'Nuvoton NCT6796D', s: [['Fan', 'Fan #1', 1123.4], ['Fan', 'Fan #2', 0], ['Voltage', 'Vcore', 1.21], ['Voltage', '+12V', 12.1], ['Voltage', 'unused', 0]] }
  ]
});

describe('advanced sensors summary', () => {
  it('without PawnIO ignores CPU and Super I/O placeholders but keeps GPU and disks', () => {
    const s = summarizeLhm(sample(false));
    expect(s.cpu).toBeNull();
    expect(s.cpuCores).toEqual([]);
    expect(s.fans).toEqual([]);
    expect(s.voltages).toEqual([]);
    expect(s.gpus[0]).toMatchObject({ temp: 45, hotspot: 47, power: 26 });
    expect(s.disks).toEqual([{ name: 'Samsung 980', temp: 38 }]);
  });
  it('with PawnIO reads Tctl/Tdie, cores, real fans and voltages; 0 W power is not reported', () => {
    const s = summarizeLhm(sample(true));
    expect(s.cpu).toEqual({ name: 'AMD Ryzen 7 5700', temp: 61.2, power: null });
    expect(s.cpuCores).toEqual([{ name: 'CCD1 (Tdie)', temp: 58.4 }]);
    expect(s.fans).toEqual([{ name: 'Fan #1', rpm: 1123 }]);
    expect(s.voltages.map((v: any) => v.name)).toEqual(['Vcore', '+12V']);
  });
  it('tolerates garbage', () => {
    expect(summarizeLhm(null).gpus).toEqual([]);
    expect(summarizeLhm({ hw: [{ kind: 'Cpu' }] }).cpu).toBeNull();
  });
});

describe('advanced sensors daemon', () => {
  it('is off by default and never spawns the helper on its own', async () => {
    // @ts-ignore plain JS module
    const { default: daemon } = await import('../electron/hal/collectors/HwSensorsDaemon.js');
    daemon._settingsFile = require('node:path').join(require('node:os').tmpdir(), `dh-hw-${Date.now()}.json`);
    expect(daemon.enabled).toBe(false);
    daemon.start();
    expect(daemon.process).toBeNull();
  });
});

describe('PawnIO install', () => {
  it('downloads the pinned official build, checks the signature and the real service key', async () => {
    let dl: any = null;
    vi.doMock('../electron/services/SecureDownload.js', () => ({ downloadToFile: async (url: string, _f: string, o: any) => { dl = { url, ...o }; } }));
    // @ts-ignore plain JS module
    const { installPawnIo, PAWNIO } = await import('../electron/services/hwsensors/pawnio.js');
    let script = '';
    const r = await installPawnIo(async (s: string) => { script = s; return { ok: true, out: '' }; });
    expect(r.ok).toBe(true);
    expect(dl.url).toBe(PAWNIO.url);
    expect(dl.expectedSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(script).toContain('Get-AuthenticodeSignature');
    expect(script).toContain('-install');
    expect(script).toContain(String.raw`'HKLM:\SYSTEM\CurrentControlSet\Services\PawnIO'`);
  });
});

describe('advanced sensors: no guessing', () => {
  it('never uses a "Distance to TjMax" margin as the CPU temperature, and reads current core names', () => {
    const s = summarizeLhm({ pawnio: true, hw: [{ kind: 'Cpu', name: 'Intel Core i7', s: [['Temperature', 'CPU Core #1 Distance to TjMax', 62], ['Temperature', 'CPU Core #1', 38], ['Temperature', 'Core Max', 40]] }] });
    expect(s.cpu).toBeNull();
    expect(s.cpuCores).toEqual([{ name: 'CPU Core #1', temp: 38 }]);
  });
});

describe('full LHM sensor tree', () => {
  it('with ring 0 lists every sensor of every component', () => {
    const s = summarizeLhm({ ...sample(true), admin: true });
    expect(s.ring0).toBe(true);
    expect(s.tree.map((h: any) => h.kind)).toEqual(['Cpu', 'GpuAmd', 'Storage', 'SuperIO']);
    expect(s.tree[3].sensors).toHaveLength(5);
  });
  it('PawnIO without an elevated helper hides CPU placeholders and Super I/O, keeps CPU load and GPU', () => {
    const p = sample(true);
    p.hw[0].s.push(['Load', 'CPU Total', 37.6]);
    const s = summarizeLhm({ ...p, admin: false });
    expect(s.ring0).toBe(false);
    expect(s.cpu).toBeNull();
    expect(s.fans).toEqual([]);
    expect(s.tree.find((h: any) => h.kind === 'Cpu').sensors).toEqual([{ type: 'Load', name: 'CPU Total', value: 37.6 }]);
    expect(s.tree.some((h: any) => h.kind === 'SuperIO')).toBe(false);
    expect(s.tree.find((h: any) => h.kind === 'GpuAmd').sensors).toHaveLength(4);
  });
});
