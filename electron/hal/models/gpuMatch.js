// GPU identity helpers shared by the main process and the renderer (pure, no imports): name matching across providers
// (DXGI, nvidia-smi, WMI/systeminformation, LHM, NVML) and which GPU a single-GPU view should show.

/** Name reduced to model letters/digits ("NVIDIA GeForce RTX 4060 Ti" -> "rtx4060ti"). */
export const gpuKey = (s) => String(s || '').toLowerCase().replace(/\(r\)|\(tm\)|graphics|corporation|nvidia|amd|ati|intel|radeon|geforce|[^a-z0-9]/g, '')

// what is left over when one name contains the other: a model suffix or more digits means another card
// ("rtx4060" inside "rtx4060ti", "rx7900xt" inside "rx7900xtx", "rx780" inside "rx7800")
const OTHER_MODEL = /^(ti|super|x|gre|\d)/

/** Loose match of two GPU names; never pairs a card with its Ti/Super/XT sibling. */
export function sameGpu(a, b) {
  const x = gpuKey(a), y = gpuKey(b)
  if (!x || !y) return false
  if (x === y) return true
  const [short, long] = x.length <= y.length ? [x, y] : [y, x]
  const at = long.indexOf(short)
  if (at < 0) return false
  return !OTHER_MODEL.test(long.slice(at + short.length))
}

/**
 * Pairs every name of `a` with at most one name of `b` (index into b, or -1). Exact normalized names first, then the
 * loose match; a `b` entry is never used twice, so two identical cards get one row each.
 */
export function pairGpus(a = [], b = []) {
  const ka = a.map(gpuKey), kb = b.map(gpuKey)
  const out = a.map(() => -1)
  const used = new Set()
  const passes = [(i, j) => ka[i] !== '' && ka[i] === kb[j], (i, j) => sameGpu(a[i], b[j])]
  for (const match of passes) {
    for (let i = 0; i < a.length; i++) {
      if (out[i] >= 0) continue
      const j = b.findIndex((_, jj) => !used.has(jj) && match(i, jj))
      if (j >= 0) { out[i] = j; used.add(j) }
    }
  }
  return out
}

const num = (x) => {
  const v = x && typeof x === 'object' && 'value' in x ? x.value : x
  const n = Number(v)
  return v == null || v === '' || !Number.isFinite(n) ? null : n
}
const IGNORED = /microsoft basic|basic render|basic display|remote display/i
const NVIDIA = /nvidia|geforce|quadro|tesla|\brtx\b|\bgtx\b/i

/**
 * Index of the GPU a single-GPU view should show in a HardwareService gpu list ({ name, vramTotal, utilization }), or
 * -1. `preferName` (e.g. the adapter a benchmark runs on) wins when present; otherwise the discrete card: NVIDIA first,
 * then the most dedicated memory, then the highest load. Microsoft software adapters come last.
 */
export function primaryGpuIndex(gpus, { preferName = null } = {}) {
  if (!Array.isArray(gpus) || !gpus.length) return -1
  if (preferName) {
    const names = gpus.map((g) => g?.name)
    const exact = names.findIndex((n) => gpuKey(n) !== '' && gpuKey(n) === gpuKey(preferName))
    if (exact >= 0) return exact
    const loose = names.findIndex((n) => sameGpu(n, preferName))
    if (loose >= 0) return loose
  }
  const rank = (g) => [
    IGNORED.test(String(g?.name || '')) ? 0 : 1,
    NVIDIA.test(String(g?.name || '')) ? 1 : 0,
    num(g?.vramTotal) ?? num(g?.vramTotalMb) ?? -1,
    num(g?.utilization) ?? num(g?.load) ?? -1
  ]
  let best = 0
  let bestRank = rank(gpus[0])
  for (let i = 1; i < gpus.length; i++) {
    const r = rank(gpus[i])
    const k = r.findIndex((v, d) => v !== bestRank[d])
    if (k >= 0 && r[k] > bestRank[k]) { best = i; bestRank = r }
  }
  return best
}

/** The GPU entry primaryGpuIndex() picks, or null. */
export function pickPrimaryGpu(gpus, opts) {
  const i = primaryGpuIndex(gpus, opts)
  return i < 0 ? null : gpus[i]
}
