// @vitest-environment node
import { describe, it, expect } from 'vitest'
// @ts-ignore - plain JS modules
import { solveCalibration, windowStats, readingWatts, checkPoint, calHardwareId, normalizeCalibration, calibrationState, CAL_MAX_SPREAD, readingSigma } from '../electron/services/overlay/wallCalibration.js'
// @ts-ignore
import { psuCurve, psuEfficiency, systemPower, buildDerived, normalizePower } from '../electron/services/overlay/powerModel.js'

const PSU = 750
const gold = psuCurve('gold')
const eta0 = (load: number) => psuEfficiency(load, gold)
/** What a perfect meter shows for a PC with hidden DC draw `x` and a PSU whose real curve is k x the gold curve. */
const wallOf = (P: number, x: number, k: number, psu = PSU, curve = gold) => (P + x) / ((k * psuEfficiency((P + x) / psu, curve)) / 100)
const pt = (P: number, W: number, std = 0) => ({ measW: P, wallW: W, std, spread: 0.01 })

describe('wall calibration: recovers a known PC', () => {
  it('finds the hidden draw and the efficiency correction exactly with perfect readings', () => {
    for (const [x, k] of [[45, 0.97], [20, 1.0], [80, 1.03], [0, 0.95]]) {
      const r = solveCalibration({ points: [pt(80, wallOf(80, x, k)), pt(330, wallOf(330, x, k))], psuWatts: PSU, efficiency: eta0 })
      expect(r.ok).toBe(true)
      expect(r.extraW).toBeCloseTo(x, 1)
      expect(r.effScale).toBeCloseTo(k, 4)
      // and the model it implies reproduces both readings
      const sys = systemPower({ gpuW: 300, cpuW: 30, psuWatts: PSU, rating: 'gold', cal: { extraW: r.extraW, effScale: r.effScale } })
      expect(sys.acW).toBeCloseTo(wallOf(330, x, k), 1)
    }
  })

  it('is order-independent and matches the closed form when the curve is flat', () => {
    const flat = (_: number) => 88
    const x = 35, eta = 0.88 * 0.98
    const W = (P: number) => (P + x) / eta
    const r = solveCalibration({ points: [pt(400, W(400)), pt(90, W(90))], psuWatts: PSU, efficiency: flat })
    expect(r.ok).toBe(true)
    // x = (P2 W1 - P1 W2) / (W2 - W1)
    expect(r.extraW).toBeCloseTo((400 * W(90) - 90 * W(400)) / (W(400) - W(90)), 6)
    expect(r.effScale).toBeCloseTo(0.98, 6)
    expect(r.points[0].measW).toBe(90) // sorted
  })

  it('stays within its own uncertainty with meter noise (+-1 %) and sensor jitter', () => {
    let seed = 7
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5 } // deterministic
    const x = 50, k = 0.97
    let worstX = 0, worstK = 0, outside2Sigma = 0
    const N = 200
    const trueEffLoad = k * eta0((324 + x) / PSU)
    for (let i = 0; i < N; i++) {
      const P1 = 75 + rnd() * 4, P2 = 320 + rnd() * 8
      const W1 = wallOf(P1, x, k) * (1 + rnd() * 0.02), W2 = wallOf(P2, x, k) * (1 + rnd() * 0.02)
      // the app only knows its window means; the truth used slightly different instantaneous values
      const r = solveCalibration({ points: [pt(77, W1, 1.2), pt(324, W2, 2.5)], psuWatts: PSU, efficiency: eta0 })
      expect(r.ok).toBe(true)
      worstX = Math.max(worstX, Math.abs(r.extraW - x))
      worstK = Math.max(worstK, Math.abs(r.effScale - k))
      if (Math.abs(r.effAt[1] - trueEffLoad) > 2 * r.sigma.effPct) outside2Sigma++
      expect(r.sigma.effPct).toBeLessThan(3)
      expect(r.sigma.extraW).toBeLessThan(15)
    }
    // worst case of 200 noisy calibrations with a 245 W step: hidden draw within 15 W, efficiency within ~4.5 points
    expect(worstX).toBeLessThan(15)
    expect(worstK).toBeLessThan(0.05)
    // and the reported sigma is honest: the true efficiency is outside +-2 sigma in at most ~5 % of runs
    expect(outside2Sigma).toBeLessThanOrEqual(N * 0.05)
  })

  it('reports an uncertainty that shrinks as the load step grows', () => {
    const small = solveCalibration({ points: [pt(80, wallOf(80, 40, 1)), pt(200, wallOf(200, 40, 1))], psuWatts: PSU, efficiency: eta0 })
    const big = solveCalibration({ points: [pt(80, wallOf(80, 40, 1)), pt(400, wallOf(400, 40, 1))], psuWatts: PSU, efficiency: eta0 })
    expect(small.ok && big.ok).toBe(true)
    expect(big.sigma.effPct).toBeLessThan(small.sigma.effPct)
  })
})

