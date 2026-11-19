// Overlay interativo transparente para marcação visual de múltiplos pontos na tela com ordem de prioridade (#1, #2, #3...).
// Captura a coordenada física real do cursor (screen.dipToScreenPoint) no instante exato de cada clique,
// garantindo precisão de 1px em monitores High-DPI (125%, 150%, 200%) e setups multi-monitor.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const POINTS_PAGE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'points', 'points.html')
const TIMEOUT_MS = 5 * 60 * 1000

let activeOverlay = null

export function computeVirtualScreenBounds(displays = []) {
  if (!Array.isArray(displays) || displays.length === 0) {
    return { x: 0, y: 0, width: 1920, height: 1080 }
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const d of displays) {
    const b = d?.bounds
    if (!b) continue
    if (b.x < minX) minX = b.x
    if (b.y < minY) minY = b.y
    if (b.x + b.width > maxX) maxX = b.x + b.width
    if (b.y + b.height > maxY) maxY = b.y + b.height
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 1920, height: 1080 }
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) }
}

export function makePointPicker({ BrowserWindow, screen }) {
  return function pickPoints(mainWindow = null) {
    if (activeOverlay) return Promise.resolve({ canceled: true, points: [] })

    const displays = screen.getAllDisplays()
    const bounds = computeVirtualScreenBounds(displays)

    let hidMain = false
    try {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized()) {
        mainWindow.setOpacity(0)
        hidMain = true
      }
    } catch { /* optional */ }

    const win = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      transparent: true,
      frame: false,
      thickFrame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      show: false,
      enableLargerThanScreen: true,
      backgroundColor: '#00000000',
      title: 'DarkHub',
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        devTools: false,
        spellcheck: false
      }
    })
    activeOverlay = win

    const picked = []

    return new Promise((resolve) => {
      let finished = false
      const finish = (result) => {
        if (finished) return
        finished = true
        activeOverlay = null
        clearTimeout(timer)
        if (!win.isDestroyed()) win.destroy()
        if (hidMain && mainWindow && !mainWindow.isDestroyed()) {
          try {
            mainWindow.setOpacity(1)
            mainWindow.focus()
          } catch {}
        }
        resolve(result)
      }

      const timer = setTimeout(() => finish({ canceled: true, points: [] }), TIMEOUT_MS)

      win.webContents.on('page-title-updated', (e, title) => {
        e.preventDefault()
        const t = String(title || '')
        if (!t.startsWith('dh-points:')) return
        const cmd = t.slice('dh-points:'.length)

        if (cmd === 'cancel') {
          finish({ canceled: true, points: [] })
          return
        }
        if (cmd.startsWith('undo:')) {
          picked.pop()
          return
        }
        if (cmd.startsWith('add:')) {
          const parts = cmd.split(':')
          const fallbackX = bounds.x + (Number(parts[2]) || 0)
          const fallbackY = bounds.y + (Number(parts[3]) || 0)
          let phys = { x: fallbackX, y: fallbackY }
          try {
            const dip = screen.getCursorScreenPoint()
            phys = typeof screen.dipToScreenPoint === 'function' ? screen.dipToScreenPoint(dip) : dip
          } catch {}
          picked.push({ x: Math.round(phys.x), y: Math.round(phys.y) })
          return
        }
        if (cmd.startsWith('done:')) {
          finish({ canceled: picked.length === 0, points: picked.slice() })
        }
      })

      win.webContents.on('will-navigate', (e) => e.preventDefault())
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      win.on('closed', () => finish({ canceled: true, points: [] }))

      win.once('ready-to-show', () => {
        win.setAlwaysOnTop(true, 'screen-saver')
        win.setBounds(bounds)
        win.show()
        win.focus()
      })

      win.loadFile(POINTS_PAGE, { query: { ox: String(bounds.x), oy: String(bounds.y) } }).catch(() => {
        finish({ canceled: true, points: [] })
      })
    })
  }
}
