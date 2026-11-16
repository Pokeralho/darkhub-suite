// @vitest-environment node
// Audit fixes: shared pieces between composite Optimizer operations, ":applied" status markers, CPU plan revert,
// EEE verification, primary adapter selection, USB input safety revert, Startup item trust, DarkOS services revert.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir(), isPackaged: false } }))

function memStore() {
  const m = new Map<string, unknown>()
  return {
    m,
    getExtra: (id: string) => (m.has(id) ? m.get(id) : null),
    saveExtra: (id: string, d: unknown) => { m.set(id, d) },
    clearExtra: (id: string) => { m.delete(id) }
  }
}

describe('shared owners', () => {
  it('keeps a piece another operation still claims and frees it once released', async () => {
    // @ts-ignore - plain JS module
    const o = await import('../electron/services/optimizer/sharedOwners.js')
    const s = memStore()
    o.claimShared(s, 'A', ['x', 'y'])
    o.claimShared(s, 'B', ['y'])
    expect(o.partitionShared(s, 'A', ['x', 'y'])).toEqual({ free: ['x'], kept: ['y'] })
    o.releaseShared(s, 'B', ['y'])
    expect(o.partitionShared(s, 'A', ['x', 'y'])).toEqual({ free: ['x', 'y'], kept: [] })
    o.releaseShared(s, 'A', ['x', 'y'])
    expect(s.m.has('sys:owners')).toBe(false)
    o.markApplied(s, 'A'); expect(o.isApplied(s, 'A')).toBe(true)
    o.clearApplied(s, 'A'); expect(o.isApplied(s, 'A')).toBe(false)
  })
})

