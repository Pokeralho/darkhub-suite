// Save locations: Ludusavi manifest placeholders → real Windows paths, glob expansion, and game matching. Pure except
// for expandGlob (which reads directories).
import fs from 'node:fs'
import path from 'node:path'

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
  return path.win32.normalize(out.replace(/\//g, '\\'))
}

/** Normalized key for matching names across stores ("Hollow Knight™: Silksong" → "hollowknightsilksong"). */
export const nameKey = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

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
    const e = (g.appId && bySteam.get(String(g.appId))) || (g.installDir && byDir.get(nameKey(path.basename(g.installDir)))) || byName.get(nameKey(g.name))
    if (!e || seen.has(e.name)) continue
    seen.add(e.name)
    out.push({ game: g, entry: e })
  }
  return out
}

const globToRegex = (seg) => new RegExp(`^${seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i')

/** Expands a Windows pattern with * ? ** into existing files (directories are walked). Capped for safety. */
export function expandGlob(pattern, { maxFiles = 20000, maxDepth = 12 } = {}) {
  const parts = pattern.split('\\')
  const files = []
  const addTree = (p, depth) => {
    if (files.length >= maxFiles) return
    let st
    try { st = fs.statSync(p) } catch { return }
    if (st.isFile()) { files.push(p); return }
    if (!st.isDirectory() || depth > maxDepth) return
    let names = []
    try { names = fs.readdirSync(p) } catch { return }
    for (const n of names) addTree(path.join(p, n), depth + 1)
  }
  const walk = (base, i) => {
    if (files.length >= maxFiles) return
    if (i >= parts.length) { addTree(base, 0); return }
    const seg = parts[i]
    if (seg === '**') {
      walk(base, i + 1)
      let names = []
      try { names = fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) } catch { return }
      for (const n of names) walk(path.join(base, n), i)
      return
    }
    if (!/[*?]/.test(seg)) { walk(i === 0 ? `${seg}\\` : path.join(base, seg), i + 1); return }
    const re = globToRegex(seg)
    let names = []
    try { names = fs.readdirSync(base) } catch { return }
    for (const n of names) if (re.test(n)) walk(path.join(base, n), i + 1)
  }
  walk('', 0)
  return [...new Set(files)]
}

/** Relative path of `file` under the non-glob prefix of `pattern`, used to store files portably. */
export function staticPrefix(pattern) {
  const parts = pattern.split('\\')
  const i = parts.findIndex((p) => /[*?]/.test(p))
  return (i < 0 ? parts : parts.slice(0, i)).join('\\')
}
