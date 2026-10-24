import { RestoreService } from '../services/restore/RestoreService.js'

/** `restore:*`: brings back Windows components a custom ISO removed (Media Player, .NET 3.5, Store apps, winget). */
export function registerRestoreIPC({ ipcMain, logger } = {}) {
  const svc = new RestoreService()
  const handle = (channel, fn) => ipcMain.handle(channel, async (_e, payload) => {
    try { return await fn(payload ?? {}) } catch (err) {
      logger?.error?.('Restore', `${channel}: ${err?.message ?? err}`)
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  handle('restore:status', () => svc.status())
  handle('restore:install', ({ id, isoRoot }) => svc.install(String(id), { isoRoot: typeof isoRoot === 'string' ? isoRoot : '' }))
}

export default registerRestoreIPC