describe.skipIf(process.platform !== 'win32')('SystemEngine composite operations', () => {
  let store: ReturnType<typeof memStore>
  let reverted: string[][]
  let extras: string[]
  let revertOut = ''
  beforeEach(() => { vi.resetModules(); store = memStore(); reverted = []; extras = []; revertOut = '' })

  async function engine() {
    vi.doMock('../electron/services/optimizer/DeepTweaksEngine.js', () => ({
      default: {
        ...store,
        applyTweaks: async () => ({ ok: true }),
        revertTweaks: async (ids: string[], _ev?: unknown, opts?: { extraCommand?: string }) => {
          reverted.push(ids)
          if (opts?.extraCommand) extras.push(opts.extraCommand)
          return { ok: true, stdout: opts?.extraCommand ? revertOut : '' }
        }
      }
    }))
    // @ts-ignore - plain JS module
    const e = (await import('../electron/services/optimizer/SystemEngine.js')).default as any
    return e
  }

  it('records the applied marker only after a verified apply', async () => {
    const e = await engine()
    e._runMarked = async () => ({ ok: true, out: 'DHSNAP|disabledynamictick|-\nDHAFT|disabledynamictick|No' })
    expect((await e.applyTimerTuning()).ok).toBe(false)
    expect(store.getExtra('sys:applied:optimizer:timerTuning')).toBeNull()
    expect(store.getExtra('sys:bcd')).not.toBeNull() // the snapshot itself is still kept for the revert
    e._runMarked = async () => ({ ok: true, out: 'DHSNAP|disabledynamictick|-\nDHAFT|disabledynamictick|Yes' })
    expect((await e.applyTimerTuning()).ok).toBe(true)
    expect(store.getExtra('sys:applied:optimizer:timerTuning')).toBe(true)
  })

  it('reverting Hardcore keeps the NTFS last-access value the Kernel operation still uses', async () => {
    const e = await engine()
    const scripts: string[] = []
    e._runMarked = async (s: string) => {
      scripts.push(s)
      return { ok: true, out: 'DHSNAP|disabledynamictick|-\nDHSNAP|lastaccess|2\nDHAFT|disabledynamictick|Yes\nDHAFT|lastaccess|1' }
    }
    expect((await e.applyExtremeKernelMod()).ok).toBe(true)
    expect((await e.applyHardcoreGamerMode()).ok).toBe(true)
    scripts.length = 0
    const r = await e.revertHardcoreGamerMode()
    expect(r.ok).toBe(true)
    expect(r.msg).toMatch(/último acesso do NTFS/)
    expect(reverted).toEqual([['tweak:disableVBS', 'tweak:disableHibernation']])
    expect(scripts.join('\n')).not.toMatch(/disablelastaccess/) // fsutil untouched
    expect(store.getExtra('sys:lastaccess')).not.toBeNull()
    expect(store.getExtra('sys:applied:optimizer:disableCoreIsolation')).toBeNull()
  })

  it('reverting Timer Tuning keeps the dynamic tick while Kernel is applied', async () => {
    const e = await engine()
    const scripts: string[] = []
    e._runMarked = async (s: string) => { scripts.push(s); return { ok: true, out: 'DHSNAP|disabledynamictick|-\nDHSNAP|lastaccess|2\nDHAFT|disabledynamictick|Yes\nDHAFT|lastaccess|1' } }
    await e.applyExtremeKernelMod()
    await e.applyTimerTuning()
    scripts.length = 0
    expect((await e.revertTimerTuning()).ok).toBe(true)
    expect(scripts).toEqual([])
    expect(store.getExtra('sys:applied:optimizer:timerTuning')).toBeNull()
    // now Kernel is the only owner: its revert restores everything
    // registry + BCD + NTFS in ONE elevated run (the tweaks batch): no separate _runMarked call
    revertOut = 'DHCMD|-1|ok\nDHAFT|disabledynamictick|-\nDHAFT|lastaccess|2'
    expect((await e.revertExtremeKernelMod()).ok).toBe(true)
    expect(scripts).toEqual([])
    expect(extras.join('\n')).toMatch(/bcdedit\.exe \/deletevalue disabledynamictick/)
    expect(extras.join('\n')).toMatch(/function DhCheck/)
    expect(store.getExtra('sys:bcd')).toBeNull()
    expect(reverted).toEqual([['group:kernelCore', 'tweak:mmcssGames']])
  })

  it('CPU unpark revert only re-activates the plan when it is still the active one', async () => {
    store.saveExtra('sys:cpuUnpark', { scheme: '381b4222-f694-41f0-9685-ff5bb260df2e', CPMINCORES: '5', CPMAXCORES: '100' })
    const e = await engine()
    let script = ''
    e._runMarked = async (s: string) => { script = s; return { ok: true, out: '' } }
    await e.revertCpuUnpark()
    expect(script).toMatch(/powercfg\.exe \/getactivescheme/)
    expect(script).toMatch(/if \(\$dhAct -match '381b4222-f694-41f0-9685-ff5bb260df2e'\) \{\s*& powercfg\.exe \/setactive 381b4222/)
  })
})

describe('network adapter selection and EEE', () => {
  it('picks the default-route adapter and never sorts the LinkSpeed string', async () => {
    // @ts-ignore - plain JS module
    const { PS_SELECT_PRIMARY_ADAPTER } = await import('../electron/services/optimizer/activeAdapterPs.js')
    expect(PS_SELECT_PRIMARY_ADAPTER).toMatch(/Get-NetRoute .*0\.0\.0\.0\/0/)
    expect(PS_SELECT_PRIMARY_ADAPTER).toMatch(/Sort-Object -Property Speed -Descending/)
    expect(PS_SELECT_PRIMARY_ADAPTER).not.toMatch(/LinkSpeed/)
    expect(/^[\x00-\x7f]*$/.test(PS_SELECT_PRIMARY_ADAPTER)).toBe(true)
    for (const f of ['electron/main.js', 'electron/latencyGuardian.js', 'electron/services/optimizer/DnsEngine.js', 'electron/services/optimizer/NetworkEngine.js']) {
      expect(fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8')).not.toMatch(/Sort-Object -Property LinkSpeed/)
    }
  })

  it('EEE changes stop on errors and are read back', async () => {
    // @ts-ignore - plain JS module
    const { buildEeeSetScript } = await import('../electron/services/optimizer/NetworkEngine.js')
    const s = buildEeeSetScript([{ name: "Eth'1", value: '1' }, { name: 'bad', value: 'x' }])
    expect(s).toMatch(/Set-NetAdapterAdvancedProperty -RegistryValue 1 -ErrorAction Stop/)
    expect(s).toMatch(/-ne '1'\) \{ throw/)
    expect(s).toContain("'Eth''1'")
    expect(s).not.toContain('bad')
    expect(buildEeeSetScript([{ name: 'a', value: '0' }], { missingOk: true })).toMatch(/DHEEE\|missing/)
  })
})

describe('USB input devices', () => {
  beforeEach(() => vi.resetModules())

  it('arms the re-enable inside the same elevated run and never asks UAC again', async () => {
    const calls: string[] = []
    vi.doMock('../electron/services/optimizer/ElevationHelper.js', () => ({
      default: { runMarked: async (s: string) => { calls.push(s); return { ok: true, out: '' } }, isElevated: async () => false }
    }))
    vi.useFakeTimers()
    try {
      // @ts-ignore - plain JS module
      const { UsbService } = await import('../electron/services/usb/UsbService.js')
      const keepDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-usbkeep-'))
      const svc = new UsbService({ keepDir })
      const id = 'HID\\VID_046D&PID_C52B\\7&1'
      const r = await svc.setDeviceEnabled({ instanceId: id, name: 'Mouse', kind: 'mouse' }, false)
      expect(r.ok).toBe(true)
      expect(calls).toHaveLength(1)
      const script = calls[0]
      expect(script.indexOf('Start-Process')).toBeLessThan(script.indexOf('Disable-PnpDevice'))
      const encoded = /'-EncodedCommand','([A-Za-z0-9+/=]+)'/.exec(script)?.[1] ?? ''
      const revert = Buffer.from(encoded, 'base64').toString('utf16le')
      expect(revert).toMatch(/Start-Sleep -Seconds 20/)
      expect(revert).toMatch(/Test-Path -LiteralPath '.+\.keep'/)
      expect(revert).toContain(`Enable-PnpDevice -InstanceId '${id}'`)
      expect(svc.keepDisabled(id).ok).toBe(true)
      expect(fs.readdirSync(keepDir).some((f: string) => f.endsWith('.keep'))).toBe(true)
      await vi.advanceTimersByTimeAsync(30000)
      expect(calls).toHaveLength(1)
      expect(svc.keepDisabled(id).ok).toBe(false) // too late: nothing pending any more
    } finally {
      vi.useRealTimers()
    }
  })
})

describe.skipIf(process.platform !== 'win32')('Startup manager trusts only the item id', () => {
  beforeEach(() => vi.resetModules())

  async function service(items: object[]) {
    const runs: string[] = []
    vi.doMock('../electron/services/optimizer/ElevationHelper.js', () => ({
      default: { runMarked: async (s: string) => { runs.push(s); return { ok: true } }, isElevated: async () => true }
    }))
    // @ts-ignore - plain JS module
    const { StartupService } = await import('../electron/services/startup/StartupService.js')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-startup-'))
    const svc = new StartupService({ app: { getPath: () => dir } })
    svc.list = async () => ({ ok: true, items })
    return { svc, runs }
  }

  it('rejects a forged item, protects essential services and records the real previous state', async () => {
    const task = { id: 'task||\\Vendor\\|Updater', kind: 'task', key: 'Updater', name: 'Updater', taskPath: '\\Vendor\\', scope: 'machine', enabled: false }
    const rpc = { id: 'service|||RpcSs', kind: 'service', key: 'RpcSs', name: 'RPC', scope: 'machine', enabled: true }
    const { svc, runs } = await service([task, rpc])
    expect((await svc.setEnabled({ id: 'task||\\Microsoft\\|Evil', kind: 'task', key: 'x', taskPath: '\\Microsoft\\', scope: 'machine' }, false)).ok).toBe(false)
    expect((await svc.setEnabled({ ...rpc }, false)).ok).toBe(false)
    expect(runs).toEqual([])
    // the renderer claims a different taskPath: the listed one is used
    const r = await svc.setEnabled({ ...task, taskPath: '\\Microsoft\\Windows\\' }, true)
    expect(r.ok).toBe(true)
    expect(runs[0]).toContain("Enable-ScheduledTask -TaskPath '\\Vendor\\' -TaskName 'Updater'")
    expect(svc._history()[0]).toMatchObject({ id: task.id, from: false, to: true })
  })
})

describe.skipIf(process.platform !== 'win32')('services revert on DarkOS without a snapshot', () => {
  beforeEach(() => vi.resetModules())

  it('skips instead of re-enabling services the DarkOS image disabled', async () => {
    const elevated = vi.fn(async () => ({ code: 0, stdout: '', stderr: '' }))
    vi.doMock('../electron/services/optimizer/ElevationHelper.js', () => ({ default: { runElevatedPowerShell: elevated } }))
    vi.doMock('../electron/services/optimizer/DeepTweaksEngine.js', () => ({ default: memStore() }))
    // @ts-ignore - plain JS module
    const svc = (await import('../electron/services/optimizer/ServicesEngine.js')).default as any
    svc._isDarkOS = () => true
    const r = await svc.revertServicesTweak()
    expect(r.ok).toBe(false)
    expect(r.skipped).toBe(true)
    expect(elevated).not.toHaveBeenCalled()
  })
})

describe('deep tweak definitions', () => {
  it('Num Lock on the login screen is a snapshotted row and Teredo checks netsh exit codes', async () => {
    vi.resetModules()
    vi.doUnmock('../electron/services/optimizer/DeepTweaksEngine.js')
    vi.doUnmock('../electron/services/optimizer/ElevationHelper.js')
    // @ts-ignore - plain JS module
    const engine = (await import('../electron/services/optimizer/DeepTweaksEngine.js')).default as any
    const num = engine.getDefinition('tweak:numLockOnStartup')
    expect(num.commands).toBeUndefined()
    expect(num.changes.map((c: any) => c.key)).toContain('HKU\\.DEFAULT\\Control Panel\\Keyboard')
    expect(num.revertChanges).toContainEqual({ key: 'HKU\\.DEFAULT\\Control Panel\\Keyboard', name: 'InitialKeyboardIndicators', type: 'REG_SZ', data: '2147483648' })
    const teredo = engine.getDefinition('tweak:disableTeredo')
    expect(teredo.commands.apply).toMatch(/\$LASTEXITCODE -ne 0\) \{ throw/)
    expect(teredo.commands.revert).toMatch(/\$LASTEXITCODE -ne 0\) \{ throw/)
  })
})
