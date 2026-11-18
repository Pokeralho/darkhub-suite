# DarkHub Suite: optional components installed by the setup (runs elevated, after the files are copied).
#   PawnIO  - signed driver used by the advanced sensors (CPU temperature, MSRs, SMBus)
# It comes from its official release, pinned by SHA-256 (keep in sync with electron/services/hwsensors/pawnio.js;
# tests/depsInstaller.test.ts checks it). ClamAV is installed by the app when protection is turned on. Never fails the setup: anything missing
# here is installed later by the app itself. ASCII only, Windows PowerShell 5.1.
param([string]$LogPath = (Join-Path $env:ProgramData 'DarkHub\deps-install.log'))
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
New-Item -ItemType Directory -Force (Split-Path $LogPath) | Out-Null
function Log([string]$m) { $line = (Get-Date).ToString('s') + ' ' + $m; Add-Content -LiteralPath $LogPath -Value $line; Write-Output $m }

$PawnIO = @{ Version = '2.2.0'; Url = 'https://github.com/namazso/PawnIO.Setup/releases/download/2.2.0/PawnIO_setup.exe'; Sha256 = '1f519a22e47187f70a1379a48ca604981c4fcf694f4e65b734aaa74a9fba3032' }

$work = Join-Path $env:TEMP ('darkhub-deps-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $work | Out-Null

function Get-Verified([string]$url, [string]$sha256, [string]$file) {
  for ($try = 1; $try -le 3; $try++) {
    try {
      Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $file -TimeoutSec 900
      $h = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
      if ($h -eq $sha256) { return }
      throw ('hash mismatch: ' + $h)
    } catch {
      Log ("  download attempt $try failed: " + $_.Exception.Message)
      Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue
      if ($try -eq 3) { throw }
      Start-Sleep -Seconds (5 * $try)
    }
  }
}

Log 'DarkHub components setup started'

# ---------------------------------------------------------------- PawnIO
try {
  # after an uninstall the service key stays until the next reboot: also require the program folder
  if ((Test-Path 'HKLM:\SYSTEM\CurrentControlSet\Services\PawnIO') -and (Test-Path (Join-Path $env:ProgramFiles 'PawnIO'))) {
    Log 'PawnIO: already installed'
  } else {
    Log ('PawnIO ' + $PawnIO.Version + ': downloading')
    $f = Join-Path $work 'PawnIO_setup.exe'
    Get-Verified $PawnIO.Url $PawnIO.Sha256 $f
    $sig = Get-AuthenticodeSignature -LiteralPath $f
    if ($sig.Status -ne 'Valid') { throw ('signature ' + $sig.Status) }
    $p = Start-Process -FilePath $f -ArgumentList '-install', '-silent' -Wait -PassThru -WindowStyle Hidden
    if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) { throw ('setup exit ' + $p.ExitCode) }
    Log ('PawnIO: installed (exit ' + $p.ExitCode + ')')
  }
} catch { Log ('PawnIO: skipped - ' + $_.Exception.Message + ' (the app installs it later)') }

# ---------------------------------------------------------------- ClamAV
# Not downloaded here any more: real-time protection is off by default and turning it on installs ClamAV and its
# signatures (electron/ipc/realtimeIpc.js). Doing it in every silent setup/update cost ~215 MB and minutes for nothing.
Log 'ClamAV: left to the app (installed when real-time protection is turned on)'

Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
Log 'DarkHub components setup finished'
exit 0
