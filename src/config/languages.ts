export interface LanguageOption {
  code: string;
  name: string;
  isDefault?: boolean;
}

// Target translated language is strictly English
export const DEFAULT_TARGET_LANGUAGE: LanguageOption = {
  code: 'en',
  name: 'English',
  isDefault: true,
};

// Planned choices for future target expansion
export const FUTURE_TARGET_LANGUAGES: LanguageOption[] = [
  DEFAULT_TARGET_LANGUAGE,
  { code: 'fr', name: 'French' },
  { code: 'es', name: 'Spanish' },
  { code: 'yo', name: 'Yoruba' },
  { code: 'ha', name: 'Hausa' },
  { code: 'ig', name: 'Igbo' },
];

// Source language mode: Universal auto-detection for all world languages
export const SOURCE_LANGUAGE_FOCUS = {
  name: 'Auto-Detect (Any Language)',
  codeMixing: 'Multilingual Code-Mixing',
};
