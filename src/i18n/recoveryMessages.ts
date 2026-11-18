// The strings live in ./locales/<lang>/recovery.ts (one file per language, so the app loads only the active one).
// This module keeps the combined shape for tests and tools.
import ptLazy from './locales/pt-BR/recovery';
import ptEager from './locales/pt-BR/recoveryEager';
import enLazy from './locales/en-US/recovery';
import enEager from './locales/en-US/recoveryEager';

export const recoveryMessages: Record<'pt-BR' | 'en-US', Record<string, string>> = { 'pt-BR': { ...ptEager, ...ptLazy }, 'en-US': { ...enEager, ...enLazy } };
