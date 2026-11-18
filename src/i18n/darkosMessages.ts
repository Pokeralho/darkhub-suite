// The strings live in ./locales/<lang>/darkos.ts (one file per language, so the app loads only the active one).
// This module keeps the combined shape for tests and tools.
import pt from './locales/pt-BR/darkos';
import en from './locales/en-US/darkos';

export const darkosMessages: Record<'pt-BR' | 'en-US', Record<string, string>> = { 'pt-BR': pt, 'en-US': en };
