import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  default: { app: { getPath: () => '/tmp/dh-test', isPackaged: false } },
  app: { getPath: () => '/tmp/dh-test', isPackaged: false }
}));

// @ts-ignore plain JS module
import * as D from '../electron/services/darkos/DarkOSRecoveryService.js';

const ROOT = 'C:\\ProgramData\\DarkOS';

function fakeFs(present: string[] = [
  `${ROOT}\\Recovery\\manifest.json`,
  `${ROOT}\\bin\\DarkOS.Cli.ps1`,
  `${ROOT}\\bin\\DarkOS.Recovery.psm1`
]) {
  const set = new Set(present.map((p) => p.toLowerCase()));
  return { existsSync: (p: string) => set.has(String(p).toLowerCase()) };
}

function out(data: any, marker = 'DHDONE') {
  return { code: 0, stdout: `noise line\r\nDKJSON:${JSON.stringify(data)}\r\n${marker}\r\n`, stderr: '' };
}

function makeService(runnerImpl: (args: any) => Promise<any>, opts: any = {}) {
  const runner = vi.fn(runnerImpl);
  const svc = new D.DarkOSRecoveryService({
    root: ROOT,
    bundledDir: null,
    runner,
    isElevated: async () => opts.elevated ?? true,
    fsImpl: opts.fs ?? fakeFs()
  });
  return { svc, runner };
}

describe('DarkOS CLI output parsing', () => {
  it('requires DHDONE and parses the DKJSON line', () => {
    const r = D.parseCliOutput('\uFEFFhello\r\nDKJSON:{"a":1}\r\nDHDONE\r\n');
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({ a: 1 });
    expect(r.logs).toContain('hello');
  });
  it('fails on DHFAIL even with JSON', () => {
    const r = D.parseCliOutput('DKJSON:[]\nDHFAIL|module exploded\n');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('module exploded');
  });
  it('fails without a completion marker', () => {
    const r = D.parseCliOutput('DKJSON:{"a":1}\n', 'boom', 1);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('boom');
  });
  it('fails on invalid JSON', () => {
    const r = D.parseCliOutput('DKJSON:{not json\nDHDONE\n');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/JSON invalido/);
  });
  it('parses progress lines', () => {
    expect(D.parseProgressLine('DKPROG:42|Aplicando')).toEqual({ progress: 42, message: 'Aplicando' });
    expect(D.parseProgressLine('DKPROG:250')).toEqual({ progress: 100, message: '' });
    expect(D.parseProgressLine('other')).toBeNull();
  });
});

describe('verified gating', () => {
  it('only counts items with ok AND verified', () => {
    const s = D.summarizeChangeResults([
      { id: 'a', ok: true, verified: true, rebootRequired: false, error: null },
      { id: 'b', ok: true, verified: false, rebootRequired: true, error: null }
    ]);
    expect(s.ok).toBe(false);
    expect(s.failed.map((f: any) => f.id)).toEqual(['b']);
    expect(s.rebootRequired).toBe(true);
    expect(s.results[1].error).toMatch(/verificacao/);
  });
  it('treats a missing verified flag as not verified', () => {
    expect(D.summarizeChangeResults([{ id: 'a', ok: true }]).ok).toBe(false);
    expect(D.summarizeChangeResults({ ok: true }).ok).toBe(false);
    expect(D.summarizeChangeResults({ ok: true, verified: true }).ok).toBe(true);
  });
  it('accepts wrapped results', () => {
    const s = D.summarizeChangeResults({ results: [{ id: 'x', ok: true, verified: true }] });
    expect(s.ok).toBe(true);
    expect(s.results).toHaveLength(1);
  });
});

describe('input validation', () => {
  it('validates change ids, profiles and package names', () => {
    expect(D.isValidChangeId('svc.DiagTrack.manual')).toBe(true);
    expect(D.isValidChangeId('a;rm -rf')).toBe(false);
    expect(D.isValidChangeId("x'y")).toBe(false);
    expect(D.isValidChangeId('')).toBe(false);
    expect(D.isValidProfile('competitive')).toBe(true);
    expect(D.isValidProfile('godMode')).toBe(false);
    expect(D.isValidPackageName('Microsoft.BingNews')).toBe(true);
    expect(D.isValidPackageName('Microsoft.BingNews_4.1.0.0_x64__8wekyb3d8bbwe')).toBe(true);
    expect(D.isValidPackageName("Microsoft.Bing'; Remove-Item")).toBe(false);
    expect(D.isValidPackageName(' Microsoft.BingNews')).toBe(false);
  });
  it('validates labels and diagnostics destinations', () => {
    expect(D.sanitizeLabel('  Antes   do jogo ')).toBe('Antes do jogo');
    expect(D.sanitizeLabel('')).toBeNull();
    expect(D.sanitizeLabel('x'.repeat(81))).toBeNull();
    expect(D.isValidDiagnosticsDestination('C:\\Users\\Memory\\Documents\\diag.zip')).toBe(true);
    expect(D.isValidDiagnosticsDestination('diag.zip')).toBe(false);
    expect(D.isValidDiagnosticsDestination('C:\\x\\diag.txt')).toBe(false);
    expect(D.isValidDiagnosticsDestination('C:\\x\\"evil".zip')).toBe(false);
  });
});

