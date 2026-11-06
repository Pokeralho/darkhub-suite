import React, { useEffect, useState } from 'react';
import { Play, Square, Trash2, AlertTriangle, Info } from '../icons';
import RunOverlay from './RunOverlay';
import { useI18n } from '../../i18n/I18nProvider';
import type { GpuStressEvent, GpuStressLoop, GpuStressRun } from '../../global';

const DURATIONS = [5, 10, 20, 60];
const LOADS = ['alternate', 'raster', 'rt'];
const num = (v: number | null | undefined, d = 0) => (v == null ? '-' : v.toFixed(d));

/** Each loop's FPS against the best loop of the same test, from 90% to 100%. The 97% line is the pass mark. */
function StabilityChart({ loops, label }: { loops: GpuStressLoop[]; label: string }) {
  const W = 640, H = 96, FLOOR = 90;
  const y = (pct: number) => H - ((Math.max(FLOOR, Math.min(100, pct)) - FLOOR) / (100 - FLOOR)) * H;
  const tests = [...new Set(loops.map((l) => l.test))];
  const best = (test: string) => Math.max(...loops.filter((l) => l.test === test).map((l) => l.fps));
  const n = Math.max(2, loops.length);
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24" role="img" aria-label={label}>
        <line x1="0" x2={W} y1={y(97)} y2={y(97)} className="stroke-zinc-700" strokeDasharray="4 4" />
        {tests.map((test) => (
          <polyline key={test} fill="none" strokeWidth="1.5" className={test === 'rt' ? 'stroke-zinc-300' : 'stroke-blue-400'}
            points={loops.filter((l) => l.test === test).map((l) => `${(l.index / (n - 1)) * W},${y((l.fps / best(test)) * 100)}`).join(' ')} />
        ))}
        {loops.filter((l) => l.error).map((l) => <circle key={l.index} cx={(l.index / (n - 1)) * W} cy={y(100) + 4} r="3" className="fill-red-400" />)}
      </svg>
      <figcaption className="dh-help">{label}</figcaption>
    </figure>
  );
}

