import crypto from 'node:crypto';
import cp from 'node:child_process';
import { EventEmitter } from 'node:events';
import Logger from '../../services/LoggerService.js';
import { encodePowerShellScript } from '../../services/PowerShellRunner.js';

const PDH_CSHARP = String.raw`
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public class DarkHubPdh : IDisposable {
    [DllImport("pdh.dll", CharSet = CharSet.Unicode)]
    private static extern uint PdhOpenQueryW(string szDataSource, IntPtr dwUserData, out IntPtr phQuery);

    // Aceita o caminho do contador SEMPRE em ingles, independente do idioma do
    // Windows. E o que viabiliza usar PDH sem quebrar em locales nao ingleses.
    [DllImport("pdh.dll", CharSet = CharSet.Unicode)]
    private static extern uint PdhAddEnglishCounterW(IntPtr hQuery, string szFullCounterPath, IntPtr dwUserData, out IntPtr phCounter);

    [DllImport("pdh.dll")]
    private static extern uint PdhCollectQueryData(IntPtr hQuery);

    [DllImport("pdh.dll")]
    private static extern uint PdhGetFormattedCounterValue(IntPtr hCounter, uint dwFormat, out uint lpdwType, out PDH_FMT_COUNTERVALUE pValue);

    [DllImport("pdh.dll", CharSet = CharSet.Unicode)]
    private static extern uint PdhGetFormattedCounterArrayW(IntPtr hCounter, uint dwFormat, ref uint lpdwBufferSize, ref uint lpdwItemCount, IntPtr ItemBuffer);

    [DllImport("pdh.dll")]
    private static extern uint PdhCloseQuery(IntPtr hQuery);

    [StructLayout(LayoutKind.Explicit)]
    private struct PDH_FMT_COUNTERVALUE {
        [FieldOffset(0)] public uint CStatus;
        [FieldOffset(8)] public double doubleValue;
    }

    private const uint PDH_FMT_DOUBLE = 0x00000200;
    private const uint PDH_FMT_NOCAP100 = 0x00008000;
    private const uint PDH_MORE_DATA = 0x800007D2;

    private IntPtr _query = IntPtr.Zero;
    private readonly List<IntPtr> _single = new List<IntPtr>();
    private readonly List<IntPtr> _multi = new List<IntPtr>();

    public DarkHubPdh() {
        uint rc = PdhOpenQueryW(null, IntPtr.Zero, out _query);
        if (rc != 0) throw new InvalidOperationException("PdhOpenQuery falhou: 0x" + rc.ToString("X8"));
    }

    // Retornam o indice do contador, ou -1 se ele nao existe nesta maquina.
    public int AddSingle(string path) {
        IntPtr h;
        if (PdhAddEnglishCounterW(_query, path, IntPtr.Zero, out h) != 0) return -1;
        _single.Add(h);
        return _single.Count - 1;
    }

    public int AddMulti(string path) {
        IntPtr h;
        if (PdhAddEnglishCounterW(_query, path, IntPtr.Zero, out h) != 0) return -1;
        _multi.Add(h);
        return _multi.Count - 1;
    }

    public void Collect() { PdhCollectQueryData(_query); }

    public double[] ReadSingles() {
        double[] r = new double[_single.Count];
        for (int i = 0; i < _single.Count; i++) {
            uint t;
            PDH_FMT_COUNTERVALUE v;
            r[i] = (PdhGetFormattedCounterValue(_single[i], PDH_FMT_DOUBLE | PDH_FMT_NOCAP100, out t, out v) == 0)
                ? v.doubleValue : 0.0;
        }
        return r;
    }

    // Le um contador com wildcard de instancia. Retorna { soma, maximo }.
    public double[] ReadMulti(int idx) {
        if (idx < 0 || idx >= _multi.Count) return new double[] { 0, 0 };
        IntPtr h = _multi[idx];
        uint size = 0, count = 0;

        // Primeira chamada com buffer nulo apenas descobre o tamanho necessario.
        if (PdhGetFormattedCounterArrayW(h, PDH_FMT_DOUBLE | PDH_FMT_NOCAP100, ref size, ref count, IntPtr.Zero) != PDH_MORE_DATA) {
            return new double[] { 0, 0 };
        }
        if (size == 0) return new double[] { 0, 0 };

        IntPtr buf = Marshal.AllocHGlobal((int)size);
        try {
            if (PdhGetFormattedCounterArrayW(h, PDH_FMT_DOUBLE | PDH_FMT_NOCAP100, ref size, ref count, buf) != 0) {
                return new double[] { 0, 0 };
            }
            double sum = 0, max = 0;
            // PDH_FMT_COUNTERVALUE_ITEM_W = ponteiro szName + PDH_FMT_COUNTERVALUE.
            // O double fica 8 bytes depois do inicio do PDH_FMT_COUNTERVALUE
            // (CStatus + padding de alinhamento).
            int stride = IntPtr.Size + 16;
            int valueOffset = IntPtr.Size + 8;
            for (int i = 0; i < count; i++) {
                IntPtr item = new IntPtr(buf.ToInt64() + (long)i * stride);
                double val = BitConverter.Int64BitsToDouble(Marshal.ReadInt64(item, valueOffset));
                if (double.IsNaN(val) || double.IsInfinity(val)) continue;
                sum += val;
                if (val > max) max = val;
            }
            return new double[] { sum, max };
        } finally {
            Marshal.FreeHGlobal(buf);
        }
    }

    public void Dispose() {
        if (_query != IntPtr.Zero) { PdhCloseQuery(_query); _query = IntPtr.Zero; }
    }
}
`.trim();

