// User-designed overlay layouts ("Personalizado"): a JSON document of widgets + theme + optional raw CSS, rendered to
// HTML/CSS here (main process) and drawn by overlay.html or the editor preview. Pure.
//
// Imported layouts come from other people: every text is escaped into HTML, style values are filtered, and the
// overlay page has `default-src 'none'`, so CSS can restyle the overlay but cannot load anything or run code.

import { buildDerived } from './powerModel.js'
import { metric as lhmMetric, RAIL_IDS, RAIL_LOW_V, RAIL_BAD_V } from './lhmModel.js'

const isNum = (x) => x != null && x !== '' && Number.isFinite(Number(x))
const num = (x, lo, hi, d) => (isNum(x) ? Math.min(hi, Math.max(lo, Number(x))) : d)
const str = (x, max = 60, d = '') => (typeof x === 'string' ? x.slice(0, max) : d)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
/** A single CSS value: no braces, semicolons, comments or markup, so it cannot close the rule it sits in. */
export const cssValue = (v, max = 120) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/[{};<>\\]|\/\*|\*\//g, '').slice(0, max).trim() : '')
const color = (v, d) => (typeof v === 'string' && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|transparent|currentColor|[a-z]{3,20})$/i.test(v.trim()) ? v.trim() : d)

// ---------------------------------------------------------------- metric catalog
// get(ctx) → number|string|null. ctx = { frames, session, hw, sensors, history }. tone: [warn, bad, lowerIsBad]
// Provenance: `p` is the readLhm() path the value comes from (its hw.prov entry says measured / derived / unavailable
// and why); `est` marks model output (estimated), `drv` computed or firmware values (derived): both print a '*'.
// `pos` marks physical quantities that are never 0 on a running PC (temperature, clock, power, voltage): a 0 is a
// "not read" placeholder and prints as —, like any unavailable metric.

const hw = (ctx) => ctx.hw || {}
const gpu = (ctx) => hw(ctx).gpu || {}
const cpu = (ctx) => hw(ctx).cpu || {}
const ram = (ctx) => hw(ctx).ram || {}
const fr = (ctx) => ctx.frames || null
const ss = (ctx) => ctx.session || null
const nv = (ctx) => hw(ctx).nvml || {}
const dv = (ctx) => ctx.derived || null
const rl = (ctx) => ctx.renderLatency || null

// cost of the GPU alone, CPU + GPU, and CPU + GPU + additional components, from the user's tariff (estimates)
const COST_METRICS = {}
for (const [scen, name] of [['gpu', 'GPU'], ['cpuGpu', 'CPU+GPU'], ['withExtra', 'CPU+GPU+extra']]) {
  for (const [per, key, label] of [['perHour', 'hour', 'per hour'], ['perDay', 'day', 'per day'], ['perMonth', 'month', 'per month'], ['perYear', 'year', 'per year']]) {
    COST_METRICS[`cost.${scen}.${key}`] = { group: 'cost', label: `${name} cost ${label}`, unit: '', pre: 'R$ ', d: 2, est: true, get: (c) => dv(c)?.cost?.[scen]?.[per] }
  }
  for (const [per, label] of [['kwhDay', 'kWh per day'], ['kwhMonth', 'kWh per month']]) {
    COST_METRICS[`cost.${scen}.${per}`] = { group: 'cost', label: `${name} ${label}`, unit: 'kWh', d: 1, est: true, get: (c) => dv(c)?.cost?.[scen]?.[per] }
  }
}

// per-connector GPU input power (NVIDIA cards that sense it; DarkHub.HwSensors "nvrails")
export const RAIL_NAMES = { PCIE: 'PCIe slot', '16PIN0': '16-pin (12V-2x6)', '8PIN0': '8-pin #1', '8PIN1': '8-pin #2', '6PIN0': '6-pin #1', '6PIN1': '6-pin #2' }
const RAIL_METRICS = {}
for (const id of RAIL_IDS) {
  const k = id.toLowerCase()
  const at = (u) => (c) => hw(c).gpu?.rails?.find((r) => r.id === id)?.[u] ?? null
  RAIL_METRICS[`rail.${k}.w`] = { p: `gpu.rails.${id}.w`, pos: true, group: 'power', label: `${RAIL_NAMES[id]} power`, unit: 'W', d: 0, get: at('w') }
  RAIL_METRICS[`rail.${k}.v`] = { p: `gpu.rails.${id}.v`, pos: true, group: 'power', label: `${RAIL_NAMES[id]} voltage`, unit: 'V', d: 2, get: at('v'), tone: [RAIL_LOW_V, RAIL_BAD_V, true] }
  RAIL_METRICS[`rail.${k}.a`] = { p: `gpu.rails.${id}.a`, group: 'power', label: `${RAIL_NAMES[id]} current`, unit: 'A', d: 1, get: at('a') }
}
RAIL_METRICS['rail.total'] = { p: 'gpu.railsW', pos: true, drv: true, group: 'power', label: 'GPU input (sum of rails)', unit: 'W', d: 0, get: (c) => hw(c).gpu?.railsW ?? null }

