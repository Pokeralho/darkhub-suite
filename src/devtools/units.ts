/** Pure unit-conversion math for the Developer Tools converter. Every conversion is two-way. */

export interface UnitDef {
  id: string;
  label: string;
  /** factor to the category base unit (linear units) */
  factor?: number;
  /** non-linear units (temperature) */
  toBase?: (v: number) => number;
  fromBase?: (v: number) => number;
}

export interface UnitCategory {
  id: string;
  label: string;
  units: UnitDef[];
  defaultFrom: string;
  defaultTo: string;
}

const lin = (id: string, label: string, factor: number): UnitDef => ({ id, label, factor });

const dataUnits: UnitDef[] = [
  lin('bit', 'bit (b)', 1 / 8),
  lin('B', 'byte (B)', 1),
  lin('KB', 'KB (10^3, decimal)', 1e3),
  lin('MB', 'MB (10^6, decimal)', 1e6),
  lin('GB', 'GB (10^9, decimal)', 1e9),
  lin('TB', 'TB (10^12, decimal)', 1e12),
  lin('KiB', 'KiB (2^10, binary)', 1024),
  lin('MiB', 'MiB (2^20, binary)', 1024 ** 2),
  lin('GiB', 'GiB (2^30, binary)', 1024 ** 3),
  lin('TiB', 'TiB (2^40, binary)', 1024 ** 4),
];

export const CATEGORIES: UnitCategory[] = [
  {
    id: 'temperature', label: 'Temperatura', defaultFrom: 'C', defaultTo: 'F',
    units: [
      { id: 'C', label: 'Celsius (°C)', toBase: v => v, fromBase: v => v },
      { id: 'F', label: 'Fahrenheit (°F)', toBase: v => (v - 32) * 5 / 9, fromBase: v => v * 9 / 5 + 32 },
      { id: 'K', label: 'Kelvin (K)', toBase: v => v - 273.15, fromBase: v => v + 273.15 },
    ],
  },
  { id: 'data', label: 'Armazenamento', defaultFrom: 'MB', defaultTo: 'GB', units: dataUnits },
  {
    id: 'datarate', label: 'Taxa de dados', defaultFrom: 'Mbps', defaultTo: 'MBps',
    // base: bit per second
    units: [
      lin('bps', 'bit/s', 1), lin('Kbps', 'Kbit/s', 1e3), lin('Mbps', 'Mbit/s (Mbps)', 1e6), lin('Gbps', 'Gbit/s (Gbps)', 1e9),
      lin('Bps', 'byte/s (B/s)', 8), lin('KBps', 'KB/s', 8e3), lin('MBps', 'MB/s', 8e6), lin('GBps', 'GB/s', 8e9),
      lin('MiBps', 'MiB/s', 8 * 1024 ** 2), lin('GiBps', 'GiB/s', 8 * 1024 ** 3),
    ],
  },
  {
    id: 'length', label: 'Comprimento', defaultFrom: 'km', defaultTo: 'mi',
    units: [lin('mm', 'milímetro (mm)', 1e-3), lin('cm', 'centímetro (cm)', 1e-2), lin('m', 'metro (m)', 1), lin('km', 'quilômetro (km)', 1e3),
      lin('in', 'polegada (in)', 0.0254), lin('ft', 'pé (ft)', 0.3048), lin('yd', 'jarda (yd)', 0.9144), lin('mi', 'milha (mi)', 1609.344), lin('nmi', 'milha náutica', 1852)],
  },
  {
    id: 'mass', label: 'Massa', defaultFrom: 'kg', defaultTo: 'lb',
    units: [lin('mg', 'miligrama (mg)', 1e-6), lin('g', 'grama (g)', 1e-3), lin('kg', 'quilograma (kg)', 1), lin('t', 'tonelada (t)', 1000),
      lin('oz', 'onça (oz)', 0.028349523125), lin('lb', 'libra (lb)', 0.45359237), lin('st', 'stone (st)', 6.35029318)],
  },
  {
    id: 'time', label: 'Tempo', defaultFrom: 'h', defaultTo: 'min',
    units: [lin('ns', 'nanossegundo', 1e-9), lin('us', 'microssegundo', 1e-6), lin('ms', 'milissegundo', 1e-3), lin('s', 'segundo', 1), lin('min', 'minuto', 60),
      lin('h', 'hora', 3600), lin('d', 'dia', 86400), lin('wk', 'semana', 604800), lin('yr', 'ano (365 d)', 31536000)],
  },
  {
    id: 'speed', label: 'Velocidade', defaultFrom: 'kmh', defaultTo: 'mph',
    units: [lin('ms', 'm/s', 1), lin('kmh', 'km/h', 1 / 3.6), lin('mph', 'mph', 0.44704), lin('kn', 'nó (kn)', 1852 / 3600), lin('fps', 'ft/s', 0.3048)],
  },
  {
    id: 'area', label: 'Área', defaultFrom: 'm2', defaultTo: 'ft2',
    units: [lin('mm2', 'mm²', 1e-6), lin('cm2', 'cm²', 1e-4), lin('m2', 'm²', 1), lin('km2', 'km²', 1e6), lin('ha', 'hectare (ha)', 1e4),
      lin('in2', 'in²', 0.0254 ** 2), lin('ft2', 'ft²', 0.3048 ** 2), lin('ac', 'acre', 4046.8564224), lin('mi2', 'mi²', 1609.344 ** 2)],
  },
  {
    id: 'volume', label: 'Volume', defaultFrom: 'l', defaultTo: 'galus',
    units: [lin('ml', 'mililitro (mL)', 1e-3), lin('l', 'litro (L)', 1), lin('m3', 'm³', 1000), lin('tsp', 'colher de chá (US)', 0.00492892159375),
      lin('tbsp', 'colher de sopa (US)', 0.01478676478125), lin('cup', 'xícara (US)', 0.2365882365), lin('floz', 'fl oz (US)', 0.0295735295625),
      lin('galus', 'galão (US)', 3.785411784), lin('galuk', 'galão (UK)', 4.54609)],
  },
  {
    id: 'energy', label: 'Energia', defaultFrom: 'kwh', defaultTo: 'mj',
    units: [lin('j', 'joule (J)', 1), lin('kj', 'quilojoule (kJ)', 1e3), lin('mj', 'megajoule (MJ)', 1e6), lin('cal', 'caloria (cal)', 4.184),
      lin('kcal', 'quilocaloria (kcal)', 4184), lin('wh', 'Wh', 3600), lin('kwh', 'kWh', 3.6e6), lin('ev', 'elétron-volt (eV)', 1.602176634e-19), lin('btu', 'BTU', 1055.05585262)],
  },
  {
    id: 'pressure', label: 'Pressão', defaultFrom: 'bar', defaultTo: 'psi',
    units: [lin('pa', 'pascal (Pa)', 1), lin('kpa', 'kPa', 1e3), lin('bar', 'bar', 1e5), lin('atm', 'atm', 101325), lin('psi', 'psi', 6894.757293168), lin('mmhg', 'mmHg', 133.322387415)],
  },
  {
    id: 'angle', label: 'Ângulo', defaultFrom: 'deg', defaultTo: 'rad',
    units: [lin('deg', 'grau (°)', Math.PI / 180), lin('rad', 'radiano (rad)', 1), lin('grad', 'grado (gon)', Math.PI / 200), lin('turn', 'volta', 2 * Math.PI), lin('arcmin', 'minuto de arco', Math.PI / 10800)],
  },
  {
    id: 'frequency', label: 'Frequência', defaultFrom: 'mhz', defaultTo: 'ghz',
    units: [lin('hz', 'Hz', 1), lin('khz', 'kHz', 1e3), lin('mhz', 'MHz', 1e6), lin('ghz', 'GHz', 1e9), lin('rpm', 'rpm', 1 / 60)],
  },
];

