// LibreHardwareMonitor sample ({"type":"lhm","hw":[{kind,name,s:[[type,name,value]]}]}) → the numbers an overclocker
// overlay shows. Pure. Without the PawnIO driver (or without admin) LHM reports CPU clocks, temperature and power as
// 0: those zeros mean "not read", never a real value, so they come out as null.
//
// Provenance: every metric readLhm() returns also gets an entry in `out.prov`, keyed by its path ('gpu.temp',
// 'cpu.vcore', 'nvml.powerW', 'gpu.rails.16PIN0.v', ...):
//   { kind: 'measured',    source: 'lhm' | 'nvml' | 'nvapi', sensor? }   a direct sensor read, identified by name
//   { kind: 'derived',     source, basis }                               computed, or from firmware tables / heuristics
//   { kind: 'estimated',   source }                                      model output (PSU, cost: powerModel.js)
//   { kind: 'unavailable', reason: 'needs_admin' | 'needs_pawnio' | 'not_exposed' | 'sentinel' | 'non_nvidia' }
// The values stay plain numbers (null when unavailable) so existing callers keep working; metric(hw, path) bundles
// value and provenance for the UI and the logs.

export const REASONS = ['needs_admin', 'needs_pawnio', 'not_exposed', 'sentinel', 'non_nvidia']

const finite = (x) => (x != null && Number.isFinite(Number(x)) ? Number(x) : null)
const pos = (x) => (Number.isFinite(x) && x > 0 ? x : null)
// AMD SVI2 voltage code 0 decodes to 1.55 V: LHM reports exactly that when the telemetry is not read (no admin or
// PawnIO, or boards that do not expose SVI2 TFN), for Core and SoC alike. It is never a real reading.
const isSvi2Sentinel = (x) => Number.isFinite(x) && Math.abs(x - 1.55) <= 1e-4
const volts = (x) => (pos(x) != null && !isSvi2Sentinel(x) ? x : null)

function hwEntries(hw, type) { return (hw?.s || []).filter(([t]) => t === type).map(([, n, v]) => [String(n), Number(v)]) }

function index(hw) {
  const map = new Map()
  for (const [type, name, value] of hw?.s || []) map.set(`${type}|${name}`, Number(value))
  /** First of `names` the hardware reports: { name, value } (value may be 0 or a sentinel), or null. */
  const find = (type, ...names) => { for (const n of names) { const v = map.get(`${type}|${n}`); if (v != null && Number.isFinite(v)) return { name: n, value: v } } return null }
  const get = (type, ...names) => find(type, ...names)?.value ?? null
  const all = (type, re) => [...map].filter(([k]) => k.startsWith(`${type}|`) && re.test(k.slice(type.length + 1))).map(([, v]) => v)
  return { find, get, all }
}

/** NVML clocks-event-reason bits (nvml.h) → names. 0x1 idle and 0x2 application clocks are not "limits". */
export const THROTTLE_BITS = [
  [0x1, 'idle'], [0x2, 'appClocks'], [0x4, 'swPowerCap'], [0x8, 'hwSlowdown'], [0x10, 'syncBoost'], [0x20, 'swThermal'],
  [0x40, 'hwThermal'], [0x80, 'hwPowerBrake'], [0x100, 'displayClock'], [0x200, 'boardLimit'], [0x400, 'reliability']
]
export function decodeThrottle(mask) {
  if (!Number.isFinite(mask)) return null
  // masks arrive as JSON numbers (< 2^53): bit tests through division, not 32-bit operators
  return THROTTLE_BITS.filter(([bit]) => Math.floor(mask / bit) % 2 === 1).map(([, name]) => name)
}

/** GPU input connectors the helper can report (DarkHub.HwSensors "nvrails"), in display order. */
export const RAIL_IDS = ['PCIE', '16PIN0', '8PIN0', '8PIN1', '6PIN0', '6PIN1']
/** ATX 12 V tolerance is ±5 %: below 11.4 V a rail is out of spec, below 11.0 V it is in trouble. */
export const RAIL_LOW_V = 11.4
export const RAIL_BAD_V = 11.0
export function railTone(v) {
  if (!Number.isFinite(v)) return ''
  return v < RAIL_BAD_V ? 'bad' : v < RAIL_LOW_V ? 'warn' : ''
}

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

