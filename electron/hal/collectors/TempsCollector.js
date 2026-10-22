import SensorBus from './SensorBus.js';
import GpuCollector from './GpuCollector.js';
import { BaseCollector } from './BaseCollector.js';
import { createSensor, createUnavailableSensor, classifyTemperature, sameGpu } from '../models/SensorModel.js';
import { summarizeLhm } from './lhmSummary.js';

const TEMPS_STALE_MS = 180000;

class TempsCollector extends BaseCollector {
  constructor() {
    super();
    this._diskTemps = [];
    this._thermalZones = [];
    this._hwmonCpu = null;
    this._hwmonGpu = null;
    this._hwmonSource = null;

    this._lastDiskTempsUpdate = 0;
    this._lastZonesUpdate = 0;
    this._lastHwmonUpdate = 0;
    this._lhm = null;
    this._lastLhmUpdate = 0;
    this._minMax = new Map();

    SensorBus.on('data', (payload) => {
      switch (payload.type) {
        case 'lhm':
          this._lhm = summarizeLhm(payload);
          this._lastLhmUpdate = Date.now();
          this._trackMinMax(this._lhm.tree);
          break;
        case 'diskTemps':
          if (Array.isArray(payload.drives)) {
            this._diskTemps = payload.drives;
            this._lastDiskTempsUpdate = Date.now();
          }
          break;
        case 'thermalZones':
          if (Array.isArray(payload.zones)) {
            this._thermalZones = payload.zones;
            this._lastZonesUpdate = Date.now();
          }
          break;
        case 'hwmonTemps': {
          const cpu = payload.cpuTempC;
          const gpu = payload.gpuTempC;
          this._hwmonCpu = (cpu === null || cpu === undefined) ? null : Number(cpu);
          this._hwmonGpu = (gpu === null || gpu === undefined) ? null : Number(gpu);
          this._hwmonSource = payload.source || 'hwmon';
          this._lastHwmonUpdate = Date.now();
          break;
        }
        default:
          break;
      }
    });
  }

  _isFresh(stamp) {
    return stamp > 0 && (Date.now() - stamp) <= TEMPS_STALE_MS;
  }

  _hwmonLabel() {
    const s = this._hwmonSource || '';
    return s.includes('CoreTemp') ? 'coretemp' : s.includes('Libre') ? 'lhm-wmi' : s.includes('Open') ? 'ohm-wmi' : 'hwmon';
  }

  /** Session min/max per sensor, like HWMonitor; written onto the tree entries. */
  _trackMinMax(tree) {
    for (const hw of tree) {
      for (const x of hw.sensors) {
        const key = `${hw.kind}|${hw.name}|${x.type}|${x.name}`;
        const m = this._minMax.get(key);
        if (m) { m.min = Math.min(m.min, x.value); m.max = Math.max(m.max, x.value); } else this._minMax.set(key, { min: x.value, max: x.value });
        const r = this._minMax.get(key);
        x.min = r.min; x.max = r.max;
      }
    }
  }

  _lhmFresh() { return this._lhm && Date.now() - this._lastLhmUpdate <= 10000; }

  _resolveCpuTemp() {
    if (this._lhmFresh() && this._lhm.cpu) return { value: this._lhm.cpu.temp, source: 'lhm', quality: 'high' };
    if (this._hwmonCpu !== null && this._isFresh(this._lastHwmonUpdate)) {
      const label = this._hwmonLabel();
      return { value: this._hwmonCpu, source: label, quality: 'high' };
    }

    // ACPI thermal zones are firmware readings of the board, not the processor's sensor: they are listed as
    // "Zona térmica (ACPI)" in the probes, never presented as the CPU temperature.
    return null;
  }

  poll() {
    const gpuStamp = GpuCollector.lastUpdate || 0;
    const key = [
      this._lastHwmonUpdate,
      this._lastZonesUpdate,
      this._lastDiskTempsUpdate,
      this._lastLhmUpdate,
      gpuStamp
    ].join('|');

    return this._memo(key, () => this._build());
  }

