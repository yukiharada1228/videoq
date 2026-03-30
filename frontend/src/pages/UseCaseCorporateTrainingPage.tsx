import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  ShieldCheck,
  BookMarked,
  Users,
  Code2,
  Bot,
  ArrowRight,
  CheckCircle,
} from 'lucide-react';
import { AppPageShell } from '@/components/layout/AppPageShell';
import { Link, useLocale } from '@/lib/i18n';

const BASE_URL = 'https://videoq.jp';
const EN_URL = `${BASE_URL}/use-cases/corporate-training`;
const JA_URL = `${BASE_URL}/ja/use-cases/corporate-training`;

const CONTAINER = 'max-w-screen-xl mx-auto px-6 lg:px-8';

const FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: '料金はどのくらいかかりますか？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'VideoQ は無料プランからご利用いただけます。チームの規模や利用量に応じたプランをご用意しています。',
      },
    },
    {
      '@type': 'Question',
      name: 'セキュリティは大丈夫ですか？社内の機密動画をアップロードしても安全ですか？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'VideoQ はアクセス制御機能を備えており、共有リンクの発行範囲を制限できます。社内の機密情報を安全に管理できます。',
      },
    },
    {
      '@type': 'Question',
      name: '既存の LMS や社内システムと連携できますか？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'OpenAI 互換 API を提供しており、既存の LMS・Slack bot・社内システムと簡単に統合できます。MCP サーバーにも対応しています。',
      },
    },
  ],
};

