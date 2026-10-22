// Compact in-memory model of one scan: column arrays instead of one object per entry, so a drive with a million
// files costs tens of MB instead of hundreds. Folder ids come from DarkHub.DiskScan (0 = root).
import { classOf, matchFile } from './filter.js';

class Col {
  constructor(Type, cap = 1024) { this.Type = Type; this.a = new Type(cap); this.n = 0; }
  push(v) {
    if (this.n === this.a.length) { const b = new this.Type(this.a.length * 2); b.set(this.a); this.a = b; }
    this.a[this.n++] = v;
  }
}

export class ScanModel {
  constructor(rootPath) {
    this.rootPath = rootPath;
    // folders, indexed by id (ids are dense but may arrive out of order)
    this.dName = []; this.dParent = new Int32Array(1024).fill(-2); this.dM = new Float64Array(1024); this.dC = new Float64Array(1024);
    this.dAttr = new Uint32Array(1024); this.maxDir = -1;
    // files, in arrival order
    this.fName = []; this.fParent = new Col(Int32Array); this.fSize = new Col(Float64Array);
    this.fM = new Col(Float64Array); this.fC = new Col(Float64Array); this.fA = new Col(Float64Array); this.fAttr = new Col(Uint32Array);
    this.removedDirs = new Set(); this.removedFiles = new Set();
    this.tags = new Map(); // node id ('d12' / 'f345') -> color
    this.errors = []; this.errorCount = 0;
    this.bytes = 0; this.version = 0; this._index = null; this._filterCache = null;
  }

  _growDirs(id) {
    let cap = this.dParent.length;
    if (id < cap) return;
    while (cap <= id) cap *= 2;
    const grow = (Type, old, fill) => { const b = new Type(cap); if (fill !== undefined) b.fill(fill); b.set(old); return b; };
    this.dParent = grow(Int32Array, this.dParent, -2); this.dM = grow(Float64Array, this.dM); this.dC = grow(Float64Array, this.dC); this.dAttr = grow(Uint32Array, this.dAttr);
  }

  /** One line of DarkHub.DiskScan output. Returns the parsed DONE stats or null. */
  addLine(line) {
    const p = line.split('\t');
    if (p[0] === 'F' && p.length >= 8) {
      this.fParent.push(+p[1]); this.fName.push(p[2]); this.fSize.push(+p[3]); this.bytes += +p[3];
      this.fM.push(+p[4]); this.fC.push(+p[5]); this.fA.push(+p[6]); this.fAttr.push(+p[7]);
    } else if (p[0] === 'D' && p.length >= 8) {
      const id = +p[1];
      this._growDirs(id);
      this.dParent[id] = +p[2]; this.dName[id] = id === 0 ? this.rootPath : p[3];
      this.dM[id] = +p[4]; this.dC[id] = +p[5]; this.dAttr[id] = +p[7];
      if (id > this.maxDir) this.maxDir = id;
    } else if (p[0] === 'E') {
      this.errorCount++;
      if (this.errors.length < 200) this.errors.push({ path: p[1], code: p[2] });
    } else if (p[0] === 'DONE') {
      return { dirs: +p[1], files: +p[2], errors: +p[3], ms: +p[4] };
    } else return null;
    this.version++;
    return null;
  }

  get fileCount() { return this.fName.length; }

  /** CSR children index + folder totals. Rebuilt lazily when new data arrived. */
  index() {
    if (this._index && this._index.version === this.version) return this._index;
    const nd = this.maxDir + 1, nf = this.fName.length;
    const dParent = this.dParent, fParent = this.fParent.a;
    const dirStart = new Int32Array(nd + 1), fileStart = new Int32Array(nd + 1);
    // While scanning, threads flush independently: an entry can arrive before its folder. Those wait for the next index.
    const known = (p) => p >= 0 && p < nd && (p === 0 || dParent[p] !== -2);
    for (let i = 1; i < nd; i++) { const p = dParent[i]; if (known(p)) dirStart[p + 1]++; }
    for (let i = 0; i < nf; i++) { const p = fParent[i]; if (known(p)) fileStart[p + 1]++; }
    for (let i = 0; i < nd; i++) { dirStart[i + 1] += dirStart[i]; fileStart[i + 1] += fileStart[i]; }
    const dirKids = new Int32Array(dirStart[nd]), fileKids = new Int32Array(fileStart[nd]);
    const dPos = dirStart.slice(0, nd), fPos = fileStart.slice(0, nd);
    for (let i = 1; i < nd; i++) { const p = dParent[i]; if (known(p)) dirKids[dPos[p]++] = i; }
    for (let i = 0; i < nf; i++) { const p = fParent[i]; if (known(p)) fileKids[fPos[p]++] = i; }
    const order = this._topDown(nd, dirStart, dirKids);
    this._index = { version: this.version, nd, dirStart, dirKids, fileStart, fileKids, order };
    this._filterCache = null;
    return this._index;
  }

