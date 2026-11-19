// @vitest-environment node
// ClickEngine 1 ms timer period: reference counting across overlapping click / record / playback worker threads and
// Cleanup. DarkHub.ClickEngine.cs is compiled with tests/native/ClickTimerHarness.cs (csc /main:), which swaps the
// winmm calls for counters: no timeBeginPeriod, no SendInput.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const CSC = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'
const canRun = process.platform === 'win32' && fs.existsSync(CSC)
const root = path.resolve(__dirname, '..')
const src = path.join(root, 'electron', 'services', 'DarkHub.ClickEngine.cs')
let dir = ''
let lines: string[] = []

beforeAll(() => {
  if (!canRun) return
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-clicktimer-'))
  const exe = path.join(dir, 'ClickTimerHarness.exe')
  execFileSync(CSC, ['-nologo', '/target:exe', '/platform:x64', '/main:ClickTimerHarness', `/out:${exe}`, src,
    path.join(root, 'tests', 'native', 'ClickTimerHarness.cs')], { stdio: 'pipe', windowsHide: true })
  lines = execFileSync(exe, [], { encoding: 'utf8', windowsHide: true, timeout: 60_000 }).split(/\r?\n/).filter(Boolean)
}, 120_000)

afterAll(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }) })

describe.skipIf(!canRun)('ClickEngine timer period refcount', () => {
  it('harness ran to the end', () => {
    expect(lines.at(-1)).toBe('DONE')
    expect(lines.filter((l) => l.startsWith('PASS ')).length).toBe(6)
  })
  for (const name of [
    'single worker raises and restores once',
    'overlapping click / record / playback workers share one period',
    'worker body throwing still releases',
    '200 short-lived overlapping workers stay balanced',
    'Cleanup force-release while workers run; stale releases are ignored',
    'timeBeginPeriod failure never calls timeEndPeriod',
  ]) {
    it(name, () => {
      const line = lines.find((l) => l.endsWith(' ' + name) || l.includes(' ' + name + ':'))
      expect(line).toBe('PASS ' + name)
    })
  }
})

describe('ClickEngine wiring (source)', () => {
  const s = fs.readFileSync(src, 'utf8')
  it('every worker thread goes through RunWithTimer', () => {
    const starts = s.match(/new Thread\((?!HotkeyListenerLoop)[^)]*\)/g) || []
    expect(starts.length).toBeGreaterThanOrEqual(3)
    for (const t of starts) expect(t).toMatch(/RunWithTimer\(/)
  })
  it('Cleanup force-releases the period and nothing else calls winmm directly', () => {
    const cleanup = s.slice(s.indexOf('private static void Cleanup()'), s.indexOf('public static void SetHotkey'))
    expect(cleanup).toContain('ForceReleaseTimerPeriod()')
    expect((s.match(/timeBeginPeriod\(1\)/g) || []).length).toBe(1)
    expect((s.match(/timeEndPeriod\(1\)/g) || []).length).toBe(1)
  })
})
