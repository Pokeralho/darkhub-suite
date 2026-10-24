import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';

vi.mock('electron', () => ({ default: { app: { getPath: () => '/tmp/dh-test', isPackaged: false } }, app: { getPath: () => '/tmp/dh-test', isPackaged: false } }));

import {
  assertSafeHost,
  parsePingTime,
  parsePingOutput,
  computeLatencyStats,
  parseTracertOutput,
  gradeBufferbloat,
  findMaxPayload,
  planAdapterTweak,
  mergeSnapshot,
  buildAdvancedPropertySetScript,
  buildQosApplyScript,
  qosPolicyName,
  normalizeState,
  LATENCY_PRESETS,
  NetLatencyService
  // @ts-ignore plain JS module
} from '../electron/services/NetLatencyService.js';
// @ts-ignore plain JS module
import DeepTweaks from '../electron/services/optimizer/DeepTweaksEngine.js';
import { networkMessages } from '../src/i18n/networkMessages';

const PING_PT = `
Disparando 1.1.1.1 com 32 bytes de dados:
Resposta de 1.1.1.1: bytes=32 tempo=10ms TTL=52
Esgotado o tempo limite do pedido.
Resposta de 1.1.1.1: bytes=32 tempo<1ms TTL=52

Estatisticas do Ping para 1.1.1.1:
    Pacotes: Enviados = 3, Recebidos = 2, Perdidos = 1 (33% de perda),
    Minimo = 0ms, Maximo = 10ms, Media = 5ms
`;
const PING_EN = 'Reply from 8.8.8.8: bytes=32 time=14ms TTL=117\r\nReply from 8.8.8.8: bytes=32 time=15ms TTL=117\r\n    Minimum = 14ms, Maximum = 15ms, Average = 14ms';
const PING_FRAG = 'Disparando 1.1.1.1 com 1500 bytes de dados:\nO pacote precisa ser fragmentado, mas a desfragmentacao esta ativa.\n';

describe('ping parsing', () => {
  it('reads RTT in pt-BR and en-US, "<1ms" and ignores summary lines', () => {
    expect(parsePingTime('Resposta de 1.1.1.1: bytes=32 tempo=10ms TTL=52')).toBe(10);
    expect(parsePingTime('Reply from 1.1.1.1: bytes=32 time<1ms TTL=52')).toBe(0.5);
    expect(parsePingTime('bytes=32 TTL=52')).toBeNull();
    expect(parsePingOutput(PING_PT)).toEqual([10, 0.5]);
    expect(parsePingOutput(PING_EN)).toEqual([14, 15]);
    expect(parsePingOutput(PING_FRAG)).toEqual([]);
  });
});

describe('latency stats', () => {
  it('computes loss, jitter and percentiles', () => {
    const s = computeLatencyStats([10, 12, null, 14, 10]);
    expect(s.received).toBe(4);
    expect(s.lossPct).toBe(20);
    expect(s.min).toBe(10);
    expect(s.max).toBe(14);
    expect(s.avg).toBe(11.5);
    expect(s.jitter).toBe(Math.round(((2 + 2 + 4) / 3) * 10) / 10);
    expect(s.p95).toBe(14);
  });
  it('handles all lost / empty', () => {
    expect(computeLatencyStats([null, null]).lossPct).toBe(100);
    expect(computeLatencyStats([]).lossPct).toBe(0);
  });
});

describe('tracert parsing', () => {
  it('parses hops, timeouts and <1 ms', () => {
    const out = `Rastreando a rota para 1.1.1.1 com no maximo 4 saltos

  1    <1 ms    <1 ms    <1 ms  192.168.3.1
  2     *        *        *     Esgotado o tempo limite do pedido.
  3     1 ms     2 ms     *     10.20.20.241
 12    25 ms    24 ms    26 ms  1.1.1.1

Rastreamento concluido.`;
    const hops = parseTracertOutput(out);
    expect(hops).toHaveLength(4);
    expect(hops[0]).toEqual({ hop: 1, rtts: [0.5, 0.5, 0.5], ip: '192.168.3.1', best: 0.5 });
    expect(hops[1]).toEqual({ hop: 2, rtts: [null, null, null], ip: null, best: null });
    expect(hops[2]).toEqual({ hop: 3, rtts: [1, 2, null], ip: '10.20.20.241', best: 1 });
    expect(hops[3].hop).toBe(12);
    expect(hops[3].best).toBe(24);
  });
});

