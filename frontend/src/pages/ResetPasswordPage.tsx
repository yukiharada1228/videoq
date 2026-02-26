import { Suspense, useState } from 'react';
import { Link } from '@/lib/i18n';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/layout/PageLayout';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MessageAlert } from '@/components/common/MessageAlert';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useConfirmPasswordResetMutation } from '@/hooks/usePasswordRecovery';

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
      await resetPasswordMutation.mutateAsync({
        uid,
        token,
        newPassword: password,
      });
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
    <PageLayout centered>
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>{t('auth.resetPassword.title')}</CardTitle>
            <CardDescription>{t('auth.resetPassword.description')}</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {clientError && <MessageAlert message={clientError} type="error" />}
              {error && <MessageAlert message={error} type="error" />}
              {success && (
                <MessageAlert
                  message={t('auth.resetPassword.success')}
                  type="success"
                />
              )}
              <div className="space-y-2">
                <Label htmlFor="password">{t('auth.resetPassword.newPassword')}</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('auth.resetPassword.newPasswordPlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t('auth.resetPassword.confirmPassword')}</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('auth.resetPassword.confirmPasswordPlaceholder')}
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4 pt-4">
              <Button type="submit" className="w-full" disabled={resetPasswordMutation.isPending}>
                {resetPasswordMutation.isPending ? t('auth.resetPassword.submitting') : t('auth.resetPassword.submit')}
              </Button>
              <Link href="/login" className="text-center text-sm text-blue-600 hover:underline">
                {t('auth.resetPassword.backToLogin')}
              </Link>
            </CardFooter>
          </form>
        </Card>
      </div>
    </PageLayout>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <PageLayout centered>
          <LoadingSpinner />
        </PageLayout>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
