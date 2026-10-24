import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Loader2, Search, AlertTriangle, Undo2, ShieldAlert, Clock } from '../components/icons';
import PageHeader from '../components/ui/PageHeader';
import { useI18n } from '../i18n/I18nProvider';
import type { StartupItem } from '../global';

type ListResult = Awaited<ReturnType<NonNullable<typeof window.darkhub>['startup']['list']>>;
type Tab = 'apps' | 'task' | 'service';

function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative w-9 h-5 shrink-0 rounded-full border transition-colors duration-150 ease-out ${on ? 'bg-blue-500 border-blue-400' : 'bg-zinc-800 border-zinc-700'} disabled:opacity-50`}>
      <span className={`absolute top-[2px] ${on ? 'left-[18px]' : 'left-[2px]'} w-3.5 h-3.5 rounded-full bg-zinc-50 transition-all duration-150 ease-out`} />
    </button>
  );
}

const secs = (ms: number | null | undefined) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)} s`);

export default function StartupManager() {
  const { t } = useI18n();
  const [data, setData] = useState<ListResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('apps');
  const [query, setQuery] = useState('');
  const [showMicrosoft, setShowMicrosoft] = useState(false);

  const api = () => window.darkhub?.startup;
  const refresh = async () => {
    if (!api()) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api()!.list();
      if (r.ok) setData(r); else setError(r.error ?? 'error');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void refresh(); }, []);

  const toggle = async (item: StartupItem, enabled: boolean) => {
    if (!enabled && item.sensitive === 'security' && !window.confirm(t('boot.confirmSecurity', '"{name}" parece ser software de segurança. Desativar pode deixar o PC desprotegido no início. Continuar?').replace('{name}', item.name))) return;
    if (!enabled && (item.sensitive === 'system' || item.microsoft) && !window.confirm(t('boot.confirmSystem', '"{name}" é do Windows. Desativar pode quebrar recursos do sistema. Continuar?').replace('{name}', item.name))) return;
    setBusy(item.id);
    setError(null);
    const r = await api()!.setEnabled({ item, enabled }).catch((e) => ({ ok: false, error: String(e?.message ?? e) }));
    if (!r.ok) setError(r.error ?? 'error');
    setBusy(null);
    await refresh();
  };

  const undo = async (index: number) => {
    setBusy(`undo-${index}`);
    const r = await api()!.undo({ index }).catch((e) => ({ ok: false, error: String(e?.message ?? e) }));
    if (!r.ok) setError(r.error ?? 'error');
    setBusy(null);
    await refresh();
  };

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.items ?? [])
      .filter((i) => (tab === 'apps' ? i.kind === 'run' || i.kind === 'folder' : i.kind === tab))
      .filter((i) => showMicrosoft || !i.microsoft)
      .filter((i) => !q || `${i.name} ${i.command}`.toLowerCase().includes(q))
      .sort((a, b) => (b.impact?.avgMs ?? -1) - (a.impact?.avgMs ?? -1) || a.name.localeCompare(b.name));
  }, [data, tab, query, showMicrosoft]);

  const counts = useMemo(() => {
    const all = (data?.items ?? []).filter((i) => showMicrosoft || !i.microsoft);
    return { apps: all.filter((i) => i.kind === 'run' || i.kind === 'folder').length, task: all.filter((i) => i.kind === 'task').length, service: all.filter((i) => i.kind === 'service').length };
  }, [data, showMicrosoft]);

  const boots = (data?.boots ?? []).slice(0, 15).reverse();
  const maxBoot = Math.max(1, ...boots.map((b) => b.totalMs ?? 0));
  const tabs: { id: Tab; label: string }[] = [
    { id: 'apps', label: t('boot.tab.apps', 'Apps') },
    { id: 'task', label: t('boot.tab.tasks', 'Tarefas agendadas') },
    { id: 'service', label: t('boot.tab.services', 'Serviços') }
  ];

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      <PageHeader
        title={t('nav.startup', 'Inicialização')}
        subtitle={t('boot.subtitle', 'Tudo o que abre junto com o Windows, com o atraso medido pelo próprio Windows. Desativar funciona igual ao Gerenciador de Tarefas e pode ser desfeito.')}
        actions={<button type="button" onClick={() => void refresh()} disabled={loading} className="dh-btn">{loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}{t('boot.refresh', 'Atualizar')}</button>}
      />

      {error && <p role="alert" className="flex items-center gap-2 text-[12.5px] text-red-400"><AlertTriangle size={14} />{error}</p>}

      <section className="rounded-xl border border-zinc-800/80 p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="dh-section-title flex items-center gap-2"><Clock size={14} />{t('boot.boots', 'Últimas inicializações')}</h2>
          {boots.length > 0 && <span className="text-[12px] text-zinc-400">{t('boot.lastBoot', 'Última: {s} (área de trabalho pronta em {m})').replace('{s}', secs(boots[boots.length - 1].totalMs)).replace('{m}', secs(boots[boots.length - 1].mainPathMs))}</span>}
        </div>
        {!data ? (
          <div className="h-16 rounded bg-zinc-900 animate-pulse" />
        ) : !data.eventsReadable ? (
          <p className="dh-help">{t('boot.noEvents', 'Para ler a duração das inicializações e o atraso causado por cada app, o DarkHub precisa estar rodando como administrador (o app instalado já roda assim).')}</p>
        ) : boots.length === 0 ? (
          <p className="dh-help">{t('boot.noBoots', 'O Windows ainda não registrou medições de inicialização neste PC.')}</p>
        ) : (
          <div className="flex items-end gap-1.5 h-20" role="img" aria-label={t('boot.boots', 'Últimas inicializações')}>
            {boots.map((b) => (
              <div key={b.at} className="flex-1 min-w-0 flex flex-col items-center gap-1" title={`${new Date(b.at).toLocaleString()} · ${secs(b.totalMs)}`}>
                <div className="w-full rounded-sm bg-blue-400/70" style={{ height: `${Math.max(4, ((b.totalMs ?? 0) / maxBoot) * 64)}px` }} />
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" className="flex gap-1">
          {tabs.map((x) => (
            <button key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)}
              className={`h-8 px-3 rounded-md text-[13px] ${tab === x.id ? 'bg-zinc-800/80 text-zinc-50' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'}`}>
              {x.label} <span className="text-zinc-500 tabular-nums">{counts[x.id]}</span>
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-64 max-w-full">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('boot.search', 'Procurar...')} className="dh-input w-full pl-8" />
        </div>
        <label className="flex items-center gap-2 text-[12.5px] text-zinc-300 select-none">
          <input type="checkbox" checked={showMicrosoft} onChange={(e) => setShowMicrosoft(e.target.checked)} />
          {t('boot.showMicrosoft', 'Mostrar itens da Microsoft')}
        </label>
      </div>

      <div className="rounded-xl border border-zinc-800/80 divide-y divide-zinc-900">
        {!data && <div className="p-4 space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-8 rounded bg-zinc-900 animate-pulse" />)}</div>}
        {data && items.length === 0 && <p className="p-4 dh-help">{t('boot.empty', 'Nada aqui.')}</p>}
        {items.map((i) => (
          <div key={i.id} className="flex items-center gap-3 px-3 py-2.5 min-w-0">
            <Switch on={i.enabled} disabled={busy !== null} onChange={(v) => void toggle(i, v)} label={i.name} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-[13px] text-zinc-100 min-w-0">
                <span className="truncate">{i.name}</span>
                {i.sensitive === 'security' && <span className="flex items-center gap-1 text-[11px] text-amber-300 shrink-0"><ShieldAlert size={12} />{t('boot.security', 'segurança')}</span>}
                {i.microsoft && <span className="text-[11px] text-zinc-500 shrink-0">Microsoft</span>}
                {i.needsAdmin && <span className="text-[11px] text-zinc-500 shrink-0">{t('boot.admin', 'todos os usuários')}</span>}
              </p>
              <p className="font-mono text-[11.5px] text-zinc-500 truncate" title={i.command}>{i.command || i.location}</p>
            </div>
            <div className="shrink-0 text-right">
              {i.impact ? (
                <span className={`text-[12px] tabular-nums ${i.impact.avgMs >= 3000 ? 'text-red-300' : i.impact.avgMs >= 1000 ? 'text-amber-300' : 'text-zinc-300'}`} title={t('boot.impactHelp', 'Atraso médio medido pelo Windows em {n} inicializações').replace('{n}', String(i.impact.count))}>
                  +{secs(i.impact.avgMs)}
                </span>
              ) : (
                <span className="text-[11.5px] text-zinc-600">{t('boot.notMeasured', 'sem medição')}</span>
              )}
              {!i.enabled && i.disabledAt && <p className="text-[11px] text-zinc-500">{t('boot.disabledAt', 'desativado em {d}').replace('{d}', new Date(i.disabledAt).toLocaleDateString())}</p>}
            </div>
            {busy === i.id && <Loader2 size={14} className="animate-spin text-zinc-400 shrink-0" />}
          </div>
        ))}
      </div>

      {(data?.history?.length ?? 0) > 0 && (
        <section>
          <h2 className="dh-section-title mb-2">{t('boot.history', 'Alterações feitas aqui')}</h2>
          <div className="rounded-xl border border-zinc-800/80 divide-y divide-zinc-900">
            {data!.history!.slice(0, 12).map((h, idx) => (
              <div key={`${h.at}-${idx}`} className="flex items-center gap-3 px-3 py-2 text-[12.5px]">
                <span className="text-zinc-500 tabular-nums shrink-0">{new Date(h.at).toLocaleString()}</span>
                <span className="truncate text-zinc-200 flex-1">{h.name}</span>
                <span className="text-zinc-400 shrink-0">{h.to ? t('boot.enabled', 'ativado') : t('boot.disabled', 'desativado')}</span>
                <button type="button" onClick={() => void undo(idx)} disabled={busy !== null} className="dh-btn dh-btn-ghost dh-btn-sm shrink-0"><Undo2 size={13} />{t('boot.undo', 'Desfazer')}</button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
