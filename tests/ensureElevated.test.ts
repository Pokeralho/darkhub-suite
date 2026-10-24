// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
// @ts-ignore - plain JS module
import { quoteArg, buildRelaunchCommand, ensureElevated } from '../electron/services/ensureElevated.js'

describe('ensureElevated', () => {
  it('quotes arguments and builds the UAC relaunch command', () => {
    expect(quoteArg('--page=home')).toBe('--page=home')
    expect(quoteArg('C:\\My Games\\x')).toBe('"C:\\My Games\\x"')
    const cmd = buildRelaunchCommand("C:\\Program Files\\DarkHub\\DarkHub.exe", ['--hidden', 'C:\\O\'Brien dir'])
    expect(cmd).toContain("-FilePath 'C:\\Program Files\\DarkHub\\DarkHub.exe'")
    expect(cmd).toContain("-ArgumentList '--hidden \"C:\\O''Brien dir\"'")
    expect(cmd).toContain('-Verb RunAs')
  })

  it('does nothing in dev builds or when already elevated', async () => {
    const isElevated = vi.fn(async () => false)
    expect(await ensureElevated({ app: { isPackaged: false }, dialog: {}, isElevated })).toBe(true)
    expect(isElevated).not.toHaveBeenCalled()
    const app = { isPackaged: true }
    if (process.platform === 'win32') expect(await ensureElevated({ app, dialog: {}, isElevated: async () => true })).toBe(true)
  })
})
