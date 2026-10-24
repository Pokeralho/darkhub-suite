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
