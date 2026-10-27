import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Code, FolderOpen, Clipboard, Download, Loader2, Trash2, X, Save, Copy, Package, Cpu, Search, RefreshCw, Sparkles, Globe, Key, ExternalLink } from '../components/icons';
import PageHeader from '../components/ui/PageHeader';
import { useI18n } from '../i18n/I18nProvider';
import HubPreview, { RiskBadge, TierBadge, hubText } from '../components/hub/HubPreview';
import { extensionsChanged } from '../lib/extensions';
import type { HubInspect, HubInstalled, HubHardware, HubCatalogItem, HubServer, HubMcpStatus } from '../global';

const api = () => window.darkhub?.hub;
type Tab = 'catalog' | 'installed' | 'file' | 'ai';
type Remote = { hub: string; tier: string; version: string; sha256: string };

export default function Presets() {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<Tab>('catalog');
  const [installed, setInstalled] = useState<HubInstalled[]>([]);
  const [updates, setUpdates] = useState<Record<string, string>>({});
  const [hw, setHw] = useState<HubHardware | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [view, setView] = useState<(HubInspect & { remote?: Remote }) | null>(null);
  const [remoteId, setRemoteId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [paste, setPaste] = useState<string | null>(null);
  const [exp, setExp] = useState<{ name: string; github: string; text?: string } | null>(null);
  // catalog
  const [server, setServer] = useState<HubServer | null>(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [sort, setSort] = useState('');
  const [onlyFits, setOnlyFits] = useState(true);
  const [items, setItems] = useState<HubCatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [catErr, setCatErr] = useState('');
  const [devUrl, setDevUrl] = useState<string | null>(null);
  // mcp
  const [mcp, setMcp] = useState<HubMcpStatus | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [devFolders, setDevFolders] = useState<string[]>([]);
  const loadDev = useCallback(async () => { const r = await window.darkhub?.ext?.devList(); if (r?.ok) setDevFolders(r.folders); }, []);
  useEffect(() => { void loadDev(); }, [loadDev]);

  const refresh = useCallback(async () => {
    const r = await api()?.list();
    if (r?.ok) setInstalled(r.packages || []);
    const u = await api()?.catalog.updates();
    if (u?.ok) setUpdates(Object.fromEntries((u.items || []).map((x) => [x.id, x.latest])));
  }, []);

  const searchSeq = useRef(0);
  const search = useCallback(async (offset = 0) => {
    const seq = ++searchSeq.current;
    setBusy('search'); setCatErr('');
    const r = await api()?.catalog.search({ q, type, sort, offset, limit: 30 });
    if (seq !== searchSeq.current) return; // a newer search (or server change) already answered
    setBusy(null);
    if (r?.server) setServer(r.server);
    if (!r?.ok) { setCatErr(r?.error || ''); if (!offset) setItems([]); return; }
    setTotal(r.total || 0);
    setItems((cur) => (offset ? [...cur, ...(r.items || [])] : r.items || []));
  }, [q, type, sort]);

  const openRemote = useCallback(async (id: string) => {
    setTab('catalog'); setBusy('inspect'); setMsg(null); setText(null); setRemoteId(id);
    const r = await api()?.catalog.inspect({ id, lang });
    setBusy(null);
    setView(r || { ok: false, error: 'IPC' });
  }, [lang]);

  useEffect(() => {
    void refresh();
    void search();
    api()?.hardware().then((r) => r?.ok && setHw(r.hardware || null));
    api()?.mcp.status().then((s) => s && setMcp(s));
    // darkhub://hub/install?id=... opened DarkHub (or arrived while it was open)
    const take = () => api()?.pendingLink().then((r) => { if (r?.link?.id) void openRemote(r.link.id); });
    take();
    return api()?.onEvent((m) => { if (m.type === 'open') take(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inspect = async (content: string) => {
    setBusy('inspect'); setMsg(null); setText(content); setRemoteId(null);
    const r = await api()?.inspect({ text: content, lang });
    setBusy(null);
    setView(r || { ok: false, error: 'IPC' });
  };

  const openFile = async () => {
    const r = await api()?.openFile();
    if (r?.ok && r.text) await inspect(r.text);
    else if (r && !r.ok) setMsg({ ok: false, text: r.error || '' });
  };

  const done = (r: { ok: boolean; error?: string; applied?: number; skipped?: number; missingTasks?: string[]; notes?: string[]; requiresReboot?: boolean } | undefined) => {
    if (!r?.ok) { setMsg({ ok: false, text: r?.error || '' }); return false; }
    setMsg({ ok: true, text: [
      `${t('hub.installed', 'Instalado')}: ${r.applied} ${t('hub.changes', 'mudanças')}`,
      r.skipped ? `${r.skipped} ${t('hub.skippedN', 'puladas pelas condições')}` : '',
      r.missingTasks?.length ? `${t('hub.missingTasks', 'tarefas que não existem neste Windows')}: ${r.missingTasks.length}` : '',
      r.requiresReboot ? t('hub.reboot', 'reinicie o Windows para concluir') : ''
    ].filter(Boolean).join(' · ') });
    return true;
  };

  const install = async () => {
    setBusy('install'); setMsg(null);
    const r = remoteId ? await api()?.catalog.install({ id: remoteId, version: view?.remote?.version }) : text ? await api()?.install({ text }) : undefined;
    setBusy(null);
    if (done(r)) { extensionsChanged(); await refresh(); if (remoteId) await openRemote(remoteId); else if (text) await inspect(text); }
  };

  const uninstall = async (id: string) => {
    setBusy(`rm:${id}`); setMsg(null);
    const r = await api()?.uninstall({ id });
    setBusy(null);
    setMsg(r?.ok ? { ok: true, text: t('hub.removed', 'Pacote removido: tudo voltou como estava antes dele.') } : { ok: false, text: r?.error || '' });
    extensionsChanged();
    await refresh();
    if (view?.pkg?.id === id) { if (remoteId) await openRemote(remoteId); else if (text) await inspect(text); }
  };

  const update = async (id: string) => {
    setBusy(`up:${id}`); setMsg(null);
    const r = await api()?.catalog.update({ id });
    setBusy(null);
    if (r?.ok) setMsg({ ok: true, text: `${t('hub.updated', 'Atualizado')}: ${id} v${r.updatedFrom} → v${updates[id]}` });
    else setMsg({ ok: false, text: r?.error || '' });
    await refresh();
  };

  const doExport = async () => {
    if (!exp) return;
    setBusy('export');
    const r = await api()?.exportMine({ name: exp.name, github: exp.github });
    setBusy(null);
    if (r?.ok && r.text) setExp({ ...exp, text: r.text });
    else setMsg({ ok: false, text: r?.error || '' });
  };

  const copy = async (s: string) => { try { await navigator.clipboard.writeText(s); setMsg({ ok: true, text: t('hub.copied', 'Copiado.') }); } catch { /* clipboard busy */ } };

  const saveServer = async () => {
    const r = await api()?.catalog.setServer({ url: devUrl || '' });
    if (!r?.ok) { setMsg({ ok: false, text: r?.error || '' }); return; }
    setDevUrl(null); setServer(r.server || null); void search(); void refresh();
  };

  const setMcpOn = async (on: boolean) => { const s = await api()?.mcp.setEnabled({ on }); if (s) setMcp(s); };

  const hwLine = hw ? [
    hw.chassis === 'laptop' ? t('hub.hw.laptop', 'Notebook') : t('hub.hw.desktop', 'Desktop'),
    hw.cpuVendor ? `CPU ${hw.cpuVendor.toUpperCase()}` : null,
    hw.gpuVendors.length ? `GPU ${hw.gpuVendors.map((v) => v.toUpperCase()).join(' + ')}${hw.gpuDedicated ? ` (${t('hub.hw.dedicated', 'dedicada')})` : ''}` : null,
    hw.ramGb ? `${hw.ramGb} GB RAM` : null,
    hw.netWired ? 'Ethernet' : 'Wi-Fi',
    hw.osBuild ? `build ${hw.osBuild}` : null,
    hw.darkos ? 'DarkOS' : null
  ].filter(Boolean).join(' · ') : '';

  const shown = onlyFits ? items.filter((i) => i.fits !== false) : items;
  const updCount = Object.keys(updates).length;
  const TABS: [Tab, string][] = [
    ['catalog', t('hub.tab.catalog', 'Catálogo')],
    ['installed', `${t('hub.tab.installed', 'Instalados')}${installed.length ? ` (${installed.length})` : ''}${updCount ? ` · ${updCount} ↑` : ''}`],
    ['file', t('hub.tab.file', 'Arquivo e meu PC')],
    ['ai', t('hub.tab.ai', 'IA (MCP)')]
  ];

  const preview = view && busy !== 'inspect' ? (
    <section className="dh-card p-0 overflow-hidden">
      <HubPreview view={view} tier={remoteId ? view.remote?.tier : undefined} footer={(
        <footer className="px-4 py-3 border-t border-zinc-800 flex flex-wrap items-center gap-2">
          {view.ok && view.installed ? (
            <button type="button" className="dh-btn dh-btn-sm" disabled={Boolean(busy)} onClick={() => void uninstall(view.pkg!.id)}>{busy === `rm:${view.pkg!.id}` ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}{t('hub.uninstall', 'Remover e restaurar')}</button>
          ) : view.ok ? (
            <button type="button" className="dh-btn dh-btn-sm dh-btn-primary" disabled={Boolean(busy) || !view.applicable} onClick={() => void install()}>{busy === 'install' ? <Loader2 size={13} className="animate-spin" /> : <Package size={13} />}{t('hub.install', 'Instalar')} ({view.rows!.filter((r) => !r.done && !r.missing).length} {t('hub.changes', 'mudanças')})</button>
          ) : null}
          {text && view.ok ? <button type="button" className="dh-btn dh-btn-sm" onClick={() => void api()?.saveFile({ text, name: view.pkg!.id })}><Save size={13} />{t('hub.saveFile', 'Salvar arquivo')}</button> : null}
          {remoteId && server ? <button type="button" className="dh-btn dh-btn-sm" onClick={() => void window.darkhub?.shell?.openExternal(`${server.url}/p/${remoteId}`)}><ExternalLink size={13} />{t('hub.onSite', 'Ver no site')}</button> : null}
          <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" onClick={() => { setView(null); setText(null); setRemoteId(null); }}>{t('hub.close', 'Fechar')}</button>
          {view.ok ? <span className="dh-help ml-auto">{remoteId ? t('hub.signed', 'Baixado do Hub com hash e assinatura conferidos.') + ' ' : ''}{t('hub.safety', 'Antes de mudar, o DarkHub guarda o valor atual de cada item. Remover o pacote devolve exatamente esses valores.')}</span> : null}
        </footer>
      )} />
    </section>
  ) : null;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-5">
      <PageHeader
        title={t('hub.title', 'Presets e módulos')}
        subtitle={t('hub.subtitle', 'Pacotes que descrevem mudanças no Windows como dados: você vê cada uma antes, o DarkHub guarda o valor original e remove tudo de volta com um clique.')}
      />

      <div role="tablist" className="flex flex-wrap gap-1 border-b border-zinc-800">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`px-3 h-9 text-[13px] border-b-2 -mb-px ${tab === id ? 'border-blue-400 text-zinc-50' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {hwLine ? <p className="dh-help flex items-center gap-2"><Cpu size={13} />{t('hub.thisPc', 'Este PC para as condições dos pacotes')}: <span className="text-zinc-300">{hwLine}</span></p> : null}
      {msg ? <p role="status" className={`text-[12.5px] ${msg.ok ? 'text-emerald-300' : 'text-amber-300'}`}>{msg.text}</p> : null}
      {busy === 'inspect' ? <p className="dh-help flex items-center gap-2"><Loader2 size={13} className="animate-spin" />{t('hub.reading', 'Lendo o pacote e o estado atual deste PC...')}</p> : null}

      {tab === 'catalog' ? (
        <div className="space-y-4">
          {preview}
          <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void search(); }}>
            <label className="relative flex-1 min-w-[220px]">
              <span className="sr-only">{t('hub.searchLabel', 'Buscar no Hub')}</span>
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input className="dh-input w-full pl-8" placeholder={t('hub.searchPh', 'Buscar presets e módulos (ex.: fps, notebook, privacidade)')} value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <select className="dh-input" aria-label={t('hub.sortLabel', 'Ordenar')} value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="">{t('hub.sort.popular', 'Populares')}</option><option value="trending">{t('hub.sort.trending', 'Em alta')}</option><option value="top">{t('hub.sort.top', 'Melhor avaliados')}</option><option value="new">{t('hub.sort.new', 'Novos')}</option>
            </select>
            <select className="dh-input" aria-label={t('hub.typeLabel', 'Tipo')} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">{t('hub.allTypes', 'Todos')}</option><option value="preset">{t('hub.type.preset', 'preset')}</option><option value="module">{t('hub.type.module', 'módulo')}</option>
            </select>
            <button type="submit" className="dh-btn dh-btn-sm dh-btn-primary">{busy === 'search' ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}{t('hub.searchBtn', 'Buscar')}</button>
            <label className="flex items-center gap-1.5 text-[12.5px] text-zinc-300"><input type="checkbox" checked={onlyFits} onChange={(e) => setOnlyFits(e.target.checked)} />{t('hub.onlyFits', 'Só os que servem neste PC')}</label>
          </form>
          {catErr ? <p className="text-[12.5px] text-amber-300">{catErr}</p> : null}
          {shown.length ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {shown.map((it) => (
                <li key={it.id}>
                  <button type="button" className="dh-card w-full text-left p-3 space-y-1.5 hover:border-zinc-600" onClick={() => void openRemote(it.id)}>
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0"><span className="block text-[13.5px] font-medium text-zinc-50 truncate">{hubText(it.name, lang)}</span><span className="block text-[11.5px] text-zinc-500 font-mono truncate">{it.id} · v{it.version} · @{it.author.github}</span></span>
                      <TierBadge tier={it.tier} />
                    </span>
                    {hubText(it.description, lang) ? <span className="block text-[12.5px] text-zinc-400 line-clamp-2">{hubText(it.description, lang)}</span> : null}
                    <span className="flex flex-wrap items-center gap-2 text-[11.5px] text-zinc-500">
                      <RiskBadge risk={it.risk} />
                      <span>{it.rating?.count ? `★ ${it.rating.avg.toFixed(1)} (${it.rating.count})` : t('hub.noRatings', 'sem avaliações')} · {it.installs} {t('hub.installs', 'instalações')} · {t(`hub.type.${it.type}`, it.type)}</span>
                      {it.hype >= 3 ? <span className="text-amber-300">{t('hub.hot', 'em alta')}</span> : null}
                      {it.installedVersion ? <span className="text-emerald-300">{t('hub.isInstalled', 'Instalado')} v{it.installedVersion}</span> : null}
                      {it.fits === false ? <span className="text-amber-300">{t('hub.notFor', 'Não é para este PC')}</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : busy !== 'search' && !catErr ? <p className="dh-help">{t('hub.empty', 'Nada encontrado.')}</p> : null}
          {items.length < total ? <button type="button" className="dh-btn dh-btn-sm" disabled={busy === 'search'} onClick={() => void search(items.length)}>{t('hub.more', 'Carregar mais')}</button> : null}
          <div className="dh-help flex flex-wrap items-center gap-2">
            <Globe size={13} />{t('hub.server', 'Hub')}: <span className="text-zinc-300 font-mono">{server?.url || '…'}</span>
            {server && !server.official ? <span className="text-amber-300">{server.trusted ? t('hub.customTrusted', 'servidor de desenvolvimento com a chave oficial') : t('hub.customServer', 'servidor personalizado: nenhum pacote conta como oficial')}</span> : null}
            {devUrl === null ? <button type="button" className="text-blue-300 hover:underline" onClick={() => setDevUrl(server && !server.official ? server.url : '')}>{t('hub.changeServer', 'trocar (desenvolvimento)')}</button> : (
              <span className="flex items-center gap-2">
                <input className="dh-input h-7 w-64" placeholder="http://127.0.0.1:4300" value={devUrl} onChange={(e) => setDevUrl(e.target.value)} aria-label={t('hub.serverUrl', 'Endereço do Hub')} />
                <button type="button" className="dh-btn dh-btn-sm" onClick={() => void saveServer()}>{t('hub.save', 'Salvar')}</button>
                <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" onClick={() => setDevUrl(null)}><X size={13} /></button>
                <span>{t('hub.serverHint', 'vazio = hub.darkhub.ink')}</span>
              </span>
            )}
          </div>
        </div>
      ) : null}

      {tab === 'installed' ? (
        <section className="space-y-2">
          {installed.length ? (
            <ul className="dh-card divide-y divide-zinc-800/80">
              {installed.map((p) => (
                <li key={p.id} className="px-4 py-2.5 flex items-center gap-3 flex-wrap">
                  <span className="min-w-0 flex-1"><span className="block text-[13px] text-zinc-100">{hubText(p.name, lang)}</span><span className="block text-[11.5px] text-zinc-500 font-mono">{p.id} · v{p.version} · {p.steps} {t('hub.changes', 'mudanças')} · {new Date(p.installedAt).toLocaleDateString()}</span></span>
                  <TierBadge tier={p.source?.tier} />
                  <RiskBadge risk={p.risk} />
                  {updates[p.id] ? <button type="button" className="dh-btn dh-btn-sm dh-btn-primary" disabled={Boolean(busy)} onClick={() => void update(p.id)}>{busy === `up:${p.id}` ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}{t('hub.update', 'Atualizar para')} v{updates[p.id]}</button> : null}
                  <button type="button" className="dh-btn dh-btn-sm" disabled={Boolean(busy)} onClick={() => void uninstall(p.id)}>{busy === `rm:${p.id}` ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}{t('hub.uninstall', 'Remover e restaurar')}</button>
                </li>
              ))}
            </ul>
          ) : <p className="dh-help">{t('hub.none', 'Nenhum pacote instalado. Procure no Catálogo, abra um arquivo .darkhub.json ou crie um a partir deste PC.')}</p>}
        </section>
      ) : null}

      {tab === 'file' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="dh-btn dh-btn-sm" onClick={() => void openFile()}><FolderOpen size={13} />{t('hub.open', 'Abrir arquivo')}</button>
            <button type="button" className="dh-btn dh-btn-sm" onClick={() => setPaste('')}><Clipboard size={13} />{t('hub.paste', 'Colar JSON')}</button>
            <button type="button" className="dh-btn dh-btn-sm dh-btn-primary" onClick={() => setExp({ name: t('hub.myPc', 'Meu PC'), github: '' })}><Download size={13} />{t('hub.exportMine', 'Criar preset do meu PC')}</button>
            <button type="button" className="dh-btn dh-btn-sm" onClick={async () => {
              const r = await window.darkhub?.ext?.devAdd();
              if (!r || r.canceled) return;
              if (r.ok) { setMsg({ ok: true, text: `${t('ext.devLoaded', 'Extensão carregada em modo de desenvolvimento')}: ${r.id}. ${t('ext.devHint', 'Ela recarrega sozinha quando um arquivo da pasta muda.')}` }); extensionsChanged(); void refresh(); void loadDev(); }
              else setMsg({ ok: false, text: r.error || (r.errors || []).map((e) => `${e.path} ${e.message}`).join('; ') });
            }}><Code size={13} />{t('ext.devLoad', 'Carregar extensão de uma pasta')}</button>
          </div>
          {devFolders.length ? (
            <ul className="text-[12px] text-zinc-400 space-y-1">
              {devFolders.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="font-mono break-all">{f}</span>
                  <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" onClick={async () => { await window.darkhub?.ext?.devRemove({ folder: f }); void loadDev(); }}>{t('ext.devStop', 'Parar de observar')}</button>
                </li>
              ))}
            </ul>
          ) : null}
          {paste !== null ? (
            <section className="dh-card p-4 space-y-2">
              <p className="text-[12.5px] text-zinc-300">{t('hub.pasteHint', 'Cole o conteúdo de um arquivo .darkhub.json (por exemplo, o que o Claude gerou).')}</p>
              <textarea className="dh-input w-full h-48 font-mono text-[11.5px]" spellCheck={false} value={paste} onChange={(e) => setPaste(e.target.value)} aria-label={t('hub.paste', 'Colar JSON')} />
              <div className="flex gap-2">
                <button type="button" className="dh-btn dh-btn-sm dh-btn-primary" disabled={!paste.trim()} onClick={() => { const p = paste; setPaste(null); void inspect(p); }}>{t('hub.check', 'Verificar')}</button>
                <button type="button" className="dh-btn dh-btn-sm" onClick={() => setPaste(null)}>{t('hub.cancel', 'Cancelar')}</button>
              </div>
            </section>
          ) : null}
          {exp ? (
            <section className="dh-card p-4 space-y-3">
              <h2 className="dh-section-title">{t('hub.exportTitle', 'Criar preset do meu PC')}</h2>
              <p className="dh-help">{t('hub.exportHint', 'Junta os ajustes e operações do DarkHub ativos neste PC num preset que você pode guardar, compartilhar ou publicar. Ajustes de segurança ficam de fora.')}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="space-y-1"><span className="dh-label">{t('hub.exportName', 'Nome do preset')}</span><input className="dh-input w-full" value={exp.name} onChange={(e) => setExp({ ...exp, name: e.target.value, text: undefined })} /></label>
                <label className="space-y-1"><span className="dh-label">{t('hub.exportGithub', 'Seu usuário no GitHub')}</span><input className="dh-input w-full" placeholder="pokeralho" value={exp.github} onChange={(e) => setExp({ ...exp, github: e.target.value, text: undefined })} /></label>
              </div>
              {!exp.text ? (
                <div className="flex gap-2">
                  <button type="button" className="dh-btn dh-btn-sm dh-btn-primary" disabled={busy === 'export'} onClick={() => void doExport()}>{busy === 'export' ? <Loader2 size={13} className="animate-spin" /> : null}{t('hub.generate', 'Gerar')}</button>
                  <button type="button" className="dh-btn dh-btn-sm" onClick={() => setExp(null)}>{t('hub.cancel', 'Cancelar')}</button>
                </div>
              ) : (
                <>
                  <textarea readOnly className="dh-input w-full h-48 font-mono text-[11.5px]" value={exp.text} aria-label={t('hub.exportTitle', 'Criar preset do meu PC')} />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="dh-btn dh-btn-sm" onClick={() => void copy(exp.text!)}><Copy size={13} />{t('hub.copy', 'Copiar')}</button>
                    <button type="button" className="dh-btn dh-btn-sm" onClick={() => void api()?.saveFile({ text: exp.text!, name: exp.name })}><Save size={13} />{t('hub.saveFile', 'Salvar arquivo')}</button>
                    <button type="button" className="dh-btn dh-btn-sm" onClick={() => { const s = exp.text!; setExp(null); void inspect(s); }}>{t('hub.openAsPackage', 'Abrir como pacote')}</button>
                    {server ? <button type="button" className="dh-btn dh-btn-sm" onClick={() => void window.darkhub?.shell?.openExternal(`${server.url}/publish`)}><Globe size={13} />{t('hub.publish', 'Publicar no Hub')}</button> : null}
                    <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" onClick={() => setExp(null)} aria-label={t('hub.close', 'Fechar')}><X size={13} /></button>
                  </div>
                </>
              )}
            </section>
          ) : null}
          {preview}
          <p className="dh-help max-w-[85ch]">{t('hub.howto', 'Para criar pacotes com o Claude, ligue a aba IA (MCP) ou peça: "Crie um pacote DarkHub seguindo docs/hub/README.md do repositório Pokeralho/darkhub-suite".')}</p>
        </div>
      ) : null}

      {tab === 'ai' && mcp ? (
        <section className="dh-card p-4 space-y-3">
          <h2 className="dh-section-title flex items-center gap-2"><Sparkles size={14} />{t('hub.mcp.title', 'Assistentes de IA (MCP)')}</h2>
          <p className="dh-help max-w-[85ch]">{t('hub.mcp.hint', 'Deixa o Claude (Code ou Desktop) ler este PC, montar e conferir pacotes e instalá-los. Fica só neste computador (127.0.0.1) e precisa do token; toda instalação ou remoção abre uma janela aqui para você aprovar.')}</p>
          <label className="flex items-center gap-2 text-[13px] text-zinc-200"><input type="checkbox" checked={mcp.enabled} onChange={(e) => void setMcpOn(e.target.checked)} />{t('hub.mcp.enable', 'Ativar o servidor MCP')}</label>
          {mcp.error ? <p className="text-[12.5px] text-amber-300">{mcp.error}</p> : null}
          {mcp.enabled ? (
            <div className="space-y-3 text-[12.5px]">
              <p className={mcp.running ? 'text-emerald-300' : 'text-amber-300'}>{mcp.running ? t('hub.mcp.running', 'Ligado em') : t('hub.mcp.stopped', 'Parado')} <span className="font-mono">{mcp.url}</span></p>
              <div className="space-y-1">
                <p className="dh-label">Claude Code</p>
                <code className="block dh-input font-mono text-[11.5px] whitespace-pre-wrap break-all h-auto py-2">{`claude mcp add --transport http darkhub ${mcp.url} --header "Authorization: Bearer ${showToken ? mcp.token : '<token>'}"`}</code>
                <button type="button" className="dh-btn dh-btn-sm" onClick={() => void copy(`claude mcp add --transport http darkhub ${mcp.url} --header "Authorization: Bearer ${mcp.token}"`)}><Copy size={13} />{t('hub.copy', 'Copiar')}</button>
              </div>
              <div className="space-y-1">
                <p className="dh-label">Claude Desktop <span className="text-zinc-500">(claude_desktop_config.json)</span></p>
                <code className="block dh-input font-mono text-[11.5px] whitespace-pre h-auto py-2 overflow-x-auto">{JSON.stringify({ mcpServers: { darkhub: { command: mcp.bridge, args: ['--config', mcp.configFile] } } }, null, 2)}</code>
                <button type="button" className="dh-btn dh-btn-sm" onClick={() => void copy(JSON.stringify({ mcpServers: { darkhub: { command: mcp.bridge, args: ['--config', mcp.configFile] } } }, null, 2))}><Copy size={13} />{t('hub.copy', 'Copiar')}</button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="dh-btn dh-btn-sm" onClick={() => setShowToken((v) => !v)}><Key size={13} />{showToken ? t('hub.mcp.hideToken', 'Esconder token') : t('hub.mcp.showToken', 'Mostrar token')}</button>
                <button type="button" className="dh-btn dh-btn-sm" onClick={async () => { const s = await api()?.mcp.regenerate(); if (s) setMcp(s); }}><RefreshCw size={13} />{t('hub.mcp.regen', 'Gerar novo token')}</button>
              </div>
              <p className="dh-help">{t('hub.mcp.tools', 'Ferramentas: dados do PC, lista de ajustes e operações, schema, validar, pré-visualizar, instalar, remover, criar preset do PC, buscar e instalar do Hub, atualizações.')}</p>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
