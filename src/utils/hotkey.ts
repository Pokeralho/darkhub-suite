// Turns a key press (or a side mouse button) into the hotkey spelling the auto clicker engine understands:
// "Ctrl+Shift+F6", "Alt+X", "Mouse4". Keys come from KeyboardEvent.code, so the keyboard layout does not matter.

const CODE_NAMES: Record<string, string> = {
  Space: 'Space', Tab: 'Tab', Enter: 'Enter', Backspace: 'Backspace', Insert: 'Insert', Delete: 'Delete', Home: 'Home', End: 'End',
  PageUp: 'PageUp', PageDown: 'PageDown', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  CapsLock: 'CapsLock', ScrollLock: 'ScrollLock', Pause: 'Pause', PrintScreen: 'PrintScreen',
  NumpadAdd: 'NumAdd', NumpadSubtract: 'NumSub', NumpadMultiply: 'NumMult', NumpadDivide: 'NumDiv', NumpadDecimal: 'NumDec',
  Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', Backquote: '`', IntlBackslash: '\\'
};

const MODIFIER_CODES = /^(Control|Shift|Alt|Meta|OS)(Left|Right)?$/;

/** The main key of a KeyboardEvent.code, or null for modifiers alone and keys the engine cannot watch. */
export function keyFromCode(code: string): string | null {
  if (MODIFIER_CODES.test(code)) return null;
  let m = /^Key([A-Z])$/.exec(code); if (m) return m[1];
  m = /^Digit([0-9])$/.exec(code); if (m) return m[1];
  m = /^Numpad([0-9])$/.exec(code); if (m) return `Num${m[1]}`;
  m = /^F([1-9]|1\d|2[0-4])$/.exec(code); if (m) return code;
  return CODE_NAMES[code] ?? null;
}

export function withModifiers(e: { ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }, key: string): string {
  return [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Win', key].filter(Boolean).join('+');
}

/** Side mouse buttons (MouseEvent.button 3 and 4) and the middle button. */
export function keyFromMouseButton(button: number): string | null {
  return button === 3 ? 'Mouse4' : button === 4 ? 'Mouse5' : button === 1 ? 'MouseMiddle' : null;
}

export const isBareKey = (hotkey: string) => Boolean(hotkey) && !/^(Ctrl|Alt|Shift|Win)\+/.test(hotkey);
