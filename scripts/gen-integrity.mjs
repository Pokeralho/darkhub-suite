// Writes electron/services/integrity.json: the SHA-256 of every native helper the app starts or loads.
// Run after any helper is rebuilt (npm run integrity); tests/binaryIntegrity.test.ts fails when it is stale.
// `--check` only compares and exits 1 on a difference.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const services = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'electron', 'services')
const BINARY = /\.(exe|dll|config)$/i

/** Every native file shipped under electron/services, in any subfolder (e.g. hwsensors/, lowlatency/), as 'sub/name'. */
export function listBinaries(dir = services) {
  const out = []
  const walk = (rel) => {
    const entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    for (const e of entries) {
      const child = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) walk(child)
      else if (e.isFile() && BINARY.test(e.name)) out.push(child)
    }
  }
  walk('')
  return out.sort()
}

export function collect(dir = services) {
  const files = {}
  for (const rel of listBinaries(dir)) files[rel] = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, ...rel.split('/')))).digest('hex')
  return files
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.join(services, 'integrity.json')
  const files = collect()
  if (process.argv.includes('--check')) {
    let old = {}
    try { old = JSON.parse(fs.readFileSync(out, 'utf8')).files } catch { /* missing */ }
    const diff = [...new Set([...Object.keys(files), ...Object.keys(old)])].filter((k) => files[k] !== old[k])
    if (diff.length) { console.error(`integrity.json is stale: ${diff.join(', ')}`); process.exit(1) }
    console.log(`integrity.json matches ${Object.keys(files).length} files`)
  } else {
    fs.writeFileSync(out, `${JSON.stringify({ algorithm: 'sha256', files }, null, 1)}\n`)
    console.log(`integrity.json: ${Object.keys(files).length} files`)
  }
}