export const METRICS = {
  fps: { group: 'fps', label: 'FPS', unit: 'FPS', d: 0, get: (c) => fr(c)?.fps, tone: [50, 30, true] },
  frametime: { group: 'fps', label: 'Frame time', unit: 'ms', d: 1, get: (c) => fr(c)?.frameTimeMs },
  low1: { group: 'fps', label: '1% low', unit: '', d: 0, get: (c) => fr(c)?.low1, tone: [50, 30, true] },
  low01: { group: 'fps', label: '0.1% low', unit: '', d: 0, get: (c) => fr(c)?.low01, tone: [40, 25, true] },
  maxFrame: { group: 'fps', label: 'Max frame', unit: 'ms', d: 1, get: (c) => fr(c)?.maxFrameTimeMs },
  latency: { group: 'fps', label: 'Latency', unit: 'ms', d: 1, get: (c) => fr(c)?.latencyMs || null },
  gpuBusy: { group: 'fps', label: 'GPU busy', unit: 'ms', d: 1, get: (c) => fr(c)?.gpuBusyMs },
  bound: { group: 'fps', label: 'Limited by', unit: '', d: 0, get: (c) => { const f = fr(c); return f?.gpuBusyMs > 0 && f?.frameTimeMs > 0 ? (f.gpuBusyMs / f.frameTimeMs >= 0.9 ? 'GPU' : 'CPU') : null } },
  renderLatency: { group: 'fps', label: 'Render latency', unit: 'ms', d: 1, get: (c) => fr(c)?.renderLatencyMs },
  presentMode: { group: 'fps', label: 'Present mode', unit: '', d: 0, get: (c) => fr(c)?.presentMode?.replace(/_/g, ' ') || null },

  'gpu.load': { p: 'gpu.load', group: 'gpu', label: 'GPU load', unit: '%', d: 0, get: (c) => gpu(c).load ?? c.sensors?.gpu },
  'gpu.temp': { p: 'gpu.temp', pos: true, group: 'gpu', label: 'GPU temp', unit: '°C', d: 0, get: (c) => gpu(c).temp ?? c.sensors?.gpuTemp, tone: [80, 88] },
  'gpu.hotspot': { p: 'gpu.hotspot', pos: true, group: 'gpu', label: 'GPU hotspot', unit: '°C', d: 0, get: (c) => gpu(c).hotspot, tone: [95, 105] },
  'gpu.memJunction': { p: 'gpu.memJunction', pos: true, group: 'gpu', label: 'VRAM junction', unit: '°C', d: 0, get: (c) => gpu(c).memJunction, tone: [95, 105] },
  'gpu.clock': { p: 'gpu.clock', pos: true, group: 'gpu', label: 'GPU clock', unit: 'MHz', d: 0, get: (c) => gpu(c).clock ?? c.sensors?.gpuClock },
  'gpu.memClock': { p: 'gpu.memClock', pos: true, group: 'gpu', label: 'Memory clock', unit: 'MHz', d: 0, get: (c) => gpu(c).memClock },
  'gpu.power': { p: 'gpu.power', pos: true, group: 'gpu', label: 'GPU power', unit: 'W', d: 0, get: (c) => gpu(c).power },
  'gpu.powerPct': { p: 'gpu.powerPct', pos: true, group: 'gpu', label: 'GPU % TDP', unit: '%', d: 0, get: (c) => gpu(c).powerPct },
  'gpu.voltage': { p: 'gpu.voltage', pos: true, group: 'gpu', label: 'GPU voltage', unit: 'V', d: 3, get: (c) => gpu(c).voltage },
  'gpu.fanRpm': { p: 'gpu.fanRpm', group: 'gpu', label: 'GPU fan', unit: 'RPM', d: 0, get: (c) => gpu(c).fanRpm },
  'gpu.fanPct': { p: 'gpu.fanPct', group: 'gpu', label: 'GPU fan %', unit: '%', d: 0, get: (c) => gpu(c).fanPct },
  'gpu.vram': { p: 'gpu.vramUsedMb', group: 'gpu', label: 'VRAM used', unit: 'GB', d: 2, get: (c) => { const mb = gpu(c).vramUsedMb ?? c.sensors?.vramMb; return mb != null ? mb / 1024 : null } },
  'gpu.vramTotal': { p: 'gpu.vramTotalMb', pos: true, group: 'gpu', label: 'VRAM total', unit: 'GB', d: 0, get: (c) => (gpu(c).vramTotalMb != null ? gpu(c).vramTotalMb / 1024 : null) },
  'gpu.memCtrl': { p: 'gpu.memCtrlLoad', group: 'gpu', label: 'Memory controller', unit: '%', d: 0, get: (c) => gpu(c).memCtrlLoad },
  'gpu.name': { group: 'gpu', label: 'GPU name', unit: '', d: 0, get: (c) => gpu(c).name || null },
  'gpu.vramPct': { p: 'gpu.vramPct', group: 'gpu', label: 'VRAM %', unit: '%', d: 0, get: (c) => gpu(c).vramPct, tone: [85, 95] },
  'gpu.bus': { p: 'gpu.busLoad', group: 'gpu', label: 'GPU bus load', unit: '%', d: 0, get: (c) => gpu(c).busLoad },
  'gpu.videoEngine': { p: 'gpu.videoEngineLoad', group: 'gpu', label: 'Video engine', unit: '%', d: 0, get: (c) => gpu(c).videoEngineLoad },
  'gpu.encoder': { p: 'nvml.encoderPct', group: 'gpu', label: 'Encoder (NVENC)', unit: '%', d: 0, get: (c) => nv(c).encoderPct },
  'gpu.decoder': { p: 'nvml.decoderPct', group: 'gpu', label: 'Decoder (NVDEC)', unit: '%', d: 0, get: (c) => nv(c).decoderPct },
  'gpu.pcie': { p: 'nvml.pcieGen', group: 'gpu', label: 'PCIe link', unit: '', d: 0, get: (c) => (nv(c).pcieGen != null && nv(c).pcieWidth != null ? `${nv(c).pcieGen}.0 x${nv(c).pcieWidth}` : null) },
  'gpu.pcieRx': { p: 'gpu.pcieRxBps', group: 'gpu', label: 'PCIe receive', unit: 'MB/s', d: 0, get: (c) => (gpu(c).pcieRxBps != null ? gpu(c).pcieRxBps / 1048576 : null) },
  'gpu.pcieTx': { p: 'gpu.pcieTxBps', group: 'gpu', label: 'PCIe send', unit: 'MB/s', d: 0, get: (c) => (gpu(c).pcieTxBps != null ? gpu(c).pcieTxBps / 1048576 : null) },
  'gpu.d3dShared': { p: 'gpu.d3dSharedMb', group: 'gpu', label: 'Shared GPU memory', unit: 'MB', d: 0, get: (c) => gpu(c).d3dSharedMb },
  'gpu.powerLimit': { p: 'nvml.enforcedLimitW', pos: true, group: 'gpu', label: 'Power limit', unit: 'W', d: 0, get: (c) => nv(c).enforcedLimitW ?? nv(c).powerLimitW },
  'gpu.energy': { group: 'gpu', label: 'GPU energy (session)', unit: 'kJ', d: 2, drv: true, get: (c) => dv(c)?.energy?.gpuKj },
  'gpu.throttle': { p: 'nvml.throttle', group: 'gpu', label: 'Clock limiters', unit: '', d: 0, get: (c) => { const r = nv(c).throttle; if (!r) return null; const x = r.filter((k) => k !== 'idle' && k !== 'appClocks'); return x.length ? x.join(' · ') : 'none' } },

  'cpu.load': { group: 'cpu', label: 'CPU load', unit: '%', d: 0, get: (c) => c.sensors?.cpu ?? null },
  'cpu.temp': { p: 'cpu.temp', pos: true, group: 'cpu', label: 'CPU temp', unit: '°C', d: 0, get: (c) => cpu(c).temp ?? c.sensors?.cpuTemp, tone: [80, 90] },
  'cpu.clock': { p: 'cpu.clock', pos: true, group: 'cpu', label: 'CPU clock', unit: 'MHz', d: 0, get: (c) => cpu(c).clock },
  'cpu.clockMax': { p: 'cpu.clockMax', pos: true, group: 'cpu', label: 'Top core clock', unit: 'MHz', d: 0, get: (c) => cpu(c).clockMax },
  'cpu.power': { p: 'cpu.power', pos: true, group: 'cpu', label: 'CPU power', unit: 'W', d: 0, get: (c) => cpu(c).power ?? c.sensors?.cpuPower },
  'cpu.vcore': { p: 'cpu.vcore', pos: true, group: 'cpu', label: 'Vcore', unit: 'V', d: 3, get: (c) => cpu(c).vcore },
  'cpu.loadMax': { group: 'cpu', label: 'Busiest thread', unit: '%', d: 0, get: (c) => { const t = c.sensors?.cores; return t?.length ? Math.max(...t) : null }, tone: [90, 98] },
  'cpu.name': { group: 'cpu', label: 'CPU name', unit: '', d: 0, get: (c) => cpu(c).name || null },

  'ram.used': { p: 'ram.usedGb', group: 'ram', label: 'RAM used', unit: 'GB', d: 1, get: (c) => ram(c).usedGb },
  'ram.total': { p: 'ram.totalGb', pos: true, group: 'ram', label: 'RAM total', unit: 'GB', d: 0, get: (c) => ram(c).totalGb },
  'ram.rate': { p: 'ram.effectiveMts', pos: true, group: 'ram', label: 'RAM rate (SMBIOS)', unit: 'MT/s', d: 0, drv: true, get: (c) => ram(c).effectiveMts },
  'ram.base': { p: 'ram.baseClockMhz', pos: true, group: 'ram', label: 'RAM base clock (SMBIOS)', unit: 'MHz', d: 0, drv: true, get: (c) => ram(c).baseClockMhz },
  'ram.load': { p: 'ram.load', group: 'ram', label: 'RAM %', unit: '%', d: 0, get: (c) => ram(c).load ?? c.sensors?.ram, tone: [85, 95] },

  'session.time': { group: 'session', label: 'Session', unit: '', d: 0, get: (c) => { const s = ss(c)?.seconds; return s == null ? null : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` } },
  'session.avgFps': { group: 'session', label: 'Avg FPS', unit: '', d: 1, get: (c) => ss(c)?.avgFps },
  'session.minFps': { group: 'session', label: 'Min FPS', unit: '', d: 0, get: (c) => ss(c)?.minFps },
  'session.maxFps': { group: 'session', label: 'Max FPS', unit: '', d: 0, get: (c) => ss(c)?.maxFps },
  'session.low1': { group: 'session', label: 'Session 1%', unit: '', d: 0, get: (c) => ss(c)?.low1 },
  'session.low01': { group: 'session', label: 'Session 0.1%', unit: '', d: 0, get: (c) => ss(c)?.low01 },
  'session.worst': { group: 'session', label: 'Worst frame', unit: 'ms', d: 1, get: (c) => ss(c)?.maxFrameMs },
  'session.stdDev': { group: 'session', label: 'Frametime σ', unit: 'ms', d: 2, get: (c) => ss(c)?.stdDevMs },
  'session.stutters': { group: 'session', label: 'Stutters', unit: '', d: 0, get: (c) => ss(c)?.stutters },
  'session.frames': { group: 'session', label: 'Frames', unit: '', d: 0, get: (c) => ss(c)?.frames },
  'session.renderMin': { group: 'session', label: 'Render latency min', unit: 'ms', d: 1, get: (c) => rl(c)?.min },
  'session.renderAvg': { group: 'session', label: 'Render latency avg', unit: 'ms', d: 1, get: (c) => rl(c)?.avg },
  'session.renderMax': { group: 'session', label: 'Render latency max', unit: 'ms', d: 1, get: (c) => rl(c)?.max },
  'pwr.fpsPerWatt': { group: 'power', label: 'FPS per watt', unit: 'FPS/W', d: 2, est: true, get: (c) => dv(c)?.efficiency?.fpsPerWatt },
  'pwr.fpsPerWattAvg': { group: 'power', label: 'FPS per watt (avg)', unit: 'FPS/W', d: 2, est: true, get: (c) => dv(c)?.efficiency?.fpsPerWattAvg },
  'pwr.jpf': { group: 'power', label: 'Energy per frame', unit: 'J', d: 2, est: true, get: (c) => dv(c)?.efficiency?.joulesPerFrame },
  'pwr.jpfAvg': { group: 'power', label: 'Energy per frame (avg)', unit: 'J', d: 2, est: true, get: (c) => dv(c)?.efficiency?.joulesPerFrameAvg },
  'psu.load': { group: 'power', label: 'PSU load', unit: '%', d: 0, est: true, get: (c) => dv(c)?.system?.loadPct, tone: [80, 95] },
  'psu.eff': { group: 'power', label: 'PSU efficiency', unit: '%', d: 0, est: true, get: (c) => dv(c)?.system?.efficiency },
  'psu.dc': { group: 'power', label: 'PC total (DC)', unit: 'W', d: 0, est: true, get: (c) => dv(c)?.system?.dcW },
  'psu.ac': { group: 'power', label: 'PC at the wall (AC)', unit: 'W', d: 0, est: true, get: (c) => dv(c)?.system?.acW },

  ...RAIL_METRICS,
  ...COST_METRICS,
  clock: { group: 'other', label: 'Clock', unit: '', d: 0, get: (c) => { const n = new Date(c.now || Date.now()); return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}` } }
}

