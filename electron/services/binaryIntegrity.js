// SHA-256 check of the native helpers before they are started. The manifest (integrity.json, written by
// scripts/gen-integrity.mjs at build time) lists every executable and DLL under electron/services. It catches a corrupted
// install and a helper swapped on disk; someone who can rewrite the app's own files can rewrite the manifest too, so this
// is a tripwire, not a signature. Pure: no Electron imports.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const MANIFEST_FILE = path.join(here, 'integrity.json')
/** Packaged, the binaries live outside the archive. */
export const unpacked = (p) => (p.includes(`app.asar${path.sep}`) ? p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`) : p)
export const SERVICES_DIR = unpacked(here)
/** Running from an installed app (inside the archive), not from a checkout. */
export const PACKAGED = here.includes(`app.asar${path.sep}`)

export const sha256File = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

export function readManifest(file = MANIFEST_FILE) {
  try {
    const m = JSON.parse(fs.readFileSync(file, 'utf8'))
    return m && typeof m.files === 'object' ? m.files : null
  } catch { return null }
}

/**
 * Checks the manifest entries whose path starts with one of `prefixes` (e.g. 'hwsensors/', 'DarkHub.GpuBench.exe').
 * Returns { ok, checked, problems: [{ file, reason: 'missing' | 'mismatch' }] }; no manifest or no entry is not ok.
 */
export function verifyBinaries(prefixes, { dir = SERVICES_DIR, manifest = readManifest() } = {}) {
  if (!manifest) return { ok: false, checked: 0, problems: [{ file: 'integrity.json', reason: 'missing' }] }
  const names = Object.keys(manifest).filter((n) => prefixes.some((p) => n === p || (p.endsWith('/') && n.startsWith(p))))
  if (!names.length) return { ok: false, checked: 0, problems: prefixes.map((p) => ({ file: p, reason: 'missing' })) }
  const problems = []
  for (const name of names) {
    const file = path.join(dir, ...name.split('/'))
    if (!fs.existsSync(file)) problems.push({ file: name, reason: 'missing' })
    else if (sha256File(file) !== manifest[name]) problems.push({ file: name, reason: 'mismatch' })
  }
  return { ok: problems.length === 0, checked: names.length, problems }
}

/**
 * Policy shared by the callers: an installed app refuses to start a helper that fails the check; a development checkout,
 * where helpers are rebuilt all the time, only warns. Returns null when the helper may start, or the error text.
 */
export function integrityError(prefixes, { enforce = PACKAGED, log, ...opts } = {}) {
  const r = verifyBinaries(prefixes, opts)
  if (r.ok) return null
  const detail = r.problems.map((p) => `${p.file} (${p.reason})`).join(', ')
  log?.(`integrity check failed: ${detail}`)
  return enforce ? `integrity_failed: ${detail}` : null
}
