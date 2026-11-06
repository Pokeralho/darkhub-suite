// "Disk Studio & Rescue": drives DarkHub.DiskRescue.exe (native_disk/, Rust). Short commands return one JSON
// object; long ones (clone, carve, surface test...) stream NDJSON events. One long job at a time; cancelling
// writes "cancel" to the engine's stdin so it stops between chunks and leaves the destination consistent.
import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runPowerShell } from '../PowerShellRunner.js';

function defaultExe() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here.replace(/app\.asar(?![.\w])/, 'app.asar.unpacked'), '..', 'DarkHub.DiskRescue.exe');
}

/** A disk ("disk:N") or an absolute path to an image file. Anything else is refused before reaching the engine. */
export function normalizeTarget(t) {
  const s = String(t ?? '').trim();
  const m = /^(?:disk:|\\\\\.\\physicaldrive)(\d{1,2})$/i.exec(s);
  if (m) return `disk:${Number(m[1])}`;
  if (s && path.isAbsolute(s) && !s.startsWith('-') && !/[\r\n"]/.test(s)) return s;
  throw new Error('Alvo inválido: escolha um disco ou um arquivo de imagem.');
}

export const diskNumberOf = (target) => {
  const m = /^disk:(\d+)$/.exec(target);
  return m ? Number(m[1]) : null;
};

const int = (v, name, { min = -Infinity, max = Infinity } = {}) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} inválido.`);
  return n;
};

/** Splits a stdout chunk stream into JSON lines; non-JSON lines are ignored. */
export function createLineParser(onObject) {
  let pending = '';
  return {
    push(chunk) {
      const lines = (pending + chunk).split('\n');
      pending = lines.pop() ?? '';
      for (const l of lines) parseLine(l);
    },
    end() { if (pending) parseLine(pending); pending = ''; }
  };
  function parseLine(line) {
    const t = line.trim();
    if (!t.startsWith('{')) return;
    try { onObject(JSON.parse(t)); } catch { /* partial or foreign output */ }
  }
}

export const CARVE_TYPES = ['jpg', 'png', 'gif', 'bmp', 'pdf', 'zip', 'docx', 'xlsx', 'pptx', 'sqlite', '7z', 'mp4', 'mov', 'heic'];

export class DiskRecoveryService {
  constructor({ exePath = defaultExe(), backupDir = null, spawnImpl = spawn, execFileImpl = execFile, powershell = runPowerShell } = {}) {
    this.exePath = exePath;
    this.backupDir = backupDir;
    this.spawn = spawnImpl;
    this.execFile = execFileImpl;
    this.powershell = powershell;
    this.job = null; // { kind, proc, startedAt }
  }

  available() {
    return fs.existsSync(this.exePath);
  }

  _missing() {
    return { ok: false, code: 'missing_engine', error: 'DarkHub.DiskRescue.exe não foi encontrado (rode npm run build:disk).' };
  }

  /** Runs a short command and returns its JSON. */
  run(args, { timeoutMs = 60000 } = {}) {
    if (!this.available()) return Promise.resolve(this._missing());
    return new Promise((resolve) => {
      this.execFile(this.exePath, args, { windowsHide: true, timeout: timeoutMs, maxBuffer: 64 << 20 }, (err, stdout, stderr) => {
        let last = null;
        const p = createLineParser((o) => { last = o; });
        p.push(String(stdout || '')); p.end();
        if (last) return resolve(last);
        resolve({ ok: false, code: err?.killed ? 'timeout' : 'engine_error', error: String(stderr || err?.message || 'O motor não respondeu.').trim() });
      });
    });
  }

  /** Starts a long command. Events go to `onEvent`; the promise resolves with the final ("done") object. */
  stream(kind, args, onEvent = () => {}) {
    if (!this.available()) return Promise.resolve(this._missing());
    if (this.job) return Promise.resolve({ ok: false, code: 'busy', error: `Já existe uma operação em andamento (${this.job.kind}).` });
    return new Promise((resolve) => {
      const proc = this.spawn(this.exePath, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      const job = { kind, proc, startedAt: Date.now(), cancelTimer: null };
      this.job = job;
      let done = null;
      let stderr = '';
      const parser = createLineParser((o) => {
        if (o.event === 'done') done = o;
        else { try { onEvent({ kind, ...o }); } catch { /* window gone */ } }
      });
      proc.stdout.setEncoding('utf8');
      proc.stdout.on('data', (c) => parser.push(c));
      proc.stderr.on('data', (d) => { stderr += d; });
      const finish = (result) => {
        if (job.cancelTimer) clearTimeout(job.cancelTimer);
        if (this.job === job) this.job = null;
        resolve(result);
      };
      proc.on('error', (e) => finish({ ok: false, code: 'engine_error', error: e.message }));
      proc.on('close', (code) => {
        parser.end();
        if (done) return finish({ ...done, warnings: stderr.trim() ? stderr.trim().split(/\r?\n/) : undefined });
        finish({ ok: false, code: code === null ? 'killed' : 'engine_error', error: stderr.trim() || `O motor terminou com código ${code}.` });
      });
    });
  }

  /** Holds the job slot for work that runs elsewhere (partitioning), so no clone or carve starts meanwhile. */
  reserve(kind) {
    if (this.job) return false;
    this.job = { kind, proc: null, startedAt: Date.now(), cancelTimer: null };
    return true;
  }

  release(kind) {
    if (this.job?.kind === kind && !this.job.proc) this.job = null;
  }

  status() {
    return { ok: true, running: !!this.job, kind: this.job?.kind ?? null, startedAt: this.job?.startedAt ?? null };
  }

  /** Asks the engine to stop between chunks; kills it if it does not stop within 15 s. */
  cancel() {
    const job = this.job;
    if (!job) return { ok: true, running: false };
    if (!job.proc) return { ok: true, running: true };
    try { job.proc.stdin.write('cancel\n'); } catch { /* stdin closed */ }
    if (!job.cancelTimer) job.cancelTimer = setTimeout(() => { try { job.proc.kill(); } catch { /* gone */ } }, 15000);
    return { ok: true, running: true };
  }

  _backupPath(target, tag) {
    const dir = this.backupDir || path.join(process.env.ProgramData || 'C:\\ProgramData', 'DarkHub', 'DiskRescue', 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const n = diskNumberOf(target);
    const name = n !== null ? `disco${n}` : path.basename(target).replace(/[^\w.-]/g, '_');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(dir, `${name}-${tag}-${stamp}.dhbk`);
  }

  /** Common flags for anything that may write: dry-run unless explicitly applied, plus the disk confirmation. */
  _writeFlags(target, { apply = false, confirmDisk } = {}, tag = 'backup') {
    if (!apply) return ['--dry-run'];
    const args = ['--backup', this._backupPath(target, tag)];
    const n = diskNumberOf(target);
    if (n !== null) {
      if (confirmDisk === undefined || confirmDisk === null || Number(confirmDisk) !== n) throw new Error(`Confirme digitando o número do disco (${n}).`);
      args.push('--confirm-disk', String(n));
    }
    return args;
  }

  listDrives() { return this.run(['list-drives'], { timeoutMs: 30000 }); }

  inspectDisk({ target }) { return this.run(['inspect', normalizeTarget(target)]); }

  readSector({ target, lba = 0, count = 1 }) {
    return this.run(['read-sector', normalizeTarget(target), '--lba', String(int(lba, 'LBA')), '--count', String(int(count, 'Quantidade', { min: 1, max: 64 }))]);
  }

  writeSector({ target, lba, hex, apply, confirmDisk }) {
    const t = normalizeTarget(target);
    const data = String(hex || '').replace(/\s+/g, '');
    if (!/^[0-9a-fA-F]+$/.test(data)) throw new Error('Dados em hexadecimal inválidos.');
    return this.run(['write-sector', t, '--lba', String(int(lba, 'LBA', { min: 0 })), '--hex', data, ...this._writeFlags(t, { apply, confirmDisk }, 'setor')]);
  }

  /** mode 'gpt' restores a GPT copy from the other one; 'mbr' scans for boot sectors and rebuilds the MBR. */
  repairHeader({ target, mode = 'gpt', gptMode = 'auto', active = false, apply, confirmDisk }, onEvent) {
    const t = normalizeTarget(target);
    if (mode === 'gpt') {
      if (!['auto', 'primary', 'backup'].includes(gptMode)) throw new Error('Modo de GPT inválido.');
      return this.run(['restore-gpt', t, '--mode', gptMode, ...this._writeFlags(t, { apply, confirmDisk }, 'gpt')]);
    }
    if (mode === 'mbr') return this.stream('repair', ['rebuild-mbr', t, ...(active ? ['--active'] : []), ...this._writeFlags(t, { apply, confirmDisk }, 'mbr')], onEvent);
    if (mode === 'scan') return this.stream('scan', ['scan-vbr', t], onEvent);
    throw new Error('Modo de reparo inválido.');
  }

  setActive({ target, slot, apply, confirmDisk }) {
    const t = normalizeTarget(target);
    return this.run(['set-active', t, '--slot', String(int(slot, 'Partição', { min: 1, max: 4 })), ...this._writeFlags(t, { apply, confirmDisk }, 'ativa')]);
  }

  backupTable({ target, out }) {
    const t = normalizeTarget(target);
    const file = out ? normalizeTarget(out) : this._backupPath(t, 'tabela');
    return this.run(['backup-table', t, '--out', file]);
  }

  restoreBackup({ target, from, apply, confirmDisk }) {
    const t = normalizeTarget(target);
    return this.run(['restore-backup', t, '--from', normalizeTarget(from), ...this._writeFlags(t, { apply, confirmDisk }, 'antes-de-restaurar')]);
  }

  /**
   * Disk/partition → disk/partition, or → new image file (`createImage`), or image → disk (`source` is a file).
   * `apply: false` only validates sizes and returns what would be copied.
   */
  clone({ source, target, sourcePart, targetPart, createImage = false, overwrite = false, verify = true, apply, confirmDisk }, onEvent) {
    const s = normalizeTarget(source);
    const t = normalizeTarget(target);
    if (s === t) throw new Error('Origem e destino são o mesmo.');
    const args = ['clone', '--source', s, '--target', t];
    if (sourcePart != null) args.push('--source-part', String(int(sourcePart, 'Partição de origem', { min: 1, max: 128 })));
    if (targetPart != null) args.push('--target-part', String(int(targetPart, 'Partição de destino', { min: 1, max: 128 })));
    if (createImage) { args.push('--create'); if (overwrite) args.push('--overwrite'); }
    if (verify) args.push('--verify');
    if (!apply) return this.run([...args, '--dry-run']);
    const n = diskNumberOf(t);
    if (n !== null) {
      if (Number(confirmDisk) !== n) throw new Error(`Confirme digitando o número do disco de destino (${n}).`);
      args.push('--confirm-disk', String(n));
    }
    return this.stream('clone', args, onEvent);
  }

  verify({ source, target, sourcePart, targetPart }, onEvent) {
    const args = ['verify', '--source', normalizeTarget(source), '--target', normalizeTarget(target)];
    if (sourcePart != null) args.push('--source-part', String(int(sourcePart, 'Partição', { min: 1 })));
    if (targetPart != null) args.push('--target-part', String(int(targetPart, 'Partição', { min: 1 })));
    return this.stream('verify', args, onEvent);
  }

  surfaceTest({ target, part }, onEvent) {
    const args = ['surface-test', normalizeTarget(target)];
    if (part != null) args.push('--part', String(int(part, 'Partição', { min: 1 })));
    return this.stream('surface', args, onEvent);
  }

  startCarving({ target, out, types = [], maxMb, startLba, endLba }, onEvent) {
    const t = normalizeTarget(target);
    const o = normalizeTarget(out);
    const list = (Array.isArray(types) ? types : []).map((x) => String(x).toLowerCase()).filter((x) => CARVE_TYPES.includes(x));
    const args = ['carve', t, '--out', o];
    if (list.length) args.push('--types', list.join(','));
    if (maxMb != null) args.push('--max-mb', String(int(maxMb, 'Tamanho máximo', { min: 1, max: 65536 })));
    if (startLba != null) args.push('--start-lba', String(int(startLba, 'LBA inicial', { min: 0 })));
    if (endLba != null) args.push('--end-lba', String(int(endLba, 'LBA final', { min: 1 })));
    return this.stream('carve', args, onEvent);
  }

  /** SMART / reliability counters through the Storage module (works for SATA and NVMe). Read-only. */
  async smart() {
    const script = `
$ErrorActionPreference = 'SilentlyContinue'
@(Get-PhysicalDisk | Sort-Object { [int]$_.DeviceId } | ForEach-Object {
  $r = $_ | Get-StorageReliabilityCounter
  [pscustomobject]@{
    number = [int]$_.DeviceId; model = $_.FriendlyName; health = [string]$_.HealthStatus
    operational = (@($_.OperationalStatus) -join ', '); mediaType = [string]$_.MediaType; bus = [string]$_.BusType
    temperature = $r.Temperature; temperatureMax = $r.TemperatureMax; wear = $r.Wear; powerOnHours = $r.PowerOnHours
    readErrorsTotal = $r.ReadErrorsTotal; readErrorsUncorrected = $r.ReadErrorsUncorrected
    writeErrorsTotal = $r.WriteErrorsTotal; writeErrorsUncorrected = $r.WriteErrorsUncorrected
    startStopCycles = $r.StartStopCycleCount; loadUnloadCycles = $r.LoadUnloadCycleCount
  }
}) | ConvertTo-Json -Compress -Depth 3`;
    const r = await this.powershell(script, { timeoutMs: 45000, trim: true });
    try {
      const j = JSON.parse(r.stdout || '[]');
      return { ok: true, disks: Array.isArray(j) ? j : [j] };
    } catch {
      return { ok: false, error: (r.stderr || 'Não foi possível ler o SMART.').trim() };
    }
  }
}

export default DiskRecoveryService;
