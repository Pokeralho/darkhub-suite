// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
// @ts-ignore plain JS module
import * as D from '../electron/services/darkos/DarkOSRecoveryService.js';

// C:\ProgramData lets any standard user create subfolders. Without the ACL check a user could create
// C:\ProgramData\DarkOS\bin, drop a module with a high "# ModuleVersion" and have DarkHub run it as Administrator.
const ROOT = 'C:\\ProgramData\\DarkOS';
const BUNDLED = 'D:\\app\\darkos';
const norm = (p: string) => String(p).replace(/\//g, '\\').toLowerCase();
const PRESENT = [
  `${ROOT}\\Recovery\\manifest.json`,
  `${ROOT}\\bin\\DarkOS.Cli.ps1`, `${ROOT}\\bin\\DarkOS.Recovery.psm1`,
  `${BUNDLED}\\DarkOS.Cli.ps1`, `${BUNDLED}\\DarkOS.Recovery.psm1`
].map(norm);
const fsImpl = {
  existsSync: (p: string) => PRESENT.includes(norm(p)),
  // the planted copy claims to be far newer than the bundled one
  readFileSync: (p: string) => (norm(p).startsWith(norm(`${ROOT}\\bin`)) ? '# ModuleVersion: 99999\n' : '# ModuleVersion: 5\n')
};
const done = { code: 0, stdout: 'DKJSON:{}\r\nDHDONE\r\n', stderr: '' };

function make(untrustedWriters: (paths: string[]) => Promise<any>) {
  const runner = vi.fn(async (_: any) => done);
  const logger = { warn: vi.fn() };
  const svc = new D.DarkOSRecoveryService({ root: ROOT, bundledDir: BUNDLED, runner, isElevated: async () => true, fsImpl, untrustedWriters, logger });
  return { svc, runner, logger };
}
const ranFrom = (runner: any) => norm(String(runner.mock.calls[0][0].script));

describe('DarkOS installed module is only run from an administrators-only folder', () => {
  it('checks the root, bin and both files, then runs the installed copy when nobody else can write', async () => {
    const check = vi.fn(async (_: string[]) => []);
    const { svc, runner } = make(check);
    await svc.getManifest();
    await svc.getManifest();
    expect(check).toHaveBeenCalledTimes(1);
    expect(check.mock.calls[0][0].map(norm)).toEqual([ROOT, `${ROOT}\\bin`, `${ROOT}\\bin\\DarkOS.Cli.ps1`, `${ROOT}\\bin\\DarkOS.Recovery.psm1`].map(norm));
    expect(ranFrom(runner)).toContain(norm(`${ROOT}\\bin\\DarkOS.Cli.ps1`));
    expect(svc.resolveCli().source).toBe('installed');
  });

  it('falls back to the bundled module when a non-administrator can change the folder', async () => {
    const { svc, runner, logger } = make(async () => [{ path: `${ROOT}\\bin`, who: 'BUILTIN\\Users' }]);
    await svc.getManifest();
    expect(ranFrom(runner)).toContain(norm(`${BUNDLED}\\DarkOS.Cli.ps1`));
    expect(ranFrom(runner)).not.toContain(norm(`${ROOT}\\bin`));
    expect(svc.resolveCli().source).toBe('bundled');
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('treats a failed or unfinished ACL check as untrusted', async () => {
    for (const check of [async () => null, async () => { throw new Error('powershell missing'); }]) {
      const { svc, runner } = make(check);
      await svc.getManifest();
      expect(ranFrom(runner)).toContain(norm(`${BUNDLED}\\DarkOS.Cli.ps1`));
    }
  });
});
