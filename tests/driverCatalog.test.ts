// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

vi.mock('electron-log', () => ({ default: { info() {}, warn() {}, error() {} }, info() {}, warn() {}, error() {} }));

// @ts-ignore plain JS module
import * as C from '../electron/services/drivers/driverCatalog.js';
// @ts-ignore plain JS module
import * as P from '../electron/services/drivers/driverPlan.js';
// @ts-ignore plain JS module
import { DriverInstallService, buildInstallScript, mergeCabs, MICROSOFT_SIGNER_PATTERN } from '../electron/services/drivers/DriverInstallService.js';

// Markup trimmed from real catalog.update.microsoft.com pages (2026-11).
const row = (id: string, n: number, title: string, products: string, cls: string, date: string, version: string, size: number) => `
<tr id="${id}_R${n}" style="border-width:0px;">
  <td class="resultsbottomBorder resultspadding resultsIconWidth " id="${id}_C0_R${n}">
  </td><td class="resultsbottomBorder resultspadding" id="${id}_C1_R${n}">
    <a id='${id}_link' href= "javascript:void(0);" onclick='goToDetails("${id}");' class="contentTextItemSpacerNoBreakLink">
      ${title}
    </a>
  </td><td class="resultsbottomBorder resultspadding" id="${id}_C2_R${n}">
    ${products}
  </td><td class="resultsbottomBorder resultspadding" id="${id}_C3_R${n}">
    ${cls}
  </td><td class="resultsbottomBorder resultspadding " id="${id}_C4_R${n}">
    ${date}
  </td><td class="resultsbottomBorder resultspadding" id="${id}_C5_R${n}">
    ${version}
  </td><td class="resultsbottomBorder resultspadding resultsSizeWidth" id="${id}_C6_R${n}">
    <span id="${id}_size">66 KB</span>
    <span class="noDisplay" id="${id}_originalSize">${size}</span>
  </td><td class="resultsbottomBorder resultsButtonWidth" id="${id}_C7_R${n}">
    <input id="${id}" class="flatBlueButtonDownload focus-only" type="button" value='Download' />
  </td>
</tr>`;

const XEON = 'Intel - Other hardware - Intel(R) Xeon(R) E7 v3/Xeon(R) E5 v3/Core i7 Hot Plug - 2F29';
const ID_NEW = '356a49a2-d1c7-42a2-882b-4c2acb4f60d4';
const ID_OLD = 'f1e51801-2328-4c3a-a896-2e53da3135f7';
const ID_SRV = 'aaaaaaaa-0000-4000-8000-000000000001';
const ID_FW = 'aaaaaaaa-0000-4000-8000-000000000002';
const ID_EXT = 'aaaaaaaa-0000-4000-8000-000000000003';
const ID_ARM = 'aaaaaaaa-0000-4000-8000-000000000004';
const SEARCH = `<table>${[
  row(ID_OLD, 0, 'INTEL - System - 10.1.1.9', 'Windows 10 and later drivers, Windows Server Drivers', 'Drivers (Other Hardware)', '1/25/2016', 'n/a', 46291),
  row(ID_NEW, 1, XEON, 'Windows 10 Anniversary Update and Later Servicing Drivers, Windows Server 2016 and Later Servicing Drivers', 'Drivers (Other Hardware)', '8/18/2016', 'n/a', 68083),
  row(ID_SRV, 2, XEON, 'Windows Server 2016 and Later Servicing Drivers', 'Drivers (Other Hardware)', '9/1/2020', 'n/a', 1),
  row(ID_FW, 3, 'Intel - Firmware - 1.2.3', 'Windows 10 and later drivers', 'Drivers (Firmware)', '9/2/2020', '1.2.3', 1),
  row(ID_EXT, 4, 'Intel Corporation - Extension - 30.0.1', 'Windows 10, Vibranium and later, Servicing Drivers', 'Drivers (Other Hardware)', '9/3/2020', '30.0.1', 1),
  row(ID_ARM, 5, XEON, 'Windows 11 Client, version 24H2 and later, Servicing Drivers', 'Drivers (Other Hardware)', '8/18/2016', 'n/a', 68083)
].join('')}</table>`;

