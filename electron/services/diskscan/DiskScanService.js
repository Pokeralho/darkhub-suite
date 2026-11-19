// "Mapa de disco": runs DarkHub.DiskScan.exe on Windows, keeps the tree in the main process and serves the renderer only
// the part it can draw. One scan at a time. On non-Windows platforms this feature is not available and all operations
// return a structured unsupported response without invoking PowerShell or the native scanner.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ScanModel } from './ScanModel.js';
import { parseFilter } from './filter.js';
import { runPowerShell } from '../PowerShellRunner.js';
import { psQuote } from '../optimizer/OptimizerUtils.js';
import { oneDriveRootOf } from '../cloudSync.js';
import { integrityError, TAMPERED_MESSAGE } from '../binaryIntegrity.js';

const TAG_COLORS = new Set(['red', 'yellow', 'green', 'blue']);

function defaultExe() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here.replace(/app\.asar(?![.\w])/, 'app.asar.unpacked'), '..', 'DarkHub.DiskScan.exe');
}

function unsupported(reason = 'windows-only') {
  return {
    ok: false,
    unsupported: true,
    platform: process.platform,
    reason,
    error: 'O mapa de disco é suportado apenas no Windows.'
  };
}

function isSupported() {
  return process.platform === 'win32';
}

const csvCell = (v) => `"${String(v).replace(/"/g, '""')}"`;

const normDir = (p) => path.win32.resolve(String(p)).replace(/[\\/]+$/, '').toLowerCase();
const isUnder = (t, r) => t === r || t.startsWith(`${r}\\`);
/**
 * Why `p` must never be deleted from the disk map (we run as Administrator), or null. Blocks volume roots, the Windows,
 * Program Files and ProgramData trees, the Users folder and each profile in it, the app's own folder, and any ancestor of those.
 */
export function protectedPathReason(p, env = process.env) {
  const t = normDir(p);
  if (/^[a-z]:$/.test(t) || /^\\\\[^\\]+\\[^\\]+$/.test(t)) return 'root';
  const sysDrive = (env.SystemDrive || 'C:').toLowerCase();
  const users = normDir(`${sysDrive}\\Users`);
  const trees = [env.SystemRoot || env.windir || `${sysDrive}\\Windows`, env.ProgramFiles, env['ProgramFiles(x86)'], env.ProgramW6432, env.ProgramData]
    .filter(Boolean).map(normDir);
  for (const r of trees) if (isUnder(t, r) || isUnder(r, t)) return 'system';
  for (const r of [users, env.USERPROFILE, path.dirname(process.execPath)].filter(Boolean).map(normDir)) if (isUnder(r, t)) return 'system';
  if (path.win32.dirname(t) === users) return 'system'; // a whole profile folder (C:\Users\<name>)
  return null;
}
const PROTECTED_MSG = 'Pasta do sistema, raiz de disco ou pasta de usuário: o DarkHub não apaga isso daqui.';

const BIN_RE = /^([a-z]:)\\\$recycle\.bin(?:\\(s-1-[0-9-]+)(?:\\([^\\]+))?)?(?:\\|$)/i;
/**
 * Where `p` sits in a drive's Recycle Bin, or null when it is outside it. `level`: 'root' ($Recycle.Bin), 'user' (the
 * per-account SID folder), 'entry' (a $R/$I item or anything inside one). Items in there cannot be recycled again.
 */
export function recycleBinPlace(p) {
  const m = BIN_RE.exec(path.win32.resolve(String(p)));
  if (!m) return null;
  if (!m[2]) return { level: 'root' };
  const sidDir = `${m[1]}\\$Recycle.Bin\\${m[2]}`;
  if (!m[3]) return { level: 'user', sidDir };
  const entry = m[3];
  const id = /^\$[RI]/i.test(entry) ? entry.slice(2) : null;
  return { level: 'entry', sidDir, entry, isWhole: path.win32.resolve(String(p)).length === `${sidDir}\\${entry}`.length, rFile: id && `${sidDir}\\$R${id}`, iFile: id && `${sidDir}\\$I${id}` };
}

