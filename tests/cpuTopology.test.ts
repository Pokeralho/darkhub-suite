// @vitest-environment node
// CPU topology selection of DarkHub.LatencyEngine.cs (p-core / CCD affinity mask) on hardware this machine doesn't
// have: hybrid Intel, dual-CCD and X3D Ryzen, >64 logical processors, API failure. The engine source is compiled
// together with tests/native/CpuTopologyHarness.cs (csc /main:) and fed hand-built
// SYSTEM_LOGICAL_PROCESSOR_INFORMATION_EX buffers (Windows layout, x64 and x86 KAFFINITY) or parsed records.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'

const CSC = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'
const canRun = process.platform === 'win32' && fs.existsSync(CSC)
const root = path.resolve(__dirname, '..')
let dir = ''
let exe = ''

beforeAll(() => {
  if (!canRun) return
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-topo-'))
  exe = path.join(dir, 'CpuTopologyHarness.exe')
  execFileSync(CSC, ['-nologo', '/target:exe', '/platform:x64', '/main:CpuTopologyHarness', `/out:${exe}`,
    path.join(root, 'electron', 'services', 'DarkHub.LatencyEngine.cs'),
    path.join(root, 'tests', 'native', 'CpuTopologyHarness.cs')], { stdio: 'pipe', windowsHide: true })
}, 120_000)

afterAll(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }) })

type Topo = { logical_cores: number; all_cores_mask_hex: string; p_core_mask_hex: string; p_core_mask_ulong: string; topology_source: string; hybrid: boolean; l3_groups: number }
type Out = { cores: { mask: string; eff: number }[]; l3: { mask: string; size: number }[]; topo: Topo; error?: string }

function run(cmds: string[]): Out[] {
  const r = spawnSync(exe, [], { input: cmds.join('\n') + '\n', encoding: 'utf8', windowsHide: true, timeout: 30_000 })
  const lines = r.stdout.split(/\r?\n/).filter(Boolean)
  expect(lines.length).toBe(cmds.length)
  const out = lines.map((l) => JSON.parse(l) as Out)
  for (const o of out) expect(o.error).toBeUndefined()
  return out
}
const one = (cmd: string) => run([cmd])[0]

// ---- SYSTEM_LOGICAL_PROCESSOR_INFORMATION_EX builder (little endian, same layout as winnt.h) ----
type Aff = { mask: bigint; group?: number }
const REL_CORE = 0, REL_NUMA = 1, REL_CACHE = 2, REL_PACKAGE = 3, REL_GROUP = 4
const MB = 1024 * 1024

function groupAffinity(ptr: 4 | 8, a: Aff): Buffer {
  const b = Buffer.alloc(ptr === 8 ? 16 : 12) // KAFFINITY Mask; WORD Group; WORD Reserved[3]
  if (ptr === 8) b.writeBigUInt64LE(a.mask, 0); else b.writeUInt32LE(Number(a.mask & 0xffffffffn), 0)
  b.writeUInt16LE(a.group ?? 0, ptr)
  return b
}
function entry(rel: number, body: Buffer, pad = 0): Buffer {
  const size = 8 + body.length + pad
  const b = Buffer.alloc(size)
  b.writeInt32LE(rel, 0); b.writeInt32LE(size, 4)
  body.copy(b, 8)
  return b
}
// PROCESSOR_RELATIONSHIP: BYTE Flags; BYTE EfficiencyClass; BYTE Reserved[20]; WORD GroupCount; GROUP_AFFINITY GroupMask[]
function core(ptr: 4 | 8, eff: number, affs: Aff[], smt = false): Buffer {
  const head = Buffer.alloc(24)
  head[0] = smt ? 1 : 0 // LTP_PC_SMT
  head[1] = eff
  head.writeUInt16LE(affs.length, 22)
  return entry(REL_CORE, Buffer.concat([head, ...affs.map((a) => groupAffinity(ptr, a))]))
}
// CACHE_RELATIONSHIP: BYTE Level; BYTE Associativity; WORD LineSize; DWORD CacheSize; PROCESSOR_CACHE_TYPE Type;
// BYTE Reserved[18]; WORD GroupCount (Win11; 0 = reserved on Win10); GROUP_AFFINITY GroupMask[]
function cache(ptr: 4 | 8, level: number, size: number, affs: Aff[], opts: { type?: number; win10?: boolean } = {}): Buffer {
  const head = Buffer.alloc(32)
  head[0] = level; head[1] = 16; head.writeUInt16LE(64, 2)
  head.writeUInt32LE(size, 4)
  head.writeInt32LE(opts.type ?? 0 /* CacheUnified */, 8)
  head.writeUInt16LE(opts.win10 ? 0 : affs.length, 30)
  return entry(REL_CACHE, Buffer.concat([head, ...affs.map((a) => groupAffinity(ptr, a))]))
}
const noise = (rel: number) => entry(rel, Buffer.alloc(72, 0xff)) // NUMA / package / group records the parser must skip

