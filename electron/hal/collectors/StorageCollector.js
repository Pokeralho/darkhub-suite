import fs from 'node:fs';
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

  _pollLinux() {
    try {
      const mounts = fs.readFileSync('/proc/mounts', 'utf8').split('\n');
      const seen = new Set();
      const disks = [];
      const skipFs = new Set(['tmpfs','devtmpfs','proc','sysfs','cgroup','cgroup2','pstore','bpf','tracefs','debugfs','hugetlbfs','mqueue','devpts','securityfs','efivarfs','autofs','fusectl','configfs','ramfs','rpc_pipefs','binfmt_misc','nsfs','overlay','squashfs']);
      for (const line of mounts) {
        const parts = line.split(' ');
        if (parts.length < 3) continue;
        const [dev, mount, type] = parts;
        if (!dev.startsWith('/dev/')) continue;
        if (skipFs.has(type)) continue;
        if (/^\/dev\/(loop|ram|zram)/.test(dev)) continue;
        if (seen.has(mount)) continue;
        seen.add(mount);
        try {
          const st = fs.statfsSync(mount);
          const bsize = st.bsize || st.frsize || 4096;
          const size = bsize * st.blocks;
          const free = bsize * (st.bavail ?? st.bfree);
          if (size <= 0) continue;
          const used = Math.max(0, size - bsize * st.bfree);
          disks.push({ fs: mount, type, size, used, use: Math.round((used / size) * 1000) / 10, mount });
        } catch {}
      }
      if (disks.length) {
        this.disks = disks;
        this.lastUpdate = Date.now();
      }
    } catch {}
  }

  poll() {
    if (process.platform === 'linux') this._pollLinux();
    const freshness = process.platform === 'linux' && this.lastUpdate ? 'ok' : this._freshness(this.lastUpdate, STORAGE_STALE_MS);
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
