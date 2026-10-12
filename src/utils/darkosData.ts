// Tolerant normalizers for DarkOS module output. The module (DarkOS.Recovery.psm1) owns the data;
// the UI only reads it, so every field is optional and unknown shapes degrade to empty lists.
import type { DarkOSCatalogEntry, DarkOSManifest, DarkOSProfileId, DarkOSSnapshot } from '../types/darkos';

export const DARKOS_PROFILES: DarkOSProfileId[] = ['darkosDefault', 'competitive', 'maxPerformance'];

export function asArray<T = any>(data: any, keys: string[] = []): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    for (const k of keys) if (Array.isArray(data[k])) return data[k] as T[];
  }
  return [];
}

export interface DarkOSRow extends DarkOSCatalogEntry {
  status: string;
  lastError?: string | null;
  lastTs?: string;
  verified?: boolean;
}

export function mergeChanges(catalogData: any, manifest: DarkOSManifest | null | undefined): DarkOSRow[] {
  const catalog = asArray<DarkOSCatalogEntry>(catalogData, ['changes', 'catalog', 'items']);
  const byId = new Map<string, any>();
  for (const c of manifest?.changes ?? []) if (c && typeof c.id === 'string') byId.set(c.id, c);
  const rows: DarkOSRow[] = catalog
    .filter((c) => c && typeof c.id === 'string')
    .map((c) => {
      const m = byId.get(c.id);
      return {
        ...c,
        status: m?.status || 'notApplied',
        lastError: m?.lastResult?.error ?? null,
        lastTs: m?.lastResult?.ts,
        verified: m?.lastResult?.verified
      };
    });
  // Manifest entries missing from the catalog are still shown (read-only info).
  const known = new Set(rows.map((r) => r.id));
  for (const [id, m] of byId) {
    if (!known.has(id)) rows.push({ id, status: m?.status || 'unknown', lastError: m?.lastResult?.error ?? null, category: 'other' });
  }
  return rows;
}

export function countStatuses(rows: DarkOSRow[]) {
  const out: Record<string, number> = { applied: 0, reverted: 0, failed: 0, 'pending-reboot': 0, notApplied: 0 };
  for (const r of rows) out[r.status] = (out[r.status] ?? 0) + 1;
  return out;
}

const isOn = (s: string) => s === 'applied' || s === 'pending-reboot';

/** Concise diff between the active profile and a target profile, based on catalog membership + live status. */
export function profileDiff(rows: DarkOSRow[], target: DarkOSProfileId) {
  const apply: DarkOSRow[] = [];
  const revert: DarkOSRow[] = [];
  for (const r of rows) {
    const inTarget = Array.isArray(r.profiles) && r.profiles.includes(target);
    if (inTarget && !isOn(r.status)) apply.push(r);
    else if (!inTarget && isOn(r.status) && Array.isArray(r.profiles) && r.profiles.length > 0) revert.push(r);
  }
  const security = apply.filter((r) => r.securityRelated === true);
  return { apply, revert, security };
}

export interface RemovedApp { packageName: string; displayName: string; restorable: boolean; installed?: boolean }

export function normalizeRemovedApps(data: any): RemovedApp[] {
  return asArray(data, ['apps', 'packages', 'removed'])
    .map((a: any) => {
      const packageName = String(a?.packageName ?? a?.PackageName ?? a?.name ?? a?.Name ?? '');
      const restorable = a?.restorable ?? a?.payloadAvailable ?? a?.hasPayload ?? Boolean(a?.payload ?? a?.payloadPath);
      const app: RemovedApp = { packageName, displayName: String(a?.displayName ?? a?.DisplayName ?? packageName), restorable: restorable === true };
      if (a?.currentlyInstalled === true) app.installed = true;
      return app;
    })
    .filter((a) => a.packageName);
}

export interface DarkOSFailure { id: string; ts?: string; action?: string; error: string }

export function normalizeFailures(data: any): DarkOSFailure[] {
  return asArray(data, ['failures', 'items', 'changes']).map((f: any) => ({
    id: String(f?.id ?? f?.Id ?? '?'),
    ts: f?.ts ?? f?.lastResult?.ts,
    action: f?.action ?? f?.lastResult?.action,
    error: String(f?.error ?? f?.lastResult?.error ?? f?.message ?? 'Erro sem detalhes')
  }));
}

export function normalizeReboot(data: any): { pending: boolean; ids: string[] } {
  if (typeof data === 'boolean') return { pending: data, ids: [] };
  const ids = asArray<string>(data, ['pendingChanges', 'ids', 'changes']).map((x: any) => (typeof x === 'string' ? x : String(x?.id ?? ''))).filter(Boolean);
  const pending = data?.pending === true || data?.rebootPending === true || data?.RebootPending === true || ids.length > 0;
  return { pending, ids };
}

export function normalizeSnapshots(data: any): DarkOSSnapshot[] {
  return asArray<DarkOSSnapshot>(data, ['snapshots', 'items']).filter((s) => s && typeof s.id === 'string');
}
