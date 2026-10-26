// LibreHardwareMonitor sample ({"type":"lhm","hw":[{kind,name,s:[[type,name,value]]}]}) → the numbers an overclocker
// overlay shows. Pure. Without the PawnIO driver (or without admin) LHM reports CPU clocks, temperature and power as
// 0: those zeros mean "not read", never a real value, so they come out as null.

const pos = (x) => (Number.isFinite(x) && x > 0 ? x : null)

function index(hw) {
  const map = new Map()
  for (const [type, name, value] of hw?.s || []) map.set(`${type}|${name}`, Number(value))
  const get = (type, ...names) => { for (const n of names) { const v = map.get(`${type}|${n}`); if (v != null && Number.isFinite(v)) return v } return null }
  const all = (type, re) => [...map].filter(([k]) => k.startsWith(`${type}|`) && re.test(k.slice(type.length + 1))).map(([, v]) => v)
  return { get, all }
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
      vcore: pos(get('Voltage', 'Core (SVI2 TFN)', 'CPU Core', 'Vcore', 'Core (SVI3 TFN)')),
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
      memCtrlLoad: get('Load', 'GPU Memory Controller')
    }
  }

  const ramHw = list.find((h) => h.kind === 'Memory' && !/virtual/i.test(h.name)) || list.find((h) => h.kind === 'Memory')
  if (ramHw) {
    const { get } = index(ramHw)
    const used = get('Data', 'Memory Used')
    const free = get('Data', 'Memory Available')
    out.ram = { usedGb: used, totalGb: used != null && free != null ? used + free : null, load: get('Load', 'Memory') }
  }
  return out
}
