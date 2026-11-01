// AI enhancement of screenshots with Real-ESRGAN (ncnn + Vulkan: runs on any NVIDIA/AMD/Intel GPU, offline).
// The binary and models ship inside the installer (resources/realesrgan, fetched at build time by
// scripts/fetch-realesrgan.ps1). The original screenshot is never touched: the result is "<name>_ultra.png" beside it.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const MODELS = { photo: 'realesrgan-x4plus', anime: 'realesrgan-x4plus-anime', fast2: 'realesr-animevideov3-x2', fast4: 'realesr-animevideov3-x4' }
// Larger outputs are reduced to 2x: a 4x full-screen 1440p shot would be 10240x5760 and over 100 MB.
const MAX_LONG_SIDE = 8192

export function defaultDir() {
  const here = path.dirname(fileURLToPath(import.meta.url))
  if (/app\.asar/.test(here) && process.resourcesPath) return path.join(process.resourcesPath, 'realesrgan')
  return path.join(here, '..', '..', '..', 'vendor', 'realesrgan')
}

/**
 * Which model and scale to use. 'fast' is the compact model (a few seconds even with a game using the GPU); 'max' is
 * the large model (sharper textures, but 10-60+ s with a game using the GPU, mostly model start-up). Small shots (areas) come out at 4x, full
 * screens at 2x so the file stays reasonable. Pure.
 */
export function planEnhance({ width, height, region = false, quality = 'fast', style = 'photo' }) {
  const long = Math.max(width, height)
  const small = region || long <= 1200
  const out = small && long * 4 <= MAX_LONG_SIDE ? 4 : 2
  if (quality === 'max') return { model: style === 'anime' ? MODELS.anime : MODELS.photo, scale: 4, outScale: out }
  return out === 4 ? { model: MODELS.fast4, scale: 4, outScale: 4 } : { model: MODELS.fast2, scale: 2, outScale: 2 }
}

/** "98,08%" / "98.08%" (the CLI prints the locale's decimal separator) -> 98.08. Pure. */
export function parseProgress(line) {
  const m = /(\d{1,3}(?:[.,]\d+)?)%/.exec(String(line))
  return m ? Math.min(100, Number(m[1].replace(',', '.'))) : null
}

export function buildArgs(dir, input, output, model, scale) {
  return ['-i', input, '-o', output, '-n', model, '-s', String(scale), '-m', path.join(dir, 'models'), '-f', 'png']
}

export const ultraName = (file) => file.replace(/(_ultra)?\.png$/i, '') + '_ultra.png'

export class AiUpscaler {
  constructor({ dir = defaultDir(), spawnImpl = spawn, sharpImpl = null } = {}) {
    this.dir = dir
    this.spawn = spawnImpl
    this.sharpImpl = sharpImpl
    this.queue = Promise.resolve()
  }

  exe() { return path.join(this.dir, 'realesrgan-ncnn-vulkan.exe') }
  available() { return fs.existsSync(this.exe()) && fs.existsSync(path.join(this.dir, 'models', `${MODELS.photo}.param`)) }

  async sharp() {
    if (this.sharpImpl) return this.sharpImpl
    return (await import('sharp')).default
  }

  _run(args, onProgress) {
    return new Promise((resolve, reject) => {
      const child = this.spawn(this.exe(), args, { cwd: this.dir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      // below normal: a game in front keeps the CPU (the GPU work is shared either way)
      try { if (child.pid) os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL) } catch { /* not allowed */ }
      let tail = ''
      let last = -1
      const onData = (d) => {
        const s = String(d)
        tail = (tail + s).slice(-2000)
        for (const line of s.split(/\r?\n|\r/)) {
          const p = parseProgress(line)
          if (p !== null && Math.floor(p) !== last) { last = Math.floor(p); try { onProgress(p) } catch { /* listener gone */ } }
        }
      }
      child.stdout?.on('data', onData)
      child.stderr?.on('data', onData)
      child.on('error', reject)
      child.on('close', (code) => {
        if (code === 0) return resolve()
        const gpu = /vkCreateInstance|vulkan|no gpu|invalid gpu/i.test(tail)
        reject(new Error(gpu ? 'A placa de vídeo não oferece Vulkan (atualize o driver de vídeo).' : `Real-ESRGAN terminou com código ${code}: ${tail.trim().split(/\r?\n/).pop() || ''}`))
      })
    })
  }

  /**
   * Enhances `file` into `<name>_ultra.png`. One job at a time (the GPU is shared with the game).
   * Resolves { file, width, height, ms, model, scale }.
   */
  enhance(file, { region = false, quality = 'fast', style = 'photo' } = {}, onProgress = () => {}) {
    const job = this.queue.then(() => this._enhance(file, { region, quality, style }, onProgress))
    this.queue = job.catch(() => {})
    return job
  }

  async _enhance(file, opts, onProgress) {
    if (!this.available()) throw new Error('O aprimorador por IA não está instalado nesta cópia do DarkHub.')
    const started = Date.now()
    const sharp = await this.sharp()
    const meta = await sharp(file).metadata()
    const plan = planEnhance({ width: meta.width, height: meta.height, ...opts })
    const out = ultraName(file)
    const tmp = out.replace(/\.png$/i, '.tmp.png')
    try {
      await this._run(buildArgs(this.dir, file, tmp, plan.model, plan.scale), onProgress)
      if (!fs.existsSync(tmp)) throw new Error('O Real-ESRGAN não gerou a imagem.')
      const w = meta.width * plan.outScale
      const h = meta.height * plan.outScale
      if (plan.outScale !== plan.scale) await sharp(tmp).resize(w, h, { kernel: 'lanczos3' }).png({ compressionLevel: 6 }).toFile(out)
      else fs.renameSync(tmp, out)
      return { file: out, width: w, height: h, ms: Date.now() - started, model: plan.model, scale: plan.outScale }
    } finally {
      try { fs.unlinkSync(tmp) } catch { /* moved or never written */ }
    }
  }
}

export default AiUpscaler
