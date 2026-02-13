import { useTranslation } from 'react-i18next';
import { Link } from '@/lib/i18n';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import appScreenshot from '@/assets/videoq-app-screenshot.gif';

export default function LandingPage() {
  const { t } = useTranslation();

  useDocumentMeta({
    title: 'VideoQ - 質問して見たいシーンへジャンプ',
    description:
      'VideoQは、動画を自動で文字起こしし、AIチャットで見たい箇所にスムーズにアクセスできるWebプラットフォームです。教育機関、企業研修、コンテンツ制作など幅広い用途でご利用いただけます。',
    ogTitle: 'VideoQ - 質問して見たいシーンへジャンプ',
    ogDescription:
      'AIチャットで動画の見たいシーンにスムーズにジャンプ。自動文字起こしで動画をもっと便利に。無料プランあり。',
    ogUrl: 'https://videoq.jp/',
  });

  const features = [
    { key: 'transcription', icon: '🎙️' },
    { key: 'chat', icon: '💬' },
    { key: 'group', icon: '📁' },
    { key: 'share', icon: '🔗' },
  ] as const;

  const hoverBorders = [
    'hover:border-blue-300',
    'hover:border-green-300',
    'hover:border-purple-300',
    'hover:border-orange-300',
  ];

  const legalLinks = [
    { key: 'terms', to: '/legal/terms' },
    { key: 'privacy', to: '/legal/privacy' },
    { key: 'disclosure', to: '/legal/commercial-disclosure' },
  ] as const;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="bg-white border-b border-gray-200 py-16 md:py-20 px-4">
          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-2 gap-10 items-center">
              <div className="text-center md:text-left space-y-5">
                <h1 className="text-3xl md:text-4xl font-bold text-gray-900 leading-tight">
                  {t('landing.hero.title')}
                </h1>
                <p className="text-base md:text-lg text-gray-600 leading-relaxed">
                  {t('landing.hero.subtitle')}
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start pt-2">
                  <Link
                    to="/signup"
                    className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white hover:bg-blue-700 transition-colors"
                  >
                    {t('landing.hero.cta')}
                  </Link>
                  <Link
                    to="/login"
                    className="inline-flex items-center justify-center rounded-lg border-2 border-gray-300 px-6 py-3 text-base font-semibold text-gray-700 hover:border-blue-500 hover:text-blue-600 transition-colors"
                  >
                    {t('landing.hero.login')}
                  </Link>
                </div>
              </div>
              <div>
                <div className="rounded-lg overflow-hidden border-2 border-gray-200 shadow-md">
                  <img
                    src={appScreenshot}
                    alt="VideoQ App Screenshot"
                    className="w-full h-auto"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-16 px-4 bg-gray-50">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
                {t('landing.features.title')}
              </h2>
              <p className="text-base text-gray-600">
                {t('landing.features.subtitle')}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {features.map(({ key, icon }, index) => (
                <div
                  key={key}
                  className={`bg-white rounded-lg p-6 border-2 border-gray-200 ${hoverBorders[index]} hover:shadow-xl transition-all`}
                >
                  <div className="text-4xl mb-4">{icon}</div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    {t(`landing.features.${key}.title`)}
                  </h3>
                  <p className="text-gray-600 leading-relaxed">
                    {t(`landing.features.${key}.description`)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Use Cases */}
        <section className="py-16 px-4 bg-white">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
                {t('landing.useCases.title')}
              </h2>
              <p className="text-base text-gray-600">
                {t('landing.useCases.subtitle')}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-6 bg-gray-50 rounded-lg border-2 border-gray-200 hover:border-blue-300 hover:shadow-xl transition-all">
                <div className="text-4xl mb-3">🎓</div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  {t('landing.useCases.education.title')}
                </h3>
                <p className="text-gray-600 text-sm">
                  {t('landing.useCases.education.description')}
                </p>
              </div>
              <div className="text-center p-6 bg-gray-50 rounded-lg border-2 border-gray-200 hover:border-green-300 hover:shadow-xl transition-all">
                <div className="text-4xl mb-3">💼</div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  {t('landing.useCases.business.title')}
                </h3>
                <p className="text-gray-600 text-sm">
                  {t('landing.useCases.business.description')}
                </p>
              </div>
              <div className="text-center p-6 bg-gray-50 rounded-lg border-2 border-gray-200 hover:border-purple-300 hover:shadow-xl transition-all">
                <div className="text-4xl mb-3">🎬</div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  {t('landing.useCases.production.title')}
                </h3>
                <p className="text-gray-600 text-sm">
                  {t('landing.useCases.production.description')}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 px-4 bg-blue-600">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
              {t('landing.cta.title')}
            </h2>
            <p className="text-blue-100 mb-8">
              {t('landing.cta.subtitle')}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                to="/signup"
                className="inline-flex items-center justify-center rounded-lg bg-white px-6 py-3 text-base font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
              >
                {t('landing.cta.getStarted')}
              </Link>
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center rounded-lg border-2 border-white px-6 py-3 text-base font-semibold text-white hover:bg-white/10 transition-colors"
              >
                {t('landing.cta.viewPricing')}
              </Link>
            </div>
          </div>
        </section>

        {/* Legal Links */}
        <section className="py-10 px-4 bg-gray-50">
          <div className="max-w-3xl mx-auto text-center">
            <h3 className="text-base font-semibold text-gray-700 mb-4">
              {t('landing.legal.title')}
            </h3>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {legalLinks.map(({ key, to }) => (
                <Link
                  key={key}
                  to={to}
                  className="inline-block rounded-lg border-2 border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:border-blue-500 hover:text-blue-600 transition-colors"
                >
                  {t(`landing.legal.${key}`)}
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
