// Native-resolution screenshots: the display under the mouse is captured at its physical pixel size (logical size x
// scale factor, so a 4K monitor at 150% gives 3840x2160, not 2560x1440) and saved as lossless PNG.
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

export async function captureScreen(folder) {
  const started = Date.now()
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const size = physicalSize(display)
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size, fetchWindowIcons: false })
  const source = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0]
  if (!source || source.thumbnail.isEmpty()) throw new Error('capture failed')
  const image = source.thumbnail
  const png = image.toPNG()
  fs.mkdirSync(folder, { recursive: true })
  const base = path.join(folder, screenshotName()).slice(0, -4)
  let file = `${base}.png`
  for (let i = 2; fs.existsSync(file); i++) file = `${base} (${i}).png`
  fs.writeFileSync(file, png)
  const { width, height } = image.getSize()
  return { file, width, height, bytes: png.length, ms: Date.now() - started, image }
}
