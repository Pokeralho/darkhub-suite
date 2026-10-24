import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-ignore plain JS modules
import { FEED_SOURCES, isAllowedFeedUrl } from '../electron/services/security/feedSources.js';
// @ts-ignore
import * as P from '../electron/services/security/feedParsers.js';
// @ts-ignore
import * as H from '../electron/services/security/hardeningCatalog.js';
// @ts-ignore
import { readCapped } from '../electron/services/security/AdvancedProtectionService.js';

describe('feed catalog', () => {
  it('only uses HTTPS URLs on allowed hosts, with license and unique ids', () => {
    const ids = new Set();
    for (const s of FEED_SOURCES) {
      expect(isAllowedFeedUrl(s.url)).toBe(true);
      for (const m of s.mirrors || []) expect(isAllowedFeedUrl(m)).toBe(true);
      expect(s.license).toBeTruthy();
      expect(['hosts', 'ip', 'hash']).toContain(s.kind);
      ids.add(s.id);
    }
    expect(ids.size).toBe(FEED_SOURCES.length);
    expect(isAllowedFeedUrl('http://raw.githubusercontent.com/x')).toBe(false);
    expect(isAllowedFeedUrl('https://evil.example.com/hosts')).toBe(false);
  });
});

describe('feed parsers', () => {
  it('parses hosts format and refuses redirects to real addresses', () => {
    const text = [
      '# Title: test', '127.0.0.1 localhost', '::1 localhost', '0.0.0.0 0.0.0.0', '255.255.255.255 broadcasthost',
      '0.0.0.0 ads.example.com # comment', '127.0.0.1 Tracker.Example.NET.', '0.0.0.0 a.test.org b.test.org',
      '1.2.3.4 mybank.com', '0.0.0.0 bad_domain', '0.0.0.0 vortex.data.microsoft.com', '0.0.0.0 ad_server.example.com'
    ].join('\r\n');
    const parsed = P.parseFeed({ format: 'hosts' }, text);
    expect(parsed.entries.sort()).toEqual(['a.test.org', 'ad_server.example.com', 'ads.example.com', 'b.test.org', 'tracker.example.net']);
  });

  it('parses one-domain-per-line lists', () => {
    const text = '# Last modified: 23 Oct 2026 09:01 UTC\nfoo.example.com\n*.bar.example.org\nhttp://x.com/a\nnot a domain\n10.0.0.1\n';
    const parsed = P.parseFeed({ format: 'domains' }, text);
    expect(parsed.entries).toEqual(['foo.example.com', 'bar.example.org']);
    expect(parsed.upstreamDate).toBe('23 Oct 2026 09:01 UTC');
  });

  it('parses IP lists (Spamhaus, plain) and drops private/reserved and over-broad ranges', () => {
    const text = [
      '; Spamhaus DROP List', '1.10.16.0/20 ; SBL256894', '50.16.16.211', '10.0.0.0/8 ; private', '192.168.1.5',
      '8.0.0.0/7', '2.57.122.7/24', '300.1.1.1', '100.64.1.1', '# END'
    ].join('\n');
    expect(P.parseIpList(text)).toEqual(['1.10.16.0/20', '50.16.16.211', '2.57.122.0/24']);
  });

  it('matches IPs against CIDR ranges', () => {
    const m = P.buildIpMatcher([{ ...P.parseCidr('1.10.16.0/20'), source: 'drop' }, { ...P.parseCidr('50.16.16.211'), source: 'feodo' }]);
    expect(m.match('1.10.31.255')).toBe('drop');
    expect(m.match('1.10.32.0')).toBeNull();
    expect(m.match('::ffff:50.16.16.211')).toBe('feodo');
    expect(m.match('not-an-ip')).toBeNull();
  });

  it('parses SHA-256 lists with and without comments, ignoring MD5/SHA-1', () => {
    const a = 'a'.repeat(64);
    const b = 'B'.repeat(64);
    const text = `# header\n${a}\n${b};Dark Caracal - PE32\n${'c'.repeat(32)};md5\n${'d'.repeat(40)};sha1\n${a}\n`;
    expect(P.parseSha256List(text)).toEqual([{ sha256: a, name: '' }, { sha256: 'b'.repeat(64), name: 'Dark Caracal - PE32' }]);
  });

  it('flags HTML error pages', () => {
    expect(P.looksLikeHtml('<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN">')).toBe(true);
    expect(P.looksLikeHtml('# hosts\n0.0.0.0 a.com')).toBe(false);
  });

  it('parses the real lists when they were downloaded to scratch (optional)', () => {
    const dir = process.env.DH_FEEDS_DIR;
    if (!dir || !fs.existsSync(dir)) return;
    const files: Record<string, string> = { sb_unified: 'hosts', hz_promini: 'domains', mf_phishing: 'hosts', drop: 'ips', feodo: 'ips', rm_hash: 'sha256', neo_hash: 'sha256' };
    for (const [f, format] of Object.entries(files)) {
      const p = path.join(dir, f);
      if (!fs.existsSync(p)) continue;
      const r = P.parseFeed({ format }, fs.readFileSync(p, 'utf8'));
      expect(r.count, f).toBeGreaterThan(0);
    }
  });
});

