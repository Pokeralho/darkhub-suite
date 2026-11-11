// Overlay settings and the rows it shows. Pure.
import { normalizePower, POWER_DEFAULTS } from './powerModel.js'
import { metric, provTag, railTone, RAIL_IDS } from './lhmModel.js'

export const METRICS = ['fps', 'low1', 'frametime', 'graph', 'cpu', 'cpuTemp', 'gpu', 'gpuTemp', 'vram', 'gpuClock', 'ram', 'cpuPower', 'latency']
export const LAYOUTS = ['compact', 'advanced', 'oc', 'custom']
export const POSITIONS = ['tl', 'tc', 'tr', 'ml', 'mr', 'bl', 'bc', 'br']
export const DEFAULTS = {
  layout: 'compact',
  position: 'tl',
  offsetX: 0,
  offsetY: 0,
  // 'game': the monitor showing the game (follows it), 'primary', 'cursor' (where the mouse is when it opens), or a display id
  monitor: 'game',
  scale: 1,
  opacity: 1,
  background: 0.72,
  intervalMs: 500,
  // not Shift+F10: that is Windows' context-menu shortcut; this matches the screenshot ones (Ctrl+Shift+F11/F12)
  hotkey: 'Ctrl+Shift+F9',
  metrics: ['fps', 'low1', 'frametime', 'graph', 'cpu', 'cpuTemp', 'gpu', 'gpuTemp'],
  logFolder: '',
  // PSU, extra load and tariff for the estimates (powerModel.js)
  ...POWER_DEFAULTS
}

export function normalizeSettings(s = {}) {
  const clamp = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d)
  return {
    layout: LAYOUTS.includes(s.layout) ? s.layout : DEFAULTS.layout,
    position: POSITIONS.includes(s.position) ? s.position : DEFAULTS.position,
    offsetX: Math.round(clamp(s.offsetX, -4000, 4000, 0)),
    offsetY: Math.round(clamp(s.offsetY, -4000, 4000, 0)),
    monitor: ['game', 'primary', 'cursor'].includes(s.monitor) || /^\d{1,20}$/.test(String(s.monitor ?? '')) ? String(s.monitor) : DEFAULTS.monitor,
    scale: clamp(s.scale, 0.6, 2.5, DEFAULTS.scale),
    opacity: clamp(s.opacity, 0.2, 1, DEFAULTS.opacity),
    background: clamp(s.background, 0, 1, DEFAULTS.background),
    intervalMs: [250, 500, 1000].includes(Number(s.intervalMs)) ? Number(s.intervalMs) : DEFAULTS.intervalMs,
    hotkey: typeof s.hotkey === 'string' && s.hotkey.length <= 40 ? s.hotkey : DEFAULTS.hotkey,
    metrics: Array.isArray(s.metrics) ? s.metrics.filter((m) => METRICS.includes(m)) : DEFAULTS.metrics,
    logFolder: typeof s.logFolder === 'string' ? s.logFolder : '',
    ...normalizePower(s)
  }
}

/** Display the overlay goes on. displays: Electron displays; gameId / cursorId: ids of the displays showing the game and
 *  the mouse (null when unknown). A display that is no longer connected falls back to the game's, then the primary. */
export function pickDisplay(monitor, displays, { gameId = null, cursorId = null, primaryId = null } = {}) {
  const byId = (id) => (id == null ? null : displays.find((d) => String(d.id) === String(id)) || null)
  const primary = byId(primaryId) || displays[0] || null
  if (monitor === 'primary') return primary
  if (monitor === 'cursor') return byId(cursorId) || primary
  if (monitor !== 'game') { const fixed = byId(monitor); if (fixed) return fixed }
  return byId(gameId) || byId(cursorId) || primary
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

// temperatures, clocks and power are never physically 0 on a running PC: a 0 there means "not read"
const reading = (x) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : null)
const pct = (x) => (x != null && Number.isFinite(Number(x)) ? `${n(x)}%` : '—')

const tone = (val, warn, bad, higherIsBad = true) => {
  if (!Number.isFinite(Number(val))) return ''
  return higherIsBad ? (val >= bad ? 'bad' : val >= warn ? 'warn' : '') : (val <= bad ? 'bad' : val <= warn ? 'warn' : 'good')
}

/** Rows for the overlay page, in the user's order of metrics. A metric that was not read shows — (never 0); `title`
 *  carries why when the advanced sensors know it (hw: readLhm(), optional). */
