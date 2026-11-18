// Language list, kept apart from the dictionaries so the shell can import it without loading any strings.
export type SupportedLang = 'pt-BR' | 'en-US' | 'es-ES' | 'de-DE' | 'fr-FR' | 'it-IT' | 'ru-RU' | 'zh-CN' | 'ja-JP';

export interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

export const availableLanguages: LanguageOption[] = [
  { code: 'pt-BR', name: 'Portuguese (Brazil)', nativeName: 'Português (Brasil)', flag: '🇧🇷' },
  { code: 'en-US', name: 'English (US)', nativeName: 'English (US)', flag: '🇺🇸' },
  { code: 'es-ES', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'de-DE', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr-FR', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'it-IT', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
  { code: 'ru-RU', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
  { code: 'zh-CN', name: 'Chinese (Simplified)', nativeName: '简体中文', flag: '🇨🇳' },
  { code: 'ja-JP', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' }
];

/** Languages that ship a built-in dictionary (src/i18n/locales/<code>/). */
export const shippedLanguages: readonly string[] = ['pt-BR', 'en-US'];
