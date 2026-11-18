// The strings live in ./locales/<lang>/ssh.ts (one file per language, so the app loads only the active one).
// This module keeps the combined shape for tests and tools.
import ptLazy from './locales/pt-BR/ssh';
import ptEager from './locales/pt-BR/sshEager';
import enLazy from './locales/en-US/ssh';
import enEager from './locales/en-US/sshEager';

export const sshMessages: Record<'pt-BR' | 'en-US', Record<string, string>> = { 'pt-BR': { ...ptEager, ...ptLazy }, 'en-US': { ...enEager, ...enLazy } };
