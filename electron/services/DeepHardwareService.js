import si from 'systeminformation';
import cp from 'node:child_process';
import Logger from './LoggerService.js';
import { runPowerShell as runPowerShellShared } from './PowerShellRunner.js';

class DeepHardwareService {
  constructor() {
    this.cache = null;
    this.isFetching = false;
  }

  async runPowerShell(script, timeoutMs = 8000) {
    try {
      const { code, stdout, stderr } = await runPowerShellShared(script, { timeoutMs, trim: true })
      return { stdout, code, stderr, timeout: false };
    } catch (err) {
      const timedOut = /timed out/i.test(err?.message ?? '');
      return { stdout: '', code: null, error: !timedOut, timeout: timedOut };
    }
  }

  wrapStatus(data, error = false, reason = '') {
    if (error) return { status: 'Error', reason, data: null };
    if (!data || (Array.isArray(data) && data.length === 0)) return { status: 'Unavailable', reason, data };
    return { status: 'OK', reason: '', data };
  }

  async fetchCpu() {
    try {
      const [cpu, cache, flags] = await Promise.all([
        si.cpu().catch(() => null),
        si.cpuCache().catch(() => null),
        si.cpuFlags().catch(() => null)
      ]);
      return this.wrapStatus({
        manufacturer: cpu?.manufacturer,
        brand: cpu?.brand,
        speedBase: cpu?.speed,
        speedMax: cpu?.speedMax,
        cores: cpu?.cores,
        physicalCores: cpu?.physicalCores,
        processors: cpu?.processors,
        socket: cpu?.socket,
        vendor: cpu?.vendor,
        family: cpu?.family,
        model: cpu?.model,
        stepping: cpu?.stepping,
        virtualization: cpu?.virtualization,
        cache: cache,
        flags: flags
      });
    } catch (e) {
      return this.wrapStatus(null, true, String(e));
    }
  }

  async fetchMainboard() {
    try {
      const [base, bios, chassis] = await Promise.all([
        si.baseboard().catch(() => null),
        si.bios().catch(() => null),
        si.chassis().catch(() => null)
      ]);
      return this.wrapStatus({
        manufacturer: base?.manufacturer,
        model: base?.model,
        version: base?.version,
        serial: base?.serial,
        biosVendor: bios?.vendor,
        biosVersion: bios?.version,
        biosReleaseDate: bios?.releaseDate,
        biosRevision: bios?.revision,
        chassisType: chassis?.type,
        chassisManufacturer: chassis?.manufacturer
      });
    } catch (e) {
      return this.wrapStatus(null, true, String(e));
    }
  }

  async fetchMemory() {
    try {
      const layout = await si.memLayout().catch(() => []);
      const mapped = layout.map(m => ({
        bank: m.bank,
        type: m.type,
        size: m.size,
        clockSpeed: m.clockSpeed,
        formFactor: m.formFactor,
        manufacturer: m.manufacturer,
        partNum: m.partNum,
        serialNum: m.serialNum,
        voltageConfigured: m.voltageConfigured,
        voltageMin: m.voltageMin,
        voltageMax: m.voltageMax
      }));
      return this.wrapStatus(mapped);
    } catch (e) {
      return this.wrapStatus(null, true, String(e));
    }
  }

