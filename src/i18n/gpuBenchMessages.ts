// The strings live in ./locales/<lang>/gpuBench.ts (one file per language, so the app loads only the active one).
// This module keeps the combined shape for tests and tools.
import pt from './locales/pt-BR/gpuBench';
import en from './locales/en-US/gpuBench';

export const gpuBenchMessages: Record<'pt-BR' | 'en-US', Record<string, string>> = { 'pt-BR': pt, 'en-US': en };