const PDH_SOURCE_HASH = crypto.createHash('sha256').update(PDH_CSHARP).digest('hex').slice(0, 12);

class FastSensorDaemon extends EventEmitter {
  constructor() {
    super();
    this.process = null;
    this.buffer = '';
    this._stopped = true;
    this._restarting = false;
    this._restartDelay = 5000;
    this.intervalMs = 1000;
  }

  _buildScript() {
    return [
      "$ErrorActionPreference = 'SilentlyContinue'",
      "$ProgressPreference = 'SilentlyContinue'",

      '[System.Threading.Thread]::CurrentThread.CurrentCulture = [System.Globalization.CultureInfo]::InvariantCulture',

      "$cacheDir = Join-Path $env:LOCALAPPDATA 'DarkHub'",
      `$dllPath = Join-Path $cacheDir 'DarkHubPdh-${PDH_SOURCE_HASH}.dll'`,
      '$loaded = $false',
      'if (Test-Path $dllPath) {',
      '  try { Add-Type -Path $dllPath -ErrorAction Stop; $loaded = $true } catch { $loaded = $false }',
      '}',
      'if (-not $loaded) {',
      "  $src = @'",
      PDH_CSHARP,
      "'@",
      '  try {',
      '    if (-not (Test-Path $cacheDir)) { $null = New-Item -ItemType Directory -Path $cacheDir -Force }',
      '    Add-Type -TypeDefinition $src -OutputAssembly $dllPath -ErrorAction Stop',
      '    Add-Type -Path $dllPath -ErrorAction Stop',
      '  } catch {',
      '    # Sem permissão de escrita no cache: compila apenas em memória.',
      '    Add-Type -TypeDefinition $src -ErrorAction Stop',
      '  }',
      '}',

      '$pdh = New-Object DarkHubPdh',

      "$iDiskRead  = $pdh.AddSingle('\\PhysicalDisk(_Total)\\Disk Read Bytes/sec')",
      "$iDiskWrite = $pdh.AddSingle('\\PhysicalDisk(_Total)\\Disk Write Bytes/sec')",
      "$iDiskTime  = $pdh.AddSingle('\\PhysicalDisk(_Total)\\% Disk Time')",
      "$iDpcQ      = $pdh.AddSingle('\\Processor(_Total)\\DPCs Queued/sec')",
      "$iInts      = $pdh.AddSingle('\\Processor(_Total)\\Interrupts/sec')",
      "$iDpcPct    = $pdh.AddSingle('\\Processor(_Total)\\% DPC Time')",
      "$iIntPct    = $pdh.AddSingle('\\Processor(_Total)\\% Interrupt Time')",

      "$iNetRx  = $pdh.AddMulti('\\Network Interface(*)\\Bytes Received/sec')",
      "$iNetTx  = $pdh.AddMulti('\\Network Interface(*)\\Bytes Sent/sec')",
      "$iGpuUtil = $pdh.AddMulti('\\GPU Engine(*engtype_3D)\\Utilization Percentage')",
      "$iGpuMem  = $pdh.AddMulti('\\GPU Adapter Memory(*)\\Dedicated Usage')",

      '$pdh.Collect()',
      `Start-Sleep -Milliseconds ${this.intervalMs}`,

      '$out = [System.Console]::Out',

      'while ($true) {',
      '  $pdh.Collect()',
      '  $v = $pdh.ReadSingles()',

      '  $rd = 0; if ($iDiskRead -ge 0)  { $rd = [Math]::Round($v[$iDiskRead]) }',
      '  $wr = 0; if ($iDiskWrite -ge 0) { $wr = [Math]::Round($v[$iDiskWrite]) }',
      '  $act = 0; if ($iDiskTime -ge 0) { $act = [Math]::Round($v[$iDiskTime]) }',
      '  if ($act -gt 100) { $act = 100 }',
      `  $out.WriteLine('{"type":"diskIo","readBps":' + $rd + ',"writeBps":' + $wr + ',"activity":' + $act + '}')`,

      '  $dq = 0; if ($iDpcQ -ge 0)   { $dq = [Math]::Round($v[$iDpcQ]) }',
      '  $ir = 0; if ($iInts -ge 0)   { $ir = [Math]::Round($v[$iInts]) }',
      '  $dp = 0; if ($iDpcPct -ge 0) { $dp = [Math]::Round($v[$iDpcPct], 2) }',
      '  $ip = 0; if ($iIntPct -ge 0) { $ip = [Math]::Round($v[$iIntPct], 2) }',
      `  $out.WriteLine('{"type":"latency","dpcsQueued":' + $dq + ',"interrupts":' + $ir + ',"percentDpc":' + $dp + ',"percentInt":' + $ip + '}')`,

      '  if ($iNetRx -ge 0 -or $iNetTx -ge 0) {',
      '    $rx = 0; $tx = 0',
      '    if ($iNetRx -ge 0) { $rx = [Math]::Round(($pdh.ReadMulti($iNetRx))[0]) }',
      '    if ($iNetTx -ge 0) { $tx = [Math]::Round(($pdh.ReadMulti($iNetTx))[0]) }',
      `    $out.WriteLine('{"type":"network","rxBps":' + $rx + ',"txBps":' + $tx + '}')`,
      '  }',

      '  if ($iGpuUtil -ge 0 -or $iGpuMem -ge 0) {',
      '    $gu = 0; $gm = 0',
      '    if ($iGpuUtil -ge 0) { $gu = [Math]::Round(($pdh.ReadMulti($iGpuUtil))[0]) }',
      '    if ($gu -gt 100) { $gu = 100 }',
      '    if ($iGpuMem -ge 0) { $gm = [Math]::Round(($pdh.ReadMulti($iGpuMem))[0] / 1048576) }',
      `    $out.WriteLine('{"type":"gpu","utilization":' + $gu + ',"memoryUsed":' + $gm + '}')`,
      '  }',

      '  $out.Flush()',
      `  Start-Sleep -Milliseconds ${this.intervalMs}`,
      '}'
    ].join('\n');
  }

  start() {
    if (this.process) return;
    this._stopped = false;
    Logger.info('FastSensorDaemon', 'Iniciando coleta PDH de alta frequência (1s).');

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
        Logger.warn('FastSensorDaemon', `PowerShell stderr: ${msg}`);
      }
    });

    this.process.on('error', (err) => {
      Logger.error('FastSensorDaemon', 'Erro no processo PowerShell', err);
    });

    this.process.on('close', () => {
      this.process = null;
      this.buffer = '';
      if (this._stopped || this._restarting) return;
      Logger.warn('FastSensorDaemon', `Daemon encerrou. Reiniciando em ${this._restartDelay}ms...`);
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

export default new FastSensorDaemon();
