import SensorBus from './SensorBus.js';
import { BaseCollector } from './BaseCollector.js';
import { createSensor, createUnavailableSensor, numOrNull } from '../models/SensorModel.js';

class NetworkCollector extends BaseCollector {
  constructor() {
    super();
    this.rxBps = 0;
    this.txBps = 0;
    this.lastUpdate = 0;

    SensorBus.on('data', (payload) => {
      if (payload.type !== 'network') return;
      this.rxBps = numOrNull(payload.rxBps);
      this.txBps = numOrNull(payload.txBps);
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
            rxBps: createUnavailableSensor('B/s', 'wmi', 'Disconnected'),
            txBps: createUnavailableSensor('B/s', 'wmi', 'Disconnected')
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

      return {
        status: 'OK',
        timestamp: Date.now(),
        values: {
          rxBps: createSensor(this.rxBps, 'B/s', 'pdh'),
          txBps: createSensor(this.txBps, 'B/s', 'pdh')
        }
      };
    });
  }
}

export default new NetworkCollector();
