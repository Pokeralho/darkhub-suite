// Audio/video conversion with FFmpeg: real hardware-encoder detection (a test encode, not just the encoder list),
// stream copy when only the container changes, GPU-first encode with automatic CPU fallback, progress from
// `-progress pipe:1`, cancellation that kills the whole process tree, and below-normal priority + a thread cap so
// the PC stays usable while it works.
import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'
import { run, uniqueOutputPath, extOf } from './processUtil.js'
import { parseProbe, buildMediaPlan, parseProgressChunk, responsiveThreads, HW_ENCODER_NAMES, MEDIA_OUTPUTS } from './mediaPlan.js'

let hwCache = null

/** Hardware encoders that really work on this PC (driver + GPU), found by a tiny test encode of each. */
export async function detectHwEncoders(ffmpegPath, { force = false } = {}) {
  if (hwCache && !force) return hwCache
  hwCache = (async () => {
    const list = await run(ffmpegPath, ['-hide_banner', '-encoders'], { timeoutMs: 15000 }).catch(() => null)
    const listed = String(list?.stdout || '')
    const candidates = HW_ENCODER_NAMES.filter((n) => new RegExp(`\\b${n}\\b`).test(listed))
    const working = []
    for (const enc of candidates) {
      const r = await run(ffmpegPath, ['-hide_banner', '-nostdin', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=640x360:r=30',
        '-frames:v', '5', '-pix_fmt', enc.endsWith('_qsv') ? 'nv12' : 'yuv420p', '-c:v', enc, '-f', 'null', '-'], { timeoutMs: 20000 }).catch(() => null)
      if (r && r.code === 0) working.push(enc)
    }
    return working
  })()
  return hwCache
}

export async function probeMedia(ffmpegPath, file) {
  const r = await run(ffmpegPath, ['-hide_banner', '-nostdin', '-i', file], { timeoutMs: 30000 })
  const probe = parseProbe(r.stderr)
  if (!probe.video && !probe.audio.length) {
    const why = (r.stderr.split(/\r?\n/).filter((l) => l.trim()).pop() || '').trim()
    throw new Error(why || 'no-media-streams')
  }
  return probe
}

function lastError(stderr) {
  const lines = String(stderr || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  return lines.slice(-3).join(' | ').slice(0, 600)
}

/**
 * Converts files one by one (one encode at a time uses the GPU/CPU best). onProgress receives
 * { index, total, inputFile, percent, speed, fps, stage, encoder, hardware }.
 * opts: { outputDir, outputFormat, codec, quality, maxHeight, maxFps, encoderPref, copy, audioBitrate, gifFps,
 *         gifWidth, responsive (default true) }
 */
export async function convertMedia(ffmpegPath, inputFiles, opts, { job, onProgress } = {}) {
  const target = String(opts.outputFormat || '').toLowerCase().trim()
  if (!MEDIA_OUTPUTS.includes(target)) throw new Error('Unsupported output format')
  const responsive = opts.responsive !== false
  const threads = responsive ? responsiveThreads(os.cpus().length) : 0
  const available = opts.encoderPref === 'cpu' ? [] : await detectHwEncoders(ffmpegPath)
  await fs.mkdir(opts.outputDir, { recursive: true })

  const results = []
  for (let index = 0; index < inputFiles.length; index++) {
    const inputFile = inputFiles[index]
    const started = Date.now()
    const emit = (p) => onProgress?.({ index, total: inputFiles.length, inputFile, ...p })
    if (job?.cancelled) { results.push({ inputFile, ok: false, cancelled: true, error: 'cancelled' }); continue }
    let outputFile = null
    try {
      emit({ stage: 'probe', percent: 0 })
      const probe = await probeMedia(ffmpegPath, inputFile)
      const plan = buildMediaPlan(inputFile, probe, {
        ...opts, target, sourceExt: extOf(inputFile), threads, available
      })
      const base = path.basename(inputFile, path.extname(inputFile))
      outputFile = uniqueOutputPath(opts.outputDir, base, plan.ext, inputFiles)
      let done = null
      let lastErr = ''
      for (const attempt of plan.attempts) {
        if (job?.cancelled) break
        emit({ stage: 'encode', percent: 0, encoder: attempt.encoder, hardware: attempt.hardware, copy: attempt.copy })
        let buf = ''
        let lastSent = 0
        const r = await run(ffmpegPath, [...attempt.args, outputFile], {
          job, lowPriority: responsive, timeoutMs: 6 * 60 * 60 * 1000, maxStdout: 0,
          onStdout: (txt) => {
            buf += txt
            if (!buf.includes('progress=')) return
            const p = parseProgressChunk(buf)
            buf = ''
            const now = Date.now()
            if (!p || now - lastSent < 250) return
            lastSent = now
            const pct = probe.durationSec > 0 && p.outTimeSec != null ? Math.min(99.5, (p.outTimeSec / probe.durationSec) * 100) : null
            emit({ stage: 'encode', percent: pct, speed: p.speed, fps: p.fps, encoder: attempt.encoder, hardware: attempt.hardware, copy: attempt.copy })
          }
        })
        if (r.cancelled) break
        if (r.code === 0) { done = attempt; break }
        lastErr = lastError(r.stderr)
        await fs.rm(outputFile, { force: true }).catch(() => {})
      }
      if (job?.cancelled) {
        await fs.rm(outputFile, { force: true }).catch(() => {})
        results.push({ inputFile, outputFile, ok: false, cancelled: true, error: 'cancelled' })
        emit({ stage: 'cancelled', percent: 0 })
        continue
      }
      if (!done) throw new Error(lastErr || 'ffmpeg failed')
      const stat = await fs.stat(outputFile).catch(() => null)
      const res = {
        inputFile, outputFile, ok: true, encoder: done.encoder, hardware: done.hardware, copy: done.copy,
        seconds: (Date.now() - started) / 1000, bytes: stat?.size ?? null, durationSec: probe.durationSec
      }
      results.push(res)
      emit({ stage: 'done', percent: 100, encoder: done.encoder, hardware: done.hardware, copy: done.copy })
    } catch (err) {
      if (outputFile) await fs.rm(outputFile, { force: true }).catch(() => {})
      results.push({ inputFile, outputFile, ok: false, error: err?.message ?? String(err) })
      emit({ stage: 'error', percent: 0 })
    }
  }
  return results
}
