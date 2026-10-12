import React, { useEffect, useState } from 'react';
import { CheckCircle, Loader2, Terminal, XCircle } from 'lucide-react';
import type { DarkOSRunEvent } from '../../types/darkos';
import { useI18n } from '../../i18n/I18nProvider';

/** Live activity feed for 'darkos:runEvent'. Success is shown only for run-finish with ok===true. */
export const DarkOSProgress: React.FC = () => {
  const { t } = useI18n();
  const [logs, setLogs] = useState<DarkOSRunEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<DarkOSRunEvent | null>(null);

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

  const progressEvt = [...logs].reverse().find((l) => typeof l.progress === 'number');
  const progress = running && progressEvt ? Math.round(progressEvt.progress as number) : null;
  const success = !running && last?.type === 'run-finish' && last.ok === true;
  const failed = !running && last?.type === 'error';

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Terminal className="w-4 h-4 text-zinc-400 shrink-0" />
          <h3 className="text-sm font-semibold text-zinc-100 truncate">{t('darkos.progress.title', 'DarkOS activity')}</h3>
        </div>
        <div className="text-xs shrink-0">
          {running ? (
            <span className="inline-flex items-center gap-1.5 text-yellow-300">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {t('darkos.busy', 'Running')}{progress !== null ? ` ${progress}%` : ''}
            </span>
          ) : success ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-400"><CheckCircle className="w-3.5 h-3.5" />{t('darkos.result.ok', 'Done and verified.')}</span>
          ) : failed ? (
            <span className="inline-flex items-center gap-1.5 text-red-400"><XCircle className="w-3.5 h-3.5" />{t('darkos.result.fail', 'Not confirmed.')}</span>
          ) : null}
        </div>
      </div>
      {running ? (
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div
            className={`h-full rounded-full bg-[#3b82f6] transition-[width] duration-500 ${progress === null ? 'w-1/2 animate-pulse' : ''}`}
            style={progress !== null ? { width: `${progress}%` } : undefined}
          />
        </div>
      ) : null}
      <div className="bg-black/60 rounded-lg p-3 font-mono text-[11px] text-zinc-300 h-40 overflow-y-auto border border-zinc-800">
        {logs.length === 0 ? <div className="text-zinc-500 italic">{t('darkos.progress.empty', 'No operation running.')}</div> : null}
        {logs.map((log, i) => (
          <div
            key={`${log.timestamp ?? 0}-${i}`}
            className={log.type === 'error' ? 'text-red-400' : log.type === 'run-finish' && log.ok ? 'text-emerald-400' : ''}
          >
            {new Date(log.timestamp || Date.now()).toLocaleTimeString()} - {typeof log.progress === 'number' ? `[${Math.round(log.progress)}%] ` : ''}{log.message || log.error || log.type}
          </div>
        ))}
      </div>
    </div>
  );
};

export default DarkOSProgress;
