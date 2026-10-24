/** Pure colour math: RGB/HSL/HSV/CMYK/HEX conversion, parsing and WCAG contrast. */

export interface RGB { r: number; g: number; b: number } // 0..255
export interface RGBA extends RGB { a: number } // a 0..1
export interface HSL { h: number; s: number; l: number } // h 0..360, s/l 0..100
export interface HSV { h: number; s: number; v: number } // h 0..360, s/v 0..100
export interface CMYK { c: number; m: number; y: number; k: number } // 0..100

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const r2 = (n: number) => Math.round(n * 100) / 100;

export function rgbToHsv({ r, g, b }: RGB): HSV {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : (d / max) * 100, v: max * 100 };
}

export function hsvToRgb({ h, s, v }: HSV): RGB {
  const S = clamp(s, 0, 100) / 100, V = clamp(v, 0, 100) / 100;
  const H = ((h % 360) + 360) % 360;
  const c = V * S, x = c * (1 - Math.abs(((H / 60) % 2) - 1)), m = V - c;
  let r = 0, g = 0, b = 0;
  if (H < 60) [r, g, b] = [c, x, 0];
  else if (H < 120) [r, g, b] = [x, c, 0];
  else if (H < 180) [r, g, b] = [0, c, x];
  else if (H < 240) [r, g, b] = [0, x, c];
  else if (H < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  const l = (max + min) / 2;
  const hsv = rgbToHsv({ r, g, b });
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h: hsv.h, s: s * 100, l: l * 100 };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const S = clamp(s, 0, 100) / 100, L = clamp(l, 0, 100) / 100;
  const v = L + S * Math.min(L, 1 - L);
  return hsvToRgb({ h, s: v === 0 ? 0 : 2 * (1 - L / v) * 100, v: v * 100 });
}

export function rgbToCmyk({ r, g, b }: RGB): CMYK {
  const R = r / 255, G = g / 255, B = b / 255;
  const k = 1 - Math.max(R, G, B);
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };
  return { c: ((1 - R - k) / (1 - k)) * 100, m: ((1 - G - k) / (1 - k)) * 100, y: ((1 - B - k) / (1 - k)) * 100, k: k * 100 };
}

export function cmykToRgb({ c, m, y, k }: CMYK): RGB {
  const K = 1 - clamp(k, 0, 100) / 100;
  return { r: 255 * (1 - clamp(c, 0, 100) / 100) * K, g: 255 * (1 - clamp(m, 0, 100) / 100) * K, b: 255 * (1 - clamp(y, 0, 100) / 100) * K };
}

const hex2 = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');

/** #RRGGBB, or #RRGGBBAA when alpha < 1. */
export function rgbaToHex({ r, g, b, a }: RGBA): string {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}${a < 1 ? hex2(a * 255) : ''}`.toUpperCase();
}

/** Accepts #RGB, #RGBA, #RRGGBB, #RRGGBBAA (with or without '#'). */
export function parseHex(text: string): RGBA | null {
  let s = text.trim().replace(/^#/, '');
  if (!/^[0-9a-f]+$/i.test(s)) return null;
  if (s.length === 3 || s.length === 4) s = s.split('').map(c => c + c).join('');
  if (s.length !== 6 && s.length !== 8) return null;
  const n = (i: number) => parseInt(s.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: s.length === 8 ? n(6) / 255 : 1 };
}

/** Parses hex, rgb()/rgba(), hsl()/hsla() strings. */
export function parseColor(text: string): RGBA | null {
  const t = text.trim();
  const hex = parseHex(t);
  if (hex) return hex;
  const m = /^(rgba?|hsla?)\(\s*([^)]*)\)$/i.exec(t);
  if (!m) return null;
  const parts = m[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const nums = parts.map(p => parseFloat(p));
  if (nums.some(Number.isNaN)) return null;
  let a = 1;
  if (parts[3] !== undefined) a = clamp(parts[3].endsWith('%') ? nums[3] / 100 : nums[3], 0, 1);
  if (m[1].toLowerCase().startsWith('rgb')) {
    const ch = (i: number) => clamp(parts[i].endsWith('%') ? (nums[i] / 100) * 255 : nums[i], 0, 255);
    return { r: ch(0), g: ch(1), b: ch(2), a };
  }
  return { ...hslToRgb({ h: nums[0], s: nums[1], l: nums[2] }), a };
}

export const formatRgb = ({ r, g, b, a }: RGBA) =>
  a < 1 ? `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${r2(a)})` : `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;

export function formatHsl(c: RGBA): string {
  const { h, s, l } = rgbToHsl(c);
  const core = `${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%`;
  return c.a < 1 ? `hsla(${core}, ${r2(c.a)})` : `hsl(${core})`;
}

export const formatHsv = (c: RGB) => { const { h, s, v } = rgbToHsv(c); return `hsv(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(v)}%)`; };
export const formatCmyk = (c: RGB) => { const { c: C, m, y, k } = rgbToCmyk(c); return `cmyk(${Math.round(C)}%, ${Math.round(m)}%, ${Math.round(y)}%, ${Math.round(k)}%)`; };

/** WCAG 2.x relative luminance. */
export function luminance({ r, g, b }: RGB): number {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function wcagLevels(ratio: number) {
  return { aaNormal: ratio >= 4.5, aaLarge: ratio >= 3, aaaNormal: ratio >= 7, aaaLarge: ratio >= 4.5 };
}

/** Composites a colour with alpha over an opaque background. */
export function flatten(c: RGBA, bg: RGB = { r: 255, g: 255, b: 255 }): RGB {
  return { r: c.r * c.a + bg.r * (1 - c.a), g: c.g * c.a + bg.g * (1 - c.a), b: c.b * c.a + bg.b * (1 - c.a) };
}
