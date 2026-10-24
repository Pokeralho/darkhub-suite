// Turns the Ludusavi manifest (YAML, ~18 MB) into a compact JSON index of Windows save locations.
// Runs in its own Node process (Electron as Node): argv[2] = manifest.yaml, argv[3] = output index.json.
import fs from 'node:fs'
// js-yaml parses the 18 MB manifest in ~1.5 s (the 'yaml' package took ~2 min)
import yaml from 'js-yaml'

const isWindows = (when) => !Array.isArray(when) || when.length === 0 || when.some((w) => !w?.os || w.os === 'windows')

export function buildIndex(manifest) {
  const out = []
  for (const [name, g] of Object.entries(manifest || {})) {
    if (!g || typeof g !== 'object') continue
    const files = []
    for (const [tpl, meta] of Object.entries(g.files || {})) {
      if (isWindows(meta?.when) && !/<xdg|<home>\/\.|^~/.test(tpl)) files.push({ path: tpl, tags: meta?.tags || [] })
    }
    // only the current user's registry: restoring machine-wide keys is out of scope
    const registry = Object.entries(g.registry || {})
      .filter(([key, meta]) => /^HKEY_CURRENT_USER\//i.test(key) && isWindows(meta?.when))
      .map(([key, meta]) => ({ key, tags: meta?.tags || [] }))
    if (!files.length && !registry.length) continue
    out.push({ name, steamId: g.steam?.id ?? null, installDirs: Object.keys(g.installDir || {}), files, registry })
  }
  return out
}

if (process.argv[2] && process.argv[3]) {
  const index = buildIndex(yaml.load(fs.readFileSync(process.argv[2], 'utf8')))
  fs.writeFileSync(process.argv[3], JSON.stringify(index))
  process.stdout.write(JSON.stringify({ ok: true, games: index.length }) + '\n')
}
