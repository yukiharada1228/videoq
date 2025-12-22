import { createElement } from 'react';
import { useNavigate, useLocation, useParams, Link as RouterLink, type LinkProps as RouterLinkProps } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect } from 'react';
import { locales, defaultLocale, type Locale } from '@/i18n/config';

const LOCALE_STORAGE_KEY = 'videoq.locale';

export function getLocaleFromPathname(pathname: string): Locale {
  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0];
  if (firstSegment && locales.includes(firstSegment as Locale)) {
    return firstSegment as Locale;
  }
  return defaultLocale;
}

export function getPreferredLocale(): Locale {
  // 1) localStorage preference
  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      if (saved && locales.includes(saved as Locale)) {
        return saved as Locale;
      }
    } catch {
      // ignore
    }

    // 2) browser preference
    const navLang = window.navigator.language;
    const short = navLang?.split('-')[0];
    if (short && locales.includes(short as Locale)) {
      return short as Locale;
    }
  }

  return defaultLocale;
}

export function setPreferredLocale(locale: Locale): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore
  }
}

export function removeLocalePrefix(pathname: string): string {
  const locale = getLocaleFromPathname(pathname);
  if (locale === defaultLocale) return pathname;
  const withoutLocale = pathname.replace(new RegExp(`^/${locale}(/|$)`), '/');
  return withoutLocale || '/';
}

export function addLocalePrefix(pathname: string, locale: Locale): string {
  if (locale === defaultLocale) return pathname;
  const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `/${locale}${cleanPath}`;
}

export function useI18nNavigate() {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  return useCallback((to: string | number, options?: { replace?: boolean }) => {
    if (typeof to === 'number') {
      navigate(to);
      return;
    }
    const locale = i18n.language as Locale;
    const localizedPath = addLocalePrefix(to, locale);
    navigate(localizedPath, options);
  }, [navigate, i18n.language]);
}

export function useI18nLocation() {
  const location = useLocation();
  const pathname = removeLocalePrefix(location.pathname);
  return { ...location, pathname };
}

export function useLocale(): Locale {
  const location = useLocation();
  return getLocaleFromPathname(location.pathname);
}

type AppLinkProps = Omit<RouterLinkProps, 'to'> & {
  /**
   * React Router's `to`.
   */
  to?: RouterLinkProps['to'];
  /**
   * Next.js style alias. Many migrated components/pages use `href`.
   */
  href?: RouterLinkProps['to'];
};

export function Link({ to, href, ...props }: AppLinkProps) {
  const { i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const target = href ?? to ?? '/';
  const localized = typeof target === 'string' ? addLocalePrefix(target, locale) : target;
  return createElement(RouterLink, { to: localized, ...props });
}

export function useLocaleSync() {
  const params = useParams<{ locale?: string }>();
  const { i18n } = useTranslation();
  useEffect(() => {
    const urlLocale = params.locale;
    if (urlLocale && locales.includes(urlLocale as Locale)) {
      const normalized = urlLocale as Locale;
      if (normalized !== i18n.language) {
        i18n.changeLanguage(normalized);
      }
      setPreferredLocale(normalized);
      return;
    }

    const preferred = getPreferredLocale();
    if (preferred !== i18n.language) {
      i18n.changeLanguage(preferred);
    }
  }, [params.locale, i18n]);
}

export const i18nConfig = {
  locales,
  defaultLocale,
};
