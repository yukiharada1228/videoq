import { normalizePathname, type SiteLocale } from './seo';

export const DEFAULT_COPY: Record<SiteLocale, { title: string; description: string }> = {
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
  },
};

const DOCS_SECTION_COPY: Record<SiteLocale, Record<string, { title: string; description: string }>> = {
  ja: {
    auth: {
      title: '認証とアカウント | VideoQ',
      description: 'API キーの発行方法と、アカウント情報・外部サービスキーの管理。',
    },
    videos: {
      title: 'Videos API | VideoQ',
      description: '動画のアップロードと YouTube 登録、処理状況の確認。',
    },
    groups: {
      title: 'Groups / Membership API | VideoQ',
      description: '動画グループの作成、所属動画の管理、共有リンクの発行。',
    },
    tags: {
      title: 'Tags API | VideoQ',
      description: 'タグの作成と、動画へのタグ付け。',
    },
    chat: {
      title: 'Chat API | VideoQ',
      description: 'RAG チャットの実行と、履歴・分析データの取得。',
    },
    openai: {
      title: 'OpenAI 互換 API | VideoQ',
      description: 'OpenAI SDK をそのまま使って VideoQ の RAG チャットにアクセス。',
    },
    plog: {
      title: 'Plog API | VideoQ',
      description: '動画から生成した概念グラフ（Plog）の取得と編集。',
    },
    evaluation: {
      title: 'Evaluation API | VideoQ',
      description: 'グループ単位の回答評価ログとサマリー。',
    },
    admin: {
      title: 'Admin API | VideoQ',
      description: 'スーパーユーザー限定のユーザー管理と再インデックス。',
    },
  },
  en: {
    auth: {
      title: 'Authentication and account | VideoQ',
      description: 'How to issue API keys, and how to manage account and third-party keys.',
    },
    videos: {
      title: 'Videos API | VideoQ',
      description: 'Upload videos, register YouTube URLs, and track processing status.',
    },
    groups: {
      title: 'Groups / Membership API | VideoQ',
      description: 'Create video groups, manage their members, and issue share links.',
    },
    tags: {
      title: 'Tags API | VideoQ',
      description: 'Create tags and attach them to videos.',
    },
    chat: {
      title: 'Chat API | VideoQ',
      description: 'Run RAG chat and pull history and analytics.',
    },
    openai: {
      title: 'OpenAI-Compatible API | VideoQ',
      description: 'Access VideoQ RAG chat using the OpenAI SDK with no code changes.',
    },
    plog: {
      title: 'Plog API | VideoQ',
      description: 'Read and edit the concept graph (Plog) generated from a video.',
    },
    evaluation: {
      title: 'Evaluation API | VideoQ',
      description: 'Per-group answer evaluation logs and summaries.',
    },
    admin: {
      title: 'Admin API | VideoQ',
      description: 'Superuser-only user management and reindexing.',
    },
  },
};

export function resolveFirstByteCopy(
  locale: SiteLocale,
  path: string,
): { title: string; description: string } {
  path = normalizePathname(path);
  const exact = PAGE_COPY[locale][path];
  if (exact) return exact;

  const docsMatch = path.match(/^\/docs\/([^/]+)$/);
  if (docsMatch) {
    return DOCS_SECTION_COPY[locale][docsMatch[1]] ?? PAGE_COPY[locale]['/docs'];
  }

  return DEFAULT_COPY[locale];
}
