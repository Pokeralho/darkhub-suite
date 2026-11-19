import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Server, Key, Route, Code, ShieldCheck, Terminal, FolderOpen, X, Plus, LayoutTemplate, Radio, AlertTriangle, Search, Settings, FileCode, Usb } from '../components/icons';
import PageHeader from '../components/ui/PageHeader';
import { useI18n } from '../i18n/I18nProvider';
import type { SshAuthPrompt, SshHostKeyPrompt, SshVaultState } from '../global';
import HostsView, { useConnect } from '../components/ssh/HostsView';
import KeychainView, { KnownHostsView, HostKeyPrompt } from '../components/ssh/KeychainView';
import SnippetsView, { SnippetRunnerPanel } from '../components/ssh/SnippetsView';
import TunnelsView from '../components/ssh/TunnelsView';
import { TerminalSettingsDrawer, AuthPromptModal, SerialDrawer } from '../components/ssh/SshExtras';
import {
  useSshStore, setActive, closeTab, closePane, patchTab, openTerminal, openSftpTab, ensureWired, setPaneLogging, dependentsOf, getSshState, type TermTab
} from '../components/ssh/sshStore';
import { Modal } from '../components/ssh/ui';

const EditorTabView = lazy(() => import('../components/ssh/EditorTabView'));
// xterm and the SFTP browser are heavy: load them with the first terminal / SFTP tab, not with the screen.
const TerminalPane = lazy(() => import('../components/ssh/TerminalPane'));
const SftpView = lazy(() => import('../components/ssh/SftpView'));
const PaneFallback = () => <div className="flex-1 min-w-0 min-h-0 rounded-xl bg-zinc-900 animate-pulse" />;

type Section = 'hosts' | 'keychain' | 'tunnels' | 'snippets' | 'knownHosts';