const bit = (i: number) => 1n << BigInt(i)
const range = (from: number, count: number) => { let m = 0n; for (let i = 0; i < count; i++) m |= bit(from + i); return m }
const hex = (m: bigint) => '0x' + m.toString(16).toUpperCase()

/** n cores, `threads` logical each, consecutive bits from `first`, one entry per core. */
function cores(ptr: 4 | 8, eff: number, first: number, n: number, threads: number, group = 0): Buffer[] {
  return Array.from({ length: n }, (_, i) => core(ptr, eff, [{ mask: range(first + i * threads, threads), group }], threads > 1))
}
/** L1d/L1i/L2 per core are noise for the selector; include a few so level filtering is exercised. */
function lowCaches(ptr: 4 | 8, mask: bigint): Buffer[] {
  return [cache(ptr, 1, 48 * 1024, [{ mask }], { type: 2 }), cache(ptr, 1, 32 * 1024, [{ mask }], { type: 1 }), cache(ptr, 2, 2 * MB, [{ mask }])]
}
const buf = (ptr: 4 | 8, logical: number, parts: Buffer[]) => `buf ${ptr} ${logical} ${Buffer.concat(parts).toString('hex')}`

describe.skipIf(!canRun)('LatencyEngine CPU topology (synthetic hardware)', () => {
  it('i9-13900K: 8 P-cores with HT + 16 E-cores -> P mask 0xFFFF', () => {
    const p = 8
    const o = one(buf(p, 32, [
      noise(REL_PACKAGE), noise(REL_GROUP),
      ...cores(p, 1, 0, 8, 2), ...cores(p, 0, 16, 16, 1),
      ...lowCaches(p, range(0, 2)), cache(p, 3, 36 * MB, [{ mask: range(0, 32) }]), noise(REL_NUMA),
    ]))
    expect(o.cores).toHaveLength(24)
    expect(o.l3).toEqual([{ mask: '0xFFFFFFFF', size: 36 * MB }])
    expect(o.topo).toMatchObject({ all_cores_mask_hex: '0xFFFFFFFF', p_core_mask_hex: '0xFFFF', p_core_mask_ulong: '65535', topology_source: 'efficiency_class', hybrid: true, l3_groups: 1, logical_cores: 32 })
  })

  it('i5-12400: 6 P-cores only (no E-cores) -> every core, not hybrid', () => {
    const o = one(buf(8, 12, [...cores(8, 0, 0, 6, 2), cache(8, 3, 18 * MB, [{ mask: range(0, 12) }])]))
    expect(o.topo).toMatchObject({ all_cores_mask_hex: '0xFFF', p_core_mask_hex: '0xFFF', topology_source: 'uniform', hybrid: false, l3_groups: 1 })
  })

  it('Core Ultra 9 285K: 8 P-cores without HT + 16 E-cores interleaved in the logical order', () => {
    // Arrow Lake enumerates P and E clusters interleaved; P = PP EEEE PP EEEE PP EEEE PP EEEE (bits)
    const parts: Buffer[] = []
    let pMask = 0n
    let lp = 0
    for (let cluster = 0; cluster < 4; cluster++) {
      for (let i = 0; i < 2; i++) { parts.push(core(8, 1, [{ mask: bit(lp) }])); pMask |= bit(lp++) }
      for (let i = 0; i < 4; i++) parts.push(core(8, 0, [{ mask: bit(lp++) }]))
    }
    parts.push(cache(8, 3, 36 * MB, [{ mask: range(0, 24) }]))
    const o = one(buf(8, 24, parts))
    expect(hex(pMask)).toBe('0xC30C3')
    expect(o.topo).toMatchObject({ all_cores_mask_hex: '0xFFFFFF', p_core_mask_hex: '0xC30C3', hybrid: true, topology_source: 'efficiency_class' })
  })

  it('three efficiency classes (P / E / LP-E, Meteor Lake style) -> only the highest class', () => {
    const o = one(buf(8, 22, [...cores(8, 2, 0, 6, 2), ...cores(8, 1, 12, 8, 1), ...cores(8, 0, 20, 2, 1)]))
    expect(o.topo).toMatchObject({ p_core_mask_hex: '0xFFF', all_cores_mask_hex: '0x3FFFFF', hybrid: true })
  })

  it('Ryzen 9 7950X: two CCDs with equal L3 -> first CCD', () => {
    const o = one(buf(8, 32, [
      ...cores(8, 0, 0, 16, 2), ...lowCaches(8, range(0, 2)),
      cache(8, 3, 32 * MB, [{ mask: range(0, 16) }]), cache(8, 3, 32 * MB, [{ mask: range(16, 16) }]),
    ]))
    expect(o.l3).toHaveLength(2)
    expect(o.topo).toMatchObject({ all_cores_mask_hex: '0xFFFFFFFF', p_core_mask_hex: '0xFFFF', topology_source: 'l3_group', hybrid: false, l3_groups: 2 })
  })

  it('Ryzen 9 7950X3D: V-Cache CCD0 (96 MB) -> CCD0', () => {
    const o = one(buf(8, 32, [...cores(8, 0, 0, 16, 2), cache(8, 3, 96 * MB, [{ mask: range(0, 16) }]), cache(8, 3, 32 * MB, [{ mask: range(16, 16) }])]))
    expect(o.topo).toMatchObject({ p_core_mask_hex: '0xFFFF', topology_source: 'l3_group' })
  })

  it('X3D with the V-Cache on CCD1 -> CCD1', () => {
    const o = one(buf(8, 32, [...cores(8, 0, 0, 16, 2), cache(8, 3, 32 * MB, [{ mask: range(0, 16) }]), cache(8, 3, 96 * MB, [{ mask: range(16, 16) }])]))
    expect(o.topo).toMatchObject({ p_core_mask_hex: '0xFFFF0000', topology_source: 'l3_group' })
  })

  it('Windows 10 cache records (GroupCount reserved = 0, single GroupMask) still parse', () => {
    const o = one(buf(8, 32, [...cores(8, 0, 0, 16, 2), cache(8, 3, 32 * MB, [{ mask: range(0, 16) }], { win10: true }), cache(8, 3, 96 * MB, [{ mask: range(16, 16) }], { win10: true })]))
    expect(o.l3.map((c) => c.mask)).toEqual(['0xFFFF', '0xFFFF0000'])
    expect(o.topo.p_core_mask_hex).toBe('0xFFFF0000')
  })

  it('128-thread Threadripper (2 processor groups) -> group 0 only, masks never mix groups', () => {
    const parts: Buffer[] = [noise(REL_GROUP)]
    parts.push(...cores(8, 0, 0, 32, 2, 0)) // group 0: logical 0..63
    parts.push(...cores(8, 0, 0, 32, 2, 1)) // group 1: same bit positions, other group
    for (let ccd = 0; ccd < 8; ccd++) {
      const g = ccd < 4 ? 0 : 1
      parts.push(cache(8, 3, 32 * MB, [{ mask: range((ccd % 4) * 16, 16), group: g }]))
    }
    // a Win11 L3 record spanning both groups: only its group-0 GROUP_AFFINITY counts
    parts.push(cache(8, 2, 1 * MB, [{ mask: 0xFn, group: 1 }, { mask: 0xF0n, group: 0 }]))
    const o = one(buf(8, 64, parts))
    expect(o.cores).toHaveLength(32)
    expect(o.l3).toHaveLength(4)
    expect(o.topo).toMatchObject({ logical_cores: 64, all_cores_mask_hex: '0xFFFFFFFFFFFFFFFF', p_core_mask_hex: '0xFFFF', p_core_mask_ulong: '65535', topology_source: 'l3_group' })
  })

  it('GroupMask array: a record with several GROUP_AFFINITY entries ORs only the group-0 ones', () => {
    const o = one(buf(8, 64, [core(8, 0, [{ mask: 0xFF00n, group: 1 }, { mask: 0x3n, group: 0 }, { mask: 0xF0000n, group: 2 }])]))
    expect(o.cores).toEqual([{ mask: '0x3', eff: 0 }])
  })

  it('x86 layout (4-byte KAFFINITY, 12-byte GROUP_AFFINITY) gives the same answers', () => {
    const o = one(buf(4, 32, [...cores(4, 0, 0, 16, 2), cache(4, 3, 32 * MB, [{ mask: range(0, 16) }]), cache(4, 3, 96 * MB, [{ mask: range(16, 16) }]), noise(REL_NUMA)]))
    expect(o.cores).toHaveLength(16)
    expect(o.topo).toMatchObject({ all_cores_mask_hex: '0xFFFFFFFF', p_core_mask_hex: '0xFFFF0000' })
    const h = one(buf(4, 32, [...cores(4, 1, 0, 8, 2), ...cores(4, 0, 16, 16, 1)]))
    expect(h.topo).toMatchObject({ p_core_mask_hex: '0xFFFF', hybrid: true })
  })

  it('padded records (Size larger than the struct) are walked by Size', () => {
    const padded = (b: Buffer) => { const p = Buffer.alloc(b.length + 24); b.copy(p); p.writeInt32LE(b.length + 24, 4); return p }
    const o = one(buf(8, 16, [...cores(8, 0, 0, 8, 2).map(padded), padded(cache(8, 3, 32 * MB, [{ mask: range(0, 16) }]))]))
    expect(o.cores).toHaveLength(8)
    expect(o.topo).toMatchObject({ all_cores_mask_hex: '0xFFFF', topology_source: 'uniform', l3_groups: 1 })
  })

  it('truncated / corrupt buffers stop parsing without throwing', () => {
    const good = Buffer.concat(cores(8, 0, 0, 4, 2))
    const cut = good.subarray(0, good.length - 5).toString('hex')
    const o = one(`buf 8 8 ${cut}`)
    expect(o.cores).toHaveLength(3)
    const bad = Buffer.alloc(16); bad.writeInt32LE(REL_CORE, 0); bad.writeInt32LE(0, 4) // Size 0
    expect(one(`buf 8 8 ${bad.toString('hex')}`).topo.topology_source).toBe('fallback')
    // header claims GroupCount 5 but the record holds one GROUP_AFFINITY: reads stay inside the record
    const lying = core(8, 0, [{ mask: 0x3n }]); lying.writeUInt16LE(5, 30)
    expect(one(`buf 8 2 ${lying.toString('hex')}`).cores).toEqual([{ mask: '0x3', eff: 0 }])
  })

  it('API failure falls back to every logical processor (capped at 64)', () => {
    const [a, b, c] = run(['fail 16', 'fail 128', 'buf 8 8 '])
    expect(a.topo).toMatchObject({ all_cores_mask_hex: '0xFFFF', p_core_mask_hex: '0xFFFF', topology_source: 'fallback', hybrid: false, l3_groups: 0 })
    expect(b.topo).toMatchObject({ all_cores_mask_hex: '0xFFFFFFFFFFFFFFFF', p_core_mask_hex: '0xFFFFFFFFFFFFFFFF', p_core_mask_ulong: '18446744073709551615' })
    expect(c.topo).toMatchObject({ topology_source: 'fallback', all_cores_mask_hex: '0xFF' })
  })

  it('pure selector over records: hybrid wins over L3, L3 mask is clipped to known cores', () => {
    const [h, clip, onlyL3] = run([
      'records 24 FF:1,FFFF00:0 FFFF:16777216,FF0000:67108864',
      'records 32 FFFF:0,FFFF0000:0 FFFF:33554432,FFFFFFFF00000000:100663296',
      'records 8 - FF:33554432,FF00:100663296',
    ])
    expect(h.topo).toMatchObject({ p_core_mask_hex: '0xFF', topology_source: 'efficiency_class', l3_groups: 2 })
    // largest L3 doesn't intersect any core -> keep every core
    expect(clip.topo).toMatchObject({ p_core_mask_hex: '0xFFFFFFFF', topology_source: 'uniform' })
    expect(onlyL3.topo).toMatchObject({ topology_source: 'fallback', p_core_mask_hex: '0xFF', l3_groups: 0 })
  })
})
