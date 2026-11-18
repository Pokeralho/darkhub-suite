# Runs vk_harness against the DarkHub low-latency Vulkan layer in every mode the app supports.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\gpu-harness\run_vk.ps1 [-Frames 2000] [-Only <name-regex>]
#
# Needs: cargo build --release --manifest-path tools\gpu-harness\vk_harness\Cargo.toml
# No admin, no registry: the layer is loaded through the loader's VK_ADD_IMPLICIT_LAYER_PATH pointing at a temp copy
# of electron\services\lowlatency, enabled by the manifest's enable_environment (LOW_LATENCY_LAYER=1), with
# LOW_LATENCY_LAYER_REFLEX=1 for the reflex mode - the same variables LowLatencyLayerService.js sets.
# Other implicit layers on the machine (Steam overlay/fossilize, OBS) are disabled for these runs so only our layer is
# in the chain. Only the harness's own process is touched.
param([int]$Frames = 2000, [string]$Only = '', [string]$LayerSource = '')
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$exe = Join-Path $PSScriptRoot 'vk_harness\target\release\vk_harness.exe'
if (-not (Test-Path $exe)) { throw "build first: cargo build --release --manifest-path tools\gpu-harness\vk_harness\Cargo.toml" }
if (-not $LayerSource) { $LayerSource = Join-Path $root 'electron\services\lowlatency' }
$work = Join-Path $env:TEMP ('vk-harness-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
$layerDir = Join-Path $work 'layer'
New-Item -ItemType Directory $layerDir -Force | Out-Null
Copy-Item (Join-Path $LayerSource 'VkLayer_KORTHOS_LowLatency.dll'), (Join-Path $LayerSource 'VkLayer_KORTHOS_LowLatency.json') $layerDir

function Invoke-Harness([string]$name, [string]$mode, [string[]]$hargs, [int]$timeoutS = 180) {
  if ($Only -and $name -notmatch $Only) { return }
  $out = Join-Path $work "$name.jsonl"
  $err = Join-Path $work "$name.err.txt"
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName = $exe
  $psi.Arguments = ($hargs -join ' ')
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.EnvironmentVariables['VK_LOADER_LAYERS_DISABLE'] = 'VK_LAYER_VALVE_steam_overlay,VK_LAYER_VALVE_steam_fossilize,VK_LAYER_OBS_HOOK,VK_LAYER_WEOBS_HOOK'
  foreach ($k in 'LOW_LATENCY_LAYER', 'LOW_LATENCY_LAYER_REFLEX', 'VK_ADD_IMPLICIT_LAYER_PATH', 'DISABLE_LOW_LATENCY_LAYER') { $psi.EnvironmentVariables.Remove($k) }
  if ($mode -ne 'off') {
    $psi.EnvironmentVariables['VK_ADD_IMPLICIT_LAYER_PATH'] = $layerDir
    $psi.EnvironmentVariables['LOW_LATENCY_LAYER'] = '1'
    if ($mode -eq 'reflex') { $psi.EnvironmentVariables['LOW_LATENCY_LAYER_REFLEX'] = '1' }
  }
  if ($mode -eq 'present-but-off') { $psi.EnvironmentVariables.Remove('LOW_LATENCY_LAYER') }
  $p = [Diagnostics.Process]::Start($psi)
  $stdoutTask = $p.StandardOutput.ReadToEndAsync()
  $stderrTask = $p.StandardError.ReadToEndAsync()
  if (-not $p.WaitForExit($timeoutS * 1000)) { try { $p.Kill() } catch {}; $exit = 'timeout' } else { $p.WaitForExit(); $exit = $p.ExitCode }
  $stdoutTask.Result | Set-Content -Encoding utf8 $out
  $stderrTask.Result | Set-Content -Encoding utf8 $err
  $lines = @($stdoutTask.Result -split "`r?`n" | Where-Object { $_ -like '{*' } | ForEach-Object { $_ | ConvertFrom-Json })
  $dev = $lines | Where-Object event -eq 'device' | Select-Object -First 1
  $sum = $lines | Where-Object event -eq 'summary'
  $errs = $lines | Where-Object { $_.event -in 'error', 'hang', 'validation' }
  [pscustomobject]@{
    name = $name; mode = $mode; exit = $exit
    layerLoaded = ($lines | Where-Object event -eq 'instance' | Select-Object -First 1).layerDllLoaded
    probes = if ($dev) { ($dev.probes | ForEach-Object { "$($_.call)=$($_.result)/$($_.count)" }) -join '; ' } else { '' }
    exposes = if ($dev) { "antiLag=$($dev.exposes.VK_AMD_anti_lag) nvll2=$($dev.exposes.VK_NV_low_latency2) layerExt=$($dev.layerExtensions -join ',')" } else { '' }
    gdpa = if ($dev) { ($dev.gdpa.PSObject.Properties | Where-Object { $_.Name -notlike 'vkQueue*' -or $_.Name -like '*OutOfBand*' } | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join ' ' } else { '' }
    summary = ($sum | ForEach-Object { "c$($_.cycle) fps=$($_.fps) mean=$($_.frameMs.mean) p99=$($_.frameMs.p99) max=$($_.frameMs.max) v1=$($_.submits.v1) v2=$($_.submits.v2) multi=$($_.submits.multiBatch) zero=$($_.submits.zeroBatch) sleeps=$($_.latencySleeps) memMB=$($_.privateMB.early)->$($_.privateMB.end) (d=$($_.privateMB.delta)) handles=$($_.handles.early)->$($_.handles.end)" }) -join ' | '
    errors = ($errs | ForEach-Object { $_ | ConvertTo-Json -Compress }) -join ' '
    stderr = ($stderrTask.Result.Trim() -split "`r?`n" | Select-Object -First 3) -join ' / '
  } | ConvertTo-Json -Compress
}

$F = "--frames $Frames"
# (a) no layer
Invoke-Harness 'off_full_mix' 'off' @($F, '--enum full --submit mix --ext none')
Invoke-Harness 'off_nvll2_native' 'off' @($F, '--enum full --submit mix --ext nvll2')
# layer manifest on the path but LOW_LATENCY_LAYER unset: the loader must not load it
Invoke-Harness 'manifest_without_enable_env' 'present-but-off' @('--frames 100', '--ext none')
# (b) anti-lag mode (LOW_LATENCY_LAYER=1)
Invoke-Harness 'antilag_noext_mix' 'antilag' @($F, '--enum full --submit mix --ext none')
Invoke-Harness 'antilag_ext_v1' 'antilag' @($F, '--enum full --submit v1 --ext antilag')
Invoke-Harness 'antilag_ext_v2' 'antilag' @($F, '--enum full --submit v2 --ext antilag')
Invoke-Harness 'antilag_ext_mix_partial' 'antilag' @($F, '--enum partial --submit mix --ext antilag')
Invoke-Harness 'antilag_ext_groups' 'antilag' @('--frames 300', '--enum groups --submit mix --ext antilag')
Invoke-Harness 'antilag_ext_groupskhr' 'antilag' @('--frames 300', '--enum groups-khr --submit mix --ext antilag')
Invoke-Harness 'antilag_ext_nofeatures_v1' 'antilag' @('--frames 500', '--enum full --submit v1 --ext antilag --features none')
Invoke-Harness 'antilag_ext_fifo' 'antilag' @('--frames 300', '--enum full --submit mix --ext antilag --present fifo')
Invoke-Harness 'antilag_both_exts' 'antilag' @('--frames 300', '--enum full --submit mix --ext both')
Invoke-Harness 'antilag_cycles3' 'antilag' @('--frames 300', '--enum partial --submit mix --ext antilag --cycles 3')
# (b) reflex mode (LOW_LATENCY_LAYER=1, LOW_LATENCY_LAYER_REFLEX=1)
Invoke-Harness 'reflex_noext_mix' 'reflex' @($F, '--enum full --submit mix --ext none')
Invoke-Harness 'reflex_ext_v1' 'reflex' @($F, '--enum full --submit v1 --ext nvll2')
Invoke-Harness 'reflex_ext_v2' 'reflex' @($F, '--enum full --submit v2 --ext nvll2')
Invoke-Harness 'reflex_ext_mix_partial' 'reflex' @($F, '--enum partial --submit mix --ext nvll2')
Invoke-Harness 'reflex_ext_groups' 'reflex' @('--frames 300', '--enum groups --submit mix --ext nvll2')
Invoke-Harness 'reflex_ext_nofeatures_v1' 'reflex' @('--frames 500', '--enum full --submit v1 --ext nvll2 --features none')
Invoke-Harness 'reflex_ext_fifo' 'reflex' @('--frames 300', '--enum full --submit mix --ext nvll2 --present fifo')
Invoke-Harness 'reflex_cycles3' 'reflex' @('--frames 300', '--enum partial --submit mix --ext nvll2 --cycles 3')
# Validation (only if VK_LAYER_KHRONOS_validation is installed; the harness reports validationAvailable otherwise)
Invoke-Harness 'validation_antilag' 'antilag' @('--frames 300', '--enum partial --submit mix --ext antilag --validation')
Invoke-Harness 'validation_reflex' 'reflex' @('--frames 300', '--enum partial --submit mix --ext nvll2 --validation')
Write-Host "raw output: $work"