export default function UseCaseCorporateTrainingPage() {
  const { t } = useTranslation();
  const locale = useLocale();
  const currentUrl = locale === 'ja' ? JA_URL : EN_URL;

  useEffect(() => {
    // title
    const prevTitle = document.title;
    document.title = '社内研修動画をAI検索 | VideoQ 企業研修向け';

    // meta description
    const metaDesc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const prevDesc = metaDesc?.getAttribute('content') ?? '';
    metaDesc?.setAttribute(
      'content',
      'VideoQ は企業研修向け AI 動画プラットフォームです。社内研修動画を Whisper で文字起こしし、社員が AI チャットで必要な場面を即検索。新入社員研修・コンプライアンス・業務マニュアルに対応。',
    );

    // canonical
    const canonicalEl = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const prevCanonical = canonicalEl?.getAttribute('href') ?? '';
    canonicalEl?.setAttribute('href', currentUrl);

    // hreflang alternates
    const hreflangEn = document.querySelector<HTMLLinkElement>('link[rel="alternate"][hreflang="en"]');
    const hreflangJa = document.querySelector<HTMLLinkElement>('link[rel="alternate"][hreflang="ja"]');
    const hreflangXDefault = document.querySelector<HTMLLinkElement>('link[rel="alternate"][hreflang="x-default"]');
    const prevHreflangEn = hreflangEn?.getAttribute('href') ?? '';
    const prevHreflangJa = hreflangJa?.getAttribute('href') ?? '';
    const prevHreflangXDefault = hreflangXDefault?.getAttribute('href') ?? '';
    hreflangEn?.setAttribute('href', EN_URL);
    hreflangJa?.setAttribute('href', JA_URL);
    hreflangXDefault?.setAttribute('href', EN_URL);

    // OGP
    const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
    const ogDesc = document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
    const ogUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
    const prevOgTitle = ogTitle?.getAttribute('content') ?? '';
    const prevOgDesc = ogDesc?.getAttribute('content') ?? '';
    const prevOgUrl = ogUrl?.getAttribute('content') ?? '';
    ogTitle?.setAttribute('content', '社内研修動画をAI検索 | VideoQ 企業研修向け');
    ogDesc?.setAttribute('content', 'VideoQ は企業研修向け AI 動画プラットフォームです。社内研修動画を Whisper で文字起こしし、社員が AI チャットで必要な場面を即検索できます。');
    ogUrl?.setAttribute('content', currentUrl);

    // FAQPage schema
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'faq-schema-corporate-training';
    script.textContent = JSON.stringify(FAQ_SCHEMA);
    document.head.appendChild(script);

    return () => {
      document.title = prevTitle;
      metaDesc?.setAttribute('content', prevDesc);
      canonicalEl?.setAttribute('href', prevCanonical);
      hreflangEn?.setAttribute('href', prevHreflangEn);
      hreflangJa?.setAttribute('href', prevHreflangJa);
      hreflangXDefault?.setAttribute('href', prevHreflangXDefault);
      ogTitle?.setAttribute('content', prevOgTitle);
      ogDesc?.setAttribute('content', prevOgDesc);
      ogUrl?.setAttribute('content', prevOgUrl);
      document.getElementById('faq-schema-corporate-training')?.remove();
    };
  }, [currentUrl]);

  return (
    <AppPageShell isPublic contentClassName="w-full px-0">
      {/* ── Hero ── */}
      <section className="w-full bg-[#f8faf5] py-16 lg:py-24">
        <div className={`${CONTAINER} text-center`}>
          <span
            className="inline-block mb-4 px-3 py-1 rounded-full text-xs font-semibold tracking-widest uppercase"
            style={{ background: '#dcfce7', color: '#00652c' }}
          >
            Corporate Training
          </span>
          <h1 className="text-3xl lg:text-5xl font-extrabold text-[#191c19] leading-tight mb-5 max-w-3xl mx-auto">
            {t('useCases.corporateTraining.hero.title')}
          </h1>
          <p className="text-base lg:text-lg text-[#3f493f] mb-8 max-w-2xl mx-auto leading-relaxed">
            {t('useCases.corporateTraining.hero.subtitle')}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white text-sm transition-opacity hover:opacity-90"
              style={{
                background: 'linear-gradient(145deg, #00652c 0%, #15803d 100%)',
                boxShadow: '0 4px 16px rgba(0,101,44,0.25)',
              }}
            >
              {t('useCases.corporateTraining.hero.ctaSignup')}
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/docs"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-[#00652c] text-sm border-2 border-[#00652c] bg-transparent hover:bg-[#f0fdf4] transition-colors"
            >
              {t('useCases.corporateTraining.hero.ctaApiDocs')}
            </Link>
          </div>
        </div>
      </section>

      {/* ── Problems → Solutions ── */}
      <section className="w-full py-16 lg:py-20 bg-white">
        <div className={CONTAINER}>
          <h2 className="text-2xl lg:text-3xl font-extrabold text-[#191c19] text-center mb-12">
            {t('useCases.corporateTraining.problems.title')}
          </h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {(
              [
                'tooMany',
                'noRecord',
                'newHire',
                'highCost',
              ] as const
            ).map((key) => (
              <div
                key={key}
                className="rounded-2xl overflow-hidden"
                style={{ boxShadow: '0 8px 24px rgba(25,28,25,0.06)' }}
              >
                <div className="bg-[#f8faf5] px-5 py-4">
                  <p className="text-sm font-medium text-[#6f7a6e] leading-snug">
                    {t(`useCases.corporateTraining.problems.${key}.problem`)}
                  </p>
                </div>
                <div className="bg-white px-5 py-4 flex gap-3 items-start">
                  <CheckCircle className="w-5 h-5 text-[#00652c] mt-0.5 shrink-0" />
                  <p className="text-sm font-semibold text-[#191c19] leading-snug">
                    {t(`useCases.corporateTraining.problems.${key}.solution`)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Use Cases ── */}
      <section className="w-full py-16 lg:py-20 bg-[#f8faf5]">
        <div className={CONTAINER}>
          <h2 className="text-2xl lg:text-3xl font-extrabold text-[#191c19] text-center mb-12">
            {t('useCases.corporateTraining.useCases.title')}
          </h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {(
              [
                { key: 'onboarding', Icon: Users },
                { key: 'compliance', Icon: ShieldCheck },
                { key: 'manual', Icon: BookMarked },
                { key: 'seminar', Icon: Archive },
              ] as const
            ).map(({ key, Icon }) => (
              <div
                key={key}
                className="rounded-2xl bg-white p-6"
                style={{ boxShadow: '0 8px 24px rgba(25,28,25,0.06)' }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: '#dcfce7' }}
                >
                  <Icon className="w-5 h-5 text-[#00652c]" />
                </div>
                <h3 className="font-bold text-[#191c19] mb-2">
                  {t(`useCases.corporateTraining.useCases.${key}.title`)}
                </h3>
                <p className="text-sm text-[#6f7a6e] leading-relaxed">
                  {t(`useCases.corporateTraining.useCases.${key}.description`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── API Integration ── */}
      <section id="api" className="w-full py-16 lg:py-20 bg-white">
        <div className={CONTAINER}>
          <h2 className="text-2xl lg:text-3xl font-extrabold text-[#191c19] text-center mb-12">
            {t('useCases.corporateTraining.api.title')}
          </h2>
          <div className="grid gap-6 md:grid-cols-2 max-w-2xl mx-auto">
            {(
              [
                { key: 'slack', Icon: Bot },
                { key: 'mcp', Icon: Code2 },
              ] as const
            ).map(({ key, Icon }) => (
              <div
                key={key}
                className="rounded-2xl bg-[#f8faf5] p-6"
                style={{ boxShadow: '0 4px 16px rgba(25,28,25,0.04)' }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: '#00652c' }}
                >
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-bold text-[#191c19] mb-2">
                  {t(`useCases.corporateTraining.api.${key}.title`)}
                </h3>
                <p className="text-sm text-[#6f7a6e] leading-relaxed">
                  {t(`useCases.corporateTraining.api.${key}.description`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section
        className="w-full py-16 lg:py-20"
        style={{ background: 'linear-gradient(145deg, #00652c 0%, #005b8c 100%)' }}
      >
        <div className={`${CONTAINER} text-center`}>
          <h2 className="text-2xl lg:text-3xl font-extrabold text-white mb-6">
            {t('useCases.corporateTraining.cta.title')}
          </h2>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-[#00652c] bg-white text-sm transition-opacity hover:opacity-90"
              style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}
            >
              {t('useCases.corporateTraining.hero.ctaSignup')}
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/docs"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-white text-sm border-2 border-white bg-transparent hover:bg-white/10 transition-colors"
            >
              {t('useCases.corporateTraining.hero.ctaApiDocs')}
            </Link>
          </div>
        </div>
      </section>
    </AppPageShell>
  );
}
