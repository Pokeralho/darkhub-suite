// @vitest-environment node
import { describe, it, expect } from 'vitest'
// @ts-ignore - plain JS module
import { splitCsv, createCsvParser, FrameWindow } from '../electron/services/overlay/frameStats.js'

// header exactly as PresentMon 2.6.0 prints it
const HEADER = 'Application,ProcessID,SwapChainAddress,PresentRuntime,SyncInterval,PresentFlags,AllowsTearing,PresentMode,TimeInMs,MsBetweenSimulationStart,MsBetweenPresents,MsBetweenDisplayChange,MsInPresentAPI,MsRenderPresentLatency,MsUntilDisplayed,CPUStartTimeInMs,MsBetweenAppStart,MsCPUBusy,MsCPUWait,MsGPULatency,MsGPUTime,MsGPUBusy,MsGPUWait,MsAnimationError,AnimationTime,MsFlipDelay,MsAllInputToPhotonLatency,MsClickToPhotonLatency'

describe('frameStats', () => {
  it('splits quoted CSV', () => {
    expect(splitCsv('a,"b,c",3')).toEqual(['a', 'b,c', '3'])
  })

  it('parses PresentMon 2.6 rows', () => {
    const parse = createCsvParser()
    expect(parse(HEADER)).toBeNull()
    const f = parse('game.exe,1234,0x1,DXGI,0,0,1,Hardware: Independent Flip,1000,6.9,6.94,6.94,0.1,8,9,1000,6.9,3.1,3.8,1,5,5.2,1.7,0,0,0,21.5,NA')
    expect(f).toMatchObject({ app: 'game.exe', pid: 1234, presentMode: 'Hardware: Independent Flip', msBetweenPresents: 6.94, msGpuBusy: 5.2, msLatency: 21.5 })
  })

  it('computes fps over the last second and 1% lows', () => {
    const w = new FrameWindow()
    // 990 frames at 10 ms and 10 hitches of 50 ms
    for (let i = 0; i < 990; i++) w.push({ msBetweenPresents: 10 })
    for (let i = 0; i < 10; i++) w.push({ msBetweenPresents: 50 })
    const s = w.stats()
    // last second: 10 x 50 ms = 500 ms + 50 x 10 ms = 500 ms → 60 frames
    expect(Math.round(s.fps)).toBe(60)
    // 99th percentile of 1000 frames is the 990th frame time (10 ms): only 1% are hitches, so the 1% low is 100 fps
    expect(Math.round(s.low1)).toBe(100)
    // 99.9th percentile lands on a 50 ms hitch → 20 fps
    expect(Math.round(s.low01)).toBe(20)
    expect(s.maxFrameTimeMs).toBe(50)
    expect(s.graph.length).toBe(120)
  })

  it('ignores invalid frame times', () => {
    const w = new FrameWindow()
    w.push({ msBetweenPresents: null })
    w.push({ msBetweenPresents: -1 })
    expect(w.stats()).toBeNull()
  })
})
