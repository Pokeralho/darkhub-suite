// @vitest-environment node
import { describe, it, expect } from 'vitest'
// @ts-ignore - plain JS module
import { median, noise, summarize, compare, contextWarnings, percentile } from '../electron/services/benchmark/benchStats.js'

describe('benchStats', () => {
  it('median, noise and percentiles', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
    expect(noise([100, 100, 100])).toBe(0)
    expect(noise([98, 100, 102])).toBeCloseTo(0.0297, 3)
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 99)).toBe(10)
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5)
  })

  it('only calls changes real when beyond the noise, respecting direction', () => {
    const before = summarize({ cpuSingle: [100, 101, 99], memLatency: [80, 81, 79], timerJitterP99: [500, 900, 300] })
    const after = summarize({ cpuSingle: [110, 111, 109], memLatency: [70, 71, 69], timerJitterP99: [450, 800, 350] })
    const rows = Object.fromEntries(compare(before, after).map((r: any) => [r.metric, r.verdict]))
    expect(rows.cpuSingle).toBe('better')
    expect(rows.memLatency).toBe('better')
    expect(rows.timerJitterP99).toBe('same')
    const worse = compare(summarize({ cpuSingle: [100, 100, 100] }), summarize({ cpuSingle: [90, 90, 90] }))
    expect(worse[0].verdict).toBe('worse')
    // the false positive seen on a busy machine: medians differ but the samples overlap
    const overlap = compare(summarize({ memLatency: [150, 161, 175] }), summarize({ memLatency: [128, 131, 160] }))
    expect(overlap[0].verdict).toBe('same')
  })

  it('warns when the context changed between runs', () => {
    expect(contextWarnings({ powerPlan: 'Balanced', backgroundCpu: 5 }, { powerPlan: 'High', backgroundCpu: 30 })).toEqual(['powerPlan', 'backgroundCpu'])
    expect(contextWarnings({ powerPlan: 'High' }, { powerPlan: 'High' })).toEqual([])
  })
})
