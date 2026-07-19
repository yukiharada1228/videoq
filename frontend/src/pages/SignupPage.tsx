import { useState } from 'react';
import { useI18nNavigate } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { useAuthForm } from '@/hooks/useAuthForm';
import { apiClient } from '@/lib/api';
import { Eye, EyeOff } from 'lucide-react';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { AuthPageIntro } from '@/components/layout/AuthPageIntro';
import { FormField } from '@/components/auth/FormField';
import { ErrorMessage } from '@/components/auth/ErrorMessage';
import { AuthFormFooter } from '@/components/auth/AuthFormFooter';
import { Button } from '@/components/ui/button';
import { Divider } from '@/components/ui/divider';

export default function SignupPage() {
  const navigate = useI18nNavigate();
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const { formData, error, isLoading, handleChange, handleSubmit } = useAuthForm({
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
    onSuccessRedirect: () => navigate('/signup/check-email'),
  });

  return (
    <AuthLayout>
      <AuthPageIntro badge={t('auth.signup.badge')} title={t('auth.signup.title')} />

      {error && <div className="mb-4"><ErrorMessage message={error} /></div>}

      <form onSubmit={handleSubmit} className="space-y-5">
        <FormField
          id="username"
          name="username"
          label={t('auth.fields.username.label')}
          type="text"
          placeholder={t('auth.fields.username.placeholder')}
          value={formData.username || ''}
          onChange={handleChange}
          required
          autoComplete="username"
        />

        <FormField
          id="email"
          name="email"
          label={t('auth.fields.email.label')}
          type="email"
          placeholder={t('auth.fields.email.placeholder')}
          value={formData.email || ''}
          onChange={handleChange}
          required
          autoComplete="email"
        />

        <div className="flex flex-col gap-2">
          <FormField
            id="password"
            name="password"
            label={t('auth.fields.password.label')}
            type={showPassword ? 'text' : 'password'}
            placeholder={t('auth.signup.passwordPlaceholder')}
            value={formData.password || ''}
            onChange={handleChange}
            required
            minLength={8}
            autoComplete="new-password"
          />
          <Button
            type="button"
            variant="text"
            size="xs"
            className="self-start"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? t('auth.fields.password.hide') : t('auth.fields.password.show')}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span className="ml-1">
              {showPassword ? t('auth.fields.password.hide') : t('auth.fields.password.show')}
            </span>
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          <FormField
            id="confirmPassword"
            name="confirmPassword"
            label={t('auth.fields.passwordConfirmation.label')}
            type={showConfirmPassword ? 'text' : 'password'}
            placeholder={t('auth.fields.passwordConfirmation.placeholder')}
            value={formData.confirmPassword || ''}
            onChange={handleChange}
            required
            minLength={8}
            autoComplete="new-password"
          />
          <Button
            type="button"
            variant="text"
            size="xs"
            className="self-start"
            onClick={() => setShowConfirmPassword((prev) => !prev)}
            aria-label={
              showConfirmPassword ? t('auth.fields.password.hide') : t('auth.fields.password.show')
            }
          >
            {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span className="ml-1">
              {showConfirmPassword ? t('auth.fields.password.hide') : t('auth.fields.password.show')}
            </span>
          </Button>
        </div>

        <Button type="submit" variant="solid" size="lg" className="w-full mt-2" disabled={isLoading}>
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <InlineSpinner className="w-4 h-4" />
              {t('auth.signup.submitting')}
            </span>
          ) : (
            t('auth.signup.submit')
          )}
        </Button>
      </form>

      <div className="relative my-10 text-center">
        <Divider />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-4 bg-white text-dns-14N-130 text-solid-gray-420">
          {t('auth.signup.orDivider')}
        </span>
      </div>

      <div className="mt-8 text-center">
        <AuthFormFooter
          questionText={t('auth.signup.footerQuestion')}
          linkText={t('auth.signup.footerLink')}
          href="/login"
        />
      </div>
    </AuthLayout>
  );
}
