import { useI18n } from '../i18n/I18nProvider';
import { useCallback, useEffect, useState } from 'react';

interface ProgressEvent {
  routineId?: string;
  opId?: string;
  runId?: string;
  type: string;
  message?: string;
  timestamp?: number;
  ok?: boolean;
  error?: string;
  progress?: number;
}

interface UseOptimizerProgressOptions {
  routineId?: string;
}

export function useOptimizerProgress(options: UseOptimizerProgressOptions = {}) {
  const [logs, setLogs] = useState<ProgressEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [lastComplete, setLastComplete] = useState<ProgressEvent | null>(null);

  const handleProgress = useCallback((data: ProgressEvent) => {
    const eventId = data.routineId || data.opId || data.runId || '';
    if (options.routineId && eventId !== options.routineId) return;

    const message =
      data.message ||
      data.error ||
      (data.type === 'op-start' ? `Iniciando ${data.opId}` : '') ||
      (data.type === 'op-finish' ? `${data.opId}: ${data.ok === false ? 'falhou' : 'ok'}` : '') ||
      data.type;

    const enrichedData: ProgressEvent = {
      ...data,
      routineId: eventId,
      message,
      timestamp: Date.now()
    };

    setLogs((prev) => [...prev, enrichedData]);

    if (data.type === 'complete' || data.type === 'run-finish' || data.type === 'op-finish' || data.type === 'error') {
      setIsRunning(false);
      setLastComplete(enrichedData);
    } else if (data.type === 'log' || data.type === 'progress' || data.type === 'run-start' || data.type === 'op-start') {
      setIsRunning(true);
    }
  }, [options.routineId]);

  useEffect(() => {
    const unsubscribe = window.darkhub?.optimizer?.onRunEvent?.(handleProgress);
    if (!unsubscribe) {
      console.warn('[useOptimizerProgress] optimizer.onRunEvent nao encontrado no preload');
      return;
    }

    return unsubscribe;
  }, [handleProgress]);

  const clearLogs = useCallback(() => {
    setLogs([]);
    setLastComplete(null);
    setIsRunning(false);
  }, []);

  return {
    logs,
    isRunning,
    lastComplete,
    clearLogs
  };
}