const details = (arch: string, ids: string[], version = '10.1.2.80') => `
<span id="ScopedViewHandler_titleText">${XEON}</span>
<div id="archDiv">
  <span id="ScopedViewHandler_labelArchitecture_Separator" class="labelTitle">Architecture:</span>

          ${arch}

</div>
<span id="ScopedViewHandler_driverClass">OtherHardware</span>
<span id="ScopedViewHandler_driverModel">Hot Plug</span>
<span id="ScopedViewHandler_driverProvider">INTEL</span>
<span id="ScopedViewHandler_version">${version}</span>
<span id="ScopedViewHandler_versionDate">8/19/2016</span>
<div class="tabBodyContentBox tabDriverPackageBodyContentBox boxTitleContainer">
  <span id="ScopedViewHandler_labelSupportedHWIDs" class="boxTitleDetails">Supported Hardware IDs</span>
  <div class="tabDriverPackageContentBox" id="driverhwIDs" TABINDEX="1">
    ${ids.map((i) => `<div style="padding-bottom: 0.3em;">\n ${i.replace(/&/g, '&amp;')}\n</div>`).join('\n')}
  </div>
</div>
<div class="tabBodyContentBox tabDriverPackageBodyContentBox boxTitleContainer">
  <span id="ScopedViewHandler_labelSupportedUpdateIDs">Supported Update IDs</span>
  <div><div style="padding-bottom: 0.3em;">${ID_NEW}</div></div>
</div>`;

const SHA_B64 = 'BLhZJlzYbijPS7hbD6Ml9z/YrE9VmpD/bwhO0SnWmeo=';
const SHA_HEX = '04b859265cd86e28cf4bb85b0fa325f73fd8ac4f559a90ff6f084ed129d699ea';
const CAB_URL = 'https://catalog.s.download.windowsupdate.com/d/msdownload/update/driver/drvs/2016/08/20965985_b21260a3484fb5deb6a70caae992e93a7200010e.cab';
const DIALOG = `var downloadInformation = new Array();
downloadInformation[0] = new Object();
downloadInformation[0].updateID ='${ID_NEW}';
downloadInformation[0].files[0] = new Object();
downloadInformation[0].files[0].url = '${CAB_URL}';
downloadInformation[0].files[0].digest = 'siJgo0hPtd62pwyq6ZLpOnIAAQ4=';
downloadInformation[0].files[0].sha256 = '${SHA_B64}';
downloadInformation[0].files[0].fileName = '20965985_b21260a3484fb5deb6a70caae992e93a7200010e.cab';`;

const HOTPLUG = {
  name: 'Dispositivo do sistema básico', cls: '', code: 28, service: '', instanceId: 'PCI\\VEN_8086&DEV_2F29&SUBSYS_00000000&REV_02\\3&1',
  hardwareIds: ['PCI\\VEN_8086&DEV_2F29&SUBSYS_00000000&REV_02', 'PCI\\VEN_8086&DEV_2F29&SUBSYS_00000000', 'PCI\\VEN_8086&DEV_2F29&CC_088000', 'PCI\\VEN_8086&DEV_2F29&CC_0880'],
  compatibleIds: ['PCI\\VEN_8086&DEV_2F29&REV_02', 'PCI\\VEN_8086&DEV_2F29', 'PCI\\VEN_8086&CC_088000', 'PCI\\VEN_8086&CC_0880', 'PCI\\VEN_8086', 'PCI\\CC_088000']
};

