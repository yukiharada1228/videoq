import i18n, { type Resource } from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en/translation.json";
import ja from "./locales/ja/translation.json";

export const languages = ["en", "ja"] as const;

export type AppLanguage = (typeof languages)[number];

export const defaultNS = "translation";

const resources: Resource = {
  en: { translation: en },
  ja: { translation: ja },
};

const detectionOptions = {
  order: ["querystring", "cookie", "localStorage", "navigator"],
  caches: ["localStorage", "cookie"],
  cookieMinutes: 60 * 24 * 365,
};

export const initI18n = () => {
  if (!i18n.isInitialized) {
    if (typeof window !== "undefined") {
      i18n.use(LanguageDetector);
    }

    i18n.use(initReactI18next).init({
      resources,
      fallbackLng: "en",
      supportedLngs: languages,
      defaultNS,
      interpolation: {
        escapeValue: false,
      },
      detection: detectionOptions,
      react: {
        useSuspense: true,
      },
    });
  }

  return i18n;
};

export default initI18n;

