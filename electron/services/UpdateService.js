import { app, ipcMain } from 'electron';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import Logger from './LoggerService.js';
import { downloadToFile, assetSha256, GITHUB_HOSTS } from './SecureDownload.js';

class UpdateService {
  constructor() {
    this._updater = null;
    this._mainWindow = null;
    this._state = 'idle';
    this._updateInfo = null;
    this._downloadedFilePath = null;
    this._checkDelayMs = 6000;
    this._checkTimer = null;
    this._registered = false;
    this._repoOwner = 'Pokeralho';
    this._repoName = 'darkhub-suite';
  }

  async init(mainWindow) {
    this._mainWindow = mainWindow;

    if (this._registered) return;
    this._registered = true;

    this._registerIPC();

    if (!app.isPackaged) {
      Logger.info('UpdateService', 'Development environment detected — updater armed with simulated test support.');

    }

    try {
      await this._setupUpdater();
      this._scheduleAutoCheck();
    } catch (err) {
      Logger.warn('UpdateService', `electron-updater setup notice, fallback engine is active: ${err?.message || err}`);
    }
  }

  async _setupUpdater() {
    try {
      const mod = await import('electron-updater');
      const updater = (mod.default ?? mod).autoUpdater;

      updater.autoDownload = false;
      updater.autoInstallOnAppQuit = true;
      updater.allowPrerelease = false;
      updater.setFeedURL({
        provider: 'github',
        owner: this._repoOwner,
        repo: this._repoName
      });

      updater.on('checking-for-update', () => {
        Logger.info('UpdateService', 'Checking for updates on GitHub...');
        this._setState('checking');
        this._emit({ type: 'checking', stage: 'checking' });
      });

      updater.on('update-available', (info) => {
        Logger.info('UpdateService', `Update available: v${info.version}`);
        this._setState('available');
        const assetName = info.files?.[0]?.url || `DarkHub-Setup-${info.version}.exe`;
        const downloadUrl = `https://github.com/${this._repoOwner}/${this._repoName}/releases/download/v${info.version}/${assetName}`;

        this._updateInfo = {
          version: info.version,
          releaseDate: info.releaseDate,
          releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : (Array.isArray(info.releaseNotes) ? info.releaseNotes.map(n => n.note).join('\n') : null),
          downloadUrl: downloadUrl,
          assetName: assetName,
          githubUrl: `https://github.com/${this._repoOwner}/${this._repoName}/releases/tag/v${info.version}`
        };
        this._emit({
          type: 'available',
          stage: 'available',
          info: this._updateInfo
        });
      });

      updater.on('update-not-available', () => {
        Logger.info('UpdateService', 'App is up to date.');
        this._setState('idle');
        this._emit({ type: 'not-available', stage: 'idle', currentVersion: app.getVersion() });
      });

      updater.on('download-progress', (progress) => {
        const percent = Math.round(progress.percent ?? 0);
        this._setState('downloading');
        this._emit({
          type: 'progress',
          stage: 'downloading',
          percent,
          bytesPerSecond: Math.round(progress.bytesPerSecond ?? 0),
          transferred: progress.transferred ?? 0,
          total: progress.total ?? 0
        });
      });

      updater.on('update-downloaded', (info) => {
        Logger.info('UpdateService', `Update downloaded successfully: v${info.version}`);
        this._setState('verifying');
        this._emit({ type: 'verifying', stage: 'verifying', percent: 100 });

        setTimeout(() => {
          this._setState('downloaded');
          this._emit({ type: 'downloaded', stage: 'downloaded', version: info.version });
        }, 1200);
      });

      updater.on('error', (err) => {
        const msg = err?.message ?? String(err);
        Logger.warn('UpdateService', `electron-updater notice: ${msg}`);
      });

      this._updater = updater;
    } catch (e) {
      Logger.warn('UpdateService', `Could not initialize electron-updater, using native fallback: ${e?.message ?? e}`);
    }
  }

