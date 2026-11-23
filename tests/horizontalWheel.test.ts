import { describe, it, expect } from 'vitest';
import { wheelToHorizontal } from '../src/utils/horizontalWheel';

// Tab bars that overflow must scroll with a normal (vertical) mouse wheel; trackpads, Shift+wheel and zoom keep
// their own behaviour. (Checked end to end in the browser: 3 wheel notches moved the Network Toolkit tabs 360 px.)
describe('horizontal wheel', () => {
  it('maps a vertical wheel to horizontal pixels', () => {
    expect(wheelToHorizontal({ deltaX: 0, deltaY: 120, shiftKey: false, ctrlKey: false })).toBe(120);
    expect(wheelToHorizontal({ deltaX: 0, deltaY: -3, shiftKey: false, ctrlKey: false, deltaMode: 1 })).toBe(-48);
  });
  it('leaves trackpad, Shift+wheel and Ctrl+wheel alone', () => {
    expect(wheelToHorizontal({ deltaX: 40, deltaY: 5, shiftKey: false, ctrlKey: false })).toBe(0);
    expect(wheelToHorizontal({ deltaX: 0, deltaY: 120, shiftKey: true, ctrlKey: false })).toBe(0);
    expect(wheelToHorizontal({ deltaX: 0, deltaY: 120, shiftKey: false, ctrlKey: true })).toBe(0);
  });
});
