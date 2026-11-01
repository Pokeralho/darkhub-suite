// Native-resolution screenshots: the display under the mouse (or the primary, a chosen one, or all of them stitched
// together, per the `monitor` setting) is captured at its physical pixel size (logical size x
// scale factor, so a 4K monitor at 150% gives 3840x2160, not 2560x1440) and saved as lossless PNG.
// Region capture (like the Windows Snipping Tool): the screen is frozen first, the user drags a rectangle over the
// frozen image and only that part is cropped from the physical-size capture.
import { desktopCapturer, nativeImage, screen } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const pad = (n) => String(n).padStart(2, '0')
export function screenshotName(d = new Date()) {
  return `DarkHub_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.png`
}

/** Physical pixel size of a display. Pure. */
export function physicalSize(display) {
  const f = display.scaleFactor || 1
  return { width: Math.round(display.size.width * f), height: Math.round(display.size.height * f) }
}

/**
 * Selection in logical (DIP) pixels relative to the display → crop rectangle in the captured image's pixels,
 * clamped to the image. Null when the selection is too small to be intentional (a click, not a drag). Pure.
 */
export function cropRect(sel, logical, image, minPx = 3) {
  if (!sel || !logical?.width || !logical?.height || !image?.width || !image?.height) return null
  const sx = image.width / logical.width
  const sy = image.height / logical.height
  const clampX = (v) => Math.max(0, Math.min(image.width, Math.round(v * sx)))
  const clampY = (v) => Math.max(0, Math.min(image.height, Math.round(v * sy)))
  const x0 = clampX(Math.min(sel.x, sel.x + sel.width))
  const x1 = clampX(Math.max(sel.x, sel.x + sel.width))
  const y0 = clampY(Math.min(sel.y, sel.y + sel.height))
  const y1 = clampY(Math.max(sel.y, sel.y + sel.height))
  if (x1 - x0 < minPx || y1 - y0 < minPx) return null
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

/** Monitors for the settings list. */
export function listDisplays() {
  const primary = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((d, i) => ({
    id: String(d.id), label: d.label || `Monitor ${i + 1}`, primary: d.id === primary,
    ...physicalSize(d), x: d.bounds.x, y: d.bounds.y, scaleFactor: d.scaleFactor
  }))
}

/**
 * Which displays a capture covers. `mode`: 'cursor' (under the mouse), 'primary', 'all', or a display id; an id that
 * is no longer connected falls back to the display under the mouse. Pure given the display list.
 */
export function pickDisplays(mode, displays, primaryId, cursorDisplayId) {
  const byId = (id) => displays.find((d) => String(d.id) === String(id))
  if (mode === 'all') return displays.slice()
  if (mode === 'primary') return [byId(primaryId) || displays[0]].filter(Boolean)
  if (mode && mode !== 'cursor' && byId(mode)) return [byId(mode)]
  return [byId(cursorDisplayId) || byId(primaryId) || displays[0]].filter(Boolean)
}

/**
 * Where each display goes on a canvas covering all of them, in physical pixels. Positions are the logical ones times
 * the largest scale factor, exact for a single scale factor and overlap-free for mixed DPI. Pure.
 */
export function layoutCanvas(displays) {
  const minX = Math.min(...displays.map((d) => d.bounds.x))
  const minY = Math.min(...displays.map((d) => d.bounds.y))
  const scale = Math.max(...displays.map((d) => d.scaleFactor || 1))
  const parts = displays.map((d) => ({
    left: Math.round((d.bounds.x - minX) * scale), top: Math.round((d.bounds.y - minY) * scale), ...physicalSize(d)
  }))
  return {
    width: Math.max(...parts.map((p) => p.left + p.width)),
    height: Math.max(...parts.map((p) => p.top + p.height)),
    parts,
    // logical rectangle the region overlay spans
    bounds: {
      x: minX, y: minY,
      width: Math.max(...displays.map((d) => d.bounds.x + d.bounds.width)) - minX,
      height: Math.max(...displays.map((d) => d.bounds.y + d.bounds.height)) - minY
    }
  }
}

/** Matches capture sources to displays. display_id can be empty on some multi-GPU systems: then the list order is used. Pure. */
export function matchSources(displays, sources) {
  return displays.map((d, i) =>
    sources.find((s) => s.display_id && String(s.display_id) === String(d.id))
    || (displays.length === 1 && sources.length === 1 ? sources[0] : null)
    || sources.find((s) => s.id === `screen:${i}:0`)
    || null)
}

async function captureSources(displays) {
  const biggest = displays.reduce((a, d) => { const p = physicalSize(d); return { width: Math.max(a.width, p.width), height: Math.max(a.height, p.height) } }, { width: 0, height: 0 })
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: biggest, fetchWindowIcons: false })
  return matchSources(displays, sources).map((src, i) => {
    if (!src || src.thumbnail.isEmpty()) throw new Error(`capture failed (${displays[i].label || displays[i].id})`)
    const want = physicalSize(displays[i])
    const got = src.thumbnail.getSize()
    return got.width === want.width && got.height === want.height ? src.thumbnail : src.thumbnail.resize({ width: want.width, height: want.height, quality: 'best' })
  })
}

