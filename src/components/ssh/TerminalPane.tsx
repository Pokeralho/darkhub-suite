import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { RefreshCw, X, Search, Loader2, FolderOpen, FileText, Zap, Copy, Clipboard, CheckSquare, Eraser, Edit3, ArrowRight } from '../icons';
import type { SshTerminalSettings } from '../../global';
import { useI18n } from '../../i18n/I18nProvider';
import { attachOutput, startSession, reconnectPane, setPaneLogging, type Pane } from './sshStore';
import { themeById } from './terminalThemes';
import { simpleKeyAction, pastedLines, commandBoxPayload } from './terminalKeys';
import { Modal } from './ui';

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

const HISTORY_MAX = 200;
const boxHistory = new Map<string, string[]>(); // per host, kept while the app runs

function TermMenu({ x, y, onClose, children }: { x: number; y: number; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ left: Math.max(4, Math.min(x, window.innerWidth - r.width - 8)), top: Math.max(4, Math.min(y, window.innerHeight - r.height - 8)) });
  }, [x, y]);
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', close);
    window.addEventListener('keydown', close);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('blur', close); window.removeEventListener('keydown', close); };
  }, [onClose]);
  return createPortal(
    <div ref={ref} className="fixed z-[80] min-w-[210px] dh-card !bg-zinc-900 py-1 shadow-2xl ring-1 ring-black/40" style={pos} onMouseDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>{children}</div>,
    document.body
  );
}

