import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient, type Plan } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useConfig } from '@/hooks/useConfig';
import { useI18nNavigate } from '@/lib/i18n';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { PlanCards } from '@/components/pricing/PlanCards';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function PricingPage() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth({ redirectToLogin: false });
  const { config, loading: configLoading } = useConfig();
  const navigate = useI18nNavigate();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [downgradeLoading, setDowngradeLoading] = useState(false);
  const [confirmPlan, setConfirmPlan] = useState<Plan | null>(null);

  useDocumentMeta({
    title: 'VideoQ 料金プラン - 教育・eラーニング向け動画AIプラットフォーム',
    description:
      'VideoQの料金プランをご紹介。教育動画・研修動画のAI検索、eラーニング向け動画学習プラットフォーム。無料プランから始められます。',
    ogTitle: 'VideoQ 料金プラン - 教育・eラーニング向け動画AIプラットフォーム',
    ogDescription:
      'VideoQの料金プラン。教育動画・研修動画のAI検索に。無料プランあり。',
    ogUrl: 'https://videoq.jp/pricing',
  });

  // Once auth resolves, prefer user-level flag; otherwise fall back to config API
  const stillLoading = authLoading || configLoading;
  const billingEnabled = user ? user.billing_enabled : config.billing_enabled;

  useEffect(() => {
    if (!stillLoading && !billingEnabled) {
      navigate('/', { replace: true });
    }
  }, [stillLoading, billingEnabled, navigate]);

  const handleCheckout = async (planId: string) => {
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

  const handlePlanChange = (plan: Plan) => {
    if (!user) {
      window.location.href = '/login';
      return;
    }

    if (user.plan !== 'free') {
      setConfirmPlan(plan);
      return;
    }

    handleCheckout(plan.plan_id);
  };

  const handleConfirmChange = () => {
    if (!confirmPlan) return;
    const plan = confirmPlan;
    setConfirmPlan(null);
    handleCheckout(plan.plan_id);
  };

  const handleBillingPortal = async () => {
    setDowngradeLoading(true);
    try {
      const res = await apiClient.createBillingPortalSession(window.location.href);
      window.location.href = res.portal_url;
    } catch (err) {
      console.error('Failed to create billing portal session:', err);
      setDowngradeLoading(false);
    }
  };

  if (stillLoading || !billingEnabled) {
    return null;
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

        <PlanCards
          onSelectPlan={handlePlanChange}
          currentPlanId={user?.plan}
          downgradeLoading={downgradeLoading}
          checkoutLoading={checkoutLoading}
          onBillingPortal={handleBillingPortal}
          user={user}
        />
      </main>

      <Footer />

      <Dialog open={!!confirmPlan} onOpenChange={(open) => { if (!open) setConfirmPlan(null); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              {t('billing.pricing.confirmChange', { plan: confirmPlan?.name ?? '' })}
            </DialogTitle>
            <DialogDescription>
              {t('billing.pricing.confirmChangeDescription')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setConfirmPlan(null)}
              className="px-4 py-2 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {t('billing.pricing.confirmChangeCancel')}
            </button>
            <button
              onClick={handleConfirmChange}
              className="px-4 py-2 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              {t('billing.pricing.confirmChangeConfirm')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
