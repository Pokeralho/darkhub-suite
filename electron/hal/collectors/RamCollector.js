import os from 'node:os';
import { createSensor } from '../models/SensorModel.js';
import Logger from '../../services/LoggerService.js';

class RamCollector {
  poll() {
    try {
      const total = os.totalmem();
      const free = os.freemem();
      const used = total - free;
      const percent = total === 0 ? 0 : Math.round((used / total) * 100);

      return {
        status: 'OK',
        timestamp: Date.now(),
        values: {
          total: createSensor(total, 'Bytes', 'node-os'),
          used: createSensor(used, 'Bytes', 'node-os'),
          free: createSensor(free, 'Bytes', 'node-os'),
          percent: createSensor(percent, '%', 'node-os')
        }
      };
    } catch (err) {
      Logger.warn('RamCollector', 'Erro ao processar V8 RAM', err);
      return { status: 'Error', timestamp: Date.now(), values: null, error: err.message };
    }
  }
}

export default new RamCollector();