describe('Microsoft Update Catalog: parsing', () => {
  it('reads the search rows (id, title, products, class, ISO date, version, size)', () => {
    const rows = C.parseCatalogSearch(SEARCH);
    expect(rows).toHaveLength(6);
    expect(rows[1]).toEqual({
      id: ID_NEW, title: XEON,
      products: 'Windows 10 Anniversary Update and Later Servicing Drivers, Windows Server 2016 and Later Servicing Drivers',
      classification: 'Drivers (Other Hardware)', date: '2016-08-18', version: '', sizeBytes: 68083
    });
    expect(rows[3].version).toBe('1.2.3');
    expect(C.parseCatalogSearch('<html>no results</html>')).toEqual([]);
    expect(C.catalogDate('13/40/x')).toBe('');
  });

  it('reads architecture, hardware ids (entities decoded, lower-case) and version from the details page', () => {
    const d = C.parseCatalogDetails(details('AMD64', ['pci\\ven_8086&dev_2f29', 'PCI\\VEN_8086&DEV_2F28']));
    expect(d).toMatchObject({ title: XEON, architectures: ['AMD64'], version: '10.1.2.80', date: '2016-08-19', driverClass: 'OtherHardware', provider: 'INTEL' });
    // the "Supported Update IDs" box that follows is not part of the hardware id list
    expect(d.hardwareIds).toEqual(['pci\\ven_8086&dev_2f29', 'pci\\ven_8086&dev_2f28']);
    expect(C.parseCatalogDetails('<html></html>')).toMatchObject({ architectures: [], hardwareIds: [] });
  });

  it('takes only https .cab files on Microsoft hosts that come with a SHA-256', () => {
    expect(C.parseCatalogDownload(DIALOG)).toEqual([{ url: CAB_URL, sha256: SHA_HEX, fileName: '20965985_b21260a3484fb5deb6a70caae992e93a7200010e.cab' }]);
    const swap = (from: string, to: string) => C.parseCatalogDownload(DIALOG.replace(from, to));
    expect(swap(CAB_URL, 'http://catalog.s.download.windowsupdate.com/a.cab')).toEqual([]);
    expect(swap(CAB_URL, 'https://catalog.s.download.windowsupdate.com.evil.tld/a.cab')).toEqual([]);
    expect(swap(CAB_URL, 'https://user@catalog.s.download.windowsupdate.com/a.cab')).toEqual([]);
    expect(swap(CAB_URL, 'https://catalog.s.download.windowsupdate.com/a.exe')).toEqual([]);
    expect(swap(SHA_B64, '')).toEqual([]);
    expect(swap(SHA_B64, 'AAAA')).toEqual([]);
    expect(C.isCatalogHost('https://catalog.sf.dl.delivery.mp.microsoft.com/x')).toBe(true);
    expect(C.isCatalogHost('https://download.windowsupdate.com:8443/x')).toBe(false);
    expect(C.catalogDownloadBody(ID_NEW)).toContain(encodeURIComponent(`"updateID":"${ID_NEW}"`));
  });
});

