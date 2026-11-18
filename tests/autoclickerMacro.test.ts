// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
// @ts-ignore - plain JS module
import {
  EVENT_TYPES,
  REC_RECORD_BYTES,
  TINYTASK_BASE_SIZE,
  parseRecBuffer,
  serializeRecBuffer,
  inspectTinyTaskExeBuffer,
  compileTinyTaskExe,
  compileWaypointsToEvents
} from '../electron/services/autoclicker/recCodec.js'
// @ts-ignore - plain JS module
import { computeVirtualScreenBounds } from '../electron/services/autoclicker/PointPicker.js'
// @ts-ignore - plain JS module
import { AutoClickerService } from '../electron/services/autoclicker/AutoClickerService.js'

function buildSyntheticTinyTaskStub(): Buffer {
  const buf = Buffer.alloc(TINYTASK_BASE_SIZE, 0)
  buf[0] = 0x4d // 'M'
  buf[1] = 0x5a // 'Z'
  const peOffset = 0x80
  buf.writeUInt32LE(peOffset, 0x3c)
  buf.write('PE\0\0', peOffset, 4, 'ascii')
  // Non-zero PE checksum at PE + 0x58 to verify compileTinyTaskExe zeroes it
  buf.writeUInt32LE(0xdeadbeef, peOffset + 0x58)

  // TinyTask .data anchor layout at offset 17976 (0x4638)
  const anchor = 17976
  buf.write('36352\0', anchor, 6, 'ascii')
  buf.write('@@@@@\0', anchor + 12, 6, 'ascii')
  buf.write('$$$$$\0', anchor + 20, 6, 'ascii')
  return buf
}

