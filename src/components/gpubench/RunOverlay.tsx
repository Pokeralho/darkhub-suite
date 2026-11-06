import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Square } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';

const TITLEBAR = 36;

/**
 * Covers the app while the engine runs. The engine draws in a native child window placed over the `stage` box: a child
 * window cannot be clipped by the page, so this stays fixed, never scrolls, and nothing can open above it. Portal to body:
 * the page's enter animation leaves a transform that would make `fixed` relative to the page, not the window.
 */
export default function RunOverlay({ title, status, detail, percent, onCancel, cancelLabel }: {
  title: string; status: string; detail?: string; percent: number; onCancel: () => void; cancelLabel?: string;
}) {
  const { t } = useI18n();
  const stage = useRef<HTMLDivElement>(null);
  const [fps, setFps] = useState<number | null>(null);

  useEffect(() => window.darkhub?.gpubench.onEvent((e) => { if (e.type === 'tick') setFps(e.fps); }), []);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const send = () => {
      const r = el.getBoundingClientRect();
      const k = window.devicePixelRatio || 1; // CSS pixels to the physical pixels of the native window
      void window.darkhub?.gpubench.viewport({ x: r.left * k, y: r.top * k, w: r.width * k, h: r.height * k });
    };
    send();
    const seen = new ResizeObserver(send);
    seen.observe(el);
    window.addEventListener('resize', send);
    return () => {
      seen.disconnect();
      window.removeEventListener('resize', send);
      void window.darkhub?.gpubench.viewport({ x: 0, y: 0, w: 1, h: 1, visible: false });
    };
  }, []);

  return createPortal(
    <div data-gpu-overlay className="fixed inset-x-0 bottom-0 z-[60] flex flex-col gap-3 bg-zinc-950 p-4" style={{ top: TITLEBAR }}>
      <div className="flex-1 min-h-0 flex items-center justify-center">
        {/* 16:9 as large as fits: width from the height when the window is wide */}
        <div ref={stage} className="bg-black rounded-lg max-w-full max-h-full" style={{ aspectRatio: '16 / 9', width: `min(100%, calc((100vh - ${TITLEBAR + 112}px) * 16 / 9))` }} />
      </div>
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-[13.5px] font-semibold text-zinc-100 truncate">{title} <span className="font-normal text-zinc-400">· {status}</span></p>
          <div className="h-1 rounded-full bg-zinc-800 overflow-hidden" role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-blue-400 transition-[width] duration-200" style={{ width: `${Math.min(100, percent)}%` }} />
          </div>
        </div>
        {detail && <span className="font-mono tabular-nums text-[12.5px] text-zinc-400 shrink-0">{detail}</span>}
        <span className="font-mono tabular-nums text-xl text-blue-400 shrink-0 w-28 text-right">{fps == null ? '-' : fps.toFixed(0)}<span className="text-[12px] text-zinc-500"> FPS</span></span>
        <button type="button" onClick={onCancel} className="dh-btn dh-btn-danger shrink-0"><Square size={14} />{cancelLabel ?? t('gpubench.cancel', 'Cancelar')}</button>
      </div>
    </div>,
    document.body
  );
}