describe('wall calibration: rejections', () => {
  const ok = (P: number) => pt(P, wallOf(P, 40, 1))
  const fail = (points: unknown[]) => solveCalibration({ points, psuWatts: PSU, efficiency: eta0 }).error

  it('needs exactly two points and a PSU', () => {
    expect(fail([ok(80)])).toBe('need_two_points')
    expect(solveCalibration({ points: [ok(80), ok(300)], psuWatts: 0, efficiency: eta0 }).error).toBe('no_psu')
  })
  it('rejects points closer than 20 W of measured CPU+GPU', () => {
    expect(fail([ok(80), ok(99)])).toBe('too_close')
  })
  it('rejects a step that passes 20 W but cannot pin the efficiency down (ill-conditioned)', () => {
    const r = solveCalibration({ points: [ok(80), ok(110)], psuWatts: PSU, efficiency: eta0 })
    expect(r.error).toBe('ill_conditioned')
    expect(r.sigma.effPct).toBeGreaterThan(3)
  })
  it('rejects a wall reading at or below the measured DC power', () => {
    expect(fail([pt(80, 75), ok(300)])).toBe('wall_below_dc')
    expect(fail([pt(80, 80), ok(300)])).toBe('wall_below_dc')
    expect(checkPoint(pt(300, 299))).toBe('wall_below_dc')
  })
  it('rejects a reading that would need more than 99 % efficiency even with no hidden load', () => {
    expect(fail([pt(80, 80.5), ok(300)])).toBe('eff_impossible')
  })
  it('rejects a wall that did not rise with the load', () => {
    expect(fail([pt(80, 200), pt(150, 195)])).toBe('wall_not_rising')
  })
  it('rejects a fit whose efficiency is outside 60-99 %', () => {
    // a PSU that would be 50 % efficient: plausible point by point, impossible as a PSU
    expect(fail([pt(80, wallOf(80, 40, 0.57)), pt(330, wallOf(330, 40, 0.57))])).toBe('eff_out_of_range')
  })
  it('rejects a negative or absurd hidden draw', () => {
    expect(fail([pt(100, wallOf(100, -15, 0.85)), pt(330, wallOf(330, -15, 0.85))])).toBe('extra_negative')
    const hi = solveCalibration({ points: [pt(100, wallOf(100, 450, 1, 3000)), pt(400, wallOf(400, 450, 1, 3000))], psuWatts: 3000, efficiency: eta0 })
    expect(hi.error).toBe('extra_too_high')
  })
  it('rejects readings no (x, k) can explain together', () => {
    // the wall rises 10x faster than the DC power: would need ~10 % efficiency at the margin and a huge negative x
    expect(['no_solution', 'extra_negative', 'eff_out_of_range']).toContain(fail([pt(80, 100), pt(300, 2500)]))
  })
  it('rejects a point that was not stable', () => {
    expect(fail([{ ...ok(80), spread: CAL_MAX_SPREAD + 0.01 }, ok(300)])).toBe('unstable')
  })
})