/** Captures the displays chosen by `mode` at physical size; several displays are stitched into one image. */
export async function grabDisplay(mode = 'cursor') {
  const all = screen.getAllDisplays()
  const cursor = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const displays = pickDisplays(mode, all, screen.getPrimaryDisplay().id, cursor.id)
  if (!displays.length) throw new Error('no display')
  const images = await captureSources(displays)
  if (displays.length === 1) return { display: displays[0], image: images[0] }
  const layout = layoutCanvas(displays)
  const { default: sharp } = await import('sharp')
  const png = await sharp({ create: { width: layout.width, height: layout.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
    .composite(layout.parts.map((p, i) => ({ input: images[i].toPNG(), left: p.left, top: p.top })))
    .png({ compressionLevel: 6 })
    .toBuffer()
  // A pseudo display covering every monitor: the region overlay spans it and crops scale against it.
  const display = { id: 'all', bounds: layout.bounds, size: { width: layout.bounds.width, height: layout.bounds.height }, scaleFactor: layout.width / layout.bounds.width }
  return { display, image: nativeImage.createFromBuffer(png) }
}

function saveShot(folder, image, started) {
  const png = image.toPNG()
  fs.mkdirSync(folder, { recursive: true })
  const base = path.join(folder, screenshotName()).slice(0, -4)
  let file = `${base}.png`
  for (let i = 2; fs.existsSync(file); i++) file = `${base} (${i}).png`
  fs.writeFileSync(file, png)
  const { width, height } = image.getSize()
  return { file, width, height, bytes: png.length, ms: Date.now() - started, image }
}

export async function captureScreen(folder, mode = 'cursor') {
  const started = Date.now()
  const { image } = await grabDisplay(mode)
  return saveShot(folder, image, started)
}

/**
 * `pick(display, image)` shows the selection overlay over the frozen capture and resolves the dragged rectangle
 * (logical pixels relative to the display), or null when cancelled. Resolves null on cancel, the saved shot otherwise.
 */
export async function captureRegion(folder, pick, mode = 'cursor') {
  const { display, image } = await grabDisplay(mode)
  const sel = await pick(display, image)
  const started = Date.now()
  const rect = cropRect(sel, display.size, image.getSize())
  if (!rect) return null
  return saveShot(folder, image.crop(rect), started)
}

/** Region selection without saving a file (e.g. OCR of a screen area). Resolves the cropped image, or null on cancel. */
export async function grabRegionImage(pick, mode = 'cursor') {
  const { display, image } = await grabDisplay(mode)
  const rect = cropRect(await pick(display, image), display.size, image.getSize())
  return rect ? image.crop(rect) : null
}
