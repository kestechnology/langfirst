export interface LanguageOption {
  code: string;
  name: string;
  isDefault?: boolean;
}

export interface SourceLanguageOption {
  code: string;
  name: string;
  nativeName?: string;
  isDefault?: boolean;
  whisperPrompt: string;
}

// Target translated language is strictly English for MVP
export const DEFAULT_TARGET_LANGUAGE: LanguageOption = {
  code: 'en',
  name: 'English',
  isDefault: true,
};

// Planned target expansion
export const FUTURE_TARGET_LANGUAGES: LanguageOption[] = [
  DEFAULT_TARGET_LANGUAGE,
  { code: 'fr', name: 'French' },
  { code: 'es', name: 'Spanish' },
  { code: 'yo', name: 'Yoruba' },
  { code: 'ha', name: 'Hausa' },
  { code: 'ig', name: 'Igbo' },
];

// Primary Default: Edo / Esan (Central Edo)
export const DEFAULT_SOURCE_LANGUAGE: SourceLanguageOption = {
  code: 'edo',
  name: 'Edo / Esan (Central Edo)',
  nativeName: 'Ẹ̀dó / Ẹ̀sán',
  isDefault: true,
  whisperPrompt:
    "Ọb'okhian, vbe oye he? Ọya waigbe, erọlọ, ẹkpafọ kẹina, kọkọ, alẹkhe. How body? No wahala, we dey alright, I dey fine well well, na so.",
};

export const SUPPORTED_SOURCE_LANGUAGES: SourceLanguageOption[] = [
  DEFAULT_SOURCE_LANGUAGE,
  {
    code: 'pcm',
    name: 'Nigerian Pidgin',
    nativeName: 'Naija',
    whisperPrompt:
      'How far, wetin dey happen, how body, no wahala, we dey, abeg, na so, I dey tell you.',
  },
  {
    code: 'yo',
    name: 'Yoruba',
    nativeName: 'Èdè Yorùbá',
    whisperPrompt: 'Bawo ni, se daadaa ni, e kaaro, e kaasan, o dabọ, se alafia ni, e se gan.',
  },
  {
    code: 'ig',
    name: 'Igbo',
    nativeName: 'Asụsụ Igbo',
    whisperPrompt: 'Kedu, daalụ, nnọọ, i meela, kedu ka i mere, ndewo, nnoo nu.',
  },
  {
    code: 'ha',
    name: 'Hausa',
    nativeName: 'Harshen Hausa',
    whisperPrompt: 'Sannu, yaya dai, ina kwana, nagode, lafiya lau, barka da yamma.',
  },
  {
    code: 'fr',
    name: 'French',
    nativeName: 'Français',
    whisperPrompt:
      "Bonjour, comment allez-vous aujourd'hui? Merci beaucoup, s'il vous plaît, au revoir, très bien.",
  },
  {
    code: 'es',
    name: 'Spanish',
    nativeName: 'Español',
    whisperPrompt:
      'Hola, ¿cómo estás? Buenos días, buenas tardes, muchas gracias, por favor, adiós.',
  },
  {
    code: 'de',
    name: 'German',
    nativeName: 'Deutsch',
    whisperPrompt:
      'Guten Tag, wie geht es Ihnen? Vielen Dank, bitte schön, auf Wiedersehen, alles klar.',
  },
  {
    code: 'ar',
    name: 'Arabic',
    nativeName: 'العربية',
    whisperPrompt: 'مرحبا، كيف حالك؟ شكرا جزيلا، مع السلامة، أهلا وسهلا، تمام.',
  },
  {
    code: 'pt',
    name: 'Portuguese',
    nativeName: 'Português',
    whisperPrompt: 'Olá, como vai você? Muito obrigado, por favor, até logo, bom dia.',
  },
  {
    code: 'zh',
    name: 'Mandarin Chinese',
    nativeName: '中文',
    whisperPrompt: '你好，最近怎么样？谢谢，不客气，再见，早上好。',
  },
  {
    code: 'auto',
    name: 'Auto-Detect (Any Language)',
    nativeName: 'Universal',
    whisperPrompt:
      'Multilingual speech recognition. English, French, Spanish, Yoruba, Edo, Igbo, Hausa, Pidgin, German, Mandarin, Arabic.',
  },
];

export function getSourceLanguageByCode(code: string): SourceLanguageOption {
  const match = SUPPORTED_SOURCE_LANGUAGES.find(
    (l) => l.code.toLowerCase() === (code || '').toLowerCase()
  );
  return match || DEFAULT_SOURCE_LANGUAGE;
}