/** Series a graph widget can plot. */
export const SERIES = {
  frametime: { label: 'Frame time', mode: 'ft', floor: 0, ceil: (v) => Math.max(16.7, ...v), get: (c) => fr(c)?.graph || [] },
  fps: { label: 'FPS', mode: 'fps', floor: 0, ceil: (v) => Math.max(60, ...v), get: (c) => c.history?.fps || [] },
  'gpu.load': { label: 'GPU load', mode: 'pct', floor: 0, ceil: () => 100, get: (c) => c.history?.gpu || [] },
  'cpu.load': { label: 'CPU load', mode: 'pct', floor: 0, ceil: () => 100, get: (c) => c.history?.cpu || [] },
  'gpu.temp': { label: 'GPU temp', mode: 'temp', floor: 30, ceil: () => 100, get: (c) => c.history?.gpuTemp || [] },
  'cpu.temp': { label: 'CPU temp', mode: 'temp', floor: 30, ceil: () => 100, get: (c) => c.history?.cpuTemp || [] }
}

export const WIDGET_TYPES = ['metrics', 'value', 'graph', 'bars', 'stats', 'text', 'separator', 'spacer']
const ANCHORS = ['tl', 'tc', 'tr', 'ml', 'mr', 'bl', 'bc', 'br']
const STYLE_KEYS = {
  color: 'color', background: 'background', fontFamily: 'font-family', fontSize: 'font-size', fontWeight: 'font-weight',
  padding: 'padding', margin: 'margin', borderRadius: 'border-radius', border: 'border', textAlign: 'text-align',
  opacity: 'opacity', letterSpacing: 'letter-spacing', textShadow: 'text-shadow', gap: 'gap', justifyContent: 'justify-content'
}

