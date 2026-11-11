import path from 'node:path'
import { PresentMonService } from '../services/overlay/PresentMonService.js'
import { OverlayService } from '../services/overlay/OverlayService.js'
import HardwareService from '../services/HardwareService.js'
import nativeLatencyClient from '../services/NativeLatencyClient.js'
import HwSensorsDaemon from '../hal/collectors/HwSensorsDaemon.js'
import { downloadToFile } from '../services/SecureDownload.js'
import { PsuCatalog } from '../services/overlay/psuCatalog.js'
import { normalizePower, psuCurve, psuEfficiency } from '../services/overlay/powerModel.js'
import { solveCalibration } from '../services/overlay/wallCalibration.js'

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
  handle('overlay:power', () => get().power())
  handle('overlay:resetEnergy', () => get().resetEnergy())
  // real PSU from the 80 PLUS catalog (downloaded on request, cached in userData; see psuCatalog.js)
  let catalog = null
  const psuCatalog = () => (catalog ||= new PsuCatalog({ dir: app.getPath('userData'), download: downloadToFile }))
  handle('overlay:psuCatalogStatus', () => psuCatalog().status())
  handle('overlay:psuSearch', ({ query, refresh, mains }) => psuCatalog().search({ query: String(query ?? '').slice(0, 80), refresh: Boolean(refresh), mains }))
  // two-point wall calibration (wallCalibration.js): solve against the current PSU curve and hardware, optionally save
  handle('overlay:calibrate', ({ points, save }) => {
    const svc = get()
    const now = svc.power()
    const d = now.derived
    if (d?.cpuW == null || d?.gpuW == null) return { ok: false, error: 'no_cpu' }
    if (!d.calibration?.hwId) return { ok: false, error: 'no_hw_id' }
    const pts = Array.isArray(points) ? points.slice(0, 3) : []
    // the renderer measured the stability window; a point without it is not accepted
    if (pts.some((p) => !Number.isFinite(Number(p?.spread)) || !Number.isFinite(Number(p?.std)))) return { ok: false, error: 'unstable' }
    const s = normalizePower(svc.settings)
    const curve = psuCurve(s.psuRating, s.psuCustom)
    const fit = solveCalibration({ points: pts, psuWatts: s.psuWatts, efficiency: (load) => psuEfficiency(load, curve) })
    if (!fit.ok || !save) return fit
    const r = svc.setSettings({ powerCal: { at: Date.now(), hwId: d.calibration.hwId, extraW: fit.extraW, effScale: fit.effScale, points: fit.points, sigma: fit.sigma } })
    return { ...fit, saved: true, settings: r.settings }
  })
  handle('overlay:clearCalibration', () => get().setSettings({ powerCal: null }))
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
