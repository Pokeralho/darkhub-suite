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

/** Tests only. */
export function _resetProgramDataRoot() { pending = null }
