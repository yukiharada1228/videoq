import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link, useI18nNavigate } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { useAuthForm } from '@/hooks/useAuthForm';
import { apiClient } from '@/lib/api';
import { Eye, EyeOff } from 'lucide-react';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { AuthPageIntro } from '@/components/layout/AuthPageIntro';
import { FormField } from '@/components/auth/FormField';
import { ErrorMessage } from '@/components/auth/ErrorMessage';
import { AuthFormFooter } from '@/components/auth/AuthFormFooter';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { Button } from '@/components/ui/button';
import { Divider } from '@/components/ui/divider';
import { UtilityLink } from '@/components/ui/utility-link';
import { oauthAuthorizeResumeUrl } from '@/lib/oauthResume';
import { getSafeNextPath } from '@/lib/authRedirect';

export default function LoginPage() {
  const navigate = useI18nNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const nextPath = getSafeNextPath(searchParams.get('next'));
  const oauthResume = oauthAuthorizeResumeUrl(searchParams);
  const afterLogin = oauthResume || nextPath;
  const oauthError = searchParams.get('error');
  const [showPassword, setShowPassword] = useState(false);

  const { formData, error, isLoading, handleChange, handleSubmit } = useAuthForm({
    onSubmit: async (data) => {
      await apiClient.login(data);
      // Refresh the session atom. AuthProvider clears the previous account's
      // cache before the destination page loads its own profile and data.
      const { authClient } = await import('@/lib/auth-client');
      await authClient.getSession();
    },
    initialData: { username: '', password: '' },
    onSuccessRedirect: () => {
      if (afterLogin) {
        // OAuth authorize pages are served by the API, outside the SPA router.
        window.location.href = afterLogin;
        return;
      }
      navigate('/');
    },
  });

  return (
    <>
      <AuthPageIntro badge={t('auth.login.badge')} title={t('auth.login.title')} />

      {(error || oauthError) && (
        <div className="mb-4">
          <ErrorMessage message={error || t('auth.login.oauthCallbackFailed')} />
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <FormField
          id="username"
          name="username"
          label={t('auth.fields.username.label')}
          type="text"
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

      <GoogleSignInButton callbackURL={afterLogin || '/'} />

      <div className="mt-8 text-center">
        <AuthFormFooter
          questionText={t('auth.login.footerQuestion')}
          linkText={t('auth.login.footerLink')}
          href={nextPath ? `/signup?next=${encodeURIComponent(nextPath)}` : '/signup'}
        />
      </div>
    </>
  );
}
