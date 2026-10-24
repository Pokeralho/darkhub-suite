// Overlay settings and the rows it shows. Pure.

export const METRICS = ['fps', 'low1', 'frametime', 'graph', 'cpu', 'cpuTemp', 'gpu', 'gpuTemp', 'vram', 'gpuClock', 'ram', 'cpuPower', 'latency']
export const DEFAULTS = {
  position: 'tl',
  scale: 1,
  opacity: 1,
  background: 0.55,
  intervalMs: 500,
  // not Shift+F10: that is Windows' context-menu shortcut; this matches the screenshot ones (Ctrl+Shift+F11/F12)
  hotkey: 'Ctrl+Shift+F9',
  metrics: ['fps', 'low1', 'frametime', 'graph', 'cpu', 'cpuTemp', 'gpu', 'gpuTemp'],
  logFolder: ''
}

export function normalizeSettings(s = {}) {
  const clamp = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d)
  return {
    position: ['tl', 'tr', 'bl', 'br'].includes(s.position) ? s.position : DEFAULTS.position,
    scale: clamp(s.scale, 0.6, 2.5, DEFAULTS.scale),
    opacity: clamp(s.opacity, 0.2, 1, DEFAULTS.opacity),
    background: clamp(s.background, 0, 1, DEFAULTS.background),
    intervalMs: [250, 500, 1000].includes(Number(s.intervalMs)) ? Number(s.intervalMs) : DEFAULTS.intervalMs,
    hotkey: typeof s.hotkey === 'string' && s.hotkey.length <= 40 ? s.hotkey : DEFAULTS.hotkey,
    metrics: Array.isArray(s.metrics) ? s.metrics.filter((m) => METRICS.includes(m)) : DEFAULTS.metrics,
    logFolder: typeof s.logFolder === 'string' ? s.logFolder : ''
  }
}

const v = (x) => (x && typeof x === 'object' && 'value' in x ? x.value : x)
const n = (x, d = 0) => (Number.isFinite(Number(x)) ? Number(x).toFixed(d) : '—')

/** Pulls the overlay's numbers out of a HardwareService snapshot. */
export function readSensors(snap) {
  const gpu = snap?.gpu?.values?.gpus?.[0] || null
  return {
    cpu: v(snap?.cpu?.values?.currentLoad),
    cpuTemp: v(snap?.temps?.values?.main),
    cpuPower: snap?.temps?.values?.cpuPowerW ?? null,
    ram: v(snap?.ram?.values?.percent),
    gpu: v(gpu?.utilization),
    gpuTemp: v(gpu?.temperature),
    vramMb: v(gpu?.vramUsed),
    gpuClock: v(gpu?.clockCore)
  }
}

const tone = (val, warn, bad, higherIsBad = true) => {
  if (!Number.isFinite(Number(val))) return ''
  return higherIsBad ? (val >= bad ? 'bad' : val >= warn ? 'warn' : '') : (val <= bad ? 'bad' : val <= warn ? 'warn' : 'good')
}

/** Rows for the overlay page, in the user's order of metrics. */
export function buildRows(settings, frames, sensors, labels) {
  const rows = []
  for (const m of settings.metrics) {
    switch (m) {
      case 'fps': rows.push({ big: true, label: labels.fps, value: frames ? n(frames.fps) : '—', tone: frames ? tone(frames.fps, 50, 30, false) : '' }); break
      case 'low1': rows.push({ label: labels.low1, value: frames ? n(frames.low1) : '—' }); break
      case 'frametime': rows.push({ label: labels.frametime, value: frames ? `${n(frames.frameTimeMs, 1)} ms` : '—' }); break
      case 'latency': rows.push({ label: labels.latency, value: frames?.latencyMs ? `${n(frames.latencyMs, 1)} ms` : '—' }); break
      case 'cpu': rows.push({ label: 'CPU', value: `${n(sensors.cpu)}%` }); break
      case 'cpuTemp': rows.push({ label: labels.cpuTemp, value: sensors.cpuTemp != null ? `${n(sensors.cpuTemp)}°C` : '—', tone: tone(sensors.cpuTemp, 80, 90) }); break
      case 'cpuPower': rows.push({ label: labels.cpuPower, value: sensors.cpuPower != null ? `${n(sensors.cpuPower)} W` : '—' }); break
      case 'gpu': rows.push({ label: 'GPU', value: `${n(sensors.gpu)}%` }); break
      case 'gpuTemp': rows.push({ label: labels.gpuTemp, value: sensors.gpuTemp != null ? `${n(sensors.gpuTemp)}°C` : '—', tone: tone(sensors.gpuTemp, 80, 88) }); break
      case 'vram': rows.push({ label: 'VRAM', value: sensors.vramMb != null ? `${n(sensors.vramMb / 1024, 1)} GB` : '—' }); break
      case 'gpuClock': rows.push({ label: labels.gpuClock, value: sensors.gpuClock != null ? `${n(sensors.gpuClock)} MHz` : '—' }); break
      case 'ram': rows.push({ label: 'RAM', value: `${n(sensors.ram)}%` }); break
      default: break
    }
  }
  return rows
}
