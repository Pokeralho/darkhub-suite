import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { CleanerDb, CleanerDefinitions, CleanerFinding, CleanerRegCleanResult, CleanerRunResult, CleanerTarget, CleanerVacuumResult } from '../global';
import PageHeader from '../components/ui/PageHeader';
import { ErrorLine, fmtBytes } from '../components/recovery/rescueUtils';
import { AlertTriangle, CheckCircle, ChevronDown, ChevronRight, DownloadCloud, Eraser, FolderOpen, Loader2, RefreshCw, RotateCcw, Search, ShieldCheck, Trash2, XCircle } from '../components/icons';
import { useI18n } from '../i18n/I18nProvider';

const api = () => window.darkhub?.cleaner;
type Tab = 'files' | 'browsers' | 'registry' | 'defs';
const BROWSERS = [
  { id: 'chrome', label: 'Google Chrome' },
  { id: 'edge', label: 'Microsoft Edge' },
  { id: 'brave', label: 'Brave' },
  { id: 'firefox', label: 'Firefox' },
  { id: 'zen', label: 'Zen Browser' }
];

export default function Cleaner() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('files');
  const [defs, setDefs] = useState<CleanerDefinitions | null>(null);
  const [backupDir, setBackupDir] = useState<string | null>(null);
  const [engine, setEngine] = useState<boolean | null>(null);

  const loadStatus = useCallback(async () => {
    const r = await api()?.status();
    if (r?.ok) { setDefs(r.winapp2); setBackupDir(r.backupDir); setEngine(r.engine); }
  }, []);
  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'files', label: t('cleaner.tab.files', 'Arquivos') },
    { id: 'browsers', label: t('cleaner.tab.browsers', 'Bancos dos navegadores') },
    { id: 'registry', label: t('cleaner.tab.registry', 'Registro') },
    { id: 'defs', label: t('cleaner.tab.defs', 'Definições (winapp2.ini)') }
  ];

  return (
    <div className="dh-page">
      <PageHeader
        title={t('cleaner.title', 'Limpeza profunda')}
        subtitle={t('cleaner.subtitle', 'DarkHub Cleaner Core: arquivos temporários e caches de programas, compactação dos bancos dos navegadores e entradas mortas do registro. Tudo começa em simulação.')}
      >
        <nav className="flex flex-wrap gap-1 -mb-5 border-b border-transparent" role="tablist">
          {tabs.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)}
              className={`px-3 py-2 text-[12.5px] border-b-2 -mb-px transition-colors duration-150 ${tab === x.id ? 'border-blue-400 text-zinc-50' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}>
              {x.label}
            </button>
          ))}
        </nav>
      </PageHeader>
      {engine === false ? <ErrorLine text={t('cleaner.noEngine', 'O motor DarkHub.Cleaner.exe não foi encontrado (rode npm run build:cleaner).')} /> : null}
      {tab === 'files' ? <FilesTab defs={defs} onGoDefs={() => setTab('defs')} /> : null}
      {tab === 'browsers' ? <BrowsersTab /> : null}
      {tab === 'registry' ? <RegistryTab backupDir={backupDir} /> : null}
      {tab === 'defs' ? <DefsTab defs={defs} onChanged={loadStatus} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- confirmation

function ConfirmModal({ title, lines, warn, ack, action, danger = true, onConfirm, onClose }: {
  title: string; lines: React.ReactNode; warn: string; ack: string; action: string; danger?: boolean;
  onConfirm: () => Promise<void>; onClose: () => void;
}) {
  const { t } = useI18n();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="dh-card dh-raised bg-zinc-950 w-full max-w-xl p-5 space-y-4">
        <h2 className="text-[16px] font-semibold text-zinc-50">{title}</h2>
        <div className="text-[13px] text-zinc-300 space-y-1">{lines}</div>
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-3">
          <p className="flex items-start gap-2 text-[12.5px] text-amber-200"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{warn}</p>
          <label className="flex items-center gap-2 text-[12.5px] text-zinc-200">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />{ack}
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="dh-btn dh-btn-ghost" disabled={busy} onClick={onClose}>{t('cleaner.cancel', 'Cancelar')}</button>
          <button type="button" className={`dh-btn ${danger ? 'dh-btn-danger' : 'dh-btn-primary'}`} disabled={!checked || busy}
            onClick={() => { setBusy(true); void onConfirm().finally(() => setBusy(false)); }}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}{action}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = 'text-zinc-50' }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="dh-card px-3 py-2 min-w-[120px]">
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className={`font-mono text-[15px] ${tone}`}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------- Arquivos

function FilesTab({ defs, onGoDefs }: { defs: CleanerDefinitions | null; onGoDefs: () => void }) {
  const { t } = useI18n();
  const [targets, setTargets] = useState<CleanerTarget[] | null>(null);
  const [stats, setStats] = useState<{ winapp2_sections: number; winapp2_detected: number; rejected_rules: number } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<CleanerRunResult | null>(null);
  const [scanKey, setScanKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [shred, setShred] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<CleanerRunResult | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null); setTargets(null);
    const r = await api()?.listTargets();
    if (r?.ok) {
      setTargets(r.targets); setStats(r.stats);
      setSelected(new Set(r.targets.filter((x) => x.source === 'builtin' && x.rules.length).map((x) => x.id)));
    } else { setTargets([]); setError(r?.error ?? t('cleaner.loadFail', 'Não foi possível listar os itens.')); }
  }, [t]);
  useEffect(() => { void load(); }, [load, defs?.sha256]);

  // built-in items have stable ids ("dh:user-temp"): their names and warnings are translated here
  const nameOf = useCallback((x: CleanerTarget) => (x.source === 'builtin' ? t(`cleaner.builtin.${x.id.slice(3)}`, x.name) : x.name), [t]);
  const warnOf = (x: CleanerTarget) => (x.source === 'builtin' && x.warning ? t(`cleaner.builtin.${x.id.slice(3)}.warn`, x.warning) : x.warning ?? '');
  const ids = useMemo(() => [...selected].sort(), [selected]);
  const key = ids.join('\n');
  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const m = new Map<string, CleanerTarget[]>();
    for (const x of targets ?? []) {
      if (q && !nameOf(x).toLowerCase().includes(q) && !x.category.toLowerCase().includes(q)) continue;
      const g = x.source === 'builtin' ? t('cleaner.builtin', 'DarkHub (embutido)') : x.category;
      m.set(g, [...(m.get(g) ?? []), x]);
    }
    return [...m.entries()];
  }, [targets, filter, t, nameOf]);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const runScan = async () => {
    setBusy(true); setError(null); setDone(null);
    try {
      const r = await api()?.scan({ ids });
      if (r?.ok) { setScan(r); setScanKey(key); } else setError(r?.error ?? t('cleaner.scanFail', 'A análise falhou.'));
    } finally { setBusy(false); }
  };

  const runClean = async () => {
    const r = await api()?.clean({ ids, apply: true, confirm: true, shred });
    setConfirming(false);
    if (r?.ok) { setDone(r); setScan(null); setScanKey(''); } else setError(r?.error ?? t('cleaner.cleanFail', 'A limpeza falhou.'));
  };

  const scanValid = scan && scanKey === key;
  const byId = new Map((scan?.targets ?? []).map((r) => [r.id, r]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input className="dh-input pl-8 w-64" placeholder={t('cleaner.filter', 'Filtrar programas')} value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <button type="button" className="dh-btn dh-btn-sm" onClick={() => void load()}><RefreshCw size={14} />{t('cleaner.reload', 'Recarregar')}</button>
        <span className="text-[12px] text-zinc-500">
          {defs?.installed
            ? `${t('cleaner.w2loaded', 'winapp2.ini')} ${defs.version ?? ''}: ${stats?.winapp2_detected ?? 0} ${t('cleaner.w2detected', 'programas detectados neste PC')} · ${stats?.rejected_rules ?? 0} ${t('cleaner.rejectedRules', 'regras recusadas pela segurança')}`
            : <button type="button" className="underline hover:text-zinc-300" onClick={onGoDefs}>{t('cleaner.w2none', 'Baixe as definições winapp2.ini para incluir programas de terceiros')}</button>}
        </span>
      </div>
      <ErrorLine text={error} />

      {!targets ? <p className="dh-help flex items-center gap-2"><Loader2 size={14} className="animate-spin" />{t('cleaner.loading', 'Procurando o que existe neste PC...')}</p> : (
        <div className="dh-card divide-y divide-zinc-800/80 max-h-[46vh] overflow-auto">
          {groups.map(([g, items]) => (
            <div key={g} className="p-3">
              <div className="dh-section-title mb-2">{g}</div>
              <ul className="space-y-1">
                {items.map((x) => {
                  const res = scanValid ? byId.get(x.id) : undefined;
                  const disabled = x.rules.length === 0;
                  return (
                    <li key={x.id}>
                      <div className="flex items-center gap-2 text-[13px]">
                        <input type="checkbox" checked={selected.has(x.id)} disabled={disabled} onChange={() => toggle(x.id)} aria-label={nameOf(x)} />
                        <button type="button" className="flex items-center gap-1 text-left text-zinc-200 hover:text-zinc-50" onClick={() => setOpen(open === x.id ? null : x.id)}>
                          {open === x.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{nameOf(x)}
                        </button>
                        {x.source === 'winapp2' ? <span className="dh-tag">winapp2</span> : null}
                        {x.warning ? <span title={warnOf(x)}><AlertTriangle size={13} className="text-amber-300" /></span> : null}
                        {x.rejected.length ? <span className="text-[11px] text-zinc-500">{x.rejected.length} {t('cleaner.refused', 'recusada(s)')}</span> : null}
                        {res ? <span className="ml-auto font-mono text-[12px] text-zinc-300">{res.files} · {fmtBytes(res.bytes)}</span> : null}
                      </div>
                      {open === x.id ? (
                        <div className="ml-7 mt-1 mb-2 space-y-1 text-[11.5px] font-mono text-zinc-400">
                          {x.warning ? <p className="font-sans text-amber-200">{warnOf(x)}</p> : null}
                          {x.rules.map((r, i) => <div key={i} className="break-all">{r.dir}\{r.patterns.join(';')}{r.recurse ? ` (${t('cleaner.recurse', 'com subpastas')})` : ''}</div>)}
                          {x.rejected.map((r, i) => <div key={`r${i}`} className="break-all text-red-300/80">✕ {r.rule}: {r.reason}</div>)}
                          {res?.sample.length ? (
                            <div className="pt-1 text-zinc-500">
                              <div className="font-sans text-zinc-400">{t('cleaner.sample', 'Exemplos do que será apagado:')}</div>
                              {res.sample.map((s) => <div key={s} className="break-all">{s}</div>)}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="dh-btn dh-btn-primary" disabled={busy || !ids.length} onClick={() => void runScan()}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}{t('cleaner.analyze', 'Analisar (simulação)')}
        </button>
        <label className="flex items-center gap-2 text-[12.5px] text-zinc-300">
          {t('cleaner.shred', 'Exclusão segura')}
          <select className="dh-input" value={shred} onChange={(e) => setShred(Number(e.target.value))}>
            <option value={0}>{t('cleaner.shred.off', 'Desligada (apagar normal)')}</option>
            <option value={1}>{t('cleaner.shred.1', '1 passagem')}</option>
            <option value={3}>{t('cleaner.shred.3', '3 passagens')}</option>
            <option value={7}>{t('cleaner.shred.7', '7 passagens')}</option>
          </select>
        </label>
        <button type="button" className="dh-btn dh-btn-danger" disabled={!scanValid || !scan?.total.files} onClick={() => setConfirming(true)}>
          <Trash2 size={14} />{t('cleaner.clean', 'Limpar...')}
        </button>
        {!scanValid && ids.length ? <span className="text-[12px] text-zinc-500">{t('cleaner.analyzeFirst', 'Analise antes de limpar: você vê a lista do que será apagado.')}</span> : null}
      </div>

      {scanValid && scan ? (
        <div className="flex flex-wrap gap-2">
          <Stat label={t('cleaner.files', 'Arquivos')} value={scan.total.files.toLocaleString()} />
          <Stat label={t('cleaner.size', 'Espaço')} value={fmtBytes(scan.total.bytes)} tone="text-emerald-300" />
          <Stat label={t('cleaner.protected', 'Protegidos (mantidos)')} value={scan.total.protected} />
          <Stat label={t('cleaner.links', 'Links ignorados')} value={scan.total.links} />
        </div>
      ) : null}
      {shred > 0 ? <p className="dh-help">{t('cleaner.shredNote', 'Exclusão segura sobrescreve cada arquivo antes de apagar (mais lento). Em SSD, o controlador pode manter cópias antigas em blocos remapeados: para SSD, o TRIM do Windows já descarta os blocos livres.')}</p> : null}

      {done ? (
        <p className="flex items-start gap-2 text-[13px] text-emerald-300" role="status">
          <CheckCircle size={15} className="mt-0.5 shrink-0" />
          {`${done.total.files.toLocaleString()} ${t('cleaner.doneFiles', 'arquivo(s) apagado(s)')}, ${fmtBytes(done.total.bytes)} ${t('cleaner.freed', 'liberados')}${done.shred ? ` (${done.shred} ${t('cleaner.passes', 'passagem(ns)')})` : ''}. ${done.total.locked + done.total.denied ? `${done.total.locked + done.total.denied} ${t('cleaner.inUse', 'em uso ou sem permissão foram mantidos.')}` : ''}`}
        </p>
      ) : null}

      {confirming && scan ? (
        <ConfirmModal
          title={t('cleaner.confirmTitle', 'Apagar os arquivos analisados?')}
          lines={<>
            <p>{`${scan.total.files.toLocaleString()} ${t('cleaner.files', 'Arquivos').toLowerCase()} · ${fmtBytes(scan.total.bytes)} · ${ids.length} ${t('cleaner.items', 'item(ns)')}`}</p>
            {shred ? <p>{`${t('cleaner.shred', 'Exclusão segura')}: ${shred} ${t('cleaner.passes', 'passagem(ns)')}`}</p> : null}
          </>}
          warn={t('cleaner.confirmWarn', 'Arquivos apagados não vão para a Lixeira. Arquivos em uso são ignorados; senhas, chaves e favoritos dos navegadores nunca são apagados.')}
          ack={t('cleaner.confirmAck', 'Revisei a lista e quero apagar')}
          action={t('cleaner.confirmAction', 'Apagar agora')}
          onConfirm={runClean}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- Navegadores (VACUUM)

function BrowsersTab() {
  const { t } = useI18n();
  const [chosen, setChosen] = useState<Set<string>>(new Set(BROWSERS.map((b) => b.id)));
  const [res, setRes] = useState<CleanerVacuumResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const run = async (apply: boolean) => {
    setBusy(true); setError(null);
    try {
      const r = await api()?.browsers({ browsers: [...chosen], apply, confirm: apply });
      if (r?.ok) setRes(r); else setError(r?.error ?? t('cleaner.vacuumFail', 'Falhou.'));
    } finally { setBusy(false); setConfirming(false); }
  };
  useEffect(() => { void run(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const status = (d: CleanerDb) => ({
    ok: <span className="text-zinc-400">{t('cleaner.db.ok', 'pronto')}</span>,
    vacuumed: <span className="text-emerald-300">{t('cleaner.db.vacuumed', 'compactado')}</span>,
    in_use: <span className="text-amber-300">{t('cleaner.db.inUse', 'em uso (feche o navegador)')}</span>,
    corrupt: <span className="text-red-400">{t('cleaner.db.corrupt', 'falhou na verificação, não alterado')}</span>,
    error: <span className="text-red-400" title={d.error}>{t('cleaner.db.error', 'erro')}</span>
  })[d.status];

  return (
    <div className="space-y-4">
      <p className="dh-help">{t('cleaner.vacuumHelp', 'O VACUUM reconstrói os bancos SQLite do histórico, favicons, cookies e formulários sem as páginas vazias. Nenhum dado é apagado e a operação é atômica. Bancos abertos pelo navegador são pulados: feche o navegador antes.')}</p>
      <div className="flex flex-wrap items-center gap-3">
        {BROWSERS.map((b) => (
          <label key={b.id} className="flex items-center gap-1.5 text-[12.5px] text-zinc-300">
            <input type="checkbox" checked={chosen.has(b.id)} onChange={() => setChosen((s) => { const n = new Set(s); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; })} />{b.label}
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <button type="button" className="dh-btn dh-btn-primary" disabled={busy || !chosen.size} onClick={() => void run(false)}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}{t('cleaner.analyze', 'Analisar (simulação)')}
        </button>
        <button type="button" className="dh-btn" disabled={busy || !res?.total.count} onClick={() => setConfirming(true)}>
          <Eraser size={14} />{t('cleaner.vacuum', 'Compactar (VACUUM)')}
        </button>
      </div>
      <ErrorLine text={error} />
      {res ? (
        res.total.count === 0 ? <p className="dh-help">{t('cleaner.noDbs', 'Nenhum banco de navegador encontrado nos navegadores escolhidos.')}</p> : (
          <>
            <div className="flex flex-wrap gap-2">
              <Stat label={t('cleaner.dbs', 'Bancos')} value={res.total.count} />
              <Stat label={t('cleaner.size', 'Espaço')} value={fmtBytes(res.total.bytes)} />
              <Stat label={res.dry_run ? t('cleaner.reclaimable', 'Recuperável (estimado)') : t('cleaner.saved', 'Recuperado')} value={fmtBytes(res.dry_run ? res.total.reclaimable : res.total.saved)} tone="text-emerald-300" />
              {res.total.in_use ? <Stat label={t('cleaner.inUseCount', 'Em uso')} value={res.total.in_use} tone="text-amber-300" /> : null}
            </div>
            <div className="dh-card overflow-auto max-h-[44vh]">
              <table className="w-full text-[12.5px]">
                <thead className="text-zinc-500 text-left"><tr><th className="p-2">{t('cleaner.browser', 'Navegador')}</th><th className="p-2">{t('cleaner.db', 'Banco')}</th><th className="p-2 text-right">{t('cleaner.size', 'Espaço')}</th><th className="p-2 text-right">{t('cleaner.free', 'Livre')}</th><th className="p-2">{t('cleaner.status', 'Situação')}</th></tr></thead>
                <tbody>
                  {res.databases.map((d) => (
                    <tr key={d.path} className="border-t border-zinc-800/70">
                      <td className="p-2 text-zinc-300">{d.browser} <span className="text-zinc-500">· {d.profile}</span></td>
                      <td className="p-2 font-mono text-zinc-400 break-all" title={d.path}>{d.path.split('\\').pop()}</td>
                      <td className="p-2 text-right font-mono">{fmtBytes(d.after ?? d.bytes)}</td>
                      <td className="p-2 text-right font-mono text-emerald-300/90">{d.status === 'vacuumed' ? `-${fmtBytes(d.saved)}` : fmtBytes(d.reclaimable)}</td>
                      <td className="p-2">{status(d)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      ) : null}
      {confirming ? (
        <ConfirmModal
          title={t('cleaner.vacuumTitle', 'Compactar os bancos dos navegadores?')}
          lines={<p>{`${res?.total.count ?? 0} ${t('cleaner.dbs', 'Bancos').toLowerCase()} · ${fmtBytes(res?.total.reclaimable)} ${t('cleaner.reclaimable', 'Recuperável (estimado)').toLowerCase()}`}</p>}
          warn={t('cleaner.vacuumWarn', 'Feche os navegadores escolhidos antes. Cada banco passa por uma verificação de integridade; se falhar, ele não é alterado.')}
          ack={t('cleaner.vacuumAck', 'Os navegadores estão fechados')}
          action={t('cleaner.vacuum', 'Compactar (VACUUM)')}
          danger={false}
          onConfirm={() => run(true)}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- Registro

const KIND_LABEL: Record<CleanerFinding['kind'], [string, string]> = {
  shared_dll: ['cleaner.kind.shared', 'DLL compartilhada ausente'],
  app_path: ['cleaner.kind.appPath', 'App Path órfão'],
  run: ['cleaner.kind.run', 'Inicialização (Run) apontando para arquivo inexistente'],
  startup_approved: ['cleaner.kind.approved', 'Estado de inicialização sem programa'],
  startup_folder: ['cleaner.kind.folder', 'Atalho de inicialização removido']
};

function RegistryTab({ backupDir }: { backupDir: string | null }) {
  const { t } = useI18n();
  const [findings, setFindings] = useState<CleanerFinding[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<CleanerRegCleanResult | null>(null);
  const [backups, setBackups] = useState<{ name: string; bytes: number; modified: string }[]>([]);
  const [restoreMsg, setRestoreMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadBackups = useCallback(async () => {
    const r = await api()?.listBackups();
    if (r?.ok) setBackups(r.backups);
  }, []);
  const scan = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const r = await api()?.regScan();
      if (r?.ok) { setFindings(r.findings); setSelected(new Set(r.findings.map((f) => f.id))); } else setError(r?.error ?? t('cleaner.regFail', 'Falha ao ler o registro.'));
    } finally { setBusy(false); }
  }, [t]);
  useEffect(() => { void scan(); void loadBackups(); }, [scan, loadBackups]);

  const apply = async () => {
    const r = await api()?.regClean({ ids: [...selected], apply: true, confirm: true });
    setConfirming(false);
    if (r?.ok) { setDone(r); void scan(); void loadBackups(); } else setError(r?.error ?? t('cleaner.regFail', 'Falha ao ler o registro.'));
  };
  const restore = async (name: string) => {
    const r = await api()?.restoreBackup({ name });
    setRestoreMsg(r?.ok ? { ok: true, text: t('cleaner.restored', 'Backup importado no registro.') } : { ok: false, text: r?.error ?? 'erro' });
    void scan();
  };

  const groups = useMemo(() => {
    const m = new Map<CleanerFinding['kind'], CleanerFinding[]>();
    for (const f of findings ?? []) m.set(f.kind, [...(m.get(f.kind) ?? []), f]);
    return [...m.entries()];
  }, [findings]);

  return (
    <div className="space-y-4">
      <p className="dh-help">{t('cleaner.regHelp', 'Procura DLLs compartilhadas que não existem mais, App Paths de programas removidos e entradas de inicialização (Run, StartupApproved, pasta Inicializar) que apontam para arquivos inexistentes. Caminhos em unidades desconectadas não são considerados mortos. Antes de remover qualquer chave, um arquivo .reg de restauração é salvo e conferido.')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="dh-btn dh-btn-primary" disabled={busy} onClick={() => void scan()}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}{t('cleaner.regScan', 'Verificar registro')}
        </button>
        <button type="button" className="dh-btn dh-btn-danger" disabled={!selected.size || busy} onClick={() => setConfirming(true)}>
          <Trash2 size={14} />{t('cleaner.regClean', 'Remover selecionados...')}
        </button>
        {findings ? <span className="text-[12px] text-zinc-500">{`${findings.length} ${t('cleaner.findings', 'entrada(s) encontrada(s)')} · ${selected.size} ${t('cleaner.selected', 'selecionada(s)')}`}</span> : null}
      </div>
      <ErrorLine text={error} />
      {findings && !findings.length ? <p className="flex items-center gap-2 text-[13px] text-emerald-300"><CheckCircle size={14} />{t('cleaner.regClean.none', 'Nenhuma entrada morta encontrada.')}</p> : null}
      {groups.length ? (
        <div className="dh-card divide-y divide-zinc-800/80 max-h-[44vh] overflow-auto">
          {groups.map(([kind, items]) => (
            <div key={kind} className="p-3">
              <div className="dh-section-title mb-2">{t(KIND_LABEL[kind][0], KIND_LABEL[kind][1])} <span className="text-zinc-500">({items.length})</span></div>
              <ul className="space-y-1.5">
                {items.map((f) => (
                  <li key={f.id} className="flex items-start gap-2 text-[12px]">
                    <input type="checkbox" className="mt-0.5" checked={selected.has(f.id)} onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; })} aria-label={f.id} />
                    <div className="min-w-0">
                      <div className="font-mono text-zinc-300 break-all">{f.hive}\{f.key}{f.value !== null ? <span className="text-zinc-50"> → {f.value || '(Padrão)'}</span> : null}</div>
                      <div className="text-zinc-500 break-all">{t('cleaner.missing', 'Inexistente')}: {f.missing}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
      {done ? (
        <div className="space-y-1 text-[13px]" role="status">
          <p className="flex items-start gap-2 text-emerald-300"><CheckCircle size={15} className="mt-0.5 shrink-0" />{`${done.removed} ${t('cleaner.regRemoved', 'entrada(s) removida(s). Backup:')}`} <span className="font-mono text-zinc-200 break-all">{done.backup}</span></p>
          {done.failed?.map((f) => <p key={f.id} className="flex items-start gap-2 text-red-400"><XCircle size={14} className="mt-0.5 shrink-0" />{f.id}: {f.error}</p>)}
        </div>
      ) : null}

      <div className="dh-card p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="dh-section-title">{t('cleaner.backups', 'Backups do registro (.reg)')}</div>
          <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost ml-auto" onClick={() => void api()?.openBackups()}><FolderOpen size={14} />{t('cleaner.openFolder', 'Abrir pasta')}</button>
        </div>
        <p className="text-[11.5px] font-mono text-zinc-500 break-all">{backupDir}</p>
        {backups.length ? (
          <ul className="space-y-1">
            {backups.slice(0, 10).map((b) => (
              <li key={b.name} className="flex items-center gap-2 text-[12px]">
                <span className="font-mono text-zinc-300">{b.name}</span>
                <span className="text-zinc-500">{fmtBytes(b.bytes)}</span>
                <button type="button" className="dh-btn dh-btn-sm ml-auto" onClick={() => void restore(b.name)}><RotateCcw size={13} />{t('cleaner.restore', 'Restaurar')}</button>
              </li>
            ))}
          </ul>
        ) : <p className="dh-help">{t('cleaner.noBackups', 'Nenhum backup ainda.')}</p>}
        {restoreMsg ? <p className={`text-[12.5px] ${restoreMsg.ok ? 'text-emerald-300' : 'text-red-400'}`}>{restoreMsg.text}</p> : null}
      </div>

      {confirming ? (
        <ConfirmModal
          title={t('cleaner.regConfirmTitle', 'Remover as entradas selecionadas do registro?')}
          lines={<p>{`${selected.size} ${t('cleaner.selected', 'selecionada(s)')}`}</p>}
          warn={t('cleaner.regConfirmWarn', 'Um arquivo .reg com o conteúdo atual dessas chaves é salvo e conferido antes de qualquer alteração. Se a gravação do backup falhar, nada é removido. Chaves de HKLM exigem o DarkHub aberto como administrador.')}
          ack={t('cleaner.regConfirmAck', 'Revisei a lista e quero remover com backup')}
          action={t('cleaner.regConfirmAction', 'Salvar backup e remover')}
          onConfirm={apply}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- Definições

function DefsTab({ defs, onChanged }: { defs: CleanerDefinitions | null; onChanged: () => Promise<void> }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const update = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api()?.updateDefinitions();
      setMsg(r?.ok ? { ok: true, text: `${t('cleaner.defs.updated', 'Definições atualizadas')}: ${r.version} · ${r.sections} ${t('cleaner.defs.entries', 'entradas')}` } : { ok: false, text: r?.error ?? 'erro' });
      await onChanged();
    } finally { setBusy(false); }
  };
  const remove = async () => { await api()?.removeDefinitions(); setMsg(null); await onChanged(); };

  return (
    <div className="space-y-4 max-w-3xl">
      <p className="dh-help">{t('cleaner.defs.help', 'O winapp2.ini é uma lista comunitária (CC BY-SA 4.0) com regras de limpeza para milhares de programas. O DarkHub só baixa quando você pede, e trata o arquivo como dado não confiável: nada nele é executado, chaves de registro (RegKey) são ignoradas e cada caminho é conferido. Só são aceitas pastas de cache, logs e temporários em AppData, Temp, ProgramData e logs do Windows; senhas, chaves e favoritos dos navegadores nunca entram.')}</p>
      <div className="dh-card p-4 space-y-1.5 text-[12.5px]">
        {defs?.installed ? (
          <>
            <div><span className="text-zinc-500">{t('cleaner.defs.version', 'Versão')}:</span> <span className="font-mono text-zinc-200">{defs.version ?? '-'}</span></div>
            <div><span className="text-zinc-500">{t('cleaner.defs.entries', 'entradas')}:</span> <span className="font-mono text-zinc-200">{defs.sections?.toLocaleString() ?? '-'}</span></div>
            <div><span className="text-zinc-500">{t('cleaner.defs.date', 'Baixado em')}:</span> <span className="font-mono text-zinc-200">{defs.downloadedAt ? new Date(defs.downloadedAt).toLocaleString() : '-'}</span></div>
            <div><span className="text-zinc-500">SHA-256:</span> <span className="font-mono text-zinc-400 break-all">{defs.sha256 ?? '-'}</span></div>
            <div><span className="text-zinc-500">{t('cleaner.defs.source', 'Origem')}:</span> <span className="font-mono text-zinc-400 break-all">{defs.url ?? '-'}</span></div>
          </>
        ) : <p className="text-zinc-400">{t('cleaner.defs.none', 'Nenhuma definição baixada. Só os itens embutidos do DarkHub estão disponíveis.')}</p>}
      </div>
      <div className="flex gap-2">
        <button type="button" className="dh-btn dh-btn-primary" disabled={busy} onClick={() => void update()}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <DownloadCloud size={14} />}{t('cleaner.defs.update', 'Atualizar definições')}
        </button>
        {defs?.installed ? <button type="button" className="dh-btn dh-btn-ghost" disabled={busy} onClick={() => void remove()}><Trash2 size={14} />{t('cleaner.defs.remove', 'Remover definições')}</button> : null}
      </div>
      {msg ? <p className={`text-[12.5px] ${msg.ok ? 'text-emerald-300' : 'text-red-400'}`} role="status">{msg.text}</p> : null}
    </div>
  );
}
