import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  default: { app: { getPath: () => '/tmp/dh-test', isPackaged: false } },
  app: { getPath: () => '/tmp/dh-test', isPackaged: false }
}));

// @ts-ignore plain JS modules
import * as U from '../electron/services/optimizer/OptimizerUtils.js';

describe('registry value comparison', () => {
  it('treats 0x1 and 1 as equal DWORDs and handles 0xffffffff', () => {
    expect(U.canonicalRegValue('REG_DWORD', '0x1')).toBe('1');
    expect(U.canonicalRegValue('REG_DWORD', 1)).toBe('1');
    expect(U.canonicalRegValue('REG_DWORD', '0xffffffff')).toBe('4294967295');
    expect(U.canonicalRegValue('REG_DWORD', -1)).toBe('4294967295');
  });
  it('regValueMatches requires existence and type family', () => {
    const change = { type: 'REG_DWORD', data: '1' };
    expect(U.regValueMatches(change, { exists: true, type: 'REG_DWORD', value: '0x1' })).toBe(true);
    expect(U.regValueMatches(change, { exists: false })).toBe(false);
    expect(U.regValueMatches(change, { exists: true, type: 'REG_SZ', value: '1' })).toBe(false);
    expect(U.regValueMatches(change, { exists: true, type: 'REG_DWORD', value: '0' })).toBe(false);
  });
  it('buildRegistryScript refuses hive roots and emits result markers', () => {
    const script = U.buildRegistryScript([
      { key: 'HKCU\\Software\\DarkHubTest', name: 'X', type: 'REG_DWORD', data: '1' },
      { key: 'HKCU', name: 'X', type: 'REG_DWORD', data: '1' }
    ]);
    expect(script).toContain('DHRES|0|');
    expect(script).toContain('DHRES|1|fail');
  });
});

describe('recommended selection never includes risky tweaks', () => {
  it('pickRecommendedTweaks drops medium/high risk, security and reboot items', () => {
    const picked = U.pickRecommendedTweaks([
      { id: 'a', recommended: true, risk: 'low' },
      { id: 'b', recommended: true, risk: 'medium' },
      { id: 'c', recommended: true, risk: 'low', securityRelated: true },
      { id: 'd', recommended: true, risk: 'low', requiresReboot: true },
      { id: 'e', recommended: false, risk: 'low' },
      { id: 'f', recommended: true, risk: 'low', internal: true }
    ]).map((t: any) => t.id);
    expect(picked).toEqual(['a']);
  });
  it('the real tweak catalog yields no VBS, BitLocker, telemetry or defender in the recommended ids', async () => {
    const engine = (await import('../electron/services/optimizer/DeepTweaksEngine.js')).default as any;
    const ids: string[] = engine.getRecommendedIds();
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const def = engine.getDefinition(id);
      expect(def.risk).toBe('low');
      expect(def.securityRelated).not.toBe(true);
    }
    expect(ids).not.toContain('tweak:disableVBS');
    expect(ids).not.toContain('tweak:preventAutoBitLocker');
    expect(ids.some((i) => /telemetry|defender|bitlocker|vbs/i.test(i))).toBe(false);
  });
  it('safe, recommended and gaming profiles exclude risky operations', async () => {
    const svc = (await import('../electron/services/optimizer/SystemOptimizerService.js')).default as any;
    const profiles = Object.fromEntries(svc.listProfiles().map((p: any) => [p.id, p.tweakIds as string[]]));
    const forbidden = ['optimizer:disableCoreIsolation', 'optimizer:preventAutoBitLocker', 'optimizer:disableServices', 'optimizer:disableTelemetry', 'optimizer:disableLocation', 'optimizer:disableHibernation', 'optimizer:msiMode'];
    for (const name of ['safe', 'recommended', 'gaming']) {
      for (const f of forbidden) expect(profiles[name], `${name} must not contain ${f}`).not.toContain(f);
    }
  });
  it('every profile id refers to a registered operation', async () => {
    const svc = (await import('../electron/services/optimizer/SystemOptimizerService.js')).default as any;
    const ops = await svc.listOperations();
    const known = new Set(ops.map((o: any) => o.id));
    for (const p of svc.listProfiles()) for (const id of p.tweakIds) expect(known.has(id), id).toBe(true);
  });
  it('risky operations are flagged and every reversible operation has a revert companion', async () => {
    const svc = (await import('../electron/services/optimizer/SystemOptimizerService.js')).default as any;
    const ops = await svc.listOperations();
    const byId = new Map<string, any>(ops.map((o: any) => [o.id, o]));
    expect(byId.get('optimizer:disableCoreIsolation').securityRelated).toBe(true);
    expect(byId.get('optimizer:disableCoreIsolation').risk).toBe('advanced');
    for (const o of ops) if (o.revertId) expect(byId.has(o.revertId), o.revertId).toBe(true);
  });
});