export default function StressPanel({ runs, engine, blocked, onBusy, onDone }: { runs: GpuStressRun[]; engine: boolean; blocked: boolean; onBusy: (b: boolean) => void; onDone: () => void | Promise<void> }) {
  const { t } = useI18n();
  const [minutes, setMinutes] = useState(10);
  const [load, setLoad] = useState('alternate');
  const [limit, setLimit] = useState(95);
  const [active, setActive] = useState(false);
  const [live, setLive] = useState<GpuStressEvent | null>(null);
  const [liveLoops, setLiveLoops] = useState<GpuStressLoop[]>([]);
  const [error, setError] = useState<string | null>(null);
  const api = () => window.darkhub?.gpubench;

  useEffect(() => api()?.onEvent((e) => {
    if (e.type !== 'stress') return;
    setLive(e);
    const loop = e.data;
    if (loop) setLiveLoops((l) => [...l, loop]);
  }), []);

  const start = async () => {
    setActive(true);
    onBusy(true);
    setError(null);
    setLive(null);
    setLiveLoops([]);
    const r = await api()?.stress({ minutes, load, tempLimit: limit }).catch((e) => ({ ok: false as const, error: String(e?.message ?? e) }));
    setActive(false);
    onBusy(false);
    if (!r?.ok && r?.error !== 'cancelled') setError(r?.error ?? 'error');
    await onDone();
  };

  const remove = async (id: string) => { await api()?.removeStress({ id }); await onDone(); };

  const loadName = (k: string) => ({ alternate: t('stress.load.alternate', 'Raster e ray tracing'), raster: t('stress.load.raster', 'Rasterização'), rt: t('stress.load.rt', 'Ray tracing') } as Record<string, string>)[k] ?? k;
  const verdictName = (v: string) => ({ pass: t('stress.verdict.pass', 'Aprovado'), fail: t('stress.verdict.fail', 'Reprovado'), inconclusive: t('stress.verdict.inconclusive', 'Inconclusivo'), stopped: t('stress.verdict.stopped', 'Parado pelo limite de temperatura'), cancelled: t('stress.verdict.cancelled', 'Interrompido') } as Record<string, string>)[v] ?? v;
  const verdictClass = (v: string) => ({ pass: 'text-emerald-400', fail: 'text-red-400', stopped: 'text-amber-300', inconclusive: 'text-amber-300' } as Record<string, string>)[v] ?? 'text-zinc-500';
  const reasonText = (r: string, errors: number) => ({
    errors: t('stress.reason.errors', 'A GPU errou cálculos: {n} ciclo(s) geraram um frame diferente do original. Se ela tem overclock, reduza.').replace('{n}', String(errors)),
    fps_unstable: t('stress.reason.fps_unstable', 'O desempenho variou mais de 3% entre o melhor e o pior ciclo. Se havia outros programas abertos, feche-os e repita.'),
    device_lost: t('stress.reason.device_lost', 'O driver perdeu a GPU durante o teste. Costuma indicar overclock instável, fonte ou driver.'),
    engine_crashed: t('stress.reason.engine_crashed', 'O motor do teste fechou sozinho durante a carga.')
  } as Record<string, string>)[r] ?? r;

  const last = runs[0];
  const s = last?.summary;
  const stats = s ? [
    { label: t('stress.stability', 'Estabilidade'), value: num(s.stability, 1), unit: '%' },
    { label: t('stress.errors', 'Erros'), value: String(s.errors), unit: '' },
    { label: t('stress.tempMax', 'Temp. máxima'), value: num(s.tempMax), unit: '°C' },
    { label: t('stress.clockDrop', 'Queda de clock'), value: num(s.clockDrop, 1), unit: '%' }
  ] : [];
  const chartLabel = t('stress.chart', 'FPS de cada ciclo em relação ao melhor ciclo');

  return (
    <section className="dh-card p-4 space-y-3">
      <div>
        <h2 className="dh-section-title">{t('stress.title', 'Teste de estresse')}</h2>
        <p className="dh-help">{t('stress.help', 'Mantém a GPU em carga total e confere duas coisas: se o desempenho se sustenta quente e se ela continua calculando certo. Um frame fixo é refeito a cada ciclo e precisa sair idêntico ao do início.')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[12.5px] text-zinc-400">{t('stress.duration', 'Duração')}
          <select className="dh-input" value={minutes} disabled={active} onChange={(e) => setMinutes(Number(e.target.value))}>
            {DURATIONS.map((d) => <option key={d} value={d}>{t('stress.minutes', '{n} min').replace('{n}', String(d))}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[12.5px] text-zinc-400">{t('stress.load', 'Carga')}
          <select className="dh-input" value={load} disabled={active} onChange={(e) => setLoad(e.target.value)}>
            {LOADS.map((l) => <option key={l} value={l}>{loadName(l)}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[12.5px] text-zinc-400">{t('stress.limit', 'Parar em')}
          <select className="dh-input" value={limit} disabled={active} onChange={(e) => setLimit(Number(e.target.value))}>
            {[80, 85, 90, 95].map((c) => <option key={c} value={c}>{c} °C</option>)}
          </select>
        </label>
        {active
          ? <button type="button" onClick={() => void api()?.cancel()} className="dh-btn dh-btn-danger ml-auto"><Square size={14} />{t('stress.stop', 'Parar')}</button>
          : <button type="button" disabled={!engine || blocked} onClick={() => void start()} className="dh-btn ml-auto"><Play size={14} />{t('stress.start', 'Iniciar estresse')}</button>}
      </div>
      <p className="flex items-start gap-2 dh-help"><Info size={13} className="mt-0.5 shrink-0" />{t('stress.warn', 'Carga máxima contínua: a GPU vai esquentar e as ventoinhas vão acelerar. O resultado não vai para o ranking.')}</p>
      {error && <p role="alert" className="flex items-center gap-2 text-[12.5px] text-red-400"><AlertTriangle size={14} />{error}</p>}

      {active && (
        <RunOverlay title={t('stress.title', 'Teste de estresse')} onCancel={() => void api()?.cancel()} cancelLabel={t('stress.stop', 'Parar')} percent={live?.total ? (live.loop / live.total) * 100 : 0}
          status={live?.phase === 'run' ? t('stress.loop', 'Ciclo {a} de {b}').replace('{a}', String(live.loop)).replace('{b}', String(live.total)) : t('stress.warming', 'Aquecendo e gravando a referência...')}
          detail={live?.data ? `${num(live.data.tempMax)} °C${live.data.clock != null ? ` · ${num(live.data.clock)} MHz` : ''}${liveLoops.some((l) => l.error) ? ` · ${t('stress.errors', 'Erros')}: ${liveLoops.filter((l) => l.error).length}` : ''}` : undefined} />
      )}

      {!active && last && s && (
        <div className="space-y-3 border-t border-zinc-800/80 pt-3">
          <p className={`text-[13.5px] font-semibold ${verdictClass(s.verdict)}`}>{verdictName(s.verdict)}
            <span className="ml-2 font-normal text-[12.5px] text-zinc-500">{last.gpu.name} · {t('stress.loop', 'Ciclo {a} de {b}').replace('{a}', String(s.completed)).replace('{b}', String(s.planned))}</span>
          </p>
          {s.reasons.map((r) => <p key={r} className="flex items-start gap-2 text-[12.5px] text-red-400"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{reasonText(r, s.errors)}</p>)}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {stats.map((x) => (
              <div key={x.label}>
                <p className="text-[12px] text-zinc-500">{x.label}</p>
                <p className="font-mono tabular-nums text-xl text-zinc-100">{x.value}<span className="text-[12px] text-zinc-500"> {x.value === '-' ? '' : x.unit}</span></p>
              </div>
            ))}
          </div>
          {last.loops.length > 1 && <StabilityChart loops={last.loops} label={chartLabel} />}
          {s.verdict === 'inconclusive' && <p className="flex items-start gap-2 text-[12.5px] text-amber-300"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{t('stress.inconclusive', 'O FPS variou, mas a GPU manteve o clock e não errou nenhum cálculo: é mais provável que outro programa tenha usado a GPU. Feche jogos, navegadores e apps com aceleração de vídeo e repita.')}</p>}
          {s.throttled && <p className="flex items-start gap-2 text-[12.5px] text-amber-300"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{t('stress.throttled', 'O clock caiu {n}% com a GPU quente: ela reduziu a velocidade por temperatura ou energia.').replace('{n}', num(s.clockDrop, 1))}</p>}
          {s.noTempSensor && <p className="flex items-start gap-2 text-[12.5px] text-amber-300"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{t('stress.noTemp', 'Sem leitura de temperatura nesta GPU: o limite de parada não funcionou. Acompanhe a temperatura por outro programa.')}</p>}
        </div>
      )}

      {runs.length > 1 && (
        <div className="border-t border-zinc-800/80 pt-3">
          <h3 className="dh-label mb-1">{t('stress.history', 'Testes anteriores')}</h3>
          <div className="divide-y divide-zinc-900">
            {runs.slice(1).map((r) => (
              <div key={r.id} className="flex items-center gap-3 py-1.5 text-[12.5px] min-w-0">
                <span className="text-zinc-300 truncate flex-1">{new Date(r.at).toLocaleString()} · {t('stress.minutes', '{n} min').replace('{n}', String(r.minutes))} · {loadName(r.load)}</span>
                <span className={`shrink-0 ${verdictClass(r.summary.verdict)}`}>{verdictName(r.summary.verdict)}</span>
                <span className="font-mono tabular-nums text-zinc-400 shrink-0">{num(r.summary.stability, 1)}%</span>
                <button type="button" onClick={() => void remove(r.id)} className="dh-btn dh-btn-ghost dh-btn-sm shrink-0" aria-label={t('gpubench.delete', 'Apagar')}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
