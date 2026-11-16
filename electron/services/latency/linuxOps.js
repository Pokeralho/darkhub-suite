import os from 'node:os'

function trimOut(v) {
  return String(v ?? '').trim()
}

export function isLinux() {
  return process.platform === 'linux'
}

/**
 * Best-effort DNS cache flush on Linux. Tries resolvectl, then systemd-resolve, then nscd.
 * Never throws; returns a structured per-op result.
 */
export async function linuxFlushDns(runCommand) {
  if (process.platform !== 'linux') {
    return { ok: false, status: 'unsupported', platform: process.platform, reason: 'linux-only' }
  }
  const attempts = [
    { cmd: 'resolvectl', args: ['flush-caches'], name: 'resolvectl' },
    { cmd: 'systemd-resolve', args: ['--flush-caches'], name: 'systemd-resolve' },
    { cmd: 'nscd', args: ['-i', 'hosts'], name: 'nscd' }
  ]
  let lastError = null
  for (const a of attempts) {
    try {
      const r = await runCommand(a.cmd, a.args, { timeoutMs: 8000 })
      if (r && r.code === 0) return { ok: true, status: 'ok', method: a.name }
      lastError = trimOut(r?.stderr || r?.stdout) || `${a.name} exited with code ${r?.code}`
    } catch (e) {
      lastError = String(e?.message ?? e)
    }
  }
  return { ok: false, status: 'failed', reason: 'unavailable', error: lastError || 'No supported DNS flush command found (resolvectl/systemd-resolve/nscd).' }
}

/**
 * Best-effort: set a performance power profile/governor on Linux.
 * Tries powerprofilesctl (performance), then cpupower frequency-set -g performance.
 * Returns { ok, status, prev, method?, error?, verified? }.
 */
export async function linuxSetPerformancePower(runCommand) {
  if (process.platform !== 'linux') {
    return { ok: false, status: 'unsupported', platform: process.platform, reason: 'linux-only' }
  }

  // 1) powerprofilesctl
  try {
    const cur = await runCommand('powerprofilesctl', ['get'], { timeoutMs: 8000 })
    if (cur && cur.code === 0) {
      const prev = trimOut(cur.stdout) || null
      const set = await runCommand('powerprofilesctl', ['set', 'performance'], { timeoutMs: 12000 })
      if (set && set.code === 0) {
        const check = await runCommand('powerprofilesctl', ['get'], { timeoutMs: 8000 }).catch(() => null)
        const nowProfile = trimOut(check?.stdout)
        const verified = nowProfile === 'performance'
        return { ok: true, status: verified ? 'ok' : 'unverified', prev: { method: 'powerprofilesctl', profile: prev }, method: 'powerprofilesctl', verified }
      }
      // set failed (permissions?) - fall through to cpupower
    }
  } catch {}

  // 2) cpupower (governor)
  try {
    const info = await runCommand('cpupower', ['frequency-info', '-p'], { timeoutMs: 8000 })
    if (info && info.code === 0) {
      const prevOut = trimOut(info.stdout)
      const govMatch = prevOut.match(/governor\s+"?([A-Za-z0-9_-]+)"?/i)
      const prevGovernor = govMatch ? govMatch[1] : null
      const set = await runCommand('cpupower', ['frequency-set', '-g', 'performance'], { timeoutMs: 12000 })
      if (set && set.code === 0) {
        const check = await runCommand('cpupower', ['frequency-info', '-p'], { timeoutMs: 8000 }).catch(() => null)
        const nowOut = trimOut(check?.stdout)
        const nowGov = (nowOut.match(/governor\s+"?([A-Za-z0-9_-]+)"?/i) || [])[1]
        const verified = nowGov === 'performance'
        return { ok: true, status: verified ? 'ok' : 'unverified', prev: { method: 'cpupower', governor: prevGovernor }, method: 'cpupower', verified }
      }
      return { ok: false, status: 'failed', prev: { method: 'cpupower', governor: prevGovernor }, error: trimOut(set?.stderr || set?.stdout) || 'cpupower set failed' }
    }
  } catch {}

  return { ok: false, status: 'unsupported', reason: 'unavailable', error: 'Nenhum provedor de perfil de energia disponível (powerprofilesctl/cpupower).' }
}

export async function linuxRestorePerformancePower(runCommand, prev) {
  if (process.platform !== 'linux') return { ok: false, status: 'unsupported' }
  if (!prev || typeof prev !== 'object') return { ok: false, status: 'skipped', reason: 'no-prev' }
  try {
    if (prev.method === 'powerprofilesctl' && prev.profile) {
      await runCommand('powerprofilesctl', ['set', String(prev.profile)], { timeoutMs: 12000 })
      return { ok: true, status: 'ok' }
    }
    if (prev.method === 'cpupower' && prev.governor) {
      await runCommand('cpupower', ['frequency-set', '-g', String(prev.governor)], { timeoutMs: 12000 })
      return { ok: true, status: 'ok' }
    }
  } catch (e) {
    return { ok: false, status: 'failed', error: String(e?.message ?? e) }
  }
  return { ok: false, status: 'skipped', reason: 'unknown-method' }
}

/**
 * Best-effort process priority raise via renice (and ionice if available).
 * Returns structured result; does not throw.
 */
