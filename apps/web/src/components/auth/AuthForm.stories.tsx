import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ComponentProps } from 'react';
import { expect, fn } from 'storybook/test';
import { AuthForm } from './AuthForm';

function AuthFormExample(args: ComponentProps<typeof AuthForm>) {
  const [formData, setFormData] = useState(args.formData);
  return (
    <AuthForm
      {...args}
      formData={formData}
      onChange={(event) => {
        const { name, value } = event.target;
        args.onChange(event);
        setFormData((current) => ({ ...current, [name]: value }));
      }}
      onSubmit={(event) => { event.preventDefault(); args.onSubmit(event); }}
    />
  );
}

const meta = {
  title: 'Auth/AuthForm',
  component: AuthForm,
  parameters: {
    pathname: '/login',
    docs: { description: { component: 'AuthFormの項目構成のサンプルです。入力はローカルの状態に反映し、送信はActionsに記録します。ログインやアカウント作成の通信は行いません。' } },
  },
  args: {
    title: 'ログイン',
    description: 'アカウントにログインして、動画での学習を続けましょう。',
    fields: [
      { id: 'login-username', name: 'username', label: 'ユーザー名', type: 'text' },
      { id: 'login-password', name: 'password', label: 'パスワード', type: 'password', minLength: 8 },
    ],
    formData: { username: '', password: '' },
    error: null,
    isLoading: false,
    submitButtonText: 'ログイン',
    loadingButtonText: 'ログイン中…',
    onChange: fn(),
    onSubmit: fn(),
    footer: { questionText: 'アカウントをお持ちでない方は', linkText: '新規登録', href: '/signup' },
  },
  render: (args) => <AuthFormExample key={JSON.stringify([args.fields, args.formData])} {...args} />,
} satisfies Meta<typeof AuthForm>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Login: Story = {};
export const Registration: Story = {
  parameters: { pathname: '/signup' },
  args: {
    title: 'アカウント作成',
    description: 'ユーザー名、メールアドレス、パスワードを入力してください。',
    fields: [
      { id: 'signup-username', name: 'username', label: 'ユーザー名', type: 'text', minLength: 3 },
      { id: 'signup-email', name: 'email', label: 'メールアドレス', type: 'email' },
      { id: 'signup-password', name: 'password', label: 'パスワード', type: 'password', minLength: 8 },
    ],
    formData: { username: '', email: '', password: '' },
    submitButtonText: 'アカウントを作成',
    loadingButtonText: '作成中…',
    footer: { questionText: 'すでにアカウントをお持ちの方は', linkText: 'ログイン', href: '/login' },
  },
};
export const Filled: Story = { args: { formData: { username: 'videoq_user', password: 'storybook-example' } } };
export const Submitting: Story = {
  args: { ...Filled.args, isLoading: true },
  parameters: { docs: { description: { story: '送信中は送信ボタンが無効になります。入力欄は現在のAuthFormの仕様どおり編集できます。' } } },
  play: async ({ canvas, userEvent, args }) => {
    const submit = canvas.getByRole('button', { name: args.loadingButtonText });
    await expect(submit).toBeDisabled();
    await userEvent.click(canvas.getByLabelText(/パスワード/));
    await userEvent.keyboard('{Enter}');
    await expect(args.onSubmit).not.toHaveBeenCalled();
    await userEvent.tab();
    await expect(canvas.getByRole('link', { name: args.footer!.linkText })).toHaveFocus();
  },
};
export const LoginError: Story = {
  args: { ...Filled.args, error: 'ユーザー名またはパスワードが正しくありません。入力内容を確認してください。' },
};
export const WithoutFooter: Story = { args: { footer: undefined } };
export const LongContent: Story = {
  args: {
    ...Registration.args,
    description: '学習を開始するにはアカウントを作成してください。登録したメールアドレスに確認用のメールを送信します。メールが届かない場合は迷惑メールフォルダも確認してください。',
    error: 'このメールアドレスはすでに登録されています。ログインするか、パスワードを忘れた場合は再設定の手続きを行ってください。',
  },
  globals: { viewport: { value: 'mobile', isRotated: false } },
};
export const KeyboardSubmit: Story = {
  play: async ({ canvas, userEvent, args }) => {
    const username = canvas.getByLabelText(/ユーザー名/);
    const password = canvas.getByLabelText(/パスワード/);
    await userEvent.click(username);
    await userEvent.keyboard('videoq_user');
    await userEvent.tab();
    await expect(password).toHaveFocus();
    await userEvent.keyboard('storybook-example');
    await userEvent.tab();
    await expect(canvas.getByRole('button', { name: args.submitButtonText })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onSubmit).toHaveBeenCalledTimes(1);
    await expect(username).toHaveValue('videoq_user');
    await expect(password).toHaveValue('storybook-example');
  },
};
export const EnglishMobile: Story = {
  args: {
    title: 'Log in',
    description: 'Log in to your account to continue learning with videos.',
    fields: [
      { id: 'login-username', name: 'username', label: 'Username', type: 'text' },
      { id: 'login-password', name: 'password', label: 'Password', type: 'password', minLength: 8 },
    ],
    submitButtonText: 'Log in',
    loadingButtonText: 'Logging in…',
    footer: { questionText: "Don't have an account?", linkText: 'Sign up', href: '/signup' },
  },
  globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    const link = canvas.getByRole('link', { name: 'Sign up' });
    await expect(link).toHaveAttribute('href', '/en/signup');
    await userEvent.click(canvas.getByLabelText(/Password/));
    await userEvent.tab();
    await userEvent.tab();
    await expect(link).toHaveFocus();
    await expect(canvas.getByRole('heading', { name: 'Log in' })).toBeVisible();
  },
};
