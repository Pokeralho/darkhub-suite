// The update installer is run by this elevated app. electron-updater leaves it in %LOCALAPPDATA%\<app>-updater\pending,
// which the user owns: any unelevated program of that user could swap it after electron-updater checked its sha512.
// So it is copied into a staging folder only Administrators can write (secureStaging.js), hashed while copying, and
// only that copy is run. Pure Node (no Electron imports) so tests can use it.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import { createSecureStagingDir } from './secureStaging.js'

/** The sha512 (base64, as latest.yml has it) electron-updater published for the downloaded installer, or null. */
export function publishedSha512(info, downloadedFile) {
  const files = Array.isArray(info?.files) ? info.files : []
  const base = path.basename(String(downloadedFile || '')).toLowerCase()
  const match = files.find((f) => f?.sha512 && path.basename(String(f.url || '')).toLowerCase() === base)
  const sha = match?.sha512 || (files.length === 1 ? files[0]?.sha512 : null) || info?.sha512 || null
  return typeof sha === 'string' && sha.length ? sha : null
}

/**
 * Copies `source` into a fresh protected staging folder and checks the bytes written against `sha512` (base64) and/or
 * `sha256` (hex). Resolves { file, sha256, cleanup } with the SHA-256 of the copy (installUpdate hashes it again right
 * before running it). Throws, leaving nothing behind, when a digest is missing or does not match.
 */
export async function stageVerifiedInstaller({ source, sha512 = null, sha256 = null, name = null, fallbackBase = null, elevated, createStaging = createSecureStagingDir }) {
  if (!sha512 && !sha256) throw new Error('no published digest for the installer')
  const st = fs.lstatSync(source)
  if (!st.isFile()) throw new Error('the downloaded installer is not a regular file')
  const staging = await createStaging({ prefix: 'upd-', fallbackBase, elevated })
  const dest = staging.file(path.basename(String(name || source)))
  const h512 = crypto.createHash('sha512')
  const h256 = crypto.createHash('sha256')
  const tap = new Transform({ transform(chunk, _enc, cb) { h512.update(chunk); h256.update(chunk); cb(null, chunk) } })
  try {
    await pipeline(fs.createReadStream(source), tap, fs.createWriteStream(dest, { flags: 'wx' }))
    const got512 = h512.digest('base64')
    const got256 = h256.digest('hex')
    if (sha512 && got512 !== sha512) throw new Error('the downloaded installer does not match the published sha512')
    if (sha256 && got256 !== String(sha256).toLowerCase()) throw new Error('the downloaded installer does not match the published SHA-256')
    return { file: dest, sha256: got256, secure: staging.secure, cleanup: staging.cleanup }
  } catch (e) {
    await staging.cleanup()
    throw e
  }
}
