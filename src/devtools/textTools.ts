/** Pure helpers for the Developer Tools text utilities (no React, no DOM except Web Crypto). */

// ---------- encode / decode ----------
export function base64Encode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

export function base64Decode(b64: string): string {
  const clean = b64.trim().replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  const padded = clean + '='.repeat((4 - (clean.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function htmlEncode(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function htmlDecode(text: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch { return m; }
    }
    return named[e.toLowerCase()] ?? m;
  });
}

export type EncodeKind = 'base64' | 'url' | 'html';

export function encodeText(kind: EncodeKind, text: string): string {
  if (kind === 'base64') return base64Encode(text);
  if (kind === 'url') return encodeURIComponent(text);
  return htmlEncode(text);
}

/** Throws on malformed input. */
export function decodeText(kind: EncodeKind, text: string): string {
  if (kind === 'base64') return base64Decode(text);
  if (kind === 'url') return decodeURIComponent(text.replace(/\+/g, ' '));
  return htmlDecode(text);
}

// ---------- JSON ----------
export function jsonFormat(text: string, indent = 2): string { return JSON.stringify(JSON.parse(text), null, indent); }
export function jsonMinify(text: string): string { return JSON.stringify(JSON.parse(text)); }

// ---------- hashes ----------
export type ShaAlg = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';

export async function shaHex(alg: ShaAlg, text: string): Promise<string> {
  const buf = await crypto.subtle.digest(alg, new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

// ---------- ids ----------
export function uuidV4(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function ulid(now = Date.now()): string {
  let t = '';
  let ms = now;
  for (let i = 0; i < 10; i++) { t = CROCKFORD[ms % 32] + t; ms = Math.floor(ms / 32); }
  const rnd = crypto.getRandomValues(new Uint8Array(16));
  let r = '';
  for (let i = 0; i < 16; i++) r += CROCKFORD[rnd[i] % 32];
  return t + r;
}

/** Decodes the millisecond timestamp stored in a ULID, or null if invalid. */
export function ulidTime(id: string): number | null {
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(id)) return null;
  let ms = 0;
  for (const ch of id.slice(0, 10).toUpperCase()) ms = ms * 32 + CROCKFORD.indexOf(ch);
  return ms;
}

// ---------- JWT (decode only, signature NOT verified) ----------
export interface JwtParts { header: unknown; payload: unknown; signature: string; expiresAt?: number; issuedAt?: number }

export function decodeJwt(token: string): JwtParts {
  const parts = token.trim().split('.');
  if (parts.length < 2 || parts.length > 3) throw new Error('JWT must have 2 or 3 dot-separated parts');
  const header = JSON.parse(base64Decode(parts[0]));
  const payload = JSON.parse(base64Decode(parts[1]));
  const out: JwtParts = { header, payload, signature: parts[2] ?? '' };
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    if (typeof p.exp === 'number') out.expiresAt = p.exp * 1000;
    if (typeof p.iat === 'number') out.issuedAt = p.iat * 1000;
  }
  return out;
}

// ---------- password / entropy ----------
export function charsetSize(pw: string): number {
  let n = 0;
  if (/[a-z]/.test(pw)) n += 26;
  if (/[A-Z]/.test(pw)) n += 26;
  if (/\d/.test(pw)) n += 10;
  if (/[^A-Za-z0-9]/.test(pw)) n += 33;
  return n;
}

/** Estimated entropy in bits (length * log2(charset)); an upper bound for non-random text. */
export function entropyBits(pw: string): number {
  const n = charsetSize(pw);
  return n === 0 ? 0 : pw.length * Math.log2(n);
}

export function strengthLabel(bits: number): 'veryWeak' | 'weak' | 'fair' | 'strong' | 'veryStrong' {
  if (bits < 28) return 'veryWeak';
  if (bits < 40) return 'weak';
  if (bits < 60) return 'fair';
  if (bits < 80) return 'strong';
  return 'veryStrong';
}

export interface PwOptions { length: number; lower: boolean; upper: boolean; digits: boolean; symbols: boolean }

export function generatePassword(o: PwOptions): string {
  let pool = '';
  if (o.lower) pool += 'abcdefghijklmnopqrstuvwxyz';
  if (o.upper) pool += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (o.digits) pool += '0123456789';
  if (o.symbols) pool += '!@#$%^&*()-_=+[]{};:,.?/';
  if (!pool) return '';
  const limit = Math.floor(0x100000000 / pool.length) * pool.length; // rejection sampling: no modulo bias
  let out = '';
  while (out.length < o.length) {
    const v = crypto.getRandomValues(new Uint32Array(1))[0];
    if (v < limit) out += pool[v % pool.length];
  }
  return out;
}

// ---------- lorem ipsum ----------
const LOREM_WORDS = ('lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum').split(' ');

export function lorem(paragraphs: number, sentencesPerParagraph = 5, seed = 1): string {
  let s = seed >>> 0 || 1;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000; };
  const out: string[] = [];
  for (let p = 0; p < paragraphs; p++) {
    const sents: string[] = [];
    for (let i = 0; i < sentencesPerParagraph; i++) {
      const n = 6 + Math.floor(rnd() * 10);
      const w: string[] = [];
      for (let k = 0; k < n; k++) w.push(LOREM_WORDS[Math.floor(rnd() * LOREM_WORDS.length)]);
      if (p === 0 && i === 0) { w[0] = 'lorem'; w[1] = 'ipsum'; }
      sents.push(w.join(' ').replace(/^./, c => c.toUpperCase()) + '.');
    }
    out.push(sents.join(' '));
  }
  return out.join('\n\n');
}

// ---------- regex tester ----------
export interface RegexSegment { text: string; match: boolean }

export function regexSegments(pattern: string, flags: string, text: string, limit = 5000): { segments: RegexSegment[]; count: number } {
  const f = flags.includes('g') ? flags : flags + 'g';
  const re = new RegExp(pattern, f);
  const segments: RegexSegment[] = [];
  let last = 0, count = 0;
  for (const m of text.matchAll(re)) {
    if (m[0] === '') { if (m.index === undefined) continue; if (++count > limit) break; continue; }
    const idx = m.index ?? 0;
    if (idx > last) segments.push({ text: text.slice(last, idx), match: false });
    segments.push({ text: m[0], match: true });
    last = idx + m[0].length;
    if (++count > limit) break;
  }
  if (last < text.length) segments.push({ text: text.slice(last), match: false });
  return { segments, count };
}

// ---------- cron explainer ----------
const FIELD_NAMES = ['minuto', 'hora', 'dia do mês', 'mês', 'dia da semana'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DOWS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const RANGES: [number, number][] = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
const ALIASES: Record<string, string> = { '@hourly': '0 * * * *', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@weekly': '0 0 * * 0', '@monthly': '0 0 1 * *', '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *' };
const NAME_MAP: Record<string, number>[] = [{}, {}, {}, Object.fromEntries(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].map((m, i) => [m, i + 1])), Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d, i) => [d, i]))];

