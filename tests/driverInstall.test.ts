import { describe, it, expect, vi } from 'vitest';

vi.mock('electron-log', () => ({ default: { info() {}, warn() {}, error() {} }, info() {}, warn() {}, error() {} }));

// @ts-ignore plain JS module
import * as P from '../electron/services/drivers/driverPlan.js';
// @ts-ignore plain JS module
import { DriverInstallService, buildInstallScript, wuErrorKind } from '../electron/services/drivers/DriverInstallService.js';

const NV_GPU_BASIC = {
  name: 'Microsoft Basic Display Adapter', cls: 'Display', code: 0, service: 'BasicDisplay',
  instanceId: 'PCI\\VEN_10DE&DEV_2D05&SUBSYS_53711462&REV_A1\\4&1C5D7D4&0&0009',
  hardwareIds: ['PCI\\VEN_10DE&DEV_2D05&SUBSYS_53711462&REV_A1', 'PCI\\VEN_10DE&DEV_2D05&SUBSYS_53711462', 'PCI\\VEN_10DE&DEV_2D05&CC_030000', 'PCI\\VEN_10DE&DEV_2D05'],
  compatibleIds: ['PCI\\VEN_10DE&CC_030000'], provider: '(Standard display types)'
};
const NIC_NO_DRIVER = {
  name: 'Ethernet Controller', cls: '', code: 28, service: '', instanceId: 'PCI\\VEN_10EC&DEV_8125&SUBSYS_86771043&REV_05\\01',
  hardwareIds: ['PCI\\VEN_10EC&DEV_8125&SUBSYS_86771043&REV_05', 'PCI\\VEN_10EC&DEV_8125&SUBSYS_86771043', 'PCI\\VEN_10EC&DEV_8125'], compatibleIds: ['PCI\\CC_020000']
};
const PS2_GHOST = { name: 'Teclado PS/2', cls: 'Keyboard', code: 24, instanceId: 'ACPI\\PNP0303\\4&1', hardwareIds: ['ACPI\\VEN_PNP&DEV_0303'] };
const DISABLED = { name: 'Bluetooth', cls: 'Bluetooth', code: 22, instanceId: 'USB\\VID_1\\2', hardwareIds: ['USB\\VID_8087&PID_0026'] };

describe('problem codes', () => {
  it('maps the codes a driver can fix and ignores the rest', () => {
    expect(P.problemReason(28)).toBe('noDriver');
    expect(P.problemReason(1)).toBe('noDriver');
    for (const c of [10, 18, 31, 39, 43, 52]) expect(P.problemReason(c)).toBe('driverError');
    expect(P.problemReason(14)).toBe('restart');
    for (const c of [0, 22, 24, 45, 47, 'x', undefined]) expect(P.problemReason(c as any)).toBeNull();
  });
});

