// Driver Center: find, download and install missing drivers (Windows Update, Microsoft Update Catalog and the
// official GPU vendor packages).
//
// Sources (HTTPS, official only):
//   - Windows Update driver catalog through the Windows Update Agent COM API (Microsoft.Update.Session).
//   - Microsoft Update Catalog (catalog.update.microsoft.com): the same driver library, reached without the
//     Windows Update client. Used for devices Windows Update offers nothing for, and as the way out when the
//     client finds a driver but cannot download or install it (broken / stripped Windows Update components).
//     The usual case: Delivery Optimization (DoSvc) is disabled. Windows 11's update client downloads only
//     through it, so every download ends in 80004002; DoSvc is a protected service that not even an
//     administrator can switch back on without a restart (DarkOS ships it disabled).
//     The .cab comes from Microsoft's download servers, is checked against the SHA-256 the catalog publishes,
//     and is installed with pnputil only if every catalog file in it carries a valid Microsoft signature.
//   - NVIDIA: the device-id lookup service of the NVIDIA/GeForce app -> package on *.download.nvidia.com.
//   - Intel: the official download page of the GPU family -> package on downloadmirror.intel.com.
//   - AMD: the "auto-detect and install" tool linked from amd.com/support -> drivers.amd.com.
// Every package is Authenticode-checked (valid + signed by the vendor) after download and again, by hash and
// signature, on an admin-only copy right before the elevated job runs it.
//
// Nothing here changes the system until install() runs, which the user starts with a click (one UAC prompt).

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { runPowerShell, parseJsonOutput } from '../PowerShellRunner.js'
import { psQuote } from '../optimizer/OptimizerUtils.js'
import {
  normalizeScan, normalizeWuUpdates, wuBlockers, buildPlan, recommendedIds, uncoveredDevices, isUpdateId,
  nvidiaLookupUrl, parseNvidiaLookup, nvidiaVersionFromWindows, parseAmdDriversPage, AMD_DRIVERS_PAGE,
  intelPackageFor, INTEL_PAGES, parseIntelDownloadPage, isTrustedPackageUrl, isExpectedSigner, SIGNER_PATTERNS,
  vendorInstallArgs, vendorIsSilent, parseProgressText
} from './driverPlan.js'
import {
  CATALOG_DOWNLOAD_URL, catalogSearchUrl, catalogDetailsUrl, catalogDownloadBody, parseCatalogSearch, parseCatalogDetails,
  parseCatalogDownload, rankCatalogRows, catalogQueries, matchRank, detailsFit, isCatalogHost, isCatalogId
} from './driverCatalog.js'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const MAX_PACKAGE_BYTES = 3 * 1024 * 1024 * 1024
const INSTALL_TIMEOUT_MS = 2 * 60 * 60 * 1000
// Catalog lookups at search time: devices looked up, candidates opened per search, parallel requests, time budget.
const CATALOG_MAX_DEVICES = 120
const CATALOG_MAX_CANDIDATES = 10
const CATALOG_PARALLEL = 4
const CATALOG_BUDGET_MS = 120000
// Catalog .cab files carry a catalog (.cat) signed by Microsoft (WHQL / attestation): O=Microsoft Corporation.
export const MICROSOFT_SIGNER_PATTERN = '(^|, )O=Microsoft Corporation(,|$)'

