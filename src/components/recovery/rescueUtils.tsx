import React from 'react';
import type { RescueEvent, RescueLayoutItem } from '../../global';

export const api = () => window.darkhub?.recovery;

export function fmtBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : i >= 3 ? 2 : 1)} ${u[i]}`;
}

export function fmtEta(s: number): string {
  if (!s || s < 0) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : m ? `${m}m ${String(sec).padStart(2, '0')}s` : `${sec}s`;
}

/** Colours per filesystem family (data colours, not UI accents). */
export const KIND_STYLE: Record<RescueLayoutItem['kind'], { bar: string; dot: string; label: string }> = {
  ntfs: { bar: 'bg-blue-500/70', dot: 'bg-blue-400', label: 'NTFS / ReFS' },
  fat: { bar: 'bg-emerald-500/60', dot: 'bg-emerald-400', label: 'FAT / exFAT' },
  ext: { bar: 'bg-orange-500/65', dot: 'bg-orange-400', label: 'ext / Linux' },
  raw: { bar: 'bg-zinc-600/70', dot: 'bg-zinc-500', label: 'RAW' },
  unallocated: { bar: 'bg-zinc-800', dot: 'bg-zinc-700', label: '' }
};

export type ProgressEv = Extract<RescueEvent, { event: 'progress' }>;

export function JobProgress({ ev, label, onCancel, cancelLabel }: { ev: ProgressEv | null; label: string; onCancel?: () => void; cancelLabel: string }) {
  const pct = ev ? Math.min(100, ev.percent) : 0;
  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex items-center justify-between gap-3 text-[12px]">
        <span className="text-zinc-300">{label}</span>
        <span className="font-mono text-zinc-400">
          {ev ? (
            <>
              {pct.toFixed(1)}% <span className="text-zinc-600">·</span> {fmtBytes(ev.bytes)} <span className="text-zinc-500">/ {fmtBytes(ev.total)}</span>
              {ev.speed_bps ? <> <span className="text-zinc-600">·</span> {fmtBytes(ev.speed_bps)}/s</> : null}
              {ev.eta_s ? <> <span className="text-zinc-600">·</span> {fmtEta(ev.eta_s)}</> : null}
            </>
          ) : '...'}
        </span>
      </div>
      <div className="h-1.5 rounded bg-zinc-800 overflow-hidden">
        <div className="h-full bg-blue-400 transition-[width] duration-200 ease-out" style={{ width: `${pct}%` }} />
      </div>
      {onCancel ? <button type="button" className="dh-btn dh-btn-sm" onClick={onCancel}>{cancelLabel}</button> : null}
    </div>
  );
}

export function ErrorLine({ text }: { text: string | null | undefined }) {
  return text ? <p role="alert" className="text-[12.5px] text-red-400">{text}</p> : null;
}
