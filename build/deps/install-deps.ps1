# DarkHub Suite: optional components installed by the setup (runs elevated, after the files are copied).
#   PawnIO  - signed driver used by the advanced sensors (CPU temperature, MSRs, SMBus)
#   ClamAV  - open-source antivirus used by real-time protection (protection itself stays OFF until the user turns it on)
# Both come from their official releases, pinned by SHA-256 (keep in sync with electron/services/hwsensors/pawnio.js and
# electron/services/realtime/ClamAv.js; tests/depsInstaller.test.ts checks it). Never fails the setup: anything missing
# here is installed later by the app itself. ASCII only, Windows PowerShell 5.1.
param([string]$LogPath = (Join-Path $env:ProgramData 'DarkHub\deps-install.log'))
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
New-Item -ItemType Directory -Force (Split-Path $LogPath) | Out-Null
function Log([string]$m) { $line = (Get-Date).ToString('s') + ' ' + $m; Add-Content -LiteralPath $LogPath -Value $line; Write-Output $m }

$PawnIO = @{ Version = '2.2.0'; Url = 'https://github.com/namazso/PawnIO.Setup/releases/download/2.2.0/PawnIO_setup.exe'; Sha256 = '1f519a22e47187f70a1379a48ca604981c4fcf694f4e65b734aaa74a9fba3032' }
$ClamAV = @{ Version = '1.5.4'; Url = 'https://github.com/Cisco-Talos/clamav/releases/download/clamav-1.5.4/clamav-1.5.4.win.x64.msi'; Sha256 = 'a025fa23a4b9d64fce448d5a211afcf30dc26ba6528186e6223d1b945f9d95d6' }

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
try {
  $clam = @($env:ProgramFiles, ${env:ProgramFiles(x86)}) | Where-Object { $_ } | ForEach-Object { Join-Path $_ 'ClamAV\clamscan.exe' } | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($clam) {
    Log ('ClamAV: already installed (' + $clam + ')')
  } else {
    Log ('ClamAV ' + $ClamAV.Version + ': downloading (about 215 MB)')
    $f = Join-Path $work 'clamav.msi'
    # the MSI is not Authenticode-signed (Cisco publishes a GPG .sig); integrity comes from the pinned SHA-256
    Get-Verified $ClamAV.Url $ClamAV.Sha256 $f
    $p = Start-Process -FilePath 'msiexec.exe' -ArgumentList '/i', ('"' + $f + '"'), '/qn', '/norestart' -Wait -PassThru -WindowStyle Hidden
    if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) { throw ('msiexec exit ' + $p.ExitCode) }
    Log ('ClamAV: installed (exit ' + $p.ExitCode + '); signatures are downloaded by DarkHub in the background')
  }
} catch { Log ('ClamAV: skipped - ' + $_.Exception.Message + ' (the app installs it when protection is turned on)') }

Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
Log 'DarkHub components setup finished'
exit 0
