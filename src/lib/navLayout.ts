// Sidebar order chosen by the user (drag and drop). Only ids are stored; labels/icons always come from the code,
// so translations and new screens keep working. Stored in this profile's localStorage.

export interface NavLayout { v: 1; sections: { id: string; items: string[] }[] }
interface HasId { id: string }
interface SectionLike<I extends HasId> { id: string; items: I[] }

export const NAV_LAYOUT_KEY = 'darkhub.navLayout';

export function layoutOf<I extends HasId, S extends SectionLike<I>>(sections: S[]): NavLayout {
  return { v: 1, sections: sections.map((s) => ({ id: s.id, items: s.items.map((i) => i.id) })) };
}

/**
 * Applies a saved layout to the default sections:
 * - sections follow the saved order; sections the save does not know (new in this version) keep their default place;
 * - an item goes where the user put it, even into another section;
 * - items the save does not know are added to their default section, after the neighbour they follow by default;
 * - ids that no longer exist are dropped.
 */
export function applyNavLayout<I extends HasId, S extends SectionLike<I>>(defaults: S[], saved: NavLayout | null | undefined): S[] {
  if (!saved || saved.v !== 1 || !Array.isArray(saved.sections)) return defaults;
  const byId = new Map<string, I>();
  const homeOf = new Map<string, string>();
  for (const s of defaults) for (const i of s.items) { byId.set(i.id, i); homeOf.set(i.id, s.id); }
  const placed = new Set<string>();
  const items = new Map<string, I[]>(defaults.map((s) => [s.id, []]));
  for (const ss of saved.sections) {
    if (!items.has(ss.id) || !Array.isArray(ss.items)) continue;
    for (const id of ss.items) {
      const it = byId.get(id);
      if (!it || placed.has(id)) continue;
      items.get(ss.id)!.push(it);
      placed.add(id);
    }
  }
  // unknown items: after their default predecessor if it is in the same section, else at the end of the home section
  for (const s of defaults) {
    s.items.forEach((it, idx) => {
      if (placed.has(it.id)) return;
      const list = items.get(s.id)!;
      const prev = idx > 0 ? s.items[idx - 1].id : null;
      const at = prev ? list.findIndex((x) => x.id === prev) : -1;
      if (prev === null) list.unshift(it);
      else if (at >= 0) list.splice(at + 1, 0, it);
      else list.push(it);
      placed.add(it.id);
    });
  }
  const savedOrder = saved.sections.map((s) => s.id).filter((id) => items.has(id));
  const order: string[] = [...new Set(savedOrder)];
  defaults.forEach((s, idx) => {
    if (order.includes(s.id)) return;
    const prev = idx > 0 ? defaults[idx - 1].id : null;
    const at = prev ? order.indexOf(prev) : -1;
    if (prev === null) order.unshift(s.id); else if (at >= 0) order.splice(at + 1, 0, s.id); else order.push(s.id);
  });
  return order.map((id) => ({ ...defaults.find((s) => s.id === id)!, items: items.get(id)! }));
}

/** Moves an item to `toSection` at `toIndex` (index in the target list as rendered before the move). */
export function moveItem(layout: NavLayout, itemId: string, toSection: string, toIndex: number): NavLayout {
  const sections = layout.sections.map((s) => ({ id: s.id, items: [...s.items] }));
  const from = sections.find((s) => s.items.includes(itemId));
  const to = sections.find((s) => s.id === toSection);
  if (!from || !to) return layout;
  const oldIdx = from.items.indexOf(itemId);
  from.items.splice(oldIdx, 1);
  let idx = toIndex;
  if (from === to && oldIdx < toIndex) idx -= 1;
  to.items.splice(Math.max(0, Math.min(idx, to.items.length)), 0, itemId);
  return { v: 1, sections };
}

export function moveSection(layout: NavLayout, sectionId: string, toIndex: number): NavLayout {
  const sections = layout.sections.map((s) => ({ id: s.id, items: [...s.items] }));
  const oldIdx = sections.findIndex((s) => s.id === sectionId);
  if (oldIdx < 0) return layout;
  const [sec] = sections.splice(oldIdx, 1);
  let idx = toIndex;
  if (oldIdx < toIndex) idx -= 1;
  sections.splice(Math.max(0, Math.min(idx, sections.length)), 0, sec);
  return { v: 1, sections };
}

export function sameLayout(a: NavLayout, b: NavLayout) {
  return JSON.stringify(a.sections) === JSON.stringify(b.sections);
}

export function loadNavLayout(): NavLayout | null {
  try {
    const raw = globalThis.localStorage?.getItem(NAV_LAYOUT_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && v.v === 1 && Array.isArray(v.sections) ? v : null;
  } catch { return null; }
}

export function saveNavLayout(layout: NavLayout | null) {
  try {
    if (layout) globalThis.localStorage?.setItem(NAV_LAYOUT_KEY, JSON.stringify(layout));
    else globalThis.localStorage?.removeItem(NAV_LAYOUT_KEY);
  } catch { /* storage off: order only lasts this session */ }
}
