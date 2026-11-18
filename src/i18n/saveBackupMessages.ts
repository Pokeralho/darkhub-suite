// The strings live in ./locales/<lang>/saveBackup.ts (one file per language, so the app loads only the active one).
// This module keeps the combined shape for tests and tools.
import pt from './locales/pt-BR/saveBackup';
import en from './locales/en-US/saveBackup';

export const saveBackupMessages: Record<'pt-BR' | 'en-US', Record<string, string>> = { 'pt-BR': pt, 'en-US': en };
