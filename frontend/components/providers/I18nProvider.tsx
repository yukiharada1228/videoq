"use client";

import { type ReactNode, Suspense, useEffect, useMemo } from "react";
import { I18nextProvider } from "react-i18next";
import { initI18n } from "@/i18n/config";

interface I18nProviderProps {
  children: ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps) {
  const i18nInstance = useMemo(() => initI18n(), []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const updateDocumentLanguage = (language?: string) => {
      document.documentElement.lang = language ?? "en";
    };

    updateDocumentLanguage(i18nInstance.language);

    const handleLanguageChanged = (lng: string) => {
      updateDocumentLanguage(lng);
    };

    i18nInstance.on("languageChanged", handleLanguageChanged);

    return () => {
      i18nInstance.off("languageChanged", handleLanguageChanged);
    };
  }, [i18nInstance]);

  return (
    <I18nextProvider i18n={i18nInstance}>
      <Suspense fallback={null}>{children}</Suspense>
    </I18nextProvider>
  );
}

