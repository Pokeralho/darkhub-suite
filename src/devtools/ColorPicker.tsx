import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Plus, Trash2, X } from '../components/icons';
import {
  cmykToRgb, contrastRatio, flatten, formatCmyk, formatHsl, formatHsv, formatRgb, hsvToRgb, parseColor, parseHex, rgbToHsv, rgbaToHex, wcagLevels,
  type RGBA,
} from './color';
import { CopyButton, useDevT } from './ui';

const STORAGE_KEY = 'darkhub.devtools.colorHistory';
const MAX_HISTORY = 24;

interface EyeDropperLike { open: (o?: { signal?: AbortSignal }) => Promise<{ sRGBHex: string }> }
const getEyeDropper = (): (new () => EyeDropperLike) | null => (typeof window !== 'undefined' && (window as any).EyeDropper) || null;

function loadHistory(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string' && !!parseHex(x)).slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}
function saveHistory(list: string[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
}

const parseHsv = (t: string): RGBA | null => {
  const n = t.match(/-?\d+(\.\d+)?/g)?.map(Number);
  if (!n || n.length < 3) return null;
  return { ...hsvToRgb({ h: n[0], s: n[1], v: n[2] }), a: 1 };
};
const parseCmykText = (t: string): RGBA | null => {
  const n = t.match(/-?\d+(\.\d+)?/g)?.map(Number);
  if (!n || n.length < 4) return null;
  return { ...cmykToRgb({ c: n[0], m: n[1], y: n[2], k: n[3] }), a: 1 };
};

/** Text field that stays editable while typing and reformats from the colour when not focused. */
const ColorField = ({ label, format, parse, onValid, value }: { label: string; format: string; parse: (t: string) => RGBA | null; onValid: (c: RGBA) => void; value: RGBA }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const bad = draft !== null && draft.trim() !== '' && !parse(draft);
  const shown = draft ?? format;
  return (
    <div className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-2">
      <label className="dh-label">{label}</label>
      <input
        value={shown}
        spellCheck={false}
        aria-invalid={bad}
        onFocus={() => setDraft(format)}
        onBlur={() => setDraft(null)}
        onChange={e => {
          setDraft(e.target.value);
          const c = parse(e.target.value);
          if (c) onValid(label === 'HSV' || label === 'CMYK' ? { ...c, a: value.a } : c);
        }}
        className={`dh-input w-full font-mono ${bad ? '!border-red-500/60' : ''}`}
      />
      <CopyButton text={format} label={`Copiar ${label}`} />
    </div>
  );
};

const sliderCls = 'w-full h-3 rounded-full appearance-none cursor-pointer outline-none border border-zinc-700 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-zinc-900 [&::-webkit-slider-thumb]:shadow focus-visible:ring-2 ring-blue-400/70';
const checker = 'conic-gradient(#3f3f46 25%, #27272a 0 50%, #3f3f46 0 75%, #27272a 0) 0 0 / 12px 12px';

const ColorPicker = () => {
  const T = useDevT();
  const [hsv, setHsv] = useState({ h: 210, s: 70, v: 90 });
  const [alpha, setAlpha] = useState(1);
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [second, setSecond] = useState('#FFFFFF');
  const [eyeError, setEyeError] = useState('');
  const svRef = useRef<HTMLDivElement>(null);
  const EyeDropper = getEyeDropper();

  const rgb = hsvToRgb(hsv);
  const color: RGBA = { ...rgb, a: alpha };
  const hex = rgbaToHex(color);

  const setColor = useCallback((c: RGBA) => {
    const next = rgbToHsv(c);
    // keep the hue when the colour is grey (hue is undefined there)
    setHsv(prev => ({ h: next.s === 0 || next.v === 0 ? prev.h : next.h, s: next.s, v: next.v }));
    setAlpha(c.a);
  }, []);

  const remember = useCallback((h: string) => {
    setHistory(prev => {
      const next = [h, ...prev.filter(x => x !== h)].slice(0, MAX_HISTORY);
      saveHistory(next);
      return next;
    });
  }, []);

  const pickSv = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = svRef.current?.getBoundingClientRect();
    if (!r) return;
    const s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const v = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
    setHsv(p => ({ ...p, s: s * 100, v: v * 100 }));
  };

  const eyedrop = async () => {
    if (!EyeDropper) return;
    setEyeError('');
    try {
      const res = await new EyeDropper().open();
      const c = parseHex(res.sRGBHex);
      if (c) { setColor(c); remember(rgbaToHex(c)); }
    } catch (e: any) {
      if (e?.name !== 'AbortError') setEyeError(T('eyeFail', 'Não foi possível capturar a cor.'));
    }
  };

  // keyboard accessibility for the SV area
  const onSvKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 2;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const m = d[e.key];
    if (!m) return;
    e.preventDefault();
    setHsv(p => ({ ...p, s: Math.min(100, Math.max(0, p.s + m[0])), v: Math.min(100, Math.max(0, p.v + m[1])) }));
  };

  useEffect(() => { setEyeError(''); }, [hex]);

  const other = parseColor(second);
  const rows: { label: string; bg: RGBA | null }[] = [
    { label: T('onWhite', 'Sobre branco'), bg: { r: 255, g: 255, b: 255, a: 1 } },
    { label: T('onBlack', 'Sobre preto'), bg: { r: 0, g: 0, b: 0, a: 1 } },
    { label: T('onCustom', 'Contra a cor:'), bg: other },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-4">
      <section className="dh-card p-4 space-y-3">
        <div
          ref={svRef}
          role="slider"
          tabIndex={0}
          aria-label={T('svArea', 'Saturação e brilho')}
          aria-valuetext={`S ${Math.round(hsv.s)}%, V ${Math.round(hsv.v)}%`}
          aria-valuenow={Math.round(hsv.s)}
          onKeyDown={onSvKey}
          onPointerDown={e => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); pickSv(e); }}
          onPointerMove={e => { if (e.buttons === 1) pickSv(e); }}
          className="relative h-48 rounded-lg cursor-crosshair touch-none select-none outline-none focus-visible:ring-2 ring-blue-400/70"
          style={{ background: `linear-gradient(to top,#000,transparent), linear-gradient(to right,#fff,hsl(${hsv.h} 100% 50%))` }}
        >
          <span
            className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)] pointer-events-none"
            style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%`, background: hex.slice(0, 7) }}
          />
        </div>

        <input
          type="range" min={0} max={360} step={1} value={Math.round(hsv.h)}
          aria-label={T('hue', 'Matiz')}
          onChange={e => setHsv(p => ({ ...p, h: Number(e.target.value) }))}
          className={sliderCls}
          style={{ background: 'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)' }}
        />
        <input
          type="range" min={0} max={100} step={1} value={Math.round(alpha * 100)}
          aria-label={T('alpha', 'Transparência (alfa)')}
          onChange={e => setAlpha(Number(e.target.value) / 100)}
          className={sliderCls}
          style={{ background: `linear-gradient(to right, transparent, ${hex.slice(0, 7)}), ${checker}` }}
        />

        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-md border border-zinc-700 shrink-0" style={{ background: `linear-gradient(${formatRgb(color)},${formatRgb(color)}), ${checker}` }} aria-label={T('preview', 'Prévia')} />
          <div className="font-mono text-[13px] text-zinc-50">{hex}</div>
          <div className="ml-auto flex gap-1.5">
            <button type="button" className="dh-btn dh-btn-sm" onClick={() => remember(hex)}><Plus size={14} /> {T('save', 'Salvar')}</button>
          </div>
        </div>

        {EyeDropper ? (
          <button type="button" onClick={eyedrop} className="dh-btn dh-btn-accent w-full">{T('eyedropper', 'Conta-gotas (capturar cor da tela)')}</button>
        ) : (
          <p className="dh-help">{T('noEye', 'Conta-gotas indisponível neste navegador.')}</p>
        )}
        {eyeError && <p role="alert" className="dh-help text-red-300">{eyeError}</p>}
      </section>

      <div className="space-y-4 min-w-0">
        <section className="dh-card p-4 space-y-2">
          <h2 className="dh-section-title mb-1">{T('values', 'Valores')}</h2>
          <ColorField label="HEX" value={color} format={hex} parse={parseHex} onValid={setColor} />
          <ColorField label="RGB" value={color} format={formatRgb(color)} parse={t => { const c = parseColor(t); return c && /^rgb/i.test(t.trim()) ? c : null; }} onValid={setColor} />
          <ColorField label="HSL" value={color} format={formatHsl(color)} parse={t => { const c = parseColor(t); return c && /^hsl/i.test(t.trim()) ? c : null; }} onValid={setColor} />
          <ColorField label="HSV" value={color} format={formatHsv(rgb)} parse={parseHsv} onValid={setColor} />
          <ColorField label="CMYK" value={color} format={formatCmyk(rgb)} parse={parseCmykText} onValid={setColor} />
        </section>

        <section className="dh-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="dh-section-title">{T('contrast', 'Contraste (WCAG)')}</h2>
            <div className="flex items-center gap-2">
              <span className="dh-label">{T('secondColor', 'Segunda cor')}</span>
              <input value={second} onChange={e => setSecond(e.target.value)} spellCheck={false} aria-invalid={!other} className={`dh-input w-28 font-mono ${other ? '' : '!border-red-500/60'}`} />
              <input type="color" aria-label={T('secondColor', 'Segunda cor')} value={other ? rgbaToHex({ ...other, a: 1 }).slice(0, 7) : '#ffffff'} onChange={e => setSecond(e.target.value.toUpperCase())} className="h-8 w-8 rounded bg-transparent border border-zinc-800 p-0.5" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {rows.map(r => {
              if (!r.bg) return <div key={r.label} className="dh-help">{T('invalidColor', 'Cor inválida')}</div>;
              const bgOpaque = flatten(r.bg);
              const ratio = contrastRatio(flatten(color, bgOpaque), bgOpaque);
              const lv = wcagLevels(ratio);
              const badge = (ok: boolean, name: string) => (
                <span className={`inline-flex items-center gap-1 px-1.5 h-5 rounded text-[10.5px] font-mono ${ok ? 'bg-emerald-400/10 text-emerald-300' : 'bg-red-400/10 text-red-300'}`}>
                  {ok ? <Check size={11} /> : <X size={11} />}{name}
                </span>
              );
              return (
                <div key={r.label} className="rounded-md border border-zinc-800 overflow-hidden">
                  <div className="px-3 py-3 text-[15px] font-semibold" style={{ background: rgbaToHex({ ...bgOpaque, a: 1 }), color: rgbaToHex({ ...flatten(color, bgOpaque), a: 1 }) }}>
                    Aa <span className="text-[12px] font-normal">{T('sample', 'Texto de exemplo')}</span>
                  </div>
                  <div className="p-2.5 space-y-1.5">
                    <div className="flex items-baseline justify-between"><span className="dh-label">{r.label}</span><span className="font-mono text-[14px] text-zinc-50">{ratio.toFixed(2)}:1</span></div>
                    <div className="flex flex-wrap gap-1">{badge(lv.aaNormal, 'AA')}{badge(lv.aaLarge, `AA ${T('large', 'grande')}`)}{badge(lv.aaaNormal, 'AAA')}{badge(lv.aaaLarge, `AAA ${T('large', 'grande')}`)}</div>
                  </div>
                </div>
              );
            })}
          </div>
          {alpha < 1 && <p className="dh-help">{T('alphaNote', 'Com transparência, o contraste é calculado sobre o fundo de cada cartão.')}</p>}
        </section>

        <section className="dh-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="dh-section-title">{T('history', 'Cores recentes')}</h2>
            {history.length > 0 && (
              <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" onClick={() => { setHistory([]); saveHistory([]); }}><Trash2 size={13} /> {T('clear', 'Limpar')}</button>
            )}
          </div>
          {history.length === 0 ? (
            <p className="dh-help">{T('historyEmpty', 'Nenhuma cor salva. Use Salvar ou o conta-gotas.')}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {history.map(h => (
                <button
                  key={h}
                  type="button"
                  title={h}
                  aria-label={h}
                  onClick={() => { const c = parseHex(h); if (c) setColor(c); }}
                  className="h-7 w-7 rounded-md border border-zinc-700 hover:scale-110 transition-transform"
                  style={{ background: `linear-gradient(${h},${h}), ${checker}` }}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default ColorPicker;