/** Expands one cron field into the sorted list of values it matches. Throws on invalid syntax. */
export function expandCronField(field: string, idx: number): number[] {
  const [lo, hi] = RANGES[idx];
  const set = new Set<number>();
  const num = (s: string): number => {
    const v = NAME_MAP[idx][s.toLowerCase()] ?? (/^\d+$/.test(s) ? parseInt(s, 10) : NaN);
    if (Number.isNaN(v) || v < lo || v > hi) throw new Error(`Valor inválido "${s}" em ${FIELD_NAMES[idx]}`);
    return v;
  };
  for (const part of field.split(',')) {
    const [rangePart, stepPart] = part.split('/');
    const step = stepPart === undefined ? 1 : parseInt(stepPart, 10);
    if (!(step >= 1)) throw new Error(`Passo inválido em ${FIELD_NAMES[idx]}`);
    let a: number, b: number;
    if (rangePart === '*' || rangePart === '?') { a = lo; b = idx === 4 ? 6 : hi; }
    else if (rangePart.includes('-')) { const [x, y] = rangePart.split('-'); a = num(x); b = num(y); }
    else { a = num(rangePart); b = stepPart === undefined ? a : hi; }
    if (a > b) throw new Error(`Intervalo inválido em ${FIELD_NAMES[idx]}`);
    for (let v = a; v <= b; v += step) set.add(idx === 4 && v === 7 ? 0 : v);
  }
  return [...set].sort((x, y) => x - y);
}

