// @vitest-environment node
import { describe, it, expect } from 'vitest'
// @ts-ignore - plain JS modules
import { psuCurve, psuEfficiency, fpsPerWatt, joulesPerFrame, EnergyMeter, systemPower, costOf, normalizePower, buildDerived, PSU_RATINGS } from '../electron/services/overlay/powerModel.js'
// @ts-ignore
import { readLhm, decodeThrottle } from '../electron/services/overlay/lhmModel.js'
// @ts-ignore
import { RangeStat, createCsvParser, FrameWindow } from '../electron/services/overlay/frameStats.js'
// @ts-ignore
import { buildPanel, normalizeSettings } from '../electron/services/overlay/overlayModel.js'
// @ts-ignore
import { METRICS, renderLayout, sampleContext, fromPreset } from '../electron/services/overlay/customModel.js'

describe('power: efficiency and energy per frame', () => {
  it('FPS per watt and joules per frame are reciprocal, and null without both inputs', () => {
    expect(fpsPerWatt(120, 60)).toBe(2)
    expect(joulesPerFrame(60, 120)).toBe(0.5)
    expect(fpsPerWatt(null, 60)).toBeNull()
    expect(fpsPerWatt(120, 0)).toBeNull() // 0 W is "not read", not a free lunch
    expect(joulesPerFrame(60, 0)).toBeNull()
  })
})

describe('power: PSU curve', () => {
  it('hits the 80 Plus certification points and interpolates between them', () => {
    const gold = psuCurve('gold')
    expect(psuEfficiency(0.2, gold)).toBe(87)
    expect(psuEfficiency(0.5, gold)).toBe(90)
    expect(psuEfficiency(1, gold)).toBe(87)
    expect(psuEfficiency(0.35, gold)).toBeCloseTo(88.5, 5)
    expect(psuEfficiency(0.5, psuCurve('titanium'))).toBe(94)
  })
  it('is flat outside the curve and rejects a bad custom curve', () => {
    const gold = psuCurve('gold')
    expect(psuEfficiency(1.4, gold)).toBe(87)
    expect(psuEfficiency(0.001, gold)).toBe(psuEfficiency(0.05, gold))
    expect(psuCurve('custom', [90, 91, 92, 93]).slice(1).map((p: number[]) => p[1])).toEqual([90, 91, 92, 93])
    expect(psuCurve('custom', [10, 91, 92, 93])).toEqual(psuCurve('gold')) // 10 % efficiency is not a curve
    expect(Object.keys(PSU_RATINGS)).toContain('platinum')
  })
  it('higher rating is never less efficient at 50 % load', () => {
    const order = ['white', 'bronze', 'silver', 'gold', 'platinum', 'titanium']
    const e = order.map((r) => psuEfficiency(0.5, psuCurve(r)))
    expect([...e].sort((a, b) => a - b)).toEqual(e)
  })
})

describe('power: DC and wall totals', () => {
  it('adds GPU + CPU + extra, then divides by the efficiency at that load', () => {
    const r = systemPower({ gpuW: 200, cpuW: 100, extraW: 50, psuWatts: 700, rating: 'gold' })
    expect(r.dcW).toBe(350)
    expect(r.loadPct).toBeCloseTo(50, 5)
    expect(r.efficiency).toBe(90)
    expect(r.acW).toBeCloseTo(350 / 0.9, 5)
    expect(r.lossW).toBeCloseTo(350 / 0.9 - 350, 5)
    expect(r.partial).toBe(false)
  })
  it('flags a missing CPU reading instead of treating it as 0 W', () => {
    const r = systemPower({ gpuW: 150, cpuW: null, extraW: 40, psuWatts: 750, rating: 'gold' })
    expect(r.dcW).toBe(190)
    expect(r.partial).toBe(true)
    expect(r.missing).toEqual(['cpu'])
    const none = systemPower({ gpuW: null, cpuW: null, extraW: 40, psuWatts: 750, rating: 'gold' })
    expect(none.dcW).toBeNull()
    expect(none.acW).toBeNull()
  })
})