describe('uninstall string parsing', () => {
  it('handles quoted exe, bare exe, msi and cmd', () => {
    expect(U.parseUninstallString('"C:\\Program Files\\X\\unins000.exe" /SILENT')).toEqual({ file: 'C:\\Program Files\\X\\unins000.exe', args: '/SILENT' });
    expect(U.parseUninstallString('C:\\X\\un.exe /S')).toEqual({ file: 'C:\\X\\un.exe', args: '/S' });
    const msi = U.parseUninstallString('C:\\Windows\\Installer\\x.msi');
    expect(msi.file).toBe('msiexec.exe');
    expect(U.parseUninstallString('')).toBeNull();
    expect(U.parseUninstallString('"C:\\broken')).toBeNull();
    expect(U.parseUninstallString('C:\\a|b.exe')).toBeNull();
  });
  it('isSafeInstallLocationFor refuses roots and generic containers', () => {
    const roots = ['C:\\Program Files', 'C:\\Users\\a\\AppData\\Local'];
    expect(U.isSafeInstallLocationFor('C:\\Program Files\\MyApp', roots)).toBe(true);
    expect(U.isSafeInstallLocationFor('C:\\Program Files', roots)).toBe(false);
    expect(U.isSafeInstallLocationFor('C:\\Windows\\System32', roots)).toBe(false);
    expect(U.isSafeInstallLocationFor('', roots)).toBe(false);
    expect(U.isSafeInstallLocationFor('C:\\Users\\a\\AppData\\Local\\Programs', roots)).toBe(false);
  });
});

