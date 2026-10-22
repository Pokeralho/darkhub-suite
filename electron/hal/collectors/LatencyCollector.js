import SensorBus from './SensorBus.js';
import { BaseCollector } from './BaseCollector.js';
import { createSensor, createUnavailableSensor, numOrNull } from '../models/SensorModel.js';
import { runPowerShellJson } from '../../services/PowerShellRunner.js';
import Logger from '../../services/LoggerService.js';

class LatencyCollector extends BaseCollector {
  constructor() {
    super();
    this.dpcsQueued = 0;
    this.interrupts = 0;
    this.percentDpc = 0;
    this.percentInt = 0;
    this.lastUpdate = 0;

    this.runningDrivers = [];
    this._driversStamp = 0;
    this._driversStarted = false;

    SensorBus.on('data', (payload) => {
      if (payload.type !== 'latency') return;
      this.dpcsQueued = numOrNull(payload.dpcsQueued);
      this.interrupts = numOrNull(payload.interrupts);
      this.percentDpc = numOrNull(payload.percentDpc);
      this.percentInt = numOrNull(payload.percentInt);
      this.lastUpdate = Date.now();
    });
  }

  _ensureDrivers() {
    if (this._driversStarted) return;
    this._driversStarted = true;

    const script = [
      "$ErrorActionPreference = 'SilentlyContinue'",
      'Get-CimInstance Win32_SystemDriver |',
      "  Where-Object { $_.State -eq 'Running' } |",
      '  Select-Object Name, DisplayName, PathName |',
      '  ConvertTo-Json -Compress'
    ].join('\n');

    runPowerShellJson(script, { timeoutMs: 15000, fallback: [] })
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : (data ? [data] : []);
        this.runningDrivers = list;
        this._driversStamp = Date.now();
        Logger.info('LatencyCollector', `${list.length} driver(s) em execução mapeado(s)`);
      })
      .catch((err) => {
        Logger.warn('LatencyCollector', 'Falha ao buscar drivers em execução', err?.message ?? String(err));
      });
  }

  poll() {
    this._ensureDrivers();

    const freshness = this._freshness(this.lastUpdate);
    return this._memo(`${this.lastUpdate}|${freshness}|${this._driversStamp}`, () => {
      if (freshness === 'disconnected') {
        return {
          status: 'Disconnected',
          timestamp: Date.now(),
          values: {
            dpcsQueued: createUnavailableSensor('DPCs/s', 'wmi', 'Disconnected'),
            interrupts: createUnavailableSensor('Ints/s', 'wmi', 'Disconnected'),
            percentDpc: createUnavailableSensor('%', 'wmi', 'Disconnected'),
            percentInt: createUnavailableSensor('%', 'wmi', 'Disconnected'),
            drivers: this.runningDrivers
          }
        };
      }

      if (freshness === 'dead') {
        return {
          status: 'Error',
          timestamp: Date.now(),
          values: null,
          error: 'Daemon WMI não está respondendo (métricas de latência)'
        };
      }

      return {
        status: 'OK',
        timestamp: Date.now(),
        values: {
          dpcsQueued: createSensor(this.dpcsQueued, 'DPCs/s', 'pdh'),
          interrupts: createSensor(this.interrupts, 'Ints/s', 'pdh'),
          percentDpc: createSensor(this.percentDpc, '%', 'pdh'),
          percentInt: createSensor(this.percentInt, '%', 'pdh'),
          drivers: this.runningDrivers
        }
      };
    });
  }
}

export default new LatencyCollector();
