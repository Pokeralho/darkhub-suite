// The strings live in ./locales/<lang>/optiscalerUi.ts (one file per language, so the app loads only the active one).
// This module keeps the combined shape for tests and tools.
import pt from './locales/pt-BR/optiscalerUi';
import en from './locales/en-US/optiscalerUi';

export const optiscalerUiMessages: Record<'pt-BR' | 'en-US', Record<string, string>> = { 'pt-BR': pt, 'en-US': en };
