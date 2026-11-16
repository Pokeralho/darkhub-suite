import { describe, it, expect } from 'vitest';
import { applyNavLayout, layoutOf, moveItem, moveSection, sameLayout } from '../src/lib/navLayout';

const S = (id: string, items: string[]) => ({ id, category: id, items: items.map((x) => ({ id: x, label: x })) });
const ids = (secs: { id: string; items: { id: string }[] }[]) => secs.map((s) => `${s.id}:${s.items.map((i) => i.id).join(',')}`);
const defaults = [S('a', ['home', 'dash']), S('b', ['ssh', 'usb', 'net']), S('c', ['cleaner'])];

describe('sidebar order', () => {
  it('without a saved layout keeps the default', () => {
    expect(applyNavLayout(defaults, null)).toBe(defaults);
  });

  it('moves items inside a section and across sections', () => {
    let l = layoutOf(defaults);
    l = moveItem(l, 'net', 'b', 0);
    expect(ids(applyNavLayout(defaults, l))).toEqual(['a:home,dash', 'b:net,ssh,usb', 'c:cleaner']);
    l = moveItem(l, 'ssh', 'a', 0);
    expect(ids(applyNavLayout(defaults, l))).toEqual(['a:ssh,home,dash', 'b:net,usb', 'c:cleaner']);
    // moving down in the same list accounts for the removed slot
    l = moveItem(l, 'ssh', 'a', 2);
    expect(ids(applyNavLayout(defaults, l))).toEqual(['a:home,ssh,dash', 'b:net,usb', 'c:cleaner']);
  });

  it('reorders sections', () => {
    const l = moveSection(layoutOf(defaults), 'c', 0);
    expect(ids(applyNavLayout(defaults, l))).toEqual(['c:cleaner', 'a:home,dash', 'b:ssh,usb,net']);
    const back = moveSection(l, 'c', 3);
    expect(sameLayout(back, layoutOf(defaults))).toBe(true);
  });

  it('keeps new screens from a later version and drops removed ones', () => {
    const saved = moveItem(layoutOf(defaults), 'cleaner', 'a', 0);
    saved.sections[1].items.push('removed-screen');
    const newer = [S('a', ['home', 'dash']), S('b', ['ssh', 'usb', 'serial', 'net']), S('c', ['cleaner']), S('d', ['ext1'])];
    expect(ids(applyNavLayout(newer, saved))).toEqual(['a:cleaner,home,dash', 'b:ssh,usb,serial,net', 'c:', 'd:ext1']);
  });

  it('ignores garbage in storage', () => {
    expect(applyNavLayout(defaults, { v: 2 } as never)).toBe(defaults);
    expect(ids(applyNavLayout(defaults, { v: 1, sections: [{ id: 'zzz', items: ['home'] }] }))).toEqual(ids(defaults));
  });
});
