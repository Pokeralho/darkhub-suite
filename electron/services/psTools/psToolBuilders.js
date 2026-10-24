// PowerShell Tools toolkit: pure helpers (no electron, no child_process) so everything here is unit-testable.
//
// The tool catalog lives in toolSchema.json (shared with the renderer, which builds its forms from it).
// This module validates parameters against that schema and turns a validated request into a "plan":
//   { kind: 'ps' | 'cmd' | 'native', script?, command?, args?, admin, mutating, output, timeoutMs, preview }
// Every user value reaches PowerShell only through psQuote (single-quoted literal) or as a validated number.

import { createRequire } from 'node:module'
import path from 'node:path'
import { psQuote } from '../optimizer/OptimizerUtils.js'

const require = createRequire(import.meta.url)
export const TOOL_SCHEMA = require('./toolSchema.json')

const CONTROL = /[\u0000-\u001f]/

export function getTool(id) {
  return TOOL_SCHEMA.tools.find((t) => t.id === id) || null
}

/** Splits "a; b, c" into trimmed non-empty tokens. */
export function splitPatterns(value) {
  return String(value ?? '')
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Exclusion tokens without a wildcard match anywhere in the path. */
export function toExcludeWildcards(tokens) {
  return tokens.map((t) => (/[*?]/.test(t) ? t : `*${t}*`))
}

/** Plain absolute drive path (C:\...), no UNC/device prefixes, no ADS, no wildcards. */
export function isPlainAbsPath(p) {
  if (typeof p !== 'string') return false
  const raw = p.trim()
  if (!raw || raw.length > 260) return false
  if (!/^[A-Za-z]:\\/.test(raw)) return false
  if (raw.indexOf(':', 2) !== -1) return false
  if (CONTROL.test(raw) || /[*?"<>|]/.test(raw)) return false
  return true
}

/** Folders a bulk delete must never target (drive roots, Windows, Program Files, profile roots). */
export function isDangerousCleanupRoot(folder, env = process.env) {
  if (!isPlainAbsPath(folder)) return true
  const norm = (p) => path.win32.resolve(String(p)).replace(/\\+$/, '').toLowerCase()
  const target = norm(folder)
  if (/^[a-z]:$/.test(target)) return true
  const sysRoot = env.SystemRoot || env.windir || 'C:\\Windows'
  const exact = [
    env.USERPROFILE, env.PUBLIC, env.ProgramData || 'C:\\ProgramData', 'C:\\Users',
    env.APPDATA, env.LOCALAPPDATA, path.win32.join(env.USERPROFILE || 'C:\\Users\\x', 'Documents'),
    path.win32.join(env.USERPROFILE || 'C:\\Users\\x', 'Desktop')
  ].filter(Boolean).map(norm)
  if (exact.includes(target)) return true
  const trees = [sysRoot, env.ProgramFiles || 'C:\\Program Files', env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)']
    .filter(Boolean).map(norm)
  return trees.some((t) => target === t || target.startsWith(t + '\\'))
}

/**
 * Validates `params` against a tool's schema. Returns { ok, values, errors } where errors maps key -> code
 * (required | number | min | max | option | pattern | length | path | chars).
 */
export function validateParams(tool, params = {}) {
  const values = {}
  const errors = {}
  for (const p of tool?.params || []) {
    let v = params?.[p.key]
    if (v === undefined || v === null || v === '') v = p.default
    switch (p.type) {
      case 'bool':
        values[p.key] = v === true || v === 'true'
        break
      case 'number': {
        const n = typeof v === 'number' ? v : Number(String(v).trim())
        if (!Number.isFinite(n) || !Number.isInteger(n)) { errors[p.key] = 'number'; break }
        if (typeof p.min === 'number' && n < p.min) { errors[p.key] = 'min'; break }
        if (typeof p.max === 'number' && n > p.max) { errors[p.key] = 'max'; break }
        values[p.key] = n
        break
      }
      case 'select': {
        const s = String(v ?? '')
        if (!(p.options || []).some((o) => o.value === s)) { errors[p.key] = 'option'; break }
        values[p.key] = s
        break
      }
      case 'text':
      case 'patterns': {
        const s = String(v ?? '').trim()
        if (p.required && !s) { errors[p.key] = 'required'; break }
        if (p.maxLength && s.length > p.maxLength) { errors[p.key] = 'length'; break }
        if (CONTROL.test(s)) { errors[p.key] = 'chars'; break }
        if (p.type === 'patterns' && /["<>|]/.test(s)) { errors[p.key] = 'chars'; break }
        if (s && p.pattern && !new RegExp(p.pattern).test(s)) { errors[p.key] = 'pattern'; break }
        values[p.key] = s
        break
      }
      case 'folder': {
        const s = String(v ?? '').trim()
        if (!s) { if (p.required) errors[p.key] = 'required'; else values[p.key] = ''; break }
        if (s.toUpperCase() === '%TEMP%') { values[p.key] = '%TEMP%'; break }
        if (!isPlainAbsPath(s)) { errors[p.key] = 'path'; break }
        values[p.key] = s
        break
      }
      case 'savePath': {
        const s = String(v ?? '').trim()
        if (!s) { if (p.required) errors[p.key] = 'required'; else values[p.key] = ''; break }
        if (!isPlainAbsPath(s)) { errors[p.key] = 'path'; break }
        if (p.ext && !s.toLowerCase().endsWith('.' + p.ext)) { errors[p.key] = 'path'; break }
        values[p.key] = s
        break
      }
      default:
        errors[p.key] = 'option'
    }
  }
  return { ok: Object.keys(errors).length === 0, values, errors }
}

function condition(cond, values) {
  return !!cond && values[cond.key] === cond.equals
}

/** Whether a run with these (validated) values needs admin and/or changes the system. */
export function toolFlags(tool, values) {
  return {
    admin: tool.admin === true || condition(tool.adminWhen, values),
    mutating: tool.mutating === true || condition(tool.mutatingWhen, values)
  }
}

// PowerShell 5.1 writes the pipe in the OEM code page; force UTF-8 so accents survive. JSON helper included.
const PRELUDE = `$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
function DhOut($rows) { ConvertTo-Json -InputObject @($rows) -Depth 4 -Compress }
function DhHas([string]$text, [string]$needle) { if (-not $needle) { return $true }; return ($text -and $text.IndexOf($needle, [StringComparison]::OrdinalIgnoreCase) -ge 0) }
`

const psList = (tokens) => `@(${tokens.map(psQuote).join(', ')})`
const folderExpr = (v) => (v === '%TEMP%' ? '$env:TEMP' : psQuote(v))

/** Shared file enumeration used by largeFiles / duplicates / cleanOldFiles. */
function fileScan({ folder, recurse, depth, include, exclude }) {
  const inc = splitPatterns(include)
  const exc = toExcludeWildcards(splitPatterns(exclude))
  const depthArg = recurse ? ` -Recurse -Depth ${Number(depth) || 32}` : ''
  return `$root = ${folderExpr(folder)}
if (-not (Test-Path -LiteralPath $root -PathType Container)) { 'DH_NOFOLDER'; exit 3 }
$inc = ${psList(inc)}
$exc = ${psList(exc)}
$files = Get-ChildItem -LiteralPath $root -File -Force${depthArg} -ErrorAction SilentlyContinue | Where-Object {
  $n = $_.Name; $f = $_.FullName
  (($inc.Count -eq 0) -or (@($inc | Where-Object { $n -like $_ }).Count -gt 0)) -and (@($exc | Where-Object { $f -like $_ }).Count -eq 0)
}
`
}

const BUILDERS = {
  sysinfo: () => ({
    script: `${PRELUDE}
$os = Get-CimInstance Win32_OperatingSystem
$cs = Get-CimInstance Win32_ComputerSystem
$bios = Get-CimInstance Win32_BIOS
$board = Get-CimInstance Win32_BaseBoard
$rows = New-Object System.Collections.ArrayList
function Add($k, $v) { [void]$rows.Add([pscustomobject]@{ Item = $k; Value = "$v" }) }
Add 'Computer' $env:COMPUTERNAME
Add 'User' "$env:USERDOMAIN\\$env:USERNAME"
Add 'OS' $os.Caption
Add 'Version' "$($os.Version) (build $($os.BuildNumber))"
$dv = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion').DisplayVersion
if ($dv) { Add 'Release' $dv }
Add 'Architecture' $os.OSArchitecture
Add 'Installed' $os.InstallDate.ToString('yyyy-MM-dd')
Add 'LastBoot' $os.LastBootUpTime.ToString('yyyy-MM-dd HH:mm')
$up = (Get-Date) - $os.LastBootUpTime
Add 'Uptime' ('{0}d {1}h {2}m' -f $up.Days, $up.Hours, $up.Minutes)
Add 'Manufacturer' $cs.Manufacturer
Add 'Model' $cs.Model
Add 'Motherboard' "$($board.Manufacturer) $($board.Product)"
Add 'BIOS' "$($bios.Manufacturer) $($bios.SMBIOSBIOSVersion) ($($bios.ReleaseDate.ToString('yyyy-MM-dd')))"
foreach ($c in Get-CimInstance Win32_Processor) { Add 'CPU' "$($c.Name.Trim()) - $($c.NumberOfCores)C/$($c.NumberOfLogicalProcessors)T" }
Add 'RAM' ('{0:N1} GB' -f ($cs.TotalPhysicalMemory / 1GB))
Add 'RAMFree' ('{0:N1} GB' -f ($os.FreePhysicalMemory * 1KB / 1GB))
foreach ($g in Get-CimInstance Win32_VideoController) { Add 'GPU' "$($g.Name) (driver $($g.DriverVersion))" }
foreach ($d in Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3') { Add "Disk $($d.DeviceID)" ('{0:N1} GB free of {1:N1} GB ({2})' -f ($d.FreeSpace / 1GB), ($d.Size / 1GB), $d.FileSystem) }
DhOut $rows`,
    timeoutMs: 60000
  }),

  startupItems: (v) => ({
    script: `${PRELUDE}
$q = ${psQuote(v.filter)}
$rows = Get-CimInstance Win32_StartupCommand | Where-Object { (DhHas $_.Name $q) -or (DhHas $_.Command $q) } | ForEach-Object {
  [pscustomobject]@{ Name = "$($_.Name)"; Command = "$($_.Command)"; Location = "$($_.Location)"; User = "$($_.User)" }
}
DhOut $rows`,
    timeoutMs: 45000
  }),

  scheduledTasks: (v) => ({
    script: `${PRELUDE}
$q = ${psQuote(v.filter)}
$state = ${psQuote(v.state)}
$hide = ${v.hideMicrosoft ? '$true' : '$false'}
$tasks = Get-ScheduledTask | Where-Object {
  (-not $hide -or $_.TaskPath -notlike '\\Microsoft\\*') -and ($state -eq 'All' -or "$($_.State)" -eq $state)
}
$rows = $tasks | ForEach-Object {
  $act = ($_.Actions | ForEach-Object { ("$($_.Execute) $($_.Arguments)").Trim() }) -join '; '
  if ((DhHas $_.TaskName $q) -or (DhHas $_.TaskPath $q) -or (DhHas $act $q)) {
    $i = $_ | Get-ScheduledTaskInfo -ErrorAction SilentlyContinue
    [pscustomobject]@{
      Name = $_.TaskName; Path = $_.TaskPath; State = "$($_.State)"; Author = "$($_.Author)"
      LastRun = if ($i -and $i.LastRunTime -and $i.LastRunTime.Year -gt 2000) { $i.LastRunTime.ToString('yyyy-MM-dd HH:mm') } else { '' }
      NextRun = if ($i -and $i.NextRunTime) { $i.NextRunTime.ToString('yyyy-MM-dd HH:mm') } else { '' }
      Action = $act
    }
  }
} | Select-Object -First 1000
DhOut $rows`,
    timeoutMs: 120000
  }),

  services: (v) => ({
    script: `${PRELUDE}
$q = ${psQuote(v.filter)}
$state = ${psQuote(v.state)}
$mode = ${psQuote(v.startMode)}
$hideWin = ${v.hideWindows ? '$true' : '$false'}
$rows = Get-CimInstance Win32_Service | Where-Object {
  ((DhHas $_.Name $q) -or (DhHas $_.DisplayName $q)) -and ($state -eq 'All' -or $_.State -eq $state) -and ($mode -eq 'All' -or $_.StartMode -eq $mode) -and (-not $hideWin -or "$($_.PathName)" -notmatch '\\\\Windows\\\\')
} | Sort-Object DisplayName | ForEach-Object {
  [pscustomobject]@{ Name = $_.Name; DisplayName = $_.DisplayName; State = $_.State; StartMode = $_.StartMode; Account = "$($_.StartName)"; Path = "$($_.PathName)" }
}
DhOut $rows`,
    timeoutMs: 60000
  }),

  eventLog: (v) => {
    const levels = { critical: '1', error: '1,2', warning: '1,2,3' }[v.level]
    return {
      script: `${PRELUDE}
$evts = Get-WinEvent -FilterHashtable @{ LogName = ${psQuote(v.log)}; Level = @(${levels}); StartTime = (Get-Date).AddHours(-${v.hours}) } -MaxEvents ${v.max} -ErrorAction SilentlyContinue
$rows = $evts | ForEach-Object {
  $m = "$($_.Message)" -split "\`r?\`n" | Select-Object -First 1
  if ($m.Length -gt 300) { $m = $m.Substring(0, 300) + '...' }
  [pscustomobject]@{ Time = $_.TimeCreated.ToString('yyyy-MM-dd HH:mm:ss'); Level = "$($_.LevelDisplayName)"; Source = $_.ProviderName; EventId = $_.Id; Message = $m }
}
DhOut $rows`,
      timeoutMs: 90000
    }
  },

  envVars: (v) => {
    const scopes = v.scope === 'All' ? ['User', 'Machine'] : [v.scope]
    return {
      script: `${PRELUDE}
$q = ${psQuote(v.filter)}
$rows = foreach ($s in ${psList(scopes)}) {
  $vars = [Environment]::GetEnvironmentVariables([EnvironmentVariableTarget]$s)
  foreach ($k in ($vars.Keys | Sort-Object)) {
    $val = "$($vars[$k])"
    if ((DhHas $k $q) -or (DhHas $val $q)) { [pscustomobject]@{ Scope = $s; Name = "$k"; Value = $val } }
  }
}
DhOut $rows`,
      timeoutMs: 30000
    }
  },

  installedApps: (v) => ({
    script: `${PRELUDE}
$q = ${psQuote(v.filter)}
$incSys = ${v.includeSystem ? '$true' : '$false'}
$paths = @('HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*', 'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*', 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*')
$seen = @{}
$rows = Get-ItemProperty -Path $paths -ErrorAction SilentlyContinue | Where-Object {
  $_.DisplayName -and ($incSys -or (-not $_.SystemComponent -and -not $_.ParentKeyName -and "$($_.ReleaseType)" -notmatch 'Update|Hotfix')) -and ((DhHas $_.DisplayName $q) -or (DhHas $_.Publisher $q))
} | Sort-Object DisplayName | ForEach-Object {
  $key = "$($_.DisplayName)|$($_.DisplayVersion)"
  if (-not $seen.ContainsKey($key)) {
    $seen[$key] = 1
    [pscustomobject]@{
      Name = "$($_.DisplayName)"; Version = "$($_.DisplayVersion)"; Publisher = "$($_.Publisher)"
      InstallDate = "$($_.InstallDate)"
      SizeMB = if ($_.EstimatedSize) { [math]::Round([double]$_.EstimatedSize / 1024, 1) } else { $null }
      Scope = if ($_.PSPath -like '*HKEY_CURRENT_USER*') { 'User' } else { 'Machine' }
    }
  }
}
DhOut $rows`,
    timeoutMs: 60000
  }),

  wingetUpgrades: (v) => ({
    kind: 'cmd',
    command: 'winget.exe',
    args: ['upgrade', '--disable-interactivity', ...(v.includeUnknown ? ['--include-unknown'] : [])],
    parse: 'winget',
    timeoutMs: 180000
  }),

  wingetUpgrade: (v) => {
    if (!v.all && !v.id) return { error: 'Informe o ID do pacote.' }
    const target = v.all ? ['--all'] : ['--id', v.id, '--exact']
    return {
      kind: 'cmd',
      command: 'winget.exe',
      args: ['upgrade', ...target, '--silent', '--disable-interactivity', '--accept-package-agreements', '--accept-source-agreements'],
      timeoutMs: 45 * 60000
    }
  },

  diskHealth: () => ({
    script: `${PRELUDE}
$rows = Get-PhysicalDisk | Sort-Object DeviceId | ForEach-Object {
  $r = $_ | Get-StorageReliabilityCounter -ErrorAction SilentlyContinue
  [pscustomobject]@{
    Disk = $_.FriendlyName; Media = "$($_.MediaType)"; Bus = "$($_.BusType)"; Health = "$($_.HealthStatus)"
    Status = ("$($_.OperationalStatus)"); SizeGB = [math]::Round($_.Size / 1GB, 1)
    TempC = $r.Temperature; WearPct = $r.Wear; PowerOnHours = $r.PowerOnHours
    ReadErrors = $r.ReadErrorsTotal; WriteErrors = $r.WriteErrorsTotal
  }
}
DhOut $rows`,
    timeoutMs: 60000
  }),

  largeFiles: (v) => ({
    script: `${PRELUDE}
${fileScan(v)}
$min = [int64]${v.minSizeMB} * 1MB
$cut = ${v.olderThanDays > 0 ? `(Get-Date).AddDays(-${v.olderThanDays})` : '$null'}
$rows = $files | Where-Object { $_.Length -ge $min -and (-not $cut -or $_.LastWriteTime -lt $cut) } | Sort-Object Length -Descending | Select-Object -First ${v.top} | ForEach-Object {
  [pscustomobject]@{ Path = $_.FullName; SizeMB = [math]::Round($_.Length / 1MB, 1); Modified = $_.LastWriteTime.ToString('yyyy-MM-dd HH:mm') }
}
DhOut $rows`,
    timeoutMs: 10 * 60000
  }),

  duplicates: (v) => ({
    script: `${PRELUDE}
${fileScan(v)}
$min = [int64]${v.minSizeKB} * 1KB
$cands = @($files | Where-Object { $_.Length -ge $min } | Group-Object Length | Where-Object { $_.Count -gt 1 } | ForEach-Object { $_.Group }) | Select-Object -First ${v.maxFiles}
$rows = New-Object System.Collections.ArrayList
$g = 0
$cands | ForEach-Object {
  $h = Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256 -ErrorAction SilentlyContinue
  if ($h) { [pscustomobject]@{ F = $_; H = $h.Hash } }
} | Group-Object H | Where-Object { $_.Count -gt 1 } | Sort-Object { $_.Group[0].F.Length * ($_.Count - 1) } -Descending | ForEach-Object {
  $g++
  foreach ($x in $_.Group) {
    [void]$rows.Add([pscustomobject]@{ Group = $g; Hash = $x.H.Substring(0, 16); SizeKB = [math]::Round($x.F.Length / 1KB, 1); Path = $x.F.FullName; Modified = $x.F.LastWriteTime.ToString('yyyy-MM-dd HH:mm') })
  }
}
DhOut $rows`,
    timeoutMs: 20 * 60000
  }),

  cleanOldFiles: (v) => {
    if (v.folder !== '%TEMP%' && isDangerousCleanupRoot(v.folder)) {
      return { error: 'Por segurança, esta pasta não pode ser limpa (raiz do disco, Windows, Arquivos de Programas ou pasta do perfil).' }
    }
    return {
      script: `${PRELUDE}
${fileScan(v)}
$cut = (Get-Date).AddDays(-${v.olderThanDays})
$dry = ${v.dryRun ? '$true' : '$false'}
if (-not $dry) { Add-Type -AssemblyName Microsoft.VisualBasic }
$rows = $files | Where-Object { $_.LastWriteTime -lt $cut } | Select-Object -First 5000 | ForEach-Object {
  $act = 'Preview'
  if (-not $dry) {
    try {
      # Skip files in use: an error dialog from the recycle API would block this hidden process.
      $s = [IO.File]::Open($_.FullName, 'Open', 'ReadWrite', 'None'); $s.Close()
      [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($_.FullName, 'OnlyErrorDialogs', 'SendToRecycleBin')
      $act = 'Recycled'
    } catch { $act = 'Skipped' }
  }
  [pscustomobject]@{ Path = $_.FullName; SizeKB = [math]::Round($_.Length / 1KB, 1); Modified = $_.LastWriteTime.ToString('yyyy-MM-dd HH:mm'); Action = $act }
}
DhOut $rows`,
      timeoutMs: 20 * 60000
    }
  },

  openPorts: (v) => ({
    script: `${PRELUDE}
$procs = @{}
Get-Process | ForEach-Object { $procs[[int]$_.Id] = $_.ProcessName }
$port = ${v.port}
$q = ${psQuote(v.process)}
$rows = New-Object System.Collections.ArrayList
${v.protocol !== 'udp' ? `$tcp = ${v.listenOnly ? 'Get-NetTCPConnection -State Listen' : 'Get-NetTCPConnection'} -ErrorAction SilentlyContinue
foreach ($c in $tcp) {
  $pn = $procs[[int]$c.OwningProcess]
  if (($port -eq 0 -or $c.LocalPort -eq $port -or $c.RemotePort -eq $port) -and (DhHas $pn $q)) {
    [void]$rows.Add([pscustomobject]@{ Protocol = 'TCP'; LocalAddress = $c.LocalAddress; LocalPort = $c.LocalPort; RemoteAddress = $c.RemoteAddress; RemotePort = $c.RemotePort; State = "$($c.State)"; PID = $c.OwningProcess; Process = $pn })
  }
}` : ''}
${v.protocol !== 'tcp' ? `foreach ($u in (Get-NetUDPEndpoint -ErrorAction SilentlyContinue)) {
  $pn = $procs[[int]$u.OwningProcess]
  if (($port -eq 0 -or $u.LocalPort -eq $port) -and (DhHas $pn $q)) {
    [void]$rows.Add([pscustomobject]@{ Protocol = 'UDP'; LocalAddress = $u.LocalAddress; LocalPort = $u.LocalPort; RemoteAddress = ''; RemotePort = $null; State = ''; PID = $u.OwningProcess; Process = $pn })
  }
}` : ''}
DhOut ($rows | Sort-Object Protocol, LocalPort)`,
    timeoutMs: 60000
  }),

  wifiProfiles: () => ({ kind: 'native', native: 'wifiProfiles', timeoutMs: 30000 }),
  hosts: () => ({ kind: 'native', native: 'hosts', timeoutMs: 10000 }),

  updateHistory: (v) => ({
    script: `${PRELUDE}
$s = New-Object -ComObject Microsoft.Update.Session
$q = $s.CreateUpdateSearcher()
$n = $q.GetTotalHistoryCount()
$hideDef = ${v.hideDefender ? '$true' : '$false'}
$rows = @()
if ($n -gt 0) {
  $rows = $q.QueryHistory(0, [math]::Min($n, ${v.hideDefender ? Math.min(v.count * 5, 5000) : v.count})) | Where-Object { $_.Title -and (-not $hideDef -or $_.Title -notmatch 'KB2267602|Security Intelligence|Defender Antivirus') } | Select-Object -First ${v.count} | ForEach-Object {
    [pscustomobject]@{
      Date = $_.Date.ToLocalTime().ToString('yyyy-MM-dd HH:mm')
      Title = $_.Title
      KB = ([regex]::Match($_.Title, 'KB\\d+')).Value
      Operation = switch ($_.Operation) { 1 { 'Install' } 2 { 'Uninstall' } default { 'Other' } }
      Result = switch ($_.ResultCode) { 1 { 'InProgress' } 2 { 'Succeeded' } 3 { 'SucceededWithErrors' } 4 { 'Failed' } 5 { 'Aborted' } default { "$($_.ResultCode)" } }
    }
  }
}
DhOut $rows`,
    timeoutMs: 120000
  }),

  // sfc writes UTF-16 when redirected: decoding it as Unicode avoids NUL-interleaved text.
  sfc: (v) => ({
    script: `try { [Console]::OutputEncoding = [Text.Encoding]::Unicode } catch {}
& "$env:SystemRoot\\System32\\sfc.exe" ${v.mode === 'scannow' ? '/scannow' : '/verifyonly'}
"DH_EXIT=$LASTEXITCODE"`,
    timeoutMs: 90 * 60000
  }),

  dism: (v) => ({
    script: `& "$env:SystemRoot\\System32\\Dism.exe" /Online /Cleanup-Image ${{ check: '/CheckHealth', scan: '/ScanHealth', restore: '/RestoreHealth' }[v.mode]} /English
"DH_EXIT=$LASTEXITCODE"`,
    timeoutMs: 90 * 60000
  }),

  batteryReport: (v) => ({
    kind: 'cmd',
    command: 'powercfg.exe',
    args: ['/batteryreport', '/output', v.outputPath],
    file: v.outputPath,
    timeoutMs: 60000
  }),

  energyReport: (v) => ({
    script: `& "$env:SystemRoot\\System32\\powercfg.exe" /energy /output ${psQuote(v.outputPath)} /duration ${v.duration}
"DH_EXIT=$LASTEXITCODE"`,
    file: v.outputPath,
    timeoutMs: (v.duration + 180) * 1000
  })
}

/** Quotes a command line for display only (never executed through a shell). */
export function displayCommand(command, args = []) {
  return [command, ...args].map((a) => (/[\s"]/.test(a) ? `"${String(a).replace(/"/g, '\\"')}"` : a)).join(' ')
}

/**
 * Validates and builds the execution plan for a tool. Returns { ok:false, errors|error } or { ok:true, plan }.
 * `plan.preview` is exactly what will run (shown in the confirmation dialog and the "show command" panel).
 */
export function buildPlan(id, params = {}) {
  const tool = getTool(id)
  if (!tool || !BUILDERS[id]) return { ok: false, error: 'Ferramenta desconhecida.' }
  const v = validateParams(tool, params)
  if (!v.ok) return { ok: false, errors: v.errors, error: 'Parâmetros inválidos.' }
  const built = BUILDERS[id](v.values)
  if (built.error) return { ok: false, error: built.error }
  const flags = toolFlags(tool, v.values)
  const kind = built.kind || 'ps'
  const preview = kind === 'cmd'
    ? displayCommand(built.command, built.args)
    : kind === 'native' ? `(${built.native})` : built.script.replace(PRELUDE, '').trim()
  return {
    ok: true,
    plan: {
      id, kind, output: tool.output, ...flags, values: v.values,
      script: built.script, command: built.command, args: built.args, native: built.native,
      parse: built.parse, file: built.file, timeoutMs: built.timeoutMs || 60000, preview
    }
  }
}

// ---------- Parsers ----------

/** Keeps the text after the last carriage return of each line (winget redraws its spinner with \r). */
function cleanConsoleLines(text) {
  return String(text ?? '').replace(/\u0000/g, '').split('\n').map((l) => {
    const parts = l.split('\r').filter((p) => p.length)
    return (parts.length ? parts[parts.length - 1] : '').replace(/\s+$/, '')
  })
}

/**
 * Parses `winget upgrade` table output (any UI language): the header is the line right above the dashes line;
 * column starts are where a word begins in that header. Returns [{ Name, Id, Version, Available, Source }].
 */
export function parseWingetTable(text) {
  const lines = cleanConsoleLines(text)
  const sep = lines.findIndex((l) => /^-{10,}\s*$/.test(l.trim()) && l.trim().length >= 10)
  if (sep < 1) return []
  const header = lines[sep - 1]
  const starts = []
  for (let i = 0; i < header.length; i++) {
    if (header[i] !== ' ' && (i === 0 || header[i - 1] === ' ')) starts.push(i)
  }
  if (starts.length < 3) return []
  const names = ['Name', 'Id', 'Version', 'Available', 'Source']
  const rows = []
  for (let i = sep + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) break
    if (line.length <= starts[1] || line[starts[1] - 1] !== ' ') break // footer ("3 upgrades available.")
    const row = {}
    starts.forEach((s, idx) => {
      const end = idx + 1 < starts.length ? starts[idx + 1] : line.length
      row[names[idx] || `Col${idx}`] = line.slice(s, end).trim()
    })
    if (!row.Id || /\s/.test(row.Id)) continue
    rows.push(row)
  }
  return rows
}

function xmlText(xml, tag) {
  const m = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i').exec(xml)
  return m ? m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'") : ''
}

/** Parses one exported WLAN profile XML (netsh wlan export profile). keyMaterial is only read when asked. */
export function parseWlanProfileXml(xml, { withKey = false } = {}) {
  const s = String(xml ?? '')
  const ssidBlock = /<SSID>([\s\S]*?)<\/SSID>/i.exec(s)
  const out = {
    Name: xmlText(s, 'name'),
    SSID: ssidBlock ? xmlText(ssidBlock[1], 'name') : '',
    Auth: xmlText(s, 'authentication'),
    Encryption: xmlText(s, 'encryption'),
    ConnectionMode: xmlText(s, 'connectionMode')
  }
  if (withKey) out.key = xmlText(s, 'keyMaterial')
  return out
}

/** Wi-Fi profile names go into netsh's own command line: refuse quotes and control characters. */
export function isValidWifiProfileName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 64 && !/["\u0000-\u001f]/.test(name)
}

/** Parses the hosts file into entries ({ line, ip, hosts, comment, enabled }) for display. */
export function parseHosts(content) {
  const out = []
  String(content ?? '').split(/\r?\n/).forEach((raw, i) => {
    let line = raw.trim()
    if (!line) return
    let enabled = true
    if (line.startsWith('#')) {
      const inner = line.replace(/^#+\s*/, '')
      if (!/^[0-9a-fA-F:.]+\s+\S/.test(inner)) return // plain comment
      enabled = false
      line = inner
    }
    const hashAt = line.indexOf('#')
    const comment = hashAt >= 0 ? line.slice(hashAt + 1).trim() : ''
    const body = (hashAt >= 0 ? line.slice(0, hashAt) : line).trim()
    const [ip, ...hosts] = body.split(/\s+/)
    if (!ip || !hosts.length) return
    out.push({ line: i + 1, ip, hosts: hosts.join(' '), comment, enabled })
  })
  return out
}

/** Line-level summary of a hosts edit (shown before saving). */
export function diffLines(before, after) {
  const a = String(before ?? '').split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim())
  const b = String(after ?? '').split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim())
  const count = (arr) => arr.reduce((m, l) => m.set(l, (m.get(l) || 0) + 1), new Map())
  const ca = count(a)
  const cb = count(b)
  const added = []
  const removed = []
  for (const [l, n] of cb) for (let i = 0; i < n - (ca.get(l) || 0); i++) added.push(l)
  for (const [l, n] of ca) for (let i = 0; i < n - (cb.get(l) || 0); i++) removed.push(l)
  return { added, removed }
}

export function validateHostsContent(content) {
  if (typeof content !== 'string') return 'Conteúdo inválido.'
  if (content.length > 1024 * 1024) return 'O arquivo hosts ficou grande demais (máx. 1 MB).'
  if (/\u0000/.test(content)) return 'O conteúdo tem caracteres inválidos.'
  return null
}

/** Script that backs up the hosts file next to itself and then writes the new content (UTF-8, no BOM). */
export function buildHostsWriteScript(hostsPath, content, stamp) {
  const b64 = Buffer.from(content, 'utf8').toString('base64')
  const backup = `${hostsPath}.darkhub-${stamp}.bak`
  return `$ErrorActionPreference = 'Stop'
$p = ${psQuote(hostsPath)}
if (Test-Path -LiteralPath $p) { Copy-Item -LiteralPath $p -Destination ${psQuote(backup)} -Force }
$text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}'))
[IO.File]::WriteAllText($p, $text, (New-Object System.Text.UTF8Encoding($false)))
& ipconfig.exe /flushdns | Out-Null
'DH_HOSTS_OK'`
}

// ---------- Output conversion ----------

export function columnsOf(rows) {
  const cols = []
  for (const r of rows || []) for (const k of Object.keys(r || {})) if (!cols.includes(k)) cols.push(k)
  return cols
}

function cell(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** RFC 4180 CSV with a guard against spreadsheet formula injection (=, +, @, tab). */
export function rowsToCsv(rows) {
  const cols = columnsOf(rows)
  const esc = (v) => {
    let s = cell(v)
    if (/^[=+@\t\r]/.test(s) || /^-[^\d]/.test(s)) s = `'${s}`
    return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.map(esc).join(','), ...(rows || []).map((r) => cols.map((c) => esc(r?.[c])).join(','))].join('\r\n')
}

/** Aligned plain-text table (column width capped so long paths don't explode the layout). */
export function rowsToText(rows, maxWidth = 80) {
  const cols = columnsOf(rows)
  if (!cols.length) return ''
  const widths = cols.map((c) => Math.min(maxWidth, Math.max(c.length, ...(rows || []).map((r) => cell(r?.[c]).length))))
  const fit = (s, w) => (s.length > w ? s.slice(0, w - 1) + '…' : s.padEnd(w))
  const line = (vals) => vals.map((v, i) => fit(v, widths[i])).join('  ').trimEnd()
  return [line(cols), line(widths.map((w) => '-'.repeat(w))), ...(rows || []).map((r) => line(cols.map((c) => cell(r?.[c]))))].join('\r\n')
}

export function normalizeRows(data) {
  const list = Array.isArray(data) ? data : (data && typeof data === 'object' ? [data] : [])
  return list.filter((r) => r && typeof r === 'object')
}

/** Validates a custom-script snippet before it is stored. */
export function validateSnippet(s) {
  const name = String(s?.name ?? '').trim()
  const script = String(s?.script ?? '')
  if (!name || name.length > 80 || CONTROL.test(name)) return 'Dê um nome de até 80 caracteres.'
  if (!script.trim()) return 'O script está vazio.'
  if (script.length > 200000) return 'O script passou do limite de 200 mil caracteres.'
  return null
}
