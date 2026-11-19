// Staging folders for files that an elevated process is about to run or copy into a protected place (installers,
// scripts, the hosts file). %TEMP% and %LOCALAPPDATA% belong to the user, so any unelevated program of that user could
// swap the file between our check and its use. These folders live under %ProgramData% and only Administrators and
// SYSTEM can write to them: the root is recreated by this (elevated) process on first use, owned by Administrators,
// with inheritance cut and only two ACEs; each staging folder inside it gets the same explicit ACL.
// Pure Node (no Electron imports) so services and tests can use it.
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { execFile, execFileSync } from 'node:child_process'

export const ADMINS_SID = '*S-1-5-32-544'
export const SYSTEM_SID = '*S-1-5-18'

/** C:\ProgramData\DarkHub-Staging: directly under ProgramData, whose ACL lets users create folders but not delete or rename ours. */
export function defaultStagingRoot(env = process.env) {
  return path.win32.join(env.ProgramData || env.PROGRAMDATA || 'C:\\ProgramData', 'DarkHub-Staging')
}

/** icacls arguments that leave `dir` with only Administrators and SYSTEM (full control, inherited by everything inside). */
export function lockdownArgs(dir) {
  return [dir, '/inheritance:r', '/grant:r', `${ADMINS_SID}:(OI)(CI)F`, `${SYSTEM_SID}:(OI)(CI)F`]
}
export function ownerArgs(dir) {
  return [dir, '/setowner', ADMINS_SID]
}

function defaultRunIcacls(args) {
  const exe = path.win32.join(process.env.SystemRoot || process.env.windir || 'C:\\Windows', 'System32', 'icacls.exe')
  return new Promise((resolve) => {
    execFile(exe, args, { windowsHide: true, timeout: 30000 }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') })
    })
  })
}

let elevatedCache = null
/** True when this process holds an elevated token (fltmc needs it). Cached; tests pass `elevated` explicitly. */
export function isProcessElevated() {
  if (process.platform !== 'win32') return false
  if (elevatedCache !== null) return elevatedCache
  try {
    execFileSync(path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'fltmc.exe'), [], { windowsHide: true, stdio: 'ignore', timeout: 5000 })
    elevatedCache = true
  } catch {
    elevatedCache = false
  }
  return elevatedCache
}

const isLink = (p) => { try { return fs.lstatSync(p).isSymbolicLink() } catch { return false } }

async function icaclsOrThrow(runIcacls, args, what) {
  const r = await runIcacls(args)
  if (r?.code !== 0) throw new Error(`Não foi possível proteger a pasta temporária (${what}): ${String(r?.stderr || r?.stdout || `icacls ${r?.code}`).trim().slice(0, 200)}`)
}

const preparedRoots = new Map() // root -> Promise<void>

/**
 * Recreates the root once per process: whatever was there (possibly made by another user, with handles still open
 * or extra ACEs) is renamed away and removed, then a fresh folder is created and locked down.
 */
function prepareRoot(root, runIcacls) {
  if (!preparedRoots.has(root)) {
    const p = (async () => {
      if (fs.existsSync(root) || isLink(root)) {
        const aside = `${root}.old-${crypto.randomBytes(6).toString('hex')}`
        try { await fsp.rename(root, aside) } catch (e) { throw new Error(`A pasta temporária protegida está em uso por outro programa (${e?.code || e?.message}).`) }
        await fsp.rm(aside, { recursive: true, force: true }).catch(() => {})
      }
      await fsp.mkdir(path.dirname(root), { recursive: true })
      await fsp.mkdir(root) // not recursive: fails if someone recreated it in the meantime
      await icaclsOrThrow(runIcacls, ownerArgs(root), 'dono')
      await icaclsOrThrow(runIcacls, lockdownArgs(root), 'permissões')
    })()
    preparedRoots.set(root, p)
    p.catch(() => preparedRoots.delete(root))
  }
  return preparedRoots.get(root)
}

/** Tests only. */
export function _resetStagingCache() { preparedRoots.clear(); elevatedCache = null }

/**
 * Creates a fresh staging folder. Returns { dir, secure, file(name), cleanup() }.
 * - elevated (the normal case: DarkHub runs as administrator): a folder only Administrators/SYSTEM can write; any
 *   failure throws, there is no silent fallback to a user-writable place.
 * - not elevated: nothing we start is elevated either, so there is no privilege boundary to protect; uses a private
 *   folder under `fallbackBase` (or throws when none is given). `secure` tells which one it was.
 */
export async function createSecureStagingDir({
  root = defaultStagingRoot(),
  prefix = 'stg-',
  fallbackBase = null,
  elevated,
  platform = process.platform,
  runIcacls = defaultRunIcacls
} = {}) {
  const isElevated = elevated ?? (platform === 'win32' ? isProcessElevated() : false)
  let dir
  let secure = false
  if (platform === 'win32' && isElevated) {
    await prepareRoot(root, runIcacls)
    if (isLink(root)) throw new Error('A pasta temporária protegida virou um link; operação recusada.')
    dir = await fsp.mkdtemp(path.join(root, prefix))
    await icaclsOrThrow(runIcacls, lockdownArgs(dir), 'permissões')
    if (isLink(dir)) throw new Error('A pasta temporária protegida virou um link; operação recusada.')
    secure = true
  } else {
    if (!fallbackBase) throw new Error('Pasta temporária protegida indisponível: o DarkHub não está como administrador.')
    await fsp.mkdir(fallbackBase, { recursive: true, mode: 0o700 })
    dir = await fsp.mkdtemp(path.join(fallbackBase, prefix))
  }
  return {
    dir,
    secure,
    file: (name) => {
      const base = path.basename(String(name))
      if (!base || base !== String(name) || base === '.' || base === '..') throw new Error('Nome de arquivo inválido.')
      return path.join(dir, base)
    },
    cleanup: () => fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/** Writes a new file (never follows or replaces an existing one) inside a staging folder. */
export async function writeStagedFile(staging, name, data, encoding) {
  const file = staging.file(name)
  await fsp.writeFile(file, data, { encoding, flag: 'wx' })
  return file
}

export function sha256FileSync(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

/** Throws unless `file` still has the SHA-256 recorded when it was checked: call it right before running the file. */
export function assertUnchanged(file, expectedSha256) {
  const now = sha256FileSync(file)
  if (now !== String(expectedSha256 || '').toLowerCase()) throw new Error('O arquivo mudou depois de verificado; execução recusada.')
}
