import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { apiClient, type Subscription, type Plan } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { useAuth } from '@/hooks/useAuth';
import { AppPageShell } from '@/components/layout/AppPageShell';
import { AppPageHeader } from '@/components/layout/AppPageHeader';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { operatorConfig } from '@/lib/operatorConfig';
import { useLocale } from '@/lib/i18n';

// ─── Helpers ────────────────────────────────────────────────────────────────

function bytesToGb(bytes: number): string {
  return (bytes / (1024 * 1024 * 1024)).toFixed(2);
}

function progressColor(used: number, limit: number | null): string {
  if (limit === null) return 'bg-green-600';
  const pct = used / limit;
  if (pct >= 1) return 'bg-red-500';
  if (pct >= 0.8) return 'bg-amber-500';
  return 'bg-green-600';
}

function progressPct(used: number, limit: number | null): number {
  if (limit === null) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

// ─── Sub-components ─────────────────────────────────────────────────────────

interface UsageMeterProps {
  label: string;
  usedLabel: string;
  limitLabel: string;
  used: number;
  limit: number | null;
}

function UsageMeter({ label, usedLabel, limitLabel, used, limit }: UsageMeterProps) {
  const { t } = useTranslation();
  const pct = progressPct(used, limit);
  const barColor = progressColor(used, limit);

  return (
    <div>
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-sm font-semibold text-[#191c19]">{label}</span>
        <span className="text-xs text-[#6f7a6e]">
          {limit === null
            ? t('billing.usage.unlimited')
            : `${usedLabel} ${t('billing.usage.of')} ${limitLabel}`}
        </span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        {limit !== null && (
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        )}
        {limit === null && (
          <div className="h-full rounded-full bg-green-600 w-0" />
        )}
      </div>
    </div>
  );
}

interface PlanCardProps {
  plan: Plan;
  isCurrent: boolean;
  currency: 'jpy' | 'usd';
  subscription: Subscription | undefined;
  onUpgrade: (planId: string) => void;
  onManage: () => void;
  isLoading: boolean;
}

function PlanCard({ plan, isCurrent, currency, subscription, onUpgrade, onManage, isLoading }: PlanCardProps) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const enterpriseContactHref = operatorConfig.email ? `mailto:${operatorConfig.email}` : '/privacy';

  const rawPrice = currency === 'jpy' ? plan.prices.jpy : plan.prices.usd;
  // JPY is stored as whole yen; USD is stored in cents → divide by 100
  const price = rawPrice !== null && currency === 'usd' ? rawPrice / 100 : rawPrice;
  const currencySymbol = currency === 'jpy' ? '¥' : '$';

  const isActivePaidSub =
    subscription &&
    ['active', 'trialing'].includes(subscription.stripe_status) &&
    subscription.plan !== 'free';

  // Paid → paid plan change requires confirmation (immediate charge)
  const needsConfirmation = isActivePaidSub && plan.plan_id !== 'free' && !isCurrent && !plan.is_contact_required;

  let buttonLabel: string;
  let buttonVariant: 'default' | 'outline' | 'destructive' = 'default';
  let buttonDisabled = false;

  if (plan.is_contact_required) {
    buttonLabel = t('billing.plans.contact');
    buttonVariant = 'outline';
  } else if (isCurrent) {
    buttonLabel = t('billing.plans.current');
    buttonDisabled = true;
    buttonVariant = 'outline';
  } else if (plan.plan_id === 'free') {
    // Downgrade to Free = cancel subscription via portal
    buttonLabel = t('billing.plans.downgrade');
    buttonVariant = 'outline';
  } else {
    const currentPlanOrder = ['free', 'lite', 'standard', 'enterprise'];
    const currentIdx = currentPlanOrder.indexOf(subscription?.plan ?? 'free');
    const targetIdx = currentPlanOrder.indexOf(plan.plan_id);
    buttonLabel = targetIdx > currentIdx ? t('billing.plans.upgrade') : t('billing.plans.downgrade');
  }

  const handleClick = () => {
    if (isActivePaidSub && isCurrent) return;
    // Downgrading to Free means cancelling the subscription via Stripe portal
    if (plan.plan_id === 'free' && isActivePaidSub) {
      onManage();
      return;
    }
    // Paid → paid: show inline confirmation first
    if (needsConfirmation) {
      setConfirming(true);
      return;
    }
    onUpgrade(plan.plan_id);
  };

  const handleConfirm = () => {
    setConfirming(false);
    onUpgrade(plan.plan_id);
  };

  return (
    <div
      className={`bg-white rounded-xl shadow-[0_4px_20px_rgba(28,25,23,0.04)] p-5 flex flex-col gap-4 ${
        isCurrent ? 'ring-2 ring-[#00652c]' : 'border border-stone-200/60'
      }`}
    >
      <div>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold text-[#191c19]">{plan.name}</h3>
          {isCurrent && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#d3ffd5] text-[#006d30]">
              {t('billing.plans.current')}
            </span>
          )}
        </div>
        <div className="text-2xl font-extrabold text-[#191c19]">
          {plan.is_contact_required ? (
            <span className="text-base font-bold text-[#6f7a6e]">{t('billing.plans.enterprise.price')}</span>
          ) : price === null ? (
            <span className="text-base font-bold text-[#6f7a6e]">{t('billing.plans.free')}</span>
          ) : (
            <>
              {currencySymbol}{currency === 'usd' ? price.toFixed(2) : price.toLocaleString()}
              <span className="text-sm font-semibold text-[#6f7a6e]">{t('billing.plans.perMonth')}</span>
            </>
          )}
        </div>
      </div>

      <ul className="flex flex-col gap-2 text-sm text-[#3f493f] flex-1">
        <li className="flex justify-between">
          <span className="font-semibold">{t('billing.plans.storage')}</span>
          <span>
            {plan.is_contact_required
              ? t('billing.plans.enterprise.storage')
              : plan.storage_gb === null
              ? t('billing.usage.unlimited')
              : `${plan.storage_gb} ${t('billing.usage.gb')}`}
          </span>
        </li>
        <li className="flex justify-between">
          <span className="font-semibold">{t('billing.plans.transcription')}</span>
          <span>
            {plan.is_contact_required
              ? t('billing.plans.enterprise.transcription')
              : plan.processing_minutes === null
              ? t('billing.usage.unlimited')
              : `${plan.processing_minutes} ${t('billing.usage.min')}`}
          </span>
        </li>
        <li className="flex justify-between">
          <span className="font-semibold">{t('billing.plans.aiAnswers')}</span>
          <span>
            {plan.is_contact_required
              ? t('billing.plans.enterprise.aiAnswers')
              : plan.ai_answers === null
              ? t('billing.usage.unlimited')
              : plan.ai_answers.toLocaleString()}
          </span>
        </li>
      </ul>

      {confirming ? (
        <div className="flex flex-col gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
          <p>{t('billing.plans.confirmChange', { plan: plan.name })}</p>
          <div className="flex gap-2">
            <Button size="sm" className="bg-[#00652c] text-white hover:bg-[#00652c]/90 flex-1" onClick={handleConfirm} disabled={isLoading}>
              {t('billing.plans.confirmYes')}
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => setConfirming(false)}>
              {t('billing.plans.confirmNo')}
            </Button>
          </div>
        </div>
      ) : plan.plan_id !== 'free' || !isCurrent ? (
        plan.is_contact_required ? (
          <Button
            asChild
            variant={buttonVariant}
            size="sm"
            className={isCurrent ? '' : plan.plan_id !== 'free' && !isCurrent ? 'bg-[#00652c] text-white hover:bg-[#00652c]/90' : ''}
          >
            <a href={enterpriseContactHref}>
              {buttonLabel}
            </a>
          </Button>
        ) : (
          <Button
            variant={buttonVariant}
            size="sm"
            disabled={buttonDisabled || isLoading}
            onClick={handleClick}
            className={isCurrent ? '' : plan.plan_id !== 'free' && !isCurrent ? 'bg-[#00652c] text-white hover:bg-[#00652c]/90' : ''}
          >
            {buttonLabel}
          </Button>
        )
      ) : null}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function BillingPage() {
  useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const locale = useLocale();
  const [currency, setCurrency] = useState<'jpy' | 'usd'>(
    () => (locale === 'en' ? 'usd' : 'jpy'),
  );
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [upgradeSuccess, setUpgradeSuccess] = useState(false);

  const subscriptionQuery = useQuery({
    queryKey: queryKeys.billing.subscription,
    queryFn: () => apiClient.getSubscription(),
  });

  const plansQuery = useQuery({
    queryKey: queryKeys.billing.plans,
    queryFn: () => apiClient.getPlans(),
  });

  const checkoutMutation = useMutation({
    mutationFn: async (planId: string) => {
      const successUrl = `${window.location.origin}/billing?success=1`;
      const cancelUrl = window.location.href;
      return apiClient.createCheckoutSession(planId, currency, successUrl, cancelUrl);
    },
    onSuccess: (data) => {
      if (data.upgraded) {
        setUpgradeSuccess(true);
        queryClient.invalidateQueries({ queryKey: queryKeys.billing.subscription });
        return;
      }
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      }
    },
    onError: (error) => {
      setCheckoutError(error instanceof Error ? error.message : t('common.messages.loadingHistory'));
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const returnUrl = `${window.location.origin}/billing`;
      return apiClient.createBillingPortal(returnUrl);
    },
    onSuccess: (data) => {
      window.location.href = data.portal_url;
    },
    onError: (error) => {
      setPortalError(error instanceof Error ? error.message : t('common.messages.loadingHistory'));
    },
  });

  const isLoading = subscriptionQuery.isLoading || plansQuery.isLoading;
  const isError = subscriptionQuery.isError || plansQuery.isError;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8faf5]">
        <LoadingSpinner />
      </div>
    );
  }

  if (isError) {
    return (
      <AppPageShell activePage="billing">
        <AppPageHeader title={t('billing.title')} description={t('billing.subtitle')} />
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-700">
          {subscriptionQuery.error instanceof Error
            ? subscriptionQuery.error.message
            : plansQuery.error instanceof Error
            ? plansQuery.error.message
            : 'An error occurred.'}
        </div>
      </AppPageShell>
    );
  }

  const subscription = subscriptionQuery.data;
  const plans = plansQuery.data ?? [];

  const isActivePaidSub =
    subscription &&
    ['active', 'trialing'].includes(subscription.stripe_status) &&
    subscription.plan !== 'free';

  // ── Usage values ────────────────────────────────────────────────────────
  const usedStorageGb = subscription ? bytesToGb(subscription.used_storage_bytes) : '0';
  const storageGbLimit = subscription?.storage_limit_bytes != null
    ? bytesToGb(subscription.storage_limit_bytes)
    : null;

  const usedProcessingMin = subscription
    ? Math.round(subscription.used_processing_seconds / 60)
    : 0;
  const processingMinLimit = subscription?.processing_limit_seconds != null
    ? Math.round(subscription.processing_limit_seconds / 60)
    : null;

  const usedAiAnswers = subscription?.used_ai_answers ?? 0;
  const aiAnswersLimit = subscription?.ai_answers_limit ?? null;

  return (
    <AppPageShell activePage="billing">
      <AppPageHeader title={t('billing.title')} description={t('billing.subtitle')} />

      <div className="flex flex-col gap-6">

        {/* ── Cancel warning banner ──────────────────────────────────────── */}
        {subscription?.cancel_at_period_end && subscription.current_period_end && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-800">
            {t('billing.cancelWarning', {
              date: format(new Date(subscription.current_period_end), 'PPP'),
            })}
          </div>
        )}

        {/* ── Section 1: Current Plan & Usage ───────────────────────────── */}
        <section className="bg-white rounded-xl shadow-[0_4px_20px_rgba(28,25,23,0.04)] p-5">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="text-base font-bold text-[#191c19] mb-1">
                {t('billing.currentPlan')}
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-extrabold text-[#00652c] capitalize">
                  {subscription?.plan ?? '—'}
                </span>
                {subscription?.stripe_status && subscription.stripe_status !== 'none' && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#d3ffd5] text-[#006d30] capitalize">
                    {subscription.stripe_status}
                  </span>
                )}
              </div>
              {subscription?.current_period_end && (
                <p className="text-xs text-[#6f7a6e] mt-1">
                  {format(new Date(subscription.current_period_end), 'PPP')}
                </p>
              )}
            </div>
          </div>

          <h3 className="text-sm font-bold text-[#191c19] mb-4">{t('billing.usage.title')}</h3>
          <div className="flex flex-col gap-4">
            <UsageMeter
              label={t('billing.usage.storage')}
              usedLabel={`${usedStorageGb} ${t('billing.usage.gb')}`}
              limitLabel={storageGbLimit !== null ? `${storageGbLimit} ${t('billing.usage.gb')}` : t('billing.usage.unlimited')}
              used={subscription?.used_storage_bytes ?? 0}
              limit={subscription?.storage_limit_bytes ?? null}
            />
            <UsageMeter
              label={t('billing.usage.transcription')}
              usedLabel={`${usedProcessingMin} ${t('billing.usage.min')}`}
              limitLabel={processingMinLimit !== null ? `${processingMinLimit} ${t('billing.usage.min')}` : t('billing.usage.unlimited')}
              used={subscription?.used_processing_seconds ?? 0}
              limit={subscription?.processing_limit_seconds ?? null}
            />
            <UsageMeter
              label={t('billing.usage.aiAnswers')}
              usedLabel={`${usedAiAnswers.toLocaleString()}`}
              limitLabel={aiAnswersLimit !== null ? aiAnswersLimit.toLocaleString() : t('billing.usage.unlimited')}
              used={usedAiAnswers}
              limit={aiAnswersLimit}
            />
          </div>
        </section>

        {/* ── Section 2: Plans ──────────────────────────────────────────── */}
        <section className="bg-white rounded-xl shadow-[0_4px_20px_rgba(28,25,23,0.04)] p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
            <h2 className="text-base font-bold text-[#191c19]">{t('billing.plans.title')}</h2>
            {/* Currency toggle */}
            <div className="flex items-center gap-1 bg-stone-100 rounded-xl p-1 self-start sm:self-auto">
              {(['jpy', 'usd'] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${
                    currency === c
                      ? 'bg-white shadow-sm text-[#191c19]'
                      : 'text-stone-500 hover:text-[#191c19]'
                  }`}
                >
                  {t(`billing.plans.currency.${c}`)}
                </button>
              ))}
            </div>
          </div>

          {upgradeSuccess && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
              {t('billing.upgradeSuccess')}
            </div>
          )}

          {checkoutError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {checkoutError}
            </div>
          )}

          {plans.length === 0 ? (
            <p className="text-sm text-[#6f7a6e]">Billing is not enabled.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {plans.map((plan) => (
                <PlanCard
                  key={plan.plan_id}
                  plan={plan}
                  isCurrent={subscription?.plan === plan.plan_id}
                  currency={currency}
                  subscription={subscription}
                  onUpgrade={(planId) => {
                    setCheckoutError(null);
                    checkoutMutation.mutate(planId);
                  }}
                  onManage={() => {
                    setPortalError(null);
                    portalMutation.mutate();
                  }}
                  isLoading={checkoutMutation.isPending || portalMutation.isPending}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Section 3: Manage Subscription ───────────────────────────── */}
        {isActivePaidSub && (
          <section className="bg-white rounded-xl shadow-[0_4px_20px_rgba(28,25,23,0.04)] p-5">
            <h2 className="text-base font-bold text-[#191c19] mb-1">
              {t('billing.manage.title')}
            </h2>
            <p className="text-sm text-[#6f7a6e] mb-4">
              {t('billing.manage.description')}
            </p>

            {portalError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                {portalError}
              </div>
            )}

            <Button
              variant="outline"
              onClick={() => {
                setPortalError(null);
                portalMutation.mutate();
              }}
              disabled={portalMutation.isPending}
            >
              {portalMutation.isPending ? t('common.loading') : t('billing.manage.button')}
            </Button>
          </section>
        )}

      </div>
    </AppPageShell>
  );
}
