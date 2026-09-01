import cp from 'node:child_process';
import { EventEmitter } from 'node:events';
import Logger from '../../services/LoggerService.js';

const QUERY_FIELDS = [
  'index',
  'name',
  'utilization.gpu',
  'temperature.gpu',
  'memory.used',
  'memory.total',
  'clocks.current.graphics',
  'clocks.current.memory',
  'power.draw',
  'fan.speed'
].join(',');

const FLUSH_DEBOUNCE_MS = 300;

class NvidiaDaemon extends EventEmitter {
  constructor() {
    super();
    this.process = null;
    this.buffer = '';

    this.available = null;
    this.intervalSec = 5;
    this._stopped = true;
    this._restarting = false;
    this._restartDelay = 15000;
    this._pending = [];
    this._flushTimer = null;
  }

  start() {

    if (this.process || this.available === false) return;
    this._stopped = false;

    const args = [
      `--query-gpu=${QUERY_FIELDS}`,
      '--format=csv,noheader,nounits',
      '-l',
      String(this.intervalSec)
    ];

    let child;
    try {
      child = cp.spawn('nvidia-smi', args, { windowsHide: true });
    } catch (err) {
      this.available = false;
      Logger.info('NvidiaDaemon', `nvidia-smi indisponível: ${err.message}`);
      return;
    }

    this.process = child;

    child.stdout.on('data', (data) => {
      this.buffer += data.toString('utf8');
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop();
      for (const line of lines) {
        const row = this._parseRow(line);
        if (row) this._pending.push(row);
      }
      this._scheduleFlush();
    });

    child.stderr.on('data', (data) => {
      const msg = data.toString('utf8').trim();
      if (msg) Logger.warn('NvidiaDaemon', `nvidia-smi stderr: ${msg}`);
    });

    child.on('error', (err) => {

      this.available = false;
      this.process = null;
      Logger.info('NvidiaDaemon', `nvidia-smi não disponível: ${err.message}`);
    });

    child.on('close', (code) => {
      this.process = null;
      this.buffer = '';
      if (this._stopped || this._restarting) return;

      if (this.available !== true) {
        this.available = false;
        Logger.info('NvidiaDaemon', `nvidia-smi encerrou sem dados (code=${code}). Desabilitando provider.`);
        return;
      }
      Logger.warn('NvidiaDaemon', `nvidia-smi encerrou. Reiniciando em ${this._restartDelay}ms...`);
      this._restarting = true;
      setTimeout(() => {
        this._restarting = false;
        if (!this._stopped) this.start();
      }, this._restartDelay);
    });
  }

  _parseRow(line) {
    const clean = String(line || '').trim();
    if (!clean) return null;
    const parts = clean.split(',').map(p => p.trim());
    if (parts.length < 10) return null;

    const num = (v) => {
      if (v === '[Not Supported]' || v === '[N/A]' || v === 'N/A' || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const index = num(parts[0]);
    if (index === null) return null;

    return {
      index,
      name: parts[1],
      utilization: num(parts[2]),
      temperature: num(parts[3]),
      vramUsed: num(parts[4]),
      vramTotal: num(parts[5]),
      clockCore: num(parts[6]),
      clockMemory: num(parts[7]),
      powerDraw: num(parts[8]),
      fanSpeed: num(parts[9])
    };
  }

  _scheduleFlush() {
    if (this._flushTimer) clearTimeout(this._flushTimer);
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      this._flush();
    }, FLUSH_DEBOUNCE_MS);
  }

  _flush() {
    if (this._pending.length === 0) return;
    const gpus = this._pending;
    this._pending = [];

    if (this.available !== true) {
      this.available = true;
      Logger.info('NvidiaDaemon', `nvidia-smi ativo: ${gpus.length} GPU(s) em streaming (${this.intervalSec}s)`);
    }
    this.emit('data', { type: 'nvidia', gpus });
  }

  stop() {
    this._stopped = true;
    this._restarting = false;
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
    this._pending = [];
    if (this.process) {
      try { this.process.kill(); } catch {}
      this.process = null;
    }
    this.buffer = '';
  }
}

export default new NvidiaDaemon();
