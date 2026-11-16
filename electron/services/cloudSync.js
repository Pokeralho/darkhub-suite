// OneDrive folders: whatever is deleted there is deleted in the cloud and on every PC of the person, and touching an
// online-only file downloads it. Personal and work/school accounts set these variables.
import path from 'node:path'

export function oneDriveRoots(env = process.env) {
  return [...new Set([env.OneDrive, env.OneDriveConsumer, env.OneDriveCommercial]
    .filter((p) => typeof p === 'string' && p.trim())
    .map((p) => path.win32.resolve(p.trim()).replace(/\\+$/, '').toLowerCase()))]
}

/** The OneDrive root that contains `p` (or is `p`), or null. */
export function oneDriveRootOf(p, env = process.env) {
  if (!p) return null
  const target = path.win32.resolve(String(p)).replace(/\\+$/, '').toLowerCase()
  return oneDriveRoots(env).find((r) => target === r || target.startsWith(`${r}\\`)) || null
}
