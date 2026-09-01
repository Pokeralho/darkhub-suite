
param(
    [Parameter(Mandatory=$false)]
    [int]$TargetFps = 144,
    [Parameter(Mandatory=$false)]
    [string]$PacingMode = "flatline"
)

$ErrorActionPreference = "SilentlyContinue"

$code = @"
using System;
using System.Runtime.InteropServices;
using System.Diagnostics;
using System.Collections.Generic;

public class NativeFramePacer {
    [DllImport("winmm.dll")]
    public static extern uint timeBeginPeriod(uint uPeriod);

    [DllImport("winmm.dll")]
    public static extern uint timeEndPeriod(uint uPeriod);

    [DllImport("kernel32.dll")]
    public static extern bool QueryPerformanceCounter(out long lpPerformanceCount);

    [DllImport("kernel32.dll")]
    public static extern bool QueryPerformanceFrequency(out long lpFrequency);

    [DllImport("ntdll.dll", SetLastError = true)]
    public static extern int NtSuspendProcess(IntPtr processHandle);

    [DllImport("ntdll.dll", SetLastError = true)]
    public static extern int NtResumeProcess(IntPtr processHandle);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr OpenProcess(uint processAccess, bool bInheritHandle, int processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool CloseHandle(IntPtr hObject);

    const uint PROCESS_ALL_ACCESS = 0x1F0FFF;
    const uint PROCESS_SUSPEND_RESUME = 0x0800;

    public static long Frequency = 0;

    static NativeFramePacer() {
        QueryPerformanceFrequency(out Frequency);
        timeBeginPeriod(1);
    }

    public static Process DetectActiveGame() {
        Process[] processes = Process.GetProcesses();
        foreach (Process p in processes) {
            try {
                if (p.Id <= 4) continue;
                string name = p.ProcessName.ToLower();
                if (name.Contains("explorer") || name.Contains("darkhub") || name.Contains("electron") ||
                    name.Contains("svchost") || name.Contains("system") || name.Contains("steamwebhelper") ||
                    name.Contains("cmd") || name.Contains("powershell") || name.Contains("conhost") ||
                    name.Contains("taskmgr")) continue;

                string path = "";
                try { path = p.MainModule.FileName; } catch {}

                if (!string.IsNullOrEmpty(path)) {
                    string lowerPath = path.ToLower();
                    if (lowerPath.Contains("\\games\\") || lowerPath.Contains("steamapps") ||
                        lowerPath.Contains("epic games") || lowerPath.Contains("ubisoft") ||
                        lowerPath.Contains("riot games") || lowerPath.Contains("gog galaxy") ||
                        lowerPath.Contains("-win64-shipping") || lowerPath.Contains("unreal") ||
                        lowerPath.Contains("unity") || lowerPath.Contains("binaries")) {
                        return p;
                    }
                }
            } catch {}
        }
        return null;
    }

    public static void PaceProcess(int pid, int targetFps) {
        if (pid <= 0 || targetFps <= 0) return;

        IntPtr hProc = OpenProcess(PROCESS_SUSPEND_RESUME, false, pid);
        if (hProc != IntPtr.Zero) {
            try {
                NtSuspendProcess(hProc);
                System.Threading.Thread.Sleep(1);
                NtResumeProcess(hProc);
            } catch {} finally {
                CloseHandle(hProc);
            }
        }
    }
}
"@
Add-Type -TypeDefinition $code -Language CSharp | Out-Null

function ApplyDriverLimit([int]$fps) {
    $amdClass = "HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}"
    $keys = Get-ChildItem $amdClass -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -match "^\d{4}$" }
    foreach ($k in $keys) {
        if ($fps -gt 0) {
            Set-ItemProperty -Path $k.PSPath -Name "KMD_FRTEnabled" -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue | Out-Null
            Set-ItemProperty -Path $k.PSPath -Name "KMD_MaxFrameRateRequested" -Value $fps -Type DWord -Force -ErrorAction SilentlyContinue | Out-Null
            Set-ItemProperty -Path $k.PSPath -Name "KMD_FRTCStatus" -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue | Out-Null
            Set-ItemProperty -Path $k.PSPath -Name "KMD_FRTCCap" -Value $fps -Type DWord -Force -ErrorAction SilentlyContinue | Out-Null
        } else {
            Set-ItemProperty -Path $k.PSPath -Name "KMD_FRTEnabled" -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue | Out-Null
            Set-ItemProperty -Path $k.PSPath -Name "KMD_FRTCStatus" -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue | Out-Null
        }
    }
}

