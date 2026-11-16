// Types for gpuMatch.js (plain JS, also imported by the renderer to pick the GPU the System Monitor shows).
export declare function gpuKey(s: unknown): string;
export declare function sameGpu(a: unknown, b: unknown): boolean;
export declare function pairGpus(a?: unknown[], b?: unknown[]): number[];
export declare function primaryGpuIndex(gpus: unknown, opts?: { preferName?: string | null }): number;
export declare function pickPrimaryGpu<T = any>(gpus: T[] | null | undefined, opts?: { preferName?: string | null }): T | null;
