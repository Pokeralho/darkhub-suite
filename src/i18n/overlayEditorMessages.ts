// The strings live in ./locales/<lang>/overlayEditor.ts (one file per language, so the app loads only the active one).
// This module keeps the combined shape for tests and tools.
import pt from './locales/pt-BR/overlayEditor';
import en from './locales/en-US/overlayEditor';

export const overlayEditorMessages: Record<'pt-BR' | 'en-US', Record<string, string>> = { 'pt-BR': pt, 'en-US': en };