export default function TerminalPane({ tabId, pane, themeId, focused, broadcastTargets, onFocus, onClose, visible, settings, onOpenSftp }: Props) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);
  const search = useRef<SearchAddon | null>(null);
  const targets = useRef<string[] | null>(broadcastTargets);
  const cmdRef = useRef<HTMLTextAreaElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [zoom, setZoom] = useState(0);
  const [logNote, setLogNote] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number; hasSel: boolean } | null>(null);
  const [pasteAsk, setPasteAsk] = useState<{ text: string; lines: number } | null>(null);
  const [showBox, setShowBox] = useState(settings.commandBox);
  const [cmd, setCmd] = useState('');
  const histPos = useRef(-1);
  const draft = useRef('');
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  targets.current = broadcastTargets;
  const isSerial = pane.kind === 'serial';
  const simple = settings.keyMode === 'simple';
  const live = pane.status === 'connected';

  useEffect(() => { setShowBox(settings.commandBox); }, [settings.commandBox]);

  const ids = () => (targets.current?.length ? targets.current : [pane.sessionId]);
  const send = (data: string) => { void window.darkhub.ssh.write(ids(), data); };

  /** Every paste goes through here: several lines (each would run as a command) can ask first. */
  const pasteText = (text: string) => {
    if (!text) return;
    const lines = pastedLines(text);
    if (settingsRef.current.confirmPaste && lines > 1) { setPasteAsk({ text, lines }); return; }
    term.current?.paste(text);
  };
  const pasteRef = useRef(pasteText);
  pasteRef.current = pasteText;
  const pasteFromClipboard = () => { void navigator.clipboard.readText().then((txt) => pasteRef.current(txt)).catch(() => {}); };
  const copySelection = () => {
    const xt = term.current;
    const txt = xt?.getSelection();
    if (txt) { void navigator.clipboard.writeText(txt); xt?.clearSelection(); }
  };

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
        rightClickSelectsWord: st.keyMode !== 'simple' && !st.rightClickPaste,
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

      const input = xt.onData((d) => send(d));
      const sel = xt.onSelectionChange(() => { if (settingsRef.current.copyOnSelect) { const txt = xt.getSelection(); if (txt) void navigator.clipboard.writeText(txt); } });
      const bell = xt.onBell(() => { if (settingsRef.current.bell) beep(); });
      const boxEl = box.current;
      // native paste (Ctrl+V, Ctrl+Shift+V, Shift+Insert, Edit menu) is taken over so the multi-line check applies
      const onPaste = (e: ClipboardEvent) => {
        e.preventDefault();
        e.stopPropagation();
        pasteRef.current(e.clipboardData?.getData('text/plain') ?? '');
      };
      boxEl.addEventListener('paste', onPaste, true);
      const onContext = (e: MouseEvent) => {
        const s = settingsRef.current;
        if (s.keyMode === 'simple') { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, hasSel: xt.hasSelection() }); return; }
        if (!s.rightClickPaste) return;
        e.preventDefault();
        const txt = xt.getSelection();
        if (txt) { void navigator.clipboard.writeText(txt); xt.clearSelection(); } else pasteFromClipboard();
      };
      boxEl.addEventListener('contextmenu', onContext);

      xt.attachCustomKeyEventHandler((e) => {
        if (e.type === 'keydown' && e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === '=' || e.key === '+' || e.key === '-' || e.key === '0')) {
          setZoom((z) => (e.key === '0' ? 0 : Math.max(-6, Math.min(16, z + (e.key === '-' ? -1 : 1)))));
          return false;
        }
        if (settingsRef.current.keyMode === 'simple') {
          const action = simpleKeyAction(e, xt.hasSelection());
          if (!action) return true;
          if (e.type !== 'keydown') return false;
          // paste: let the browser fire its paste event (handled above); everything else is ours
          if (action.type === 'paste') return false;
          e.preventDefault();
          if (action.type === 'copy') copySelection();
          else if (action.type === 'selectAll') xt.selectAll();
          else if (action.type === 'search') setSearchOpen(true);
          else if (action.type === 'clearSelection') xt.clearSelection();
          else if (action.type === 'send') send(action.data);
          return false;
        }
        // classic: Ctrl+Shift+C / Ctrl+Shift+V / Ctrl+Shift+F; everything else goes to the server
        if (!e.ctrlKey || !e.shiftKey) return true;
        const k = e.key.toLowerCase();
        if (k === 'c') { if (e.type === 'keydown') { e.preventDefault(); copySelection(); } return false; }
        if (k === 'v') return false; // native paste event does the rest
        if (k === 'f') { if (e.type === 'keydown') { e.preventDefault(); setSearchOpen(true); } return false; }
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
        boxEl.removeEventListener('paste', onPaste, true);
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
    xt.options.rightClickSelectsWord = settings.keyMode !== 'simple' && !settings.rightClickPaste;
    setTimeout(() => {
      try { fit.current?.fit(); } catch { return; }
      if (!isSerial) void window.darkhub.ssh.resize(pane.sessionId, xt.cols, xt.rows);
    }, 0);
  }, [settings, zoom, pane.sessionId, isSerial, showBox]);
  const toggleLog = async () => {
    const r = await window.darkhub.ssh.setLogging(pane.sessionId, !pane.logging);
    if (r.ok) { setPaneLogging(pane.sessionId, r.logging); setLogNote(r.logging && r.logFile ? r.logFile : ''); }
  };
  useEffect(() => {
    if (!focused || !visible) return;
    if (showBox && live) cmdRef.current?.focus(); else term.current?.focus();
  }, [focused, visible, showBox, live]);
  useEffect(() => { if (visible) setTimeout(() => { try { fit.current?.fit(); } catch { /* hidden */ } }, 0); }, [visible]);

  // ---- command box ----
  const histKey = pane.hostId || pane.title;
  const history = () => boxHistory.get(histKey) ?? [];
  const submitCmd = () => {
    if (!live) return;
    const text = cmd;
    send(text.trim() ? commandBoxPayload(text) : '\r');
    if (text.trim()) {
      const h = history().filter((x) => x !== text);
      h.unshift(text);
      boxHistory.set(histKey, h.slice(0, HISTORY_MAX));
    }
    histPos.current = -1;
    setCmd('');
  };
  const onCmdKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitCmd(); return; }
    if (e.key === 'Escape') { e.preventDefault(); term.current?.focus(); return; }
    // Ctrl+C with nothing selected in the box interrupts the running command, like in the terminal
    if (e.key.toLowerCase() === 'c' && e.ctrlKey && !e.shiftKey && el.selectionStart === el.selectionEnd) { e.preventDefault(); send('\x03'); return; }
    if (e.key === 'Tab' && !e.shiftKey) {
      // completion runs on the server: hand the typed text to the shell and continue in the terminal
      e.preventDefault();
      if (cmd) { send(cmd.replace(/\r?\n/g, ' ')); setCmd(''); }
      send('\t');
      term.current?.focus();
      return;
    }
    const firstLine = el.value.lastIndexOf('\n', el.selectionStart - 1) === -1;
    const lastLine = el.value.indexOf('\n', el.selectionEnd) === -1;
    if (e.key === 'ArrowUp' && firstLine) {
      const h = history();
      if (!h.length) return;
      e.preventDefault();
      if (histPos.current === -1) draft.current = cmd;
      histPos.current = Math.min(h.length - 1, histPos.current + 1);
      setCmd(h[histPos.current]);
    } else if (e.key === 'ArrowDown' && lastLine && histPos.current >= 0) {
      e.preventDefault();
      histPos.current -= 1;
      setCmd(histPos.current === -1 ? draft.current : history()[histPos.current]);
    }
  };
  const cmdRows = Math.min(6, Math.max(1, cmd.split('\n').length));

  const down = pane.status !== 'connected' && pane.status !== 'connecting';
  const armed = Boolean(broadcastTargets?.length);
  const statusText: Record<string, string> = {
    connecting: t('ssh.term.connecting', 'Conectando...'),
    closed: t('ssh.term.closed', 'Sessão encerrada.'),
    error: t('ssh.term.error', 'Erro de conexão.'),
    auth_failed: t('ssh.term.authFailed', 'Falha de autenticação: confira usuário, senha ou chave.'),
    hostkey_rejected: t('ssh.term.hostkeyRejected', 'Chave do servidor não confiada: conexão cancelada.')
  };
  const menuItem = (label: string, hint: string, Icon: React.ComponentType<{ size?: number }>, run: () => void, disabled = false) => (
    <button type="button" disabled={disabled} className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-zinc-200 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-transparent"
      onClick={() => { setMenu(null); run(); term.current?.focus(); }}>
      <Icon size={13} /><span className="flex-1">{label}</span><span className="text-[11px] text-zinc-500 font-mono">{hint}</span>
    </button>
  );

  return (
    <div onMouseDown={onFocus}
      className={`relative flex flex-col min-w-0 min-h-0 flex-1 rounded-lg border overflow-hidden ${armed ? 'border-amber-500/70' : focused ? 'border-blue-500/50' : 'border-zinc-800'}`}>
      <div className="flex items-center gap-2 h-7 px-2 bg-zinc-900/80 border-b border-zinc-800 text-[11.5px]">
        <span className={`w-1.5 h-1.5 rounded-full ${pane.status === 'connected' ? 'bg-emerald-400' : pane.status === 'connecting' ? 'bg-amber-400' : 'bg-zinc-600'}`} />
        <span className="text-zinc-300 truncate font-mono">{pane.title}</span>
        {armed ? <span className="text-amber-300">{t('ssh.term.broadcastOn', 'transmissão ativa')}</span> : null}
        <span className="flex-1" />
        {zoom ? <button type="button" className="font-mono text-zinc-500 hover:text-zinc-200" title={t('ssh.term.zoomReset', 'Tamanho normal (Ctrl+0)')} onClick={() => setZoom(0)}>{zoom > 0 ? '+' : ''}{zoom}</button> : null}
        <button type="button" className={showBox ? 'text-blue-300' : 'text-zinc-500 hover:text-zinc-200'} title={showBox ? t('ssh.box.hide', 'Esconder a caixa de comando') : t('ssh.box.show', 'Mostrar a caixa de comando (escrever como num editor de texto)')} onClick={() => setShowBox((v) => !v)}><Edit3 size={13} /></button>
        {isSerial ? (
          <button type="button" className="text-zinc-500 hover:text-zinc-200" title={t('ssh.serial.break', 'Enviar BREAK')} disabled={pane.status !== 'connected'} onClick={() => void window.darkhub.ssh.serialBreak(pane.sessionId)}><Zap size={13} /></button>
        ) : (
          <>
            <button type="button" className={pane.logging ? 'text-blue-300' : 'text-zinc-500 hover:text-zinc-200'} title={pane.logging ? `${t('ssh.term.logOn', 'Gravando log da sessão')}${logNote ? `: ${logNote}` : ''}` : t('ssh.term.logOff', 'Gravar log da sessão')} disabled={pane.status !== 'connected'} onClick={toggleLog}><FileText size={13} /></button>
            {onOpenSftp ? <button type="button" className="text-zinc-500 hover:text-zinc-200" title={t('ssh.term.openSftp', 'Abrir SFTP deste servidor')} onClick={onOpenSftp}><FolderOpen size={13} /></button> : null}
          </>
        )}
        <button type="button" className="text-zinc-500 hover:text-zinc-200" title={simple ? t('ssh.term.searchSimple', 'Buscar (Ctrl+F)') : t('ssh.term.search', 'Buscar (Ctrl+Shift+F)')} onClick={() => setSearchOpen((v) => !v)}><Search size={13} /></button>
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
      {showBox && !down ? (
        <div className="flex items-end gap-2 px-2 py-1.5 border-t border-zinc-800 bg-zinc-950">
          <span className="pb-1.5 font-mono text-[12px] text-zinc-500 select-none">❯</span>
          <textarea ref={cmdRef} rows={cmdRows} spellCheck={false} value={cmd} disabled={!live}
            onChange={(e) => { setCmd(e.target.value); histPos.current = -1; }} onKeyDown={onCmdKey}
            placeholder={live ? t('ssh.box.placeholder', 'Escreva o comando e aperte Enter. Shift+Enter quebra linha, ↑ ↓ histórico, Tab completa no servidor.') : t('ssh.term.connecting', 'Conectando...')}
            className="flex-1 min-w-0 resize-none bg-transparent outline-none font-mono text-[12.5px] leading-[1.45] text-zinc-100 placeholder:text-zinc-600 py-1" />
          <button type="button" className="dh-btn dh-btn-sm dh-btn-accent mb-0.5" disabled={!live} title={t('ssh.box.sendHint', 'Enviar (Enter)')} onClick={submitCmd}><ArrowRight size={13} /></button>
        </div>
      ) : null}
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
      {menu ? (
        <TermMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          {menuItem(t('ssh.menu.copy', 'Copiar'), 'Ctrl+C', Copy, copySelection, !menu.hasSel)}
          {menuItem(t('ssh.menu.paste', 'Colar'), 'Ctrl+V', Clipboard, pasteFromClipboard, !live)}
          {menuItem(t('ssh.menu.selectAll', 'Selecionar tudo'), 'Ctrl+A', CheckSquare, () => term.current?.selectAll())}
          {menuItem(t('ssh.menu.find', 'Buscar'), 'Ctrl+F', Search, () => setSearchOpen(true))}
          <div className="my-1 h-px bg-zinc-800" />
          {menuItem(t('ssh.menu.clear', 'Limpar a tela'), '', Eraser, () => term.current?.clear())}
          {menuItem(t('ssh.menu.interrupt', 'Parar o comando em execução'), 'Ctrl+C', X, () => send('\x03'), !live)}
        </TermMenu>
      ) : null}
      {pasteAsk ? (
        <Modal tone="warn" title={t('ssh.paste.title', 'Colar {n} linhas?').replace('{n}', String(pasteAsk.lines))} onClose={() => setPasteAsk(null)}
          footer={<>
            <button type="button" className="dh-btn" onClick={() => { setPasteAsk(null); term.current?.focus(); }}>{t('ssh.cancel', 'Cancelar')}</button>
            <button type="button" className="dh-btn" onClick={() => { const txt = pasteAsk.text.replace(/\r?\n/g, ' ').trim(); setPasteAsk(null); term.current?.paste(txt); term.current?.focus(); }}>{t('ssh.paste.oneLine', 'Colar como uma linha')}</button>
            <button type="button" className="dh-btn dh-btn-primary" onClick={() => { const txt = pasteAsk.text; setPasteAsk(null); term.current?.paste(txt); term.current?.focus(); }}>{t('ssh.paste.all', 'Colar e executar')}</button>
          </>}>
          <p>{t('ssh.paste.text', 'Cada linha vai rodar como um comando no servidor, na ordem. Confira antes:')}</p>
          <pre className="max-h-48 overflow-auto rounded-lg bg-zinc-900 p-2 text-[11.5px] font-mono text-zinc-300 whitespace-pre-wrap">{pasteAsk.text.length > 4000 ? `${pasteAsk.text.slice(0, 4000)}\n…` : pasteAsk.text}</pre>
          {armed ? <p className="text-amber-300 text-[12.5px]">{t('ssh.paste.broadcast', 'A transmissão está ativa: vai para todos os painéis desta aba.')}</p> : null}
        </Modal>
      ) : null}
    </div>
  );
}