describe('power: energy over the session', () => {
  it('integrates power with the trapezoid rule and skips long gaps', () => {
    const m = new EnergyMeter()
    m.push(0, { gpuW: 100, cpuW: 50 })
    m.push(1000, { gpuW: 200, cpuW: 50 }) // 150 J GPU, 50 J CPU
    m.push(2000, { gpuW: 200, cpuW: 50 }) // +200, +50
    expect(m.gpuJoules()).toBeCloseTo(350)
    expect(m.cpuJoules()).toBeCloseTo(100)
    m.push(60000, { gpuW: 500, cpuW: 500 }) // a minute-long hole (sleep): not integrated
    expect(m.gpuJoules()).toBeCloseTo(350)
    expect(m.seconds).toBeCloseTo(2)
  })
  it('prefers the NVML counter (and survives a driver reload)', () => {
    const m = new EnergyMeter()
    m.push(0, { gpuW: 100, counterJ: 5000 })
    m.push(1000, { gpuW: 100, counterJ: 5120 })
    expect(m.hasCounter).toBe(true)
    expect(m.gpuJoules()).toBe(120) // the counter, not the 100 J integral
    m.push(2000, { gpuW: 100, counterJ: 3 }) // counter went backwards
    m.push(3000, { gpuW: 100, counterJ: 103 })
    expect(m.gpuJoules()).toBe(100)
    m.reset()
    expect(m.gpuJoules()).toBe(0)
    expect(m.hasCounter).toBe(false)
  })
})

describe('power: cost', () => {
  it('scales a constant draw to hour / day / month / year and kWh', () => {
    const c = costOf(400, 0.9, 24)
    expect(c.kwhHour).toBeCloseTo(0.4)
    expect(c.perHour).toBeCloseTo(0.36)
    expect(c.perDay).toBeCloseTo(8.64)
    expect(c.perMonth).toBeCloseTo(259.2)
    expect(c.perYear).toBeCloseTo(3153.6)
    expect(c.kwhMonth).toBeCloseTo(288)
  })
  it('uses the hours per day the user sets, and gives no money without a tariff', () => {
    expect(costOf(400, 1, 4).perMonth).toBeCloseTo(48)
    expect(costOf(400, null, 4).perHour).toBeNull()
    expect(costOf(400, null, 4).kwhDay).toBeCloseTo(1.6)
    expect(costOf(null, 1)).toBeNull()
  })
  it('settings are clamped and persisted through the overlay settings', () => {
    expect(normalizePower({ psuWatts: 5, psuRating: 'nope', tariff: -1 })).toMatchObject({ psuWatts: 100, psuRating: 'gold', tariff: 0 })
    const s = normalizeSettings({ psuWatts: 850, psuRating: 'platinum', extraWatts: 65, tariff: 1.12, hoursPerDay: 5 })
    expect(s).toMatchObject({ psuWatts: 850, psuRating: 'platinum', extraWatts: 65, tariff: 1.12, hoursPerDay: 5 })
    expect(normalizeSettings({}).psuWatts).toBe(750)
  })
})

describe('power: buildDerived', () => {
  const hw = { gpu: { power: 140 }, cpu: { power: 60 }, nvml: { powerW: 150 } }
  it('combines the sensors, the session and the PSU settings, all marked as estimates', () => {
    const e = new EnergyMeter()
    e.push(0, { gpuW: 150 }); e.push(1000, { gpuW: 150 })
    const d = buildDerived({ frames: { fps: 150 }, session: { frames: 300 }, hw, sensors: {}, settings: { psuWatts: 750, extraWatts: 40, tariff: 1 }, energy: e })
    expect(d.gpuW).toBe(150) // NVML power wins over LHM's
    expect(d.efficiency.fpsPerWatt).toBeCloseTo(1)
    expect(d.efficiency.joulesPerFrame).toBeCloseTo(1)
    expect(d.efficiency.fpsPerWattAvg).toBeCloseTo(2) // 300 frames / 150 J
    expect(d.efficiency.joulesPerFrameAvg).toBeCloseTo(0.5)
    expect(d.energy).toMatchObject({ source: 'integrated' })
    expect(d.energy.gpuKj).toBeCloseTo(0.15)
    expect(d.system.dcW).toBe(250)
    expect(d.system.est).toBe(true)
    expect(d.cost.est).toBe(true)
    expect(d.cost.gpu.perHour).toBeCloseTo(0.15)
    expect(d.cost.cpuGpu.perHour).toBeCloseTo(0.21)
    expect(d.cost.withExtra.perHour).toBeCloseTo(0.25)
  })
  it('leaves CPU+GPU cost and system FPS/W empty when the CPU is not read', () => {
    const d = buildDerived({ frames: { fps: 100 }, session: null, hw: { gpu: { power: 100 }, cpu: { power: null } }, sensors: {}, settings: {}, energy: null })
    expect(d.cost.gpu).not.toBeNull()
    expect(d.cost.cpuGpu).toBeNull()
    expect(d.efficiency.fpsPerWattSystem).toBeNull()
    expect(d.system.partial).toBe(true)
    expect(d.energy.gpuKj).toBeNull()
  })
})