describe('Microsoft Update Catalog: which package fits', () => {
  it('maps product names to the lowest Windows build they serve', () => {
    expect(C.productFloorFor('Windows 10 and later drivers, Windows Server Drivers', 19045)).toBe(10240);
    expect(C.productFloorFor('Windows 10, Vibranium and later, Servicing Drivers', 26100)).toBe(19041); // Win10 "and later" serves Win11
    expect(C.productFloorFor('Windows 11 Client, version 24H2 and later, Servicing Drivers', 26100)).toBe(26100);
    expect(C.productFloorFor('Windows 11 Client, version 24H2 and later, Servicing Drivers', 22631)).toBe(0);
    expect(C.productFloorFor('Windows 11 Client, version 25H2 and later, Servicing Drivers', 26100)).toBe(0);
    expect(C.productFloorFor('Windows - Client, version 21H2 and later, Servicing Drivers', 19045)).toBe(0);
    expect(C.productFloorFor('Windows 10 Fall Creators Update and Later Servicing Drivers', 15063)).toBe(0);
    expect(C.productFloorFor('Windows 10 Creators Update and Later Servicing Drivers', 15063)).toBe(15063);
    expect(C.productFloorFor('Windows 10 version 1803 and Later Servicing Drivers', 19045)).toBe(17134);
    // server-only, S mode-only, old Windows and unknown future names never match
    expect(C.productFloorFor('Windows Server 2019 and later, Servicing Drivers', 26100)).toBe(0);
    expect(C.productFloorFor('Windows 11 Client S, version 24H2 and later, Upgrade & Servicing Drivers', 26100)).toBe(0);
    expect(C.productFloorFor('Windows 8.1 and later drivers', 26100)).toBe(0);
    expect(C.productFloorFor('Windows 11 Client, version 29H2 and later, Servicing Drivers', 99999)).toBe(0);
  });

  it('ranks the candidates: same title as Windows Update first, then newest; never firmware, extension or server-only', () => {
    const rows = C.parseCatalogSearch(SEARCH);
    expect(C.rankCatalogRows(rows, { osBuild: 19045 }).map((r: any) => r.id)).toEqual([ID_NEW, ID_OLD]);
    expect(C.rankCatalogRows(rows, { osBuild: 26100 }).map((r: any) => r.id)).toEqual([ID_ARM, ID_NEW, ID_OLD]);
    expect(C.rankCatalogRows(rows, { osBuild: 26100, preferTitle: 'intel - system - 10.1.1.9' })[0].id).toBe(ID_OLD);
    expect(C.rankCatalogRows(rows, { osBuild: 9600 })).toEqual([]);
  });

  it('searches by the specific ids only (no class ids, bare vendor, revision, empty subsystem or firmware)', () => {
    expect(C.catalogQueries(HOTPLUG)).toEqual(['PCI\\VEN_8086&DEV_2F29']);
    expect(C.catalogQueries({ hardwareIds: ['PCI\\VEN_10EC&DEV_8125&SUBSYS_86771043&REV_05', 'PCI\\VEN_10EC&DEV_8125&SUBSYS_86771043', 'PCI\\VEN_10EC&DEV_8125&CC_020000'], compatibleIds: ['PCI\\VEN_10EC&DEV_8125&REV_05', 'PCI\\VEN_10EC&DEV_8125', 'PCI\\VEN_10EC'] }))
      .toEqual(['PCI\\VEN_10EC&DEV_8125&SUBSYS_86771043', 'PCI\\VEN_10EC&DEV_8125']);
    expect(C.catalogQueries({ hardwareIds: ['USB\\VID_8087&PID_0A2A&REV_0001', 'USB\\VID_8087&PID_0A2A'], compatibleIds: ['USB\\Class_E0&SubClass_01&Prot_01', 'USB\\Class_E0'] })).toEqual(['USB\\VID_8087&PID_0A2A']);
    expect(C.catalogQueries({ hardwareIds: ['ACPI\\VEN_INT&DEV_33A0', 'ACPI\\INT33A0', '*INT33A0'] })).toEqual(['ACPI\\VEN_INT&DEV_33A0', 'ACPI\\INT33A0']);
    expect(C.catalogQueries({ hardwareIds: ['UEFI\\RES_{5ffdbc0d-f34e-441d-a4b1-0a3d51b1d0b6}'] })).toEqual([]);
    expect(C.catalogQueries({ hardwareIds: ['USB\\UNKNOWN'], compatibleIds: ['USB\\DEVICE_DESCRIPTOR_FAILURE'] })).toEqual([]);
  });

  it('a package fits only with the right architecture and one of the device ids listed', () => {
    const ids = [...HOTPLUG.hardwareIds, ...HOTPLUG.compatibleIds];
    const d = C.parseCatalogDetails(details('AMD64', ['pci\\ven_8086&dev_2f29']));
    expect(C.detailsFit(d, { arch: 'AMD64', ids })).toBe(true);
    expect(C.detailsFit(d, { arch: 'ARM64', ids })).toBe(false);
    expect(C.detailsFit(C.parseCatalogDetails(details('AMD64', ['pci\\ven_8086&dev_2f28'])), { arch: 'AMD64', ids })).toBe(false);
    expect(C.matchRank(HOTPLUG, d.hardwareIds)).toBe(5); // matched through the compatible id VEN&DEV
    expect(C.matchRank(HOTPLUG, ['pci\\ven_1&dev_2'])).toBe(-1);
  });
});

