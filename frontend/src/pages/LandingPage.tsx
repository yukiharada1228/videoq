import { useTranslation } from 'react-i18next';
import { Link } from '@/lib/i18n';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import appScreenshot from '@/assets/videoq-app-screenshot.gif';

export default function LandingPage() {
  const { t } = useTranslation();

  useDocumentMeta({
    title: 'VideoQ - 動画にAIで質問して、見たいシーンへジャンプ',
    description:
      '動画をアップロードするだけ。AIが自動で文字起こしし、チャットで質問すれば見たい箇所にすぐアクセスできます。無料プランあり。',
    ogTitle: 'VideoQ - 動画にAIで質問して、見たいシーンへジャンプ',
    ogDescription:
      '動画をアップロードするだけ。AIが自動で文字起こしし、チャットで質問すれば見たい箇所にすぐアクセスできます。無料プランあり。',
    ogUrl: 'https://videoq.jp/',
  });

  const features = [
    { key: 'transcription', icon: '🎙️', color: 'bg-blue-50 text-blue-600' },
    { key: 'chat', icon: '💬', color: 'bg-green-50 text-green-600' },
    { key: 'group', icon: '📁', color: 'bg-purple-50 text-purple-600' },
    { key: 'share', icon: '🔗', color: 'bg-orange-50 text-orange-600' },
  ] as const;

  const hoverBorders = [
    'hover:border-blue-300',
    'hover:border-green-300',
    'hover:border-purple-300',
    'hover:border-orange-300',
  ];

  const steps = [
    { key: 'step1', num: '1', color: 'bg-blue-600' },
    { key: 'step2', num: '2', color: 'bg-blue-600' },
    { key: 'step3', num: '3', color: 'bg-blue-600' },
  ] as const;

  const useCases = [
    { key: 'education', icon: '🎓', border: 'hover:border-blue-300' },
    { key: 'business', icon: '💼', border: 'hover:border-green-300' },
    { key: 'production', icon: '🎬', border: 'hover:border-purple-300' },
  ] as const;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="bg-gradient-to-b from-blue-50 to-white border-b border-gray-200 py-16 md:py-24 px-4">
          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-2 gap-10 items-center">
              <div className="text-center md:text-left space-y-6">
                <h1 className="text-3xl md:text-5xl font-bold text-gray-900 leading-tight tracking-tight">
                  {t('landing.hero.title')}
                </h1>
                <p className="text-base md:text-lg text-gray-600 leading-relaxed">
                  {t('landing.hero.subtitle')}
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
                  <Link
                    to="/signup"
                    className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-8 py-3.5 text-base font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm"
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
                <p className="text-sm text-gray-500">
                  {t('landing.hero.ctaSub')}
                </p>
              </div>
              <div>
                <div className="rounded-xl overflow-hidden border-2 border-gray-200 shadow-lg">
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

        {/* How It Works */}
        <section className="py-16 md:py-20 px-4 bg-white">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
                {t('landing.howItWorks.title')}
              </h2>
              <p className="text-base text-gray-600">
                {t('landing.howItWorks.subtitle')}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {steps.map(({ key, num, color }, index) => (
                <div key={key} className="relative text-center">
                  {index < steps.length - 1 && (
                    <div className="hidden md:block absolute top-6 left-[60%] w-[80%] border-t-2 border-dashed border-gray-300" />
                  )}
                  <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full ${color} text-white text-lg font-bold mb-4`}>
                    {num}
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    {t(`landing.howItWorks.${key}.title`)}
                  </h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    {t(`landing.howItWorks.${key}.description`)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-16 md:py-20 px-4 bg-gray-50">
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
              {features.map(({ key, icon, color }, index) => (
                <div
                  key={key}
                  className={`bg-white rounded-xl p-6 border-2 border-gray-200 ${hoverBorders[index]} hover:shadow-lg transition-all`}
                >
                  <div className={`inline-flex items-center justify-center w-12 h-12 rounded-lg ${color} text-2xl mb-4`}>
                    {icon}
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    {t(`landing.features.${key}.title`)}
                  </h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    {t(`landing.features.${key}.description`)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Use Cases */}
        <section className="py-16 md:py-20 px-4 bg-white">
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
              {useCases.map(({ key, icon, border }) => (
                <div
                  key={key}
                  className={`text-center p-6 bg-gray-50 rounded-xl border-2 border-gray-200 ${border} hover:shadow-lg transition-all`}
                >
                  <div className="text-4xl mb-4">{icon}</div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    {t(`landing.useCases.${key}.title`)}
                  </h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    {t(`landing.useCases.${key}.description`)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 md:py-20 px-4 bg-blue-600">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
              {t('landing.cta.title')}
            </h2>
            <p className="text-blue-100 mb-8 text-base">
              {t('landing.cta.subtitle')}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                to="/signup"
                className="inline-flex items-center justify-center rounded-lg bg-white px-8 py-3.5 text-base font-semibold text-blue-600 hover:bg-blue-50 transition-colors shadow-sm"
              >
                {t('landing.cta.getStarted')}
              </Link>
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center rounded-lg border-2 border-white/80 px-6 py-3 text-base font-semibold text-white hover:bg-white/10 transition-colors"
              >
                {t('landing.cta.viewPricing')}
              </Link>
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  );
}
