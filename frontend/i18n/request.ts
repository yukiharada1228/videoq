import { getRequestConfig } from "next-intl/server";
import { routing, type Locale } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const isLocale = (value: string | undefined): value is Locale =>
    !!value && routing.locales.includes(value as Locale);

  let locale = await requestLocale;

  if (!isLocale(locale)) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`./locales/${locale}/translation.json`)).default,
  };
});
