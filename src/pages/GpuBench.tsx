import React, { useEffect, useState } from 'react';
import { Play, Square, Loader2, Trash2, AlertTriangle, Info } from '../components/icons';
import PageHeader from '../components/ui/PageHeader';
import RankingTop from '../components/gpubench/RankingTop';
import RunOverlay from '../components/gpubench/RunOverlay';
import StressPanel from '../components/gpubench/StressPanel';
import { useI18n } from '../i18n/I18nProvider';
import type { GpuBenchRun, GpuBenchProgress, GpuStressRun } from '../global';

const num = (v: number | null | undefined) => (v == null ? '-' : Math.round(v).toLocaleString());

export default function GpuBench() {
  const { t } = useI18n();
  const [runs, setRuns] = useState<GpuBenchRun[]>([]);
  const [stressRuns, setStressRuns] = useState<GpuStressRun[]>([]);
  const [stressing, setStressing] = useState(false);
  const [engine, setEngine] = useState(true);
  const [linked, setLinked] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<GpuBenchProgress | null>(null);
  const [quick, setQuick] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const api = () => window.darkhub?.gpubench;
  const load = async () => {
    const s = await api()?.status().catch(() => null);
    if (!s?.ok) return;
    setRuns(s.runs);
    setStressRuns(s.stress ?? []);
    setEngine(s.engine);
    setLinked(s.linked);
  };

  useEffect(() => {
    void load();
    return api()?.onEvent((e) => {
      if (e.type === 'link') setLinking(e.code);
      else if (e.type === 'progress') setProgress(e);
    });
  }, []);

  const errorText = (code: string) => ({
    engine_missing: t('gpubench.err.engine', 'O motor do benchmark não foi encontrado nesta instalação.'),
    not_linked: t('gpubench.err.notLinked', 'Conecte sua conta do Hub para enviar ao ranking.'),
    already_running: t('gpubench.err.running', 'Um benchmark já está rodando.'),
    no_secure_storage: t('gpubench.err.storage', 'O Windows não ofereceu armazenamento seguro para guardar a conexão.'),
    expired: t('gpubench.err.expired', 'O código expirou. Tente conectar de novo.'),
    integrity_failed: t('gpubench.err.integrity', 'O motor do benchmark foi alterado ou está corrompido. Reinstale o DarkHub.'),
    hub_unavailable: t('gpubench.err.hub', 'O Hub não respondeu agora. Tente de novo mais tarde; o teste local funciona normalmente.')
  } as Record<string, string>)[code] ?? code;

  const run = async (ranked: boolean) => {
    setRunning(true);
    setError(null);
    setProgress(null);
    const r = await api()?.run({ ranked, quick: !ranked && quick }).catch((e) => ({ ok: false as const, error: String(e?.message ?? e) }));
    setRunning(false);
    setProgress(null);
    if (!r?.ok && r?.error !== 'cancelled') setError(r?.error ?? 'error');
    await load();
  };

  const link = async () => {
    setError(null);
    setLinking('');
    const r = await api()?.link().catch((e) => ({ ok: false as const, error: String(e?.message ?? e) }));
    setLinking(null);
    if (!r?.ok && r?.error !== 'cancelled') setError(r?.error ?? 'error');
    await load();
  };

  const unlink = async () => { await api()?.unlink(); await load(); };
  const remove = async (id: string) => {
    if (!window.confirm(t('gpubench.confirmDelete', 'Apagar este resultado do histórico deste PC?'))) return;
    await api()?.remove({ id });
    await load();
  };

  const testName = (k: string) => (k === 'rt' ? t('gpubench.rt', 'Ray tracing') : t('gpubench.raster', 'Rasterização'));
  const statusName = (s: string) => ({
    local: t('gpubench.status.local', 'Local, fora do ranking'),
    verified: t('gpubench.status.verified', 'Verificado'),
    review: t('gpubench.status.review', 'Em revisão'),
    rejected: t('gpubench.status.rejected', 'Recusado')
  } as Record<string, string>)[s] ?? s;
  const statusClass = (s: string) => ({ verified: 'text-emerald-400', review: 'text-amber-300', rejected: 'text-red-400' } as Record<string, string>)[s] ?? 'text-zinc-500';
  const phaseText = (p: GpuBenchProgress) => {
    if (p.phase === 'warm') return `${t('gpubench.phase.warm', 'Aquecendo a GPU')} · ${testName(p.test)}`;
    if (p.phase === 'proof') return t('gpubench.phase.proof', 'Enviando a prova deste trecho...');
    if (p.phase === 'finish') return t('gpubench.phase.finish', 'Aguardando a verificação do servidor...');
    return `${testName(p.test)} · ${p.index}/${p.total}`;
  };

  const latest = runs[0];
  const scores = latest ? [
    { key: 'total', label: t('gpubench.total', 'Pontuação'), value: latest.score.total ?? latest.score.raster, big: true },
    { key: 'raster', label: testName('raster'), value: latest.score.raster, fps: latest.stats.raster },
    { key: 'rt', label: testName('rt'), value: latest.score.rt, fps: latest.stats.rt }
  ] : [];

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      <PageHeader
        title={t('nav.gpubench', 'Benchmark de GPU')}
        subtitle={t('gpubench.subtitle', 'Teste sintético de rasterização e ray tracing em 2560×1440, com a mesma carga em qualquer PC. Compare sua pontuação no ranking público.')}
      />

      <section className="dh-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[12.5px] text-zinc-300 select-none">
            <input type="checkbox" checked={quick} onChange={(e) => setQuick(e.target.checked)} disabled={running} />
            {t('gpubench.quick', 'Rápido (só teste local)')}
          </label>
          {running ? (
            <button type="button" onClick={() => void api()?.cancel()} className="dh-btn dh-btn-danger ml-auto"><Square size={14} />{t('gpubench.cancel', 'Cancelar')}</button>
          ) : (
            <div className="flex flex-wrap gap-2 ml-auto">
              <button type="button" disabled={!engine || stressing} onClick={() => void run(false)} className="dh-btn"><Play size={14} />{t('gpubench.runLocal', 'Rodar teste local')}</button>
              <button type="button" disabled={!engine || !linked || stressing} onClick={() => void run(true)} className="dh-btn dh-btn-primary"><Play size={14} />{t('gpubench.runRanked', 'Rodar e enviar ao ranking')}</button>
            </div>
          )}
        </div>
        {running && (
          <p className="flex items-center gap-2 text-[12.5px] text-zinc-300">
            <Loader2 size={14} className="animate-spin" />
            {progress ? phaseText(progress) : t('gpubench.preparing', 'Abrindo o motor...')}
          </p>
        )}
        <p className="flex items-start gap-2 dh-help"><Info size={13} className="mt-0.5 shrink-0" />{t('gpubench.tip', 'O teste roda aqui mesmo, ocupando a tela do DarkHub. Feche jogos e navegadores antes: tudo que usa a GPU reduz a pontuação. O teste completo leva cerca de 2 minutos.')}</p>
        {!engine && <p role="alert" className="flex items-center gap-2 text-[12.5px] text-red-400"><AlertTriangle size={14} />{errorText('engine_missing')}</p>}
        {error && <p role="alert" className="flex items-center gap-2 text-[12.5px] text-red-400"><AlertTriangle size={14} />{errorText(error)}</p>}
      </section>

      {running && <RunOverlay title={t('nav.gpubench', 'Benchmark de GPU')} status={progress ? phaseText(progress) : t('gpubench.preparing', 'Abrindo o motor...')} percent={progress?.total ? (progress.index / progress.total) * 100 : 0} onCancel={() => void api()?.cancel()} />}

      {latest && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="dh-section-title">{t('gpubench.latest', 'Último resultado')}</h2>
            <span className="text-[12.5px] text-zinc-400">{latest.gpu.name}</span>
            <span className={`text-[12.5px] ${statusClass(latest.status)}`}>{statusName(latest.status)}</span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {scores.map((s) => (
              <div key={s.key} className="dh-card p-4">
                <p className="text-[12.5px] text-zinc-400">{s.label}</p>
                <p className={`font-mono tabular-nums ${s.big ? 'text-3xl text-blue-400' : 'text-2xl text-zinc-100'}`}>{num(s.value)}</p>
                {s.fps && <p className="text-[12px] text-zinc-500 font-mono tabular-nums">{s.fps.fps.toFixed(1)} FPS · 1% {s.fps.low1.toFixed(1)}</p>}
                {s.key === 'rt' && !latest.gpu.dxr && <p className="text-[12px] text-zinc-500">{t('gpubench.noDxr', 'Esta GPU não tem DXR 1.1')}</p>}
              </div>
            ))}
          </div>
          {latest.sensors.samples > 0 && (
            <p className="text-[12.5px] text-zinc-400 font-mono tabular-nums">
              {num(latest.sensors.gpuClockAvg)} MHz · {num(latest.sensors.gpuTempMax)} °C {t('gpubench.max', 'máx')}{latest.sensors.gpuPowerAvg != null ? ` · ${num(latest.sensors.gpuPowerAvg)} W` : ''}
            </p>
          )}
          {latest.driver && latest.driver.length > 0 && (
            <p className="text-[12.5px] text-zinc-400">
              {latest.driver[0] === 'driver_unaudited'
                ? t('gpubench.driver.unaudited', 'Configurações do driver não conferidas nesta GPU.')
                : `${t('gpubench.driver.changed', 'Painel do driver fora do padrão')}: ${latest.driver.map((f) => f.replace('driver_', '').replace(/_/g, ' ')).join(', ')}`}
            </p>
          )}
          {latest.flags.length > 0 && <p className="text-[12.5px] text-amber-300">{t('gpubench.flags', 'Avisos do servidor')}: {latest.flags.join(', ')}</p>}
        </section>
      )}

      <section className="dh-card p-4 space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="dh-section-title">{t('gpubench.ranking', 'Ranking')}</h2>
          <div className="flex flex-wrap gap-2 ml-auto">
            <button type="button" onClick={() => void api()?.openRanking({})} className="dh-btn dh-btn-ghost dh-btn-sm">{t('gpubench.openRanking', 'Ver ranking')}</button>
            {linked
              ? <button type="button" onClick={() => void unlink()} className="dh-btn dh-btn-ghost dh-btn-sm">{t('gpubench.unlink', 'Desconectar conta')}</button>
              : <button type="button" disabled={linking != null} onClick={() => void link()} className="dh-btn dh-btn-primary dh-btn-sm">{t('gpubench.link', 'Conectar conta do Hub')}</button>}
          </div>
        </div>
        <RankingTop onOpen={(id) => void api()?.openRanking({ id })} />
        {linking != null && <p className="text-[12.5px] text-zinc-300">{t('gpubench.linkHelp', 'Confirme no navegador com o GitHub.')}{linking ? ` ${t('gpubench.linkCode', 'Código')}: ${linking}` : ''}</p>}
        <p className="dh-help">{t('gpubench.fair', 'Resultados enviados são conferidos pelo servidor: ele escolhe trechos do teste e recalcula o que deveria aparecer na tela. Resultados fora do padrão da GPU e o topo do ranking passam por revisão antes de aparecer.')}</p>
      </section>

      <StressPanel runs={stressRuns} engine={engine} blocked={running} onBusy={setStressing} onDone={load} />

      <section>
        <h2 className="dh-section-title mb-2">{t('gpubench.history', 'Resultados neste PC')}</h2>
        {runs.length === 0 ? <p className="dh-help">{t('gpubench.empty', 'Nenhum resultado ainda.')}</p> : (
          <div className="rounded-xl border border-zinc-800/80 divide-y divide-zinc-900">
            {runs.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-3 py-2 text-[12.5px] min-w-0">
                <span className="text-zinc-200 truncate flex-1">{new Date(r.at).toLocaleString()} · {r.gpu.name}</span>
                <span className={`shrink-0 hidden md:inline ${statusClass(r.status)}`}>{statusName(r.status)}</span>
                <span className="font-mono tabular-nums text-zinc-300 shrink-0">{num(r.score.total ?? r.score.raster)}</span>
                {r.status !== 'local' && <button type="button" onClick={() => void api()?.openRanking({ id: r.id })} className="dh-btn dh-btn-ghost dh-btn-sm shrink-0">{t('gpubench.report', 'Relatório')}</button>}
                <button type="button" onClick={() => void remove(r.id)} className="dh-btn dh-btn-ghost dh-btn-sm shrink-0" aria-label={t('gpubench.delete', 'Apagar')}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