export function buildRows(settings, frames, sensors, labels, hw = null) {
  const rows = []
  const why = (path) => { const m = hw ? metric(hw, path) : null; return m && m.prov === 'unavailable' ? m.reason : 'not_exposed' }
  const cpuTemp = reading(sensors.cpuTemp), gpuTemp = reading(sensors.gpuTemp), cpuPower = reading(sensors.cpuPower), gpuClock = reading(sensors.gpuClock)
  for (const m of settings.metrics) {
    switch (m) {
      case 'fps': rows.push({ big: true, label: labels.fps, value: frames ? n(frames.fps) : '—', tone: frames ? tone(frames.fps, 50, 30, false) : '' }); break
      case 'low1': rows.push({ label: labels.low1, value: frames ? n(frames.low1) : '—' }); break
      case 'frametime': rows.push({ label: labels.frametime, value: frames ? `${n(frames.frameTimeMs, 1)} ms` : '—' }); break
      case 'latency': rows.push({ label: labels.latency, value: frames?.latencyMs ? `${n(frames.latencyMs, 1)} ms` : '—' }); break
      case 'cpu': rows.push({ label: 'CPU', value: pct(sensors.cpu) }); break
      case 'cpuTemp': rows.push({ label: labels.cpuTemp, value: cpuTemp != null ? `${n(cpuTemp)}°C` : '—', tone: tone(cpuTemp, 80, 90), ...(cpuTemp == null ? { title: why('cpu.temp') } : {}) }); break
      case 'cpuPower': rows.push({ label: labels.cpuPower, value: cpuPower != null ? `${n(cpuPower)} W` : '—', ...(cpuPower == null ? { title: why('cpu.power') } : {}) }); break
      case 'gpu': rows.push({ label: 'GPU', value: pct(sensors.gpu) }); break
      case 'gpuTemp': rows.push({ label: labels.gpuTemp, value: gpuTemp != null ? `${n(gpuTemp)}°C` : '—', tone: tone(gpuTemp, 80, 88), ...(gpuTemp == null ? { title: why('gpu.temp') } : {}) }); break
      case 'vram': rows.push({ label: 'VRAM', value: sensors.vramMb != null ? `${n(sensors.vramMb / 1024, 1)} GB` : '—' }); break
      case 'gpuClock': rows.push({ label: labels.gpuClock, value: gpuClock != null ? `${n(gpuClock)} MHz` : '—', ...(gpuClock == null ? { title: why('gpu.clock') } : {}) }); break
      case 'ram': rows.push({ label: 'RAM', value: pct(sensors.ram) }); break
      default: break
    }
  }
  return rows
}

// ------------------------------------------------------------------ advanced / overclocker layouts (RTSS style)

const f = (x, d = 0) => (x != null && Number.isFinite(Number(x)) ? Number(x).toFixed(d) : null)
const cell = (v, u = '', t = '', p = '', r) => ({ v: v ?? '—', u: v == null ? '' : u, t, p, ...(v == null && r ? { r } : {}) })
/** A cell for a readLhm() metric path: '*' after the unit when derived, the reason (r) when unavailable. */
const mcell = (hw, path, x, d, u, t = '') => {
  const m = hw ? metric(hw, path) : null
  if (m && m.prov !== 'unavailable') return cell(f(x, d), m.prov === 'derived' ? `${u}*` : u, t)
  return cell(f(x, d), u, t, '', m?.reason || (x == null ? 'not_exposed' : undefined))
}
const RAIL_SHORT = { PCIE: 'slot', '16PIN0': '16p', '8PIN0': '8p#1', '8PIN1': '8p#2', '6PIN0': '6p#1', '6PIN1': '6p#2' }
export const COLORS = { gpu: '#4ade80', vram: '#a78bfa', cpu: '#60a5fa', ram: '#f472b6', fps: '#fbbf24', frame: '#fbbf24' }

/**
 * Lines, graphs, statistics and per-thread bars for the 'advanced' and 'oc' layouts. `hw` comes from readLhm() (may be
 * null: then the basic sensors fill in), `session` from SessionStats.stats(), `history` holds the last samples
 * (one per refresh) of fps, cpu, gpu, cpuTemp and gpuTemp.
 */