  _topDown(nd, dirStart, dirKids) {
    const order = new Int32Array(nd); let head = 0, tail = 0;
    if (nd > 0) order[tail++] = 0;
    while (head < tail) { const d = order[head++]; for (let k = dirStart[d]; k < dirStart[d + 1]; k++) order[tail++] = dirKids[k]; }
    return order.subarray(0, tail);
  }

  /** Folder path from the root. */
  dirPath(id) {
    const parts = [];
    for (let d = id; d > 0; d = this.dParent[d]) parts.push(this.dName[d]);
    parts.push(this.rootPath.replace(/\\+$/, ''));
    return parts.reverse().join('\\') + (id === 0 && /^[A-Za-z]:\\?$/.test(this.rootPath) ? '\\' : '');
  }

  filePath(i) { return `${this.dirPath(this.fParent.a[i]).replace(/\\+$/, '')}\\${this.fName[i]}`; }

  /**
   * Per-file pass/fail and per-folder totals for a parsed filter (cached per data version + query).
   * Returns { dirSize: Float64Array, dirFiles: Float64Array, filePass: Uint8Array|null }.
   */
  sizes(filter) {
    const ix = this.index();
    const key = filter?.key || '';
    if (this._filterCache && this._filterCache.key === key && this._filterCache.version === ix.version) return this._filterCache;
    const nd = ix.nd, nf = this.fName.length;
    const dirSize = new Float64Array(nd), dirFiles = new Float64Array(nd);
    const fSize = this.fSize.a, fParent = this.fParent.a;
    const conds = filter?.conditions?.length ? filter.conditions : null;
    let filePass = null;
    // top-down: removed folders, inherited tags and folder-mask matches
    const dead = new Uint8Array(nd), dirTag = new Array(nd);
    const folderConds = conds ? conds.filter((c) => c.type === 'folder') : [];
    const folderHit = folderConds.map(() => new Uint8Array(nd));
    for (const d of ix.order) {
      const p = d === 0 ? -1 : this.dParent[d];
      dead[d] = this.removedDirs.has(d) || (p >= 0 && dead[p]) ? 1 : 0;
      dirTag[d] = this.tags.get(`d${d}`) || (p >= 0 ? dirTag[p] : undefined);
      folderConds.forEach((c, k) => { folderHit[k][d] = (p >= 0 && folderHit[k][p]) || (d > 0 && c.re.test(this.dName[d])) ? 1 : 0; });
    }
    if (conds) {
      filePass = new Uint8Array(nf);
      const now = Date.now();
      const f = { name: '', size: 0, mtime: 0, ctime: 0, atime: 0, attr: 0, tag: undefined, folderMatch: null };
      let parent = 0;
      f.folderMatch = (c) => folderHit[folderConds.indexOf(c)][parent] === 1;
      for (let i = 0; i < nf; i++) {
        parent = fParent[i];
        if (parent >= nd || dead[parent] || this.removedFiles.has(i)) continue;
        f.name = this.fName[i]; f.size = fSize[i]; f.mtime = this.fM.a[i]; f.ctime = this.fC.a[i]; f.atime = this.fA.a[i];
        f.attr = this.fAttr.a[i]; f.tag = this.tags.get(`f${i}`) || dirTag[parent];
        if (matchFile(conds, f, now)) filePass[i] = 1;
      }
    }
    for (let i = 0; i < nf; i++) {
      const p = fParent[i];
      if (p >= nd || dead[p] || (filePass ? !filePass[i] : this.removedFiles.has(i))) continue;
      dirSize[p] += fSize[i]; dirFiles[p] += 1;
    }
    for (let k = ix.order.length - 1; k > 0; k--) {
      const d = ix.order[k], p = this.dParent[d];
      if (dead[d]) continue;
      dirSize[p] += dirSize[d]; dirFiles[p] += dirFiles[d];
    }
    this._filterCache = { key, version: ix.version, dirSize, dirFiles, filePass, dead, dirTag };
    return this._filterCache;
  }

