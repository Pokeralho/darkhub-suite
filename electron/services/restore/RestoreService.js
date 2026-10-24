// Brings back Windows components that a custom ISO removed (Windows Media Player, .NET 3.5, Store apps, the Store and
// winget themselves). Every install is verified by reading the state back. Windows Update is unlocked only for the
// duration of a job (same helpers as the Driver Center) and put back as it was.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { runPowerShellJson } from '../PowerShellRunner.js'
import Elevation from '../optimizer/ElevationHelper.js'
import { psQuote } from '../optimizer/OptimizerUtils.js'
import { WU_UNLOCK_FUNCS } from '../drivers/DriverInstallService.js'
import { COMPONENTS, WINGET_BUNDLE, componentStatus, getComponent, restoreErrorText, sxsFromRoot } from './componentCatalog.js'

const DETECT_SCRIPT = (featureNames, appxNames) => `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$caps = $null
try { $caps = @(Get-WindowsCapability -Online -ErrorAction Stop | ForEach-Object { [pscustomobject]@{ name = $_.Name; state = [string]$_.State } }) } catch { }
$features = $null
try {
  $features = @{}
  foreach ($f in @(${featureNames.map(psQuote).join(',')})) {
    $s = Get-WindowsOptionalFeature -Online -FeatureName $f -ErrorAction Stop
    if ($s) { $features[$f] = [string]$s.State }
  }
} catch { $features = $null }
$appx = @(Get-AppxPackage -AllUsers -ErrorAction SilentlyContinue | Where-Object { $_.Name -in @(${appxNames.map(psQuote).join(',')}) } | ForEach-Object { $_.Name } | Select-Object -Unique)
if (-not $appx.Count) { $appx = @(Get-AppxPackage -ErrorAction SilentlyContinue | Where-Object { $_.Name -in @(${appxNames.map(psQuote).join(',')}) } | ForEach-Object { $_.Name } | Select-Object -Unique) }
$winget = [bool](Get-Command winget.exe -ErrorAction SilentlyContinue)
[pscustomobject]@{ capabilities = $caps; features = $features; appx = @($appx); winget = $winget } | ConvertTo-Json -Depth 4 -Compress
`

// DhP is what the shared Windows Update helpers log through
const DHP = "function DhP([string]$id, [string]$st, [string]$detail) { Write-Output ('DHP|' + $id + '|' + $st + '|' + $detail) }"

// Component repair source policy: 2 = fetch from Windows Update even when WSUS/policies point elsewhere. Saved and put
// back after the job, like the Windows Update unlock.
const SERVICING_FUNCS = `
$script:DhSvcPol = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Servicing'
$script:DhSvcOld = $null
function Open-DhRepairSource {
  if (-not (Test-Path $script:DhSvcPol)) { New-Item -Path $script:DhSvcPol -Force | Out-Null; $script:DhSvcOld = 'created' }
  else { $script:DhSvcOld = Get-ItemProperty -LiteralPath $script:DhSvcPol -ErrorAction SilentlyContinue }
  Set-ItemProperty -LiteralPath $script:DhSvcPol -Name RepairContentServerSource -Value 2 -Type DWord -Force
  Remove-ItemProperty -LiteralPath $script:DhSvcPol -Name UseWindowsUpdate -ErrorAction SilentlyContinue
}
function Close-DhRepairSource {
  if ($script:DhSvcOld -eq 'created') { Remove-Item -LiteralPath $script:DhSvcPol -Recurse -Force -ErrorAction SilentlyContinue; return }
  foreach ($n in 'RepairContentServerSource', 'UseWindowsUpdate') {
    $v = if ($script:DhSvcOld) { $script:DhSvcOld.$n } else { $null }
    if ($null -eq $v) { Remove-ItemProperty -LiteralPath $script:DhSvcPol -Name $n -ErrorAction SilentlyContinue }
    else { Set-ItemProperty -LiteralPath $script:DhSvcPol -Name $n -Value $v -Type DWord -Force }
  }
}
`