function QuickConnect({ vault, onPick, onClose, title }: { vault: SshVaultState; onPick: (hostId: string) => void; onClose: () => void; title?: string }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const list = vault.hosts.filter((h) => !q || `${h.label} ${h.hostname} ${h.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase())).slice(0, 12);
  return (
    <Modal title={title ?? t('ssh.quick.title', 'Conectar a...')} onClose={onClose}>
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input autoFocus className="dh-input w-full pl-8" value={q} onChange={(e) => { setQ(e.target.value); setI(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(list.length - 1, x + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
            if (e.key === 'Enter' && list[i]) onPick(list[i].id);
            if (e.key === 'Escape') onClose();
          }} />
      </div>
      <div className="divide-y divide-zinc-900 max-h-[50vh] overflow-y-auto">
        {list.map((h, idx) => (
          <button type="button" key={h.id} onClick={() => onPick(h.id)} className={`w-full text-left px-2 py-1.5 rounded ${idx === i ? 'bg-blue-500/15' : 'hover:bg-zinc-900'}`}>
            <div className="text-[13px] text-zinc-100">{h.label}</div>
            <div className="text-[11.5px] font-mono text-zinc-500">{h.username}@{h.hostname}</div>
          </button>
        ))}
        {!list.length ? <p className="text-[12.5px] text-zinc-500 py-2">{t('ssh.host.noMatch', 'Nenhum host corresponde à busca.')}</p> : null}
      </div>
    </Modal>
  );
}

const MODE_HINT_KEY = 'darkhub.ssh.modeHintSeen';
const hintSeen = () => { try { return localStorage.getItem(MODE_HINT_KEY) === '1'; } catch { return true; } };

function TerminalTabView({ tab, vault, visible, reload }: { tab: TermTab; vault: SshVaultState; visible: boolean; reload: () => Promise<void> }) {
  const { t } = useI18n();
  // one-time offer of the Notepad-style shortcuts for people new to terminals
  const [modeHint, setModeHint] = useState(() => !hintSeen() && vault.settings.terminal.keyMode === 'classic');
  const closeHint = () => { try { localStorage.setItem(MODE_HINT_KEY, '1'); } catch { /* storage off */ } setModeHint(false); };
  const useSimple = async () => {
    await window.darkhub.ssh.saveSettings({ terminal: { keyMode: 'simple', commandBox: true } });
    closeHint();
    await reload();
  };
  const [runner, setRunner] = useState(false);
  const [splitPick, setSplitPick] = useState<'row' | 'col' | null>(null);
  const targets = tab.broadcast ? tab.panes.filter((p) => p.status === 'connected').map((p) => p.sessionId) : null;
  const settings = vault.settings.terminal;
  const themeOf = (hostId: string) => vault.hosts.find((h) => h.id === hostId)?.themeId ?? settings.defaultThemeId;
  const split = (direction: 'row' | 'col', hostId: string) => {
    const h = vault.hosts.find((x) => x.id === hostId);
    if (h) openTerminal(h.id, h.label, tab.id, direction);
    setSplitPick(null);
  };
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); if (tab.panes.length < 4) setSplitPick(e.altKey ? 'col' : 'row'); }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'b' && tab.panes.length > 1) { e.preventDefault(); patchTab(tab.id, { broadcast: !tab.broadcast }); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [visible, tab.panes.length, tab.broadcast, tab.id]);

  return (
    <div className={`${visible ? 'flex' : 'hidden'} flex-col h-full min-h-0`}>
      <div className="flex flex-wrap items-center gap-2 pb-2">
        <button type="button" className="dh-btn dh-btn-sm" disabled={tab.panes.length >= 4} title="Ctrl+Shift+D" onClick={() => setSplitPick('row')}><LayoutTemplate size={13} />{t('ssh.term.splitH', 'Dividir lado a lado')}</button>
        <button type="button" className="dh-btn dh-btn-sm" disabled={tab.panes.length >= 4} title="Ctrl+Shift+Alt+D" onClick={() => setSplitPick('col')}><LayoutTemplate size={13} className="rotate-90" />{t('ssh.term.splitV', 'Dividir em cima/embaixo')}</button>
        <button type="button" className={`dh-btn dh-btn-sm ${tab.broadcast ? 'border-amber-500/70 text-amber-200 bg-amber-500/10' : ''}`} disabled={tab.panes.length < 2}
          title={`${t('ssh.term.broadcastHelp', 'O que você digitar vai para todos os painéis desta aba.')} (Ctrl+Shift+B)`}
          onClick={() => patchTab(tab.id, { broadcast: !tab.broadcast })}><Radio size={13} />{tab.broadcast ? t('ssh.term.broadcastStop', 'Parar transmissão') : t('ssh.term.broadcast', 'Transmitir para todos')}</button>
        <span className="flex-1" />
        <button type="button" className={`dh-btn dh-btn-sm ${runner ? 'text-blue-200' : ''}`} onClick={() => setRunner((r) => !r)}><Code size={13} />{t('ssh.nav.snippets', 'Snippets')}</button>
      </div>
      {modeHint ? (
        <div className="flex flex-wrap items-center gap-2 mb-2 px-3 py-1.5 rounded-lg border border-blue-500/40 bg-blue-500/10 text-[12px] text-blue-100">
          <span className="flex-1 min-w-[240px]">{t('ssh.hint.text', 'Novo no terminal? No modo Simples, Ctrl+C copia, Ctrl+V cola e você escreve o comando numa caixa como a de um editor de texto.')}</span>
          <button type="button" className="dh-btn dh-btn-sm dh-btn-accent" onClick={() => void useSimple()}>{t('ssh.hint.use', 'Usar o modo Simples')}</button>
          <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" onClick={closeHint}>{t('ssh.hint.keep', 'Manter o clássico')}</button>
        </div>
      ) : null}
      {tab.broadcast ? (
        <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 text-[12px] text-amber-200">
          <AlertTriangle size={13} />{t('ssh.term.broadcastBanner', 'Transmissão ativa: cada tecla vai para {n} servidores.').replace('{n}', String(targets?.length ?? 0))}
        </div>
      ) : null}
      <div className="flex flex-1 min-h-0">
        <div className={`flex flex-1 min-h-0 min-w-0 gap-2 ${tab.direction === 'col' ? 'flex-col' : 'flex-row'}`}>
          {tab.panes.map((p) => {
            const host = vault.hosts.find((h) => h.id === p.hostId);
            return (
              <Suspense key={p.sessionId} fallback={<PaneFallback />}>
              <TerminalPane tabId={tab.id} pane={p} themeId={themeOf(p.hostId)} visible={visible} settings={settings}
                focused={tab.activePane === p.sessionId} broadcastTargets={targets}
                onOpenSftp={host && p.kind !== 'serial' ? () => openSftpTab(host.id, host.label) : undefined}
                onFocus={() => { if (tab.activePane !== p.sessionId) patchTab(tab.id, { activePane: p.sessionId }); }}
                onClose={() => closePane(tab.id, p.sessionId)} />
              </Suspense>
            );
          })}
        </div>
        {runner ? <SnippetRunnerPanel vault={vault} sessionIds={targets?.length ? targets : [tab.activePane]} onClose={() => setRunner(false)} /> : null}
      </div>
      {splitPick ? <QuickConnect vault={vault} onClose={() => setSplitPick(null)} onPick={(id) => split(splitPick, id)} /> : null}
    </div>
  );
}

export default function SshClient() {
  const { t } = useI18n();
  const store = useSshStore();
  const [vault, setVault] = useState<SshVaultState | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [section, setSection] = useState<Section>('hosts');
  const [prompts, setPrompts] = useState<SshHostKeyPrompt[]>([]);
  const [authPrompts, setAuthPrompts] = useState<SshAuthPrompt[]>([]);
  const [quick, setQuick] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [serialOpen, setSerialOpen] = useState(false);
  const api = window.darkhub?.ssh;

  const reload = useCallback(async () => {
    if (!api) { setLoadErr(t('ssh.noBackend', 'O backend SSH não está disponível nesta janela.')); return; }
    const r = await api.getState().catch((e) => ({ ok: false as const, code: 'ERROR', error: String(e?.message ?? e) }));
    if (!r.ok) { setLoadErr(r.error); return; }
    setLoadErr('');
    setVault(r);
    setPrompts(r.pendingHostKeys);
    setAuthPrompts(r.pendingAuth ?? []);
    for (const s of r.sessions) setPaneLogging(s.sessionId, s.logging);
  }, [api, t]);

  useEffect(() => {
    ensureWired();
    void reload();
    if (!api) return;
    const offs = [
      api.on('ssh:hostkey:prompt', (p) => setPrompts((x) => (x.some((y) => y.requestId === p.requestId) ? x : [...x, p]))),
      api.on('ssh:hostkey:resolved', (e) => { setPrompts((x) => x.filter((y) => y.requestId !== e.requestId)); void reload(); }),
      api.on('ssh:auth:prompt', (p) => setAuthPrompts((x) => (x.some((y) => y.requestId === p.requestId) ? x : [...x, p]))),
      api.on('ssh:auth:resolved', (e) => setAuthPrompts((x) => x.filter((y) => y.requestId !== e.requestId))),
      api.on('ssh:session:status', (e) => { if (e.status === 'connected' || e.status === 'closed') void reload(); })
    ];
    return () => offs.forEach((off) => off());
  }, [api, reload]);

  const { connect, prompt: pwPrompt } = useConnect(vault ?? ({ credentials: [], hosts: [] } as unknown as SshVaultState));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 't') { e.preventDefault(); setQuick(true); }
      // Ctrl+Tab / Ctrl+Shift+Tab cycle through the tabs
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        const ids = ['vault', ...getSshState().tabs.map((x) => x.id)];
        const i = ids.indexOf(getSshState().active);
        setActive(ids[(i + (e.shiftKey ? ids.length - 1 : 1)) % ids.length]);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const requestClose = (id: string) => {
    const tab = store.tabs.find((x) => x.id === id);
    if (!tab) return;
    const dirty = [tab, ...dependentsOf(id)].flatMap((x) => (x.kind === 'editor' && x.dirty ? [x.title] : []));
    if (dirty.length && !window.confirm(t('ssh.ed.confirmClose', 'Há alterações não salvas em {n}. Fechar mesmo assim?').replace('{n}', dirty.join(', ')))) return;
    const live = tab.kind === 'terminal' && tab.panes.some((p) => p.status === 'connected');
    if (live && vault?.settings.terminal.confirmClose && !window.confirm(t('ssh.term.confirmClose', 'Encerrar as sessões desta aba?'))) return;
    closeTab(id);
  };

  const nav = useMemo(() => [
    { id: 'hosts' as Section, label: t('ssh.nav.hosts', 'Hosts'), icon: Server },
    { id: 'keychain' as Section, label: t('ssh.nav.keychain', 'Keychain'), icon: Key },
    { id: 'tunnels' as Section, label: t('ssh.nav.tunnels', 'Port forwarding'), icon: Route },
    { id: 'snippets' as Section, label: t('ssh.nav.snippets', 'Snippets'), icon: Code },
    { id: 'knownHosts' as Section, label: t('ssh.nav.knownHosts', 'Known hosts e logs'), icon: ShieldCheck }
  ], [t]);

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] min-h-[520px]">
      <PageHeader title={t('ssh.title', 'DarkHub SSH')} subtitle={t('ssh.subtitle', 'Servidores, chaves, terminal com abas e divisão, SFTP, snippets e túneis em um só lugar. Tudo guardado criptografado neste PC.')}
        actions={<>
          <button type="button" className="dh-btn" onClick={() => setSerialOpen(true)}><Usb size={14} />{t('ssh.serial.button', 'Serial')}</button>
          <button type="button" className="dh-btn dh-btn-ghost" title={t('ssh.set.title', 'Configurações do terminal')} disabled={!vault} onClick={() => setSettingsOpen(true)}><Settings size={14} /></button>
          <button type="button" className="dh-btn" onClick={() => setQuick(true)} title="Ctrl+Shift+T"><Plus size={14} />{t('ssh.quick.button', 'Conexão rápida')}</button>
        </>} />

      <div className="flex items-center gap-1 -mt-3 mb-3 overflow-x-auto border-b border-zinc-900">
        <button type="button" onClick={() => setActive('vault')} className={`flex items-center gap-1.5 h-8 px-3 text-[12.5px] border-b-2 shrink-0 ${store.active === 'vault' ? 'border-blue-400 text-zinc-50' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}><Server size={13} />{t('ssh.tab.vault', 'Cofre')}</button>
        {store.tabs.map((tb) => {
          const title = tb.kind === 'terminal' ? (tb.panes.length > 1 ? `${tb.panes[0].title} +${tb.panes.length - 1}` : tb.panes[0]?.title) : tb.title;
          const live = tb.kind === 'terminal' && tb.panes.some((p) => p.status === 'connected');
          return (
            <div key={tb.id} className={`group flex items-center gap-1.5 h-8 pl-3 pr-1.5 text-[12.5px] border-b-2 cursor-pointer shrink-0 ${store.active === tb.id ? 'border-blue-400 text-zinc-50' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
              onClick={() => setActive(tb.id)} onAuxClick={(e) => { if (e.button === 1) requestClose(tb.id); }} title={tb.kind === 'editor' ? `${tb.hostLabel}:${tb.path}` : undefined}>
              {tb.kind === 'terminal' ? (tb.panes[0]?.kind === 'serial' ? <Usb size={13} /> : <Terminal size={13} />) : tb.kind === 'sftp' ? <FolderOpen size={13} /> : <FileCode size={13} />}
              {tb.kind === 'terminal' ? <span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-emerald-400' : 'bg-zinc-600'}`} /> : null}
              <span className="max-w-[160px] truncate font-mono">{title}</span>
              {tb.kind === 'editor' && tb.dirty ? <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title={t('ssh.ed.unsaved', 'não salvo')} /> : null}
              {tb.kind === 'terminal' && tb.broadcast ? <Radio size={12} className="text-amber-300" /> : null}
              <button type="button" className="ml-1 text-zinc-600 hover:text-zinc-200" onClick={(e) => { e.stopPropagation(); requestClose(tb.id); }}><X size={12} /></button>
            </div>
          );
        })}
      </div>

      <div className="flex-1 min-h-0">
        {store.active === 'vault' ? (
          <div className="flex h-full min-h-0 gap-6">
            <nav className="w-48 shrink-0 space-y-0.5">
              {nav.map((n) => (
                <button type="button" key={n.id} onClick={() => setSection(n.id)} className={`w-full flex items-center gap-2 h-8 px-2.5 rounded-md text-[13px] ${section === n.id ? 'bg-zinc-900 text-zinc-50' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'}`}>
                  <n.icon size={15} className={section === n.id ? 'text-blue-300' : ''} />{n.label}
                  {n.id === 'hosts' && vault ? <span className="ml-auto font-mono text-[11px] text-zinc-500">{vault.hosts.length}</span> : null}
                </button>
              ))}
            </nav>
            <div className="flex-1 min-w-0 overflow-y-auto pr-1">
              {loadErr ? (
                <div className="space-y-2"><p className="text-[13px] text-red-300">{loadErr}</p><button type="button" className="dh-btn" onClick={() => void reload()}>{t('ssh.retry', 'Tentar de novo')}</button></div>
              ) : !vault ? (
                <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-20 rounded-xl bg-zinc-900 animate-pulse" />)}</div>
              ) : section === 'hosts' ? <HostsView vault={vault} reload={reload} />
                : section === 'keychain' ? <KeychainView vault={vault} reload={reload} />
                : section === 'tunnels' ? <TunnelsView vault={vault} reload={reload} />
                : section === 'snippets' ? <SnippetsView vault={vault} reload={reload} />
                : <KnownHostsView vault={vault} reload={reload} />}
            </div>
          </div>
        ) : null}
        {vault ? store.tabs.map((tb) => {
          if (tb.kind === 'terminal') return <TerminalTabView key={tb.id} tab={tb} vault={vault} visible={tb.id === store.active} reload={reload} />;
          if (tb.kind === 'sftp') return <div key={tb.id} className={tb.id === store.active ? 'h-full' : 'hidden'}><Suspense fallback={<PaneFallback />}><SftpView sftpId={tb.id} hostId={tb.hostId} vault={vault} visible={tb.id === store.active} /></Suspense></div>;
          return (
            <Suspense key={tb.id} fallback={tb.id === store.active ? <div className="h-full rounded-xl bg-zinc-900 animate-pulse" /> : null}>
              <EditorTabView tab={tb} visible={tb.id === store.active} />
            </Suspense>
          );
        }) : null}
      </div>

      {quick && vault ? <QuickConnect vault={vault} onClose={() => setQuick(false)} onPick={(id) => { setQuick(false); const h = vault.hosts.find((x) => x.id === id); if (h) connect(h); }} /> : null}
      {settingsOpen && vault ? <TerminalSettingsDrawer settings={vault.settings.terminal} onClose={() => setSettingsOpen(false)} onSaved={() => void reload()} /> : null}
      {serialOpen ? <SerialDrawer onClose={() => setSerialOpen(false)} /> : null}
      {pwPrompt}
      {prompts[0] ? <HostKeyPrompt key={prompts[0].requestId} prompt={prompts[0]} onDone={() => setPrompts((x) => x.slice(1))} /> : null}
      {!prompts[0] && authPrompts[0] ? <AuthPromptModal key={authPrompts[0].requestId} prompt={authPrompts[0]} onDone={() => setAuthPrompts((x) => x.slice(1))} /> : null}
    </div>
  );
}
