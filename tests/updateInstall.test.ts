// @vitest-environment node
// Installer choice (setup, never portable), digest lookup by normalized name, re-hash before running, and quitting
// only once the installer process really started.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

const quit = vi.fn();
vi.mock('electron', () => ({
  app: { getVersion: () => '0.8.1', isPackaged: false, getPath: () => os.tmpdir(), quit: () => quit() },
  ipcMain: { handle: () => {} }
}));
vi.mock('../electron/services/LoggerService.js', () => ({ default: { info: () => {}, warn: () => {}, error: () => {} } }));
let spawnBehavior: 'spawn' | 'error' = 'spawn';
const spawnMock = vi.fn(() => {
  const child = Object.assign(new EventEmitter(), { unref: () => {} });
  setTimeout(() => (spawnBehavior === 'spawn' ? child.emit('spawn') : child.emit('error', Object.assign(new Error('blocked'), { code: 'EACCES' }))), 5);
  return child;
});
vi.mock('node:child_process', () => ({ spawn: (...a: unknown[]) => (spawnMock as any)(...a) }));

// @ts-ignore plain JS module
const mod = await import('../electron/services/UpdateService.js');
const svc = mod.default;

describe('pickInstallerAsset / sameAssetName', () => {
  it('prefers the setup over the portable build, whatever the order', () => {
    const assets = [
      { name: 'DarkHub.0.9.0-portable.exe' }, { name: 'DarkHub.Setup.0.9.0.exe.blockmap' }, { name: 'latest.yml' }, { name: 'DarkHub.Setup.0.9.0.exe' }
    ];
    expect(mod.pickInstallerAsset(assets).name).toBe('DarkHub.Setup.0.9.0.exe');
    expect(mod.pickInstallerAsset([{ name: 'DarkHub.0.9.0-portable.exe' }])).toBeNull();
  });
  it('matches latest.yml names against GitHub asset names', () => {
    expect(mod.sameAssetName('DarkHub-Setup-0.9.0.exe', 'DarkHub.Setup.0.9.0.exe')).toBe(true);
    expect(mod.sameAssetName('DarkHub Setup 0.9.0.exe', 'DarkHub.Setup.0.9.0.exe')).toBe(true);
    expect(mod.sameAssetName('DarkHub-Setup-0.9.0.exe', 'DarkHub.0.9.0-portable.exe')).toBe(false);
  });
  it('_publishedSha256 finds the digest under the GitHub spelling of the name', async () => {
    svc._fetchLatestGitHubRelease = vi.fn(async () => ({ tag_name: 'v0.9.0', assets: [{ name: 'DarkHub.Setup.0.9.0.exe', digest: `sha256:${'a'.repeat(64)}` }] }));
    expect(await svc._publishedSha256({ version: '0.9.0', assetName: 'DarkHub-Setup-0.9.0.exe' })).toBe('a'.repeat(64));
  });
});

describe('installUpdate', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-upd-'));
  const file = path.join(dir, 'setup.exe');
  const arm = (content: string, sha = crypto.createHash('sha256').update(content).digest('hex')) => {
    fs.writeFileSync(file, content);
    svc._state = 'downloaded';
    svc._downloadedFilePath = file;
    svc._downloadedSha256 = sha;
  };
  beforeEach(() => { quit.mockClear(); spawnMock.mockClear(); spawnBehavior = 'spawn'; });

  it('runs the verified installer and quits only after it started', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      arm('installer');
      const p = svc.installUpdate();
      await vi.advanceTimersByTimeAsync(10);
      expect(await p).toEqual({ ok: true });
      await vi.advanceTimersByTimeAsync(600);
      expect(quit).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it('refuses an installer that changed on disk after verification', async () => {
    arm('installer');
    fs.writeFileSync(file, 'swapped by someone else');
    const r = await svc.installUpdate();
    expect(r.ok).toBe(false);
    expect(spawnMock).not.toHaveBeenCalled();
    expect(quit).not.toHaveBeenCalled();
  });

  it('keeps the app open when the installer cannot be started', async () => {
    spawnBehavior = 'error';
    arm('installer');
    const r = await svc.installUpdate();
    expect(r).toMatchObject({ ok: false });
    await new Promise((res) => setTimeout(res, 600));
    expect(quit).not.toHaveBeenCalled();
  });
});
