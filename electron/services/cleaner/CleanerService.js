// "DarkHub Cleaner Core": drives DarkHub.Cleaner.exe (native_cleaner/, Rust). Every command returns one JSON
// object. The renderer only ever sends ids of targets/findings the engine itself listed: paths and registry keys
// are rebuilt and re-validated inside the engine. Anything that deletes is a simulation unless `apply` AND
// `confirm` are both true (the page asks for confirmation first).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const WINAPP2_URL = 'https://content.thewebatom.net/files/winapp2.ini';
const WINAPP2_MAX = 16 << 20;
export const BROWSERS = ['chrome', 'edge', 'brave', 'firefox', 'zen'];

function defaultExe() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here.replace(/app\.asar(?![.\w])/, 'app.asar.unpacked'), '..', 'DarkHub.Cleaner.exe');
}

/** Ids are short strings the engine produced; anything else is dropped before reaching it. */
export function sanitizeIds(ids) {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((x) => typeof x === 'string' && x.length > 0 && x.length < 600 && !/[\0\r\n]/.test(x)))].slice(0, 5000);
}

/**
 * winapp2.ini comes from the internet: accept it only when it looks like the real thing (text, "; Version:"
 * header, many sections). It is never executed; the engine parses it as data and validates every path.
 */
export function validateWinapp2(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 1024) return { ok: false, error: 'Arquivo vazio ou pequeno demais.' };
  if (buf.length > WINAPP2_MAX) return { ok: false, error: 'Arquivo grande demais (limite de 16 MB).' };
  if (buf.includes(0)) return { ok: false, error: 'Conteúdo binário: não é um winapp2.ini.' };
  const text = buf.toString('utf8').replace(/^\uFEFF/, '');
  const version = /^;\s*Version:\s*([^\r\n]+)/im.exec(text.slice(0, 4096))?.[1]?.trim();
  if (!version) return { ok: false, error: 'Cabeçalho "; Version:" ausente: não parece um winapp2.ini.' };
  if (/<html|<script/i.test(text.slice(0, 4096))) return { ok: false, error: 'Recebido HTML em vez do winapp2.ini.' };
  const sections = (text.match(/^\[[^\]\r\n]+\]\s*$/gm) || []).length;
  if (sections < 100) return { ok: false, error: `Só ${sections} entradas: arquivo incompleto.` };
  return { ok: true, version, sections };
}

export class CleanerService {
  constructor({ exePath = defaultExe(), dataDir, backupDir = null, execFileImpl = execFile, fetchImpl = globalThis.fetch, extraArgs = [] } = {}) {
    this.exePath = exePath;
    this.dataDir = dataDir || path.join(os.tmpdir(), 'DarkHub-Cleaner');
    this.backupDirPref = backupDir;
    this.execFile = execFileImpl;
    this.fetch = fetchImpl;
    this.extraArgs = extraArgs; // tests: --test-root / --root
    this.busy = null;
  }

  available() { return fs.existsSync(this.exePath); }

  get winapp2Path() { return path.join(this.dataDir, 'winapp2.ini'); }
  get metaPath() { return path.join(this.dataDir, 'winapp2.meta.json'); }

  /** %ProgramData%\DarkHub\Cleaner\backups (shared with the rest of DarkHub), or the user folder when it is not writable. */
  backupDir() {
    const candidates = [this.backupDirPref, path.join(process.env.ProgramData || 'C:\\ProgramData', 'DarkHub', 'Cleaner', 'backups'), path.join(this.dataDir, 'backups')].filter(Boolean);
    for (const dir of candidates) {
      try {
        fs.mkdirSync(dir, { recursive: true });
        fs.accessSync(dir, fs.constants.W_OK);
        return dir;
      } catch { /* try the next one */ }
    }
    throw new Error('Nenhuma pasta de backup gravável.');
  }

