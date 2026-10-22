import { useState, useEffect, useRef } from 'react';

/**
 * Rolling history of a sensor. `tick` must change on every new sample (pass the metrics snapshot): without it a
 * value that repeats (0 % GPU, same RAM %) was dropped and the "last 60 s" chart was not time based.
 */
export function useSensorHistory(value: number | null | undefined, limit: number = 60, tick?: unknown) {
  const [history, setHistory] = useState<number[]>([]);
  const historyRef = useRef<number[]>([]);

  useEffect(() => {
    if (value == null || isNaN(value)) return;
    const curr = historyRef.current;
    if (curr.length >= limit) curr.shift();
    curr.push(value);
    setHistory(curr.slice());
  }, [value, limit, tick]);

  return history;
}
