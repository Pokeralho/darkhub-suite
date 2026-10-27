// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
// @ts-ignore - plain JS modules
import { validatePackage, computeRisk, conditionMismatch, hardwareFromRaw, resolvePackage, toChangeSet, presetFromState } from '../electron/services/hub/hubModel.js'
// @ts-ignore
import engine from '../electron/services/optimizer/DeepTweaksEngine.js'
// @ts-ignore
import optimizer from '../electron/services/optimizer/SystemOptimizerService.js'
// @ts-ignore
import { buildBuiltins } from '../electron/services/hub/builtins.js'
// @ts-ignore
import { builtinMarkdown, builtinJsonText } from '../scripts/hub-docs.mjs'

const builtins = buildBuiltins(engine, optimizer)
const base = (items: any[], extra: any = {}) => ({ schemaVersion: 1, type: 'module', id: 'ana.test-pack', version: '1.0.0', name: 'Test', author: { github: 'ana' }, items, ...extra })
const reg = (path: string, name = 'X', value: any = 1, type = 'dword') => ({ registry: { path, name, type, value } })
const v = (items: any[], extra?: any) => validatePackage(base(items, extra), builtins)

describe('hub: examples and docs', () => {
  const dir = path.join(process.cwd(), 'docs', 'hub', 'examples')
  it('every example package is valid', () => {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.darkhub.json'))
    expect(files.length).toBeGreaterThanOrEqual(3)
    for (const f of files) {
      const r = validatePackage(fs.readFileSync(path.join(dir, f), 'utf8'), builtins)
      expect(r.errors, f).toEqual([])
      expect(r.pkg.id + '.darkhub.json').toBe(f)
    }
  })
  it('docs/hub/BUILTIN.md is up to date (npm run hub:docs)', () => {
    expect(fs.readFileSync(path.join(process.cwd(), 'docs', 'hub', 'BUILTIN.md'), 'utf8')).toBe(builtinMarkdown())
    expect(fs.readFileSync(path.join(process.cwd(), 'docs', 'hub', 'builtins.json'), 'utf8')).toBe(builtinJsonText())
  })
})

describe('hub: schema', () => {
  it('rejects malformed packages with readable errors', () => {
    expect(validatePackage('{nope', builtins).errors[0].message).toMatch(/JSON inválido/)
    expect(v([reg('HKCU\\Software\\X')], { id: 'Ana.Bad Id' }).ok).toBe(false)
    const extra = v([reg('HKCU\\Software\\X')], { script: 'calc.exe' })
    expect(extra.errors.some((e: any) => /campo não permitido: "script"/.test(e.message))).toBe(true)
    expect(v([{ registry: { path: 'HKCR\\x', name: 'a', type: 'dword', value: 1 } }]).ok).toBe(false)
    expect(v([{ registry: { path: 'HKCU\\Software\\X', name: 'a', delete: true, value: 1 } }]).ok).toBe(false)
    expect(v([{ registry: { path: 'HKCU\\Software\\X\\', name: 'a', type: 'dword', value: 1 } }]).ok).toBe(false)
    expect(v([{ use: 'darkhub:tweak:doesNotExist' }]).errors[0].message).toMatch(/desconhecido/)
    expect(v([{ service: { name: 'SysMain', startType: 'off' } }]).ok).toBe(false)
    expect(v([]).ok).toBe(false)
  })
  it('checks value types against the registry type', () => {
    expect(v([reg('HKCU\\Software\\X', 'a', 'text', 'dword')]).ok).toBe(false)
    expect(v([reg('HKCU\\Software\\X', 'a', 4294967296, 'dword')]).ok).toBe(false)
    expect(v([reg('HKCU\\Software\\X', 'a', 'zz', 'binary')]).ok).toBe(false)
    expect(v([reg('HKCU\\Software\\X', 'a', ['a', 'b'], 'multiString')]).ok).toBe(true)
  })
})

