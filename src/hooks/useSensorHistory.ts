import { useI18n } from '../i18n/I18nProvider';
import { useState, useEffect, useRef } from 'react';

export function useSensorHistory(value: number | null | undefined, limit: number = 60) {
  const [history, setHistory] = useState<number[]>([]);
  const historyRef = useRef<number[]>([]);

  useEffect(() => {
    if (value == null || isNaN(value)) return;

    const curr = historyRef.current;
    if (curr.length >= limit) {
      curr.shift();
    }
    curr.push(value);
    setHistory(curr.slice());
  }, [value, limit]);

  return history;
}

