# DarkOS installation media: lists USB drives, or writes a Windows/DarkOS ISO to one (MBR, FAT32; boots UEFI and BIOS).
# PowerShell 5.1, ASCII only. Every line for the app starts with "DKUSB|".
#   -Action list
#   -Action write -DiskNumber N -ExpectedSize BYTES -IsoPath FILE [-Label DARKOS] [-AllowVirtual]
param(
  [Parameter(Mandatory = $true)][ValidateSet('list', 'write')][string]$Action,
  [int]$DiskNumber = -1,
  [UInt64]$ExpectedSize = 0,
  [string]$IsoPath = '',
  [string]$Label = 'DARKOS',
  [switch]$AllowVirtual
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

function Say([string]$kind, [string]$a = '', [string]$b = '') { [Console]::Out.WriteLine("DKUSB|$kind|$a|$b"); [Console]::Out.Flush() }

function Test-Target($disk) {
  $bus = [string]$disk.BusType
  $okBus = ($bus -eq 'USB') -or ($AllowVirtual -and $bus -eq 'File Backed Virtual')
  return $okBus -and -not $disk.IsBoot -and -not $disk.IsSystem
}

if ($Action -eq 'list') {
  foreach ($d in @(Get-Disk)) {
    if (-not (Test-Target $d)) { continue }
    $letters = @()
    try { $letters = @(Get-Partition -DiskNumber $d.Number -ErrorAction SilentlyContinue | Where-Object { $_.DriveLetter } | ForEach-Object { [string]$_.DriveLetter }) } catch {}
    $o = [ordered]@{ number = [int]$d.Number; name = [string]$d.FriendlyName; size = [UInt64]$d.Size; bus = [string]$d.BusType; style = [string]$d.PartitionStyle; letters = ($letters -join ',') }
    Say 'disk' ($o | ConvertTo-Json -Compress)
  }
  Say 'done'
  exit 0
}

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Say 'error' 'admin'; exit 2 }

$disk = Get-Disk -Number $DiskNumber
# the drive must still be the one the user confirmed: a USB drive (not the system), with the same size
if (-not (Test-Target $disk)) { Say 'error' 'not-usb'; exit 2 }
if ([UInt64]$disk.Size -ne $ExpectedSize) { Say 'error' 'changed'; exit 2 }
if (-not (Test-Path -LiteralPath $IsoPath)) { Say 'error' 'iso-missing'; exit 2 }