// ------------------------------------------------------------------ scripts
// Read-only: devices with a problem code, every display adapter, environment and Windows Update state.
const SCAN_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$vc = @{}
foreach ($g in (Get-CimInstance Win32_VideoController)) { $vc["$($g.PNPDeviceID)"] = $g }
$devices = foreach ($d in (Get-CimInstance Win32_PnPEntity)) {
  $code = [int]$d.ConfigManagerErrorCode
  $isDisplay = "$($d.PNPClass)" -eq 'Display'
  if ($code -eq 0 -and -not $isDisplay) { continue }
  if ($d.Present -eq $false) { continue }
  $g = $vc["$($d.PNPDeviceID)"]
  [pscustomobject]@{
    name = "$($d.Name)"; cls = "$($d.PNPClass)"; code = $code; instanceId = "$($d.PNPDeviceID)"; service = "$($d.Service)"
    hardwareIds = @($d.HardwareID); compatibleIds = @($d.CompatibleID | Select-Object -First 6)
    provider = if ($g) { "$($g.AdapterCompatibility)" } else { "$($d.Manufacturer)" }
    driverVersion = if ($g) { "$($g.DriverVersion)" } else { '' }
  }
}
$chassis = @((Get-CimInstance Win32_SystemEnclosure).ChassisTypes)
$laptop = [bool](($chassis | Where-Object { $_ -in 8,9,10,14,30,31,32 }) -or (Get-CimInstance Win32_Battery))
$pol = Get-ItemProperty 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate'
$au = Get-ItemProperty 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU'
$svc = Get-Service -Name wuauserv
$start = (Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\wuauserv').Start
[pscustomobject]@{
  devices = @($devices)
  osBuild = [Environment]::OSVersion.Version.Build
  laptop = $laptop
  cpu = "$((Get-CimInstance Win32_Processor | Select-Object -First 1).Name)"
  arch = "$env:PROCESSOR_ARCHITECTURE"
  wu = [pscustomobject]@{
    status = "$($svc.Status)"; start = [int]$start
    excludeDrivers = [int]$pol.ExcludeWUDriversInQualityUpdate
    noInternet = [int]$pol.DoNotConnectToWindowsUpdateInternetLocations
    wsus = [bool]($au.UseWUServer -eq 1 -and $pol.WUServer)
  }
} | ConvertTo-Json -Depth 5 -Compress
`

// Lifts the Windows Update blockers for the duration of the job and restores them in Restore-DhWu.
// ASCII only (runs elevated through a temp .ps1).
export const WU_UNLOCK_FUNCS = `
$script:DhWuRestore = @()
$script:DhPolRestore = @()
function Set-DhSvcStart([string]$n, [int]$v) {
  $map = @{ 2 = 'auto'; 3 = 'demand'; 4 = 'disabled' }
  & sc.exe config $n start= $map[$v] 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Set-ItemProperty -LiteralPath ('HKLM:\\SYSTEM\\CurrentControlSet\\Services\\' + $n) -Name Start -Value $v -Type DWord -Force -ErrorAction SilentlyContinue }
}
function Unlock-DhWu([bool]$policies = $true) {
  # cryptsvc checks the signature of every download, trustedinstaller installs: stripped systems disable them too
  foreach ($n in 'wuauserv','bits','dosvc','cryptsvc','trustedinstaller') {
    $k = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\' + $n
    $v = (Get-ItemProperty -LiteralPath $k -ErrorAction SilentlyContinue).Start
    if ($v -eq 4) {
      $script:DhWuRestore += [pscustomobject]@{ n = $n; v = [int]$v; wasRunning = $false }
      Set-DhSvcStart $n 3
      DhP 'wuservice' 'info' ('enabled ' + $n)
    }
  }
  $pk = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate'
  if ($policies) {
    foreach ($name in 'ExcludeWUDriversInQualityUpdate','DoNotConnectToWindowsUpdateInternetLocations') {
      $cur = (Get-ItemProperty -LiteralPath $pk -Name $name -ErrorAction SilentlyContinue).$name
      if ($cur -eq 1) {
        $script:DhPolRestore += $name
        Set-ItemProperty -LiteralPath $pk -Name $name -Value 0 -Type DWord -Force
        DhP 'wuservice' 'info' ('policy lifted ' + $name)
      }
    }
  }
  Start-Service -Name wuauserv -ErrorAction Stop
}
# The real HRESULT of a COM failure (PowerShell wraps it in a MethodInvocationException)
function DhHr($e) { $x = $e.Exception; while ($x.InnerException) { $x = $x.InnerException }; '{0:X8}' -f $x.HResult }
# A search belongs to the session that ran it. After wuauserv restarts, that session and every update object it
# returned are dead (calls fail with 80004002 and the like): always search again on a new session.
function New-DhWuSearch {
  $script:DhSession = New-Object -ComObject Microsoft.Update.Session
  $script:DhSession.ClientApplicationID = 'DarkHub Suite'
  $s = $script:DhSession.CreateUpdateSearcher()
  $s.ServerSelection = 2
  $s.Online = $true
  $res = $s.Search("IsInstalled=0 and Type='Driver' and IsHidden=0")
  $script:DhFound = @{}
  foreach ($u in $res.Updates) { $script:DhFound[([string]$u.Identity.UpdateID).ToLower()] = $u }
}
# 'ok' or the update's own error code (the overall 80240022 "all failed" hides the cause). Writes nothing else.
function Get-DhWuDownload([string]$id) {
  try {
    $u = $script:DhFound[$id]
    if (-not $u.EulaAccepted) { [void]$u.AcceptEula() }
    if ($u.IsDownloaded) { return 'ok' }
    $coll = New-Object -ComObject Microsoft.Update.UpdateColl
    [void]$coll.Add($u)
    $dl = $script:DhSession.CreateUpdateDownloader()
    $dl.Updates = $coll
    $dr = $dl.Download()
    if ($dr.ResultCode -eq 2 -or $dr.ResultCode -eq 3) { return 'ok' }
    return ('{0:X8}' -f $dr.GetUpdateResult(0).HResult)
  } catch { return (DhHr $_) }
}
# Delivery Optimization in plain HTTP mode (99): the documented way out when its service or cache is broken
$script:DhDoRestore = $null
function Set-DhDoSimple {
  $dk = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DeliveryOptimization'
  if ($null -ne $script:DhDoRestore) { return }
  $cur = (Get-ItemProperty -LiteralPath $dk -Name DODownloadMode -ErrorAction SilentlyContinue).DODownloadMode
  $script:DhDoRestore = if ($null -eq $cur) { 'none' } else { [string]$cur }
  if (-not (Test-Path -LiteralPath $dk)) { New-Item -Path $dk -Force | Out-Null }
  Set-ItemProperty -LiteralPath $dk -Name DODownloadMode -Value 99 -Type DWord -Force
  Restart-Service -Name wuauserv -Force -ErrorAction SilentlyContinue
  DhP 'wuservice' 'info' 'delivery optimization: simple mode'
}
function Restore-DhDo {
  if ($null -eq $script:DhDoRestore) { return }
  $dk = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DeliveryOptimization'
  if ($script:DhDoRestore -eq 'none') { Remove-ItemProperty -LiteralPath $dk -Name DODownloadMode -ErrorAction SilentlyContinue }
  else { Set-ItemProperty -LiteralPath $dk -Name DODownloadMode -Value ([int]$script:DhDoRestore) -Type DWord -Force -ErrorAction SilentlyContinue }
  $script:DhDoRestore = $null
  DhP 'wuservice' 'info' 'delivery optimization restored'
}
function Restore-DhWu {
  Restore-DhDo
  $pk = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate'
  foreach ($name in $script:DhPolRestore) { Set-ItemProperty -LiteralPath $pk -Name $name -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue; DhP 'wuservice' 'info' ('policy restored ' + $name) }
  foreach ($r in $script:DhWuRestore) {
    Stop-Service -Name $r.n -Force -ErrorAction SilentlyContinue
    Set-DhSvcStart $r.n $r.v
    DhP 'wuservice' 'info' ('restored ' + $r.n)
  }
}
`

const WU_SEARCH_BODY = `
$session = New-Object -ComObject Microsoft.Update.Session
$session.ClientApplicationID = 'DarkHub Suite'
$searcher = $session.CreateUpdateSearcher()
$searcher.ServerSelection = 2
$searcher.Online = $true
$res = $searcher.Search("IsInstalled=0 and Type='Driver' and IsHidden=0")
$list = @(foreach ($u in $res.Updates) {
  [pscustomobject]@{
    id = "$($u.Identity.UpdateID)"; title = "$($u.Title)"; driverClass = "$($u.DriverClass)"
    hardwareId = "$($u.DriverHardwareID)"; manufacturer = "$($u.DriverManufacturer)"; model = "$($u.DriverModel)"
    date = if ($u.DriverVerDate) { ([datetime]$u.DriverVerDate).ToString('yyyy-MM-dd') } else { '' }
    size = [int64]$u.MaxDownloadSize
  }
})
`

// Unelevated: can Delivery Optimization start? Any signed-in user may start it (it is demand-started by apps), and
// the Service Control Manager answers 1058 when it is disabled in its own database, which is what counts: the
// registry Start value can already say Manual again while the running system still refuses until a restart.
// 0 = started, 1056 = already running, 1058 = disabled, 1060 = the service does not exist.
const DO_PROBE_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
& (Join-Path $env:SystemRoot 'System32\\sc.exe') start dosvc 2>&1 | Out-Null
Write-Output ('DHDO|' + $LASTEXITCODE)
`

function dhpFunc(progressFile) {
  const target = progressFile ? `Add-Content -LiteralPath ${psQuote(progressFile)} -Value $line -Encoding ASCII -ErrorAction SilentlyContinue` : 'Write-Output $line'
  return `function DhP([string]$id, [string]$st, [string]$detail) {
  $line = 'DHP|' + $id + '|' + $st + '|' + (([string]$detail) -replace '[\\r\\n|]+', ' ')
  ${target}
  Write-Output $line
}`
}

/** Unelevated WU search (service usable). Prints the JSON list. */
function wuSearchScript() {
  return `$ErrorActionPreference = 'Stop'
try {
${WU_SEARCH_BODY}
  Write-Output ('DHJSON|' + (ConvertTo-Json -InputObject @($list) -Depth 3 -Compress))
} catch {
  Write-Output ('DHERR|' + ('{0:X8}' -f $_.Exception.HResult) + '|' + (([string]$_.Exception.Message) -replace '[\\r\\n|]+', ' '))
}`
}

/** Elevated WU search with the blockers lifted temporarily. */
export function wuSearchElevatedScript() {
  return `$ErrorActionPreference = 'Stop'
${dhpFunc(null)}
${WU_UNLOCK_FUNCS}
try {
  Unlock-DhWu $true
${WU_SEARCH_BODY}
  Write-Output ('DHJSON|' + (ConvertTo-Json -InputObject @($list) -Depth 3 -Compress))
} catch {
  Write-Output ('DHERR|' + ('{0:X8}' -f $_.Exception.HResult) + '|' + (([string]$_.Exception.Message) -replace '[\\r\\n|]+', ' '))
} finally {
  Restore-DhWu
}`
}

/**
 * The elevated install job. ASCII only. Steps: restore point -> Windows Update drivers -> vendor packages ->
 * Microsoft Update Catalog packages.
 * opts: { progressFile, restorePoint, unlockWu, updateIds[], packages[{ id, vendor, path, sha256, args[], wait }],
 *         cabs[{ id, path, sha256, hw[] }] }   (cabs: Microsoft Update Catalog driver packages, installed with
 *         pnputil; hw = the hardware ids the package was picked for)
 */
