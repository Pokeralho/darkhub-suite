import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, X } from './icons';
import { useI18n } from '../i18n/I18nProvider';
import { keyFromCode, keyFromMouseButton, withModifiers } from '../utils/hotkey';

/**
 * Records any key or combination (Ctrl/Alt/Shift/Win + a key) or a side mouse button. Click, press it, done.
 * Esc cancels recording; the X button removes the hotkey.
 */
export default function HotkeyCapture({ value, onChange, disabled }: { value: string | null; onChange: (hotkey: string) => void; disabled?: boolean }) {
  const { t } = useI18n();
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState('');
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') { setRecording(false); setPreview(''); return; }
      const key = keyFromCode(e.code);
      // holding only modifiers: show them while the user looks for the key
      if (!key) { setPreview(withModifiers(e, '…')); return; }
      setRecording(false);
      setPreview('');
      onChange(withModifiers(e, key));
    };
    const onMouse = (e: MouseEvent) => {
      const key = keyFromMouseButton(e.button);
      if (!key) return;
      e.preventDefault();
      setRecording(false);
      setPreview('');
      onChange(withModifiers(e, key));
    };
    const stop = () => { setRecording(false); setPreview(''); };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onMouse, true);
    window.addEventListener('blur', stop);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onMouse, true);
      window.removeEventListener('blur', stop);
    };
  }, [recording, onChange]);

  return (
    <div className="flex items-center gap-1.5">
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        onClick={() => setRecording((r) => !r)}
        aria-pressed={recording}
        className={`h-8 min-w-[150px] px-3 rounded-md border font-mono text-[12.5px] inline-flex items-center gap-2 transition-colors duration-150 ${
          recording ? 'border-blue-400 bg-blue-500/10 text-blue-100' : 'border-zinc-700 text-zinc-100 hover:border-zinc-500'
        }`}
      >
        <Keyboard size={13} className="shrink-0 text-zinc-400" />
        {recording ? (preview || t('autoclicker.hotkey.press', 'Pressione a tecla ou combinação…')) : (value || t('autoclicker.hotkey.none', 'Sem atalho'))}
      </button>
      {value && !recording ? (
        <button type="button" disabled={disabled} onClick={() => onChange('')} className="dh-btn dh-btn-ghost dh-btn-sm" aria-label={t('autoclicker.hotkey.clear', 'Remover atalho')} title={t('autoclicker.hotkey.clear', 'Remover atalho')}>
          <X size={13} />
        </button>
      ) : null}
    </div>
  );
}
