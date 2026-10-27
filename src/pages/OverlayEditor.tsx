import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronUp, ChevronDown, Copy, Eye, EyeOff, Plus, Save, Trash2, Upload, X, Check, Loader2, Code, Layers, Sliders, LayoutGrid } from '../components/icons';
import PageHeader from '../components/ui/PageHeader';
import OverlayStage, { BACKGROUNDS } from '../components/overlay/OverlayStage';
import { useI18n } from '../i18n/I18nProvider';
import type { OvlItem, OvlLayout, OvlLayoutsState, OvlPreview, OvlStyle, OvlTheme, OvlWidget } from '../global';

const api = () => window.darkhub?.overlay;
const FONTS = ['"Cascadia Mono", Consolas, monospace', 'Consolas, monospace', '"Segoe UI", system-ui, sans-serif', '"Segoe UI Variable Display", "Segoe UI", sans-serif', 'Bahnschrift, "Segoe UI", sans-serif', 'Arial, sans-serif', 'Verdana, sans-serif', 'Tahoma, sans-serif', '"Trebuchet MS", sans-serif', 'Impact, sans-serif', '"Courier New", monospace', '"Lucida Console", monospace'];
const GROUPS = ['fps', 'gpu', 'cpu', 'ram', 'session', 'other'];
const ANCHORS = ['tl', 'tc', 'tr', 'ml', '', 'mr', 'bl', 'bc', 'br'] as const;
const CODE_PREFIX = 'dhovl1:';
const encode = (l: OvlLayout) => CODE_PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify(l))));
const decode = (s: string): OvlLayout | null => {
  try { const t = s.trim(); return JSON.parse(t.startsWith(CODE_PREFIX) ? decodeURIComponent(escape(atob(t.slice(CODE_PREFIX.length)))) : t); } catch { return null; }
};
let uid = 0;
const newId = (type: string) => `${type}${Date.now().toString(36).slice(-4)}${(uid++).toString(36)}`;

// ------------------------------------------------------------------ small fields

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="grid grid-cols-[96px_1fr] items-center gap-2 text-[12px] text-zinc-400" title={hint}>
      <span className="truncate">{label}</span>
      <span className="min-w-0 flex items-center gap-1.5">{children}</span>
    </label>
  );
}

function ColorField({ value, onChange, allowEmpty }: { value: string; onChange: (v: string) => void; allowEmpty?: boolean }) {
  const hex = /^#[0-9a-f]{6}$/i.test(value || '') ? value : /^#[0-9a-f]{3}$/i.test(value || '') ? `#${value.slice(1).split('').map((c) => c + c).join('')}` : '#ffffff';
  return (
    <>
      <input type="color" className="w-7 h-7 rounded border border-zinc-700 bg-transparent p-0.5 shrink-0" value={hex} onChange={(e) => onChange(e.target.value)} />
      <input className="dh-input h-7 w-full font-mono text-[11.5px]" value={value || ''} placeholder={allowEmpty ? 'padrão' : ''} onChange={(e) => onChange(e.target.value)} />
    </>
  );
}

function NumField({ value, onChange, min, max, step = 1, suffix }: { value: number | undefined; onChange: (v: number) => void; min: number; max: number; step?: number; suffix?: string }) {
  return (
    <>
      <input type="range" className="flex-1 min-w-0" min={min} max={max} step={step} value={value ?? min} onChange={(e) => onChange(Number(e.target.value))} />
      <input type="number" className="dh-input h-7 w-16 font-mono text-[11.5px]" min={min} max={max} step={step} value={value ?? ''} onChange={(e) => onChange(Number(e.target.value))} />
      {suffix ? <span className="text-zinc-500 text-[11px]">{suffix}</span> : null}
    </>
  );
}

