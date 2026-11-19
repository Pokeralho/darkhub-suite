// @vitest-environment node
// Runtime fixes from the technical audit: PowerShell JSON parsing, UTF-8 stream decoding, the LatencyEngine FIFO,
// save-glob safety, Ultra Low Latency undo persistence and OptiScaler's "already installed" check.
import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
// @ts-ignore - plain JS module
import { parseJsonOutput, runCommand } from '../electron/services/PowerShellRunner.js'
// @ts-ignore - plain JS module
import { NativeLatencyClient } from '../electron/services/NativeLatencyClient.js'
// @ts-ignore - plain JS module
import { expandGlob } from '../electron/services/saves/savePaths.js'
// @ts-ignore - plain JS module
import { persistableUndo, parseUndoRecord, writeUndoRecord, readUndoRecord, clearUndoRecord } from '../electron/services/latencyUndoStore.js'
// @ts-ignore - plain JS module
import { isSameInstall } from '../electron/optiscalerManager.js'

describe('parseJsonOutput', () => {
  it('keeps a one-element array after a WARNING line (does not return the inner object)', () => {
    const out = 'WARNING: something happened [x]\r\n[{"a":1}]\r\n'
    expect(parseJsonOutput(out)).toEqual([{ a: 1 }])
  })

  it('finds an object after noise lines and ignores trailing text', () => {
    expect(parseJsonOutput('VERBOSE: hi\n{"b":[1,2]}\nbye')).toEqual({ b: [1, 2] })
  })

  it('still parses clean JSON, BOM included, and returns the fallback for empty output', () => {
    expect(parseJsonOutput('\ufeff[1,2]')).toEqual([1, 2])
    expect(parseJsonOutput('   ', 'none')).toBe('none')
  })

  it('throws when there is no JSON at all', () => {
    expect(() => parseJsonOutput('WARNING: nothing here')).toThrow(/not valid JSON/)
  })
})

describe('runCommand UTF-8 decoding', () => {
  it('does not corrupt a multibyte character split across two chunks', async () => {
    // "ç" = C3 A7, written as two separate chunks
    const script = "process.stdout.write(Buffer.from([0x63,0xc3]));setTimeout(()=>process.stdout.write(Buffer.from([0xa7,0x6f])),80)"
    const r = await runCommand(process.execPath, ['-e', script], { timeoutMs: 10000 })
    expect(r.stdout).toBe('cço')
  })
})

function fakeChild() {
  const child: any = new EventEmitter()
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.killed = false
  child.exitCode = null
  child.kill = vi.fn(() => { child.killed = true; setImmediate(() => child.emit('exit', 1)) })
  child.lines = [] as string[]
  let buf = ''
  child.stdin.on('data', (d: Buffer) => {
    buf += d.toString()
    let i
    while ((i = buf.indexOf('\n')) >= 0) { child.lines.push(buf.slice(0, i)); buf = buf.slice(i + 1) }
  })
  child.reply = (obj: unknown) => child.stdout.write(JSON.stringify(obj) + '\n')
  return child
}

