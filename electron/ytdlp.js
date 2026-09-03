import fsRaw from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const fs = fsRaw.promises

function platformAssetName(platform) {
  if (platform === 'win32') return 'yt-dlp.exe'
  if (platform === 'darwin') return 'yt-dlp_macos'
  return 'yt-dlp_linux'
}

function downloadWithRedirects(url, destPath, { maxRedirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'DarkHub' } }, (res) => {
      const code = res.statusCode || 0
      if (code >= 300 && code < 400 && res.headers.location && maxRedirects > 0) {
        res.resume()
        return resolve(downloadWithRedirects(res.headers.location, destPath, { maxRedirects: maxRedirects - 1 }))
      }
      if (code !== 200) {
        res.resume()
        return reject(new Error(`Download failed (${code})`))
      }
      const file = fsRaw.createWriteStream(destPath)
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve()))
      file.on('error', (err) => reject(err))
    })
    req.on('error', (err) => reject(err))
  })
}

function downloadTextWithRedirects(url, { maxRedirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'DarkHub' } }, (res) => {
      const code = res.statusCode || 0
      if (code >= 300 && code < 400 && res.headers.location && maxRedirects > 0) {
        res.resume()
        return resolve(downloadTextWithRedirects(res.headers.location, { maxRedirects: maxRedirects - 1 }))
      }
      if (code !== 200) {
        res.resume()
        return reject(new Error(`Download failed (${code})`))
      }
      let data = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => resolve(data))
    })
    req.on('error', (err) => reject(err))
  })
}

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fsRaw.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

const YTDLP_CHECKSUMS_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS'

async function fetchExpectedChecksum(assetName) {
  const text = await downloadTextWithRedirects(YTDLP_CHECKSUMS_URL)
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const match = trimmed.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/)
    if (match && match[2].trim() === assetName) {
      return match[1].toLowerCase()
    }
  }
  return null
}

