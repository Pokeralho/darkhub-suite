import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Eraser, FileCode, Loader2, Lock, Play, Plus, Save, Square, Trash2 } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';
import { DarkOSConfirmDialog } from '../darkos/DarkOSConfirmDialog';
import type { PsSnippet } from '../../global';

const api = () => window.darkhub?.powershell;
const MAX_OUTPUT = 400000;
type Line = { type: 'stdout' | 'stderr' | 'info'; text: string };

/** Free-form script runner: live output, stop, elevated option, and named snippets stored in userData. */
export default function CustomScriptRunner() {
  const { t } = useI18n();
  const [script, setScript] = useState('Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 Name, Id, CPU');
  const [elevated, setElevated] = useState(false);
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [output, setOutput] = useState<Line[]>([]);
  const [confirmRun, setConfirmRun] = useState(false);
  const [snippets, setSnippets] = useState<PsSnippet[]>([]);
  const [snippetId, setSnippetId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [toDelete, setToDelete] = useState<PsSnippet | null>(null);
  const runIdRef = useRef<string | null>(null);
  const outRef = useRef<HTMLPreElement>(null);

  const push = useCallback((l: Line) => {
    setOutput((cur) => {
      const next = [...cur, l];
      let size = next.reduce((n, x) => n + x.text.length, 0);
      while (size > MAX_OUTPUT && next.length > 1) size -= (next.shift() as Line).text.length;
      return next;
    });
  }, []);

  type Ev = Parameters<Parameters<NonNullable<ReturnType<typeof api>>['onCustomEvent']>[0]>[0];
  // Events can arrive before customStart resolves with the runId: keep them until it does.
  const early = useRef<Ev[]>([]);
  const starting = useRef(false);
  const apply = useCallback((ev: Ev) => {
    if (ev.type === 'exit') {
      push({ type: 'info', text: ev.stopped ? t('psx.custom.stopped', 'Interrompido.') : `${t('psx.custom.exit', 'Terminou com código')} ${ev.code}` });
      runIdRef.current = null; setRunId(null); setRunning(false);
    } else if (ev.text) push({ type: ev.type, text: ev.text });
  }, [push, t]);
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    const off = api()?.onCustomEvent?.((ev) => {
      if (!runIdRef.current) {
        if (starting.current) early.current.push(ev);
        else if (ev.type === 'exit') setRunning(false); // a run started before this screen was opened
        return;
      }
      if (ev.runId === runIdRef.current) applyRef.current(ev);
    });
    api()?.snippetsList?.().then((r) => { if (r?.ok) setSnippets(r.snippets || []); }).catch(() => {});
    api()?.customStatus?.().then((r) => { if (r?.running) setRunning(true); }).catch(() => {});
    return () => { off?.(); };
  }, []);

  useEffect(() => { const el = outRef.current; if (el) el.scrollTop = el.scrollHeight; }, [output]);

  const start = async () => {
    setConfirmRun(false);
    setOutput([{ type: 'info', text: elevated ? t('psx.custom.startElevated', 'Iniciando como administrador (a saída aparece ao terminar)...') : t('psx.custom.start', 'Iniciando...') }]);
    setRunning(true);
    early.current = [];
    starting.current = true;
    const r = await api()?.customStart({ script, elevated, confirm: true }).finally(() => { starting.current = false; });
    if (!r?.ok || !r.runId) {
      setRunning(false);
      push({ type: 'stderr', text: r?.error || t('psx.noBackend', 'Backend indisponível (abra pelo app).') });
      return;
    }
    runIdRef.current = r.runId; setRunId(r.runId);
    const queued = early.current.filter((ev) => ev.runId === r.runId);
    early.current = [];
    queued.forEach((ev) => applyRef.current(ev));
  };
  const stop = async () => {
    const r = await api()?.customStop();
    if (r && !r.ok) push({ type: 'stderr', text: r.error || '' });
  };

  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); window.setTimeout(() => setMsg(null), 4000); };
  const saveSnippet = async () => {
    const r = await api()?.snippetSave({ id: snippetId || undefined, name: name.trim(), script, elevated });
    if (r?.ok) { setSnippets(r.snippets || []); setSnippetId(r.snippet?.id || null); flash(true, t('psx.snip.saved', 'Snippet salvo.')); }
    else flash(false, r?.error || t('psx.noBackend', 'Backend indisponível (abra pelo app).'));
  };
  const loadSnippet = (s: PsSnippet) => { setScript(s.script); setElevated(s.elevated); setName(s.name); setSnippetId(s.id); };
  const del = async () => {
    const s = toDelete; setToDelete(null);
    if (!s) return;
    const r = await api()?.snippetDelete({ id: s.id });
    if (r?.ok) { setSnippets(r.snippets || []); if (snippetId === s.id) setSnippetId(null); }
  };

  const lines = script.split('\n');
  return (
    <div className="flex flex-col lg:flex-row gap-5 items-start">
      <aside className="w-full lg:w-60 shrink-0 dh-card overflow-hidden">
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-zinc-800/80">
          <h3 className="dh-section-title">{t('psx.snip.title', 'Snippets')}</h3>
          <button className="dh-btn dh-btn-sm dh-btn-ghost" onClick={() => { setSnippetId(null); setName(''); setScript(''); }} aria-label={t('psx.snip.new', 'Novo')}><Plus size={13} />{t('psx.snip.new', 'Novo')}</button>
        </div>
        {snippets.length ? (
          <ul className="divide-y divide-zinc-800/80 max-h-[420px] overflow-auto custom-scrollbar">
            {snippets.map((s) => (
              <li key={s.id} className={`flex items-center gap-1 pr-1.5 ${snippetId === s.id ? 'bg-zinc-800/60' : ''}`}>
                <button className="flex-1 min-w-0 text-left px-3.5 py-2 hover:bg-zinc-900/60" onClick={() => loadSnippet(s)}>
                  <span className="flex items-center gap-1.5 text-[12.5px] text-zinc-300 truncate"><FileCode size={13} className="text-zinc-500 shrink-0" />{s.name}{s.elevated ? <Lock size={11} className="text-amber-300/80 shrink-0" /> : null}</span>
                </button>
                <button className="p-1 text-zinc-500 hover:text-red-300" onClick={() => setToDelete(s)} aria-label={`${t('psx.snip.delete', 'Excluir')} ${s.name}`}><Trash2 size={13} /></button>
              </li>
            ))}
          </ul>
        ) : <p className="px-3.5 py-4 text-[12px] text-zinc-500">{t('psx.snip.none', 'Nenhum snippet salvo ainda.')}</p>}
      </aside>

      <div className="flex-1 min-w-0 space-y-4 w-full">
        <div role="note" className="flex items-start gap-2 border-l-2 border-amber-400 pl-3 py-1 text-[12.5px] text-amber-200/90">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>{t('psx.custom.warning', 'Scripts personalizados rodam com as suas permissões (ou como administrador, se marcado) e podem alterar ou apagar qualquer coisa que você possa. Só execute código que você entende e em que confia.')}</span>
        </div>
        <section className="dh-card p-4 space-y-3">
          <textarea
            className="w-full h-64 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-[12px] leading-[1.6] text-zinc-200 focus:outline-none focus:border-blue-400 custom-scrollbar"
            spellCheck={false} value={script} onChange={(e) => setScript(e.target.value)} disabled={running}
            aria-label={t('psx.custom.editor', 'Script PowerShell')} placeholder="Get-ChildItem $env:TEMP | Measure-Object"
            onKeyDown={(e) => {
              if (e.key === 'Tab') {
                e.preventDefault();
                const el = e.currentTarget; const s = el.selectionStart; const end = el.selectionEnd;
                const next = script.slice(0, s) + '  ' + script.slice(end);
                setScript(next);
                requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 2; });
              }
            }}
          />
          <div className="flex items-center gap-3 flex-wrap">
            {running ? (
              <button className="dh-btn dh-btn-danger" onClick={stop} disabled={elevated && !!runId}><Square size={14} />{t('psx.custom.stop', 'Parar')}</button>
            ) : (
              <button className="dh-btn dh-btn-primary" disabled={!script.trim()} onClick={() => setConfirmRun(true)}><Play size={14} />{t('psx.run', 'Executar')}</button>
            )}
            <label className="inline-flex items-center gap-2 text-[12.5px] text-zinc-300 cursor-pointer select-none">
              <input type="checkbox" className="accent-blue-400" checked={elevated} disabled={running} onChange={(e) => setElevated(e.target.checked)} />
              <Lock size={12} className="text-amber-300/90" />{t('psx.custom.elevated', 'Executar como administrador')}
            </label>
            {elevated ? <span className="text-[11.5px] text-zinc-500">{t('psx.custom.elevatedNote', 'Como administrador a saída só aparece no fim e não dá para parar por aqui.')}</span> : null}
            <span className="ml-auto text-[11px] text-zinc-600 font-mono">{lines.length} {t('psx.custom.lines', 'linhas')}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap border-t border-zinc-800/80 pt-3">
            <input className="dh-input flex-1 min-w-[160px] max-w-xs" maxLength={80} placeholder={t('psx.snip.name', 'Nome do snippet')} value={name} onChange={(e) => setName(e.target.value)} />
            <button className="dh-btn" disabled={!name.trim() || !script.trim()} onClick={saveSnippet}><Save size={14} />{snippetId ? t('psx.snip.update', 'Atualizar snippet') : t('psx.snip.save', 'Salvar snippet')}</button>
            {msg ? <span role="status" className={`text-[12px] ${msg.ok ? 'text-emerald-400' : 'text-red-300'}`}>{msg.text}</span> : null}
          </div>
        </section>

        <section className="dh-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800/80">
            {running ? <Loader2 size={14} className="animate-spin text-blue-300" /> : null}
            <h3 className="dh-section-title">{t('psx.custom.output', 'Saída')}</h3>
            <button className="ml-auto dh-btn dh-btn-sm dh-btn-ghost" onClick={() => setOutput([])} disabled={!output.length}><Eraser size={13} />{t('psx.custom.clear', 'Limpar')}</button>
          </div>
          <pre ref={outRef} aria-live="polite" className="h-64 overflow-auto bg-zinc-950 px-4 py-3 text-[11.5px] leading-[1.6] font-mono whitespace-pre-wrap break-words custom-scrollbar">
            {output.length ? output.map((l, i) => (
              <span key={i} className={l.type === 'stderr' ? 'text-red-300' : l.type === 'info' ? 'text-zinc-500 block' : 'text-zinc-300'}>{l.text}</span>
            )) : <span className="text-zinc-600">{t('psx.custom.noOutput', 'A saída aparece aqui em tempo real.')}</span>}
          </pre>
        </section>
      </div>

      <DarkOSConfirmDialog
        open={confirmRun}
        danger={elevated}
        title={elevated ? t('psx.custom.confirmElevated', 'Executar este script como administrador?') : t('psx.custom.confirm', 'Executar este script?')}
        body={(
          <>
            <span className="block">{t('psx.custom.confirmBody', 'O script roda com as suas permissões e pode alterar o sistema. Vai ser executado:')}</span>
            <span className="block mt-2 max-h-48 overflow-auto rounded bg-zinc-950 border border-zinc-800 px-2 py-1.5 font-mono text-[11px] text-zinc-300 whitespace-pre-wrap break-all">
              {lines.slice(0, 60).join('\n')}{lines.length > 60 ? `\n... (+${lines.length - 60})` : ''}
            </span>
          </>
        )}
        confirmLabel={t('psx.confirm.run', 'Executar')}
        onCancel={() => setConfirmRun(false)}
        onConfirm={start}
      />
      <DarkOSConfirmDialog
        open={toDelete !== null}
        danger
        title={t('psx.snip.deleteTitle', 'Excluir snippet?')}
        body={toDelete ? <span className="block font-mono">{toDelete.name}</span> : null}
        confirmLabel={t('psx.snip.delete', 'Excluir')}
        onCancel={() => setToDelete(null)}
        onConfirm={del}
      />
    </div>
  );
}
