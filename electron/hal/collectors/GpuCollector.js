import si from 'systeminformation';
import SensorBus from './SensorBus.js';
import NvidiaDaemon from './NvidiaDaemon.js';
import { BaseCollector } from './BaseCollector.js';
import { createSensor, createUnavailableSensor, numOrNull, sameGpu } from '../models/SensorModel.js';
import Logger from '../../services/LoggerService.js';

const STALE_MS = 20000;

/**
 * One entry per real GPU. The adapter list comes from the native daemon (DXGI names + per-adapter PDH utilization
 * and dedicated memory, the numbers Task Manager shows); nvidia-smi adds temperature, clocks, power and fan to the
 * NVIDIA card it belongs to (matched by name, never by position). systeminformation is only the list of last resort.
 */
class GpuCollector extends BaseCollector {
  constructor() {
    super();
    this.cachedGpus = [];
    this.lastUpdate = 0;
    this._nvidiaGpus = [];
    this._nvidiaStamp = 0;
    this._adapters = [];
    this._adaptersStamp = 0;
    this._staticGpus = [];
    this._staticStamp = 0;
    this._staticStarted = false;

    NvidiaDaemon.on('data', (payload) => {
      if (payload.type !== 'nvidia' || !Array.isArray(payload.gpus)) return;
      this._nvidiaGpus = payload.gpus;
      this._nvidiaStamp = Date.now();
    });
    SensorBus.on('data', (payload) => {
      if (payload.type !== 'gpu' || !Array.isArray(payload.adapters)) return;
      this._adapters = payload.adapters;
      this._adaptersStamp = Date.now();
    });
  }

  _ensureStaticData() {
    if (this._staticStarted) return;
    this._staticStarted = true;
    si.graphics()
      .then((graphics) => {
        if (!graphics || !Array.isArray(graphics.controllers)) return;
        this._staticGpus = graphics.controllers
          .filter((c) => !/basic render|remote display|virtual/i.test(`${c.vendor} ${c.model}`))
          .map((c) => ({ name: `${c.vendor || ''} ${c.model || ''}`.trim(), vram: c.vram || 0 }));
        this._staticStamp = Date.now();
      })
      .catch((err) => Logger.warn('GpuCollector', 'Falha ao buscar dados estáticos de GPU', err.message));
  }

  poll() {
    this._ensureStaticData();
    const now = Date.now();
    const nvidiaFresh = this._nvidiaStamp > 0 && now - this._nvidiaStamp <= STALE_MS;
    const pdhFresh = this._adaptersStamp > 0 && now - this._adaptersStamp <= STALE_MS;
    const key = [nvidiaFresh ? this._nvidiaStamp : 0, pdhFresh ? this._adaptersStamp : 0, this._staticStamp].join('|');
    return this._memo(key, () => {
      const base = pdhFresh && this._adapters.length
        ? this._adapters.map((a) => ({ name: a.name, pdh: a }))
        : this._staticGpus.map((g) => ({ name: g.name, vram: g.vram }));
      // an NVIDIA card nvidia-smi sees but the base list missed is still listed
      const nv = nvidiaFresh ? this._nvidiaGpus : [];
      for (const g of nv) if (!base.some((b) => sameGpu(b.name, g.name))) base.push({ name: g.name });
      const gpus = base.map((b, idx) => this._build(b, nv.find((g) => sameGpu(b.name, g.name)), idx));
      this.cachedGpus = gpus;
      this.lastUpdate = Date.now();
      return { status: 'OK', timestamp: this.lastUpdate, values: { gpus } };
    });
  }

  _build(b, nv, idx) {
    const na = (unit, src) => createUnavailableSensor(unit, src, 'Unavailable');
    const smi = (v, unit) => (nv && numOrNull(v) !== null ? createSensor(numOrNull(v), unit, 'nvidia-smi', { quality: 'high' }) : null);
    const pdh = (v, unit) => (b.pdh && numOrNull(v) !== null ? createSensor(numOrNull(v), unit, 'pdh', { quality: 'high' }) : null);
    return {
      index: idx,
      name: b.name || `GPU ${idx + 1}`,
      utilization: smi(nv?.utilization, '%') || pdh(b.pdh?.utilization, '%') || na('%', 'pdh'),
      temperature: smi(nv?.temperature, '°C') || na('°C', 'none'),
      vramUsed: smi(nv?.vramUsed, 'MB') || pdh(b.pdh?.memoryUsed, 'MB') || na('MB', 'pdh'),
      vramTotal: smi(nv?.vramTotal, 'MB') || pdh(b.pdh?.memoryTotal, 'MB')
        || (b.vram > 0 ? createSensor(b.vram, 'MB', 'si', { quality: 'medium' }) : na('MB', 'si')),
      clockCore: smi(nv?.clockCore, 'MHz') || na('MHz', 'none'),
      clockMemory: smi(nv?.clockMemory, 'MHz') || na('MHz', 'none'),
      powerDraw: smi(nv?.powerDraw, 'W') || na('W', 'none'),
      fanSpeed: smi(nv?.fanSpeed, '%') || na('%', 'none'),
      provider: nv ? 'nvidia-smi' : b.pdh ? 'pdh' : 'si'
    };
  }
}

export default new GpuCollector();
