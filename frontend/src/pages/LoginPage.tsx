import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useI18nNavigate } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { useAuthForm } from '@/hooks/useAuthForm';
import { apiClient } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { Eye, EyeOff } from 'lucide-react';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { AuthPageIntro } from '@/components/layout/AuthPageIntro';
import { FormField } from '@/components/auth/FormField';
import { ErrorMessage } from '@/components/auth/ErrorMessage';
import { AuthFormFooter } from '@/components/auth/AuthFormFooter';
import { Button } from '@/components/ui/button';
import { Divider } from '@/components/ui/divider';
import { UtilityLink } from '@/components/ui/utility-link';

// Only allow same-origin absolute paths to prevent open redirects to attacker
// origins (e.g. ?next=//evil.com or ?next=https://evil.com).
function getSafeNextPath(next: string | null): string | null {
  if (!next) return null;
  if (!next.startsWith('/')) return null;
  if (next.startsWith('//') || next.startsWith('/\\')) return null;
  return next;
}

export default function LoginPage() {
  const navigate = useI18nNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const nextPath = getSafeNextPath(searchParams.get('next'));
  const [showPassword, setShowPassword] = useState(false);

  const { formData, error, isLoading, handleChange, handleSubmit } = useAuthForm({
    onSubmit: async (data) => {
      await apiClient.login(data);
      await queryClient.fetchQuery({
        queryKey: queryKeys.auth.me,
        queryFn: async () => await apiClient.getMe(),
        retry: false,
      });
    },
    initialData: { username: '', password: '' },
    onSuccessRedirect: () => {
      if (nextPath) {
        // Full-page navigation: `next` typically points at the Django
        // OAuth authorize endpoint (/api/oauth/authorize/...) which the
        // SPA router cannot serve.
        window.location.href = nextPath;
        return;
      }
      navigate('/');
    },
  });

  return (
    <AuthLayout>
      <AuthPageIntro badge={t('auth.login.badge')} title={t('auth.login.title')} />

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

        <div className="flex flex-col gap-2">
          <FormField
            id="password"
            name="password"
            label={t('auth.fields.password.label')}
            type={showPassword ? 'text' : 'password'}
            placeholder={t('auth.fields.password.placeholder')}
            value={formData.password || ''}
            onChange={handleChange}
            required
            autoComplete="current-password"
            showRequirementBadge
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

        <div className="flex justify-end py-1">
          <UtilityLink asChild>
            <Link href="/forgot-password">{t('auth.login.forgotPassword')}</Link>
          </UtilityLink>
        </div>

        <Button type="submit" variant="solid" size="lg" className="w-full" disabled={isLoading}>
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <InlineSpinner className="w-4 h-4" />
              {t('auth.login.submitting')}
            </span>
          ) : (
            t('auth.login.submit')
          )}
        </Button>
      </form>

      <div className="relative my-10 text-center">
        <Divider />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-4 bg-white text-dns-14N-130 text-solid-gray-420">
          {t('auth.login.orDivider')}
        </span>
      </div>

      <div className="mt-8 text-center">
        <AuthFormFooter
          questionText={t('auth.login.footerQuestion')}
          linkText={t('auth.login.footerLink')}
          href="/signup"
        />
      </div>
    </AuthLayout>
  );
}
