// Screen color picker: hides DarkHub, takes one still image of every monitor, and shows each image full screen with a
// magnifier. A click returns that pixel's color; Esc or a right click cancels. The images live only in memory while
// the picker is open and nothing but the chosen color leaves this service.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PAGE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'picker', 'picker.html')
const TIMEOUT_MS = 2 * 60_000

export class ScreenPicker {
  /** deps: { BrowserWindow, screen, desktopCapturer, ipcMain, getMainWindow } */
  constructor(deps) {
    Object.assign(this, deps)
    this.busy = null
  }

  /** Resolves to { ok: true, hex, rgb: [r, g, b], x, y } or { ok: false, canceled: true }. One pick at a time. */
  pick() {
    if (!this.busy) this.busy = this._pick().finally(() => { this.busy = null })
    return this.busy
  }

  async _pick() {
    const main = this.getMainWindow?.()
    const wasVisible = Boolean(main && !main.isDestroyed() && main.isVisible() && !main.isMinimized())
    if (wasVisible) { main.hide(); await sleep(220) } // let the compositor drop DarkHub from the screen first
    const windows = []
    try {
      const displays = this.screen.getAllDisplays()
      const largest = displays.reduce((m, d) => ({ width: Math.max(m.width, Math.round(d.size.width * d.scaleFactor)), height: Math.max(m.height, Math.round(d.size.height * d.scaleFactor)) }), { width: 0, height: 0 })
      const sources = await this.desktopCapturer.getSources({ types: ['screen'], thumbnailSize: largest })
      const result = await new Promise((resolve) => {
        let done = false
        const finish = (value) => { if (done) return; done = true; clearTimeout(timer); this.ipcMain.removeListener('picker:result', onResult); resolve(value) }
        const timer = setTimeout(() => finish({ ok: false, canceled: true }), TIMEOUT_MS)
        const onResult = (event, payload) => {
          if (!windows.some((w) => !w.isDestroyed() && w.webContents === event.sender)) return
          const rgb = Array.isArray(payload?.rgb) ? payload.rgb.slice(0, 3).map((v) => Math.max(0, Math.min(255, Math.round(Number(v) || 0)))) : null
          if (!payload?.ok || !rgb) return finish({ ok: false, canceled: true })
          finish({ ok: true, rgb, hex: '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join(''), x: Math.round(Number(payload.x) || 0), y: Math.round(Number(payload.y) || 0) })
        }
        this.ipcMain.on('picker:result', onResult)
        displays.forEach((d, i) => {
          const src = sources.find((s) => s.display_id === String(d.id)) || sources[i]
          if (!src || src.thumbnail.isEmpty()) return
          const win = new this.BrowserWindow({
            x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
            frame: false, show: false, skipTaskbar: true, resizable: false, movable: false, alwaysOnTop: true, fullscreenable: false,
            hasShadow: false, backgroundColor: '#000000',
            webPreferences: { preload: path.join(path.dirname(PAGE), 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
          })
          win.setAlwaysOnTop(true, 'screen-saver')
          win.on('closed', () => { if (windows.every((w) => w.isDestroyed())) finish({ ok: false, canceled: true }) })
          windows.push(win)
          const image = src.thumbnail.toDataURL()
          win.loadFile(PAGE).then(() => {
            if (win.isDestroyed()) return
            win.setBounds(d.bounds)
            win.webContents.send('picker:image', { image, origin: { x: d.bounds.x, y: d.bounds.y } })
            win.show()
            if (d.bounds.x <= this.screen.getCursorScreenPoint().x && this.screen.getCursorScreenPoint().x < d.bounds.x + d.bounds.width) win.focus()
          }).catch(() => finish({ ok: false, canceled: true }))
        })
        if (!windows.length) finish({ ok: false, error: 'Nenhuma tela capturada.' })
      })
      return result
    } finally {
      for (const w of windows) { if (!w.isDestroyed()) w.destroy() }
      if (wasVisible && main && !main.isDestroyed()) { main.show(); main.focus() }
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
