// @vitest-environment node
// Provenance per metric (measured / derived / estimated / unavailable + reason) and the per-connector GPU input rails
// (DarkHub.HwSensors "nvrails"): what readLhm() returns, and that no screen or log prints 0 for a value it did not read.
import { describe, it, expect } from 'vitest'
// @ts-ignore - plain JS modules
import { readLhm, metric, provTag, railTone, RAIL_IDS } from '../electron/services/overlay/lhmModel.js'
// @ts-ignore
import { buildPanel, buildRows, normalizeSettings, logRow, LOG_HEADER } from '../electron/services/overlay/overlayModel.js'
// @ts-ignore
import { METRICS, metricValue, renderLayout, sampleContext } from '../electron/services/overlay/customModel.js'

// Ryzen without PawnIO/admin: CPU temperature, clock, power read 0 and SVI2 reads the 1.55 V placeholder
const cpuPlaceholders = { kind: 'Cpu', name: 'AMD Ryzen 7 5700', s: [['Load', 'CPU Total', 20.1], ['Load', 'CPU Core #1', 23.5], ['Power', 'Package', 0], ['Clock', 'Cores (Average)', 0], ['Clock', 'Core #1', 0], ['Temperature', 'Core (Tctl/Tdie)', 0], ['Voltage', 'Core (SVI2 TFN)', 1.55], ['Voltage', 'Core #1 VID', 1.55]] }
const cpuReal = { kind: 'Cpu', name: 'AMD Ryzen 7 5700', s: [['Load', 'CPU Total', 41], ['Power', 'Package', 61.2], ['Clock', 'Cores (Average)', 4450], ['Clock', 'Core #1', 4500], ['Clock', 'Core #2', 4400], ['Temperature', 'Core (Tctl/Tdie)', 68.4], ['Voltage', 'Core (SVI2 TFN)', 1.231]] }
const cpuVidOnly = { kind: 'Cpu', name: 'AMD Ryzen 7 5700', s: [['Load', 'CPU Total', 41], ['Voltage', 'Core (SVI2 TFN)', 1.55], ['Voltage', 'Core #1 VID', 1.2], ['Voltage', 'Core #2 VID', 1.3125]] }
const nvidiaGpu = { kind: 'GpuNvidia', name: 'NVIDIA GeForce RTX 5060', s: [['Temperature', 'GPU Core', 51], ['Clock', 'GPU Core', 2800], ['Load', 'GPU Core', 99], ['Power', 'GPU Package', 112], ['Fan', 'GPU Fan', 0]] }
const amdGpu = { kind: 'GpuAmd', name: 'AMD Radeon RX 7800 XT', s: [['Temperature', 'GPU Core', 0], ['Load', 'GPU Core', 50], ['Power', 'GPU Package', 180]] }
// shape and values as the helper printed them on an RTX 5060 under load (driver 617.42)
const nvrails = [{ name: 'NVIDIA GeForce RTX 5060', state: 'ok', boardW: 118.1, rails: [{ id: 'PCIE', w: 35.47, v: 12.14, a: 2.923 }, { id: '16PIN0', w: 78.67, v: 12.148, a: 6.483 }] }]
const nvml = [{ name: 'NVIDIA GeForce RTX 5060', powerMw: 117874, energyMj: 5000000 }]

