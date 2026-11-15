import { useSyncExternalStore } from 'react';
import type { SshSerialOptions, SshSessionStatusEvent, SshTransferProgress, SshTunnelRuntime, SshWatchEvent } from '../../global';

// Module-level state for DarkHub SSH: terminal tabs and their panes outlive the page component, so switching to
// another DarkHub screen and back keeps every session and its scrollback (replayed into a fresh xterm).

export type PaneStatus = SshSessionStatusEvent['status'];
export interface Pane { sessionId: string; hostId: string; title: string; status: PaneStatus; error?: string; kind?: 'ssh' | 'serial'; serial?: SshSerialOptions; logging?: boolean }
export interface TermTab { id: string; kind: 'terminal'; panes: Pane[]; direction: 'row' | 'col'; broadcast: boolean; activePane: string }
export interface SftpTab { id: string; kind: 'sftp'; hostId: string; title: string }
export interface EditorTab { id: string; kind: 'editor'; sftpId: string; side: 'local' | 'remote'; path: string; title: string; hostLabel: string; dirty: boolean }
export type Tab = TermTab | SftpTab | EditorTab;

interface State {
  tabs: Tab[];
  active: string; // 'vault' or a tab id
  transfers: Record<string, SshTransferProgress & { name: string }>;
  tunnels: Record<string, SshTunnelRuntime>;
  watches: Record<string, SshWatchEvent>;
}

let state: State = { tabs: [], active: 'vault', transfers: {}, tunnels: {}, watches: {} };
const listeners = new Set<() => void>();
const set = (patch: Partial<State> | ((s: State) => Partial<State>)) => {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
export const useSshStore = () => useSyncExternalStore(subscribe, () => state);
export const getSshState = () => state;

const rid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
export const newId = rid;

// ---------- output routing + scrollback replay ----------
const REPLAY_MAX = 512 * 1024;
const replay = new Map<string, string>();
const dataListeners = new Map<string, (data: string) => void>();
let wired = false;

function wire() {
  if (wired || !window.darkhub?.ssh) return;
  wired = true;
  const ssh = window.darkhub.ssh;
  ssh.on('ssh:session:data', ({ sessionId, data }) => {
    const prev = replay.get(sessionId) ?? '';
    const next = prev.length + data.length > REPLAY_MAX ? (prev + data).slice(-REPLAY_MAX) : prev + data;
    replay.set(sessionId, next);
    dataListeners.get(sessionId)?.(data);
  });
  ssh.on('ssh:session:status', (e) => updatePane(e.sessionId, { status: e.status, error: e.error }));
  ssh.on('ssh:sftp:progress', (p) => set((s) => ({ transfers: { ...s.transfers, [p.transferId]: { ...p, name: s.transfers[p.transferId]?.name ?? '' } } })));
  ssh.on('ssh:tunnel:status', (t) => set((s) => ({ tunnels: { ...s.tunnels, [t.tunnelId]: t } })));
  ssh.on('ssh:sftp:watch', (w) => set((s) => {
    const watches = { ...s.watches };
    if (w.status === 'stopped') delete watches[w.watchId]; else watches[w.watchId] = { ...watches[w.watchId], ...w };
    return { watches };
  }));
}

/** Attaches a terminal to a session's output. Returns the scrollback so far and an unsubscribe. */
export function attachOutput(sessionId: string, onData: (data: string) => void) {
  wire();
  dataListeners.set(sessionId, onData);
  return { backlog: replay.get(sessionId) ?? '', detach: () => { if (dataListeners.get(sessionId) === onData) dataListeners.delete(sessionId); } };
}

export function ensureWired() { wire(); }

/** Test hook: whether a pane still holds its one-off password. */
export const hasOneOffPassword = (sessionId: string) => oneOffPasswords.has(sessionId);

// ---------- tabs and panes ----------
function updatePane(sessionId: string, patch: Partial<Pane>) {
  set((s) => ({
    tabs: s.tabs.map((t) => (t.kind === 'terminal' && t.panes.some((p) => p.sessionId === sessionId)
      ? { ...t, panes: t.panes.map((p) => (p.sessionId === sessionId ? { ...p, ...patch } : p)) }
      : t))
  }));
}

export function setActive(id: string) { set({ active: id }); }

// one-off passwords typed for hosts without a saved credential: kept in memory only (never stored) for as long as the
// pane lives, so "reconnect" works; dropped when the pane or its tab closes
const oneOffPasswords = new Map<string, string>();
const started = new Set<string>();

/** Connects a pane's session once (safe against React remounts). */
export async function startSession(pane: Pane, cols: number, rows: number) {
  if (started.has(pane.sessionId)) return;
  started.add(pane.sessionId);
  const password = oneOffPasswords.get(pane.sessionId);
  const r = pane.kind === 'serial' && pane.serial
    ? await window.darkhub.ssh.serialConnect({ ...pane.serial, sessionId: pane.sessionId })
    : await window.darkhub.ssh.connect({ sessionId: pane.sessionId, hostId: pane.hostId, cols, rows, password });
  if (!r.ok) updatePane(pane.sessionId, { status: r.code === 'AUTH_FAILED' ? 'auth_failed' : r.code === 'HOSTKEY_REJECTED' ? 'hostkey_rejected' : 'error', error: r.error });
}

/** Reconnects a closed pane in place with a fresh session id. */
export function reconnectPane(tabId: string, sessionId: string) {
  replay.delete(sessionId);
  started.delete(sessionId);
  const next = rid('s');
  const password = oneOffPasswords.get(sessionId);
  oneOffPasswords.delete(sessionId);
  if (password) oneOffPasswords.set(next, password);
  set((s) => ({
    tabs: s.tabs.map((t) => (t.id === tabId && t.kind === 'terminal'
      ? { ...t, activePane: t.activePane === sessionId ? next : t.activePane, panes: t.panes.map((p) => (p.sessionId === sessionId ? { ...p, sessionId: next, status: 'connecting' as const, error: undefined } : p)) }
      : t))
  }));
}

export function openSerial(opts: SshSerialOptions, intoTab?: string, direction?: 'row' | 'col') {
  return openTerminal('', `${opts.port} · ${opts.baud}`, intoTab, direction, undefined, { kind: 'serial', serial: opts });
}

export function setPaneLogging(sessionId: string, logging: boolean) { updatePane(sessionId, { logging }); }

export function openTerminal(hostId: string, title: string, intoTab?: string, direction?: 'row' | 'col', password?: string, extra: Partial<Pane> = {}) {
  wire();
  const pane: Pane = { sessionId: rid('s'), hostId, title, status: 'connecting', kind: 'ssh', ...extra };
  if (password) oneOffPasswords.set(pane.sessionId, password);
  if (intoTab) {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === intoTab && t.kind === 'terminal'
        ? { ...t, panes: [...t.panes, pane].slice(0, 4), direction: direction ?? t.direction, activePane: pane.sessionId }
        : t))
    }));
  } else {
    const tab: TermTab = { id: rid('t'), kind: 'terminal', panes: [pane], direction: 'row', broadcast: false, activePane: pane.sessionId };
    set((s) => ({ tabs: [...s.tabs, tab], active: tab.id }));
  }
  return pane;
}

