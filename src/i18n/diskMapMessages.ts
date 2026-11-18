// The strings live in ./locales/<lang>/diskMap.ts (one file per language, so the app loads only the active one).
// This module keeps the combined shape for tests and tools.
import pt from './locales/pt-BR/diskMap';
import en from './locales/en-US/diskMap';

export const diskMapMessages: Record<'pt-BR' | 'en-US', Record<string, string>> = { 'pt-BR': pt, 'en-US': en };
