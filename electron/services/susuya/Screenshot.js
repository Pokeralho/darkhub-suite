// Native-resolution screenshots: the display under the mouse is captured at its physical pixel size (logical size x
// scale factor, so a 4K monitor at 150% gives 3840x2160, not 2560x1440) and saved as lossless PNG.
// Region capture (like the Windows Snipping Tool): the screen is frozen first, the user drags a rectangle over the
// frozen image and only that part is cropped from the physical-size capture.
import { desktopCapturer, screen } from 'electron'
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

/** Display under the mouse and its capture at physical size. */
export async function grabDisplay() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const size = physicalSize(display)
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size, fetchWindowIcons: false })
  const source = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0]
  if (!source || source.thumbnail.isEmpty()) throw new Error('capture failed')
  return { display, image: source.thumbnail }
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

export async function captureScreen(folder) {
  const started = Date.now()
  const { image } = await grabDisplay()
  return saveShot(folder, image, started)
}

/**
 * `pick(display, image)` shows the selection overlay over the frozen capture and resolves the dragged rectangle
 * (logical pixels relative to the display), or null when cancelled. Resolves null on cancel, the saved shot otherwise.
 */
export async function captureRegion(folder, pick) {
  const { display, image } = await grabDisplay()
  const sel = await pick(display, image)
  const started = Date.now()
  const rect = cropRect(sel, display.size, image.getSize())
  if (!rect) return null
  return saveShot(folder, image.crop(rect), started)
}

/** Region selection without saving a file (e.g. OCR of a screen area). Resolves the cropped image, or null on cancel. */
export async function grabRegionImage(pick) {
  const { display, image } = await grabDisplay()
  const rect = cropRect(await pick(display, image), display.size, image.getSize())
  return rect ? image.crop(rect) : null
}