function normStyle(s) {
  const out = {}
  if (!s || typeof s !== 'object') return out
  for (const k of Object.keys(STYLE_KEYS)) { const v = cssValue(s[k]); if (v) out[k] = v }
  return out
}

let seq = 0
const newId = (type) => `${type}${Date.now().toString(36).slice(-4)}${(seq++).toString(36)}`
const idOk = (x) => (typeof x === 'string' && /^[A-Za-z][\w-]{0,31}$/.test(x) ? x : null)

function normItem(it) {
  const metric = METRICS[it?.metric] ? it.metric : 'fps'
  return {
    metric,
    ...(isNum(it.decimals) ? { decimals: num(it.decimals, 0, 3, 0) } : {}),
    ...(typeof it.unit === 'string' ? { unit: str(it.unit, 12) } : {}),
    ...(typeof it.prefix === 'string' ? { prefix: str(it.prefix, 16) } : {}),
    ...(color(it.color, null) ? { color: color(it.color, null) } : {}),
    ...(isNum(it.size) ? { size: num(it.size, 6, 96, 14) } : {}),
    ...(isNum(it.warn) ? { warn: Number(it.warn) } : {}),
    ...(isNum(it.bad) ? { bad: Number(it.bad) } : {})
  }
}

function normWidget(w) {
  const type = WIDGET_TYPES.includes(w?.type) ? w.type : null
  if (!type) return null
  const base = { id: idOk(w.id) || newId(type), type, style: normStyle(w.style), ...(w.hidden ? { hidden: true } : {}) }
  switch (type) {
    case 'metrics': return { ...base, label: str(w.label, 24), labelColor: color(w.labelColor, ''), items: (Array.isArray(w.items) ? w.items : []).slice(0, 12).map(normItem) }
    case 'value': return { ...base, ...normItem(w), label: str(w.label, 24), size: num(w.size, 8, 160, 28) }
    case 'graph': {
      const series = (Array.isArray(w.series) ? w.series : []).filter((s) => SERIES[s?.source]).slice(0, 4).map((s) => ({ source: s.source, color: color(s.color, '#fbbf24') }))
      return { ...base, title: str(w.title, 30), series: series.length ? series : [{ source: 'frametime', color: '#fbbf24' }], height: num(w.height, 16, 200, 40), width: num(w.width, 0, 1200, 0), fill: Boolean(w.fill), info: w.info !== false, lineWidth: num(w.lineWidth, 0.5, 6, 1.5), grid: w.grid !== false }
    }
    case 'bars': return { ...base, height: num(w.height, 8, 120, 26), color: color(w.color, '#60a5fa'), warnColor: color(w.warnColor, '#fbbf24'), badColor: color(w.badColor, '#f87171'), title: str(w.title, 30) }
    case 'stats': return { ...base, keys: (Array.isArray(w.keys) ? w.keys : []).filter((k) => METRICS[k]).slice(0, 24), columns: num(w.columns, 1, 4, 2) }
    case 'text': return { ...base, text: str(w.text, 120) }
    case 'separator': return base
    case 'spacer': return { ...base, height: num(w.height, 1, 120, 6) }
    default: return null
  }
}