describe('bufferbloat grade', () => {
  it('grades the added latency', () => {
    expect(gradeBufferbloat(10, 12)).toEqual({ added: 2, grade: 'A+' });
    expect(gradeBufferbloat(10, 35)).toEqual({ added: 25, grade: 'A' });
    expect(gradeBufferbloat(10, 60)).toEqual({ added: 50, grade: 'B' });
    expect(gradeBufferbloat(10, 150)).toEqual({ added: 140, grade: 'C' });
    expect(gradeBufferbloat(10, 500)).toEqual({ added: 490, grade: 'F' });
    expect(gradeBufferbloat(20, 15).added).toBe(0);
    expect(gradeBufferbloat(NaN, 10).grade).toBe('?');
  });
});

describe('MTU binary search', () => {
  it('finds the largest DF payload', async () => {
    const r = await findMaxPayload(async (s: number) => s <= 1464); // PPPoE: MTU 1492
    expect(r).toMatchObject({ payload: 1464, mtu: 1492 });
    expect(r.probes).toBeLessThanOrEqual(13);
  });
  it('short-circuits on a full 1500 path and fails cleanly', async () => {
    expect(await findMaxPayload(async () => true)).toMatchObject({ mtu: 1500, probes: 1 });
    expect(await findMaxPayload(async () => false)).toMatchObject({ mtu: null });
  });
});

describe('host validation', () => {
  it('rejects shell metacharacters and option injection', () => {
    expect(assertSafeHost(' 1.1.1.1 ')).toBe('1.1.1.1');
    expect(() => assertSafeHost('1.1.1.1 & calc')).toThrow();
    expect(() => assertSafeHost('-n 100 host')).toThrow();
    expect(() => assertSafeHost('-t')).toThrow();
    for (const p of LATENCY_PRESETS) expect(assertSafeHost(p.host)).toBe(p.host);
  });
});

const ADAPTERS = [
  { name: 'Ethernet', props: { '*InterruptModeration': { value: '1', valid: ['0', '1'] }, '*FlowControl': { value: '3', valid: ['0', '3'] } } },
  { name: 'Wi-Fi', props: { '*InterruptModeration': { value: '0', valid: ['0', '1'] } } },
  { name: 'Odd', props: { '*FlowControl': { value: '1', valid: ['1', '2'] } } },
  { name: "Bad'Name", props: { '*FlowControl': { value: '3', valid: [] } } }
];

describe('adapter tweak planning', () => {
  it('only touches adapters that expose the keyword, accept the target and are not there yet', () => {
    expect(planAdapterTweak(ADAPTERS, '*InterruptModeration', '0')).toEqual([{ name: 'Ethernet', keyword: '*InterruptModeration', before: '1', value: '0' }]);
    expect(planAdapterTweak(ADAPTERS, '*FlowControl', '0')).toEqual([{ name: 'Ethernet', keyword: '*FlowControl', before: '3', value: '0' }]);
  });
  it('keeps the original value when applied twice', () => {
    const first = mergeSnapshot(null, [{ name: 'Ethernet', keyword: '*FlowControl', before: '3', value: '0' }]);
    const second = mergeSnapshot(first, [{ name: 'Ethernet', keyword: '*FlowControl', before: '0', value: '0' }]);
    expect(second).toEqual([{ name: 'Ethernet', keyword: '*FlowControl', value: '3' }]);
  });
  it('builds an exact-keyword set + read-back script and drops unsafe entries', () => {
    const s = buildAdvancedPropertySetScript([
      { name: 'Ethernet', keyword: '*FlowControl', value: '3' },
      { name: 'x', keyword: 'FlowControl; rm', value: '0' },
      { name: 'y', keyword: '*EEE', value: '0; calc' }
    ]);
    expect(s).toContain("Set-NetAdapterAdvancedProperty -Name 'Ethernet' -RegistryKeyword '*FlowControl' -RegistryValue 3");
    expect(s).toContain("$_.RegistryKeyword -eq '*FlowControl'");
    expect(s).toContain("DHAFT|");
    expect(s).not.toContain('calc');
    expect(s).not.toContain('rm');
  });
});

