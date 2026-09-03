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

    this.procsEvery = 5;
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

      `$procsEvery = ${this.procsEvery}`,
      `$tempsEvery = ${this.tempsEvery}`,
      `$storageEvery = ${this.storageEvery}`,
      `$diskTempsEvery = ${this.diskTempsEvery}`,

      '$ohmNamespace = $null',
      '$ohmProbed = $false',
      'try {',
      '  Add-Type @"',
      '  using System;',
      '  using System.IO.MemoryMappedFiles;',
      '  using System.Runtime.InteropServices;',
      '  public static class CoreTempReader {',
      '    [StructLayout(LayoutKind.Sequential, Pack = 1)]',
      '    public struct Data {',
      '      [MarshalAs(UnmanagedType.ByValArray, SizeConst = 256)] public uint[] uiLoad;',
      '      [MarshalAs(UnmanagedType.ByValArray, SizeConst = 128)] public uint[] uiTjMax;',
      '      public uint uiCoreCnt;',
      '      public uint uiCPUCnt;',
      '      [MarshalAs(UnmanagedType.ByValArray, SizeConst = 256)] public float[] fTemp;',
      '    }',
      '    public static float GetMaxTemp() {',
      '      try {',
      '        using (var mmf = MemoryMappedFile.OpenExisting("CoreTempMapping")) {',
      '          using (var a = mmf.CreateViewAccessor(0, Marshal.SizeOf(typeof(Data)))) {',
      '            byte[] b = new byte[Marshal.SizeOf(typeof(Data))];',
      '            a.ReadArray(0, b, 0, b.Length);',
      '            GCHandle h = GCHandle.Alloc(b, GCHandleType.Pinned);',
      '            Data d = (Data)Marshal.PtrToStructure(h.AddrOfPinnedObject(), typeof(Data));',
      '            h.Free();',
      '            float max = 0;',
      '            for (int i=0; i < (int)d.uiCoreCnt && i < 256; i++) { if (d.fTemp[i] > max) max = d.fTemp[i]; }',
      '            return max;',
      '          }',
      '        }',
      '      } catch { return -1.0f; }',
      '    }',
      '  }',
      '"@ -ErrorAction SilentlyContinue',
      '} catch {}',
      '',
      '$cores = [Environment]::ProcessorCount',
      'if ($cores -lt 1) { $cores = 1 }',
      '$prevCpu = @{}',
      '$prevStamp = [DateTime]::UtcNow',

      '$tick = 0',
      'while ($true) {',
      '  $tick++',

      '  if (($tick % $procsEvery) -eq 1) {',
      '    try {',
      '      $procs = Get-Process',
      '      $now = [DateTime]::UtcNow',
      '      $dt = ($now - $prevStamp).TotalSeconds',
      '      if ($dt -le 0) { $dt = 1 }',
      '      $curCpu = @{}',
      '      $pct = @{}',
      '      $byId = @{}',
      '      foreach ($p in $procs) {',
      '        $id = $p.Id',
      '        $byId[$id] = $p',
      '        $cpuSec = 0.0',
      '        try { $cpuSec = $p.TotalProcessorTime.TotalSeconds } catch {}',
      '        $curCpu[$id] = $cpuSec',
      '        $val = 0.0',
      '        if ($prevCpu.ContainsKey($id)) {',
      '          $delta = $cpuSec - $prevCpu[$id]',
      '          if ($delta -gt 0) { $val = [Math]::Round((($delta / $dt) / $cores) * 100, 1) }',
      '          if ($val -gt 100) { $val = 100 }',
      '        }',
      '        $pct[$id] = $val',
      '      }',
      '      $prevCpu = $curCpu',
      '      $prevStamp = $now',

      '      $topCpuIds = @($pct.GetEnumerator() | Sort-Object -Property Value -Descending | Select-Object -First 15 | ForEach-Object { $_.Key })',
      '      $topMemProcs = @($procs | Sort-Object -Property WorkingSet64 -Descending | Select-Object -First 15)',

      '      $topCpu = New-Object System.Collections.ArrayList',
      '      foreach ($id in $topCpuIds) {',
      '        $p = $byId[$id]',
      '        if ($null -eq $p) { continue }',
      '        $null = $topCpu.Add([PSCustomObject]@{ name = $p.ProcessName; pid = $id; cpu = $pct[$id]; memRss = $p.WorkingSet64 })',
      '      }',
      '      $topMem = New-Object System.Collections.ArrayList',
      '      foreach ($p in $topMemProcs) {',
      '        $c = 0.0',
      '        if ($pct.ContainsKey($p.Id)) { $c = $pct[$p.Id] }',
      '        $null = $topMem.Add([PSCustomObject]@{ name = $p.ProcessName; pid = $p.Id; cpu = $c; memRss = $p.WorkingSet64 })',
      '      }',
      "      Emit ([PSCustomObject]@{ type = 'procs'; all = $procs.Count; topCpu = @($topCpu); topMem = @($topMem) })",
      '    } catch {}',
      '  }',

      '  if (($tick % $tempsEvery) -eq 2) {',
      '    $ctT = -1.0',
      '    try { $ctT = [CoreTempReader]::GetMaxTemp() } catch {}',
      '    if ($ctT -gt 20.0) {',
      "      Emit ([PSCustomObject]@{ type = 'hwmonTemps'; source = 'CoreTemp'; cpuTempC = [Math]::Round($ctT, 1); gpuTempC = $null })",
      '    }',
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
      "          $cpuMatch = $sensors | Where-Object { $_.Name -like '*CPU*' -or $_.Name -like '*Package*' -or $_.Name -like '*Tdie*' } | Sort-Object Value -Descending | Select-Object -First 1",
      '          if ($cpuMatch) { $cpuT = $cpuMatch.Value }',
      "          $gpuMatch = $sensors | Where-Object { $_.Name -like '*GPU*' -or $_.Name -like '*Radeon*' } | Sort-Object Value -Descending | Select-Object -First 1",
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

      '  if (($tick % $diskTempsEvery) -eq 3) {',
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
      `Iniciando coleta de baixa frequência (procs ${this.procsEvery}s | temps ${this.tempsEvery}s | storage ${this.storageEvery}s | diskTemps ${this.diskTempsEvery}s).`
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

    this.process.on('close', () => {
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
