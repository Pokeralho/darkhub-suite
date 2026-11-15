// Keyboard behaviour of the terminal in "simple" mode (Notepad / VS Code habits). Pure, so it is unit-tested.
//
// Ctrl+C copies only when text is selected; with nothing selected it still interrupts the running command (^C),
// like Windows Terminal. Word editing keys are translated to the readline sequences bash/zsh understand.

export type KeyAction =
  | { type: 'copy' }
  | { type: 'paste' }
  | { type: 'selectAll' }
  | { type: 'search' }
  | { type: 'clearSelection' }
  | { type: 'send'; data: string };

export interface KeyInfo { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey?: boolean }

export function simpleKeyAction(e: KeyInfo, hasSelection: boolean): KeyAction | null {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const ctrl = e.ctrlKey || Boolean(e.metaKey);
  if (e.altKey) return null;
  if (ctrl && !e.shiftKey) {
    if (k === 'c') return hasSelection ? { type: 'copy' } : null; // null: xterm sends ^C (interrupt)
    if (k === 'x') return hasSelection ? { type: 'copy' } : null; // terminal output cannot be cut: copy
    if (k === 'v') return { type: 'paste' };
    if (k === 'a') return { type: 'selectAll' };
    if (k === 'f') return { type: 'search' };
    if (k === 'Backspace') return { type: 'send', data: '\x17' }; // delete previous word
    if (k === 'Delete') return { type: 'send', data: '\x1bd' }; // delete next word
    if (k === 'ArrowLeft') return { type: 'send', data: '\x1bb' }; // previous word
    if (k === 'ArrowRight') return { type: 'send', data: '\x1bf' }; // next word
  }
  if (ctrl && e.shiftKey) {
    if (k === 'c') return hasSelection ? { type: 'copy' } : null;
    if (k === 'v') return { type: 'paste' };
    if (k === 'f') return { type: 'search' };
  }
  if (!ctrl && e.shiftKey && k === 'Insert') return { type: 'paste' };
  if (!ctrl && !e.shiftKey && k === 'Escape' && hasSelection) return { type: 'clearSelection' };
  return null;
}

/** Lines that would run if the text were pasted (a trailing newline does not count as an extra line). */
export function pastedLines(text: string) {
  return String(text).replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').length;
}

/** Command box: what is sent to the shell for the typed text (each line runs, ending with Enter). */
export function commandBoxPayload(text: string) {
  const lines = String(text).replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  return `${lines.join('\r')}\r`;
}
