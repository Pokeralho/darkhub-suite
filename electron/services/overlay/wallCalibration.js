// Two-point wall (AC) calibration with a plug-in watt-meter. Pure: no I/O, no Electron. Used by powerModel.js (apply)
// and overlayIpc.js (solve and save).
//
// MODEL
//   The app measures P = GPU board power + CPU package power (DC, from the sensors). What it cannot measure is the rest
//   of the DC load (motherboard, RAM, SSDs, fans, USB, CPU VRM losses...) and the real efficiency of this PSU:
//
//       W = (P + x) / eta(L),   eta(L) = k * eta0(L),   L = (P + x) / psuWatts
//
//   W: wall reading. eta0: the selected PSU curve (80 PLUS rating, catalog model or custom). Unknowns:
//     x  hidden DC draw in watts (assumed constant between idle and load),
//     k  one multiplicative correction of the whole curve (its SHAPE is kept, its LEVEL is fitted).
//
// WHY THESE TWO PARAMETERS
//   Over the idle-to-load range a PSU curve is nearly flat (a few points). With eta constant the model is a straight
//   line, W = P / (k eta) + x / (k eta): two points fix exactly a slope and an intercept, so (x, k) are identified and
//   the fit is linear-like (the curve shape only bends it slightly; it is solved exactly below). Any other pair, for
//   example two independent curve points, or x plus the curve's slope, would need the curvature between two readings and
//   is hopelessly ill-conditioned with a +-1 % meter.
//
// SOLVING
//   For a given x each point implies k_i(x) = (P_i + x) / (W_i * eta0(L_i(x))). The fit is the x where k_1 = k_2:
//   f(x) = k_1(x) - k_2(x) is scanned for a sign change over [-50 W, 500 W] (the only range where x can mean something)
//   and refined by bisection. No root or more than one root: rejected (no consistent solution). With eta0 flat, x = (P2 W1 - P1 W2) / (W2 - W1).
//
// CONDITIONING
//   The slope comes from a difference: dW / dP. A +-1 % meter error on two readings over a 20 W step moves the slope by
//   ~10 %, i.e. ~9 efficiency points. So besides the hard 20 W minimum step, the uncertainty of the result is propagated
//   numerically: each input (both wall readings at max(1 W, 1 %) and both measured powers at their window standard
//   deviation) is moved by one sigma, the fit is redone and the changes are added in quadrature. The fit is rejected
//   when the efficiency is uncertain by more than MAX_EFF_SIGMA points or x by more than MAX_EXTRA_SIGMA watts. In
//   practice that asks for a load step of roughly 70 W or more, which a GPU load gives.
//
// LIMITS (also shown to the user as "estimate")
//   - x and k are EFFECTIVE values: k also absorbs any proportional sensor error (GPU board power accuracy, CPU VRM
//     losses that scale with CPU power) and x anything constant. They are not a lab measurement of the PSU.
//   - x is assumed to be the same at idle and under load (fans and pumps speeding up break that a little).
//   - The fit is anchored at two GPU-heavy points; a CPU-heavy or very low load is extrapolated.
//   - The result is only valid for the hardware and PSU selection it was made with (see calHardwareId).

export const CAL_WINDOW_MS = 10000 // a point is the mean of the last 10 s of measured CPU+GPU power
export const CAL_MAX_SPREAD = 0.05 // (max - min) / mean over the window
export const CAL_MIN_SAMPLES = 5
export const CAL_MIN_DELTA_W = 20 // the two points must differ by at least this much measured CPU+GPU power
export const EFF_MIN = 60
export const EFF_MAX = 99
export const MAX_EFF_SIGMA = 3 // efficiency points
export const MAX_EXTRA_SIGMA = 15 // watts
export const EXTRA_MAX = 400 // a hidden DC draw beyond this is not a desktop PC, it is a reading error
const X_SCAN_MIN = -50 // the root is only searched where it can mean something; outside: rejected
const X_SCAN_MAX = EXTRA_MAX + 100
const SCAN_STEPS = 400

const num = (x) => (x != null && x !== '' && Number.isFinite(Number(x)) ? Number(x) : null)

/** Assumed 1-sigma error of a plug-in watt-meter reading: 1 % or 1 W, whichever is larger. */
export const readingSigma = (w) => Math.max(1, 0.01 * Math.abs(w))

/**
 * Wall reading from what the user typed: watts, or volts x amps x power factor (a meter that shows V, A and PF).
 * Returns { ok, watts } or { ok: false, error }.
 */
