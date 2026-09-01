

import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import Logger from './LoggerService.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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
      low01Percent: 0,
      currentFrametimeMs: 0,
      frametimeJitterMs: 0,
      stutterCount: 0,
      activeGame: 'Nenhum Jogo Detectado',
      driverMethod: '',
      driverFps: 0,
      history: []
    }
  }

  start({ targetFps = 144, pacingMode = 'flatline' } = {}) {
    if (this.isRunning) {
      this.updateConfig({ targetFps, pacingMode })
      return { ok: true, isRunning: true, targetFps: this.targetFps, pacingMode: this.pacingMode }
    }

    this.isRunning = true
    this.targetFps = Number(targetFps) || 144
    this.pacingMode = pacingMode || 'flatline'

    Logger.info('FramePacerEngine', `Iniciando motor nativo C# - Alvo: ${this.targetFps} FPS, Modo: ${this.pacingMode}`)

    this._spawnNativeProcess()

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

  updateConfig({ targetFps, pacingMode } = {}) {
    if (typeof targetFps === 'number' && targetFps >= 0) {
      this.targetFps = targetFps
    }
    if (pacingMode && ['flatline', 'reflex', 'uncapped'].includes(pacingMode)) {
      this.pacingMode = pacingMode
    }

    Logger.info('FramePacerEngine', `Atualizando: ${this.targetFps} FPS (${this.pacingMode})`)

    if (this._nativeProcess && this._nativeProcess.stdin && !this._nativeProcess.stdin.destroyed) {
      try {
        const config = JSON.stringify({ targetFps: this.targetFps, pacingMode: this.pacingMode })
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
      pacingMode: this.pacingMode
    }
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
      Logger.info('FramePacerEngine', `Executável nativo: ${exePath}`)

      this._nativeProcess = spawn(exePath, [
        String(this.targetFps),
        String(this.pacingMode)
      ], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      let buffer = ''

      this._nativeProcess.stdout.on('data', (data) => {
        buffer += data.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) continue
          try {
            const parsed = JSON.parse(trimmed)
            if (parsed && typeof parsed.currentFps === 'number') {
              this._latestMetrics = {
                ...parsed,
                isRunning: this.isRunning
              }
              this.emit('metrics', this._latestMetrics)
            }
          } catch {}
        }
      })

      this._nativeProcess.stderr.on('data', (err) => {
        Logger.warn('FramePacerEngine', `Native stderr: ${err.toString().trim()}`)
      })

      this._nativeProcess.on('exit', (code) => {
        Logger.info('FramePacerEngine', `Processo nativo encerrado (code ${code})`)
        if (this.isRunning) {

          setTimeout(() => {
            if (this.isRunning) this._spawnNativeProcess()
          }, 2000)
        }
      })

      this._nativeProcess.on('error', (err) => {
        Logger.error('FramePacerEngine', `Falha ao iniciar processo nativo: ${err.message}`)
      })
    } catch (err) {
      Logger.error('FramePacerEngine', `Exceção ao spawnar processo nativo: ${err.message}`)
    }
  }

  _killNativeProcess() {
    if (this._nativeProcess) {
      try {

        if (this._nativeProcess.stdin && !this._nativeProcess.stdin.destroyed) {
          this._nativeProcess.stdin.write('STOP\n')
        }

        setTimeout(() => {
          try {
            if (this._nativeProcess) this._nativeProcess.kill('SIGTERM')
          } catch {}
        }, 500)
      } catch {}
      this._nativeProcess = null
    }
  }
}

export default new FramePacerEngine()