describe('DarkOSRecoveryService', () => {
  it('detects DarkOS by manifest and prefers the installed CLI', () => {
    const { svc } = makeService(async () => out({}));
    expect(svc.isDarkOS()).toBe(true);
    expect(svc.resolveCli()?.source).toBe('installed');
    const { svc: none } = makeService(async () => out({}), { fs: fakeFs([]) });
    expect(none.isDarkOS()).toBe(false);
    expect(none.info().isDarkOS).toBe(false);
  });

  it('falls back to the bundled module copy', () => {
    const fsImpl = fakeFs([`${ROOT}\\Recovery\\manifest.json`, 'D:\\app\\darkos\\DarkOS.Cli.ps1', 'D:\\app\\darkos\\DarkOS.Recovery.psm1']);
    const svc = new D.DarkOSRecoveryService({ root: ROOT, bundledDir: 'D:\\app\\darkos', runner: async () => out({}), fsImpl });
    expect(svc.resolveCli()?.source).toBe('bundled');
  });

  it('refuses to run when not on DarkOS', async () => {
    const { svc, runner } = makeService(async () => out({}), { fs: fakeFs([]) });
    const r = await svc.getManifest();
    expect(r.ok).toBe(false);
    expect(runner).not.toHaveBeenCalled();
  });

  it('rejects invalid input before spawning PowerShell', async () => {
    const { svc, runner } = makeService(async () => out([]));
    expect((await svc.applyChange({ ids: ['ok.id', 'bad id'] })).ok).toBe(false);
    expect((await svc.setProfile({ profile: 'hacker' })).ok).toBe(false);
    expect((await svc.restoreAppx({ packageNames: ['$(evil)'] })).ok).toBe(false);
    expect((await svc.restoreSnapshot({ id: '../x' })).ok).toBe(false);
    expect((await svc.exportDiagnostics({ destination: 'rel.zip' })).ok).toBe(false);
    expect(runner).not.toHaveBeenCalled();
  });

  it('passes validated args through the CLI contract', async () => {
    const { svc, runner } = makeService(async () => out([{ id: 'a.b', ok: true, verified: true, rebootRequired: false, error: null }]));
    const r = await svc.revertChange({ ids: ['a.b', 'a.b'], confirmSecurity: 'yes' });
    expect(r.ok).toBe(true);
    const script = runner.mock.calls[0][0].script as string;
    expect(script).toContain("-Command 'Invoke-DarkOSChange'");
    expect(script).toContain('"Id":["a.b"]');
    expect(script).toContain('"Action":"Revert"');
    expect(script).toContain('"Source":"darkhub"');
    // Only a literal boolean true is forwarded as confirmation.
    expect(script).not.toContain('ConfirmSecurity');
  });

  it('forwards ConfirmSecurity only when explicitly true', async () => {
    const { svc, runner } = makeService(async () => out({ results: [{ id: 'sec.x', ok: true, verified: true }] }));
    await svc.setProfile({ profile: 'maxPerformance', confirmSecurity: true });
    expect(runner.mock.calls[0][0].script).toContain('"ConfirmSecurity":true');
  });

  it('never reports success for unverified changes', async () => {
    const { svc } = makeService(async () => out([{ id: 'a', ok: true, verified: false }]));
    const events: any[] = [];
    const r = await svc.applyChange({ ids: ['a'] }, { onEvent: (e: any) => events.push(e) });
    expect(r.ok).toBe(false);
    expect(events.some((e) => e.type === 'run-finish')).toBe(false);
    expect(events.some((e) => e.type === 'error')).toBe(true);
  });

  it('requires elevation for mutating commands only', async () => {
    const { svc, runner } = makeService(async () => out({ activeProfile: 'darkosDefault' }), { elevated: false });
    expect((await svc.applyChange({ ids: ['a'] })).ok).toBe(false);
    expect(runner).not.toHaveBeenCalled();
    expect((await svc.getManifest()).ok).toBe(true);
  });

  it('serializes CLI calls (one at a time, in order)', async () => {
    let active = 0;
    let maxActive = 0;
    const order: string[] = [];
    const { svc } = makeService(async ({ script }: any) => {
      active++;
      maxActive = Math.max(maxActive, active);
      const cmd = /-Command '([^']+)'/.exec(script)![1];
      order.push(cmd);
      await new Promise((r) => setTimeout(r, 15));
      active--;
      return out(cmd.startsWith('Invoke') ? [{ id: 'a', ok: true, verified: true }] : {});
    });
    await Promise.all([svc.applyChange({ ids: ['a'] }), svc.getManifest(), svc.getFailures(), svc.listSnapshots()]);
    expect(maxActive).toBe(1);
    expect(order).toEqual(['Invoke-DarkOSChange', 'Get-DarkOSManifest', 'Get-DarkOSFailures', 'Get-DarkOSSnapshot']);
  });

  it('keeps the queue alive after a runner failure and maps timeouts', async () => {
    let n = 0;
    const { svc } = makeService(async () => {
      n++;
      if (n === 1) throw new Error('Command timed out after 1000ms');
      return out({ ok: 1 });
    });
    const [a, b] = await Promise.all([svc.getManifest(), svc.getManifest()]);
    expect(a.ok).toBe(false);
    expect(a.error).toMatch(/Tempo limite/);
    expect(b.ok).toBe(true);
  });

  it('streams progress lines as events', async () => {
    const { svc } = makeService(async ({ onLine }: any) => {
      onLine('DKPROG:50|Metade');
      onLine('Removendo pacote');
      return out([{ id: 'a', ok: true, verified: true }]);
    });
    const events: any[] = [];
    await svc.applyChange({ ids: ['a'] }, { onEvent: (e: any) => events.push(e) });
    expect(events.find((e) => e.type === 'progress')?.progress).toBe(50);
    expect(events.some((e) => e.type === 'log' && e.message === 'Removendo pacote')).toBe(true);
    expect(events[events.length - 1].type).toBe('run-finish');
  });

  it('snapshot creation requires a returned id', async () => {
    const { svc } = makeService(async () => out({ label: 'x' }));
    expect((await svc.createSnapshot({ label: 'x' })).ok).toBe(false);
    const { svc: good } = makeService(async () => out({ id: 'snap-20261012', label: 'x' }));
    expect((await good.createSnapshot({ label: 'x' })).ok).toBe(true);
  });

  it('diagnostics export requires the zip to exist', async () => {
    const dest = 'C:\\Users\\Memory\\Documents\\d.zip';
    const { svc } = makeService(async () => out({ path: dest }));
    expect((await svc.exportDiagnostics({ destination: dest })).ok).toBe(false);
    const fsImpl = fakeFs([`${ROOT}\\Recovery\\manifest.json`, `${ROOT}\\bin\\DarkOS.Cli.ps1`, `${ROOT}\\bin\\DarkOS.Recovery.psm1`, dest]);
    const { svc: good } = makeService(async () => out({ path: dest }), { fs: fsImpl });
    expect((await good.exportDiagnostics({ destination: dest })).ok).toBe(true);
  });

  it('rejects commands outside the whitelist', async () => {
    const { svc, runner } = makeService(async () => out({}));
    expect((await svc.run('Remove-Everything', {})).ok).toBe(false);
    expect(runner).not.toHaveBeenCalled();
  });
});

