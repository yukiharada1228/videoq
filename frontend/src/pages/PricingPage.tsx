import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiClient, type BillingPlan } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthSession } from '@/lib/authSession';
import { authMeQueryOptions } from '@/lib/authQuery';
import { Link, useLocale } from '@/lib/i18n';
import { AppPageShell } from '@/components/layout/AppPageShell';
import { AppPageHeader } from '@/components/layout/AppPageHeader';
import { Heading, HeadingTitle } from '@/components/ui/heading';
import { Button } from '@/components/ui/button';
import { MessageAlert } from '@/components/common/MessageAlert';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { cn } from '@/lib/digital-agency/cn';

type Interval = 'month' | 'year';

function formatYen(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'ja' ? 'ja-JP' : 'en-US', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function PricingPage() {
  const { t } = useTranslation();
  const locale = useLocale();
  const [searchParams] = useSearchParams();
  const [interval, setInterval] = useState<Interval>('month');
  const session = useAuthSession();
  const hasSession = Boolean(session.data?.user);
  const { data: user } = useQuery({
    ...authMeQueryOptions,
    enabled: hasSession && !session.isPending,
  });
  const { data: plans, isLoading } = useQuery({
    queryKey: queryKeys.billing.plans,
    queryFn: () => apiClient.getBillingPlans(),
  });

  const canceled = searchParams.get('billing') === 'cancel';
  const currentPlan = user?.plan_code ?? 'free';

  const cards = useMemo(() => {
    const list = plans ?? [];
    const free = list.find((p) => p.code === 'free');
    const paid = list.filter((p) => p.code !== 'free' && p.interval === interval);
    return [free, ...paid].filter((p): p is BillingPlan => Boolean(p));
  }, [plans, interval]);

  const checkout = useMutation({
    mutationFn: async (lookupKey: string) => {
      const res = await apiClient.createBillingCheckout({
        lookup_key: lookupKey,
        locale,
      });
      window.location.assign(res.url);
    },
  });

  const portal = useMutation({
    mutationFn: async () => {
      const res = await apiClient.createBillingPortal({ locale });
      window.location.assign(res.url);
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <AppPageShell>
      <AppPageHeader
        title={t('pricing.title')}
        description={t('pricing.subtitle')}
      />

      {canceled && (
        <div className="mb-6">
          <MessageAlert type="warning" message={t('pricing.canceled')} />
        </div>
      )}
      {checkout.isError && (
        <div className="mb-6">
          <MessageAlert
            type="error"
            message={
              checkout.error instanceof Error
                ? checkout.error.message
                : t('pricing.checkoutError')
            }
          />
        </div>
      )}

      <div className="mb-8 flex gap-2">
        <Button
          type="button"
          variant={interval === 'month' ? 'solid-fill' : 'outline'}
          onClick={() => setInterval('month')}
        >
          {t('pricing.monthly')}
        </Button>
        <Button
          type="button"
          variant={interval === 'year' ? 'solid-fill' : 'outline'}
          onClick={() => setInterval('year')}
        >
          {t('pricing.yearly')}
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {cards.map((plan) => {
          const isCurrent = plan.code === currentPlan;
          return (
            <section
              key={`${plan.code}-${plan.interval ?? 'free'}`}
              className={cn(
                'flex flex-col border border-solid-gray-420 p-6',
                isCurrent && 'border-2 border-blue-900',
              )}
            >
              <Heading size="18" className="mb-2">
                <HeadingTitle level="h2">{t(`pricing.plans.${plan.code}.name`)}</HeadingTitle>
              </Heading>
              <p className="mb-4 text-std-16N-170 text-solid-gray-700">
                {t(`pricing.plans.${plan.code}.blurb`)}
              </p>
              <p className="mb-6 text-std-20B-150 text-solid-gray-800">
                {plan.code === 'free'
                  ? t('pricing.freePrice')
                  : `${formatYen(plan.amount_yen, locale)}${interval === 'year' ? t('pricing.perYear') : t('pricing.perMonth')}`}
              </p>
              <ul className="mb-6 flex-1 space-y-2 text-std-16N-170 text-solid-gray-700">
                <li>
                  {t('pricing.limits.storage', { gb: plan.entitlements.storage_limit_gb })}
                </li>
                <li>
                  {t('pricing.limits.processing', {
                    minutes: plan.entitlements.processing_limit_minutes,
                  })}
                </li>
                <li>
                  {t('pricing.limits.answers', {
                    count: plan.entitlements.ai_answers_limit,
                  })}
                </li>
                <li>
                  {t('pricing.limits.upload', {
                    mb: plan.entitlements.max_video_upload_size_mb,
                  })}
                </li>
              </ul>
              {plan.code === 'free' ? (
                isCurrent ? (
                  <p className="text-std-16N-170 text-solid-gray-600">{t('pricing.currentPlan')}</p>
                ) : (
                  <Button asChild variant="outline">
                    <Link href="/signup">{t('pricing.startFree')}</Link>
                  </Button>
                )
              ) : !hasSession ? (
                <Button asChild>
                  <Link href="/signup">{t('pricing.signUpToSubscribe')}</Link>
                </Button>
              ) : isCurrent ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={portal.isPending}
                  onClick={() => portal.mutate()}
                >
                  {t('pricing.manage')}
                </Button>
              ) : currentPlan !== 'free' ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={portal.isPending}
                  onClick={() => portal.mutate()}
                >
                  {t('pricing.changePlan')}
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={!plan.lookup_key || checkout.isPending}
                  onClick={() => plan.lookup_key && checkout.mutate(plan.lookup_key)}
                >
                  {t('pricing.subscribe')}
                </Button>
              )}
            </section>
          );
        })}
      </div>
    </AppPageShell>
  );
}
