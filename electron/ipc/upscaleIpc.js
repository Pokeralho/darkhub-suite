import fs from 'node:fs'
import path from 'node:path'
import Dlss5Service from '../services/dlss5/Dlss5Service.js'
import { DlssUpdater } from '../services/upscale/DlssUpdater.js'
import { Autopilot } from '../services/upscale/Autopilot.js'

/** `upscale:*`: NVIDIA DLSS runtime updates per game and DLSS 5 neural rendering through DLSS 5 Autopilot. */
export function registerUpscaleIPC({ app, ipcMain, BrowserWindow, logger } = {}) {
  const userData = app.getPath('userData')
  const updater = new DlssUpdater(path.join(userData, 'dlss-runtimes'))
  const autopilot = new Autopilot(path.join(userData, 'tools'))
  const steam = new Dlss5Service(app)
  let chain = Promise.resolve() // game-folder writes run one at a time

  const send = (msg) => { for (const w of BrowserWindow.getAllWindows()) { try { w.webContents.send('upscale:log', msg) } catch { /* closing */ } } }
  const serial = (fn) => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run }
  const gameDir = (p) => {
    const dir = path.resolve(String(p?.dir || ''))
    if (!path.isAbsolute(dir) || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error('pasta do jogo inválida')
    return dir
  }
  const handle = (channel, fn) => ipcMain.handle(channel, async (_e, payload) => {
    try { return await fn(payload ?? {}) } catch (err) {
      logger?.error?.('Upscale', `${channel}: ${err?.message ?? err}`)
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  handle('upscale:dlssLatest', async () => ({ ok: true, ...(await updater.latest()) }))
  handle('upscale:inspectGame', async (p) => ({ ok: true, dir: gameDir(p), ...(await updater.inspect(gameDir(p))) }))
  handle('upscale:updateGame', (p) => serial(() => updater.update(gameDir(p), { force: p.force === true, onLog: (line) => send({ dir: p.dir, line }) })))
  handle('upscale:restoreGame', (p) => serial(() => updater.restore(gameDir(p))))
  // Every Steam game, with the DLSS runtimes it ships and whether NVIDIA has a newer build.
  handle('upscale:scanLibrary', async () => {
    const latest = await updater.latest()
    const games = await steam.getInstalledSteamGames()
    const rows = []
    for (const g of games) {
      if (!g.installDir || !fs.existsSync(g.installDir)) continue
      const info = await updater.inspect(g.installDir)
      if (info.files.length) rows.push({ name: g.name, dir: g.installDir, appId: g.appId, anticheat: info.anticheat, files: info.files })
      await new Promise((r) => setImmediate(r)) // keep the main process responsive while walking big folders
    }
    return { ok: true, latest: latest.version, games: rows }
  })

  handle('upscale:autopilotStatus', async () => ({ ok: true, ...(await autopilot.status()) }))
  handle('upscale:autopilotInstall', async () => ({ ok: true, installed: await autopilot.install() }))
  handle('upscale:autopilotLaunch', () => ({ ok: true, ...autopilot.launch() }))
}

export default registerUpscaleIPC
