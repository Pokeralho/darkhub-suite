import { app, BrowserWindow, dialog, ipcMain, shell, protocol, clipboard, globalShortcut, Menu, Tray, screen } from 'electron'
import log from 'electron-log'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

try {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile()
  }
} catch {}
import fsRaw from 'node:fs'
import dgram from 'node:dgram'
import cp, { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import crypto from 'crypto'
import {
  buildKdf,
  decryptVaultData,
  derivePasswordFromRecoveryWords,
  encryptVaultData,
  generateRecoveryWords,
  unwrapVaultKeyWithPassword,
  wrapVaultKeyWithPassword
} from './vaultCrypto.js'
import { registerNetworkIPC } from './networkIPC.js'
import { registerOptiScalerIPC } from './optiscalerManager.js'
import Logger from './services/LoggerService.js'
import { runCommand, runPowerShell, runPowerShellJson, stripBom, encodePowerShellScript, powerShellArgsForEncodedScript } from './services/PowerShellRunner.js'
import HardwareService from './services/HardwareService.js'
import HardwareHAL from './hal/HardwareHAL.js'
import SecurityService from './services/SecurityService.js'
import DeepHardwareService from './services/DeepHardwareService.js'
import UpdateService from './services/UpdateService.js'
import SystemOptimizerService from './services/optimizer/SystemOptimizerService.js'
import MemoryEngine from './services/optimizer/MemoryEngine.js'
import SystemEngine from './services/optimizer/SystemEngine.js'
import NetworkEngine from './services/optimizer/NetworkEngine.js'
import VisualsEngine from './services/optimizer/VisualsEngine.js'
import ToolboxEngine from './services/optimizer/ToolboxEngine.js'
import AppManagerEngine from './services/optimizer/AppManagerEngine.js'
import DeepTweaksEngine from './services/optimizer/DeepTweaksEngine.js'
import ServicesEngine from './services/optimizer/ServicesEngine.js'
import { registerLatencyGuardian } from './latencyGuardian.js'
import FramePacerEngine from './services/FramePacerEngine.js'
import { createFramePacerOverlay, closeFramePacerOverlay, toggleFramePacerOverlay, setOverlayClickThrough, setOverlayConfig, getOverlayStatus } from './services/FramePacerOverlay.js'
import { steamLuaService, SteamLocator } from './services/SteamLuaService.js'
import { steamUnlockerService } from './services/SteamUnlockerService.js'
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-resource', privileges: { bypassCSP: true, secure: true, standard: true, supportFetchAPI: true, corsEnabled: true } }
])
registerNetworkIPC()
log.transports.file.level = 'info'
if (app.isPackaged) {
  log.transports.console.level = false
}
const fs = fsRaw.promises
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

log.info(`[startup] process started isPackaged=${app.isPackaged} argv=${process.argv.join(' ')}`)

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  log.info('[startup] Second instance detected, quitting...')
  app.quit()
  process.exit(0)
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    log.info('[startup] Second instance attempted to open. Restoring main window.')
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    } else {
      if (typeof showMainWindow === 'function') showMainWindow()
    }
  })
}

let systemInformationPromise = null
let sharpPromise = null
let ytdlPromise = null
let tesseractPromise = null
let exiftoolPromise = null
let exiftoolInstance = null
let ffmpegStaticPromise = null
let libraryStorePromise = null
let ytdlpToolsPromise = null

async function getSystemInformation() {
  systemInformationPromise ||= import('systeminformation').then((mod) => mod.default ?? mod)
  return systemInformationPromise
}

const si = new Proxy({}, {
  get(_target, prop) {
    return async (...args) => {
      const module = await getSystemInformation()
      const value = module[prop]
      return typeof value === 'function' ? value.apply(module, args) : value
    }
  }
})

async function getSharp() {
  sharpPromise ||= import('sharp').then((mod) => mod.default ?? mod)
  return sharpPromise
}

async function getYtdl() {
  ytdlPromise ||= import('ytdl-core').then((mod) => mod.default ?? mod)
  return ytdlPromise
}

async function createOcrWorker(lang) {
  tesseractPromise ||= import('tesseract.js')
  const mod = await tesseractPromise
  return mod.createWorker(lang)
}

async function getExiftool() {
  exiftoolPromise ||= import('exiftool-vendored').then((mod) => {
    exiftoolInstance = mod.exiftool
    return mod.exiftool
  })
  return exiftoolPromise
}

async function getFfmpegPath() {
  if (ffmpegStaticPromise) return ffmpegStaticPromise
  ffmpegStaticPromise = (async () => {
    try {
      const toolsDir = path.join(app.getPath ? app.getPath('userData') : '', 'tools')
      const { ensureFfmpeg } = await getYtDlpTools()
      if (typeof ensureFfmpeg === 'function') {
        const p = await ensureFfmpeg(toolsDir, process.platform)
        if (p && fsRaw.existsSync(p)) return p
      }
    } catch {}

    try {
      const whereOut = cp.execSync('where.exe ffmpeg', { windowsHide: true, encoding: 'utf8' }).trim().split(/\r?\n/)[0]
      if (whereOut && fsRaw.existsSync(whereOut)) return whereOut
    } catch {}

    const localBin = path.join(app.getPath ? app.getPath('userData') : '', 'tools', 'ffmpeg.exe')
    if (fsRaw.existsSync(localBin)) return localBin

    try {
      const mod = await import('ffmpeg-static')
      const p = mod.default ?? mod
      if (p && fsRaw.existsSync(p)) return p
    } catch {}

    return null
  })()
  return ffmpegStaticPromise
}

async function getLibraryStore() {
  libraryStorePromise ||= import('./libraryStore.js')
  return libraryStorePromise
}

registerOptiScalerIPC({ app, ipcMain, getLibraryStore })

async function getYtDlpTools() {
  ytdlpToolsPromise ||= import('./ytdlp.js')
  return ytdlpToolsPromise
}

function isDev() {
  return !app.isPackaged
}

let appConfig = {
  discordWebhookUrl: null,
  bugTelemetry: {
    enabled: false,
    webhookUrl: null,
    includeDiagnostics: true
  }
}
let discordRate = { windowStart: 0, count: 0 }
const discordDedup = new Map()
let junkEstimateCache = { ts: 0, result: null, inFlight: null }
const grantedFilePaths = new Set()
const grantedDirectoryPaths = new Set()
let mainWindow = null
let tray = null
let appIsQuitting = false
let closeToTrayEnabled = true
let latencyGuardianHandle = null

function normalizeAccessPath(input) {
  if (typeof input !== 'string' || !input.trim()) return null
  try {
    const resolved = path.resolve(input)
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved
  } catch {
    return null
  }
}

function isPathInside(child, parent) {
  if (!child || !parent) return false
  const rel = path.relative(parent, child)
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel))
}

function grantFilePath(filePath) {
  const normalized = normalizeAccessPath(filePath)
  if (normalized) grantedFilePaths.add(normalized)
}

function grantDirectoryPath(dirPath) {
  const normalized = normalizeAccessPath(dirPath)
  if (normalized) grantedDirectoryPaths.add(normalized)
}

function hasFileAccessGrant(filePath) {
  const normalized = normalizeAccessPath(filePath)
  if (!normalized) return false
  if (grantedFilePaths.has(normalized)) return true
  for (const dir of grantedDirectoryPaths) {
    if (isPathInside(normalized, dir)) return true
  }
  return false
}

function assertFileAccessGranted(filePath, label = 'arquivo') {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error(`Caminho de ${label} inválido`)
  }
  if (!hasFileAccessGrant(filePath)) {
    throw new Error(`Acesso a "${label}" não foi concedido através do diálogo de arquivos`)
  }
}

function assertFileAccessGrantedMany(filePaths, label = 'arquivo') {
  for (const p of filePaths) {
    assertFileAccessGranted(p, label)
  }
}

