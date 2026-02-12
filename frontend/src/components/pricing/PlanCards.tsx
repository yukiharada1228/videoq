import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient, type Plan, type User } from '@/lib/api';

interface PlanCardsProps {
  onSelectPlan: (plan: Plan) => void;
  currentPlanId?: string;
  checkoutLoading?: string | null;
  downgradeLoading?: boolean;
  onBillingPortal?: () => void;
  user?: User | null;
}

export function PlanCards({
  onSelectPlan,
  currentPlanId,
  checkoutLoading,
  downgradeLoading,
  onBillingPortal,
  user,
}: PlanCardsProps) {
  const { t } = useTranslation();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .getPlans()
      .then(setPlans)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const formatPrice = (price: number) => {
    if (price === 0) return t('billing.pricing.free');
    return `¥${price.toLocaleString()}`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <p className="text-gray-500">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-3 gap-6">
      {plans.map((plan) => {
        const isCurrent = currentPlanId === plan.plan_id;
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

            <PlanButton
              plan={plan}
              isCurrent={isCurrent}
              isFree={isFree}
              isPopular={isPopular}
              user={user}
              plans={plans}
              checkoutLoading={checkoutLoading}
              downgradeLoading={downgradeLoading}
              onSelectPlan={onSelectPlan}
              onBillingPortal={onBillingPortal}
            />
          </div>
        );
      })}
    </div>
  );
}

function PlanButton({
  plan,
  isCurrent,
  isFree,
  isPopular,
  user,
  plans,
  checkoutLoading,
  downgradeLoading,
  onSelectPlan,
  onBillingPortal,
}: {
  plan: Plan;
  isCurrent: boolean;
  isFree: boolean;
  isPopular: boolean;
  user?: User | null;
  plans: Plan[];
  checkoutLoading?: string | null;
  downgradeLoading?: boolean;
  onSelectPlan: (plan: Plan) => void;
  onBillingPortal?: () => void;
}) {
  const { t } = useTranslation();

  if (isCurrent) {
    return (
      <button
        disabled
        className="w-full py-2 px-4 rounded-lg bg-gray-100 text-gray-500 font-medium cursor-not-allowed"
      >
        {t('billing.pricing.currentPlan')}
      </button>
    );
  }

  // Logged-in user on a paid plan clicking Free → billing portal
  if (isFree && user && user.plan !== 'free' && onBillingPortal) {
    return (
      <button
        onClick={onBillingPortal}
        disabled={downgradeLoading}
        className="w-full py-2 px-4 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        {downgradeLoading
          ? t('billing.pricing.redirecting')
          : t('billing.pricing.downgrade')}
      </button>
    );
  }

  // Not logged in, Free plan → signup
  if (isFree && !user) {
    return (
      <button
        onClick={() => onSelectPlan(plan)}
        className="w-full py-2 px-4 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
      >
        {t('billing.pricing.getStartedFree')}
      </button>
    );
  }

  // Logged-in user already on free → hide button for free plan
  if (isFree) {
    return <div className="h-10" />;
  }

  // Paid plan buttons
  const currentPlan = plans.find((p) => p.plan_id === user?.plan);
  const isDowngrade = currentPlan && plan.price < currentPlan.price;

  return (
    <button
      onClick={() => onSelectPlan(plan)}
      disabled={checkoutLoading === plan.plan_id || downgradeLoading}
      className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${
        isDowngrade
          ? 'border border-gray-300 text-gray-700 hover:bg-gray-50'
          : isPopular
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-gray-900 text-white hover:bg-gray-800'
      } disabled:opacity-50`}
    >
      {checkoutLoading === plan.plan_id || (isDowngrade && downgradeLoading)
        ? t('billing.pricing.redirecting')
        : isDowngrade
          ? t('billing.pricing.planDowngrade')
          : t('billing.pricing.upgrade')}
    </button>
  );
}
