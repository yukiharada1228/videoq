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
      'VideoQは、動画を自動で文字起こしし、AIチャットで見たい箇所に瞬時にアクセスできるWebプラットフォームです。教育機関、企業研修、コンテンツ制作など幅広い用途でご利用いただけます。',
    ogTitle: 'VideoQ - 質問して見たいシーンへジャンプ',
    ogDescription:
      'AIチャットで動画の見たいシーンに瞬時にジャンプ。自動文字起こしで動画をもっと便利に。無料プランあり。',
    ogUrl: 'https://videoq.jp/',
  });

  const features = [
    { key: 'transcription', icon: '🎙️' },
    { key: 'chat', icon: '💬' },
    { key: 'group', icon: '📁' },
    { key: 'share', icon: '🔗' },
  ] as const;

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
        <section className="bg-gradient-to-br from-blue-600 via-blue-700 to-purple-800 text-white py-16 md:py-24 px-4 overflow-hidden relative">
          <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:32px_32px]" />
          <div className="max-w-6xl mx-auto relative z-10">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div className="text-center md:text-left space-y-6">
                <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
                  {t('landing.hero.title')}
                </h1>
                <p className="text-lg md:text-xl text-blue-100 leading-relaxed">
                  {t('landing.hero.subtitle')}
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start pt-4">
                  <Link
                    to="/signup"
                    className="inline-flex items-center justify-center rounded-lg bg-white px-8 py-4 text-lg font-semibold text-blue-700 hover:bg-blue-50 transition-all hover:scale-105 shadow-xl hover:shadow-2xl"
                  >
                    {t('landing.hero.cta')} →
                  </Link>
                  <Link
                    to="/login"
                    className="inline-flex items-center justify-center rounded-lg border-2 border-white px-8 py-4 text-lg font-semibold text-white hover:bg-white/10 transition-all hover:scale-105"
                  >
                    {t('landing.hero.login')}
                  </Link>
                </div>
              </div>
              <div className="relative">
                <div className="relative rounded-xl overflow-hidden shadow-2xl border-4 border-white/20 hover:scale-105 transition-transform duration-500">
                  <img
                    src={appScreenshot}
                    alt="VideoQ App Screenshot"
                    className="w-full h-auto"
                  />
                </div>
                <div className="absolute -bottom-4 -right-4 bg-yellow-400 text-gray-900 px-6 py-3 rounded-full font-bold text-lg shadow-xl animate-bounce">
                  {t('landing.cta.badge')}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-20 px-4 bg-white">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                {t('landing.features.title')}
              </h2>
              <p className="text-lg text-gray-600">
                {t('landing.features.subtitle')}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {features.map(({ key, icon }, index) => {
                const gradients = [
                  'from-blue-50 to-blue-100',
                  'from-green-50 to-green-100',
                  'from-purple-50 to-purple-100',
                  'from-orange-50 to-orange-100',
                ];
                const borderColors = [
                  'border-blue-200 hover:border-blue-400',
                  'border-green-200 hover:border-green-400',
                  'border-purple-200 hover:border-purple-400',
                  'border-orange-200 hover:border-orange-400',
                ];
                return (
                  <div
                    key={key}
                    className={`bg-gradient-to-br ${gradients[index]} rounded-2xl p-8 shadow-md border-2 ${borderColors[index]} hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 cursor-pointer`}
                  >
                    <div className="text-5xl mb-6">{icon}</div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-3">
                      {t(`landing.features.${key}.title`)}
                    </h3>
                    <p className="text-gray-700 leading-relaxed text-lg">
                      {t(`landing.features.${key}.description`)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Use Cases */}
        <section className="py-20 px-4 bg-gradient-to-b from-gray-50 to-white">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                {t('landing.useCases.title')}
              </h2>
              <p className="text-lg text-gray-600">
                {t('landing.useCases.subtitle')}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center p-8 bg-white rounded-2xl shadow-lg hover:shadow-xl transition-shadow">
                <div className="text-6xl mb-4">🎓</div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">
                  {t('landing.useCases.education.title')}
                </h3>
                <p className="text-gray-600">
                  {t('landing.useCases.education.description')}
                </p>
              </div>
              <div className="text-center p-8 bg-white rounded-2xl shadow-lg hover:shadow-xl transition-shadow">
                <div className="text-6xl mb-4">💼</div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">
                  {t('landing.useCases.business.title')}
                </h3>
                <p className="text-gray-600">
                  {t('landing.useCases.business.description')}
                </p>
              </div>
              <div className="text-center p-8 bg-white rounded-2xl shadow-lg hover:shadow-xl transition-shadow">
                <div className="text-6xl mb-4">🎬</div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">
                  {t('landing.useCases.production.title')}
                </h3>
                <p className="text-gray-600">
                  {t('landing.useCases.production.description')}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-4 bg-gradient-to-br from-blue-600 to-purple-700 text-white">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl md:text-5xl font-bold mb-6">
              {t('landing.cta.title')}
            </h2>
            <p className="text-xl text-blue-100 mb-10">
              {t('landing.cta.subtitle')}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/signup"
                className="inline-flex items-center justify-center rounded-lg bg-white px-10 py-5 text-xl font-bold text-blue-700 hover:bg-blue-50 transition-all hover:scale-105 shadow-2xl"
              >
                {t('landing.cta.getStarted')} →
              </Link>
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center rounded-lg border-2 border-white px-10 py-5 text-xl font-semibold text-white hover:bg-white/10 transition-all hover:scale-105"
              >
                {t('landing.cta.viewPricing')}
              </Link>
            </div>
          </div>
        </section>

        {/* Legal Links */}
        <section className="py-12 px-4 bg-gray-50">
          <div className="max-w-3xl mx-auto text-center">
            <h3 className="text-lg font-semibold text-gray-700 mb-6">
              {t('landing.legal.title')}
            </h3>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {legalLinks.map(({ key, to }) => (
                <Link
                  key={key}
                  to={to}
                  className="inline-block rounded-lg border-2 border-gray-300 px-6 py-2 font-medium text-gray-700 hover:border-blue-500 hover:text-blue-600 transition-colors"
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
