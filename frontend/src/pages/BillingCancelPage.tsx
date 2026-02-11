import { useTranslation } from 'react-i18next';
import { Link } from '@/lib/i18n';
import { Header } from '@/components/layout/Header';

export default function BillingCancelPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-lg mx-auto px-4 py-20 text-center">
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {t('billing.cancel.title')}
          </h1>
          <p className="text-gray-600 mb-6">
            {t('billing.cancel.description')}
          </p>
          <div className="flex gap-3 justify-center">
            <Link
              href="/pricing"
              className="inline-block py-2 px-6 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              {t('billing.cancel.viewPlans')}
            </Link>
            <Link
              href="/"
              className="inline-block py-2 px-6 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              {t('common.actions.backToHome')}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
