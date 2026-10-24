import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { Activity, Play, Pause, Loader2, Route, Gauge, RotateCcw, Shield, AlertTriangle, CheckCircle2, RefreshCw, Globe } from '../icons';
import type { NetBufferbloatResult, NetLatencyPreset, NetLatencyState, NetLatencyTweakId, NetTraceHop } from '../../global';

const net = () => window.darkhub?.network;

const FALLBACK_PRESETS: NetLatencyPreset[] = [
  { id: 'cf', label: 'Cloudflare (1.1.1.1)', host: '1.1.1.1', mode: 'icmp', group: 'dns' },
  { id: 'google', label: 'Google DNS (8.8.8.8)', host: '8.8.8.8', mode: 'icmp', group: 'dns' }
];

type Sample = number | null;

/** Same math as computeLatencyStats() in electron/services/NetLatencyService.js (covered by tests there). */
function stats(samples: Sample[]) {
  const ok = samples.filter((x): x is number => typeof x === 'number');
  const r1 = (n: number) => Math.round(n * 10) / 10;
  if (!ok.length) return { cur: null as number | null, min: null as number | null, avg: null as number | null, max: null as number | null, p95: null as number | null, jitter: null as number | null, loss: samples.length ? 100 : 0 };
  const sorted = [...ok].sort((a, b) => a - b);
  let d = 0;
  for (let i = 1; i < ok.length; i += 1) d += Math.abs(ok[i] - ok[i - 1]);
  return {
    cur: samples[samples.length - 1] ?? null,
    min: r1(sorted[0]),
    max: r1(sorted[sorted.length - 1]),
    avg: r1(ok.reduce((a, b) => a + b, 0) / ok.length),
    p95: r1(sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.95 * sorted.length) - 1))]),
    jitter: ok.length > 1 ? r1(d / (ok.length - 1)) : 0,
    loss: r1(((samples.length - ok.length) / samples.length) * 100)
  };
}

const fmt = (v: number | null | undefined, unit = 'ms') => (v === null || v === undefined ? '—' : `${v}${unit ? ` ${unit}` : ''}`);

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? 'text-red-400' : tone === 'warn' ? 'text-amber-300' : 'text-zinc-50';
  return (
    <div className="min-w-0">
      <p className="text-[11.5px] text-zinc-500">{label}</p>
      <p className={`mt-1 font-mono text-[18px] leading-none ${color}`}>{value}</p>
    </div>
  );
}

