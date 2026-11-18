

import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import Logger from './LoggerService.js'
import { integrityError, TAMPERED_MESSAGE } from './binaryIntegrity.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PACING_MODES = ['flatline', 'reflex', 'uncapped']

class FramePacerEngine extends EventEmitter {
  constructor() {
    super()
    this.isRunning = false
    this.targetFps = 144
    this.pacingMode = 'flatline'
    this._nativeProcess = null
    this._latestMetrics = {
      isRunning: false,
      targetFps: 144,
      pacingMode: 'flatline',
      targetFrametimeMs: 6.94,
      currentFps: 0,
      avgFps: 0,
      low1Percent: 0,
      low01Percent: null,
      hasLiveTelemetry: false,
      currentFrametimeMs: 0,
      frametimeJitterMs: 0,
      stutterCount: 0,
      activeGame: 'Nenhum Jogo Detectado',
      driverMethod: '',
      driverFps: 0,
      history: []
    }
  }

  start({ targetFps = 144, pacingMode = 'flatline', adapterLuid } = {}) {
    if (this.isRunning) {
      this.updateConfig({ targetFps, pacingMode, adapterLuid })
      return { ok: true, isRunning: true, targetFps: this.targetFps, pacingMode: this.pacingMode }
    }

    this.isRunning = true
    // 0 means unlimited: only a missing/invalid value falls back to 144
    const fps = Number(targetFps)
    this.targetFps = Number.isFinite(fps) && fps >= 0 ? fps : 144
    this.pacingMode = PACING_MODES.includes(pacingMode) ? pacingMode : 'flatline'
    this._crashTimes = []
    this.lastError = null
    const luid = normalizeAdapterLuid(adapterLuid)
    if (luid !== null) this.adapterLuid = luid

    Logger.info('FramePacerEngine', `Iniciando motor nativo C# - Alvo: ${this.targetFps} FPS, Modo: ${this.pacingMode}`)

    this._spawnNativeProcess()
    if (!this.isRunning) return { ok: false, isRunning: false, error: this.lastError }

    this.emit('status', {
      isRunning: true,
      targetFps: this.targetFps,
      pacingMode: this.pacingMode
    })

    return { ok: true, isRunning: true, targetFps: this.targetFps, pacingMode: this.pacingMode }
  }

  stop() {
    if (!this.isRunning) return { ok: true, isRunning: false }
    this.isRunning = false

    this._killNativeProcess()

    this._latestMetrics.isRunning = false
    Logger.info('FramePacerEngine', 'Motor parado. FRTC resetado pelo processo nativo.')
    this.emit('status', { isRunning: false })
    return { ok: true, isRunning: false }
  }

  updateConfig({ targetFps, pacingMode, adapterLuid } = {}) {
    if (typeof targetFps === 'number' && targetFps >= 0) {
      this.targetFps = targetFps
    }
    if (pacingMode && PACING_MODES.includes(pacingMode)) {
      this.pacingMode = pacingMode
    }
    // Optional: pace only swap chains rendered by this adapter (DXGI LUID as up to 16 hex digits,
    // HighPart then LowPart; '' or '0' = any adapter). OpenGL cannot be attributed to an adapter,
    // so with a LUID selected OpenGL games are not limited.
    const luid = normalizeAdapterLuid(adapterLuid)
    if (luid !== null) this.adapterLuid = luid

    Logger.info('FramePacerEngine', `Atualizando: ${this.targetFps} FPS (${this.pacingMode})`)

    if (this._nativeProcess && this._nativeProcess.stdin && !this._nativeProcess.stdin.destroyed) {
      try {
        const config = JSON.stringify({ targetFps: this.targetFps, pacingMode: this.pacingMode, adapterLuid: this.adapterLuid || '0' })
        this._nativeProcess.stdin.write(config + '\n')
      } catch (err) {
        Logger.warn('FramePacerEngine', `Falha ao enviar config para processo nativo: ${err.message}`)

        this._killNativeProcess()
        this._spawnNativeProcess()
      }
    }

    return { ok: true, targetFps: this.targetFps, pacingMode: this.pacingMode }
  }

  getMetrics() {
    return {
      ...this._latestMetrics,
      isRunning: this.isRunning,
      targetFps: this.targetFps,
      pacingMode: this.pacingMode,
      error: this.lastError || null
    }
  }

  /** The limiter cannot run (spawn failed, crash loop): stop reporting it as running and say why. */
  _failStop(message) {
    this.isRunning = false
    this.lastError = message
    this._latestMetrics.isRunning = false
    Logger.error('FramePacerEngine', message)
    this.emit('status', { isRunning: false, error: message })
  }

