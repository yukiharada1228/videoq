import { Suspense, useState } from 'react';
import { Link } from '@/lib/i18n';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { AuthPageIntro } from '@/components/layout/AuthPageIntro';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useConfirmPasswordResetMutation } from '@/hooks/usePasswordRecovery';
import { FormField } from '@/components/auth/FormField';
import { ErrorMessage } from '@/components/auth/ErrorMessage';
import { MessageAlert } from '@/components/common/MessageAlert';
import { Button } from '@/components/ui/button';
import { UtilityLink } from '@/components/ui/utility-link';

function ResetPasswordContent() {
  const [searchParams] = useSearchParams();
  const uid = searchParams.get('uid') ?? '';
  const token = searchParams.get('token') ?? '';
  const { t } = useTranslation();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetPasswordMutation = useConfirmPasswordResetMutation();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setClientError(null);
    setError(null);

    if (!uid || !token) {
      setClientError(t('auth.resetPassword.invalidLink'));
      return;
    }

    if (password !== confirmPassword) {
      setClientError(t('auth.resetPassword.passwordMismatch'));
      return;
    }

    try {
      await resetPasswordMutation.mutateAsync({ uid, token, newPassword: password });
      setSuccess(true);
      setPassword('');
      setConfirmPassword('');
    } catch {
      setError(
        resetPasswordMutation.error instanceof Error
          ? resetPasswordMutation.error.message
          : resetPasswordMutation.error
            ? String(resetPasswordMutation.error)
            : null,
      );
    }
  };

  return (
    <AuthLayout>
      <UtilityLink asChild className="mb-12 inline-flex items-center">
        <Link href="/login">
          <ArrowLeft className="mr-2 w-4 h-4" />
          {t('auth.resetPassword.backToLogin')}
        </Link>
      </UtilityLink>

      <div className="space-y-6">
        <AuthPageIntro
          badge={t('auth.resetPassword.badge')}
          title={t('auth.resetPassword.title')}
          description={t('auth.resetPassword.description')}
        />

        {(clientError || error) && <ErrorMessage message={clientError ?? error} />}
        {success && <MessageAlert type="success" message={t('auth.resetPassword.success')} />}

        <form onSubmit={handleSubmit} className="space-y-5">
          <FormField
            id="password"
            name="password"
            label={t('auth.resetPassword.newPassword')}
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('auth.resetPassword.newPasswordPlaceholder')}
            autoComplete="new-password"
          />

          <FormField
            id="confirmPassword"
            name="confirmPassword"
            label={t('auth.resetPassword.confirmPassword')}
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t('auth.resetPassword.confirmPasswordPlaceholder')}
            autoComplete="new-password"
          />

          <Button
            type="submit"
            variant="solid"
            size="lg"
            className="w-full"
            disabled={resetPasswordMutation.isPending}
          >
            {resetPasswordMutation.isPending ? (
              <>
                <InlineSpinner className="w-4 h-4" />
                {t('auth.resetPassword.submitting')}
              </>
            ) : (
              t('auth.resetPassword.submit')
            )}
          </Button>
        </form>

        {success && (
          <div className="text-center">
            <UtilityLink asChild>
              <Link href="/login">{t('auth.resetPassword.backToLogin')}</Link>
            </UtilityLink>
          </div>
        )}
      </div>

    </AuthLayout>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <AuthLayout>
        <div className="flex items-center justify-center h-full">
          <LoadingSpinner />
        </div>
      </AuthLayout>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
