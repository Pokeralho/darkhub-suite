import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, Info, AlertTriangle, FolderOpen, RefreshCw } from '../components/icons';
import PageHeader from '../components/ui/PageHeader';
import HotkeyCapture from '../components/HotkeyCapture';
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
          <PlacementPicker s={s} st={st} set={set} t={t} />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-[12.5px] text-zinc-300">
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
            <div className="flex items-center gap-2">{t('ovl.hotkey', 'Atalho')}
              <HotkeyCapture value={s.hotkey || null} onChange={(k) => void set({ hotkey: k })} />
            </div>
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

const SPOTS: OverlaySettings['position'][] = ['tl', 'tc', 'tr', 'ml', 'mr', 'bl', 'bc', 'br'];

/** Where the overlay goes: which monitor, a click on a miniature screen for the spot, and a fine offset. */
function PlacementPicker({ s, st, set, t }: { s: OverlaySettings; st: OverlayStatus | null; set: (p: Partial<OverlaySettings>) => Promise<void>; t: (k: string, f?: string) => string }) {
  const displays = st?.displays ?? [];
  const current = displays.find((d) => d.id === st?.displayId);
  const ratio = (() => { const d = current ?? displays.find((x) => x.primary) ?? displays[0]; return d ? d.width / d.height : 16 / 9; })();
  const spotLabel = (p: string) => ({
    tl: t('ovl.pos.tl', 'Canto superior esquerdo'), tc: t('ovl.pos.tc', 'Centro superior'), tr: t('ovl.pos.tr', 'Canto superior direito'),
    ml: t('ovl.pos.ml', 'Meio à esquerda'), mr: t('ovl.pos.mr', 'Meio à direita'),
    bl: t('ovl.pos.bl', 'Canto inferior esquerdo'), bc: t('ovl.pos.bc', 'Centro inferior'), br: t('ovl.pos.br', 'Canto inferior direito')
  } as Record<string, string>)[p] ?? p;
  const nudge = (k: 'offsetX' | 'offsetY', v: string) => { const n = Math.round(Number(v)); if (Number.isFinite(n)) void set({ [k]: n } as Partial<OverlaySettings>); };
  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,260px)_1fr] items-start">
      <div>
        <p className="dh-label mb-2">{t('ovl.position', 'Posição')}</p>
        <div className="relative w-full rounded-lg border border-zinc-700 bg-zinc-900/70" style={{ aspectRatio: String(ratio) }} role="radiogroup" aria-label={t('ovl.position', 'Posição')}>
          {SPOTS.map((p) => {
            const col = p[1] === 'l' ? 0 : p[1] === 'c' ? 1 : 2;
            const row = p[0] === 't' ? 0 : p[0] === 'm' ? 1 : 2;
            const on = s.position === p;
            return (
              <button key={p} type="button" role="radio" aria-checked={on} title={spotLabel(p)} aria-label={spotLabel(p)} onClick={() => void set({ position: p, offsetX: 0, offsetY: 0 })}
                className={`absolute h-[22%] w-[26%] rounded-md border transition-colors ${on ? 'border-blue-400 bg-blue-500/25' : 'border-zinc-700/80 bg-zinc-800/50 hover:border-zinc-500'}`}
                style={{ left: `${[3, 37, 71][col]}%`, top: `${[5, 39, 73][row]}%` }}>
                {on ? <span className="font-mono text-[10.5px] text-blue-200">FPS 144</span> : null}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-3 text-[12px] text-zinc-400">
          <label className="flex items-center gap-1.5">X
            <input type="number" className="dh-input w-20 font-mono" step={10} value={s.offsetX} onChange={(e) => nudge('offsetX', e.target.value)} aria-label={t('ovl.offsetX', 'Deslocamento horizontal (px)')} />
          </label>
          <label className="flex items-center gap-1.5">Y
            <input type="number" className="dh-input w-20 font-mono" step={10} value={s.offsetY} onChange={(e) => nudge('offsetY', e.target.value)} aria-label={t('ovl.offsetY', 'Deslocamento vertical (px)')} />
          </label>
          <span>px</span>
        </div>
      </div>
      <div className="space-y-2">
        <p className="dh-label">{t('ovl.monitor', 'Monitor')}</p>
        <select className="dh-input w-full max-w-sm" value={s.monitor} onChange={(e) => void set({ monitor: e.target.value })}>
          <option value="game">{t('ovl.monitor.game', 'O monitor do jogo (acompanha o jogo)')}</option>
          <option value="primary">{t('ovl.monitor.primary', 'Monitor principal')}</option>
          <option value="cursor">{t('ovl.monitor.cursor', 'Onde o mouse estiver ao abrir')}</option>
          {displays.map((d, i) => (
            <option key={d.id} value={d.id}>{`${i + 1}. ${d.name} · ${d.width}×${d.height}${d.hz ? ` · ${d.hz} Hz` : ''}${d.primary ? ` · ${t('ovl.monitor.main', 'principal')}` : ''}`}</option>
          ))}
        </select>
        <p className="dh-help">
          {st?.visible && current
            ? t('ovl.monitor.now', 'Agora em: {m}').replace('{m}', `${displays.indexOf(current) + 1}. ${current.name}`)
            : t('ovl.monitor.help', 'Com mais de um monitor, o overlay fica na tela onde o jogo está e muda junto se você mover o jogo.')}
        </p>
      </div>
    </div>
  );
}
