// The strings live in ./locales/<lang>/psTools.ts (one file per language, so the app loads only the active one).
// This module keeps the combined shape for tests and tools.
import ptLazy from './locales/pt-BR/psTools';
import ptEager from './locales/pt-BR/psToolsEager';
import enLazy from './locales/en-US/psTools';
import enEager from './locales/en-US/psToolsEager';

export const psToolsMessages: Record<'pt-BR' | 'en-US', Record<string, string>> = { 'pt-BR': { ...ptEager, ...ptLazy }, 'en-US': { ...enEager, ...enLazy } };
