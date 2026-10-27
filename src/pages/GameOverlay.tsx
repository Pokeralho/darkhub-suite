import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, Info, AlertTriangle, FolderOpen, RefreshCw } from '../components/icons';
import PageHeader from '../components/ui/PageHeader';
import { useI18n } from '../i18n/I18nProvider';
import type { OverlayStatus, OverlaySettings } from '../global';

const METRICS = ['fps', 'low1', 'frametime', 'graph', 'latency', 'cpu', 'cpuTemp', 'cpuPower', 'gpu', 'gpuTemp', 'vram', 'gpuClock', 'ram'];
const n = (v: number | null | undefined, d = 0) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(d));

export default function GameOverlay({ onNavigate }: { onNavigate?: (page: string) => void } = {}) {
  const { t } = useI18n();
  const [st, setSt] = useState<OverlayStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [procs, setProcs] = useState<{ pid: number; name: string; wsMb: number }[]>([]);
  const [pick, setPick] = useState('');
  const [hotkey, setHotkey] = useState('');
  const api = () => window.darkhub?.overlay;

  const metricLabel = (m: string) => ({
    fps: 'FPS', low1: t('ovl.m.low1', '1% low (FPS)'), frametime: t('ovl.m.frametime', 'Tempo de quadro'), graph: t('ovl.m.graph', 'Gráfico de frame time'),
    latency: t('ovl.m.latency', 'Latência (clique até a tela)'), cpu: t('ovl.m.cpu', 'Uso da CPU'), cpuTemp: t('ovl.m.cpuTemp', 'Temperatura da CPU'),
    cpuPower: t('ovl.m.cpuPower', 'Consumo da CPU'), gpu: t('ovl.m.gpu', 'Uso da GPU'), gpuTemp: t('ovl.m.gpuTemp', 'Temperatura da GPU'),
    vram: 'VRAM', gpuClock: t('ovl.m.gpuClock', 'Clock da GPU'), ram: t('ovl.m.ram', 'Uso da RAM')
  } as Record<string, string>)[m] ?? m;

  useEffect(() => {
    // labels drawn by the overlay window, in the app language
    void api()?.setSettings({ labels: {
      fps: 'FPS', low1: '1% low', frametime: t('ovl.l.frame', 'Frame'), latency: t('ovl.l.latency', 'Latência'), cpuTemp: 'CPU °C', cpuPower: 'CPU W', gpuTemp: 'GPU °C', gpuClock: 'GPU MHz',
      avg: t('ovl.l.avg', 'média'), max: t('ovl.l.max', 'máx'), load: t('ovl.l.load', 'Uso %'), temps: t('ovl.l.temps', 'Temp °C'), threads: t('ovl.l.threads', 'Threads da CPU'),
      hotspot: 'hotspot', memJunction: t('ovl.l.memJunction', 'mem'), maxThread: t('ovl.l.maxThread', 'thread mais usada'), session: t('ovl.l.session', 'Sessão'),
      avgFps: t('ovl.l.avgFps', 'FPS médio'), worstFrame: t('ovl.l.worstFrame', 'Pior quadro'), stdDev: t('ovl.l.stdDev', 'Variação (σ)'), stutters: t('ovl.l.stutters', 'Engasgos'),
      frames: t('ovl.l.frames', 'Quadros'), bound: t('ovl.l.bound', 'Limitado por'), presentMode: t('ovl.l.present', 'Apresentação')
    } })
      .then((s) => { if (s?.ok) { setSt(s); setHotkey(s.settings?.hotkey ?? ''); } });
    void api()?.layouts().then((l) => { if (l?.ok) void api()?.setSettings({ labels: Object.fromEntries(l.metrics.map((m) => [`m.${m.key}`, t(`ovle.m.${m.key}`, m.label)])) }); });
    void api()?.processes().then((r) => setProcs(r?.processes ?? []));
    const off = api()?.onEvent((s) => setSt(s));
    const timer = setInterval(() => { void api()?.status().then((s) => s?.ok && setSt(s)); }, 1000);
    return () => { off?.(); clearInterval(timer); };
  }, []);

  const set = async (patch: Partial<OverlaySettings>) => {
    setError(null);
    const r = await api()?.setSettings(patch);
    if (r?.ok) setSt(r);
    if (r?.hotkeyError) setError(r.hotkeyError === 'in-use' ? t('ovl.hotkeyInUse', 'Esse atalho já está em uso por outro programa.') : t('ovl.hotkeyInvalid', 'Atalho inválido. Exemplo: Ctrl+Shift+F9'));
  };

  const toggle = async () => {
    setBusy(true); setError(null);
    const r = st?.visible ? await api()?.hide() : await api()?.show(pick ? { pid: Number(pick) } : {});
    setBusy(false);
    if (r?.ok) setSt(r); else setError(r?.error ?? 'error');
  };

  const s = st?.settings;
  const stats = st?.stats;
  const toggleMetric = (m: string) => s && void set({ metrics: s.metrics.includes(m) ? s.metrics.filter((x) => x !== m) : [...s.metrics, m] });

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      <PageHeader
        title={t('nav.overlay', 'Overlay no jogo')}
        subtitle={t('ovl.subtitle', 'FPS, 1% low, tempo de quadro e sensores por cima do jogo. O FPS vem do PresentMon da Intel; nada é injetado no jogo.')}
      />

      <section className="rounded-xl border border-zinc-800/80 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <select className="dh-input" value={pick} onChange={(e) => setPick(e.target.value)} disabled={st?.visible} aria-label={t('ovl.target', 'Jogo')}>
            <option value="">{t('ovl.foreground', 'Automático: o app em primeiro plano')}</option>
            {procs.map((p) => <option key={p.pid} value={p.pid}>{p.name} ({p.pid})</option>)}
          </select>
          <button type="button" onClick={() => void api()?.processes().then((r) => setProcs(r?.processes ?? []))} disabled={st?.visible} className="dh-btn dh-btn-ghost dh-btn-sm" aria-label={t('ovl.reload', 'Atualizar lista')}><RefreshCw size={13} /></button>
          <button type="button" onClick={() => void toggle()} disabled={busy} className={`dh-btn ${st?.visible ? '' : 'dh-btn-primary'} ml-auto`}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : st?.visible ? <EyeOff size={14} /> : <Eye size={14} />}
            {st?.visible ? t('ovl.hide', 'Esconder overlay') : t('ovl.show', 'Mostrar overlay')}
          </button>
        </div>
        <p className="text-[12.5px] text-zinc-400">
          {t('ovl.hotkeyHint', 'Atalho para mostrar/esconder durante o jogo: {k}').replace('{k}', s?.hotkey || '—')}
          {!st?.presentMonInstalled && ` · ${t('ovl.firstUse', 'Na primeira vez o PresentMon (1 MB, assinado pela Intel) é baixado.')}`}
        </p>
        {st?.visible && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-1">
            {[
              [t('ovl.capturing', 'Capturando'), st.target ? `${st.target.name || st.target.pid}` : t('ovl.waiting', 'aguardando um jogo')],
              ['FPS', n(stats?.fps)],
              ['1% low', n(stats?.low1)],
              [t('ovl.m.frametime', 'Tempo de quadro'), stats?.frameTimeMs != null ? `${n(stats.frameTimeMs, 1)} ms` : '—'],
              [t('ovl.mode', 'Modo de apresentação'), stats?.presentMode || '—']
            ].map(([k, v]) => (
              <div key={k} className="min-w-0"><p className="text-[11.5px] text-zinc-500">{k}</p><p className="font-mono text-[14px] text-zinc-100 truncate" title={String(v)}>{v}</p></div>
            ))}
          </div>
        )}
        {stats?.presentMode && /composed/i.test(stats.presentMode) && <p className="flex items-center gap-2 text-[12.5px] text-amber-300"><AlertTriangle size={14} />{t('ovl.composed', 'O jogo está em modo "Composed" (passa pelo compositor do Windows): isso costuma adicionar latência. Tela cheia sem bordas com flip costuma ser melhor.')}</p>}
        {(error || st?.error) && <p role="alert" className="flex items-center gap-2 text-[12.5px] text-red-400"><AlertTriangle size={14} />{error || st?.error}</p>}
      </section>

      {s && (
        <section className="rounded-xl border border-zinc-800/80 p-4 space-y-4">
          <h2 className="dh-section-title">{t('ovl.look', 'Aparência')}</h2>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-[12.5px] text-zinc-300">
            <label className="flex items-center gap-2">{t('ovl.position', 'Posição')}
              <select className="dh-input" value={s.position} onChange={(e) => void set({ position: e.target.value as OverlaySettings['position'] })}>
                <option value="tl">{t('ovl.pos.tl', 'Canto superior esquerdo')}</option>
                <option value="tr">{t('ovl.pos.tr', 'Canto superior direito')}</option>
                <option value="bl">{t('ovl.pos.bl', 'Canto inferior esquerdo')}</option>
                <option value="br">{t('ovl.pos.br', 'Canto inferior direito')}</option>
              </select>
            </label>
            <label className="flex items-center gap-2">{t('ovl.scale', 'Tamanho')}
              <input type="range" min={0.6} max={2.5} step={0.1} value={s.scale} onChange={(e) => void set({ scale: Number(e.target.value) })} />
              <span className="tabular-nums w-10">{Math.round(s.scale * 100)}%</span>
            </label>
            <label className="flex items-center gap-2">{t('ovl.opacity', 'Opacidade')}
              <input type="range" min={0.2} max={1} step={0.05} value={s.opacity} onChange={(e) => void set({ opacity: Number(e.target.value) })} />
            </label>
            <label className="flex items-center gap-2">{t('ovl.background', 'Fundo')}
              <input type="range" min={0} max={1} step={0.05} value={s.background} onChange={(e) => void set({ background: Number(e.target.value) })} />
            </label>
            <label className="flex items-center gap-2">{t('ovl.interval', 'Atualizar a cada')}
              <select className="dh-input" value={s.intervalMs} onChange={(e) => void set({ intervalMs: Number(e.target.value) })}>
                <option value={250}>250 ms</option><option value={500}>500 ms</option><option value={1000}>1 s</option>
              </select>
            </label>
            <label className="flex items-center gap-2">{t('ovl.hotkey', 'Atalho')}
              <input className="dh-input w-36 font-mono" value={hotkey} onChange={(e) => setHotkey(e.target.value)} onBlur={() => hotkey !== s.hotkey && void set({ hotkey: hotkey.trim() })} />
            </label>
          </div>
          <div>
            <p className="dh-label mb-2">{t('ovl.layout', 'Layout')}</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {([
                ['compact', t('ovl.layout.compact', 'Compacto'), t('ovl.layout.compactHelp', 'FPS e as métricas que você escolher, uma por linha.')],
                ['advanced', t('ovl.layout.advanced', 'Avançado'), t('ovl.layout.advancedHelp', 'Estilo RivaTuner: uma linha por componente com uso, temperatura, clock e consumo, mais o gráfico de frame time.')],
                ['oc', t('ovl.layout.oc', 'Overclocker'), t('ovl.layout.ocHelp', 'Tudo do Avançado mais voltagens, hotspot, ventoinha, % do TDP, gráficos de FPS, uso e temperatura, carga por thread e estatísticas da sessão (1%/0,1%, σ, engasgos, gargalo).')],
                ['custom', t('ovl.layout.custom', 'Personalizado'), t('ovl.layout.customHelp', 'O seu layout, montado no editor: blocos, cores, fontes, gráficos e CSS livre.')]
              ] as const).map(([id, name, help]) => (
                <button key={id} type="button" onClick={() => void set({ layout: id })} aria-pressed={s.layout === id}
                  className={`text-left rounded-lg border p-3 ${s.layout === id ? 'border-blue-400/70 bg-zinc-800/60' : 'border-zinc-800 hover:border-zinc-700'}`}>
                  <p className="text-[13px] font-medium text-zinc-100">{name}</p>
                  <p className="dh-help mt-0.5">{help}</p>
                </button>
              ))}
            </div>
            <button type="button" className="dh-btn dh-btn-sm mt-2" onClick={() => onNavigate?.('overlay-editor')}>{t('ovl.openEditor', 'Abrir o editor de overlay')}</button>
            {s.layout !== 'compact' ? <p className="dh-help mt-2">{t('ovl.layout.sensors', 'Clock, temperatura e consumo da CPU vêm dos sensores avançados (driver PawnIO, instalado com o DarkHub). Sem eles, esses campos aparecem como —.')}</p> : null}
          </div>
          {s.layout === 'compact' ? <div>
            <p className="dh-label mb-2">{t('ovl.metrics', 'O que mostrar')}</p>
            <div className="flex flex-wrap gap-1.5">
              {METRICS.map((m) => (
                <button key={m} type="button" onClick={() => toggleMetric(m)}
                  className={`px-2 py-1 rounded-md border text-[12px] ${s.metrics.includes(m) ? 'border-blue-400/70 text-zinc-50 bg-zinc-800/60' : 'border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}>
                  {metricLabel(m)}
                </button>
              ))}
            </div>
          </div> : null}
          <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-zinc-300">
            <span className="text-zinc-500">{t('ovl.log', 'Salvar sessão em CSV')}</span>
            <code className="font-mono text-zinc-200 truncate max-w-[340px]">{s.logFolder || t('ovl.logOff', 'desligado')}</code>
            <button type="button" onClick={() => void api()?.pickLogFolder().then((r) => r?.ok && setSt(r))} className="dh-btn dh-btn-ghost dh-btn-sm"><FolderOpen size={13} />{t('ovl.chooseFolder', 'Escolher pasta')}</button>
            {s.logFolder && <button type="button" onClick={() => void set({ logFolder: '' })} className="dh-btn dh-btn-ghost dh-btn-sm">{t('ovl.logDisable', 'Desligar')}</button>}
          </div>
        </section>
      )}

      {st?.lastSession && (
        <section className="rounded-xl border border-zinc-800/80 p-4">
          <h2 className="dh-section-title mb-3">{t('ovl.lastSession', 'Última sessão: {g}').replace('{g}', st.lastSession.name || '')}</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 font-mono text-[14px] text-zinc-100">
            {[[t('ovl.duration', 'Duração'), `${Math.round(st.lastSession.seconds / 60)} min`], [t('ovl.avg', 'FPS médio'), n(st.lastSession.avgFps)], ['1% low', n(st.lastSession.low1)], ['0.1% low', n(st.lastSession.low01)], [t('ovl.worst', 'Pior quadro'), `${n(st.lastSession.maxFrameTimeMs, 1)} ms`]].map(([k, v]) => (
              <div key={k}><p className="text-[11.5px] text-zinc-500 font-sans">{k}</p><p>{v}</p></div>
            ))}
          </div>
        </section>
      )}

      <div className="space-y-1.5">
        <p className="flex items-start gap-2 dh-help"><Info size={13} className="mt-0.5 shrink-0" />{t('ovl.fullscreen', 'O overlay aparece por cima de jogos em janela ou tela cheia sem bordas. Em tela cheia exclusiva o Windows não desenha outras janelas por cima; nesse caso use o modo sem bordas (o FPS continua sendo medido).')}</p>
        <p className="flex items-start gap-2 dh-help"><Info size={13} className="mt-0.5 shrink-0" />{t('ovl.admin', 'O PresentMon precisa que o DarkHub rode como administrador para medir qualquer jogo (o app instalado já roda assim).')}</p>
      </div>
    </div>
  );
}
