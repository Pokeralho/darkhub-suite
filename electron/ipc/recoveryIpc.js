import { DiskRecoveryService } from '../services/recovery/DiskRecoveryService.js'

/** `recovery:*` (Disk Studio & Rescue). Long jobs push events on 'recovery:progress' to the window that started them. */
export function registerRecoveryIPC({ ipcMain, dialog, BrowserWindow, logger, service } = {}) {
  const svc = service || new DiskRecoveryService()
  const handle = (channel, fn) => ipcMain.handle(channel, async (event, payload) => {
    try { return await fn(payload ?? {}, event) } catch (err) {
      try { logger?.error?.('DiskRescue', `${channel}: ${err?.message ?? err}`) } catch { /* ignore */ }
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  const winOf = (event) => BrowserWindow?.fromWebContents?.(event.sender) ?? undefined
  const sender = (event) => (ev) => {
    try { if (!event.sender.isDestroyed()) event.sender.send('recovery:progress', ev) } catch { /* window closing */ }
  }

  handle('recovery:list-drives', () => svc.listDrives())
  handle('recovery:inspect-disk', (p) => svc.inspectDisk(p))
  handle('recovery:read-sector', (p) => svc.readSector(p))
  handle('recovery:write-sector', (p) => svc.writeSector(p))
  handle('recovery:repair-header', (p, event) => svc.repairHeader(p, sender(event)))
  handle('recovery:set-active', (p) => svc.setActive(p))
  handle('recovery:backup-table', (p) => svc.backupTable(p))
  handle('recovery:restore-backup', (p) => svc.restoreBackup(p))
  handle('recovery:clone', (p, event) => svc.clone(p, sender(event)))
  handle('recovery:verify', (p, event) => svc.verify(p, sender(event)))
  handle('recovery:surface-test', (p, event) => svc.surfaceTest(p, sender(event)))
  handle('recovery:smart', () => svc.smart())
  handle('recovery:start-carve', (p, event) => svc.startCarving(p, sender(event)))
  handle('recovery:cancel-carve', () => svc.cancel())
  handle('recovery:cancel', () => svc.cancel())
  handle('recovery:status', () => svc.status())

  // Paths always come from native dialogs.
  handle('recovery:pick-folder', async (_p, event) => {
    const r = await dialog.showOpenDialog(winOf(event), { title: 'Pasta para salvar os arquivos recuperados', properties: ['openDirectory', 'createDirectory'] })
    return r.canceled || !r.filePaths?.[0] ? { ok: false, canceled: true } : { ok: true, path: r.filePaths[0] }
  })
  handle('recovery:pick-image', async (p, event) => {
    const filters = [{ name: 'Imagem de disco', extensions: ['img', 'raw', 'dd', 'bin', 'iso'] }, { name: 'Backup de setores', extensions: ['dhbk'] }, { name: 'Todos', extensions: ['*'] }]
    if (p.save) {
      const r = await dialog.showSaveDialog(winOf(event), { title: 'Salvar imagem do disco', defaultPath: p.defaultName || 'disco.img', filters })
      return r.canceled || !r.filePath ? { ok: false, canceled: true } : { ok: true, path: r.filePath }
    }
    const r = await dialog.showOpenDialog(winOf(event), { title: 'Abrir imagem de disco', properties: ['openFile'], filters })
    return r.canceled || !r.filePaths?.[0] ? { ok: false, canceled: true } : { ok: true, path: r.filePaths[0] }
  })
  return svc
}

export default registerRecoveryIPC
