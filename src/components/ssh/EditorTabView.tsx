import React, { useCallback, useEffect, useRef, useState } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { indentWithTab } from '@codemirror/commands';
import { LanguageDescription, indentUnit } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { oneDark } from '@codemirror/theme-one-dark';
import { openSearchPanel, gotoLine } from '@codemirror/search';
import { Save, RefreshCw, Loader2, Search, AlertTriangle, Lock, Unlock, Hash } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';
import type { SshTextFile } from '../../global';
import { Modal, errText, fmtBytes, fmtDate } from './ui';
import { setEditorDirty, type EditorTab } from './sshStore';

const frost = EditorView.theme({
  '&': { height: '100%', fontSize: '13px', backgroundColor: '#0b0c0f' },
  '.cm-scroller': { fontFamily: '"Geist Mono Variable", "Cascadia Mono", Consolas, monospace', lineHeight: '1.5' },
  '.cm-gutters': { backgroundColor: '#0b0c0f', borderRight: '1px solid #1c1f24' },
  '.cm-activeLine': { backgroundColor: '#ffffff08' },
  '.cm-activeLineGutter': { backgroundColor: '#ffffff0a' },
  '.cm-panels': { backgroundColor: '#111317', color: '#d4d8de' },
  '.cm-panels input, .cm-panels button': { fontSize: '12px' }
}, { dark: true });

// file names that language-data does not recognise by extension
const EXTRA: [RegExp, string][] = [
  [/^\.(bashrc|bash_profile|profile|zshrc|bash_aliases|bash_logout)$/, 'Shell'],
  [/\.(service|timer|socket|mount|target|desktop)$/, 'Properties files'],
  [/^(\.env(\..*)?|.*\.env)$/, 'Properties files'],
  [/^(crontab|hosts|fstab|sshd_config|ssh_config)$/, 'Properties files'],
  [/^(authorized_keys|known_hosts)$/, 'Properties files'],
  [/\.(conf|cnf|cfg)$/, 'Properties files'],
  [/^Caddyfile$/, 'Properties files'],
  [/^Makefile$|\.mk$/, 'CMake']
];

export function languageFor(name: string) {
  const found = LanguageDescription.matchFilename(languages, name);
  if (found) return found;
  const hit = EXTRA.find(([re]) => re.test(name));
  return hit ? languages.find((l) => l.name === hit[1]) ?? null : null;
}

