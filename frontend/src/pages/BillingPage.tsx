import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient, type UserSubscription } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useI18nNavigate } from '@/lib/i18n';
import { Header } from '@/components/layout/Header';

export default function BillingPage() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const navigate = useI18nNavigate();
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      apiClient
        .getSubscription()
        .then(setSubscription)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [user, authLoading]);

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const res = await apiClient.createBillingPortalSession(
        window.location.href
      );
      window.location.href = res.portal_url;
    } catch (err) {
      console.error('Failed to create billing portal session:', err);
      setPortalLoading(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex justify-center items-center py-20">
          <p className="text-gray-500">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  const planNames: Record<string, string> = {
    free: t('billing.plans.free'),
    standard: t('billing.plans.standard'),
    business: t('billing.plans.business'),
  };

  const isFree = subscription?.plan === 'free';

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          {t('billing.management.title')}
        </h1>

        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <div>
            <p className="text-sm text-gray-500">{t('billing.management.currentPlan')}</p>
            <p className="text-lg font-semibold text-gray-900">
              {planNames[subscription?.plan || 'free'] || subscription?.plan}
            </p>
          </div>

          {!isFree && subscription && (
            <>
              <div>
                <p className="text-sm text-gray-500">{t('billing.management.status')}</p>
                <p className="text-sm text-gray-900">
                  {subscription.stripe_status === 'active'
                    ? t('billing.management.statusActive')
                    : subscription.stripe_status}
                </p>
              </div>

              {subscription.current_period_end && (
                <div>
                  <p className="text-sm text-gray-500">
                    {t('billing.management.periodEnd')}
                  </p>
                  <p className="text-sm text-gray-900">
                    {new Date(subscription.current_period_end).toLocaleDateString()}
                  </p>
                </div>
              )}

              {subscription.cancel_at_period_end && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-sm text-yellow-800">
                    {t('billing.management.cancelScheduled')}
                  </p>
                </div>
              )}
            </>
          )}

          <div className="pt-4 border-t border-gray-200 space-y-3">
            {isFree ? (
              <button
                onClick={() => navigate('/pricing')}
                className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                {t('billing.management.viewPlans')}
              </button>
            ) : (
              <button
                onClick={handleManageSubscription}
                disabled={portalLoading}
                className="w-full py-2 px-4 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {portalLoading
                  ? t('billing.management.redirecting')
                  : t('billing.management.manageSubscription')}
              </button>
            )}
          </div>

          {subscription && (
            <div className="pt-4 border-t border-gray-200">
              <p className="text-sm font-medium text-gray-700 mb-2">
                {t('billing.management.limitsTitle')}
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">{t('billing.management.limitsStorage')}</span>
                  <span className="ml-1 text-gray-900">{subscription.limits.storage_gb}GB</span>
                </div>
                <div>
                  <span className="text-gray-500">{t('billing.management.limitsProcessing')}</span>
                  <span className="ml-1 text-gray-900">{subscription.limits.processing_minutes}{t('billing.management.limitsMinutes')}</span>
                </div>
                <div>
                  <span className="text-gray-500">{t('billing.management.limitsAi')}</span>
                  <span className="ml-1 text-gray-900">{subscription.limits.ai_answers.toLocaleString()}{t('billing.management.limitsCount')}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