describe('provenance', () => {
  it('a 1.55 V SVI2 reading is a sentinel, not a voltage', () => {
    const hw = readLhm({ type: 'lhm', admin: true, pawnio: true, hw: [cpuPlaceholders] })
    expect(hw.cpu.vcore).toBeNull()
    expect(metric(hw, 'cpu.vcore')).toMatchObject({ value: null, prov: 'unavailable', reason: 'sentinel' })
  })

  it('zeros without admin are unavailable (needs_admin), and without PawnIO needs_pawnio', () => {
    const noAdmin = readLhm({ type: 'lhm', admin: false, pawnio: true, hw: [cpuPlaceholders] })
    for (const p of ['cpu.temp', 'cpu.clock', 'cpu.power']) expect(metric(noAdmin, p)).toMatchObject({ value: null, prov: 'unavailable', reason: 'needs_admin' })
    const noDriver = readLhm({ type: 'lhm', admin: true, pawnio: false, hw: [cpuPlaceholders] })
    expect(metric(noDriver, 'cpu.temp').reason).toBe('needs_pawnio')
    // load does not need ring 0: still measured
    expect(metric(noAdmin, 'cpu.load')).toMatchObject({ value: 20.1, prov: 'measured', source: 'lhm' })
  })

  it('real reads are measured, with the source and the sensor name', () => {
    const hw = readLhm({ type: 'lhm', admin: true, pawnio: true, hw: [cpuReal, nvidiaGpu], nvml })
    expect(metric(hw, 'cpu.temp')).toMatchObject({ value: 68.4, prov: 'measured', source: 'lhm', sensor: 'Core (Tctl/Tdie)' })
    expect(metric(hw, 'cpu.vcore')).toMatchObject({ value: 1.231, prov: 'measured', sensor: 'Core (SVI2 TFN)' })
    expect(metric(hw, 'gpu.power')).toMatchObject({ value: 112, prov: 'measured', source: 'lhm' })
    expect(metric(hw, 'nvml.powerW')).toMatchObject({ value: 117.874, prov: 'measured', source: 'nvml' })
    // a stopped fan is a real 0, not a placeholder
    expect(metric(hw, 'gpu.fanRpm')).toMatchObject({ value: 0, prov: 'measured' })
    expect(provTag(hw, 'gpu.temp')).toBe('measured:lhm')
  })

  it('VID-as-Vcore, averages and SMBIOS are derived', () => {
    const hw = readLhm({ type: 'lhm', admin: true, pawnio: true, hw: [cpuVidOnly], smbios: { modules: 2, ramMts: 3200, ramRatedMts: 2133, ramType: 'DDR4' } })
    expect(metric(hw, 'cpu.vcore')).toMatchObject({ value: 1.3125, prov: 'derived', source: 'lhm' })
    expect(metric(hw, 'ram.effectiveMts')).toMatchObject({ value: 3200, prov: 'derived', source: 'smbios' })
    expect(metric(hw, 'ram.baseClockMhz')).toMatchObject({ value: 1600, prov: 'derived' })
    const avgClock = readLhm({ type: 'lhm', hw: [{ kind: 'Cpu', name: 'x', s: [['Clock', 'Core #1', 4000], ['Clock', 'Core #2', 4200]] }] })
    expect(metric(avgClock, 'cpu.clock')).toMatchObject({ value: 4100, prov: 'derived' })
    // derived values keep the * mark on the overlay
    const panel = buildPanel('oc', null, null, hw, { cpu: 10 }, {}, {}, {})
    const cpuLine = panel.lines.find((l: any) => l.tag === 'CPU')
    expect(cpuLine.cells.find((c: any) => c.v === '1.313').u).toBe('V*')
  })

  it('estimated metrics (PSU, cost) are estimated, SMBIOS ones derived; both print *', () => {
    const ctx = sampleContext(0)
    expect(metricValue('psu.ac', ctx).kind).toBe('estimated')
    expect(metricValue('ram.rate', ctx).kind).toBe('derived')
    expect(metricValue('gpu.temp', ctx).kind).toBe('measured')
    const { html } = renderLayout({ widgets: [{ type: 'metrics', items: [{ metric: 'ram.rate' }, { metric: 'psu.ac' }] }] }, ctx)
    expect(html).toContain('MT/s*')
    expect(html).toContain('W*')
  })
})