  /**
   * The part of the tree worth drawing: entries smaller than `minBytes` are folded into one "smaller items" block
   * per folder, and at most `maxNodes` entries are sent.
   */
  view(rootId, { minBytes = 0, maxNodes = 6000, maxDepth = 14, filter = null } = {}) {
    const ix = this.index();
    const sz = this.sizes(filter);
    let budget = maxNodes;
    const fSize = this.fSize.a;
    const build = (d, depth) => {
      const node = { id: `d${d}`, name: d === 0 ? this.dirPath(0) : this.dName[d], size: sz.dirSize[d], kind: 'dir', files: sz.dirFiles[d] };
      const tag = this.tags.get(node.id); if (tag) node.tag = tag;
      if (depth >= maxDepth) return node;
      const items = [];
      for (let k = ix.dirStart[d]; k < ix.dirStart[d + 1]; k++) { const c = ix.dirKids[k]; if (!sz.dead[c] && sz.dirSize[c] > 0) items.push([sz.dirSize[c], c, 1]); }
      for (let k = ix.fileStart[d]; k < ix.fileStart[d + 1]; k++) {
        const i = ix.fileKids[k];
        if (sz.filePass ? !sz.filePass[i] : this.removedFiles.has(i)) continue;
        if (fSize[i] > 0) items.push([fSize[i], i, 0]);
      }
      items.sort((a, b) => b[0] - a[0]);
      const children = [];
      let restSize = 0, restCount = 0;
      for (const [size, idx, isDir] of items) {
        if (size < minBytes || budget <= 0) { restSize += size; restCount++; continue; }
        budget--;
        if (isDir) children.push(build(idx, depth + 1));
        else {
          const name = this.fName[idx];
          const f = { id: `f${idx}`, name, size, kind: 'file', cls: classOf(name) };
          const t = this.tags.get(f.id); if (t) f.tag = t;
          children.push(f);
        }
      }
      if (restSize > 0) children.push({ id: `g${d}`, name: `${restCount}`, size: restSize, kind: 'rest', count: restCount });
      if (children.length) node.children = children;
      return node;
    };
    return build(rootId, 0);
  }

  /** Ancestors of a folder, root first: [{ id, name }]. */
  trail(d) {
    const out = [];
    for (let x = d; x >= 0; x = x === 0 ? -1 : this.dParent[x]) out.push({ id: `d${x}`, name: x === 0 ? this.dirPath(0) : this.dName[x] });
    return out.reverse();
  }

  parse(id) {
    const m = /^([df])(\d+)$/.exec(String(id || ''));
    if (!m) return null;
    const n = Number(m[2]);
    if (m[1] === 'd') return n <= this.maxDir && this.dParent[n] !== -2 ? { kind: 'dir', n } : null;
    return n < this.fName.length ? { kind: 'file', n } : null;
  }

  info(id, filter) {
    const r = this.parse(id);
    if (!r) return null;
    const sz = this.sizes(filter);
    if (r.kind === 'dir') {
      const ix = this.index();
      let dirs = 0; const stack = [r.n];
      while (stack.length) { const d = stack.pop(); for (let k = ix.dirStart[d]; k < ix.dirStart[d + 1]; k++) { dirs++; stack.push(ix.dirKids[k]); } }
      return { id, kind: 'dir', name: r.n === 0 ? this.dirPath(0) : this.dName[r.n], path: this.dirPath(r.n), size: sz.dirSize[r.n], files: sz.dirFiles[r.n], dirs,
        mtime: this.dM[r.n] || null, ctime: this.dC[r.n] || null, attr: this.dAttr[r.n], tag: this.tags.get(id) || null, isRoot: r.n === 0 };
    }
    const i = r.n;
    return { id, kind: 'file', name: this.fName[i], path: this.filePath(i), size: this.fSize.a[i], cls: classOf(this.fName[i]),
      mtime: this.fM.a[i] || null, ctime: this.fC.a[i] || null, atime: this.fA.a[i] || null, attr: this.fAttr.a[i], tag: this.tags.get(id) || null,
      parent: `d${this.fParent.a[i]}` };
  }

  setTag(id, color) {
    if (!this.parse(id)) return false;
    if (color) this.tags.set(id, color); else this.tags.delete(id);
    this._filterCache = null;
    return true;
  }

  markRemoved(id) {
    const r = this.parse(id);
    if (!r) return false;
    if (r.kind === 'dir') this.removedDirs.add(r.n); else this.removedFiles.add(r.n);
    this._filterCache = null;
    return true;
  }

  /** Every file under a folder that passes the filter: [{ path, size, mtime }] streamed through `emit`. */
  eachFile(dirId, filter, emit) {
    const ix = this.index(); const sz = this.sizes(filter);
    const stack = [dirId];
    while (stack.length) {
      const d = stack.pop();
      if (sz.dead[d]) continue;
      const base = this.dirPath(d).replace(/\\+$/, '');
      for (let k = ix.fileStart[d]; k < ix.fileStart[d + 1]; k++) {
        const i = ix.fileKids[k];
        if (sz.filePass ? !sz.filePass[i] : this.removedFiles.has(i)) continue;
        emit({ path: `${base}\\${this.fName[i]}`, name: this.fName[i], size: this.fSize.a[i], mtime: this.fM.a[i] });
      }
      for (let k = ix.dirStart[d]; k < ix.dirStart[d + 1]; k++) stack.push(ix.dirKids[k]);
    }
  }
}
