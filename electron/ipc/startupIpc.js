import { StartupService } from '../services/startup/StartupService.js'

const UNSUPPORTED = { ok: false, unsupported: true, platform: process.platform, reason: 'windows-only', error: 'Gerenciador de inicialização é suportado apenas no Windows.' }

/** `startup:*`: Startup manager (list, enable/disable like Task Manager, measured boot impact, undo). */
export function registerStartupIPC({ app, ipcMain, logger } = {}) {
  if (process.platform !== 'win32') {
    for (const ch of ['startup:list', 'startup:setEnabled', 'startup:undo']) {
      ipcMain.handle(ch, async () => UNSUPPORTED)
    }
    return
  }
  const svc = new StartupService({ app })
  const handle = (channel, fn) => ipcMain.handle(channel, async (_e, payload) => {
    try { return await fn(payload ?? {}) } catch (err) {
      logger?.error?.('Startup', `${channel}: ${err?.message ?? err}`)
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  handle('startup:list', () => svc.list())
  handle('startup:setEnabled', ({ item, enabled }) => svc.setEnabled(item, enabled))
  handle('startup:undo', ({ index }) => svc.undo(index))
}

export default registerStartupIPC
