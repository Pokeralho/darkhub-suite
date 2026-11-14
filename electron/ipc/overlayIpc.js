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
  const unsupported = (extra = {}) => ({ ok: false, unsupported: true, platform: process.platform, reason: 'windows-only', error: 'In-game overlay is only supported on Windows.', ...extra })
  // created after "ready": BrowserWindow and screen need it
  const get = () => {
    if (process.platform !== 'win32') return null
    return (svc ||= new OverlayService({
      app, BrowserWindow, screen, hotkeys, hardware: HardwareService, native: nativeLatencyClient, onEvent: broadcast, lhmSource: HwSensorsDaemon,
      presentMon: new PresentMonService({ toolsDir: path.join(app.getPath('userData'), 'tools') })
    }))
  }

  const handle = (channel, fn) => ipcMain.handle(channel, async (event, payload) => {
    try { return await fn(payload ?? {}, event) } catch (err) {
      logger?.error?.('Overlay', `${channel}: ${err?.message ?? err}`)
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  const handleWin = (channel, fn) => ipcMain.handle(channel, async (event, payload) => {
    if (process.platform !== 'win32') return unsupported()
    try { return await fn(get(), payload ?? {}, event) } catch (err) {
      logger?.error?.('Overlay', `${channel}: ${err?.message ?? err}`)
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  handle('overlay:status', () => process.platform === 'win32' ? get().status() : { ok: true, supported: false, unsupported: true, platform: process.platform, visible: false, settings: null, target: null, mode: 'foreground', capturing: false, presentMonInstalled: false, error: null, displays: [], displayId: null })
  handleWin('overlay:show', (svc, { pid }) => svc.show({ pid: pid ? Number(pid) : null }))
  handleWin('overlay:hide', (svc) => svc.hide())
  handleWin('overlay:setSettings', (svc, patch) => svc.setSettings(patch))
  handleWin('overlay:power', (svc) => svc.power())
  handleWin('overlay:resetEnergy', (svc) => svc.resetEnergy())
  // real PSU from the 80 PLUS catalog (downloaded on request, cached in userData; see psuCatalog.js)
  let catalog = null
  const psuCatalog = () => (catalog ||= new PsuCatalog({ dir: app.getPath('userData'), download: downloadToFile }))
  handle('overlay:psuCatalogStatus', () => process.platform === 'win32' ? psuCatalog().status() : unsupported())
  handle('overlay:psuSearch', ({ query, refresh, mains }) => process.platform === 'win32' ? psuCatalog().search({ query: String(query ?? '').slice(0, 80), refresh: Boolean(refresh), mains }) : unsupported())
  // two-point wall calibration (wallCalibration.js): solve against the current PSU curve and hardware, optionally save
  handleWin('overlay:calibrate', (svc, { points, save }) => {
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
  handleWin('overlay:clearCalibration', (svc) => svc.setSettings({ powerCal: null }))
  // layout editor
  handleWin('overlay:layouts', (svc) => svc.layoutsState())
  handleWin('overlay:saveLayout', (svc, { layout }) => svc.saveLayout(layout))
  handleWin('overlay:newLayout', (svc, { preset }) => svc.newLayout(String(preset || 'rivatuner')))
  handleWin('overlay:deleteLayout', (svc, { id }) => svc.deleteLayout(String(id)))
  handleWin('overlay:activateLayout', (svc, { id }) => svc.activateLayout(String(id)))
  handleWin('overlay:preview', (svc, { layout }) => svc.preview(layout))
  handle('overlay:processes', async () => {
    if (process.platform !== 'win32') return unsupported({ processes: [] })
    const list = await nativeLatencyClient.listProcesses().catch(() => null)
    return { ok: Boolean(list), processes: (list?.processes || []).filter((p) => p.pid > 4 && p.wsMb >= 150).sort((a, b) => b.wsMb - a.wsMb).slice(0, 40) }
  })
  handleWin('overlay:pickLogFolder', async (svc, _p, event) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { properties: ['openDirectory', 'createDirectory'] })
    return r.canceled || !r.filePaths[0] ? { ok: true, canceled: true } : svc.setSettings({ logFolder: r.filePaths[0] })
  })
  app.whenReady().then(() => { if (process.platform === 'win32') get() })
  app.on('will-quit', () => { try { svc?.dispose() } catch { /* quitting */ } })
}

export default registerOverlayIPC
