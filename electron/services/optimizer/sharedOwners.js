// Several Optimizer operations change the same thing (fsutil last-access, the BCD dynamic tick, MMCSS, hibernation).
// Each operation that applied successfully "claims" the pieces it changed; reverting one operation only restores
// the pieces no other still-applied operation claims, so undoing one never silently undoes another.
// `store` is DeepTweaksEngine (getExtra/saveExtra/clearExtra), passed in so tests can use a plain object.

const OWNERS_KEY = 'sys:owners';
const appliedKey = (opId) => `sys:applied:${opId}`;

function readOwners(store) {
  const o = store.getExtra(OWNERS_KEY);
  return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
}

/** Other operations (not `opId`) that still claim `piece`. */
export function heldByOthers(store, opId, piece) {
  const list = readOwners(store)[piece];
  return Array.isArray(list) ? list.filter((x) => x !== opId) : [];
}

/** Splits `pieces` into the ones `opId` may restore and the ones another operation still needs. */
export function partitionShared(store, opId, pieces) {
  const free = [];
  const kept = [];
  for (const p of pieces) (heldByOthers(store, opId, p).length ? kept : free).push(p);
  return { free, kept };
}

export function claimShared(store, opId, pieces) {
  const o = { ...readOwners(store) };
  for (const p of pieces) o[p] = [...new Set([...(Array.isArray(o[p]) ? o[p] : []), opId])];
  store.saveExtra(OWNERS_KEY, o);
}

export function releaseShared(store, opId, pieces) {
  const o = { ...readOwners(store) };
  for (const p of pieces) {
    const left = (Array.isArray(o[p]) ? o[p] : []).filter((x) => x !== opId);
    if (left.length) o[p] = left; else delete o[p];
  }
  if (Object.keys(o).length) store.saveExtra(OWNERS_KEY, o); else store.clearExtra(OWNERS_KEY);
}

/** Recorded only after the change was verified; the status of snapshot-based operations reads this marker. */
export function markApplied(store, opId) { store.saveExtra(appliedKey(opId), true); }
export function clearApplied(store, opId) { store.clearExtra(appliedKey(opId)); }
export function isApplied(store, opId) { return store.getExtra(appliedKey(opId)) === true; }
export const APPLIED_EXTRA = appliedKey;