$iso = $null
$usb = $null
try {
  Say 'step' 'prepare'
  if ($disk.IsOffline) { Set-Disk -Number $DiskNumber -IsOffline $false }
  if ($disk.IsReadOnly) { Set-Disk -Number $DiskNumber -IsReadOnly $false }
  # diskpart works on removable drives where the Storage cmdlets refuse to change the partition style. MBR + an active
  # FAT32 partition boots on UEFI PCs and on older BIOS/CSM ones (same layout Rufus uses for "BIOS or UEFI").
  # Windows only formats FAT32 up to 32 GB, more than any ISO needs.
  $sizeMb = [Math]::Min([Math]::Floor([double]$disk.Size / 1MB) - 2, 32000)
  $dp = Join-Path $env:TEMP 'darkhub-usb-diskpart.txt'
  $lines = @("select disk $DiskNumber", 'clean', 'convert mbr', "create partition primary size=$sizeMb", "format fs=fat32 quick label=$Label", 'active', 'assign')
  [IO.File]::WriteAllLines($dp, $lines)
  $dpOut = & diskpart.exe /s $dp 2>&1 | Out-String
  Remove-Item -LiteralPath $dp -Force -ErrorAction SilentlyContinue
  if ($LASTEXITCODE -ne 0) { throw ('diskpart: ' + (($dpOut -split "`r?`n" | Where-Object { $_.Trim() }) | Select-Object -Last 2) -join ' ') }
  Start-Sleep -Milliseconds 800
  $part = Get-Partition -DiskNumber $DiskNumber | Select-Object -First 1
  if (-not $part.DriveLetter) { Add-PartitionAccessPath -DiskNumber $DiskNumber -PartitionNumber $part.PartitionNumber -AssignDriveLetter; $part = Get-Partition -DiskNumber $DiskNumber -PartitionNumber $part.PartitionNumber }
  $usb = "$($part.DriveLetter):\"

  Say 'step' 'mount'
  $iso = Mount-DiskImage -ImagePath $IsoPath -PassThru
  $isoLetter = ($iso | Get-Volume).DriveLetter
  if (-not $isoLetter) { throw 'iso-no-letter' }
  $src = "$($isoLetter):\"
  if (-not (Test-Path -LiteralPath (Join-Path $src 'efi\boot\bootx64.efi'))) { throw 'iso-not-uefi' }

  $files = @(Get-ChildItem -LiteralPath $src -Recurse -Force -File)
  # the Windows image (install.wim or install.esd); FAT32 holds files up to 4 GB, so a bigger one is split into .swm parts
  $wim = $files | Where-Object { $_.FullName -ieq (Join-Path $src 'sources\install.wim') -or $_.FullName -ieq (Join-Path $src 'sources\install.esd') } | Sort-Object Length -Descending | Select-Object -First 1
  $split = $wim -and $wim.Length -gt 4GB - 1
  $toCopy = @($files | Where-Object { -not ($split -and $_.FullName -ieq $wim.FullName) })
  $total = [double](($toCopy | Measure-Object -Property Length -Sum).Sum)
  if ($split) { $total += [double]$wim.Length }
  $done = [double]0
  $lastPct = -1
  $buffer = New-Object byte[] (4MB)

  Say 'step' 'copy'
  foreach ($f in $toCopy) {
    $rel = $f.FullName.Substring($src.Length)
    $dest = Join-Path $usb $rel
    $dir = Split-Path -Parent $dest
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $in = [IO.File]::OpenRead($f.FullName)
    $out = [IO.File]::Create($dest)
    try {
      while (($n = $in.Read($buffer, 0, $buffer.Length)) -gt 0) {
        $out.Write($buffer, 0, $n)
        $done += $n
        $pct = [int][Math]::Floor($done * 100 / $total)
        if ($pct -ne $lastPct) { $lastPct = $pct; Say 'progress' $pct $rel }
      }
    } finally { $out.Dispose(); $in.Dispose() }
  }

  if ($split) {
    # Windows Setup reads install.swm parts the same way as install.wim / install.esd
    Say 'step' 'split'
    $base = $done
    $swm = Join-Path $usb 'sources\install.swm'
    # DISM redraws its own progress bar with carriage returns, so progress comes from the size of the parts written so far
    $dismLog = Join-Path $env:TEMP 'darkhub-usb-dism.txt'
    $proc = Start-Process -FilePath 'dism.exe' -ArgumentList @('/English', '/Split-Image', "/ImageFile:$($wim.FullName)", "/SWMFile:$swm", '/FileSize:3800') -NoNewWindow -PassThru -RedirectStandardOutput $dismLog
    $null = $proc.Handle # keeps the exit code readable after the process ends
    while (-not $proc.WaitForExit(1000)) {
      $written = [double]((Get-ChildItem -LiteralPath (Join-Path $usb 'sources') -Filter 'install*.swm' -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum)
      $pct = [int][Math]::Min(99, [Math]::Floor(($base + [Math]::Min($written, [double]$wim.Length)) * 100 / $total))
      if ($pct -ne $lastPct) { $lastPct = $pct; Say 'progress' $pct 'sources\install.swm' }
    }
    $proc.WaitForExit()
    Remove-Item -LiteralPath $dismLog -Force -ErrorAction SilentlyContinue
    if ($proc.ExitCode -ne 0) { throw "dism-$($proc.ExitCode)" }
  }

  Say 'step' 'verify'
  $need = @('efi\boot\bootx64.efi', 'sources\boot.wim', 'bootmgr.efi')
  foreach ($n in $need) { if (-not (Test-Path -LiteralPath (Join-Path $usb $n))) { throw "missing-$n" } }
  $image = @('sources\install.wim', 'sources\install.swm', 'sources\install.esd') | Where-Object { Test-Path -LiteralPath (Join-Path $usb $_) }
  if (-not $image) { throw 'missing-install-image' }
  Say 'ok' $usb
  exit 0
} catch {
  Say 'error' 'failed' ([string]$_.Exception.Message -replace '[\r\n|]', ' ')
  exit 1
} finally {
  if ($iso) { try { Dismount-DiskImage -ImagePath $IsoPath | Out-Null } catch {} }
}
