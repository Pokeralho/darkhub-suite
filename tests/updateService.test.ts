// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import os from 'node:os';

vi.mock('electron', () => ({
  app: { getVersion: () => '0.8.1', isPackaged: false, getPath: () => os.tmpdir() },
  ipcMain: { handle: () => {} }
}));
vi.mock('../electron/services/LoggerService.js', () => ({ default: { info: () => {}, warn: () => {}, error: () => {} } }));
const downloadToFile = vi.fn(async () => { throw new Error('stop after the URL is chosen'); });
vi.mock('../electron/services/SecureDownload.js', () => ({
  downloadToFile: (...a: unknown[]) => downloadToFile(...(a as [])),
  assetSha256: (asset: { digest?: string }) => (asset?.digest ? asset.digest.replace('sha256:', '') : null),
  GITHUB_HOSTS: ['github.com']
}));

// @ts-ignore plain JS module
const { default: svc } = await import('../electron/services/UpdateService.js');

const release = (v: string) => ({
  tag_name: `v${v}`, published_at: '2026-11-02T04:06:21Z', body: 'notes', html_url: `https://github.com/x/releases/tag/v${v}`,
  assets: [{ name: `DarkHub-Setup-${v}.exe`, browser_download_url: `https://github.com/x/releases/download/v${v}/DarkHub-Setup-${v}.exe`, size: 10, digest: 'sha256:ab' }]
});

describe('updater: an offer that went stale', () => {
  beforeEach(() => { downloadToFile.mockClear(); svc._state = 'idle'; svc._updateInfo = null; });

  it('checks again before downloading, so a release published after the check is the one installed', async () => {
    svc._fetchLatestGitHubRelease = vi.fn(async () => release('0.8.2'));
    await svc.checkForUpdates();
    expect(svc._updateInfo.version).toBe('0.8.2');
    // 0.8.3 is published, the user clicks "update" a few minutes later
    svc._checkedAt = Date.now() - 6 * 60 * 1000;
    svc._fetchLatestGitHubRelease = vi.fn(async () => release('0.8.3'));
    await svc.downloadUpdate();
    expect(svc._updateInfo.version).toBe('0.8.3');
    expect(downloadToFile).toHaveBeenCalledTimes(1);
    expect(String((downloadToFile.mock.calls[0] as unknown[])[0])).toContain('DarkHub-Setup-0.8.3.exe');
  });

  it('a fresh offer is downloaded without another check', async () => {
    svc._fetchLatestGitHubRelease = vi.fn(async () => release('0.8.3'));
    await svc.checkForUpdates();
    await svc.downloadUpdate();
    expect(svc._fetchLatestGitHubRelease).toHaveBeenCalledTimes(1);
    expect(String((downloadToFile.mock.calls[0] as unknown[])[0])).toContain('0.8.3');
  });
});

describe('updater: an offer from electron-updater, whose download failed (portable build)', () => {
  // what the update-available handler builds: no sha256
  const offer = (v: string) => ({ version: v, assetName: `DarkHub-Setup-${v}.exe`, downloadUrl: `https://github.com/x/releases/download/v${v}/DarkHub-Setup-${v}.exe` });
  const fresh = (v: string) => { svc._state = 'available'; svc._updateInfo = offer(v); svc._checkedAt = Date.now(); };
  const events: { type: string; message?: string }[] = [];

  beforeEach(() => { downloadToFile.mockClear(); events.length = 0; svc._emit = (e: { type: string }) => events.push(e); });

  it('reads the published digest and downloads against it', async () => {
    svc._fetchLatestGitHubRelease = vi.fn(async () => release('0.8.4'));
    fresh('0.8.4');
    await svc.downloadUpdate();
    expect(downloadToFile).toHaveBeenCalledTimes(1);
    expect((downloadToFile.mock.calls[0] as unknown[])[2]).toMatchObject({ expectedSha256: 'ab' });
  });

  const refused = async () => {
    await svc.downloadUpdate();
    expect(downloadToFile).not.toHaveBeenCalled();
    expect(events.at(-1)?.message).toContain('SHA-256');
  };

  it('still refuses when the file has no digest', async () => {
    const r = release('0.8.4');
    delete (r.assets[0] as { digest?: string }).digest;
    svc._fetchLatestGitHubRelease = vi.fn(async () => r);
    fresh('0.8.4');
    await refused();
  });

  it('never borrows the digest of another version or another file', async () => {
    svc._fetchLatestGitHubRelease = vi.fn(async () => release('0.8.5'));
    fresh('0.8.4');
    await refused();
    downloadToFile.mockClear();
    const r = release('0.8.4');
    r.assets[0].name = 'DarkHub.0.8.4-portable.exe';
    svc._fetchLatestGitHubRelease = vi.fn(async () => r);
    fresh('0.8.4');
    await refused();
  });

  it('still refuses when GitHub cannot be reached', async () => {
    svc._fetchLatestGitHubRelease = vi.fn(async () => { throw new Error('offline'); });
    fresh('0.8.4');
    await refused();
  });
});
