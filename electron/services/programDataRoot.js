// C:\ProgramData\DarkHub holds state this elevated app trusts: the Windows-mode recovery manifest (WinMods), Cleaner and
// Disk Rescue backups, ClamAV, the quarantine. ProgramData's default ACL lets any standard user create that folder
// (becoming its owner) and files in it before DarkHub does. So once per run, when elevated, only Administrators +
// SYSTEM can write to the root (Users keep read), whatever a non-admin planted in it is removed and the rest is owned
// by Administrators. Subfolders that lock themselves tighter (quarantine, ClamAV) keep their own ACL.
// A root that is a junction or link is moved aside first: locking it down would change the ACL of its target.
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { secureDir } from './realtime/Quarantine.js'
import { isProcessElevated } from './secureStaging.js'

export function defaultProgramDataRoot(env = process.env) {
  return path.win32.join(env.ProgramData || env.PROGRAMDATA || 'C:\\ProgramData', 'DarkHub')
}

const isLink = (p) => { try { return fs.lstatSync(p).isSymbolicLink() } catch { return false } }

let pending = null

/** Resolves { skipped } when there is no privilege boundary (not Windows, not elevated), else { removed: [...] }. */
export function secureProgramDataRoot({
  root = defaultProgramDataRoot(),
  platform = process.platform,
  elevated,
  secure = secureDir
} = {}) {
  if (platform !== 'win32' || !(elevated ?? isProcessElevated())) return Promise.resolve({ skipped: true })
  pending ||= (async () => {
    if (isLink(root)) {
      const aside = `${root}.link-${crypto.randomBytes(6).toString('hex')}`
      await fsp.rename(root, aside)
      await fsp.rm(aside, { force: true }) // removes the link, never what it points to
    }
    await fsp.mkdir(root, { recursive: true })
    if (isLink(root)) throw new Error(`${root} became a link; not securing it`)
    // Users keep read access (Explorer opens the Cleaner backups folder); only writing is taken away
    return { removed: await secure(root, { usersRead: true }) }
  })().catch((e) => { pending = null; throw e })
  return pending
}

/**
 * icacls: every ACL under `dir` (itself included, links themselves never their targets) goes back to what it inherits
 * from the locked root. A folder a standard user made before the lock can carry explicit ACEs that granted them
 * write; the root's own ACL change does not touch those.
 */
export function resetToInherited(dir) {
  if (process.platform !== 'win32') return Promise.resolve(true)
  const icacls = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'icacls.exe')
  return new Promise((resolve) => execFile(icacls, [dir, '/reset', '/T', '/C', '/L', '/Q'], { windowsHide: true, timeout: 120000 }, (err) => resolve(!err)))
}

const subdirs = new Map() // `${root}|${name}` -> Promise<string>

/**
 * A folder for files this elevated app runs or trusts (downloaded tools, caches it copies into protected places).
 * - elevated on Windows: C:\ProgramData\DarkHub\<name>, created after the root lock finished (before it, ProgramData lets
 *   any user create files in subfolders), ACLs reset to the root's (Administrators + SYSTEM write, Users read), planted
 *   files removed, links refused. Throws instead of falling back to a user-writable place.
 * - otherwise (dev run, not elevated): <userData>/<name>. Nothing started from there is elevated, so there is no
 *   privilege boundary to protect.
 */
export function trustedDataDir(name, {
  userData,
  root = defaultProgramDataRoot(),
  platform = process.platform,
  elevated,
  secureRoot = secureProgramDataRoot,
  secure = (dir) => secureDir(dir, { lockDown: resetToInherited })
} = {}) {
  if (!/^[\w.-]+$/.test(String(name)) || name === '.' || name === '..') throw new Error(`invalid folder name: ${name}`)
  if (platform !== 'win32' || !(elevated ?? isProcessElevated())) {
    if (!userData) throw new Error('userData is required when not elevated')
    return Promise.resolve(path.join(userData, name))
  }
  const key = `${root}|${name}`
  if (!subdirs.has(key)) {
    const p = (async () => {
      await secureRoot({ root, platform, elevated: true })
      const dir = path.win32.join(root, name)
      if (isLink(dir)) await fsp.rm(dir, { force: true }) // unlinks a planted junction, never what it points to
      await fsp.mkdir(dir, { recursive: true })
      if (isLink(dir)) throw new Error(`${dir} became a link; not using it`)
      await secure(dir)
      return dir
    })()
    subdirs.set(key, p)
    p.catch(() => subdirs.delete(key))
  }
  return subdirs.get(key)
}

/** Where downloaded executables live (yt-dlp, ffmpeg, PresentMon, DLSS 5 Autopilot). See trustedDataDir. */
export const trustedToolsDir = (opts) => trustedDataDir('tools', opts)

/**
 * Brings a file pinned by SHA-256 over from a folder the user can write (the old %APPDATA%\DarkHub\tools). The bytes
 * are read once, hashed, and those same bytes are written to `dest`: a file swapped after the check is never copied.
 * Resolves true when copied, false when missing or not matching.
 */
export async function migratePinnedFile(source, dest, sha256) {
  let buf
  try {
    const st = await fsp.lstat(source)
    if (!st.isFile()) return false
    buf = await fsp.readFile(source)
  } catch { return false }
  if (crypto.createHash('sha256').update(buf).digest('hex') !== String(sha256).toLowerCase()) return false
  await fsp.mkdir(path.dirname(dest), { recursive: true })
  const tmp = `${dest}.${process.pid}.tmp`
  await fsp.writeFile(tmp, buf, { flag: 'w' })
  await fsp.rename(tmp, dest)
  return true
}

/** Tests only. */
export function _resetProgramDataRoot() { pending = null; subdirs.clear() }
