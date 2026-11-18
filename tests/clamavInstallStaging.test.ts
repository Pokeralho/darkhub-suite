import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ClamAv.install() runs msiexec elevated: the MSI must be staged in the admin-only folder (secureStaging), never in
// the user's %TEMP%, and re-hashed right before msiexec starts.
const calls: any = {};
const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-clamstg-'));
const fakeProgramFiles = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-clampf-'));

vi.mock('../electron/services/SecureDownload.js', () => ({
  downloadToFile: vi.fn(async (_url: string, dest: string, opts: any) => { calls.dest = dest; calls.opts = opts; fs.writeFileSync(dest, 'msi'); }),
}));
vi.mock('../electron/services/secureStaging.js', () => ({
  createSecureStagingDir: vi.fn(async (o: any) => {
    calls.stagingOpts = o;
    return { dir: stagingDir, secure: true, file: (n: string) => path.join(stagingDir, n), cleanup: async () => { calls.cleaned = true; } };
  }),
  assertUnchanged: vi.fn((f: string, sha: string) => { calls.asserted = [f, sha]; if (calls.swap) throw new Error('O arquivo mudou depois de verificado; execução recusada.'); }),
}));
vi.mock('node:child_process', () => {
  const spawn = vi.fn((file: string, args: string[]) => {
    calls.spawned = [file, args];
    const child: any = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    setTimeout(() => child.emit('close', 1603), 5);
    return child;
  });
  return { default: { spawn }, spawn };
});

describe('ClamAV install staging', () => {
  beforeEach(() => { for (const k of Object.keys(calls)) delete calls[k]; process.env.ProgramFiles = fakeProgramFiles; delete process.env['ProgramFiles(x86)']; });

  it('downloads into the secure staging folder and hands that file to msiexec', async () => {
    // @ts-ignore plain JS module
    const { ClamAv, CLAMAV } = await import('../electron/services/realtime/ClamAv.js');
    const r = await new ClamAv(fakeProgramFiles).install();
    expect(path.dirname(calls.dest)).toBe(stagingDir);
    expect(calls.opts.expectedSha256).toBe(CLAMAV.sha256);
    expect(calls.stagingOpts.fallbackBase).toBeTruthy();
    expect(calls.asserted).toEqual([calls.dest, CLAMAV.sha256]);
    expect(calls.spawned[0]).toBe('msiexec.exe');
    expect(calls.spawned[1]).toEqual(['/i', calls.dest, '/qn', '/norestart']);
    expect(calls.cleaned).toBe(true);
    expect(r.ok).toBe(false); // the fake msiexec installed nothing
  });

  it('never starts msiexec when the staged MSI changed after the download check', async () => {
    // @ts-ignore plain JS module
    const { ClamAv } = await import('../electron/services/realtime/ClamAv.js');
    calls.swap = true;
    const r = await new ClamAv(fakeProgramFiles).install();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/mudou/);
    expect(calls.spawned).toBeUndefined();
    expect(calls.cleaned).toBe(true);
  });
});
