# End-to-end test of DarkHub.PacerHook on a Present / Present1 (IDXGISwapChain1) loop, x64 and x86.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\gpu-harness\run_pacer.ps1 [-Fps 60] [-Scenario all|cap|earlyfree]
#
# Needs: cargo build --release --manifest-path tools\gpu-harness\dxgi_harness\Cargo.toml [--target i686-pc-windows-msvc]
# Drives electron\services\DarkHub.FrameLimiter.exe exactly like FramePacerEngine.js (<fps> <mode> args, stdin kept
# open, STOP/EOF to stop) but always with --target-pid <harness pid>, so it never auto-detects or touches a game.
# x86 targets go through DarkHub.PacerInject.x86.exe (the limiter does that by itself). Prints one JSON line per test.
param([int]$Fps = 60, [string]$Scenario = 'all')
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$limiter = Join-Path $root 'electron\services\DarkHub.FrameLimiter.exe'
$app64 = Join-Path $PSScriptRoot 'dxgi_harness\target\release\dxgi_harness.exe'
$app32 = Join-Path $PSScriptRoot 'dxgi_harness\target\i686-pc-windows-msvc\release\dxgi_harness.exe'
foreach ($f in $limiter, $app64, $app32) { if (-not (Test-Path $f)) { throw "missing $f (see README)" } }
$work = Join-Path $env:TEMP ('pacer-harness-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory $work | Out-Null

function Start-App([string]$exe, [string]$mode, [int]$seconds, [string]$extra = '') {
  $out = Join-Path $work ("app-$mode-" + [guid]::NewGuid().ToString('N').Substring(0, 6) + '.txt')
  $argList = @($mode, $seconds) + @($extra.Split(' ', [StringSplitOptions]::RemoveEmptyEntries))
  $p = Start-Process $exe -ArgumentList $argList -PassThru -RedirectStandardOutput $out -WindowStyle Normal
  $null = $p.Handle  # cache the handle now, otherwise ExitCode is $null after the process ends
  $deadline = (Get-Date).AddSeconds(10)
  while (-not (Test-Path $out) -or -not (Get-Content $out -ErrorAction SilentlyContinue | Select-Object -First 1)) {
    if ((Get-Date) -gt $deadline) { throw "harness $mode did not start" }
    Start-Sleep -Milliseconds 50
  }
  [pscustomobject]@{ Proc = $p; Out = $out; Started = [Diagnostics.Stopwatch]::StartNew() }
}
function Get-Lines($app) { @(Get-Content $app.Out -ErrorAction SilentlyContinue | Where-Object { $_ -like '{*' } | ForEach-Object { $_ | ConvertFrom-Json }) }
function Mean-Fps($app, [int]$from, [int]$to) {
  $s = @(Get-Lines $app | Where-Object { $null -ne $_.fps -and $_.t -ge $from -and $_.t -le $to })
  if ($s.Count -eq 0) { return $null }
  [math]::Round((($s | Measure-Object fps -Average).Average), 1)
}
function Wait-AppSecond($app, [double]$t) { while ($app.Started.Elapsed.TotalSeconds -lt $t) { Start-Sleep -Milliseconds 20 } }

function Start-Limiter([int]$targetPid) {
  $log = Join-Path $work ('limiter-' + [guid]::NewGuid().ToString('N').Substring(0, 6) + '.txt')
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName = 'cmd.exe'
  # same positional args as FramePacerEngine.js (+ --target-pid so only the harness is ever targeted)
  $psi.Arguments = "/c `"`"$limiter`" $Fps flatline --adapter-luid 0 --target-pid $targetPid > `"$log`" 2>&1`""
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput = $true
  $psi.CreateNoWindow = $true
  $cmd = [Diagnostics.Process]::Start($psi)
  $child = $null
  $deadline = (Get-Date).AddSeconds(5)
  while (-not $child -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 30
    $child = Get-CimInstance Win32_Process -Filter "ParentProcessId=$($cmd.Id) AND Name='DarkHub.FrameLimiter.exe'" | Select-Object -First 1
  }
  if (-not $child) { throw 'limiter did not start' }
  [pscustomobject]@{ Cmd = $cmd; Pid = [int]$child.ProcessId; Log = $log }
}
function Stop-LimiterGracefully($l) {
  # what FramePacerEngine does on stop: STOP line, then the pipe closes
  try { $l.Cmd.StandardInput.WriteLine('STOP'); $l.Cmd.StandardInput.Close() } catch {}
  $deadline = (Get-Date).AddSeconds(5)
  while ((Get-Process -Id $l.Pid -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 50 }
  [bool](Get-Process -Id $l.Pid -ErrorAction SilentlyContinue)
}
function Kill-Limiter($l) {
  Stop-Process -Id $l.Pid -Force -ErrorAction SilentlyContinue
  try { $l.Cmd.StandardInput.Close() } catch {}
}
function Last-Status($l) {
  $line = Get-Content $l.Log -ErrorAction SilentlyContinue | Where-Object { $_ -like '{*' } | Select-Object -Last 1
  if ($line) { $j = $line | ConvertFrom-Json; return "$($j.injectStatus) | $($j.driverMethod) | $($j.method) | fps=$($j.fps)" }
  (Get-Content $l.Log -ErrorAction SilentlyContinue | Select-Object -Last 2) -join ' '
}
function App-Result($app) {
  $alive = -not $app.Proc.HasExited
  if ($alive) { Stop-Process -Id $app.Proc.Id -Force -ErrorAction SilentlyContinue; return 'killed-by-test(still running)' }
  $code = $app.Proc.ExitCode
  $exitLine = Get-Lines $app | Where-Object event -eq 'exit'
  if ($code -eq 0 -and $exitLine) { return "exit 0 (clean, frames=$($exitLine.frames) badHr=$($exitLine.badHr))" }
  return ('exit 0x{0:X8} (CRASH?)' -f $code)
}

# uncapped -> limiter -> graceful STOP -> limiter again -> TerminateProcess (heartbeat goes stale) -> app exits by itself
function Test-Cap([string]$label, [string]$exe, [string]$mode) {
  $app = Start-App $exe $mode 36
  try {
    Wait-AppSecond $app 3.2
    $uncapped = Mean-Fps $app 1 3
    $l = Start-Limiter $app.Proc.Id
    Wait-AppSecond $app 11.2
    $capped = Mean-Fps $app 7 11
    $status = Last-Status $l
    $lingered = Stop-LimiterGracefully $l
    Wait-AppSecond $app 16.2
    $afterStop = Mean-Fps $app 14 16
    $l2 = Start-Limiter $app.Proc.Id
    Wait-AppSecond $app 24.2
    $recapped = Mean-Fps $app 20 24
    Kill-Limiter $l2
    $killAt = $app.Started.Elapsed.TotalSeconds
    Wait-AppSecond $app 31.2
    $after = @(Get-Lines $app | Where-Object { $null -ne $_.fps -and $_.t -gt [math]::Floor($killAt) -and $_.t -le 31 })
    $lift = $after | Where-Object { $_.fps -gt 2 * $Fps } | Select-Object -First 1
    $afterKill = Mean-Fps $app 28 31
    while (-not $app.Proc.HasExited -and $app.Started.Elapsed.TotalSeconds -lt 45) { Start-Sleep -Milliseconds 200 }
    [pscustomobject]@{ test = 'cap'; target = $label; targetFps = $Fps; uncappedFps = $uncapped; cappedFps = $capped; limiter = $status
      afterGracefulStopFps = $afterStop; limiterLingeredAfterStop = $lingered; recappedFps = $recapped
      afterKillFps = $afterKill; liftedWithinS = if ($lift) { [math]::Round($lift.t - $killAt, 2) } else { $null }
      hookStillMapped = (Get-Lines $app | Where-Object { $null -ne $_.fps } | Select-Object -Last 1).hook; app = (App-Result $app) } | ConvertTo-Json -Compress
  } finally { if (-not $app.Proc.HasExited) { Stop-Process -Id $app.Proc.Id -Force -ErrorAction SilentlyContinue } }
}

# The harness FreeLibrary()s the hook <ms> after it appears (init thread still in its 500 ms sleep). The module must stay
# mapped (pinned by the init thread), keep working, and unmap itself when the init thread ends (~30.5 s after load) -
# with the main thread presenting the whole time - without crashing the process.
function Test-EarlyFree([string]$label, [string]$exe, [string]$mode, [int]$ms) {
  $app = Start-App $exe $mode 44 "--free-hook-after-ms $ms"
  try {
    Wait-AppSecond $app 2.2
    $uncapped = Mean-Fps $app 1 2
    $l = Start-Limiter $app.Proc.Id
    Wait-AppSecond $app 9.2
    $capped = Mean-Fps $app 6 9
    $status = Last-Status $l
    while (-not $app.Proc.HasExited -and $app.Started.Elapsed.TotalSeconds -lt 43) { Start-Sleep -Milliseconds 200 }
    $lines = Get-Lines $app
    $free = $lines | Where-Object event -eq 'freelibrary' | Select-Object -First 1
    $unmap = $lines | Where-Object { $_.event -eq 'hook_mapped_changed' -and -not $_.mapped } | Select-Object -First 1
    $tail = if ($unmap) { Mean-Fps $app ([int][math]::Ceiling($unmap.atS) + 1) 43 } else { $null }
    Kill-Limiter $l
    while (-not $app.Proc.HasExited -and $app.Started.Elapsed.TotalSeconds -lt 50) { Start-Sleep -Milliseconds 200 }
    [pscustomobject]@{ test = 'earlyfree'; target = $label; freeAfterMs = $ms; uncappedFps = $uncapped; cappedAfterFreeFps = $capped; limiter = $status
      hookSeenAtS = $free.seenAtS; freedAtS = $free.freedAtS; freeOk = $free.ok; stillMappedAfterFree = $free.stillMapped
      unmappedAtS = $unmap.atS; fpsAfterUnmapWithLimiterAlive = $tail; app = (App-Result $app) } | ConvertTo-Json -Compress
  } finally { if (-not $app.Proc.HasExited) { Stop-Process -Id $app.Proc.Id -Force -ErrorAction SilentlyContinue } }
}

if ($Scenario -in 'all', 'cap') {
  Test-Cap 'x64 Present' $app64 'present'
  Test-Cap 'x64 Present1' $app64 'present1'
  Test-Cap 'x64 Present+Present1 alternating' $app64 'alt'
  Test-Cap 'x86 Present (helper)' $app32 'present'
  Test-Cap 'x86 Present1 (helper)' $app32 'present1'
}
if ($Scenario -in 'all', 'earlyfree') {
  Test-EarlyFree 'x64 Present1' $app64 'present1' 100
  Test-EarlyFree 'x64 Present' $app64 'present' 0
  Test-EarlyFree 'x86 Present1 (helper)' $app32 'present1' 100
}
Write-Host "raw output: $work"
