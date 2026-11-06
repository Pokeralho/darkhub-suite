// LibreHardwareMonitor sample ({"type":"lhm","hw":[{kind,name,s:[[type,name,value]]}]}) → the numbers an overclocker
// overlay shows. Pure. Without the PawnIO driver (or without admin) LHM reports CPU clocks, temperature and power as
// 0: those zeros mean "not read", never a real value, so they come out as null.

const pos = (x) => (Number.isFinite(x) && x > 0 ? x : null)
// AMD SVI2 voltage code 0 decodes to 1.55 V: LHM reports exactly that when the telemetry is not read (no admin or
// PawnIO, or boards that do not expose SVI2 TFN), for Core and SoC alike. It is never a real reading.
const volts = (x) => (pos(x) != null && Math.abs(x - 1.55) > 1e-4 ? x : null)

function hwEntries(hw, type) { return (hw?.s || []).filter(([t]) => t === type).map(([, n, v]) => [String(n), Number(v)]) }

function index(hw) {
  const map = new Map()
  for (const [type, name, value] of hw?.s || []) map.set(`${type}|${name}`, Number(value))
  const get = (type, ...names) => { for (const n of names) { const v = map.get(`${type}|${n}`); if (v != null && Number.isFinite(v)) return v } return null }
  const all = (type, re) => [...map].filter(([k]) => k.startsWith(`${type}|`) && re.test(k.slice(type.length + 1))).map(([, v]) => v)
  return { get, all }
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

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

export function readLhm(payload) {
  const list = Array.isArray(payload?.hw) ? payload.hw : []
  const out = { cpu: null, gpu: null, ram: null, at: payload?.t ?? null }

  const cpuHw = list.find((h) => h.kind === 'Cpu')
  if (cpuHw) {
    const { get, all } = index(cpuHw)
    const coreClocks = all('Clock', /^Core #\d+$/).filter((v) => v > 0)
    const threadLoads = all('Load', /^CPU Core #\d+$/)
    out.cpu = {
      name: cpuHw.name,
      load: get('Load', 'CPU Total'),
      loadMax: get('Load', 'CPU Core Max') ?? (threadLoads.length ? Math.max(...threadLoads) : null),
      temp: pos(get('Temperature', 'Core (Tctl/Tdie)', 'CPU Package', 'Core Max', 'Core (Tctl)', 'CPU Cores')),
      clock: pos(get('Clock', 'Cores (Average)')) ?? pos(avg(coreClocks)),
      clockMax: coreClocks.length ? Math.max(...coreClocks) : null,
      clockEffective: pos(get('Clock', 'Cores (Average Effective)')),
      power: pos(get('Power', 'Package', 'CPU Package')),
      // measured Vcore when available, otherwise the highest requested core VID (what the cores ask for under load)
      vcore: volts(get('Voltage', 'Core (SVI2 TFN)')) ?? pos(get('Voltage', 'CPU Core', 'Vcore', 'Core (SVI3 TFN)'))
        ?? (() => { const vids = all('Voltage', /^Core #\d+ VID$/).map(volts).filter((v) => v != null); return vids.length ? Math.max(...vids) : null })(),
      threads: threadLoads
    }
  }

  const gpuHw = list.find((h) => /^Gpu/.test(h.kind))
  if (gpuHw) {
    const { get } = index(gpuHw)
    const used = get('SmallData', 'GPU Memory Used', 'D3D Dedicated Memory Used')
    out.gpu = {
      name: gpuHw.name,
      load: get('Load', 'GPU Core'),
      temp: pos(get('Temperature', 'GPU Core')),
      hotspot: pos(get('Temperature', 'GPU Hot Spot')),
      memJunction: pos(get('Temperature', 'GPU Memory Junction', 'GPU Memory')),
      clock: pos(get('Clock', 'GPU Core')),
      memClock: pos(get('Clock', 'GPU Memory')),
      power: pos(get('Power', 'GPU Package', 'GPU Power', 'GPU Core')),
      powerPct: pos(get('Load', 'GPU Board Power', 'GPU Power')),
      voltage: pos(get('Voltage', 'GPU Core Voltage', 'GPU Core')),
      fanRpm: get('Fan', 'GPU Fan', 'GPU Fan 1'),
      fanPct: get('Control', 'GPU Fan', 'GPU Fan 1'),
      vramUsedMb: used,
      vramTotalMb: get('SmallData', 'GPU Memory Total'),
      memCtrlLoad: get('Load', 'GPU Memory Controller'),
      // sensors LHM emits that used to be dropped
      videoEngineLoad: get('Load', 'GPU Video Engine'),
      busLoad: get('Load', 'GPU Bus'),
      vramPct: get('Load', 'GPU Memory'),
      vramFreeMb: get('SmallData', 'GPU Memory Free'),
      d3dDedicatedMb: get('SmallData', 'D3D Dedicated Memory Used'),
      d3dSharedMb: get('SmallData', 'D3D Shared Memory Used'),
      // PCIe throughput in bytes per second
      pcieRxBps: get('Throughput', 'GPU PCIe Rx'),
      pcieTxBps: get('Throughput', 'GPU PCIe Tx'),
      // D3D engines (several instances share a name, e.g. "D3D Copy"): the busiest instance
      engines: (() => {
        const e = {}
        for (const [k, v] of hwEntries(gpuHw, 'Load')) if (/^D3D /.test(k) && Number.isFinite(v)) e[k.slice(4)] = Math.max(e[k.slice(4)] ?? 0, v)
        return e
      })()
    }
  }

  const ramHw = list.find((h) => h.kind === 'Memory' && !/virtual/i.test(h.name)) || list.find((h) => h.kind === 'Memory')
  if (ramHw) {
    const { get } = index(ramHw)
    const used = get('Data', 'Memory Used')
    const free = get('Data', 'Memory Available')
    out.ram = { usedGb: used, totalGb: used != null && free != null ? used + free : null, load: get('Load', 'Memory') }
  }

  // RAM speed from SMBIOS: firmware tables, not a live counter (derived). DDR transfers twice per clock.
  const smb = payload?.smbios
  if (smb && pos(smb.ramMts) != null) {
    out.ram = out.ram || { usedGb: null, totalGb: null, load: null }
    Object.assign(out.ram, { effectiveMts: smb.ramMts, ratedMts: pos(smb.ramRatedMts), baseClockMhz: smb.ramMts / 2, type: smb.ramType || null, modules: smb.modules ?? null, derived: true })
  }

  // direct NVML reads (NVIDIA): missing fields stay null, never zero
  const nv = (Array.isArray(payload?.nvml) ? payload.nvml : []).find((d) => out.gpu && d?.name && out.gpu.name && d.name === out.gpu.name) || (Array.isArray(payload?.nvml) && payload.nvml.length === 1 ? payload.nvml[0] : null)
  if (nv) {
    const n = (x) => (Number.isFinite(Number(x)) && x != null ? Number(x) : null)
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
  }

  // CPU clock, power, temperature and VID need ring 0 (PawnIO + an elevated helper): say why they are empty
  const admin = payload?.admin !== false
  const pawnio = payload?.pawnio !== false
  out.access = {
    admin, pawnio,
    cpuNeedsAdmin: Boolean(out.cpu) && !admin && out.cpu.temp == null && out.cpu.power == null && out.cpu.clock == null,
    cpuNeedsPawnio: Boolean(out.cpu) && admin && !pawnio && out.cpu.temp == null && out.cpu.power == null && out.cpu.clock == null
  }
  return out
}
