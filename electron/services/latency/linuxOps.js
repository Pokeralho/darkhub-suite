import os from 'node:os'

function trimOut(v) {
  return String(v ?? '').trim()
}

// `cpupower frequency-info -p` prints `governor "powersave"` (optionally after
// `:` or `=`). Require a quoted value so prose such as "no governor here" is
// never mistaken for a captured governor.
const GOVERNOR_RE = /governor\s*(?:=|:)?\s*["']([A-Za-z0-9_-]+)["']/i

function governorFrom(v) {
  const m = trimOut(v).match(GOVERNOR_RE)
  return m ? m[1] : null
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

  // Fail closed: only mutate a provider whose previous value we actually captured.
  // A mutation with no capturable "prev" could never be restored safely.
  // 1) powerprofilesctl
  try {
    const cur = await runCommand('powerprofilesctl', ['get'], { timeoutMs: 8000 })
    if (cur && cur.code === 0) {
      const prev = trimOut(cur.stdout) || null
      if (prev) {
        const set = await runCommand('powerprofilesctl', ['set', 'performance'], { timeoutMs: 12000 })
        if (set && set.code === 0) {
          const check = await runCommand('powerprofilesctl', ['get'], { timeoutMs: 8000 }).catch(() => null)
          const nowProfile = trimOut(check?.stdout)
          const verified = check && check.code === 0 && nowProfile === 'performance'
          if (!verified) {
            return { ok: false, status: 'failed', prev: { method: 'powerprofilesctl', profile: prev }, method: 'powerprofilesctl', verified: false, error: 'Falha ao verificar o perfil de desempenho após a mudança', observed: nowProfile || null }
          }
          return { ok: true, status: 'ok', prev: { method: 'powerprofilesctl', profile: prev }, method: 'powerprofilesctl', verified: true }
        }
        // set failed (permissions?) - fall through to cpupower
      }
      // no capturable prev - fall through to cpupower (never mutate blindly)
    }
  } catch {}

  // 2) cpupower (governor)
  try {
    const info = await runCommand('cpupower', ['frequency-info', '-p'], { timeoutMs: 8000 })
    if (info && info.code === 0) {
      const prevGovernor = governorFrom(info.stdout)
      if (prevGovernor) {
        const set = await runCommand('cpupower', ['frequency-set', '-g', 'performance'], { timeoutMs: 12000 })
        if (set && set.code === 0) {
          const check = await runCommand('cpupower', ['frequency-info', '-p'], { timeoutMs: 8000 }).catch(() => null)
          const nowGov = governorFrom(check?.stdout)
          const verified = check && check.code === 0 && nowGov === 'performance'
          if (!verified) {
            return { ok: false, status: 'failed', prev: { method: 'cpupower', governor: prevGovernor }, method: 'cpupower', verified: false, error: 'Falha ao verificar o governor após a mudança', observed: nowGov || null }
          }
          return { ok: true, status: 'ok', prev: { method: 'cpupower', governor: prevGovernor }, method: 'cpupower', verified: true }
        }
        return { ok: false, status: 'failed', prev: { method: 'cpupower', governor: prevGovernor }, error: trimOut(set?.stderr || set?.stdout) || 'cpupower set failed' }
      }
      // no capturable governor - never mutate blindly
    }
  } catch {}

  return { ok: false, status: 'unsupported', reason: 'unavailable', error: 'Nenhum provedor de perfil de energia com estado restaurável disponível (powerprofilesctl/cpupower).' }
}

/**
 * Restore the previously captured power profile / CPU governor.
 *
 * Never reports ok unless the restore command exited 0 AND a read-back shows
 * the target value. Non-zero exit codes, thrown commands and failed read-backs
 * are propagated as failures so callers cannot silently claim a safe restore.
 */
export async function linuxRestorePerformancePower(runCommand, prev) {
  if (process.platform !== 'linux') return { ok: false, status: 'unsupported' }
  if (!prev || typeof prev !== 'object') return { ok: false, status: 'skipped', reason: 'no-prev' }
  try {
    if (prev.method === 'powerprofilesctl' && prev.profile) {
      const target = String(prev.profile)
      const set = await runCommand('powerprofilesctl', ['set', target], { timeoutMs: 12000 })
      if (!set || set.code !== 0) {
        return { ok: false, status: 'failed', error: trimOut(set?.stderr || set?.stdout) || `powerprofilesctl restore exited with code ${set?.code}` }
      }
      const check = await runCommand('powerprofilesctl', ['get'], { timeoutMs: 8000 }).catch(() => null)
      const observed = trimOut(check?.stdout)
      if (!check || check.code !== 0 || observed !== target) {
        return { ok: false, status: 'failed', error: 'Falha ao verificar a restauração do perfil de energia', observed: observed || null }
      }
      return { ok: true, status: 'ok', method: 'powerprofilesctl', profile: target }
    }
    if (prev.method === 'cpupower' && prev.governor) {
      const target = String(prev.governor)
      const set = await runCommand('cpupower', ['frequency-set', '-g', target], { timeoutMs: 12000 })
      if (!set || set.code !== 0) {
        return { ok: false, status: 'failed', error: trimOut(set?.stderr || set?.stdout) || `cpupower restore exited with code ${set?.code}` }
      }
      const check = await runCommand('cpupower', ['frequency-info', '-p'], { timeoutMs: 8000 }).catch(() => null)
      const observed = governorFrom(check?.stdout)
      if (!check || check.code !== 0 || observed !== target) {
        return { ok: false, status: 'failed', error: 'Falha ao verificar a restauração do governor de CPU', observed: observed || null }
      }
      return { ok: true, status: 'ok', method: 'cpupower', governor: target }
    }
  } catch (e) {
    return { ok: false, status: 'failed', error: String(e?.message ?? e) }
  }
  return { ok: false, status: 'skipped', reason: 'unknown-method' }
}

/**
 * Linux process-priority boosting is intentionally DISABLED (fail closed).
 *
 * `renice`/`ionice` mutate kernel scheduling state for a PID. A safe
 * lifecycle would require all of the following, and any one of them can fail:
 *   1. capture the prior nice / ionice values;
 *   2. prove the PID still refers to the same process when restoring
 *      (PIDs are recycled, so a stale PID could hit an unrelated process);
 *   3. read the values back to confirm both the change and the rollback.
 * There is no way to guarantee a safe restore, so we never mutate at all and
 * report `unsupported` instead of ever claiming success. This keeps a hot-CPU
 * user from being left with an untracked, unrecoverable priority change.
 */
export async function linuxBoostProcessPriority(runCommand, pid) {
  if (process.platform !== 'linux') {
    return { ok: false, status: 'unsupported', platform: process.platform, reason: 'linux-only' }
  }
  return {
    ok: false,
    status: 'unsupported',
    reason: 'no-safe-restore',
    error: 'Ajuste de prioridade (renice/ionice) desabilitado no Linux: não é possível capturar/restaurar o estado anterior com segurança (PID pode ser reutilizado).'
  }
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
        processPriorityHigh: { supported: false, reason: 'no-safe-restore', note: 'renice/ionice desabilitados: sem captura/restauração segura do estado anterior (PID pode ser reutilizado)' },
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
