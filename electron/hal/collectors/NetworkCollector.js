import fs from 'node:fs';
import SensorBus from './SensorBus.js';
import { BaseCollector } from './BaseCollector.js';
import { createSensor, createUnavailableSensor, numOrNull } from '../models/SensorModel.js';

class NetworkCollector extends BaseCollector {
  constructor() {
    super();
    this.rxBps = 0;
    this.txBps = 0;
    this.lastUpdate = 0;
    this._linuxPrev = null;

    SensorBus.on('data', (payload) => {
      if (payload.type !== 'network') return;
      this.rxBps = numOrNull(payload.rxBps);
      this.txBps = numOrNull(payload.txBps);
      this.lastUpdate = Date.now();
    });
  }

  _pollLinux() {
    try {
      const text = fs.readFileSync('/proc/net/dev', 'utf8');
      let rx = 0, tx = 0;
      for (const line of text.split('\n').slice(2)) {
        const m = line.match(/^\s*([^:]+):\s*(.*)$/);
        if (!m) continue;
        const iface = m[1].trim();
        if (iface === 'lo') continue;
        const nums = m[2].trim().split(/\s+/).map(Number);
        if (nums.length < 16) continue;
        rx += nums[0] || 0; // rx bytes
        tx += nums[8] || 0; // tx bytes
      }
      const now = Date.now();
      if (this._linuxPrev) {
        const dt = (now - this._linuxPrev.t) / 1000;
        if (dt > 0.2) {
          this.rxBps = Math.max(0, (rx - this._linuxPrev.rx) / dt);
          this.txBps = Math.max(0, (tx - this._linuxPrev.tx) / dt);
          this.lastUpdate = now;
        }
      }
      this._linuxPrev = { rx, tx, t: now };
    } catch {}
  }

  poll() {
    if (process.platform === 'linux') this._pollLinux();
    const freshness = process.platform === 'linux' ? (this.lastUpdate ? 'ok' : 'disconnected') : this._freshness(this.lastUpdate);
    return this._memo(`${this.lastUpdate}|${freshness}`, () => {
      if (freshness === 'disconnected') {
        return {
          status: 'Disconnected',
          timestamp: Date.now(),
          values: {
            rxBps: createUnavailableSensor('B/s', process.platform === 'linux' ? 'proc' : 'wmi', 'Disconnected'),
            txBps: createUnavailableSensor('B/s', process.platform === 'linux' ? 'proc' : 'wmi', 'Disconnected')
          }
        };
      }

      if (freshness === 'dead') {
        return {
          status: 'Error',
          timestamp: Date.now(),
          values: null,
          error: 'Daemon WMI não está respondendo (rede)'
        };
      }

      const src = process.platform === 'linux' ? 'proc' : 'pdh';
      return {
        status: 'OK',
        timestamp: Date.now(),
        values: {
          rxBps: createSensor(this.rxBps, 'B/s', src),
          txBps: createSensor(this.txBps, 'B/s', src)
        }
      };
    });
  }
}

export default new NetworkCollector();
