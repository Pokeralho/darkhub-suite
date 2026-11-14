import { isWindows, isLinux, isMac } from './platform.js'

/**
 * Runtime capability map by domain. UI and IPC use this to avoid calling/polling unsupported
 * backends and to render clear platform-appropriate states instead of surfacing noisy errors.
 *
 * level: 'supported' | 'partial' | 'unsupported'
 */
export function getCapabilities() {
  const platform = process.platform

  // Latency guardian / native timer engine: currently implemented via Win32/PowerShell/native daemon.
  const latency = isWindows
    ? { level: 'supported', supported: true }
    : { level: 'unsupported', supported: false, reason: 'windows-only', error: 'Ultra Low Latency is only supported on Windows.' }

  // HAGS (Hardware-accelerated GPU scheduling): Windows graphics driver setting.
  const hags = isWindows
    ? { level: 'supported', supported: true }
    : { level: 'unsupported', supported: false, reason: 'windows-only', error: 'HAGS is only supported on Windows.' }

  // DarkOS management targets the DarkOS Windows image; on other platforms it is informational/unsupported.
  const darkos = isWindows
    ? { level: 'partial', supported: false, reason: 'windows-only-target' }
    : { level: 'unsupported', supported: false, reason: 'windows-only', error: 'DarkOS management is only supported on Windows.' }

  return {
    ok: true,
    platform,
    isWindows,
    isLinux,
    isMac,
    latency,
    hags,
    darkos
  }
}

export default getCapabilities
