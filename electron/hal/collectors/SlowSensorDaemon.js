import cp from 'node:child_process';
import { EventEmitter } from 'node:events';
import Logger from '../../services/LoggerService.js';
import { encodePowerShellScript } from '../../services/PowerShellRunner.js';

class SlowSensorDaemon extends EventEmitter {
  constructor() {
    super();
    this.process = null;
    this.buffer = '';
    this._stopped = true;
    this._restarting = false;
    this._restartDelay = 10000;

    // false while the advanced sensors (LibreHardwareMonitorLib) run: they read the same things directly
    this.withTemps = true;
    this.tempsEvery = 15;
    this.storageEvery = 30;

    this.diskTempsEvery = 120;
  }

  _buildScript() {
    return [
      "$ErrorActionPreference = 'SilentlyContinue'",
      "$ProgressPreference = 'SilentlyContinue'",
      '[System.Threading.Thread]::CurrentThread.CurrentCulture = [System.Globalization.CultureInfo]::InvariantCulture',

      '$out = [System.Console]::Out',
      'function Emit($o) {',
      '  $out.WriteLine(($o | ConvertTo-Json -Compress -Depth 5))',
      '  $out.Flush()',
      '}',

      `$tempsEvery = ${this.tempsEvery}`,
      `$storageEvery = ${this.storageEvery}`,
      `$diskTempsEvery = ${this.diskTempsEvery}`,

      '$ohmNamespace = $null',
      '$ohmProbed = $false',
      `$withTemps = ${this.withTemps ? '$true' : '$false'}`,
      '$tick = 0',
      'while ($true) {',
      '  $tick++',

      '  if ($withTemps -and ($tick % $tempsEvery) -eq 2) {',
      '    if (-not $ohmProbed) {',
      '      $ohmProbed = $true',
      "      foreach ($ns in @('root/LibreHardwareMonitor','root/OpenHardwareMonitor')) {",
      '        try {',
      '          $probe = Get-CimInstance -Namespace $ns -ClassName Sensor -ErrorAction Stop | Select-Object -First 1',
      '          if ($probe) { $ohmNamespace = $ns; break }',
      '        } catch {}',
      '      }',
      '    }',
      '    if ($ohmNamespace) {',
      '      try {',
      "        $sensors = Get-CimInstance -Namespace $ohmNamespace -ClassName Sensor -ErrorAction Stop | Where-Object { $_.SensorType -eq 'Temperature' }",
      '        if ($sensors) {',
      '          $cpuT = $null; $gpuT = $null',
      // exact sensor names only: the largest "CPU*" value can be a "Distance to TjMax" margin or Hot Spot
      "          $cpuMatch = $sensors | Where-Object { $_.Parent -match 'cpu' -and @('CPU Package','Core (Tctl/Tdie)','Core (Tctl)','Package') -contains $_.Name } | Select-Object -First 1",
      '          if ($cpuMatch) { $cpuT = $cpuMatch.Value }',
      "          $gpuMatch = $sensors | Where-Object { $_.Parent -match 'gpu' -and $_.Name -eq 'GPU Core' } | Select-Object -First 1",
      '          if ($gpuMatch) { $gpuT = $gpuMatch.Value }',
      '          if ($null -ne $cpuT -or $null -ne $gpuT) {',
      "            Emit ([PSCustomObject]@{ type = 'hwmonTemps'; source = $ohmNamespace; cpuTempC = $cpuT; gpuTempC = $gpuT })",
      '          }',
      '        }',
      '      } catch {}',
      '    }',
      '',
      '    try {',
      "      $zones = Get-CimInstance -Namespace root/WMI -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue",
      '      if (-not $zones) {',
      "        $zones = Get-CimInstance -Namespace root/cimv2 -ClassName Win32_PerfFormattedData_Counters_ThermalZoneInformation -ErrorAction SilentlyContinue",
      '      }',
      '      if ($zones) {',
      '        $zoneList = New-Object System.Collections.ArrayList',
      '        foreach ($z in $zones) {',
      '          $raw = $z.CurrentTemperature',
      '          if (-not $raw -and $z.HighPrecisionTemperature) { $raw = $z.HighPrecisionTemperature }',
      '          if ($raw -gt 0) {',
      '            $tempC = [Math]::Round(($raw / 10.0) - 273.15, 1)',
      '            if ($tempC -ge 15 -and $tempC -le 120) {',
      '              $zName = if ($z.InstanceName) { $z.InstanceName } else { $z.Name }',
      '              $null = $zoneList.Add([PSCustomObject]@{ zone = $zName; tempC = $tempC })',
      '            }',
      '          }',
      '        }',
      '        if ($zoneList.Count -gt 0) {',
      "          Emit ([PSCustomObject]@{ type = 'thermalZones'; zones = @($zoneList) })",
      '        }',
      '      }',
      '    } catch {}',
      '  }',

      '  if (($tick % $storageEvery) -eq 1) {',
      '    try {',
      '      $disks = New-Object System.Collections.ArrayList',
      '      foreach ($d in [System.IO.DriveInfo]::GetDrives()) {',
      '        if (-not $d.IsReady) { continue }',
      "        if ($d.DriveType -ne 'Fixed') { continue }",
      '        $size = [double]$d.TotalSize',
      '        if ($size -le 0) { continue }',
      '        $free = [double]$d.AvailableFreeSpace',
      '        $used = $size - $free',
      '        $null = $disks.Add([PSCustomObject]@{ fs = $d.Name; type = $d.DriveFormat; size = $size; used = $used; use = [Math]::Round(($used / $size) * 100, 1); mount = $d.Name })',
      '      }',
      '      if ($disks.Count -gt 0) {',
      "        Emit ([PSCustomObject]@{ type = 'storage'; disks = @($disks) })",
      '      }',
      '    } catch {}',
      '  }',

      '  if ($withTemps -and ($tick % $diskTempsEvery) -eq 3) {',
      '    try {',
      '      $physDisks = Get-PhysicalDisk -ErrorAction Stop',
      '      $diskTempList = New-Object System.Collections.ArrayList',
      '      foreach ($pd in $physDisks) {',
      '        $rel = $null',
      '        try { $rel = $pd | Get-StorageReliabilityCounter -ErrorAction Stop } catch {}',
      '        if ($rel -and $rel.Temperature -gt 0 -and $rel.Temperature -lt 120) {',
      '          $null = $diskTempList.Add([PSCustomObject]@{ model = $pd.FriendlyName; mediaType = $pd.MediaType; busType = $pd.BusType; tempC = $rel.Temperature })',
      '        }',
      '      }',
      '      if ($diskTempList.Count -gt 0) {',
      "        Emit ([PSCustomObject]@{ type = 'diskTemps'; drives = @($diskTempList) })",
      '      }',
      '    } catch {}',
      '  }',

      '  Start-Sleep -Seconds 1',
      '}'
    ].join('\n');
  }

