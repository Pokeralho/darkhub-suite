import { describe, it, expect } from 'vitest';
// @ts-ignore plain JS module
import { planNetworkReset, networkResetLines, NETWORK_FACTS_SCRIPT } from '../electron/services/network/networkResetSafety.js';
// @ts-ignore plain JS module
import { parseUntrustedWriters, elevatedTaskTargets, UNTRUSTED_WRITERS_SCRIPT, unsafeFolderMessage } from '../electron/services/startup/elevatedTaskSafety.js';
// @ts-ignore plain JS module
import { oneDriveRootOf } from '../electron/services/cloudSync.js';
// @ts-ignore plain JS module
import { buildPlan } from '../electron/services/psTools/psToolBuilders.js';

const clean = { rdp: false, staticIp: [], manualDns: [], vpnConnections: [], upAdapters: [{ name: 'Ethernet', desc: 'Realtek PCIe GbE' }] };

describe('network stack reset never destroys a manual configuration', () => {
  it('a plain DHCP PC gets the full reset', () => {
    const p = planNetworkReset(clean);
    expect(p).toMatchObject({ blocked: null, skipIpReset: false });
    expect(networkResetLines(p).join('\n')).toContain('int ip reset');
  });
  it('fixed IP or manual DNS: TCP/IP reset is skipped, winsock still runs', () => {
    for (const f of [{ ...clean, staticIp: ['Ethernet'] }, { ...clean, manualDns: ['Wi-Fi'] }]) {
      const p = planNetworkReset(f);
      expect(p.blocked).toBeNull();
      expect(p.skipIpReset).toBe(true);
      expect(p.notes.length).toBe(1);
      const lines = networkResetLines(p).join('\n');
      expect(lines).not.toContain('int ip reset');
      expect(lines).toContain('winsock reset');
    }
  });
  it('remote desktop and VPNs (Windows or client adapters) block the reset', () => {
    expect(planNetworkReset({ ...clean, rdp: true }).blocked).toMatch(/Remota/);
    expect(planNetworkReset({ ...clean, vpnConnections: ['Trabalho'] }).blocked).toMatch(/Trabalho/);
    expect(planNetworkReset({ ...clean, upAdapters: [...clean.upAdapters, { name: 'CloudflareWARP', desc: 'Cloudflare WARP Interface Tunnel' }] }).blocked).toMatch(/CloudflareWARP/);
    expect(planNetworkReset({ ...clean, upAdapters: [{ name: 'tailscale0', desc: 'Tailscale Tunnel' }] }).blocked).toMatch(/VPN/);
  });
  it('unreadable configuration keeps only the safe part', () => {
    const p = planNetworkReset(null);
    expect(p.skipIpReset).toBe(true);
    expect(networkResetLines(p).join('\n')).not.toContain('int ip reset');
  });
  it('the facts script is ASCII and avoids the slow NetAdapter cmdlets', () => {
    expect(NETWORK_FACTS_SCRIPT).not.toMatch(/[^\x00-\x7f]/);
    expect(NETWORK_FACTS_SCRIPT).not.toMatch(/Get-NetAdapter|Get-NetIPInterface/);
  });
});

describe('elevated autostart only from folders others cannot change', () => {
  it('checks the exe, its folder and the app bundle', () => {
    const t = elevatedTaskTargets('C:\\Program Files\\DarkHub Suite\\DarkHub Suite.exe', () => true);
    expect(t).toEqual([
      'C:\\Program Files\\DarkHub Suite\\DarkHub Suite.exe', 'C:\\Program Files\\DarkHub Suite',
      'C:\\Program Files\\DarkHub Suite\\resources', 'C:\\Program Files\\DarkHub Suite\\resources\\app.asar'
    ]);
    expect(elevatedTaskTargets('D:\\x\\a.exe', () => false)).toEqual(['D:\\x\\a.exe', 'D:\\x']);
  });
  it('parses writers; an unfinished check is unknown (null), never "safe"', () => {
    expect(parseUntrustedWriters('DHW-END')).toEqual([]);
    expect(parseUntrustedWriters('DHW|D:\\x|NT AUTHORITY\\Authenticated Users\r\nDHW-END')).toEqual([{ path: 'D:\\x', who: 'NT AUTHORITY\\Authenticated Users' }]);
    expect(parseUntrustedWriters('')).toBeNull();
    expect(parseUntrustedWriters('DHW|D:\\x|Users')).toBeNull();
  });
  it('the ACL script trusts only SYSTEM, Administrators and TrustedInstaller, and skips inherit-only entries', () => {
    const s = UNTRUSTED_WRITERS_SCRIPT(["C:\\it's\\a.exe"]);
    expect(s).toContain("'S-1-5-18', 'S-1-5-32-544', 'S-1-5-80-956008885");
    expect(s).toContain('PropagationFlags -band 2');
    expect(s).toContain("'C:\\it''s\\a.exe'");
    expect(s).not.toMatch(/[^\x00-\x7f]/);
  });
  it('the refusal says what to do', () => {
    expect(unsafeFolderMessage('D:\\Downloads\\DarkHub.exe', [{ path: 'x', who: 'Users' }])).toMatch(/Arquivos de Programas/);
  });
});

describe('cleanup never deletes inside OneDrive', () => {
  const env = { OneDrive: 'C:\\Users\\Ana\\OneDrive', OneDriveCommercial: 'C:\\Users\\Ana\\OneDrive - Empresa\\' };
  it('detects the roots and anything inside them', () => {
    expect(oneDriveRootOf('C:\\Users\\Ana\\OneDrive', env)).toBeTruthy();
    expect(oneDriveRootOf('c:\\users\\ana\\onedrive\\Fotos\\2020', env)).toBeTruthy();
    expect(oneDriveRootOf('C:\\Users\\Ana\\OneDrive - Empresa\\Docs', env)).toBeTruthy();
    expect(oneDriveRootOf('C:\\Users\\Ana\\OneDriveBackup', env)).toBeNull();
    expect(oneDriveRootOf('C:\\Users\\Ana\\Downloads', env)).toBeNull();
    expect(oneDriveRootOf('C:\\x', {})).toBeNull();
  });
});

describe('old-files cleanup refuses OneDrive folders', () => {
  it('returns an error instead of a script', () => {
    const prev = process.env.OneDrive;
    process.env.OneDrive = 'C:\\Users\\Ana\\OneDrive';
    try {
      const plan = buildPlan('cleanOldFiles', { folder: 'C:\\Users\\Ana\\OneDrive\\Antigos', olderThanDays: 30, dryRun: true });
      expect(JSON.stringify(plan)).toMatch(/OneDrive/);
      expect(plan?.script).toBeUndefined();
    } finally {
      if (prev === undefined) delete process.env.OneDrive; else process.env.OneDrive = prev;
    }
  });
});
