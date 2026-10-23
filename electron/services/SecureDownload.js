import https from 'node:https'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

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
 * `onProgress({ transferred, total })` is called as data arrives (total is 0 when unknown).
 * Resolves with { sha256, bytes }. Partial files are removed on any failure.
 */
export function downloadToFile(url, dest, {
  allowedHosts = GITHUB_HOSTS,
  maxBytes = DEFAULT_MAX_BYTES,
  maxRedirects = 5,
  timeoutMs = 60000,
  expectedSha256 = null,
  userAgent = 'DarkHubSuite',
  onProgress = null
} = {}) {
  return new Promise((resolve, reject) => {
    let settled = false
    let out = null

    const cleanupAndReject = (err) => {
      if (settled) return
      settled = true
      // On Windows an open handle blocks unlink: close the stream first, then remove the partial file.
      const unlink = () => fs.unlink(dest, () => reject(err))
      if (out && !out.closed) {
        out.once('close', unlink)
        out.destroy()
      } else {
        unlink()
      }
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
          let next
          try {
            next = new URL(res.headers.location, parsed).toString()
          } catch {
            return cleanupAndReject(new Error('Redirecionamento invalido.'))
          }
          return attempt(next, redirectsLeft - 1)
        }
        if (res.statusCode !== 200) {
          res.resume()
          return cleanupAndReject(new Error(`Servidor respondeu com status ${res.statusCode}`))
        }

        const total = Number(res.headers['content-length']) || 0
        if (total > maxBytes) {
          res.resume()
          return cleanupAndReject(new Error('Arquivo excede o tamanho maximo permitido.'))
        }

        const hash = crypto.createHash('sha256')
        out = fs.createWriteStream(dest)
        let bytes = 0

        res.on('data', (chunk) => {
          bytes += chunk.length
          if (bytes > maxBytes) {
            res.destroy(new Error('Arquivo excede o tamanho maximo permitido.'))
            return
          }
          hash.update(chunk)
          if (onProgress) {
            try { onProgress({ transferred: bytes, total }) } catch { /* listener errors must not break the download */ }
          }
        })
        res.on('error', cleanupAndReject)
        res.pipe(out)
        out.on('error', cleanupAndReject)
        out.on('finish', () => {
          out.close(() => {
            if (settled) return
            if (total && bytes !== total) {
              return cleanupAndReject(new Error('Download incompleto.'))
            }
            const sha256 = hash.digest('hex')
            if (expectedSha256 && sha256 !== String(expectedSha256).toLowerCase()) {
              return cleanupAndReject(new Error('Hash SHA-256 do download nao confere com o publicado.'))
            }
            settled = true
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

/**
 * Windows' own bsdtar (reads zip/7z/tar). By absolute path: a bare "tar.exe" can resolve to Git's GNU tar, which reads
 * "C:\..." as a remote host and fails.
 */
export const SYSTEM_TAR = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')

export default { downloadToFile, fetchJson, assetSha256, GITHUB_HOSTS, SYSTEM_TAR }
