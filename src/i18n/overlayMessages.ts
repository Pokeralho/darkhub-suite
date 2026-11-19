// The strings live in ./locales/<lang>/overlay.ts (one file per language, so the app loads only the active one).
// This module keeps the combined shape for tests and tools.
import pt from './locales/pt-BR/overlay';
import en from './locales/en-US/overlay';

export const overlayMessages: Record<'pt-BR' | 'en-US', Record<string, string>> = { 'pt-BR': pt, 'en-US': en };