describe('scan normalization', () => {
  it('detects a GPU on the Microsoft basic driver from the PCI id and BasicDisplay service', () => {
    const d = P.normalizeDevice(NV_GPU_BASIC);
    expect(d).toMatchObject({ isGpu: true, vendor: 'nvidia', reason: 'genericGpu', boardPartner: 'MSI' });
    expect(d.pci).toEqual({ ven: '10DE', dev: '2D05', subsys: '53711462' });
  });
  it('treats AMD (1002) and Intel (8086) display adapters as GPUs', () => {
    expect(P.normalizeDevice({ ...NV_GPU_BASIC, instanceId: 'PCI\\VEN_1002&DEV_73BF\\1', hardwareIds: ['PCI\\VEN_1002&DEV_73BF'] }).vendor).toBe('amd');
    expect(P.normalizeDevice({ ...NV_GPU_BASIC, instanceId: 'PCI\\VEN_8086&DEV_A780\\1', hardwareIds: ['PCI\\VEN_8086&DEV_A780'] }).vendor).toBe('intel');
  });
  it('a GPU with the vendor driver is not flagged', () => {
    const d = P.normalizeDevice({ ...NV_GPU_BASIC, name: 'NVIDIA GeForce RTX 5060', service: 'nvlddmkm', provider: 'NVIDIA' });
    expect(d.reason).toBeNull();
    expect(d.isGpu).toBe(true);
  });
  it('keeps devices needing a driver and display adapters, drops ghosts and disabled devices', () => {
    const s = P.normalizeScan({ devices: [NV_GPU_BASIC, NIC_NO_DRIVER, PS2_GHOST, DISABLED], osBuild: 26100, laptop: false, cpu: 'AMD Ryzen 7', wu: { status: 'Stopped', start: 4, excludeDrivers: 1 } });
    expect(s.devices.map((d: any) => d.name)).toEqual(['Microsoft Basic Display Adapter', 'Ethernet Controller']);
    expect(s.missing).toHaveLength(2);
    expect(s.gpus).toHaveLength(1);
    expect(s.wu).toMatchObject({ serviceStart: 4, excludeDrivers: true, noInternetLocations: false });
    expect(P.wuBlockers(s.wu)).toEqual(['serviceDisabled', 'driversExcluded']);
  });
  it('accepts a single object where PowerShell collapses an array', () => {
    const s = P.normalizeScan({ devices: NIC_NO_DRIVER, wu: {} });
    expect(s.missing).toHaveLength(1);
    expect(P.wuBlockers(s.wu)).toEqual([]);
  });
});

describe('Windows Update parsing', () => {
  const raw = [
    { id: '641A436B-22F6-4931-95EE-026F80BE157F', title: 'Realtek - Net - 10.1', driverClass: 'Net', hardwareId: 'PCI\\VEN_10EC&DEV_8125', size: 1200000, date: '2026-01-02' },
    { id: '641a436b-22f6-4931-95ee-026f80be157f', title: 'dup' },
    { id: 'not-a-guid', title: 'bad' },
    { id: '740c4b6c-bcfa-4f97-ae49-7bcc6933e696', title: 'NVIDIA - Display - 32.0.15.1', driverClass: 'Display', hardwareId: 'pci\\ven_10de&dev_2d05' }
  ];
  it('lower-cases ids, drops duplicates and bad ids', () => {
    const u = P.normalizeWuUpdates(raw);
    expect(u.map((x: any) => x.id)).toEqual(['641a436b-22f6-4931-95ee-026f80be157f', '740c4b6c-bcfa-4f97-ae49-7bcc6933e696']);
    expect(u[0].hardwareId).toBe('pci\\ven_10ec&dev_8125');
    expect(P.normalizeWuUpdates(null)).toEqual([]);
  });
  it('matches updates to devices by hardware id (case-insensitive)', () => {
    const devices = [P.normalizeDevice(NV_GPU_BASIC), P.normalizeDevice(NIC_NO_DRIVER)];
    const [net, gpu] = P.normalizeWuUpdates(raw);
    expect(P.devicesForUpdate(net, devices).map((d: any) => d.name)).toEqual(['Ethernet Controller']);
    expect(P.devicesForUpdate(gpu, devices).map((d: any) => d.name)).toEqual(['Microsoft Basic Display Adapter']);
    expect(P.devicesForUpdate({ hardwareId: '' }, devices)).toEqual([]);
  });
  it('classifies WUA error codes', () => {
    expect(wuErrorKind('80070422')).toBe('serviceDisabled');
    expect(wuErrorKind('80072EE7')).toBe('offline');
    expect(wuErrorKind('80240438')).toBe('policy');
    expect(wuErrorKind('DEADBEEF')).toBe('error');
  });
});

