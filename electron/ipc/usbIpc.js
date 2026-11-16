import { UsbService } from '../services/usb/UsbService.js'

const UNSUPPORTED = { ok: false, unsupported: true, platform: process.platform, reason: 'windows-only', error: 'Gerenciamento de USB é suportado apenas no Windows.' }

/** `usb:*`: USB ports screen (devices per port, turn devices off/on, storage policies, safe eject, history). */
export function registerUsbIPC({ ipcMain, logger } = {}) {
  const channels = ['usb:list', 'usb:setDeviceEnabled', 'usb:keepDisabled', 'usb:setStorageBlocked', 'usb:setWriteProtect', 'usb:setSelectiveSuspend', 'usb:eject']
  if (process.platform !== 'win32') {
    for (const ch of channels) ipcMain.handle(ch, async () => UNSUPPORTED)
    return
  }
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
