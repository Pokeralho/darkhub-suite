import fs from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import https from 'node:https'
import Logger from './LoggerService.js'

const USER_AGENT = 'DarkHub-Launcher/1.0'
const REQUEST_TIMEOUT_MS = 15000
const MAX_JSON_BYTES = 2 * 1024 * 1024
const MAX_IMAGE_BYTES = 15 * 1024 * 1024
const MAX_REDIRECTS = 3

/** HTTPS GET that follows a few HTTPS-only redirects and resolves with the response (or null). */
function httpsGet(url, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve) => {
    let parsed
    try { parsed = new URL(url) } catch { return resolve(null) }
    if (parsed.protocol !== 'https:') return resolve(null)

    const req = https.get(parsed, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
      const code = res.statusCode ?? 0
      if (code >= 300 && code < 400 && res.headers.location && redirectsLeft > 0) {
        res.resume()
        let next
        try { next = new URL(res.headers.location, parsed).toString() } catch { return resolve(null) }
        return resolve(httpsGet(next, redirectsLeft - 1))
      }
      if (code !== 200) {
        res.resume()
        return resolve(null)
      }
      resolve(res)
    })
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('timeout')))
    req.on('error', () => resolve(null))
  })
}

export class CoverProviderService {
  constructor(app) {
    this.app = app
    this.coversDir = path.join(this.app.getPath('userData'), 'covers')

    this.providers = [
      this.steamProvider.bind(this)
    ]
  }

  async init() {
    try {
      await fs.mkdir(this.coversDir, { recursive: true })
    } catch (e) {}
  }

  async steamProvider(gameName) {
    const searchName = gameName
      .replace(/\[.*?\]/g, '')
      .replace(/[_-]/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/HQ/g, '')
      .trim()
    if (!searchName) return null

    const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(searchName)}&l=english&cc=US`
    const res = await httpsGet(url)
    if (!res) return null

    return new Promise((resolve) => {
      let data = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        data += chunk
        if (data.length > MAX_JSON_BYTES) res.destroy(new Error('response too large'))
      })
      res.on('error', () => resolve(null))
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          const appId = Number(json?.items?.[0]?.id)
          if (Number.isInteger(appId) && appId > 0) {
            // portrait art first (not every game has it), then the store header as a last resort
            resolve([
              `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900_2x.jpg`,
              `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
              `https://steamcdn-a.akamaihd.net/steam/apps/${appId}/library_600x900.jpg`,
              `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`
            ])
          } else {
            resolve(null)
          }
        } catch {
          resolve(null)
        }
      })
    })
  }

  /**
   * Streams the image to a temp file and renames it into place only when complete, so an
   * interrupted download never leaves a truncated file that the cache would serve forever.
   */
  async downloadImage(url, destPath) {
    const res = await httpsGet(url)
    if (!res) return false
    const type = String(res.headers['content-type'] ?? '')
    if (type && !type.startsWith('image/')) {
      res.resume()
      return false
    }

    const tmpPath = `${destPath}.${process.pid}.${Date.now()}.tmp`
    const ok = await new Promise((resolve) => {
      const file = createWriteStream(tmpPath)
      let bytes = 0
      const fail = () => {
        file.destroy()
        resolve(false)
      }
      res.on('data', (chunk) => {
        bytes += chunk.length
        if (bytes > MAX_IMAGE_BYTES) res.destroy(new Error('image too large'))
      })
      res.on('error', fail)
      file.on('error', fail)
      file.on('finish', () => file.close(() => resolve(bytes > 0)))
      res.pipe(file)
    })

    try {
      if (ok) {
        await fs.rename(tmpPath, destPath)
        return true
      }
    } catch (e) {
      Logger.warn('CoverProvider', `Falha ao salvar capa: ${e?.message ?? e}`)
    }
    await fs.unlink(tmpPath).catch(() => {})
    return false
  }

  async fetchCover(gameName, forceRefresh = false) {
    await this.init()
    if (!gameName || typeof gameName !== 'string') return { ok: false, error: 'Nome inválido' }

    const cleanName = gameName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
    const hash = crypto.createHash('md5').update(cleanName).digest('hex')
    const fileName = `${hash}.jpg`
    const localPath = path.join(this.coversDir, fileName)

    if (!forceRefresh) {
      try {
        const stat = await fs.stat(localPath)
        if (stat.size > 0) {
          return { ok: true, source: 'cache', path: `local-resource://${localPath}` }
        }
      } catch (e) {

      }
    }

    for (const provider of this.providers) {
      try {
        const found = await provider(gameName)
        for (const imageUrl of [].concat(found || [])) {
          if (await this.downloadImage(imageUrl, localPath)) {
            return { ok: true, source: 'network', path: `local-resource://${localPath}` }
          }
        }
      } catch (e) {
        Logger.warn('CoverProvider', `Provider error for ${gameName}: ${e?.message ?? e}`)
      }
    }

    return { ok: false, error: 'Capa não encontrada' }
  }
}
