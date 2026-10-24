// Startup manager: lists everything that starts with Windows, toggles it the way Task Manager does (StartupApproved),
// and reads measured boot impact from the Diagnostics-Performance log. Every change is recorded for undo.
import fs from 'node:fs'
import path from 'node:path'
import { runPowerShellJson } from '../PowerShellRunner.js'
import Elevation from '../optimizer/ElevationHelper.js'
import { psQuote } from '../optimizer/OptimizerUtils.js'
import { decodeApproved, encodeApproved, exeFromCommand, parseBootEvents, impactFor, sensitivity } from './startupModel.js'

const APPROVED = 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved'

// One read-only pass. ASCII only (runs through ElevationHelper too).
const LIST_SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$items = @()
function Approved($hive, $sub, $name) {
  $k = Get-Item -LiteralPath ("Registry::" + $hive + "\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\" + $sub)
  if ($k) { $v = $k.GetValue($name); if ($v) { return ,([int[]]$v) } }
  return $null
}
$runs = @(
  @{ hive = 'HKEY_CURRENT_USER'; key = 'Software\Microsoft\Windows\CurrentVersion\Run'; sub = 'Run'; scope = 'user' },
  @{ hive = 'HKEY_LOCAL_MACHINE'; key = 'Software\Microsoft\Windows\CurrentVersion\Run'; sub = 'Run'; scope = 'machine' },
  @{ hive = 'HKEY_LOCAL_MACHINE'; key = 'Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run'; sub = 'Run32'; scope = 'machine' }
)
foreach ($r in $runs) {
  $k = Get-Item -LiteralPath ("Registry::" + $r.hive + "\" + $r.key)
  if (-not $k) { continue }
  foreach ($n in $k.GetValueNames()) {
    if (-not $n) { continue }
    $items += [pscustomobject]@{ kind = 'run'; name = $n; command = [string]$k.GetValue($n); hive = $r.hive; sub = $r.sub; scope = $r.scope; location = ($r.hive + "\" + $r.key); approved = (Approved $r.hive $r.sub $n) }
  }
}
$shell = New-Object -ComObject WScript.Shell
$folders = @(
  @{ path = [Environment]::GetFolderPath('Startup'); hive = 'HKEY_CURRENT_USER'; scope = 'user' },
  @{ path = [Environment]::GetFolderPath('CommonStartup'); hive = 'HKEY_LOCAL_MACHINE'; scope = 'machine' }
)
foreach ($f in $folders) {
  if (-not $f.path -or -not (Test-Path -LiteralPath $f.path)) { continue }
  foreach ($file in Get-ChildItem -LiteralPath $f.path -File | Where-Object { $_.Name -ne 'desktop.ini' }) {
    $target = $file.FullName
    if ($file.Extension -eq '.lnk') { $target = $shell.CreateShortcut($file.FullName).TargetPath }
    $items += [pscustomobject]@{ kind = 'folder'; name = $file.Name; command = $target; hive = $f.hive; sub = 'StartupFolder'; scope = $f.scope; location = $f.path; approved = (Approved $f.hive 'StartupFolder' $file.Name) }
  }
}
foreach ($t in Get-ScheduledTask) {
  $trig = @($t.Triggers | Where-Object { $_.CimClass.CimClassName -in @('MSFT_TaskLogonTrigger', 'MSFT_TaskBootTrigger') })
  if (-not $trig.Count) { continue }
  $exec = @($t.Actions | Where-Object { $_.Execute }) | Select-Object -First 1
  $items += [pscustomobject]@{ kind = 'task'; name = $t.TaskName; taskPath = $t.TaskPath; command = (([string]$exec.Execute) + ' ' + ([string]$exec.Arguments)).Trim(); scope = 'machine'; location = ('Task Scheduler ' + $t.TaskPath); enabled = ($t.State -ne 'Disabled'); microsoft = ($t.TaskPath -like '\Microsoft\*') }
}
foreach ($s in Get-CimInstance Win32_Service | Where-Object { $_.StartMode -eq 'Auto' }) {
  $items += [pscustomobject]@{ kind = 'service'; name = $s.Name; displayName = $s.DisplayName; command = [string]$s.PathName; scope = 'machine'; location = 'Services'; enabled = $true; state = $s.State; microsoft = ([string]$s.PathName -match '(?i)\\Windows\\(System32|SysWOW64|servicing)\\|\\Windows Defender\\|\\Microsoft\\') }
}
$events = @()
$admin = $true
try {
  $events = Get-WinEvent -LogName 'Microsoft-Windows-Diagnostics-Performance/Operational' -FilterXPath '*[System[(EventID=100 or EventID=101)]]' -MaxEvents 400 -ErrorAction Stop | ForEach-Object {
    $x = [xml]$_.ToXml(); $d = @{}
    foreach ($node in $x.Event.EventData.Data) { $d[$node.Name] = $node.'#text' }
    [pscustomobject]@{ id = $_.Id; time = [long](($_.TimeCreated.ToUniversalTime() - [datetime]'1970-01-01').TotalMilliseconds); data = $d }
  }
} catch { $admin = $false }
[pscustomobject]@{ items = $items; events = @($events); eventsReadable = $admin } | ConvertTo-Json -Depth 6 -Compress
`

export class StartupService {
  constructor({ app } = {}) {
    this.historyFile = path.join(app.getPath('userData'), 'startup-history.json')
  }

  _history() { try { return JSON.parse(fs.readFileSync(this.historyFile, 'utf8')) } catch { return [] } }
  _record(entry) {
    const h = [{ at: Date.now(), ...entry }, ...this._history()].slice(0, 200)
    fs.writeFileSync(this.historyFile, JSON.stringify(h, null, 1))
  }

  async list() {
    const { data, stderr } = await runPowerShellJson(LIST_SCRIPT, { timeoutMs: 60000, fallback: null })
    if (!data) return { ok: false, error: stderr || 'Falha ao listar a inicialização' }
    const { boots, slow } = parseBootEvents(data.events || [])
    const items = (data.items || []).map((raw) => {
      const exe = raw.kind === 'folder' ? raw.command : exeFromCommand(raw.command)
      const state = raw.kind === 'run' || raw.kind === 'folder' ? decodeApproved(raw.approved) : { enabled: raw.enabled !== false, disabledAt: null }
      const item = {
        id: `${raw.kind}|${raw.hive || ''}|${raw.sub || raw.taskPath || ''}|${raw.name}`,
        kind: raw.kind, name: raw.displayName || raw.name, key: raw.name, command: raw.command, exe, scope: raw.scope,
        location: raw.location, hive: raw.hive || null, sub: raw.sub || null, taskPath: raw.taskPath || null,
        microsoft: Boolean(raw.microsoft), state: raw.state || null, ...state
      }
      return { ...item, impact: impactFor(item, slow), sensitive: sensitivity(item), needsAdmin: raw.scope === 'machine' }
    })
    return { ok: true, items, boots: boots.slice(0, 30), eventsReadable: Boolean(data.eventsReadable), elevated: await Elevation.isElevated(), history: this._history().slice(0, 50) }
  }

  /** PowerShell that sets one item to `enabled`, returning the previous state for undo. ASCII only. */
  _toggleScript(item, enabled) {
    if (item.kind === 'run' || item.kind === 'folder') {
      const bytes = encodeApproved(enabled).map((b) => `0x${b.toString(16).padStart(2, '0')}`).join(',')
      const key = `Registry::${item.hive}\\${APPROVED}\\${item.sub}`
      return `$k = ${psQuote(key)}
if (-not (Test-Path -LiteralPath $k)) { New-Item -Path $k -Force | Out-Null }
New-ItemProperty -LiteralPath $k -Name ${psQuote(item.key)} -PropertyType Binary -Value ([byte[]](${bytes})) -Force | Out-Null`
    }
    if (item.kind === 'task') {
      return `${enabled ? 'Enable' : 'Disable'}-ScheduledTask -TaskPath ${psQuote(item.taskPath)} -TaskName ${psQuote(item.key)} -ErrorAction Stop | Out-Null`
    }
    if (item.kind === 'service') {
      // disabling an auto-start service sets it to Manual (it can still start on demand), never Disabled
      return `Set-Service -Name ${psQuote(item.key)} -StartupType ${enabled ? 'Automatic' : 'Manual'} -ErrorAction Stop`
    }
    throw new Error('Tipo desconhecido')
  }

  async setEnabled(item, enabled) {
    if (!item || !['run', 'folder', 'task', 'service'].includes(item.kind)) return { ok: false, error: 'Item inválido' }
    const script = this._toggleScript(item, Boolean(enabled))
    // machine-wide items need admin: runMarked runs directly when DarkHub is elevated, otherwise asks UAC
    const r = item.scope === 'machine'
      ? await Elevation.runMarked(script, 60000)
      : await runPowerShellJson(`${script}\n'{"ok":true}'`, { timeoutMs: 30000, fallback: null }).then((x) => (x.data?.ok ? { ok: true } : { ok: false, error: x.stderr || 'falhou' }))
    if (!r.ok) return { ok: false, error: r.error || 'Falha ao alterar' }
    this._record({ id: item.id, name: item.name, kind: item.kind, item: { kind: item.kind, key: item.key, hive: item.hive, sub: item.sub, taskPath: item.taskPath, scope: item.scope, name: item.name, id: item.id }, from: !enabled, to: Boolean(enabled) })
    return { ok: true }
  }

  /** Undo one history entry: put the item back to the state it had before. */
  async undo(index) {
    const h = this._history()[Number(index)]
    if (!h?.item) return { ok: false, error: 'Entrada não encontrada' }
    return this.setEnabled(h.item, h.from)
  }
}
