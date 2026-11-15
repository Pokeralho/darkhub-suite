import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { RefreshCw, X, Search, Loader2, FolderOpen, FileText, Zap } from '../icons';
import type { SshTerminalSettings } from '../../global';
import { useI18n } from '../../i18n/I18nProvider';
import { attachOutput, startSession, reconnectPane, setPaneLogging, type Pane } from './sshStore';
import { themeById } from './terminalThemes';

interface Props {
  tabId: string;
  pane: Pane;
  themeId: string;
  focused: boolean;
  broadcastTargets: string[] | null; // all panes of the tab when broadcast is armed
  onFocus: () => void;
  onClose: () => void;
  visible: boolean;
  settings: SshTerminalSettings;
  onOpenSftp?: () => void;
}

let bellCtx: AudioContext | null = null;
function beep() {
  try {
    bellCtx ??= new AudioContext();
    const o = bellCtx.createOscillator(); const g = bellCtx.createGain();
    o.frequency.value = 880; g.gain.value = 0.04; o.connect(g); g.connect(bellCtx.destination);
    o.start(); o.stop(bellCtx.currentTime + 0.08);
  } catch { /* no audio */ }
}

export default function TerminalPane({ tabId, pane, themeId, focused, broadcastTargets, onFocus, onClose, visible, settings, onOpenSftp }: Props) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);
  const search = useRef<SearchAddon | null>(null);
  const targets = useRef<string[] | null>(broadcastTargets);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [zoom, setZoom] = useState(0);
  const [logNote, setLogNote] = useState('');
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  targets.current = broadcastTargets;
  const isSerial = pane.kind === 'serial';

  // one xterm per session id: a reconnect gets a fresh terminal
  // Created on the next frame: React StrictMode mounts, unmounts and mounts again, and an xterm disposed right after
  // open() throws "reading 'dimensions'" from its pending viewport refresh.
  useEffect(() => {
    let cleanup: (() => void) | null = null;
    const raf = requestAnimationFrame(() => { cleanup = mount(); });
    return () => { cancelAnimationFrame(raf); cleanup?.(); };
    function mount(): (() => void) | null {
    if (!box.current) return null;
    const st = settingsRef.current;
    const xt = new Terminal({
      fontFamily: `"${st.fontFamily}", "Geist Mono Variable", "Cascadia Mono", Consolas, monospace`,
      fontSize: st.fontSize,
      lineHeight: st.lineHeight,
      cursorBlink: st.cursorBlink,
      cursorStyle: st.cursorStyle,
      scrollback: st.scrollback,
      allowProposedApi: false,
      rightClickSelectsWord: !st.rightClickPaste,
      theme: themeById(themeId).theme
    });
    const fa = new FitAddon();
    const sa = new SearchAddon();
    xt.loadAddon(fa);
    xt.loadAddon(sa);
    xt.loadAddon(new WebLinksAddon((_e, uri) => { void window.darkhub?.shell?.openExternal(uri); }));
    xt.open(box.current);
    term.current = xt;
    fit.current = fa;
    search.current = sa;
    try { fa.fit(); } catch { /* hidden */ }

    const { backlog, detach } = attachOutput(pane.sessionId, (d) => xt.write(d));
    if (backlog) xt.write(backlog);
    void startSession(pane, xt.cols, xt.rows);

    const input = xt.onData((d) => {
      const ids = targets.current?.length ? targets.current : [pane.sessionId];
      void window.darkhub.ssh.write(ids, d);
    });
    const sel = xt.onSelectionChange(() => { if (settingsRef.current.copyOnSelect) { const txt = xt.getSelection(); if (txt) void navigator.clipboard.writeText(txt); } });
    const bell = xt.onBell(() => { if (settingsRef.current.bell) beep(); });
    const paste = () => void navigator.clipboard.readText().then((txt) => { if (txt) { const ids = targets.current?.length ? targets.current : [pane.sessionId]; void window.darkhub.ssh.write(ids, txt); } });
    const onContext = (e: MouseEvent) => {
      if (!settingsRef.current.rightClickPaste) return;
      e.preventDefault();
      const txt = xt.getSelection();
      if (txt) { void navigator.clipboard.writeText(txt); xt.clearSelection(); } else paste();
    };
    box.current.addEventListener('contextmenu', onContext);
    const boxEl = box.current;
    // Ctrl+Shift+C / Ctrl+Shift+V copy/paste, Ctrl+Shift+F search; everything else goes to the remote shell
    xt.attachCustomKeyEventHandler((e) => {
      if (e.type === 'keydown' && e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === '=' || e.key === '+' || e.key === '-' || e.key === '0')) {
        setZoom((z) => (e.key === '0' ? 0 : Math.max(-6, Math.min(16, z + (e.key === '-' ? -1 : 1)))));
        return false;
      }
      if (e.type !== 'keydown' || !e.ctrlKey || !e.shiftKey) return true;
      const k = e.key.toLowerCase();
      if (k === 'c') { const sel = xt.getSelection(); if (sel) void navigator.clipboard.writeText(sel); return false; }
      if (k === 'v') { paste(); return false; }
      if (k === 'f') { setSearchOpen(true); return false; }
      return true;
    });

    // fit + resize debounced by 50 ms and only when cols/rows really changed (split panes resize in loops otherwise)
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last = `${xt.cols}x${xt.rows}`;
    const ro = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!box.current || box.current.offsetWidth === 0) return;
        try { fa.fit(); } catch { return; }
        const now = `${xt.cols}x${xt.rows}`;
        if (now !== last) { last = now; void window.darkhub.ssh.resize(pane.sessionId, xt.cols, xt.rows); }
      }, 50);
    });
    ro.observe(box.current);
    return () => {
      ro.disconnect();
      if (timer) clearTimeout(timer);
      input.dispose();
      sel.dispose();
      bell.dispose();
      boxEl.removeEventListener('contextmenu', onContext);
      detach();
      xt.dispose();
      term.current = null;
    };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane.sessionId]);

  useEffect(() => { if (term.current) term.current.options.theme = themeById(themeId).theme; }, [themeId]);
  // live settings + per-pane zoom
  useEffect(() => {
    const xt = term.current;
    if (!xt) return;
    xt.options.fontSize = Math.max(6, settings.fontSize + zoom);
    xt.options.fontFamily = `"${settings.fontFamily}", "Geist Mono Variable", "Cascadia Mono", Consolas, monospace`;
    xt.options.lineHeight = settings.lineHeight;
    xt.options.cursorStyle = settings.cursorStyle;
    xt.options.cursorBlink = settings.cursorBlink;
    xt.options.scrollback = settings.scrollback;
    setTimeout(() => {
      try { fit.current?.fit(); } catch { return; }
      if (!isSerial) void window.darkhub.ssh.resize(pane.sessionId, xt.cols, xt.rows);
    }, 0);
  }, [settings, zoom, pane.sessionId, isSerial]);
  const toggleLog = async () => {
    const r = await window.darkhub.ssh.setLogging(pane.sessionId, !pane.logging);
    if (r.ok) { setPaneLogging(pane.sessionId, r.logging); setLogNote(r.logging && r.logFile ? r.logFile : ''); }
  };
  useEffect(() => { if (focused && visible) term.current?.focus(); }, [focused, visible]);
  useEffect(() => { if (visible) setTimeout(() => { try { fit.current?.fit(); } catch { /* hidden */ } }, 0); }, [visible]);

  const down = pane.status !== 'connected' && pane.status !== 'connecting';
  const armed = Boolean(broadcastTargets?.length);
  const statusText: Record<string, string> = {
    connecting: t('ssh.term.connecting', 'Conectando...'),
    closed: t('ssh.term.closed', 'Sessão encerrada.'),
    error: t('ssh.term.error', 'Erro de conexão.'),
    auth_failed: t('ssh.term.authFailed', 'Falha de autenticação: confira usuário, senha ou chave.'),
    hostkey_rejected: t('ssh.term.hostkeyRejected', 'Chave do servidor não confiada: conexão cancelada.')
  };

  return (
    <div onMouseDown={onFocus}
      className={`relative flex flex-col min-w-0 min-h-0 flex-1 rounded-lg border overflow-hidden ${armed ? 'border-amber-500/70' : focused ? 'border-blue-500/50' : 'border-zinc-800'}`}>
      <div className="flex items-center gap-2 h-7 px-2 bg-zinc-900/80 border-b border-zinc-800 text-[11.5px]">
        <span className={`w-1.5 h-1.5 rounded-full ${pane.status === 'connected' ? 'bg-emerald-400' : pane.status === 'connecting' ? 'bg-amber-400' : 'bg-zinc-600'}`} />
        <span className="text-zinc-300 truncate font-mono">{pane.title}</span>
        {armed ? <span className="text-amber-300">{t('ssh.term.broadcastOn', 'transmissão ativa')}</span> : null}
        <span className="flex-1" />
        {zoom ? <button type="button" className="font-mono text-zinc-500 hover:text-zinc-200" title={t('ssh.term.zoomReset', 'Tamanho normal (Ctrl+0)')} onClick={() => setZoom(0)}>{zoom > 0 ? '+' : ''}{zoom}</button> : null}
        {isSerial ? (
          <button type="button" className="text-zinc-500 hover:text-zinc-200" title={t('ssh.serial.break', 'Enviar BREAK')} disabled={pane.status !== 'connected'} onClick={() => void window.darkhub.ssh.serialBreak(pane.sessionId)}><Zap size={13} /></button>
        ) : (
          <>
            <button type="button" className={pane.logging ? 'text-blue-300' : 'text-zinc-500 hover:text-zinc-200'} title={pane.logging ? `${t('ssh.term.logOn', 'Gravando log da sessão')}${logNote ? `: ${logNote}` : ''}` : t('ssh.term.logOff', 'Gravar log da sessão')} disabled={pane.status !== 'connected'} onClick={toggleLog}><FileText size={13} /></button>
            {onOpenSftp ? <button type="button" className="text-zinc-500 hover:text-zinc-200" title={t('ssh.term.openSftp', 'Abrir SFTP deste servidor')} onClick={onOpenSftp}><FolderOpen size={13} /></button> : null}
          </>
        )}
        <button type="button" className="text-zinc-500 hover:text-zinc-200" title={t('ssh.term.search', 'Buscar (Ctrl+Shift+F)')} onClick={() => setSearchOpen((v) => !v)}><Search size={13} /></button>
        <button type="button" className="text-zinc-500 hover:text-zinc-200" title={t('ssh.term.closePane', 'Fechar painel')} onClick={onClose}><X size={13} /></button>
      </div>
      {searchOpen ? (
        <div className="flex items-center gap-2 px-2 py-1 bg-zinc-900 border-b border-zinc-800">
          <input autoFocus className="dh-input h-7 flex-1 text-[12px]" value={query} placeholder={t('ssh.term.searchPh', 'Texto a buscar')}
            onChange={(e) => { setQuery(e.target.value); search.current?.findNext(e.target.value, { incremental: true }); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { if (e.shiftKey) search.current?.findPrevious(query); else search.current?.findNext(query); } if (e.key === 'Escape') { setSearchOpen(false); term.current?.focus(); } }} />
          <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" onClick={() => setSearchOpen(false)}><X size={13} /></button>
        </div>
      ) : null}
      <div ref={box} className="flex-1 min-h-0 p-1" style={{ background: themeById(themeId).theme.background }} />
      {pane.status === 'connecting' ? (
        <div className="absolute bottom-2 right-3 flex items-center gap-1.5 text-[11.5px] text-zinc-400 pointer-events-none"><Loader2 size={13} className="animate-spin" />{statusText.connecting}</div>
      ) : null}
      {down ? (
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-3 px-3 py-2 bg-zinc-950/95 border-t border-zinc-800 text-[12px]">
          <span className={pane.status === 'closed' ? 'text-zinc-400' : 'text-red-300'}>{statusText[pane.status] ?? pane.status}{pane.error && pane.status !== 'closed' ? ` (${pane.error})` : ''}</span>
          <span className="flex-1" />
          <button type="button" className="dh-btn dh-btn-sm" onClick={() => reconnectPane(tabId, pane.sessionId)}><RefreshCw size={13} />{t('ssh.term.reconnect', 'Reconectar')}</button>
        </div>
      ) : null}
    </div>
  );
}
