export const SITE_ORIGIN = 'https://videoq.jp';

export const PUBLIC_INDEX_PATHS = [
  '/',
  '/pricing',
  '/docs',
  '/docs/auth',
  '/docs/videos',
  '/docs/groups',
  '/docs/tags',
  '/docs/chat',
  '/docs/openai',
  '/docs/plog',
  '/docs/evaluation',
  '/docs/admin',
  '/terms',
  '/privacy',
  '/refund',
  '/legal',
] as const;

const NOINDEX_PREFIXES = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/change-email',
  '/consent',
  '/device',
  '/videos',
  '/settings',
  '/admin',
  '/share',
  '/group-invitations',
] as const;

export type SiteLocale = 'en' | 'ja';

export function sharePathSlug(pathname: string): string | null {
  const match = pathname.match(/^\/share\/([^/]+)\/?$/);
  return match?.[1] ?? null;
}

export function isNoindexPath(pathname: string): boolean {
  return NOINDEX_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function localizedPath(pathname: string, locale: SiteLocale): string {
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (locale === 'ja') return normalized;
  return normalized === '/' ? '/en/' : `/en${normalized}`;
}

export function absoluteUrl(pathname: string, locale: SiteLocale): string {
  const path = localizedPath(pathname, locale);
  if (path === '/') return `${SITE_ORIGIN}/`;
  return `${SITE_ORIGIN}${path}`;
}

export function hreflangEntries(pathname: string): { lang: string; href: string }[] {
  return [
    { lang: 'ja', href: absoluteUrl(pathname, 'ja') },
    { lang: 'en', href: absoluteUrl(pathname, 'en') },
    { lang: 'x-default', href: absoluteUrl(pathname, 'ja') },
  ];
}

export function pageMetaKey(pathname: string): string {
  if (pathname === '/') return 'site';
  if (pathname === '/pricing') return 'pricing';
  if (pathname === '/docs') return 'docs';
  if (pathname.startsWith('/docs/')) return `docs:${pathname.slice('/docs/'.length)}`;
  if (pathname === '/terms') return 'legal.terms';
  if (pathname === '/privacy') return 'legal.privacy';
  if (pathname === '/refund') return 'legal.refund';
  if (pathname === '/legal') return 'legal.scta';
  if (pathname === '/login') return 'auth.login';
  if (pathname === '/signup') return 'auth.signup';
  const shareSlug = sharePathSlug(pathname);
  if (shareSlug) return `share:${shareSlug}`;
  return 'site';
}
