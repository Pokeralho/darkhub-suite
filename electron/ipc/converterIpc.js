import path from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'
import fs from 'node:fs/promises'
import { createJob } from '../services/converter/processUtil.js'
import { convertMedia, detectHwEncoders } from '../services/converter/MediaConverter.js'
import { createImageConverter, IMAGE_INPUT, IMAGE_OUTPUT, DDS_FORMATS } from '../services/converter/ImageConverter.js'
import { createDocumentConverter, findSoffice } from '../services/converter/DocumentConverter.js'
import { DOC_INPUTS, commonOutputs } from '../services/converter/docRoutes.js'
import { MEDIA_OUTPUTS } from '../services/converter/mediaPlan.js'
import { texconvPath, dcrawPath } from '../services/converter/vendorTools.js'

/**
 * `files:*` File Converter channels. Inputs must have been granted through a file dialog or drag and drop; output
 * goes to a granted folder or next to the inputs. Long jobs report on `files:convertProgress` and stop with
 * `files:cancelConvert`.
 */
export function registerConverterIPC({ app, ipcMain, BrowserWindow, session, getSharp, getFfmpegPath, getExiftool,
  assertFileAccessGrantedMany, assertOutputDirGranted, logger } = {}) {
  const jobs = new Map()

  // HTML -> PDF in an isolated, script-less, offline Chromium page.
  const PDF_PARTITION = 'darkhub-converter-pdf'
  let pdfSessionReady = false
  async function htmlToPdf(htmlFile, outFile) {
    const ses = session.fromPartition(PDF_PARTITION)
    if (!pdfSessionReady) {
      ses.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !/^(file|data|blob|about|devtools):/i.test(d.url) }))
      ses.setPermissionRequestHandler((_wc, _p, cb) => cb(false))
      pdfSessionReady = true
    }
    const win = new BrowserWindow({
      show: false, width: 1000, height: 1400,
      webPreferences: { partition: PDF_PARTITION, javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, spellcheck: false }
    })
    try {
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      win.webContents.on('will-navigate', (e) => e.preventDefault())
      await win.loadURL(pathToFileURL(htmlFile).href)
      const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { marginType: 'default' }, generateDocumentOutline: true })
      await fs.writeFile(outFile, pdf)
    } finally {
      if (!win.isDestroyed()) win.destroy()
    }
  }

  const images = createImageConverter({ getSharp, getFfmpegPath, getExiftool, logger })
  const documents = createDocumentConverter({ app, htmlToPdf, logger })

  const validate = (payload) => {
    const { inputFiles, outputDir, outputFormat } = payload ?? {}
    if (!Array.isArray(inputFiles) || inputFiles.length === 0) throw new Error('No input files')
    if (inputFiles.some((f) => typeof f !== 'string' || !f.trim() || !path.isAbsolute(f))) throw new Error('Invalid input file path')
    if (typeof outputDir !== 'string' || outputDir.trim().length === 0 || !path.isAbsolute(outputDir)) throw new Error('No output directory')
    if (typeof outputFormat !== 'string' || !outputFormat.trim()) throw new Error('No output format')
    assertFileAccessGrantedMany(inputFiles, 'arquivo de entrada')
    assertOutputDirGranted(outputDir, inputFiles)
    return payload
  }

  const withJob = (kind, fn) => async (event, payload) => {
    const p = validate(payload)
    const jobId = typeof p.jobId === 'string' && p.jobId ? p.jobId.slice(0, 64) : `${kind}-${Date.now()}`
    const job = createJob(jobId)
    jobs.set(jobId, job)
    const sender = event.sender
    const onProgress = (info) => { if (!sender.isDestroyed()) sender.send('files:convertProgress', { jobId, kind, ...info }) }
    const started = Date.now()
    try {
      const results = await fn(p, { job, onProgress })
      logger?.info?.('Converter', `${kind} -> ${p.outputFormat}: ${results.filter((r) => r.ok).length}/${results.length} ok in ${((Date.now() - started) / 1000).toFixed(1)}s`)
      return results
    } finally {
      jobs.delete(jobId)
    }
  }

  ipcMain.handle('files:convertImages', withJob('image', (p, ctx) => images.convert(p.inputFiles, p, ctx)))

  ipcMain.handle('files:convertMedia', withJob('media', async (p, ctx) => {
    const ffmpegPath = await getFfmpegPath()
    if (typeof ffmpegPath !== 'string' || !ffmpegPath.trim()) throw new Error('FFmpeg not available')
    return convertMedia(ffmpegPath, p.inputFiles, p, ctx)
  }))

  ipcMain.handle('files:convertDocuments', withJob('document', (p, ctx) => documents.convert(p.inputFiles, p, ctx)))

  ipcMain.handle('files:cancelConvert', async (_e, payload) => {
    const job = jobs.get(String(payload?.jobId || ''))
    if (!job) return { ok: false, error: 'job-not-found' }
    job.cancel()
    return { ok: true }
  })

  ipcMain.handle('files:checkLibreOffice', async () => {
    const so = findSoffice()
    return { ok: Boolean(so), soffice: so?.path ?? null, bundled: Boolean(so?.bundled) }
  })

  ipcMain.handle('files:docTargets', async (_e, payload) => {
    const exts = (Array.isArray(payload?.exts) ? payload.exts : []).map((x) => String(x).toLowerCase().replace(/^\./, '')).slice(0, 500)
    return { outputs: commonOutputs(exts) }
  })

  ipcMain.handle('files:converterCapabilities', async () => {
    const ffmpegPath = await getFfmpegPath().catch(() => null)
    const hw = ffmpegPath ? await detectHwEncoders(ffmpegPath).catch(() => []) : []
    const so = findSoffice()
    return {
      ffmpeg: Boolean(ffmpegPath),
      hwEncoders: hw,
      gpuVendors: [...new Set(hw.map((e) => e.split('_').pop()))],
      libreoffice: { available: Boolean(so), bundled: Boolean(so?.bundled) },
      texconv: Boolean(texconvPath()),
      raw: Boolean(dcrawPath()),
      cpuThreads: os.cpus().length,
      imageInputs: IMAGE_INPUT,
      imageOutputs: IMAGE_OUTPUT,
      ddsFormats: Object.keys(DDS_FORMATS),
      mediaOutputs: MEDIA_OUTPUTS,
      docInputs: DOC_INPUTS
    }
  })

  app?.on?.('will-quit', () => { for (const job of jobs.values()) job.cancel() })
  return { htmlToPdf }
}
