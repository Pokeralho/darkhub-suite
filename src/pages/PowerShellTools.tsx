import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, CheckCircle, FileCode, Loader2, Lock, Play, RefreshCw,
  ShieldAlert, ShieldCheck, Terminal, XCircle
} from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';

type PolicyResult = Awaited<ReturnType<Window['darkhub']['powershell']['getPolicies']>>;
type ScriptItem = NonNullable<Awaited<ReturnType<Window['darkhub']['powershell']['listScripts']>>['scripts']>[number];
type RunResult = Awaited<ReturnType<Window['darkhub']['powershell']['runScript']>>;

const api = () => window.darkhub?.powershell;

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-zinc-900 border border-zinc-800 rounded-xl p-4 ${className}`}>{children}</div>
);

const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition disabled:opacity-40 disabled:cursor-not-allowed';
const btnGhost = `${btn} bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 border-zinc-700/60`;
const btnPrimary = `${btn} bg-[#3b82f6] hover:bg-blue-500 text-white border-blue-500/50`;
const btnAmber = `${btn} bg-amber-600/90 hover:bg-amber-500 text-white border-amber-500/50`;

const SIG_STYLE: Record<string, string> = {
  Valid: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  NotSigned: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  HashMismatch: 'bg-red-500/10 text-red-300 border-red-500/30',
  UnknownError: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  Unknown: 'bg-zinc-800 text-zinc-400 border-zinc-700'
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pol, scr] = await Promise.all([api()?.getPolicies(), api()?.listScripts()]);
      if (pol) setPolicy(pol);
      if (!pol?.ok) setError(pol?.error || t('pstools.error', 'Failed to read the execution policy.'));
      if (scr?.ok) {
        setScripts(scr.scripts ?? []);
        setRootExists(scr.rootExists !== false);
        if (scr.root) setRoot(scr.root);
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const runScript = async (path: string) => {
    setRunningPath(path);
    setOutput(null);
    try {
      const r = await api()?.runScript({ path });
      setOutput(r ?? { ok: false, error: t('pstools.runFail', 'Failed to run the script.') });
    } catch (e: any) {
      setOutput({ ok: false, error: e?.message ?? String(e) });
    } finally {
      setRunningPath(null);
    }
  };

  const openElevated = async () => {
    setElevating(true);
    setElevated(null);
    try {
      const r = await api()?.openElevatedTerminal({});
      setElevated(r?.ok ? { ok: true, message: t('pstools.elevated.ok', 'Elevated terminal opened.') } : { ok: false, message: r?.error || t('pstools.elevated.error', '') });
    } catch (e: any) {
      setElevated({ ok: false, message: e?.message ?? String(e) });
    } finally {
      setElevating(false);
      window.setTimeout(() => setElevated(null), 5000);
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
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
      <div className="min-w-0">
        <h1 className="text-lg font-bold text-zinc-100 tracking-tight flex items-center gap-2">
          <Terminal className="w-5 h-5 text-[#3b82f6]" />
          {t('pstools.title', 'PowerShell Tools')}
        </h1>
        <p className="text-xs text-zinc-400 mt-0.5">{t('pstools.subtitle', '')}</p>
      </div>
      <button onClick={load} disabled={loading} className={btnGhost}>
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        {t('pstools.refresh', 'Refresh')}
      </button>
    </div>
  );

  return (
    <div className="w-full max-w-5xl mx-auto space-y-4 p-1 md:p-2 text-zinc-100 pb-16">
      {header}

      {error ? <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300 break-words">{error}</div> : null}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-zinc-400"><Loader2 className="w-4 h-4 animate-spin" />...</div>
      ) : null}

      {/* Execution policy */}
      <Card>
        <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-zinc-400" />{t('pstools.policy.title', 'Execution policy')}</h2>
        {policy?.effective ? (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">{t('pstools.policy.effective', 'Effective policy')}</span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#3b82f6]/10 text-blue-300 border border-blue-500/30">{policy.effective.policy}</span>
            <span className="text-[10.5px] font-mono text-zinc-500">({policy.effective.scope})</span>
          </div>
        ) : null}
        {policyNote(policy?.effective?.policy) ? <p className="mt-2 text-[11px] text-zinc-400">{policyNote(policy?.effective?.policy)}</p> : null}
        {policy?.scopes?.length ? (
          <div className="mt-3 overflow-hidden rounded-lg border border-zinc-800">
            <table className="w-full text-xs">
              <thead className="bg-zinc-950/60 text-zinc-500">
                <tr><th className="text-left px-3 py-1.5 font-medium">{t('pstools.policy.scope', 'Scope')}</th><th className="text-left px-3 py-1.5 font-medium">{t('pstools.policy.value', 'Policy')}</th></tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {policy.scopes.map((s) => (
                  <tr key={s.scope}><td className="px-3 py-1.5 font-mono text-zinc-300">{s.scope}</td><td className="px-3 py-1.5 font-mono text-zinc-400">{s.policy}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <p className="mt-3 text-[11px] text-zinc-500 leading-relaxed">{t('pstools.policy.explain', '')}</p>
      </Card>

      {/* Trusted maintenance scripts */}
      <Card>
        <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2"><FileCode className="w-4 h-4 text-zinc-400" />{t('pstools.scripts.title', 'DarkOS maintenance scripts')}</h2>
        <p className="mt-1 text-[11px] text-zinc-500 font-mono">{root}</p>
        <p className="mt-1 text-[11px] text-zinc-500">{t('pstools.scripts.hint', '')}</p>
        {!rootExists ? (
          <p className="mt-3 text-xs text-zinc-500">{t('pstools.scripts.noRoot', '')}</p>
        ) : scripts.length === 0 ? (
          <p className="mt-3 text-xs text-zinc-500">{t('pstools.scripts.none', 'No maintenance script found.')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-800/70">
            {scripts.map((s) => {
              const st = s.signature?.status || 'Unknown';
              const unsigned = st !== 'Valid';
              return (
                <li key={s.path} className="py-2.5 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-zinc-200 truncate">{s.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${SIG_STYLE[st] || SIG_STYLE.Unknown}`}>{sigLabel(st)}</span>
                    </div>
                    <div className="mt-0.5 text-[10.5px] font-mono text-zinc-600 truncate">{s.path}</div>
                    {s.signature?.signer ? <div className="mt-0.5 text-[10.5px] text-zinc-500 truncate">{s.signature.signer}</div> : null}
                    {unsigned ? <div className="mt-0.5 text-[11px] text-amber-300/90 flex items-center gap-1"><ShieldAlert className="w-3 h-3" />{t('pstools.sig.unsignedWarn', '')}</div> : null}
                  </div>
                  <button
                    disabled={runningPath !== null}
                    onClick={() => runScript(s.path)}
                    className={`${unsigned ? btnAmber : btnPrimary} shrink-0`}
                  >
                    {runningPath === s.path ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    {runningPath === s.path ? t('pstools.scripts.running', 'Running...') : t('pstools.scripts.run', 'Run')}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Output */}
      {output ? (
        <Card>
          <div className="flex items-center gap-2">
            {output.ok ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
            <h2 className="text-sm font-semibold text-zinc-100">{t('pstools.output.title', 'Output')}</h2>
            {typeof output.code === 'number' ? <span className="text-[10.5px] font-mono text-zinc-500">{t('pstools.output.exit', 'Exit code')}: {output.code}</span> : null}
          </div>
          {output.error ? <div className="mt-2 text-xs text-red-300 break-words">{output.error}</div> : null}
          <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-zinc-950 border border-zinc-800 p-3 text-[11px] font-mono text-zinc-300 whitespace-pre-wrap break-words">
            {(output.stdout || '').trim() || (output.stderr || '').trim() || t('pstools.output.empty', 'No output yet.')}
          </pre>
        </Card>
      ) : null}

      {/* Elevated terminal */}
      <Card>
        <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2"><Lock className="w-4 h-4 text-amber-400" />{t('pstools.elevated.title', 'Administrator terminal')}</h2>
        <p className="mt-1 text-xs text-zinc-400 leading-relaxed">{t('pstools.elevated.desc', '')}</p>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <button disabled={elevating} onClick={openElevated} className={btnAmber}>
            {elevating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Terminal className="w-3.5 h-3.5" />}
            {elevating ? t('pstools.elevated.opening', 'Waiting for UAC...') : t('pstools.elevated.open', 'Open elevated terminal')}
          </button>
          <span className="text-[10px] inline-flex items-center gap-1 text-amber-300/90"><ShieldAlert className="w-3 h-3" />{t('pstools.adminNote', 'Requires administrator')}</span>
        </div>
        {elevated ? (
          <div className={`mt-2 text-xs flex items-center gap-1.5 ${elevated.ok ? 'text-emerald-300' : 'text-red-300'}`}>
            {elevated.ok ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}{elevated.message}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
