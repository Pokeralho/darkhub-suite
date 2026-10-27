import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { OvlCanvas, OvlPreview } from '../../global';

// Same base rules as electron/assets/overlay/overlay.html, so the preview matches the in-game overlay.
const BASE = `
:host { all: initial; }
#stage { position: relative; overflow: hidden; }
#box { position: absolute; box-sizing: border-box; font: 600 13px/1.25 "Segoe UI", system-ui, sans-serif; color: #f4f4f5; user-select: none; }
#box.drag { outline: 1px dashed rgba(96,165,250,.9); cursor: grab; }
#box.sel-hint .w.sel { outline: 1px dashed rgba(251,191,36,.9); outline-offset: 1px; }
canvas { display: block; }
`;

const ok = (c?: string) => (c && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|[a-z]{3,20})$/i.test(c) ? c : '#e4e4e7');

/** Same drawing as overlay.html's drawCanvases. */
export function drawCanvases(root: ShadowRoot, list: OvlCanvas[], autoW: number) {
  for (const c of list || []) {
    const cv = root.getElementById(c.id) as HTMLCanvasElement | null;
    if (!cv) continue;
    const W = c.width || autoW, H = c.height;
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    if (!ctx) continue;
    if (c.kind === 'bars') {
      const vals = c.values || [], n = Math.max(1, vals.length), bw = W / n;
      vals.forEach((x, i) => {
        const v = Math.max(0, Math.min(100, x)), h = Math.max(1, (v / 100) * H);
        ctx.fillStyle = ok(v >= 95 ? c.colors?.[2] : v >= 80 ? c.colors?.[1] : c.colors?.[0]);
        ctx.fillRect(i * bw + 1, H - h, Math.max(1, bw - 2), h);
      });
      continue;
    }
    if (c.grid) { ctx.strokeStyle = 'rgba(161,161,170,0.18)'; ctx.lineWidth = 1; for (const y of [0.25, 0.5, 0.75]) { ctx.beginPath(); ctx.moveTo(0, H * y); ctx.lineTo(W, H * y); ctx.stroke(); } }
    const floor = c.floor ?? 0, ceil = c.ceil ?? 1, span = Math.max(1e-6, ceil - floor);
    for (const sr of c.series || []) {
      const v = sr.values;
      if (!v || v.length < 2) continue;
      const pts = v.map((x, i) => [(i / (v.length - 1)) * W, H - 1 - ((Math.min(ceil, Math.max(floor, x)) - floor) / span) * (H - 2)]);
      ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.strokeStyle = ok(sr.color); ctx.lineWidth = c.lineWidth || 1.5; ctx.stroke();
      if (c.fill) { ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.globalAlpha = 0.18; ctx.fillStyle = ok(sr.color); ctx.fill(); ctx.globalAlpha = 1; }
    }
  }
}

export const BACKGROUNDS: Record<string, string> = {
  dark: 'radial-gradient(ellipse at 70% 30%, #3b4a63 0%, #1b2333 45%, #0b0f17 100%)',
  bright: 'linear-gradient(180deg, #9bd2ff 0%, #d8efff 45%, #c9b48a 46%, #8a6f45 100%)',
  forest: 'linear-gradient(180deg, #2f5d50 0%, #6f9f6b 50%, #2b3b22 100%)',
  checker: 'repeating-conic-gradient(#3f3f46 0% 25%, #27272a 0% 50%) 50% / 24px 24px'
};

/**
 * The layout over a 1920x1080 "screen" scaled to fit (mode 'screen', draggable) or at its real size (mode 'actual').
 * Rendered in a shadow root so the user's CSS cannot touch the app.
 */
export default function OverlayStage({ preview, mode, background, onDrag, selectedId }: {
  preview: OvlPreview | null; mode: 'screen' | 'actual'; background: string; selectedId?: string | null;
  onDrag?: (dx: number, dy: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0.4);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFit(Math.max(0.15, el.clientWidth / 1920)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !preview) return;
    const root = host.shadowRoot || host.attachShadow({ mode: 'open' });
    const screen = mode === 'screen';
    root.innerHTML = `<style>${BASE}</style><style>${preview.css.replace(/<\/style/gi, '')}</style>`
      + `<div id="stage" style="${screen ? `width:1920px;height:1080px;transform:scale(${fit});transform-origin:top left;` : 'padding:24px;min-height:120px;'}background:${BACKGROUNDS[background] || BACKGROUNDS.dark}">`
      + `<div id="box" class="custom${screen ? ' drag' : ''}${selectedId ? ' sel-hint' : ''}">${preview.html}</div></div>`;
    const box = root.getElementById('box') as HTMLDivElement;
    const b = preview.box;
    if (screen) {
      const v = b.anchor[0], h = b.anchor[1];
      let tx = '0', ty = '0';
      if (h === 'l') box.style.left = `${b.offsetX}px`; else if (h === 'r') box.style.right = `${-b.offsetX}px`; else { box.style.left = `calc(50% + ${b.offsetX}px)`; tx = '-50%'; }
      if (v === 't') box.style.top = `${b.offsetY}px`; else if (v === 'b') box.style.bottom = `${-b.offsetY}px`; else { box.style.top = `calc(50% + ${b.offsetY}px)`; ty = '-50%'; }
      box.style.transform = `translate(${tx}, ${ty}) scale(${b.scale})`;
      box.style.transformOrigin = `${v === 'b' ? 'bottom' : v === 't' ? 'top' : 'center'} ${h === 'r' ? 'right' : h === 'l' ? 'left' : 'center'}`;
    } else {
      box.style.position = 'relative';
      box.style.display = 'inline-flex';
      box.style.transform = `scale(${b.scale})`;
      box.style.transformOrigin = 'top left';
    }
    box.style.opacity = String(b.opacity);
    if (selectedId) root.getElementById(`w-${selectedId}`)?.classList.add('sel');
    const row = getComputedStyle(box).flexDirection === 'row';
    const texts = [...box.children].filter((e) => !e.classList.contains('w-graph') && !e.classList.contains('w-bars'));
    const content = row ? 160 : Math.max(120, ...texts.map((e) => (e as HTMLElement).offsetWidth));
    drawCanvases(root, preview.canvases, Math.round(content));

    if (!screen || !onDrag) return;
    let start: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => { start = { x: e.clientX, y: e.clientY }; box.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => {
      if (!start) return;
      const dx = (e.clientX - start.x) / fit, dy = (e.clientY - start.y) / fit;
      box.style.translate = `${dx}px ${dy}px`;
    };
    const up = (e: PointerEvent) => {
      if (!start) return;
      const dx = Math.round((e.clientX - start.x) / fit), dy = Math.round((e.clientY - start.y) / fit);
      start = null;
      if (dx || dy) onDrag(dx, dy);
    };
    box.addEventListener('pointerdown', down);
    box.addEventListener('pointermove', move);
    box.addEventListener('pointerup', up);
    return () => { box.removeEventListener('pointerdown', down); box.removeEventListener('pointermove', move); box.removeEventListener('pointerup', up); };
  }, [preview, mode, background, fit, selectedId, onDrag]);

  return (
    <div ref={wrapRef} className="w-full overflow-hidden rounded-lg border border-zinc-800" style={mode === 'screen' ? { height: Math.round(1080 * fit) } : { overflow: 'auto' }}>
      <div ref={hostRef} />
    </div>
  );
}
