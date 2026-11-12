// Image conversion. Every input is first opened as a sharp pipeline (directly, or after decoding it with the right
// engine), then written by the engine that owns the output format:
//   sharp/libvips  JPEG PNG WebP AVIF TIFF GIF SVG(read)                      in-process
//   FFmpeg         BMP TGA PSD EXR HDR PCX SGI QOI JPEG2000 PNM DDS(BC1-5)     already shipped with the app
//   texconv        DDS read/write incl. BC1-BC7, mipmaps                       vendor/imagetools (MIT, Microsoft)
//   LibRaw         camera RAW (CR2/CR3/NEF/ARW/DNG/...)                        vendor/imagetools (LGPL-2.1/CDDL)
//   libheif (wasm) HEIC/HEIF read                                              npm heic-decode (LGPL-3.0, wasm)
//   libjxl (wasm)  JPEG XL read/write                                          npm @jsquash/jxl (Apache-2.0)
//   imageCodecs    ICO/CUR read/write, BMP write                               pure JS
import path from 'node:path'
import fs from 'node:fs/promises'
import fsRaw from 'node:fs'
import os from 'node:os'
import { createRequire } from 'node:module'
import { run, uniqueOutputPath, mapLimit, extOf } from './processUtil.js'
import { encodeBmp, encodeIco, decodeIcoBest } from './imageCodecs.js'
import { texconvPath, dcrawPath } from './vendorTools.js'

const require = createRequire(import.meta.url)

export const SHARP_INPUT = ['jpg', 'jpeg', 'jpe', 'jfif', 'png', 'webp', 'avif', 'tif', 'tiff', 'gif', 'svg', 'svgz']
export const FFMPEG_INPUT = ['bmp', 'dib', 'tga', 'icb', 'vda', 'vst', 'psd', 'exr', 'hdr', 'pic', 'pcx', 'sgi', 'rgb', 'rgba', 'bw', 'qoi', 'jp2', 'j2k', 'jpx', 'j2c', 'pbm', 'pgm', 'ppm', 'pnm', 'pam', 'pfm', 'xbm', 'xwd', 'ras', 'sun', 'dpx']
export const RAW_INPUT = ['cr2', 'cr3', 'crw', 'nef', 'nrw', 'arw', 'srf', 'sr2', 'dng', 'orf', 'rw2', 'raf', 'pef', 'srw', 'x3f', '3fr', 'erf', 'kdc', 'mrw', 'mos', 'iiq', 'rwl', 'dcr', 'raw']
export const IMAGE_INPUT = [...SHARP_INPUT, 'heic', 'heif', 'jxl', 'ico', 'cur', 'dds', ...FFMPEG_INPUT, ...RAW_INPUT]

export const IMAGE_OUTPUT = ['png', 'jpg', 'webp', 'avif', 'jxl', 'tiff', 'gif', 'bmp', 'ico', 'cur', 'dds', 'tga', 'exr', 'hdr', 'qoi', 'jp2', 'ppm', 'pcx']

/** DDS encodings offered; `srgb` adds the _SRGB variant where the format has one. */
export const DDS_FORMATS = {
  BC1: { dx: 'BC1_UNORM', srgb: true }, // RGB + 1-bit alpha, 4 bpp
  BC3: { dx: 'BC3_UNORM', srgb: true }, // RGBA, 8 bpp
  BC4: { dx: 'BC4_UNORM', srgb: false }, // grayscale / single channel
  BC5: { dx: 'BC5_UNORM', srgb: false }, // two channels (normal maps)
  BC6H: { dx: 'BC6H_UF16', srgb: false }, // HDR RGB
  BC7: { dx: 'BC7_UNORM', srgb: true }, // high quality RGBA, 8 bpp
  RGBA: { dx: 'R8G8B8A8_UNORM', srgb: true } // uncompressed
}

/** texconv -f value for a DDS option set. */
export function ddsFormatArg(format = 'BC7', srgb = true) {
  const f = DDS_FORMATS[String(format).toUpperCase()] || DDS_FORMATS.BC7
  return f.srgb && srgb ? `${f.dx}_SRGB` : f.dx
}

/** FFmpeg encoder args for formats written through FFmpeg (input is an sRGB PNG on stdin). */
export function ffmpegImageEncodeArgs(format) {
  // EXR and Radiance HDR hold linear light: undo the sRGB curve instead of storing gamma-encoded values.
  const toLinear = 'zscale=tin=iec61966-2-1:t=linear:npl=100'
  switch (format) {
    case 'tga': return ['-c:v', 'targa']
    case 'exr': return ['-vf', `${toLinear},format=gbrapf32le`, '-c:v', 'exr', '-compression', 'zip16', '-format', 'half']
    case 'hdr': return ['-vf', `${toLinear},format=gbrpf32le`, '-c:v', 'hdr']
    case 'qoi': return ['-c:v', 'qoi']
    case 'jp2': return ['-c:v', 'libopenjpeg', '-pix_fmt', 'rgba']
    case 'ppm': return ['-c:v', 'ppm', '-pix_fmt', 'rgb24']
    case 'pcx': return ['-c:v', 'pcx', '-pix_fmt', 'rgb24']
    default: throw new Error(`no ffmpeg encoder for ${format}`)
  }
}

