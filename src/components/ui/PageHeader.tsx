import React from 'react';

// Standard page header for every screen: title, one line of context, optional actions on the right.
// No icon chip, no version pill, no uppercase eyebrow (see DESIGN.md).
export default function PageHeader({ title, subtitle, actions, children }: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 pb-5 mb-6 border-b border-zinc-900">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.02em] text-zinc-50">{title}</h1>
          {subtitle ? <p className="mt-1 text-[13px] text-zinc-400 max-w-[80ch]">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}
