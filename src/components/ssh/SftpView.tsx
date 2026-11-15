import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  FolderOpen, FileText, ArrowRight, ChevronLeft, RefreshCw, Plus, Trash2, Edit3, Loader2, X, Link, Lock, HardDrive, Server,
  Eye, EyeOff, Search, Copy, ExternalLink, Info, FileCode, Upload, Download, ChevronUp, ChevronDown, Home
} from '../icons';
import { useI18n } from '../../i18n/I18nProvider';
import type { SshDirListing, SshFileEntry, SshFileStat, SshVaultState } from '../../global';
import { Modal, errText, fmtBytes, fmtDate } from './ui';
import { newId, rememberTransfer, clearFinishedTransfers, useSshStore, openEditor } from './sshStore';

type Side = 'local' | 'remote';
type SortKey = 'name' | 'size' | 'mtime';
interface SideState {
  listing: SshDirListing | null; loading: boolean; error: string; sel: string[]; anchor: string | null;
  filter: string; hidden: boolean; sort: { key: SortKey; asc: boolean }; history: string[];
}
const emptySide = (): SideState => ({ listing: null, loading: false, error: '', sel: [], anchor: null, filter: '', hidden: false, sort: { key: 'name', asc: true }, history: [] });
const DND = (side: Side) => `application/x-darkhub-${side}`;
const baseName = (side: Side, p: string) => p.split(side === 'remote' ? '/' : /[\\/]/).filter(Boolean).pop() ?? p;
const joinPath = (side: Side, dir: string, name: string) => (side === 'remote' ? `${dir.replace(/\/+$/, '')}/${name}` : `${dir.replace(/[\\/]+$/, '')}\\${name}`);
const isDirLike = (e: SshFileEntry) => e.type === 'dir' || (e.type === 'link' && e.linkTarget === 'dir');
interface TItem { path: string; name: string; isDir: boolean }
interface ConflictAsk { item: TItem; many: boolean; resolve: (v: { action: 'overwrite' | 'skip' | 'cancel'; all: boolean }) => void }

function sortEntries(list: SshFileEntry[], s: SideState) {
  const dir = s.sort.asc ? 1 : -1;
  return list
    .filter((e) => (s.hidden || !e.name.startsWith('.')) && (!s.filter || e.name.toLowerCase().includes(s.filter.toLowerCase())))
    .sort((a, b) => {
      const da = isDirLike(a); const db = isDirLike(b);
      if (da !== db) return da ? -1 : 1;
      if (s.sort.key === 'size') return (a.size - b.size) * dir;
      if (s.sort.key === 'mtime') return (a.mtimeMs - b.mtimeMs) * dir;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) * dir;
    });
}

/** Context menu rendered on <body> (page transitions use transforms, which would trap a fixed element) and kept on screen. */
function ContextMenu({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: Math.max(4, Math.min(x, window.innerWidth - r.width - 8)), top: Math.max(4, Math.min(y, window.innerHeight - r.height - 8)) });
  }, [x, y]);
  return createPortal(
    <div ref={ref} className="fixed z-[80] min-w-[220px] dh-card py-1 shadow-2xl" style={pos} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>{children}</div>,
    document.body
  );
}

function PermGrid({ mode, onChange }: { mode: number; onChange: (m: number) => void }) {
  const rows = [['owner', 6], ['group', 3], ['others', 0]] as const;
  const { t } = useI18n();
  const label: Record<string, string> = { owner: t('ssh.sftp.owner', 'Dono'), group: t('ssh.sftp.groupPerm', 'Grupo'), others: t('ssh.sftp.others', 'Outros') };
  return (
    <table className="text-[12px]">
      <thead><tr className="text-zinc-500"><th /><th className="px-3 font-normal">r</th><th className="px-3 font-normal">w</th><th className="px-3 font-normal">x</th></tr></thead>
      <tbody>{rows.map(([name, shift]) => (
        <tr key={name}><td className="pr-3 text-zinc-400">{label[name]}</td>
          {[4, 2, 1].map((bit) => { const m = bit << shift; return <td key={bit} className="px-3 text-center"><input type="checkbox" checked={(mode & m) !== 0} onChange={(e) => onChange(e.target.checked ? mode | m : mode & ~m)} /></td>; })}
        </tr>
      ))}</tbody>
    </table>
  );
}