  run(args, { timeoutMs = 120000 } = {}) {
    if (!this.available()) return Promise.resolve({ ok: false, code: 'missing_engine', error: 'DarkHub.Cleaner.exe não foi encontrado (rode npm run build:cleaner).' });
    return new Promise((resolve) => {
      this.execFile(this.exePath, [...args, ...this.extraArgs], { windowsHide: true, timeout: timeoutMs, maxBuffer: 256 << 20 }, (err, stdout, stderr) => {
        const line = String(stdout || '').trim().split(/\r?\n/).filter((l) => l.startsWith('{')).pop();
        if (line) { try { return resolve(JSON.parse(line)); } catch { /* fall through */ } }
        resolve({ ok: false, code: err?.killed ? 'timeout' : 'engine_error', error: String(stderr || err?.message || 'O motor não respondeu.').trim() });
      });
    });
  }

  async _withIds(ids, fn) {
    const file = path.join(os.tmpdir(), `dh-cleaner-ids-${process.pid}-${crypto.randomBytes(6).toString('hex')}.json`);
    fs.writeFileSync(file, JSON.stringify(sanitizeIds(ids)));
    try { return await fn(file); } finally { try { fs.unlinkSync(file); } catch { /* gone */ } }
  }

  /** One change at a time. Simulations only read, so they run freely (the page may ask twice, e.g. StrictMode). */
  async _exclusive(kind, apply, fn) {
    if (!apply) return fn();
    if (this.busy) return { ok: false, code: 'busy', error: `Já existe uma operação em andamento (${this.busy}).` };
    this.busy = kind;
    try { return await fn(); } finally { this.busy = null; }
  }

  _winapp2Args() { return fs.existsSync(this.winapp2Path) ? ['--winapp2', this.winapp2Path] : []; }

  definitions() {
    try {
      const meta = JSON.parse(fs.readFileSync(this.metaPath, 'utf8'));
      return { installed: fs.existsSync(this.winapp2Path), ...meta };
    } catch {
      return { installed: fs.existsSync(this.winapp2Path) };
    }
  }

  status() {
    let backupDir = null;
    try { backupDir = this.backupDir(); } catch { /* reported as null */ }
    return { ok: true, engine: this.available(), busy: this.busy, backupDir, winapp2: this.definitions(), url: WINAPP2_URL };
  }

