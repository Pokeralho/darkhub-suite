import os from 'node:os'
import path from 'node:path'
import { DownloadManager } from './DownloadManager.js'

/**
 * Registers the `downloads:*` IPC surface. Only ids travel between renderer and main for
 * file operations: paths are always looked up from the manager, never trusted from the UI.
 */
export function registerDownloadsIPC({ app, ipcMain, dialog, shell, BrowserWindow, logger }) {
  // getPath('downloads') throws when the Downloads known folder cannot be resolved (redirected to a missing drive,
  // offline OneDrive, broken profile): fall back to the profile folder instead of failing the app's startup.
  let downloadsDir
  try { downloadsDir = app.getPath('downloads') } catch { downloadsDir = path.join(os.homedir(), 'Downloads') }
  const manager = new DownloadManager({
    dataDir: path.join(app.getPath('userData'), 'downloads'),
    defaultDownloadDir: path.join(downloadsDir, 'DarkHub'),
    logger
  })

  const ready = manager.init().catch((err) => {
    logger?.error?.('Downloads', `init failed: ${err?.message ?? err}`)
  })

  const broadcast = (list) => {
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        if (win.isDestroyed() || win.isMinimized() || !win.isVisible()) continue
        win.webContents.send('downloads:update', list)
      } catch { /* window closing */ }
    }
  }
  manager.on('update', broadcast)

  // The destination folder can only be changed to a folder the user picked in the native dialog.
  let pickedDir = null

  const handle = (channel, fn) => {
    ipcMain.handle(channel, async (_event, payload) => {
      try {
        await ready
        return await fn(payload ?? {})
      } catch (err) {
        return { ok: false, error: err?.message ?? String(err) }
      }
    })
  }

  handle('downloads:list', () => ({ ok: true, items: manager.list(), settings: manager.getSettings() }))
  handle('downloads:add', (p) => manager.add({
    url: p.url, fileName: p.fileName, connections: p.connections,
    speedLimitKBps: p.speedLimitKBps, sha256: p.sha256, referer: p.referer, startNow: p.startNow !== false
  }))
  handle('downloads:pause', (p) => manager.pause(String(p.id)))
  handle('downloads:resume', (p) => manager.resume(String(p.id)))
  handle('downloads:pauseAll', () => manager.pauseAll())
  handle('downloads:resumeAll', () => manager.resumeAll())
  handle('downloads:cancel', (p) => manager.cancel(String(p.id), { deleteFiles: p.deleteFiles !== false }))
  handle('downloads:remove', (p) => manager.remove(String(p.id), { deleteFile: Boolean(p.deleteFile) }))
  handle('downloads:clearFinished', () => manager.clearFinished())
  handle('downloads:getSettings', () => ({ ok: true, settings: manager.getSettings() }))
  handle('downloads:setSettings', async (p) => {
    const patch = { ...p }
    if (patch.downloadDir !== undefined && (!pickedDir || path.resolve(String(patch.downloadDir)) !== pickedDir)) delete patch.downloadDir
    return { ok: true, settings: await manager.setSettings(patch) }
  })

  handle('downloads:showInFolder', (p) => {
    const file = manager.getFilePath(String(p.id))
    if (!file) return { ok: false, error: 'file-not-found' }
    shell.showItemInFolder(file)
    return { ok: true }
  })

  handle('downloads:chooseDir', async () => {
    const res = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (res.canceled || !res.filePaths[0]) return { ok: false, canceled: true }
    pickedDir = path.resolve(res.filePaths[0])
    return { ok: true, dir: pickedDir }
  })

  return {
    manager,
    shutdown: () => manager.shutdown()
  }
}

export default registerDownloadsIPC
