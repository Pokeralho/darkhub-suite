import fs from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import https from 'node:https'

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
    return new Promise((resolve) => {

      const searchName = gameName
        .replace(/\[.*?\]/g, '')
        .replace(/[_-]/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/HQ/g, '')
        .trim()

      const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(searchName)}&l=english&cc=US`
      console.log(`[CoverProvider] Pesquisando Steam: "${searchName}" -> ${url}`)
      https.get(url, { headers: { 'User-Agent': 'DarkHub-Launcher/1.0' } }, (res) => {
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            if (json?.items && json.items.length > 0) {
              const appId = json.items[0].id
              const imgUrl = `https://steamcdn-a.akamaihd.net/steam/apps/${appId}/library_600x900.jpg`
              console.log(`[CoverProvider] Sucesso! Steam AppID: ${appId} -> ${imgUrl}`)
              resolve(imgUrl)
            } else {
              console.log(`[CoverProvider] Falhou: Steam não encontrou nada para "${searchName}"`)
              resolve(null)
            }
          } catch (e) {
            console.log(`[CoverProvider] Falhou JSON: ${e.message}`)
            resolve(null)
          }
        })
      }).on('error', () => resolve(null))
    })
  }

  async downloadImage(url, destPath) {
    return new Promise((resolve) => {
      https.get(url, { headers: { 'User-Agent': 'DarkHub-Launcher/1.0' } }, (res) => {
        if (res.statusCode !== 200) {
          return resolve(false)
        }
        const file = createWriteStream(destPath)
        res.pipe(file)
        file.on('finish', () => {
          file.close()
          resolve(true)
        })
        file.on('error', () => resolve(false))
      }).on('error', () => resolve(false))
    })
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
        const imageUrl = await provider(gameName)
        if (imageUrl) {
          const success = await this.downloadImage(imageUrl, localPath)
          if (success) {
            return { ok: true, source: 'network', path: `local-resource://${localPath}` }
          }
        }
      } catch (e) {
        console.error(`Provider error for ${gameName}:`, e)
      }
    }

    return { ok: false, error: 'Capa não encontrada' }
  }
}