/** The original path recorded in a $I file (Windows Vista+ format 1 or 2), or null when missing or unreadable. */
export function readRecycleInfo(iFile) {
  let b;
  try { b = fs.readFileSync(iFile); } catch { return null; }
  if (b.length < 28) return null;
  const ver = Number(b.readBigInt64LE(0));
  let name = '';
  if (ver === 2) { const n = b.readInt32LE(24); name = b.subarray(28, Math.min(b.length, 28 + n * 2)).toString('utf16le'); }
  else if (ver === 1) name = b.subarray(24, Math.min(b.length, 24 + 520)).toString('utf16le');
  else return null;
  name = name.replace(/\0[\s\S]*$/, '');
  return name ? { original: name, size: Number(b.readBigInt64LE(8)) } : null;
}
const BIN_MSG = {
  root: 'Esta é a pasta da Lixeira do Windows: esvazie a Lixeira pelo Explorador de Arquivos ou pelo Limpador do DarkHub.',
  inBin: 'Este item já está dentro da Lixeira, então não pode ir para ela de novo. Use "Apagar de vez" para liberar o espaço.'
};

export function formatSize(bytes) {
  if (!(bytes > 0)) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

// Drive type, Recycle Bin switches and size limit for the volume holding a path. Read-only.
const RECYCLE_PROBE = (p) => `
$ErrorActionPreference = 'SilentlyContinue'
$root = [IO.Path]::GetPathRoot(${psQuote(p)})
$di = New-Object IO.DriveInfo $root
$vol = Get-CimInstance Win32_Volume | Where-Object { $_.Name -eq $root } | Select-Object -First 1
$bb = $null
if ($vol) { $bb = Get-ChildItem 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\BitBucket\\Volume' | Where-Object { ([string]$vol.DeviceID).Contains($_.PSChildName) } | Select-Object -First 1 }
$k = if ($bb) { Get-ItemProperty -LiteralPath $bb.PSPath } else { $null }
$pol = @(foreach ($h in 'HKCU:', 'HKLM:') { (Get-ItemProperty ($h + '\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer')).NoRecycleFiles })
[pscustomobject]@{
  type = "$($di.DriveType)"; total = [int64]$di.TotalSize; known = [bool]$bb
  nuke = [int]$k.NukeOnDelete; max = if ($k -and $null -ne $k.MaxCapacity) { [int64]$k.MaxCapacity } else { -1 }
  noRecycle = [bool]($pol -contains 1)
} | ConvertTo-Json -Compress
`;

export const RECYCLE_REFUSAL = Object.freeze({
  noBin: 'Esta unidade não tem Lixeira (pendrive, cartão ou rede): o Windows apagaria o item para sempre. Apague pelo Explorador de Arquivos se tiver certeza.',
  disabled: 'A Lixeira está desligada nesta unidade: o Windows apagaria o item para sempre. Apague pelo Explorador de Arquivos se tiver certeza.',
  tooBig: 'O item é maior que o espaço da Lixeira desta unidade: o Windows o apagaria para sempre. Aumente a Lixeira (Propriedades da Lixeira) ou apague pelo Explorador de Arquivos.',
  unknown: 'Não foi possível confirmar que a Lixeira desta unidade aceita o item; nada foi apagado.'
});

/**
 * Why the Recycle Bin of the item's drive cannot take it ('noBin' | 'disabled' | 'tooBig' | 'unknown'), or null when it can.
 * MaxCapacity is in MB; without the key Windows uses its default (about 5% of the volume, taken as the limit here).
 */
export function recycleVerdict(info, size) {
  if (!info || typeof info !== 'object') return 'unknown';
  if (info.type !== 'Fixed') return 'noBin';
  if (info.noRecycle || Number(info.nuke) === 1) return 'disabled';
  const max = Number(info.max);
  const limit = max >= 0 ? max * 1024 * 1024 : (Number(info.total) || 0) * 0.05;
  return limit > 0 && size > limit ? 'tooBig' : null;
}

/** Makes every file under `p` writable, never following links or junctions (their targets are left alone). */
function clearReadOnly(p) {
  let st;
  try { st = fs.lstatSync(p); } catch { return; }
  if (st.isSymbolicLink()) return;
  if (st.isDirectory()) { for (const n of fs.readdirSync(p)) clearReadOnly(path.join(p, n)); return; }
  try { fs.chmodSync(p, 0o666); } catch { /* the retry reports it */ }
}

export class DiskScanService {
  constructor({ exePath = defaultExe(), shell = null, spawnImpl = spawn, recycleProbe = null } = {}) {
    if (recycleProbe) this.recycleProbe = recycleProbe;
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
    if (!isSupported()) return { ...unsupported(), drives: [] };
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
    if (!isSupported()) return { ok: true, active: false, supported: false, unsupported: true, platform: process.platform, reason: 'windows-only' };
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
    if (!isSupported()) return unsupported();
    const target = typeof root === 'string' ? path.resolve(root) : '';
    if (!target || !path.isAbsolute(target)) return { ok: false, error: 'Caminho inválido.' };
    let st;
    try { st = fs.statSync(target); } catch { return { ok: false, error: 'A pasta não existe ou não pode ser lida.' }; }
    if (!st.isDirectory()) return { ok: false, error: 'Escolha uma pasta ou unidade.' };
    if (!fs.existsSync(this.exePath)) return { ok: false, error: 'DarkHub.DiskScan.exe não foi encontrado.' };
    if (integrityError(['DarkHub.DiskScan.exe'])) return { ok: false, error: TAMPERED_MESSAGE };
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
    if (!isSupported()) return unsupported();
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
    if (!isSupported()) return unsupported();
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
    if (!isSupported()) return unsupported();
    const info = this.model?.info(id, this._filter(filter));
    return info ? { ok: true, info } : { ok: false, error: 'Item não encontrado.' };
  }

  setTag(id, color) {
    if (!isSupported()) return unsupported();
    if (color !== null && !TAG_COLORS.has(color)) return { ok: false, error: 'Cor inválida.' };
    return this.model?.setTag(id, color) ? { ok: true } : { ok: false, error: 'Item não encontrado.' };
  }

  _pathOf(id) {
    const m = this.model; const r = m?.parse(id);
    if (!r) return null;
    return r.kind === 'dir' ? m.dirPath(r.n) : m.filePath(r.n);
  }

  async open(id) {
    if (!isSupported()) return unsupported();
    const p = this._pathOf(id);
    if (!p) return { ok: false, error: 'Item não encontrado.' };
    const err = await this.shell.openPath(p);
    return err ? { ok: false, error: err } : { ok: true };
  }

  reveal(id) {
    if (!isSupported()) return unsupported();
    const p = this._pathOf(id);
    if (!p) return { ok: false, error: 'Item não encontrado.' };
    this.shell.showItemInFolder(p);
    return { ok: true };
  }

  /** Sends to the Recycle Bin (never a permanent delete) and removes it from the map. The scan root cannot be trashed. */
  async trash(id) {
    if (!isSupported()) return unsupported();
    if (id === 'd0') return { ok: false, error: 'A pasta analisada não pode ser enviada para a Lixeira daqui.' };
    const p = this._pathOf(id);
    if (!p) return { ok: false, error: 'Item não encontrado.' };
    if (protectedPathReason(p)) return { ok: false, error: PROTECTED_MSG };
    const bin = recycleBinPlace(p);
    if (bin && bin.level !== 'entry') return { ok: false, error: BIN_MSG.root };
    // already in the Recycle Bin (often an orphan $R folder whose $I record is gone, invisible in Explorer): the only way
    // to free it is a permanent delete, so answer like a drive without a bin and let the page offer it
    if (bin) return { ok: false, noRecycle: 'inBin', error: BIN_MSG.inBin };
    // Electron's trashItem runs without Windows' dialog: where the Recycle Bin cannot take the item (no bin on the drive,
    // bin turned off, item bigger than the bin) Windows deletes it for good instead of asking. Refuse those cases.
    const size = Number(this.model.info(id, this._filter(''))?.size) || 0;
    const why = recycleVerdict(await this.recycleProbe(p), size);
    if (why) return { ok: false, noRecycle: why, error: RECYCLE_REFUSAL[why] };
    try { await this.shell.trashItem(p); } catch (e) { return { ok: false, error: `O Windows recusou: ${e?.message ?? e}` }; }
    if (fs.existsSync(p)) return { ok: false, partial: true, error: 'O item continua no disco (em uso ou sem permissão). Parte do conteúdo pode ter ido para a Lixeira: analise de novo para atualizar o mapa.' };
    this.model.markRemoved(id);
    return { ok: true, path: p };
  }

  /**
   * Deletes for good, only where the Recycle Bin cannot take the item (USB stick, card, network, bin off or too small)
   * and only when `confirmName` repeats the item's name (the second confirmation the user types).
   */
  async deletePermanent(id, confirmName) {
    if (!isSupported()) return unsupported();
    if (id === 'd0') return { ok: false, error: 'A pasta analisada não pode ser apagada daqui.' };
    const p = this._pathOf(id);
    if (!p) return { ok: false, error: 'Item não encontrado.' };
    if (protectedPathReason(p)) return { ok: false, error: PROTECTED_MSG };
    if (String(confirmName ?? '') !== path.basename(p)) return { ok: false, error: 'Digite o nome exato do item para confirmar.' };
    // a permanent delete in OneDrive is synced: the item disappears from the cloud and from every PC of the person
    if (oneDriveRootOf(p)) return { ok: false, error: 'Este item fica no OneDrive: apagar de vez aqui apaga também na nuvem e em todos os seus PCs. Use "Mover para a Lixeira" ou apague pelo OneDrive.' };
    const bin = recycleBinPlace(p);
    if (bin && bin.level !== 'entry') return { ok: false, error: BIN_MSG.root };
    if (!bin) {
      const size = Number(this.model.info(id, this._filter(''))?.size) || 0;
      const why = recycleVerdict(await this.recycleProbe(p), size);
      if (!why || why === 'unknown') return { ok: false, error: 'Este item pode ir para a Lixeira: use "Mover para a Lixeira".' };
    }
    // fs.rm removes links/junctions themselves, never what they point to
    const rm = () => fs.promises.rm(p, { recursive: true, force: false, maxRetries: 2 });
    try {
      try { await rm(); } catch (e0) {
        // read-only files (a FAT32 stick refuses them with EPERM): clear the attribute without following links, retry once
        if (e0?.code !== 'EPERM' && e0?.code !== 'EACCES') throw e0;
        clearReadOnly(p);
        await rm();
      }
    } catch (e) {
      if (fs.existsSync(p)) return { ok: false, partial: true, error: `O Windows recusou (${e?.code || e?.message}). Parte do conteúdo pode ter sido apagada: analise de novo para atualizar o mapa.` };
    }
    if (fs.existsSync(p)) return { ok: false, partial: true, error: 'O item continua no disco (em uso ou sem permissão).' };
    // a whole Recycle Bin entry goes with its record: a $I left without its $R would show a ghost item in Explorer
    if (bin?.isWhole && bin.iFile && bin.rFile && !fs.existsSync(bin.rFile)) { try { fs.rmSync(bin.iFile, { force: true }); } catch { /* in use */ } }
    this.model.markRemoved(id);
    return { ok: true, path: p };
  }

  /** For an item inside a Recycle Bin: where it was deleted from ($I record), or orphan when the record is gone. */
  recycleInfo(id) {
    const p = this._pathOf(id);
    const bin = p && recycleBinPlace(p);
    if (!bin || bin.level !== 'entry' || !bin.iFile) return { ok: true, inBin: Boolean(bin), original: null, orphan: false };
    const rec = readRecycleInfo(bin.iFile);
    if (!rec) return { ok: true, inBin: true, original: null, orphan: true };
    const rest = path.win32.resolve(p).slice(bin.rFile.length); // the part inside the $R folder, if any
    return { ok: true, inBin: true, original: rec.original + rest, orphan: false };
  }

  /** Recycle Bin facts for the drive holding `p` (see RECYCLE_PROBE). */
  async recycleProbe(p) {
    if (!isSupported()) return null;
    const r = await runPowerShell(RECYCLE_PROBE(p), { timeoutMs: 20000, trim: true });
    try { return JSON.parse(r.stdout || 'null'); } catch { return null; }
  }

  pathOf(id) { if (!isSupported()) return null; return this._pathOf(id); }

  /** Writes a report of folder `id` to `dest`: 'csv' (every file) or 'txt' (folders + 100 largest files). */
  async exportTo({ id = 'd0', format = 'txt', filter = '' }, dest) {
    if (!isSupported()) return unsupported();
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
