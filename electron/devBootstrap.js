// Dev-only bootstrap. Imported FIRST by main.js so it runs before any other module touches userData or
// registers IPC handlers. In a packaged build this file does nothing.
//
// 1. Separate profile (userData "-dev"): the dev app gets its own single-instance lock, so it runs next to an
//    installed DarkHub, and never reads or writes the real config / vault / library.
// 2. IPC trace: every ipcMain.handle call is timed and reported (terminal + in-app "Dev Trace" panel) with the
//    channel, duration, ok/error and a redacted preview of the arguments.
import { app, ipcMain, BrowserWindow } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

const IS_DEV = !app.isPackaged
const MAX_HISTORY = 500
const history = []
const listeners = new Map() // channel -> raw handler, used by the dev self-test
let seq = 0

// High-frequency polling channels: still traced, but flagged so the panel can hide them by default.
const NOISY = new Set([
  'hardware:startPolling', 'system:getMetrics', 'system:getLiveStats', 'app:getResourceUsage', 'framepacer:getMetrics',
  'latency:getConfig', 'latency:getStatus', 'autoclicker:getStatus', 'downloads:list', 'dev:getTrace'
])
const SECRET_KEY = /pass(word)?|secret|token|master|recovery|mnemonic|key$/i

function preview(value, depth = 0) {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') return value.length > 160 ? `${value.slice(0, 160)}…(${value.length})` : value
  if (depth > 2) return '…'
  if (Array.isArray(value)) return value.slice(0, 10).map((v) => preview(v, depth + 1)).concat(value.length > 10 ? [`…+${value.length - 10}`] : [])
  if (typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value).slice(0, 20)) out[k] = SECRET_KEY.test(k) ? '***' : preview(v, depth + 1)
    return out
  }
  return String(value)
}

function emit(entry) {
  history.push(entry)
  if (history.length > MAX_HISTORY) history.shift()
  if (!entry.noisy || !entry.ok) {
    const mark = entry.ok ? '\x1b[32mOK \x1b[0m' : '\x1b[31mERR\x1b[0m'
    const err = entry.ok ? '' : `  -> ${entry.error}`
    console.log(`[ipc] ${mark} ${entry.channel.padEnd(38)} ${String(entry.ms).padStart(6)} ms${err}`)
  }
  for (const w of BrowserWindow.getAllWindows()) {
    try { if (!w.isDestroyed()) w.webContents.send('dev:ipcTrace', entry) } catch {}
  }
}

if (IS_DEV) {
  try {
    const base = app.getPath('userData')
    // Self-test runs beside a live dev window, so it needs its own profile (and single-instance lock).
    const suffix = process.env.DARKHUB_SELFTEST ? '-selftest' : '-dev'
    if (!base.endsWith(suffix)) app.setPath('userData', `${base}${suffix}`)
    app.setPath('sessionData', path.join(app.getPath('userData'), 'session'))
  } catch {}

  const originalHandle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = (channel, listener) => { listeners.set(channel, listener); return originalHandle(channel, async (event, ...args) => {
    const started = performance.now()
    const base = { id: ++seq, channel, at: Date.now(), noisy: NOISY.has(channel), args: preview(args) }
    try {
      const result = await listener(event, ...args)
      const failed = result && typeof result === 'object' && result.ok === false
      emit({ ...base, ms: Math.round(performance.now() - started), ok: !failed,
        error: failed ? String(result.error ?? result.message ?? 'ok:false') : undefined, result: preview(result) })
      return result
    } catch (err) {
      emit({ ...base, ms: Math.round(performance.now() - started), ok: false, threw: true, error: err?.message ?? String(err) })
      throw err
    }
  }) }

  // A covered window stops painting (native occlusion) and capturePage returns a stale frame: off for the self-test.
  if (process.env.DARKHUB_SELFTEST) app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
  if (process.env.DARKHUB_SELFTEST) app.whenReady().then(() => import('./devSelfTest.js')).then((m) => m.run(listeners)).catch((e) => { console.error('[selftest]', e); app.exit(1) })

  // Remember the screen (#hash) so scripts/dev.mjs reopens it after an automatic restart.
  const stateFile = process.env.DARKHUB_DEV_STATE
  if (stateFile) {
    app.on('web-contents-created', (_e, contents) => {
      contents.on('did-navigate-in-page', (_ev, url) => {
        const page = (String(url).split('#')[1] || '').replace(/[^\w-]/g, '')
        try { fs.writeFileSync(stateFile, page) } catch {}
      })
    })
  }

  originalHandle('dev:getTrace', () => history.slice())
  originalHandle('dev:clearTrace', () => { history.length = 0; return { ok: true } })
}

export const devHistory = history
export const devStartPage = IS_DEV ? (process.env.DARKHUB_PAGE || '').replace(/[^\w-]/g, '') : ''
export default IS_DEV