export const DEFAULT_THEME = {
  fontFamily: '"Cascadia Mono", Consolas, "Segoe UI", monospace', fontSize: 13, fontWeight: 600,
  color: '#fafafa', labelColor: '#a1a1aa', unitColor: '#a1a1aa', good: '#4ade80', warn: '#fbbf24', bad: '#f87171',
  background: '#09090b', backgroundOpacity: 0.72, border: '', radius: 6, padding: 8, gap: 2, direction: 'column', textShadow: true
}

export function normalizeLayout(m = {}) {
  const t = m.theme && typeof m.theme === 'object' ? m.theme : {}
  return {
    version: 1,
    id: idOk(m.id) || newId('layout'),
    name: str(m.name, 40, 'Meu overlay') || 'Meu overlay',
    anchor: ANCHORS.includes(m.anchor) ? m.anchor : 'tl',
    offsetX: num(m.offsetX, -4000, 4000, 0),
    offsetY: num(m.offsetY, -4000, 4000, 0),
    scale: num(m.scale, 0.4, 4, 1),
    opacity: num(m.opacity, 0.1, 1, 1),
    theme: {
      fontFamily: cssValue(t.fontFamily, 160) || DEFAULT_THEME.fontFamily,
      fontSize: num(t.fontSize, 6, 64, DEFAULT_THEME.fontSize),
      fontWeight: num(t.fontWeight, 100, 900, DEFAULT_THEME.fontWeight),
      color: color(t.color, DEFAULT_THEME.color),
      labelColor: color(t.labelColor, DEFAULT_THEME.labelColor),
      unitColor: color(t.unitColor, DEFAULT_THEME.unitColor),
      good: color(t.good, DEFAULT_THEME.good),
      warn: color(t.warn, DEFAULT_THEME.warn),
      bad: color(t.bad, DEFAULT_THEME.bad),
      background: color(t.background, DEFAULT_THEME.background),
      backgroundOpacity: num(t.backgroundOpacity, 0, 1, DEFAULT_THEME.backgroundOpacity),
      border: cssValue(t.border, 80),
      radius: num(t.radius, 0, 60, DEFAULT_THEME.radius),
      padding: num(t.padding, 0, 60, DEFAULT_THEME.padding),
      gap: num(t.gap, 0, 40, DEFAULT_THEME.gap),
      direction: t.direction === 'row' ? 'row' : 'column',
      textShadow: t.textShadow !== false
    },
    widgets: (Array.isArray(m.widgets) ? m.widgets : []).slice(0, 60).map(normWidget).filter(Boolean),
    css: typeof m.css === 'string' ? m.css.slice(0, 20000) : ''
  }
}

// ---------------------------------------------------------------- rendering

