import path from 'node:path'
import { MaintenanceService } from '../services/maintenance/MaintenanceService.js'

/** `maint:*`: scheduled maintenance (off by default). Progress goes out on `maint:event`. */
export function registerMaintenanceIPC({ app, ipcMain, BrowserWindow, Notification, logger } = {}) {
  const broadcast = (msg) => { for (const w of BrowserWindow.getAllWindows()) { try { w.webContents.send('maint:event', msg) } catch { /* closing */ } } }
  const notify = (e) => {
    try {
      if (!Notification?.isSupported?.()) return
      new Notification({ title: e.ok ? 'DarkHub: manutenção concluída' : 'DarkHub: manutenção falhou', body: e.ok ? e.id : `${e.id}: ${e.error}` }).show()
    } catch { /* notifications unavailable */ }
  }
  // the actions are the ones the app already uses elsewhere; loaded lazily so startup stays light
  const deps = {
    cleanTemp: async () => (await import('../services/optimizer/StorageEngine.js')).default.cleanTempFiles(),
    updateSecurityLists: async () => (await import('../services/SecurityService.js')).default.advanced.updateFeeds(),
    updateClamav: async () => {
      const { ClamAv } = await import('../services/realtime/ClamAv.js')
      const clam = new ClamAv(path.join(process.env.ProgramData || 'C:\\ProgramData', 'DarkHub'))
      return clam.status().installed ? clam.update() : { skipped: true }
    },
    backupSaves: async () => {
      const svc = (await import('./saveBackupIpc.js')).getSaveBackupService()
      if (!svc) throw new Error('Backup de saves indisponível')
      return svc.backupAll()
    },
    parseWinget: (text) => [] // replaced below once the parser module is loaded
  }
  import('../services/psTools/psToolBuilders.js').then((m) => { deps.parseWinget = m.parseWingetTable }).catch((e) => logger?.warn?.('Maintenance', `winget parser: ${e?.message ?? e}`))

  const svc = new MaintenanceService({ app, notify, onEvent: broadcast, deps })
  const handle = (channel, fn) => ipcMain.handle(channel, async (_e, payload) => {
    try { return await fn(payload ?? {}) } catch (err) {
      logger?.error?.('Maintenance', `${channel}: ${err?.message ?? err}`)
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  handle('maint:state', () => svc.state())
  handle('maint:setTask', ({ id, patch }) => svc.setTask(String(id), patch || {}))
  handle('maint:runNow', ({ id }) => svc.runTask(String(id), { manual: true }))

  app.whenReady().then(() => svc.start())
  app.on('before-quit', () => svc.stop())
}

export default registerMaintenanceIPC
