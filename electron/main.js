// Must stay the first import: dev profile + IPC trace (no-op when packaged).
import { devStartPage } from './devBootstrap.js'
import { app, BrowserWindow, dialog, ipcMain, shell, protocol, clipboard, globalShortcut, Menu, Tray, screen, session, Notification } from 'electron'
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
import cp, { spawn } from 'node:child_process'
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
import { registerDlss5IPC } from './services/dlss5/Dlss5Service.js'
import { registerDownloadsIPC } from './services/downloads/registerDownloadsIPC.js'
import { registerDarkOSIPC } from './ipc/darkosIpc.js'
import { registerWinToolsIPC } from './ipc/winToolsIpc.js'
import { registerDiskScanIPC } from './ipc/diskScanIpc.js'
import { registerHwSensorsIPC } from './ipc/hwSensorsIpc.js'
import { registerDriverIPC } from './ipc/driverIpc.js'
import { registerPowerShellIPC } from './ipc/powershellIpc.js'
import { registerVaultBridgeIPC } from './ipc/vaultBridgeIpc.js'
import { upgradeWrapperIfWeak, backupVaultFile } from './services/vaultBridge/vaultHardening.js'
import Logger from './services/LoggerService.js'
import { runCommand, runPowerShell, runPowerShellJson, stripBom, encodePowerShellScript, powerShellArgsForEncodedScript } from './services/PowerShellRunner.js'
import { CpuLoadTracker } from './services/CpuLoadTracker.js'
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
import DefenderControlEngine from './services/optimizer/DefenderControlEngine.js'
import { Worker } from 'node:worker_threads'
import ServicesEngine from './services/optimizer/ServicesEngine.js'
import DnsEngine from './services/optimizer/DnsEngine.js'
import StorageEngine from './services/optimizer/StorageEngine.js'
import FramePacerEngine from './services/FramePacerEngine.js'
import { registerRealtimeIPC } from './ipc/realtimeIpc.js'
import { registerCodeRunnerIPC } from './ipc/codeRunnerIpc.js'
import { registerStartupIPC } from './ipc/startupIpc.js'
import { registerBenchmarkIPC } from './ipc/benchmarkIpc.js'
import { registerMaintenanceIPC } from './ipc/maintenanceIpc.js'
import { registerSaveBackupIPC } from './ipc/saveBackupIpc.js'
import { registerOverlayIPC } from './ipc/overlayIpc.js'
import { registerUsbIPC } from './ipc/usbIpc.js'
import { registerRestoreIPC } from './ipc/restoreIpc.js'
import { registerShareIPC } from './ipc/shareIpc.js'
import { registerUpscaleIPC } from './ipc/upscaleIpc.js'
import { registerMetadataIPC } from './ipc/metadataIpc.js'
import { SYSTEM_TAR } from './services/SecureDownload.js'
import { createFramePacerOverlay, closeFramePacerOverlay, toggleFramePacerOverlay, setOverlayClickThrough, setOverlayConfig, getOverlayStatus } from './services/FramePacerOverlay.js'
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

// Declared before the second-instance handler below, which can run before the rest of this module has executed.
let mainWindow = null
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

