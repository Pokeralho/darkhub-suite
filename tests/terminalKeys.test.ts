import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { simpleKeyAction, pastedLines, commandBoxPayload } from '../src/components/ssh/terminalKeys';
// @ts-ignore - plain JS module
import { SshVaultStore, normalizeTerminalSettings } from '../electron/services/ssh/SshVaultStore.js';

const k = (key: string, mods: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({ key, ctrlKey: false, shiftKey: false, altKey: false, ...mods });

describe('simple (Notepad-style) terminal keys', () => {
  it('Ctrl+C copies a selection and still interrupts without one', () => {
    expect(simpleKeyAction(k('c', { ctrlKey: true }), true)).toEqual({ type: 'copy' });
    expect(simpleKeyAction(k('c', { ctrlKey: true }), false)).toBeNull(); // xterm sends ^C
    expect(simpleKeyAction(k('C', { ctrlKey: true, shiftKey: true }), true)).toEqual({ type: 'copy' });
  });

  it('paste, select all and find use the usual shortcuts', () => {
    expect(simpleKeyAction(k('v', { ctrlKey: true }), false)).toEqual({ type: 'paste' });
    expect(simpleKeyAction(k('Insert', { shiftKey: true }), false)).toEqual({ type: 'paste' });
    expect(simpleKeyAction(k('a', { ctrlKey: true }), false)).toEqual({ type: 'selectAll' });
    expect(simpleKeyAction(k('f', { ctrlKey: true }), false)).toEqual({ type: 'search' });
    expect(simpleKeyAction(k('Escape'), true)).toEqual({ type: 'clearSelection' });
    expect(simpleKeyAction(k('Escape'), false)).toBeNull();
  });

  it('word editing keys become readline sequences', () => {
    expect(simpleKeyAction(k('Backspace', { ctrlKey: true }), false)).toEqual({ type: 'send', data: '\x17' });
    expect(simpleKeyAction(k('ArrowLeft', { ctrlKey: true }), false)).toEqual({ type: 'send', data: '\x1bb' });
    expect(simpleKeyAction(k('ArrowRight', { ctrlKey: true }), false)).toEqual({ type: 'send', data: '\x1bf' });
  });

  it('leaves everything else to the terminal', () => {
    for (const e of [k('x'), k('Enter'), k('l', { ctrlKey: true }), k('d', { ctrlKey: true }), k('c', { ctrlKey: true, altKey: true }), k('ArrowUp')]) {
      expect(simpleKeyAction(e, false)).toBeNull();
    }
  });
});

describe('paste and command box text', () => {
  it('counts lines that would run', () => {
    expect(pastedLines('ls -la')).toBe(1);
    expect(pastedLines('ls -la\n')).toBe(1);
    expect(pastedLines('cd /tmp\r\nls\nrm x')).toBe(3);
  });

  it('sends each line with Enter', () => {
    expect(commandBoxPayload('df -h')).toBe('df -h\r');
    expect(commandBoxPayload('cd /var/log\nls -la\n\n')).toBe('cd /var/log\rls -la\r');
  });
});

describe('terminal mode settings', () => {
  it('defaults to classic, validates and saves partial changes', () => {
    expect(normalizeTerminalSettings({})).toMatchObject({ keyMode: 'classic', commandBox: false, confirmPaste: true });
    expect(normalizeTerminalSettings({ keyMode: 'weird' }).keyMode).toBe('classic');
    const s = new SshVaultStore({ getKey: () => crypto.randomBytes(32), persist: false });
    s.saveSettings({ terminal: { fontSize: 15 } });
    s.saveSettings({ terminal: { keyMode: 'simple', commandBox: true } });
    expect(s.getState().settings.terminal).toMatchObject({ keyMode: 'simple', commandBox: true, confirmPaste: true, fontSize: 15 });
  });
});
