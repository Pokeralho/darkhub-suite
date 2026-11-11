// Types for wallCalibration.js (plain JS, also imported by the renderer for the sampling window and the reading input).
export declare const CAL_WINDOW_MS: number;
export declare const CAL_MAX_SPREAD: number;
export declare const CAL_MIN_SAMPLES: number;
export declare const CAL_MIN_DELTA_W: number;
export declare const EFF_MIN: number;
export declare const EFF_MAX: number;
export declare const MAX_EFF_SIGMA: number;
export declare const MAX_EXTRA_SIGMA: number;
export declare const EXTRA_MAX: number;
export declare function readingSigma(w: number): number;
export type ReadingInput = { mode?: 'w'; watts: number | string | null } | { mode: 'vapf'; volts: number | string | null; amps: number | string | null; pf: number | string | null };
export declare function readingWatts(input: ReadingInput): { ok: true; watts: number } | { ok: false; error: 'bad_watts' | 'bad_volts' | 'bad_amps' | 'bad_pf' };
export interface WindowStats { n: number; mean: number | null; min: number | null; max: number | null; std: number | null; spread: number | null; coverage: number; stable: boolean; reason: 'few_samples' | 'short' | 'unstable' | null }
export declare function windowStats(samples: { t: number; w: number | null }[], nowMs: number, windowMs?: number): WindowStats;
export declare function checkPoint(p: { measW: number; wallW: number; spread?: number; std?: number }): string | null;
export declare function solveCalibration(args: { points: { measW: number; wallW: number; std?: number; spread?: number }[]; psuWatts: number; efficiency: (loadFraction: number) => number }): {
  ok: boolean; error?: string; extraW?: number; effScale?: number; effAt?: number[]; sigma?: { extraW: number; effPct: number }; points?: { measW: number; wallW: number }[];
};
export declare function calHardwareId(args: { gpuName?: string | null; cpuName?: string | null; settings?: Record<string, unknown> }): string | null;
export declare function normalizeCalibration(c: unknown): unknown;
export declare function calibrationState(cal: unknown, currentHwId: string | null): 'none' | 'applied' | 'mismatch' | 'unverified';
