// The strings live in ./locales/<lang>/decrypt.ts (one file per language, so the app loads only the active one).
// This module keeps the combined shape for tests and tools.
import pt from './locales/pt-BR/decrypt';
import en from './locales/en-US/decrypt';

export const decryptMessages: Record<'pt-BR' | 'en-US', Record<string, string>> = { 'pt-BR': pt, 'en-US': en };
