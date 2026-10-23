import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-ignore plain JS modules
import { normalize, normalizeRule } from '../electron/services/realtime/realtimeConfig.js';
// @ts-ignore
import { shouldTrim, nextCooldownMin, planRuleActions, RealtimeOptimizer } from '../electron/services/realtime/RealtimeOptimizer.js';
// @ts-ignore
import { HashDb, EICAR_SHA256 } from '../electron/services/realtime/HashDb.js';
// @ts-ignore
import { Quarantine } from '../electron/services/realtime/Quarantine.js';
// @ts-ignore
import { parseClamscan } from '../electron/services/realtime/ClamAv.js';
// @ts-ignore
import { isScanCandidate, RealtimeProtection } from '../electron/services/realtime/RealtimeProtection.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dh-rt-'));
const sha = (buf: Buffer) => crypto.createHash('sha256').update(buf).digest('hex');
const waitFor = async (fn: () => boolean, ms = 8000) => { const end = Date.now() + ms; while (!fn()) { if (Date.now() > end) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 50)); } };

describe('real-time config', () => {
  it('is off by default and never accepts system processes in rules', () => {
    const c = normalize({}, 'C:\\Users\\x');
    expect(c.optimizer.enabled).toBe(false);
    expect(c.protection.enabled).toBe(false);
    expect(c.protection.folders).toEqual(['C:\\Users\\x\\Downloads', 'C:\\Users\\x\\Desktop']);
    for (const name of ['svchost.exe', 'explorer.exe', 'lsass.exe', 'DarkHub.exe', 'bad name', '../x.exe']) expect(normalizeRule({ name })).toBeNull();
    expect(normalizeRule({ name: 'OneDrive.exe', action: 'close' })).toEqual({ name: 'onedrive.exe', action: 'close' });
  });
  it('clamps numbers, drops relative folders and invalid hashes', () => {
    const c = normalize({ optimizer: { memoryThresholdPct: 99, cooldownMin: -5 }, protection: { folders: ['relative', 'D:\\Games'], allowHashes: ['xyz', 'A'.repeat(64)] } });
    expect(c.optimizer.memoryThresholdPct).toBe(40);
    expect(c.optimizer.cooldownMin).toBe(2);
    expect(c.protection.folders).toEqual(['D:\\Games']);
    expect(c.protection.allowHashes).toEqual(['a'.repeat(64)]);
  });
});

describe('real-time optimizer decisions', () => {
  const cfg = { memory: true, memoryThresholdPct: 15, cooldownMin: 10, minProcessMb: 150, rules: [] as any[] };
  it('trims only under pressure and after the cooldown', () => {
    expect(shouldTrim({ availMb: 1000, totalMb: 16000, now: 10, nextAllowedAt: 0 }, cfg)).toBe(true);
    expect(shouldTrim({ availMb: 4000, totalMb: 16000, now: 10, nextAllowedAt: 0 }, cfg)).toBe(false);
    expect(shouldTrim({ availMb: 1000, totalMb: 16000, now: 10, nextAllowedAt: 99 }, cfg)).toBe(false);
    expect(shouldTrim({ availMb: 1000, totalMb: 16000, now: 10, nextAllowedAt: 0 }, { ...cfg, memory: false })).toBe(false);
  });
  it('backs off while trims free little and resets when one helps', () => {
    expect(nextCooldownMin(10, 5, cfg)).toBe(20);
    expect(nextCooldownMin(40, 5, cfg)).toBe(60);
    expect(nextCooldownMin(60, 0, cfg)).toBe(60);
    expect(nextCooldownMin(40, 900, cfg)).toBe(10);
  });
  it('acts only on listed processes, never on the foreground window or itself', () => {
    const procs = [{ pid: 100, name: 'OneDrive' }, { pid: 200, name: 'Spotify' }, { pid: 300, name: 'game' }, { pid: 4, name: 'System' }];
    const rules = [{ name: 'onedrive.exe', action: 'lower' }, { name: 'spotify.exe', action: 'close' }, { name: 'game.exe', action: 'close' }];
    expect(planRuleActions(procs, rules, { foregroundPid: 300, selfPid: 1, handled: new Set([200]) })).toEqual([{ pid: 100, name: 'OneDrive', action: 'lower' }]);
    expect(planRuleActions(procs, [], {})).toEqual([]);
  });
  it('runs a trim through the native engine and records what became available', async () => {
    let avail = 1000;
    const calls: any[] = [];
    const native = { cleanRam: async (pid: number, mb: number) => { calls.push([pid, mb]); avail = 2500; return { processes_cleaned: 7 }; }, listProcesses: async () => null };
    const opt = new RealtimeOptimizer({ native, getConfig: () => cfg, memory: () => ({ availMb: avail, totalMb: 16000 }) });
    const events: any[] = [];
    opt.on('event', (e: any) => events.push(e));
    opt.start();
    await waitFor(() => events.some((e) => e.event === 'memory-trim'), 9000);
    opt.stop();
    const trim = events.find((e) => e.event === 'memory-trim');
    expect(calls[0][1]).toBe(150);
    expect(trim.freedMb).toBe(1500);
    expect(trim.processes).toBe(7);
  }, 12000);
});