describe('catalog packages in the plan', () => {
  const devices = [P.normalizeDevice(HOTPLUG)];
  it('adds a recommended catalog item for a device nothing else covers', () => {
    const items = P.buildPlan({ devices, updates: [], vendor: [], catalog: [{ id: ID_NEW, title: XEON, version: '10.1.2.80', date: '2016-08-19', sizeBytes: 68083, fixes: [HOTPLUG.instanceId] }] });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: `cat:${ID_NEW}`, source: 'catalog', recommended: true, silent: true, fixes: [HOTPLUG.instanceId], version: '10.1.2.80' });
    expect(P.uncoveredDevices(devices, items)).toEqual([]);
    expect(P.parseProgressLine(`DHP|cat:${ID_NEW}|installing|`)).toMatchObject({ id: `cat:${ID_NEW}`, status: 'installing' });
  });
  it('drops a catalog entry for a device Windows Update already covers', () => {
    const updates = P.normalizeWuUpdates([{ id: '11111111-1111-1111-1111-111111111111', title: XEON, hardwareId: 'pci\\ven_8086&dev_2f29' }]);
    const items = P.buildPlan({ devices, updates, vendor: [], catalog: [{ id: ID_NEW, title: XEON, fixes: [HOTPLUG.instanceId] }] });
    expect(items.map((i: any) => i.id)).toEqual(['wu:11111111-1111-1111-1111-111111111111']);
  });
});

