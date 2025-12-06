'use client';

import { useState } from 'react';
import { Link } from '@/i18n/routing';
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
import { apiClient } from '@/lib/api';
import { useAsyncState } from '@/hooks/useAsyncState';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [success, setSuccess] = useState(false);
  const t = useTranslations();
  const { isLoading, error, execute, setError } = useAsyncState<void>({
    onSuccess: () => setSuccess(true),
  });

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccess(false);
    setError(null);

    try {
      await execute(() => apiClient.requestPasswordReset({ email })      );
    } catch {
      // useAsyncState manages error display
    }
  };

  return (
    <PageLayout centered>
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>{t('auth.forgotPassword.title')}</CardTitle>
            <CardDescription>
              {t('auth.forgotPassword.description')}
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && <MessageAlert message={error} type="error" />}
              {success && (
                <MessageAlert
                  message={t('auth.forgotPassword.success')}
                  type="success"
                />
              )}
              <div className="space-y-2">
                <Label htmlFor="email">{t('auth.fields.email.label')}</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.fields.email.placeholder')}
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4 pt-4">
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? t('auth.forgotPassword.submitting') : t('auth.forgotPassword.submit')}
              </Button>
              <Link href="/login" className="text-center text-sm text-blue-600 hover:underline">
                {t('auth.forgotPassword.backToLogin')}
              </Link>
            </CardFooter>
          </form>
        </Card>
      </div>
    </PageLayout>
  );
}

