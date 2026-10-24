import HwSensorsDaemon, { isPawnIoInstalled, forgetPawnIoCheck } from '../hal/collectors/HwSensorsDaemon.js'
import { installPawnIo } from '../services/hwsensors/pawnio.js'
import SensorBus from '../hal/collectors/SensorBus.js'
import fs from 'node:fs'
import path from 'node:path'

const AUTO_RETRY_MS = 7 * 24 * 3600 * 1000

/**
 * At launch: advanced sensors on by default, so they start with the app; and when DarkHub runs elevated without the
 * PawnIO driver, the official driver is installed once in the background (pinned SHA-256 + Authenticode), so the
 * CPU temperature works without a click. A failed attempt is not repeated for a week.
 */
export async function bootAdvancedSensors({ app, logger } = {}) {
  if (!HwSensorsDaemon.enabled) return { started: false }
  SensorBus.prewarmAdvanced()
  if (isPawnIoInstalled()) return { started: true, pawnio: true }
  const Elevation = (await import('../services/optimizer/ElevationHelper.js')).default
  if (!(await Elevation.isElevated().catch(() => false))) return { started: true, pawnio: false }
  const stamp = path.join(app.getPath('userData'), 'pawnio-auto.json')
  let last = 0
  try { last = JSON.parse(fs.readFileSync(stamp, 'utf8')).at || 0 } catch { /* never tried */ }
  if (Date.now() - last < AUTO_RETRY_MS) return { started: true, pawnio: false }
  try { fs.writeFileSync(stamp, JSON.stringify({ at: Date.now() })) } catch { /* retried next launch */ }
  const r = await installPawnIo((script, ms) => Elevation.runMarked(script, ms))
  forgetPawnIoCheck()
  logger?.info?.('HwSensors', `PawnIO auto-install: ${r.ok ? 'ok' : r.error}`)
  if (r.ok) SensorBus.setAdvanced(true) // restart LHM so it opens the driver
  return { started: true, pawnio: r.ok, reboot: Boolean(r.reboot), error: r.ok ? null : r.error }
}

/** `hwsensors:*`: advanced sensors (LibreHardwareMonitorLib + PawnIO driver). */
export function registerHwSensorsIPC({ app, ipcMain, logger } = {}) {
  if (app?.whenReady) app.whenReady().then(() => {
    const t = setTimeout(() => { bootAdvancedSensors({ app, logger }).catch((e) => logger?.warn?.('HwSensors', `boot: ${e?.message ?? e}`)) }, 4000)
    t.unref?.()
  })
  const handle = (channel, fn) => ipcMain.handle(channel, async (_e, payload) => {
    try { return await fn(payload ?? {}) } catch (err) {
      try { logger?.error?.('HwSensors', `${channel}: ${err?.message ?? err}`) } catch { /* ignore */ }
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  const elevated = async (script, ms) => (await import('../services/optimizer/ElevationHelper.js')).default.runMarked(script, ms)

  handle('hwsensors:status', () => HwSensorsDaemon.status())
  // Turning advanced sensors on also installs the PawnIO driver when it is missing (one action for the user).
  // Without the driver the sensors still run (GPU, disks); the error is reported, never hidden.
  handle('hwsensors:setEnabled', async (p) => {
    if (p.enabled !== true) { SensorBus.setAdvanced(false); return HwSensorsDaemon.status() }
    let install = null
    if (!isPawnIoInstalled()) { install = await installPawnIo(elevated); forgetPawnIoCheck() }
    SensorBus.setAdvanced(true)
    return { ...HwSensorsDaemon.status(), ...(install && !install.ok ? { error: `Driver PawnIO: ${install.error}` } : {}), reboot: Boolean(install?.reboot) }
  })
}

export default registerHwSensorsIPC