export function readingWatts(input = {}) {
  if (input.mode === 'vapf') {
    const v = num(input.volts), a = num(input.amps), pf = num(input.pf)
    if (v == null || v < 90 || v > 260) return { ok: false, error: 'bad_volts' }
    if (a == null || a <= 0 || a > 20) return { ok: false, error: 'bad_amps' }
    if (pf == null || pf < 0.3 || pf > 1) return { ok: false, error: 'bad_pf' }
    return { ok: true, watts: v * a * pf }
  }
  const w = num(input.watts)
  if (w == null || w < 5 || w > 3000) return { ok: false, error: 'bad_watts' }
  return { ok: true, watts: w }
}

/**
 * Stability of measured CPU+GPU power over the last `windowMs`. samples: [{ t, w }] (ms, W), any order; null w skipped.
 * stable: enough samples, the window is covered (>= 80 %), and (max - min) / mean <= CAL_MAX_SPREAD.
 */
export function windowStats(samples, nowMs, windowMs = CAL_WINDOW_MS) {
  const xs = (samples || []).filter((s) => s && Number.isFinite(s.t) && num(s.w) != null && s.t <= nowMs && s.t >= nowMs - windowMs)
    .sort((a, b) => a.t - b.t)
  const n = xs.length
  if (n === 0) return { n, mean: null, min: null, max: null, std: null, spread: null, coverage: 0, stable: false, reason: 'few_samples' }
  const ws = xs.map((s) => Number(s.w))
  const mean = ws.reduce((a, b) => a + b, 0) / n
  const min = Math.min(...ws), max = Math.max(...ws)
  const std = Math.sqrt(ws.reduce((a, b) => a + (b - mean) ** 2, 0) / n)
  const spread = mean > 0 ? (max - min) / mean : null
  const coverage = (xs[n - 1].t - xs[0].t) / windowMs
  const reason = n < CAL_MIN_SAMPLES ? 'few_samples' : coverage < 0.8 ? 'short' : spread == null || spread > CAL_MAX_SPREAD ? 'unstable' : null
  return { n, mean, min, max, std, spread, coverage, stable: reason == null, reason }
}

/** A single point before fitting: { measW, wallW, spread?, std? }. Returns null when acceptable, otherwise an error code. */
export function checkPoint(p) {
  const P = num(p?.measW), W = num(p?.wallW)
  if (P == null || P <= 0) return 'no_measurement'
  if (W == null || W <= 0) return 'bad_watts'
  if (p.spread != null && !(num(p.spread) <= CAL_MAX_SPREAD)) return 'unstable'
  // eta >= P / W even with no hidden load at all: the wall cannot be at or below the measured DC power
  if (W <= P) return 'wall_below_dc'
  if ((P / W) * 100 > EFF_MAX) return 'eff_impossible'
  return null
}

/** Core fit of (x, k) from two (P, W) points and an efficiency function eta0(loadFraction) -> percent. Null: no unique root. */
function fitXk(P1, W1, P2, W2, psuWatts, eta0) {
  const k = (P, W, x) => {
    const e = eta0((P + x) / psuWatts)
    return e > 0 ? (P + x) / (W * (e / 100)) : NaN
  }
  const f = (x) => k(P1, W1, x) - k(P2, W2, x)
  const lo = Math.max(-P1 + 1, X_SCAN_MIN)
  const step = (X_SCAN_MAX - lo) / SCAN_STEPS
  const roots = []
  let a = lo, fa = f(a)
  for (let i = 1; i <= SCAN_STEPS; i++) {
    const b = lo + i * step, fb = f(b)
    if (Number.isFinite(fa) && Number.isFinite(fb) && (fa === 0 || fa * fb < 0)) roots.push([a, b, fa])
    a = b; fa = fb
  }
  if (roots.length !== 1) return null
  let [x0, x1, f0] = roots[0]
  for (let i = 0; i < 80; i++) {
    const m = (x0 + x1) / 2, fm = f(m)
    if (fm === 0) { x0 = x1 = m; break }
    if (fm * f0 < 0) x1 = m; else { x0 = m; f0 = fm }
  }
  const x = (x0 + x1) / 2
  const kk = (k(P1, W1, x) + k(P2, W2, x)) / 2
  if (!Number.isFinite(x) || !Number.isFinite(kk)) return null
  return { x, k: kk, eff: [kk * eta0((P1 + x) / psuWatts), kk * eta0((P2 + x) / psuWatts)] }
}

/**
 * Solve the calibration from two points. points: [{ measW, wallW, std?, spread? }] (any order).
 * psuWatts: PSU rated power; efficiency(loadFraction) -> percent from the selected curve.
 * Returns { ok: true, extraW, effScale, effAt: [low, high], sigma: { extraW, effPct }, points } or { ok: false, error }.
 */
