import { DriverCenterService } from '../services/DriverCenterService.js'

/**
 * Registers the `driver:*` IPC surface. Every handler returns { ok, ... } and never throws.
 * The official-URL validation lives on the main side: the renderer can only ask to open a
 * (vendor, kind) pair, never an arbitrary URL.
 */
export function registerDriverIPC({ ipcMain, shell, logger, service, elevatedRunner, darkos } = {}) {
  const svc = service || new DriverCenterService({ elevatedRunner })

  const handle = (channel, fn) => {
    ipcMain.handle(channel, async (event, payload) => {
      try {
        return await fn(payload ?? {}, event)
      } catch (err) {
        try { logger?.error?.('Driver', `${channel}: ${err?.message ?? err}`) } catch { /* ignore */ }
        return { ok: false, error: err?.message ?? String(err) }
      }
    })
  }

  handle('driver:detect', () => svc.detectAdapters())

  handle('driver:cameraStatus', () => svc.cameraStatus())

  // On DarkOS, first undo (through the DarkOS module, so it stays reversible) the catalog items that block the camera.
  handle('driver:repairCamera', () => svc.repairCamera({
    darkosRevert: darkos?.isDarkOS?.() ? (ids) => darkos.revertChange({ ids }) : undefined
  }))

  handle('driver:openOfficial', async (payload) => {
    const r = svc.resolveOfficialUrl(payload?.vendor, payload?.kind)
    if (!r.ok) return r
    await shell.openExternal(r.url)
    return { ok: true, url: r.url, vendor: r.vendor, kind: r.kind }
  })

  return svc
}

export default registerDriverIPC