export function findCategory(id: string): UnitCategory {
  return CATEGORIES.find(c => c.id === id) ?? CATEGORIES[0];
}

export function convert(category: string, from: string, to: string, value: number): number {
  const cat = findCategory(category);
  const f = cat.units.find(u => u.id === from);
  const t = cat.units.find(u => u.id === to);
  if (!f || !t) return NaN;
  const base = f.toBase ? f.toBase(value) : value * (f.factor as number);
  return t.fromBase ? t.fromBase(base) : base / (t.factor as number);
}

/** Compact display: 12 significant digits, no trailing noise. */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '';
  if (n === 0) return '0';
  const s = Number(n.toPrecision(12));
  const abs = Math.abs(s);
  if (abs >= 1e15 || abs < 1e-6) return s.toExponential().replace('e+', 'e');
  return String(s);
}

// ---------- number bases ----------
export const BASES = [2, 8, 10, 16] as const;
const DIGITS: Record<number, RegExp> = { 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^\d+$/, 16: /^[0-9a-f]+$/i };

/** Parses an integer string in the base (BigInt, optional '-' and 0x/0b/0o prefix). Returns null when invalid. */
export function parseBase(text: string, base: number): bigint | null {
  let s = text.trim().replace(/[\s_]/g, '');
  if (!s) return null;
  let neg = false;
  if (s[0] === '-') { neg = true; s = s.slice(1); }
  const pre = base === 16 ? /^0x/i : base === 2 ? /^0b/i : base === 8 ? /^0o/i : null;
  if (pre) s = s.replace(pre, '');
  if (!s || !DIGITS[base].test(s)) return null;
  let r = 0n;
  const b = BigInt(base);
  for (const ch of s.toLowerCase()) r = r * b + BigInt(parseInt(ch, 16));
  return neg ? -r : r;
}

export function formatBase(n: bigint, base: number): string {
  return n.toString(base).toUpperCase();
}

// ---------- timestamps ----------
export type TsUnit = 's' | 'ms';

export function unixToIso(value: number, unit: TsUnit = 's'): string | null {
  const d = new Date(unit === 's' ? value * 1000 : value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function isoToUnix(text: string, unit: TsUnit = 's'): number | null {
  const ms = Date.parse(text.trim());
  if (Number.isNaN(ms)) return null;
  return unit === 's' ? Math.floor(ms / 1000) : ms;
}

/** Local time formatted as YYYY-MM-DD HH:mm:ss (machine timezone). */
export function unixToLocal(value: number, unit: TsUnit = 's'): string | null {
  const d = new Date(unit === 's' ? value * 1000 : value);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
