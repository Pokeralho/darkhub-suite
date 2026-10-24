import React, { useState } from 'react';
import { Check, Copy } from '../components/icons';
import { useI18n } from '../i18n/I18nProvider';

/** Translation helper: T('key', 'Fallback pt-BR') -> t('devx.key', fallback). */
export function useDevT() {
  const { t } = useI18n();
  return (key: string, pt: string) => t(`devx.${key}`, pt);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export const CopyButton = ({ text, label, className = '' }: { text: string; label?: string; className?: string }) => {
  const T = useDevT();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      disabled={!text}
      aria-label={label ?? T('copy', 'Copiar')}
      title={label ?? T('copy', 'Copiar')}
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        }
      }}
      className={`dh-btn dh-btn-sm dh-btn-ghost !px-2 ${className}`}
    >
      {done ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />}
    </button>
  );
};

export const textareaCls = 'dh-input w-full py-3 font-mono text-[12.5px] leading-relaxed resize-none';
export const selectCls = 'dh-input w-full font-mono';

export const Segmented = <V extends string>({ value, options, onChange, label }: { value: V; options: { id: V; label: string }[]; onChange: (v: V) => void; label: string }) => (
  <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-md border border-zinc-800 p-0.5">
    {options.map(o => (
      <button
        key={o.id}
        role="radio"
        aria-checked={value === o.id}
        onClick={() => onChange(o.id)}
        className={`h-7 px-3 rounded text-[12px] transition-colors ${value === o.id ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-400 hover:text-zinc-200'}`}
      >
        {o.label}
      </button>
    ))}
  </div>
);
