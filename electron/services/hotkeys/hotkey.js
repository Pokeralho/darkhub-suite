// DarkHub hotkeys: "Ctrl+Shift+F6", "Alt+X", "Mouse4"... Native watchers (DarkHub.HotkeyWatch.exe, the click engine) see them without taking the key
// away from the game; this module only validates and normalizes what the app stores and sends to it.

const MODS = { CTRL: 'Ctrl', CONTROL: 'Ctrl', COMMANDORCONTROL: 'Ctrl', ALT: 'Alt', SHIFT: 'Shift', WIN: 'Win', SUPER: 'Win', META: 'Win' }
const ORDER = ['Ctrl', 'Alt', 'Shift', 'Win']
const NAMED = ['Mouse4', 'Mouse5', 'MouseMiddle', 'Space', 'Tab', 'Enter', 'Backspace', 'Insert', 'Delete', 'Home', 'End', 'PageUp',
  'PageDown', 'Up', 'Down', 'Left', 'Right', 'CapsLock', 'ScrollLock', 'Pause', 'PrintScreen', 'NumAdd', 'NumSub', 'NumMult', 'NumDiv', 'NumDec']
const SYMBOLS = ['-', '=', ',', '.', '/', ';', "'", '[', ']', '\\', '`']

function key(token) {
  const t = token.trim()
  const up = t.toUpperCase()
  if (/^[A-Z0-9]$/.test(up)) return up
  if (/^F([1-9]|1\d|2[0-4])$/.test(up)) return up
  if (/^NUM[0-9]$/.test(up)) return `Num${up[3]}`
  const named = NAMED.find((n) => n.toUpperCase() === up)
  if (named) return named
  if (up === 'XBUTTON1') return 'Mouse4'
  if (up === 'XBUTTON2') return 'Mouse5'
  if (up === 'PLUS') return '='
  if (SYMBOLS.includes(t)) return t
  return null
}

/** Canonical spelling ("ctrl+shift+f6" -> "Ctrl+Shift+F6"), or null when it is not a usable hotkey. Escape is reserved. */
export function normalizeHotkey(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > 64) return null
  const s = text.trim()
  // "Ctrl++" is Ctrl with the plus/equals key
  const parts = s.endsWith('++') ? [...s.slice(0, -2).split('+'), '='] : s.split('+')
  const mods = new Set()
  let main = null
  for (const p of parts) {
    if (!p.trim()) return null
    const m = MODS[p.trim().toUpperCase()]
    if (m) { mods.add(m); continue }
    const k = key(p)
    if (!k || main) return null
    main = k
  }
  if (!main) return null
  return [...ORDER.filter((m) => mods.has(m)), main].join('+')
}

/** True when the hotkey is a single key with no modifier (it still reaches the game: worth a warning, not an error). */
export function isBareKey(hotkey) {
  return Boolean(hotkey) && !/^(Ctrl|Alt|Shift|Win)\+/.test(hotkey)
}