const p2 = (n: number) => String(n).padStart(2, '0');
const join = (xs: string[]) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' e ' + xs[xs.length - 1]);

/** Human readable (Portuguese) description of a 5-field cron expression. Throws on invalid input. */
export function explainCron(expr: string): string {
  const trimmed = expr.trim();
  const e = ALIASES[trimmed.toLowerCase()] ?? trimmed;
  const f = e.split(/\s+/);
  if (f.length !== 5) throw new Error('Esperados 5 campos: minuto hora dia-do-mês mês dia-da-semana');
  const v = f.map((x, i) => expandCronField(x, i));
  const [mins, hours, doms, months, dows] = v;
  const full = (i: number) => v[i].length === (i === 4 ? 7 : RANGES[i][1] - RANGES[i][0] + 1) || f[i] === '*' || f[i] === '?';
  let when: string;
  if (f[0] === '*' && f[1] === '*') when = 'A cada minuto';
  else if (/^\*\/\d+$/.test(f[0]) && f[1] === '*') when = `A cada ${f[0].slice(2)} minutos`;
  else if (f[1] === '*') when = `No(s) minuto(s) ${join(mins.map(String))} de cada hora`;
  else if (/^\*\/\d+$/.test(f[1]) && mins.length === 1) when = `No minuto ${mins[0]}, a cada ${f[1].slice(2)} horas`;
  else if (mins.length * hours.length <= 6) when = `Às ${join(hours.flatMap(h => mins.map(m => `${p2(h)}:${p2(m)}`)))}`;
  else when = `No(s) minuto(s) ${join(mins.map(String))} das horas ${join(hours.map(String))}`;
  const parts = [when];
  if (!full(2)) parts.push(`no(s) dia(s) ${join(doms.map(String))} do mês`);
  if (!full(4)) parts.push(`${dows.length === 5 && dows[0] === 1 && dows[4] === 5 ? 'de segunda a sexta' : 'em ' + join(dows.map(d => DOWS[d]))}`);
  if (!full(3)) parts.push(`em ${join(months.map(m => MONTHS[m - 1]))}`);
  return parts.join(', ');
}

/** Next `count` run times (local time) for a 5-field cron expression. */
export function nextCronRuns(expr: string, count = 5, from = new Date()): Date[] {
  const e = ALIASES[expr.trim().toLowerCase()] ?? expr.trim();
  const f = e.split(/\s+/);
  if (f.length !== 5) throw new Error('Esperados 5 campos');
  const [mins, hours, doms, months, dows] = f.map((x, i) => new Set(expandCronField(x, i)));
  const domStar = f[2] === '*' || f[2] === '?', dowStar = f[4] === '*' || f[4] === '?';
  const out: Date[] = [];
  const d = new Date(from.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  for (let i = 0; i < 366 * 24 * 60 && out.length < count; i++, d.setMinutes(d.getMinutes() + 1)) {
    if (!mins.has(d.getMinutes()) || !hours.has(d.getHours()) || !months.has(d.getMonth() + 1)) continue;
    const domOk = doms.has(d.getDate()), dowOk = dows.has(d.getDay());
    const dayOk = domStar && dowStar ? true : domStar ? dowOk : dowStar ? domOk : domOk || dowOk;
    if (dayOk) out.push(new Date(d.getTime()));
  }
  return out;
}
