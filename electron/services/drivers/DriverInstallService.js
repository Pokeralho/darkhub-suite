// Driver Center: find, download and install missing drivers (Windows Update + official GPU vendor packages).
//
// Sources (HTTPS, official only):
//   - Windows Update driver catalog through the Windows Update Agent COM API (Microsoft.Update.Session).
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

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const MAX_PACKAGE_BYTES = 3 * 1024 * 1024 * 1024
const INSTALL_TIMEOUT_MS = 2 * 60 * 60 * 1000

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
function Unlock-DhWu {
  foreach ($n in 'wuauserv','bits','dosvc') {
    $k = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\' + $n
    $v = (Get-ItemProperty -LiteralPath $k -ErrorAction SilentlyContinue).Start
    if ($v -eq 4) {
      $script:DhWuRestore += [pscustomobject]@{ n = $n; v = [int]$v; wasRunning = $false }
      Set-DhSvcStart $n 3
      DhP 'wuservice' 'info' ('enabled ' + $n)
    }
  }
  $pk = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate'
  foreach ($name in 'ExcludeWUDriversInQualityUpdate','DoNotConnectToWindowsUpdateInternetLocations') {
    $cur = (Get-ItemProperty -LiteralPath $pk -Name $name -ErrorAction SilentlyContinue).$name
    if ($cur -eq 1) {
      $script:DhPolRestore += $name
      Set-ItemProperty -LiteralPath $pk -Name $name -Value 0 -Type DWord -Force
      DhP 'wuservice' 'info' ('policy lifted ' + $name)
    }
  }
  Start-Service -Name wuauserv -ErrorAction Stop
}
function Restore-DhWu {
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
  Unlock-DhWu
${WU_SEARCH_BODY}
  Write-Output ('DHJSON|' + (ConvertTo-Json -InputObject @($list) -Depth 3 -Compress))
} catch {
  Write-Output ('DHERR|' + ('{0:X8}' -f $_.Exception.HResult) + '|' + (([string]$_.Exception.Message) -replace '[\\r\\n|]+', ' '))
} finally {
  Restore-DhWu
}`
}

/**
 * The elevated install job. ASCII only. Steps: restore point -> Windows Update drivers -> vendor packages.
 * opts: { progressFile, restorePoint, unlockWu, updateIds[], packages[{ id, vendor, path, sha256, args[], wait }] }
 */
export function buildInstallScript(opts) {
  const ids = (opts.updateIds || []).filter(isUpdateId).map((s) => psQuote(s.toLowerCase())).join(',')
  const pkgs = (opts.packages || []).map((p) => `[pscustomobject]@{ id = ${psQuote(p.id)}; vendor = ${psQuote(p.vendor)}; path = ${psQuote(p.path)}; sha = ${psQuote(String(p.sha256).toUpperCase())}; pattern = ${psQuote(SIGNER_PATTERNS[p.vendor] || '^$')}; args = @(${(p.args || []).map(psQuote).join(',')}); wait = $${p.wait ? 'true' : 'false'} }`).join(',\n  ')
  return `$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
${dhpFunc(opts.progressFile)}
${WU_UNLOCK_FUNCS}
$wuIds = @(${ids})
$packages = @(
  ${pkgs}
)
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
  try {
    if (${opts.unlockWu ? '$true' : '$false'}) { Unlock-DhWu } else { Start-Service -Name wuauserv -ErrorAction SilentlyContinue }
    foreach ($id in $wuIds) { DhP ('wu:' + $id) 'start' '' }
    $session = New-Object -ComObject Microsoft.Update.Session
    $session.ClientApplicationID = 'DarkHub Suite'
    $searcher = $session.CreateUpdateSearcher()
    $searcher.ServerSelection = 2
    $searcher.Online = $true
    $res = $searcher.Search("IsInstalled=0 and Type='Driver' and IsHidden=0")
    $found = @{}
    foreach ($u in $res.Updates) { $found[([string]$u.Identity.UpdateID).ToLower()] = $u }
    foreach ($id in $wuIds) {
      $u = $found[$id]
      if (-not $u) { DhP ('wu:' + $id) 'skipped' 'not offered anymore'; continue }
      try {
        if (-not $u.EulaAccepted) { $u.AcceptEula() }
        $coll = New-Object -ComObject Microsoft.Update.UpdateColl
        [void]$coll.Add($u)
        DhP ('wu:' + $id) 'downloading' ''
        $dl = $session.CreateUpdateDownloader(); $dl.Updates = $coll
        $dr = $dl.Download()
        if ($dr.ResultCode -ne 2 -and $dr.ResultCode -ne 3) { DhP ('wu:' + $id) 'failed' ('download result ' + $dr.ResultCode + ' ' + ('{0:X8}' -f $dr.HResult)); continue }
        DhP ('wu:' + $id) 'installing' ''
        $in = $session.CreateUpdateInstaller(); $in.Updates = $coll
        $ir = $in.Install()
        $ur = $ir.GetUpdateResult(0)
        if ($ur.ResultCode -eq 2 -or $ur.ResultCode -eq 3) {
          if ($ur.RebootRequired) { DhP ('wu:' + $id) 'reboot' '' } else { DhP ('wu:' + $id) 'ok' '' }
        } else { DhP ('wu:' + $id) 'failed' ('install result ' + $ur.ResultCode + ' ' + ('{0:X8}' -f $ur.HResult)) }
      } catch { DhP ('wu:' + $id) 'failed' $_.Exception.Message }
    }
  } catch {
    foreach ($id in $wuIds) { DhP ('wu:' + $id) 'failed' $_.Exception.Message }
  } finally {
    Restore-DhWu
  }
}

