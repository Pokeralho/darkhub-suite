import fs from 'node:fs';
import SensorBus from './SensorBus.js';
import { BaseCollector } from './BaseCollector.js';
import { createSensor, createUnavailableSensor, numOrNull } from '../models/SensorModel.js';

class DiskCollector extends BaseCollector {
  constructor() {
    super();
    this.readBps = 0;
    this.writeBps = 0;
    this.activity = 0;
    this.lastUpdate = 0;
    this._linuxPrev = null;

    SensorBus.on('data', (payload) => {
      if (payload.type !== 'diskIo') return;
      this.readBps = numOrNull(payload.readBps);
      this.writeBps = numOrNull(payload.writeBps);
      this.activity = numOrNull(payload.activity);
      this.lastUpdate = Date.now();
    });
  }

  _pollLinux() {
    try {
      const text = fs.readFileSync('/proc/diskstats', 'utf8');
      let rSec = 0, wSec = 0, ioMs = 0;
      for (const line of text.split('\n')) {
        const p = line.trim().split(/\s+/);
        if (p.length < 14) continue;
        const name = p[2];
        // whole disks only (skip partitions/loop/ram)
        if (/^(loop|ram|zram)/.test(name)) continue;
        if (/\d$/.test(name) && !/^nvme\d+n\d+$/.test(name) && !/^mmcblk\d+$/.test(name)) continue;
        rSec += Number(p[5]) || 0;  // sectors read
        wSec += Number(p[9]) || 0;  // sectors written
        ioMs += Number(p[12]) || 0; // time spent doing I/Os (ms)
      }
      const now = Date.now();
      if (this._linuxPrev) {
        const dt = (now - this._linuxPrev.t) / 1000;
        if (dt > 0.2) {
          this.readBps = Math.max(0, (rSec - this._linuxPrev.rSec) * 512 / dt);
          this.writeBps = Math.max(0, (wSec - this._linuxPrev.wSec) * 512 / dt);
          const dio = Math.max(0, ioMs - this._linuxPrev.ioMs);
          this.activity = Math.max(0, Math.min(100, (dio / (dt * 1000)) * 100));
          this.lastUpdate = now;
        }
      }
      this._linuxPrev = { rSec, wSec, ioMs, t: now };
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
            readBps: createUnavailableSensor('B/s', process.platform === 'linux' ? 'proc' : 'wmi', 'Disconnected'),
            writeBps: createUnavailableSensor('B/s', process.platform === 'linux' ? 'proc' : 'wmi', 'Disconnected'),
            activity: createUnavailableSensor('%', process.platform === 'linux' ? 'proc' : 'wmi', 'Disconnected')
          }
        };
      }

      if (freshness === 'dead') {
        return {
          status: 'Error',
          timestamp: Date.now(),
          values: null,
          error: 'Daemon WMI não está respondendo'
        };
      }

      const src = process.platform === 'linux' ? 'proc' : 'pdh';
      return {
        status: 'OK',
        timestamp: Date.now(),
        values: {
          readBps: createSensor(this.readBps, 'B/s', src),
          writeBps: createSensor(this.writeBps, 'B/s', src),
          activity: createSensor(this.activity, '%', src)
        }
      };
    });
  }
}

export default new DiskCollector();
