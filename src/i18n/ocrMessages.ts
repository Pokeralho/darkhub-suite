// The strings live in ./locales/<lang>/ocr.ts (one file per language, so the app loads only the active one).
// This module keeps the combined shape for tests and tools.
import pt from './locales/pt-BR/ocr';
import en from './locales/en-US/ocr';

export const ocrMessages: Record<'pt-BR' | 'en-US', Record<string, string>> = { 'pt-BR': pt, 'en-US': en };
