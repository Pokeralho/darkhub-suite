// Save locations: Ludusavi manifest placeholders → real Windows paths, glob expansion, and game matching. Pure except
// for expandGlob (which reads directories).
import fs from 'node:fs'
import path from 'node:path'

const isWin = process.platform === 'win32'

// Placeholder → key of the env object built by the service. Unknown or missing ones make the path unusable.
const PLACEHOLDERS = {
  '<home>': 'home', '<winAppData>': 'appData', '<winLocalAppData>': 'localAppData', '<winLocalAppDataLow>': 'localAppDataLow',
  '<winDocuments>': 'documents', '<winPublic>': 'public', '<winProgramData>': 'programData', '<winDir>': 'winDir',
  '<base>': 'base', '<root>': 'root', '<game>': 'game', '<storeUserId>': 'storeUserId', '<osUserName>': 'osUserName',
  '<storeGameId>': 'storeGameId'
}

/** Template from the manifest → absolute pattern (may contain * / ** / ?), or null when a placeholder is unknown. */
export function resolveTemplate(template, env) {
  let unresolved = false
  const out = String(template).replace(/<[A-Za-z]+>/g, (ph) => {
    const key = PLACEHOLDERS[ph]
    const val = key ? env[key] : null
    if (val == null || val === '') { unresolved = true; return ph }
    // <storeUserId> may be "*" (any Steam account) when the user id is unknown
    return String(val).replace(/[\\/]+$/, '')
  })
  if (unresolved) return null
  // Ludusavi templates/paths are Windows-formatted. Keep Windows normalization for drive-letter paths
  // (and on Windows) so existing behavior/tests hold; on Linux with POSIX-resolved env values, use host paths.
  if (isWin || /^[A-Za-z]:[\\/]/.test(out)) return path.win32.normalize(out.replace(/\//g, '\\'))
  return path.posix.normalize(out.replace(/\\/g, '/'))
}

/** Normalized key for matching names across stores ("Hollow Knight™: Silksong" → "hollowknightsilksong"). */
export const nameKey = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')

function basenameAny(p) {
  const s = String(p || '').replace(/[\\/]+$/, '')
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'))
  return i >= 0 ? s.slice(i + 1) : s
}

/**
 * Pairs installed games with manifest entries: Steam app id first, then the install folder name, then the name.
 * @param {Array<{name, steamId?, installDirs?}>} index
 * @param {Array<{name, appId?, installDir?}>} installed
 */
export function matchGames(index, installed) {
  const bySteam = new Map()
  const byDir = new Map()
  const byName = new Map()
  for (const e of index) {
    if (e.steamId) bySteam.set(String(e.steamId), e)
    for (const d of e.installDirs || []) byDir.set(nameKey(d), e)
    byName.set(nameKey(e.name), e)
  }
  const out = []
  const seen = new Set()
  for (const g of installed) {
    const e = (g.appId && bySteam.get(String(g.appId))) || (g.installDir && byDir.get(nameKey(basenameAny(g.installDir)))) || byName.get(nameKey(g.name))
    if (!e || seen.has(e.name)) continue
    seen.add(e.name)
    out.push({ game: g, entry: e })
  }
  return out
}

const globToRegex = (seg) => new RegExp(`^${seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i')

/** Expands a pattern with * ? ** into existing files (directories are walked). Capped for safety. */
export function expandGlob(pattern, { maxFiles = 20000, maxDepth = 12 } = {}) {
  const raw = String(pattern)
  const sep = raw.includes('/') ? '/' : '\\'
  const parts = raw.split(/[\\/]+/)
  const files = []
  const join = (base, name) => {
    if (!base) return name
    if (base === '/') return '/' + name
    if (/^[A-Za-z]:$/.test(base) && sep === '\\') return base + '\\' + name
    if (/^[A-Za-z]:$/.test(base) && sep === '/') return base + '/' + name
    return base.replace(/[\\/]+$/, '') + sep + name
  }
  const addTree = (p, depth) => {
    if (files.length >= maxFiles) return
    let st
    try { st = fs.statSync(p) } catch { return }
    if (st.isFile()) { files.push(p); return }
    if (!st.isDirectory() || depth > maxDepth) return
    let names = []
    try { names = fs.readdirSync(p) } catch { return }
    for (const n of names) addTree(join(p, n), depth + 1)
  }
  const walk = (base, i) => {
    if (files.length >= maxFiles) return
    if (i >= parts.length) { addTree(base, 0); return }
    const seg = parts[i]
    if (seg === '**') {
      walk(base, i + 1)
      let names = []
      try { names = fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) } catch { return }
      for (const n of names) walk(join(base, n), i)
      return
    }
    if (!/[*?]/.test(seg)) {
      let next
      if (i === 0) {
        if (seg === '' && raw.startsWith('/')) next = '/'
        else if (/^[A-Za-z]:$/.test(seg)) next = sep === '\\' ? seg + '\\' : seg
        else next = seg
      } else {
        next = join(base, seg)
      }
      walk(next, i + 1)
      return
    }
    const re = globToRegex(seg)
    let names = []
    try { names = fs.readdirSync(base) } catch { return }
    for (const n of names) if (re.test(n)) walk(join(base, n), i + 1)
  }
  walk('', 0)
  return [...new Set(files)]
}

/** Relative path of `file` under the non-glob prefix of `pattern`, used to store files portably. */
export function staticPrefix(pattern) {
  const raw = String(pattern)
  const sep = raw.includes('/') ? '/' : '\\'
  const parts = raw.split(/[\\/]+/)
  const i = parts.findIndex((p) => /[*?]/.test(p))
  const prefixParts = i < 0 ? parts : parts.slice(0, i)
  if (prefixParts.length === 1 && prefixParts[0] === '' && raw.startsWith('/')) return '/'
  if (prefixParts.length === 1 && /^[A-Za-z]:$/.test(prefixParts[0])) return prefixParts[0] + sep
  return prefixParts.join(sep)
}