const hexToRgba = (c, a) => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c || '')
  if (!m) return c
  const h = m[1].length === 3 ? m[1].split('').map((x) => x + x).join('') : m[1]
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`
}
const px = (v) => (isNum(v) ? `${Number(v)}px` : v)

/** 'measured' | 'derived' | 'estimated' | 'live' (frame and session stats): the class of a catalog metric. */
export function metricKind(m) { return m?.est ? 'estimated' : m?.drv ? 'derived' : m?.p ? 'measured' : 'live' }

export const REASON_TEXT = {
  needs_admin: 'needs DarkHub as administrator', needs_pawnio: 'needs the PawnIO driver', not_exposed: 'not exposed by this hardware/driver',
  sentinel: 'placeholder value from the sensor (not a reading)', non_nvidia: 'NVIDIA only'
}

/**
 * The value a metric shows and its provenance: { raw, kind: 'measured'|'derived'|'estimated'|'live'|'unavailable',
 * source, reason }. A 0 on a `pos` metric or a value whose source is unavailable never passes as a reading.
 */
export function metricValue(key, ctx) {
  const m = METRICS[key]
  if (!m) return { raw: null, kind: 'unavailable', reason: 'not_exposed' }
  let raw = m.get(ctx)
  if (raw === '' || raw === undefined) raw = null
  if (m.pos && isNum(raw) && !(Number(raw) > 0)) return { raw: null, kind: 'unavailable', reason: 'sentinel' }
  if (m.est) return raw == null ? { raw, kind: 'unavailable', reason: 'not_exposed' } : { raw, kind: 'estimated' }
  if (m.p && ctx.hw) {
    const pm = lhmMetric(ctx.hw, m.p)
    if (raw == null) return { raw, kind: 'unavailable', reason: pm.prov === 'unavailable' ? pm.reason : 'not_exposed' }
    // the advanced sensor was not read and the value came from Windows' own counters
    if (pm.prov === 'unavailable') return { raw, kind: m.drv ? 'derived' : 'measured', source: 'system' }
    return { raw, kind: m.drv ? 'derived' : pm.prov, source: pm.source }
  }
  if (raw == null) return { raw, kind: 'unavailable', reason: 'not_exposed' }
  return { raw, kind: m.drv ? 'derived' : metricKind(m) }
}

function value(item, ctx, theme) {
  const m = METRICS[item.metric]
  const mv = metricValue(item.metric, ctx)
  const raw = mv.raw
  const isNumber = isNum(raw)
  const d = item.decimals ?? m.d
  const text = raw == null || raw === '' ? '—' : isNumber ? Number(raw).toFixed(d) : String(raw)
  let tone = ''
  const warn = item.warn ?? m.tone?.[0]
  const bad = item.bad ?? m.tone?.[1]
  const lowBad = m.tone?.[2] ?? (isNum(warn) && isNum(bad) && Number(bad) < Number(warn))
  if (isNumber && isNum(warn) && isNum(bad)) {
    const v = Number(raw)
    tone = lowBad ? (v <= bad ? 'bad' : v <= warn ? 'warn' : '') : (v >= bad ? 'bad' : v >= warn ? 'warn' : '')
  }
  const star = mv.kind === 'estimated' || mv.kind === 'derived'
  const unit = raw == null ? '' : `${item.unit ?? m.unit}${star ? '*' : ''}`
  const prefix = raw == null ? item.prefix : (item.prefix ?? m.pre)
  const style = [item.color && !tone ? `color:${item.color}` : '', item.size ? `font-size:${item.size}px` : ''].filter(Boolean).join(';')
  const why = raw == null ? (ctx.labels?.[`why.${mv.reason}`] || REASON_TEXT[mv.reason] || mv.reason) : ''
  return `<span class="val ${tone}${raw == null ? ' na' : ''}"${why ? ` title="${esc(why)}"` : ''}${style ? ` style="${esc(style)}"` : ''}>${prefix ? `<span class="pre">${esc(prefix)}</span>` : ''}${esc(text)}${unit ? `<span class="unit">${esc(unit)}</span>` : ''}</span>`
}

/** Stable short hash of a layout's structure: the overlay page rebuilds only when it changes. */
function hash(text) {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0
  return h.toString(36)
}

/**
 * HTML + CSS for a layout with the given data. Graphs and bars are drawn by the page on canvas: in game it plots the
 * live streams (opts.values false: no points are sent), the editor preview draws the points sent here.
 * `blocks` carries each block's inner HTML so the page can refresh text without rebuilding the canvases.
 */
export function renderLayout(layout, ctx, opts = {}) {
  const withValues = opts.values !== false
  const L = normalizeLayout(layout)
  const t = L.theme
  const canvases = []
  const blocks = []
  const threads = (ctx.sensors?.cores || []).map((x) => Math.round(x))
  const add = (w, cls, inner, extra = {}) => blocks.push({ id: w.id, cls, inner, ...extra })
  for (const w of L.widgets) {
    if (w.hidden) continue
    switch (w.type) {
      case 'metrics':
        add(w, 'w-metrics', `<span class="lbl"${w.labelColor ? ` style="color:${esc(w.labelColor)}"` : ''}>${esc(w.label)}</span><span class="vals">${w.items.map((it) => value(it, ctx, t)).join('')}</span>`)
        break
      case 'value':
        // a labelled big value ("144 FPS") does not repeat the unit unless the user set one
        add(w, 'w-value', `${value({ ...w, size: undefined, unit: w.unit ?? (w.label ? '' : undefined) }, ctx, t)}${w.label ? `<span class="lbl">${esc(w.label)}</span>` : ''}`)
        break
      case 'graph': {
        const series = w.series.map((s) => ({ color: s.color, values: SERIES[s.source].get(ctx).slice(-240) }))
        const def = SERIES[w.series[0].source]
        const all = series.flatMap((s) => s.values)
        const first = series[0].values
        const d = w.series[0].source === 'frametime' ? 1 : 0
        const info = w.info && first.length ? `${Math.min(...first).toFixed(d)} – ${Math.max(...first).toFixed(d)}` : ''
        canvases.push({
          id: `c-${w.id}`, kind: 'graph', sources: w.series.map((s) => ({ key: s.source, color: s.color })), mode: def.mode,
          height: w.height, width: w.width, fill: w.fill, lineWidth: w.lineWidth, grid: w.grid,
          ...(withValues ? { series, floor: def.floor, ceil: all.length ? def.ceil(all) : 1 } : {})
        })
        const head = w.title || w.info ? `<span class="lbl">${esc(w.title)}</span><span class="unit">${esc(info)}</span>` : null
        add(w, 'w-graph', `${head != null ? `<div class="ghead">${head}</div>` : ''}<canvas id="c-${w.id}" height="${w.height}"></canvas>`, { canvas: true, head })
        break
      }
      case 'bars': {
        canvases.push({ id: `c-${w.id}`, kind: 'bars', values: threads, height: w.height, colors: [w.color, w.warnColor, w.badColor] })
        const head = w.title ? `<span class="lbl">${esc(w.title)}</span><span class="unit">${threads.length}</span>` : null
        add(w, 'w-bars', `${head != null ? `<div class="ghead">${head}</div>` : ''}<canvas id="c-${w.id}" height="${w.height}"></canvas>`, { canvas: true, head })
        break
      }
      case 'stats':
        add(w, 'w-stats', w.keys.map((k) => `<span class="lbl">${esc(ctx.labels?.[`m.${k}`] || METRICS[k].label)}${METRICS[k].est || METRICS[k].drv ? '*' : ''}</span>${value({ metric: k }, ctx, t)}`).join(''))
        break
      case 'text':
        add(w, 'w-text', esc(w.text))
        break
      case 'separator':
        add(w, 'w-sep', '')
        break
      case 'spacer':
        add(w, 'w-spacer', '', { style: `height:${w.height}px` })
        break
      default: break
    }
  }
  const parts = blocks.map((b) => `<div class="w ${b.cls}" id="w-${b.id}"${b.style ? ` style="${b.style}"` : ''}>${b.inner}</div>`)

  const base = `#box.custom{font-family:${t.fontFamily};font-size:${t.fontSize}px;font-weight:${t.fontWeight};line-height:1.35;color:${t.color};`
    + `background:${hexToRgba(t.background, t.backgroundOpacity)};padding:${t.padding}px;border-radius:${t.radius}px;${t.border ? `border:${t.border};` : ''}`
    + `display:flex;flex-direction:${t.direction};gap:${t.gap}px ${t.direction === 'row' ? t.gap * 4 + 8 : 0}px;align-items:${t.direction === 'row' ? 'center' : 'stretch'};`
    + `min-width:0;text-shadow:${t.textShadow ? '0 1px 1px rgba(0,0,0,.7)' : 'none'}}`
    + '#box.custom .w{white-space:nowrap}'
    + `#box.custom .lbl{color:${t.labelColor};font-weight:700}`
    + `#box.custom .unit{color:${t.unitColor};font-size:.78em;font-weight:500;margin-left:2px}`
    + `#box.custom .pre{color:${t.unitColor};font-size:.78em;font-weight:500;margin-right:3px}`
    + '#box.custom .val{font-variant-numeric:tabular-nums}'
    + `#box.custom .val.good{color:${t.good}}#box.custom .val.warn{color:${t.warn}}#box.custom .val.bad{color:${t.bad}}`
    + '#box.custom .w-metrics{display:flex;align-items:baseline;gap:.9em}'
    + (t.direction === 'row' ? '#box.custom .w-metrics .lbl:empty{display:none}' : '#box.custom .w-metrics .lbl{min-width:2.9em}')
    + '#box.custom .w-metrics .vals{display:flex;gap:.9em}'
    + '#box.custom .w-value{display:flex;align-items:baseline;gap:.4em}'
    + '#box.custom .w-graph canvas,#box.custom .w-bars canvas{display:block}'
    + '#box.custom .ghead{display:flex;justify-content:space-between;gap:10px;font-size:.85em}'
    + '#box.custom .w-stats{display:grid;column-gap:1em}'
    + `#box.custom .w-sep{height:1px;background:${hexToRgba(t.labelColor, 0.3)};margin:3px 0}`
  const perWidget = L.widgets.map((w) => {
    const rules = Object.entries(w.style).map(([k, v]) => `${STYLE_KEYS[k]}:${k === 'fontSize' || k === 'padding' || k === 'margin' || k === 'borderRadius' || k === 'gap' ? px(v) : v}`)
    if (w.type === 'value') rules.push(`font-size:${w.size}px`)
    if (w.type === 'stats') rules.push(`grid-template-columns:repeat(${w.columns}, auto auto)`)
    return rules.length ? `#box.custom #w-${w.id}{${rules.join(';')}}` : ''
  }).join('')

  const css = base + perWidget + '\n' + L.css
  return {
    html: parts.join(''),
    css,
    sig: hash(JSON.stringify(L.widgets) + css),
    blocks: blocks.map(({ id, inner, canvas, head }) => (canvas ? { id, canvas: true, head } : { id, inner })),
    threads,
    canvases,
    box: { anchor: L.anchor, offsetX: L.offsetX, offsetY: L.offsetY, scale: L.scale, opacity: L.opacity }
  }
}

