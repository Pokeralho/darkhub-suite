import https from 'node:https'
import crypto from 'node:crypto'
import fs from 'node:fs'

export const GITHUB_HOSTS = Object.freeze([
  'github.com',
  'api.github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'raw.githubusercontent.com'
])

const DEFAULT_MAX_BYTES = 600 * 1024 * 1024

function assertAllowedUrl(rawUrl, allowedHosts) {
  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('URL de download invalida.')
  }
  if (parsed.protocol !== 'https:') throw new Error('Apenas downloads HTTPS sao permitidos.')
  if (!allowedHosts.includes(parsed.hostname.toLowerCase())) {
    throw new Error(`Host nao permitido para download: ${parsed.hostname}`)
  }
  return parsed
}

/**
 * Downloads an HTTPS resource to disk with host allow-listing on every redirect hop,
 * a size cap, an inactivity timeout and optional SHA-256 verification.
 * Resolves with { sha256, bytes }. Partial files are removed on any failure.
 */
export function downloadToFile(url, dest, {
  allowedHosts = GITHUB_HOSTS,
  maxBytes = DEFAULT_MAX_BYTES,
  maxRedirects = 5,
  timeoutMs = 60000,
  expectedSha256 = null,
  userAgent = 'DarkHubSuite'
} = {}) {
  return new Promise((resolve, reject) => {
    const cleanupAndReject = (err) => {
      fs.unlink(dest, () => {})
      reject(err)
    }

    const attempt = (currentUrl, redirectsLeft) => {
      let parsed
      try {
        parsed = assertAllowedUrl(currentUrl, allowedHosts)
      } catch (err) {
        return cleanupAndReject(err)
      }

      const req = https.get(parsed, { headers: { 'User-Agent': userAgent } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          if (redirectsLeft <= 0) return cleanupAndReject(new Error('Muitos redirecionamentos.'))
          const next = new URL(res.headers.location, parsed).toString()
          return attempt(next, redirectsLeft - 1)
        }
        if (res.statusCode !== 200) {
          res.resume()
          return cleanupAndReject(new Error(`Servidor respondeu com status ${res.statusCode}`))
        }

        const hash = crypto.createHash('sha256')
        const out = fs.createWriteStream(dest)
        let bytes = 0

        res.on('data', (chunk) => {
          bytes += chunk.length
          if (bytes > maxBytes) {
            res.destroy(new Error('Arquivo excede o tamanho maximo permitido.'))
            return
          }
          hash.update(chunk)
        })
        res.on('error', (err) => {
          out.destroy()
          cleanupAndReject(err)
        })
        res.pipe(out)
        out.on('error', cleanupAndReject)
        out.on('finish', () => {
          out.close(() => {
            const sha256 = hash.digest('hex')
            if (expectedSha256 && sha256 !== String(expectedSha256).toLowerCase()) {
              return cleanupAndReject(new Error('Hash SHA-256 do download nao confere com o publicado.'))
            }
            resolve({ sha256, bytes })
          })
        })
      })

      req.setTimeout(timeoutMs, () => req.destroy(new Error('Tempo esgotado no download.')))
      req.on('error', cleanupAndReject)
    }

    attempt(url, maxRedirects)
  })
}

export function fetchJson(url, { allowedHosts = GITHUB_HOSTS, timeoutMs = 20000, userAgent = 'DarkHubSuite' } = {}) {
  return new Promise((resolve, reject) => {
    let parsed
    try {
      parsed = assertAllowedUrl(url, allowedHosts)
    } catch (err) {
      return reject(err)
    }
    const req = https.get(parsed, { headers: { 'User-Agent': userAgent, Accept: 'application/vnd.github+json' } }, (res) => {
      let data = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        data += chunk
        if (data.length > 5 * 1024 * 1024) res.destroy(new Error('Resposta grande demais.'))
      })
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`Erro GitHub API: ${res.statusCode}`))
        try {
          resolve(JSON.parse(data))
        } catch {
          reject(new Error('Resposta JSON invalida.'))
        }
      })
      res.on('error', reject)
    })
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Tempo esgotado na consulta.')))
    req.on('error', reject)
  })
}

/** GitHub release assets expose `digest: "sha256:<hex>"`; returns the hex or null. */
export function assetSha256(asset) {
  const digest = String(asset?.digest ?? '')
  const match = digest.match(/^sha256:([0-9a-f]{64})$/i)
  return match ? match[1].toLowerCase() : null
}

export default { downloadToFile, fetchJson, assetSha256, GITHUB_HOSTS }