describe('hub: security rules', () => {
  const refused = (items: any[]) => { const r = v(items); expect(r.ok).toBe(false); return r.errors[0].message }
  it('refuses security, persistence and code-loading areas', () => {
    expect(refused([reg('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows Defender', 'DisableAntiSpyware')])).toMatch(/Defender/)
    expect(refused([reg('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows Defender\\Real-Time Protection', 'DisableRealtimeMonitoring')])).toMatch(/Defender/)
    expect(refused([reg('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', 'evil', 'c:\\x.exe', 'string')])).toMatch(/iniciam/)
    expect(refused([reg('HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\sethc.exe', 'Debugger', 'cmd.exe', 'string')])).toMatch(/IFEO/)
    expect(refused([reg('HKLM\\SYSTEM\\CurrentControlSet\\Services\\WinDefend', 'Start', 4)])).toMatch(/service/)
    expect(refused([reg('HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System', 'EnableLUA', 0)])).toMatch(/UAC/)
    expect(refused([reg('HKCU\\Software\\Classes\\exefile\\shell\\open\\command', '', 'x', 'string')])).toMatch(/associações/)
    expect(refused([reg('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\KnownDLLs', 'x', 'y', 'string')])).toMatch(/DLL/)
    expect(refused([reg('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager', 'BootExecute', ['x'], 'multiString')])).toMatch(/boot/)
    expect(refused([reg('HKCU\\Software\\Microsoft\\Edge', 'SmartScreenEnabled', 0)])).toMatch(/SmartScreen/)
    expect(refused([{ service: { name: 'WinDefend', startType: 'disabled' } }])).toMatch(/essencial ou de segurança/)
    expect(refused([{ service: { name: 'wuauserv', startType: 'disabled' } }])).toMatch(/essencial/)
    expect(refused([{ task: { path: '\\Microsoft\\Windows\\Windows Defender\\', name: 'Windows Defender Scheduled Scan', state: 'disabled' } }])).toMatch(/segurança/)
    expect(refused([{ use: 'darkhub:tweak:disableVBS' }])).toMatch(/oficiais/)
  })
  it('checks operations: unknown, never in packages, official only', () => {
    expect(refused([{ op: 'darkhub:op:doesNotExist' }])).toMatch(/desconhecida/)
    expect(refused([{ op: 'darkhub:op:powerPlanBalanced' }])).toMatch(/sem ter como desfazer/)
    expect(refused([{ op: 'darkhub:op:disableCoreIsolation' }])).toMatch(/oficiais/)
    expect(refused([{ op: 'darkhub:op:deepCleanOneDrive' }])).toMatch(/oficiais/)
    expect(v([{ use: 'darkhub:op:timerTuning' }]).ok).toBe(false)
    expect(v([{ op: 'darkhub:op:timerTuning' }, { op: 'darkhub:op:flushDns' }]).ok).toBe(true)
    // official packages (signed by the Hub) may touch security, never the 'no' operations
    const official = (items: any[]) => validatePackage(base(items), builtins, { official: true })
    expect(official([{ op: 'darkhub:op:disableCoreIsolation' }, { use: 'darkhub:tweak:disableVBS' }]).ok).toBe(true)
    expect(official([{ op: 'darkhub:op:powerPlanRestore' }]).ok).toBe(false)
  })
  it('keeps legit tuning areas allowed', () => {
    expect(v([reg('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management', 'DisablePagingExecutive', 1)]).ok).toBe(true)
    expect(v([reg('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel', 'GlobalTimerResolutionRequests', 1)]).ok).toBe(true)
    expect(v([{ service: { name: 'SysMain', startType: 'disabled' } }]).ok).toBe(true)
    expect(v([{ task: { path: '\\Microsoft\\Windows\\Application Experience\\', name: 'ProgramDataUpdater', state: 'disabled' } }]).ok).toBe(true)
  })
})

