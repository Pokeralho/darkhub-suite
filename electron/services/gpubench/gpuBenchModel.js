// Scores and frame statistics of the GPU benchmark. Pure. The ranked score is always computed by the server from the
// same formula: this one only shows local runs. See docs/GPU_BENCHMARK.md.

export const RASTER_SCALE = 10
export const RT_SCALE = 10
export const WARM_MS = 3000
export const LOCAL_SEGMENT_MS = 6000
export const LOCAL_SEGMENTS = 3
export const QUICK_SEGMENTS = 1
export const MAX_HISTORY = 50

export function decodeFrameUs(b64) {
  const b = Buffer.from(String(b64 || ''), 'base64')
  const out = new Array(Math.floor(b.length / 4))
  for (let i = 0; i < out.length; i++) out[i] = b.readUInt32LE(i * 4)
  return out
}

/** fps, average frame time and the 1% low, from GPU frame times in microseconds. */
export function frameStats(us) {
  const list = (us || []).filter((x) => x > 0)
  if (!list.length) return { frames: 0, fps: 0, avgMs: 0, low1: 0 }
  const total = list.reduce((a, b) => a + b, 0)
  const sorted = [...list].sort((a, b) => b - a)
  const worst = sorted.slice(0, Math.max(1, Math.floor(list.length / 100)))
  return {
    frames: list.length,
    fps: list.length / (total / 1e6),
    avgMs: total / list.length / 1000,
    low1: 1e6 / (worst.reduce((a, b) => a + b, 0) / worst.length)
  }
}

/** Score from the per-test fps. Without ray tracing there is no total: rankings keep the two apart. */
export function scoreOf({ rasterFps, rtFps = null }) {
  const raster = Math.round(rasterFps * RASTER_SCALE)
  const rt = rtFps == null ? null : Math.round(rtFps * RT_SCALE)
  return { raster, rt, total: rt == null ? null : Math.round(Math.sqrt(raster * rt)) }
}

/** Averages a run's sensor samples into what a report shows. Missing sensors stay null. */
export function sensorSummary(samples) {
  const pick = (k, fn) => { const xs = samples.map((s) => s[k]).filter((x) => Number.isFinite(x)); return xs.length ? fn(xs) : null }
  const mean = (xs) => Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10
  const max = (xs) => Math.max(...xs)
  return {
    samples: samples.length,
    gpuClockAvg: pick('clock', mean), gpuClockMax: pick('clock', max),
    gpuTempAvg: pick('temp', mean), gpuTempMax: pick('temp', max),
    gpuPowerAvg: pick('power', mean), gpuLoadAvg: pick('load', mean)
  }
}

/** One sensor sample from a hardware snapshot. An unavailable sensor is null, never 0: AMD and Intel have no temperature here. */
export function sampleGpu(snapshot, t = Date.now()) {
  const gpu = snapshot?.gpu?.values?.gpus?.[0]
  const val = (x) => {
    const v = x && typeof x === 'object' && 'value' in x ? x.value : x
    return v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v)
  }
  return { t, clock: val(gpu?.clockCore), temp: val(gpu?.temperature), load: val(gpu?.utilization), power: val(gpu?.powerDraw) }
}

/** Flat list of what a run does, in order. */
export function localPlan({ dxr, quick }) {
  const n = quick ? QUICK_SEGMENTS : LOCAL_SEGMENTS
  return (dxr ? ['raster', 'rt'] : ['raster']).flatMap((test) => Array.from({ length: n }, (_, index) => ({ test, index })))
}
