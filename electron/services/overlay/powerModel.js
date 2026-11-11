// Derived power numbers for the overlay and the System Monitor: FPS per watt, energy per frame, energy integrated over
// the session, PSU load and efficiency from an 80 Plus curve, DC and wall (AC) totals, and what that costs. Pure.
//
// Everything here that is not a direct reading is an ESTIMATE and the UI marks it with "*": the PSU curve is the 80 Plus
// certification points (plus an approximation below 20 % load), "additional components" is a number the user types, and
// the cost uses the user's tariff. A missing input (for example CPU power without admin) is reported in `missing`, never
// replaced by zero.
//
// Optional inputs that make the wall figure closer to reality (still an estimate):
//   - psuModel: a real PSU picked from the 80 PLUS catalog (psuCatalog.js) fills psuWatts and the 4-point custom curve.
//   - powerCal: a two-point watt-meter calibration (wallCalibration.js) replaces `extraWatts` with the fitted hidden DC
//     draw and scales the curve. It only applies while the GPU, CPU and PSU selection match the ones it was made with.

import { normalizeCalibration, calHardwareId, calibrationState } from './wallCalibration.js'

/** 80 Plus efficiency at 10 / 20 / 50 / 100 % load (115 V). 10 % is only certified for Titanium; for the others it is an
 *  approximation (20 % point minus 5), as is everything below 10 %. */
export const PSU_RATINGS = {
  white: [75, 80, 80, 80],
  bronze: [77, 82, 85, 82],
  silver: [80, 85, 88, 85],
  gold: [82, 87, 90, 87],
  platinum: [85, 90, 92, 89],
  titanium: [90, 92, 94, 90]
}
export const PSU_RATING_IDS = [...Object.keys(PSU_RATINGS), 'custom']
const POINTS = [0.1, 0.2, 0.5, 1]

/** Curve as [[loadFraction, efficiencyPercent], ...] ascending. `custom` is [e10, e20, e50, e100] typed by the user. */
export function psuCurve(rating, custom) {
  let effs = PSU_RATINGS[rating]
  if (rating === 'custom' && Array.isArray(custom) && custom.length === 4 && custom.every((x) => Number.isFinite(Number(x)) && Number(x) >= 50 && Number(x) <= 99.9)) effs = custom.map(Number)
  if (!effs) effs = PSU_RATINGS.gold
  const curve = POINTS.map((p, i) => [p, effs[i]])
  // below 10 % load efficiency falls off fast: approximate one more point at 5 % (not part of any certification)
  return [[0.05, Math.max(50, effs[0] - 8)], ...curve]
}

/** Efficiency (percent) at a load fraction (0..1+): linear between points, flat outside the curve. */
export function psuEfficiency(loadFraction, curve) {
  if (!Number.isFinite(loadFraction) || !curve?.length) return null
  if (loadFraction <= curve[0][0]) return curve[0][1]
  for (let i = 1; i < curve.length; i++) {
    const [x1, y1] = curve[i]
    if (loadFraction <= x1) {
      const [x0, y0] = curve[i - 1]
      return y0 + ((y1 - y0) * (loadFraction - x0)) / (x1 - x0)
    }
  }
  return curve[curve.length - 1][1]
}

const num = (x) => (x != null && x !== '' && Number.isFinite(Number(x)) ? Number(x) : null)
const posNum = (x) => { const v = num(x); return v != null && v > 0 ? v : null }

/** Frames per second per watt (higher is better). */
export function fpsPerWatt(fps, watts) { const f = posNum(fps), w = posNum(watts); return f != null && w != null ? f / w : null }
/** Joules spent per rendered frame. */
export function joulesPerFrame(watts, fps) { const f = posNum(fps), w = posNum(watts); return f != null && w != null ? w / f : null }

/**
 * Energy over a session. GPU: the NVML driver counter (exact, in joules) when it exists, otherwise power integrated over
 * time (trapezoid). CPU: always integrated power. Gaps longer than MAX_GAP_S (sleep, a stalled helper) are not integrated.
 */
export const MAX_GAP_S = 5
export class EnergyMeter {
  constructor() { this.reset() }

  reset() {
    this.t = null
    this.prev = { gpuW: null, cpuW: null }
    this.gpuJ = 0
    this.cpuJ = 0
    this.seconds = 0
    this.counterBase = null
    this.counterNow = null
  }

