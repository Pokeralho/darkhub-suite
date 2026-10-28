import path from 'node:path'
import { PresentMonService } from '../services/overlay/PresentMonService.js'
import { OverlayService } from '../services/overlay/OverlayService.js'
import HardwareService from '../services/HardwareService.js'
import nativeLatencyClient from '../services/NativeLatencyClient.js'
import HwSensorsDaemon from '../hal/collectors/HwSensorsDaemon.js'

/** `overlay:*`: in-game FPS/sensor overlay. Status goes out on `overlay:event`. */
export function registerOverlayIPC({ app, ipcMain, BrowserWindow, screen, hotkeys, dialog, logger } = {}) {
  let svc = null
  const broadcast = (msg) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (w === svc?.win) continue
      try { w.webContents.send('overlay:event', msg) } catch { /* closing */ }
    }
  }
  // created after "ready": BrowserWindow and screen need it
  const get = () => (svc ||= new OverlayService({
    app, BrowserWindow, screen, hotkeys, hardware: HardwareService, native: nativeLatencyClient, onEvent: broadcast, lhmSource: HwSensorsDaemon,
    presentMon: new PresentMonService({ toolsDir: path.join(app.getPath('userData'), 'tools') })
  }))

  const handle = (channel, fn) => ipcMain.handle(channel, async (event, payload) => {
    try { return await fn(payload ?? {}, event) } catch (err) {
      logger?.error?.('Overlay', `${channel}: ${err?.message ?? err}`)
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  handle('overlay:status', () => get().status())
  handle('overlay:show', ({ pid }) => get().show({ pid: pid ? Number(pid) : null }))
  handle('overlay:hide', () => get().hide())
  handle('overlay:setSettings', (patch) => get().setSettings(patch))
  // layout editor
  handle('overlay:layouts', () => get().layoutsState())
  handle('overlay:saveLayout', ({ layout }) => get().saveLayout(layout))
  handle('overlay:newLayout', ({ preset }) => get().newLayout(String(preset || 'rivatuner')))
  handle('overlay:deleteLayout', ({ id }) => get().deleteLayout(String(id)))
  handle('overlay:activateLayout', ({ id }) => get().activateLayout(String(id)))
  handle('overlay:preview', ({ layout }) => get().preview(layout))
  handle('overlay:processes', async () => {
    const list = await nativeLatencyClient.listProcesses().catch(() => null)
    return { ok: Boolean(list), processes: (list?.processes || []).filter((p) => p.pid > 4 && p.wsMb >= 150).sort((a, b) => b.wsMb - a.wsMb).slice(0, 40) }
  })
  handle('overlay:pickLogFolder', async (_p, event) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { properties: ['openDirectory', 'createDirectory'] })
    return r.canceled || !r.filePaths[0] ? { ok: true, canceled: true } : get().setSettings({ logFolder: r.filePaths[0] })
  })
  app.whenReady().then(() => get())
  app.on('will-quit', () => { try { svc?.dispose() } catch { /* quitting */ } })
}

export default registerOverlayIPC