// ---------------------------------------------------------------- templates (starting points in the editor)

const M = (label, labelColor, ...items) => ({ type: 'metrics', label, labelColor, items: items.map((x) => (typeof x === 'string' ? { metric: x } : x)) })

export const PRESETS = {
  rivatuner: {
    name: 'RivaTuner clássico',
    widgets: [
      M('GPU', '#4ade80', 'gpu.load', 'gpu.temp', 'gpu.clock', 'gpu.power'),
      M('VRAM', '#a78bfa', 'gpu.vram', 'gpu.memClock'),
      M('CPU', '#60a5fa', 'cpu.load', 'cpu.temp', 'cpu.clock', 'cpu.power'),
      M('RAM', '#f472b6', 'ram.used', 'ram.load'),
      M('FPS', '#fbbf24', { metric: 'fps', size: 18, unit: '' }, 'frametime', { metric: 'low1', prefix: '1%' }, { metric: 'low01', prefix: '0.1%' }),
      { type: 'graph', title: 'Frametime', series: [{ source: 'frametime', color: '#fbbf24' }], height: 40 }
    ]
  },
  overclocker: {
    name: 'Overclocker',
    widgets: [
      M('GPU', '#4ade80', 'gpu.load', 'gpu.temp', 'gpu.clock', 'gpu.power', 'gpu.voltage', 'gpu.powerPct'),
      M('', '', { metric: 'gpu.hotspot', unit: '°C hot' }, { metric: 'gpu.memJunction', unit: '°C mem' }, 'gpu.fanRpm', 'gpu.fanPct'),
      M('VRAM', '#a78bfa', 'gpu.vram', 'gpu.memClock', 'gpu.memCtrl'),
      M('CPU', '#60a5fa', 'cpu.load', 'cpu.temp', 'cpu.clock', 'cpu.power', 'cpu.vcore'),
      M('', '', { metric: 'cpu.loadMax', unit: '% max' }, { metric: 'cpu.clockMax', unit: 'MHz max' }),
      M('RAM', '#f472b6', 'ram.used', 'ram.load', 'ram.rate'),
      M('FPS', '#fbbf24', { metric: 'fps', size: 18, unit: '' }, 'frametime', { metric: 'low1', prefix: '1%' }, { metric: 'low01', prefix: '0.1%' }),
      M('PWR', '#4ade80', 'gpu.power', 'pwr.fpsPerWatt', 'pwr.jpf', 'gpu.energy'),
      M('PSU', '#60a5fa', 'psu.load', 'psu.eff', 'psu.dc', 'psu.ac'),
      M('R$', '#fbbf24', 'cost.gpu.hour', 'cost.cpuGpu.hour', 'cost.withExtra.hour'),
      { type: 'graph', title: 'Frametime', series: [{ source: 'frametime', color: '#fbbf24' }], height: 40 },
      { type: 'graph', title: 'GPU · CPU %', series: [{ source: 'gpu.load', color: '#4ade80' }, { source: 'cpu.load', color: '#60a5fa' }], height: 34, info: false },
      { type: 'bars', title: 'Threads', height: 24 },
      { type: 'separator' },
      { type: 'stats', columns: 2, keys: ['session.time', 'session.avgFps', 'session.low1', 'session.low01', 'session.worst', 'session.stdDev', 'session.stutters', 'bound'] }
    ]
  },
  topbar: {
    name: 'Barra superior',
    anchor: 'tc',
    theme: { direction: 'row', radius: 0, padding: 4, backgroundOpacity: 0.55 },
    widgets: [
      { type: 'value', metric: 'fps', size: 16, label: 'FPS' },
      M('', '', { metric: 'low1', prefix: '1%' }, 'frametime'),
      M('GPU', '#4ade80', 'gpu.load', 'gpu.temp'),
      M('CPU', '#60a5fa', 'cpu.load', 'cpu.temp'),
      { type: 'value', metric: 'clock', size: 13 }
    ]
  },
  minimal: {
    name: 'Só FPS',
    theme: { backgroundOpacity: 0, padding: 2 },
    widgets: [{ type: 'value', metric: 'fps', size: 30, unit: '' }]
  },
  neon: {
    name: 'Neon',
    theme: { fontFamily: '"Segoe UI", system-ui, sans-serif', color: '#e0f2fe', labelColor: '#22d3ee', unitColor: '#67e8f9', background: '#020617', backgroundOpacity: 0.6, border: '1px solid rgba(34,211,238,.6)', radius: 12, padding: 10, gap: 4 },
    widgets: [
      { type: 'value', metric: 'fps', size: 34, label: 'FPS', style: { color: '#f0abfc', textShadow: '0 0 10px #d946ef' } },
      M('GPU', '#22d3ee', 'gpu.load', 'gpu.temp', 'gpu.power'),
      M('CPU', '#22d3ee', 'cpu.load', 'cpu.temp'),
      { type: 'graph', series: [{ source: 'frametime', color: '#f0abfc' }], height: 34, fill: true, info: false }
    ],
    css: '#box.custom { box-shadow: 0 0 18px rgba(34, 211, 238, .35); }'
  },
  compact: {
    name: 'Compacto',
    theme: { fontFamily: '"Segoe UI", system-ui, sans-serif' },
    widgets: [
      { type: 'value', metric: 'fps', size: 22, label: 'FPS' },
      { type: 'stats', columns: 1, keys: ['low1', 'frametime', 'cpu.load', 'cpu.temp', 'gpu.load', 'gpu.temp'] },
      { type: 'graph', series: [{ source: 'frametime', color: '#60a5fa' }], height: 34, info: false }
    ]
  }
}

