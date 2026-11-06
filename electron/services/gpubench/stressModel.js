// GPU stress test: plan and verdict. Pure. The scene is deterministic, so a frame rendered hot must equal the same frame
// rendered at the start, bit for bit: any difference is a calculation error, the sign of an unstable GPU.

export const STABILITY_PASS = 97 // % worst loop / best loop, per test
export const LOOP_MS = 30000
export const DURATIONS = [5, 10, 20, 60]
export const LOADS = ['alternate', 'raster', 'rt']
export const DEFAULT_TEMP_LIMIT = 95
export const MIN_TEMP_LIMIT = 70
export const MAX_TEMP_LIMIT = 100
export const CHECK_FRAME = 240
export const CLOCK_DROP_WARN = 5 // %
export const CLOCK_STEADY = 2 // % below this the GPU held its speed: lost frame rate came from somewhere else

export function normalizeStress({ minutes, load, tempLimit } = {}) {
  const limit = Number(tempLimit)
  return {
    minutes: DURATIONS.includes(Number(minutes)) ? Number(minutes) : 10,
    load: LOADS.includes(load) ? load : 'alternate',
    tempLimit: Number.isFinite(limit) ? Math.min(MAX_TEMP_LIMIT, Math.max(MIN_TEMP_LIMIT, Math.round(limit))) : DEFAULT_TEMP_LIMIT
  }
}

/** Which test each loop runs. A GPU without DXR 1.1 runs rasterization whatever was asked. */
export function stressPlan({ minutes, load, dxr, loopMs = LOOP_MS }) {
  const loops = Math.max(1, Math.round((minutes * 60000) / loopMs))
  const tests = !dxr || load === 'raster' ? ['raster'] : load === 'rt' ? ['rt'] : ['raster', 'rt']
  return { tests, loops: Array.from({ length: loops }, (_, i) => tests[i % tests.length]) }
}

/** The engine reports a lost device through the D3D error codes; those are a failed test, not an app error. */
export const isDeviceLost = (message) => /0x887A00(05|06|07|20)|device.*(removed|hung|reset)/i.test(String(message))

const finite = (xs) => xs.filter((x) => Number.isFinite(x))
const round1 = (x) => Math.round(x * 10) / 10

/** Worst loop over best loop, in %, for the least stable test. Null until a test has two loops. */
export function stability(loops) {
  const pct = []
  for (const test of new Set(loops.map((l) => l.test))) {
    const fps = finite(loops.filter((l) => l.test === test).map((l) => l.fps)).filter((x) => x > 0)
    if (fps.length >= 2) pct.push((Math.min(...fps) / Math.max(...fps)) * 100)
  }
  return pct.length ? round1(Math.min(...pct)) : null
}

/** Average clock of the last loops against the first ones, per test: how far the GPU fell once hot. */
function clockDrop(loops) {
  const drops = []
  for (const test of new Set(loops.map((l) => l.test))) {
    const clocks = finite(loops.filter((l) => l.test === test).map((l) => l.clock))
    if (clocks.length < 2) continue
    const n = Math.max(1, Math.floor(clocks.length / 4))
    const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
    const start = avg(clocks.slice(0, n))
    if (start > 0) drops.push(((start - avg(clocks.slice(-n))) / start) * 100)
  }
  return drops.length ? round1(Math.max(0, ...drops)) : null
}

/**
 * Verdict. `stop` says why it ended early: 'cancelled', 'temp_limit', 'device_lost', 'engine_crashed' or null.
 * A run stopped by the user or by the temperature limit is not a pass, and not a failure of stability either.
 * Frame rate that moves while the clock holds is 'inconclusive': on a real PC that is another program using the GPU, not
 * a bad card, and telling someone with Discord open that the GPU failed would be a false alarm. Without clock readings
 * the two cannot be told apart, so it stays a failure and the text says to rule that out.
 */
export function summarizeStress({ loops, stop = null, planned = loops.length, tempLimit = DEFAULT_TEMP_LIMIT }) {
  const errors = loops.reduce((a, l) => a + (l.error ? 1 : 0), 0)
  const stab = stability(loops)
  const reasons = []
  if (stop === 'device_lost' || stop === 'engine_crashed') reasons.push(stop)
  if (errors > 0) reasons.push('errors')
  const drop = clockDrop(loops)
  const unstable = stab != null && stab < STABILITY_PASS
  const noisy = unstable && drop != null && drop < CLOCK_STEADY
  if (unstable && !noisy) reasons.push('fps_unstable')

  const temps = finite(loops.map((l) => l.tempMax))
  const verdict = reasons.length ? 'fail' : stop === 'cancelled' ? 'cancelled' : stop === 'temp_limit' ? 'stopped' : loops.length < planned || !loops.length ? 'cancelled' : noisy ? 'inconclusive' : 'pass'
  const power = finite(loops.map((l) => l.power))
  return {
    verdict, reasons, stop, errors, tempLimit, planned, completed: loops.length, stability: stab,
    clockDrop: drop, throttled: drop != null && drop >= CLOCK_DROP_WARN,
    tempStart: temps.length ? temps[0] : null, tempMax: temps.length ? Math.max(...temps) : null,
    powerAvg: power.length ? round1(power.reduce((a, b) => a + b, 0) / power.length) : null,
    noTempSensor: loops.length > 0 && temps.length === 0
  }
}
