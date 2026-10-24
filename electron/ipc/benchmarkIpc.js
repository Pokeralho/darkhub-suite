import { BenchmarkService } from '../services/benchmark/BenchmarkService.js'

/** `bench:*`: before/after benchmark (run, cancel, history, compare). Progress goes out on `bench:event`. */
export function registerBenchmarkIPC({ app, ipcMain, BrowserWindow, logger } = {}) {
  const broadcast = (msg) => { for (const w of BrowserWindow.getAllWindows()) { try { w.webContents.send('bench:event', msg) } catch { /* closing */ } } }
  const svc = new BenchmarkService({ app, onEvent: broadcast })
  const handle = (channel, fn) => ipcMain.handle(channel, async (_e, payload) => {
    try { return await fn(payload ?? {}) } catch (err) {
      logger?.error?.('Benchmark', `${channel}: ${err?.message ?? err}`)
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  handle('bench:run', (p) => svc.run(p))
  handle('bench:cancel', () => svc.cancel())
  handle('bench:history', () => ({ ok: true, runs: svc.history() }))
  handle('bench:compare', ({ a, b }) => svc.compare(String(a), String(b)))
  handle('bench:remove', ({ id }) => svc.remove(String(id)))
  app.on('before-quit', () => svc.cancel())
}

export default registerBenchmarkIPC
