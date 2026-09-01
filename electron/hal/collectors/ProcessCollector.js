import SensorBus from './SensorBus.js';
import { BaseCollector } from './BaseCollector.js';

const PROCS_STALE_MS = 30000;

class ProcessCollector extends BaseCollector {
  constructor() {
    super();
    this.all = 0;
    this.topCpu = [];
    this.topMem = [];
    this.lastUpdate = 0;

    SensorBus.on('data', (payload) => {
      if (payload.type !== 'procs') return;
      this.all = Number(payload.all) || 0;
      this.topCpu = Array.isArray(payload.topCpu) ? payload.topCpu : [];
      this.topMem = Array.isArray(payload.topMem) ? payload.topMem : [];
      this.lastUpdate = Date.now();
    });
  }

  poll() {
    const freshness = this._freshness(this.lastUpdate, PROCS_STALE_MS);
    return this._memo(`${this.lastUpdate}|${freshness}`, () => {
      if (freshness === 'disconnected') {
        return {
          status: 'Disconnected',
          timestamp: Date.now(),
          values: { all: 0, running: 0, topCpu: [], topMem: [] }
        };
      }

      if (freshness === 'dead') {
        return {
          status: 'Error',
          timestamp: Date.now(),
          values: null,
          error: 'Daemon WMI não está respondendo (processos)'
        };
      }

      const normalize = (list) => list.map(p => ({
        name: p.name,
        pid: p.pid,
        cpu: Number(p.cpu) || 0,
        memRss: Number(p.memRss) || 0,
        user: p.user ?? null
      }));

      return {
        status: 'OK',
        timestamp: Date.now(),
        values: {
          all: this.all,

          running: this.all,
          topCpu: normalize(this.topCpu),
          topMem: normalize(this.topMem)
        }
      };
    });
  }
}

export default new ProcessCollector();
