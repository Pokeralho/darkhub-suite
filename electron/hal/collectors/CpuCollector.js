import os from 'node:os';
import { createSensor } from '../models/SensorModel.js';
import Logger from '../../services/LoggerService.js';

class CpuCollector {
  constructor() {
    this.lastCpu = null;
    this.lastCores = null;
  }

  poll() {
    try {
      const cpus = os.cpus();
      if (!cpus || cpus.length === 0) throw new Error('No CPUs found');

      let idle = 0;
      let total = 0;
      const coresData = [];

      for (let i = 0; i < cpus.length; i++) {
        const cpu = cpus[i];
        let coreTotal = 0;
        for (const type in cpu.times) {
          coreTotal += cpu.times[type];
        }
        const coreIdle = cpu.times.idle;

        total += coreTotal;
        idle += coreIdle;
        coresData.push({ idle: coreIdle, total: coreTotal });
      }

      let currentLoad = 0;
      const coresLoad = [];

      if (this.lastCpu && this.lastCores && this.lastCores.length === cpus.length) {
        const idleDiff = idle - this.lastCpu.idle;
        const totalDiff = total - this.lastCpu.total;
        currentLoad = totalDiff === 0 ? 0 : 100 - ((100 * idleDiff) / totalDiff);

        for (let i = 0; i < cpus.length; i++) {
          const coreIdleDiff = coresData[i].idle - this.lastCores[i].idle;
          const coreTotalDiff = coresData[i].total - this.lastCores[i].total;
          const coreLoad = coreTotalDiff === 0 ? 0 : 100 - ((100 * coreIdleDiff) / coreTotalDiff);
          coresLoad.push(coreLoad);
        }
      } else {
        coresData.forEach(() => coresLoad.push(0));
      }

      this.lastCpu = { idle, total };
      this.lastCores = coresData;

      return {
        status: 'OK',
        timestamp: Date.now(),
        values: {
          currentLoad: createSensor(Math.max(0, Math.min(100, currentLoad)), '%', 'node-os'),
          coresLoad: coresLoad.map(l => createSensor(Math.max(0, Math.min(100, l)), '%', 'node-os'))
        }
      };
    } catch (err) {
      Logger.warn('CpuCollector', 'Erro ao processar V8 CPU', err);
      return { status: 'Error', timestamp: Date.now(), values: null, error: err.message };
    }
  }
}

export default new CpuCollector();
