// Where the converter's bundled third-party tools live. Packaged: resources/<name> (electron-builder extraResources).
// Development: vendor/<name> in the repository, filled by the npm run build:* fetch scripts.
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export function vendorDir(name) {
  if (/app\.asar/.test(here) && process.resourcesPath) return path.join(process.resourcesPath, name)
  return path.join(here, '..', '..', '..', 'vendor', name)
}

const existing = (p) => (p && fs.existsSync(p) ? p : null)

function findFirst(candidates) {
  for (const c of candidates) {
    const p = existing(c)
    if (p) return p
  }
  return null
}

/** DirectXTex texconv (MIT): DDS read/write with BC1-BC7, mipmaps. */
export const texconvPath = () => findFirst([
  path.join(vendorDir('imagetools'), process.platform === 'win32' ? 'texconv.exe' : 'texconv'),
  process.platform === 'linux' ? '/usr/bin/texconv' : null
].filter(Boolean))
/** LibRaw dcraw_emu (LGPL-2.1/CDDL): camera RAW development. */
export const dcrawPath = () => findFirst([
  path.join(vendorDir('imagetools'), process.platform === 'win32' ? 'dcraw_emu.exe' : 'dcraw_emu'),
  process.platform === 'linux' ? '/usr/bin/dcraw_emu' : null
].filter(Boolean))
/** Trimmed portable LibreOffice (MPL-2.0), headless. */
export const bundledSofficePath = () => findFirst([
  path.join(vendorDir('libreoffice'), 'program', process.platform === 'win32' ? 'soffice.com' : 'soffice'),
  process.platform === 'linux' ? '/usr/bin/soffice' : null,
  process.platform === 'linux' ? '/usr/bin/libreoffice' : null
].filter(Boolean))
