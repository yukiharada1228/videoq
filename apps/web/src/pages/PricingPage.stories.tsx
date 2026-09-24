import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor } from 'storybook/test';
import type { BillingPlan } from '@videoq/trpc';
import i18n from '@/i18n/config';
import PricingPage from './PricingPage';
import { authFixture, authFixtures, regularUser } from '../../.storybook/fixtures/auth';
import { failure, success, trpcMutation, trpcQuery } from '../../.storybook/mocks/network';

const plans: BillingPlan[] = [
  { code: 'free', interval: null, lookup_key: null, amount_yen: 0, currency: 'jpy',
    entitlements: { max_video_upload_size_mb: 200, storage_limit_gb: 1, processing_limit_minutes: 45, ai_answers_limit: 30 } },
  ...(['month', 'year'] as const).flatMap(interval => ([
    { code: 'basic' as const, interval, lookup_key: interval === 'month' ? 'basic_monthly' : 'basic_yearly',
      amount_yen: interval === 'month' ? 1480 : 14800, currency: 'jpy' as const,
      entitlements: { max_video_upload_size_mb: 1024, storage_limit_gb: 20, processing_limit_minutes: 300, ai_answers_limit: 500 } },
    { code: 'pro' as const, interval, lookup_key: interval === 'month' ? 'pro_monthly' : 'pro_yearly',
      amount_yen: interval === 'month' ? 3980 : 39800, currency: 'jpy' as const,
      entitlements: { max_video_upload_size_mb: 2048, storage_limit_gb: 100, processing_limit_minutes: 1500, ai_answers_limit: 2500 } },
  ])),
];
const portalRequest = fn();
const catalogRequest = fn();
const portalError = 'Billing portal unavailable (fixture)';
const catalogError = 'Price catalog unavailable (fixture)';
const api = { auth: authFixtures.loggedOut, trpc: [trpcQuery('billing.plans', success(plans))] };

const meta = {
  title: 'Pages/Pricing',
  component: PricingPage,
  parameters: { pathname: '/pricing', api },
} satisfies Meta<typeof PricingPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Anonymous: Story = {
  async play({ canvas, canvasElement, userEvent }) {
    await expect(await canvas.findByRole('link', { name: i18n.t('pricing.startFree') })).toBeVisible();
    await expect(canvas.getAllByRole('link', { name: i18n.t('pricing.signUpToSubscribe') })).toHaveLength(2);
    await expect(canvas.queryByText(i18n.t('pricing.currentPlan'))).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: i18n.t('pricing.yearly') }));
    await expect(canvas.getByText(/14,800/)).toBeVisible();
    await expect(canvas.getByText(/39,800/)).toBeVisible();
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
  },
};
export const AnonymousEnglishMobile: Story = {
  ...Anonymous, globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};

export const PortalErrorRetry: Story = {
  parameters: { api: { auth: authFixture({ ...regularUser, plan_code: 'basic' }), trpc: [
    trpcQuery('billing.plans', success(plans)),
    trpcMutation('billing.portal', input => { portalRequest(input); return failure(portalError); }),
  ] } },
  beforeEach() { portalRequest.mockClear(); },
  async play({ canvas, canvasElement, userEvent }) {
    const manage = await canvas.findByRole('button', { name: i18n.t('pricing.manage') });
    await userEvent.click(manage);
    await expect(await canvas.findByRole('alert')).toHaveTextContent(portalError);
    const change = canvas.getAllByRole('button', { name: i18n.t('pricing.changePlan') });
    await expect(change).toHaveLength(2);
    change[0].focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(portalRequest).toHaveBeenCalledTimes(2));
    await expect(portalRequest).toHaveBeenLastCalledWith({ locale: i18n.language });
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
  },
};
export const PortalErrorRetryEnglishMobile: Story = {
  ...PortalErrorRetry, globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};

export const CatalogRetry: Story = {
  parameters: { api: { auth: authFixtures.user, trpc: [
    trpcQuery('billing.plans', () => {
      catalogRequest();
      return catalogRequest.mock.calls.length === 1 ? failure(catalogError) : success(plans);
    }),
  ] } },
  beforeEach() { catalogRequest.mockClear(); },
  async play({ canvas, canvasElement, userEvent }) {
    await expect(await canvas.findByRole('alert')).toHaveTextContent(catalogError);
    await userEvent.click(canvas.getByRole('button', { name: i18n.t('pricing.retry') }));
    await expect(await canvas.findByText(i18n.t('pricing.currentPlan'))).toBeVisible();
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
    await expect(canvas.getAllByRole('button', { name: i18n.t('pricing.subscribe') })).toHaveLength(2);
    await expect(catalogRequest).toHaveBeenCalledTimes(2);
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
  },
};
export const CatalogRetryEnglishMobile: Story = {
  ...CatalogRetry, globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};
