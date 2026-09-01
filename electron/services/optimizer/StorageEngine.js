import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
class StorageEngine {
  constructor() {
    this.tempDirs = this._getStandardizedTempDirs();
  }

  _getStandardizedTempDirs() {
    const dirs = new Set();
    if (process.platform === 'win32') {
      const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
      const winDir = process.env.WINDIR || 'C:\\Windows';

      if (process.env.TEMP) dirs.add(path.normalize(process.env.TEMP));
      if (process.env.TMP) dirs.add(path.normalize(process.env.TMP));

      dirs.add(path.join(winDir, 'Temp'));
      dirs.add(path.join(winDir, 'SoftwareDistribution', 'Download'));
      dirs.add(path.join(winDir, 'Minidump'));
      dirs.add(path.join(localAppData, 'CrashDumps'));

    } else {
      dirs.add('/tmp');
    }
    return Array.from(dirs);
  }

  async _scanDir(dirPath) {
    let files = 0;
    let bytes = 0;
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        try {
          const stats = await fs.stat(fullPath);
          bytes += stats.size;
          files++;
        } catch (e) {  }
      }
    } catch (e) {  }
    return { files, bytes };
  }

  async _deleteDirContents(dirPath) {
    let deletedFiles = 0;
    let freedBytes = 0;
    let lockedFiles = 0;
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        try {
          const stats = await fs.stat(fullPath);
          if (entry.isDirectory()) {
            await fs.rm(fullPath, { recursive: true, force: true });
          } else {
            await fs.unlink(fullPath);
          }
          freedBytes += stats.size;
          deletedFiles++;
        } catch (e) {

          lockedFiles++;
        }
      }
    } catch (e) {  }
    return { deletedFiles, freedBytes, lockedFiles };
  }

  async analyzeTempFiles() {
    let totalFiles = 0;
    let totalBytes = 0;
    for (const dir of this.tempDirs) {
      const stats = await this._scanDir(dir);
      totalFiles += stats.files;
      totalBytes += stats.bytes;
    }
    return { ok: true, summary: { files: totalFiles, bytes: totalBytes, dirs: this.tempDirs.length } };
  }

  async cleanTempFiles() {
    let totalDeleted = 0;
    let totalFreed = 0;
    let totalLocked = 0;

    for (const dir of this.tempDirs) {
      const result = await this._deleteDirContents(dir);
      totalDeleted += result.deletedFiles;
      totalFreed += result.freedBytes;
      totalLocked += result.lockedFiles;
    }

    const status = totalLocked > 0 ? 'Warning' : 'Success';
    const mbFreed = (totalFreed / (1024 * 1024)).toFixed(2);
    let msg = `Lixo residual limpo (${mbFreed} MB).`;
    if (totalLocked > 0) msg += ` Ignorados ${totalLocked} arquivos em uso pelo sistema (segurança).`;

    return {
      status,
      durationMs: 0,
      affectedResources: this.tempDirs,
      processedItems: totalDeleted,
      savings: totalFreed,
      message: msg
    };
  }
}

export default new StorageEngine();
