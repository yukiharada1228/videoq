import { normalizePathname, type SiteLocale } from './seo';

export const DEFAULT_COPY: Record<SiteLocale, { title: string; description: string }> = {
  "ja": {
    "title": "講義・研修動画を、質問に答える窓口へ | VideoQ",
    "description": "大学の先生・講師・社内研修担当者向け。動画を講座にまとめて共有すると、受講者が質問でき、AIが動画をもとに根拠の時間付きで回答します。質問履歴も確認できます。無料プラン・カード不要。"
  },
  "en": {
    "title": "Turn teaching and training videos into a place for answers | VideoQ",
    "description": "For educators and training teams. Share a course built from your videos so learners can ask questions and get AI answers with source timestamps. Review their questions. Free plan, no credit card required."
  }
};

const PAGE_COPY: Record<SiteLocale, Record<string, { title: string; description: string }>> = {
  ja: {
    '/pricing': {
      title: '料金プラン | VideoQ',
      description: 'お試しの Free から、個人向け Basic、ヘビー利用の Pro まで。年払いは 2 ヶ月分お得です。',
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
        'Start with a small Free trial, then Basic for everyday use or Pro for heavier workloads. Annual billing saves two months.',
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
