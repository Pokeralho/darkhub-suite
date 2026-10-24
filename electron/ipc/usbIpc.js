import { UsbService } from '../services/usb/UsbService.js'

/** `usb:*`: USB ports screen (devices per port, turn devices off/on, storage policies, safe eject, history). */
export function registerUsbIPC({ ipcMain, logger } = {}) {
  const svc = new UsbService()
  const handle = (channel, fn) => ipcMain.handle(channel, async (_e, payload) => {
    try { return await fn(payload ?? {}) } catch (err) {
      logger?.error?.('Usb', `${channel}: ${err?.message ?? err}`)
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  handle('usb:list', () => svc.list())
  handle('usb:setDeviceEnabled', ({ device, enabled }) => svc.setDeviceEnabled(device || {}, Boolean(enabled)))
  handle('usb:keepDisabled', ({ instanceId }) => svc.keepDisabled(String(instanceId)))
  handle('usb:setStorageBlocked', ({ on }) => svc.setStorageBlocked(Boolean(on)))
  handle('usb:setWriteProtect', ({ on }) => svc.setWriteProtect(Boolean(on)))
  handle('usb:setSelectiveSuspend', ({ on }) => svc.setSelectiveSuspend(Boolean(on)))
  handle('usb:eject', ({ letter }) => svc.eject(String(letter)))
}

export default registerUsbIPC
