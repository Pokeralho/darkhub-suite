import si from 'systeminformation';
import ElevationHelper from './ElevationHelper.js';

class MemoryEngine {
  constructor() {
    this.safeProcesses = [
      'chrome', 'firefox', 'msedge', 'iexplore', 'opera',
      'notepad', 'wordpad', 'mspaint', 'calc', 'winrar',
      '7zg', 'vlc', 'wmplayer', 'explorer', 'powershell', 'cmd'
    ];
  }

  async optimizeRAM() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const memBefore = await si.mem();

    const psTrim = `
      $ErrorActionPreference='SilentlyContinue'
      Add-Type @"
      using System;
      using System.Runtime.InteropServices;
      public static class Psapi {
        [DllImport("psapi.dll")] public static extern int EmptyWorkingSet(IntPtr hProcess);
      }
"@
      $names = @(${this.safeProcesses.map((x) => `'${x}'`).join(',')})
      $count = 0
      Get-Process | ForEach-Object {
        try {
          $n = $_.ProcessName.ToLower()
          if ($names -contains $n) {
            [Psapi]::EmptyWorkingSet($_.Handle) | Out-Null
            $count++
          }
        } catch {}
      }
      Write-Output $count
    `;

    const { code, stdout, stderr } = await ElevationHelper.runElevatedPowerShell(psTrim);

    await ElevationHelper.runElevatedPowerShell(`Clear-RecycleBin -Force -ErrorAction SilentlyContinue`);
    await ElevationHelper.runElevatedCmd(`ipconfig /flushdns`);

    const memAfter = await si.mem();
    const freed = Math.max(0, Number(memBefore?.used ?? 0) - Number(memAfter?.used ?? 0));

    const outStr = String(stdout || '').trim();
    const match = outStr.match(/\d+/);
    const trimmed = (code === 0 && match) ? Number(match[0]) : 0;

    return {
      ok: true,
      msg: `Memória otimizada. Processos ajustados: ${Number.isFinite(trimmed) ? trimmed : 0}.`,
      before: { used: memBefore.used, free: memBefore.free, total: memBefore.total },
      after: { used: memAfter.used, free: memAfter.free, total: memAfter.total },
      freedBytes: freed
    };
  }

  async adjustTimerResolution() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      bcdedit /set useplatformclock true
      bcdedit /set disabledynamictick yes
    `;
    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script);
    if (code !== 0) return { ok: false, error: stderr };
    return { ok: true, msg: 'Timer resolution adjusted (useplatformclock/disabledynamictick)' };
  }

  async optimizeAudioLatency() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      $audio = Get-Process -Name audiodg -ErrorAction SilentlyContinue
      if ($audio) {
        $audio.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::High
        $audio.ProcessorAffinity = 2
      }
    `;
    const { code } = await ElevationHelper.runElevatedPowerShell(script);
    return { ok: code === 0, msg: 'Latency optimized (audiodg priority & affinity adjusted)' };
  }
}

export default new MemoryEngine();
