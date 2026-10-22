import HwSensorsDaemon, { isPawnIoInstalled, forgetPawnIoCheck } from '../hal/collectors/HwSensorsDaemon.js'
import { installPawnIo } from '../services/hwsensors/pawnio.js'
import SensorBus from '../hal/collectors/SensorBus.js'

/** `hwsensors:*`: advanced sensors (LibreHardwareMonitorLib + PawnIO driver). */
export function registerHwSensorsIPC({ ipcMain, logger } = {}) {
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
