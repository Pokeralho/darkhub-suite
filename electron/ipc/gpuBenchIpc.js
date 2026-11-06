import { GpuBenchService } from '../services/gpubench/GpuBenchService.js'
import HardwareService from '../services/HardwareService.js'

/** Small JPEG of the last frame, kept with a ranked run so a reviewer can see what was rendered. */
async function toJpeg(rgba, width, height) {
  const { default: sharp } = await import('sharp')
  const out = await sharp(rgba, { raw: { width, height, channels: 4 } }).removeAlpha().resize(960).jpeg({ quality: 70 }).toBuffer()
  return out.toString('base64')
}

/** `gpubench:*`: GPU benchmark runs and the link to the Hub ranking. Progress goes out on `gpubench:event`. */
export function registerGpuBenchIPC({ app, ipcMain, BrowserWindow, shell, safeStorage, logger } = {}) {
  const broadcast = (msg) => { for (const w of BrowserWindow.getAllWindows()) { try { w.webContents.send('gpubench:event', msg) } catch { /* closing */ } } }
  const svc = new GpuBenchService({ app, safeStorage, shell, hardware: HardwareService, onEvent: broadcast, toJpeg })
  const handle = (channel, fn) => ipcMain.handle(channel, async (_e, payload) => {
    try { return await fn(payload ?? {}) } catch (err) {
      logger?.error?.('GpuBench', `${channel}: ${err?.message ?? err}`)
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  handle('gpubench:status', () => svc.status())
  handle('gpubench:run', (p) => svc.run({ ranked: Boolean(p.ranked), quick: Boolean(p.quick), label: String(p.label ?? '') }))
  handle('gpubench:stress', (p) => svc.stress({ minutes: p.minutes, load: p.load, tempLimit: p.tempLimit }))
  handle('gpubench:removeStress', ({ id }) => svc.removeStress(String(id)))
  handle('gpubench:cancel', () => svc.cancel())
  handle('gpubench:remove', ({ id }) => svc.remove(String(id)))
  handle('gpubench:link', () => svc.link())
  handle('gpubench:unlink', () => svc.unlink())
  handle('gpubench:openRanking', ({ id }) => svc.openRanking(id ? String(id) : null))
  app.on('before-quit', () => svc.cancel())
}

export default registerGpuBenchIPC
