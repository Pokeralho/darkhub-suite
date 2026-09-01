import SensorBus from './SensorBus.js';
import { BaseCollector } from './BaseCollector.js';
import { createSensor, createUnavailableSensor } from '../models/SensorModel.js';

class DiskCollector extends BaseCollector {
  constructor() {
    super();
    this.readBps = 0;
    this.writeBps = 0;
    this.activity = 0;
    this.lastUpdate = 0;

    SensorBus.on('data', (payload) => {
      if (payload.type !== 'diskIo') return;
      this.readBps = Number(payload.readBps) || 0;
      this.writeBps = Number(payload.writeBps) || 0;
      this.activity = Number(payload.activity) || 0;
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
          readBps: createSensor(this.readBps, 'B/s', 'wmi'),
          writeBps: createSensor(this.writeBps, 'B/s', 'wmi'),
          activity: createSensor(this.activity, '%', 'wmi')
        }
      };
    });
  }
}

export default new DiskCollector();
