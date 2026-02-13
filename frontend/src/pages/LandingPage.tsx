import { useTranslation } from 'react-i18next';
import { Link } from '@/lib/i18n';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export default function LandingPage() {
  const { t } = useTranslation();

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
        <section className="bg-gradient-to-br from-blue-600 to-blue-800 text-white py-20 px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              {t('landing.hero.title')}
            </h1>
            <p className="text-lg md:text-xl text-blue-100 mb-10 leading-relaxed">
              {t('landing.hero.subtitle')}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/signup"
                className="inline-block rounded-lg bg-white px-8 py-3 text-lg font-semibold text-blue-700 hover:bg-blue-50 transition-colors"
              >
                {t('landing.hero.cta')}
              </Link>
              <Link
                to="/login"
                className="inline-block rounded-lg border-2 border-white px-8 py-3 text-lg font-semibold text-white hover:bg-white/10 transition-colors"
              >
                {t('landing.hero.login')}
              </Link>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-16 px-4">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
              {t('landing.features.title')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {features.map(({ key, icon }) => (
                <div
                  key={key}
                  className="bg-white rounded-xl p-8 shadow-sm border border-gray-100"
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

        {/* Legal Links */}
        <section className="py-16 px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">
              {t('landing.legal.title')}
            </h2>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {legalLinks.map(({ key, to }) => (
                <Link
                  key={key}
                  to={to}
                  className="inline-block rounded-lg border-2 border-gray-300 px-6 py-3 font-medium text-gray-700 hover:border-blue-500 hover:text-blue-600 transition-colors"
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