function MetricSelect({ value, onChange, metrics }: { value: string; onChange: (v: string) => void; metrics: OvlLayoutsState['metrics'] }) {
  const { t } = useI18n();
  return (
    <select className="dh-input h-7 w-full text-[12px]" value={value} onChange={(e) => onChange(e.target.value)}>
      {GROUPS.map((g) => (
        <optgroup key={g} label={t(`ovle.group.${g}`, g)}>
          {metrics.filter((m) => m.group === g).map((m) => <option key={m.key} value={m.key}>{t(`ovle.m.${m.key}`, m.label)}{m.unit ? ` (${m.unit})` : ''}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-zinc-800/80 pt-2.5">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between text-[11.5px] uppercase tracking-wide text-zinc-500 mb-2">
        {title}{open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open ? <div className="space-y-2">{children}</div> : null}
    </div>
  );
}

// ------------------------------------------------------------------ inspector parts

function StyleEditor({ style, onChange }: { style: OvlStyle; onChange: (s: OvlStyle) => void }) {
  const { t } = useI18n();
  const set = (k: keyof OvlStyle, v: string) => onChange({ ...style, [k]: v || undefined });
  const SHADOWS: Record<string, string> = { '': t('ovle.none', 'padrão'), '0 1px 2px #000': t('ovle.shadow.soft', 'Sombra'), '0 0 2px #000, 0 0 2px #000': t('ovle.shadow.outline', 'Contorno'), '0 0 8px currentColor': t('ovle.shadow.glow', 'Brilho (neon)') };
  return (
    <Section title={t('ovle.style', 'Estilo do bloco')} defaultOpen={false}>
      <Row label={t('ovle.color', 'Cor do texto')}><ColorField allowEmpty value={style.color || ''} onChange={(v) => set('color', v)} /></Row>
      <Row label={t('ovle.background', 'Fundo')}><ColorField allowEmpty value={style.background || ''} onChange={(v) => set('background', v)} /></Row>
      <Row label={t('ovle.fontSize', 'Tamanho')}><NumField min={6} max={64} value={Number.parseFloat(style.fontSize || '') || undefined} onChange={(v) => set('fontSize', String(v))} suffix="px" /></Row>
      <Row label={t('ovle.fontWeight', 'Peso')}>
        <select className="dh-input h-7 w-full text-[12px]" value={style.fontWeight || ''} onChange={(e) => set('fontWeight', e.target.value)}>
          <option value="">{t('ovle.none', 'padrão')}</option>{[300, 400, 500, 600, 700, 800, 900].map((w) => <option key={w} value={w}>{w}</option>)}
        </select>
      </Row>
      <Row label={t('ovle.align', 'Alinhamento')}>
        <select className="dh-input h-7 w-full text-[12px]" value={style.textAlign || ''} onChange={(e) => set('textAlign', e.target.value)}>
          <option value="">{t('ovle.none', 'padrão')}</option><option value="left">{t('ovle.left', 'Esquerda')}</option><option value="center">{t('ovle.center', 'Centro')}</option><option value="right">{t('ovle.right', 'Direita')}</option>
        </select>
      </Row>
      <Row label={t('ovle.padding', 'Espaço interno')}><input className="dh-input h-7 w-full font-mono text-[11.5px]" placeholder="4px 8px" value={style.padding || ''} onChange={(e) => set('padding', e.target.value)} /></Row>
      <Row label={t('ovle.margin', 'Margem')}><input className="dh-input h-7 w-full font-mono text-[11.5px]" placeholder="4px 0" value={style.margin || ''} onChange={(e) => set('margin', e.target.value)} /></Row>
      <Row label={t('ovle.radius', 'Cantos')}><input className="dh-input h-7 w-full font-mono text-[11.5px]" placeholder="6px" value={style.borderRadius || ''} onChange={(e) => set('borderRadius', e.target.value)} /></Row>
      <Row label={t('ovle.border', 'Borda')}><input className="dh-input h-7 w-full font-mono text-[11.5px]" placeholder="1px solid #4ade80" value={style.border || ''} onChange={(e) => set('border', e.target.value)} /></Row>
      <Row label={t('ovle.shadow', 'Efeito do texto')}>
        <select className="dh-input h-7 w-full text-[12px]" value={Object.keys(SHADOWS).includes(style.textShadow || '') ? style.textShadow || '' : '__custom'} onChange={(e) => e.target.value !== '__custom' && set('textShadow', e.target.value)}>
          {Object.entries(SHADOWS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          {!Object.keys(SHADOWS).includes(style.textShadow || '') ? <option value="__custom">{style.textShadow}</option> : null}
        </select>
      </Row>
      <Row label={t('ovle.letterSpacing', 'Espaçamento')}><input className="dh-input h-7 w-full font-mono text-[11.5px]" placeholder="0.05em" value={style.letterSpacing || ''} onChange={(e) => set('letterSpacing', e.target.value)} /></Row>
      <Row label={t('ovle.opacity', 'Opacidade')}><NumField min={0} max={1} step={0.05} value={style.opacity ? Number(style.opacity) : 1} onChange={(v) => set('opacity', v >= 1 ? '' : String(v))} /></Row>
    </Section>
  );
}

function ItemEditor({ item, onChange, onRemove, metrics, compact }: { item: OvlItem; onChange: (i: OvlItem) => void; onRemove?: () => void; metrics: OvlLayoutsState['metrics']; compact?: boolean }) {
  const { t } = useI18n();
  const m = metrics.find((x) => x.key === item.metric);
  const set = (patch: Partial<OvlItem>) => onChange({ ...item, ...patch });
  return (
    <div className={compact ? 'rounded-md border border-zinc-800 p-2 space-y-1.5' : 'space-y-2'}>
      <div className="flex items-center gap-1.5">
        <MetricSelect metrics={metrics} value={item.metric} onChange={(metric) => onChange({ metric })} />
        {onRemove ? <button type="button" onClick={onRemove} className="dh-btn dh-btn-ghost dh-btn-sm" aria-label={t('ovle.remove', 'Remover')}><X size={12} /></button> : null}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <input className="dh-input h-7 text-[11.5px]" placeholder={t('ovle.prefix', 'Prefixo')} value={item.prefix ?? ''} onChange={(e) => set({ prefix: e.target.value || undefined })} />
        <input className="dh-input h-7 text-[11.5px]" placeholder={m?.unit || t('ovle.unit', 'Unidade')} value={item.unit ?? ''} onChange={(e) => set({ unit: e.target.value === '' ? undefined : e.target.value })} title={t('ovle.unitHint', 'Unidade mostrada. Um espaço esconde a unidade.')} />
        <select className="dh-input h-7 text-[11.5px]" value={item.decimals ?? ''} onChange={(e) => set({ decimals: e.target.value === '' ? undefined : Number(e.target.value) })} title={t('ovle.decimals', 'Casas decimais')}>
          <option value="">{`${m?.decimals ?? 0} ${t('ovle.dec', 'casas')}`}</option>{[0, 1, 2, 3].map((d) => <option key={d} value={d}>{d} {t('ovle.dec', 'casas')}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-[auto_1fr_auto_auto] gap-1.5 items-center">
        <input type="color" className="w-7 h-7 rounded border border-zinc-700 bg-transparent p-0.5" value={/^#[0-9a-f]{6}$/i.test(item.color || '') ? item.color : '#fafafa'} onChange={(e) => set({ color: e.target.value })} title={t('ovle.color', 'Cor do texto')} />
        <input type="number" className="dh-input h-7 text-[11.5px]" placeholder={t('ovle.fontSize', 'Tamanho')} value={item.size ?? ''} onChange={(e) => set({ size: e.target.value === '' ? undefined : Number(e.target.value) })} />
        <input type="number" className="dh-input h-7 w-16 text-[11.5px]" placeholder={t('ovle.warn', 'Alerta')} value={item.warn ?? ''} onChange={(e) => set({ warn: e.target.value === '' ? undefined : Number(e.target.value) })} title={t('ovle.warnHint', 'Valor que deixa o número amarelo')} />
        <input type="number" className="dh-input h-7 w-16 text-[11.5px]" placeholder={t('ovle.bad', 'Crítico')} value={item.bad ?? ''} onChange={(e) => set({ bad: e.target.value === '' ? undefined : Number(e.target.value) })} title={t('ovle.badHint', 'Valor que deixa o número vermelho (menor que o alerta = quanto menor, pior)')} />
      </div>
      {item.color ? <button type="button" className="text-[11px] text-zinc-500 hover:text-zinc-300" onClick={() => set({ color: undefined })}>{t('ovle.resetColor', 'Voltar à cor do tema')}</button> : null}
    </div>
  );
}

function WidgetEditor({ w, onChange, state }: { w: OvlWidget; onChange: (w: OvlWidget) => void; state: OvlLayoutsState }) {
  const { t } = useI18n();
  const set = (patch: Partial<OvlWidget>) => onChange({ ...w, ...patch } as OvlWidget);
  return (
    <div className="space-y-3">
      {w.type === 'metrics' ? (
        <>
          <Row label={t('ovle.label', 'Rótulo')}><input className="dh-input h-7 w-full text-[12px]" value={w.label} placeholder="GPU" onChange={(e) => set({ label: e.target.value })} /></Row>
          <Row label={t('ovle.labelColor', 'Cor do rótulo')}><ColorField allowEmpty value={w.labelColor} onChange={(v) => set({ labelColor: v })} /></Row>
          <div className="space-y-1.5">
            {w.items.map((it, i) => (
              <ItemEditor key={i} compact item={it} metrics={state.metrics}
                onChange={(n) => set({ items: w.items.map((x, j) => (j === i ? n : x)) })}
                onRemove={() => set({ items: w.items.filter((_, j) => j !== i) })} />
            ))}
            {w.items.length < 12 ? <button type="button" className="dh-btn dh-btn-sm w-full" onClick={() => set({ items: [...w.items, { metric: 'gpu.load' }] })}><Plus size={12} />{t('ovle.addValue', 'Adicionar valor')}</button> : null}
          </div>
        </>
      ) : null}
      {w.type === 'value' ? (
        <>
          <ItemEditor item={w} metrics={state.metrics} onChange={(n) => onChange({ ...w, ...n, size: w.size })} />
          <Row label={t('ovle.label', 'Rótulo')}><input className="dh-input h-7 w-full text-[12px]" value={w.label} onChange={(e) => set({ label: e.target.value })} /></Row>
          <Row label={t('ovle.fontSize', 'Tamanho')}><NumField min={8} max={160} value={w.size} onChange={(v) => set({ size: v })} suffix="px" /></Row>
        </>
      ) : null}
      {w.type === 'graph' ? (
        <>
          <Row label={t('ovle.gtitle', 'Título')}><input className="dh-input h-7 w-full text-[12px]" value={w.title} onChange={(e) => set({ title: e.target.value })} /></Row>
          {w.series.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <select className="dh-input h-7 flex-1 text-[12px]" value={s.source} onChange={(e) => set({ series: w.series.map((x, j) => (j === i ? { ...x, source: e.target.value } : x)) })}>
                {state.series.map((x) => <option key={x.key} value={x.key}>{t(`ovle.s.${x.key}`, x.label)}</option>)}
              </select>
              <input type="color" className="w-7 h-7 rounded border border-zinc-700 bg-transparent p-0.5" value={/^#[0-9a-f]{6}$/i.test(s.color) ? s.color : '#fbbf24'} onChange={(e) => set({ series: w.series.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)) })} />
              {w.series.length > 1 ? <button type="button" className="dh-btn dh-btn-ghost dh-btn-sm" onClick={() => set({ series: w.series.filter((_, j) => j !== i) })}><X size={12} /></button> : null}
            </div>
          ))}
          {w.series.length < 4 ? <button type="button" className="dh-btn dh-btn-sm w-full" onClick={() => set({ series: [...w.series, { source: 'cpu.load', color: '#60a5fa' }] })}><Plus size={12} />{t('ovle.addSeries', 'Adicionar linha')}</button> : null}
          <Row label={t('ovle.height', 'Altura')}><NumField min={16} max={200} value={w.height} onChange={(v) => set({ height: v })} suffix="px" /></Row>
          <Row label={t('ovle.width', 'Largura')} hint={t('ovle.widthHint', '0 = acompanha a largura do overlay')}><NumField min={0} max={1200} step={10} value={w.width} onChange={(v) => set({ width: v })} suffix="px" /></Row>
          <Row label={t('ovle.lineWidth', 'Espessura')}><NumField min={0.5} max={6} step={0.5} value={w.lineWidth} onChange={(v) => set({ lineWidth: v })} /></Row>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-zinc-300">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={w.fill} onChange={(e) => set({ fill: e.target.checked })} />{t('ovle.fill', 'Preencher')}</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={w.info} onChange={(e) => set({ info: e.target.checked })} />{t('ovle.info', 'Mín–máx')}</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={w.grid} onChange={(e) => set({ grid: e.target.checked })} />{t('ovle.grid', 'Grade')}</label>
          </div>
        </>
      ) : null}
      {w.type === 'bars' ? (
        <>
          <Row label={t('ovle.gtitle', 'Título')}><input className="dh-input h-7 w-full text-[12px]" value={w.title} onChange={(e) => set({ title: e.target.value })} /></Row>
          <Row label={t('ovle.height', 'Altura')}><NumField min={8} max={120} value={w.height} onChange={(v) => set({ height: v })} suffix="px" /></Row>
          <Row label={t('ovle.barColor', 'Cor')}><ColorField value={w.color} onChange={(v) => set({ color: v })} /></Row>
          <Row label={t('ovle.barWarn', 'Acima de 80%')}><ColorField value={w.warnColor} onChange={(v) => set({ warnColor: v })} /></Row>
          <Row label={t('ovle.barBad', 'Acima de 95%')}><ColorField value={w.badColor} onChange={(v) => set({ badColor: v })} /></Row>
        </>
      ) : null}
      {w.type === 'stats' ? (
        <>
          <Row label={t('ovle.columns', 'Colunas')}><NumField min={1} max={4} value={w.columns} onChange={(v) => set({ columns: v })} /></Row>
          <div className="max-h-64 overflow-auto space-y-2 pr-1">
            {GROUPS.map((g) => (
              <div key={g}>
                <p className="text-[11px] text-zinc-500 mb-1">{t(`ovle.group.${g}`, g)}</p>
                <div className="flex flex-wrap gap-1">
                  {state.metrics.filter((m) => m.group === g).map((m) => {
                    const on = w.keys.includes(m.key);
                    return <button key={m.key} type="button" onClick={() => set({ keys: on ? w.keys.filter((k) => k !== m.key) : [...w.keys, m.key] })}
                      className={`px-1.5 py-0.5 rounded border text-[11px] ${on ? 'border-blue-400/70 text-zinc-50 bg-zinc-800/60' : 'border-zinc-800 text-zinc-400'}`}>{t(`ovle.m.${m.key}`, m.label)}</button>;
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
      {w.type === 'text' ? <Row label={t('ovle.text', 'Texto')}><input className="dh-input h-7 w-full text-[12px]" value={w.text} onChange={(e) => set({ text: e.target.value })} /></Row> : null}
      {w.type === 'spacer' ? <Row label={t('ovle.height', 'Altura')}><NumField min={1} max={120} value={w.height} onChange={(v) => set({ height: v })} suffix="px" /></Row> : null}
      <StyleEditor style={w.style} onChange={(style) => set({ style })} />
      <p className="dh-help">{t('ovle.cssId', 'No CSS avançado este bloco é')} <code className="font-mono text-zinc-300">#w-{w.id}</code></p>
    </div>
  );
}

function ThemeEditor({ theme, onChange }: { theme: OvlTheme; onChange: (t: OvlTheme) => void }) {
  const { t } = useI18n();
  const set = (patch: Partial<OvlTheme>) => onChange({ ...theme, ...patch });
  return (
    <div className="space-y-2">
      <Row label={t('ovle.font', 'Fonte')}>
        <select className="dh-input h-7 w-full text-[12px]" value={FONTS.includes(theme.fontFamily) ? theme.fontFamily : '__custom'} onChange={(e) => e.target.value !== '__custom' && set({ fontFamily: e.target.value })}>
          {FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f.split(',')[0].replace(/"/g, '')}</option>)}
          {!FONTS.includes(theme.fontFamily) ? <option value="__custom">{theme.fontFamily}</option> : null}
        </select>
      </Row>
      <Row label={t('ovle.fontSize', 'Tamanho')}><NumField min={6} max={64} value={theme.fontSize} onChange={(v) => set({ fontSize: v })} suffix="px" /></Row>
      <Row label={t('ovle.fontWeight', 'Peso')}><NumField min={100} max={900} step={100} value={theme.fontWeight} onChange={(v) => set({ fontWeight: v })} /></Row>
      <Row label={t('ovle.color', 'Cor do texto')}><ColorField value={theme.color} onChange={(v) => set({ color: v })} /></Row>
      <Row label={t('ovle.labelColor', 'Cor do rótulo')}><ColorField value={theme.labelColor} onChange={(v) => set({ labelColor: v })} /></Row>
      <Row label={t('ovle.unitColor', 'Cor da unidade')}><ColorField value={theme.unitColor} onChange={(v) => set({ unitColor: v })} /></Row>
      <Row label={t('ovle.good', 'Cor boa')}><ColorField value={theme.good} onChange={(v) => set({ good: v })} /></Row>
      <Row label={t('ovle.warnColor', 'Cor de alerta')}><ColorField value={theme.warn} onChange={(v) => set({ warn: v })} /></Row>
      <Row label={t('ovle.badColor', 'Cor crítica')}><ColorField value={theme.bad} onChange={(v) => set({ bad: v })} /></Row>
      <Row label={t('ovle.background', 'Fundo')}><ColorField value={theme.background} onChange={(v) => set({ background: v })} /></Row>
      <Row label={t('ovle.bgOpacity', 'Opacidade do fundo')}><NumField min={0} max={1} step={0.05} value={theme.backgroundOpacity} onChange={(v) => set({ backgroundOpacity: v })} /></Row>
      <Row label={t('ovle.border', 'Borda')}><input className="dh-input h-7 w-full font-mono text-[11.5px]" placeholder="1px solid #22d3ee" value={theme.border} onChange={(e) => set({ border: e.target.value })} /></Row>
      <Row label={t('ovle.radius', 'Cantos')}><NumField min={0} max={60} value={theme.radius} onChange={(v) => set({ radius: v })} suffix="px" /></Row>
      <Row label={t('ovle.padding', 'Espaço interno')}><NumField min={0} max={60} value={theme.padding} onChange={(v) => set({ padding: v })} suffix="px" /></Row>
      <Row label={t('ovle.gap', 'Entre blocos')}><NumField min={0} max={40} value={theme.gap} onChange={(v) => set({ gap: v })} suffix="px" /></Row>
      <Row label={t('ovle.direction', 'Disposição')}>
        <select className="dh-input h-7 w-full text-[12px]" value={theme.direction} onChange={(e) => set({ direction: e.target.value as OvlTheme['direction'] })}>
          <option value="column">{t('ovle.column', 'Vertical (lista)')}</option><option value="row">{t('ovle.row', 'Horizontal (barra)')}</option>
        </select>
      </Row>
      <label className="flex items-center gap-2 text-[12px] text-zinc-300"><input type="checkbox" checked={theme.textShadow} onChange={(e) => set({ textShadow: e.target.checked })} />{t('ovle.textShadow', 'Sombra no texto (legível em jogos claros)')}</label>
    </div>
  );
}

// ------------------------------------------------------------------ page

export default function OverlayEditor({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { t } = useI18n();
  const [state, setState] = useState<OvlLayoutsState | null>(null);
  const [draft, setDraft] = useState<OvlLayout | null>(null);
  const [dirty, setDirty] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<'block' | 'theme' | 'position' | 'css'>('theme');
  const [preview, setPreview] = useState<OvlPreview | null>(null);
  const [mode, setMode] = useState<'screen' | 'actual'>('actual');
  const [bg, setBg] = useState('dark');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (selectId?: string) => {
    const s = await api()?.layouts();
    if (!s?.ok) return;
    setState(s);
    const pick = s.layouts.find((l) => l.id === (selectId || draft?.id)) || s.layouts.find((l) => l.id === s.active) || s.layouts[0];
    setDraft(JSON.parse(JSON.stringify(pick)));
    setDirty(false);
  }, [draft?.id]);
  useEffect(() => { void load(); }, []);
  // metric names in the app language for the statistics blocks drawn in game
  useEffect(() => {
    if (state) void api()?.setSettings({ labels: Object.fromEntries(state.metrics.map((m) => [`m.${m.key}`, t(`ovle.m.${m.key}`, m.label)])) });
  }, [state?.metrics.length]);

  // live preview (debounced); while the overlay runs it uses the real numbers, refreshed every second
  const latest = useRef<OvlLayout | null>(null);
  latest.current = draft;
  useEffect(() => {
    if (!draft) return;
    const id = window.setTimeout(() => { void api()?.preview({ layout: draft }).then((p) => p?.ok && setPreview(p)); }, 120);
    return () => window.clearTimeout(id);
  }, [draft]);
  useEffect(() => {
    if (!preview?.live) return;
    const id = window.setInterval(() => { if (latest.current) void api()?.preview({ layout: latest.current }).then((p) => p?.ok && setPreview(p)); }, 300);
    return () => window.clearInterval(id);
  }, [preview?.live]);

  const change = (patch: Partial<OvlLayout>) => { setDraft((d) => (d ? { ...d, ...patch } : d)); setDirty(true); };
  const widget = draft?.widgets.find((w) => w.id === sel) || null;
  const setWidget = (w: OvlWidget) => change({ widgets: draft!.widgets.map((x) => (x.id === w.id ? w : x)) });
  const move = (id: string, dir: -1 | 1) => {
    const ws = [...draft!.widgets]; const i = ws.findIndex((w) => w.id === id); const j = i + dir;
    if (j < 0 || j >= ws.length) return;
    [ws[i], ws[j]] = [ws[j], ws[i]]; change({ widgets: ws });
  };
  const add = (type: OvlWidget['type']) => {
    const base = { id: newId(type), style: {} };
    const w: OvlWidget = type === 'metrics' ? { ...base, type, label: 'GPU', labelColor: '', items: [{ metric: 'gpu.load' }, { metric: 'gpu.temp' }] }
      : type === 'value' ? { ...base, type, metric: 'fps', label: 'FPS', size: 28 }
        : type === 'graph' ? { ...base, type, title: 'Frametime', series: [{ source: 'frametime', color: '#fbbf24' }], height: 40, width: 0, fill: false, info: true, lineWidth: 1.5, grid: true }
          : type === 'bars' ? { ...base, type, title: 'Threads', height: 26, color: '#60a5fa', warnColor: '#fbbf24', badColor: '#f87171' }
            : type === 'stats' ? { ...base, type, keys: ['session.avgFps', 'session.low1', 'session.low01', 'session.stutters'], columns: 2 }
              : type === 'text' ? { ...base, type, text: 'DarkHub' }
                : type === 'spacer' ? { ...base, type, height: 8 }
                  : { ...base, type: 'separator' };
    change({ widgets: [...draft!.widgets, w] });
    setSel(w.id); setTab('block');
  };

  const save = async (activate = false) => {
    if (!draft) return;
    setBusy(true);
    const r = await api()?.saveLayout({ layout: draft });
    if (r?.ok && activate) await api()?.activateLayout({ id: draft.id });
    setBusy(false);
    if (r?.ok) { await load(draft.id); setMsg({ ok: true, text: activate ? t('ovle.applied', 'Salvo e em uso no overlay (layout Personalizado). Ctrl+Shift+F9 mostra no jogo.') : t('ovle.saved', 'Layout salvo.') }); }
    else setMsg({ ok: false, text: r?.error || 'error' });
  };
  const switchTo = async (id: string) => {
    if (dirty && !window.confirm(t('ovle.discard', 'Descartar as alterações não salvas?'))) return;
    setSel(null); await load(id);
  };
  const create = async (preset: string) => {
    const r = await api()?.newLayout({ preset });
    if (r?.ok && r.saved) { setSel(null); await load(r.saved.id); }
  };
  const duplicate = async () => {
    if (!draft) return;
    const r = await api()?.saveLayout({ layout: { ...draft, id: newId('layout'), name: `${draft.name} (${t('ovle.copy', 'cópia')})` } });
    if (r?.ok && r.saved) await load(r.saved.id);
  };
  const remove = async () => {
    if (!draft || !window.confirm(t('ovle.confirmDelete', 'Excluir este layout?'))) return;
    const r = await api()?.deleteLayout({ id: draft.id });
    if (r?.ok) { setSel(null); await load(r.active); } else setMsg({ ok: false, text: r?.error || '' });
  };
  const exportCode = async () => {
    if (!draft) return;
    try { await navigator.clipboard.writeText(encode(draft)); setMsg({ ok: true, text: t('ovle.exported', 'Código do layout copiado. Quem colar em "Importar" recebe este overlay.') }); } catch { setMsg({ ok: false, text: 'clipboard' }); }
  };
  const doImport = async () => {
    const l = importing ? decode(importing) : null;
    if (!l || typeof l !== 'object') { setMsg({ ok: false, text: t('ovle.badCode', 'Código inválido.') }); return; }
    const r = await api()?.saveLayout({ layout: { ...l, id: newId('layout') } });
    if (r?.ok && r.saved) { setImporting(null); setSel(null); await load(r.saved.id); setMsg({ ok: true, text: t('ovle.imported', 'Layout importado.') }); }
    else setMsg({ ok: false, text: r?.error || t('ovle.badCode', 'Código inválido.') });
  };

  const onDrag = useCallback((dx: number, dy: number) => {
    setDraft((d) => (d ? { ...d, offsetX: d.offsetX + dx, offsetY: d.offsetY + dy } : d)); setDirty(true);
  }, []);

  const typeName = (type: OvlWidget['type']) => ({ metrics: t('ovle.t.metrics', 'Linha de métricas'), value: t('ovle.t.value', 'Valor grande'), graph: t('ovle.t.graph', 'Gráfico'), bars: t('ovle.t.bars', 'Barras por thread'), stats: t('ovle.t.stats', 'Estatísticas'), text: t('ovle.t.text', 'Texto'), separator: t('ovle.t.separator', 'Separador'), spacer: t('ovle.t.spacer', 'Espaço') } as Record<string, string>)[type];
  const typeLabel = (w: OvlWidget) => {
    const detail = w.type === 'metrics' ? w.label || w.items.map((i) => i.metric).join(', ') : w.type === 'value' ? w.label || w.metric : w.type === 'graph' ? w.title || w.series.map((s) => s.source).join(' + ') : w.type === 'text' ? w.text : '';
    return { name: typeName(w.type), detail };
  };

  const cssHelp = useMemo(() => draft ? ['#box.custom', '.w-metrics .lbl', '.val', '.unit', '.val.warn', '.val.bad', '.w-graph', ...draft.widgets.map((w) => `#w-${w.id}`)] : [], [draft]);

  if (!state || !draft) return <div className="p-6"><Loader2 size={16} className="animate-spin text-zinc-500" /></div>;

  return (
    <div className="w-full space-y-4">
      <PageHeader
        title={t('ovle.title', 'Editor do overlay')}
        subtitle={t('ovle.subtitle', 'Monte o overlay do seu jeito: blocos, cores, fontes, gráficos e CSS livre. A prévia usa números reais quando o overlay está ligado.')}
        actions={(
          <div className="flex items-center gap-2">
            <button type="button" className="dh-btn dh-btn-sm" onClick={() => onNavigate?.('overlay')}>{t('ovle.back', 'Voltar ao overlay')}</button>
            <button type="button" className="dh-btn dh-btn-sm" disabled={busy || !dirty} onClick={() => void save(false)}><Save size={13} />{t('ovle.save', 'Salvar')}</button>
            <button type="button" className="dh-btn dh-btn-sm dh-btn-primary" disabled={busy} onClick={() => void save(true)}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}{t('ovle.use', 'Salvar e usar no overlay')}</button>
          </div>
        )}
      />

      <div className="flex flex-wrap items-center gap-2">
        <select className="dh-input h-8 text-[12.5px]" value={draft.id} onChange={(e) => void switchTo(e.target.value)} aria-label={t('ovle.layouts', 'Layouts')}>
          {state.layouts.map((l) => <option key={l.id} value={l.id}>{l.name}{l.id === state.active ? ` · ${t('ovle.inUse', 'em uso')}` : ''}</option>)}
        </select>
        <input className="dh-input h-8 w-48 text-[12.5px]" value={draft.name} onChange={(e) => change({ name: e.target.value })} aria-label={t('ovle.name', 'Nome')} />
        {dirty ? <span className="text-[11.5px] text-amber-300">{t('ovle.unsaved', 'não salvo')}</span> : null}
        <span className="flex-1" />
        <select className="dh-input h-8 text-[12.5px]" value="" onChange={(e) => e.target.value && void create(e.target.value)} aria-label={t('ovle.newAria', 'Novo a partir de modelo')}>
          <option value="">{t('ovle.new', 'Novo a partir de modelo...')}</option>
          {Object.entries(state.presets).map(([k, n]) => <option key={k} value={k}>{t(`ovle.preset.${k}`, n)}</option>)}
        </select>
        <button type="button" className="dh-btn dh-btn-sm" onClick={() => void duplicate()}><Copy size={13} />{t('ovle.duplicate', 'Duplicar')}</button>
        <button type="button" className="dh-btn dh-btn-sm" onClick={() => void exportCode()}><ArrowRight size={13} />{t('ovle.export', 'Exportar')}</button>
        <button type="button" className="dh-btn dh-btn-sm" onClick={() => setImporting('')}><Upload size={13} />{t('ovle.import', 'Importar')}</button>
        <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" onClick={() => void remove()} aria-label={t('ovle.delete', 'Excluir layout')}><Trash2 size={13} /></button>
      </div>

      {msg ? <p role="status" className={`text-[12.5px] ${msg.ok ? 'text-emerald-300' : 'text-amber-300'}`}>{msg.text}</p> : null}
      {importing !== null ? (
        <div className="dh-card p-3 space-y-2">
          <p className="text-[12.5px] text-zinc-300">{t('ovle.importHint', 'Cole o código do layout (começa com dhovl1:) ou o JSON.')}</p>
          <textarea className="dh-input w-full h-20 font-mono text-[11.5px]" value={importing} onChange={(e) => setImporting(e.target.value)} />
          <div className="flex gap-2"><button type="button" className="dh-btn dh-btn-sm dh-btn-primary" onClick={() => void doImport()}>{t('ovle.import', 'Importar')}</button><button type="button" className="dh-btn dh-btn-sm" onClick={() => setImporting(null)}>{t('ovle.cancel', 'Cancelar')}</button></div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)_300px]">
        {/* blocks */}
        <aside className="space-y-2">
          <p className="dh-label">{t('ovle.blocks', 'Blocos')}</p>
          <ul className="space-y-1">
            {draft.widgets.map((w) => {
              const { name, detail } = typeLabel(w);
              return (
                <li key={w.id} className={`group rounded-md border px-2 py-1.5 cursor-pointer ${sel === w.id ? 'border-blue-400/70 bg-zinc-800/60' : 'border-zinc-800 hover:border-zinc-700'} ${w.hidden ? 'opacity-50' : ''}`} onClick={() => { setSel(w.id); setTab('block'); }}>
                  <div className="flex items-center gap-1">
                    <span className="flex-1 min-w-0"><span className="block text-[12px] text-zinc-100 truncate">{name}</span><span className="block text-[11px] text-zinc-500 truncate">{detail}</span></span>
                    <button type="button" className="p-0.5 text-zinc-500 hover:text-zinc-200" onClick={(e) => { e.stopPropagation(); move(w.id, -1); }} aria-label={t('ovle.up', 'Subir')}><ChevronUp size={13} /></button>
                    <button type="button" className="p-0.5 text-zinc-500 hover:text-zinc-200" onClick={(e) => { e.stopPropagation(); move(w.id, 1); }} aria-label={t('ovle.down', 'Descer')}><ChevronDown size={13} /></button>
                    <button type="button" className="p-0.5 text-zinc-500 hover:text-zinc-200" onClick={(e) => { e.stopPropagation(); setWidget({ ...w, hidden: !w.hidden } as OvlWidget); }} aria-label={t('ovle.hide', 'Ocultar')}>{w.hidden ? <EyeOff size={13} /> : <Eye size={13} />}</button>
                    <button type="button" className="p-0.5 text-zinc-500 hover:text-red-300" onClick={(e) => { e.stopPropagation(); change({ widgets: draft.widgets.filter((x) => x.id !== w.id) }); if (sel === w.id) setSel(null); }} aria-label={t('ovle.remove', 'Remover')}><X size={13} /></button>
                  </div>
                </li>
              );
            })}
          </ul>
          <select className="dh-input h-8 w-full text-[12.5px]" value="" onChange={(e) => e.target.value && add(e.target.value as OvlWidget['type'])} aria-label={t('ovle.addAria', 'Adicionar bloco')}>
            <option value="">{t('ovle.add', '+ Adicionar bloco')}</option>
            {(['metrics', 'value', 'graph', 'bars', 'stats', 'text', 'separator', 'spacer'] as const).map((k) => <option key={k} value={k}>{typeName(k)}</option>)}
          </select>
        </aside>

        {/* preview */}
        <section className="space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-zinc-400">
            <span className={`inline-flex items-center gap-1.5 ${preview?.live ? 'text-emerald-300' : ''}`}><span className={`w-1.5 h-1.5 rounded-full ${preview?.live ? 'bg-emerald-400' : 'bg-zinc-600'}`} />{preview?.live ? t('ovle.live', 'Dados reais (overlay ligado)') : t('ovle.sample', 'Dados de exemplo')}</span>
            <span className="flex-1" />
            <select className="dh-input h-7 text-[12px]" value={mode} onChange={(e) => setMode(e.target.value as 'screen' | 'actual')}>
              <option value="screen">{t('ovle.mode.screen', 'Na tela (arraste para mover)')}</option><option value="actual">{t('ovle.mode.actual', 'Tamanho real')}</option>
            </select>
            <select className="dh-input h-7 text-[12px]" value={bg} onChange={(e) => setBg(e.target.value)}>
              {Object.keys(BACKGROUNDS).map((k) => <option key={k} value={k}>{t(`ovle.bg.${k}`, k)}</option>)}
            </select>
          </div>
          <OverlayStage preview={preview} mode={mode} background={bg} onDrag={onDrag} selectedId={sel} />
          <p className="dh-help">{t('ovle.stageHint', 'A prévia representa uma tela 1920×1080. Clique num bloco à esquerda para editar; arraste o overlay na prévia para posicionar.')}</p>
        </section>

        {/* inspector */}
        <aside className="dh-card p-3 space-y-3 self-start lg:sticky lg:top-2 max-h-[calc(100vh-120px)] overflow-y-auto">
          <div role="tablist" className="grid grid-cols-4 gap-1">
            {([['block', Layers, t('ovle.tab.block', 'Bloco')], ['theme', Sliders, t('ovle.tab.theme', 'Tema')], ['position', LayoutGrid, t('ovle.tab.position', 'Posição')], ['css', Code, 'CSS']] as const).map(([id, Icon, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                className={`inline-flex items-center justify-center gap-1 h-7 rounded-md text-[12px] ${tab === id ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-400 hover:text-zinc-200'}`}><Icon size={12} />{label}</button>
            ))}
          </div>
          {tab === 'block' ? (widget ? <WidgetEditor w={widget} state={state} onChange={setWidget} /> : <p className="dh-help">{t('ovle.pick', 'Escolha um bloco na lista para editar.')}</p>) : null}
          {tab === 'theme' ? <ThemeEditor theme={draft.theme} onChange={(theme) => change({ theme })} /> : null}
          {tab === 'position' ? (
            <div className="space-y-3">
              <p className="dh-label">{t('ovle.anchor', 'Canto da tela')}</p>
              <div className="grid grid-cols-3 gap-1 w-36">
                {ANCHORS.map((a, i) => a ? (
                  <button key={a} type="button" onClick={() => change({ anchor: a, offsetX: 0, offsetY: 0 })} aria-pressed={draft.anchor === a}
                    className={`h-8 rounded border ${draft.anchor === a ? 'border-blue-400 bg-blue-500/20' : 'border-zinc-700 hover:border-zinc-500'}`} aria-label={a} />
                ) : <span key={`c${i}`} />)}
              </div>
              <Row label={t('ovle.offsetX', 'Deslocar X')}><NumField min={-1920} max={1920} value={draft.offsetX} onChange={(v) => change({ offsetX: v })} suffix="px" /></Row>
              <Row label={t('ovle.offsetY', 'Deslocar Y')}><NumField min={-1080} max={1080} value={draft.offsetY} onChange={(v) => change({ offsetY: v })} suffix="px" /></Row>
              <Row label={t('ovle.scale', 'Escala')}><NumField min={0.4} max={4} step={0.05} value={draft.scale} onChange={(v) => change({ scale: v })} /></Row>
              <Row label={t('ovle.opacity', 'Opacidade')}><NumField min={0.1} max={1} step={0.05} value={draft.opacity} onChange={(v) => change({ opacity: v })} /></Row>
            </div>
          ) : null}
          {tab === 'css' ? (
            <div className="space-y-2">
              <p className="dh-help">{t('ovle.cssHelp', 'CSS livre, aplicado por cima de tudo. Seletores disponíveis (clique para inserir):')}</p>
              <div className="flex flex-wrap gap-1">
                {cssHelp.map((c) => <button key={c} type="button" className="font-mono text-[11px] px-1.5 py-0.5 rounded border border-zinc-800 text-zinc-300 hover:border-zinc-600" onClick={() => change({ css: `${draft.css}${draft.css && !draft.css.endsWith('\n') ? '\n' : ''}#box.custom ${c === '#box.custom' ? '' : c} {\n  \n}\n`.replace('#box.custom  {', '#box.custom {') })}>{c}</button>)}
              </div>
              <textarea spellCheck={false} className="dh-input w-full h-72 font-mono text-[11.5px] leading-relaxed" value={draft.css} onChange={(e) => change({ css: e.target.value })}
                placeholder={'#box.custom {\n  border-left: 3px solid #4ade80;\n}\n#box.custom .val.bad {\n  animation: none;\n}'} />
              <p className="dh-help">{t('ovle.cssSafe', 'O overlay não carrega nada da internet nem roda scripts: o CSS só muda a aparência.')}</p>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
