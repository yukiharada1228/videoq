import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { authFixtures } from '../../.storybook/fixtures/auth';
import EmailChangeConfirmPage from './EmailChangeConfirmPage';

const meta = {
  title: 'Pages/EmailChangeConfirmPage',
  component: EmailChangeConfirmPage,
  parameters: {
    pathname: '/change-email?step=verify-new',
    api: { auth: authFixtures.loggedOut },
  },
} satisfies Meta<typeof EmailChangeConfirmPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AwaitingNewAddress: Story = {
  async play({ canvasElement }) {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('alert')).toHaveTextContent(/新しいメールアドレスに届いた確認リンク|verification link sent to your new address/);
    await expect(canvas.queryByText(/メールアドレスを更新しました|Your email address has been updated/)).not.toBeInTheDocument();
  },
};

export const AwaitingNewAddressEnglishMobile: Story = {
  ...AwaitingNewAddress,
  globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};

export const Completed: Story = {
  parameters: { pathname: '/change-email' },
  async play({ canvasElement }) {
    await expect(await within(canvasElement).findByRole('alert')).toHaveTextContent(/メールアドレスを更新しました|Your email address has been updated/);
  },
};

export const InvalidApproval: Story = {
  parameters: { pathname: '/change-email?step=verify-new&error=INVALID_TOKEN' },
  async play({ canvasElement }) {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('alert')).toHaveTextContent(/メールアドレス変更に失敗しました|Email change failed/);
    await expect(canvas.queryByText(/新しいメールアドレスに届いた確認リンク|verification link sent to your new address/)).not.toBeInTheDocument();
  },
};
