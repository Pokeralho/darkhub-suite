// The built-in tweaks and operations a package can reference, with the rule for each operation. One list for the app,
// the validator, the generated docs and the Hub server (exported as builtins.json by `npm run hub:docs`).

/** One-time actions that are harmless to run from a package (nothing to undo). */
const SAFE_ACTIONS = new Set(['op:flushDns', 'op:cleanTemp', 'op:optimizeRAM', 'op:optimizeAudioLatency'])
/** Operations only official packages may run (removes software, no way back). */
const OFFICIAL_ONLY = new Set(['op:deepCleanOneDrive'])

const RISK = { safe: 'low', moderate: 'medium', advanced: 'high' }

/**
 * Map id -> entry. Tweaks: 'tweak:x' -> { kind: 'tweak', title, risk, securityRelated, ... }.
 * Operations: 'op:x' -> { kind: 'op', title, risk, securityRelated, reversible, packageUse, tweakIds }.
 * packageUse: 'yes' (community packages), 'official' (official packages only), 'no' (never: changes the system with no
 * way back, like switching to the Balanced plan without remembering the previous one).
 */
export function buildBuiltins(tweaks, optimizer) {
  const map = new Map()
  for (const t of tweaks.listTweaks()) {
    map.set(t.id, {
      kind: 'tweak', title: t.title, description: t.description || '', category: t.category, risk: t.risk || 'low',
      securityRelated: Boolean(t.securityRelated), requiresReboot: Boolean(t.requiresReboot), internal: false
    })
  }
  for (const op of optimizer ? optimizer.operations.values() : []) {
    if (op.isRevert || op.id.startsWith('optimizer:revert:')) continue
    const id = `op:${op.id.replace(/^optimizer:/, '')}`
    const reversible = Boolean(op.isReversible && typeof op.revert === 'function')
    const securityRelated = Boolean(op.securityRelated)
    const packageUse = securityRelated || OFFICIAL_ONLY.has(id) ? 'official' : reversible || SAFE_ACTIONS.has(id) ? 'yes' : 'no'
    map.set(id, {
      kind: 'op', opId: op.id, title: op.name, description: op.description || '', category: op.category,
      risk: RISK[op.risk] || 'medium', securityRelated, reversible, packageUse, requiresReboot: Boolean(op.requiresReboot),
      tweakIds: Array.isArray(op.tweakIds) ? op.tweakIds.filter((x) => x.startsWith('tweak:')) : null
    })
  }
  // an operation that wraps internal tweak groups (group:*) runs as an operation, not as tweaks
  for (const e of map.values()) {
    if (e.kind === 'op' && e.tweakIds && optimizer) {
      const op = optimizer.operations.get(e.opId)
      if (op.tweakIds.some((x) => !x.startsWith('tweak:'))) e.tweakIds = null
    }
  }
  return map
}

/** Plain JSON for the Hub server (no functions, stable order). */
export function builtinsJson(map) {
  return Object.fromEntries([...map].sort(([a], [b]) => a.localeCompare(b)).map(([id, e]) => [id, {
    kind: e.kind, title: e.title, risk: e.risk, securityRelated: e.securityRelated,
    ...(e.kind === 'op' ? { reversible: e.reversible, packageUse: e.packageUse, tweakIds: e.tweakIds } : {})
  }]))
}

/** Back from builtins.json (server side). */
export function builtinsFromJson(obj) {
  return new Map(Object.entries(obj || {}).map(([id, e]) => [id, { ...e, internal: false }]))
}
