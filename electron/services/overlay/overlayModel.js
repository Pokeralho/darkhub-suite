// Overlay settings and the rows it shows. Pure.

export const METRICS = ['fps', 'low1', 'frametime', 'graph', 'cpu', 'cpuTemp', 'gpu', 'gpuTemp', 'vram', 'gpuClock', 'ram', 'cpuPower', 'latency']
export const LAYOUTS = ['compact', 'advanced', 'oc', 'custom']
export const DEFAULTS = {
  layout: 'compact',
  position: 'tl',
  scale: 1,
  opacity: 1,
  background: 0.72,
  intervalMs: 500,
  // not Shift+F10: that is Windows' context-menu shortcut; this matches the screenshot ones (Ctrl+Shift+F11/F12)
  hotkey: 'Ctrl+Shift+F9',
  metrics: ['fps', 'low1', 'frametime', 'graph', 'cpu', 'cpuTemp', 'gpu', 'gpuTemp'],
  logFolder: ''
}

export function normalizeSettings(s = {}) {
  const clamp = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d)
  return {
    layout: LAYOUTS.includes(s.layout) ? s.layout : DEFAULTS.layout,
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
    cores: Array.isArray(snap?.cpu?.values?.coresLoad) ? snap.cpu.values.coresLoad.map(v).filter((x) => Number.isFinite(Number(x))) : null,
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

// ------------------------------------------------------------------ advanced / overclocker layouts (RTSS style)

const f = (x, d = 0) => (x != null && Number.isFinite(Number(x)) ? Number(x).toFixed(d) : null)
const cell = (v, u = '', t = '', p = '') => ({ v: v ?? '—', u: v == null ? '' : u, t, p })
export const COLORS = { gpu: '#4ade80', vram: '#a78bfa', cpu: '#60a5fa', ram: '#f472b6', fps: '#fbbf24', frame: '#fbbf24' }

/**
 * Lines, graphs, statistics and per-thread bars for the 'advanced' and 'oc' layouts. `hw` comes from readLhm() (may be
 * null: then the basic sensors fill in), `session` from SessionStats.stats(), `history` holds the last samples
 * (one per refresh) of fps, cpu, gpu, cpuTemp and gpuTemp.
 */
export function buildPanel(layout, frames, session, hw, sensors, history, labels = {}) {
  const oc = layout === 'oc'
  const L = (k, d) => labels[k] || d
  const cpu = hw?.cpu || {}
  const gpu = hw?.gpu || {}
  const ram = hw?.ram || {}
  const gpuLoad = gpu.load ?? sensors?.gpu
  const gpuTemp = gpu.temp ?? sensors?.gpuTemp
  // CPU load from Windows' own counters first: LHM reports 100% on every thread on recent Windows 11 builds
  const cpuLoad = sensors?.cpu ?? null
  const threads = sensors?.cores?.length ? sensors.cores : null
  const loadMax = threads?.length ? Math.max(...threads) : null
  const cpuTemp = cpu.temp ?? sensors?.cpuTemp
  const vramMb = gpu.vramUsedMb ?? sensors?.vramMb
  const lines = []

  const gpuCells = [cell(f(gpuLoad), '%'), cell(f(gpuTemp), '°C', tone(gpuTemp, 80, 88)), cell(f(gpu.clock ?? sensors?.gpuClock), 'MHz'), cell(f(gpu.power), 'W')]
  if (oc) gpuCells.push(cell(f(gpu.voltage, 3), 'V'), cell(f(gpu.powerPct), '% TDP'))
  lines.push({ tag: 'GPU', color: COLORS.gpu, cells: gpuCells })
  if (oc && (gpu.hotspot || gpu.memJunction || gpu.fanRpm != null)) {
    lines.push({ tag: '', color: COLORS.gpu, cells: [
      ...(gpu.hotspot ? [cell(f(gpu.hotspot), '°C ' + L('hotspot', 'hotspot'), tone(gpu.hotspot, 95, 105))] : []),
      ...(gpu.memJunction ? [cell(f(gpu.memJunction), '°C ' + L('memJunction', 'mem'), tone(gpu.memJunction, 95, 105))] : []),
      ...(gpu.fanRpm != null ? [cell(f(gpu.fanRpm), 'RPM'), cell(f(gpu.fanPct), '%')] : [])
    ] })
  }
  lines.push({ tag: 'VRAM', color: COLORS.vram, cells: [cell(f(vramMb != null ? vramMb / 1024 : null, 2), gpu.vramTotalMb ? `/ ${f(gpu.vramTotalMb / 1024, 0)} GB` : 'GB'), cell(f(gpu.memClock), 'MHz'), ...(oc ? [cell(f(gpu.memCtrlLoad), '% ctrl')] : [])] })

  const cpuCells = [cell(f(cpuLoad), '%'), cell(f(cpuTemp), '°C', tone(cpuTemp, 80, 90)), cell(f(cpu.clock), 'MHz'), cell(f(cpu.power ?? sensors?.cpuPower), 'W')]
  if (oc) cpuCells.push(cell(f(cpu.vcore, 3), 'V'), cell(f(cpu.clockMax), 'MHz max'))
  lines.push({ tag: 'CPU', color: COLORS.cpu, cells: cpuCells })
  if (oc && loadMax != null) lines.push({ tag: '', color: COLORS.cpu, cells: [cell(f(loadMax), '% ' + L('maxThread', 'max thread'), tone(loadMax, 90, 98))] })
  lines.push({ tag: 'RAM', color: COLORS.ram, cells: [cell(f(ram.usedGb, 1), ram.totalGb ? `/ ${f(ram.totalGb, 0)} GB` : 'GB'), ...(ram.load != null || sensors?.ram != null ? [cell(f(ram.load ?? sensors?.ram), '%')] : [])] })

  const fpsCells = [cell(frames ? f(frames.fps) : null, 'FPS', frames ? tone(frames.fps, 50, 30, false) : ''), cell(frames ? f(frames.frameTimeMs, 1) : null, 'ms'),
    cell(frames ? f(frames.low1) : null, '', '', '1%'), cell(frames ? f(frames.low01) : null, '', '', '0.1%')]
  lines.push({ tag: 'FPS', color: COLORS.fps, big: true, cells: fpsCells })

  // what limits the frame rate: the GPU is busy almost the whole frame → GPU-bound, otherwise the CPU/engine
  let bound = null
  if (frames?.gpuBusyMs > 0 && frames?.frameTimeMs > 0) {
    const r = frames.gpuBusyMs / frames.frameTimeMs
    bound = { pct: Math.min(100, Math.round(r * 100)), kind: r >= 0.9 ? 'gpu' : 'cpu' }
  }

  const graphs = []
  if (frames?.graph?.length) {
    const g = frames.graph
    graphs.push({ title: L('frametime', 'Frametime'), sources: [{ key: 'frametime', color: COLORS.frame }], mode: 'ft', color: COLORS.frame, values: g, unit: 'ms', floor: 0, ceil: Math.max(16.7, ...g),
      info: `${L('avg', 'avg')} ${f(g.reduce((a, b) => a + b, 0) / g.length, 1)} · ${L('max', 'max')} ${f(Math.max(...g), 1)} ms` })
  }
  if (oc) {
    const h = history || {}
    if (h.fps?.length) graphs.push({ title: 'FPS', sources: [{ key: 'fps', color: COLORS.fps }], mode: 'fps', color: COLORS.fps, values: h.fps, unit: '', floor: 0, ceil: Math.max(60, ...h.fps), info: `${f(Math.min(...h.fps))} – ${f(Math.max(...h.fps))}` })
    if (h.gpu?.length || h.cpu?.length) graphs.push({ title: L('load', 'Load %'), sources: [{ key: 'gpu.load', color: COLORS.gpu }, { key: 'cpu.load', color: COLORS.cpu }], mode: 'pct', series: [{ color: COLORS.gpu, values: h.gpu || [] }, { color: COLORS.cpu, values: h.cpu || [] }], floor: 0, ceil: 100, info: 'GPU · CPU' })
    if (h.gpuTemp?.length || h.cpuTemp?.length) graphs.push({ title: L('temps', 'Temp °C'), sources: [{ key: 'gpu.temp', color: COLORS.gpu }, { key: 'cpu.temp', color: COLORS.cpu }], mode: 'temp', series: [{ color: COLORS.gpu, values: h.gpuTemp || [] }, { color: COLORS.cpu, values: h.cpuTemp || [] }], floor: 30, ceil: 100, info: 'GPU · CPU' })
  }

  const stats = []
  if (oc && session) {
    const mm = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
    stats.push(
      [L('session', 'Session'), mm(session.seconds)], [L('avgFps', 'Avg FPS'), f(session.avgFps, 1)],
      ['Min / Max', `${f(session.minFps) ?? '—'} / ${f(session.maxFps) ?? '—'}`], ['1% / 0.1%', `${f(session.low1) ?? '—'} / ${f(session.low01) ?? '—'}`],
      [L('worstFrame', 'Worst frame'), `${f(session.maxFrameMs, 1)} ms`], [L('stdDev', 'Frametime σ'), `${f(session.stdDevMs, 2)} ms`],
      [L('stutters', 'Stutters'), String(session.stutters)], [L('frames', 'Frames'), String(session.frames)]
    )
    if (bound) stats.push([L('bound', 'Limited by'), `${bound.kind === 'gpu' ? 'GPU' : 'CPU'} (GPU ${bound.pct}%)`])
    if (frames?.presentMode) stats.push([L('presentMode', 'Present'), frames.presentMode.replace(/_/g, ' ')])
  }

  return { lines, graphs, stats, threads: oc && threads?.length ? threads.map((x) => Math.round(x)) : null, threadsLabel: L('threads', 'CPU threads') }
}
