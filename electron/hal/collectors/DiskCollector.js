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

    SensorBus.on('data', (payload) => {
      if (payload.type !== 'diskIo') return;
      this.readBps = numOrNull(payload.readBps);
      this.writeBps = numOrNull(payload.writeBps);
      this.activity = numOrNull(payload.activity);
      this.lastUpdate = Date.now();
    });
  }

  poll() {
    const freshness = this._freshness(this.lastUpdate);
    return this._memo(`${this.lastUpdate}|${freshness}`, () => {
      if (freshness === 'disconnected') {
        return {
          status: 'Disconnected',
          timestamp: Date.now(),
          values: {
            readBps: createUnavailableSensor('B/s', 'wmi', 'Disconnected'),
            writeBps: createUnavailableSensor('B/s', 'wmi', 'Disconnected'),
            activity: createUnavailableSensor('%', 'wmi', 'Disconnected')
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

      return {
        status: 'OK',
        timestamp: Date.now(),
        values: {
          readBps: createSensor(this.readBps, 'B/s', 'pdh'),
          writeBps: createSensor(this.writeBps, 'B/s', 'pdh'),
          activity: createSensor(this.activity, '%', 'pdh')
        }
      };
    });
  }
}

export default new DiskCollector();
