import { normalizePathname, type SiteLocale } from './seo';

export const DEFAULT_COPY: Record<SiteLocale, { title: string; description: string }> = {
  "ja": {
    "title": "受講生の質問に、あなたの講義が答える | VideoQ",
    "description": "動画講座の運営者・講師の方へ。講義動画をアップするだけで、受講生専用のAI質問窓口に。回答には講義の該当場面が付き、受講生はリンクを開くだけで質問できます。講義1本から無料で試せます。"
  },
  "en": {
    "title": "Let your lectures answer student questions | VideoQ",
    "description": "For course creators and instructors. Upload your lecture videos and get an AI help desk for your students. Every answer links to the source moment, and students just open a link to ask. Try it free with one lecture."
  }
};

const PAGE_COPY: Record<SiteLocale, Record<string, { title: string; description: string }>> = {
  ja: {
    '/pricing': {
      title: '料金プラン | VideoQ',
      description: '講義1本で試せる Free から、講座を運営する Basic、複数の講座や研修をまとめて扱う Pro まで。年払いは 2 ヶ月分お得です。',
    },
    '/terms': { title: '利用規約 | VideoQ', description: 'VideoQ の利用規約です。' },
    '/privacy': { title: 'プライバシーポリシー | VideoQ', description: 'VideoQ のプライバシーポリシーです。' },
    '/refund': { title: '返金・キャンセル | VideoQ', description: 'VideoQ の返金およびキャンセル方針です。' },
    '/legal': { title: '特定商取引法に基づく表記 | VideoQ', description: '特定商取引法に基づく表記です。' },
    '/login': { title: 'ログイン | VideoQ', description: DEFAULT_COPY.ja.description },
    '/signup': { title: '新規登録 | VideoQ', description: DEFAULT_COPY.ja.description },
  },
  en: {
    '/pricing': {
      title: 'Pricing | VideoQ',
      description:
        'Try Free with one lecture, run a course with Basic, or manage multiple courses and training programs with Pro. Annual billing saves two months.',
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
  },
};

export function resolveFirstByteCopy(
  locale: SiteLocale,
  path: string,
): { title: string; description: string } {
  path = normalizePathname(path);
  const exact = PAGE_COPY[locale][path];
  if (exact) return exact;

  return DEFAULT_COPY[locale];
}
