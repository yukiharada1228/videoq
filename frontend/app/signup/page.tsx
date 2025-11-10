'use client';

import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/layout/PageLayout';
import { AuthForm } from '@/components/auth/AuthForm';
import { useAuthForm } from '@/hooks/useAuthForm';
import { apiClient } from '@/lib/api';
import { AUTH_FIELDS } from '@/lib/authConfig';

export default function SignupPage() {
  const router = useRouter();
  const { t } = useTranslation();

  const { formData, error, loading, handleChange, handleSubmit } = useAuthForm({
    onSubmit: async (data: { username: string; email: string; password: string; confirmPassword: string }) => {
      if (data.password !== data.confirmPassword) {
        throw new Error(t('auth.signup.passwordMismatch'));
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

  const fields = [
    AUTH_FIELDS.EMAIL,
    AUTH_FIELDS.USERNAME,
    AUTH_FIELDS.PASSWORD_WITH_MIN_LENGTH,
    AUTH_FIELDS.CONFIRM_PASSWORD,
  ].map((field) => ({
    ...field,
    label: t(field.labelKey),
    placeholder: t(field.placeholderKey),
  }));

  return (
    <PageLayout centered>
      <AuthForm
        title={t('auth.signup.title')}
        description={t('auth.signup.description')}
        fields={fields}
        formData={formData}
        error={error}
        loading={loading}
        submitButtonText={t('auth.signup.submit')}
        loadingButtonText={t('auth.signup.submitting')}
        onChange={handleChange}
        onSubmit={handleSubmit}
        footer={{
          questionText: t('auth.signup.footerQuestion'),
          linkText: t('auth.signup.footerLink'),
          href: '/login',
        }}
      />
    </PageLayout>
  );
}
