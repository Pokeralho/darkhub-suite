// PresentMon CSV → frame statistics for the game overlay. Pure.

/** Splits one CSV line (PresentMon quotes fields only when they contain commas). */
export function splitCsv(line) {
  const out = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { quoted = !quoted; continue }
    if (c === ',' && !quoted) { out.push(cur); cur = ''; continue }
    cur += c
  }
  out.push(cur)
  return out
}

/** Stateful line parser: the first line is the header; returns a frame object per data line, or null. */
export function createCsvParser() {
  let cols = null
  return (line) => {
    const raw = String(line).replace(/\r$/, '')
    if (!raw.trim()) return null
    const f = splitCsv(raw)
    if (!cols) {
      if (f[0] === 'Application') cols = Object.fromEntries(f.map((name, i) => [name, i]))
      return null
    }
    const num = (k) => { const i = cols[k]; if (i == null) return null; const v = Number(f[i]); return Number.isFinite(v) ? v : null }
    return {
      app: f[cols.Application] ?? '',
      pid: num('ProcessID'),
      presentMode: f[cols.PresentMode] ?? '',
      msBetweenPresents: num('MsBetweenPresents'),
      msBetweenDisplayChange: num('MsBetweenDisplayChange'),
      msGpuBusy: num('MsGPUBusy'),
      msCpuBusy: num('MsCPUBusy'),
      msLatency: num('MsAllInputToPhotonLatency') ?? num('MsUntilDisplayed')
    }
  }
}

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))] : null)

/** Rolling window of frame times. fps uses the last second; lows use up to the last `maxFrames` frames. */
export class FrameWindow {
  constructor(maxFrames = 3000) {
    this.maxFrames = maxFrames
    this.frames = []
    this.gpuBusy = []
    this.latency = []
    this.presentMode = ''
  }

  push(f) {
    const ft = f.msBetweenPresents
    if (!(ft > 0) || ft > 5000) return
    this.frames.push(ft)
    if (f.msGpuBusy != null) this.gpuBusy.push(f.msGpuBusy)
    if (f.msLatency != null && f.msLatency > 0) this.latency.push(f.msLatency)
    if (f.presentMode) this.presentMode = f.presentMode
    for (const a of [this.frames, this.gpuBusy, this.latency]) if (a.length > this.maxFrames) a.splice(0, a.length - this.maxFrames)
  }

  stats() {
    if (!this.frames.length) return null
    // frames whose times add up to the last ~1000 ms
    let sum = 0
    let n = 0
    for (let i = this.frames.length - 1; i >= 0 && sum < 1000; i--) { sum += this.frames[i]; n++ }
    const sorted = [...this.frames].sort((a, b) => a - b)
    const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
    const recent = this.frames.slice(-n)
    const p99 = pct(sorted, 99)
    const p999 = pct(sorted, 99.9)
    return {
      fps: sum > 0 ? (n * 1000) / sum : null,
      frameTimeMs: avg(recent),
      low1: p99 ? 1000 / p99 : null,
      low01: p999 ? 1000 / p999 : null,
      maxFrameTimeMs: sorted[sorted.length - 1],
      gpuBusyMs: avg(this.gpuBusy.slice(-n)),
      latencyMs: avg(this.latency.slice(-n)),
      presentMode: this.presentMode,
      graph: this.frames.slice(-120)
    }
  }

  reset() { this.frames = []; this.gpuBusy = []; this.latency = []; this.presentMode = '' }
}

const BUCKET_MS = 0.1
const BUCKETS = 2501 // 0 to 250 ms in 0.1 ms steps (slower frames land in the last bucket)

/**
 * Whole-session statistics in constant memory (a frame-time histogram), like the benchmark panel of RTSS/CapFrameX:
 * average/min/max FPS (per second), 1% and 0.1% lows, frame-time standard deviation and stutters (a frame more than
 * twice as long as the recent average and at least 8 ms longer).
 */
export class SessionStats {
  constructor() { this.reset() }

  reset() {
    this.frames = 0
    this.totalMs = 0
    this.sumSq = 0
    this.maxMs = 0
    this.hist = new Uint32Array(BUCKETS)
    this.stutters = 0
    this.ema = 0
    this.secMs = 0
    this.secFrames = 0
    this.minFps = null
    this.maxFps = null
  }

  push(ft) {
    if (!(ft > 0) || ft > 5000) return
    this.frames++
    this.totalMs += ft
    this.sumSq += ft * ft
    if (ft > this.maxMs) this.maxMs = ft
    this.hist[Math.min(BUCKETS - 1, Math.round(ft / BUCKET_MS))]++
    if (this.ema && ft > this.ema * 2 && ft - this.ema >= 8) this.stutters++
    this.ema = this.ema ? this.ema * 0.95 + ft * 0.05 : ft
    this.secMs += ft
    this.secFrames++
    if (this.secMs >= 1000) {
      const fps = (this.secFrames * 1000) / this.secMs
      this.minFps = this.minFps == null ? fps : Math.min(this.minFps, fps)
      this.maxFps = this.maxFps == null ? fps : Math.max(this.maxFps, fps)
      this.secMs = 0
      this.secFrames = 0
    }
  }

  /** Frame time at the given percentile (0-100), from the histogram. */
  percentile(p) {
    if (!this.frames) return null
    const want = Math.ceil((p / 100) * this.frames)
    let seen = 0
    for (let i = 0; i < BUCKETS; i++) {
      seen += this.hist[i]
      if (seen >= want) return Math.max(BUCKET_MS, i * BUCKET_MS)
    }
    return this.maxMs
  }

  stats() {
    if (!this.frames) return null
    const mean = this.totalMs / this.frames
    const p99 = this.percentile(99)
    const p999 = this.percentile(99.9)
    return {
      frames: this.frames,
      seconds: this.totalMs / 1000,
      avgFps: (this.frames * 1000) / this.totalMs,
      minFps: this.minFps,
      maxFps: this.maxFps,
      low1: p99 ? 1000 / p99 : null,
      low01: p999 ? 1000 / p999 : null,
      avgFrameMs: mean,
      maxFrameMs: this.maxMs,
      stdDevMs: Math.sqrt(Math.max(0, this.sumSq / this.frames - mean * mean)),
      stutters: this.stutters
    }
  }
}
