import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle, Edit3, History, Loader2, RefreshCw, Save, XCircle } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';
import { DarkOSConfirmDialog } from '../darkos/DarkOSConfirmDialog';
import type { PsToolResult } from '../../global';

const api = () => window.darkhub?.powershell;

/** hosts viewer + editor. Saving backs the file up next to itself and needs admin + confirmation. */
export default function HostsEditor() {
  const { t } = useI18n();
  const [data, setData] = useState<PsToolResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [diff, setDiff] = useState<{ added: string[]; removed: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api()?.hostsRead();
      if (!mounted.current) return;
      setData(r ?? { ok: false, error: t('psx.noBackend', 'Backend indisponível (abra pelo app).') });
      if (r?.ok) setDraft(r.content || '');
    } finally { if (mounted.current) setLoading(false); }
  }, [t]);
  useEffect(() => { load(); }, [load]);

  const askSave = async () => {
    setMsg(null);
    const r = await api()?.hostsPreview({ content: draft });
    if (!r?.ok) { setMsg({ ok: false, text: r?.error || t('psx.hosts.saveFail', 'Não foi possível salvar.') }); return; }
    if (!r.added?.length && !r.removed?.length) { setMsg({ ok: true, text: t('psx.hosts.noChanges', 'Nenhuma alteração para salvar.') }); return; }
    setDiff({ added: r.added || [], removed: r.removed || [] });
  };
  const save = async () => {
    setDiff(null);
    setSaving(true);
    try {
      const r = await api()?.hostsWrite({ content: draft, confirm: true });
      if (!mounted.current) return;
      if (r?.ok) { setMsg({ ok: true, text: t('psx.hosts.saved', 'Arquivo hosts salvo (backup criado e cache DNS limpo).') }); setEditing(false); load(); }
      else setMsg({ ok: false, text: r?.error || t('psx.hosts.saveFail', 'Não foi possível salvar.') });
    } finally { if (mounted.current) setSaving(false); }
  };
  const loadBackup = async (name: string) => {
    if (!name) return;
    const r = await api()?.hostsBackup({ name });
    if (r?.ok && typeof r.content === 'string') { setDraft(r.content); setEditing(true); setMsg({ ok: true, text: t('psx.hosts.backupLoaded', 'Backup carregado no editor. Revise e salve para restaurar.') }); }
    else setMsg({ ok: false, text: r?.error || '' });
  };

  if (loading && !data) return <div className="flex items-center gap-2 text-[12.5px] text-zinc-500"><Loader2 size={14} className="animate-spin" />{t('psx.loading', 'Carregando...')}</div>;
  if (!data?.ok) return <p className="text-[12.5px] text-red-300">{data?.error}</p>;

  const entries = data.entries || [];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-[11.5px] text-zinc-500 break-all mr-auto">{data.path}</span>
        <button className="dh-btn dh-btn-sm" onClick={load} disabled={loading || saving}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} />{t('psx.hosts.reload', 'Recarregar')}</button>
        {data.backups?.length ? (
          <label className="inline-flex items-center gap-1.5 text-[11.5px] text-zinc-400">
            <History size={13} />
            <select className="dh-input !h-7 text-[11.5px]" value="" onChange={(e) => loadBackup(e.target.value)} aria-label={t('psx.hosts.backups', 'Backups')}>
              <option value="">{t('psx.hosts.backups', 'Backups')} ({data.backups.length})</option>
              {data.backups.map((b) => <option key={b} value={b}>{b.replace(/^hosts\.darkhub-/, '').replace(/\.bak$/, '')}</option>)}
            </select>
          </label>
        ) : null}
        {!editing ? (
          <button className="dh-btn dh-btn-sm" onClick={() => { setDraft(data.content || ''); setEditing(true); }}><Edit3 size={13} />{t('psx.hosts.edit', 'Editar')}</button>
        ) : null}
      </div>

      {editing ? (
        <>
          <textarea
            className="w-full h-72 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-[12px] leading-[1.6] text-zinc-200 focus:outline-none focus:border-blue-400 custom-scrollbar"
            spellCheck={false} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={t('psx.hosts.editor', 'Conteúdo do arquivo hosts')}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <button className="dh-btn dh-btn-danger" disabled={saving} onClick={askSave}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{t('psx.hosts.save', 'Revisar e salvar')}
            </button>
            <button className="dh-btn dh-btn-ghost" disabled={saving} onClick={() => { setEditing(false); setDraft(data.content || ''); }}>{t('psx.cancel', 'Cancelar')}</button>
            <span className="text-[11.5px] text-zinc-500">{t('psx.hosts.saveNote', 'Salvar pede administrador e cria um backup hosts.darkhub-<data>.bak na mesma pasta.')}</span>
          </div>
        </>
      ) : entries.length ? (
        <div className="max-h-72 overflow-auto custom-scrollbar rounded-md border border-zinc-800/80">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-zinc-950/95">
              <tr className="border-b border-zinc-800/80 text-[11px] text-zinc-500">
                <th className="text-left px-3 py-1.5 font-medium">{t('psx.hosts.line', 'Linha')}</th>
                <th className="text-left px-3 py-1.5 font-medium">IP</th>
                <th className="text-left px-3 py-1.5 font-medium">{t('psx.hosts.names', 'Nomes')}</th>
                <th className="text-left px-3 py-1.5 font-medium">{t('psx.hosts.comment', 'Comentário')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono text-[11.5px]">
              {entries.map((e) => (
                <tr key={e.line} className={e.enabled ? 'text-zinc-300' : 'text-zinc-600 line-through'}>
                  <td className="px-3 py-1">{e.line}</td><td className="px-3 py-1">{e.ip}</td><td className="px-3 py-1 break-all">{e.hosts}</td><td className="px-3 py-1 break-words">{e.comment}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-[12.5px] text-zinc-500">{t('psx.hosts.empty', 'Nenhuma entrada ativa: o arquivo só tem comentários.')}</p>}

      {msg ? <p role="status" className={`text-[12.5px] flex items-center gap-1.5 ${msg.ok ? 'text-emerald-400' : 'text-red-300'}`}>{msg.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}{msg.text}</p> : null}

      <DarkOSConfirmDialog
        open={diff !== null}
        danger
        title={t('psx.hosts.confirmTitle', 'Salvar o arquivo hosts?')}
        body={diff ? (
          <>
            <span className="block">{t('psx.hosts.confirmBody', 'Um backup é criado antes. Alterações:')}</span>
            <span className="block mt-2 max-h-48 overflow-auto rounded bg-zinc-950 border border-zinc-800 px-2 py-1.5 font-mono text-[11px] whitespace-pre-wrap break-all">
              {diff.removed.map((l, i) => <span key={`r${i}`} className="block text-red-300">- {l}</span>)}
              {diff.added.map((l, i) => <span key={`a${i}`} className="block text-emerald-300">+ {l}</span>)}
            </span>
          </>
        ) : null}
        confirmLabel={t('psx.hosts.confirmSave', 'Salvar')}
        onCancel={() => setDiff(null)}
        onConfirm={save}
      />
    </div>
  );
}
