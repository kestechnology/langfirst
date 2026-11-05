export interface LanguageOption {
  code: string;
  name: string;
  isDefault?: boolean;
}

// For MVP: Target translated language is strictly English.
export const DEFAULT_TARGET_LANGUAGE: LanguageOption = {
  code: 'en',
  name: 'English',
  isDefault: true,
};

// Planned choices for future expansion
export const FUTURE_TARGET_LANGUAGES: LanguageOption[] = [
  DEFAULT_TARGET_LANGUAGE,
  { code: 'fr', name: 'French' },
  { code: 'es', name: 'Spanish' },
  { code: 'yo', name: 'Yoruba' },
  { code: 'ha', name: 'Hausa' },
  { code: 'ig', name: 'Igbo' },
];

// Primary supported source language focus for MVP
export const SOURCE_LANGUAGE_FOCUS = {
  name: 'Esan (Central Edo)',
  codeMixing: 'Nigerian English',
};

