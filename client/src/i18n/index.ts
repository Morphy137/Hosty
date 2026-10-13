import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import es from './locales/es.json';

export const SUPPORTED_LANGUAGES = ['en', 'es'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const STORAGE_KEY = 'mc_nexus_lang';

function detectInitialLanguage(): SupportedLanguage {
  if (typeof window === 'undefined') return 'en';

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && (SUPPORTED_LANGUAGES as readonly string[]).includes(saved)) {
    return saved as SupportedLanguage;
  }

  const browserLang = navigator.language?.toLowerCase() ?? 'en';
  return browserLang.startsWith('es') ? 'es' : 'en';
}

export function changeLanguage(lang: SupportedLanguage): void {
  i18n.changeLanguage(lang);
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, lang);
  }
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es }
    },
    lng: detectInitialLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