describe('QoS policy script', () => {
  it('validates the exe and the DSCP', () => {
    const s = buildQosApplyScript('cs2.exe');
    expect(s).toContain(`'${qosPolicyName('cs2.exe')}'`);
    expect(s).toContain('-AppPathNameMatchCondition \'cs2.exe\'');
    expect(s).toContain('-DSCPAction 46');
    expect(() => buildQosApplyScript("x'; Remove-Item C:\\ -Recurse; '.exe")).toThrow();
    expect(() => buildQosApplyScript('game.bat')).toThrow();
    expect(() => buildQosApplyScript('game.exe', 99)).toThrow();
  });
});

describe('state normalization', () => {
  it('handles ConvertTo-Json collapsing single-item arrays', () => {
    const st = normalizeState({
      adapters: { name: 'Ethernet', mtu: 1500, props: { '*EEE': { value: '1', display: 'On', valid: '0' } }, power: 'Unsupported' },
      tcp: { ecn: 'Disabled' },
      qos: { name: 'DarkHub NetX cs2.exe', app: 'cs2.exe', dscp: 46 }
    });
    expect(st.adapters).toHaveLength(1);
    expect(st.adapters[0].props['*EEE'].valid).toEqual(['0']);
    expect(st.qos).toEqual([{ name: 'DarkHub NetX cs2.exe', app: 'cs2.exe', dscp: 46 }]);
    expect(st.tcp.ecn).toBe('Disabled');
  });
});

const win32 = process.platform === 'win32' ? it : it.skip;

describe('apply / restore flow (no system changes: elevation is stubbed)', () => {
  beforeEach(() => {
    DeepTweaks.undoFilePath = null; // keep the test from writing the real undo store
    DeepTweaks.clearExtra('netx:flowControl');
    DeepTweaks.clearExtra('netx:ecn');
  });

  win32('snapshots the previous value before applying and restores it exactly', async () => {
    const svc = new NetLatencyService();
    svc.getState = async () => ({ ok: true, adapters: [ADAPTERS[0]], tcp: { ecn: 'Disabled' } });
    const scripts: string[] = [];
    svc._runMarked = async (script: string) => {
      scripts.push(script);
      const value = /-RegistryValue (\d+)/.exec(script)?.[1];
      return { ok: true, out: `DHAFT|Ethernet#*FlowControl|${value}\nDHDONE`, error: '' };
    };
    const a = await svc.applyTweak({ id: 'flowControl' });
    expect(a.ok).toBe(true);
    expect(DeepTweaks.getExtra('netx:flowControl')).toEqual([{ name: 'Ethernet', keyword: '*FlowControl', value: '3' }]);
    expect(scripts[0]).toContain('-RegistryValue 0');
    const r = await svc.restoreTweak({ id: 'flowControl' });
    expect(r.ok).toBe(true);
    expect(scripts[1]).toContain('-RegistryValue 3');
    expect(DeepTweaks.getExtra('netx:flowControl')).toBeNull();
  });

  win32('reports a failed verification instead of claiming success', async () => {
    const svc = new NetLatencyService();
    svc.getState = async () => ({ ok: true, adapters: [ADAPTERS[0]], tcp: { ecn: 'Disabled' } });
    svc._runMarked = async () => ({ ok: true, out: 'DHAFT|ecn|Disabled\nDHDONE', error: '' });
    const r = await svc.applyTweak({ id: 'ecn', value: 'Enabled' });
    expect(r.ok).toBe(false);
    expect(DeepTweaks.getExtra('netx:ecn')).toEqual({ ecn: 'Disabled' });
    expect((await svc.applyTweak({ id: 'ecn', value: 'Bogus' })).ok).toBe(false);
  });
});

describe('i18n', () => {
  it('has every netx key used by the screen in pt-BR and en-US', () => {
    const files = ['src/components/network/LatencyLab.tsx', 'src/pages/NetworkTools.tsx'];
    const used = new Set<string>();
    for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/t\('(netx\.[A-Za-z0-9_.]+)'/g)) used.add(m[1]);
    expect(used.size).toBeGreaterThan(50);
    for (const k of used) {
      expect(networkMessages['pt-BR'][k], `pt-BR ${k}`).toBeTruthy();
      expect(networkMessages['en-US'][k], `en-US ${k}`).toBeTruthy();
    }
    expect(Object.keys(networkMessages['pt-BR']).sort()).toEqual(Object.keys(networkMessages['en-US']).sort());
  });
});
