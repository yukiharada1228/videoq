'use client';

import { Link } from '@/i18n/routing';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { PageLayout } from '@/components/layout/PageLayout';
import { AuthForm } from '@/components/auth/AuthForm';
import { useAuthForm } from '@/hooks/useAuthForm';
import { apiClient } from '@/lib/api';
import { AUTH_FIELDS } from '@/lib/authConfig';

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations();

  const { formData, error, loading, handleChange, handleSubmit } = useAuthForm({
    onSubmit: async (data) => {
      await apiClient.login(data);
    },
    initialData: { username: '', password: '' },
    onSuccessRedirect: () => router.push('/'),
  });

  const fields = [AUTH_FIELDS.USERNAME, AUTH_FIELDS.PASSWORD].map((field) => ({
    ...field,
    label: t(field.labelKey),
    placeholder: t(field.placeholderKey),
  }));

  return (
    <PageLayout centered>
      <div className="w-full max-w-md space-y-4">
      <AuthForm
        title={t('auth.login.title')}
        description={t('auth.login.description')}
        fields={fields}
        formData={formData}
        error={error}
        loading={loading}
        submitButtonText={t('auth.login.submit')}
        loadingButtonText={t('auth.login.submitting')}
        onChange={handleChange}
        onSubmit={handleSubmit}
        footer={{
          questionText: t('auth.login.footerQuestion'),
          linkText: t('auth.login.footerLink'),
          href: '/signup',
        }}
      />
        <div className="text-center text-sm">
          <Link href="/forgot-password" className="text-blue-600 hover:underline">
            {t('auth.login.forgotPassword')}
          </Link>
        </div>
      </div>
    </PageLayout>
  );
}