function psSingleQuote(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`
}

function normalizeRegistryPath(value) {
  return String(value ?? '').trim().replace(/\//g, '\\').toUpperCase()
}

const allowedStartupRegistryPaths = new Set([
  'HKCU:\\SOFTWARE\\MICROSOFT\\WINDOWS\\CURRENTVERSION\\RUN',
  'HKLM:\\SOFTWARE\\MICROSOFT\\WINDOWS\\CURRENTVERSION\\RUN',
  'HKCU:\\SOFTWARE\\MICROSOFT\\WINDOWS\\CURRENTVERSION\\RUNONCE',
  'HKLM:\\SOFTWARE\\MICROSOFT\\WINDOWS\\CURRENTVERSION\\RUNONCE',
  'HKLM:\\SOFTWARE\\WOW6432NODE\\MICROSOFT\\WINDOWS\\CURRENTVERSION\\RUN'
])

function normalizeWebhookUrl(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'https:') return null
    return parsed.toString()
  } catch {
    return null
  }
}

const FIXED_BUG_WEBHOOK_URL = normalizeWebhookUrl(
  process.env.DISCORD_BUG_WEBHOOK_URL ||
  process.env.DARKHUB_DISCORD_WEBHOOK ||
  null
)

async function loadRuntimeConfig() {
  const envDiscordUrl = normalizeWebhookUrl(process.env.DARKHUB_DISCORD_WEBHOOK)
  let persisted = null

  try {
    const { loadConfig: loadPersistedConfig } = await import('./configManager.js')
    persisted = await loadPersistedConfig()
  } catch (err) {
    log.warn('Failed to load persisted runtime config', err?.message ?? String(err))
  }

  const telemetry = persisted?.telemetry ?? {}
  const webhookUrl = FIXED_BUG_WEBHOOK_URL

  closeToTrayEnabled = persisted?.app?.closeToTray !== false

  appConfig = {
    discordWebhookUrl: envDiscordUrl || webhookUrl || null,
    bugTelemetry: {
      enabled: telemetry.bugReportsEnabled !== false && Boolean(webhookUrl),
      webhookUrl: webhookUrl || null,
      includeDiagnostics: true
    }
  }
}

function canSendDiscord(key) {
  const now = Date.now()
  if (!discordRate.windowStart || now - discordRate.windowStart > 60_000) {
    discordRate = { windowStart: now, count: 0 }
  }
  if (discordRate.count >= 10) return false

  const last = discordDedup.get(key) ?? 0
  if (now - last < 30_000) return false
  discordDedup.set(key, now)
  discordRate.count += 1
  return true
}

function truncateDiscord(text) {
  const s = String(text ?? '')
  if (s.length <= 1800) return s
  return s.slice(0, 1800) + '\n…'
}

function redactSensitive(value) {
  let text = String(value ?? '')
  const home = os.homedir?.()
  if (home) text = text.split(home).join('%USERPROFILE%')
  return text
    .replace(/https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/[^\s"'`<>]+/gi, 'https://discord.com/api/webhooks/[redacted]')
    .replace(/\b(authorization|cookie)\b\s*[:=]\s*[^\r\n]+/gi, '$1=[redacted]')
    .replace(/\b(BOT_TOKEN|MP_ACCESS_TOKEN|DARKHUB_[A-Z_]*SECRET|DARKHUB_LICENSE_SECRET|password|secret|token)\b\s*[:=]\s*[^\s"'`]+/gi, '$1=[redacted]')
    .replace(/DARKHUB-[A-Z0-9-]{8,}/gi, 'DARKHUB-[redacted]')
}

function normalizeTelemetryError(payload = {}) {
  const source = redactSensitive(payload.source || 'unknown').slice(0, 80)
  const page = redactSensitive(payload.page || payload.channel || '').slice(0, 120)
  const message = redactSensitive(payload.message || payload.error || 'Unknown error').slice(0, 500)
  const stack = redactSensitive(payload.stack || '').split(/\r?\n/).slice(0, 16).join('\n')
  const details = redactSensitive(payload.details || '').slice(0, 600)
  return { source, page, message, stack, details }
}

async function postDiscord(content, options = {}) {
  const url = options.webhookUrl || appConfig?.discordWebhookUrl
  if (typeof url !== 'string' || !url.startsWith('https://')) return { ok: false, error: 'Discord webhook not configured' }
  const key = options.rateKey || crypto.createHash('sha1').update(content).digest('hex')
  if (!canSendDiscord(key)) return { ok: false, error: 'Rate limited' }

  const body = JSON.stringify({ content: truncateDiscord(content) })
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    })
    if (!res.ok) {
      let detail = ''
      try {
        detail = await res.text()
      } catch {}
      log.warn('Discord webhook failed', { status: res.status, detail: detail?.slice?.(0, 500) ?? '' })
      return { ok: false, error: `Discord HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    log.warn('Discord webhook exception', err?.message ?? String(err))
    return { ok: false, error: err?.message ?? String(err) }
  }
}

async function reportBugTelemetry(payload = {}) {
  const config = appConfig?.bugTelemetry
  if (!config?.enabled || !config?.webhookUrl) return { ok: false, error: 'Bug telemetry disabled' }

  const data = normalizeTelemetryError(payload)
  const diagnostics = [
    `app=${app.getVersion()}`,
    `platform=${process.platform}/${process.arch}`,
    `electron=${process.versions.electron}`,
    `node=${process.versions.node}`
  ].join(' ')

  const content = [
    'DarkHub bug telemetry',
    `source=${data.source}${data.page ? ` page=${data.page}` : ''}`,
    diagnostics,
    `message=${data.message}`,
    data.details ? `details=${data.details}` : '',
    data.stack ? `stack:\n${data.stack}` : ''
  ].filter(Boolean).join('\n')

  const rateKey = crypto
    .createHash('sha1')
    .update(`${data.source}|${data.page}|${data.message}|${data.stack.slice(0, 300)}`)
    .digest('hex')

  return postDiscord(content, { webhookUrl: config.webhookUrl, rateKey })
}

function isAllowedExternalProtocol(protocol) {
  return protocol === 'https:' || protocol === 'http:' || protocol === 'ms-settings:' || protocol === 'magnet:'
}

function getAllowedExternalUrl(url) {
  try {
    const parsed = new URL(url)
    if (!isAllowedExternalProtocol(parsed.protocol)) return null
    return parsed.toString()
  } catch {
    return null
  }
}

async function openAllowedExternalUrl(url) {
  const externalUrl = getAllowedExternalUrl(url)
  if (!externalUrl) return false
  await shell.openExternal(externalUrl)
  return true
}

function openAllowedExternalUrlDetached(url, source) {
  const externalUrl = getAllowedExternalUrl(url)
  if (!externalUrl) return false

  shell.openExternal(externalUrl).catch((err) => {
    log.warn(`[external-url] failed to open from ${source}: ${externalUrl} ${err?.message ?? String(err)}`)
  })

  return true
}

function isEmbeddedExternalProtocol(protocol) {
  return protocol === 'magnet:' || protocol === 'ms-settings:'
}

function handleEmbeddedExternalNavigation(event, url, source) {
  const targetUrl = url || event?.url
  if (!targetUrl) return

  try {
    const parsed = new URL(targetUrl)
    if (!isEmbeddedExternalProtocol(parsed.protocol)) return
    event.preventDefault()
    openAllowedExternalUrlDetached(parsed.toString(), source)
  } catch {}
}

function isTrustedAppNavigation(url) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'file:') return true
    return isDev() && parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)
  } catch {
    return false
  }
}

function getAppIconPath() {
  const candidates = [
    path.join(process.resourcesPath, 'assets', 'DarkHub.ico'),
    path.join(process.resourcesPath, 'assets', 'icon.ico'),
    path.join(process.resourcesPath, 'icon.ico'),
    path.resolve(__dirname, 'assets', 'icon.ico'),
    path.resolve(__dirname, '..', 'build', 'icon.ico'),
    path.resolve(__dirname, '..', 'icon.ico'),
    path.resolve(__dirname, '..', 'public', 'icon.ico'),
    path.resolve(__dirname, '..', '..', 'DarkHub', 'assets', 'icon.ico')
  ]

  return candidates.find((candidate) => fsRaw.existsSync(candidate)) || null
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow()
  HardwareService.init(mainWindow);
  UpdateService.init(mainWindow);
    return
  }

  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function ensureTray() {
  if (tray || process.platform !== 'win32') return

  const iconPath = getAppIconPath()
  if (!iconPath) {
    log.warn('Tray icon not found; background tray skipped')
    return
  }

  tray = new Tray(iconPath)
  tray.setToolTip('DarkHub')
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Abrir DarkHub',
      click: () => showMainWindow()
    },
    {
      label: 'Sair',
      click: () => {
        appIsQuitting = true
        app.quit()
      }
    }
  ]))
  tray.on('double-click', () => showMainWindow())
}

function hideWindowToBackground(win) {
  ensureTray()
  win.hide()
}

function getStartupFolderRoots() {
  const roots = []
  if (process.platform !== 'win32') return roots
  if (process.env.APPDATA) {
    roots.push(path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'))
  }
  if (process.env.ProgramData) {
    roots.push(path.join(process.env.ProgramData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'))
  }
  return roots.map(normalizeAccessPath).filter(Boolean)
}

function isStartupShortcutPath(filePath) {
  const normalized = normalizeAccessPath(filePath)
  if (!normalized || path.extname(normalized).toLowerCase() !== '.lnk') return false
  return getStartupFolderRoots().some((root) => isPathInside(normalized, root))
}

function isValidServiceName(name) {
  return typeof name === 'string' && /^[A-Za-z0-9_.-]{1,128}$/.test(name)
}

async function estimateDirectoryBytes(root, opts, state, depth) {
  if (!root) return
  if (state.truncated) return
  if (Date.now() > state.deadline) {
    state.truncated = true
    return
  }
  if (depth > state.maxDepth) return
  let entries
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch (err) {
    state.errors++
    return
  }

  for (const ent of entries) {
    if (state.truncated) return
    if (Date.now() > state.deadline) {
      state.truncated = true
      return
    }
    if (state.entries >= state.maxEntries) {
      state.truncated = true
      return
    }
    state.entries++
    const full = path.join(root, ent.name)
    try {
      if (ent.isSymbolicLink?.()) continue
      if (ent.isDirectory?.()) {
        state.dirs++
        await estimateDirectoryBytes(full, opts, state, depth + 1)
      } else if (ent.isFile?.()) {
        state.files++
        const st = await fs.stat(full)
        if (typeof st?.size === 'number' && Number.isFinite(st.size)) state.bytes += st.size
      }
    } catch (err) {
      state.errors++
    }
  }
}

async function computeJunkEstimate(payload) {
  const timeoutMsRaw = Number(payload?.timeoutMs)
  const maxEntriesRaw = Number(payload?.maxEntries)
  const maxDepthRaw = Number(payload?.maxDepth)
  const cacheTtlMsRaw = Number(payload?.cacheTtlMs)
  const timeoutMs = Number.isFinite(timeoutMsRaw) ? Math.max(200, Math.min(5000, Math.trunc(timeoutMsRaw))) : 900
  const maxEntries = Number.isFinite(maxEntriesRaw) ? Math.max(200, Math.min(20000, Math.trunc(maxEntriesRaw))) : 8000
  const maxDepth = Number.isFinite(maxDepthRaw) ? Math.max(1, Math.min(12, Math.trunc(maxDepthRaw))) : 6
  const cacheTtlMs = Number.isFinite(cacheTtlMsRaw) ? Math.max(5000, Math.min(10 * 60_000, Math.trunc(cacheTtlMsRaw))) : 60_000

  const now = Date.now()
  if (junkEstimateCache?.result && now - junkEstimateCache.ts < cacheTtlMs) return junkEstimateCache.result
  if (junkEstimateCache?.inFlight) return junkEstimateCache.inFlight

  const work = (async () => {
    const start = Date.now()
    const roots = []
    try {
      roots.push(os.tmpdir())
    } catch {}
    try {
      roots.push(app.getPath('temp'))
    } catch {}
    try {
      roots.push(app.getPath('cache'))
    } catch {}
    try {
      roots.push(path.join(process.env.windir || 'C:\\Windows', 'Temp'))
    } catch {}

    const normalizedRoots = roots.filter(Boolean).map((p) => path.normalize(String(p)))
    const seen = new Set()
    const uniqueRoots = []
    for (const p of normalizedRoots) {
      const key = process.platform === 'win32' ? p.toLowerCase() : p
      if (seen.has(key)) continue
      seen.add(key)
      uniqueRoots.push(p)
    }

    const state = {
      bytes: 0,
      files: 0,
      dirs: 0,
      errors: 0,
      entries: 0,
      truncated: false,
      deadline: Date.now() + timeoutMs,
      maxEntries,
      maxDepth
    }

    for (const r of uniqueRoots) {
      if (state.truncated) break
      await estimateDirectoryBytes(r, payload, state, 0)
    }

    const result = {
      ok: true,
      ts: Date.now(),
      durationMs: Date.now() - start,
      bytes: state.bytes,
      files: state.files,
      dirs: state.dirs,
      errors: state.errors,
      truncated: state.truncated,
      roots: uniqueRoots
    }
    junkEstimateCache = { ts: Date.now(), result, inFlight: null }
    return result
  })()

  junkEstimateCache = { ts: junkEstimateCache.ts, result: junkEstimateCache.result, inFlight: work }
  try {
    const r = await work
    return r
  } finally {
    if (junkEstimateCache?.inFlight === work) junkEstimateCache.inFlight = null
  }
}

async function walkDirStats(rootDir, { maxEntries = 8000, maxDepth = 12 } = {}) {
  let files = 0
  let dirs = 0
  let bytes = 0
  let skipped = 0

  async function walk(current, depth) {
    if (files + dirs >= maxEntries) {
      skipped += 1
      return
    }
    if (depth > maxDepth) {
      skipped += 1
      return
    }

    let entries
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      skipped += 1
      return
    }

    for (const entry of entries) {
      if (files + dirs >= maxEntries) {
        skipped += 1
        return
      }

      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        dirs += 1
        await walk(full, depth + 1)
        continue
      }

      if (entry.isFile()) {
        files += 1
        try {
          const st = await fs.stat(full)
          bytes += st.size
        } catch {
          skipped += 1
        }
        continue
      }
    }
  }

  await walk(rootDir, 0)
  return { rootDir, files, dirs, bytes, skipped }
}

async function clearDirectoryContents(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true })

  const results = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(rootDir, entry.name)
      try {
        await fs.rm(full, { recursive: true, force: true })
        return { path: full, ok: true }
      } catch (err) {
        return { path: full, ok: false, error: err?.message ?? String(err) }
      }
    })
  )

  return results
}

function createMainWindow() {
  Menu.setApplicationMenu(null)
  const appIconPath = getAppIconPath()

  let initialWidth = 1180
  let initialHeight = 720
  let minWidth = 840
  let minHeight = 520

  try {
    const primaryDisplay = screen.getPrimaryDisplay()
    if (primaryDisplay && primaryDisplay.workAreaSize) {
      const { width: screenW, height: screenH } = primaryDisplay.workAreaSize

      initialWidth = Math.min(1180, Math.max(840, Math.floor(screenW * 0.88)))
      initialHeight = Math.min(740, Math.max(520, Math.floor(screenH * 0.86)))
      minWidth = Math.min(800, screenW)
      minHeight = Math.min(500, screenH)
    }
  } catch (err) {
    log.warn('Failed to calculate screen work area:', err)
  }

  const win = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    minWidth,
    minHeight,
    center: true,
    title: 'DarkHub Suite',
    frame: false,
    autoHideMenuBar: true,
    show: false,
    paintWhenInitiallyHidden: true,
    backgroundColor: '#09090b',
    ...(appIconPath ? { icon: appIconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,

      webSecurity: true
    }
  })
  mainWindow = win
  ensureTray()
  win.setAutoHideMenuBar(true)
  win.setMenuBarVisibility(false)

  win.on('close', (event) => {
    if (appIsQuitting) return
    if (!closeToTrayEnabled) {
      appIsQuitting = true
      return
    }
    event.preventDefault()
    hideWindowToBackground(win)
  })

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  const kickWindowsPaint = () => {
    if (process.platform !== 'win32' || win.isDestroyed()) return
    try {
      win.setBackgroundColor('#0f172a')
      const bounds = win.getBounds()
      win.setBounds({ ...bounds, width: bounds.width + 1 }, false)
      setTimeout(() => {
        if (!win.isDestroyed()) win.setBounds(bounds, false)
      }, 80)
    } catch {}

  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    openAllowedExternalUrlDetached(url, 'main-window-open')
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (isTrustedAppNavigation(url)) return
    event.preventDefault()
    openAllowedExternalUrlDetached(url, 'main-window-navigation')
  })

  win.webContents.on('will-attach-webview', (_event, webPreferences) => {
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = true
  })

  win.webContents.on('did-attach-webview', (_event, guestWebContents) => {
    guestWebContents.setWindowOpenHandler(({ url }) => {
      openAllowedExternalUrlDetached(url, 'webview-window-open')
      return { action: 'deny' }
    })

    guestWebContents.on('will-navigate', (event, url) => {
      handleEmbeddedExternalNavigation(event, url, 'webview-navigation')
    })

    guestWebContents.on('will-frame-navigate', (event) => {
      handleEmbeddedExternalNavigation(event, event?.url, 'webview-frame-navigation')
    })
  })

  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const prefix = level >= 2 ? 'warn' : 'info'
    log[prefix](`[renderer] ${message} (${sourceId}:${line})`)
  })

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    log.error(`[renderer] did-fail-load ${errorCode} ${errorDescription} ${validatedURL}`)
  })

  let hasShown = false
  const isHiddenLaunch = process.argv.includes('--hidden')
  const showWhenReady = (reason = 'unknown') => {
    if (isHiddenLaunch && reason !== 'user-restore') {
      log.info(`[startup] started minimized to tray via --hidden flag (reason=${reason})`)
      return
    }
    if (hasShown || win.isDestroyed()) return
    hasShown = true
    log.info(`[startup] showing main window reason=${reason}`)
    win.show()
    win.focus()
    setTimeout(kickWindowsPaint, 150)
    setTimeout(kickWindowsPaint, 1200)
  }

  win.once('ready-to-show', () => showWhenReady('ready-to-show'))
  win.webContents.once('dom-ready', () => {
    log.info('[startup] renderer dom ready')
    setTimeout(() => showWhenReady('dom-ready'), 50)
  })
  win.webContents.on('did-finish-load', () => {
    log.info('[startup] renderer did finish load')
    try {
      const primaryDisplay = screen.getPrimaryDisplay()
      if (primaryDisplay && primaryDisplay.workAreaSize) {
        const { height: screenH } = primaryDisplay.workAreaSize
        if (screenH <= 768) {

          win.webContents.setZoomFactor(0.9)
        }
      }
    } catch {}
    setTimeout(() => showWhenReady('did-finish-load'), 50)
  })
  setTimeout(() => showWhenReady('initial-shell'), 120)
  win.on('show', () => setTimeout(kickWindowsPaint, 150))
  win.on('focus', () => setTimeout(kickWindowsPaint, 100))

  if (isDev()) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const newHeaders = { ...details.responseHeaders };
    Object.keys(newHeaders).forEach(k => {
      const lk = k.toLowerCase();
      if (lk === 'x-frame-options') delete newHeaders[k];
    });
    callback({ responseHeaders: newHeaders });
  });

  win.webContents.on('render-process-gone', async (_event, details) => {
    try {
      await reportBugTelemetry({
        source: 'renderer-crash',
        message: details?.reason ?? 'renderer process gone',
        details: `exitCode=${details?.exitCode ?? 'unknown'}`
      })
    } catch {}
  })

  return win
}

ipcMain.handle('system:getSnapshot', async () => {
  return HardwareHAL.getSnapshot()
})

ipcMain.handle('optimizer:listOperations', async () => {
  return SystemOptimizerService.listOperations()
})

ipcMain.handle('optimizer:analyze', async (_event, payload) => {
  return await SystemOptimizerService.analyze(payload?.operationIds || [])
})

ipcMain.handle('optimizer:run', async (event, payload) => {
  const ids = payload?.operationIds || []
  const concurrency = payload?.options?.concurrency || 1
  const eventSender = (channel, msg) => event.sender.send(channel, msg)
  return await SystemOptimizerService.runTasks(ids, concurrency, eventSender)
})

ipcMain.handle('optimizer:listProfiles', async () => {
  return SystemOptimizerService.listProfiles()
})

ipcMain.handle('optimizer:checkIsAdmin', async () => {
  return await SystemOptimizerService.checkIsAdmin()
})

ipcMain.handle('optimizer:createRestorePoint', async () => {
  return await SystemEngine.createRestorePoint()
})

ipcMain.handle('optimizer:getAuditLog', async (_event, payload) => {
  try {
    const limitRaw = Number(payload?.limit)
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(1000, Math.trunc(limitRaw))) : 200
    const entries = Logger.getOptimizerAuditLog(limit)
    return { ok: true, entries }
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err), entries: [] }
  }
})

async function measureLatency(host = '1.1.1.1', timeoutMs = 900) {
  const safeHost = String(host || '1.1.1.1').trim()
  if (!/^[A-Za-z0-9_.:-]{1,253}$/.test(safeHost)) {
    return { ok: false, host: safeHost, latencyMs: null, error: 'invalid_host' }
  }

  const waitMs = Math.max(300, Math.min(5000, Number(timeoutMs) || 900))
  const args = process.platform === 'win32'
    ? ['-n', '1', '-w', String(waitMs), safeHost]
    : ['-c', '1', '-W', String(Math.ceil(waitMs / 1000)), safeHost]
  const started = Date.now()

  try {
    const { code, stdout, stderr } = await runCommand('ping', args, { timeoutMs: waitMs + 800 })
    const text = `${stdout}\n${stderr}`
    const match = text.match(/time[=<]\s*([0-9]+(?:[.,][0-9]+)?)\s*ms/i)
    const parsed = match ? Number(match[1].replace(',', '.')) : null
    if (code === 0) {
      return {
        ok: true,
        host: safeHost,
        latencyMs: Number.isFinite(parsed) ? Math.round(parsed) : Math.min(Date.now() - started, 5000)
      }
    }
    return { ok: false, host: safeHost, latencyMs: null, error: 'ping_failed' }
  } catch (err) {
    return { ok: false, host: safeHost, latencyMs: null, error: err?.message ?? String(err) }
  }
}

async function getActiveAdapterName() {
  const ps = `
    $ErrorActionPreference='Stop'
    $a = Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' } | Sort-Object -Property LinkSpeed -Descending | Select-Object -First 1
    if ($null -eq $a) { '' } else { $a.Name }
  `
  const { code, stdout } = await runPowerShell(ps, { timeoutMs: 15000 })
  if (code !== 0) return ''
  return String(stripBom(stdout)).trim()
}

const dnsPresets = [
  { name: 'Cloudflare', primary: '1.1.1.1', secondary: '1.0.0.1' },
  { name: 'Google DNS', primary: '8.8.8.8', secondary: '8.8.4.4' },
  { name: 'OpenDNS', primary: '208.67.222.222', secondary: '208.67.220.220' },
  { name: 'Quad9', primary: '9.9.9.9', secondary: '149.112.112.112' },
  { name: 'Level3', primary: '209.244.0.3', secondary: '209.244.0.4' },
  { name: 'Verisign', primary: '64.6.64.6', secondary: '64.6.65.6' },
  { name: 'DNS.Watch', primary: '84.200.69.80', secondary: '84.200.70.40' },
  { name: 'Comodo Secure DNS', primary: '8.26.56.26', secondary: '8.20.247.20' },
  { name: 'Dyn', primary: '216.146.35.35', secondary: '216.146.36.36' },
  { name: 'UncensoredDNS', primary: '91.239.100.100', secondary: '89.233.43.71' },
  { name: 'Hurricane Electric', primary: '74.82.42.42', secondary: '204.9.214.118' },
  { name: 'DNS Brasil 1', primary: '177.128.247.77', secondary: '189.2.9.181' },
  { name: 'DNS Brasil 2', primary: '181.217.154.102', secondary: '186.209.180.156' },
  { name: 'DNS Brasil 3', primary: '45.65.173.61', secondary: '177.99.206.131' },
  { name: 'DNS Brasil 4', primary: '187.102.222.46', secondary: '168.195.243.35' },
  { name: 'DNS EUA 1', primary: '205.171.3.66', secondary: '204.9.214.118' },
  { name: 'DNS EUA 2', primary: '172.64.36.143', secondary: '75.85.76.64' },
  { name: 'DNS EUA 3', primary: '172.64.37.210', secondary: '76.72.180.231' },
  { name: 'DNS EUA 4', primary: '66.92.224.2', secondary: '8.20.247.148' },
  { name: 'DNS EUA 5', primary: '73.99.97.167', secondary: '65.220.16.3' }
]

const dnsUndoStore = new Map()

function buildDnsQuery() {
  const query = Buffer.from([
    0x00, 0x00, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0x77, 0x77, 0x77,
    0x06, 0x67, 0x6f, 0x6f, 0x67, 0x6c, 0x65, 0x03, 0x63, 0x6f, 0x6d, 0x00, 0x00, 0x01, 0x00, 0x01
  ])
  query[0] = Math.floor(Math.random() * 256)
  query[1] = Math.floor(Math.random() * 256)
  return query
}

function dnsLatencyUdp(serverIp, timeoutMs = 1500) {
  const query = buildDnsQuery()
  return new Promise((resolve) => {
    const sock = dgram.createSocket('udp4')
    const start = Date.now()
    const done = (ms) => {
      try {
        sock.close()
      } catch {}
      resolve(ms)
    }
    const timer = setTimeout(() => done(Number.POSITIVE_INFINITY), timeoutMs)
    sock.once('error', () => {
      clearTimeout(timer)
      done(Number.POSITIVE_INFINITY)
    })
    sock.once('message', () => {
      clearTimeout(timer)
      done(Date.now() - start)
    })
    sock.send(query, 53, serverIp, (err) => {
      if (err) {
        clearTimeout(timer)
        done(Number.POSITIVE_INFINITY)
      }
    })
  })
}

function clampInt(v, min, max, fallback = min) {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(n)))
}

async function runWithConcurrency(tasks, limit = 4) {
  const results = []
  const executing = new Set()
  for (const task of tasks) {
    const p = Promise.resolve().then(() => task())
    results.push(p)
    executing.add(p)
    const clean = () => executing.delete(p)
    p.then(clean, clean)
    if (executing.size >= limit) {
      await Promise.race(executing)
    }
  }
  return Promise.all(results)
}

function median(values) {
  const nums = values.filter((v) => Number.isFinite(v) && v !== Number.POSITIVE_INFINITY).sort((a, b) => a - b)
  if (nums.length === 0) return Number.POSITIVE_INFINITY
  const mid = Math.floor(nums.length / 2)
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2
}

async function dnsBenchmark(servers, { timeoutMs = 1500, attempts = 2, concurrency = 8 } = {}) {
  const results = Array.from({ length: servers.length })
  const tries = clampInt(attempts, 1, 5, 2)
  const limit = clampInt(concurrency, 1, 16, 8)

  const taskFactories = servers.map((s, idx) => async () => {
    const samples = []
    for (let i = 0; i < tries; i += 1) {
      samples.push(await dnsLatencyUdp(s.primary, timeoutMs))
    }
    results[idx] = { ...s, latencyMs: median(samples), samples }
  })

  await runWithConcurrency(taskFactories, limit)

  const ok = results
    .filter((r) => r && Number.isFinite(r.latencyMs) && r.latencyMs !== Number.POSITIVE_INFINITY)
    .sort((a, b) => a.latencyMs - b.latencyMs)
  const failed = results.length - ok.length
  return { ok: true, results: ok, failed }
}

let cachedSysInfo = null;
let metricsDiskIoLast = null
let metricsNetLastByIface = new Map()
let snapshotDiskIoLast = null
let snapshotNetLastByIface = new Map()

let cachedHardwareSnapshot = null;
ipcMain.handle('system:getInfo', async () => {
  const total = os.totalmem()
  const free = os.freemem()
  const used = total - free
  const cpus = os.cpus() || []
  let cpuModel = (cpus[0]?.model || '').trim() || 'Processor'
  const cpuSpeed = (cpus[0]?.speed ? cpus[0].speed / 1000 : 0)

  if (process.platform === 'win32' && (!cpuModel || cpuModel === 'Processor' || cpuModel.includes('Generic'))) {
    try {
      if (!cachedHardwareSnapshot) {
        const regCpu = cp.execSync('reg query "HKLM\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0" /v "ProcessorNameString"', { encoding: 'utf8', windowsHide: true })
        const match = regCpu.match(/ProcessorNameString\s+REG_SZ\s+(.+)/i)
        if (match && match[1]) {
          cachedHardwareSnapshot = match[1].trim()
        }
      }
      if (cachedHardwareSnapshot) cpuModel = cachedHardwareSnapshot
    } catch {}
  }

  const manufacturer = cpuModel.includes('Intel') ? 'Intel' : (cpuModel.includes('AMD') || cpuModel.includes('Ryzen')) ? 'AMD' : 'Generic'

  return {
    os: {
      platform: os.platform(),
      distro: `Windows ${os.release()}`,
      release: os.release(),
      build: typeof os.version === 'function' ? os.version() : os.release(),
      arch: os.arch()
    },
    cpu: {
      manufacturer,
      brand: cpuModel,
      model: cpuModel,
      name: cpuModel,
      cores: cpus.length,
      physicalCores: Math.max(1, Math.floor(cpus.length / 2)),
      speed: cpuSpeed
    },
    memory: {
      total,
      free,
      used,
      totalGb: (total / (1024 ** 3)).toFixed(1),
      freeGb: (free / (1024 ** 3)).toFixed(1),
      usedGb: (used / (1024 ** 3)).toFixed(1)
    }
  }
})

ipcMain.handle('system:getDeepHardwareInfo', async (_, forceRefresh) => {
  return await DeepHardwareService.getDeepInfo(forceRefresh);
})

let cachedAdvancedHW = null
ipcMain.handle('system:getAdvancedHardware', async () => {
  if (cachedAdvancedHW) return cachedAdvancedHW

  const [graphics, baseboard, bios, diskLayout, memLayout, netInterfaces, cpuCache] = await Promise.all([
    si.graphics().catch(() => null),
    si.baseboard().catch(() => null),
    si.bios().catch(() => null),
    si.diskLayout().catch(() => []),
    si.memLayout().catch(() => []),
    si.networkInterfaces().catch(() => []),
    si.cpuCache().catch(() => null)
  ])

  let windowsDetails = null
  if (process.platform === 'win32') {
    try {
      const ps = `
        $ErrorActionPreference='Stop'
        $cv = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion'
        $p = Get-ItemProperty -Path $cv
        [PSCustomObject]@{
          DisplayVersion = $p.DisplayVersion
          ReleaseId = $p.ReleaseId
          CurrentBuildNumber = $p.CurrentBuildNumber
          UBR = $p.UBR
        } | ConvertTo-Json -Compress
      `
      const { code, stdout } = await runPowerShell(ps, { timeoutMs: 8000 })
      if (code === 0) windowsDetails = JSON.parse(stripBom(stdout).trim() || 'null')
    } catch {}
  }

  cachedAdvancedHW = {
    windowsDetails,
    graphics: graphics?.controllers?.map(g => ({
      model: g.model, vendor: g.vendor, vram: g.vram, driverVersion: g.driverVersion ?? null, bus: g.bus ?? null
    })) ?? [],
    baseboard: baseboard ? { manufacturer: baseboard.manufacturer, model: baseboard.model, version: baseboard.version } : null,
    bios: bios ? { vendor: bios.vendor, version: bios.version, releaseDate: bios.releaseDate } : null,
    diskLayout: diskLayout?.map(d => ({ device: d.device, type: d.type, name: d.name, size: d.size, interfaceType: d.interfaceType, smartStatus: d.smartStatus })) ?? [],
    memLayout: memLayout?.map(m => ({ size: m.size, bank: m.bank, type: m.type, clockSpeed: m.clockSpeed, formFactor: m.formFactor, manufacturer: m.manufacturer })) ?? [],
    netInterfaces: Array.isArray(netInterfaces) ? netInterfaces.filter(n => n.ip4 && n.ip4 !== '127.0.0.1').map(n => ({ iface: n.iface, ip4: n.ip4, mac: n.mac, speed: n.speed })) : [],
    cpuCache: cpuCache ?? null
  }
  return cachedAdvancedHW
})

ipcMain.handle('system:getGraphics', async () => {
  if (cachedSysInfo?.graphics) return cachedSysInfo.graphics
  const graphics = await si.graphics()
  return (graphics.controllers ?? []).map((g) => ({
    model: g.model,
    vendor: g.vendor,
    vram: g.vram,
    driverVersion: g.driverVersion ?? null,
    temperatureGpu: g.temperatureGpu ?? null
  }))
})

ipcMain.handle('system:getBios', async () => {
  if (cachedSysInfo?.bios || cachedSysInfo?.baseboard) {
    return { bios: cachedSysInfo?.bios ?? null, baseboard: cachedSysInfo?.baseboard ?? null }
  }
  const [baseboard, bios] = await Promise.all([
    si.baseboard().catch(() => null),
    si.bios().catch(() => null)
  ])
  return {
    baseboard: baseboard
      ? {
          manufacturer: baseboard.manufacturer ?? null,
          model: baseboard.model ?? null,
          version: baseboard.version ?? null
        }
      : null,
    bios: bios
      ? {
          vendor: bios.vendor ?? null,
          version: bios.version ?? null,
          releaseDate: bios.releaseDate ?? null
        }
      : null
  }
})

ipcMain.handle('system:getTemperatures', async () => {
  try {
    return await si.sensorsTemperatures()
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})

ipcMain.handle('system:getLatency', async (_event, payload) => {
  return await measureLatency(payload?.host ?? '1.1.1.1', payload?.timeoutMs ?? 900)
})

ipcMain.handle('system:runBenchmark', async () => {
  return new Promise((resolve) => {
    const { Worker } = require('node:worker_threads');

    const workerCode = `
      const { parentPort } = require('node:worker_threads');
      const start = process.hrtime.bigint();
      let localFloat = 0.0;
      const iters = 10000000;
      for (let i = 0; i < iters; i++) {
        localFloat += Math.sin(i * 0.113576) * Math.cos(i * 0.213576);
        localFloat += i % 1024;
      }
      const end = process.hrtime.bigint();
      const ms = Number(end - start) / 1000000.0;
      const mops = (iters * 5.0) / (ms / 1000) / 1000000.0;
      parentPort.postMessage({ mops: mops.toFixed(2), time: ms.toFixed(2) });
    `;

    const worker = new Worker(workerCode, { eval: true });
    let finished = false;

    const timeout = setTimeout(() => {
      if (!finished) {
        finished = true;
        worker.terminate();
        resolve({ ok: false, error: 'Timeout atingido' });
      }
    }, 15000);

    worker.on('message', (result) => {
      if (!finished) {
        finished = true;
        clearTimeout(timeout);
        resolve({ ok: true, mops: result.mops, time: result.time });
      }
    });

    worker.on('error', (err) => {
      if (!finished) {
        finished = true;
        clearTimeout(timeout);
        resolve({ ok: false, error: err.message });
      }
    });
  });
})

let lastMainCpuInfo = null
function getMainCpuLoad() {
  const cpus = os.cpus()
  if (!cpus) return 0
  let idle = 0, total = 0
  for (let i = 0; i < cpus.length; i++) {
    const times = cpus[i].times
    for (const type in times) total += times[type]
    idle += times.idle
  }
  if (!lastMainCpuInfo) {
    lastMainCpuInfo = { idle, total }
    return 0
  }
  const idleDiff = idle - lastMainCpuInfo.idle
  const totalDiff = total - lastMainCpuInfo.total
  lastMainCpuInfo = { idle, total }
  if (totalDiff === 0) return 0
  return 100 - Math.round((100 * idleDiff) / totalDiff)
}

let _prevNetSnapshot = null;
let _prevDiskSnapshot = null;
let _prevNetTime = 0;
let _prevDiskTime = 0;

ipcMain.handle('system:getMetrics', async () => {
  const ts = Date.now()
  const cpuLoad = getMainCpuLoad()
  const totalRam = os.totalmem()
  const freeRam = os.freemem()

  let netIo = { iface: '', ifaceName: '', rxBps: 0, txBps: 0 }
  try {
    const netStats = await si.networkStats('*')
    const now = Date.now()
    const active = (netStats ?? []).find(s => s.operstate === 'up' && (s.rx_bytes > 0 || s.tx_bytes > 0)) ?? netStats?.[0]
    if (active) {
      const dt = (now - _prevNetTime) / 1000
      if (_prevNetSnapshot && _prevNetTime > 0 && dt > 0.1 && dt < 10) {
        netIo = {
          iface: active.iface,
          ifaceName: active.iface,
          rxBps: Math.max(0, (active.rx_bytes - _prevNetSnapshot.rx_bytes) / dt),
          txBps: Math.max(0, (active.tx_bytes - _prevNetSnapshot.tx_bytes) / dt)
        }
      } else {

        netIo = {
          iface: active.iface,
          ifaceName: active.iface,
          rxBps: active.rx_sec ?? 0,
          txBps: active.tx_sec ?? 0
        }
      }
      _prevNetSnapshot = { rx_bytes: active.rx_bytes, tx_bytes: active.tx_bytes }
      _prevNetTime = now
    }
  } catch {}

  let diskIo = { readBps: 0, writeBps: 0, source: 'native' }
  try {
    const fsStats = await si.fsStats()
    const now = Date.now()
    if (fsStats) {
      const dt = (now - _prevDiskTime) / 1000
      if (_prevDiskSnapshot && _prevDiskTime > 0 && dt > 0.1 && dt < 10) {
        diskIo = {
          readBps: Math.max(0, (fsStats.rx_sec != null ? fsStats.rx_sec : (fsStats.rx - _prevDiskSnapshot.rx) / dt)),
          writeBps: Math.max(0, (fsStats.wx_sec != null ? fsStats.wx_sec : (fsStats.wx - _prevDiskSnapshot.wx) / dt)),
          source: 'native'
        }
      } else if (fsStats.rx_sec != null) {
        diskIo = { readBps: fsStats.rx_sec, writeBps: fsStats.wx_sec, source: 'native' }
      }
      _prevDiskSnapshot = { rx: fsStats.rx ?? 0, wx: fsStats.wx ?? 0 }
      _prevDiskTime = now
    }
  } catch {}

  return {
    ts,
    cpu: { currentLoad: cpuLoad, user: 0, system: 0 },
    memory: { total: totalRam, used: totalRam - freeRam, free: freeRam },
    diskIo,
    netIo
  }
})

ipcMain.handle('system:getNetwork', async () => {
  const [interfaces, stats] = await Promise.all([si.networkInterfaces(), si.networkStats()])

  return {
    ts: Date.now(),
    interfaces: (interfaces ?? []).map((i) => ({
      iface: i.iface,
      ifaceName: i.ifaceName,
      ip4: i.ip4,
      ip6: i.ip6,
      mac: i.mac,
      type: i.type,
      speed: i.speed,
      operstate: i.operstate,
      default: i.default
    })),
    stats: (stats ?? []).map((s) => ({
      iface: s.iface,
      operstate: s.operstate,
      rx_bytes: s.rx_bytes,
      tx_bytes: s.tx_bytes,
      rx_sec: s.rx_sec,
      tx_sec: s.tx_sec
    }))
  }
})

ipcMain.handle('system:getStorage', async () => {
  const disks = await si.fsSize()
  return {
    ts: Date.now(),
    disks: (disks ?? []).map((d) => ({
      fs: d.fs,
      type: d.type,
      size: d.size,
      used: d.used,
      use: d.use,
      mount: d.mount
    }))
  }
})

ipcMain.handle('system:getJunkEstimate', async (_event, payload) => {
  try {
    return await computeJunkEstimate(payload)
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err), ts: Date.now() }
  }
})

ipcMain.handle('library:list', async () => {
  const { loadLibrary } = await getLibraryStore()
  const res = await loadLibrary(app)
  return res
})

function broadcastLibraryEvent(channel, payload) {
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  })
}

ipcMain.handle('library:upsert', async (_event, payload) => {
  try {
    const { upsertGame } = await getLibraryStore()
    const res = await upsertGame(app, payload?.game ?? payload)
    if (res?.ok) {
      broadcastLibraryEvent('library:updated', { reason: 'upsert', games: res.games })
      broadcastLibraryEvent('library:activityLogged', {
        type: 'gameUpdated',
        gameName: (payload?.game ?? payload)?.name ?? '?',
        timestamp: Date.now()
      })
    }
    return res
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})

ipcMain.handle('library:upsertBulk', async (_event, payload) => {
  try {
    const { upsertGamesBulk } = await getLibraryStore()
    const res = await upsertGamesBulk(app, payload?.games ?? [])
    if (res?.ok) {
      broadcastLibraryEvent('library:updated', { reason: 'upsertBulk', games: res.games })
      broadcastLibraryEvent('library:activityLogged', {
        type: 'bulkGamesImported',
        gameName: `${res.count} jogos`,
        timestamp: Date.now()
      })
    }
    return res
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})

ipcMain.handle('library:remove', async (_event, payload) => {
  try {
    const id = typeof payload?.id === 'string' ? payload.id : typeof payload === 'string' ? payload : ''
    if (!id) return { ok: false, error: 'Invalid id' }
    const { removeGame } = await getLibraryStore()
    const res = await removeGame(app, id)
    if (res?.ok) {
      broadcastLibraryEvent('library:updated', { reason: 'remove', games: res.games })
    }
    return res
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})

ipcMain.handle('library:fetchCover', async (_event, payload) => {
  try {
    const { CoverProviderService } = await import('./services/CoverProviderService.js')
    const service = new CoverProviderService(app)
    return await service.fetchCover(payload?.gameName, payload?.forceRefresh)
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})

function scoreExecutable(exePath) {
  let score = 50;
  const name = path.basename(exePath).toLowerCase();
  if (/setup|install|update|uninst|crash|reporter|helper|bootstrapper|launcher/i.test(name)) score -= 100;
  try {
    const stat = fsRaw.statSync(exePath);
    if (stat.size < 1024 * 1024 * 2) score -= 20;
    else if (stat.size > 1024 * 1024 * 10) score += 20;
  } catch (e) {}
  const dir = path.dirname(exePath);
  try {
    const files = fsRaw.readdirSync(dir);
    const hasUnity = files.some(f => f.toLowerCase().includes('unityplayer.dll') || f.toLowerCase().endsWith('_data'));
    const hasUnreal = files.some(f => f.toLowerCase() === 'engine' || f.toLowerCase().includes('win64-shipping'));
    const hasCry = files.some(f => f.toLowerCase() === 'crysystem.dll');
    if (hasUnity) score += 50;
    if (hasUnreal) score += 50;
    if (hasCry) score += 50;
    if (files.some(f => f.toLowerCase().includes('dxgi') || f.toLowerCase().includes('d3d'))) score += 10;
    if (files.some(f => f.toLowerCase().includes('vulkan'))) score += 10;
  } catch (e) {}
  return score;
}

function scanDirectoryForBestExe(dir) {
  let bestExe = '';
  let bestScore = -999;
  function walk(currentDir, depth) {
    if (depth > 3) return;
    try {
      const files = fsRaw.readdirSync(currentDir, { withFileTypes: true });
      for (const file of files) {
        const fullPath = path.join(currentDir, file.name);
        if (file.isDirectory()) {
          walk(fullPath, depth + 1);
        } else if (file.name.toLowerCase().endsWith('.exe')) {
          const score = scoreExecutable(fullPath);
          if (score > bestScore && score > 0) {
            bestScore = score;
            bestExe = fullPath;
          }
        }
      }
    } catch(e) {}
  }
  walk(dir, 0);
  return bestExe;
}

ipcMain.handle('library:discover', async () => {
  const discovered = [];

  try {
    const steamPaths = [
      'C:\\Program Files (x86)\\Steam\\steamapps\\common',
      'C:\\Program Files\\Steam\\steamapps\\common',
      path.join(os.homedir(), 'Steam', 'steamapps', 'common'),
    ];
    const vdfPaths = [
      'C:\\Program Files (x86)\\Steam\\steamapps\\libraryfolders.vdf',
      'C:\\Program Files\\Steam\\steamapps\\libraryfolders.vdf',
    ];
    for (const vdf of vdfPaths) {
      try {
        const content = fsRaw.readFileSync(vdf, 'utf8');
        const matches = [...content.matchAll(/"path"\s+"([^"]+)"/g)];
        for (const m of matches) {
          steamPaths.push(path.join(m[1], 'steamapps', 'common'));
        }
      } catch {}
    }
    for (const steamDir of steamPaths) {
      try {
        const entries = fsRaw.readdirSync(steamDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const gameDir = path.join(steamDir, entry.name);
          const bestExe = scanDirectoryForBestExe(gameDir);
          if (bestExe) {
            discovered.push({ platform: 'Steam', name: entry.name, exePath: bestExe, workingDir: path.dirname(bestExe) });
          }
        }
      } catch {}
    }
  } catch {}

  // ── 2. Epic Games ─────────────────────────────────────────────────────────
  try {
    const epicManifestDir = path.join(process.env['ProgramData'] || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
    const manifests = fsRaw.readdirSync(epicManifestDir).filter(f => f.endsWith('.item'));
    for (const manifest of manifests) {
      try {
        const data = JSON.parse(fsRaw.readFileSync(path.join(epicManifestDir, manifest), 'utf8'));
        if (data.InstallLocation && data.LaunchExecutable) {
          discovered.push({ platform: 'Epic Games', name: data.DisplayName || data.AppName, exePath: path.join(data.InstallLocation, data.LaunchExecutable), workingDir: data.InstallLocation });
        }
      } catch {}
    }
  } catch {}

  // ── 3. GOG Galaxy ─────────────────────────────────────────────────────────
  try {
    const gogDirs = ['C:\\Program Files (x86)\\GOG Galaxy\\Games', 'C:\\GOG Games'];
    for (const dir of gogDirs) {
      try {
        const entries = fsRaw.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const gameDir = path.join(dir, entry.name);
          const bestExe = scanDirectoryForBestExe(gameDir);
          if (bestExe) {
            discovered.push({ platform: 'GOG', name: entry.name, exePath: bestExe, workingDir: path.dirname(bestExe) });
          }
        }
      } catch {}
    }
  } catch {}

  // ── 4. Xbox / Microsoft Store ─────────────────────────────────────────────
  try {
    const xboxDir = path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'WindowsApps');
    const entries = fsRaw.readdirSync(xboxDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const gameDir = path.join(xboxDir, entry.name);
        const lowerName = entry.name.toLowerCase();
        const ignoredPrefixes = ['microsoft', 'windows', 'msteams', 'whatsapp', 'python', 'intel', 'nvidia', 'realtek', 'dolby', 'disney', 'spotify', 'netflix', 'appup', 'hewlettpackard', 'lenovo', 'dell'];
        if (!ignoredPrefixes.some(p => lowerName.startsWith(p))) {
          const bestExe = scanDirectoryForBestExe(gameDir);
          if (bestExe) {
            discovered.push({ platform: 'Xbox', name: entry.name.split('_')[0], exePath: bestExe, workingDir: path.dirname(bestExe) });
          }
        }
      } catch {}
    }
  } catch {}

  return { ok: true, discovered };
})

ipcMain.handle('shell:openExternal', async (_event, url) => {
  const opened = await openAllowedExternalUrl(url)
  if (!opened) {
    throw new Error('Unsupported URL protocol')
  }
})

function findPgeBat() {
  const candidates = [
    path.join(process.resourcesPath || '', 'PGE Portable', 'Pokeralho Games Launcher.bat'),
    path.join(app.getAppPath ? app.getAppPath() : '', 'PGE Portable', 'Pokeralho Games Launcher.bat'),
    path.join(process.cwd(), 'PGE Portable', 'Pokeralho Games Launcher.bat'),
    path.resolve(__dirname, '..', 'PGE Portable', 'Pokeralho Games Launcher.bat'),
    path.resolve(__dirname, '..', '..', 'PGE Portable', 'Pokeralho Games Launcher.bat'),
    path.join(process.env.APPDATA || '', 'darkhub-suite', 'PGE Portable', 'Pokeralho Games Launcher.bat'),
    'C:\\Workspace\\DarkHub Suite\\PGE Portable\\Pokeralho Games Launcher.bat'
  ]

  for (const c of candidates) {
    try {
      if (fsRaw.existsSync(c)) {
        return c
      }
    } catch {}
  }
  return null
}

async function launchPgeBat(batPath) {
  try {
    const workingDirectory = path.dirname(batPath)
    log.info('Launching PGE Portable batch:', batPath, 'workingDir:', workingDirectory)

    const child = cp.spawn('cmd.exe', ['/c', 'start', 'Pokeralho Games Experience', batPath], {
      cwd: workingDirectory,
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    })
    child.unref()
    return { ok: true, path: batPath }
  } catch (err) {
    log.warn('Spawn failed, falling back to shell.openPath', err?.message)
    const shellError = await shell.openPath(batPath)
    if (!shellError) return { ok: true, path: batPath }

    return {
      ok: false,
      error: shellError || err?.message || 'Falha ao iniciar PGE Portable',
      path: batPath
    }
  }
}

ipcMain.handle('pge:openPortable', async () => {
  if (process.platform !== 'win32') return { ok: false, error: 'Only supported on Windows' }
  const batPath = findPgeBat()
  if (!batPath) {
    return { ok: false, error: 'Pokeralho Games Launcher.bat não encontrado.' }
  }
  return launchPgeBat(batPath)
})

ipcMain.handle('app:getAbout', async () => {
  return {
    name: app.getName(),
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    runtime: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      v8: process.versions.v8
    },
    platform: {
      platform: process.platform,
      arch: process.arch
    }
  }
})

ipcMain.handle('settings:getConfig', async () => {
  try {
    const { loadConfig: loadPersistedConfig } = await import('./configManager.js')
    const config = await loadPersistedConfig()
    const loginSettings = app.getLoginItemSettings()
    return {
      ok: true,
      config: {
        app: {
          ...(config.app ?? {}),
          openAtLogin: Boolean(loginSettings?.openAtLogin)
        },
        telemetry: {
          bugReportsEnabled: config.telemetry?.bugReportsEnabled !== false,
          includeDiagnostics: true,
          bugWebhookConfigured: Boolean(FIXED_BUG_WEBHOOK_URL)
        },
        liveServices: {
          latencyGuardian: config.liveServices?.latencyGuardian !== false,
          overlay: config.liveServices?.overlay !== false,
          autoClicker: config.liveServices?.autoClicker !== false
        }
      }
    }
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})

ipcMain.handle('settings:updateTelemetry', async (_event, payload) => {
  try {
    const { loadConfig: loadPersistedConfig, saveConfig } = await import('./configManager.js')
    const current = await loadPersistedConfig()

    const next = await saveConfig({
      ...current,
      telemetry: {
        ...current.telemetry,
        bugReportsEnabled: Boolean(payload?.bugReportsEnabled),
        bugWebhookUrl: '',
        includeDiagnostics: true
      }
    })
    await loadRuntimeConfig()
    return {
      ok: true,
      telemetry: {
        bugReportsEnabled: next.telemetry?.bugReportsEnabled !== false,
        includeDiagnostics: true,
        bugWebhookConfigured: Boolean(FIXED_BUG_WEBHOOK_URL)
      }
    }
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})

ipcMain.handle('settings:updateLiveServices', async (_event, payload) => {
  try {
    const { loadConfig: loadPersistedConfig, saveConfig } = await import('./configManager.js')
    const current = await loadPersistedConfig()

    const next = await saveConfig({
      ...current,
      liveServices: {
        ...(current.liveServices ?? {}),
        ...payload
      }
    })
    await loadRuntimeConfig()
    return { ok: true, liveServices: next.liveServices }
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})

ipcMain.handle('settings:updateWindowBehavior', async (_event, payload) => {
  try {
    const { loadConfig: loadPersistedConfig, saveConfig } = await import('./configManager.js')
    const current = await loadPersistedConfig()

    const next = await saveConfig({
      ...current,
      app: {
        ...(current.app ?? {}),
        closeToTray: Boolean(payload?.closeToTray)
      }
    })
    closeToTrayEnabled = next.app?.closeToTray !== false
    return { ok: true, app: next.app }
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})

ipcMain.handle('settings:updateStartupBehavior', async (_event, payload) => {
  try {
    const openAtLogin = Boolean(payload?.openAtLogin)
    const openAsHidden = Boolean(payload?.openAsHidden ?? true)
    app.setLoginItemSettings({
      openAtLogin,
      openAsHidden,
      args: openAsHidden ? ['--hidden'] : []
    })
    const { loadConfig: loadPersistedConfig, saveConfig } = await import('./configManager.js')
    const current = await loadPersistedConfig()
    const next = await saveConfig({
      ...current,
      app: {
        ...(current.app ?? {}),
        openAtLogin
      }
    })
    const updatedLogin = app.getLoginItemSettings()
    return { ok: true, openAtLogin: Boolean(updatedLogin?.openAtLogin) }
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})

ipcMain.handle('injector:inject', async (_event, payload) => {
  try {
    const { processName, dllPath } = payload;
    if (!processName || !dllPath) return { ok: false, error: 'Processo ou DLL invalidos' };
    if (typeof processName !== 'string' || typeof dllPath !== 'string') {
      return { ok: false, error: 'Processo ou DLL invalidos' };
    }
    if (!/\.dll$/i.test(dllPath.trim())) {
      return { ok: false, error: 'O caminho informado não aponta para um arquivo .dll' };
    }

    // As paths might have spaces AND contain single quotes; escapamos com
    // psSingleQuote (que dobra aspas simples: ' -> '') em vez de
    // interpolação direta. Sem isso, um valor contendo uma aspa simples
    // (ex: processName = "x' ; Remove-Item C:\ -Recurse -Force #") quebrava
    // o quoting do PowerShell e permitia injetar comandos arbitrários.
    const scriptPath = path.join(__dirname, 'DarkHub.Injector.ps1');
    const psCommand = `& ${psSingleQuote(scriptPath)} ${psSingleQuote(processName)} ${psSingleQuote(dllPath)}`;
    const { code, stdout, stderr } = await runPowerShell(psCommand, { timeoutMs: 15000 });

    if (stdout.includes('ERROR:')) {
      return { ok: false, error: stdout.trim() };
    }
    if (code !== 0) {
      return { ok: false, error: stderr || `Exited with code ${code}` };
    }
    return { ok: true, message: stdout.trim() };
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) };
  }
})

ipcMain.handle('telemetry:testBugReport', async () => {
  return reportBugTelemetry({
    source: 'settings-test',
    message: 'Teste de telemetria de bugs do DarkHub',
    details: 'Este evento confirma que o webhook configurado esta recebendo eventos.'
  })
})

ipcMain.handle('discord:sendMessage', async (_event, payload) => {
  const content = payload?.content
  if (typeof content !== 'string' || !content.trim()) return { ok: false, error: 'Empty message' }
  const res = await postDiscord(content)
  return res
})

ipcMain.handle('discord:reportError', async (_event, payload) => {
  return reportBugTelemetry(payload)
})

// ============================================================
// FRAMEPACER IPC HANDLERS
// ============================================================
ipcMain.handle('framepacer:start', async (_event, payload) => {
  return FramePacerEngine.start(payload)
})

ipcMain.handle('framepacer:stop', async () => {
  return FramePacerEngine.stop()
})

ipcMain.handle('framepacer:updateConfig', async (_event, payload) => {
  return FramePacerEngine.updateConfig(payload)
})

ipcMain.handle('framepacer:getMetrics', async () => {
  return FramePacerEngine.getMetrics()
})

ipcMain.handle('framepacer:createOverlay', async () => {
  createFramePacerOverlay()
  return { ok: true }
})

ipcMain.handle('framepacer:closeOverlay', async () => {
  closeFramePacerOverlay()
  return { ok: true }
})

ipcMain.handle('framepacer:toggleOverlay', async () => {
  return toggleFramePacerOverlay()
})

ipcMain.handle('framepacer:setOverlayClickThrough', async (_event, enabled) => {
  return setOverlayClickThrough(enabled)
})

ipcMain.handle('framepacer:setOverlayConfig', async (_event, config) => {
  return setOverlayConfig(config)
})

ipcMain.handle('framepacer:getOverlayStatus', async () => {
  return getOverlayStatus()
})

// Concede acesso a arquivos que o usuário arrastou (drag-and-drop) para a
// janela do app — o drop em si é um sinal explícito de intenção do
// usuário, equivalente a selecioná-los via diálogo nativo, mas o evento
// de drop do navegador não passa por dialog:selectFiles (que é quem
// normalmente chama grantFilePath). Sem este handler, o grant system
// bloquearia conversões de arquivos arrastados na tela do FileConverter.
ipcMain.handle('dialog:grantDroppedFiles', async (_event, filePaths) => {
  if (!Array.isArray(filePaths)) return { ok: false, error: 'Invalid file list' }
  const granted = []
  for (const p of filePaths) {
    if (typeof p === 'string' && p.trim()) {
      grantFilePath(p)
      granted.push(p)
    }
  }
  return { ok: true, granted }
})

ipcMain.handle('dialog:selectFiles', async (_event, options) => {
  const result = await dialog.showOpenDialog({
    title: options?.title ?? 'Select files',
    properties: ['openFile', 'multiSelections'],
    filters: options?.filters ?? []
  })
  for (const filePath of result.filePaths ?? []) grantFilePath(filePath)
  return { canceled: result.canceled, filePaths: result.filePaths }
})

ipcMain.handle('dialog:selectFolder', async (_event, options) => {
  const result = await dialog.showOpenDialog({
    title: options?.title ?? 'Select folder',
    properties: ['openDirectory'],
    defaultPath: options?.defaultPath
  })
  if (result.filePaths?.[0]) grantDirectoryPath(result.filePaths[0])
  return { canceled: result.canceled, folderPath: result.filePaths?.[0] ?? null }
})

ipcMain.handle('dialog:saveFile', async (_event, options) => {
  const result = await dialog.showSaveDialog({
    title: options?.title ?? 'Save file',
    defaultPath: options?.defaultPath,
    filters: options?.filters ?? []
  })
  if (result.filePath) grantFilePath(result.filePath)
  return { canceled: result.canceled, filePath: result.filePath ?? null }
})

ipcMain.handle('optimizer:getStartupItems', async () => AppManagerEngine.getStartupItems());
ipcMain.handle('optimizer:disableStartupItem', async (_event, payload) => AppManagerEngine.disableStartupItem(payload));
ipcMain.handle('optimizer:getServices', async () => AppManagerEngine.getServices());
ipcMain.handle('optimizer:disableService', async (_event, payload) => AppManagerEngine.disableService(payload));
ipcMain.handle('optimizer:getInstalledPrograms', async () => AppManagerEngine.getInstalledPrograms());
ipcMain.handle('optimizer:uninstallProgram', async (_event, payload) => AppManagerEngine.uninstallProgram(payload));
ipcMain.handle('optimizer:listBloatware', async () => AppManagerEngine.listBloatware());
ipcMain.handle('optimizer:removeSelectedBloatware', async (_event, payload) => AppManagerEngine.removeSelectedBloatware(payload));
ipcMain.handle('optimizer:getRunningProcesses', async () => AppManagerEngine.getRunningProcesses());
ipcMain.handle('optimizer:setProcessPriority', async (_event, payload) => AppManagerEngine.setProcessPriority(payload));
ipcMain.handle('optimizer:getGpuPreferences', async () => AppManagerEngine.getGpuPreferences());
ipcMain.handle('optimizer:setGpuPreference', async (_event, payload) => AppManagerEngine.setGpuPreference(payload));
ipcMain.handle('optimizer:removeGpuPreference', async (_event, payload) => AppManagerEngine.removeGpuPreference(payload));
ipcMain.handle('optimizer:getGpuInfo', async () => AppManagerEngine.getGpuInfo());
ipcMain.handle('optimizer:getHagsStatus', async () => AppManagerEngine.getHagsStatus());
ipcMain.handle('optimizer:setHagsStatus', async (_event, payload) => AppManagerEngine.setHagsStatus(payload));

ipcMain.handle('optimizer:uninstallProgramWithLeftovers', async (_event, payload) => AppManagerEngine.uninstallProgramWithLeftovers(payload));
ipcMain.handle('optimizer:advancedNetworkApply', async () => NetworkEngine.advancedNetworkApply());
ipcMain.handle('optimizer:advancedNetworkRevert', async () => NetworkEngine.advancedNetworkRevert());

ipcMain.handle('optimizer:deepTweaksList', async () => DeepTweaksEngine.listTweaks());
ipcMain.handle('optimizer:deepTweaksStatus', async () => DeepTweaksEngine.checkTweaksStatus());
ipcMain.handle('optimizer:deepTweaksAnalyze', async (_event, payload) => {
  const ids = payload?.tweakIds || [];
  const selected = DeepTweaksEngine.listTweaks().filter((t) => ids.includes(t.id));
  const changes = selected.flatMap((t) => t.changes.map((c) => ({ tweakId: t.id, ...c })));
  return { ok: true, summary: { count: selected.length, requiresAdmin: selected.some(t => t.requiresAdmin) }, changes };
});
ipcMain.handle('optimizer:deepTweaksApply', async (event, payload) => DeepTweaksEngine.applyTweaks(payload?.tweakIds || [], (channel, msg) => event.sender.send(channel, msg)));
ipcMain.handle('optimizer:deepTweaksRevert', async (event, payload) => DeepTweaksEngine.revertTweaks(payload?.tweakIds || [], (channel, msg) => event.sender.send(channel, msg)));
ipcMain.handle('optimizer:deepTweaksUndo', async (_event, payload) => DeepTweaksEngine.undoTweaks(payload?.undoToken));
ipcMain.handle('optimizer:globalRecommendedTweaks', async (event) => DeepTweaksEngine.applyTweaks(DeepTweaksEngine.listTweaks().map(t => t.id), (channel, msg) => event.sender.send(channel, msg)));

function isValidIpv4(value) {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed)) return false
  const parts = trimmed.split('.').map((p) => Number(p))
  if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false
  return true
}

ipcMain.handle('optimizer:setDnsServers', async (_event, payload) => {
  if (process.platform !== 'win32') return { ok: false, error: 'Only supported on Windows' }
  const primary = payload?.primary
  const secondary = payload?.secondary
  if (!isValidIpv4(primary) || !isValidIpv4(secondary)) return { ok: false, error: 'Invalid DNS server IP' }

  const ps = [
    `$servers = @(${psSingleQuote(primary.trim())},${psSingleQuote(secondary.trim())})`,
    `Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | ForEach-Object {`,
    `  Set-DnsClientServerAddress -InterfaceIndex $_.InterfaceIndex -ServerAddresses $servers`,
    `}`
  ].join('; ')

  try {
    const { code, stderr } = await runPowerShell(ps, { timeoutMs: 60000 })
    if (code !== 0) return { ok: false, error: stderr || 'Failed to set DNS servers' }
    return { ok: true, msg: `DNS applied: ${primary} / ${secondary}` }
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})

ipcMain.handle('optimizer:getDnsState', async () => {
  if (process.platform !== 'win32') return { ok: false, error: 'Only supported on Windows' }
  try {
    const adapter = await getActiveAdapterName()
    if (!adapter) return { ok: false, error: 'Active network adapter not found' }
    const ps = `
      $ErrorActionPreference='Stop'
      $a=${psSingleQuote(adapter)}
      $s = Get-DnsClientServerAddress -InterfaceAlias $a -AddressFamily IPv4
      [PSCustomObject]@{
        adapter = $a
        servers = @($s.ServerAddresses)
      } | ConvertTo-Json -Compress
    `
    const { code, stderr, data } = await runPowerShellJson(ps, { timeoutMs: 20000 })
    if (code !== 0) return { ok: false, error: stderr || 'Failed to read DNS state' }
    return { ok: true, adapter: data.adapter, servers: Array.isArray(data.servers) ? data.servers : [] }
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})

ipcMain.handle('optimizer:applyDns', async (_event, payload) => {
  if (process.platform !== 'win32') return { ok: false, error: 'Only supported on Windows' }
  const primary = payload?.primary
  const secondary = payload?.secondary
  if (!isValidIpv4(primary) || !isValidIpv4(secondary)) return { ok: false, error: 'Invalid DNS server IP' }
  try {
    const adapter = await getActiveAdapterName()
    if (!adapter) return { ok: false, error: 'Active network adapter not found' }

    const psRead = `
      $ErrorActionPreference='Stop'
      $a=${psSingleQuote(adapter)}
      $s = Get-DnsClientServerAddress -InterfaceAlias $a -AddressFamily IPv4
      [PSCustomObject]@{
        adapter = $a
        servers = @($s.ServerAddresses)
      } | ConvertTo-Json -Compress
    `
    const { code: codeRead, data: before, stderr: errRead } = await runPowerShellJson(psRead, { timeoutMs: 20000 })
    if (codeRead !== 0) return { ok: false, error: errRead || 'Failed to read DNS servers' }
    const prevServers = Array.isArray(before?.servers) ? before.servers : []

    const psApply = `
      $ErrorActionPreference='Stop'
      $a=${psSingleQuote(adapter)}
      Set-DnsClientServerAddress -InterfaceAlias $a -ServerAddresses @(${psSingleQuote(String(primary).trim())},${psSingleQuote(String(secondary).trim())})
    `
    const { code, stderr } = await runPowerShell(psApply, { timeoutMs: 30000 })
    if (code !== 0) return { ok: false, error: stderr || 'Failed to apply DNS servers' }

    const undoToken = `dns_${Date.now()}_${Math.random().toString(16).slice(2)}`
    dnsUndoStore.set(undoToken, { adapter, servers: prevServers })

    return {
      ok: true,
      msg: `DNS aplicado no adaptador ${adapter}: ${primary} / ${secondary}`,
      adapter,
      before: prevServers,
      after: [String(primary).trim(), String(secondary).trim()],
      undoToken
    }
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})

ipcMain.handle('optimizer:undoDns', async (_event, payload) => {
  if (process.platform !== 'win32') return { ok: false, error: 'Only supported on Windows' }
  const undoToken = payload?.undoToken
  if (typeof undoToken !== 'string' || !undoToken) return { ok: false, error: 'No undoToken' }
  const entry = dnsUndoStore.get(undoToken)
  if (!entry) return { ok: false, error: 'Undo token inválido ou expirado' }
  try {
    const adapter = entry.adapter
    const prev = Array.isArray(entry.servers) ? entry.servers : []
    if (prev.length === 0) {
      const ps = `
        $ErrorActionPreference='Stop'
        $a=${psSingleQuote(adapter)}
        Set-DnsClientServerAddress -InterfaceAlias $a -ResetServerAddresses
      `
      const { code, stderr } = await runPowerShell(ps, { timeoutMs: 30000 })
      if (code !== 0) return { ok: false, error: stderr || 'Failed to reset DNS servers' }
    } else {
      const safeServers = prev.map(psSingleQuote).join(',')
      const ps = `
        $ErrorActionPreference='Stop'
        $a=${psSingleQuote(adapter)}
        Set-DnsClientServerAddress -InterfaceAlias $a -ServerAddresses @(${safeServers})
      `
      const { code, stderr } = await runPowerShell(ps, { timeoutMs: 30000 })
      if (code !== 0) return { ok: false, error: stderr || 'Failed to restore DNS servers' }
    }
    dnsUndoStore.delete(undoToken)
    return { ok: true, msg: `DNS restaurado no adaptador ${adapter}`, adapter, servers: prev }
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})

ipcMain.handle('optimizer:dnsBenchmark', async (_event, payload) => {
  try {
    const timeoutMs = clampInt(payload?.timeoutMs, 300, 5000, 1500)
    const attempts = clampInt(payload?.attempts, 1, 5, 2)
    const concurrency = clampInt(payload?.concurrency, 1, 16, 8)
    const bench = await dnsBenchmark(dnsPresets, { timeoutMs, attempts, concurrency })
    return { ok: true, ...bench }
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})
// ============================================================
// HELPER: Criar Ponto de Restauração do Sistema
// ============================================================
async function createSystemRestorePoint(description) {
  if (process.platform !== 'win32') return false;

  try {
    const script = `
      $ErrorActionPreference = 'Stop'
      try {
        Checkpoint-Computer -Description ${psSingleQuote(description)} -RestorePointType "MODIFY_SETTINGS" -ErrorAction Stop
        Write-Output "SUCCESS"
      } catch {
        Write-Output "FAILED"
      }
    `;
    const { stdout } = await runPowerShell(script, { timeoutMs: 60000 });
    return stdout.includes('SUCCESS');
  } catch {
    return false;
  }
}

function sendRoutineEvent(event, routineId, type, message, extra = {}) {
  try {
    event.sender.send('optimizer:runEvent', {
      routineId,
      type,
      message,
      timestamp: Date.now(),
      ...extra
    })
  } catch {}
}

function sendRoutineProgress(event, routineId, progress, message, extra = {}) {
  const safeProgress = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)))
  sendRoutineEvent(event, routineId, 'progress', message, { progress: safeProgress, ...extra })
}

function extractProgressPercent(text) {
  const input = String(text ?? '')
  const match =
    input.match(/(?:verification|verifica(?:c|ç)(?:a|ã)o).*?(\d{1,3})\s*%/i) ||
    input.match(/(\d{1,3}(?:[.,]\d+)?)\s*%/)

  if (!match) return null
  const value = Number(String(match[1]).replace(',', '.'))
  if (!Number.isFinite(value)) return null
  return Math.max(0, Math.min(100, value))
}

const routineNameById = {
  'msi-mode': 'Ativar MSI Mode em adaptadores PCI',
  'kernel-extreme': 'Mod Extremo de Kernel e Latência',
  'network-extreme': 'Mod Extremo de Rede TCP/IP',
  'cpu-unpark': 'Desestacionar Núcleos de CPU',
  'defender-disable': 'Desativar Windows Defender (TrustedInstaller)',
  'defender-enable': 'Ativar Windows Defender',
  'open-tamper-settings': 'Abrir Proteção contra Adulteração',
  'disable-services': 'Desabilitar servicos desnecessarios',
  'disable-visual-effects': 'Desativar belezas visuais',
  'revert-visual-effects': 'Reverter efeitos visuais',
  'create-restore-point': 'Criar ponto de restauracao',
  'repair-windows': 'Reparar Windows',
  'high-performance': 'Modo de alto desempenho',
  'ultimate-performance': 'Modo Ultimate Performance',
  'timer-resolution': 'Ajustar temporizador',
  'clean-registry': 'Limpeza de registro',
  'clean-network': 'Limpar dados de rede',
  'dns-benchmark': 'DNS Benchmark',
  'game-route': 'Otimizar rota para jogos',
  'latency-optimizer': 'Otimizar latencia',
  'system-info': 'Informacoes do sistema',
  'activate-windows': 'Ativar Windows/Office',
  'clean-temp': 'Limpar arquivos temporarios',
  'startup-optimizer': 'Otimizador de inicializacao',
  'remove-bloatware': 'Remover bloatware',
  'optimize-ram': 'Otimizar memoria RAM',
  'advanced-network': 'Otimizacao avancada de rede',
  'advanced-network-revert': 'Reverter otimizacao de rede',
  'change-priority': 'Prioridade de aplicacao',
  'uninstall-program': 'Desinstalar programa',
  'open-antivirus': 'Antivirus MRT',
  'space-sniffer': 'SpaceSniffer',
  'disable-telemetry': 'Desativar telemetria do Windows',
  'revert-telemetry': 'Reverter telemetria do Windows',
  'disable-gamebar': 'Desativar Game Bar/Xbox',
  'optimize-memory': 'Otimizacoes de memoria',
  'optimize-network': 'Otimizacoes de rede'
}

function startRoutineHeartbeat(event, routineId) {
  let ticks = 0
  let progress = 3
  return setInterval(() => {
    ticks += 1
    progress = Math.min(92, progress + (ticks < 5 ? 3 : 1))
    sendRoutineProgress(
      event,
      routineId,
      progress,
      `Ainda executando. Tempo decorrido: ${ticks * 12}s.`
    )
  }, 12000)
}

function emitCommandOutput(event, routineId, prefix = '') {
  return (chunk) => {
    for (const line of String(chunk ?? '').split(/\r?\n/)) {
      const message = line.trim()
      if (message) sendRoutineEvent(event, routineId, 'log', prefix ? `${prefix}${message}` : message)
    }
  }
}

async function runRoutineCommand(event, routineId, command, args = [], {
  timeoutMs = 30000,
  allowCodes = [0],
  label = null,
  spawnOptions = {}
} = {}) {
  if (label) sendRoutineEvent(event, routineId, 'log', label)
  const result = await runCommand(command, args, {
    timeoutMs,
    spawnOptions,
    onStdout: emitCommandOutput(event, routineId),
    onStderr: emitCommandOutput(event, routineId, '[ERRO] ')
  })
  if (!allowCodes.includes(result.code)) {
    throw new Error(result.stderr || `${command} exited with code ${result.code}`)
  }
  return result
}

async function runRoutinePowerShell(event, routineId, script, options = {}) {
  const { label = null, allowCodes = [0], ...powerShellOptions } = options
  if (label) sendRoutineEvent(event, routineId, 'log', label)
  const result = await runPowerShell(script, {
    ...powerShellOptions,
    onStdout: emitCommandOutput(event, routineId),
    onStderr: emitCommandOutput(event, routineId, '[ERRO] ')
  })
  if (!allowCodes.includes(result.code)) {
    throw new Error(result.stderr || `PowerShell exited with code ${result.code}`)
  }
  return result
}

async function runRoutineCmdLine(event, routineId, commandLine, options = {}) {
  return runRoutineCommand(event, routineId, 'cmd', ['/d', '/s', '/c', String(commandLine)], options)
}

// ============================================================
// RUN ROUTINE HANDLER
// ============================================================
ipcMain.handle('optimizer:runRoutine', async (_event, routineId) => {
  let routineFailed = false;
  const startedAt = Date.now();
  const sendEvent = (type, message, extra = {}) => {
    try { _event.sender.send('optimizer:runEvent', { routineId, type, message, timestamp: Date.now(), ...extra }); } catch {}
  };
  sendEvent('progress', `Iniciando rotina: ${routineId}`, { progress: 3 });
  try {
    let res = { ok: false, error: 'Rotina desconhecida' };
    if (typeof routineId === 'string' && routineId.startsWith('pagefile:')) {
      const parts = routineId.split(':');
      res = await SystemEngine.setPagefile(parts[1], parts[2]);
    } else if (typeof routineId === 'string' && routineId.startsWith('hibernation:')) {
      const state = routineId.split(':')[1];
      res = await SystemEngine.toggleHibernation(state === 'on');
    } else if (typeof routineId === 'string' && routineId.startsWith('execpolicy:')) {
      const pol = routineId.split(':')[1];
      res = await SystemEngine.setExecutionPolicy(pol);
    } else if (typeof routineId === 'string' && routineId.startsWith('winfeature:')) {
      const feat = routineId.split(':')[1];
      res = await SystemEngine.toggleFeature(feat, true);
    } else if (typeof routineId === 'string' && routineId.startsWith('revert-winfeature:')) {
      const feat = routineId.split(':')[1];
      res = await SystemEngine.toggleFeature(feat, false);
    } else {
      switch (routineId) {
        case 'clean-temp': res = await SystemEngine.cleanRegistryAndTemp(); break;
        case 'clean-registry': res = await SystemEngine.cleanRegistryAndTemp(); break;
        case 'create-restore-point': res = await SystemEngine.createRestorePoint(); break;
        case 'repair-windows': res = await SystemEngine.repairWindows(); break;
        case 'high-performance': res = await SystemEngine.setPerformanceMode('high'); break;
        case 'ultimate-performance': res = await SystemEngine.setPerformanceMode('ultimate'); break;
        case 'activate-windows': res = await SystemEngine.activateWindows(); break;
        case 'optimize-ram': res = await MemoryEngine.optimizeRAM(); break;
        case 'optimize-memory': res = await MemoryEngine.optimizeRAM(); break;
        case 'timer-resolution': res = await MemoryEngine.adjustTimerResolution(); break;
        case 'latency-optimizer': res = await MemoryEngine.optimizeAudioLatency(); break;
        case 'clean-network': res = await NetworkEngine.cleanNetwork(); break;
        case 'advanced-network': res = await NetworkEngine.advancedNetworkApply(); break;
        case 'advanced-network-revert': res = await NetworkEngine.advancedNetworkRevert(); break;
        case 'optimize-network': res = await NetworkEngine.advancedNetworkApply(); break;
        case 'game-route': res = await NetworkEngine.optimizeGameRoute(); break;
        case 'disable-visual-effects': res = await VisualsEngine.disableVisualEffects(); break;
        case 'revert-visual-effects': res = await VisualsEngine.revertVisualEffects(); break;
        case 'open-antivirus': res = await ToolboxEngine.openAntivirus(); break;
        case 'space-sniffer': res = await ToolboxEngine.openSpaceSniffer(); break;
        case 'change-priority': res = await ToolboxEngine.openTaskManager(); break;
        case 'disable-telemetry': res = await DeepTweaksEngine.applyTweaks(['tweak:disableTelemetry'], () => {}); break;
        case 'revert-telemetry': res = await DeepTweaksEngine.undoTweaks('tweak:disableTelemetry'); break;
        case 'disable-ai': res = await DeepTweaksEngine.applyTweaks(['tweak:disableAiAndAds'], () => {}); break;
        case 'revert-ai': res = await DeepTweaksEngine.undoTweaks('tweak:disableAiAndAds'); break;
        case 'disable-gamebar': res = await DeepTweaksEngine.applyTweaks(['tweak:disableGameDvr'], () => {}); break;
        case 'startup-optimizer': res = { ok: true, msg: 'Use a aba Gerenciador de Inicialização interativa' }; break;
        case 'uninstall-program': res = { ok: true, msg: 'Use a aba Desinstalar Programas interativa' }; break;
        case 'remove-bloatware': res = { ok: true, msg: 'Use a aba Debloat interativa' }; break;
        case 'system-info': res = { ok: true, msg: 'Acesse o Painel de Controle para visualizar' }; break;
        case 'disable-services': res = await ServicesEngine.applyServicesTweak(); break;
        case 'revert-services': res = await ServicesEngine.revertServicesTweak(); break;
        case 'disable-core-isolation': res = await SystemEngine.applyHardcoreGamerMode(); break;
        case 'revert-core-isolation': res = await SystemEngine.revertHardcoreGamerMode(); break;
        case 'msi-mode': res = await SystemEngine.applyMsiMode(); break;
        case 'kernel-extreme': res = await SystemEngine.applyExtremeKernelMod(); break;
        case 'network-extreme': res = await SystemEngine.applyExtremeNetworkMod(); break;
        case 'cpu-unpark': res = await SystemEngine.applyCpuUnpark(); break;
        case 'defender-disable': res = await DefenderControlEngine.runNativeDefenderControl('disable'); break;
        case 'defender-enable': res = await DefenderControlEngine.runNativeDefenderControl('enable'); break;
        case 'open-tamper-settings': res = DefenderControlEngine.openTamperSettings(); break;
        case 'dns-benchmark': res = { ok: true, msg: 'Use a aba DNS' }; break;
        default: throw new Error(`Unknown routine: ${routineId}`);
      }
    }
    if (!res.ok) throw new Error(res.error || 'Operation failed');
    sendEvent('complete', `Rotina encerrada: ${routineId} (${res.msg || 'Concluído'})`, { progress: 100, ok: true, elapsedMs: Date.now() - startedAt });
    return res;
  } catch (err) {
    routineFailed = true;
    sendEvent('error', `Falha na rotina ${routineId}: ${err?.message ?? String(err)}`, { progress: 100, ok: false });
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('optimizer:getDefenderControlStatus', async () => {
  return await DefenderControlEngine.getStatus();
});
ipcMain.handle('optimizer:applyDefenderControl', async (_e, payload) => {
  return await DefenderControlEngine.runNativeDefenderControl(payload?.action || 'disable');
});
ipcMain.handle('optimizer:openTamperSettings', async () => {
  return DefenderControlEngine.openTamperSettings();
});
ipcMain.handle('optimizer:applyMsiMode', async () => {
  return await SystemEngine.applyMsiMode();
});
ipcMain.handle('optimizer:applyExtremeKernelMod', async () => {
  return await SystemEngine.applyExtremeKernelMod();
});
ipcMain.handle('optimizer:applyExtremeNetworkMod', async () => {
  return await SystemEngine.applyExtremeNetworkMod();
});
ipcMain.handle('optimizer:applyCpuUnpark', async () => {
  return await SystemEngine.applyCpuUnpark();
});

ipcMain.handle('files:convertImages', async (_event, payload) => {
  const { inputFiles, outputDir, outputFormat, quality, width, height } = payload ?? {}
  if (!Array.isArray(inputFiles) || inputFiles.length === 0) throw new Error('No input files')
  if (typeof outputDir !== 'string' || outputDir.trim().length === 0) throw new Error('No output directory')
  if (typeof outputFormat !== 'string') throw new Error('No output format')
  assertFileAccessGrantedMany(inputFiles, 'arquivo de entrada')
  assertFileAccessGranted(outputDir, 'pasta de saída')

  const format = outputFormat.toLowerCase().trim()
  const supported = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif', 'tiff', 'tif', 'bmp', 'gif', 'ico'])
  if (!supported.has(format)) throw new Error('Unsupported image output format')

  await fs.mkdir(outputDir, { recursive: true })
  const sharp = await getSharp()
  const q = Number(quality) > 0 ? Number(quality) : 85

  const results = await Promise.all(
    inputFiles.map(async (inputFile) => {
      if (typeof inputFile !== 'string' || inputFile.trim().length === 0) return null
      const base = path.basename(inputFile, path.extname(inputFile))
      const outExt = format === 'jpeg' ? 'jpg' : (format === 'tif' ? 'tiff' : format)
      const outputFile = path.join(outputDir, `${base}.${outExt}`)

      try {
        let pipeline = sharp(inputFile)
        if (width || height) {
          pipeline = pipeline.resize(width ? Number(width) : null, height ? Number(height) : null, { fit: 'inside' })
        }

        if (format === 'png') await pipeline.png({ quality: q, compressionLevel: 9 }).toFile(outputFile)
        else if (format === 'webp') await pipeline.webp({ quality: q }).toFile(outputFile)
        else if (format === 'avif') await pipeline.avif({ quality: Math.max(30, Math.floor(q * 0.7)) }).toFile(outputFile)
        else if (format === 'tiff' || format === 'tif') await pipeline.tiff({ quality: q }).toFile(outputFile)
        else if (format === 'gif') await pipeline.gif().toFile(outputFile)
        else if (format === 'ico') {
          const pngBuf = await pipeline.resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
          await fs.writeFile(outputFile, pngBuf)
        } else if (format === 'bmp') {
          await pipeline.png().toFile(outputFile)
        } else {
          await pipeline.jpeg({ quality: q }).toFile(outputFile)
        }
        return { inputFile, outputFile, ok: true }
      } catch (err) {
        return { inputFile, outputFile, ok: false, error: err?.message ?? String(err) }
      }
    })
  )

  return results.filter(Boolean)
})

ipcMain.handle('files:convertMedia', async (_event, payload) => {
  const { inputFiles, outputDir, outputFormat, bitrate, fps } = payload ?? {}
  if (!Array.isArray(inputFiles) || inputFiles.length === 0) throw new Error('No input files')
  if (typeof outputDir !== 'string' || outputDir.trim().length === 0) throw new Error('No output directory')
  if (typeof outputFormat !== 'string' || outputFormat.trim().length === 0) throw new Error('No output format')
  assertFileAccessGrantedMany(inputFiles, 'arquivo de entrada')
  assertFileAccessGranted(outputDir, 'pasta de saída')

  const ffmpegPath = await getFfmpegPath()
  if (typeof ffmpegPath !== 'string' || ffmpegPath.trim().length === 0) {
    throw new Error('FFmpeg not available')
  }

  const format = outputFormat.toLowerCase().trim()
  const supported = new Set(['mp4', 'mkv', 'webm', 'mov', 'avi', 'wmv', 'flv', 'gif', 'mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus', 'wma'])
  if (!supported.has(format)) throw new Error('Unsupported output format')

  await fs.mkdir(outputDir, { recursive: true })

  const results = []
  for (const inputFile of inputFiles) {
    if (typeof inputFile !== 'string' || inputFile.trim().length === 0) continue
    const base = path.basename(inputFile, path.extname(inputFile))
    const outputFile = path.join(outputDir, `${base}.${format}`)

    const args = ['-y', '-i', inputFile]
    if (format === 'mp3') args.push('-vn', '-c:a', 'libmp3lame', '-b:a', bitrate || '320k')
    else if (format === 'wav') args.push('-vn', '-c:a', 'pcm_s16le')
    else if (format === 'flac') args.push('-vn', '-c:a', 'flac')
    else if (format === 'aac' || format === 'm4a') args.push('-vn', '-c:a', 'aac', '-b:a', bitrate || '256k')
    else if (format === 'ogg') args.push('-vn', '-c:a', 'libvorbis', '-q:a', '6')
    else if (format === 'opus') args.push('-vn', '-c:a', 'libopus', '-b:a', bitrate || '160k')
    else if (format === 'wma') args.push('-vn', '-c:a', 'wmav2', '-b:a', '192k')
    else if (format === 'gif') {
      args.push('-vf', `fps=${fps || 15},scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`)
    } else if (format === 'webm') {
      args.push('-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0', '-c:a', 'libopus')
    } else if (format === 'mp4') {
      args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-c:a', 'aac', '-b:a', '192k')
    } else if (format === 'mkv') {
      args.push('-c:v', 'libx264', '-crf', '22', '-c:a', 'aac')
    } else if (format === 'avi') {
      args.push('-c:v', 'mpeg4', '-vtag', 'XVID', '-qscale:v', '3', '-c:a', 'libmp3lame')
    } else if (format === 'mov') {
      args.push('-c:v', 'libx264', '-c:a', 'aac')
    } else if (format === 'wmv') {
      args.push('-c:v', 'wmv2', '-c:a', 'wmav2')
    }

    args.push(outputFile)

    try {
      const { code, stderr } = await runCommand(ffmpegPath, args, { timeoutMs: 30 * 60 * 1000, trim: true })
      if (code !== 0) throw new Error(stderr || `ffmpeg exited with ${code}`)
      results.push({ inputFile, outputFile, ok: true })
    } catch (err) {
      results.push({ inputFile, outputFile, ok: false, error: err?.message ?? String(err) })
    }
  }

  return results
})

async function findLibreOfficeSoffice() {
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\\\Program Files\\\\LibreOffice\\\\program\\\\soffice.exe',
      'C:\\\\Program Files (x86)\\\\LibreOffice\\\\program\\\\soffice.exe'
    ]
    for (const p of candidates) {
      try {
        await fs.access(p)
        return p
      } catch {}
    }
  }

  const candidate = process.platform === 'darwin' ? '/Applications/LibreOffice.app/Contents/MacOS/soffice' : 'soffice'
  try {
    const { code } = await runCommand(candidate, ['--version'], { timeoutMs: 5000 })
    if (code === 0) return candidate
  } catch {}

  return null
}

ipcMain.handle('files:checkLibreOffice', async () => {
  const soffice = await findLibreOfficeSoffice()
  return { ok: Boolean(soffice), soffice }
})

ipcMain.handle('files:convertDocuments', async (_event, payload) => {
  const { inputFiles, outputDir, outputFormat } = payload ?? {}
  if (!Array.isArray(inputFiles) || inputFiles.length === 0) throw new Error('No input files')
  if (typeof outputDir !== 'string' || outputDir.trim().length === 0) throw new Error('No output directory')
  if (typeof outputFormat !== 'string' || outputFormat.trim().length === 0) throw new Error('No output format')
  assertFileAccessGrantedMany(inputFiles, 'arquivo de entrada')
  assertFileAccessGranted(outputDir, 'pasta de saída')

  const format = outputFormat.toLowerCase().trim()
  await fs.mkdir(outputDir, { recursive: true })

  const results = []
  for (const inputFile of inputFiles) {
    if (typeof inputFile !== 'string' || inputFile.trim().length === 0) continue
    const base = path.basename(inputFile, path.extname(inputFile))
    const inExt = path.extname(inputFile).toLowerCase().replace('.', '')
    const outputFile = path.join(outputDir, `${base}.${format}`)

    try {
      if (inExt === 'pdf' && format === 'txt') {
        const dataBuffer = await fs.readFile(inputFile)
        const pdfParseMod = (await import('pdf-parse')).default ?? (await import('pdf-parse'))
        const parsed = await pdfParseMod(dataBuffer)
        await fs.writeFile(outputFile, parsed.text || '', 'utf8')
        results.push({ inputFile, outputFile, ok: true })
        continue
      }

      if (inExt === 'csv' && format === 'json') {
        const raw = await fs.readFile(inputFile, 'utf8')
        const lines = raw.split(/\r?\n/).filter(l => l.trim())
        if (lines.length > 0) {
          const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''))
          const jsonArr = lines.slice(1).map(line => {
            const values = line.split(',').map(v => v.trim().replace(/^["']|["']$/g, ''))
            const obj = {}
            headers.forEach((h, i) => { obj[h] = values[i] ?? '' })
            return obj
          })
          await fs.writeFile(outputFile, JSON.stringify(jsonArr, null, 2), 'utf8')
          results.push({ inputFile, outputFile, ok: true })
          continue
        }
      }

      if (inExt === 'json' && format === 'csv') {
        const raw = await fs.readFile(inputFile, 'utf8')
        const json = JSON.parse(raw)
        const arr = Array.isArray(json) ? json : [json]
        if (arr.length > 0) {
          const headers = Array.from(new Set(arr.flatMap(o => Object.keys(o || {}))))
          const csvRows = [
            headers.join(','),
            ...arr.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','))
          ]
          await fs.writeFile(outputFile, csvRows.join('\r\n'), 'utf8')
          results.push({ inputFile, outputFile, ok: true })
          continue
        }
      }

      if (inExt === 'json' && format === 'xml') {
        const raw = await fs.readFile(inputFile, 'utf8')
        const json = JSON.parse(raw)
        const toXml = (obj, tag = 'root') => {
          if (typeof obj !== 'object' || obj === null) return `<${tag}>${String(obj)}</${tag}>`
          if (Array.isArray(obj)) return obj.map(item => toXml(item, 'item')).join('')
          return `<${tag}>${Object.entries(obj).map(([k, v]) => toXml(v, k.replace(/[^a-zA-Z0-9_-]/g, '_'))).join('')}</${tag}>`
        }
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${toXml(json)}`
        await fs.writeFile(outputFile, xml, 'utf8')
        results.push({ inputFile, outputFile, ok: true })
        continue
      }

      if (inExt === 'md' && format === 'html') {
        const raw = await fs.readFile(inputFile, 'utf8')
        const html = raw
          .replace(/^# (.*$)/gim, '<h1>$1</h1>')
          .replace(/^## (.*$)/gim, '<h2>$1</h2>')
          .replace(/^### (.*$)/gim, '<h3>$1</h3>')
          .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
          .replace(/\*(.*)\*/gim, '<i>$1</i>')
          .replace(/\n/gim, '<br/>\n')
        const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${base}</title><style>body{font-family:sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem;line-height:1.6;color:#333;}</style></head><body>${html}</body></html>`
        await fs.writeFile(outputFile, doc, 'utf8')
        results.push({ inputFile, outputFile, ok: true })
        continue
      }

      const soffice = await findLibreOfficeSoffice()
      if (soffice) {
        const convertTo = format === 'txt' ? 'txt:Text' : format
        const args = ['--headless', '--nologo', '--nolockcheck', '--nodefault', '--norestore', '--convert-to', convertTo, '--outdir', outputDir, inputFile]
        const { code, stderr } = await runCommand(soffice, args, { timeoutMs: 5 * 60 * 1000, trim: true })
        if (code !== 0) throw new Error(stderr || `soffice exited with ${code}`)
        results.push({ inputFile, outputFile, ok: true })
        continue
      }

      throw new Error(`Conversão de .${inExt} para .${format} requer LibreOffice ou formato incompatível.`)
    } catch (err) {
      results.push({ inputFile, outputFile, ok: false, error: err?.message ?? String(err) })
    }
  }

  return results
})

ipcMain.handle('files:archiveOperation', async (_event, payload) => {
  const { action, inputFiles, outputArchive, extractDir } = payload ?? {}
  if (action === 'compress') {
    if (!Array.isArray(inputFiles) || inputFiles.length === 0 || !outputArchive) throw new Error('Invalid arguments')
    assertFileAccessGrantedMany(inputFiles, 'arquivo para compactar')
    assertFileAccessGranted(path.dirname(outputArchive), 'pasta de destino')
    const args = ['-a', '-c', '-f', outputArchive, ...inputFiles.map(f => path.basename(f))]
    const cwd = path.dirname(inputFiles[0])
    const { code, stderr } = await runCommand('tar.exe', args, { cwd, timeoutMs: 10 * 60 * 1000 })
    if (code !== 0) throw new Error(stderr || `tar exited with code ${code}`)
    return { ok: true, outputArchive }
  } else if (action === 'extract') {
    if (!Array.isArray(inputFiles) || inputFiles.length === 0 || !extractDir) throw new Error('Invalid arguments')
    assertFileAccessGranted(inputFiles[0], 'arquivo compactado')
    assertFileAccessGranted(extractDir, 'pasta de extração')
    await fs.mkdir(extractDir, { recursive: true })
    const args = ['-x', '-f', inputFiles[0], '-C', extractDir]
    const { code, stderr } = await runCommand('tar.exe', args, { timeoutMs: 10 * 60 * 1000 })
    if (code !== 0) throw new Error(stderr || `tar exited with code ${code}`)
    return { ok: true, extractDir }
  }
  throw new Error('Invalid action')
})

ipcMain.handle('youtube:getVideoInfo', async (_event, payload) => {
  try {
    const url = typeof payload === 'string' ? payload : payload?.url
    const cookiesPath = typeof payload === 'object' ? payload?.cookiesPath : null
    const cookiesFromBrowserRaw = typeof payload === 'object' ? payload?.cookiesFromBrowser : null
    const userAgentRaw = typeof payload === 'object' ? payload?.userAgent : null
    const clientRaw = typeof payload === 'object' ? payload?.client : null
    if (typeof url !== 'string' || url.trim().length === 0) throw new Error('Missing URL')

    const toolsDir = path.join(app.getPath('userData'), 'tools')
    const ffmpegPath = await getFfmpegPath()
    const ffmpegLocation = typeof ffmpegPath === 'string' && fsRaw.existsSync(ffmpegPath)
      ? path.dirname(ffmpegPath)
      : (fsRaw.existsSync(path.join(toolsDir, 'ffmpeg.exe')) ? toolsDir : null)
    let ytDlpError = null

    try {
      const { ensureYtDlp, runYtDlp } = await getYtDlpTools()
      const ytdlpPath = await ensureYtDlp(toolsDir, process.platform)

      const buildArgs = (clientType, isPlaylistCheck = false) => {
        const args = ['-J', '--no-warnings']
        if (!isPlaylistCheck) args.push('--flat-playlist')
        if (ffmpegLocation && fsRaw.existsSync(ffmpegLocation)) args.push('--ffmpeg-location', ffmpegLocation)
        if (typeof cookiesPath === 'string' && cookiesPath.trim().length) {
          args.push('--cookies', cookiesPath)
        } else if (typeof cookiesFromBrowserRaw === 'string' && cookiesFromBrowserRaw.trim().length) {
          args.push('--cookies-from-browser', cookiesFromBrowserRaw.trim().slice(0, 80))
        }
        if (typeof userAgentRaw === 'string' && userAgentRaw.trim().length) {
          args.push('--add-headers', `User-Agent:${userAgentRaw.trim().slice(0, 300)}`)
        }
        const client = clientType || (typeof clientRaw === 'string' && clientRaw.trim().length ? clientRaw.trim() : 'android,web')
        args.push('--extractor-args', `youtube:player_client=${client}`)
        args.push(String(url))
        return args
      }

      let res = await runYtDlp(ytdlpPath, buildArgs(), { timeoutMs: 45000 })

      if (res.code !== 0 && (res.stderr?.includes('Sign in') || res.stderr?.includes('bot') || res.stderr?.includes('403'))) {
        res = await runYtDlp(ytdlpPath, buildArgs('ios,android'), { timeoutMs: 45000 })
      }

      if (res.code !== 0) throw new Error(res.stderr || 'yt-dlp failed')
      const data = JSON.parse(res.stdout)

      const isPlaylist = data._type === 'playlist' || (Array.isArray(data.entries) && data.entries.length > 1)
      if (isPlaylist) {
        const entries = Array.isArray(data.entries) ? data.entries : []
        return {
          isPlaylist: true,
          title: data.title || 'Playlist do YouTube',
          author: data.uploader ?? data.channel ?? data.channel_title ?? 'YouTube Playlist',
          thumbnail: data.thumbnails?.[0]?.url || entries[0]?.thumbnails?.[0]?.url || '',
          itemCount: entries.length || data.playlist_count || 0,
          entries: entries.slice(0, 100).map((e) => ({
            id: e.id,
            title: e.title || 'Faixa',
            duration: e.duration || 0,
            uploader: e.uploader || e.channel || ''
          })),
          extractor: 'yt-dlp'
        }
      }

      const formats = Array.isArray(data.formats) ? data.formats : []
      return {
        isPlaylist: false,
        title: data.title,
        author: data.uploader ?? data.channel ?? '',
        thumbnail: data.thumbnail,
        duration: data.duration ?? 0,
        viewCount: data.view_count ?? 0,
        extractor: 'yt-dlp',
        formats: formats
          .filter((f) => f && f.format_id)
          .map((f) => ({
            id: String(f.format_id),
            ext: f.ext,
            acodec: f.acodec,
            vcodec: f.vcodec,
            resolution: f.resolution ?? (f.width && f.height ? `${f.width}x${f.height}` : null),
            fps: f.fps ?? null,
            abr: f.abr ?? null,
            vbr: f.vbr ?? null,
            filesize: f.filesize ?? f.filesize_approx ?? null,
            formatNote: f.format_note ?? null
          }))
      }
    } catch (err) {
      ytDlpError = err?.message ?? String(err)
    }

    try {
      const ytdl = await getYtdl()
      const info = await ytdl.getInfo(url)
      return {
        isPlaylist: false,
        title: info.videoDetails.title,
        author: info.videoDetails.author.name,
        thumbnail: info.videoDetails.thumbnails[0]?.url,
        duration: parseInt(info.videoDetails.lengthSeconds, 10) || 0,
        viewCount: parseInt(info.videoDetails.viewCount, 10) || 0,
        extractor: 'ytdl-core',
        formats: info.formats.map((f) => ({
          id: String(f.itag),
          ext: f.container,
          acodec: f.audioCodec,
          vcodec: f.videoCodec,
          resolution: f.qualityLabel ?? null,
          fps: f.fps ?? null,
          abr: f.audioBitrate ?? null,
          vbr: null,
          filesize: null,
          formatNote: f.quality ?? null
        }))
      }
    } catch (err) {
      const ytdlError = err?.message ?? String(err)
      const prefix = ytDlpError ? `yt-dlp falhou: ${ytDlpError} | ` : ''
      throw new Error(prefix + ytdlError)
    }
  } catch (err) {
    try {
      await reportBugTelemetry({
        source: 'main-ipc',
        channel: 'youtube:getVideoInfo',
        message: err?.message ?? String(err),
        stack: err?.stack ?? ''
      })
    } catch {}
    throw new Error(`Erro ao obter informações do vídeo/playlist: ${err.message}`)
  }
})

ipcMain.handle('youtube:download', async (event, payload) => {
  const {
    url,
    outputDir,
    formatId,
    mode,
    cookiesPath,
    cookiesFromBrowser,
    userAgent,
    client,
    sleepIntervalSec,
    downloadEntirePlaylist,
    embedThumbnail = true,
    embedMetadata = true
  } = payload
  if (!url || !outputDir) throw new Error('Missing URL or output directory')
  assertFileAccessGranted(outputDir, 'pasta de destino')
  if (typeof cookiesPath === 'string' && cookiesPath.trim().length) {
    assertFileAccessGranted(cookiesPath, 'arquivo de cookies')
  }

  try {
    const toolsDir = path.join(app.getPath('userData'), 'tools')
    const { ensureYtDlp, runYtDlp } = await getYtDlpTools()
    const ytdlpPath = await ensureYtDlp(toolsDir, process.platform)
    const ffmpegPath = await getFfmpegPath()
    const ffmpegLocation = typeof ffmpegPath === 'string' && fsRaw.existsSync(ffmpegPath)
      ? path.dirname(ffmpegPath)
      : (fsRaw.existsSync(path.join(toolsDir, 'ffmpeg.exe')) ? toolsDir : null)

    const isPlaylistMode = downloadEntirePlaylist === true
    const template = isPlaylistMode
      ? '%(playlist_title,playlist)s/%(playlist_index)02d - %(title).180B.%(ext)s'
      : '%(title).180B.%(ext)s'

    const args = [
      '--no-warnings',
      '-P', outputDir,
      '-o', template,
      '--no-mtime',
      '--retries', '10',
      '--fragment-retries', '10',
      '--concurrent-fragments', '4'
    ]

    if (ffmpegLocation && fsRaw.existsSync(ffmpegLocation)) {
      args.push('--ffmpeg-location', ffmpegLocation)
    }

    if (downloadEntirePlaylist === false) {
      args.push('--no-playlist')
    }

    if (embedMetadata) args.push('--embed-metadata')
    if (embedThumbnail) args.push('--embed-thumbnail')

    if (typeof cookiesPath === 'string' && cookiesPath.trim().length) {
      await fs.access(cookiesPath)
      args.push('--cookies', cookiesPath)
    } else if (typeof cookiesFromBrowser === 'string' && cookiesFromBrowser.trim().length) {
      args.push('--cookies-from-browser', cookiesFromBrowser.trim().slice(0, 80))
    }
    if (typeof userAgent === 'string' && userAgent.trim().length) {
      args.push('--add-headers', `User-Agent:${userAgent.trim().slice(0, 300)}`)
    }

    const clientType = typeof client === 'string' && client.trim().length ? client.trim().slice(0, 40) : 'android,web'
    args.push('--extractor-args', `youtube:player_client=${clientType}`)

    const sleepSec = Number(sleepIntervalSec)
    if (Number.isFinite(sleepSec) && sleepSec > 0) {
      const s = Math.max(1, Math.min(20, Math.trunc(sleepSec)))
      args.push('--sleep-interval', String(s), '--max-sleep-interval', String(s))
    }

    if (mode === 'audio-mp3') {
      args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0')
    } else if (mode === 'audio-wav') {
      args.push('-x', '--audio-format', 'wav')
    } else if (mode === 'audio-flac') {
      args.push('-x', '--audio-format', 'flac')
    } else if (mode === 'audio-m4a') {
      args.push('-x', '--audio-format', 'm4a')
    } else if (mode === 'audio-opus') {
      args.push('-x', '--audio-format', 'opus')
    } else if (mode === 'video-4k') {
      args.push('-f', 'bestvideo[height>=2160]+bestaudio/bestvideo+bestaudio/best', '--merge-output-format', 'mp4')
    } else if (mode === 'video-1440p') {
      args.push('-f', 'bestvideo[height<=1440]+bestaudio/bestvideo+bestaudio/best', '--merge-output-format', 'mp4')
    } else if (mode === 'video-1080p') {
      args.push('-f', 'bv*[height<=1080]+ba/b[height<=1080]/best', '--merge-output-format', 'mp4')
    } else if (mode === 'video-720p') {
      args.push('-f', 'bv*[height<=720]+ba/b[height<=720]/best', '--merge-output-format', 'mp4')
    } else if (mode === 'video-480p') {
      args.push('-f', 'bv*[height<=480]+ba/b[height<=480]/best', '--merge-output-format', 'mp4')
    } else if (typeof formatId === 'string' && formatId.trim().length) {
      args.push('-f', `${formatId.trim()}+bestaudio/best`, '--merge-output-format', 'mp4')
    } else {
      args.push('-f', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bestvideo+bestaudio/best', '--merge-output-format', 'mp4')
    }

    args.push(String(url))

    const { code, stderr } = await runYtDlp(ytdlpPath, args, {
      timeoutMs: 60 * 60 * 1000,
      onProgress: (prog) => {
        try {
          if (!event.sender.isDestroyed()) {
            event.sender.send('youtube:downloadProgress', prog)
          }
        } catch {}
      }
    })

    if (code !== 0) throw new Error(stderr || 'Download via yt-dlp falhou.')
    return { ok: true, msg: isPlaylistMode ? 'Playlist baixada e convertida com sucesso!' : 'Download concluído com sucesso.' }
  } catch (err) {
    try {
      await reportBugTelemetry({
        source: 'main-ipc',
        channel: 'youtube:download',
        message: err?.message ?? String(err),
        stack: err?.stack ?? ''
      })
    } catch {}
    throw new Error(`Download falhou: ${err.message}`)
  }
})

ipcMain.handle('youtube:cancel', async () => {
  try {
    const { cancelActiveYtDlp } = await import('./ytdlp.js')
    const stopped = cancelActiveYtDlp()
    return { ok: true, stopped }
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})

// --- Steam Lua & Depot Tools ---
ipcMain.handle('steamLua:getStatus', async () => {
  return steamLuaService.getSteamStatus()
})

ipcMain.handle('steamLua:listInstalled', async () => {
  return steamLuaService.listInstalledLuas()
})

ipcMain.handle('steamLua:getDetails', async (_event, appId) => {
  return steamLuaService.getLuaDetails(Number(appId))
})

ipcMain.handle('steamLua:saveLuaText', async (_event, payload) => {
  const appId = payload?.appId
  const rawText = payload?.rawText
  if (!Number.isFinite(Number(appId)) || typeof rawText !== 'string') {
    throw new Error('Invalid saveLuaText payload')
  }
  return steamLuaService.saveLuaText(Number(appId), String(rawText))
})

ipcMain.handle('steamLua:toggleDepot', async (_event, payload) => {
  const { appId, depotId, options } = payload || {}
  if (!Number.isFinite(Number(appId)) || !Number.isFinite(Number(depotId))) {
    throw new Error('Invalid toggleDepot payload')
  }
  return steamLuaService.toggleDepot(Number(appId), Number(depotId), options || {})
})

ipcMain.handle('steamLua:toggleOnlineFix', async (_event, payload) => {
  const appId = payload?.appId
  const enable = Boolean(payload?.enable)
  if (!Number.isFinite(Number(appId))) {
    throw new Error('Invalid toggleOnlineFix payload')
  }
  return steamLuaService.toggleOnlineFix(Number(appId), enable)
})

ipcMain.handle('steamLua:configureSpacewarAppIdTxt', async (_event, payload) => {
  const targetPath = payload?.targetPath
  const appId = payload?.appId || 480
  return steamLuaService.configureSpacewarAppIdTxt(targetPath, appId)
})

ipcMain.handle('steamLua:deleteLua', async (_event, appId) => {
  return steamLuaService.deleteLua(Number(appId))
})

ipcMain.handle('steamLua:installLua', async (_event, payload) => {
  const { filePath, appId, options } = payload || {}
  if (typeof filePath !== 'string' || !Number.isFinite(Number(appId))) {
    throw new Error('Invalid installLua payload')
  }
  return steamLuaService.installLuaFile(filePath, Number(appId), options || {})
})

ipcMain.handle('steamLua:installManifest', async (_event, filePath) => {
  return steamLuaService.installManifestFile(filePath)
})

ipcMain.handle('steamLua:restartSteam', async () => {
  const status = steamLuaService.getSteamStatus()
  if (!status.steamPath) return false
  return SteamLocator.restartSteam(status.steamPath)
})

ipcMain.handle('steamLua:openStPlugInFolder', async () => {
  const status = steamLuaService.getSteamStatus()
  if (status.stPlugInDir && fsRaw.existsSync(status.stPlugInDir)) {
    shell.openPath(status.stPlugInDir)
    return true
  }
  if (status.steamPath && fsRaw.existsSync(status.steamPath)) {
    shell.openPath(status.steamPath)
    return true
  }
  return false
})

ipcMain.handle('steamLua:fetchStoreInfo', async (_event, appId) => {
  return steamLuaService.fetchSteamStoreInfo(Number(appId))
})

ipcMain.handle('steamLua:downloadAndInstallPackage', async (_event, payload) => {
  const appId = payload?.appId || payload
  const autoUpdate = payload?.autoUpdate !== false
  const onlineFix = Boolean(payload?.onlineFix)
  return steamLuaService.downloadAndInstallPackage(appId, { autoUpdate, onlineFix })
})

ipcMain.handle('steamUnlocker:getStatus', async () => {
  return steamUnlockerService.getUnlockerStatus()
})

ipcMain.handle('steamUnlocker:install', async (_event, mode) => {
  return steamUnlockerService.installUnlocker(mode || 'OST')
})

ipcMain.handle('steamUnlocker:uninstall', async () => {
  return steamUnlockerService.uninstallUnlocker()
})

ipcMain.handle('ocr:extractText', async (_event, payload) => {
  const imagePath = typeof payload === 'string' ? payload : payload?.imagePath
  const base64Data = typeof payload === 'object' && payload?.base64 ? String(payload.base64) : null
  const lang = typeof payload === 'object' && payload?.lang ? String(payload.lang) : 'eng+por'
  const preprocess = typeof payload === 'object' ? Boolean(payload?.preprocess ?? true) : true

  let worker = null
  try {
    let inputBuffer = null
    if (base64Data) {
      const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '')
      inputBuffer = Buffer.from(cleanBase64, 'base64')
    } else if (imagePath) {
      assertFileAccessGranted(imagePath, 'imagem')
      inputBuffer = await fs.readFile(imagePath)
    } else {
      throw new Error('Nenhuma imagem fornecida para o OCR')
    }

    if (preprocess) {
      try {
        const sharp = await getSharp()
        inputBuffer = await sharp(inputBuffer)
          .grayscale()
          .linear(1.3, -20)
          .sharpen()
          .toBuffer()
      } catch {}
    }

    worker = await createOcrWorker(lang)
    const ret = await worker.recognize(inputBuffer)
    return { ok: true, text: ret?.data?.text || '', confidence: ret?.data?.confidence || 0 }
  } catch (err) {
    throw new Error(`OCR failed: ${err.message}`)
  } finally {
    if (worker) {
      try {
        await worker.terminate()
      } catch {}
    }
  }
})

const VAULT_VERSION = 1
const vaultFilePath = () => path.join(app.getPath('userData'), 'vault.dhv')

let vaultUnlocked = false
let vaultKey = null
let vaultData = null
let vaultAutoLockMinutes = 10
let vaultLockTimer = null

function setVaultAutoLockMinutes(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return
  vaultAutoLockMinutes = Math.max(0, Math.min(240, Math.trunc(n)))
  scheduleVaultAutoLock()
}

function clearVaultAutoLock() {
  if (vaultLockTimer) {
    clearTimeout(vaultLockTimer)
    vaultLockTimer = null
  }
}

function scheduleVaultAutoLock() {
  clearVaultAutoLock()
  if (!vaultUnlocked) return
  if (!vaultAutoLockMinutes) return
  vaultLockTimer = setTimeout(() => {
    lockVault()
  }, vaultAutoLockMinutes * 60 * 1000)
}

function touchVault() {
  scheduleVaultAutoLock()
}

async function vaultFileExists() {
  try {
    await fs.access(vaultFilePath())
    return true
  } catch {
    return false
  }
}

async function readVaultFile() {
  const raw = await fs.readFile(vaultFilePath(), 'utf8')
  return JSON.parse(raw)
}

async function writeVaultFile(obj) {
  const content = JSON.stringify(obj)
  await fs.writeFile(vaultFilePath(), content, 'utf8')
}

function lockVault() {
  vaultUnlocked = false
  vaultKey = null
  vaultData = null
  clearVaultAutoLock()
}

async function ensureUnlocked() {
  if (!vaultUnlocked || !vaultKey || !vaultData) throw new Error('Vault is locked')
  touchVault()
}

async function loadVaultUsingWrapper(wrapper, password) {
  const file = await readVaultFile()
  if (file?.version !== VAULT_VERSION) throw new Error('Unsupported vault version')
  const wrapped = file?.wrappers?.[wrapper]
  if (!wrapped) throw new Error('Vault wrapper missing')

  const vk = await unwrapVaultKeyWithPassword(wrapped, password)
  const data = decryptVaultData(vk, file?.data)
  vaultUnlocked = true
  vaultKey = vk
  vaultData = data
  scheduleVaultAutoLock()
  return { file, data }
}

async function persistVaultData() {
  await ensureUnlocked()
  const file = await readVaultFile()
  const next = {
    ...file,
    data: encryptVaultData(vaultKey, {
      ...vaultData,
      updatedAt: Date.now()
    })
  }
  await writeVaultFile(next)
  vaultData = decryptVaultData(vaultKey, next.data)
}

ipcMain.handle('vault:status', async () => {
  const initialized = await vaultFileExists()
  return { initialized, locked: !vaultUnlocked, autoLockMinutes: vaultAutoLockMinutes }
})

ipcMain.handle('vault:setAutoLockMinutes', async (_event, minutes) => {
  setVaultAutoLockMinutes(minutes)
  return { ok: true }
})

ipcMain.handle('vault:init', async (_event, payload) => {
  const masterPassword = payload?.masterPassword
  if (typeof masterPassword !== 'string' || masterPassword.length < 8) return { ok: false, error: 'Invalid master password' }
  if (await vaultFileExists()) return { ok: false, error: 'Vault already exists' }

  const newVaultKey = crypto.randomBytes(32)
  const base = {
    version: VAULT_VERSION,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    entries: []
  }

  const masterWrapper = await wrapVaultKeyWithPassword(newVaultKey, masterPassword, buildKdf())

  const recoveryWords = generateRecoveryWords(undefined, 16)
  const recoveryPassword = derivePasswordFromRecoveryWords(recoveryWords.join(' '))
  const recoveryWrapper = await wrapVaultKeyWithPassword(newVaultKey, recoveryPassword, buildKdf())

  const file = {
    version: VAULT_VERSION,
    createdAt: Date.now(),
    wrappers: {
      master: masterWrapper,
      recovery: recoveryWrapper
    },
    data: encryptVaultData(newVaultKey, base)
  }

  await writeVaultFile(file)
  lockVault()

  return { ok: true, recoveryWords, recoveryPassword }
})

ipcMain.handle('vault:unlock', async (_event, payload) => {
  const masterPassword = payload?.masterPassword
  if (typeof masterPassword !== 'string' || masterPassword.length === 0) return { ok: false, error: 'Invalid password' }
  if (!(await vaultFileExists())) return { ok: false, error: 'Vault not initialized' }
  try {
    await loadVaultUsingWrapper('master', masterPassword)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})

ipcMain.handle('vault:unlockWithRecoveryWords', async (_event, payload) => {
  const words = payload?.words
  if (typeof words !== 'string' || words.trim().length === 0) return { ok: false, error: 'Invalid recovery words' }
  if (!(await vaultFileExists())) return { ok: false, error: 'Vault not initialized' }
  try {
    const recoveryPassword = derivePasswordFromRecoveryWords(words)
    await loadVaultUsingWrapper('recovery', recoveryPassword)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})

ipcMain.handle('vault:lock', async () => {
  lockVault()
  return { ok: true }
})

ipcMain.handle('vault:list', async () => {
  await ensureUnlocked()
  return {
    ok: true,
    entries: (vaultData.entries ?? []).map((e) => ({
      id: e.id,
      site: e.site,
      username: e.username,
      notes: e.notes ?? '',
      createdAt: e.createdAt,
      updatedAt: e.updatedAt
    }))
  }
})

ipcMain.handle('vault:add', async (_event, payload) => {
  await ensureUnlocked()
  const site = String(payload?.site ?? '').trim()
  const username = String(payload?.username ?? '').trim()
  const password = String(payload?.password ?? '')
  const notes = String(payload?.notes ?? '')
  if (!site || !username || !password) return { ok: false, error: 'Missing fields' }

  const entry = {
    id: crypto.randomUUID(),
    site,
    username,
    password,
    notes,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }

  vaultData.entries = [...(vaultData.entries ?? []), entry]
  await persistVaultData()
  return { ok: true, id: entry.id }
})

ipcMain.handle('vault:update', async (_event, payload) => {
  await ensureUnlocked()
  const id = String(payload?.id ?? '')
  if (!id) return { ok: false, error: 'Missing id' }
  const entries = vaultData.entries ?? []
  const idx = entries.findIndex((e) => e.id === id)
  if (idx === -1) return { ok: false, error: 'Not found' }

  const current = entries[idx]
  const next = {
    ...current,
    site: payload?.site != null ? String(payload.site).trim() : current.site,
    username: payload?.username != null ? String(payload.username).trim() : current.username,
    password: payload?.password != null ? String(payload.password) : current.password,
    notes: payload?.notes != null ? String(payload.notes) : current.notes,
    updatedAt: Date.now()
  }

  vaultData.entries = [...entries.slice(0, idx), next, ...entries.slice(idx + 1)]
  await persistVaultData()
  return { ok: true }
})

ipcMain.handle('vault:remove', async (_event, payload) => {
  await ensureUnlocked()
  const id = String(payload?.id ?? '')
  if (!id) return { ok: false, error: 'Missing id' }
  vaultData.entries = (vaultData.entries ?? []).filter((e) => e.id !== id)
  await persistVaultData()
  return { ok: true }
})

ipcMain.handle('vault:reveal', async (_event, payload) => {
  await ensureUnlocked()
  const id = String(payload?.id ?? '')
  const entry = (vaultData.entries ?? []).find((e) => e.id === id)
  if (!entry) return { ok: false, error: 'Not found' }
  return { ok: true, password: entry.password }
})

ipcMain.handle('vault:copyPassword', async (_event, payload) => {
  await ensureUnlocked()
  const id = String(payload?.id ?? '')
  const entry = (vaultData.entries ?? []).find((e) => e.id === id)
  if (!entry) return { ok: false, error: 'Not found' }
  clipboard.writeText(String(entry.password ?? ''))
  return { ok: true }
})

ipcMain.handle('vault:changeMasterPassword', async (_event, payload) => {
  await ensureUnlocked()
  const newPassword = payload?.newMasterPassword
  if (typeof newPassword !== 'string' || newPassword.length < 8) return { ok: false, error: 'Invalid master password' }

  const file = await readVaultFile()
  const masterWrapper = await wrapVaultKeyWithPassword(vaultKey, newPassword, buildKdf())
  const next = {
    ...file,
    wrappers: {
      ...(file.wrappers ?? {}),
      master: masterWrapper
    }
  }
  await writeVaultFile(next)
  touchVault()
  return { ok: true }
})

ipcMain.handle('vault:regenerateRecoveryWords', async () => {
  await ensureUnlocked()
  const file = await readVaultFile()
  const recoveryWords = generateRecoveryWords(undefined, 16)
  const recoveryPassword = derivePasswordFromRecoveryWords(recoveryWords.join(' '))
  const recoveryWrapper = await wrapVaultKeyWithPassword(vaultKey, recoveryPassword, buildKdf())
  const next = {
    ...file,
    wrappers: {
      ...(file.wrappers ?? {}),
      recovery: recoveryWrapper
    }
  }
  await writeVaultFile(next)
  touchVault()
  return { ok: true, recoveryWords, recoveryPassword }
})

ipcMain.handle('vault:export', async (_event, payload) => {
  const targetPath = payload?.targetPath
  if (typeof targetPath !== 'string' || !targetPath) return { ok: false, error: 'Invalid targetPath' }
  if (!(await vaultFileExists())) return { ok: false, error: 'Vault not initialized' }
  await fs.copyFile(vaultFilePath(), targetPath)
  return { ok: true }
})

ipcMain.handle('vault:import', async (_event, payload) => {
  const sourcePath = payload?.sourcePath
  if (typeof sourcePath !== 'string' || !sourcePath) return { ok: false, error: 'Invalid sourcePath' }
  await fs.copyFile(sourcePath, vaultFilePath())
  lockVault()
  return { ok: true }
})

ipcMain.handle('security:scanMalware', async () => {
  try {
    const processes = await si.processes()
    const suspicious = []

    const safeRegex = /c:\\windows\\|\/usr\/bin\/|\/bin\/|\/sbin\/|\/system\/library\/|\/usr\/sbin\//i

    for (const p of processes.list) {
      if (!p.path) continue

      const isSafeLoc = safeRegex.test(p.path)

      let score = 0
      let reason = []

      if (!isSafeLoc) {
        score++
        reason.push('Running outside standard system folders')
      }

      if (p.memRss > 4000000 && !isSafeLoc) {
        score++
        reason.push('High memory footprint from unknown location')
      }

      if (p.state === 'running' && p.name !== 'svchost.exe' && !isSafeLoc) {
         score++
      }

      if (score >= 2) {
        suspicious.push({ pid: p.pid, name: p.name, path: p.path, reason: reason.join(', ') })
      }
    }

    return { ok: true, suspicious }
  } catch (err) {
    throw new Error(`Scan failed: ${err.message}`)
  }
})

async function getSecurityScoreV2() {
  if (process.platform !== 'win32') return { ok: false, error: 'Only supported on Windows' }
  const checks = []
  let score = 0

  const add = (id, title, ok, weight, details) => {
    const passed = Boolean(ok)
    checks.push({ id, title, ok: passed, weight, details: details ?? null })
    if (passed) score += weight
  }

  try {
    await Promise.all([
      (async () => {
        const ps = `
          $ErrorActionPreference = 'Stop'
          $profiles = @(Get-NetFirewallProfile | Select-Object Name, Enabled)
          $enabled = @($profiles | Where-Object { $_.Enabled -eq $true }).Count
          $total = @($profiles).Count
          [PSCustomObject]@{
            total=$total
            enabled=$enabled
            allEnabled=($total -gt 0 -and $enabled -eq $total)
            profiles=$profiles
          } | ConvertTo-Json -Compress -Depth 4
        `
        const { code, data, stderr } = await runPowerShellJson(ps, { timeoutMs: 6000 })
        add('firewall', 'Firewall (todos os perfis)', code === 0 && Boolean(data?.allEnabled), 25, code === 0 ? data : stderr)
      })().catch((err) => add('firewall', 'Firewall (todos os perfis)', false, 25, err?.message ?? String(err))),
      (async () => {
        const ps = `
          $ErrorActionPreference = 'SilentlyContinue'
          $s = $null
          try { $s = Get-MpComputerStatus } catch {}
          $providers = @()
          try {
            $providers = @(Get-CimInstance -Namespace root\\SecurityCenter2 -ClassName AntiVirusProduct |
              Select-Object displayName, productState, pathToSignedProductExe)
          } catch {}
          $providerNames = @($providers | ForEach-Object { $_.displayName } | Where-Object { $_ })
          $defenderAv = $false
          $defenderRealtime = $false
          if ($null -ne $s) {
            $defenderAv = [bool]$s.AntivirusEnabled
            $defenderRealtime = [bool]$s.RealTimeProtectionEnabled
          }
          $hasProvider = @($providerNames).Count -gt 0
          [PSCustomObject]@{
            defenderAvailable = ($null -ne $s)
            defenderAntivirus = $defenderAv
            defenderRealtime = $defenderRealtime
            providers = $providerNames
            providerCount = @($providerNames).Count
            hasAntivirus = ($defenderAv -or $hasProvider)
            hasRealtimeProtection = ($defenderRealtime -or $hasProvider)
          } | ConvertTo-Json -Compress -Depth 4
        `
        const { code, data, stderr } = await runPowerShellJson(ps, { timeoutMs: 8000 })
        add('antivirusProvider', 'Antivirus reconhecido pelo Windows', code === 0 && Boolean(data?.hasAntivirus), 30, code === 0 ? data : stderr)
        add('realtimeProtection', 'Protecao em tempo real', code === 0 && Boolean(data?.hasRealtimeProtection), 25, code === 0 ? data : stderr)
      })().catch((err) => {
        add('antivirusProvider', 'Antivirus reconhecido pelo Windows', false, 30, err?.message ?? String(err))
        add('realtimeProtection', 'Protecao em tempo real', false, 25, err?.message ?? String(err))
      }),
      (async () => {
        const ps = `
          $ErrorActionPreference = 'Stop'
          $v = (Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System' -Name 'EnableLUA' -ErrorAction Stop).EnableLUA
          [PSCustomObject]@{ EnableLUA = $v; enabled = ($v -eq 1) } | ConvertTo-Json -Compress
        `
        const { code, data, stderr } = await runPowerShellJson(ps, { timeoutMs: 5000 })
        add('uac', 'UAC (EnableLUA)', code === 0 && Boolean(data?.enabled), 15, code === 0 ? data : stderr)
      })().catch((err) => add('uac', 'UAC (EnableLUA)', false, 15, err?.message ?? String(err))),
      (async () => {
        const hostsPath = path.join(process.env.windir || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts')
        const content = await fs.readFile(hostsPath, 'utf8')
        const hasSection = content.includes('DarkHub Tracking Blocker - BEGIN') && content.includes('DarkHub Tracking Blocker - END')
        add('trackingBlocker', 'Tracking Blocker (hosts)', hasSection, 5, { hostsPath, hasSection })
      })().catch((err) => add('trackingBlocker', 'Tracking Blocker (hosts)', false, 5, err?.message ?? String(err)))
    ])

    score = Math.max(0, Math.min(100, score))
    return { ok: true, score, ts: Date.now(), checks }
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err), ts: Date.now(), checks }
  }
}

ipcMain.handle('security:getSecurityScore', async () => {
  return getSecurityScoreV2()
  if (process.platform !== 'win32') return { ok: false, error: 'Only supported on Windows' }
  const checks = []
  let score = 0

  const add = (id, title, ok, weight, details) => {
    const passed = Boolean(ok)
    checks.push({ id, title, ok: passed, weight, details: details ?? null })
    if (passed) score += weight
  }

  try {
    try {
      const ps = `
        $ErrorActionPreference = 'Stop'
        $profiles = Get-NetFirewallProfile | Select-Object Name, Enabled
        $enabled = @($profiles | Where-Object { $_.Enabled -eq $true }).Count
        $total = @($profiles).Count
        [PSCustomObject]@{ total=$total; enabled=$enabled; allEnabled=($enabled -eq $total) } | ConvertTo-Json -Compress
      `
      const { code, data, stderr } = await runPowerShellJson(ps, { timeoutMs: 15000 })
      if (code === 0) {
        add('firewall', 'Firewall (todos os perfis)', Boolean(data?.allEnabled), 30, data)
      } else {
        add('firewall', 'Firewall (todos os perfis)', false, 30, stderr || `powershell exited ${code}`)
      }
    } catch (err) {
      add('firewall', 'Firewall (todos os perfis)', false, 30, err?.message ?? String(err))
    }

    try {
      const ps = `
        $ErrorActionPreference = 'Stop'
        $s = Get-MpComputerStatus
        $obj = [PSCustomObject]@{
          AMServiceEnabled = $s.AMServiceEnabled
          AntivirusEnabled = $s.AntivirusEnabled
          RealTimeProtectionEnabled = $s.RealTimeProtectionEnabled
          NISEnabled = $s.NISEnabled
          AntispywareEnabled = $s.AntispywareEnabled
        }
        $obj | ConvertTo-Json -Compress
      `
      const { code, data, stderr } = await runPowerShellJson(ps, { timeoutMs: 15000 })
      if (code === 0) {
        add('defenderRealtime', 'Microsoft Defender (tempo real)', Boolean(data?.RealTimeProtectionEnabled), 30, data)
        add('defenderAV', 'Microsoft Defender (antivírus)', Boolean(data?.AntivirusEnabled), 15, data)
        add('defenderAM', 'Microsoft Defender (serviço)', Boolean(data?.AMServiceEnabled), 5, data)
      } else {
        add('defenderRealtime', 'Microsoft Defender (tempo real)', false, 30, stderr || `powershell exited ${code}`)
        add('defenderAV', 'Microsoft Defender (antivírus)', false, 15, stderr || `powershell exited ${code}`)
        add('defenderAM', 'Microsoft Defender (serviço)', false, 5, stderr || `powershell exited ${code}`)
      }
    } catch (err) {
      add('defenderRealtime', 'Microsoft Defender (tempo real)', false, 30, err?.message ?? String(err))
      add('defenderAV', 'Microsoft Defender (antivírus)', false, 15, err?.message ?? String(err))
      add('defenderAM', 'Microsoft Defender (serviço)', false, 5, err?.message ?? String(err))
    }

    try {
      const ps = `
        $ErrorActionPreference = 'Stop'
        $v = (Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System' -Name 'EnableLUA' -ErrorAction Stop).EnableLUA
        [PSCustomObject]@{ EnableLUA = $v; enabled = ($v -eq 1) } | ConvertTo-Json -Compress
      `
      const { code, data, stderr } = await runPowerShellJson(ps, { timeoutMs: 15000 })
      if (code === 0) {
        add('uac', 'UAC (EnableLUA)', Boolean(data?.enabled), 10, data)
      } else {
        add('uac', 'UAC (EnableLUA)', false, 10, stderr || `powershell exited ${code}`)
      }
    } catch (err) {
      add('uac', 'UAC (EnableLUA)', false, 10, err?.message ?? String(err))
    }

    try {
      const hostsPath = path.join(process.env.windir || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts')
      const content = await fs.readFile(hostsPath, 'utf8')
      const hasSection = content.includes('DarkHub Tracking Blocker - BEGIN') && content.includes('DarkHub Tracking Blocker - END')
      add('trackingBlocker', 'Tracking Blocker (hosts)', hasSection, 10, { hostsPath, hasSection })
    } catch (err) {
      add('trackingBlocker', 'Tracking Blocker (hosts)', false, 10, err?.message ?? String(err))
    }

    if (score > 100) score = 100
    if (score < 0) score = 0
    return { ok: true, score, ts: Date.now(), checks }
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err), ts: Date.now(), checks }
  }
})

ipcMain.handle('security:auditTracking', async () => {
  try {
    if (process.platform === 'win32') {
      const domainsFile = path.join(app.getPath('userData'), 'tracking.domains.json')
      let customDomains = []
      try {
        const raw = await fs.readFile(domainsFile, 'utf8')
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed?.custom)) customDomains = parsed.custom.map((d) => String(d).trim()).filter(Boolean)
      } catch {}

      const hostsPath = path.join(process.env.windir || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts')
      const content = await fs.readFile(hostsPath, 'utf8')
      const lines = content.split(/\r?\n/g).map((l) => l.trim())

      const trackingDomains = [
        'doubleclick.net',
        'google-analytics.com',
        'analytics.google.com',
        'googletagmanager.com',
        'facebook.com',
        'connect.facebook.net',
        'ads.twitter.com',
        'scorecardresearch.com',
        'quantserve.com',
        'adnxs.com',
        'mathtag.com',
        'bluekai.com',
        'krxd.net',
        'demdex.net',
        'omtrdc.net',
        'everesttech.net',
        'pixel.rubiconproject.com',
        'pubmatic.com',
        'openx.net',
        'adroll.com',
        'taboola.com',
        'outbrain.com'
      ]
      const allDomains = Array.from(new Set([...trackingDomains, ...customDomains]))

      const present = new Set()
      for (const line of lines) {
        if (!line || line.startsWith('#')) continue
        for (const domain of allDomains) {
          if (line.includes(domain)) present.add(domain)
        }
      }

      const hasDarkHubSection = lines.some((l) => l.includes('DarkHub Tracking Blocker - BEGIN'))

      const trackers = Array.from(present).map((d) => ({
        source: 'Hosts File',
        details: d,
        category: 'Analytics/Ads'
      }))

      return {
        ok: true,
        trackers,
        summary: {
          totalKnown: allDomains.length,
          present: present.size,
          missing: allDomains.length - present.size,
          hasDarkHubSection
        }
      }
    }
    return { ok: true, trackers: [], summary: { totalKnown: 0, present: 0, missing: 0, hasDarkHubSection: false } }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('security:getTrackingDomains', async () => {
  const domainsFile = path.join(app.getPath('userData'), 'tracking.domains.json')
  let custom = []
  try {
    const raw = await fs.readFile(domainsFile, 'utf8')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed?.custom)) custom = parsed.custom.map((d) => String(d).trim()).filter(Boolean)
  } catch {}

  const defaults = [
    'doubleclick.net',
    'google-analytics.com',
    'analytics.google.com',
    'googletagmanager.com',
    'facebook.com',
    'connect.facebook.net',
    'ads.twitter.com',
    'scorecardresearch.com',
    'quantserve.com',
    'adnxs.com',
    'mathtag.com',
    'bluekai.com',
    'krxd.net',
    'demdex.net',
    'omtrdc.net',
    'everesttech.net',
    'pixel.rubiconproject.com',
    'pubmatic.com',
    'openx.net',
    'adroll.com',
    'taboola.com',
    'outbrain.com'
  ]

  return { ok: true, defaults, custom }
})

ipcMain.handle('security:setCustomTrackingDomains', async (_event, payload) => {
  const domains = payload?.domains
  if (!Array.isArray(domains)) return { ok: false, error: 'Invalid domains' }
  const cleaned = domains
    .map((d) => String(d).trim().toLowerCase())
    .filter((d) => d && !d.includes(' ') && !d.startsWith('#'))
    .slice(0, 500)
  const unique = Array.from(new Set(cleaned))
  const domainsFile = path.join(app.getPath('userData'), 'tracking.domains.json')
  await fs.writeFile(domainsFile, JSON.stringify({ custom: unique }, null, 2), 'utf8')
  return { ok: true, count: unique.length }
})

ipcMain.handle('security:blockTracking', async () => {
  if (process.platform !== 'win32') return { ok: false, error: 'Only supported on Windows' }
  try {
    const defaults = [
      'doubleclick.net',
      'google-analytics.com',
      'analytics.google.com',
      'googletagmanager.com',
      'facebook.com',
      'connect.facebook.net',
      'ads.twitter.com',
      'scorecardresearch.com',
      'quantserve.com',
      'adnxs.com',
      'mathtag.com',
      'bluekai.com',
      'krxd.net',
      'demdex.net',
      'omtrdc.net',
      'everesttech.net',
      'pixel.rubiconproject.com',
      'pubmatic.com',
      'openx.net',
      'adroll.com',
      'taboola.com',
      'outbrain.com'
    ]

    const domainsFile = path.join(app.getPath('userData'), 'tracking.domains.json')
    let customDomains = []
    try {
      const raw = await fs.readFile(domainsFile, 'utf8')
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed?.custom)) customDomains = parsed.custom.map((d) => String(d).trim()).filter(Boolean)
    } catch {}

    const trackingDomains = Array.from(new Set([...defaults, ...customDomains]))

    const hostsPath = path.join(process.env.windir || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts')
    let content = await fs.readFile(hostsPath, 'utf8')
    const backupPath = path.join(app.getPath('userData'), 'hosts.backup')
    try {
      await fs.access(backupPath)
    } catch {
      await fs.writeFile(backupPath, content, 'utf8')
    }

    const beginMarker = '# DarkHub Tracking Blocker - BEGIN'
    const endMarker = '# DarkHub Tracking Blocker - END'

    const lines = content.split(/\r?\n/g)
    const filtered = []
    let inside = false
    for (const line of lines) {
      if (line.includes(beginMarker)) {
        inside = true
        continue
      }
      if (line.includes(endMarker)) {
        inside = false
        continue
      }
      if (!inside) filtered.push(line)
    }

    const section = [beginMarker, ...trackingDomains.map((d) => `127.0.0.1 ${d}`), endMarker].join(os.EOL)
    const nextContent = [...filtered, '', section, ''].join(os.EOL)

    await fs.writeFile(hostsPath, nextContent, 'utf8')
    return { ok: true, msg: `Blocked ${trackingDomains.length} trackers via hosts file`, backupPath }
  } catch (err) {
    return { ok: false, error: `Administrative privileges required to modify hosts file: ${err?.message ?? String(err)}` }
  }
})

ipcMain.handle('security:unblockTracking', async () => {
  if (process.platform !== 'win32') return { ok: false, error: 'Only supported on Windows' }
  try {
    const hostsPath = path.join(process.env.windir || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts')
    const backupPath = path.join(app.getPath('userData'), 'hosts.backup')
    const backup = await fs.readFile(backupPath, 'utf8')
    await fs.writeFile(hostsPath, backup, 'utf8')
    return { ok: true, msg: 'Hosts restored from backup', backupPath }
  } catch (err) {
    return { ok: false, error: `Administrative privileges required to restore hosts file: ${err?.message ?? String(err)}` }
  }
})

ipcMain.handle('security:optimizeLatency', async () => {
  if (process.platform !== 'win32') return { ok: false, error: 'Only supported on Windows' }
  try {

    await runPowerShell("Get-Process -Name 'audiodg' -ErrorAction SilentlyContinue | ForEach-Object { $_.PriorityClass = 'RealTime' }", { timeoutMs: 10000 })
    return { ok: true, msg: 'Latency optimized (Audio/USB priority adjusted)' }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('security:killProcess', async (_event, pid) => {
  try {
    process.kill(pid)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('fs:readFile', async (_event, filePath) => {
  try {
    if (!hasFileAccessGrant(filePath)) {
      return { ok: false, error: 'File access was not granted through the file dialog' }
    }
    const content = await fs.readFile(filePath, 'utf-8')
    return { ok: true, content }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('fs:writeFile', async (_event, payload) => {
  const { filePath, content } = payload
  try {
    if (!hasFileAccessGrant(filePath)) {
      return { ok: false, error: 'File access was not granted through the file dialog' }
    }
    await fs.writeFile(filePath, content, 'utf-8')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

let autoClickerProc = null
let autoClickerState = null
let autoClickerHotkey = 'F6'
let autoClickerTabActive = false

function autoclickerConfigPath() {
  return path.join(app.getPath('userData'), 'autoclicker.json')
}

async function loadAutoClickerConfig() {
  try {
    const raw = await fs.readFile(autoclickerConfigPath(), 'utf8')
    const parsed = JSON.parse(raw)
    if (typeof parsed?.hotkey === 'string') autoClickerHotkey = parsed.hotkey.trim() || null
    if (parsed?.defaults && typeof parsed.defaults === 'object') {
      const intervalMsRaw = Number(parsed.defaults.intervalMs)
      const intervalMs = Number.isFinite(intervalMsRaw) ? Math.max(1, Math.min(10000, Math.trunc(intervalMsRaw))) : null
      const button = parsed.defaults.button === 'right' ? 'right' : parsed.defaults.button === 'left' ? 'left' : null
      if (intervalMs != null || button != null) {
        autoClickerState = {
          ...(autoClickerState ?? {}),
          ...(intervalMs != null ? { intervalMs } : {}),
          ...(button != null ? { button } : {})
        }
      }
    }
  } catch {}
}

async function saveAutoClickerConfig() {
  const payload = {
    hotkey: autoClickerHotkey ?? '',
    defaults: {
      intervalMs: autoClickerState?.intervalMs ?? 100,
      button: autoClickerState?.button ?? 'left'
    }
  }
  await fs.writeFile(autoclickerConfigPath(), JSON.stringify(payload, null, 2), 'utf8')
}

function unregisterAutoClickerHotkey() {
  try {
    if (autoClickerHotkey) globalShortcut.unregister(autoClickerHotkey)
  } catch {}
}

function registerAutoClickerHotkey() {
  if (!autoClickerHotkey) return { ok: true, enabled: false }
  try {
    unregisterAutoClickerHotkey()
    const ok = globalShortcut.register(autoClickerHotkey, async () => {
      try {
        if (autoClickerProc) await stopAutoClicker()
        else await startAutoClicker(autoClickerState ?? { intervalMs: 50, button: 'left' })
      } catch {}
    })
    if (!ok) return { ok: false, error: 'Falha ao registrar atalho global (atalho inválido ou em uso).' }
    return { ok: true, enabled: true, hotkey: autoClickerHotkey }
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
}

function getClickEnginePath() {
  const candidate1 = path.join(__dirname, 'services', 'DarkHub.ClickEngine.exe')
  if (fsRaw.existsSync(candidate1)) return candidate1
  const candidate2 = path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'services', 'DarkHub.ClickEngine.exe')
  if (fsRaw.existsSync(candidate2)) return candidate2
  const candidate3 = path.join(app.getAppPath(), 'electron', 'services', 'DarkHub.ClickEngine.exe')
  if (fsRaw.existsSync(candidate3)) return candidate3
  return null
}

async function startAutoClicker(payload) {
  const button = payload?.button === 'right' || payload?.button === 'middle' || payload?.button === 'double' ? payload.button : 'left'
  const intervalMsRaw = Number(payload?.intervalMs)
  const intervalMs = Number.isFinite(intervalMsRaw) ? Math.max(1, Math.min(10000, Math.trunc(intervalMsRaw))) : 100

  if (autoClickerProc) {
    try {
      if (autoClickerProc.stdin?.writable) {
        autoClickerProc.stdin.write('STOP\nEXIT\n')
      }
      autoClickerProc.kill()
    } catch {}
    autoClickerProc = null
  }

  const nativeExe = getClickEnginePath()
  if (nativeExe && fsRaw.existsSync(nativeExe)) {
    const p = spawn(nativeExe, [], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    autoClickerProc = p
    autoClickerState = { button, intervalMs, startedAt: Date.now(), isNative: true }

    p.stdin?.write(`START ${button} ${intervalMs}\n`)

    p.on('exit', () => {
      autoClickerProc = null
      autoClickerState = null
    })

    await saveAutoClickerConfig().catch(() => {})
    return { ok: true, msg: 'AutoClicker iniciado com Engine Nativa C# (Baixo Nível)', state: autoClickerState }
  }

  const ps = [
    `$ErrorActionPreference='Stop'`,
    `Add-Type @"`,
    `using System;`,
    `using System.Runtime.InteropServices;`,
    `public static class Clicker {`,
    `  [StructLayout(LayoutKind.Sequential)]`,
    `  public struct INPUT { public UInt32 type; public MOUSEINPUT mi; }`,
    `  [StructLayout(LayoutKind.Sequential)]`,
    `  public struct MOUSEINPUT {`,
    `    public Int32 dx; public Int32 dy; public UInt32 mouseData; public UInt32 dwFlags; public UInt32 time; public IntPtr dwExtraInfo;`,
    `  }`,
    `  [DllImport("user32.dll", SetLastError=true)] public static extern UInt32 SendInput(UInt32 nInputs, INPUT[] pInputs, Int32 cbSize);`,
    `  public const UInt32 INPUT_MOUSE = 0;`,
    `  public const UInt32 MOUSEEVENTF_LEFTDOWN = 0x0002;`,
    `  public const UInt32 MOUSEEVENTF_LEFTUP = 0x0004;`,
    `  public const UInt32 MOUSEEVENTF_RIGHTDOWN = 0x0008;`,
    `  public const UInt32 MOUSEEVENTF_RIGHTUP = 0x0010;`,
    `  public static void Click(bool right){`,
    `    var down = new INPUT { type = INPUT_MOUSE, mi = new MOUSEINPUT { dwFlags = right ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_LEFTDOWN } };`,
    `    var up   = new INPUT { type = INPUT_MOUSE, mi = new MOUSEINPUT { dwFlags = right ? MOUSEEVENTF_RIGHTUP   : MOUSEEVENTF_LEFTUP   } };`,
    `    var arr = new INPUT[] { down, up };`,
    `    SendInput((UInt32)arr.Length, arr, Marshal.SizeOf(typeof(INPUT)));`,
    `  }`,
    `}`,
    `"@`,
    `$right = ${button === 'right' ? '$true' : '$false'}`,
    `$interval = ${intervalMs}`,
    `Start-Sleep -Milliseconds 250`,
    `while($true){ [Clicker]::Click($right); Start-Sleep -Milliseconds $interval }`
  ].join('\n')

  const p = spawn('powershell.exe', powerShellArgsForEncodedScript(encodePowerShellScript(ps)), {
    windowsHide: true
  })

  autoClickerProc = p
  autoClickerState = { button, intervalMs, startedAt: Date.now(), isNative: false }

  p.on('exit', () => {
    autoClickerProc = null
    autoClickerState = null
  })

  await saveAutoClickerConfig().catch(() => {})
  return { ok: true, msg: 'AutoClicker started', state: autoClickerState }
}

async function stopAutoClicker() {
  if (autoClickerProc) {
    try {
      if (autoClickerProc.stdin?.writable) {
        autoClickerProc.stdin.write('STOP\nEXIT\n')
      }
      autoClickerProc.kill()
    } catch {}
    autoClickerProc = null
    autoClickerState = null
  }
  return { ok: true, msg: 'AutoClicker stopped' }
}

ipcMain.handle('autoclicker:status', async () => {
  return { ok: true, running: Boolean(autoClickerProc), state: autoClickerState, hotkey: autoClickerHotkey }
})

ipcMain.handle('autoclicker:start', async (_event, payload) => {
  if (process.platform !== 'win32') return { ok: false, error: 'Only supported on Windows' }
  try {
    return await startAutoClicker(payload)
  } catch (err) {
    autoClickerProc = null
    autoClickerState = null
    return { ok: false, error: err?.message ?? String(err) }
  }
})

ipcMain.handle('autoclicker:stop', async () => {
  try {
    return await stopAutoClicker()
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})

ipcMain.handle('autoclicker:toggle', async (_event, payload) => {
  if (process.platform !== 'win32') return { ok: false, error: 'Only supported on Windows' }
  try {
    if (autoClickerProc) return await stopAutoClicker()
    const next = payload && typeof payload === 'object' ? payload : autoClickerState
    return await startAutoClicker(next ?? { intervalMs: 100, button: 'left' })
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})

ipcMain.handle('autoclicker:getHotkey', async () => {
  return { ok: true, hotkey: autoClickerHotkey }
})

ipcMain.handle('autoclicker:setHotkey', async (_event, payload) => {
  const hotkey = typeof payload?.hotkey === 'string' ? payload.hotkey.trim() : ''
  try {
    if (hotkey.length === 0) {
      unregisterAutoClickerHotkey()
      autoClickerHotkey = null
      await saveAutoClickerConfig().catch(() => {})
      return { ok: true, enabled: false }
    }
    autoClickerHotkey = hotkey
    const reg = registerAutoClickerHotkey()
    if (!reg.ok) return reg
    await saveAutoClickerConfig().catch(() => {})
    return { ok: true, enabled: true, hotkey: autoClickerHotkey }
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})

ipcMain.handle('autoclicker:setTabActive', (_event, active) => {
  autoClickerTabActive = Boolean(active)
  return { ok: true }
})

ipcMain.handle('metadata:read', async (_event, imagePath) => {
  try {
    assertFileAccessGranted(imagePath, 'imagem')
    try {
      const exifr = await import('exifr').then(m => m.default ?? m)
      const output = await exifr.parse(imagePath, true)
      if (output) return { ok: true, metadata: output }
    } catch {}

    const exiftool = await getExiftool()
    const output = await exiftool.read(imagePath)
    return { ok: true, metadata: output || {} }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('metadata:remove', async (_event, payload) => {
  const { inputPath, outputPath } = payload
  try {
    assertFileAccessGranted(inputPath, 'arquivo de entrada')
    assertFileAccessGranted(outputPath, 'arquivo de saída')
    await fs.copyFile(inputPath, outputPath)
    try {
      const exiftool = await getExiftool()
      await exiftool.write(outputPath, {}, ['-all=', '-overwrite_original'])
      return { ok: true, path: outputPath }
    } catch {
      const sharp = await getSharp()
      await sharp(inputPath).withMetadata(false).toFile(outputPath)
      return { ok: true, path: outputPath }
    }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('metadata:update', async (_event, payload) => {
  const inputPath = payload?.inputPath
  const outputPath = payload?.outputPath
  const tags = payload?.tags
  if (typeof inputPath !== 'string' || !inputPath) return { ok: false, error: 'Invalid inputPath' }
  if (typeof outputPath !== 'string' || !outputPath) return { ok: false, error: 'Invalid outputPath' }
  if (!tags || typeof tags !== 'object') return { ok: false, error: 'Invalid tags' }

  try {
    assertFileAccessGranted(inputPath, 'imagem de entrada')
    assertFileAccessGranted(outputPath, 'arquivo de saída')
    const exiftool = await getExiftool()
    await fs.copyFile(inputPath, outputPath)
    await exiftool.write(outputPath, tags, ['-overwrite_original'])
    return { ok: true, path: outputPath }
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})

process.on('uncaughtException', async (err) => {
  try {
    await reportBugTelemetry({
      source: 'main-uncaughtException',
      message: err?.message ?? String(err),
      stack: err?.stack ?? ''
    })
  } catch {}
})

process.on('unhandledRejection', async (reason) => {
  try {
    await reportBugTelemetry({
      source: 'main-unhandledRejection',
      message: reason?.message ?? String(reason),
      stack: reason?.stack ?? ''
    })
  } catch {}
})

const WINGET_ID_RE = /^[A-Za-z0-9][A-Za-z0-9.-]{0,127}$/;

function isValidWingetId(id) {
  return typeof id === 'string' && WINGET_ID_RE.test(id.trim());
}

ipcMain.handle('setup:installWinget', async (event, appIds) => {
  if (!Array.isArray(appIds) || appIds.length === 0) return { ok: false, error: 'Lista vazia' };

  const validIds = appIds.map((id) => String(id ?? '').trim()).filter(isValidWingetId);
  const rejectedCount = appIds.length - validIds.length;
  if (validIds.length === 0) return { ok: false, error: 'Nenhum ID de aplicativo válido informado' };
  if (rejectedCount > 0) {
    event.sender.send('setup:installProgress', `[AppStore] ${rejectedCount} ID(s) inválido(s) foram ignorados.`);
  }

  event.sender.send('setup:installProgress', `[AppStore] Iniciando fila de ${validIds.length} aplicativos...`);

  for (const id of validIds) {
    event.sender.send('setup:installProgress', `[AppStore] Preparando: ${id}...`);

    const tryInstall = (provider, command, args) => {
      return new Promise((resolve) => {
        event.sender.send('setup:installProgress', `[${provider}] Baixando/Instalando ${id}...`);
        const p = spawn(command, args, { windowsHide: true });
        p.stdout.on('data', d => {
          const txt = d.toString().trim();
          if (txt) event.sender.send('setup:installProgress', `[${provider}] ${txt}`);
        });
        p.on('close', (code) => resolve(code === 0));
        p.on('error', () => resolve(false));
      });
    };

    let success = await tryInstall('Winget', 'winget', ['install', '-e', '--id', id, '--accept-package-agreements', '--accept-source-agreements', '--silent']);

    if (!success) {
      event.sender.send('setup:installProgress', `[Winget] Falhou para ${id}. Tentando via Chocolatey...`);

      const chocoId = id.split('.').pop().toLowerCase();
      if (isValidWingetId(chocoId)) {
        success = await tryInstall('Choco', 'choco', ['install', chocoId, '-y']);
      }
    }

    if (success) {
      event.sender.send('setup:installProgress', `[AppStore] ${id} instalado com sucesso!`);
    } else {
      event.sender.send('setup:installProgress', `[AppStore] FALHA TOTAL: Não foi possível instalar ${id} por nenhum provedor.`);
    }
  }

  event.sender.send('setup:installProgress', `[AppStore] Fila concluída!`);
  return { ok: true };
})

ipcMain.handle('setup:detectHardware', async () => {
  try {
    const [cpu, graphics, baseboard, mem, diskLayout, network, audio, bluetooth] = await Promise.all([
      si.cpu(),
      si.graphics(),
      si.baseboard(),
      si.memLayout(),
      si.diskLayout(),
      si.networkInterfaces(),
      si.audio(),
      si.bluetoothDevices()
    ]);

    const hw = {
      cpu: { name: cpu.brand || cpu.manufacturer, manufacturer: cpu.vendor, cores: cpu.cores, speed: cpu.speed },
      gpus: graphics.controllers.map(g => ({ name: g.model, vendor: g.vendor, vram: g.vram })),
      baseboard: { product: baseboard.model || 'Desconhecido', manufacturer: baseboard.manufacturer || 'Desconhecido' },
      ram: mem.map(m => ({ manufacturer: m.manufacturer, size: m.size, type: m.type, clock: m.clockSpeed })),
      disks: diskLayout.map(d => ({ name: d.name, type: d.type, size: d.size, interface: d.interfaceType })),
      network: network.filter(n => !n.virtual).map(n => ({ model: n.speed ? 'Gigabit' : 'Padrão', mac: n.mac, type: n.type })),
      audio: audio.map(a => ({ name: a.name || a.manufacturer, manufacturer: a.manufacturer })),
      bluetooth: bluetooth.map(b => ({ name: b.name, manufacturer: b.manufacturer }))
    };
    return { ok: true, hardware: hw }
  } catch (err) {
    return { ok: false, error: err.message };
  }
})

app.whenReady().then(async () => {
  log.info('[startup] app ready')
  const runDeferredStartup = async () => {
    let liveServices = { latencyGuardian: true, overlay: true, autoClicker: true }

    try {
      log.info('[startup-bg] loading app config')
      await loadRuntimeConfig()

      const { loadConfig: loadPersistedConfig } = await import('./configManager.js')
      const config = await loadPersistedConfig()
      if (config.liveServices) {
        liveServices = config.liveServices
      }
    } catch (err) {
      log.warn('[startup-bg] app config failed:', err?.message ?? String(err))
    }

    if (liveServices.autoClicker !== false) {
      try {
        log.info('[startup-bg] loading autoclicker config')
        await loadAutoClickerConfig()
        log.info('[startup-bg] registering autoclicker hotkey')
        registerAutoClickerHotkey()
      } catch (err) {
        log.warn('[startup-bg] autoclicker init failed:', err?.message ?? String(err))
      }
    }

    if (liveServices.overlay !== false) {
      try {
        log.info('[startup-bg] registering overlay hotkey')
        globalShortcut.register('F8', () => {
          import('./overlay.js').then(({ toggleGamingOverlay }) => {
            toggleGamingOverlay()
          })
        })
      } catch (err) {
        log.warn('[startup-bg] overlay hotkey failed:', err?.message ?? String(err))
      }
    }

    try {
      log.info('[startup-bg] initializing machine marker')
      const { ensureMachineMarker } = await import('./machineMarker.js')
      await ensureMachineMarker()
      log.info('[startup-bg] machine marker ready')
    } catch (err) {
      log.warn('[startup-bg] machine marker failed:', err?.message ?? String(err))
    }

    if (liveServices.latencyGuardian !== false) {
      try {
        log.info('[startup-bg] registering latency guardian')
        const { registerLatencyGuardian } = await import('./latencyGuardian.js')
        latencyGuardianHandle = registerLatencyGuardian({
          app,
          ipcMain,
          si,
          runCommand,
          runPowerShell,
          stripBom,
          getActiveAdapterName,
          getLibraryStore,
          BrowserWindow
        })
        log.info('[startup-bg] latency guardian ready')
      } catch (err) {
        log.warn('[startup-bg] latency guardian failed:', err?.message ?? String(err))
      }

      try {
        globalShortcut.register('CommandOrControl+Shift+F', () => {
          toggleFramePacerOverlay()
        })
      } catch (e) {
        log.warn('[startup-bg] failed to register FramePacer hotkey', e)
      }

      FramePacerEngine.on('metrics', (metrics) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('framepacer:metrics', metrics)
        }
      })
    }

    try {
      const steamStatus = steamLuaService.getSteamStatus()
      if (steamStatus.isValid && steamStatus.steamPath && steamStoreInjector.isCdpJunctionInstalled(steamStatus.steamPath)) {
        steamStoreInjector.startDaemon(steamStatus.steamPath)
      }
    } catch {}
  }

  protocol.registerFileProtocol('local-resource', (request, callback) => {
    let url = request.url.replace(/^local-resource:\/\//, '')

    if (url.match(/^[a-zA-Z]:/)) {
      url = url.charAt(0) + ':' + url.slice(1)
    } else if (url.match(/^\/[a-zA-Z]:/)) {
      url = url.slice(1)
    }
    try {
      return callback(decodeURIComponent(url))
    } catch (error) {
      console.error(error)
      return callback(404)
    }
  })

    Logger.init(app);

    SecurityService.init();

  ipcMain.handle('window:minimize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    win?.minimize()
  })
  ipcMain.handle('window:maximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })
  ipcMain.handle('window:isMaximized', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    return win?.isMaximized() ?? false
  })
  ipcMain.handle('window:close', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win) hideWindowToBackground(win)
  })

  log.info('[startup] creating main window')
  createMainWindow()
  HardwareService.init(mainWindow);

  UpdateService.init(mainWindow);
  log.info('[startup] main window created')
  setTimeout(runDeferredStartup, 900)

  app.on('activate', () => {
    showMainWindow()
  })
}).catch(err => {
  log.error('Failed to initialize app:', err)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && appIsQuitting) app.quit()
})

let latencyGuardianStopHandled = false

app.on('before-quit', (event) => {
  appIsQuitting = true
  try {
    UpdateService.destroy()
  } catch {}
  if (!latencyGuardianStopHandled && latencyGuardianHandle?.stop) {
    latencyGuardianStopHandled = true
    event.preventDefault()
    Promise.resolve(latencyGuardianHandle.stop())
      .catch(() => {})
      .finally(() => app.quit())
    return
  }
  try {
    exiftoolInstance?.end?.()
  } catch {}
  try {
    globalShortcut.unregisterAll()
  } catch {}
})
