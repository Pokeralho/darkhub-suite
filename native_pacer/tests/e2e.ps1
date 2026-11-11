# End-to-end check of the DarkPacer frame limiter on this machine (Windows PowerShell 5.1).
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File native_pacer/tests/e2e.ps1 [-Scenario all|cap|safety|luid] [-Fps 60]
#
# Needs: npm run build:native, npm run build:pacer, and the test app:
#   cargo build --release --example pacer_testapp --manifest-path native_pacer/Cargo.toml [--target i686-pc-windows-msvc]
# Every process it starts is a test app it also started (DarkHub.FrameLimiter.exe always gets
# --target-pid, never game auto-detection). Results are printed as JSON lines.
param([string]$Scenario = 'all', [int]$Fps = 60)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$svc = Join-Path $root 'electron\services'
$limiter = Join-Path $svc 'DarkHub.FrameLimiter.exe'
$app64 = Join-Path $root 'native_pacer\target\x86_64-pc-windows-msvc\release\examples\pacer_testapp.exe'
$app32 = Join-Path $root 'native_pacer\target\i686-pc-windows-msvc\release\examples\pacer_testapp.exe'
$work = Join-Path $env:TEMP ('pacer-e2e-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory $work | Out-Null

function Start-App([string]$exe, [string]$mode, [int]$seconds) {
  $out = Join-Path $work ("app-$mode-" + [guid]::NewGuid().ToString('N').Substring(0, 6) + '.txt')
  $p = Start-Process $exe -ArgumentList $mode, $seconds -PassThru -RedirectStandardOutput $out -WindowStyle Normal
  $deadline = (Get-Date).AddSeconds(10)
  while (-not (Test-Path $out) -or -not (Get-Content $out -ErrorAction SilentlyContinue | Select-Object -First 1)) {
    if ((Get-Date) -gt $deadline) { throw "test app $mode did not start" }
    Start-Sleep -Milliseconds 100
  }
  [pscustomobject]@{ Proc = $p; Out = $out; Started = [Diagnostics.Stopwatch]::StartNew(); Info = (Get-Content $out -First 1 | ConvertFrom-Json) }
}

function Get-Samples($app) {
  Get-Content $app.Out | Where-Object { $_ -match '"fps"' } | ForEach-Object { $_ | ConvertFrom-Json }
}

function Mean-Fps($app, [int]$from, [int]$to) {
  $s = @(Get-Samples $app | Where-Object { $_.t -ge $from -and $_.t -le $to })
  if ($s.Count -eq 0) { return $null }
  [math]::Round((($s | Measure-Object fps -Average).Average), 1)
}

# The limiter's stdin must stay open (EOF = STOP), so it runs under a cmd that holds the pipe.
function Start-Limiter([int]$targetPid, [string]$extra = '') {
  $log = Join-Path $work ('limiter-' + [guid]::NewGuid().ToString('N').Substring(0, 6) + '.txt')
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName = 'cmd.exe'
  $psi.Arguments = "/c `"`"$limiter`" $Fps flatline --target-pid $targetPid $extra > `"$log`" 2>&1`""
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput = $true
  $psi.CreateNoWindow = $true
  $cmd = [Diagnostics.Process]::Start($psi)
  $child = $null
  $deadline = (Get-Date).AddSeconds(5)
  while (-not $child -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 50
    $child = Get-CimInstance Win32_Process -Filter "ParentProcessId=$($cmd.Id) AND Name='DarkHub.FrameLimiter.exe'" | Select-Object -First 1
  }
  if (-not $child) { throw 'limiter did not start' }
  [pscustomobject]@{ Cmd = $cmd; Pid = [int]$child.ProcessId; Log = $log }
}

function Kill-Limiter($l) {
  # Simulates a crash: TerminateProcess, no STOP, no ResetCap.
  Stop-Process -Id $l.Pid -Force -ErrorAction SilentlyContinue
  try { $l.Cmd.StandardInput.Close() } catch {}
}

function Last-Status($l) {
  $line = Get-Content $l.Log -ErrorAction SilentlyContinue | Where-Object { $_ -like '{*' } | Select-Object -Last 1
  if ($line) { $j = $line | ConvertFrom-Json; return "$($j.injectStatus) $($j.driverMethod)" }
  (Get-Content $l.Log -ErrorAction SilentlyContinue | Select-Object -Last 2) -join ' '
}

function Wait-AppSecond($app, [int]$t) {
  while ($app.Started.Elapsed.TotalSeconds -lt $t) { Start-Sleep -Milliseconds 50 }
}

# Uncapped -> capped -> controller killed (cap must lift within the 2 s heartbeat window) ->
# new controller (cap must come back on the already-loaded hook).
function Test-Cap([string]$label, [string]$exe, [string]$mode) {
  $app = Start-App $exe $mode 34
  try {
    Wait-AppSecond $app 4
    $uncapped = Mean-Fps $app 2 4
    $l = Start-Limiter $app.Proc.Id
    Wait-AppSecond $app 13
    $capped = Mean-Fps $app 8 13
    $status = Last-Status $l
    $killAt = $app.Started.Elapsed.TotalSeconds
    Kill-Limiter $l
    Wait-AppSecond $app 21
    $after = @(Get-Samples $app | Where-Object { $_.t -gt [math]::Floor($killAt) -and $_.t -le 21 })
    $lift = $after | Where-Object { $_.fps -gt 2 * $Fps } | Select-Object -First 1
    $liftSec = if ($lift) { [math]::Round($lift.t - $killAt, 2) } else { $null }
    $perSecond = ($after | ForEach-Object { "$($_.t):$([math]::Round($_.fps))" }) -join ' '
    $l2 = Start-Limiter $app.Proc.Id
    Wait-AppSecond $app 29
    $recapped = Mean-Fps $app 25 29
    Kill-Limiter $l2
    [pscustomobject]@{ test = "cap"; target = $label; uncappedFps = $uncapped; cappedFps = $capped; limiter = $status;
      killedAtS = [math]::Round($killAt, 2); liftedWithinS = $liftSec; afterKillPerSecond = $perSecond; recappedFps = $recapped } | ConvertTo-Json -Compress
  } finally {
    Stop-Process -Id $app.Proc.Id -Force -ErrorAction SilentlyContinue
  }
}

function Inject-Once([int]$targetPid, [string]$extra = '') {
  $out = & $limiter --inject $targetPid $extra.Split(' ', [StringSplitOptions]::RemoveEmptyEntries)
  "$out"
}

function Test-Safety {
  # 1. Wrong (recycled) creation time: refused before anything is written into the process.
  foreach ($pair in @(@('x64', $app64), @('x86', $app32))) {
    $app = Start-App $pair[1] 'd3d11' 8
    try {
      $r = Inject-Once $app.Proc.Id '--creation 133000000000000000'
      [pscustomobject]@{ test = 'stale_creation_time'; target = $pair[0]; result = $r } | ConvertTo-Json -Compress
    } finally { Stop-Process -Id $app.Proc.Id -Force -ErrorAction SilentlyContinue }
  }
  # 2. The x86 helper re-verifies by itself: wrong creation time, a 64-bit target, an x64 DLL.
  $helper = Join-Path $svc 'DarkHub.PacerInject.x86.exe'
  $app = Start-App $app32 'd3d11' 8
  try {
    $r = & $helper $app.Proc.Id 133000000000000000 (Join-Path $svc 'DarkHub.PacerHook.x86.dll')
    [pscustomobject]@{ test = 'helper_stale_creation'; exit = $LASTEXITCODE; result = "$r" } | ConvertTo-Json -Compress
    $c = [Diagnostics.Process]::GetProcessById($app.Proc.Id).StartTime.ToFileTimeUtc()  # full 100 ns precision (WMI rounds to us)
    $r = & $helper $app.Proc.Id $c (Join-Path $svc 'DarkHub.PacerHook.x64.dll')
    [pscustomobject]@{ test = 'helper_x64_dll_into_x86'; exit = $LASTEXITCODE; result = "$r" } | ConvertTo-Json -Compress
  } finally { Stop-Process -Id $app.Proc.Id -Force -ErrorAction SilentlyContinue }
  $app = Start-App $app64 'd3d11' 8
  try {
    $c = [Diagnostics.Process]::GetProcessById($app.Proc.Id).StartTime.ToFileTimeUtc()  # full 100 ns precision (WMI rounds to us)
    $r = & $helper $app.Proc.Id $c (Join-Path $svc 'DarkHub.PacerHook.x86.dll')
    [pscustomobject]@{ test = 'helper_into_x64_process'; exit = $LASTEXITCODE; result = "$r" } | ConvertTo-Json -Compress
  } finally { Stop-Process -Id $app.Proc.Id -Force -ErrorAction SilentlyContinue }
  # 3. A game shipped with an anti-cheat folder is refused.
  $acDir = Join-Path $work 'acgame'
  New-Item -ItemType Directory (Join-Path $acDir 'EasyAntiCheat') -Force | Out-Null
  Copy-Item $app64 (Join-Path $acDir 'acgame.exe')
  $app = Start-App (Join-Path $acDir 'acgame.exe') 'd3d11' 8
  try {
    $r = Inject-Once $app.Proc.Id
    $loaded = @(Get-Process -Id $app.Proc.Id).Modules | Where-Object { $_.ModuleName -like 'DarkHub.PacerHook*' }
    [pscustomobject]@{ test = 'anticheat_folder'; result = $r; hookLoaded = [bool]$loaded } | ConvertTo-Json -Compress
  } finally { Stop-Process -Id $app.Proc.Id -Force -ErrorAction SilentlyContinue }
}

# Adapter filter: the controller selects an adapter LUID; swap chains on another adapter are not paced.
function Test-Luid {
  $probe = Start-App $app64 'd3d11-warp' 3
  $warp = $probe.Info.luid
  Start-Sleep 3
  $probe = Start-App $app64 'd3d11' 3
  $hw = $probe.Info.luid
  Start-Sleep 3
  foreach ($case in @(@('d3d11', $hw, 'match'), @('d3d11', $warp, 'other_adapter'), @('d3d11-warp', $hw, 'other_adapter'), @('gl', $hw, 'unattributable'))) {
    $app = Start-App $app64 $case[0] 14
    try {
      Wait-AppSecond $app 3
      $un = Mean-Fps $app 1 3
      $l = Start-Limiter $app.Proc.Id "--adapter-luid $($case[1])"
      Wait-AppSecond $app 12
      $cap = Mean-Fps $app 7 12
      Kill-Limiter $l
      [pscustomobject]@{ test = 'luid'; app = $case[0]; appLuid = $app.Info.luid; selectedLuid = $case[1]; expect = $case[2]; uncappedFps = $un; withLimiterFps = $cap } | ConvertTo-Json -Compress
    } finally { Stop-Process -Id $app.Proc.Id -Force -ErrorAction SilentlyContinue }
  }
}

if ($Scenario -in 'all', 'cap') {
  Test-Cap 'x64 D3D11' $app64 'd3d11'
  Test-Cap 'x86 D3D11 (WOW64, via helper)' $app32 'd3d11'
  Test-Cap 'x64 OpenGL SwapBuffers (import)' $app64 'gl'
  Test-Cap 'x64 OpenGL SwapBuffers (GetProcAddress)' $app64 'gl-gpa'
  Test-Cap 'x64 OpenGL wglSwapBuffers (import)' $app64 'gl-wgl'
  Test-Cap 'x86 OpenGL SwapBuffers (WOW64)' $app32 'gl'
  Test-Cap 'x86 OpenGL SwapBuffers (WOW64, GetProcAddress)' $app32 'gl-gpa'
}
if ($Scenario -in 'all', 'safety') { Test-Safety }
if ($Scenario -in 'all', 'luid') { Test-Luid }
Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