export default function EditorTabView({ tab, visible }: { tab: EditorTab; visible: boolean }) {
  const { t } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const comp = useRef({ lang: new Compartment(), wrap: new Compartment(), ro: new Compartment(), indent: new Compartment() });
  const meta = useRef<SshTextFile | null>(null);
  const saved = useRef('');
  const [file, setFile] = useState<SshTextFile | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error' | 'binary' | 'large'>('loading');
  const [err, setErr] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [wrap, setWrap] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [eol, setEol] = useState<'lf' | 'crlf'>('lf');
  const [cursor, setCursor] = useState({ line: 1, col: 1, lines: 1, sel: 0 });
  const [conflict, setConflict] = useState<{ deleted?: boolean } | null>(null);
  const [langName, setLangName] = useState('');
  const saveRef = useRef<(force?: boolean) => void>(() => {});

  const markDirty = useCallback((d: boolean) => { setDirty(d); setEditorDirty(tab.id, d); }, [tab.id]);

  const load = useCallback(async (force = false) => {
    setPhase('loading'); setErr(''); setNote(null);
    const r = await window.darkhub.ssh.sftpReadText({ sftpId: tab.sftpId, side: tab.side, path: tab.path, force });
    if (!r.ok) {
      setErr(errText(r));
      setPhase(r.code === 'BINARY' ? 'binary' : r.code === 'TOO_LARGE' ? 'large' : 'error');
      return;
    }
    meta.current = r;
    saved.current = r.content;
    setFile(r);
    setEol(r.eol);
    setReadOnly(r.readOnly);
    setPhase('ready');
    markDirty(false);
    const v = view.current;
    if (v) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: r.content }, effects: comp.current.ro.reconfigure(EditorState.readOnly.of(r.readOnly)) });
    }
  }, [tab.sftpId, tab.side, tab.path, markDirty]);

  // build the editor once
  useEffect(() => {
    if (!host.current) return;
    const c = comp.current;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: '',
        extensions: [
          basicSetup,
          keymap.of([
            indentWithTab,
            { key: 'Mod-s', preventDefault: true, run: () => { saveRef.current(); return true; } },
            { key: 'Mod-g', preventDefault: true, run: gotoLine }
          ]),
          oneDark,
          frost,
          c.lang.of([]),
          c.wrap.of([]),
          c.ro.of(EditorState.readOnly.of(false)),
          c.indent.of(indentUnit.of('  ')),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) markDirty(u.state.doc.toString() !== saved.current);
            if (u.docChanged || u.selectionSet) {
              const pos = u.state.selection.main;
              const line = u.state.doc.lineAt(pos.head);
              setCursor({ line: line.number, col: pos.head - line.from + 1, lines: u.state.doc.lines, sel: Math.abs(pos.to - pos.from) });
            }
          })
        ]
      })
    });
    view.current = v;
    void load();
    // syntax highlighting loads lazily per language
    const lang = languageFor(tab.title);
    setLangName(lang?.name ?? t('ssh.ed.plain', 'Texto'));
    if (lang) void lang.load().then((support) => { if (view.current === v) v.dispatch({ effects: c.lang.reconfigure(support) }); }).catch(() => {});
    return () => { v.destroy(); view.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { view.current?.dispatch({ effects: comp.current.wrap.reconfigure(wrap ? EditorView.lineWrapping : []) }); }, [wrap]);
  useEffect(() => { view.current?.dispatch({ effects: comp.current.ro.reconfigure(EditorState.readOnly.of(readOnly)) }); }, [readOnly]);
  useEffect(() => { if (visible && phase === 'ready') setTimeout(() => view.current?.focus(), 0); }, [visible, phase]);

  const save = useCallback(async (force = false) => {
    const v = view.current;
    const m = meta.current;
    if (!v || !m || saving) return;
    setSaving(true); setNote(null);
    const content = v.state.doc.toString();
    const r = await window.darkhub.ssh.sftpWriteText({
      sftpId: tab.sftpId, side: tab.side, path: tab.path, content, encoding: m.encoding, eol, bom: m.bom,
      expectedMtimeMs: force ? undefined : m.mtimeMs, expectedSize: force ? undefined : m.size, force
    });
    setSaving(false);
    if (!r.ok) {
      if (r.code === 'CONFLICT') { setConflict({ deleted: r.deleted }); return; }
      setNote({ ok: false, text: r.code === 'PERMISSION' ? t('ssh.ed.permission', 'Sem permissão para gravar este arquivo com este usuário.') : errText(r) });
      return;
    }
    meta.current = { ...m, mtimeMs: r.mtimeMs, size: r.size, eol };
    setFile(meta.current);
    saved.current = content;
    markDirty(false);
    setNote({ ok: true, text: t('ssh.ed.saved', 'Salvo às {t}.').replace('{t}', new Date().toLocaleTimeString()) });
  }, [tab.sftpId, tab.side, tab.path, eol, saving, markDirty, t]);
  saveRef.current = (force?: boolean) => { void save(force); };

  const reload = () => {
    if (dirty && !window.confirm(t('ssh.ed.confirmReload', 'Descartar as alterações e recarregar do disco?'))) return;
    void load();
  };

  const changeEol = (v: 'lf' | 'crlf') => { setEol(v); markDirty(true); };

  return (
    <div className={`${visible ? 'flex' : 'hidden'} flex-col h-full min-h-0 rounded-xl border border-zinc-800/80 overflow-hidden`}>
      <div className="flex flex-wrap items-center gap-2 px-2 py-1.5 border-b border-zinc-800/80 bg-zinc-950">
        <span className="font-mono text-[12px] text-zinc-400 truncate max-w-[45%]" title={tab.path}>{tab.side === 'remote' ? `${tab.hostLabel}:` : ''}{tab.path}</span>
        {dirty ? <span className="text-[11.5px] text-amber-300">{t('ssh.ed.unsaved', 'não salvo')}</span> : null}
        <span className="flex-1" />
        <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" title={t('ssh.ed.find', 'Buscar e substituir (Ctrl+F)')} onClick={() => view.current && openSearchPanel(view.current)}><Search size={13} /></button>
        <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" title={t('ssh.ed.goto', 'Ir para a linha (Ctrl+G)')} onClick={() => view.current && gotoLine(view.current)}><Hash size={13} /></button>
        <label className="flex items-center gap-1 text-[11.5px] text-zinc-400"><input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} />{t('ssh.ed.wrap', 'Quebrar linhas')}</label>
        <select className="dh-input h-7 text-[11.5px] w-[76px]" value={eol} onChange={(e) => changeEol(e.target.value as 'lf' | 'crlf')} title={t('ssh.ed.eol', 'Final de linha')}>
          <option value="lf">LF</option><option value="crlf">CRLF</option>
        </select>
        <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" title={readOnly ? t('ssh.ed.unlock', 'Permitir edição') : t('ssh.ed.lock', 'Somente leitura')} onClick={() => setReadOnly((r) => !r)}>{readOnly ? <Lock size={13} /> : <Unlock size={13} />}</button>
        <button type="button" className="dh-btn dh-btn-sm" onClick={reload}><RefreshCw size={13} />{t('ssh.ed.reload', 'Recarregar')}</button>
        <button type="button" className="dh-btn dh-btn-sm dh-btn-primary" disabled={!dirty || saving || readOnly || phase !== 'ready'} onClick={() => save()}>{saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}{t('ssh.save', 'Salvar')}</button>
      </div>
      <div className="relative flex-1 min-h-0">
        <div ref={host} className={`h-full ${phase === 'ready' ? '' : 'invisible'}`} />
        {phase === 'loading' ? <div className="absolute inset-0 p-4 space-y-2">{Array.from({ length: 12 }, (_, i) => <div key={i} className="h-3.5 rounded bg-zinc-900 animate-pulse" style={{ width: `${30 + ((i * 37) % 60)}%` }} />)}</div> : null}
        {phase === 'error' || phase === 'binary' || phase === 'large' ? (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-md space-y-3 text-center">
              <AlertTriangle size={20} className="mx-auto text-amber-300" />
              <p className="text-[13px] text-zinc-300">{phase === 'binary' ? t('ssh.ed.binary', 'Este arquivo parece binário. Abrir como texto pode corrompê-lo ao salvar.') : phase === 'large' ? t('ssh.ed.large', 'Arquivo grande demais para o editor (limite 10 MB). Use "Editar no app do Windows" ou baixe o arquivo.') : err}</p>
              <div className="flex justify-center gap-2">
                {phase === 'binary' ? <button type="button" className="dh-btn" onClick={() => { setReadOnly(true); void load(true); }}>{t('ssh.ed.openAnyway', 'Abrir somente leitura')}</button> : null}
                {phase === 'error' ? <button type="button" className="dh-btn" onClick={() => load()}>{t('ssh.retry', 'Tentar de novo')}</button> : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 px-3 h-6 border-t border-zinc-800/80 bg-zinc-950 text-[11px] text-zinc-500 font-mono">
        <span>{t('ssh.ed.ln', 'Ln')} {cursor.line}, {t('ssh.ed.col', 'Col')} {cursor.col}{cursor.sel ? ` (${cursor.sel})` : ''}</span>
        <span>{cursor.lines} {t('ssh.ed.lines', 'linhas')}</span>
        <span>{langName}</span>
        {file ? <span>{file.encoding.toUpperCase()}{file.bom ? ' BOM' : ''}</span> : null}
        <span>{eol.toUpperCase()}</span>
        {file ? <span>{fmtBytes(file.size)}</span> : null}
        {file?.mtimeMs ? <span>{fmtDate(file.mtimeMs)}</span> : null}
        {readOnly ? <span className="text-amber-300">{t('ssh.ed.readOnly', 'somente leitura')}</span> : null}
        <span className="flex-1" />
        {note ? <span className={note.ok ? 'text-emerald-300' : 'text-red-300'}>{note.text}</span> : null}
      </div>
      {conflict ? (
        <Modal tone="warn" title={conflict.deleted ? t('ssh.ed.deletedTitle', 'O arquivo foi apagado no servidor') : t('ssh.ed.conflictTitle', 'O arquivo mudou desde que foi aberto')} onClose={() => setConflict(null)}
          footer={<>
            <button type="button" className="dh-btn" onClick={() => setConflict(null)}>{t('ssh.cancel', 'Cancelar')}</button>
            {!conflict.deleted ? <button type="button" className="dh-btn" onClick={() => { setConflict(null); markDirty(false); void load(); }}>{t('ssh.ed.discardReload', 'Descartar minhas mudanças')}</button> : null}
            <button type="button" className="dh-btn dh-btn-danger" onClick={() => { setConflict(null); void save(true); }}>{conflict.deleted ? t('ssh.ed.recreate', 'Recriar com meu conteúdo') : t('ssh.ed.overwrite', 'Sobrescrever com o meu')}</button>
          </>}>
          <p>{conflict.deleted ? t('ssh.ed.deletedText', 'Outra pessoa ou processo apagou este arquivo.') : t('ssh.ed.conflictText', 'Outra pessoa ou processo alterou este arquivo. Salvar agora apaga a versão dela.')}</p>
        </Modal>
      ) : null}
    </div>
  );
}
