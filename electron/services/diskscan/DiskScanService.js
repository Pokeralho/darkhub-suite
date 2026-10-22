// "Mapa de disco": runs DarkHub.DiskScan.exe, keeps the tree in the main process and serves the renderer only
// the part it can draw. One scan at a time.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ScanModel } from './ScanModel.js';
import { parseFilter } from './filter.js';
import { runPowerShell } from '../PowerShellRunner.js';

const TAG_COLORS = new Set(['red', 'yellow', 'green', 'blue']);

function defaultExe() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here.replace(/app\.asar(?![.\w])/, 'app.asar.unpacked'), '..', 'DarkHub.DiskScan.exe');
}

const csvCell = (v) => `"${String(v).replace(/"/g, '""')}"`;

export function formatSize(bytes) {
  if (!(bytes > 0)) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

export class DiskScanService {
  constructor({ exePath = defaultExe(), shell = null, spawnImpl = spawn } = {}) {
    this.exePath = exePath;
    this.shell = shell;
    this.spawn = spawnImpl;
    this.model = null;
    this.proc = null;
    this.state = null; // { root, startedAt, finishedAt, running, done, error, volume }
    this._filters = new Map();
  }

  _filter(query) {
    const q = String(query || '').trim();
    if (!q) return { conditions: [], errors: [], key: '' };
    let f = this._filters.get(q);
    if (!f) { f = { ...parseFilter(q), key: q }; this._filters.set(q, f); if (this._filters.size > 50) this._filters.delete(this._filters.keys().next().value); }
    return f;
  }

  async drives() {
    const r = await runPowerShell("Get-CimInstance Win32_LogicalDisk | Where-Object { $_.Size -gt 0 } | Select-Object DeviceID, VolumeName, FileSystem, Size, FreeSpace, DriveType | ConvertTo-Json -Compress", { timeoutMs: 20000, trim: true });
    let list = [];
    try { const j = JSON.parse(r.stdout || '[]'); list = Array.isArray(j) ? j : [j]; } catch { list = []; }
    return {
      ok: true,
      drives: list.map((d) => ({
        root: `${d.DeviceID}\\`, label: d.VolumeName || '', fs: d.FileSystem || '', total: Number(d.Size) || 0, free: Number(d.FreeSpace) || 0,
        type: d.DriveType === 2 ? 'removable' : d.DriveType === 4 ? 'network' : 'local'
      }))
    };
  }

  status() {
    const s = this.state;
    if (!s) return { ok: true, active: false };
    const m = this.model;
    return {
      ok: true, active: true, root: s.root, running: s.running, done: s.done, error: s.error,
      dirs: m ? Math.max(0, m.maxDir) : 0, files: m ? m.fileCount : 0, bytes: m ? m.bytes : 0, errors: m ? m.errorCount : 0,
      elapsedMs: (s.finishedAt || Date.now()) - s.startedAt, volume: s.volume
    };
  }

  /** Starts scanning `root`. Progress goes to `onProgress(status)` at most every 250 ms. */
  start(root, onProgress = () => {}) {
    const target = typeof root === 'string' ? path.resolve(root) : '';
    if (!target || !path.isAbsolute(target)) return { ok: false, error: 'Caminho inválido.' };
    let st;
    try { st = fs.statSync(target); } catch { return { ok: false, error: 'A pasta não existe ou não pode ser lida.' }; }
    if (!st.isDirectory()) return { ok: false, error: 'Escolha uma pasta ou unidade.' };
    if (!fs.existsSync(this.exePath)) return { ok: false, error: 'DarkHub.DiskScan.exe não foi encontrado.' };
    this.cancel();

    const rootPath = /^[A-Za-z]:\\?$/.test(target) ? `${target.slice(0, 2)}\\` : target;
    const model = new ScanModel(rootPath);
    const state = { root: rootPath, startedAt: Date.now(), finishedAt: 0, running: true, done: null, error: null, volume: null };
    this.model = model; this.state = state; this._filters.clear();
    if (/^[A-Za-z]:\\$/.test(rootPath)) {
      try { const v = fs.statfsSync(rootPath); state.volume = { total: v.blocks * v.bsize, free: v.bavail * v.bsize }; } catch { /* no volume info */ }
    }

    const child = this.spawn(this.exePath, [rootPath], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    this.proc = child;
    let pending = '';
    let lastEmit = 0;
    const emit = (force) => {
      const now = Date.now();
      if (!force && now - lastEmit < 250) return;
      lastEmit = now;
      try { onProgress(this.status()); } catch { /* window gone */ }
    };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      if (this.model !== model) return;
      const lines = (pending + chunk).split('\n');
      pending = lines.pop();
      for (const line of lines) {
        const done = model.addLine(line.replace(/\r$/, ''));
        if (done) state.done = done;
      }
      emit(false);
    });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (e) => { if (this.model === model) { state.running = false; state.error = e.message; state.finishedAt = Date.now(); emit(true); } });
    child.on('close', (code) => {
      if (this.model !== model) return;
      if (pending) { const d = model.addLine(pending); if (d) state.done = d; pending = ''; }
      state.running = false; state.finishedAt = Date.now(); this.proc = null;
      if (!state.done && !state.error) state.error = code === null ? 'Varredura cancelada.' : (stderr.trim() || `A varredura terminou com código ${code}.`);
      emit(true);
    });
    emit(true);
    return { ok: true, root: rootPath };
  }

  cancel() {
    if (this.proc) {
      try { this.proc.kill(); } catch { /* already gone */ }
      this.proc = null;
      if (this.state) { this.state.running = false; this.state.finishedAt = Date.now(); this.state.error = 'Varredura cancelada.'; }
    }
    return { ok: true };
  }

  /** Drawable tree under `id` (default root): { tree, trail, total, filterErrors }. */
  /** `minFraction`: entries smaller than this share of the folder are folded (the renderer derives it from pixels). */
  view({ id = 'd0', minFraction = 0, maxNodes = 6000, filter = '', showFree = false } = {}) {
    const m = this.model;
    if (!m || m.maxDir < 0) return { ok: false, error: 'Nenhuma varredura.' };
    const r = m.parse(id);
    if (!r || r.kind !== 'dir') return { ok: false, error: 'Pasta não encontrada nesta varredura.' };
    const f = this._filter(filter);
    const frac = Math.min(0.05, Math.max(0, Number(minFraction) || 0));
    const tree = m.view(r.n, { minBytes: m.sizes(f).dirSize[r.n] * frac, maxNodes: Math.min(20000, Math.max(100, Number(maxNodes) || 6000)), filter: f });
    // A whole drive also shows its free space and what the scan could not see (system files, VSS, no access).
    const vol = this.state?.volume;
    if (r.n === 0 && vol && !f.conditions.length && !this.state.running) {
      const unknown = vol.total - vol.free - tree.size;
      tree.children = tree.children || [];
      if (showFree && vol.free > 0) tree.children.push({ id: 'free', name: 'free', size: vol.free, kind: 'free' });
      if (unknown > vol.total * 0.002) tree.children.push({ id: 'unknown', name: 'unknown', size: unknown, kind: 'unknown' });
      tree.children.sort((a, b) => b.size - a.size);
      tree.size = tree.children.reduce((a, c) => a + c.size, 0);
    }
    return { ok: true, tree, volume: r.n === 0 ? vol || null : null, trail: m.trail(r.n), total: m.sizes(f).dirSize[0], filterErrors: f.errors, status: this.status() };
  }

  info(id, filter = '') {
    const info = this.model?.info(id, this._filter(filter));
    return info ? { ok: true, info } : { ok: false, error: 'Item não encontrado.' };
  }

  setTag(id, color) {
    if (color !== null && !TAG_COLORS.has(color)) return { ok: false, error: 'Cor inválida.' };
    return this.model?.setTag(id, color) ? { ok: true } : { ok: false, error: 'Item não encontrado.' };
  }

  _pathOf(id) {
    const m = this.model; const r = m?.parse(id);
    if (!r) return null;
    return r.kind === 'dir' ? m.dirPath(r.n) : m.filePath(r.n);
  }

  async open(id) {
    const p = this._pathOf(id);
    if (!p) return { ok: false, error: 'Item não encontrado.' };
    const err = await this.shell.openPath(p);
    return err ? { ok: false, error: err } : { ok: true };
  }

  reveal(id) {
    const p = this._pathOf(id);
    if (!p) return { ok: false, error: 'Item não encontrado.' };
    this.shell.showItemInFolder(p);
    return { ok: true };
  }

  /** Sends to the Recycle Bin (never a permanent delete) and removes it from the map. The scan root cannot be trashed. */
  async trash(id) {
    if (id === 'd0') return { ok: false, error: 'A pasta analisada não pode ser enviada para a Lixeira daqui.' };
    const p = this._pathOf(id);
    if (!p) return { ok: false, error: 'Item não encontrado.' };
    try { await this.shell.trashItem(p); } catch (e) { return { ok: false, error: `O Windows recusou: ${e?.message ?? e}` }; }
    if (fs.existsSync(p)) return { ok: false, error: 'O item continua no disco (em uso ou sem permissão).' };
    this.model.markRemoved(id);
    return { ok: true, path: p };
  }

  pathOf(id) { return this._pathOf(id); }

  /** Writes a report of folder `id` to `dest`: 'csv' (every file) or 'txt' (folders + 100 largest files). */
  async exportTo({ id = 'd0', format = 'txt', filter = '' }, dest) {
    const m = this.model; const r = m?.parse(id);
    if (!r || r.kind !== 'dir') return { ok: false, error: 'Pasta não encontrada.' };
    const f = this._filter(filter);
    const out = fs.createWriteStream(dest, { encoding: 'utf8' });
    const write = (s) => (out.write(s) ? Promise.resolve() : new Promise((res) => out.once('drain', res)));
    let rows = 0;
    if (format === 'csv') {
      await write('\uFEFFCaminho,Nome,Tamanho (bytes),Modificado\r\n');
      const buf = [];
      m.eachFile(r.n, f, (x) => { buf.push(`${csvCell(x.path)},${csvCell(x.name)},${x.size},${x.mtime ? new Date(x.mtime).toISOString() : ''}\r\n`); });
      for (let i = 0; i < buf.length; i += 2000) await write(buf.slice(i, i + 2000).join(''));
      rows = buf.length;
    } else {
      const tree = m.view(r.n, { minBytes: 0, maxNodes: 400, maxDepth: 1, filter: f });
      const top = [];
      m.eachFile(r.n, f, (x) => { if (top.length < 100 || x.size > top[top.length - 1].size) { top.push(x); top.sort((a, b) => b.size - a.size); if (top.length > 100) top.pop(); } });
      const lines = [`Mapa de disco: ${m.dirPath(r.n)}`, `Total: ${formatSize(tree.size)}${f.key ? `  (filtro: ${f.key})` : ''}`, `Gerado em: ${new Date().toLocaleString()}`, '',
        'Itens deste nível', ...(tree.children || []).map((c) => `${formatSize(c.size).padStart(10)}  ${((c.size / Math.max(1, tree.size)) * 100).toFixed(1).padStart(5)}%  ${c.kind === 'dir' ? `${c.name}\\` : c.kind === 'rest' ? `(${c.count} itens menores)` : c.name}`),
        '', '100 maiores arquivos', ...top.map((x) => `${formatSize(x.size).padStart(10)}  ${x.path}`), ''];
      await write(lines.join('\r\n'));
      rows = lines.length;
    }
    await new Promise((res, rej) => { out.end(res); out.on('error', rej); });
    return { ok: true, path: dest, rows };
  }
}