  start() {
    if (this.process) return;
    this._stopped = false;
    Logger.info(
      'SlowSensorDaemon',
      `Iniciando coleta de baixa frequência (storage ${this.storageEvery}s${this.withTemps ? ` | temps ${this.tempsEvery}s | diskTemps ${this.diskTempsEvery}s` : ' | temperaturas pelos sensores avançados'}).`
    );

    const encoded = encodePowerShellScript(this._buildScript());
    this.process = cp.spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      { windowsHide: true }
    );

    this.process.stdout.on('data', (data) => {
      this.buffer += data.toString('utf8');
      const chunks = this.buffer.split('\n');
      this.buffer = chunks.pop();
      for (const chunk of chunks) {
        const clean = chunk.trim();
        if (!clean.startsWith('{')) continue;
        try { this.emit('data', JSON.parse(clean)); } catch {}
      }
    });

    this.process.stderr.on('data', (data) => {
      const msg = data.toString('utf8').trim();
      if (msg && !msg.startsWith('#< CLIXML') && !msg.startsWith('<Objs')) {
        Logger.warn('SlowSensorDaemon', `PowerShell stderr: ${msg}`);
      }
    });

    this.process.on('error', (err) => {
      Logger.error('SlowSensorDaemon', 'Erro no processo PowerShell', err);
    });

    const child = this.process;
    this.process.on('close', () => {
      // stop()+start() can spawn a new child before this one exits; never clobber the new one.
      if (this.process !== child) return;
      this.process = null;
      this.buffer = '';
      if (this._stopped || this._restarting) return;
      Logger.warn('SlowSensorDaemon', `Daemon encerrou. Reiniciando em ${this._restartDelay}ms...`);
      this._restarting = true;
      setTimeout(() => {
        this._restarting = false;
        if (!this._stopped) this.start();
      }, this._restartDelay);
    });
  }

  stop() {
    this._stopped = true;
    this._restarting = false;
    if (this.process) {
      try { this.process.kill(); } catch {}
      this.process = null;
    }
    this.buffer = '';
  }
}

export default new SlowSensorDaemon();