describe('lhm: sensors that used to be dropped, NVML and SMBIOS', () => {
  const sample = {
    type: 'lhm', t: 1, admin: false, pawnio: true,
    hw: [
      { kind: 'Cpu', name: 'AMD Ryzen 7 5700', s: [['Load', 'CPU Total', 20], ['Power', 'Package', 0], ['Clock', 'Cores (Average)', 0], ['Temperature', 'Core (Tctl/Tdie)', 0]] },
      { kind: 'GpuNvidia', name: 'NVIDIA GeForce RTX 5060', s: [
        ['Load', 'GPU Core', 12], ['Load', 'GPU Video Engine', 3], ['Load', 'GPU Bus', 100], ['Load', 'GPU Memory', 47.6], ['SmallData', 'D3D Shared Memory Used', 169.4],
        ['SmallData', 'GPU Memory Free', 4267], ['SmallData', 'GPU Memory Used', 3883], ['Throughput', 'GPU PCIe Rx', 33526780], ['Throughput', 'GPU PCIe Tx', 17238020],
        ['Load', 'D3D 3D', 10.8], ['Load', 'D3D Copy', 0], ['Load', 'D3D Copy', 1.1], ['Load', 'D3D Video Encode', 0], ['Temperature', 'GPU Memory Junction', 52]] }
    ],
    nvml: [{ name: 'NVIDIA GeForce RTX 5060', energyMj: 7891680882, powerMw: 43286, powerLimitMw: 145000, enforcedLimitMw: 145000, pcieGen: 3, pcieWidth: 8, pcieMaxGen: 3, pcieMaxWidth: 8, encoderPct: 0, decoderPct: 0, throttle: 1024 }],
    smbios: { modules: 4, ramMts: 2400, ramRatedMts: 2400, ramType: 'DDR4' }
  }
  const r = readLhm(sample)
  it('reads video engine, bus, VRAM %, shared memory, PCIe throughput and the busiest D3D engine instance', () => {
    expect(r.gpu).toMatchObject({ videoEngineLoad: 3, busLoad: 100, vramPct: 47.6, d3dSharedMb: 169.4, vramFreeMb: 4267, pcieRxBps: 33526780, pcieTxBps: 17238020, memJunction: 52 })
    expect(r.gpu.engines).toMatchObject({ '3D': 10.8, Copy: 1.1, 'Video Encode': 0 })
    expect(r.gpu.hotspot).toBeNull() // this card does not emit one
  })
  it('converts NVML units, keeps absent fields null and decodes the throttle mask', () => {
    expect(r.nvml).toMatchObject({ powerW: 43.286, powerLimitW: 145, pcieGen: 3, pcieWidth: 8, encoderPct: 0, decoderPct: 0, throttle: ['reliability'] })
    expect(r.nvml.energyJ).toBeCloseTo(7891680.882)
    expect(r.nvml.computeMemMb).toBeNull()
    expect(decodeThrottle(0)).toEqual([])
    expect(decodeThrottle(0x4 + 0x40)).toEqual(['swPowerCap', 'hwThermal'])
    expect(readLhm({ hw: [] }).nvml).toBeUndefined()
  })
  it('marks SMBIOS RAM speed as derived and says the CPU needs admin', () => {
    expect(r.ram).toMatchObject({ effectiveMts: 2400, ratedMts: 2400, baseClockMhz: 1200, type: 'DDR4', derived: true })
    expect(r.access).toMatchObject({ admin: false, pawnio: true, cpuNeedsAdmin: true, cpuNeedsPawnio: false })
    expect(r.cpu).toMatchObject({ temp: null, power: null, clock: null })
  })
})

