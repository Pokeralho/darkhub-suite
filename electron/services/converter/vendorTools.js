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

/** DirectXTex texconv (MIT): DDS read/write with BC1-BC7, mipmaps. */
export const texconvPath = () => existing(path.join(vendorDir('imagetools'), 'texconv.exe'))
/** LibRaw dcraw_emu (LGPL-2.1/CDDL): camera RAW development. */
export const dcrawPath = () => existing(path.join(vendorDir('imagetools'), 'dcraw_emu.exe'))
/** Trimmed portable LibreOffice (MPL-2.0), headless. */
export const bundledSofficePath = () => existing(path.join(vendorDir('libreoffice'), 'program', 'soffice.com'))