export function fromPreset(key) {
  const p = PRESETS[key] || PRESETS.rivatuner
  return normalizeLayout({ ...JSON.parse(JSON.stringify(p)), id: undefined })
}

/** Realistic numbers for the editor preview when no game is running. */
export function sampleContext(now = Date.now()) {
  const graph = Array.from({ length: 120 }, (_, i) => 6.9 + Math.sin(i / 6) * 0.5 + (i % 47 === 0 ? 9 : 0))
  const hist = (base, amp) => Array.from({ length: 120 }, (_, i) => base + Math.sin(i / 9) * amp)
  const frames = { fps: 144, frameTimeMs: 6.9, low1: 118, low01: 96, maxFrameTimeMs: 15.9, latencyMs: 18.4, renderLatencyMs: 2.1, gpuBusyMs: 6.6, presentMode: 'Hardware: Independent Flip', graph }
  const hwSample = {
      gpu: { name: 'GeForce RTX', load: 97, temp: 67, hotspot: 79, memJunction: 72, clock: 2805, memClock: 14001, power: 138, powerPct: 95, voltage: 1.0, fanRpm: 1640, fanPct: 52, vramUsedMb: 6420, vramTotalMb: 8151, memCtrlLoad: 41, vramPct: 79, busLoad: 12, videoEngineLoad: 0, pcieRxBps: 41943040, pcieTxBps: 18874368, d3dSharedMb: 210 },
      cpu: { name: 'Ryzen', temp: 71, clock: 4512, clockMax: 4650, power: 62, vcore: 1.25 },
      ram: { usedGb: 18.4, totalGb: 32, load: 57, effectiveMts: 3200, baseClockMhz: 1600 },
      nvml: { powerW: 138, enforcedLimitW: 145, pcieGen: 4, pcieWidth: 16, encoderPct: 0, decoderPct: 0, throttle: ['swPowerCap'] }
  }
  hwSample.gpu.rails = [{ id: 'PCIE', w: 36, v: 12.14, a: 2.97 }, { id: '16PIN0', w: 98, v: 12.15, a: 8.07 }]
  hwSample.gpu.pcieSlot = hwSample.gpu.rails[0]
  hwSample.gpu.railsW = 134
  const sensorsSample = { cpu: 41, cores: [88, 34, 72, 21, 65, 40, 58, 12, 47, 30, 81, 25, 36, 18, 52, 29] }
  const session = { seconds: 1534, frames: 220000, avgFps: 143.2, minFps: 121, maxFps: 165, low1: 117, low01: 92, maxFrameMs: 24.1, stdDevMs: 1.42, stutters: 7 }
  return {
    now,
    frames,
    renderLatency: { min: 0.6, avg: 2.1, max: 9.8 },
    derived: buildDerived({ frames, session, hw: hwSample, sensors: sensorsSample, settings: {}, energy: null }),
    session,
    hw: hwSample,
    // CPU load comes from Windows' counters (LHM's is wrong on recent Windows 11)
    sensors: sensorsSample,
    history: { fps: hist(142, 8), gpu: hist(95, 3), cpu: hist(40, 9), gpuTemp: hist(66, 2), cpuTemp: hist(70, 3) }
  }
}
