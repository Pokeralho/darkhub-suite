import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Info, Play } from '../icons';
import RunOverlay from '../gpubench/RunOverlay';
import { useI18n } from '../../i18n/I18nProvider';
import { windowStats, readingWatts, checkPoint, CAL_WINDOW_MS, CAL_MAX_SPREAD } from '../../../electron/services/overlay/wallCalibration.js';
import type { WindowStats } from '../../../electron/services/overlay/wallCalibration.js';
import type { OverlayDerived, OverlaySettings, WallCalPoint, WallCalResult } from '../../global';

const LOAD_MINUTES = 5;
type Step = 'intro' | 'idle' | 'idleRead' | 'load' | 'loadRun' | 'loadRead' | 'review';
type Sample = { t: number; w: number | null };

const fmt = (x: number | null | undefined, d = 0) => (x == null || !Number.isFinite(x) ? '-' : x.toFixed(d));

/** Wall reading typed by the user: watts, or V x A x PF for meters that show those. */
function ReadingInput({ onSubmit, label }: { onSubmit: (watts: number) => void; label: string }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'w' | 'vapf'>('w');
  const [w, setW] = useState('');
  const [v, setV] = useState('');
  const [a, setA] = useState('');
  const [pf, setPf] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const r = mode === 'w' ? readingWatts({ watts: w }) : readingWatts({ mode: 'vapf', volts: v, amps: a, pf });
  const field = (val: string, set: (s: string) => void, name: string, unit: string, step: string) => (
    <label className="flex flex-col gap-1 text-[12px] text-zinc-400">{name}
      <span className="flex items-center gap-1.5">
        <input type="number" inputMode="decimal" step={step} value={val} onChange={(e) => { set(e.target.value); setErr(null); }} className="dh-input w-24 font-mono" aria-label={name} />
        <span className="text-zinc-500">{unit}</span>
      </span>
    </label>
  );
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (r.ok) onSubmit(r.watts); else setErr(r.error); }}>
      <p className="text-[12.5px] text-zinc-300">{label}</p>
      <div className="flex flex-wrap items-center gap-4 text-[12.5px] text-zinc-400">
        <label className="flex items-center gap-1.5"><input type="radio" name="calmode" checked={mode === 'w'} onChange={() => setMode('w')} />{t('pwr.cal.modeW', 'Watts')}</label>
        <label className="flex items-center gap-1.5"><input type="radio" name="calmode" checked={mode === 'vapf'} onChange={() => setMode('vapf')} />{t('pwr.cal.modeVapf', 'Tensão, corrente e fator de potência')}</label>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {mode === 'w' ? field(w, setW, t('pwr.cal.watts', 'Potência na tomada'), 'W', '0.1') : (
          <>
            {field(v, setV, t('pwr.cal.volts', 'Tensão'), 'V', '0.1')}
            {field(a, setA, t('pwr.cal.amps', 'Corrente'), 'A', '0.01')}
            {field(pf, setPf, t('pwr.cal.pf', 'Fator de potência'), '', '0.01')}
          </>
        )}
        {mode === 'vapf' && r.ok ? <span className="text-[12px] text-zinc-500 pb-2">= <span className="font-mono text-zinc-300">{fmt(r.watts, 1)}</span> W</span> : null}
        <button type="submit" className="dh-btn dh-btn-primary">{t('pwr.cal.confirm', 'Confirmar leitura')}</button>
      </div>
      {err ? <p role="alert" className="text-[12.5px] text-red-400">{t(`pwr.cal.err.${err}`, err)}</p> : null}
    </form>
  );
}

/** Live stability of measured CPU+GPU power over the sampling window. */
function Stability({ st }: { st: WindowStats }) {
  const { t } = useI18n();
  const state = st.stable ? t('pwr.cal.stable', 'estável') : st.reason === 'unstable' ? t('pwr.cal.varying', 'variando') : t('pwr.cal.collecting', 'coletando');
  return (
    <p className="text-[12.5px] text-zinc-400" aria-live="polite">
      {t('pwr.cal.measured', 'CPU + GPU medidos')}: <span className="font-mono text-zinc-200">{fmt(st.mean, 1)}</span><span className="text-zinc-500"> W</span>
      {' · '}{t('pwr.cal.variation', 'variação')} <span className="font-mono text-zinc-200">{fmt(st.spread != null ? st.spread * 100 : null, 1)}</span><span className="text-zinc-500">%</span>
      {' · '}<span className={st.stable ? 'text-emerald-400' : 'text-amber-300'}>{state}</span>
    </p>
  );
}