  async fetchGpu() {
    try {
      const graphics = await si.graphics().catch(() => null);
      let gpus = (graphics?.controllers || []).map(g => ({
        vendor: g.vendor,
        model: g.model,
        bus: g.bus,
        vram: g.vram,
        vramDynamic: g.vramDynamic,
        driverVersion: g.driverVersion,
        subDeviceId: g.subDeviceId,
        clockCore: g.clockCore,
        powerLimit: null,
        architecture: null,
        videoProcessor: null,
        refreshRate: null,
        driverDate: null,
        featureScore: null
      }));

      try {
        const ps = `Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, VideoProcessor, VideoArchitecture, CurrentRefreshRate | ConvertTo-Json -Compress`;
        const wmiRes = await this.runPowerShell(ps, 5000);
        if (wmiRes.stdout && !wmiRes.timeout) {
          let parsed = JSON.parse(wmiRes.stdout);
          if (!Array.isArray(parsed)) parsed = [parsed];
          parsed.forEach(w => {
            const match = gpus.find(g => String(g.model).includes(w.Name) || String(w.Name).includes(g.model));
            if (match) {
              if (!match.driverVersion && w.DriverVersion) match.driverVersion = w.DriverVersion;
              match.videoProcessor = w.VideoProcessor;
              match.refreshRate = w.CurrentRefreshRate;
              match.architecture = w.VideoArchitecture;
            } else if (gpus.length === 1) {
              if (!gpus[0].driverVersion && w.DriverVersion) gpus[0].driverVersion = w.DriverVersion;
              gpus[0].videoProcessor = w.VideoProcessor;
              gpus[0].refreshRate = w.CurrentRefreshRate;
              gpus[0].architecture = w.VideoArchitecture;
            }
          });
        }

        const psReg = `Get-ItemProperty "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000" -ErrorAction SilentlyContinue | Select-Object DriverDate, FeatureScore | ConvertTo-Json -Compress`;
        const regRes = await this.runPowerShell(psReg, 2000);
        if (regRes.stdout && !regRes.timeout) {
          const regParsed = JSON.parse(regRes.stdout);
          if (gpus.length > 0) {
            gpus[0].driverDate = regParsed.DriverDate;
            gpus[0].featureScore = regParsed.FeatureScore;
          }
        }
      } catch (e) {  }

      try {
        const smiRes = await new Promise((res) => {
          cp.exec('nvidia-smi -q -x', { windowsHide: true, timeout: 3000 }, (err, stdout) => {
            res({ err, stdout });
          });
        });

        if (!smiRes.err && smiRes.stdout) {

           gpus = gpus.map(g => {
             if (String(g.vendor).toLowerCase().includes('nvidia')) {
               const pwrMatch = smiRes.stdout.match(/<power_limit>([\d.]+)\s*W<\/power_limit>/);
               if (pwrMatch) g.powerLimit = pwrMatch[1];
             }
             return g;
           });
        }
      } catch (e) {  }

      return this.wrapStatus(gpus);
    } catch (e) {
      return this.wrapStatus(null, true, String(e));
    }
  }

  async fetchStorage() {
    try {
      const layout = await si.diskLayout().catch(() => []);

      let wmiDisks = [];
      try {
        const ps = `
          $ErrorActionPreference='SilentlyContinue'
          Get-PhysicalDisk | ForEach-Object {
            $disk = $_
            $health = Get-StorageReliabilityCounter -PhysicalDisk $disk
            [PSCustomObject]@{
              DeviceId = $disk.DeviceId
              Model = $disk.Model
              MediaType = $disk.MediaType
              BusType = $disk.BusType
              HealthStatus = $disk.HealthStatus
              Wear = $health.Wear
              Temperature = $health.Temperature
              ReadErrors = $health.ReadErrorsTotal
            }
          } | ConvertTo-Json -Compress
        `;
        const wmiRes = await this.runPowerShell(ps, 5000);
        if (wmiRes.stdout && !wmiRes.timeout) {

           let parsed = JSON.parse(wmiRes.stdout);
           if (!Array.isArray(parsed)) parsed = [parsed];
           wmiDisks = parsed;
        }
      } catch (e) {  }

      const mapped = layout.map(d => {

        const advanced = wmiDisks.find(w => w.Model && String(d.name).includes(w.Model)) || {};
        return {
          device: d.device,
          type: d.type || advanced.MediaType,
          name: d.name,
          vendor: d.vendor,
          size: d.size,
          interfaceType: d.interfaceType || advanced.BusType,
          smartStatus: d.smartStatus || advanced.HealthStatus,
          wearLevel: advanced.Wear,
          temperature: advanced.Temperature,
          readErrors: advanced.ReadErrors,
          firmwareRevision: d.firmwareRevision,
          serialNum: d.serialNum
        };
      });

      return this.wrapStatus(mapped);
    } catch (e) {
      return this.wrapStatus(null, true, String(e));
    }
  }

