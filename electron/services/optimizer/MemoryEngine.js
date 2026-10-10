import os from 'node:os';
import ElevationHelper from './ElevationHelper.js';
import { runPowerShell } from '../PowerShellRunner.js';
import { formatBytes } from './OptimizerUtils.js';

const WS_SKIP = [
  'system', 'idle', 'registry', 'memory compression', 'smss', 'csrss', 'wininit', 'winlogon', 'services', 'lsass', 'lsaiso',
  'dwm', 'fontdrvhost', 'svchost', 'audiodg', 'msmpeng', 'securityhealthservice', 'sihost', 'ctfmon', 'taskhostw'
];

/** Pure: how the before/after free memory numbers are reported. */
export function summarizeMemoryDelta(beforeFree, afterFree) {
  const delta = Number(afterFree) - Number(beforeFree);
  return { deltaBytes: delta, freedBytes: Math.max(0, delta) };
}

class MemoryEngine {
  /**
   * Trims the working set of ordinary user processes and MEASURES what the system reports afterwards.
   * Honest scope: pages leave RAM only until programs touch them again, so the gain is temporary and,
   * on a machine with plenty of free RAM, usually small. Nothing else is touched (the old version also
   * emptied the Recycle Bin and flushed DNS, which has been removed).
   */
  async optimizeRAM() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const totalBytes = os.totalmem();
    const beforeFree = os.freemem();

    const script = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class DhMem {
  [DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
  [DllImport("psapi.dll")] public static extern bool EmptyWorkingSet(IntPtr h);
}
'@
$skip = @(${WS_SKIP.map((n) => `'${n}'`).join(',')})
$ok = 0; $fail = 0; $skipped = 0
foreach ($p in Get-Process) {
  if ($p.Id -le 4 -or $p.Id -eq $PID) { continue }
  if ($skip -contains $p.ProcessName.ToLower()) { $skipped++; continue }
  $h = [DhMem]::OpenProcess(0x0500, $false, $p.Id)
  if ($h -eq [IntPtr]::Zero) { $fail++; continue }
  if ([DhMem]::EmptyWorkingSet($h)) { $ok++ } else { $fail++ }
  [void][DhMem]::CloseHandle($h)
}
Write-Output "DHRAM|$ok|$fail|$skipped"
`;
    let res;
    try {
      res = await runPowerShell(script, { timeoutMs: 60000, trim: true });
    } catch (e) {
      return { ok: false, error: e?.message ?? String(e) };
    }
    const m = /DHRAM\|(\d+)\|(\d+)\|(\d+)/.exec(res.stdout || '');
    if (res.code !== 0 || !m) {
      return { ok: false, error: res.stderr || 'Falha ao reduzir o working set dos processos' };
    }
    const trimmed = Number(m[1]);
    const failed = Number(m[2]);

    await new Promise((r) => setTimeout(r, 1500));
    const afterFree = os.freemem();
    const { deltaBytes, freedBytes } = summarizeMemoryDelta(beforeFree, afterFree);

    const gainText = deltaBytes > 0
      ? `Memória disponível: ${formatBytes(beforeFree)} -> ${formatBytes(afterFree)} (+${formatBytes(deltaBytes)}).`
      : `Memória disponível: ${formatBytes(beforeFree)} -> ${formatBytes(afterFree)} (sem ganho mensurável).`;
    return {
      ok: true,
      measured: true,
      msg: `Working set reduzido em ${trimmed} processo(s)${failed ? `, ${failed} sem permissão` : ''}. ${gainText} Efeito temporário: as páginas voltam conforme os programas as usam.`,
      trimmedProcesses: trimmed,
      failedProcesses: failed,
      before: { free: beforeFree, total: totalBytes, used: totalBytes - beforeFree },
      after: { free: afterFree, total: totalBytes, used: totalBytes - afterFree },
      freedBytes,
      deltaBytes
    };
  }

  /** Delegates to SystemEngine (snapshot + honest "needs reboot" message). Dynamic import avoids a circular import. */
  async adjustTimerResolution() {
    const { default: SystemEngine } = await import('./SystemEngine.js');
    return SystemEngine.applyTimerTuning();
  }

  /**
   * audiodg.exe already runs with High priority through MMCSS on current Windows, and pinning it to ONE core
   * (what this used to do) can only hurt. We now: (1) read the real state, (2) raise priority only if it is lower than High,
   * (3) undo a single-core affinity left by the previous version, (4) read back and report exactly what changed.
   * The change lasts only until the audio engine restarts.
   */
  async optimizeAudioLatency() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const script = `
$ErrorActionPreference = 'Stop'
$a = Get-Process -Name audiodg -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $a) { Write-Output 'DHAUDIO|none'; return }
$cores = [Math]::Min([Environment]::ProcessorCount, 62)
$all = [Int64]([Math]::Pow(2, $cores) - 1)
$prioBefore = $a.PriorityClass.ToString()
$affBefore = [Int64]$a.ProcessorAffinity
if ($prioBefore -ne 'High' -and $prioBefore -ne 'RealTime') { $a.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::High }
if ($affBefore -ne $all) { $a.ProcessorAffinity = [IntPtr]$all }
$a.Refresh()
Write-Output ("DHAUDIO|ok|$prioBefore|" + $a.PriorityClass.ToString() + "|$affBefore|" + [Int64]$a.ProcessorAffinity + "|$all")
`;
    const res = await ElevationHelper.runElevatedPowerShell(script);
    const out = String(res.stdout || '');
    if (/DHAUDIO\|none/.test(out)) {
      return { ok: false, error: 'audiodg.exe não está em execução (ele só inicia quando algum programa usa áudio). Reproduza um som e tente novamente.' };
    }
    const m = /DHAUDIO\|ok\|([^|]*)\|([^|]*)\|(-?\d+)\|(-?\d+)\|(-?\d+)/.exec(out);
    if (res.code !== 0 || !m) return { ok: false, error: res.stderr || 'Falha ao ajustar o processo de áudio (UAC cancelado?)' };
    const [, prioBefore, prioAfter, affBefore, affAfter, all] = m;
    const changedPrio = prioBefore !== prioAfter;
    const changedAff = affBefore !== affAfter;
    const verified = (prioAfter === 'High' || prioAfter === 'RealTime') && affAfter === all;
    let msg;
    if (!changedPrio && !changedAff) msg = `audiodg.exe já estava com prioridade ${prioAfter} e todos os núcleos - nada a alterar (a Microsoft já faz isso por padrão).`;
    else msg = `audiodg.exe: prioridade ${prioBefore} -> ${prioAfter}${changedAff ? '; afinidade restaurada para todos os núcleos' : ''}. Vale apenas até o mecanismo de áudio reiniciar.`;
    return { ok: verified, msg, error: verified ? undefined : 'O Windows não manteve a prioridade/afinidade solicitada', changed: changedPrio || changedAff, verified };
  }
}

export default new MemoryEngine();
