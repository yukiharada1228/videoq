import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient, type Plan } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Header } from '@/components/layout/Header';

export default function PricingPage() {
  const { t } = useTranslation();
  const { user } = useAuth({ redirectToLogin: false });
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [downgradeLoading, setDowngradeLoading] = useState(false);

  useEffect(() => {
    apiClient
      .getPlans()
      .then(setPlans)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleUpgrade = async (planId: string) => {
    if (!user) {
      window.location.href = '/login';
      return;
    }
    setCheckoutLoading(planId);
    try {
      const origin = window.location.origin;
      const res = await apiClient.createCheckoutSession(
        planId,
        `${origin}/billing/success`,
        `${origin}/billing/cancel`
      );
      window.location.href = res.checkout_url;
    } catch (err) {
      console.error('Failed to create checkout session:', err);
      setCheckoutLoading(null);
    }
  };

  const handleDowngrade = async () => {
    setDowngradeLoading(true);
    try {
      const res = await apiClient.createBillingPortalSession(window.location.href);
      window.location.href = res.portal_url;
    } catch (err) {
      console.error('Failed to create billing portal session:', err);
      setDowngradeLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    if (price === 0) return t('billing.pricing.free');
    return `¥${price.toLocaleString()}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex justify-center items-center py-20">
          <p className="text-gray-500">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            {t('billing.pricing.title')}
          </h1>
          <p className="text-gray-600">
            {t('billing.pricing.subtitle')}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isCurrent = user?.plan === plan.plan_id;
            const isFree = plan.plan_id === 'free';
            const isPopular = plan.plan_id === 'standard';

            return (
              <div
                key={plan.plan_id}
                className={`bg-white rounded-lg border-2 p-6 flex flex-col ${
                  isPopular
                    ? 'border-blue-500 shadow-lg'
                    : 'border-gray-200'
                }`}
              >
                {isPopular && (
                  <div className="text-center mb-2">
                    <span className="inline-block bg-blue-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                      {t('billing.pricing.popular')}
                    </span>
                  </div>
                )}

                <h2 className="text-xl font-bold text-gray-900 text-center">
                  {plan.name}
                </h2>

                <div className="text-center my-4">
                  <span className="text-3xl font-bold text-gray-900">
                    {formatPrice(plan.price)}
                  </span>
                  {!isFree && (
                    <span className="text-gray-500 text-sm">
                      /{t('billing.pricing.month')}
                    </span>
                  )}
                </div>

                <ul className="space-y-3 mb-6 flex-1">
                  <li className="flex items-center text-sm text-gray-700">
                    <svg className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    {t('billing.pricing.storage', { amount: plan.storage_gb })}
                  </li>
                  <li className="flex items-center text-sm text-gray-700">
                    <svg className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    {t('billing.pricing.processing', { amount: plan.processing_minutes })}
                  </li>
                  <li className="flex items-center text-sm text-gray-700">
                    <svg className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    {t('billing.pricing.aiAnswers', { amount: plan.ai_answers.toLocaleString() })}
                  </li>
                </ul>

                {isCurrent ? (
                  <button
                    disabled
                    className="w-full py-2 px-4 rounded-lg bg-gray-100 text-gray-500 font-medium cursor-not-allowed"
                  >
                    {t('billing.pricing.currentPlan')}
                  </button>
                ) : isFree && user && user.plan !== 'free' ? (
                  <button
                    onClick={handleDowngrade}
                    disabled={downgradeLoading}
                    className="w-full py-2 px-4 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    {downgradeLoading
                      ? t('billing.pricing.redirecting')
                      : t('billing.pricing.downgrade')}
                  </button>
                ) : isFree ? (
                  <div className="h-10" />
                ) : (
                  <button
                    onClick={() => handleUpgrade(plan.plan_id)}
                    disabled={checkoutLoading === plan.plan_id}
                    className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${
                      isPopular
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-gray-900 text-white hover:bg-gray-800'
                    } disabled:opacity-50`}
                  >
                    {checkoutLoading === plan.plan_id
                      ? t('billing.pricing.redirecting')
                      : t('billing.pricing.upgrade')}
                  </button>
                )}
              </div>
            );
          })}
        </div>

      </main>
    </div>
  );
}