// The native latency engine is a Windows-only binary (NativeLatencyClient.ensureRunning gates on win32).
describe.skipIf(process.platform !== 'win32')('NativeLatencyClient FIFO', () => {
  afterEach(() => { vi.useRealTimers() })

  const makeClient = () => {
    const children: any[] = []
    const client = new NativeLatencyClient({
      exePath: 'C:\\fake\\DarkHub.LatencyEngine.exe',
      existsSync: () => true,
      integrityCheck: () => null,
      spawnImpl: () => { const c = fakeChild(); children.push(c); return c }
    })
    return { client, children }
  }
  const flush = () => new Promise((r) => setImmediate(r))

  it('drops the late reply of a timed-out request instead of handing it to the next caller', async () => {
    const { client, children } = makeClient()
    const first = client.sendCommand({ cmd: 'slow' }, 30)
    await expect(first).rejects.toThrow(/timed out/)
    const second = client.sendCommand({ cmd: 'fast' }, 2000)
    const child = children[0]
    child.reply({ ok: true, data: 'late-reply-of-slow' })
    child.reply({ ok: true, data: 'fast' })
    await expect(second).resolves.toEqual({ ok: true, data: 'fast' })
    expect(children).toHaveLength(1)
  })

  it('restarts a wedged engine (no late reply within the grace) and rejects what it still owes', async () => {
    vi.useFakeTimers()
    const { client, children } = makeClient()
    const first = client.sendCommand({ cmd: 'hang' }, 100)
    const firstErr = first.catch((e: Error) => e)
    vi.advanceTimersByTime(150)
    expect(((await firstErr) as Error).message).toMatch(/timed out/)
    const second = client.sendCommand({ cmd: 'queued' }, 60000)
    const secondErr = second.catch((e: Error) => e)
    vi.advanceTimersByTime(16000)
    expect(children[0].kill).toHaveBeenCalled()
    expect(((await secondErr) as Error).message).toMatch(/stopped answering/)
    expect(client.pendingCallbacks).toHaveLength(0)

    // the next command uses a fresh engine; a stray reply from the old one resolves nothing
    const third = client.sendCommand({ cmd: 'again' }, 60000)
    expect(children).toHaveLength(2)
    children[0].reply({ ok: true, data: 'stale' })
    children[1].reply({ ok: true, data: 'fresh' })
    vi.useRealTimers()
    await flush()
    await expect(third).resolves.toEqual({ ok: true, data: 'fresh' })
  })

  it('rejects only the requests of the process that exited', async () => {
    const { client, children } = makeClient()
    const a = client.sendCommand({ cmd: 'a' }, 5000)
    children[0].emit('exit', 1)
    await expect(a).rejects.toThrow(/exited/)
    const b = client.sendCommand({ cmd: 'b' }, 5000)
    children[1].reply({ ok: true, data: 'b' })
    await expect(b).resolves.toEqual({ ok: true, data: 'b' })
  })
})

describe('expandGlob safety', () => {
  const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dh-glob-'))

  it('does not follow a junction/symlink that loops back to a parent', () => {
    const root = mk()
    try {
      fs.mkdirSync(path.join(root, 'saves', 'slot1'), { recursive: true })
      fs.writeFileSync(path.join(root, 'saves', 'slot1', 'a.sav'), 'x')
      fs.symlinkSync(root, path.join(root, 'saves', 'loop'), 'junction')
      const files = expandGlob(path.join(root, 'saves', '**', '*.sav'))
      expect(files.map((f: string) => path.relative(root, f))).toEqual([path.join('saves', 'slot1', 'a.sav')])
      // the folder walk of a matched directory skips the junction too
      const tree = expandGlob(path.join(root, 'saves'))
      expect(tree.map((f: string) => path.relative(root, f))).toEqual([path.join('saves', 'slot1', 'a.sav')])
    } finally { fs.rmSync(root, { recursive: true, force: true }) }
  })

  it('caps how deep ** descends', () => {
    const root = mk()
    try {
      let dir = root
      for (let i = 0; i < 12; i++) dir = path.join(dir, `d${i}`)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'deep.sav'), 'x')
      fs.writeFileSync(path.join(root, 'd0', 'd1', 'shallow.sav'), 'x')
      const files = expandGlob(path.join(root, '**', '*.sav')).map((f: string) => path.basename(f))
      expect(files).toEqual(['shallow.sav'])
      const deep = expandGlob(path.join(root, '**', '*.sav'), { maxGlobDepth: 20 }).map((f: string) => path.basename(f)).sort()
      expect(deep).toEqual(['deep.sav', 'shallow.sav'])
    } finally { fs.rmSync(root, { recursive: true, force: true }) }
  })
})

