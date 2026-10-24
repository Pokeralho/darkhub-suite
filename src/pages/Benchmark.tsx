import React, { useEffect, useMemo, useState } from 'react';
import { Play, Square, Loader2, Trash2, AlertTriangle, Info } from '../components/icons';
import PageHeader from '../components/ui/PageHeader';
import { useI18n } from '../i18n/I18nProvider';
import type { BenchRun } from '../global';

type CompareResult = Awaited<ReturnType<NonNullable<typeof window.darkhub>['bench']['compare']>>;

const METRIC_ORDER = ['cpuSingle', 'cpuMulti', 'memBandwidth', 'memLatency', 'timerJitterAvg', 'timerJitterP99', 'diskSeqWrite', 'disk4kSyncWrite'];
const fmt = (v: number | null | undefined) => (v == null ? '—' : v >= 1000 ? Math.round(v).toLocaleString() : v >= 100 ? v.toFixed(0) : v.toFixed(1));

export default function Benchmark() {
  const { t } = useI18n();
  const [runs, setRuns] = useState<BenchRun[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ test: string; run: number; runs: number } | null>(null);
  const [label, setLabel] = useState('');
  const [quick, setQuick] = useState(false);
  const [disk, setDisk] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [before, setBefore] = useState('');
  const [after, setAfter] = useState('');
  const [cmp, setCmp] = useState<CompareResult | null>(null);

  const api = () => window.darkhub?.bench;
  const metricName = (k: string) => ({
    cpuSingle: t('bench.m.cpuSingle', 'CPU, 1 núcleo'),
    cpuMulti: t('bench.m.cpuMulti', 'CPU, todos os núcleos'),
    memBandwidth: t('bench.m.memBandwidth', 'Memória, banda'),
    memLatency: t('bench.m.memLatency', 'Memória, latência'),
    timerJitterAvg: t('bench.m.timerAvg', 'Timer de 1 ms, atraso médio'),
    timerJitterP99: t('bench.m.timerP99', 'Timer de 1 ms, pior 1%'),
    diskSeqWrite: t('bench.m.diskSeq', 'Disco, escrita sequencial'),
    disk4kSyncWrite: t('bench.m.disk4k', 'Disco, escrita 4K confirmada')
  } as Record<string, string>)[k] ?? k;

  const load = async () => {
    const r = await api()?.history().catch(() => null);
    if (r?.ok && r.runs) {
      setRuns(r.runs);
      if (r.runs.length >= 2) { setAfter((v) => v || r.runs![0].id); setBefore((v) => v || r.runs![1].id); }
    }
  };
  useEffect(() => {
    void load();
    return api()?.onEvent((e) => setProgress(e));
  }, []);
  useEffect(() => {
    if (!before || !after || before === after) { setCmp(null); return; }
    void api()?.compare({ a: before, b: after }).then(setCmp);
  }, [before, after, runs]);

  const run = async () => {
    setRunning(true);
    setError(null);
    setProgress(null);
    const r = await api()?.run({ label: label.trim(), quick, skipDisk: !disk }).catch((e) => ({ ok: false, error: String(e?.message ?? e), run: undefined }));
    setRunning(false);
    setProgress(null);
    if (!r?.ok || !r.run) { if (r?.error !== 'cancelled') setError(r?.error ?? 'error'); return; }
    setLabel('');
    const newId = r.run.id;
    await load();
    // the newest run becomes "after", the previous "after" becomes "before"
    setBefore((prev) => (after && after !== newId ? after : prev));
    setAfter(newId);
  };

  const remove = async (id: string) => {
    if (!window.confirm(t('bench.confirmDelete', 'Apagar esta execução?'))) return;
    await api()?.remove({ id });
    if (before === id) setBefore('');
    if (after === id) setAfter('');
    await load();
  };

  const runLabel = (r: BenchRun) => `${new Date(r.at).toLocaleString()}${r.label ? ` · ${r.label}` : ''}${r.quick ? ` · ${t('bench.quickShort', 'rápido')}` : ''}`;
  const latest = runs[0];
  const busyWarning = latest && latest.context.backgroundCpu > 20;
  const verdictClass = { better: 'text-emerald-400', worse: 'text-red-400', same: 'text-zinc-500' } as const;
  const rows = useMemo(() => [...(cmp?.rows ?? [])].sort((a, b) => METRIC_ORDER.indexOf(a.metric) - METRIC_ORDER.indexOf(b.metric)), [cmp]);
  const warningName = (w: string) => ({ powerPlan: t('bench.ctx.powerPlan', 'plano de energia'), onBattery: t('bench.ctx.battery', 'bateria/tomada'), cpu: 'CPU', ramGb: 'RAM', osBuild: t('bench.ctx.os', 'versão do Windows'), backgroundCpu: t('bench.ctx.load', 'uso de CPU em segundo plano') } as Record<string, string>)[w] ?? w;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      <PageHeader
        title={t('nav.benchmark', 'Benchmark antes/depois')}
        subtitle={t('bench.subtitle', 'Meça antes de otimizar, aplique o perfil ou os ajustes e meça de novo. Uma diferença só conta se for maior que a variação natural entre execuções.')}
      />

      <section className="rounded-xl border border-zinc-800/80 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <input value={label} onChange={(e) => setLabel(e.target.value)} disabled={running} maxLength={80} className="dh-input w-64 max-w-full"
            placeholder={t('bench.labelPh', 'Nome (ex.: antes do Perfil Gamer)')} />
          <label className="flex items-center gap-2 text-[12.5px] text-zinc-300 select-none">
            <input type="checkbox" checked={quick} onChange={(e) => setQuick(e.target.checked)} disabled={running} />
            {t('bench.quick', 'Rápido (3 repetições)')}
          </label>
          <label className="flex items-center gap-2 text-[12.5px] text-zinc-300 select-none" title={t('bench.diskHelp', 'Escreve até 1 GB num arquivo temporário, apagado no fim')}>
            <input type="checkbox" checked={disk} onChange={(e) => setDisk(e.target.checked)} disabled={running} />
            {t('bench.disk', 'Incluir disco')}
          </label>
          {running ? (
            <button type="button" onClick={() => void api()?.cancel()} className="dh-btn dh-btn-danger ml-auto"><Square size={14} />{t('bench.cancel', 'Cancelar')}</button>
          ) : (
            <button type="button" onClick={() => void run()} className="dh-btn dh-btn-primary ml-auto"><Play size={14} />{t('bench.run', 'Rodar benchmark')}</button>
          )}
        </div>
        {running && (
          <p className="flex items-center gap-2 text-[12.5px] text-zinc-300">
            <Loader2 size={14} className="animate-spin" />
            {progress ? `${metricName(progress.test === 'timerJitter' ? 'timerJitterAvg' : progress.test)} · ${progress.run}/${progress.runs}` : t('bench.preparing', 'Lendo o estado do sistema...')}
          </p>
        )}
        <p className="flex items-start gap-2 dh-help"><Info size={13} className="mt-0.5 shrink-0" />{t('bench.tip', 'Para uma comparação justa: feche jogos e navegadores, deixe o PC na tomada e rode as duas medições nas mesmas condições. Só o ajuste deve mudar entre elas.')}</p>
        {busyWarning && <p className="flex items-center gap-2 text-[12.5px] text-amber-300"><AlertTriangle size={14} />{t('bench.busy', 'Na última execução o PC já estava com {n}% de CPU ocupada antes de começar. Os resultados variam mais assim.').replace('{n}', String(latest.context.backgroundCpu))}</p>}
        {error && <p role="alert" className="flex items-center gap-2 text-[12.5px] text-red-400"><AlertTriangle size={14} />{error}</p>}
      </section>

      {runs.length >= 2 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="dh-section-title">{t('bench.compare', 'Comparar')}</h2>
            <label className="flex items-center gap-2 text-[12.5px] text-zinc-400">{t('bench.before', 'Antes')}
              <select className="dh-input max-w-xs" value={before} onChange={(e) => setBefore(e.target.value)}>
                <option value="">—</option>{runs.map((r) => <option key={r.id} value={r.id}>{runLabel(r)}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-[12.5px] text-zinc-400">{t('bench.after', 'Depois')}
              <select className="dh-input max-w-xs" value={after} onChange={(e) => setAfter(e.target.value)}>
                <option value="">—</option>{runs.map((r) => <option key={r.id} value={r.id}>{runLabel(r)}</option>)}
              </select>
            </label>
          </div>
          {(cmp?.warnings?.length ?? 0) > 0 && (
            <p className="flex items-center gap-2 text-[12.5px] text-amber-300"><AlertTriangle size={14} />
              {t('bench.unfair', 'Atenção: mudou entre as duas medições: {list}. A diferença pode não ser só do ajuste.').replace('{list}', cmp!.warnings!.map(warningName).join(', '))}
            </p>
          )}
          {rows.length > 0 && (
            <div className="rounded-xl border border-zinc-800/80 overflow-hidden">
              <table className="w-full text-[12.5px]">
                <thead className="text-zinc-500 text-left">
                  <tr className="border-b border-zinc-800/80">
                    <th className="px-3 py-2 font-normal">{t('bench.metric', 'Medida')}</th>
                    <th className="px-3 py-2 font-normal text-right">{t('bench.before', 'Antes')}</th>
                    <th className="px-3 py-2 font-normal text-right">{t('bench.after', 'Depois')}</th>
                    <th className="px-3 py-2 font-normal text-right">{t('bench.change', 'Diferença')}</th>
                    <th className="px-3 py-2 font-normal">{t('bench.verdict', 'Resultado')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {rows.map((r) => (
                    <tr key={r.metric}>
                      <td className="px-3 py-2 text-zinc-200">{metricName(r.metric)} <span className="text-zinc-600">{r.unit}</span></td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-300">{fmt(r.before)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-100">{fmt(r.after)}</td>
                      <td className={`px-3 py-2 text-right font-mono tabular-nums ${verdictClass[r.verdict]}`}>{r.change >= 0 ? '+' : ''}{(r.change * 100).toFixed(1)}%</td>
                      <td className={`px-3 py-2 ${verdictClass[r.verdict]}`} title={t('bench.noiseHelp', 'Variação natural medida: ±{n}%').replace('{n}', (r.threshold * 100).toFixed(1))}>
                        {r.verdict === 'better' ? t('bench.better', 'melhorou') : r.verdict === 'worse' ? t('bench.worse', 'piorou') : t('bench.same', 'dentro da variação')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="dh-help">{t('bench.timerHelp', 'Timer de 1 ms: quanto um "espere 1 ms" atrasa de fato. No Windows padrão fica perto de 15 ms; ajustes de resolução de timer reduzem esse número.')}</p>
        </section>
      )}

      <section>
        <h2 className="dh-section-title mb-2">{t('bench.history', 'Execuções')}</h2>
        {runs.length === 0 ? <p className="dh-help">{t('bench.empty', 'Nenhuma execução ainda. Rode a primeira para ter a referência de "antes".')}</p> : (
          <div className="rounded-xl border border-zinc-800/80 divide-y divide-zinc-900">
            {runs.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-3 py-2 text-[12.5px] min-w-0">
                <span className="text-zinc-200 truncate flex-1" title={`${r.context.cpu} · ${r.context.powerPlan}`}>{runLabel(r)}</span>
                <span className="text-zinc-500 shrink-0 hidden md:inline">{r.context.powerPlan}</span>
                <span className="font-mono tabular-nums text-zinc-400 shrink-0">{fmt(r.metrics.cpuMulti?.median)} Mops/s</span>
                <button type="button" onClick={() => void remove(r.id)} className="dh-btn dh-btn-ghost dh-btn-sm shrink-0" aria-label={t('bench.delete', 'Apagar')}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
