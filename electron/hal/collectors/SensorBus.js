import { EventEmitter } from 'node:events';
import FastSensorDaemon from './FastSensorDaemon.js';
import SlowSensorDaemon from './SlowSensorDaemon.js';
import HwSensorsDaemon, { isPawnIoInstalled } from './HwSensorsDaemon.js';

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
    // Começa com as temperaturas WMI/ACPI ligadas (lado seguro) e só as troca pelos sensores avançados
    // quando eles realmente leem a CPU (driver PawnIO + app como administrador).
    SlowSensorDaemon.withTemps = true;
    SlowSensorDaemon.start();
    HwSensorsDaemon.start(); // on by default; no-op if the user turned advanced sensors off
    this._applyTempSource().catch(() => { /* mantém WMI/ACPI */ });
  }

  /**
   * Os sensores avançados substituem as temperaturas WMI/ACPI do daemon lento só quando conseguem ler a CPU:
   * sem o driver PawnIO, ou sem o DarkHub como administrador, eles leem apenas GPU e discos, e desligar o WMI
   * faria a temperatura da CPU sumir.
   */
  async _applyTempSource() {
    let replace = false;
    if (HwSensorsDaemon.enabled && isPawnIoInstalled()) {
      try { replace = await (await import('../../services/optimizer/ElevationHelper.js')).default.isElevated(); } catch { replace = false; }
    }
    const withTemps = !replace;
    if (SlowSensorDaemon.withTemps !== withTemps) {
      SlowSensorDaemon.withTemps = withTemps;
      if (this._running) { SlowSensorDaemon.stop(); SlowSensorDaemon.start(); }
    }
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
    this._applyTempSource().catch(() => { /* mantém WMI/ACPI */ });
  }

  get running() {
    return this._running;
  }
}

export default new SensorBus();