describe('hub: risk and conditions', () => {
  it('computes risk from what the package touches', () => {
    expect(computeRisk(base([reg('HKCU\\Software\\X')]), builtins)).toBe('low')
    expect(computeRisk(base([reg('HKLM\\SOFTWARE\\X')]), builtins)).toBe('medium')
    expect(computeRisk(base([{ registry: { path: 'HKCU\\Software\\X', deleteKey: true } }]), builtins)).toBe('high')
    const five = ['A1', 'B2', 'C3', 'D4', 'E5'].map((n) => ({ service: { name: n, startType: 'disabled' } }))
    expect(computeRisk(base(five), builtins)).toBe('high')
    expect(computeRisk(base([{ op: 'darkhub:op:msiMode' }]), builtins)).toBe('high')
    expect(computeRisk(base([{ op: 'darkhub:op:flushDns' }]), builtins)).toBe('low')
  })
  it('matches hardware conditions (AND of keys, lists = any, ranges)', () => {
    const hw = { osBuild: 26100, cpuVendor: 'amd', gpuVendors: ['amd', 'nvidia'], gpuDedicated: true, chassis: 'desktop', ramGb: 32, netWired: true, darkos: false }
    expect(conditionMismatch({ 'gpu.vendor': 'nvidia', 'ram.gb': { gte: 16 } }, hw)).toBeNull()
    expect(conditionMismatch({ 'os.build': { gte: 22631, lt: 26200 } }, hw)).toBeNull()
    expect(conditionMismatch({ chassis: 'laptop' }, hw)).toMatch(/chassis/)
    expect(conditionMismatch({ 'cpu.vendor': ['intel'] }, hw)).toMatch(/cpu.vendor/)
    expect(conditionMismatch({ 'ram.gb': { gte: 64 } }, { ...hw, ramGb: null })).toMatch(/ram.gb/)
  })
  it('reads hardware facts from the CIM query', () => {
    const laptop = hardwareFromRaw({ cpu: 'GenuineIntel', gpus: ['Intel(R) UHD Graphics', 'NVIDIA GeForce RTX 4060 Laptop GPU'], chassis: [10], battery: 1, ram: 17179869184, build: '26100', wired: false })
    expect(laptop).toMatchObject({ cpuVendor: 'intel', gpuVendors: ['intel', 'nvidia'], gpuDedicated: true, chassis: 'laptop', ramGb: 16, osBuild: 26100, netWired: false })
    const desktop = hardwareFromRaw({ cpu: 'AuthenticAMD', gpus: 'AMD Radeon(TM) Graphics', chassis: [3], battery: 0, ram: 34359738368, build: 26300, wired: true }, true)
    expect(desktop).toMatchObject({ cpuVendor: 'amd', gpuVendors: ['amd'], gpuDedicated: false, chassis: 'desktop', ramGb: 32, darkos: true })
    expect(hardwareFromRaw({ chassis: [], battery: 2 }).chassis).toBe('laptop')
  })
})