// One worker per language set, kept warm for a while: creating one (and loading its traineddata) costs seconds.
// Language data is cached in userData/tessdata, so after the first use OCR works offline.
const ocrWorkers = new Map()
const OCR_IDLE_MS = 3 * 60 * 1000
async function getOcrWorker(lang) {
  let entry = ocrWorkers.get(lang)
  if (!entry) {
    tesseractPromise ||= import('tesseract.js')
    const mod = await tesseractPromise
    const cachePath = path.join(app.getPath('userData'), 'tessdata')
    await fs.mkdir(cachePath, { recursive: true }).catch(() => {})
    entry = { worker: mod.createWorker(lang, 1, { cachePath }), timer: null, queue: Promise.resolve() }
    ocrWorkers.set(lang, entry)
    entry.worker.catch(() => ocrWorkers.delete(lang))
  }
  clearTimeout(entry.timer)
  entry.timer = setTimeout(() => {
    ocrWorkers.delete(lang)
    entry.worker.then((w) => w.terminate()).catch(() => {})
  }, OCR_IDLE_MS)
  entry.timer.unref?.()
  return entry
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
      const { code, stdout } = await runCommand('where.exe', ['ffmpeg'], { timeoutMs: 5000 })
      const whereOut = code === 0 ? String(stdout ?? '').trim().split(/\r?\n/)[0] : ''
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

// One feature failing to register (an unresolvable known folder, a broken profile...) must not stop the app from
// starting: it is logged and that screen reports its channels as missing.
const safeRegister = (name, fn) => {
  try { return fn() } catch (err) { log.error(`[startup] ${name} registration failed: ${err?.stack || err}`); return null }
}
safeRegister('optiscaler', () => registerOptiScalerIPC({ app, ipcMain, getLibraryStore }))
safeRegister('dlss5', () => registerDlss5IPC({ app, ipcMain, shell }))
const downloadsService = safeRegister('downloads', () => registerDownloadsIPC({ app, ipcMain, dialog, shell, BrowserWindow, logger: Logger }))
const darkosService = safeRegister('darkos', () => registerDarkOSIPC({ app, ipcMain, dialog, BrowserWindow, logger: Logger }))
safeRegister('driver', () => registerDriverIPC({
  ipcMain, shell, logger: Logger, darkos: darkosService,
  elevatedRunner: async (script, opts) => (await import('./services/optimizer/ElevationHelper.js')).default.runElevatedPowerShell(script, opts)
}))
safeRegister('powershell', () => registerPowerShellIPC({ ipcMain, logger: Logger }))
safeRegister('wintools', () => registerWinToolsIPC({ ipcMain, logger: Logger }))
safeRegister('diskscan', () => registerDiskScanIPC({ ipcMain, dialog, shell, BrowserWindow, logger: Logger }))
safeRegister('hwsensors', () => registerHwSensorsIPC({ app, ipcMain, logger: Logger }))
safeRegister('realtime', () => registerRealtimeIPC({ app, ipcMain, dialog, BrowserWindow, Notification, logger: Logger }))
safeRegister('code', () => registerCodeRunnerIPC({ ipcMain, logger: Logger }))
safeRegister('startup', () => registerStartupIPC({ app, ipcMain, logger: Logger }))
safeRegister('benchmark', () => registerBenchmarkIPC({ app, ipcMain, BrowserWindow, logger: Logger }))
safeRegister('maintenance', () => registerMaintenanceIPC({ app, ipcMain, BrowserWindow, Notification, logger: Logger }))
safeRegister('saves', () => registerSaveBackupIPC({ app, ipcMain, BrowserWindow, dialog, shell, logger: Logger }))
safeRegister('overlay', () => registerOverlayIPC({ app, ipcMain, BrowserWindow, screen, globalShortcut, dialog, logger: Logger }))
safeRegister('usb', () => registerUsbIPC({ ipcMain, logger: Logger }))
safeRegister('restore', () => registerRestoreIPC({ ipcMain, logger: Logger }))
safeRegister('upscale', () => registerUpscaleIPC({ app, ipcMain, BrowserWindow, logger: Logger }))
safeRegister('share', () => registerShareIPC({ app, ipcMain, dialog, shell, clipboard, globalShortcut, BrowserWindow, Notification, logger: Logger }))
safeRegister('metadata', () => registerMetadataIPC({ ipcMain, assertFileAccessGranted, hasFileAccessGrant, getFfmpegPath, logger: Logger }))

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
let tray = null
let appIsQuitting = false
let closeToTrayEnabled = true
let latencyGuardianHandle = null
let latencyServiceState = 'starting'
const LATENCY_CHANNELS = [
  'latency:getConfig', 'latency:queryTimer', 'latency:getCpuTopology', 'latency:setConfig',
  'latency:enableUltra', 'latency:enableUltraStable', 'latency:disableUltra', 'latency:toggleUltra',
  'latency:boostNow', 'latency:launchGameWithProfile'
]
for (const ch of LATENCY_CHANNELS) {
  ipcMain.handle(ch, async () => ({
    ok: false,
    error: latencyServiceState === 'disabled' ? 'latency-service-disabled' : 'latency-service-starting'
  }))
}

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

// The converter defaults its output to the folder of the files the user picked: writing next to a file the user
// chose is the same intent as the pick itself, so that folder is allowed without a second folder dialog.
function assertOutputDirGranted(outputDir, inputFiles) {
  const out = normalizeAccessPath(outputDir)
  const besideInput = (inputFiles || []).some((f) => hasFileAccessGrant(f) && normalizeAccessPath(path.dirname(String(f))) === out)
  if (!besideInput) assertFileAccessGranted(outputDir, 'pasta de saída')
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

  win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    // Embedded pages (Juuzou/LuluFlix) are remote https sites; refuse anything else.
    try {
      if (new URL(params?.src ?? '').protocol !== 'https:') {
        event.preventDefault()
        return
      }
    } catch {
      event.preventDefault()
      return
    }
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

  if (isDev() && process.env.DARKHUB_RENDERER === 'dist') {
    // Unpackaged run without Vite (e.g. the VM acceptance run): use the built renderer.
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  } else if (isDev()) {
    win.loadURL(`http://localhost:5173/${devStartPage ? `#${devStartPage}` : ''}`)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  try {
    session.fromPartition('persist:darkhub_media').webRequest.onHeadersReceived((details, callback) => {
      const newHeaders = { ...details.responseHeaders };
      Object.keys(newHeaders).forEach(k => {
        if (k.toLowerCase() === 'x-frame-options') delete newHeaders[k];
      });
      callback({ responseHeaders: newHeaders });
    });
  } catch (err) {
    log.warn('[session] failed to configure media partition headers', err?.message ?? String(err))
  }

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

ipcMain.handle('optimizer:listOperations', () => {
  return SystemOptimizerService.listOperations()
})

ipcMain.handle('optimizer:checkOperationsStatus', async () => {
  return await SystemOptimizerService.checkOperationsStatus()
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

let cachedHardwareSnapshot = null;
let cachedPhysicalCores = null;
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
        const { stdout: regCpu } = await runCommand('reg.exe', ['query', 'HKLM\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0', '/v', 'ProcessorNameString'], { timeoutMs: 5000 })
        const match = String(regCpu ?? '').match(/ProcessorNameString\s+REG_SZ\s+(.+)/i)
        if (match && match[1]) {
          cachedHardwareSnapshot = match[1].trim()
        }
      }
      if (cachedHardwareSnapshot) cpuModel = cachedHardwareSnapshot
    } catch {}
  }

  if (cachedPhysicalCores === null) {
    try {
      const cpuInfo = await si.cpu()
      if (Number.isFinite(cpuInfo?.physicalCores) && cpuInfo.physicalCores > 0) cachedPhysicalCores = cpuInfo.physicalCores
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
      physicalCores: cachedPhysicalCores ?? null, // unknown until systeminformation answers; never guessed
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

ipcMain.handle('system:getDeepCategory', async (_, category, forceRefresh) => {
  return await DeepHardwareService.getCategory(category, forceRefresh);
})

const PROCS_FLAG = path.join(os.tmpdir(), 'darkhub_procs_enabled.flag');
try { if (fsRaw.existsSync(PROCS_FLAG)) fsRaw.unlinkSync(PROCS_FLAG); } catch {}

ipcMain.handle('system:enableProcessTracking', (_, enabled) => {
  try {
    if (enabled) {
      fsRaw.writeFileSync(PROCS_FLAG, '1', 'utf8');
    } else {
      if (fsRaw.existsSync(PROCS_FLAG)) fsRaw.unlinkSync(PROCS_FLAG);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
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
        resolve({ ok: false, error: 'Benchmark timed out' });
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
    const res = await service.fetchCover(payload?.gameName, payload?.forceRefresh)
    // store only the cover on the current record, so a cover arriving late never overwrites the user's edits
    if (res?.ok && typeof payload?.gameId === 'string' && payload.gameId) {
      const { loadLibrary, updateGame } = await getLibraryStore()
      const saved = await updateGame(app, payload.gameId, (g) => { g.coverPath = res.path })
      if (saved) broadcastLibraryEvent('library:updated', { reason: 'cover', games: (await loadLibrary(app)).games })
    }
    return res
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})

// Async (fs.promises) so a library scan of large Steam/WindowsApps trees no longer blocks the
// main process. `siblings` is the directory listing the walker already read for the exe's folder.
async function scoreExecutable(exePath, siblings, gameDir = '') {
  let score = 50;
  const name = path.basename(exePath).toLowerCase();
  if (/setup|install|update|uninst|crash|reporter|helper|bootstrapper|launcher|vconsole|editor|server|dedicated|redist|prereq|anticheat|battleye|easyanticheat|cefprocess|webhelper|benchmark|vc_?redist|dxsetup|^ndp\d/i.test(name)) score -= 100;
  // Strongest signal: the exe is named after the game folder (Deadlock -> deadlock.exe).
  const key = (v) => String(v).toLowerCase().replace(/\.exe$/, '').replace(/[^a-z0-9]/g, '');
  const folder = key(path.basename(gameDir || ''));
  const exeKey = key(name);
  if (folder && exeKey.length >= 3 && (folder === exeKey || folder.startsWith(exeKey) || exeKey.startsWith(folder))) score += 80;
  try {
    const stat = await fs.stat(exePath);
    if (stat.size < 1024 * 1024 * 2) score -= 20;
    else if (stat.size > 1024 * 1024 * 10) score += 20;
  } catch (e) {}
  const files = siblings;
  const hasUnity = files.some(f => f.toLowerCase().includes('unityplayer.dll') || f.toLowerCase().endsWith('_data'));
  const hasUnreal = files.some(f => f.toLowerCase() === 'engine' || f.toLowerCase().includes('win64-shipping'));
  const hasCry = files.some(f => f.toLowerCase() === 'crysystem.dll');
  if (hasUnity) score += 50;
  if (hasUnreal) score += 50;
  if (hasCry) score += 50;
  if (files.some(f => f.toLowerCase().includes('dxgi') || f.toLowerCase().includes('d3d'))) score += 10;
  if (files.some(f => f.toLowerCase().includes('vulkan'))) score += 10;
  return score;
}

async function scanDirectoryForBestExe(dir) {
  let bestExe = '';
  let bestScore = -999;
  async function walk(currentDir, depth) {
    if (depth > 3) return;
    try {
      const files = await fs.readdir(currentDir, { withFileTypes: true });
      const names = files.map(f => f.name);
      for (const file of files) {
        const fullPath = path.join(currentDir, file.name);
        if (file.isDirectory()) {
          await walk(fullPath, depth + 1);
        } else if (file.name.toLowerCase().endsWith('.exe')) {
          const score = await scoreExecutable(fullPath, names, dir);
          if (score > bestScore && score > 0) {
            bestScore = score;
            bestExe = fullPath;
          }
        }
      }
    } catch(e) {}
  }
  await walk(dir, 0);
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
        const content = await fs.readFile(vdf, 'utf8');
        const matches = [...content.matchAll(/"path"\s+"([^"]+)"/g)];
        for (const m of matches) {
          steamPaths.push(path.join(m[1], 'steamapps', 'common'));
        }
      } catch {}
    }
    // The vdf repeats the default library (and differs only in case), so scan each folder once.
    const uniqueSteamDirs = [...new Map(steamPaths.map((p) => [path.normalize(p).toLowerCase(), p])).values()]
    for (const steamDir of uniqueSteamDirs) {
      try {
        const entries = await fs.readdir(steamDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          // Steam runtime folders, not games.
          if (/^(steamworks shared|steamvr|steam controller configs)$/i.test(entry.name)) continue;
          const gameDir = path.join(steamDir, entry.name);
          const bestExe = await scanDirectoryForBestExe(gameDir);
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
    const manifests = (await fs.readdir(epicManifestDir)).filter(f => f.endsWith('.item'));
    for (const manifest of manifests) {
      try {
        const data = JSON.parse(await fs.readFile(path.join(epicManifestDir, manifest), 'utf8'));
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
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const gameDir = path.join(dir, entry.name);
          const bestExe = await scanDirectoryForBestExe(gameDir);
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
    const entries = await fs.readdir(xboxDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const gameDir = path.join(xboxDir, entry.name);
        const lowerName = entry.name.toLowerCase();
        const ignoredPrefixes = ['microsoft', 'windows', 'msteams', 'whatsapp', 'python', 'intel', 'nvidia', 'realtek', 'dolby', 'disney', 'spotify', 'netflix', 'appup', 'hewlettpackard', 'lenovo', 'dell'];
        if (!ignoredPrefixes.some(p => lowerName.startsWith(p))) {
          const bestExe = await scanDirectoryForBestExe(gameDir);
          if (bestExe) {
            discovered.push({ platform: 'Xbox', name: entry.name.split('_')[0], exePath: bestExe, workingDir: path.dirname(bestExe) });
          }
        }
      } catch {}
    }
  } catch {}

  return { ok: true, discovered };
})

// The renderer may only open web pages (http/https) plus a fixed list of Windows system URIs.
// ms-settings:/magnet: stay restricted to the window-open/navigation guards above.
const RENDERER_SYSTEM_URIS = new Set(['windowsdefender:'])

ipcMain.handle('shell:openExternal', async (_event, url) => {
  try {
    const raw = typeof url === 'string' ? url.trim() : ''
    if (RENDERER_SYSTEM_URIS.has(raw.toLowerCase())) {
      await shell.openExternal(raw)
      return { ok: true }
    }
    const parsed = new URL(raw)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { ok: false, error: 'Unsupported URL protocol' }
    }
    await shell.openExternal(parsed.toString())
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})

function findPgeBat() {
  const candidates = [
    path.join(process.resourcesPath || '', 'PGE Portable', 'Pokeralho Games Launcher.bat'),
    path.join(app.getAppPath ? app.getAppPath() : '', 'PGE Portable', 'Pokeralho Games Launcher.bat'),
    path.join(process.cwd(), 'PGE Portable', 'Pokeralho Games Launcher.bat'),
    path.resolve(__dirname, '..', 'PGE Portable', 'Pokeralho Games Launcher.bat'),
    path.resolve(__dirname, '..', '..', 'PGE Portable', 'Pokeralho Games Launcher.bat'),
    path.join(process.env.APPDATA || '', 'darkhub-suite', 'PGE Portable', 'Pokeralho Games Launcher.bat')
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

ipcMain.handle('app:getResourceUsage', async () => {
  try {
    const metrics = app.getAppMetrics()
    const processes = metrics.map((m) => ({
      pid: m.pid,
      type: m.type,
      name: m.name || m.serviceName || '',
      cpuPercent: Math.round((m.cpu?.percentCPUUsage ?? 0) * 10) / 10,
      workingSetMb: Math.round(((m.memory?.workingSetSize ?? 0) / 1024) * 10) / 10
    }))
    return {
      ok: true,
      totalCpuPercent: Math.round(processes.reduce((a, p) => a + p.cpuPercent, 0) * 10) / 10,
      totalWorkingSetMb: Math.round(processes.reduce((a, p) => a + p.workingSetMb, 0)),
      processes
    }
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
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

const STARTUP_TASK_NAME = 'DarkHub Suite Autostart'

async function isStartupTaskEnabled() {
  if (process.platform !== 'win32') return false
  try {
    const r = await runCommand('schtasks.exe', ['/Query', '/TN', STARTUP_TASK_NAME], { timeoutMs: 8000 })
    return r.code === 0
  } catch {
    return false
  }
}

async function setStartupTask(enabled, hidden) {
  if (process.platform !== 'win32') return false
  if (!enabled) {
    await runCommand('schtasks.exe', ['/Delete', '/TN', STARTUP_TASK_NAME, '/F'], { timeoutMs: 8000 }).catch(() => {})
    return true
  }
  const exe = process.execPath
  const command = `"${exe}"${hidden ? ' --hidden' : ''}`
  const r = await runCommand('schtasks.exe', [
    '/Create', '/TN', STARTUP_TASK_NAME, '/TR', command,
    '/SC', 'ONLOGON', '/RL', 'HIGHEST', '/F'
  ], { timeoutMs: 15000 })
  if (r.code !== 0) throw new Error(r.stderr || 'Falha ao criar a tarefa de inicialização')
  return true
}

ipcMain.handle('settings:getConfig', async () => {
  try {
    const { loadConfig: loadPersistedConfig } = await import('./configManager.js')
    const config = await loadPersistedConfig()
    const startupEnabled = await isStartupTaskEnabled()
    return {
      ok: true,
      config: {
        app: {
          ...(config.app ?? {}),
          openAtLogin: startupEnabled
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
    // Only persist the known boolean toggles; never spread arbitrary renderer data into config.json.
    const patch = {}
    for (const key of ['latencyGuardian', 'overlay', 'autoClicker']) {
      if (typeof payload?.[key] === 'boolean') patch[key] = payload[key]
    }

    const next = await saveConfig({
      ...current,
      liveServices: {
        ...(current.liveServices ?? {}),
        ...patch
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
    await setStartupTask(openAtLogin, openAsHidden)
    const { loadConfig: loadPersistedConfig, saveConfig } = await import('./configManager.js')
    const current = await loadPersistedConfig()
    const next = await saveConfig({
      ...current,
      app: {
        ...(current.app ?? {}),
        openAtLogin
      }
    })
    return { ok: true, openAtLogin: await isStartupTaskEnabled() }
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})

/// Live host stats for the DarkOS Center, polled every few seconds while the page is open.
// CPU/RAM/uptime come from Node (instant); only the process/service counts need PowerShell (~1.5 s), so they
// are cached for 30 s and refreshed in the background instead of spawning PowerShell on every poll.
const liveCpu = new CpuLoadTracker()
let liveCounts = null
let liveCountsAt = 0
let liveCountsPending = null

function refreshLiveCounts() {
  liveCountsPending ||= runPowerShell(
    "$ErrorActionPreference='SilentlyContinue'; $s=Get-Service; '{0}|{1}|{2}' -f @(Get-Process).Count, @($s | Where-Object { $_.Status -eq 'Running' }).Count, @($s).Count",
    { timeoutMs: 12000, trim: true }
  ).then((res) => {
    const m = /^(\d+)\|(\d+)\|(\d+)/.exec(stripBom(res.stdout || '').trim())
    if (m) { liveCounts = { processes: +m[1], servicesRunning: +m[2], servicesTotal: +m[3] }; liveCountsAt = Date.now() }
  }).catch(() => {}).finally(() => { liveCountsPending = null })
  return liveCountsPending
}

// Memory only, straight from the OS (GlobalMemoryStatusEx: "available" = what Task Manager shows), cheap enough to poll.
ipcMain.handle('system:getMemory', () => {
  const total = os.totalmem(), free = os.freemem()
  return { ok: true, total, used: Math.max(0, total - free), available: free }
})

ipcMain.handle('system:getLiveStats', async () => {
  if (process.platform !== 'win32') return { ok: false, error: 'Disponível apenas no Windows.' }
  try {
    if (!liveCounts) await refreshLiveCounts()
    else if (Date.now() - liveCountsAt > 30000) void refreshLiveCounts()
    let cpuPercent = liveCpu.sample()
    if (cpuPercent === null) { await new Promise((r) => setTimeout(r, 250)); cpuPercent = liveCpu.sample() ?? 0 }
    const memTotalMb = Math.round(os.totalmem() / 1048576)
    const memUsedMb = Math.max(0, memTotalMb - Math.round(os.freemem() / 1048576))
    return {
      ok: true,
      processes: liveCounts?.processes ?? 0,
      servicesRunning: liveCounts?.servicesRunning ?? 0,
      servicesTotal: liveCounts?.servicesTotal ?? 0,
      cpuPercent,
      memUsedMb,
      memTotalMb,
      memPercent: memTotalMb ? Math.round((memUsedMb / memTotalMb) * 100) : 0,
      uptimeSec: Math.round(os.uptime())
    }
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
    // PowerShell cannot read inside app.asar: the script is unpacked next to it (asarUnpack electron/*.ps1).
    const scriptPath = path.join(__dirname.replace(/app\.asar(?![.\w])/, 'app.asar.unpacked'), 'DarkHub.Injector.ps1');
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
  for (const p of filePaths.slice(0, 200)) {
    if (typeof p !== 'string' || !p.trim() || !path.isAbsolute(p)) continue
    try {
      if (!fsRaw.statSync(p).isFile()) continue
    } catch { continue }
    grantFilePath(p)
    granted.push(p)
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
  // `ok`/`files` are aliases kept for callers that expect that shape (DllInjector).
  return { canceled: result.canceled, filePaths: result.filePaths, ok: !result.canceled, files: result.filePaths }
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
ipcMain.handle('optimizer:revertHags', async () => AppManagerEngine.revertHags());

ipcMain.handle('optimizer:uninstallProgramWithLeftovers', async (_event, payload) => AppManagerEngine.uninstallProgramWithLeftovers(payload));
ipcMain.handle('optimizer:advancedNetworkApply', async () => NetworkEngine.advancedNetworkApply());
ipcMain.handle('optimizer:advancedNetworkRevert', async () => NetworkEngine.advancedNetworkRevert());

ipcMain.handle('optimizer:deepTweaksList', async () => DeepTweaksEngine.listTweaks());
ipcMain.handle('optimizer:applyTweak', async (_event, id) => {
  try {
    switch (id) {
      case 'optimize-ram': return await MemoryEngine.optimizeRAM()
      case 'clean-temp': return await StorageEngine.cleanTempFiles()
      case 'repair-windows': return await SystemEngine.repairWindows()
      default: return { ok: false, error: `Unknown tweak: ${String(id)}` }
    }
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})
ipcMain.handle('optimizer:deepTweaksStatus', async () => DeepTweaksEngine.checkTweaksStatus());
ipcMain.handle('optimizer:deepTweaksAnalyze', async (_event, payload) => {
  const ids = payload?.tweakIds || [];
  const selected = DeepTweaksEngine.listTweaks().filter((t) => ids.includes(t.id));
  const changes = selected.flatMap((t) => t.changes.map((c) => ({ tweakId: t.id, ...c })));
  return { ok: true, summary: { count: selected.length, requiresAdmin: selected.some(t => t.requiresAdmin) }, changes };
});
ipcMain.handle('optimizer:deepTweaksApply', async (event, payload) => DeepTweaksEngine.applyTweaks(payload?.tweakIds || [], (channel, msg) => event.sender.send(channel, msg)));
ipcMain.handle('optimizer:deepTweaksRevert', async (event, payload) => DeepTweaksEngine.revertTweaks(payload?.tweakIds || [], (channel, msg) => event.sender.send(channel, msg)));
ipcMain.handle('optimizer:deepTweaksUndo', async (_event, payload) => DeepTweaksEngine.undoTweaks(payload?.tweakIds ?? payload?.undoToken ?? []));
ipcMain.handle('optimizer:globalRecommendedTweaks', async (event) => {
  try {
    // only low-risk, reversible, non-security tweaks (see pickRecommendedTweaks)
    return await DeepTweaksEngine.applyRecommended((channel, msg) => event.sender.send(channel, msg));
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) };
  }
});

ipcMain.handle('optimizer:getDnsState', async () => {
  try { return await DnsEngine.getState(); } catch (err) { return { ok: false, error: err?.message ?? String(err) }; }
});

// setDnsServers and applyDns share one path: UAC, read-back verification, persistent undo token
ipcMain.handle('optimizer:setDnsServers', async (_event, payload) => {
  try { return await DnsEngine.apply({ primary: payload?.primary, secondary: payload?.secondary }); }
  catch (err) { return { ok: false, error: err?.message ?? String(err) }; }
});
ipcMain.handle('optimizer:applyDns', async (_event, payload) => {
  try { return await DnsEngine.apply({ primary: payload?.primary, secondary: payload?.secondary }); }
  catch (err) { return { ok: false, error: err?.message ?? String(err) }; }
});

ipcMain.handle('optimizer:undoDns', async (_event, payload) => {
  try { return await DnsEngine.undo({ undoToken: typeof payload?.undoToken === 'string' ? payload.undoToken : undefined }); }
  catch (err) { return { ok: false, error: err?.message ?? String(err) }; }
});

ipcMain.handle('optimizer:dnsBenchmark', async (_event, payload) => {
  try {
    return await DnsEngine.benchmark({ timeoutMs: payload?.timeoutMs, attempts: payload?.attempts, concurrency: payload?.concurrency });
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) };
  }
});
// ============================================================
// RUN ROUTINE HANDLER
// ============================================================
ipcMain.handle('optimizer:runRoutine', async (_event, routineId) => {
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
        case 'change-priority': res = await ToolboxEngine.openTaskManager(); break;
        case 'disable-telemetry': res = await DeepTweaksEngine.applyTweaks(['tweak:disableTelemetry'], () => {}); break;
        case 'revert-telemetry': res = await DeepTweaksEngine.undoTweaks(['tweak:disableTelemetry']); break;
        case 'disable-ai': res = await DeepTweaksEngine.applyTweaks(['tweak:disableAiAndAds'], () => {}); break;
        case 'revert-ai': res = await DeepTweaksEngine.undoTweaks(['tweak:disableAiAndAds']); break;
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
        case 'timer-tuning': res = await SystemEngine.applyTimerTuning(); break;
        case 'revert-timer-tuning': res = await SystemEngine.revertTimerTuning(); break;
        case 'revert-kernel-extreme': res = await SystemEngine.revertExtremeKernelMod(); break;
        case 'revert-network-extreme': res = await SystemEngine.revertExtremeNetworkMod(); break;
        case 'revert-cpu-unpark': res = await SystemEngine.revertCpuUnpark(); break;
        case 'revert-msi-mode': res = await SystemEngine.revertMsiMode(); break;
        case 'revert-pagefile': res = await SystemEngine.revertPagefile(); break;
        case 'restore-capabilities': res = await SystemEngine.restoreCapabilities(); break;
        case 'revert-gaming-mode': res = await SystemEngine.revertHardcoreGamerMode(); break;
        case 'defender-disable': res = await DefenderControlEngine.runNativeDefenderControl('disable'); break;
        case 'defender-enable': res = await DefenderControlEngine.runNativeDefenderControl('enable'); break;
        case 'defender-restore-image': res = await DefenderControlEngine.restoreImageDefender(); break;
        case 'open-tamper-settings': res = DefenderControlEngine.openTamperSettings(); break;
        case 'dns-benchmark': res = { ok: true, msg: 'Use a aba DNS' }; break;
        default: throw new Error(`Unknown routine: ${routineId}`);
      }
    }
    if (!res.ok) throw new Error(res.error || 'Operation failed');
    sendEvent('complete', `Rotina encerrada: ${routineId} (${res.msg || 'Concluído'})`, { progress: 100, ok: true, elapsedMs: Date.now() - startedAt });
    return res;
  } catch (err) {
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
ipcMain.handle('optimizer:restoreImageDefender', async () => {
  return await DefenderControlEngine.restoreImageDefender();
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
ipcMain.handle('optimizer:revertExtremeKernelMod', async () => {
  return await SystemEngine.revertExtremeKernelMod();
});
ipcMain.handle('optimizer:revertServicesTweak', async () => {
  return await ServicesEngine.revertServicesTweak();
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
  assertOutputDirGranted(outputDir, inputFiles)

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
  assertOutputDirGranted(outputDir, inputFiles)

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
  assertOutputDirGranted(outputDir, inputFiles)

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
    assertOutputDirGranted(path.dirname(outputArchive), inputFiles)
    const args = ['-a', '-c', '-f', outputArchive, ...inputFiles.map(f => path.basename(f))]
    const cwd = path.dirname(inputFiles[0])
    const { code, stderr } = await runCommand(SYSTEM_TAR, args, { cwd, timeoutMs: 10 * 60 * 1000 })
    if (code !== 0) throw new Error(stderr || `tar exited with code ${code}`)
    return { ok: true, outputArchive }
  } else if (action === 'extract') {
    if (!Array.isArray(inputFiles) || inputFiles.length === 0 || !extractDir) throw new Error('Invalid arguments')
    assertFileAccessGranted(inputFiles[0], 'arquivo compactado')
    assertOutputDirGranted(extractDir, inputFiles)
    await fs.mkdir(extractDir, { recursive: true })
    const args = ['-x', '-f', inputFiles[0], '-C', extractDir]
    const { code, stderr } = await runCommand(SYSTEM_TAR, args, { timeoutMs: 10 * 60 * 1000 })
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
    // yt-dlp also writes the cookie jar back on exit, so require a dialog grant as youtube:download does.
    if (typeof cookiesPath === 'string' && cookiesPath.trim().length) {
      assertFileAccessGranted(cookiesPath, 'arquivo de cookies')
    }

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
        args.push('--', String(url))
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

    throw new Error(`yt-dlp falhou: ${ytDlpError}`)
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
    embedMetadata = true,
    extra = {}
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

    const { buildExtraArgs } = await import('./services/ytdlpOptions.js')
    const extraOpts = { ...(extra && typeof extra === 'object' ? extra : {}) }
    if (extraOpts.skipDownloaded) extraOpts.archivePath = path.join(app.getPath('userData'), 'ytdlp-archive.txt')
    else delete extraOpts.archivePath
    const { args: extraArgs, container } = buildExtraArgs(extraOpts, String(mode || '').startsWith('audio-'))

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

    for (let i = 0; i < args.length; i++) if (args[i] === '--merge-output-format') args[i + 1] = container
    args.push(...extraArgs)
    args.push('--', String(url))

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

ipcMain.handle('ocr:extractText', async (_event, payload) => {
  const imagePath = typeof payload === 'string' ? payload : payload?.imagePath
  const base64Data = typeof payload === 'object' && payload?.base64 ? String(payload.base64) : null
  const lang = typeof payload === 'object' && /^[a-z_]{3,8}(\+[a-z_]{3,8}){0,4}$/.test(String(payload?.lang ?? '')) ? String(payload.lang) : 'eng+por'
  const preprocess = typeof payload === 'object' ? Boolean(payload?.preprocess ?? true) : true
  // page segmentation: 3 = automatic, 4 = single column, 6 = single block, 7 = single line, 11 = sparse text
  const psm = [3, 4, 6, 7, 11].includes(Number(payload?.psm)) ? String(payload.psm) : '3'

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
        const meta = await sharp(inputBuffer).metadata()
        // Tesseract reads best with ~30 px tall glyphs: screenshots and small crops are upscaled first
        const scale = meta.width && meta.width < 1600 ? Math.min(3, 2400 / meta.width) : 1
        let img = sharp(inputBuffer).rotate().flatten({ background: '#ffffff' })
        if (scale > 1.2) img = img.resize({ width: Math.round(meta.width * scale), kernel: 'lanczos3' })
        img = img.grayscale().normalize().sharpen()
        // light text on a dark background (dark themes, games) reads far better inverted
        const { channels } = await img.clone().stats()
        if (channels?.[0]?.mean < 110) img = img.negate({ alpha: false })
        inputBuffer = await img.png().toBuffer()
      } catch {}
    }

    const entry = await getOcrWorker(lang)
    // one recognition at a time per worker
    const job = entry.queue.then(async () => {
      const worker = await entry.worker
      await worker.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: '1' })
      return worker.recognize(inputBuffer)
    })
    entry.queue = job.catch(() => {})
    const ret = await job
    return { ok: true, text: ret?.data?.text || '', confidence: ret?.data?.confidence || 0 }
  } catch (err) {
    throw new Error(`OCR failed: ${err.message}`)
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
  const target = vaultFilePath()
  const tmp = `${target}.${process.pid}.tmp`
  await fs.writeFile(tmp, content, 'utf8')
  await fs.rename(tmp, target)
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
  // Hardening: re-wrap with the current scrypt parameters when this wrapper is weaker (old file backed up first).
  try {
    await upgradeWrapperIfWeak({ vaultPath: vaultFilePath(), wrapperName: wrapper, secret: password, vaultKey: vk, readFile: readVaultFile, writeFile: writeVaultFile })
  } catch (err) {
    log.warn(`[vault] KDF upgrade skipped: ${err?.message || err}`)
  }
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
  const copied = String(entry.password ?? '')
  clipboard.writeText(copied)
  setTimeout(() => {
    try { if (clipboard.readText() === copied) clipboard.clear() } catch {}
  }, 20000).unref?.()
  return { ok: true }
})

ipcMain.handle('vault:changeMasterPassword', async (_event, payload) => {
  await ensureUnlocked()
  const newPassword = payload?.newMasterPassword
  const currentPassword = payload?.currentMasterPassword
  if (typeof newPassword !== 'string' || newPassword.length < 8) return { ok: false, error: 'Invalid master password' }
  if (typeof currentPassword !== 'string' || !currentPassword) return { ok: false, error: 'Current master password required' }

  const file = await readVaultFile()
  try {
    await unwrapVaultKeyWithPassword(file?.wrappers?.master, currentPassword)
  } catch {
    return { ok: false, error: 'Current master password is incorrect' }
  }
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
  if (!hasFileAccessGrant(targetPath)) return { ok: false, error: 'Destination was not chosen through the save dialog' }
  await fs.copyFile(vaultFilePath(), targetPath)
  return { ok: true }
})

ipcMain.handle('vault:import', async (_event, payload) => {
  const sourcePath = payload?.sourcePath
  if (typeof sourcePath !== 'string' || !sourcePath) return { ok: false, error: 'Invalid sourcePath' }
  if (!hasFileAccessGrant(sourcePath)) return { ok: false, error: 'Source was not chosen through the file dialog' }
  try {
    const candidate = JSON.parse(await fs.readFile(sourcePath, 'utf8'))
    if (candidate?.version !== VAULT_VERSION || !candidate?.wrappers?.master || !candidate?.data) {
      return { ok: false, error: 'Invalid vault file' }
    }
  } catch {
    return { ok: false, error: 'Invalid vault file' }
  }
  // Never overwrite the current vault without a copy of it.
  if (await vaultFileExists()) await backupVaultFile(vaultFilePath(), 'pre-import')
  await fs.copyFile(sourcePath, vaultFilePath())
  lockVault()
  return { ok: true }
})

// Vault transfer to another PC through Susuya (electron/services/vaultTransfer/vaultTransfer.js): the encrypted vault
// is sealed again with a one-time key that only travels inside the code the user carries; the server copy lasts 1 h.
let lastVaultTransfer = null
ipcMain.handle('vault:transferSend', async () => {
  try {
    await ensureUnlocked()
    const { sealVault, makeCode } = await import('./services/vaultTransfer/vaultTransfer.js')
    const { SusuyaClient } = await import('./services/susuya/SusuyaClient.js')
    const { key, blob } = sealVault(await fs.readFile(vaultFilePath()))
    const tmp = path.join(os.tmpdir(), `darkhub-vault-${crypto.randomUUID()}.bin`)
    await fs.writeFile(tmp, blob)
    try {
      const up = await new SusuyaClient().upload(tmp, { ttl: 3600, name: 'vault-transfer.bin' })
      lastVaultTransfer = { id: up.id, deleteToken: up.deleteToken }
      return { ok: true, code: makeCode(up.id, key), expiresAt: Date.now() + 3600 * 1000 }
    } finally {
      await fs.rm(tmp, { force: true }).catch(() => {})
    }
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})

ipcMain.handle('vault:transferCancel', async () => {
  if (!lastVaultTransfer) return { ok: true }
  try {
    const { SusuyaClient } = await import('./services/susuya/SusuyaClient.js')
    await new SusuyaClient().remove(lastVaultTransfer.id, lastVaultTransfer.deleteToken)
    lastVaultTransfer = null
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})

ipcMain.handle('vault:transferReceive', async (_event, payload) => {
  try {
    const { parseCode, openVault } = await import('./services/vaultTransfer/vaultTransfer.js')
    const { SUSUYA_ORIGIN } = await import('./services/susuya/SusuyaClient.js')
    const { fileId, key } = parseCode(payload?.code)
    const res = await fetch(`${SUSUYA_ORIGIN}/d/${encodeURIComponent(fileId)}`)
    if (res.status === 404 || res.status === 410) return { ok: false, error: 'expired' }
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const blob = Buffer.from(await res.arrayBuffer())
    if (blob.length > 64 * 1024 * 1024) return { ok: false, error: 'Invalid vault file' }
    const bytes = openVault(blob, key)
    const candidate = JSON.parse(bytes.toString('utf8'))
    if (candidate?.version !== VAULT_VERSION || !candidate?.wrappers?.master || !candidate?.data) return { ok: false, error: 'Invalid vault file' }
    // Never overwrite the current vault without a copy of it.
    if (await vaultFileExists()) await backupVaultFile(vaultFilePath(), 'pre-transfer')
    await fs.writeFile(vaultFilePath(), bytes)
    lockVault()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})

// Browser extension bridge (electron/ipc/vaultBridgeIpc.js). It reaches the vault only through these accessors.
safeRegister('vaultBridge', () => registerVaultBridgeIPC({
  app, ipcMain, dialog, shell, BrowserWindow, logger: Logger,
  getMainWindow: () => mainWindow,
  vault: {
    isUnlocked: () => Boolean(vaultUnlocked && vaultKey && vaultData),
    getEntries: () => (vaultUnlocked && vaultData ? (vaultData.entries ?? []) : []),
    addEntry: async ({ site, username, password, notes }) => {
      await ensureUnlocked()
      const now = Date.now()
      vaultData.entries = [...(vaultData.entries ?? []), { id: crypto.randomUUID(), site, username, password, notes: notes ?? '', createdAt: now, updatedAt: now }]
      await persistVaultData()
    },
    updatePassword: async (id, newPassword) => {
      await ensureUnlocked()
      vaultData.entries = (vaultData.entries ?? []).map((e) => (e.id === id ? { ...e, password: newPassword, updatedAt: Date.now() } : e))
      await persistVaultData()
    },
    lock: () => lockVault()
  }
}))

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

      const allDomains = Array.from(new Set([...DEFAULT_TRACKING_DOMAINS, ...customDomains]))

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

  const defaults = DEFAULT_TRACKING_DOMAINS

  return { ok: true, defaults, custom }
})

const DEFAULT_TRACKING_DOMAINS = Object.freeze([
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
  ])

const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
function isValidHostname(value) {
  return typeof value === 'string' && HOSTNAME_RE.test(value)
}

ipcMain.handle('security:setCustomTrackingDomains', async (_event, payload) => {
  const domains = payload?.domains
  if (!Array.isArray(domains)) return { ok: false, error: 'Invalid domains' }
  const cleaned = domains
    .map((d) => String(d).trim().toLowerCase())
    .filter((d) => isValidHostname(d))
    .slice(0, 500)
  const unique = Array.from(new Set(cleaned))
  const domainsFile = path.join(app.getPath('userData'), 'tracking.domains.json')
  await fs.writeFile(domainsFile, JSON.stringify({ custom: unique }, null, 2), 'utf8')
  return { ok: true, count: unique.length }
})

ipcMain.handle('security:blockTracking', async () => {
  if (process.platform !== 'win32') return { ok: false, error: 'Only supported on Windows' }
  try {
    const defaults = DEFAULT_TRACKING_DOMAINS

    const domainsFile = path.join(app.getPath('userData'), 'tracking.domains.json')
    let customDomains = []
    try {
      const raw = await fs.readFile(domainsFile, 'utf8')
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed?.custom)) customDomains = parsed.custom.map((d) => String(d).trim()).filter((d) => isValidHostname(d.toLowerCase()))
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
    const content = await fs.readFile(hostsPath, 'utf8')
    const stripped = content
      .replace(/# DarkHub Tracking Blocker - BEGIN[\s\S]*?# DarkHub Tracking Blocker - END\r?\n?/g, '')
      .replace(/(\r?\n){3,}/g, os.EOL + os.EOL)
      .trimEnd() + os.EOL
    await fs.writeFile(hostsPath, stripped, 'utf8')
    return { ok: true, msg: 'Tracking blocker section removed from hosts' }
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
    const target = Number(pid)
    if (!Number.isInteger(target) || target <= 4 || target === process.pid) {
      return { ok: false, error: 'Invalid or protected process id' }
    }
    process.kill(target)
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
  const unpackedFromDir = __dirname.includes('app.asar')
    ? path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), 'services', 'DarkHub.ClickEngine.exe')
    : null
  if (unpackedFromDir && fsRaw.existsSync(unpackedFromDir)) return unpackedFromDir

  if (process.resourcesPath) {
    const fromResources = path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'services', 'DarkHub.ClickEngine.exe')
    if (fsRaw.existsSync(fromResources)) return fromResources
  }

  const devPath = path.join(__dirname, 'services', 'DarkHub.ClickEngine.exe')
  if (!devPath.includes('app.asar') && fsRaw.existsSync(devPath)) return devPath

  const appPath = path.join(app.getAppPath().replace('app.asar', 'app.asar.unpacked'), 'electron', 'services', 'DarkHub.ClickEngine.exe')
  if (fsRaw.existsSync(appPath)) return appPath

  return null
}

async function startAutoClicker(payload) {
  const button = payload?.button === 'right' || payload?.button === 'middle' || payload?.button === 'double' ? payload.button : 'left'
  const intervalMsRaw = Number(payload?.intervalMs)
  const intervalMs = Number.isFinite(intervalMsRaw) ? Math.max(1, Math.min(10000, Math.trunc(intervalMsRaw))) : 50

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
    try {
      const p = spawn(nativeExe, [], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      p.on('error', (err) => {
        log.warn('[AutoClicker] native engine process error:', err)
        if (autoClickerProc === p) {
          autoClickerProc = null
          autoClickerState = null
        }
      })

      p.on('exit', () => {
        if (autoClickerProc !== p) return
        autoClickerProc = null
        autoClickerState = null
        try {
          mainWindow?.webContents?.send('autoclicker:changed', { running: false, state: null })
        } catch {}
      })

      p.stdout?.on('data', (data) => {
        const text = data.toString()
        const lines = text.split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const parsed = JSON.parse(trimmed)
            if (parsed.event === 'toggle') {
              if (parsed.status === 'running') {
                autoClickerState = {
                  button: parsed.button || button,
                  intervalMs: parsed.intervalMs || intervalMs,
                  startedAt: Date.now(),
                  isNative: true
                }
                mainWindow?.webContents?.send('autoclicker:changed', { running: true, state: autoClickerState })
              } else {
                autoClickerState = null
                mainWindow?.webContents?.send('autoclicker:changed', { running: false, state: null })
              }
            }
          } catch {}
        }
      })

      autoClickerProc = p
      autoClickerState = { button, intervalMs, startedAt: Date.now(), isNative: true }

      if (autoClickerHotkey) {
        p.stdin?.write(`HOTKEY ${autoClickerHotkey}\n`)
      }
      p.stdin?.write(`START ${button} ${intervalMs}\n`)

      await saveAutoClickerConfig().catch(() => {})
      return { ok: true, msg: 'AutoClicker iniciado com Engine Nativa C# (Baixo Nível)', state: autoClickerState }
    } catch (err) {
      log.warn('[AutoClicker] native spawn failed, falling back to powershell:', err)
      autoClickerProc = null
      autoClickerState = null
    }
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
    `  [DllImport("user32.dll", SetLastError=true)] public static extern void mouse_event(UInt32 dwFlags, UInt32 dx, UInt32 dy, UInt32 dwData, Int32 dwExtraInfo);`,
    `  public const UInt32 INPUT_MOUSE = 0;`,
    `  public const UInt32 MOUSEEVENTF_LEFTDOWN = 0x0002;`,
    `  public const UInt32 MOUSEEVENTF_LEFTUP = 0x0004;`,
    `  public const UInt32 MOUSEEVENTF_RIGHTDOWN = 0x0008;`,
    `  public const UInt32 MOUSEEVENTF_RIGHTUP = 0x0010;`,
    `  public const UInt32 MOUSEEVENTF_MIDDLEDOWN = 0x0020;`,
    `  public const UInt32 MOUSEEVENTF_MIDDLEUP = 0x0040;`,
    `  public static void Click(string btn, int holdMs){`,
    `    UInt32 down = MOUSEEVENTF_LEFTDOWN; UInt32 up = MOUSEEVENTF_LEFTUP;`,
    `    if (btn == "right") { down = MOUSEEVENTF_RIGHTDOWN; up = MOUSEEVENTF_RIGHTUP; }`,
    `    else if (btn == "middle") { down = MOUSEEVENTF_MIDDLEDOWN; up = MOUSEEVENTF_MIDDLEUP; }`,
    `    var downIn = new INPUT { type = INPUT_MOUSE, mi = new MOUSEINPUT { dwFlags = down } };`,
    `    var upIn   = new INPUT { type = INPUT_MOUSE, mi = new MOUSEINPUT { dwFlags = up   } };`,
    `    UInt32 s1 = SendInput(1, new INPUT[] { downIn }, Marshal.SizeOf(typeof(INPUT)));`,
    `    if (s1 == 0) mouse_event(down, 0, 0, 0, 0);`,
    `    System.Threading.Thread.Sleep(holdMs);`,
    `    UInt32 s2 = SendInput(1, new INPUT[] { upIn }, Marshal.SizeOf(typeof(INPUT)));`,
    `    if (s2 == 0) mouse_event(up, 0, 0, 0, 0);`,
    `  }`,
    `}`,
    `"@`,
    `$btn = '${button}'`,
    `$interval = ${intervalMs}`,
    `$hold = [Math]::Max(1, [Math]::Min(12, [int]($interval / 3)))`,
    `Start-Sleep -Milliseconds 200`,
    `while($true){`,
    `  if ($btn -eq 'double') { [Clicker]::Click('left', $hold); Start-Sleep -Milliseconds 20; [Clicker]::Click('left', $hold) }`,
    `  else { [Clicker]::Click($btn, $hold) }`,
    `  Start-Sleep -Milliseconds $interval`,
    `}`
  ].join('\n')

  const p = spawn('powershell.exe', powerShellArgsForEncodedScript(encodePowerShellScript(ps)), {
    windowsHide: true
  })

  autoClickerProc = p
  autoClickerState = { button, intervalMs, startedAt: Date.now(), isNative: false }

  p.on('error', (err) => {
    log.warn('[AutoClicker] powershell fallback process error:', err)
    if (autoClickerProc === p) {
      autoClickerProc = null
      autoClickerState = null
    }
  })

  p.on('exit', () => {
    if (autoClickerProc !== p) return
    autoClickerProc = null
    autoClickerState = null
    try {
      mainWindow?.webContents?.send('autoclicker:changed', { running: false, state: null })
    } catch {}
  })

  await saveAutoClickerConfig().catch(() => {})
  return { ok: true, msg: 'AutoClicker started', state: autoClickerState }
}

async function stopAutoClicker() {
  if (autoClickerProc) {
    // Capture the child: autoClickerProc is cleared below, so the delayed kill must not read it
    // (previously it did and never killed anything — the PowerShell fallback kept clicking).
    const proc = autoClickerProc
    try {
      if (proc.stdin?.writable) {
        proc.stdin.write('STOP\nEXIT\n')
      }
      setTimeout(() => {
        try { if (proc.exitCode === null) proc.kill() } catch {}
      }, 100)
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
    return await startAutoClicker(next ?? { intervalMs: 50, button: 'left' })
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})

ipcMain.handle('autoclicker:getHotkey', async () => {
  return { ok: true, hotkey: autoClickerHotkey }
})

ipcMain.handle('autoclicker:setHotkey', async (_event, payload) => {
  const hotkey = typeof payload?.hotkey === 'string' ? payload.hotkey.trim() : ''
  // The hotkey is forwarded verbatim to the native engine's line-based stdin protocol, so
  // reject whitespace/control characters that could smuggle extra commands (e.g. "F6\nSTART ...").
  if (hotkey.length > 0 && !/^[\x21-\x7E]{1,64}$/.test(hotkey)) {
    return { ok: false, error: 'Atalho inválido.' }
  }
  try {
    if (hotkey.length === 0) {
      unregisterAutoClickerHotkey()
      autoClickerHotkey = null
      if (autoClickerProc?.stdin?.writable) {
        autoClickerProc.stdin.write('HOTKEY NONE\n')
      }
      await saveAutoClickerConfig().catch(() => {})
      return { ok: true, enabled: false }
    }
    autoClickerHotkey = hotkey
    const reg = registerAutoClickerHotkey()
    if (autoClickerProc?.stdin?.writable) {
      autoClickerProc.stdin.write(`HOTKEY ${autoClickerHotkey}\n`)
    }
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

// Open-source apps published only as GitHub releases (not on winget). Allow-listed repos only: the renderer sends
// "gh:<owner>/<repo>" and nothing else is ever downloaded. The MSI must match the SHA-256 digest GitHub publishes.
const GITHUB_RELEASE_APPS = new Set([
  'storytold/photocraft', 'storytold/vectorcraft', 'storytold/filmcraft', 'storytold/lightcraft', 'storytold/effectcraft',
  'storytold/designcraft', 'storytold/pdfcraft', 'storytold/wordcraft', 'storytold/gridcraft', 'storytold/deckcraft',
  'storytold/cadcraft', 'storytold/figcraft', 'storytold/soundcraft'
])

async function installGithubReleaseMsi(repo, progress) {
  const { fetchJson, downloadToFile, assetSha256 } = await import('./services/SecureDownload.js')
  const rel = await fetchJson(`https://api.github.com/repos/${repo}/releases/latest`)
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'ia32' ? 'x86' : 'x64'
  const asset = (rel?.assets || []).find((a) => new RegExp(`-windows-${arch}\\.msi$`, 'i').test(String(a?.name)))
  if (!asset) throw new Error(`a versão ${rel?.tag_name ?? '?'} não tem instalador .msi para Windows ${arch}`)
  const sha256 = assetSha256(asset)
  if (!sha256) throw new Error('o GitHub não publicou o hash SHA-256 do instalador; instalação recusada')
  const dir = path.join(app.getPath('temp'), 'darkhub-setup')
  await fs.mkdir(dir, { recursive: true })
  const dest = path.join(dir, path.basename(String(asset.name)))
  progress(`[GitHub] Baixando ${asset.name} (${rel.tag_name}, ${Math.round((asset.size || 0) / 1048576)} MB)...`)
  await downloadToFile(asset.browser_download_url, dest, { expectedSha256: sha256, timeoutMs: 600000 })
  progress(`[GitHub] Hash SHA-256 conferido. Instalando...`)
  try {
    const code = await new Promise((resolve) => {
      const p = spawn('msiexec.exe', ['/i', dest, '/qn', '/norestart'], { windowsHide: true })
      p.on('close', resolve)
      p.on('error', () => resolve(-1))
    })
    if (code !== 0 && code !== 3010) throw new Error(`msiexec terminou com código ${code}`)
  } finally {
    await fs.rm(dest, { force: true }).catch(() => {})
  }
}

ipcMain.handle('setup:installWinget', async (event, appIds) => {
  if (!Array.isArray(appIds) || appIds.length === 0) return { ok: false, error: 'Lista vazia' };
  // The window may be closed mid-queue; a send on a destroyed webContents would reject the handler.
  const progress = (msg) => {
    try { if (!event.sender.isDestroyed()) event.sender.send('setup:installProgress', msg) } catch {}
  };

  const ghIds = appIds.map((id) => String(id ?? '').trim()).filter((id) => id.startsWith('gh:') && GITHUB_RELEASE_APPS.has(id.slice(3)));
  const validIds = appIds.map((id) => String(id ?? '').trim()).filter(isValidWingetId);
  const rejectedCount = appIds.length - validIds.length - ghIds.length;
  if (validIds.length === 0 && ghIds.length === 0) return { ok: false, error: 'Nenhum ID de aplicativo válido informado' };
  if (rejectedCount > 0) {
    progress(`[AppStore] ${rejectedCount} ID(s) inválido(s) foram ignorados.`);
  }

  progress(`[AppStore] Iniciando fila de ${validIds.length + ghIds.length} aplicativos...`);

  for (const id of ghIds) {
    const repo = id.slice(3)
    progress(`[AppStore] Preparando: ${repo} (GitHub)...`)
    try {
      await installGithubReleaseMsi(repo, progress)
      progress(`[AppStore] ${repo} instalado com sucesso!`)
    } catch (err) {
      progress(`[AppStore] FALHA: ${repo}: ${err?.message ?? err}`)
    }
  }

  for (const id of validIds) {
    progress(`[AppStore] Preparando: ${id}...`);

    const tryInstall = (provider, command, args) => {
      return new Promise((resolve) => {
        progress(`[${provider}] Baixando/Instalando ${id}...`);
        const p = spawn(command, args, { windowsHide: true });
        p.stdout.on('data', d => {
          const txt = d.toString().trim();
          if (txt) progress(`[${provider}] ${txt}`);
        });
        p.stderr?.resume(); // drain stderr so a chatty installer can't stall on a full pipe
        p.on('close', (code) => resolve(code === 0));
        p.on('error', () => resolve(false));
      });
    };

    let success = await tryInstall('Winget', 'winget', ['install', '-e', '--id', id, '--accept-package-agreements', '--accept-source-agreements', '--silent']);

    if (!success) {
      progress(`[Winget] Falhou para ${id}. Tentando via Chocolatey...`);

      const chocoId = id.split('.').pop().toLowerCase();
      if (isValidWingetId(chocoId)) {
        success = await tryInstall('Choco', 'choco', ['install', chocoId, '-y']);
      }
    }

    if (success) {
      progress(`[AppStore] ${id} instalado com sucesso!`);
    } else {
      progress(`[AppStore] FALHA TOTAL: Não foi possível instalar ${id} por nenhum provedor.`);
    }
  }

  progress(`[AppStore] Fila concluída!`);
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
  // started without administrator (manifest bypassed): reopen through UAC before any window exists
  {
    const { ensureElevated } = await import('./services/ensureElevated.js')
    const Elevation = (await import('./services/optimizer/ElevationHelper.js')).default
    if (!(await ensureElevated({ app, dialog, isElevated: () => Elevation.isElevated(), log }))) return
  }
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
          }).catch((err) => log.warn('[overlay] toggle failed:', err?.message ?? String(err)))
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

    if (liveServices.latencyGuardian === false) latencyServiceState = 'disabled'
    if (liveServices.latencyGuardian !== false) {
      try {
        log.info('[startup-bg] registering latency guardian')
        const { registerLatencyGuardian } = await import('./latencyGuardian.js')
        for (const ch of LATENCY_CHANNELS) ipcMain.removeHandler(ch)
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
        latencyServiceState = 'ready'
        log.info('[startup-bg] latency guardian ready')
      } catch (err) {
        log.warn('[startup-bg] latency guardian failed:', err?.message ?? String(err))
        latencyServiceState = 'failed'
        for (const ch of LATENCY_CHANNELS) {
          try { ipcMain.removeHandler(ch) } catch {}
          ipcMain.handle(ch, async () => ({ ok: false, error: 'latency-service-failed' }))
        }
      }
    }

    if (liveServices.overlay !== false) {

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

  }

  // Library covers live in the app's own folder: always readable (the renderer never picks them through a dialog).
  grantDirectoryPath(path.join(app.getPath('userData'), 'covers'))
  protocol.registerFileProtocol('local-resource', (request, callback) => {
    let url = request.url.replace(/^local-resource:\/\//, '').replace(/[?#].*$/, '')

    if (url.match(/^\/[a-zA-Z]:/)) {
      url = url.slice(1)
    } else if (url.match(/^[a-zA-Z]\//)) {
      // a standard scheme parses "C:\x" as host "c": put the drive colon back
      url = url.charAt(0) + ':' + url.slice(1)
    }
    try {
      const resolved = decodeURIComponent(url)
      if (!path.isAbsolute(resolved) || !hasFileAccessGrant(resolved)) return callback(403)
      return callback(resolved)
    } catch (error) {
      log.warn('[local-resource] request failed:', error?.message ?? String(error))
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
    if (!win) return
    // Honour the "close to tray" setting for the custom title-bar button too; win.close() goes
    // through the 'close' handler, which quits when the setting is off.
    if (closeToTrayEnabled) hideWindowToBackground(win)
    else win.close()
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
  try { void downloadsService?.shutdown() } catch {}
  try {
    UpdateService.destroy()
  } catch {}
  try {
    HardwareService.teardown()
  } catch {}
  // Graceful STOP so the frame limiter resets its cap instead of being hard-killed.
  try { void Promise.resolve(FramePacerEngine.stop()).catch(() => {}) } catch {}
  try {
    if (fsRaw.existsSync(PROCS_FLAG)) fsRaw.unlinkSync(PROCS_FLAG)
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
