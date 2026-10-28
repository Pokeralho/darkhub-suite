// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// @ts-ignore - plain JS module
import { normalizeHotkey, isBareKey } from '../electron/services/hotkeys/hotkey.js'
// @ts-ignore - plain JS module
import { AutoClickerService } from '../electron/services/autoclicker/AutoClickerService.js'
import { keyFromCode, keyFromMouseButton, withModifiers } from '../src/utils/hotkey'

describe('auto clicker hotkeys', () => {
  it('accepts any key or combination and spells it one way', () => {
    expect(normalizeHotkey('ctrl+shift+f6')).toBe('Ctrl+Shift+F6')
    expect(normalizeHotkey('Shift+Ctrl+X')).toBe('Ctrl+Shift+X')
    expect(normalizeHotkey('Alt+Mouse4')).toBe('Alt+Mouse4')
    expect(normalizeHotkey('Win+Num5')).toBe('Win+Num5')
    expect(normalizeHotkey('Ctrl++')).toBe('Ctrl+=')
    expect(normalizeHotkey('F24')).toBe('F24')
    expect(normalizeHotkey('Ctrl+Shift')).toBeNull()
    expect(normalizeHotkey('F6+F7')).toBeNull()
    expect(normalizeHotkey('Ctrl+Banana')).toBeNull()
    expect(normalizeHotkey('F6\nSTART left 1')).toBeNull()
    expect(isBareKey('F6')).toBe(true)
    expect(isBareKey('Ctrl+F6')).toBe(false)
  })

  it('reads key presses by physical key, not layout', () => {
    expect(keyFromCode('KeyQ')).toBe('Q')
    expect(keyFromCode('Digit7')).toBe('7')
    expect(keyFromCode('Numpad3')).toBe('Num3')
    expect(keyFromCode('ArrowUp')).toBe('Up')
    expect(keyFromCode('ShiftLeft')).toBeNull()
    expect(keyFromMouseButton(3)).toBe('Mouse4')
    expect(keyFromMouseButton(0)).toBeNull()
    const combo = withModifiers({ ctrlKey: true, altKey: false, shiftKey: true, metaKey: false }, 'F6')
    expect(combo).toBe('Ctrl+Shift+F6')
    // what the screen records, the main process accepts as is
    expect(normalizeHotkey(combo)).toBe(combo)
  })

  it('moves the old bare F6 default to a combination and keeps what the user chose', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-ac-'))
    const file = path.join(dir, 'autoclicker.json')
    const svc = () => new AutoClickerService({ configFile: file, enginePath: () => null, onChange: () => {} })
    fs.writeFileSync(file, JSON.stringify({ hotkey: 'F6', defaults: { intervalMs: 20, button: 'right' } }))
    let s = svc(); s.load()
    expect(s.hotkey).toBe('Ctrl+Shift+F6')
    expect(s.settings).toEqual({ button: 'right', intervalMs: 20 })
    expect(s.setHotkey('F6')).toEqual({ ok: true, hotkey: 'F6' })
    s = svc(); s.load()
    expect(s.hotkey).toBe('F6')
    expect(s.setHotkey('Ctrl+Nope').ok).toBe(false)
    expect(s.setHotkey('')).toEqual({ ok: true, hotkey: null })
    s = svc(); s.load()
    expect(s.hotkey).toBeNull()
    expect(s.start({}).ok).toBe(false) // no engine: a clear error, nothing else runs
  })
})