describe('GPU input rails (nvrails)', () => {
  it('sensed connectors become gpu.rails / gpu.pcieSlot, measured through NVAPI', () => {
    const hw = readLhm({ type: 'lhm', hw: [nvidiaGpu], nvml, nvrails })
    expect(hw.gpu.rails.map((r: any) => r.id)).toEqual(['PCIE', '16PIN0'])
    expect(hw.gpu.pcieSlot).toMatchObject({ id: 'PCIE', w: 35.47, v: 12.14, a: 2.923 })
    expect(hw.gpu.railsW).toBeCloseTo(114.14, 2)
    expect(metric(hw, 'gpu.rails.16PIN0.v')).toMatchObject({ value: 12.148, prov: 'measured', source: 'nvapi' })
    expect(metric(hw, 'gpu.railsW').prov).toBe('derived')
    // a connector the card does not sense has no entry and its metrics are unavailable, never 0
    expect(hw.gpu.rails.find((r: any) => r.id === '8PIN0')).toBeUndefined()
    expect(metric(hw, 'gpu.rails.8PIN0.w')).toMatchObject({ value: null, prov: 'unavailable', reason: 'not_exposed' })
  })

  it('no rails on a non-NVIDIA GPU (non_nvidia), and an unsupported card yields nothing', () => {
    const amd = readLhm({ type: 'lhm', hw: [amdGpu] })
    expect(amd.gpu.rails).toBeNull()
    expect(amd.gpu.railsState).toBe('non_nvidia')
    expect(metric(amd, 'gpu.rails.PCIE.w').reason).toBe('non_nvidia')
    expect(metric(amd, 'nvml.powerW').reason).toBe('non_nvidia')
    const unsupported = readLhm({ type: 'lhm', hw: [nvidiaGpu], nvrails: [{ name: 'NVIDIA GeForce RTX 5060', state: 'disabled', why: 'overrun', rails: [] }] })
    expect(unsupported.gpu.rails).toBeNull()
    expect(unsupported.gpu.railsState).toBe('disabled')
    expect(metric(unsupported, 'gpu.rails.PCIE.v')).toMatchObject({ prov: 'unavailable', reason: 'not_exposed' })
  })

  it('zeros and out-of-range rail values are dropped, never shown', () => {
    const hw = readLhm({ type: 'lhm', hw: [nvidiaGpu], nvrails: [{ name: 'NVIDIA GeForce RTX 5060', state: 'ok', rails: [{ id: 'PCIE', w: 0, v: 0, a: 0 }, { id: '16PIN0', w: 5000, v: 12.1, a: 400 }, { id: 'MISC', w: 3, v: 12, a: 0.2 }] }] })
    expect(hw.gpu.rails).toEqual([{ id: '16PIN0', w: null, v: 12.1, a: null }])
  })

  it('a 12 V rail under 11.4 V warns, under 11.0 V is bad', () => {
    expect(railTone(12.1)).toBe('')
    expect(railTone(11.35)).toBe('warn')
    expect(railTone(10.9)).toBe('bad')
    const hw = readLhm({ type: 'lhm', hw: [nvidiaGpu], nvrails: [{ name: 'NVIDIA GeForce RTX 5060', state: 'ok', rails: [{ id: '16PIN0', w: 70, v: 11.3, a: 6.2 }] }] })
    const line = buildPanel('oc', null, null, hw, {}, {}, {}, {}).lines.find((l: any) => l.tag === 'IN')
    expect(line.cells).toEqual([expect.objectContaining({ v: '70', u: 'W 16p' }), expect.objectContaining({ v: '11.30', u: 'V', t: 'warn' })])
    const { html } = renderLayout({ widgets: [{ type: 'metrics', items: [{ metric: 'rail.16pin0.v' }] }] }, { hw })
    expect(html).toMatch(/class="val warn"/)
  })
})

