import path from 'node:path'
import fs from 'node:fs'
import { createMetadataService } from '../services/metadata/MetadataService.js'

/**
 * `metax:*`: universal metadata editor (EXIF Editor screen). Every path must have been granted through a file dialog
 * (or drag and drop); copies may also go next to a granted input, the same rule the converter uses.
 */
export function registerMetadataIPC({ ipcMain, assertFileAccessGranted, hasFileAccessGrant, getFfmpegPath, logger } = {}) {
  async function getExiftoolPath() {
    const mod = await import('exiftool-vendored')
    let p = await mod.exiftoolPath()
    // ExifTool (Perl) cannot run from inside the asar archive.
    if (p && p.includes(`app.asar${path.sep}`)) p = p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`)
    return p && fs.existsSync(p) ? p : null
  }
  const service = createMetadataService({ getExiftoolPath, getFfmpegPath, logger })

  const granted = (p, label) => {
    assertFileAccessGranted(p, label)
    return p
  }
  const outputAllowed = (out, input) => {
    if (typeof out !== 'string' || !out.trim() || !path.isAbsolute(out)) throw new Error('invalid output path')
    if (hasFileAccessGrant?.(out)) return out
    const beside = path.resolve(path.dirname(out)).toLowerCase() === path.resolve(path.dirname(input)).toLowerCase()
    if (beside && hasFileAccessGrant?.(input)) return out
    assertFileAccessGranted(out, 'arquivo de saída')
    return out
  }
  const handle = (channel, fn) => ipcMain.handle(channel, async (_e, payload) => {
    try { return await fn(payload ?? {}) } catch (err) {
      logger?.error?.('Metadata', `${channel}: ${err?.message ?? err}`)
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  handle('metax:read', async (p) => service.read(granted(typeof p === 'string' ? p : p.path, 'arquivo')))
  handle('metax:write', async (p) => {
    const input = granted(p.path, 'arquivo')
    const req = {
      path: input,
      fields: p.fields && typeof p.fields === 'object' ? p.fields : {},
      rawTags: p.rawTags && typeof p.rawTags === 'object' ? p.rawTags : {},
      strip: p.strip === true,
      removeGps: p.removeGps === true,
      backup: p.backup !== false,
      preserveDates: p.preserveDates === true,
      outputPath: p.outputPath ? outputAllowed(p.outputPath, input) : null,
      cover: p.cover?.path ? { path: granted(p.cover.path, 'capa') } : p.cover?.remove === true ? { remove: true } : null
    }
    return service.write(req)
  })
  handle('metax:setFileProps', async (p) => service.setFileProps(granted(p.path, 'arquivo'), {
    created: p.created, modified: p.modified, accessed: p.accessed,
    readOnly: typeof p.readOnly === 'boolean' ? p.readOnly : undefined,
    hidden: typeof p.hidden === 'boolean' ? p.hidden : undefined
  }))
  handle('metax:removeStream', async (p) => service.removeStream(granted(p.path, 'arquivo'), p.name))
  return service
}