if (-not $abort) {
  foreach ($p in $packages) {
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
      }
    } catch { DhP $p.id 'failed' $_.Exception.Message }
  }
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

async function fetchText(url, { referer, timeoutMs = 30000 } = {}) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'text/html,application/json;q=0.9,*/*;q=0.8', 'accept-language': 'en-US,en;q=0.9', ...(referer ? { referer } : {}) },
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
   * Full search: scan + Windows Update + vendor lookups -> plan. The plan is kept in memory; install() only
   * accepts ids from it (the renderer never hands over a URL).
   */
  async findDrivers({ allowUnlock = false } = {}) {
    const scan = await this.scan()
    if (!scan.ok) return scan
    const [wu, vendorResults] = await Promise.all([
      this.searchWindowsUpdate({ allowUnlock }),
      Promise.all(scan.gpus.map((g) => this.lookupVendor(g, scan.env)))
    ])
    const vendor = vendorResults.filter((v) => v.ok)
    const items = buildPlan({ devices: scan.devices, updates: wu.ok ? wu.updates : [], vendor })
    const byId = new Map()
    for (const v of vendor) byId.set(`vendor:${v.vendor}:${v.deviceId || 'any'}`, v)
    this._lastPlan = { items, vendorById: byId }
    return {
      ok: true,
      devices: scan.devices,
      missing: scan.missing,
      gpus: scan.gpus,
      wu: { ...scan.wu, ok: wu.ok, error: wu.ok ? '' : (wu.error || ''), kind: wu.kind || '', needsUnlock: Boolean(wu.needsUnlock), blockers: wu.blockers || scan.wuBlockers, count: wu.ok ? wu.updates.length : 0 },
      vendorLookups: vendorResults.map((v) => ({ vendor: v.vendor, deviceId: v.deviceId, ok: v.ok, error: v.ok ? '' : v.error, version: v.version || '' })),
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

  /** Authenticode of a downloaded file: { status, subject }. */
  async signature(file) {
    const res = await this._runner(`$s = Get-AuthenticodeSignature -LiteralPath ${psQuote(file)}; [pscustomobject]@{ status = "$($s.Status)"; subject = "$($s.SignerCertificate.Subject)" } | ConvertTo-Json -Compress`, { timeoutMs: 60000, trim: true })
    return parseJsonOutput(res?.stdout, { status: 'Unknown', subject: '' }) || { status: 'Unknown', subject: '' }
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
      const updateIds = items.filter((i) => i.source === 'wu').map((i) => i.id.slice(3))
      if (!packages.length && !updateIds.length) {
        return { ok: false, error: 'No package passed the checks.', results: [...results.values()] }
      }

      // 2) one elevated job (one UAC prompt); progress comes back through a file we tail
      const jobDir = path.join(driversDir(), `job-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`)
      fs.mkdirSync(jobDir, { recursive: true })
      const progressFile = path.join(jobDir, 'progress.log')
      fs.writeFileSync(progressFile, '')
      const scanWu = this._lastScan?.wu || {}
      const script = buildInstallScript({
        progressFile,
        restorePoint: Boolean(opts.restorePoint),
        unlockWu: Boolean(opts.allowUnlock) && wuBlockers(scanWu).length > 0,
        updateIds,
        packages
      })
      let offset = 0
      const seen = new Set()
      const pump = () => {
        try {
          const buf = fs.readFileSync(progressFile)
          if (buf.length <= offset) return
          const text = buf.subarray(offset).toString('utf8')
          const cut = text.lastIndexOf('\n')
          if (cut < 0) return
          offset += Buffer.byteLength(text.slice(0, cut + 1))
          for (const ev of parseProgressText(text.slice(0, cut + 1))) {
            const key = `${ev.id}|${ev.status}|${ev.detail}`
            if (seen.has(key)) continue
            seen.add(key)
            note(ev)
          }
        } catch { /* file busy */ }
      }
      const timer = setInterval(pump, 700)
      let res
      try {
        res = await this._elevated(script, { timeoutMs: INSTALL_TIMEOUT_MS })
      } finally {
        clearInterval(timer)
        pump()
        // The job also echoes every line to stdout: catches lines the file missed.
        for (const ev of parseProgressText(res?.stdout || '')) {
          const key = `${ev.id}|${ev.status}|${ev.detail}`
          if (!seen.has(key)) { seen.add(key); note(ev) }
        }
        try { fs.rmSync(jobDir, { recursive: true, force: true }) } catch { /* ignore */ }
      }
      const finished = /DHDONE/.test(String(res?.stdout || ''))
      if (!finished) {
        return { ok: false, error: String(res?.stderr || '').trim() || 'The install did not run (administrator permission denied?).', results: [...results.values()] }
      }
      // 3) verify on the machine: rescan
      const after = await this.scan()
      const list = [...results.values()]
      return {
        ok: list.every((r) => r.status !== 'failed'),
        results: list,
        rebootRequired: list.some((r) => r.status === 'reboot'),
        after: after.ok ? { missing: after.missing, gpus: after.gpus } : null
      }
    } finally {
      this._busy = false
    }
  }
}

export default DriverInstallService