function PropertiesModal({ sftpId, side, entry, onClose, onSaved }: { sftpId: string; side: Side; entry: SshFileEntry; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [st, setSt] = useState<SshFileStat | null>(null);
  const [du, setDu] = useState<{ files: number; dirs: number; bytes: number } | null>(null);
  const [duBusy, setDuBusy] = useState(false);
  const [mode, setMode] = useState(entry.mode & 0o777);
  const [err, setErr] = useState('');
  useEffect(() => { void window.darkhub.ssh.sftpStat({ sftpId, side, path: entry.path }).then((r) => { if (r.ok) { setSt(r); setMode(r.mode & 0o777); } else setErr(errText(r)); }); }, [sftpId, side, entry.path]);
  const calc = async () => { setDuBusy(true); const r = await window.darkhub.ssh.sftpDu({ sftpId, side, path: entry.path }); setDuBusy(false); if (r.ok) setDu(r); else setErr(errText(r)); };
  const apply = async () => {
    const r = await window.darkhub.ssh.sftpFsOp({ sftpId, side, op: 'chmod', path: entry.path, mode: mode.toString(8).padStart(3, '0') });
    if (!r.ok) { setErr(errText(r)); return; }
    onSaved(); onClose();
  };
  const changed = st && (st.mode & 0o777) !== mode;
  return (
    <Modal title={t('ssh.sftp.properties', 'Propriedades')} onClose={onClose}
      footer={<><button type="button" className="dh-btn" onClick={onClose}>{t('ssh.close', 'Fechar')}</button>{side === 'remote' ? <button type="button" className="dh-btn dh-btn-primary" disabled={!changed} onClick={apply}>{t('ssh.sftp.applyPerms', 'Aplicar permissões')}</button> : null}</>}>
      <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-[12.5px]">
        <dt className="text-zinc-500">{t('ssh.sftp.name', 'Nome')}</dt><dd className="font-mono break-all">{entry.name}</dd>
        <dt className="text-zinc-500">{t('ssh.sftp.path', 'Caminho')}</dt><dd className="font-mono break-all">{entry.path}</dd>
        <dt className="text-zinc-500">{t('ssh.sftp.type', 'Tipo')}</dt><dd>{st?.type ?? entry.type}{st?.linkTarget ? <span className="font-mono text-zinc-400"> → {st.linkTarget}</span> : null}</dd>
        {entry.type !== 'dir' ? <><dt className="text-zinc-500">{t('ssh.sftp.size', 'Tamanho')}</dt><dd className="font-mono">{fmtBytes(st?.size ?? entry.size)} <span className="text-zinc-500">({(st?.size ?? entry.size).toLocaleString()} B)</span></dd></> : null}
        <dt className="text-zinc-500">{t('ssh.sftp.modified', 'Modificado')}</dt><dd className="font-mono">{fmtDate(st?.mtimeMs ?? entry.mtimeMs)}</dd>
        {st?.uid != null ? <><dt className="text-zinc-500">uid / gid</dt><dd className="font-mono">{st.uid} / {st.gid}</dd></> : null}
        <dt className="text-zinc-500">{t('ssh.sftp.perms', 'Permissões')}</dt><dd className="font-mono">{mode.toString(8).padStart(3, '0')}</dd>
      </dl>
      {entry.type === 'dir' ? (
        <div className="flex items-center gap-3 text-[12.5px]">
          <button type="button" className="dh-btn dh-btn-sm" disabled={duBusy} onClick={calc}>{duBusy ? <Loader2 size={13} className="animate-spin" /> : null}{t('ssh.sftp.calcSize', 'Calcular tamanho')}</button>
          {du ? <span className="font-mono text-zinc-300">{fmtBytes(du.bytes)} · {du.files} {t('ssh.sftp.filesWord', 'arquivos')} · {du.dirs} {t('ssh.sftp.dirsWord', 'pastas')}</span> : null}
        </div>
      ) : null}
      {side === 'remote' ? <PermGrid mode={mode} onChange={setMode} /> : null}
      {err ? <p className="text-[12.5px] text-red-300">{err}</p> : null}
    </Modal>
  );
}

interface PaneProps {
  side: Side; s: SideState; setS: (patch: Partial<SideState> | ((x: SideState) => Partial<SideState>)) => void;
  focused: boolean; onFocus: () => void; onOpen: (e: SshFileEntry) => void; onNavigate: (p: string) => void; onRefresh: () => void;
  onDropInternal: (items: TItem[]) => void; onDropFiles?: (paths: string[]) => void; onContext: (e: React.MouseEvent, entry: SshFileEntry | null) => void;
  onKey: (e: React.KeyboardEvent) => void; actions: React.ReactNode; drives?: string[]; home?: string;
}

function Pane({ side, s, setS, focused, onFocus, onOpen, onNavigate, onRefresh, onDropInternal, onDropFiles, onContext, onKey, actions, drives, home }: PaneProps) {
  const { t } = useI18n();
  const [path, setPath] = useState(s.listing?.path ?? '');
  const [over, setOver] = useState(false);
  useEffect(() => setPath(s.listing?.path ?? ''), [s.listing?.path]);
  const entries = useMemo(() => sortEntries(s.listing?.entries ?? [], s), [s]);
  const other: Side = side === 'local' ? 'remote' : 'local';

  const click = (e: React.MouseEvent, entry: SshFileEntry) => {
    if (e.shiftKey && s.anchor) {
      const ia = entries.findIndex((x) => x.path === s.anchor); const ib = entries.findIndex((x) => x.path === entry.path);
      if (ia >= 0 && ib >= 0) { const [a, b] = ia < ib ? [ia, ib] : [ib, ia]; setS({ sel: entries.slice(a, b + 1).map((x) => x.path) }); return; }
    }
    if (e.ctrlKey || e.metaKey) { setS((x) => ({ sel: x.sel.includes(entry.path) ? x.sel.filter((p) => p !== entry.path) : [...x.sel, entry.path], anchor: entry.path })); return; }
    setS({ sel: [entry.path], anchor: entry.path });
  };
  const sortBy = (key: SortKey) => setS((x) => ({ sort: { key, asc: x.sort.key === key ? !x.sort.asc : true } }));
  const arrow = (key: SortKey) => (s.sort.key === key ? (s.sort.asc ? <ChevronUp size={11} /> : <ChevronDown size={11} />) : null);

  return (
    <div tabIndex={0} onFocus={onFocus} onKeyDown={onKey}
      className={`flex flex-col min-w-0 min-h-0 flex-1 rounded-xl border outline-none ${over ? 'border-blue-500/70 bg-blue-500/5' : focused ? 'border-zinc-700' : 'border-zinc-800/80'}`}
      onDragOver={(e) => {
        const internal = e.dataTransfer.types.includes(DND(other));
        const files = side === 'remote' && e.dataTransfer.types.includes('Files');
        if (internal || files) { e.preventDefault(); setOver(true); }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        e.preventDefault();
        const raw = e.dataTransfer.getData(DND(other));
        if (raw) { try { onDropInternal(JSON.parse(raw)); } catch { /* not ours */ } return; }
        if (side === 'remote' && e.dataTransfer.files.length && onDropFiles) onDropFiles(window.darkhub.ssh.pathsOf(e.dataTransfer.files));
      }}>
      <div className="flex items-center gap-1.5 p-2 border-b border-zinc-800/80">
        {side === 'local' ? <HardDrive size={15} className="text-zinc-400 shrink-0" /> : <Server size={15} className="text-zinc-400 shrink-0" />}
        <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" title={t('ssh.sftp.up', 'Pasta acima (Backspace)')} disabled={!s.listing?.parent} onClick={() => s.listing?.parent && onNavigate(s.listing.parent)}><ChevronLeft size={14} /></button>
        {home ? <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" title={t('ssh.sftp.home', 'Pasta inicial')} onClick={() => onNavigate(home)}><Home size={14} /></button> : null}
        {drives?.length ? (
          <select className="dh-input h-8 w-[64px] text-[12px] font-mono" value={drives.find((d) => s.listing?.path.toUpperCase().startsWith(d.toUpperCase())) ?? ''} onChange={(e) => onNavigate(e.target.value)}>
            {drives.map((d) => <option key={d} value={d}>{d.slice(0, 2)}</option>)}
          </select>
        ) : null}
        <input className="dh-input h-8 flex-1 min-w-0 font-mono text-[12px]" value={path} onChange={(e) => setPath(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') onNavigate(path); }} />
        <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" title="F5" onClick={onRefresh}><RefreshCw size={14} /></button>
      </div>
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-zinc-900">
        {actions}
        <span className="flex-1" />
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input className="dh-input h-7 w-32 pl-6 text-[12px]" value={s.filter} placeholder={t('ssh.snip.filter', 'Filtrar')} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => setS({ filter: e.target.value })} />
        </div>
        <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" title={s.hidden ? t('ssh.sftp.hideHidden', 'Ocultar arquivos ocultos') : t('ssh.sftp.showHidden', 'Mostrar arquivos ocultos')} onClick={() => setS((x) => ({ hidden: !x.hidden }))}>{s.hidden ? <Eye size={13} /> : <EyeOff size={13} />}</button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto" onContextMenu={(e) => { if (e.target === e.currentTarget) onContext(e, null); }}>
        {s.loading && !s.listing ? (
          <div className="p-2 space-y-1.5">{Array.from({ length: 8 }, (_, i) => <div key={i} className="h-6 rounded bg-zinc-900 animate-pulse" />)}</div>
        ) : s.error ? (
          <div className="p-3 space-y-2"><p className="text-[12.5px] text-red-300">{s.error}</p><button type="button" className="dh-btn dh-btn-sm" onClick={onRefresh}>{t('ssh.retry', 'Tentar de novo')}</button></div>
        ) : (
          <table className="w-full text-[12px] select-none">
            <thead className="sticky top-0 bg-zinc-950 z-10"><tr className="text-zinc-500 text-[11px] text-left">
              <th className="font-normal px-2 py-1 cursor-pointer" onClick={() => sortBy('name')}><span className="inline-flex items-center gap-1">{t('ssh.sftp.name', 'Nome')}{arrow('name')}</span></th>
              <th className="font-normal px-2 text-right cursor-pointer" onClick={() => sortBy('size')}><span className="inline-flex items-center gap-1">{t('ssh.sftp.size', 'Tamanho')}{arrow('size')}</span></th>
              <th className="font-normal px-2 hidden xl:table-cell cursor-pointer" onClick={() => sortBy('mtime')}><span className="inline-flex items-center gap-1">{t('ssh.sftp.modified', 'Modificado')}{arrow('mtime')}</span></th>
              <th className="font-normal px-2 hidden lg:table-cell">{t('ssh.sftp.perms', 'Permissões')}</th>
            </tr></thead>
            <tbody onContextMenu={(e) => { if ((e.target as HTMLElement).closest('tr') === null) onContext(e, null); }}>
              {entries.map((e) => {
                const selected = s.sel.includes(e.path);
                return (
                  <tr key={e.path} draggable
                    onDragStart={(ev) => {
                      const paths = selected ? s.sel : [e.path];
                      const items: TItem[] = paths.map((p) => { const x = s.listing!.entries.find((y) => y.path === p)!; return { path: p, name: x?.name ?? baseName(side, p), isDir: x ? isDirLike(x) : false }; });
                      ev.dataTransfer.setData(DND(side), JSON.stringify(items));
                    }}
                    onClick={(ev) => click(ev, e)} onDoubleClick={() => onOpen(e)}
                    onContextMenu={(ev) => { ev.preventDefault(); if (!selected) setS({ sel: [e.path], anchor: e.path }); onContext(ev, e); }}
                    className={`cursor-default ${selected ? 'bg-blue-500/15 text-blue-100' : 'hover:bg-zinc-900 text-zinc-200'}`}>
                    <td className="px-2 py-1"><span className="flex items-center gap-1.5 min-w-0">
                      {e.type === 'dir' ? <FolderOpen size={14} className="text-blue-300 shrink-0" /> : e.type === 'link' ? <Link size={14} className={`${e.linkTarget === 'broken' ? 'text-red-300' : 'text-zinc-400'} shrink-0`} /> : <FileText size={14} className="text-zinc-500 shrink-0" />}
                      <span className={`truncate ${e.name.startsWith('.') ? 'text-zinc-400' : ''}`}>{e.name}</span></span></td>
                    <td className="px-2 text-right font-mono text-zinc-400 whitespace-nowrap">{isDirLike(e) ? '' : fmtBytes(e.size)}</td>
                    <td className="px-2 font-mono text-zinc-500 whitespace-nowrap hidden xl:table-cell">{e.mtimeMs ? fmtDate(e.mtimeMs) : ''}</td>
                    <td className="px-2 font-mono text-zinc-500 hidden lg:table-cell">{e.permissions}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!s.loading && !s.error && s.listing && !entries.length ? <p className="p-3 text-[12.5px] text-zinc-500">{s.filter ? t('ssh.sftp.noResult', 'Nenhum resultado.') : t('ssh.sftp.emptyDir', 'Pasta vazia.')}</p> : null}
      </div>
      <div className="px-2 h-6 flex items-center border-t border-zinc-900 text-[11px] text-zinc-500 font-mono">
        {entries.length} {t('ssh.sftp.items', 'itens')}{s.sel.length ? ` · ${s.sel.length} ${t('ssh.sftp.selected', 'selecionados')}` : ''}{s.loading ? <Loader2 size={11} className="ml-2 animate-spin" /> : null}
      </div>
    </div>
  );
}

export default function SftpView({ sftpId, hostId, vault, visible }: { sftpId: string; hostId: string; vault: SshVaultState; visible: boolean }) {
  const { t } = useI18n();
  const host = vault.hosts.find((h) => h.id === hostId);
  const needsPassword = !host?.credentialId;
  const [password, setPassword] = useState('');
  const [phase, setPhase] = useState<'auth' | 'opening' | 'open' | 'error'>(needsPassword ? 'auth' : 'opening');
  const [openErr, setOpenErr] = useState('');
  const [sides, setSides] = useState<Record<Side, SideState>>({ local: emptySide(), remote: emptySide() });
  const [homes, setHomes] = useState<Record<Side, string>>({ local: '', remote: '' });
  const [focus, setFocus] = useState<Side>('remote');
  const [dialog, setDialog] = useState<{ kind: 'mkdir' | 'touch' | 'rename' | 'copy' | 'symlink'; side: Side; value: string; entry?: SshFileEntry } | null>(null);
  const [menu, setMenu] = useState<{ side: Side; x: number; y: number; entry: SshFileEntry | null } | null>(null);
  const [props, setProps] = useState<{ side: Side; entry: SshFileEntry } | null>(null);
  const [conflict, setConflict] = useState<ConflictAsk | null>(null);
  const [applyAll, setApplyAll] = useState(false);
  const [note, setNote] = useState('');
  const [root, setRoot] = useState(false);
  const [rootBusy, setRootBusy] = useState(false);
  const [sudoAsk, setSudoAsk] = useState<{ wrong: boolean } | null>(null);
  const [sudoPw, setSudoPw] = useState('');
  const [startRoot, setStartRoot] = useState(false);
  const loginPw = useRef('');
  const phaseRef = useRef(phase);
  const store = useSshStore();
  const transfers = Object.values(store.transfers).filter((x) => x.sftpId === sftpId);
  const watches = Object.values(store.watches).filter((w) => w.sftpId === sftpId);
  const sidesRef = useRef(sides);
  sidesRef.current = sides;

  const patch = (side: Side) => (p: Partial<SideState> | ((x: SideState) => Partial<SideState>)) => setSides((all) => ({ ...all, [side]: { ...all[side], ...(typeof p === 'function' ? p(all[side]) : p) } }));

  const list = useCallback(async (side: Side, p?: string, keepSel = false) => {
    patch(side)({ loading: true });
    const r = side === 'local' ? await window.darkhub.ssh.sftpListLocal(p ?? '') : await window.darkhub.ssh.sftpListRemote(sftpId, p ?? '');
    if (!r.ok) { patch(side)({ loading: false, error: errText(r) }); return; }
    patch(side)((x) => ({
      loading: false, error: '', listing: { path: r.path, parent: r.parent, entries: r.entries, drives: r.drives ?? x.listing?.drives },
      sel: keepSel ? x.sel.filter((s) => r.entries.some((e) => e.path === s)) : [], anchor: keepSel ? x.anchor : null,
      history: x.listing && x.listing.path !== r.path ? [...x.history.slice(-30), x.listing.path] : x.history
    }));
  }, [sftpId]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = (side: Side) => list(side, sidesRef.current[side].listing?.path, true);

  const sudoMessage = (code: string, fallback: string) => ({
    SUDO_PASSWORD: t('ssh.root.wrong', 'Senha do sudo incorreta.'),
    SUDO_DENIED: t('ssh.root.denied', 'Este usuário não tem permissão de usar sudo neste servidor.'),
    SUDO_TTY: t('ssh.root.tty', 'O sudo deste servidor exige um terminal (opção requiretty). Desative-a no sudoers para usar o modo root.'),
    SFTP_SERVER_NOT_FOUND: t('ssh.root.noServer', 'O programa sftp-server não foi encontrado neste servidor.')
  } as Record<string, string>)[code] ?? fallback;

  const open = useCallback(async (pw?: string, rootMode = false, sudoPassword?: string) => {
    if (pw) loginPw.current = pw;
    const wasOpen = phaseRef.current === 'open';
    setPhase('opening');
    setRootBusy(rootMode);
    const r = await window.darkhub.ssh.sftpOpen({ sftpId, hostId, password: loginPw.current || undefined, root: rootMode, sudoPassword });
    setRootBusy(false);
    if (!r.ok) {
      if (rootMode) {
        // root failed: back to the normal session and ask for the sudo password when that is what is missing
        if (r.code === 'SUDO_PASSWORD_REQUIRED' || r.code === 'SUDO_PASSWORD') setSudoAsk({ wrong: r.code === 'SUDO_PASSWORD' });
        else setNote(sudoMessage(r.code, errText(r)));
        if (wasOpen || !needsPassword || loginPw.current) { void open(undefined, false); return; }
      }
      setOpenErr(errText(r)); setPhase(needsPassword ? 'auth' : 'error'); return;
    }
    if (rootMode) setSudoAsk(null);
    setRoot(Boolean(r.root));
    setPhase('open');
    setHomes({ local: r.localCwd, remote: r.remoteCwd });
    void list('local', r.localCwd);
    void list('remote', r.remoteCwd);
    // drive letters for the local pane
    const d = await window.darkhub.ssh.sftpListLocal('C:\\');
    if (d.ok && d.drives) patch('local')((x) => ({ listing: x.listing ? { ...x.listing, drives: d.drives } : x.listing }));
  }, [sftpId, hostId, needsPassword, list]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { if (!needsPassword) void open(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!menu) return; const close = () => setMenu(null); window.addEventListener('click', close); window.addEventListener('blur', close); return () => { window.removeEventListener('click', close); window.removeEventListener('blur', close); }; }, [menu]);

  const askConflict = (item: TItem, many: boolean) => new Promise<{ action: 'overwrite' | 'skip' | 'cancel'; all: boolean }>((resolve) => { setApplyAll(false); setConflict({ item, many, resolve }); });

  /** Transfers files and folders with a conflict prompt per item (or one answer for all). */
  const transferItems = async (direction: 'upload' | 'download', items: TItem[]) => {
    const dst = direction === 'upload' ? sidesRef.current.remote.listing : sidesRef.current.local.listing;
    if (!dst || !items.length) return;
    setNote('');
    let policy: 'ask' | 'overwrite' | 'skip' = 'ask';
    for (const it of items) {
      const run = async (conflictPolicy: 'fail' | 'overwrite' | 'skip') => {
        const transferId = newId('x');
        const localPath = direction === 'upload' ? it.path : joinPath('local', dst.path, it.name);
        const remotePath = direction === 'upload' ? joinPath('remote', dst.path, it.name) : it.path;
        rememberTransfer(transferId, it.isDir ? `${it.name}/` : it.name, sftpId, direction);
        return window.darkhub.ssh.sftpTransfer({ transferId, sftpId, direction, localPath, remotePath, conflict: conflictPolicy });
      };
      let r = await run(policy === 'ask' ? 'fail' : policy);
      if (!r.ok && r.code === 'EXISTS') {
        clearFinishedTransfers();
        const choice = await askConflict({ ...it, isDir: r.isDir ?? it.isDir }, items.length > 1);
        if (choice.action === 'cancel') break;
        if (choice.all) policy = choice.action;
        // "skip" on a folder means merge, keeping existing files
        if (choice.action === 'overwrite' || it.isDir) r = await run(choice.action);
        else continue;
      }
      if (!r.ok && r.code !== 'CANCELLED') setNote(`${it.name}: ${errText(r)}`);
    }
    void refresh(direction === 'upload' ? 'remote' : 'local');
  };

  const selectedItems = (side: Side): TItem[] => {
    const s = sidesRef.current[side];
    return s.sel.map((p) => s.listing?.entries.find((e) => e.path === p)).filter(Boolean).map((e) => ({ path: e!.path, name: e!.name, isDir: isDirLike(e!) }));
  };

  const fsOp = async (side: Side, op: 'mkdir' | 'rename' | 'delete' | 'chmod' | 'touch' | 'copy' | 'symlink', path: string, extra: { targetPath?: string; mode?: string } = {}) => {
    const r = await window.darkhub.ssh.sftpFsOp({ sftpId, side, op, path, ...extra });
    if (!r.ok) setNote(r.code === 'EXISTS' ? t('ssh.sftp.exists', 'Já existe um item com esse nome.') : errText(r)); else setNote('');
    return r.ok;
  };

  const submitDialog = async () => {
    if (!dialog || !dialog.value.trim()) return;
    const dir = sidesRef.current[dialog.side].listing?.path ?? '';
    const target = joinPath(dialog.side, dir, dialog.value.trim());
    let okRes = true;
    if (dialog.kind === 'mkdir') okRes = await fsOp(dialog.side, 'mkdir', target);
    if (dialog.kind === 'touch') {
      okRes = await fsOp(dialog.side, 'touch', target);
      if (okRes) openEditor(sftpId, dialog.side, target, host?.label ?? '');
    }
    if (dialog.kind === 'rename' && dialog.entry) okRes = await fsOp(dialog.side, 'rename', dialog.entry.path, { targetPath: target });
    if (dialog.kind === 'copy' && dialog.entry) okRes = await fsOp(dialog.side, 'copy', dialog.entry.path, { targetPath: target });
    if (dialog.kind === 'symlink' && dialog.entry) okRes = await fsOp(dialog.side, 'symlink', target, { targetPath: dialog.entry.path });
    if (okRes) setDialog(null);
    void refresh(dialog.side);
  };

  const del = async (side: Side) => {
    const items = selectedItems(side);
    if (!items.length) return;
    const one = items.length === 1 ? items[0] : null;
    const msg = side === 'local'
      ? (one ? t('ssh.sftp.confirmDeleteLocal', 'Mover "{n}" para a Lixeira?').replace('{n}', one.name) : t('ssh.sftp.confirmDeleteLocalMany', 'Mover {n} itens para a Lixeira?').replace('{n}', String(items.length)))
      : one ? (one.isDir ? t('ssh.sftp.confirmDeleteDir', 'Apagar a pasta remota "{n}" e TUDO dentro dela? Não há lixeira no servidor.') : t('ssh.sftp.confirmDeleteRemote', 'Apagar "{n}" do servidor? Não há lixeira no servidor.')).replace('{n}', one.name)
        : t('ssh.sftp.confirmDeleteRemoteMany', 'Apagar {n} itens do servidor (pastas com todo o conteúdo)? Não há lixeira no servidor.').replace('{n}', String(items.length));
    if (!window.confirm(msg)) return;
    for (const it of items) if (!(await fsOp(side, 'delete', it.path))) break;
    void refresh(side);
  };

  const openEntry = (side: Side, e: SshFileEntry) => {
    if (isDirLike(e)) { void list(side, e.path); return; }
    openEditor(sftpId, side, e.path, host?.label ?? '');
  };

  const editExternal = async (e: SshFileEntry) => {
    const r = await window.darkhub.ssh.sftpEditExternal({ sftpId, path: e.path });
    if (!r.ok) setNote(errText(r));
  };

  const onKey = (side: Side) => (ev: React.KeyboardEvent) => {
    const s = sidesRef.current[side];
    const one = s.sel.length === 1 ? s.listing?.entries.find((e) => e.path === s.sel[0]) : undefined;
    if (ev.key === 'Delete') { ev.preventDefault(); void del(side); }
    else if (ev.key === 'F2' && one) { ev.preventDefault(); setDialog({ kind: 'rename', side, value: one.name, entry: one }); }
    else if (ev.key === 'F5') { ev.preventDefault(); void refresh(side); }
    else if (ev.key === 'Enter' && one) { ev.preventDefault(); openEntry(side, one); }
    else if (ev.key === 'Backspace' && s.listing?.parent) { ev.preventDefault(); void list(side, s.listing.parent); }
    else if (ev.key === 'a' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); patch(side)({ sel: sortEntries(s.listing?.entries ?? [], s).map((e) => e.path) }); }
    else if (ev.key === 'F4' && one && !isDirLike(one)) { ev.preventDefault(); openEditor(sftpId, side, one.path, host?.label ?? ''); }
  };

  const paneActions = (side: Side) => {
    const n = sides[side].sel.length;
    return (
      <>
        <button type="button" className="dh-btn dh-btn-sm dh-btn-accent" disabled={!n} onClick={() => transferItems(side === 'local' ? 'upload' : 'download', selectedItems(side))}>
          {side === 'local' ? <>{t('ssh.sftp.upload', 'Enviar')}<ArrowRight size={13} /></> : <><ChevronLeft size={13} />{t('ssh.sftp.download', 'Baixar')}</>}
        </button>
        <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" title={t('ssh.sftp.mkdir', 'Nova pasta')} onClick={() => setDialog({ kind: 'mkdir', side, value: '' })}><Plus size={13} /></button>
        <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" title={t('ssh.sftp.newFile', 'Novo arquivo')} onClick={() => setDialog({ kind: 'touch', side, value: '' })}><FileCode size={13} /></button>
        <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" title={t('ssh.delete', 'Apagar')} disabled={!n} onClick={() => del(side)}><Trash2 size={13} /></button>
      </>
    );
  };

  const menuItems = (side: Side, e: SshFileEntry | null) => {
    const n = sides[side].sel.length;
    const items: { label: string; icon: React.ComponentType<{ size?: number }>; run: () => void; danger?: boolean; hide?: boolean }[] = [
      { label: t('ssh.sftp.open', 'Abrir'), icon: FolderOpen, run: () => e && openEntry(side, e), hide: !e || !isDirLike(e) },
      { label: t('ssh.sftp.edit', 'Editar no DarkHub (F4)'), icon: FileCode, run: () => e && openEditor(sftpId, side, e.path, host?.label ?? ''), hide: !e || isDirLike(e) || n > 1 },
      { label: t('ssh.sftp.editExternal', 'Editar no app do Windows'), icon: ExternalLink, run: () => e && editExternal(e), hide: !e || isDirLike(e) || side !== 'remote' || n > 1 },
      { label: side === 'local' ? t('ssh.sftp.uploadSel', 'Enviar para o servidor') : t('ssh.sftp.downloadSel', 'Baixar para este PC'), icon: side === 'local' ? Upload : Download, run: () => transferItems(side === 'local' ? 'upload' : 'download', selectedItems(side)), hide: !n },
      { label: t('ssh.sftp.renameF2', 'Renomear (F2)'), icon: Edit3, run: () => e && setDialog({ kind: 'rename', side, value: e.name, entry: e }), hide: !e || n > 1 },
      { label: t('ssh.sftp.duplicate', 'Duplicar'), icon: Copy, run: () => e && setDialog({ kind: 'copy', side, value: `${e.name}.copy`, entry: e }), hide: !e || n > 1 },
      { label: t('ssh.sftp.symlink', 'Criar link simbólico'), icon: Link, run: () => e && setDialog({ kind: 'symlink', side, value: `${e.name}.link`, entry: e }), hide: !e || n > 1 || side !== 'remote' },
      { label: t('ssh.sftp.copyPath', 'Copiar caminho'), icon: Copy, run: () => void navigator.clipboard.writeText(sides[side].sel.join('\n') || sides[side].listing?.path || ''), hide: false },
      { label: t('ssh.sftp.properties', 'Propriedades'), icon: Info, run: () => e && setProps({ side, entry: e }), hide: !e || n > 1 },
      { label: t('ssh.sftp.mkdir', 'Nova pasta'), icon: Plus, run: () => setDialog({ kind: 'mkdir', side, value: '' }), hide: Boolean(e) },
      { label: t('ssh.sftp.newFile', 'Novo arquivo'), icon: FileCode, run: () => setDialog({ kind: 'touch', side, value: '' }), hide: Boolean(e) },
      { label: t('ssh.sftp.refresh', 'Atualizar (F5)'), icon: RefreshCw, run: () => void refresh(side), hide: Boolean(e) },
      { label: n > 1 ? t('ssh.sftp.deleteN', 'Apagar {n} itens').replace('{n}', String(n)) : t('ssh.delete', 'Apagar'), icon: Trash2, run: () => void del(side), danger: true, hide: !n }
    ];
    return items.filter((i) => !i.hide);
  };

  const sudoModal = sudoAsk ? (
    <Modal tone="warn" title={t('ssh.root.askTitle', 'Senha do sudo')} onClose={() => { setSudoAsk(null); setSudoPw(''); }}
      footer={<><button type="button" className="dh-btn" onClick={() => { setSudoAsk(null); setSudoPw(''); }}>{t('ssh.cancel', 'Cancelar')}</button><button type="button" className="dh-btn dh-btn-danger" disabled={!sudoPw} onClick={() => { const pw = sudoPw; setSudoPw(''); setSudoAsk(null); void open(undefined, true, pw); }}>{t('ssh.root.enter', 'Entrar como root')}</button></>}>
      <p>{sudoAsk.wrong ? t('ssh.root.wrongAsk', 'A senha usada não foi aceita pelo sudo. Digite a senha do sudo deste usuário.') : t('ssh.root.askText', 'O sudo deste servidor pede senha. Ela é usada só nesta sessão e não é salva.')}</p>
      <input type="password" autoFocus className="dh-input w-full" value={sudoPw} onChange={(e) => setSudoPw(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && sudoPw) { const pw = sudoPw; setSudoPw(''); setSudoAsk(null); void open(undefined, true, pw); } }} />
    </Modal>
  ) : null;

  if (!visible) return null;
  if (phase !== 'open') {
    return (
      <div className="max-w-md mx-auto mt-10 dh-card p-5 space-y-3">
        <h2 className="dh-section-title">SFTP · {host?.label}</h2>
        {phase === 'opening' ? <p className="flex items-center gap-2 text-[13px] text-zinc-400"><Loader2 size={14} className="animate-spin" />{t('ssh.term.connecting', 'Conectando...')}</p> : null}
        {phase === 'auth' ? (
          <>
            <input type="password" autoFocus className="dh-input w-full" value={password} placeholder={t('ssh.key.password', 'Senha')} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void open(password, startRoot); }} />
            <label className="flex items-center gap-2 text-[13px] text-zinc-300"><input type="checkbox" checked={startRoot} onChange={(e) => setStartRoot(e.target.checked)} />{t('ssh.root.start', 'Abrir como root (sudo)')}</label>
            <button type="button" className="dh-btn dh-btn-primary" onClick={() => open(password, startRoot)}>{t('ssh.connect', 'Conectar')}</button>
          </>
        ) : null}
        {phase === 'error' ? <button type="button" className="dh-btn" onClick={() => open()}>{t('ssh.retry', 'Tentar de novo')}</button> : null}
        {openErr ? <p className="text-[12.5px] text-red-300">{openErr}</p> : null}
        {sudoModal}
      </div>
    );
  }


  return (
    <div className="flex flex-col h-full min-h-0 gap-2">
      <div className={`flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-lg border text-[12px] ${root ? 'border-red-500/50 bg-red-500/10 text-red-200' : 'border-zinc-800/80 text-zinc-400'}`}>
        <Server size={13} />
        <span className="font-mono">{host?.label}</span>
        {root ? <span>{t('ssh.root.banner', 'Modo root: tudo aqui roda como root via sudo. Arquivos novos ficam com dono root.')}</span> : null}
        <span className="flex-1" />
        <button type="button" className={`dh-btn dh-btn-sm ${root ? '' : 'dh-btn-danger'}`} disabled={rootBusy} onClick={() => open(undefined, !root)} title={t('ssh.root.help', 'Reabre o SFTP rodando o sftp-server do servidor com sudo, como o WinSCP faz.')}>
          {rootBusy ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}{root ? t('ssh.root.leave', 'Voltar ao meu usuário') : t('ssh.root.toggle', 'Acessar como root')}
        </button>
      </div>
      <div className="flex flex-1 min-h-0 gap-2">
        {(['local', 'remote'] as Side[]).map((side) => (
          <Pane key={side} side={side} s={sides[side]} setS={patch(side)} focused={focus === side} onFocus={() => setFocus(side)}
            onOpen={(e) => openEntry(side, e)} onNavigate={(p) => list(side, p)} onRefresh={() => refresh(side)}
            onDropInternal={(items) => transferItems(side === 'remote' ? 'upload' : 'download', items)}
            onDropFiles={side === 'remote' ? (paths) => transferItems('upload', paths.map((p) => ({ path: p, name: baseName('local', p), isDir: false }))) : undefined}
            onContext={(ev, entry) => { ev.preventDefault(); setFocus(side); setMenu({ side, x: ev.clientX, y: ev.clientY, entry }); }}
            onKey={onKey(side)} actions={paneActions(side)} drives={side === 'local' ? sides.local.listing?.drives : undefined} home={homes[side]} />
        ))}
      </div>
      {note ? <p className="text-[12.5px] text-red-300 flex items-center gap-2">{note}<button type="button" className="text-zinc-500 hover:text-zinc-200" onClick={() => setNote('')}><X size={12} /></button></p> : null}
      {watches.length ? (
        <div className="rounded-xl border border-zinc-800/80 divide-y divide-zinc-900">
          <div className="px-3 py-1.5 text-[11.5px] text-zinc-500">{t('ssh.sftp.watching', 'Editando no app do Windows: cada vez que você salvar, o arquivo volta para o servidor')}</div>
          {watches.map((w) => (
            <div key={w.watchId} className="flex items-center gap-3 px-3 py-1.5 text-[12px]">
              <ExternalLink size={13} className="text-zinc-400" />
              <span className="font-mono truncate flex-1 text-zinc-200">{w.remotePath}</span>
              <span className={w.status === 'error' ? 'text-red-300' : w.status === 'uploaded' ? 'text-emerald-300' : 'text-zinc-400'}>
                {w.status === 'uploading' ? t('ssh.sftp.wUploading', 'enviando...') : w.status === 'uploaded' ? t('ssh.sftp.wUploaded', 'enviado {t}').replace('{t}', w.at ? new Date(w.at).toLocaleTimeString() : '') : w.status === 'error' ? w.error : t('ssh.sftp.wWatching', 'aguardando salvar')}
              </span>
              <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" onClick={() => void window.darkhub.ssh.sftpStopWatch(w.watchId)}>{t('ssh.sftp.stopWatch', 'Parar')}</button>
            </div>
          ))}
        </div>
      ) : null}
      {transfers.length ? (
        <div className="rounded-xl border border-zinc-800/80 max-h-44 overflow-y-auto divide-y divide-zinc-900">
          <div className="flex items-center justify-between px-3 py-1.5 text-[11.5px] text-zinc-500"><span>{t('ssh.sftp.queue', 'Transferências')}</span><button type="button" className="hover:text-zinc-200" onClick={clearFinishedTransfers}>{t('ssh.sftp.clear', 'Limpar concluídas')}</button></div>
          {transfers.map((x) => {
            const pct = x.totalBytes ? Math.min(100, Math.round((x.transferredBytes / x.totalBytes) * 100)) : x.status === 'done' ? 100 : 0;
            return (
              <div key={x.transferId} className="flex items-center gap-3 px-3 py-1.5 text-[12px]">
                <span className="w-4 text-zinc-500">{x.direction === 'upload' ? '↑' : '↓'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-zinc-200">{x.name}</span>
                  {x.isDir ? <span className="block truncate text-[11px] text-zinc-500 font-mono">{x.filesDone ?? 0}/{x.filesTotal ?? 0} {t('ssh.sftp.filesWord', 'arquivos')}{x.filesSkipped ? ` · ${x.filesSkipped} ${t('ssh.sftp.skipped', 'pulados')}` : ''}{x.status === 'running' && x.currentFile ? ` · ${x.currentFile}` : ''}</span> : null}
                </span>
                <div className="w-40 h-1.5 rounded bg-zinc-800 overflow-hidden"><div className={`h-full ${x.status === 'failed' ? 'bg-red-400' : x.status === 'done' ? 'bg-emerald-400' : 'bg-blue-400'}`} style={{ width: `${pct}%` }} /></div>
                <span className="w-40 text-right font-mono text-zinc-500">{x.status === 'running' ? `${pct}% · ${fmtBytes(x.speedBps)}/s` : x.status === 'done' ? fmtBytes(x.totalBytes) : x.status === 'cancelled' ? t('ssh.sftp.cancelled', 'cancelada') : <span className="text-red-300" title={x.error}>{t('ssh.sftp.failed', 'falhou')}</span>}</span>
                {x.status === 'running' ? <button type="button" className="text-zinc-500 hover:text-red-300" onClick={() => void window.darkhub.ssh.sftpCancelTransfer(x.transferId)}><X size={13} /></button> : <span className="w-[13px]" />}
              </div>
            );
          })}
        </div>
      ) : null}

      {menu ? (
        <ContextMenu x={menu.x} y={menu.y}>
          {menuItems(menu.side, menu.entry).map((i) => (
            <button type="button" key={i.label} className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12.5px] whitespace-nowrap hover:bg-zinc-800 ${i.danger ? 'text-red-300' : 'text-zinc-200'}`} onClick={() => { setMenu(null); i.run(); }}>
              <i.icon size={13} />{i.label}
            </button>
          ))}
        </ContextMenu>
      ) : null}

      {dialog ? (
        <Modal title={{ mkdir: t('ssh.sftp.mkdir', 'Nova pasta'), touch: t('ssh.sftp.newFile', 'Novo arquivo'), rename: t('ssh.sftp.rename', 'Renomear'), copy: t('ssh.sftp.duplicate', 'Duplicar'), symlink: t('ssh.sftp.symlink', 'Criar link simbólico') }[dialog.kind]} onClose={() => setDialog(null)}
          footer={<><button type="button" className="dh-btn" onClick={() => setDialog(null)}>{t('ssh.cancel', 'Cancelar')}</button><button type="button" className="dh-btn dh-btn-primary" disabled={!dialog.value.trim() || /[\\/]/.test(dialog.value)} onClick={submitDialog}>{t('ssh.save', 'Salvar')}</button></>}>
          <input className="dh-input w-full font-mono" autoFocus value={dialog.value} onChange={(e) => setDialog({ ...dialog, value: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') void submitDialog(); }}
            onFocus={(e) => { const dot = e.target.value.lastIndexOf('.'); if (dialog.kind === 'rename' && dot > 0) e.target.setSelectionRange(0, dot); }} />
          {dialog.kind === 'copy' && dialog.side === 'remote' ? <p className="dh-help">{t('ssh.sftp.copyHelp', 'A cópia é feita no próprio servidor (cp -a), sem passar pelo seu PC.')}</p> : null}
          {dialog.kind === 'touch' ? <p className="dh-help">{t('ssh.sftp.touchHelp', 'O arquivo é criado vazio e abre no editor.')}</p> : null}
          {note ? <p className="text-[12.5px] text-red-300">{note}</p> : null}
        </Modal>
      ) : null}

      {sudoModal}
      {props ? <PropertiesModal sftpId={sftpId} side={props.side} entry={props.entry} onClose={() => setProps(null)} onSaved={() => void refresh(props.side)} /> : null}

      {conflict ? (
        <Modal tone="warn" title={conflict.item.isDir ? t('ssh.sftp.dirExistsTitle', 'A pasta "{n}" já existe no destino').replace('{n}', conflict.item.name) : t('ssh.sftp.fileExistsTitle', '"{n}" já existe no destino').replace('{n}', conflict.item.name)}
          footer={<>
            <button type="button" className="dh-btn" onClick={() => { conflict.resolve({ action: 'cancel', all: false }); setConflict(null); }}>{t('ssh.cancel', 'Cancelar')}</button>
            <button type="button" className="dh-btn" onClick={() => { conflict.resolve({ action: 'skip', all: applyAll }); setConflict(null); }}>{conflict.item.isDir ? t('ssh.sftp.mergeSkip', 'Mesclar, mantendo os existentes') : t('ssh.sftp.skip', 'Pular')}</button>
            <button type="button" className="dh-btn dh-btn-danger" onClick={() => { conflict.resolve({ action: 'overwrite', all: applyAll }); setConflict(null); }}>{conflict.item.isDir ? t('ssh.sftp.mergeOverwrite', 'Mesclar, substituindo') : t('ssh.sftp.replace', 'Substituir')}</button>
          </>}>
          <p>{conflict.item.isDir ? t('ssh.sftp.dirExistsText', 'Os arquivos serão colocados dentro da pasta existente. Escolha o que fazer com arquivos de mesmo nome.') : t('ssh.sftp.fileExistsText', 'Substituir apaga a versão que está no destino.')}</p>
          {conflict.many ? <label className="flex items-center gap-2"><input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} />{t('ssh.sftp.applyAll', 'Fazer o mesmo para os próximos conflitos')}</label> : null}
        </Modal>
      ) : null}
    </div>
  );
}