export function buildInstallScript(opts) {
  const ids = (opts.updateIds || []).filter(isUpdateId).map((s) => psQuote(s.toLowerCase())).join(',')
  const list = (a) => `@(${(a || []).map((x) => psQuote(String(x))).join(',')})`
  const cabs = mergeCabs(opts.cabs || []).map((p) => `[pscustomobject]@{ ids = ${list(p.ids)}; hw = ${list(p.hw)}; path = ${psQuote(p.path)}; sha = ${psQuote(String(p.sha256).toUpperCase())} }`).join(',\n  ')
  const pkgs = (opts.packages || []).map((p) => `[pscustomobject]@{ id = ${psQuote(p.id)}; vendor = ${psQuote(p.vendor)}; path = ${psQuote(p.path)}; sha = ${psQuote(String(p.sha256).toUpperCase())}; pattern = ${psQuote(SIGNER_PATTERNS[p.vendor] || '^$')}; args = @(${(p.args || []).map(psQuote).join(',')}); wait = $${p.wait ? 'true' : 'false'} }`).join(',\n  ')
  return `$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
${dhpFunc(opts.progressFile)}
${WU_UNLOCK_FUNCS}
$wuIds = @(${ids})
$packages = @(
  ${pkgs}
)
$cabs = @(
  ${cabs}
)
$msPattern = ${psQuote(MICROSOFT_SIGNER_PATTERN)}
$abort = $false
DhP 'job' 'start' ''

if (${opts.restorePoint ? '$true' : '$false'}) {
  DhP 'restore' 'start' ''
  try {
    $k = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\SystemRestore'
    $had = (Get-ItemProperty -Path $k -Name SystemRestorePointCreationFrequency -ErrorAction SilentlyContinue).SystemRestorePointCreationFrequency
    Enable-ComputerRestore -Drive ($env:SystemDrive + '\\') -ErrorAction SilentlyContinue
    $before = Get-ComputerRestorePoint -ErrorAction SilentlyContinue | Sort-Object SequenceNumber | Select-Object -Last 1
    $seqBefore = 0; if ($before) { $seqBefore = [int]$before.SequenceNumber }
    try {
      Set-ItemProperty -Path $k -Name SystemRestorePointCreationFrequency -Value 0 -Type DWord -Force
      Checkpoint-Computer -Description 'DarkHub Driver Center' -RestorePointType DEVICE_DRIVER_INSTALL -ErrorAction Stop
    } finally {
      if ($null -eq $had) { Remove-ItemProperty -Path $k -Name SystemRestorePointCreationFrequency -ErrorAction SilentlyContinue }
      else { Set-ItemProperty -Path $k -Name SystemRestorePointCreationFrequency -Value $had -Type DWord -Force -ErrorAction SilentlyContinue }
    }
    $after = Get-ComputerRestorePoint -ErrorAction SilentlyContinue | Sort-Object SequenceNumber | Select-Object -Last 1
    if (-not $after -or [int]$after.SequenceNumber -le $seqBefore) { throw 'System Protection is off or blocked by policy' }
    DhP 'restore' 'ok' ([string]$after.SequenceNumber)
  } catch {
    DhP 'restore' 'failed' $_.Exception.Message
    $abort = $true
  }
}

if (-not $abort -and $wuIds.Count -gt 0) {
  $wuDone = @{}
  try {
    # Services Windows Update needs are switched on for the job even when the service itself was not blocked
    # (a disabled Delivery Optimization or BITS alone makes every download fail); policies only on request.
    Unlock-DhWu ${opts.unlockWu ? '$true' : '$false'}
    foreach ($id in $wuIds) { DhP ('wu:' + $id) 'start' '' }
    New-DhWuSearch
    $simple = $false
    $doDead = ''
    foreach ($id in $wuIds) {
      try {
        if (-not $script:DhFound[$id]) { $wuDone[$id] = $true; DhP ('wu:' + $id) 'skipped' 'not offered anymore'; continue }
        # Delivery Optimization cannot start: every further download would fail the same way, do not wait for each
        if ($doDead -and -not $script:DhFound[$id].IsDownloaded) { $wuDone[$id] = $true; DhP ('wu:' + $id) 'failed' ('download ' + $doDead + ' (Delivery Optimization service unavailable)'); continue }
        DhP ('wu:' + $id) 'downloading' ''
        $why = Get-DhWuDownload $id
        if ($why -ne 'ok' -and -not $simple) {
          # once per job: Delivery Optimization in plain HTTP mode, then a NEW search (the restart killed the old one)
          $simple = $true
          $first = $why
          DhP ('wu:' + $id) 'info' ('download ' + $why + ', retrying with Delivery Optimization in simple mode')
          Set-DhDoSimple
          Start-Service -Name bits -ErrorAction SilentlyContinue
          New-DhWuSearch
          if ($script:DhFound[$id]) {
            $why = Get-DhWuDownload $id
            if ($why -ne 'ok') {
              Start-Service -Name dosvc -ErrorAction SilentlyContinue
              if ((Get-Service -Name dosvc -ErrorAction SilentlyContinue).Status -ne 'Running') { $doDead = $why }
              if ($why -ne $first) { $why = $why + ' (first try ' + $first + ')' }
            }
          }
        }
        if ($why -ne 'ok') { $wuDone[$id] = $true; DhP ('wu:' + $id) 'failed' ('download ' + $why); continue }
        DhP ('wu:' + $id) 'installing' ''
        $coll = New-Object -ComObject Microsoft.Update.UpdateColl
        [void]$coll.Add($script:DhFound[$id])
        $in = $script:DhSession.CreateUpdateInstaller(); $in.Updates = $coll
        $ir = $in.Install()
        $ur = $ir.GetUpdateResult(0)
        $wuDone[$id] = $true
        if ($ur.ResultCode -eq 2 -or $ur.ResultCode -eq 3) {
          if ($ur.RebootRequired) { DhP ('wu:' + $id) 'reboot' '' } else { DhP ('wu:' + $id) 'ok' '' }
        } else { DhP ('wu:' + $id) 'failed' ('install result ' + $ur.ResultCode + ' ' + ('{0:X8}' -f $ur.HResult)) }
      } catch { $wuDone[$id] = $true; DhP ('wu:' + $id) 'failed' ((DhHr $_) + ' ' + $_.Exception.Message) }
    }
  } catch {
    $msg = (DhHr $_) + ' ' + $_.Exception.Message
    foreach ($id in $wuIds) { if (-not $wuDone[$id]) { DhP ('wu:' + $id) 'failed' $msg } }
  } finally {
    Restore-DhWu
  }
}

# .NET Framework's recursive Directory.Delete removes a junction found inside without following it, but then throws
# (DeleteVolumeMountPoint: 'parameter is incorrect') and leaves the now-empty folder behind: a second pass removes it.
function Remove-DhTree([string]$p) {
  try { [IO.Directory]::Delete($p, $true) } catch { try { [IO.Directory]::Delete($p, $true) } catch { } }
}

if (-not $abort) {
  # Admin copies left by earlier runs (an installer launched without waiting still ran from its folder): older than
  # a day. Reparse points are skipped and [IO.Directory]::Delete never follows a junction inside the folder, so a link
  # planted in the user-writable Windows Temp cannot redirect this elevated delete.
  try {
    Get-ChildItem -LiteralPath (Join-Path $env:SystemRoot 'Temp') -Directory -Filter 'DarkHubDrv_*' -Force -ErrorAction SilentlyContinue |
      Where-Object { -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -and $_.LastWriteTime -lt (Get-Date).AddDays(-1) } |
      ForEach-Object { Remove-DhTree $_.FullName }
  } catch { }
  foreach ($p in $packages) {
    $dir = $null
    $keepDir = $false
    try {
      DhP $p.id 'verifying' ''
      # Admin-only copy, then hash + signature checks on that copy (the download folder is user-writable).
      $dir = Join-Path $env:SystemRoot ('Temp\\DarkHubDrv_' + [guid]::NewGuid().ToString('N'))
      New-Item -ItemType Directory -Path $dir -Force | Out-Null
      $exe = Join-Path $dir ([IO.Path]::GetFileName($p.path))
      Copy-Item -LiteralPath $p.path -Destination $exe -Force
      $hash = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash
      if ($hash -ne $p.sha) { DhP $p.id 'failed' 'hash mismatch'; continue }
      $sig = Get-AuthenticodeSignature -LiteralPath $exe
      if ("$($sig.Status)" -ne 'Valid' -or -not ("$($sig.SignerCertificate.Subject)" -match $p.pattern)) { DhP $p.id 'failed' ('signature ' + $sig.Status + ' ' + $sig.SignerCertificate.Subject); continue }
      if ($p.wait) {
        DhP $p.id 'installing' ''
        $proc = if ($p.args.Count -gt 0) { Start-Process -FilePath $exe -ArgumentList $p.args -Wait -PassThru } else { Start-Process -FilePath $exe -Wait -PassThru }
        $code = [int]$proc.ExitCode
        if ($code -eq 0) { DhP $p.id 'ok' '0' }
        elseif ($code -eq 3010 -or $code -eq 1641) { DhP $p.id 'reboot' ([string]$code) }
        else { DhP $p.id 'failed' ('exit code ' + $code) }
      } else {
        if ($p.args.Count -gt 0) { Start-Process -FilePath $exe -ArgumentList $p.args | Out-Null } else { Start-Process -FilePath $exe | Out-Null }
        DhP $p.id 'launched' ''
        $keepDir = $true # still running from there: the sweep of a later run removes it
      }
    } catch { DhP $p.id 'failed' $_.Exception.Message }
    finally {
      # the verified copy of a GPU driver is 0.7-1.5 GB: never leave it behind
      if ($dir -and -not $keepDir) { Remove-DhTree $dir }
    }
  }
}

# Microsoft Update Catalog packages: admin-only copy -> SHA-256 -> expand -> every .cat signed by Microsoft -> pnputil.
# One .cab often serves many items (a chipset package covers dozens of devices): it runs once for all its ids.
# Sets $script:DhCabSt ('ok' | 'reboot' | 'skipped' | 'failed') and $script:DhCabDetail.
function Install-DhCab($p) {
  $script:DhCabSt = 'failed'; $script:DhCabDetail = ''
  $dir = $null
  try {
    $sys = Join-Path $env:SystemRoot 'Sysnative'
    if (-not (Test-Path -LiteralPath $sys)) { $sys = Join-Path $env:SystemRoot 'System32' }
    $dir = Join-Path $env:SystemRoot ('Temp\\DarkHubDrv_' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    $cab = Join-Path $dir 'driver.cab'
    Copy-Item -LiteralPath $p.path -Destination $cab -Force
    if ((Get-FileHash -LiteralPath $cab -Algorithm SHA256).Hash -ne $p.sha) { $script:DhCabDetail = 'hash mismatch'; return }
    $out = Join-Path $dir 'x'
    New-Item -ItemType Directory -Path $out -Force | Out-Null
    & (Join-Path $sys 'expand.exe') '-F:*' $cab $out 2>&1 | Out-Null
    $infs = @(Get-ChildItem -LiteralPath $out -Recurse -File -Filter '*.inf' -ErrorAction SilentlyContinue)
    $cats = @(Get-ChildItem -LiteralPath $out -Recurse -File -Filter '*.cat' -ErrorAction SilentlyContinue)
    if ($infs.Count -eq 0 -or $cats.Count -eq 0) { $script:DhCabDetail = 'not a driver package (no .inf / .cat)'; return }
    foreach ($c in $cats) {
      $sig = Get-AuthenticodeSignature -LiteralPath $c.FullName
      if ("$($sig.Status)" -ne 'Valid' -or -not ("$($sig.SignerCertificate.Subject)" -match $msPattern)) {
        $script:DhCabDetail = 'signature ' + $sig.Status + ' ' + $c.Name + ' ' + $sig.SignerCertificate.Subject
        return
      }
    }
    # A package can hold dozens of INFs for other machines: only the ones naming a wanted hardware id go to the
    # driver store. When none names one (ids built by an include), all of them are offered and Windows picks.
    $wanted = @($infs | Where-Object {
      $t = [IO.File]::ReadAllText($_.FullName)
      $hit = $false
      foreach ($h in $p.hw) { if ($t.IndexOf($h, [StringComparison]::OrdinalIgnoreCase) -ge 0) { $hit = $true; break } }
      $hit
    })
    if ($wanted.Count -eq 0) { $wanted = $infs }
    foreach ($id in $p.ids) { DhP $id 'installing' '' }
    $pnputil = Join-Path $sys 'pnputil.exe'
    $any = $false; $reboot = $false; $noop = 0; $bad = ''
    foreach ($inf in $wanted) {
      & $pnputil /add-driver $inf.FullName /install 2>&1 | Out-Null
      $code = $LASTEXITCODE
      if ($code -eq 0) { $any = $true }
      elseif ($code -eq 3010 -or $code -eq 1641) { $any = $true; $reboot = $true }
      elseif ($code -eq 259) { $noop++ }
      else { $bad = 'pnputil ' + ('{0:X8}' -f $code) + ' ' + $inf.Name }
    }
    if ($any) { if ($reboot) { $script:DhCabSt = 'reboot' } else { $script:DhCabSt = 'ok' } }
    elseif ($bad -eq '' -and $noop -gt 0) { $script:DhCabSt = 'skipped'; $script:DhCabDetail = 'no device needed this driver' }
    else { $script:DhCabDetail = $bad }
  } catch { $script:DhCabDetail = $_.Exception.Message }
  finally { if ($dir) { Remove-DhTree $dir } }
}

if (-not $abort -and $cabs.Count -gt 0) {
  # an item can also come as more than one .cab: it is done when all of them ran, and the worst result counts
  $rank = @{ 'failed' = 3; 'reboot' = 2; 'ok' = 1; 'skipped' = 0 }
  $sum = @{}; $order = @()
  foreach ($p in $cabs) {
    foreach ($id in $p.ids) { if (-not $sum.ContainsKey($id)) { $order += $id; $sum[$id] = $null; DhP $id 'verifying' '' } }
    Install-DhCab $p
    foreach ($id in $p.ids) {
      $cur = $sum[$id]
      if (-not $cur -or $rank[$script:DhCabSt] -gt $rank[$cur.st]) { $sum[$id] = [pscustomobject]@{ st = $script:DhCabSt; detail = $script:DhCabDetail } }
    }
  }
  foreach ($id in $order) { DhP $id $sum[$id].st $sum[$id].detail }
  & (Join-Path $env:SystemRoot 'System32\\pnputil.exe') /scan-devices 2>&1 | Out-Null
}
DhP 'job' 'ok' ''
Write-Output 'DHDONE'
`
}

