import { Link, useI18nNavigate } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { AuthForm } from '@/components/auth/AuthForm';
import { useAuthForm } from '@/hooks/useAuthForm';
import { apiClient } from '@/lib/api';
import { AUTH_FIELDS } from '@/lib/authConfig';
import { PlanCards } from '@/components/pricing/PlanCards';
import { useConfig } from '@/hooks/useConfig';

export default function LoginPage() {
  const navigate = useI18nNavigate();
  const { t } = useTranslation();
  const { config, loading: configLoading } = useConfig();

  const { formData, error, loading, handleChange, handleSubmit } = useAuthForm({
    onSubmit: async (data) => {
      await apiClient.login(data);
    },
    initialData: { username: '', password: '' },
    onSuccessRedirect: () => navigate('/'),
  });

  const fields = [AUTH_FIELDS.USERNAME, AUTH_FIELDS.PASSWORD].map((field) => ({
    ...field,
    label: t(field.labelKey),
    placeholder: t(field.placeholderKey),
  }));

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Header />
      <main className="flex-1">
        <div className="flex items-center justify-center px-4 py-12">
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
        </div>

        {!configLoading && config.billing_enabled && (
          <section className="max-w-5xl mx-auto px-4 pb-16">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {t('billing.pricing.title')}
              </h2>
              <p className="text-gray-600">
                {t('billing.pricing.subtitle')}
              </p>
            </div>
            <PlanCards
              onSelectPlan={() => navigate('/signup')}
            />
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
