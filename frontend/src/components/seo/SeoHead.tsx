import { Helmet } from 'react-helmet-async';
import { defaultLocale, locales, type Locale } from '@/i18n/config';
import { useLocale } from '@/lib/i18n';

const BASE_URL = 'https://videoq.jp';

function normalizePath(path: string): string {
  if (!path) {
    return '/';
  }
  return path.startsWith('/') ? path : `/${path}`;
}

function buildAbsoluteUrl(path: string, locale: Locale): string {
  const normalizedPath = normalizePath(path);
  const localizedPath = locale === defaultLocale ? normalizedPath : `/${locale}${normalizedPath}`;
  return `${BASE_URL}${localizedPath === '/' ? '/' : localizedPath}`;
}

type SeoHeadProps = {
  title: string;
  description: string;
  path: string;
};

export function SeoHead({ title, description, path }: SeoHeadProps) {
  const locale = useLocale();
  const canonicalUrl = buildAbsoluteUrl(path, locale);
  const alternateUrls = Object.fromEntries(
    locales.map((candidateLocale) => [candidateLocale, buildAbsoluteUrl(path, candidateLocale)]),
  ) as Record<Locale, string>;

  return (
    <Helmet prioritizeSeoTags>
      <html lang={locale} />
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonicalUrl} />
      {locales.map((candidateLocale) => (
        <link
          key={candidateLocale}
          rel="alternate"
          hrefLang={candidateLocale}
          href={alternateUrls[candidateLocale]}
        />
      ))}
      <link rel="alternate" hrefLang="x-default" href={alternateUrls[defaultLocale]} />
      <meta property="og:type" content="website" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonicalUrl} />
    </Helmet>
  );
}
