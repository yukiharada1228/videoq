import {
  absoluteUrl,
  hreflangEntries,
  isNoindexPath,
  type SiteLocale,
} from '../src/lib/seo';

const DEFAULT_COPY: Record<SiteLocale, { title: string; description: string }> = {
  ja: {
    title: '講義動画の検索・文字起こし | VideoQ',
    description:
      '講義動画・授業録画を文字起こしして検索。YouTubeの講義も登録できます。動画に質問すると、見たいところから再生。反転授業・オンデマンド授業の復習に。',
  },
  en: {
    title: 'Search and transcribe lecture videos | VideoQ',
    description:
      'Search and transcribe lecture videos and class recordings. YouTube lectures work too. Ask the video a question and play from the moment you need. For flipped classroom and on-demand review.',
  },
};

const PAGE_COPY: Record<SiteLocale, Record<string, { title: string; description: string }>> = {
  ja: {
    '/pricing': {
      title: '料金プラン | VideoQ',
      description: 'お試しの Free から、個人向け Basic、ヘビー利用の Pro まで。年払いは 2 ヶ月分お得です。',
    },
    '/docs': {
      title: 'VideoQ Developer Docs | VideoQ',
      description: 'VideoQ API 連携と自動化のための開発者向けリファレンス。',
    },
    '/terms': { title: '利用規約 | VideoQ', description: 'VideoQ の利用規約です。' },
    '/privacy': { title: 'プライバシーポリシー | VideoQ', description: 'VideoQ のプライバシーポリシーです。' },
    '/refund': { title: '返金・キャンセル | VideoQ', description: 'VideoQ の返金およびキャンセル方針です。' },
    '/legal': { title: '特定商取引法に基づく表記 | VideoQ', description: '特定商取引法に基づく表記です。' },
    '/login': { title: 'ログイン | VideoQ', description: DEFAULT_COPY.ja.description },
    '/signup': { title: '新規登録 | VideoQ', description: DEFAULT_COPY.ja.description },
    '/share/yobinori-linearalgebra': {
      title: '【ヨビノリ】線形代数 | VideoQ',
      description:
        'VideoQの公開サンプルです。線形代数の講義動画に質問して、見たいところから再生できます。登録不要。',
    },
    '/share/aicia-deeplearning': {
      title: 'Deep Learning の世界 | VideoQ',
      description:
        'VideoQの公開サンプルです。Deep Learningの講義動画に質問して、見たいところから再生できます。登録不要。',
    },
  },
  en: {
    '/pricing': {
      title: 'Pricing | VideoQ',
      description:
        'Start with a small Free trial, then Basic for everyday use or Pro for heavier workloads. Annual billing saves two months.',
    },
    '/docs': {
      title: 'VideoQ Developer Docs | VideoQ',
      description: 'Developer reference for VideoQ API integration and automation.',
    },
    '/terms': { title: 'Terms of Service | VideoQ', description: 'VideoQ terms of service.' },
    '/privacy': { title: 'Privacy Policy | VideoQ', description: 'VideoQ privacy policy.' },
    '/refund': { title: 'Refunds and cancellation | VideoQ', description: 'VideoQ refund and cancellation policy.' },
    '/legal': {
      title: 'Specified Commercial Transactions Act notice | VideoQ',
      description: 'Notice under the Specified Commercial Transactions Act.',
    },
    '/login': { title: 'Log in | VideoQ', description: DEFAULT_COPY.en.description },
    '/signup': { title: 'Sign up | VideoQ', description: DEFAULT_COPY.en.description },
    '/share/yobinori-linearalgebra': {
      title: '【ヨビノリ】線形代数 | VideoQ',
      description:
        'A public VideoQ sample. Ask this linear algebra lecture a question and play from the part you need. No account required.',
    },
    '/share/aicia-deeplearning': {
      title: 'Deep Learning の世界 | VideoQ',
      description:
        'A public VideoQ sample. Ask this deep learning lecture a question and play from the part you need. No account required.',
    },
  },
};

function splitLocale(pathname: string): { locale: SiteLocale; path: string } {
  if (pathname === '/en' || pathname.startsWith('/en/')) {
    const rest = pathname.slice(3) || '/';
    return { locale: 'en', path: rest.startsWith('/') ? rest : `/${rest}` };
  }
  return { locale: 'ja', path: pathname || '/' };
}

function pageCopy(locale: SiteLocale, path: string): { title: string; description: string } {
  return PAGE_COPY[locale][path] ?? DEFAULT_COPY[locale];
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
  const copy = pageCopy(locale, path);
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
