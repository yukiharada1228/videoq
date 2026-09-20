import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import SettingsPage from './SettingsPage';
import { AppPageShell } from '@/components/layout/AppPageShell';
import { authFixture, regularUser } from '../../.storybook/fixtures/auth';
import { apiKeysResponse } from '../../.storybook/fixtures/api';
import { consentListPath, consents, publicClientHandler } from '../../.storybook/fixtures/connectedApps';
import { failure, restGet, restPost, success, trpcQuery } from '../../.storybook/mocks/network';

const api = {
  auth: authFixture({ ...regularUser, username: 'yuki' }),
  trpc: [trpcQuery('account.searchApiKeyStatus', success({ has_api_key: false }))],
  rest: [
    restGet('/api/auth/api-key/list', success(apiKeysResponse)),
    restGet(consentListPath, success(consents)),
    publicClientHandler(),
    restPost('/api/auth/change-email', success({ status: true })),
  ],
};

const meta = {
  title: 'Pages/Settings',
  component: SettingsPage,
  parameters: { layout: 'fullscreen', pathname: '/settings', api, docs: { story: { inline: false, height: '900px' } } },
  decorators: [(Story) => <AppPageShell activePage="settings"><Story /></AppPageShell>],
  async play({ canvasElement }) {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/未設定|Not configured/)).toBeVisible();
    await expect(canvas.getByText('yuki')).toBeVisible();
    await expect(canvas.queryByRole('textbox')).not.toBeInTheDocument();
  },
} satisfies Meta<typeof SettingsPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Mobile: Story = { globals: { viewport: { value: 'mobile', isRotated: false } } };
export const EnglishMobile: Story = { globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } } };
export const Configured: Story = {
  parameters: { api: { ...api, trpc: [trpcQuery('account.searchApiKeyStatus', success({ has_api_key: true }))] } },
  async play({ canvasElement }) {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/設定済み|Configured/)).toBeVisible();
    await expect(canvas.queryByLabelText(/SearchAPIキー|SearchAPI key/)).not.toBeInTheDocument();
  },
};
export const LoadFailed: Story = {
  parameters: { api: { ...api, trpc: [trpcQuery('account.searchApiKeyStatus', failure())] } },
  async play({ canvasElement }) {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/設定状態を取得できませんでした|Unable to load SearchAPI settings/)).toBeVisible();
  },
};
export const EditUsernameMobile: Story = {
  ...Mobile,
  async play({ canvasElement, userEvent }) {
    const canvas = within(canvasElement);
    const edit = await canvas.findByRole('button', { name: /ユーザー名を変更する|Edit username/ });
    await userEvent.click(edit);
    const input = canvas.getByLabelText(/新しいユーザー名|New username/);
    await expect(input).toHaveFocus();
    await userEvent.clear(input);
    await userEvent.type(input, 'yuki_new');
    await expect(canvas.getByRole('button', { name: /ユーザー名を変更$|Change username/ })).toBeEnabled();
    await userEvent.click(within(canvas.getByRole('form')).getByRole('button', { name: /キャンセル|Cancel/ }));
    await expect(edit).toHaveFocus();
    await expect(canvas.queryByRole('form', { name: /ユーザー名|username/ })).not.toBeInTheDocument();
    await userEvent.click(edit);
    await expect(canvas.getByLabelText(/新しいユーザー名|New username/)).toHaveValue('yuki');
  },
};
export const EmailConfirmation: Story = {
  async play({ canvasElement, userEvent }) {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /メールアドレスを変更する|Edit email address/ }));
    const input = canvas.getByLabelText(/新しいメールアドレス|New email address/);
    await userEvent.clear(input);
    await userEvent.type(input, 'new@example.test');
    await userEvent.click(canvas.getByRole('button', { name: /確認メールを送信|Send confirmation email/ }));
    await expect(await canvas.findByText(/確認メールを送信しました|Confirmation email sent/)).toBeVisible();
    await expect(canvas.getByText(regularUser.email)).toBeVisible();
    await expect(canvas.queryByLabelText(/新しいメールアドレス|New email address/)).not.toBeInTheDocument();
  },
};