export function buildPanel(layout, frames, session, hw, sensors, history, labels = {}, extras = {}) {
  const { derived = null, renderLatency = null } = extras || {}
  const oc = layout === 'oc'
  const L = (k, d) => labels[k] || d
  const cpu = hw?.cpu || {}
  const gpu = hw?.gpu || {}
  const ram = hw?.ram || {}
  const gpuLoad = gpu.load ?? sensors?.gpu
  const gpuTemp = gpu.temp ?? reading(sensors?.gpuTemp)
  // CPU load from Windows' own counters first: LHM reports 100% on every thread on recent Windows 11 builds
  const cpuLoad = sensors?.cpu ?? null
  const threads = sensors?.cores?.length ? sensors.cores : null
  const loadMax = threads?.length ? Math.max(...threads) : null
  const cpuTemp = cpu.temp ?? reading(sensors?.cpuTemp)
  const vramMb = gpu.vramUsedMb ?? sensors?.vramMb
  const lines = []

  const gpuCells = [cell(f(gpuLoad), '%'), cell(f(gpuTemp), '°C', tone(gpuTemp, 80, 88), '', gpuTemp == null ? metric(hw, 'gpu.temp').reason : undefined),
    cell(f(gpu.clock ?? reading(sensors?.gpuClock)), 'MHz'), mcell(hw, 'gpu.power', gpu.power, 0, 'W')]
  if (oc) gpuCells.push(mcell(hw, 'gpu.voltage', gpu.voltage, 3, 'V'), mcell(hw, 'gpu.powerPct', gpu.powerPct, 0, '% TDP'))
  lines.push({ tag: 'GPU', color: COLORS.gpu, cells: gpuCells })
  if (oc && (gpu.hotspot || gpu.memJunction || gpu.fanRpm != null)) {
    lines.push({ tag: '', color: COLORS.gpu, cells: [
      ...(gpu.hotspot ? [cell(f(gpu.hotspot), '°C ' + L('hotspot', 'hotspot'), tone(gpu.hotspot, 95, 105))] : []),
      ...(gpu.memJunction ? [cell(f(gpu.memJunction), '°C ' + L('memJunction', 'mem'), tone(gpu.memJunction, 95, 105))] : []),
      ...(gpu.fanRpm != null ? [cell(f(gpu.fanRpm), 'RPM'), cell(f(gpu.fanPct), '%')] : [])
    ] })
  }
  lines.push({ tag: 'VRAM', color: COLORS.vram, cells: [cell(f(vramMb != null ? vramMb / 1024 : null, 2), gpu.vramTotalMb ? `/ ${f(gpu.vramTotalMb / 1024, 0)} GB` : 'GB'), cell(f(gpu.memClock), 'MHz'), ...(oc ? [cell(f(gpu.memCtrlLoad), '% ctrl')] : [])] })

  if (oc) {
    const nv = hw?.nvml || {}
    const e1 = []
    if (gpu.vramPct != null) e1.push(cell(f(gpu.vramPct), '% VRAM'))
    if (gpu.busLoad != null) e1.push(cell(f(gpu.busLoad), '% ' + L('bus', 'bus')))
    if (nv.pcieGen != null && nv.pcieWidth != null) e1.push(cell(`${f(nv.pcieGen)}.0 x${f(nv.pcieWidth)}`, 'PCIe'))
    if (gpu.videoEngineLoad != null) e1.push(cell(f(gpu.videoEngineLoad), '% ' + L('videoEngine', 'video')))
    if (nv.encoderPct != null) e1.push(cell(f(nv.encoderPct), '% enc'))
    if (nv.decoderPct != null) e1.push(cell(f(nv.decoderPct), '% dec'))
    if (e1.length) lines.push({ tag: '', color: COLORS.vram, cells: e1 })
    // per-connector input power (NVIDIA cards that sense it): W and V per rail; a sagging 12 V rail turns warn/bad
    const rails = (gpu.rails || []).filter((r) => r.w != null || r.v != null)
    if (rails.length) {
      lines.push({ tag: 'IN', color: COLORS.gpu, cells: rails.flatMap((r) => [cell(f(r.w, 0), `W ${RAIL_SHORT[r.id] || r.id}`), cell(f(r.v, 2), 'V', railTone(r.v))]) })
    }
  }

  const cpuCells = [cell(f(cpuLoad), '%'), cell(f(cpuTemp), '°C', tone(cpuTemp, 80, 90), '', cpuTemp == null ? metric(hw, 'cpu.temp').reason : undefined),
    mcell(hw, 'cpu.clock', cpu.clock, 0, 'MHz'), cpu.power == null && reading(sensors?.cpuPower) != null ? cell(f(reading(sensors.cpuPower)), 'W') : mcell(hw, 'cpu.power', cpu.power, 0, 'W')]
  // VID instead of a measured Vcore is derived: V*
  if (oc) cpuCells.push(mcell(hw, 'cpu.vcore', cpu.vcore, 3, 'V'), cell(f(cpu.clockMax), 'MHz max'))
  lines.push({ tag: 'CPU', color: COLORS.cpu, cells: cpuCells })
  if (oc && loadMax != null) lines.push({ tag: '', color: COLORS.cpu, cells: [cell(f(loadMax), '% ' + L('maxThread', 'max thread'), tone(loadMax, 90, 98))] })
  // clock, power, temperature and VID need an elevated helper: say so instead of showing blanks
  if (oc && hw?.access?.cpuNeedsAdmin) lines.push({ tag: '', color: COLORS.cpu, cells: [cell(L('needsAdmin', 'needs admin'), '', 'warn')] })
  else if (oc && hw?.access?.cpuNeedsPawnio) lines.push({ tag: '', color: COLORS.cpu, cells: [cell(L('needsPawnio', 'needs PawnIO'), '', 'warn')] })
  lines.push({ tag: 'RAM', color: COLORS.ram, cells: [cell(f(ram.usedGb, 1), ram.totalGb ? `/ ${f(ram.totalGb, 0)} GB` : 'GB'), ...(ram.load != null || sensors?.ram != null ? [cell(f(ram.load ?? sensors?.ram), '%')] : []),
    // SMBIOS values, not a live counter: derived, marked with *
    ...(oc && ram.effectiveMts ? [cell(f(ram.effectiveMts), 'MT/s*'), cell(f(ram.baseClockMhz), 'MHz*')] : [])] })

  const fpsCells = [cell(frames ? f(frames.fps) : null, 'FPS', frames ? tone(frames.fps, 50, 30, false) : ''), cell(frames ? f(frames.frameTimeMs, 1) : null, 'ms'),
    cell(frames ? f(frames.low1) : null, '', '', '1%'), cell(frames ? f(frames.low01) : null, '', '', '0.1%')]
  lines.push({ tag: 'FPS', color: COLORS.fps, big: true, cells: fpsCells })

  // power, efficiency, PSU and cost: every number below is an estimate or derived from one, marked with *
  if (oc && derived) {
    const d = derived
    const nv = hw?.nvml || {}
    const pw = [cell(f(d.gpuW), 'W'), cell(f(d.efficiency.fpsPerWatt, 2), 'FPS/W*'), cell(f(d.efficiency.joulesPerFrame, 2), 'J/' + L('frameShort', 'frame') + '*')]
    if (d.energy.gpuKj != null) pw.push(cell(f(d.energy.gpuKj, 2), 'kJ'))
    lines.push({ tag: 'PWR', color: COLORS.gpu, cells: pw })
    if (d.system.dcW != null) {
      lines.push({ tag: 'PSU*', color: COLORS.cpu, cells: [cell(f(d.system.loadPct), '%'), cell(f(d.system.efficiency), '% ' + L('eff', 'eff')), cell(f(d.system.dcW), 'W DC'), cell(f(d.system.acW), 'W AC')] })
      if (d.system.partial) lines.push({ tag: '', color: COLORS.cpu, cells: [cell(L('partial', 'without') + ' ' + d.system.missing.map((m) => m.toUpperCase()).join('/'), '', 'warn')] })
    }
    const c = d.cost
    const money = (x) => f(x, 2)
    const costCells = []
    if (c.gpu) costCells.push(cell(money(c.gpu.perHour), 'R$/h GPU*'))
    if (c.cpuGpu) costCells.push(cell(money(c.cpuGpu.perHour), 'R$/h CPU+GPU*'))
    if (c.withExtra) costCells.push(cell(money(c.withExtra.perHour), 'R$/h ' + L('withExtra', '+extra') + '*'))
    if (costCells.length) lines.push({ tag: 'R$*', color: COLORS.fps, cells: costCells })
    if (nv.throttle?.length) {
      const limiting = nv.throttle.filter((r) => r !== 'idle' && r !== 'appClocks')
      if (limiting.length) lines.push({ tag: '', color: COLORS.gpu, cells: [cell(limiting.map((r) => L('throttle.' + r, r)).join(' · '), '', 'warn')] })
    }
  }

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
    if (renderLatency) stats.push([L('renderLatency', 'Render latency'), `${f(renderLatency.min, 1)} / ${f(renderLatency.avg, 1)} / ${f(renderLatency.max, 1)} ms`])
    if (derived?.efficiency.fpsPerWattAvg != null) stats.push([L('avgFpsPerWatt', 'Avg FPS/W') + '*', f(derived.efficiency.fpsPerWattAvg, 2)])
    if (derived?.efficiency.joulesPerFrameAvg != null) stats.push([L('avgJoulesPerFrame', 'Avg J/frame') + '*', f(derived.efficiency.joulesPerFrameAvg, 2)])
    if (derived?.energy.gpuKj != null) stats.push([L('energyGpu', 'GPU energy'), `${f(derived.energy.gpuKj, 2)} kJ`])
    if (derived) stats.push(['*', L('estimate', 'estimate')])
  }

  return { lines, graphs, stats, threads: oc && threads?.length ? threads.map((x) => Math.round(x)) : null, threadsLabel: L('threads', 'CPU threads') }
}

