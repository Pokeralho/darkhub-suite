// Minimal OpenSSH client config (~/.ssh/config) reader for the "Import from ~/.ssh/config" action.
// Supports Host blocks with HostName, User, Port, ProxyJump and IdentityFile; wildcard-only patterns
// (Host *, Host *.corp) are treated as defaults and not imported as hosts.

function unquote(v) {
  const s = String(v).trim()
  return s.length >= 2 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s
}

export function parseSshConfig(text) {
  const blocks = []
  let current = null
  const defaults = {}
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.replace(/^\s+/, '')
    if (!line || line.startsWith('#')) continue
    const m = line.match(/^(\S+?)(?:\s*=\s*|\s+)(.+)$/)
    if (!m) continue
    const key = m[1].toLowerCase()
    const value = unquote(m[2].replace(/\s+#.*$/, ''))
    if (key === 'host') {
      const patterns = value.split(/\s+/).filter(Boolean)
      current = { patterns, options: {} }
      blocks.push(current)
      continue
    }
    if (key === 'match') { current = { patterns: [], options: {}, ignored: true }; continue }
    const target = current ? current.options : defaults
    // first value wins, as in OpenSSH
    if (!(key in target)) target[key] = value
  }

  const wildcard = (p) => /[*?!]/.test(p)
  const wildDefaults = blocks.filter((b) => b.patterns.length && b.patterns.every((p) => p === '*')).map((b) => b.options)
  const hosts = []
  for (const b of blocks) {
    if (b.ignored) continue
    for (const alias of b.patterns) {
      if (wildcard(alias)) continue
      const opt = { ...defaults }
      for (const d of wildDefaults) for (const [k, v] of Object.entries(d)) if (!(k in opt)) opt[k] = v
      const merged = { ...opt, ...b.options }
      const port = Number(merged.port ?? 22)
      hosts.push({
        alias,
        hostname: merged.hostname ? merged.hostname.replace(/%h/g, alias) : alias,
        port: Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 22,
        username: merged.user ?? '',
        proxyJump: merged.proxyjump && merged.proxyjump.toLowerCase() !== 'none' ? merged.proxyjump.split(',')[0].trim() : null,
        identityFile: merged.identityfile ?? null
      })
    }
  }
  return hosts
}