export async function linuxBoostProcessPriority(runCommand, pid) {
  if (process.platform !== 'linux') {
    return { ok: false, status: 'unsupported', platform: process.platform, reason: 'linux-only' }
  }
  const p = Number(pid)
  if (!Number.isFinite(p) || p <= 0) return { ok: false, status: 'skipped', reason: 'no-pid', error: 'Jogo não detectado em execução' }
  const applied = { renice: null, ionice: null }
  let ok = false
  try {
    const r = await runCommand('renice', ['-n', '-10', '-p', String(Math.trunc(p))], { timeoutMs: 8000 })
    if (r && r.code === 0) {
      applied.renice = { status: 'ok' }
      ok = true
    } else {
      applied.renice = { status: 'failed', error: trimOut(r?.stderr || r?.stdout) || `renice exited with code ${r?.code}` }
    }
  } catch (e) {
    applied.renice = { status: 'failed', error: String(e?.message ?? e) }
  }
  // ionice is best-effort, failure does not fail the whole op
  try {
    const io = await runCommand('ionice', ['-c', '2', '-n', '0', '-p', String(Math.trunc(p))], { timeoutMs: 8000 })
    applied.ionice = io && io.code === 0 ? { status: 'ok' } : { status: 'skipped', error: trimOut(io?.stderr || io?.stdout) || 'ionice unavailable/failed' }
  } catch (e) {
    applied.ionice = { status: 'skipped', error: String(e?.message ?? e) }
  }
  return ok ? { ok: true, status: 'ok', applied } : { ok: false, status: applied.renice?.status || 'failed', error: applied.renice?.error || 'Falha ao ajustar prioridade', applied }
}

/**
 * Basic CPU topology info from os.cpus() for cross-platform informational use.
 */
export function basicCpuTopology() {
  const cpus = os.cpus() || []
  return {
    logicalCores: cpus.length,
    model: cpus[0]?.model || null,
    speedMHz: cpus[0]?.speed || null,
    platform: process.platform,
    source: 'os'
  }
}

/**
 * Resilient game process matching for Linux (and usable cross-platform).
 * Matches by resolved path, basename, and process name/cmd fields when available.
 */
export function matchGameProcess(list, exePath) {
  const normalized = String(exePath ?? '').trim().toLowerCase()
  if (!normalized) return null
  const exeName = normalized.split(/[\\/]/).pop() || ''
  const byExactPath =
    list.find((p) => typeof p?.path === 'string' && p.path.toLowerCase() === normalized) ||
    list.find((p) => typeof p?.path === 'string' && p.path.toLowerCase().replace(/\\/g, '/') === normalized.replace(/\\/g, '/'))
  if (byExactPath) return byExactPath
  const byBasename =
    list.find((p) => typeof p?.path === 'string' && (p.path.toLowerCase().split(/[\\/]/).pop() || '') === exeName) ||
    list.find((p) => typeof p?.name === 'string' && String(p.name).toLowerCase() === exeName)
  if (byBasename) return byBasename
  // cmd/command may include full path on Linux
  const byCmd = list.find((p) => {
    const cmd = String(p?.command ?? p?.cmd ?? p?.params ?? '').toLowerCase()
    if (!cmd) return false
    return cmd.includes(normalized) || (exeName && cmd.includes(exeName))
  })
  return byCmd || null
}

/**
 * Build a per-capability status map for the current platform.
 * Used by getConfig to expose which tweaks are supported/partial/unsupported.
 */
export function buildLatencyCapabilities() {
  if (process.platform === 'win32') {
    return {
      platform: 'win32',
      level: 'supported',
      tweaks: {
        powerPlanHigh: { supported: true },
        timerResolution05: { supported: true },
        processPriorityHigh: { supported: true },
        disableFullscreenOptimizations: { supported: true },
        disableMouseAcceleration: { supported: true },
        gpuHighPerformance: { supported: true },
        qosForExe: { supported: true },
        disableNagle: { supported: true },
        killBackground: { supported: true },
        dnsCloudflare: { supported: true }
      },
      features: {
        metricsCpuRam: true, metricsPing: true, metricsGpu: true,
        queryTimer: true, getCpuTopology: true, boostNow: true,
        launchGameWithProfile: true, hotkey: true, gameDetection: true,
        smartCleanRam: true, tcpStack: true
      }
    }
  }
  if (process.platform === 'linux') {
    return {
      platform: 'linux',
      level: 'partial',
      tweaks: {
        powerPlanHigh: { supported: 'partial', note: 'powerprofilesctl/cpupower (best-effort)' },
        timerResolution05: { supported: false, reason: 'windows-only' },
        processPriorityHigh: { supported: 'partial', note: 'renice/ionice (best-effort)' },
        disableFullscreenOptimizations: { supported: false, reason: 'windows-only' },
        disableMouseAcceleration: { supported: false, reason: 'windows-only' },
        gpuHighPerformance: { supported: false, reason: 'windows-only' },
        qosForExe: { supported: false, reason: 'windows-only' },
        disableNagle: { supported: false, reason: 'windows-only' },
        killBackground: { supported: false, reason: 'windows-only' },
        dnsCloudflare: { supported: false, reason: 'linux-partial', note: 'adapter DNS set/restore not supported; use Boost Now for flush-only' }
      },
      features: {
        metricsCpuRam: true, metricsPing: true, metricsGpu: false,
        queryTimer: false, getCpuTopology: true, boostNow: true,
        launchGameWithProfile: false, hotkey: true, gameDetection: true,
        smartCleanRam: false, tcpStack: false
      }
    }
  }
  return {
    platform: process.platform,
    level: 'unsupported',
    tweaks: {},
    features: { metricsCpuRam: true, metricsPing: false, metricsGpu: false }
  }
}
