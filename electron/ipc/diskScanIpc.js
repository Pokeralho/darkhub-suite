import { DiskScanService } from '../services/diskscan/DiskScanService.js'

/** `diskscan:*` (Mapa de disco). Progress is pushed on 'diskscan:progress' to the window that started the scan. */
export function registerDiskScanIPC({ ipcMain, dialog, shell, BrowserWindow, logger, service } = {}) {
  const svc = service || new DiskScanService({ shell })
  const handle = (channel, fn) => ipcMain.handle(channel, async (event, payload) => {
    try { return await fn(payload ?? {}, event) } catch (err) {
      try { logger?.error?.('DiskScan', `${channel}: ${err?.message ?? err}`) } catch { /* ignore */ }
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  const winOf = (event) => BrowserWindow?.fromWebContents?.(event.sender) ?? undefined

  handle('diskscan:drives', () => svc.drives())
  handle('diskscan:pickFolder', async (_p, event) => {
    const r = await dialog.showOpenDialog(winOf(event), { title: 'Escolher pasta para analisar', properties: ['openDirectory'] })
    return r.canceled || !r.filePaths?.[0] ? { ok: false, canceled: true } : { ok: true, path: r.filePaths[0] }
  })
  handle('diskscan:start', (p, event) => svc.start(String(p.root || ''), (st) => {
    try { if (!event.sender.isDestroyed()) event.sender.send('diskscan:progress', st) } catch { /* window closing */ }
  }))
  handle('diskscan:cancel', () => svc.cancel())
  handle('diskscan:status', () => svc.status())
  handle('diskscan:view', (p) => svc.view({ id: p.id, minFraction: p.minFraction, maxNodes: p.maxNodes, filter: p.filter, showFree: p.showFree === true }))
  handle('diskscan:info', (p) => svc.info(String(p.id || ''), p.filter))
  handle('diskscan:tag', (p) => svc.setTag(String(p.id || ''), p.color ?? null))
  handle('diskscan:open', (p) => svc.open(String(p.id || '')))
  handle('diskscan:reveal', (p) => svc.reveal(String(p.id || '')))
  handle('diskscan:trash', (p) => svc.trash(String(p.id || '')))
  // The destination always comes from the native save dialog.
  handle('diskscan:export', async (p, event) => {
    const format = p.format === 'csv' ? 'csv' : 'txt'
    const base = (svc.pathOf(String(p.id || 'd0')) || 'disco').split(/[\/]/).filter(Boolean).pop()?.replace(/[:*?"<>|]/g, '') || 'disco'
    const pick = await dialog.showSaveDialog(winOf(event), {
      title: 'Exportar relatório', defaultPath: `Mapa de disco - ${base}.${format}`,
      filters: [format === 'csv' ? { name: 'Planilha CSV', extensions: ['csv'] } : { name: 'Texto', extensions: ['txt'] }]
    })
    if (pick.canceled || !pick.filePath) return { ok: false, canceled: true }
    return svc.exportTo({ id: String(p.id || 'd0'), format, filter: p.filter }, pick.filePath)
  })
  return svc
}

export default registerDiskScanIPC