describe('vendor trust rules', () => {
  it('accepts only https .exe packages on the official download hosts', () => {
    expect(P.isTrustedPackageUrl('https://us.download.nvidia.com/Windows/621.01/621.01-desktop-win10-win11-64bit-international-dch-whql.exe', 'nvidia')).toBe(true);
    expect(P.isTrustedPackageUrl('https://drivers.amd.com/drivers/installer/26.20/whql/amd-software-adrenalin-edition-26.10.1-minimalsetup-261018_web.exe', 'amd')).toBe(true);
    expect(P.isTrustedPackageUrl('https://downloadmirror.intel.com/930514/gfx_win_101.9150.exe', 'intel')).toBe(true);
    expect(P.isTrustedPackageUrl('http://us.download.nvidia.com/x.exe', 'nvidia')).toBe(false);
    expect(P.isTrustedPackageUrl('https://download.nvidia.com.evil.tld/x.exe', 'nvidia')).toBe(false);
    expect(P.isTrustedPackageUrl('https://us.download.nvidia.com@evil.tld/x.exe', 'nvidia')).toBe(false);
    expect(P.isTrustedPackageUrl('https://us.download.nvidia.com/x.zip', 'nvidia')).toBe(false);
    expect(P.isTrustedPackageUrl('https://downloadmirror.intel.com/x.exe', 'nvidia')).toBe(false);
    expect(P.isTrustedPackageUrl('https://us.download.nvidia.com:8443/x.exe', 'nvidia')).toBe(false);
  });
  it('requires a valid signature from the vendor (subjects seen on real packages)', () => {
    const nv = 'CN=NVIDIA Corporation, OU=2008B9F, O=NVIDIA Corporation, L=Santa Clara, S=California, C=US';
    expect(P.isExpectedSigner('nvidia', { status: 'Valid', subject: nv })).toBe(true);
    expect(P.isExpectedSigner('nvidia', { status: 'HashMismatch', subject: nv })).toBe(false);
    expect(P.isExpectedSigner('amd', { status: 'Valid', subject: 'CN=Advanced Micro Devices, O=Advanced Micro Devices, S=California, C=US' })).toBe(true);
    expect(P.isExpectedSigner('amd', { status: 'Valid', subject: 'CN="Advanced Micro Devices, Inc.", O="Advanced Micro Devices, Inc.", C=US' })).toBe(true);
    expect(P.isExpectedSigner('intel', { status: 'Valid', subject: 'CN=Intel Corporation, O=Intel Corporation, L=Santa Clara, S=California, C=US' })).toBe(true);
    // A look-alike organization or the wrong vendor is refused.
    expect(P.isExpectedSigner('nvidia', { status: 'Valid', subject: 'CN=x, O=NVIDIA Corporation Fake Ltd, C=US' })).toBe(false);
    expect(P.isExpectedSigner('intel', { status: 'Valid', subject: nv })).toBe(false);
    expect(P.isExpectedSigner('other', { status: 'Valid', subject: nv })).toBe(false);
  });
});

