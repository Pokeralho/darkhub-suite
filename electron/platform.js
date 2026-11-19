/**
 * Platform helpers and a consistent "unsupported on this platform" contract.
 * Keep this tiny and dependency-free: it is imported early from main/preload-adjacent code.
 */
export const isWindows = process.platform === 'win32'
export const isLinux = process.platform === 'linux'
export const isMac = process.platform === 'darwin'

/**
 * Standard response for capabilities that exist only on Windows (PowerShell, .exe daemons, Win32 APIs).
 * Callers already expect { ok: false, error } in many places; `unsupported`/`platform`/`reason`
 * let the renderer degrade gracefully without guessing from the message text.
 */
export function unsupported(feature = 'this feature') {
  return {
    ok: false,
    unsupported: true,
    platform: process.platform,
    reason: 'windows-only',
    error: `${feature} is only supported on Windows`
  }
}

export function unsupportedPt(feature = 'Este recurso') {
  return {
    ok: false,
    unsupported: true,
    platform: process.platform,
    reason: 'windows-only',
    error: `${feature} está disponível apenas no Windows.`
  }
}
