import { normalizePathname, type SiteLocale } from './seo';

export const DEFAULT_COPY: Record<SiteLocale, { title: string; description: string }> = {
  "ja": {
    "title": "大学の講義動画を、あなたの復習パートナーに | VideoQ",
    "description": "大学生の講義の復習・試験勉強に。講義動画に自分の言葉で質問して、答えと根拠の場面を確認。30秒の操作デモを公開。動画1本から無料で試せます。"
  },
  "en": {
    "title": "Turn lecture videos into your study partner | VideoQ",
    "description": "Review lectures and prepare for exams. Ask your lecture videos a question, read the answer and jump to the source explanation. Watch the 30-second demo and try your first video free."
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
