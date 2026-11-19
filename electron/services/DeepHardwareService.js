import si from 'systeminformation';
import cp from 'node:child_process';
import Logger from './LoggerService.js';
import { runPowerShell as runPowerShellShared } from './PowerShellRunner.js';
import { pairGpus } from '../hal/models/gpuMatch.js';

/** SUBSYS id (8 hex digits) from a PNPDeviceID, or ''. systeminformation exposes the same value as subDeviceId. */
const subsysOf = (pnp) => (String(pnp || '').match(/SUBSYS_([0-9A-F]{8})/i)?.[1] || '').toUpperCase();

/**
 * Pairs adapters with WMI rows (index into rows, or -1), never reusing a row. The PCI subsystem id wins when both
 * sides have it; otherwise names, exact first. An empty name (adapter not identified yet) matches nothing by name.
 */
export function pairWmiRows(gpus, rows) {
  const out = gpus.map(() => -1);
  const used = new Set();
  gpus.forEach((g, i) => {
    const sub = String(g?.subDeviceId || '').toUpperCase();
    if (!sub) return;
    const j = rows.findIndex((r, jj) => !used.has(jj) && subsysOf(r?.PNPDeviceID) === sub && (!g.model || !r?.Name || pairGpus([g.model], [r.Name])[0] === 0));
    if (j >= 0) { out[i] = j; used.add(j); }
  });
  const restG = gpus.map((_, i) => i).filter((i) => out[i] < 0);
  const restR = rows.map((_, j) => j).filter((j) => !used.has(j));
  const byName = pairGpus(restG.map((i) => gpus[i]?.model), restR.map((j) => rows[j]?.Name));
  restG.forEach((i, k) => { if (byName[k] >= 0) out[i] = restR[byName[k]]; });
  return out;
}

class DeepHardwareService {
  constructor() {
    this.cache = null;
    this.isFetching = false;
    this._fetchPromise = null;
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

      if (process.platform === 'win32') {
        try {
          const ps = `Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, VideoProcessor, VideoArchitecture, CurrentRefreshRate, PNPDeviceID | ConvertTo-Json -Compress`;
          const wmiRes = await this.runPowerShell(ps, 5000);
          if (wmiRes.stdout && !wmiRes.timeout) {
            let parsed = JSON.parse(wmiRes.stdout);
            if (!Array.isArray(parsed)) parsed = [parsed];
            // one row per adapter (PCI subsystem id, then exact name): an empty name used to match every row
            // (includes('')); a row with no match belongs to another adapter (Basic Display, remote), never copied over
            const pairs = pairWmiRows(gpus, parsed.filter(Boolean));
            const rows = parsed.filter(Boolean);
            gpus.forEach((match, i) => {
              const w = pairs[i] >= 0 ? rows[pairs[i]] : null;
              if (!w) return;
              if (!match.driverVersion && w.DriverVersion) match.driverVersion = w.DriverVersion;
              match.videoProcessor = w.VideoProcessor;
              match.refreshRate = w.CurrentRefreshRate;
              match.architecture = w.VideoArchitecture;
              if (w.PNPDeviceID) match.pnpDeviceId = w.PNPDeviceID;
            });
          }

          // every display-class key, matched to the adapter by DriverDesc (0000 is often another or a removed adapter)
          const psReg = `@(Get-ChildItem "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}" -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -match '^\\d{4}$' } | ForEach-Object { Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue } | Where-Object { $_.DriverDesc } | Select-Object DriverDesc, DriverDate, FeatureScore) | ConvertTo-Json -Compress`;
          const regRes = await this.runPowerShell(psReg, 3000);
          if (regRes.stdout && !regRes.timeout) {
            let regs = JSON.parse(regRes.stdout);
            if (!Array.isArray(regs)) regs = [regs];
            regs = regs.filter(Boolean);
            const regPairs = pairGpus(gpus.map((g) => g.model), regs.map((x) => x.DriverDesc));
            gpus.forEach((g, i) => {
              const r = regPairs[i] >= 0 ? regs[regPairs[i]] : null;
              if (r) { g.driverDate = r.DriverDate; g.featureScore = r.FeatureScore; }
            });
          }
        } catch (e) {  }
      }

      // Only spawn nvidia-smi when an NVIDIA adapter is actually present.
      if (gpus.some((g) => /nvidia/i.test(String(g.vendor)))) try {
        const smiRes = await new Promise((res) => {
          cp.exec('nvidia-smi -q -x', { windowsHide: true, timeout: 3000 }, (err, stdout) => {
            res({ err, stdout });
          });
        });

        if (!smiRes.err && smiRes.stdout) {

           // one <gpu> block per card: the power limit is taken from the block whose product name matches
           const blocks = smiRes.stdout.split(/<gpu id=/).slice(1);
           const nvIdx = gpus.map((g, i) => (String(g.vendor).toLowerCase().includes('nvidia') ? i : -1)).filter((i) => i >= 0);
           const smiPairs = pairGpus(nvIdx.map((i) => gpus[i].model), blocks.map((b) => /<product_name>([^<]+)<\/product_name>/.exec(b)?.[1] || ''));
           nvIdx.forEach((i, k) => {
             const block = smiPairs[k] >= 0 ? blocks[smiPairs[k]] : null;
             const pwrMatch = block && block.match(/<power_limit>([\d.]+)\s*W<\/power_limit>/);
             if (pwrMatch) gpus[i].powerLimit = pwrMatch[1];
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
      if (process.platform === 'win32')       if (process.platform === 'win32') try {
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
    // getCategory() may have created a partial cache ({ cpu }) — only a cache
    // stamped by a full scan counts here, otherwise callers got a partial object.
    if (this.cache?.timestamp && !forceRefresh) return this.cache;
    // Share the in-flight scan instead of busy-polling every 150 ms.
    if (this._fetchPromise) return this._fetchPromise;
    this._fetchPromise = this._scanAll().finally(() => {
      this._fetchPromise = null;
    });
    return this._fetchPromise;
  }

  async _scanAll() {
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

  async getCategory(category, forceRefresh = false) {
    if (!this.cache) this.cache = {};
    if (this.cache[category] && !forceRefresh) return this.cache[category];

    let result = null;
    switch (category) {
      case 'cpu': result = await this.fetchCpu(); break;
      case 'mobo':
      case 'mainboard': result = await this.fetchMainboard(); break;
      case 'ram':
      case 'memory': result = await this.fetchMemory(); break;
      case 'gpu': result = await this.fetchGpu(); break;
      case 'storage': result = await this.fetchStorage(); break;
      case 'network': result = await this.fetchNetwork(); break;
      case 'os': result = await this.fetchOS(); break;
      case 'monitors': result = await this.fetchMonitors(); break;
      default: return null;
    }
    this.cache[category] = result;
    if (category === 'mobo') this.cache['mainboard'] = result;
    if (category === 'mainboard') this.cache['mobo'] = result;
    if (category === 'ram') this.cache['memory'] = result;
    if (category === 'memory') this.cache['ram'] = result;
    return result;
  }
}

export default new DeepHardwareService();
