# Windows Update diagnosis: read-only, no admin needed. Prints one JSON object with everything that commonly stops
# Windows Update from downloading. PowerShell 5.1, ASCII only.
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'

$services = @{}
foreach ($n in 'wuauserv', 'bits', 'cryptsvc', 'dosvc', 'usosvc', 'trustedinstaller', 'waasmedicsvc') {
  $p = Get-ItemProperty -LiteralPath ('HKLM:\SYSTEM\CurrentControlSet\Services\' + $n)
  $services[$n] = [pscustomobject]@{ exists = [bool]$p; start = [int]$p.Start; status = [string](Get-Service -Name $n).Status }
}

$wu = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate'
$au = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU'
$do = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DeliveryOptimization'
$policies = [pscustomobject]@{
  disableAccess = [int]$wu.DisableWindowsUpdateAccess
  noInternet = [int]$wu.DoNotConnectToWindowsUpdateInternetLocations
  wsus = [bool]([int]$au.UseWUServer -eq 1 -and $wu.WUServer)
  wsusServer = [string]$wu.WUServer
  doMode = if ($null -ne $do.DODownloadMode) { [int]$do.DODownloadMode } else { -1 }
}

$hostsFile = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
$hosts = @(Get-Content -LiteralPath $hostsFile | Where-Object { $_ -notmatch '^\s*#' -and $_ -match '(windowsupdate|update\.microsoft|delivery\.mp\.microsoft|wustat|download\.microsoft|do\.dsp\.mp\.microsoft)' } | Select-Object -First 20)

# the servers Windows Update talks to (search: 443; downloads mostly plain http: 80)
$targets = @(
  @{ host = 'fe3cr.delivery.mp.microsoft.com'; port = 443 },
  @{ host = 'slscr.update.microsoft.com'; port = 443 },
  @{ host = 'download.windowsupdate.com'; port = 80 },
  @{ host = 'tlu.dl.delivery.mp.microsoft.com'; port = 80 },
  @{ host = 'geo.prod.do.dsp.mp.microsoft.com'; port = 443 }
)
$net = foreach ($t in $targets) {
  $ips = @()
  $dnsOk = $false
  try {
    $task = [System.Net.Dns]::GetHostAddressesAsync($t.host)
    if ($task.Wait(4000)) { $ips = @($task.Result | ForEach-Object { $_.IPAddressToString }); $dnsOk = $ips.Count -gt 0 }
  } catch {}
  $tcp = $false
  if ($dnsOk) {
    try { $c = New-Object System.Net.Sockets.TcpClient; $tcp = $c.ConnectAsync($t.host, $t.port).Wait(4000); $c.Close() } catch {}
  }
  [pscustomobject]@{ host = $t.host; port = $t.port; dns = $dnsOk; ips = @($ips | Select-Object -First 3); tcp = [bool]$tcp }
}

$proxyText = (& netsh.exe winhttp show proxy 2>$null | Out-String)
$proxy = if ($proxyText -match '(?im)^\s*(Proxy Server\(s\)|Servidor\(es\) proxy|Servidores proxy)\s*:\s*(\S+)') { $Matches[2] } else { '' }

# clock: compare with the Date header of a Microsoft server
$skew = $null
try {
  $r = Invoke-WebRequest -UseBasicParsing -Method Head -Uri 'https://www.microsoft.com' -TimeoutSec 8
  $remote = [datetime]::Parse($r.Headers['Date']).ToUniversalTime()
  $skew = [int][math]::Round(([datetime]::UtcNow - $remote).TotalMinutes)
} catch {}

$drive = Get-PSDrive -Name ($env:SystemDrive.TrimEnd(':'))
$fw = @(Get-NetFirewallRule -Direction Outbound -Action Block -Enabled True | Select-Object -First 15 | ForEach-Object { [string]$_.DisplayName })
# DarkHub's own community IP blocklist (Security screen): its addresses, to see if a Windows Update server is in it
$dhBlock = @(Get-NetFirewallRule -Group 'DarkHub Community IP Blocklist' -Direction Outbound -Enabled True | Get-NetFirewallAddressFilter | ForEach-Object { $_.RemoteAddress } | Where-Object { $_ -and $_ -ne 'Any' })

[pscustomobject]@{
  services = $services
  policies = $policies
  hosts = $hosts
  net = @($net)
  proxy = [string]$proxy
  clockSkewMin = $skew
  freeGb = [math]::Round($drive.Free / 1GB, 1)
  firewallBlocks = $fw
  darkhubBlocklist = $dhBlock
  cache = [pscustomobject]@{ softwareDistribution = (Test-Path (Join-Path $env:SystemRoot 'SoftwareDistribution')); catroot2 = (Test-Path (Join-Path $env:SystemRoot 'System32\catroot2')) }
} | ConvertTo-Json -Depth 5 -Compress