/** FFmpeg input options for formats that need tone handling when decoded to 8-bit sRGB. */
export function ffmpegImageDecodeArgs(ext) {
  if (ext === 'exr') return { pre: ['-apply_trc', 'iec61966_2_1'], vf: [] }
  if (ext === 'hdr' || ext === 'pfm') return { pre: [], vf: ['-vf', 'zscale=tin=linear:t=iec61966-2-1:npl=100,format=rgba'] }
  return { pre: [], vf: [] }
}

let jxlDec = null
let jxlEnc = null
async function jxlModules() {
  if (!globalThis.ImageData) {
    globalThis.ImageData = class ImageData {
      constructor(data, width, height) { this.data = data; this.width = width; this.height = height }
    }
  }
  const base = path.dirname(require.resolve('@jsquash/jxl/package.json'))
  if (!jxlDec) {
    const mod = await import('@jsquash/jxl/decode.js')
    await mod.init(await WebAssembly.compile(await fs.readFile(path.join(base, 'codec', 'dec', 'jxl_dec.wasm'))))
    jxlDec = mod.default
  }
  if (!jxlEnc) {
    const mod = await import('@jsquash/jxl/encode.js')
    await mod.init(await WebAssembly.compile(await fs.readFile(path.join(base, 'codec', 'enc', 'jxl_enc.wasm'))))
    jxlEnc = mod.default
  }
  return { decode: jxlDec, encode: jxlEnc }
}

async function decodeHeic(buffer) {
  const decode = require('heic-decode')
  const img = await decode({ buffer })
  return { raw: Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), width: img.width, height: img.height }
}

