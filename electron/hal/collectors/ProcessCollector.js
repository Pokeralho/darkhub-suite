import fs from 'node:fs';
import os from 'node:os';
import { execSync } from 'node:child_process';
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
    this._linuxPrev = null;
    this._pageSize = 4096;
    this._clkTck = 100;
    this._memTotal = 0;

    if (process.platform === 'linux') {
      try {
        this._pageSize = Number(execSync('getconf PAGESIZE', { encoding: 'utf8' }).trim()) || 4096;
        this._clkTck = Number(execSync('getconf CLK_TCK', { encoding: 'utf8' }).trim()) || 100;
      } catch {}
      try {
        const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
        const m = meminfo.match(/^MemTotal:\s+(\d+)\s+kB/m);
        this._memTotal = m ? Number(m[1]) * 1024 : 0;
      } catch {}
    }

    SensorBus.on('data', (payload) => {
      if (payload.type !== 'procs') return;
      this.all = Number(payload.all) || 0;
      this.topCpu = Array.isArray(payload.topCpu) ? payload.topCpu : [];
      this.topMem = Array.isArray(payload.topMem) ? payload.topMem : [];
      this.lastUpdate = Date.now();
    });
  }

  _pollLinux() {
    try {
      const pids = fs.readdirSync('/proc').filter((n) => /^\d+$/.test(n));
      const now = Date.now();
      const prev = this._linuxPrev || { procs: new Map(), t: now };
      const dt = Math.max(0.001, (now - prev.t) / 1000);
      const procs = new Map();
      const list = [];
      for (const pidStr of pids) {
        let stat, comm, rssPages;
        try {
          stat = fs.readFileSync(`/proc/${pidStr}/stat`, 'utf8');
          const end = stat.lastIndexOf(')');
          comm = stat.slice(stat.indexOf('(') + 1, end);
          const rest = stat.slice(end + 2).trim().split(/\s+/);
          // rest[0]=state, [11]=utime(14th), [12]=stime(15th), [21]=rss(24th)
          const utime = Number(rest[11]) || 0;
          const stime = Number(rest[12]) || 0;
          rssPages = Number(rest[21]) || 0;
          const totalTime = utime + stime;
          const pPrev = prev.procs.get(pidStr);
          let cpu = 0;
          if (pPrev && pPrev.totalTime != null) {
            cpu = ((totalTime - pPrev.totalTime) / (this._clkTck * dt)) * 100;
          }
          procs.set(pidStr, { totalTime });
          const memRss = rssPages * this._pageSize;
          const mem = this._memTotal ? (memRss / this._memTotal) * 100 : 0;
          list.push({ name: comm, pid: Number(pidStr), cpu: Math.max(0, cpu), memRss, mem });
        } catch {}
      }
      const nCores = os.cpus()?.length || 1;
      list.forEach((p) => { p.cpu = Math.min(100 * nCores, Math.max(0, p.cpu)); });
      this.all = list.length;
      this.topCpu = [...list].sort((a, b) => b.cpu - a.cpu).slice(0, 10).map(({ name, pid, cpu, memRss }) => ({ name, pid, cpu, memRss, user: null }));
      this.topMem = [...list].sort((a, b) => b.memRss - a.memRss).slice(0, 10).map(({ name, pid, cpu, memRss }) => ({ name, pid, cpu, memRss, user: null }));
      this._linuxPrev = { procs, t: now };
      this.lastUpdate = now;
    } catch {}
  }

  poll() {
    if (process.platform === 'linux') this._pollLinux();
    const freshness = process.platform === 'linux' ? (this.lastUpdate ? 'ok' : 'disconnected') : this._freshness(this.lastUpdate, PROCS_STALE_MS);
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
          topCpu: normalize(this.topCpu),
          topMem: normalize(this.topMem)
        }
      };
    });
  }
}

export default new ProcessCollector();
