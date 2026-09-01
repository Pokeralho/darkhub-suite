import si from 'systeminformation';
import SensorBus from './SensorBus.js';
import NvidiaDaemon from './NvidiaDaemon.js';
import { BaseCollector } from './BaseCollector.js';
import { createSensor, createUnavailableSensor } from '../models/SensorModel.js';
import Logger from '../../services/LoggerService.js';

const NVIDIA_STALE_MS = 20000;

const WMI_STALE_MS = 20000;

class GpuCollector extends BaseCollector {
  constructor() {
    super();

    this.cachedGpus = [];

    this.lastUpdate = 0;

    this._nvidiaGpus = [];
    this._nvidiaStamp = 0;

    this._wmiUtilization = 0;
    this._wmiMemoryUsed = 0;
    this._wmiStamp = 0;

    this._staticGpus = [];
    this._staticStamp = 0;
    this._staticStarted = false;

    NvidiaDaemon.on('data', (payload) => {
      if (payload.type !== 'nvidia' || !Array.isArray(payload.gpus)) return;
      this._nvidiaGpus = payload.gpus;
      this._nvidiaStamp = Date.now();
    });

    SensorBus.on('data', (payload) => {
      if (payload.type !== 'gpu') return;
      this._wmiUtilization = Number(payload.utilization) || 0;
      this._wmiMemoryUsed = Number(payload.memoryUsed) || 0;
      this._wmiStamp = Date.now();
    });
  }

  _ensureStaticData() {
    if (this._staticStarted) return;
    this._staticStarted = true;
    si.graphics()
      .then((graphics) => {
        if (!graphics || !Array.isArray(graphics.controllers)) return;
        this._staticGpus = graphics.controllers.map(c => ({
          vendor: c.vendor || '',
          model: c.model || '',
          vram: c.vram || 0
        }));
        this._staticStamp = Date.now();
        Logger.info('GpuCollector', `Dados estáticos: ${this._staticGpus.length} GPU(s) detectada(s)`);
      })
      .catch(err => Logger.warn('GpuCollector', 'Falha ao buscar dados estáticos de GPU', err.message));
  }

  poll() {
    this._ensureStaticData();

    const now = Date.now();
    const nvidiaFresh = this._nvidiaStamp > 0 && (now - this._nvidiaStamp) <= NVIDIA_STALE_MS;
    const wmiFresh = this._wmiStamp > 0 && (now - this._wmiStamp) <= WMI_STALE_MS;

    const key = [
      nvidiaFresh ? this._nvidiaStamp : 0,
      wmiFresh ? this._wmiStamp : 0,
      this._staticStamp
    ].join('|');

    return this._memo(key, () => {
      const gpus = nvidiaFresh
        ? this._buildNvidiaGpus()
        : this._buildFallbackGpus(wmiFresh);

      this.cachedGpus = gpus;
      this.lastUpdate = Date.now();

      return { status: 'OK', timestamp: this.lastUpdate, values: { gpus } };
    });
  }

  _buildNvidiaGpus() {
    const sensor = (value, unit) => createSensor(value, unit, 'nvidia-smi', { quality: 'high' });
    return this._nvidiaGpus.map(g => ({
      index: g.index,
      name: g.name,
      utilization: sensor(g.utilization, '%'),
      temperature: sensor(g.temperature, '°C'),
      vramUsed: sensor(g.vramUsed, 'MB'),
      vramTotal: sensor(g.vramTotal, 'MB'),
      clockCore: sensor(g.clockCore, 'MHz'),
      clockMemory: sensor(g.clockMemory, 'MHz'),
      powerDraw: sensor(g.powerDraw, 'W'),
      fanSpeed: sensor(g.fanSpeed, '%'),
      provider: 'nvidia-smi'
    }));
  }

  _buildFallbackGpus(wmiFresh) {
    const source = wmiFresh ? 'wmi' : 'si';

    const template = (vendor, model, vram, idx) => ({
      index: idx,
      name: `${vendor} ${model}`.trim() || `GPU ${idx + 1}`,

      utilization: idx === 0 && wmiFresh
        ? createSensor(this._wmiUtilization, '%', 'wmi', { quality: 'medium' })
        : createUnavailableSensor('%', source, 'Unavailable'),
      temperature: createUnavailableSensor('°C', source, 'Unavailable'),
      vramUsed: idx === 0 && wmiFresh
        ? createSensor(this._wmiMemoryUsed, 'MB', 'wmi', { quality: 'medium' })
        : createUnavailableSensor('MB', source, 'Unavailable'),
      vramTotal: vram > 0
        ? createSensor(vram, 'MB', 'si', { quality: 'high' })
        : createUnavailableSensor('MB', 'si', 'Unavailable'),
      clockCore: createUnavailableSensor('MHz', source, 'Unavailable'),
      clockMemory: createUnavailableSensor('MHz', source, 'Unavailable'),
      powerDraw: createUnavailableSensor('W', source, 'Unavailable'),
      fanSpeed: createUnavailableSensor('%', source, 'Unavailable'),
      provider: wmiFresh ? 'wmi' : 'si'
    });

    if (this._staticGpus.length > 0) {
      return this._staticGpus.map((g, i) => template(g.vendor, g.model, g.vram, i));
    }

    return [template('', 'GPU', 0, 0)];
  }
}

export default new GpuCollector();
