import { isWindows, isLinux, isMac } from './platform.js'

/**
 * Runtime capability map by domain. UI and IPC use this to avoid calling/polling unsupported
 * backends and to render clear platform-appropriate states instead of surfacing noisy errors.
 *
 * level: 'supported' | 'partial' | 'unsupported'
 */
export function getCapabilities() {
  const platform = process.platform

  // Latency guardian / native timer engine: Win32 has the full feature set (PowerShell, registry, native
  // daemon). On Linux we expose diagnostics (CPU/RAM/ping) plus best-effort safe tweaks (DNS flush, power
  // profile/governor, process renice); everything else is reported per-capability as unsupported/partial.
  const latency = isWindows
    ? { level: 'supported', supported: true }
    : isLinux
      ? {
          level: 'partial',
          supported: false,
          reason: 'linux-partial',
          error: 'Ultra Low Latency é parcial no Linux: diagnósticos (CPU/RAM/ping) e ajustes seguros estão disponíveis; tweaks do Windows (timer 0.5ms, Fullscreen Optimizations, mouse accel, QoS, Nagle, registry, nativo daemon) são indisponíveis.',
          subcapabilities: {
            metricsCpuRam: true,
            metricsPing: true,
            metricsGpu: false,
            timerResolution05: false,
            powerPlanHigh: true,
            processPriorityHigh: true,
            cpuAffinity: false,
            disableFullscreenOptimizations: false,
            disableMouseAcceleration: false,
            gpuHighPerformance: false,
            qosForExe: false,
            disableNagle: false,
            tcpStack: false,
            dnsCloudflare: false,
            killBackground: false,
            smartCleanRam: false,
            hotkey: true,
            gameDetection: true,
            boostNow: true,
            launchGameWithProfile: false,
            queryTimer: false,
            getCpuTopology: true
          }
        }
      : { level: 'unsupported', supported: false, reason: 'windows-only', error: 'Ultra Low Latency is only supported on Windows.' }

  // HAGS (Hardware-accelerated GPU scheduling): Windows graphics driver setting.
  const hags = isWindows
    ? { level: 'supported', supported: true }
    : { level: 'unsupported', supported: false, reason: 'windows-only', error: 'HAGS is only supported on Windows.' }

  // DarkOS management targets the DarkOS Windows image; on other platforms it is informational/unsupported.
  const darkos = isWindows
    ? { level: 'partial', supported: false, reason: 'windows-only-target' }
    : { level: 'unsupported', supported: false, reason: 'windows-only', error: 'DarkOS management is only supported on Windows.' }

  // Cleaner core: file cleaning + browser DB vacuum on Windows and (partially) Linux where the native engine
  // is present. Registry scan/clean, .reg restore, and Recycle Bin are Windows-only capabilities.
  const cleaner = isWindows
    ? {
        level: 'supported',
        supported: true,
        subcapabilities: { fileClean: true, browserVacuum: true, registry: true, recycleBin: true, definitions: true }
      }
    : isLinux
      ? {
          level: 'partial',
          supported: false,
          reason: 'linux-partial',
          error: 'Limpeza profunda é parcial no Linux: limpeza de arquivos temporários/cache e compactação de bancos de navegadores estão disponíveis (com motor nativo). Registro do Windows, Lixeira e restauração .reg são indisponíveis.',
          subcapabilities: { fileClean: true, browserVacuum: true, registry: false, recycleBin: false, definitions: true }
        }
      : { level: 'unsupported', supported: false, reason: 'windows-only', error: 'Limpeza profunda não é suportada nesta plataforma.' }

  return {
    ok: true,
    platform,
    isWindows,
    isLinux,
    isMac,
    latency,
    hags,
    darkos,
    cleaner
  }
}

export default getCapabilities
