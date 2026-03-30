import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  School,
  FlipVertical2,
  FolderOpen,
  Share2,
  BarChart3,
  ArrowRight,
  CheckCircle,
} from 'lucide-react';
import { AppPageShell } from '@/components/layout/AppPageShell';
import { Link } from '@/lib/i18n';

const CONTAINER = 'max-w-screen-xl mx-auto px-6 lg:px-8';

const FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: '長い講義動画のどこに何が入っているか分からない場合はどうすればいいですか？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'VideoQ の AI チャットで「〇〇について説明した場面は？」と聞けば即座に該当箇所へジャンプできます。',
      },
    },
    {
      '@type': 'Question',
      name: '学生が繰り返し同じ質問をしてきます。どう解決できますか？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '動画を共有するだけで学生が自分で AI チャットを使って答えを探せます。',
      },
    },
    {
      '@type': 'Question',
      name: '板書や口頭説明を記録に残したいのですがどうすればいいですか？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'VideoQ は Whisper による高精度文字起こしで授業内容を完全にテキスト化します。',
      },
    },
  ],
};

export default function UseCaseEducationPage() {
  const { t } = useTranslation();

  useEffect(() => {
    const prevTitle = document.title;
    document.title = '授業・講義動画を AI 検索 | VideoQ 教育向け';

    const metaDesc = document.querySelector('meta[name="description"]');
    const prevDesc = metaDesc?.getAttribute('content') ?? '';
    metaDesc?.setAttribute(
      'content',
      'VideoQ は教育機関向けの AI 動画学習プラットフォームです。授業・講義動画を Whisper で文字起こしし、学生が自然言語で質問・検索できます。大学・高校・反転授業に対応。無料で始められます。',
    );

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'faq-schema-education';
    script.textContent = JSON.stringify(FAQ_SCHEMA);
    document.head.appendChild(script);

    return () => {
      document.title = prevTitle;
      metaDesc?.setAttribute('content', prevDesc);
      document.getElementById('faq-schema-education')?.remove();
    };
  }, []);

  return (
    <AppPageShell isPublic contentClassName="w-full px-0">
      {/* ── Hero ── */}
      <section className="w-full bg-[#f8faf5] py-16 lg:py-24">
        <div className={`${CONTAINER} text-center`}>
          <span
            className="inline-block mb-4 px-3 py-1 rounded-full text-xs font-semibold tracking-widest uppercase"
            style={{ background: '#dcfce7', color: '#00652c' }}
          >
            Education
          </span>
          <h1 className="text-3xl lg:text-5xl font-extrabold text-[#191c19] leading-tight mb-5 max-w-3xl mx-auto">
            {t('useCases.education.hero.title')}
          </h1>
          <p className="text-base lg:text-lg text-[#3f493f] mb-8 max-w-2xl mx-auto leading-relaxed">
            {t('useCases.education.hero.subtitle')}
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
              {t('useCases.education.hero.ctaSignup')}
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-[#00652c] text-sm border-2 border-[#00652c] bg-transparent hover:bg-[#f0fdf4] transition-colors"
            >
              {t('useCases.education.hero.ctaFeatures')}
            </a>
          </div>
        </div>
      </section>

      {/* ── Problems → Solutions ── */}
      <section className="w-full py-16 lg:py-20 bg-white">
        <div className={CONTAINER}>
          <h2 className="text-2xl lg:text-3xl font-extrabold text-[#191c19] text-center mb-12">
            {t('useCases.education.problems.title')}
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {(
              [
                'findContent',
                'repeatQuestions',
                'lostLectures',
              ] as const
            ).map((key) => (
              <div
                key={key}
                className="rounded-2xl overflow-hidden"
                style={{ boxShadow: '0 8px 24px rgba(25,28,25,0.06)' }}
              >
                <div className="bg-[#f8faf5] px-5 py-4">
                  <p className="text-sm font-medium text-[#6f7a6e] leading-snug">
                    {t(`useCases.education.problems.${key}.problem`)}
                  </p>
                </div>
                <div className="bg-white px-5 py-4 flex gap-3 items-start">
                  <CheckCircle className="w-5 h-5 text-[#00652c] mt-0.5 shrink-0" />
                  <p className="text-sm font-semibold text-[#191c19] leading-snug">
                    {t(`useCases.education.problems.${key}.solution`)}
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
            {t('useCases.education.useCases.title')}
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {(
              [
                { key: 'university', Icon: BookOpen },
                { key: 'school', Icon: School },
                { key: 'flipped', Icon: FlipVertical2 },
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
                  {t(`useCases.education.useCases.${key}.title`)}
                </h3>
                <p className="text-sm text-[#6f7a6e] leading-relaxed">
                  {t(`useCases.education.useCases.${key}.description`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Feature Highlights ── */}
      <section id="features" className="w-full py-16 lg:py-20 bg-white">
        <div className={CONTAINER}>
          <h2 className="text-2xl lg:text-3xl font-extrabold text-[#191c19] text-center mb-12">
            {t('useCases.education.features.title')}
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {(
              [
                { key: 'groups', Icon: FolderOpen },
                { key: 'sharing', Icon: Share2 },
                { key: 'analytics', Icon: BarChart3 },
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
                  {t(`useCases.education.features.${key}.title`)}
                </h3>
                <p className="text-sm text-[#6f7a6e] leading-relaxed">
                  {t(`useCases.education.features.${key}.description`)}
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
            {t('useCases.education.cta.title')}
          </h2>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-[#00652c] bg-white text-sm transition-opacity hover:opacity-90"
            style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}
          >
            {t('useCases.education.hero.ctaSignup')}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </AppPageShell>
  );
}
