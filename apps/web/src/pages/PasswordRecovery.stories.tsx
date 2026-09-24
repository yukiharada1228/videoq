import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import { http, HttpResponse } from 'msw';
import i18n from '@/i18n/config';
import { authFixtures } from '../../.storybook/fixtures/auth';
import ForgotPasswordPage from './ForgotPasswordPage';
import ResetPasswordPage from './ResetPasswordPage';

let requests: unknown[];
let finishRequest: () => void;
const errorMessage = 'Reset service unavailable (fixture)';
const meta = {
  title: 'Pages/PasswordRecovery',
  component: ForgotPasswordPage,
  parameters: { pathname: '/forgot-password', api: { auth: authFixtures.loggedOut } },
  beforeEach({ msw }) {
    requests = [];
    const pending = new Promise<void>(resolve => { finishRequest = resolve; });
    msw.use(http.post('/api/auth/:action', async ({ request }) => {
      requests.push(await request.json());
      if (requests.length === 1) {
        return HttpResponse.json({ code: 'RESET_FAILED', message: errorMessage }, { status: 400 });
      }
      await pending;
      return HttpResponse.json({ status: true });
    }));
    return () => finishRequest();
  },
} satisfies Meta<typeof ForgotPasswordPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const RequestRetry: Story = {
  async play({ canvas, canvasElement, userEvent }) {
    const email = canvas.getByRole('textbox', { name: new RegExp(i18n.t('auth.fields.email.label')) });
    await userEvent.type(email, 'learner@example.test');
    await userEvent.keyboard('{Enter}');
    await expect(await canvas.findByRole('alert')).toHaveTextContent(errorMessage);
    await expect(email).toHaveValue('learner@example.test');
    canvas.getByRole('button', { name: i18n.t('auth.forgotPassword.submit') }).focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(requests).toHaveLength(2));
    await expect(email).toBeDisabled();
    await expect(canvas.getByRole('button', { name: i18n.t('auth.forgotPassword.submitting') })).toBeDisabled();
    await expect(canvas.queryByText(errorMessage)).not.toBeInTheDocument();
    finishRequest();
    await expect(await canvas.findByText(i18n.t('auth.forgotPassword.success'))).toBeVisible();
    await expect(email).toBeEnabled();
    await expect(requests[1]).toMatchObject({ email: 'learner@example.test' });
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
  },
};
export const RequestRetryEnglishMobile: Story = {
  ...RequestRetry, globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};

export const ResetRetry: Story = {
  parameters: { pathname: '/reset-password?token=fixture-token' },
  render: () => <ResetPasswordPage />,
  async play({ canvas, canvasElement, userEvent }) {
    const password = canvas.getByLabelText(new RegExp(i18n.t('auth.resetPassword.newPassword')), { selector: '#password' });
    const confirm = canvas.getByLabelText(new RegExp(i18n.t('auth.resetPassword.confirmPassword')));
    await userEvent.type(password, 'new-password-for-test');
    await userEvent.type(confirm, 'new-password-for-test');
    await userEvent.keyboard('{Enter}');
    await expect(await canvas.findByRole('alert')).toHaveTextContent(errorMessage);
    canvas.getByRole('button', { name: i18n.t('auth.resetPassword.submit') }).focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(requests).toHaveLength(2));
    await expect(password).toBeDisabled();
    await expect(confirm).toBeDisabled();
    await expect(canvas.getByRole('button', { name: i18n.t('auth.resetPassword.submitting') })).toBeDisabled();
    finishRequest();
    await expect(await canvas.findByText(i18n.t('auth.resetPassword.success'))).toBeVisible();
    await expect(canvas.queryByLabelText(new RegExp(i18n.t('auth.resetPassword.newPassword')), { selector: '#password' })).not.toBeInTheDocument();
    await expect(canvas.queryByText(errorMessage)).not.toBeInTheDocument();
    await expect(requests[1]).toEqual({ token: 'fixture-token', newPassword: 'new-password-for-test' });
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
  },
};
export const ResetRetryEnglishMobile: Story = {
  ...ResetRetry, globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};
export const InvalidLink: Story = {
  parameters: { pathname: '/reset-password?error=INVALID_TOKEN' },
  render: () => <ResetPasswordPage />,
  async play({ canvas }) {
    await expect(canvas.getByRole('alert')).toHaveTextContent(i18n.t('auth.resetPassword.invalidLink'));
    await expect(canvas.queryByRole('button', { name: i18n.t('auth.resetPassword.submit') })).not.toBeInTheDocument();
    await expect(requests).toHaveLength(0);
  },
};
