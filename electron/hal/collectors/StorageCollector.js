import SensorBus from './SensorBus.js';
import { BaseCollector } from './BaseCollector.js';

const STORAGE_STALE_MS = 120000;

class StorageCollector extends BaseCollector {
  constructor() {
    super();
    this.disks = [];
    this.lastUpdate = 0;

    SensorBus.on('data', (payload) => {
      if (payload.type !== 'storage') return;
      this.disks = Array.isArray(payload.disks) ? payload.disks : [];
      this.lastUpdate = Date.now();
    });
  }

  poll() {
    const freshness = this._freshness(this.lastUpdate, STORAGE_STALE_MS);
    return this._memo(`${this.lastUpdate}|${freshness}`, () => {
      if (freshness === 'disconnected') {
        return { status: 'Disconnected', timestamp: Date.now(), values: { disks: [] } };
      }

      if (freshness === 'dead') {
        return {
          status: 'Error',
          timestamp: Date.now(),
          values: null,
          error: 'Daemon WMI não está respondendo (armazenamento)'
        };
      }

      return {
        status: 'OK',
        timestamp: Date.now(),
        values: {
          disks: this.disks.map(d => ({
            fs: d.fs,
            type: d.type,
            size: Number(d.size) || 0,
            used: Number(d.used) || 0,
            use: Number(d.use) || 0,
            mount: d.mount
          }))
        }
      };
    });
  }
}

export default new StorageCollector();