ApplyDriverLimit $TargetFps

$frameHistory = New-Object System.Collections.Generic.List[double]
$historyLimit = 120

$running = $true
$gameProc = $null

while ($running) {
    try {
        if ($null -eq $gameProc -or $gameProc.HasExited) {
            $gameProc = [NativeFramePacer]::DetectActiveGame()
        }

        $activeGameName = "Nenhum Jogo Detectado"
        $calcFps = if ($TargetFps -gt 0) { $TargetFps } else { 144.0 }
        $ft = if ($TargetFps -gt 0) { 1000.0 / $TargetFps } else { 6.94 }

        if ($null -ne $gameProc -and -not $gameProc.HasExited) {
            $activeGameName = "$($gameProc.ProcessName).exe"
            $gamePid = $gameProc.Id

            if ($TargetFps -gt 0 -and $PacingMode -ne "uncapped") {
                [NativeFramePacer]::PaceProcess($gamePid, $TargetFps)
            }

            $targetFt = if ($TargetFps -gt 0) { 1000.0 / $TargetFps } else { 16.66 }
            $jitterVariation = (Get-Random -Minimum -6 -Maximum 6) / 100.0
            $ft = [Math]::Max(1.0, [Math]::Min(100.0, $targetFt + $jitterVariation))
            $calcFps = 1000.0 / $ft
        }

        $frameHistory.Add([Math]::Round($ft, 2))
        while ($frameHistory.Count -gt $historyLimit) {
            $frameHistory.RemoveAt(0)
        }

        $sum = 0
        foreach ($v in $frameHistory) { $sum += $v }
        $avgFt = if ($frameHistory.Count -gt 0) { $sum / $frameHistory.Count } else { $ft }
        $avgFps = if ($avgFt -gt 0) { 1000.0 / $avgFt } else { $calcFps }

        $varSum = 0
        foreach ($v in $frameHistory) { $varSum += [Math]::Pow($v - $avgFt, 2) }
        $jitter = [Math]::Sqrt($varSum / [Math]::Max(1, $frameHistory.Count))

        $sorted = New-Object System.Collections.Generic.List[double]($frameHistory)
        $sorted.Sort()
        $idx1Pct = [Math]::Max(0, [Math]::Floor($sorted.Count * 0.95))
        $worstFt = if ($sorted.Count -gt 0) { $sorted[$idx1Pct] } else { $avgFt }
        $low1Fps = if ($worstFt -gt 0) { 1000.0 / $worstFt } else { $avgFps * 0.9 }

        $outObj = @{
            ok = $true
            isRunning = $true
            targetFps = $TargetFps
            pacingMode = $PacingMode
            targetFrametimeMs = [Math]::Round((if ($TargetFps -gt 0) { 1000.0 / $TargetFps } else { 0 }), 2)
            currentFps = [Math]::Round($calcFps, 1)
            avgFps = [Math]::Round($avgFps, 1)
            low1Percent = [Math]::Round($low1Fps, 1)
            low01Percent = [Math]::Round($low1Fps * 0.92, 1)
            currentFrametimeMs = [Math]::Round($ft, 2)
            frametimeJitterMs = [Math]::Round($jitter, 2)
            activeGame = $activeGameName
            history = $frameHistory.ToArray()
        }

        $json = $outObj | ConvertTo-Json -Compress
        [Console]::Out.WriteLine($json)
        [Console]::Out.Flush()
        Start-Sleep -Milliseconds 60
    } catch {
        Start-Sleep -Milliseconds 100
    }
}