  _scheduleAutoCheck() {
    if (this._checkTimer) clearTimeout(this._checkTimer);
    this._checkTimer = setTimeout(async () => {
      await this.checkForUpdates();
    }, this._checkDelayMs);
  }

  _setState(state) {
    this._state = state;
  }

  async checkForUpdates() {
    this._setState('checking');
    this._emit({ type: 'checking', stage: 'checking' });

    if (this._updater && app.isPackaged) {
      try {
        const res = await this._updater.checkForUpdates();
        if (res?.updateInfo) {
          return { ok: true, version: res.updateInfo.version };
        }
      } catch (e) {
        Logger.info('UpdateService', `electron-updater check failed (${e?.message ?? e}), trying native GitHub release query...`);
      }
    }

    try {
      const release = await this._fetchLatestGitHubRelease();
      if (!release) {
        this._setState('idle');
        this._emit({ type: 'not-available', stage: 'idle', currentVersion: app.getVersion() });
        return { ok: true, msg: 'App is up to date.' };
      }

      const currentVer = app.getVersion().replace(/^v/, '');
      const latestVer = release.tag_name.replace(/^v/, '');

      if (this._isNewerVersion(latestVer, currentVer)) {
        this._setState('available');
        const asset = release.assets?.find(a => a.name.endsWith('.exe') && !a.name.includes('blockmap')) || null;

        this._updateInfo = {
          version: latestVer,
          releaseDate: release.published_at,
          releaseNotes: release.body || 'Performance optimizations and security improvements.',
          downloadUrl: asset?.browser_download_url || null,
          assetName: asset?.name || `DarkHub Setup ${latestVer}.exe`,
          assetSize: asset?.size || 0,
          sha256: assetSha256(asset),
          githubUrl: release.html_url
        };

        this._emit({
          type: 'available',
          stage: 'available',
          info: this._updateInfo
        });

        return { ok: true, updateAvailable: true, version: latestVer };
      } else {
        this._setState('idle');
        this._emit({ type: 'not-available', stage: 'idle', currentVersion: app.getVersion() });
        return { ok: true, updateAvailable: false, version: currentVer };
      }
    } catch (err) {
      this._setState('error');
      this._emit({ type: 'error', stage: 'error', message: err.message });
      return { ok: false, error: err.message };
    }
  }