// ------------------------------------------------------------------ helpers
function readWuOutput(stdout) {
  const out = String(stdout || '')
  const json = /^DHJSON\|(.*)$/m.exec(out)?.[1]
  if (json) return { ok: true, updates: normalizeWuUpdates(parseJsonOutput(json, [])) }
  const err = /^DHERR\|([0-9A-F]{8})\|(.*)$/m.exec(out)
  if (err) return { ok: false, hresult: err[1], error: err[2].trim() }
  return { ok: false, error: '' }
}

/** WUA HRESULTs that mean "the service is disabled / not reachable". */
export function wuErrorKind(hresult = '') {
  const h = String(hresult).toUpperCase()
  if (h === '80070422' || h === '8024A000' || h === '80070426') return 'serviceDisabled'
  if (h === '8024402C' || h === '80072EE7' || h === '80072EFD' || h === '8024401C' || h === '80244022') return 'offline'
  if (h === '80240438' || h === '8024002E') return 'policy'
  return 'error'
}

/** 'fetch failed (UND_ERR_CONNECT_TIMEOUT)': undici hides the reason of a network failure in error.cause. */
export function errText(e) {
  const cause = e?.cause?.code || e?.cause?.message || ''
  const msg = String(e?.message ?? e)
  return cause && !msg.includes(cause) ? `${msg} (${cause})` : msg
}

/**
 * Runs a network step up to `tries` times. A refusal by the server (HTTP 4xx) or by our own checks is final;
 * timeouts, resets and 5xx answers get another try after a short pause (a connection that stalls once is common
 * on a freshly installed PC, where this feature is used the most).
 */
