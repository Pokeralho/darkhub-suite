// @vitest-environment node
import { describe, it, expect } from 'vitest'
// @ts-ignore - plain JS modules
import { readLhm } from '../electron/services/overlay/lhmModel.js'
// @ts-ignore
import { SessionStats } from '../electron/services/overlay/frameStats.js'
// @ts-ignore
import { buildPanel, normalizeSettings } from '../electron/services/overlay/overlayModel.js'

// sensor names as LibreHardwareMonitor reports them on a Ryzen 7 5700 + RTX 5060 (no PawnIO: CPU clock/temp/power = 0)
const sample = {
  type: 'lhm', t: Date.now(),
  hw: [
    { kind: 'Cpu', name: 'AMD Ryzen 7 5700', s: [['Load', 'CPU Core #1', 23.5], ['Load', 'CPU Core #2', 64.7], ['Load', 'CPU Total', 20.1], ['Load', 'CPU Core Max', 64.7], ['Power', 'Package', 0], ['Clock', 'Cores (Average)', 0], ['Temperature', 'Core (Tctl/Tdie)', 0], ['Voltage', 'Core (SVI2 TFN)', 1.55]] },
    { kind: 'Memory', name: 'Virtual Memory', s: [['Data', 'Memory Used', 25.6], ['Data', 'Memory Available', 25.3], ['Load', 'Memory', 50.3]] },
    { kind: 'Memory', name: 'Total Memory', s: [['Data', 'Memory Used', 18.8], ['Data', 'Memory Available', 13.0], ['Load', 'Memory', 59.1]] },
    { kind: 'GpuNvidia', name: 'NVIDIA GeForce RTX 5060', s: [['Temperature', 'GPU Core', 34.5], ['Clock', 'GPU Core', 2610], ['Clock', 'GPU Memory', 14001], ['Fan', 'GPU Fan', 0], ['Control', 'GPU Fan', 0], ['Load', 'GPU Core', 3], ['Load', 'GPU Memory Controller', 1], ['Load', 'GPU Board Power', 22], ['Voltage', 'GPU Core Voltage', 0.985], ['Temperature', 'GPU Memory Junction', 40], ['SmallData', 'GPU Memory Total', 8151], ['SmallData', 'GPU Memory Used', 2231], ['Power', 'GPU Package', 31.3]] }
  ]
}

describe('overlay: LibreHardwareMonitor reader', () => {
  it('reads GPU, RAM and CPU and treats the CPU zeros (no PawnIO) as missing', () => {
    const hw = readLhm(sample)
    expect(hw.gpu).toMatchObject({ load: 3, temp: 34.5, clock: 2610, memClock: 14001, power: 31.3, powerPct: 22, voltage: 0.985, memJunction: 40, vramUsedMb: 2231, vramTotalMb: 8151, fanRpm: 0 })
    expect(hw.ram).toMatchObject({ usedGb: 18.8, load: 59.1 })
    expect(hw.ram.totalGb).toBeCloseTo(31.8)
    expect(hw.cpu).toMatchObject({ load: 20.1, loadMax: 64.7, vcore: 1.55, temp: null, clock: null, power: null, threads: [23.5, 64.7] })
  })
})

describe('overlay: session statistics', () => {
  it('computes lows, deviation, per-second min/max and stutters', () => {
    const s = new SessionStats()
    for (let i = 0; i < 2000; i++) s.push(i % 500 === 499 ? 40 : 10) // 100 FPS with 4 hitches of 40 ms
    const r = s.stats()
    expect(r.frames).toBe(2000)
    expect(r.stutters).toBe(4)
    expect(r.maxFrameMs).toBe(40)
    expect(r.low1).toBeCloseTo(100, 0)
    expect(r.low01).toBeCloseTo(25, 0)
    expect(r.minFps).toBeGreaterThan(90)
    expect(r.maxFps).toBeLessThanOrEqual(100.1)
    expect(r.stdDevMs).toBeGreaterThan(0)
    s.reset()
    expect(s.stats()).toBeNull()
  })
})

describe('overlay: advanced layouts', () => {
  const frames = { fps: 144, frameTimeMs: 6.9, low1: 120, low01: 90, gpuBusyMs: 6.7, presentMode: 'Hardware: Independent Flip', graph: [6.9, 7.1, 6.8] }
  it('keeps old settings working and accepts the new layouts', () => {
    expect(normalizeSettings({}).layout).toBe('compact')
    expect(normalizeSettings({ layout: 'oc' }).layout).toBe('oc')
    expect(normalizeSettings({ layout: 'x' }).layout).toBe('compact')
  })
  it('advanced: one line per component, no stats', () => {
    const p = buildPanel('advanced', frames, null, readLhm(sample), {}, null, {})
    expect(p.lines.map((l: any) => l.tag)).toEqual(['GPU', 'VRAM', 'CPU', 'RAM', 'FPS'])
    expect(p.lines[0].cells.map((c: any) => c.v)).toEqual(['3', '35', '2610', '31'])
    expect(p.lines[2].cells[1].v).toBe('—') // CPU temperature not read
    expect(p.graphs).toHaveLength(1)
    expect(p.stats).toEqual([])
    expect(p.threads).toBeNull()
  })
  it('overclocker: extra lines, graphs, thread loads, session stats and the bottleneck', () => {
    const s = new SessionStats()
    for (let i = 0; i < 300; i++) s.push(6.9)
    const hist = { fps: [140, 144], cpu: [40, 42], gpu: [95, 97], cpuTemp: [70, 71], gpuTemp: [65, 66] }
    const p = buildPanel('oc', frames, s.stats(), readLhm(sample), {}, hist, {})
    expect(p.lines.length).toBeGreaterThan(5)
    expect(p.graphs.map((g: any) => g.title)).toEqual(['Frametime', 'FPS', 'Load %', 'Temp °C'])
    expect(p.threads).toEqual([24, 65])
    expect(Object.fromEntries(p.stats)).toMatchObject({ 'Limited by': 'GPU (GPU 97%)', Frames: '300' })
  })
  it('falls back to the basic sensors without LibreHardwareMonitor', () => {
    const p = buildPanel('advanced', null, null, null, { cpu: 30, cpuTemp: 60, gpu: 50, gpuTemp: 55, vramMb: 2048 }, null, {})
    expect(p.lines[0].cells[0].v).toBe('50')
    expect(p.lines[1].cells[0].v).toBe('2.00')
    expect(p.lines[2].cells[1].v).toBe('60')
  })
  it("prefers Windows' CPU counters over LHM's load (LHM reads 100% on recent Windows 11)", () => {
    const hw = readLhm({ hw: [{ kind: 'Cpu', name: 'x', s: [['Load', 'CPU Total', 100], ['Load', 'CPU Core #1', 100], ['Load', 'CPU Core #2', 100]] }] })
    const p = buildPanel('oc', null, null, hw, { cpu: 16, cores: [30, 5] }, null, {})
    expect(p.lines.find((l: any) => l.tag === 'CPU').cells[0].v).toBe('16')
    expect(p.threads).toEqual([30, 5])
  })
})
