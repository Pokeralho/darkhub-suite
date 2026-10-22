import WindowsToolsEngine from '../services/optimizer/WindowsToolsEngine.js'

/** `wintools:*`: Windows features, repairs and classic panels. Inputs are ids checked against whitelists in the engine. */
export function registerWinToolsIPC({ ipcMain, logger, engine = WindowsToolsEngine } = {}) {
  const handle = (channel, fn) => ipcMain.handle(channel, async (_e, payload) => {
    try { return await fn(payload ?? {}) } catch (err) {
      try { logger?.error?.('WinTools', `${channel}: ${err?.message ?? err}`) } catch { /* ignore */ }
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  handle('wintools:listFeatures', () => engine.listFeatures())
  handle('wintools:setFeature', (p) => engine.setFeature(String(p.id || ''), p.enable === true))
  handle('wintools:run', (p) => engine.run(String(p.action || '')))
  handle('wintools:openPanel', (p) => engine.openPanel(String(p.id || '')))
}

export default registerWinToolsIPC
