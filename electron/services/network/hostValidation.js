// The one validator for host names/addresses handed to ping.exe, tracert.exe, port scans and TCP probes. They run
// elevated (DarkHub is administrator), so a "host" must never be read as an option ("-t", "-n 9999") or carry shell
// characters, whitespace or control chars. Hostnames, IPv4 and IPv6 (with ':') only. Pure.
export const SAFE_HOST_RE = /^[A-Za-z0-9_.:-]{1,253}$/

/** The trimmed host when it is safe to pass as a command-line argument, else null. */
export function safeHost(host) {
  if (typeof host !== 'string' && typeof host !== 'number') return null
  const h = String(host).trim()
  if (!SAFE_HOST_RE.test(h)) return null // also rules out whitespace, control chars, quotes, & | < > / \
  if (h.startsWith('-') || h.startsWith('.')) return null // "-t" would be an option of ping/tracert
  return h
}

export const isSafeHost = (host) => safeHost(host) !== null

export function assertSafeHost(host) {
  const h = safeHost(host)
  if (h === null) throw new Error('Host inválido: apenas letras, números, pontos, dois-pontos, hífen e underscore são permitidos, e não pode começar com "-".')
  return h
}