  async fetchNetwork() {
    try {
      const net = await si.networkInterfaces().catch(() => []);
      const mapped = net.filter(n => n.ip4 && n.ip4 !== '127.0.0.1').map(n => ({
        iface: n.iface,
        ifaceName: n.ifaceName,
        ip4: n.ip4,
        ip6: n.ip6,
        mac: n.mac,
        speed: n.speed,
        dhcp: n.dhcp,
        type: n.type,
        duplex: n.duplex
      }));
      return this.wrapStatus(mapped);
    } catch (e) {
      return this.wrapStatus(null, true, String(e));
    }
  }

  async fetchMonitors() {
    try {
      const graphics = await si.graphics().catch(() => null);
      if (!graphics || !graphics.displays) return this.wrapStatus([]);

      const displays = graphics.displays.map(d => ({
        vendor: d.vendor,
        model: d.model,
        main: d.main,
        builtin: d.builtin,
        connection: d.connection,
        resolutionx: d.resolutionX,
        resolutiony: d.resolutionY,
        sizex: d.sizeX,
        sizey: d.sizeY,
        pixeldepth: d.pixelDepth,
        currentResX: d.currentResX,
        currentResY: d.currentResY,
        currentRefreshRate: d.currentRefreshRate
      }));
      return this.wrapStatus(displays);
    } catch (e) {
      return this.wrapStatus(null, true, String(e));
    }
  }

  async fetchOS() {
    try {
      const osInfo = await si.osInfo().catch(() => null);
      let windowsDetails = {};

      if (process.platform === 'win32') {
        try {
          const ps = `
            $ErrorActionPreference='Stop'
            $cv = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion'
            $p = Get-ItemProperty -Path $cv
            [PSCustomObject]@{
              DisplayVersion = $p.DisplayVersion
              ReleaseId = $p.ReleaseId
              CurrentBuildNumber = $p.CurrentBuildNumber
              UBR = $p.UBR
              InstallDate = $p.InstallDate
            } | ConvertTo-Json -Compress
          `;
          const wmiRes = await this.runPowerShell(ps, 3000);
          if (wmiRes.stdout) windowsDetails = JSON.parse(wmiRes.stdout);
        } catch (e) {}
      }

      return this.wrapStatus({
        platform: osInfo?.platform,
        distro: osInfo?.distro,
        release: osInfo?.release,
        arch: osInfo?.arch,
        hostname: osInfo?.hostname,
        build: osInfo?.build,
        windowsDetails
      });
    } catch (e) {
      return this.wrapStatus(null, true, String(e));
    }
  }

  async getDeepInfo(forceRefresh = false) {
    if (this.cache && !forceRefresh) return this.cache;
    if (this.isFetching) {
      while(this.isFetching) { await new Promise(r => setTimeout(r, 150)); }
      if (this.cache) return this.cache;
    }

    this.isFetching = true;
    Logger.info('DeepHW', 'Iniciando varredura profunda de Hardware (Modo AIDA64)...');

    try {
      const [cpu, mainboard, memory, gpu, storage, network, os, monitors] = await Promise.all([
        this.fetchCpu(),
        this.fetchMainboard(),
        this.fetchMemory(),
        this.fetchGpu(),
        this.fetchStorage(),
        this.fetchNetwork(),
        this.fetchOS(),
        this.fetchMonitors()
      ]);

      this.cache = {
        cpu, mainboard, memory, gpu, storage, network, os, monitors,
        timestamp: Date.now()
      };
      Logger.info('DeepHW', 'Varredura concluída e cacheada com sucesso.');
    } catch (e) {
      Logger.error('DeepHW', 'Erro crítico durante a varredura profunda', e);
    } finally {
      this.isFetching = false;
    }

    return this.cache;
  }
}

export default new DeepHardwareService();