  _build() {
    const probes = [];

    const cpuTemp = this._resolveCpuTemp();
    probes.push({
      name: 'CPU Package',
      category: 'cpu',
      component: 'cpu',
      temperature: cpuTemp
        ? createSensor(cpuTemp.value, '°C', cpuTemp.source, {
            status: classifyTemperature(cpuTemp.value, 'cpu'),
            quality: cpuTemp.quality
          })
        : createUnavailableSensor('°C', 'none', 'Unavailable')
    });

    const gpus = GpuCollector.cachedGpus || [];
    const hwmonGpuFresh = this._hwmonGpu !== null && this._isFresh(this._lastHwmonUpdate);

    if (gpus.length > 0) {
      gpus.forEach((gpu, idx) => {
        // Advanced sensors read the GPU's own core sensor (NVAPI / ADL): preferred over WMI / nvidia-smi.
        // matched by name: LHM, DXGI and nvidia-smi list GPUs in different orders (iGPU + dGPU systems)
        const lg = this._lhmFresh() ? this._lhm.gpus.find((g) => sameGpu(g.name, gpu.name)) || null : null;
        const temp = lg && lg.temp !== null ? { value: lg.temp, source: 'lhm' } : gpu.temperature;
        const hasTemp = temp && temp.value !== null && temp.value !== undefined;

        if (hasTemp) {
          probes.push({
            name: gpu.name || `GPU ${idx + 1}`,
            category: 'gpu',
            component: 'gpu',
            temperature: createSensor(temp.value, '°C', temp.source, {
              status: classifyTemperature(temp.value, 'gpu'),
              quality: temp.source === 'nvidia-smi' || temp.source === 'lhm' ? 'high' : 'medium'
            }),
            ...(lg ? { hotspot: lg.hotspot, memoryTemp: lg.memory, powerW: lg.power, fanRpm: lg.fanRpm } : {})
          });
          return;
        }

        probes.push({
          name: gpu.name || `GPU ${idx + 1}`,
          category: 'gpu',
          component: 'gpu',
          temperature: hwmonGpuFresh && idx === 0
            ? createSensor(this._hwmonGpu, '°C', this._hwmonLabel(), {
                status: classifyTemperature(this._hwmonGpu, 'gpu'),
                quality: 'medium'
              })
            : createUnavailableSensor('°C', 'none', 'Unavailable')
        });
      });
    } else {
      probes.push({
        name: 'GPU',
        category: 'gpu',
        component: 'gpu',
        temperature: hwmonGpuFresh
          ? createSensor(this._hwmonGpu, '°C', this._hwmonLabel(), {
              status: classifyTemperature(this._hwmonGpu, 'gpu'),
              quality: 'medium'
            })
          : createUnavailableSensor('°C', 'none', 'Unavailable')
      });
    }

    if (this._diskTemps.length > 0 && this._isFresh(this._lastDiskTempsUpdate)) {
      this._diskTemps.forEach((d) => {
        const tempC = typeof d.tempC === 'number' ? d.tempC : null;
        const busLabel = d.busType === 'NVMe' ? 'NVMe' : d.mediaType === 'SSD' ? 'SSD' : 'HDD';
        probes.push({
          name: `${d.model || 'Disco'} (${busLabel})`,
          category: 'storage',
          component: 'storage',
          temperature: tempC !== null
            ? createSensor(tempC, '°C', 'storage-reliability', {
                status: classifyTemperature(tempC, 'storage'),
                quality: 'high'
              })
            : createUnavailableSensor('°C', 'storage-reliability', 'Unavailable')
        });
      });
    }

    const hasDiskTemps = this._diskTemps.length > 0 && this._isFresh(this._lastDiskTempsUpdate);
    if (!hasDiskTemps && this._lhmFresh()) {
      this._lhm.disks.forEach((d) => probes.push({
        name: d.name, category: 'storage', component: 'storage',
        temperature: createSensor(d.temp, '°C', 'lhm', { status: classifyTemperature(d.temp, 'storage'), quality: 'high' })
      }));
    }

    if (this._thermalZones.length > 0 && this._isFresh(this._lastZonesUpdate)) {
      this._thermalZones.forEach((z, idx) => {
        const tempC = typeof z.tempC === 'number' ? z.tempC : null;
        probes.push({
          name: this._formatZoneName(z.zone, idx),
          category: 'system',
          component: 'system',
          temperature: tempC !== null
            ? createSensor(tempC, '°C', 'acpi', {
                status: classifyTemperature(tempC, 'system'),
                quality: 'low'
              })
            : createUnavailableSensor('°C', 'acpi', 'Unavailable')
        });
      });
    }

    return {
      status: 'OK',
      timestamp: Date.now(),
      values: {
        main: cpuTemp
          ? createSensor(cpuTemp.value, '°C', cpuTemp.source, {
              status: classifyTemperature(cpuTemp.value, 'cpu'),
              quality: cpuTemp.quality
            })
          : createUnavailableSensor('°C', 'none', 'Unavailable'),
        probes,
        // Advanced sensors only (empty without them): per-core CPU temperatures, Super I/O fans and voltages.
        cpuCores: this._lhmFresh() ? this._lhm.cpuCores : [],
        cpuPowerW: this._lhmFresh() && this._lhm.cpu ? this._lhm.cpu.power : null,
        fans: this._lhmFresh() ? this._lhm.fans : [],
        voltages: this._lhmFresh() ? this._lhm.voltages : [],
        // every LHM sensor with session min/max (null while advanced sensors are off or stale)
        lhm: this._lhmFresh() ? { ring0: this._lhm.ring0, admin: this._lhm.admin, pawnio: this._lhm.pawnio, tree: this._lhm.tree } : null
      }
    };
  }

  _formatZoneName(instanceName, idx) {
    if (!instanceName) return `Zona Térmica ${idx + 1}`;
    const lower = String(instanceName).toLowerCase();
    if (lower.includes('cpu') || lower.includes('processor')) return 'CPU Térmica (ACPI)';
    if (lower.includes('gpu') || lower.includes('video') || lower.includes('gfx')) return 'GPU Térmica (ACPI)';
    if (lower.includes('sys') || lower.includes('ambient')) return 'Sistema (ACPI)';
    if (lower.includes('pch') || lower.includes('chipset')) return 'Chipset (ACPI)';
    if (lower.includes('mem') || lower.includes('dimm')) return 'Memória (ACPI)';
    return `Zona Térmica ${idx + 1} (ACPI)`;
  }
}

export default new TempsCollector();
