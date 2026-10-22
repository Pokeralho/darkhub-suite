import { EventEmitter } from 'node:events';
import FastSensorDaemon from './FastSensorDaemon.js';
import SlowSensorDaemon from './SlowSensorDaemon.js';
import HwSensorsDaemon from './HwSensorsDaemon.js';

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
    HwSensorsDaemon.on('data', forward);
  }

  start() {
    this._wire();
    if (this._running) return;
    this._running = true;
    FastSensorDaemon.start();
    SlowSensorDaemon.withTemps = !HwSensorsDaemon.enabled;
    SlowSensorDaemon.start();
    HwSensorsDaemon.start(); // no-op unless the user turned advanced sensors on
  }

  stop() {
    if (!this._running) return;
    this._running = false;
    FastSensorDaemon.stop();
    SlowSensorDaemon.stop();
    HwSensorsDaemon.stop();
  }

  /** Advanced sensors on: they replace the WMI / ACPI / storage-reliability temperature queries of the slow daemon. */
  setAdvanced(on) {
    HwSensorsDaemon.enabled = on;
    if (on) HwSensorsDaemon.restart(); else HwSensorsDaemon.stop();
    const withTemps = !on;
    if (SlowSensorDaemon.withTemps !== withTemps) {
      SlowSensorDaemon.withTemps = withTemps;
      if (this._running) { SlowSensorDaemon.stop(); SlowSensorDaemon.start(); }
    }
  }

  get running() {
    return this._running;
  }
}

export default new SensorBus();
