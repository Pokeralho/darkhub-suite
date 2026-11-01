// Post-install hub: what to do when winget cannot install a package. Big vendors (Google, Zoom...) replace the
// installer behind the same URL before the winget catalog catches up, so winget refuses it ("Installer hash does not
// match"). The fallback downloads the installer from the package's own official URL and runs it only if it carries a
// valid Authenticode signature of that same publisher. Pure helpers here; the I/O lives in main.js.

/** winget exit codes we act on (signed 32-bit, as Node reports them). */
export const WINGET = {
  HASH_MISMATCH: -1978335215, // 0x8A150011
  ALREADY_INSTALLED: -1978335189, // 0x8A15002B: installed, no newer version
  NO_APPLICABLE_INSTALLER: -1978335216, // 0x8A150010
  PACKAGE_NOT_FOUND: -1978335212 // 0x8A150014
}

/** Reads `winget install` output + exit code -> 'ok' | 'installed' | 'hash' | 'store' | 'notFound' | 'failed'. */
export function wingetOutcome(code, text = '') {
  const t = String(text)
  if (code === 0) return 'ok'
  if (code === WINGET.ALREADY_INSTALLED || /No available upgrade found|No newer package versions|already installed/i.test(t)) return 'installed'
  if (code === WINGET.HASH_MISMATCH || /Installer hash does not match/i.test(t)) return 'hash'
  if (/msstore|Microsoft Store/i.test(t) && /(not available|failed|0x8a15003b|0x80d03805|sign in)/i.test(t)) return 'store'
  if (code === WINGET.PACKAGE_NOT_FOUND || /No package found matching/i.test(t)) return 'notFound'
  return 'failed'
}

/** `winget show` text -> { publisher, type, url } of the first installer (English or Portuguese labels). */
export function parseWingetShow(text = '') {
  const pick = (re) => re.exec(String(text))?.[1]?.trim() || ''
  return {
    publisher: pick(/^\s*(?:Publisher|Editor)\s*:\s*(.+)$/im),
    type: pick(/^\s*(?:Installer Type|Tipo de Instalador)\s*:\s*(\S+)/im).toLowerCase(),
    url: pick(/^\s*(?:Installer Url|URL do Instalador)\s*:\s*(\S+)/im)
  }
}

/** Silent install command for an installer type, or null when the type has no standard silent switch. */
export function silentInstall(type, file) {
  switch (type) {
    case 'msi':
    case 'wix':
      return { cmd: 'msiexec.exe', args: ['/i', file, '/qn', '/norestart'] }
    case 'inno':
      return { cmd: file, args: ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-'] }
    case 'nullsoft':
      return { cmd: file, args: ['/S'] }
    case 'burn':
      return { cmd: file, args: ['/quiet', '/norestart'] }
    default:
      return null
  }
}

const norm = (s) => String(s).toLowerCase().replace(/\b(llc|inc|ltd|limited|corp|corporation|gmbh|co|s\.?a|ag|bv|plc)\b\.?/g, '').replace(/[^a-z0-9]/g, '')

/**
 * Is a certificate subject ("CN=Google LLC, O=Google LLC, L=Mountain View...") the package's publisher ("Google LLC")?
 * Compares the CN/O names without legal suffixes and punctuation; a short name must match exactly.
 */
export function signerMatches(subject, publisher) {
  const want = norm(publisher)
  if (want.length < 3) return false
  const names = [...String(subject).matchAll(/(?:^|,\s*)(?:CN|O)=("?)([^,"]+)\1/g)].map((m) => norm(m[2]))
  return names.some((n) => n === want || (want.length >= 5 && (n.startsWith(want) || want.startsWith(n) && n.length >= 5)))
}

/** Only HTTPS from a real host may be fetched by the fallback. */
export function isFetchableUrl(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && !/^(localhost|127\.|10\.|192\.168\.|\[)/i.test(u.hostname) } catch { return false }
}