describe('managed hosts block', () => {
  const user = '# Copyright (c) Microsoft\r\n127.0.0.1 localhost\r\n10.0.0.5 nas.home.lan\r\n0.0.0.0 mine.example.com';

  it('round-trips exactly (merge then remove gives back the original bytes)', () => {
    for (const original of [user, `${user}\r\n`, '', '\ufeff# bom\n1.1.1.1 x.lan\n', 'single line no eol']) {
      const merged = P.mergeManagedBlock(original, ['ads.example.com', 'tracker.example.net'], { sources: ['stevenblack-unified'], updatedAt: '2026-10-23T10:00:00.000Z' });
      expect(merged.ok).toBe(true);
      expect(merged.content.startsWith(original)).toBe(true);
      const removed = P.removeManagedBlock(merged.content);
      expect(removed.ok).toBe(true);
      expect(removed.removed).toBe(1);
      expect(removed.content).toBe(original);
    }
  });

  it('keeps user entries, skips names the user already maps and never-blocked domains, dedupes', () => {
    const merged = P.mergeManagedBlock(user, ['mine.example.com', 'a.com', 'A.com', 'update.microsoft.com', 'raw.githubusercontent.com', 'b.com'], { sources: ['x'] });
    expect(merged.count).toBe(2);
    expect(merged.skippedUser).toBe(1);
    expect(merged.content).toContain('10.0.0.5 nas.home.lan');
    expect(merged.content).toContain('\r\n0.0.0.0 a.com\r\n');
    const info = P.readManagedBlockInfo(merged.content);
    expect(info).toMatchObject({ present: true, entries: 2, sources: ['x'], unterminated: false });
  });

  it('replaces the previous block instead of stacking blocks', () => {
    const one = P.mergeManagedBlock(user, ['a.com'], {}).content;
    const two = P.mergeManagedBlock(one, ['b.com', 'c.com'], {}).content;
    expect(two.split(P.HOSTS_BEGIN).length - 1).toBe(1);
    expect(P.readManagedBlockInfo(two).entries).toBe(2);
    expect(P.removeManagedBlock(two).content).toBe(user);
  });

  it('leaves other tools blocks alone and refuses to edit an unterminated block', () => {
    const other = `${user}\r\n# DarkHub Tracking Blocker - BEGIN\r\n127.0.0.1 doubleclick.net\r\n# DarkHub Tracking Blocker - END\r\n`;
    const merged = P.mergeManagedBlock(other, ['a.com'], {});
    expect(P.removeManagedBlock(merged.content).content).toBe(other);
    const broken = `${user}\r\n${P.HOSTS_BEGIN} | nl=0\r\n0.0.0.0 a.com\r\n`;
    expect(P.removeManagedBlock(broken).ok).toBe(false);
    expect(P.mergeManagedBlock(broken, ['b.com'], {}).ok).toBe(false);
  });

  it('refuses a block larger than Windows DNS handles well (measured in the VM) instead of cutting it', () => {
    expect(P.HOSTS_MAX_ENTRIES).toBe(10_000);
    const many = Array.from({ length: P.HOSTS_MAX_ENTRIES + 10 }, (_, i) => `d${i}.example.com`);
    expect(P.mergeManagedBlock('', many, {})).toMatchObject({ ok: false, error: 'too-many', count: P.HOSTS_MAX_ENTRIES + 10, max: P.HOSTS_MAX_ENTRIES });
    const fits = P.mergeManagedBlock('', many.slice(0, P.HOSTS_MAX_ENTRIES), {});
    expect(fits).toMatchObject({ ok: true, count: P.HOSTS_MAX_ENTRIES, truncated: false });
  });

  it('builds a hash-checked elevated copy script', () => {
    const s = P.buildHostsWriteScript({ stagedPath: "C:\\Users\\O'Brien\\h.txt", sha256: 'a'.repeat(64), hostsPath: 'C:\\Windows\\System32\\drivers\\etc\\hosts' });
    expect(s).toContain("'C:\\Users\\O''Brien\\h.txt'");
    expect(s).toContain('Get-FileHash');
    expect(s).toContain('ipconfig /flushdns');
    expect(() => P.buildHostsWriteScript({ stagedPath: 'x', sha256: 'nope', hostsPath: 'y' })).toThrow();
  });
});

