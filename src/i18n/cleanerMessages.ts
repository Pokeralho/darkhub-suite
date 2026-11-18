// The strings live in ./locales/<lang>/cleaner.ts (one file per language, so the app loads only the active one).
// This module keeps the combined shape for tests and tools.
import pt from './locales/pt-BR/cleaner';
import en from './locales/en-US/cleaner';

export const cleanerMessages: Record<'pt-BR' | 'en-US', Record<string, string>> = { 'pt-BR': pt, 'en-US': en };