describe('frames: render latency', () => {
  it('parses MsRenderPresentLatency, treating NA as missing', () => {
    const parse = createCsvParser()
    parse('Application,ProcessID,PresentMode,MsBetweenPresents,MsRenderPresentLatency,MsUntilDisplayed,MsAllInputToPhotonLatency')
    expect(parse('game.exe,10,Hardware,6.9,0.5,12,NA')).toMatchObject({ msRenderLatency: 0.5, msLatency: 12 })
    expect(parse('game.exe,10,Hardware,6.9,NA,12,NA').msRenderLatency).toBeNull()
  })
  it('keeps min / max / avg over the whole session and a rolling average in the window', () => {
    const r = new RangeStat()
    for (const x of [1, 3, 2, NaN, -1]) r.push(x)
    expect(r.stats()).toEqual({ min: 1, max: 3, avg: 2, samples: 3 })
    r.reset()
    expect(r.stats()).toBeNull()
    const w = new FrameWindow()
    w.push({ msBetweenPresents: 10, msRenderLatency: 2 }); w.push({ msBetweenPresents: 10, msRenderLatency: 4 })
    expect(w.stats().renderLatencyMs).toBe(3)
  })
})

describe('overlay: power lines and estimates', () => {
  const sensors = { cpu: 30, cores: [10, 20] }
  const hw = {
    gpu: { name: 'g', load: 50, temp: 60, clock: 2000, power: 140, vramPct: 50, busLoad: 20, videoEngineLoad: 2 },
    cpu: { power: 60, temp: 55, clock: 4000 },
    ram: { usedGb: 10, totalGb: 32, load: 30, effectiveMts: 3200, baseClockMhz: 1600 },
    nvml: { powerW: 140, pcieGen: 4, pcieWidth: 16, encoderPct: 1, decoderPct: 0, throttle: ['idle', 'swPowerCap'] },
    access: { cpuNeedsAdmin: false }
  }
  const frames = { fps: 140, frameTimeMs: 7.1, low1: 100, low01: 80, graph: [7] }
  const derived = buildDerived({ frames, session: { frames: 1000 }, hw, sensors, settings: {}, energy: null })
  it('the overclocker layout shows PWR, PSU, cost and the RAM rate, each estimate marked with *', () => {
    const p = buildPanel('oc', frames, null, hw, sensors, null, {}, { derived, renderLatency: { min: 1, avg: 2, max: 3 } })
    const tags = p.lines.map((l: any) => l.tag)
    expect(tags).toEqual(expect.arrayContaining(['PWR', 'PSU*', 'R$*', 'RAM']))
    const units = p.lines.flatMap((l: any) => l.cells.map((c: any) => c.u))
    expect(units).toContain('FPS/W*')
    expect(units).toContain('MT/s*')
    expect(units).toContain('R$/h GPU*')
    expect(units).toContain('% VRAM')
    expect(p.lines.some((l: any) => l.cells.some((c: any) => c.v === 'swPowerCap'))).toBe(true)
  })
  it('says "needs admin" when the CPU sensors are not readable', () => {
    const p = buildPanel('oc', frames, null, { ...hw, cpu: {}, access: { cpuNeedsAdmin: true } }, sensors, null, { needsAdmin: 'precisa de admin' }, { derived })
    expect(p.lines.some((l: any) => l.cells.some((c: any) => c.v === 'precisa de admin'))).toBe(true)
  })
  it('advanced layout and old callers are unchanged', () => {
    const p = buildPanel('advanced', frames, null, hw, sensors, null, {})
    expect(p.lines.map((l: any) => l.tag)).toEqual(['GPU', 'VRAM', 'CPU', 'RAM', 'FPS'])
  })
})

describe('custom layout: power metrics', () => {
  it('estimate metrics render with * and the money prefix; absent ones render as a dash', () => {
    const ctx = sampleContext()
    const layout = { id: 'x', widgets: [{ type: 'metrics', items: [{ metric: 'cost.cpuGpu.hour' }, { metric: 'pwr.fpsPerWatt' }, { metric: 'gpu.pcie' }] }] }
    const html = renderLayout(layout, ctx).html
    expect(html).toContain('R$ ')
    expect(html).toContain('FPS/W*')
    expect(html).toContain('4.0 x16')
    const empty = renderLayout(layout, { ...ctx, derived: null, hw: {} }).html
    expect(empty).not.toContain('FPS/W*')
    expect(Object.keys(METRICS).filter((k) => METRICS[k].group === 'cost')).toHaveLength(18)
    expect(JSON.stringify(fromPreset('overclocker'))).toContain('psu.load')
  })
})
