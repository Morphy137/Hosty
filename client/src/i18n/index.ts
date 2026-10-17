import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import es from './locales/es.json';
import { loadPreferences } from '../settings/storage';

/** Languages bundled with the app. Others are loaded at runtime from the daemon's locales folder. */
export const BUILTIN_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' }
] as const;
export type SupportedLanguage = string;

function detectInitialLanguage(): SupportedLanguage {
  if (typeof window === 'undefined') return 'en';

  // A saved community language may not be loaded yet; useLocales fetches it once the daemon is up.
  const saved = loadPreferences().general.language;
  if (saved) return saved;

  const browserLang = navigator.language?.toLowerCase() ?? 'en';
  return browserLang.startsWith('es') ? 'es' : 'en';
}

/** Adds a runtime translation pack (partial packs fall back to English key by key). */
export function registerLocalePack(code: string, resources: Record<string, unknown>): void {
  i18n.addResourceBundle(code, 'translation', resources, true, true);
}

/** Switches the UI language; the caller stores the choice in the preferences. */
export function changeLanguage(lang: SupportedLanguage): void {
  void i18n.changeLanguage(lang);
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
