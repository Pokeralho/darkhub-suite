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
