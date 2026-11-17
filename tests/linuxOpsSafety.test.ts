// @vitest-environment node
// A2/A3 regression tests: Linux mutations must fail closed and never claim ok
// without a verified, restorable state. All system commands are mocked.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
// @ts-ignore plain JS module
import {
  linuxBoostProcessPriority,
  linuxRestorePerformancePower,
  linuxSetPerformancePower,
  buildLatencyCapabilities
} from '../electron/services/latency/linuxOps.js'

const ORIGINAL_PLATFORM = Object.getOwnPropertyDescriptor(process, 'platform')
function setPlatform(value: string) {
  Object.defineProperty(process, 'platform', { configurable: true, value })
}
afterEach(() => {
  if (ORIGINAL_PLATFORM) Object.defineProperty(process, 'platform', ORIGINAL_PLATFORM)
})

type CmdResult = { code: number; stdout?: string; stderr?: string }
function mockRun(handler: (cmd: string, args: string[]) => CmdResult) {
  const calls: Array<{ cmd: string; args: string[] }> = []
  const run = async (cmd: string, args: string[]) => {
    calls.push({ cmd, args: [...args] })
    return handler(cmd, args)
  }
  return { run, calls }
}

describe('A2: linuxBoostProcessPriority is disabled (fail closed)', () => {
  beforeEach(() => setPlatform('linux'))

  it('reports unsupported and never executes renice/ionice', async () => {
    const { run, calls } = mockRun(() => ({ code: 0 }))
    const res = await linuxBoostProcessPriority(run, 4242)
    expect(res).toMatchObject({ ok: false, status: 'unsupported', reason: 'no-safe-restore' })
    expect(calls).toEqual([])
  })

  it('never claims success for any pid', async () => {
    const { run } = mockRun(() => ({ code: 0 }))
    for (const pid of [1, 4242, 'not-a-pid']) {
      const res = await linuxBoostProcessPriority(run, pid)
      expect(res.ok).toBe(false)
      expect(res.status).toBe('unsupported')
    }
  })

  it('reports linux-only on other platforms without mutating', async () => {
    setPlatform('win32')
    const { run, calls } = mockRun(() => ({ code: 0 }))
    const res = await linuxBoostProcessPriority(run, 4242)
    expect(res).toMatchObject({ ok: false, status: 'unsupported', reason: 'linux-only' })
    expect(calls).toEqual([])
  })
})

