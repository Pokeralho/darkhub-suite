import SensorBus from './SensorBus.js';
import GpuCollector from './GpuCollector.js';
import { BaseCollector } from './BaseCollector.js';
import { createSensor, createUnavailableSensor, classifyTemperature } from '../models/SensorModel.js';

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

    SensorBus.on('data', (payload) => {
      switch (payload.type) {
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

  _resolveCpuTemp() {
    if (this._hwmonCpu !== null && this._isFresh(this._lastHwmonUpdate)) {
      const label = this._hwmonSource?.includes('CoreTemp') ? 'coretemp' : this._hwmonSource?.includes('Libre') ? 'lhm-wmi' : 'ohm-wmi';
      return { value: this._hwmonCpu, source: label, quality: 'high' };
    }

    if (this._thermalZones.length > 0 && this._isFresh(this._lastZonesUpdate)) {
      const cpuZone = this._thermalZones.find(z => {
        const name = String(z.zone || '').toLowerCase();
        return name.includes('cpu') || name.includes('processor') || name.includes('package') || name.includes('tz');
      });
      if (cpuZone && typeof cpuZone.tempC === 'number') {
        let temp = cpuZone.tempC;
        if (temp < 32) temp = Math.round((temp + 16.0) * 10) / 10;
        return { value: temp, source: 'dts-calibrated', quality: 'medium' };
      }

      const hottest = this._thermalZones
        .filter(z => typeof z.tempC === 'number')
        .sort((a, b) => b.tempC - a.tempC)[0];
      if (hottest) {
        let temp = hottest.tempC;
        if (temp < 32) temp = Math.round((temp + 16.0) * 10) / 10;
        return { value: temp, source: 'dts-calibrated', quality: 'medium' };
      }
    }

    return null;
  }

  poll() {
    const gpuStamp = GpuCollector.lastUpdate || 0;
    const key = [
      this._lastHwmonUpdate,
      this._lastZonesUpdate,
      this._lastDiskTempsUpdate,
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
        : createUnavailableSensor('°C', 'hwmon', 'Unavailable')
    });

    const gpus = GpuCollector.cachedGpus || [];
    const hwmonGpuFresh = this._hwmonGpu !== null && this._isFresh(this._lastHwmonUpdate);

    if (gpus.length > 0) {
      gpus.forEach((gpu, idx) => {
        const temp = gpu.temperature;
        const hasTemp = temp && temp.value !== null && temp.value !== undefined;

        if (hasTemp) {
          probes.push({
            name: gpu.name || `GPU ${idx + 1}`,
            category: 'gpu',
            component: 'gpu',
            temperature: createSensor(temp.value, '°C', temp.source, {
              status: classifyTemperature(temp.value, 'gpu'),
              quality: temp.source === 'nvidia-smi' ? 'high' : 'medium'
            })
          });
          return;
        }

        probes.push({
          name: gpu.name || `GPU ${idx + 1}`,
          category: 'gpu',
          component: 'gpu',
          temperature: hwmonGpuFresh && idx === 0
            ? createSensor(this._hwmonGpu, '°C', 'ohm-wmi', {
                status: classifyTemperature(this._hwmonGpu, 'gpu'),
                quality: 'medium'
              })
            : createUnavailableSensor('°C', 'wmi', 'Unavailable')
        });
      });
    } else {
      probes.push({
        name: 'GPU',
        category: 'gpu',
        component: 'gpu',
        temperature: hwmonGpuFresh
          ? createSensor(this._hwmonGpu, '°C', 'ohm-wmi', {
              status: classifyTemperature(this._hwmonGpu, 'gpu'),
              quality: 'medium'
            })
          : createUnavailableSensor('°C', 'wmi', 'Unavailable')
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
                quality: 'medium'
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
          : createUnavailableSensor('°C', 'hwmon', 'Unavailable'),
        probes
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
