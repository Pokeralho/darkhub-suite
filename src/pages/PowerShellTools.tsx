import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle, Code, Cpu, FileCode, FolderOpen, HardDrive, Home, Loader2, Lock, Network, Package, Play, RefreshCw,
  ShieldAlert, ShieldCheck, Terminal, Wrench, XCircle
} from '../components/icons';
import { useI18n } from '../i18n/I18nProvider';
import { DarkOSConfirmDialog } from '../components/darkos/DarkOSConfirmDialog';
import PageHeader from '../components/ui/PageHeader';
import ToolCategory from '../components/pstools/ToolCategory';
import CustomScriptRunner from '../components/pstools/CustomScriptRunner';
import { PS_SCHEMA } from '../components/pstools/psSchema';

type TabId = 'overview' | 'system' | 'apps' | 'disk' | 'network' | 'maintenance' | 'custom';
const TAB_ICONS: Record<TabId, typeof Home> = { overview: Home, system: Cpu, apps: Package, disk: HardDrive, network: Network, maintenance: Wrench, custom: Code };
const TAB_KEY = 'darkhub.pstools.tab';

type PolicyResult = Awaited<ReturnType<Window['darkhub']['powershell']['getPolicies']>>;
type ScriptItem = NonNullable<Awaited<ReturnType<Window['darkhub']['powershell']['listScripts']>>['scripts']>[number];
type RunResult = Awaited<ReturnType<Window['darkhub']['powershell']['runScript']>>;

const api = () => window.darkhub?.powershell;

const SIG_TONE: Record<string, string> = {
  Valid: 'text-emerald-400',
  NotSigned: 'text-amber-300',
  HashMismatch: 'text-red-400',
  UnknownError: 'text-amber-300',
  Unknown: 'text-zinc-500'
};

