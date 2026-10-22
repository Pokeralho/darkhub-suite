import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { DiskMapNode } from '../../global';
import { Cell, HEADER, formatBytes, hitTest, layoutTree } from './treemap';

/** Frost ink for folders (lighter with depth); files keep a muted hue per class so types read at a glance. */
const INK = (l: number) => `oklch(${l.toFixed(3)} 0.012 255)`;
export const CLASS_COLOR: Record<string, string> = {
  video: 'oklch(0.44 0.07 330)', audio: 'oklch(0.44 0.07 300)', image: 'oklch(0.46 0.06 200)', archive: 'oklch(0.47 0.07 70)',
  program: 'oklch(0.44 0.07 25)', code: 'oklch(0.46 0.06 150)', document: 'oklch(0.46 0.06 240)', data: 'oklch(0.42 0.04 110)',
  other: 'oklch(0.40 0.012 255)'
};
export const TAG_COLOR: Record<string, string> = { red: 'oklch(0.66 0.19 25)', yellow: 'oklch(0.84 0.15 90)', green: 'oklch(0.74 0.16 150)', blue: 'oklch(0.72 0.12 235)' };
const FREE = 'oklch(0.30 0.035 160)';
const UNKNOWN = 'oklch(0.24 0.012 255)';
const REST = 'oklch(0.27 0.012 255)';

function fill(node: DiskMapNode, depth: number) {
  if (node.kind === 'dir') return INK(Math.min(0.215 + depth * 0.032, 0.40));
  if (node.kind === 'file') return CLASS_COLOR[node.cls || 'other'] || CLASS_COLOR.other;
  if (node.kind === 'free') return FREE;
  if (node.kind === 'unknown') return UNKNOWN;
  return REST;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (max <= 8) return '';
  if (ctx.measureText(text).width <= max) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ctx.measureText(`${text.slice(0, mid)}…`).width <= max) lo = mid; else hi = mid - 1; }
  return lo > 0 ? `${text.slice(0, lo)}…` : '';
}

interface Props {
  tree: DiskMapNode | null;
  minPx: number;
  selectedId: string | null;
  labelFor: (node: DiskMapNode) => string;
  onSelect: (node: DiskMapNode | null) => void;
  onOpen: (node: DiskMapNode) => void;
  onSize?: (w: number, h: number) => void;
  dim?: boolean;
  filesWord?: string;
}

