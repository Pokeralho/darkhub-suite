import { describe, it, expect, vi, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('electron', () => ({ default: { app: { getPath: () => '/tmp/dh-test', isPackaged: false } }, app: { getPath: () => '/tmp/dh-test', isPackaged: false } }));

// @ts-ignore plain JS module
import * as SysOps from '../electron/services/optimizer/SysOps.js';
// @ts-ignore plain JS module
import DeepTweaks from '../electron/services/optimizer/DeepTweaksEngine.js';
// @ts-ignore plain JS module
import { runPowerShell } from '../electron/services/PowerShellRunner.js';
// @ts-ignore plain JS module
import { buildRegistryScript, buildRegistryReadScript, parseDhResults, parseRegistryReadOutput, regEntryId, regValueMatches, snapshotEntryToOps, canonicalRegValue } from '../electron/services/optimizer/OptimizerUtils.js';

const EXE = path.resolve('electron/services/DarkHub.SysOps.exe');
const ready = process.platform === 'win32' && fs.existsSync(EXE);
const BASE = 'HKCU\\Software\\DarkHub-SysOpsTest-vitest';
SysOps._configure({ integrity: () => null }); // dev checkout: the manifest may lag a fresh build

const psWrite = async (ops: any[]) => {
  const r = await runPowerShell(buildRegistryScript(ops), { timeoutMs: 60000, trim: true });
  const m = parseDhResults(r.stdout);
  return ops.map((_, i) => m.get(i));
};
const psRead = async (entries: any[]) => parseRegistryReadOutput((await runPowerShell(buildRegistryReadScript(entries), { timeoutMs: 60000, trim: true })).stdout);

/** The same ops under a given key. */
const opsFor = (k: string) => [
  { key: k, name: 'dw', type: 'REG_DWORD', data: '0xffffffff' },
  { key: k, name: 'dwNeg', type: 'REG_DWORD', data: -2 },
  { key: k, name: 'dwNum', type: 'REG_DWORD', data: 38 },
  { key: k, name: 'qw', type: 'REG_QWORD', data: '1234567890123' },
  { key: k, name: 'sz', type: 'REG_SZ', data: "olá 'aspas' ’ \"x\" $env:X `n" },
  { key: k, name: 'ex', type: 'REG_EXPAND_SZ', data: '%SystemRoot%\\System32' },
  { key: k, name: 'bin', type: 'REG_BINARY', data: '00,ff,10' },
  { key: k, name: 'multi', type: 'REG_MULTI_SZ', data: 'a|b|c' },
  { key: k, name: '', type: 'REG_SZ', data: 'default value' },
  { key: k, name: 'gone', type: 'REG_DWORD', data: '1' },
  { key: k, name: 'gone', deleteValue: true },
  { key: k, name: 'neverThere', deleteValue: true },
  { key: `${k}\\emptySub`, name: 'x', type: 'REG_DWORD', data: '1' },
  { key: `${k}\\emptySub`, name: 'x', deleteValue: true },
  { key: `${k}\\emptySub`, deleteKeyIfEmpty: true },
  { key: `${k}\\tree\\deep`, name: 'x', type: 'REG_DWORD', data: '1' },
  { key: `${k}\\tree`, deleteKey: true },
  { key: `${k}\\missing\\x`, deleteKey: true },
  { key: 'HKCU', name: 'x', type: 'REG_DWORD', data: '1' },
  { key: 'HKEY_CURRENT_USER\\x', name: 'x', type: 'REG_DWORD', data: '1' }
];
const readsFor = (k: string) => ['dw', 'dwNeg', 'dwNum', 'qw', 'sz', 'ex', 'bin', 'multi', '', 'gone', 'neverThere']
  .map((name) => ({ key: k, name }))
  .concat([{ key: `${k}\\emptySub`, name: 'x' }, { key: `${k}\\tree\\deep`, name: 'x' }, { key: `${k}\\tree`, name: '' }]);
const strip = (m: Map<string, any>, k: string) => new Map([...m].map(([id, v]) => [id.replace(k.toLowerCase(), '<k>'), { ...v, key: undefined }]));

describe.skipIf(!ready)('DarkHub.SysOps.exe (native Optimizer registry engine)', () => {
  afterAll(async () => {
    await psWrite([{ key: BASE, deleteKey: true }]);
  });

  it('writes and reads exactly like the PowerShell engine it replaces', async () => {
    const kPs = `${BASE}\\ps`;
    const kNat = `${BASE}\\native`;
    const wPs = await psWrite(opsFor(kPs));
    const wNat = await SysOps.writeRegistry(opsFor(kNat), { audit: false });
    expect(wNat).not.toBeNull();
    expect(wNat!.map((r: any) => r.ok)).toEqual(wPs.map((r: any) => r?.ok));
    expect(wNat!.slice(-2).map((r: any) => r.ok)).toEqual([false, false]);

    // each engine reads both keys the same way, and both keys hold the same data
    const natOfPs = await SysOps.readRegistry(readsFor(kPs));
    const psOfPs = await psRead(readsFor(kPs));
    const natOfNat = await SysOps.readRegistry(readsFor(kNat));
    expect(strip(natOfPs!, kPs)).toEqual(strip(psOfPs, kPs));
    expect(strip(natOfNat!, kNat)).toEqual(strip(natOfPs!, kPs));
    const v = natOfNat!.get(regEntryId(kNat, 'dw'));
    expect([v.kind, v.value]).toEqual(['DWord', -1]);
    expect(natOfNat!.get(regEntryId(kNat, 'multi')).value).toBe('a|b|c');
    expect(natOfNat!.get(regEntryId(kNat, 'gone')).exists).toBe(false);
    expect(natOfNat!.get(regEntryId(`${kNat}\\emptySub`, 'x')).keyExists).toBe(false);
    expect(natOfNat!.get(regEntryId(`${kNat}\\tree`, '')).keyExists).toBe(false);
  }, 60000);

  it('reads real machine values the same as PowerShell (HKLM, HKCR, missing keys)', async () => {
    const entries = [
      { key: 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion', name: 'CurrentBuildNumber' },
      { key: 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion', name: 'InstallDate' },
      { key: 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion', name: 'DigitalProductId' },
      { key: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment', name: 'Path' },
      { key: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters', name: 'SearchList' },
      { key: 'HKCR\\.txt', name: '' },
      { key: 'HKLM\\SOFTWARE\\DarkHub-Does-Not-Exist', name: 'x' },
      { key: 'HKLM', name: 'x' },
      { key: 'bogus', name: 'x' }
    ];
    const nat = await SysOps.readRegistry(entries);
    const ps = await psRead(entries);
    expect(nat).not.toBeNull();
    expect(nat).toEqual(ps);
  }, 60000);

  it('restores legacy and current snapshot formats', async () => {
    const k = `${BASE}\\undo`;
    const snaps = [
      { key: k, name: 'legacyHex', existed: true, type: 'REG_DWORD', data: '0x1' },
      { key: k, name: 'signed', existed: true, type: 'REG_DWORD', data: -1 },
      { key: k, name: 'kindOnly', existed: true, kind: 'QWord', data: 7 },
      { key: k, name: 'str', existed: true, type: 'REG_SZ', data: 'v' },
      { key: k, name: 'never', existed: false, keyExisted: true }
    ];
    const ops = snaps.flatMap(snapshotEntryToOps);
    const r = await SysOps.writeRegistry(ops, { audit: false });
    expect(r!.every((x: any) => x.ok)).toBe(true);
    const read = await SysOps.readRegistry(snaps);
    for (const s of snaps.filter((x) => x.existed)) {
      const cur = read!.get(regEntryId(k, s.name));
      const type = (s as any).type || 'REG_QWORD';
      expect(regValueMatches({ type, data: s.data }, cur), s.name).toBe(true);
    }
    expect(read!.get(regEntryId(k, 'never')).exists).toBe(false);
  });

  it('accepts every change and revert row of the whole Optimizer catalog (dry run)', async () => {
    const facts = { build: 26100, ramKB: 16 * 1024 * 1024, gpus: [{ index: '0000', id: 'pci\\ven_10de&dev_2684', desc: 'NVIDIA' }] };
    const rows: any[] = [];
    for (const t of DeepTweaks.listTweaks()) {
      const d = DeepTweaks.getDefinition(t.id);
      rows.push(...(d.changes || []), ...(d.revertChanges || []));
      if (d.dynamicRows) for (const [key, name, type, data] of d.dynamicRows(facts)) rows.push({ key, name, type, data: String(data) });
    }
    for (const g of DeepTweaks.internalGroups) rows.push(...(g.changes || []), ...(g.revertChanges || []));
    expect(rows.length).toBeGreaterThan(200);
    const r = await SysOps.writeRegistry(rows, { dryRun: true });
    const bad = rows.map((c, i) => [c, r![i]]).filter(([, x]) => !x.ok);
    expect(bad).toEqual([]);
  });

  it('runRegistryOps uses the helper for HKCU and reports per op', async () => {
    const k = `${BASE}\\engine`;
    const res = await DeepTweaks.runRegistryOps([
      { key: k, name: 'a', type: 'REG_DWORD', data: '5' },
      { key: k, name: 'b\nc', type: 'REG_SZ', data: 'x' }
    ]);
    expect(res[0].ok).toBe(true);
    expect(res[1]).toEqual({ ok: false, message: 'definição inválida' });
    const read = await DeepTweaks.readEntries([{ key: k, name: 'a' }]);
    expect(canonicalRegValue('REG_DWORD', read.get(regEntryId(k, 'a')).value)).toBe('5');
  });

  it('falls back (null) when the helper is missing, disabled or misbehaves', async () => {
    try {
      SysOps._configure({ exe: path.join(EXE, '..', 'nope.exe') });
      expect(await SysOps.readRegistry([{ key: BASE, name: 'x' }])).toBeNull();
      SysOps._configure({ exe: EXE, exec: (_f: any, _a: any, _o: any, cb: any) => { setImmediate(() => cb(null, 'garbage', '')); return { stdin: { end() {}, on() {} } }; } });
      expect(await SysOps.writeRegistry([{ key: BASE, name: 'x', type: 'REG_SZ', data: '1' }])).toBeNull();
      SysOps._configure({ exec: (_f: any, _a: any, _o: any, cb: any) => { setImmediate(() => cb(null, JSON.stringify({ v: 1, ok: true, results: [] }), '')); return { stdin: { end() {}, on() {} } }; } });
      expect(await SysOps.writeRegistry([{ key: BASE, name: 'x', type: 'REG_SZ', data: '1' }])).toBeNull();
      SysOps._configure({ exec: (await import('node:child_process')).execFile });
      SysOps.setEngine('powershell');
      expect(SysOps.available()).toBe(false);
    } finally {
      SysOps.setEngine('native');
      SysOps._configure({ exe: EXE });
    }
    expect(SysOps.available()).toBe(true);
  });

  it('refuses a helper that fails the integrity check', async () => {
    try {
      SysOps._configure({ integrity: () => 'integrity_failed: DarkHub.SysOps.exe (mismatch)' });
      expect(SysOps.available()).toBe(false);
    } finally {
      SysOps._configure({ integrity: () => null });
    }
  });
});