const run = (cmd, args, timeout) => new Promise((resolve) => {
  execFile(cmd, args, { windowsHide: true, timeout, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') }))
})

export class RestoreService {
  constructor({ onEvent } = {}) {
    this.onEvent = onEvent
    this.busy = null
  }

  async status() {
    const features = [...new Set(COMPONENTS.filter((c) => c.kind === 'feature').map((c) => c.name))]
    const appx = [...new Set(COMPONENTS.filter((c) => c.appx).map((c) => c.appx))]
    const { data, stderr } = await runPowerShellJson(DETECT_SCRIPT(features, appx), { timeoutMs: 120000, fallback: null, allowNonZero: true })
    if (!data) return { ok: false, error: stderr || 'Falha ao ler os componentes do Windows' }
    const caps = data.capabilities == null ? null : Array.isArray(data.capabilities) ? data.capabilities : [data.capabilities]
    const items = componentStatus({ capabilities: caps, features: data.features, appx: Array.isArray(data.appx) ? data.appx : data.appx ? [data.appx] : [] })
    return { ok: true, items, winget: Boolean(data.winget), elevated: await Elevation.isElevated(), isoNote: caps == null }
  }

  async install(id, { isoRoot = '' } = {}) {
    const c = getComponent(id)
    if (!c) return { ok: false, error: 'Componente desconhecido' }
    if (this.busy) return { ok: false, error: 'Outra restauração está em andamento' }
    this.busy = id
    this.onEvent?.({ type: 'started', id })
    try {
      const r = c.kind === 'capability' ? await this._capability(c)
        : c.kind === 'feature' ? await this._feature(c, isoRoot)
          : c.kind === 'store' ? await this._store(c)
            : c.special === 'store' ? await this._msStore()
              : await this._winget()
      this.onEvent?.({ type: 'finished', id, ...r })
      return r
    } catch (e) {
      const r = { ok: false, error: String(e?.message ?? e) }
      this.onEvent?.({ type: 'finished', id, ...r })
      return r
    } finally {
      this.busy = null
    }
  }

  async _elevated(script, minutes) {
    const r = await Elevation.runMarked(`${DHP}\n${script}`, minutes * 60000)
    return r.ok ? { ok: true, out: r.out } : { ok: false, error: restoreErrorText(r.error) || 'Falha' }
  }

  /** Features on Demand come from Windows Update: unlock it for the job, add, verify, put Windows Update back. */
  async _capability(c) {
    const r = await this._elevated(`${WU_UNLOCK_FUNCS}
$name = $null
try {
  Unlock-DhWu
  $cap = Get-WindowsCapability -Online | Where-Object { $_.Name -like (${psQuote(c.name)} + '~*') } | Select-Object -First 1
  if (-not $cap) { throw 'Este componente nao existe nesta versao do Windows.' }
  $name = $cap.Name
  if ($cap.State -ne 'Installed') { Add-WindowsCapability -Online -Name $name -ErrorAction Stop | Out-Null }
} finally { Restore-DhWu }
$after = (Get-WindowsCapability -Online -Name $name).State
if ($after -notin 'Installed', 'InstallPending') { throw ('Windows informou o estado ' + $after) }
Write-Output ('DHOK|' + $after)`, 45)
    return r.ok ? { ok: true, restartNeeded: /DHOK\|InstallPending/.test(r.out || '') } : r
  }

  /** Optional features: from the ISO's sources\\sxs when given (works offline), otherwise from Windows Update. */
  async _feature(c, isoRoot) {
    const sxs = isoRoot ? sxsFromRoot(isoRoot) : null
    if (sxs && !fs.existsSync(sxs)) return { ok: false, error: `Pasta ${sxs} não encontrada. Monte a ISO do Windows/DarkOS e escolha a unidade dela.` }
    const source = sxs ? ` -Source ${psQuote(sxs)} -LimitAccess` : ''
    const r = await this._elevated(`${WU_UNLOCK_FUNCS}${SERVICING_FUNCS}
try {
  ${sxs ? '' : 'Unlock-DhWu; Open-DhRepairSource'}
  ${c.parent ? `Enable-WindowsOptionalFeature -Online -FeatureName ${psQuote(c.parent)} -All -NoRestart${source} -ErrorAction Stop | Out-Null` : ''}
  $res = Enable-WindowsOptionalFeature -Online -FeatureName ${psQuote(c.name)} -All -NoRestart${source} -ErrorAction Stop
} finally { ${sxs ? '' : 'Close-DhRepairSource; Restore-DhWu'} }
$st = [string](Get-WindowsOptionalFeature -Online -FeatureName ${psQuote(c.name)}).State
if ($st -notmatch '^Enable') { throw ('Windows informou o estado ' + $st) }
Write-Output ('DHOK|' + $st + '|' + [bool]$res.RestartNeeded)`, 45)
    if (!r.ok) return r
    return { ok: true, restartNeeded: /\|True\s*$/m.test(r.out || '') || /EnablePending/.test(r.out || '') }
  }

  /** Store apps through winget's msstore source (no Store window), verified by the installed package. */
  async _store(c) {
    const has = await run('where.exe', ['winget'], 5000)
    if (has.code !== 0) return { ok: false, error: 'needs-winget' }
    const r = await run('winget', ['install', '--id', c.storeId, '--source', 'msstore', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity', '--silent'], 20 * 60000)
    const { data } = await runPowerShellJson(`@(Get-AppxPackage -Name ${psQuote(c.appx)} -ErrorAction SilentlyContinue).Count | ConvertTo-Json`, { timeoutMs: 30000, fallback: 0 })
    if (Number(data) > 0) return { ok: true }
    const tail = (r.stdout + r.stderr).trim().split(/\r?\n/).filter(Boolean).slice(-2).join(' ')
    return { ok: false, error: tail || `winget exit ${r.code}` }
  }

  /** The Microsoft Store: re-register it if the files are still there, otherwise reinstall with wsreset -i. */
  _msStore() {
    return this._elevated(`$pkg = Get-AppxPackage -AllUsers -Name Microsoft.WindowsStore | Select-Object -First 1
if ($pkg -and $pkg.InstallLocation -and (Test-Path (Join-Path $pkg.InstallLocation 'AppxManifest.xml'))) {
  Add-AppxPackage -DisableDevelopmentMode -Register (Join-Path $pkg.InstallLocation 'AppxManifest.xml') -ErrorAction SilentlyContinue
}
if (-not (Get-AppxPackage -Name Microsoft.WindowsStore)) {
  Start-Process -FilePath 'wsreset.exe' -ArgumentList '-i' -WindowStyle Hidden
  for ($i = 0; $i -lt 60 -and -not (Get-AppxPackage -Name Microsoft.WindowsStore); $i++) { Start-Sleep -Seconds 5 }
}
if (-not (Get-AppxPackage -Name Microsoft.WindowsStore)) { throw 'A Microsoft Store nao foi instalada (wsreset -i precisa do Windows 11 22H2 ou mais novo e de internet).' }
Write-Output 'DHOK|store'`, 10)
  }

  /** winget (App Installer) from Microsoft's GitHub release, pinned by SHA-256, with its framework dependencies. */
  async _winget() {
    const { downloadToFile, SYSTEM_TAR } = await import('../SecureDownload.js')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'darkhub-winget-'))
    try {
      const bundle = path.join(dir, 'AppInstaller.msixbundle')
      const deps = path.join(dir, 'deps.zip')
      this.onEvent?.({ type: 'progress', id: 'winget', stage: 'download' })
      await downloadToFile(WINGET_BUNDLE.bundle.url, bundle, { expectedSha256: WINGET_BUNDLE.bundle.sha256, maxBytes: 400 * 1024 * 1024, timeoutMs: 30 * 60000 })
      await downloadToFile(WINGET_BUNDLE.deps.url, deps, { expectedSha256: WINGET_BUNDLE.deps.sha256, maxBytes: 200 * 1024 * 1024, timeoutMs: 30 * 60000 })
      const out = path.join(dir, 'deps')
      fs.mkdirSync(out)
      const x = await run(SYSTEM_TAR, ['-xf', deps, '-C', out], 120000)
      if (x.code !== 0) return { ok: false, error: 'Falha ao extrair as dependências do winget' }
      this.onEvent?.({ type: 'progress', id: 'winget', stage: 'install' })
      return await this._elevated(`$deps = @(Get-ChildItem -LiteralPath ${psQuote(out)} -Recurse -Include *.appx, *.msix | Where-Object { $_.FullName -match '\\\\x64\\\\' } | ForEach-Object { $_.FullName })
Add-AppxPackage -Path ${psQuote(bundle)} -DependencyPath $deps -ForceApplicationShutdown -ErrorAction Stop
if (-not (Get-AppxPackage -Name Microsoft.DesktopAppInstaller)) { throw 'App Installer nao registrado' }
Write-Output 'DHOK|winget'`, 15)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
}
