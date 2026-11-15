import React, { useMemo, useState } from 'react';
import { Plus, Code, Edit3, Trash2, Play, Package, Search, Loader2, X } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';
import type { SshSnippet, SshSnippetArg } from '../../global';
import { Drawer, Field, EmptyState, Modal, errText, type VaultProps } from './ui';
import { useSshStore } from './sshStore';

const placeholders = (body: string) => Array.from(new Set(Array.from(body.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]{0,31})\s*\}\}/g), (m) => m[1])));

function SnippetDrawer({ vault, reload, snippet, onClose }: VaultProps & { snippet: Partial<SshSnippet>; onClose: () => void }) {
  const { t } = useI18n();
  const [f, setF] = useState<Partial<SshSnippet>>({ runOnConnect: false, argsSchema: [], ...snippet });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const names = placeholders(f.body ?? '');
  const argOf = (n: string): SshSnippetArg => f.argsSchema?.find((a) => a.name === n) ?? { name: n, label: '', default: '', raw: false };
  const setArg = (n: string, patch: Partial<SshSnippetArg>) => setF((x) => ({ ...x, argsSchema: [...(x.argsSchema ?? []).filter((a) => a.name !== n), { ...argOf(n), ...patch }] }));
  const save = async () => {
    setBusy(true); setErr('');
    const r = await window.darkhub.ssh.saveSnippet({ kind: 'snippet', id: f.id, name: f.name ?? '', body: f.body ?? '', packageId: f.packageId ?? null, argsSchema: names.map(argOf), tags: f.tags, runOnConnect: f.runOnConnect });
    setBusy(false);
    if (!r.ok) { setErr(errText(r)); return; }
    await reload();
    onClose();
  };
  return (
    <Drawer title={f.id ? t('ssh.snip.edit', 'Editar snippet') : t('ssh.snip.new', 'Novo snippet')} onClose={onClose}
      footer={<><button type="button" className="dh-btn" onClick={onClose}>{t('ssh.cancel', 'Cancelar')}</button><button type="button" className="dh-btn dh-btn-primary" disabled={busy || !f.name || !f.body?.trim()} onClick={save}>{busy ? <Loader2 size={14} className="animate-spin" /> : null}{t('ssh.save', 'Salvar')}</button></>}>
      <Field label={t('ssh.snip.name', 'Nome')}><input className="dh-input w-full" autoFocus value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label={t('ssh.snip.package', 'Pacote')}>
        <select className="dh-input w-full" value={f.packageId ?? ''} onChange={(e) => setF({ ...f, packageId: e.target.value || null })}>
          <option value="">{t('ssh.none', 'Nenhum')}</option>
          {vault.packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <Field label={t('ssh.snip.body', 'Comando ou script')} help={t('ssh.snip.bodyHelp', 'Use {{nome}} para variáveis: o valor é pedido antes de enviar e vai entre aspas.')}>
        <textarea className="dh-input w-full h-40 font-mono text-[12px]" spellCheck={false} value={f.body ?? ''} placeholder="journalctl -u {{service}} -n 100 --no-pager" onChange={(e) => setF({ ...f, body: e.target.value })} />
      </Field>
      {names.length ? (
        <div className="space-y-2">
          <span className="dh-label">{t('ssh.snip.args', 'Variáveis')}</span>
          {names.map((n) => (
            <div key={n} className="grid grid-cols-[90px_1fr_auto] items-center gap-2">
              <span className="font-mono text-[12px] text-zinc-300 truncate">{n}</span>
              <input className="dh-input h-8 text-[12px]" value={argOf(n).default} placeholder={t('ssh.snip.default', 'valor padrão')} onChange={(e) => setArg(n, { default: e.target.value })} />
              <label className="flex items-center gap-1 text-[11.5px] text-zinc-400" title={t('ssh.snip.rawHelp', 'Sem aspas: o valor entra como está (quebras de linha continuam bloqueadas).')}><input type="checkbox" checked={argOf(n).raw} onChange={(e) => setArg(n, { raw: e.target.checked })} />{t('ssh.snip.raw', 'sem aspas')}</label>
            </div>
          ))}
        </div>
      ) : null}
      <label className="flex items-center gap-2 text-[13px] text-zinc-300"><input type="checkbox" checked={Boolean(f.runOnConnect)} onChange={(e) => setF({ ...f, runOnConnect: e.target.checked })} />{t('ssh.snip.onConnect', 'Executar ao conectar em qualquer host')}</label>
      {err ? <p className="text-[12.5px] text-red-300">{err}</p> : null}
    </Drawer>
  );
}

/** Asks for snippet variables, then sends the snippet to the chosen sessions. */
export function RunSnippetModal({ snippet, sessionIds, onClose }: { snippet: SshSnippet; sessionIds: string[]; onClose: (sent?: number) => void }) {
  const { t } = useI18n();
  const [args, setArgs] = useState<Record<string, string>>(() => Object.fromEntries(snippet.argsSchema.map((a) => [a.name, a.default])));
  const [err, setErr] = useState('');
  const run = async () => {
    const r = await window.darkhub.ssh.runSnippet({ snippetId: snippet.id, sessionIds, args });
    if (!r.ok) { setErr(errText(r)); return; }
    onClose(r.sentTo.length);
  };
  return (
    <Modal title={t('ssh.snip.runTitle', 'Executar "{n}"').replace('{n}', snippet.name)} onClose={() => onClose()}
      footer={<><button type="button" className="dh-btn" onClick={() => onClose()}>{t('ssh.cancel', 'Cancelar')}</button><button type="button" className="dh-btn dh-btn-primary" onClick={run}><Play size={14} />{t('ssh.snip.run', 'Executar')}</button></>}>
      <pre className="rounded-lg bg-zinc-900 p-2 text-[11.5px] font-mono text-zinc-300 whitespace-pre-wrap max-h-32 overflow-auto">{snippet.body}</pre>
      {snippet.argsSchema.map((a) => (
        <Field key={a.name} label={a.label || a.name}><input className="dh-input w-full font-mono" value={args[a.name] ?? ''} onChange={(e) => setArgs({ ...args, [a.name]: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') void run(); }} /></Field>
      ))}
      <p className="dh-help">{t('ssh.snip.targets', 'Será enviado para {n} sessão(ões).').replace('{n}', String(sessionIds.length))}</p>
      {err ? <p className="text-[12.5px] text-red-300">{err}</p> : null}
    </Modal>
  );
}

/** Snippets drawer inside a terminal tab: one click sends to the focused pane (or every pane when broadcast is on). */
export function SnippetRunnerPanel({ vault, sessionIds, onClose }: { vault: VaultProps['vault']; sessionIds: string[]; onClose: () => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [running, setRunning] = useState<SshSnippet | null>(null);
  const [note, setNote] = useState('');
  const list = vault.snippets.filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()) || s.body.toLowerCase().includes(q.toLowerCase()));
  const fire = async (s: SshSnippet) => {
    if (s.argsSchema.length) { setRunning(s); return; }
    const r = await window.darkhub.ssh.runSnippet({ snippetId: s.id, sessionIds });
    setNote(r.ok ? t('ssh.snip.sent', 'Enviado para {n} sessão(ões).').replace('{n}', String(r.sentTo.length)) : errText(r));
  };
  return (
    <aside className="w-64 shrink-0 flex flex-col border-l border-zinc-800 bg-zinc-950">
      <div className="flex items-center gap-2 h-9 px-2 border-b border-zinc-800">
        <Code size={14} className="text-zinc-400" />
        <span className="text-[12.5px] text-zinc-200 flex-1">{t('ssh.nav.snippets', 'Snippets')}</span>
        <button type="button" className="text-zinc-500 hover:text-zinc-200" onClick={onClose}><X size={14} /></button>
      </div>
      <div className="p-2"><input className="dh-input w-full h-8 text-[12px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ssh.snip.filter', 'Filtrar')} /></div>
      <div className="flex-1 overflow-y-auto divide-y divide-zinc-900">
        {!list.length ? <p className="p-3 text-[12px] text-zinc-500">{t('ssh.snip.none', 'Nenhum snippet. Crie em Snippets na barra lateral.')}</p> : list.map((s) => (
          <button type="button" key={s.id} className="w-full text-left px-3 py-2 hover:bg-zinc-900" onClick={() => fire(s)} disabled={!sessionIds.length}>
            <div className="text-[12.5px] text-zinc-100 flex items-center gap-1.5"><Play size={11} className="text-blue-300" />{s.name}</div>
            <div className="text-[11px] text-zinc-500 font-mono truncate">{s.body}</div>
          </button>
        ))}
      </div>
      {note ? <p className="px-3 py-2 text-[11.5px] text-zinc-400 border-t border-zinc-800">{note}</p> : null}
      {running ? <RunSnippetModal snippet={running} sessionIds={sessionIds} onClose={(n) => { setRunning(null); if (n != null) setNote(t('ssh.snip.sent', 'Enviado para {n} sessão(ões).').replace('{n}', String(n))); }} /> : null}
    </aside>
  );
}

export default function SnippetsView({ vault, reload }: VaultProps) {
  const { t } = useI18n();
  const store = useSshStore();
  const [editing, setEditing] = useState<Partial<SshSnippet> | null>(null);
  const [pkgName, setPkgName] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [running, setRunning] = useState<{ s: SshSnippet; ids: string[] } | null>(null);
  const [pickFor, setPickFor] = useState<SshSnippet | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const live = useMemo(() => store.tabs.flatMap((tb) => (tb.kind === 'terminal' ? tb.panes.filter((p) => p.status === 'connected') : [])), [store.tabs]);

  const groups = useMemo(() => {
    const list = vault.snippets.filter((s) => !q || `${s.name} ${s.body} ${s.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase()));
    return [...vault.packages.map((p) => ({ id: p.id, name: p.name, items: list.filter((s) => s.packageId === p.id) })), { id: '', name: t('ssh.snip.noPackage', 'Sem pacote'), items: list.filter((s) => !s.packageId) }].filter((g) => g.items.length || g.id);
  }, [vault, q, t]);

  const savePkg = async () => {
    if (!pkgName?.trim()) return;
    await window.darkhub.ssh.saveSnippet({ kind: 'package', name: pkgName.trim() });
    setPkgName(null);
    await reload();
  };
  const del = async (id: string, kind: 'snippet' | 'package', name: string) => {
    if (!window.confirm(t('ssh.snip.confirmDelete', 'Apagar "{n}"?').replace('{n}', name))) return;
    await window.darkhub.ssh.deleteSnippet(id, kind);
    await reload();
  };
  const startRun = () => {
    if (!pickFor) return;
    setRunning({ s: pickFor, ids: picked });
    setPickFor(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input className="dh-input w-full pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ssh.snip.search', 'Buscar snippets')} />
        </div>
        <button type="button" className="dh-btn dh-btn-primary" onClick={() => setEditing({})}><Plus size={14} />{t('ssh.snip.new', 'Novo snippet')}</button>
        <button type="button" className="dh-btn" onClick={() => setPkgName('')}><Package size={14} />{t('ssh.snip.newPackage', 'Novo pacote')}</button>
      </div>
      {note ? <p className="text-[12.5px] text-zinc-300">{note}</p> : null}
      {!vault.snippets.length && !vault.packages.length ? (
        <EmptyState text={t('ssh.snip.empty', 'Guarde comandos que você repete (deploy, logs, reinício de serviço) e rode em um ou vários servidores com um clique.')} />
      ) : groups.map((g) => (
        <section key={g.id || 'none'} className="space-y-2">
          <h2 className="dh-section-title flex items-center gap-2"><Package size={15} className="text-zinc-400" />{g.name}
            {g.id ? <button type="button" className="text-zinc-500 hover:text-red-300" onClick={() => del(g.id, 'package', g.name)}><Trash2 size={13} /></button> : null}
          </h2>
          {!g.items.length ? <p className="text-[12.5px] text-zinc-500">{t('ssh.snip.emptyPackage', 'Pacote vazio.')}</p> : (
            <div className="rounded-xl border border-zinc-800/80 divide-y divide-zinc-900">
              {g.items.map((s) => (
                <div key={s.id} className="flex items-center gap-3 px-3 py-2">
                  <Code size={15} className="text-zinc-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-zinc-100">{s.name}{s.runOnConnect ? <span className="dh-tag ml-2">{t('ssh.snip.onConnectTag', 'ao conectar')}</span> : null}{s.argsSchema.length ? <span className="dh-tag ml-2">{s.argsSchema.map((a) => a.name).join(', ')}</span> : null}</div>
                    <div className="text-[11.5px] text-zinc-500 font-mono truncate">{s.body}</div>
                  </div>
                  <button type="button" className="dh-btn dh-btn-sm dh-btn-accent" disabled={!live.length} title={live.length ? '' : t('ssh.snip.noLive', 'Abra uma sessão para executar')} onClick={() => { setPickFor(s); setPicked(live.map((p) => p.sessionId)); }}><Play size={13} />{t('ssh.snip.run', 'Executar')}</button>
                  <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" onClick={() => setEditing(s)}><Edit3 size={13} /></button>
                  <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" onClick={() => del(s.id, 'snippet', s.name)}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
      {editing ? <SnippetDrawer vault={vault} reload={reload} snippet={editing} onClose={() => setEditing(null)} /> : null}
      {pkgName !== null ? (
        <Modal title={t('ssh.snip.newPackage', 'Novo pacote')} onClose={() => setPkgName(null)}
          footer={<><button type="button" className="dh-btn" onClick={() => setPkgName(null)}>{t('ssh.cancel', 'Cancelar')}</button><button type="button" className="dh-btn dh-btn-primary" onClick={savePkg}>{t('ssh.save', 'Salvar')}</button></>}>
          <input className="dh-input w-full" autoFocus value={pkgName} onChange={(e) => setPkgName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void savePkg(); }} />
        </Modal>
      ) : null}
      {pickFor ? (
        <Modal title={t('ssh.snip.pickTargets', 'Onde executar "{n}"?').replace('{n}', pickFor.name)} onClose={() => setPickFor(null)}
          footer={<><button type="button" className="dh-btn" onClick={() => setPickFor(null)}>{t('ssh.cancel', 'Cancelar')}</button><button type="button" className="dh-btn dh-btn-primary" disabled={!picked.length} onClick={startRun}>{t('ssh.next', 'Continuar')}</button></>}>
          {live.map((p) => (
            <label key={p.sessionId} className="flex items-center gap-2"><input type="checkbox" checked={picked.includes(p.sessionId)} onChange={(e) => setPicked((x) => (e.target.checked ? [...x, p.sessionId] : x.filter((i) => i !== p.sessionId)))} /><span className="font-mono text-[12.5px]">{p.title}</span></label>
          ))}
        </Modal>
      ) : null}
      {running ? <RunSnippetModal snippet={running.s} sessionIds={running.ids} onClose={(n) => { setRunning(null); if (n != null) setNote(t('ssh.snip.sent', 'Enviado para {n} sessão(ões).').replace('{n}', String(n))); }} /> : null}
    </div>
  );
}