export async function withRetry(fn, { tries = 3, pauseMs = 1500 } = {}) {
  for (let i = 0; ; i++) {
    try {
      return await fn()
    } catch (e) {
      const msg = String(e?.message ?? e)
      const transient = /^HTTP 5\d\d$/.test(msg) || /fetch failed|terminated|aborted|incomplete download|ECONN|ETIMEDOUT|EAI_AGAIN|socket/i.test(`${msg} ${e?.cause?.code || ''}`)
      if (i >= tries - 1 || !transient) throw e
      await new Promise((resolve) => setTimeout(resolve, pauseMs * (i + 1)))
    }
  }
}

async function fetchText(url, opts = {}) {
  return withRetry(() => fetchTextOnce(url, opts))
}

async function fetchTextOnce(url, { referer, timeoutMs = 30000, form } = {}) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: form ? 'POST' : 'GET',
      headers: {
        'user-agent': UA, accept: 'text/html,application/json;q=0.9,*/*;q=0.8', 'accept-language': 'en-US,en;q=0.9',
        ...(referer ? { referer } : {}), ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {})
      },
      ...(form ? { body: form } : {}),
      signal: ctl.signal,
      redirect: 'follow'
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    if (new URL(res.url).protocol !== 'https:') throw new Error('redirected to a non-HTTPS address')
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

