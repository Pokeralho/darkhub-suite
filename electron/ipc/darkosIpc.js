import { DarkOSRecoveryService } from '../services/darkos/DarkOSRecoveryService.js'

/**
 * Registers the `darkos:*` IPC surface. Every handler returns { ok, ... } and never throws.
 * Progress for long operations is streamed to the calling window on 'darkos:runEvent'.
 */
export function registerDarkOSIPC({ ipcMain, dialog, BrowserWindow, app, logger, service } = {}) {
  const svc = service || new DarkOSRecoveryService({ logger })

  const sendTo = (sender) => (evt) => {
    try {
      if (sender && !sender.isDestroyed()) sender.send('darkos:runEvent', evt)
    } catch { /* window closing */ }
  }

  const handle = (channel, fn) => {
    ipcMain.handle(channel, async (event, payload) => {
      try {
        return await fn(payload ?? {}, { onEvent: sendTo(event.sender) }, event)
      } catch (err) {
        try { logger?.error?.('DarkOS', `${channel}: ${err?.message ?? err}`) } catch { /* ignore */ }
        return { ok: false, error: err?.message ?? String(err) }
      }
    })
  }

  handle('darkos:isDarkOS', async () => svc.info())
  handle('darkos:getCatalog', (p, o) => svc.getCatalog(p, o))
  handle('darkos:getManifest', (_p, o) => svc.getManifest(o))
  handle('darkos:getStatus', (p, o) => svc.getStatus(p, o))
  handle('darkos:applyChange', (p, o) => svc.applyChange(p, o))
  handle('darkos:revertChange', (p, o) => svc.revertChange(p, o))
  handle('darkos:setProfile', (p, o) => svc.setProfile(p, o))
  handle('darkos:restoreProfile', (_p, o) => svc.restoreProfile(o))
  handle('darkos:getRemovedApps', (_p, o) => svc.getRemovedApps(o))
  handle('darkos:restoreAppx', (p, o) => svc.restoreAppx(p, o))
  handle('darkos:listSnapshots', (_p, o) => svc.listSnapshots(o))
  handle('darkos:createSnapshot', (p, o) => svc.createSnapshot(p, o))
  handle('darkos:restoreSnapshot', (p, o) => svc.restoreSnapshot(p, o))
  handle('darkos:getFailures', (_p, o) => svc.getFailures(o))
  handle('darkos:getRebootPending', (_p, o) => svc.getRebootPending(o))

  // The destination is always chosen in the native dialog; a renderer-supplied path is ignored.
  handle('darkos:exportDiagnostics', async (_p, o, event) => {
    const win = BrowserWindow?.fromWebContents?.(event.sender) ?? undefined
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    let defaultDir = ''
    try { defaultDir = app?.getPath?.('documents') ?? '' } catch { defaultDir = '' }
    const pick = await dialog.showSaveDialog(win, {
      title: 'Salvar diagnostico do DarkOS',
      defaultPath: defaultDir ? `${defaultDir}\\DarkOS-Diagnostico-${stamp}.zip` : `DarkOS-Diagnostico-${stamp}.zip`,
      filters: [{ name: 'Arquivo ZIP', extensions: ['zip'] }]
    })
    if (pick.canceled || !pick.filePath) return { ok: false, canceled: true }
    const dest = /\.zip$/i.test(pick.filePath) ? pick.filePath : `${pick.filePath}.zip`
    return svc.exportDiagnostics({ destination: dest }, o)
  })

  return svc
}

export default registerDarkOSIPC