describe('never a 0 for an unavailable metric', () => {
  // every sensor the helper can send, at 0 / placeholder, without admin
  const zeros = readLhm({
    type: 'lhm', admin: false, pawnio: true,
    hw: [cpuPlaceholders, { kind: 'GpuNvidia', name: 'g', s: [['Temperature', 'GPU Core', 0], ['Clock', 'GPU Core', 0], ['Power', 'GPU Package', 0], ['Voltage', 'GPU Core Voltage', 0], ['Load', 'GPU Board Power', 0]] }],
    nvml: [{ name: 'g', powerMw: 0, enforcedLimitMw: 0 }],
    nvrails: [{ name: 'g', state: 'ok', rails: [{ id: 'PCIE', w: 0, v: 0, a: 0 }] }]
  })
  const winZeros = { cpu: 5, cpuTemp: 0, cpuPower: 0, gpu: 3, gpuTemp: 0, gpuClock: 0, ram: 40, vramMb: 1000 }

  it('buildPanel', () => {
    for (const layout of ['advanced', 'oc']) {
      const panel = buildPanel(layout, null, null, zeros, winZeros, {}, {}, {})
      for (const line of panel.lines) for (const c of line.cells) {
        if (c.r) expect(c.v).toBe('—')
        // only loads (%) may be 0
        if (/^0(\.0+)?$/.test(String(c.v))) expect(c.u).toMatch(/%/)
      }
      const cpu = panel.lines.find((l: any) => l.tag === 'CPU')
      expect(cpu.cells[1]).toMatchObject({ v: '—', r: 'needs_admin' })
      expect(panel.lines.find((l: any) => l.tag === 'IN')).toBeUndefined()
    }
  })

  it('buildRows', () => {
    const settings = normalizeSettings({ metrics: ['cpu', 'cpuTemp', 'cpuPower', 'gpu', 'gpuTemp', 'gpuClock', 'ram'] })
    const rows = buildRows(settings, null, winZeros, { cpuTemp: 'CPU °C', cpuPower: 'CPU W', gpuTemp: 'GPU °C', gpuClock: 'GPU clk' }, zeros)
    const byLabel = Object.fromEntries(rows.map((r: any) => [r.label, r]))
    expect(byLabel['CPU °C']).toMatchObject({ value: '—', title: 'needs_admin' })
    expect(byLabel['CPU W'].value).toBe('—')
    expect(byLabel['GPU °C'].value).toBe('—')
    expect(byLabel['GPU clk'].value).toBe('—')
    expect(byLabel.CPU.value).toBe('5%')
    // no hw at all: still no 0 °C and no "—%"
    const plain = buildRows(settings, null, { cpu: null, cpuTemp: 0 }, { cpuTemp: 'CPU °C' })
    expect(plain.find((r: any) => r.label === 'CPU °C').value).toBe('—')
    expect(plain.find((r: any) => r.label === 'CPU').value).toBe('—')
  })

  it('custom layouts: every catalog metric', () => {
    const ctx = { hw: zeros, sensors: winZeros }
    const keys = Object.keys(METRICS).filter((k) => METRICS[k].p)
    for (const k of keys) {
      const mv = metricValue(k, ctx)
      if (mv.kind === 'unavailable') expect(mv.raw).toBeNull()
      if (METRICS[k].pos) expect(mv.raw === 0).toBe(false)
    }
    const { html } = renderLayout({ widgets: [{ type: 'stats', keys: keys.slice(0, 24) }, { type: 'stats', keys: keys.slice(24, 48) }] }, ctx)
    // unavailable values are a dash with the reason in a tooltip
    expect(html).toMatch(/class="val  na" title="needs DarkHub as administrator">—/)
    expect(html).not.toMatch(/>0<span class="unit">(°C|MHz|W|V)/)
  })

  it('the CSV log carries the provenance and leaves unavailable values empty', () => {
    const cols = LOG_HEADER.split(',')
    expect(cols).toContain('cpu_c_src')
    expect(cols).toContain('rail_16pin0_v')
    const row = logRow(0, { fps: 60, frameTimeMs: 16.7, low1: 50 }, winZeros, zeros).split(',')
    const at = (c: string) => row[cols.indexOf(c)]
    expect(row.length).toBe(cols.length)
    expect(at('cpu_c')).toBe('')
    expect(at('cpu_c_src')).toBe('unavailable:needs_admin')
    expect(at('vcore_src')).toBe('unavailable:sentinel')
    expect(at('rail_pcie_w')).toBe('')
    const real = readLhm({ type: 'lhm', admin: true, pawnio: true, hw: [cpuVidOnly, nvidiaGpu], nvml, nvrails })
    const r2 = logRow(0, null, { cpu: 10, cpuTemp: 55 }, real).split(',')
    const at2 = (c: string) => r2[cols.indexOf(c)]
    expect(at2('cpu_c')).toBe('55.0')
    expect(at2('cpu_c_src')).toBe('measured:system')
    expect(at2('vcore_src')).toBe('derived:lhm')
    expect(at2('gpu_w_src')).toBe('measured:nvml')
    expect(at2('rail_16pin0_v')).toBe('12.148')
    expect(at2('rails_src')).toBe('measured:nvapi')
    expect(RAIL_IDS.length).toBe(6)
  })
})
