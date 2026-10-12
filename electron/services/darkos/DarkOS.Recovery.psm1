# DarkOS.Recovery.psm1 - DarkOS change catalog / manifest / recovery engine
# Windows PowerShell 5.1, ASCII only. Shared by first-boot provisioning and DarkHub Suite.
# Every system interaction goes through a backend table ($script:DK.Backend). The "Real" backend
# touches the system; the "Fake" backend (DryRun) keeps an in-memory state persisted to
# <Root>\dryrun-state.json and never touches the system. Tests only use DryRun.

# Version 1.0: catch uninitialized variables but allow reading optional keys from hashtables /
# ordered dictionaries that were re-hydrated from JSON (missing keys return $null, not an error).
Set-StrictMode -Version 1.0

$script:DK = @{
    Root            = (Join-Path $env:ProgramData 'DarkOS')
    DryRun          = $false
    MutexName       = 'Global\DarkOSManifest'
    Backend         = $null
    BackendName     = 'Real'
    Version         = '1.0.0'
    LockDepth       = 0
    Mutex           = $null
    HiveMount       = $null
    HiveDepth       = 0
    ProgressHandler = $null
    Catalog         = $null
    UltimateGuid    = 'e9a42b02-d5df-448d-aa00-03f14749eb61'
    HighPerfGuid    = '8c5e7fda-e8bf-4a96-9a85-cf2db1f4b5a0'
    DarkOSPlanGuid  = '3f0c4c5e-6d8b-4a3a-9f2e-0da7c0de0001'
}

$script:Profiles = @('darkosDefault', 'competitive', 'maxPerformance')

# ---------------------------------------------------------------- paths / environment
function Get-DkPath {
    param([ValidateSet('Root', 'Recovery', 'Manifest', 'Catalog', 'Policy', 'AppPackages', 'AppIndex', 'Snapshots', 'Logs', 'Files', 'FakeState')][string]$Name)
    $r = $script:DK.Root
    switch ($Name) {
        'Root'        { return $r }
        'Recovery'    { return (Join-Path $r 'Recovery') }
        'Manifest'    { return (Join-Path $r 'Recovery\manifest.json') }
        'Policy'      { return (Join-Path $r 'Recovery\policy') }
        'Catalog'     { return (Join-Path $r 'Recovery\policy\catalog.json') }
        'AppPackages' { return (Join-Path $r 'Recovery\AppPackages') }
        'AppIndex'    { return (Join-Path $r 'Recovery\AppPackages\index.json') }
        'Snapshots'   { return (Join-Path $r 'Recovery\Snapshots') }
        'Files'       { return (Join-Path $r 'Recovery\Files') }
        'Logs'        { return (Join-Path $r 'Logs') }
        'FakeState'   { return (Join-Path $r 'dryrun-state.json') }
    }
}

function Set-DarkOSEnvironment {
    <# Configures root / dry-run / progress callback. -DryRun selects the fake backend (no system access). #>
    [CmdletBinding()]
    param([string]$Root, [switch]$DryRun, [scriptblock]$ProgressHandler, [hashtable]$FakeState)
    if ($Root) { $script:DK.Root = $Root }
    if ($PSBoundParameters.ContainsKey('ProgressHandler')) { $script:DK.ProgressHandler = $ProgressHandler }
    if ($DryRun) {
        $script:DK.DryRun = $true
        $script:DK.BackendName = 'Fake'
        $script:DK.MutexName = 'Local\DarkOSManifestDryRun'
        $script:DK.Backend = New-DkFakeBackend
        if ($FakeState) { Save-DkFakeState $FakeState }
    }
    $script:DK.Catalog = $null
    return [pscustomobject]@{ root = $script:DK.Root; dryRun = $script:DK.DryRun; backend = $script:DK.BackendName }
}

function Get-DkBackend {
    if (-not $script:DK.Backend) { $script:DK.Backend = New-DkRealBackend; $script:DK.BackendName = 'Real' }
    return $script:DK.Backend
}

function Invoke-Dk {
    param([string]$Op, [object[]]$ArgList = @())
    $b = Get-DkBackend
    if (-not $b.ContainsKey($Op)) { throw "Backend sem operacao: $Op" }
    return (& $b[$Op] @ArgList)
}

function Write-DkProgress {
    param([int]$Percent, [string]$Message)
    if ($script:DK.ProgressHandler) { try { & $script:DK.ProgressHandler $Percent $Message } catch { } }
}