export function openSftpTab(hostId: string, title: string) {
  wire();
  const tab: SftpTab = { id: rid('f'), kind: 'sftp', hostId, title };
  set((s) => ({ tabs: [...s.tabs, tab], active: tab.id }));
}

export function patchTab(id: string, patch: Partial<TermTab>) {
  set((s) => ({ tabs: s.tabs.map((t) => (t.id === id && t.kind === 'terminal' ? { ...t, ...patch } : t)) }));
}

export function closePane(tabId: string, sessionId: string) {
  void window.darkhub?.ssh?.disconnect(sessionId);
  replay.delete(sessionId);
  oneOffPasswords.delete(sessionId);
  set((s) => {
    const tabs: Tab[] = [];
    for (const t of s.tabs) {
      if (t.id !== tabId || t.kind !== 'terminal') { tabs.push(t); continue; }
      const panes = t.panes.filter((p) => p.sessionId !== sessionId);
      if (panes.length) tabs.push({ ...t, panes, activePane: panes.some((p) => p.sessionId === t.activePane) ? t.activePane : panes[0].sessionId, broadcast: panes.length > 1 && t.broadcast });
    }
    return { tabs, active: tabs.some((t) => t.id === s.active) ? s.active : tabs[tabs.length - 1]?.id ?? 'vault' };
  });
}

export function openEditor(sftpId: string, side: 'local' | 'remote', path: string, hostLabel: string) {
  const existing = state.tabs.find((t) => t.kind === 'editor' && t.sftpId === sftpId && t.side === side && t.path === path);
  if (existing) { set({ active: existing.id }); return; }
  const name = path.split(/[\/]/).filter(Boolean).pop() ?? path;
  const tab: EditorTab = { id: rid('e'), kind: 'editor', sftpId, side, path, title: name, hostLabel, dirty: false };
  set((s) => ({ tabs: [...s.tabs, tab], active: tab.id }));
}

export function setEditorDirty(id: string, dirty: boolean) {
  if (state.tabs.some((t) => t.id === id && t.kind === 'editor' && t.dirty !== dirty)) set((s) => ({ tabs: s.tabs.map((t) => (t.id === id && t.kind === 'editor' ? { ...t, dirty } : t)) }));
}

/** Tabs that would be lost by closing this one (editors of an SFTP tab ride on its connection). */
export function dependentsOf(id: string) {
  const tab = state.tabs.find((t) => t.id === id);
  return tab?.kind === 'sftp' ? state.tabs.filter((t) => t.kind === 'editor' && t.side === 'remote' && t.sftpId === id) as EditorTab[] : [];
}

export function closeTab(id: string) {
  const tab = state.tabs.find((t) => t.id === id);
  if (tab?.kind === 'terminal') for (const p of tab.panes) { void window.darkhub?.ssh?.disconnect(p.sessionId); replay.delete(p.sessionId); oneOffPasswords.delete(p.sessionId); }
  if (tab?.kind === 'sftp') void window.darkhub?.ssh?.sftpClose(tab.id);
  const drop = new Set([id, ...dependentsOf(id).map((t) => t.id)]);
  set((s) => {
    const tabs = s.tabs.filter((t) => !drop.has(t.id));
    return { tabs, active: s.active === id ? tabs[tabs.length - 1]?.id ?? 'vault' : s.active };
  });
}

export function rememberTransfer(transferId: string, name: string, sftpId: string, direction: 'upload' | 'download', totalBytes = 0) {
  set((s) => ({ transfers: { ...s.transfers, [transferId]: { transferId, sftpId, direction, transferredBytes: 0, totalBytes, speedBps: 0, status: 'running', name } } }));
}

export function clearFinishedTransfers() {
  set((s) => ({ transfers: Object.fromEntries(Object.entries(s.transfers).filter(([, t]) => t.status === 'running')) }));
}
