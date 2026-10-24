import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, FolderOpen, Loader2, Plus, RotateCcw, ShieldCheck, Trash2, X, Zap } from '../components/icons';
import PageHeader from '../components/ui/PageHeader';
import { useI18n } from '../i18n/I18nProvider';
import type { QuarantineItem, RealtimeConfig, RealtimeEvent, RealtimeRule, RealtimeStatus } from '../global';

const api = () => window.darkhub?.realtime;
const POLL_MS = 3000;
// Common background apps people choose to demote or close; the user decides, nothing is applied by default.
const SUGGESTED = ['OneDrive.exe', 'ms-teams.exe', 'Spotify.exe', 'EpicGamesLauncher.exe', 'PhoneExperienceHost.exe', 'Widgets.exe'];

function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative w-9 h-5 shrink-0 rounded-full border transition-colors duration-150 ease-out ${on ? 'bg-blue-500 border-blue-400' : 'bg-zinc-800 border-zinc-700'} disabled:opacity-50`}>
      <span className={`absolute top-[2px] ${on ? 'left-[18px]' : 'left-[2px]'} w-3.5 h-3.5 rounded-full bg-zinc-50 transition-all duration-150 ease-out`} />
    </button>
  );
}

const Stat = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="min-w-0">
    <dt className="text-[11.5px] text-zinc-500">{label}</dt>
    <dd className="mt-0.5 font-mono text-[15px] tabular-nums text-zinc-100 truncate">{value}</dd>
  </div>
);

const gb = (mb: number) => `${(mb / 1024).toFixed(1)} GB`;
const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export default function Realtime() {
  const { t } = useI18n();
  const [st, setSt] = useState<RealtimeStatus | null>(null);
  const [quarantine, setQuarantine] = useState<QuarantineItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [ruleName, setRuleName] = useState('');
  const [ruleAction, setRuleAction] = useState<RealtimeRule['action']>('lower');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const s = await api()?.status().catch(() => null);
    if (s?.ok) setSt(s);
  }, []);
  const refreshQuarantine = useCallback(async () => {
    const r = await api()?.quarantineList().catch(() => null);
    if (r?.ok) setQuarantine(r.items || []);
  }, []);

  useEffect(() => {
    void refresh();
    void refreshQuarantine();
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, POLL_MS);
    const off = api()?.onEvent((e) => {
      if (e.level === 'threat') void refreshQuarantine();
      if (e.level !== 'info') void refresh();
    });
    return () => { clearInterval(timer); off?.(); };
  }, [refresh, refreshQuarantine]);

  const update = async (patch: { optimizer?: Partial<RealtimeConfig['optimizer']>; protection?: Partial<RealtimeConfig['protection']> }) => {
    const s = await api()?.setConfig(patch).catch(() => null);
    if (s?.ok) setSt(s);
  };

  const run = async (id: string, fn: () => Promise<{ ok: boolean; error?: string } | undefined>, okText?: string) => {
    setBusy(id); setNotice(null);
    try {
      const r = await fn();
      if (r && !r.ok) setNotice({ tone: 'err', text: r.error || t('rt.failed', 'A operação falhou.') });
      else if (okText) setNotice({ tone: 'ok', text: okText });
    } finally {
      setBusy(null);
      void refresh();
      void refreshQuarantine();
    }
  };

  const log = useMemo(() => {
    if (!st) return [] as RealtimeEvent[];
    const all: RealtimeEvent[] = [...st.optimizer.log.map((e) => ({ ...e, source: 'optimizer' as const })), ...st.protection.log.map((e) => ({ ...e, source: 'protection' as const }))];
    return all.filter((e) => e.level !== 'info').sort((a, b) => b.at - a.at).slice(0, 40);
  }, [st]);

  if (!api()) return <p className="dh-help">{t('rt.unavailable', 'Disponível apenas no aplicativo DarkHub.')}</p>;
  if (!st) return <p className="dh-help flex items-center gap-2"><Loader2 size={14} className="animate-spin" />{t('rt.loading', 'Carregando...')}</p>;

  const o = st.config.optimizer;
  const p = st.config.protection;
  const clam = st.protection.clamav;
  const addRule = (name: string, action: RealtimeRule['action'] = ruleAction) => {
    const n = name.trim();
    if (!n) return;
    const exe = /\.exe$/i.test(n) ? n : `${n}.exe`;
    void update({ optimizer: { rules: [...o.rules.filter((r) => r.name !== exe.toLowerCase()), { name: exe, action }] } });
    setRuleName('');
  };
  const addFolder = async () => {
    const r = await window.darkhub?.diskscan.pickFolder().catch(() => null);
    if (r?.path) void update({ protection: { folders: [...p.folders, r.path] } });
  };

  const describe = (e: RealtimeEvent) => {
    switch (e.event) {
      case 'memory-trim': return t('rt.ev.trim', 'Memória liberada: {mb} MB ({n} processos, disponível estava em {pct}%)').replace('{mb}', String(e.freedMb)).replace('{n}', String(e.processes)).replace('{pct}', String(e.availPct));
      case 'process-lowered': return t('rt.ev.lowered', 'Prioridade reduzida: {name}').replace('{name}', String(e.name));
      case 'process-closed': return t('rt.ev.closed', 'Processo fechado: {name}').replace('{name}', String(e.name));
      case 'quarantined': return t('rt.ev.quarantined', 'Ameaça em quarentena: {d} em {f}').replace('{d}', String(e.detection)).replace('{f}', String(e.file));
      case 'detected': return t('rt.ev.detected', 'Ameaça detectada: {d} em {f}').replace('{d}', String(e.detection)).replace('{f}', String(e.file));
      case 'clamav-setup': return t('rt.ev.clamSetup', 'Instalando o ClamAV e baixando as assinaturas em segundo plano…');
      case 'clamav-ready': return e.error ? t('rt.ev.clamFail', 'ClamAV não pôde ser instalado: {e}').replace('{e}', String(e.error)) : t('rt.ev.clamReady', 'ClamAV pronto e ativado');
      default: return `${e.event}${e.error ? `: ${String(e.error)}` : ''}`;
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      <PageHeader
        title={t('rt.title', 'Tempo real')}
        subtitle={t('rt.subtitle', 'Otimização e proteção contínuas enquanto o DarkHub estiver aberto, inclusive minimizado na bandeja. As duas vêm desligadas.')}
      />

      {notice ? (
        <p role={notice.tone === 'err' ? 'alert' : 'status'} className={`text-[12.5px] ${notice.tone === 'err' ? 'text-red-300' : 'text-blue-200'}`}>{notice.text}</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        {/* ------------------------------------------------------------ optimizer */}
        <section className="dh-card p-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="dh-section-title flex items-center gap-2"><Zap size={15} className="text-zinc-400" />{t('rt.opt.title', 'Otimizador em tempo real')}</h2>
              <p className="dh-help mt-1">{t('rt.opt.desc', 'Libera memória quando ela realmente falta e aplica as regras de processos. Nunca mexe na janela em primeiro plano nem em processos do Windows.')}</p>
            </div>
            <Switch on={o.enabled} onChange={(v) => update({ optimizer: { enabled: v } })} label={t('rt.opt.title', 'Otimizador em tempo real')} />
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label={t('rt.opt.available', 'Memória disponível')} value={`${(st.optimizer.memory.availMb / 1024).toFixed(1)} / ${gb(st.optimizer.memory.totalMb)}`} />
            <Stat label={t('rt.opt.trims', 'Liberações')} value={st.optimizer.stats.trims} />
            <Stat label={t('rt.opt.freed', 'Liberado')} value={gb(st.optimizer.stats.freedMb)} />
            <Stat label={t('rt.opt.rules', 'Regras aplicadas')} value={st.optimizer.stats.lowered + st.optimizer.stats.closed} />
          </dl>

          <div className="space-y-2.5 text-[12.5px]">
            <label className="flex items-start gap-2.5 text-zinc-300">
              <input type="checkbox" className="mt-0.5" checked={o.smart} onChange={(e) => update({ optimizer: { smart: e.target.checked } })} />
              <span>
                {t('rt.opt.smart', 'Modo inteligente')}
                <span className="block dh-help">{t('rt.opt.smartHelp', 'Tira prioridade de atualizadores e apps de fundo (Edge/Google/Adobe Update, OneDrive, Widgets, Phone Link, Game Bar, pesquisa) e fecha só a telemetria do Windows (CompatTelRunner, DeviceCensus). Nunca fecha os seus programas.')}</span>
              </span>
            </label>
            <label className="flex items-center gap-2.5 text-zinc-300">
              <input type="checkbox" checked={o.memory} onChange={(e) => update({ optimizer: { memory: e.target.checked } })} />
              {t('rt.opt.memory', 'Liberar memória sob pressão')}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pl-6">
              <label className="space-y-1"><span className="block text-zinc-500">{t('rt.opt.threshold', 'Quando disponível abaixo de')}</span>
                <select className="dh-input w-full" value={o.memoryThresholdPct} onChange={(e) => update({ optimizer: { memoryThresholdPct: Number(e.target.value) } })} disabled={!o.memory}>
                  {[10, 15, 20, 25, 30].map((v) => <option key={v} value={v}>{v}%</option>)}
                </select></label>
              <label className="space-y-1"><span className="block text-zinc-500">{t('rt.opt.minProcess', 'Processos acima de')}</span>
                <select className="dh-input w-full" value={o.minProcessMb} onChange={(e) => update({ optimizer: { minProcessMb: Number(e.target.value) } })} disabled={!o.memory}>
                  {[100, 150, 300, 500, 1000].map((v) => <option key={v} value={v}>{v} MB</option>)}
                </select></label>
              <label className="space-y-1"><span className="block text-zinc-500">{t('rt.opt.cooldown', 'Intervalo mínimo')}</span>
                <select className="dh-input w-full" value={o.cooldownMin} onChange={(e) => update({ optimizer: { cooldownMin: Number(e.target.value) } })} disabled={!o.memory}>
                  {[5, 10, 20, 30, 60].map((v) => <option key={v} value={v}>{v} min</option>)}
                </select></label>
            </div>
          </div>

          <div className="space-y-2 border-t border-zinc-800/80 pt-3">
            <h3 className="text-[12.5px] font-medium text-zinc-200">{t('rt.rules.title', 'Processos indesejados')}</h3>
            <p className="dh-help">{t('rt.rules.desc', 'Só os processos desta lista são afetados. "Reduzir prioridade" deixa o app aberto, mas sem disputar CPU com o jogo.')}</p>
            {o.rules.length ? (
              <ul className="divide-y divide-zinc-800/80 rounded-md border border-zinc-800/80">
                {o.rules.map((r) => (
                  <li key={r.name} className="flex items-center gap-2 px-3 py-1.5 text-[12.5px]">
                    <span className="font-mono text-zinc-200 truncate flex-1">{r.name}</span>
                    <select className="dh-input py-0.5" value={r.action} onChange={(e) => update({ optimizer: { rules: o.rules.map((x) => (x.name === r.name ? { ...x, action: e.target.value as RealtimeRule['action'] } : x)) } })}>
                      <option value="lower">{t('rt.rules.lower', 'Reduzir prioridade')}</option>
                      <option value="close">{t('rt.rules.close', 'Fechar')}</option>
                    </select>
                    <button type="button" className="dh-btn dh-btn-ghost dh-btn-sm" aria-label={t('rt.remove', 'Remover')} onClick={() => update({ optimizer: { rules: o.rules.filter((x) => x.name !== r.name) } })}><X size={14} /></button>
                  </li>
                ))}
              </ul>
            ) : null}
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addRule(ruleName); }}>
              <input className="dh-input flex-1 min-w-0" placeholder={t('rt.rules.placeholder', 'nome do processo, ex.: OneDrive.exe')} aria-label={t('rt.rules.placeholder', 'nome do processo, ex.: OneDrive.exe')} value={ruleName} onChange={(e) => setRuleName(e.target.value)} />
              <select className="dh-input" value={ruleAction} onChange={(e) => setRuleAction(e.target.value as RealtimeRule['action'])}>
                <option value="lower">{t('rt.rules.lower', 'Reduzir prioridade')}</option>
                <option value="close">{t('rt.rules.close', 'Fechar')}</option>
              </select>
              <button type="submit" className="dh-btn dh-btn-sm" disabled={!ruleName.trim()}><Plus size={14} />{t('rt.add', 'Adicionar')}</button>
            </form>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED.filter((n) => !o.rules.some((r) => r.name === n.toLowerCase())).map((n) => (
                <button key={n} type="button" className="dh-btn dh-btn-ghost dh-btn-sm font-mono" onClick={() => addRule(n, 'lower')}>+ {n}</button>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ protection */}
        <section className="dh-card p-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="dh-section-title flex items-center gap-2"><ShieldCheck size={15} className="text-zinc-400" />{t('rt.prot.title', 'Proteção em tempo real')}</h2>
              <p className="dh-help mt-1">{t('rt.prot.desc', 'Analisa cada arquivo executável, script ou compactado que chega nas pastas vigiadas: base de hashes da comunidade e, opcionalmente, o antivírus ClamAV.')}</p>
            </div>
            <Switch on={p.enabled} onChange={(v) => update({ protection: { enabled: v } })} label={t('rt.prot.title', 'Proteção em tempo real')} />
          </div>

          <p className={`text-[12px] ${st.protection.defender ? 'text-zinc-400' : 'text-amber-200'}`}>
            {st.protection.defender
              ? t('rt.prot.defenderOn', 'O Microsoft Defender está ativo: o DarkHub complementa a proteção dele, não a substitui.')
              : t('rt.prot.defenderOff', 'O Microsoft Defender não está ativo neste Windows. Ative a proteção e o ClamAV para cobrir esse espaço.')}
          </p>

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label={t('rt.prot.scanned', 'Arquivos analisados')} value={st.protection.stats.scanned} />
            <Stat label={t('rt.prot.detections', 'Ameaças')} value={st.protection.stats.detections} />
            <Stat label={t('rt.prot.hashes', 'Hashes conhecidos')} value={st.protection.hashes.toLocaleString()} />
            <Stat label={t('rt.prot.quarantine', 'Em quarentena')} value={st.quarantine} />
          </dl>

          <div className="space-y-2">
            <h3 className="text-[12.5px] font-medium text-zinc-200">{t('rt.prot.folders', 'Pastas vigiadas')}</h3>
            <ul className="divide-y divide-zinc-800/80 rounded-md border border-zinc-800/80">
              {p.folders.map((f) => (
                <li key={f} className="flex items-center gap-2 px-3 py-1.5 text-[12.5px]">
                  <FolderOpen size={14} className="text-zinc-500 shrink-0" />
                  <span className="font-mono text-zinc-300 truncate flex-1" title={f}>{f}</span>
                  <button type="button" className="dh-btn dh-btn-ghost dh-btn-sm" aria-label={t('rt.remove', 'Remover')} onClick={() => update({ protection: { folders: p.folders.filter((x) => x !== f) } })}><X size={14} /></button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="dh-btn dh-btn-sm" onClick={addFolder}><Plus size={14} />{t('rt.prot.addFolder', 'Adicionar pasta')}</button>
              <button type="button" className="dh-btn dh-btn-sm" disabled={busy !== null} onClick={() => run('scan', () => api()!.scanFiles(), t('rt.prot.scanQueued', 'Arquivos enviados para análise. O resultado aparece na atividade.'))}>
                {busy === 'scan' ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}{t('rt.prot.scanNow', 'Analisar arquivos...')}
              </button>
            </div>
          </div>

          <div className="space-y-2.5 border-t border-zinc-800/80 pt-3 text-[12.5px]">
            <label className="flex items-center gap-2.5 text-zinc-300">
              <input type="checkbox" checked={p.autoQuarantine} onChange={(e) => update({ protection: { autoQuarantine: e.target.checked } })} />
              {t('rt.prot.autoQuarantine', 'Mover ameaças para a quarentena automaticamente')}
            </label>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-zinc-200">{t('rt.clam.title', 'Antivírus ClamAV')}</p>
                <p className="dh-help mt-0.5">
                  {!clam.installed
                    ? t('rt.clam.notInstalled', 'Motor open source da Cisco Talos. Instalado do pacote oficial; as assinaturas vêm do espelho oficial (~110 MB na primeira vez). Cada análise usa ~1 GB de RAM por uns 20 s, por isso roda em lotes e só quando chegam arquivos de risco.')
                    : !clam.database
                      ? t('rt.clam.noDb', 'Instalado, sem assinaturas ainda. Baixe as assinaturas para usar.')
                      : t('rt.clam.ready', 'Pronto. Assinaturas atualizadas há {h} h; atualizadas sozinhas a cada 24 h. Roda em prioridade baixa, por lotes.').replace('{h}', String(Math.round((clam.databaseAgeMs || 0) / 3600000)))}
                </p>
              </div>
              <Switch on={p.clamav} disabled={!clam.installed || !clam.database} onChange={(v) => update({ protection: { clamav: v } })} label={t('rt.clam.title', 'Antivírus ClamAV')} />
            </div>
            <div className="flex gap-2">
              {!clam.installed ? (
                <button type="button" className="dh-btn dh-btn-sm" disabled={busy !== null} onClick={() => run('clam', () => api()!.clamavInstall(), t('rt.clam.installed', 'ClamAV instalado e assinaturas baixadas.'))}>
                  {busy === 'clam' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}{busy === 'clam' ? t('rt.clam.installing', 'Instalando e baixando assinaturas...') : t('rt.clam.install', 'Instalar ClamAV')}
                </button>
              ) : (
                <button type="button" className="dh-btn dh-btn-sm" disabled={busy !== null} onClick={() => run('clam', () => api()!.clamavUpdate(), t('rt.clam.updated', 'Assinaturas atualizadas.'))}>
                  {busy === 'clam' ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}{t('rt.clam.update', 'Atualizar assinaturas')}
                </button>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* ------------------------------------------------------------ quarantine */}
      <section className="dh-card p-4 space-y-3">
        <h2 className="dh-section-title">{t('rt.q.title', 'Quarentena')}</h2>
        {quarantine.length === 0 ? (
          <p className="dh-help">{t('rt.q.empty', 'Nenhum arquivo em quarentena.')}</p>
        ) : (
          <ul className="divide-y divide-zinc-800/80">
            {quarantine.map((q) => (
              <li key={q.id} className="py-2 flex flex-col sm:flex-row sm:items-center gap-2 text-[12.5px]">
                <div className="min-w-0 flex-1">
                  <p className="text-zinc-100 truncate" title={q.originalPath}>{q.originalPath}</p>
                  <p className="text-zinc-500">{q.detection} · {q.engine} · {new Date(q.at).toLocaleString()}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button type="button" className="dh-btn dh-btn-sm" disabled={busy !== null} onClick={() => run(`r:${q.id}`, () => api()!.quarantineRestore(q.id), t('rt.q.restored', 'Arquivo restaurado e marcado como confiável.'))}>
                    <RotateCcw size={14} />{t('rt.q.restore', 'Restaurar')}
                  </button>
                  {confirmDelete === q.id ? (
                    <button type="button" className="dh-btn dh-btn-sm dh-btn-danger" onClick={() => { setConfirmDelete(null); void run(`d:${q.id}`, () => api()!.quarantineDelete(q.id)); }}>
                      <Trash2 size={14} />{t('rt.q.confirmDelete', 'Confirmar exclusão')}
                    </button>
                  ) : (
                    <button type="button" className="dh-btn dh-btn-ghost dh-btn-sm" onClick={() => setConfirmDelete(q.id)}><Trash2 size={14} />{t('rt.q.delete', 'Excluir')}</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------------------ activity */}
      <section className="dh-card p-4 space-y-3">
        <h2 className="dh-section-title">{t('rt.log.title', 'Atividade')}</h2>
        {log.length === 0 ? (
          <p className="dh-help">{t('rt.log.empty', 'Nada aconteceu ainda. As ações e detecções aparecem aqui.')}</p>
        ) : (
          <ul className="space-y-1 font-mono text-[11.5px]">
            {log.map((e, i) => (
              <li key={`${e.at}-${i}`} className={`flex gap-3 ${e.level === 'threat' ? 'text-red-300' : e.level === 'error' ? 'text-amber-200' : 'text-zinc-300'}`}>
                <span className="text-zinc-600 shrink-0">{time(e.at)}</span>
                {e.level === 'threat' ? <AlertTriangle size={13} className="shrink-0 mt-[1px]" /> : null}
                <span className="break-all">{describe(e)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
