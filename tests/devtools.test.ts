import { describe, it, expect } from 'vitest';
import { CATEGORIES, convert, formatNumber, parseBase, formatBase, unixToIso, isoToUnix } from '../src/devtools/units';
import {
  parseHex, rgbaToHex, rgbToHsl, hslToRgb, rgbToHsv, hsvToRgb, rgbToCmyk, cmykToRgb, parseColor, contrastRatio, wcagLevels, formatRgb, formatHsl,
} from '../src/devtools/color';
import {
  base64Encode, base64Decode, htmlEncode, htmlDecode, decodeJwt, entropyBits, explainCron, nextCronRuns, expandCronField, ulid, ulidTime, uuidV4, shaHex,
  regexSegments, lorem, jsonMinify,
} from '../src/devtools/textTools';

describe('unit conversion', () => {
  it('known values', () => {
    expect(convert('temperature', 'C', 'F', 100)).toBeCloseTo(212, 9);
    expect(convert('temperature', 'F', 'C', 32)).toBeCloseTo(0, 9);
    expect(convert('temperature', 'C', 'K', 0)).toBeCloseTo(273.15, 9);
    expect(convert('data', 'GiB', 'B', 1)).toBe(1073741824);
    expect(convert('data', 'GB', 'B', 1)).toBe(1e9);
    expect(convert('data', 'B', 'bit', 1)).toBe(8);
    expect(convert('data', 'MB', 'GB', 1024)).toBeCloseTo(1.024, 9);
    expect(convert('datarate', 'Mbps', 'MBps', 800)).toBeCloseTo(100, 9);
    expect(convert('length', 'mi', 'km', 1)).toBeCloseTo(1.609344, 9);
    expect(convert('mass', 'kg', 'lb', 1)).toBeCloseTo(2.2046226, 6);
    expect(convert('time', 'h', 'min', 1)).toBe(60);
    expect(convert('speed', 'kmh', 'ms', 36)).toBeCloseTo(10, 9);
    expect(convert('pressure', 'atm', 'pa', 1)).toBe(101325);
    expect(convert('angle', 'deg', 'rad', 180)).toBeCloseTo(Math.PI, 12);
    expect(convert('frequency', 'ghz', 'mhz', 2.4)).toBeCloseTo(2400, 9);
    expect(convert('energy', 'kwh', 'mj', 1)).toBeCloseTo(3.6, 9);
  });

  it('every category round-trips between every pair of units', () => {
    for (const cat of CATEGORIES) {
      for (const a of cat.units) {
        for (const b of cat.units) {
          const there = convert(cat.id, a.id, b.id, 123.456);
          const back = convert(cat.id, b.id, a.id, there);
          expect(back).toBeCloseTo(123.456, 6);
        }
      }
    }
  });

  it('formats numbers compactly', () => {
    expect(formatNumber(0.1 + 0.2)).toBe('0.3');
    expect(formatNumber(1073741824)).toBe('1073741824');
    expect(formatNumber(NaN)).toBe('');
  });

  it('number bases are two-way and handle big values', () => {
    expect(parseBase('ff', 16)).toBe(255n);
    expect(parseBase('0xFF', 16)).toBe(255n);
    expect(parseBase('1010', 2)).toBe(10n);
    expect(parseBase('12', 2)).toBeNull();
    expect(formatBase(255n, 2)).toBe('11111111');
    const big = 2n ** 100n + 12345n;
    for (const base of [2, 8, 10, 16]) expect(parseBase(formatBase(big, base), base)).toBe(big);
    expect(parseBase('-ff', 16)).toBe(-255n);
  });

  it('timestamps are two-way', () => {
    expect(unixToIso(0)).toBe('1970-01-01T00:00:00.000Z');
    expect(isoToUnix('2001-09-09T01:46:40Z')).toBe(1000000000);
    expect(isoToUnix(unixToIso(1700000000)!)).toBe(1700000000);
    expect(isoToUnix(unixToIso(1700000000123, 'ms')!, 'ms')).toBe(1700000000123);
    expect(isoToUnix('nonsense')).toBeNull();
  });
});

