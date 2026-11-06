# DarkHub partitioning: runs ONE operation already planned by PartitionService.js. Storage module only, no diskpart.
# The payload is base64 JSON, so nothing the user typed is ever parsed as PowerShell. Before writing, this script
# re-reads the disk and refuses if it is not the one the user confirmed, independently of the checks done in Node.
# Output: a single line "DKPART|<json>". PowerShell 5.1, ASCII only.
param([Parameter(Mandatory = $true)][string]$Payload)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$EspGuid = '{c12a7328-f81f-11d2-ba4b-00a0c93ec93b}'
$BasicGuid = '{ebd0a0a2-b9e5-4433-87c0-68b6b72699c7}'

function Send-Result($Object) {
  Write-Output ('DKPART|' + ($Object | ConvertTo-Json -Compress -Depth 4))
  exit 0
}
function Stop-Refused([string]$Code) { Send-Result ([pscustomobject]@{ ok = $false; code = $Code; written = $false }) }

function Get-DiskPartitions([int]$Number) {
  @(Get-Partition | Where-Object { $_.DiskNumber -eq $Number } | Sort-Object Offset)
}

function Assert-Target($Q) {
  $n = [int]$Q.disk.number
  $d = Get-Disk -Number $n
  if ([string]$d.FriendlyName.Trim() -cne [string]$Q.disk.name) { Stop-Refused 'disk_changed' }
  if (([string]$d.SerialNumber).Trim() -cne [string]$Q.disk.serial) { Stop-Refused 'disk_changed' }
  if ([double]$d.Size -ne [double]$Q.disk.size) { Stop-Refused 'disk_changed' }
  if ($d.IsBoot -or $d.IsSystem) { Stop-Refused 'system_disk' }
  if ($d.IsOffline -or $d.IsReadOnly) { Stop-Refused 'disk_readonly' }
  $windows = Get-Partition -DriveLetter ([string]$env:SystemDrive).Substring(0, 1)
  if ([int]$windows.DiskNumber -eq $n) { Stop-Refused 'system_disk' }
  $parts = @(Get-DiskPartitions $n)
  foreach ($p in $parts) {
    if ($p.IsBoot -or $p.IsSystem -or $p.GptType -eq $EspGuid) { Stop-Refused 'system_disk' }
  }
  $want = @($Q.layout)
  if ($parts.Count -ne $want.Count) { Stop-Refused 'disk_changed' }
  for ($i = 0; $i -lt $parts.Count; $i++) {
    $same = ([int]$parts[$i].PartitionNumber -eq [int]$want[$i].number) -and ([double]$parts[$i].Offset -eq [double]$want[$i].offset) -and ([double]$parts[$i].Size -eq [double]$want[$i].size)
    if (-not $same) { Stop-Refused 'disk_changed' }
  }
}

function Invoke-Format($Partition, $Q) {
  $args2 = @{ Partition = $Partition; FileSystem = [string]$Q.fs; NewFileSystemLabel = [string]$Q.label; Confirm = $false; Force = $true }
  if ($Q.full -eq $true) { $args2.Full = $true }
  Format-Volume @args2 | Out-Null
}

try {
  $Q = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Payload)) | ConvertFrom-Json
  $n = [int]$Q.disk.number

  if ($Q.op -eq 'limits') {
    $s = Get-PartitionSupportedSize -DiskNumber $n -PartitionNumber ([int]$Q.partition)
    Send-Result ([pscustomobject]@{ ok = $true; min = [double]$s.SizeMin; max = [double]$s.SizeMax })
  }

  Assert-Target $Q
  $number = [int]$Q.partition

  switch ([string]$Q.op) {
    'init' {
      Initialize-Disk -Number $n -PartitionStyle GPT
    }
    'create' {
      # no letter yet: a RAW volume with a letter makes Explorer ask the user to format it
      $style = [string](Get-Disk -Number $n).PartitionStyle
      $new = @{ DiskNumber = $n; Offset = [uint64]$Q.offset; Size = [uint64]$Q.size }
      if ($style -eq 'GPT') { $new.GptType = $BasicGuid }
      $p = New-Partition @new
      $number = [int]$p.PartitionNumber
      try {
        Invoke-Format $p $Q
        if ($Q.letter) { Set-Partition -DiskNumber $n -PartitionNumber $number -NewDriveLetter ([char][string]$Q.letter) }
        else { Add-PartitionAccessPath -DiskNumber $n -PartitionNumber $number -AssignDriveLetter }
      } catch {
        Send-Result ([pscustomobject]@{ ok = $false; code = 'create_partial'; written = $true; partition = $number; detail = $_.Exception.Message })
      }
    }
    'delete' { Remove-Partition -DiskNumber $n -PartitionNumber $number -Confirm:$false }
    'resize' {
      $s = Get-PartitionSupportedSize -DiskNumber $n -PartitionNumber $number
      if ([double]$Q.newSize -lt [double]$s.SizeMin -or [double]$Q.newSize -gt [double]$s.SizeMax) { Stop-Refused 'limits_changed' }
      Resize-Partition -DiskNumber $n -PartitionNumber $number -Size ([uint64]$Q.newSize)
    }
    'format' { Invoke-Format (Get-Partition -DiskNumber $n -PartitionNumber $number) $Q }
    'letter' { Set-Partition -DiskNumber $n -PartitionNumber $number -NewDriveLetter ([char][string]$Q.letter) }
    default { Stop-Refused 'bad_op' }
  }
  Update-HostStorageCache
  Send-Result ([pscustomobject]@{ ok = $true; written = $true; partition = $number })
} catch {
  # an unknown failure may have changed the disk: Node re-reads it and reports what is there
  Send-Result ([pscustomobject]@{ ok = $false; code = 'failed'; written = $null; detail = $_.Exception.Message })
}
