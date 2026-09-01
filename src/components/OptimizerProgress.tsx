import React from 'react';
import { useOptimizerProgress } from '../hooks/useOptimizerProgress';
import { CheckCircle, Loader2, Terminal, XCircle } from 'lucide-react';

interface OptimizerProgressProps {
  routineId?: string | null;
  title: string;
  emptyMessage?: string;
}

export const OptimizerProgress: React.FC<OptimizerProgressProps> = ({
  routineId,
  title,
  emptyMessage = 'Aguardando inicio da rotina...'
}) => {
  const { logs, isRunning, lastComplete, clearLogs } = useOptimizerProgress({ routineId: routineId ?? undefined });
  const hasError = logs.some((log) => log.type === 'error' || log.ok === false);
  const visibleLogs = logs.slice(-120);
  const progressLog = [...logs].reverse().find((log: any) => typeof log.progress === 'number') as any;
  const progress = progressLog ? Math.max(0, Math.min(100, Math.round(progressLog.progress))) : null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-zinc-800 rounded-lg shrink-0">
            <Terminal className="w-5 h-5 text-zinc-400" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-white truncate">{title}</h3>
            <p className="text-xs text-zinc-500 truncate">{routineId ? `Rotina: ${routineId}` : 'Eventos de otimização em tempo real'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm shrink-0">
          {isRunning ? (
            <span className="inline-flex items-center gap-2 text-yellow-300">
              <Loader2 className="w-4 h-4 animate-spin" />
              {progress !== null ? `Executando ${progress}%` : 'Executando'}
            </span>
          ) : null}
          {lastComplete && !hasError ? (
            <span className="inline-flex items-center gap-2 text-emerald-400">
              <CheckCircle className="w-4 h-4" />
              Concluido
            </span>
          ) : null}
          {hasError ? (
            <span className="inline-flex items-center gap-2 text-red-400">
              <XCircle className="w-4 h-4" />
              Erro
            </span>
          ) : null}
        </div>
      </div>

      {isRunning ? (
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div
            className={`h-full rounded-full bg-blue-400 transition-[width] duration-500 ${progress === null ? 'w-1/2 animate-pulse' : ''}`}
            style={progress !== null ? { width: `${progress}%` } : undefined}
          />
        </div>
      ) : null}

      <div className="bg-black/60 rounded-lg p-4 font-mono text-xs text-zinc-300 h-56 overflow-y-auto border border-zinc-800">
        {visibleLogs.length === 0 ? (
          <div className="text-zinc-500 italic">{emptyMessage}</div>
        ) : null}
        {visibleLogs.map((log, index) => (
          <div
            key={`${log.timestamp ?? 0}-${index}`}
            className={`mb-1 ${log.type === 'error' || log.ok === false ? 'text-red-400' : log.type === 'complete' || log.type === 'run-finish' ? 'text-emerald-400' : ''}`}
          >
            {new Date(log.timestamp || Date.now()).toLocaleTimeString()} - {typeof (log as any).progress === 'number' ? `[${Math.round((log as any).progress)}%] ` : ''}{log.message}
          </div>
        ))}
      </div>

      <div className="flex justify-end mt-3">
        <button
          onClick={clearLogs}
          className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors"
        >
          Limpar eventos
        </button>
      </div>
    </div>
  );
};