describe('wall calibration: sampling window and readings', () => {
  const series = (n: number, f: (i: number) => number, dt = 1000) => Array.from({ length: n }, (_, i) => ({ t: i * dt, w: f(i) }))
  it('accepts a window that varied at most 5 %', () => {
    const s = windowStats(series(11, (i) => 300 + (i % 2 ? 6 : -6)), 10000)
    expect(s.stable).toBe(true)
    expect(s.mean).toBeCloseTo(300 - 6 / 11, 3)
    expect(s.spread).toBeCloseTo(12 / s.mean, 6)
  })
  it('rejects a window that varied more than 5 %, one too short or too sparse', () => {
    expect(windowStats(series(11, (i) => (i === 5 ? 330 : 300)), 10000).reason).toBe('unstable')
    expect(windowStats(series(11, () => 300, 300), 3000).reason).toBe('short')
    expect(windowStats(series(3, () => 300, 5000), 10000).reason).toBe('few_samples')
    expect(windowStats([], 0).stable).toBe(false)
  })
  it('only looks at the last window and skips missing readings', () => {
    const s = windowStats([...series(20, (i) => (i < 9 ? 100 : 300)), { t: 19500, w: null }], 19000)
    expect(s.min).toBe(300)
    expect(s.n).toBe(11)
  })
  it('turns V x A x PF into watts and rejects impossible inputs', () => {
    expect(readingWatts({ mode: 'vapf', volts: 127, amps: 2.5, pf: 0.98 })).toEqual({ ok: true, watts: 127 * 2.5 * 0.98 })
    expect(readingWatts({ watts: '312.5' })).toEqual({ ok: true, watts: 312.5 })
    expect(readingWatts({ watts: '' }).error).toBe('bad_watts')
    expect(readingWatts({ watts: 4 }).error).toBe('bad_watts')
    expect(readingWatts({ mode: 'vapf', volts: 12, amps: 2, pf: 1 }).error).toBe('bad_volts')
    expect(readingWatts({ mode: 'vapf', volts: 220, amps: 0, pf: 1 }).error).toBe('bad_amps')
    expect(readingWatts({ mode: 'vapf', volts: 220, amps: 1, pf: 1.2 }).error).toBe('bad_pf')
    expect(readingSigma(50)).toBe(1)
    expect(readingSigma(400)).toBe(4)
  })
})

describe('wall calibration: hardware binding and application', () => {
  const settings = normalizePower({ psuWatts: 750, psuRating: 'gold' })
  const hw = { gpu: { name: 'NVIDIA GeForce RTX 4070', power: 200 }, cpu: { name: 'AMD Ryzen 7 7800X3D', power: 60 } }
  const id = calHardwareId({ gpuName: hw.gpu.name, cpuName: hw.cpu.name, settings })

  it('binds to GPU + CPU names and the PSU selection, nothing else', () => {
    expect(id).toBe('gpu=NVIDIA GeForce RTX 4070|cpu=AMD Ryzen 7 7800X3D|psu=750W:gold')
    expect(calHardwareId({ gpuName: null, cpuName: 'x', settings })).toBeNull()
    expect(calHardwareId({ gpuName: 'g', cpuName: 'c', settings: { ...settings, psuWatts: 850 } })).not.toBe(calHardwareId({ gpuName: 'g', cpuName: 'c', settings }))
    expect(calibrationState(null, id)).toBe('none')
    expect(calibrationState({ hwId: id }, null)).toBe('unverified')
  })

  it('applies a matching calibration and ignores it, visibly, when the hardware changed', () => {
    const powerCal = { at: 1700000000000, hwId: id, extraW: 55, effScale: 0.96, points: [], sigma: { extraW: 3, effPct: 1 } }
    const d = buildDerived({ hw, sensors: {}, settings: { ...settings, powerCal }, energy: null })
    expect(d.calibration.state).toBe('applied')
    expect(d.system.calibrated).toBe(true)
    expect(d.system.est).toBe(true) // still an estimate
    expect(d.system.dcW).toBe(315) // 200 + 60 + calibrated 55, not the typed 40
    expect(d.system.efficiency).toBeCloseTo(psuEfficiency(315 / 750, gold) * 0.96, 6)

    const other = buildDerived({ hw: { ...hw, gpu: { ...hw.gpu, name: 'AMD Radeon RX 7900 XT' } }, sensors: {}, settings: { ...settings, powerCal }, energy: null })
    expect(other.calibration.state).toBe('mismatch')
    expect(other.calibration.at).toBe(powerCal.at)
    expect(other.system.calibrated).toBe(false)
    expect(other.system.dcW).toBe(300) // back to the typed extra
  })

  it('caps the scaled efficiency at 99 % and validates stored calibrations', () => {
    const r = systemPower({ gpuW: 300, cpuW: 50, psuWatts: 750, rating: 'titanium', cal: { extraW: 0, effScale: 1.2 } })
    expect(r.efficiency).toBe(99)
    expect(normalizeCalibration({ at: 1, hwId: 'x', extraW: -3, effScale: 1 })).toBeNull()
    expect(normalizeCalibration({ at: 1, hwId: 'x', extraW: 30, effScale: 9 })).toBeNull()
    expect(normalizeCalibration({ at: 1, hwId: '', extraW: 30, effScale: 1 })).toBeNull()
    expect(normalizeCalibration({ at: 1, hwId: 'x', extraW: 30, effScale: 1 })).toMatchObject({ extraW: 30, effScale: 1 })
    expect(normalizePower({ powerCal: { at: 1, hwId: 'x', extraW: 30, effScale: 1 } }).powerCal).not.toBeNull()
  })
})
