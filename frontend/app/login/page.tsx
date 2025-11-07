'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageLayout } from '@/components/layout/PageLayout';
import { AuthForm } from '@/components/auth/AuthForm';
import { useAuthForm } from '@/hooks/useAuthForm';
import { apiClient } from '@/lib/api';
import { AUTH_FIELDS } from '@/lib/authConfig';

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
      <div className="w-full max-w-md space-y-4">
      <AuthForm
        title="ログイン"
        description="アカウントにログインしてサービスをご利用ください"
        fields={[AUTH_FIELDS.USERNAME, AUTH_FIELDS.PASSWORD]}
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
        <div className="text-center text-sm">
          <Link href="/forgot-password" className="text-blue-600 hover:underline">
            パスワードをお忘れですか？
          </Link>
        </div>
      </div>
    </PageLayout>
  );
}