describe('GPU preference and startup flags', () => {
  it('mergeGpuPreference keeps other fields', () => {
    expect(U.mergeGpuPreference('SwapEffectUpgradeEnable=1;GpuPreference=1;', 2)).toBe('GpuPreference=2;SwapEffectUpgradeEnable=1;');
    expect(U.mergeGpuPreference('', 2)).toBe('GpuPreference=2;');
    expect(U.parseGpuPreference('GpuPreference=2;')).toBe('high_performance');
    expect(U.parseGpuPreference('')).toBe('default');
  });
  it('StartupApproved bytes: enabled = 02 + zeros, disabled = odd first byte + FILETIME', () => {
    expect(U.buildStartupApprovedBytes(false)).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const dis = U.buildStartupApprovedBytes(true, 1700000000000);
    expect(dis[0]).toBe(3);
    expect(dis.slice(4).some((b: number) => b !== 0)).toBe(true);
    expect(U.isStartupApprovedDisabled(dis)).toBe(true);
    expect(U.isStartupApprovedDisabled(U.buildStartupApprovedBytes(false))).toBe(false);
  });
  it('startupApprovedTarget picks the right hive and refuses RunOnce', () => {
    expect(U.startupApprovedTarget({ type: 'Registry', path: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', name: 'Foo' })).toMatchObject({ hive: 'HKCU', valueName: 'Foo' });
    expect(U.startupApprovedTarget({ type: 'Registry', path: 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', name: 'Foo' })?.hive).toBe('HKLM');
    expect(U.startupApprovedTarget({ type: 'Registry', path: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce', name: 'Foo' })).toBeNull();
  });
});

describe('power, network, dns, memory helpers', () => {
  it('parsePowercfgList reads guid, name and active flag', () => {
    const plans = U.parsePowercfgList('Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (Balanced) *\nPower Scheme GUID: 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c  (High performance)');
    expect(plans).toHaveLength(2);
    expect(plans[0]).toMatchObject({ guid: '381b4222-f694-41f0-9685-ff5bb260df2e', isActive: true });
    expect(plans[1].isActive).toBe(false);
  });
  it('buildAdvancedNetworkChanges only writes to valid adapter GUID keys', async () => {
    const { buildAdvancedNetworkChanges } = await import('../electron/services/optimizer/NetworkEngine.js') as any;
    const changes = buildAdvancedNetworkChanges([{ name: 'Eth', guid: '{12345678-1234-1234-1234-123456789abc}' }, { name: 'Bad', guid: '..\\evil' }]);
    expect(changes.some((c: any) => c.key.includes('evil'))).toBe(false);
    expect(changes.filter((c: any) => c.key.includes('Interfaces')).map((c: any) => c.name).sort()).toEqual(['TCPNoDelay', 'TcpAckFrequency']);
    // the old version wrote these in the global key where Windows ignores them
    expect(changes.some((c: any) => c.key.endsWith('Tcpip\\Parameters'))).toBe(false);
  });
  it('DNS helpers validate answers and refuse private/invalid servers', async () => {
    const dns = await import('../electron/services/optimizer/DnsEngine.js') as any;
    expect(dns.isUsableDnsServer('1.1.1.1')).toBe(true);
    expect(dns.isUsableDnsServer('999.1.1.1')).toBe(false);
    expect(dns.isUsableDnsServer('0.0.0.0')).toBe(false);
    const q = dns.buildDnsQuery(0x1234, 'www.google.com');
    expect(q.readUInt16BE(0)).toBe(0x1234);
    expect(dns.isValidDnsAnswer(Buffer.from([0x12, 0x34, 0x81, 0x80, 0, 1, 0, 1, 0, 0, 0, 0]), 0x1234)).toBe(true);
    expect(dns.isValidDnsAnswer(Buffer.from([0x12, 0x34, 0x81, 0x83, 0, 1, 0, 0, 0, 0, 0, 0]), 0x1234)).toBe(false);
    expect(dns.isValidDnsAnswer(Buffer.from([0x99, 0x99, 0x81, 0x80, 0, 1, 0, 1, 0, 0, 0, 0]), 0x1234)).toBe(false);
    expect(dns.DNS_PRESETS.every((p: any) => typeof p.trusted === 'boolean')).toBe(true);
  });
  it('summarizeMemoryDelta never invents savings', async () => {
    const { summarizeMemoryDelta } = await import('../electron/services/optimizer/MemoryEngine.js') as any;
    const gain = summarizeMemoryDelta(1000, 1500);
    const loss = summarizeMemoryDelta(1500, 1000);
    expect(gain).toEqual({ deltaBytes: 500, freedBytes: 500 });
    expect(loss).toEqual({ deltaBytes: -500, freedBytes: 0 });
  });
  it('scArgFromStartMode maps CIM start modes to sc.exe arguments', async () => {
    const { scArgFromStartMode } = await import('../electron/services/optimizer/ServicesEngine.js') as any;
    expect(scArgFromStartMode('Auto', false)).toBe('auto');
    expect(scArgFromStartMode('Auto', true)).toBe('delayed-auto');
    expect(scArgFromStartMode('Manual', false)).toBe('demand');
    expect(scArgFromStartMode('Disabled', false)).toBe('disabled');
  });
  it('decodeShellOutput handles UTF-16LE with BOM and plain text', async () => {
    const { decodeShellOutput } = await import('../electron/services/optimizer/ElevationHelper.js') as any;
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('ok ação', 'utf16le')]);
    expect(decodeShellOutput(utf16)).toBe('ok ação');
    expect(decodeShellOutput(Buffer.from('plain'))).toBe('plain');
  });
});

describe('safety guards', () => {
  it('protects core appx packages, critical processes and services', () => {
    expect(U.isProtectedAppx('Microsoft.WindowsStore')).toBe(true);
    expect(U.isProtectedAppx('Microsoft.XboxGamingOverlay')).toBe(true);
    expect(U.isProtectedAppx('Microsoft.BingWeather')).toBe(false);
    expect(U.isCriticalProcessName('csrss.exe')).toBe(true);
    expect(U.isCriticalProcessName('notepad.exe')).toBe(false);
    expect(U.isProtectedService('WinDefend')).toBe(true);
    expect(U.isProtectedService('DiagTrack')).toBe(false);
    expect(U.isValidServiceName('Spooler')).toBe(true);
    expect(U.isValidServiceName('a; rm -rf')).toBe(false);
  });
  it('bcdValueToArg and validatePagefileSizes', () => {
    expect(U.bcdValueToArg('Yes')).toBe('yes');
    expect(U.bcdValueToArg('Não')).toBe('no');
    expect(U.bcdValueToArg('')).toBeNull();
    expect(U.validatePagefileSizes(1024, 2048).ok).toBe(true);
    expect(U.validatePagefileSizes(2048, 1024).ok).toBe(false);
    expect(U.validatePagefileSizes('x', 10).ok).toBe(false);
  });
  it('normalizePriorityName accepts UI ids and rejects garbage', () => {
    expect(U.normalizePriorityName('high')).toBe('High');
    expect(U.normalizePriorityName('belowNormal')).toBe('BelowNormal');
    expect(U.normalizePriorityName('low')).toBe('Idle');
    expect(U.normalizePriorityName('turbo')).toBeNull();
  });
  it('feature/capability/pci id validators reject injection', () => {
    expect(U.isValidFeatureName('Microsoft-Hyper-V')).toBe(true);
    expect(U.isValidFeatureName("x'; calc; '")).toBe(false);
    expect(U.isValidPciInstanceId('PCI\\VEN_10DE&DEV_2504&SUBSYS_00000000&REV_A1\\4&1234&0&0008')).toBe(true);
    expect(U.isValidPciInstanceId("PCI\\x'; calc")).toBe(false);
  });
});

describe('marked script protocol and result adaptation', () => {
  it('wrapMarkedScript/parseMarkedOutput only succeed on an explicit DHDONE', () => {
    const wrapped = U.wrapMarkedScript('Write-Output hi');
    expect(wrapped).toContain('DHDONE');
    expect(wrapped).toContain('DHFAIL|');
    expect(U.parseMarkedOutput({ stdout: 'x\nDHDONE\n' }).ok).toBe(true);
    const fail = U.parseMarkedOutput({ stdout: 'DHFAIL|bcdedit falhou' });
    expect(fail.ok).toBe(false);
    expect(fail.error).toContain('bcdedit');
    const cancelled = U.parseMarkedOutput({ stdout: '', stderr: '' });
    expect(cancelled.ok).toBe(false);
    expect(cancelled.error.length).toBeGreaterThan(0);
  });
  it('adaptResult never reports success for ok:false or error results', async () => {
    const { adaptResult } = await import('../electron/services/optimizer/SystemOptimizerService.js') as any;
    expect(adaptResult({ ok: false, error: 'boom' }).status).toBe('Error');
    expect(adaptResult({ ok: true, error: 'boom' }).status).toBe('Success');
    expect(adaptResult({ error: 'boom' }).status).toBe('Error');
    expect(adaptResult(undefined).status).toBe('Error');
    const ok = adaptResult({ ok: true, msg: 'feito', freedBytes: 10 });
    expect(ok.status).toBe('Success');
    expect(ok.savingsBytes).toBe(10);
    expect(ok.message).toBe('feito');
  });
});

describe('audit fixes (concurrency, snapshots, IPC safety)', () => {
  it('listTweaks() is structured-cloneable (no functions reach Electron IPC)', async () => {
    const engine = (await import('../electron/services/optimizer/DeepTweaksEngine.js')).default as any;
    const list = engine.listTweaks();
    expect(() => structuredClone(list)).not.toThrow();
    expect(list.find((t: any) => t.id === 'tweak:disableHibernation')?.hasCommands).toBe(true);
    // the internal definition keeps its commands
    expect(typeof engine.getDefinition('tweak:disableHibernation').commands.revert).toBe('function');
  });

  it('a partially applied tweak keeps its fresh snapshot so the written values can be restored', async () => {
    const engine = (await import('../electron/services/optimizer/DeepTweaksEngine.js')).default as any;
    const key = 'HKCU\Software\DarkHubAuditTest';
    const def = { id: 'test:partial', title: 'partial', changes: [
      { key, name: 'A', type: 'REG_DWORD', data: '1' },
      { key, name: 'B', type: 'REG_DWORD', data: '1' }
    ] };
    const orig = { readEntries: engine.readEntries, runRegistryOps: engine.runRegistryOps, saveUndoStore: engine.saveUndoStore };
    let reads = 0;
    engine.saveUndoStore = () => {};
    engine.readEntries = async () => {
      reads += 1;
      const m = new Map();
      m.set(U.regEntryId(key, 'A'), { key, name: 'A', keyExists: true, exists: reads > 1, type: 'REG_DWORD', value: reads > 1 ? 1 : null });
      m.set(U.regEntryId(key, 'B'), { key, name: 'B', keyExists: true, exists: false, type: null, value: null });
      return m;
    };
    engine.runRegistryOps = async () => Object.assign([{ ok: true, message: '' }, { ok: false, message: 'access denied' }], { cmdResults: new Map(), stdout: '' });
    try {
      const run = await engine._applyDefs([def]);
      expect(run.results[0].ok).toBe(false);
      expect(engine.deepTweaksUndoStore.has('test:partial')).toBe(true);
    } finally {
      engine.deepTweaksUndoStore.delete('test:partial');
      Object.assign(engine, orig);
    }
  });

  it('apply/restore runs of DeepTweaksEngine never overlap', async () => {
    const engine = (await import('../electron/services/optimizer/DeepTweaksEngine.js')).default as any;
    let active = 0;
    let maxActive = 0;
    const order: string[] = [];
    const task = (name: string) => async () => {
      active += 1; maxActive = Math.max(maxActive, active); order.push(`${name}:start`);
      await new Promise((r) => setTimeout(r, 20));
      order.push(`${name}:end`); active -= 1;
      return name;
    };
    const res = await Promise.all([engine._exclusive(task('a')), engine._exclusive(task('b'))]);
    expect(res).toEqual(['a', 'b']);
    expect(maxActive).toBe(1);
    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
    // a failing run does not block the queue
    await expect(engine._exclusive(async () => { throw new Error('x'); })).rejects.toThrow('x');
    await expect(engine._exclusive(async () => 'after')).resolves.toBe('after');
  });

  it('SystemOptimizerService.runTasks queues separate batches instead of interleaving them', async () => {
    const svc = (await import('../electron/services/optimizer/SystemOptimizerService.js')).default as any;
    const order: string[] = [];
    const mk = (id: string) => ({ id, name: id, execute: async () => { order.push(`${id}:start`); await new Promise((r) => setTimeout(r, 15)); order.push(`${id}:end`); return { ok: true }; } });
    svc.operations.set('test:a', mk('test:a'));
    svc.operations.set('test:b', mk('test:b'));
    const origCompat = svc.validateTaskCompatibility;
    svc.validateTaskCompatibility = async () => ({ ok: true });
    try {
      await Promise.all([svc.runTasks(['test:a']), svc.runTasks(['test:b'])]);
      expect(order).toEqual(['test:a:start', 'test:a:end', 'test:b:start', 'test:b:end']);
    } finally {
      svc.operations.delete('test:a');
      svc.operations.delete('test:b');
      svc.validateTaskCompatibility = origCompat;
    }
  });

  it('tweak warnings reach the operation list (the UI only confirms items that carry a warning)', async () => {
    const svc = (await import('../electron/services/optimizer/SystemOptimizerService.js')).default as any;
    const ops = svc.listOperations();
    expect(ops.find((o: any) => o.id === 'optimizer:disableLocation').warning).toBeTruthy();
    const engine = (await import('../electron/services/optimizer/DeepTweaksEngine.js')).default as any;
    expect(engine.getDefinition('tweak:setUtcTime').warning).toBeTruthy();
  });

  it('the image-level Defender restore script embeds valid JSON', async () => {
    const { buildImageDefenderRestoreScript } = await import('../electron/services/optimizer/DefenderControlEngine.js') as any;
    const script: string = buildImageDefenderRestoreScript({ WinDefend: 2, "it's": 3 });
    const m = /\$defaults = '((?:[^']|'')*)' \| ConvertFrom-Json/.exec(script);
    expect(m).not.toBeNull();
    const parsed = JSON.parse(m![1].replace(/''/g, "'"));
    expect(parsed.WinDefend).toBe(2);
    expect(script).toContain('DKRESTORE-OK');
  });

  it('waitForElevated gives up early when the elevated process never starts (UAC refused)', async () => {
    const { waitForElevated } = await import('../electron/services/optimizer/ElevationHelper.js') as any;
    const os = await import('node:os');
    const path = await import('node:path');
    const fs = await import('node:fs');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-elev-'));
    const flag = path.join(dir, 'x.done');
    const started = path.join(dir, 'x.started');
    expect(await waitForElevated(flag, started, 300)).toBe('not-started');
    fs.writeFileSync(flag, 'DONE');
    expect(await waitForElevated(flag, started, 300)).toBe('done');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
