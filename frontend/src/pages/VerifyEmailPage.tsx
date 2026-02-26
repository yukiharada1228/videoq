import { Suspense, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useI18nNavigate } from '@/lib/i18n';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { PageLayout } from '@/components/layout/PageLayout';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { MessageAlert } from '@/components/common/MessageAlert';
import { apiClient } from '@/lib/api';

type VerificationState = 'loading' | 'success' | 'error';

function VerifyEmailContent() {
  const navigate = useI18nNavigate();
  const [searchParams] = useSearchParams();
  const uid = searchParams.get('uid');
  const token = searchParams.get('token');
  const isInvalidLink = !uid || !token;
  const { t } = useTranslation();
  const [state, setState] = useState<VerificationState>(() => (isInvalidLink ? 'error' : 'loading'));
  const [message, setMessage] = useState(() => (isInvalidLink ? t('auth.verifyEmail.invalidLink') : t('auth.verifyEmail.loading')));

  const verifyQuery = useQuery<{ detail?: string }>({
    queryKey: ['verifyEmail', uid ?? null, token ?? null],
    enabled: !isInvalidLink,
    retry: false,
    queryFn: async () => await apiClient.verifyEmail({ uid: uid!, token: token! }),
  });

  useEffect(() => {
    if (isInvalidLink) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    if (verifyQuery.isPending) {
      setState('loading');
      setMessage(t('auth.verifyEmail.loading'));
    } else if (verifyQuery.isSuccess) {
      setState('success');
      setMessage(verifyQuery.data?.detail ?? t('auth.verifyEmail.success'));
      timer = setTimeout(() => {
        navigate('/login', { replace: true });
      }, 2000);
    } else if (verifyQuery.isError) {
      setState('error');
      const error = verifyQuery.error;
      if (error instanceof Error) {
        setMessage(error.message);
      } else {
        setMessage(t('auth.verifyEmail.error'));
      }
    }

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [isInvalidLink, navigate, t, verifyQuery.isPending, verifyQuery.isSuccess, verifyQuery.isError, verifyQuery.data, verifyQuery.error]);

  const renderContent = () => {
    if (state === 'loading') {
      return (
        <div className="flex items-center justify-center space-x-3">
          <InlineSpinner />
          <span className="text-sm text-gray-600">{message}</span>
        </div>
      );
    }

    const type = state === 'success' ? 'success' : 'error';

    return (
      <div className="space-y-4">
        <MessageAlert message={message} type={type} />
        {state === 'success' ? (
          <p className="text-center text-sm text-gray-600">
            {t('auth.verifyEmail.redirectPart1')}{' '}
            <Link href="/login" className="text-blue-600 hover:underline">
              {t('auth.verifyEmail.redirectLink')}
            </Link>
          </p>
        ) : (
          <div className="space-y-2 text-sm text-gray-600">
            <p>{t('auth.verifyEmail.retry')}</p>
            <p>
              <Link href="/login" className="text-blue-600 hover:underline">
                {t('auth.verifyEmail.backToLogin')}
              </Link>
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <PageLayout centered>
      <div className="w-full max-w-md space-y-6 rounded-lg bg-white p-8 shadow">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">{t('auth.verifyEmail.title')}</h1>
          <p className="text-sm text-gray-600">
            {t('auth.verifyEmail.description')}
          </p>
        </div>
        {renderContent()}
      </div>
    </PageLayout>
  );
}

function VerifyEmailFallback() {
  return (
    <PageLayout centered>
      <div className="w-full max-w-md space-y-6 rounded-lg bg-white p-8 shadow">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">Email verification</h1>
          <div className="flex items-center justify-center space-x-3">
            <InlineSpinner />
            <span className="text-sm text-gray-600">Checking your email verification...</span>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyEmailFallback />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