describe('install job: catalog packages', () => {
  const cab = (id: string, sha = SHA_HEX, hw = ['pci\\ven_8086&dev_2f29']) => ({ id, path: 'C:\\d\\a.cab', sha256: sha, hw });

  it('merges items that resolve to the same .cab: it is installed once for all of them', () => {
    const merged = mergeCabs([cab('wu:a'), cab('wu:b', SHA_HEX.toUpperCase(), ['PCI\\VEN_8086&DEV_2FB3', "x' ; bad id"]), cab('cat:c', 'ff'.repeat(32))]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ ids: ['wu:a', 'wu:b'], hw: ['pci\\ven_8086&dev_2f29', 'pci\\ven_8086&dev_2fb3'] });
    expect(merged[1].ids).toEqual(['cat:c']);
  });

  it('builds an ASCII job that checks hash and Microsoft signature before pnputil', () => {
    const s = buildInstallScript({ progressFile: 'C:\\p.log', updateIds: [], packages: [], cabs: [cab('wu:a'), cab('wu:b')] });
    expect(/^[\x00-\x7F]*$/.test(s)).toBe(true);
    expect(s).toContain("ids = @('wu:a','wu:b'); hw = @('pci\\ven_8086&dev_2f29')");
    expect(s).toContain(`sha = '${SHA_HEX.toUpperCase()}'`);
    expect(s).toContain(`$msPattern = '${MICROSOFT_SIGNER_PATTERN}'`);
    const order = ['Get-FileHash -LiteralPath $cab', 'expand.exe', 'Get-AuthenticodeSignature -LiteralPath $c.FullName', '/add-driver'].map((x) => s.indexOf(x));
    expect(order.every((n) => n > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(new RegExp(MICROSOFT_SIGNER_PATTERN, 'i').test('CN=Microsoft Windows Hardware Compatibility Publisher, OU=MOPR, O=Microsoft Corporation, L=Redmond, S=Washington, C=US')).toBe(true);
    expect(new RegExp(MICROSOFT_SIGNER_PATTERN, 'i').test('CN=x, O=Microsoft Corporation Fake Ltd, C=US')).toBe(false);
  });

  it('the generated jobs are valid Windows PowerShell 5.1', () => {
    if (process.platform !== 'win32') return;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-drvjob-'));
    try {
      const f = path.join(dir, 'job.ps1');
      fs.writeFileSync(f, buildInstallScript({
        progressFile: path.join(dir, "o'brien.log"), restorePoint: true, unlockWu: true,
        updateIds: ['11111111-1111-1111-1111-111111111111'],
        packages: [{ id: 'vendor:nvidia:2D05', vendor: 'nvidia', path: 'C:\\d\\n.exe', sha256: 'ab', args: ['-s'], wait: true }],
        cabs: [cab('cat:x')]
      }));
      const n = execFileSync('powershell.exe', ['-NoProfile', '-Command', `$e = $null; [void][System.Management.Automation.Language.Parser]::ParseFile('${f.replace(/'/g, "''")}', [ref]$null, [ref]$e); $e.Count`], { encoding: 'utf8' }).trim();
      expect(n).toBe('0');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('DriverInstallService: catalog route (mocked I/O)', () => {
  const scanJson = JSON.stringify({ devices: [HOTPLUG], osBuild: 19045, laptop: false, cpu: 'Intel(R) Xeon(R) CPU E5-2680 v3', arch: 'AMD64', wu: { status: 'Running', start: 3 } });
  const WU_ID = '11111111-1111-1111-1111-111111111111';
  const SCAN11 = scanJson.replace('"osBuild":19045', '"osBuild":26100');
  const WU_LIST = `DHJSON|[{"id":"${WU_ID}","title":${JSON.stringify(XEON)},"hardwareId":"pci\\\\ven_8086&dev_2f29"}]`;
  // the catalog site, as the service sees it
  const site = () => vi.fn(async (url: string, opts: any = {}) => {
    if (opts.form) return DIALOG;
    if (url.includes('Search.aspx')) return SEARCH;
    if (url.includes(ID_NEW)) return details('AMD64', ['pci\\ven_8086&dev_2f29']);
    if (url.includes(ID_OLD)) return details('AMD64', ['pci\\ven_8086&dev_0000']);
    return '<html></html>';
  });

  it('a device Windows Update offers nothing for gets a catalog package', async () => {
    if (process.platform !== 'win32') return;
    const runner = vi.fn(async (script: string) => ({ code: 0, stdout: script.includes('DHJSON') ? 'DHJSON|[]' : scanJson, stderr: '' }));
    const fetchImpl = site();
    const svc = new DriverInstallService({ runner, fetchImpl, elevatedRunner: vi.fn() });
    const r = await svc.findDrivers({});
    expect(r.wu.ok).toBe(true);
    expect(r.catalog).toEqual({ searched: 1, found: 1, error: '' });
    expect(r.recommended).toEqual([`cat:${ID_NEW}`]);
    expect(r.uncovered).toEqual([]);
    expect(r.items[0]).toMatchObject({ source: 'catalog', title: XEON, version: '10.1.2.80', fixes: [HOTPLUG.instanceId] });
    // the older package does not list the device: one search, two details pages, nothing else
    expect(fetchImpl.mock.calls.map((c: any[]) => c[0]).filter((u: string) => u.includes('Search.aspx'))).toHaveLength(1);

    // install: the .cab goes to the elevated job with the ids that picked it
    (svc as any).downloadCatalog = vi.fn(async () => [{ path: 'C:\\d\\a.cab', sha256: SHA_HEX }]);
    const elevatedRunner = vi.fn(async () => ({ code: 0, stdout: `DHP|cat:${ID_NEW}|ok|\nDHDONE`, stderr: '' }));
    (svc as any)._elevated = elevatedRunner;
    const res = await svc.install({ ids: [`cat:${ID_NEW}`] });
    expect(res.ok).toBe(true);
    expect((svc as any).downloadCatalog).toHaveBeenCalledWith(ID_NEW, expect.any(Function));
    const script = elevatedRunner.mock.calls[0][0] as string;
    expect(script).toContain(`ids = @('cat:${ID_NEW}'); hw = @('pci\\ven_8086&dev_2f29')`);
    expect(script).toContain('$wuIds = @()');
  });

  it('a network failure on the catalog is reported, not thrown', async () => {
    if (process.platform !== 'win32') return;
    const runner = vi.fn(async (script: string) => ({ code: 0, stdout: script.includes('DHJSON') ? 'DHJSON|[]' : scanJson, stderr: '' }));
    const svc = new DriverInstallService({ runner, fetchImpl: vi.fn(async () => { throw new Error('HTTP 503'); }), elevatedRunner: vi.fn() });
    const r = await svc.findDrivers({});
    expect(r.ok).toBe(true);
    expect(r.catalog).toMatchObject({ found: 0, error: 'HTTP 503' });
    expect(r.uncovered).toEqual([HOTPLUG.instanceId]);
  });

  it('a Windows Update driver that fails to download (80004002) is installed from the catalog in a second job', async () => {
    if (process.platform !== 'win32') return;
    const wuList = `DHJSON|[{"id":"${WU_ID}","title":${JSON.stringify(XEON)},"hardwareId":"pci\\\\ven_8086&dev_2f29"}]`;
    const runner = vi.fn(async (script: string) => ({ code: 0, stdout: script.includes('DHJSON') ? wuList : scanJson, stderr: '' }));
    const fetchImpl = site();
    const jobs: string[] = [];
    const elevatedRunner = vi.fn(async (script: string) => {
      jobs.push(script);
      if (jobs.length === 1) return { code: 0, stdout: `DHP|wu:${WU_ID}|failed|download 80004002\nDHDONE`, stderr: '' };
      return { code: 0, stdout: `DHP|wu:${WU_ID}|verifying|\nDHP|wu:${WU_ID}|installing|\nDHP|wu:${WU_ID}|ok|\nDHDONE`, stderr: '' };
    });
    const svc = new DriverInstallService({ runner, fetchImpl, elevatedRunner });
    const found = await svc.findDrivers({});
    expect(found.recommended).toEqual([`wu:${WU_ID}`]);
    expect(found.catalog.searched).toBe(0); // Windows Update covers the device: no catalog traffic at search time
    (svc as any).downloadCatalog = vi.fn(async () => [{ path: 'C:\\d\\a.cab', sha256: SHA_HEX }]);
    const events: any[] = [];
    const res = await svc.install({ ids: [`wu:${WU_ID}`], restorePoint: true }, (e: any) => events.push(e));
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toContain(`$wuIds = @('${WU_ID}')`);
    expect(jobs[1]).toContain('$wuIds = @()');
    expect(jobs[1]).toContain(`ids = @('wu:${WU_ID}'); hw = @('pci\\ven_8086&dev_2f29')`);
    expect(jobs[1]).toContain('if ($false) {\n  DhP \'restore\''); // no second restore point
    expect((svc as any).downloadCatalog).toHaveBeenCalledWith(ID_NEW, expect.any(Function));
    expect(res).toMatchObject({ ok: true, catalogFallback: { tried: 1, ok: 1 } });
    expect(res.results.find((x: any) => x.id === `wu:${WU_ID}`).status).toBe('ok');
    expect(events.some((e) => e.status === 'info' && /Microsoft Update Catalog/.test(e.detail))).toBe(true);
  });

  it('Delivery Optimization disabled (DarkOS): Windows Update drivers go to the catalog up front, in ONE job', async () => {
    if (process.platform !== 'win32') return;
    const runner = vi.fn(async (script: string) => ({ code: 0, stdout: script.includes('DHDO|') ? 'DHDO|1058' : script.includes('DHJSON') ? WU_LIST : SCAN11, stderr: '' }));
    const elevatedRunner = vi.fn(async () => ({ code: 0, stdout: `DHP|wu:${WU_ID}|ok|\nDHDONE`, stderr: '' }));
    const svc = new DriverInstallService({ runner, fetchImpl: site(), elevatedRunner });
    await svc.findDrivers({});
    expect(await svc.deliveryOptimizationOff()).toBe(true);
    (svc as any).downloadCatalog = vi.fn(async () => [{ path: 'C:\\d\\a.cab', sha256: SHA_HEX }]);
    const events: any[] = [];
    const res = await svc.install({ ids: [`wu:${WU_ID}`] }, (e: any) => events.push(e));
    expect(elevatedRunner).toHaveBeenCalledTimes(1);
    const script = elevatedRunner.mock.calls[0][0] as string;
    expect(script).toContain('$wuIds = @()');
    expect(script).toContain(`ids = @('wu:${WU_ID}')`);
    expect(res).toMatchObject({ ok: true, catalogFallback: { tried: 1, ok: 1 } });
    expect(events.some((e) => e.id === 'wuservice' && /Delivery Optimization is disabled/.test(e.detail))).toBe(true);
    // never reported as failed on the way
    expect(events.some((e) => e.status === 'failed')).toBe(false);
  });

  it('Delivery Optimization disabled but the catalog lacks the driver: Windows Update is still tried', async () => {
    if (process.platform !== 'win32') return;
    const runner = vi.fn(async (script: string) => ({ code: 0, stdout: script.includes('DHDO|') ? 'DHDO|1058' : script.includes('DHJSON') ? WU_LIST : SCAN11, stderr: '' }));
    const elevatedRunner = vi.fn(async () => ({ code: 0, stdout: `DHP|wu:${WU_ID}|failed|download 80004002 (Delivery Optimization service unavailable)\nDHDONE`, stderr: '' }));
    const svc = new DriverInstallService({ runner, fetchImpl: vi.fn(async () => '<html></html>'), elevatedRunner });
    await svc.findDrivers({});
    const res = await svc.install({ ids: [`wu:${WU_ID}`] });
    expect(elevatedRunner).toHaveBeenCalledTimes(1);
    expect((elevatedRunner.mock.calls[0][0] as string)).toContain(`$wuIds = @('${WU_ID}')`);
    expect(res.ok).toBe(false);
    expect(res.results[0].detail).toBe('download 80004002 (Delivery Optimization service unavailable); not in the Microsoft Update Catalog');
    expect(res.catalogFallback).toEqual({ tried: 0, ok: 0 });
  });

  it('a healthy Delivery Optimization keeps the Windows Update route', async () => {
    if (process.platform !== 'win32') return;
    for (const out of ['DHDO|0', 'DHDO|1056', 'DHDO|5', 'garbage']) {
      const svc = new DriverInstallService({ runner: vi.fn(async () => ({ code: 0, stdout: out, stderr: '' })), elevatedRunner: vi.fn() });
      expect(await svc.deliveryOptimizationOff()).toBe(false);
    }
    const gone = new DriverInstallService({ runner: vi.fn(async () => ({ code: 0, stdout: 'DHDO|1060', stderr: '' })), elevatedRunner: vi.fn() });
    expect(await gone.deliveryOptimizationOff()).toBe(true);
  });

  it('keeps the Windows Update failure when the catalog does not have the driver or the second job is refused', async () => {
    if (process.platform !== 'win32') return;
    const wuList = `DHJSON|[{"id":"${WU_ID}","title":${JSON.stringify(XEON)},"hardwareId":"pci\\\\ven_8086&dev_2f29"}]`;
    const runner = vi.fn(async (script: string) => ({ code: 0, stdout: script.includes('DHJSON') ? wuList : scanJson, stderr: '' }));
    // 1) not in the catalog
    let elevatedRunner = vi.fn(async () => ({ code: 0, stdout: `DHP|wu:${WU_ID}|failed|download 80004002\nDHDONE`, stderr: '' }));
    let svc = new DriverInstallService({ runner, fetchImpl: vi.fn(async () => '<html></html>'), elevatedRunner });
    await svc.findDrivers({});
    let res = await svc.install({ ids: [`wu:${WU_ID}`] });
    expect(elevatedRunner).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ ok: false, catalogFallback: { tried: 0, ok: 0 } });
    expect(res.results[0]).toMatchObject({ status: 'failed', detail: 'download 80004002; not in the Microsoft Update Catalog' });
    // 2) found, but the second administrator prompt is refused
    let n = 0;
    elevatedRunner = vi.fn(async () => (++n === 1 ? { code: 0, stdout: `DHP|wu:${WU_ID}|failed|download 80004002\nDHDONE`, stderr: '' } : { code: 1, stdout: '', stderr: 'canceled' }));
    svc = new DriverInstallService({ runner, fetchImpl: site(), elevatedRunner });
    await svc.findDrivers({});
    (svc as any).downloadCatalog = vi.fn(async () => [{ path: 'C:\\d\\a.cab', sha256: SHA_HEX }]);
    const events: any[] = [];
    res = await svc.install({ ids: [`wu:${WU_ID}`] }, (e: any) => events.push(e));
    expect(res).toMatchObject({ ok: false, catalogFallback: { tried: 1, ok: 0 } });
    expect(events.at(-1)).toMatchObject({ id: `wu:${WU_ID}`, status: 'failed', detail: 'download 80004002' });
  });
});
