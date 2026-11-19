// @vitest-environment node
// Linux gates for the remaining Windows-only binaries: no spawn attempt, structured degradation instead.
import { describe, it, expect, vi } from 'vitest'
import path from 'node:path'
import { HotkeyService } from '../electron/services/hotkeys/HotkeyService.js'
import { isPawnIoInstalled, forgetPawnIoCheck } from '../electron/hal/collectors/HwSensorsDaemon.js'

// These assertions are only meaningful where the platform gate itself is active: on Windows the
// watcher/reg.exe paths are legitimately used, so the suite would fail for the wrong reason.
const itLinux = process.platform === 'linux' ? it : it.skip

describe('Linux-only capability gates', () => {
  itLinux('HotkeyService does not start the Windows watcher on Linux and falls back to globalShortcut', () => {
    // A path that really exists: without the platform gate _watcher() would try to spawn it.
    const watcherPath = path.resolve(__dirname, '..', 'package.json')
    const globalShortcut = { register: vi.fn(() => true), unregister: vi.fn() }
    const svc = new HotkeyService({ globalShortcut, watcherPath })

    expect(svc._watcher()).toBeNull()
    expect(svc.proc).toBeNull()
    const res = svc.register('shot', 'Ctrl+F1', () => {})
    expect(res.ok).toBe(true)
    expect(globalShortcut.register).toHaveBeenCalled()
    expect(svc.binds.get('shot')?.viaGlobal).toBeTruthy()
  })

  itLinux('isPawnIoInstalled never calls reg.exe on Linux', () => {
    const execFileSync = vi.fn()
    forgetPawnIoCheck()
    expect(isPawnIoInstalled(execFileSync)).toBe(false)
    expect(execFileSync).not.toHaveBeenCalled()
  })
})