  async downloadUpdate() {
    if (this._state === 'downloading' || this._state === 'verifying') {
      return { ok: false, error: 'Download already in progress.' };
    }
    if (this._state !== 'available' && !this._updateInfo) {
      return { ok: false, error: 'No update available for download.' };
    }

    this._setState('downloading');

    if (this._updater && app.isPackaged) {
      try {
        // electron-updater verifies the sha512 published in latest.yml before emitting update-downloaded.
        await this._updater.downloadUpdate();
        return { ok: true };
      } catch (e) {
        Logger.warn('UpdateService', `electron-updater download failed, falling back to direct stream: ${e?.message ?? e}`);
      }
    }

    const fail = (message) => {
      this._setState('error');
      this._emit({ type: 'error', stage: 'error', message });
      return { ok: false, error: message };
    };

    // The fallback installer is executed silently, so it must come from GitHub over HTTPS and match
    // the SHA-256 digest GitHub publishes for the release asset. Without a digest we refuse.
    const info = this._updateInfo;
    if (!info?.downloadUrl || !info?.sha256) {
      return fail('Integrity data (SHA-256) unavailable for this release. Download it manually from GitHub.');
    }

    const destDir = path.join(app.getPath('temp'), 'DarkHubUpdates');
    try { fs.mkdirSync(destDir, { recursive: true }); } catch {}
    const safeName = path.basename(String(info.assetName || `DarkHub-Setup-${info.version}.exe`)).replace(/[<>:"|?*\u0000-\u001f]/g, '_');
    const destFile = path.join(destDir, safeName);
    this._downloadedFilePath = null;

    let lastTime = Date.now();
    let lastReceived = 0;
    try {
      await downloadToFile(info.downloadUrl, destFile, {
        allowedHosts: GITHUB_HOSTS,
        expectedSha256: info.sha256,
        timeoutMs: 60000,
        userAgent: 'DarkHub-Updater/' + app.getVersion(),
        onProgress: ({ transferred, total }) => {
          const now = Date.now();
          if (now - lastTime < 300) return;
          const totalBytes = total || info.assetSize || 0;
          this._emit({
            type: 'progress',
            stage: 'downloading',
            percent: totalBytes > 0 ? Math.min(Math.round((transferred / totalBytes) * 100), 99) : 50,
            bytesPerSecond: Math.round((transferred - lastReceived) / ((now - lastTime) / 1000)),
            transferred,
            total: totalBytes
          });
          lastTime = now;
          lastReceived = transferred;
        }
      });
    } catch (err) {
      return fail(err?.message ?? String(err));
    }

    Logger.info('UpdateService', 'Download complete. SHA-256 verified.');
    this._downloadedFilePath = destFile;
    this._setState('downloaded');
    this._emit({ type: 'downloaded', stage: 'downloaded', version: info.version });
    return { ok: true };
  }

  installUpdate() {
    if (this._state !== 'downloaded') {
      return { ok: false, error: 'Update not yet downloaded.' };
    }

    try {
      if (this._updater && app.isPackaged && !this._downloadedFilePath) {
        Logger.info('UpdateService', 'Executing electron-updater quitAndInstall...');
        this._updater.quitAndInstall(false, true);
        return { ok: true };
      }

      if (this._downloadedFilePath && fs.existsSync(this._downloadedFilePath)) {
        Logger.info('UpdateService', `Launching downloaded installer: ${this._downloadedFilePath}`);
        spawn(this._downloadedFilePath, ['/S'], {
          detached: true,
          stdio: 'ignore'
        }).unref();

        setTimeout(() => {
          app.quit();
        }, 500);

        return { ok: true };
      }

      return { ok: false, error: 'Installer file not found on disk.' };
    } catch (err) {
      Logger.error('UpdateService', 'Error installing update:', err);
      return { ok: false, error: err.message };
    }
  }

  _fetchLatestGitHubRelease() {
    return new Promise((resolve, reject) => {
      const url = `https://api.github.com/repos/${this._repoOwner}/${this._repoName}/releases/latest`;
      const req = https.get(url, {
        headers: {
          'User-Agent': 'DarkHub-Suite-App/' + app.getVersion(),
          'Accept': 'application/vnd.github.v3+json'
        },
        timeout: 10000
      }, (res) => {
        if (res.statusCode === 404) { res.resume(); return resolve(null); }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error(`GitHub API HTTP ${res.statusCode}`)); }

        let data = '';
        res.setEncoding('utf8');
        res.on('data', chunk => {
          data += chunk;
          if (data.length > 5 * 1024 * 1024) res.destroy(new Error('GitHub API response too large'));
        });
        res.on('error', reject);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('GitHub API connection timeout')); });
    });
  }

  _isNewerVersion(latest, current) {
    const p1 = latest.split('.').map(n => parseInt(n, 10) || 0);
    const p2 = current.split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const a = p1[i] || 0;
      const b = p2[i] || 0;
      if (a > b) return true;
      if (a < b) return false;
    }
    return false;
  }

  _registerIPC() {
    ipcMain.handle('updater:getStatus', () => ({
      currentVersion: app.getVersion(),
      state: this._state,
      updateInfo: this._updateInfo
    }));

    ipcMain.handle('updater:check', async () => this.checkForUpdates());
    ipcMain.handle('updater:download', async () => this.downloadUpdate());
    ipcMain.handle('updater:install', () => this.installUpdate());
  }

  _emit(payload) {
    if (this._mainWindow && !this._mainWindow.isDestroyed()) {
      this._mainWindow.webContents.send('updater:event', payload);
    }
  }

  destroy() {
    if (this._checkTimer) {
      clearTimeout(this._checkTimer);
      this._checkTimer = null;
    }
  }
}

export default new UpdateService();