describe('NVIDIA lookup', () => {
  it('builds the device-id lookup URL', () => {
    const u = P.nvidiaLookupUrl('2d05', { osBuild: 26100, laptop: true });
    expect(u).toMatch(/^https:\/\/gfwsl\.geforce\.com\//);
    const q = JSON.parse(decodeURIComponent(u.split('getDispDrvrByDevid/')[1]));
    expect(q).toMatchObject({ dIDa: ['2D05_10DE'], osB: '26100', iLp: '1', dch: '1' });
    expect(P.nvidiaLookupUrl('zz')).toBeNull();
  });
  it('parses the answer and rejects unsupported devices / foreign URLs', () => {
    const ok = { criteria: { IsSupported: { state: 'true' } }, DriverAttributes: { Version: '621.01', NameLocalized: 'GeForce Game Ready Driver', ReleaseDateTime: '2026-10-21T00:00:00+0000', IsWHQL: '1', DownloadURLAdmin: 'https://us.download.nvidia.com/Windows/621.01/621.01-desktop-win10-win11-64bit-international-dch-whql.exe' } };
    expect(P.parseNvidiaLookup(JSON.stringify(ok))).toMatchObject({ version: '621.01', date: '2026-10-21', whql: true });
    expect(P.parseNvidiaLookup({ ...ok, criteria: { IsSupported: { state: 'false' } } })).toBeNull();
    expect(P.parseNvidiaLookup({ ...ok, DriverAttributes: { ...ok.DriverAttributes, DownloadURLAdmin: 'https://evil.tld/x.exe', DownloadURL: '' } })).toBeNull();
    expect(P.parseNvidiaLookup('not json')).toBeNull();
  });
  it('converts Windows driver versions to NVIDIA versions and compares', () => {
    expect(P.nvidiaVersionFromWindows('32.0.16.2101')).toBe('621.01');
    expect(P.nvidiaVersionFromWindows('32.0.15.6094')).toBe('560.94');
    expect(P.nvidiaVersionFromWindows('31.0.15.3623')).toBe('536.23');
    expect(P.nvidiaVersionFromWindows('bad')).toBe('');
    expect(P.compareVersions('621.01', '582.78')).toBe(1);
    expect(P.compareVersions('582.78', '621.01')).toBe(-1);
    expect(P.compareVersions('32.0.101.7092', '32.0.101.7092')).toBe(0);
  });
});

describe('AMD and Intel pages', () => {
  it('finds the AMD auto-detect tool link', () => {
    const html = '<a href="https://drivers.amd.com/drivers/installer/26.20/whql/amd-software-adrenalin-edition-26.10.1-minimalsetup-261018_web.exe">Download</a> <a href="https://drivers.amd.com/relnotes/command-line-installation.pdf">pdf</a>';
    expect(P.parseAmdDriversPage(html)).toEqual({ url: 'https://drivers.amd.com/drivers/installer/26.20/whql/amd-software-adrenalin-edition-26.10.1-minimalsetup-261018_web.exe', version: '26.10.1' });
    expect(P.parseAmdDriversPage('<html>nothing</html>')).toBeNull();
    expect(P.parseAmdDriversPage('"http://drivers.amd.com/drivers/installer/x-minimalsetup-1_web.exe"')).toBeNull();
  });
  it('picks the Intel package family from the device id, then the CPU name', () => {
    expect(P.intelPackageFor({ deviceId: '56A0' })).toBe('arc');
    expect(P.intelPackageFor({ deviceId: 'E20B' })).toBe('arc');
    expect(P.intelPackageFor({ deviceId: '7D55' })).toBe('arc');
    expect(P.intelPackageFor({ deviceId: 'A780' })).toBe('core11to14');
    expect(P.intelPackageFor({ deviceId: '9A49' })).toBe('core11to14');
    expect(P.intelPackageFor({ deviceId: '4680' })).toBe('core11to14');
    expect(P.intelPackageFor({ deviceId: '5917' })).toBe('core7to10');
    expect(P.intelPackageFor({ deviceId: '3E92' })).toBe('core7to10');
    expect(P.intelPackageFor({ deviceId: '9BC5' })).toBe('core7to10');
    expect(P.intelPackageFor({ deviceId: '1912' })).toBeNull(); // Skylake: Windows Update only
    expect(P.intelPackageFor({ deviceId: 'FFFF', cpu: 'Intel(R) Core(TM) i5-12400' })).toBe('core11to14');
    expect(P.intelPackageFor({ cpu: 'Intel(R) Core(TM) Ultra 7 155H' })).toBe('arc');
    expect(P.intelPackageFor({ cpu: 'Intel(R) Core(TM) i7-8700K CPU @ 3.70GHz' })).toBe('core7to10');
    expect(P.intelPackageFor({ cpu: 'Intel(R) Core(TM) i7-4790K' })).toBeNull();
  });
  it('reads the recommended download from an Intel page', () => {
    const html = '<meta name="DownloadVersion" content="32.0.101.9150 WHQL Certified"/>\n<meta name="RecommendedDownloadUrl" content="https://downloadmirror.intel.com/930514/gfx_win_101.9150.exe"/><meta name="title" content="Intel Arc Graphics - Windows*"/>';
    expect(P.parseIntelDownloadPage(html)).toEqual({ url: 'https://downloadmirror.intel.com/930514/gfx_win_101.9150.exe', version: '32.0.101.9150', title: 'Intel Arc Graphics - Windows*' });
    expect(P.parseIntelDownloadPage('<meta name="RecommendedDownloadUrl" content="https://evil.tld/a.exe"/>')).toBeNull();
  });
  it('uses silent switches for NVIDIA and Intel, none for the AMD tool', () => {
    expect(P.vendorInstallArgs('nvidia')).toEqual(['-s', '-noreboot', '-noeula']);
    expect(P.vendorInstallArgs('nvidia', { clean: true })).toContain('-clean');
    expect(P.vendorInstallArgs('intel', { clean: true })).toEqual(['-s', '--overwrite']);
    expect(P.vendorInstallArgs('amd')).toEqual([]);
    expect(P.vendorIsSilent('amd')).toBe(false);
    expect(P.interpretExitCode(3010)).toEqual({ ok: true, reboot: true });
    expect(P.interpretExitCode(1)).toEqual({ ok: false, reboot: false });
  });
});

describe('plan selection', () => {
  const devices = [P.normalizeDevice(NV_GPU_BASIC), P.normalizeDevice(NIC_NO_DRIVER)];
  const updates = P.normalizeWuUpdates([
    { id: '11111111-1111-1111-1111-111111111111', title: 'Realtek - Net', hardwareId: 'PCI\\VEN_10EC&DEV_8125' },
    { id: '22222222-2222-2222-2222-222222222222', title: 'NVIDIA - Display', hardwareId: 'PCI\\VEN_10DE&DEV_2D05' },
    { id: '33333333-3333-3333-3333-333333333333', title: 'Some optional audio update', hardwareId: 'HDAUDIO\\FUNC_01&VEN_1002' }
  ]);
  const nvPkg = { vendor: 'nvidia', deviceId: '2D05', version: '621.01', url: 'https://us.download.nvidia.com/a.exe', name: 'GeForce Game Ready Driver', needsDriver: true };

  it('recommends WU for the NIC, the NVIDIA package for the GPU (WU display driver becomes the alternative)', () => {
    const items = P.buildPlan({ devices, updates, vendor: [nvPkg] });
    const by = Object.fromEntries(items.map((i: any) => [i.id, i]));
    expect(by['wu:11111111-1111-1111-1111-111111111111']).toMatchObject({ recommended: true, fixes: [devices[1].instanceId] });
    expect(by['wu:22222222-2222-2222-2222-222222222222']).toMatchObject({ recommended: false, alternative: true });
    expect(by['wu:33333333-3333-3333-3333-333333333333']).toMatchObject({ recommended: false, alternative: false, fixes: [] });
    expect(by['vendor:nvidia:2D05']).toMatchObject({ recommended: true, silent: true, fixes: [devices[0].instanceId] });
    expect(P.recommendedIds(items).sort()).toEqual(['vendor:nvidia:2D05', 'wu:11111111-1111-1111-1111-111111111111']);
    expect(P.uncoveredDevices(devices, items)).toEqual([]);
  });

  it('without a vendor package the WU display driver is recommended', () => {
    const items = P.buildPlan({ devices, updates, vendor: [] });
    expect(P.recommendedIds(items)).toContain('wu:22222222-2222-2222-2222-222222222222');
  });

  it('AMD: a WU display driver wins over the interactive tool; the tool is recommended only when WU has nothing', () => {
    const amdGpu = P.normalizeDevice({ ...NV_GPU_BASIC, instanceId: 'PCI\\VEN_1002&DEV_73BF\\1', hardwareIds: ['PCI\\VEN_1002&DEV_73BF'] });
    const amdTool = { vendor: 'amd', deviceId: '73BF', version: '26.10.1', url: 'https://drivers.amd.com/x-minimalsetup_web.exe', name: 'AMD tool', needsDriver: true };
    const wuAmd = P.normalizeWuUpdates([{ id: '44444444-4444-4444-4444-444444444444', title: 'AMD - Display', hardwareId: 'PCI\\VEN_1002&DEV_73BF' }]);
    const withWu = P.buildPlan({ devices: [amdGpu], updates: wuAmd, vendor: [amdTool] });
    expect(P.recommendedIds(withWu)).toEqual(['wu:44444444-4444-4444-4444-444444444444']);
    expect(withWu.find((i: any) => i.id === 'vendor:amd:73BF')).toMatchObject({ alternative: true, silent: false });
    const noWu = P.buildPlan({ devices: [amdGpu], updates: [], vendor: [amdTool] });
    expect(P.recommendedIds(noWu)).toEqual(['vendor:amd:73BF']);
  });

  it('offers a newer vendor driver for a working GPU without recommending it, and hides an up-to-date one', () => {
    const working = P.normalizeDevice({ ...NV_GPU_BASIC, name: 'NVIDIA GeForce RTX 5060', service: 'nvlddmkm', provider: 'NVIDIA' });
    const newer = P.buildPlan({ devices: [working], updates: [], vendor: [{ ...nvPkg, needsDriver: false, installedVersion: '582.78' }] });
    expect(newer[0]).toMatchObject({ recommended: false, updateAvailable: true, installedVersion: '582.78' });
    const same = P.buildPlan({ devices: [working], updates: [], vendor: [{ ...nvPkg, needsDriver: false, installedVersion: '621.01' }] });
    expect(same).toEqual([]);
  });

  it('lists devices nothing covers', () => {
    expect(P.uncoveredDevices(devices, []).map((d: any) => d.name)).toEqual(['Microsoft Basic Display Adapter', 'Ethernet Controller']);
  });
});

describe('progress protocol and install script', () => {
  it('parses progress lines', () => {
    expect(P.parseProgressLine('DHP|wu:11111111-1111-1111-1111-111111111111|installing|')).toEqual({ id: 'wu:11111111-1111-1111-1111-111111111111', status: 'installing', detail: '' });
    expect(P.parseProgressLine('DHP|vendor:nvidia:2D05|failed|exit code 1')).toMatchObject({ status: 'failed', detail: 'exit code 1' });
    expect(P.parseProgressLine('DHP|restore|bogus|x')).toBeNull();
    expect(P.parseProgressLine('random output')).toBeNull();
    expect(P.parseProgressText('DHP|job|start|\r\nnoise\nDHP|job|ok|\n')).toHaveLength(2);
  });
  it('builds an ASCII script with quoted values and only valid update ids', () => {
    const s = buildInstallScript({
      progressFile: "C:\\Users\\O'Brien\\AppData\\Local\\DarkHub\\drivers\\job\\progress.log",
      restorePoint: true,
      unlockWu: true,
      updateIds: ['11111111-1111-1111-1111-111111111111', "x'; Remove-Item C:\\ -Recurse; '"],
      packages: [{ id: 'vendor:nvidia:2D05', vendor: 'nvidia', path: 'C:\\d\\621.01.exe', sha256: 'abc', args: ['-s', '-noreboot'], wait: true }]
    });
    expect(/^[\x00-\x7F]*$/.test(s)).toBe(true);
    expect(s).toContain("'11111111-1111-1111-1111-111111111111'");
    expect(s).not.toContain('Remove-Item C:');
    expect(s).toContain("O''Brien");
    expect(s).toContain("sha = 'ABC'");
    expect(s).toContain("args = @('-s','-noreboot')");
    expect(s).toContain('DEVICE_DRIVER_INSTALL');
    expect(s).toContain('if ($true) { Unlock-DhWu }');
    expect(s).toContain('O=NVIDIA Corporation');
  });
});

describe('DriverInstallService (mocked I/O)', () => {
  const scanJson = JSON.stringify({ devices: [NV_GPU_BASIC, NIC_NO_DRIVER], osBuild: 26100, laptop: false, cpu: 'AMD Ryzen 7', wu: { status: 'Stopped', start: 4 } });

  it('reports that Windows Update needs to be unlocked instead of failing silently', async () => {
    if (process.platform !== 'win32') return;
    const runner = vi.fn(async () => ({ code: 0, stdout: scanJson, stderr: '' }));
    const fetchImpl = vi.fn(async () => JSON.stringify({ criteria: { IsSupported: { state: 'true' } }, DriverAttributes: { Version: '621.01', DownloadURLAdmin: 'https://us.download.nvidia.com/Windows/621.01/a.exe' } }));
    const svc = new DriverInstallService({ runner, fetchImpl, elevatedRunner: vi.fn() });
    const r = await svc.findDrivers({});
    expect(r.ok).toBe(true);
    expect(r.wu).toMatchObject({ ok: false, needsUnlock: true, blockers: ['serviceDisabled'] });
    expect(r.recommended).toEqual(['vendor:nvidia:2D05']);
    expect(r.uncovered).toEqual([NIC_NO_DRIVER.instanceId]);
  });

  it('runs the elevated WU search when unlocking is allowed and parses its JSON', async () => {
    if (process.platform !== 'win32') return;
    const runner = vi.fn(async () => ({ code: 0, stdout: scanJson, stderr: '' }));
    const elevatedRunner = vi.fn(async () => ({ code: 0, stdout: 'DHP|wuservice|info|enabled wuauserv\nDHJSON|[{"id":"11111111-1111-1111-1111-111111111111","title":"Realtek - Net","hardwareId":"PCI\\\\VEN_10EC&DEV_8125"}]', stderr: '' }));
    const svc = new DriverInstallService({ runner, elevatedRunner, fetchImpl: vi.fn(async () => '{}') });
    const r = await svc.findDrivers({ allowUnlock: true });
    expect(elevatedRunner).toHaveBeenCalledTimes(1);
    expect(r.wu.ok).toBe(true);
    expect(r.recommended).toContain('wu:11111111-1111-1111-1111-111111111111');
  });

  it('install refuses ids that are not in the last plan', async () => {
    if (process.platform !== 'win32') return;
    const svc = new DriverInstallService({ runner: vi.fn(), elevatedRunner: vi.fn() });
    expect((await svc.install({ ids: ['wu:x'] })).ok).toBe(false);
    (svc as any)._lastPlan = { items: [], vendorById: new Map() };
    expect(await svc.install({ ids: ['vendor:nvidia:2D05'] })).toMatchObject({ ok: false, error: 'Nothing selected.' });
  });

  it('install runs one elevated job for WU items and reports per-item results', async () => {
    if (process.platform !== 'win32') return;
    const runner = vi.fn(async () => ({ code: 0, stdout: scanJson, stderr: '' }));
    const elevatedRunner = vi.fn(async (script: string) => {
      if (script.includes('DHJSON')) return { code: 0, stdout: 'DHJSON|[{"id":"11111111-1111-1111-1111-111111111111","title":"Realtek - Net","hardwareId":"PCI\\\\VEN_10EC&DEV_8125"}]', stderr: '' };
      return { code: 0, stdout: 'DHP|job|start|\nDHP|wu:11111111-1111-1111-1111-111111111111|reboot|\nDHP|job|ok|\nDHDONE', stderr: '' };
    });
    const svc = new DriverInstallService({ runner, elevatedRunner, fetchImpl: vi.fn(async () => '{}') });
    await svc.findDrivers({ allowUnlock: true });
    const events: any[] = [];
    const r = await svc.install({ ids: ['wu:11111111-1111-1111-1111-111111111111'], allowUnlock: true }, (e: any) => events.push(e));
    expect(r.ok).toBe(true);
    expect(r.rebootRequired).toBe(true);
    expect(events.some((e) => e.status === 'reboot')).toBe(true);
    const script = elevatedRunner.mock.calls.at(-1)?.[0] as string;
    expect(script).toContain("$wuIds = @('11111111-1111-1111-1111-111111111111')");
    expect(script).toContain('if ($true) { Unlock-DhWu }');
  });
});
