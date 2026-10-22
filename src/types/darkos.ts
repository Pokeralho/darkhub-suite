// Types for the DarkOS management bridge (window.darkhub.darkos). Shapes follow
// C:\ProgramData\DarkOS docs (CONTRACT v1); every field is treated as optional by the UI.

export type DarkOSProfileId = 'darkosDefault' | 'competitive' | 'maxPerformance';

export interface DarkOSCatalogEntry {
  id: string;
  description?: string;
  category?: string;
  component?: string;
  profiles?: DarkOSProfileId[];
  scope?: string;
  securityRelated?: boolean;
  requiresConfirmation?: boolean;
  rebootRequired?: boolean;
  explorerRestart?: boolean;
  reversible?: 'reversible' | 'payload' | 'nonReversible' | string;
}

export interface DarkOSManifestChange {
  id: string;
  status?: 'applied' | 'reverted' | 'failed' | 'pending-reboot' | 'notApplied' | string;
  lastResult?: { ts?: string; action?: string; ok?: boolean; verified?: boolean; error?: string | null; source?: string };
}

export interface DarkOSManifest {
  schemaVersion?: number;
  darkosVersion?: string;
  osBuild?: string;
  activeProfile?: DarkOSProfileId | string;
  changes?: DarkOSManifestChange[];
  snapshots?: DarkOSSnapshot[];
}

export interface DarkOSSnapshot { id: string; ts?: string; label?: string; path?: string }

export interface DarkOSChangeResult {
  id: string;
  ok: boolean;
  verified: boolean;
  rebootRequired: boolean;
  pendingReboot?: boolean;
  skipped?: boolean;
  error: string | null;
}

export interface DarkOSChangeResponse {
  ok: boolean;
  status?: 'ok' | 'pending-reboot' | 'failed';
  message?: string;
  pending?: DarkOSChangeResult[];
  skipped?: DarkOSChangeResult[];
  noop?: boolean;
  results?: DarkOSChangeResult[];
  failed?: DarkOSChangeResult[];
  rebootRequired?: boolean;
  error?: string | null;
  runId?: string;
}

export interface DarkOSReadResponse<T = any> { ok: boolean; data?: T; error?: string }

export interface DarkOSInfo {
  ok: boolean;
  isDarkOS: boolean;
  /** 'windows': DarkOS tweaks applied one by one on a stock Windows (own state folder). */
  mode?: 'darkos' | 'windows';
  root?: string;
  cliAvailable?: boolean;
  cliSource?: 'installed' | 'bundled' | null;
  busy?: boolean;
  /** Command currently running in the main process (null when idle). */
  current?: { runId: string; command: string; label: string; startedAt: number } | null;
}

export interface DarkOSRunEvent {
  runId?: string;
  type: string;
  message?: string;
  progress?: number;
  ok?: boolean;
  error?: string;
  timestamp?: number;
}

export interface DarkOSAPI {
  isDarkOS: () => Promise<DarkOSInfo>;
  getCatalog: (payload?: { profile?: DarkOSProfileId }) => Promise<DarkOSReadResponse<DarkOSCatalogEntry[]>>;
  getManifest: () => Promise<DarkOSReadResponse<DarkOSManifest>>;
  getStatus: (payload?: { ids?: string[] }) => Promise<DarkOSReadResponse<any>>;
  applyChange: (payload: { ids: string[]; confirmSecurity?: boolean }) => Promise<DarkOSChangeResponse>;
  revertChange: (payload: { ids: string[]; confirmSecurity?: boolean }) => Promise<DarkOSChangeResponse>;
  reinstallEdge: () => Promise<{ ok: boolean; msg?: string; error?: string }>;
  setProfile: (payload: { profile: DarkOSProfileId; confirmSecurity?: boolean }) => Promise<DarkOSChangeResponse>;
  restoreProfile: () => Promise<DarkOSChangeResponse>;
  getRemovedApps: () => Promise<DarkOSReadResponse<any>>;
  restoreAppx: (payload: { packageNames: string[] }) => Promise<DarkOSChangeResponse>;
  listSnapshots: () => Promise<DarkOSReadResponse<DarkOSSnapshot[] | { snapshots?: DarkOSSnapshot[] }>>;
  createSnapshot: (payload?: { label?: string }) => Promise<{ ok: boolean; snapshot?: DarkOSSnapshot; error?: string }>;
  restoreSnapshot: (payload: { id: string }) => Promise<DarkOSChangeResponse>;
  getFailures: () => Promise<DarkOSReadResponse<any>>;
  getRebootPending: () => Promise<DarkOSReadResponse<any>>;
  exportDiagnostics: () => Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string }>;
  onRunEvent: (callback: (evt: DarkOSRunEvent) => void) => () => void;
}
