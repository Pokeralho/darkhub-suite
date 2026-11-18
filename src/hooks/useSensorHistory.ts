import { useRef } from 'react';

const UNSET = Symbol('unset');

/**
 * Rolling history of a sensor. `tick` must change on every new sample (pass the metrics snapshot): without it a
 * value that repeats (0 % GPU, same RAM %) was dropped and the "last 60 s" chart was not time based.
 *
 * The history is derived during the same render that receives the new sample (no effect + setState), so a
 * `hardware:update` costs one render instead of one for the metrics plus one per history hook. The append is
 * guarded by the tick identity, so re-renders (StrictMode, unrelated state) never add a sample twice.
 */
export function useSensorHistory(value: number | null | undefined, limit: number = 60, tick?: unknown) {
  const historyRef = useRef<number[]>([]);
  const lastKeyRef = useRef<unknown>(UNSET);

  // Without a tick, fall back to the previous behaviour: a new sample is a changed value.
  const key = tick !== undefined ? tick : value;
  if (key !== lastKeyRef.current) {
    lastKeyRef.current = key;
    if (value != null && !Number.isNaN(value)) {
      const curr = historyRef.current;
      const kept = curr.length >= limit ? curr.slice(curr.length - limit + 1) : curr;
      historyRef.current = [...kept, value];
    }
  }

  return historyRef.current;
}