  _getExePath() {
    const unpackedFromDirname = path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), 'DarkHub.FrameLimiter.exe')
    const unpackedFromResources = process.resourcesPath
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'services', 'DarkHub.FrameLimiter.exe')
      : null
    const directFromDirname = path.join(__dirname, 'DarkHub.FrameLimiter.exe')
    const devRelative = path.join(__dirname, '..', '..', 'electron', 'services', 'DarkHub.FrameLimiter.exe')

    const candidates = [
      unpackedFromDirname,
      unpackedFromResources,
      directFromDirname,
      devRelative
    ].filter(Boolean)

    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) return p
      } catch {}
    }

    return directFromDirname
  }

  _spawnNativeProcess() {
    try {
      const exePath = this._getExePath()
      // the limiter injects DarkHub.PacerHook into games (through PacerInject for 32-bit ones): all of them must be the shipped files
      const tampered = integrityError(['DarkHub.FrameLimiter.exe', 'DarkHub.PacerHook.x64.dll', 'DarkHub.PacerHook.x86.dll', 'DarkHub.PacerInject.x86.exe'], { log: (m) => Logger.warn('FramePacerEngine', m) })
      if (tampered) {
        Logger.error('FramePacerEngine', tampered)
        if (this.isRunning) this._failStop(TAMPERED_MESSAGE)
        return
      }
      Logger.info('FramePacerEngine', `Executável nativo: ${exePath}`)

      const proc = spawn(exePath, [
        String(this.targetFps),
        String(this.pacingMode),
        '--adapter-luid',
        this.adapterLuid || '0'
      ], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      })
      this._nativeProcess = proc
      registerExitKill(this)
      // EPIPE when the limiter dies between writes must not crash main.
      proc.stdin?.on('error', () => {})

      let buffer = ''
      proc.stdout.setEncoding?.('utf8') // stream decoding: no U+FFFD when a multibyte char is split across chunks

      proc.stdout.on('data', (data) => {
        buffer += data.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) continue
          try {
            const parsed = JSON.parse(trimmed)
            if (parsed && typeof parsed.isRunning === 'boolean') {
              this._latestMetrics = {
                ...parsed,
                isRunning: this.isRunning
              }
              this.emit('metrics', this._latestMetrics)
            }
          } catch {}
        }
      })

      proc.stderr.on('data', (err) => {
        Logger.warn('FramePacerEngine', `Native stderr: ${err.toString().trim()}`)
      })

      proc.on('exit', (code) => {
        Logger.info('FramePacerEngine', `Processo nativo encerrado (code ${code})`)
        if (this._nativeProcess === proc) this._nativeProcess = null
        if (proc._intentionalStop) return
        if (this.isRunning) {
          // Back off on crash loops (missing runtime, AV quarantine) instead of
          // respawning every 2 s forever.
          const nowTs = Date.now()
          this._crashTimes = (this._crashTimes || []).filter((t) => nowTs - t < 60_000)
          this._crashTimes.push(nowTs)
          if (this._crashTimes.length > 5) {
            this._failStop(`Processo nativo caiu repetidamente (code ${code}); limitador parado.`)
            return
          }
          setTimeout(() => {
            if (this.isRunning && !this._nativeProcess) this._spawnNativeProcess()
          }, 2000)
        }
      })

      proc.on('error', (err) => {
        if (this._nativeProcess === proc) this._nativeProcess = null
        // spawn failure (missing exe, blocked by AV): no respawn from the 'exit' handler, report it stopped
        proc._intentionalStop = true
        if (this.isRunning) this._failStop(`Falha ao iniciar processo nativo: ${err.message}`)
      })
    } catch (err) {
      if (this.isRunning) this._failStop(`Exceção ao spawnar processo nativo: ${err.message}`)
    }
  }

  _killNativeProcess() {
    const proc = this._nativeProcess
    this._nativeProcess = null
    if (!proc) return
    proc._intentionalStop = true
    try {
      if (proc.stdin && !proc.stdin.destroyed) {
        proc.stdin.write('STOP\n')
      }
    } catch {}
    const timer = setTimeout(() => {
      try { proc.kill('SIGTERM') } catch {}
    }, 500)
    proc.once?.('exit', () => clearTimeout(timer))
  }

  /** Synchronous hard kill for process 'exit' (no time for the STOP handshake). */
  _killSync() {
    const proc = this._nativeProcess
    this._nativeProcess = null
    this.isRunning = false
    if (proc && proc.exitCode === null && !proc.killed) {
      proc._intentionalStop = true
      try { proc.kill() } catch {}
    }
  }
}

/** '' / '0' / undefined-free normaliser for the adapter filter. Returns null for invalid input. */
export function normalizeAdapterLuid(v) {
  if (v === undefined || v === null) return null
  const s = String(v).trim().replace(/^0x/i, '').toLowerCase()
  if (s === '') return '0'
  return /^[0-9a-f]{1,16}$/.test(s) ? s : null
}

let exitKillRegistered = false
function registerExitKill(engine) {
  if (exitKillRegistered) return
  exitKillRegistered = true
  // Windows does not kill children with the parent; avoid an orphaned limiter
  // that keeps capping FPS after DarkHub quits or crashes.
  process.once('exit', () => engine._killSync())
}

export default new FramePacerEngine()
