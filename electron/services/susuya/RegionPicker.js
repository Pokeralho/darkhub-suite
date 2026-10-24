// Selection overlay for region screenshots: a frameless, always-on-top window covering the display shows the
// frozen capture; the user drags a rectangle (Esc / right click cancels). The page has no preload and no Node: it
// reports the result by setting document.title ("dh-region:x,y,w,h" or "dh-region:cancel"), read here.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url)).replace(/app\.asar(?![.\w])/, 'app.asar.unpacked')
const PAGE = path.join(here, '..', '..', 'assets', 'region', 'region.html')
const TIMEOUT_MS = 2 * 60 * 1000

const NUM = /^-?\d+(?:\.\d+)?$/

/**
 * "dh-region:x,y,w,h,viewW,viewH" → {x,y,width,height} in the display's logical pixels. The page reports its own
 * viewport size so the selection is scaled even if Windows made the window slightly smaller than the display.
 * Anything else → null. Pure.
 */
export function parseRegionTitle(title, logical) {
  const t = String(title || '')
  if (!t.startsWith('dh-region:')) return null
  const parts = t.slice('dh-region:'.length).split(',')
  if (parts.length !== 6 || !parts.every((p) => NUM.test(p))) return null
  const [x, y, w, h, vw, vh] = parts.map(Number)
  if (!(vw > 0) || !(vh > 0) || w < 0 || h < 0) return null
  const sx = logical?.width ? logical.width / vw : 1
  const sy = logical?.height ? logical.height / vh : 1
  return { x: x * sx, y: y * sy, width: w * sx, height: h * sy }
}

let active = null // one overlay at a time (hotkey pressed twice)

export function makeRegionPicker(BrowserWindow) {
  return function pick(display, image) {
    if (active) return Promise.resolve(null)
    // JPEG is only the backdrop the user sees; the crop comes from the lossless capture.
    const tmp = path.join(os.tmpdir(), `darkhub-region-${process.pid}-${Date.now()}.jpg`)
    fs.writeFileSync(tmp, image.toJPEG(92))
    const { x, y, width, height } = display.bounds
    const win = new BrowserWindow({
      x, y, width, height,
      frame: false, thickFrame: false, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
      skipTaskbar: true, alwaysOnTop: true, hasShadow: false, show: false, enableLargerThanScreen: true,
      backgroundColor: '#000000', title: 'DarkHub',
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, devTools: false, spellcheck: false }
    })
    active = win
    return new Promise((resolve) => {
      let done = false
      const finish = (sel) => {
        if (done) return
        done = true
        active = null
        clearTimeout(timer)
        try { fs.unlinkSync(tmp) } catch { /* already gone */ }
        if (!win.isDestroyed()) win.destroy()
        resolve(sel)
      }
      const timer = setTimeout(() => finish(null), TIMEOUT_MS)
      win.webContents.on('page-title-updated', (e, title) => {
        e.preventDefault()
        if (!String(title).startsWith('dh-region:')) return
        finish(parseRegionTitle(title, display.size))
      })
      win.webContents.on('will-navigate', (e) => e.preventDefault())
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      win.on('blur', () => finish(null)) // Alt+Tab / another window took focus: cancel like the Snipping Tool
      win.on('closed', () => finish(null))
      win.once('ready-to-show', () => {
        win.setAlwaysOnTop(true, 'screen-saver')
        win.setBounds({ x, y, width, height })
        win.show()
        win.focus()
      })
      win.loadFile(PAGE, { query: { img: pathToFileURL(tmp).href } }).catch(() => finish(null))
    })
  }
}
