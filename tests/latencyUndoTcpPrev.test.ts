import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// @ts-ignore plain JS module
import { normalizeTcpPrev, persistableUndo, parseUndoRecord } from '../electron/services/latencyUndoStore.js';

// VM round43: a crash/disable revert set timestamps to "default" (DarkOS ships them off) and never reset the SYN
// retries (netsh refuses "maxsynretransmissions=default"); the previous values are now kept and validated.
describe('Ultra TCP stack previous values', () => {
  it('keeps only values netsh accepts', () => {
    expect(normalizeTcpPrev({ timestamps: 'Disabled', ecn: 'Enabled', maxSyn: 4 })).toEqual({ timestamps: 'disabled', ecn: 'enabled', maxSyn: 4 });
    expect(normalizeTcpPrev({ timestamps: 'Allowed', ecn: 'Allowed', maxSyn: 1 })).toEqual({ timestamps: 'allowed' });
    expect(normalizeTcpPrev({ timestamps: 'disabled & calc', ecn: '"x"', maxSyn: '4; rm' })).toBeNull();
    expect(normalizeTcpPrev(null)).toBeNull();
  });

  it('persists them with the undo record and drops a tampered copy', () => {
    const rec = persistableUndo({ tcpStack: { optimized: true, rscPrev: 'enabled', prev: { timestamps: 'disabled', ecn: 'disabled', maxSyn: 4 } } });
    expect(rec.undo.tcpStack).toEqual({ optimized: true, rscPrev: 'enabled', prev: { timestamps: 'disabled', ecn: 'disabled', maxSyn: 4 } });
    const tampered = JSON.parse(JSON.stringify(rec));
    tampered.undo.tcpStack.prev = { timestamps: 'disabled | x', maxSyn: 99 };
    expect(parseUndoRecord(JSON.stringify(tampered)).undo.tcpStack).toEqual({ optimized: true, rscPrev: 'enabled' });
  });

  it('guardian scripts: Nagle key not double-braced, DHCP DNS kept as DHCP, no "maxsynretransmissions=default"', () => {
    const src = fs.readFileSync(path.join(__dirname, '../electron/latencyGuardian.js'), 'utf8');
    expect(src).not.toMatch(/InterfaceGuid\.ToString\(\)/);
    expect(src).toMatch(/InterfaceGuid\)\.Trim\('\{\}'\)/);
    expect(src).not.toMatch(/set global maxsynretransmissions=default/);
    expect(src).toMatch(/restoreGlobalTcpStack\(u\.tcpStack\.rscPrev, u\.tcpStack\.prev\)/);
    expect(src).toMatch(/-Name NameServer/);
  });
});