describe('A3: linuxRestorePerformancePower never reports ok without verification', () => {
  beforeEach(() => setPlatform('linux'))

  it('restores a powerprofilesctl profile and verifies it by read-back', async () => {
    let profile = 'performance'
    const { run, calls } = mockRun((cmd, args) => {
      if (cmd === 'powerprofilesctl' && args[0] === 'set') { profile = args[1]; return { code: 0 } }
      if (cmd === 'powerprofilesctl' && args[0] === 'get') return { code: 0, stdout: `${profile}\n` }
      return { code: 1 }
    })
    const res = await linuxRestorePerformancePower(run, { method: 'powerprofilesctl', profile: 'balanced' })
    expect(res).toMatchObject({ ok: true, status: 'ok', profile: 'balanced' })
    expect(profile).toBe('balanced')
    expect(calls.filter((c) => c.cmd === 'powerprofilesctl' && c.args[0] === 'get')).toHaveLength(1)
  })

  it('fails on a non-zero restore exit code and does not report ok', async () => {
    const { run, calls } = mockRun((cmd, args) => {
      if (cmd === 'powerprofilesctl' && args[0] === 'set') return { code: 1, stderr: 'permission denied' }
      return { code: 0, stdout: 'performance\n' }
    })
    const res = await linuxRestorePerformancePower(run, { method: 'powerprofilesctl', profile: 'balanced' })
    expect(res.ok).toBe(false)
    expect(res.status).toBe('failed')
    expect(res.error).toMatch(/permission denied/)
    expect(calls.some((c) => c.cmd === 'powerprofilesctl' && c.args[0] === 'get')).toBe(false)
  })

  it('fails when read-back disagrees with the target', async () => {
    const { run } = mockRun((cmd, args) => {
      if (cmd === 'powerprofilesctl' && args[0] === 'set') return { code: 0 }
      if (cmd === 'powerprofilesctl' && args[0] === 'get') return { code: 0, stdout: 'performance\n' }
      return { code: 1 }
    })
    const res = await linuxRestorePerformancePower(run, { method: 'powerprofilesctl', profile: 'balanced' })
    expect(res.ok).toBe(false)
    expect(res.status).toBe('failed')
    expect(res.observed).toBe('performance')
  })

  it('fails when the read-back command throws', async () => {
    const { run } = mockRun((cmd, args) => {
      if (cmd === 'powerprofilesctl' && args[0] === 'set') return { code: 0 }
      if (cmd === 'powerprofilesctl' && args[0] === 'get') throw new Error('read failed')
      return { code: 1 }
    })
    const res = await linuxRestorePerformancePower(run, { method: 'powerprofilesctl', profile: 'balanced' })
    expect(res.ok).toBe(false)
    expect(res.status).toBe('failed')
  })

  it('restores a cpupower governor with read-back', async () => {
    let governor = 'performance'
    const { run } = mockRun((cmd, args) => {
      if (cmd === 'cpupower' && args[0] === 'frequency-set') { governor = args[2]; return { code: 0 } }
      if (cmd === 'cpupower' && args[0] === 'frequency-info') {
        return { code: 0, stdout: `driver: intel_pstate\n   governor "${governor}"\n` }
      }
      return { code: 1 }
    })
    const res = await linuxRestorePerformancePower(run, { method: 'cpupower', governor: 'powersave' })
    expect(res).toMatchObject({ ok: true, status: 'ok', governor: 'powersave' })
    expect(governor).toBe('powersave')
  })

  it('fails when the cpupower restore command throws', async () => {
    const { run } = mockRun(() => { throw new Error('boom') })
    const res = await linuxRestorePerformancePower(run, { method: 'cpupower', governor: 'powersave' })
    expect(res.ok).toBe(false)
    expect(res.status).toBe('failed')
  })

  it('skips without a captured previous value and mutates nothing', async () => {
    const { run, calls } = mockRun(() => ({ code: 0 }))
    const res = await linuxRestorePerformancePower(run, null)
    expect(res).toMatchObject({ ok: false, status: 'skipped', reason: 'no-prev' })
    expect(calls).toEqual([])
  })
})

describe('A3: linuxSetPerformancePower never mutates blindly', () => {
  beforeEach(() => setPlatform('linux'))

  it('does not mutate when no previous value can be captured', async () => {
    const { run, calls } = mockRun((cmd, args) => {
      if (cmd === 'powerprofilesctl' && args[0] === 'get') return { code: 0, stdout: '  \n' }
      if (cmd === 'cpupower' && args[0] === 'frequency-info') return { code: 0, stdout: 'no governor here\n' }
      return { code: 0 }
    })
    const res = await linuxSetPerformancePower(run)
    expect(res.ok).toBe(false)
    expect(res.status).toBe('unsupported')
    const mutating = (c: { cmd: string; args: string[] }) =>
      c.args[0] === 'set' || c.args[0] === 'frequency-set'
    expect(calls.some(mutating)).toBe(false)
  })

  it('captures prev and reports ok only after a successful read-back', async () => {
    let profile = 'balanced'
    const { run } = mockRun((cmd, args) => {
      if (cmd === 'powerprofilesctl' && args[0] === 'get') return { code: 0, stdout: `${profile}\n` }
      if (cmd === 'powerprofilesctl' && args[0] === 'set') { profile = args[1]; return { code: 0 } }
      return { code: 1 }
    })
    const res = await linuxSetPerformancePower(run)
    expect(res).toMatchObject({ ok: true, status: 'ok', method: 'powerprofilesctl', verified: true })
    expect(res.prev).toEqual({ method: 'powerprofilesctl', profile: 'balanced' })
  })
})

describe('Linux capabilities reflect the disabled priority tweak', () => {
  beforeEach(() => setPlatform('linux'))

  it('does not advertise renice/ionice support on Linux', () => {
    const cap = buildLatencyCapabilities()
    expect(cap.platform).toBe('linux')
    expect(cap.tweaks.processPriorityHigh.supported).toBe(false)
  })
})
