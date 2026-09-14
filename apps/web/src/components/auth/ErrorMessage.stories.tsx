import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { ErrorMessage } from './ErrorMessage';

const meta = {
  title: 'Auth/ErrorMessage',
  component: ErrorMessage,
  parameters: { a11y: { test: 'error' } },
  args: { message: 'ユーザー名またはパスワードが正しくありません。' },
  decorators: [(Story) => <div className="max-w-xl"><Story /></div>],
} satisfies Meta<typeof ErrorMessage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithTitle: Story = {
  args: { title: 'ログインできませんでした', message: '入力内容を確認して、もう一度お試しください。' },
};
export const LongMessage: Story = {
  args: {
    title: 'メールアドレスの確認が必要です',
    message: '登録したメールアドレス宛に確認用のメールを送信しました。メールに記載されたリンクを開いてください。見つからない場合は迷惑メールフォルダを確認し、しばらく待ってからもう一度お試しください。',
  },
  globals: { viewport: { value: 'mobile', isRotated: false } },
};
export const NoError: Story = {
  args: { message: null },
  parameters: { docs: { description: { story: 'エラーがない場合は何も描画しません。Controlsでmessageを入力すると表示されます。' } } },
  play: async ({ canvas }) => { await expect(canvas.queryByRole('alert')).not.toBeInTheDocument(); },
};
export const EnglishMobile: Story = {
  args: { title: 'Unable to log in', message: 'Your username or password is incorrect. Check your details and try again.' },
  globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
};
