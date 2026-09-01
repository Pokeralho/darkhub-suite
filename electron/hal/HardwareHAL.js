import Logger from '../services/LoggerService.js';
import CpuCollector from './collectors/CpuCollector.js';
import RamCollector from './collectors/RamCollector.js';
import GpuCollector from './collectors/GpuCollector.js';
import DiskCollector from './collectors/DiskCollector.js';
import NetworkCollector from './collectors/NetworkCollector.js';
import TempsCollector from './collectors/TempsCollector.js';
import ProcessCollector from './collectors/ProcessCollector.js';
import StorageCollector from './collectors/StorageCollector.js';
import LatencyCollector from './collectors/LatencyCollector.js';
import SensorBus from './collectors/SensorBus.js';
import NvidiaDaemon from './collectors/NvidiaDaemon.js';

class HardwareHAL {
  constructor() {
    this.sensors = {
      cpu: { status: 'Disconnected', timestamp: 0, values: null },
      ram: { status: 'Disconnected', timestamp: 0, values: null },
      diskIo: { status: 'Disconnected', timestamp: 0, values: null },
      storage: { status: 'Disconnected', timestamp: 0, values: null },
      network: { status: 'Disconnected', timestamp: 0, values: null },
      temps: { status: 'Disconnected', timestamp: 0, values: null },
      procs: { status: 'Disconnected', timestamp: 0, values: null },
      gpu: { status: 'Disconnected', timestamp: 0, values: null },
      latency: { status: 'Disconnected', timestamp: 0, values: null }
    };
  }

  init() {
    Logger.info('HardwareHAL', 'Inicializando daemons persistentes de telemetria...');
    SensorBus.start();
    NvidiaDaemon.start();
  }

  shutdown() {
    Logger.info('HardwareHAL', 'Encerrando daemons de telemetria...');
    SensorBus.stop();
    NvidiaDaemon.stop();
  }

  pollCpu() { this.sensors.cpu = CpuCollector.poll(); }
  pollRam() { this.sensors.ram = RamCollector.poll(); }
  pollDiskIo() { this.sensors.diskIo = DiskCollector.poll(); }
  pollLatency() { this.sensors.latency = LatencyCollector.poll(); }
  pollGpu() { this.sensors.gpu = GpuCollector.poll(); }
  pollStorage() { this.sensors.storage = StorageCollector.poll(); }
  pollNetwork() { this.sensors.network = NetworkCollector.poll(); }
  pollProcesses() { this.sensors.procs = ProcessCollector.poll(); }
  pollTemps() { this.sensors.temps = TempsCollector.poll(); }

  pollAll() {
    this.pollCpu();
    this.pollRam();
    this.pollDiskIo();
    this.pollNetwork();
    this.pollLatency();
    this.pollGpu();
    this.pollTemps();
    this.pollProcesses();
    this.pollStorage();
  }

  getSnapshot() {
    this.pollAll();
    return this.sensors;
  }
}

export default new HardwareHAL();
