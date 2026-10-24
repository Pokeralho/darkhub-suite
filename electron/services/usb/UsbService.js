// USB ports: what is plugged where, turn single devices off/on, USB storage policies, safe eject and the history of
// storage devices. Changes run elevated through ElevationHelper and record what they changed so they can be undone.
import { runPowerShellJson } from '../PowerShellRunner.js'
import Elevation from '../optimizer/ElevationHelper.js'
import { psQuote } from '../optimizer/OptimizerUtils.js'
import { buildPorts, canToggle, parseHistory } from './usbModel.js'

const INPUT_REVERT_MS = 20000
const SUSPEND = 'SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226'

// One read-only pass; properties for every device in a single call (one by one took ~4 s for 12 devices).
const LIST_SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$all = @(Get-PnpDevice | Where-Object { $_.InstanceId -match '^(USB|USBSTOR|HID)\\' -or $_.Class -eq 'USB' })
$present = @($all | Where-Object { $_.Present })
$ids = @($all | ForEach-Object { $_.InstanceId })
$props = @{}
$keys = 'DEVPKEY_Device_LocationInfo','DEVPKEY_Device_Parent','DEVPKEY_Device_BusReportedDeviceDesc','DEVPKEY_Device_LastArrivalDate','DEVPKEY_Device_LastRemovalDate','DEVPKEY_Device_FirstInstallDate'
# the batch call intermittently skips some devices: ask again for the ones that came back empty
$pending = $ids
for ($try = 0; $try -lt 3 -and $pending.Count; $try++) {
  foreach ($p in Get-PnpDeviceProperty -InstanceId $pending -KeyName $keys -ErrorAction SilentlyContinue) {
    if (-not $props[$p.InstanceId]) { $props[$p.InstanceId] = @{} }
    $props[$p.InstanceId][$p.KeyName] = $p.Data
  }
  $pending = @($pending | Where-Object { -not $props[$_] })
}
function Ms($d) { if ($d) { [long](([datetime]$d).ToUniversalTime() - [datetime]'1970-01-01').TotalMilliseconds } else { $null } }
$devices = @($present | ForEach-Object {
  $pp = $props[$_.InstanceId]; if (-not $pp) { $pp = @{} }
  [pscustomobject]@{ instanceId = $_.InstanceId; name = $_.FriendlyName; class = [string]$_.Class; status = [string]$_.Status; problemCode = [int]$_.ConfigManagerErrorCode; location = [string]$pp['DEVPKEY_Device_LocationInfo']; busName = [string]$pp['DEVPKEY_Device_BusReportedDeviceDesc']; parent = [string]$pp['DEVPKEY_Device_Parent'] }
})
$history = @($all | Where-Object { $_.InstanceId -like 'USBSTOR\*' } | ForEach-Object {
  $pp = $props[$_.InstanceId]; if (-not $pp) { $pp = @{} }
  [pscustomobject]@{ instanceId = $_.InstanceId; name = $_.FriendlyName; present = [bool]$_.Present; firstAt = (Ms $pp['DEVPKEY_Device_FirstInstallDate']); lastArrivalAt = (Ms $pp['DEVPKEY_Device_LastArrivalDate']); lastRemovalAt = (Ms $pp['DEVPKEY_Device_LastRemovalDate']) }
})
$drives = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=2' | ForEach-Object { [pscustomobject]@{ letter = $_.DeviceID; label = $_.VolumeName; size = [long]$_.Size; free = [long]$_.FreeSpace } })
$usbstor = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\USBSTOR' -Name Start).Start
$wp = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\StorageDevicePolicies' -Name WriteProtect).WriteProtect
# the first 0x value in the query output is the AC (plugged in) setting
$hex = [regex]::Matches(((powercfg /query ${SUSPEND}) -join ' '), '0x([0-9a-fA-F]{8})')
$ac = if ($hex.Count) { [Convert]::ToInt32($hex[0].Groups[1].Value, 16) } else { $null }
[pscustomobject]@{ devices = $devices; history = $history; drives = $drives; storageBlocked = ($usbstor -eq 4); writeProtect = ($wp -eq 1); selectiveSuspend = $ac } | ConvertTo-Json -Depth 5 -Compress
`

export class UsbService {
  constructor() {
    this.pendingReverts = new Map()
  }

  async list() {
    const { data, stderr } = await runPowerShellJson(LIST_SCRIPT, { timeoutMs: 60000, fallback: null })
    if (!data) return { ok: false, error: stderr || 'Falha ao ler os dispositivos USB' }
    const devices = Array.isArray(data.devices) ? data.devices : data.devices ? [data.devices] : []
    return {
      ok: true,
      ports: buildPorts(devices),
      history: parseHistory(Array.isArray(data.history) ? data.history : data.history ? [data.history] : []),
      drives: Array.isArray(data.drives) ? data.drives : data.drives ? [data.drives] : [],
      policies: { storageBlocked: Boolean(data.storageBlocked), writeProtect: Boolean(data.writeProtect), selectiveSuspend: data.selectiveSuspend == null ? null : data.selectiveSuspend === 1 },
      pendingReverts: [...this.pendingReverts.keys()],
      elevated: await Elevation.isElevated()
    }
  }

  async _run(script) {
    const r = await Elevation.runMarked(script, 60000)
    return r.ok ? { ok: true } : { ok: false, error: r.error || 'Falha' }
  }

  /** Turns one device off/on. Input devices come back on by themselves unless keep() is called in time. */
  async setDeviceEnabled({ instanceId, name, kind }, enabled) {
    const check = canToggle({ instanceId, name, kind })
    if (!check.ok) return { ok: false, error: check.reason === 'controller' ? 'Controladoras e hubs não são desligados por aqui (poderia cortar teclado e mouse juntos).' : 'Dispositivo inválido' }
    const r = await this._run(`${enabled ? 'Enable' : 'Disable'}-PnpDevice -InstanceId ${psQuote(instanceId)} -Confirm:$false -ErrorAction Stop`)
    if (!r.ok) return r
    if (!enabled && check.input) {
      clearTimeout(this.pendingReverts.get(instanceId))
      const t = setTimeout(() => {
        this.pendingReverts.delete(instanceId)
        void this._run(`Enable-PnpDevice -InstanceId ${psQuote(instanceId)} -Confirm:$false -ErrorAction Stop`)
      }, INPUT_REVERT_MS)
      this.pendingReverts.set(instanceId, t)
      return { ok: true, revertInMs: INPUT_REVERT_MS }
    }
    if (enabled) { clearTimeout(this.pendingReverts.get(instanceId)); this.pendingReverts.delete(instanceId) }
    return { ok: true }
  }

  /** The user confirmed they still have control: keep the input device off. */
  keepDisabled(instanceId) {
    clearTimeout(this.pendingReverts.get(instanceId))
    this.pendingReverts.delete(instanceId)
    return { ok: true }
  }

  /** USB storage: Start=4 stops the driver for newly connected drives (3 = Windows default). */
  setStorageBlocked(blocked) {
    return this._run(`Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\USBSTOR' -Name Start -Type DWord -Value ${blocked ? 4 : 3} -ErrorAction Stop`)
  }

  /** Read-only removable drives (applies to drives connected after the change). */
  setWriteProtect(on) {
    return this._run(on
      ? `New-Item -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\StorageDevicePolicies' -Force | Out-Null
Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\StorageDevicePolicies' -Name WriteProtect -Type DWord -Value 1 -ErrorAction Stop`
      : `Remove-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\StorageDevicePolicies' -Name WriteProtect -ErrorAction SilentlyContinue`)
  }

  /** USB selective suspend in the active power plan (off avoids mice/controllers waking up late). */
  setSelectiveSuspend(on) {
    const v = on ? 1 : 0
    return this._run(`powercfg /setacvalueindex ${SUSPEND} ${v}
DhCheck 'powercfg ac'
powercfg /setdcvalueindex ${SUSPEND} ${v}
DhCheck 'powercfg dc'
powercfg /setactive SCHEME_CURRENT
DhCheck 'powercfg active'`)
  }

  /** Safe removal through the shell's Eject verb (same as the tray icon). No admin needed. */
  async eject(letter) {
    if (!/^[A-Z]:$/i.test(String(letter))) return { ok: false, error: 'Unidade inválida' }
    const { data } = await runPowerShellJson(`$d = (New-Object -ComObject Shell.Application).Namespace(17).ParseName(${psQuote(String(letter).toUpperCase())})
if ($d) { $d.InvokeVerb('Eject'); Start-Sleep -Milliseconds 1500 }
[pscustomobject]@{ gone = -not (Test-Path ${psQuote(`${String(letter).toUpperCase()}\\`)}) } | ConvertTo-Json -Compress`, { timeoutMs: 20000, fallback: null })
    return data?.gone ? { ok: true } : { ok: false, error: 'A unidade ainda está em uso. Feche os arquivos abertos nela e tente de novo.' }
  }
}
