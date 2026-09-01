import { EventEmitter } from 'node:events';
import FastSensorDaemon from './FastSensorDaemon.js';
import SlowSensorDaemon from './SlowSensorDaemon.js';

class SensorBus extends EventEmitter {
  constructor() {
    super();

    this.setMaxListeners(0);
    this._wired = false;
    this._running = false;
  }

  _wire() {
    if (this._wired) return;
    this._wired = true;
    const forward = (payload) => this.emit('data', payload);
    FastSensorDaemon.on('data', forward);
    SlowSensorDaemon.on('data', forward);
  }

  start() {
    this._wire();
    if (this._running) return;
    this._running = true;
    FastSensorDaemon.start();
    SlowSensorDaemon.start();
  }

  stop() {
    if (!this._running) return;
    this._running = false;
    FastSensorDaemon.stop();
    SlowSensorDaemon.stop();
  }

  get running() {
    return this._running;
  }
}

export default new SensorBus();
