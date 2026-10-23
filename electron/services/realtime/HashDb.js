// Known-bad SHA-256 set: one sorted Buffer of 32-byte records searched by binary search. 100k hashes take 3.2 MB and
// a lookup is ~17 comparisons, with no per-entry JS objects for the garbage collector to walk.
const HEX64 = /^[0-9a-f]{64}$/

// EICAR anti-malware test file (eicar.org): lets the user check that protection works without real malware.
export const EICAR_SHA256 = '275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f'

export class HashDb {
  /** @param {Iterable<{sha256: string, name?: string}>} entries */
  constructor(entries = []) {
    const hashes = new Set()
    this.names = new Map() // only entries that carry a detection name
    for (const e of entries) {
      const hex = String(e?.sha256 ?? '').trim().toLowerCase()
      if (!HEX64.test(hex)) continue
      hashes.add(hex)
      const name = String(e.name || '').slice(0, 120)
      if (name && !this.names.has(hex)) this.names.set(hex, name)
    }
    const sorted = [...hashes].sort()
    this.buf = Buffer.alloc(sorted.length * 32)
    sorted.forEach((hex, i) => this.buf.write(hex, i * 32, 'hex'))
    this.size = sorted.length
  }

  /** Detection name for a hash, or null when it is not in the set. */
  lookup(hex) {
    const key = String(hex || '').toLowerCase()
    if (!HEX64.test(key) || !this.size) return null
    const needle = Buffer.from(key, 'hex')
    let lo = 0
    let hi = this.size - 1
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1
      const c = this.buf.compare(needle, 0, 32, mid * 32, mid * 32 + 32)
      if (c === 0) return this.names.get(key) || 'Known malware (hash)'
      if (c > 0) hi = mid - 1
      else lo = mid + 1
    }
    return null
  }
}
