import React, { useMemo, useRef, useState } from 'react';
import { Code, Loader2, Lock, Play, RotateCcw, ShieldAlert, ShieldCheck } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';
import { DarkOSConfirmDialog } from '../darkos/DarkOSConfirmDialog';
import type { PsToolResult } from '../../global';
import ToolForm from './ToolForm';
import ResultView from './ResultView';
import HostsEditor from './HostsEditor';
import { defaultsFor, flagsFor, toPayload, toolById, toolsIn, validateAll, type ParamValues, type ToolDef } from './psSchema';

const api = () => window.darkhub?.powershell;

interface Pending { tool: ToolDef; params: ParamValues; preview: string; admin: boolean; mutating: boolean; resultFor: string }

/** One catalog category: tool list on the left, the selected tool's form + result on the right. */
export default function ToolCategory({ category }: { category: string }) {
  const { t } = useI18n();
  const tools = useMemo(() => toolsIn(category), [category]);
  const [selected, setSelected] = useState(tools[0]?.id || '');
  const [values, setValues] = useState<Record<string, ParamValues>>({});
  const [results, setResults] = useState<Record<string, PsToolResult>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, string | null>>({});
  const [pending, setPending] = useState<Pending | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, Record<string, string>>>({});
  const mounted = useRef(true);
  React.useEffect(() => () => { mounted.current = false; }, []);

  const tool = tools.find((x) => x.id === selected) || tools[0];
  if (!tool) return null;
  const vals = values[tool.id] || defaultsFor(tool);
  const errors = { ...validateAll(tool, vals), ...(serverErrors[tool.id] || {}) };
  const flags = flagsFor(tool, vals);
  const hasErrors = Object.keys(validateAll(tool, vals)).length > 0;

  const setVal = (key: string, v: string | number | boolean) => {
    setValues((all) => ({ ...all, [tool.id]: { ...(all[tool.id] || defaultsFor(tool)), [key]: v } }));
    setServerErrors((e) => ({ ...e, [tool.id]: {} }));
    setPreview((p) => ({ ...p, [tool.id]: null }));
  };

  const execute = async (target: ToolDef, params: ParamValues, confirm: boolean, resultFor = target.id) => {
    setRunning(resultFor);
    try {
      const r = await api()?.runTool({ id: target.id, params: toPayload(target, params), confirm });
      if (!mounted.current) return;
      if (r?.errors) setServerErrors((e) => ({ ...e, [target.id]: r.errors as Record<string, string> }));
      if (r?.needsConfirmation) {
        setPending({ tool: target, params, preview: r.preview || '', admin: !!r.admin, mutating: !!r.mutating, resultFor });
        return;
      }
      setResults((all) => ({ ...all, [resultFor]: r ?? { ok: false, error: t('psx.noBackend', 'Backend indisponível (abra pelo app).') } }));
    } catch (e: any) {
      if (mounted.current) setResults((all) => ({ ...all, [resultFor]: { ok: false, error: e?.message ?? String(e) } }));
    } finally {
      if (mounted.current) setRunning(null);
    }
  };

  const run = async (target: ToolDef = tool, params: ParamValues = vals, resultFor = target.id) => {
    const f = flagsFor(target, params);
    if (f.admin || f.mutating) {
      // Show exactly what will run before anything changes or a UAC prompt appears.
      const p = await api()?.previewTool({ id: target.id, params: toPayload(target, params) });
      if (!p?.ok) {
        if (p?.errors) setServerErrors((e) => ({ ...e, [target.id]: p.errors as Record<string, string> }));
        setResults((all) => ({ ...all, [resultFor]: { ok: false, error: p?.error || t('psx.noBackend', 'Backend indisponível (abra pelo app).') } }));
        return;
      }
      setPending({ tool: target, params, preview: p.preview || '', admin: !!p.admin, mutating: !!p.mutating, resultFor });
      return;
    }
    execute(target, params, false, resultFor);
  };

  const togglePreview = async () => {
    if (preview[tool.id]) { setPreview((p) => ({ ...p, [tool.id]: null })); return; }
    const p = await api()?.previewTool({ id: tool.id, params: toPayload(tool, vals) });
    setPreview((all) => ({ ...all, [tool.id]: p?.ok ? (p.preview || '') : (p?.error || t('psx.noBackend', 'Backend indisponível (abra pelo app).')) }));
  };

  const upgrade = (id: string | null) => {
    const up = toolById('wingetUpgrade');
    if (!up) return;
    run(up, { id: id || '', all: id === null }, 'wingetUpgrades:upgrade');
  };

  const badge = (x: ToolDef) => {
    const f = flagsFor(x, values[x.id] || defaultsFor(x));
    if (f.mutating) return <span className="inline-flex items-center gap-1 text-[11px] text-amber-300/90"><ShieldAlert size={11} />{t('psx.badge.changes', 'Altera o sistema')}</span>;
    if (f.admin) return <span className="inline-flex items-center gap-1 text-[11px] text-amber-300/90"><Lock size={11} />{t('psx.badge.admin', 'Administrador')}</span>;
    return <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500"><ShieldCheck size={11} />{t('psx.badge.readOnly', 'Somente leitura')}</span>;
  };

  const result = results[tool.id];
  const upgradeResult = tool.id === 'wingetUpgrades' ? results['wingetUpgrades:upgrade'] : undefined;

  return (
    <div className="flex flex-col lg:flex-row gap-5 items-start">
      <nav aria-label={t('psx.toolList', 'Ferramentas')} className="w-full lg:w-60 shrink-0 dh-card overflow-hidden">
        <ul className="divide-y divide-zinc-800/80">
          {tools.map((x) => {
            const active = x.id === tool.id;
            return (
              <li key={x.id}>
                <button
                  onClick={() => setSelected(x.id)} aria-current={active ? 'true' : undefined}
                  className={`w-full text-left px-3.5 py-2.5 transition-colors ${active ? 'bg-zinc-800/60' : 'hover:bg-zinc-900/60'}`}
                >
                  <div className={`text-[13px] ${active ? 'text-zinc-50' : 'text-zinc-300'}`}>{t(`psx.tool.${x.id}.name`, x.name)}</div>
                  <div className="mt-0.5">{badge(x)}</div>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex-1 min-w-0 space-y-4 w-full">
        <section className="dh-card p-4 space-y-4">
          <div className="min-w-0 max-w-[75ch]">
            <h2 className="dh-section-title flex items-center gap-2 flex-wrap">{t(`psx.tool.${tool.id}.name`, tool.name)} {badge(tool)}</h2>
            <p className="mt-1 dh-help">{t(`psx.tool.${tool.id}.desc`, tool.desc)}</p>
          </div>
          {tool.output === 'hosts' ? <HostsEditor /> : (
            <>
              <ToolForm tool={tool} values={vals} errors={errors} disabled={running !== null} onChange={setVal} />
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <button className={`dh-btn ${flags.mutating ? 'dh-btn-danger' : 'dh-btn-primary'}`} disabled={running !== null || hasErrors} onClick={() => run()}>
                  {running === tool.id ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  {running === tool.id ? t('psx.running', 'Executando...') : flags.mutating ? t('psx.runChanges', 'Revisar e executar') : t('psx.run', 'Executar')}
                </button>
                <button className="dh-btn dh-btn-ghost" onClick={togglePreview}><Code size={14} />{preview[tool.id] ? t('psx.hideCommand', 'Ocultar comando') : t('psx.showCommand', 'Ver comando')}</button>
                {tool.params.length ? (
                  <button className="dh-btn dh-btn-ghost" disabled={running !== null} onClick={() => { setValues((a) => ({ ...a, [tool.id]: defaultsFor(tool) })); setServerErrors((e) => ({ ...e, [tool.id]: {} })); }}>
                    <RotateCcw size={14} />{t('psx.reset', 'Restaurar padrões')}
                  </button>
                ) : null}
                {flags.admin ? <span className="text-[11.5px] text-zinc-500">{t('psx.uacNote', 'O Windows vai pedir permissão de administrador (UAC).')}</span> : null}
              </div>
              {preview[tool.id] ? (
                <pre className="max-h-64 overflow-auto rounded-md bg-zinc-950 border border-zinc-800/80 px-3 py-2 text-[11px] leading-[1.6] font-mono text-zinc-400 whitespace-pre-wrap break-words">{preview[tool.id]}</pre>
              ) : null}
            </>
          )}
        </section>

        {upgradeResult ? <ResultView result={upgradeResult} toolId="wingetUpgrade" toolName="winget-upgrade" /> : null}
        {result && tool.output !== 'hosts' ? (
          <ResultView
            result={result} toolId={tool.id} toolName={t(`psx.tool.${tool.id}.name`, tool.name)}
            rowAction={tool.rowAction} onUpgrade={tool.rowAction === 'wingetUpgrade' ? upgrade : undefined}
            busy={running !== null}
          />
        ) : null}
      </div>

      <DarkOSConfirmDialog
        open={pending !== null}
        danger={pending?.mutating}
        title={pending?.mutating ? t('psx.confirm.changesTitle', 'Confirmar alteração no sistema') : t('psx.confirm.adminTitle', 'Executar como administrador?')}
        body={pending ? (
          <>
            <span className="block">{t(`psx.tool.${pending.tool.id}.name`, pending.tool.name)}</span>
            <span className="block mt-1 text-zinc-400">
              {pending.mutating ? t('psx.confirm.changesBody', 'Isto altera o sistema. Revise o que vai ser executado:') : t('psx.confirm.adminBody', 'Só leitura, mas precisa de administrador. Vai ser executado:')}
            </span>
            <span className="block mt-2 max-h-48 overflow-auto rounded bg-zinc-950 border border-zinc-800 px-2 py-1.5 font-mono text-[11px] text-zinc-300 whitespace-pre-wrap break-all">{pending.preview}</span>
          </>
        ) : null}
        confirmLabel={pending?.mutating ? t('psx.confirm.run', 'Executar') : t('psx.confirm.continue', 'Continuar')}
        onCancel={() => setPending(null)}
        onConfirm={() => { const p = pending; setPending(null); if (p) execute(p.tool, p.params, true, p.resultFor); }}
      />
    </div>
  );
}
