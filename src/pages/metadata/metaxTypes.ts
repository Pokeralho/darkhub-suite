// Shapes returned by the `metax:*` IPC channels (electron/services/metadata/MetadataService.js).

export type MetaxFieldKind = 'text' | 'multiline' | 'list' | 'date' | 'year' | 'number';

export interface MetaxField {
  key: string;
  kind: MetaxFieldKind;
  value: string;
  writable: boolean;
}

export interface MetaxTag {
  key: string;
  name: string;
  value: string;
  writable: boolean;
  binary: boolean;
}

export interface MetaxGroup {
  name: string;
  writable: boolean;
  tags: MetaxTag[];
}

export interface MetaxZone {
  zoneId: number | null;
  referrerUrl: string;
  hostUrl: string;
  raw: string;
}

export interface MetaxFsInfo {
  size: number;
  created: number;
  modified: number;
  accessed: number;
  readOnly: boolean;
  hidden: boolean;
  system: boolean;
  archive: boolean;
  attributes: number | null;
  streams: { name: string; size: number }[];
  zone: MetaxZone | null;
  streamsSupported: boolean;
}

export interface MetaxDetect {
  type: string;
  label: string;
  family: 'image' | 'audio' | 'video' | 'pdf' | 'office' | 'pe' | 'other';
  mime: string;
  ext: string;
  extMismatch: boolean;
  size: number;
}

export type MetaxBackend = 'exiftool' | 'ffmpeg' | 'ooxml' | null;

export interface MetaxInfo {
  ok: true;
  path: string;
  detect: MetaxDetect;
  hex: { offset: number; hex: string; ascii: string }[];
  backend: MetaxBackend;
  engines: { exiftool: boolean; ffmpeg: boolean };
  capabilities: { fields: boolean; raw: boolean; strip: boolean; gps: boolean; cover: boolean; stripIncremental: boolean };
  fields: MetaxField[];
  groups: MetaxGroup[];
  gpsTags: string[];
  cover: { key: string; size: number; dataUrl: string | null } | null;
  fs: MetaxFsInfo;
  warnings: string[];
}

export type MetaxReadResult = MetaxInfo | { ok: false; error: string };

export interface MetaxWriteRequest {
  path: string;
  fields?: Record<string, string>;
  rawTags?: Record<string, string>;
  strip?: boolean;
  removeGps?: boolean;
  cover?: { path: string } | { remove: true } | null;
  outputPath?: string | null;
  backup?: boolean;
  preserveDates?: boolean;
}

export interface MetaxCheck {
  field: string;
  ok: boolean;
  expected: string;
  actual: string;
  normalized?: boolean;
}

export interface MetaxWriteResult {
  ok: boolean;
  error?: string;
  unchanged?: boolean;
  path?: string;
  backupPath?: string | null;
  verification?: MetaxCheck[];
  skipped?: string[];
  warnings?: string[];
}
