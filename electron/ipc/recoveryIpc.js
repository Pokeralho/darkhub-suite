import { DiskRecoveryService } from '../services/recovery/DiskRecoveryService.js'
import { PartitionService } from '../services/recovery/PartitionService.js'

/** `recovery:*` (Disk Studio & Rescue). Long jobs push events on 'recovery:progress' to the window that started them. */
export function registerRecoveryIPC({ ipcMain, dialog, BrowserWindow, powerSaveBlocker, app, logger, service, partitions } = {}) {
  const svc = service || new DiskRecoveryService()
  const parts = partitions || new PartitionService({ recovery: svc, appPaths: app ? [app.getAppPath(), app.getPath('userData'), process.execPath] : [] })
  const unsupported = (extra = {}) => ({ ok: false, unsupported: true, platform: process.platform, reason: 'windows-only', error: 'Recuperação/particionamento de disco é suportado apenas no Windows.', ...extra })
  const gate = (fn) => (process.platform !== 'win32' ? () => unsupported() : fn)
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

  handle('recovery:list-drives', gate(() => svc.listDrives()))
  handle('recovery:inspect-disk', gate((p) => svc.inspectDisk(p)))
  handle('recovery:read-sector', gate((p) => svc.readSector(p)))
  handle('recovery:write-sector', gate((p) => svc.writeSector(p)))
  handle('recovery:repair-header', gate((p, event) => svc.repairHeader(p, sender(event))))
  handle('recovery:set-active', gate((p) => svc.setActive(p)))
  handle('recovery:backup-table', gate((p) => svc.backupTable(p)))
  handle('recovery:restore-backup', gate((p) => svc.restoreBackup(p)))
  handle('recovery:clone', gate((p, event) => svc.clone(p, sender(event))))
  handle('recovery:verify', gate((p, event) => svc.verify(p, sender(event))))
  handle('recovery:surface-test', gate((p, event) => svc.surfaceTest(p, sender(event))))
  handle('recovery:smart', gate(() => svc.smart()))
  handle('recovery:start-carve', gate((p, event) => svc.startCarving(p, sender(event))))
  handle('recovery:cancel-carve', gate(() => svc.cancel()))
  handle('recovery:cancel', gate(() => svc.cancel()))
  handle('recovery:status', gate(() => svc.status()))
  handle('recovery:list-partitions', gate(() => parts.list()))
  handle('recovery:partition-limits', gate((p) => parts.limits(p)))
  handle('recovery:partition-plan', gate((p) => parts.plan(p)))
  // Resizing cannot be stopped safely: while it runs the PC stays awake and the window refuses to close.
  handle('recovery:partition-apply', gate(async (p, event) => {
    const win = winOf(event)
    const onClose = (e) => {
      e.preventDefault()
      dialog?.showMessageBox?.(win, { type: 'warning', message: 'Uma operação de partição está em andamento. Aguarde terminar.' })
    }
    win?.on?.('close', onClose)
    const blocker = powerSaveBlocker?.start?.('prevent-app-suspension')
    try { return await parts.apply(p) } finally {
      win?.removeListener?.('close', onClose)
      if (blocker !== undefined) powerSaveBlocker?.stop?.(blocker)
    }
  }))

  // Paths always come from native dialogs.
  handle('recovery:pick-folder', gate(async (_p, event) => {
    const r = await dialog.showOpenDialog(winOf(event), { title: 'Pasta para salvar os arquivos recuperados', properties: ['openDirectory', 'createDirectory'] })
    return r.canceled || !r.filePaths?.[0] ? { ok: false, canceled: true } : { ok: true, path: r.filePaths[0] }
  }))
  handle('recovery:pick-image', gate(async (p, event) => {
    const filters = [{ name: 'Imagem de disco', extensions: ['img', 'raw', 'dd', 'bin', 'iso'] }, { name: 'Backup de setores', extensions: ['dhbk'] }, { name: 'Todos', extensions: ['*'] }]
    if (p.save) {
      const r = await dialog.showSaveDialog(winOf(event), { title: 'Salvar imagem do disco', defaultPath: p.defaultName || 'disco.img', filters })
      return r.canceled || !r.filePath ? { ok: false, canceled: true } : { ok: true, path: r.filePath }
    }
    const r = await dialog.showOpenDialog(winOf(event), { title: 'Abrir imagem de disco', properties: ['openFile'], filters })
    return r.canceled || !r.filePaths?.[0] ? { ok: false, canceled: true } : { ok: true, path: r.filePaths[0] }
  }))
  return svc
}

export default registerRecoveryIPC