const measured = (source, sensor) => ({ kind: 'measured', source, ...(sensor ? { sensor } : {}) })
const derivedP = (source, basis) => ({ kind: 'derived', source, basis })
const unavailable = (reason, extra) => ({ kind: 'unavailable', reason, ...(extra || {}) })

export function readLhm(payload) {
  const list = Array.isArray(payload?.hw) ? payload.hw : []
  const out = { cpu: null, gpu: null, ram: null, at: payload?.t ?? null, prov: {} }
  const prov = out.prov
  const admin = payload?.admin !== false
  const pawnio = payload?.pawnio !== false

  // A null value always gets a reason. CPU sensors that need ring 0 read 0 (or are missing) without admin / PawnIO.
  const why = (hit, { ring0 = false, svi2 = false } = {}) => {
    if (hit && svi2 && isSvi2Sentinel(hit.value)) return 'sentinel'
    const zeroOrMissing = !hit || !(hit.value > 0)
    if (ring0 && zeroOrMissing && !admin) return 'needs_admin'
    if (ring0 && zeroOrMissing && !pawnio) return 'needs_pawnio'
    return hit ? 'sentinel' : 'not_exposed'
  }
  /** Records the metric's provenance and returns its value: `accept` filters what is physically meaningful. */
  const take = (path, hit, accept, opts = {}) => {
    const v = hit ? accept(hit.value) : null
    prov[path] = v != null ? measured(opts.source || 'lhm', hit.name) : unavailable(why(hit, opts))
    return v
  }

  const cpuHw = list.find((h) => h.kind === 'Cpu')
  if (cpuHw) {
    const { find, all } = index(cpuHw)
    const r0 = { ring0: true }
    const coreClocks = all('Clock', /^Core #\d+$/).filter((v) => v > 0)
    const threadLoads = all('Load', /^CPU Core #\d+$/)
    const cpu = { name: cpuHw.name, threads: threadLoads }
    cpu.load = take('cpu.load', find('Load', 'CPU Total'), finite)
    const lm = find('Load', 'CPU Core Max')
    if (lm) cpu.loadMax = take('cpu.loadMax', lm, finite)
    else { cpu.loadMax = threadLoads.length ? Math.max(...threadLoads) : null; prov['cpu.loadMax'] = cpu.loadMax != null ? derivedP('lhm', 'max of thread loads') : unavailable('not_exposed') }
    cpu.temp = take('cpu.temp', find('Temperature', 'Core (Tctl/Tdie)', 'CPU Package', 'Core Max', 'Core (Tctl)', 'CPU Cores'), pos, r0)
    const avgHit = find('Clock', 'Cores (Average)')
    cpu.clock = take('cpu.clock', avgHit, pos, r0)
    if (cpu.clock == null && coreClocks.length) { cpu.clock = avg(coreClocks); prov['cpu.clock'] = derivedP('lhm', 'average of core clocks') }
    cpu.clockMax = coreClocks.length ? Math.max(...coreClocks) : null
    prov['cpu.clockMax'] = cpu.clockMax != null ? derivedP('lhm', 'max of core clocks') : unavailable(why(null, r0))
    cpu.clockEffective = take('cpu.clockEffective', find('Clock', 'Cores (Average Effective)'), pos, r0)
    cpu.power = take('cpu.power', find('Power', 'Package', 'CPU Package'), pos, r0)
    // measured Vcore when available, otherwise the highest requested core VID (what the cores ask for under load)
    const svi2 = find('Voltage', 'Core (SVI2 TFN)')
    const other = find('Voltage', 'CPU Core', 'Vcore', 'Core (SVI3 TFN)')
    const vSvi2 = svi2 ? volts(svi2.value) : null
    const vOther = other ? pos(other.value) : null
    if (vSvi2 != null) { cpu.vcore = vSvi2; prov['cpu.vcore'] = measured('lhm', svi2.name) }
    else if (vOther != null) { cpu.vcore = vOther; prov['cpu.vcore'] = measured('lhm', other.name) }
    else {
      const vids = all('Voltage', /^Core #\d+ VID$/).map(volts).filter((v) => v != null)
      cpu.vcore = vids.length ? Math.max(...vids) : null
      prov['cpu.vcore'] = cpu.vcore != null ? derivedP('lhm', 'highest core VID (requested, not measured)') : unavailable(why(svi2 || other, { ring0: true, svi2: true }))
    }
    out.cpu = cpu
  }

  const gpuHw = list.find((h) => /^Gpu/.test(h.kind))
  const nvidia = Boolean(gpuHw && gpuHw.kind === 'GpuNvidia') || (Array.isArray(payload?.nvml) && payload.nvml.length > 0)
  if (gpuHw) {
    const { find } = index(gpuHw)
    const g = { name: gpuHw.name }
    const T = (key, type, names, accept = finite) => { g[key] = take(`gpu.${key}`, find(type, ...names), accept) }
    T('load', 'Load', ['GPU Core'])
    T('temp', 'Temperature', ['GPU Core'], pos)
    T('hotspot', 'Temperature', ['GPU Hot Spot'], pos)
    T('memJunction', 'Temperature', ['GPU Memory Junction', 'GPU Memory'], pos)
    T('clock', 'Clock', ['GPU Core'], pos)
    T('memClock', 'Clock', ['GPU Memory'], pos)
    T('power', 'Power', ['GPU Package', 'GPU Power', 'GPU Core'], pos)
    T('powerPct', 'Load', ['GPU Board Power', 'GPU Power'], pos)
    T('voltage', 'Voltage', ['GPU Core Voltage', 'GPU Core'], pos)
    // 0 RPM / 0 % are real (fan stop at idle)
    T('fanRpm', 'Fan', ['GPU Fan', 'GPU Fan 1'])
    T('fanPct', 'Control', ['GPU Fan', 'GPU Fan 1'])
    T('vramUsedMb', 'SmallData', ['GPU Memory Used', 'D3D Dedicated Memory Used'])
    T('vramTotalMb', 'SmallData', ['GPU Memory Total'], pos)
    T('memCtrlLoad', 'Load', ['GPU Memory Controller'])
    // sensors LHM emits that used to be dropped
    T('videoEngineLoad', 'Load', ['GPU Video Engine'])
    T('busLoad', 'Load', ['GPU Bus'])
    T('vramPct', 'Load', ['GPU Memory'])
    T('vramFreeMb', 'SmallData', ['GPU Memory Free'])
    T('d3dDedicatedMb', 'SmallData', ['D3D Dedicated Memory Used'])
    T('d3dSharedMb', 'SmallData', ['D3D Shared Memory Used'])
    // PCIe throughput in bytes per second
    T('pcieRxBps', 'Throughput', ['GPU PCIe Rx'])
    T('pcieTxBps', 'Throughput', ['GPU PCIe Tx'])
    // D3D engines (several instances share a name, e.g. "D3D Copy"): the busiest instance
    g.engines = (() => {
      const e = {}
      for (const [k, v] of hwEntries(gpuHw, 'Load')) if (/^D3D /.test(k) && Number.isFinite(v)) e[k.slice(4)] = Math.max(e[k.slice(4)] ?? 0, v)
      return e
    })()
    out.gpu = g
  }

  const ramHw = list.find((h) => h.kind === 'Memory' && !/virtual/i.test(h.name)) || list.find((h) => h.kind === 'Memory')
  if (ramHw) {
    const { find } = index(ramHw)
    const used = take('ram.usedGb', find('Data', 'Memory Used'), finite)
    const freeHit = find('Data', 'Memory Available')
    const free = freeHit ? finite(freeHit.value) : null
    const totalGb = used != null && free != null ? used + free : null
    prov['ram.totalGb'] = totalGb != null ? derivedP('lhm', 'used + available') : unavailable('not_exposed')
    out.ram = { usedGb: used, totalGb, load: take('ram.load', find('Load', 'Memory'), finite) }
  }

  // RAM speed from SMBIOS: firmware tables, not a live counter (derived). DDR transfers twice per clock.
  const smb = payload?.smbios
  if (smb && pos(smb.ramMts) != null) {
    out.ram = out.ram || { usedGb: null, totalGb: null, load: null }
    Object.assign(out.ram, { effectiveMts: smb.ramMts, ratedMts: pos(smb.ramRatedMts), baseClockMhz: smb.ramMts / 2, type: smb.ramType || null, modules: smb.modules ?? null, derived: true })
    prov['ram.effectiveMts'] = derivedP('smbios', 'configured speed (firmware table)')
    prov['ram.baseClockMhz'] = derivedP('smbios', 'configured speed / 2')
    prov['ram.ratedMts'] = out.ram.ratedMts != null ? derivedP('smbios', 'rated speed (firmware table)') : unavailable('not_exposed')
  } else {
    for (const k of ['ram.effectiveMts', 'ram.baseClockMhz', 'ram.ratedMts']) prov[k] = unavailable('not_exposed')
  }

  // direct NVML reads (NVIDIA): missing fields stay null, never zero
  const nvList = Array.isArray(payload?.nvml) ? payload.nvml : []
  const nv = nvList.find((d) => out.gpu && d?.name && out.gpu.name && d.name === out.gpu.name) || (nvList.length === 1 ? nvList[0] : null)
  const NVML_FIELDS = ['energyJ', 'powerW', 'powerLimitW', 'enforcedLimitW', 'pcieGen', 'pcieWidth', 'pcieMaxGen', 'pcieMaxWidth', 'encoderPct', 'decoderPct', 'throttle', 'computeMemMb', 'computeProcs', 'graphicsMemMb']
  if (nv) {
    const n = finite
    out.nvml = {
      energyJ: n(nv.energyMj) != null ? nv.energyMj / 1000 : null, // since the driver loaded
      powerW: pos(n(nv.powerMw) != null ? nv.powerMw / 1000 : null),
      powerLimitW: pos(n(nv.powerLimitMw) != null ? nv.powerLimitMw / 1000 : null),
      enforcedLimitW: pos(n(nv.enforcedLimitMw) != null ? nv.enforcedLimitMw / 1000 : null),
      pcieGen: n(nv.pcieGen), pcieWidth: n(nv.pcieWidth), pcieMaxGen: n(nv.pcieMaxGen), pcieMaxWidth: n(nv.pcieMaxWidth),
      encoderPct: n(nv.encoderPct), decoderPct: n(nv.decoderPct),
      throttle: n(nv.throttle) != null ? decodeThrottle(nv.throttle) : null,
      computeMemMb: n(nv.computeMemMb), computeProcs: n(nv.computeProcs), graphicsMemMb: n(nv.graphicsMemMb)
    }
    for (const k of NVML_FIELDS) {
      const raw = { energyJ: 'energyMj', powerW: 'powerMw', powerLimitW: 'powerLimitMw', enforcedLimitW: 'enforcedLimitMw' }[k] || k
      prov[`nvml.${k}`] = out.nvml[k] != null ? measured('nvml') : unavailable(nv[raw] != null ? 'sentinel' : 'not_exposed')
    }
  } else {
    for (const k of NVML_FIELDS) prov[`nvml.${k}`] = unavailable(nvidia ? 'not_exposed' : 'non_nvidia')
  }

  // per-connector input power (NVIDIA, NVAPI power monitor): a rail the card does not sense has no entry
  const railList = Array.isArray(payload?.nvrails) ? payload.nvrails : []
  const nr = railList.find((d) => out.gpu && d?.name && out.gpu.name && d.name === out.gpu.name) || (railList.length === 1 ? railList[0] : null)
  if (out.gpu) {
    out.gpu.rails = null
    out.gpu.pcieSlot = null
    out.gpu.railsState = nr ? String(nr.state || 'unsupported') : nvidia ? 'unsupported' : 'non_nvidia'
    if (nr && nr.state === 'ok' && Array.isArray(nr.rails)) {
      const rails = []
      for (const r of nr.rails) {
        if (!RAIL_IDS.includes(r?.id)) continue
        const w = pos(finite(r.w)), v = pos(finite(r.v)), a = finite(r.a) != null && r.a >= 0 ? Number(r.a) : null
        // the helper already range- and V x A-checks; out-of-range leftovers are dropped here too, never zero
        const rail = { id: r.id, w: w != null && w <= 900 ? w : null, v: v != null && v <= 30 ? v : null, a: a != null && a <= 80 ? a : null, ...(r.bad ? { bad: String(r.bad) } : {}) }
        // a current with neither power nor voltage is a placeholder, not a sensed connector
        if (rail.w == null && rail.v == null) continue
        for (const u of ['w', 'v', 'a']) prov[`gpu.rails.${r.id}.${u}`] = rail[u] != null ? measured('nvapi', `power monitor ${r.id}`) : unavailable(r.bad ? 'sentinel' : 'not_exposed')
        rails.push(rail)
      }
      rails.sort((x, y) => RAIL_IDS.indexOf(x.id) - RAIL_IDS.indexOf(y.id))
      out.gpu.rails = rails
      out.gpu.pcieSlot = rails.find((r) => r.id === 'PCIE') || null
      const sum = rails.reduce((s, r) => s + (r.w ?? 0), 0)
      out.gpu.railsW = rails.some((r) => r.w != null) ? sum : null
      prov['gpu.railsW'] = out.gpu.railsW != null ? derivedP('nvapi', 'sum of sensed input rails') : unavailable('not_exposed')
    }
    // the rails the card does not sense: unavailable, with why
    const reason = out.gpu.railsState === 'non_nvidia' ? 'non_nvidia' : 'not_exposed'
    for (const id of RAIL_IDS) for (const u of ['w', 'v', 'a']) if (!prov[`gpu.rails.${id}.${u}`]) prov[`gpu.rails.${id}.${u}`] = unavailable(reason, { state: out.gpu.railsState })
    if (!prov['gpu.railsW']) prov['gpu.railsW'] = unavailable(reason, { state: out.gpu.railsState })
  }

  // CPU clock, power, temperature and VID need ring 0 (PawnIO + an elevated helper): say why they are empty
  out.access = {
    admin, pawnio,
    cpuNeedsAdmin: Boolean(out.cpu) && !admin && out.cpu.temp == null && out.cpu.power == null && out.cpu.clock == null,
    cpuNeedsPawnio: Boolean(out.cpu) && admin && !pawnio && out.cpu.temp == null && out.cpu.power == null && out.cpu.clock == null
  }
  return out
}

/** Value at a metric path of readLhm()'s output ('gpu.temp', 'nvml.powerW', 'gpu.rails.16PIN0.v'). */
export function valueAt(hw, path) {
  if (!hw || typeof path !== 'string') return null
  const m = /^gpu\.rails\.([\w]+)\.([wva])$/.exec(path)
  if (m) return hw.gpu?.rails?.find((r) => r.id === m[1])?.[m[2]] ?? null
  let o = hw
  for (const k of path.split('.')) { if (o == null || typeof o !== 'object') return null; o = o[k] }
  return o ?? null
}

/** { value, prov, source, reason, ...detail } for a metric path. A missing entry is unavailable/not_exposed. */
export function metric(hw, path) {
  const value = valueAt(hw, path)
  const p = hw?.prov?.[path] || (value != null ? { kind: 'measured', source: 'lhm' } : { kind: 'unavailable', reason: 'not_exposed' })
  // a value never travels with an "unavailable" tag, nor a null with a "measured" one
  if (value == null && p.kind !== 'unavailable') return { value: null, prov: 'unavailable', source: p.source ?? null, reason: 'not_exposed' }
  return { value: p.kind === 'unavailable' ? null : value, prov: p.kind, source: p.source ?? null, reason: p.reason ?? null, ...(p.sensor ? { sensor: p.sensor } : {}), ...(p.basis ? { basis: p.basis } : {}) }
}

/** Short tag for logs and tooltips: "measured:lhm", "derived:smbios", "unavailable:needs_admin". */
export function provTag(hw, path) {
  const m = metric(hw, path)
  return m.prov === 'unavailable' ? `unavailable:${m.reason}` : `${m.prov}:${m.source || '?'}`
}