function Get-DkTimestamp { return (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') }

# DWord helpers: catalog stores unsigned values (e.g. 0xFFF6823B); the registry provider returns Int32.
function ConvertTo-DkSignedDword {
    param($Value)
    $u = [uint32]([int64]$Value -band 0xFFFFFFFFL)
    return [BitConverter]::ToInt32([BitConverter]::GetBytes($u), 0)
}
function ConvertTo-DkUInt32 {
    param($Value)
    return [uint32]([int64]$Value -band 0xFFFFFFFFL)
}
function Test-DkRegValueEqual {
    param($Type, $Actual, $Expected)
    if ($Type -eq 'DWord') {
        try { return ((ConvertTo-DkUInt32 $Actual) -eq (ConvertTo-DkUInt32 $Expected)) } catch { return $false }
    }
    return ([string]$Actual -eq [string]$Expected)
}

function Write-DkLog {
    param([string]$Message, [string]$Level = 'INFO')
    try {
        $dir = Get-DkPath Logs
        if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        $clean = $Message -replace '(?i)(password|senha)\s*[:=]\s*\S+', '$1=***'
        $line = '{0} [{1}] {2}' -f (Get-DkTimestamp), $Level, $clean
        [System.IO.File]::AppendAllText((Join-Path $dir 'recovery.log'), $line + [Environment]::NewLine)
    } catch { }
}

# ---------------------------------------------------------------- JSON helpers
function ConvertTo-DkHashtable {
    param($InputObject)
    if ($null -eq $InputObject) { return $null }
    if ($InputObject -is [System.Collections.IDictionary]) {
        $h = [ordered]@{}
        foreach ($k in @($InputObject.Keys)) { $h[[string]$k] = ConvertTo-DkHashtable $InputObject[$k] }
        return $h
    }
    if ($InputObject -is [System.Management.Automation.PSCustomObject]) {
        $h = [ordered]@{}
        foreach ($p in $InputObject.PSObject.Properties) { $h[$p.Name] = ConvertTo-DkHashtable $p.Value }
        return $h
    }
    if (($InputObject -is [System.Collections.IEnumerable]) -and -not ($InputObject -is [string])) {
        $list = New-Object System.Collections.ArrayList
        foreach ($i in $InputObject) { [void]$list.Add((ConvertTo-DkHashtable $i)) }
        return , ($list.ToArray())
    }
    return $InputObject
}

function Read-DkJsonFile {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    $text = [System.IO.File]::ReadAllText($Path)
    if ([string]::IsNullOrWhiteSpace($text)) { return $null }
    $obj = ConvertFrom-Json -InputObject $text
    return (ConvertTo-DkHashtable $obj)
}

function ConvertTo-DarkOSJson {
    <# Compressed JSON, every non-ASCII char escaped as \uXXXX (console-encoding safe). #>
    param($InputObject, [switch]$AsArray)
    if ($AsArray) { $json = ConvertTo-Json -InputObject @($InputObject) -Depth 25 -Compress }
    else { $json = ConvertTo-Json -InputObject $InputObject -Depth 25 -Compress }
    if ($null -eq $json) { return 'null' }
    $sb = New-Object System.Text.StringBuilder
    foreach ($ch in $json.ToCharArray()) {
        if ([int]$ch -gt 127) { [void]$sb.AppendFormat('\u{0:x4}', [int]$ch) } else { [void]$sb.Append($ch) }
    }
    return $sb.ToString()
}

function Write-DkJsonFileAtomic {
    param([string]$Path, $Object)
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $json = ConvertTo-Json -InputObject $Object -Depth 25
    $tmp = $Path + '.tmp'
    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($tmp, $json, $enc)
    # validate before replace
    $null = ConvertFrom-Json -InputObject ([System.IO.File]::ReadAllText($tmp))
    if (Test-Path -LiteralPath $Path) {
        [System.IO.File]::Replace($tmp, $Path, ($Path + '.bak'))
    } else {
        [System.IO.File]::Move($tmp, $Path)
    }
}

# ---------------------------------------------------------------- manifest lock / IO
function Enter-DkLock {
    if ($script:DK.LockDepth -gt 0) { $script:DK.LockDepth++; return }
    $m = New-Object System.Threading.Mutex($false, $script:DK.MutexName)
    $acquired = $false
    try { $acquired = $m.WaitOne([TimeSpan]::FromMinutes(10)) }
    catch [System.Threading.AbandonedMutexException] { $acquired = $true }
    if (-not $acquired) { $m.Dispose(); throw 'Manifesto DarkOS ocupado (timeout do mutex).' }
    $script:DK.Mutex = $m
    $script:DK.LockDepth = 1
}

function Exit-DkLock {
    if ($script:DK.LockDepth -le 0) { return }
    $script:DK.LockDepth--
    if ($script:DK.LockDepth -eq 0 -and $script:DK.Mutex) {
        try { $script:DK.Mutex.ReleaseMutex() } catch { }
        $script:DK.Mutex.Dispose()
        $script:DK.Mutex = $null
    }
}

function New-DkManifest {
    return [ordered]@{
        schemaVersion = 1
        darkosVersion = $script:DK.Version
        osBuild       = [string](Invoke-Dk 'OsBuild')
        activeProfile = 'none'
        createdAt     = (Get-DkTimestamp)
        changes       = @()
        snapshots     = @()
        history       = @()
    }
}

function Read-DkManifest {
    $m = Read-DkJsonFile (Get-DkPath Manifest)
    if (-not $m) { return $null }
    foreach ($k in 'changes', 'snapshots', 'history') { if (-not $m.Contains($k) -or $null -eq $m[$k]) { $m[$k] = @() } else { $m[$k] = @($m[$k]) } }
    return $m
}

function Save-DkManifest { param($Manifest) Write-DkJsonFileAtomic -Path (Get-DkPath Manifest) -Object $Manifest }

function Get-DkManifestOrInit {
    $m = Read-DkManifest
    if (-not $m) { $m = New-DkManifest; Save-DkManifest $m }
    return $m
}

function Get-DkEntry {
    param($Manifest, [string]$Id)
    foreach ($c in @($Manifest.changes)) { if ($c -and $c.id -eq $Id) { return $c } }
    return $null
}

function Set-DkEntry {
    param($Manifest, $Entry)
    $list = New-Object System.Collections.ArrayList
    $found = $false
    foreach ($c in @($Manifest.changes)) {
        if ($null -eq $c) { continue }
        if ($c.id -eq $Entry.id) { [void]$list.Add($Entry); $found = $true } else { [void]$list.Add($c) }
    }
    if (-not $found) { [void]$list.Add($Entry) }
    $Manifest.changes = $list.ToArray()
}

function Add-DkHistory {
    param($Manifest, [string]$Action, [string[]]$Ids, [bool]$Ok)
    $h = @($Manifest.history) + @([ordered]@{ ts = (Get-DkTimestamp); action = $Action; ids = @($Ids); ok = $Ok })
    if ($h.Count -gt 500) { $h = $h[($h.Count - 500)..($h.Count - 1)] }
    $Manifest.history = $h
}

# ---------------------------------------------------------------- catalog
function Get-DkCatalogRaw {
    if ($script:DK.Catalog) { return $script:DK.Catalog }
    $path = Get-DkPath Catalog
    $c = Read-DkJsonFile $path
    if ($null -eq $c) { throw "Catalogo nao encontrado: $path" }
    if ($c -is [System.Collections.IDictionary] -and $c.Contains('changes')) { $c = $c.changes }
    $list = @()
    foreach ($e in @($c)) {
        foreach ($d in @{ profiles = @(); dependsOn = @(); payload = @(); securityRelated = $false; requiresConfirmation = $false; rebootRequired = $false; explorerRestart = $false; scope = 'machine'; reversible = 'reversible'; validation = @{} }.GetEnumerator()) {
            if (-not $e.Contains($d.Key) -or $null -eq $e[$d.Key]) { $e[$d.Key] = $d.Value }
        }
        $e.profiles = @($e.profiles); $e.dependsOn = @($e.dependsOn); $e.payload = @($e.payload)
        $list += , $e
    }
    $script:DK.Catalog = $list
    return $list
}

function Get-DkChange {
    param([string]$Id)
    foreach ($c in (Get-DkCatalogRaw)) { if ($c.id -eq $Id) { return $c } }
    return $null
}

# ================================================================ BACKENDS
# A backend is a hashtable of op-name -> scriptblock. The Real backend touches the system;
# the Fake backend keeps state in <Root>\dryrun-state.json so dry-run "plans" are deterministic
# and verifiable without ever changing the host.

# ---- fake state persistence
function Load-DkFakeState {
    $p = Get-DkPath FakeState
    $s = Read-DkJsonFile $p
    if (-not $s) {
        $s = [ordered]@{ registry = @{}; services = @{}; tasks = @{}; appx = @{}; appxProvisioned = @{}; powerActive = '381b4222-f694-41f0-9685-ff5bb260df2e'; powerSchemes = @(); files = @{}; hiveLoaded = @{} }
    }
    return $s
}
function Save-DkFakeState { param($State) Write-DkJsonFileAtomic -Path (Get-DkPath FakeState) -Object $State }

function New-DkFakeBackend {
    $b = @{}
    $b['OsBuild'] = { '26100.9457' }
    $b['IsAdmin'] = { $true }
    $b['RebootPending'] = { $false }

    $b['RegGet'] = {
        param($Hive, $Path, $Name)
        $s = Load-DkFakeState
        $key = "$Hive\$Path`::$Name"
        if ($s.registry.Contains($key)) { return $s.registry[$key] }
        return $null
    }
    $b['RegSet'] = {
        param($Hive, $Path, $Name, $Type, $Value)
        $s = Load-DkFakeState
        $s.registry["$Hive\$Path`::$Name"] = @{ type = $Type; value = $Value }
        Save-DkFakeState $s
    }
    $b['RegRemove'] = {
        param($Hive, $Path, $Name)
        $s = Load-DkFakeState
        $key = "$Hive\$Path`::$Name"
        if ($s.registry.Contains($key)) { $s.registry.Remove($key) | Out-Null; Save-DkFakeState $s }
    }
    $b['SvcGet'] = {
        param($Name)
        $s = Load-DkFakeState
        if ($s.services.Contains($Name)) { return $s.services[$Name] }
        return @{ startType = 'Automatic'; status = 'Running' }
    }
    $b['SvcSet'] = {
        param($Name, $StartType, $Stop)
        $s = Load-DkFakeState
        $cur = if ($s.services.Contains($Name)) { $s.services[$Name] } else { @{ startType = 'Automatic'; status = 'Running' } }
        $cur.startType = $StartType
        if ($Stop) { $cur.status = 'Stopped' }
        $s.services[$Name] = $cur
        Save-DkFakeState $s
    }
    $b['TaskGet'] = {
        param($Path, $Name)
        $s = Load-DkFakeState
        $k = "$Path$Name"
        if ($s.tasks.Contains($k)) { return $s.tasks[$k] }
        return @{ state = 'Ready'; exists = $true }
    }
    $b['TaskSet'] = {
        param($Path, $Name, $State)
        $s = Load-DkFakeState
        $s.tasks["$Path$Name"] = @{ state = $State; exists = $true }
        Save-DkFakeState $s
    }
    $b['AppxProvisionedList'] = {
        $s = Load-DkFakeState
        $out = @()
        foreach ($k in $s.appxProvisioned.Keys) { $out += $s.appxProvisioned[$k] }
        return , $out
    }
    $b['AppxInstalledList'] = {
        param($NameLike)
        $s = Load-DkFakeState
        $out = @()
        foreach ($k in $s.appx.Keys) { if ($s.appx[$k].name -like $NameLike) { $out += $s.appx[$k] } }
        return , $out
    }
    $b['AppxRemoveProvisioned'] = {
        param($PackageName)
        $s = Load-DkFakeState
        $hit = @($s.appxProvisioned.Keys | Where-Object { $s.appxProvisioned[$_].displayName -eq $PackageName })
        foreach ($k in $hit) { $s.appxProvisioned.Remove($k) | Out-Null }
        Save-DkFakeState $s
        return ($hit.Count -gt 0)
    }
    $b['AppxRemoveInstalled'] = {
        param($PackageFullName)
        $s = Load-DkFakeState
        if ($s.appx.Contains($PackageFullName)) { $s.appx.Remove($PackageFullName) | Out-Null; Save-DkFakeState $s; return $true }
        return $false
    }
    $b['AppxRegister'] = {
        param($ManifestPath, $PackageFullName, $DisplayName)
        $s = Load-DkFakeState
        $s.appx[$PackageFullName] = @{ name = $DisplayName; fullName = $PackageFullName }
        Save-DkFakeState $s
        return $true
    }
    $b['AppxAddProvisioned'] = {
        param($PackagePath, $PackageFullName, $DisplayName)
        $s = Load-DkFakeState
        $s.appxProvisioned["$DisplayName"] = @{ displayName = $DisplayName; packageName = $PackageFullName }
        Save-DkFakeState $s
        return $true
    }
    $b['PowerActiveGuid'] = { $s = Load-DkFakeState; return $s.powerActive }
    $b['PowerDuplicate'] = {
        param($SourceGuid, $TargetGuid)
        $s = Load-DkFakeState
        if ($s.powerSchemes -notcontains $TargetGuid) { $s.powerSchemes = @($s.powerSchemes) + $TargetGuid; Save-DkFakeState $s }
        return $TargetGuid
    }
    $b['PowerSetActive'] = { param($Guid) $s = Load-DkFakeState; $s.powerActive = $Guid; Save-DkFakeState $s }
    $b['PowerSchemeExists'] = { param($Guid) $s = Load-DkFakeState; return (@($s.powerSchemes) -contains $Guid) }
    $b['FileCopy'] = { param($Src, $Dst) $s = Load-DkFakeState; $s.files[$Dst] = $Src; Save-DkFakeState $s; return $true }
    $b['AppxPackageFolders'] = {
        param($ShortName)
        $s = Load-DkFakeState
        $out = @()
        foreach ($k in $s.appx.Keys) { if ($s.appx[$k].name -eq $ShortName -and $s.appx[$k].installLocation) { $out += $s.appx[$k].installLocation } }
        return , $out
    }
    $b['FileExists'] = { param($Path) $s = Load-DkFakeState; return ($s.files.Contains($Path)) }
    $b['HiveLoad'] = {
        param($KeyName, $HivePath)
        $s = Load-DkFakeState; $s.hiveLoaded[$KeyName] = $HivePath; Save-DkFakeState $s; return $true
    }
    $b['HiveUnload'] = { param($KeyName) $s = Load-DkFakeState; if ($s.hiveLoaded.Contains($KeyName)) { $s.hiveLoaded.Remove($KeyName) | Out-Null; Save-DkFakeState $s }; return $true }
    $b['DefaultUserRoot'] = { 'HKLM:\DARKOS_DEFUSER' }
    $b['DismImportAssoc'] = { param($XmlPath) return $true }
    return $b
}

# ---- REAL backend (executes only inside the target OS / VM, never on the Claude host)
function New-DkRealBackend {
    $b = @{}
    $b['OsBuild'] = {
        try {
            $cv = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
            return ('{0}.{1}' -f $cv.CurrentBuildNumber, $cv.UBR)
        } catch { return '0.0' }
    }
    $b['IsAdmin'] = {
        $id = [System.Security.Principal.WindowsIdentity]::GetCurrent()
        $p = New-Object System.Security.Principal.WindowsPrincipal($id)
        return $p.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
    }
    $b['RebootPending'] = {
        $keys = @(
            'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending',
            'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired'
        )
        foreach ($k in $keys) { if (Test-Path -LiteralPath $k) { return $true } }
        $pfro = Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager' -Name PendingFileRenameOperations -ErrorAction SilentlyContinue
        if ($pfro -and $pfro.PendingFileRenameOperations) { return $true }
        return $false
    }
    # Hive token (LocalMachine|CurrentUser) -> PS drive; DWord values > Int32.MaxValue are written as
    # their signed two's-complement equivalent (registry stores the same 32 bits).
    $b['RegGet'] = {
        param($Hive, $Path, $Name)
        $drive = if ($Hive -eq 'CurrentUser') { 'HKCU' } else { 'HKLM' }
        $full = "$drive`:\$Path"
        if (-not (Test-Path -LiteralPath $full)) { return $null }
        $item = Get-ItemProperty -LiteralPath $full -Name $Name -ErrorAction SilentlyContinue
        if ($null -eq $item) { return $null }
        $prop = $item.PSObject.Properties[$Name]
        if (-not $prop) { return $null }
        return @{ value = $prop.Value }
    }
    $b['RegSet'] = {
        param($Hive, $Path, $Name, $Type, $Value)
        $drive = if ($Hive -eq 'CurrentUser') { 'HKCU' } else { 'HKLM' }
        $full = "$drive`:\$Path"
        if (-not (Test-Path -LiteralPath $full)) { New-Item -Path $full -Force | Out-Null }
        if ($Type -eq 'DWord') { $Value = ConvertTo-DkSignedDword $Value }
        New-ItemProperty -LiteralPath $full -Name $Name -PropertyType $Type -Value $Value -Force | Out-Null
    }
    $b['RegRemove'] = {
        param($Hive, $Path, $Name)
        $drive = if ($Hive -eq 'CurrentUser') { 'HKCU' } else { 'HKLM' }
        $full = "$drive`:\$Path"
        if (Test-Path -LiteralPath $full) { Remove-ItemProperty -LiteralPath $full -Name $Name -ErrorAction SilentlyContinue }
    }
    $b['SvcGet'] = {
        param($Name)
        $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
        if (-not $svc) { return $null }
        $wmi = Get-CimInstance Win32_Service -Filter "Name='$Name'" -ErrorAction SilentlyContinue
        $start = if ($wmi) { $wmi.StartMode } else { 'Unknown' }
        $delayed = $false
        $r = Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\$Name" -Name DelayedAutostart -ErrorAction SilentlyContinue
        if ($r -and $r.DelayedAutostart -eq 1) { $delayed = $true }
        $norm = switch ($start) { 'Auto' { if ($delayed) { 'AutomaticDelayed' } else { 'Automatic' } } 'Manual' { 'Manual' } 'Disabled' { 'Disabled' } default { $start } }
        return @{ startType = $norm; status = [string]$svc.Status }
    }
    $b['SvcSet'] = {
        param($Name, $StartType, $Stop)
        $map = @{ 'Automatic' = 'Automatic'; 'AutomaticDelayed' = 'Automatic'; 'Manual' = 'Manual'; 'Disabled' = 'Disabled' }
        if ($Stop) { try { Stop-Service -Name $Name -Force -ErrorAction SilentlyContinue } catch { } }
        Set-Service -Name $Name -StartupType $map[$StartType] -ErrorAction Stop
        if ($StartType -eq 'AutomaticDelayed') {
            New-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\$Name" -Name DelayedAutostart -PropertyType DWord -Value 1 -Force | Out-Null
        } elseif ($StartType -eq 'Automatic') {
            New-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\$Name" -Name DelayedAutostart -PropertyType DWord -Value 0 -Force | Out-Null
        }
    }
    $b['TaskGet'] = {
        param($Path, $Name)
        $t = Get-ScheduledTask -TaskPath $Path -TaskName $Name -ErrorAction SilentlyContinue
        if (-not $t) { return @{ state = 'Missing'; exists = $false } }
        return @{ state = [string]$t.State; exists = $true }
    }
    $b['TaskSet'] = {
        param($Path, $Name, $State)
        $t = Get-ScheduledTask -TaskPath $Path -TaskName $Name -ErrorAction SilentlyContinue
        if (-not $t) { throw "Tarefa nao encontrada: $Path$Name" }
        if ($State -eq 'Disabled') { Disable-ScheduledTask -TaskPath $Path -TaskName $Name -ErrorAction Stop | Out-Null }
        else { Enable-ScheduledTask -TaskPath $Path -TaskName $Name -ErrorAction Stop | Out-Null }
    }
    $b['AppxProvisionedList'] = {
        $out = @()
        foreach ($p in (Get-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue)) {
            $out += @{ displayName = $p.DisplayName; packageName = $p.PackageName }
        }
        return , $out
    }
    $b['AppxInstalledList'] = {
        param($NameLike)
        $out = @()
        foreach ($p in (Get-AppxPackage -AllUsers -Name $NameLike -ErrorAction SilentlyContinue)) {
            $out += @{ name = $p.Name; fullName = $p.PackageFullName; installLocation = $p.InstallLocation; dependencies = @($p.Dependencies | ForEach-Object { $_.PackageFullName }) }
        }
        return , $out
    }
    $b['AppxRemoveProvisioned'] = {
        param($PackageName)
        $hit = Get-AppxProvisionedPackage -Online | Where-Object { $_.DisplayName -eq $PackageName }
        $any = $false
        foreach ($h in $hit) { Remove-AppxProvisionedPackage -Online -PackageName $h.PackageName -ErrorAction Stop | Out-Null; $any = $true }
        return $any
    }
    $b['AppxRemoveInstalled'] = {
        param($PackageFullName)
        Remove-AppxPackage -Package $PackageFullName -AllUsers -ErrorAction Stop
        return $true
    }
    $b['AppxRegister'] = {
        param($ManifestPath, $PackageFullName, $DisplayName)
        Add-AppxPackage -Register $ManifestPath -DisableDevelopmentMode -ErrorAction Stop
        return $true
    }
    $b['AppxAddProvisioned'] = {
        param($PackagePath, $PackageFullName, $DisplayName)
        if (Test-Path -LiteralPath $PackagePath -PathType Container) {
            Add-AppxProvisionedPackage -Online -FolderPath $PackagePath -SkipLicense -ErrorAction Stop | Out-Null
        } else {
            Add-AppxProvisionedPackage -Online -PackagePath $PackagePath -SkipLicense -ErrorAction Stop | Out-Null
        }
        return $true
    }
    $b['PowerActiveGuid'] = {
        $line = (powercfg /getactivescheme) 2>$null
        if ($line -match '([0-9a-fA-F-]{36})') { return $Matches[1] }
        return $null
    }
    $b['PowerDuplicate'] = {
        param($SourceGuid, $TargetGuid)
        $out = (powercfg /duplicatescheme $SourceGuid $TargetGuid) 2>$null
        if ($out -match '([0-9a-fA-F-]{36})') { return $Matches[1] }
        return $null
    }
    $b['PowerSetActive'] = { param($Guid) powercfg /setactive $Guid 2>$null | Out-Null }
    $b['PowerSchemeExists'] = {
        param($Guid)
        $all = (powercfg /list) 2>$null
        return ($all -match [regex]::Escape($Guid)).Count -gt 0
    }
    $b['FileCopy'] = {
        param($Src, $Dst)
        # Directories: full tree with backup semantics (/B) so WindowsApps ACLs do not block SYSTEM/admin.
        if (Test-Path -LiteralPath $Src -PathType Container) {
            $null = robocopy $Src $Dst /E /B /COPY:DAT /R:1 /W:1 /NFL /NDL /NJH /NJS /NP /XJ
            return ($LASTEXITCODE -lt 8)
        }
        $dir = Split-Path -Parent $Dst
        if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        $null = robocopy (Split-Path -Parent $Src) $dir (Split-Path -Leaf $Src) /B /NJH /NJS /NP /R:1 /W:1
        return ($LASTEXITCODE -lt 8)
    }
    $b['AppxPackageFolders'] = {
        param($ShortName)
        $root = Join-Path $env:ProgramW6432 'WindowsApps'
        $out = @()
        try { $out = @(Get-ChildItem -LiteralPath $root -Directory -Filter ($ShortName + '_*') -ErrorAction Stop | ForEach-Object { $_.FullName }) } catch { }
        return , $out
    }
    $b['FileExists'] = { param($Path) return (Test-Path -LiteralPath $Path) }
    $b['HiveLoad'] = {
        param($KeyName, $HivePath)
        $p = Start-Process -FilePath reg.exe -ArgumentList @('load', "HKLM\$KeyName", $HivePath) -Wait -PassThru -WindowStyle Hidden
        return ($p.ExitCode -eq 0)
    }
    $b['HiveUnload'] = {
        param($KeyName)
        [gc]::Collect(); [gc]::WaitForPendingFinalizers()
        $p = Start-Process -FilePath reg.exe -ArgumentList @('unload', "HKLM\$KeyName") -Wait -PassThru -WindowStyle Hidden
        return ($p.ExitCode -eq 0)
    }
    $b['DefaultUserRoot'] = { 'HKLM:\DARKOS_DEFUSER' }
    $b['DismImportAssoc'] = {
        param($XmlPath)
        $out = dism.exe /Online /Import-DefaultAppAssociations:$XmlPath 2>&1
        return ($LASTEXITCODE -eq 0)
    }
    return $b
}

# ================================================================ DEFAULT-USER HIVE SCOPE
# For scope=defaultUser, the Default profile NTUSER.DAT is loaded under a unique HKLM key inside the
# target and ALWAYS unloaded in finally (after gc). Nested/reentrant uses are reference-counted.
function Enter-DkDefaultUser {
    if ($script:DK.HiveDepth -gt 0) { $script:DK.HiveDepth++; return $script:DK.HiveMount }
    $keyName = 'DARKOS_DEFUSER_' + ([guid]::NewGuid().ToString('N'))
    $hive = Join-Path $env:SystemDrive 'Users\Default\NTUSER.DAT'
    if ($script:DK.DryRun) { $hive = '(dryrun)\Users\Default\NTUSER.DAT' }
    if (-not (Invoke-Dk 'HiveLoad' @($keyName, $hive))) { throw 'Falha ao carregar NTUSER.DAT do usuario Default.' }
    $script:DK.HiveMount = $keyName
    $script:DK.HiveDepth = 1
    return $keyName
}

function Exit-DkDefaultUser {
    if ($script:DK.HiveDepth -le 0) { return }
    $script:DK.HiveDepth--
    if ($script:DK.HiveDepth -eq 0 -and $script:DK.HiveMount) {
        $kn = $script:DK.HiveMount
        $script:DK.HiveMount = $null
        [void](Invoke-Dk 'HiveUnload' @($kn))
    }
}

# Resolve an abstract scope+path to a concrete (Hive,SubPath). defaultUser rewrites HKCU/HKEY_CURRENT_USER
# to the loaded Default hive key.
function Resolve-DkRegTarget {
    param([string]$Scope, [string]$RawPath)
    $p = $RawPath -replace '^Registry::', ''
    $p = $p -replace '^HKEY_LOCAL_MACHINE\\', 'HKLM:\' -replace '^HKEY_CURRENT_USER\\', 'HKCU:\'
    if ($Scope -eq 'defaultUser') {
        $mount = $script:DK.HiveMount
        $sub = $p -replace '^HKCU:\\', '' -replace '^HKLM:\\', ''
        # defaultUser entries are authored as HKCU paths
        return @{ Hive = 'LocalMachine'; Full = "HKLM:\$mount\$sub"; HiveToken = 'LocalMachine'; Sub = "$mount\$sub" }
    }
    if ($p -match '^HKLM:\\(.*)$') { return @{ HiveToken = 'LocalMachine'; Sub = $Matches[1]; Full = $p } }
    if ($p -match '^HKCU:\\(.*)$') { return @{ HiveToken = 'CurrentUser'; Sub = $Matches[1]; Full = $p } }
    throw "Caminho de registro nao suportado: $RawPath"
}

# ================================================================ COMPONENT HANDLERS
# Each handler returns a hashtable via a uniform contract:
#   Capture  -> original state object (component specific)
#   Apply    -> performs change
#   Verify   -> $true when live state matches the desired 'apply' spec
#   Revert   -> restores to captured original state
#   IsApplied-> $true when live state already matches desired (for idempotency/status)

function Get-DkRegEntries { param($Change) return @($Change.apply.entries) }

function Invoke-DkRegistryCapture {
    param($Change)
    $entries = @()
    foreach ($e in (Get-DkRegEntries $Change)) {
        $t = Resolve-DkRegTarget $Change.scope $e.path
        $cur = Invoke-Dk 'RegGet' @($t.HiveToken, $t.Sub, $e.name)
        $existed = ($null -ne $cur)
        $val = $null; if ($existed) { $val = $cur.value }
        $entries += @{ path = $e.path; name = $e.name; existed = $existed; value = $val; type = $e.type }
    }
    return @{ entries = $entries }
}

function Invoke-DkRegistryApply {
    param($Change)
    foreach ($e in (Get-DkRegEntries $Change)) {
        $t = Resolve-DkRegTarget $Change.scope $e.path
        if ($e.Contains('delete') -and $e.delete) {
            Invoke-Dk 'RegRemove' @($t.HiveToken, $t.Sub, $e.name)
        } else {
            Invoke-Dk 'RegSet' @($t.HiveToken, $t.Sub, $e.name, $e.type, $e.value)
        }
    }
}

function Invoke-DkRegistryVerify {
    param($Change)
    foreach ($e in (Get-DkRegEntries $Change)) {
        $t = Resolve-DkRegTarget $Change.scope $e.path
        $cur = Invoke-Dk 'RegGet' @($t.HiveToken, $t.Sub, $e.name)
        if ($e.Contains('delete') -and $e.delete) {
            if ($null -ne $cur) { return $false }
        } else {
            if ($null -eq $cur) { return $false }
            if (-not (Test-DkRegValueEqual $e.type $cur.value $e.value)) { return $false }
        }
    }
    return $true
}

function Invoke-DkRegistryRevert {
    param($Change, $Original)
    if (-not $Original -or -not $Original.entries) { return }
    foreach ($e in @($Original.entries)) {
        $t = Resolve-DkRegTarget $Change.scope $e.path
        if ($e.existed) { Invoke-Dk 'RegSet' @($t.HiveToken, $t.Sub, $e.name, $e.type, $e.value) }
        else { Invoke-Dk 'RegRemove' @($t.HiveToken, $t.Sub, $e.name) }
    }
}

function Invoke-DkServiceCapture {
    param($Change)
    $cur = Invoke-Dk 'SvcGet' @($Change.apply.name)
    if ($null -eq $cur) { return @{ missing = $true } }
    return @{ startType = $cur.startType; status = $cur.status }
}
function Invoke-DkServiceApply {
    param($Change)
    $stop = $false; if ($Change.apply.Contains('stop')) { $stop = [bool]$Change.apply.stop }
    Invoke-Dk 'SvcSet' @($Change.apply.name, $Change.apply.startType, $stop)
}
function Invoke-DkServiceVerify {
    param($Change)
    $cur = Invoke-Dk 'SvcGet' @($Change.apply.name)
    if ($null -eq $cur) { return $false }
    return ($cur.startType -eq $Change.apply.startType)
}
function Invoke-DkServiceRevert {
    param($Change, $Original)
    if (-not $Original -or $Original.missing) { return }
    Invoke-Dk 'SvcSet' @($Change.apply.name, $Original.startType, $false)
}

function Invoke-DkTaskCapture {
    param($Change)
    $cur = Invoke-Dk 'TaskGet' @($Change.apply.path, $Change.apply.name)
    return @{ state = $cur.state; exists = $cur.exists }
}
function Invoke-DkTaskApply { param($Change) Invoke-Dk 'TaskSet' @($Change.apply.path, $Change.apply.name, $Change.apply.state) }
function Invoke-DkTaskVerify {
    param($Change)
    $cur = Invoke-Dk 'TaskGet' @($Change.apply.path, $Change.apply.name)
    if (-not $cur.exists) { return $false }
    if ($Change.apply.state -eq 'Disabled') { return ($cur.state -eq 'Disabled') }
    return ($cur.state -ne 'Disabled')
}
function Invoke-DkTaskRevert {
    param($Change, $Original)
    if (-not $Original -or -not $Original.exists) { return }
    $state = if ($Original.state -eq 'Disabled') { 'Disabled' } else { 'Enabled' }
    Invoke-Dk 'TaskSet' @($Change.apply.path, $Change.apply.name, $state)
}

function Invoke-DkPowercfgCapture { param($Change) return @{ activeGuid = (Invoke-Dk 'PowerActiveGuid' @()) } }
function Invoke-DkPowercfgApply {
    param($Change)
    $target = $null
    if ($Change.apply.scheme -eq 'ultimate') {
        $plan = $script:DK.DarkOSPlanGuid
        if (Invoke-Dk 'PowerSchemeExists' @($plan)) { $target = $plan }
        else {
            $new = Invoke-Dk 'PowerDuplicate' @($script:DK.UltimateGuid, $plan)
            if ($new) { $target = $new }
        }
        if (-not $target) {
            if (Invoke-Dk 'PowerSchemeExists' @($script:DK.HighPerfGuid)) { $target = $script:DK.HighPerfGuid }
            else { $target = Invoke-Dk 'PowerDuplicate' @($script:DK.HighPerfGuid, $script:DK.HighPerfGuid) }
        }
        if (-not $target) { throw 'Nem Desempenho Maximo nem Alto Desempenho disponiveis.' }
    } else { $target = $Change.apply.guid }
    Invoke-Dk 'PowerSetActive' @($target)
}
function Invoke-DkPowercfgVerify {
    param($Change)
    $active = [string](Invoke-Dk 'PowerActiveGuid' @())
    if ($Change.apply.scheme -eq 'ultimate') {
        return (@($script:DK.DarkOSPlanGuid, $script:DK.UltimateGuid, $script:DK.HighPerfGuid) -contains $active.ToLowerInvariant())
    }
    return ($active -eq $Change.apply.guid)
}
function Invoke-DkPowercfgRevert { param($Change, $Original) if ($Original -and $Original.activeGuid) { Invoke-Dk 'PowerSetActive' @($Original.activeGuid) } }

function Invoke-DkDefaultAssocCapture { param($Change) return @{ note = 'import-only' } }
function Invoke-DkDefaultAssocApply { param($Change) [void](Invoke-Dk 'DismImportAssoc' @((Resolve-DkPayloadPath $Change.apply.xml))) }
function Invoke-DkDefaultAssocVerify { param($Change) return $true } # applies to NEW users only; cannot be read back for current
function Invoke-DkDefaultAssocRevert { param($Change, $Original) } # association import is non-reversible for existing profiles

function Resolve-DkPayloadPath {
    param([string]$Rel)
    if ([System.IO.Path]::IsPathRooted($Rel)) { return $Rel }
    return (Join-Path (Get-DkPath Root) $Rel)
}

# ================================================================ APPX HANDLER (payload-preserving)
# Removal order: (1) preserve payload for the main package plus bundle/resource packages that would
# also be deleted (never shared frameworks still used), writing index.json; (2) remove installed for
# all users; (3) remove provisioned. Restore: copy payload back into WindowsApps if missing (robocopy
# /B as SYSTEM/admin) then Add-AppxPackage -Register, and re-provision when a package file exists.

function Get-DkAppxShortName { param($Change) return $Change.apply.packageName }

function Get-DkWindowsAppsRoot {
    if ($script:DK.DryRun) { return 'C:\Program Files\WindowsApps' }
    return (Join-Path $env:ProgramW6432 'WindowsApps')
}

# Package folders to preserve: main installed package(s) for the family + resource/bundle siblings.
function Get-DkAppxKind {
    param([string]$FolderName)
    if ($FolderName -like '*_~_*') { return 'bundle' }
    if ($FolderName -like '*_split.*') { return 'resource' }
    return 'main'
}

function Get-DkAppxPreserveSet {
    param([string]$ShortName)
    $installed = Invoke-Dk 'AppxInstalledList' @("$ShortName")
    $set = @(); $seen = @{}; $deps = @()
    foreach ($p in @($installed)) {
        if ($p.Contains('dependencies')) { $deps += @($p.dependencies) }
        if ($p.installLocation -and -not $seen.ContainsKey($p.fullName)) {
            $seen[$p.fullName] = $true
            $set += @{ fullName = $p.fullName; installLocation = $p.installLocation; name = $p.name }
        }
    }
    foreach ($f in @(Invoke-Dk 'AppxPackageFolders' @("$ShortName"))) {
        if (-not $f) { continue }
        $pfn = Split-Path -Leaf $f
        if ($seen.ContainsKey($pfn)) { continue }
        $seen[$pfn] = $true
        $set += @{ fullName = $pfn; installLocation = $f; name = $ShortName }
    }
    return @{ packages = $set; dependencies = @($deps | Select-Object -Unique) }
}

function Invoke-DkAppxCapture {
    param($Change)
    $short = Get-DkAppxShortName $Change
    $prov = @(Invoke-Dk 'AppxProvisionedList' @() | Where-Object { $_.displayName -eq $short })
    $pre = Get-DkAppxPreserveSet $short
    return @{
        packageName      = $short
        wasProvisioned   = ($prov.Count -gt 0)
        provisionedNames = @($prov | ForEach-Object { $_.packageName })
        installed        = $pre.packages
        dependencies     = $pre.dependencies
    }
}

# Preserve payload folders into Recovery\AppPackages\<PFN>\ and append to index.json.
function Save-DkAppxPayload {
    param($Change, $Captured)
    $short = $Captured.packageName
    $root = Get-DkPath AppPackages
    if (-not (Invoke-Dk 'FileExists' @($root))) {
        if (-not $script:DK.DryRun) { New-Item -ItemType Directory -Path $root -Force | Out-Null }
    }
    $winapps = Get-DkWindowsAppsRoot
    $indexEntries = @()
    foreach ($pkg in @($Captured.installed)) {
        $pfn = $pkg.fullName
        if (-not $pfn) { continue }
        $src = $pkg.installLocation
        if (-not $src) { $src = Join-Path $winapps $pfn }
        $dst = Join-Path $root $pfn
        [void](Invoke-Dk 'FileCopy' @($src, $dst))
        $indexEntries += @{
            packageFullName = $pfn
            kind            = (Get-DkAppxKind $pfn)
            displayName     = $short
            source          = $src
            preservedPath   = "AppPackages\$pfn"
            manifest        = "AppPackages\$pfn\AppxManifest.xml"
            dependencies    = @($Captured.dependencies)
            provisioned     = $Captured.wasProvisioned
            ts              = (Get-DkTimestamp)
        }
    }
    # merge into index.json
    $idxPath = Get-DkPath AppIndex
    $idx = Read-DkJsonFile $idxPath
    if (-not $idx) { $idx = @{ packages = @() } }
    $existing = @($idx.packages)
    foreach ($ie in $indexEntries) {
        $existing = @($existing | Where-Object { $_.packageFullName -ne $ie.packageFullName })
        $existing += $ie
    }
    $idx.packages = $existing
    if (-not $script:DK.DryRun -or (Invoke-Dk 'FileExists' @($root))) { }
    Write-DkJsonFileAtomic -Path $idxPath -Object $idx
    return $indexEntries
}

function Invoke-DkAppxApply {
    param($Change, $Captured)
    # 1. preserve payload first (never remove before preserving)
    [void](Save-DkAppxPayload $Change $Captured)
    $short = $Captured.packageName
    # 2. remove installed for all users
    if ($Change.apply.removeInstalled -ne $false) {
        foreach ($pkg in @(Invoke-Dk 'AppxInstalledList' @("$short"))) {
            if ($pkg.fullName) { [void](Invoke-Dk 'AppxRemoveInstalled' @($pkg.fullName)) }
        }
    }
    # 3. remove provisioned
    if ($Change.apply.removeProvisioned -ne $false -and $Captured.wasProvisioned) {
        [void](Invoke-Dk 'AppxRemoveProvisioned' @($short))
    }
}

function Invoke-DkAppxVerify {
    param($Change)
    $short = Get-DkAppxShortName $Change
    $installed = @(Invoke-Dk 'AppxInstalledList' @("$short"))
    if ($installed.Count -gt 0) { return $false }
    if ($Change.apply.removeProvisioned -ne $false) {
        $prov = @(Invoke-Dk 'AppxProvisionedList' @() | Where-Object { $_.displayName -eq $short })
        if ($prov.Count -gt 0) { return $false }
    }
    return $true
}

# Restore a single package family from preserved payload. Returns result detail.
function Restore-DkAppxPackage {
    param([string]$ShortName)
    $idx = Read-DkJsonFile (Get-DkPath AppIndex)
    $entries = @()
    if ($idx -and $idx.packages) { $entries = @($idx.packages | Where-Object { $_.displayName -eq $ShortName -or $_.packageFullName -like "$ShortName*" }) }
    if ($entries.Count -eq 0) { return @{ packageName = $ShortName; ok = $false; verified = $false; error = 'Sem payload preservado no index.json.'; pathUsed = $null } }
    $winapps = Get-DkWindowsAppsRoot
    $registered = $false
    $pathUsed = @()
    $reprovisioned = $false
    $errors = @()
    foreach ($e in $entries) {
        $pfn = $e.packageFullName
        $target = Join-Path $winapps $pfn
        $preserved = Resolve-DkPayloadPath $e.preservedPath
        if (-not (Invoke-Dk 'FileExists' @($target))) {
            if (Invoke-Dk 'FileCopy' @($preserved, $target)) { $pathUsed += "copyback:$pfn" } else { $errors += "copy falhou: $pfn" }
        } else { $pathUsed += "present:$pfn" }
    }
    foreach ($e in @($entries | Where-Object { -not $_.kind -or $_.kind -eq 'main' })) {
        $pfn = $e.packageFullName
        $manifest = Join-Path (Join-Path $winapps $pfn) 'AppxManifest.xml'
        try { if (Invoke-Dk 'AppxRegister' @($manifest, $pfn, $ShortName)) { $registered = $true; $pathUsed += "register:$pfn" } }
        catch { $errors += ("register {0}: {1}" -f $pfn, $_.Exception.Message) }
        if ($e.provisioned) {
            try { if (Invoke-Dk 'AppxAddProvisioned' @((Join-Path $winapps $pfn), $pfn, $ShortName)) { $reprovisioned = $true; $pathUsed += "reprovision:$pfn" } }
            catch { $errors += ("reprovision {0}: {1}" -f $pfn, $_.Exception.Message) }
        }
    }
    $installed = @(Invoke-Dk 'AppxInstalledList' @("$ShortName"))
    $verified = ($installed.Count -gt 0)
    $err = $null
    if (-not $verified) { $err = 'Registro nao confirmado por leitura. ' + ($errors -join ' | ') }
    return @{ packageName = $ShortName; ok = $registered; verified = $verified; reprovisioned = $reprovisioned; pathUsed = ($pathUsed -join '; '); error = $err; warnings = @($errors) }
}

function Test-DkAppxOriginallyPresent {
    param($Original)
    if (-not $Original) { return $true }   # unknown original: assume present (restore if payload exists)
    return ([bool]$Original.wasProvisioned -or @($Original.installed).Count -gt 0)
}

function Invoke-DkAppxRevert {
    param($Change, $Original)
    if (-not (Test-DkAppxOriginallyPresent $Original)) { return }   # was never present: nothing to restore
    $short = Get-DkAppxShortName $Change
    $r = Restore-DkAppxPackage $short
    if (-not $r.verified) { throw ("Falha ao restaurar Appx {0}: {1}" -f $short, $r.error) }
}

# ================================================================ TRANSACTION ENGINE
# Per change: capture originalState (first time only) -> precheck -> apply -> verify (read-back) ->
# record to manifest -> on failure rollback to originalState and record. Idempotent.

function Test-DkComponent { param([string]$C) return ($C -in 'registry', 'service', 'task', 'appx', 'powercfg', 'defaultassoc', 'file') }

function Invoke-DkCapture {
    param($Change)
    switch ($Change.component) {
        'registry'     { return (Invoke-DkRegistryCapture $Change) }
        'service'      { return (Invoke-DkServiceCapture $Change) }
        'task'         { return (Invoke-DkTaskCapture $Change) }
        'appx'         { return (Invoke-DkAppxCapture $Change) }
        'powercfg'     { return (Invoke-DkPowercfgCapture $Change) }
        'defaultassoc' { return (Invoke-DkDefaultAssocCapture $Change) }
        default        { return @{} }
    }
}

function Test-DkApplied {
    param($Change)
    switch ($Change.component) {
        'registry'     { return (Invoke-DkRegistryVerify $Change) }
        'service'      { return (Invoke-DkServiceVerify $Change) }
        'task'         { return (Invoke-DkTaskVerify $Change) }
        'appx'         { return (Invoke-DkAppxVerify $Change) }
        'powercfg'     { return (Invoke-DkPowercfgVerify $Change) }
        'defaultassoc' { return (Invoke-DkDefaultAssocVerify $Change) }
        default        { return $false }
    }
}

function Test-DkOriginal {
    param($Change, $Original)
    switch ($Change.component) {
        'registry' {
            foreach ($e in @($Original.entries)) {
                $t = Resolve-DkRegTarget $Change.scope $e.path
                $cur = Invoke-Dk 'RegGet' @($t.HiveToken, $t.Sub, $e.name)
                if ($e.existed) {
                    if ($null -eq $cur) { return $false }
                    if (-not (Test-DkRegValueEqual $e.type $cur.value $e.value)) { return $false }
                } elseif ($null -ne $cur) { return $false }
            }
            return $true
        }
        'service' {
            if ($Original.missing) { return $true }
            $cur = Invoke-Dk 'SvcGet' @($Change.apply.name)
            return ($null -ne $cur -and $cur.startType -eq $Original.startType)
        }
        'task' {
            if (-not $Original.exists) { return $true }
            $cur = Invoke-Dk 'TaskGet' @($Change.apply.path, $Change.apply.name)
            return ([bool]$cur.exists -and (($cur.state -eq 'Disabled') -eq ($Original.state -eq 'Disabled')))
        }
        'powercfg' { return ([string](Invoke-Dk 'PowerActiveGuid' @()) -eq [string]$Original.activeGuid) }
        'appx' {
            if (-not (Test-DkAppxOriginallyPresent $Original)) { return $true }
            $short = Get-DkAppxShortName $Change
            $inst = @(Invoke-Dk 'AppxInstalledList' @("$short"))
            $prov = @(Invoke-Dk 'AppxProvisionedList' @() | Where-Object { $_.displayName -eq $short })
            return ($inst.Count -gt 0 -or $prov.Count -gt 0)
        }
        default { return $true }
    }
}

function Invoke-DkApply {
    param($Change, $Captured)
    switch ($Change.component) {
        'registry'     { Invoke-DkRegistryApply $Change }
        'service'      { Invoke-DkServiceApply $Change }
        'task'         { Invoke-DkTaskApply $Change }
        'appx'         { Invoke-DkAppxApply $Change $Captured }
        'powercfg'     { Invoke-DkPowercfgApply $Change }
        'defaultassoc' { Invoke-DkDefaultAssocApply $Change }
    }
}

function Invoke-DkRevert {
    param($Change, $Original)
    switch ($Change.component) {
        'registry'     { Invoke-DkRegistryRevert $Change $Original }
        'service'      { Invoke-DkServiceRevert $Change $Original }
        'task'         { Invoke-DkTaskRevert $Change $Original }
        'appx'         { Invoke-DkAppxRevert $Change $Original }
        'powercfg'     { Invoke-DkPowercfgRevert $Change $Original }
        'defaultassoc' { Invoke-DkDefaultAssocRevert $Change $Original }
    }
}

# Does a change need the Default-user hive mounted?
function Test-DkNeedsHive { param($Change) return ($Change.scope -eq 'defaultUser' -and $Change.component -eq 'registry') }

function Test-DkDependencies {
    param($Change, $Manifest)
    $missing = @()
    foreach ($dep in @($Change.dependsOn)) {
        $e = Get-DkEntry $Manifest $dep
        if (-not $e -or $e.status -ne 'applied') { $missing += $dep }
    }
    return $missing
}

# Core per-change apply, assumes lock held and (if needed) hive mounted.
function Invoke-DkChangeApplyOne {
    param($Change, $Manifest, [string]$Source)
    $id = $Change.id
    $entry = Get-DkEntry $Manifest $id
    if (-not $entry) {
        $entry = [ordered]@{ id = $id; status = 'notApplied'; originalState = $null; appliedState = $null; lastResult = $null }
    }
    # precheck: dependencies
    $missing = Test-DkDependencies $Change $Manifest
    if ($missing.Count -gt 0) {
        $entry.lastResult = @{ ts = (Get-DkTimestamp); action = 'apply'; ok = $false; verified = $false; error = ("Dependencias nao aplicadas: {0}" -f ($missing -join ',')); source = $Source }
        Set-DkEntry $Manifest $entry
        return @{ id = $id; ok = $false; verified = $false; rebootRequired = $false; error = $entry.lastResult.error }
    }
    # precheck: admin
    if (-not (Invoke-Dk 'IsAdmin' @())) {
        $entry.lastResult = @{ ts = (Get-DkTimestamp); action = 'apply'; ok = $false; verified = $false; error = 'Requer privilegios de administrador.'; source = $Source }
        Set-DkEntry $Manifest $entry
        return @{ id = $id; ok = $false; verified = $false; rebootRequired = $false; error = $entry.lastResult.error }
    }
    # not present on this build (service/task absent): skip, never fail
    $present = $true
    if ($Change.component -eq 'service') { $present = ($null -ne (Invoke-Dk 'SvcGet' @($Change.apply.name))) }
    elseif ($Change.component -eq 'task') { $present = [bool]((Invoke-Dk 'TaskGet' @($Change.apply.path, $Change.apply.name)).exists) }
    if (-not $present) {
        $entry.status = 'notApplied'
        $entry.lastResult = @{ ts = (Get-DkTimestamp); action = 'apply'; ok = $true; verified = $true; error = $null; source = $Source; note = 'notPresent' }
        Set-DkEntry $Manifest $entry
        return @{ id = $id; ok = $true; verified = $true; rebootRequired = $false; error = $null; skipped = $true; reason = 'notPresent' }
    }
    # idempotency: already applied and verified?
    try {
        if ((Test-DkApplied $Change) -and $entry.status -eq 'applied') {
            $entry.lastResult = @{ ts = (Get-DkTimestamp); action = 'apply'; ok = $true; verified = $true; error = $null; source = $Source }
            Set-DkEntry $Manifest $entry
            return @{ id = $id; ok = $true; verified = $true; rebootRequired = [bool]$Change.rebootRequired; error = $null; noop = $true }
        }
    } catch { }

    # capture original (only first time, never overwrite)
    if ($null -eq $entry.originalState) {
        try { $entry.originalState = Invoke-DkCapture $Change }
        catch {
            $entry.lastResult = @{ ts = (Get-DkTimestamp); action = 'apply'; ok = $false; verified = $false; error = ("Falha na captura: {0}" -f $_.Exception.Message); source = $Source }
            Set-DkEntry $Manifest $entry
            return @{ id = $id; ok = $false; verified = $false; rebootRequired = $false; error = $entry.lastResult.error }
        }
    }

    try {
        Invoke-DkApply $Change $entry.originalState
    } catch {
        $applyErr = $_.Exception.Message
        # attempt rollback to original
        $rolled = $true
        try { Invoke-DkRevert $Change $entry.originalState } catch { $rolled = $false }
        $entry.status = 'failed'
        $entry.lastResult = @{ ts = (Get-DkTimestamp); action = 'apply'; ok = $false; verified = $false; error = ("Falha ao aplicar: {0} (rollback={1})" -f $applyErr, $rolled); source = $Source }
        Set-DkEntry $Manifest $entry
        return @{ id = $id; ok = $false; verified = $false; rebootRequired = $false; error = $entry.lastResult.error }
    }

    # verify by read-back
    $verified = $false
    try { $verified = [bool](Test-DkApplied $Change) } catch { $verified = $false }
    if (-not $verified -and $Change.rebootRequired) {
        $entry.status = 'pending-reboot'
        $entry.appliedState = $Change.apply
        $entry.lastResult = @{ ts = (Get-DkTimestamp); action = 'apply'; ok = $true; verified = $false; error = $null; source = $Source; note = 'pending-reboot' }
        Set-DkEntry $Manifest $entry
        return @{ id = $id; ok = $true; verified = $false; rebootRequired = $true; error = $null }
    }
    if (-not $verified) {
        $rolled = $true
        try { Invoke-DkRevert $Change $entry.originalState } catch { $rolled = $false }
        $entry.status = 'failed'
        $entry.lastResult = @{ ts = (Get-DkTimestamp); action = 'apply'; ok = $false; verified = $false; error = ("Verificacao falhou apos aplicar (rollback={0})" -f $rolled); source = $Source }
        Set-DkEntry $Manifest $entry
        return @{ id = $id; ok = $false; verified = $false; rebootRequired = $false; error = $entry.lastResult.error }
    }
    $entry.status = 'applied'
    $entry.appliedState = $Change.apply
    $entry.lastResult = @{ ts = (Get-DkTimestamp); action = 'apply'; ok = $true; verified = $true; error = $null; source = $Source }
    Set-DkEntry $Manifest $entry
    return @{ id = $id; ok = $true; verified = $true; rebootRequired = [bool]$Change.rebootRequired; error = $null }
}

function Invoke-DkChangeRevertOne {
    param($Change, $Manifest, [string]$Source)
    $id = $Change.id
    $entry = Get-DkEntry $Manifest $id
    if (-not $entry -or $entry.status -eq 'reverted' -or $entry.status -eq 'notApplied' -or $null -eq $entry.originalState) {
        # nothing applied to revert (idempotent)
        if ($entry) { $entry.status = 'reverted'; Set-DkEntry $Manifest $entry }
        return @{ id = $id; ok = $true; verified = $true; rebootRequired = $false; error = $null; noop = $true }
    }
    if (-not (Invoke-Dk 'IsAdmin' @())) {
        return @{ id = $id; ok = $false; verified = $false; rebootRequired = $false; error = 'Requer privilegios de administrador.' }
    }
    try {
        Invoke-DkRevert $Change $entry.originalState
    } catch {
        $entry.lastResult = @{ ts = (Get-DkTimestamp); action = 'revert'; ok = $false; verified = $false; error = ("Falha ao reverter: {0}" -f $_.Exception.Message); source = $Source }
        Set-DkEntry $Manifest $entry
        return @{ id = $id; ok = $false; verified = $false; rebootRequired = $false; error = $entry.lastResult.error }
    }
    # verify revert by read-back: live state must equal the captured originalState
    $verified = $false
    try { $verified = [bool](Test-DkOriginal $Change $entry.originalState) } catch { $verified = $false }
    $entry.status = if ($verified) { 'reverted' } else { 'failed' }
    $entry.lastResult = @{ ts = (Get-DkTimestamp); action = 'revert'; ok = $verified; verified = $verified; error = $(if ($verified) { $null } else { 'Verificacao de reversao falhou.' }); source = $Source }
    Set-DkEntry $Manifest $entry
    return @{ id = $id; ok = $verified; verified = $verified; rebootRequired = [bool]$Change.rebootRequired; error = $entry.lastResult.error }
}

# ================================================================ PUBLIC API
function Get-DarkOSCatalog {
    [CmdletBinding()] param([ValidateSet('darkosDefault', 'competitive', 'maxPerformance')][string]$Profile)
    $cat = Get-DkCatalogRaw
    if ($Profile) { $cat = @($cat | Where-Object { $_.profiles -contains $Profile }) }
    return @($cat)
}

function Get-DarkOSManifest { [CmdletBinding()] param() return (Get-DkManifestOrInit) }

function Get-DarkOSStatus {
    [CmdletBinding()] param([string[]]$Id)
    $manifest = Get-DkManifestOrInit
    $cat = Get-DkCatalogRaw
    if ($Id) { $cat = @($cat | Where-Object { $Id -contains $_.id }) }
    $rebootPending = [bool](Invoke-Dk 'RebootPending' @())
    $out = @()
    $hive = (@($cat | Where-Object { Test-DkNeedsHive $_ }).Count -gt 0) -and [bool](Invoke-Dk 'IsAdmin' @())
    if ($hive) { [void](Enter-DkDefaultUser) }
    try {
    foreach ($c in @($cat)) {
        $entry = Get-DkEntry $manifest $c.id
        $status = if ($entry) { $entry.status } else { 'notApplied' }
        $live = $false
        try { $live = [bool](Test-DkApplied $c) } catch { $live = $false }
        $appliedStatus = ($status -eq 'applied')
        $out += [ordered]@{
            id             = $c.id
            status         = $status
            live           = $live
            matchesApplied = ($live -eq $appliedStatus)
            rebootPending  = ($rebootPending -or $status -eq 'pending-reboot')
        }
    }
    } finally { if ($hive) { Exit-DkDefaultUser } }
    return @($out)
}

# Run a batch of change ids through apply/revert with lock + optional hive, honoring dependsOn order.
function Invoke-DarkOSChange {
    [CmdletBinding()] param(
        [Parameter(Mandatory)][string[]]$Id,
        [Parameter(Mandatory)][ValidateSet('Apply', 'Revert')][string]$Action,
        [ValidateSet('provisioning', 'darkhub')][string]$Source = 'darkhub',
        [switch]$ConfirmSecurity
    )
    $cat = Get-DkCatalogRaw
    $found = @()
    $missing = @()
    foreach ($i in $Id) {
        $c = $cat | Where-Object { $_.id -eq $i } | Select-Object -First 1
        if (-not $c) { $missing += $i; continue }
        $found += $c
    }
    # order by dependency for Apply, reverse for Revert
    $ordered = Sort-DkByDependency @($found)
    if ($Action -eq 'Revert') { [array]::Reverse($ordered) }

    $results = @()
    Enter-DkLock
    $hiveNeeded = @($ordered | Where-Object { Test-DkNeedsHive $_ }).Count -gt 0
    try {
        $manifest = Get-DkManifestOrInit
        if ($hiveNeeded) { [void](Enter-DkDefaultUser) }
        try {
            # report missing first
            foreach ($mid in $missing) {
                $results += @{ id = $mid; ok = $false; verified = $false; rebootRequired = $false; error = 'Alteracao inexistente no catalogo.' }
            }
            $n = [Math]::Max(1, $ordered.Count); $i = 0
            foreach ($c in $ordered) {
                $i++
                Write-DkProgress ([int](100 * $i / $n)) ("{0}: {1}" -f $Action, $c.id)
                # Security gate applies to Apply only; reverting restores the (safer) original state.
                if ($c.securityRelated -and $Action -eq 'Apply' -and -not $ConfirmSecurity) {
                    $results += @{ id = $c.id; ok = $false; verified = $false; rebootRequired = $false; error = 'Alteracao de seguranca requer confirmacao explicita (ConfirmSecurity).' }
                    continue
                }
                if ($Action -eq 'Apply') { $results += (Invoke-DkChangeApplyOne $c $manifest $Source) }
                else { $results += (Invoke-DkChangeRevertOne $c $manifest $Source) }
            }
        } finally { if ($hiveNeeded) { Exit-DkDefaultUser } }
        Add-DkHistory $manifest $Action @($Id) (@($results | Where-Object { -not $_.ok }).Count -eq 0)
        Save-DkManifest $manifest
    } finally { Exit-DkLock }
    return @($results)
}

# Append result objects to a flat list. Accepts a single result, an array, or nested arrays.
function Add-DkResults {
    param([System.Collections.ArrayList]$List, $Items)
    foreach ($it in @($Items)) {
        if ($null -eq $it) { continue }
        if (($it -is [System.Array]) -or ($it -is [System.Collections.ArrayList])) { Add-DkResults $List $it }
        else { [void]$List.Add($it) }
    }
}

function Sort-DkByDependency {
    param($Changes)
    $byId = @{}; foreach ($c in $Changes) { $byId[$c.id] = $c }
    $visited = @{}; $order = New-Object System.Collections.ArrayList
    $visit = {
        param($id)
        if ($visited.ContainsKey($id)) { return }
        $visited[$id] = $true
        $c = $byId[$id]
        if ($c) {
            foreach ($d in @($c.dependsOn)) { if ($byId.ContainsKey($d)) { & $visit $d } }
            [void]$order.Add($c)
        }
    }
    foreach ($c in $Changes) { & $visit $c.id }
    return , @($order.ToArray())
}

function Set-DarkOSProfile {
    [CmdletBinding()] param(
        [Parameter(Mandatory)][ValidateSet('darkosDefault', 'competitive', 'maxPerformance')][string]$Profile,
        [switch]$ConfirmSecurity
    )
    $cat = Get-DkCatalogRaw
    $target = @($cat | Where-Object { $_.profiles -contains $Profile })
    $targetIds = @($target | ForEach-Object { $_.id })
    # Items to apply = in target profile. Items to revert = currently applied but NOT in target.
    $manifest = Get-DkManifestOrInit
    $appliedIds = @($manifest.changes | Where-Object { $_.status -eq 'applied' } | ForEach-Object { $_.id })
    $toRevert = @($appliedIds | Where-Object { $targetIds -notcontains $_ })

    # Security items without confirmation are SKIPPED (not failures, never recorded in the manifest).
    $results = New-Object System.Collections.ArrayList
    $applyable = @()
    foreach ($c in $target) {
        if ($c.securityRelated -and -not $ConfirmSecurity) {
            [void]$results.Add([ordered]@{ id = $c.id; ok = $false; verified = $false; skipped = $true; reason = 'requiresConfirmation'; error = $null; rebootRequired = $false })
        } else { $applyable += $c.id }
    }
    if ($toRevert.Count -gt 0) { Add-DkResults $results (Invoke-DarkOSChange -Id $toRevert -Action Revert -Source darkhub) }
    if ($applyable.Count -gt 0) { Add-DkResults $results (Invoke-DarkOSChange -Id $applyable -Action Apply -Source darkhub -ConfirmSecurity:$ConfirmSecurity) }

    $manifest = Get-DkManifestOrInit
    $manifest.activeProfile = $Profile
    Enter-DkLock; try { Save-DkManifest $manifest } finally { Exit-DkLock }
    $flat = @($results.ToArray())
    $failed = @($flat | Where-Object { -not $_.ok -and -not $_.skipped })
    return [ordered]@{ profile = $Profile; results = $flat; ok = ($failed.Count -eq 0); skipped = @($flat | Where-Object { $_.skipped } | ForEach-Object { $_.id }) }
}

function Restore-DarkOSProfile {
    [CmdletBinding()] param([switch]$ConfirmSecurity)
    $manifest = Get-DkManifestOrInit
    $appliedIds = @($manifest.changes | Where-Object { $_.status -eq 'applied' -or $_.status -eq 'pending-reboot' -or $_.status -eq 'failed' } | ForEach-Object { $_.id })
    $results = New-Object System.Collections.ArrayList
    if ($appliedIds.Count -gt 0) { Add-DkResults $results (Invoke-DarkOSChange -Id $appliedIds -Action Revert -Source darkhub -ConfirmSecurity:$ConfirmSecurity) }
    $manifest = Get-DkManifestOrInit
    $manifest.activeProfile = 'none'
    Enter-DkLock; try { Save-DkManifest $manifest } finally { Exit-DkLock }
    $flat = @($results.ToArray())
    return [ordered]@{ ok = (@($flat | Where-Object { -not $_.ok -and -not $_.skipped }).Count -eq 0); results = $flat }
}

function Get-DarkOSRemovedApps {
    [CmdletBinding()] param()
    $idx = Read-DkJsonFile (Get-DkPath AppIndex)
    $out = @()
    if ($idx -and $idx.packages) {
        $seen = @{}
        foreach ($p in @($idx.packages)) {
            $dn = $p.displayName
            if ($seen.ContainsKey($dn)) { continue }
            $seen[$dn] = $true
            $installed = @(Invoke-Dk 'AppxInstalledList' @("$dn"))
            $out += [ordered]@{ packageName = $dn; preserved = $true; restorable = $true; currentlyInstalled = ($installed.Count -gt 0); preservedPath = $p.preservedPath }
        }
    }
    return @($out)
}

function Restore-DarkOSAppx {
    [CmdletBinding()] param([Parameter(Mandatory)][string[]]$PackageName)
    if (-not (Invoke-Dk 'IsAdmin' @())) { return @(@{ id = 'appx'; ok = $false; verified = $false; error = 'Requer administrador.' }) }
    $results = @()
    Enter-DkLock
    try {
        $manifest = Get-DkManifestOrInit
        $n = [Math]::Max(1, $PackageName.Count); $i = 0
        foreach ($pn in $PackageName) {
            $i++; Write-DkProgress ([int](100 * $i / $n)) ("Restaurar {0}" -f $pn)
            $r = Restore-DkAppxPackage $pn
            # update manifest entry for the matching appx change(s)
            foreach ($c in (Get-DkCatalogRaw | Where-Object { $_.component -eq 'appx' -and $_.apply.packageName -eq $pn })) {
                $e = Get-DkEntry $manifest $c.id
                if ($e) { $e.status = 'reverted'; $e.lastResult = @{ ts = (Get-DkTimestamp); action = 'revert'; ok = $r.verified; verified = $r.verified; error = $r.error; source = 'darkhub' }; Set-DkEntry $manifest $e }
            }
            $results += @{ id = $pn; ok = $r.ok; verified = $r.verified; rebootRequired = $false; error = $r.error; pathUsed = $r.pathUsed }
        }
        Add-DkHistory $manifest 'restore-appx' @($PackageName) (@($results | Where-Object { -not $_.verified }).Count -eq 0)
        Save-DkManifest $manifest
    } finally { Exit-DkLock }
    return @($results)
}

# ---- snapshots
function New-DarkOSSnapshot {
    [CmdletBinding()] param([Parameter(Mandatory)][string]$Label)
    $manifest = Get-DkManifestOrInit
    $id = (Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss') + '-' + ([guid]::NewGuid().ToString('N').Substring(0, 8))
    $snapDir = Get-DkPath Snapshots
    if (-not (Test-Path -LiteralPath $snapDir)) { New-Item -ItemType Directory -Path $snapDir -Force | Out-Null }
    $relPath = "Snapshots\$id.json"
    $snapObj = [ordered]@{ id = $id; ts = (Get-DkTimestamp); label = $Label; activeProfile = $manifest.activeProfile; changes = @($manifest.changes) }
    Enter-DkLock
    try {
        Write-DkJsonFileAtomic -Path (Join-Path (Get-DkPath Recovery) $relPath) -Object $snapObj
        $manifest = Get-DkManifestOrInit
        $manifest.snapshots = @($manifest.snapshots) + @([ordered]@{ id = $id; ts = $snapObj.ts; label = $Label; path = $relPath })
        Save-DkManifest $manifest
    } finally { Exit-DkLock }
    return [ordered]@{ id = $id; label = $Label; path = $relPath; ts = $snapObj.ts }
}

function Get-DarkOSSnapshot {
    [CmdletBinding()] param()
    $manifest = Get-DkManifestOrInit
    return @($manifest.snapshots)
}

function Restore-DarkOSSnapshot {
    [CmdletBinding()] param([Parameter(Mandatory)][string]$Id, [switch]$ConfirmSecurity)
    $manifest = Get-DkManifestOrInit
    $meta = @($manifest.snapshots | Where-Object { $_.id -eq $Id }) | Select-Object -First 1
    if (-not $meta) { return [ordered]@{ ok = $false; error = "Snapshot nao encontrado: $Id" } }
    $snap = Read-DkJsonFile (Join-Path (Get-DkPath Recovery) $meta.path)
    if (-not $snap) { return [ordered]@{ ok = $false; error = 'Arquivo de snapshot ausente ou invalido.' } }
    $cat = Get-DkCatalogRaw
    # desired = ids 'applied' in snapshot
    $desiredApplied = @($snap.changes | Where-Object { $_.status -eq 'applied' } | ForEach-Object { $_.id })
    $nowApplied = @($manifest.changes | Where-Object { $_.status -eq 'applied' } | ForEach-Object { $_.id })
    $toApply = @($desiredApplied | Where-Object { $nowApplied -notcontains $_ })
    $toRevert = @($nowApplied | Where-Object { $desiredApplied -notcontains $_ })
    $results = New-Object System.Collections.ArrayList
    if ($toRevert.Count -gt 0) { Add-DkResults $results (Invoke-DarkOSChange -Id $toRevert -Action Revert -Source darkhub -ConfirmSecurity:$ConfirmSecurity) }
    if ($toApply.Count -gt 0) { Add-DkResults $results (Invoke-DarkOSChange -Id $toApply -Action Apply -Source darkhub -ConfirmSecurity:$ConfirmSecurity) }
    $flat = @($results.ToArray())
    return [ordered]@{ ok = (@($flat | Where-Object { -not $_.ok -and -not $_.skipped }).Count -eq 0); id = $Id; results = $flat }
}

function Get-DarkOSFailures {
    [CmdletBinding()] param()
    $manifest = Get-DkManifestOrInit
    $out = @()
    foreach ($c in @($manifest.changes)) {
        if ($c.status -eq 'failed' -or ($c.lastResult -and $c.lastResult.ok -eq $false)) {
            $out += [ordered]@{ id = $c.id; status = $c.status; error = $(if ($c.lastResult) { $c.lastResult.error } else { $null }); ts = $(if ($c.lastResult) { $c.lastResult.ts } else { $null }) }
        }
    }
    return @($out)
}

function Get-DarkOSRebootPending {
    [CmdletBinding()] param()
    $manifest = Get-DkManifestOrInit
    $pendingIds = @($manifest.changes | Where-Object { $_.status -eq 'pending-reboot' } | ForEach-Object { $_.id })
    return [ordered]@{ rebootPending = ([bool](Invoke-Dk 'RebootPending' @()) -or $pendingIds.Count -gt 0); pendingChanges = @($pendingIds) }
}

function Export-DarkOSDiagnostics {
    [CmdletBinding()] param([Parameter(Mandatory)][string]$Destination)
    $tmp = Join-Path $env:TEMP ('darkos-diag-' + ([guid]::NewGuid().ToString('N')))
    New-Item -ItemType Directory -Path $tmp -Force | Out-Null
    try {
        # manifest (strip nothing secret - manifest has no secrets by design), catalog, logs, status
        $man = Get-DkManifestOrInit
        Write-DkJsonFileAtomic -Path (Join-Path $tmp 'manifest.json') -Object $man
        try { Copy-Item -LiteralPath (Get-DkPath Catalog) -Destination (Join-Path $tmp 'catalog.json') -ErrorAction SilentlyContinue } catch { }
        try { Copy-Item -LiteralPath (Get-DkPath AppIndex) -Destination (Join-Path $tmp 'appindex.json') -ErrorAction SilentlyContinue } catch { }
        $logDir = Get-DkPath Logs
        if (Test-Path -LiteralPath $logDir) {
            $dl = Join-Path $tmp 'Logs'; New-Item -ItemType Directory -Path $dl -Force | Out-Null
            Get-ChildItem -LiteralPath $logDir -Filter *.log -ErrorAction SilentlyContinue | ForEach-Object { Copy-Item $_.FullName -Destination $dl -ErrorAction SilentlyContinue }
            Get-ChildItem -LiteralPath $logDir -Filter *.txt -ErrorAction SilentlyContinue | ForEach-Object { Copy-Item $_.FullName -Destination $dl -ErrorAction SilentlyContinue }
        }
        $status = Get-DarkOSStatus
        Write-DkJsonFileAtomic -Path (Join-Path $tmp 'status.json') -Object @($status)
        $env = [ordered]@{ osBuild = [string](Invoke-Dk 'OsBuild'); ts = (Get-DkTimestamp); darkosVersion = $script:DK.Version; activeProfile = $man.activeProfile }
        Write-DkJsonFileAtomic -Path (Join-Path $tmp 'environment.json') -Object $env
        if (Test-Path -LiteralPath $Destination) { Remove-Item -LiteralPath $Destination -Force -ErrorAction SilentlyContinue }
        if (-not $script:DK.DryRun) {
            Add-Type -AssemblyName System.IO.Compression.FileSystem
            [System.IO.Compression.ZipFile]::CreateFromDirectory($tmp, $Destination)
        } else {
            # dry-run: emit a placeholder file so callers can see the path
            Set-Content -LiteralPath $Destination -Value 'dryrun-diagnostics' -Encoding ASCII
        }
        return [ordered]@{ ok = $true; path = $Destination }
    } finally {
        try { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue } catch { }
    }
}

# Provisioning helper: initialize recovery repo + register manifest (idempotent).
function Initialize-DarkOSRecovery {
    [CmdletBinding()] param([string]$Profile = 'darkosDefault')
    foreach ($d in (Get-DkPath Recovery), (Get-DkPath Policy), (Get-DkPath AppPackages), (Get-DkPath Snapshots), (Get-DkPath Logs), (Get-DkPath Files)) {
        if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
    }
    $manifest = Read-DkManifest
    if (-not $manifest) { $manifest = New-DkManifest }
    $manifest.osBuild = [string](Invoke-Dk 'OsBuild')
    Enter-DkLock; try { Save-DkManifest $manifest } finally { Exit-DkLock }
    return [ordered]@{ ok = $true; root = (Get-DkPath Root); manifest = (Get-DkPath Manifest) }
}

Export-ModuleMember -Function @(
    'Set-DarkOSEnvironment', 'Initialize-DarkOSRecovery',
    'Get-DarkOSCatalog', 'Get-DarkOSManifest', 'Get-DarkOSStatus',
    'Invoke-DarkOSChange', 'Set-DarkOSProfile', 'Restore-DarkOSProfile',
    'Restore-DarkOSAppx', 'Get-DarkOSRemovedApps',
    'New-DarkOSSnapshot', 'Get-DarkOSSnapshot', 'Restore-DarkOSSnapshot',
    'Get-DarkOSFailures', 'Get-DarkOSRebootPending', 'Export-DarkOSDiagnostics'
)