describe('hub: resolving into engine changes', () => {
  it('skips items by condition and maps services, multi-strings and deletes', () => {
    const pkg = base([
      { use: 'darkhub:tweak:disableGameDvr' },
      { service: { name: 'SysMain', startType: 'automaticDelayed', stop: true }, if: { chassis: 'desktop' } },
      { service: { name: 'DiagTrack', startType: 'disabled', stop: true } },
      { registry: { path: 'HKCU\\Software\\X', name: 'M', type: 'multiString', value: ['a', 'b'] } },
      { registry: { path: 'HKCU\\Software\\X', name: 'Old', delete: true } }
    ])
    const r = resolvePackage(pkg, { chassis: 'laptop' })
    expect(r.skipped.map((s: any) => s.index)).toEqual([1])
    const { changes, stopServices } = toChangeSet(r.steps)
    expect(changes).toEqual([
      { key: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\DiagTrack', name: 'Start', type: 'REG_DWORD', data: '4' },
      { key: 'HKCU\\Software\\X', name: 'M', type: 'REG_MULTI_SZ', data: 'a|b' },
      { key: 'HKCU\\Software\\X', name: 'Old', deleteValue: true }
    ])
    expect(stopServices).toEqual(['DiagTrack'])
    const desk = toChangeSet(resolvePackage(pkg, { chassis: 'desktop' }).steps).changes
    expect(desk.filter((c: any) => /SysMain/.test(c.key))).toEqual([
      { key: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\SysMain', name: 'Start', type: 'REG_DWORD', data: '2' },
      { key: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\SysMain', name: 'DelayedAutostart', type: 'REG_DWORD', data: '1' }
    ])
  })
  it('expands operations that only wrap tweaks into those tweaks', () => {
    const r = resolvePackage(base([{ op: 'darkhub:op:explorerTweaks' }, { op: 'darkhub:op:timerTuning' }]), {}, builtins)
    expect(r.steps.map((s: any) => [s.kind, s.id, s.via])).toEqual([
      ['tweak', 'tweak:explorerOpenThisPC', 'op:explorerTweaks'], ['tweak', 'tweak:showFileExtensions', 'op:explorerTweaks'],
      ['tweak', 'tweak:showHiddenFiles', 'op:explorerTweaks'], ['tweak', 'tweak:explorerCompactMode', 'op:explorerTweaks'],
      ['op', 'op:timerTuning', undefined]
    ])
  })
  it('exports a valid preset from the active tweaks and operations, leaving security ones out', () => {
    const pkg = presetFromState({ id: 'ana.meu-pc', name: 'Meu PC', github: 'ana', activeIds: ['tweak:disableGameDvr', 'tweak:disableVBS', 'tweak:showFileExtensions'], activeOps: ['op:timerTuning', 'op:disableCoreIsolation'], builtins, appVersion: '0.7.3' })
    expect(pkg.items).toEqual([{ use: 'darkhub:tweak:disableGameDvr' }, { use: 'darkhub:tweak:showFileExtensions' }, { op: 'darkhub:op:timerTuning' }])
    expect(validatePackage(JSON.stringify(pkg), builtins).ok).toBe(true)
  })
})

// ------------------------------------------------------------------ install / uninstall orchestration

const elevated: string[] = []
vi.mock('../electron/services/optimizer/ElevationHelper.js', () => ({ default: { runMarked: async (s: string) => { elevated.push(s); return { ok: true, out: '', error: '' } }, isElevated: async () => true } }))
let taskState: any[] = []
vi.mock('../electron/services/PowerShellRunner.js', () => ({
  runPowerShellJson: async (script: string) => (script.includes('Get-ScheduledTask') ? { data: taskState } : { data: { cpu: 'AuthenticAMD', gpus: ['NVIDIA GeForce RTX 5060'], chassis: [3], battery: 0, ram: 34359738368, build: 26300, wired: true } })
}))
// @ts-ignore
const { HubService, taskApplyScript, psTaskList } = await import('../electron/services/hub/HubService.js')

function fakeTweaks(active: Record<string, boolean> = {}, failApply = false) {
  const calls: any[] = []
  return {
    calls,
    listTweaks: () => engine.listTweaks(),
    checkTweaksStatus: async () => ({ ok: true, status: { ...active } }),
    readEntries: async () => new Map(),
    applyTweaks: async (ids: string[]) => { calls.push(['applyTweaks', ids]); return { ok: true } },
    undoTweaks: async (ids: string[]) => { calls.push(['undoTweaks', ids]); return { ok: true } },
    applyChangeSet: async (cs: any) => { calls.push(['applyChangeSet', cs.id, cs.changes.length, cs.commands?.apply || '']); return { ok: !failApply, error: failApply ? 'policy' : undefined } },
    restoreChangeSet: async (cs: any) => { calls.push(['restoreChangeSet', cs.id]); return { ok: true } }
  }
}

/** Optimizer with a few operations that record what ran. */
function fakeOptimizer(active: Record<string, boolean> = {}, failing = '') {
  const calls: string[] = []
  const op = (id: string, reversible: boolean, extra: any = {}) => [`optimizer:${id}`, {
    id: `optimizer:${id}`, name: id, description: '', category: 'performance', risk: 'moderate', isReversible: reversible,
    execute: async () => { calls.push(`run:${id}`); return id === failing ? { status: 'Error', error: 'boom' } : { status: 'Success' } },
    ...(reversible ? { revert: async () => { calls.push(`revert:${id}`); return { status: 'Success' } } } : {}),
    ...extra
  }]
  return {
    calls,
    operations: new Map<string, any>([
      op('timerTuning', true), op('networkExtreme', true), op('powerPlanUltimate', true), op('flushDns', false),
      op('disableGameBar', true, { tweakIds: ['tweak:disableGameDvr'] })
    ]),
    checkOperationsStatus: async () => ({ ok: true, status: Object.fromEntries(Object.entries(active).map(([k, on]) => [`optimizer:${k}`, on])) })
  }
}

describe('hub: install and uninstall', () => {
  let dir: string
  const app = () => ({ getPath: () => dir, getVersion: () => '0.7.3' })
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-hub-')); elevated.length = 0; taskState = [] })

  const pkg = (id = 'ana.full', items?: any[]) => JSON.stringify(base(items || [
    { use: 'darkhub:tweak:disableGameDvr' },
    { use: 'darkhub:tweak:showFileExtensions' },
    reg('HKCU\\Software\\DarkHubTest', 'A', 5),
    { service: { name: 'SysMain', startType: 'disabled', stop: true } },
    { task: { path: '\\Microsoft\\Windows\\Application Experience\\', name: 'ProgramDataUpdater', state: 'disabled' } },
    { task: { path: '\\Microsoft\\Windows\\Nope\\', name: 'Missing', state: 'disabled' } }
  ], { id }))

  it('applies only tweaks not already on, one change set, tasks with their previous state; removal reverses it', async () => {
    taskState = [{ path: '\\Microsoft\\Windows\\Application Experience\\', name: 'ProgramDataUpdater', exists: true, state: 'Ready' }, { path: '\\Microsoft\\Windows\\Nope\\', name: 'Missing', exists: false, state: '' }]
    const tweaks = fakeTweaks({ 'tweak:showFileExtensions': true })
    const svc = new HubService({ app: app(), tweaks, darkosRoot: dir })
    const r = await svc.install(pkg())
    expect(r).toMatchObject({ ok: true, applied: 6, missingTasks: ['\\Microsoft\\Windows\\Nope\\Missing'] })
    expect(tweaks.calls[0]).toEqual(['applyTweaks', ['tweak:disableGameDvr']])
    expect(tweaks.calls[1][0]).toBe('applyChangeSet')
    expect(tweaks.calls[1][1]).toBe('hub:ana.full')
    expect(tweaks.calls[1][2]).toBe(2)
    expect(tweaks.calls[1][3]).toMatch(/Stop-Service -Name 'SysMain'/)
    expect(elevated[0]).toMatch(/ProgramDataUpdater/)
    expect(elevated[0]).not.toMatch(/Missing/)
    expect(svc.list().packages.map((p: any) => p.id)).toEqual(['ana.full'])

    // a second package writing the same value is refused
    expect((await svc.install(pkg('ana.other', [reg('HKCU\\Software\\DarkHubTest', 'A', 9)]))).error).toMatch(/Conflito/)
    expect((await svc.install(pkg())).error).toMatch(/já está instalado/)

    const u = await svc.uninstall('ana.full')
    expect(u.ok).toBe(true)
    expect(elevated[1]).toMatch(/\$true/) // the task goes back to enabled
    expect(tweaks.calls.slice(-2)).toEqual([['restoreChangeSet', 'hub:ana.full'], ['undoTweaks', ['tweak:disableGameDvr']]])
    expect(svc.list().packages).toEqual([])
  })

  it('rolls back the tweaks it turned on when the registry part fails', async () => {
    const tweaks = fakeTweaks({}, true)
    const svc = new HubService({ app: app(), tweaks, darkosRoot: dir })
    const r = await svc.install(pkg('ana.fail', [{ use: 'darkhub:tweak:disableGameDvr' }, reg('HKCU\\Software\\DarkHubTest', 'A', 5)]))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/policy/)
    expect(tweaks.calls.at(-1)).toEqual(['undoTweaks', ['tweak:disableGameDvr']])
    expect(svc.list().packages).toEqual([])
  })

  it('runs operations: skips the ones already on, one-time actions just run, removal reverts in reverse', async () => {
    const tweaks = fakeTweaks()
    const opt = fakeOptimizer({ powerPlanUltimate: true })
    const svc = new HubService({ app: app(), tweaks, optimizer: opt, darkosRoot: dir })
    const items = ['timerTuning', 'powerPlanUltimate', 'flushDns', 'networkExtreme', 'disableGameBar'].map((o) => ({ op: `darkhub:op:${o}` }))
    const r = await svc.install(pkg('ana.ops', items))
    expect(r.ok).toBe(true)
    expect(opt.calls).toEqual(['run:timerTuning', 'run:flushDns', 'run:networkExtreme'])
    expect(tweaks.calls[0]).toEqual(['applyTweaks', ['tweak:disableGameDvr']]) // the wrapper op became its tweak
    // another package running the same reversible operation would undo this one on removal
    expect((await svc.install(pkg('ana.ops2', [{ op: 'darkhub:op:networkExtreme' }]))).error).toMatch(/Conflito/)
    expect((await svc.uninstall('ana.ops')).ok).toBe(true)
    expect(opt.calls.slice(3)).toEqual(['revert:networkExtreme', 'revert:timerTuning'])
    expect(tweaks.calls.at(-1)).toEqual(['undoTweaks', ['tweak:disableGameDvr']])
  })

  it('rolls back the operations already run when a later one fails', async () => {
    const opt = fakeOptimizer({}, 'networkExtreme')
    const svc = new HubService({ app: app(), tweaks: fakeTweaks(), optimizer: opt, darkosRoot: dir })
    const r = await svc.install(pkg('ana.opfail', [{ op: 'darkhub:op:timerTuning' }, { op: 'darkhub:op:networkExtreme' }]))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/boom/)
    expect(opt.calls).toEqual(['run:timerTuning', 'run:networkExtreme', 'revert:timerTuning'])
    expect(svc.list().packages).toEqual([])
  })

  it('refuses packages not meant for this PC and invalid packages', async () => {
    const svc = new HubService({ app: app(), tweaks: fakeTweaks(), darkosRoot: dir })
    expect((await svc.install(JSON.stringify(base([reg('HKCU\\Software\\X')], { id: 'ana.lap', when: { chassis: 'laptop' } })))).error).toMatch(/não é para este PC/)
    expect((await svc.install(JSON.stringify(base([{ service: { name: 'WinDefend', startType: 'disabled' } }], { id: 'ana.evil' })))).ok).toBe(false)
  })

  it('task lists walk one task as one item in real PowerShell (not flattened)', () => {
    const run = (tasks: any[]) => execFileSync('powershell.exe', ['-NoProfile', '-EncodedCommand', Buffer.from(`foreach ($t in ${psTaskList(tasks)}) { $t.p + '|' + $t.n + '|' + $t.on }`, 'utf16le').toString('base64')], { encoding: 'utf8' }).trim().split(/\r?\n/)
    expect(run([{ path: '\\A\\', name: 'One', state: 'disabled' }])).toEqual(['\\A\\|One|False'])
    expect(run([{ path: '\\A\\', name: 'One', state: 'disabled' }, { path: "\\B's\\", name: 'Two', state: 'enabled' }])).toEqual(['\\A\\|One|False', "\\B's\\|Two|True"])
  }, 30000)

  it('task script is ASCII and parses in PowerShell', () => {
    const s = taskApplyScript([{ path: "\\Microsoft\\Windows\\It's\\", name: 'A b', state: 'disabled' }, { path: '\\X\\', name: 'Y', state: 'enabled' }])
    expect(/^[\x00-\x7F]*$/.test(s)).toBe(true)
    const f = path.join(os.tmpdir(), `dh-task-${process.pid}.ps1`)
    fs.writeFileSync(f, s)
    try {
      const n = execFileSync('powershell.exe', ['-NoProfile', '-Command', `$e = $null; [void][System.Management.Automation.Language.Parser]::ParseFile('${f.replace(/'/g, "''")}', [ref]$null, [ref]$e); $e.Count`], { encoding: 'utf8' }).trim()
      expect(n).toBe('0')
    } finally { fs.rmSync(f, { force: true }) }
  }, 30000)
})