  push(tMs, { gpuW = null, cpuW = null, counterJ = null } = {}) {
    if (!Number.isFinite(tMs)) return
    const c = num(counterJ)
    if (c != null) {
      // a counter that went backwards means the driver was reloaded: start again from here
      if (this.counterBase == null || c < this.counterBase) this.counterBase = c
      this.counterNow = c
    }
    if (this.t != null) {
      const dt = (tMs - this.t) / 1000
      if (dt > 0 && dt <= MAX_GAP_S) {
        this.seconds += dt
        const mid = (a, b) => (a != null && b != null ? (a + b) / 2 : null)
        const g = mid(this.prev.gpuW, num(gpuW)), p = mid(this.prev.cpuW, num(cpuW))
        if (g != null) this.gpuJ += g * dt
        if (p != null) this.cpuJ += p * dt
      }
    }
    this.t = tMs
    this.prev = { gpuW: num(gpuW), cpuW: num(cpuW) }
  }

  get hasCounter() { return this.counterBase != null && this.counterNow != null }
  gpuJoules() { return this.hasCounter ? Math.max(0, this.counterNow - this.counterBase) : this.gpuJ }
  cpuJoules() { return this.cpuJ }
}

/** DC load, PSU load %, efficiency and wall (AC) power. `partial`: some measured input was missing.
 *  cal: { extraW, effScale } from an applied calibration (replaces extraW, scales the curve; capped at 99 %). */
export function systemPower({ gpuW, cpuW, extraW, psuWatts, rating, custom, cal = null }) {
  const g = num(gpuW), c = num(cpuW), x = Math.max(0, num(cal?.extraW) ?? num(extraW) ?? 0)
  const scale = num(cal?.effScale) ?? 1
  const missing = []
  if (g == null) missing.push('gpu')
  if (c == null) missing.push('cpu')
  if (g == null && c == null) return { dcW: null, loadPct: null, efficiency: null, acW: null, lossW: null, missing, partial: true }
  const dcW = (g ?? 0) + (c ?? 0) + x
  const psu = posNum(psuWatts)
  const loadPct = psu != null ? (dcW / psu) * 100 : null
  const base = loadPct != null ? psuEfficiency(loadPct / 100, psuCurve(rating, custom)) : null
  const efficiency = base != null ? Math.min(99, base * scale) : null
  const acW = efficiency != null ? dcW / (efficiency / 100) : null
  return { dcW, loadPct, efficiency, acW, lossW: acW != null ? acW - dcW : null, missing, partial: missing.length > 0 }
}

/** Cost of a constant power draw. Day = hoursPerDay hours, month = 30 days, year = 365 days. */
export function costOf(watts, tariff, hoursPerDay = 24) {
  const w = num(watts), t = num(tariff)
  if (w == null || w < 0) return null
  const h = Math.min(24, Math.max(0, num(hoursPerDay) ?? 24))
  const kwhHour = w / 1000
  const kwhDay = kwhHour * h
  const out = { kwhHour, kwhDay, kwhMonth: kwhDay * 30, kwhYear: kwhDay * 365, perHour: null, perDay: null, perMonth: null, perYear: null }
  if (t != null && t >= 0) Object.assign(out, { perHour: kwhHour * t, perDay: kwhDay * t, perMonth: kwhDay * 30 * t, perYear: kwhDay * 365 * t })
  return out
}

export const POWER_DEFAULTS = { psuWatts: 750, psuRating: 'gold', psuCustom: [82, 87, 90, 87], extraWatts: 40, tariff: 0.9, hoursPerDay: 24, psuModel: null, mainsVoltage: null, powerCal: null }
export const MAINS_VOLTAGES = ['115', '230']

const str = (v, max) => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null)
/** A catalog PSU kept only while the settings still say what it set (watts + custom curve); editing either drops it. */
function normalizeModel(m, s) {
  if (!m || typeof m !== 'object') return null
  const curve = Array.isArray(m.curve) && m.curve.length === 4 ? m.curve.map(Number) : null
  const out = {
    id: str(m.id, 200), brand: str(m.brand, 80), model: str(m.model, 120), watts: num(m.watts), rating: str(m.rating, 20),
    voltage: MAINS_VOLTAGES.includes(String(m.voltage)) ? String(m.voltage) : null, category: str(m.category, 40), approx10: Boolean(m.approx10),
    certified: str(m.certified, 20), curve
  }
  if (!out.id || !out.brand || !out.model || !out.watts || !out.voltage || !curve || curve.some((x) => !Number.isFinite(x))) return null
  if (s.psuRating !== 'custom' || s.psuWatts !== Math.round(out.watts) || s.psuCustom.some((x, i) => Math.abs(x - curve[i]) > 0.051)) return null
  return out
}