export function solveCalibration({ points, psuWatts, efficiency }) {
  if (!Array.isArray(points) || points.length !== 2) return { ok: false, error: 'need_two_points' }
  const psu = num(psuWatts)
  if (psu == null || psu <= 0 || typeof efficiency !== 'function') return { ok: false, error: 'no_psu' }
  for (const p of points) { const e = checkPoint(p); if (e) return { ok: false, error: e } }
  const [a, b] = [...points].map((p) => ({ P: Number(p.measW), W: Number(p.wallW), sP: Math.max(0, num(p.std) ?? 0) })).sort((u, v) => u.P - v.P)
  if (b.P - a.P < CAL_MIN_DELTA_W) return { ok: false, error: 'too_close' }
  if (b.W <= a.W) return { ok: false, error: 'wall_not_rising' }

  const fit = fitXk(a.P, a.W, b.P, b.W, psu, efficiency)
  if (!fit) return { ok: false, error: 'no_solution' }
  if (fit.x < -5) return { ok: false, error: 'extra_negative' }
  if (fit.x > EXTRA_MAX) return { ok: false, error: 'extra_too_high' }
  if (fit.eff.some((e) => !(e >= EFF_MIN && e <= EFF_MAX))) return { ok: false, error: 'eff_out_of_range' }

  // one-sigma moves of every input, refit, add in quadrature
  const moves = [[readingSigma(a.W), 0, 0, 0], [0, readingSigma(b.W), 0, 0], [0, 0, a.sP, 0], [0, 0, 0, b.sP]]
  let vx = 0, ve = 0
  for (const [dW1, dW2, dP1, dP2] of moves) {
    if (!dW1 && !dW2 && !dP1 && !dP2) continue
    const g = fitXk(a.P + dP1, a.W + dW1, b.P + dP2, b.W + dW2, psu, efficiency)
    if (!g) return { ok: false, error: 'ill_conditioned' }
    vx += (g.x - fit.x) ** 2
    ve += Math.max((g.eff[0] - fit.eff[0]) ** 2, (g.eff[1] - fit.eff[1]) ** 2)
  }
  const sigma = { extraW: Math.sqrt(vx), effPct: Math.sqrt(ve) }
  if (sigma.effPct > MAX_EFF_SIGMA || sigma.extraW > MAX_EXTRA_SIGMA) return { ok: false, error: 'ill_conditioned', sigma }

  return {
    ok: true,
    extraW: Math.max(0, fit.x),
    effScale: fit.k,
    effAt: fit.eff,
    sigma,
    points: [a, b].map((p) => ({ measW: p.P, wallW: p.W }))
  }
}

/** What a calibration is bound to: GPU and CPU names plus the PSU selection. No serial numbers. Null if a name is unknown. */
export function calHardwareId({ gpuName, cpuName, settings = {} }) {
  const g = typeof gpuName === 'string' ? gpuName.trim() : ''
  const c = typeof cpuName === 'string' ? cpuName.trim() : ''
  if (!g || !c) return null
  const s = settings
  let psu = `${s.psuWatts}W:${s.psuRating}`
  if (s.psuRating === 'custom' && Array.isArray(s.psuCustom)) psu += `:${s.psuCustom.join('/')}`
  if (s.psuModel?.id) psu += `:${s.psuModel.id}@${s.psuModel.voltage}`
  return `gpu=${g}|cpu=${c}|psu=${psu}`
}

/** Stored calibration, validated (settings are user-editable JSON). Null when absent or malformed. */
export function normalizeCalibration(c) {
  if (!c || typeof c !== 'object') return null
  const at = num(c.at), x = num(c.extraW), k = num(c.effScale)
  if (at == null || at <= 0 || x == null || x < 0 || x > EXTRA_MAX || k == null || k < 0.5 || k > 1.5) return null
  if (typeof c.hwId !== 'string' || !c.hwId || c.hwId.length > 400) return null
  const pts = Array.isArray(c.points) ? c.points.slice(0, 2).map((p) => ({ measW: num(p?.measW), wallW: num(p?.wallW) })).filter((p) => p.measW != null && p.wallW != null) : []
  const sx = num(c.sigma?.extraW), se = num(c.sigma?.effPct)
  return { at, hwId: c.hwId, extraW: x, effScale: k, points: pts, sigma: { extraW: sx, effPct: se } }
}

/**
 * Whether a stored calibration applies to the current hardware.
 * state: 'none' (no calibration), 'applied', 'mismatch' (hardware or PSU selection changed), 'unverified' (the sensors
 * do not report the GPU/CPU names yet, so the binding cannot be checked: not applied).
 */
export function calibrationState(cal, currentHwId) {
  if (!cal) return 'none'
  if (!currentHwId) return 'unverified'
  return cal.hwId === currentHwId ? 'applied' : 'mismatch'
}
