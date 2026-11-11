// @vitest-environment node
// PacerConfigV2 is shared memory written by the C# controller (x64) and read by the Rust hook in
// both 64-bit and 32-bit games. The two declarations must stay byte-identical; the Rust side also
// has compile-time asserts (checked for x86_64 and i686 by `npm run build:pacer`).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const cs = fs.readFileSync(path.join(root, 'electron/services/DarkHub.FrameLimiter.cs'), 'utf8');
const rs = fs.readFileSync(path.join(root, 'native_pacer/src/lib.rs'), 'utf8');

const SIZES: Record<string, number> = { uint: 4, int: 4, long: 8, ulong: 8, u32: 4, i32: 4, u64: 8, i64: 8 };

function csLayout() {
  const body = cs.slice(cs.indexOf('public struct PacerConfigV2'), cs.indexOf('class TelemetrySnapshot'));
  const size = Number(/StructLayout\(LayoutKind\.Explicit, Size = (\d+)\)\]\s*public struct PacerConfigV2/.exec(cs)?.[1]);
  const fields = [...body.matchAll(/\[FieldOffset\((\d+)\)\] public (\w+) (\w+);/g)].map((m) => ({ off: Number(m[1]), type: m[2], name: m[3] }));
  return { size, fields };
}

function rsAsserts() {
  const map: Record<string, number> = {};
  for (const m of rs.matchAll(/assert!\(std::mem::offset_of!\(PacerConfigV2, (\w+)\) == (\d+)\);/g)) map[m[1]] = Number(m[2]);
  const size = Number(/assert!\(std::mem::size_of::<PacerConfigV2>\(\) == (\d+)\);/.exec(rs)?.[1]);
  const body = rs.slice(rs.indexOf('pub struct PacerConfigV2'), rs.indexOf('const _: () = {', rs.indexOf('pub struct PacerConfigV2')));
  const types: Record<string, string> = {};
  for (const m of body.matchAll(/pub (\w+): ([\w;[\] ]+),/g)) types[m[1]] = m[2];
  return { map, size, types };
}

describe('PacerConfigV2 layout (C# controller <-> Rust hook)', () => {
  it('has the same size on both sides', () => {
    expect(csLayout().size).toBe(64);
    expect(rsAsserts().size).toBe(64);
  });

  it('every named field has the same offset and width', () => {
    const { fields } = csLayout();
    const { map, types } = rsAsserts();
    const named = fields.filter((f) => !f.name.startsWith('reserved'));
    expect(named.map((f) => f.name)).toEqual(['magic', 'version', 'size', 'enabled', 'target_fps', 'pacing_mode', 'heartbeat_qpc', 'adapter_luid', 'controller_pid', 'flags']);
    for (const f of named) {
      expect(map[f.name], f.name).toBe(f.off);
      expect(SIZES[types[f.name]], f.name).toBe(SIZES[f.type]);
    }
    // 64-bit fields are 8-aligned so a 32-bit hook can read them atomically.
    for (const f of fields.filter((x) => SIZES[x.type] === 8)) expect(f.off % 8, f.name).toBe(0);
  });

  it('fields do not overlap and fill the block', () => {
    const { fields, size } = csLayout();
    const sorted = [...fields].sort((a, b) => a.off - b.off);
    let end = 0;
    for (const f of sorted) {
      expect(f.off, f.name).toBeGreaterThanOrEqual(end);
      end = f.off + SIZES[f.type];
    }
    expect(end).toBe(size);
  });

  it('uses the v2 mapping name on both sides (a v1 hook never reads a v2 block)', () => {
    expect(cs).toContain('"DarkHub_Pacer_Config2"');
    expect(rs).toContain('"DarkHub_Pacer_Config2\\0"');
    expect(cs).not.toMatch(/"DarkHub_Pacer_Config"/);
  });
});