function tail(stderr) {
  return String(stderr || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(-2).join(' | ').slice(0, 400)
}

export function createImageConverter({ getSharp, getFfmpegPath, getExiftool, logger } = {}) {
  async function ffmpegDecode(file, ext, job) {
    const ff = await getFfmpegPath()
    if (!ff) throw new Error('FFmpeg not available')
    const { pre, vf } = ffmpegImageDecodeArgs(ext)
    const r = await run(ff, ['-hide_banner', '-nostdin', '-loglevel', 'error', ...pre, '-i', file, '-frames:v', '1', ...vf,
      '-f', 'image2pipe', '-c:v', 'png', '-pix_fmt', 'rgba', 'pipe:1'], { job, timeoutMs: 120000 })
    if (r.code !== 0 || !r.stdout.length) throw new Error(tail(r.stderr) || 'ffmpeg could not decode the image')
    return r.stdout
  }

  async function texconvDecode(file, tmp, job) {
    const exe = texconvPath()
    if (!exe) return null
    const r = await run(exe, ['-nologo', '-y', '-ft', 'png', '-o', tmp, file], { job, timeoutMs: 120000 })
    const out = path.join(tmp, `${path.basename(file, path.extname(file))}.png`)
    if (r.code !== 0 || !fsRaw.existsSync(out)) throw new Error(tail(r.stdout.toString()) || 'texconv could not read the DDS')
    return fs.readFile(out)
  }

  async function rawDecode(file, job) {
    const exe = dcrawPath()
    if (exe) {
      // -w camera white balance, -o 1 sRGB, -q 3 AHD demosaic, -T TIFF, -Z - to stdout
      const r = await run(exe, ['-w', '-o', '1', '-q', '3', '-T', '-Z', '-', file], { job, timeoutMs: 180000 })
      if (r.code === 0 && r.stdout.length > 1024) return r.stdout
      logger?.warn?.('Converter', `dcraw_emu failed for ${file}: ${tail(r.stderr)}`)
    }
    // Fallback: the full-size JPEG most cameras embed in the RAW.
    const et = await getExiftool?.()
    if (!et) throw new Error('RAW decoder not available')
    const tmp = path.join(os.tmpdir(), `dh-raw-${process.pid}-${Date.now()}.jpg`)
    try {
      await et.extractJpgFromRaw(file, tmp).catch(() => et.extractPreview(file, tmp))
      return await fs.readFile(tmp)
    } finally { await fs.rm(tmp, { force: true }).catch(() => {}) }
  }

  /** Opens any supported image as a sharp pipeline. */
  async function open(file, { animated = false, density = 0, tmp, job } = {}) {
    const sharp = await getSharp()
    const ext = extOf(file)
    const opts = { failOn: 'none', limitInputPixels: 0x3fff * 0x3fff }
    if (SHARP_INPUT.includes(ext)) {
      return sharp(file, { ...opts, animated: animated && (ext === 'gif' || ext === 'webp'), ...(density ? { density } : {}) })
    }
    if (ext === 'heic' || ext === 'heif') {
      // libheif-js carries the HEVC decoder (libde265) that sharp's prebuilt libheif leaves out; a .heif that holds
      // AV1 (AVIF-in-HEIF) is the case it cannot read, and sharp can.
      try {
        const d = await decodeHeic(await fs.readFile(file))
        return sharp(d.raw, { raw: { width: d.width, height: d.height, channels: 4 } })
      } catch (err) {
        const s = sharp(file, opts)
        await s.clone().raw().toBuffer().catch(() => { throw err })
        return s
      }
    }
    if (ext === 'jxl') {
      const { decode } = await jxlModules()
      const img = await decode(await fs.readFile(file))
      return sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), { raw: { width: img.width, height: img.height, channels: 4 } })
    }
    if (ext === 'ico' || ext === 'cur') {
      const best = decodeIcoBest(await fs.readFile(file))
      return best.png ? sharp(best.png, opts) : sharp(best.rgba, { raw: { width: best.width, height: best.height, channels: 4 } })
    }
    if (ext === 'dds') {
      try {
        const png = await texconvDecode(file, tmp, job)
        if (png) return sharp(png, opts)
      } catch (err) { logger?.warn?.('Converter', `texconv: ${err.message}`) }
      return sharp(await ffmpegDecode(file, ext, job), opts)
    }
    if (RAW_INPUT.includes(ext)) return sharp(await rawDecode(file, job), opts)
    if (FFMPEG_INPUT.includes(ext)) return sharp(await ffmpegDecode(file, ext, job), opts)
    // Unknown extension: let libvips sniff it, then FFmpeg.
    try { const s = sharp(file, opts); await s.metadata(); return s } catch {}
    return sharp(await ffmpegDecode(file, ext, job), opts)
  }

  async function encode(img, format, outputFile, o, tmp, job) {
    const q = Math.min(100, Math.max(1, Number(o.quality) || 85))
    const lossless = Boolean(o.lossless)
    switch (format) {
      case 'png': return img.png({ compressionLevel: 6, adaptiveFiltering: true }).toFile(outputFile)
      case 'jpg': return img.flatten({ background: '#ffffff' }).jpeg({ quality: q, mozjpeg: true }).toFile(outputFile)
      case 'webp': return img.webp({ quality: q, lossless, effort: 4 }).toFile(outputFile)
      case 'avif': return img.avif({ quality: Math.max(1, Math.round(q * 0.7)), lossless, effort: 4 }).toFile(outputFile)
      case 'tiff': return img.tiff({ compression: 'lzw', predictor: 'horizontal' }).toFile(outputFile)
      case 'gif': return img.gif({ effort: 7 }).toFile(outputFile)
      case 'bmp': {
        const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
        return fs.writeFile(outputFile, encodeBmp(data, info.width, info.height))
      }
      case 'ico':
      case 'cur': {
        const sizes = format === 'ico' ? [16, 24, 32, 48, 64, 128, 256] : [32, 48, 64, 128, 256]
        const src = await img.ensureAlpha().png().toBuffer()
        const sharp = await getSharp()
        const images = await Promise.all(sizes.map(async (size) => ({
          size,
          png: await sharp(src).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer()
        })))
        return fs.writeFile(outputFile, encodeIco(images, { cursor: format === 'cur', hotspot: { x: Number(o.hotspotX) || 0, y: Number(o.hotspotY) || 0 } }))
      }
      case 'jxl': {
        const { encode: enc } = await jxlModules()
        const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
        const out = await enc({ data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height },
          { quality: lossless ? 100 : q, lossless, effort: 7 })
        return fs.writeFile(outputFile, Buffer.from(out))
      }
      case 'dds': {
        const exe = texconvPath()
        if (!exe) throw new Error('texconv not available (DDS writer)')
        const srcPng = path.join(tmp, `${path.basename(outputFile, '.dds')}.png`)
        await img.ensureAlpha().png({ compressionLevel: 1 }).toFile(srcPng)
        const args = ['-nologo', '-y', '-ft', 'dds', '-f', ddsFormatArg(o.ddsFormat, o.srgb !== false), '-m', o.mipmaps === false ? '1' : '0', '-o', tmp]
        // PNG pixels are sRGB: with an _SRGB target tell texconv both sides are sRGB so it stores them unchanged.
        if (o.srgb !== false && DDS_FORMATS[String(o.ddsFormat || 'BC7').toUpperCase()]?.srgb) args.push('-srgb')
        args.push(srcPng)
        const r = await run(exe, args, { job, timeoutMs: 10 * 60 * 1000, lowPriority: true })
        const produced = path.join(tmp, `${path.basename(outputFile, '.dds')}.dds`)
        if (r.code !== 0 || !fsRaw.existsSync(produced)) throw new Error(tail(r.stdout.toString()) || 'texconv failed')
        return fs.rename(produced, outputFile).catch(async () => { await fs.copyFile(produced, outputFile); await fs.rm(produced, { force: true }) })
      }
      default: {
        const ff = await getFfmpegPath()
        if (!ff) throw new Error('FFmpeg not available')
        const png = await img.ensureAlpha().png({ compressionLevel: 1 }).toBuffer()
        const r = await run(ff, ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-f', 'png_pipe', '-i', 'pipe:0',
          ...ffmpegImageEncodeArgs(format), '-frames:v', '1', '-update', '1', outputFile], { job, input: png, timeoutMs: 120000 })
        if (r.code !== 0) throw new Error(tail(r.stderr) || `ffmpeg could not write ${format}`)
      }
    }
  }

  /**
   * opts: { outputDir, outputFormat, quality, lossless, width, height, keepMetadata, ddsFormat, srgb, mipmaps,
   *         hotspotX, hotspotY }
   */
  async function convert(inputFiles, opts, { job, onProgress } = {}) {
    let format = String(opts.outputFormat || '').toLowerCase().trim()
    if (format === 'jpeg') format = 'jpg'
    if (format === 'tif') format = 'tiff'
    if (!IMAGE_OUTPUT.includes(format)) throw new Error('Unsupported image output format')
    await fs.mkdir(opts.outputDir, { recursive: true })
    const tmpRoot = await fs.mkdtemp(path.join(opts.outputDir, '.darkhub-convert-'))
    const width = Number(opts.width) > 0 ? Math.round(Number(opts.width)) : null
    const height = Number(opts.height) > 0 ? Math.round(Number(opts.height)) : null
    // sharp already uses several threads per image; a few files in flight keeps memory bounded on big batches.
    const limit = Math.max(1, Math.min(4, Math.floor(os.cpus().length / 4)))
    let finished = 0
    // Names are reserved up front: files converted in parallel with the same base name must not share an output.
    const reserved = []
    const outputs = inputFiles.map((f) => {
      const out = uniqueOutputPath(opts.outputDir, path.basename(f, path.extname(f)), format, [...inputFiles, ...reserved])
      reserved.push(out)
      return out
    })
    try {
      return await mapLimit(inputFiles, limit, async (inputFile, index) => {
        const outputFile = outputs[index]
        const tmp = path.join(tmpRoot, String(index))
        const started = Date.now()
        if (job?.cancelled) return { inputFile, outputFile, ok: false, cancelled: true, error: 'cancelled' }
        try {
          await fs.mkdir(tmp, { recursive: true })
          onProgress?.({ index, total: inputFiles.length, inputFile, stage: 'encode', percent: null })
          const animated = format === 'gif' || format === 'webp'
          let density = 0
          if ((extOf(inputFile) === 'svg' || extOf(inputFile) === 'svgz') && (width || height)) {
            const meta = await (await getSharp())(inputFile).metadata().catch(() => ({}))
            const scale = Math.max((width || 0) / (meta.width || 1), (height || 0) / (meta.height || 1))
            density = Math.min(2400, Math.max(72, Math.round(72 * scale)))
          }
          let img = await open(inputFile, { animated, density, tmp, job })
          img = img.rotate()
          if (width || height) img = img.resize(width, height, { fit: 'inside', withoutEnlargement: false, kernel: 'lanczos3' })
          if (opts.keepMetadata) img = img.keepMetadata()
          else if (typeof img.keepIccProfile === 'function') img = img.keepIccProfile()
          await encode(img, format, outputFile, opts, tmp, job)
          const stat = await fs.stat(outputFile).catch(() => null)
          onProgress?.({ index, total: inputFiles.length, inputFile, stage: 'done', percent: 100, finished: ++finished })
          return { inputFile, outputFile, ok: true, seconds: (Date.now() - started) / 1000, bytes: stat?.size ?? null }
        } catch (err) {
          await fs.rm(outputFile, { force: true }).catch(() => {})
          onProgress?.({ index, total: inputFiles.length, inputFile, stage: 'error', percent: 0, finished: ++finished })
          return { inputFile, outputFile, ok: false, error: err?.message ?? String(err) }
        }
      })
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {})
    }
  }

  return { convert, open }
}
