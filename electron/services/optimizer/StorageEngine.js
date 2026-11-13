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
      'overwatch',
      'blizzard',
      'battle.net'
    ];
    // vendor names only at the start: "amd" anywhere also matched every "..._amd64_..." installer log, which then
    // stayed in TEMP forever
    if (/^(amd|nvidia)/.test(lower)) return true;
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
      if (state.deadline && Date.now() > state.deadline) { state.truncated = true; return; }
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
    return { files: 0, bytes: 0, locked: 0, denied: 0, protectedSkipped: 0, skippedDeep: 0, truncated: false, deadline: 0 };
  }

  async _deleteDirContents(dirPath) {
    const state = this._newState();
    await this._walk(dirPath, { dryRun: false, state });
    return { deletedFiles: state.files, freedBytes: state.bytes, lockedFiles: state.locked + state.denied, deniedFiles: state.denied };
  }

  /**
   * What cleanTempFiles would remove: same folders, same protected names, so the dashboard estimate and the
   * cleaner can never disagree. `deadlineMs` stops early and marks the result as truncated (a lower bound).
   */
  /** The Recycle Bin goes through DarkHub.Cleaner.exe (Shell API, every drive). Loaded on first use. */
  async _cleaner() {
    if (!this.cleaner) {
      const { CleanerService } = await import('../cleaner/CleanerService.js');
      this.cleaner = new CleanerService();
    }
    return this.cleaner;
  }

  async analyzeTempFiles({ deadlineMs = 0, recycleBin = false } = {}) {
    const state = this._newState();
    if (deadlineMs > 0) state.deadline = Date.now() + deadlineMs;
    for (const dir of this.tempDirs) {
      await this._walk(dir, { dryRun: true, state });
      if (state.truncated) break;
    }
    const summary = { files: state.files, bytes: state.bytes, dirs: this.tempDirs.length, truncated: state.truncated };
    if (recycleBin) {
      const r = await (await this._cleaner()).recycleBin();
      if (r?.ok) {
        summary.recycleBin = { bytes: r.before.bytes, items: r.before.items };
        summary.files += r.before.items;
        summary.bytes += r.before.bytes;
      }
    }
    return { ok: true, summary };
  }

  /**
   * `recycleBin: true` also empties the Recycle Bin (permanent). Only callers acting on a user's click pass it
   * (Optimizer, Dashboard): scheduled maintenance, Hub packages and the privacy clean keep the bin as it is.
   */
  async cleanTempFiles({ recycleBin = false } = {}) {
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

    let bin = null;
    if (recycleBin) {
      const r = await (await this._cleaner()).recycleBin({ apply: true });
      if (r?.ok) {
        bin = { items: r.files, bytes: r.bytes, left: r.locked };
        totalFreed += r.bytes;
        msg += r.before.items
          ? ` Lixeira esvaziada: ${r.files} item(ns), ${formatBytes(r.bytes)}${r.locked ? ` (${r.locked} não saíram)` : ''}.`
          : ' Lixeira já estava vazia.';
      } else {
        bin = { error: r?.error || 'falha' };
        msg += ` Lixeira não esvaziada: ${r?.error || 'falha'}.`;
      }
    }

    return {
      recycleBin: bin,
      ok: true,
      status,
      deniedFiles: totalDenied,
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

export { StorageEngine };
export default new StorageEngine();
