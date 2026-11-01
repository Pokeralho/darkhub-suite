import path from 'node:path'
import { CleanerService } from '../services/cleaner/CleanerService.js'

/** `cleaner:*` (DarkHub Cleaner Core: limpeza profunda, VACUUM dos navegadores, registro, winapp2.ini). */
export function registerCleanerIPC({ app, ipcMain, shell, logger, service } = {}) {
  const svc = service || new CleanerService({ dataDir: path.join(app.getPath('userData'), 'cleaner') })
  const handle = (channel, fn) => ipcMain.handle(channel, async (_event, payload) => {
    try { return await fn(payload ?? {}) } catch (err) {
      try { logger?.error?.('Cleaner', `${channel}: ${err?.message ?? err}`) } catch { /* ignore */ }
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  handle('cleaner:status', () => svc.status())
  handle('cleaner:update-definitions', () => svc.updateDefinitions())
  handle('cleaner:remove-definitions', () => svc.removeDefinitions())
  handle('cleaner:list-targets', () => svc.listTargets())
  handle('cleaner:scan', (p) => svc.scan(p))
  handle('cleaner:clean', (p) => svc.clean(p))
  handle('cleaner:browsers', (p) => svc.browsers(p))
  handle('cleaner:reg-scan', () => svc.regScan())
  handle('cleaner:reg-clean', (p) => svc.regClean(p))
  handle('cleaner:list-backups', () => svc.listBackups())
  handle('cleaner:restore-backup', (p) => svc.restoreBackup(p))
  handle('cleaner:open-backups', async () => {
    const r = svc.listBackups()
    if (!r.ok) return r
    const err = await shell.openPath(r.dir)
    return err ? { ok: false, error: err } : { ok: true }
  })
  return svc
}

export default registerCleanerIPC
