import React, { useEffect, useState } from 'react';
import { Archive, RefreshCw, Loader2, FolderOpen, Plus, Trash2, RotateCcw, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from '../components/icons';
import PageHeader from '../components/ui/PageHeader';
import { useI18n } from '../i18n/I18nProvider';
import type { SaveScan, SaveVersion } from '../global';

const size = (b: number) => (b >= 1073741824 ? `${(b / 1073741824).toFixed(1)} GB` : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default function SaveBackup() {
  const { t } = useI18n();
  const [scan, setScan] = useState<SaveScan | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [versions, setVersions] = useState<SaveVersion[]>([]);
  const api = () => window.darkhub?.saves;

  const load = async (refreshManifest = false) => {
    if (!api()) return;
    setLoading(true);
    const r = await api()!.scan({ refreshManifest }).catch((e) => ({ ok: false, error: String(e?.message ?? e) } as SaveScan));
    setLoading(false);
    setStage(null);
    if (r.ok) setScan(r); else setMsg({ ok: false, text: r.error ?? 'error' });
  };
  useEffect(() => {
    void load();
    return api()?.onEvent((e) => { if (e.type === 'manifest') setStage(e.stage ?? null); });
  }, []);

  const loadVersions = async (name: string) => { const r = await api()?.versions({ name }); setVersions(r?.versions ?? []); };
  const toggle = async (name: string) => {
    if (open === name) { setOpen(null); return; }
    setOpen(name);
    await loadVersions(name);
  };

  const backup = async (name: string) => {
    setBusy(name); setMsg(null);
    const r = await api()!.backup({ name });
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: r.skipped ? t('saves.unchanged', '{g}: nada mudou desde o último backup.').replace('{g}', name) : t('saves.done', '{g}: backup feito ({n} arquivos, {s}).').replace('{g}', name).replace('{n}', String(r.files)).replace('{s}', size(r.bytes ?? 0)) } : { ok: false, text: r.error ?? 'error' });
    await load();
    if (open === name) await loadVersions(name);
  };

  const backupAll = async () => {
    setBusy('*'); setMsg(null);
    const r = await api()!.backupAll();
    setBusy(null);
    const res = r.results ?? [];
    setMsg({ ok: res.every((x) => x.ok), text: t('saves.allDone', '{n} jogos: {b} com backup novo, {u} sem mudanças, {f} com erro.').replace('{n}', String(res.length)).replace('{b}', String(res.filter((x) => x.ok && !x.skipped).length)).replace('{u}', String(res.filter((x) => x.skipped).length)).replace('{f}', String(res.filter((x) => !x.ok).length)) });
    await load();
  };

  const restore = async (name: string, v: SaveVersion) => {
    const p = await api()!.previewRestore({ name, id: v.id });
    if (!p.ok) { setMsg({ ok: false, text: p.error ?? 'error' }); return; }
    const where = [...new Set((p.targets ?? []).map((x) => x.dest?.split(/[\\/]/).slice(0, -1).join('\\')).filter(Boolean))].slice(0, 4).join('\n');
    if (!window.confirm(t('saves.confirmRestore', 'Restaurar {n} arquivos do backup de {d}?\n\nDestino:\n{w}\n\nO estado atual é guardado antes, então dá para voltar.').replace('{n}', String(p.targets?.length ?? 0)).replace('{d}', new Date(v.at).toLocaleString()).replace('{w}', where))) return;
    setBusy(`r-${v.id}`); setMsg(null);
    const r = await api()!.restore({ name, id: v.id });
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: t('saves.restored', '{n} arquivos restaurados.').replace('{n}', String(r.restored)) + ((r.skipped?.length ?? 0) ? ` ${t('saves.skippedN', '{n} ignorados (fora da pasta de saves).').replace('{n}', String(r.skipped!.length))}` : '') } : { ok: false, text: r.error ?? 'error' });
    await loadVersions(name);
  };

  const removeVersion = async (name: string, v: SaveVersion) => {
    if (!window.confirm(t('saves.confirmDelete', 'Apagar o backup de {d}?').replace('{d}', new Date(v.at).toLocaleString()))) return;
    await api()!.removeVersion({ name, id: v.id });
    await loadVersions(name);
    await load();
  };

  const settings = scan?.settings;
  const setSetting = async (patch: Parameters<NonNullable<typeof window.darkhub>['saves']['setSettings']>[0]) => {
    const r = await api()!.setSettings(patch);
    if (r.ok) await load(); else setMsg({ ok: false, text: r.error ?? 'error' });
  };
  const pickRoot = async () => { const r = await api()!.pickFolder(); if (r.path) await setSetting({ backupRoot: r.path }); };
  const addCustom = async () => {
    const name = window.prompt(t('saves.customName', 'Nome do jogo:'));
    if (!name) return;
    const r = await api()!.addCustom({ name });
    if (r.ok && !r.canceled) setScan(r);
  };

  const games = scan?.games ?? [];
  const versionLabel = (v: SaveVersion) => v.label === 'before-restore' ? t('saves.beforeRestore', 'antes de restaurar') : v.label === 'auto' ? t('saves.auto', 'automático') : v.label;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      <PageHeader
        title={t('nav.savebackup', 'Backup de saves')}
        subtitle={t('saves.subtitle', 'Guarda versões dos saves e configurações dos seus jogos e restaura quando precisar. Os locais vêm do manifesto do Ludusavi, com dados do PCGamingWiki.')}
        actions={<>
          <button type="button" onClick={() => void load(true)} disabled={loading} className="dh-btn dh-btn-ghost">{loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}{t('saves.refresh', 'Procurar de novo')}</button>
          <button type="button" onClick={() => void backupAll()} disabled={!!busy || !games.length} className="dh-btn dh-btn-primary">{busy === '*' ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}{t('saves.backupAll', 'Backup de todos')}</button>
        </>}
      />

      {settings && (
        <section className="rounded-xl border border-zinc-800/80 p-4 flex flex-wrap items-center gap-x-5 gap-y-3 text-[12.5px] text-zinc-300">
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-zinc-500 shrink-0">{t('saves.folder', 'Pasta dos backups')}</span>
            <code className="font-mono text-zinc-200 truncate max-w-[340px]" title={settings.backupRoot}>{settings.backupRoot}</code>
            <button type="button" onClick={() => void pickRoot()} className="dh-btn dh-btn-ghost dh-btn-sm">{t('saves.change', 'Trocar')}</button>
            <button type="button" onClick={() => void api()?.openFolder({})} className="dh-btn dh-btn-ghost dh-btn-sm" aria-label={t('saves.open', 'Abrir pasta')}><FolderOpen size={13} /></button>
          </span>
          <label className="flex items-center gap-2">{t('saves.keep', 'Manter')}
            <input type="number" min={1} max={100} value={settings.keep} onChange={(e) => void setSetting({ keep: Number(e.target.value) })} className="dh-input w-16" />
            {t('saves.versions', 'versões')}
          </label>
          <label className="flex items-center gap-2 select-none">
            <input type="checkbox" checked={settings.autoOnExit} onChange={(e) => void setSetting({ autoOnExit: e.target.checked })} />
            {t('saves.autoOnExit', 'Backup automático ao fechar um jogo aberto pela Biblioteca')}
          </label>
        </section>
      )}

      {msg && <p role="status" className={`flex items-center gap-2 text-[12.5px] ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}{msg.text}</p>}
      {loading && stage && <p className="flex items-center gap-2 text-[12.5px] text-zinc-400"><Loader2 size={14} className="animate-spin" />{stage === 'download' ? t('saves.downloading', 'Baixando a lista de locais de save (uns 18 MB, só na primeira vez e uma vez por semana)...') : t('saves.indexing', 'Preparando a lista...')}</p>}

      <div className="rounded-xl border border-zinc-800/80 divide-y divide-zinc-900">
        {!scan && <div className="p-4 space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-8 rounded bg-zinc-900 animate-pulse" />)}</div>}
        {scan && !games.length && <p className="p-4 dh-help">{t('saves.none', 'Nenhum jogo com local de save conhecido foi encontrado. Adicione um jogo na Biblioteca ou uma pasta manualmente.')}</p>}
        {games.map((g) => (
          <div key={g.name}>
            <div className="flex items-center gap-3 px-3 py-2.5 min-w-0">
              <button type="button" onClick={() => void toggle(g.name)} className="text-zinc-500 hover:text-zinc-200" aria-label={t('saves.versionsOf', 'Versões')}>{open === g.name ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-zinc-100 truncate">{g.name}{g.custom && <span className="ml-2 text-[11px] text-zinc-500">{t('saves.custom', 'manual')}</span>}</p>
                <p className="text-[11.5px] text-zinc-500">
                  {g.files ? t('saves.filesSize', '{n} arquivos · {s}').replace('{n}', String(g.files)).replace('{s}', size(g.bytes)) : t('saves.noFiles', 'nenhum save no PC ainda')}
                  {g.registry ? ` · ${t('saves.registry', 'registro')}` : ''}
                  {' · '}{g.lastBackupAt ? t('saves.last', 'último backup {d}').replace('{d}', new Date(g.lastBackupAt).toLocaleString()) : t('saves.never', 'sem backup')}
                </p>
              </div>
              {g.custom && <button type="button" onClick={() => void api()!.removeCustom({ name: g.name }).then(setScan)} className="dh-btn dh-btn-ghost dh-btn-sm" aria-label={t('saves.removeCustom', 'Remover')}><Trash2 size={13} /></button>}
              <button type="button" onClick={() => void backup(g.name)} disabled={!!busy || (!g.files && !g.registry)} className="dh-btn dh-btn-sm shrink-0">
                {busy === g.name ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}{t('saves.backup', 'Fazer backup')}
              </button>
            </div>
            {open === g.name && (
              <div className="pl-10 pr-3 pb-3 space-y-1">
                {!versions.length && <p className="dh-help">{t('saves.noVersions', 'Nenhuma versão guardada ainda.')}</p>}
                {versions.map((v) => (
                  <div key={v.id} className="flex items-center gap-3 text-[12.5px] min-w-0">
                    <span className="text-zinc-300 tabular-nums">{new Date(v.at).toLocaleString()}</span>
                    {v.label && <span className="text-[11px] text-zinc-500">{versionLabel(v)}</span>}
                    <span className="text-zinc-500">{size(v.bytes)}</span>
                    <span className="ml-auto flex gap-1">
                      <button type="button" onClick={() => void restore(g.name, v)} disabled={!!busy} className="dh-btn dh-btn-ghost dh-btn-sm">{busy === `r-${v.id}` ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}{t('saves.restore', 'Restaurar')}</button>
                      <button type="button" onClick={() => void removeVersion(g.name, v)} disabled={!!busy} className="dh-btn dh-btn-ghost dh-btn-sm" aria-label={t('saves.delete', 'Apagar')}><Trash2 size={13} /></button>
                    </span>
                  </div>
                ))}
                <button type="button" onClick={() => void api()?.openFolder({ name: g.name })} className="dh-btn dh-btn-ghost dh-btn-sm mt-1"><FolderOpen size={13} />{t('saves.openGame', 'Abrir pasta deste jogo')}</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => void addCustom()} className="dh-btn dh-btn-ghost"><Plus size={14} />{t('saves.addCustom', 'Adicionar pasta de save manualmente')}</button>
        <p className="dh-help">{t('saves.attribution', 'Locais de save: manifesto do Ludusavi (mtkennerly/ludusavi-manifest), dados do PCGamingWiki. {n} jogos conhecidos.').replace('{n}', String(scan?.manifestGames ?? '…'))}</p>
      </div>
    </div>
  );
}
