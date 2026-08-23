import { createElement } from 'react';
import { useNavigate, useLocation, useParams, Link as RouterLink, type LinkProps as RouterLinkProps } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect } from 'react';
import { locales, defaultLocale, type Locale } from '@/i18n/config';
import {
  absoluteUrl,
  hreflangEntries,
  isNoindexPath,
  pageMetaKey,
  type SiteLocale,
} from '@/lib/seo';
import { LANDING_PUBLIC_SAMPLES } from '@/lib/landingSamples';

const LOCALE_STORAGE_KEY = 'videoq.locale';

export function getLocaleFromPathname(pathname: string): Locale {
  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0];
  if (firstSegment && locales.includes(firstSegment as Locale)) {
    return firstSegment as Locale;
  }
  return defaultLocale;
}

export function getSavedLocale(): Locale | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved && locales.includes(saved as Locale)) {
      return saved as Locale;
    }
  } catch {
    // ignore
  }
  return null;
}

export function getPreferredLocale(): Locale {
  const saved = getSavedLocale();
  if (saved) return saved;

  if (typeof window !== 'undefined') {
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

const OG_LOCALE_MAP: Record<Locale, string> = {
  en: 'en_US',
  ja: 'ja_JP',
};

function setMeta(selector: string, attribute: string, value: string) {
  const el = document.querySelector(selector);
  if (el) el.setAttribute(attribute, value);
}

function upsertLink(rel: string, href: string, hreflang?: string) {
  const selector = hreflang
    ? `link[rel="${rel}"][hreflang="${hreflang}"]`
    : `link[rel="${rel}"]:not([hreflang])`;
  let el = document.querySelector(selector);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    if (hreflang) el.setAttribute('hreflang', hreflang);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function resolvePageCopy(
  pathname: string,
  t: ReturnType<ReturnType<typeof useTranslation>['i18n']['getFixedT']>,
): { title: string; description: string } {
  const key = pageMetaKey(pathname);
  if (key === 'pricing') {
    return { title: `${t('pricing.title')} | VideoQ`, description: t('pricing.subtitle') };
  }
  if (key === 'docs') {
    return { title: `${t('docs.home.title')} | VideoQ`, description: t('docs.home.subtitle') };
  }
  if (key.startsWith('docs:')) {
    const section = key.slice('docs:'.length);
    return {
      title: `${t(`docs.sections.${section}.title`)} | VideoQ`,
      description: t(`docs.sections.${section}.description`),
    };
  }
  if (key === 'legal.terms') {
    return { title: `${t('legal.terms.title')} | VideoQ`, description: t('legal.terms.title') };
  }
  if (key === 'legal.privacy') {
    return { title: `${t('legal.privacy.title')} | VideoQ`, description: t('legal.privacy.title') };
  }
  if (key === 'legal.refund') {
    return { title: `${t('legal.refund.title')} | VideoQ`, description: t('legal.refund.title') };
  }
  if (key === 'legal.scta') {
    return { title: `${t('legal.scta.title')} | VideoQ`, description: t('legal.scta.title') };
  }
  if (key === 'auth.login') {
    return { title: `${t('auth.login.title')} | VideoQ`, description: t('site.description') };
  }
  if (key === 'auth.signup') {
    return { title: `${t('auth.signup.title')} | VideoQ`, description: t('site.description') };
  }
  if (key.startsWith('share:')) {
    const slug = key.slice('share:'.length);
    const sample = LANDING_PUBLIC_SAMPLES.find((item) => item.slug === slug);
    if (sample) {
      return {
        title: `${t(`landing.publicSamples.${sample.key}.title`)} | VideoQ`,
        description: t(`landing.shareMeta.${sample.key}`),
      };
    }
  }
  return { title: t('site.title'), description: t('site.description') };
}

function applyDocumentMeta(
  locale: Locale,
  pathname: string,
  i18n: ReturnType<typeof useTranslation>['i18n'],
) {
  document.documentElement.lang = locale;
  const t = i18n.getFixedT(locale);
  const { title, description } = resolvePageCopy(pathname, t);
  const ogLocale = OG_LOCALE_MAP[locale];
  const canonical = absoluteUrl(pathname, locale as SiteLocale);
  const robots = isNoindexPath(pathname) ? 'noindex, nofollow' : 'index, follow';

  document.title = title;
  setMeta('meta[name="description"]', 'content', description);
  setMeta('meta[name="robots"]', 'content', robots);
  setMeta('meta[property="og:title"]', 'content', title);
  setMeta('meta[property="og:description"]', 'content', description);
  setMeta('meta[property="og:locale"]', 'content', ogLocale);
  setMeta('meta[property="og:url"]', 'content', canonical);
  upsertLink('canonical', canonical);
  for (const entry of hreflangEntries(pathname)) {
    upsertLink('alternate', entry.href, entry.lang);
  }
}

export function useLocaleSync() {
  const params = useParams<{ locale?: string }>();
  const location = useLocation();
  const { i18n } = useTranslation();
  useEffect(() => {
    const pathname = removeLocalePrefix(location.pathname);
    const urlLocale = params.locale;
    if (urlLocale && locales.includes(urlLocale as Locale)) {
      const normalized = urlLocale as Locale;
      if (normalized !== i18n.language) {
        i18n.changeLanguage(normalized);
      }
      setPreferredLocale(normalized);
      applyDocumentMeta(normalized, pathname, i18n);
      return;
    }

    // Unprefixed URL is the default locale. Do not follow browser language —
    // Googlebot is typically English and would otherwise rewrite `/` to en.
    if (defaultLocale !== i18n.language) {
      i18n.changeLanguage(defaultLocale);
    }
    applyDocumentMeta(defaultLocale, pathname, i18n);
  }, [params.locale, location.pathname, i18n]);
}

export const i18nConfig = {
  locales,
  defaultLocale,
};
