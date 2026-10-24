import path from 'node:path'
import Dlss5Service from '../services/dlss5/Dlss5Service.js'
import { SaveBackupService } from '../services/saves/SaveBackupService.js'
import appEvents from '../services/appEvents.js'
import { loadLibrary } from '../libraryStore.js'

let instance = null
/** The running service (used by scheduled maintenance), or null before registration. */
export const getSaveBackupService = () => instance

/** `saves:*`: game save backup and restore. Progress goes out on `saves:event`. */
export function registerSaveBackupIPC({ app, ipcMain, BrowserWindow, dialog, shell, logger } = {}) {
  const broadcast = (msg) => { for (const w of BrowserWindow.getAllWindows()) { try { w.webContents.send('saves:event', msg) } catch { /* closing */ } } }
  const steam = new Dlss5Service(app)
  // installed games: Steam libraries plus everything in the DarkHub Library
  const getInstalledGames = async () => {
    const out = []
    try { for (const g of await steam.getInstalledSteamGames()) out.push({ name: g.name, appId: g.appId, installDir: g.installDir }) } catch { /* no Steam */ }
    try {
      for (const g of (await loadLibrary(app)).games || []) {
        const dir = g.workingDir || (g.exePath ? path.dirname(g.exePath) : null)
        if (g.name) out.push({ name: g.name, installDir: dir })
      }
    } catch { /* empty library */ }
    return out
  }
  const svc = new SaveBackupService({ app, getInstalledGames, onEvent: broadcast })
  instance = svc
  appEvents.on('gameStopped', (g) => { void svc.onGameClosed(g) })

  const handle = (channel, fn) => ipcMain.handle(channel, async (event, payload) => {
    try { return await fn(payload ?? {}, event) } catch (err) {
      logger?.error?.('Saves', `${channel}: ${err?.message ?? err}`)
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  handle('saves:scan', ({ refreshManifest }) => svc.scan({ refreshManifest: Boolean(refreshManifest) }))
  handle('saves:backup', ({ name, label }) => svc.backup(String(name), { label }))
  handle('saves:backupAll', () => svc.backupAll())
  handle('saves:versions', ({ name }) => ({ ok: true, versions: svc.versions(String(name)) }))
  handle('saves:previewRestore', ({ name, id }) => svc.previewRestore(String(name), String(id)))
  handle('saves:restore', ({ name, id }) => svc.restore(String(name), String(id)))
  handle('saves:removeVersion', ({ name, id }) => svc.removeVersion(String(name), String(id)))
  handle('saves:setSettings', (patch) => svc.setSettings(patch))
  handle('saves:pickFolder', async (_p, event) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { properties: ['openDirectory', 'createDirectory'] })
    return r.canceled || !r.filePaths[0] ? { ok: true, canceled: true } : { ok: true, path: r.filePaths[0] }
  })
  handle('saves:addCustom', async ({ name }, event) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { properties: ['openDirectory', 'openFile', 'multiSelections'] })
    if (r.canceled || !r.filePaths.length) return { ok: true, canceled: true }
    const label = String(name || path.basename(r.filePaths[0])).trim().slice(0, 100)
    const s = svc.settings()
    svc.setSettings({ custom: [...s.custom.filter((c) => c.name !== label), { name: label, paths: r.filePaths }] })
    return svc.scan()
  })
  handle('saves:removeCustom', ({ name }) => {
    const s = svc.settings()
    svc.setSettings({ custom: s.custom.filter((c) => c.name !== String(name)) })
    return svc.scan()
  })
  handle('saves:openFolder', async ({ name }) => {
    const dir = name ? svc._gameDir(String(name)) : svc.settings().backupRoot
    await shell.openPath(dir)
    return { ok: true }
  })
}

export default registerSaveBackupIPC