function usePresets() {
  const [presets, setPresets] = useState<NetLatencyPreset[]>(FALLBACK_PRESETS);
  useEffect(() => {
    let alive = true;
    net()?.latencyPresets?.().then((r) => { if (alive && r?.ok && r.presets?.length) setPresets(r.presets); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return presets;
}

function LatencyChart({ samples, label }: { samples: Sample[]; label: string }) {
  const W = 640;
  const H = 180;
  const ok = samples.filter((x): x is number => typeof x === 'number');
  const top = Math.max(20, Math.ceil((Math.max(0, ...ok) * 1.2) / 10) * 10);
  const n = Math.max(samples.length, 2);
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => H - (v / top) * H;
  let d = '';
  samples.forEach((s, i) => {
    if (s === null) return;
    const prev = i > 0 ? samples[i - 1] : null;
    d += `${prev === null || i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(s).toFixed(1)} `;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full h-[200px]" role="img" aria-label={label} preserveAspectRatio="none">
      {[0.25, 0.5, 0.75].map((f) => (
        <g key={f}>
          <line x1={0} x2={W} y1={H * f} y2={H * f} stroke="currentColor" className="text-zinc-800" strokeWidth={1} />
          <text x={4} y={H * f - 3} className="fill-zinc-500" fontSize={10}>{Math.round(top * (1 - f))} ms</text>
        </g>
      ))}
      <line x1={0} x2={W} y1={H} y2={H} stroke="currentColor" className="text-zinc-700" strokeWidth={1} />
      <path d={d} fill="none" stroke="currentColor" className="text-blue-400" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      {samples.map((s, i) => (s === null ? <rect key={i} x={x(i) - 1.5} y={H + 4} width={3} height={10} className="fill-red-500" /> : null))}
    </svg>
  );
}

// ------------------------------------------------------------------ live monitor
export function LiveLatencyPanel() {
  const { t } = useI18n();
  const presets = usePresets();
  const [host, setHost] = useState('1.1.1.1');
  const [mode, setMode] = useState<'icmp' | 'tcp'>('icmp');
  const [running, setRunning] = useState(false);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef(false);

  useEffect(() => () => { runRef.current = false; }, []);

  const start = async () => {
    if (runRef.current) return;
    setError(null);
    setSamples([]);
    runRef.current = true;
    setRunning(true);
    while (runRef.current) {
      const t0 = Date.now();
      try {
        const r = await net()?.probe?.({ host, mode });
        if (!r?.ok) { setError(r?.error || 'erro'); break; }
        setSamples((prev) => [...prev, r.ms ?? null].slice(-120));
      } catch (e: any) {
        setError(e?.message ?? String(e));
        break;
      }
      await new Promise((res) => setTimeout(res, Math.max(0, 1000 - (Date.now() - t0))));
    }
    runRef.current = false;
    setRunning(false);
  };
  const stop = () => { runRef.current = false; };

  const s = useMemo(() => stats(samples), [samples]);
  const pickPreset = (id: string) => {
    const p = presets.find((x) => x.id === id);
    if (p) { setHost(p.host); setMode(p.mode); }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] gap-6 animate-in">
      <div className="space-y-4">
        <div>
          <label htmlFor="netx-preset" className="dh-label block mb-1.5">{t('netx.preset', 'Servidor pronto')}</label>
          <select id="netx-preset" className="dh-input w-full" disabled={running} value={presets.find((p) => p.host === host && p.mode === mode)?.id ?? ''} onChange={(e) => pickPreset(e.target.value)}>
            <option value="">{t('netx.presetCustom', 'Personalizado')}</option>
            <optgroup label={t('netx.group.dns', 'DNS / anycast')}>
              {presets.filter((p) => p.group === 'dns').map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </optgroup>
            <optgroup label={t('netx.group.game', 'Plataformas de jogos')}>
              {presets.filter((p) => p.group === 'game').map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </optgroup>
            <optgroup label={t('netx.group.region', 'Regiões de nuvem (onde ficam muitos servidores de jogo)')}>
              {presets.filter((p) => p.group === 'region').map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </optgroup>
          </select>
        </div>
        <div>
          <label htmlFor="netx-host" className="dh-label block mb-1.5">{t('net.hostIp', 'Host / IP')}</label>
          <input id="netx-host" className="dh-input w-full font-mono" spellCheck={false} disabled={running} value={host} onChange={(e) => setHost(e.target.value)} />
        </div>
        <div>
          <label htmlFor="netx-mode" className="dh-label block mb-1.5">{t('netx.mode', 'Método')}</label>
          <select id="netx-mode" className="dh-input w-full" disabled={running} value={mode} onChange={(e) => setMode(e.target.value as 'icmp' | 'tcp')}>
            <option value="icmp">{t('netx.mode.icmp', 'ICMP (ping)')}</option>
            <option value="tcp">{t('netx.mode.tcp', 'TCP 443 (para hosts que bloqueiam ping)')}</option>
          </select>
        </div>
        {running ? (
          <button className="dh-btn w-full" onClick={stop}><Pause size={14} /><span>{t('netx.stop', 'Parar')}</span></button>
        ) : (
          <button className="dh-btn dh-btn-primary w-full" onClick={start} disabled={!host}><Play size={14} /><span>{t('netx.startLive', 'Monitorar (1 amostra/s)')}</span></button>
        )}
        <p className="dh-help">{t('netx.liveHelp', 'Jitter é a variação média entre respostas seguidas. Acima de 5 ms ou perda acima de 1% costuma aparecer como "engasgo" em jogos online.')}</p>
      </div>
      <div className="min-w-0 space-y-4">
        <div className="grid grid-cols-3 sm:grid-cols-7 gap-4 border-y border-zinc-800/80 py-4">
          <Metric label={t('netx.now', 'Atual')} value={fmt(s.cur)} />
          <Metric label={t('netx.min', 'Mín')} value={fmt(s.min)} />
          <Metric label={t('netx.avg', 'Média')} value={fmt(s.avg)} />
          <Metric label={t('netx.max', 'Máx')} value={fmt(s.max)} />
          <Metric label="p95" value={fmt(s.p95)} />
          <Metric label={t('netx.jitter', 'Jitter')} value={fmt(s.jitter)} tone={s.jitter !== null && s.jitter > 5 ? 'warn' : undefined} />
          <Metric label={t('netx.loss', 'Perda')} value={fmt(s.loss, '%')} tone={s.loss > 2 ? 'bad' : s.loss > 0 ? 'warn' : undefined} />
        </div>
        {error ? <p role="alert" className="text-[12.5px] text-red-400">{error}</p> : null}
        {samples.length ? (
          <LatencyChart samples={samples} label={t('netx.chart', 'Gráfico de latência')} />
        ) : (
          <p className="py-16 text-center text-[12.5px] text-zinc-500">{t('netx.liveEmpty', 'Escolha um servidor e clique em Monitorar. Perdas aparecem como marcas vermelhas.')}</p>
        )}
        <p className="dh-help">{t('netx.samples', 'Amostras')}: {samples.length} / 120</p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ traceroute + MTU
export function RouteMtuPanel() {
  const { t } = useI18n();
  const [host, setHost] = useState('1.1.1.1');
  const [busy, setBusy] = useState<'' | 'trace' | 'mtu'>('');
  const [hops, setHops] = useState<NetTraceHop[] | null>(null);
  const [mtu, setMtu] = useState<{ mtu?: number | null; probes?: number; error?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trace = async () => {
    setBusy('trace'); setError(null); setHops(null);
    try {
      const r = await net()?.traceHops?.({ host, maxHops: 20 });
      if (r?.ok) setHops(r.hops || []); else setError(r?.error || 'erro');
    } catch (e: any) { setError(e?.message ?? String(e)); } finally { setBusy(''); }
  };
  const findMtu = async () => {
    setBusy('mtu'); setMtu(null);
    try { setMtu(await net()?.mtuDiscover?.({ host }) ?? { error: 'API indisponível' }); }
    catch (e: any) { setMtu({ error: e?.message ?? String(e) }); } finally { setBusy(''); }
  };
  const maxBest = Math.max(1, ...(hops || []).map((h) => h.best ?? 0));

  return (
    <div className="grid grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] gap-6 animate-in">
      <div className="space-y-4">
        <div>
          <label htmlFor="netx-route-host" className="dh-label block mb-1.5">{t('net.hostIp', 'Host / IP')}</label>
          <input id="netx-route-host" className="dh-input w-full font-mono" spellCheck={false} value={host} onChange={(e) => setHost(e.target.value)} />
        </div>
        <button className="dh-btn dh-btn-primary w-full" onClick={trace} disabled={!!busy || !host}>
          {busy === 'trace' ? <Loader2 size={14} className="animate-spin" /> : <Route size={14} />}
          <span>{busy === 'trace' ? t('netx.tracing', 'Rastreando (até 40 s)...') : t('netx.trace', 'Traceroute por salto')}</span>
        </button>
        <div className="border-t border-zinc-800/80 pt-4 space-y-2">
          <p className="dh-label">{t('netx.mtuTitle', 'Descoberta de MTU')}</p>
          <p className="dh-help">{t('netx.mtuHelp', 'Envia pings com "não fragmentar" (ping -f -l) em busca binária para achar o maior pacote que passa sem quebrar.')}</p>
          <button className="dh-btn w-full" onClick={findMtu} disabled={!!busy || !host}>
            {busy === 'mtu' ? <Loader2 size={14} className="animate-spin" /> : <Gauge size={14} />}
            <span>{busy === 'mtu' ? t('net.running', 'Executando...') : t('netx.mtuRun', 'Descobrir MTU do caminho')}</span>
          </button>
          {mtu ? (
            mtu.error ? <p role="alert" className="text-[12.5px] text-red-400">{mtu.error}</p> : (
              <div>
                <p className="font-mono text-[24px] leading-none text-zinc-50">{mtu.mtu}<span className="ml-1 text-[12px] text-zinc-500">bytes</span></p>
                <p className="dh-help mt-1.5">
                  {mtu.mtu === 1500
                    ? t('netx.mtuOk', 'O caminho aceita o MTU padrão de 1500. Não mude nada.')
                    : t('netx.mtuLow', 'O caminho é menor que 1500 (PPPoE, VPN ou túnel). O Windows normalmente ajusta isso sozinho (PMTUD); só fixe o MTU do adaptador se houver sites que não carregam.')}
                  {' '}({mtu.probes} {t('netx.probes', 'testes')})
                </p>
              </div>
            )
          ) : null}
        </div>
      </div>
      <section className="min-w-0" aria-labelledby="netx-hops">
        <h2 id="netx-hops" className="dh-section-title mb-3">{t('netx.hops', 'Saltos')}</h2>
        {error ? <p role="alert" className="mb-3 text-[12.5px] text-red-400">{error}</p> : null}
        {busy === 'trace' ? (
          <div className="space-y-2">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-7 rounded-md bg-zinc-900 animate-pulse" />)}</div>
        ) : !hops ? (
          <p className="py-10 text-[12.5px] text-zinc-500">{t('netx.traceEmpty', 'Mostra a latência de cada roteador até o destino. Um salto que sobe e continua alto daí em diante aponta onde está o atraso; um salto isolado alto (que some no próximo) é só o roteador ignorando ping.')}</p>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-[11px] text-zinc-500 text-left border-b border-zinc-800/80">
                <th className="font-normal py-2 w-10">#</th>
                <th className="font-normal py-2">IP</th>
                <th className="font-normal py-2 w-40">RTT (3x)</th>
                <th className="font-normal py-2 w-[38%]">{t('netx.best', 'Melhor')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {hops.map((h) => (
                <tr key={h.hop}>
                  <td className="py-1.5 font-mono text-zinc-400">{h.hop}</td>
                  <td className="py-1.5 font-mono text-zinc-200">{h.ip ?? <span className="text-zinc-500">{t('netx.noReply', 'sem resposta')}</span>}</td>
                  <td className="py-1.5 font-mono text-zinc-400">{h.rtts.map((r) => (r === null ? '*' : r < 1 ? '<1' : r)).join(' / ')}</td>
                  <td className="py-1.5">
                    {h.best === null ? <span className="text-zinc-600">—</span> : (
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 rounded-full bg-blue-400/80" style={{ width: `${Math.max(3, (h.best / maxBest) * 100)}%` }} />
                        <span className="font-mono text-zinc-300 shrink-0">{h.best < 1 ? '<1' : h.best} ms</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ bufferbloat
export function BufferbloatPanel() {
  const { t } = useI18n();
  const [host, setHost] = useState('1.1.1.1');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<NetBufferbloatResult | null>(null);

  const run = async () => {
    setBusy(true); setRes(null);
    try { setRes(await net()?.bufferbloat?.({ host, seconds: 10 }) ?? { ok: false, error: 'API indisponível' }); }
    catch (e: any) { setRes({ ok: false, error: e?.message ?? String(e) }); } finally { setBusy(false); }
  };
  const gradeTone = (g?: string) => (g === 'A+' || g === 'A' ? 'text-emerald-400' : g === 'B' ? 'text-amber-300' : 'text-red-400');

  return (
    <div className="animate-in max-w-3xl space-y-5">
      <p className="dh-help">{t('netx.bloatHelp', 'Mede o ping parado e de novo enquanto o DarkHub baixa dados de speed.cloudflare.com a toda velocidade. Se o ping sobe muito, o roteador/modem enche a fila (bufferbloat): é isso que causa lag quando alguém assiste vídeo ou baixa algo na mesma rede. Usa alguns centenas de MB de dados e leva cerca de 20 s.')}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="netx-bloat-host" className="dh-label block mb-1.5">{t('netx.pingTarget', 'Alvo do ping')}</label>
          <input id="netx-bloat-host" className="dh-input w-56 font-mono" spellCheck={false} value={host} onChange={(e) => setHost(e.target.value)} disabled={busy} />
        </div>
        <button className="dh-btn dh-btn-primary" onClick={run} disabled={busy || !host}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
          <span>{busy ? t('netx.bloatRunning', 'Medindo (parado → sob carga)...') : t('netx.bloatRun', 'Testar bufferbloat')}</span>
        </button>
      </div>
      {res && !res.ok ? <p role="alert" className="text-[12.5px] text-red-400">{res.error}</p> : null}
      {res?.ok ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 border-y border-zinc-800/80 py-5">
            <div>
              <p className="text-[11.5px] text-zinc-500">{t('netx.grade', 'Nota')}</p>
              <p className={`mt-1 font-mono text-[34px] leading-none ${gradeTone(res.grade)}`}>{res.grade}</p>
            </div>
            <Metric label={t('netx.idle', 'Ping parado (mediana)')} value={fmt(res.idle?.median)} />
            <Metric label={t('netx.loaded', 'Ping sob carga (mediana)')} value={fmt(res.loaded?.median)} />
            <Metric label={t('netx.added', 'Latência adicionada')} value={`+${fmt(res.added)}`} tone={(res.added ?? 0) >= 60 ? 'bad' : (res.added ?? 0) >= 30 ? 'warn' : undefined} />
            <Metric label={t('netx.down', 'Download durante o teste')} value={fmt(res.downMbps, 'Mbps')} />
          </div>
          <p className="dh-help">
            {t('netx.jitterLoaded', 'Jitter sob carga')}: {fmt(res.loaded?.jitter)} · {t('netx.loss', 'Perda')}: {fmt(res.loaded?.lossPct, '%')}
          </p>
          <p className="text-[12.5px] text-zinc-300">
            {res.grade === 'A+' || res.grade === 'A'
              ? t('netx.bloatGood', 'Sua conexão segura bem a latência sob carga. Nada a fazer.')
              : t('netx.bloatBad', 'A latência sobe muito sob carga. Nenhum ajuste do Windows resolve isso: ative SQM / Smart Queue / QoS (fq_codel ou CAKE) no roteador, limitando a banda a ~90% do contratado, ou use cabo em vez de Wi-Fi.')}
          </p>
        </>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ DNS (reuses the optimizer DNS engine)
type DnsRow = { name: string; primary: string; secondary: string; trusted: boolean; latencyMs: number | null; successRate: number };

export function DnsBenchPanel() {
  const { t } = useI18n();
  const opt = () => window.darkhub?.optimizer;
  const [current, setCurrent] = useState<{ adapter?: string; servers?: string[]; isStatic?: boolean } | null>(null);
  const [rows, setRows] = useState<DnsRow[] | null>(null);
  const [failed, setFailed] = useState(0);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadState = useCallback(async () => {
    try { const r = await opt()?.getDnsState?.(); if (r?.ok) setCurrent(r); } catch { /* ignore */ }
  }, []);
  useEffect(() => { loadState(); }, [loadState]);

  const bench = async () => {
    setBusy('bench'); setMsg(null);
    try {
      const r = await opt()?.dnsBenchmark?.({ timeoutMs: 1500, attempts: 3, concurrency: 6 });
      if (r?.ok) { setRows(r.results || []); setFailed(r.failed || 0); } else setMsg({ ok: false, text: r?.error || 'erro' });
    } catch (e: any) { setMsg({ ok: false, text: e?.message ?? String(e) }); } finally { setBusy(''); }
  };
  const apply = async (row: DnsRow) => {
    setBusy(row.primary); setMsg(null);
    try {
      const r = await opt()?.applyDns?.({ primary: row.primary, secondary: row.secondary });
      setMsg({ ok: !!r?.ok, text: r?.ok ? r.msg : (r?.error || 'erro') });
      await loadState();
    } catch (e: any) { setMsg({ ok: false, text: e?.message ?? String(e) }); } finally { setBusy(''); }
  };
  const undo = async () => {
    setBusy('undo'); setMsg(null);
    try {
      const r = await opt()?.undoDns?.({});
      setMsg({ ok: !!r?.ok, text: r?.ok ? r.msg : (r?.error || 'erro') });
      await loadState();
    } catch (e: any) { setMsg({ ok: false, text: e?.message ?? String(e) }); } finally { setBusy(''); }
  };
  const best = rows?.find((r) => r.trusted);

  return (
    <div className="animate-in max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button className="dh-btn dh-btn-primary" onClick={bench} disabled={!!busy}>
          {busy === 'bench' ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
          <span>{busy === 'bench' ? t('netx.dnsRunning', 'Medindo resolvedores...') : t('netx.dnsRun', 'Comparar servidores DNS')}</span>
        </button>
        {best ? (
          <button className="dh-btn" onClick={() => apply(best)} disabled={!!busy}>
            <CheckCircle2 size={14} /><span>{t('netx.dnsApplyBest', 'Usar o mais rápido')} ({best.name})</span>
          </button>
        ) : null}
        <button className="dh-btn dh-btn-ghost" onClick={undo} disabled={!!busy}>
          {busy === 'undo' ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
          <span>{t('netx.dnsUndo', 'Restaurar DNS anterior')}</span>
        </button>
        <span className="dh-tag">{t('netx.admin', 'Pede administrador')}</span>
      </div>
      <p className="dh-help">
        {t('netx.dnsCurrent', 'DNS atual')}{current?.adapter ? ` (${current.adapter})` : ''}: <span className="font-mono text-zinc-300">{current?.servers?.join(', ') || '—'}</span>
        {current ? ` · ${current.isStatic ? t('netx.dnsStatic', 'manual') : t('netx.dnsAuto', 'automático (DHCP)')}` : ''}
      </p>
      <p className="dh-help">{t('netx.dnsHelp', 'Mede o tempo real de resposta (consulta UDP válida, mediana de 3 após aquecer). DNS mais rápido acelera o início das conexões; não muda o ping dentro do jogo.')}</p>
      {msg ? <p role={msg.ok ? 'status' : 'alert'} className={`text-[12.5px] ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p> : null}
      {busy === 'bench' ? (
        <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-7 rounded-md bg-zinc-900 animate-pulse" />)}</div>
      ) : rows ? (
        <>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-[11px] text-zinc-500 text-left border-b border-zinc-800/80">
                <th className="font-normal py-2">{t('netx.dnsServer', 'Servidor')}</th>
                <th className="font-normal py-2">IP</th>
                <th className="font-normal py-2 w-28">{t('netx.dnsLatency', 'Resposta')}</th>
                <th className="font-normal py-2 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {rows.map((r) => (
                <tr key={r.primary}>
                  <td className="py-1.5 text-zinc-200">{r.name}{r.trusted ? null : <span className="ml-2 text-[11px] text-amber-300">{t('netx.dnsUnverified', 'operador não verificado')}</span>}</td>
                  <td className="py-1.5 font-mono text-zinc-400">{r.primary} / {r.secondary}</td>
                  <td className="py-1.5 font-mono text-zinc-200">{fmt(r.latencyMs)}</td>
                  <td className="py-1.5 text-right">
                    {r.trusted ? (
                      <button className="dh-btn dh-btn-sm" onClick={() => apply(r)} disabled={!!busy}>
                        {busy === r.primary ? <Loader2 size={12} className="animate-spin" /> : null}{t('netx.use', 'Usar')}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {failed ? <p className="dh-help">{failed} {t('netx.dnsFailed', 'servidor(es) não responderam e foram omitidos.')}</p> : null}
        </>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ reversible tweaks
type TweakDef = { id: NetLatencyTweakId; title: string; desc: string; current: string };

export function LatencyTweaksPanel() {
  const { t } = useI18n();
  const [state, setState] = useState<NetLatencyState | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [exe, setExe] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setState(await net()?.latencyState?.() ?? { ok: false, error: 'API indisponível' }); }
    catch (e: any) { setState({ ok: false, error: e?.message ?? String(e) }); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (key: string, fn: () => Promise<{ ok: boolean; msg?: string; error?: string } | undefined>) => {
    setBusy(key); setMsg(null);
    try {
      const r = await fn();
      setMsg({ ok: !!r?.ok, text: (r?.ok ? r.msg : r?.error) || '' });
    } catch (e: any) { setMsg({ ok: false, text: e?.message ?? String(e) }); }
    finally { setBusy(''); await load(); }
  };
  const apply = (id: NetLatencyTweakId, extra: { value?: string; exe?: string } = {}) => act(`apply:${id}${extra.value ?? ''}`, () => net()?.applyLatencyTweak?.({ id, ...extra }) as any);
  const restore = (id: NetLatencyTweakId) => act(`restore:${id}`, () => net()?.restoreLatencyTweak?.({ id }) as any);

  const adapters = state?.adapters ?? [];
  const propText = (k: string) => adapters.map((a) => `${a.name}: ${a.props?.[k] ? (a.props[k].display || a.props[k].value) : t('netx.na', 'não suportado')}`).join(' · ') || '—';
  const powerText = adapters.map((a) => `${a.name}: ${a.power === 'Enabled' ? t('netx.on', 'ligado') : a.power === 'Disabled' ? t('netx.off', 'desligado') : t('netx.na', 'não suportado')}`).join(' · ') || '—';

  const defs: TweakDef[] = [
    { id: 'interruptModeration', title: t('netx.tw.im', 'Desligar moderação de interrupções do adaptador'), desc: t('netx.tw.imDesc', 'A placa deixa de agrupar pacotes antes de avisar a CPU: cada pacote chega até ~0,1 a 0,5 ms antes, ao custo de mais interrupções (mais CPU em downloads grandes). Só muda adaptadores que expõem *InterruptModeration.'), current: propText('*InterruptModeration') },
    { id: 'flowControl', title: t('netx.tw.fc', 'Desligar controle de fluxo (pause frames)'), desc: t('netx.tw.fcDesc', 'Evita que o switch/roteador pause a placa por alguns ms quando enche, o que causa picos de ping. Em redes muito congestionadas pode aumentar perda; restaure se notar isso.'), current: propText('*FlowControl') },
    { id: 'powerSaving', title: t('netx.tw.ps', 'Impedir o Windows de desligar o adaptador'), desc: t('netx.tw.psDesc', 'Desmarca "O computador pode desligar este dispositivo para economizar energia". Evita quedas e reconexões após ociosidade (comum em Wi-Fi e notebooks).'), current: powerText }
  ];

  // plain render helper (not a component): a nested component type would remount the QoS input on every keystroke
  const card = (d: TweakDef, children?: React.ReactNode) => (
    <li key={d.id} className="py-4 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-3">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-zinc-100 flex items-center gap-2">{d.title}<span className="dh-tag">{t('netx.admin', 'Pede administrador')}</span></p>
        <p className="dh-help mt-1">{d.desc}</p>
        <p className="mt-1.5 text-[11.5px] text-zinc-400"><span className="text-zinc-500">{t('netx.currentValue', 'Agora')}:</span> <span className="font-mono">{d.current}</span></p>
      </div>
      <div className="flex items-start gap-2 md:justify-end">
        {children ?? (
          <button className="dh-btn dh-btn-sm dh-btn-primary" onClick={() => apply(d.id)} disabled={!!busy || loading}>
            {busy === `apply:${d.id}` ? <Loader2 size={12} className="animate-spin" /> : null}{t('netx.apply', 'Aplicar')}
          </button>
        )}
        <button className="dh-btn dh-btn-sm" onClick={() => restore(d.id)} disabled={!!busy || !state?.saved?.[d.id]} title={state?.saved?.[d.id] ? '' : t('netx.nothingSaved', 'Nada salvo para restaurar')}>
          {busy === `restore:${d.id}` ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}{t('netx.restore', 'Restaurar')}
        </button>
      </div>
    </li>
  );

  const ecnDef: TweakDef = { id: 'ecn', title: t('netx.tw.ecn', 'ECN (notificação explícita de congestionamento)'), desc: t('netx.tw.ecnDesc', 'Com ECN o roteador avisa congestionamento marcando pacotes em vez de descartá-los: ajuda quando o roteador tem SQM (fq_codel/CAKE). Alguns roteadores antigos ou servidores de jogo tratam mal pacotes marcados; nesse caso, desligue.'), current: state?.tcp?.ecn || '—' };
  const qosDef: TweakDef = { id: 'qos', title: t('netx.tw.qos', 'Prioridade QoS (DSCP 46) para um jogo'), desc: t('netx.tw.qosDesc', 'Cria uma política do Windows que marca o tráfego do executável com DSCP 46 (Expedited Forwarding). Só tem efeito se o roteador/rede respeitar DSCP (roteadores com QoS/SQM configurado); a maioria dos provedores ignora a marcação.'), current: (state?.qos ?? []).map((q) => `${q.app} → DSCP ${q.dscp}`).join(' · ') || t('netx.none', 'nenhuma') };

  return (
    <div className="animate-in max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button className="dh-btn dh-btn-sm" onClick={load} disabled={loading || !!busy}>
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}{t('netx.reload', 'Reler estado')}
        </button>
        <p className="dh-help flex items-center gap-1.5"><Shield size={13} className="text-zinc-500" />{t('netx.tweaksHelp', 'Cada ajuste lê o valor atual antes de mudar, guarda o anterior e pode ser restaurado. Mudanças no adaptador podem derrubar a conexão por 1 a 3 s.')}</p>
      </div>
      {state && !state.ok ? <p role="alert" className="text-[12.5px] text-red-400">{state.error}</p> : null}
      {msg ? <p role={msg.ok ? 'status' : 'alert'} className={`text-[12.5px] ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p> : null}

      <ul className="divide-y divide-zinc-800/80 border-y border-zinc-800/80">
        {defs.map((d) => card(d))}
        {card(ecnDef, <>
          <button className="dh-btn dh-btn-sm" onClick={() => apply('ecn', { value: 'Enabled' })} disabled={!!busy || loading || state?.tcp?.ecn === 'Enabled'}>
            {busy === 'apply:ecnEnabled' ? <Loader2 size={12} className="animate-spin" /> : null}{t('netx.enable', 'Ligar')}
          </button>
          <button className="dh-btn dh-btn-sm" onClick={() => apply('ecn', { value: 'Disabled' })} disabled={!!busy || loading || state?.tcp?.ecn === 'Disabled'}>
            {busy === 'apply:ecnDisabled' ? <Loader2 size={12} className="animate-spin" /> : null}{t('netx.disable', 'Desligar')}
          </button>
        </>)}
        {card(qosDef, <>
          <input aria-label={t('netx.exe', 'Executável do jogo')} className="dh-input h-8 w-40 font-mono text-[12px]" placeholder="cs2.exe" spellCheck={false} value={exe} onChange={(e) => setExe(e.target.value)} />
          <button className="dh-btn dh-btn-sm dh-btn-primary" onClick={() => apply('qos', { exe: exe.trim() })} disabled={!!busy || loading || !/^[A-Za-z0-9 _.()+-]{1,96}\.exe$/i.test(exe.trim())}>
            {busy === 'apply:qos' ? <Loader2 size={12} className="animate-spin" /> : null}{t('netx.create', 'Criar')}
          </button>
        </>)}
      </ul>

      <section aria-labelledby="netx-state" className="space-y-2">
        <h2 id="netx-state" className="dh-section-title">{t('netx.stateTitle', 'Estado atual da pilha de rede (somente leitura)')}</h2>
        <table className="w-full text-[12.5px]">
          <tbody className="divide-y divide-zinc-800/60">
            {adapters.map((a) => (
              <tr key={a.name}>
                <td className="py-1.5 text-zinc-300 w-56">{a.name}<span className="block text-[11px] text-zinc-500 truncate">{a.description}</span></td>
                <td className="py-1.5 font-mono text-zinc-400">{a.linkSpeed} · MTU {a.mtu ?? '—'} · EEE {a.props?.['*EEE']?.display || t('netx.na', 'não suportado')} · Nagle {a.tcpNoDelay === 1 && a.tcpAckFrequency === 1 ? t('netx.off', 'desligado') : t('netx.default', 'padrão')}</td>
              </tr>
            ))}
            <tr><td className="py-1.5 text-zinc-300">TCP (InternetCustom)</td><td className="py-1.5 font-mono text-zinc-400">ECN {state?.tcp?.ecn || '—'} · Autotuning {state?.tcp?.autotuning || '—'} · Timestamps {state?.tcp?.timestamps || '—'}</td></tr>
            <tr><td className="py-1.5 text-zinc-300">Offload</td><td className="py-1.5 font-mono text-zinc-400">RSS {state?.offload?.rss || '—'} · RSC {state?.offload?.rsc || '—'}</td></tr>
            <tr><td className="py-1.5 text-zinc-300">MMCSS</td><td className="py-1.5 font-mono text-zinc-400">NetworkThrottlingIndex {state?.mmcss?.networkThrottlingIndex ?? t('netx.default', 'padrão')} · SystemResponsiveness {state?.mmcss?.systemResponsiveness ?? '—'}</td></tr>
          </tbody>
        </table>
        <p className="dh-help flex items-start gap-1.5">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-zinc-500" />
          {t('netx.elsewhere', 'Nagle (TcpAckFrequency/TCPNoDelay por adaptador), Energy-Efficient Ethernet, RSS/RSC, timestamps/autotuning e NetworkThrottlingIndex/SystemResponsiveness já existem, com restauração, no Otimizador do Sistema (itens "Rede: TCP NoDelay/AckFrequency por adaptador, EEE off, QoS", "Pilha TCP: RSC desligado, RSS ligado, timestamps off" e "Prioridade Multimídia para Jogos (MMCSS)"). Limpar DNS e redefinir Winsock ficam na aba Diagnósticos.')}
        </p>
      </section>
    </div>
  );
}
