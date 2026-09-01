import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs/promises'
import { globalShortcut } from 'electron'
import { spawn } from 'node:child_process'
import os from 'node:os'
import net from 'node:net'
import ElevationHelper from './services/optimizer/ElevationHelper.js'
import { CpuLoadTracker } from './services/CpuLoadTracker.js'
import ManagedProcessRegistry from './services/ManagedProcessRegistry.js'
import { encodePowerShellScript, powerShellArgsForEncodedScript } from './services/PowerShellRunner.js'
import nativeLatencyClient from './services/NativeLatencyClient.js'

const PROCESS_OWNER = 'latencyGuardian'

function now() {
  return Date.now()
}

function clampInt(v, min, max, fallback) {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(n)))
}

function stablePolicyName(prefix, exePath) {
  const h = crypto.createHash('sha1').update(String(exePath)).digest('hex').slice(0, 10)
  return `${prefix}-${h}`
}

function parsePingMs(output) {
  const s = String(output ?? '')
  const m = s.match(/time[=<]\s*(\d+)\s*ms/i)
  if (m) return Number(m[1])
  if (/time[=<]\s*<\s*1ms/i.test(s)) return 1
  return null
}

function psSingleQuote(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`
}

function encodedPowerShellArgs(script) {
  return powerShellArgsForEncodedScript(encodePowerShellScript(script))
}

function isSafePingHost(host) {
  return /^[A-Za-z0-9_.:-]{1,253}$/.test(String(host ?? '').trim())
}

export function registerLatencyGuardian(deps) {
  const {
    app,
    ipcMain,
    si,
    runCommand,
    runPowerShell,
    stripBom,
    getActiveAdapterName,
    getLibraryStore,
    BrowserWindow
  } = deps

  const broadcastEvent = (channel, payload) => {
    if (!BrowserWindow) return
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    })
  }

  const configPath = path.join(app.getPath('userData'), 'latency.json')

  let config = {
    enabled: false,
    auto: false,
    hotkey: 'Ctrl+F1',
    gameExePath: '',
    pingHost: '1.1.1.1',
    overlayEnabled: false,
    shieldEnabled: false,
    shieldDeltaMs: 30,
    shieldMinMs: 80,
    shieldBeep: false,
    smartCleanMinutes: 0,
    smartCleanDuringGaming: false,
    gpuPollingEnabled: false,
    tweaks: {
      powerPlanHigh: true,
      timerResolution05: false,
      processPriorityHigh: true,
      disableFullscreenOptimizations: false,
      disableMouseAcceleration: true,
      gpuHighPerformance: false,
      qosForExe: false,
      disableNagle: false,
      killBackground: false,
      dnsCloudflare: false
    }
  }

  let state = {
    ultraEnabled: false,
    lastError: null,
    appliedAt: null,
    game: null,
    undo: {}
  }

  let timers = {
    loop: null,
    ping: null,
    smartClean: null,
    gpu: null
  }

  let metrics = {
    ts: null,
    pingMs: null,
    cpuPct: null,
    ramPct: null,
    gpuPct: null
  }

  let timerResolutionProc = null
  let launchedGame = null

  async function loadConfig() {
    try {
      const raw = await fs.readFile(configPath, 'utf8')
      const parsed = JSON.parse(raw)
      config = {
        ...config,
        ...(parsed && typeof parsed === 'object' ? parsed : {})
      }
      normalizeConfig()
    } catch {}
  }

  function normalizeConfig() {
    if (typeof config.hotkey !== 'string') config.hotkey = 'Ctrl+F1'
    config.hotkey = config.hotkey.trim()
    if (typeof config.gameExePath !== 'string') config.gameExePath = ''
    if (typeof config.pingHost !== 'string') config.pingHost = '1.1.1.1'
    config.pingHost = config.pingHost.trim() || '1.1.1.1'
    config.overlayEnabled = Boolean(config.overlayEnabled)
    config.shieldEnabled = Boolean(config.shieldEnabled)
    config.shieldBeep = Boolean(config.shieldBeep)
    config.shieldDeltaMs = clampInt(config.shieldDeltaMs, 5, 300, 30)
    config.shieldMinMs = clampInt(config.shieldMinMs, 10, 500, 80)
    config.smartCleanMinutes = clampInt(config.smartCleanMinutes, 0, 240, 0)
    config.smartCleanDuringGaming = Boolean(config.smartCleanDuringGaming)
    config.gpuPollingEnabled = Boolean(config.gpuPollingEnabled)

    const baseTweaks =
      config?.tweaks && typeof config.tweaks === 'object'
        ? config.tweaks
        : {
            powerPlanHigh: true,
            timerResolution05: false,
            processPriorityHigh: true,
            disableFullscreenOptimizations: false,
            disableMouseAcceleration: true,
            gpuHighPerformance: false,
            qosForExe: false,
            disableNagle: false,
            killBackground: false,
            dnsCloudflare: false
          }
    config.tweaks = {
      powerPlanHigh: baseTweaks.powerPlanHigh !== false,
      timerResolution05: baseTweaks.timerResolution05 !== false,
      processPriorityHigh: baseTweaks.processPriorityHigh !== false,
      disableFullscreenOptimizations: Boolean(baseTweaks.disableFullscreenOptimizations),
      disableMouseAcceleration: baseTweaks.disableMouseAcceleration !== false,
      gpuHighPerformance: Boolean(baseTweaks.gpuHighPerformance),
      qosForExe: Boolean(baseTweaks.qosForExe),
      disableNagle: Boolean(baseTweaks.disableNagle),
      killBackground: Boolean(baseTweaks.killBackground),
      dnsCloudflare: Boolean(baseTweaks.dnsCloudflare)
    }
  }

  async function saveConfig() {
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8')
  }

  let processSnapshotCache = { ts: 0, list: [] }
  const PROCESS_SNAPSHOT_TTL_MS = 1200

  async function getProcessSnapshot() {
    const nowTs = Date.now()
    if (nowTs - processSnapshotCache.ts < PROCESS_SNAPSHOT_TTL_MS) {
      return processSnapshotCache.list
    }
    const proc = await si.processes()
    const list = Array.isArray(proc?.list) ? proc.list : []
    processSnapshotCache = { ts: nowTs, list }
    return list
  }

  async function findGameProcess() {

    const exe = String(config.gameExePath ?? '').trim()
    if (!exe) return null

    const list = await getProcessSnapshot()
    const normalized = exe.toLowerCase()
    const exeName = path.basename(normalized)
    const hit =
      list.find((p) => typeof p?.path === 'string' && p.path.toLowerCase() === normalized) ||
      list.find((p) => typeof p?.path === 'string' && path.basename(p.path.toLowerCase()) === exeName) ||
      list.find((p) => typeof p?.name === 'string' && String(p.name).toLowerCase() === exeName)
    if (!hit) return null
    return { pid: hit.pid, name: hit.name, path: hit.path }
  }

  async function setPowerPlanHighPerformance() {

    const { code, stdout, stderr } = await runCommand('powercfg', ['/getactivescheme'], { timeoutMs: 15000 })
    if (code !== 0) throw new Error(stderr || `powercfg exited with code ${code}`)
    const prev = String(stdout ?? '').trim()
    await runCommand('powercfg', ['/setactive', 'SCHEME_MIN'], { timeoutMs: 15000 })

    const check = await runCommand('powercfg', ['/getactivescheme'], { timeoutMs: 15000 }).catch(() => null)
    const verified = /SCHEME_MIN|8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c/i.test(String(check?.stdout ?? ''))
    return { prev, verified }
  }

  async function restorePowerPlan(prev) {
    const m = String(prev ?? '').match(/([0-9a-fA-F-]{36})/)
    if (!m) return
    await runCommand('powercfg', ['/setactive', m[1]], { timeoutMs: 15000 })
  }

  async function startTimerResolution05ms() {

    try {
      const res = await nativeLatencyClient.lockTimer(5000)
      if (res && res.locked) {
        state.timerResolutionInfo = res
        return
      }
    } catch {}

    if (timerResolutionProc) return
    const ps = `
      $ErrorActionPreference='Stop'
      Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class NtTimer {
  [DllImport("ntdll.dll")] public static extern int NtSetTimerResolution(uint Desired, bool Set, out uint Current);
}
"@
      $cur=0
      [void][NtTimer]::NtSetTimerResolution(5000, $true, [ref]$cur)
      while($true){ Start-Sleep -Milliseconds 2000 }
    `
    timerResolutionProc = spawn('powershell.exe', encodedPowerShellArgs(ps), { windowsHide: true })
    timerResolutionProc.on('exit', () => {
      timerResolutionProc = null
    })
  }

  async function stopTimerResolution() {
    try {
      await nativeLatencyClient.unlockTimer()
    } catch {}
    if (!timerResolutionProc) return
    try {
      timerResolutionProc.kill()
    } catch {}
    timerResolutionProc = null
  }

  async function setGamePriorityHigh(pid) {

    try {
      const res = await nativeLatencyClient.boostProcess(pid, { priority: 'high', pCoresOnly: true })
      if (res && res.priority_ok) return res
    } catch {}

    const ps = `
      $ErrorActionPreference='Stop'
      $p = Get-Process -Id ${Number(pid)} -ErrorAction Stop
      $p.PriorityClass = 'High'
    `
    const { code, stderr } = await runPowerShell(ps, { timeoutMs: 8000 })
    if (code !== 0) throw new Error(stderr || 'Falha ao definir prioridade do jogo')
  }

  async function setDisableFullscreenOptimizations(exePath) {

    const key = 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers'
    const name = psSingleQuote(exePath)
    const psRead = `
      $ErrorActionPreference='SilentlyContinue'
      $k='${key}'
      $n=${name}
      $item = Get-ItemProperty -Path "Registry::$k" -Name $n -ErrorAction SilentlyContinue
      $v = if ($null -eq $item) { $null } else { $item.PSObject.Properties[$n].Value }
      if ($null -eq $v) { '' } else { $v }
    `
    const { code: c1, stdout: o1 } = await runPowerShell(psRead, { timeoutMs: 8000 })
    const prev = c1 === 0 ? String(stripBom(o1)).trim() : ''

    const psWrite = `
      $ErrorActionPreference='Stop'
      New-Item -Path "Registry::${key}" -Force | Out-Null
      Set-ItemProperty -Path "Registry::${key}" -Name ${name} -Value '~ DISABLEDXMAXIMIZEDWINDOWEDMODE' -Force
    `
    const { code: c2, stderr: e2 } = await runPowerShell(psWrite, { timeoutMs: 8000 })
    if (c2 !== 0) throw new Error(e2 || 'Falha ao desativar Fullscreen Optimizations')
    return { prev }
  }

  async function restoreFullscreenOptimizations(exePath, prev) {
    const key = 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers'
    const p = String(prev ?? '').trim()
    if (!p) {
      const psDel = `
        $ErrorActionPreference='SilentlyContinue'
        Remove-ItemProperty -Path "Registry::${key}" -Name ${psSingleQuote(exePath)} -ErrorAction SilentlyContinue
      `
      await runPowerShell(psDel, { timeoutMs: 8000 })
      return
    }
    const psWrite = `
      $ErrorActionPreference='Stop'
      New-Item -Path "Registry::${key}" -Force | Out-Null
      Set-ItemProperty -Path "Registry::${key}" -Name ${psSingleQuote(exePath)} -Value ${psSingleQuote(p)} -Force
    `
    await runPowerShell(psWrite, { timeoutMs: 8000 })
  }

  async function setMouseAccelerationDisabled() {

    const key = 'HKCU\\Control Panel\\Mouse'
    const psRead = `
      $ErrorActionPreference='SilentlyContinue'
      $p = Get-ItemProperty -Path "Registry::${key}" -ErrorAction SilentlyContinue
      [PSCustomObject]@{
        MouseSpeed = $p.MouseSpeed
        MouseThreshold1 = $p.MouseThreshold1
        MouseThreshold2 = $p.MouseThreshold2
      } | ConvertTo-Json -Compress
    `
    const { code: c1, stdout: o1 } = await runPowerShell(psRead, { timeoutMs: 8000 })
    const prev = c1 === 0 ? JSON.parse(stripBom(o1).trim() || '{}') : {}

    const psWrite = `
      $ErrorActionPreference='Stop'
      Set-ItemProperty -Path "Registry::${key}" -Name 'MouseSpeed' -Value '0' -Force
      Set-ItemProperty -Path "Registry::${key}" -Name 'MouseThreshold1' -Value '0' -Force
      Set-ItemProperty -Path "Registry::${key}" -Name 'MouseThreshold2' -Value '0' -Force
      rundll32.exe user32.dll,UpdatePerUserSystemParameters
    `
    const { code: c2, stderr: e2 } = await runPowerShell(psWrite, { timeoutMs: 8000 })
    if (c2 !== 0) throw new Error(e2 || 'Falha ao desativar aceleração do mouse')
    return { prev }
  }

  async function restoreMouseAcceleration(prev) {
    const key = 'HKCU\\Control Panel\\Mouse'
    const ms = prev?.MouseSpeed ?? '1'
    const t1 = prev?.MouseThreshold1 ?? '6'
    const t2 = prev?.MouseThreshold2 ?? '10'
    const ps = `
      $ErrorActionPreference='Stop'
      Set-ItemProperty -Path "Registry::${key}" -Name 'MouseSpeed' -Value ${psSingleQuote(ms)} -Force
      Set-ItemProperty -Path "Registry::${key}" -Name 'MouseThreshold1' -Value ${psSingleQuote(t1)} -Force
      Set-ItemProperty -Path "Registry::${key}" -Name 'MouseThreshold2' -Value ${psSingleQuote(t2)} -Force
      rundll32.exe user32.dll,UpdatePerUserSystemParameters
    `
    await runPowerShell(ps, { timeoutMs: 8000 })
  }

  async function setGpuHighPerformancePreference(exePath) {

    const key = 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences'
    const name = String(exePath)
    const psName = psSingleQuote(name)
    const psRead = `
      $ErrorActionPreference='SilentlyContinue'
      $n = ${psName}
      $p = (Get-ItemProperty -Path "Registry::${key}" -Name $n -ErrorAction SilentlyContinue)
      if ($null -eq $p) { '' } else { $p.PSObject.Properties[$n].Value }
    `
    const { code: c1, stdout: o1 } = await runPowerShell(psRead, { timeoutMs: 8000 })
    const prev = c1 === 0 ? String(stripBom(o1)).trim() : ''

    const psWrite = `
      $ErrorActionPreference='Stop'
      New-Item -Path "Registry::${key}" -Force | Out-Null
      Set-ItemProperty -Path "Registry::${key}" -Name ${psName} -Value 'GpuPreference=2;' -Force
    `
    const { code: c2, stderr: e2 } = await runPowerShell(psWrite, { timeoutMs: 8000 })
    if (c2 !== 0) throw new Error(e2 || 'Falha ao forçar GPU em High Performance')
    return { prev }
  }

  async function restoreGpuPreference(exePath, prev) {
    const key = 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences'
    const p = String(prev ?? '').trim()
    if (!p) {
      const psDel = `
        $ErrorActionPreference='SilentlyContinue'
        Remove-ItemProperty -Path "Registry::${key}" -Name ${psSingleQuote(exePath)} -ErrorAction SilentlyContinue
      `
      await runPowerShell(psDel, { timeoutMs: 8000 })
      return
    }
    const psWrite = `
      $ErrorActionPreference='Stop'
      New-Item -Path "Registry::${key}" -Force | Out-Null
      Set-ItemProperty -Path "Registry::${key}" -Name ${psSingleQuote(exePath)} -Value ${psSingleQuote(p)} -Force
    `
    await runPowerShell(psWrite, { timeoutMs: 8000 })
  }

  async function applyDnsCloudflareWithUndo() {

    const adapter = await getActiveAdapterName()
    if (!adapter) throw new Error('Active network adapter not found')
    const psRead = `
      $ErrorActionPreference='Stop'
      $a=${psSingleQuote(adapter)}
      $s = Get-DnsClientServerAddress -InterfaceAlias $a -AddressFamily IPv4
      [PSCustomObject]@{ adapter=$a; servers=@($s.ServerAddresses) } | ConvertTo-Json -Compress
    `
    const { code: c1, stdout: o1, stderr: e1 } = await runPowerShell(psRead, { timeoutMs: 12000 })
    if (c1 !== 0) throw new Error(e1 || 'Failed to read DNS servers')
    const before = JSON.parse(stripBom(o1).trim() || '{}')
    const prev = Array.isArray(before?.servers) ? before.servers : []

    const psApply = `
      $ErrorActionPreference='Stop'
      $a=${psSingleQuote(adapter)}
      Set-DnsClientServerAddress -InterfaceAlias $a -ServerAddresses @('1.1.1.1','1.0.0.1')
    `
    const { code: c2, stderr: e2 } = await runPowerShell(psApply, { timeoutMs: 12000 })
    if (c2 !== 0) throw new Error(e2 || 'Failed to apply DNS servers')
    await runCommand('ipconfig', ['/flushdns'], { timeoutMs: 8000 }).catch(() => {})

    const psVerify = `
      $ErrorActionPreference='SilentlyContinue'
      $a=${psSingleQuote(adapter)}
      (Get-DnsClientServerAddress -InterfaceAlias $a -AddressFamily IPv4).ServerAddresses -join ','
    `
    const verifyRes = await runPowerShell(psVerify, { timeoutMs: 8000 })
    const currentServers = String(stripBom(verifyRes.stdout ?? '')).trim()
    const verified = currentServers.includes('1.1.1.1')

    return { adapter, prev, verified }
  }

  async function restoreDns(adapter, prevServers) {
    const prev = Array.isArray(prevServers) ? prevServers : []
    if (prev.length === 0) {
      const ps = `
        $ErrorActionPreference='Stop'
        $a=${psSingleQuote(adapter)}
        Set-DnsClientServerAddress -InterfaceAlias $a -ResetServerAddresses
      `
      await runPowerShell(ps, { timeoutMs: 12000 })
      return
    }
    const safeServers = prev.map(psSingleQuote).join(',')
    const ps = `
      $ErrorActionPreference='Stop'
      $a=${psSingleQuote(adapter)}
      Set-DnsClientServerAddress -InterfaceAlias $a -ServerAddresses @(${safeServers})
    `
    await runPowerShell(ps, { timeoutMs: 12000 })
  }

  async function setQosForExe(exePath) {

    const name = stablePolicyName('DarkHub-ULLM', exePath)
    const ps = `
      $ErrorActionPreference='Stop'
      $name=${psSingleQuote(name)}
      $app=${psSingleQuote(exePath)}
      $existing = Get-NetQosPolicy -Name $name -ErrorAction SilentlyContinue
      if ($null -eq $existing) {
        New-NetQosPolicy -Name $name -AppPathNameMatchCondition $app -DSCPAction 46 -NetworkProfile All | Out-Null
      }
      $name
    `
    const { code, stdout, stderr } = await ElevationHelper.runElevatedPowerShell(ps, { timeoutMs: 20000 })
    if (code !== 0) throw new Error(stderr || 'Falha ao aplicar QoS (requer Admin)')

    const verify = await runPowerShell(
      `(Get-NetQosPolicy -Name ${psSingleQuote(name)} -ErrorAction SilentlyContinue) -ne $null`,
      { timeoutMs: 8000 }
    )
    const verified = String(stripBom(verify.stdout) ?? '').trim().toLowerCase() === 'true'
    return { policyName: String(stripBom(stdout)).trim() || name, verified }
  }

  async function removeQosPolicy(policyName) {
    const ps = `
      $ErrorActionPreference='SilentlyContinue'
      Remove-NetQosPolicy -Name ${psSingleQuote(policyName)} -Confirm:$false -ErrorAction SilentlyContinue
    `
    await ElevationHelper.runElevatedPowerShell(ps, { timeoutMs: 15000 })
  }

  async function setNagleDisabledOnActiveInterface() {

    const psRead = `
      $ErrorActionPreference='Stop'
      $a = Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' } | Sort-Object -Property LinkSpeed -Descending | Select-Object -First 1
      if ($null -eq $a) { throw 'Active network adapter not found' }
      $guid = (Get-NetAdapter -Name $a.Name).InterfaceGuid.ToString()
      $k = "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\{$guid}"
      [PSCustomObject]@{
        key = $k
        TcpAckFrequency = (Get-ItemProperty -Path $k -Name TcpAckFrequency -ErrorAction SilentlyContinue).TcpAckFrequency
        TCPNoDelay = (Get-ItemProperty -Path $k -Name TCPNoDelay -ErrorAction SilentlyContinue).TCPNoDelay
        TcpDelAckTicks = (Get-ItemProperty -Path $k -Name TcpDelAckTicks -ErrorAction SilentlyContinue).TcpDelAckTicks
      } | ConvertTo-Json -Compress
    `
    const readRes = await runPowerShell(psRead, { timeoutMs: 12000 })
    if (readRes.code !== 0) throw new Error(readRes.stderr || 'Falha ao localizar adaptador de rede ativo')
    const prev = JSON.parse(stripBom(readRes.stdout).trim() || '{}')
    const key = prev?.key
    if (!key) throw new Error('Falha ao localizar chave de registro do adaptador')

    const psWrite = `
      $ErrorActionPreference='Stop'
      $k = ${psSingleQuote(key)}
      New-Item -Path $k -Force | Out-Null
      Set-ItemProperty -Path $k -Name TcpAckFrequency -Type DWord -Value 1 -Force
      Set-ItemProperty -Path $k -Name TCPNoDelay -Type DWord -Value 1 -Force
      Set-ItemProperty -Path $k -Name TcpDelAckTicks -Type DWord -Value 0 -Force
    `
    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(psWrite, { timeoutMs: 15000 })
    if (code !== 0) throw new Error(stderr || 'Falha ao desativar Nagle (requer Admin)')

    const psVerify = `
      $ErrorActionPreference='SilentlyContinue'
      $k = ${psSingleQuote(key)}
      [PSCustomObject]@{
        TcpAckFrequency = (Get-ItemProperty -Path $k -Name TcpAckFrequency -ErrorAction SilentlyContinue).TcpAckFrequency
        TCPNoDelay = (Get-ItemProperty -Path $k -Name TCPNoDelay -ErrorAction SilentlyContinue).TCPNoDelay
      } | ConvertTo-Json -Compress
    `
    const verifyRes = await runPowerShell(psVerify, { timeoutMs: 8000 })
    const after = verifyRes.code === 0 ? JSON.parse(stripBom(verifyRes.stdout).trim() || '{}') : {}
    const verified = Number(after?.TcpAckFrequency) === 1 && Number(after?.TCPNoDelay) === 1

    return { ...prev, verified }
  }

  async function restoreNagle(prev) {
    const key = prev?.key
    if (!key) return
    const names = ['TcpAckFrequency', 'TCPNoDelay', 'TcpDelAckTicks']
    const psParts = [`$ErrorActionPreference='SilentlyContinue'`]
    for (const n of names) {
      const v = prev?.[n]
      if (v === undefined || v === null || v === '') {
        psParts.push(`Remove-ItemProperty -Path ${psSingleQuote(key)} -Name ${psSingleQuote(n)} -ErrorAction SilentlyContinue`)
      } else {
        psParts.push(`Set-ItemProperty -Path ${psSingleQuote(key)} -Name ${psSingleQuote(n)} -Type DWord -Value ${Number(v)} -Force`)
      }
    }
    await ElevationHelper.runElevatedPowerShell(psParts.join('\n'), { timeoutMs: 15000 })
  }

  async function optimizeGlobalTcpStack() {
    const ps = `
      $ErrorActionPreference='SilentlyContinue'
      netsh int tcp set global timestamps=disabled | Out-Null
      netsh int tcp set global ecncapability=disabled | Out-Null
      netsh int tcp set global rss=enabled | Out-Null
      netsh int tcp set global rsc=disabled | Out-Null
      netsh int tcp set global maxsynretransmissions=2 | Out-Null
      netsh int tcp set global fastopen=enabled | Out-Null
    `
    await runPowerShell(ps, { timeoutMs: 10000 })
    return { optimized: true }
  }

  async function restoreGlobalTcpStack() {
    const ps = `
      $ErrorActionPreference='SilentlyContinue'
      netsh int tcp set global timestamps=default | Out-Null
      netsh int tcp set global ecncapability=default | Out-Null
      netsh int tcp set global maxsynretransmissions=default | Out-Null
      netsh int tcp set global fastopen=default | Out-Null
    `
    await runPowerShell(ps, { timeoutMs: 10000 })
  }

  async function killBackgroundProcesses() {

    const names = ['OneDrive', 'GameBar', 'XboxAppServices', 'SearchApp', 'Cortana']
    const ps = `
      $ErrorActionPreference='SilentlyContinue'
      $killed=@()
      ${names.map((n) => `Get-Process -Name '${n}' -ErrorAction SilentlyContinue | ForEach-Object { try { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue; $killed += $_.Name } catch {} }`).join('\n')}
      $killed | ConvertTo-Json -Compress
    `
    const { code, stdout } = await runPowerShell(ps, { timeoutMs: 12000 })
    if (code !== 0) return { killed: [] }
    const parsed = JSON.parse(stripBom(stdout).trim() || '[]')
    return { killed: Array.isArray(parsed) ? parsed : [] }
  }

  async function ultraEnable(manual = false) {

    if (process.platform !== 'win32') throw new Error('Only supported on Windows')
    if (state.ultraEnabled) return { ok: true, status: state }

    state.lastError = null
    state.undo = {}
    state.game = null

    const game = await findGameProcess()
    if (game) state.game = game

    const exePath = game?.path || String(config.gameExePath || '').trim()
    if (!exePath) throw new Error('Selecione o executável do jogo')

    normalizeConfig()
    const overrides = arguments.length >= 2 && arguments[1] && typeof arguments[1] === 'object' ? arguments[1] : null
    const effectiveTweaks = overrides?.tweaks && typeof overrides.tweaks === 'object' ? overrides.tweaks : config.tweaks || {}
    const applied = {}
    const setApplied = (key, status, error) => {
      applied[key] = { status, ...(error ? { error } : {}) }
    }

    try {
      const p = String(exePath).trim()
      if (p) await fs.access(p)
    } catch (e) {
      throw new Error('Executável inválido ou inacessível')
    }

    const tweaks = effectiveTweaks
    const tPower = Boolean(tweaks.powerPlanHigh)
    const tTimer = Boolean(tweaks.timerResolution05)
    const tPrio = Boolean(tweaks.processPriorityHigh)
    const tFso = Boolean(tweaks.disableFullscreenOptimizations)
    const tMouse = Boolean(tweaks.disableMouseAcceleration)
    const tGpu = Boolean(tweaks.gpuHighPerformance)
    const tQos = Boolean(tweaks.qosForExe)
    const tNagle = Boolean(tweaks.disableNagle)
    const tBg = Boolean(tweaks.killBackground)
    const tDns = Boolean(tweaks.dnsCloudflare)

    if (tPower) {
      try {
        state.undo.powerPlan = await setPowerPlanHighPerformance()
        setApplied('powerPlanHigh', state.undo.powerPlan.verified === false ? 'unverified' : 'ok')
      } catch (e) {
        state.undo.powerPlan = { error: String(e?.message ?? e) }
        setApplied('powerPlanHigh', 'failed', String(e?.message ?? e))
      }
    } else setApplied('powerPlanHigh', 'skipped')

    if (tTimer) {
      try {
        await startTimerResolution05ms()
        state.undo.timerResolution = { enabled: true }
        setApplied('timerResolution05', 'ok')
      } catch (e) {
        state.undo.timerResolution = { error: String(e?.message ?? e) }
        setApplied('timerResolution05', 'failed', String(e?.message ?? e))
      }
    } else setApplied('timerResolution05', 'skipped')

    if (tFso) {
      try {
        state.undo.fullscreen = await setDisableFullscreenOptimizations(exePath)
        setApplied('disableFullscreenOptimizations', 'ok')
      } catch (e) {
        state.undo.fullscreen = { error: String(e?.message ?? e) }
        setApplied('disableFullscreenOptimizations', 'failed', String(e?.message ?? e))
      }
    } else setApplied('disableFullscreenOptimizations', 'skipped')

    if (tMouse) {
      try {
        state.undo.mouseAccel = await setMouseAccelerationDisabled()
        setApplied('disableMouseAcceleration', 'ok')
      } catch (e) {
        state.undo.mouseAccel = { error: String(e?.message ?? e) }
        setApplied('disableMouseAcceleration', 'failed', String(e?.message ?? e))
      }
    } else setApplied('disableMouseAcceleration', 'skipped')

    if (tGpu) {
      try {
        state.undo.gpuPref = await setGpuHighPerformancePreference(exePath)
        setApplied('gpuHighPerformance', 'ok')
      } catch (e) {
        state.undo.gpuPref = { error: String(e?.message ?? e) }
        setApplied('gpuHighPerformance', 'failed', String(e?.message ?? e))
      }
    } else setApplied('gpuHighPerformance', 'skipped')

    if (tQos) {
      try {
        state.undo.qos = await setQosForExe(exePath)
        setApplied('qosForExe', state.undo.qos.verified === false ? 'unverified' : 'ok')
      } catch (e) {
        state.undo.qos = { error: String(e?.message ?? e) }
        setApplied('qosForExe', 'failed', String(e?.message ?? e))
      }
    } else setApplied('qosForExe', 'skipped')

    if (tNagle) {
      try {
        state.undo.nagle = await setNagleDisabledOnActiveInterface()
        setApplied('disableNagle', state.undo.nagle.verified === false ? 'unverified' : 'ok')
      } catch (e) {
        state.undo.nagle = { error: String(e?.message ?? e) }
        setApplied('disableNagle', 'failed', String(e?.message ?? e))
      }
    } else setApplied('disableNagle', 'skipped')

    if (tDns) {
      try {
        state.undo.dns = await applyDnsCloudflareWithUndo()
        setApplied('dnsCloudflare', state.undo.dns.verified === false ? 'unverified' : 'ok')
      } catch (e) {
        state.undo.dns = { error: String(e?.message ?? e) }
        setApplied('dnsCloudflare', 'failed', String(e?.message ?? e))
      }
    } else setApplied('dnsCloudflare', 'skipped')

    try {
      state.undo.tcpStack = await optimizeGlobalTcpStack()
      setApplied('tcpStack', 'ok')
    } catch (e) {
      setApplied('tcpStack', 'failed', String(e?.message ?? e))
    }

    if (tBg) {
      try {
        state.undo.bg = await killBackgroundProcesses()
        setApplied('killBackground', 'ok')
      } catch (e) {
        state.undo.bg = { error: String(e?.message ?? e) }
        setApplied('killBackground', 'failed', String(e?.message ?? e))
      }
    } else setApplied('killBackground', 'skipped')

    if (tPrio && game?.pid) {
      try {
        await setGamePriorityHigh(game.pid)

        ManagedProcessRegistry.claim(game.pid, PROCESS_OWNER)
        setApplied('processPriorityHigh', 'ok')
      } catch (e) {
        state.undo.priority = { error: String(e?.message ?? e) }
        setApplied('processPriorityHigh', 'failed', String(e?.message ?? e))
      }
    } else if (tPrio) {
      setApplied('processPriorityHigh', 'skipped', 'Jogo não detectado em execução')
    } else setApplied('processPriorityHigh', 'skipped')

    state.ultraEnabled = true
    state.appliedAt = now()
    config.enabled = true
    if (manual) config.auto = false
    state.lastApplied = applied
    await saveConfig().catch(() => {})
    return { ok: true, status: state, applied }
  }

  async function ultraDisable() {

    if (!state.ultraEnabled) return { ok: true, status: state }
    const exePath = String(config.gameExePath || '').trim()

    try {
      await restorePowerPlan(state.undo?.powerPlan?.prev)
    } catch {}

    try {
      await stopTimerResolution()
    } catch {}

    try {
      if (exePath) await restoreFullscreenOptimizations(exePath, state.undo?.fullscreen?.prev)
    } catch {}

    try {
      if (state.undo?.mouseAccel?.prev) await restoreMouseAcceleration(state.undo.mouseAccel.prev)
    } catch {}

    try {
      if (exePath) await restoreGpuPreference(exePath, state.undo?.gpuPref?.prev)
    } catch {}

    try {
      if (state.undo?.qos?.policyName) await removeQosPolicy(state.undo.qos.policyName)
    } catch {}

    try {
      if (state.undo?.nagle?.key) await restoreNagle(state.undo.nagle)
    } catch {}

    try {
      if (state.undo?.dns?.adapter) await restoreDns(state.undo.dns.adapter, state.undo.dns.prev)
    } catch {}

    try {
      if (state.undo?.tcpStack?.optimized) await restoreGlobalTcpStack()
    } catch {}

    ManagedProcessRegistry.releaseAllBy(PROCESS_OWNER)

    state.ultraEnabled = false
    state.appliedAt = null
    state.game = null
    config.enabled = false
    await saveConfig().catch(() => {})
    return { ok: true, status: state }
  }

  function unregisterHotkey() {
    try {
      if (config.hotkey) globalShortcut.unregister(config.hotkey)
    } catch {}
  }

  function registerHotkey() {

    unregisterHotkey()
    const hk = String(config.hotkey ?? '').trim()
    if (!hk) return { ok: true, enabled: false }
    const ok = globalShortcut.register(hk, async () => {
      try {
        if (state.ultraEnabled) await ultraDisable()
        else await ultraEnable(false)
      } catch {}
    })
    if (!ok) return { ok: false, error: 'Falha ao registrar hotkey (atalho inválido ou em uso).' }
    return { ok: true, enabled: true, hotkey: hk }
  }

  const cpuLoadTracker = new CpuLoadTracker()

  async function updateMetricsFast() {
    const ts = now()
    const totalRam = os.totalmem()
    const freeRam = os.freemem()
    const cpuLoad = cpuLoadTracker.sample()
    metrics.ts = ts
    if (cpuLoad !== null) metrics.cpuPct = cpuLoad
    metrics.ramPct = totalRam ? ((totalRam - freeRam) / totalRam) * 100 : null
  }

  async function updateGpuUsage() {
    if (process.platform !== 'win32') return
    if (!config.gpuPollingEnabled) {
      metrics.gpuPct = null
      return
    }
    try {
      const ps = `
        $ErrorActionPreference='Stop'
        $c = Get-Counter -Counter '\\\\GPU Engine(*engtype_3D*)\\\\Utilization Percentage' -ErrorAction Stop
        $vals = @($c.CounterSamples | ForEach-Object { [double]$_.CookedValue } | Where-Object { $_ -ge 0 })
        if ($vals.Count -eq 0) { '' } else { ($vals | Measure-Object -Average).Average }
      `
      const { code, stdout } = await runPowerShell(ps, { timeoutMs: 12000 })
      if (code === 0) {
        const n = Number(String(stripBom(stdout)).trim())
        if (Number.isFinite(n)) metrics.gpuPct = Math.max(0, Math.min(100, n))
      }
    } catch {}
  }

  async function updatePing() {
    if (process.platform !== 'win32') return
    const host = String(config.pingHost ?? '1.1.1.1').trim() || '1.1.1.1'
    if (!isSafePingHost(host)) {
      metrics.pingMs = null
      state.lastError = 'Host de ping invalido'
      return
    }

    try {
      const nativeRes = await nativeLatencyClient.pingNative(host, 1200)
      if (nativeRes && typeof nativeRes.latency_ms === 'number') {
        metrics.pingMs = nativeRes.latency_ms
        return
      }
    } catch {}

    await new Promise((resolve) => {
      const start = Date.now()
      const socket = new net.Socket()
      socket.setTimeout(1000)

      const finish = (ms) => {
        socket.destroy()
        metrics.pingMs = ms
        resolve()
      }

      socket.on('connect', () => finish(Math.min(Date.now() - start, 300)))
      socket.on('timeout', () => finish(null))
      socket.on('error', () => finish(null))
      socket.connect(53, host)
    })
  }

  async function smartCleanRam(excludePid) {
    if (process.platform !== 'win32') return
    const ex = Number(excludePid)
    const exPid = Number.isFinite(ex) && ex > 0 ? Math.trunc(ex) : -1

    try {
      const cleanRes = await nativeLatencyClient.cleanRam(exPid)
      if (cleanRes && cleanRes.processes_cleaned !== undefined) return cleanRes
    } catch {}

    const ps = `
      $ErrorActionPreference='SilentlyContinue'
      Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Psapi {
  [DllImport("psapi.dll")] public static extern int EmptyWorkingSet(IntPtr hProcess);
}
"@
      $excludePid = ${exPid}
      $critical = @('System','Idle','Registry','smss','csrss','wininit','winlogon','services','lsass','dwm','audiodg')
      Get-Process | Where-Object {
        $_.Id -ne $excludePid -and
        $_.ProcessName -notin $critical -and
        $_.WorkingSet64 -ge 300MB
      } | ForEach-Object {
        try { [Psapi]::EmptyWorkingSet($_.Handle) | Out-Null } catch {}
      }
    `
    await runPowerShell(ps, { timeoutMs: 45000 })
  }

  async function loop() {
    try {
      await updateMetricsFast()
    } catch {}

    if (config.auto && !state.ultraEnabled) {
      try {
        const game = await findGameProcess()
        if (game) await ultraEnable(false)
      } catch (e) {
        state.lastError = String(e?.message ?? e)
      }
    }

    if (config.auto && state.ultraEnabled) {
      try {
        const game = await findGameProcess()
        if (!game) await ultraDisable()
      } catch {}
    }
  }

  function start() {
    if (timers.loop) return
    timers.loop = setInterval(loop, 1500)
    timers.ping = setInterval(updatePing, 5000)
    if (clampInt(config.smartCleanMinutes, 0, 240, 0) > 0) {
      timers.smartClean = setInterval(() => {
        if (state.ultraEnabled && !config.smartCleanDuringGaming) return
        smartCleanRam(state.game?.pid).catch(() => {})
      }, clampInt(config.smartCleanMinutes, 1, 240, 10) * 60_000)
    }
    if (config.gpuPollingEnabled) {
      updateGpuUsage().catch(() => {})
      timers.gpu = setInterval(() => updateGpuUsage().catch(() => {}), 15000)
    } else {
      metrics.gpuPct = null
    }
  }

  async function stop() {
    try {
      if (state.ultraEnabled) await ultraDisable()
    } catch {}
    for (const k of Object.keys(timers)) {
      const t = timers[k]
      if (t) clearInterval(t)
      timers[k] = null
    }
    unregisterHotkey()
    stopTimerResolution()
  }

  ipcMain.handle('latency:getConfig', async () => {
    let timerRes = null
    try {
      timerRes = await nativeLatencyClient.queryTimer()
    } catch {}
    return { ok: true, config, status: { ...state, timerResolutionInfo: timerRes || state.timerResolutionInfo }, metrics }
  })

  ipcMain.handle('latency:queryTimer', async () => {
    try {
      const res = await nativeLatencyClient.queryTimer()
      return { ok: true, data: res }
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) }
    }
  })

  ipcMain.handle('latency:getCpuTopology', async () => {
    try {
      const res = await nativeLatencyClient.getCpuTopology()
      return { ok: true, data: res }
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) }
    }
  })

  ipcMain.handle('latency:setConfig', async (_event, payload) => {
    const prevGpu = Boolean(config.gpuPollingEnabled)
    const prevSmart = clampInt(config.smartCleanMinutes, 0, 240, 0)
    config = {
      ...config,
      ...(payload && typeof payload === 'object' ? payload : {})
    }
    normalizeConfig()
    const res = registerHotkey()

    if (timers.loop) {
      const nextSmart = clampInt(config.smartCleanMinutes, 0, 240, 0)
      if (nextSmart <= 0) {
        if (timers.smartClean) clearInterval(timers.smartClean)
        timers.smartClean = null
      } else if (!timers.smartClean || nextSmart !== prevSmart) {
        if (timers.smartClean) clearInterval(timers.smartClean)
        timers.smartClean = setInterval(() => {
          if (state.ultraEnabled && !config.smartCleanDuringGaming) return
          smartCleanRam(state.game?.pid).catch(() => {})
        }, clampInt(config.smartCleanMinutes, 1, 240, 10) * 60_000)
      }

      const nextGpu = Boolean(config.gpuPollingEnabled)
      if (!nextGpu) {
        if (timers.gpu) clearInterval(timers.gpu)
        timers.gpu = null
        metrics.gpuPct = null
      } else if (!timers.gpu || nextGpu !== prevGpu) {
        if (timers.gpu) clearInterval(timers.gpu)
        updateGpuUsage().catch(() => {})
        timers.gpu = setInterval(() => updateGpuUsage().catch(() => {}), 15000)
      }
    }
    await saveConfig().catch(() => {})
    return { ok: true, config, hotkey: res }
  })

  ipcMain.handle('latency:enableUltra', async () => {
    try {
      const res = await ultraEnable(true)
      return res
    } catch (e) {
      state.lastError = String(e?.message ?? e)
      return { ok: false, error: state.lastError }
    }
  })

  ipcMain.handle('latency:enableUltraStable', async (_event, payload) => {
    try {
      if (process.platform !== 'win32') return { ok: false, error: 'Only supported on Windows' }
      if (payload && typeof payload === 'object') {
        if (typeof payload.gameExePath === 'string') config.gameExePath = payload.gameExePath
        if (typeof payload.hotkey === 'string') config.hotkey = payload.hotkey
        if (typeof payload.auto === 'boolean') config.auto = payload.auto
        if (typeof payload.pingHost === 'string') config.pingHost = payload.pingHost
        if (typeof payload.overlayEnabled === 'boolean') config.overlayEnabled = payload.overlayEnabled
        if (typeof payload.shieldEnabled === 'boolean') config.shieldEnabled = payload.shieldEnabled
        if (payload.shieldDeltaMs != null) config.shieldDeltaMs = payload.shieldDeltaMs
        if (payload.shieldMinMs != null) config.shieldMinMs = payload.shieldMinMs
        if (typeof payload.shieldBeep === 'boolean') config.shieldBeep = payload.shieldBeep
      }
      normalizeConfig()
      await saveConfig().catch(() => {})
      const stableTweaks = {
        powerPlanHigh: true,
        timerResolution05: false,
        processPriorityHigh: true,
        disableFullscreenOptimizations: false,
        disableMouseAcceleration: true,
        gpuHighPerformance: false,
        qosForExe: false,
        disableNagle: false,
        killBackground: false,
        dnsCloudflare: false
      }
      return await ultraEnable(true, { tweaks: stableTweaks })
    } catch (e) {
      state.lastError = String(e?.message ?? e)
      return { ok: false, error: state.lastError }
    }
  })

  ipcMain.handle('latency:disableUltra', async () => {
    try {
      return await ultraDisable()
    } catch (e) {
      state.lastError = String(e?.message ?? e)
      return { ok: false, error: state.lastError }
    }
  })

  ipcMain.handle('latency:toggleUltra', async () => {
    try {
      if (state.ultraEnabled) return await ultraDisable()
      return await ultraEnable(true)
    } catch (e) {
      state.lastError = String(e?.message ?? e)
      return { ok: false, error: state.lastError }
    }
  })

  ipcMain.handle('latency:boostNow', async () => {
    try {
      if (process.platform !== 'win32') return { ok: false, error: 'Only supported on Windows' }
      await runCommand('ipconfig', ['/flushdns'], { timeoutMs: 8000 }).catch(() => {})
      if (!state.game?.pid) {
        await smartCleanRam(null).catch(() => {})
        return { ok: true, msg: 'BOOST NOW aplicado (DNS flush + Smart Clean)' }
      }
      return { ok: true, msg: 'BOOST NOW aplicado (DNS flush). Smart Clean foi pulado durante o jogo.' }
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) }
    }
  })

  function splitArgs(argString) {
    const s = String(argString ?? '').trim()
    if (!s) return []
    const out = []
    let cur = ''
    let q = null
    for (let i = 0; i < s.length; i += 1) {
      const ch = s[i]
      if (q) {
        if (ch === q) {
          q = null
        } else {
          cur += ch
        }
        continue
      }
      if (ch === '"' || ch === "'") {
        q = ch
        continue
      }
      if (ch === ' ') {
        if (cur) out.push(cur)
        cur = ''
        continue
      }
      cur += ch
    }
    if (cur) out.push(cur)
    return out
  }

  ipcMain.handle('latency:launchGameWithProfile', async (_event, payload) => {
    if (process.platform !== 'win32') return { ok: false, error: 'Only supported on Windows' }
    const exePath = String(payload?.exePath ?? '').trim()
    if (!exePath) return { ok: false, error: 'exePath inválido' }
    const args = payload?.argsArray && Array.isArray(payload.argsArray) ? payload.argsArray.map(String) : splitArgs(payload?.args)
    const workingDir = String(payload?.workingDir ?? '').trim()
    const profile = payload?.profile && typeof payload.profile === 'object' ? payload.profile : {}

    if (launchedGame?.proc) {
      return { ok: false, error: 'Já existe um jogo lançado pelo DarkHub rodando.' }
    }

    const prevConfig = { ...config }
    const prevUltra = Boolean(state.ultraEnabled)

    config.gameExePath = exePath
    config.auto = false
    if (typeof profile.pingHost === 'string' && profile.pingHost.trim()) config.pingHost = profile.pingHost.trim()
    if (typeof profile.overlayEnabled === 'boolean') config.overlayEnabled = profile.overlayEnabled
    if (typeof profile.shieldEnabled === 'boolean') config.shieldEnabled = profile.shieldEnabled
    if (profile.shieldDeltaMs != null) config.shieldDeltaMs = clampInt(profile.shieldDeltaMs, 5, 300, 30)
    if (profile.shieldMinMs != null) config.shieldMinMs = clampInt(profile.shieldMinMs, 10, 500, 80)
    if (typeof profile.shieldBeep === 'boolean') config.shieldBeep = profile.shieldBeep
    if (profile.smartCleanMinutes != null) config.smartCleanMinutes = clampInt(profile.smartCleanMinutes, 0, 240, 10)
    if (typeof profile.smartCleanDuringGaming === 'boolean') config.smartCleanDuringGaming = profile.smartCleanDuringGaming
    if (typeof profile.gpuPollingEnabled === 'boolean') config.gpuPollingEnabled = profile.gpuPollingEnabled
    if (profile.tweaks && typeof profile.tweaks === 'object') config.tweaks = { ...profile.tweaks }
    normalizeConfig()

    try {
      await saveConfig().catch(() => {})
      registerHotkey()

      const proc = spawn(exePath, args, {
        cwd: workingDir || undefined,
        windowsHide: false,
        detached: false
      })

      launchedGame = { proc, exePath, startedAt: now(), prevConfig, prevUltra, gameId: payload?.gameId, gameName: payload?.gameName ?? '' }

      broadcastEvent('library:gameStarted', {
        gameId: payload?.gameId,
        gameName: payload?.gameName ?? '',
        startedAt: launchedGame.startedAt,
        timestamp: Date.now()
      })
      broadcastEvent('library:activityLogged', {
        type: 'gameStarted',
        gameName: payload?.gameName ?? '',
        timestamp: Date.now()
      })

      if (profile.enableUltraOnLaunch) {
        try {
          await ultraEnable(true)
        } catch (e) {
          state.lastError = String(e?.message ?? e)
        }
      }

      proc.on('exit', async () => {
        const g = launchedGame
        launchedGame = null
        if (g?.gameId && typeof getLibraryStore === 'function') {
          try {
            const durationSeconds = Math.floor((now() - g.startedAt) / 1000)
            const { loadLibrary, saveLibrary } = await getLibraryStore()
            const lib = await loadLibrary(app)
            const game = Array.isArray(lib?.games) ? lib.games.find(x => x.id === g.gameId) : null
            if (game) {
              game.playtimeSeconds = (game.playtimeSeconds || 0) + Math.max(0, durationSeconds)
              game.playCount = (game.playCount || 0) + 1
              game.lastPlayedAt = Date.now()
              await saveLibrary(app, lib.games).catch(() => {})

              broadcastEvent('library:gameStopped', {
                gameId: g.gameId,
                gameName: g.gameName ?? '',
                durationSeconds,
                playtimeSeconds: game.playtimeSeconds,
                timestamp: Date.now()
              })
              broadcastEvent('library:updated', {
                reason: 'playtime',
                gameId: g.gameId,
                games: lib.games
              })
              broadcastEvent('library:activityLogged', {
                type: 'gameStopped',
                gameName: g.gameName ?? '',
                durationSeconds,
                timestamp: Date.now()
              })
            }
          } catch (err) {
            console.error('Falha ao salvar horas jogadas', err)
          }
        }
        try {
          if (profile.enableUltraOnLaunch && state.ultraEnabled) await ultraDisable()
        } catch {}
        try {
          config = g?.prevConfig ?? config
          await saveConfig().catch(() => {})
          registerHotkey()
          if (g?.prevUltra && !state.ultraEnabled) {
            try {
              await ultraEnable(false)
            } catch {}
          }
        } catch {}
      })

      return { ok: true, pid: proc.pid, exePath, args, workingDir }
    } catch (e) {
      config = prevConfig
      await saveConfig().catch(() => {})
      registerHotkey()
      return { ok: false, error: String(e?.message ?? e) }
    }
  })

  loadConfig()
    .then(() => {
      normalizeConfig()
      registerHotkey()
      start()
    })
    .catch(() => {
      normalizeConfig()
      start()
    })

  return {
    stop
  }
}
