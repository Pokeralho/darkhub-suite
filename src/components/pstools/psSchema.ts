// Shared tool catalog (the same JSON the main process validates against) + small renderer helpers.
import schemaJson from '../../../electron/services/psTools/toolSchema.json';

export type ParamType = 'text' | 'patterns' | 'number' | 'bool' | 'select' | 'folder' | 'savePath';
export interface ParamDef {
  key: string;
  type: ParamType;
  default: string | number | boolean;
  label: string;
  min?: number;
  max?: number;
  maxLength?: number;
  pattern?: string;
  required?: boolean;
  ext?: string;
  options?: Array<{ value: string; label: string }>;
}
export interface ToolDef {
  id: string;
  category: string;
  output: 'table' | 'text' | 'file' | 'hosts';
  name: string;
  desc: string;
  params: ParamDef[];
  admin?: boolean;
  mutating?: boolean;
  hidden?: boolean;
  rowAction?: 'wingetUpgrade' | 'wifiKey';
  adminWhen?: { key: string; equals: unknown };
  mutatingWhen?: { key: string; equals: unknown };
}
export type ParamValues = Record<string, string | number | boolean>;

export const PS_SCHEMA = schemaJson as unknown as { version: number; categories: Array<{ id: string; label: string }>; tools: ToolDef[] };

export const toolsIn = (category: string) => PS_SCHEMA.tools.filter((t) => t.category === category && !t.hidden);
export const toolById = (id: string) => PS_SCHEMA.tools.find((t) => t.id === id) || null;

export function defaultsFor(tool: ToolDef): ParamValues {
  const out: ParamValues = {};
  for (const p of tool.params) out[p.key] = p.default;
  return out;
}

export function flagsFor(tool: ToolDef, values: ParamValues) {
  const hit = (c?: { key: string; equals: unknown }) => !!c && values[c.key] === c.equals;
  return { admin: tool.admin === true || hit(tool.adminWhen), mutating: tool.mutating === true || hit(tool.mutatingWhen) };
}

const ABS = /^[A-Za-z]:\\/;
const CONTROL = /[\u0000-\u001f]/;

/** Mirrors the main-process validation so errors show while typing. Returns an error code or null. */
export function validateParam(p: ParamDef, raw: unknown): string | null {
  const v = raw === undefined || raw === null ? p.default : raw;
  switch (p.type) {
    case 'bool': return null;
    case 'number': {
      const s = String(v).trim();
      const n = Number(s);
      if (!s || !Number.isFinite(n) || !Number.isInteger(n)) return 'number';
      if (typeof p.min === 'number' && n < p.min) return 'min';
      if (typeof p.max === 'number' && n > p.max) return 'max';
      return null;
    }
    case 'select': return (p.options || []).some((o) => o.value === v) ? null : 'option';
    case 'text':
    case 'patterns': {
      const s = String(v ?? '').trim();
      if (p.required && !s) return 'required';
      if (p.maxLength && s.length > p.maxLength) return 'length';
      if (CONTROL.test(s) || (p.type === 'patterns' && /["<>|]/.test(s))) return 'chars';
      if (s && p.pattern && !new RegExp(p.pattern).test(s)) return 'pattern';
      return null;
    }
    case 'folder':
    case 'savePath': {
      const s = String(v ?? '').trim();
      if (!s) return p.required ? 'required' : null;
      if (p.type === 'folder' && s.toUpperCase() === '%TEMP%') return null;
      if (!ABS.test(s) || s.indexOf(':', 2) !== -1 || /[*?"<>|]/.test(s) || CONTROL.test(s)) return 'path';
      if (p.ext && !s.toLowerCase().endsWith('.' + p.ext)) return 'path';
      return null;
    }
    default: return null;
  }
}

export function validateAll(tool: ToolDef, values: ParamValues): Record<string, string> {
  const errs: Record<string, string> = {};
  for (const p of tool.params) {
    const e = validateParam(p, values[p.key]);
    if (e) errs[p.key] = e;
  }
  return errs;
}

/** Converts form values to the payload types the main process expects. */
export function toPayload(tool: ToolDef, values: ParamValues): ParamValues {
  const out: ParamValues = {};
  for (const p of tool.params) {
    const v = values[p.key];
    out[p.key] = p.type === 'number' ? Number(v) : p.type === 'bool' ? v === true : String(v ?? '');
  }
  return out;
}

export function columnsOf(rows: Array<Record<string, unknown>>): string[] {
  const cols: string[] = [];
  for (const r of rows) for (const k of Object.keys(r || {})) if (!cols.includes(k)) cols.push(k);
  return cols;
}

export function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function rowsToCsv(rows: Array<Record<string, unknown>>): string {
  const cols = columnsOf(rows);
  const esc = (v: unknown) => {
    let s = cellText(v);
    if (/^[=+@\t\r]/.test(s) || /^-[^\d]/.test(s)) s = `'${s}`;
    return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map(esc).join(','), ...rows.map((r) => cols.map((c) => esc(r?.[c])).join(','))].join('\n');
}
