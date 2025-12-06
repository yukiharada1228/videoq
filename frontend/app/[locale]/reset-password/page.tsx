 'use client';
 
 import { Suspense, useState } from 'react';
 import { Link } from '@/i18n/routing';
 import { useSearchParams } from 'next/navigation';
 import { useTranslations } from 'next-intl';
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
 import { apiClient } from '@/lib/api';
 import { useAsyncState } from '@/hooks/useAsyncState';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const uid = searchParams.get('uid') ?? '';
  const token = searchParams.get('token') ?? '';
  const t = useTranslations();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { isLoading, error, execute, setError } = useAsyncState<void>({
    onSuccess: () => {
      setSuccess(true);
      setPassword('');
      setConfirmPassword('');
    },
  });

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
      await execute(() =>
        apiClient.confirmPasswordReset({
          uid,
          token,
          new_password: password,
        })
      );
    } catch {
      // useAsyncState manages error display
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
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? t('auth.resetPassword.submitting') : t('auth.resetPassword.submit')}
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