describe('latency undo record', () => {
  const nagleKey = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\{0a1b2c3d-1111-2222-3333-444455556666}'
  const undo = {
    powerPlan: { prev: 'Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (Balanced)', verified: true },
    timerResolution: { enabled: true },
    fullscreen: { prev: '' },
    mouseAccel: { prev: { MouseSpeed: '1', MouseThreshold1: '6', MouseThreshold2: '10' } },
    gpuPref: { error: 'denied' },
    qos: { policyName: 'DarkHub-ULLM-0123456789', verified: true },
    nagle: { key: nagleKey, TcpAckFrequency: null, TCPNoDelay: 1, TcpDelAckTicks: '', verified: true },
    dns: { adapter: 'Ethernet', prev: ['192.168.0.1', 'fe80::1%12'], verified: true },
    tcpStack: { optimized: true, rscPrev: 'Disabled' },
    bg: { killed: ['OneDrive'] }
  }

  it('keeps only revertible, applied tweaks in a validated shape', () => {
    const rec = persistableUndo(undo, { exePath: 'C:\\Games\\game.exe' })
    expect(rec.exePath).toBe('C:\\Games\\game.exe')
    expect(Object.keys(rec.undo).sort()).toEqual(['dns', 'fullscreen', 'mouseAccel', 'nagle', 'powerPlan', 'qos', 'tcpStack'])
    expect(rec.undo.powerPlan).toEqual({ prev: '381b4222-f694-41f0-9685-ff5bb260df2e' })
    expect(rec.undo.nagle).toEqual({ key: nagleKey, TcpAckFrequency: null, TCPNoDelay: 1, TcpDelAckTicks: null })
    expect(rec.undo.tcpStack).toEqual({ optimized: true, rscPrev: 'disabled' })
  })

  it('returns null when nothing needs reverting', () => {
    expect(persistableUndo({ timerResolution: { enabled: true }, powerPlan: { error: 'x' } })).toBeNull()
    expect(persistableUndo(null)).toBeNull()
  })

  it('drops tampered values when reading the file back', () => {
    const rec = persistableUndo(undo, { exePath: 'C:\\g.exe' })
    rec.undo.nagle.key = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run'
    rec.undo.qos.policyName = "x'; Remove-Item C:\\ -Recurse; '"
    rec.undo.dns.prev = ['1.1.1.1; calc']
    const parsed = parseUndoRecord(JSON.stringify(rec))
    expect(parsed.undo.nagle).toBeUndefined()
    expect(parsed.undo.qos).toBeUndefined()
    expect(parsed.undo.dns).toBeUndefined()
    expect(parsed.undo.powerPlan).toBeTruthy()
    expect(parseUndoRecord('{"version":99,"undo":{}}')).toBeNull()
    expect(parseUndoRecord('not json')).toBeNull()
  })

  it('round-trips through the file and clears it', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-undo-'))
    const file = path.join(dir, 'latency-undo.json')
    try {
      await writeUndoRecord(file, persistableUndo(undo, { exePath: 'C:\\g.exe' }))
      const back = await readUndoRecord(file)
      expect(back.undo.dns).toEqual({ adapter: 'Ethernet', prev: ['192.168.0.1', 'fe80::1%12'] })
      await clearUndoRecord(file)
      expect(fs.existsSync(file)).toBe(false)
      expect(await readUndoRecord(file)).toBeNull()
      await writeUndoRecord(file, null) // nothing to revert: no file
      expect(fs.existsSync(file)).toBe(false)
    } finally { fs.rmSync(dir, { recursive: true, force: true }) }
  })
})

describe('OptiScaler isSameInstall', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-opti-'))
  fs.writeFileSync(path.join(dir, 'dxgi.dll'), 'x')
  fs.writeFileSync(path.join(dir, 'OptiScaler.ini'), 'x')
  const analysis = (frameGen: string, input = 'upscaler', manifestFg?: string, manifestInput?: string) => ({
    game: { targetDir: dir },
    source: { version: '0.7.9' },
    choices: { loader: 'dxgi.dll', upscaler: 'fsr31', resolvedInputApi: 'dlss', includeAgilitySdk: false },
    frameGen: { mode: frameGen, input },
    manifest: { optiscaler: { sourceVersion: '0.7.9', loader: 'dxgi.dll', upscaler: 'fsr31', inputApi: 'dlss', includeAgilitySdk: false, ...(manifestFg ? { frameGen: manifestFg, fgInput: manifestInput } : {}) } }
  })

  it('skips only when frame generation matches too', () => {
    expect(isSameInstall(analysis('off', 'upscaler', 'off', 'upscaler'), { onlyIfNeeded: true })).toBe(true)
    expect(isSameInstall(analysis('fsrfg', 'upscaler', 'off', 'upscaler'), { onlyIfNeeded: true })).toBe(false)
    expect(isSameInstall(analysis('off', 'upscaler', 'xefg', 'upscaler'), { onlyIfNeeded: true })).toBe(false)
    expect(isSameInstall(analysis('xefg', 'dlssg', 'xefg', 'upscaler'), { onlyIfNeeded: true })).toBe(false)
    expect(isSameInstall(analysis('xefg', 'dlssg', 'xefg', 'dlssg'), { onlyIfNeeded: true })).toBe(true)
  })

  it('reinstalls once over a manifest written before frame generation was recorded', () => {
    expect(isSameInstall(analysis('off'), { onlyIfNeeded: true })).toBe(false)
  })

  it('never skips without onlyIfNeeded', () => {
    expect(isSameInstall(analysis('off', 'upscaler', 'off', 'upscaler'), {})).toBe(false)
  })
})
