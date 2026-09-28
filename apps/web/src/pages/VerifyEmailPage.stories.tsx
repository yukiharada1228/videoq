import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { http, HttpResponse } from 'msw';
import i18n from '@/i18n/config';
import { authFixtures } from '../../.storybook/fixtures/auth';
import VerifyEmailPage from './VerifyEmailPage';

let tokens: Array<string | null>;
const meta = {
  title: 'Pages/VerifyEmailPage',
  component: VerifyEmailPage,
  parameters: {
    pathname: '/verify-email?token=fixture-token',
    api: { auth: authFixtures.loggedOut },
  },
  beforeEach({ msw }) {
    tokens = [];
    msw.use(http.get('/api/auth/verify-email', ({ request }) => {
      tokens.push(new URL(request.url).searchParams.get('token'));
      return HttpResponse.json({ status: true, user: { emailVerified: true } });
    }));
  },
} satisfies Meta<typeof VerifyEmailPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Verified: Story = {
  async play({ canvas, canvasElement }) {
    await expect(await canvas.findByText(i18n.t('auth.verifyEmail.success'))).toBeVisible();
    await expect(tokens).toEqual(['fixture-token']);
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
  },
};

export const VerifiedEnglishMobile: Story = {
  ...Verified,
  globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};