describe('color math', () => {
  it('hex parse and format', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseHex('336699')).toEqual({ r: 51, g: 102, b: 153, a: 1 });
    expect(parseHex('#33669980')!.a).toBeCloseTo(0.502, 2);
    expect(parseHex('#12')).toBeNull();
    expect(rgbaToHex({ r: 51, g: 102, b: 153, a: 1 })).toBe('#336699');
    expect(rgbaToHex({ r: 255, g: 0, b: 0, a: 0.5 })).toBe('#FF000080');
  });

  it('known conversions', () => {
    expect(rgbToHsl({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, l: 50 });
    const hsv = rgbToHsv({ r: 0, g: 255, b: 0 });
    expect(hsv).toEqual({ h: 120, s: 100, v: 100 });
    expect(rgbToCmyk({ r: 0, g: 0, b: 0 })).toEqual({ c: 0, m: 0, y: 0, k: 100 });
    const cmyk = rgbToCmyk({ r: 255, g: 0, b: 0 });
    expect(cmyk.m).toBe(100);
    expect(cmyk.y).toBe(100);
    expect(cmyk.c).toBe(0);
  });

  it('round trips through every model', () => {
    for (let i = 0; i < 300; i++) {
      const c = { r: (i * 37) % 256, g: (i * 91) % 256, b: (i * 53) % 256 };
      for (const back of [hslToRgb(rgbToHsl(c)), hsvToRgb(rgbToHsv(c)), cmykToRgb(rgbToCmyk(c))]) {
        expect(back.r).toBeCloseTo(c.r, 6);
        expect(back.g).toBeCloseTo(c.g, 6);
        expect(back.b).toBeCloseTo(c.b, 6);
      }
    }
  });

  it('parses css color strings', () => {
    expect(parseColor('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(parseColor('rgba(10 20 30 / 0.5)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    const hsl = parseColor('hsl(0, 100%, 50%)')!;
    expect(Math.round(hsl.r)).toBe(255);
    expect(Math.round(hsl.g)).toBe(0);
    expect(parseColor('banana')).toBeNull();
    expect(formatRgb({ r: 1, g: 2, b: 3, a: 1 })).toBe('rgb(1, 2, 3)');
    expect(formatHsl({ r: 255, g: 0, b: 0, a: 0.5 })).toBe('hsla(0, 100%, 50%, 0.5)');
  });

  it('WCAG contrast', () => {
    const white = { r: 255, g: 255, b: 255 }, black = { r: 0, g: 0, b: 0 };
    expect(contrastRatio(white, black)).toBeCloseTo(21, 6);
    expect(contrastRatio(white, white)).toBeCloseTo(1, 6);
    expect(contrastRatio({ r: 119, g: 119, b: 119 }, white)).toBeCloseTo(4.48, 1);
    expect(wcagLevels(4.5)).toEqual({ aaNormal: true, aaLarge: true, aaaNormal: false, aaaLarge: true });
  });
});

describe('text tools', () => {
  it('base64 handles unicode both ways', () => {
    const s = 'olá, mundo ✓ 日本';
    expect(base64Decode(base64Encode(s))).toBe(s);
    expect(base64Encode('hello')).toBe('aGVsbG8=');
    expect(base64Decode('aGVsbG8')).toBe('hello');
  });

  it('html entities round trip', () => {
    const s = `<a href="x">'&'</a>`;
    expect(htmlDecode(htmlEncode(s))).toBe(s);
    expect(htmlDecode('&#65;&#x42;&copy;')).toBe('AB&copy;');
  });

  it('hashes match known vectors', async () => {
    expect(await shaHex('SHA-1', 'abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(await shaHex('SHA-256', 'abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('jwt decode', () => {
    const tok = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.sig';
    const d = decodeJwt(tok);
    expect((d.header as any).alg).toBe('HS256');
    expect((d.payload as any).name).toBe('John Doe');
    expect(d.issuedAt).toBe(1516239022000);
    expect(() => decodeJwt('nope')).toThrow();
  });

  it('ids', () => {
    expect(uuidV4()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const id = ulid(1700000000000);
    expect(id).toHaveLength(26);
    expect(ulidTime(id)).toBe(1700000000000);
  });

  it('entropy', () => {
    expect(entropyBits('')).toBe(0);
    expect(entropyBits('abcd')).toBeCloseTo(4 * Math.log2(26), 9);
  });

  it('regex segments', () => {
    const r = regexSegments('\\d+', 'g', 'a1b22c');
    expect(r.count).toBe(2);
    expect(r.segments.filter(s => s.match).map(s => s.text)).toEqual(['1', '22']);
    expect(() => regexSegments('(', '', 'x')).toThrow();
  });

  it('cron', () => {
    expect(expandCronField('*/15', 0)).toEqual([0, 15, 30, 45]);
    expect(expandCronField('1-5', 4)).toEqual([1, 2, 3, 4, 5]);
    expect(explainCron('*/5 * * * *')).toBe('A cada 5 minutos');
    expect(explainCron('0 9 * * 1-5')).toContain('09:00');
    expect(() => explainCron('61 * * * *')).toThrow();
    const runs = nextCronRuns('0 12 * * *', 3, new Date(2025, 0, 1, 0, 0));
    expect(runs.map(d => d.getHours())).toEqual([12, 12, 12]);
    expect(runs[1].getDate()).toBe(2);
  });

  it('lorem is deterministic; json minify', () => {
    expect(lorem(2, 3, 7)).toBe(lorem(2, 3, 7));
    expect(lorem(1, 2)).toMatch(/^Lorem ipsum/);
    expect(jsonMinify('{ "a": [1, 2] }')).toBe('{"a":[1,2]}');
  });
});