// ------------------------------------------------------------------ session log (CSV) with provenance

/** Columns of the overlay CSV log. Each sensor value has a *_src column: measured:lhm, measured:nvml, measured:nvapi,
 *  measured:system (Windows counters), derived:lhm (VID), unavailable:needs_admin, ... Unavailable values are empty, never 0. */
export const LOG_HEADER = ['time', 'fps', 'frametime_ms', 'low1_fps', 'cpu_pct', 'cpu_c', 'cpu_c_src', 'gpu_pct', 'gpu_c', 'gpu_c_src', 'vram_mb',
  'gpu_w', 'gpu_w_src', 'cpu_w', 'cpu_w_src', 'vcore_v', 'vcore_src',
  ...RAIL_IDS.flatMap((id) => ['w', 'v', 'a'].map((u) => `rail_${id.toLowerCase()}_${u}`)), 'rails_src'].join(',')

/** One CSV line (no newline) for the log. sensors: readSensors(); hw: readLhm() or null. */
export function logRow(now, frames, sensors, hw) {
  const c = (x, d = 1) => (x != null && Number.isFinite(Number(x)) ? Number(x).toFixed(d) : '')
  // advanced sensor first, Windows counter as fallback (then it is "measured:system"); zeros are "not read"
  const pick = (path, fallback) => {
    const m = hw ? metric(hw, path) : null
    if (m && m.value != null) return [m.value, provTag(hw, path)]
    const fb = reading(fallback)
    if (fb != null) return [fb, 'measured:system']
    return [null, `unavailable:${m?.reason || 'not_exposed'}`]
  }
  const [cpuC, cpuCSrc] = pick('cpu.temp', sensors?.cpuTemp)
  const [gpuC, gpuCSrc] = pick('gpu.temp', sensors?.gpuTemp)
  const nvW = hw ? metric(hw, 'nvml.powerW') : null
  const [gpuW, gpuWSrc] = nvW && nvW.value != null ? [nvW.value, 'measured:nvml'] : pick('gpu.power', null)
  const [cpuW, cpuWSrc] = pick('cpu.power', sensors?.cpuPower)
  const [vcore, vcoreSrc] = pick('cpu.vcore', null)
  const rails = RAIL_IDS.flatMap((id) => ['w', 'v', 'a'].map((u) => { const m = hw ? metric(hw, `gpu.rails.${id}.${u}`) : null; return m && m.value != null ? c(m.value, u === 'w' ? 1 : 3) : '' }))
  const railsSrc = hw?.gpu?.rails?.length ? 'measured:nvapi' : `unavailable:${hw?.gpu?.railsState === 'non_nvidia' ? 'non_nvidia' : 'not_exposed'}`
  return [new Date(now).toISOString(), c(frames?.fps), c(frames?.frameTimeMs, 2), c(frames?.low1), c(sensors?.cpu), c(cpuC), cpuCSrc, c(sensors?.gpu), c(gpuC), gpuCSrc, c(sensors?.vramMb, 0),
    c(gpuW), gpuWSrc, c(cpuW), cpuWSrc, c(vcore, 3), vcoreSrc, ...rails, railsSrc].join(',')
}
