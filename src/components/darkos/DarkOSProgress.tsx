import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle, Loader2, Terminal, XCircle } from '../icons';
import type { DarkOSRunEvent } from '../../types/darkos';
import { useI18n } from '../../i18n/I18nProvider';

/** Live activity feed for 'darkos:runEvent'. Success is shown only for run-finish with ok===true. */
export const DarkOSProgress: React.FC = () => {
  const { t } = useI18n();
  const [logs, setLogs] = useState<DarkOSRunEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<DarkOSRunEvent | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const off = window.darkhub?.darkos?.onRunEvent?.((evt) => {
      setLogs((prev) => [...prev.slice(-199), evt]);
      if (evt.type === 'run-finish' || evt.type === 'error') {
        setRunning(false);
        setLast(evt);
      } else if (evt.type === 'run-start' || evt.type === 'progress' || evt.type === 'log') {
        setRunning(true);
      }
    });
    return () => { off?.(); };
  }, []);

  // Keep the newest line visible.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  const progressEvt = [...logs].reverse().find((l) => typeof l.progress === 'number');
  const progress = running && progressEvt ? Math.round(progressEvt.progress as number) : null;
  const success = !running && last?.type === 'run-finish' && last.ok === true;
  const failed = !running && last?.type === 'error';

  return (
    <section className="dh-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-zinc-800/80">
        <h2 className="dh-section-title truncate">{t('darkos.progress.title', 'DarkOS activity')}</h2>
        <div className="text-[12px] shrink-0">
          {running ? (
            <span className="inline-flex items-center gap-1.5 text-zinc-300">
              <Loader2 size={14} className="animate-spin text-blue-300" />
              {t('darkos.busy', 'Running')}{progress !== null ? <span className="font-mono text-zinc-400"> {progress}%</span> : null}
            </span>
          ) : success ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-400"><CheckCircle size={14} />{t('darkos.result.ok', 'Done and verified.')}</span>
          ) : failed ? (
            <span className="inline-flex items-center gap-1.5 text-red-400"><XCircle size={14} />{t('darkos.result.fail', 'Not confirmed.')}</span>
          ) : null}
        </div>
      </div>
      <div
        className="h-px bg-zinc-800/80 overflow-hidden"
        role={running ? 'progressbar' : undefined}
        aria-label={running ? t('darkos.progress.title', 'DarkOS activity') : undefined}
        aria-valuemin={running ? 0 : undefined}
        aria-valuemax={running ? 100 : undefined}
        aria-valuenow={running ? progress ?? undefined : undefined}
      >
        {running ? (
          <div
            className={`h-full bg-blue-400 transition-[width] duration-500 ease-out ${progress === null ? 'w-1/3 animate-pulse' : ''}`}
            style={progress !== null ? { width: `${progress}%` } : undefined}
          />
        ) : null}
      </div>
      <div ref={logRef} role="log" aria-live="polite" className="bg-zinc-950 px-4 py-3 font-mono text-[11.5px] leading-[1.65] text-zinc-400 h-40 overflow-y-auto">
        {logs.length === 0 ? (
          <div className="flex items-center gap-2 text-zinc-600"><Terminal size={14} />{t('darkos.progress.empty', 'No operation running.')}</div>
        ) : null}
        {logs.map((log, i) => (
          <div
            key={`${log.timestamp ?? 0}-${i}`}
            className={`flex gap-3 ${log.type === 'error' ? 'text-red-400' : log.type === 'run-finish' && log.ok ? 'text-emerald-400' : ''}`}
          >
            <span className="text-zinc-600 shrink-0">{new Date(log.timestamp || Date.now()).toLocaleTimeString()}</span>
            {typeof log.progress === 'number' ? <span className="text-zinc-500 shrink-0 w-10 text-right">{Math.round(log.progress)}%</span> : null}
            <span className="min-w-0 break-words">{log.message || log.error || log.type}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

export default DarkOSProgress;
