// Statistics for the before/after benchmark. Pure: the comparison must only call a change real when it is larger
// than the run-to-run noise both runs showed.

export const METRICS = {
  cpuSingle: { higherIsBetter: true, unit: 'Mops/s' },
  cpuMulti: { higherIsBetter: true, unit: 'Mops/s' },
  memBandwidth: { higherIsBetter: true, unit: 'GB/s' },
  memLatency: { higherIsBetter: false, unit: 'ns' },
  timerJitterP99: { higherIsBetter: false, unit: 'µs' },
  timerJitterAvg: { higherIsBetter: false, unit: 'µs' },
  diskSeqWrite: { higherIsBetter: true, unit: 'MB/s' },
  disk4kSyncWrite: { higherIsBetter: true, unit: 'IOPS' }
}

export function median(xs) {
  const s = [...xs].filter(Number.isFinite).sort((a, b) => a - b)
  if (!s.length) return null
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Noise as a fraction of the median: median absolute deviation scaled to a standard deviation (×1.4826). */
export function noise(xs) {
  const m = median(xs)
  if (!m) return 0
  const mad = median(xs.map((x) => Math.abs(x - m)))
  return (mad * 1.4826) / Math.abs(m)
}

export function summarize(samples) {
  const out = {}
  for (const [k, xs] of Object.entries(samples)) {
    if (!Array.isArray(xs) || !xs.length) continue
    out[k] = { median: median(xs), noise: noise(xs), samples: xs }
  }
  return out
}

/**
 * Compares two summarized runs. A difference counts only when it is beyond twice the larger noise (at least 2%):
 * verdict 'better' | 'worse' | 'same'.
 */
export function compare(before, after) {
  const rows = []
  for (const [k, meta] of Object.entries(METRICS)) {
    const a = before?.[k]
    const b = after?.[k]
    if (!a?.median || b?.median == null) continue
    const change = (b.median - a.median) / a.median
    const threshold = Math.max(0.03, 2 * Math.max(a.noise || 0, b.noise || 0))
    const improved = meta.higherIsBetter ? change > 0 : change < 0
    // with few samples the noise estimate is shaky: also require the two sample ranges not to overlap
    const sa = a.samples?.length ? a.samples : [a.median]
    const sb = b.samples?.length ? b.samples : [b.median]
    const separated = Math.min(...sb) > Math.max(...sa) || Math.max(...sb) < Math.min(...sa)
    const verdict = Math.abs(change) < threshold || !separated ? 'same' : improved ? 'better' : 'worse'
    rows.push({ metric: k, unit: meta.unit, before: a.median, after: b.median, change, threshold, verdict })
  }
  return rows
}

/** Context fields that make a comparison unfair when they differ between the two runs. */
export function contextWarnings(a, b) {
  const keys = ['powerPlan', 'onBattery', 'cpu', 'ramGb', 'osBuild']
  const out = keys.filter((k) => a?.[k] != null && b?.[k] != null && String(a[k]) !== String(b[k]))
  if (a?.backgroundCpu != null && b?.backgroundCpu != null && Math.abs(a.backgroundCpu - b.backgroundCpu) > 10) out.push('backgroundCpu')
  return out
}

/** Percentiles of a numeric array (p in 0..100). */
export function percentile(xs, p) {
  const s = [...xs].sort((a, b) => a - b)
  if (!s.length) return null
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))
  return s[i]
}
