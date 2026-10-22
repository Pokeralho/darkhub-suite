import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({ default: { app: { getPath: () => '/tmp/dh-test', isPackaged: false } }, app: { getPath: () => '/tmp/dh-test', isPackaged: false } }));

// @ts-ignore plain JS module
import { WindowsToolsEngine, parseFeatureLines, summarizeFeatureState, PANELS } from '../electron/services/optimizer/WindowsToolsEngine.js';
// @ts-ignore plain JS module
import DeepTweaks from '../electron/services/optimizer/DeepTweaksEngine.js';
// @ts-ignore plain JS module
import { validateChange } from '../electron/services/optimizer/OptimizerUtils.js';
import { messages } from '../src/i18n/messages';

const win32 = process.platform === 'win32' ? it : it.skip;

describe('Windows features state', () => {
  it('collapses multi-part features', () => {
    expect(summarizeFeatureState(['Disabled', 'Enabled'])).toBe('enabled');
    expect(summarizeFeatureState(['Disabled', 'EnablePending'])).toBe('pending');
    expect(summarizeFeatureState(['Missing'])).toBe('unavailable');
    expect(summarizeFeatureState(['NotPresent'])).toBe('disabled');
    expect(summarizeFeatureState(['Installed'])).toBe('enabled');
  });
  it('parses DHFEAT lines and fills every known feature', () => {
    const r = parseFeatureLines('noise\nDHFEAT|wsl|Enabled\nDHFEAT|openssh|NotPresent\n');
    expect(r.wsl).toBe('enabled');
    expect(r.openssh).toBe('disabled');
    expect(r.hyperv).toBe('unavailable');
  });
});

describe('Windows tools whitelists', () => {
  const runMarked = vi.fn(async () => ({ ok: true, out: '' }));
  const launcher = vi.fn(async () => ({ ok: true }));
  const eng = new WindowsToolsEngine(runMarked, launcher);
  win32('refuses unknown panels, actions and features without touching the system', async () => {
    expect((await eng.openPanel('calc & del C:\\')).ok).toBe(false);
    expect((await eng.openPanel('__proto__')).ok).toBe(false);
    expect((await eng.run('constructor')).ok).toBe(false);
    expect((await eng.setFeature('x', true)).ok).toBe(false);
    expect(runMarked).not.toHaveBeenCalled();
    expect(launcher).not.toHaveBeenCalled();
  });
  win32('opens a known panel with fixed arguments', async () => {
    await eng.openPanel('devices');
    expect(launcher).toHaveBeenCalledWith('mmc.exe', ['devmgmt.msc']);
    expect(Object.keys(PANELS).length).toBeGreaterThan(15);
  });
  win32('feature enable is only reported when Windows reads back enabled', async () => {
    const e = new WindowsToolsEngine(async () => ({ ok: true, out: 'DHFEAT|netfx3|Disabled' }), launcher);
    const r = await e.setFeature('netfx3', true);
    expect(r.ok).toBe(false);
    const e2 = new WindowsToolsEngine(async () => ({ ok: true, out: 'DHFEAT|netfx3|EnablePending' }), launcher);
    expect(await e2.setFeature('netfx3', true)).toMatchObject({ ok: true, requiresReboot: true });
  });
});

describe('WinUtil parity tweaks', () => {
  const list = DeepTweaks.listTweaks();
  const NEW = ['tweak:disableMpo', 'tweak:preferIPv4', 'tweak:disableIPv6', 'tweak:disableTeredo', 'tweak:standbyNetworkOff', 'tweak:s3Sleep',
    'tweak:disableStoreSearchResults', 'tweak:disableNotifications', 'tweak:blockDeviceMetadata', 'tweak:blockPeripheralBloat', 'tweak:disableWpbt',
    'tweak:braveDebloat', 'tweak:keepClassicOutlook', 'tweak:disableStorageSense', 'tweak:disableReservedStorage', 'tweak:longPaths',
    'tweak:registryBackup', 'tweak:detailedBsod', 'tweak:verboseLogon', 'tweak:legacyBootMenu', 'tweak:ntpPool', 'tweak:hideHomeGallery',
    'tweak:disableFolderDiscovery', 'tweak:classicStartMenu', 'tweak:disableLockScreen', 'tweak:hideSettingsHome', 'tweak:batteryPercentage',
    'tweak:scrollbarsAlwaysVisible', 'tweak:disableWindowSnapping', 'tweak:numLockOnStartup', 'tweak:rdpUnsignedNoWarning'];
  it('are all registered with unique ids', () => {
    const ids = list.map((x: any) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of NEW) expect(ids).toContain(id);
  });
  it('have valid registry writes and something to read status from', () => {
    for (const id of NEW) {
      const d = DeepTweaks.getDefinition(id);
      for (const c of d.changes) expect(validateChange(c), `${id} ${c.key}`).toBe(true);
      expect(d.changes.length + (d.statusOnly || []).length, id).toBeGreaterThan(0);
      if (d.commands) expect(d.requiresAdmin, id).toBe(true);
    }
  });
  it('never turns off Windows Update driver downloads (the GPU driver finder depends on it)', () => {
    const all = list.flatMap((x: any) => DeepTweaks.getDefinition(x.id).changes);
    expect(all.some((c: any) => c.name === 'SearchOrderConfig')).toBe(false);
  });
  it('are translated in both languages', () => {
    for (const id of NEW) {
      for (const loc of ['pt-BR', 'en-US'] as const) expect((messages as any)[loc][`optimizer.audit.tweak.${id}.title`], `${loc} ${id}`).toBeTruthy();
    }
  });
});

describe('PowerShell runner long scripts', () => {
  win32('runs a script larger than the Windows command-line limit', async () => {
    // @ts-ignore plain JS module
    const { runPowerShell, MAX_ENCODED_ARG } = await import('../electron/services/PowerShellRunner.js');
    const filler = `# ${'x'.repeat(200)}\n`.repeat(Math.ceil(MAX_ENCODED_ARG / 200));
    const r = await runPowerShell(`${filler}Write-Output 'dh-long-ok'`, { timeoutMs: 30000, trim: true });
    expect(r.stdout).toBe('dh-long-ok');
  }, 40000);
});

describe('Conflicting tweaks', () => {
  it('prefer IPv4 and disable IPv6 declare each other as alternatives', () => {
    expect(DeepTweaks.getDefinition('tweak:preferIPv4').conflictsWith).toContain('tweak:disableIPv6');
    expect(DeepTweaks.getDefinition('tweak:disableIPv6').conflictsWith).toContain('tweak:preferIPv4');
  });
});
