// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const calls: { execFile: any[]; spawn: any[] } = { execFile: [], spawn: [] };
vi.mock('node:child_process', () => ({
  execFile: vi.fn((...a: any[]) => { calls.execFile.push(a); }),
  spawn: vi.fn((...a: any[]) => {
    const c: any = new EventEmitter();
    c.stdout = new EventEmitter();
    c.stderr = new EventEmitter();
    c.kill = vi.fn();
    calls.spawn.push(c);
    return c;
  })
}));

// @ts-ignore plain JS module
const { PresentMonService } = await import('../electron/services/overlay/PresentMonService.js');

describe('PresentMonService', () => {
  it('waits for the previous ETW session to end before starting a new one, and survives a spawn error', async () => {
    const svc = new PresentMonService({ toolsDir: 'C:/nowhere' });
    svc.ensure = async () => svc.exe;
    if (process.platform !== 'win32') {
      await expect(svc.start({ pid: 1 })).rejects.toThrow(/only supported on Windows/i);
      return;
    }
    await svc.start({ pid: 1 });
    expect(calls.spawn).toHaveLength(1);

    const restarting = svc.start({ pid: 2 }); // stops the first capture: terminate is still running
    await new Promise((r) => setTimeout(r, 10));
    expect(calls.execFile).toHaveLength(1);
    expect(calls.spawn).toHaveLength(1); // not started yet: the terminate would end the new session
    calls.execFile[0][3](); // terminate finished
    await restarting;
    expect(calls.spawn).toHaveLength(2);

    const exits: any[] = [];
    svc.on('exit', (e: any) => exits.push(e));
    calls.spawn[1].emit('error', new Error('spawn EACCES'));
    calls.spawn[1].emit('close', -1);
    expect(exits).toEqual([{ code: -1, error: 'spawn EACCES' }]);
    expect(svc.running).toBe(false);
  });
});