export default function TreemapCanvas({ tree, minPx, selectedId, labelFor, onSelect, onOpen, onSize, dim, filesWord = 'files' }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<{ cell: Cell; x: number; y: number } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.floor(e.contentRect.width), h = Math.floor(e.contentRect.height);
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { if (size.w && size.h) onSize?.(size.w, size.h); }, [size, onSize]);

  const cells = useMemo(() => (tree ? layoutTree(tree, size.w, size.h, minPx) : []), [tree, size, minPx]);

  // Static layer: redrawn only when the layout changes.
  useEffect(() => {
    const dpr = window.devicePixelRatio || 1;
    const base = baseRef.current || (baseRef.current = document.createElement('canvas'));
    base.width = Math.max(1, size.w * dpr); base.height = Math.max(1, size.h * dpr);
    const ctx = base.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = 'oklch(0.158 0.010 255)';
    ctx.fillRect(0, 0, size.w, size.h);
    ctx.textBaseline = 'middle';
    for (const c of cells) {
      const { node, x, y, w, h, depth } = c;
      ctx.fillStyle = fill(node, depth);
      ctx.fillRect(x, y, w, h);
      if (node.kind === 'free' || node.kind === 'rest' || node.kind === 'unknown') {
        // quiet diagonal hatch: not real files
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
        ctx.strokeStyle = 'oklch(1 0 0 / 0.05)'; ctx.lineWidth = 1;
        for (let s = -h; s < w; s += 7) { ctx.beginPath(); ctx.moveTo(x + s, y + h); ctx.lineTo(x + s + h, y); ctx.stroke(); }
        ctx.restore();
      }
      if (c.open) { ctx.fillStyle = 'oklch(0 0 0 / 0.28)'; ctx.fillRect(x, y, w, HEADER); }
      ctx.strokeStyle = 'oklch(0.158 0.010 255)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));

      if (w > 34 && h > 14) {
        const label = labelFor(node);
        const sizeText = formatBytes(node.size);
        ctx.font = '500 11px Geist Variable, Geist, system-ui, sans-serif';
        const tagGap = node.tag ? 12 : 0;
        if (c.open || h < 32) {
          const room = w - 10 - tagGap;
          ctx.font = '400 10.5px Geist Mono Variable, Geist Mono, ui-monospace, monospace';
          const sw = ctx.measureText(sizeText).width;
          const showSize = room - sw > 40;
          ctx.font = '500 11px Geist Variable, Geist, system-ui, sans-serif';
          ctx.fillStyle = 'oklch(0.945 0.006 255)';
          ctx.fillText(fitText(ctx, label, showSize ? room - sw - 8 : room), x + 5, y + 8.5);
          if (showSize) {
            ctx.font = '400 10.5px Geist Mono Variable, Geist Mono, ui-monospace, monospace';
            ctx.fillStyle = 'oklch(0.67 0.014 255)';
            ctx.fillText(sizeText, x + w - 5 - tagGap - sw, y + 8.5);
          }
        } else {
          ctx.fillStyle = 'oklch(0.945 0.006 255)';
          ctx.fillText(fitText(ctx, label, w - 10 - tagGap), x + 5, y + 10);
          ctx.font = '400 10.5px Geist Mono Variable, Geist Mono, ui-monospace, monospace';
          ctx.fillStyle = 'oklch(0.79 0.011 255 / 0.85)';
          ctx.fillText(fitText(ctx, sizeText, w - 10), x + 5, y + 24);
        }
        if (node.tag) {
          ctx.fillStyle = TAG_COLOR[node.tag];
          ctx.beginPath(); ctx.arc(x + w - 8, y + 8.5, 3.5, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }, [cells, size, labelFor]);

  // Composite: static layer + hover/selection outlines.
  useEffect(() => {
    const canvas = canvasRef.current, base = baseRef.current;
    if (!canvas || !base) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== base.width || canvas.height !== base.height) {
      canvas.width = base.width; canvas.height = base.height;
      canvas.style.width = `${size.w}px`; canvas.style.height = `${size.h}px`;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(base, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sel = selectedId ? cells.find((c) => c.node.id === selectedId) : null;
    if (sel) {
      ctx.strokeStyle = 'oklch(0.81 0.085 228)'; ctx.lineWidth = 2;
      ctx.strokeRect(sel.x + 1, sel.y + 1, Math.max(0, sel.w - 2), Math.max(0, sel.h - 2));
    }
    if (hover && hover.cell !== sel) {
      ctx.strokeStyle = 'oklch(0.975 0.004 255 / 0.85)'; ctx.lineWidth = 1;
      ctx.strokeRect(hover.cell.x + 0.5, hover.cell.y + 0.5, Math.max(0, hover.cell.w - 1), Math.max(0, hover.cell.h - 1));
    }
  }, [cells, size, hover, selectedId]);

  const pick = (e: React.MouseEvent) => {
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r) return null;
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const cell = hitTest(cells, x, y);
    return cell ? { cell, x, y } : null;
  };

  const hn = hover?.cell.node;
  const tipLeft = hover ? Math.min(hover.x + 14, Math.max(0, size.w - 260)) : 0;
  const tipTop = hover ? (hover.y + 90 > size.h ? hover.y - 70 : hover.y + 16) : 0;

  return (
    <div ref={wrapRef} className={`relative w-full h-full overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950 transition-opacity duration-200 ${dim ? 'opacity-60' : ''}`}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={tree ? `${labelFor(tree)} ${formatBytes(tree.size)}` : ''}
        className="block cursor-default"
        onMouseMove={(e) => { const p = pick(e); setHover((h) => (p ? p : h ? null : h)); }}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => onSelect(pick(e)?.cell.node ?? null)}
        onDoubleClick={(e) => { const p = pick(e); if (p) onOpen(p.cell.node); }}
      />
      {hn && hover ? (
        <div className="pointer-events-none absolute z-10 w-[250px] rounded-lg border border-zinc-700/80 bg-zinc-900/95 px-3 py-2 shadow-xl" style={{ left: tipLeft, top: Math.max(4, tipTop) }}>
          <div className="text-[12.5px] text-zinc-100 truncate">{labelFor(hn)}</div>
          <div className="mt-0.5 flex items-baseline gap-2 font-mono text-[11.5px]">
            <span className="text-zinc-200">{formatBytes(hn.size)}</span>
            {tree && tree.size > 0 ? <span className="text-zinc-500">{((hn.size / tree.size) * 100).toFixed(1)}%</span> : null}
            {hn.kind === 'dir' && hn.files ? <span className="text-zinc-500 truncate">{hn.files.toLocaleString()} {filesWord}</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