describe('macro .rec codec and TinyTask .exe compatibility', () => {
  it('serializes and parses 20-byte .rec events with 3 trailing sentinels', () => {
    const sample = [
      { eventType: EVENT_TYPES.MOUSE_MOVE, param1: 320, param2: 240, timestampMs: 0, hwnd: 0x10010 },
      { eventType: EVENT_TYPES.LBUTTON_DOWN, param1: 320, param2: 240, timestampMs: 45, hwnd: 0x10010 },
      { eventType: EVENT_TYPES.LBUTTON_UP, param1: 320, param2: 240, timestampMs: 95, hwnd: 0x10010 },
      { eventType: EVENT_TYPES.KEY_DOWN, param1: (0x1e << 8) | 0x41, param2: 0x1e, timestampMs: 180, hwnd: 0x10010 },
      { eventType: EVENT_TYPES.KEY_UP, param1: (0x1e << 8) | 0x41, param2: 0x1e, timestampMs: 240, hwnd: 0x10010 }
    ]

    const buf = serializeRecBuffer(sample)
    expect(buf.length).toBe((sample.length + 3) * REC_RECORD_BYTES)
    expect(buf.length % 20).toBe(0)

    const parsed = parseRecBuffer(buf)
    expect(parsed.sourceKind).toBe('rec')
    expect(parsed.events).toEqual(sample)
    expect(parsed.summary).toMatchObject({
      eventCount: 5,
      keyEvents: 2,
      mouseClicks: 2,
      mouseMoves: 1,
      durationMs: 240
    })
  })

  it('detects uncompiled TinyTask stub vs compiled standalone .exe and extracts payload', () => {
    const stub = buildSyntheticTinyTaskStub()
    const info = inspectTinyTaskExeBuffer(stub)
    expect(info.isTinyTask).toBe(true)
    expect(info.isCompiled).toBe(false)
    expect(info.loopsField).toBe('@@@@@')
    expect(info.speedField).toBe('$$$$$')
    expect(() => parseRecBuffer(stub)).toThrow(/programa base/)

    const recBuf = serializeRecBuffer([
      { eventType: EVENT_TYPES.MOUSE_MOVE, param1: 500, param2: 500, timestampMs: 0, hwnd: 0 },
      { eventType: EVENT_TYPES.RBUTTON_DOWN, param1: 500, param2: 500, timestampMs: 120, hwnd: 0 },
      { eventType: EVENT_TYPES.RBUTTON_UP, param1: 500, param2: 500, timestampMs: 190, hwnd: 0 }
    ])

    const compiled = compileTinyTaskExe(stub, recBuf, { speed: 2, loops: 7, continuous: false })
    expect(compiled.length).toBe(TINYTASK_BASE_SIZE + recBuf.length)
    // PE CheckSum at 0x80 + 0x58 must be zeroed
    expect(compiled.readUInt32LE(0x80 + 0x58)).toBe(0)

    const extracted = parseRecBuffer(compiled)
    expect(extracted.sourceKind).toBe('tinytask-exe')
    expect(extracted.summary.eventCount).toBe(3)
    expect(extracted.summary.durationMs).toBe(190)
    expect(extracted.summary.embeddedLoops).toBe(7)
    expect(extracted.summary.embeddedSpeed).toBe(2)
  })

  it('manages macro files, hotkey conflict rules, and native ClickEngine loading in AutoClickerService', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-macro-'))
    const cfgFile = path.join(dir, 'autoclicker.json')
    const engineExe = path.resolve(__dirname, '..', 'electron', 'services', 'DarkHub.ClickEngine.exe')

    const svc = new AutoClickerService({
      configFile: cfgFile,
      enginePath: () => null,
      onChange: () => {}
    })
    svc.load()

    // Hotkey conflict protection (same rule as TinyTask)
    expect(svc.macroSetConfig({ recordHotkey: 'Ctrl+Shift+F6' })).toEqual({ ok: false, error: 'conflict' })
    expect(svc.macroSetConfig({ recordHotkey: 'F8', playHotkey: 'F8' })).toEqual({ ok: false, error: 'conflict' })
    const okCfg = svc.macroSetConfig({ speed: 2, loops: 4, continuous: false, recordHotkey: 'Ctrl+Alt+R', playHotkey: 'Ctrl+Alt+P' })
    expect(okCfg.ok).toBe(true)
    expect(svc.recordHotkey).toBe('Ctrl+Alt+R')
    expect(svc.playHotkey).toBe('Ctrl+Alt+P')

    // Load & save .rec
    const srcRec = path.join(dir, 'input.rec')
    fs.writeFileSync(srcRec, serializeRecBuffer([
      { eventType: EVENT_TYPES.MOUSE_MOVE, param1: 100, param2: 200, timestampMs: 0, hwnd: 1 },
      { eventType: EVENT_TYPES.KEY_DOWN, param1: 0x41, param2: 0x1e, timestampMs: 50, hwnd: 1 },
      { eventType: EVENT_TYPES.KEY_UP, param1: 0x41, param2: 0x1e, timestampMs: 110, hwnd: 1 }
    ]))

    const loadRes = svc.macroLoadFromPath(srcRec)
    expect(loadRes.ok).toBe(true)
    expect(loadRes.macro.eventCount).toBe(3)
    expect(loadRes.macro.durationMs).toBe(110)

    const savedRec = path.join(dir, 'exported.rec')
    const saveRes = svc.macroSaveToPath(savedRec)
    expect(saveRes.ok).toBe(true)
    expect(fs.existsSync(savedRec)).toBe(true)

    // Verify native DarkHub.ClickEngine.exe loads the .rec file via stdin/stdout protocol on Windows
    if (process.platform === 'win32' && fs.existsSync(engineExe)) {
      const b64Path = Buffer.from(savedRec, 'utf8').toString('base64')
      const lines = await new Promise<string[]>((resolve, reject) => {
        const proc = spawn(engineExe, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
        const out: string[] = []
        let buf = ''
        const timer = setTimeout(() => {
          try { proc.kill() } catch {}
          reject(new Error('ClickEngine timed out'))
        }, 4000)

        proc.stdout.on('data', (chunk) => {
          buf += chunk.toString('utf8')
          let idx
          while ((idx = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, idx).trim()
            buf = buf.slice(idx + 1)
            if (line) out.push(line)
            if (out.some((l) => l.includes('"macroEvents":3'))) {
              clearTimeout(timer)
              proc.stdin.write('EXIT\n')
              setTimeout(() => resolve(out), 80)
            }
          }
        })
        proc.on('error', (e) => { clearTimeout(timer); reject(e) })
        proc.stdin.write(`MACRO_LOAD ${b64Path}\nSTATUS\n`)
      })

      const loadedMsg = JSON.parse(lines.find((l) => l.includes('"macro_loaded"'))!)
      expect(loadedMsg).toEqual({ event: 'macro_loaded', eventCount: 3, durationMs: 110 })
      const statusMsg = JSON.parse(lines.find((l) => l.includes('"macroEvents":3'))!)
      expect(statusMsg.macroMode).toBe('idle')
      expect(statusMsg.macroEvents).toBe(3)
    }

    svc.macroClear()
    expect(svc.macroState().eventCount).toBe(0)
  })

  it('compiles manual/picked priority waypoints with realistic interpolated mouse movement and loop closure', () => {
    expect(computeVirtualScreenBounds([
      { bounds: { x: -1920, y: 0, width: 1920, height: 1080 } },
      { bounds: { x: 0, y: 0, width: 2560, height: 1440 } }
    ])).toEqual({ x: -1920, y: 0, width: 4480, height: 1440 })

    const pts = [
      { id: 'p1', label: 'Alvo 1', enabled: true, x: 100, y: 100, button: 'left', moveMs: 160, waitMs: 200 },
      { id: 'p2', label: 'Alvo 2', enabled: true, x: 500, y: 100, button: 'right', moveMs: 160, waitMs: 200 },
      { id: 'p3', label: 'Alvo 3', enabled: true, x: 300, y: 420, button: 'double', moveMs: 160, waitMs: 300 }
    ]

    const events = compileWaypointsToEvents(pts, { humanArc: true, loopClosure: true })
    expect(events.length).toBeGreaterThan(40)

    // Monotonic timestamps
    for (let i = 1; i < events.length; i++) {
      expect(events[i].timestampMs).toBeGreaterThanOrEqual(events[i - 1].timestampMs)
    }

    // Curved Bézier path between (100,100) and (500,100) bends away from y=100 before landing smoothly at (500,100)
    const firstLegMoves = events.filter((e) => e.eventType === EVENT_TYPES.MOUSE_MOVE && e.timestampMs > 0 && e.timestampMs < 390)
    expect(firstLegMoves.some((m) => m.param2 !== 100)).toBe(true)

    // Exact click sequence in priority order (#1 Left -> #2 Right -> #3 Double Left)
    const downEvents = events.filter((e) => e.eventType === EVENT_TYPES.LBUTTON_DOWN || e.eventType === EVENT_TYPES.RBUTTON_DOWN)
    expect(downEvents.map((e) => ({ t: e.eventType, x: e.param1, y: e.param2 }))).toEqual([
      { t: EVENT_TYPES.LBUTTON_DOWN, x: 100, y: 100 },
      { t: EVENT_TYPES.RBUTTON_DOWN, x: 500, y: 100 },
      { t: EVENT_TYPES.LBUTTON_DOWN, x: 300, y: 420 },
      { t: EVENT_TYPES.LBUTTON_DOWN, x: 300, y: 420 }
    ])

    // Loop closure ends right back at Point #1 (100, 100) so Loop 2 starts without jumping
    const lastEv = events[events.length - 1]
    expect(lastEv.eventType).toBe(EVENT_TYPES.MOUSE_MOVE)
    expect({ x: lastEv.param1, y: lastEv.param2 }).toEqual({ x: 100, y: 100 })

    // Persist and reload via AutoClickerService
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-wp-'))
    const cfgFile = path.join(dir, 'autoclicker.json')
    const svc = new AutoClickerService({ configFile: cfgFile, enginePath: () => null, onChange: () => {} })
    svc.load()

    const pickRes = svc.waypointsAddPicked([{ x: 200, y: 250 }, { x: 600, y: 350 }, { x: 900, y: 500 }])
    expect(pickRes.ok).toBe(true)
    expect(pickRes.added).toBe(3)
    expect(pickRes.waypoints.length).toBe(3)
    expect(pickRes.macro.sourceKind).toBe('waypoints')
    expect(pickRes.macro.mouseClicks).toBe(6) // 3 down + 3 up
    expect(pickRes.macro.mouseMoves).toBeGreaterThan(20)

    const reloaded = new AutoClickerService({ configFile: cfgFile, enginePath: () => null, onChange: () => {} })
    reloaded.load()
    expect(reloaded.waypoints.map((w: any) => [w.x, w.y])).toEqual([[200, 250], [600, 350], [900, 500]])
  })
})
