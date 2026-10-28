// @vitest-environment node
import { describe, it, expect } from 'vitest'
// @ts-ignore - plain JS module
import { normalizeSettings, pickDisplay } from '../electron/services/overlay/overlayModel.js'
// @ts-ignore - plain JS module
import { normalizeLayout, renderLayout, fromPreset, sampleContext, PRESETS, METRICS, cssValue } from '../electron/services/overlay/customModel.js'

describe('custom overlay layouts', () => {
  it('every template renders every widget with sample data', () => {
    for (const key of Object.keys(PRESETS)) {
      const l = fromPreset(key)
      const r = renderLayout(l, sampleContext())
      expect(r.html).toContain('class="w ')
      expect(r.css).toContain('#box.custom{')
      for (const w of l.widgets) expect(r.html).toContain(`id="w-${w.id}"`)
    }
  })

  it('every metric has a value in the sample and formats with its decimals and unit', () => {
    const ctx = sampleContext()
    for (const [key, m] of Object.entries(METRICS) as [string, any][]) expect(m.get(ctx), key).not.toBeUndefined()
    const r = renderLayout(normalizeLayout({ widgets: [{ type: 'metrics', label: 'GPU', items: [{ metric: 'gpu.voltage' }, { metric: 'gpu.temp', decimals: 1, unit: ' C', prefix: 'T' }] }] }), ctx)
    expect(r.html).toContain('1.000<span class="unit">V</span>')
    expect(r.html).toContain('<span class="pre">T</span>67.0<span class="unit"> C</span>')
  })

  it('colors values by threshold, including lower-is-worse metrics', () => {
    const ctx = sampleContext()
    const hot = renderLayout(normalizeLayout({ widgets: [{ type: 'metrics', items: [{ metric: 'gpu.temp', warn: 60, bad: 65 }] }] }), ctx)
    expect(hot.html).toContain('class="val bad"')
    const fps = renderLayout(normalizeLayout({ widgets: [{ type: 'metrics', items: [{ metric: 'fps', warn: 160, bad: 100 }] }] }), ctx) // 144 FPS: under the warning
    expect(fps.html).toContain('class="val warn"')
  })

  it('missing data shows a dash, not 0', () => {
    const r = renderLayout(normalizeLayout({ widgets: [{ type: 'metrics', items: [{ metric: 'cpu.temp' }] }] }), { hw: { cpu: {} }, sensors: {} })
    expect(r.html).toContain('>—</span>')
  })

  it('imported layouts cannot inject markup or break out of CSS rules', () => {
    const evil = normalizeLayout({
      id: '"><x', name: '<b>x</b>',
      theme: { fontFamily: 'a;}</style><script>alert(1)</script>', color: 'red;background:url(http://x)' },
      widgets: [
        { type: 'text', text: '<img src=x onerror=alert(1)>' },
        { type: 'metrics', label: '"><svg onload=1>', labelColor: 'javascript:alert(1)', items: [{ metric: 'nope' }] },
        { type: 'script' },
        { type: 'value', metric: 'fps', style: { color: 'red;} #box{display:none', background: 'url(http://evil)' } }
      ]
    })
    expect(evil.id).not.toContain('"')
    expect(evil.widgets.map((w: any) => w.type)).toEqual(['text', 'metrics', 'value'])
    expect(evil.widgets[1].items[0].metric).toBe('fps')
    expect(evil.theme.color).toBe('#fafafa')
    const r = renderLayout(evil, sampleContext())
    expect(r.html).not.toMatch(/<img|<svg|<script/)
    expect(r.css).not.toContain('</style')
    expect(r.css).not.toMatch(/red;\}|\} #box\{display:none/)
    expect(cssValue('1px;} body{x')).toBe('1px bodyx')
  })

  it('normalizes positions, limits and keeps the user CSS', () => {
    const l = normalizeLayout({ anchor: 'zz', scale: 99, offsetX: 99999, widgets: Array.from({ length: 80 }, () => ({ type: 'separator' })), css: '#box.custom{border:1px solid red}' })
    expect(l.anchor).toBe('tl')
    expect(l.scale).toBe(4)
    expect(l.offsetX).toBe(4000)
    expect(l.widgets).toHaveLength(60)
    expect(renderLayout(l, sampleContext()).css).toContain('#box.custom{border:1px solid red}')
  })

  it('graphs and bars go out as canvas data', () => {
    const r = renderLayout(fromPreset('overclocker'), sampleContext())
    const kinds = r.canvases.map((c: any) => c.kind)
    expect(kinds).toEqual(['graph', 'graph', 'bars'])
    expect(r.canvases[0].series[0].values.length).toBe(120)
    expect(r.canvases[2].values).toHaveLength(16)
  })
})


describe('overlay placement', () => {
  const displays = [{ id: 1 }, { id: 2 }, { id: 3 }]
  it('follows the game, falls back to the mouse and then the primary display', () => {
    expect(pickDisplay('game', displays, { gameId: 2, cursorId: 3, primaryId: 1 })?.id).toBe(2)
    expect(pickDisplay('game', displays, { gameId: null, cursorId: 3, primaryId: 1 })?.id).toBe(3)
    expect(pickDisplay('game', displays, { primaryId: 1 })?.id).toBe(1)
  })
  it('uses a fixed display while it is connected', () => {
    expect(pickDisplay('3', displays, { gameId: 2, primaryId: 1 })?.id).toBe(3)
    expect(pickDisplay('9', displays, { gameId: 2, primaryId: 1 })?.id).toBe(2)
    expect(pickDisplay('primary', displays, { gameId: 2, primaryId: 1 })?.id).toBe(1)
  })
  it('keeps the new positions, offsets and monitor choice', () => {
    const s = normalizeSettings({ position: 'bc', offsetX: 12.4, offsetY: -99999, monitor: '2779098405' })
    expect(s.position).toBe('bc')
    expect(s.offsetX).toBe(12)
    expect(s.offsetY).toBe(-4000)
    expect(s.monitor).toBe('2779098405')
    expect(normalizeSettings({ position: 'zz', monitor: 'evil' })).toMatchObject({ position: 'tl', monitor: 'game' })
  })
})