export async function ensureYtDlp(toolsDir, platform) {
  const asset = platformAssetName(platform)
  const dest = path.join(toolsDir, asset)
  try {
    await fs.access(dest)
    return dest
  } catch {}

  await fs.mkdir(toolsDir, { recursive: true })
  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`
  const tmpDest = `${dest}.download`
  await downloadWithRedirects(url, tmpDest)

  try {
    const expected = await fetchExpectedChecksum(asset)
    if (expected) {
      const actual = await sha256File(tmpDest)
      if (actual.toLowerCase() !== expected) {
        await fs.unlink(tmpDest).catch(() => {})
        throw new Error(`Verificação de integridade do yt-dlp falhou (checksum não corresponde). Download abortado por segurança.`)
      }
    } else {

    }
  } catch (err) {

    if (/checksum não corresponde/i.test(err?.message ?? '')) {
      throw err
    }
  }

  await fs.rename(tmpDest, dest)

  if (platform !== 'win32') {
    await fs.chmod(dest, 0o755)
  }

  return dest
}

export async function ensureFfmpeg(toolsDir, platform) {
  const binaryName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const dest = path.join(toolsDir, binaryName)

  if (fsRaw.existsSync(dest)) {
    return dest
  }

  await fs.mkdir(toolsDir, { recursive: true }).catch(() => {})

  const candidatePaths = [
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', binaryName),
    path.join(process.resourcesPath || '', 'bin', binaryName),
    path.join(process.cwd(), 'resources', 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', binaryName),
    path.join(process.cwd(), 'node_modules', 'ffmpeg-static', binaryName),
    path.resolve('node_modules', 'ffmpeg-static', binaryName),
    path.resolve(__dirname, '..', 'node_modules', 'ffmpeg-static', binaryName),
    path.resolve(__dirname, '..', '..', 'node_modules', 'ffmpeg-static', binaryName)
  ]

  for (const cPath of candidatePaths) {
    if (cPath && fsRaw.existsSync(cPath)) {
      try {
        await fs.copyFile(cPath, dest)
        if (platform !== 'win32') await fs.chmod(dest, 0o755).catch(() => {})
        return dest
      } catch {}
      return cPath
    }
  }

  try {
    const mod = await import('ffmpeg-static')
    const p = mod.default ?? mod
    if (typeof p === 'string' && fsRaw.existsSync(p)) {
      try {
        await fs.copyFile(p, dest)
        if (platform !== 'win32') await fs.chmod(dest, 0o755).catch(() => {})
        return dest
      } catch {}
      return p
    }
  } catch {}

  if (platform === 'win32') {
    try {
      const cp = await import('node:child_process')
      const whereOut = cp.execSync('where.exe ffmpeg', { windowsHide: true, encoding: 'utf8' }).trim().split(/\r?\n/)[0]
      if (whereOut && fsRaw.existsSync(whereOut)) {
        return whereOut
      }
    } catch {}
  }

  return dest
}

let activeYtDlpChild = null

export function cancelActiveYtDlp() {
  if (activeYtDlpChild) {
    try {
      const pid = activeYtDlpChild.pid
      if (process.platform === 'win32' && pid) {
        import('node:child_process').then(cp => {
          try {
            cp.execSync(`taskkill /F /T /PID ${pid}`, { windowsHide: true })
          } catch {}
        })
      }
      activeYtDlpChild.kill('SIGKILL')
    } catch {}
    activeYtDlpChild = null
    return true
  }
  return false
}

export function runYtDlp(ytdlpPath, args, { timeoutMs = 0, onProgress = null } = {}) {
  return new Promise((resolve, reject) => {
    const finalArgs = onProgress && !args.includes('--newline') ? ['--newline', ...args] : args
    const child = spawn(ytdlpPath, finalArgs, { windowsHide: true })
    activeYtDlpChild = child
    let stdout = ''
    let stderr = ''
    let isCanceled = false

    const timer =
      typeof timeoutMs === 'number' && timeoutMs > 0
        ? setTimeout(() => {
            child.kill()
            reject(new Error(`yt-dlp timed out after ${timeoutMs}ms`))
          }, timeoutMs)
        : null

    let currentItem = 1
    let totalItems = 1

    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString()
      stdout += text
      if (onProgress) {
        const lines = text.split(/\r?\n/)
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          const itemMatch = trimmed.match(/\[download\]\s+Downloading\s+(?:item|video)\s+(\d+)\s+of\s+(\d+)/i)
          if (itemMatch) {
            currentItem = parseInt(itemMatch[1], 10) || currentItem
            totalItems = parseInt(itemMatch[2], 10) || totalItems
            onProgress({
              percent: ((currentItem - 1) / totalItems) * 100,
              currentItem,
              totalItems,
              totalSize: '',
              speed: '',
              eta: '',
              line: `Baixando item ${currentItem} de ${totalItems}...`
            })
            continue
          }

          const match = trimmed.match(/\[download\]\s+([\d.]+)%\s+of\s+~?([\d.]+\w+)(?:\s+at\s+([\d.]+\w+\/s))?(?:\s+ETA\s+([\d:]+))?/i)
          if (match) {
            const rawPercent = parseFloat(match[1]) || 0
            const calculatedPercent = totalItems > 1
              ? Math.min(100, (((currentItem - 1) + (rawPercent / 100)) / totalItems) * 100)
              : rawPercent

            onProgress({
              percent: calculatedPercent,
              rawPercent,
              currentItem,
              totalItems,
              totalSize: match[2] || '',
              speed: match[3] || '',
              eta: match[4] || '',
              line: trimmed
            })
          } else if (trimmed.includes('[ExtractAudio]') || trimmed.includes('[Merger]') || trimmed.includes('[ffmpeg]') || trimmed.includes('[ThumbnailsConvertor]')) {
            onProgress({
              percent: totalItems > 1 ? Math.min(99, ((currentItem - 0.1) / totalItems) * 100) : 98,
              currentItem,
              totalItems,
              totalSize: '',
              speed: '',
              eta: '',
              line: 'Embutindo metadados, capa e mesclando via FFmpeg...'
            })
          }
        }
      }
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (err) => {
      if (activeYtDlpChild === child) activeYtDlpChild = null
      if (timer) clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      if (activeYtDlpChild === child) activeYtDlpChild = null
      if (timer) clearTimeout(timer)
      resolve({ code, stdout, stderr, canceled: isCanceled })
    })
  })
}