import { mergeChanges, profileDiff, normalizeReboot, normalizeRemovedApps } from '../src/utils/darkosData';

describe('DarkOS UI data helpers', () => {
  const catalog = [
    { id: 'a', profiles: ['darkosDefault', 'competitive'] },
    { id: 'b', profiles: ['competitive'] },
    { id: 'sec', profiles: ['maxPerformance'], securityRelated: true },
    { id: 'c', profiles: ['darkosDefault'] }
  ];
  const manifest: any = { activeProfile: 'darkosDefault', changes: [{ id: 'a', status: 'applied' }, { id: 'c', status: 'applied' }, { id: 'orphan', status: 'failed' }] };

  it('merges catalog with manifest status', () => {
    const rows = mergeChanges(catalog, manifest);
    expect(rows.find((r) => r.id === 'b')?.status).toBe('notApplied');
    expect(rows.find((r) => r.id === 'orphan')?.status).toBe('failed');
  });

  it('computes a profile diff and flags security items (never auto-included)', () => {
    const rows = mergeChanges({ changes: catalog }, manifest);
    const d = profileDiff(rows, 'competitive');
    expect(d.apply.map((r) => r.id)).toEqual(['b']);
    expect(d.revert.map((r) => r.id)).toEqual(['c']);
    expect(d.security).toEqual([]);
    expect(profileDiff(rows, 'maxPerformance').security.map((r) => r.id)).toEqual(['sec']);
  });

  it('normalizes reboot and removed-app shapes', () => {
    expect(normalizeReboot(true)).toEqual({ pending: true, ids: [] });
    expect(normalizeReboot({ ids: ['x'] }).pending).toBe(true);
    expect(normalizeReboot({ pending: false }).pending).toBe(false);
    const apps = normalizeRemovedApps([{ PackageName: 'Microsoft.BingNews', payloadAvailable: true }, { packageName: '' }]);
    expect(apps).toEqual([{ packageName: 'Microsoft.BingNews', displayName: 'Microsoft.BingNews', restorable: true }]);
  });
});
