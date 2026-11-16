import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({ default: { app: { getPath: () => '/tmp/dh-test', isPackaged: false } }, app: { getPath: () => '/tmp/dh-test', isPackaged: false } }));

// @ts-ignore plain JS module
import DeepTweaks from '../electron/services/optimizer/DeepTweaksEngine.js';
// @ts-ignore plain JS module
import { buildMoreTweaks, resolveTweak, candidateChanges, factsFromProbe, gpuVendorFromDeviceId, SERVICE_TARGETS, DISPLAY_CLASS } from '../electron/services/optimizer/MoreTweaks.js';
// @ts-ignore plain JS module
import { validateChange, regEntryId, buildRegistryScript } from '../electron/services/optimizer/OptimizerUtils.js';
import { messages } from '../src/i18n/messages';

const SVC = 'HKLM\\SYSTEM\\CurrentControlSet\\Services';
const ids: string[] = buildMoreTweaks((d: any) => d).map((d: any) => d.id);
const def = (id: string) => DeepTweaks.getDefinition(id);
const facts = (over: any = {}) => ({ build: 26100, ramKB: 16 * 1024 * 1024, gpus: [], ...over });
const readMapOf = (rows: Array<[string, string, any]>) => new Map(rows.map(([key, name, value]) => [regEntryId(key, name), {
  keyExists: value !== 'nokey', exists: value !== 'nokey' && value !== null, value: value === 'nokey' ? null : value
}]));

describe('optimizerDuck parity tweaks', () => {
  it('are registered once, with valid static rows and something to read status from', () => {
    const all = DeepTweaks.listTweaks().map((x: any) => x.id);
    expect(new Set(all).size).toBe(all.length);
    for (const id of ids) {
      expect(all).toContain(id);
      const d = def(id);
      for (const c of d.changes) expect(validateChange(c), `${id} ${c.key}`).toBe(true);
      const dynamic = d.gpu || d.serviceTargets || d.dynamicRows || d.onlyExistingKeys;
      if (!dynamic) expect(d.changes.length + (d.statusOnly || []).length, id).toBeGreaterThan(0);
      if (d.commands) expect(d.requiresAdmin, id).toBe(true);
    }
  });

  it('are translated in both languages, warnings included', () => {
    for (const id of ids) {
      for (const loc of ['pt-BR', 'en-US'] as const) {
        expect((messages as any)[loc][`optimizer.audit.tweak.${id}.title`], `${loc} ${id}`).toBeTruthy();
        expect((messages as any)[loc][`optimizer.audit.tweak.${id}.desc`], `${loc} ${id}`).toBeTruthy();
        if (def(id).warning) expect((messages as any)[loc][`optimizer.audit.tweak.${id}.warning`], `${loc} ${id}`).toBeTruthy();
      }
    }
  });

  it('none of them joins the one-click recommended selection', () => {
    for (const id of ids) expect(DeepTweaks.getRecommendedIds()).not.toContain(id);
  });

  it('listTweaks stays IPC-safe (no functions)', () => {
    const json = JSON.stringify(DeepTweaks.listTweaks());
    const list = JSON.parse(json);
    expect(list.find((x: any) => x.id === 'tweak:svchostGrouping').dynamicRows).toBeUndefined();
    const hasFn = (o: any): boolean => o && typeof o === 'object' && Object.values(o).some((v) => typeof v === 'function' || hasFn(v));
    expect(DeepTweaks.listTweaks().some(hasFn)).toBe(false);
  });
});

