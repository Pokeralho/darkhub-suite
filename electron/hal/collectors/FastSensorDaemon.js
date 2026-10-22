import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import Logger from '../../services/LoggerService.js';

// Packaged builds: Electron makes fs see inside app.asar, but a process cannot be started from there. The exe is
// unpacked (asarUnpack electron/services/*.exe), so it must be spawned from app.asar.unpacked.
const here = path.dirname(fileURLToPath(import.meta.url)).replace(/app\.asar(?![.\w])/, 'app.asar.unpacked');
export const SENSOR_DAEMON_EXE = path.join(here, '..', '..', 'services', 'DarkHub.SensorDaemon.exe');

/**
 * 1 s PDH sampler (disk, network, DPC/interrupts, GPU per adapter) in the native DarkHub.SensorDaemon.exe.
 * Counters that cannot be read come as null and are shown as unavailable, never as 0.
 * There is no PowerShell fallback: it duplicated the engine with less precise numbers.
 */
class FastSensorDaemon extends EventEmitter {
  constructor() {
    super();
    this.process = null;
    this.buffer = '';
    this._stopped = true;
    this._restartDelay = 5000;
    this._failures = 0;
  }

  start() {
    if (this.process) return;
    this._stopped = false;
    if (!fs.existsSync(SENSOR_DAEMON_EXE)) {
      Logger.error('FastSensorDaemon', `DarkHub.SensorDaemon.exe não encontrado em ${SENSOR_DAEMON_EXE}`);
      return;
    }
    const child = cp.spawn(SENSOR_DAEMON_EXE, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.process = child;

    child.stdout.on('data', (data) => {
      this._failures = 0;
      this.buffer += data.toString('utf8');
      const chunks = this.buffer.split('\n');
      this.buffer = chunks.pop();
      for (const chunk of chunks) {
        const clean = chunk.trim();
        if (!clean.startsWith('{')) continue;
        try { this.emit('data', JSON.parse(clean)); } catch { /* partial line */ }
      }
    });
    child.stderr.on('data', (data) => {
      const msg = data.toString('utf8').trim();
      if (msg) Logger.warn('FastSensorDaemon', msg);
    });
    child.on('error', (err) => Logger.error('FastSensorDaemon', 'Falha ao iniciar o daemon nativo', err));
    child.on('close', () => {
      // stop()+start() can spawn a new child before this one exits; never clobber the new one.
      if (this.process !== child) return;
      this.process = null;
      this.buffer = '';
      if (this._stopped) return;
      if (++this._failures > 5) { Logger.error('FastSensorDaemon', 'O daemon nativo parou repetidamente; sensores rápidos desativados.'); return; }
      Logger.warn('FastSensorDaemon', `Daemon encerrou. Reiniciando em ${this._restartDelay}ms...`);
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
      try { child.kill(); } catch { /* gone */ }
    }
  }
}

export default new FastSensorDaemon();
