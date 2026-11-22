// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

vi.mock('electron-log', () => ({ default: { info() {}, warn() {}, error() {} }, info() {}, warn() {}, error() {} }));

// @ts-ignore plain JS module
import * as C from '../electron/services/drivers/driverCatalog.js';
// @ts-ignore plain JS module
import { DriverInstallService, withRetry, errText } from '../electron/services/drivers/DriverInstallService.js';

describe('driver downloads: network errors', () => {
  it('names the cause undici hides behind "fetch failed"', () => {
    expect(errText(Object.assign(new Error('fetch failed'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }))).toBe('fetch failed (UND_ERR_CONNECT_TIMEOUT)');
    expect(errText(new Error('HTTP 404'))).toBe('HTTP 404');
    expect(errText('plain')).toBe('plain');
  });

  it('retries a stalled connection or a 5xx answer, never a refusal', async () => {
    let n = 0;
    const flaky = () => { n++; if (n < 3) throw Object.assign(new Error('fetch failed'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }); return 'ok'; };
    expect(await withRetry(flaky, { pauseMs: 1 })).toBe('ok');
    expect(n).toBe(3);

    n = 0;
    await expect(withRetry(() => { n++; throw new Error('HTTP 503'); }, { tries: 2, pauseMs: 1 })).rejects.toThrow('HTTP 503');
    expect(n).toBe(2);

    for (const final of ['HTTP 404', 'untrusted package URL', 'downloaded package does not match the catalog SHA-256', 'redirected outside the Microsoft download hosts']) {
      n = 0;
      await expect(withRetry(() => { n++; throw new Error(final); }, { pauseMs: 1 })).rejects.toThrow(final);
      expect(n).toBe(1);
    }
  });
});

describe('catalog: an update for a working device is never replaced by an older driver', () => {
  const HW = 'swc\\ven_msft&audio_effectpack_voiceclarity';
  const OLD = 'aea787ca-3b9a-4526-b3e0-26386fe6a9ba';
  const row = `<tr id="${OLD}_R0"><td></td><td><a>Microsoft Corporation AudioProcessingObject Driver Update (1.0.4.7057)</a></td>
    <td>Windows 11 Client, version 24H2 and later, Servicing Drivers</td><td>Drivers (Other Hardware)</td><td>6/15/2026</td><td>1.0.4.7057</td>
    <td><span id="${OLD}_originalSize">29981141</span></td><td></td></tr>`;
  const details = `<div id="archDiv"><span class="labelTitle">Architecture:</span> AMD64 </div>
    <span id="ScopedViewHandler_version">1.0.4.7057</span><span id="ScopedViewHandler_versionDate">6/16/2026</span>
    <div id="driverhwIDs"><div style="x">${HW.replace(/&/g, '&amp;')}</div></div>`;
  const fetchImpl = vi.fn(async (url: string) => (url.includes('Search.aspx') ? `<table>${row}</table>` : details));
  const target = { hardwareIds: [HW], compatibleIds: [], queries: [HW] };
  const env = { osBuild: 26100, arch: 'AMD64' };
  const wanted = 'Microsoft Corporation AudioProcessingObject Driver Update (1.0.4.55794)';

  it('rejects the older package when Windows Update offered a newer one', async () => {
    const svc = new DriverInstallService({ runner: vi.fn(), elevatedRunner: vi.fn(), fetchImpl });
    expect(await svc.catalogFor(target, env, { preferTitle: wanted, minDate: '2026-10-16' })).toBeNull();
  });
  it('accepts it for a device with no driver at all, and when it is the same driver', async () => {
    const svc = new DriverInstallService({ runner: vi.fn(), elevatedRunner: vi.fn(), fetchImpl });
    expect(await svc.catalogFor(target, env, { preferTitle: wanted })).toMatchObject({ id: OLD, version: '1.0.4.7057', hw: [HW] });
    const same = 'Microsoft Corporation AudioProcessingObject Driver Update (1.0.4.7057)';
    expect(await svc.catalogFor(target, env, { preferTitle: same, minDate: '2026-12-31' })).toMatchObject({ id: OLD });
  });
  it('knows the Windows 11 26H1 product name', () => {
    expect(C.productFloorFor('Windows 11 Client, version 26H1 and later, Servicing Drivers', 28000)).toBe(28000);
    expect(C.productFloorFor('Windows 11 Client, version 26H1 and later, Servicing Drivers', 26300)).toBe(0);
  });
});
