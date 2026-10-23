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
    expect(D.isOfficialDriverUrl('https://www.nvidia.com:8443/x')).toBe(false); // non-default port
    expect(D.isOfficialDriverUrl('https://user:pw@www.amd.com/x')).toBe(false); // embedded credentials
    expect(D.isOfficialDriverUrl('https://www.nvidia.com@evil.com/x')).toBe(false); // userinfo spoof
  });
  it('every bundled official URL passes the whitelist', () => {
    for (const src of Object.values(D.OFFICIAL_SOURCES) as Record<string, string>[]) {
      for (const url of Object.values(src)) expect(D.isOfficialDriverUrl(url)).toBe(true);
    }
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
  it('reports runner timeouts and non-JSON output instead of throwing', async () => {
    const timeout = new D.DriverCenterService({ runner: async () => { throw new Error('Command timed out after 20000ms'); } });
    const garbage = new D.DriverCenterService({ runner: async () => ({ stdout: 'not json at all', stderr: '', code: 0 }) });
    const a = await timeout.detectAdapters();
    const b = await garbage.detectAdapters();
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    expect(a.adapters).toEqual([]);
  });
});

describe('DriverCenter generic display driver (DarkOS fresh install)', () => {
  it('reads the vendor from the PCI id', () => {
    expect(D.vendorFromPnpId('PCI\\VEN_10DE&DEV_2504&SUBSYS_1')).toBe('nvidia');
    expect(D.vendorFromPnpId('PCI\\VEN_1002&DEV_73EF')).toBe('amd');
    expect(D.vendorFromPnpId('PCI\\VEN_8086&DEV_A780')).toBe('intel');
    expect(D.vendorFromPnpId('PCI\\VEN_1234&DEV_1111')).toBe('virtual');
    expect(D.vendorFromPnpId('ROOT\\BasicDisplay\\0000')).toBe(null);
  });

  it('flags a real GPU running on Microsoft Basic Display (pt-BR and en-US) and names the vendor', () => {
    const pt = D.normalizeAdapter({ name: 'Adaptador de Vídeo Básico da Microsoft', provider: '(Adaptadores de vídeo padrão)', pnpId: 'PCI\\VEN_10DE&DEV_2504&SUBSYS_1' });
    expect(pt.vendor).toBe('nvidia');
    expect(pt.genericDriver).toBe(true);
    expect(pt.model).toContain('NVIDIA');
    expect(pt.officialSources).toBeTruthy();
    expect(pt.deviceId).toBe('VEN_10DE&DEV_2504');
    const en = D.normalizeAdapter({ name: 'Microsoft Basic Display Adapter', provider: 'Microsoft', pnpId: 'PCI\\VEN_1002&DEV_73EF' });
    expect(en.vendor).toBe('amd');
    expect(en.genericDriver).toBe(true);
  });

  it('does not flag a GPU with its vendor driver, nor a VM display', () => {
    expect(D.normalizeAdapter({ name: 'AMD Radeon RX 6650 XT', provider: 'Advanced Micro Devices, Inc.', pnpId: 'PCI\\VEN_1002&DEV_73EF' }).genericDriver).toBe(false);
    const vm = D.normalizeAdapter({ name: 'Microsoft Basic Display Adapter', provider: 'Microsoft', pnpId: 'PCI\\VEN_1234&DEV_1111' });
    expect(vm.genericDriver).toBe(false);
    expect(vm.officialSources).toBe(null);
  });
});

describe('DriverCenter camera', () => {
  it('turns the raw snapshot into plain-language issues', () => {
    expect(D.cameraIssues({ devices: [{ name: 'Logi C270', status: 'OK' }], services: [], consent: {} })).toEqual([]);
    const issues = D.cameraIssues({
      devices: [{ name: 'Cam', status: 'Error', problem: 'CM_PROB_FAILED_INSTALL' }],
      services: [{ name: 'FrameServer', start: 'Disabled' }],
      captureServices: [{ name: 'CaptureService_1a2b', start: 4 }],
      consent: { machine: 'Allow', user: 'Deny', desktopApps: 'Deny' },
      policyDeny: true, cameraPolicyOff: true, ghostUsb: 1
    });
    expect(issues.length).toBe(8);
    expect(D.cameraIssues({ devices: [] })[0]).toMatch(/Nenhuma/);
  });

  it('repair: reverts the DarkOS items first, runs the elevated script and reports the steps', async () => {
    const order: string[] = [];
    const svc = new D.DriverCenterService({
      runner: async () => ({ code: 0, stdout: JSON.stringify({ devices: [{ name: 'Logi C270', status: 'OK' }], services: [], consent: {} }) }),
      elevatedRunner: async () => { order.push('elevated'); return { code: 0, stdout: 'DHSTEP|Servicos\r\nDHSTEP|Permissoes\r\nDHDONE\r\n', stderr: '' }; }
    });
    const r = await svc.repairCamera({ darkosRevert: async (ids: string[]) => { order.push(`darkos:${ids.length}`); return { ok: true }; } });
    expect(order).toEqual([`darkos:${D.DARKOS_CAMERA_ITEMS.length}`, 'elevated']);
    expect(r.ok).toBe(true);
    expect(r.steps).toEqual(['DarkOS: bloqueios de câmera e captura desfeitos', 'Servicos', 'Permissoes']);
    expect(r.issues).toEqual([]);
  });

  it('repair: reports failure when elevation is refused (no DHDONE)', async () => {
    const svc = new D.DriverCenterService({ runner: async () => ({ code: 0, stdout: '{}' }), elevatedRunner: async () => ({ code: 1, stdout: '', stderr: '' }) });
    const r = await svc.repairCamera();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/administrador/);
  });
});

describe('DriverCenter board partner', () => {
  it('reads the board maker from the PCI subsystem vendor id', () => {
    expect(D.boardPartnerFromPnpId('PCI\\VEN_10DE&DEV_2D05&SUBSYS_53711462&REV_A1\\4&1C5D7D4&0&0009')).toBe('MSI');
    expect(D.boardPartnerFromPnpId('PCI\\VEN_1002&DEV_73EF&SUBSYS_E445174B&REV_C1')).toBe('Sapphire');
    expect(D.normalizeAdapter({ name: 'NVIDIA GeForce RTX', pnpId: 'PCI\\VEN_10DE&DEV_2D05&SUBSYS_88811043' }).boardPartner).toBe('ASUS');
  });
  it('returns null for unknown or missing subsystem ids (never guesses)', () => {
    expect(D.boardPartnerFromPnpId('PCI\\VEN_10DE&DEV_2D05&SUBSYS_12349999')).toBeNull();
    expect(D.boardPartnerFromPnpId('ROOT\\BasicDisplay')).toBeNull();
  });
});