describe('machine resolution', () => {
  it('reads the GPU vendor from the PCI id', () => {
    expect(gpuVendorFromDeviceId('pci\\ven_10de&dev_2684')).toBe('nvidia');
    expect(gpuVendorFromDeviceId('PCI\\VEN_1002&DEV_744C')).toBe('amd');
    expect(gpuVendorFromDeviceId('pci\\ven_8086&dev_a780')).toBe('intel');
    expect(gpuVendorFromDeviceId('root\\basicdisplay')).toBeNull();
  });

  it('normalises the probe, a single adapter included', () => {
    const f = factsFromProbe({ build: '26100', ramKB: 100, gpus: { index: '0001', id: 'pci\\ven_10de&dev_1', desc: 'RTX' } });
    expect(f.gpus).toEqual([{ key: `${DISPLAY_CLASS}\\0001`, vendor: 'nvidia', desc: 'RTX' }]);
    expect(factsFromProbe({ gpus: [{ index: 'Properties', id: 'pci\\ven_10de' }] }).gpus).toEqual([]);
  });

  it('writes GPU values only to adapters of that vendor, and reverts by removing them', () => {
    const d = def('tweak:nvidiaDisableDynamicPstate');
    const f = facts({ gpus: [{ key: `${DISPLAY_CLASS}\\0000`, vendor: 'intel' }, { key: `${DISPLAY_CLASS}\\0001`, vendor: 'nvidia' }] });
    const r = resolveTweak(d, f);
    expect(r.applicable).toBe(true);
    expect(r.changes).toEqual([{ key: `${DISPLAY_CLASS}\\0001`, name: 'DisableDynamicPstate', type: 'REG_DWORD', data: '1' }]);
    expect(r.revertChanges).toEqual([{ key: `${DISPLAY_CLASS}\\0001`, name: 'DisableDynamicPstate', deleteValue: true }]);
    expect(resolveTweak(def('tweak:amdDisableUlps'), f)).toMatchObject({ applicable: false, reason: 'gpu' });
  });

  it('hides tweaks outside their Windows build range', () => {
    expect(resolveTweak(def('tweak:disableClickToDo'), facts({ build: 22631 })).applicable).toBe(false);
    expect(resolveTweak(def('tweak:disableClickToDo'), facts({ build: 26100 })).applicable).toBe(true);
    expect(resolveTweak(def('tweak:hideMeetNow'), facts({ build: 26100 })).applicable).toBe(false);
    expect(resolveTweak(def('tweak:hideMeetNow'), facts({ build: 19045 })).applicable).toBe(true);
    expect(resolveTweak(def('tweak:hideStartRecommended'), facts({ build: 19045 })).applicable).toBe(false);
  });

  it('svchost threshold follows the installed RAM', () => {
    const r = resolveTweak(def('tweak:svchostGrouping'), facts({ ramKB: 33554432 }));
    expect(r.changes[0]).toMatchObject({ name: 'SvcHostSplitThresholdInKB', data: '33554432' });
    expect(resolveTweak(def('tweak:svchostGrouping'), facts({ ramKB: 0 })).applicable).toBe(false);
  });

  it('never creates a key for a component that is not installed', () => {
    const d = def('tweak:webdavLargeFiles');
    const c = candidateChanges(d, facts())[0];
    expect(resolveTweak(d, facts(), new Map()).applicable).toBe(false);
    expect(resolveTweak(d, facts(), readMapOf([[c.key, c.name, 'nokey']])).applicable).toBe(false);
    expect(resolveTweak(d, facts(), readMapOf([[c.key, c.name, 50000000]])).changes).toEqual([c]);
  });

  it('services: only existing ones, never raises a start type, never touches drivers', () => {
    const d = def('tweak:servicesManual');
    const map = readMapOf([
      [`${SVC}\\Fax`, 'Start', 3], // manual -> disabled (target 4)
      [`${SVC}\\WbioSrvc`, 'Start', 2], // auto -> manual
      [`${SVC}\\XblGameSave`, 'Start', 4], // user disabled it: stays disabled
      [`${SVC}\\hidserv`, 'Start', 1], // system start: untouched
      [`${SVC}\\RemoteRegistry`, 'Start', 'nokey'] // not installed
    ]);
    const r = resolveTweak(d, facts(), map);
    expect(r.changes.map((c: any) => [c.key.split('\\').pop(), c.data])).toEqual([['Fax', '4'], ['WbioSrvc', '3']]);
  });

  it('services list leaves alone what other features or the user depend on', () => {
    const names = SERVICE_TARGETS.map(([n]: [string, number]) => n.toLowerCase());
    for (const keep of ['spooler', 'lanmanserver', 'ssh-agent', 'wpnservice', 'usosvc', 'bits', 'wuauserv', 'wsearch', 'diagtrack',
      'cdpsvc', 'lfsvc', 'waasmedicsvc', 'sppsvc', 'wscsvc', 'appxsvc', 'windefend', 'audiosrv', 'tzautoupdate']) {
      expect(names, keep).not.toContain(keep);
    }
    expect(new Set(names).size).toBe(names.length);
    expect(SERVICE_TARGETS.every(([, s]: [string, number]) => s === 3 || s === 4)).toBe(true);
  });

  it('applyResolution keeps fallback reverts limited to the rows kept', () => {
    const d = { ...def('tweak:webdavLargeFiles') };
    DeepTweaks.applyResolution(d, { applicable: false, reason: 'missing', changes: [] });
    expect(d.changes).toEqual([]);
    expect(d.revertChanges).toEqual([]);
    DeepTweaks.applyResolution(d, { applicable: true, changes: d.templateChanges });
    expect(d.revertChanges).toEqual([{ key: d.templateChanges[0].key, name: 'FileSizeLimitInBytes', type: 'REG_DWORD', data: '50000000' }]);
  });

  it('admin-only keys (AutoLogger) and scheduled tasks run in the elevated script and restore what they recorded', () => {
    for (const id of ['tweak:disableAutoLoggers', 'tweak:disableTelemetryTasks']) {
      const d = def(id);
      expect(d.changes, id).toEqual([]);
      expect(d.statusOnly.length, id).toBe(1);
      expect(d.commands.apply + d.commands.revert, id).not.toMatch(/[^\x00-\x7f]/);
    }
    const a = def('tweak:disableAutoLoggers').commands;
    expect(a.apply).toContain("'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\WMI\\Autologger\\' + $n");
    expect(a.apply).toContain("'Diagtrack-Listener'");
    expect(a.revert).toContain("-split '\\|'");
  });

  it('a 4 GB DWORD is written as an unsigned value', () => {
    const script = buildRegistryScript([def('tweak:webdavLargeFiles').templateChanges[0]]);
    expect(script).toContain('[uint32]4294967295');
  });
});
