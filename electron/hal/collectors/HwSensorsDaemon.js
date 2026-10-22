import { EventEmitter } from 'node:events';
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import Logger from '../../services/LoggerService.js';

let electron = null;
try { electron = createRequire(import.meta.url)('electron'); } catch { electron = null; }

const here = path.dirname(fileURLToPath(import.meta.url)).replace(/app\.asar(?![.\w])/, 'app.asar.unpacked');
export const HWSENSORS_EXE = path.join(here, '..', '..', 'services', 'hwsensors', 'DarkHub.HwSensors.exe');

/** PawnIO registers a kernel service named PawnIO; its registry key exists once the driver is installed. */
let pawnCache = { at: 0, value: false };
export function isPawnIoInstalled(execFileSync = cp.execFileSync, maxAgeMs = 10000) {
  // reg.exe runs synchronously on the main thread: cached for a few seconds
  if (Date.now() - pawnCache.at < maxAgeMs) return pawnCache.value;
  let value = false;
  try {
    execFileSync('reg.exe', ['query', 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\PawnIO'], { stdio: 'ignore', windowsHide: true });
    value = true;
  } catch { value = false; }
  pawnCache = { at: Date.now(), value };
  return value;
}
export function forgetPawnIoCheck() { pawnCache = { at: 0, value: false }; }

/**
 * Advanced sensors (LibreHardwareMonitorLib) in a child process. Off by default; the choice is stored in
 * userData/hwsensors.json. Emits the parsed {"type":"lhm"} samples on 'data'.
 */
class HwSensorsDaemon extends EventEmitter {
  constructor() {
    super();
    this.process = null;
    this.buffer = '';
    this._stopped = true;
    this._restartDelay = 5000;
    this._failures = 0;
    this.lastSample = 0;
    this.lastError = null;
    this._settingsFile = null;
    try {
      const dir = electron?.app?.getPath?.('userData');
      if (dir) this._settingsFile = path.join(dir, 'hwsensors.json');
    } catch { this._settingsFile = null; }
  }

  get enabled() {
    try { return Boolean(this._settingsFile && JSON.parse(fs.readFileSync(this._settingsFile, 'utf8')).enabled); } catch { return false; }
  }

  set enabled(v) {
    if (!this._settingsFile) return;
    try { fs.writeFileSync(this._settingsFile, JSON.stringify({ enabled: Boolean(v) })); } catch (e) { Logger.warn('HwSensorsDaemon', 'could not save setting', e); }
  }

  status() {
    return {
      ok: true,
      enabled: this.enabled,
      available: fs.existsSync(HWSENSORS_EXE),
      running: Boolean(this.process),
      pawnio: isPawnIoInstalled(),
      lastSample: this.lastSample,
      error: this.lastError
    };
  }

  /** Starts only when the user turned advanced sensors on. */
  start() {
    if (this.process || !this.enabled) return;
    if (!fs.existsSync(HWSENSORS_EXE)) { this.lastError = 'DarkHub.HwSensors.exe não encontrado.'; return; }
    this._stopped = false;
    this.lastError = null;
    Logger.info('HwSensorsDaemon', 'Iniciando sensores avançados (LibreHardwareMonitorLib).');
    // stdin stays open: the helper exits by itself when DarkHub closes it (or dies).
    const child = cp.spawn(HWSENSORS_EXE, ['1000'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.process = child;
    child.stdout.on('data', (data) => {
      this.buffer += data.toString('utf8');
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop();
      for (const line of lines) {
        const clean = line.trim();
        if (!clean.startsWith('{')) continue;
        try {
          const payload = JSON.parse(clean);
          this.lastSample = Date.now();
          this._failures = 0;
          this.emit('data', payload);
        } catch { /* partial line */ }
      }
    });
    child.stderr.on('data', (d) => { const msg = d.toString('utf8').trim(); if (msg) { this.lastError = msg.slice(0, 300); Logger.warn('HwSensorsDaemon', msg); } });
    child.on('error', (err) => { this.lastError = err.message; Logger.error('HwSensorsDaemon', 'spawn failed', err); });
    child.on('close', () => {
      if (this.process !== child) return;
      this.process = null;
      this.buffer = '';
      if (this._stopped) return;
      // A helper that keeps crashing (e.g. missing .NET 4.7.2) is not restarted forever.
      if (++this._failures > 3) { this.lastError = this.lastError || 'Os sensores avançados pararam repetidamente.'; return; }
      setTimeout(() => { if (!this._stopped) this.start(); }, this._restartDelay);
    });
  }

  stop() {
    this._stopped = true;
    const child = this.process;
    this.process = null;
    this.buffer = '';
    if (child) {
      try { child.stdin.end(); } catch { /* gone */ }
      setTimeout(() => { try { child.kill(); } catch { /* gone */ } }, 1500);
    }
  }

  restart() { this.stop(); this._failures = 0; setTimeout(() => this.start(), 1600); }
}

export default new HwSensorsDaemon();