  /** User-initiated download of the community winapp2.ini (never automatic). Keeps the previous file on failure. */
  async updateDefinitions() {
    if (typeof this.fetch !== 'function') return { ok: false, error: 'Download indisponível.' };
    let res;
    try {
      res = await this.fetch(WINAPP2_URL, { redirect: 'follow', signal: AbortSignal.timeout(60000) });
    } catch (e) {
      return { ok: false, error: `Falha ao baixar: ${e?.message ?? e}` };
    }
    if (!res.ok) return { ok: false, error: `O servidor respondeu ${res.status}.` };
    if (!String(res.url || WINAPP2_URL).startsWith('https://')) return { ok: false, error: 'Redirecionado para um endereço sem HTTPS: recusado.' };
    const declared = Number(res.headers?.get?.('content-length') || 0);
    if (declared > WINAPP2_MAX) return { ok: false, error: 'Arquivo grande demais (limite de 16 MB).' };
    const buf = Buffer.from(await res.arrayBuffer());
    const v = validateWinapp2(buf);
    if (!v.ok) return v;
    fs.mkdirSync(this.dataDir, { recursive: true });
    const tmp = `${this.winapp2Path}.download`;
    fs.writeFileSync(tmp, buf);
    if (fs.existsSync(this.winapp2Path)) fs.copyFileSync(this.winapp2Path, `${this.winapp2Path}.bak`);
    fs.renameSync(tmp, this.winapp2Path);
    const meta = { version: v.version, sections: v.sections, bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), downloadedAt: new Date().toISOString(), url: WINAPP2_URL };
    fs.writeFileSync(this.metaPath, JSON.stringify(meta, null, 2));
    return { ok: true, ...meta };
  }

  removeDefinitions() {
    for (const f of [this.winapp2Path, this.metaPath, `${this.winapp2Path}.bak`]) { try { fs.unlinkSync(f); } catch { /* absent */ } }
    return { ok: true };
  }

  listTargets() { return this.run(['targets', ...this._winapp2Args()], { timeoutMs: 120000 }); }

  scan({ ids } = {}) {
    return this._exclusive('scan', false, () => this._withIds(ids, (f) => this.run(['scan', '--ids-file', f, ...this._winapp2Args(), '--sample', '40'], { timeoutMs: 600000 })));
  }

  /** Real deletion needs apply + confirm; otherwise it is the same simulation as scan. */
  clean({ ids, apply = false, confirm = false, shred = 0 } = {}) {
    const passes = Number(shred) || 0;
    if (!Number.isInteger(passes) || passes < 0 || passes > 7) throw new Error('Número de passagens inválido (0 a 7).');
    if (apply && confirm !== true) throw new Error('Confirme na tela antes de apagar.');
    const args = ['clean', ...this._winapp2Args(), '--sample', '40'];
    if (apply) args.push('--apply');
    if (apply && passes > 0) args.push('--shred', String(passes));
    return this._exclusive('clean', apply, () => this._withIds(ids, (f) => this.run([...args, '--ids-file', f], { timeoutMs: 1800000 })));
  }

  browsers({ browsers = [], apply = false, confirm = false } = {}) {
    if (apply && confirm !== true) throw new Error('Confirme na tela antes de compactar.');
    const list = (Array.isArray(browsers) ? browsers : []).map((b) => String(b).toLowerCase()).filter((b) => BROWSERS.includes(b));
    const args = ['browsers'];
    if (list.length) args.push('--browser', list.join(','));
    if (apply) args.push('--apply');
    return this._exclusive('browsers', apply, () => this.run(args, { timeoutMs: 600000 }));
  }

  /** Size of the Recycle Bin (all drives); `apply` empties it (permanent). Also used by the Optimizer's temp clean. */
  recycleBin({ apply = false } = {}) {
    return this._exclusive('recycle-bin', apply, () => this.run(['recycle-bin', ...(apply ? ['--apply'] : [])], { timeoutMs: 300000 }));
  }

  regScan() { return this.run(['reg-scan'], { timeoutMs: 120000 }); }

  /** Always writes a .reg restore file in the backup folder before the engine touches a key. */
  regClean({ ids, apply = false, confirm = false } = {}) {
    if (apply && confirm !== true) throw new Error('Confirme na tela antes de alterar o registro.');
    const args = ['reg-clean'];
    if (apply) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      args.push('--apply', '--backup', path.join(this.backupDir(), `registro-${stamp}.reg`));
    }
    return this._exclusive('registry', apply, () => this._withIds(ids, (f) => this.run([...args, '--ids-file', f], { timeoutMs: 120000 })));
  }

  listBackups() {
    let dir;
    try { dir = this.backupDir(); } catch (e) { return { ok: false, error: e.message }; }
    const items = fs.readdirSync(dir).filter((n) => /\.reg$/i.test(n)).map((name) => {
      const st = fs.statSync(path.join(dir, name));
      return { name, bytes: st.size, modified: st.mtime.toISOString() };
    }).sort((a, b) => b.modified.localeCompare(a.modified));
    return { ok: true, dir, backups: items };
  }

  /** `reg import` of one of our own backups (only a bare file name inside the backup folder is accepted). */
  restoreBackup({ name } = {}) {
    const n = String(name || '');
    if (!/^[\w.-]+\.reg$/i.test(n) || n !== path.basename(n)) throw new Error('Backup inválido.');
    const file = path.join(this.backupDir(), n);
    if (!fs.existsSync(file)) throw new Error('Backup não encontrado.');
    return new Promise((resolve) => {
      this.execFile('reg.exe', ['import', file], { windowsHide: true, timeout: 60000 }, (err, _out, stderr) => {
        if (err) resolve({ ok: false, error: String(stderr || err.message).trim() || 'Falha ao importar (execute como administrador para chaves de HKLM).' });
        else resolve({ ok: true, file });
      });
    });
  }
}

export default CleanerService;
