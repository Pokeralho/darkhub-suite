import React, { useEffect } from 'react';
import { X } from '../icons';
import type { SshResult, SshVaultState } from '../../global';

export interface VaultProps { vault: SshVaultState; reload: () => Promise<void> }

/** Right-side drawer used for the host, key, snippet and tunnel forms. */
export function Drawer({ title, onClose, children, footer }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="w-[min(440px,100vw)] h-full flex flex-col bg-zinc-950 border-l border-zinc-800 shadow-2xl">
        <header className="flex items-center justify-between h-12 px-4 border-b border-zinc-800/80">
          <h2 className="dh-section-title">{title}</h2>
          <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">{children}</div>
        {footer ? <footer className="flex items-center justify-end gap-2 px-4 py-3 border-t border-zinc-800/80">{footer}</footer> : null}
      </aside>
    </div>
  );
}

export function Modal({ title, children, footer, onClose, tone }: { title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; onClose?: () => void; tone?: 'warn' }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (onClose && e.target === e.currentTarget) onClose(); }}>
      <div className={`w-[min(520px,100%)] dh-card p-5 space-y-4 ${tone === 'warn' ? 'border-amber-500/50' : ''}`}>
        <h2 className="dh-section-title">{title}</h2>
        <div className="space-y-3 text-[13px] text-zinc-300">{children}</div>
        {footer ? <div className="flex items-center justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Field({ label, help, children }: { label: string; help?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="dh-label">{label}</span>
      {children}
      {help ? <span className="dh-help block">{help}</span> : null}
    </label>
  );
}

export function EmptyState({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 p-8 text-center space-y-3">
      <p className="text-[13px] text-zinc-400">{text}</p>
      {action}
    </div>
  );
}

export const errText = (r: SshResult<any>) => (r.ok ? '' : r.error || r.code);

export function fmtBytes(n: number) {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}

export const fmtDate = (s?: string | number | null) => (s ? new Date(s).toLocaleString() : '');
