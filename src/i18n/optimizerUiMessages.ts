// The strings live in ./locales/<lang>/optimizerUi.ts (one file per language, so the app loads only the active one).
// This module keeps the combined shape for tests and tools.
import pt from './locales/pt-BR/optimizerUi';
import en from './locales/en-US/optimizerUi';

export const optimizerUiMessages: Record<'pt-BR' | 'en-US', Record<string, string>> = { 'pt-BR': pt, 'en-US': en };
