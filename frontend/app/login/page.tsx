'use client';

import { useRouter } from 'next/navigation';
import { PageLayout } from '@/components/layout/PageLayout';
import { AuthForm } from '@/components/auth/AuthForm';
import { useAuthForm } from '@/hooks/useAuthForm';
import { apiClient } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();

  const { formData, error, loading, handleChange, handleSubmit } = useAuthForm({
    onSubmit: async (data) => {
      await apiClient.login(data);
    },
    initialData: { username: '', password: '' },
    onSuccessRedirect: () => router.push('/'),
  });

  return (
    <PageLayout centered>
      <AuthForm
        title="ログイン"
        description="アカウントにログインしてサービスをご利用ください"
        fields={[
          {
            id: 'username',
            name: 'username',
            label: 'ユーザー名',
            type: 'text',
            placeholder: 'ユーザー名を入力',
          },
          {
            id: 'password',
            name: 'password',
            label: 'パスワード',
            type: 'password',
            placeholder: 'パスワードを入力',
          },
        ]}
        formData={formData}
        error={error}
        loading={loading}
        submitButtonText="ログイン"
        loadingButtonText="ログイン中..."
        onChange={handleChange}
        onSubmit={handleSubmit}
        footer={{
          questionText: 'アカウントをお持ちでない方は',
          linkText: 'こちらから登録',
          href: '/signup',
        }}
      />
    </PageLayout>
  );
}