describe('firewall scripts', () => {
  it('chunks addresses into grouped inbound+outbound block rules and re-validates them', () => {
    const addrs = Array.from({ length: 2500 }, (_, i) => `45.${Math.floor(i / 250)}.${i % 250}.1`);
    const s = P.buildFirewallApplyScript([...addrs, '10.1.1.1', "1.1.1.1'; Remove-Item C:\\ -Recurse"], 1000);
    expect((s.match(/\[void\]\$chunks\.Add/g) || []).length).toBe(3);
    expect(s).toContain(P.FIREWALL_GROUP);
    expect(s).not.toContain('10.1.1.1');
    expect(s).not.toContain('Remove-Item C:');
    expect(s).toContain("@('Outbound','Inbound')");
    expect(() => P.buildFirewallApplyScript(['192.168.0.1'])).toThrow();
    expect(P.parseFirewallCount('x\r\nDHFW|6\r\nDHDONE')).toBe(6);
    expect(P.buildFirewallRemoveScript()).toContain('Remove-NetFirewallRule');
  });
});

describe('hardening catalog', () => {
  const baseStatus = {
    defender: { available: true, mode: 'Normal', antivirus: true },
    asr: { ids: [], actions: [] }, pua: 0, cfa: 0,
    smb1: { server: true, feature: 'Enabled', clientDriver: true, clientStart: 3 },
    netbios: [{ name: 'Tcpip_{11111111-2222-3333-4444-555555555555}', value: 0 }],
    registry: '[]'
  };

  it('evaluates status and Defender availability', () => {
    const ev = H.evaluateHardening(baseStatus);
    expect(Object.keys(ev).sort()).toEqual(H.HARDENING_ITEMS.map((i: any) => i.id).sort());
    expect(Object.values(ev).every((x: any) => x.applied === false)).toBe(true);
    expect(ev.asr.available).toBe(true);
    const passive = H.evaluateHardening({ ...baseStatus, defender: { available: true, mode: 'Passive Mode' } });
    expect(passive.pua.available).toBe(false);
    const asrBlock = H.evaluateHardening({ ...baseStatus, asr: { ids: H.ASR_RULES.map((r: any) => r.id.toUpperCase()), actions: H.ASR_RULES.map(() => 1) } });
    expect(asrBlock.asr.applied).toBe(true);
    expect(asrBlock.asr.detail.mode).toBe('block');
    const reg = JSON.stringify([{ key: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server', name: 'fDenyTSConnections', keyExists: true, exists: true, kind: 'DWord', value: 1 }]);
    expect(H.evaluateHardening({ ...baseStatus, registry: reg }).rdpOff.applied).toBe(true);
  });

  it('every apply script snapshots first and every snapshot restores', () => {
    for (const item of H.HARDENING_ITEMS) {
      const s = H.buildHardeningApplyScript(item.id, { mode: 'audit' });
      expect(s, item.id).toContain(`DHSNAP|${item.id}|`);
      expect(s.indexOf('DHSNAP')).toBeLessThan(Math.max(s.indexOf('Set-'), s.indexOf('Add-'), s.indexOf('New-ItemProperty'), s.indexOf('SetValue')) + 1 || Infinity);
      expect(/[^\x00-\x7f]/.test(s), `${item.id} ascii`).toBe(false);
    }
    expect(H.buildHardeningApplyScript('asr', { mode: 'block' })).toContain('$acts = @($ids | ForEach-Object { 1 })');
    expect(H.buildHardeningApplyScript('asr', {})).toContain('ForEach-Object { 2 }');
  });

  it('ASR restore puts back previous actions and removes only rules we added', () => {
    const keep = H.ASR_RULES[0].id;
    const snap = H.parseHardeningSnapshot('asr', JSON.stringify({ ids: [keep.toUpperCase(), 'not-a-guid'], actions: [2, 1] }));
    expect(snap.rules).toEqual([{ id: keep, action: 2 }]);
    const s = H.buildHardeningRestoreScript('asr', snap);
    expect(s).toMatch(new RegExp(`Add-MpPreference .*'${keep}'.*@\\(2\\)`));
    expect(s).toContain('Remove-MpPreference');
    expect(s.split('Remove-MpPreference')[1]).not.toContain(keep);
  });

  it('restores PUA/CFA/SMB1/LLMNR+NetBIOS/registry snapshots exactly', () => {
    expect(H.buildHardeningRestoreScript('pua', H.parseHardeningSnapshot('pua', '{"value":2}'))).toBe('Set-MpPreference -PUAProtection 2 -ErrorAction Stop');
    expect(H.parseHardeningSnapshot('cfa', '{"value":"1; rm"}')).toBeNull();
    const smb = H.buildHardeningRestoreScript('smb1', H.parseHardeningSnapshot('smb1', '{"server":true,"feature":"Enabled"}'));
    expect(smb).toContain('Enable-WindowsOptionalFeature');
    expect(smb).toContain('-EnableSMB1Protocol $true');
    const nb = H.parseHardeningSnapshot('llmnrNetbios', JSON.stringify({ llmnrKeyExisted: false, llmnr: null, interfaces: [{ name: 'Tcpip_{11111111-2222-3333-4444-555555555555}', value: null }, { name: "x'; evil", value: 1 }] }));
    expect(nb.interfaces).toHaveLength(1);
    const nbs = H.buildHardeningRestoreScript('llmnrNetbios', nb);
    expect(nbs).toContain('Remove-ItemProperty -LiteralPath $k -Name EnableMulticast');
    expect(nbs).toContain('Remove-ItemProperty');
    expect(nbs).not.toContain('evil');
    const regSnap = H.parseHardeningSnapshot('rdpOff', JSON.stringify([{ key: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server', name: 'fDenyTSConnections', keyExists: true, exists: true, kind: 'DWord', value: 0 }]));
    expect(regSnap.entries[0]).toMatchObject({ existed: true, data: 0 });
    expect(H.buildHardeningRestoreScript('rdpOff', regSnap)).toContain('fDenyTSConnections');
    const absent = H.parseHardeningSnapshot('psLogging', '[]');
    expect(H.buildHardeningRestoreScript('psLogging', absent)).toContain('DeleteValue');
  });
});

describe('download cap', () => {
  it('aborts bodies above the cap', async () => {
    const big = new Response(new Uint8Array(2048));
    await expect(readCapped(big, 1024)).rejects.toThrow(/too-large/);
    const ok = new Response('0.0.0.0 a.com\n');
    expect((await readCapped(ok, 1024)).toString()).toContain('a.com');
  });
});

describe('advanced service state (no system changes)', () => {
  it('persists feed selection and applies feed hashes through SecurityService', async () => {
    // @ts-ignore
    const { AdvancedProtectionService } = await import('../electron/services/security/AdvancedProtectionService.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-secx-'));
    let applied: any[] = [];
    const fake = { feedFileHashes: [] as any[], setFeedFileHashes(list: any[]) { applied = list; this.feedFileHashes = list; return list.length; } };
    const text = `${'e'.repeat(64)};x\n`;
    const fetchImpl = async (url: string) => { const r = new Response(text); return { ok: true, status: 200, url, headers: r.headers, body: r.body }; };
    const svc = new AdvancedProtectionService({ dataDir: dir, securityService: fake, fetchImpl, hostsPath: path.join(dir, 'hosts') });
    for (const s of FEED_SOURCES.filter((x: any) => x.kind === 'hash')) svc.setEnabled(s.id, s.id === 'malicious-hash-sha256');
    const r = await svc.applyHashes();
    expect(r.ok).toBe(true);
    expect(applied).toHaveLength(1);
    expect(svc.hashesStatus().count).toBe(1);
    expect((await svc.restoreHashes()).ok).toBe(true);
    expect(applied).toHaveLength(0);
    const again = new AdvancedProtectionService({ dataDir: dir, securityService: fake });
    expect(again.listSources().find((s: any) => s.id === 'signature-base-hashes').enabled).toBe(false);
    fs.writeFileSync(path.join(dir, 'hosts'), '127.0.0.1 localhost\r\n');
    expect(svc.hostsStatus()).toMatchObject({ ok: true, present: false });
  });
});