function driversDir() {
  const base = process.env.LOCALAPPDATA || os.tmpdir()
  const dir = path.join(base, 'DarkHub', 'drivers')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

async function sha256File(file) {
  const h = crypto.createHash('sha256')
  await pipeline(fs.createReadStream(file), h)
  return h.digest('hex')
}

/** Runs fn over the list with at most `limit` calls in flight; results keep the list's order. */
async function mapLimit(list, limit, fn) {
  const out = new Array(list.length)
  let next = 0
  const worker = async () => {
    while (next < list.length) {
      const i = next++
      out[i] = await fn(list[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker))
  return out
}

/**
 * Catalog .cab entries [{ id, path, sha256, hw[] }] merged by file: [{ ids[], hw[], path, sha256 }]. Sixty
 * chipset devices usually resolve to the same .cab; it is copied, checked and installed once for all of them.
 */
export function mergeCabs(cabs = []) {
  const bySha = new Map()
  const clean = (h) => String(h || '').trim()
  for (const c of cabs) {
    const key = String(c.sha256).toLowerCase()
    if (!bySha.has(key)) bySha.set(key, { ids: [], hw: [], path: c.path, sha256: key })
    const e = bySha.get(key)
    for (const id of (c.ids || [c.id])) if (id && !e.ids.includes(id)) e.ids.push(id)
    for (const h of (c.hw || []).map(clean)) if (/^[\x21-\x7e]{4,200}$/.test(h) && !e.hw.includes(h.toLowerCase())) e.hw.push(h.toLowerCase())
  }
  return [...bySha.values()]
}

const NOT_IN_CATALOG = 'not in the Microsoft Update Catalog'

/** A Windows Update failure the catalog route can get around (not "skipped": that one is no longer offered). */
const isWuFailure = (ev) => ev?.status === 'failed' && String(ev.id || '').startsWith('wu:')

export class DriverInstallService {
  constructor({ runner, elevatedRunner, fetchImpl } = {}) {
    this._runner = runner || ((script, opts) => runPowerShell(script, opts))
    this._elevated = elevatedRunner || null
    this._fetchText = fetchImpl || fetchText
    this._lastScan = null
    this._lastPlan = null
    this._busy = false
  }

  /** Read-only scan: devices needing a driver, GPUs, environment and Windows Update state. */
  async scan() {
    if (process.platform !== 'win32') return { ok: false, error: 'Windows only.' }
    let parsed = null
    try {
      const res = await this._runner(SCAN_SCRIPT, { timeoutMs: 45000, trim: true })
      parsed = parseJsonOutput(res?.stdout, null)
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) }
    }
    if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'Could not read the device list.' }
    const scan = normalizeScan(parsed)
    this._lastScan = scan
    return { ok: true, ...scan, wuBlockers: wuBlockers(scan.wu) }
  }

  /** Windows Update driver search. With allowUnlock, runs elevated and lifts the blockers temporarily. */
  async searchWindowsUpdate({ allowUnlock = false } = {}) {
    const scan = this._lastScan || (await this.scan())
    const blockers = wuBlockers(scan?.wu || {})
    if (blockers.length && !allowUnlock) return { ok: false, needsUnlock: true, blockers, updates: [] }
    let res
    try {
      if (blockers.length) {
        if (!this._elevated) return { ok: false, error: 'Elevation unavailable.', blockers, updates: [] }
        res = await this._elevated(wuSearchElevatedScript(), { timeoutMs: 600000 })
      } else {
        res = await this._runner(wuSearchScript(), { timeoutMs: 600000, trim: true })
      }
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e), blockers, updates: [] }
    }
    const r = readWuOutput(res?.stdout)
    if (r.ok) return { ok: true, updates: r.updates, blockers }
    const kind = r.hresult ? wuErrorKind(r.hresult) : 'error'
    return { ok: false, kind, hresult: r.hresult || '', error: r.error || String(res?.stderr || '').trim() || 'Windows Update search failed.', blockers, needsUnlock: kind === 'serviceDisabled' && !allowUnlock, updates: [] }
  }

  /** Latest official package for one GPU (network, read-only). */
  async lookupVendor(gpu, env = {}) {
    const dev = gpu?.pci?.dev
    const base = { vendor: gpu.vendor, deviceId: dev || '', gpuName: gpu.name, needsDriver: Boolean(gpu.reason) }
    try {
      if (gpu.vendor === 'nvidia') {
        const url = nvidiaLookupUrl(dev, env)
        if (!url) return { ...base, ok: false, error: 'unknown device id' }
        const r = parseNvidiaLookup(await this._fetchText(url))
        if (!r) return { ...base, ok: false, error: 'not supported by the NVIDIA lookup' }
        const installed = gpu.reason ? '' : nvidiaVersionFromWindows(gpu.driverVersion)
        return { ...base, ok: true, ...r, installedVersion: installed }
      }
      if (gpu.vendor === 'intel') {
        const family = intelPackageFor({ deviceId: dev, cpu: env.cpu })
        if (!family) return { ...base, ok: false, error: 'no current Intel package for this GPU (use Windows Update)' }
        const r = parseIntelDownloadPage(await this._fetchText(INTEL_PAGES[family]))
        if (!r) return { ...base, ok: false, error: 'Intel page without a download link' }
        return { ...base, ok: true, url: r.url, version: r.version, name: r.title || 'Intel Graphics Driver', family, installedVersion: gpu.reason ? '' : gpu.driverVersion }
      }
      if (gpu.vendor === 'amd') {
        const r = parseAmdDriversPage(await this._fetchText(AMD_DRIVERS_PAGE))
        if (!r) return { ...base, ok: false, error: 'AMD page without the auto-detect tool link' }
        // The tool picks the driver itself: only offered when the GPU actually needs one.
        if (!gpu.reason) return { ...base, ok: false, error: 'not needed' }
        return { ...base, ok: true, url: r.url, version: r.version, name: 'AMD Software: Adrenalin Edition (auto-detect)', installedVersion: '' }
      }
    } catch (e) {
      return { ...base, ok: false, error: String(e?.message ?? e) }
    }
    return { ...base, ok: false, error: 'unsupported vendor' }
  }

  /**
   * Best Microsoft Update Catalog package for one device (or for the id a Windows Update driver targets):
   * { id, title, version, date, sizeBytes, driverClass, manufacturer, rank } or null. Network, read-only.
   *
   * The catalog search is a loose text search (a query for one network card also returns its siblings), so a
   * row only counts after its details page confirms the CPU architecture and lists one of the device's ids.
   * cache: per-search Maps so 60 devices sharing one chipset package cost one details request.
   * preferTitle: title of the Windows Update driver being replaced; rows with that exact title are tried
   * first, across every query, before any other driver for the same device is accepted.
   * minDate: a driver with another title is only accepted when its version date is not older than this (the
   * catalog does not carry every Windows Update driver; an older one must not stand in for an update).
   */
  async catalogFor(device, env = {}, { preferTitle = '', minDate = '', cache = {} } = {}) {
    cache.search ||= new Map()
    cache.details ||= new Map()
    const once = (map, key, load) => {
      if (!map.has(key)) map.set(key, load().catch((e) => { map.delete(key); throw e }))
      return map.get(key)
    }
    const ids = [...(device.hardwareIds || []), ...(device.compatibleIds || [])]
    const queries = Array.isArray(device.queries) ? device.queries : catalogQueries(device)
    for (const sameTitleOnly of (preferTitle ? [true, false] : [false])) {
      for (const query of queries) {
        const rows = await once(cache.search, query.toLowerCase(), async () => parseCatalogSearch(await this._fetchText(catalogSearchUrl(query), { timeoutMs: 25000 })))
        const candidates = rankCatalogRows(rows, { osBuild: env.osBuild, preferTitle }).filter((r) => !sameTitleOnly || r.same)
        // One driver is published once per Windows version and CPU architecture, all with the same title and id
        // list: when one of them does not list this device, its twins are skipped without a request.
        const notForDevice = new Set()
        let opened = 0
        for (const row of candidates) {
          const family = `${row.title}|${row.version}`.toLowerCase()
          if (notForDevice.has(family)) continue
          if (opened >= CATALOG_MAX_CANDIDATES && !cache.details.has(row.id)) break
          if (!cache.details.has(row.id)) opened++
          const details = await once(cache.details, row.id, async () => parseCatalogDetails(await this._fetchText(catalogDetailsUrl(row.id), { timeoutMs: 25000 })))
          if (!detailsFit(details, { arch: env.arch, ids })) {
            // wrong CPU architecture only: a twin for this architecture may follow. A page that lists ids, none of
            // them this device's, rules the whole family out (an unreadable page rules out nothing).
            const listsDevice = ids.some((h) => details.hardwareIds.includes(String(h).toLowerCase()))
            if (details.hardwareIds.length && !listsDevice) notForDevice.add(family)
            continue
          }
          if (minDate && !row.same && (details.date || row.date) < minDate) continue
          return {
            id: row.id,
            title: row.title || details.title,
            version: details.version || row.version,
            date: details.date || row.date,
            sizeBytes: row.sizeBytes,
            driverClass: details.driverClass,
            manufacturer: details.provider,
            rank: matchRank(device, details.hardwareIds),
            // the device's ids this package lists: they tell the install job which INFs of the package matter
            hw: ids.map((h) => String(h).toLowerCase()).filter((h) => details.hardwareIds.includes(h))
          }
        }
      }
    }
    return null
  }

  /**
   * Catalog packages for the devices nothing else covers: { entries: [{ ...package, fixes: [instanceId] }],
   * searched, error }. One entry per package (a chipset package usually fixes many devices at once).
   */
  async lookupCatalog(devices = [], env = {}) {
    const list = devices.filter((d) => catalogQueries(d).length).slice(0, CATALOG_MAX_DEVICES)
    const cache = {}
    const byId = new Map()
    const deadline = Date.now() + CATALOG_BUDGET_MS
    let error = ''
    await mapLimit(list, CATALOG_PARALLEL, async (d) => {
      if (Date.now() > deadline) { error ||= 'time limit reached'; return }
      try {
        const pkg = await this.catalogFor(d, env, { cache })
        if (!pkg) return
        if (!byId.has(pkg.id)) byId.set(pkg.id, { ...pkg, hw: [], fixes: [] })
        const entry = byId.get(pkg.id)
        entry.fixes.push(d.instanceId)
        for (const h of pkg.hw) if (!entry.hw.includes(h)) entry.hw.push(h)
      } catch (e) {
        error ||= errText(e)
      }
    })
    return { entries: [...byId.values()], searched: list.length, error }
  }

  /**
   * Full search: scan + Windows Update + vendor lookups, then the Microsoft Update Catalog for the devices
   * those left without a driver -> plan. The plan is kept in memory; install() only accepts ids from it (the
   * renderer never hands over a URL).
   */
  async findDrivers({ allowUnlock = false } = {}) {
    const scan = await this.scan()
    if (!scan.ok) return scan
    const [wu, vendorResults] = await Promise.all([
      this.searchWindowsUpdate({ allowUnlock }),
      Promise.all(scan.gpus.map((g) => this.lookupVendor(g, scan.env)))
    ])
    const vendor = vendorResults.filter((v) => v.ok)
    const updates = wu.ok ? wu.updates : []
    const left = uncoveredDevices(scan.devices, buildPlan({ devices: scan.devices, updates, vendor }))
    const catalog = left.length ? await this.lookupCatalog(left, scan.env) : { entries: [], searched: 0, error: '' }
    const items = buildPlan({ devices: scan.devices, updates, vendor, catalog: catalog.entries })
    const byId = new Map()
    for (const v of vendor) byId.set(`vendor:${v.vendor}:${v.deviceId || 'any'}`, v)
    this._lastPlan = {
      items,
      vendorById: byId,
      catalogById: new Map(catalog.entries.map((c) => [`cat:${c.id}`, c])),
      updatesById: new Map(updates.map((u) => [u.id, u])),
      env: scan.env
    }
    return {
      ok: true,
      devices: scan.devices,
      missing: scan.missing,
      gpus: scan.gpus,
      wu: { ...scan.wu, ok: wu.ok, error: wu.ok ? '' : (wu.error || ''), kind: wu.kind || '', needsUnlock: Boolean(wu.needsUnlock), blockers: wu.blockers || scan.wuBlockers, count: wu.ok ? wu.updates.length : 0 },
      vendorLookups: vendorResults.map((v) => ({ vendor: v.vendor, deviceId: v.deviceId, ok: v.ok, error: v.ok ? '' : v.error, version: v.version || '' })),
      catalog: { searched: catalog.searched, found: catalog.entries.length, error: catalog.error },
      items,
      recommended: recommendedIds(items),
      uncovered: uncoveredDevices(scan.devices, items).map((d) => d.instanceId)
    }
  }

  /** Streams a vendor package to disk (HTTPS + host re-checked after redirects), returning { file, sha256 }. */
  async download(pkg, onProgress) {
    if (!isTrustedPackageUrl(pkg.url, pkg.vendor)) throw new Error('untrusted package URL')
    const name = path.basename(new URL(pkg.url).pathname).replace(/[^A-Za-z0-9._-]/g, '_')
    const file = path.join(driversDir(), name)
    const res = await fetch(pkg.url, {
      headers: { 'user-agent': UA, ...(pkg.vendor === 'amd' ? { referer: 'https://www.amd.com/' } : {}) },
      redirect: 'follow'
    })
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
    if (!isTrustedPackageUrl(res.url, pkg.vendor)) throw new Error('redirected outside the vendor download host')
    if (/text\/html/i.test(res.headers.get('content-type') || '')) throw new Error('the vendor server answered with a web page instead of the package')
    const total = Number(res.headers.get('content-length')) || 0
    if (total > MAX_PACKAGE_BYTES) throw new Error('package too large')
    // Reuse a complete earlier download (a 1 GB NVIDIA package should not be fetched twice).
    try {
      const st = fs.statSync(file)
      if (total && st.size === total) {
        try { await res.body.cancel() } catch { /* ignore */ }
        onProgress?.({ received: total, total, reused: true })
        return { file, sha256: await sha256File(file) }
      }
    } catch { /* not cached */ }
    const partial = `${file}.part`
    const hash = crypto.createHash('sha256')
    let received = 0
    let last = 0
    const src = Readable.fromWeb(res.body)
    src.on('data', (chunk) => {
      received += chunk.length
      hash.update(chunk)
      if (received > MAX_PACKAGE_BYTES) src.destroy(new Error('package too large'))
      const now = Date.now()
      if (now - last > 400) { last = now; onProgress?.({ received, total }) }
    })
    await pipeline(src, fs.createWriteStream(partial))
    if (total && received !== total) throw new Error('incomplete download')
    fs.renameSync(partial, file)
    onProgress?.({ received, total })
    return { file, sha256: hash.digest('hex') }
  }

  /**
   * Downloads the .cab file(s) of one catalog update and checks each against the SHA-256 the catalog publishes.
   * Returns [{ path, sha256 }]. Throws when the update has no downloadable driver package.
   */
  async downloadCatalog(catalogId, onProgress) {
    if (!isCatalogId(catalogId)) throw new Error('bad catalog id')
    const files = parseCatalogDownload(await this._fetchText(CATALOG_DOWNLOAD_URL, { form: catalogDownloadBody(catalogId), timeoutMs: 30000 }))
    if (!files.length) throw new Error('the catalog has no downloadable package for this driver')
    const dir = path.join(driversDir(), 'catalog')
    fs.mkdirSync(dir, { recursive: true })
    const out = []
    for (const f of files.slice(0, 6)) {
      const file = path.join(dir, f.fileName)
      // Many updates point at the same file: one download at a time per file, then reuse the verified copy.
      this._cabJobs ||= new Map()
      if (!this._cabJobs.has(file)) {
        this._cabJobs.set(file, (async () => {
          let cached = false
          try { cached = fs.statSync(file).size > 0 && (await sha256File(file)) === f.sha256 } catch { cached = false }
          if (cached) return
          const got = await withRetry(() => this._downloadCab(f.url, file, onProgress))
          if (got.sha256 !== f.sha256) {
            try { fs.rmSync(file, { force: true }) } catch { /* ignore */ }
            throw new Error('downloaded package does not match the catalog SHA-256')
          }
        })().finally(() => this._cabJobs.delete(file)))
      }
      await this._cabJobs.get(file)
      if ((await sha256File(file)) !== f.sha256) throw new Error('downloaded package does not match the catalog SHA-256')
      out.push({ path: file, sha256: f.sha256 })
    }
    return out
  }

  /** Streams one catalog .cab to disk (HTTPS + Microsoft host re-checked after redirects): { sha256 }. */
  async _downloadCab(url, file, onProgress) {
    const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' })
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
    if (!isCatalogHost(res.url)) throw new Error('redirected outside the Microsoft download hosts')
    const total = Number(res.headers.get('content-length')) || 0
    if (total > MAX_PACKAGE_BYTES) throw new Error('package too large')
    const partial = `${file}.part`
    const hash = crypto.createHash('sha256')
    let received = 0
    let last = 0
    const src = Readable.fromWeb(res.body)
    src.on('data', (chunk) => {
      received += chunk.length
      hash.update(chunk)
      if (received > MAX_PACKAGE_BYTES) src.destroy(new Error('package too large'))
      const now = Date.now()
      if (now - last > 400) { last = now; onProgress?.({ received, total }) }
    })
    await pipeline(src, fs.createWriteStream(partial))
    if (total && received !== total) throw new Error('incomplete download')
    fs.renameSync(partial, file)
    onProgress?.({ received, total })
    return { sha256: hash.digest('hex') }
  }

  /** Authenticode of a downloaded file: { status, subject }. */
  async signature(file) {
    const res = await this._runner(`$s = Get-AuthenticodeSignature -LiteralPath ${psQuote(file)}; [pscustomobject]@{ status = "$($s.Status)"; subject = "$($s.SignerCertificate.Subject)" } | ConvertTo-Json -Compress`, { timeoutMs: 60000, trim: true })
    return parseJsonOutput(res?.stdout, { status: 'Unknown', subject: '' }) || { status: 'Unknown', subject: '' }
  }

  /**
   * Runs one elevated job (one UAC prompt) and streams its progress lines to note(). The job writes them to a
   * file we tail and echoes them to stdout, which catches lines the file missed. Returns { finished, stderr }.
   */
  async _runJob(buildScript, note) {
    const jobDir = path.join(driversDir(), `job-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`)
    fs.mkdirSync(jobDir, { recursive: true })
    const progressFile = path.join(jobDir, 'progress.log')
    fs.writeFileSync(progressFile, '')
    let offset = 0
    const seen = new Set()
    const take = (ev) => {
      const key = `${ev.id}|${ev.status}|${ev.detail}`
      if (seen.has(key)) return
      seen.add(key)
      note(ev)
    }
    const pump = () => {
      try {
        const buf = fs.readFileSync(progressFile)
        if (buf.length <= offset) return
        const text = buf.subarray(offset).toString('utf8')
        const cut = text.lastIndexOf('\n')
        if (cut < 0) return
        offset += Buffer.byteLength(text.slice(0, cut + 1))
        for (const ev of parseProgressText(text.slice(0, cut + 1))) take(ev)
      } catch { /* file busy */ }
    }
    const timer = setInterval(pump, 700)
    let res
    try {
      res = await this._elevated(buildScript(progressFile), { timeoutMs: INSTALL_TIMEOUT_MS })
    } finally {
      clearInterval(timer)
      pump()
      for (const ev of parseProgressText(res?.stdout || '')) take(ev)
      try { fs.rmSync(jobDir, { recursive: true, force: true }) } catch { /* ignore */ }
    }
    return { finished: /DHDONE/.test(String(res?.stdout || '')), stderr: String(res?.stderr || '').trim() }
  }

  /**
   * True when Delivery Optimization is disabled (or gone) for the running system: Windows Update then cannot
   * download anything on Windows 11 and nothing short of a restart changes that. Unelevated, no change made
   * beyond starting a demand-start service Windows Update would start anyway.
   */
  async deliveryOptimizationOff() {
    try {
      const res = await this._runner(DO_PROBE_SCRIPT, { timeoutMs: 20000, trim: true })
      const code = Number(/^DHDO\|(\d+)\s*$/m.exec(String(res?.stdout || ''))?.[1])
      return code === 1058 || code === 1060
    } catch {
      return false
    }
  }

  /** Catalog .cab(s) of one plan item, downloaded and hash-checked: [{ id, path, sha256 }]. Throws on failure. */
  async _catalogCabs(itemId, catalogId, hw, note) {
    note({ id: itemId, status: 'downloading', detail: '' })
    const files = await this.downloadCatalog(catalogId, (p) => note({ id: itemId, status: 'downloading', detail: '', ...p }))
    return files.map((f) => ({ id: itemId, path: f.path, sha256: f.sha256, hw }))
  }

  /**
   * Windows Update drivers the client found but could not download or install: the same driver, straight from
   * the Microsoft Update Catalog. Returns the .cab list for a second job; items the catalog does not have keep
   * their failure.
   */
  async _catalogFallback(failed, plan, note, { pre = false, missed = null } = {}) {
    const cache = {}
    const env = plan.env || this._lastScan?.env || {}
    const cabs = []
    await mapLimit(failed, CATALOG_PARALLEL, async (ev) => {
      const u = plan.updatesById?.get(ev.id.slice(3))
      const hw = String(u?.hardwareId || '')
      if (!hw) return
      // Search by the id the update targets, by the same id without the revision / subsystem, then by the
      // update's title; the package must list the exact target id whichever search found it.
      const noRev = hw.replace(/&rev_[0-9a-f]+$/i, '')
      const queries = [...new Set([hw, noRev, noRev.replace(/&subsys_[0-9a-f]+$/i, ''), String(u.title || '').trim()].filter(Boolean))]
      const target = { hardwareIds: [hw], compatibleIds: [], queries }
      // A device without a driver takes any driver made for it; an update for a working device only a
      // driver at least as new as the one Windows Update offered.
      const fixesMissing = Boolean(plan.items?.find((i) => i.id === ev.id)?.fixes?.length)
      try {
        const pkg = await this.catalogFor(target, env, { preferTitle: u.title, minDate: fixesMissing ? '' : String(u.date || ''), cache })
        if (!pkg) {
          missed?.add(ev.id)
          // said in the failure itself, so the screen can tell "Windows Update is broken AND the catalog lacks it"
          if (pre) note({ id: ev.id, status: 'info', detail: `${NOT_IN_CATALOG}: trying Windows Update anyway` })
          else note({ id: ev.id, status: 'failed', detail: `${ev.detail}; ${NOT_IN_CATALOG}` })
          return
        }
        note({ id: ev.id, status: 'info', detail: `${pre ? 'Windows Update cannot download here' : 'Windows Update failed'} (${ev.detail}); getting it from the Microsoft Update Catalog instead: ${pkg.title}` })
        cabs.push(...await this._catalogCabs(ev.id, pkg.id, pkg.hw, note))
      } catch (e) {
        // before the job ran nothing has failed yet: the item simply stays on the Windows Update route
        if (pre) note({ id: ev.id, status: 'info', detail: `Microsoft Update Catalog: ${errText(e)}` })
        else note({ id: ev.id, status: 'failed', detail: `${ev.detail}; Microsoft Update Catalog: ${errText(e)}` })
      }
    })
    return cabs
  }

  /**
   * Installs the chosen plan items. emit({ id, status, detail, received?, total? }) streams progress.
   * opts: { ids[], restorePoint, allowUnlock, clean }
   */
  async install(opts = {}, emit = () => {}) {
    if (process.platform !== 'win32') return { ok: false, error: 'Windows only.' }
    if (!this._elevated) return { ok: false, error: 'Elevation unavailable.' }
    if (this._busy) return { ok: false, error: 'busy' }
    const plan = this._lastPlan
    if (!plan) return { ok: false, error: 'Search for drivers first.' }
    const wanted = new Set(Array.isArray(opts.ids) ? opts.ids.map(String) : [])
    const items = plan.items.filter((i) => wanted.has(i.id))
    if (!items.length) return { ok: false, error: 'Nothing selected.' }
    this._busy = true
    const results = new Map()
    const note = (ev) => {
      if (ev.id && ['ok', 'reboot', 'failed', 'skipped', 'launched'].includes(ev.status)) results.set(ev.id, ev)
      try { emit(ev) } catch { /* renderer gone */ }
    }
    try {
      // 1) vendor packages: download + signature check (unelevated)
      const packages = []
      for (const item of items.filter((i) => i.source === 'vendor')) {
        const pkg = plan.vendorById.get(item.id)
        if (!pkg) { note({ id: item.id, status: 'failed', detail: 'not in the plan' }); continue }
        try {
          note({ id: item.id, status: 'downloading', detail: '' })
          const { file, sha256 } = await this.download(pkg, (p) => note({ id: item.id, status: 'downloading', detail: '', ...p }))
          note({ id: item.id, status: 'verifying', detail: '' })
          const sig = await this.signature(file)
          if (!isExpectedSigner(pkg.vendor, sig)) {
            note({ id: item.id, status: 'failed', detail: `signature ${sig.status}: ${sig.subject || 'unsigned'}` })
            continue
          }
          note({ id: item.id, status: 'info', detail: `signed by ${sig.subject}` })
          packages.push({ id: item.id, vendor: pkg.vendor, path: file, sha256, args: vendorInstallArgs(pkg.vendor, { clean: Boolean(opts.clean) }), wait: vendorIsSilent(pkg.vendor) })
        } catch (e) {
          note({ id: item.id, status: 'failed', detail: String(e?.message ?? e) })
        }
      }
      // 1b) Microsoft Update Catalog packages: download + SHA-256 check (unelevated); signatures are checked by the job
      const cabs = []
      for (const item of items.filter((i) => i.source === 'catalog')) {
        try {
          cabs.push(...await this._catalogCabs(item.id, item.id.slice(4), plan.catalogById?.get(item.id)?.hw || [], note))
        } catch (e) {
          note({ id: item.id, status: 'failed', detail: errText(e) })
        }
      }
      let updateIds = items.filter((i) => i.source === 'wu').map((i) => i.id.slice(3))
      // 1c) Delivery Optimization is off: Windows Update would fail every download (80004002). Take those drivers
      //     from the catalog right away, in the same job; only what the catalog lacks is left to Windows Update.
      const fallback = { tried: 0, ok: 0 }
      const viaCatalog = new Set()
      const askedCatalog = new Set()
      if (updateIds.length && Number(plan.env?.osBuild) >= 22000 && await this.deliveryOptimizationOff()) {
        note({ id: 'wuservice', status: 'info', detail: 'Delivery Optimization is disabled on this system: Windows Update cannot download, using the Microsoft Update Catalog' })
        const pending = updateIds.map((id) => ({ id: `wu:${id}`, status: 'failed', detail: 'Delivery Optimization service disabled' }))
        // askedCatalog: the ones the catalog really does not have (a network error is not an answer)
        const pre = await this._catalogFallback(pending, plan, note, { pre: true, missed: askedCatalog })
        for (const c of pre) viaCatalog.add(c.id)
        cabs.push(...pre)
        updateIds = updateIds.filter((id) => !viaCatalog.has(`wu:${id}`))
        fallback.tried = viaCatalog.size
      }
      if (!packages.length && !updateIds.length && !cabs.length) {
        return { ok: false, error: 'No package passed the checks.', results: [...results.values()] }
      }

      // 2) one elevated job (one UAC prompt)
      const scanWu = this._lastScan?.wu || {}
      const job = await this._runJob((progressFile) => buildInstallScript({
        progressFile,
        restorePoint: Boolean(opts.restorePoint),
        unlockWu: Boolean(opts.allowUnlock) && wuBlockers(scanWu).length > 0,
        updateIds,
        packages,
        cabs
      }), note)
      if (!job.finished) {
        return { ok: false, error: job.stderr || 'The install did not run (administrator permission denied?).', results: [...results.values()] }
      }

      for (const id of viaCatalog) if (['ok', 'reboot'].includes(results.get(id)?.status)) fallback.ok++

      // 2b) Windows Update could not deliver some drivers: get those from the catalog and install them in a second job
      // (the ones the catalog was already asked for before the job are not asked again)
      for (const ev of [...results.values()]) {
        if (isWuFailure(ev) && askedCatalog.has(ev.id) && !viaCatalog.has(ev.id) && !ev.detail.includes(NOT_IN_CATALOG)) note({ ...ev, detail: `${ev.detail}; ${NOT_IN_CATALOG}` })
      }
      const failedWu = [...results.values()].filter((ev) => isWuFailure(ev) && !askedCatalog.has(ev.id))
      if (failedWu.length) {
        const original = new Map(failedWu.map((ev) => [ev.id, ev]))
        const extra = await this._catalogFallback(failedWu, plan, note)
        const ids = [...new Set(extra.map((c) => c.id))]
        fallback.tried += ids.length
        if (extra.length) {
          note({ id: 'job', status: 'info', detail: `installing ${ids.length} driver(s) from the Microsoft Update Catalog` })
          const job2 = await this._runJob((progressFile) => buildInstallScript({ progressFile, restorePoint: false, unlockWu: false, updateIds: [], packages: [], cabs: extra }), note)
          for (const id of ids) {
            // the second job did not run (permission denied): the item is still the failure Windows Update gave
            if (!job2.finished && results.get(id) === original.get(id)) note({ ...original.get(id) })
            if (['ok', 'reboot'].includes(results.get(id)?.status)) fallback.ok++
          }
        }
      }

      // 3) verify on the machine: rescan
      const after = await this.scan()
      const list = [...results.values()]
      return {
        ok: list.every((r) => r.status !== 'failed'),
        results: list,
        rebootRequired: list.some((r) => r.status === 'reboot'),
        catalogFallback: fallback,
        after: after.ok ? { missing: after.missing, gpus: after.gpus } : null
      }
    } finally {
      this._busy = false
    }
  }
}

export default DriverInstallService