/**
 * Two-point calibration of the wall (AC) estimate with a plug-in watt-meter: an idle point, then a GPU load point (the
 * GPU stress engine). The fit itself runs in the main process (overlay:calibrate, wallCalibration.js).
 * windowMs / pollMs exist for tests; the screen never sets them.
 */
export default function WallCalibration({ derived, needs, onSaved, windowMs = CAL_WINDOW_MS, pollMs = 1000 }: {
  derived: OverlayDerived; needs: string | null; onSaved: (s: OverlaySettings | null) => void; windowMs?: number; pollMs?: number;
}) {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>('intro');
  const [st, setSt] = useState<WindowStats>(() => windowStats([], 0, windowMs));
  const [idle, setIdle] = useState<WallCalPoint | null>(null);
  const [captured, setCaptured] = useState<Omit<WallCalPoint, 'wallW'> | null>(null);
  const [result, setResult] = useState<WallCalResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const samples = useRef<Sample[]>([]);
  const lastLoad = useRef<WallCalPoint | null>(null);
  const stress = useRef<{ started: number; stopping: boolean; promise: Promise<unknown> } | null>(null);

  const sampling = step === 'idle' || step === 'loadRun';
  const ov = () => window.darkhub?.overlay;
  const gb = () => window.darkhub?.gpubench;

  // own polling while a point is being measured: GPU + CPU power, both required
  useEffect(() => {
    if (!sampling) return;
    samples.current = [];
    // a new point starts from nothing: the previous point's "stable" must not show for this one
    setSt(windowStats([], Date.now(), windowMs));
    let alive = true;
    const tick = async () => {
      const r = await ov()?.power().catch(() => null);
      if (!alive) return;
      const d = r?.derived;
      const now = Date.now();
      if (d && (d.cpuW == null || d.gpuW == null)) { setError('no_cpu'); return; }
      if (d) samples.current = [...samples.current.filter((s) => s.t >= now - windowMs * 3), { t: now, w: d.gpuW! + d.cpuW! }];
      setSt(windowStats(samples.current, now, windowMs));
      if (stress.current) setElapsed(now - stress.current.started);
    };
    void tick();
    const id = setInterval(() => void tick(), pollMs);
    return () => { alive = false; clearInterval(id); };
  }, [sampling, windowMs, pollMs]);

  // leaving the screen mid-load must not leave the GPU at full power
  useEffect(() => () => { if (stress.current) void gb()?.cancel(); }, []);

  const capture = (): Omit<WallCalPoint, 'wallW'> | null => {
    const s = windowStats(samples.current, Date.now(), windowMs);
    if (!s.stable || s.mean == null) return null;
    return { measW: s.mean, std: s.std ?? 0, spread: s.spread ?? 0 };
  };

  const reset = () => { setStep('intro'); setIdle(null); setCaptured(null); setResult(null); setError(null); };

  const captureIdle = () => {
    const c = capture();
    if (!c) { setError('unstable'); return; }
    setError(null); setCaptured(c); setStep('idleRead');
  };

  const confirmIdle = (wallW: number) => {
    const p = { ...captured!, wallW };
    const e = checkPoint(p);
    if (e) { setError(e); return; }
    setError(null); setIdle(p); setCaptured(null); setStep('load');
  };

  const startLoad = () => {
    const api = gb();
    if (!api) { setError('engine_missing'); return; }
    setError(null); setElapsed(0);
    const promise = api.stress({ minutes: LOAD_MINUTES, load: 'raster', tempLimit: 90 })
      .catch((e: unknown) => ({ ok: false, error: String((e as Error)?.message ?? e) }))
      .then((r) => {
        const cur = stress.current;
        stress.current = null;
        // the load ended without the user stopping it: an engine error, the temperature limit or the 5 minutes ran out
        if (cur && !cur.stopping) {
          const res = r as { ok: boolean; error?: string };
          setError(!res?.ok && res?.error && res.error !== 'cancelled' ? res.error : 'load_ended');
          setStep('load');
        }
        return r;
      });
    stress.current = { started: Date.now(), stopping: false, promise };
    setStep('loadRun');
  };

  const stopLoad = async () => {
    const cur = stress.current;
    if (!cur) return;
    // the window is taken BEFORE the load stops: the reading the user just looked at belongs to it
    const c = capture();
    cur.stopping = true;
    setBusy(true);
    await gb()?.cancel();
    await cur.promise;
    setBusy(false);
    if (!c) { setError('unstable_at_stop'); setStep('load'); return; }
    setError(null); setCaptured(c); setStep('loadRead');
  };

  const confirmLoad = async (wallW: number) => {
    const p = { ...captured!, wallW };
    const e = checkPoint(p);
    if (e) { setError(e); return; }
    lastLoad.current = p;
    setBusy(true); setError(null);
    const r = await ov()?.calibrate({ points: [idle!, p], save: false }).catch((x: unknown) => ({ ok: false, error: String((x as Error)?.message ?? x) }) as WallCalResult);
    setBusy(false);
    if (!r?.ok) { setError(r?.error ?? 'error'); return; }
    setResult(r); setCaptured(null); setStep('review');
  };

  const save = async () => {
    setBusy(true);
    const r = await ov()?.calibrate({ points: [idle!, lastLoad.current!], save: true }).catch(() => null);
    setBusy(false);
    if (!r?.ok) { setError(r?.error ?? 'error'); return; }
    onSaved(r.settings ?? null);
    reset();
  };

  const clear = useCallback(async () => { const r = await ov()?.clearCalibration().catch(() => null); onSaved(r?.settings ?? null); }, [onSaved]);

  const cal = derived.calibration;
  const blocked = derived.cpuW == null || derived.gpuW == null;
  const errText = (e: string) => t(`pwr.cal.err.${e}`, e) + (e === 'no_cpu' && needs ? ` (${needs})` : '');
  const date = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleDateString() : '');

  return (
    <div className="space-y-3 text-[12.5px]">
      <p className="dh-help max-w-[75ch]">{t('pwr.cal.help', 'Com um medidor de tomada você corrige a estimativa: o app mede a GPU e a CPU com o PC ocioso e depois com a GPU em carga, você digita o que o medidor mostra nos dois momentos, e o app calcula o consumo que não consegue medir (placa-mãe, RAM, SSDs, ventoinhas) e a eficiência real da fonte. O resultado continua sendo uma estimativa.')}</p>

      {step === 'intro' ? (
        <div className="space-y-2">
          {cal && cal.state !== 'none' ? (
            <p className={cal.state === 'mismatch' ? 'text-amber-300' : 'text-zinc-400'}>
              {cal.state === 'applied' ? t('pwr.cal.appliedLine', 'Calibrada em {d}: consumo oculto {x} W, correção da eficiência {k}.').replace('{d}', date(cal.at)).replace('{x}', fmt(cal.extraW)).replace('{k}', `x${fmt(cal.effScale, 3)}`)
                : cal.state === 'mismatch' ? t('pwr.cal.mismatch', 'A calibração de {d} está sendo ignorada: a GPU, a CPU ou a fonte escolhida mudou. Calibre de novo.').replace('{d}', date(cal.at))
                : t('pwr.cal.unverified', 'A calibração de {d} aguarda os nomes da GPU e da CPU para conferir o hardware.').replace('{d}', date(cal.at))}
              {' '}<button type="button" className="dh-btn dh-btn-ghost dh-btn-sm" onClick={() => void clear()}>{t('pwr.cal.remove', 'Remover calibração')}</button>
            </p>
          ) : null}
          {blocked ? (
            <p role="alert" className="flex items-start gap-2 text-amber-300"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{t('pwr.cal.blocked', 'Calibração indisponível sem a leitura de consumo da CPU e da GPU: uma leitura ausente seria absorvida pelo ajuste e o resultado sairia errado.')}{needs ? ` (${needs})` : ''}</p>
          ) : null}
          <button type="button" className="dh-btn" disabled={blocked} onClick={() => { setError(null); setStep('idle'); }}>{t('pwr.cal.start', 'Calibrar com medidor')}</button>
        </div>
      ) : (
        <div className="space-y-3 border-l border-zinc-800/80 pl-3">
          <p className="text-zinc-300 font-semibold">{step === 'review' ? t('pwr.cal.reviewTitle', 'Resultado') : step.startsWith('idle') ? t('pwr.cal.step1', 'Passo 1 de 2: PC ocioso') : t('pwr.cal.step2', 'Passo 2 de 2: GPU em carga')}</p>

          {step === 'idle' ? (
            <>
              <p className="text-zinc-400 max-w-[75ch]">{t('pwr.cal.idleHelp', 'Feche jogos e programas pesados e não mexa no PC. Quando o consumo ficar estável (variação de até {p}% em {s} s), olhe o medidor e capture o ponto.').replace('{p}', String(CAL_MAX_SPREAD * 100)).replace('{s}', String(Math.round(windowMs / 1000)))}</p>
              <Stability st={st} />
              <button type="button" className="dh-btn dh-btn-primary" disabled={!st.stable} onClick={captureIdle}>{t('pwr.cal.capture', 'Capturar ponto')}</button>
            </>
          ) : null}

          {step === 'idleRead' || step === 'loadRead' ? (
            <>
              <p className="text-zinc-400">{t('pwr.cal.capturedAt', 'Ponto capturado com CPU + GPU em')} <span className="font-mono text-zinc-200">{fmt(captured?.measW, 1)}</span> W.</p>
              <ReadingInput key={step} label={t('pwr.cal.typeReading', 'Digite o que o medidor mostrava nesse momento:')} onSubmit={(w) => { if (step === 'idleRead') confirmIdle(w); else void confirmLoad(w); }} />
            </>
          ) : null}

          {step === 'load' ? (
            <>
              <p className="text-zinc-400 max-w-[75ch]">{t('pwr.cal.loadHelp', 'O app vai pôr a GPU em carga com o teste de estresse (até {m} min). Quando o consumo estabilizar, a tela avisa: leia o medidor e pare a carga. Depois digite a leitura.').replace('{m}', String(LOAD_MINUTES))}</p>
              <p className="text-zinc-500">{t('pwr.cal.idlePoint', 'Ponto ocioso')}: <span className="font-mono text-zinc-300">{fmt(idle?.measW, 1)}</span> W {t('pwr.cal.measuredShort', 'medidos')} · <span className="font-mono text-zinc-300">{fmt(idle?.wallW, 1)}</span> W {t('pwr.cal.atWall', 'na tomada')}</p>
              <button type="button" className="dh-btn dh-btn-primary" onClick={startLoad}><Play size={14} />{t('pwr.cal.startLoad', 'Iniciar carga')}</button>
            </>
          ) : null}

          {step === 'loadRun' ? (
            <>
              <Stability st={st} />
              <RunOverlay title={t('pwr.cal.loadTitle', 'Calibração: GPU em carga')} cancelLabel={t('pwr.cal.stopLoad', 'Parar carga')} onCancel={() => void stopLoad()}
                percent={(elapsed / (LOAD_MINUTES * 60000)) * 100}
                status={st.stable ? t('pwr.cal.readNow', 'Estável: leia o medidor agora e pare a carga') : t('pwr.cal.waitStable', 'Aguardando o consumo estabilizar')}
                detail={`${fmt(st.mean, 0)} W · ${fmt(st.spread != null ? st.spread * 100 : null, 1)}%`} />
            </>
          ) : null}

          {step === 'review' && result?.ok ? (
            <>
              <ul className="space-y-1 max-w-md">
                <li className="flex justify-between gap-3"><span className="text-zinc-400">{t('pwr.cal.hidden', 'Consumo oculto (DC)')}<span className="text-amber-300/80">*</span></span><span className="font-mono text-zinc-200">{fmt(result.extraW, 0)} <span className="text-zinc-500">± {fmt(result.sigma?.extraW, 0)} W</span></span></li>
                <li className="flex justify-between gap-3"><span className="text-zinc-400">{t('pwr.cal.effIdle', 'Eficiência no ponto ocioso')}<span className="text-amber-300/80">*</span></span><span className="font-mono text-zinc-200">{fmt(result.effAt?.[0], 1)} <span className="text-zinc-500">± {fmt(result.sigma?.effPct, 1)} %</span></span></li>
                <li className="flex justify-between gap-3"><span className="text-zinc-400">{t('pwr.cal.effLoad', 'Eficiência no ponto de carga')}<span className="text-amber-300/80">*</span></span><span className="font-mono text-zinc-200">{fmt(result.effAt?.[1], 1)} <span className="text-zinc-500">± {fmt(result.sigma?.effPct, 1)} %</span></span></li>
                <li className="flex justify-between gap-3"><span className="text-zinc-400">{t('pwr.cal.scale', 'Correção da curva da fonte')}</span><span className="font-mono text-zinc-200">x{fmt(result.effScale, 3)}</span></li>
              </ul>
              <p className="flex items-start gap-2 dh-help max-w-[75ch]"><Info size={13} className="mt-0.5 shrink-0" />{t('pwr.cal.limits', 'Valores efetivos: incluem os erros proporcionais dos sensores e supõem o consumo oculto igual no ocioso e em carga. Valem só para esta GPU, CPU e fonte escolhida.')}</p>
              <button type="button" className="dh-btn dh-btn-primary" disabled={busy} onClick={() => void save()}>{t('pwr.cal.save', 'Salvar calibração')}</button>
            </>
          ) : null}

          {error ? <p role="alert" className="flex items-start gap-2 text-red-400"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{errText(error)}</p> : null}
          {step !== 'loadRun' ? <button type="button" className="dh-btn dh-btn-ghost dh-btn-sm" onClick={reset}>{t('pwr.cal.cancel', 'Cancelar calibração')}</button> : null}
        </div>
      )}
    </div>
  );
}