export function normalizePower(s = {}) {
  const clamp = (v, lo, hi, d) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Math.min(hi, Math.max(lo, Number(v))) : d)
  const custom = Array.isArray(s.psuCustom) && s.psuCustom.length === 4 ? s.psuCustom.map((x, i) => clamp(x, 50, 99.9, POWER_DEFAULTS.psuCustom[i])) : [...POWER_DEFAULTS.psuCustom]
  const out = {
    psuWatts: Math.round(clamp(s.psuWatts, 100, 3000, POWER_DEFAULTS.psuWatts)),
    psuRating: PSU_RATING_IDS.includes(s.psuRating) ? s.psuRating : POWER_DEFAULTS.psuRating,
    psuCustom: custom,
    extraWatts: Math.round(clamp(s.extraWatts, 0, 1000, POWER_DEFAULTS.extraWatts)),
    tariff: Math.round(clamp(s.tariff, 0, 100, POWER_DEFAULTS.tariff) * 10000) / 10000,
    hoursPerDay: clamp(s.hoursPerDay, 0.25, 24, POWER_DEFAULTS.hoursPerDay),
    mainsVoltage: MAINS_VOLTAGES.includes(String(s.mainsVoltage)) ? String(s.mainsVoltage) : null,
    psuModel: null,
    powerCal: normalizeCalibration(s.powerCal)
  }
  out.psuModel = normalizeModel(s.psuModel, out)
  return out
}

/** Calibration status for the current hardware, and the parameters to apply (only when state is 'applied'). */
export function calibrationFor(settings, hw) {
  const cal = settings.powerCal
  const hwId = calHardwareId({ gpuName: hw?.gpu?.name, cpuName: hw?.cpu?.name, settings })
  const state = calibrationState(cal, hwId)
  return {
    state, hwId, at: cal?.at ?? null,
    extraW: cal?.extraW ?? null, effScale: cal?.effScale ?? null, sigma: cal?.sigma ?? null,
    apply: state === 'applied' ? { extraW: cal.extraW, effScale: cal.effScale } : null
  }
}

/**
 * Everything derived, from the sensors and the user's PSU/tariff settings.
 * frames: FrameWindow.stats(); session: SessionStats.stats(); hw: readLhm(); energy: an EnergyMeter.
 * `est: true` marks a value that is an estimate (shown with "*").
 */
export function buildDerived({ frames, session, hw, sensors, settings, energy }) {
  const p = normalizePower(settings)
  const gpuW = posNum(hw?.nvml?.powerW) ?? posNum(hw?.gpu?.power)
  // CPU power only counts when the sensor really read it (null without admin/PawnIO)
  const cpuW = posNum(hw?.cpu?.power) ?? posNum(sensors?.cpuPower)
  const fps = frames?.fps ?? null
  const cal = calibrationFor(p, hw)
  const sys = systemPower({ gpuW, cpuW, extraW: p.extraWatts, psuWatts: p.psuWatts, rating: p.psuRating, custom: p.psuCustom, cal: cal.apply })

  const gpuJ = energy ? energy.gpuJoules() : null
  const cpuJ = energy ? energy.cpuJoules() : null
  const frameCount = session?.frames ?? null
  const hasEnergy = energy && energy.seconds > 0 && gpuJ != null && gpuJ > 0

  const scenario = (w) => costOf(w, p.tariff, p.hoursPerDay)
  return {
    settings: p,
    gpuW, cpuW,
    efficiency: {
      fpsPerWatt: fpsPerWatt(fps, gpuW),
      fpsPerWattAvg: hasEnergy && frameCount ? frameCount / gpuJ : null,
      joulesPerFrame: joulesPerFrame(gpuW, fps),
      joulesPerFrameAvg: hasEnergy && frameCount ? gpuJ / frameCount : null,
      fpsPerWattSystem: gpuW != null && cpuW != null ? fpsPerWatt(fps, gpuW + cpuW) : null
    },
    energy: {
      gpuKj: gpuJ != null && (energy.hasCounter || energy.seconds > 0) ? gpuJ / 1000 : null,
      cpuKj: cpuJ != null && cpuJ > 0 ? cpuJ / 1000 : null,
      source: energy?.hasCounter ? 'nvml' : energy?.seconds > 0 ? 'integrated' : null,
      seconds: energy?.seconds ?? 0
    },
    system: { ...sys, est: true, calibrated: cal.state === 'applied', extraW: sys.dcW != null ? Math.max(0, cal.apply?.extraW ?? p.extraWatts) : null },
    calibration: { state: cal.state, at: cal.at, hwId: cal.hwId, extraW: cal.extraW, effScale: cal.effScale, sigma: cal.sigma },
    cost: {
      est: true,
      gpu: gpuW != null ? scenario(gpuW) : null,
      cpuGpu: gpuW != null && cpuW != null ? scenario(gpuW + cpuW) : null,
      withExtra: sys.dcW != null ? scenario(sys.dcW) : null,
      wall: sys.acW != null ? scenario(sys.acW) : null
    }
  }
}
