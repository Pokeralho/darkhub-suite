import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { formatBytes } from './OptimizerUtils.js';

class StorageEngine {
  constructor() {
    this.tempDirs = this._getStandardizedTempDirs();
  }

  _getStandardizedTempDirs() {
    const dirs = new Map();
    const add = (p) => {
      if (!p) return;
      const norm = path.normalize(p);
      const key = process.platform === 'win32' ? norm.toLowerCase() : norm;
      if (!dirs.has(key)) dirs.set(key, norm);
    };
    if (process.platform === 'win32') {
      const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
      const winDir = process.env.WINDIR || 'C:\\Windows';
      add(process.env.TEMP);
      add(process.env.TMP);
      add(path.join(winDir, 'Temp'));
      add(path.join(winDir, 'SoftwareDistribution', 'Download'));
      add(path.join(winDir, 'Minidump'));
      add(path.join(localAppData, 'CrashDumps'));
    } else {
      add('/tmp');
    }
    return Array.from(dirs.values());
  }

  _isProtectedPath(name) {
    if (!name || typeof name !== 'string') return false;
    const lower = name.toLowerCase();
    const protectedPatterns = [
      'd3dscache',
      'directxshadercache',
      'nv_shader_cache',
      'nvcache',
      'dxcache',
      'glcache',
      'vkcache',
      'nvidia',
      'amd',
      'overwatch',
      'blizzard',
      'battle.net'
    ];
    return protectedPatterns.some((pattern) => lower.includes(pattern));
  }

  /**
   * Walks a directory recursively. With dryRun=false it deletes files and then the empty folders.
   * Sizes are REAL file sizes (the old code used the size of the directory entry, i.e. ~0, for folders).
   */
  async _walk(dir, { dryRun, state, depth = 0 }) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (this._isProtectedPath(entry.name)) { state.protectedSkipped += 1; continue; }
      const full = path.join(dir, entry.name);
      try {
        if (entry.isSymbolicLink()) {
          // never follow links (junctions can point outside the temp folder)
          if (!dryRun) await fs.unlink(full);
          continue;
        }
        if (entry.isDirectory()) {
          if (depth > 64) { state.skippedDeep += 1; continue; }
          await this._walk(full, { dryRun, state, depth: depth + 1 });
          if (!dryRun) {
            try { await fs.rmdir(full); } catch { /* not empty or in use: leave it */ }
          }
          continue;
        }
        const st = await fs.lstat(full);
        if (dryRun) {
          state.files += 1;
          state.bytes += st.size;
        } else {
          await fs.unlink(full);
          state.files += 1;
          state.bytes += st.size;
        }
      } catch (e) {
        if (e && (e.code === 'EPERM' || e.code === 'EACCES')) state.denied += 1;
        else state.locked += 1;
      }
    }
  }

  _newState() {
    return { files: 0, bytes: 0, locked: 0, denied: 0, protectedSkipped: 0, skippedDeep: 0 };
  }

  async _scanDir(dirPath) {
    const state = this._newState();
    await this._walk(dirPath, { dryRun: true, state });
    return { files: state.files, bytes: state.bytes };
  }

  async _deleteDirContents(dirPath) {
    const state = this._newState();
    await this._walk(dirPath, { dryRun: false, state });
    return { deletedFiles: state.files, freedBytes: state.bytes, lockedFiles: state.locked + state.denied, deniedFiles: state.denied };
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
    const started = Date.now();
    let totalDeleted = 0;
    let totalFreed = 0;
    let totalLocked = 0;
    let totalDenied = 0;

    for (const dir of this.tempDirs) {
      const result = await this._deleteDirContents(dir);
      totalDeleted += result.deletedFiles;
      totalFreed += result.freedBytes;
      totalLocked += result.lockedFiles;
      totalDenied += result.deniedFiles;
    }

    const status = totalLocked > 0 ? 'Warning' : 'Success';
    let msg = `${totalDeleted} arquivo(s) removido(s), ${formatBytes(totalFreed)} liberados (medido).`;
    if (totalLocked > 0) {
      msg += ` ${totalLocked} item(ns) ignorado(s) por estarem em uso${totalDenied ? ` ou exigirem administrador (${totalDenied})` : ''}.`;
    }

    return {
      ok: true,
      status,
      durationMs: Date.now() - started,
      affectedResources: this.tempDirs,
      processedItems: totalDeleted,
      savings: totalFreed,
      savingsBytes: totalFreed,
      freedBytes: totalFreed,
      lockedFiles: totalLocked,
      msg,
      message: msg
    };
  }
}

export default new StorageEngine();
