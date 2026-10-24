// Vault file hardening that runs on unlock without changing the file format (still version 1):
// a wrapper whose scrypt parameters are below the current target is re-wrapped with fresh parameters, after a
// timestamped backup of the old file. Older app versions can still open the upgraded file (memory cost 64 MiB stays
// under their 128 MiB scrypt maxmem).
import fsp from 'node:fs/promises'
import path from 'node:path'
import { buildKdf, wrapVaultKeyWithPassword } from '../../vaultCrypto.js'

const MAX_BACKUPS = 5

/** Work factor of a scrypt wrapper (N * r * p), 0 when unknown. */
export function kdfWork(kdf) {
  if (!kdf || kdf.name !== 'scrypt') return 0
  const N = Number(kdf.N) || 0
  const r = Number(kdf.r) || 0
  const p = Number(kdf.p) || 0
  return N * r * p
}

export function isWeakKdf(kdf) {
  return kdfWork(kdf) < kdfWork(buildKdf())
}

/** Copies the vault file to vault.dhv.bak-<reason>-<timestamp> and keeps only the newest MAX_BACKUPS. */
export async function backupVaultFile(vaultPath, reason = 'backup', fs = fsp) {
  const dir = path.dirname(vaultPath)
  const base = path.basename(vaultPath)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const target = path.join(dir, `${base}.bak-${String(reason).replace(/[^a-z0-9-]/gi, '')}-${stamp}`)
  await fs.copyFile(vaultPath, target)
  try {
    const names = (await fs.readdir(dir)).filter((n) => n.startsWith(`${base}.bak-`))
    const withTime = await Promise.all(names.map(async (n) => ({ n, t: (await fs.stat(path.join(dir, n))).mtimeMs })))
    withTime.sort((a, b) => b.t - a.t)
    for (const old of withTime.slice(MAX_BACKUPS)) await fs.rm(path.join(dir, old.n), { force: true })
  } catch {}
  return target
}

/**
 * Re-wraps `wrapperName` with the current KDF when it is weaker. Call right after a successful unlock with the
 * secret that opened it.
 * @returns {Promise<boolean>} true when the file was upgraded
 */
export async function upgradeWrapperIfWeak({ vaultPath, wrapperName, secret, vaultKey, readFile, writeFile }) {
  const file = await readFile()
  const wrapper = file?.wrappers?.[wrapperName]
  if (!wrapper || !isWeakKdf(wrapper.kdf)) return false
  await backupVaultFile(vaultPath, 'kdf-upgrade')
  const upgraded = await wrapVaultKeyWithPassword(vaultKey, secret, buildKdf())
  // Re-read so a concurrent write (entry saved meanwhile) is not lost.
  const latest = await readFile()
  await writeFile({ ...latest, wrappers: { ...(latest.wrappers ?? {}), [wrapperName]: upgraded } })
  return true
}
