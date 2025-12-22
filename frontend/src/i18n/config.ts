import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enTranslation from './locales/en/translation.json';
import jaTranslation from './locales/ja/translation.json';

export const defaultLocale = 'en';
export const locales = ['en', 'ja'] as const;
export type Locale = typeof locales[number];

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: enTranslation },
    ja: { translation: jaTranslation },
  },
  lng: defaultLocale,
  fallbackLng: defaultLocale,
  interpolation: { escapeValue: false },
});

export default i18n;
