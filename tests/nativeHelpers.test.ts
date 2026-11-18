// @vitest-environment node
// Native helper audit fixes that need stubs to exercise:
//  - FrameLimiter x86 helper: async pipe reads so the 10 s timeout works (hanging helper is killed) and a helper
//    flooding stderr can't stall; exit-code mapping. Fake DarkHub.PacerInject.x86.exe built with csc /platform:x86.
//  - HwSensors NVML loader: never a bare LoadLibrary("nvml.dll") (decoy next to the exe and in the CWD is ignored).
//  - HwSensors: stdin EOF ends the loop and exits cleanly (computer.Close()) well before the 15 s hard exit.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'

const CSC = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'
const canRun = process.platform === 'win32' && fs.existsSync(CSC)
const root = path.resolve(__dirname, '..')
const svc = path.join(root, 'electron', 'services')
const hw = path.join(svc, 'hwsensors')
const native = path.join(root, 'tests', 'native')
let dir = ''

const csc = (args: string[]) => execFileSync(CSC, ['-nologo', '/target:exe', ...args], { stdio: 'pipe', windowsHide: true })
const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch { return false } }

beforeAll(() => {
  if (!canRun) return
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-nativehelpers-'))
  csc(['/platform:x86', `/out:${path.join(dir, 'FakeX86Helper.exe')}`, path.join(native, 'FakeX86Helper.cs')])
  csc(['/platform:x64', '/main:FrameLimiterHarness', `/out:${path.join(dir, 'FrameLimiterHarness.exe')}`, path.join(svc, 'DarkHub.FrameLimiter.cs'), path.join(native, 'FrameLimiterHarness.cs')])
  // HwSensors needs LibreHardwareMonitorLib and its dependencies (and binding redirects) next to the exe
  const hwDir = path.join(dir, 'hw')
  fs.mkdirSync(hwDir)
  for (const f of fs.readdirSync(hw)) if (f.endsWith('.dll')) fs.copyFileSync(path.join(hw, f), path.join(hwDir, f))
  const refs = [`/r:${path.join(hwDir, 'LibreHardwareMonitorLib.dll')}`, '/r:System.Management.dll']
  csc(['/platform:x64', '/optimize+', ...refs, `/out:${path.join(hwDir, 'DarkHub.HwSensors.exe')}`, path.join(hw, 'DarkHub.HwSensors.cs')])
  fs.copyFileSync(path.join(hw, 'DarkHub.HwSensors.exe.config'), path.join(hwDir, 'DarkHub.HwSensors.exe.config'))
  csc(['/platform:x64', '/main:NvmlHarness', ...refs, `/out:${path.join(hwDir, 'NvmlHarness.exe')}`, path.join(hw, 'DarkHub.HwSensors.cs'), path.join(native, 'NvmlHarness.cs')])
  fs.copyFileSync(path.join(hw, 'DarkHub.HwSensors.exe.config'), path.join(hwDir, 'NvmlHarness.exe.config'))
}, 180_000)

afterAll(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }) })

function inject(mode: string) {
  const dll = path.join(dir, `${mode}.dll`)
  const out = execFileSync(path.join(dir, 'FrameLimiterHarness.exe'), [path.join(dir, 'FakeX86Helper.exe'), dll], { encoding: 'utf8', windowsHide: true, timeout: 60_000 })
  return { dll, r: JSON.parse(out.trim()) }
}

describe.skipIf(!canRun)('FrameLimiter x86 helper (fake helper)', () => {
  it('success: parses the helper JSON and passes pid / creation time / dll', () => {
    const { r } = inject('ok')
    expect(r).toMatchObject({ ok: true, code: 'ok', arch: 'x86', message: 'module 0x1234 pid 4242 ct 133000000000000000' })
  })

  it('a helper flooding stderr (1 MB, beyond the pipe buffer) does not stall', () => {
    const { r } = inject('flood')
    expect(r).toMatchObject({ ok: true, message: 'flooded x86' })
    expect(r.ms).toBeLessThan(8000)
  })

  it('exit codes: 3 = permanent refusal, 5 = retryable failure', () => {
    expect(inject('refuse').r).toMatchObject({ ok: false, permanent: true, code: 'identity_mismatch', message: 'process changed' })
    expect(inject('transient').r).toMatchObject({ ok: false, permanent: false, code: 'thread_failed' })
  })

  it('a hanging helper times out after ~10 s and is killed', () => {
    const { r, dll } = inject('hang')
    expect(r).toMatchObject({ ok: false, permanent: false, code: 'helper_timeout' })
    expect(r.ms).toBeGreaterThanOrEqual(9500)
    expect(r.ms).toBeLessThan(15000)
    const pid = Number(fs.readFileSync(dll + '.pid', 'utf8'))
    expect(pid).toBeGreaterThan(0)
    expect(alive(pid)).toBe(false)
  }, 40_000)
})

describe.skipIf(!canRun)('HwSensors NVML loader', () => {
  it('ignores a decoy nvml.dll next to the exe and in the working directory', () => {
    const hwDir = path.join(dir, 'hw')
    const cwd = path.join(dir, 'cwd')
    fs.mkdirSync(cwd, { recursive: true })
    // a real, loadable DLL without any NVML export: a bare LoadLibrary("nvml.dll") would pick it and find no nvmlInit
    const decoySrc = 'C:\\Windows\\System32\\version.dll'
    fs.copyFileSync(decoySrc, path.join(hwDir, 'nvml.dll'))
    fs.copyFileSync(decoySrc, path.join(cwd, 'nvml.dll'))
    const r = JSON.parse(execFileSync(path.join(hwDir, 'NvmlHarness.exe'), [], { cwd, encoding: 'utf8', windowsHide: true, timeout: 60_000 }).trim())
    for (const m of r.modules as string[]) expect(m.toLowerCase()).not.toContain(dir.toLowerCase())
    const sys = 'C:\\Windows\\System32\\nvml.dll'
    if (fs.existsSync(sys)) {
      // NVIDIA driver present: the System32 copy is loaded (it may pull its DriverStore twin in); nothing else
      const mods = r.modules.map((m: string) => m.toLowerCase())
      expect(mods).toContain(sys.toLowerCase())
      for (const m of mods) expect(m.startsWith('c:\\windows\\system32\\')).toBe(true)
    } else {
      expect(r.ok).toBe(false)
    }
  })
})

describe.skipIf(!canRun)('HwSensors clean exit', () => {
  it('stdin EOF ends the loop and exits 0 well before the 15 s hard exit', async () => {
    const child = spawn(path.join(dir, 'hw', 'DarkHub.HwSensors.exe'), ['250'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (d) => { out += d })
    let err = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (d) => { err += d })
    const firstLine = await new Promise<string>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('no sensor line in 60 s: ' + err)), 60_000)
      const check = () => { const i = out.indexOf('\n'); if (i >= 0) { clearTimeout(t); child.stdout.off('data', check); resolve(out.slice(0, i)) } }
      child.stdout.on('data', check)
      child.on('exit', (c) => reject(new Error(`exited ${c} before the first line: ${err}`)))
    })
    expect(() => JSON.parse(firstLine)).not.toThrow()
    const t0 = Date.now()
    const exited = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)))
    child.stdin.end()
    const code = await exited
    expect(code).toBe(0)
    expect(Date.now() - t0).toBeLessThan(10_000)
  }, 90_000)
})

