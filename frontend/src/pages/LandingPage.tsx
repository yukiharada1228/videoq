import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  GraduationCap,
  Building2,
  Code2,
  Mic,
  MessageSquare,
  Plug,
  ArrowRight,
} from 'lucide-react';
import { AppPageShell } from '@/components/layout/AppPageShell';
import { Link } from '@/lib/i18n';

const BASE_URL = 'https://videoq.jp';
const CONTAINER = 'max-w-screen-xl mx-auto px-6 lg:px-8';

export default function LandingPage() {
  const { t } = useTranslation();

  useEffect(() => {
    const prevTitle = document.title;
    document.title = '動画をアップロードするだけ。教育・研修動画をAIで文字起こし→即検索 | VideoQ';

    const metaDesc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const prevDesc = metaDesc?.getAttribute('content') ?? '';
    metaDesc?.setAttribute(
      'content',
      'VideoQは教育・企業研修向けのAI動画学習プラットフォームです。動画をアップロードするだけでAIが授業・研修・セミナーを文字起こし。自然言語で即検索できます。無料で始められます。',
    );

    const canonicalEl = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const prevCanonical = canonicalEl?.getAttribute('href') ?? '';
    canonicalEl?.setAttribute('href', `${BASE_URL}/`);

    return () => {
      document.title = prevTitle;
      metaDesc?.setAttribute('content', prevDesc);
      canonicalEl?.setAttribute('href', prevCanonical);
    };
  }, []);

  return (
    <AppPageShell isPublic activePage="home" contentClassName="w-full px-0">
      {/* ── Hero ── */}
      <section className="w-full bg-[#f8faf5] py-16 lg:py-28">
        <div className={`${CONTAINER} text-center`}>
          <span
            className="inline-block mb-4 px-3 py-1 rounded-full text-xs font-semibold tracking-widest uppercase"
            style={{ background: '#dcfce7', color: '#00652c' }}
          >
            AI Video Platform
          </span>
          <h1 className="text-3xl lg:text-5xl font-extrabold text-[#191c19] leading-tight mb-5 max-w-3xl mx-auto">
            {t('landing.hero.title')}
          </h1>
          <p className="text-base lg:text-lg text-[#3f493f] mb-4 max-w-2xl mx-auto leading-relaxed">
            {t('landing.hero.subtitle')}
          </p>
          <p className="text-sm text-[#6f7a6e] mb-10 max-w-xl mx-auto leading-relaxed">
            {t('landing.hero.description')}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-white text-sm transition-opacity hover:opacity-90"
              style={{
                background: 'linear-gradient(145deg, #00652c 0%, #15803d 100%)',
                boxShadow: '0 4px 16px rgba(0,101,44,0.25)',
              }}
            >
              {t('landing.hero.ctaSignup')}
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/docs"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-[#00652c] text-sm border-2 border-[#00652c] bg-transparent hover:bg-[#f0fdf4] transition-colors"
            >
              {t('landing.hero.ctaDocs')}
            </Link>
          </div>
        </div>
      </section>

      {/* ── Personas (こんな方に) ── */}
      <section className="w-full py-16 lg:py-20 bg-white">
        <div className={CONTAINER}>
          <h2 className="text-2xl lg:text-3xl font-extrabold text-[#191c19] text-center mb-12">
            {t('landing.personas.title')}
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {/* Educator */}
            <div
              className="rounded-2xl bg-[#f8faf5] p-7 flex flex-col"
              style={{ boxShadow: '0 8px 24px rgba(25,28,25,0.06)' }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                style={{ background: '#dcfce7' }}
              >
                <GraduationCap className="w-6 h-6 text-[#00652c]" />
              </div>
              <h3 className="font-bold text-lg text-[#191c19] mb-3">
                {t('landing.personas.educator.title')}
              </h3>
              <p className="text-sm text-[#6f7a6e] leading-relaxed mb-6 flex-1">
                {t('landing.personas.educator.description')}
              </p>
              <Link
                to="/use-cases/education"
                className="inline-flex items-center gap-1 text-sm font-semibold text-[#00652c] hover:underline"
              >
                {t('landing.personas.educator.ctaLink')}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Corporate Trainer */}
            <div
              className="rounded-2xl bg-[#f8faf5] p-7 flex flex-col"
              style={{ boxShadow: '0 8px 24px rgba(25,28,25,0.06)' }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                style={{ background: '#e0f2fe' }}
              >
                <Building2 className="w-6 h-6 text-[#005b8c]" />
              </div>
              <h3 className="font-bold text-lg text-[#191c19] mb-3">
                {t('landing.personas.corporateTrainer.title')}
              </h3>
              <p className="text-sm text-[#6f7a6e] leading-relaxed mb-6 flex-1">
                {t('landing.personas.corporateTrainer.description')}
              </p>
              <Link
                to="/use-cases/corporate-training"
                className="inline-flex items-center gap-1 text-sm font-semibold text-[#005b8c] hover:underline"
              >
                {t('landing.personas.corporateTrainer.ctaLink')}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Developer */}
            <div
              className="rounded-2xl bg-[#f8faf5] p-7 flex flex-col"
              style={{ boxShadow: '0 8px 24px rgba(25,28,25,0.06)' }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                style={{ background: '#fef9c3' }}
              >
                <Code2 className="w-6 h-6 text-[#854d0e]" />
              </div>
              <h3 className="font-bold text-lg text-[#191c19] mb-3">
                {t('landing.personas.developer.title')}
              </h3>
              <p className="text-sm text-[#6f7a6e] leading-relaxed mb-6 flex-1">
                {t('landing.personas.developer.description')}
              </p>
              <Link
                to="/docs"
                className="inline-flex items-center gap-1 text-sm font-semibold text-[#854d0e] hover:underline"
              >
                {t('landing.personas.developer.ctaLink')}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="w-full py-16 lg:py-20 bg-[#f8faf5]">
        <div className={CONTAINER}>
          <h2 className="text-2xl lg:text-3xl font-extrabold text-[#191c19] text-center mb-12">
            {t('landing.features.title')}
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {(
              [
                { key: 'transcription', Icon: Mic },
                { key: 'chat', Icon: MessageSquare },
                { key: 'api', Icon: Plug },
              ] as const
            ).map(({ key, Icon }) => (
              <div
                key={key}
                className="rounded-2xl bg-white p-6"
                style={{ boxShadow: '0 4px 16px rgba(25,28,25,0.04)' }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: '#00652c' }}
                >
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-bold text-[#191c19] mb-2">
                  {t(`landing.features.${key}.title`)}
                </h3>
                <p className="text-sm text-[#6f7a6e] leading-relaxed">
                  {t(`landing.features.${key}.description`)}
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
          <h2 className="text-2xl lg:text-3xl font-extrabold text-white mb-3">
            {t('landing.hero.ctaSignup')}
          </h2>
          <p className="text-white/80 text-sm mb-8">{t('landing.hero.description')}</p>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-[#00652c] bg-white text-sm transition-opacity hover:opacity-90"
            style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}
          >
            {t('landing.hero.ctaSignup')}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </AppPageShell>
  );
}