describe('hash database', () => {
  it('finds members by binary search and nothing else', () => {
    const many = Array.from({ length: 5000 }, (_, i) => ({ sha256: sha(Buffer.from(`sample-${i}`)) }));
    const db = new HashDb([...many, { sha256: EICAR_SHA256, name: 'EICAR-Test-File' }, { sha256: 'not-a-hash' }]);
    expect(db.size).toBe(5001);
    expect(db.lookup(EICAR_SHA256)).toBe('EICAR-Test-File');
    expect(db.lookup(many[1234].sha256.toUpperCase())).toBe('Known malware (hash)');
    expect(db.lookup(sha(Buffer.from('clean')))).toBeNull();
    expect(new HashDb([]).lookup(EICAR_SHA256)).toBeNull();
  });
});

describe('quarantine', () => {
  it('moves a file out, stores it unreadable, and restores it byte for byte', async () => {
    const dir = tmp();
    const file = path.join(dir, 'tool.exe');
    const data = crypto.randomBytes(300000);
    fs.writeFileSync(file, data);
    const q = new Quarantine(path.join(dir, 'q'));
    const item = await q.add(file, { detection: 'Test', sha256: sha(data) });
    expect(fs.existsSync(file)).toBe(false);
    expect(item.key).toBeUndefined();
    const stored = fs.readFileSync(path.join(dir, 'q', `${item.id}.q`));
    expect(stored.length).toBe(data.length);
    expect(stored.equals(data)).toBe(false);
    expect(q.list()).toHaveLength(1);
    fs.writeFileSync(file, 'a new file with the same name');
    const r = await q.restore(item.id);
    expect(r.restoredTo).toBe(path.join(dir, 'tool (restored 1).exe'));
    expect(fs.readFileSync(r.restoredTo).equals(data)).toBe(true);
    expect(q.list()).toHaveLength(0);
    expect(() => q.remove('../../etc')).toThrow();
  });
});

describe('scanners', () => {
  it('parses clamscan detections', () => {
    expect(parseClamscan('C:\\Users\\a\\Downloads\\x.exe: Win.Trojan.Agent-123 FOUND\r\nC:\\b: OK\r\n')).toEqual([{ file: 'C:\\Users\\a\\Downloads\\x.exe', signature: 'Win.Trojan.Agent-123' }]);
  });
  it('only queues risky, finished files', () => {
    expect(isScanCandidate('C:\\d\\setup.exe')).toBe(true);
    expect(isScanCandidate('C:\\d\\script.PS1')).toBe(true);
    expect(isScanCandidate('C:\\d\\photo.jpg')).toBe(false);
    expect(isScanCandidate('C:\\d\\setup.exe.crdownload')).toBe(false);
    expect(isScanCandidate('C:\\d\\~$doc.docm')).toBe(false);
  });
  it('detects a known-bad file dropped in a watched folder and quarantines it', async () => {
    const dir = tmp();
    const bad = crypto.randomBytes(4096);
    const db = new HashDb([{ sha256: sha(bad), name: 'Test.Sample' }]);
    const cfg = { folders: [dir], clamav: false, autoQuarantine: true, maxFileMb: 50, allowHashes: [] as string[] };
    const notes: any[] = [];
    const prot = new RealtimeProtection({ getConfig: () => cfg, getHashDb: () => db, quarantine: new Quarantine(path.join(tmp(), 'q')), notify: (n: any) => notes.push(n) });
    prot.start();
    try {
      fs.writeFileSync(path.join(dir, 'clean.exe'), crypto.randomBytes(1024));
      fs.writeFileSync(path.join(dir, 'payload.exe'), bad);
      fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored');
      await waitFor(() => notes.length > 0 && prot.stats.scanned >= 2, 12000);
      expect(notes[0]).toMatchObject({ detection: 'Test.Sample', quarantined: true });
      expect(fs.existsSync(path.join(dir, 'payload.exe'))).toBe(false);
      expect(fs.existsSync(path.join(dir, 'clean.exe'))).toBe(true);
      expect(prot.stats.detections).toBe(1);
    } finally {
      prot.stop();
    }
  }, 15000);
});

describe('freshclam config', () => {
  it('points at DarkHub own database folder and has no clamd options (verified with freshclam 1.5.4)', async () => {
    // @ts-ignore
    const { freshclamConf } = await import('../electron/services/realtime/ClamAv.js');
    const conf = freshclamConf('C:/ProgramData/DarkHub/ClamAV/db');
    expect(conf).toContain('DatabaseDirectory C:/ProgramData/DarkHub/ClamAV/db');
    expect(conf).not.toMatch(/NotifyClamd|Example/);
  });
});
