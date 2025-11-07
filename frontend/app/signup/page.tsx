'use client';

import { useRouter } from 'next/navigation';
import { PageLayout } from '@/components/layout/PageLayout';
import { AuthForm } from '@/components/auth/AuthForm';
import { useAuthForm } from '@/hooks/useAuthForm';
import { apiClient } from '@/lib/api';
import { AUTH_FIELDS } from '@/lib/authConfig';

export default function SignupPage() {
  const router = useRouter();

  const { formData, error, loading, handleChange, handleSubmit } = useAuthForm({
    onSubmit: async (data: { username: string; email: string; password: string; confirmPassword: string }) => {
      if (data.password !== data.confirmPassword) {
        throw new Error('パスワードが一致しません');
      }
      await apiClient.signup({
        username: data.username,
        email: data.email,
        password: data.password,
      });
    },
    initialData: { username: '', email: '', password: '', confirmPassword: '' },
    onSuccessRedirect: () => router.push('/signup/check-email'),
  });

  return (
    <PageLayout centered>
      <AuthForm
        title="新規登録"
        description="新しいアカウントを作成してサービスをご利用ください"
        fields={[
          AUTH_FIELDS.EMAIL,
          AUTH_FIELDS.USERNAME,
          AUTH_FIELDS.PASSWORD_WITH_MIN_LENGTH,
          AUTH_FIELDS.CONFIRM_PASSWORD,
        ]}
        formData={formData}
        error={error}
        loading={loading}
        submitButtonText="新規登録"
        loadingButtonText="登録中..."
        onChange={handleChange}
        onSubmit={handleSubmit}
        footer={{
          questionText: 'すでにアカウントをお持ちの方は',
          linkText: 'こちらからログイン',
          href: '/login',
        }}
      />
    </PageLayout>
  );
}
