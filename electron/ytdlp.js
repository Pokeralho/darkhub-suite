import fsRaw from 'node:fs'
import path from 'node:path'
import { spawn, execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const fs = fsRaw.promises

function platformAssetName(platform) {
  if (platform === 'win32') return 'yt-dlp.exe'
  if (platform === 'darwin') return 'yt-dlp_macos'
  return 'yt-dlp_linux'
}

const YTDLP_RELEASE_BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download'
const YTDLP_CHECKSUMS_URL = `${YTDLP_RELEASE_BASE}/SHA2-256SUMS`
// yt-dlp.exe is ~17 MB: anything far smaller left in the tools folder is a broken older download.
const MIN_YTDLP_BYTES = 1024 * 1024

/** Finds the SHA-256 for `assetName` in a SHA2-256SUMS listing, or null. */
export function parseChecksumList(text, assetName) {
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const match = line.trim().match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/)
    if (match && match[2].trim() === assetName) return match[1].toLowerCase()
  }
  return null
}

async function fetchExpectedChecksum(assetName, tmpPath, downloadToFile) {
  try {
    await downloadToFile(YTDLP_CHECKSUMS_URL, tmpPath, { maxBytes: 1024 * 1024, timeoutMs: 30000 })
    return parseChecksumList(await fs.readFile(tmpPath, 'utf8'), assetName)
  } finally {
    await fs.unlink(tmpPath).catch(() => {})
  }
}

/**
 * Installs yt-dlp from the official GitHub release. Fails closed: the binary is only put in
 * place after its SHA-256 matches the published SHA2-256SUMS (host allow-list, timeout,
 * size cap and length check come from SecureDownload.downloadToFile).
 */
export async function ensureYtDlp(toolsDir, platform, { downloadToFile = null } = {}) {
  const asset = platformAssetName(platform)
  const dest = path.join(toolsDir, asset)
  try {
    const st = await fs.stat(dest)
    if (st.isFile() && st.size >= MIN_YTDLP_BYTES) return dest
    await fs.unlink(dest).catch(() => {})
  } catch {}

  const download = downloadToFile ?? (await import('./services/SecureDownload.js')).downloadToFile
  await fs.mkdir(toolsDir, { recursive: true })
  const tmpDest = `${dest}.download`
  const expected = await fetchExpectedChecksum(asset, `${dest}.sums`, download)
  if (!expected) {
    throw new Error('yt-dlp integrity check unavailable (no published SHA-256 for this file). Download aborted for safety.')
  }
  try {
    // downloadToFile removes the partial file itself on any failure (timeout, size, hash).
    await download(`${YTDLP_RELEASE_BASE}/${asset}`, tmpDest, { expectedSha256: expected, timeoutMs: 60000, maxBytes: 200 * 1024 * 1024 })
  } catch (err) {
    await fs.unlink(tmpDest).catch(() => {})
    throw new Error(`yt-dlp download failed: ${err?.message ?? err}`)
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
      // async lookup: execSync here blocked the Electron main process
      const stdout = await new Promise((resolve, reject) => {
        execFile('where.exe', ['ffmpeg'], { windowsHide: true, encoding: 'utf8', timeout: 5000 }, (err, out) => (err ? reject(err) : resolve(out)))
      })
      const whereOut = String(stdout ?? '').trim().split(/\r?\n/)[0]
      if (whereOut && fsRaw.existsSync(whereOut)) {
        return whereOut
      }
    } catch {}
  }

  return dest
}

// Only the long-running download is tracked: info probes run alongside and must not
// replace it, or Cancel would stop the probe instead of the download.
let activeYtDlpChild = null

/** Kills a yt-dlp process and its ffmpeg children (Windows: taskkill /T /F). */
function killTree(child) {
  try {
    const pid = child?.pid
    if (process.platform === 'win32' && pid) {
      execFile('taskkill.exe', ['/F', '/T', '/PID', String(pid)], { windowsHide: true }, () => {})
    }
    child.kill('SIGKILL')
  } catch {}
}

export function cancelActiveYtDlp() {
  const child = activeYtDlpChild
  if (!child) return false
  child.dhCanceled = true
  activeYtDlpChild = null
  killTree(child)
  return true
}

export function runYtDlp(ytdlpPath, args, { timeoutMs = 0, onProgress = null, track = false, spawnImpl = spawn } = {}) {
  return new Promise((resolve, reject) => {
    const finalArgs = onProgress && !args.includes('--newline') ? ['--newline', ...args] : args
    const child = spawnImpl(ytdlpPath, finalArgs, { windowsHide: true })
    if (track) activeYtDlpChild = child
    let stdout = ''
    let stderr = ''

    const timer =
      typeof timeoutMs === 'number' && timeoutMs > 0
        ? setTimeout(() => {
            if (activeYtDlpChild === child) activeYtDlpChild = null
            killTree(child)
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
      resolve({ code, stdout, stderr, canceled: Boolean(child.dhCanceled) })
    })
  })
}