export default function PowerShellTools() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [policy, setPolicy] = useState<PolicyResult | null>(null);
  const [scripts, setScripts] = useState<ScriptItem[]>([]);
  const [rootExists, setRootExists] = useState(true);
  const [root, setRoot] = useState('C:\\ProgramData\\DarkOS');
  const [error, setError] = useState<string | null>(null);
  const [runningPath, setRunningPath] = useState<string | null>(null);
  const [output, setOutput] = useState<RunResult | null>(null);
  const [elevated, setElevated] = useState<{ ok: boolean; message: string } | null>(null);
  const [elevating, setElevating] = useState(false);
  // Script awaiting the user's explicit confirmation before it runs.
  const [pending, setPending] = useState<ScriptItem | null>(null);
  const [tab, setTab] = useState<TabId>(() => {
    try { const v = localStorage.getItem(TAB_KEY) as TabId | null; return v && v in TAB_ICONS ? v : 'overview'; } catch { return 'overview'; }
  });
  const [termPath, setTermPath] = useState('');
  const [termShell, setTermShell] = useState<'powershell' | 'pwsh'>('powershell');
  const [termProfile, setTermProfile] = useState(false);
  const selectTab = (id: TabId) => { setTab(id); try { localStorage.setItem(TAB_KEY, id); } catch { /* storage blocked */ } };
  const mounted = useRef(true);
  const elevatedTimer = useRef<number | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (elevatedTimer.current !== null) window.clearTimeout(elevatedTimer.current);
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pol, scr] = await Promise.all([api()?.getPolicies(), api()?.listScripts()]);
      if (!mounted.current) return;
      if (pol) setPolicy(pol);
      const errors: string[] = [];
      if (!pol?.ok) errors.push(pol?.error || t('pstools.error', 'Failed to read the execution policy.'));
      if (scr?.ok) {
        setScripts(scr.scripts ?? []);
        setRootExists(scr.rootExists !== false);
        if (scr.root) setRoot(scr.root);
      } else {
        setScripts([]);
        errors.push((scr as { error?: string } | undefined)?.error || t('pstools.scripts.error', 'Failed to list the maintenance scripts.'));
      }
      setError(errors.length ? errors.join(' ') : null);
    } catch (e: any) {
      if (mounted.current) setError(e?.message ?? String(e));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const runScript = async (item: ScriptItem) => {
    setPending(null);
    setRunningPath(item.path);
    setOutput(null);
    try {
      // The user confirmed in the dialog; the main process still refuses unsigned scripts without this flag.
      const payload = { path: item.path, confirmUnsigned: item.signature?.status !== 'Valid' };
      const r = await api()?.runScript(payload);
      if (mounted.current) setOutput(r ?? { ok: false, error: t('pstools.runFail', 'Failed to run the script.') });
    } catch (e: any) {
      if (mounted.current) setOutput({ ok: false, error: e?.message ?? String(e) });
    } finally {
      if (mounted.current) setRunningPath(null);
    }
  };

  const openElevated = async () => {
    setElevating(true);
    setElevated(null);
    if (elevatedTimer.current !== null) window.clearTimeout(elevatedTimer.current);
    try {
      const r = await api()?.openElevatedTerminal({ startingPath: termPath.trim() || undefined, shell: termShell, loadProfile: termProfile });
      if (!mounted.current) return;
      setElevated(r?.ok ? { ok: true, message: t('pstools.elevated.ok', 'Elevated terminal opened.') } : { ok: false, message: r?.error || t('pstools.elevated.error', '') });
    } catch (e: any) {
      if (mounted.current) setElevated({ ok: false, message: e?.message ?? String(e) });
    } finally {
      if (mounted.current) {
        setElevating(false);
        elevatedTimer.current = window.setTimeout(() => { elevatedTimer.current = null; setElevated(null); }, 5000);
      }
    }
  };

  const sigLabel = (status: string) => t(`pstools.sig.${status}`, status);
  const policyNote = (p?: string) => {
    const map: Record<string, string> = {
      Restricted: 'pstools.policy.explainRestricted',
      RemoteSigned: 'pstools.policy.explainRemoteSigned',
      AllSigned: 'pstools.policy.explainAllSigned',
      Unrestricted: 'pstools.policy.explainUnrestricted',
      Bypass: 'pstools.policy.explainUnrestricted'
    };
    return p && map[p] ? t(map[p], '') : '';
  };

  const header = (
    <PageHeader
      title={t('pstools.title', 'PowerShell Tools')}
      subtitle={t('psx.subtitle', 'Política de execução, scripts do DarkOS, relatórios do sistema, ferramentas de disco e rede, manutenção e scripts personalizados.')}
      actions={tab !== 'overview' ? undefined : (
        <button onClick={load} disabled={loading} className="dh-btn">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {t('pstools.refresh', 'Refresh')}
        </button>
      )}
    />
  );

  const skeletonRows = (n: number) => (
    <div role="status" aria-label={t('pstools.loading', 'Loading...')} className="divide-y divide-zinc-800/80">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="px-4 py-3 flex items-center gap-3">
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-48 max-w-full rounded bg-zinc-800/80 animate-pulse" />
            <div className="h-3 w-72 max-w-full rounded bg-zinc-800/80 animate-pulse" />
          </div>
          <div className="h-7 w-16 rounded-md bg-zinc-800/80 animate-pulse" />
        </div>
      ))}
    </div>
  );

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'overview', label: t('psx.tab.overview', 'Visão geral') },
    ...PS_SCHEMA.categories.map((c) => ({ id: c.id as TabId, label: t(`psx.tab.${c.id}`, c.label) })),
    { id: 'custom', label: t('psx.tab.custom', 'Script personalizado') }
  ];

  return (
    <div className="w-full max-w-6xl pb-16 space-y-8">
      {header}

      <div role="tablist" aria-label={t('pstools.title', 'PowerShell Tools')} className="-mt-3 flex gap-5 border-b border-zinc-800/80 overflow-x-auto overflow-y-hidden custom-scrollbar">
        {tabs.map(({ id, label }) => {
          const Icon = TAB_ICONS[id];
          const active = tab === id;
          return (
            <button
              key={id} role="tab" aria-selected={active} onClick={() => selectTab(id)}
              className={`relative h-9 inline-flex items-center gap-2 text-[13px] whitespace-nowrap border-b-2 -mb-px transition-colors ${active ? 'border-blue-400 text-zinc-50' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
            >
              <Icon size={15} className={active ? 'text-blue-300' : 'text-zinc-500'} />{label}
            </button>
          );
        })}
      </div>

      {tab === 'custom' ? <CustomScriptRunner /> : null}
      {tab !== 'overview' && tab !== 'custom' ? <ToolCategory key={tab} category={tab} /> : null}

      {tab === 'overview' ? (<>

      {error ? (
        <div role="alert" className="-mt-4 flex items-start gap-2 border-l-2 border-red-400 pl-3 py-1 text-[12.5px] text-red-300 break-words">
          <XCircle size={14} className="shrink-0 mt-0.5" />
          <span className="min-w-0">{error}</span>
          <button onClick={load} disabled={loading} className="ml-1 underline underline-offset-2 text-red-200 hover:text-red-100 shrink-0">{t('pstools.refresh', 'Refresh')}</button>
        </div>
      ) : null}

      {/* Execution policy */}
      <section>
        <div className="flex items-end justify-between gap-3 mb-3">
          <div className="min-w-0 max-w-[75ch]">
            <h2 className="dh-section-title">{t('pstools.policy.title', 'Execution policy')}</h2>
            {policyNote(policy?.effective?.policy) ? <p className="mt-1 dh-help">{policyNote(policy?.effective?.policy)}</p> : null}
          </div>
          {policy?.effective ? (
            <div className="shrink-0 text-right">
              <div className="text-[11.5px] text-zinc-500">{t('pstools.policy.effective', 'Effective policy')}</div>
              <div className="mt-0.5 font-mono text-[13px] text-blue-300">
                {policy.effective.policy} <span className="text-[11.5px] text-zinc-500">{policy.effective.scope}</span>
              </div>
            </div>
          ) : null}
        </div>
        {loading && !policy ? <div className="dh-card overflow-hidden">{skeletonRows(3)}</div> : policy?.scopes?.length ? (
        <div className="dh-card overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-zinc-800/80 text-[11px] text-zinc-500">
                  <th className="text-left px-4 py-2 font-medium">{t('pstools.policy.scope', 'Scope')}</th>
                  <th className="text-left px-4 py-2 font-medium">{t('pstools.policy.value', 'Policy')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {policy.scopes.map((s) => (
                  <tr key={s.scope} className={policy.effective?.scope === s.scope ? 'text-zinc-100' : ''}>
                    <td className="px-4 py-2 font-mono text-zinc-300">{s.scope}</td>
                    <td className="px-4 py-2 font-mono text-zinc-400">{s.policy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>
        ) : null}
        <p className="mt-2 dh-help max-w-[75ch]">{t('pstools.policy.explain', '')}</p>
      </section>

      {/* Trusted maintenance scripts */}
      <section>
        <div className="mb-3 min-w-0 max-w-[75ch]">
          <h2 className="dh-section-title">
            {t('pstools.scripts.title', 'DarkOS maintenance scripts')}
            {!loading && scripts.length ? <span className="ml-1.5 font-mono text-[11.5px] font-normal text-zinc-500">{scripts.length}</span> : null}
          </h2>
          <p className="mt-1 dh-help">{t('pstools.scripts.hint', '')}</p>
          <p className="mt-1 font-mono text-[11.5px] text-zinc-500 break-all">{root}</p>
        </div>
        <div className="dh-card">
          {loading && scripts.length === 0 ? skeletonRows(3) : !rootExists ? (
            <p className="px-4 py-6 text-[12.5px] text-zinc-500">{t('pstools.scripts.noRoot', '')}</p>
          ) : scripts.length === 0 ? (
            <p className="px-4 py-6 text-[12.5px] text-zinc-500">{t('pstools.scripts.none', 'No maintenance script found.')}</p>
          ) : (
            <ul className="divide-y divide-zinc-800/80">
              {scripts.map((s) => {
                const st = s.signature?.status || 'Unknown';
                const unsigned = st !== 'Valid';
                return (
                  <li key={s.path} className="px-4 py-3 flex items-start gap-3">
                    <FileCode size={16} className="text-zinc-500 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-[13px] text-zinc-200 truncate">{s.name}</span>
                        <span className={`inline-flex items-center gap-1 text-[11.5px] ${SIG_TONE[st] || SIG_TONE.Unknown}`}>
                          {st === 'Valid' ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}{sigLabel(st)}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11.5px] font-mono text-zinc-600 truncate">{s.path}</div>
                      {s.signature?.signer ? <div className="mt-0.5 text-[11.5px] text-zinc-500 truncate">{s.signature.signer}</div> : null}
                      {unsigned ? <div className="mt-1 text-[12px] text-amber-300/90">{t('pstools.sig.unsignedWarn', '')}</div> : null}
                    </div>
                    <button
                      disabled={runningPath !== null || loading}
                      onClick={() => setPending(s)}
                      aria-label={`${t('pstools.scripts.run', 'Run')} ${s.name}`}
                      aria-busy={runningPath === s.path}
                      className="dh-btn dh-btn-sm shrink-0"
                    >
                      {runningPath === s.path ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                      {runningPath === s.path ? t('pstools.scripts.running', 'Running...') : t('pstools.scripts.run', 'Run')}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Output */}
      {output ? (
        <section className="dh-card overflow-hidden animate-in">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800/80" aria-live="polite">
            {output.ok ? <CheckCircle size={14} className="text-emerald-400" /> : <XCircle size={14} className="text-red-400" />}
            <h2 className="dh-section-title">{t('pstools.output.title', 'Output')}</h2>
            {typeof output.code === 'number' ? (
              <span className="ml-auto text-[11.5px] text-zinc-500">{t('pstools.output.exit', 'Exit code')} <span className={`font-mono ${output.code === 0 ? 'text-zinc-300' : 'text-red-300'}`}>{output.code}</span></span>
            ) : null}
          </div>
          {output.error ? <div className="px-4 pt-3 text-[12.5px] text-red-300 break-words">{output.error}</div> : null}
          <pre className="max-h-72 overflow-auto bg-zinc-950 px-4 py-3 text-[11.5px] leading-[1.65] font-mono text-zinc-400 whitespace-pre-wrap break-words">
            {[(output.stdout || '').trim(), (output.stderr || '').trim()].filter(Boolean).join('\n\n') || t('pstools.output.empty', 'No output yet.')}
          </pre>
        </section>
      ) : null}

      <DarkOSConfirmDialog
        open={pending !== null}
        danger={pending ? pending.signature?.status !== 'Valid' : false}
        title={t('pstools.confirm.title', 'Run this script?')}
        body={pending ? (
          <>
            <span className="block font-mono text-zinc-300 break-all">{pending.path}</span>
            <span className="block mt-2">
              {pending.signature?.status === 'Valid'
                ? t('pstools.confirm.signed', 'The script has a valid digital signature and will run with this app\'s privileges.')
                : t('pstools.confirm.unsigned', 'This script has no valid digital signature. Only run it if you reviewed its content and trust its origin.')}
            </span>
          </>
        ) : null}
        confirmLabel={t('pstools.scripts.run', 'Run')}
        onCancel={() => setPending(null)}
        onConfirm={() => { if (pending) runScript(pending); }}
      />

      {/* Elevated terminal */}
      <section className="border-t border-zinc-800/80 pt-6 flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="min-w-0 max-w-[75ch]">
          <h2 className="dh-section-title flex items-center gap-2">
            {t('pstools.elevated.title', 'Administrator terminal')}
            <span className="inline-flex items-center gap-1 text-[11.5px] font-normal text-amber-300/90"><Lock size={12} />{t('pstools.adminNote', 'Requires administrator')}</span>
          </h2>
          <p className="mt-1 dh-help">{t('pstools.elevated.desc', '')}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              className="dh-input w-72 max-w-full font-mono" spellCheck={false} value={termPath} onChange={(e) => setTermPath(e.target.value)}
              placeholder={root} aria-label={t('psx.term.folder', 'Pasta inicial')}
            />
            <button className="dh-btn" onClick={async () => { const r = await api()?.pickFolder?.({}); if (r?.ok && r.path) setTermPath(r.path); }}>
              <FolderOpen size={14} />{t('psx.form.choose', 'Escolher')}
            </button>
            <select className="dh-input" value={termShell} onChange={(e) => setTermShell(e.target.value as 'powershell' | 'pwsh')} aria-label={t('psx.term.shell', 'Shell')}>
              <option value="powershell">Windows PowerShell 5.1</option>
              <option value="pwsh">PowerShell 7 (pwsh)</option>
            </select>
            <label className="inline-flex items-center gap-2 text-[12.5px] text-zinc-300 cursor-pointer select-none">
              <input type="checkbox" className="accent-blue-400" checked={termProfile} onChange={(e) => setTermProfile(e.target.checked)} />
              {t('psx.term.profile', 'Carregar perfil ($PROFILE)')}
            </label>
          </div>
          {elevated ? (
            <p role="status" className={`mt-2 text-[12.5px] flex items-center gap-1.5 ${elevated.ok ? 'text-emerald-400' : 'text-red-300'}`}>
              {elevated.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}{elevated.message}
            </p>
          ) : null}
        </div>
        <button disabled={elevating} onClick={openElevated} className="dh-btn shrink-0">
          {elevating ? <Loader2 size={14} className="animate-spin" /> : <Terminal size={14} />}
          {elevating ? t('pstools.elevated.opening', 'Waiting for UAC...') : t('pstools.elevated.open', 'Open elevated terminal')}
        </button>
      </section>
      </>) : null}
    </div>
  );
}
