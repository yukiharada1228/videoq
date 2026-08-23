import { resolveFirstByteCopy } from '../src/lib/pageCopy';
import {
  absoluteUrl,
  hreflangEntries,
  isNoindexPath,
} from '../src/lib/seo';

function splitLocale(pathname: string): { locale: 'en' | 'ja'; path: string } {
  if (pathname === '/en' || pathname.startsWith('/en/')) {
    const rest = pathname.slice(3) || '/';
    return { locale: 'en', path: rest.startsWith('/') ? rest : `/${rest}` };
  }
  return { locale: 'ja', path: pathname || '/' };
}

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  const { pathname, search } = url;

  if (pathname === '/ja' || pathname === '/ja/' || pathname.startsWith('/ja/')) {
    const rest = pathname === '/ja' || pathname === '/ja/' ? '/' : pathname.slice(3);
    const dest = rest.startsWith('/') ? rest : `/${rest}`;
    return Response.redirect(new URL(dest + search, url.origin).href, 301);
  }

  const response = await context.next();
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) {
    return response;
  }

  const { locale, path } = splitLocale(pathname);
  const copy = resolveFirstByteCopy(locale, path);
  const robots = isNoindexPath(path) ? 'noindex, nofollow' : 'index, follow';
  const canonical = absoluteUrl(path, locale);
  const alternates = hreflangEntries(path);

  return new HTMLRewriter()
    .on('html', {
      element(el) {
        el.setAttribute('lang', locale);
      },
    })
    .on('title', {
      element(el) {
        el.setInnerContent(copy.title);
      },
    })
    .on('meta[name="description"]', {
      element(el) {
        el.setAttribute('content', copy.description);
      },
    })
    .on('meta[name="robots"]', {
      element(el) {
        el.setAttribute('content', robots);
      },
    })
    .on('meta[property="og:title"]', {
      element(el) {
        el.setAttribute('content', copy.title);
      },
    })
    .on('meta[property="og:description"]', {
      element(el) {
        el.setAttribute('content', copy.description);
      },
    })
    .on('meta[property="og:locale"]', {
      element(el) {
        el.setAttribute('content', locale === 'ja' ? 'ja_JP' : 'en_US');
      },
    })
    .on('meta[property="og:url"]', {
      element(el) {
        el.setAttribute('content', canonical);
      },
    })
    .on('link[rel="canonical"]', {
      element(el) {
        el.setAttribute('href', canonical);
      },
    })
    .on('link[rel="alternate"][hreflang]', {
      element(el) {
        const lang = el.getAttribute('hreflang');
        const match = alternates.find((entry) => entry.lang === lang);
        if (match) el.setAttribute('href', match.href);
      },
    })
    .transform(response);
};
